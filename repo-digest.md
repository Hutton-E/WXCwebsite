# Repository Digest

Generated: 2026-09-14T17:21:50.096Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── mileageSheets/
│   ├── XC 2026 Mileage 9-14.pdf
│   ├── XC 2026 Mileage 9-7.pdf
│   ├── XC 2026 Workouts 9-11.pdf
│   └── XC 2026 Workouts 9-8.pdf
├── public/
├── scripts/
│   ├── fetch-roster-by-year.mjs
│   ├── fetch-roster-history.mjs
│   ├── fetch-roster.mjs
│   ├── fetch-tfrrs-ids-all-years.mjs
│   ├── fetch-tfrrs-ids-historical.mjs
│   ├── fetch-tfrrs-ids.mjs
│   ├── fetch-tfrrs-stats.mjs
│   ├── migrate-core-to-supabase.mjs
│   ├── migrate-fms-to-supabase.mjs
│   └── migrate-roster-to-supabase.mjs
├── src/
│   ├── assets/
│   │   ├── fonts/
│   │   │   └── Acme-Regular.ttf
│   │   ├── icons/
│   │   │   └── back_icon.png
│   │   └── still_pictures/
│   │       ├── wartburg_drone_1.png
│   │       ├── wartburg_knights_logo_main.png
│   │       ├── wartburg_knights_logo.png
│   │       └── wartburg_logo.png
│   ├── components/
│   │   ├── backButton.tsx
│   │   ├── background.tsx
│   │   ├── comingSoon.tsx
│   │   ├── identityLookup.tsx
│   │   ├── navMenu.tsx
│   │   ├── requireAdmin.tsx
│   │   ├── requireIdentity.tsx
│   │   └── switchIdentity.tsx
│   ├── context/
│   │   ├── AdminAuthContext.tsx
│   │   └── UserContext.tsx
│   ├── data/
│   │   ├── core_routine.json
│   │   ├── fms_exercises.json
│   │   ├── rawFMSassignments.ts
│   │   └── tfrrs_stats.json
│   ├── lib/
│   │   ├── adminData.ts
│   │   ├── aliasData.ts
│   │   ├── athleteData.ts
│   │   ├── coreData.ts
│   │   ├── fmsData.ts
│   │   ├── mileageData.ts
│   │   ├── nameMatching.ts
│   │   ├── pdfParser.ts
│   │   ├── supabaseAdminClient.mjs
│   │   ├── supabaseClient.ts
│   │   └── workoutData.ts
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── adminDashboard.tsx
│   │   ├── adminFmsAssignments.tsx
│   │   ├── adminLogin.tsx
│   │   ├── corePage.tsx
│   │   ├── error.tsx
│   │   ├── fmsPage.tsx
│   │   ├── home.tsx
│   │   ├── liftingSheet.tsx
│   │   ├── mileagePage.tsx
│   │   ├── name_lookup.tsx
│   │   ├── tfrrsStats.tsx
│   │   └── workoutPages.tsx
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── repo-digest.md
├── repo-digest.mjs
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## File Contents

### `mileageSheets/XC 2026 Mileage 9-14.pdf`

_(binary or excluded — contents not inlined)_

### `mileageSheets/XC 2026 Mileage 9-7.pdf`

_(binary or excluded — contents not inlined)_

### `mileageSheets/XC 2026 Workouts 9-11.pdf`

_(binary or excluded — contents not inlined)_

### `mileageSheets/XC 2026 Workouts 9-8.pdf`

_(binary or excluded — contents not inlined)_

### `scripts/fetch-roster-by-year.mjs`

```javascript
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

```

### `scripts/fetch-roster-history.mjs`

```javascript
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

```

### `scripts/fetch-roster.mjs`

```javascript
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

```

### `scripts/fetch-tfrrs-ids-all-years.mjs`

```javascript
#!/usr/bin/env node
/**
 * fetch-tfrrs-ids-all-years.mjs
 *
 * Adds tfrrsId to every athlete across ALL src/data/distance_roster_*.json
 * files, without re-scraping TFRRS once per season.
 *
 * How it works:
 *   1. Builds a "name -> tfrrsId" lookup by:
 *      a) Reading every already-known tfrrsId out of your existing
 *         distance_roster_*.json files (distance_roster_26.json in
 *         particular already has most matches from earlier work).
 *      b) Fetching the CURRENT TFRRS team rosters (men's + women's) for
 *         any names not already covered.
 *   2. Applies that lookup, by normalized name, to every athlete in every
 *      distance_roster_*.json file that doesn't already have a tfrrsId.
 *
 * IMPORTANT LIMITATION: TFRRS's team roster page only lists CURRENTLY
 * ACTIVE athletes. Graduated/former athletes who only appear in older
 * seasons (e.g. distance_roster_18.json) will NOT be found this way —
 * this is the same limitation discussed earlier for historical data.
 * Those will be reported as unmatched; add them to MANUAL_OVERRIDES below
 * if you look up their TFRRS profile by hand.
 *
 * Usage: node scripts/fetch-tfrrs-ids-all-years.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_DIR = path.resolve("src/data");

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

// Keyed by normalized name. Add entries here for athletes you've manually
// found on TFRRS (e.g. graduated athletes not on the current team page,
// or spelling mismatches like "Philip"/"Phillip").
const MANUAL_OVERRIDES = {
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim();
}

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter(
      (f) =>
        /^distance_roster_\d+\.json$/.test(f) ||
        f === "distance_roster_26.json",
    )
    .map((f) => path.join(DATA_DIR, f));
}

function loadRoster(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveRoster(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function fetchCurrentTfrrsRoster(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (tfrrs-all-years-script)" },
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
        const rawName = link.text().trim(); // "Last, First"
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
  const rosterFiles = findRosterFiles();
  if (rosterFiles.length === 0) {
    console.error(`No distance_roster_*.json files found in ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${rosterFiles.length} roster file(s):`);
  rosterFiles.forEach((f) => console.log(`  - ${path.basename(f)}`));

  // ---------- Step 1: seed the lookup from existing tfrrsId values ----------
  const nameToId = new Map();

  for (const [normalizedName, id] of Object.entries(MANUAL_OVERRIDES)) {
    nameToId.set(normalizedName, id);
  }

  const rosters = rosterFiles.map((filePath) => ({
    filePath,
    data: loadRoster(filePath),
  }));

  for (const { data } of rosters) {
    for (const athlete of data.athletes) {
      if (athlete.tfrrsId && !nameToId.has(normalize(athlete.name))) {
        nameToId.set(normalize(athlete.name), athlete.tfrrsId);
      }
    }
  }

  console.log(
    `\nSeeded ${nameToId.size} known name -> tfrrsId matches from existing files + overrides.`,
  );

  // ---------- Step 2: fetch current TFRRS roster for anything new ----------
  console.log(`\nFetching current TFRRS rosters for any additional matches...`);
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`  ${team}...`);
    const entries = await fetchCurrentTfrrsRoster(url);
    let added = 0;
    for (const entry of entries) {
      if (!nameToId.has(entry.normalizedName)) {
        nameToId.set(entry.normalizedName, entry.tfrrsId);
        added++;
      }
    }
    console.log(`    +${added} new names added to lookup`);
  }

  console.log(`\nTotal known name -> tfrrsId matches: ${nameToId.size}`);

  // ---------- Step 3: apply the lookup to every roster file ----------
  let grandTotalMatched = 0;
  let grandTotalAthletes = 0;
  const stillUnmatched = new Set();

  for (const { filePath, data } of rosters) {
    let matchedInFile = 0;

    for (const athlete of data.athletes) {
      grandTotalAthletes++;
      if (athlete.tfrrsId) {
        matchedInFile++;
        continue;
      }
      const id = nameToId.get(normalize(athlete.name));
      if (id) {
        athlete.tfrrsId = id;
        matchedInFile++;
      } else {
        stillUnmatched.add(athlete.name);
      }
    }

    saveRoster(filePath, data);
    grandTotalMatched += matchedInFile;

    console.log(
      `${path.basename(filePath)}: ${matchedInFile}/${data.athletes.length} matched`,
    );
  }

  console.log(
    `\n✅ Overall: ${grandTotalMatched}/${grandTotalAthletes} athlete-season entries now have a tfrrsId.`,
  );

  if (stillUnmatched.size > 0) {
    console.log(
      `\n⚠️  ${stillUnmatched.size} unique name(s) could not be matched (likely graduated/former athletes not on the current TFRRS team page):`,
    );
    [...stillUnmatched].sort().forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nTo fix a specific person: search their name on tfrrs.org, find their profile, " +
        "grab the numeric ID from the URL, and add a lowercase entry to MANUAL_OVERRIDES " +
        'in this script, e.g.: "jane smith": "1234567"',
    );
  }
}

main().catch((err) => {
  console.error("Failed to match TFRRS IDs across years:", err);
  process.exit(1);
});

```

### `scripts/fetch-tfrrs-ids-historical.mjs`

```javascript
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

```

### `scripts/fetch-tfrrs-ids.mjs`

```javascript
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

```

### `scripts/fetch-tfrrs-stats.mjs`

```javascript
#!/usr/bin/env node
/**
 * fetch-tfrrs-stats.mjs
 *
 * Reads every unique tfrrs_id from Supabase's `athletes` table (across all
 * seasons — the same person may appear multiple times but shares one
 * tfrrs_id), fetches each unique athlete's "College Bests" table once, and
 * writes src/data/tfrrs_stats.json keyed by tfrrs_id.
 *
 * Note: this script's OUTPUT is still a local JSON file, since your live
 * app (tfrrsStats.tsx) already reads it directly and works correctly.
 * Only the INPUT (which athletes to fetch) now comes from Supabase instead
 * of scanning local roster files.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { getAuthenticatedSupabaseClient } from "./lib/supabaseAdminClient.mjs";

const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");
const DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProfileUrl(tfrrsId, name) {
  if (tfrrsId.startsWith("http")) return tfrrsId;
  const slug = name.replace(/\s+/g, "_");
  return `https://www.tfrrs.org/athletes/${tfrrsId}/Wartburg/${slug}.html`;
}

async function fetchAthleteBests(tfrrsId, name) {
  const url = resolveProfileUrl(tfrrsId, name);

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (stats-fetch-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${name}: failed to fetch (${res.status}) — ${url}`);
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const bestsTable = $("table").first();
  if (bestsTable.length === 0) {
    console.warn(`  ⚠️  ${name}: no tables found on profile page`);
    return null;
  }

  const events = [];
  const cells = bestsTable.find("td").toArray();

  for (let i = 0; i < cells.length; i += 2) {
    const labelCell = $(cells[i]);
    const resultCell = $(cells[i + 1]);
    if (!resultCell) continue;

    const event = labelCell.text().trim();
    const link = resultCell.find("a").first();
    const time = link.text().trim();
    const resultUrl = link.attr("href") || "";

    if (!event || !time) continue;

    events.push({
      event,
      time,
      resultUrl: resultUrl.startsWith("http")
        ? resultUrl
        : `https://www.tfrrs.org${resultUrl}`,
    });
  }

  return events;
}

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data: rows, error } = await supabase
    .from("athletes")
    .select("tfrrs_id, name")
    .not("tfrrs_id", "is", null);

  if (error) throw new Error(error.message);

  const uniqueAthletes = new Map();
  for (const row of rows) {
    if (!uniqueAthletes.has(row.tfrrs_id)) {
      uniqueAthletes.set(row.tfrrs_id, row.name);
    }
  }

  console.log(
    `Found ${uniqueAthletes.size} unique athletes (by tfrrs_id) in Supabase.\n`,
  );

  const stats = {};
  let success = 0;
  let failed = 0;
  let index = 0;

  for (const [tfrrsId, name] of uniqueAthletes) {
    index++;
    const events = await fetchAthleteBests(tfrrsId, name);
    if (events && events.length > 0) {
      stats[tfrrsId] = {
        name,
        tfrrsId,
        fetchedAt: new Date().toISOString(),
        bests: events,
      };
      console.log(
        `✅ [${index}/${uniqueAthletes.size}] ${name}: ${events.length} events`,
      );
      success++;
    } else {
      console.log(
        `⚠️  [${index}/${uniqueAthletes.size}] ${name}: no data found`,
      );
      failed++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(stats, null, 2), "utf8");

  console.log(`\n✅ Wrote stats for ${success} athletes to ${OUT_PATH}`);
  if (failed > 0) console.log(`⚠️  ${failed} athletes had no data.`);
}

main().catch((err) => {
  console.error("Failed to fetch TFRRS stats:", err);
  process.exit(1);
});

