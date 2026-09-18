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

const IN_SEASON_CORE_EXERCISES = new Set([
  "Butterfly Stretch",
  "Eagle Stretch",
  "Penguins",
  "Dead bug",
  "Side Plank R",
  "Side Plank L",
  "Scorpions",
  "Clams",
  "Donkey Kick",
  "UDIs",
  "Pigeon L",
  "Pigeon R",
  "Cobra Stretch",
  "Extended Child's Pose",
]);

export async function fetchCoreRoutine(): Promise<CoreRoutine> {
  const [introResult, exercisesResult, liftingCoreResult] = await Promise.all([
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
    supabase
      .from("lifting_core")
      .select("exercise, sets_reps"),
  ]);

  if (introResult.error) throw new Error(introResult.error.message);
  if (exercisesResult.error) throw new Error(exercisesResult.error.message);
  if (liftingCoreResult.error) throw new Error(liftingCoreResult.error.message);

  const rows = exercisesResult.data ?? [];
  const dayMap = new Map<string, DayRoutine>();

  for (const row of rows as CoreExerciseRow[]) {
    if (!dayMap.has(row.day)) {
      dayMap.set(row.day, { note: row.day_note, exercises: [] });
    }
    dayMap.get(row.day)!.exercises.push({ name: row.name, url: row.url });
  }

  const liftingRows = liftingCoreResult.data ?? [];
  const inSeasonRows = liftingRows.filter(
    (row) => IN_SEASON_CORE_EXERCISES.has(row.exercise),
  );

  if (inSeasonRows.length > 0) {
    dayMap.set("Friday In-Season", {
      note: "Core included in Friday lifting supersets",
      exercises: inSeasonRows.map((row) => ({
        name: row.sets_reps
          ? `${row.exercise} — ${row.sets_reps}`
          : row.exercise,
        url: null,
      })),
    });
  }

  return {
    intro: introResult.data?.value ?? "",
    days: Array.from(dayMap.entries()).map(([day, routine]) => ({
      day,
      routine,
    })),
  };
}
