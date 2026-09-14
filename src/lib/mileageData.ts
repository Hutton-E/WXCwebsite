import { supabase } from "./supabaseClient";

export interface MileageEntry {
  week_of: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  weekly_total: string;
  notes: string;
}

export async function fetchMileageForAthlete(
  athleteId: string,
  season: number,
): Promise<MileageEntry[]> {
  const { data, error } = await supabase
    .from("mileage_entries")
    .select(
      "week_of, monday, tuesday, wednesday, thursday, friday, saturday, sunday, weekly_total, notes",
    )
    .eq("athlete_id", athleteId)
    .eq("season", season)
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
