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
