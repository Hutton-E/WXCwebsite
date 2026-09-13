#!/usr/bin/env node
/**
 * fetch-tfrrs-ids-all-years.mjs
 *
 * Adds tfrrsId to every athlete across ALL src/data/distance_roster_*.json
 * files, without re-scraping TFRRS once per season.
 *
 * How it works:
 *   1. Builds a "name -> tfrrsId" lookup by:
 *      a) Reading every already-known tfrrsId out of your existing
 *         distance_roster_*.json files (distance_roster_26.json in
 *         particular already has most matches from earlier work).
 *      b) Fetching the CURRENT TFRRS team rosters (men's + women's) for
 *         any names not already covered.
 *   2. Applies that lookup, by normalized name, to every athlete in every
 *      distance_roster_*.json file that doesn't already have a tfrrsId.
 *
 * IMPORTANT LIMITATION: TFRRS's team roster page only lists CURRENTLY
 * ACTIVE athletes. Graduated/former athletes who only appear in older
 * seasons (e.g. distance_roster_18.json) will NOT be found this way —
 * this is the same limitation discussed earlier for historical data.
 * Those will be reported as unmatched; add them to MANUAL_OVERRIDES below
 * if you look up their TFRRS profile by hand.
 *
 * Usage: node scripts/fetch-tfrrs-ids-all-years.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_DIR = path.resolve("src/data");

const TFRRS_TEAMS = [
  {
    url: "https://www.tfrrs.org/teams/IA_college_m_Wartburg.html",
    team: "mens-cross-country",
  },
  {
    url: "https://www.tfrrs.org/teams/IA_college_f_Wartburg.html",
    team: "womens-cross-country",
  },
];

// Keyed by normalized name. Add entries here for athletes you've manually
// found on TFRRS (e.g. graduated athletes not on the current team page,
// or spelling mismatches like "Philip"/"Phillip").
const MANUAL_OVERRIDES = {
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim();
}

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter(
      (f) =>
        /^distance_roster_\d+\.json$/.test(f) ||
        f === "distance_roster_26.json",
    )
    .map((f) => path.join(DATA_DIR, f));
}

function loadRoster(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveRoster(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function fetchCurrentTfrrsRoster(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (tfrrs-all-years-script)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const entries = [];

  $("table").each((_, table) => {
    const headerText = $(table)
      .find("th")
      .map((_, th) => $(th).text().trim())
      .get()
      .join("|");
    if (!/name/i.test(headerText) || !/year/i.test(headerText)) return;

    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 1) return;
        const link = $(cells[0]).find("a").first();
        const rawName = link.text().trim(); // "Last, First"
        const href = link.attr("href") || "";
        const tfrrsId = href.split("/").filter(Boolean)[1] || "";

        if (!rawName || !tfrrsId) return;

        const [last, first] = rawName.split(",").map((s) => s.trim());
        if (!last || !first) return;

        entries.push({
          tfrrsId,
          normalizedName: normalize(`${first} ${last}`),
        });
      });
  });

  return entries;
}

async function main() {
  const rosterFiles = findRosterFiles();
  if (rosterFiles.length === 0) {
    console.error(`No distance_roster_*.json files found in ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${rosterFiles.length} roster file(s):`);
  rosterFiles.forEach((f) => console.log(`  - ${path.basename(f)}`));

  // ---------- Step 1: seed the lookup from existing tfrrsId values ----------
  const nameToId = new Map();

  for (const [normalizedName, id] of Object.entries(MANUAL_OVERRIDES)) {
    nameToId.set(normalizedName, id);
  }

  const rosters = rosterFiles.map((filePath) => ({
    filePath,
    data: loadRoster(filePath),
  }));

  for (const { data } of rosters) {
    for (const athlete of data.athletes) {
      if (athlete.tfrrsId && !nameToId.has(normalize(athlete.name))) {
        nameToId.set(normalize(athlete.name), athlete.tfrrsId);
      }
    }
  }

  console.log(
    `\nSeeded ${nameToId.size} known name -> tfrrsId matches from existing files + overrides.`,
  );

  // ---------- Step 2: fetch current TFRRS roster for anything new ----------
  console.log(`\nFetching current TFRRS rosters for any additional matches...`);
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`  ${team}...`);
    const entries = await fetchCurrentTfrrsRoster(url);
    let added = 0;
    for (const entry of entries) {
      if (!nameToId.has(entry.normalizedName)) {
        nameToId.set(entry.normalizedName, entry.tfrrsId);
        added++;
      }
    }
    console.log(`    +${added} new names added to lookup`);
  }

  console.log(`\nTotal known name -> tfrrsId matches: ${nameToId.size}`);

  // ---------- Step 3: apply the lookup to every roster file ----------
  let grandTotalMatched = 0;
  let grandTotalAthletes = 0;
  const stillUnmatched = new Set();

  for (const { filePath, data } of rosters) {
    let matchedInFile = 0;

    for (const athlete of data.athletes) {
      grandTotalAthletes++;
      if (athlete.tfrrsId) {
        matchedInFile++;
        continue;
      }
      const id = nameToId.get(normalize(athlete.name));
      if (id) {
        athlete.tfrrsId = id;
        matchedInFile++;
      } else {
        stillUnmatched.add(athlete.name);
      }
    }

    saveRoster(filePath, data);
    grandTotalMatched += matchedInFile;

    console.log(
      `${path.basename(filePath)}: ${matchedInFile}/${data.athletes.length} matched`,
    );
  }

  console.log(
    `\n✅ Overall: ${grandTotalMatched}/${grandTotalAthletes} athlete-season entries now have a tfrrsId.`,
  );

  if (stillUnmatched.size > 0) {
    console.log(
      `\n⚠️  ${stillUnmatched.size} unique name(s) could not be matched (likely graduated/former athletes not on the current TFRRS team page):`,
    );
    [...stillUnmatched].sort().forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nTo fix a specific person: search their name on tfrrs.org, find their profile, " +
        "grab the numeric ID from the URL, and add a lowercase entry to MANUAL_OVERRIDES " +
        'in this script, e.g.: "jane smith": "1234567"',
    );
  }
}

main().catch((err) => {
  console.error("Failed to match TFRRS IDs across years:", err);
  process.exit(1);
});
