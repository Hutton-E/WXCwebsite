#!/usr/bin/env node
/**
 * fetch-tfrrs-stats.mjs
 *
 * Scans EVERY src/data/distance_roster_*.json file, collects every unique
 * tfrrsId across all seasons (the same real person may appear in several
 * yearly files but always shares one tfrrsId — TFRRS IDs are stable across
 * a career, unlike go-knights' per-season roster IDs), and fetches each
 * unique athlete's "College Bests" table exactly once.
 *
 * Writes src/data/tfrrs_stats.json KEYED BY tfrrsId (not by roster id),
 * so any season's athlete record can look up its own stats via
 * athlete.tfrrsId, regardless of which year's file it came from.
 *
 * Supports two tfrrsId shapes:
 *   - A plain numeric ID (e.g. "8271797") -> builds the standard
 *     tfrrs.org/athletes/{id}/Wartburg/{Name}.html URL.
 *   - A full URL already (for TFRRS's alternate hashed-profile format,
 *     e.g. "https://www.tfrrs.org/athlete/{hash}.html") -> used as-is.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_DIR = path.resolve("src/data");
const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");
const DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

function resolveProfileUrl(tfrrsId, name) {
  if (tfrrsId.startsWith("http")) {
    // Hashed-format profile — already a full, usable URL.
    return tfrrsId;
  }
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
  const rosterFiles = findRosterFiles();
  if (rosterFiles.length === 0) {
    console.error(`No distance_roster_*.json files found in ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(
    `Scanning ${rosterFiles.length} roster file(s) for unique tfrrsIds...`,
  );

  // Map keyed by tfrrsId -> a representative display name (whichever we see first).
  const uniqueAthletes = new Map();

  for (const filePath of rosterFiles) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const athlete of data.athletes) {
      if (athlete.tfrrsId && !uniqueAthletes.has(athlete.tfrrsId)) {
        uniqueAthletes.set(athlete.tfrrsId, athlete.name);
      }
    }
  }

  console.log(
    `Found ${uniqueAthletes.size} unique athletes (by tfrrsId) across all seasons.\n`,
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
  if (failed > 0) {
    console.log(
      `⚠️  ${failed} athletes had no data — check their tfrrsId manually.`,
    );
  }
}

main().catch((err) => {
  console.error("Failed to fetch TFRRS stats:", err);
  process.exit(1);
});
