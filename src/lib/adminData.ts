import { supabase } from "./supabaseClient";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutIntervalRow,
} from "./pdfParser";

export interface MatchedRow<T> {
  data: T;
  athleteId: string;
}

export interface TeamScopedGroupDefinition {
  groupLetter: string;
  description: string;
  team: string;
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

  const { error, count } = await supabase
    .from("mileage_entries")
    .upsert(payload, { onConflict: "athlete_id,season,week_of", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

export async function upsertWorkoutData(
  assignments: MatchedRow<WorkoutAssignment>[],
  groupDefinitions: TeamScopedGroupDefinition[],
  weekOf: string,
  day: "tuesday" | "friday",
  season: number,
) {
  // Groups are now scoped by team, since the same letter (e.g. "A") can
  // mean a completely different workout for the men's team vs. the
  // women's team on the same day.
  const groupPayload = groupDefinitions.map((g) => ({
    week_of: weekOf,
    day,
    team: g.team,
    group_letter: g.groupLetter,
    description: g.description,
  }));

  if (groupPayload.length > 0) {
    const { error: groupError } = await supabase
      .from("workout_groups")
      .upsert(groupPayload, { onConflict: "week_of,day,team,group_letter" });

    if (groupError) throw new Error(groupError.message);
  }

  const dedupedById = new Map<string, MatchedRow<WorkoutAssignment>>();
  for (const a of assignments) {
    dedupedById.set(a.athleteId, a);
  }
  const deduped = Array.from(dedupedById.values());

  const assignmentPayload = deduped.map(({ data: a, athleteId }) => ({
    athlete_id: athleteId,
    season,
    athlete_name: a.name,
    week_of: weekOf,
    day,
    group_letter: a.groupLetter,
    note: a.note,
  }));

  const { error: assignError, count } = await supabase
    .from("workout_assignments")
    .upsert(assignmentPayload, { onConflict: "athlete_id,season,week_of,day", count: "exact" });

  if (assignError) throw new Error(assignError.message);
  return count ?? assignmentPayload.length;
}

export async function upsertWorkoutIntervals(
  intervalRows: MatchedRow<WorkoutIntervalRow>[],
  weekOf: string,
  day: "tuesday" | "friday",
  season: number,
) {
  const payload: {
    athlete_id: string;
    season: number;
    athlete_name: string;
    week_of: string;
    day: string;
    interval_label: string;
    time_value: string;
  }[] = [];

  for (const { data: row, athleteId } of intervalRows) {
    for (const [label, value] of Object.entries(row.intervals)) {
      payload.push({
        athlete_id: athleteId,
        season,
        athlete_name: row.name,
        week_of: weekOf,
        day,
        interval_label: label,
        time_value: value,
      });
    }
  }

  if (payload.length === 0) return 0;

  const { error, count } = await supabase
    .from("workout_intervals")
    .upsert(payload, {
      onConflict: "athlete_id,season,week_of,day,interval_label",
      count: "exact",
    });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}