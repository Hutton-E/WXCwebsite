# Repository Digest

Generated: 2026-09-14T00:16:59.744Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── mileageSheets/
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
│   └── fetch-tfrrs-stats.mjs
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
│   │   ├── distance_roster_17.json
│   │   ├── distance_roster_18.json
│   │   ├── distance_roster_19.json
│   │   ├── distance_roster_20.json
│   │   ├── distance_roster_21.json
│   │   ├── distance_roster_22.json
│   │   ├── distance_roster_23.json
│   │   ├── distance_roster_24.json
│   │   ├── distance_roster_25.json
│   │   ├── distance_roster_26.json
│   │   ├── roster_history.json
│   │   └── tfrrs_stats.json
│   ├── lib/
│   │   ├── adminData.ts
│   │   ├── mileageData.ts
│   │   ├── pdfParser.ts
│   │   ├── supabaseClient.ts
│   │   └── workoutData.ts
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── adminDashboard.tsx
│   │   ├── adminLogin.tsx
│   │   ├── corePage.tsx
│   │   ├── error.tsx
│   │   ├── fms.tsx
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
 * each year listed in YEARS, and writes one file per season:
 *   src/data/distance_roster_{YY}.json   (e.g. distance_roster_25.json for 2025)
 *
 * These are separate from distance_roster_26.json (the current-season login
 * roster used by identity lookup) — this script is for building out
 * additional selectable seasons.
 *
 * Usage: node scripts/fetch-roster-by-year.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

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

