# Repository Digest

Generated: 2026-09-13T03:28:45.278Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── mileageSheets/
│   ├── XC 2026 Mileage 9-7.pdf
│   └── XC 2026 Workouts 9-11.pdf
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
│   │   ├── requireIdentity.tsx
│   │   └── switchIdentity.tsx
│   ├── context/
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
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── corePage.tsx
│   │   ├── error.tsx
│   │   ├── fms.tsx
│   │   ├── home.tsx
│   │   ├── liftingSheet.tsx
│   │   ├── mileagePage.tsx
│   │   ├── name_lookup.tsx
│   │   ├── tfrrsStats.tsx
│   │   └── tuesdayWorkout.tsx
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

```json
{
  "generatedAt": "2026-09-13T02:47:02.303Z",
  "season": 2017,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2017",
    "https://go-knights.net/sports/womens-cross-country/roster/2017"
  ],
  "athletes": [
    {
      "id": "6480",
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/6480",
      "tfrrsId": "6592806"
    },
    {
      "id": "6469",
      "name": "Caleb Appleton",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bemidji, Minn.",
      "highSchool": "Bemidji",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/6469",
      "tfrrsId": "6139222"
    },
    {
      "id": "6470",
      "name": "Mitch Black",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Waterloo West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/mitch-black/6470",
      "tfrrsId": "4989898"
    },
    {
      "id": "6481",
      "name": "Christian Brothers",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Nevarre, Fla.",
      "highSchool": "Nevarre",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christian-brothers/6481",
      "tfrrsId": "6592810"
    },
    {
      "id": "6471",
      "name": "Ben Coleman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "St. Louis Park, Minn.",
      "highSchool": "St. Louis Park",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-coleman/6471",
      "tfrrsId": "5146929"
    },
    {
      "id": "6482",
      "name": "Liam Conroy",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/liam-conroy/6482",
      "tfrrsId": "6592811"
    },
    {
      "id": "6483",
      "name": "Ryan Dalton",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "South Brunswick",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-dalton/6483",
      "tfrrsId": "6592812"
    },
    {
      "id": "6486",
      "name": "Matt Egts",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bloomington, Ill.",
      "highSchool": "Normal Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-egts/6486",
      "tfrrsId": "6592814"
    },
    {
      "id": "6487",
      "name": "Joe Freiburger",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Holy Cross, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-freiburger/6487",
      "tfrrsId": "6592815"
    },
    {
      "id": "6488",
      "name": "Jon Fuentes",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Barrington, Ill.",
      "highSchool": "Barrington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jon-fuentes/6488",
      "tfrrsId": "6139227"
    },
    {
      "id": "6489",
      "name": "Matt Heinzman",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Royal Oak, Mich.",
      "highSchool": "Bishop Foley Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-heinzman/6489",
      "tfrrsId": "6592819"
    },
    {
      "id": "6490",
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/6490",
      "tfrrsId": "6592820"
    },
    {
      "id": "6473",
      "name": "Karl Jaeschke",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Pleasant Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/karl-jaeschke/6473",
      "tfrrsId": "5873589"
    },
    {
      "id": "6474",
      "name": "Eli Kaczinski",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Charlotte, Iowa",
      "highSchool": "Northeast-Goose Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-kaczinski/6474",
      "tfrrsId": "5146940"
    },
    {
      "id": "6491",
      "name": "Frosty Lorimer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Springville, Iowa",
      "highSchool": "Springville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/frosty-lorimer/6491",
      "tfrrsId": "6592823"
    },
    {
      "id": "6492",
      "name": "Sam Madson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Omaha, Neb.",
      "highSchool": "Westside High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-madson/6492",
      "tfrrsId": "6592826"
    },
    {
      "id": "6493",
      "name": "Curren Matthias",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/6493",
      "tfrrsId": "6592827"
    },
    {
      "id": "6495",
      "name": "Jay Mixdorf",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jay-mixdorf/6495",
      "tfrrsId": "7043061"
    },
    {
      "id": "6476",
      "name": "Aaron O'Leary",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Waterloo West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-o-leary/6476",
      "tfrrsId": "5146950"
    },
    {
      "id": "6496",
      "name": "Sam Pinkowski",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "La Crosse Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-pinkowski/6496",
      "tfrrsId": "6592831"
    },
    {
      "id": "6477",
      "name": "Casey Roberts",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Saydel",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/casey-roberts/6477",
      "tfrrsId": "5600665"
    },
    {
      "id": "6497",
      "name": "Zac Sapiot",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Yokosuka, Japan",
      "highSchool": "Nile C Kinnick High School",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/zac-sapiot/6497",
      "tfrrsId": "6426438"
    },
    {
      "id": "6478",
      "name": "Conor Sapp",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/6478",
      "tfrrsId": "6139240"
    },
    {
      "id": "6498",
      "name": "Matthew Schneider",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matthew-schneider/6498",
      "tfrrsId": "6426439"
    },
    {
      "id": "6479",
      "name": "Joel Toppin",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Clear Lake, Iowa",
      "highSchool": "Garner Hayfield",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joel-toppin/6479",
      "tfrrsId": "5146959"
    },
    {
      "id": "6500",
      "name": "Spencer Warehime",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Gowrie, Iowa",
      "highSchool": "Southeast Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/spencer-warehime/6500",
      "tfrrsId": "6592835"
    },
    {
      "id": "6501",
      "name": "Noah Worthington",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/noah-worthington/6501",
      "tfrrsId": "6592836"
    },
    {
      "id": "6502",
      "name": "Jordan Yessak",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Vinton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jordan-yessak/6502",
      "tfrrsId": "6592838"
    },
    {
      "id": "6461",
      "name": "Janelle Baeskens",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Upland, Calif.",
      "highSchool": "Claremont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janelle-baeskens/6461",
      "tfrrsId": "6592715"
    },
    {
      "id": "6443",
      "name": "Ashlyn Bagge",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Independence, Iowa",
      "highSchool": "Independence",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashlyn-bagge/6443",
      "tfrrsId": "6139110"
    },
    {
      "id": "6444",
      "name": "Nicole Breitbach",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "North Buena Vista, Iowa",
      "highSchool": "Clayton Ridge",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nicole-breitbach/6444",
      "tfrrsId": "5600619"
    },
    {
      "id": "6445",
      "name": "Maddie Carlsen",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Rice Lake, Wis.",
      "highSchool": "Rice Lake",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maddie-carlsen/6445",
      "tfrrsId": "5146966"
    },
    {
      "id": "6462",
      "name": "Cassidy Christopher",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/6462",
      "tfrrsId": "6592717"
    },
    {
      "id": "6464",
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/6464",
      "tfrrsId": "6592718"
    },
    {
      "id": "6463",
      "name": "Clare Davison",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/6463",
      "tfrrsId": "6592719"
    },
    {
      "id": "6446",
      "name": "Jackie Falconer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Coggon, Iowa",
      "highSchool": "North Linn",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jackie-falconer/6446",
      "tfrrsId": "5982721"
    },
    {
      "id": "6447",
      "name": "Miranda Fober",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/miranda-fober/6447",
      "tfrrsId": "5146969"
    },
    {
      "id": "6448",
      "name": "Natalie Fober",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-fober/6448",
      "tfrrsId": "6139117"
    },
    {
      "id": "6466",
      "name": "Jacque Garza",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Grayslake, Ill.",
      "highSchool": "Grayslake North",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jacque-garza/6466",
      "tfrrsId": "6592724"
    },
    {
      "id": "6468",
      "name": "Gabi Gonzalez",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Wills Point, Texas",
      "highSchool": "Wills Point",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/gabi-gonzalez/6468",
      "tfrrsId": "6426421"
    },
    {
      "id": "6449",
      "name": "Haley  Harms",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Albert Lea, Minn.",
      "highSchool": "Albert Lea",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-harms/6449",
      "tfrrsId": "5600620"
    },
    {
      "id": "6450",
      "name": "Kylie Kelchen",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cascade, Iowa",
      "highSchool": "Cascade",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kylie-kelchen/6450",
      "tfrrsId": "6139134"
    },
    {
      "id": "6451",
      "name": "Maddie Kemp",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maddie-kemp/6451",
      "tfrrsId": "5146976"
    },
    {
      "id": "6452",
      "name": "Parry Larson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Cologne, Minn.",
      "highSchool": "Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/parry-larson/6452",
      "tfrrsId": "6139135"
    },
    {
      "id": "6453",
      "name": "Beth Mallon",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport Assumption",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/beth-mallon/6453",
      "tfrrsId": "5146993"
    },
    {
      "id": "6454",
      "name": "Gabrielle Marchino",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Highlands Ranch, Colo.",
      "highSchool": "Valor Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/gabrielle-marchino/6454",
      "tfrrsId": "4989878"
    },
    {
      "id": "6455",
      "name": "Shaelyn McEnany",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Independence, Iowa",
      "highSchool": "Independence",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-mcenany/6455",
      "tfrrsId": "5600621"
    },
    {
      "id": "6456",
      "name": "Abigail Mokhtary",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "St. Stephen",
      "highSchool": "Holdingford",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abigail-mokhtary/6456"
    },
    {
      "id": "6467",
      "name": "Aryka Parsons",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aryka-parsons/6467",
      "tfrrsId": "6426422"
    },
    {
      "id": "6457",
      "name": "Alison  Rusch",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Wahlert",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alison-rusch/6457",
      "tfrrsId": "5600622"
    },
    {
      "id": "6458",
      "name": "Meghan Silbernagel",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Madison, Wis.",
      "highSchool": "Madison Memorial",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/meghan-silbernagel/6458",
      "tfrrsId": "5146998"
    },
    {
      "id": "6459",
      "name": "Ashley Stevens",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Windsor Heights, Iowa",
      "highSchool": "Des Moines Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-stevens/6459",
      "tfrrsId": "5600623"
    }
  ]
}
```

### `src/data/distance_roster_18.json`

```json
{
  "generatedAt": "2026-09-13T02:47:04.074Z",
  "season": 2018,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2018",
    "https://go-knights.net/sports/womens-cross-country/roster/2018"
  ],
  "athletes": [
    {
      "id": "7257",
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/7257",
      "tfrrsId": "6592806"
    },
    {
      "id": "7258",
      "name": "Caleb Appleton",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Bemidji, Minn.",
      "highSchool": "Bemidji",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/7258",
      "tfrrsId": "6139222"
    },
    {
      "id": "7321",
      "name": "Patrick Breitsprecher",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Dayton, Iowa",
      "highSchool": "Southeast Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/patrick-breitsprecher/7321",
      "tfrrsId": "6915234"
    },
    {
      "id": "7322",
      "name": "Callum Brittain",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "White River Junction, Ver.",
      "highSchool": "Hartford",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/7322",
      "tfrrsId": "7043032"
    },
    {
      "id": "7259",
      "name": "Christian Brothers",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Nevarre, Fla.",
      "highSchool": "Nevarre",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christian-brothers/7259",
      "tfrrsId": "6592810"
    },
    {
      "id": "7260",
      "name": "Liam Conroy",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/liam-conroy/7260",
      "tfrrsId": "6592811"
    },
    {
      "id": "7261",
      "name": "Ryan Dalton",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Clinton, Iowa",
      "highSchool": "South Brunswick",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-dalton/7261",
      "tfrrsId": "6592812"
    },
    {
      "id": "7323",
      "name": "Collin Day",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/7323",
      "tfrrsId": "6592813"
    },
    {
      "id": "7262",
      "name": "Matt Egts",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bloomington, Ill.",
      "highSchool": "Normal Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-egts/7262",
      "tfrrsId": "6592814"
    },
    {
      "id": "7324",
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/7324",
      "tfrrsId": "7043035"
    },
    {
      "id": "7263",
      "name": "Joe Freiburger",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Holy Cross, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-freiburger/7263",
      "tfrrsId": "6592815"
    },
    {
      "id": "7264",
      "name": "Jon Fuentes",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Barrington, Ill.",
      "highSchool": "Barrington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jon-fuentes/7264",
      "tfrrsId": "6139227"
    },
    {
      "id": "7325",
      "name": "Eli Hedden",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Madison, Wis.",
      "highSchool": "Madison Memorial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-hedden/7325",
      "tfrrsId": "7043037"
    },
    {
      "id": "7265",
      "name": "Matt Heinzman",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Royal Oak, Mich.",
      "highSchool": "Bishop Foley Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-heinzman/7265",
      "tfrrsId": "6592819"
    },
    {
      "id": "7266",
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/7266",
      "tfrrsId": "6592820"
    },
    {
      "id": "7327",
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/7327",
      "tfrrsId": "7043039"
    },
    {
      "id": "7328",
      "name": "Greyson Kincaid",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/greyson-kincaid/7328",
      "tfrrsId": "7043058"
    },
    {
      "id": "7267",
      "name": "Frosty Lorimer",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Springville, Iowa",
      "highSchool": "Springville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/frosty-lorimer/7267",
      "tfrrsId": "6592823"
    },
    {
      "id": "7268",
      "name": "Sam Madson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Omaha, Neb.",
      "highSchool": "Westside High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-madson/7268",
      "tfrrsId": "6592826"
    },
    {
      "id": "7330",
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/7330",
      "tfrrsId": "7043060"
    },
    {
      "id": "7269",
      "name": "Curren Matthias",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/7269",
      "tfrrsId": "6592827"
    },
    {
      "id": "7270",
      "name": "Jay Mixdorf",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jay-mixdorf/7270",
      "tfrrsId": "7043061"
    },
    {
      "id": "7271",
      "name": "Sam Pinkowski",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "La Crosse Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-pinkowski/7271",
      "tfrrsId": "6592831"
    },
    {
      "id": "7272",
      "name": "Casey Roberts",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Saydel",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/casey-roberts/7272",
      "tfrrsId": "5600665"
    },
    {
      "id": "7273",
      "name": "Conor Sapp",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/7273",
      "tfrrsId": "6139240"
    },
    {
      "id": "7274",
      "name": "Matthew Schneider",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matthew-schneider/7274",
      "tfrrsId": "6426439"
    },
    {
      "id": "7331",
      "name": "Mark Schulz",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/mark-schulz/7331",
      "tfrrsId": "6915233"
    },
    {
      "id": "7326",
      "name": "Morgan Shirley-Fairbairn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bismarck, N.D.",
      "highSchool": "Bismarck",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/morgan-shirley-fairbairn/7326",
      "tfrrsId": "7043077"
    },
    {
      "id": "7275",
      "name": "Spencer Warehime",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Gowrie, Iowa",
      "highSchool": "Southeast Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/spencer-warehime/7275",
      "tfrrsId": "6592835"
    },
    {
      "id": "7276",
      "name": "Noah Worthington",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/noah-worthington/7276",
      "tfrrsId": "6592836"
    },
    {
      "id": "7277",
      "name": "Jordan Yessak",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Vinton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jordan-yessak/7277",
      "tfrrsId": "6592838"
    },
    {
      "id": "7333",
      "name": "Brandi Antonio",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Deerfield Beach, Fla.",
      "highSchool": "Pope John Paul II",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/7333",
      "tfrrsId": "7042947"
    },
    {
      "id": "7243",
      "name": "Janelle Baeskens",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Upland, Calif.",
      "highSchool": "Claremont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janelle-baeskens/7243",
      "tfrrsId": "6592715"
    },
    {
      "id": "7334",
      "name": "Trinity Borland",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/trinity-borland/7334",
      "tfrrsId": "7042949"
    },
    {
      "id": "7344",
      "name": "Bri Bower",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Montgomery, Ill.",
      "highSchool": "Mapke Park-Kaneland",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bri-bower/7344",
      "tfrrsId": "6915217"
    },
    {
      "id": "7244",
      "name": "Nicole Breitbach",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "North Buena Vista, Iowa",
      "highSchool": "Clayton Ridge",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nicole-breitbach/7244",
      "tfrrsId": "5600619"
    },
    {
      "id": "7335",
      "name": "Alex Childs",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Fremont, Calif.",
      "highSchool": "James Logan",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alex-childs/7335",
      "tfrrsId": "6915220"
    },
    {
      "id": "7245",
      "name": "Cassidy Christopher",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/7245",
      "tfrrsId": "6592717"
    },
    {
      "id": "7246",
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/7246",
      "tfrrsId": "6592718"
    },
    {
      "id": "7247",
      "name": "Clare Davison",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/7247",
      "tfrrsId": "6592719"
    },
    {
      "id": "7336",
      "name": "Gabi Erdelac-Newman",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Buckeye, Ariz.",
      "highSchool": "Wickenburg",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/gabi-erdelac-newman/7336",
      "tfrrsId": "7042955"
    },
    {
      "id": "7337",
      "name": "Tessa Fields",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Lowden, Iowa",
      "highSchool": "North Cedar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/tessa-fields/7337",
      "tfrrsId": "7042974"
    },
    {
      "id": "7249",
      "name": "Natalie Fober",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-fober/7249",
      "tfrrsId": "6139117"
    },
    {
      "id": "7250",
      "name": "Jacque Garza",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Grayslake, Ill.",
      "highSchool": "Grayslake North",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jacque-garza/7250",
      "tfrrsId": "6592724"
    },
    {
      "id": "7252",
      "name": "Haley  Harms",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Albert Lea, Minn.",
      "highSchool": "Albert Lea",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-harms/7252",
      "tfrrsId": "5600620"
    },
    {
      "id": "7338",
      "name": "Anna Hertz",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/7338",
      "tfrrsId": "7042976"
    },
    {
      "id": "7253",
      "name": "Kylie Kelchen",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Cascade, Iowa",
      "highSchool": "Cascade",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kylie-kelchen/7253",
      "tfrrsId": "6139134"
    },
    {
      "id": "7339",
      "name": "Riley Mayer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "Saint Edmond",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/riley-mayer/7339",
      "tfrrsId": "7042980"
    },
    {
      "id": "7254",
      "name": "Shaelyn McEnany",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Independence, Iowa",
      "highSchool": "Independence",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-mcenany/7254",
      "tfrrsId": "5600621"
    },
    {
      "id": "7340",
      "name": "Moriah Morter",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Muscatine, Iowa",
      "highSchool": "Muscatine",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/moriah-morter/7340",
      "tfrrsId": "7042982"
    },
    {
      "id": "7341",
      "name": "Alissa Neubauer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/7341",
      "tfrrsId": "6915225"
    },
    {
      "id": "7255",
      "name": "Alison  Rusch",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Wahlert",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alison-rusch/7255",
      "tfrrsId": "5600622"
    },
    {
      "id": "7342",
      "name": "Emma Sinnwell",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Nashua, Iowa",
      "highSchool": "Nashua-Plainfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emma-sinnwell/7342",
      "tfrrsId": "6915226"
    },
    {
      "id": "7343",
      "name": "Faith Soto",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Victorville, Calif.",
      "highSchool": "Riverside",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/faith-soto/7343",
      "tfrrsId": "7043022"
    },
    {
      "id": "7256",
      "name": "Ashley Stevens",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Windsor Heights, Iowa",
      "highSchool": "Des Moines Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-stevens/7256",
      "tfrrsId": "5600623"
    }
  ]
}
```

### `src/data/distance_roster_19.json`

```json
{
  "generatedAt": "2026-09-13T02:47:05.840Z",
  "season": 2019,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2019",
    "https://go-knights.net/sports/womens-cross-country/roster/2019"
  ],
  "athletes": [
    {
      "id": "8084",
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/8084",
      "tfrrsId": "6592806"
    },
    {
      "id": "8085",
      "name": "Caleb Appleton",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Bemidji, Minn.",
      "highSchool": "Bemidji",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/8085",
      "tfrrsId": "6139222"
    },
    {
      "id": "8087",
      "name": "Callum Brittain",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "White River Junction, Ver.",
      "highSchool": "Hartford",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/8087",
      "tfrrsId": "7043032"
    },
    {
      "id": "8119",
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/8119",
      "tfrrsId": "7370510"
    },
    {
      "id": "8089",
      "name": "Liam Conroy",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/liam-conroy/8089",
      "tfrrsId": "6592811"
    },
    {
      "id": "8090",
      "name": "Ryan Dalton",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "South Brunswick",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-dalton/8090",
      "tfrrsId": "6592812"
    },
    {
      "id": "8091",
      "name": "Collin Day",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/8091",
      "tfrrsId": "6592813"
    },
    {
      "id": "8092",
      "name": "Matt Egts",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Bloomington, Ill.",
      "highSchool": "Normal Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-egts/8092",
      "tfrrsId": "6592814"
    },
    {
      "id": "8093",
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/8093",
      "tfrrsId": "7043035"
    },
    {
      "id": "8094",
      "name": "Joe Freiburger",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Holy Cross, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-freiburger/8094",
      "tfrrsId": "6592815"
    },
    {
      "id": "8095",
      "name": "Jon Fuentes",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Barrington, Ill.",
      "highSchool": "Barrington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jon-fuentes/8095",
      "tfrrsId": "6139227"
    },
    {
      "id": "8097",
      "name": "Matt Heinzman",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Royal Oak, Mich.",
      "highSchool": "Bishop Foley Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-heinzman/8097",
      "tfrrsId": "6592819"
    },
    {
      "id": "8126",
      "name": "Nick Henry",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cheney, Wash.",
      "highSchool": "Medical Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nick-henry/8126",
      "tfrrsId": "7370512"
    },
    {
      "id": "8098",
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/8098",
      "tfrrsId": "6592820"
    },
    {
      "id": "8099",
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/8099",
      "tfrrsId": "7043039"
    },
    {
      "id": "8100",
      "name": "Greyson Kincaid",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/greyson-kincaid/8100",
      "tfrrsId": "7043058"
    },
    {
      "id": "8116",
      "name": "Alexander Lawrence",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Stewartville, Minn.",
      "highSchool": "Stewartville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alexander-lawrence/8116"
    },
    {
      "id": "8101",
      "name": "Frosty Lorimer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Springville, Iowa",
      "highSchool": "Springville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/frosty-lorimer/8101",
      "tfrrsId": "6592823"
    },
    {
      "id": "8102",
      "name": "Sam Madson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Omaha, Neb.",
      "highSchool": "Westside High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-madson/8102",
      "tfrrsId": "6592826"
    },
    {
      "id": "8103",
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/8103",
      "tfrrsId": "7043060"
    },
    {
      "id": "8127",
      "name": "Sean McDermott",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sean-mcdermott/8127",
      "tfrrsId": "7370516"
    },
    {
      "id": "8105",
      "name": "Jay Mixdorf",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jay-mixdorf/8105",
      "tfrrsId": "7043061"
    },
    {
      "id": "8106",
      "name": "Sam Pinkowski",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "La Crosse Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-pinkowski/8106",
      "tfrrsId": "6592831"
    },
    {
      "id": "8118",
      "name": "Brice Rhodes",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Herbert Hoover",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/8118",
      "tfrrsId": "7370517"
    },
    {
      "id": "8108",
      "name": "Conor Sapp",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/8108",
      "tfrrsId": "6139240"
    },
    {
      "id": "8115",
      "name": "Wyatt  Schmidt",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wyatt-schmidt/8115",
      "tfrrsId": "8659713"
    },
    {
      "id": "8125",
      "name": "Michael  Schmitz",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-schmitz/8125",
      "tfrrsId": "7370519"
    },
    {
      "id": "8111",
      "name": "Morgan Shirley-Fairbairn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bismarck, N.D.",
      "highSchool": "Bismarck",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/morgan-shirley-fairbairn/8111",
      "tfrrsId": "7043077"
    },
    {
      "id": "8124",
      "name": "Jacob VanderWilt",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-vanderwilt/8124",
      "tfrrsId": "7370522"
    },
    {
      "id": "8112",
      "name": "Spencer Warehime",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Gowrie, Iowa",
      "highSchool": "Southeast Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/spencer-warehime/8112",
      "tfrrsId": "6592835"
    },
    {
      "id": "8113",
      "name": "Noah Worthington",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/noah-worthington/8113",
      "tfrrsId": "6592836"
    },
    {
      "id": "8114",
      "name": "Jordan Yessak",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Vinton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jordan-yessak/8114",
      "tfrrsId": "6592838"
    },
    {
      "id": "8129",
      "name": "Brandi Antonio",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Deerfield Beach, Fla.",
      "highSchool": "Pope John Paul II",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/8129",
      "tfrrsId": "7042947"
    },
    {
      "id": "8130",
      "name": "Janelle Baeskens",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Upland, Calif.",
      "highSchool": "Claremont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janelle-baeskens/8130",
      "tfrrsId": "6592715"
    },
    {
      "id": "8162",
      "name": "Kaylie Barker",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kaylie-barker/8162",
      "tfrrsId": "7370462"
    },
    {
      "id": "8157",
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/8157",
      "tfrrsId": "7540843"
    },
    {
      "id": "8131",
      "name": "Trinity Borland",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/trinity-borland/8131",
      "tfrrsId": "7042949"
    },
    {
      "id": "8169",
      "name": "Victoria  Breitbach",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "North Buena Vista, Iowa",
      "highSchool": "Clayton Ridge",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/victoria-breitbach/8169",
      "tfrrsId": "7540844"
    },
    {
      "id": "8154",
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/8154",
      "tfrrsId": "7540845"
    },
    {
      "id": "8135",
      "name": "Cassidy Christopher",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/8135",
      "tfrrsId": "6592717"
    },
    {
      "id": "8136",
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/8136",
      "tfrrsId": "6592718"
    },
    {
      "id": "8137",
      "name": "Clare Davison",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/8137",
      "tfrrsId": "6592719"
    },
    {
      "id": "8168",
      "name": "Taylor Davison",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/taylor-davison/8168",
      "tfrrsId": "7370466"
    },
    {
      "id": "8153",
      "name": "Clare Dunne",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Coralville, Iowa",
      "highSchool": "Regina",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-dunne/8153",
      "tfrrsId": "7042954"
    },
    {
      "id": "8138",
      "name": "Gabi Erdelac-Newman",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Buckeye, Ariz.",
      "highSchool": "Wickenburg",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/gabi-erdelac-newman/8138",
      "tfrrsId": "7042955"
    },
    {
      "id": "8158",
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/8158",
      "tfrrsId": "7540848"
    },
    {
      "id": "8140",
      "name": "Natalie Fober",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-fober/8140",
      "tfrrsId": "6139117"
    },
    {
      "id": "8141",
      "name": "Jacque Garza",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Grayslake, Ill.",
      "highSchool": "Grayslake North",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jacque-garza/8141",
      "tfrrsId": "6592724"
    },
    {
      "id": "8159",
      "name": "Carlene Hamilton",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mesa, Ariz.",
      "highSchool": "Skyline",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/8159",
      "tfrrsId": "7540849"
    },
    {
      "id": "8383",
      "name": "Hidaly Hernandez",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Phoenix, Arz.",
      "highSchool": "Metro Tech",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hidaly-hernandez/8383",
      "tfrrsId": "7540850"
    },
    {
      "id": "8143",
      "name": "Anna Hertz",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/8143",
      "tfrrsId": "7042976"
    },
    {
      "id": "8144",
      "name": "Kylie Kelchen",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Cascade, Iowa",
      "highSchool": "Cascade",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kylie-kelchen/8144",
      "tfrrsId": "6139134"
    },
    {
      "id": "8155",
      "name": "AJ Kendrick",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aj-kendrick/8155",
      "tfrrsId": "7535281"
    },
    {
      "id": "8156",
      "name": "Allegra  Knudson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Manly, Iowa",
      "highSchool": "Central Springs",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/8156",
      "tfrrsId": "7540851"
    },
    {
      "id": "8145",
      "name": "Riley Mayer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "Saint Edmond",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/riley-mayer/8145",
      "tfrrsId": "7042980"
    },
    {
      "id": "8147",
      "name": "Moriah Morter",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Muscatine, Iowa",
      "highSchool": "Muscatine",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/moriah-morter/8147",
      "tfrrsId": "7042982"
    },
    {
      "id": "8148",
      "name": "Alissa Neubauer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/8148",
      "tfrrsId": "6915225"
    },
    {
      "id": "8160",
      "name": "Charlie Otto",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Hinsdale, Ill.",
      "highSchool": "Hinsdale Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/8160",
      "tfrrsId": "7730230"
    },
    {
      "id": "8164",
      "name": "Natalie  Paulson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-paulson/8164",
      "tfrrsId": "7540852"
    },
    {
      "id": "8161",
      "name": "Jane Pinkowski",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jane-pinkowski/8161",
      "tfrrsId": "7730233"
    },
    {
      "id": "8165",
      "name": "Nichole Segay",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Phoenix, Ariz.",
      "highSchool": "Camelback",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nichole-segay/8165",
      "tfrrsId": "7370477"
    },
    {
      "id": "8166",
      "name": "Olivia  Szymke",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Manchester, Iowa",
      "highSchool": "West Delaware",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/olivia-szymke/8166",
      "tfrrsId": "7370478"
    },
    {
      "id": "8163",
      "name": "Molly Vittetoe",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "West Liberty, Iowa",
      "highSchool": "Regina Jr Sr",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/molly-vittetoe/8163",
      "tfrrsId": "7370479"
    }
  ]
}
```

