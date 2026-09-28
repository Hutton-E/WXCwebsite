export interface AthleteRaceRecord {
  event: string;
  season_type: string | null;
  meet_date: string | null;
  mark: string;
  status?: string | null;
  meet_name?: string | null;
  placing?: string | null;
  result_url?: string | null;
}

export interface AthleteRosterInfo {
  tfrrsId: string;
  team: string;
  raceHistory: readonly AthleteRaceRecord[];
}

export interface AthleteAttributeValues {
  crossCountry: number | null;
  indoor: number | null;
  outdoor: number | null;
  indoorConsistency: number | null;
  outdoorConsistency: number | null;
  speed: number | null;
  endurance: number | null;
  winFactor: number | null;
}

export interface AllAmericanAppearance {
  year: number;
  meetName: string | null;
  placing: string | null;
}

export interface CrossCountryDistanceRecord {
  distance: string;
  recordSeconds: number;
  recordHolderTfrrsId: string;
  athleteSeconds: number;
  deficitSeconds: number;
  score: number;
}

export interface CrossCountryRecordRating {
  score: number | null;
  deficitSeconds: number | null;
  bestDistance: string | null;
  athleteSeconds: number | null;
  recordSeconds: number | null;
  recordHolderTfrrsId: string | null;
  isRecordHolder: boolean;
  allAmericanCount: number;
  allAmericanAppearances: AllAmericanAppearance[];
  distances: CrossCountryDistanceRecord[];
}

export interface IndoorEventRating {
  event: string;
  attempts: number;
  recordSeconds: number;
  recordHolderTfrrsId: string;
  athleteSeconds: number;
  deficitSeconds: number;
  secondsPerTenPoints: number;
  score: number;
  weight: number;
}

export interface IndoorRecordRating {
  score: number | null;
  events: IndoorEventRating[];
  allAmericanCount: number;
  allAmericanAppearances: AllAmericanAppearance[];
}

// Outdoor track uses the same rating shape as indoor track (see
// calculateTrackRecordRating below) — just a different set of rated events
// and championship meet pattern.
export type OutdoorEventRating = IndoorEventRating;
export type OutdoorRecordRating = IndoorRecordRating;

// Individual placing at or above this rank at a national XC championship
// counts as an All-American appearance (NCAA Division III convention).
// Regional meets (used to qualify for nationals) must be excluded, since a
// top-40 regional finish is not itself All-American status.
const ALL_AMERICAN_PLACING_THRESHOLD = 40;
const ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*cross\s*country[^|]*championships?/i;
const REGIONAL_MEET_PATTERN = /\bregion\b/i;

// NCAA Division III indoor and outdoor track national championship top-8
// finishers earn first-team All-American status; places 9-16 earn
// second-team All-American status. Both seasons share this convention.
const TRACK_ALL_AMERICAN_PLACING_THRESHOLD = 16;
const TRACK_FIRST_TEAM_ALL_AMERICAN_PLACING_THRESHOLD = 8;
const INDOOR_ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*indoor[^|]*(?:track|championships?)/i;
const OUTDOOR_ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*outdoor[^|]*(?:track|championships?)/i;

// A deficit of this many seconds behind the cross country school record
// (the team's primary distance) costs 10 rating points. Shorter events use
// a proportionally smaller threshold — see secondsPerTenPointsFor below —
// so a 45-second gap doesn't mean the same thing on an 800m as an 8k.
const XC_RATING_ANCHOR_SECONDS = 45;
const RATING_POINTS_LOST_PER_SECOND_BEHIND_RECORD = 10 / XC_RATING_ANCHOR_SECONDS;

// The standard NCAA Division III championship distance per team, used as
// "the" cross country event distance for school-record comparisons — not
// whichever shorter tune-up distance happens to score best. Also serves as
// the anchor event for scaling other events' rating thresholds.
const PRIMARY_CROSS_COUNTRY_DISTANCE_BY_TEAM: Record<string, string> = {
  "mens-cross-country": "8k",
  "womens-cross-country": "6k",
};

