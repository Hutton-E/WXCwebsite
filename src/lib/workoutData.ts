import { supabase } from "./supabaseClient";

export interface WorkoutGroupRow {
  week_of: string;
  day: string;
  group_letter: string;
  description: string;
}

export interface WorkoutDay {
  weekOf: string;
  day: string;
  season: number;
  groupLetter: string | null;
  description: string | null;
  intervals: Record<string, string> | null;
  note: string | null;
}

// Queries by NAME, not by the season-scoped athlete_id — a real person's
// id changes every season (go-knights reissues roster ids yearly), but
// their name stays constant, so this is what actually surfaces every
// historical record for them regardless of which season they're
// currently logged in as.
export async function fetchWorkoutsForAthlete(
  athleteName: string,
  team: string,
): Promise<WorkoutDay[]> {
  const { data: rows, error } = await supabase
    .from("workouts")
    .select("week_of, day, season, group_letter, intervals, note")
    .ilike("athlete_name", athleteName)
    .order("season", { ascending: false })
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const weeksOf = [...new Set(rows.map((r) => r.week_of))];
  const letters = [...new Set(rows.map((r) => r.group_letter).filter(Boolean))];

  let groupLookup = new Map<string, string>();
  if (letters.length > 0) {
    const { data: groups, error: groupError } = await supabase
      .from("workout_groups")
      .select("week_of, day, group_letter, description")
      .eq("team", team)
      .in("week_of", weeksOf);

    if (groupError) throw new Error(groupError.message);

    groupLookup = new Map(
      (groups ?? []).map((g: WorkoutGroupRow) => [
        `${g.week_of}|${g.day}|${g.group_letter}`,
        g.description,
      ]),
    );
  }

  return rows.map((r) => ({
    weekOf: r.week_of,
    day: r.day,
    season: r.season,
    groupLetter: r.group_letter,
    description: r.group_letter
      ? (groupLookup.get(`${r.week_of}|${r.day}|${r.group_letter}`) ?? null)
      : null,
    intervals: r.intervals,
    note: r.note,
  }));
}