### `src/data/distance_roster_20.json`

```json
{
  "generatedAt": "2026-09-13T02:47:07.608Z",
  "season": 2020,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2020",
    "https://go-knights.net/sports/womens-cross-country/roster/2020"
  ],
  "athletes": [
    {
      "id": "8876",
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/8876",
      "tfrrsId": "6592806"
    },
    {
      "id": "8905",
      "name": "Ian Barry",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Fennimore, Wis.",
      "highSchool": "Fennimore",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ian-barry/8905",
      "tfrrsId": "7730278"
    },
    {
      "id": "8878",
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/8878",
      "tfrrsId": "7370510"
    },
    {
      "id": "8879",
      "name": "Liam Conroy",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/liam-conroy/8879",
      "tfrrsId": "6592811"
    },
    {
      "id": "8906",
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/8906",
      "tfrrsId": "7730328"
    },
    {
      "id": "8880",
      "name": "Ryan Dalton",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "South Brunswick",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-dalton/8880",
      "tfrrsId": "6592812"
    },
    {
      "id": "8919",
      "name": "Isaac Davis",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Waterloo West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaac-davis/8919",
      "tfrrsId": "7551012"
    },
    {
      "id": "8881",
      "name": "Collin Day",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/8881",
      "tfrrsId": "6592813"
    },
    {
      "id": "8882",
      "name": "Matt Egts",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Bloomington, Ill.",
      "highSchool": "Normal Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-egts/8882",
      "tfrrsId": "6592814"
    },
    {
      "id": "8883",
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/8883",
      "tfrrsId": "7043035"
    },
    {
      "id": "8884",
      "name": "Joe Freiburger",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Holy Cross, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-freiburger/8884",
      "tfrrsId": "6592815"
    },
    {
      "id": "8907",
      "name": "Jacob  Green",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-green/8907",
      "tfrrsId": "7730339"
    },
    {
      "id": "9006",
      "name": "Tryton Harper",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tryton-harper/9006",
      "tfrrsId": "7730343"
    },
    {
      "id": "8885",
      "name": "Matt Heinzman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Royal Oak, Mich.",
      "highSchool": "Bishop Foley Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-heinzman/8885",
      "tfrrsId": "6592819"
    },
    {
      "id": "8886",
      "name": "Nick Henry",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cheney, Wash.",
      "highSchool": "Medical Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nick-henry/8886",
      "tfrrsId": "7370512"
    },
    {
      "id": "9001",
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/9001",
      "tfrrsId": "6592820"
    },
    {
      "id": "8909",
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/8909",
      "tfrrsId": "7730348"
    },
    {
      "id": "8888",
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/8888",
      "tfrrsId": "7043039"
    },
    {
      "id": "8910",
      "name": "Jacob  Keay",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Treynor, Iowa",
      "highSchool": "Treynor Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-keay/8910",
      "tfrrsId": "7730350"
    },
    {
      "id": "8889",
      "name": "Greyson Kincaid",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/greyson-kincaid/8889",
      "tfrrsId": "7043058"
    },
    {
      "id": "8911",
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/8911",
      "tfrrsId": "7730351"
    },
    {
      "id": "8891",
      "name": "Frosty Lorimer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Springville, Iowa",
      "highSchool": "Springville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/frosty-lorimer/8891",
      "tfrrsId": "6592823"
    },
    {
      "id": "8892",
      "name": "Sam Madson",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Omaha, Neb.",
      "highSchool": "Westside High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-madson/8892",
      "tfrrsId": "6592826"
    },
    {
      "id": "8893",
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/8893",
      "tfrrsId": "7043060"
    },
    {
      "id": "9005",
      "name": "Curren Matthias",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/9005",
      "tfrrsId": "6592827"
    },
    {
      "id": "8912",
      "name": "Jack Meyers",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Pleasant Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-meyers/8912",
      "tfrrsId": "7730353"
    },
    {
      "id": "8913",
      "name": "Ryan  Neubauer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Praire",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-neubauer/8913",
      "tfrrsId": "7730357"
    },
    {
      "id": "8914",
      "name": "Benjamin Rhodes",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Silvis, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/benjamin-rhodes/8914",
      "tfrrsId": "7699569"
    },
    {
      "id": "8897",
      "name": "Brice Rhodes",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Herbert Hoover",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/8897",
      "tfrrsId": "7370517"
    },
    {
      "id": "8915",
      "name": "Gavin Roy",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-roy/8915",
      "tfrrsId": "7730364"
    },
    {
      "id": "8916",
      "name": "Carson Rygh",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Lake Mills, Iowa",
      "highSchool": "Lake Mills Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/8916",
      "tfrrsId": "7730365"
    },
    {
      "id": "8898",
      "name": "Wyatt  Schmidt",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wyatt-schmidt/8898",
      "tfrrsId": "8659713"
    },
    {
      "id": "8899",
      "name": "Michael  Schmitz",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-schmitz/8899",
      "tfrrsId": "7370519"
    },
    {
      "id": "9007",
      "name": "Sam Schmitz",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schmitz/9007",
      "tfrrsId": "7730366"
    },
    {
      "id": "9004",
      "name": "Matthew Schneider",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matthew-schneider/9004",
      "tfrrsId": "6426439"
    },
    {
      "id": "8900",
      "name": "Morgan Shirley-Fairbairn",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Bismarck, N.D.",
      "highSchool": "Bismarck",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/morgan-shirley-fairbairn/8900",
      "tfrrsId": "7043077"
    },
    {
      "id": "8901",
      "name": "Jacob VanderWilt",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-vanderwilt/8901",
      "tfrrsId": "7370522"
    },
    {
      "id": "8902",
      "name": "Spencer Warehime",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Gowrie, Iowa",
      "highSchool": "Southeast Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/spencer-warehime/8902",
      "tfrrsId": "6592835"
    },
    {
      "id": "8917",
      "name": "Logan Wisocki-Johnson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "East Moline, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/logan-wisocki-johnson/8917",
      "tfrrsId": "7730371"
    },
    {
      "id": "8918",
      "name": "Tim Wolf",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tim-wolf/8918",
      "tfrrsId": "7699574"
    },
    {
      "id": "8903",
      "name": "Noah Worthington",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/noah-worthington/8903",
      "tfrrsId": "6592836"
    },
    {
      "id": "8904",
      "name": "Jordan Yessak",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Vinton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jordan-yessak/8904",
      "tfrrsId": "6592838"
    },
    {
      "id": "8920",
      "name": "Brandi Antonio",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Deerfield Beach, Fla.",
      "highSchool": "Pope John Paul II",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/8920",
      "tfrrsId": "7042947"
    },
    {
      "id": "8921",
      "name": "Janelle Baeskens",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Upland, Calif.",
      "highSchool": "Claremont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janelle-baeskens/8921",
      "tfrrsId": "6592715"
    },
    {
      "id": "8923",
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/8923",
      "tfrrsId": "7540843"
    },
    {
      "id": "8924",
      "name": "Trinity Borland",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/trinity-borland/8924",
      "tfrrsId": "7042949"
    },
    {
      "id": "8925",
      "name": "Victoria  Breitbach",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "North Buena Vista, Iowa",
      "highSchool": "Clayton Ridge",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/victoria-breitbach/8925",
      "tfrrsId": "7540844"
    },
    {
      "id": "8950",
      "name": "Lexi Brown",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lexi-brown/8950",
      "tfrrsId": "7699550"
    },
    {
      "id": "8926",
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/8926",
      "tfrrsId": "7540845"
    },
    {
      "id": "9021",
      "name": "Cassidy Christopher",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/9021",
      "tfrrsId": "6592717"
    },
    {
      "id": "8928",
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/8928",
      "tfrrsId": "6592718"
    },
    {
      "id": "8952",
      "name": "Miricle Corbo",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/miricle-corbo/8952",
      "tfrrsId": "7730217"
    },
    {
      "id": "8929",
      "name": "Clare Davison",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/8929",
      "tfrrsId": "6592719"
    },
    {
      "id": "8931",
      "name": "Clare Dunne",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Coralville, Iowa",
      "highSchool": "Regina",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-dunne/8931",
      "tfrrsId": "7042954"
    },
    {
      "id": "8949",
      "name": "Maeve Dunne",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Coralville, Iowa",
      "highSchool": "Regina",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maeve-dunne/8949",
      "tfrrsId": "7699552"
    },
    {
      "id": "8953",
      "name": "Katelyn Eilders",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Robins, Iowa",
      "highSchool": "Linn Mar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/katelyn-eilders/8953",
      "tfrrsId": "7730219"
    },
    {
      "id": "8932",
      "name": "Gabi Erdelac-Newman",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Buckeye, Ariz.",
      "highSchool": "Wickenburg",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/gabi-erdelac-newman/8932",
      "tfrrsId": "7042955"
    },
    {
      "id": "8933",
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/8933",
      "tfrrsId": "7540848"
    },
    {
      "id": "8934",
      "name": "Jacque Garza",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Grayslake, Ill.",
      "highSchool": "Grayslake North",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jacque-garza/8934",
      "tfrrsId": "6592724"
    },
    {
      "id": "8954",
      "name": "Olivia Hamblin",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "John F. Kennedy",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/olivia-hamblin/8954",
      "tfrrsId": "7699554"
    },
    {
      "id": "8935",
      "name": "Carlene Hamilton",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Mesa, Ariz.",
      "highSchool": "Skyline",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/8935",
      "tfrrsId": "7540849"
    },
    {
      "id": "8936",
      "name": "Hidaly Hernandez",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Phoenix, Arz.",
      "highSchool": "Metro Tech",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hidaly-hernandez/8936",
      "tfrrsId": "7540850"
    },
    {
      "id": "8937",
      "name": "Anna Hertz",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/8937",
      "tfrrsId": "7042976"
    },
    {
      "id": "8955",
      "name": "Shaelyn Hostager",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-hostager/8955",
      "tfrrsId": "7730222"
    },
    {
      "id": "8938",
      "name": "AJ Kendrick",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aj-kendrick/8938",
      "tfrrsId": "7535281"
    },
    {
      "id": "8939",
      "name": "Allegra  Knudson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Manly, Iowa",
      "highSchool": "Central Springs",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/8939",
      "tfrrsId": "7540851"
    },
    {
      "id": "8956",
      "name": "Jenna Morey",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jenna-morey/8956",
      "tfrrsId": "7730228"
    },
    {
      "id": "8941",
      "name": "Moriah Morter",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Muscatine, Iowa",
      "highSchool": "Muscatine",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/moriah-morter/8941",
      "tfrrsId": "7042982"
    },
    {
      "id": "8942",
      "name": "Alissa Neubauer",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/8942",
      "tfrrsId": "6915225"
    },
    {
      "id": "8943",
      "name": "Charlie Otto",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Hinsdale, Ill.",
      "highSchool": "Hinsdale Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/8943",
      "tfrrsId": "7730230"
    },
    {
      "id": "8957",
      "name": "Ryleigh Parrack",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Papillion, Neb.",
      "highSchool": "Papillion-La Vista South",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ryleigh-parrack/8957",
      "tfrrsId": "7730231"
    },
    {
      "id": "8944",
      "name": "Natalie  Paulson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-paulson/8944",
      "tfrrsId": "7540852"
    },
    {
      "id": "8958",
      "name": "Erin Phelan",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Waukesha, Wis.",
      "highSchool": "Waukesha West",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/8958",
      "tfrrsId": "7740369"
    },
    {
      "id": "8945",
      "name": "Jane Pinkowski",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jane-pinkowski/8945",
      "tfrrsId": "7730233"
    }
  ]
}
```

### `src/data/distance_roster_21.json`

```json
{
  "generatedAt": "2026-09-13T02:47:09.464Z",
  "season": 2021,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2021",
    "https://go-knights.net/sports/womens-cross-country/roster/2021"
  ],
  "athletes": [
    {
      "id": "10860",
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/10860",
      "tfrrsId": "6592806"
    },
    {
      "id": "10900",
      "name": "Josh Arias",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Indio, Calif.",
      "highSchool": "Shadow Hills",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/josh-arias/10900",
      "tfrrsId": "7918357"
    },
    {
      "id": "10861",
      "name": "Ian Barry",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Fennimore, Wis.",
      "highSchool": "Fennimore",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ian-barry/10861",
      "tfrrsId": "7730278"
    },
    {
      "id": "10899",
      "name": "Luke Benson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/luke-benson/10899",
      "tfrrsId": "7918377"
    },
    {
      "id": "10896",
      "name": "Callum Brittain",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "White River Junction, Ver.",
      "highSchool": "Hartford",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/10896",
      "tfrrsId": "7043032"
    },
    {
      "id": "10901",
      "name": "Carson Collet",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-collet/10901",
      "tfrrsId": "7918359"
    },
    {
      "id": "10862",
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/10862",
      "tfrrsId": "7370510"
    },
    {
      "id": "10863",
      "name": "Liam Conroy",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/liam-conroy/10863",
      "tfrrsId": "6592811"
    },
    {
      "id": "10902",
      "name": "Bert Cortez",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Lone Tree, Iowa",
      "highSchool": "Lone Tree",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/10902",
      "tfrrsId": "7918360"
    },
    {
      "id": "10864",
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/10864",
      "tfrrsId": "7730328"
    },
    {
      "id": "10865",
      "name": "Isaac Davis",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Waterloo West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaac-davis/10865",
      "tfrrsId": "7551012"
    },
    {
      "id": "10866",
      "name": "Collin Day",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/10866",
      "tfrrsId": "6592813"
    },
    {
      "id": "10867",
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/10867",
      "tfrrsId": "7043035"
    },
    {
      "id": "10868",
      "name": "Joe Freiburger",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Holy Cross, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-freiburger/10868",
      "tfrrsId": "6592815"
    },
    {
      "id": "10903",
      "name": "Michael Goodenbour",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-goodenbour/10903",
      "tfrrsId": "7918361"
    },
    {
      "id": "10869",
      "name": "Jacob  Green",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-green/10869",
      "tfrrsId": "7730339"
    },
    {
      "id": "10905",
      "name": "Colin Greenwell",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/10905",
      "tfrrsId": "7918365"
    },
    {
      "id": "10870",
      "name": "Tryton Harper",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tryton-harper/10870",
      "tfrrsId": "7730343"
    },
    {
      "id": "10906",
      "name": "Joe Hasken",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Miles, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-hasken/10906",
      "tfrrsId": "8017690"
    },
    {
      "id": "10871",
      "name": "Matt Heinzman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Royal Oak, Mich.",
      "highSchool": "Bishop Foley Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/matt-heinzman/10871",
      "tfrrsId": "6592819"
    },
    {
      "id": "10872",
      "name": "Nick Henry",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cheney, Wash.",
      "highSchool": "Medical Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nick-henry/10872",
      "tfrrsId": "7370512"
    },
    {
      "id": "10873",
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/10873",
      "tfrrsId": "6592820"
    },
    {
      "id": "10907",
      "name": "Paul Hoopes",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Letts, Iowa",
      "highSchool": "Louisa Muscatine",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/paul-hoopes/10907",
      "tfrrsId": "7918366"
    },
    {
      "id": "10874",
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/10874",
      "tfrrsId": "7730348"
    },
    {
      "id": "10908",
      "name": "Jon Hutton",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jon-hutton/10908",
      "tfrrsId": "7918367"
    },
    {
      "id": "10875",
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/10875",
      "tfrrsId": "7043039"
    },
    {
      "id": "10876",
      "name": "Jacob  Keay",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Treynor, Iowa",
      "highSchool": "Treynor Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-keay/10876",
      "tfrrsId": "7730350"
    },
    {
      "id": "10877",
      "name": "Greyson Kincaid",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/greyson-kincaid/10877",
      "tfrrsId": "7043058"
    },
    {
      "id": "10914",
      "name": "Jack Kinzer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-kinzer/10914",
      "tfrrsId": "7918369"
    },
    {
      "id": "10915",
      "name": "Nathaniel Knutson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln-Way West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathaniel-knutson/10915",
      "tfrrsId": "7918371"
    },
    {
      "id": "10878",
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/10878",
      "tfrrsId": "7730351"
    },
    {
      "id": "10879",
      "name": "Frosty Lorimer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Springville, Iowa",
      "highSchool": "Springville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/frosty-lorimer/10879",
      "tfrrsId": "6592823"
    },
    {
      "id": "10880",
      "name": "Sam Madson",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Omaha, Neb.",
      "highSchool": "Westside High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-madson/10880",
      "tfrrsId": "6592826"
    },
    {
      "id": "10881",
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/10881",
      "tfrrsId": "7043060"
    },
    {
      "id": "10916",
      "name": "Colin Meisenburg",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Orion, Ill.",
      "highSchool": "Orion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-meisenburg/10916"
    },
    {
      "id": "10917",
      "name": "Arthur Meyers",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Redlands, Calif.",
      "highSchool": "Redlands East Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/10917",
      "tfrrsId": "7918373"
    },
    {
      "id": "10882",
      "name": "Jack Meyers",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Pleasant Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-meyers/10882",
      "tfrrsId": "7730353"
    },
    {
      "id": "10897",
      "name": "Jay Mixdorf",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jay-mixdorf/10897",
      "tfrrsId": "7043061"
    },
    {
      "id": "10883",
      "name": "Ryan  Neubauer",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Praire",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-neubauer/10883",
      "tfrrsId": "7730357"
    },
    {
      "id": "10918",
      "name": "Clay Pehl",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/10918",
      "tfrrsId": "7918374"
    },
    {
      "id": "10898",
      "name": "Sam Pinkowski",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "La Crosse Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-pinkowski/10898",
      "tfrrsId": "6592831"
    },
    {
      "id": "10919",
      "name": "Andrew Poock",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/10919",
      "tfrrsId": "7918375"
    },
    {
      "id": "10884",
      "name": "Brice Rhodes",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Herbert Hoover",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/10884",
      "tfrrsId": "7370517"
    },
    {
      "id": "10885",
      "name": "Gavin Roy",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-roy/10885",
      "tfrrsId": "7730364"
    },
    {
      "id": "10886",
      "name": "Carson Rygh",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Lake Mills, Iowa",
      "highSchool": "Lake Mills Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/10886",
      "tfrrsId": "7730365"
    },
    {
      "id": "10887",
      "name": "Wyatt  Schmidt",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wyatt-schmidt/10887",
      "tfrrsId": "8659713"
    },
    {
      "id": "10888",
      "name": "Michael  Schmitz",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-schmitz/10888",
      "tfrrsId": "7370519"
    },
    {
      "id": "10889",
      "name": "Sam Schmitz",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schmitz/10889",
      "tfrrsId": "7730366"
    },
    {
      "id": "10890",
      "name": "Morgan Shirley-Fairbairn",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Bismarck, N.D.",
      "highSchool": "Bismarck",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/morgan-shirley-fairbairn/10890",
      "tfrrsId": "7043077"
    },
    {
      "id": "10920",
      "name": "Griffin Steiniger",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "St. Paul, Minn.",
      "highSchool": "Irondale",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/griffin-steiniger/10920",
      "tfrrsId": "7918376"
    },
    {
      "id": "10891",
      "name": "Jacob VanderWilt",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-vanderwilt/10891",
      "tfrrsId": "7370522"
    },
    {
      "id": "10892",
      "name": "Logan Wisocki-Johnson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "East Moline, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/logan-wisocki-johnson/10892",
      "tfrrsId": "7730371"
    },
    {
      "id": "10894",
      "name": "Noah Worthington",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/noah-worthington/10894",
      "tfrrsId": "6592836"
    },
    {
      "id": "10895",
      "name": "Jordan Yessak",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Vinton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jordan-yessak/10895",
      "tfrrsId": "6592838"
    },
    {
      "id": "10829",
      "name": "Brandi Antonio",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Deerfield Beach, Fla.",
      "highSchool": "Pope John Paul II",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/10829",
      "tfrrsId": "7042947"
    },
    {
      "id": "10851",
      "name": "Liz Ashing",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Grinnell, Iowa",
      "highSchool": "Grinnell Community",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/liz-ashing/10851",
      "tfrrsId": "7918378"
    },
    {
      "id": "10853",
      "name": "Rylie Bainbridge",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cherokee, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/rylie-bainbridge/10853",
      "tfrrsId": "7918379"
    },
    {
      "id": "10830",
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/10830",
      "tfrrsId": "7540843"
    },
    {
      "id": "10831",
      "name": "Trinity Borland",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/trinity-borland/10831",
      "tfrrsId": "7042949"
    },
    {
      "id": "10832",
      "name": "Victoria  Breitbach",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "North Buena Vista, Iowa",
      "highSchool": "Clayton Ridge",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/victoria-breitbach/10832",
      "tfrrsId": "7540844"
    },
    {
      "id": "10854",
      "name": "Sophia Broers",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Fontanelle, Iowa",
      "highSchool": "Nodaway Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sophia-broers/10854",
      "tfrrsId": "7918380"
    },
    {
      "id": "10833",
      "name": "Lexi Brown",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lexi-brown/10833",
      "tfrrsId": "7699550"
    },
    {
      "id": "10834",
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/10834",
      "tfrrsId": "7540845"
    },
    {
      "id": "10855",
      "name": "Alyssa Chyma",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama County",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alyssa-chyma/10855",
      "tfrrsId": "7918381"
    },
    {
      "id": "10835",
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/10835",
      "tfrrsId": "6592718"
    },
    {
      "id": "10836",
      "name": "Miricle Corbo",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/miricle-corbo/10836",
      "tfrrsId": "7730217"
    },
    {
      "id": "10837",
      "name": "Katelyn Eilders",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Robins, Iowa",
      "highSchool": "Linn Mar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/katelyn-eilders/10837",
      "tfrrsId": "7730219"
    },
    {
      "id": "10838",
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/10838",
      "tfrrsId": "7540848"
    },
    {
      "id": "10839",
      "name": "Carlene Hamilton",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Mesa, Ariz.",
      "highSchool": "Skyline",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/10839",
      "tfrrsId": "7540849"
    },
    {
      "id": "10840",
      "name": "Anna Hertz",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/10840",
      "tfrrsId": "7042976"
    },
    {
      "id": "10841",
      "name": "Shaelyn Hostager",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-hostager/10841",
      "tfrrsId": "7730222"
    },
    {
      "id": "10842",
      "name": "Allegra  Knudson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Manly, Iowa",
      "highSchool": "Central Springs",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/10842",
      "tfrrsId": "7540851"
    },
    {
      "id": "10852",
      "name": "Riley Mayer",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "Saint Edmond",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/riley-mayer/10852",
      "tfrrsId": "7042980"
    },
    {
      "id": "10857",
      "name": "Ellie Meyer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Iowa Falls, Iowa",
      "highSchool": "Iowa Falls-Alden",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/10857",
      "tfrrsId": "7918382"
    },
    {
      "id": "10843",
      "name": "Jenna Morey",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jenna-morey/10843",
      "tfrrsId": "7730228"
    },
    {
      "id": "10844",
      "name": "Moriah Morter",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Muscatine, Iowa",
      "highSchool": "Muscatine",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/moriah-morter/10844",
      "tfrrsId": "7042982"
    },
    {
      "id": "10845",
      "name": "Alissa Neubauer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/10845",
      "tfrrsId": "6915225"
    },
    {
      "id": "10846",
      "name": "Charlie Otto",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Hinsdale, Ill.",
      "highSchool": "Hinsdale Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/10846",
      "tfrrsId": "7730230"
    },
    {
      "id": "10847",
      "name": "Ryleigh Parrack",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Papillion, Neb.",
      "highSchool": "Papillion-La Vista South",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ryleigh-parrack/10847",
      "tfrrsId": "7730231"
    },
    {
      "id": "10848",
      "name": "Natalie  Paulson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-paulson/10848",
      "tfrrsId": "7540852"
    },
    {
      "id": "10849",
      "name": "Erin Phelan",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Waukesha, Wis.",
      "highSchool": "Waukesha West",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/10849",
      "tfrrsId": "7740369"
    },
    {
      "id": "10850",
      "name": "Jane Pinkowski",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jane-pinkowski/10850",
      "tfrrsId": "7730233"
    },
    {
      "id": "10858",
      "name": "Emily Richter",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/10858",
      "tfrrsId": "7918383"
    },
    {
      "id": "10859",
      "name": "Brielle Ruch",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Urbandale",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brielle-ruch/10859",
      "tfrrsId": "7918387"
    }
  ]
}
```

### `src/data/distance_roster_22.json`

