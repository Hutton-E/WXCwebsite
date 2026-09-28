#!/usr/bin/env node
/**
 * Calculates the cross country and indoor school-record ratings from stored
 * TFRRS histories and writes them to tfrrs_athlete_performance's
 * cross_country_rating and indoor_rating columns. outdoor_rating is not
 * computed yet and is left alone. Only those two columns are updated; raw
 * races, PRs, and public.athletes are not modified.
 *
 * Apply supabase/athlete_record_ratings.sql first.
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

async function fetchTeamByTfrrsId(supabase) {
  const teamByTfrrsId = new Map();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("athletes")
      .select("tfrrs_id, team, season")
      .not("tfrrs_id", "is", null)
      .order("season", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const tfrrsId = String(row.tfrrs_id);
      // Rows are ordered by season desc, so the first team seen per athlete
      // is their most recent roster team.
      if (!teamByTfrrsId.has(tfrrsId)) teamByTfrrsId.set(tfrrsId, row.team);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return teamByTfrrsId;
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

  const [rows, teamByTfrrsId] = await Promise.all([
    fetchPerformanceRows(supabase),
    fetchTeamByTfrrsId(supabase),
  ]);
  if (rows.length === 0) {
    throw new Error("No TFRRS athlete performance rows found.");
  }

  const teamRunners = rows.map((row) => ({
    tfrrsId: row.tfrrs_id,
    team: teamByTfrrsId.get(row.tfrrs_id) ?? "unknown",
    raceHistory: row.race_history ?? [],
  }));
  const selectedRows = requestedTfrrsId
    ? rows.filter((row) => row.tfrrs_id === requestedTfrrsId)
    : rows;

  if (selectedRows.length === 0) {
    throw new Error(`No TFRRS performance row for ID ${requestedTfrrsId}.`);
  }

  console.log(
    `Calculating cross country and indoor ratings for ${selectedRows.length} athlete(s) using ${teamRunners.length} known runner histories.`,
  );

  const calculatedRows = selectedRows.map((row) => {
    const athlete = {
      tfrrsId: row.tfrrs_id,
      team: teamByTfrrsId.get(row.tfrrs_id) ?? "unknown",
      raceHistory: row.race_history ?? [],
    };
    const attributes = calculateAthleteAttributes(athlete, teamRunners);
    return {
      tfrrsId: row.tfrrs_id,
      athleteName: row.athlete_name,
      crossCountry: attributes.crossCountry,
      indoor: attributes.indoor,
    };
  });

  const crossCountryAvailable = calculatedRows.filter(
    (row) => row.crossCountry !== null,
  ).length;
  const indoorAvailable = calculatedRows.filter(
    (row) => row.indoor !== null,
  ).length;

  for (const row of calculatedRows.slice(0, 5)) {
    console.log(
      `  ${row.athleteName}: XC ${formatScore(row.crossCountry)}, indoor ${formatScore(row.indoor)}`,
    );
  }
  console.log(
    `XC ratings available: ${crossCountryAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Indoor ratings available: ${indoorAvailable}/${calculatedRows.length}.`,
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
            cross_country_rating: row.crossCountry,
            indoor_rating: row.indoor,
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

  console.log(
    `Updated cross_country_rating and indoor_rating on ${updated} rows.`,
  );
}

main().catch((error) => {
  console.error("Failed to calculate athlete ratings:", error);
  process.exit(1);
});
