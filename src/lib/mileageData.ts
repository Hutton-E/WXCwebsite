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

export interface TeamMileageEntry extends MileageEntry {
  athleteId: string;
  athleteName: string;
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

export async function fetchMileageForTeamWeek(
  team: string,
  season: number,
  weekOf: string,
  preview = false,
): Promise<TeamMileageEntry[]> {
  let query = supabase
    .from("mileage_entries")
    .select(
      "athlete_id, athlete_name, week_of, monday, tuesday, wednesday, thursday, friday, saturday, sunday, weekly_total, notes",
    )
    .eq("team", team)
    .eq("season", season)
    .eq("week_of", weekOf);

  if (!preview) {
    query = query.eq("is_draft", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((entry) => ({
    athleteId: entry.athlete_id,
    athleteName: entry.athlete_name,
    week_of: entry.week_of,
    monday: entry.monday,
    tuesday: entry.tuesday,
    wednesday: entry.wednesday,
    thursday: entry.thursday,
    friday: entry.friday,
    saturday: entry.saturday,
    sunday: entry.sunday,
    weekly_total: entry.weekly_total,
    notes: entry.notes,
  }));
}