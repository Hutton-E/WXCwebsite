#!/usr/bin/env node
/**
 * fetch-roster.mjs
 *
 * Fetches the current-season men's and women's cross country rosters from
 * go-knights.net and writes structured JSON to src/data/distance_roster_26.json.
 *
 * IMPORTANT: go-knights.net's no-year roster URL doesn't always point at the
 * newest season for every team (e.g. it kept showing 2025 for women's after
 * 2026 rosters existed). Explicit year URLs are used below instead of relying
 * on the default, so this always pulls the season you actually specify.
 *
 * Merges into any existing output file rather than overwriting it, so
 * previously-matched `tfrrsId` fields (from fetch-tfrrs-ids.mjs) aren't lost.
 *
 * Update CURRENT_SEASON below at the start of each new season.
 *
 * Usage: node scripts/fetch-roster.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const CURRENT_SEASON = 2026;

const TEAMS = [
  {
    url: `https://go-knights.net/sports/mens-cross-country/roster/${CURRENT_SEASON}`,
    team: "mens-cross-country",
  },
  {
    url: `https://go-knights.net/sports/womens-cross-country/roster/${CURRENT_SEASON}`,
    team: "womens-cross-country",
  },
];

const OUT_PATH = path.resolve("src/data/distance_roster_26.json");

async function fetchTeamRoster({ url, team }) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (roster-fetch-script)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

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

        const year = $(cells[1]).text().trim();

        const hometownRaw = $(cells[2]).text().trim();
        const [hometown, highSchool] = hometownRaw
          .split("/")
          .map((s) => s.trim());

        if (!name) return;

        athletes.push({
          id,
          name,
          team,
          year,
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

function loadExistingAthletes() {
  if (!fs.existsSync(OUT_PATH)) return [];
  try {
    const existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    return existing.athletes || [];
  } catch {
    console.warn("⚠️  Could not parse existing output file — starting fresh.");
    return [];
  }
}

async function main() {
  const freshAthletes = [];

  for (const teamConfig of TEAMS) {
    console.log(`Fetching ${teamConfig.team} (${CURRENT_SEASON})...`);
    const athletes = await fetchTeamRoster(teamConfig);
    console.log(`  Found ${athletes.length} athletes`);
    freshAthletes.push(...athletes);
  }

  if (freshAthletes.length === 0) {
    console.error(
      "⚠️  No athletes found. The site's table structure may have changed — " +
        "inspect the page HTML and update the selectors in this script.",
    );
    process.exit(1);
  }

  // Merge with existing data so previously-matched tfrrsId fields survive.
  const existingAthletes = loadExistingAthletes();
  const existingById = new Map(existingAthletes.map((a) => [a.id, a]));

  const mergedAthletes = freshAthletes.map((fresh) => {
    const prior = existingById.get(fresh.id);
    return prior ? { ...fresh, tfrrsId: prior.tfrrsId } : fresh;
  });

  const carriedOverCount = mergedAthletes.filter((a) => a.tfrrsId).length;

  const output = {
    generatedAt: new Date().toISOString(),
    season: CURRENT_SEASON,
    sources: TEAMS.map((t) => t.url),
    athletes: mergedAthletes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✅ Wrote ${mergedAthletes.length} athletes to ${OUT_PATH}`);
  console.log(`   ${carriedOverCount} carried over an existing tfrrsId match.`);
  console.log(
    `   ${mergedAthletes.length - carriedOverCount} still need tfrrsId — run fetch-tfrrs-ids.mjs.`,
  );
}

main().catch((err) => {
  console.error("Failed to fetch roster:", err);
  process.exit(1);
});
