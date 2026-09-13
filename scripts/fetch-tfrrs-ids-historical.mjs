#!/usr/bin/env node
/**
 * fetch-tfrrs-ids-historical.mjs
 *
 * Unlike fetch-tfrrs-ids-all-years.mjs (which only reads the CURRENT TFRRS
 * team roster — limited to currently-eligible athletes), this script reads
 * the season dropdown on the TFRRS team page itself, discovers every
 * available season's `config_hnd` value, and fetches EACH season's roster
 * snapshot. Since TFRRS assigns one permanent ID per athlete across their
 * whole career, this surfaces real tfrrsIds for graduated athletes who
 * don't appear on the current team page at all.
 *
 * Then applies the resulting name -> tfrrsId lookup to every
 * src/data/distance_roster_*.json file.
 *
 * Usage: node scripts/fetch-tfrrs-ids-historical.mjs
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

const DELAY_MS = 600;

const MANUAL_OVERRIDES = {
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
  "cameron noreen": "8271797",
  "alex childs": "6915220",
  "maria colette choi lei": "9017626",
  "benjamin rhodes": "7699569",
  "madison prier": "8352882",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- Discover every "Cross Country" season option on the page ----------

function findXcSeasonOptions($) {
  const options = [];

  $("select option").each((_, el) => {
    const value = $(el).attr("value");
    const text = $(el).text().trim();
    if (!value) return;
    // Only care about Cross Country seasons — indoor/outdoor track rosters
    // aren't relevant to your distance-roster identity data.
    if (/cross country/i.test(text)) {
      options.push({ value, text });
    }
  });

  return options;
}

// ---------- Parse a roster table (same shape as the current-page parser) ----------

function parseRosterTable($) {
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

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (tfrrs-historical-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  HTTP ${res.status} — ${url}`);
    return null;
  }
  const html = await res.text();
  return cheerio.load(html);
}

// ---------- Roster file helpers ----------

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

function loadRoster(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveRoster(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  const nameToId = new Map();
  for (const [name, id] of Object.entries(MANUAL_OVERRIDES)) {
    nameToId.set(name, id);
  }

  // ---------- Step 1: discover + fetch every historical season per team ----------
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`\n=== ${team} ===`);
    console.log(`Fetching base page to discover season options: ${url}`);
    const $base = await fetchPage(url);
    if (!$base) continue;

    const seasonOptions = findXcSeasonOptions($base);
    console.log(
      `Found ${seasonOptions.length} Cross Country season option(s):`,
    );
    seasonOptions.forEach((o) =>
      console.log(`   - ${o.text} (config_hnd=${o.value})`),
    );

    // Also parse the base page itself (covers the current/default season).
    const baseEntries = parseRosterTable($base);
    let addedFromBase = 0;
    for (const e of baseEntries) {
      if (!nameToId.has(e.normalizedName)) {
        nameToId.set(e.normalizedName, e.tfrrsId);
        addedFromBase++;
      }
    }
    console.log(`Base page: +${addedFromBase} new names`);

    // Fetch each historical season snapshot.
    const cleanBaseUrl = url.replace(/\.html$/, "");
    for (const { value, text } of seasonOptions) {
      const seasonUrl = `${cleanBaseUrl}?config_hnd=${value}`;
      const $season = await fetchPage(seasonUrl);
      await sleep(DELAY_MS);
      if (!$season) continue;

      const entries = parseRosterTable($season);
      let added = 0;
      for (const e of entries) {
        if (!nameToId.has(e.normalizedName)) {
          nameToId.set(e.normalizedName, e.tfrrsId);
          added++;
        }
      }
      console.log(`  ${text}: ${entries.length} athletes, +${added} new names`);
    }
  }

  console.log(
    `\nTotal known name -> tfrrsId matches after historical crawl: ${nameToId.size}`,
  );

  // ---------- Step 2: apply to every distance_roster_*.json ----------
  const rosterFiles = findRosterFiles();
  let grandTotalMatched = 0;
  let grandTotalAthletes = 0;
  const stillUnmatched = new Set();

  console.log(`\nApplying matches to ${rosterFiles.length} roster file(s)...`);

  for (const filePath of rosterFiles) {
    const data = loadRoster(filePath);
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
    console.log(`\n⚠️  ${stillUnmatched.size} name(s) still unmatched:`);
    [...stillUnmatched].sort().forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nThese may be pre-2010ish athletes (before TFRRS's own data goes back), " +
        "name-spelling mismatches, or athletes TFRRS never had results for. " +
        "Add confirmed matches to MANUAL_OVERRIDES.",
    );
  }
}

main().catch((err) => {
  console.error("Failed historical TFRRS ID matching:", err);
  process.exit(1);
});
