#!/usr/bin/env node
/**
 * migrate-fms-to-supabase.mjs
 *
 * One-time migration: pushes src/data/fms_exercises.json into Supabase's
 * fms_exercises table.
 *
 * Usage: node scripts/migrate-fms-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const JSON_PATH = path.resolve("src/data/fms_exercises.json");

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const rows = [];
  for (const [category, phases] of Object.entries(data)) {
    for (const [phase, exercises] of Object.entries(phases)) {
      exercises.forEach((ex, position) => {
        rows.push({
          category,
          phase,
          position,
          name: ex.name,
          reps: ex.reps || null,
          url: ex.url || null,
        });
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("fms_exercises")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError)
    throw new Error(`Failed to clear existing rows: ${deleteError.message}`);

  const { error, count } = await supabase
    .from("fms_exercises")
    .insert(rows, { count: "exact" });

  if (error) throw new Error(error.message);

  console.log(`✅ Inserted ${count ?? rows.length} exercise rows.`);
}

main().catch((err) => {
  console.error("Failed to migrate FMS exercises:", err);
  process.exit(1);
});
