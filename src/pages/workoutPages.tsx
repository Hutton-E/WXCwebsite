import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import {
  fetchWorkoutsForAthlete,
  fetchIntervalsForAthlete,
} from "../lib/workoutData";
import type { WorkoutForDay, WorkoutIntervalEntry } from "../lib/workoutData";

interface DayWorkout {
  day: string;
  groupLetter?: string;
  description?: string;
  note?: string | null;
  intervals?: { label: string; value: string }[];
}

interface WeekWorkouts {
  weekOf: string;
  days: DayWorkout[];
}

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

// Merges group-assignment rows and interval rows into one combined
// per-week, per-day structure, since an athlete's day may have either
// (or in principle both, though the two source PDF formats are mutually
// exclusive per page in practice).
function combineIntoWeeks(
  groupRows: WorkoutForDay[],
  intervalRows: WorkoutIntervalEntry[],
): WeekWorkouts[] {
  const weekMap = new Map<string, Map<string, DayWorkout>>();

  function getDayEntry(weekOf: string, day: string): DayWorkout {
    if (!weekMap.has(weekOf)) weekMap.set(weekOf, new Map());
    const dayMap = weekMap.get(weekOf)!;
    if (!dayMap.has(day)) dayMap.set(day, { day });
    return dayMap.get(day)!;
  }

  for (const r of groupRows) {
    const entry = getDayEntry(r.weekOf, r.day);
    entry.groupLetter = r.groupLetter;
    entry.description = r.description ?? undefined;
    entry.note = r.note;
  }

  for (const r of intervalRows) {
    const entry = getDayEntry(r.week_of, r.day);
    if (!entry.intervals) entry.intervals = [];
    entry.intervals.push({ label: r.interval_label, value: r.time_value });
  }

  return Array.from(weekMap.entries())
    .map(([weekOf, dayMap]) => ({
      weekOf,
      days: Array.from(dayMap.values()).sort((a, b) =>
        a.day.localeCompare(b.day),
      ),
    }))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
}

function WorkoutsPage() {
  const { athlete, season } = useUser();
  const [weeks, setWeeks] = useState<WeekWorkouts[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    setWeeks(null);
    setError(null);

    Promise.all([
      fetchWorkoutsForAthlete(athlete.id, season),
      fetchIntervalsForAthlete(athlete.id, season),
    ])
      .then(([groupData, intervalData]) => {
        if (cancelled) return;
        const combined = combineIntoWeeks(groupData, intervalData);
        setWeeks(combined);
        setSelectedWeek(combined.length > 0 ? combined[0].weekOf : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  if (!athlete) return null;

  const currentWeek = weeks?.find((w) => w.weekOf === selectedWeek) ?? null;

  return (
    <div className="workouts-page">
      <h1 className="workouts-title acme-regular text-outline">
        {athlete.name}&apos;s Workouts
      </h1>

      {error && (
        <p className="workouts-no-data acme-regular text-outline">
          Something went wrong loading your workouts: {error}
        </p>
      )}

      {!error && weeks === null && (
        <p className="workouts-no-data acme-regular text-outline">Loading...</p>
      )}

      {!error && weeks !== null && weeks.length === 0 && (
        <p className="workouts-no-data acme-regular text-outline">
          No workouts have been assigned to you yet — check back once this
          week's sheet is in!
        </p>
      )}

      {!error && weeks !== null && weeks.length > 0 && (
        <>
          {weeks.length > 1 && (
            <select
              className="identity-year-select"
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {weeks.map((w) => (
                <option key={w.weekOf} value={w.weekOf}>
                  Week of {formatWeekOf(w.weekOf)}
                </option>
              ))}
            </select>
          )}

          {currentWeek && (
            <div className="workouts-card">
              <div className="workouts-week-label">
                Week of {formatWeekOf(currentWeek.weekOf)}
              </div>

              {currentWeek.days.map((d) => (
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

                  {d.intervals && d.intervals.length > 0 && (
                    <ul className="workouts-interval-list">
                      {d.intervals.map((i) => (
                        <li key={i.label} className="workouts-interval-item">
                          <span className="workouts-interval-label">
                            {i.label}
                          </span>
                          <span className="workouts-interval-value">
                            {i.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!d.description &&
                    (!d.intervals || d.intervals.length === 0) && (
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

export default WorkoutsPage;
