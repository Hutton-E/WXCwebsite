#!/usr/bin/env node
/**
 * fetch-tfrrs-stats.mjs
 *
 * Reads every unique tfrrs_id from Supabase's `athletes` table (across all
 * seasons — the same person may appear multiple times but shares one
 * tfrrs_id), fetches each unique athlete's "College Bests" table once, and
 * writes src/data/tfrrs_stats.json keyed by tfrrs_id.
 *
 * Note: this script's OUTPUT is still a local JSON file, since your live
 * app (tfrrsStats.tsx) already reads it directly and works correctly.
 * Only the INPUT (which athletes to fetch) now comes from Supabase instead
 * of scanning local roster files.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");
const DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProfileUrl(tfrrsId, name) {
  if (tfrrsId.startsWith("http")) return tfrrsId;
  const slug = name.replace(/\s+/g, "_");
  return `https://www.tfrrs.org/athletes/${tfrrsId}/Wartburg/${slug}.html`;
}

async function fetchAthleteBests(tfrrsId, name) {
  const url = resolveProfileUrl(tfrrsId, name);

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (stats-fetch-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${name}: failed to fetch (${res.status}) — ${url}`);
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const bestsTable = $("table").first();
  if (bestsTable.length === 0) {
    console.warn(`  ⚠️  ${name}: no tables found on profile page`);
    return null;
  }

  const events = [];
  const cells = bestsTable.find("td").toArray();

  for (let i = 0; i < cells.length; i += 2) {
    const labelCell = $(cells[i]);
    const resultCell = $(cells[i + 1]);
    if (!resultCell) continue;

    const event = labelCell.text().trim();
    const link = resultCell.find("a").first();
    const time = link.text().trim();
    const resultUrl = link.attr("href") || "";

    if (!event || !time) continue;

    events.push({
      event,
      time,
      resultUrl: resultUrl.startsWith("http")
        ? resultUrl
        : `https://www.tfrrs.org${resultUrl}`,
    });
  }

  return events;
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data: rows, error } = await supabase
    .from("athletes")
    .select("tfrrs_id, name")
    .not("tfrrs_id", "is", null);

  if (error) throw new Error(error.message);

  const uniqueAthletes = new Map();
  for (const row of rows) {
    if (!uniqueAthletes.has(row.tfrrs_id)) {
      uniqueAthletes.set(row.tfrrs_id, row.name);
    }
  }

  console.log(
    `Found ${uniqueAthletes.size} unique athletes (by tfrrs_id) in Supabase.\n`,
  );

  const stats = {};
  let success = 0;
  let failed = 0;
  let index = 0;

  for (const [tfrrsId, name] of uniqueAthletes) {
    index++;
    const events = await fetchAthleteBests(tfrrsId, name);
    if (events && events.length > 0) {
      stats[tfrrsId] = {
        name,
        tfrrsId,
        fetchedAt: new Date().toISOString(),
        bests: events,
      };
      console.log(
        `✅ [${index}/${uniqueAthletes.size}] ${name}: ${events.length} events`,
      );
      success++;
    } else {
      console.log(
        `⚠️  [${index}/${uniqueAthletes.size}] ${name}: no data found`,
      );
      failed++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(stats, null, 2), "utf8");

  console.log(`\n✅ Wrote stats for ${success} athletes to ${OUT_PATH}`);
  if (failed > 0) console.log(`⚠️  ${failed} athletes had no data.`);
}

main().catch((err) => {
  console.error("Failed to fetch TFRRS stats:", err);
  process.exit(1);
});
