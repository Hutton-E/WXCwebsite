#!/usr/bin/env node
/**
 * fetch-roster-by-year.mjs
 *
 * Fetches men's + women's cross country rosters from go-knights.net for
 * each year listed in YEARS, and writes one file per season:
 *   src/data/distance_roster_{YY}.json   (e.g. distance_roster_25.json for 2025)
 *
 * These are separate from distance_roster_26.json (the current-season login
 * roster used by identity lookup) — this script is for building out
 * additional selectable seasons.
 *
 * Usage: node scripts/fetch-roster-by-year.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

// Edit this list to add/remove seasons you want generated.
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

const TEAMS = [
  {
    baseUrl: "https://go-knights.net/sports/mens-cross-country/roster",
    team: "mens-cross-country",
  },
  {
    baseUrl: "https://go-knights.net/sports/womens-cross-country/roster",
    team: "womens-cross-country",
  },
];

const DELAY_MS = 700;

const CLASS_YEAR_MAP = {
  freshman: "Fr.",
  sophomore: "So.",
  junior: "Jr.",
  senior: "Sr.",
  graduate: "Gr.",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeClassYear(raw) {
  const cleaned = raw.trim().replace(/\.$/, "").toLowerCase();
  return CLASS_YEAR_MAP[cleaned] || raw.trim();
}

// ---------- MODERN TABLE PARSER ----------

function parseModernTable($, team) {
  const athletes = [];

  $("table").each((_, table) => {
    const headerText = $(table)
      .find("th")
      .map((_, th) => $(th).text().trim())
      .get()
      .join("|");
    const looksLikeRoster =
      /academic year/i.test(headerText) &&
      /(hometown|high school)/i.test(headerText);
    if (!looksLikeRoster) return;

    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 3) return;

        const nameCell = $(cells[0]);
        const link = nameCell.find("a").first();
        const name = link.text().trim() || nameCell.text().trim();
        const href = link.attr("href") || "";
        const id = href.split("/").filter(Boolean).pop() || "";

        const classYear = $(cells[1]).text().trim();
        const hometownRaw = $(cells[2]).text().trim();
        const [hometown, highSchool] = hometownRaw
          .split("/")
          .map((s) => s.trim());

        if (!name) return;

        athletes.push({
          id,
          name,
          team,
          year: normalizeClassYear(classYear),
          hometown: hometown || "",
          highSchool: highSchool || "",
          profileUrl: href.startsWith("http")
            ? href
            : `https://go-knights.net${href}`,
        });
      });
  });

  return athletes;
}

// ---------- LEGACY CARD PARSER (older seasons, e.g. 2014-style pages) ----------

function parseLegacyCards($, team) {
  const athletes = [];
  const seen = new Set();

  const classPattern =
    /(Freshman|Sophomore|Junior|Senior|Graduate|Fr\.?|So\.?|Jr\.?|Sr\.?|Gr\.?)\s*\/\s*([^/]+?)\s*\/\s*([^/\n]+)/i;

  $('a[href*="/roster/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/\/roster\/[^/]+\/(\d+)/);
    if (!match) return;

    const id = match[1];
    if (seen.has(id)) return;

    const name = $(el).text().trim();
    if (!name || /full bio/i.test(name) || name.length < 3) return;

    let container = $(el).parent();
    let text = "";
    for (let i = 0; i < 4 && container.length; i++) {
      text = container.text();
      if (classPattern.test(text)) break;
      container = container.parent();
    }

    const classMatch = text.match(classPattern);
    if (!classMatch) return;

    seen.add(id);
    athletes.push({
      id,
      name,
      team,
      year: normalizeClassYear(classMatch[1]),
      hometown: classMatch[2].trim(),
      highSchool: classMatch[3].trim(),
      profileUrl: href.startsWith("http")
        ? href
        : `https://go-knights.net${href}`,
    });
  });

  return athletes;
}

async function fetchTeamForYear({ baseUrl, team }, year) {
  const url = `${baseUrl}/${year}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (roster-by-year-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${team} ${year}: HTTP ${res.status}`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  let athletes = parseModernTable($, team);
  if (athletes.length === 0) {
    athletes = parseLegacyCards($, team);
    if (athletes.length > 0) console.log(`  (used legacy card parser)`);
  }
  return athletes;
}

async function main() {
  for (const year of YEARS) {
    console.log(`\n=== Season ${year} ===`);
    const allAthletes = [];

    for (const teamConfig of TEAMS) {
      console.log(`Fetching ${teamConfig.team} ${year}...`);
      const athletes = await fetchTeamForYear(teamConfig, year);
      console.log(`  Found ${athletes.length} athletes`);
      allAthletes.push(...athletes);
      await sleep(DELAY_MS);
    }

    if (allAthletes.length === 0) {
      console.warn(`⚠️  No athletes found for ${year} — skipping file write.`);
      continue;
    }

    const shortYear = String(year % 100).padStart(2, "0");
    const outPath = path.resolve(`src/data/distance_roster_${shortYear}.json`);

    const output = {
      generatedAt: new Date().toISOString(),
      season: year,
      sources: TEAMS.map((t) => `${t.baseUrl}/${year}`),
      athletes: allAthletes,
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${allAthletes.length} athletes to ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Failed to fetch rosters by year:", err);
  process.exit(1);
});
