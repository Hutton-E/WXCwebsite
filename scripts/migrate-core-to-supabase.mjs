#!/usr/bin/env node
/**
 * migrate-core-to-supabase.mjs
 *
 * One-time migration: pushes src/data/core_routine.json into Supabase
 * (core_exercises + site_content tables). Run once, then corePage.tsx
 * reads from Supabase instead of the local JSON file.
 *
 * Usage: node scripts/migrate-core-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const JSON_PATH = path.resolve("src/data/core_routine.json");

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const routine = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const { error: introError } = await supabase
    .from("site_content")
    .upsert({ key: "core_intro", value: routine.intro }, { onConflict: "key" });

  if (introError)
    throw new Error(`Failed to write intro: ${introError.message}`);
  console.log("✅ Wrote core_intro to site_content");

  const rows = [];
  let dayOrder = 0;

  for (const [day, { note, exercises }] of Object.entries(routine.days)) {
    dayOrder++;
    exercises.forEach((ex, position) => {
      rows.push({
        day,
        day_order: dayOrder,
        day_note: note,
        position,
        name: ex.name,
        url: ex.url,
      });
    });
  }

  // Wipe and re-insert rather than upsert — there's no natural unique key
  // per exercise row (names repeat across days), so a clean replace is safer.
  const { error: deleteError } = await supabase
    .from("core_exercises")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // matches all rows

  if (deleteError)
    throw new Error(`Failed to clear existing rows: ${deleteError.message}`);

  const { error: insertError, count } = await supabase
    .from("core_exercises")
    .insert(rows, { count: "exact" });

  if (insertError)
    throw new Error(`Failed to insert exercises: ${insertError.message}`);

  console.log(
    `✅ Inserted ${count ?? rows.length} exercise rows across ${dayOrder} days.`,
  );
}

main().catch((err) => {
  console.error("Failed to migrate core routine:", err);
  process.exit(1);
});
