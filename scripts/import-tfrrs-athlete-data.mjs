#!/usr/bin/env node
/**
 * Imports TFRRS personal records and dated race-history entries into one
 * Supabase row per stable TFRRS athlete ID.
 *
 * Use --dry-run to preview without writing, and --tfrrs-id=ID to limit the
 * import to one athlete. Apply supabase/tfrrs_athlete_performance.sql first.
 */

import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const PAGE_SIZE = 1000;
const DELAY_MS = 700;
const PROFILE_ORIGIN = "https://www.tfrrs.org";
const MONTHS = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProfileUrl(tfrrsId, name) {
  if (tfrrsId.startsWith("http")) return tfrrsId;
  const slug = name.replace(/\s+/g, "_");
  return `${PROFILE_ORIGIN}/athletes/${tfrrsId}/Wartburg/${slug}.html`;
}

function absoluteUrl(href) {
  if (!href) return null;
  return new URL(href, PROFILE_ORIGIN).href;
}

function getSeasonType(className, heading, event = "") {
  if (/\bxc\b|\(xc\)/i.test(`${className} ${event}`)) return "cross_country";
  if (/indoor/i.test(`${className} ${heading}`)) return "indoor";
  if (/outdoor/i.test(`${className} ${heading}`)) return "outdoor";

  const month = heading
    .match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i,
    )?.[1]
    ?.toLowerCase();
  if (
    [
      "dec",
      "december",
      "jan",
      "january",
      "feb",
      "february",
      "mar",
      "march",
    ].includes(month)
  ) {
    return "indoor";
  }
  if (["apr", "april", "may", "jun", "june", "jul", "july"].includes(month)) {
    return "outdoor";
  }
  return "track_unspecified";
}

function parseMeetDate(heading) {
  const match = heading.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?,?\s+((?:19|20)\d{2})\b/i,
  );
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}

function parsePersonalRecords($) {
  const records = {
    overall: [],
    cross_country: [],
    indoor: [],
    outdoor: [],
  };
  const tableKinds = [
    ["#all_bests", "overall"],
    ["table.xc_bests", "cross_country"],
    ["table.indoor_bests", "indoor"],
    ["table.outdoor_bests", "outdoor"],
  ];

  for (const [selector, seasonType] of tableKinds) {
    $(selector).each((_, table) => {
      $(table)
        .find("tbody tr")
        .each((_, row) => {
          const cells = $(row).find("td").toArray();
          for (let index = 0; index + 1 < cells.length; index += 2) {
            const event = $(cells[index]).text().trim();
            const resultCell = $(cells[index + 1]);
            const mark = resultCell.text().trim();
            if (!event || !mark) continue;

            records[seasonType].push({
              event,
              mark,
              result_url: absoluteUrl(
                resultCell.find("a").first().attr("href"),
              ),
            });
          }
        });
    });
  }

  return records;
}

function parseRaceHistory($) {
  const races = [];
  const seen = new Set();

  $("table.table-hover").each((_, table) => {
    const tableElement = $(table);
    const heading = tableElement
      .find("thead th")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");
    if (
      !/\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2}/i.test(
        heading,
      )
    ) {
      return;
    }

    const className = tableElement.attr("class") || "";
    const meetName = heading
      .replace(
        /\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}.*$/i,
        "",
      )
      .trim();
    const meetDate = parseMeetDate(heading);

    tableElement.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const event = cells.eq(0).text().trim().replace(/\s+/g, " ");
      const resultCell = cells.eq(1);
      const mark = resultCell.text().trim().replace(/\s+/g, " ");
      const placing = cells.eq(2).text().trim().replace(/\s+/g, " ") || null;
      if (!event || !mark) return;

      const resultUrl = absoluteUrl(resultCell.find("a").first().attr("href"));
      const key = [meetDate, meetName, event, mark, placing, resultUrl].join(
        "|",
      );
      if (seen.has(key)) return;
      seen.add(key);

      const status = /^(DNS|DNF|DQ|DSQ|NT|NH|NM|FOUL)$/i.test(mark)
        ? mark.toUpperCase()
        : "FINISHED";
      races.push({
        event,
        season_type: getSeasonType(className, heading, event),
        meet_name: meetName || heading,
        meet_date: meetDate,
        meet_date_text: heading,
        mark,
        status,
        placing,
        round: placing?.match(/\(([^)]+)\)/)?.[1] ?? null,
        result_url: resultUrl,
      });
    });
  });

  return races;
}

