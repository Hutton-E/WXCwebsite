# Repository Digest

Generated: 2026-09-12T22:28:43.045Z
Root: `WXC_Website`

## Directory Structure

```
WXC_Website/
├── public/
├── scripts/
│   ├── fech-tfrrs-ids.mjs
│   ├── fetch-roster.mjs
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
│   │   └── distance_roster.json
│   ├── pages/
│   │   ├── about.tsx
│   │   ├── corePage.tsx
│   │   ├── error.tsx
│   │   ├── fms.tsx
│   │   ├── home.tsx
│   │   ├── liftingSheet.tsx
│   │   ├── mileagePage.tsx
│   │   └── name_lookup.tsx
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

### `scripts/fech-tfrrs-ids.mjs`

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

const ROSTER_PATH = path.resolve("src/data/distance_roster.json");

// Add entries here when automatic matching fails due to spelling/nickname
// differences between go-knights.net and TFRRS. Key = your roster id.
const MANUAL_OVERRIDES = {
  // "17015": "9444002", // e.g. Philip Dahlen -> TFRRS Phillip Dahlen
  // "17028": "9444015", // e.g. Adam Wilke -> TFRRS Adam Wilkie
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

### `scripts/fetch-roster.mjs`

```javascript
#!/usr/bin/env node
/**
 * fetch-roster.mjs
 *
 * Fetches the men's and women's cross country rosters from go-knights.net,
 * parses the roster table, and writes structured JSON to src/data/roster.json.
 *
 * Run this whenever the roster changes (each new season).
 *
 * Usage: node scripts/fetch-roster.mjs
 */

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const TEAMS = [
  {
    url: "https://go-knights.net/sports/mens-cross-country/roster",
    team: "mens-cross-country",
  },
  {
    url: "https://go-knights.net/sports/womens-cross-country/roster",
    team: "womens-cross-country",
  },
];

const OUT_PATH = path.resolve("src/data/roster.json");

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

  // Sidearm roster pages include an accessible <table> with headers like
  // "Full Name", "Academic Year", "Hometown / High School". Find it generically
  // by header text so this doesn't break if class names change.
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