```json
{
  "generatedAt": "2026-09-13T02:47:11.210Z",
  "season": 2022,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2022",
    "https://go-knights.net/sports/womens-cross-country/roster/2022"
  ],
  "athletes": [
    {
      "id": "11594",
      "name": "Josh Arias",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Indio, Calif.",
      "highSchool": "Shadow Hills",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/josh-arias/11594",
      "tfrrsId": "7918357"
    },
    {
      "id": "11634",
      "name": "Seth Bailey",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/seth-bailey/11634",
      "tfrrsId": "8352840"
    },
    {
      "id": "11595",
      "name": "Ian Barry",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Fennimore, Wis.",
      "highSchool": "Fennimore",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ian-barry/11595",
      "tfrrsId": "7730278"
    },
    {
      "id": "11596",
      "name": "Luke Benson",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/luke-benson/11596",
      "tfrrsId": "7918377"
    },
    {
      "id": "11597",
      "name": "Callum Brittain",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "White River Junction, Ver.",
      "highSchool": "Hartford",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/11597",
      "tfrrsId": "7043032"
    },
    {
      "id": "11599",
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/11599",
      "tfrrsId": "7370510"
    },
    {
      "id": "11600",
      "name": "Bert Cortez",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Lone Tree, Iowa",
      "highSchool": "Lone Tree",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/11600",
      "tfrrsId": "7918360"
    },
    {
      "id": "11601",
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/11601",
      "tfrrsId": "7730328"
    },
    {
      "id": "11602",
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/11602",
      "tfrrsId": "7043035"
    },
    {
      "id": "11635",
      "name": "Shane Erb",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/shane-erb/11635",
      "tfrrsId": "8352846"
    },
    {
      "id": "11603",
      "name": "Michael Goodenbour",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-goodenbour/11603",
      "tfrrsId": "7918361"
    },
    {
      "id": "11604",
      "name": "Jacob  Green",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-green/11604",
      "tfrrsId": "7730339"
    },
    {
      "id": "11605",
      "name": "Colin Greenwell",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/11605",
      "tfrrsId": "7918365"
    },
    {
      "id": "11607",
      "name": "Joe Hasken",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Miles, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joe-hasken/11607",
      "tfrrsId": "8017690"
    },
    {
      "id": "11608",
      "name": "Nick Henry",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cheney, Wash.",
      "highSchool": "Medical Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nick-henry/11608",
      "tfrrsId": "7370512"
    },
    {
      "id": "11609",
      "name": "Paul Hoopes",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Letts, Iowa",
      "highSchool": "Louisa Muscatine",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/paul-hoopes/11609",
      "tfrrsId": "7918366"
    },
    {
      "id": "11610",
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/11610",
      "tfrrsId": "7730348"
    },
    {
      "id": "11611",
      "name": "Jon Hutton",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jon-hutton/11611",
      "tfrrsId": "7918367"
    },
    {
      "id": "11612",
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/11612",
      "tfrrsId": "7043039"
    },
    {
      "id": "11613",
      "name": "Jacob  Keay",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Treynor, Iowa",
      "highSchool": "Treynor Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-keay/11613",
      "tfrrsId": "7730350"
    },
    {
      "id": "11614",
      "name": "Jack Kinzer",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-kinzer/11614",
      "tfrrsId": "7918369"
    },
    {
      "id": "11615",
      "name": "Nathaniel Knutson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln-Way West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathaniel-knutson/11615",
      "tfrrsId": "7918371"
    },
    {
      "id": "11616",
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/11616",
      "tfrrsId": "7730351"
    },
    {
      "id": "11637",
      "name": "Eli Larson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Walker, Iowa",
      "highSchool": "Center Point-Urbana",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/11637",
      "tfrrsId": "8352862"
    },
    {
      "id": "11617",
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/11617",
      "tfrrsId": "7043060"
    },
    {
      "id": "11618",
      "name": "Arthur Meyers",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Redlands, Calif.",
      "highSchool": "Redlands East Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/11618",
      "tfrrsId": "7918373"
    },
    {
      "id": "11619",
      "name": "Jack Meyers",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Pleasant Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-meyers/11619",
      "tfrrsId": "7730353"
    },
    {
      "id": "12005",
      "name": "Roberto Munoz",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "East Moline, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/roberto-munoz/12005"
    },
    {
      "id": "11620",
      "name": "Ryan  Neubauer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Praire",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-neubauer/11620",
      "tfrrsId": "7730357"
    },
    {
      "id": "11638",
      "name": "Cameron Noreen",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Lincoln, Calif.",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/11638",
      "tfrrsId": "8271797"
    },
    {
      "id": "11621",
      "name": "Clay Pehl",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/11621",
      "tfrrsId": "7918374"
    },
    {
      "id": "11622",
      "name": "Andrew Poock",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/11622",
      "tfrrsId": "7918375"
    },
    {
      "id": "11639",
      "name": "Owen Pries",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/owen-pries/11639",
      "tfrrsId": "8352883"
    },
    {
      "id": "11998",
      "name": "Brendan Rader",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/11998",
      "tfrrsId": "8352884"
    },
    {
      "id": "11623",
      "name": "Brice Rhodes",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Herbert Hoover",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/11623",
      "tfrrsId": "7370517"
    },
    {
      "id": "11624",
      "name": "Gavin Roy",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-roy/11624",
      "tfrrsId": "7730364"
    },
    {
      "id": "11625",
      "name": "Carson Rygh",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Lake Mills, Iowa",
      "highSchool": "Lake Mills Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/11625",
      "tfrrsId": "7730365"
    },
    {
      "id": "11640",
      "name": "Conner Sattler",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/11640",
      "tfrrsId": "8352888"
    },
    {
      "id": "11641",
      "name": "Sam Schaefer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "City High",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schaefer/11641",
      "tfrrsId": "8271801"
    },
    {
      "id": "11642",
      "name": "Tyler Schermerhorn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Cenntenial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tyler-schermerhorn/11642",
      "tfrrsId": "8352891"
    },
    {
      "id": "11626",
      "name": "Wyatt  Schmidt",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wyatt-schmidt/11626",
      "tfrrsId": "8659713"
    },
    {
      "id": "11627",
      "name": "Michael  Schmitz",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-schmitz/11627",
      "tfrrsId": "7370519"
    },
    {
      "id": "11628",
      "name": "Sam Schmitz",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schmitz/11628",
      "tfrrsId": "7730366"
    },
    {
      "id": "11629",
      "name": "Morgan Shirley-Fairbairn",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Bismarck, N.D.",
      "highSchool": "Bismarck",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/morgan-shirley-fairbairn/11629",
      "tfrrsId": "7043077"
    },
    {
      "id": "11643",
      "name": "Lance Sobaski",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Brighton, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/lance-sobaski/11643",
      "tfrrsId": "8352892"
    },
    {
      "id": "11631",
      "name": "Jacob VanderWilt",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-vanderwilt/11631",
      "tfrrsId": "7370522"
    },
    {
      "id": "11632",
      "name": "Logan Wisocki-Johnson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "East Moline, Ill.",
      "highSchool": "United Township",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/logan-wisocki-johnson/11632",
      "tfrrsId": "7730371"
    },
    {
      "id": "11645",
      "name": "Rylie Bainbridge",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cherokee, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/rylie-bainbridge/11645",
      "tfrrsId": "7918379"
    },
    {
      "id": "11646",
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/11646",
      "tfrrsId": "7540843"
    },
    {
      "id": "11664",
      "name": "Lilly Boge",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Farley, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lilly-boge/11664",
      "tfrrsId": "8272157"
    },
    {
      "id": "11648",
      "name": "Lexi Brown",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lexi-brown/11648",
      "tfrrsId": "7699550"
    },
    {
      "id": "11649",
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/11649",
      "tfrrsId": "7540845"
    },
    {
      "id": "11650",
      "name": "Alyssa Chyma",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama County",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alyssa-chyma/11650",
      "tfrrsId": "7918381"
    },
    {
      "id": "11651",
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/11651",
      "tfrrsId": "7540848"
    },
    {
      "id": "11665",
      "name": "Kelly Giardina",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Rockford, Ill.",
      "highSchool": "Rockford Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kelly-giardina/11665",
      "tfrrsId": "8352850"
    },
    {
      "id": "11652",
      "name": "Carlene Hamilton",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Mesa, Ariz.",
      "highSchool": "Skyline",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/11652",
      "tfrrsId": "7540849"
    },
    {
      "id": "11653",
      "name": "Shaelyn Hostager",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-hostager/11653",
      "tfrrsId": "7730222"
    },
    {
      "id": "11654",
      "name": "Allegra  Knudson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Manly, Iowa",
      "highSchool": "Central Springs",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/11654",
      "tfrrsId": "7540851"
    },
    {
      "id": "11668",
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/11668",
      "tfrrsId": "8272159"
    },
    {
      "id": "11666",
      "name": "Karle Kramer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Monticello, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/karle-kramer/11666",
      "tfrrsId": "8352860"
    },
    {
      "id": "11655",
      "name": "Riley Mayer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "Saint Edmond",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/riley-mayer/11655",
      "tfrrsId": "7042980"
    },
    {
      "id": "11656",
      "name": "Ellie Meyer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Iowa Falls, Iowa",
      "highSchool": "Iowa Falls-Alden",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/11656",
      "tfrrsId": "7918382"
    },
    {
      "id": "11669",
      "name": "Haley Meyer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "New Albin, Iowa",
      "highSchool": "Kee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-meyer/11669",
      "tfrrsId": "8352865"
    },
    {
      "id": "11657",
      "name": "Jenna Morey",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jenna-morey/11657",
      "tfrrsId": "7730228"
    },
    {
      "id": "11658",
      "name": "Ryleigh Parrack",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Papillion, Neb.",
      "highSchool": "Papillion-La Vista South",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ryleigh-parrack/11658",
      "tfrrsId": "7730231"
    },
    {
      "id": "11659",
      "name": "Natalie  Paulson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/natalie-paulson/11659",
      "tfrrsId": "7540852"
    },
    {
      "id": "11670",
      "name": "Lily Peterson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Hawley, Minn.",
      "highSchool": "Hawley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-peterson/11670",
      "tfrrsId": "8352880"
    },
    {
      "id": "11660",
      "name": "Erin Phelan",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Waukesha, Wis.",
      "highSchool": "Waukesha West",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/11660",
      "tfrrsId": "7740369"
    },
    {
      "id": "11661",
      "name": "Jane Pinkowski",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "La Crosse, Wis.",
      "highSchool": "Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jane-pinkowski/11661",
      "tfrrsId": "7730233"
    },
    {
      "id": "11671",
      "name": "Madison Prier",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/madison-prier/11671",
      "tfrrsId": "8352882"
    },
    {
      "id": "11662",
      "name": "Emily Richter",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/11662",
      "tfrrsId": "7918383"
    },
    {
      "id": "11663",
      "name": "Brielle Ruch",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Urbandale",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brielle-ruch/11663",
      "tfrrsId": "7918387"
    },
    {
      "id": "11667",
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/11667",
      "tfrrsId": "8352893"
    }
  ]
}
```

### `src/data/distance_roster_23.json`

```json
{
  "generatedAt": "2026-09-13T02:47:12.945Z",
  "season": 2023,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2023",
    "https://go-knights.net/sports/womens-cross-country/roster/2023"
  ],
  "athletes": [
    {
      "id": "12896",
      "name": "Seth Bailey",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/seth-bailey/12896",
      "tfrrsId": "8352840"
    },
    {
      "id": "12933",
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/12933",
      "tfrrsId": "8585408"
    },
    {
      "id": "12897",
      "name": "Ian Barry",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Fennimore, Wis.",
      "highSchool": "Fennimore",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ian-barry/12897",
      "tfrrsId": "7730278"
    },
    {
      "id": "12934",
      "name": "Braden Burger",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Shakopee, Minn.",
      "highSchool": "Shakopee",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/12934",
      "tfrrsId": "8585418"
    },
    {
      "id": "12898",
      "name": "Carson Collet",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-collet/12898",
      "tfrrsId": "7918359"
    },
    {
      "id": "12899",
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/12899",
      "tfrrsId": "7370510"
    },
    {
      "id": "12900",
      "name": "Bert Cortez",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Lone Tree, Iowa",
      "highSchool": "Lone Tree",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/12900",
      "tfrrsId": "7918360"
    },
    {
      "id": "12935",
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/12935",
      "tfrrsId": "8585423"
    },
    {
      "id": "12901",
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/12901",
      "tfrrsId": "7730328"
    },
    {
      "id": "12936",
      "name": "Hutton Edney",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/hutton-edney/12936",
      "tfrrsId": "8585412"
    },
    {
      "id": "12902",
      "name": "Shane Erb",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/shane-erb/12902",
      "tfrrsId": "8352846"
    },
    {
      "id": "12937",
      "name": "Chris Fenstermaker",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Pacific Grove, Calif.",
      "highSchool": "Pacific Grove",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/12937",
      "tfrrsId": "8585422"
    },
    {
      "id": "12938",
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/12938",
      "tfrrsId": "8629072"
    },
    {
      "id": "12903",
      "name": "Michael Goodenbour",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-goodenbour/12903",
      "tfrrsId": "7918361"
    },
    {
      "id": "12904",
      "name": "Jacob  Green",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-green/12904",
      "tfrrsId": "7730339"
    },
    {
      "id": "12905",
      "name": "Colin Greenwell",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/12905",
      "tfrrsId": "7918365"
    },
    {
      "id": "12939",
      "name": "Isaiah Hammerand",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaiah-hammerand/12939",
      "tfrrsId": "8585435"
    },
    {
      "id": "12907",
      "name": "Nick Henry",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cheney, Wash.",
      "highSchool": "Medical Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nick-henry/12907",
      "tfrrsId": "7370512"
    },
    {
      "id": "12908",
      "name": "Paul Hoopes",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Letts, Iowa",
      "highSchool": "Louisa Muscatine",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/paul-hoopes/12908",
      "tfrrsId": "7918366"
    },
    {
      "id": "12940",
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/12940",
      "tfrrsId": "8585415"
    },
    {
      "id": "12909",
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/12909",
      "tfrrsId": "7730348"
    },
    {
      "id": "12941",
      "name": "Garrison Hubka",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Spring Valley, Minn.",
      "highSchool": "Kingsland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/garrison-hubka/12941",
      "tfrrsId": "8585420"
    },
    {
      "id": "12932",
      "name": "Ander Julian",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/12932",
      "tfrrsId": "8585414"
    },
    {
      "id": "12911",
      "name": "Jacob  Keay",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Treynor, Iowa",
      "highSchool": "Treynor Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-keay/12911",
      "tfrrsId": "7730350"
    },
    {
      "id": "12942",
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/12942",
      "tfrrsId": "8585410"
    },
    {
      "id": "12912",
      "name": "Jack Kinzer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-kinzer/12912",
      "tfrrsId": "7918369"
    },
    {
      "id": "12943",
      "name": "Nathan Kinzer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-kinzer/12943",
      "tfrrsId": "8585417"
    },
    {
      "id": "12913",
      "name": "Nathaniel Knutson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln-Way West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathaniel-knutson/12913",
      "tfrrsId": "7918371"
    },
    {
      "id": "12914",
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/12914",
      "tfrrsId": "7730351"
    },
    {
      "id": "12915",
      "name": "Eli Larson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Walker, Iowa",
      "highSchool": "Center Point-Urbana",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/12915",
      "tfrrsId": "8352862"
    },
    {
      "id": "12944",
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/12944",
      "tfrrsId": "8585409"
    },
    {
      "id": "12945",
      "name": "Rylan Martin",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/rylan-martin/12945",
      "tfrrsId": "8585419"
    },
    {
      "id": "12946",
      "name": "Jonathan Meyer",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jonathan-meyer/12946",
      "tfrrsId": "8585436"
    },
    {
      "id": "12916",
      "name": "Arthur Meyers",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Redlands, Calif.",
      "highSchool": "Redlands East Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/12916",
      "tfrrsId": "7918373"
    },
    {
      "id": "12917",
      "name": "Jack Meyers",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Pleasant Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-meyers/12917",
      "tfrrsId": "7730353"
    },
    {
      "id": "12918",
      "name": "Ryan  Neubauer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Praire",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-neubauer/12918",
      "tfrrsId": "7730357"
    },
    {
      "id": "12919",
      "name": "Cameron Noreen",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Lincoln, Calif.",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/12919",
      "tfrrsId": "8271797"
    },
    {
      "id": "12920",
      "name": "Clay Pehl",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/12920",
      "tfrrsId": "7918374"
    },
    {
      "id": "12921",
      "name": "Andrew Poock",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/12921",
      "tfrrsId": "7918375"
    },
    {
      "id": "12922",
      "name": "Owen Pries",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/owen-pries/12922",
      "tfrrsId": "8352883"
    },
    {
      "id": "12923",
      "name": "Brendan Rader",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/12923",
      "tfrrsId": "8352884"
    },
    {
      "id": "12947",
      "name": "Jakob Regennitter",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jakob-regennitter/12947",
      "tfrrsId": "8585421"
    },
    {
      "id": "12924",
      "name": "Gavin Roy",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-roy/12924",
      "tfrrsId": "7730364"
    },
    {
      "id": "12925",
      "name": "Carson Rygh",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Lake Mills, Iowa",
      "highSchool": "Lake Mills Community",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/12925",
      "tfrrsId": "7730365"
    },
    {
      "id": "12926",
      "name": "Conner Sattler",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Clinton, Iowa",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/12926",
      "tfrrsId": "8352888"
    },
    {
      "id": "12927",
      "name": "Tyler Schermerhorn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Cenntenial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tyler-schermerhorn/12927",
      "tfrrsId": "8352891"
    },
    {
      "id": "12928",
      "name": "Sam Schmitz",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schmitz/12928",
      "tfrrsId": "7730366"
    },
    {
      "id": "12929",
      "name": "Lance Sobaski",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Brighton, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/lance-sobaski/12929",
      "tfrrsId": "8352892"
    },
    {
      "id": "12948",
      "name": "Caleb Stiles",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Juneau, Alaska",
      "highSchool": "Thunder Mountain",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-stiles/12948",
      "tfrrsId": "8585411"
    },
    {
      "id": "12949",
      "name": "Zion Taylor",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Aurora, Colo.",
      "highSchool": "Regis Jesuit",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/zion-taylor/12949",
      "tfrrsId": "8585416"
    },
    {
      "id": "12930",
      "name": "Jacob VanderWilt",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-vanderwilt/12930",
      "tfrrsId": "7370522"
    },
    {
      "id": "12892",
      "name": "Jade Anderson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Des Moines Lincoln",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jade-anderson/12892",
      "tfrrsId": "8700372"
    },
    {
      "id": "12872",
      "name": "Rylie Bainbridge",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Cherokee, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/rylie-bainbridge/12872",
      "tfrrsId": "7918379"
    },
    {
      "id": "12873",
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/12873",
      "tfrrsId": "7540843"
    },
    {
      "id": "12874",
      "name": "Lilly Boge",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Farley, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lilly-boge/12874",
      "tfrrsId": "8272157"
    },
    {
      "id": "12875",
      "name": "Lexi Brown",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lexi-brown/12875",
      "tfrrsId": "7699550"
    },
    {
      "id": "12876",
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/12876",
      "tfrrsId": "7540845"
    },
    {
      "id": "12893",
      "name": "Morgan Engel",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Syosset, N.Y.",
      "highSchool": "Syosset",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/morgan-engel/12893",
      "tfrrsId": "8700379"
    },
    {
      "id": "12877",
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/12877",
      "tfrrsId": "7540848"
    },
    {
      "id": "12878",
      "name": "Kelly Giardina",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Rockford, Ill.",
      "highSchool": "Rockford Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kelly-giardina/12878",
      "tfrrsId": "8352850"
    },
    {
      "id": "12879",
      "name": "Shaelyn Hostager",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/shaelyn-hostager/12879",
      "tfrrsId": "7730222"
    },
    {
      "id": "12894",
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/12894",
      "tfrrsId": "8700382"
    },
    {
      "id": "12880",
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/12880",
      "tfrrsId": "8272159"
    },
    {
      "id": "12881",
      "name": "Karle Kramer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Monticello, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/karle-kramer/12881",
      "tfrrsId": "8352860"
    },
    {
      "id": "12882",
      "name": "Ellie Meyer",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Iowa Falls, Iowa",
      "highSchool": "Iowa Falls-Alden",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/12882",
      "tfrrsId": "7918382"
    },
    {
      "id": "12883",
      "name": "Haley Meyer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New Albin, Iowa",
      "highSchool": "Kee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-meyer/12883",
      "tfrrsId": "8352865"
    },
    {
      "id": "12884",
      "name": "Jenna Morey",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jenna-morey/12884",
      "tfrrsId": "7730228"
    },
    {
      "id": "12885",
      "name": "Ryleigh Parrack",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Papillion, Neb.",
      "highSchool": "Papillion-La Vista South",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ryleigh-parrack/12885",
      "tfrrsId": "7730231"
    },
    {
      "id": "12886",
      "name": "Lily Peterson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Hawley, Minn.",
      "highSchool": "Hawley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-peterson/12886",
      "tfrrsId": "8352880"
    },
    {
      "id": "12887",
      "name": "Erin Phelan",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Waukesha, Wis.",
      "highSchool": "Waukesha West",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/12887",
      "tfrrsId": "7740369"
    },
    {
      "id": "12888",
      "name": "Madison Prier",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/madison-prier/12888",
      "tfrrsId": "8352882"
    },
    {
      "id": "12889",
      "name": "Emily Richter",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/12889",
      "tfrrsId": "7918383"
    },
    {
      "id": "12891",
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/12891",
      "tfrrsId": "8352893"
    },
    {
      "id": "12895",
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/12895",
      "tfrrsId": "8700393"
    }
  ]
}
```

### `src/data/distance_roster_24.json`

