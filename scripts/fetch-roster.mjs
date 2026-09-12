#!/usr/bin/env node
/**
 * fetch-roster.mjs
 *
 * Fetches the men's and women's cross country rosters from go-knights.net,
 * parses the roster table, and writes structured JSON to src/data/roster.json.
 *
 * Run this whenever the roster changes (each new season).
 *
 * Usage: node scripts/fetch-roster.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const TEAMS = [
  {
    url: "https://go-knights.net/sports/mens-cross-country/roster",
    team: "mens-cross-country",
  },
  {
    url: "https://go-knights.net/sports/womens-cross-country/roster",
    team: "womens-cross-country",
  },
];

const OUT_PATH = path.resolve("src/data/roster.json");

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

  // Sidearm roster pages include an accessible <table> with headers like
  // "Full Name", "Academic Year", "Hometown / High School". Find it generically
  // by header text so this doesn't break if class names change.
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

async function main() {
  const allAthletes = [];

  for (const teamConfig of TEAMS) {
    console.log(`Fetching ${teamConfig.team}...`);
    const athletes = await fetchTeamRoster(teamConfig);
    console.log(`  Found ${athletes.length} athletes`);
    allAthletes.push(...athletes);
  }

  if (allAthletes.length === 0) {
    console.error(
      "⚠️  No athletes found. The site's table structure may have changed — " +
        "inspect the page HTML and update the selectors in this script.",
    );
    process.exit(1);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sources: TEAMS.map((t) => t.url),
    athletes: allAthletes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`✅ Wrote ${allAthletes.length} athletes to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch roster:", err);
  process.exit(1);
});
