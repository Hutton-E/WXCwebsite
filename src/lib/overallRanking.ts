export interface OverallRankingRatings {
  crossCountryRating: number | null;
  indoorRating: number | null;
  outdoorRating: number | null;
  speedRating: number | null;
  enduranceRating: number | null;
  winFactorRating: number | null;
}

export interface OverallRankingAthlete {
  id: string;
  ratings: OverallRankingRatings;
}

const SEASON_WEIGHT = 0.6;
const PHYSICAL_WEIGHT = 0.3;
const WIN_FACTOR_WEIGHT = 0.1;

function average(values: (number | null)[]): number | null {
  const available = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (available.length === 0) return null;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
}

function calculateOverallScore(
  ratings: OverallRankingRatings,
  winFactorPercentile: number | null,
): number | null {
  const seasonAverage = average([
    ratings.crossCountryRating,
    ratings.indoorRating,
    ratings.outdoorRating,
  ]);
  const physicalAverage = average([
    ratings.speedRating,
    ratings.enduranceRating,
  ]);
  const weightedScores = [
    [seasonAverage, SEASON_WEIGHT],
    [physicalAverage, PHYSICAL_WEIGHT],
    [winFactorPercentile, WIN_FACTOR_WEIGHT],
  ] as const;
  const availableScores = weightedScores.filter(
    (entry): entry is readonly [number, number] => entry[0] !== null,
  );
  if (availableScores.length === 0) return null;

  const availableWeight = availableScores.reduce(
    (sum, [, weight]) => sum + weight,
    0,
  );
  return (
    availableScores.reduce(
      (sum, [score, weight]) => sum + score * weight,
      0,
    ) / availableWeight
  );
}

function calculateWinFactorPercentiles(
  athletes: OverallRankingAthlete[],
): Map<string, number> {
  const ratedAthletes = athletes
    .filter(
      (athlete) =>
        athlete.ratings.winFactorRating !== null &&
        Number.isFinite(athlete.ratings.winFactorRating),
    )
    .sort(
      (first, second) =>
        first.ratings.winFactorRating! - second.ratings.winFactorRating!,
    );
  const percentiles = new Map<string, number>();

  for (let start = 0; start < ratedAthletes.length; ) {
    let end = start + 1;
    while (
      end < ratedAthletes.length &&
      ratedAthletes[end].ratings.winFactorRating ===
        ratedAthletes[start].ratings.winFactorRating
    ) {
      end++;
    }

    const midpointRank = (start + end - 1) / 2;
    const percentile =
      ratedAthletes.length === 1
        ? 50
        : (midpointRank / (ratedAthletes.length - 1)) * 100;
    for (let index = start; index < end; index++) {
      percentiles.set(ratedAthletes[index].id, percentile);
    }
    start = end;
  }

  return percentiles;
}

export function calculateOverallRanks(
  athletes: OverallRankingAthlete[],
): Map<string, number> {
  const winFactorPercentiles = calculateWinFactorPercentiles(athletes);
  const scoredAthletes = athletes
    .map((athlete) => ({
      id: athlete.id,
      score: calculateOverallScore(
        athlete.ratings,
        winFactorPercentiles.get(athlete.id) ?? null,
      ),
    }))
    .filter(
      (athlete): athlete is { id: string; score: number } =>
        athlete.score !== null,
    )
    .sort((first, second) => second.score - first.score);
  const ranks = new Map<string, number>();
  let rank = 0;

  for (let index = 0; index < scoredAthletes.length; index++) {
    if (
      index === 0 ||
      scoredAthletes[index].score !== scoredAthletes[index - 1].score
    ) {
      rank = index + 1;
    }
    ranks.set(scoredAthletes[index].id, rank);
  }

  return ranks;
}
