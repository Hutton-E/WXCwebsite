#!/usr/bin/env node
import * as XLSX from "xlsx";
import fs from "node:fs";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const FILE_PATH = "src/data/lifting_program.xlsx";

function sheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const buffer = fs.readFileSync(FILE_PATH);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const wednesday = sheetToRows(workbook, "Wednesday").map((r) => ({
    day: "wednesday",
    week_number: r.Week,
    week_date:
      typeof r.Date === "string" ? r.Date : r.Date.toISOString().slice(0, 10),
    slot: r.Slot,
    exercise: r.Exercise,
    sets_reps: r.SetsReps || null,
    position: r.Position,
  }));

  const friday = sheetToRows(workbook, "Friday").map((r) => ({
    day: "friday",
    week_number: r.Week,
    week_date:
      typeof r.Date === "string" ? r.Date : r.Date.toISOString().slice(0, 10),
    slot: r.Slot,
    exercise: r.Exercise,
    sets_reps: r.SetsReps || null,
    position: r.Position,
  }));

  const glossary = sheetToRows(workbook, "Glossary").map((r) => ({
    category: r.Category,
    week_number: r.WeekNumber === "" ? null : r.WeekNumber,
    position: r.Position,
    detail: r.Detail,
  }));

  await supabase
    .from("lifting_glossary")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: glossaryError, count: glossaryCount } = await supabase
    .from("lifting_glossary")
    .insert(glossary, { count: "exact" });

  if (glossaryError) throw new Error(glossaryError.message);
  console.log(`✅ Inserted ${glossaryCount} lifting_glossary rows`);

  const core = sheetToRows(workbook, "Friday Core").map((r) => ({
    exercise: r.Exercise,
    sets_reps: r.SetsReps || null,
  }));

  await supabase
    .from("lifting_core")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: coreError, count: coreCount } = await supabase
    .from("lifting_core")
    .insert(core, { count: "exact" });

  if (coreError) throw new Error(coreError.message);
  console.log(`✅ Inserted ${coreCount} lifting_core rows`);
}

main().catch((err) => {
  console.error("Failed to migrate lifting program:", err);
  process.exit(1);
});
