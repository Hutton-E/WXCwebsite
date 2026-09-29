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
  overall: number | null;
  runnerType: RunnerType | null;
  runnerTypeScores: RunnerTypeScores;
}

export type RunnerType =
  | "Grass God"
  | "Indoor Demon"
  | "Outdoor Allstar"
  | "Jack-Of-All-Races";

export interface RunnerTypeScores {
  grassGods: number | null;
  indoorDemons: number | null;
  outdoorAllstar: number | null;
  jackOfAllRaces: number | null;
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
const MID_DISTANCE_800M_400M_TIME_ADJUSTMENT = 1.03;
const MID_DISTANCE_1500_MILE_400M_TIME_ADJUSTMENT = 1.04;
const DISTANCE_400M_TIME_ADJUSTMENT = 1.05;
const LONG_DISTANCE_400M_TIME_ADJUSTMENT = 1.07;
const PREDICTED_10000M_TIME_ADJUSTMENT = 1.02;
const MID_DISTANCE_10000M_TIME_ADJUSTMENT = 1.07;
const NON_CHAMPIONSHIP_WIN_FACTOR_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const CONFERENCE_WIN_FACTOR_POINTS = [15, 13, 11, 9, 7, 6, 5, 4];
const REGIONAL_WIN_FACTOR_POINTS = [18, 15, 13, 11, 9, 7, 6, 5];
const WIN_FACTOR_SCALE = 10;
// The overall rating blends a season-results average (XC/indoor/outdoor)
// with a physical-ability average (speed/endurance); the season average is
// weighted more heavily since it reflects actual competitive results across
// three full seasons rather than two isolated ability metrics.
const OVERALL_SEASON_AVERAGE_WEIGHT = 0.65;
const OVERALL_PHYSICAL_AVERAGE_WEIGHT = 0.35;
// Win factor is folded in using each athlete's percentile rank among their
// teammates rather than their raw win-factor score, since raw points scale
// with how many championship-level races an athlete has run. Ranking by
// percentile keeps the comparison fair for athletes with fewer counted
// races.
const OVERALL_WIN_FACTOR_WEIGHT = 0.15;
const OVERALL_BASE_WEIGHT = 1 - OVERALL_WIN_FACTOR_WEIGHT;

type WorldAthleticsScoreModel = readonly [quadratic: number, linear: number, offset: number];
type WorldAthleticsGender = "men" | "women";
type TrackRace = {
  distanceMeters: number;
  seconds: number;
  shortTrack: boolean;
  scoringEvent?: string;
};
type RaceSpecialty = "mid-distance" | "3k-5k" | "5k-10k";

// Quadratic fits to the 2025 World Athletics scoring tables. Short-track
// events use their dedicated tables when an indoor result is being scored.
const WORLD_ATHLETICS_SCORE_MODELS: Record<
  WorldAthleticsGender,
  Record<string, WorldAthleticsScoreModel>
> = {
  men: {
    "50m": [95.82235385745662, -1763.0165325322305, 8108.971505376976],
    "55m": [78.9227608844667, -1578.3239369830117, 7890.637076645042],
    "60m": [68.62032200155772, -1468.376079820242, 7854.923996115336],
    "100m": [24.642211664166098, -837.7135408530303, 7119.3125116789015],
    "200m": [5.083329625804254, -360.8260380705033, 6403.154333221377],
    "300m": [1.8296570247447335, -209.30430382250051, 5985.805789959268],
    "400m": [1.0210130425695638, -161.3092238081408, 6371.289298935095],
    "400m short track": [
      0.9810285010226494, -158.13093544779986, 6372.245446830289,
    ],
    "500m": [0.585027774798931, -121.67863906127604, 6326.92802974442],
    "500m short track": [
      0.5649713205833109, -119.76970949143652, 6347.5570185079705,
    ],
    "600m": [0.3856992283143512, -99.89240864996827, 6467.788691627793],
    "600m short track": [
      0.3899861152610953, -102.17335025475768, 6692.146447579609,
    ],
    "800m": [0.1980049254166545, -72.07136038821409, 6558.28160300618],
    "800m short track": [
      0.19739256108073278, -72.63927638712084, 6682.6879602972185,
    ],
    "1000m": [0.11229987246056083, -53.34129687676432, 6334.142779359594],
    "1000m short track": [
      0.11389778654137217, -54.670029751952825, 6560.289996561711,
    ],
    "1500m": [0.04065992529984008, -31.307736299477256, 6026.662254345021],
    "1500m short track": [
      0.041999988506264074, -32.423575703958704, 6257.669581143418,
    ],
    "2000m": [0.02181003181267993, -23.03116782160032, 6080.168871850823],
    "2000m short track": [
      0.022600003526984658, -23.865373073726005, 6300.3976437979145,
    ],
    "3000m": [0.008150049932713843, -13.691983542337312, 5750.59246378555],
    "3000m short track": [
      0.00832191917227365, -13.980775520668885, 5871.90250552597,
    ],
    "5000m": [0.002777997945427213, -8.000608112196687, 5760.418712362531],
    "5000m short track": [
      0.002900003148620267, -8.351976844926412, 6013.40053571912,
    ],
    "10000m": [0.0005239994429364625, -3.3011925260043427, 5199.371486475808],
    Mile: [0.035099677603458446, -29.132456259137143, 6044.924547011615],
    "Mile short track": [
      0.036900007414912395, -30.626657725760197, 6354.958031052956,
    ],
    "2 Miles": [0.007029988518363783, -12.721403001585259, 5755.13271902001],
    "2 Miles short track": [
      0.007209969187584653, -13.078823619347986, 5931.217870712513,
    ],
  },
  women: {
    "50m": [33.046243452504314, -799.5823293340509, 4836.413712938258],
    "55m": [27.69222698350768, -728.2024319005941, 4786.948624048266],
    "60m": [24.91177544269476, -697.4127036580539, 4880.84062414919],
    "100m": [9.927426450685289, -436.6751262119069, 4802.020943877404],
    "200m": [2.2422237149162925, -204.01464451534775, 4640.727341804304],
    "300m": [0.6999743364017235, -107.79032021608691, 4149.692833384965],
    "400m": [0.3350059758445596, -73.6974469594461, 4053.1545244171575],
    "400m short track": [
      0.32239778088712256, -72.2140857003651, 4043.8163995789655,
    ],
    "500m": [0.1875992157997608, -54.58957565931178, 3971.259245572466],
    "500m short track": [
      0.17139835836097816, -51.58928019804989, 3881.97389184442,
    ],
    "600m": [0.1290024817337887, -46.439367295225566, 4179.4139537496085],
    "600m short track": [
      0.10630096102938147, -40.4675585171226, 3851.3911703779886,
    ],
    "800m": [0.06879989341997295, -34.399261916380055, 4299.822125108796],
    "800m short track": [
      0.05719995663858857, -30.201001015322618, 3986.4574604244845,
    ],
    "1000m": [0.038199708533426247, -25.211487793783817, 4159.840558573429],
    "1000m short track": [
      0.034730273669098644, -23.643965410011788, 4024.137096635415,
    ],
    "1500m": [0.01339999627048627, -14.471861176560651, 3907.3655835949467],
    "1500m short track": [
      0.013649954143477805, -14.741826462372728, 3980.259331609617,
    ],
    "2000m": [0.006766010458436056, -10.148946030704451, 3805.8288250550686],
    "2000m short track": [
      0.006849999624836789, -10.305069946577078, 3875.710937557713,
    ],
    "3000m": [0.0025389974609562604, -6.09357042856243, 3656.127933666052],
    "3000m short track": [
      0.002590000537161685, -6.215973858107134, 3729.5683351015323,
    ],
    "5000m": [0.0008079992470730324, -3.3935897885437782, 3563.2616780022654],
    "5000m short track": [
      0.00082499992965758, -3.464991324219369, 3638.23229190876,
    ],
    "10000m": [0.0001712000450308747, -1.5407985033832432, 3466.7925173026015],
    Mile: [0.011649998601839462, -13.513881163102496, 3918.992004961794],
    "Mile short track": [
      0.011540015186639607, -13.513232952897397, 3955.963356088527,
    ],
    "2 Miles": [0.0021569982582902714, -5.592213856668138, 3624.5803229979647],
    "2 Miles short track": [
      0.0022019917299053726, -5.708869030298274, 3700.1929170416843,
    ],
  },
};

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

function parseTrackRace(race: AthleteRaceRecord): TrackRace | null {
  if (race.status && race.status !== "FINISHED") return null;
  if (isRelayEvent(race.event)) return null;
  if (
    race.season_type?.trim().toLowerCase().replace(/[\s-]+/g, "_") ===
    "cross_country"
  ) {
    return null;
  }

  const event = normalizeEvent(race.event);
  let distanceMeters: number;
  let scoringEvent: string | undefined;
  if (/^(?:1\s*)?mile$/.test(event)) {
    distanceMeters = 1609.344;
  } else if (/^2\s*miles?$/.test(event)) {
    distanceMeters = 3218.688;
  } else if (/^3000\s*(?:s|steeple(?:chase)?)$/.test(event)) {
    distanceMeters = 3000;
    scoringEvent = "3000m SC";
  } else {
    const match = event.match(/^(\d+(?:\.\d+)?)\s*(m|k)?$/);
    if (!match) return null;
    distanceMeters = Number(match[1]) * (match[2] === "k" ? 1000 : 1);
  }

  const seconds = parseMarkSeconds(race.mark);
  if (seconds === null) return null;

  return {
    distanceMeters,
    seconds,
    shortTrack: race.season_type?.trim().toLowerCase() === "indoor",
    scoringEvent,
  };
}

function scoreModelForRace(
  gender: WorldAthleticsGender,
  race: TrackRace,
): WorldAthleticsScoreModel | null {
  const models = WORLD_ATHLETICS_SCORE_MODELS[gender];
  const eventKey = race.scoringEvent ??
    (race.distanceMeters === 1609.344
      ? "Mile"
      : race.distanceMeters === 3218.688
        ? "2 Miles"
        : `${race.distanceMeters}m`);
  return (
    (race.shortTrack ? models[`${eventKey} short track`] : undefined) ??
    models[eventKey] ??
    null
  );
}

function worldAthleticsPoints(
  seconds: number,
  model: WorldAthleticsScoreModel,
): number {
  const [quadratic, linear, offset] = model;
  return Math.max(
    0,
    Math.floor(quadratic * seconds ** 2 + linear * seconds + offset),
  );
}

function predictedPerformanceSeconds(
  points: number,
  model: WorldAthleticsScoreModel,
  fastestCandidateSeconds: number,
): number | null {
  const [quadratic, linear] = model;
  const vertexSeconds = -linear / (2 * quadratic);
  let low = Math.round(fastestCandidateSeconds * 100);
  let high = Math.floor(vertexSeconds * 100);

  if (
    points > worldAthleticsPoints(fastestCandidateSeconds, model) ||
    points < worldAthleticsPoints(high / 100, model)
  ) {
    return null;
  }

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidatePoints = worldAthleticsPoints(midpoint / 100, model);
    if (candidatePoints > points) {
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  const candidates = [low, high].filter(
    (centiseconds) =>
      centiseconds >= Math.round(fastestCandidateSeconds * 100),
  );
  if (candidates.length === 0) return null;

  const closest = candidates.reduce((best, candidate) => {
    const bestDifference = Math.abs(
      worldAthleticsPoints(best / 100, model) - points,
    );
    const candidateDifference = Math.abs(
      worldAthleticsPoints(candidate / 100, model) - points,
    );
    return candidateDifference < bestDifference ||
      (candidateDifference === bestDifference && candidate < best)
      ? candidate
      : best;
  });
  return closest / 100;
}

function athlete400EquivalentSeconds(
  athlete: AthleteRosterInfo,
): number | null {
  const gender: WorldAthleticsGender | null =
    athlete.team === "mens-cross-country"
      ? "men"
      : athlete.team === "womens-cross-country"
        ? "women"
        : null;
  if (!gender) return null;

  const races = athlete.raceHistory
    .map((race) => ({ race, result: parseTrackRace(race) }))
    .filter(
      (entry): entry is { race: AthleteRaceRecord; result: TrackRace } =>
        entry.result !== null,
    );
  const direct400Results = races
    .filter((entry) => entry.result.distanceMeters === 400)
    .map((entry) => entry.result.seconds);
  if (direct400Results.length > 0) {
    return Math.min(...direct400Results);
  }

  const scoredRaces = races
    .map(({ result }) => {
      const sourceModel = scoreModelForRace(gender, result);
      if (!sourceModel) return null;
      return {
        result,
        points: worldAthleticsPoints(result.seconds, sourceModel),
      };
    })
    .filter(
      (entry): entry is { result: TrackRace; points: number } => entry !== null,
    )
    .sort(
      (first, second) =>
        first.result.distanceMeters - second.result.distanceMeters ||
        second.points - first.points,
    );
  const shortestRace = scoredRaces[0];
  if (!shortestRace) return null;

  const targetModel = scoreModelForRace(gender, {
    distanceMeters: 400,
    seconds: 0,
    shortTrack: shortestRace.result.shortTrack,
  });
  if (!targetModel) return null;

  const specialty = classifyRaceSpecialty(athlete.raceHistory);
  const adjustment =
    specialty === "mid-distance"
      ? classifyMidDistanceDominance(athlete.raceHistory) === "1500-mile"
        ? MID_DISTANCE_1500_MILE_400M_TIME_ADJUSTMENT
        : MID_DISTANCE_800M_400M_TIME_ADJUSTMENT
      : specialty === "5k-10k"
        ? LONG_DISTANCE_400M_TIME_ADJUSTMENT
        : DISTANCE_400M_TIME_ADJUSTMENT;
  const convertedSeconds = predictedPerformanceSeconds(
    shortestRace.points,
    targetModel,
    25,
  );
  return convertedSeconds === null
    ? null
    : round(convertedSeconds * adjustment);
}

function athlete10000EquivalentSeconds(
  athlete: AthleteRosterInfo,
): number | null {
  const gender: WorldAthleticsGender | null =
    athlete.team === "mens-cross-country"
      ? "men"
      : athlete.team === "womens-cross-country"
        ? "women"
        : null;
  if (!gender) return null;

  const races = athlete.raceHistory
    .map(parseTrackRace)
    .filter((result): result is TrackRace => result !== null);
  const direct10000Results = races
    .filter((result) => result.distanceMeters === 10000)
    .map((result) => result.seconds);
  if (direct10000Results.length > 0) {
    return Math.min(...direct10000Results);
  }

  const longestRace = races
    .map((result) => {
      const sourceModel = scoreModelForRace(gender, result);
      if (!sourceModel) return null;
      return {
        result,
        points: worldAthleticsPoints(result.seconds, sourceModel),
      };
    })
    .filter(
      (entry): entry is { result: TrackRace; points: number } =>
        entry !== null,
    )
    .sort(
      (first, second) =>
        second.result.distanceMeters - first.result.distanceMeters ||
        second.points - first.points,
    )[0];
  if (!longestRace) return null;

  const targetModel = WORLD_ATHLETICS_SCORE_MODELS[gender]["10000m"];
  if (!targetModel) return null;
  const convertedSeconds = predictedPerformanceSeconds(
    longestRace.points,
    targetModel,
    20 * 60,
  );
  const adjustment =
    classifyRaceSpecialty(athlete.raceHistory) === "mid-distance"
      ? MID_DISTANCE_10000M_TIME_ADJUSTMENT
      : PREDICTED_10000M_TIME_ADJUSTMENT;
  return convertedSeconds === null
    ? null
    : round(convertedSeconds * adjustment);
}

function classifyRaceSpecialty(
  raceHistory: readonly AthleteRaceRecord[],
): RaceSpecialty | null {
  const counts: Record<RaceSpecialty, number> = {
    "mid-distance": 0,
    "3k-5k": 0,
    "5k-10k": 0,
  };

  for (const race of raceHistory) {
    const result = parseTrackRace(race);
    if (!result) continue;

    if (
      result.distanceMeters === 400 ||
      result.distanceMeters === 800 ||
      result.distanceMeters === 1500 ||
      result.distanceMeters === 1609.344
    ) {
      counts["mid-distance"] += 1;
    }
    if (result.distanceMeters >= 3000 && result.distanceMeters <= 5000) {
      counts["3k-5k"] += 1;
    }
    if (result.distanceMeters >= 5000 && result.distanceMeters <= 10000) {
      counts["5k-10k"] += 1;
    }
  }

  return (
    (Object.entries(counts) as [RaceSpecialty, number][])
      .filter(([, count]) => count > 0)
      .sort(
        ([firstSpecialty, firstCount], [secondSpecialty, secondCount]) =>
          secondCount - firstCount ||
          (firstSpecialty === "mid-distance"
            ? -1
            : secondSpecialty === "mid-distance"
              ? 1
              : firstSpecialty === "3k-5k"
                ? -1
                : 1),
      )[0]?.[0] ?? null
  );
}

// Within the mid-distance group, an 800m-heavy history still runs much
// closer to sprinting speed than a 1500m/mile-heavy one, so the two are
// split into their own adjustment tiers. 400m entries don't count toward
// this split since an athlete with a 400m mark never reaches this
// conversion path in the first place (see athlete400EquivalentSeconds).
function classifyMidDistanceDominance(
  raceHistory: readonly AthleteRaceRecord[],
): "800" | "1500-mile" {
  let count800 = 0;
  let count1500OrMile = 0;

  for (const race of raceHistory) {
    const result = parseTrackRace(race);
    if (!result) continue;

    if (result.distanceMeters === 800) {
      count800 += 1;
    } else if (
      result.distanceMeters === 1500 ||
      result.distanceMeters === 1609.344
    ) {
      count1500OrMile += 1;
    }
  }

  return count1500OrMile > count800 ? "1500-mile" : "800";
}

function calculateSpeedRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[],
): number | null {
  const athleteSeconds = athlete400EquivalentSeconds(athlete);
  if (athleteSeconds === null) return null;

  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const sameTeamRunners = pool.filter((runner) => runner.team === athlete.team);
  const fastestSeconds = sameTeamRunners.reduce<number | null>(
    (fastest, runner) => {
      const seconds = athlete400EquivalentSeconds(runner);
      return seconds !== null && (fastest === null || seconds < fastest)
        ? seconds
        : fastest;
    },
    null,
  );

  if (fastestSeconds === null) return null;

  const anchorRecordSeconds = findTeamCrossCountryAnchorSeconds(
    athlete.team,
    sameTeamRunners,
  );
  const secondsPerTenPoints = secondsPerTenPointsFor(
    fastestSeconds,
    anchorRecordSeconds,
  );
  return Math.max(
    0,
    round(100 - ((athleteSeconds - fastestSeconds) * 10) / secondsPerTenPoints),
  );
}

function calculateEnduranceRating(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[],
): number | null {
  const athleteSeconds = athlete10000EquivalentSeconds(athlete);
  if (athleteSeconds === null) return null;

  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const sameTeamRunners = pool.filter((runner) => runner.team === athlete.team);
  const fastestSeconds = sameTeamRunners.reduce<number | null>(
    (fastest, runner) => {
      const seconds = athlete10000EquivalentSeconds(runner);
      return seconds !== null && (fastest === null || seconds < fastest)
        ? seconds
        : fastest;
    },
    null,
  );

  return fastestSeconds === null
    ? null
    : round((fastestSeconds / athleteSeconds) * 100);
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

function winFactorPointsForPlacing(
  placing: number,
  meetName: string | null | undefined,
): number {
  const normalizedMeetName = meetName?.toLowerCase() ?? "";
  if (/\bregional|\bregionals?\b|\bregion\b/.test(normalizedMeetName)) {
    return REGIONAL_WIN_FACTOR_POINTS[placing - 1] ?? 0;
  }
  if (/\bconference\b/.test(normalizedMeetName)) {
    return CONFERENCE_WIN_FACTOR_POINTS[placing - 1] ?? 0;
  }
  if (/\bnational\b|\bncaa\b/.test(normalizedMeetName)) {
    if (placing === 1) return 20;
    return placing >= 2 && placing <= 40 ? 20 - Math.ceil(placing / 2) : 0;
  }
  return NON_CHAMPIONSHIP_WIN_FACTOR_POINTS[placing - 1] ?? 0;
}

function isCompletedWinFactorRace(race: AthleteRaceRecord): boolean {
  const status = race.status?.trim().toUpperCase();
  if (
    status &&
    !["FINISHED", "COMPLETE", "COMPLETED"].includes(status)
  ) {
    return false;
  }

  const mark = race.mark.trim();
  if (!mark) return false;
  return !/^(?:DNS|DNF|DQ|DSQ|NT|NH|NM|FOUL|SCR|SCRATCH|WITHDRAWN|AB|DID NOT|NO START|DISQUAL)/i.test(
    mark,
  );
}

function calculateWinFactorRating(
  raceHistory: readonly AthleteRaceRecord[],
): number | null {
  let totalPoints = 0;
  let competedRaces = 0;

  for (const race of raceHistory) {
    if (!isCompletedWinFactorRace(race)) continue;

    competedRaces++;
    const placing = parsePlacingNumber(race.placing);
    if (placing !== null) {
      totalPoints += winFactorPointsForPlacing(placing, race.meet_name);
    }

  }

  return competedRaces === 0
    ? null
    : round((totalPoints / competedRaces) * WIN_FACTOR_SCALE);
}

// Converts an athlete's win factor score into a percentile (0-100) among
// their teammates' win factor scores. Athletes tied on win factor share the
// same percentile (the midpoint of their tied group), so the ranking stays
// fair regardless of how many races each athlete has completed.
function calculateWinFactorPercentile(
  athlete: AthleteRosterInfo,
  teamRunners: readonly AthleteRosterInfo[],
): number | null {
  const athleteWinFactor = calculateWinFactorRating(athlete.raceHistory);
  if (athleteWinFactor === null) return null;

  const pool = teamRunners.some((runner) => runner.tfrrsId === athlete.tfrrsId)
    ? teamRunners
    : [...teamRunners, athlete];
  const teammateWinFactors = pool
    .filter((runner) => runner.team === athlete.team)
    .map((runner) => calculateWinFactorRating(runner.raceHistory))
    .filter((value): value is number => value !== null);

  if (teammateWinFactors.length <= 1) return 100;

  const lowerCount = teammateWinFactors.filter(
    (value) => value < athleteWinFactor,
  ).length;
  const tiedCount = teammateWinFactors.filter(
    (value) => value === athleteWinFactor,
  ).length;
  // Rank position using the midpoint of the tied group so athletes tied for
  // last don't get penalized more than athletes tied for first are rewarded.
  const rank = lowerCount + (tiedCount + 1) / 2;
  return round(((rank - 1) / (teammateWinFactors.length - 1)) * 100);
}

function calculateOverallRating(
  ratings: Pick<
    AthleteAttributeValues,
    "crossCountry" | "indoor" | "outdoor" | "speed" | "endurance"
  >,
  winFactorPercentile: number | null,
): number | null {
  const seasonAverage = calculateWeightedRating([
    [ratings.crossCountry, 1],
    [ratings.indoor, 1],
    [ratings.outdoor, 1],
  ]);
  const physicalAverage = calculateWeightedRating([
    [ratings.speed, 1],
    [ratings.endurance, 1],
  ]);
  const baseScore = calculateWeightedRating([
    [seasonAverage, OVERALL_SEASON_AVERAGE_WEIGHT],
    [physicalAverage, OVERALL_PHYSICAL_AVERAGE_WEIGHT],
  ]);
  if (baseScore === null) return null;

  return winFactorPercentile === null
    ? baseScore
    : round(
        baseScore * OVERALL_BASE_WEIGHT +
          winFactorPercentile * OVERALL_WIN_FACTOR_WEIGHT,
      );
}

type WeightedRating = [value: number | null, weight: number];

function calculateWeightedRating(ratings: WeightedRating[]): number | null {
  const availableRatings = ratings.filter(
    (rating): rating is [number, number] => rating[0] !== null,
  );
  if (availableRatings.length === 0) return null;

  const totalWeight = availableRatings.reduce(
    (sum, [, weight]) => sum + weight,
    0,
  );
  return round(
    availableRatings.reduce(
      (sum, [value, weight]) => sum + value * weight,
      0,
    ) / totalWeight,
  );
}

function calculateRunnerTypeClassification(
  ratings: Omit<
    AthleteAttributeValues,
    "runnerType" | "runnerTypeScores" | "overall"
  >,
): { runnerType: RunnerType | null; scores: RunnerTypeScores } {
  const grassGods = calculateWeightedRating([
        [ratings.crossCountry, 0.6],
        [ratings.endurance, 0.15],
        [ratings.winFactor, 0.1],
        [ratings.outdoor, 0.1],
        [ratings.outdoorConsistency, 0.05],
      ]);
  const indoorDemons = calculateWeightedRating([
        [ratings.indoor, 0.55],
        [ratings.indoorConsistency, 0.2],
        [ratings.speed, 0.15],
        [ratings.winFactor, 0.1],
      ]);
  const outdoorAllstar = calculateWeightedRating([
        [ratings.outdoor, 0.55],
        [ratings.outdoorConsistency, 0.2],
        [ratings.endurance, 0.1],
        [ratings.speed, 0.05],
        [ratings.winFactor, 0.1],
      ]);

  const seasonalScores = [grassGods, indoorDemons, outdoorAllstar].filter(
        (score): score is number => score !== null,
      );
  const overallAverage = calculateWeightedRating([
        [ratings.crossCountry, 1],
        [ratings.indoor, 1],
        [ratings.outdoor, 1],
        [ratings.indoorConsistency, 1],
        [ratings.outdoorConsistency, 1],
        [ratings.speed, 1],
        [ratings.endurance, 1],
        [ratings.winFactor, 1],
      ]);
  const seasonalBalance = calculateWeightedRating(
        seasonalScores.map((score) => [score, 1]),
      );
  const jackOfAllRaces =
        overallAverage === null || seasonalBalance === null
          ? null
          : round(overallAverage * 0.7 + seasonalBalance * 0.3);

  const scores: RunnerTypeScores = {
        grassGods,
        indoorDemons,
        outdoorAllstar,
        jackOfAllRaces,
      };
  const eligibleScores: [RunnerType, number][] = [];
  if (grassGods !== null && grassGods >= 65) {
        eligibleScores.push(["Grass God", grassGods]);
      }
  if (indoorDemons !== null && indoorDemons >= 65) {
        eligibleScores.push(["Indoor Demon", indoorDemons]);
      }
  if (outdoorAllstar !== null && outdoorAllstar >= 65) {
        eligibleScores.push(["Outdoor Allstar", outdoorAllstar]);
      }
  const strongSeasonCount = seasonalScores.filter((score) => score >= 70).length;
  if (
        jackOfAllRaces !== null &&
        overallAverage !== null &&
        ratings.crossCountry !== null &&
        ratings.indoor !== null &&
        ratings.outdoor !== null &&
        strongSeasonCount >= 2 &&
        overallAverage >= 75 &&
        jackOfAllRaces >= 75
      ) {
    eligibleScores.push(["Jack-Of-All-Races", jackOfAllRaces]);
  }

  eligibleScores.sort((first, second) => second[1] - first[1]);
  return {
    runnerType: eligibleScores[0]?.[0] ?? null,
    scores,
  }
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
  const ratings = {
    crossCountry: calculateCrossCountryRecordRating(athlete, teamRunners).score,
    indoor: calculateIndoorRecordRating(athlete, teamRunners).score,
    outdoor: calculateOutdoorRecordRating(athlete, teamRunners).score,
    indoorConsistency: calculateTrackConsistencyRating(athlete, "indoor"),
    outdoorConsistency: calculateTrackConsistencyRating(athlete, "outdoor"),
    speed: calculateSpeedRating(athlete, teamRunners),
    endurance: calculateEnduranceRating(athlete, teamRunners),
    winFactor: calculateWinFactorRating(athlete.raceHistory),
  };
  const classification = calculateRunnerTypeClassification(ratings);
  const winFactorPercentile = calculateWinFactorPercentile(
    athlete,
    teamRunners,
  );
  return {
    ...ratings,
    overall: calculateOverallRating(ratings, winFactorPercentile),
    runnerType: classification.runnerType,
    runnerTypeScores: classification.scores,
  };
}
