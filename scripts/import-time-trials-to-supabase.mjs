#!/usr/bin/env node
import * as XLSX from "xlsx";
import fs from "node:fs";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const FILE_PATH = "src/data/Time_Trials.xlsx";

function normalizeName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function displayTime(value, formattedValue) {
  // Excel stores these durations as fractions of a day. Use its displayed
  // value so a duration such as 17:13 is not converted into a clock time.
  if (typeof value === "number" && formattedValue) {
    return formattedValue.trim();
  }
  return String(value).trim();
}

function seasonFromYearLabel(value) {
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function timeToSeconds(value) {
  const parts = String(value).split(":").map(Number);
  if (parts.some(Number.isNaN)) return Number.POSITIVE_INFINITY;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const workbook = XLSX.read(fs.readFileSync(FILE_PATH), {
    type: "buffer",
    cellDates: false,
  });
  const { data: athletes, error: athleteError } = await supabase
    .from("athletes")
    .select("id, season, name");
  if (athleteError) throw new Error(`Failed to load athletes: ${athleteError.message}`);

  const athleteByKey = new Map(
    (athletes ?? []).map((athlete) => [
      `${athlete.season}:${normalizeName(athlete.name)}`,
      athlete,
    ]),
  );
  const rows = [];
  const unmatched = [];

  for (const trialName of workbook.SheetNames) {
    const sheet = workbook.Sheets[trialName];
    const values = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    const blockStarts = values[0]
      .map((value, index) => (value === "Name" ? index : -1))
      .filter((index) => index >= 0);

    for (const [rowIndex, row] of values.slice(1).entries()) {
      for (const [blockIndex, column] of blockStarts.entries()) {
        const name = String(row[column] ?? "").trim();
        const time = row[column + 1];
        const yearLabel = String(row[column + 2] ?? "").trim();
        if (!name || time === "" || !yearLabel) continue;

        const season = seasonFromYearLabel(yearLabel);
        if (!season) continue;
        const athlete = season
          ? athleteByKey.get(`${season}:${normalizeName(name)}`)
          : undefined;
        if (!athlete) unmatched.push(`${trialName}: ${name} (${yearLabel})`);

        const nextBlockStart = blockStarts[blockIndex + 1] ?? row.length;
        const details = {};
        for (let detailColumn = column + 3; detailColumn < nextBlockStart; detailColumn++) {
          const key = String(values[0][detailColumn] ?? "").trim();
          const value = row[detailColumn];
          if (key && value !== "") details[key] = displayTime(value, sheet[
            XLSX.utils.encode_cell({ r: rowIndex + 1, c: detailColumn })
          ]?.w);
        }

        rows.push({
          athlete_id: athlete?.id ?? null,
          season,
          trial_name: trialName,
          source_block: blockIndex + 1,
          athlete_name: name,
          position: null,
          details,
          result_time: displayTime(
            time,
            sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: column + 1 })]?.w,
          ),
          year_label: yearLabel,
        });
      }
    }
  }

  const rowsByRace = new Map();
  for (const row of rows) {
    const raceKey = `${row.trial_name}:${row.year_label}:${row.source_block}`;
    const raceRows = rowsByRace.get(raceKey) ?? [];
    raceRows.push(row);
    rowsByRace.set(raceKey, raceRows);
  }
  for (const raceRows of rowsByRace.values()) {
    raceRows.sort((a, b) => timeToSeconds(a.result_time) - timeToSeconds(b.result_time));
    raceRows.forEach((row, index) => {
      row.position = index + 1;
    });
  }

  const { error: deleteError } = await supabase
    .from("time_trial_results")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) throw new Error(`Failed to clear old time trials: ${deleteError.message}`);

  const { error: insertError, count } = await supabase
    .from("time_trial_results")
    .insert(rows, { count: "exact" });
  if (insertError) throw new Error(`Failed to insert time trials: ${insertError.message}`);

  console.log(`Inserted ${count ?? rows.length} time trial results.`);
  if (unmatched.length > 0) {
    console.warn(`Skipped ${unmatched.length} rows with no matching athlete/season:`);
    unmatched.forEach((row) => console.warn(`  ${row}`));
  }
}

main().catch((error) => {
  console.error("Failed to import time trials:", error);
  process.exit(1);
});