async function main() {
  const allAthletes = [];

  for (const teamConfig of TEAMS) {
    console.log(`Fetching ${teamConfig.team}...`);
    const athletes = await fetchTeamRoster(teamConfig);
    console.log(`  Found ${athletes.length} athletes`);
    allAthletes.push(...athletes);
  }

  if (allAthletes.length === 0) {
    console.error(
      "⚠️  No athletes found. The site's table structure may have changed — " +
        "inspect the page HTML and update the selectors in this script.",
    );
    process.exit(1);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sources: TEAMS.map((t) => t.url),
    athletes: allAthletes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`✅ Wrote ${allAthletes.length} athletes to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch roster:", err);
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
import rosterData from "../data/distance_roster.json";

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
import rosterData from "../data/distance_roster.json";

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

### `src/data/distance_roster.json`

```json
{
  "generatedAt": "2026-09-12T00:00:00.000Z",
  "sources": [
    "https://go-knights.net/sports/mens-cross-country/roster",
    "https://go-knights.net/sports/womens-cross-country/roster"
  ],
  "athletes": [
    {
      "id": "16912",
      "name": "Nathan Ahern",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cresco, Iowa",
      "highSchool": "Crestwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-ahern/16912"
    },
    {
      "id": "16913",
      "name": "Ahmed Aldamak",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ahmed-aldamak/16913"
    },
    {
      "id": "16914",
      "name": "AJ Angus",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-angus/16914"
    },
    {
      "id": "16915",
      "name": "Cooper Bankston",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Baton Rouge, La.",
      "highSchool": "St. Michael",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-bankston/16915"
    },
    {
      "id": "17007",
      "name": "Jack Behrens",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jack-behrens/17007"
    },
    {
      "id": "16962",
      "name": "Ethan Boston",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn-Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ethan-boston/16962"
    },
    {
      "id": "16963",
      "name": "Ayden Buchanan",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Santa Clarita, Calif.",
      "highSchool": "Valencia",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ayden-buchanan/16963"
    },
    {
      "id": "16964",
      "name": "Marcus Camacho",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Xavier",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/marcus-camacho/16964"
    },
    {
      "id": "17014",
      "name": "Jackson Cicchinelli",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Bristol, Rhode Island",
      "highSchool": "Mt Hope",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jackson-cicchinelli/17014"
    },
    {
      "id": "16965",
      "name": "Cooper Cook",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/cooper-cook/16965"
    },
    {
      "id": "16966",
      "name": "Evan Cook",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Decatur, Ill.",
      "highSchool": "Saint Teresa",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/evan-cook/16966"
    },
    {
      "id": "16967",
      "name": "Derek Coulter",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/derek-coulter/16967"
    },
    {
      "id": "16968",
      "name": "Mason Coulter",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Oquawka, Ill.",
      "highSchool": "Mercer County",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/mason-coulter/16968"
    },
    {
      "id": "17015",
      "name": "Philip Dahlen",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Rochester, Minnesota",
      "highSchool": "John Marshall",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/philip-dahlen/17015"
    },
    {
      "id": "16969",
      "name": "Aidan Decker",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Iowa City, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-decker/16969"
    },
    {
      "id": "17016",
      "name": "Dax Duffy",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Morton, Illinois",
      "highSchool": "Peoria Notre Dame",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dax-duffy/17016"
    },
    {
      "id": "16878",
      "name": "Hutton Edney",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/hutton-edney/16878"
    },
    {
      "id": "17017",
      "name": "Toben Edney",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Huntsville, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/toben-edney/17017"
    },
    {
      "id": "17018",
      "name": "Aidan Feda",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Rochester, Minnesota",
      "highSchool": "John Marshall",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aidan-feda/17018"
    },
    {
      "id": "16972",
      "name": "Dawson Fricke",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Blair, Neb.",
      "highSchool": "Blair",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/dawson-fricke/16972"
    },
    {
      "id": "17019",
      "name": "Silas Gann",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/silas-gann/17019"
    },
    {
      "id": "16881",
      "name": "Luke Hagenberg",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Clive, Iowa",
      "highSchool": "Des Moines Christian",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/luke-hagenberg/16881"
    },
    {
      "id": "16928",
      "name": "Isaiah Hammerand",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Epworth, Iowa",
      "highSchool": "Western Dubuque",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/isaiah-hammerand/16928"
    },
    {
      "id": "16883",
      "name": "Ryan Heden",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Bettendorf, Iowa",
      "highSchool": "Bettendorf",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ryan-heden/16883"
    },
    {
      "id": "16976",
      "name": "Gage Heyne",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "North English, Iowa",
      "highSchool": "English Valleys",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/gage-heyne/16976"
    },
    {
      "id": "16885",
      "name": "Alex Horstman",
      "team": "mens-cross-country",
      "year": "Gr.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-horstman/16885"
    },
    {
      "id": "16932",
      "name": "Garrison Hubka",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Spring Valley, Minn.",
      "highSchool": "Kingsland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/garrison-hubka/16932"
    },
    {
      "id": "16980",
      "name": "Wes Hulseberg",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Williamsburg, Iowa",
      "highSchool": "Williamsburg",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/wes-hulseberg/16980"
    },
    {
      "id": "16982",
      "name": "Camden Kilker",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Davenport, Iowa",
      "highSchool": "Davenport West",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/camden-kilker/16982"
    },
    {
      "id": "16936",
      "name": "Nathan Kinzer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-kinzer/16936"
    },
    {
      "id": "16891",
      "name": "Caden Kueker",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caden-kueker/16891"
    },
    {
      "id": "17904",
      "name": "Riley Kuhn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Marion, Iowa",
      "highSchool": "Linn Mar",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/riley-kuhn/17904"
    },
    {
      "id": "17020",
      "name": "Kasey Levinsohn",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Sheboygan, Wisconsin",
      "highSchool": "North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/kasey-levinsohn/17020"
    },
    {
      "id": "17021",
      "name": "Jackson Lewis",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jackson-lewis/17021"
    },
    {
      "id": "16985",
      "name": "Aaron Lursen",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Fort Dodge, Iowa",
      "highSchool": "St. Edmond Catholic",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aaron-lursen/16985"
    },
    {
      "id": "16939",
      "name": "Connor Martin",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Falls, Iowa",
      "highSchool": "Cedar Falls",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/connor-martin/16939"
    },
    {
      "id": "16987",
      "name": "Rylan Martin",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "New London, Iowa",
      "highSchool": "New London",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/rylan-martin/16987"
    },
    {
      "id": "17022",
      "name": "James Maso",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Plainfield, Illinois",
      "highSchool": "Plainfield North",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/james-maso/17022"
    },
    {
      "id": "17023",
      "name": "Myles Matthias",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/myles-matthias/17023"
    },
    {
      "id": "16895",
      "name": "Jonathan Meyer",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Tama, Iowa",
      "highSchool": "South Tama",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jonathan-meyer/16895"
    },
    {
      "id": "16989",
      "name": "Nathan Moore",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Wylie, Tex.",
      "highSchool": "Wylie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nathan-moore/16989"
    },
    {
      "id": "16943",
      "name": "Drew Moser",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Clinton, Ill.",
      "highSchool": "Clinton",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/drew-moser/16943"
    },
    {
      "id": "16991",
      "name": "Carter Mulford",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Prairie",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/carter-mulford/16991"
    },
    {
      "id": "16899",
      "name": "Ben Neville",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Urbandale, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/ben-neville/16899"
    },
    {
      "id": "17024",
      "name": "Henry Nichols",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Silver Spring, Maryland",
      "highSchool": "Northwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/henry-nichols/17024"
    },
    {
      "id": "16993",
      "name": "Caleb Olson",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "DeWitt, Iowa",
      "highSchool": "Central DeWitt",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/caleb-olson/16993"
    },
    {
      "id": "16947",
      "name": "Brendan Owens",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/brendan-owens/16947"
    },
    {
      "id": "16903",
      "name": "Alex Pries",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Grimes, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/alex-pries/16903"
    },
    {
      "id": "17025",
      "name": "Joel Ramirez-Parra",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Storm Lake, Iowa",
      "highSchool": "Storm Lake",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/joel-ramirez-parra/17025"
    },
    {
      "id": "16997",
      "name": "Jakob Regennitter",
      "team": "mens-cross-country",
      "year": "Sr.",
      "hometown": "Marion, Iowa",
      "highSchool": "Marion",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/jakob-regennitter/16997"
    },
    {
      "id": "17030",
      "name": "Logan Rosas",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Oakville, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/logan-rosas/17030"
    },
    {
      "id": "16951",
      "name": "AJ Schermerhorn",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Ankeny, Iowa",
      "highSchool": "Ankeny Centennial",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/aj-schermerhorn/16951"
    },
    {
      "id": "16906",
      "name": "Sawyer Schmidt",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Preston, Iowa",
      "highSchool": "Northeast",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/sawyer-schmidt/16906"
    },
    {
      "id": "17000",
      "name": "Andrew Smith",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Glenwood, Iowa",
      "highSchool": "Glenwood",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/andrew-smith/17000"
    },
    {
      "id": "16908",
      "name": "Austin Soldwisch",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/austin-soldwisch/16908"
    },
    {
      "id": "17002",
      "name": "Clay Warson",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Madrid, Iowa",
      "highSchool": "Madrid",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/clay-warson/17002"
    },
    {
      "id": "17027",
      "name": "Simon Wendel",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/simon-wendel/17027"
    },
    {
      "id": "16956",
      "name": "Nolan Wieneke",
      "team": "mens-cross-country",
      "year": "So.",
      "hometown": "Juneau, Wis.",
      "highSchool": "Dodgeland",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/nolan-wieneke/16956"
    },
    {
      "id": "17028",
      "name": "Adam Wilke",
      "team": "mens-cross-country",
      "year": "Fr.",
      "hometown": "De Witt, Iowa",
      "highSchool": "Central Dewitt",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/adam-wilke/17028"
    },
    {
      "id": "17004",
      "name": "Solomon Zaugg",
      "team": "mens-cross-country",
      "year": "Jr.",
      "hometown": "Mediapolis, Iowa",
      "highSchool": "Mediapolis",
      "profileUrl": "https://go-knights.net/sports/mens-cross-country/roster/solomon-zaugg/17004"
    },

    {
      "id": "15902",
      "name": "Jade Anderson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Des Moines, Iowa",
      "highSchool": "Des Moines Lincoln",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jade-anderson/15902"
    },
    {
      "id": "15903",
      "name": "Abbey Angus",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Dallas Center-Grimes",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/abbey-angus/15903"
    },
    {
      "id": "15904",
      "name": "Sydney Bochmann",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Waverly, Iowa",
      "highSchool": "Waverly-Shell Rock",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sydney-bochmann/15904"
    },
    {
      "id": "15926",
      "name": "Jillian Borgelt",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Waunakee, Wis.",
      "highSchool": "Waunakee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/jillian-borgelt/15926"
    },
    {
      "id": "15905",
      "name": "Nadia Bowden",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New Lenox, Ill.",
      "highSchool": "Lincoln Way Central",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/nadia-bowden/15905"
    },
    {
      "id": "15927",
      "name": "Lily Cooper",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Denver, Iowa",
      "highSchool": "Denver",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-cooper/15927"
    },
    {
      "id": "15906",
      "name": "Morgan Engel",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Syosset, N.Y.",
      "highSchool": "Syosset",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/morgan-engel/15906"
    },
    {
      "id": "15907",
      "name": "Kelly Giardina",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Rockford, Ill.",
      "highSchool": "Rockford Christian",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kelly-giardina/15907"
    },
    {
      "id": "15928",
      "name": "Janae Hansen",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mason City, Iowa",
      "highSchool": "Mason City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/janae-hansen/15928"
    },
    {
      "id": "15908",
      "name": "Makenna Hetrick",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Cedar Rapids, Iowa",
      "highSchool": "Cedar Rapids Washington",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/makenna-hetrick/15908"
    },
    {
      "id": "15909",
      "name": "Sunny Horner",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New Waverly, Texas",
      "highSchool": "New Waverly",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/sunny-horner/15909"
    },
    {
      "id": "15929",
      "name": "Claire Hoyer",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Dubuque, Iowa",
      "highSchool": "Dubuque Senior",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/claire-hoyer/15929"
    },
    {
      "id": "15910",
      "name": "Ella Johnson",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Prescott, Wis.",
      "highSchool": "Prescott",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ella-johnson/15910"
    },
    {
      "id": "15930",
      "name": "Emrie Johnson",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Mount Vernon, Iowa",
      "highSchool": "Mount Vernon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/emrie-johnson/15930"
    },
    {
      "id": "15911",
      "name": "Allie Kounkel",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Clear Creek Amana",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-kounkel/15911"
    },
    {
      "id": "15912",
      "name": "Karle Kramer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Monticello, Iowa",
      "highSchool": "Monticello",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/karle-kramer/15912"
    },
    {
      "id": "15913",
      "name": "Lydia Maas",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Hampton, Iowa",
      "highSchool": "Hampton-Dumont",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lydia-maas/15913"
    },
    {
      "id": "15931",
      "name": "Leah McDonald",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Wellington, Colo.",
      "highSchool": "Poudre",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/leah-mcdonald/15931"
    },
    {
      "id": "15914",
      "name": "Maddie Merna",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Apex, N.C.",
      "highSchool": "Middle Creek",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/maddie-merna/15914"
    },
    {
      "id": "15915",
      "name": "Haley Meyer",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "New Albin, Iowa",
      "highSchool": "Kee",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/haley-meyer/15915"
    },
    {
      "id": "15932",
      "name": "Peyton Morey",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Spencer, Iowa",
      "highSchool": "Spencer",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/peyton-morey/15932"
    },
    {
      "id": "15916",
      "name": "Zaya Peirce",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Lewistown, Ill.",
      "highSchool": "Lewistown",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/zaya-peirce/15916"
    },
    {
      "id": "15917",
      "name": "Lily Peterson",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Hawley, Minn.",
      "highSchool": "Hawley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lily-peterson/15917"
    },
    {
      "id": "15933",
      "name": "Marissa Pewe",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Johnston, Iowa",
      "highSchool": "Johnston",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/marissa-pewe/15933"
    },
    {
      "id": "15918",
      "name": "Megan Pickar",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "New Hampton, Iowa",
      "highSchool": "New Hampton",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/megan-pickar/15918"
    },
    {
      "id": "15919",
      "name": "Anna Quillin",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Solon, Iowa",
      "highSchool": "Solon",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/anna-quillin/15919"
    },
    {
      "id": "15920",
      "name": "Hannah Ramsey",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "North Liberty, Iowa",
      "highSchool": "Liberty",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/hannah-ramsey/15920"
    },
    {
      "id": "15921",
      "name": "Kamryn Sherwood",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Danville, Iowa",
      "highSchool": "Danville",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/kamryn-sherwood/15921"
    },
    {
      "id": "15922",
      "name": "Allie Spredemann",
      "team": "womens-cross-country",
      "year": "Sr.",
      "hometown": "Sun Prairie, Wis.",
      "highSchool": "Sun Prairie",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/allie-spredemann/15922"
    },
    {
      "id": "15923",
      "name": "Cali Trygstad",
      "team": "womens-cross-country",
      "year": "Jr.",
      "hometown": "Clive, Iowa",
      "highSchool": "West Des Moines Valley",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/cali-trygstad/15923"
    },
    {
      "id": "15934",
      "name": "Lailah Utnage",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Alvarado, Texas",
      "highSchool": "Alvarado",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/lailah-utnage/15934"
    },
    {
      "id": "15924",
      "name": "Ava Vance",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Huxley, Iowa",
      "highSchool": "Ballard",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vance/15924"
    },
    {
      "id": "15935",
      "name": "Ava Vanderheyden",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Nevada, Iowa",
      "highSchool": "Nevada",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/ava-vanderheyden/15935"
    },
    {
      "id": "15925",
      "name": "Grace Vortherms",
      "team": "womens-cross-country",
      "year": "So.",
      "hometown": "Austin, Minn.",
      "highSchool": "Austin",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/grace-vortherms/15925"
    },
    {
      "id": "15936",
      "name": "Bethany Warren",
      "team": "womens-cross-country",
      "year": "Fr.",
      "hometown": "Forest City, Iowa",
      "highSchool": "Forest City",
      "profileUrl": "https://go-knights.net/sports/womens-cross-country/roster/bethany-warren/15936"
    }
  ]
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
  top: 30vh;
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
              <ComingSoon message="TFRRS stats aren't hooked up yet — check back soon!" />
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
    "fetch-tfrrs-stats": "node scripts/fetch-tfrrs-stats.mjs"
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

````

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
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
});
```

---

_Digest complete: 34 files inlined, 8 skipped (binary/excluded)._