```json
{
  "generatedAt": "2026-09-13T02:47:14.704Z",
  "season": 2024,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2024",
    "https://go-knights.net/sports/womens-cross-country/roster/2024"
  ],
  "athletes": [
    {
      "id": "14949",
      "name": "Ahmed Aldamak",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/14949",
      "tfrrsId": "8896801"
    },
    {
      "id": "14950",
      "name": "AJ Angus",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/14950",
      "tfrrsId": "8896799"
    },
    {
      "id": "14906",
      "name": "Seth Bailey",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/seth-bailey/14906",
      "tfrrsId": "8352840"
    },
    {
      "id": "14907",
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/14907",
      "tfrrsId": "8585408"
    },
    {
      "id": "14951",
      "name": "Ayden Buchanan",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Santa Clarita, Calif.",
      "highSchool": "Valencia",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/14951",
      "tfrrsId": "8896802"
    },
    {
      "id": "14908",
      "name": "Braden Burger",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Shakopee, Minn.",
      "highSchool": "Shakopee",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/14908",
      "tfrrsId": "8585418"
    },
    {
      "id": "14952",
      "name": "Marcus Camacho",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Xavier",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/marcus-camacho/14952",
      "tfrrsId": "8896789"
    },
    {
      "id": "14953",
      "name": "Cooper Cook",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/14953",
      "tfrrsId": "8896794"
    },
    {
      "id": "14909",
      "name": "Bert Cortez",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Lone Tree, Iowa",
      "highSchool": "Lone Tree",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/14909",
      "tfrrsId": "7918360"
    },
    {
      "id": "14910",
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/14910",
      "tfrrsId": "8585423"
    },
    {
      "id": "14911",
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/14911",
      "tfrrsId": "7730328"
    },
    {
      "id": "14954",
      "name": "Aidan Decker",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/14954",
      "tfrrsId": "8896803"
    },
    {
      "id": "14912",
      "name": "Hutton Edney",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/hutton-edney/14912",
      "tfrrsId": "8585412"
    },
    {
      "id": "14913",
      "name": "Shane Erb",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/shane-erb/14913",
      "tfrrsId": "8352846"
    },
    {
      "id": "14914",
      "name": "Chris Fenstermaker",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Pacific Grove, Calif.",
      "highSchool": "Pacific Grove",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/14914",
      "tfrrsId": "8585422"
    },
    {
      "id": "14915",
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/14915",
      "tfrrsId": "8629072"
    },
    {
      "id": "14916",
      "name": "Michael Goodenbour",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/michael-goodenbour/14916",
      "tfrrsId": "7918361"
    },
    {
      "id": "14917",
      "name": "Jacob  Green",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jacob-green/14917",
      "tfrrsId": "7730339"
    },
    {
      "id": "14918",
      "name": "Colin Greenwell",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/14918",
      "tfrrsId": "7918365"
    },
    {
      "id": "14919",
      "name": "Isaiah Hammerand",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaiah-hammerand/14919",
      "tfrrsId": "8585435"
    },
    {
      "id": "14955",
      "name": "Keagan Hennessey",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Orchard, Iowa",
      "highSchool": "Osage",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/keagan-hennessey/14955",
      "tfrrsId": "8896805"
    },
    {
      "id": "14920",
      "name": "Paul Hoopes",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Letts, Iowa",
      "highSchool": "Louisa Muscatine",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/paul-hoopes/14920",
      "tfrrsId": "7918366"
    },
    {
      "id": "14921",
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/14921",
      "tfrrsId": "8585415"
    },
    {
      "id": "14922",
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/14922",
      "tfrrsId": "7730348"
    },
    {
      "id": "14923",
      "name": "Garrison Hubka",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Spring Valley, Minn.",
      "highSchool": "Kingsland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/garrison-hubka/14923",
      "tfrrsId": "8585420"
    },
    {
      "id": "14956",
      "name": "Wes Hulseberg",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Williamsburg, Iowa",
      "highSchool": "Williamsburg",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wes-hulseberg/14956",
      "tfrrsId": "8896796"
    },
    {
      "id": "14957",
      "name": "Justus Hundley",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Vacaville, Calif.",
      "highSchool": "Vacaville",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/justus-hundley/14957",
      "tfrrsId": "8896797"
    },
    {
      "id": "14924",
      "name": "Ander Julian",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/14924",
      "tfrrsId": "8585414"
    },
    {
      "id": "14925",
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/14925",
      "tfrrsId": "8585410"
    },
    {
      "id": "14926",
      "name": "Jack Kinzer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-kinzer/14926",
      "tfrrsId": "7918369"
    },
    {
      "id": "14927",
      "name": "Nathan Kinzer",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-kinzer/14927",
      "tfrrsId": "8585417"
    },
    {
      "id": "14958",
      "name": "Grant Koehnen",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Sherburn, Minn.",
      "highSchool": "Martin County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/grant-koehnen/14958",
      "tfrrsId": "8896806"
    },
    {
      "id": "15407",
      "name": "Caden Kueker",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/15407",
      "tfrrsId": "8896804"
    },
    {
      "id": "15405",
      "name": "Riley Kuhn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/riley-kuhn/15405",
      "tfrrsId": "9445711"
    },
    {
      "id": "14928",
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/14928",
      "tfrrsId": "7730351"
    },
    {
      "id": "14929",
      "name": "Eli Larson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Walker, Iowa",
      "highSchool": "Center Point-Urbana",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/14929",
      "tfrrsId": "8352862"
    },
    {
      "id": "14959",
      "name": "Ethan Loutzenheiser",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ethan-loutzenheiser/14959",
      "tfrrsId": "8896807"
    },
    {
      "id": "14930",
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/14930",
      "tfrrsId": "8585409"
    },
    {
      "id": "14960",
      "name": "Kaden Lynch",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "",
      "highSchool": "",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/kaden-lynch/14960",
      "tfrrsId": "8896791"
    },
    {
      "id": "14931",
      "name": "Rylan Martin",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/rylan-martin/14931",
      "tfrrsId": "8585419"
    },
    {
      "id": "14932",
      "name": "Jonathan Meyer",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jonathan-meyer/14932",
      "tfrrsId": "8585436"
    },
    {
      "id": "14933",
      "name": "Arthur Meyers",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Redlands, Calif.",
      "highSchool": "Redlands East Valley",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/14933",
      "tfrrsId": "7918373"
    },
    {
      "id": "14961",
      "name": "Nathan Moore",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Wylie, Tex.",
      "highSchool": "Wylie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-moore/14961",
      "tfrrsId": "8896790"
    },
    {
      "id": "14962",
      "name": "Drew Moser",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Clinton, Ill.",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/14962",
      "tfrrsId": "8896795"
    },
    {
      "id": "14935",
      "name": "Ryan  Neubauer",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "Swisher, Iowa",
      "highSchool": "Praire",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-neubauer/14935",
      "tfrrsId": "7730357"
    },
    {
      "id": "14963",
      "name": "Ben Neville",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Urbandale, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/14963",
      "tfrrsId": "8896800"
    },
    {
      "id": "14936",
      "name": "Cameron Noreen",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Lincoln, Calif.",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/14936",
      "tfrrsId": "8271797"
    },
    {
      "id": "15406",
      "name": "Brendan Owens",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/15406",
      "tfrrsId": "8896793"
    },
    {
      "id": "14937",
      "name": "Clay Pehl",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/14937",
      "tfrrsId": "7918374"
    },
    {
      "id": "14938",
      "name": "Andrew Poock",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/14938",
      "tfrrsId": "7918375"
    },
    {
      "id": "14964",
      "name": "Alex Pries",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/14964",
      "tfrrsId": "8896792"
    },
    {
      "id": "14939",
      "name": "Owen Pries",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/owen-pries/14939",
      "tfrrsId": "8352883"
    },
    {
      "id": "14940",
      "name": "Brendan Rader",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/14940",
      "tfrrsId": "8352884"
    },
    {
      "id": "14941",
      "name": "Jakob Regennitter",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jakob-regennitter/14941",
      "tfrrsId": "8585421"
    },
    {
      "id": "14942",
      "name": "Gavin Roy",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "Eldora, Iowa",
      "highSchool": "South Hardin",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-roy/14942",
      "tfrrsId": "7730364"
    },
    {
      "id": "14943",
      "name": "Conner Sattler",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/14943",
      "tfrrsId": "8352888"
    },
    {
      "id": "14944",
      "name": "Tyler Schermerhorn",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Cenntenial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tyler-schermerhorn/14944",
      "tfrrsId": "8352891"
    },
    {
      "id": "15416",
      "name": "Sawyer Schmidt",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sawyer-schmidt/15416",
      "tfrrsId": "8896826"
    },
    {
      "id": "14945",
      "name": "Sam Schmitz",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sam-schmitz/14945",
      "tfrrsId": "7730366"
    },
    {
      "id": "14965",
      "name": "Andrew Smith",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Glenwood, Iowa",
      "highSchool": "Glenwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/14965",
      "tfrrsId": "8896788"
    },
    {
      "id": "14946",
      "name": "Lance Sobaski",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Brighton, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/lance-sobaski/14946",
      "tfrrsId": "8352892"
    },
    {
      "id": "14947",
      "name": "Caleb Stiles",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Juneau, Alaska",
      "highSchool": "Thunder Mountain",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-stiles/14947",
      "tfrrsId": "8585411"
    },
    {
      "id": "14948",
      "name": "Zion Taylor",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Aurora, Colo.",
      "highSchool": "Regis Jesuit",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/zion-taylor/14948",
      "tfrrsId": "8585416"
    },
    {
      "id": "14966",
      "name": "Clay Warson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/14966",
      "tfrrsId": "8896798"
    },
    {
      "id": "14967",
      "name": "Solomon Zaugg",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/solomon-zaugg/14967",
      "tfrrsId": "8896808"
    },
    {
      "id": "14874",
      "name": "Jade Anderson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Des Moines Lincoln",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jade-anderson/14874",
      "tfrrsId": "8700372"
    },
    {
      "id": "14889",
      "name": "Abbey Angus",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/14889",
      "tfrrsId": "8896839"
    },
    {
      "id": "14890",
      "name": "Cori Atten",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cuba City, Wis.",
      "highSchool": "Cuba City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cori-atten/14890",
      "tfrrsId": "8896836"
    },
    {
      "id": "14875",
      "name": "Rylie Bainbridge",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Cherokee, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/rylie-bainbridge/14875",
      "tfrrsId": "7918379"
    },
    {
      "id": "14891",
      "name": "Sydney Bochmann",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sydney-bochmann/14891",
      "tfrrsId": "8896838"
    },
    {
      "id": "14876",
      "name": "Lilly Boge",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Farley, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lilly-boge/14876",
      "tfrrsId": "8272157"
    },
    {
      "id": "14892",
      "name": "Nadia Bowden",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln Way Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nadia-bowden/14892",
      "tfrrsId": "8896829"
    },
    {
      "id": "14893",
      "name": "Tatum Buenning",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Evergreen, Colo.",
      "highSchool": "Evergreen",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/tatum-buenning/14893",
      "tfrrsId": "8896843"
    },
    {
      "id": "14896",
      "name": "Maria Colette Choi Lei",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "",
      "highSchool": "",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maria-colette-choi-lei/14896",
      "tfrrsId": "9017626"
    },
    {
      "id": "14877",
      "name": "Morgan Engel",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Syosset, N.Y.",
      "highSchool": "Syosset",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/morgan-engel/14877",
      "tfrrsId": "8700379"
    },
    {
      "id": "14878",
      "name": "Kelly Giardina",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Rockford, Ill.",
      "highSchool": "Rockford Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kelly-giardina/14878",
      "tfrrsId": "8352850"
    },
    {
      "id": "14894",
      "name": "Makenna Hetrick",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/makenna-hetrick/14894",
      "tfrrsId": "8896830"
    },
    {
      "id": "14895",
      "name": "Sunny Horner",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "New Waverly, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sunny-horner/14895",
      "tfrrsId": "8896842"
    },
    {
      "id": "14879",
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/14879",
      "tfrrsId": "8700382"
    },
    {
      "id": "14880",
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/14880",
      "tfrrsId": "8272159"
    },
    {
      "id": "14881",
      "name": "Karle Kramer",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Monticello, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/karle-kramer/14881",
      "tfrrsId": "8352860"
    },
    {
      "id": "14897",
      "name": "Lydia Maas",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Hampton, Iowa",
      "highSchool": "Hampton-Dumont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lydia-maas/14897",
      "tfrrsId": "8896833"
    },
    {
      "id": "14899",
      "name": "Maddie Merna",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Apex, N.C.",
      "highSchool": "Middle Creek",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maddie-merna/14899",
      "tfrrsId": "8896841"
    },
    {
      "id": "14882",
      "name": "Ellie Meyer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Iowa Falls, Iowa",
      "highSchool": "Iowa Falls-Alden",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/14882",
      "tfrrsId": "7918382"
    },
    {
      "id": "14883",
      "name": "Haley Meyer",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "New Albin, Iowa",
      "highSchool": "Kee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-meyer/14883",
      "tfrrsId": "8352865"
    },
    {
      "id": "14900",
      "name": "Audra Mulholland",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mason City, Iowa",
      "highSchool": "Mason City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/audra-mulholland/14900",
      "tfrrsId": "8896831"
    },
    {
      "id": "14884",
      "name": "Ryleigh Parrack",
      "team": "womens-cross-country",
      "year": "5th",
      "hometown": "Papillion, Neb.",
      "highSchool": "Papillion-La Vista South",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ryleigh-parrack/14884",
      "tfrrsId": "7730231"
    },
    {
      "id": "14902",
      "name": "Zaya Peirce",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Lewistown, Ill.",
      "highSchool": "Lewistown",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/zaya-peirce/14902",
      "tfrrsId": "8896844"
    },
    {
      "id": "14885",
      "name": "Lily Peterson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Hawley, Minn.",
      "highSchool": "Hawley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-peterson/14885",
      "tfrrsId": "8352880"
    },
    {
      "id": "14901",
      "name": "Megan Pickar",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "New Hampton, Iowa",
      "highSchool": "New Hampton",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/megan-pickar/14901",
      "tfrrsId": "8896840"
    },
    {
      "id": "15417",
      "name": "Anna Quillin",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Solon, Iowa",
      "highSchool": "Solon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/15417",
      "tfrrsId": "8904663"
    },
    {
      "id": "15418",
      "name": "Hannah Ramsey",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hannah-ramsey/15418",
      "tfrrsId": "8700388"
    },
    {
      "id": "14886",
      "name": "Emily Richter",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Hempstead",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/14886",
      "tfrrsId": "7918383"
    },
    {
      "id": "14903",
      "name": "Kamryn Sherwood",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Danville, Iowa",
      "highSchool": "Danville",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kamryn-sherwood/14903",
      "tfrrsId": "8896835"
    },
    {
      "id": "14887",
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/14887",
      "tfrrsId": "8352893"
    },
    {
      "id": "14888",
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/14888",
      "tfrrsId": "8700393"
    },
    {
      "id": "14904",
      "name": "Ava Vance",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Huxley, Iowa",
      "highSchool": "Ballard",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/14904",
      "tfrrsId": "8896837"
    },
    {
      "id": "14905",
      "name": "Grace Vortherms",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Austin, Minn.",
      "highSchool": "Austin",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/grace-vortherms/14905",
      "tfrrsId": "8896832"
    }
  ]
}
```

### `src/data/distance_roster_25.json`

```json
{
  "generatedAt": "2026-09-13T02:47:16.463Z",
  "season": 2025,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2025",
    "https://go-knights.net/sports/womens-cross-country/roster/2025"
  ],
  "athletes": [
    {
      "id": "15983",
      "name": "Nathan Ahern",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cresco, Iowa",
      "highSchool": "Crestwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-ahern/15983",
      "tfrrsId": "9200680"
    },
    {
      "id": "15937",
      "name": "Ahmed Aldamak",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/15937",
      "tfrrsId": "8896801"
    },
    {
      "id": "15938",
      "name": "AJ Angus",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/15938",
      "tfrrsId": "8896799"
    },
    {
      "id": "15939",
      "name": "Seth Bailey",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/seth-bailey/15939",
      "tfrrsId": "8352840"
    },
    {
      "id": "15940",
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/15940",
      "tfrrsId": "8585408"
    },
    {
      "id": "15984",
      "name": "Ethan Boston",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ethan-boston/15984",
      "tfrrsId": "9200679"
    },
    {
      "id": "15941",
      "name": "Ayden Buchanan",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Santa Clarita, Calif.",
      "highSchool": "Valencia",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/15941",
      "tfrrsId": "8896802"
    },
    {
      "id": "15942",
      "name": "Braden Burger",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Shakopee, Minn.",
      "highSchool": "Shakopee",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/15942",
      "tfrrsId": "8585418"
    },
    {
      "id": "15995",
      "name": "Brody Burr",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "Dowling Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brody-burr/15995",
      "tfrrsId": "9200673"
    },
    {
      "id": "15943",
      "name": "Marcus Camacho",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Xavier",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/marcus-camacho/15943",
      "tfrrsId": "8896789"
    },
    {
      "id": "15944",
      "name": "Cooper Cook",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/15944",
      "tfrrsId": "8896794"
    },
    {
      "id": "15998",
      "name": "Evan Cook",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Decatur, Ill.",
      "highSchool": "Saint Teresa",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/evan-cook/15998",
      "tfrrsId": "9200669"
    },
    {
      "id": "15945",
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/15945",
      "tfrrsId": "8585423"
    },
    {
      "id": "15985",
      "name": "Mason Coulter",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/mason-coulter/15985",
      "tfrrsId": "9200666"
    },
    {
      "id": "15946",
      "name": "Aidan Decker",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/15946",
      "tfrrsId": "8896803"
    },
    {
      "id": "15947",
      "name": "Hutton Edney",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/hutton-edney/15947",
      "tfrrsId": "8585412"
    },
    {
      "id": "15948",
      "name": "Chris Fenstermaker",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Pacific Grove, Calif.",
      "highSchool": "Pacific Grove",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/15948",
      "tfrrsId": "8585422"
    },
    {
      "id": "15949",
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/15949",
      "tfrrsId": "8629072"
    },
    {
      "id": "15986",
      "name": "Gavin Grunhovd",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Buffalo Center, Iowa",
      "highSchool": "North Iowa",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gavin-grunhovd/15986",
      "tfrrsId": "9200675"
    },
    {
      "id": "15987",
      "name": "Luke  Hagenberg",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Clive, Iowa",
      "highSchool": "Des Moines Christian",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/luke-hagenberg/15987",
      "tfrrsId": "9200674"
    },
    {
      "id": "15951",
      "name": "Isaiah Hammerand",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaiah-hammerand/15951",
      "tfrrsId": "8585435"
    },
    {
      "id": "15988",
      "name": "Ryan Heden",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-heden/15988",
      "tfrrsId": "9200665"
    },
    {
      "id": "15996",
      "name": "Gage Heyne",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "North English, Iowa",
      "highSchool": "English Valleys",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gage-heyne/15996",
      "tfrrsId": "9200670"
    },
    {
      "id": "15952",
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/15952",
      "tfrrsId": "8585415"
    },
    {
      "id": "15953",
      "name": "Garrison Hubka",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Spring Valley, Minn.",
      "highSchool": "Kingsland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/garrison-hubka/15953",
      "tfrrsId": "8585420"
    },
    {
      "id": "15954",
      "name": "Wes Hulseberg",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Williamsburg, Iowa",
      "highSchool": "Williamsburg",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wes-hulseberg/15954",
      "tfrrsId": "8896796"
    },
    {
      "id": "15955",
      "name": "Ander Julian",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/15955",
      "tfrrsId": "8585414"
    },
    {
      "id": "15956",
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/15956",
      "tfrrsId": "8585410"
    },
    {
      "id": "15957",
      "name": "Jack Kinzer",
      "team": "mens-cross-country",
      "year": "5th",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-kinzer/15957",
      "tfrrsId": "7918369"
    },
    {
      "id": "15958",
      "name": "Nathan Kinzer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-kinzer/15958",
      "tfrrsId": "8585417"
    },
    {
      "id": "15960",
      "name": "Caden Kueker",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/15960",
      "tfrrsId": "8896804"
    },
    {
      "id": "15961",
      "name": "Eli Larson",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Walker, Iowa",
      "highSchool": "Center Point-Urbana",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/15961",
      "tfrrsId": "8352862"
    },
    {
      "id": "15962",
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/15962",
      "tfrrsId": "8585409"
    },
    {
      "id": "15989",
      "name": "Connor Martin",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-martin/15989",
      "tfrrsId": "9200678"
    },
    {
      "id": "15963",
      "name": "Rylan Martin",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/rylan-martin/15963",
      "tfrrsId": "8585419"
    },
    {
      "id": "15999",
      "name": "Jonathan Meyer",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jonathan-meyer/15999",
      "tfrrsId": "8585436"
    },
    {
      "id": "15965",
      "name": "Nathan Moore",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Wylie, Tex.",
      "highSchool": "Wylie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-moore/15965",
      "tfrrsId": "8896790"
    },
    {
      "id": "15966",
      "name": "Drew Moser",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Clinton, Ill.",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/15966",
      "tfrrsId": "8896795"
    },
    {
      "id": "15997",
      "name": "Carter Mulford",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-mulford/15997",
      "tfrrsId": "9200677"
    },
    {
      "id": "15967",
      "name": "Ben Neville",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Urbandale, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/15967",
      "tfrrsId": "8896800"
    },
    {
      "id": "15968",
      "name": "Cameron Noreen",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Lincoln, Calif.",
      "highSchool": "Lincoln",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/15968",
      "tfrrsId": "8271797"
    },
    {
      "id": "15990",
      "name": "Caleb Olson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "DeWitt, Iowa",
      "highSchool": "Central DeWitt",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-olson/15990",
      "tfrrsId": "9200668"
    },
    {
      "id": "15969",
      "name": "Brendan Owens",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/15969",
      "tfrrsId": "8896793"
    },
    {
      "id": "15991",
      "name": "Henry Peterson",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Dunkerton, Iowa",
      "highSchool": "Dunkerton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/henry-peterson/15991",
      "tfrrsId": "9200671"
    },
    {
      "id": "15971",
      "name": "Alex Pries",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/15971",
      "tfrrsId": "8896792"
    },
    {
      "id": "15972",
      "name": "Owen Pries",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/owen-pries/15972",
      "tfrrsId": "8352883"
    },
    {
      "id": "15973",
      "name": "Brendan Rader",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/15973",
      "tfrrsId": "8352884"
    },
    {
      "id": "15974",
      "name": "Jakob Regennitter",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jakob-regennitter/15974",
      "tfrrsId": "8585421"
    },
    {
      "id": "15975",
      "name": "Conner Sattler",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Clinton, Iowa",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/15975",
      "tfrrsId": "8352888"
    },
    {
      "id": "15992",
      "name": "AJ Schermerhorn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-schermerhorn/15992",
      "tfrrsId": "9200676"
    },
    {
      "id": "15976",
      "name": "Tyler Schermerhorn",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Cenntenial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/tyler-schermerhorn/15976",
      "tfrrsId": "8352891"
    },
    {
      "id": "15977",
      "name": "Sawyer Schmidt",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sawyer-schmidt/15977",
      "tfrrsId": "8896826"
    },
    {
      "id": "15978",
      "name": "Andrew Smith",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Glenwood, Iowa",
      "highSchool": "Glenwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/15978",
      "tfrrsId": "8896788"
    },
    {
      "id": "15979",
      "name": "Lance Sobaski",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Brighton, Iowa",
      "highSchool": "Washington",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/lance-sobaski/15979",
      "tfrrsId": "8352892"
    },
    {
      "id": "15993",
      "name": "Austin  Soldwisch",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/austin-soldwisch/15993",
      "tfrrsId": "9200672"
    },
    {
      "id": "15980",
      "name": "Zion Taylor",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Aurora, Colo.",
      "highSchool": "Regis Jesuit",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/zion-taylor/15980",
      "tfrrsId": "8585416"
    },
    {
      "id": "15981",
      "name": "Clay Warson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/15981",
      "tfrrsId": "8896798"
    },
    {
      "id": "15994",
      "name": "Nolan Wieneke",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Juneau, Wis.",
      "highSchool": "Dodgeland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nolan-wieneke/15994",
      "tfrrsId": "9200667"
    },
    {
      "id": "15982",
      "name": "Solomon Zaugg",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/solomon-zaugg/15982",
      "tfrrsId": "8896808"
    },
    {
      "id": "15902",
      "name": "Jade Anderson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Des Moines Lincoln",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jade-anderson/15902",
      "tfrrsId": "8700372"
    },
    {
      "id": "15903",
      "name": "Abbey Angus",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/15903",
      "tfrrsId": "8896839"
    },
    {
      "id": "15904",
      "name": "Sydney Bochmann",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sydney-bochmann/15904",
      "tfrrsId": "8896838"
    },
    {
      "id": "15926",
      "name": "Jillian Borgelt",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Waunakee, Wis.",
      "highSchool": "Waunakee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jillian-borgelt/15926",
      "tfrrsId": "9200728"
    },
    {
      "id": "15905",
      "name": "Nadia Bowden",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln Way Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nadia-bowden/15905",
      "tfrrsId": "8896829"
    },
    {
      "id": "15927",
      "name": "Lily  Cooper",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-cooper/15927",
      "tfrrsId": "9200730"
    },
    {
      "id": "15906",
      "name": "Morgan Engel",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Syosset, N.Y.",
      "highSchool": "Syosset",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/morgan-engel/15906",
      "tfrrsId": "8700379"
    },
    {
      "id": "15907",
      "name": "Kelly Giardina",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Rockford, Ill.",
      "highSchool": "Rockford Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kelly-giardina/15907",
      "tfrrsId": "8352850"
    },
    {
      "id": "15928",
      "name": "Janae Hansen",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mason City, Iowa",
      "highSchool": "Mason City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janae-hansen/15928",
      "tfrrsId": "9200727"
    },
    {
      "id": "15908",
      "name": "Makenna Hetrick",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/makenna-hetrick/15908",
      "tfrrsId": "8896830"
    },
    {
      "id": "15909",
      "name": "Sunny Horner",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New Waverly, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sunny-horner/15909",
      "tfrrsId": "8896842"
    },
    {
      "id": "15929",
      "name": "Claire Hoyer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/claire-hoyer/15929",
      "tfrrsId": "9200724"
    },
    {
      "id": "15910",
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/15910",
      "tfrrsId": "8700382"
    },
    {
      "id": "15930",
      "name": "Emrie Johnson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emrie-johnson/15930",
      "tfrrsId": "9200726"
    },
    {
      "id": "15911",
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/15911",
      "tfrrsId": "8272159"
    },
    {
      "id": "15912",
      "name": "Karle Kramer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Monticello, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/karle-kramer/15912",
      "tfrrsId": "8352860"
    },
    {
      "id": "15913",
      "name": "Lydia Maas",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Hampton, Iowa",
      "highSchool": "Hampton-Dumont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lydia-maas/15913",
      "tfrrsId": "8896833"
    },
    {
      "id": "15931",
      "name": "Leah McDonald",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Wellington, Colo.",
      "highSchool": "Poudre",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/leah-mcdonald/15931",
      "tfrrsId": "9200729"
    },
    {
      "id": "15914",
      "name": "Maddie Merna",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Apex, N.C.",
      "highSchool": "Middle Creek",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maddie-merna/15914",
      "tfrrsId": "8896841"
    },
    {
      "id": "15915",
      "name": "Haley Meyer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New Albin, Iowa",
      "highSchool": "Kee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-meyer/15915",
      "tfrrsId": "8352865"
    },
    {
      "id": "15932",
      "name": "Peyton Morey",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/peyton-morey/15932",
      "tfrrsId": "9200732"
    },
    {
      "id": "15916",
      "name": "Zaya Peirce",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Lewistown, Ill.",
      "highSchool": "Lewistown",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/zaya-peirce/15916",
      "tfrrsId": "8896844"
    },
    {
      "id": "15917",
      "name": "Lily Peterson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Hawley, Minn.",
      "highSchool": "Hawley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-peterson/15917",
      "tfrrsId": "8352880"
    },
    {
      "id": "15933",
      "name": "Marissa Pewe",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/marissa-pewe/15933",
      "tfrrsId": "9200731"
    },
    {
      "id": "15918",
      "name": "Megan Pickar",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New Hampton, Iowa",
      "highSchool": "New Hampton",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/megan-pickar/15918",
      "tfrrsId": "8896840"
    },
    {
      "id": "15919",
      "name": "Anna Quillin",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Solon, Iowa",
      "highSchool": "Solon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/15919",
      "tfrrsId": "8904663"
    },
    {
      "id": "15920",
      "name": "Hannah Ramsey",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hannah-ramsey/15920",
      "tfrrsId": "8700388"
    },
    {
      "id": "15921",
      "name": "Kamryn Sherwood",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Danville, Iowa",
      "highSchool": "Danville",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kamryn-sherwood/15921",
      "tfrrsId": "8896835"
    },
    {
      "id": "15922",
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/15922",
      "tfrrsId": "8352893"
    },
    {
      "id": "15923",
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/15923",
      "tfrrsId": "8700393"
    },
    {
      "id": "15934",
      "name": "Lailah Utnage",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Italy, Texas",
      "highSchool": "Alvarado",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lailah-utnage/15934",
      "tfrrsId": "9200733"
    },
    {
      "id": "15924",
      "name": "Ava Vance",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Huxley, Iowa",
      "highSchool": "Ballard",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/15924",
      "tfrrsId": "8896837"
    },
    {
      "id": "15935",
      "name": "Ava Vanderheyden",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Nevada, Iowa",
      "highSchool": "Nevada",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vanderheyden/15935",
      "tfrrsId": "9200722"
    },
    {
      "id": "15925",
      "name": "Grace Vortherms",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Austin, Minn.",
      "highSchool": "Austin",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/grace-vortherms/15925",
      "tfrrsId": "8896832"
    },
    {
      "id": "15936",
      "name": "Bethany Warren",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bethany-warren/15936",
      "tfrrsId": "9200723"
    }
  ]
}
```

### `src/data/distance_roster_26.json`

