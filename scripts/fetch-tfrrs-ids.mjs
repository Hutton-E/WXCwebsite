#!/usr/bin/env node
/**
 * fetch-tfrrs-ids.mjs
 *
 * Matches current-season athletes in Supabase's `athletes` table against
 * the current TFRRS team roster pages, and writes tfrrs_id back to Supabase.
 *
 * Usage: node scripts/fetch-tfrrs-ids.mjs
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

const CURRENT_SEASON = 2026;

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

// Confirmed manual matches from earlier spelling/nickname mismatches.
// IMPORTANT: if you've added more overrides since, merge them in here.
const MANUAL_OVERRIDES = {
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
  "cameron noreen": "8271797",
  "alex childs": "6915220",
  "maria colette choi lei": "9017626",
  "benjamin rhodes": "7699569",
  "madison prier": "8352882",
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
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

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();

  const allTfrrsEntries = [];
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`Fetching TFRRS roster for ${team}...`);
    const entries = await fetchTfrrsRoster(url);
    console.log(`  Found ${entries.length} TFRRS entries`);
    allTfrrsEntries.push(...entries);
  }

  const { data: roster, error: fetchError } = await supabase
    .from("athletes")
    .select("id, name, tfrrs_id")
    .eq("season", CURRENT_SEASON);

  if (fetchError) throw new Error(fetchError.message);

  let matched = 0;
  const unmatched = [];
  const updates = [];

  for (const athlete of roster) {
    let tfrrsId = athlete.tfrrs_id;

    if (!tfrrsId) {
      if (MANUAL_OVERRIDES[normalize(athlete.name)]) {
        tfrrsId = MANUAL_OVERRIDES[normalize(athlete.name)];
      } else {
        const match = allTfrrsEntries.find(
          (e) => e.normalizedName === normalize(athlete.name),
        );
        if (match) tfrrsId = match.tfrrsId;
      }
    }

    if (tfrrsId) {
      matched++;
      if (tfrrsId !== athlete.tfrrs_id) {
        updates.push({ id: athlete.id, tfrrs_id: tfrrsId });
      }
    } else {
      unmatched.push(athlete.name);
    }
  }

  for (const update of updates) {
    const { error } = await supabase
      .from("athletes")
      .update({ tfrrs_id: update.tfrrs_id })
      .eq("id", update.id)
      .eq("season", CURRENT_SEASON);
    if (error) console.error(`Failed to update ${update.id}: ${error.message}`);
  }

  console.log(
    `\n✅ Matched ${matched}/${roster.length} athletes. Updated ${updates.length} rows in Supabase.`,
  );
  if (unmatched.length > 0) {
    console.log(
      `\n⚠️  Could not match ${unmatched.length} athletes automatically:`,
    );
    unmatched.forEach((n) => console.log(`   - ${n}`));
    console.log("\nAdd confirmed matches to MANUAL_OVERRIDES in this script.");
  }
}

main().catch((err) => {
  console.error("Failed to match TFRRS IDs:", err);
  process.exit(1);
});
