#!/usr/bin/env node
/**
 * Fetches available Sidearm roster portraits and updates matching athlete rows
 * in Supabase by their season-specific roster entry ID.
 *
 * Run `npm run fetch-roster-photos -- --dry-run` to inspect coverage first.
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const SITE_ORIGIN = "https://go-knights.net";
const CDN_ORIGIN = "https://dxbhsrqyrr690.cloudfront.net";
const IMAGE_ORIGIN = "https://images.sidearmdev.com/resize";
const UPDATE_BATCH_SIZE = 8;

const TEAMS = [
  {
    baseUrl: `${SITE_ORIGIN}/sports/mens-cross-country/roster`,
    team: "mens-cross-country",
  },
  {
    baseUrl: `${SITE_ORIGIN}/sports/womens-cross-country/roster`,
    team: "womens-cross-country",
  },
];

function createPhotoUrl(rawImageUrl) {
  const image = new URL(rawImageUrl, SITE_ORIGIN);
  if (!image.pathname.startsWith("/images/")) return null;

  const sourceUrl = `${CDN_ORIGIN}/sidearm.nextgen.sites/go-knights.net${image.pathname}`;
  return `${IMAGE_ORIGIN}?url=${encodeURIComponent(sourceUrl)}&width=146&type=webp`;
}

async function fetchRosterPhotos({ baseUrl, team }, season) {
  const url = `${baseUrl}/${season}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (roster-photo-script)" },
  });
  if (!response.ok) {
    console.warn(`  ${team}: HTTP ${response.status}; skipping`);
    return [];
  }

  const $ = cheerio.load(await response.text());
  const photosById = new Map();

  $("img").each((_, element) => {
    const image = $(element);
    const rawImageUrl = image.attr("data-src") || image.attr("src");
    if (!rawImageUrl) return;

    const photoUrl = createPhotoUrl(rawImageUrl);
    if (!photoUrl) return;

    const profileHref = image.closest('a[href*="/roster/"]').attr("href") || "";
    const match = profileHref.match(/\/roster\/[^/]+\/(\d+)(?:[/?#]|$)/);
    if (!match) return;

    photosById.set(match[1], photoUrl);
  });

  return [...photosById].map(([id, photoUrl]) => ({ id, photoUrl, season }));
}

async function updatePhotos(supabase, photos) {
  let updated = 0;

  for (let index = 0; index < photos.length; index += UPDATE_BATCH_SIZE) {
    const batch = photos.slice(index, index + UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ id, season, photoUrl }) => {
        const { data, error } = await supabase
          .from("athletes")
          .update({ photo_url: photoUrl })
          .eq("id", id)
          .eq("season", season)
          .select("id");

        if (error) throw new Error(`${season}/${id}: ${error.message}`);
        return data?.length ?? 0;
      }),
    );
    updated += results.reduce((sum, count) => sum + count, 0);
  }

  return updated;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rosterPhotos = [];

  for (const season of YEARS) {
    console.log(`\nSeason ${season}`);
    for (const team of TEAMS) {
      const photos = await fetchRosterPhotos(team, season);
      console.log(`  ${team.team}: ${photos.length} portraits`);
      rosterPhotos.push(...photos);
    }
  }

  console.log(`\nFound ${rosterPhotos.length} photo entries across ${YEARS.length} seasons.`);
  if (dryRun) {
    console.log("Dry run complete; Supabase was not changed.");
    return;
  }

  const supabase = await getAuthenticatedSupabaseClient();
  const updated = await updatePhotos(supabase, rosterPhotos);
  console.log(`Updated ${updated} matching athlete rows in Supabase.`);
  console.log(`${rosterPhotos.length - updated} photo entries had no matching athlete row.`);
}

main().catch((error) => {
  console.error("Failed to fetch roster photos:", error);
  process.exit(1);
});