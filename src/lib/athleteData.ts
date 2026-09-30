import { supabase } from "./supabaseClient";

export interface AthleteRecord {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  high_school: string | null;
  tfrrs_id?: string | null;
  photo_url: string | null;
}

function normalizeAthleteName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchAthletesForSeason(
  season: number,
): Promise<AthleteRecord[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("id, season, name, team, hometown, high_school, tfrrs_id, photo_url")
    .eq("season", season);

  if (error) throw new Error(error.message);
  const athletes = data ?? [];
  const missingPhoto = athletes.some((athlete) => !athlete.photo_url);
  if (!missingPhoto) return athletes;

  const { data: historicalRows, error: historicalPhotoError } = await supabase
    .from("athletes")
    .select("name, team, season, tfrrs_id, photo_url")
    .lt("season", season)
    .not("photo_url", "is", null)
    .order("season", { ascending: false });

  if (historicalPhotoError) throw new Error(historicalPhotoError.message);

  return athletes.map((athlete) => {
    if (athlete.photo_url) return athlete;

    const normalizedName = normalizeAthleteName(athlete.name);
    const historicalPhoto = (historicalRows ?? []).find(
      (row) =>
        (athlete.tfrrs_id &&
          row.tfrrs_id &&
          athlete.tfrrs_id === row.tfrrs_id) ||
        (row.team === athlete.team &&
          normalizeAthleteName(row.name) === normalizedName),
    );

    return {
      ...athlete,
      photo_url: historicalPhoto?.photo_url ?? null,
    };
  });
}

export async function fetchAllAthletes(): Promise<AthleteRecord[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("id, season, name, team, hometown, high_school, tfrrs_id, photo_url");

  if (error) throw new Error(error.message);
  return data ?? [];
}
