import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import { parseMileagePdf, parseWorkoutsPdf } from "../lib/pdfParser";
import type { MileageRow, WorkoutRow, WorkoutGroupDefinition } from "../lib/pdfParser";
import { upsertMileageRows, upsertWorkoutData } from "../lib/adminData";
import type { MatchedRow, TeamScopedGroupDefinition } from "../lib/adminData";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";
import { fetchAliasesForSeason, upsertAlias } from "../lib/aliasData";
import { buildNameLookup, buildAliasLookup, matchName, normalizeName } from "../lib/nameMatching";

const CURRENT_SEASON = 2026;

type Mode = "mileage" | "workouts";

function buildTeamScopedGroupDefinitions(
  groupDefinitions: WorkoutGroupDefinition[],
  workoutRows: MatchedRow<WorkoutRow>[],
  athletes: AthleteRecord[],
): TeamScopedGroupDefinition[] {
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const result: TeamScopedGroupDefinition[] = [];

  for (const def of groupDefinitions) {
    const teamsForThisDefinition = new Set(
      workoutRows
        .filter(
          (r) =>
            r.data.groupLetter === def.groupLetter &&
            r.data.pageIndex === def.pageIndex &&
            r.athleteId,
        )
        .map((r) => athleteById.get(r.athleteId)?.team)
        .filter((t): t is string => !!t),
    );

    for (const team of teamsForThisDefinition) {
      result.push({ groupLetter: def.groupLetter, description: def.description, team });
    }
  }

  return result;
}

function AdminDashboard() {
  const { signOut } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("mileage");
  const [weekOf, setWeekOf] = useState("");
  const [day, setDay] = useState<"tuesday" | "friday">("tuesday");

  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [aliases, setAliases] = useState<{ alias_name: string; athlete_id: string }[]>([]);
  const [athletesLoaded, setAthletesLoaded] = useState(false);

  const [mileageMatches, setMileageMatches] = useState<MatchedRow<MileageRow>[] | null>(null);
  const [workoutMatches, setWorkoutMatches] = useState<MatchedRow<WorkoutRow>[] | null>(null);
  const [groupDefinitions, setGroupDefinitions] = useState<WorkoutGroupDefinition[]>([]);

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
      .catch((err) => setStatus(`Failed to load athlete roster: ${err.message}`));
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
        setWorkoutMatches(null);
      } else {
        const parsed = await parseWorkoutsPdf(file);
        setWorkoutMatches(runMatching(parsed.workoutRows));
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

  function updateWorkoutMatch(index: number, athleteId: string) {
    setWorkoutMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  function updateGroupDescription(index: number, description: string) {
    setGroupDefinitions((prev) =>
      prev.map((g, i) => (i === index ? { ...g, description } : g)),
    );
  }

  function removeMileageRow(index: number) {
    setMileageMatches((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function removeWorkoutRow(index: number) {
    setWorkoutMatches((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  const mileageUnmatchedCount = mileageMatches?.filter((r) => !r.athleteId).length ?? 0;
  const workoutUnmatchedCount = workoutMatches?.filter((r) => !r.athleteId).length ?? 0;

  async function learnAliasesFrom<T extends { name: string }>(rows: MatchedRow<T>[]) {
    const athleteById = new Map(athletes.map((a) => [a.id, a.name]));

    const aliasesToLearn = rows.filter((row) => {
      if (!row.athleteId) return false;
      const realName = athleteById.get(row.athleteId);
      return realName && normalizeName(row.data.name) !== normalizeName(realName);
    });

    await Promise.all(
      aliasesToLearn.map((row) =>
        upsertAlias(CURRENT_SEASON, row.data.name, row.athleteId).catch((err) =>
          console.warn(`Failed to save alias for "${row.data.name}":`, err),
        ),
      ),
    );
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
      } else if (mode === "workouts" && workoutMatches) {
        const resolved = workoutMatches.filter((r) => r.athleteId);

        const teamScopedGroups = buildTeamScopedGroupDefinitions(
          groupDefinitions,
          resolved,
          athletes,
        );

        const count = await upsertWorkoutData(
          resolved,
          teamScopedGroups,
          weekOf,
          day,
          CURRENT_SEASON,
        );
        await learnAliasesFrom(resolved);

        setStatus(
          `✅ Saved ${count} workout rows (${teamScopedGroups.length} team-scoped group definitions) for ${day}, week of ${weekOf}.`,
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
            setWorkoutMatches(null);
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
            setWorkoutMatches(null);
            setStatus(null);
          }}
        >
          Workouts
        </button>
        <Link to="/admin/fms" className="nav-menu-item admin-nav-link">
          FMS Correctives
        </Link>
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

      {!athletesLoaded && <p className="admin-status">Loading athlete roster...</p>}
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
                  <tr key={i} className={!r.athleteId ? "admin-row-unmatched" : ""}>
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
                      <button className="admin-remove-btn" onClick={() => removeMileageRow(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="nav-menu-trigger" onClick={handleSubmit} disabled={busy}>
            Save to Database
          </button>
        </div>
      )}

      {mode === "workouts" && workoutMatches && (
        <div className="admin-preview">
          {groupDefinitions.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Description (edit if garbled)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupDefinitions.map((g, i) => (
                    <tr key={`${g.pageIndex}-${g.groupLetter}`}>
                      <td>{g.groupLetter}</td>
                      <td>
                        <textarea
                          className="admin-description-edit"
                          value={g.description}
                          onChange={(e) => updateGroupDescription(i, e.target.value)}
                          rows={2}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="admin-preview-count">
            {workoutMatches.length} workout rows
            {workoutUnmatchedCount > 0 && ` — ${workoutUnmatchedCount} unmatched`}
          </p>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Parsed Name</th>
                  <th>Group</th>
                  <th>Intervals</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workoutMatches.map((r, i) => (
                  <tr key={i} className={!r.athleteId ? "admin-row-unmatched" : ""}>
                    <td>
                      <AthleteSelect
                        value={r.athleteId}
                        onChange={(id) => updateWorkoutMatch(i, id)}
                      />
                    </td>
                    <td>{r.data.name}</td>
                    <td>{r.data.groupLetter ?? "—"}</td>
                    <td>
                      {Object.entries(r.data.intervals)
                        .map(([label, value]) => `${label}: ${value}`)
                        .join(" | ") || "—"}
                    </td>
                    <td>{r.data.note ?? "—"}</td>
                    <td>
                      <button className="admin-remove-btn" onClick={() => removeWorkoutRow(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="nav-menu-trigger" onClick={handleSubmit} disabled={busy}>
            Save to Database
          </button>
        </div>
      )}

      <button className="admin-signout-link acme-regular text-outline" onClick={signOut}>
        Sign Out
      </button>
    </div>
  );
}

export default AdminDashboard;