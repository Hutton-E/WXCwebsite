import { supabase } from "./supabaseClient";
import type { MileageRow, WorkoutRow } from "./pdfParser";

export interface MatchedRow<T> {
  data: T;
  athleteId: string;
}

export interface TeamScopedGroupDefinition {
  groupLetter: string;
  description: string;
  team: string;
}

const SAVE_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s — check your connection and try again.`)),
        ms,
      ),
    ),
  ]);
}

export async function upsertMileageRows(
  rows: MatchedRow<MileageRow>[],
  weekOf: string,
  season: number,
) {
  const dedupedById = new Map<string, MatchedRow<MileageRow>>();
  for (const row of rows) {
    dedupedById.set(row.athleteId, row);
  }
  const deduped = Array.from(dedupedById.values());

  const payload = deduped.map(({ data: r, athleteId }) => ({
    athlete_id: athleteId,
    season,
    athlete_name: r.name,
    team: r.team,
    week_of: weekOf,
    monday: r.monday,
    tuesday: r.tuesday,
    wednesday: r.wednesday,
    thursday: r.thursday,
    friday: r.friday,
    saturday: r.saturday,
    sunday: r.sunday,
    weekly_total: r.weeklyTotal,
    notes: r.notes,
  }));

  const { error, count } = await withTimeout(
    supabase
      .from("mileage_entries")
      .upsert(payload, { onConflict: "athlete_id,season,week_of", count: "exact" }),
    SAVE_TIMEOUT_MS,
    "Mileage save",
  );

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

export async function upsertWorkoutData(
  workoutRows: MatchedRow<WorkoutRow>[],
  groupDefinitions: TeamScopedGroupDefinition[],
  weekOf: string,
  day: "tuesday" | "friday",
  season: number,
) {
  const groupPayload = groupDefinitions.map((g) => ({
    week_of: weekOf,
    day,
    team: g.team,
    group_letter: g.groupLetter,
    description: g.description,
  }));

  if (groupPayload.length > 0) {
    const { error: groupError } = await withTimeout(
      supabase
        .from("workout_groups")
        .upsert(groupPayload, { onConflict: "week_of,day,team,group_letter" }),
      SAVE_TIMEOUT_MS,
      "Workout group definitions save",
    );

    if (groupError) throw new Error(groupError.message);
  }

  const dedupedById = new Map<string, MatchedRow<WorkoutRow>>();
  for (const r of workoutRows) {
    dedupedById.set(r.athleteId, r);
  }
  const deduped = Array.from(dedupedById.values());

  const payload = deduped.map(({ data: r, athleteId }) => ({
    athlete_id: athleteId,
    season,
    athlete_name: r.name,
    week_of: weekOf,
    day,
    // Guard against ever writing an empty string — falsy checks in the
    // UI expect either a real letter or null, never "".
    group_letter: r.groupLetter || null,
    intervals: Object.keys(r.intervals).length > 0 ? r.intervals : null,
    note: r.note,
  }));

  const { error, count } = await withTimeout(
    supabase
      .from("workouts")
      .upsert(payload, { onConflict: "athlete_id,season,week_of,day", count: "exact" }),
    SAVE_TIMEOUT_MS,
    "Workouts save",
  );

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}