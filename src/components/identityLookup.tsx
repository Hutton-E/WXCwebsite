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