const CLASS_YEAR_MAP = {
  freshman: "Fr.",
  sophomore: "So.",
  junior: "Jr.",
  senior: "Sr.",
  graduate: "Gr.",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeClassYear(raw) {
  const cleaned = raw.trim().replace(/\.$/, "").toLowerCase();
  return CLASS_YEAR_MAP[cleaned] || raw.trim();
}

// ---------- MODERN TABLE PARSER ----------

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

        const classYear = $(cells[1]).text().trim();
        const hometownRaw = $(cells[2]).text().trim();
        const [hometown, highSchool] = hometownRaw
          .split("/")
          .map((s) => s.trim());

        if (!name) return;

        athletes.push({
          id,
          name,
          team,
          year: normalizeClassYear(classYear),
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

// ---------- LEGACY CARD PARSER (older seasons, e.g. 2014-style pages) ----------

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
      year: normalizeClassYear(classMatch[1]),
      hometown: classMatch[2].trim(),
      highSchool: classMatch[3].trim(),
      profileUrl: href.startsWith("http")
        ? href
        : `https://go-knights.net${href}`,
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
      console.warn(`⚠️  No athletes found for ${year} — skipping file write.`);
      continue;
    }

    const shortYear = String(year % 100).padStart(2, "0");
    const outPath = path.resolve(`src/data/distance_roster_${shortYear}.json`);

    const output = {
      generatedAt: new Date().toISOString(),
      season: year,
      sources: TEAMS.map((t) => `${t.baseUrl}/${year}`),
      athletes: allAthletes,
    };

    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
    console.log(`✅ Wrote ${allAthletes.length} athletes to ${outPath}`);
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
 * Unlike fetch-tfrrs-ids-all-years.mjs (which only reads the CURRENT TFRRS
 * team roster — limited to currently-eligible athletes), this script reads
 * the season dropdown on the TFRRS team page itself, discovers every
 * available season's `config_hnd` value, and fetches EACH season's roster
 * snapshot. Since TFRRS assigns one permanent ID per athlete across their
 * whole career, this surfaces real tfrrsIds for graduated athletes who
 * don't appear on the current team page at all.
 *
 * Then applies the resulting name -> tfrrsId lookup to every
 * src/data/distance_roster_*.json file.
 *
 * Usage: node scripts/fetch-tfrrs-ids-historical.mjs
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

const DELAY_MS = 600;

const MANUAL_OVERRIDES = {
  "philip dahlen": "9444002",
  "adam wilke": "9444015",
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

// ---------- Discover every "Cross Country" season option on the page ----------

function findXcSeasonOptions($) {
  const options = [];

  $("select option").each((_, el) => {
    const value = $(el).attr("value");
    const text = $(el).text().trim();
    if (!value) return;
    // Only care about Cross Country seasons — indoor/outdoor track rosters
    // aren't relevant to your distance-roster identity data.
    if (/cross country/i.test(text)) {
      options.push({ value, text });
    }
  });

  return options;
}

// ---------- Parse a roster table (same shape as the current-page parser) ----------

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

// ---------- Roster file helpers ----------

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

function loadRoster(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveRoster(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  const nameToId = new Map();
  for (const [name, id] of Object.entries(MANUAL_OVERRIDES)) {
    nameToId.set(name, id);
  }

  // ---------- Step 1: discover + fetch every historical season per team ----------
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`\n=== ${team} ===`);
    console.log(`Fetching base page to discover season options: ${url}`);
    const $base = await fetchPage(url);
    if (!$base) continue;

    const seasonOptions = findXcSeasonOptions($base);
    console.log(
      `Found ${seasonOptions.length} Cross Country season option(s):`,
    );
    seasonOptions.forEach((o) =>
      console.log(`   - ${o.text} (config_hnd=${o.value})`),
    );

    // Also parse the base page itself (covers the current/default season).
    const baseEntries = parseRosterTable($base);
    let addedFromBase = 0;
    for (const e of baseEntries) {
      if (!nameToId.has(e.normalizedName)) {
        nameToId.set(e.normalizedName, e.tfrrsId);
        addedFromBase++;
      }
    }
    console.log(`Base page: +${addedFromBase} new names`);

    // Fetch each historical season snapshot.
    const cleanBaseUrl = url.replace(/\.html$/, "");
    for (const { value, text } of seasonOptions) {
      const seasonUrl = `${cleanBaseUrl}?config_hnd=${value}`;
      const $season = await fetchPage(seasonUrl);
      await sleep(DELAY_MS);
      if (!$season) continue;

      const entries = parseRosterTable($season);
      let added = 0;
      for (const e of entries) {
        if (!nameToId.has(e.normalizedName)) {
          nameToId.set(e.normalizedName, e.tfrrsId);
          added++;
        }
      }
      console.log(`  ${text}: ${entries.length} athletes, +${added} new names`);
    }
  }

  console.log(
    `\nTotal known name -> tfrrsId matches after historical crawl: ${nameToId.size}`,
  );

  // ---------- Step 2: apply to every distance_roster_*.json ----------
  const rosterFiles = findRosterFiles();
  let grandTotalMatched = 0;
  let grandTotalAthletes = 0;
  const stillUnmatched = new Set();

  console.log(`\nApplying matches to ${rosterFiles.length} roster file(s)...`);

  for (const filePath of rosterFiles) {
    const data = loadRoster(filePath);
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
    console.log(`\n⚠️  ${stillUnmatched.size} name(s) still unmatched:`);
    [...stillUnmatched].sort().forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nThese may be pre-2010ish athletes (before TFRRS's own data goes back), " +
        "name-spelling mismatches, or athletes TFRRS never had results for. " +
        "Add confirmed matches to MANUAL_OVERRIDES.",
    );
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
 * Matches athletes in src/data/distance_roster.json against TFRRS team
 * roster pages, and adds a `tfrrsId` field to each matched athlete.
 *
 * TFRRS lists names as "Last, First" — this does a normalized match against
 * your "First Last" roster names. Mismatches (nicknames, spelling
 * differences) are logged so you can add manual overrides below.
 *
 * Usage: node scripts/fetch-tfrrs-ids.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

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

const ROSTER_PATH = path.resolve("src/data/distance_roster_26.json");

// Add entries here when automatic matching fails due to spelling/nickname
// differences between go-knights.net and TFRRS. Key = your roster id.
const MANUAL_OVERRIDES = {
  17015: "9444002", // e.g. Philip Dahlen -> TFRRS Phillip Dahlen
  17028: "9444015", // e.g. Adam Wilke -> TFRRS Adam Wilkie
};

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
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
        const rawName = link.text().trim(); // "Last, First"
        const href = link.attr("href") || "";
        const tfrrsId = href.split("/").filter(Boolean)[1] || ""; // /athletes/{id}/...

        if (!rawName || !tfrrsId) return;

        const [last, first] = rawName.split(",").map((s) => s.trim());
        if (!last || !first) return;

        entries.push({
          tfrrsId,
          normalizedName: normalize(`${first} ${last}`),
          rawName,
        });
      });
  });

  return entries;
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));

  const allTfrrsEntries = [];
  for (const { url, team } of TFRRS_TEAMS) {
    console.log(`Fetching TFRRS roster for ${team}...`);
    const entries = await fetchTfrrsRoster(url);
    console.log(`  Found ${entries.length} TFRRS entries`);
    allTfrrsEntries.push(...entries);
  }

  let matched = 0;
  const unmatched = [];

  for (const athlete of roster.athletes) {
    if (MANUAL_OVERRIDES[athlete.id]) {
      athlete.tfrrsId = MANUAL_OVERRIDES[athlete.id];
      matched++;
      continue;
    }

    const target = normalize(athlete.name);
    const match = allTfrrsEntries.find((e) => e.normalizedName === target);

    if (match) {
      athlete.tfrrsId = match.tfrrsId;
      matched++;
    } else {
      unmatched.push(athlete.name);
    }
  }

  fs.writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2), "utf8");

  console.log(`\n✅ Matched ${matched}/${roster.athletes.length} athletes.`);
  if (unmatched.length > 0) {
    console.log(
      `\n⚠️  Could not match ${unmatched.length} athletes automatically:`,
    );
    unmatched.forEach((n) => console.log(`   - ${n}`));
    console.log(
      "\nFind their TFRRS profile manually (search their name on tfrrs.org), " +
        "grab the numeric ID from the profile URL, and add it to MANUAL_OVERRIDES in this script.",
    );
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
 * Scans EVERY src/data/distance_roster_*.json file, collects every unique
 * tfrrsId across all seasons (the same real person may appear in several
 * yearly files but always shares one tfrrsId — TFRRS IDs are stable across
 * a career, unlike go-knights' per-season roster IDs), and fetches each
 * unique athlete's "College Bests" table exactly once.
 *
 * Writes src/data/tfrrs_stats.json KEYED BY tfrrsId (not by roster id),
 * so any season's athlete record can look up its own stats via
 * athlete.tfrrsId, regardless of which year's file it came from.
 *
 * Supports two tfrrsId shapes:
 *   - A plain numeric ID (e.g. "8271797") -> builds the standard
 *     tfrrs.org/athletes/{id}/Wartburg/{Name}.html URL.
 *   - A full URL already (for TFRRS's alternate hashed-profile format,
 *     e.g. "https://www.tfrrs.org/athlete/{hash}.html") -> used as-is.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_DIR = path.resolve("src/data");
const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");
const DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findRosterFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^distance_roster_\d+\.json$/.test(f))
    .map((f) => path.join(DATA_DIR, f));
}