```json
{
  "generatedAt": "2026-09-13T02:36:50.131Z",
  "season": 2026,
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster/2026",
    "https://go-knights.net/sports/womens-cross-country/roster/2026"
  ],
  "athletes": [
    {
      "id": "16912",
      "name": "Nathan Ahern",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cresco, Iowa",
      "highSchool": "Crestwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-ahern/16912",
      "tfrrsId": "9200680"
    },
    {
      "id": "16913",
      "name": "Ahmed Aldamak",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/16913",
      "tfrrsId": "8896801"
    },
    {
      "id": "16914",
      "name": "AJ Angus",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/16914",
      "tfrrsId": "8896799"
    },
    {
      "id": "16915",
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/16915",
      "tfrrsId": "8585408"
    },
    {
      "id": "17007",
      "name": "Jack Behrens",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-behrens/17007",
      "tfrrsId": "9444008"
    },
    {
      "id": "16962",
      "name": "Ethan Boston",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ethan-boston/16962",
      "tfrrsId": "9200679"
    },
    {
      "id": "16963",
      "name": "Ayden Buchanan",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Santa Clarita, Calif.",
      "highSchool": "Valencia",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/16963",
      "tfrrsId": "8896802"
    },
    {
      "id": "16964",
      "name": "Marcus Camacho",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Xavier",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/marcus-camacho/16964",
      "tfrrsId": "8896789"
    },
    {
      "id": "17014",
      "name": "Jackson Cicchinelli",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bristol, Rhode Island",
      "highSchool": "Mt Hope",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jackson-cicchinelli/17014",
      "tfrrsId": "9444010"
    },
    {
      "id": "16965",
      "name": "Cooper Cook",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/16965",
      "tfrrsId": "8896794"
    },
    {
      "id": "16966",
      "name": "Evan Cook",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Decatur, Ill.",
      "highSchool": "Saint Teresa",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/evan-cook/16966",
      "tfrrsId": "9200669"
    },
    {
      "id": "16967",
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/16967",
      "tfrrsId": "8585423"
    },
    {
      "id": "16968",
      "name": "Mason Coulter",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/mason-coulter/16968",
      "tfrrsId": "9200666"
    },
    {
      "id": "17015",
      "name": "Philip Dahlen",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Rochester, Minnesota",
      "highSchool": "John Marshall",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/philip-dahlen/17015",
      "tfrrsId": "9444002"
    },
    {
      "id": "16969",
      "name": "Aidan Decker",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/16969",
      "tfrrsId": "8896803"
    },
    {
      "id": "17016",
      "name": "Dax Duffy",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Morton, Illinois",
      "highSchool": "Peoria Notre Dame",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dax-duffy/17016",
      "tfrrsId": "9444014"
    },
    {
      "id": "16878",
      "name": "Hutton Edney",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/hutton-edney/16878",
      "tfrrsId": "8585412"
    },
    {
      "id": "17017",
      "name": "Toben Edney",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/toben-edney/17017",
      "tfrrsId": "9444012"
    },
    {
      "id": "17018",
      "name": "Aidan Feda",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Rochester, Minnesota",
      "highSchool": "John Marshall",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-feda/17018",
      "tfrrsId": "9444013"
    },
    {
      "id": "16972",
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/16972",
      "tfrrsId": "8629072"
    },
    {
      "id": "17019",
      "name": "Silas Gann",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/silas-gann/17019",
      "tfrrsId": "9444004"
    },
    {
      "id": "16881",
      "name": "Luke  Hagenberg",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Clive, Iowa",
      "highSchool": "Des Moines Christian",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/luke-hagenberg/16881",
      "tfrrsId": "9200674"
    },
    {
      "id": "16928",
      "name": "Isaiah Hammerand",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaiah-hammerand/16928",
      "tfrrsId": "8585435"
    },
    {
      "id": "16883",
      "name": "Ryan Heden",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-heden/16883",
      "tfrrsId": "9200665"
    },
    {
      "id": "16976",
      "name": "Gage Heyne",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "North English, Iowa",
      "highSchool": "English Valleys",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gage-heyne/16976",
      "tfrrsId": "9200670"
    },
    {
      "id": "16885",
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "year": "Gr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/16885",
      "tfrrsId": "8585415"
    },
    {
      "id": "16932",
      "name": "Garrison Hubka",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Spring Valley, Minn.",
      "highSchool": "Kingsland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/garrison-hubka/16932",
      "tfrrsId": "8585420"
    },
    {
      "id": "16980",
      "name": "Wes Hulseberg",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Williamsburg, Iowa",
      "highSchool": "Williamsburg",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wes-hulseberg/16980",
      "tfrrsId": "8896796"
    },
    {
      "id": "16982",
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/16982",
      "tfrrsId": "8585410"
    },
    {
      "id": "16936",
      "name": "Nathan Kinzer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-kinzer/16936",
      "tfrrsId": "8585417"
    },
    {
      "id": "16891",
      "name": "Caden Kueker",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/16891",
      "tfrrsId": "8896804"
    },
    {
      "id": "17904",
      "name": "Riley Kuhn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/riley-kuhn/17904",
      "tfrrsId": "9445711"
    },
    {
      "id": "17020",
      "name": "Kasey Levinsohn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Sheboygan, Wisconsin",
      "highSchool": "North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/kasey-levinsohn/17020",
      "tfrrsId": "9444009"
    },
    {
      "id": "17021",
      "name": "Jackson Lewis",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jackson-lewis/17021",
      "tfrrsId": "9444003"
    },
    {
      "id": "16985",
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/16985",
      "tfrrsId": "8585409"
    },
    {
      "id": "16939",
      "name": "Connor Martin",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-martin/16939",
      "tfrrsId": "9200678"
    },
    {
      "id": "16987",
      "name": "Rylan Martin",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/rylan-martin/16987",
      "tfrrsId": "8585419"
    },
    {
      "id": "17022",
      "name": "James Maso",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Plainfield, Illinois",
      "highSchool": "Plainfield North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/james-maso/17022",
      "tfrrsId": "9444007"
    },
    {
      "id": "17023",
      "name": "Myles Matthias",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/myles-matthias/17023",
      "tfrrsId": "9444011"
    },
    {
      "id": "16895",
      "name": "Jonathan Meyer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jonathan-meyer/16895",
      "tfrrsId": "8585436"
    },
    {
      "id": "16989",
      "name": "Nathan Moore",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Wylie, Tex.",
      "highSchool": "Wylie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-moore/16989",
      "tfrrsId": "8896790"
    },
    {
      "id": "16943",
      "name": "Drew Moser",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Clinton, Ill.",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/16943",
      "tfrrsId": "8896795"
    },
    {
      "id": "16991",
      "name": "Carter Mulford",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-mulford/16991",
      "tfrrsId": "9200677"
    },
    {
      "id": "16899",
      "name": "Ben Neville",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Urbandale, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/16899",
      "tfrrsId": "8896800"
    },
    {
      "id": "17024",
      "name": "Henry Nichols",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Silver Spring, Maryland",
      "highSchool": "Northwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/henry-nichols/17024",
      "tfrrsId": "9444001"
    },
    {
      "id": "16993",
      "name": "Caleb Olson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "DeWitt, Iowa",
      "highSchool": "Central DeWitt",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-olson/16993",
      "tfrrsId": "9200668"
    },
    {
      "id": "16947",
      "name": "Brendan Owens",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/16947",
      "tfrrsId": "8896793"
    },
    {
      "id": "16903",
      "name": "Alex Pries",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/16903",
      "tfrrsId": "8896792"
    },
    {
      "id": "17025",
      "name": "Joel Ramirez-Parra",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Storm Lake, Iowa",
      "highSchool": "Storm Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joel-ramirez-parra/17025",
      "tfrrsId": "9444005"
    },
    {
      "id": "16997",
      "name": "Jakob Regennitter",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jakob-regennitter/16997",
      "tfrrsId": "8585421"
    },
    {
      "id": "17030",
      "name": "Logan Rosas",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Oakville, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/logan-rosas/17030",
      "tfrrsId": "9445700"
    },
    {
      "id": "16951",
      "name": "AJ Schermerhorn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-schermerhorn/16951",
      "tfrrsId": "9200676"
    },
    {
      "id": "16906",
      "name": "Sawyer Schmidt",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sawyer-schmidt/16906",
      "tfrrsId": "8896826"
    },
    {
      "id": "17000",
      "name": "Andrew Smith",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Glenwood, Iowa",
      "highSchool": "Glenwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/17000",
      "tfrrsId": "8896788"
    },
    {
      "id": "16908",
      "name": "Austin  Soldwisch",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/austin-soldwisch/16908",
      "tfrrsId": "9200672"
    },
    {
      "id": "17002",
      "name": "Clay Warson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/17002",
      "tfrrsId": "8896798"
    },
    {
      "id": "17027",
      "name": "Simon Wendel",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/simon-wendel/17027",
      "tfrrsId": "9444006"
    },
    {
      "id": "16956",
      "name": "Nolan Wieneke",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Juneau, Wis.",
      "highSchool": "Dodgeland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nolan-wieneke/16956",
      "tfrrsId": "9200667"
    },
    {
      "id": "17028",
      "name": "Adam Wilke",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "De Witt, Iowa",
      "highSchool": "Central Dewitt",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-wilke/17028",
      "tfrrsId": "9444015"
    },
    {
      "id": "17004",
      "name": "Solomon Zaugg",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/solomon-zaugg/17004",
      "tfrrsId": "8896808"
    },
    {
      "id": "16838",
      "name": "Jade Anderson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Des Moines Lincoln",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jade-anderson/16838",
      "tfrrsId": "8700372"
    },
    {
      "id": "16839",
      "name": "Abbey Angus",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/16839",
      "tfrrsId": "8896839"
    },
    {
      "id": "16840",
      "name": "Sydney Bochmann",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sydney-bochmann/16840",
      "tfrrsId": "8896838"
    },
    {
      "id": "16841",
      "name": "Jillian Borgelt",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Waunakee, Wis.",
      "highSchool": "Waunakee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jillian-borgelt/16841",
      "tfrrsId": "9200728"
    },
    {
      "id": "16842",
      "name": "Nadia Bowden",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln Way Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nadia-bowden/16842",
      "tfrrsId": "8896829"
    },
    {
      "id": "16865",
      "name": "Julia Burney",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Aurora, Ill.",
      "highSchool": "Oswego East",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/julia-burney/16865",
      "tfrrsId": "9444025"
    },
    {
      "id": "16977",
      "name": "Reagan Cogdill",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Woodbine, Iowa",
      "highSchool": "Woodbine",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/reagan-cogdill/16977",
      "tfrrsId": "9444026"
    },
    {
      "id": "16843",
      "name": "Lily  Cooper",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-cooper/16843",
      "tfrrsId": "9200730"
    },
    {
      "id": "17005",
      "name": "Zoe Cordes",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Waconia, Minn.",
      "highSchool": "Waconia",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/zoe-cordes/17005",
      "tfrrsId": "9444027"
    },
    {
      "id": "16844",
      "name": "Morgan Engel",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Syosset, N.Y.",
      "highSchool": "Syosset",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/morgan-engel/16844",
      "tfrrsId": "8700379"
    },
    {
      "id": "16845",
      "name": "Janae Hansen",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Mason City, Iowa",
      "highSchool": "Mason City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janae-hansen/16845",
      "tfrrsId": "9200727"
    },
    {
      "id": "16846",
      "name": "Makenna Hetrick",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/makenna-hetrick/16846",
      "tfrrsId": "8896830"
    },
    {
      "id": "17006",
      "name": "Alyssa Higgins",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Galesburg, Ill.",
      "highSchool": "Knoxville",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alyssa-higgins/17006",
      "tfrrsId": "9444028"
    },
    {
      "id": "16847",
      "name": "Claire Hoyer",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/claire-hoyer/16847",
      "tfrrsId": "9200724"
    },
    {
      "id": "16848",
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/16848",
      "tfrrsId": "8700382"
    },
    {
      "id": "17008",
      "name": "Lillyan Kiehne",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Harmony, Minn.",
      "highSchool": "Fillmore Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lillyan-kiehne/17008",
      "tfrrsId": "9444029"
    },
    {
      "id": "16850",
      "name": "Lydia Maas",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Hampton, Iowa",
      "highSchool": "Hampton-Dumont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lydia-maas/16850",
      "tfrrsId": "8896833"
    },
    {
      "id": "16851",
      "name": "Leah McDonald",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Wellington, Colo.",
      "highSchool": "Poudre",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/leah-mcdonald/16851",
      "tfrrsId": "9200729"
    },
    {
      "id": "16853",
      "name": "Peyton Morey",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/peyton-morey/16853",
      "tfrrsId": "9200732"
    },
    {
      "id": "",
      "name": "Zaya Peirce",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Lewistown, Ill.",
      "highSchool": "Lewistown",
      "profileUrl": "https://go-knights.net",
      "tfrrsId": "8896844"
    },
    {
      "id": "16855",
      "name": "Marissa Pewe",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/marissa-pewe/16855",
      "tfrrsId": "9200731"
    },
    {
      "id": "16856",
      "name": "Megan Pickar",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "New Hampton, Iowa",
      "highSchool": "New Hampton",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/megan-pickar/16856",
      "tfrrsId": "8896840"
    },
    {
      "id": "17009",
      "name": "Madison Popelar",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Edwardsville, Ill.",
      "highSchool": "Edwardsville",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/madison-popelar/17009",
      "tfrrsId": "9444030"
    },
    {
      "id": "16857",
      "name": "Anna Quillin",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Solon, Iowa",
      "highSchool": "Solon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/16857",
      "tfrrsId": "8904663"
    },
    {
      "id": "16858",
      "name": "Hannah Ramsey",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hannah-ramsey/16858",
      "tfrrsId": "8700388"
    },
    {
      "id": "17010",
      "name": "Stella Rose",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Swisher, Iowa",
      "highSchool": "Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/stella-rose/17010",
      "tfrrsId": "9444031"
    },
    {
      "id": "17011",
      "name": "Addie Thompson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "State Center, Iowa",
      "highSchool": "West Marshall Community",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addie-thompson/17011",
      "tfrrsId": "9444032"
    },
    {
      "id": "16859",
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/16859",
      "tfrrsId": "8700393"
    },
    {
      "id": "16860",
      "name": "Lailah Utnage",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Italy, Texas",
      "highSchool": "Alvarado",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lailah-utnage/16860",
      "tfrrsId": "9200733"
    },
    {
      "id": "16861",
      "name": "Ava Vance",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Huxley, Iowa",
      "highSchool": "Ballard",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/16861",
      "tfrrsId": "8896837"
    },
    {
      "id": "16862",
      "name": "Ava Vanderheyden",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Nevada, Iowa",
      "highSchool": "Nevada",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vanderheyden/16862",
      "tfrrsId": "9200722"
    },
    {
      "id": "16863",
      "name": "Grace Vortherms",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Austin, Minn.",
      "highSchool": "Austin",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/grace-vortherms/16863",
      "tfrrsId": "8896832"
    },
    {
      "id": "16864",
      "name": "Bethany Warren",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bethany-warren/16864",
      "tfrrsId": "9200723"
    },
    {
      "id": "17012",
      "name": "Bryn Wright",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Morning Sun, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bryn-wright/17012",
      "tfrrsId": "9444033"
    },
    {
      "id": "17013",
      "name": "Maya Zopel",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Dunlap, Ill.",
      "highSchool": "Peoria Notre Dame",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maya-zopel/17013",
      "tfrrsId": "9444034"
    }
  ]
}
```

### `src/data/roster_history.json`

