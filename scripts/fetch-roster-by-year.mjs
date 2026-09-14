#!/usr/bin/env node
/**
 * fetch-roster-by-year.mjs
 *
 * Fetches men's + women's cross country rosters from go-knights.net for
 * each year listed in YEARS and upserts them DIRECTLY into the Supabase
 * `athletes` table — no local JSON files.
 *
 * Handles two page formats:
 *  - Modern Sidearm: an accessible <table>.
 *  - Legacy Sidearm (e.g. 2014 and earlier): a card list with no table.
 *
 * Usage: node scripts/fetch-roster-by-year.mjs
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

        const hometownRaw = $(cells[2]).text().trim();
        const [hometown, highSchool] = hometownRaw
          .split("/")
          .map((s) => s.trim());

        if (!name || !id) return;

        athletes.push({
          id,
          name,
          team,
          hometown: hometown || "",
          highSchool: highSchool || "",
        });
      });
  });

  return athletes;
}

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
      hometown: classMatch[2].trim(),
      highSchool: classMatch[3].trim(),
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
  const supabase = await getAuthenticatedSupabaseClient();

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
      console.warn(`⚠️  No athletes found for ${year} — skipping.`);
      continue;
    }

    // Preserve any existing tfrrs_id already stored for this season.
    const { data: existing, error: fetchError } = await supabase
      .from("athletes")
      .select("id, tfrrs_id")
      .eq("season", year);

    if (fetchError) {
      console.error(
        `  Failed to read existing rows for ${year}: ${fetchError.message}`,
      );
      continue;
    }

    const existingTfrrsById = new Map(
      (existing ?? []).map((a) => [a.id, a.tfrrs_id]),
    );

    const payload = allAthletes.map((a) => ({
      id: a.id,
      season: year,
      name: a.name,
      team: a.team,
      hometown: a.hometown || null,
      high_school: a.highSchool || null,
      tfrrs_id: existingTfrrsById.get(a.id) ?? null,
    }));

    const { error, count } = await supabase
      .from("athletes")
      .upsert(payload, { onConflict: "id,season", count: "exact" });

    if (error) {
      console.error(`  Failed to upsert ${year}: ${error.message}`);
      continue;
    }

    console.log(
      `✅ Upserted ${count ?? payload.length} athletes for season ${year}`,
    );
  }
}

main().catch((err) => {
  console.error("Failed to fetch rosters by year:", err);
  process.exit(1);
});