// Indoor events rated by proximity to the school record. An athlete must
// have raced an event at least this many times for it to count at all.
const INDOOR_RATED_EVENTS = new Set(["800", "1000", "mile", "3000", "5000"]);
// Outdoor events rated the same way: 800m, 1500m, 3000m steeplechase, 5000m,
// and 10,000m. A bare "3000" (no steeplechase) is an indoor-only tune-up
// distance and intentionally excluded here.
const OUTDOOR_RATED_EVENTS = new Set(["800", "1500", "3000s", "5000", "10000"]);
const MIN_ATTEMPTS_FOR_TRACK_EVENT = 2;
const TIME_CONSISTENCY_WEIGHT = 0.4;
const PR_CLOSENESS_WEIGHT = 0.6;
const CONSISTENCY_PENALTY_PER_PERCENT_VARIATION = 10;
// A race run this many percent slower than the athlete's PR in that same
// event loses 10 points of PR-closeness credit — a percentage (rather than
// a flat number of seconds) so the penalty scales fairly whether the event
// is a short 800m or a long 5000m. Running the actual PR itself scores a
// perfect 100 since its gap to the record is zero.
const PR_CLOSENESS_PENALTY_PER_PERCENT_OFF = 10;

// Squares each event's attempt count so an event raced many times heavily
// outweighs one raced only the minimum required two times.
function trackEventWeight(attempts: number): number {
  return attempts * attempts;
}

function normalizeConsistencyEvent(event: string): string {
  const normalized = normalizeEvent(event);
  return normalized === "1 mile" ? "mile" : normalized;
}

/**
 * Rates how consistently an athlete runs close to their own personal best
 * in each event they've raced at least twice in a season type (indoor or
 * outdoor). Results are read in chronological order per event: the first
 * time in an event has no prior PR to compare to, so it counts as a full
 * mark automatically. Every race after that is scored against the
 * athlete's standing PR (their best time up to but not including that
 * race) — a new PR always scores a perfect 100 since its gap is zero, and
 * a race that misses the standing PR is scored down by how far off it was,
 * as a percentage of the PR time so short and long events are penalized
 * fairly. Event scores are also penalized by raw time-to-time variability
 * (coefficient of variation), so wildly inconsistent performances (even if
 * a PR was eventually set) still cost points. PR-closeness carries 60% of
 * the final weight; raw consistency carries the remaining 40%.
 */
function calculateTrackConsistencyRating(
  athlete: AthleteRosterInfo,
  seasonType: "indoor" | "outdoor",
): number | null {
  const resultsByEvent = new Map<
    string,
    { seconds: number; meetDate: string | null; index: number }[]
  >();

  athlete.raceHistory.forEach((race, index) => {
    if (race.season_type?.trim().toLowerCase() !== seasonType) return;
    if (isRelayEvent(race.event)) return;
    if (race.status && race.status !== "FINISHED") return;

    const event = normalizeConsistencyEvent(race.event);
    const seconds = parseMarkSeconds(race.mark);
    if (!event || seconds === null) return;

    const results = resultsByEvent.get(event) ?? [];
    results.push({ seconds, meetDate: race.meet_date, index });
    resultsByEvent.set(event, results);
  });

  let totalWeight = 0;
  let weightedConsistency = 0;
  let totalPrCloseWeight = 0;
  let weightedPrCloseness = 0;

  for (const results of resultsByEvent.values()) {
    if (results.length < 2) continue;

    const mean =
      results.reduce((sum, result) => sum + result.seconds, 0) /
      results.length;
    const standardDeviation = Math.sqrt(
      results.reduce(
        (sum, result) => sum + (result.seconds - mean) ** 2,
        0,
      ) / results.length,
    );
    const coefficientOfVariation = standardDeviation / mean;
    const consistencyScore = Math.max(
      0,
      100 -
        coefficientOfVariation * 100 * CONSISTENCY_PENALTY_PER_PERCENT_VARIATION,
    );
    const eventWeight = results.length;
    totalWeight += eventWeight;
    weightedConsistency += consistencyScore * eventWeight;

    const datedResults = results
      .filter(
        (result) => result.meetDate && !Number.isNaN(Date.parse(result.meetDate)),
      )
      .sort(
        (first, second) =>
          (first.meetDate ?? "").localeCompare(second.meetDate ?? "") ||
          first.index - second.index,
      );

    let standingPersonalBest = Infinity;
    for (const result of datedResults) {
      const percentOffStandingBest =
        standingPersonalBest === Infinity
          ? 0
          : (result.seconds - standingPersonalBest) / standingPersonalBest;
      totalPrCloseWeight += 1;
      weightedPrCloseness += Math.min(
        100,
        Math.max(
          0,
          100 -
            percentOffStandingBest * 100 * PR_CLOSENESS_PENALTY_PER_PERCENT_OFF,
        ),
      );
      standingPersonalBest = Math.min(standingPersonalBest, result.seconds);
    }
  }

  if (totalWeight === 0) return null;

  const consistencyScore = weightedConsistency / totalWeight;
  if (totalPrCloseWeight === 0) return round(consistencyScore);

  const prClosenessScore = weightedPrCloseness / totalPrCloseWeight;
  return round(
    consistencyScore * TIME_CONSISTENCY_WEIGHT +
      prClosenessScore * PR_CLOSENESS_WEIGHT,
  );
}

