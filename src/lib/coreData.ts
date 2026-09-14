import { supabase } from "./supabaseClient";

export interface CoreExerciseRow {
  day: string;
  day_order: number;
  day_note: string | null;
  position: number;
  name: string;
  url: string | null;
}

export interface DayRoutine {
  note: string | null;
  exercises: { name: string; url: string | null }[];
}

export interface CoreRoutine {
  intro: string;
  days: { day: string; routine: DayRoutine }[];
}

export async function fetchCoreRoutine(): Promise<CoreRoutine> {
  const [introResult, exercisesResult] = await Promise.all([
    supabase
      .from("site_content")
      .select("value")
      .eq("key", "core_intro")
      .maybeSingle(),
    supabase
      .from("core_exercises")
      .select("day, day_order, day_note, position, name, url")
      .order("day_order", { ascending: true })
      .order("position", { ascending: true }),
  ]);

  if (introResult.error) throw new Error(introResult.error.message);
  if (exercisesResult.error) throw new Error(exercisesResult.error.message);

  const rows = exercisesResult.data ?? [];
  const dayMap = new Map<string, DayRoutine>();

  for (const row of rows as CoreExerciseRow[]) {
    if (!dayMap.has(row.day)) {
      dayMap.set(row.day, { note: row.day_note, exercises: [] });
    }
    dayMap.get(row.day)!.exercises.push({ name: row.name, url: row.url });
  }

  return {
    intro: introResult.data?.value ?? "",
    days: Array.from(dayMap.entries()).map(([day, routine]) => ({
      day,
      routine,
    })),
  };
}
