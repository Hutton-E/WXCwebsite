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

export interface AthletePerformanceHistory {
  tfrrsId: string;
  raceHistory: readonly AthleteRaceRecord[];
}

export interface AthleteAttributeValues {
  consistency: {
    indoor: number | null;
    outdoor: number | null;
    crossCountry: number | null;
  };
  speed: number | null;
  endurance: number | null;
  winFactor: number | null;
}

export interface ConsistencyEventAnalysis {
  event: string;
  seasonType: string | null;
  resultCount: number;
  transitionCount: number;
  firstMark: string;
  lastMark: string;
  improvementPercent: number;
  averageAbsoluteChangePercent: number;
  repeatabilityScore: number;
  progressScore: number;
  score: number;
  results: Array<{
    date: string | null;
    meet: string | null;
    mark: string;
    placing: string | null;
  }>;
}

export interface ConsistencyAnalysis {
  score: number | null;
  confidence: "insufficient" | "low" | "moderate" | "high";
  repeatedEventCount: number;
  transitionCount: number;
  observedYears: number;
  events: ConsistencyEventAnalysis[];
}

export type CrossCountryTrend = "improving" | "consistent" | "declining";

export interface CrossCountryYearAverage {
  year: number;
  raceCount: number;
  normalizedRaceCount: number;
  rawAverageSeconds: number;
  rawAverageMark: string;
  averageSeconds: number;
  averageMark: string;
}

export interface CrossCountryYearComparison {
  previousYear: number;
  year: number;
  improvementPercent: number;
  trend: CrossCountryTrend;
}

export interface CrossCountryDistanceAnalysis {
  distance: string;
  yearlyAverages: CrossCountryYearAverage[];
  comparisons: CrossCountryYearComparison[];
  trend: CrossCountryTrend | "insufficient";
  score: number | null;
}

export interface CrossCountryConsistencyAnalysis {
  score: number | null;
  trend: CrossCountryTrend | "insufficient";
  confidence: "insufficient" | "low" | "moderate" | "high";
  observedYears: number;
  repeatedDistanceCount: number;
  yearComparisonCount: number;
  improvingYears: number;
  consistentYears: number;
  decliningYears: number;
  validRaceCount: number;
  normalizedRaceCount: number;
  normalizationCoveragePercent: number;
  meetAdjustments: CrossCountryMeetAdjustment[];
  distances: CrossCountryDistanceAnalysis[];
}

export interface CrossCountryMeetAdjustment {
  year: number;
  distance: string;
  meet: string;
  meetName: string | null;
  meetDate: string | null;
  anchorCount: number;
  rawFactor: number | null;
  appliedFactor: number;
  applied: boolean;
}

const STABILITY_WEIGHT = 0.25;
const PROGRESS_WEIGHT = 0.75;
const STABILITY_PENALTY_PER_PERCENT = 10;
const PROGRESS_POINTS_PER_PERCENT = 5;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function getConfidence(
  repeatedEventCount: number,
  transitionCount: number,
  observedYears: number,
): ConsistencyAnalysis["confidence"] {
  if (repeatedEventCount === 0) return "insufficient";
  if (transitionCount >= 10 && repeatedEventCount >= 3 && observedYears >= 3) {
    return "high";
  }
  if (transitionCount >= 5 && repeatedEventCount >= 2 && observedYears >= 2) {
    return "moderate";
  }
  return "low";
}

