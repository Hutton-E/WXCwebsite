#!/usr/bin/env node
/**
 * fetch-tfrrs-stats.mjs
 *
 * For every athlete with a tfrrsId in distance_roster.json, fetches their
 * TFRRS profile and extracts their "College Bests" table — one best time
 * per event, career-wide (not broken out by season/indoor/outdoor).
 *
 * Writes src/data/tfrrs_stats.json, keyed by your roster athlete id.
 *
 * Run this periodically during the season to keep bests current.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const ROSTER_PATH = path.resolve("src/data/distance_roster.json");
const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");

// Be polite — TFRRS is a shared community resource, not an API.
const DELAY_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAthleteBests(tfrrsId, name) {
  // The team ("Wartburg") and name-slug portion of the URL don't actually
  // need to be correct for TFRRS to resolve the page — only the ID matters —
  // but we build a plausible URL for clarity/debugging.
  const slug = name.replace(/\s+/g, "_");
  const url = `https://www.tfrrs.org/athletes/${tfrrsId}/Wartburg/${slug}.html`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (stats-fetch-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${name}: failed to fetch (${res.status}) — ${url}`);
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // The "College Bests" summary table is the first table on the page.
  const bestsTable = $("table").first();
  if (bestsTable.length === 0) {
    console.warn(`  ⚠️  ${name}: no tables found on profile page`);
    return null;
  }

  const events = [];
  const cells = bestsTable.find("td").toArray();

  // Cells alternate: [event label, result cell with a time link, event label, result cell, ...]
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
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));
  const athletesWithId = roster.athletes.filter((a) => a.tfrrsId);

  if (athletesWithId.length === 0) {
    console.error(
      "No athletes have a tfrrsId yet. Run scripts/fetch-tfrrs-ids.mjs first.",
    );
    process.exit(1);
  }

  console.log(`Fetching stats for ${athletesWithId.length} athletes...\n`);

  const stats = {};
  let success = 0;
  let failed = 0;

  for (const athlete of athletesWithId) {
    const events = await fetchAthleteBests(athlete.tfrrsId, athlete.name);
    if (events && events.length > 0) {
      stats[athlete.id] = {
        name: athlete.name,
        tfrrsId: athlete.tfrrsId,
        fetchedAt: new Date().toISOString(),
        bests: events,
      };
      console.log(`✅ ${athlete.name}: ${events.length} events`);
      success++;
    } else {
      console.log(`⚠️  ${athlete.name}: no data found`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(stats, null, 2), "utf8");

  console.log(`\n✅ Wrote stats for ${success} athletes to ${OUT_PATH}`);
  if (failed > 0) {
    console.log(
      `⚠️  ${failed} athletes had no data — check their tfrrsId or profile page manually.`,
    );
  }
}

main().catch((err) => {
  console.error("Failed to fetch TFRRS stats:", err);
  process.exit(1);
});
