import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import { parseMileagePdf, parseWorkoutsPdf } from "../lib/pdfParser";
import type {
  MileageRow,
  WorkoutAssignment,
  WorkoutGroupDefinition,
  WorkoutIntervalRow,
} from "../lib/pdfParser";
import {
  upsertMileageRows,
  upsertWorkoutData,
  upsertWorkoutIntervals,
} from "../lib/adminData";
import type { MatchedRow, TeamScopedGroupDefinition } from "../lib/adminData";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";
import { fetchAliasesForSeason, upsertAlias } from "../lib/aliasData";
import { buildNameLookup, buildAliasLookup, matchName, normalizeName } from "../lib/nameMatching";

const CURRENT_SEASON = 2026;

type Mode = "mileage" | "workouts";

// Determines which team(s) each parsed group letter actually belongs to,
// based on the real team of the athletes matched to that letter ON THE
// SAME PAGE — since the same letter (e.g. "A") can mean a different
// workout for the men's team vs. the women's team on the same day.
function buildTeamScopedGroupDefinitions(
  groupDefinitions: WorkoutGroupDefinition[],
  assignments: MatchedRow<WorkoutAssignment>[],
  athletes: AthleteRecord[],
): TeamScopedGroupDefinition[] {
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const result: TeamScopedGroupDefinition[] = [];

  for (const def of groupDefinitions) {
    const teamsForThisDefinition = new Set(
      assignments
        .filter(
          (a) =>
            a.data.groupLetter === def.groupLetter &&
            a.data.pageIndex === def.pageIndex &&
            a.athleteId,
        )
        .map((a) => athleteById.get(a.athleteId)?.team)
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
  const [assignmentMatches, setAssignmentMatches] = useState<MatchedRow<WorkoutAssignment>[] | null>(null);
  const [intervalMatches, setIntervalMatches] = useState<MatchedRow<WorkoutIntervalRow>[] | null>(null);
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
        setAssignmentMatches(null);
        setIntervalMatches(null);
      } else {
        const parsed = await parseWorkoutsPdf(file);
        setAssignmentMatches(runMatching(parsed.assignments));
        setIntervalMatches(runMatching(parsed.intervalRows));
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

  function updateAssignmentMatch(index: number, athleteId: string) {
    setAssignmentMatches((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, athleteId } : r)) : prev,
    );
  }

  function updateIntervalMatch(index: number, athleteId: string) {
    setIntervalMatches((prev) =>
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

  function removeAssignmentRow(index: number) {
    setAssignmentMatches((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  function removeIntervalRow(index: number) {
    setIntervalMatches((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  const mileageUnmatchedCount = mileageMatches?.filter((r) => !r.athleteId).length ?? 0;
  const assignmentUnmatchedCount = assignmentMatches?.filter((r) => !r.athleteId).length ?? 0;
  const intervalUnmatchedCount = intervalMatches?.filter((r) => !r.athleteId).length ?? 0;

  // Fires all alias-saving requests in parallel instead of one-at-a-time —
  // with up to ~100 rows on a busy week, sequential awaits could take
  // 15-20+ seconds with zero visible progress, which read as a hang.
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
      } else if (mode === "workouts") {
        const resolvedAssignments = (assignmentMatches ?? []).filter((r) => r.athleteId);
        const resolvedIntervals = (intervalMatches ?? []).filter((r) => r.athleteId);

        const teamScopedGroups = buildTeamScopedGroupDefinitions(
          groupDefinitions,
          resolvedAssignments,
          athletes,
        );

        const groupCount = await upsertWorkoutData(
          resolvedAssignments,
          teamScopedGroups,
          weekOf,
          day,
          CURRENT_SEASON,
        );
        const intervalCount = await upsertWorkoutIntervals(
          resolvedIntervals,
          weekOf,
          day,
          CURRENT_SEASON,
        );
        await learnAliasesFrom(resolvedAssignments);
        await learnAliasesFrom(resolvedIntervals);

        setStatus(
          `✅ Saved ${groupCount} group assignments (${teamScopedGroups.length} team-scoped group definitions) and ${intervalCount} interval entries for ${day}, week of ${weekOf}.`,
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
            setAssignmentMatches(null);
            setIntervalMatches(null);
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
            setAssignmentMatches(null);
            setIntervalMatches(null);
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

      {mode === "workouts" && (assignmentMatches || intervalMatches) && (
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

          {assignmentMatches && assignmentMatches.length > 0 && (
            <>
              <p className="admin-preview-count">
                {assignmentMatches.length} group assignments
                {assignmentUnmatchedCount > 0 && ` — ${assignmentUnmatchedCount} unmatched`}
              </p>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Parsed Name</th>
                      <th>Group</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentMatches.map((r, i) => (
                      <tr key={i} className={!r.athleteId ? "admin-row-unmatched" : ""}>
                        <td>
                          <AthleteSelect
                            value={r.athleteId}
                            onChange={(id) => updateAssignmentMatch(i, id)}
                          />
                        </td>
                        <td>{r.data.name}</td>
                        <td>{r.data.groupLetter}</td>
                        <td>
                          <button
                            className="admin-remove-btn"
                            onClick={() => removeAssignmentRow(i)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {intervalMatches && intervalMatches.length > 0 && (
            <>
              <p className="admin-preview-count">
                {intervalMatches.length} interval rows
                {intervalUnmatchedCount > 0 && ` — ${intervalUnmatchedCount} unmatched`}
              </p>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Parsed Name</th>
                      <th>Intervals</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {intervalMatches.map((r, i) => (
                      <tr key={i} className={!r.athleteId ? "admin-row-unmatched" : ""}>
                        <td>
                          <AthleteSelect
                            value={r.athleteId}
                            onChange={(id) => updateIntervalMatch(i, id)}
                          />
                        </td>
                        <td>{r.data.name}</td>
                        <td>
                          {Object.entries(r.data.intervals)
                            .map(([label, value]) => `${label}: ${value}`)
                            .join(" | ")}
                        </td>
                        <td>
                          <button className="admin-remove-btn" onClick={() => removeIntervalRow(i)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

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