function calculateRepeatedEventConsistency(
  raceHistory: readonly AthleteRaceRecord[],
): ConsistencyAnalysis {
  const groups = new Map<
    string,
    {
      event: string;
      seasonType: string | null;
      results: Array<{
        date: string | null;
        meet: string | null;
        mark: string;
        placing: string | null;
        seconds: number;
        originalIndex: number;
      }>;
    }
  >();

  raceHistory.forEach((race, originalIndex) => {
    if (!race.event || isRelayEvent(race.event)) return;

    const seconds = parseMarkSeconds(race.mark);
    if (seconds === null || (race.status && race.status !== "FINISHED")) return;

    const event = normalizeEvent(race.event);
    const seasonType = race.season_type?.trim().toLowerCase() || null;
    const key = `${event}|${seasonType ?? "unspecified"}`;
    const group = groups.get(key) ?? { event, seasonType, results: [] };
    group.results.push({
      date: race.meet_date,
      meet: race.meet_name ?? null,
      mark: race.mark,
      placing: race.placing ?? null,
      seconds,
      originalIndex,
    });
    groups.set(key, group);
  });

  const eventAnalyses: ConsistencyEventAnalysis[] = [];
  for (const group of groups.values()) {
    if (group.results.length < 2) continue;

    group.results.sort((first, second) => {
      if (first.date && second.date)
        return first.date.localeCompare(second.date);
      if (first.date) return -1;
      if (second.date) return 1;
      return first.originalIndex - second.originalIndex;
    });

    const changes = group.results.slice(1).map((result, index) => {
      const previousSeconds = group.results[index].seconds;
      return ((previousSeconds - result.seconds) / previousSeconds) * 100;
    });
    const improvementPercent =
      ((group.results[0].seconds - group.results.at(-1)!.seconds) /
        group.results[0].seconds) *
      100;
    const averageAbsoluteChangePercent =
      changes.reduce((sum, change) => sum + Math.abs(change), 0) /
      changes.length;
    const repeatabilityScore = clamp(
      100 - averageAbsoluteChangePercent * STABILITY_PENALTY_PER_PERCENT,
      0,
      100,
    );
    const progressScore = clamp(
      50 + improvementPercent * PROGRESS_POINTS_PER_PERCENT,
      0,
      100,
    );
    const score =
      repeatabilityScore * STABILITY_WEIGHT + progressScore * PROGRESS_WEIGHT;

    eventAnalyses.push({
      event: group.event,
      seasonType: group.seasonType,
      resultCount: group.results.length,
      transitionCount: changes.length,
      firstMark: group.results[0].mark,
      lastMark: group.results.at(-1)!.mark,
      improvementPercent: round(improvementPercent),
      averageAbsoluteChangePercent: round(averageAbsoluteChangePercent),
      repeatabilityScore: round(repeatabilityScore),
      progressScore: round(progressScore),
      score: round(score),
      results: group.results.map(({ date, meet, mark, placing }) => ({
        date,
        meet,
        mark,
        placing,
      })),
    });
  }

  eventAnalyses.sort((first, second) =>
    first.event.localeCompare(second.event),
  );
  const transitionCount = eventAnalyses.reduce(
    (sum, event) => sum + event.transitionCount,
    0,
  );
  const observedYears = new Set(
    eventAnalyses.flatMap((event) =>
      event.results.flatMap((result) => {
        const year = result.date?.match(/^(\d{4})/)?.[1];
        return year ? [year] : [];
      }),
    ),
  ).size;
  const score =
    eventAnalyses.length === 0
      ? null
      : round(
          eventAnalyses.reduce((sum, event) => sum + event.score, 0) /
            eventAnalyses.length,
        );

  return {
    score,
    confidence: getConfidence(
      eventAnalyses.length,
      transitionCount,
      observedYears,
    ),
    repeatedEventCount: eventAnalyses.length,
    transitionCount,
    observedYears,
    events: eventAnalyses,
  };
}

export function calculateConsistency(
  raceHistory: readonly AthleteRaceRecord[],
): ConsistencyAnalysis {
  return calculateRepeatedEventConsistency(
    raceHistory.filter((race) =>
      ["indoor", "outdoor"].includes(
        race.season_type?.trim().toLowerCase() ?? "",
      ),
    ),
  );
}

export function calculateTrackSeasonConsistency(
  raceHistory: readonly AthleteRaceRecord[],
  seasonType: "indoor" | "outdoor",
): ConsistencyAnalysis {
  return calculateRepeatedEventConsistency(
    raceHistory.filter(
      (race) => race.season_type?.trim().toLowerCase() === seasonType,
    ),
  );
}

function parseCrossCountryDistance(event: string): string | null {
  const normalized = normalizeEvent(event).replace(/\s/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k|km|m|meters?)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2] ?? "";
  const kilometers =
    unit.startsWith("m") || (!unit && value >= 100) ? value / 1000 : value;
  return `${Number(kilometers.toFixed(3))}k`;
}

