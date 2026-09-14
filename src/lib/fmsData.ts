import { supabase } from "../lib/supabaseClient";

export interface FmsExercise {
  phase: string;
  position: number;
  name: string;
  reps: string | null;
  url: string | null;
}

export interface FmsAssignment {
  category: string;
  variant: string;
}

export async function fetchFmsAssignments(
  athleteId: string,
  season: number,
): Promise<FmsAssignment[]> {
  const { data, error } = await supabase
    .from("fms_assignments")
    .select("category, variant")
    .eq("athlete_id", athleteId)
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchFmsExercises(
  category: string,
): Promise<FmsExercise[]> {
  const { data, error } = await supabase
    .from("fms_exercises")
    .select("phase, position, name, reps, url")
    .eq("category", category)
    .order("phase", { ascending: true })
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
