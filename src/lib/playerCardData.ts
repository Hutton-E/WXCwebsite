import { supabase } from "./supabaseClient";
import type { Athlete } from "../context/UserContext";
import { findTopAchievements, type AthleteRaceRecord } from "./athleteAchievements";
import {
  calculateBestWorldAthleticsPerformance,
  calculateCrossCountryRecordRating,
  calculateIndoorRecordRating,
  calculateOutdoorRecordRating,
  type AthleteRosterInfo,
} from "./athlete_attributes";

interface AthleteRow {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  high_school: string | null;
  photo_url: string | null;
  tfrrs_id: string | null;
  graduation_year: number | null;
}

interface PerformanceRow {
  tfrrs_id: string;
  race_history: AthleteRaceRecord[];
  cross_country_rating: number | null;
  indoor_rating: number | null;
  outdoor_rating: number | null;
  indoor_consistency_rating: number | null;
  outdoor_consistency_rating: number | null;
  speed_rating: number | null;
  endurance_rating: number | null;
  win_factor_rating: number | null;
  runner_type: string | null;
  overall_rating: number | null;
  overall_rank: number | null;
  all_american_count: number | null;
  second_team_all_american_count: number | null;
}

export async function fetchPlayerCards(): Promise<Athlete[]> {
  const [athletesResult, performancesResult] = await Promise.all([
    supabase
      .from("athletes")
      .select(
        "id, season, name, team, hometown, high_school, photo_url, tfrrs_id, graduation_year",
      )
      .order("season", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("tfrrs_athlete_performance")
      .select(
        "tfrrs_id, race_history, cross_country_rating, indoor_rating, outdoor_rating, indoor_consistency_rating, outdoor_consistency_rating, speed_rating, endurance_rating, win_factor_rating, runner_type, overall_rating, overall_rank, all_american_count, second_team_all_american_count",
      ),
  ]);

  if (athletesResult.error) throw new Error(athletesResult.error.message);
  if (performancesResult.error) {
    throw new Error(performancesResult.error.message);
  }

  const performanceById = new Map(
    (performancesResult.data as PerformanceRow[]).map((row) => [
      row.tfrrs_id,
      row,
    ]),
  );

  const athleteRows = athletesResult.data as AthleteRow[];
  const rowsByTfrrsId = new Map(
    athleteRows
      .filter((row) => row.tfrrs_id)
      .map((row) => [row.tfrrs_id as string, row]),
  );
  const rosterByTfrrsId = new Map<string, AthleteRosterInfo>();
  for (const performance of performancesResult.data as PerformanceRow[]) {
    const rosterRow = rowsByTfrrsId.get(performance.tfrrs_id);
    if (!rosterRow) continue;
    rosterByTfrrsId.set(performance.tfrrs_id, {
      tfrrsId: performance.tfrrs_id,
      team: rosterRow.team,
      raceHistory: performance.race_history ?? [],
    });
  }
  const teamRunners = [...rosterByTfrrsId.values()];

  return athleteRows.map((row) => {
    const performance = row.tfrrs_id
      ? performanceById.get(row.tfrrs_id)
      : undefined;
    const roster = row.tfrrs_id ? rosterByTfrrsId.get(row.tfrrs_id) : undefined;
    const crossCountryRecords = roster
      ? calculateCrossCountryRecordRating(roster, teamRunners)
      : null;
    const indoorRecords = roster
      ? calculateIndoorRecordRating(roster, teamRunners)
      : null;
    const outdoorRecords = roster
      ? calculateOutdoorRecordRating(roster, teamRunners)
      : null;

    return {
      id: row.id,
      season: row.season,
      name: row.name,
      team: row.team,
      hometown: row.hometown,
      highSchool: row.high_school,
      photoUrl: row.photo_url,
      tfrrsId: row.tfrrs_id,
      graduationYear: row.graduation_year,
      crossCountryRating: performance?.cross_country_rating ?? null,
      indoorRating: performance?.indoor_rating ?? null,
      outdoorRating: performance?.outdoor_rating ?? null,
      indoorConsistencyRating:
        performance?.indoor_consistency_rating ?? null,
      outdoorConsistencyRating:
        performance?.outdoor_consistency_rating ?? null,
      speedRating: performance?.speed_rating ?? null,
      enduranceRating: performance?.endurance_rating ?? null,
      winFactorRating: performance?.win_factor_rating ?? null,
      runnerType: performance?.runner_type ?? null,
      overallRating: performance?.overall_rating ?? null,
      overallRank: performance?.overall_rank ?? null,
      allAmericanCount: performance?.all_american_count ?? 0,
      secondTeamAllAmericanCount:
        performance?.second_team_all_american_count ?? 0,
      raceHistory: performance?.race_history ?? [],
      topAchievements: findTopAchievements(performance?.race_history ?? []),
      schoolRecords: {
        crossCountry:
          crossCountryRecords?.distances
            .filter((record) => record.recordHolderTfrrsId === row.tfrrs_id)
            .map((record) => `${record.distance} XC`) ?? [],
        indoor:
          indoorRecords?.events
            .filter((event) => event.recordHolderTfrrsId === row.tfrrs_id)
            .map((event) => event.event) ?? [],
        outdoor:
          outdoorRecords?.events
            .filter((event) => event.recordHolderTfrrsId === row.tfrrs_id)
            .map((event) => event.event) ?? [],
      },
      bestWorldAthleticsPerformance: roster
        ? calculateBestWorldAthleticsPerformance(roster)
        : null,
    };
  });
}