function formatAverageMark(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainingSeconds}`;
}

function classifyCrossCountryTrend(
  improvementPercent: number,
): CrossCountryTrend {
  if (improvementPercent >= 1) return "improving";
  if (improvementPercent <= -1) return "declining";
  return "consistent";
}

function summarizeCrossCountryTrend(
  comparisons: readonly CrossCountryYearComparison[],
): CrossCountryTrend | "insufficient" {
  if (comparisons.length === 0) return "insufficient";

  const counts = { improving: 0, consistent: 0, declining: 0 };
  for (const comparison of comparisons) counts[comparison.trend]++;

  if (
    counts.consistent >= counts.improving &&
    counts.consistent >= counts.declining
  ) {
    return "consistent";
  }
  if (counts.improving > counts.declining) return "improving";
  if (counts.declining > counts.improving) return "declining";
  return "consistent";
}

function getCrossCountryConfidence(
  repeatedDistanceCount: number,
  yearComparisonCount: number,
  observedYears: number,
  normalizationCoveragePercent: number,
): CrossCountryConsistencyAnalysis["confidence"] {
  if (repeatedDistanceCount === 0) return "insufficient";
  if (
    yearComparisonCount >= 8 &&
    repeatedDistanceCount >= 2 &&
    observedYears >= 4 &&
    normalizationCoveragePercent >= 50
  ) {
    return "high";
  }
  if (
    yearComparisonCount >= 3 &&
    observedYears >= 3 &&
    normalizationCoveragePercent >= 25
  ) {
    return "moderate";
  }
  return "low";
}

interface CrossCountryRawResult {
  runnerId: string;
  year: number;
  distance: string;
  seconds: number;
  meet: string;
  meetName: string | null;
  meetDate: string;
}

interface MeetPairComparison {
  year: number;
  distance: string;
  first: CrossCountryRawResult;
  second: CrossCountryRawResult;
  ratiosByRunner: Map<string, number>;
}

type AppliedMeetFactor = CrossCountryMeetAdjustment;

function crossCountryMeetKey(race: AthleteRaceRecord, year: number): string {
  const resultUrl = race.result_url ?? "";
  const resultId =
    resultUrl.match(/\/results\/xc\/(\d+)/i)?.[1] ??
    resultUrl.match(/[?&]meet_hnd=(\d+)/i)?.[1];
  return resultId
    ? `tfrrs:${resultId}`
    : `fallback:${year}:${normalizeEvent(race.meet_name ?? "unknown-meet")}`;
}

function collectCrossCountryResults(
  runnerId: string,
  raceHistory: readonly AthleteRaceRecord[],
): CrossCountryRawResult[] {
  const results: CrossCountryRawResult[] = [];

  for (const race of raceHistory) {
    if (race.season_type?.trim().toLowerCase() !== "cross_country") continue;
    if (isRelayEvent(race.event)) continue;

    const distance = parseCrossCountryDistance(race.event);
    const year = Number(race.meet_date?.match(/^(\d{4})/)?.[1]);
    const seconds = parseMarkSeconds(race.mark);
    if (
      !distance ||
      !Number.isInteger(year) ||
      !race.meet_date ||
      seconds === null ||
      (race.status && race.status !== "FINISHED")
    ) {
      continue;
    }

    results.push({
      runnerId,
      year,
      distance,
      seconds,
      meet: crossCountryMeetKey(race, year),
      meetName: race.meet_name ?? null,
      meetDate: race.meet_date,
    });
  }

  return results;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function solveMeetFactors(
  meets: readonly string[],
  comparisons: readonly MeetPairComparison[],
): Map<string, number> {
  const factors = new Map(meets.map((meet) => [meet, 0]));

  for (let iteration = 0; iteration < 100; iteration++) {
    for (const comparison of comparisons) {
      const firstFactor = factors.get(comparison.first.meet) ?? 0;
      const secondFactor = factors.get(comparison.second.meet) ?? 0;
      const targetDifference = Math.log(
        median([...comparison.ratiosByRunner.values()]),
      );
      const correction =
        (targetDifference - (firstFactor - secondFactor)) * 0.25;
      factors.set(comparison.first.meet, firstFactor + correction);
      factors.set(comparison.second.meet, secondFactor - correction);
    }

    const center =
      [...factors.values()].reduce((sum, factor) => sum + factor, 0) /
      factors.size;
    for (const [meet, factor] of factors) factors.set(meet, factor - center);
  }

  return factors;
}

function buildCrossCountryMeetFactors(
  knownRunners: readonly AthletePerformanceHistory[],
  targetRunnerId: string,
): Map<string, AppliedMeetFactor> {
  const runnerResults = new Map<string, CrossCountryRawResult[]>();

  for (const runner of knownRunners) {
    if (runner.tfrrsId === targetRunnerId) continue;
    for (const result of collectCrossCountryResults(
      runner.tfrrsId,
      runner.raceHistory,
    )) {
      const key = `${result.runnerId}|${result.year}|${result.distance}`;
      const results = runnerResults.get(key) ?? [];
      results.push(result);
      runnerResults.set(key, results);
    }
  }

  const comparisonsByYearDistance = new Map<
    string,
    Map<string, MeetPairComparison>
  >();
  for (const [runnerKey, results] of runnerResults) {
    const [runnerId, yearText, distance] = runnerKey.split("|");
    const year = Number(yearText);
    const resultsByMeet = new Map<string, CrossCountryRawResult[]>();
    for (const result of results) {
      const meetResults = resultsByMeet.get(result.meet) ?? [];
      meetResults.push(result);
      resultsByMeet.set(result.meet, meetResults);
    }
    if (resultsByMeet.size < 2) continue;

    const meetResults = [...resultsByMeet]
      .map(([meet, meetRaces]) => ({
        meet,
        seconds: median(meetRaces.map((result) => result.seconds)),
        date: meetRaces[0].meetDate,
        result: meetRaces[0],
      }))
      .sort((first, second) => first.meet.localeCompare(second.meet));

    for (let firstIndex = 0; firstIndex < meetResults.length; firstIndex++) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < meetResults.length;
        secondIndex++
      ) {
        const first = meetResults[firstIndex];
        const second = meetResults[secondIndex];
        const daysApart =
          Math.abs(Date.parse(first.date) - Date.parse(second.date)) /
          86_400_000;
        if (daysApart > 42) continue;

        const comparisonKey = `${first.meet}|${second.meet}`;
        const groupKey = `${year}|${distance}`;
        const comparisons =
          comparisonsByYearDistance.get(groupKey) ?? new Map();
        const comparison = comparisons.get(comparisonKey) ?? {
          year,
          distance,
          first: first.result,
          second: second.result,
          ratiosByRunner: new Map<string, number>(),
        };
        comparison.ratiosByRunner.set(runnerId, first.seconds / second.seconds);
        comparisons.set(comparisonKey, comparison);
        comparisonsByYearDistance.set(groupKey, comparisons);
      }
    }
  }

  const appliedFactors = new Map<string, AppliedMeetFactor>();
  for (const comparisonsByPair of comparisonsByYearDistance.values()) {
    const comparisons = [...comparisonsByPair.values()].filter(
      (comparison) => comparison.ratiosByRunner.size >= 3,
    );
    if (comparisons.length === 0) continue;

    const meetResults = new Map<string, CrossCountryRawResult>();
    const runnersByMeet = new Map<string, Set<string>>();
    for (const comparison of comparisons) {
      meetResults.set(comparison.first.meet, comparison.first);
      meetResults.set(comparison.second.meet, comparison.second);
      for (const meet of [comparison.first.meet, comparison.second.meet]) {
        const runners = runnersByMeet.get(meet) ?? new Set<string>();
        for (const runnerId of comparison.ratiosByRunner.keys()) {
          runners.add(runnerId);
        }
        runnersByMeet.set(meet, runners);
      }
    }

    const graph = new Map<string, Set<string>>();
    for (const comparison of comparisons) {
      for (const [meet, otherMeet] of [
        [comparison.first.meet, comparison.second.meet],
        [comparison.second.meet, comparison.first.meet],
      ]) {
        const neighbors = graph.get(meet) ?? new Set<string>();
        neighbors.add(otherMeet);
        graph.set(meet, neighbors);
      }
    }

    const remainingMeets = new Set(graph.keys());
    while (remainingMeets.size > 0) {
      const start = remainingMeets.values().next().value as string;
      const component = new Set<string>();
      const queue = [start];
      while (queue.length > 0) {
        const meet = queue.pop()!;
        if (component.has(meet)) continue;
        component.add(meet);
        remainingMeets.delete(meet);
        for (const neighbor of graph.get(meet) ?? []) queue.push(neighbor);
      }
      if (component.size < 2) continue;

      const componentComparisons = comparisons.filter(
        (comparison) =>
          component.has(comparison.first.meet) &&
          component.has(comparison.second.meet),
      );
      const factors = solveMeetFactors([...component], componentComparisons);
      const centerFactor = median([...factors.values()].map(Math.exp));

      for (const meet of component) {
        const result = meetResults.get(meet)!;
        const rawFactor = Math.exp(factors.get(meet)!);
        const key = `${result.year}|${result.distance}|${meet}`;
        appliedFactors.set(key, {
          year: result.year,
          distance: result.distance,
          meet,
          meetName: result.meetName,
          meetDate: result.meetDate,
          anchorCount: runnersByMeet.get(meet)?.size ?? 0,
          rawFactor,
          appliedFactor: rawFactor / centerFactor,
          applied: true,
        });
      }
    }
  }

  return appliedFactors;
}

export function calculateCrossCountryConsistency(
  athlete: AthletePerformanceHistory,
  knownRunners: readonly AthletePerformanceHistory[] = [],
): CrossCountryConsistencyAnalysis {
  const validRaces = collectCrossCountryResults(
    athlete.tfrrsId,
    athlete.raceHistory,
  );
  const meetFactors = buildCrossCountryMeetFactors(
    knownRunners,
    athlete.tfrrsId,
  );
  const racesByDistanceAndYear = new Map<
    string,
    Map<
      number,
      Array<{ seconds: number; adjustedSeconds: number; normalized: boolean }>
    >
  >();
  const adjustmentsByMeet = new Map<string, AppliedMeetFactor>();

  for (const race of validRaces) {
    const key = `${race.year}|${race.distance}|${race.meet}`;
    const factor = meetFactors.get(key) ?? {
      year: race.year,
      distance: race.distance,
      meet: race.meet,
      meetName: race.meetName,
      meetDate: race.meetDate,
      anchorCount: 0,
      rawFactor: null,
      appliedFactor: 1,
      applied: false,
    };
    adjustmentsByMeet.set(key, factor);

    const yearGroups = racesByDistanceAndYear.get(race.distance) ?? new Map();
    const yearResults = yearGroups.get(race.year) ?? [];
    yearResults.push({
      seconds: race.seconds,
      adjustedSeconds: race.seconds / factor.appliedFactor,
      normalized: factor.applied,
    });
    yearGroups.set(race.year, yearResults);
    racesByDistanceAndYear.set(race.distance, yearGroups);
  }

  const distances: CrossCountryDistanceAnalysis[] = [];
  for (const [distance, yearGroups] of racesByDistanceAndYear) {
    const yearlyAverages = [...yearGroups]
      .sort(([firstYear], [secondYear]) => firstYear - secondYear)
      .map(([year, results]) => {
        const rawAverageSeconds =
          results.reduce((sum, result) => sum + result.seconds, 0) /
          results.length;
        const averageSeconds =
          results.reduce((sum, result) => sum + result.adjustedSeconds, 0) /
          results.length;
        return {
          year,
          raceCount: results.length,
          normalizedRaceCount: results.filter((result) => result.normalized)
            .length,
          rawAverageSeconds: round(rawAverageSeconds),
          rawAverageMark: formatAverageMark(rawAverageSeconds),
          averageSeconds: round(averageSeconds),
          averageMark: formatAverageMark(averageSeconds),
        };
      });

    const comparisons: CrossCountryYearComparison[] = yearlyAverages
      .slice(1)
      .map((currentYear, index) => {
        const previousYear = yearlyAverages[index];
        const improvementPercent =
          ((previousYear.averageSeconds - currentYear.averageSeconds) /
            previousYear.averageSeconds) *
          100;
        return {
          previousYear: previousYear.year,
          year: currentYear.year,
          improvementPercent: round(improvementPercent),
          trend: classifyCrossCountryTrend(improvementPercent),
        };
      });
    const trend = summarizeCrossCountryTrend(comparisons);

    let score: number | null = null;
    if (comparisons.length > 0) {
      const improvementPercent =
        ((yearlyAverages[0].averageSeconds -
          yearlyAverages.at(-1)!.averageSeconds) /
          yearlyAverages[0].averageSeconds) *
        100;
      const averageAbsoluteYearChangePercent =
        comparisons.reduce(
          (sum, comparison) => sum + Math.abs(comparison.improvementPercent),
          0,
        ) / comparisons.length;
      const repeatabilityScore = clamp(
        100 - averageAbsoluteYearChangePercent * STABILITY_PENALTY_PER_PERCENT,
        0,
        100,
      );
      const progressScore = clamp(
        50 + improvementPercent * PROGRESS_POINTS_PER_PERCENT,
        0,
        100,
      );
      score = round(
        repeatabilityScore * STABILITY_WEIGHT + progressScore * PROGRESS_WEIGHT,
      );
    }

    distances.push({ distance, yearlyAverages, comparisons, trend, score });
  }

  distances.sort((first, second) =>
    first.distance.localeCompare(second.distance),
  );
  const comparisons = distances.flatMap((distance) => distance.comparisons);
  const repeatedDistanceCount = distances.filter(
    (distance) => distance.comparisons.length > 0,
  ).length;
  const observedYears = new Set(
    distances.flatMap((distance) =>
      distance.yearlyAverages.map((average) => average.year),
    ),
  ).size;
  const normalizedRaceCount = validRaces.filter(
    (race) =>
      meetFactors.get(`${race.year}|${race.distance}|${race.meet}`)?.applied,
  ).length;
  const normalizationCoveragePercent =
    validRaces.length === 0
      ? 0
      : round((normalizedRaceCount / validRaces.length) * 100);
  const improvingYears = comparisons.filter(
    (item) => item.trend === "improving",
  ).length;
  const consistentYears = comparisons.filter(
    (item) => item.trend === "consistent",
  ).length;
  const decliningYears = comparisons.filter(
    (item) => item.trend === "declining",
  ).length;
  const scoredDistances = distances.filter(
    (distance): distance is CrossCountryDistanceAnalysis & { score: number } =>
      distance.score !== null,
  );

  return {
    score:
      scoredDistances.length === 0
        ? null
        : round(
            scoredDistances.reduce((sum, distance) => sum + distance.score, 0) /
              scoredDistances.length,
          ),
    trend: summarizeCrossCountryTrend(comparisons),
    confidence: getCrossCountryConfidence(
      repeatedDistanceCount,
      comparisons.length,
      observedYears,
      normalizationCoveragePercent,
    ),
    observedYears,
    repeatedDistanceCount,
    yearComparisonCount: comparisons.length,
    improvingYears,
    consistentYears,
    decliningYears,
    validRaceCount: validRaces.length,
    normalizedRaceCount,
    normalizationCoveragePercent,
    meetAdjustments: [...adjustmentsByMeet.values()].sort(
      (first, second) =>
        first.year - second.year ||
        first.distance.localeCompare(second.distance) ||
        (first.meetDate ?? "").localeCompare(second.meetDate ?? ""),
    ),
    distances,
  };
}

export function calculateAthleteAttributes(
  athlete: AthletePerformanceHistory,
  knownRunners: readonly AthletePerformanceHistory[] = [],
): AthleteAttributeValues {
  return {
    consistency: {
      indoor: calculateTrackSeasonConsistency(athlete.raceHistory, "indoor")
        .score,
      outdoor: calculateTrackSeasonConsistency(athlete.raceHistory, "outdoor")
        .score,
      crossCountry: calculateCrossCountryConsistency(athlete, knownRunners)
        .score,
    },
    speed: null,
    endurance: null,
    winFactor: null,
  };
}
