#!/usr/bin/env node
/**
 * Calculates cross country, indoor, outdoor, 400m-equivalent speed, and
 * 10000m-equivalent endurance ratings
 * from stored TFRRS histories and writes them to tfrrs_athlete_performance's
 * cross_country_rating, indoor_rating, outdoor_rating,
 * indoor_consistency_rating, outdoor_consistency_rating, speed_rating,
 * endurance_rating, and win_factor_rating columns. Raw races, PRs, and
 * public.athletes are not modified.
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
  const supabase = await getAuthenticatedSupabaseClient({
    requireServiceRole: true,
  });
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
    `Calculating cross country, indoor, and outdoor ratings for ${selectedRows.length} athlete(s) using ${teamRunners.length} known runner histories.`,
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
      outdoor: attributes.outdoor,
      indoorConsistency: attributes.indoorConsistency,
      outdoorConsistency: attributes.outdoorConsistency,
      speed: attributes.speed,
      endurance: attributes.endurance,
      winFactor: attributes.winFactor,
      runnerType: attributes.runnerType,
      runnerTypeScores: attributes.runnerTypeScores,
    };
  });

  const crossCountryAvailable = calculatedRows.filter(
    (row) => row.crossCountry !== null,
  ).length;
  const indoorAvailable = calculatedRows.filter(
    (row) => row.indoor !== null,
  ).length;
  const outdoorAvailable = calculatedRows.filter(
    (row) => row.outdoor !== null,
  ).length;
  const indoorConsistencyAvailable = calculatedRows.filter(
    (row) => row.indoorConsistency !== null,
  ).length;
  const outdoorConsistencyAvailable = calculatedRows.filter(
    (row) => row.outdoorConsistency !== null,
  ).length;
  const speedAvailable = calculatedRows.filter(
    (row) => row.speed !== null,
  ).length;
  const enduranceAvailable = calculatedRows.filter(
    (row) => row.endurance !== null,
  ).length;
  const winFactorAvailable = calculatedRows.filter(
    (row) => row.winFactor !== null,
  ).length;

  for (const row of calculatedRows.slice(0, 5)) {
    console.log(
      `  ${row.athleteName}: ${row.runnerType ?? "unclassified"} — XC ${formatScore(row.crossCountry)}, indoor ${formatScore(row.indoor)}, outdoor ${formatScore(row.outdoor)}, speed ${formatScore(row.speed)}, endurance ${formatScore(row.endurance)}, win factor ${formatScore(row.winFactor)}, consistency: indoor ${formatScore(row.indoorConsistency)}, outdoor ${formatScore(row.outdoorConsistency)}`,
    );
  }
  console.log(
    `XC ratings available: ${crossCountryAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Indoor ratings available: ${indoorAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Outdoor ratings available: ${outdoorAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Indoor consistency scores available: ${indoorConsistencyAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Outdoor consistency scores available: ${outdoorConsistencyAvailable}/${calculatedRows.length}.`,
  );
  console.log(`Speed ratings available: ${speedAvailable}/${calculatedRows.length}.`);
  console.log(
    `Endurance ratings available: ${enduranceAvailable}/${calculatedRows.length}.`,
  );
  console.log(
    `Win factor ratings available: ${winFactorAvailable}/${calculatedRows.length}.`,
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
            outdoor_rating: row.outdoor,
            indoor_consistency_rating: row.indoorConsistency,
            outdoor_consistency_rating: row.outdoorConsistency,
            speed_rating: row.speed,
            endurance_rating: row.endurance,
            win_factor_rating: row.winFactor,
            runner_type: row.runnerType,
            runner_type_scores: row.runnerTypeScores,
          })
          .eq("tfrrs_id", row.tfrrsId)
          .select("tfrrs_id");

        if (error) {
          throw new Error(
            `${row.tfrrsId}: ${error.message}. Apply supabase/athlete_record_ratings.sql with the service-role connection before writing ratings.`,
          );
        }
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
    `Updated ratings and runner types on ${updated} rows.`,
  );
}

main().catch((error) => {
  console.error("Failed to calculate athlete ratings:", error);
  process.exit(1);
});