async function fetchAthletePerformance(athlete) {
  const sourceUrl = resolveProfileUrl(athlete.tfrrsId, athlete.name);
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (WXC TFRRS results importer)" },
  });
  if (!response.ok) {
    throw new Error(`TFRRS returned HTTP ${response.status} for ${sourceUrl}`);
  }

  const $ = cheerio.load(await response.text());
  const personalRecords = parsePersonalRecords($);
  const raceHistory = parseRaceHistory($);
  const bestCount = Object.values(personalRecords).reduce(
    (count, records) => count + records.length,
    0,
  );
  if (bestCount === 0 && raceHistory.length === 0) {
    throw new Error(`No recognized PR or race-history tables at ${sourceUrl}`);
  }

  return { sourceUrl, personalRecords, raceHistory };
}

async function fetchRosterAthletes(supabase) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("athletes")
      .select("tfrrs_id, name, season, photo_url")
      .not("tfrrs_id", "is", null)
      .order("season", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const athletesByTfrrsId = new Map();
  for (const row of rows) {
    const tfrrsId = String(row.tfrrs_id);
    const athlete = athletesByTfrrsId.get(tfrrsId);
    if (!athlete) {
      athletesByTfrrsId.set(tfrrsId, {
        tfrrsId,
        name: row.name,
        photoUrl: row.photo_url,
        season: row.season,
      });
      continue;
    }

    if (row.season > athlete.season) {
      athlete.season = row.season;
      athlete.name = row.name;
    }
    if (!athlete.photoUrl && row.photo_url) athlete.photoUrl = row.photo_url;
  }

  return [...athletesByTfrrsId.values()];
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const dryRun = process.argv.includes("--dry-run");
  const requestedTfrrsId = process.argv
    .find((argument) => argument.startsWith("--tfrrs-id="))
    ?.slice("--tfrrs-id=".length);

  let athletes = await fetchRosterAthletes(supabase);
  if (requestedTfrrsId) {
    athletes = athletes.filter(
      (athlete) => athlete.tfrrsId === requestedTfrrsId,
    );
    if (athletes.length === 0) {
      throw new Error(
        `No athlete with TFRRS ID ${requestedTfrrsId} is in Supabase.`,
      );
    }
  }

  console.log(`Importing TFRRS histories for ${athletes.length} athlete(s).`);
  let imported = 0;
  let failed = 0;

  for (let index = 0; index < athletes.length; index++) {
    const athlete = athletes[index];
    try {
      const performance = await fetchAthletePerformance(athlete);
      console.log(
        `[${index + 1}/${athletes.length}] ${athlete.name}: ${performance.raceHistory.length} races, ${Object.values(performance.personalRecords).reduce((count, records) => count + records.length, 0)} PR entries`,
      );

      if (!dryRun) {
        const { error } = await supabase
          .from("tfrrs_athlete_performance")
          .upsert(
            {
              tfrrs_id: athlete.tfrrsId,
              athlete_name: athlete.name,
              photo_url: athlete.photoUrl,
              race_history: performance.raceHistory,
              personal_records: performance.personalRecords,
              source_url: performance.sourceUrl,
              last_imported_at: new Date().toISOString(),
            },
            { onConflict: "tfrrs_id" },
          );
        if (error) throw new Error(error.message);
      }
      imported++;
    } catch (error) {
      failed++;
      console.warn(
        `[${index + 1}/${athletes.length}] ${athlete.name}: ${error.message}`,
      );
    }

    if (index + 1 < athletes.length) await sleep(DELAY_MS);
  }

  console.log(
    `\n${dryRun ? "Dry run inspected" : "Imported"} ${imported} profile(s); ${failed} failed.`,
  );
  if (dryRun) console.log("Supabase was not changed.");
}

main().catch((error) => {
  console.error("Failed to import TFRRS athlete data:", error);
  process.exit(1);
});
