#!/usr/bin/env node
/**
 * fetch-roster.mjs
 *
 * Fetches the current-season men's and women's cross country rosters from
 * go-knights.net and upserts them DIRECTLY into the Supabase `athletes`
 * table — no local JSON file involved.
 *
 * Preserves any existing tfrrs_id already stored for an athlete, so
 * re-running this to pick up new/changed roster entries never wipes out
 * previously-matched TFRRS IDs.
 *
 * Update CURRENT_SEASON below at the start of each new season.
 *
 * Usage: node scripts/fetch-roster.mjs
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

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

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();

  const freshAthletes = [];
  for (const teamConfig of TEAMS) {
    console.log(`Fetching ${teamConfig.team} (${CURRENT_SEASON})...`);
    const athletes = await fetchTeamRoster(teamConfig);
    console.log(`  Found ${athletes.length} athletes`);
    freshAthletes.push(...athletes);
  }

  if (freshAthletes.length === 0) {
    console.error(
      "⚠️  No athletes found. The site's table structure may have changed — inspect and update selectors.",
    );
    process.exit(1);
  }

  // Preserve existing tfrrs_id for anyone already in Supabase for this season.
  const { data: existing, error: fetchError } = await supabase
    .from("athletes")
    .select("id, tfrrs_id")
    .eq("season", CURRENT_SEASON);

  if (fetchError) throw new Error(fetchError.message);

  const existingTfrrsById = new Map(
    (existing ?? []).map((a) => [a.id, a.tfrrs_id]),
  );

  const payload = freshAthletes.map((a) => ({
    id: a.id,
    season: CURRENT_SEASON,
    name: a.name,
    team: a.team,
    hometown: a.hometown || null,
    high_school: a.highSchool || null,
    tfrrs_id: existingTfrrsById.get(a.id) ?? null,
  }));

  const { error, count } = await supabase
    .from("athletes")
    .upsert(payload, { onConflict: "id,season", count: "exact" });

  if (error) throw new Error(error.message);

  const carriedOver = payload.filter((a) => a.tfrrs_id).length;

  console.log(
    `\n✅ Upserted ${count ?? payload.length} athletes into Supabase (season ${CURRENT_SEASON}).`,
  );
  console.log(`   ${carriedOver} carried over an existing tfrrs_id.`);
  console.log(
    `   ${payload.length - carriedOver} still need tfrrs_id — run fetch-tfrrs-ids.mjs.`,
  );
}

main().catch((err) => {
  console.error("Failed to fetch roster:", err);
  process.exit(1);
});
