#!/usr/bin/env node
/**
 * fetch-tfrrs-ids.mjs
 *
 * Matches athletes in src/data/distance_roster.json against TFRRS team
 * roster pages, and adds a `tfrrsId` field to each matched athlete.
 *
 * TFRRS lists names as "Last, First" — this does a normalized match against
 * your "First Last" roster names. Mismatches (nicknames, spelling
 * differences) are logged so you can add manual overrides below.
 *
 * Usage: node scripts/fetch-tfrrs-ids.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

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

const ROSTER_PATH = path.resolve("src/data/distance_roster_26.json");

// Add entries here when automatic matching fails due to spelling/nickname
// differences between go-knights.net and TFRRS. Key = your roster id.
const MANUAL_OVERRIDES = {
  17015: "9444002", // e.g. Philip Dahlen -> TFRRS Phillip Dahlen
  17028: "9444015", // e.g. Adam Wilke -> TFRRS Adam Wilkie
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim();
}

async function fetchTfrrsRoster(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (roster-match-script)" },
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
        const tfrrsId = href.split("/").filter(Boolean)[1] || ""; // /athletes/{id}/...

        if (!rawName || !tfrrsId) return;

        const [last, first] = rawName.split(",").map((s) => s.trim());
        if (!last || !first) return;

        entries.push({
          tfrrsId,
          normalizedName: normalize(`${first} ${last}`),
          rawName,
        });
      });
  });

  return entries;
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));

  const allTfrrsEntries = [];
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`Fetching TFRRS roster for ${team}...`);
    const entries = await fetchTfrrsRoster(url);
    console.log(`  Found ${entries.length} TFRRS entries`);
    allTfrrsEntries.push(...entries);
  }

  let matched = 0;
  const unmatched = [];

  for (const athlete of roster.athletes) {
    if (MANUAL_OVERRIDES[athlete.id]) {
      athlete.tfrrsId = MANUAL_OVERRIDES[athlete.id];
      matched++;
      continue;
    }

    const target = normalize(athlete.name);
    const match = allTfrrsEntries.find((e) => e.normalizedName === target);

    if (match) {
      athlete.tfrrsId = match.tfrrsId;
      matched++;
    } else {
      unmatched.push(athlete.name);
    }
  }

  fs.writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2), "utf8");

  console.log(`\n✅ Matched ${matched}/${roster.athletes.length} athletes.`);
  if (unmatched.length > 0) {
    console.log(
      `\n⚠️  Could not match ${unmatched.length} athletes automatically:`,
    );
    unmatched.forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nFind their TFRRS profile manually (search their name on tfrrs.org), " +
        "grab the numeric ID from the profile URL, and add it to MANUAL_OVERRIDES in this script.",
    );
  }
}

main().catch((err) => {
  console.error("Failed to match TFRRS IDs:", err);
  process.exit(1);
});
