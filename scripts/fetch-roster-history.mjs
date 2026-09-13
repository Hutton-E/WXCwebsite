#!/usr/bin/env node
/**
 * fetch-roster-history.mjs
 *
 * Fetches every available season of the men's and women's cross country
 * rosters from go-knights.net and merges them into ONE record per athlete,
 * with a `seasons` array showing which years they were on the roster.
 *
 * IMPORTANT: the numeric ID in each roster URL is NOT a stable per-athlete
 * ID — it's a per-season roster entry ID that changes every year, even for
 * the same person. So athletes are deduped by (name + hometown) instead,
 * and each season entry keeps its own id/profileUrl.
 *
 * Handles two page formats:
 *  - Modern Sidearm: an accessible <table> with "Academic Year" /
 *    "Hometown/High School" headers.
 *  - Legacy Sidearm (e.g. 2014 and earlier): a card list with no table —
 *    name as a link, followed by an italic "Class / City / School" line.
 *
 * Writes src/data/roster_history.json — separate from distance_roster_26.json,
 * which remains the current-season login list.
 *
 * Usage: node scripts/fetch-roster-history.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

// Confirmed available seasons per team (2008 is missing from both;
// some earlier years may use the legacy card format or not exist at all).
const MENS_YEARS = [2007, ...range(2009, 2026)];
const WOMENS_YEARS = [2007, ...range(2009, 2025)];

const TEAMS = [
  {
    team: "mens-cross-country",
    baseUrl: "https://go-knights.net/sports/mens-cross-country/roster",
    years: MENS_YEARS,
    currentYear: 2026, // uses the base URL with no year suffix
  },
  {
    team: "womens-cross-country",
    baseUrl: "https://go-knights.net/sports/womens-cross-country/roster",
    years: WOMENS_YEARS,
    currentYear: 2026, // uses the base URL with no year suffix
  },
];

const OUT_PATH = path.resolve("src/data/roster_history.json");
const DELAY_MS = 800;

const CLASS_YEAR_MAP = {
  freshman: "Fr.",
  sophomore: "So.",
  junior: "Jr.",
  senior: "Sr.",
  graduate: "Gr.",
};

function range(start, end) {
  const out = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeClassYear(raw) {
  const cleaned = raw.trim().replace(/\.$/, "").toLowerCase();
  return CLASS_YEAR_MAP[cleaned] || raw.trim();
}

function makeMergeKey(name, hometown) {
  return `${name.trim().toLowerCase()}|${(hometown || "").trim().toLowerCase()}`;
}

// ---------- MODERN TABLE PARSER ----------

function parseModernTable($, team, year) {
  const entries = [];

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

        if (!name || !id) return;

        entries.push({
          id,
          name,
          team,
          season: year,
          classYear: normalizeClassYear(classYear),
          hometown: hometown || "",
          highSchool: highSchool || "",
          profileUrl: href.startsWith("http")
            ? href
            : `https://go-knights.net${href}`,
        });
      });
  });

  return entries;
}

// ---------- LEGACY CARD PARSER ----------

// Older Sidearm templates (e.g. 2014) have no accessible <table> at all —
// just a card layout: name as a link, then an italic
// "Freshman / City, State / High School" line, then a "Full Bio" link.
// This scans every profile link and pulls the nearby class/hometown/school
// text using a regex instead of relying on table structure.
function parseLegacyCards($, team, year) {
  const entries = [];
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
    // Skip links whose visible text is something like "Full Bio", not a name
    if (!name || /full bio/i.test(name) || name.length < 3) return;

    // Look at the nearest reasonably-sized container's text for the
    // "Class / City / School" line. Walk up a few ancestor levels and
    // stop at the first one whose text contains the pattern.
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
    entries.push({
      id,
      name,
      team,
      season: year,
      classYear: normalizeClassYear(classMatch[1]),
      hometown: classMatch[2].trim(),
      highSchool: classMatch[3].trim(),
      profileUrl: href.startsWith("http")
        ? href
        : `https://go-knights.net${href}`,
    });
  });

  return entries;
}

// ---------- FETCH ONE SEASON ----------

async function fetchSeasonRoster({ baseUrl, team, year, currentYear }) {
  const url = year === currentYear ? baseUrl : `${baseUrl}/${year}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (roster-history-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${team} ${year}: HTTP ${res.status}`);
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  let entries = parseModernTable($, team, year);
  if (entries.length === 0) {
    entries = parseLegacyCards($, team, year);
    if (entries.length > 0) {
      console.log(`  (used legacy card parser)`);
    }
  }

  return entries;
}

// ---------- MAIN ----------

async function main() {
  // Keyed by "name|hometown" since the numeric roster ID is NOT stable
  // across seasons for the same person.
  const athletesByKey = new Map();

  for (const teamConfig of TEAMS) {
    for (const year of teamConfig.years) {
      console.log(`Fetching ${teamConfig.team} ${year}...`);
      const entries = await fetchSeasonRoster({ ...teamConfig, year });
      console.log(`  Found ${entries.length} athletes`);

      for (const entry of entries) {
        const key = makeMergeKey(entry.name, entry.hometown);
        const existing = athletesByKey.get(key);

        if (!existing) {
          athletesByKey.set(key, {
            name: entry.name,
            team: entry.team,
            hometown: entry.hometown,
            highSchool: entry.highSchool,
            seasons: [
              {
                season: entry.season,
                classYear: entry.classYear,
                id: entry.id,
                profileUrl: entry.profileUrl,
              },
            ],
          });
        } else {
          existing.seasons.push({
            season: entry.season,
            classYear: entry.classYear,
            id: entry.id,
            profileUrl: entry.profileUrl,
          });
          // Keep the most recent season's high school as the canonical
          // display value (hometown is part of the merge key, so it's
          // already consistent across seasons for a given record).
          const maxSeason = Math.max(...existing.seasons.map((s) => s.season));
          if (entry.season === maxSeason) {
            existing.highSchool = entry.highSchool || existing.highSchool;
          }
        }
      }

      await sleep(DELAY_MS);
    }
  }

  const athletes = Array.from(athletesByKey.values()).map((a) => ({
    ...a,
    seasons: a.seasons.sort((x, y) => x.season - y.season),
  }));

  athletes.sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    generatedAt: new Date().toISOString(),
    sources: TEAMS.map((t) => t.baseUrl),
    totalAthletes: athletes.length,
    athletes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✅ Wrote ${athletes.length} unique athletes to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch roster history:", err);
  process.exit(1);
});