```

### `scripts/migrate-core-to-supabase.mjs`

```javascript
#!/usr/bin/env node
/**
 * migrate-core-to-supabase.mjs
 *
 * One-time migration: pushes src/data/core_routine.json into Supabase
 * (core_exercises + site_content tables). Run once, then corePage.tsx
 * reads from Supabase instead of the local JSON file.
 *
 * Usage: node scripts/migrate-core-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const JSON_PATH = path.resolve("src/data/core_routine.json");

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const routine = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const { error: introError } = await supabase
    .from("site_content")
    .upsert({ key: "core_intro", value: routine.intro }, { onConflict: "key" });

  if (introError)
    throw new Error(`Failed to write intro: ${introError.message}`);
  console.log("✅ Wrote core_intro to site_content");

  const rows = [];
  let dayOrder = 0;

  for (const [day, { note, exercises }] of Object.entries(routine.days)) {
    dayOrder++;
    exercises.forEach((ex, position) => {
      rows.push({
        day,
        day_order: dayOrder,
        day_note: note,
        position,
        name: ex.name,
        url: ex.url,
      });
    });
  }

  // Wipe and re-insert rather than upsert — there's no natural unique key
  // per exercise row (names repeat across days), so a clean replace is safer.
  const { error: deleteError } = await supabase
    .from("core_exercises")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // matches all rows

  if (deleteError)
    throw new Error(`Failed to clear existing rows: ${deleteError.message}`);

  const { error: insertError, count } = await supabase
    .from("core_exercises")
    .insert(rows, { count: "exact" });

  if (insertError)
    throw new Error(`Failed to insert exercises: ${insertError.message}`);

  console.log(
    `✅ Inserted ${count ?? rows.length} exercise rows across ${dayOrder} days.`,
  );
}

main().catch((err) => {
  console.error("Failed to migrate core routine:", err);
  process.exit(1);
});

```

### `scripts/migrate-fms-to-supabase.mjs`

```javascript
#!/usr/bin/env node
/**
 * migrate-fms-to-supabase.mjs
 *
 * One-time migration: pushes src/data/fms_exercises.json into Supabase's
 * fms_exercises table.
 *
 * Usage: node scripts/migrate-fms-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { getAuthenticatedSupabaseClient } from "../src/lib/supabaseAdminClient.mjs";

const JSON_PATH = path.resolve("src/data/fms_exercises.json");

async function main() {
  const supabase = await getAuthenticatedSupabaseClient();
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));

  const rows = [];
  for (const [category, phases] of Object.entries(data)) {
    for (const [phase, exercises] of Object.entries(phases)) {
      exercises.forEach((ex, position) => {
        rows.push({
          category,
          phase,
          position,
          name: ex.name,
          reps: ex.reps || null,
          url: ex.url || null,
        });
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("fms_exercises")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteError)
    throw new Error(`Failed to clear existing rows: ${deleteError.message}`);

  const { error, count } = await supabase
    .from("fms_exercises")
    .insert(rows, { count: "exact" });

  if (error) throw new Error(error.message);

  console.log(`✅ Inserted ${count ?? rows.length} exercise rows.`);
}

main().catch((err) => {
  console.error("Failed to migrate FMS exercises:", err);
  process.exit(1);
});

```

### `scripts/migrate-roster-to-supabase.mjs`

```javascript
#!/usr/bin/env node
/**
 * migrate-roster-to-supabase.mjs
 *
 * Pushes every athlete from every src/data/distance_roster_*.json file into
 * the Supabase `athletes` table, keyed by (id, season). This becomes the
 * single source of truth used to match PDF-parsed names during admin
 * uploads, replacing raw name-string comparisons scattered across JSON files.
 *
 * Requires ADMIN_EMAIL / ADMIN_PASSWORD in .env so this script can
 * authenticate and satisfy the "Admin write access" RLS policy.
 *
 * Usage: node scripts/migrate-roster-to-supabase.mjs
 */

import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const DATA_DIR = path.resolve("src/data");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_KEY,
);

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.",
    );
    process.exit(1);
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) {
    console.error("Failed to authenticate:", authError.message);
    process.exit(1);
  }

  const files = findRosterFiles();
  let totalUpserted = 0;

  for (const filePath of files) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const season = data.season;
    if (!season) {
      console.warn(
        `Skipping ${path.basename(filePath)} — no "season" field found.`,
      );
      continue;
    }

    const payload = data.athletes.map((a) => ({
      id: a.id,
      season,
      name: a.name,
      team: a.team,
      hometown: a.hometown || null,
      high_school: a.highSchool || null,
      tfrrs_id: a.tfrrsId || null,
    }));

    const { error, count } = await supabase
      .from("athletes")
      .upsert(payload, { onConflict: "id,season", count: "exact" });

    if (error) {
      console.error(`${path.basename(filePath)}: FAILED — ${error.message}`);
      continue;
    }

    console.log(
      `${path.basename(filePath)}: upserted ${count ?? payload.length} athletes (season ${season})`,
    );
    totalUpserted += count ?? payload.length;
  }

  console.log(`\n✅ Total athletes migrated: ${totalUpserted}`);
}

main();

```

### `src/assets/fonts/Acme-Regular.ttf`

_(binary or excluded — contents not inlined)_

### `src/assets/icons/back_icon.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_drone_1.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo_main.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_knights_logo.png`

_(binary or excluded — contents not inlined)_

### `src/assets/still_pictures/wartburg_logo.png`

_(binary or excluded — contents not inlined)_

### `src/components/backButton.tsx`

```tsx
import { useNavigate } from "react-router-dom";
import backIcon from "../assets/icons/back_icon.png";

function BackButton() {
  const navigate = useNavigate();

  return (
    <button
      className="back-button"
      onClick={() => navigate(-1)}
      aria-label="Go Back"
    >
      <img src={backIcon} alt="" />
    </button>
  );
}
export default BackButton;

```

### `src/components/background.tsx`

```tsx
interface BackgroundProps {
  imageUrl: string;
  opacity: number;
}

function Background({ imageUrl, opacity }: BackgroundProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity: opacity,
      }}
    />
  );
}

export default Background;

```

### `src/components/comingSoon.tsx`

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const DEFAULT_MESSAGE =
  "Uh oh, looks like this page isn't built yet. Check in later!";

interface ComingSoonProps {
  message?: string;
}

function ComingSoon({ message = DEFAULT_MESSAGE }: ComingSoonProps) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/error", {
      replace: true,
      state: { message, code: 404 },
    });
  }, [navigate, message]);

  return null;
}

export default ComingSoon;

```

### `src/components/identityLookup.tsx`

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";

