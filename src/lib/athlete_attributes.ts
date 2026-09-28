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

// Individual placing at or above this rank at a national XC championship
// counts as an All-American appearance (NCAA Division III convention).
// Regional meets (used to qualify for nationals) must be excluded, since a
// top-40 regional finish is not itself All-American status.
const ALL_AMERICAN_PLACING_THRESHOLD = 40;
const ALL_AMERICAN_MEET_PATTERN =
  /ncaa[^|]*cross\s*country[^|]*championships?/i;
const REGIONAL_MEET_PATTERN = /\bregion\b/i;

// Every 45 seconds behind the school record costs 10 rating points.
const RATING_POINTS_LOST_PER_SECOND_BEHIND_RECORD = 10 / 45;

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

/**
 * Rates a cross country runner on how close their best mark at a given
 * distance is to their team's all-time best (school record) at that same
 * distance: the record holder scores 100 at that distance, and every 45
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

  const best = distances.reduce((top, current) =>
    current.score > top.score ? current : top,
  );

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

// Indoor and outdoor ratings are not yet designed; they return null until a
// methodology (analogous to the cross country school-record rating) is set.
export function calculateAthleteAttributes(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[] = [],
): AthleteAttributeValues {
  return {
    crossCountry: calculateCrossCountryRecordRating(athlete, teamRunners).score,
    indoor: null,
    outdoor: null,
    speed: null,
    endurance: null,
    winFactor: null,
  };
}
