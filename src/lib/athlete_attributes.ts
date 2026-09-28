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

// Individual placing at or above this rank at a national XC championship
// counts as an All-American appearance (NCAA Division III convention).
// Regional meets (used to qualify for nationals) must be excluded, since a
// top-40 regional finish is not itself All-American status.
const ALL_AMERICAN_PLACING_THRESHOLD = 40;
const ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*cross\s*country[^|]*championships?/i;
const REGIONAL_MEET_PATTERN = /\bregion\b/i;

// Indoor national championship top-8 finishers earn first-team All-American
// status; places 9-16 earn second-team All-American status.
const INDOOR_ALL_AMERICAN_PLACING_THRESHOLD = 16;
const INDOOR_FIRST_TEAM_ALL_AMERICAN_PLACING_THRESHOLD = 8;
const INDOOR_ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*indoor[^|]*(?:track|championships?)/i;

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
const MIN_ATTEMPTS_FOR_INDOOR_EVENT = 2;

// Squares each event's attempt count so an event raced many times heavily
// outweighs one raced only the minimum required two times.
function indoorEventWeight(attempts: number): number {
  return attempts * attempts;
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

// Only counts All-American finishes in the same events used for the indoor
// rating (800/1000/mile/3000/5000) at the NCAA Indoor Championships — a
// top-16 finish in an unrelated event (e.g. 60m, pentathlon) doesn't count.
function findIndoorAllAmericanAppearances(
  raceHistory: readonly AthleteRaceRecord[],
): AllAmericanAppearance[] {
  const appearancesByEventYear = new Map<string, AllAmericanAppearance>();

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== "indoor") continue;
    if (race.status && race.status !== "FINISHED") continue;
    if (!INDOOR_RATED_EVENTS.has(normalizeEvent(race.event))) continue;
    if (!race.meet_name || !INDOOR_ALL_AMERICAN_MEET_PATTERN.test(race.meet_name)) {
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
      placingNumber > INDOOR_ALL_AMERICAN_PLACING_THRESHOLD ||
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

interface IndoorRawResult {
  runnerId: string;
  event: string;
  seconds: number;
}

function collectIndoorResults(
  runnerId: string,
  raceHistory: readonly AthleteRaceRecord[],
): IndoorRawResult[] {
  const results: IndoorRawResult[] = [];

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== "indoor") continue;
    if (isRelayEvent(race.event)) continue;
    if (race.status && race.status !== "FINISHED") continue;

    const event = normalizeEvent(race.event);
    if (!INDOOR_RATED_EVENTS.has(event)) continue;

    const seconds = parseMarkSeconds(race.mark);
    if (seconds === null) continue;

    results.push({ runnerId, event, seconds });
  }

  return results;
}

/**
 * Rates an indoor runner across the 800m, 1000m, mile, 3000m, and 5000m,
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
export function calculateIndoorRecordRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): IndoorRecordRating {
  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const sameTeamRunners = pool.filter((runner) => runner.team === athlete.team);
  const anchorRecordSeconds = findTeamCrossCountryAnchorSeconds(
    athlete.team,
    sameTeamRunners,
  );
  const allAmericanAppearances = findIndoorAllAmericanAppearances(
    athlete.raceHistory,
  );
  const allAmericanCount = allAmericanAppearances.length;
  const allAmericanBonus = allAmericanAppearances.reduce((bonus, appearance) => {
    const placing = parsePlacingNumber(appearance.placing);
    if (placing === null || placing > INDOOR_ALL_AMERICAN_PLACING_THRESHOLD) {
      return bonus;
    }
    return (
      bonus +
      (placing <= INDOOR_FIRST_TEAM_ALL_AMERICAN_PLACING_THRESHOLD ? 2 : 1)
    );
  }, 0);

  const resultsByEvent = new Map<string, IndoorRawResult[]>();
  for (const runner of sameTeamRunners) {
    for (const result of collectIndoorResults(
      runner.tfrrsId,
      runner.raceHistory,
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
    if (athleteResults.length < MIN_ATTEMPTS_FOR_INDOOR_EVENT) continue;

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
      weight: indoorEventWeight(athleteResults.length),
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

// Outdoor ratings are not yet designed; they return null until a
// methodology (analogous to the cross country and indoor rating) is set.
export function calculateAthleteAttributes(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): AthleteAttributeValues {
  return {
    crossCountry: calculateCrossCountryRecordRating(athlete, teamRunners).score,
    indoor: calculateIndoorRecordRating(athlete, teamRunners).score,
    outdoor: null,
    speed: null,
    endurance: null,
    winFactor: null,
  };
}