```json
{
  "generatedAt": "2026-09-13T02:32:32.432Z",
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster",
    "https://go-knights.net/sports/womens-cross-country/roster"
  ],
  "totalAthletes": 365,
  "athletes": [
    {
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12944",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/12944"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14930",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/14930"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15962",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/15962"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16985",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/16985"
        }
      ]
    },
    {
      "name": "Aaron Monroe",
      "team": "mens-cross-country",
      "hometown": "Newton, Iowa",
      "highSchool": "Newton",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Jr.",
          "id": "164",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-monroe/164"
        }
      ]
    },
    {
      "name": "Aaron O'Leary",
      "team": "mens-cross-country",
      "hometown": "Waterloo, Iowa",
      "highSchool": "Waterloo West",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6476",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-o-leary/6476"
        }
      ]
    },
    {
      "name": "Abbey Angus",
      "team": "womens-cross-country",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14889",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/14889"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15903",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/15903"
        }
      ]
    },
    {
      "name": "Abigail Mokhtary",
      "team": "womens-cross-country",
      "hometown": "St. Stephen",
      "highSchool": "Holdingford",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6456",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abigail-mokhtary/6456"
        }
      ]
    },
    {
      "name": "Adam Best",
      "team": "mens-cross-country",
      "hometown": "Waucoma, IA",
      "highSchool": "Turkey Valley",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "152",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-best/152"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "903",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-best/903"
        },
        {
          "season": 2012,
          "classYear": "Jr.",
          "id": "1912",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-best/1912"
        }
      ]
    },
    {
      "name": "Adam Wilke",
      "team": "mens-cross-country",
      "hometown": "De Witt, Iowa",
      "highSchool": "Central Dewitt",
      "seasons": [
        {
          "season": 2026,
          "classYear": "Fr.",
          "id": "17028",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-wilke/17028"
        }
      ]
    },
    {
      "name": "Addy Carlson",
      "team": "womens-cross-country",
      "hometown": "Saint Ansgar, Iowa",
      "highSchool": "Saint Ansgar",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8154",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/8154"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8926",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/8926"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10834",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/10834"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11649",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/11649"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12876",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/addy-carlson/12876"
        }
      ]
    },
    {
      "name": "Ahmed Aldamak",
      "team": "mens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14949",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/14949"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15937",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/15937"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16913",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/16913"
        }
      ]
    },
    {
      "name": "Aidan Decker",
      "team": "mens-cross-country",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Liberty",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14954",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/14954"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15946",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/15946"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16969",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/16969"
        }
      ]
    },
    {
      "name": "Aidan Feda",
      "team": "mens-cross-country",
      "hometown": "Rochester, Minnesota",
      "highSchool": "John Marshall",
      "seasons": [
        {
          "season": 2026,
          "classYear": "Fr.",
          "id": "17018",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-feda/17018"
        }
      ]
    },
    {
      "name": "Aiden Housman",
      "team": "mens-cross-country",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8909",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/8909"
        },
        {
          "season": 2021,
          "classYear": "So.",
          "id": "10874",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/10874"
        },
        {
          "season": 2022,
          "classYear": "Jr.",
          "id": "11610",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/11610"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12909",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/12909"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14922",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aiden-housman/14922"
        }
      ]
    },
    {
      "name": "AJ Angus",
      "team": "mens-cross-country",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14950",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/14950"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15938",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/15938"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16914",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/16914"
        }
      ]
    },
    {
      "name": "AJ Kendrick",
      "team": "womens-cross-country",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Linn-Mar",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8155",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aj-kendrick/8155"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8938",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aj-kendrick/8938"
        }
      ]
    },
    {
      "name": "AJ Schermerhorn",
      "team": "mens-cross-country",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15992",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-schermerhorn/15992"
        },
        {
          "season": 2026,
          "classYear": "So.",
          "id": "16951",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-schermerhorn/16951"
        }
      ]
    },
    {
      "name": "Alana Enabnit",
      "team": "womens-cross-country",
      "hometown": "Clear Lake, Iowa",
      "highSchool": "Clear Lake",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "937",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alana-enabnit/937"
        }
      ]
    },
    {
      "name": "Alec Ille",
      "team": "mens-cross-country",
      "hometown": "Blooming Prairie, Minn.",
      "highSchool": "Blooming Prairie",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7327",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/7327"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8099",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/8099"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8888",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/8888"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10875",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/10875"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11612",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alec-ille/11612"
        }
      ]
    },
    {
      "name": "Alex Childs",
      "team": "womens-cross-country",
      "hometown": "Fremont, Calif.",
      "highSchool": "James Logan",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7335",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alex-childs/7335"
        }
      ]
    },
    {
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12940",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/12940"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14921",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/14921"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15952",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/15952"
        },
        {
          "season": 2026,
          "classYear": "Gr.",
          "id": "16885",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/16885"
        }
      ]
    },
    {
      "name": "Alex Pries",
      "team": "mens-cross-country",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14964",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/14964"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15971",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/15971"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16903",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/16903"
        }
      ]
    },
    {
      "name": "Alexander Lawrence",
      "team": "mens-cross-country",
      "hometown": "Stewartville, Minn.",
      "highSchool": "Stewartville",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8116",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alexander-lawrence/8116"
        }
      ]
    },
    {
      "name": "Ali Ali",
      "team": "mens-cross-country",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Iowa City West",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6480",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/6480"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7257",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/7257"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8084",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/8084"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "8876",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/8876"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10860",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ali-ali/10860"
        }
      ]
    },
    {
      "name": "Alison  Rusch",
      "team": "womens-cross-country",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Wahlert",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Jr.",
          "id": "6457",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alison-rusch/6457"
        },
        {
          "season": 2018,
          "classYear": "Sr.",
          "id": "7255",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alison-rusch/7255"
        }
      ]
    },
    {
      "name": "Alison Kilburg",
      "team": "womens-cross-country",
      "hometown": "Tipton",
      "highSchool": "Tipton",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "191",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alison-kilburg/191"
        }
      ]
    },
    {
      "name": "Alissa Neubauer",
      "team": "womens-cross-country",
      "hometown": "Swisher, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7341",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/7341"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8148",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/8148"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8942",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/8942"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10845",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alissa-neubauer/10845"
        }
      ]
    },
    {
      "name": "Allegra  Knudson",
      "team": "womens-cross-country",
      "hometown": "Manly, Iowa",
      "highSchool": "Central Springs",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8156",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/8156"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8939",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/8939"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10842",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/10842"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11654",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allegra-knudson/11654"
        }
      ]
    },
    {
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11668",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/11668"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12880",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/12880"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14880",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/14880"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15911",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/15911"
        }
      ]
    },
    {
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11667",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/11667"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12891",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/12891"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14887",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/14887"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15922",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/15922"
        }
      ]
    },
    {
      "name": "Alyssa Chyma",
      "team": "womens-cross-country",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama County",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10855",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alyssa-chyma/10855"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11650",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/alyssa-chyma/11650"
        }
      ]
    },
    {
      "name": "Ander Julian",
      "team": "mens-cross-country",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12932",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/12932"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14924",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/14924"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15955",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ander-julian/15955"
        }
      ]
    },
    {
      "name": "Andrew Ellison",
      "team": "mens-cross-country",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline Senior",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7324",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/7324"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8093",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/8093"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8883",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/8883"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10867",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/10867"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11602",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-ellison/11602"
        }
      ]
    },
    {
      "name": "Andrew Poock",
      "team": "mens-cross-country",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10919",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/10919"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11622",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/11622"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12921",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/12921"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14938",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-poock/14938"
        }
      ]
    },
    {
      "name": "Andrew Smith",
      "team": "mens-cross-country",
      "hometown": "Glenwood, Iowa",
      "highSchool": "Glenwood",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14965",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/14965"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15978",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/15978"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "17000",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/17000"
        }
      ]
    },
    {
      "name": "Andy Strachan",
      "team": "mens-cross-country",
      "hometown": "Ankeny",
      "highSchool": "Ankeny",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Jr.",
          "id": "173",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andy-strachan/173"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "925",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andy-strachan/925"
        }
      ]
    },
    {
      "name": "Anna Hertz",
      "team": "womens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7338",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/7338"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8143",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/8143"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8937",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/8937"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10840",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-hertz/10840"
        }
      ]
    },
    {
      "name": "Anna Keith",
      "team": "womens-cross-country",
      "hometown": "Sioux Center",
      "highSchool": "Sioux Center",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Sr.",
          "id": "189",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-keith/189"
        }
      ]
    },
    {
      "name": "Anna Quillin",
      "team": "womens-cross-country",
      "hometown": "Solon, Iowa",
      "highSchool": "Solon",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "15417",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/15417"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15919",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/15919"
        }
      ]
    },
    {
      "name": "April Magneson",
      "team": "womens-cross-country",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Lincoln",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "1058",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/april-magneson/1058"
        }
      ]
    },
    {
      "name": "Arielle Brown",
      "team": "womens-cross-country",
      "hometown": "Ottumwa, Iowa",
      "highSchool": "Ottumwa",
      "seasons": [
        {
          "season": 2010,
          "classYear": "So.",
          "id": "181",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/arielle-brown/181"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "933",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/arielle-brown/933"
        }
      ]
    },
    {
      "name": "Arthur Meyers",
      "team": "mens-cross-country",
      "hometown": "Redlands, Calif.",
      "highSchool": "Redlands East Valley",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10917",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/10917"
        },
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11618",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/11618"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12916",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/12916"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14933",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/arthur-meyers/14933"
        }
      ]
    },
    {
      "name": "Aryka Parsons",
      "team": "womens-cross-country",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Jr.",
          "id": "6467",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aryka-parsons/6467"
        }
      ]
    },
    {
      "name": "Ashley  Bloomquist",
      "team": "womens-cross-country",
      "hometown": "Fairfield, Iowa",
      "highSchool": "Fairfield",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8157",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/8157"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8923",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/8923"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10830",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/10830"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11646",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/11646"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12873",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-bloomquist/12873"
        }
      ]
    },
    {
      "name": "Ashley Stevens",
      "team": "womens-cross-country",
      "hometown": "Windsor Heights, Iowa",
      "highSchool": "Des Moines Christian",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Jr.",
          "id": "6459",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-stevens/6459"
        },
        {
          "season": 2018,
          "classYear": "Sr.",
          "id": "7256",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashley-stevens/7256"
        }
      ]
    },
    {
      "name": "Ashlyn Bagge",
      "team": "womens-cross-country",
      "hometown": "Independence, Iowa",
      "highSchool": "Independence",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6443",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ashlyn-bagge/6443"
        }
      ]
    },
    {
      "name": "Aubrie Fisher",
      "team": "womens-cross-country",
      "hometown": "Ackley, Iowa",
      "highSchool": "AGWSR",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8158",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/8158"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8933",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/8933"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10838",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/10838"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11651",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/11651"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12877",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/aubrie-fisher/12877"
        }
      ]
    },
    {
      "name": "Audra Mulholland",
      "team": "womens-cross-country",
      "hometown": "Mason City, Iowa",
      "highSchool": "Mason City",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14900",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/audra-mulholland/14900"
        }
      ]
    },
    {
      "name": "Audrey Weidman",
      "team": "womens-cross-country",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "St. Albert",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Jr.",
          "id": "202",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/audrey-weidman/202"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "961",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/audrey-weidman/961"
        }
      ]
    },
    {
      "name": "Austin  Soldwisch",
      "team": "mens-cross-country",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15993",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/austin-soldwisch/15993"
        },
        {
          "season": 2026,
          "classYear": "So.",
          "id": "16908",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/austin-soldwisch/16908"
        }
      ]
    },
    {
      "name": "Ava Vance",
      "team": "womens-cross-country",
      "hometown": "Huxley, Iowa",
      "highSchool": "Ballard",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14904",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/14904"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15924",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/15924"
        }
      ]
    },
    {
      "name": "Ava Vanderheyden",
      "team": "womens-cross-country",
      "hometown": "Nevada, Iowa",
      "highSchool": "Nevada",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15935",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vanderheyden/15935"
        }
      ]
    },
    {
      "name": "Ayden Buchanan",
      "team": "mens-cross-country",
      "hometown": "Santa Clarita, Calif.",
      "highSchool": "Valencia",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14951",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/14951"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15941",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/15941"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16963",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/16963"
        }
      ]
    },
    {
      "name": "Bekah Holten",
      "team": "womens-cross-country",
      "hometown": "Plymouth, MN",
      "highSchool": "Osseo",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "186",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bekah-holten/186"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "942",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bekah-holten/942"
        }
      ]
    },
    {
      "name": "Ben Coleman",
      "team": "mens-cross-country",
      "hometown": "St. Louis Park, Minn.",
      "highSchool": "St. Louis Park",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6471",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-coleman/6471"
        }
      ]
    },
    {
      "name": "Ben Hackbart",
      "team": "mens-cross-country",
      "hometown": "Plymouth, Minn.",
      "highSchool": "Plymouth",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Sr.",
          "id": "155",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-hackbart/155"
        }
      ]
    },
    {
      "name": "Ben Neville",
      "team": "mens-cross-country",
      "hometown": "Urbandale, Iowa",
      "highSchool": "Johnston",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14963",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/14963"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15967",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/15967"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16899",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/16899"
        }
      ]
    },
    {
      "name": "Benjamin Rhodes",
      "team": "mens-cross-country",
      "hometown": "Silvis, Ill.",
      "highSchool": "United Township",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8914",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/benjamin-rhodes/8914"
        }
      ]
    },
    {
      "name": "Bennett Moser",
      "team": "mens-cross-country",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "seasons": [
        {
          "season": 2012,
          "classYear": "Fr.",
          "id": "1924",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bennett-moser/1924"
        }
      ]
    },
    {
      "name": "Bert Cortez",
      "team": "mens-cross-country",
      "hometown": "Lone Tree, Iowa",
      "highSchool": "Lone Tree",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10902",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/10902"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11600",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/11600"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12900",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/12900"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14909",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/bert-cortez/14909"
        }
      ]
    },
    {
      "name": "Beth Mallon",
      "team": "womens-cross-country",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport Assumption",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6453",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/beth-mallon/6453"
        }
      ]
    },
    {
      "name": "Bethany Tapp",
      "team": "womens-cross-country",
      "hometown": "Mediapolis",
      "highSchool": "Mediapolis",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "959",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bethany-tapp/959"
        }
      ]
    },
    {
      "name": "Bethany Warren",
      "team": "womens-cross-country",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15936",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bethany-warren/15936"
        }
      ]
    },
    {
      "name": "Brad Bogardus",
      "team": "mens-cross-country",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Sr.",
          "id": "153",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brad-bogardus/153"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "904",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brad-bogardus/904"
        }
      ]
    },
    {
      "name": "Braden Burger",
      "team": "mens-cross-country",
      "hometown": "Shakopee, Minn.",
      "highSchool": "Shakopee",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12934",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/12934"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14908",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/14908"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15942",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/braden-burger/15942"
        }
      ]
    },
    {
      "name": "Brandi Antonio",
      "team": "womens-cross-country",
      "hometown": "Deerfield Beach, Fla.",
      "highSchool": "Pope John Paul II",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7333",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/7333"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8129",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/8129"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8920",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/8920"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10829",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brandi-antonio/10829"
        }
      ]
    },
    {
      "name": "Brandon Culmore",
      "team": "mens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "NU High",
      "seasons": [
        {
          "season": 2012,
          "classYear": "Fr.",
          "id": "1915",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brandon-culmore/1915"
        }
      ]
    },
    {
      "name": "Brandon Hosch",
      "team": "mens-cross-country",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "158",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brandon-hosch/158"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "908",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brandon-hosch/908"
        },
        {
          "season": 2012,
          "classYear": "Jr.",
          "id": "1929",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brandon-hosch/1929"
        }
      ]
    },
    {
      "name": "Brendan Owens",
      "team": "mens-cross-country",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "15406",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/15406"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15969",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/15969"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16947",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/16947"
        }
      ]
    },
    {
      "name": "Brendan Rader",
      "team": "mens-cross-country",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Kennedy",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11998",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/11998"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12923",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/12923"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14940",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/14940"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15973",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-rader/15973"
        }
      ]
    },
    {
      "name": "Bri Bower",
      "team": "womens-cross-country",
      "hometown": "Montgomery, Ill.",
      "highSchool": "Mapke Park-Kaneland",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Jr.",
          "id": "7344",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bri-bower/7344"
        }
      ]
    },
    {
      "name": "Brice Rhodes",
      "team": "mens-cross-country",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Herbert Hoover",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8118",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/8118"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8897",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/8897"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10884",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/10884"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11623",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brice-rhodes/11623"
        }
      ]
    },
    {
      "name": "Brielle Ruch",
      "team": "womens-cross-country",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Urbandale",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10859",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brielle-ruch/10859"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11663",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/brielle-ruch/11663"
        }
      ]
    },
    {
      "name": "Brody Burr",
      "team": "mens-cross-country",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "Dowling Catholic",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15995",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brody-burr/15995"
        }
      ]
    },
    {
      "name": "Caden Kueker",
      "team": "mens-cross-country",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "seasons": [
        {
          "season": 2024,
          "classYear": "So.",
          "id": "15407",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/15407"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15960",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/15960"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16891",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/16891"
        }
      ]
    },
    {
      "name": "Caleb Appleton",
      "team": "mens-cross-country",
      "hometown": "Bemidji, Minn.",
      "highSchool": "Bemidji",
      "seasons": [
        {
          "season": 2017,
          "classYear": "So.",
          "id": "6469",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/6469"
        },
        {
          "season": 2018,
          "classYear": "Jr.",
          "id": "7258",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/7258"
        },
        {
          "season": 2019,
          "classYear": "Sr.",
          "id": "8085",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-appleton/8085"
        }
      ]
    },
    {
      "name": "Caleb Olson",
      "team": "mens-cross-country",
      "hometown": "DeWitt, Iowa",
      "highSchool": "Central DeWitt",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15990",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-olson/15990"
        },
        {
          "season": 2026,
          "classYear": "So.",
          "id": "16993",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-olson/16993"
        }
      ]
    },
    {
      "name": "Caleb Stiles",
      "team": "mens-cross-country",
      "hometown": "Juneau, Alaska",
      "highSchool": "Thunder Mountain",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12948",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-stiles/12948"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14947",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-stiles/14947"
        }
      ]
    },
    {
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12895",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/12895"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14888",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/14888"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15923",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/15923"
        }
      ]
    },
    {
      "name": "Callum Brittain",
      "team": "mens-cross-country",
      "hometown": "White River Junction, Ver.",
      "highSchool": "Hartford",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7322",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/7322"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8087",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/8087"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10896",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/10896"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11597",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/callum-brittain/11597"
        }
      ]
    },
    {
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12942",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/12942"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14925",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/14925"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15956",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/15956"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16982",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/16982"
        }
      ]
    },
    {
      "name": "Cameron Noreen",
      "team": "mens-cross-country",
      "hometown": "Lincoln, Calif.",
      "highSchool": "Lincoln",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11638",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/11638"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12919",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/12919"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14936",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/14936"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15968",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cameron-noreen/15968"
        }
      ]
    },
    {
      "name": "Carina Collet",
      "team": "womens-cross-country",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6464",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/6464"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7246",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/7246"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8136",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/8136"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "8928",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/8928"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10835",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carina-collet/10835"
        }
      ]
    },
    {
      "name": "Carlene Hamilton",
      "team": "womens-cross-country",
      "hometown": "Mesa, Ariz.",
      "highSchool": "Skyline",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8159",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/8159"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8935",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/8935"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10839",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/10839"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11652",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/carlene-hamilton/11652"
        }
      ]
    },
    {
      "name": "Carson Collet",
      "team": "mens-cross-country",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10901",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-collet/10901"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12898",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-collet/12898"
        }
      ]
    },
    {
      "name": "Carson Rygh",
      "team": "mens-cross-country",
      "hometown": "Lake Mills, Iowa",
      "highSchool": "Lake Mills Community",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8916",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/8916"
        },
        {
          "season": 2021,
          "classYear": "So.",
          "id": "10886",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/10886"
        },
        {
          "season": 2022,
          "classYear": "Jr.",
          "id": "11625",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/11625"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12925",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carson-rygh/12925"
        }
      ]
    },
    {
      "name": "Carter Cruise",
      "team": "mens-cross-country",
      "hometown": "Scotch Grove, Iowa",
      "highSchool": "Monticello",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8906",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/8906"
        },
        {
          "season": 2021,
          "classYear": "So.",
          "id": "10864",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/10864"
        },
        {
          "season": 2022,
          "classYear": "Jr.",
          "id": "11601",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/11601"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12901",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/12901"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14911",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-cruise/14911"
        }
      ]
    },
    {
      "name": "Carter Mulford",
      "team": "mens-cross-country",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15997",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-mulford/15997"
        },
        {
          "season": 2026,
          "classYear": "So.",
          "id": "16991",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-mulford/16991"
        }
      ]
    },
    {
      "name": "Casey Roberts",
      "team": "mens-cross-country",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Saydel",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Jr.",
          "id": "6477",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/casey-roberts/6477"
        },
        {
          "season": 2018,
          "classYear": "Sr.",
          "id": "7272",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/casey-roberts/7272"
        }
      ]
    },
    {
      "name": "Cassidy Christopher",
      "team": "womens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6462",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/6462"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7245",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/7245"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8135",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/8135"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "9021",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cassidy-christopher/9021"
        }
      ]
    },
    {
      "name": "Charlie Otto",
      "team": "womens-cross-country",
      "hometown": "Hinsdale, Ill.",
      "highSchool": "Hinsdale Central",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8160",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/8160"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8943",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/8943"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10846",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/charlie-otto/10846"
        }
      ]
    },
    {
      "name": "Chase Moser",
      "team": "mens-cross-country",
      "hometown": "Wapello, Iowa",
      "highSchool": "Wapello",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "916",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chase-moser/916"
        },
        {
          "season": 2012,
          "classYear": "So.",
          "id": "1936",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chase-moser/1936"
        }
      ]
    },
    {
      "name": "Chelsea Keninger",
      "team": "womens-cross-country",
      "hometown": "Ackley, IA",
      "highSchool": "AGWSR",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "188",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/chelsea-keninger/188"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "944",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/chelsea-keninger/944"
        }
      ]
    },
    {
      "name": "Chris Fenstermaker",
      "team": "mens-cross-country",
      "hometown": "Pacific Grove, Calif.",
      "highSchool": "Pacific Grove",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12937",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/12937"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14914",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/14914"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15948",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-fenstermaker/15948"
        }
      ]
    },
    {
      "name": "Chris Huinker",
      "team": "mens-cross-country",
      "hometown": "Calmar, IA",
      "highSchool": "South Winneshiek",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "910",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-huinker/910"
        },
        {
          "season": 2012,
          "classYear": "So.",
          "id": "1931",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-huinker/1931"
        }
      ]
    },
    {
      "name": "Chris Smith",
      "team": "mens-cross-country",
      "hometown": "Waterloo, IA",
      "highSchool": "West",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "171",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-smith/171"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "924",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-smith/924"
        },
        {
          "season": 2012,
          "classYear": "Jr.",
          "id": "1939",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/chris-smith/1939"
        }
      ]
    },
    {
      "name": "Christian Brothers",
      "team": "mens-cross-country",
      "hometown": "Nevarre, Fla.",
      "highSchool": "Nevarre",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6481",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christian-brothers/6481"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7259",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christian-brothers/7259"
        }
      ]
    },
    {
      "name": "Christian Kremer-Terry",
      "team": "mens-cross-country",
      "hometown": "Marshalltown, IA",
      "highSchool": "Marshalltown High School",
      "seasons": [
        {
          "season": 2012,
          "classYear": "Fr.",
          "id": "1922",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christian-kremer-terry/1922"
        }
      ]
    },
    {
      "name": "Christina Jellema",
      "team": "womens-cross-country",
      "hometown": "Mason City, IA",
      "highSchool": "Mason City",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "187",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/christina-jellema/187"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "943",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/christina-jellema/943"
        }
      ]
    },
    {
      "name": "Christopher Collet",
      "team": "mens-cross-country",
      "hometown": "Verona, Ill.",
      "highSchool": "Seneca",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8119",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/8119"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8878",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/8878"
        },
        {
          "season": 2021,
          "classYear": "Jr.",
          "id": "10862",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/10862"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11599",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/11599"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12899",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/christopher-collet/12899"
        }
      ]
    },
    {
      "name": "Claire Hoyer",
      "team": "womens-cross-country",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15929",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/claire-hoyer/15929"
        }
      ]
    },
    {
      "name": "Clare Davison",
      "team": "womens-cross-country",
      "hometown": "Carson City, Nev.",
      "highSchool": "Sierra Lutheran",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6463",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/6463"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7247",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/7247"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8137",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/8137"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "8929",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-davison/8929"
        }
      ]
    },
    {
      "name": "Clare Dunne",
      "team": "womens-cross-country",
      "hometown": "Coralville, Iowa",
      "highSchool": "Regina",
      "seasons": [
        {
          "season": 2019,
          "classYear": "Fr.",
          "id": "8153",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-dunne/8153"
        },
        {
          "season": 2020,
          "classYear": "So.",
          "id": "8931",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/clare-dunne/8931"
        }
      ]
    },
    {
      "name": "Clay Pehl",
      "team": "mens-cross-country",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Madrid",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10918",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/10918"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11621",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/11621"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12920",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/12920"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14937",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-pehl/14937"
        }
      ]
    },
    {
      "name": "Clay Warson",
      "team": "mens-cross-country",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14966",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/14966"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15981",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/15981"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "17002",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/17002"
        }
      ]
    },
    {
      "name": "Colin Greenwell",
      "team": "mens-cross-country",
      "hometown": "Sioux City, Iowa",
      "highSchool": "Sioux City North",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10905",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/10905"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11605",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/11605"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12905",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/12905"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14918",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-greenwell/14918"
        }
      ]
    },
    {
      "name": "Colin Meisenburg",
      "team": "mens-cross-country",
      "hometown": "Orion, Ill.",
      "highSchool": "Orion",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10916",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/colin-meisenburg/10916"
        }
      ]
    },
    {
      "name": "Collin Day",
      "team": "mens-cross-country",
      "hometown": "West Des Moines, Iowa",
      "highSchool": "West Des Moines Valley",
      "seasons": [
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7323",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/7323"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8091",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/8091"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "8881",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/8881"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10866",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/collin-day/10866"
        }
      ]
    },
    {
      "name": "Conner Sattler",
      "team": "mens-cross-country",
      "hometown": "Clinton, Iowa",
      "highSchool": "Clinton",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11640",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/11640"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12926",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/12926"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14943",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/14943"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15975",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conner-sattler/15975"
        }
      ]
    },
    {
      "name": "Connor Lancial",
      "team": "mens-cross-country",
      "hometown": "Council Bluffs, Iowa",
      "highSchool": "Lewis Central",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8911",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/8911"
        },
        {
          "season": 2021,
          "classYear": "So.",
          "id": "10878",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/10878"
        },
        {
          "season": 2022,
          "classYear": "Jr.",
          "id": "11616",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/11616"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12914",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/12914"
        },
        {
          "season": 2024,
          "classYear": "5th",
          "id": "14928",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-lancial/14928"
        }
      ]
    },
    {
      "name": "Connor Martin",
      "team": "mens-cross-country",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15989",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-martin/15989"
        },
        {
          "season": 2026,
          "classYear": "So.",
          "id": "16939",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-martin/16939"
        }
      ]
    },
    {
      "name": "Conor Sapp",
      "team": "mens-cross-country",
      "hometown": "Moline, Ill.",
      "highSchool": "Moline",
      "seasons": [
        {
          "season": 2017,
          "classYear": "So.",
          "id": "6478",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/6478"
        },
        {
          "season": 2018,
          "classYear": "Jr.",
          "id": "7273",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/7273"
        },
        {
          "season": 2019,
          "classYear": "Sr.",
          "id": "8108",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/conor-sapp/8108"
        }
      ]
    },
    {
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12933",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/12933"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14907",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/14907"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15940",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/15940"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16915",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/16915"
        }
      ]
    },
    {
      "name": "Cooper Cook",
      "team": "mens-cross-country",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14953",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/14953"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15944",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/15944"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16965",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/16965"
        }
      ]
    },
    {
      "name": "Cori Atten",
      "team": "womens-cross-country",
      "hometown": "Cuba City, Wis.",
      "highSchool": "Cuba City",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14890",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cori-atten/14890"
        }
      ]
    },
    {
      "name": "Curren Matthias",
      "team": "mens-cross-country",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6493",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/6493"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7269",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/7269"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "9005",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/curren-matthias/9005"
        }
      ]
    },
    {
      "name": "Dalton Martin",
      "team": "mens-cross-country",
      "hometown": "Rock Island, Ill.",
      "highSchool": "United Township",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7330",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/7330"
        },
        {
          "season": 2019,
          "classYear": "So.",
          "id": "8103",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/8103"
        },
        {
          "season": 2020,
          "classYear": "Jr.",
          "id": "8893",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/8893"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10881",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/10881"
        },
        {
          "season": 2022,
          "classYear": "Sr.",
          "id": "11617",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dalton-martin/11617"
        }
      ]
    },
    {
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12938",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/12938"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14915",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/14915"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15949",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/15949"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16972",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/16972"
        }
      ]
    },
    {
      "name": "Dax Duffy",
      "team": "mens-cross-country",
      "hometown": "Morton, Illinois",
      "highSchool": "Peoria Notre Dame",
      "seasons": [
        {
          "season": 2026,
          "classYear": "Fr.",
          "id": "17016",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dax-duffy/17016"
        }
      ]
    },
    {
      "name": "Debbie Nesvik",
      "team": "womens-cross-country",
      "hometown": "Ossian, IA",
      "highSchool": "South Winneshiek",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "193",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/debbie-nesvik/193"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "950",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/debbie-nesvik/950"
        }
      ]
    },
    {
      "name": "Derek  Franzen",
      "team": "mens-cross-country",
      "hometown": "Denver, IA",
      "highSchool": "Denver High School",
      "seasons": [
        {
          "season": 2012,
          "classYear": "Fr.",
          "id": "1916",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-franzen/1916"
        }
      ]
    },
    {
      "name": "Derek Beaumier",
      "team": "mens-cross-country",
      "hometown": "Algona, IA",
      "highSchool": "Algona",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Fr.",
          "id": "151",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-beaumier/151"
        },
        {
          "season": 2011,
          "classYear": "So.",
          "id": "902",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-beaumier/902"
        },
        {
          "season": 2012,
          "classYear": "Jr.",
          "id": "1911",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-beaumier/1911"
        }
      ]
    },
    {
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12935",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/12935"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14910",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/14910"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15945",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/15945"
        },
        {
          "season": 2026,
          "classYear": "Sr.",
          "id": "16967",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/16967"
        }
      ]
    },
    {
      "name": "Derek Schwanz",
      "team": "mens-cross-country",
      "hometown": "Inver Grove Heights, MN",
      "highSchool": "",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Jr.",
          "id": "923",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-schwanz/923"
        }
      ]
    },
    {
      "name": "Drew Hoffman",
      "team": "mens-cross-country",
      "hometown": "Manitowoc, Wis.",
      "highSchool": "Manitowoc Lincoln",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Fr.",
          "id": "6490",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/6490"
        },
        {
          "season": 2018,
          "classYear": "So.",
          "id": "7266",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/7266"
        },
        {
          "season": 2019,
          "classYear": "Jr.",
          "id": "8098",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/8098"
        },
        {
          "season": 2020,
          "classYear": "Sr.",
          "id": "9001",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/9001"
        },
        {
          "season": 2021,
          "classYear": "Sr.",
          "id": "10873",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-hoffman/10873"
        }
      ]
    },
    {
      "name": "Drew Moser",
      "team": "mens-cross-country",
      "hometown": "Clinton, Ill.",
      "highSchool": "Clinton",
      "seasons": [
        {
          "season": 2024,
          "classYear": "Fr.",
          "id": "14962",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/14962"
        },
        {
          "season": 2025,
          "classYear": "So.",
          "id": "15966",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/15966"
        },
        {
          "season": 2026,
          "classYear": "Jr.",
          "id": "16943",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/16943"
        }
      ]
    },
    {
      "name": "Eli Hedden",
      "team": "mens-cross-country",
      "hometown": "Madison, Wis.",
      "highSchool": "Madison Memorial",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7325",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-hedden/7325"
        }
      ]
    },
    {
      "name": "Eli Kaczinski",
      "team": "mens-cross-country",
      "hometown": "Charlotte, Iowa",
      "highSchool": "Northeast-Goose Lake",
      "seasons": [
        {
          "season": 2017,
          "classYear": "Sr.",
          "id": "6474",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-kaczinski/6474"
        }
      ]
    },
    {
      "name": "Eli Larson",
      "team": "mens-cross-country",
      "hometown": "Walker, Iowa",
      "highSchool": "Center Point-Urbana",
      "seasons": [
        {
          "season": 2022,
          "classYear": "Fr.",
          "id": "11637",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/11637"
        },
        {
          "season": 2023,
          "classYear": "So.",
          "id": "12915",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/12915"
        },
        {
          "season": 2024,
          "classYear": "Jr.",
          "id": "14929",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/14929"
        },
        {
          "season": 2025,
          "classYear": "Sr.",
          "id": "15961",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/eli-larson/15961"
        }
      ]
    },
    {
      "name": "Elissa Hageman",
      "team": "womens-cross-country",
      "hometown": "Fort Atkinson, Iowa",
      "highSchool": "Turkey Valley (Jackson Junction)",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Jr.",
          "id": "185",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/elissa-hageman/185"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "936",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/elissa-hageman/936"
        }
      ]
    },
    {
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "seasons": [
        {
          "season": 2023,
          "classYear": "Fr.",
          "id": "12894",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/12894"
        },
        {
          "season": 2024,
          "classYear": "So.",
          "id": "14879",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/14879"
        },
        {
          "season": 2025,
          "classYear": "Jr.",
          "id": "15910",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/15910"
        }
      ]
    },
    {
      "name": "Elli Parker",
      "team": "womens-cross-country",
      "hometown": "New Hartford, Iowa",
      "highSchool": "Dike New Hartford",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "951",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/elli-parker/951"
        }
      ]
    },
    {
      "name": "Ellie Meyer",
      "team": "womens-cross-country",
      "hometown": "Iowa Falls, Iowa",
      "highSchool": "Iowa Falls-Alden",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10857",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/10857"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11656",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/11656"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12882",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/12882"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14882",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ellie-meyer/14882"
        }
      ]
    },
    {
      "name": "Emily Eimers",
      "team": "womens-cross-country",
      "hometown": "Lone Rock, Iowa",
      "highSchool": "Algona",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Jr.",
          "id": "184",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-eimers/184"
        },
        {
          "season": 2011,
          "classYear": "Sr.",
          "id": "935",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-eimers/935"
        }
      ]
    },
    {
      "name": "Emily Long",
      "team": "womens-cross-country",
      "hometown": "Webster City, Iowa",
      "highSchool": "Webster City",
      "seasons": [
        {
          "season": 2010,
          "classYear": "Sr.",
          "id": "190",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-long/190"
        }
      ]
    },
    {
      "name": "Emily Richter",
      "team": "womens-cross-country",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Hempstead",
      "seasons": [
        {
          "season": 2021,
          "classYear": "Fr.",
          "id": "10858",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/10858"
        },
        {
          "season": 2022,
          "classYear": "So.",
          "id": "11662",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/11662"
        },
        {
          "season": 2023,
          "classYear": "Jr.",
          "id": "12889",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/12889"
        },
        {
          "season": 2024,
          "classYear": "Sr.",
          "id": "14886",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-richter/14886"
        }
      ]
    },
    {
      "name": "Emily Rogers",
      "team": "womens-cross-country",
      "hometown":

... [truncated, file is 251933 bytes, showing first 100000] ...
```

### `src/data/tfrrs_stats.json`

