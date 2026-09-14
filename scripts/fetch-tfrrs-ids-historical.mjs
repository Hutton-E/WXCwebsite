#!/usr/bin/env node
/**
 * fetch-tfrrs-ids-historical.mjs
 *
 * Reads TFRRS's season dropdown on each team page, fetches every historical
 * season's roster snapshot (TFRRS assigns one permanent ID per athlete
 * across their career), and applies the resulting name -> tfrrsId lookup to
 * EVERY row in Supabase's `athletes` table across ALL seasons.
 *
 * Usage: node scripts/fetch-tfrrs-ids-historical.mjs
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

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

// IMPORTANT: merge in any additional overrides you've added since this was last synced.
const MANUAL_OVERRIDES = {
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

function findXcSeasonOptions($) {
  const options = [];
  $("select option").each((_, el) => {
    const value = $(el).attr("value");
    const text = $(el).text().trim();
    if (!value) return;
    if (/cross country/i.test(text)) options.push({ value, text });
  });
  return options;
}

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
        const rawName = link.text().trim();
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

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();

  const nameToId = new Map();
  for (const [name, id] of Object.entries(MANUAL_OVERRIDES)) {
    nameToId.set(name, id);
  }

  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`\n=== ${team} ===`);
    const $base = await fetchPage(url);
    if (!$base) continue;

    const seasonOptions = findXcSeasonOptions($base);
    console.log(`Found ${seasonOptions.length} Cross Country season option(s)`);

    const baseEntries = parseRosterTable($base);
    baseEntries.forEach((e) => {
      if (!nameToId.has(e.normalizedName))
        nameToId.set(e.normalizedName, e.tfrrsId);
    });

    const cleanBaseUrl = url.replace(/\.html$/, "");
    for (const { value, text } of seasonOptions) {
      const seasonUrl = `${cleanBaseUrl}?config_hnd=${value}`;
      const $season = await fetchPage(seasonUrl);
      await sleep(DELAY_MS);
      if (!$season) continue;

      const entries = parseRosterTable($season);
      let added = 0;
      entries.forEach((e) => {
        if (!nameToId.has(e.normalizedName)) {
          nameToId.set(e.normalizedName, e.tfrrsId);
          added++;
        }
      });
      console.log(`  ${text}: ${entries.length} athletes, +${added} new`);
    }
  }

  console.log(`\nTotal known name -> tfrrsId matches: ${nameToId.size}`);

  const { data: allAthletes, error: fetchError } = await supabase
    .from("athletes")
    .select("id, season, name, tfrrs_id");

  if (fetchError) throw new Error(fetchError.message);

  let matched = 0;
  const stillUnmatched = new Set();
  const updates = [];

  for (const athlete of allAthletes) {
    if (athlete.tfrrs_id) {
      matched++;
      continue;
    }
    const id = nameToId.get(normalize(athlete.name));
    if (id) {
      matched++;
      updates.push({ id: athlete.id, season: athlete.season, tfrrs_id: id });
    } else {
      stillUnmatched.add(athlete.name);
    }
  }

  console.log(`\nApplying ${updates.length} updates to Supabase...`);
  for (const update of updates) {
    const { error } = await supabase
      .from("athletes")
      .update({ tfrrs_id: update.tfrrs_id })
      .eq("id", update.id)
      .eq("season", update.season);
    if (error)
      console.error(
        `Failed to update ${update.id}/${update.season}: ${error.message}`,
      );
  }

  console.log(
    `\n✅ Overall: ${matched}/${allAthletes.length} rows now have a tfrrs_id.`,
  );
  if (stillUnmatched.size > 0) {
    console.log(`\n⚠️  ${stillUnmatched.size} name(s) still unmatched:`);
    [...stillUnmatched].sort().forEach((n) => console.log(`   - ${n}`));
  }
}

main().catch((err) => {
  console.error("Failed historical TFRRS ID matching:", err);
  process.exit(1);
});
