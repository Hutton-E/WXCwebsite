import { useState } from "react";
import { useUser } from "../context/UserContext";

// TODO: replace with real roster data parsed from your PDF (see the
// pdf-parsing pipeline discussed earlier — this array is placeholder data).
const ROSTER = ["Alex Johnson", "Jamie Smith", "Taylor Brown"];

function IdentityLookup() {
  const { setName } = useUser();
  const [query, setQuery] = useState("");

  const matches =
    query.trim().length > 0
      ? ROSTER.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
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
          {matches.map((n) => (
            <li key={n}>
              <button
                className="identity-result-item"
                onClick={() => setName(n)}
              >
                {n}
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
