#!/usr/bin/env node
/**
 * One-time baseline: recomputes every athlete's ratings as if races on or
 * after --before=YYYY-MM-DD had not happened, and stores that result in
 * previous_ratings wherever it differs from the current stored ratings.
 * Use after ratings were already recalculated without a snapshot.
 *
 * Previews by default; pass --apply to write.
 */

import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";
import { calculateAthleteAttributes } from "../src/lib/athlete_attributes.ts";

const COLUMNS = [
  "cross_country_rating",
  "indoor_rating",
  "outdoor_rating",
  "indoor_consistency_rating",
  "outdoor_consistency_rating",
  "speed_rating",
  "endurance_rating",
  "win_factor_rating",
  "overall_rating",
  "overall_rank",
  "runner_type",
  "all_american_count",
  "second_team_all_american_count",
];

const same = (a, b) => {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "string" || typeof b === "string") return a === b;
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
};

async function fetchAll(supabase, table, columns, order) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(order)
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

async function main() {
  const before = process.argv
    .find((argument) => argument.startsWith("--before="))
    ?.slice("--before=".length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before ?? "")) {
    throw new Error("Pass --before=YYYY-MM-DD (first date to exclude).");
  }
  const apply = process.argv.includes("--apply");
  const supabase = await getAuthenticatedSupabaseClient({
    requireServiceRole: true,
  });

  const rows = await fetchAll(supabase, "tfrrs_athlete_performance", "*", "tfrrs_id");
  const athleteRows = await fetchAll(
    supabase,
    "athletes",
    "tfrrs_id, team, season",
    "season",
  );
  const teamById = new Map();
  for (const row of athleteRows.reverse()) {
    if (row.tfrrs_id) teamById.set(String(row.tfrrs_id), row.team);
  }

  const runners = rows.map((row) => ({
    tfrrsId: row.tfrrs_id,
    team: teamById.get(row.tfrrs_id) ?? "unknown",
    raceHistory: (row.race_history ?? []).filter(
      (race) => !race.meet_date || race.meet_date < before,
    ),
  }));

  const old = runners.map((runner) => ({
    tfrrsId: runner.tfrrsId,
    attributes: calculateAthleteAttributes(runner, runners),
  }));
  const rankById = new Map(
    old
      .filter((entry) => entry.attributes.overallRating !== null)
      .sort((a, b) => b.attributes.overallRating - a.attributes.overallRating)
      .map((entry, index) => [entry.tfrrsId, index + 1]),
  );

  let written = 0;
  let differing = 0;
  for (const entry of old) {
    const current = rows.find((row) => row.tfrrs_id === entry.tfrrsId);
    const a = entry.attributes;
    const previous = {
      cross_country_rating: a.crossCountry,
      indoor_rating: a.indoor,
      outdoor_rating: a.outdoor,
      indoor_consistency_rating: a.indoorConsistency,
      outdoor_consistency_rating: a.outdoorConsistency,
      speed_rating: a.speed,
      endurance_rating: a.endurance,
      win_factor_rating: a.winFactor,
      overall_rating: a.overallRating,
      overall_rank: rankById.get(entry.tfrrsId) ?? null,
      runner_type: a.runnerType,
      all_american_count: a.allAmericanCount,
      second_team_all_american_count: a.secondTeamAllAmericanCount,
    };
    if (COLUMNS.every((column) => same(previous[column], current[column]))) {
      continue;
    }
    differing++;
    if (!apply) continue;
    const { error } = await supabase
      .from("tfrrs_athlete_performance")
      .update({
        previous_ratings: { ...previous, recorded_at: new Date().toISOString() },
      })
      .eq("tfrrs_id", entry.tfrrsId);
    if (error) throw new Error(`${entry.tfrrsId}: ${error.message}`);
    written++;
  }

  console.log(
    `${differing}/${rows.length} athletes differ from the pre-${before} baseline.`,
  );
  console.log(apply ? `Wrote ${written} snapshots.` : "Preview only; pass --apply to write.");
}

main().catch((error) => {
  console.error("Failed to backfill previous ratings:", error);
  process.exit(1);
});
