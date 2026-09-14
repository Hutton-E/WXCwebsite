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