// Finds the team's cross country record at its primary distance, used as
// the anchor for scaling other events' rating thresholds proportionally.
function findTeamCrossCountryAnchorSeconds(
  team: string,
  teamRunners: readonly AthleteRosterInfo[],
): number | null {
  const primaryDistance = PRIMARY_CROSS_COUNTRY_DISTANCE_BY_TEAM[team];
  if (!primaryDistance) return null;

  let recordSeconds: number | null = null;
  for (const runner of teamRunners) {
    if (runner.team !== team) continue;
    for (const result of collectCrossCountryResults(
      runner.tfrrsId,
      runner.raceHistory,
    )) {
      if (result.distance !== primaryDistance) continue;
      if (recordSeconds === null || result.seconds < recordSeconds) {
        recordSeconds = result.seconds;
      }
    }
  }

  return recordSeconds;
}

// Scales the flat 45-second/10-point XC threshold to another event's own
// record time, so a short race's record isn't penalized as if it were an 8k.
function secondsPerTenPointsFor(
  eventRecordSeconds: number,
  anchorRecordSeconds: number | null,
): number {
  if (!anchorRecordSeconds) return XC_RATING_ANCHOR_SECONDS;
  return eventRecordSeconds * (XC_RATING_ANCHOR_SECONDS / anchorRecordSeconds);
}

function parseMarkSeconds(mark: string): number | null {
  const normalized = mark.trim();
  if (!/^\d+(?::\d{1,2})?(?:\.\d+)?$/.test(normalized)) return null;

  const parts = normalized.split(":").map(Number);
  const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function normalizeEvent(event: string): string {
  return event
    .toLowerCase()
    .replace(/\(\s*xc\s*\)/g, "")
    .replace(/\bmeters?\b/g, "")
    // TFRRS formats longer distances with a thousands separator (e.g.
    // "10,000"); strip it so it normalizes the same as "10000".
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRelayEvent(event: string): boolean {
  return /\brelay\b|\b(?:dmr|smr)\b|\b\d+\s*x\s*\d+\b/i.test(event);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseCrossCountryDistance(event: string): string | null {
  const normalized = normalizeEvent(event).replace(/\s/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k|km|mi|miles?|m)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2] ?? "";

  let kilometers: number;
  if (unit === "k" || unit === "km") {
    kilometers = value;
  } else if (unit === "mi" || unit.startsWith("mile") || unit === "m") {
    // TFRRS's older XC results use a bare "m" suffix for miles (e.g. "4M"),
    // not meters — cross country never reports raw meter distances.
    kilometers = value * 1.60934;
  } else if (!unit && value >= 100) {
    kilometers = value / 1000;
  } else {
    kilometers = value;
  }

  return `${Number(kilometers.toFixed(3))}k`;
}

function parsePlacingNumber(placing: string | null | undefined): number | null {
  if (!placing) return null;
  const match = placing.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

interface CrossCountryRawResult {
  runnerId: string;
  distance: string;
  seconds: number;
}

function collectCrossCountryResults(
  runnerId: string,
  raceHistory: readonly AthleteRaceRecord[],
): CrossCountryRawResult[] {
  const results: CrossCountryRawResult[] = [];

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== "cross_country") continue;
    if (isRelayEvent(race.event)) continue;
    if (race.status && race.status !== "FINISHED") continue;

    const distance = parseCrossCountryDistance(race.event);
    const seconds = parseMarkSeconds(race.mark);
    if (!distance || seconds === null) continue;

    results.push({ runnerId, distance, seconds });
  }

  return results;
}

function findAllAmericanAppearances(
  raceHistory: readonly AthleteRaceRecord[],
): AllAmericanAppearance[] {
  const appearancesByYear = new Map<number, AllAmericanAppearance>();

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== "cross_country") continue;
    if (race.status && race.status !== "FINISHED") continue;
    if (
      !race.meet_name ||
      !ALL_AMERICAN_MEET_PATTERN.test(race.meet_name) ||
      REGIONAL_MEET_PATTERN.test(race.meet_name)
    ) {
      continue;
    }

    const placingNumber = parsePlacingNumber(race.placing);
    const year = Number(race.meet_date?.match(/^(\d{4})/)?.[1]);
    if (
      placingNumber === null ||
      placingNumber < 1 ||
      placingNumber > ALL_AMERICAN_PLACING_THRESHOLD ||
      !Number.isInteger(year)
    ) {
      continue;
    }

    const existing = appearancesByYear.get(year);
    const existingPlacing = existing
      ? (parsePlacingNumber(existing.placing) ?? Infinity)
      : Infinity;
    if (!existing || placingNumber < existingPlacing) {
      appearancesByYear.set(year, {
        year,
        meetName: race.meet_name,
        placing: race.placing ?? null,
      });
    }
  }

  return [...appearancesByYear.values()].sort(
    (first, second) => first.year - second.year,
  );
}

