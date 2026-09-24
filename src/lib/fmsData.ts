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

export interface FmsTeamAssignment extends FmsAssignment {
  athleteId: string;
  athleteName: string;
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

export async function fetchFmsAssignmentsForTeam(
  team: string,
  season: number,
): Promise<FmsTeamAssignment[]> {
  const { data: assignments, error: assignmentError } = await supabase
    .from("fms_assignments")
    .select("athlete_id, category, variant")
    .eq("season", season);

  if (assignmentError) throw new Error(assignmentError.message);
  if (!assignments || assignments.length === 0) return [];

  const athleteIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.athlete_id)
        .filter((athleteId): athleteId is string => Boolean(athleteId)),
    ),
  ];

  if (athleteIds.length === 0) return [];

  const { data: athletes, error: athleteError } = await supabase
    .from("athletes")
    .select("id, name")
    .eq("season", season)
    .eq("team", team)
    .in("id", athleteIds);

  if (athleteError) throw new Error(athleteError.message);

  const namesById = new Map(
    (athletes ?? []).map((athlete) => [athlete.id, athlete.name]),
  );

  return assignments
    .filter((assignment) => namesById.has(assignment.athlete_id))
    .map((assignment) => ({
      athleteId: assignment.athlete_id,
      athleteName: namesById.get(assignment.athlete_id)!,
      category: assignment.category,
      variant: assignment.variant,
    }));
}
