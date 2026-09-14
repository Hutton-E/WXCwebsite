import { supabase } from "./supabaseClient";

export interface NameAlias {
  alias_name: string;
  athlete_id: string;
}

export async function fetchAliasesForSeason(
  season: number,
): Promise<NameAlias[]> {
  const { data, error } = await supabase
    .from("name_aliases")
    .select("alias_name, athlete_id")
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertAlias(
  season: number,
  aliasName: string,
  athleteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("name_aliases")
    .upsert(
      { season, alias_name: aliasName, athlete_id: athleteId },
      { onConflict: "season,alias_name" },
    );

  if (error) throw new Error(error.message);
}
