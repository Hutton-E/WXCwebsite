import { supabase } from "./supabaseClient";

export type CrossCountryGender = "men" | "women";

export interface CrossCountryMeet {
  id: string;
  season: number;
  gender: CrossCountryGender;
  meet_name: string;
  meet_date: string;
  meet_time: string | null;
  location: string | null;
  result_summary: string | null;
  status: string;
  meet_url: string | null;
  recap_url: string | null;
  schedule_url: string;
  athleteResult?: CrossCountryResult;
}

export interface CrossCountryResult {
  meet_id: string;
  athlete_id: string;
  season: number;
  place: string | null;
  time: string | null;
  result_url: string | null;
}

export async function fetchCrossCountryMeets(
  seasons: number[],
  athleteId: string,
  gender: CrossCountryGender,
): Promise<CrossCountryMeet[]> {
  if (seasons.length === 0) return [];

  const [meetsResult, resultsResult] = await Promise.all([
    supabase
      .from("cross_country_meets")
      .select(
        "id, season, gender, meet_name, meet_date, meet_time, location, result_summary, status, meet_url, recap_url, schedule_url",
      )
      .in("season", seasons)
      .eq("gender", gender)
      .order("meet_date", { ascending: true })
      .order("gender", { ascending: true }),
    supabase
      .from("cross_country_results")
      .select("meet_id, athlete_id, season, place, time, result_url")
      .eq("athlete_id", athleteId)
      .in("season", seasons),
  ]);

  if (meetsResult.error) throw new Error(meetsResult.error.message);
  if (resultsResult.error) throw new Error(resultsResult.error.message);

  const resultsByMeet = new Map(
    (resultsResult.data ?? []).map((result) => [result.meet_id, result]),
  );

  return (meetsResult.data ?? []).map((meet) => ({
    ...(meet as CrossCountryMeet),
    athleteResult: resultsByMeet.get(meet.id),
  }));
}

/*
 * Keep the query shape centralized so the schedule page can display the
 * selected athlete's result beside the corresponding meet.
 */
export async function fetchPublicCrossCountryMeets(
  season: number,
): Promise<CrossCountryMeet[]> {
  const { data, error } = await supabase
    .from("cross_country_meets")
    .select(
      "id, season, gender, meet_name, meet_date, meet_time, location, result_summary, status, meet_url, recap_url, schedule_url",
    )
    .eq("season", season)
    .order("meet_date", { ascending: true })
    .order("gender", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CrossCountryMeet[];
}
