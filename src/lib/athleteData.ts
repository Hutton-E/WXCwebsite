import { supabase } from "./supabaseClient";

export interface AthleteRecord {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  high_school: string | null;
  photo_url: string | null;
}

export async function fetchAthletesForSeason(
  season: number,
): Promise<AthleteRecord[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("id, season, name, team, hometown, high_school, photo_url")
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllAthletes(): Promise<AthleteRecord[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("id, season, name, team, hometown, high_school, tfrrs_id, photo_url");

  if (error) throw new Error(error.message);
  return data ?? [];
}
