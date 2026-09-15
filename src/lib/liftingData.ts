import { supabase } from "./supabaseClient";

export interface LiftingExercise {
  slot: string;
  exercise: string;
  setsReps: string | null;
  position: number;
}

export interface LiftingWeek {
  day: "wednesday" | "friday";
  weekNumber: number;
  weekDate: string;
  exercises: LiftingExercise[];
}

export interface GlossaryDetail {
  category: string;
  weekNumber: number | null;
  position: number;
  detail: string;
}

// Exercise names that link out to a rotating/static detail list.
export const GLOSSARY_LINKED_EXERCISES = new Set([
  "Hurdle Hip Mobility",
  "Dynamic Warm-Up",
  "Jump Circuit Pretzel",
  "Hanging Abs",
  "Plate Routine",
  "SB Core",
]);

// Maps the exercise label shown in the main list to its glossary category
// name (mostly identical, except "Hurdle Hip Mobility" -> "Hurdle Mobility").
export function glossaryCategoryFor(exercise: string): string | null {
  if (!GLOSSARY_LINKED_EXERCISES.has(exercise)) return null;
  return exercise === "Hurdle Hip Mobility" ? "Hurdle Mobility" : exercise;
}

export async function fetchAllLiftingWeeks(): Promise<LiftingWeek[]> {
  const { data, error } = await supabase
    .from("lifting_program")
    .select("day, week_number, week_date, slot, exercise, sets_reps, position")
    .order("week_date", { ascending: true });

  if (error) throw new Error(error.message);

  const map = new Map<string, LiftingWeek>();
  for (const row of data ?? []) {
    const key = `${row.day}-${row.week_number}`;
    if (!map.has(key)) {
      map.set(key, {
        day: row.day,
        weekNumber: row.week_number,
        weekDate: row.week_date,
        exercises: [],
      });
    }
    map.get(key)!.exercises.push({
      slot: row.slot,
      exercise: row.exercise,
      setsReps: row.sets_reps,
      position: row.position,
    });
  }

  const weeks = Array.from(map.values());
  weeks.forEach((w) => w.exercises.sort((a, b) => a.position - b.position));

  return weeks.sort((a, b) => a.weekDate.localeCompare(b.weekDate));
}

export async function fetchLiftingCore(): Promise<LiftingExercise[]> {
  const { data, error } = await supabase
    .from("lifting_core")
    .select("exercise, sets_reps");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r, i) => ({
    slot: "",
    exercise: r.exercise,
    setsReps: r.sets_reps,
    position: i,
  }));
}

export async function fetchGlossaryDetail(
  category: string,
  weekNumber: number,
): Promise<GlossaryDetail[]> {
  // Week-varying categories: try the exact week; if the program's rotation
  // is shorter than the season (e.g. a 4-week cycle repeating), fall back
  // to (weekNumber - 1) % cycleLength.
  const { data: allForCategory, error } = await supabase
    .from("lifting_glossary")
    .select("category, week_number, position, detail")
    .eq("category", category)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  if (!allForCategory || allForCategory.length === 0) return [];

  const isStatic = allForCategory.every((r) => r.week_number === null);
  if (isStatic) {
    return allForCategory.map((r) => ({
      category: r.category,
      weekNumber: null,
      position: r.position,
      detail: r.detail,
    }));
  }

  const cycleLength = allForCategory.length;
  const targetWeek = ((weekNumber - 1) % cycleLength) + 1;
  const match = allForCategory.find((r) => r.week_number === targetWeek);

  return match
    ? [
        {
          category: match.category,
          weekNumber: match.week_number,
          position: match.position,
          detail: match.detail,
        },
      ]
    : [];
}
