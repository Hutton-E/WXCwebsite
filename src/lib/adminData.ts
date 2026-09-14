import { supabase } from "./supabaseClient";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
  WorkoutIntervalRow,
} from "./pdfParser";

export async function upsertMileageRows(rows: MileageRow[], weekOf: string) {
  // Defensive dedupe: if two parsed rows somehow share a name, keep the last
  // one rather than sending Postgres a batch with a duplicate conflict key.
  const dedupedByName = new Map<string, MileageRow>();
  for (const row of rows) {
    dedupedByName.set(row.name, row);
  }
  const deduped = Array.from(dedupedByName.values());

  const payload = deduped.map((r) => ({
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
    .upsert(payload, { onConflict: "athlete_name,week_of", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

export async function upsertWorkoutData(
  assignments: WorkoutAssignment[],
  groupDefinitions: WorkoutGroupDefinition[],
  weekOf: string,
  day: "tuesday" | "friday",
) {
  const groupPayload = groupDefinitions.map((g) => ({
    week_of: weekOf,
    day,
    group_letter: g.groupLetter,
    description: g.description,
  }));

  const { error: groupError } = await supabase
    .from("workout_groups")
    .upsert(groupPayload, { onConflict: "week_of,day,group_letter" });

  if (groupError) throw new Error(groupError.message);

  // Defensive dedupe — protects against duplicate
  // (athlete_name, week_of, day) keys in a single batch.
  const dedupedByName = new Map<string, WorkoutAssignment>();
  for (const a of assignments) {
    dedupedByName.set(a.name, a);
  }
  const dedupedAssignments = Array.from(dedupedByName.values());

  const assignmentPayload = dedupedAssignments.map((a) => ({
    athlete_name: a.name,
    week_of: weekOf,
    day,
    group_letter: a.groupLetter,
  }));

  const { error: assignError, count } = await supabase
    .from("workout_assignments")
    .upsert(assignmentPayload, {
      onConflict: "athlete_name,week_of,day",
      count: "exact",
    });

  if (assignError) throw new Error(assignError.message);
  return count ?? assignmentPayload.length;
}

export async function upsertWorkoutIntervals(
  intervalRows: WorkoutIntervalRow[],
  weekOf: string,
  day: "tuesday" | "friday",
) {
  const payload: {
    athlete_name: string;
    week_of: string;
    day: string;
    interval_label: string;
    time_value: string;
  }[] = [];

  for (const row of intervalRows) {
    for (const [label, value] of Object.entries(row.intervals)) {
      payload.push({
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
      onConflict: "athlete_name,week_of,day,interval_label",
      count: "exact",
    });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}
