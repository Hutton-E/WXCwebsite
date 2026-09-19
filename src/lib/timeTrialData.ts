import { supabase } from "./supabaseClient";

export interface TimeTrialResult {
  id: string;
  trial_name: string;
  result_time: string;
  year_label: string;
  season: number;
  athlete_name: string;
  position: number | null;
  source_block: number;
  details: Record<string, string>;
}

export async function fetchTimeTrialResults(
  athleteName: string,
): Promise<TimeTrialResult[]> {
  const { data: athletes, error: athleteError } = await supabase
    .from("athletes")
    .select("id")
    .eq("name", athleteName);

  if (athleteError) throw new Error(athleteError.message);
  const athleteIds = (athletes ?? []).map((athlete) => athlete.id);
  if (athleteIds.length === 0) return [];

  const { data, error } = await supabase
    .from("time_trial_results")
    .select(
      "id, trial_name, result_time, year_label, season, athlete_name, position, source_block, details",
    )
    .in("athlete_id", athleteIds)
    .order("season", { ascending: false })
    .order("trial_name")
    .order("result_time");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTimeTrialRace(
  trialName: string,
  yearLabel: string,
  sourceBlock: number,
): Promise<TimeTrialResult[]> {
  const { data, error } = await supabase
    .from("time_trial_results")
    .select(
      "id, trial_name, result_time, year_label, season, athlete_name, position, source_block, details",
    )
    .eq("trial_name", trialName)
    .eq("year_label", yearLabel)
    .eq("source_block", sourceBlock)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
