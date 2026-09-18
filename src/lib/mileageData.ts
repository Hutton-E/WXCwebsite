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
  preview = false,
): Promise<MileageEntry[]> {
  let query = supabase
    .from("mileage_entries")
    .select(
      "week_of, monday, tuesday, wednesday, thursday, friday, saturday, sunday, weekly_total, notes",
    )
    .eq("athlete_id", athleteId)
    .eq("season", season)
    .order("week_of", { ascending: false });

  if (!preview) {
    query = query.eq("is_draft", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}