```json
{
  "4989878": {
    "name": "Gabrielle Marchino",
    "tfrrsId": "4989878",
    "fetchedAt": "2026-09-13T03:08:10.907Z",
    "bests": [
      {
        "event": "4K (XC)",
        "time": "16:42.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "20:19.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "24:07.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      }
    ]
  },
  "4989898": {
    "name": "Mitch Black",
    "tfrrsId": "4989898",
    "fetchedAt": "2026-09-13T03:07:34.128Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "17:25.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "21:44.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "8K (XC)",
        "time": "26:10.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      }
    ]
  },
  "5146929": {
    "name": "Ben Coleman",
    "tfrrsId": "5146929",
    "fetchedAt": "2026-09-13T03:07:35.789Z",
    "bests": [
      {
        "event": "800",
        "time": "2:32.95",
        "resultUrl": "https://www.tfrrs.org/results/45220/2756885/Wartburg_Outdoor_Select/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:10.94",
        "resultUrl": "https://www.tfrrs.org/results/38087/2332621/Wartburg_Indoor_Select/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:40.75",
        "resultUrl": "https://www.tfrrs.org/results/46497/2857705/Wartburg_Luther_Dual/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:10.55",
        "resultUrl": "https://www.tfrrs.org/results/43648/2668645/Wartburg_Indoor_Invite/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "10:45.21",
        "resultUrl": "https://www.tfrrs.org/results/52031/3283243/2018_Jack_Jennett_Open_/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "17:54.38",
        "resultUrl": "https://www.tfrrs.org/results/55829/3398121/Cornell_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "37:25.47",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456279/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "21:18.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "24:37.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "6.437K (XC)",
        "time": "27:21.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "30:36.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/11194/Iowa_Conference_Championships?meet_hnd=11194"
      }
    ]
  },
  "5146940": {
    "name": "Eli Kaczinski",
    "tfrrsId": "5146940",
    "fetchedAt": "2026-09-13T03:07:43.725Z",
    "bests": [
      {
        "event": "800",
        "time": "2:04.99",
        "resultUrl": "https://www.tfrrs.org/results/43286/2648743/Wartburg_Indoor_Select/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:01.23",
        "resultUrl": "https://www.tfrrs.org/results/46082/2823139/Phil_Esten_Challenge/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:22.16",
        "resultUrl": "https://www.tfrrs.org/results/52030/3266448/2018_Mark_Messersmith_Invitational_/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:39.39",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259079/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:22.42",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172360/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:42.97",
        "resultUrl": "https://www.tfrrs.org/results/51900/3195060/UW_La_Crosse_Final_Qualifier/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "30:30.83",
        "resultUrl": "https://www.tfrrs.org/results/51339/3138926/Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:14.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "20:04.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "8K (XC)",
        "time": "24:55.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/13424/NCAA_Division_III_Cross_Country_Championships?meet_hnd=13424"
      }
    ]
  },
  "5146950": {
    "name": "Aaron O'Leary",
    "tfrrsId": "5146950",
    "fetchedAt": "2026-09-13T03:07:47.966Z",
    "bests": [
      {
        "event": "800",
        "time": "2:01.54",
        "resultUrl": "https://www.tfrrs.org/results/40930/2513231/2015_Kip_Janvrin_Open/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:06.36",
        "resultUrl": "https://www.tfrrs.org/results/41099/2530432/Luther_vs_Wartburg_Dual/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:32.73",
        "resultUrl": "https://www.tfrrs.org/results/53729/3278526/Wartburg_Indoor_Select/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:05.67",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986365/Wartburg_Indoor_Invite/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:45.44",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:55.21",
        "resultUrl": "https://www.tfrrs.org/results/47710/3119185/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "33:23.01",
        "resultUrl": "https://www.tfrrs.org/results/50120/3052343/Augustana_College_Early_Spring_Opener/Mens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:41.73",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505862/Iowa_Conference_Outdoor_Championships/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "17:00.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "8K (XC)",
        "time": "26:05.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      }
    ]
  },
  "5146959": {
    "name": "Joel Toppin",
    "tfrrsId": "5146959",
    "fetchedAt": "2026-09-13T03:07:53.008Z",
    "bests": [
      {
        "event": "800",
        "time": "2:22.99",
        "resultUrl": "https://www.tfrrs.org/results/45220/2756885/Wartburg_Outdoor_Select/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:49.21",
        "resultUrl": "https://www.tfrrs.org/results/43286/2648739/Wartburg_Indoor_Select/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:12.82",
        "resultUrl": "https://www.tfrrs.org/results/41099/2530432/Luther_vs_Wartburg_Dual/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:35.86",
        "resultUrl": "https://www.tfrrs.org/results/37780/2342173/2015_Grinnell_Darren_Young_Indoor_Classic/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:23.11",
        "resultUrl": "https://www.tfrrs.org/results/38087/2332647/Wartburg_Indoor_Select/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:46.87",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172360/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:41.60",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456299/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:44.77",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190233/Iowa_Conference_Outdoor_Championships/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "16:52.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "20:51.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "8K (XC)",
        "time": "25:59.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      }
    ]
  },
  "5146966": {
    "name": "Maddie Carlsen",
    "tfrrsId": "5146966",
    "fetchedAt": "2026-09-13T03:07:59.058Z",
    "bests": [
      {
        "event": "400",
        "time": "1:01.78",
        "resultUrl": "https://www.tfrrs.org/results/50831/3098413/Ashton_May_Invitational/Womens-400-Meters"
      },
      {
        "event": "800",
        "time": "2:17.85",
        "resultUrl": "https://www.tfrrs.org/results/51901/3195149/Augustana_Midwest_Twilight_Final_Qualifier/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:09.54",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259090/Chelsey_M_Henkenius_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:49.96",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172359/Luther_vs_Wartburg_Dual/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:15.53",
        "resultUrl": "https://www.tfrrs.org/results/54249/3309556/Iowa_Conference_Indoor_Championships/Womens-Mile"
      },
      {
        "event": "400H",
        "time": "1:05.94",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190211/Iowa_Conference_Outdoor_Championships/Womens-400-Hurdles"
      },
      {
        "event": "3000S",
        "time": "12:01.49",
        "resultUrl": "https://www.tfrrs.org/results/56924/3511825/Augustana_Twilight_/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "17:22.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "21:23.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "25:46.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/10892/2016_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=10892"
      }
    ]
  },
  "5146969": {
    "name": "Miranda Fober",
    "tfrrsId": "5146969",
    "fetchedAt": "2026-09-13T03:08:03.372Z",
    "bests": [
      {
        "event": "800",
        "time": "2:52.10",
        "resultUrl": "https://www.tfrrs.org/results/45220/2756900/Wartburg_Outdoor_Select/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:32.90",
        "resultUrl": "https://www.tfrrs.org/results/44696/2805310/UW-Platteville_Invitational/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:59.14",
        "resultUrl": "https://www.tfrrs.org/results/43286/2648752/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:40.43",
        "resultUrl": "https://www.tfrrs.org/results/47550/2975576/2017_Darren_Young_Classic/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "20:32.00",
        "resultUrl": "https://www.tfrrs.org/results/50482/3074759/Wartburg_Outdoor_Select/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "12:27.12",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190257/Iowa_Conference_Outdoor_Championships/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "17:23.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "21:29.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "24:43.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      }
    ]
  },
  "5146976": {
    "name": "Maddie Kemp",
    "tfrrsId": "5146976",
    "fetchedAt": "2026-09-13T03:08:08.443Z",
    "bests": [
      {
        "event": "800",
        "time": "2:50.62",
        "resultUrl": "https://www.tfrrs.org/results/45220/2756900/Wartburg_Outdoor_Select/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:23.08",
        "resultUrl": "https://www.tfrrs.org/results/37926/2321972/Wartburg_Triangular/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "5:16.21",
        "resultUrl": "https://www.tfrrs.org/results/50831/3098421/Ashton_May_Invitational/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:35.10",
        "resultUrl": "https://www.tfrrs.org/results/38087/2332634/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:39.17",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172351/Luther_vs_Wartburg_Dual/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:55.08",
        "resultUrl": "https://www.tfrrs.org/results/47710/3119193/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "41:58.34",
        "resultUrl": "https://www.tfrrs.org/results/51339/3138944/Phil_Esten_Challenge/Womens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "12:52.45",
        "resultUrl": "https://www.tfrrs.org/results/40930/2513218/2015_Kip_Janvrin_Open/Womens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "21:11.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "24:50.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/11120/UW-Oshkosh_Kollege_Town_Sports_Invitational?meet_hnd=11120"
      }
    ]
  },
  "5146993": {
    "name": "Beth Mallon",
    "tfrrsId": "5146993",
    "fetchedAt": "2026-09-13T03:08:10.094Z",
    "bests": [
      {
        "event": "1500",
        "time": "5:05.29",
        "resultUrl": "https://www.tfrrs.org/results/46082/2823162/Phil_Esten_Challenge/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:43.86",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259083/Chelsey_M_Henkenius_Open/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:38.19",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986363/Wartburg_Indoor_Invite/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:11.31",
        "resultUrl": "https://www.tfrrs.org/results/56328/3510860/NCC_Gregory_Final_Qualifier/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:43.81",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505870/Iowa_Conference_Outdoor_Championships/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:52.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "22:37.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      },
      {
        "event": "8K (XC)",
        "time": "22:55.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      }
    ]
  },
  "5146998": {
    "name": "Meghan Silbernagel",
    "tfrrsId": "5146998",
    "fetchedAt": "2026-09-13T03:08:14.318Z",
    "bests": [
      {
        "event": "800",
        "time": "2:19.59",
        "resultUrl": "https://www.tfrrs.org/results/46497/2857691/Wartburg_Luther_Dual/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:09.62",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259090/Chelsey_M_Henkenius_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:46.79",
        "resultUrl": "https://www.tfrrs.org/results/46318/2842333/2016_Kip_Janvrin_Open/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:11.80",
        "resultUrl": "https://www.tfrrs.org/results/43788/2676839/Iowa_Conference_Indoor_Championships/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:29.64",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172351/Luther_vs_Wartburg_Dual/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:03.76",
        "resultUrl": "https://www.tfrrs.org/results/49295/3008885/Wartburg_Qualifier/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:32.16",
        "resultUrl": "https://www.tfrrs.org/results/51900/3195090/UW_La_Crosse_Final_Qualifier/Womens-3000-Steeplechase"
      },
      {
        "event": "1200",
        "time": "3:47.50",
        "resultUrl": "https://www.tfrrs.org/results/38461/2352610/Wartburg_Indoor_Invite/Womens-1200-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "16:48.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "19:54.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "22:51.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/9139/AAE_Invitational?meet_hnd=9139"
      },
      {
        "event": "8K (XC)",
        "time": "24:00.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      }
    ]
  },
  "5600619": {
    "name": "Nicole Breitbach",
    "tfrrsId": "5600619",
    "fetchedAt": "2026-09-13T03:07:58.191Z",
    "bests": [
      {
        "event": "800",
        "time": "2:28.72",
        "resultUrl": "https://www.tfrrs.org/results/48397/2953927/2017_Jack_Jennett_Open/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:15.35",
        "resultUrl": "https://www.tfrrs.org/results/48259/2946958/Chelsey_M_Henkenius_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:53.02",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172359/Luther_vs_Wartburg_Dual/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:17.69",
        "resultUrl": "https://www.tfrrs.org/results/60004/3651414/Wartburg_Qualifier/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:38.24",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986363/Wartburg_Indoor_Invite/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:22.39",
        "resultUrl": "https://www.tfrrs.org/results/49295/3008885/Wartburg_Qualifier/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:37.04",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456313/Phil_Esten_Challenge_at_UW-La_Crosse/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "17:03.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "20:12.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "23:10.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      },
      {
        "event": "8K (XC)",
        "time": "23:39.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:06.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5600620": {
    "name": "Haley  Harms",
    "tfrrsId": "5600620",
    "fetchedAt": "2026-09-13T03:08:06.779Z",
    "bests": [
      {
        "event": "800",
        "time": "2:35.33",
        "resultUrl": "https://www.tfrrs.org/results/48564/2965798/Wartburg_Indoor_Select/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:13.04",
        "resultUrl": "https://www.tfrrs.org/results/49923/3140780/Rittgers_Invitational/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:46.48",
        "resultUrl": "https://www.tfrrs.org/results/48564/2965791/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:24.99",
        "resultUrl": "https://www.tfrrs.org/results/47550/2975576/2017_Darren_Young_Classic/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:36.68",
        "resultUrl": "https://www.tfrrs.org/results/61152/3769454/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "45:11.78",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190241/Iowa_Conference_Outdoor_Championships/Womens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:59.03",
        "resultUrl": "https://www.tfrrs.org/results/62304/3808786/2019_Kip_Janvrin_Open/Womens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "20:40.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "24:13.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:47.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5600621": {
    "name": "Shaelyn McEnany",
    "tfrrsId": "5600621",
    "fetchedAt": "2026-09-13T03:08:11.837Z",
    "bests": [
      {
        "event": "800",
        "time": "2:31.69",
        "resultUrl": "https://www.tfrrs.org/results/43286/2648741/Wartburg_Indoor_Select/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:49.59",
        "resultUrl": "https://www.tfrrs.org/results/45597/2782787/Ashton_May_Invitational__UW-La_Crosse/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:21.64",
        "resultUrl": "https://www.tfrrs.org/results/43286/2648752/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:40.57",
        "resultUrl": "https://www.tfrrs.org/results/46497/2857697/Wartburg_Luther_Dual/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:07.87",
        "resultUrl": "https://www.tfrrs.org/results/46318/2842327/2016_Kip_Janvrin_Open/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "40:23.73",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505870/Iowa_Conference_Outdoor_Championships/Womens-10000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "16:39.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "20:06.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "23:01.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/13424/NCAA_Division_III_Cross_Country_Championships?meet_hnd=13424"
      },
      {
        "event": "8K (XC)",
        "time": "22:55.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      },
      {
        "event": "3 MILE (XC)",
        "time": "18:54.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5600622": {
    "name": "Alison  Rusch",
    "tfrrsId": "5600622",
    "fetchedAt": "2026-09-13T03:08:13.458Z",
    "bests": [
      {
        "event": "800",
        "time": "2:40.70",
        "resultUrl": "https://www.tfrrs.org/results/50831/3098416/Ashton_May_Invitational/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:19.16",
        "resultUrl": "https://www.tfrrs.org/results/50831/3098421/Ashton_May_Invitational/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:49.16",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986355/Wartburg_Indoor_Invite/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:34.63",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490538/Wartburg_Luther_Dual/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:43.74",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456321/Phil_Esten_Challenge_at_UW-La_Crosse/Womens-5000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "18:59.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "21:36.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "24:43.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      },
      {
        "event": "3 MILE (XC)",
        "time": "20:04.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5600623": {
    "name": "Ashley Stevens",
    "tfrrsId": "5600623",
    "fetchedAt": "2026-09-13T03:08:15.182Z",
    "bests": [
      {
        "event": "400",
        "time": "1:01.59",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490530/Wartburg_Luther_Dual/Womens-400-Meters"
      },
      {
        "event": "600",
        "time": "1:43.24",
        "resultUrl": "https://www.tfrrs.org/results/57559/3593368/Mark_Schuck_Open_and_Multi/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:17.05",
        "resultUrl": "https://www.tfrrs.org/results/62592/3840056/American_Rivers_Outdoor_Conference_Championships/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:14.71",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582644/Chelsey_M_Henkenius_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "5:02.46",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742635/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:40.40",
        "resultUrl": "https://www.tfrrs.org/results/48259/2946942/Chelsey_M_Henkenius_Open/Womens-Mile"
      },
      {
        "event": "4K (XC)",
        "time": "17:02.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "5K (XC)",
        "time": "20:35.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "23:13.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/14517/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=14517"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:36.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5600665": {
    "name": "Casey Roberts",
    "tfrrsId": "5600665",
    "fetchedAt": "2026-09-13T03:07:49.714Z",
    "bests": [
      {
        "event": "400",
        "time": "50.19",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490523/Wartburg_Luther_Dual/Mens-400-Meters"
      },
      {
        "event": "800",
        "time": "1:51.47",
        "resultUrl": "https://www.tfrrs.org/results/62627/3845723/NCAA_Final_Qualifier_at_UW-La_Crosse/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:31.13",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582629/Chelsey_M_Henkenius_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:51.77",
        "resultUrl": "https://www.tfrrs.org/results/56924/3511823/Augustana_Twilight_/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:10.99",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300271/Wartburg_Indoor_Invitational/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:56.56",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259079/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:11.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "20:53.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/7898/Linfield_Harrier_Classic?meet_hnd=7898"
      },
      {
        "event": "8K (XC)",
        "time": "25:23.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14517/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=14517"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "25:34.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "5873589": {
    "name": "Karl Jaeschke",
    "tfrrsId": "5873589",
    "fetchedAt": "2026-09-13T03:07:42.844Z",
    "bests": [
      {
        "event": "800",
        "time": "2:12.86",
        "resultUrl": "https://www.tfrrs.org/results/49923/3140769/Rittgers_Invitational/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:34.00",
        "resultUrl": "https://www.tfrrs.org/results/49923/3140790/Rittgers_Invitational/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:48.55",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259086/Chelsey_M_Henkenius_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:41.29",
        "resultUrl": "https://www.tfrrs.org/results/53729/3278568/Wartburg_Indoor_Select/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:45.30",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300252/Wartburg_Indoor_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:04.89",
        "resultUrl": "https://www.tfrrs.org/results/47710/3119203/UW-Platteville_Invitational/Mens-3000-Steeplechase"
      },
      {
        "event": "JT",
        "time": "45.49m",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190231/Iowa_Conference_Outdoor_Championships/Mens-Javelin"
      },
      {
        "event": "5K (XC)",
        "time": "18:09.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6.437K (XC)",
        "time": "24:58.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "28:24.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      }
    ]
  },
  "5982721": {
    "name": "Jackie Falconer",
    "tfrrsId": "5982721",
    "fetchedAt": "2026-09-13T03:08:02.489Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "21:54.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "25:51.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      },
      {
        "event": "3 MILE (XC)",
        "time": "21:20.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6139110": {
    "name": "Ashlyn Bagge",
    "tfrrsId": "6139110",
    "fetchedAt": "2026-09-13T03:07:57.304Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:48.27",
        "resultUrl": "https://www.tfrrs.org/results/55829/3398143/Cornell_Invitational/Womens-1500-Meters"
      },
      {
        "event": "3000",
        "time": "10:02.28",
        "resultUrl": "https://www.tfrrs.org/results/54503/3323034/Wartburg_Qualifier/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:53.17",
        "resultUrl": "https://www.tfrrs.org/results/56152/3421815/UW_Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "35:23.23",
        "resultUrl": "https://www.tfrrs.org/results/51339/3138944/Phil_Esten_Challenge/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:09.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "21:03.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/11260/NCAA_Division_III_Cross_Country_Championships?meet_hnd=11260"
      },
      {
        "event": "8K (XC)",
        "time": "22:16.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      }
    ]
  },
  "6139117": {
    "name": "Natalie Fober",
    "tfrrsId": "6139117",
    "fetchedAt": "2026-09-13T03:08:04.251Z",
    "bests": [
      {
        "event": "400",
        "time": "1:01.62",
        "resultUrl": "https://www.tfrrs.org/results/56924/3511811/Augustana_Twilight_/Womens-400-Meters"
      },
      {
        "event": "800",
        "time": "2:19.52",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505838/Iowa_Conference_Outdoor_Championships/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:19.17",
        "resultUrl": "https://www.tfrrs.org/results/64224/3918564/Chelsey_M_Henkenius_Indoor_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:56.43",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456319/Phil_Esten_Challenge_at_UW-La_Crosse/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:29.30",
        "resultUrl": "https://www.tfrrs.org/results/64949/3947713/Wartburg_Friday_Night_Lights_Meet/Womens-Mile"
      },
      {
        "event": "5000",
        "time": "20:28.36",
        "resultUrl": "https://www.tfrrs.org/results/51879/3190238/Iowa_Conference_Outdoor_Championships/Womens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "21:53.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "25:09.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/16603/Kollege_Town_Sports_Invitational?meet_hnd=16603"
      },
      {
        "event": "3 MILE (XC)",
        "time": "20:16.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6139134": {
    "name": "Kylie Kelchen",
    "tfrrsId": "6139134",
    "fetchedAt": "2026-09-13T03:08:07.604Z",
    "bests": [
      {
        "event": "1500",
        "time": "5:23.32",
        "resultUrl": "https://www.tfrrs.org/results/50831/3098421/Ashton_May_Invitational/Womens-1500-Meters"
      },
      {
        "event": "3000",
        "time": "11:08.00",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986363/Wartburg_Indoor_Invite/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:56.55",
        "resultUrl": "https://www.tfrrs.org/results/61152/3769454/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "12:03.81",
        "resultUrl": "https://www.tfrrs.org/results/62592/3840104/American_Rivers_Outdoor_Conference_Championships/Womens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "20:23.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "24:17.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/16697/Saga_Cup?meet_hnd=16697"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:11.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6139135": {
    "name": "Parry Larson",
    "tfrrsId": "6139135",
    "fetchedAt": "2026-09-13T03:08:09.247Z",
    "bests": [
      {
        "event": "800",
        "time": "2:29.90",
        "resultUrl": "https://www.tfrrs.org/results/47550/2975563/2017_Darren_Young_Classic/Womens-800-Meters"
      },
      {
        "event": "MILE",
        "time": "5:43.78",
        "resultUrl": "https://www.tfrrs.org/results/48564/2965791/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:38.60",
        "resultUrl": "https://www.tfrrs.org/results/48564/2965815/Wartburg_Indoor_Select/Womens-3000-Meters"
      },
      {
        "event": "TJ",
        "time": "9.95m",
        "resultUrl": "https://www.tfrrs.org/results/48897/2986377/Wartburg_Indoor_Invite/Womens-Triple-Jump"
      },
      {
        "event": "5K (XC)",
        "time": "21:35.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/10176/Augusburg_Alumni_meet?meet_hnd=10176"
      },
      {
        "event": "6K (XC)",
        "time": "24:50.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/11194/Iowa_Conference_Championships?meet_hnd=11194"
      }
    ]
  },
  "6139222": {
    "name": "Caleb Appleton",
    "tfrrsId": "6139222",
    "fetchedAt": "2026-09-13T03:07:33.288Z",
    "bests": [
      {
        "event": "800",
        "time": "1:56.44",
        "resultUrl": "https://www.tfrrs.org/results/54503/3322860/Wartburg_Qualifier/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:36.30",
        "resultUrl": "https://www.tfrrs.org/results/53729/3278570/Wartburg_Indoor_Select/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:56.97",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505864/Iowa_Conference_Outdoor_Championships/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:16.76",
        "resultUrl": "https://www.tfrrs.org/results/65189/4001360/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:23.99",
        "resultUrl": "https://www.tfrrs.org/results/59897/3664538/NCAA_Division_III_Indoor_Track__Field_Championships/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:16.07",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:33.02",
        "resultUrl": "https://www.tfrrs.org/results/62580/3844785/NCC_Gregory_Final_Qualifier/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:10.44",
        "resultUrl": "https://www.tfrrs.org/results/50120/3052344/Augustana_College_Early_Spring_Opener/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "16:16.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "8K (XC)",
        "time": "25:12.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/15028/NCAA_Division_III_Cross_Country_Championships?meet_hnd=15028"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "25:49.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6139227": {
    "name": "Jon Fuentes",
    "tfrrsId": "6139227",
    "fetchedAt": "2026-09-13T03:07:40.198Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.00",
        "resultUrl": "https://www.tfrrs.org/results/62627/3845723/NCAA_Final_Qualifier_at_UW-La_Crosse/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:49.85",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259091/Chelsey_M_Henkenius_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:22.34",
        "resultUrl": "https://www.tfrrs.org/results/61152/3769449/UW-Platteville_Invitational/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:52.89",
        "resultUrl": "https://www.tfrrs.org/results/58612/3590132/Jack_Jennett_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:54.70",
        "resultUrl": "https://www.tfrrs.org/results/59146/3601970/Wartburg_Indoor_Select/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:53.10",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172360/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "17:10.08",
        "resultUrl": "https://www.tfrrs.org/results/56742/3472157/2018_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "PV",
        "time": "3.20m",
        "resultUrl": "https://www.tfrrs.org/results/64234/3926905/Jack_Jennett_Open/Mens-Pole-Vault"
      },
      {
        "event": "JT",
        "time": "29.27m",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742658/Wartburg_Outdoor_Select/Mens-Javelin"
      },
      {
        "event": "5K (XC)",
        "time": "17:36.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "8K (XC)",
        "time": "28:46.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14673/21st_Dan_Huston_XC_Invite?meet_hnd=14673"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "29:52.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6139240": {
    "name": "Conor Sapp",
    "tfrrsId": "6139240",
    "fetchedAt": "2026-09-13T03:07:51.365Z",
    "bests": [
      {
        "event": "800",
        "time": "1:57.85",
        "resultUrl": "https://www.tfrrs.org/results/59587/3626353/Wartburg_Indoor_Invite/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:47.30",
        "resultUrl": "https://www.tfrrs.org/results/53729/3278570/Wartburg_Indoor_Select/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:01.92",
        "resultUrl": "https://www.tfrrs.org/results/62050/3788090/Phil_Esten_Challenge__UW-La_Crosse/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:22.24",
        "resultUrl": "https://www.tfrrs.org/results/60004/3651431/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:01.57",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582653/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:02.91",
        "resultUrl": "https://www.tfrrs.org/results/51750/3172360/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "3000S",
        "time": "9:45.83",
        "resultUrl": "https://www.tfrrs.org/results/62304/3808797/2019_Kip_Janvrin_Open/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "16:14.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6.437K (XC)",
        "time": "23:34.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "26:48.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/16603/Kollege_Town_Sports_Invitational?meet_hnd=16603"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:24.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6426421": {
    "name": "Gabi Gonzalez",
    "tfrrsId": "6426421",
    "fetchedAt": "2026-09-13T03:08:05.907Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "24:09.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "27:32.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      }
    ]
  },
  "6426422": {
    "name": "Aryka Parsons",
    "tfrrsId": "6426422",
    "fetchedAt": "2026-09-13T03:08:12.616Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "20:38.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "6K (XC)",
        "time": "24:12.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      }
    ]
  },
  "6426438": {
    "name": "Zac Sapiot",
    "tfrrsId": "6426438",
    "fetchedAt": "2026-09-13T03:07:50.508Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "18:47.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6.437K (XC)",
        "time": "24:29.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "30:11.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/12414/56th_Les_Duke?meet_hnd=12414"
      }
    ]
  },
  "6426439": {
    "name": "Matthew Schneider",
    "tfrrsId": "6426439",
    "fetchedAt": "2026-09-13T03:07:52.162Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "16:47.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "19:39.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "24:37.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "25:12.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:31.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592715": {
    "name": "Janelle Baeskens",
    "tfrrsId": "6592715",
    "fetchedAt": "2026-09-13T03:07:56.471Z",
    "bests": [
      {
        "event": "800",
        "time": "2:36.01",
        "resultUrl": "https://www.tfrrs.org/results/74305/4503009/SCIAC3_ULVCITCUCMSOC/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:12.28",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742635/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:27.66",
        "resultUrl": "https://www.tfrrs.org/results/67283/4062841/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:37.12",
        "resultUrl": "https://www.tfrrs.org/results/64478/3985533/American_Rivers_Indoor_Track__Field_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:26.08",
        "resultUrl": "https://www.tfrrs.org/results/66596/4081854/Liz_Wuertz_Indoor_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:32.93",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162124/Loras_Easter_Mid_Week/Womens-10000-Meters"
      },
      {
        "event": "4.5K (XC)",
        "time": "17:47.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17930/Redlands_Cross_Country_Invitational?meet_hnd=17930"
      },
      {
        "event": "5K (XC)",
        "time": "19:45.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "23:02.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "3 MILE (XC)",
        "time": "18:59.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      },
      {
        "event": "3.73 MILE (XC)",
        "time": "24:36.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/18970/2021_Pomona-Pitzer_XC_Invite?meet_hnd=18970"
      }
    ]
  },
  "6592717": {
    "name": "Cassidy Christopher",
    "tfrrsId": "6592717",
    "fetchedAt": "2026-09-13T03:07:59.933Z",
    "bests": [
      {
        "event": "800",
        "time": "2:21.90",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300259/Wartburg_Indoor_Invitational/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:12.93",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582644/Chelsey_M_Henkenius_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:42.92",
        "resultUrl": "https://www.tfrrs.org/results/56924/3511810/Augustana_Twilight_/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:07.10",
        "resultUrl": "https://www.tfrrs.org/results/59146/3601926/Wartburg_Indoor_Select/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "9:50.70",
        "resultUrl": "https://www.tfrrs.org/results/59897/3664530/NCAA_Division_III_Indoor_Track__Field_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "17:27.58",
        "resultUrl": "https://www.tfrrs.org/results/59385/3718725/Washington_University_St_Louis_Invite/Womens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:00.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "21:56.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/13424/NCAA_Division_III_Cross_Country_Championships?meet_hnd=13424"
      },
      {
        "event": "8K (XC)",
        "time": "22:25.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      },
      {
        "event": "3 MILE (XC)",
        "time": "18:09.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592718": {
    "name": "Carina Collet",
    "tfrrsId": "6592718",
    "fetchedAt": "2026-09-13T03:08:00.847Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:48.74",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831446/Luther_vs_Wartburg_Dual/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:11.25",
        "resultUrl": "https://www.tfrrs.org/results/57559/3593372/Mark_Schuck_Open_and_Multi/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "9:57.83",
        "resultUrl": "https://www.tfrrs.org/results/59784/3637863/American_Rivers_Indoor_Conference_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:51.66",
        "resultUrl": "https://www.tfrrs.org/results/59897/3664532/NCAA_Division_III_Indoor_Track__Field_Championships/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "35:41.10",
        "resultUrl": "https://www.tfrrs.org/results/57030/3505870/Iowa_Conference_Outdoor_Championships/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "18:19.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "21:28.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "8K (XC)",
        "time": "22:28.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      },
      {
        "event": "3 MILE (XC)",
        "time": "17:21.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592719": {
    "name": "Clare Davison",
    "tfrrsId": "6592719",
    "fetchedAt": "2026-09-13T03:08:01.694Z",
    "bests": [
      {
        "event": "1500",
        "time": "5:24.26",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742635/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:43.73",
        "resultUrl": "https://www.tfrrs.org/results/67752/4116995/2021_Division_III_Elite_Indoor_Championships/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:27.68",
        "resultUrl": "https://www.tfrrs.org/results/67571/4091760/Luther_A-R-C_Tri_4/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:28.28",
        "resultUrl": "https://www.tfrrs.org/results/69806/4223259/2021_Kip_Janvrin_Open/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "41:19.13",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162124/Loras_Easter_Mid_Week/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "20:55.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "25:29.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/16603/Kollege_Town_Sports_Invitational?meet_hnd=16603"
      },
      {
        "event": "3 MILE (XC)",
        "time": "20:22.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592724": {
    "name": "Jacque Garza",
    "tfrrsId": "6592724",
    "fetchedAt": "2026-09-13T03:08:05.119Z",
    "bests": [
      {
        "event": "800",
        "time": "2:25.94",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490543/Wartburg_Luther_Dual/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:14.35",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456319/Phil_Esten_Challenge_at_UW-La_Crosse/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:59.39",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582654/Chelsey_M_Henkenius_Open/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "12:06.83",
        "resultUrl": "https://www.tfrrs.org/results/59146/3601967/Wartburg_Indoor_Select/Womens-3000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "22:24.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6K (XC)",
        "time": "25:54.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/14980/Saga_Cup?meet_hnd=14980"
      },
      {
        "event": "3 MILE (XC)",
        "time": "20:42.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592806": {
    "name": "Ali Ali",
    "tfrrsId": "6592806",
    "fetchedAt": "2026-09-13T03:07:32.404Z",
    "bests": [
      {
        "event": "800",
        "time": "1:55.85",
        "resultUrl": "https://www.tfrrs.org/results/69273/4208402/Meet_of_Champions/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "3:57.07",
        "resultUrl": "https://www.tfrrs.org/results/69618/4265575/American_Rivers_Outdoor_Conference_Championships/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:18.68",
        "resultUrl": "https://www.tfrrs.org/results/67737/4105813/American_Rivers_Indoor_Conference_Championships/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:42.29",
        "resultUrl": "https://www.tfrrs.org/results/67752/4116990/2021_Division_III_Elite_Indoor_Championships/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:22.90",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:20.52",
        "resultUrl": "https://www.tfrrs.org/results/54503/3322839/Wartburg_Qualifier/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:03.73",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456279/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:34.28",
        "resultUrl": "https://www.tfrrs.org/results/59385/3718744/Washington_University_St_Louis_Invite/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:51.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:17.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "25:48.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/19104/Augustana_Interregional_Invitational?meet_hnd=19104"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "26:28.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592810": {
    "name": "Christian Brothers",
    "tfrrsId": "6592810",
    "fetchedAt": "2026-09-13T03:07:34.946Z",
    "bests": [
      {
        "event": "400",
        "time": "50.84",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490523/Wartburg_Luther_Dual/Mens-400-Meters"
      },
      {
        "event": "800",
        "time": "1:55.82",
        "resultUrl": "https://www.tfrrs.org/results/54503/3322860/Wartburg_Qualifier/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:05.67",
        "resultUrl": "https://www.tfrrs.org/results/56742/3472159/2018_Kip_Janvrin_Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:31.87",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300271/Wartburg_Indoor_Invitational/Mens-Mile"
      },
      {
        "event": "5K (XC)",
        "time": "18:03.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6.437K (XC)",
        "time": "23:13.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "28:20.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/12954/20th_Dan_Huston?meet_hnd=12954"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "28:28.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592811": {
    "name": "Liam Conroy",
    "tfrrsId": "6592811",
    "fetchedAt": "2026-09-13T03:07:36.657Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:10.81",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831435/Luther_vs_Wartburg_Dual/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:28.63",
        "resultUrl": "https://www.tfrrs.org/results/67101/4053414/Wartburg_Friday_Night_Lights_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:48.59",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582653/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:48.08",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:04.71",
        "resultUrl": "https://www.tfrrs.org/results/61152/3769460/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:46.58",
        "resultUrl": "https://www.tfrrs.org/results/73793/4459051/Wartburg_Outdoor_Select/Mens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:19.33",
        "resultUrl": "https://www.tfrrs.org/results/62304/3808797/2019_Kip_Janvrin_Open/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "17:06.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/11992/Crown_College_Invite?meet_hnd=11992"
      },
      {
        "event": "6K (XC)",
        "time": "19:30.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "25:15.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17048/Dan_Huston_Triangular?meet_hnd=17048"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "26:22.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592812": {
    "name": "Ryan Dalton",
    "tfrrsId": "6592812",
    "fetchedAt": "2026-09-13T03:07:37.504Z",
    "bests": [
      {
        "event": "800",
        "time": "2:07.65",
        "resultUrl": "https://www.tfrrs.org/results/67283/4062830/Wartburg_Indoor_Select/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:08.88",
        "resultUrl": "https://www.tfrrs.org/results/62050/3788090/Phil_Esten_Challenge__UW-La_Crosse/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:18.43",
        "resultUrl": "https://www.tfrrs.org/results/65189/4001360/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:45.52",
        "resultUrl": "https://www.tfrrs.org/results/65128/3960672/Midwest_ELITE_Invitational/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:41.33",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:38.24",
        "resultUrl": "https://www.tfrrs.org/results/62304/3808781/2019_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "JT",
        "time": "18.14m",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742658/Wartburg_Outdoor_Select/Mens-Javelin"
      },
      {
        "event": "5K (XC)",
        "time": "16:13.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:58.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "26:55.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "28:12.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592813": {
    "name": "Collin Day",
    "tfrrsId": "6592813",
    "fetchedAt": "2026-09-13T03:08:17.631Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.95",
        "resultUrl": "https://www.tfrrs.org/results/67283/4062830/Wartburg_Indoor_Select/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:09.03",
        "resultUrl": "https://www.tfrrs.org/results/69292/4185244/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:26.11",
        "resultUrl": "https://www.tfrrs.org/results/59146/3601946/Wartburg_Indoor_Select/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:02.10",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582653/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:42.58",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831447/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:04.94",
        "resultUrl": "https://www.tfrrs.org/results/73599/4501500/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:32.43",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162103/Loras_Easter_Mid_Week/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:05.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "19:35.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "25:47.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "26:58.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592814": {
    "name": "Matt Egts",
    "tfrrsId": "6592814",
    "fetchedAt": "2026-09-13T03:07:38.405Z",
    "bests": [
      {
        "event": "800",
        "time": "1:58.13",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252595/Wartburg_Luther_Dual_/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:43.67",
        "resultUrl": "https://www.tfrrs.org/results/66592/4038659/Chelsey_M_Henkenius_Triangular/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:12.41",
        "resultUrl": "https://www.tfrrs.org/results/70018/4240021/Wartburg_Outdoor_Friday_Night_Lights/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:27.80",
        "resultUrl": "https://www.tfrrs.org/results/67752/4117010/2021_Division_III_Elite_Indoor_Championships/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:21.20",
        "resultUrl": "https://www.tfrrs.org/results/67317/4070457/BVU_Triangular/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:39.28",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831447/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "16:59.63",
        "resultUrl": "https://www.tfrrs.org/results/64949/3947735/Wartburg_Friday_Night_Lights_Meet/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:26.57",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162095/Loras_Easter_Mid_Week/Mens-3000-Steeplechase"
      },
      {
        "event": "HJ",
        "time": "1.61m",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300265/Wartburg_Indoor_Invitational/Mens-High-Jump"
      },
      {
        "event": "JT",
        "time": "52.78m",
        "resultUrl": "https://www.tfrrs.org/results/74773/4520861/Phil_Esten_Challenge/Mens-Javelin"
      },
      {
        "event": "5K (XC)",
        "time": "17:10.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "22:23.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "28:33.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "29:19.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592815": {
    "name": "Joe Freiburger",
    "tfrrsId": "6592815",
    "fetchedAt": "2026-09-13T03:07:39.286Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:12.72",
        "resultUrl": "https://www.tfrrs.org/results/66596/4081878/Liz_Wuertz_Indoor_Invitational/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:16.55",
        "resultUrl": "https://www.tfrrs.org/results/72302/4391140/2022_American_Rivers_Conference_Indoor_Championships/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:02.84",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252574/Wartburg_Luther_Dual_/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:00.69",
        "resultUrl": "https://www.tfrrs.org/results/69821/4224605/Drake_Relays/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "29:36.50",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162103/Loras_Easter_Mid_Week/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:24.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "18:49.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "23:58.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/19297/NCAA_Division_III_Cross_Country_Championships?meet_hnd=19297"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "25:30.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592819": {
    "name": "Matt Heinzman",
    "tfrrsId": "6592819",
    "fetchedAt": "2026-09-13T03:07:41.025Z",
    "bests": [
      {
        "event": "800",
        "time": "1:53.18",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252595/Wartburg_Luther_Dual_/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "3:49.07",
        "resultUrl": "https://www.tfrrs.org/results/70179/4273529/NCAA_Division_III_Outdoor_Track__Field_Championships/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:14.39",
        "resultUrl": "https://www.tfrrs.org/results/66596/4081878/Liz_Wuertz_Indoor_Invitational/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:30.74",
        "resultUrl": "https://www.tfrrs.org/results/70668/4301983/GVSU_Holiday_Open/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:33.88",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490545/Wartburg_Luther_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:29.07",
        "resultUrl": "https://www.tfrrs.org/results/69273/4208399/Meet_of_Champions/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "33:05.77",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456279/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:14.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "19:45.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "23:18.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "25:13.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/19104/Augustana_Interregional_Invitational?meet_hnd=19104"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "26:30.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592820": {
    "name": "Drew Hoffman",
    "tfrrsId": "6592820",
    "fetchedAt": "2026-09-13T03:07:42.005Z",
    "bests": [
      {
        "event": "800",
        "time": "2:03.59",
        "resultUrl": "https://www.tfrrs.org/results/67283/4062830/Wartburg_Indoor_Select/Mens-800-Meters"
      },
      {
        "event": "MILE",
        "time": "4:29.08",
        "resultUrl": "https://www.tfrrs.org/results/72301/4362061/Wartburg_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:55.03",
        "resultUrl": "https://www.tfrrs.org/results/72809/4381424/Liz_Wuertz_Invite_/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:50.19",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831447/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:56.28",
        "resultUrl": "https://www.tfrrs.org/results/73599/4501500/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:10.52",
        "resultUrl": "https://www.tfrrs.org/results/74773/4520825/Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:34.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:17.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "22:41.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "25:57.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/19104/Augustana_Interregional_Invitational?meet_hnd=19104"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:12.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/15222/Bradley_Intercollegiate?meet_hnd=15222"
      }
    ]
  },
  "6592823": {
    "name": "Frosty Lorimer",
    "tfrrsId": "6592823",
    "fetchedAt": "2026-09-13T03:07:44.555Z",
    "bests": [
      {
        "event": "400",
        "time": "52.14",
        "resultUrl": "https://www.tfrrs.org/results/56929/3490523/Wartburg_Luther_Dual/Mens-400-Meters"
      },
      {
        "event": "800",
        "time": "1:54.80",
        "resultUrl": "https://www.tfrrs.org/results/67752/4116992/2021_Division_III_Elite_Indoor_Championships/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:32.52",
        "resultUrl": "https://www.tfrrs.org/results/71953/4336703/Chelsey_M_Henkenius_Invitational/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:53.37",
        "resultUrl": "https://www.tfrrs.org/results/70018/4240021/Wartburg_Outdoor_Friday_Night_Lights/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:15.17",
        "resultUrl": "https://www.tfrrs.org/results/72302/4391163/2022_American_Rivers_Conference_Indoor_Championships/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:59.41",
        "resultUrl": "https://www.tfrrs.org/results/58774/3582653/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:19.01",
        "resultUrl": "https://www.tfrrs.org/results/73599/4501500/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:47.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:51.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "23:23.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "25:35.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/18093/Dan_Huston_Invitational?meet_hnd=18093"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:01.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592826": {
    "name": "Sam Madson",
    "tfrrsId": "6592826",
    "fetchedAt": "2026-09-13T03:07:45.435Z",
    "bests": [
      {
        "event": "800",
        "time": "1:54.42",
        "resultUrl": "https://www.tfrrs.org/results/69274/4270326/Augustana_College_Midwest_Twilight_Final_Qualifier/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:34.04",
        "resultUrl": "https://www.tfrrs.org/results/66592/4038659/Chelsey_M_Henkenius_Triangular/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:58.76",
        "resultUrl": "https://www.tfrrs.org/results/75102/4563521/Augustana_College_Twilight_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:15.81",
        "resultUrl": "https://www.tfrrs.org/results/72644/4371389/Midwest_ELITE_Invitational/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:55.25",
        "resultUrl": "https://www.tfrrs.org/results/71953/4336687/Chelsey_M_Henkenius_Invitational/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:46.45",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252574/Wartburg_Luther_Dual_/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "16:07.11",
        "resultUrl": "https://www.tfrrs.org/results/54104/3300252/Wartburg_Indoor_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:14.88",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456271/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "16:14.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:11.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/18477/John_Kurtt_Invitational?meet_hnd=18477"
      },
      {
        "event": "6.437K (XC)",
        "time": "23:11.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "26:30.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/19104/Augustana_Interregional_Invitational?meet_hnd=19104"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "28:05.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592827": {
    "name": "Curren Matthias",
    "tfrrsId": "6592827",
    "fetchedAt": "2026-09-13T03:07:46.315Z",
    "bests": [
      {
        "event": "60",
        "time": "8.10",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639168/American_Rivers_Indoor_Conference_Championships/Mens-60-Meters"
      },
      {
        "event": "800",
        "time": "2:03.52",
        "resultUrl": "https://www.tfrrs.org/results/56639/3464348/Taco_Tuesday_Twilight/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:39.01",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639170/American_Rivers_Indoor_Conference_Championships/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:11.66",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456278/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:30.04",
        "resultUrl": "https://www.tfrrs.org/results/67317/4070465/BVU_Triangular/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:47.54",
        "resultUrl": "https://www.tfrrs.org/results/67752/4116990/2021_Division_III_Elite_Indoor_Championships/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:20.85",
        "resultUrl": "https://www.tfrrs.org/results/61152/3769460/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "60H",
        "time": "10.32",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639172/American_Rivers_Indoor_Conference_Championships/Mens-60-Hurdles"
      },
      {
        "event": "60H",
        "time": "10.33",
        "resultUrl": "https://www.tfrrs.org/results/59587/3626343/Wartburg_Indoor_Invite/Mens-60-Hurdles"
      },
      {
        "event": "400H",
        "time": "1:00.46",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252580/Wartburg_Luther_Dual_/Mens-400-Hurdles"
      },
      {
        "event": "3000S",
        "time": "9:17.30",
        "resultUrl": "https://www.tfrrs.org/results/70018/4240038/Wartburg_Outdoor_Friday_Night_Lights/Mens-3000-Steeplechase"
      },
      {
        "event": "HJ",
        "time": "1.62m",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639167/American_Rivers_Indoor_Conference_Championships/Mens-High-Jump"
      },
      {
        "event": "PV",
        "time": "3.05m",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639166/American_Rivers_Indoor_Conference_Championships/Mens-Pole-Vault"
      },
      {
        "event": "LJ",
        "time": "5.15m",
        "resultUrl": "https://www.tfrrs.org/results/59784/3639171/American_Rivers_Indoor_Conference_Championships/Mens-Long-Jump"
      },
      {
        "event": "SP",
        "time": "7.71m",
        "resultUrl": "https://www.tfrrs.org/results/59146/3607339/Wartburg_Indoor_Select/Mens-Shot-Put"
      },
      {
        "event": "HEP",
        "time": "3498",
        "resultUrl": "https://www.tfrrs.org/results/59784/3637854/American_Rivers_Indoor_Conference_Championships/Mens-Heptathlon"
      },
      {
        "event": "5K (XC)",
        "time": "16:57.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "6K (XC)",
        "time": "19:49.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "22:24.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "26:06.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:57.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592831": {
    "name": "Sam Pinkowski",
    "tfrrsId": "6592831",
    "fetchedAt": "2026-09-13T03:07:48.770Z",
    "bests": [
      {
        "event": "1500",
        "time": "3:50.55",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456278/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:10.40",
        "resultUrl": "https://www.tfrrs.org/results/53086/3288524/Boston_University_David_Hemery_Valentine_Invitational/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:29.99",
        "resultUrl": "https://www.tfrrs.org/results/53399/3259079/Chelsey_M_Henkenius_Open/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:25.12",
        "resultUrl": "https://www.tfrrs.org/results/56328/3510866/NCC_Gregory_Final_Qualifier/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:03.56",
        "resultUrl": "https://www.tfrrs.org/results/59385/3718742/Washington_University_St_Louis_Invite/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:56.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14228/John_Kurtt_Fall_Invitational?meet_hnd=14228"
      },
      {
        "event": "8K (XC)",
        "time": "24:32.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/19104/Augustana_Interregional_Invitational?meet_hnd=19104"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "25:08.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592835": {
    "name": "Spencer Warehime",
    "tfrrsId": "6592835",
    "fetchedAt": "2026-09-13T03:07:53.851Z",
    "bests": [
      {
        "event": "800",
        "time": "2:01.74",
        "resultUrl": "https://www.tfrrs.org/results/67283/4062830/Wartburg_Indoor_Select/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:11.78",
        "resultUrl": "https://www.tfrrs.org/results/55829/3398131/Cornell_Invitational/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:30.79",
        "resultUrl": "https://www.tfrrs.org/results/53729/3278526/Wartburg_Indoor_Select/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:51.32",
        "resultUrl": "https://www.tfrrs.org/results/67571/4091770/Luther_A-R-C_Tri_4/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:31.54",
        "resultUrl": "https://www.tfrrs.org/results/62515/3831447/Luther_vs_Wartburg_Dual/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:01.22",
        "resultUrl": "https://www.tfrrs.org/results/69618/4265589/American_Rivers_Outdoor_Conference_Championships/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:37.19",
        "resultUrl": "https://www.tfrrs.org/results/70018/4240020/Wartburg_Outdoor_Friday_Night_Lights/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:11.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:11.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "8K (XC)",
        "time": "26:04.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "26:23.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592836": {
    "name": "Noah Worthington",
    "tfrrsId": "6592836",
    "fetchedAt": "2026-09-13T03:07:54.726Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.42",
        "resultUrl": "https://www.tfrrs.org/results/66596/4081866/Liz_Wuertz_Indoor_Invitational/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:08.76",
        "resultUrl": "https://www.tfrrs.org/results/56531/3456278/Phil_Esten_Challenge_at_UW-La_Crosse/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:28.05",
        "resultUrl": "https://www.tfrrs.org/results/65189/4001360/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:12.62",
        "resultUrl": "https://www.tfrrs.org/results/64224/3918565/Chelsey_M_Henkenius_Indoor_Open/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:45.78",
        "resultUrl": "https://www.tfrrs.org/results/62304/3808781/2019_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:00.81",
        "resultUrl": "https://www.tfrrs.org/results/69806/4223267/2021_Kip_Janvrin_Open/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "16:24.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:26.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "22:40.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "26:22.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/17048/Dan_Huston_Triangular?meet_hnd=17048"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:44.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6592838": {
    "name": "Jordan Yessak",
    "tfrrsId": "6592838",
    "fetchedAt": "2026-09-13T03:07:55.607Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:24.10",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742636/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:37.87",
        "resultUrl": "https://www.tfrrs.org/results/52031/3283236/2018_Jack_Jennett_Open_/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:10.13",
        "resultUrl": "https://www.tfrrs.org/results/59587/3626365/Wartburg_Indoor_Invite/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:46.47",
        "resultUrl": "https://www.tfrrs.org/results/70172/4252574/Wartburg_Luther_Dual_/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:39.67",
        "resultUrl": "https://www.tfrrs.org/results/70018/4240019/Wartburg_Outdoor_Friday_Night_Lights/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:50.20",
        "resultUrl": "https://www.tfrrs.org/results/68984/4162103/Loras_Easter_Mid_Week/Mens-10000-Meters"
      },
      {
        "event": "JT",
        "time": "27.23m",
        "resultUrl": "https://www.tfrrs.org/results/61477/3742658/Wartburg_Outdoor_Select/Mens-Javelin"
      },
      {
        "event": "5K (XC)",
        "time": "16:29.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/15977/John_Kurtt_Invitational?meet_hnd=15977"
      },
      {
        "event": "6K (XC)",
        "time": "20:43.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/17047/John_Kurtt_Triangular?meet_hnd=17047"
      },
      {
        "event": "6.437K (XC)",
        "time": "22:01.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/12813/2017_Brissman-Lundeen_Cross_Country_Invitational?meet_hnd=12813"
      },
      {
        "event": "8K (XC)",
        "time": "26:31.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/17049/Wartburg_Triangular?meet_hnd=17049"
      },
      {
        "event": "4.97 MILE (XC)",
        "time": "27:16.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6915217": {
    "name": "Bri Bower",
    "tfrrsId": "6915217",
    "fetchedAt": "2026-09-13T03:08:26.029Z",
    "bests": [
      {
        "event": "800",
        "time": "2:32.75",
        "resultUrl": "https://www.tfrrs.org/results/50482/3074773/Wartburg_Outdoor_Select/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:03.23",
        "resultUrl": "https://www.tfrrs.org/results/50120/3052359/Augustana_College_Early_Spring_Opener/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:24.21",
        "resultUrl": "https://www.tfrrs.org/results/49065/2996723/Iowa_Conference_Indoor_Championships/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:59.05",
        "resultUrl": "https://www.tfrrs.org/results/47566/2965333/Keck_DIII_Select_2017/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:15.85",
        "resultUrl": "https://www.tfrrs.org/results/47550/2975572/2017_Darren_Young_Classic/Womens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "20:30.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/11918/National_Catholic_Invitational?meet_hnd=11918"
      },
      {
        "event": "6K (XC)",
        "time": "24:07.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/13353/Iowa_Conference_Championships?meet_hnd=13353"
      },
      {
        "event": "8K (XC)",
        "time": "24:01.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/13031/NCAA_Division_III_Central_Region_Cross_Country_Championships?meet_hnd=13031"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:42.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6915220": {
    "name": "Alex Childs",
    "tfrrsId": "6915220",
    "fetchedAt": "2026-09-13T03:08:26.821Z",
    "bests": [
      {
        "event": "6K (XC)",
        "time": "24:05.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14673/21st_Dan_Huston_XC_Invite?meet_hnd=14673"
      },
      {
        "event": "3 MILE (XC)",
        "time": "19:42.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6915225": {
    "name": "Alissa Neubauer",
    "tfrrsId": "6915225",
    "fetchedAt": "2026-09-13T03:08:31.933Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "21:47.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/15853/Kohawk_Relays_and_Chase?meet_hnd=15853"
      },
      {
        "event": "6K (XC)",
        "time": "25:20.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/19128/Saga_Cup?meet_hnd=19128"
      },
      {
        "event": "3 MILE (XC)",
        "time": "20:56.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/14461/Bradley_Intercollegiate_Championships?meet_hnd=14461"
      }
    ]
  },
  "6915226": {
    "name": "Emma Sinnwell",
    "tfrrsId": "6915226",
    "fetchedAt": "2026-09-13T03:08:32.930Z",
    "bests": [
      {
        "event": "5K (XC)",
        "time": "23:31.7",
        "resultUrl": "https://www.tfrrs.or

... [truncated, file is 406537 bytes, showing first 100000] ...
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
  { label: "View Tuesday Workout", path: "/tuesday_workout" },
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
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function MileagePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/error", {
      replace: true,
      state: {
        message: "Uh oh, looks like this page isn't built yet. Check in later!",
        code: 404,
      },
    });
  }, [navigate]);

  return null;
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

### `src/pages/tuesdayWorkout.tsx`

```tsx
function TuesdayWorkout() {
  return (
    <div>
      <h1>More info here</h1>
    </div>
  );
}
export default TuesdayWorkout;

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

