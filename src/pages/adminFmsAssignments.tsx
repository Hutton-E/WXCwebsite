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
import { useNavigate } from "react-router-dom";

const CURRENT_SEASON = 2026;

interface MatchedAssignment {
  rawName: string;
  category: string;
  variant: string;
  athleteId: string;
}

function AdminFmsAssignments() {
  const { signOut } = useAdminAuth();
  const navigate = useNavigate();
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

      <button
        className="nav-menu-item admin-nav-link"
        onClick={() => navigate(-1)}
      >
        ← Back to Dashboard
      </button>

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
        className="admin-signout-link acme-regular text-outline"
        onClick={signOut}
      >
        Sign Out
      </button>
    </div>
  );
}

export default AdminFmsAssignments;
