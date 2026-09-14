import { supabase } from "./supabaseClient";

export interface WorkoutAssignmentRow {
  week_of: string;
  day: string;
  group_letter: string;
}

export interface WorkoutGroupRow {
  week_of: string;
  day: string;
  group_letter: string;
  description: string;
}

export interface WorkoutForDay {
  weekOf: string;
  day: string;
  groupLetter: string;
  description: string | null;
}

export interface WorkoutIntervalEntry {
  week_of: string;
  day: string;
  interval_label: string;
  time_value: string;
}

export async function fetchWorkoutsForAthlete(
  athleteName: string,
): Promise<WorkoutForDay[]> {
  const { data: assignments, error: assignError } = await supabase
    .from("workout_assignments")
    .select("week_of, day, group_letter")
    .eq("athlete_name", athleteName)
    .order("week_of", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Fetch every group definition for the specific (week, day) pairs this
  // athlete has assignments for, then join them together client-side.
  const weeksOf = [...new Set(assignments.map((a) => a.week_of))];

  const { data: groups, error: groupError } = await supabase
    .from("workout_groups")
    .select("week_of, day, group_letter, description")
    .in("week_of", weeksOf);

  if (groupError) throw new Error(groupError.message);

  const groupLookup = new Map<string, string>();
  (groups ?? []).forEach((g: WorkoutGroupRow) => {
    groupLookup.set(`${g.week_of}|${g.day}|${g.group_letter}`, g.description);
  });

  return assignments.map((a: WorkoutAssignmentRow) => ({
    weekOf: a.week_of,
    day: a.day,
    groupLetter: a.group_letter,
    description:
      groupLookup.get(`${a.week_of}|${a.day}|${a.group_letter}`) ?? null,
  }));
}

export async function fetchIntervalsForAthlete(
  athleteName: string,
): Promise<WorkoutIntervalEntry[]> {
  const { data, error } = await supabase
    .from("workout_intervals")
    .select("week_of, day, interval_label, time_value")
    .eq("athlete_name", athleteName)
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