```

### `src/App.tsx`

```tsx
import wartburgDroneShot from "./assets/still_pictures/wartburg_drone_1.png";
import Background from "./components/background";
import "./App.css";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/home";
import Lookup from "./pages/name_lookup";
import ErrorPage from "./pages/error";
import AboutInfo from "./pages/about";
import MileagePage from "./pages/mileagePage";
import CorePage from "./pages/corePage";
import BackButton from "./components/backButton";
import RequireIdentity from "./components/requireIdentity";
import FMS from "./pages/fms";
import LiftingSheet from "./pages/liftingSheet";
import ComingSoon from "./components/comingSoon";
import TfrrsStats from "./pages/tfrrsStats";
import TuesdayWorkout from "./pages/tuesdayWorkout";

const BACK_BUTTON_ROUTES = new Set(["/"]);

function AppContent() {
  const location = useLocation();

  const isKnownRoute = [
    "/",
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
    "/tuesday_workout",
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
              <ComingSoon />
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
          path="/tuesday_workout"
          element={
            <RequireIdentity>
              <TuesdayWorkout />
            </RequireIdentity>
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
import { UserProvider } from "./context/UserContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UserProvider>
      <App />
    </UserProvider>
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

```json
{
  "name": "my-lookup-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "digest": "node repo-digest.mjs",
    "fetch-roster": "node scripts/fetch-roster.mjs",
    "fetch-tfrrs-ids": "node scripts/fetch-tfrrs-ids.mjs",
    "fetch-tfrrs-stats": "node scripts/fetch-tfrrs-stats.mjs",
    "fetch-roster-history": "node scripts/fetch-roster-history.mjs",
    "fetch-roster-by-year": "node scripts/fetch-roster-by-year.mjs",
    "fetch-tfrrs-ids-all-years": "node scripts/fetch-tfrrs-ids-all-years.mjs",
    "fetch-tfrrs-ids-historical": "node scripts/fetch-tfrrs-ids-historical.mjs"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router-dom": "^7.18.3"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "cheerio": "^1.2.0",
    "eslint": "^10.10.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.6",
    "globals": "^17.12.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.69.0",
    "vite": "^8.3.0"
  }
}

```

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
  ".lock", // package-lock.json is text but huge/noisy; still skip contents
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

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}

```

### `tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}

```

### `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}

```

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
_Digest complete: 51 files inlined, 10 skipped (binary/excluded)._