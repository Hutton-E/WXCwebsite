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
  groupLetter: string | null;
  description: string | null;
  intervals: Record<string, string> | null;
  note: string | null;
}

export async function fetchWorkoutsForAthlete(
  athleteId: string,
  season: number,
  team: string,
): Promise<WorkoutDay[]> {
  const { data: rows, error } = await supabase
    .from("workouts")
    .select("week_of, day, group_letter, intervals, note")
    .eq("athlete_id", athleteId)
    .eq("season", season)
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
    groupLetter: r.group_letter,
    description: r.group_letter
      ? groupLookup.get(`${r.week_of}|${r.day}|${r.group_letter}`) ?? null
      : null,
    intervals: r.intervals,
    note: r.note,
  }));
}