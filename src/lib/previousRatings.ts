import type { PreviousValues } from "../context/UserContext";

// Change highlights are only shown for this long after ratings are recalculated.
export const PREVIOUS_RATINGS_VISIBLE_MS = 3 * 24 * 60 * 60 * 1000;

export function parsePreviousRatings(
  raw: Record<string, number | string | null> | null | undefined,
): PreviousValues | null {
  if (!raw) return null;
  const recordedAt = Date.parse(String(raw.recorded_at ?? ""));
  if (
    Number.isNaN(recordedAt) ||
    Date.now() - recordedAt > PREVIOUS_RATINGS_VISIBLE_MS
  ) {
    return null;
  }
  const num = (key: string) => {
    const value = raw[key];
    return value === null || value === undefined ? null : Number(value);
  };
  return {
    crossCountryRating: num("cross_country_rating"),
    indoorRating: num("indoor_rating"),
    outdoorRating: num("outdoor_rating"),
    indoorConsistencyRating: num("indoor_consistency_rating"),
    outdoorConsistencyRating: num("outdoor_consistency_rating"),
    speedRating: num("speed_rating"),
    enduranceRating: num("endurance_rating"),
    winFactorRating: num("win_factor_rating"),
    overallRating: num("overall_rating"),
    overallRank: num("overall_rank"),
    allAmericanCount: num("all_american_count"),
    secondTeamAllAmericanCount: num("second_team_all_american_count"),
    runnerType: (raw.runner_type as string | null) ?? null,
  };
}
