#!/usr/bin/env node
import "dotenv/config";
import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const scheduleUrls = {
  men: (season) =>
    `https://go-knights.net/sports/mens-cross-country/schedule/${season}`,
  women: (season) =>
    `https://go-knights.net/sports/womens-cross-country/schedule/${season}`,
};

function text($, element, selector) {
  return $(element).find(selector).first().text().replace(/\s+/g, " ").trim();
}

function absoluteUrl(url, sourceUrl) {
  return url ? new URL(url, sourceUrl).toString() : null;
}

function parseDate(value, season) {
  const withoutDay = value.replace(/\s*\([^)]*\)/, "").trim();
  const date = new Date(`${withoutDay} ${season} 00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Could not parse schedule date "${value}" for ${season}`);
  }
  return date.toISOString().slice(0, 10);
}

async function fetchSchedule(gender, season) {
  const scheduleUrl = scheduleUrls[gender](season);
  const response = await fetch(scheduleUrl, {
    headers: { "user-agent": "WXC Website schedule importer" },
  });
  if (!response.ok) {
    throw new Error(`${scheduleUrl} returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const rows = [];

  $(".sidearm-schedule-game").each((_, element) => {
    const dateText = text($, element, ".sidearm-schedule-game-opponent-date span");
    const opponentLink = $(element)
      .find(".sidearm-schedule-game-opponent-name a")
      .first();
    const links = $(element).find(".sidearm-schedule-game-links a");
    const resultText = text($, element, ".sidearm-schedule-game-result");
    const locationParts = $(element)
      .find(".sidearm-schedule-game-location > span")
      .map((__, location) => $(location).text().trim())
      .get()
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index);

    if (!dateText || !opponentLink.text().trim()) return;

    const recapLink = links
      .filter((__, link) => $(link).text().trim().toLowerCase() === "recap")
      .first();

    rows.push({
      season,
      gender,
      meet_name: opponentLink.text().replace(/\s+/g, " ").trim(),
      meet_date: parseDate(dateText, season),
      meet_time: opponentLink.attr("aria-label")?.match(/on .*? (\d{1,2}:\d{2} [AP]M)/)?.[1] ?? null,
      location: locationParts.join(" — ") || null,
      result_summary: resultText || null,
      status: $(element).hasClass("sidearm-schedule-game-completed")
        ? "completed"
        : "scheduled",
      meet_url: absoluteUrl(opponentLink.attr("href"), scheduleUrl),
      recap_url: absoluteUrl(recapLink.attr("href"), scheduleUrl),
      schedule_url: scheduleUrl,
    });
  });

  return rows;
}

async function main() {
  const seasonStart = Number(process.argv[2] ?? new Date().getFullYear());
  const seasonEnd = Number(process.argv[3] ?? seasonStart);
  const dryRun = process.argv.includes("--dry-run");
  if (
    !Number.isInteger(seasonStart) ||
    !Number.isInteger(seasonEnd) ||
    seasonStart < 2000 ||
    seasonEnd < seasonStart
  ) {
    throw new Error(
      "Usage: node scripts/import-cross-country-schedule.mjs <start-season> [end-season] [--dry-run]",
    );
  }

  const rows = [];
  for (let season = seasonStart; season <= seasonEnd; season += 1) {
    rows.push(
      ...(await fetchSchedule("men", season)),
      ...(await fetchSchedule("women", season)),
    );
    console.log(`Parsed ${rows.length} total schedule rows through ${season}.`);
  }

  console.table(rows);
  if (dryRun) return;

  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from("cross_country_meets")
    .upsert(rows, { onConflict: "season,gender,meet_date,meet_name" });
  if (error) throw new Error(error.message);

  console.log(
    `Imported ${rows.length} schedule rows for ${seasonStart}-${seasonEnd} into cross_country_meets.`,
  );
}

main().catch((error) => {
  console.error("Failed to import cross-country schedule:", error);
  process.exit(1);
});
