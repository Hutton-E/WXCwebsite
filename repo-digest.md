# Repository Digest

Generated: 2026-09-13T02:42:20.842Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── public/
├── scripts/
│   ├── fetch-roster-history.mjs
│   ├── fetch-roster.mjs
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
│   │   └── tfrrsStats.tsx
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
 * For every athlete with a tfrrsId in distance_roster.json, fetches their
 * TFRRS profile and extracts their "College Bests" table — one best time
 * per event, career-wide (not broken out by season/indoor/outdoor).
 *
 * Writes src/data/tfrrs_stats.json, keyed by your roster athlete id.
 *
 * Run this periodically during the season to keep bests current.
 *
 * Usage: node scripts/fetch-tfrrs-stats.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const ROSTER_PATH = path.resolve("src/data/distance_roster.json");
const OUT_PATH = path.resolve("src/data/tfrrs_stats.json");

// Be polite — TFRRS is a shared community resource, not an API.
const DELAY_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAthleteBests(tfrrsId, name) {
  // The team ("Wartburg") and name-slug portion of the URL don't actually
  // need to be correct for TFRRS to resolve the page — only the ID matters —
  // but we build a plausible URL for clarity/debugging.
  const slug = name.replace(/\s+/g, "_");
  const url = `https://www.tfrrs.org/athletes/${tfrrsId}/Wartburg/${slug}.html`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (stats-fetch-script)" },
  });
  if (!res.ok) {
    console.warn(`  ⚠️  ${name}: failed to fetch (${res.status}) — ${url}`);
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // The "College Bests" summary table is the first table on the page.
  const bestsTable = $("table").first();
  if (bestsTable.length === 0) {
    console.warn(`  ⚠️  ${name}: no tables found on profile page`);
    return null;
  }

  const events = [];
  const cells = bestsTable.find("td").toArray();

  // Cells alternate: [event label, result cell with a time link, event label, result cell, ...]
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
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));
  const athletesWithId = roster.athletes.filter((a) => a.tfrrsId);

  if (athletesWithId.length === 0) {
    console.error(
      "No athletes have a tfrrsId yet. Run scripts/fetch-tfrrs-ids.mjs first.",
    );
    process.exit(1);
  }

  console.log(`Fetching stats for ${athletesWithId.length} athletes...\n`);

  const stats = {};
  let success = 0;
  let failed = 0;

  for (const athlete of athletesWithId) {
    const events = await fetchAthleteBests(athlete.tfrrsId, athlete.name);
    if (events && events.length > 0) {
      stats[athlete.id] = {
        name: athlete.name,
        tfrrsId: athlete.tfrrsId,
        fetchedAt: new Date().toISOString(),
        bests: events,
      };
      console.log(`✅ ${athlete.name}: ${events.length} events`);
      success++;
    } else {
      console.log(`⚠️  ${athlete.name}: no data found`);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(stats, null, 2), "utf8");

  console.log(`\n✅ Wrote stats for ${success} athletes to ${OUT_PATH}`);
  if (failed > 0) {
    console.log(
      `⚠️  ${failed} athletes had no data — check their tfrrsId or profile page manually.`,
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
import rosterData from "../data/distance_roster_26.json";

function IdentityLookup() {
  const { selectAthlete } = useUser();
  const [query, setQuery] = useState("");

  const matches =
    query.trim().length > 0
      ? rosterData.athletes.filter((a) =>
          a.name.toLowerCase().includes(query.toLowerCase()),
        )
      : [];

  return (
    <div className="identity-lookup">
      <h1 className="identity-title acme-regular text-outline">Who are you?</h1>
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
                onClick={() => selectAthlete(athlete.id)}
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
import rosterData from "../data/distance_roster_26.json";

interface Athlete {
  id: string;
  name: string;
  team: string;
  year: string;
  hometown: string;
  highSchool: string;
  profileUrl: string;
}

interface UserContextValue {
  athleteId: string | null;
  athlete: Athlete | null;
  selectAthlete: (id: string) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const STORAGE_KEY = "wxc_selected_athlete_id";

function findAthlete(id: string | null): Athlete | null {
  if (!id) return null;
  return rosterData.athletes.find((a) => a.id === id) ?? null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  function selectAthlete(id: string) {
    sessionStorage.setItem(STORAGE_KEY, id);
    setAthleteIdState(id);
  }

  function clearAthlete() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAthleteIdState(null);
  }

  const athlete = findAthlete(athleteId);

  return (
    <UserContext.Provider
      value={{ athleteId, athlete, selectAthlete, clearAthlete }}
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
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-cooper/16843"
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
      "hometown": "Cedar Falls",
      "highSchool": "",
      "seasons": [
        {
          "season": 2011,
          "classYear": "So.",
          "id": "955",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emily-rogers/955"
        }
      ]
    },
    {
      "name": "Emma Sinnwell",
      "team": "womens-cross-country",
      "hometown": "Nashua, Iowa",
      "highSchool": "Nashua-Plainfield",
      "seasons": [
        {
          "season": 2018,
          "classYear": "Fr.",
          "id": "7342",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emma-sinnwell/7342"
        }
      ]
    },
    {
      "name": "Emrie Johnson",
      "team": "womens-cross-country",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "seasons": [
        {
          "season": 2025,
          "classYear": "Fr.",
          "id": "15930",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emrie-johnson/15930"
        }
      ]
    },
    {
      "name": "Erik Jolivette",
      "team": "mens-cross-country",
      "hometown": "Garner, Iowa",
      "highSchool": "Garner-Hayfield",
      "seasons": [
        {
          "season": 2010,
          "classYear": "So.",
          "id": "160",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/erik-jolivette/160"
        },
        {
          "season": 2011,
          "classYear": "Jr.",
          "id": "912",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/erik-jolivette/912"
        },
        {
          "season": 2012,
          "classYear": "Sr.",
          "id": "1933",
          "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/erik-jolivette/1933"
        }
      ]
    },
    {
      "name": "Erin Phelan",
      "team": "womens-cross-country",
      "hometown": "Waukesha, Wis.",
      "highSchool": "Waukesha West",
      "seasons": [
        {
          "season": 2020,
          "classYear": "Fr.",
          "id": "8958",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/8958"
        },
        {
          "season": 2021,
          "classYear": "So.",
          "id": "10849",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/10849"
        },
        {
          "season": 2022,
          "classYear": "Jr.",
          "id": "11660",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/11660"
        },
        {
          "season": 2023,
          "classYear": "Sr.",
          "id": "12887",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-phelan/12887"
        }
      ]
    },
    {
      "name": "Erin Sawyers",
      "team": "womens-cross-country",
      "hometown": "Winterset, Iowa",
      "highSchool": "Winterset",
      "seasons": [
        {
          "season": 2011,
          "classYear": "Fr.",
          "id": "956",
          "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/erin-sawyers/956"
        }
      ]
    },
    {
      

... [truncated, file is 243748 bytes, showing first 100000] ...
```

### `src/data/tfrrs_stats.json`

```json
{
  "15902": {
    "name": "Jade Anderson",
    "tfrrsId": "8700372",
    "fetchedAt": "2026-09-12T22:30:29.538Z",
    "bests": [
      {
        "event": "400",
        "time": "1:05.73",
        "resultUrl": "https://www.tfrrs.org/results/82469/5029117/Wartburg_Indoor_Select_Meet/Womens-400-Meters"
      },
      {
        "event": "600",
        "time": "1:46.27",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746791/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:26.13",
        "resultUrl": "https://www.tfrrs.org/results/89161/5435686/Wartburg_Qualifier/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:12.85",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760499/Cyclone_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "5:07.41",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510698/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:34.01",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372934/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "PV",
        "time": "2.75m",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810476/Liz_Wuertz_Indoor_Meet/Womens-Pole-Vault"
      },
      {
        "event": "JT",
        "time": "23.79m",
        "resultUrl": "https://www.tfrrs.org/results/82545/5144572/Wartburg_Good_Friday_Challenge/Womens-Javelin"
      },
      {
        "event": "4K (XC)",
        "time": "17:11.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:58.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "24:38.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "15903": {
    "name": "Abbey Angus",
    "tfrrsId": "8896839",
    "fetchedAt": "2026-09-12T22:30:30.371Z",
    "bests": [
      {
        "event": "800",
        "time": "2:35.85",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380346/Friday_Knight_Lights_Indoor_Meet/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:11.41",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618750/Wartburg_May_Triangular/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:33.64",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380364/Friday_Knight_Lights_Indoor_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:36.28",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:32.17",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:13.66",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987241/American_Rivers_Conference_Championships_/Womens-10000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "15:22.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:12.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "23:21.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "15904": {
    "name": "Sydney Bochmann",
    "tfrrsId": "8896838",
    "fetchedAt": "2026-09-12T22:30:31.260Z",
    "bests": [
      {
        "event": "800",
        "time": "2:39.09",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353931/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:03.37",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618750/Wartburg_May_Triangular/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:35.53",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353942/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:43.28",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372910/Wartburg_Indoor_Select_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:15.53",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544472/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:17.51",
        "resultUrl": "https://www.tfrrs.org/results/91807/5568521/Phil_Esten_Challenge/Womens-10000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:44.66",
        "resultUrl": "https://www.tfrrs.org/results/90893/5656838/Midwest_Twilight_Final_Qualifier/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "15:06.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:40.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "6K (XC)",
        "time": "23:00.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15905": {
    "name": "Nadia Bowden",
    "tfrrsId": "8896829",
    "fetchedAt": "2026-09-12T22:30:32.974Z",
    "bests": [
      {
        "event": "800",
        "time": "2:15.46",
        "resultUrl": "https://www.tfrrs.org/results/91158/5645129/American_Rivers_Conference_Championships/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:00.51",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746779/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:43.36",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987247/American_Rivers_Conference_Championships_/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:07.01",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760497/Cyclone_Open/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:45.12",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "17:44.80",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "18:07.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "22:47.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15906": {
    "name": "Morgan Engel",
    "tfrrsId": "8700379",
    "fetchedAt": "2026-09-12T22:30:34.654Z",
    "bests": [
      {
        "event": "800",
        "time": "2:43.63",
        "resultUrl": "https://www.tfrrs.org/results/85065/5209545/UW-Platteville_Invitational/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:21.36",
        "resultUrl": "https://www.tfrrs.org/results/85065/5209539/UW-Platteville_Invitational/Womens-1500-Meters"
      },
      {
        "event": "3000",
        "time": "10:23.02",
        "resultUrl": "https://www.tfrrs.org/results/93798/5819019/American_Rivers_Conference_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "17:58.90",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "37:06.16",
        "resultUrl": "https://www.tfrrs.org/results/94839/5949086/WashU_Distance_Carnival_26/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:12.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "22:26.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26438/Paul_Short_Run_College?meet_hnd=26438"
      }
    ]
  },
  "15908": {
    "name": "Makenna Hetrick",
    "tfrrsId": "8896830",
    "fetchedAt": "2026-09-12T22:30:36.353Z",
    "bests": [
      {
        "event": "800",
        "time": "2:43.99",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746795/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:25.60",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618750/Wartburg_May_Triangular/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:52.48",
        "resultUrl": "https://www.tfrrs.org/results/87924/5405780/Liz_Wuertz_Indoor_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:48.04",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "20:06.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:48.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "15910": {
    "name": "Ella Johnson",
    "tfrrsId": "8700382",
    "fetchedAt": "2026-09-12T22:30:38.046Z",
    "bests": [
      {
        "event": "600",
        "time": "1:40.32",
        "resultUrl": "https://www.tfrrs.org/results/82468/5018300/FRIDAY_KNIGHT_LIGHTS_INDOOR_MEET/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:17.29",
        "resultUrl": "https://www.tfrrs.org/results/83705/5088473/Wartburg_Qualifier/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:12.62",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353934/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:46.56",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959858/2026_Kip_Janvrin_Open/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:12.00",
        "resultUrl": "https://www.tfrrs.org/results/93688/5833964/Wartburg_Qualifier/Womens-Mile"
      },
      {
        "event": "5000",
        "time": "18:47.52",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544472/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "PV",
        "time": "2.83m",
        "resultUrl": "https://www.tfrrs.org/results/84911/5276271/American_Rivers_Conference_Championships/Womens-Pole-Vault"
      },
      {
        "event": "5K (XC)",
        "time": "18:58.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "23:15.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15913": {
    "name": "Lydia Maas",
    "tfrrsId": "8896833",
    "fetchedAt": "2026-09-12T22:30:38.907Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:56.72",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510698/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:14.09",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:07.83",
        "resultUrl": "https://www.tfrrs.org/results/93688/5833968/Wartburg_Qualifier/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "17:27.08",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "36:32.10",
        "resultUrl": "https://www.tfrrs.org/results/94839/5949086/WashU_Distance_Carnival_26/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:18.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "6K (XC)",
        "time": "22:09.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15916": {
    "name": "Zaya Peirce",
    "tfrrsId": "8896844",
    "fetchedAt": "2026-09-12T22:30:41.376Z",
    "bests": [
      {
        "event": "800",
        "time": "2:58.60",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510739/Wartburg_Outdoor_Select/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:44.51",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510698/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "6:12.48",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380364/Friday_Knight_Lights_Indoor_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "12:13.00",
        "resultUrl": "https://www.tfrrs.org/results/87924/5405764/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "21:30.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "26:40.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "15918": {
    "name": "Megan Pickar",
    "tfrrsId": "8896840",
    "fetchedAt": "2026-09-12T22:30:43.079Z",
    "bests": [
      {
        "event": "400",
        "time": "1:04.87",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380347/Friday_Knight_Lights_Indoor_Meet/Womens-400-Meters"
      },
      {
        "event": "600",
        "time": "1:45.41",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353939/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:23.73",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810470/Liz_Wuertz_Indoor_Meet/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:18.74",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746779/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "5:05.78",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935754/Dutch_Weather_Saver_20/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:27.94",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "4K (XC)",
        "time": "16:03.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:23.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:27.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15919": {
    "name": "Anna Quillin",
    "tfrrsId": "8904663",
    "fetchedAt": "2026-09-12T22:30:43.953Z",
    "bests": [
      {
        "event": "800",
        "time": "2:23.22",
        "resultUrl": "https://www.tfrrs.org/results/90711/5542205/Mustang_Distance_Carnival__Open/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:49.39",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:06.17",
        "resultUrl": "https://www.tfrrs.org/results/93688/5833964/Wartburg_Qualifier/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:25.06",
        "resultUrl": "https://www.tfrrs.org/results/93798/5819019/American_Rivers_Conference_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:10.70",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:14.17",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996305/Midwest_Twilight_Final_Qualifier/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "15:36.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:07.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "23:24.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15920": {
    "name": "Hannah Ramsey",
    "tfrrsId": "8700388",
    "fetchedAt": "2026-09-12T22:30:44.869Z",
    "bests": [
      {
        "event": "400",
        "time": "58.32",
        "resultUrl": "https://www.tfrrs.org/results/93874/5996406/UW-La_Crosse_NCAA_Outdoor_Final_Qualifier/Womens-400-Meters"
      },
      {
        "event": "600",
        "time": "1:37.96",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746791/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:14.03",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989360/Wartburg_Qualifier/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:01.87",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760499/Cyclone_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "5:07.93",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510698/Wartburg_Outdoor_Select/Womens-1500-Meters"
      },
      {
        "event": "400H",
        "time": "1:11.05",
        "resultUrl": "https://www.tfrrs.org/results/86096/5259277/Wartburg_May_Triangular/Womens-400-Hurdles"
      },
      {
        "event": "4K (XC)",
        "time": "16:53.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "20:16.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "24:11.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15923": {
    "name": "Cali Trygstad",
    "tfrrsId": "8700393",
    "fetchedAt": "2026-09-12T22:30:45.741Z",
    "bests": [
      {
        "event": "800",
        "time": "2:39.91",
        "resultUrl": "https://www.tfrrs.org/results/90891/5568649/Meet_of_Champions/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:11.10",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935754/Dutch_Weather_Saver_20/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:43.85",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380364/Friday_Knight_Lights_Indoor_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:49.78",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764255/Friday_Knight_Lights_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:10.00",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "12:26.62",
        "resultUrl": "https://www.tfrrs.org/results/86282/5221533/Phil_Esten_Challenge/Womens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "19:02.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "23:32.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15924": {
    "name": "Ava Vance",
    "tfrrsId": "8896837",
    "fetchedAt": "2026-09-12T22:30:47.424Z",
    "bests": [
      {
        "event": "MILE",
        "time": "5:38.97",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372934/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:33.98",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:08.20",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544472/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:08.33",
        "resultUrl": "https://www.tfrrs.org/results/91807/5568521/Phil_Esten_Challenge/Womens-10000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "15:17.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:25.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "6K (XC)",
        "time": "22:17.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15925": {
    "name": "Grace Vortherms",
    "tfrrsId": "8896832",
    "fetchedAt": "2026-09-12T22:30:49.117Z",
    "bests": [
      {
        "event": "800",
        "time": "2:49.98",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380346/Friday_Knight_Lights_Indoor_Meet/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:27.78",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935754/Dutch_Weather_Saver_20/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:53.26",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "11:23.71",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "19:34.03",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544472/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "42:59.65",
        "resultUrl": "https://www.tfrrs.org/results/95719/5886049/Wartburg_outdoor_Select_10k/Womens-10000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "16:34.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "20:20.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:53.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15926": {
    "name": "Jillian Borgelt",
    "tfrrsId": "9200728",
    "fetchedAt": "2026-09-12T22:30:32.125Z",
    "bests": [
      {
        "event": "800",
        "time": "2:42.23",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746795/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-800-Meters"
      },
      {
        "event": "MILE",
        "time": "5:35.88",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:52.90",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:43.04",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "41:07.05",
        "resultUrl": "https://www.tfrrs.org/results/95719/5886049/Wartburg_outdoor_Select_10k/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "19:41.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:57.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/27186/Saga_Cup?meet_hnd=27186"
      }
    ]
  },
  "15927": {
    "name": "Lily Cooper",
    "tfrrsId": "9200730",
    "fetchedAt": "2026-09-12T22:30:33.816Z",
    "bests": [
      {
        "event": "800",
        "time": "2:30.94",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764267/Friday_Knight_Lights_Indoor_Meet/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "5:05.44",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:34.81",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:52.93",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:57.41",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "16:23.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:58.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:48.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15928": {
    "name": "Janae Hansen",
    "tfrrsId": "9200727",
    "fetchedAt": "2026-09-12T22:30:35.500Z",
    "bests": [
      {
        "event": "600",
        "time": "1:44.33",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746791/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:15.58",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987259/American_Rivers_Conference_Championships_/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:12.18",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760499/Cyclone_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:50.40",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "20:25.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26341/Trent_Smith_Invitational?meet_hnd=26341"
      },
      {
        "event": "6K (XC)",
        "time": "24:21.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26874/Dan_Huston_Invitational?meet_hnd=26874"
      }
    ]
  },
  "15929": {
    "name": "Claire Hoyer",
    "tfrrsId": "9200724",
    "fetchedAt": "2026-09-12T22:30:37.199Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:53.58",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935754/Dutch_Weather_Saver_20/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:26.18",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777318/Wartburg_Indoor_Select_Meet/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:41.09",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764253/Friday_Knight_Lights_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:03.18",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959856/2026_Kip_Janvrin_Open/Womens-5000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "15:06.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "18:08.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "22:50.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15931": {
    "name": "Leah McDonald",
    "tfrrsId": "9200729",
    "fetchedAt": "2026-09-12T22:30:39.735Z",
    "bests": [
      {
        "event": "800",
        "time": "2:35.42",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746795/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-800-Meters"
      },
      {
        "event": "MILE",
        "time": "5:32.88",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746777/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:35.20",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810460/Liz_Wuertz_Indoor_Meet/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:28.54",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "11:24.56",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996305/Midwest_Twilight_Final_Qualifier/Womens-3000-Steeplechase"
      },
      {
        "event": "4K (XC)",
        "time": "15:20.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "18:10.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "22:47.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26438/Paul_Short_Run_College?meet_hnd=26438"
      }
    ]
  },
  "15932": {
    "name": "Peyton Morey",
    "tfrrsId": "9200732",
    "fetchedAt": "2026-09-12T22:30:40.559Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:51.61",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:16.31",
        "resultUrl": "https://www.tfrrs.org/results/93688/5833964/Wartburg_Qualifier/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:25.54",
        "resultUrl": "https://www.tfrrs.org/results/93798/5819019/American_Rivers_Conference_Championships/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:20.66",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "40:58.07",
        "resultUrl": "https://www.tfrrs.org/results/95719/5886049/Wartburg_outdoor_Select_10k/Womens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "18:49.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "23:20.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15933": {
    "name": "Marissa Pewe",
    "tfrrsId": "9200731",
    "fetchedAt": "2026-09-12T22:30:42.217Z",
    "bests": [
      {
        "event": "800",
        "time": "2:21.44",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810470/Liz_Wuertz_Indoor_Meet/Womens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:53.10",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:27.87",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760497/Cyclone_Open/Womens-Mile"
      },
      {
        "event": "3000",
        "time": "10:59.78",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746783/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "18:36.09",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "4K (XC)",
        "time": "15:59.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "19:14.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "6K (XC)",
        "time": "22:15.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15934": {
    "name": "Lailah Utnage",
    "tfrrsId": "9200733",
    "fetchedAt": "2026-09-12T22:30:46.583Z",
    "bests": [
      {
        "event": "4K (XC)",
        "time": "18:40.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "5K (XC)",
        "time": "20:01.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "24:45.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "15935": {
    "name": "Ava Vanderheyden",
    "tfrrsId": "9200722",
    "fetchedAt": "2026-09-12T22:30:48.252Z",
    "bests": [
      {
        "event": "4K (XC)",
        "time": "18:55.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      }
    ]
  },
  "15936": {
    "name": "Bethany Warren",
    "tfrrsId": "9200723",
    "fetchedAt": "2026-09-12T22:30:49.950Z",
    "bests": [
      {
        "event": "600",
        "time": "1:40.34",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746791/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Womens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:16.14",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989360/Wartburg_Qualifier/Womens-800-Meters"
      },
      {
        "event": "1000",
        "time": "3:00.23",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760499/Cyclone_Open/Womens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:49.90",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951003/Wartburg_April_Tri/Womens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "5:10.50",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810456/Liz_Wuertz_Indoor_Meet/Womens-Mile"
      },
      {
        "event": "5000",
        "time": "18:46.88",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929085/UW-Platteville_Invitational/Womens-5000-Meters"
      },
      {
        "event": "400H",
        "time": "1:06.53",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989356/Wartburg_Qualifier/Womens-400-Hurdles"
      },
      {
        "event": "3000S",
        "time": "11:27.81",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987251/American_Rivers_Conference_Championships_/Womens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "18:49.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "23:02.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16878": {
    "name": "Hutton Edney",
    "tfrrsId": "8585412",
    "fetchedAt": "2026-09-12T22:29:52.734Z",
    "bests": [
      {
        "event": "400",
        "time": "49.69",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618722/Wartburg_May_Triangular/Mens-400-Meters"
      },
      {
        "event": "800",
        "time": "1:50.60",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996336/Midwest_Twilight_Final_Qualifier/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:28.37",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:02.99",
        "resultUrl": "https://www.tfrrs.org/results/86096/5259288/Wartburg_May_Triangular/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:15.89",
        "resultUrl": "https://www.tfrrs.org/results/82470/5062034/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:46.87",
        "resultUrl": "https://www.tfrrs.org/results/82471/5008744/Jack_Jennett_Invitational/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:58.43",
        "resultUrl": "https://www.tfrrs.org/results/87691/5321250/Frigid_Bee_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:41.09",
        "resultUrl": "https://www.tfrrs.org/results/86282/5221528/Phil_Esten_Challenge/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:15.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "18:54.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:19.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "16881": {
    "name": "Luke Hagenberg",
    "tfrrsId": "9200674",
    "fetchedAt": "2026-09-12T22:29:56.980Z",
    "bests": [
      {
        "event": "800",
        "time": "2:02.01",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777331/Wartburg_Indoor_Select_Meet/Mens-800-Meters"
      },
      {
        "event": "MILE",
        "time": "4:23.54",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760498/Cyclone_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:59.10",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746784/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:07.32",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:50.00",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935757/Dutch_Weather_Saver_20/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:56.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:11.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:06.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16883": {
    "name": "Ryan Heden",
    "tfrrsId": "9200665",
    "fetchedAt": "2026-09-12T22:29:58.967Z",
    "bests": [
      {
        "event": "800",
        "time": "1:57.47",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951013/Wartburg_April_Tri/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:37.56",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:59.33",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959857/2026_Kip_Janvrin_Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:22.40",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810457/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "5000",
        "time": "15:35.71",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:47.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:44.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:06.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16885": {
    "name": "Alex Horstman",
    "tfrrsId": "8585415",
    "fetchedAt": "2026-09-12T22:30:00.651Z",
    "bests": [
      {
        "event": "1000",
        "time": "2:44.26",
        "resultUrl": "https://www.tfrrs.org/results/82468/5018285/FRIDAY_KNIGHT_LIGHTS_INDOOR_MEET/Mens-1000-Meters"
      },
      {
        "event": "MILE",
        "time": "4:31.16",
        "resultUrl": "https://www.tfrrs.org/results/82468/5018280/FRIDAY_KNIGHT_LIGHTS_INDOOR_MEET/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:45.03",
        "resultUrl": "https://www.tfrrs.org/results/82470/5062033/Liz_Wuertz_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:37.09",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:00.87",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544471/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "30:36.91",
        "resultUrl": "https://www.tfrrs.org/results/86282/5221522/Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:20.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "8K (XC)",
        "time": "24:54.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16891": {
    "name": "Caden Kueker",
    "tfrrsId": "8896804",
    "fetchedAt": "2026-09-12T22:30:04.947Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:34.58",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510725/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "3000",
        "time": "9:15.66",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764258/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:00.21",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:32.87",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:34.63",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989344/Wartburg_Qualifier/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:41.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:40.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:45.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16895": {
    "name": "Jonathan Meyer",
    "tfrrsId": "8585436",
    "fetchedAt": "2026-09-12T22:30:12.516Z",
    "bests": [
      {
        "event": "800",
        "time": "2:21.90",
        "resultUrl": "https://www.tfrrs.org/results/82470/5062045/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:46.57",
        "resultUrl": "https://www.tfrrs.org/results/95358/5924251/Mustang_Distance_Carnival__Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:56.73",
        "resultUrl": "https://www.tfrrs.org/results/82470/5062034/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "10:02.62",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372911/Wartburg_Indoor_Select_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "11:01.84",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "17:23.31",
        "resultUrl": "https://www.tfrrs.org/results/85000/5169252/Wartburg_Outdoor_Select/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "38:32.83",
        "resultUrl": "https://www.tfrrs.org/results/90891/5568630/Meet_of_Champions/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "17:10.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "22:12.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "28:52.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16899": {
    "name": "Ben Neville",
    "tfrrsId": "8896800",
    "fetchedAt": "2026-09-12T22:30:15.987Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:33.17",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372912/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:35.86",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810461/Liz_Wuertz_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:24.23",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:52.07",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:28.88",
        "resultUrl": "https://www.tfrrs.org/results/93872/5938573/UW-La_Crosse_Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:17.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "8K (XC)",
        "time": "26:02.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26874/Dan_Huston_Invitational?meet_hnd=26874"
      }
    ]
  },
  "16903": {
    "name": "Alex Pries",
    "tfrrsId": "8896792",
    "fetchedAt": "2026-09-12T22:30:19.378Z",
    "bests": [
      {
        "event": "800",
        "time": "2:14.82",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810471/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:31.47",
        "resultUrl": "https://www.tfrrs.org/results/95358/5924251/Mustang_Distance_Carnival__Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:46.08",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810457/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:42.05",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777323/Wartburg_Indoor_Select_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "16:49.35",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "17:28.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/28456/John_Kurtt_Invitational?meet_hnd=28456"
      },
      {
        "event": "8K (XC)",
        "time": "29:09.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "16906": {
    "name": "Sawyer Schmidt",
    "tfrrsId": "8896826",
    "fetchedAt": "2026-09-12T22:30:23.632Z",
    "bests": [
      {
        "event": "600",
        "time": "1:30.60",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746792/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-600-Meters"
      },
      {
        "event": "800",
        "time": "2:02.81",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810471/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:32.17",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510725/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "17:57.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "22:12.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "30:36.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "16908": {
    "name": "Austin Soldwisch",
    "tfrrsId": "9200672",
    "fetchedAt": "2026-09-12T22:30:25.292Z",
    "bests": [
      {
        "event": "800",
        "time": "2:08.55",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935751/Dutch_Weather_Saver_20/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:17.40",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935752/Dutch_Weather_Saver_20/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:35.45",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:05.61",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764258/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:59.18",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:40.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:27.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:35.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16912": {
    "name": "Nathan Ahern",
    "tfrrsId": "9200680",
    "fetchedAt": "2026-09-12T22:29:39.994Z",
    "bests": [
      {
        "event": "600",
        "time": "1:23.07",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746792/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-600-Meters"
      },
      {
        "event": "800",
        "time": "1:49.96",
        "resultUrl": "https://www.tfrrs.org/results/96718/6003472/NCAA_Division_III_Outdoor_Track__Field_Championships/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:28.62",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:49.67",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987248/American_Rivers_Conference_Championships_/Mens-1500-Meters"
      },
      {
        "event": "6K (XC)",
        "time": "21:17.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "27:46.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16913": {
    "name": "Ahmed Aldamak",
    "tfrrsId": "8896801",
    "fetchedAt": "2026-09-12T22:29:40.835Z",
    "bests": [
      {
        "event": "1500",
        "time": "3:49.88",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996332/Midwest_Twilight_Final_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:14.29",
        "resultUrl": "https://www.tfrrs.org/results/93798/5819016/American_Rivers_Conference_Championships/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:28.39",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746784/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:31.92",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:21.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "19:21.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "24:51.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16914": {
    "name": "AJ Angus",
    "tfrrsId": "8896799",
    "fetchedAt": "2026-09-12T22:29:41.682Z",
    "bests": [
      {
        "event": "800",
        "time": "1:55.17",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959855/2026_Kip_Janvrin_Open/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:36.94",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746780/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:04.47",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989350/Wartburg_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:57.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:04.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:28.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16915": {
    "name": "Cooper Bankston",
    "tfrrsId": "8585408",
    "fetchedAt": "2026-09-12T22:29:42.554Z",
    "bests": [
      {
        "event": "800",
        "time": "2:10.11",
        "resultUrl": "https://www.tfrrs.org/results/82468/5018302/FRIDAY_KNIGHT_LIGHTS_INDOOR_MEET/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:20.85",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510725/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:38.77",
        "resultUrl": "https://www.tfrrs.org/results/82468/5018280/FRIDAY_KNIGHT_LIGHTS_INDOOR_MEET/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:58.82",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810461/Liz_Wuertz_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:50.53",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:36.12",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "34:36.57",
        "resultUrl": "https://www.tfrrs.org/results/95719/5886050/Wartburg_outdoor_Select_10k/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:45.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:59.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "26:11.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16928": {
    "name": "Isaiah Hammerand",
    "tfrrsId": "8585435",
    "fetchedAt": "2026-09-12T22:29:58.135Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:04.31",
        "resultUrl": "https://www.tfrrs.org/results/85000/5169239/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:22.47",
        "resultUrl": "https://www.tfrrs.org/results/82470/5062034/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:10.18",
        "resultUrl": "https://www.tfrrs.org/results/93798/5819020/American_Rivers_Conference_Championships/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:19.84",
        "resultUrl": "https://www.tfrrs.org/results/86096/5259294/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "13:59.93",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "29:20.48",
        "resultUrl": "https://www.tfrrs.org/results/94839/5949087/WashU_Distance_Carnival_26/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:01.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/22093/John_Kurtt_Invitational?meet_hnd=22093"
      },
      {
        "event": "6K (XC)",
        "time": "18:12.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "23:44.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16932": {
    "name": "Garrison Hubka",
    "tfrrsId": "8585420",
    "fetchedAt": "2026-09-12T22:30:01.500Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.07",
        "resultUrl": "https://www.tfrrs.org/results/86282/5221526/Phil_Esten_Challenge/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:02.74",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951004/Wartburg_April_Tri/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:21.07",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760498/Cyclone_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:35.25",
        "resultUrl": "https://www.tfrrs.org/results/93688/5833969/Wartburg_Qualifier/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:46.88",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:13.81",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996306/Midwest_Twilight_Final_Qualifier/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:39.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:26.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "26:14.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16936": {
    "name": "Nathan Kinzer",
    "tfrrsId": "8585417",
    "fetchedAt": "2026-09-12T22:30:04.068Z",
    "bests": [
      {
        "event": "800",
        "time": "1:57.46",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764268/Friday_Knight_Lights_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "3:49.71",
        "resultUrl": "https://www.tfrrs.org/results/91158/5645118/American_Rivers_Conference_Championships/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:09.93",
        "resultUrl": "https://www.tfrrs.org/results/94169/5791160/BU_David_Hemery_Valentine_Invitational_Collegiate/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:28.21",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746784/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:52.68",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "14:44.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:05.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:00.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16939": {
    "name": "Connor Martin",
    "tfrrsId": "9200678",
    "fetchedAt": "2026-09-12T22:30:09.119Z",
    "bests": [
      {
        "event": "800",
        "time": "1:58.92",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810471/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:35.59",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:53.32",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989350/Wartburg_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:18.43",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810457/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "5000",
        "time": "15:14.57",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:46.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:09.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:21.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16943": {
    "name": "Drew Moser",
    "tfrrsId": "8896795",
    "fetchedAt": "2026-09-12T22:30:14.250Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:05.39",
        "resultUrl": "https://www.tfrrs.org/results/92079/5596523/2025_Kip_Janvrin_Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:29.33",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372912/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:53.63",
        "resultUrl": "https://www.tfrrs.org/results/87924/5405766/Liz_Wuertz_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:08.72",
        "resultUrl": "https://www.tfrrs.org/results/93047/5712015/Frigid_Bee_Opener/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "10:03.92",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510747/Wartburg_Outdoor_Select/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "14:57.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:03.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:05.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16947": {
    "name": "Brendan Owens",
    "tfrrsId": "8896793",
    "fetchedAt": "2026-09-12T22:30:18.521Z",
    "bests": [
      {
        "event": "800",
        "time": "2:02.86",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777331/Wartburg_Indoor_Select_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:07.92",
        "resultUrl": "https://www.tfrrs.org/results/95876/5951004/Wartburg_April_Tri/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:21.92",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810457/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:55.49",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764256/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:37.52",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:50.81",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989353/Wartburg_Qualifier/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:59.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:07.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "26:30.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16951": {
    "name": "AJ Schermerhorn",
    "tfrrsId": "9200676",
    "fetchedAt": "2026-09-12T22:30:22.758Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:21.62",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:33.65",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764254/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:43.57",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "30:26.93",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989344/Wartburg_Qualifier/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "14:57.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:40.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:18.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16956": {
    "name": "Nolan Wieneke",
    "tfrrsId": "9200667",
    "fetchedAt": "2026-09-12T22:30:27.818Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.47",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810471/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:36.30",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:06.05",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935752/Dutch_Weather_Saver_20/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:31.82",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "5000",
        "time": "15:56.07",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:00.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:16.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:49.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16962": {
    "name": "Ethan Boston",
    "tfrrsId": "9200679",
    "fetchedAt": "2026-09-12T22:29:44.205Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:31.91",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:46.82",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764256/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:54.21",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:19.76",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996306/Midwest_Twilight_Final_Qualifier/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:04.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:22.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:27.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16963": {
    "name": "Ayden Buchanan",
    "tfrrsId": "8896802",
    "fetchedAt": "2026-09-12T22:29:45.036Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:05.86",
        "resultUrl": "https://www.tfrrs.org/results/92079/5596523/2025_Kip_Janvrin_Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:20.38",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760498/Cyclone_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:34.83",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764254/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:26.71",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:20.37",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "30:15.48",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987242/American_Rivers_Conference_Championships_/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:31.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "18:52.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "24:35.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26620/Redbird_Invitational?meet_hnd=26620"
      }
    ]
  },
  "16964": {
    "name": "Marcus Camacho",
    "tfrrsId": "8896789",
    "fetchedAt": "2026-09-12T22:29:45.866Z",
    "bests": [
      {
        "event": "600",
        "time": "1:27.46",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353929/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-600-Meters"
      },
      {
        "event": "800",
        "time": "1:54.97",
        "resultUrl": "https://www.tfrrs.org/results/93047/5712018/Frigid_Bee_Opener/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:36.01",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746780/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "4:10.95",
        "resultUrl": "https://www.tfrrs.org/results/90891/5568682/Meet_of_Champions/Mens-1500-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:06.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "21:25.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "28:12.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16965": {
    "name": "Cooper Cook",
    "tfrrsId": "8896794",
    "fetchedAt": "2026-09-12T22:29:47.565Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:31.98",
        "resultUrl": "https://www.tfrrs.org/results/87923/5380352/Friday_Knight_Lights_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:41.97",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764256/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:27.57",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:52.09",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:31.67",
        "resultUrl": "https://www.tfrrs.org/results/93872/5938573/UW-La_Crosse_Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:01.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:03.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "24:41.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16966": {
    "name": "Evan Cook",
    "tfrrsId": "9200669",
    "fetchedAt": "2026-09-12T22:29:48.398Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:23.63",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:48.18",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764256/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:55.06",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:31.10",
        "resultUrl": "https://www.tfrrs.org/results/93872/5938573/UW-La_Crosse_Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:17.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:23.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:50.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16967": {
    "name": "Derek Coulter",
    "tfrrsId": "8585423",
    "fetchedAt": "2026-09-12T22:29:49.261Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:24.83",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:49.21",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372911/Wartburg_Indoor_Select_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:35.83",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:58.20",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:25.76",
        "resultUrl": "https://www.tfrrs.org/results/93872/5938573/UW-La_Crosse_Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:00.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:07.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:03.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16968": {
    "name": "Mason Coulter",
    "tfrrsId": "9200666",
    "fetchedAt": "2026-09-12T22:29:50.118Z",
    "bests": [
      {
        "event": "800",
        "time": "2:00.70",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935751/Dutch_Weather_Saver_20/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:22.95",
        "resultUrl": "https://www.tfrrs.org/results/95358/5924251/Mustang_Distance_Carnival__Open/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:40.51",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760498/Cyclone_Open/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:28.06",
        "resultUrl": "https://www.tfrrs.org/results/93687/5810461/Liz_Wuertz_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:40.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "22:31.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "29:04.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16969": {
    "name": "Aidan Decker",
    "tfrrsId": "8896803",
    "fetchedAt": "2026-09-12T22:29:51.002Z",
    "bests": [
      {
        "event": "800",
        "time": "1:56.77",
        "resultUrl": "https://www.tfrrs.org/results/87924/5405778/Liz_Wuertz_Indoor_Meet/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "3:52.99",
        "resultUrl": "https://www.tfrrs.org/results/95878/5989350/Wartburg_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:10.79",
        "resultUrl": "https://www.tfrrs.org/results/89161/5435677/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:29.28",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372911/Wartburg_Indoor_Select_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "14:53.53",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "3000S",
        "time": "9:04.13",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996306/Midwest_Twilight_Final_Qualifier/Mens-3000-Steeplechase"
      },
      {
        "event": "5K (XC)",
        "time": "15:22.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "19:06.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:22.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26620/Redbird_Invitational?meet_hnd=26620"
      }
    ]
  },
  "16972": {
    "name": "Dawson Fricke",
    "tfrrsId": "8629072",
    "fetchedAt": "2026-09-12T22:29:55.298Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:12.25",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618723/Wartburg_May_Triangular/Mens-1500-Meters"
      },
      {
        "event": "3000",
        "time": "8:52.09",
        "resultUrl": "https://www.tfrrs.org/results/83705/5088463/Wartburg_Qualifier/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:33.77",
        "resultUrl": "https://www.tfrrs.org/results/86096/5259294/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "14:53.58",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544471/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "31:08.02",
        "resultUrl": "https://www.tfrrs.org/results/86282/5221522/Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:04.0",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:06.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:12.7",
        "resultUrl": "https://www.tfrrs.org/results/xc/24926/American_Rivers_Conference_Championships?meet_hnd=24926"
      }
    ]
  },
  "16976": {
    "name": "Gage Heyne",
    "tfrrsId": "9200670",
    "fetchedAt": "2026-09-12T22:29:59.822Z",
    "bests": [
      {
        "event": "800",
        "time": "1:54.86",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959855/2026_Kip_Janvrin_Open/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:31.41",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746780/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:56.47",
        "resultUrl": "https://www.tfrrs.org/results/96180/5996332/Midwest_Twilight_Final_Qualifier/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:16.31",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760498/Cyclone_Open/Mens-Mile"
      },
      {
        "event": "3000S",
        "time": "10:17.16",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935757/Dutch_Weather_Saver_20/Mens-3000-Steeplechase"
      },
      {
        "event": "PV",
        "time": "3.60m",
        "resultUrl": "https://www.tfrrs.org/results/96526/5987274/American_Rivers_Conference_Championships_/Mens-Pole-Vault"
      },
      {
        "event": "5K (XC)",
        "time": "15:54.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "8K (XC)",
        "time": "26:33.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16980": {
    "name": "Wes Hulseberg",
    "tfrrsId": "8896796",
    "fetchedAt": "2026-09-12T22:30:02.333Z",
    "bests": [
      {
        "event": "3000",
        "time": "9:14.26",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764258/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:16.93",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:44.71",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "33:43.57",
        "resultUrl": "https://www.tfrrs.org/results/95719/5886050/Wartburg_outdoor_Select_10k/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:20.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:59.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "26:27.5",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16982": {
    "name": "Camden Kilker",
    "tfrrsId": "8585410",
    "fetchedAt": "2026-09-12T22:30:03.220Z",
    "bests": [
      {
        "event": "800",
        "time": "2:04.61",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935751/Dutch_Weather_Saver_20/Mens-800-Meters"
      },
      {
        "event": "1500",
        "time": "4:15.31",
        "resultUrl": "https://www.tfrrs.org/results/96444/5935752/Dutch_Weather_Saver_20/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:38.31",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764250/Friday_Knight_Lights_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:17.76",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777323/Wartburg_Indoor_Select_Meet/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "10:23.63",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:59.09",
        "resultUrl": "https://www.tfrrs.org/results/96386/5929057/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:12.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:13.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "27:10.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16985": {
    "name": "Aaron Lursen",
    "tfrrsId": "8585409",
    "fetchedAt": "2026-09-12T22:30:08.283Z",
    "bests": [
      {
        "event": "800",
        "time": "1:58.07",
        "resultUrl": "https://www.tfrrs.org/results/85000/5169256/Wartburg_Outdoor_Select/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:32.19",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353927/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:56.41",
        "resultUrl": "https://www.tfrrs.org/results/86096/5259288/Wartburg_May_Triangular/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:13.96",
        "resultUrl": "https://www.tfrrs.org/results/89161/5435677/Wartburg_Qualifier/Mens-Mile"
      },
      {
        "event": "5000",
        "time": "15:01.40",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544471/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:44.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "18:54.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/24504/John_Kurtt_Invitational?meet_hnd=24504"
      },
      {
        "event": "8K (XC)",
        "time": "25:48.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/24829/Dan_Huston_Invitational?meet_hnd=24829"
      }
    ]
  },
  "16987": {
    "name": "Rylan Martin",
    "tfrrsId": "8585419",
    "fetchedAt": "2026-09-12T22:30:09.962Z",
    "bests": [
      {
        "event": "800",
        "time": "1:52.20",
        "resultUrl": "https://www.tfrrs.org/results/91158/5645146/American_Rivers_Conference_Championships/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:34.16",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746780/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-1000-Meters"
      },
      {
        "event": "1500",
        "time": "3:59.14",
        "resultUrl": "https://www.tfrrs.org/results/90891/5568682/Meet_of_Champions/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:32.16",
        "resultUrl": "https://www.tfrrs.org/results/87924/5405767/Liz_Wuertz_Indoor_Meet/Mens-Mile"
      },
      {
        "event": "5K (XC)",
        "time": "15:38.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/25313/Chiburg_5k?meet_hnd=25313"
      },
      {
        "event": "6K (XC)",
        "time": "19:41.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:17.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16989": {
    "name": "Nathan Moore",
    "tfrrsId": "8896790",
    "fetchedAt": "2026-09-12T22:30:13.367Z",
    "bests": [
      {
        "event": "1500",
        "time": "4:13.10",
        "resultUrl": "https://www.tfrrs.org/results/90375/5510725/Wartburg_Outdoor_Select/Mens-1500-Meters"
      },
      {
        "event": "MILE",
        "time": "4:34.25",
        "resultUrl": "https://www.tfrrs.org/results/87922/5372912/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "8:55.07",
        "resultUrl": "https://www.tfrrs.org/results/87921/5353920/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-3000-Meters"
      },
      {
        "event": "3200",
        "time": "9:22.98",
        "resultUrl": "https://www.tfrrs.org/results/91892/5618724/Wartburg_May_Triangular/Mens-3200-Meters"
      },
      {
        "event": "5000",
        "time": "15:15.64",
        "resultUrl": "https://www.tfrrs.org/results/90261/5544471/UW-Platteville_Invitational/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "32:26.47",
        "resultUrl": "https://www.tfrrs.org/results/91807/5568522/Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:38.8",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "19:09.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "25:49.6",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16991": {
    "name": "Carter Mulford",
    "tfrrsId": "9200677",
    "fetchedAt": "2026-09-12T22:30:15.128Z",
    "bests": [
      {
        "event": "MILE",
        "time": "4:29.62",
        "resultUrl": "https://www.tfrrs.org/results/93672/5777319/Wartburg_Indoor_Select_Meet/Mens-Mile"
      },
      {
        "event": "3000",
        "time": "9:02.06",
        "resultUrl": "https://www.tfrrs.org/results/93671/5764258/Friday_Knight_Lights_Indoor_Meet/Mens-3000-Meters"
      },
      {
        "event": "5000",
        "time": "15:37.62",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959861/2026_Kip_Janvrin_Open/Mens-5000-Meters"
      },
      {
        "event": "10,000",
        "time": "33:38.20",
        "resultUrl": "https://www.tfrrs.org/results/93872/5938573/UW-La_Crosse_Phil_Esten_Challenge/Mens-10000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "15:49.9",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "20:10.4",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "26:07.2",
        "resultUrl": "https://www.tfrrs.org/results/xc/26377/American_Rivers_Conference_Championships?meet_hnd=26377"
      }
    ]
  },
  "16993": {
    "name": "Caleb Olson",
    "tfrrsId": "9200668",
    "fetchedAt": "2026-09-12T22:30:17.657Z",
    "bests": [
      {
        "event": "600",
        "time": "1:26.88",
        "resultUrl": "https://www.tfrrs.org/results/93686/5746792/CHELSEY_M_HENKENIUS_INDOOR_INVITATIONAL/Mens-600-Meters"
      },
      {
        "event": "800",
        "time": "1:59.48",
        "resultUrl": "https://www.tfrrs.org/results/96642/5959855/2026_Kip_Janvrin_Open/Mens-800-Meters"
      },
      {
        "event": "1000",
        "time": "2:44.17",
        "resultUrl": "https://www.tfrrs.org/results/94829/5760500/Cyclone_Open/Mens-1000-Meters"
      },
      {
        "event": "5K (XC)",
        "time": "16:11.3",
        "resultUrl": "https://www.tfrrs.org/results/xc/27286/Chiburg_5k?meet_hnd=27286"
      },
      {
        "event": "6K (XC)",
        "time": "21:15.1",
        "resultUrl": "https://www.tfrrs.org/results/xc/26434/John_Kurtt_Invitational?meet_hnd=26434"
      },
      {
        "event": "8K (XC)",
        "time": "27:32.4",
        "resultUrl": "https://www.tfrrs.org/res

... [truncated, file is 110845 bytes, showing first 100000] ...
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

const statsById = tfrrsStats as Record<string, AthleteStats>;

function TfrrsStats() {
  const { athlete } = useUser();

  if (!athlete) return null; // RequireIdentity already guards this route

  const stats = statsById[athlete.id];

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
    "fetch-roster-history": "node scripts/fetch-roster-history.mjs"
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
_Digest complete: 38 files inlined, 8 skipped (binary/excluded)._