function resolveProfileUrl(tfrrsId, name) {
  if (tfrrsId.startsWith("http")) {
    // Hashed-format profile — already a full, usable URL.
    return tfrrsId;
  }
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
  const rosterFiles = findRosterFiles();
  if (rosterFiles.length === 0) {
    console.error(`No distance_roster_*.json files found in ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(
    `Scanning ${rosterFiles.length} roster file(s) for unique tfrrsIds...`,
  );

  // Map keyed by tfrrsId -> a representative display name (whichever we see first).
  const uniqueAthletes = new Map();

  for (const filePath of rosterFiles) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const athlete of data.athletes) {
      if (athlete.tfrrsId && !uniqueAthletes.has(athlete.tfrrsId)) {
        uniqueAthletes.set(athlete.tfrrsId, athlete.name);
      }
    }
  }

  console.log(
    `Found ${uniqueAthletes.size} unique athletes (by tfrrsId) across all seasons.\n`,
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
  if (failed > 0) {
    console.log(
      `⚠️  ${failed} athletes had no data — check their tfrrsId manually.`,
    );
  }
}

main().catch((err) => {
  console.error("Failed to fetch TFRRS stats:", err);
  process.exit(1);
});
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
import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";

// Direct imports so we can search within a specific season's roster.
// (UserContext still auto-discovers every file for the lookup-by-id step,
// but the search UI needs the raw athlete lists per season.)
const rosterModules = import.meta.glob("../data/distance_roster_*.json", {
  eager: true,
}) as Record<
  string,
  { season: number; athletes: { id: string; name: string }[] }
>;

function buildRostersBySeason() {
  const map: Record<number, { id: string; name: string }[]> = {};
  for (const mod of Object.values(rosterModules)) {
    if (mod.season && mod.athletes) map[mod.season] = mod.athletes;
  }
  return map;
}

const rostersBySeason = buildRostersBySeason();
const seasons = Object.keys(rostersBySeason)
  .map(Number)
  .sort((a, b) => b - a);

function IdentityLookup() {
  const { selectAthlete } = useUser();
  const [season, setSeason] = useState<number>(seasons[0]);
  const [query, setQuery] = useState("");

  const roster = rostersBySeason[season] || [];
  const matches =
    query.trim().length > 0
      ? roster.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
      : [];

  return (
    <div className="identity-lookup">
      <h1 className="identity-title acme-regular text-outline">Who are you?</h1>

      <select
        className="identity-year-select"
        value={season}
        onChange={(e) => {
          setSeason(Number(e.target.value));
          setQuery("");
        }}
      >
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s} Season
          </option>
        ))}
      </select>

      <input
        type="text"
        className="identity-input"
        placeholder="Start typing your name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {matches.length > 0 && (
        <ul className="identity-results">
          {matches.map((athlete) => (
            <li key={athlete.id}>
              <button
                className="identity-result-item"
                onClick={() => selectAthlete(athlete.id, season)}
              >
                {athlete.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && matches.length === 0 && (
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
  const { athlete } = useUser();
  const location = useLocation();

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
import { createContext, useContext, useState, type ReactNode } from "react";

interface Athlete {
  id: string;
  name: string;
  team: string;
  year: string;
  hometown: string;
  highSchool: string;
  profileUrl: string;
}

interface RosterFile {
  season: number;
  athletes: Athlete[];
}

interface UserContextValue {
  athleteId: string | null;
  season: number | null;
  athlete: Athlete | null;
  availableSeasons: number[];
  selectAthlete: (id: string, season: number) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const ID_KEY = "wxc_selected_athlete_id";
const SEASON_KEY = "wxc_selected_season";

// Eagerly loads every distance_roster_*.json file in src/data at build time.
const rosterModules = import.meta.glob("../data/distance_roster_*.json", {
  eager: true,
}) as Record<string, RosterFile>;

function parseSeasonFromPath(filePath: string): number | null {
  const match = filePath.match(/distance_roster_(\d{2})\.json$/);
  if (!match) return null;
  return 2000 + parseInt(match[1], 10);
}

const rostersBySeason: Record<number, Athlete[]> = {};
for (const [filePath, mod] of Object.entries(rosterModules)) {
  const season = mod.season ?? parseSeasonFromPath(filePath);
  if (season && mod.athletes) {
    rostersBySeason[season] = mod.athletes;
  }
}

const availableSeasons = Object.keys(rostersBySeason)
  .map(Number)
  .sort((a, b) => b - a); // newest first

function findAthlete(id: string | null, season: number | null): Athlete | null {
  if (!id || !season) return null;
  const roster = rostersBySeason[season];
  if (!roster) return null;
  return roster.find((a) => a.id === id) ?? null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(ID_KEY),
  );
  const [season, setSeasonState] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(SEASON_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

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
  }

  const athlete = findAthlete(athleteId, season);

  return (
    <UserContext.Provider
      value={{
        athleteId,
        season,
        athlete,
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

### `src/data/distance_roster_17.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_18.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_19.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_20.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_21.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_22.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_23.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_24.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_25.json`

_(binary or excluded — contents not inlined)_

### `src/data/distance_roster_26.json`

_(binary or excluded — contents not inlined)_

### `src/data/roster_history.json`

_(binary or excluded — contents not inlined)_

### `src/data/tfrrs_stats.json`

_(binary or excluded — contents not inlined)_

### `src/lib/adminData.ts`

```typescript
import { supabase } from "./supabaseClient";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
} from "./pdfParser";

export async function upsertMileageRows(rows: MileageRow[], weekOf: string) {
  // Defensive dedupe: if two parsed rows somehow share a name, keep the last
  // one rather than sending Postgres a batch with a duplicate conflict key,
  // which raises "ON CONFLICT DO UPDATE command cannot affect row a second time."
  const dedupedByName = new Map<string, MileageRow>();
  for (const row of rows) {
    dedupedByName.set(row.name, row);
  }
  const deduped = Array.from(dedupedByName.values());

  const payload = deduped.map((r) => ({
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
    .upsert(payload, { onConflict: "athlete_name,week_of", count: "exact" });

  if (error) throw new Error(error.message);
  return count ?? payload.length;
}

export async function upsertWorkoutData(
  assignments: WorkoutAssignment[],
  groupDefinitions: WorkoutGroupDefinition[],
  weekOf: string,
  day: "tuesday" | "friday",
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

  // Same defensive dedupe as mileage — protects against duplicate
  // (athlete_name, week_of, day) keys in a single batch.
  const dedupedByName = new Map<string, WorkoutAssignment>();
  for (const a of assignments) {
    dedupedByName.set(a.name, a);
  }
  const dedupedAssignments = Array.from(dedupedByName.values());

  const assignmentPayload = dedupedAssignments.map((a) => ({
    athlete_name: a.name,
    week_of: weekOf,
    day,
    group_letter: a.groupLetter,
  }));

  const { error: assignError, count } = await supabase
    .from("workout_assignments")
    .upsert(assignmentPayload, {
      onConflict: "athlete_name,week_of,day",
      count: "exact",
    });

  if (assignError) throw new Error(assignError.message);
  return count ?? assignmentPayload.length;
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
  athleteName: string,
): Promise<MileageEntry[]> {
  const { data, error } = await supabase
    .from("mileage_entries")
    .select(
      "week_of, monday, tuesday, wednesday, thursday, friday, saturday, sunday, weekly_total, notes",
    )
    .eq("athlete_name", athleteName)
    .order("week_of", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
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
  top: number; // distance from top of page — smaller = higher up
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
}

export interface WorkoutGroupDefinition {
  groupLetter: string;
  description: string;
}

export interface ParsedWorkouts {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
}

const ROW_TOLERANCE = 10; // px — words within this vertical distance are "the same row"

// ---------- Core: extract positioned words from a PDF page ----------

async function extractPageWords(
  page: pdfjsLib.PDFPageProxy,
): Promise<PositionedWord[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  return content.items
    .filter(
      (item): item is pdfjsLib.TextItem =>
        "str" in item && item.str.trim().length > 0,
    )
    .map((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      // pdfjs y is measured from the BOTTOM of the page — flip so smaller = higher,
      // matching the "top" convention used throughout this parser.
      const top = viewport.height - y;
      return { text: item.str.trim(), x, top };
    });
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

  // Sort words left-to-right within each row
  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  return rows;
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
    if (!anchors) continue; // page has no roster table (e.g. a legend/notes-only page)

    const nameColumnMaxX = Math.min(...anchors.map((a) => a.x)) - 20;

    for (const row of rows) {
      // Skip the header row itself
      if (row.some((w) => w.text === "Mon")) continue;

      const rawNameWords = row.filter((w) => w.x < nameColumnMaxX);

      // Drop stray single-character marker tokens (1, 2, 4, L, *) that sit in
      // the unlabeled marker column between Name and FMS — these aren't part
      // of anyone's actual name, they're coaching shorthand we're ignoring.
      const nameWords = rawNameWords.filter((w) => !/^[0-9A-Z*]$/.test(w.text));

      if (nameWords.length === 0) continue; // this "row" was just a lone marker

      const name = nameWords
        .map((w) => w.text)
        .join(" ")
        .replace(/,$/, "");
      const [last, first] = name.split(",").map((s) => s.trim());
      const displayName = first ? `${first} ${last}` : name;

      // Anything that still doesn't look like a real "First Last" name — skip it
      if (!first || displayName.length < 3) continue;

      const dataWords = row.filter((w) => w.x >= nameColumnMaxX);
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

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);

    const groupHeaderWord = words.find((w) => w.text === "G");
    if (!groupHeaderWord) continue; // not a roster/group page

    const groupColumnX = groupHeaderWord.x;
    const nameColumnMaxX = groupColumnX - 200; // names sit far left; dot-columns fill the middle
    const descriptionMinX = groupColumnX + 15; // description text sits just right of the letter

    const rows = clusterIntoRows(words);

    for (const row of rows) {
      const nameWords = row.filter((w) => w.x < nameColumnMaxX);
      const groupWord = row.find(
        (w) => Math.abs(w.x - groupColumnX) < 10 && /^[A-Z]{1,2}$/.test(w.text),
      );

      if (nameWords.length > 0 && groupWord) {
        const rawName = nameWords
          .map((w) => w.text)
          .join(" ")
          .replace(/,$/, "");
        const [last, first] = rawName.split(",").map((s) => s.trim());
        const displayName = first ? `${first} ${last}` : rawName;

        assignments.push({ name: displayName, groupLetter: groupWord.text });
      }
    }

    // Reconstruct group definitions from the description text block,
    // read in top-to-bottom, left-to-right order, then split on "X:" labels.
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
  }

  const groupDefinitions: WorkoutGroupDefinition[] = Array.from(
    definitionsByLetter.entries(),
  ).map(([groupLetter, description]) => ({ groupLetter, description }));

  return { assignments, groupDefinitions };
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
}

export async function fetchWorkoutsForAthlete(
  athleteName: string,
): Promise<WorkoutForDay[]> {
  const { data: assignments, error: assignError } = await supabase
    .from("workout_assignments")
    .select("week_of, day, group_letter")
    .eq("athlete_name", athleteName)
    .order("week_of", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Fetch every group definition for the specific (week, day) pairs this
  // athlete has assignments for, then join them together client-side.
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
  }));
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
import { useState } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";
import { parseMileagePdf, parseWorkoutsPdf } from "../lib/pdfParser";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
} from "../lib/pdfParser";
import { upsertMileageRows, upsertWorkoutData } from "../lib/adminData";

type Mode = "mileage" | "workouts";

function AdminDashboard() {
  const { signOut } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("mileage");
  const [weekOf, setWeekOf] = useState("");
  const [day, setDay] = useState<"tuesday" | "friday">("tuesday");

  const [mileageRows, setMileageRows] = useState<MileageRow[] | null>(null);
  const [workoutData, setWorkoutData] = useState<{
    assignments: WorkoutAssignment[];
    groupDefinitions: WorkoutGroupDefinition[];
  } | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus(null);
    setBusy(true);
    try {
      if (mode === "mileage") {
        const rows = await parseMileagePdf(file);
        setMileageRows(rows);
        setWorkoutData(null);
      } else {
        const data = await parseWorkoutsPdf(file);
        setWorkoutData(data);
        setMileageRows(null);
      }
    } catch (err) {
      setStatus(`Failed to parse PDF: ${(err as Error).message}`);
    } finally {
      setBusy(false);
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
      if (mode === "mileage" && mileageRows) {
        const count = await upsertMileageRows(mileageRows, weekOf);
        setStatus(`✅ Saved ${count} mileage rows for week of ${weekOf}.`);
      } else if (mode === "workouts" && workoutData) {
        const count = await upsertWorkoutData(
          workoutData.assignments,
          workoutData.groupDefinitions,
          weekOf,
          day,
        );
        setStatus(
          `✅ Saved ${count} workout assignments for ${day}, week of ${weekOf}.`,
        );
      }
    } catch (err) {
      setStatus(`❌ Failed to save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-title acme-regular text-outline">Admin Dashboard</h1>

      <div className="admin-mode-toggle">
        <button
          className={mode === "mileage" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("mileage");
            setMileageRows(null);
            setWorkoutData(null);
            setStatus(null);
          }}
        >
          Mileage
        </button>
        <button
          className={mode === "workouts" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("workouts");
            setMileageRows(null);
            setWorkoutData(null);
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
          disabled={busy}
        />
      </div>

      {busy && <p className="admin-status">Working...</p>}
      {status && <p className="admin-status">{status}</p>}

      {mode === "mileage" && mileageRows && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {mileageRows.length} athletes parsed — review before saving:
          </p>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Mon</th>
                  <th>Tue</th>
                  <th>Wed</th>
                  <th>Thu</th>
                  <th>Fri</th>
                  <th>Sat</th>
                  <th>Sun</th>
                  <th>Total</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {mileageRows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.team === "womens-cross-country" ? "W" : "M"}</td>
                    <td>{r.monday}</td>
                    <td>{r.tuesday}</td>
                    <td>{r.wednesday}</td>
                    <td>{r.thursday}</td>
                    <td>{r.friday}</td>
                    <td>{r.saturday}</td>
                    <td>{r.sunday}</td>
                    <td>{r.weeklyTotal}</td>
                    <td>{r.notes}</td>
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

      {mode === "workouts" && workoutData && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {workoutData.assignments.length} athletes,{" "}
            {workoutData.groupDefinitions.length} group definitions parsed —
            review before saving:
          </p>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {workoutData.groupDefinitions.map((g) => (
                  <tr key={g.groupLetter}>
                    <td>{g.groupLetter}</td>
                    <td>{g.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Group</th>
                </tr>
              </thead>
              <tbody>
                {workoutData.assignments.map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td>{a.groupLetter}</td>
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

export default AdminDashboard;
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
function CorePage() {
  return (
    <div>
      {" "}
      <h1> Core </h1>
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

### `src/pages/fms.tsx`

```tsx
function FMS() {
  return (
    <div>
      <h1>FMS</h1>
    </div>
  );
}
export default FMS;
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
  { label: "View Core", path: "/core" },
  { label: "View FMS", path: "/fms" },
  { label: "View Lifting Sheet", path: "/lifting_sheet" },
  { label: "View Workouts", path: "/workouts" },
];

const statsLinks = [
  { label: "View TFRRS Stats", path: "/tfrrs-stats" },
  { label: "View Personal Records", path: "/personal-records" },
  { label: "View Season Bests", path: "/season-bests" },
];

function Home() {
  const { athlete } = useUser();

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
  const { athlete } = useUser();
  const [entries, setEntries] = useState<MileageEntry[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete) return;

    let cancelled = false;
    setEntries(null);
    setError(null);

    fetchMileageForAthlete(athlete.name)
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
  }, [athlete]);

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
import { fetchWorkoutsForAthlete } from "../lib/workoutData";
import type { WorkoutForDay } from "../lib/workoutData";

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

// Groups a flat list of (week, day, group) rows into one entry per week,
// each holding its Tuesday/Friday workouts together.
function groupByWeek(rows: WorkoutForDay[]) {
  const weeks = new Map<string, WorkoutForDay[]>();
  for (const row of rows) {
    const existing = weeks.get(row.weekOf) ?? [];
    existing.push(row);
    weeks.set(row.weekOf, existing);
  }
  return Array.from(weeks.entries())
    .map(([weekOf, days]) => ({
      weekOf,
      days: days.sort((a, b) => a.day.localeCompare(b.day)),
    }))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
}

function Workouts() {
  const { athlete } = useUser();
  const [rows, setRows] = useState<WorkoutForDay[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete) return;

    let cancelled = false;
    setRows(null);
    setError(null);

    fetchWorkoutsForAthlete(athlete.name)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setSelectedWeek(data.length > 0 ? data[0].weekOf : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete]);

  if (!athlete) return null;

  const weeks = rows ? groupByWeek(rows) : [];
  const currentWeek = weeks.find((w) => w.weekOf === selectedWeek) ?? null;

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

      {!error && rows === null && (
        <p className="workouts-no-data acme-regular text-outline">Loading...</p>
      )}

      {!error && rows !== null && rows.length === 0 && (
        <p className="workouts-no-data acme-regular text-outline">
          No workouts have been assigned to you yet — check back once this
          week's sheet is in!
        </p>
      )}

      {!error && weeks.length > 0 && (
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
                    <span className="workouts-group-badge">
                      Group {d.groupLetter}
                    </span>
                  </div>
                  <p className="workouts-description">
                    {d.description ??
                      "No workout description found for this group."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Workouts;
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
              <ComingSoon />
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
              <ComingSoon />
            </RequireIdentity>
          }
        />
        <Route
          path="/lifting_sheet"
          element={
            <RequireIdentity>
              <ComingSoon />
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
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
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
]);
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

````markdown
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
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
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
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
````

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

````

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

````

### `tsconfig.app.json`

_(binary or excluded — contents not inlined)_

### `tsconfig.json`

_(binary or excluded — contents not inlined)_

### `tsconfig.node.json`

_(binary or excluded — contents not inlined)_

### `vite.config.ts`

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
});
```

---

_Digest complete: 44 files inlined, 27 skipped (binary/excluded)._