// Only counts All-American finishes in the same events used for that
// season's track rating at its NCAA Championships — a top-16 finish in an
// unrelated event (e.g. 60m, pentathlon) doesn't count.
function findTrackAllAmericanAppearances(
  raceHistory: readonly AthleteRaceRecord[],
  seasonType: "indoor" | "outdoor",
  ratedEvents: ReadonlySet<string>,
  meetPattern: RegExp,
): AllAmericanAppearance[] {
  const appearancesByEventYear = new Map<string, AllAmericanAppearance>();

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== seasonType) continue;
    if (race.status && race.status !== "FINISHED") continue;
    if (!ratedEvents.has(normalizeEvent(race.event))) continue;
    if (!race.meet_name || !meetPattern.test(race.meet_name)) {
      continue;
    }
    // Only final-round results count as the meet's actual finish; prelim
    // "(P)" placings are heat rankings, not the championship result.
    if (!/\(f\)\s*$/i.test(race.placing ?? "")) {
      continue;
    }

    const placingNumber = parsePlacingNumber(race.placing);
    const year = Number(race.meet_date?.match(/^(\d{4})/)?.[1]);
    if (
      placingNumber === null ||
      placingNumber < 1 ||
      placingNumber > TRACK_ALL_AMERICAN_PLACING_THRESHOLD ||
      !Number.isInteger(year)
    ) {
      continue;
    }

    const key = `${normalizeEvent(race.event)}|${year}`;
    const existing = appearancesByEventYear.get(key);
    const existingPlacing = existing
      ? (parsePlacingNumber(existing.placing) ?? Infinity)
      : Infinity;
    if (!existing || placingNumber < existingPlacing) {
      appearancesByEventYear.set(key, {
        year,
        meetName: race.meet_name,
        placing: race.placing ?? null,
      });
    }
  }

  return [...appearancesByEventYear.values()].sort(
    (first, second) => first.year - second.year,
  );
}

/**
 * Rates a cross country runner on how close their best mark at their team's
 * standard championship distance is to their team's all-time best (school
 * record) at that same distance: the record holder scores 100, and every 45
 * seconds behind the record costs 10 points, plus a bonus equal to their
 * count of national-meet top-40 (All-American) finishes.
 */
export function calculateCrossCountryRecordRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): CrossCountryRecordRating {
  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const sameTeamRunners = pool.filter((runner) => runner.team === athlete.team);

  const resultsByDistance = new Map<string, CrossCountryRawResult[]>();
  for (const runner of sameTeamRunners) {
    for (const result of collectCrossCountryResults(
      runner.tfrrsId,
      runner.raceHistory,
    )) {
      const results = resultsByDistance.get(result.distance) ?? [];
      results.push(result);
      resultsByDistance.set(result.distance, results);
    }
  }

  const allAmericanAppearances = findAllAmericanAppearances(
    athlete.raceHistory,
  );
  const allAmericanCount = allAmericanAppearances.length;

  const distances: CrossCountryDistanceRecord[] = [];
  for (const [distance, results] of resultsByDistance) {
    const athleteResults = results.filter(
      (result) => result.runnerId === athlete.tfrrsId,
    );
    if (athleteResults.length === 0) continue;

    const record = results.reduce((best, result) =>
      result.seconds < best.seconds ? result : best,
    );
    const athleteBest = athleteResults.reduce((best, result) =>
      result.seconds < best.seconds ? result : best,
    );
    const deficitSeconds = round(athleteBest.seconds - record.seconds);

    distances.push({
      distance,
      recordSeconds: round(record.seconds),
      recordHolderTfrrsId: record.runnerId,
      athleteSeconds: round(athleteBest.seconds),
      deficitSeconds,
      score: Math.max(
        0,
        round(100 - deficitSeconds * RATING_POINTS_LOST_PER_SECOND_BEHIND_RECORD),
      ),
    });
  }

  if (distances.length === 0) {
    return {
      score: null,
      deficitSeconds: null,
      bestDistance: null,
      athleteSeconds: null,
      recordSeconds: null,
      recordHolderTfrrsId: null,
      isRecordHolder: false,
      allAmericanCount,
      allAmericanAppearances,
      distances: [],
    };
  }

  const primaryDistance = PRIMARY_CROSS_COUNTRY_DISTANCE_BY_TEAM[athlete.team];
  const best = distances.find((entry) => entry.distance === primaryDistance);

  if (!best) {
    return {
      score: null,
      deficitSeconds: null,
      bestDistance: null,
      athleteSeconds: null,
      recordSeconds: null,
      recordHolderTfrrsId: null,
      isRecordHolder: false,
      allAmericanCount,
      allAmericanAppearances,
      distances: distances.sort((first, second) =>
        first.distance.localeCompare(second.distance),
      ),
    };
  }

  return {
    score: round(best.score + allAmericanCount),
    deficitSeconds: best.deficitSeconds,
    bestDistance: best.distance,
    athleteSeconds: best.athleteSeconds,
    recordSeconds: best.recordSeconds,
    recordHolderTfrrsId: best.recordHolderTfrrsId,
    isRecordHolder: best.recordHolderTfrrsId === athlete.tfrrsId,
    allAmericanCount,
    allAmericanAppearances,
    distances: distances.sort((first, second) =>
      first.distance.localeCompare(second.distance),
    ),
  };
}

interface TrackRawResult {
  runnerId: string;
  event: string;
  seconds: number;
}

function collectTrackResults(
  runnerId: string,
  raceHistory: readonly AthleteRaceRecord[],
  seasonType: "indoor" | "outdoor",
  ratedEvents: ReadonlySet<string>,
): TrackRawResult[] {
  const results: TrackRawResult[] = [];

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== seasonType) continue;
    if (isRelayEvent(race.event)) continue;
    if (race.status && race.status !== "FINISHED") continue;

    const event = normalizeEvent(race.event);
    if (!ratedEvents.has(event)) continue;

    const seconds = parseMarkSeconds(race.mark);
    if (seconds === null) continue;

    results.push({ runnerId, event, seconds });
  }

  return results;
}

/**
 * Rates a runner across a season type's (indoor or outdoor) rated events,
 * scoring each event they've raced at least twice by proximity to their
 * team's school record at that event. Each event's rating threshold is
 * scaled proportionally to its own record time, anchored so the team's
 * cross country primary-distance record still means 45 seconds = 10 points
 * (see secondsPerTenPointsFor) — a short event like the 800m is penalized
 * far more per second behind than a long one like the 5000m. Event scores
 * are then averaged weighted by the square of each event's attempt count —
 * so an event raced many times dominates one raced only the minimum
 * required twice.
 * A national-meet first-team All-American finish (places 1-8) in one of
 * those same events adds two points; a second-team finish (places 9-16)
 * adds one point to the final weighted score.
 */
function calculateTrackRecordRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[],
  seasonType: "indoor" | "outdoor",
  ratedEvents: ReadonlySet<string>,
  allAmericanMeetPattern: RegExp,
): IndoorRecordRating {
  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const sameTeamRunners = pool.filter((runner) => runner.team === athlete.team);
  const anchorRecordSeconds = findTeamCrossCountryAnchorSeconds(
    athlete.team,
    sameTeamRunners,
  );
  const allAmericanAppearances = findTrackAllAmericanAppearances(
    athlete.raceHistory,
    seasonType,
    ratedEvents,
    allAmericanMeetPattern,
  );
  const allAmericanCount = allAmericanAppearances.length;
  const allAmericanBonus = allAmericanAppearances.reduce((bonus, appearance) => {
    const placing = parsePlacingNumber(appearance.placing);
    if (placing === null || placing > TRACK_ALL_AMERICAN_PLACING_THRESHOLD) {
      return bonus;
    }
    return (
      bonus +
      (placing <= TRACK_FIRST_TEAM_ALL_AMERICAN_PLACING_THRESHOLD ? 2 : 1)
    );
  }, 0);

  const resultsByEvent = new Map<string, TrackRawResult[]>();
  for (const runner of sameTeamRunners) {
    for (const result of collectTrackResults(
      runner.tfrrsId,
      runner.raceHistory,
      seasonType,
      ratedEvents,
    )) {
      const results = resultsByEvent.get(result.event) ?? [];
      results.push(result);
      resultsByEvent.set(result.event, results);
    }
  }

  const events: IndoorEventRating[] = [];
  for (const [event, results] of resultsByEvent) {
    const athleteResults = results.filter(
      (result) => result.runnerId === athlete.tfrrsId,
    );
    if (athleteResults.length < MIN_ATTEMPTS_FOR_TRACK_EVENT) continue;

    const record = results.reduce((best, result) =>
      result.seconds < best.seconds ? result : best,
    );
    const athleteBest = athleteResults.reduce((best, result) =>
      result.seconds < best.seconds ? result : best,
    );
    const deficitSeconds = round(athleteBest.seconds - record.seconds);
    const secondsPerTenPoints = secondsPerTenPointsFor(
      record.seconds,
      anchorRecordSeconds,
    );

    events.push({
      event,
      attempts: athleteResults.length,
      recordSeconds: round(record.seconds),
      recordHolderTfrrsId: record.runnerId,
      athleteSeconds: round(athleteBest.seconds),
      deficitSeconds,
      secondsPerTenPoints: round(secondsPerTenPoints),
      score: Math.max(
        0,
        round(100 - (deficitSeconds * 10) / secondsPerTenPoints),
      ),
      weight: trackEventWeight(athleteResults.length),
    });
  }

  if (events.length === 0) {
    return {
      score: null,
      events: [],
      allAmericanCount,
      allAmericanAppearances,
    };
  }

  const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
  const weightedScore =
    events.reduce((sum, event) => sum + event.score * event.weight, 0) /
    totalWeight;

  return {
    score: round(weightedScore + allAmericanBonus),
    events: events.sort((first, second) => second.attempts - first.attempts),
    allAmericanCount,
    allAmericanAppearances,
  };
}

// Rates an indoor runner across the 800m, 1000m, mile, 3000m, and 5000m.
// See calculateTrackRecordRating for the full methodology.
export function calculateIndoorRecordRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): IndoorRecordRating {
  return calculateTrackRecordRating(
    athlete,
    teamRunners,
    "indoor",
    INDOOR_RATED_EVENTS,
    INDOOR_ALL_AMERICAN_MEET_PATTERN,
  );
}

// Rates an outdoor runner across the 800m, 1500m, 3000m steeplechase,
// 5000m, and 10,000m. See calculateTrackRecordRating for the full
// methodology.
export function calculateOutdoorRecordRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): OutdoorRecordRating {
  return calculateTrackRecordRating(
    athlete,
    teamRunners,
    "outdoor",
    OUTDOOR_RATED_EVENTS,
    OUTDOOR_ALL_AMERICAN_MEET_PATTERN,
  );
}

export function calculateAthleteAttributes(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): AthleteAttributeValues {
  return {
    crossCountry: calculateCrossCountryRecordRating(athlete, teamRunners).score,
    indoor: calculateIndoorRecordRating(athlete, teamRunners).score,
    outdoor: calculateOutdoorRecordRating(athlete, teamRunners).score,
    indoorConsistency: calculateTrackConsistencyRating(athlete, "indoor"),
    outdoorConsistency: calculateTrackConsistencyRating(athlete, "outdoor"),
    speed: null,
    endurance: null,
    winFactor: null,
  };
}
