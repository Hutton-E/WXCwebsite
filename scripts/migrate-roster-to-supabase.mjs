#!/usr/bin/env node
/**
 * migrate-roster-to-supabase.mjs
 *
 * Pushes every athlete from every src/data/distance_roster_*.json file into
 * the Supabase `athletes` table, keyed by (id, season). This becomes the
 * single source of truth used to match PDF-parsed names during admin
 * uploads, replacing raw name-string comparisons scattered across JSON files.
 *
 * Requires ADMIN_EMAIL / ADMIN_PASSWORD in .env so this script can
 * authenticate and satisfy the "Admin write access" RLS policy.
 *
 * Usage: node scripts/migrate-roster-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DATA_DIR = path.resolve("src/data");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_KEY,
);

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.",
    );
    process.exit(1);
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) {
    console.error("Failed to authenticate:", authError.message);
    process.exit(1);
  }

  const files = findRosterFiles();
  let totalUpserted = 0;

  for (const filePath of files) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const season = data.season;
    if (!season) {
      console.warn(
        `Skipping ${path.basename(filePath)} — no "season" field found.`,
      );
      continue;
    }

    const payload = data.athletes.map((a) => ({
      id: a.id,
      season,
      name: a.name,
      team: a.team,
      hometown: a.hometown || null,
      high_school: a.highSchool || null,
    }));

    const { error, count } = await supabase
      .from("athletes")
      .upsert(payload, { onConflict: "id,season", count: "exact" });

    if (error) {
      console.error(`${path.basename(filePath)}: FAILED — ${error.message}`);
      continue;
    }

    console.log(
      `${path.basename(filePath)}: upserted ${count ?? payload.length} athletes (season ${season})`,
    );
    totalUpserted += count ?? payload.length;
  }

  console.log(`\n✅ Total athletes migrated: ${totalUpserted}`);
}

main();
