#!/usr/bin/env node
/**
 * Calculates season-specific consistency scores from stored TFRRS histories.
 * Only the three consistency columns are updated; raw races, PRs, legacy
 * consistency_rating, and public.athletes are not modified.
 *
 * Apply supabase/athlete_consistency_scores.sql first.
 */

import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";
import { calculateAthleteAttributes } from "../src/lib/athlete_attributes.ts";

const PAGE_SIZE = 500;
const UPDATE_BATCH_SIZE = 12;

async function fetchPerformanceRows(supabase) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tfrrs_athlete_performance")
      .select("tfrrs_id, athlete_name, race_history")
      .order("tfrrs_id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function formatScore(score) {
  return score === null ? "n/a" : score.toFixed(1);
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const dryRun = process.argv.includes("--dry-run");
  const requestedTfrrsId = process.argv
    .find((argument) => argument.startsWith("--tfrrs-id="))
    ?.slice("--tfrrs-id=".length);

  const rows = await fetchPerformanceRows(supabase);
  if (rows.length === 0) {
    throw new Error("No TFRRS athlete performance rows found.");
  }

  const knownRunners = rows.map((row) => ({
    tfrrsId: row.tfrrs_id,
    raceHistory: row.race_history ?? [],
  }));
  const selectedRows = requestedTfrrsId
    ? rows.filter((row) => row.tfrrs_id === requestedTfrrsId)
    : rows;

  if (selectedRows.length === 0) {
    throw new Error(`No TFRRS performance row for ID ${requestedTfrrsId}.`);
  }

  console.log(
    `Calculating season consistency for ${selectedRows.length} athlete(s) using ${knownRunners.length} known runner histories.`,
  );

  const calculatedRows = selectedRows.map((row) => {
    const athlete = {
      tfrrsId: row.tfrrs_id,
      raceHistory: row.race_history ?? [],
    };
    return {
      tfrrsId: row.tfrrs_id,
      athleteName: row.athlete_name,
      consistency: calculateAthleteAttributes(athlete, knownRunners).consistency,
    };
  });

  const scoresAvailable = calculatedRows.reduce(
    (counts, row) => {
      if (row.consistency.indoor !== null) counts.indoor++;
      if (row.consistency.outdoor !== null) counts.outdoor++;
      if (row.consistency.crossCountry !== null) counts.crossCountry++;
      return counts;
    },
    { indoor: 0, outdoor: 0, crossCountry: 0 },
  );

  for (const row of calculatedRows.slice(0, 5)) {
    console.log(
      `  ${row.athleteName}: indoor ${formatScore(row.consistency.indoor)}, outdoor ${formatScore(row.consistency.outdoor)}, XC ${formatScore(row.consistency.crossCountry)}`,
    );
  }
  console.log(
    `Scores available: indoor ${scoresAvailable.indoor}, outdoor ${scoresAvailable.outdoor}, XC ${scoresAvailable.crossCountry}.`,
  );

  if (dryRun) {
    console.log("Dry run complete; Supabase was not changed.");
    return;
  }

  let updated = 0;
  for (
    let index = 0;
    index < calculatedRows.length;
    index += UPDATE_BATCH_SIZE
  ) {
    const batch = calculatedRows.slice(index, index + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        const { data, error } = await supabase
          .from("tfrrs_athlete_performance")
          .update({
            indoor_consistency_rating: row.consistency.indoor,
            outdoor_consistency_rating: row.consistency.outdoor,
            cross_country_consistency_rating: row.consistency.crossCountry,
          })
          .eq("tfrrs_id", row.tfrrsId)
          .select("tfrrs_id");

        if (error) throw new Error(`${row.tfrrsId}: ${error.message}`);
        if (data?.length !== 1) {
          throw new Error(`${row.tfrrsId}: expected one row to be updated.`);
        }
        return data.length;
      }),
    );
    updated += results.reduce((sum, count) => sum + count, 0);
    console.log(`Updated ${updated}/${calculatedRows.length} rows.`);
  }

  console.log(`Updated only the three season consistency columns on ${updated} rows.`);
}

main().catch((error) => {
  console.error("Failed to calculate athlete consistency:", error);
  process.exit(1);
});