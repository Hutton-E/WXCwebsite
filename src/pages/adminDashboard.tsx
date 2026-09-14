import { useState } from "react";
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

type Mode = "mileage" | "workouts";

interface WorkoutData {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
  intervalRows: WorkoutIntervalRow[];
}

function AdminDashboard() {
  const { signOut } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("mileage");
  const [weekOf, setWeekOf] = useState("");
  const [day, setDay] = useState<"tuesday" | "friday">("tuesday");

  const [mileageRows, setMileageRows] = useState<MileageRow[] | null>(null);
  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus(null);
    setBusy(true);
    try {
      if (mode === "mileage") {
        const rows = await parseMileagePdf(file);
        setMileageRows(rows);
        setWorkoutData(null);
      } else {
        const data = await parseWorkoutsPdf(file);
        setWorkoutData(data);
        setMileageRows(null);
      }
    } catch (err) {
      setStatus(`Failed to parse PDF: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!weekOf) {
      setStatus("Please select the week's date first.");
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      if (mode === "mileage" && mileageRows) {
        const count = await upsertMileageRows(mileageRows, weekOf);
        setStatus(`✅ Saved ${count} mileage rows for week of ${weekOf}.`);
      } else if (mode === "workouts" && workoutData) {
        const groupCount = await upsertWorkoutData(
          workoutData.assignments,
          workoutData.groupDefinitions,
          weekOf,
          day,
        );
        const intervalCount = await upsertWorkoutIntervals(
          workoutData.intervalRows,
          weekOf,
          day,
        );
        setStatus(
          `✅ Saved ${groupCount} group assignments and ${intervalCount} interval entries for ${day}, week of ${weekOf}.`,
        );
      }
    } catch (err) {
      setStatus(`❌ Failed to save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1 className="admin-title acme-regular text-outline">Admin Dashboard</h1>

      <div className="admin-mode-toggle">
        <button
          className={mode === "mileage" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("mileage");
            setMileageRows(null);
            setWorkoutData(null);
            setStatus(null);
          }}
        >
          Mileage
        </button>
        <button
          className={mode === "workouts" ? "nav-menu-trigger" : "nav-menu-item"}
          onClick={() => {
            setMode("workouts");
            setMileageRows(null);
            setWorkoutData(null);
            setStatus(null);
          }}
        >
          Workouts
        </button>
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

        <input type="file" accept="application/pdf" onChange={handleFileChange} disabled={busy} />
      </div>

      {busy && <p className="admin-status">Working...</p>}
      {status && <p className="admin-status">{status}</p>}

      {mode === "mileage" && mileageRows && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {mileageRows.length} athletes parsed — review before saving:
          </p>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Mon</th>
                  <th>Tue</th>
                  <th>Wed</th>
                  <th>Thu</th>
                  <th>Fri</th>
                  <th>Sat</th>
                  <th>Sun</th>
                  <th>Total</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {mileageRows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.team === "womens-cross-country" ? "W" : "M"}</td>
                    <td>{r.monday}</td>
                    <td>{r.tuesday}</td>
                    <td>{r.wednesday}</td>
                    <td>{r.thursday}</td>
                    <td>{r.friday}</td>
                    <td>{r.saturday}</td>
                    <td>{r.sunday}</td>
                    <td>{r.weeklyTotal}</td>
                    <td>{r.notes}</td>
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

      {mode === "workouts" && workoutData && (
        <div className="admin-preview">
          <p className="admin-preview-count">
            {workoutData.assignments.length} grouped athletes, {workoutData.intervalRows.length}{" "}
            interval athletes, {workoutData.groupDefinitions.length} group definitions parsed —
            review before saving:
          </p>

          {workoutData.groupDefinitions.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {workoutData.groupDefinitions.map((g) => (
                    <tr key={g.groupLetter}>
                      <td>{g.groupLetter}</td>
                      <td>{g.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {workoutData.assignments.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Group</th>
                  </tr>
                </thead>
                <tbody>
                  {workoutData.assignments.map((a) => (
                    <tr key={a.name}>
                      <td>{a.name}</td>
                      <td>{a.groupLetter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {workoutData.intervalRows.length > 0 && (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Intervals</th>
                  </tr>
                </thead>
                <tbody>
                  {workoutData.intervalRows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>
                        {Object.entries(r.intervals)
                          .map(([label, value]) => `${label}: ${value}`)
                          .join(" | ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="nav-menu-trigger" onClick={handleSubmit} disabled={busy}>
            Save to Database
          </button>
        </div>
      )}

      <button className="switch-identity-link acme-regular text-outline" onClick={signOut}>
        Sign Out
      </button>
    </div>
  );
}

export default AdminDashboard;