function IdentityLookup() {
  const { selectAthlete, availableSeasons } = useUser();
  const [season, setSeason] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<AthleteRecord[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Once availableSeasons loads from Supabase, default to the newest one.
  useEffect(() => {
    if (availableSeasons.length > 0 && season === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeason(availableSeasons[0]);
    }
  }, [availableSeasons, season]);

  // Fetch that season's athlete list whenever the season selection changes.
  useEffect(() => {
    if (season === null) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRoster(true);
    setQuery("");

    fetchAthletesForSeason(season)
      .then((data) => {
        if (cancelled) return;
        setRoster(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });

    return () => {
      cancelled = true;
    };
  }, [season]);

  const matches =
    query.trim().length > 0
      ? roster.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
      : [];

  return (
    <div className="identity-lookup">
      <h1 className="identity-title acme-regular text-outline">Who are you?</h1>

      {availableSeasons.length === 0 ? (
        <p className="identity-no-match acme-regular text-outline">
          Loading seasons...
        </p>
      ) : (
        <select
          className="identity-year-select"
          value={season ?? ""}
          onChange={(e) => setSeason(Number(e.target.value))}
        >
          {availableSeasons.map((s) => (
            <option key={s} value={s}>
              {s} Season
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        className="identity-input"
        placeholder={
          loadingRoster ? "Loading roster..." : "Start typing your name..."
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loadingRoster}
        autoFocus
      />
      {matches.length > 0 && (
        <ul className="identity-results">
          {matches.map((a) => (
            <li key={a.id}>
              <button
                className="identity-result-item"
                onClick={() => season !== null && selectAthlete(a.id, season)}
              >
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && matches.length === 0 && !loadingRoster && (
        <p className="identity-no-match acme-regular text-outline">
          No match found — check your spelling.
        </p>
      )}

      <Link to="/admin" className="admin-login-link acme-regular text-outline">
        Admin Login?
      </Link>
    </div>
  );
}

export default IdentityLookup;

```

### `src/components/navMenu.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

interface DropdownItem {
  label: string;
  path: string;
}

interface NavMenuProps {
  label: string;
  items: DropdownItem[];
}

function NavMenu({ label, items }: NavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside of it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="nav-menu" ref={menuRef}>
      <button
        className="nav-menu-trigger acme-regular text-outline"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <span className={`nav-menu-arrow ${isOpen ? "open" : ""}`}>▾</span>
      </button>

      {isOpen && (
        <div className="nav-menu-dropdown acme-regular text-outline">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="nav-menu-item"
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default NavMenu;

```

### `src/components/requireAdmin.tsx`

```tsx
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return null; // avoid flashing a redirect while session is still loading

  if (!session) {
    return <Navigate to="/admin" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireAdmin;

```

### `src/components/requireIdentity.tsx`

```tsx
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUser } from "../context/UserContext";

function RequireIdentity({ children }: { children: ReactNode }) {
  const { athlete, athleteId, athleteLoading } = useUser();
  const location = useLocation();

  // A session is stored but the athlete record hasn't finished loading from
  // Supabase yet — wait rather than redirecting prematurely on every refresh.
  if (athleteId && athleteLoading) return null;

  if (!athlete) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireIdentity;

```

### `src/components/switchIdentity.tsx`

```tsx
import { useState } from "react";
import { useUser } from "../context/UserContext";

function SwitchIdentityPrompt() {
  const { clearAthlete } = useUser();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="switch-identity-confirm">
        <span className="switch-identity-confirm-text acme-regular text-outline">
          Not you? This will reset your selection.
        </span>
        <button className="switch-identity-confirm-yes" onClick={clearAthlete}>
          Yes, switch
        </button>
        <button
          className="switch-identity-confirm-no"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className="switch-identity-link acme-regular text-outline"
      onClick={() => setConfirming(true)}
    >
      Not you?
    </button>
  );
}

export default SwitchIdentityPrompt;

```

### `src/context/AdminAuthContext.tsx`

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

interface AdminAuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(
  undefined,
);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AdminAuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}

```

### `src/context/UserContext.tsx`

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";

export interface Athlete {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  highSchool: string | null;
  tfrrsId: string | null;
}

interface UserContextValue {
  athleteId: string | null;
  season: number | null;
  athlete: Athlete | null;
  athleteLoading: boolean;
  availableSeasons: number[];
  selectAthlete: (id: string, season: number) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const ID_KEY = "wxc_selected_athlete_id";
const SEASON_KEY = "wxc_selected_season";

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(ID_KEY),
  );
  const [season, setSeasonState] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(SEASON_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("athletes")
      .select("season")
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const uniqueSeasons = [...new Set(data.map((row) => row.season))].sort(
          (a, b) => b - a,
        );
        setAvailableSeasons(uniqueSeasons);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!athleteId || !season) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAthlete(null);
      return;
    }

    let cancelled = false;
    setAthleteLoading(true);

    supabase
      .from("athletes")
      .select("id, season, name, team, hometown, high_school, tfrrs_id")
      .eq("id", athleteId)
      .eq("season", season)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setAthlete(null);
        } else {
          setAthlete({
            id: data.id,
            season: data.season,
            name: data.name,
            team: data.team,
            hometown: data.hometown,
            highSchool: data.high_school,
            tfrrsId: data.tfrrs_id,
          });
        }
        setAthleteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [athleteId, season]);

  function selectAthlete(id: string, selectedSeason: number) {
    sessionStorage.setItem(ID_KEY, id);
    sessionStorage.setItem(SEASON_KEY, String(selectedSeason));
    setAthleteIdState(id);
    setSeasonState(selectedSeason);
  }

  function clearAthlete() {
    sessionStorage.removeItem(ID_KEY);
    sessionStorage.removeItem(SEASON_KEY);
    setAthleteIdState(null);
    setSeasonState(null);
    setAthlete(null);
  }

  return (
    <UserContext.Provider
      value={{
        athleteId,
        season,
        athlete,
        athleteLoading,
        availableSeasons,
        selectAthlete,
        clearAthlete,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

```

### `src/data/core_routine.json`

_(binary or excluded — contents not inlined)_

### `src/data/fms_exercises.json`

_(binary or excluded — contents not inlined)_

### `src/data/rawFMSassignments.ts`

```typescript
export interface RawFmsAssignment {
  rawName: string;
  category: string;
  variant: "All" | "6";
}

export const RAW_FMS_ASSIGNMENTS: RawFmsAssignment[] = [
  { rawName: "Philip Dahlen", category: "Trunk Stability", variant: "All" },
  { rawName: "Leah McDonald", category: "Trunk Stability", variant: "All" },
  { rawName: "Grace Vortherms", category: "Trunk Stability", variant: "All" },
  { rawName: "Julia Burney", category: "Trunk Stability", variant: "All" },
  { rawName: "Peyton Morey", category: "Trunk Stability", variant: "All" },
  { rawName: "Maya Zopel", category: "Trunk Stability", variant: "All" },
  { rawName: "Alyssa Higgins", category: "Trunk Stability", variant: "All" },
  { rawName: "Makenna Hetrick", category: "Trunk Stability", variant: "All" },
  { rawName: "Zoe Cordes", category: "Trunk Stability", variant: "All" },
  { rawName: "Stella Rose", category: "Trunk Stability", variant: "All" },
  { rawName: "Jillian Borgelt", category: "Trunk Stability", variant: "All" },
  { rawName: "Zaya Peirce", category: "Trunk Stability", variant: "All" },
  { rawName: "Ava Vanderheyden", category: "Trunk Stability", variant: "All" },
  { rawName: "Dax Duffy", category: "Trunk Stability", variant: "All" },

  { rawName: "Lily Cooper", category: "Trunk Stability", variant: "6" },
  { rawName: "Ava Vance", category: "Trunk Stability", variant: "6" },
  { rawName: "Mason Coulter", category: "Trunk Stability", variant: "6" },
  { rawName: "Janae Hansen", category: "Trunk Stability", variant: "6" },
  { rawName: "Lydia Maas", category: "Trunk Stability", variant: "6" },

  {
    rawName: "Addie Thompson",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Adam Wilke",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Kasey Levinsohn",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Abbey Angus",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Jackson Cicchinelli",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Henry Nichols",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Toben Edney",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Austin Soldwisch",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Reagan Cogdill",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "James Maso",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Caleb Olson",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Ben Neville",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },
  {
    rawName: "Myles Matthias",
    category: "Active Straight-Leg Raise",
    variant: "All",
  },

  {
    rawName: "Lillyan Kiehne",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Solomon Zaugg",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Jonathan Meyer",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Claire Hoyer",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Alex Horstman",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Cooper Cook",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "AJ Schermerhorn",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Wes Hulseberg",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },
  {
    rawName: "Sawyer Schmidt",
    category: "Active Straight-Leg Raise",
    variant: "6",
  },

  { rawName: "Jade Anderson", category: "Rotary Stability", variant: "All" },
  { rawName: "Silas Gann", category: "Rotary Stability", variant: "All" },
  { rawName: "Jack Behrens", category: "Rotary Stability", variant: "All" },

  { rawName: "Riley Kuhn", category: "Rotary Stability", variant: "6" },
  { rawName: "Connor Martin", category: "Rotary Stability", variant: "6" },
  { rawName: "Hutton Edney", category: "Rotary Stability", variant: "6" },

  {
    rawName: "Joel Ramirez-Parra",
    category: "Shoulder Mobility",
    variant: "All",
  },
  { rawName: "Rylan Martin", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Dawson Fricke", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Carter Mulford", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Camden Kilker", category: "Shoulder Mobility", variant: "All" },
  { rawName: "Evan Cook", category: "Shoulder Mobility", variant: "All" },

  { rawName: "Gage Heyne", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Drew Moser", category: "Shoulder Mobility", variant: "6" },
  { rawName: "AJ Angus", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Ava Vance", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Aaron Lursen", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Morgan Engel", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Anna Quillin", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Jakob Regennitter", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Caden Kueker", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Cali Trygstad", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Ryan Heden", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Hannah Ramsey", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Isaiah Hammerand", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Cooper Bankston", category: "Shoulder Mobility", variant: "6" },
  { rawName: "Derek Coulter", category: "Shoulder Mobility", variant: "6" },

  { rawName: "Bryn Wright", category: "Hurdle Step", variant: "6" },
  { rawName: "Alex Pries", category: "Hurdle Step", variant: "6" },

  { rawName: "Nathan Kinzer", category: "Incline Lunge", variant: "6" },
];

```

### `src/data/tfrrs_stats.json`

_(binary or excluded — contents not inlined)_

### `src/lib/adminData.ts`

```typescript
import { supabase } from "./supabaseClient";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
  WorkoutIntervalRow,
} from "./pdfParser";

export interface MatchedRow<T> {
  data: T;
  athleteId: string;
}

export async function upsertMileageRows(
  rows: MatchedRow<MileageRow>[],
  weekOf: string,
  season: number,
) {
  const dedupedById = new Map<string, MatchedRow<MileageRow>>();
  for (const row of rows) {
    dedupedById.set(row.athleteId, row);
  }
  const deduped = Array.from(dedupedById.values());

  const payload = deduped.map(({ data: r, athleteId }) => ({
    athlete_id: athleteId,
    season,
    athlete_name: r.name,
    team: r.team,
    week_of: weekOf,
    monday: r.monday,
    tuesday: r.tuesday,
    wednesday: r.wednesday,
    thursday: r.thursday,
    friday: r.friday,
    saturday: r.saturday,
    sunday: r.sunday,
    weekly_total: r.weeklyTotal,
    notes: r.notes,
  }));

  const { error, count } = await supabase
    .from("mileage_entries")
    .upsert(payload, {
      onConflict: "athlete_id,season,week_of",
      count: "exact",
    });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

export async function upsertWorkoutData(
  assignments: MatchedRow<WorkoutAssignment>[],
  groupDefinitions: WorkoutGroupDefinition[],
  weekOf: string,
  day: "tuesday" | "friday",
  season: number,
) {
  const groupPayload = groupDefinitions.map((g) => ({
    week_of: weekOf,
    day,
    group_letter: g.groupLetter,
    description: g.description,
  }));

  const { error: groupError } = await supabase
    .from("workout_groups")
    .upsert(groupPayload, { onConflict: "week_of,day,group_letter" });

  if (groupError) throw new Error(groupError.message);

  const dedupedById = new Map<string, MatchedRow<WorkoutAssignment>>();
  for (const a of assignments) {
    dedupedById.set(a.athleteId, a);
  }
  const deduped = Array.from(dedupedById.values());

  const assignmentPayload = deduped.map(({ data: a, athleteId }) => ({
    athlete_id: athleteId,
    season,
    athlete_name: a.name,
    week_of: weekOf,
    day,
    group_letter: a.groupLetter,
    note: a.note,
  }));

  const { error: assignError, count } = await supabase
    .from("workout_assignments")
    .upsert(assignmentPayload, {
      onConflict: "athlete_id,season,week_of,day",
      count: "exact",
    });

  if (assignError) throw new Error(assignError.message);
  return count ?? assignmentPayload.length;
}

export async function upsertWorkoutIntervals(
  intervalRows: MatchedRow<WorkoutIntervalRow>[],
  weekOf: string,
  day: "tuesday" | "friday",
  season: number,
) {
  const payload: {
    athlete_id: string;
    season: number;
    athlete_name: string;
    week_of: string;
    day: string;
    interval_label: string;
    time_value: string;
  }[] = [];

  for (const { data: row, athleteId } of intervalRows) {
    for (const [label, value] of Object.entries(row.intervals)) {
      payload.push({
        athlete_id: athleteId,
        season,
        athlete_name: row.name,
        week_of: weekOf,
        day,
        interval_label: label,
        time_value: value,
      });
    }
  }

  if (payload.length === 0) return 0;

  const { error, count } = await supabase
    .from("workout_intervals")
    .upsert(payload, {
      onConflict: "athlete_id,season,week_of,day,interval_label",
      count: "exact",
    });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

```

### `src/lib/aliasData.ts`

```typescript
import { supabase } from "./supabaseClient";

export interface NameAlias {
  alias_name: string;
  athlete_id: string;
}

export async function fetchAliasesForSeason(
  season: number,
): Promise<NameAlias[]> {
  const { data, error } = await supabase
    .from("name_aliases")
    .select("alias_name, athlete_id")
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertAlias(
  season: number,
  aliasName: string,
  athleteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("name_aliases")
    .upsert(
      { season, alias_name: aliasName, athlete_id: athleteId },
      { onConflict: "season,alias_name" },
    );

  if (error) throw new Error(error.message);
}

```

### `src/lib/athleteData.ts`

```typescript
import { supabase } from "./supabaseClient";

export interface AthleteRecord {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  high_school: string | null;
}

export async function fetchAthletesForSeason(
  season: number,
): Promise<AthleteRecord[]> {
  const { data, error } = await supabase
    .from("athletes")
    .select("id, season, name, team, hometown, high_school")
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

```

### `src/lib/coreData.ts`

```typescript
import { supabase } from "./supabaseClient";

export interface CoreExerciseRow {
  day: string;
  day_order: number;
  day_note: string | null;
  position: number;
  name: string;
  url: string | null;
}

export interface DayRoutine {
  note: string | null;
  exercises: { name: string; url: string | null }[];
}

export interface CoreRoutine {
  intro: string;
  days: { day: string; routine: DayRoutine }[];
}

export async function fetchCoreRoutine(): Promise<CoreRoutine> {
  const [introResult, exercisesResult] = await Promise.all([
    supabase
      .from("site_content")
      .select("value")
      .eq("key", "core_intro")
      .maybeSingle(),
    supabase
      .from("core_exercises")
      .select("day, day_order, day_note, position, name, url")
      .order("day_order", { ascending: true })
      .order("position", { ascending: true }),
  ]);

  if (introResult.error) throw new Error(introResult.error.message);
  if (exercisesResult.error) throw new Error(exercisesResult.error.message);

  const rows = exercisesResult.data ?? [];
  const dayMap = new Map<string, DayRoutine>();

  for (const row of rows as CoreExerciseRow[]) {
    if (!dayMap.has(row.day)) {
      dayMap.set(row.day, { note: row.day_note, exercises: [] });
    }
    dayMap.get(row.day)!.exercises.push({ name: row.name, url: row.url });
  }

  return {
    intro: introResult.data?.value ?? "",
    days: Array.from(dayMap.entries()).map(([day, routine]) => ({
      day,
      routine,
    })),
  };
}

```

### `src/lib/fmsData.ts`

```typescript
import { supabase } from "../lib/supabaseClient";

export interface FmsExercise {
  phase: string;
  position: number;
  name: string;
  reps: string | null;
  url: string | null;
}

export interface FmsAssignment {
  category: string;
  variant: string;
}

export async function fetchFmsAssignments(
  athleteId: string,
  season: number,
): Promise<FmsAssignment[]> {
  const { data, error } = await supabase
    .from("fms_assignments")
    .select("category, variant")
    .eq("athlete_id", athleteId)
    .eq("season", season);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchFmsExercises(
  category: string,
): Promise<FmsExercise[]> {
  const { data, error } = await supabase
    .from("fms_exercises")
    .select("phase, position, name, reps, url")
    .eq("category", category)
    .order("phase", { ascending: true })
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

```

### `src/lib/mileageData.ts`

```typescript
import { supabase } from "./supabaseClient";

export interface MileageEntry {
  week_of: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  weekly_total: string;
  notes: string;
}

export async function fetchMileageForAthlete(
  athleteId: string,
  season: number,
): Promise<MileageEntry[]> {
  const { data, error } = await supabase
    .from("mileage_entries")
    .select(
      "week_of, monday, tuesday, wednesday, thursday, friday, saturday, sunday, weekly_total, notes",
    )
    .eq("athlete_id", athleteId)
    .eq("season", season)
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

```

### `src/lib/nameMatching.ts`

```typescript
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildNameLookup(
  athletes: { id: string; name: string }[],
): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const a of athletes) {
    map.set(normalizeName(a.name), a);
  }
  return map;
}

export function buildAliasLookup(
  aliases: { alias_name: string; athlete_id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of aliases) {
    map.set(normalizeName(a.alias_name), a.athlete_id);
  }
  return map;
}

export function matchName(
  parsedName: string,
  nameLookup: Map<string, { id: string; name: string }>,
  aliasLookup?: Map<string, string>,
): string | null {
  const normalized = normalizeName(parsedName);

  // Check learned aliases first — this is what makes matching self-healing.
  if (aliasLookup?.has(normalized)) {
    return aliasLookup.get(normalized)!;
  }

  const match = nameLookup.get(normalized);
  return match ? match.id : null;
}

```

### `src/lib/pdfParser.ts`

```typescript
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PositionedWord {
  text: string;
  x: number;
  top: number;
}

export interface MileageRow {
  name: string;
  team: "mens-cross-country" | "womens-cross-country";
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  weeklyTotal: string;
  notes: string;
}

export interface WorkoutAssignment {
  name: string;
  groupLetter: string;
  note: string | null;
}

export interface WorkoutGroupDefinition {
  groupLetter: string;
  description: string;
}

export interface WorkoutIntervalRow {
  name: string;
  intervals: Record<string, string>;
}

export interface ParsedWorkouts {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
  intervalRows: WorkoutIntervalRow[];
}

const ROW_TOLERANCE = 10;
const COLUMN_GAP_THRESHOLD = 25;

const NAME_TOKEN_RE = /^[A-Za-z'.-]+,?$/;
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

// Decorative dot/ellipsis "columns" — made up entirely of periods or the
// ellipsis character. These are visual filler, never a real coach note.
const DECORATIVE_DOTS_RE = /^[.\u2026]+$/;

// ---------- Core: extract positioned words from a PDF page ----------

function splitIntoWordTokens(
  str: string,
  x: number,
  top: number,
  width: number,
): PositionedWord[] {
  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return [{ text: str, x, top }];
  }

  const totalChars = parts.reduce((sum, p) => sum + p.length, 0) || 1;
  let cursor = x;
  const results: PositionedWord[] = [];

  for (const part of parts) {
    results.push({ text: part, x: cursor, top });
    const partWidth = (width * part.length) / totalChars;
    cursor += partWidth + width * 0.02;
  }

  return results;
}

async function extractPageWords(
  page: pdfjsLib.PDFPageProxy,
): Promise<PositionedWord[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const words: PositionedWord[] = [];

  for (const item of content.items) {
    if (!("str" in item) || item.str.trim().length === 0) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const top = viewport.height - y;
    const width = "width" in item ? (item.width as number) : 0;

    words.push(...splitIntoWordTokens(item.str.trim(), x, top, width));
  }

  return words;
}

// ---------- Row clustering ----------

function clusterIntoRows(words: PositionedWord[]): PositionedWord[][] {
  const sorted = [...words].sort((a, b) => a.top - b.top);
  const rows: PositionedWord[][] = [];

  for (const word of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].top - word.top) <= ROW_TOLERANCE) {
      lastRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  return rows;
}

// ---------- Name extraction ----------

function extractLeadingName(
  sortedRowWords: PositionedWord[],
  maxTokens = 2,
): PositionedWord[] {
  const result: PositionedWord[] = [];
  for (const w of sortedRowWords) {
    if (result.length >= maxTokens) break;
    if (!NAME_TOKEN_RE.test(w.text)) break;
    result.push(w);
  }
  return result;
}

function toDisplayName(nameWords: PositionedWord[]): string | null {
  if (nameWords.length < 2) return null;
  const raw = nameWords
    .map((w) => w.text)
    .join(" ")
    .replace(/,$/, "");
  const [last, first] = raw.split(",").map((s) => s.trim());
  if (!first) return null;
  return `${first} ${last}`;
}

// ---------- Nearest-anchor column assignment ----------

function assignToNearestColumn(
  rowWords: PositionedWord[],
  columnAnchors: { key: string; x: number }[],
): Record<string, string> {
  const buckets: Record<string, PositionedWord[]> = {};
  columnAnchors.forEach((c) => (buckets[c.key] = []));

  for (const word of rowWords) {
    let closest = columnAnchors[0];
    let minDist = Math.abs(word.x - closest.x);
    for (const anchor of columnAnchors) {
      const dist = Math.abs(word.x - anchor.x);
      if (dist < minDist) {
        minDist = dist;
        closest = anchor;
      }
    }
    buckets[closest.key].push(word);
  }

  const result: Record<string, string> = {};
  for (const key of Object.keys(buckets)) {
    result[key] = buckets[key]
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text)
      .join(" ");
  }
  return result;
}

// ---------- Interval header column detection ----------

function clusterHeaderIntoColumns(
  headerWords: PositionedWord[],
): { key: string; x: number }[] {
  const relevant = headerWords
    .filter((w) => w.text !== "WO" && !DATE_TOKEN_RE.test(w.text))
    .sort((a, b) => a.x - b.x);

  if (relevant.length === 0) return [];

  const groups: PositionedWord[][] = [[relevant[0]]];
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1];
    const curr = relevant[i];
    if (curr.x - prev.x <= COLUMN_GAP_THRESHOLD) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups.map((group) => ({
    key: group.map((w) => w.text).join(" "),
    x: group.reduce((sum, w) => sum + w.x, 0) / group.length,
  }));
}

// ---------- Mileage PDF parsing ----------

const MILEAGE_DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function findHeaderAnchors(
  rows: PositionedWord[][],
): { key: string; x: number }[] | null {
  for (const row of rows) {
    const rowText = row.map((w) => w.text);
    const hasAllDays = MILEAGE_DAY_HEADERS.every((d) => rowText.includes(d));
    if (!hasAllDays) continue;

    const anchors: { key: string; x: number }[] = [];
    const dayKeys = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    MILEAGE_DAY_HEADERS.forEach((label, i) => {
      const word = row.find((w) => w.text === label);
      if (word) anchors.push({ key: dayKeys[i], x: word.x });
    });

    const mileageWord = row.find((w) => w.text === "Mileage");
    if (mileageWord) anchors.push({ key: "weeklyTotal", x: mileageWord.x });

    const notesWord = row.find((w) => w.text === "Notes");
    if (notesWord) anchors.push({ key: "notes", x: notesWord.x });

    if (anchors.length >= 8) return anchors;
  }
  return null;
}

export async function parseMileagePdf(file: File): Promise<MileageRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const results: MileageRow[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);
    const rows = clusterIntoRows(words);

    const allPageText = words.map((w) => w.text).join(" ");
    const team: MileageRow["team"] = /women/i.test(allPageText)
      ? "womens-cross-country"
      : "mens-cross-country";

    const anchors = findHeaderAnchors(rows);
    if (!anchors) continue;

    for (const row of rows) {
      if (row.some((w) => w.text === "Mon")) continue;

      const nameWords = extractLeadingName(row, 2);
      const displayName = toDisplayName(nameWords);
      if (!displayName) continue;

      const dataWords = row.filter((w) => !nameWords.includes(w));
      const assigned = assignToNearestColumn(dataWords, anchors);

      results.push({
        name: displayName,
        team,
        monday: assigned.monday || "",
        tuesday: assigned.tuesday || "",
        wednesday: assigned.wednesday || "",
        thursday: assigned.thursday || "",
        friday: assigned.friday || "",
        saturday: assigned.saturday || "",
        sunday: assigned.sunday || "",
        weeklyTotal: assigned.weeklyTotal || "",
        notes: assigned.notes || "",
      });
    }
  }

  return results;
}

// ---------- Workouts PDF parsing ----------

export async function parseWorkoutsPdf(file: File): Promise<ParsedWorkouts> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const assignments: WorkoutAssignment[] = [];
  const definitionsByLetter = new Map<string, string>();
  const intervalRows: WorkoutIntervalRow[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);
    const rows = clusterIntoRows(words);

    const groupHeaderWord = words.find((w) => w.text === "G" && w.top < 30);

    if (groupHeaderWord) {
      // ---- Lettered-group format ----
      const groupColumnX = groupHeaderWord.x;
      const descriptionMinX = groupColumnX + 15;

      for (const row of rows) {
        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const groupWord = row.find(
          (w) =>
            Math.abs(w.x - groupColumnX) < 10 && /^[A-Z]{1,2}$/.test(w.text),
        );
        if (!groupWord) continue;

        // Anything left between the name and the group letter that ISN'T a
        // decorative dot/ellipsis filler is a real coach note — e.g. "20 max"
        // or "20 max or XT" attached to a specific athlete's row.
        const noteWords = row
          .filter((w) => w !== groupWord && !nameWords.includes(w))
          .filter((w) => w.x < groupColumnX - 5)
          .filter((w) => !DECORATIVE_DOTS_RE.test(w.text))
          .sort((a, b) => a.x - b.x);

        const note =
          noteWords.length > 0
            ? noteWords
                .map((w) => w.text)
                .join(" ")
                .trim()
            : null;

        assignments.push({
          name: displayName,
          groupLetter: groupWord.text,
          note,
        });
      }

      const descWords = words
        .filter((w) => w.x > descriptionMinX)
        .sort((a, b) => a.top - b.top || a.x - b.x);

      const fullText = descWords.map((w) => w.text).join(" ");
      const segments = fullText.split(/(?=\b(?:[A-Z]{1,2}|XT|M):)/);

      for (const segment of segments) {
        const trimmed = segment.trim();
        const match = trimmed.match(/^([A-Z]{1,2}|XT|M):\s*(.+)$/);
        if (match) {
          definitionsByLetter.set(match[1], match[2].trim());
        }
      }
    } else {
      // ---- Interval/pace-table format ----
      const headerRow = rows.find((row) => row.some((w) => w.text === "WO"));
      if (!headerRow) continue;

      const columnAnchors = clusterHeaderIntoColumns(headerRow);
      if (columnAnchors.length === 0) continue;

      for (const row of rows) {
        if (row === headerRow) continue;

        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const dataWords = row.filter((w) => !nameWords.includes(w));
        const assigned = assignToNearestColumn(dataWords, columnAnchors);

        const intervals: Record<string, string> = {};
        for (const [label, value] of Object.entries(assigned)) {
          if (value.trim().length > 0) intervals[label] = value.trim();
        }

        if (Object.keys(intervals).length > 0) {
          intervalRows.push({ name: displayName, intervals });
        }
      }
    }
  }

  const groupDefinitions: WorkoutGroupDefinition[] = Array.from(
    definitionsByLetter.entries(),
  ).map(([groupLetter, description]) => ({ groupLetter, description }));

  return { assignments, groupDefinitions, intervalRows };
}

```

### `src/lib/supabaseAdminClient.mjs`

```javascript
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export async function getAuthenticatedSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_KEY in .env");
  }
  if (!email || !password) {
    throw new Error("Missing ADMIN_EMAIL / ADMIN_PASSWORD in .env");
  }

  const supabase = createClient(url, key);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to authenticate as admin: ${error.message}`);
  }

  return supabase;
}

```

### `src/lib/supabaseClient.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_KEY set.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

```

### `src/lib/workoutData.ts`

```typescript
import { supabase } from "./supabaseClient";

export interface WorkoutAssignmentRow {
  week_of: string;
  day: string;
  group_letter: string;
  note: string | null;
}

export interface WorkoutGroupRow {
  week_of: string;
  day: string;
  group_letter: string;
  description: string;
}

export interface WorkoutForDay {
  weekOf: string;
  day: string;
  groupLetter: string;
  description: string | null;
  note: string | null;
}

export interface WorkoutIntervalEntry {
  week_of: string;
  day: string;
  interval_label: string;
  time_value: string;
}

export async function fetchWorkoutsForAthlete(
  athleteId: string,
  season: number,
): Promise<WorkoutForDay[]> {
  const { data: assignments, error: assignError } = await supabase
    .from("workout_assignments")
    .select("week_of, day, group_letter, note")
    .eq("athlete_id", athleteId)
    .eq("season", season)
    .order("week_of", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  const weeksOf = [...new Set(assignments.map((a) => a.week_of))];

  const { data: groups, error: groupError } = await supabase
    .from("workout_groups")
    .select("week_of, day, group_letter, description")
    .in("week_of", weeksOf);

  if (groupError) throw new Error(groupError.message);

  const groupLookup = new Map<string, string>();
  (groups ?? []).forEach((g: WorkoutGroupRow) => {
    groupLookup.set(`${g.week_of}|${g.day}|${g.group_letter}`, g.description);
  });

  return assignments.map((a: WorkoutAssignmentRow) => ({
    weekOf: a.week_of,
    day: a.day,
    groupLetter: a.group_letter,
    description:
      groupLookup.get(`${a.week_of}|${a.day}|${a.group_letter}`) ?? null,
    note: a.note ?? null,
  }));
}

export async function fetchIntervalsForAthlete(
  athleteId: string,
  season: number,
): Promise<WorkoutIntervalEntry[]> {
  const { data, error } = await supabase
    .from("workout_intervals")
    .select("week_of, day, interval_label, time_value")
    .eq("athlete_id", athleteId)
    .eq("season", season)
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

```

### `src/pages/about.tsx`

```tsx
function AboutInfo() {
  return (
    <div>
      <h1>More info here</h1>
    </div>
  );
}
export default AboutInfo;

```

### `src/pages/adminDashboard.tsx`

```tsx
import { useEffect, useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { parseMileagePdf, parseWorkoutsPdf } from "../lib/pdfParser";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
  WorkoutIntervalRow,
} from "../lib/pdfParser";
import {
  upsertMileageRows,
  upsertWorkoutData,
  upsertWorkoutIntervals,
} from "../lib/adminData";
import type { MatchedRow } from "../lib/adminData";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";
import { fetchAliasesForSeason, upsertAlias } from "../lib/aliasData";
import {
  buildNameLookup,
  buildAliasLookup,
  matchName,
  normalizeName,
} from "../lib/nameMatching";

const CURRENT_SEASON = 2026;

type Mode = "mileage" | "workouts";

function AdminDashboard() {
  const { signOut } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("mileage");
  const [weekOf, setWeekOf] = useState("");
  const [day, setDay] = useState<"tuesday" | "friday">("tuesday");

  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [aliases, setAliases] = useState<
    { alias_name: string; athlete_id: string }[]
  >([]);
  const [athletesLoaded, setAthletesLoaded] = useState(false);

  const [mileageMatches, setMileageMatches] = useState<
    MatchedRow<MileageRow>[] | null
  >(null);
  const [assignmentMatches, setAssignmentMatches] = useState<
    MatchedRow<WorkoutAssignment>[] | null
  >(null);
  const [intervalMatches, setIntervalMatches] = useState<
    MatchedRow<WorkoutIntervalRow>[] | null
  >(null);
  const [groupDefinitions, setGroupDefinitions] = useState<
    WorkoutGroupDefinition[]
  >([]);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAthletesForSeason(CURRENT_SEASON),
      fetchAliasesForSeason(CURRENT_SEASON),
    ])
      .then(([athleteData, aliasData]) => {
        setAthletes(athleteData);
        setAliases(aliasData);
        setAthletesLoaded(true);
      })
      .catch((err) =>
        setStatus(`Failed to load athlete roster: ${err.message}`),
      );
  }, []);

  function runMatching<T extends { name: string }>(rows: T[]): MatchedRow<T>[] {
    const nameLookup = buildNameLookup(athletes);
    const aliasLookup = buildAliasLookup(aliases);
    return rows.map((data) => ({
      data,
      athleteId: matchName(data.name, nameLookup, aliasLookup) ?? "",
    }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus(null);
    setBusy(true);
    try {
      if (mode === "mileage") {
        const rows = await parseMileagePdf(file);
        setMileageMatches(runMatching(rows));
        setAssignmentMatches(null);
        setIntervalMatches(null);
      } else {
        const parsed = await parseWorkoutsPdf(file);
        setAssignmentMatches(runMatching(parsed.assignments));
        setIntervalMatches(runMatching(parsed.intervalRows));
        setGroupDefinitions(parsed.groupDefinitions);
        setMileageMatches(null);
      }
    } catch (err) {
      setStatus(`Failed to parse PDF: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function updateMileageMatch(index: number, athleteId: string) {
    setMileageMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  function updateAssignmentMatch(index: number, athleteId: string) {
    setAssignmentMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  function updateIntervalMatch(index: number, athleteId: string) {
    setIntervalMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  function removeMileageRow(index: number) {
    setMileageMatches((prev) =>
      prev ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  function removeAssignmentRow(index: number) {
    setAssignmentMatches((prev) =>
      prev ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  function removeIntervalRow(index: number) {
    setIntervalMatches((prev) =>
      prev ? prev.filter((_, i) => i !== index) : prev,
    );
  }

  const mileageUnmatchedCount =
    mileageMatches?.filter((r) => !r.athleteId).length ?? 0;
  const assignmentUnmatchedCount =
    assignmentMatches?.filter((r) => !r.athleteId).length ?? 0;
  const intervalUnmatchedCount =
    intervalMatches?.filter((r) => !r.athleteId).length ?? 0;

  // Any row where the parsed name doesn't match the selected athlete's real
  // name gets remembered as an alias — this is what makes matching
  // self-healing: fix a spelling once, and it auto-matches every week after.
  async function learnAliasesFrom<T extends { name: string }>(
    rows: MatchedRow<T>[],
  ) {
    const athleteById = new Map(athletes.map((a) => [a.id, a.name]));

    for (const row of rows) {
      if (!row.athleteId) continue;
      const realName = athleteById.get(row.athleteId);
      if (!realName) continue;

      if (normalizeName(row.data.name) !== normalizeName(realName)) {
        try {
          await upsertAlias(CURRENT_SEASON, row.data.name, row.athleteId);
        } catch (err) {
          console.warn(`Failed to save alias for "${row.data.name}":`, err);
        }
      }
    }
  }

  async function handleSubmit() {
    if (!weekOf) {
      setStatus("Please select the week's date first.");
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      if (mode === "mileage" && mileageMatches) {
        const resolved = mileageMatches.filter((r) => r.athleteId);
        const count = await upsertMileageRows(resolved, weekOf, CURRENT_SEASON);
        await learnAliasesFrom(resolved);
        setStatus(`✅ Saved ${count} mileage rows for week of ${weekOf}.`);
      } else if (mode === "workouts") {
        const resolvedAssignments = (assignmentMatches ?? []).filter(
          (r) => r.athleteId,
        );
        const resolvedIntervals = (intervalMatches ?? []).filter(
          (r) => r.athleteId,
        );

        const groupCount = await upsertWorkoutData(
          resolvedAssignments,
          groupDefinitions,
          weekOf,
          day,
          CURRENT_SEASON,
        );
        const intervalCount = await upsertWorkoutIntervals(
          resolvedIntervals,
          weekOf,
          day,
          CURRENT_SEASON,
        );
        await learnAliasesFrom(resolvedAssignments);
        await learnAliasesFrom(resolvedIntervals);

        setStatus(
          `✅ Saved ${groupCount} group assignments and ${intervalCount} interval entries for ${day}, week of ${weekOf}.`,
        );
      }
    } catch (err) {
      setStatus(`❌ Failed to save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function AthleteSelect({
    value,
    onChange,
  }: {
    value: string;
    onChange: (id: string) => void;
  }) {
    return (
      <select
        className="admin-match-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">-- Select athlete --</option>
        {athletes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-title acme-regular text-outline">Admin Dashboard</h1>

      <div className="admin-mode-toggle">
        <button
          className={mode === "mileage" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("mileage");
            setMileageMatches(null);
            setAssignmentMatches(null);
            setIntervalMatches(null);
            setStatus(null);
          }}
        >
          Mileage
        </button>
        <button
          className={mode === "workouts" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("workouts");
            setMileageMatches(null);
            setAssignmentMatches(null);
            setIntervalMatches(null);
            setStatus(null);
          }}
        >
          Workouts
        </button>
      </div>

      <div className="admin-controls">
        <label className="admin-label">
          Week of:
          <input
            type="date"
            className="identity-input"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          />
        </label>

        {mode === "workouts" && (
          <label className="admin-label">
            Day:
            <select
              className="identity-year-select"
              value={day}
              onChange={(e) => setDay(e.target.value as "tuesday" | "friday")}
            >
              <option value="tuesday">Tuesday</option>
              <option value="friday">Friday</option>
            </select>
          </label>
        )}

        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={busy || !athletesLoaded}
        />
      </div>

      {!athletesLoaded && (
        <p className="admin-status">Loading athlete roster...</p>
      )}
      {busy && <p className="admin-status">Working...</p>}
      {status && <p className="admin-status">{status}</p>}

      {mode === "mileage" && mileageMatches && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {mileageMatches.length} rows parsed
            {mileageUnmatchedCount > 0 &&
              ` — ${mileageUnmatchedCount} unmatched, fix or remove before saving`}
          </p>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Parsed Name</th>
                  <th>Mon</th>
                  <th>Tue</th>
                  <th>Wed</th>
                  <th>Thu</th>
                  <th>Fri</th>
                  <th>Sat</th>
                  <th>Sun</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mileageMatches.map((r, i) => (
                  <tr
                    key={i}
                    className={!r.athleteId ? "admin-row-unmatched" : ""}
                  >
                    <td>
                      <AthleteSelect
                        value={r.athleteId}
                        onChange={(id) => updateMileageMatch(i, id)}
                      />
                    </td>
                    <td>{r.data.name}</td>
                    <td>{r.data.monday}</td>
                    <td>{r.data.tuesday}</td>
                    <td>{r.data.wednesday}</td>
                    <td>{r.data.thursday}</td>
                    <td>{r.data.friday}</td>
                    <td>{r.data.saturday}</td>
                    <td>{r.data.sunday}</td>
                    <td>{r.data.weeklyTotal}</td>
                    <td>
                      <button
                        className="admin-remove-btn"
                        onClick={() => removeMileageRow(i)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="nav-menu-trigger"
            onClick={handleSubmit}
            disabled={busy}
          >
            Save to Database
          </button>
        </div>
      )}

      {mode === "workouts" && (assignmentMatches || intervalMatches) && (
        <div className="admin-preview">
          {groupDefinitions.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {groupDefinitions.map((g) => (
                    <tr key={g.groupLetter}>
                      <td>{g.groupLetter}</td>
                      <td>{g.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {assignmentMatches && assignmentMatches.length > 0 && (
            <>
              <p className="admin-preview-count">
                {assignmentMatches.length} group assignments
                {assignmentUnmatchedCount > 0 &&
                  ` — ${assignmentUnmatchedCount} unmatched`}
              </p>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Parsed Name</th>
                      <th>Group</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentMatches.map((r, i) => (
                      <tr
                        key={i}
                        className={!r.athleteId ? "admin-row-unmatched" : ""}
                      >
                        <td>
                          <AthleteSelect
                            value={r.athleteId}
                            onChange={(id) => updateAssignmentMatch(i, id)}
                          />
                        </td>
                        <td>{r.data.name}</td>
                        <td>{r.data.groupLetter}</td>
                        <td>
                          <button
                            className="admin-remove-btn"
                            onClick={() => removeAssignmentRow(i)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {intervalMatches && intervalMatches.length > 0 && (
            <>
              <p className="admin-preview-count">
                {intervalMatches.length} interval rows
                {intervalUnmatchedCount > 0 &&
                  ` — ${intervalUnmatchedCount} unmatched`}
              </p>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Parsed Name</th>
                      <th>Intervals</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {intervalMatches.map((r, i) => (
                      <tr
                        key={i}
                        className={!r.athleteId ? "admin-row-unmatched" : ""}
                      >
                        <td>
                          <AthleteSelect
                            value={r.athleteId}
                            onChange={(id) => updateIntervalMatch(i, id)}
                          />
                        </td>
                        <td>{r.data.name}</td>
                        <td>
                          {Object.entries(r.data.intervals)
                            .map(([label, value]) => `${label}: ${value}`)
                            .join(" | ")}
                        </td>
                        <td>
                          <button
                            className="admin-remove-btn"
                            onClick={() => removeIntervalRow(i)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <button
            className="nav-menu-trigger"
            onClick={handleSubmit}
            disabled={busy}
          >
            Save to Database
          </button>
        </div>
      )}

      <button
        className="switch-identity-link acme-regular text-outline"
        onClick={signOut}
      >
        Sign Out
      </button>
    </div>
  );
}

export default AdminDashboard;

```

### `src/pages/adminFmsAssignments.tsx`

```tsx
import { useEffect, useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";
import { fetchAliasesForSeason } from "../lib/aliasData";
import {
  buildNameLookup,
  buildAliasLookup,
  matchName,
} from "../lib/nameMatching";
import { supabase } from "../lib/supabaseClient";
import { RAW_FMS_ASSIGNMENTS } from "../data/rawFMSassignments";

const CURRENT_SEASON = 2026;

interface MatchedAssignment {
  rawName: string;
  category: string;
  variant: string;
  athleteId: string;
}

function AdminFmsAssignments() {
  const { signOut } = useAdminAuth();
  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [matches, setMatches] = useState<MatchedAssignment[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAthletesForSeason(CURRENT_SEASON),
      fetchAliasesForSeason(CURRENT_SEASON),
    ]).then(([athleteData, aliasData]) => {
      setAthletes(athleteData);

      const nameLookup = buildNameLookup(athleteData);
      const aliasLookup = buildAliasLookup(aliasData);

      const matched = RAW_FMS_ASSIGNMENTS.map((a) => ({
        rawName: a.rawName,
        category: a.category,
        variant: a.variant,
        athleteId: matchName(a.rawName, nameLookup, aliasLookup) ?? "",
      }));
      setMatches(matched);
    });
  }, []);

  function updateMatch(index: number, athleteId: string) {
    setMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  const unmatchedCount = matches?.filter((m) => !m.athleteId).length ?? 0;

  async function handleSubmit() {
    if (!matches) return;
    setBusy(true);
    setStatus(null);

    const resolved = matches.filter((m) => m.athleteId);
    const payload = resolved.map((m) => ({
      athlete_id: m.athleteId,
      season: CURRENT_SEASON,
      category: m.category,
      variant: m.variant,
    }));

    const { error, count } = await supabase
      .from("fms_assignments")
      .upsert(payload, {
        onConflict: "athlete_id,season,category",
        count: "exact",
      });

    setBusy(false);
    if (error) {
      setStatus(`❌ Failed to save: ${error.message}`);
    } else {
      setStatus(`✅ Saved ${count ?? payload.length} FMS assignments.`);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-title acme-regular text-outline">FMS Assignments</h1>

      {!matches && <p className="admin-status">Loading...</p>}
      {status && <p className="admin-status">{status}</p>}

      {matches && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {matches.length} assignments
            {unmatchedCount > 0 &&
              ` — ${unmatchedCount} unmatched, resolve before saving`}
          </p>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Raw Name</th>
                  <th>Category</th>
                  <th>Variant</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr
                    key={i}
                    className={!m.athleteId ? "admin-row-unmatched" : ""}
                  >
                    <td>
                      <select
                        className="admin-match-select"
                        value={m.athleteId}
                        onChange={(e) => updateMatch(i, e.target.value)}
                      >
                        <option value="">-- Select athlete --</option>
                        {athletes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{m.rawName}</td>
                    <td>{m.category}</td>
                    <td>{m.variant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="nav-menu-trigger"
            onClick={handleSubmit}
            disabled={busy}
          >
            Save to Database
          </button>
        </div>
      )}

      <button
        className="switch-identity-link acme-regular text-outline"
        onClick={signOut}
      >
        Sign Out
      </button>
    </div>
  );
}

export default AdminFmsAssignments;

```

### `src/pages/adminLogin.tsx`

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

function AdminLogin() {
  const { signIn, session } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    navigate("/admin/dashboard", { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
      setSubmitting(false);
    } else {
      navigate("/admin/dashboard", { replace: true });
    }
  }

  return (
    <div className="admin-login">
      <h1 className="admin-title acme-regular text-outline">Admin Login</h1>
      <form className="admin-login-form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="identity-input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="identity-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="admin-error">{error}</p>}
        <button
          type="submit"
          className="nav-menu-trigger"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;

```

### `src/pages/corePage.tsx`

```tsx
import { useEffect, useState } from "react";
import { fetchCoreRoutine } from "../lib/coreData";
import type { CoreRoutine } from "../lib/coreData";

function CorePage() {
  const [routine, setRoutine] = useState<CoreRoutine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCoreRoutine()
      .then((data) => {
        if (!cancelled) setRoutine(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="core-page">
      <h1 className="core-title acme-regular text-outline">Core Routine</h1>

      {error && (
        <p className="core-intro">
          Something went wrong loading the routine: {error}
        </p>
      )}

      {!error && !routine && <p className="core-intro">Loading...</p>}

      {routine && (
        <>
          <p className="core-intro">{routine.intro}</p>

          <div className="core-days-wrapper">
            {routine.days.map(({ day, routine: dayRoutine }) => (
              <div key={day} className="core-day-card">
                <div className="core-day-header">
                  <span className="core-day-name">{day}</span>
                  {dayRoutine.note && (
                    <span className="core-day-note">{dayRoutine.note}</span>
                  )}
                </div>
                <ul className="core-exercise-list">
                  {dayRoutine.exercises.map((ex, i) => (
                    <li key={`${ex.name}-${i}`} className="core-exercise-item">
                      {ex.url ? (
                        <a
                          className="core-exercise-link"
                          href={ex.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ex.name}
                        </a>
                      ) : (
                        <span className="core-exercise-plain">{ex.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default CorePage;

```

### `src/pages/error.tsx`

```tsx
import { useLocation } from "react-router-dom";
interface ErrorPageState {
  message?: string;
  code?: number;
}

function ErrorPage() {
  const location = useLocation();

  const state = (location.state as ErrorPageState) || {};
  const message = state.message || "Something went wrong.";
  const code = state.code || 404;

  return (
    <div className="error-page">
      <h1 className="error-code acme-regular text-outline">{code}</h1>
      <h2 className="error-message acme-regular text-outline">{message}</h2>
    </div>
  );
}
export default ErrorPage;

```

### `src/pages/fmsPage.tsx`

```tsx
import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { fetchFmsAssignments, fetchFmsExercises } from "../lib/fmsData";
import type { FmsAssignment, FmsExercise } from "../lib/fmsData";

const PHASE_ORDER = ["Weeks 1-3", "Weeks 4-6", "Weeks 7-9"];

interface AssignmentWithExercises {
  assignment: FmsAssignment;
  exercisesByPhase: Map<string, FmsExercise[]>;
}

function FmsPage() {
  const { athlete, season } = useUser();
  const [data, setData] = useState<AssignmentWithExercises[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);

    fetchFmsAssignments(athlete.id, season)
      .then(async (assignments) => {
        if (cancelled) return;
        const results: AssignmentWithExercises[] = [];
        for (const assignment of assignments) {
          const exercises = await fetchFmsExercises(assignment.category);
          const byPhase = new Map<string, FmsExercise[]>();
          exercises.forEach((ex) => {
            if (!byPhase.has(ex.phase)) byPhase.set(ex.phase, []);
            byPhase.get(ex.phase)!.push(ex);
          });
          results.push({ assignment, exercisesByPhase: byPhase });
        }
        if (!cancelled) setData(results);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  if (!athlete) return null;

  return (
    <div className="core-page">
      <h1 className="core-title acme-regular text-outline">
        {athlete.name}&apos;s FMS Correctives
      </h1>

      {error && <p className="core-intro">Something went wrong: {error}</p>}
      {!error && data === null && <p className="core-intro">Loading...</p>}

      {!error && data !== null && data.length === 0 && (
        <p className="core-intro">
          No FMS corrective has been assigned to you yet — check with your
          coach.
        </p>
      )}

      {data?.map(({ assignment, exercisesByPhase }) => (
        <div key={assignment.category} className="fms-category-block">
          <p className="core-intro">
            {assignment.category} ({assignment.variant}) — do these twice a
            week.
          </p>

          <div className="core-days-wrapper">
            {PHASE_ORDER.filter((p) => exercisesByPhase.has(p)).map((phase) => (
              <div key={phase} className="core-day-card">
                <div className="core-day-header">
                  <span className="core-day-name">{phase}</span>
                </div>
                <ul className="core-exercise-list">
                  {exercisesByPhase.get(phase)!.map((ex, i) => (
                    <li key={i} className="core-exercise-item">
                      {ex.url ? (
                        <a
                          className="core-exercise-link"
                          href={ex.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ex.name}
                        </a>
                      ) : (
                        <span className="core-exercise-plain">{ex.name}</span>
                      )}
                      {ex.reps && <span> — {ex.reps}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default FmsPage;

```

### `src/pages/home.tsx`

```tsx
import wartburgLogo from "../assets/still_pictures/wartburg_knights_logo_main.png";
import NavMenu from "../components/navMenu";
import IdentityLookup from "../components/identityLookup";
import SwitchIdentityPrompt from "../components/switchIdentity";
import { useUser } from "../context/UserContext";

const resourceLinks = [
  { label: "View Mileage", path: "/mileage" },
  { label: "View Workouts", path: "/workouts" },
  { label: "View Core", path: "/core" },
  { label: "View FMS", path: "/fms" },
  { label: "View Lifting Sheet", path: "/lifting_sheet" },
];

const statsLinks = [
  { label: "View TFRRS Stats", path: "/tfrrs-stats" },
  { label: "View Personal Records", path: "/personal-records" },
  { label: "View Season Bests", path: "/season-bests" },
];

function Home() {
  const { athlete, athleteId, athleteLoading } = useUser();

  // A session is stored and still resolving — avoid flashing the
  // identity-lookup screen before we know whether it's valid.
  if (athleteId && athleteLoading) {
    return null;
  }

  return (
    <>
      <img src={wartburgLogo} className="framework" alt="Wartburg Logo" />

      <h1 className="welcome-text acme-regular text-outline">
        {athlete
          ? `Welcome, ${athlete.name}`
          : "Welcome, please type your name and select it to view resources."}
      </h1>

      {!athlete && <IdentityLookup />}

      {athlete && (
        <>
          <nav className="left-res-drop">
            <NavMenu label="View WXC Resources" items={resourceLinks} />
          </nav>
          <nav className="mid-res-drop">
            <NavMenu label="View Personal Stats" items={statsLinks} />
          </nav>

          <SwitchIdentityPrompt />
        </>
      )}
    </>
  );
}

export default Home;

```

### `src/pages/liftingSheet.tsx`

```tsx
function LiftingSheet() {
  return (
    <div>
      <h1>Lifting Sheet</h1>
    </div>
  );
}
export default LiftingSheet;

```

### `src/pages/mileagePage.tsx`

```tsx
import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { fetchMileageForAthlete } from "../lib/mileageData";
import type { MileageEntry } from "../lib/mileageData";

const DAYS: { key: keyof MileageEntry; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

function formatWeekOf(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MileagePage() {
  const { athlete, season } = useUser();
  const [entries, setEntries] = useState<MileageEntry[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    setError(null);

    fetchMileageForAthlete(athlete.id, season!)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setSelectedWeek(data.length > 0 ? data[0].week_of : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  if (!athlete) return null;

  const currentEntry = entries?.find((e) => e.week_of === selectedWeek) ?? null;

  return (
    <div className="mileage-page">
      <h1 className="mileage-title acme-regular text-outline">
        {athlete.name}&apos;s Mileage
      </h1>

      {error && (
        <p className="mileage-no-data acme-regular text-outline">
          Something went wrong loading your mileage: {error}
        </p>
      )}

      {!error && entries === null && (
        <p className="mileage-no-data acme-regular text-outline">Loading...</p>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <p className="mileage-no-data acme-regular text-outline">
          No mileage has been logged for you yet — check back once this week's
          sheet is in!
        </p>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <>
          {entries.length > 1 && (
            <select
              className="identity-year-select"
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {entries.map((e) => (
                <option key={e.week_of} value={e.week_of}>
                  Week of {formatWeekOf(e.week_of)}
                </option>
              ))}
            </select>
          )}

          {currentEntry && (
            <div className="mileage-card">
              <div className="mileage-week-label">
                Week of {formatWeekOf(currentEntry.week_of)}
              </div>

              <div className="mileage-days-grid">
                {DAYS.map(({ key, label }) => (
                  <div key={key} className="mileage-day-cell">
                    <span className="mileage-day-label">{label}</span>
                    <span className="mileage-day-value">
                      {(currentEntry[key] as string) || "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mileage-total-row">
                <span className="mileage-total-label">Weekly Total</span>
                <span className="mileage-total-value">
                  {currentEntry.weekly_total || "—"}
                </span>
              </div>

              {currentEntry.notes && (
                <div className="mileage-notes">
                  <span className="mileage-notes-label">Notes</span>
                  <span className="mileage-notes-value">
                    {currentEntry.notes}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MileagePage;

```

### `src/pages/name_lookup.tsx`

```tsx
function Lookup() {
  return (
    <div>
      <h1>Look up your name</h1>
    </div>
  );
}
export default Lookup;

```

### `src/pages/tfrrsStats.tsx`

```tsx
import { useUser } from "../context/UserContext";
import tfrrsStats from "../data/tfrrs_stats.json";

interface BestEvent {
  event: string;
  time: string;
  resultUrl: string;
}

interface AthleteStats {
  name: string;
  tfrrsId: string;
  fetchedAt: string;
  bests: BestEvent[];
}

const statsByTfrrsId = tfrrsStats as Record<string, AthleteStats>;

function TfrrsStats() {
  const { athlete } = useUser();

  if (!athlete) return null;

  const stats = athlete.tfrrsId ? statsByTfrrsId[athlete.tfrrsId] : undefined;

  return (
    <div className="tfrrs-page">
      <h1 className="tfrrs-title acme-regular text-outline">
        {athlete.name}&apos;s TFRRS Bests
      </h1>

      {!stats && (
        <p className="tfrrs-no-data acme-regular text-outline">
          No TFRRS results found yet — check back once races are logged!
        </p>
      )}

      {stats && (
        <ul className="tfrrs-list">
          {stats.bests.map((b) => (
            <li key={b.event} className="tfrrs-item">
              <span className="tfrrs-event">{b.event}</span>
              <a
                className="tfrrs-time"
                href={b.resultUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {b.time}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TfrrsStats;

```

### `src/pages/workoutPages.tsx`

```tsx
import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import {
  fetchWorkoutsForAthlete,
  fetchIntervalsForAthlete,
} from "../lib/workoutData";
import type { WorkoutForDay, WorkoutIntervalEntry } from "../lib/workoutData";

interface DayWorkout {
  day: string;
  groupLetter?: string;
  description?: string;
  note?: string | null;
  intervals?: { label: string; value: string }[];
}

interface WeekWorkouts {
  weekOf: string;
  days: DayWorkout[];
}

function formatWeekOf(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Merges group-assignment rows and interval rows into one combined
// per-week, per-day structure, since an athlete's day may have either
// (or in principle both, though the two source PDF formats are mutually
// exclusive per page in practice).
function combineIntoWeeks(
  groupRows: WorkoutForDay[],
  intervalRows: WorkoutIntervalEntry[],
): WeekWorkouts[] {
  const weekMap = new Map<string, Map<string, DayWorkout>>();

  function getDayEntry(weekOf: string, day: string): DayWorkout {
    if (!weekMap.has(weekOf)) weekMap.set(weekOf, new Map());
    const dayMap = weekMap.get(weekOf)!;
    if (!dayMap.has(day)) dayMap.set(day, { day });
    return dayMap.get(day)!;
  }

  for (const r of groupRows) {
    const entry = getDayEntry(r.weekOf, r.day);
    entry.groupLetter = r.groupLetter;
    entry.description = r.description ?? undefined;
    entry.note = r.note;
  }

  for (const r of intervalRows) {
    const entry = getDayEntry(r.week_of, r.day);
    if (!entry.intervals) entry.intervals = [];
    entry.intervals.push({ label: r.interval_label, value: r.time_value });
  }

  return Array.from(weekMap.entries())
    .map(([weekOf, dayMap]) => ({
      weekOf,
      days: Array.from(dayMap.values()).sort((a, b) =>
        a.day.localeCompare(b.day),
      ),
    }))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
}

function WorkoutsPage() {
  const { athlete, season } = useUser();
  const [weeks, setWeeks] = useState<WeekWorkouts[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeeks(null);
    setError(null);

    Promise.all([
      fetchWorkoutsForAthlete(athlete.id, season),
      fetchIntervalsForAthlete(athlete.id, season),
    ])
      .then(([groupData, intervalData]) => {
        if (cancelled) return;
        const combined = combineIntoWeeks(groupData, intervalData);
        setWeeks(combined);
        setSelectedWeek(combined.length > 0 ? combined[0].weekOf : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  if (!athlete) return null;

  const currentWeek = weeks?.find((w) => w.weekOf === selectedWeek) ?? null;

  return (
    <div className="workouts-page">
      <h1 className="workouts-title acme-regular text-outline">
        {athlete.name}&apos;s Workouts
      </h1>

      {error && (
        <p className="workouts-no-data acme-regular text-outline">
          Something went wrong loading your workouts: {error}
        </p>
      )}

      {!error && weeks === null && (
        <p className="workouts-no-data acme-regular text-outline">Loading...</p>
      )}

      {!error && weeks !== null && weeks.length === 0 && (
        <p className="workouts-no-data acme-regular text-outline">
          No workouts have been assigned to you yet — check back once this
          week's sheet is in!
        </p>
      )}

      {!error && weeks !== null && weeks.length > 0 && (
        <>
          {weeks.length > 1 && (
            <select
              className="identity-year-select"
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {weeks.map((w) => (
                <option key={w.weekOf} value={w.weekOf}>
                  Week of {formatWeekOf(w.weekOf)}
                </option>
              ))}
            </select>
          )}

          {currentWeek && (
            <div className="workouts-card">
              <div className="workouts-week-label">
                Week of {formatWeekOf(currentWeek.weekOf)}
              </div>

              {currentWeek.days.map((d) => (
                <div key={d.day} className="workouts-day-block">
                  <div className="workouts-day-header">
                    <span className="workouts-day-name">
                      {capitalize(d.day)}
                    </span>
                    {d.groupLetter && (
                      <span className="workouts-group-badge">
                        Group {d.groupLetter}
                      </span>
                    )}
                  </div>

                  {d.description && (
                    <p className="workouts-description">{d.description}</p>
                  )}

                  {d.note && <p className="workouts-note">{d.note}</p>}

                  {d.intervals && d.intervals.length > 0 && (
                    <ul className="workouts-interval-list">
                      {d.intervals.map((i) => (
                        <li key={i.label} className="workouts-interval-item">
                          <span className="workouts-interval-label">
                            {i.label}
                          </span>
                          <span className="workouts-interval-value">
                            {i.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!d.description &&
                    (!d.intervals || d.intervals.length === 0) && (
                      <p className="workouts-description">
                        No workout description found for this day.
                      </p>
                    )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WorkoutsPage;

```

### `src/App.css`

```css
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  min-height: 100svh;
  text-align: center;
  box-sizing: border-box;
}

.welcome-text {
  position: fixed;
  top: 24vh;
  left: 51vw;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 10;
  text-align: center;
  white-space: nowrap;
}

.framework {
  position: fixed;
  top: 2vh;
  left: 45vw;
  width: var(--logo-width);
  height: auto;
  z-index: 10;
}

.acme-regular {
  font-family: "Acme", sans-serif;
  font-weight: 400;
  font-style: normal;
}

.text-outline {
  color: white;
  -webkit-text-stroke: 1px black;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.left-res-drop {
  position: fixed;
  top: 35vh;
  left: 10vw;
  z-index: 15;
}

.mid-res-drop {
  position: fixed;
  top: 35vh;
  left: 41.5vw;
  z-index: 15;
}

.nav-menu {
  position: relative;
  display: inline-block;
}

.nav-menu-trigger {
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  color: rgb(0, 0, 0);
  font-size: clamp(16px, 2.2vw, 35px);
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: clamp(12px, 2vw, 16px) clamp(20px, 3vw, 28px);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition:
    background 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.nav-menu-trigger:hover {
  background: rgba(90, 84, 84, 0.418);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.nav-menu-arrow {
  font-size: 14px;
  color: black;
  transition: transform 0.2s ease;
}

.nav-menu-arrow.open {
  transform: rotate(180deg);
}

.nav-menu-dropdown {
  position: absolute;
  top: calc(100% + var(--space-sm));
  right: 0;
  left: auto;
  min-width: var(--dropdown-min-width);
  max-width: min(90vw, 280px);
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 8px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 20;
  animation: dropdown-fade 0.15s ease-out;
}

@keyframes dropdown-fade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.nav-menu-item {
  display: block;
  padding: 12px 14px;
  border-radius: 6px;
  color: rgb(0, 0, 0);
  font-size: clamp(14px, 1.6vw, 25px);
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
}

.nav-menu-item:hover {
  background: rgba(90, 84, 84, 0.418);
}

.back-button {
  position: fixed;
  top: var(--space-sm);
  left: var(--space-sm);
  z-index: 35;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 8px;
  padding: clamp(6px, 1.2vw, 10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: background 0.2s ease;
}

.back-button img {
  width: var(--icon-size);
  height: var(--icon-size);
  display: block;
}

.back-button:hover {
  background: rgba(90, 84, 84, 0.418);
}

.error-page {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  text-align: center;
  padding: var(--space-lg);
  box-sizing: border-box;
}

.error-code {
  position: fixed;
  top: 10vh;
  left: 50vw;
  transform: translate(-50%, -50%);
  font-size: clamp(64px, 12vw, 150px);
  font-weight: 700;
  margin: 0;
  line-height: 1;
  z-index: var(--z-overlay);
}

.error-message {
  position: fixed;
  top: 20vh;
  left: 50vw;
  transform: translate(-50%, -50%);
  font-size: clamp(25px, 2.5vw, 50px);
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  z-index: var(--z-overlay);
}

.identity-lookup {
  position: fixed;
  top: 45vh;
  left: 50vw;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  text-align: center;
  z-index: 10;
}

.identity-title {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
}

.identity-input {
  width: min(90vw, 400px);
  padding: clamp(12px, 2vw, 16px) clamp(16px, 2.5vw, 20px);
  font-size: clamp(16px, 2vw, 20px);
  border-radius: 10px;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  color: black;
  outline: none;
}

.identity-input:focus {
  border-color: black;
}

.identity-results {
  list-style: none;
  margin: 0;
  padding: 4px;
  width: min(90vw, 400px);
  max-height: 240px;
  overflow-y: auto;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
}

.identity-result-item {
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  background: none;
  border: none;
  border-radius: 6px;
  color: rgb(0, 0, 0);
  font-size: clamp(15px, 1.8vw, 18px);
  cursor: pointer;
  transition: background 0.15s ease;
}

.identity-result-item:hover {
  background: rgba(90, 84, 84, 0.418);
}

.identity-no-match {
  margin: 0;
  font-size: clamp(14px, 1.6vw, 35px);
}

.switch-identity-link {
  position: fixed;
  top: 27vh;
  left: 51vw;
  transform: translateX(-50%);
  background: none;
  border: none;
  color: white;
  -webkit-text-stroke: 1px black;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  text-decoration: underline;
  font-size: 35px;
  cursor: pointer;
  z-index: 10;
  transition: opacity 0.15s ease;
}

.switch-identity-link:hover {
  opacity: 0.8;
}

.switch-identity-confirm {
  position: fixed;
  top: 28vh;
  left: 50vw;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 10px 14px;
  z-index: 10;
  backdrop-filter: blur(6px);
}

.switch-identity-confirm-text {
  color: black;
  font-size: 25px;
}

.switch-identity-confirm-yes,
.switch-identity-confirm-no {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.switch-identity-confirm-yes {
  background: rgba(0, 0, 0, 0.589);
  color: white;
}

.switch-identity-confirm-no {
  background: rgba(90, 84, 84, 0.418);
  color: black;
}

.switch-identity-confirm-yes:hover,
.switch-identity-confirm-no:hover {
  opacity: 0.85;
}

.tfrrs-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  box-sizing: border-box;
  z-index: 10;
}

.tfrrs-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 48px);
  text-align: center;
}

.tfrrs-no-data {
  margin: 0;
  font-size: clamp(16px, 2vw, 24px);
  text-align: center;
}

.tfrrs-list {
  list-style: none;
  margin: 0;
  padding: 12px;
  width: min(90vw, 480px);
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tfrrs-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.4);
}

.tfrrs-event {
  font-weight: 700;
  color: black;
  font-size: clamp(14px, 1.6vw, 18px);
}

.tfrrs-time {
  color: black;
  font-weight: 600;
  text-decoration: underline;
  font-size: clamp(14px, 1.6vw, 18px);
  transition: opacity 0.15s ease;
}

.tfrrs-time:hover {
  opacity: 0.7;
}

.identity-year-select {
  width: min(90vw, 400px);
  padding: clamp(10px, 1.8vw, 14px) clamp(12px, 2vw, 16px);
  font-size: clamp(14px, 1.8vw, 18px);
  border-radius: 10px;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  color: black;
  cursor: pointer;
}

.admin-login,
.admin-dashboard {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  box-sizing: border-box;
  z-index: 10;
}

.admin-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 48px);
}

.admin-login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(90vw, 360px);
}

.admin-error {
  color: #b00020;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
  font-size: 14px;
}

.admin-mode-toggle {
  display: flex;
  gap: 12px;
}

.admin-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: center;
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 16px;
}

.admin-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: black;
  font-weight: 600;
}

.admin-status {
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 10px 16px;
  color: black;
  margin: 0;
}

.admin-preview {
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.admin-preview-count {
  color: white;
  -webkit-text-stroke: 1px black;
  margin: 0;
}

.admin-table-wrapper {
  width: 100%;
  max-height: 400px;
  overflow: auto;
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th,
.admin-table td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
  white-space: nowrap;
}

.admin-table th {
  position: sticky;
  top: 0;
  background: rgba(240, 233, 233, 0.98);
}

.admin-login-link {
  margin-top: 12px;
  background: none;
  border: none;
  text-decoration: underline;
  font-size: 40px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.admin-login-link:hover {
  opacity: 0.8;
}

.mileage-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  box-sizing: border-box;
  z-index: 10;
}

.mileage-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 48px);
  text-align: center;
}

.mileage-no-data {
  margin: 0;
  font-size: clamp(16px, 2vw, 24px);
  text-align: center;
}

.mileage-card {
  width: min(90vw, 480px);
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mileage-week-label {
  font-weight: 700;
  font-size: clamp(16px, 2vw, 20px);
  color: black;
  text-align: center;
}

.mileage-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.mileage-day-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  padding: 8px 4px;
}

.mileage-day-label {
  font-weight: 700;
  font-size: clamp(11px, 1.4vw, 14px);
  color: black;
}

.mileage-day-value {
  font-size: clamp(11px, 1.4vw, 14px);
  color: black;
  text-align: center;
}

.mileage-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
}

.mileage-total-label {
  font-weight: 700;
  color: black;
  font-size: clamp(14px, 1.6vw, 18px);
}

.mileage-total-value {
  font-weight: 700;
  color: black;
  font-size: clamp(14px, 1.6vw, 18px);
}

.mileage-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
}

.mileage-notes-label {
  font-weight: 700;
  color: black;
  font-size: 13px;
}

.mileage-notes-value {
  color: black;
  font-size: 14px;
}

.workouts-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  box-sizing: border-box;
  z-index: 10;
}

.workouts-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 48px);
  text-align: center;
}

.workouts-no-data {
  margin: 0;
  font-size: clamp(16px, 2vw, 24px);
  text-align: center;
}

.workouts-card {
  width: min(90vw, 520px);
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

.workouts-week-label {
  font-weight: 700;
  font-size: clamp(16px, 2vw, 20px);
  color: black;
  text-align: center;
}

.workouts-day-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  padding: 14px;
}

.workouts-day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.workouts-day-name {
  font-weight: 700;
  font-size: clamp(15px, 1.8vw, 18px);
  color: black;
}

.workouts-group-badge {
  background: rgba(0, 0, 0, 0.75);
  color: white;
  font-weight: 700;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
}

.workouts-description {
  margin: 0;
  color: black;
  font-size: clamp(14px, 1.6vw, 16px);
  line-height: 1.4;
}

.workouts-interval-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workouts-interval-item {
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: clamp(13px, 1.5vw, 15px);
}

.workouts-interval-label {
  font-weight: 700;
  color: black;
}

.workouts-interval-value {
  color: black;
}

.admin-row-unmatched {
  background: rgba(255, 200, 200, 0.5);
}

.admin-match-select {
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.3);
}

.admin-remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #b00020;
  font-weight: 700;
}

.workouts-note {
  margin: 0;
  font-size: clamp(12px, 1.4vw, 14px);
  font-style: italic;
  color: rgba(0, 0, 0, 0.75);
}

.core-page {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-md);
  box-sizing: border-box;
  z-index: 10;
}

.core-title {
  margin: 0;
  font-size: clamp(28px, 4vw, 48px);
  text-align: center;
}

.core-intro {
  max-width: 1000px;
  text-align: center;
  color: rgb(0, 0, 0);
  -webkit-text-stroke: 2px black;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  font-size: clamp(14px, 1.8vw, 20px);
  line-height: 1;
  margin: 0 auto;
}

.core-days-wrapper {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 1100px;
}

.core-day-card {
  background: rgba(240, 233, 233, 0.863);
  border: 2px solid rgba(0, 0, 0, 0.589);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.core-day-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  padding-bottom: 8px;
}

.core-day-name {
  font-weight: 700;
  font-size: clamp(15px, 1.8vw, 18px);
  color: black;
}

.core-day-note {
  font-size: 12px;
  font-style: italic;
  color: rgba(0, 0, 0, 0.65);
}

.core-exercise-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.core-exercise-item {
  font-size: clamp(13px, 1.5vw, 14px);
}

.core-exercise-link {
  color: black;
  text-decoration: underline;
  transition: opacity 0.15s ease;
}

.core-exercise-link:hover {
  opacity: 0.6;
}

.core-exercise-plain {
  color: black;
}

.fms-category-block {
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
}

```

### `src/App.tsx`

```tsx
import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/home";
import ErrorPage from "./pages/error";
import BackButton from "./components/backButton";
import RequireIdentity from "./components/requireIdentity";
import ComingSoon from "./components/comingSoon";
import TfrrsStats from "./pages/tfrrsStats";
import Workouts from "./pages/workoutPages";
import AdminLogin from "./pages/adminLogin";
import RequireAdmin from "./components/requireAdmin";
import AdminDashboard from "./pages/adminDashboard";
import MileagePage from "./pages/mileagePage";
import CorePage from "./pages/corePage";
import AdminFmsAssignments from "./pages/adminFmsAssignments";
import FmsPage from "./pages/fmsPage";

const BACK_BUTTON_ROUTES = new Set(["/"]);

function AppContent() {
  const location = useLocation();

  const isKnownRoute = [
    "/",
    "/home",
    "/lookup",
    "/about",
    "/mileage",
    "/core",
    "/error",
    "/fms",
    "/lifting_sheet",
    "/tfrrs-stats",
    "/personal-records",
    "/season-bests",
    "/workouts",
    "/admin",
    "/admin/dashboard",
    "/admin/fms",
  ].includes(location.pathname);
  const showBackButton =
    isKnownRoute && !BACK_BUTTON_ROUTES.has(location.pathname);

  return (
    <>
      {showBackButton && <BackButton />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="*" element={<ErrorPage />} />
        <Route
          path="/about"
          element={
            <RequireIdentity>
              <ComingSoon />
            </RequireIdentity>
          }
        />
        <Route
          path="/mileage"
          element={
            <RequireIdentity>
              <MileagePage />
            </RequireIdentity>
          }
        />
        <Route
          path="/core"
          element={
            <RequireIdentity>
              <CorePage />
            </RequireIdentity>
          }
        />
        <Route
          path="/lookup"
          element={
            <RequireIdentity>
              <ComingSoon />
            </RequireIdentity>
          }
        />
        <Route
          path="/fms"
          element={
            <RequireIdentity>
              <FmsPage />
            </RequireIdentity>
          }
        />
        <Route
          path="/tfrrs-stats"
          element={
            <RequireIdentity>
              <TfrrsStats />
            </RequireIdentity>
          }
        />
        <Route
          path="/personal-records"
          element={
            <RequireIdentity>
              <ComingSoon message="Personal records aren't tracked yet — check back soon!" />
            </RequireIdentity>
          }
        />
        <Route
          path="/season-bests"
          element={
            <RequireIdentity>
              <ComingSoon message="Season bests aren't tracked yet — check back soon!" />
            </RequireIdentity>
          }
        />
        <Route
          path="/workouts"
          element={
            <RequireIdentity>
              <Workouts />
            </RequireIdentity>
          }
        />
        <Route path="/admin" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/fms"
          element={
            <RequireAdmin>
              <AdminFmsAssignments />
            </RequireAdmin>
          }
        />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Background imageUrl={wartburgDroneShot} opacity={0.7} />
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

```

### `src/index.css`

```css
:root {
  --text: #6b6375;
  --text-h: #08060d;
  --bg: #fff;
  --border: #e5e4e7;
  --code-bg: #f4f3ec;
  --accent: #aa3bff;
  --accent-bg: rgba(170, 59, 255, 0.1);
  --accent-border: rgba(170, 59, 255, 0.5);
  --social-bg: rgba(244, 243, 236, 0.5);
  --shadow:
    rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px;

  --sans: system-ui, "Segoe UI", Roboto, sans-serif;
  --heading: system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, Consolas, monospace;

  font: 18px/145% var(--sans);
  letter-spacing: 0.18px;
  color-scheme: light dark;
  color: var(--text);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Responsive spacing scale — grows/shrinks fluidly with viewport width */
  --space-sm: clamp(12px, 2vw, 20px);
  --space-md: clamp(16px, 3vw, 32px);
  --space-lg: clamp(24px, 5vw, 56px);

  /* Responsive sizing for repeated UI chrome */
  --icon-size: clamp(20px, 3vw, 28px);
  --logo-width: clamp(120px, 20vw, 220px);
  --dropdown-min-width: clamp(160px, 30vw, 220px);

  @media (max-width: 1024px) {
    font-size: 16px;
  }
}

@font-face {
  font-family: "Acme";
  src: url("./assets/fonts/Acme-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #9ca3af;
    --text-h: #f3f4f6;
    --bg: #16171d;
    --border: #2e303a;
    --code-bg: #1f2028;
    --accent: #c084fc;
    --accent-bg: rgba(192, 132, 252, 0.15);
    --accent-border: rgba(192, 132, 252, 0.5);
    --social-bg: rgba(47, 48, 58, 0.5);
    --shadow:
      rgba(0, 0, 0, 0.4) 0 10px 15px -3px, rgba(0, 0, 0, 0.25) 0 4px 6px -2px;
  }

  #social .button-icon {
    filter: invert(1) brightness(2);
  }
}

#root {
  width: 100%;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

body {
  margin: 0;
}

h1,
h2 {
  font-family: var(--heading);
  font-weight: 500;
  color: var(--text-h);
}

h1 {
  font-size: clamp(28px, 5.5vw, 56px);
  letter-spacing: -1.68px;
  margin: var(--space-md) 0;
}
h2 {
  font-size: clamp(18px, 3vw, 24px);
  line-height: 118%;
  letter-spacing: -0.24px;
  margin: 0 0 8px;
}

p {
  margin: 0;
}

code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: 4px;
  color: var(--text-h);
}

code {
  font-size: 15px;
  line-height: 135%;
  padding: 4px 8px;
  background: var(--code-bg);
}

```

### `src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { UserProvider } from "./context/UserContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminAuthProvider>
      <UserProvider>
        <App />
      </UserProvider>
    </AdminAuthProvider>
  </StrictMode>,
);

```

### `.gitignore`

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local
.env

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

```

### `eslint.config.js`

```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])

```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>my-lookup-app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

### `package-lock.json`

_(binary or excluded — contents not inlined)_

### `package.json`

_(binary or excluded — contents not inlined)_

### `README.md`

```markdown
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

```

### `repo-digest.md`

_(binary or excluded — contents not inlined)_

### `repo-digest.mjs`

```javascript
#!/usr/bin/env node
/**
 * repo-digest.mjs
 *
 * Walks the current repo and writes a single markdown file (repo-digest.md)
 * containing:
 *   1. A directory tree
 *   2. The full contents of every text/source file, clearly delimited
 *
 * This format is designed to be pasted into or fed to an LLM/agent so it can
 * understand the whole project structure and code in one shot.
 *
 * Usage:
 *   node repo-digest.mjs
 *   node repo-digest.mjs --root ./my-project --out ./digest.md
 */

import fs from "node:fs";
import path from "node:path";

// ---------- CONFIG ----------

// Directories to skip entirely (build artifacts, deps, vcs internals, etc.)
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
]);

// File extensions considered "binary" / not useful to dump as text.
// Their presence is still noted in the tree, just not inlined.
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".mov",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".lock",
  ".json", // package-lock.json is text but huge/noisy; still skip contents
]);

// Specific filenames to skip contents for (still shown in tree)
const SKIP_CONTENT_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "repo-digest.md",
]);

// Max file size (bytes) to inline before truncating
const MAX_FILE_BYTES = 100_000;

// ---------- ARG PARSING ----------

function parseArgs(argv) {
  const args = { root: ".", out: "repo-digest.md" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const { root, out } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(root);
const OUT_PATH = path.resolve(out);

// ---------- .gitignore (basic support) ----------

function loadGitignorePatterns(rootDir) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\/$/, "")); // strip trailing slash
}

const gitignorePatterns = loadGitignorePatterns(ROOT);

function isGitignored(relativePath) {
  const base = path.basename(relativePath);
  return gitignorePatterns.some((pattern) => {
    // very basic matching: exact name, or simple * wildcard
    if (pattern === base || pattern === relativePath) return true;
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" +
          pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
      );
      return regex.test(base) || regex.test(relativePath);
    }
    return false;
  });
}

// ---------- WALK ----------

function walk(dir, relativeTo) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path
      .relative(relativeTo, fullPath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (isGitignored(relPath)) continue;
      const children = walk(fullPath, relativeTo);
      nodes.push({ type: "dir", name: entry.name, relPath, children });
    } else {
      if (isGitignored(relPath)) continue;
      nodes.push({ type: "file", name: entry.name, relPath, fullPath });
    }
  }
  return nodes;
}

// ---------- RENDER TREE ----------

function renderTree(nodes, prefix = "") {
  let output = "";
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    output +=
      prefix + connector + node.name + (node.type === "dir" ? "/" : "") + "\n";
    if (node.type === "dir") {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      output += renderTree(node.children, childPrefix);
    }
  });
  return output;
}

// ---------- COLLECT FILES (flat list, in tree order) ----------

function collectFiles(nodes, list = []) {
  for (const node of nodes) {
    if (node.type === "file") list.push(node);
    else collectFiles(node.children, list);
  }
  return list;
}

function langFromExt(ext) {
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".py": "python",
    ".sh": "bash",
    ".ps1": "powershell",
  };
  return map[ext] || "";
}

// ---------- MAIN ----------

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Root path does not exist: ${ROOT}`);
    process.exit(1);
  }

  const tree = walk(ROOT, ROOT);
  const treeText = renderTree(tree);
  const files = collectFiles(tree);

  const sections = [];
  sections.push(`# Repository Digest\n`);
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push(`Root: \`${path.basename(ROOT)}\`\n`);
  sections.push(`## Directory Structure\n`);
  sections.push("```\n" + path.basename(ROOT) + "/\n" + treeText + "```\n");
  sections.push(`## File Contents\n`);

  let includedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext) || SKIP_CONTENT_FILES.has(file.name)) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(binary or excluded — contents not inlined)_\n`,
      );
      skippedCount++;
      continue;
    }

    let content;
    try {
      const stat = fs.statSync(file.fullPath);
      if (stat.size > MAX_FILE_BYTES) {
        content = fs
          .readFileSync(file.fullPath, "utf8")
          .slice(0, MAX_FILE_BYTES);
        content += `\n\n... [truncated, file is ${stat.size} bytes, showing first ${MAX_FILE_BYTES}] ...`;
      } else {
        content = fs.readFileSync(file.fullPath, "utf8");
      }
    } catch (err) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(could not read file: ${err.message})_\n`,
      );
      skippedCount++;
      continue;
    }

    const lang = langFromExt(ext);
    sections.push(
      `### \`${file.relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`,
    );
    includedCount++;
  }

  sections.push(
    `\n---\n_Digest complete: ${includedCount} files inlined, ${skippedCount} skipped (binary/excluded)._`,
  );

  fs.writeFileSync(OUT_PATH, sections.join("\n"), "utf8");
  console.log(`✅ Wrote digest to ${OUT_PATH}`);
  console.log(`   Files inlined: ${includedCount}`);
  console.log(`   Files skipped: ${skippedCount}`);
}

main();

```

### `tsconfig.app.json`

_(binary or excluded — contents not inlined)_

### `tsconfig.json`

_(binary or excluded — contents not inlined)_

### `tsconfig.node.json`

_(binary or excluded — contents not inlined)_

### `vite.config.ts`

```typescript
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})

```


---
_Digest complete: 55 files inlined, 19 skipped (binary/excluded)._