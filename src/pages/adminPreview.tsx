import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchAthletesForSeason } from "../lib/athleteData";
import type { AthleteRecord } from "../lib/athleteData";
import { fetchMileageForAthlete } from "../lib/mileageData";
import type { MileageEntry } from "../lib/mileageData";
import { fetchWorkoutsForAthlete } from "../lib/workoutData";
import type { WorkoutDay } from "../lib/workoutData";
import { publishMileage, publishWorkouts } from "../lib/adminData";

const CURRENT_SEASON = 2026;

const DAYS: {
  key: keyof MileageEntry;
  label: string;
}[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

function formatWeekOf(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface WeekGroup {
  weekOf: string;
  season: number;
  days: WorkoutDay[];
}

function groupByWeek(rows: WorkoutDay[]): WeekGroup[] {
  const map = new Map<string, WorkoutDay[]>();

  for (const row of rows) {
    const key = `${row.season}|${row.weekOf}`;
    const existing = map.get(key) ?? [];

    existing.push(row);
    map.set(key, existing);
  }

  return Array.from(map.entries())
    .map(([key, days]) => {
      const [seasonStr, weekOf] = key.split("|");

      return {
        weekOf,
        season: Number(seasonStr),
        days: days.sort((a, b) => a.day.localeCompare(b.day)),
      };
    })
    .sort((a, b) => b.season - a.season || b.weekOf.localeCompare(a.weekOf));
}

function AdminPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mode = searchParams.get("mode") === "workouts" ? "workouts" : "mileage";

  const weekOf = searchParams.get("week") ?? "";

  const day = searchParams.get("day") === "friday" ? "friday" : "tuesday";

  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);

  const [selectedAthleteId, setSelectedAthleteId] = useState("");

  const [mileageEntries, setMileageEntries] = useState<MileageEntry[] | null>(
    null,
  );

  const [workoutWeeks, setWorkoutWeeks] = useState<WeekGroup[] | null>(null);

  const [loadingAthletes, setLoadingAthletes] = useState(true);

  const [loadingData, setLoadingData] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchAthletesForSeason(CURRENT_SEASON)
      .then((data) => {
        setAthletes(data);

        if (data.length > 0) {
          setSelectedAthleteId(data[0].id);
        }
      })
      .catch((err) => {
        setError(`Failed to load athlete roster: ${err.message}`);
      })
      .finally(() => {
        setLoadingAthletes(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedAthleteId) return;

    const athlete = athletes.find((a) => a.id === selectedAthleteId);

    if (!athlete) return;

    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingData(true);
    setError(null);
    setPublishStatus(null);

    if (mode === "mileage") {
      fetchMileageForAthlete(athlete.id, CURRENT_SEASON, true)
        .then((data) => {
          if (cancelled) return;
          setMileageEntries(data);
          setWorkoutWeeks(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.message);
          setMileageEntries([]);
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingData(false);
          }
        });
    } else {
      fetchWorkoutsForAthlete(athlete.name, athlete.team, true)
        .then((rows) => {
          if (cancelled) return;

          setWorkoutWeeks(groupByWeek(rows));
          setMileageEntries(null);
        })
        .catch((err) => {
          if (cancelled) return;

          setError(err.message);
          setWorkoutWeeks([]);
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingData(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId, athletes, mode]);

  const selectedAthlete =
    athletes.find((a) => a.id === selectedAthleteId) ?? null;

  const mileageEntry =
    mileageEntries?.find((entry) => entry.week_of === weekOf) ?? null;

  const workoutWeek =
    workoutWeeks?.find(
      (week) => week.weekOf === weekOf && week.season === CURRENT_SEASON,
    ) ?? null;

  async function handlePublish() {
    if (!weekOf) {
      setPublishStatus("No week was supplied to the preview.");
      return;
    }

    setPublishing(true);
    setPublishStatus(null);

    try {
      if (mode === "mileage") {
        await publishMileage(weekOf);

        setPublishStatus(`✅ Published mileage for week of ${weekOf}.`);
      } else {
        await publishWorkouts(weekOf, day);

        setPublishStatus(`✅ Published ${day} workouts for week of ${weekOf}.`);
      }
    } catch (err) {
      setPublishStatus(`❌ Failed to publish: ${(err as Error).message}`);
    } finally {
      setPublishing(false);
    }
  }

  if (loadingAthletes) {
    return (
      <div className="admin-preview-page">
        <div className="preview-banner">ADMIN PREVIEW MODE — DRAFT DATA</div>

        <h1 className="admin-title acme-regular text-outline">Preview Draft</h1>

        <p className="admin-status">Loading athlete roster...</p>
      </div>
    );
  }

  return (
    <div className="admin-preview-page">
      <div className="preview-banner">
        ADMIN PREVIEW MODE — showing draft data only
      </div>

      <h1 className="admin-title acme-regular text-outline">
        {mode === "mileage" ? "Mileage Preview" : "Workout Preview"}
      </h1>

      <div className="admin-preview-controls">
        <label className="admin-label">
          Athlete:
          <select
            className="identity-year-select"
            value={selectedAthleteId}
            onChange={(e) => setSelectedAthleteId(e.target.value)}
          >
            <option value="">-- Select athlete --</option>

            {athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.id}>
                {athlete.name}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-preview-info">
          <span>
            Week of:{" "}
            <strong>{weekOf ? formatWeekOf(weekOf) : "Not selected"}</strong>
          </span>

          {mode === "workouts" && (
            <span>
              Day: <strong>{capitalize(day)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="admin-preview-actions">
        <button
          className="nav-menu-trigger"
          onClick={() => navigate("/admin/dashboard")}
        >
          Back to Dashboard
        </button>

        <button
          className="nav-menu-trigger"
          onClick={handlePublish}
          disabled={publishing || loadingData || !selectedAthlete}
        >
          {publishing ? "Publishing..." : "Publish This Draft"}
        </button>
      </div>

      {publishStatus && <p className="admin-status">{publishStatus}</p>}

      {error && <p className="admin-status">❌ {error}</p>}

      {loadingData && <p className="admin-status">Loading draft data...</p>}

      {!loadingData && mode === "mileage" && selectedAthlete && (
        <>
          <h2 className="admin-preview-athlete-name acme-regular text-outline">
            {selectedAthlete.name}&apos;s Mileage
          </h2>

          {!mileageEntry && (
            <p className="mileage-no-data acme-regular text-outline">
              No draft mileage was found for this athlete and week.
            </p>
          )}

          {mileageEntry && (
            <div className="mileage-card">
              <div className="mileage-week-label">
                Week of {formatWeekOf(mileageEntry.week_of)}
              </div>

              <div className="mileage-days-grid">
                {DAYS.map(({ key, label }) => (
                  <div key={key} className="mileage-day-cell">
                    <span className="mileage-day-label">{label}</span>

                    <span className="mileage-day-value">
                      {(mileageEntry[key] as string) || "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mileage-total-row">
                <span className="mileage-total-label">Weekly Total</span>

                <span className="mileage-total-value">
                  {mileageEntry.weekly_total || "—"}
                </span>
              </div>

              {mileageEntry.notes && (
                <div className="mileage-notes">
                  <span className="mileage-notes-label">Notes</span>

                  <span className="mileage-notes-value">
                    {mileageEntry.notes}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!loadingData && mode === "workouts" && selectedAthlete && (
        <>
          <h2 className="admin-preview-athlete-name acme-regular text-outline">
            {selectedAthlete.name}&apos;s Workouts
          </h2>

          {!workoutWeek && (
            <p className="workouts-no-data acme-regular text-outline">
              No draft workouts were found for this athlete and week.
            </p>
          )}

          {workoutWeek && (
            <div className="workouts-card">
              <div className="workouts-week-label">
                {workoutWeek.season} — Week of{" "}
                {formatWeekOf(workoutWeek.weekOf)}
              </div>

              {workoutWeek.days
                .filter((d) => d.day === day)
                .map((d) => (
                  <div key={d.day} className="workouts-day-block">
                    <div className="workouts-day-header">
                      <span className="workouts-day-name">
                        {capitalize(d.day)}
                      </span>

                      {d.groupLetter && (
                        <span className="workouts-group-badge">
                          Group {d.groupLetter}
                        </span>
                      )}
                    </div>

                    {d.description && (
                      <p className="workouts-description">{d.description}</p>
                    )}

                    {d.note && <p className="workouts-note">{d.note}</p>}

                    {d.intervals && Object.keys(d.intervals).length > 0 && (
                      <ul className="workouts-interval-list">
                        {Object.entries(d.intervals).map(([label, value]) => (
                          <li key={label} className="workouts-interval-item">
                            <span className="workouts-interval-label">
                              {label}
                            </span>

                            <span className="workouts-interval-value">
                              {value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {!d.description &&
                      !d.note &&
                      (!d.intervals ||
                        Object.keys(d.intervals).length === 0) && (
                        <p className="workouts-description">
                          No workout description found for this day.
                        </p>
                      )}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminPreview;
