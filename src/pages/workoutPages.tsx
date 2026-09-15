import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { fetchWorkoutsForAthlete } from "../lib/workoutData";
import type { WorkoutDay } from "../lib/workoutData";

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

function WorkoutsPage() {
  const { athlete } = useUser();
  const [weeks, setWeeks] = useState<WeekGroup[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeeks(null);
    setError(null);

    fetchWorkoutsForAthlete(athlete.name, athlete.team)
      .then((rows) => {
        if (cancelled) return;
        const grouped = groupByWeek(rows);
        setWeeks(grouped);
        setSelectedKey(
          grouped.length > 0
            ? `${grouped[0].season}|${grouped[0].weekOf}`
            : null,
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete]);

  if (!athlete) return null;

  const currentWeek =
    weeks?.find((w) => `${w.season}|${w.weekOf}` === selectedKey) ?? null;

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
              value={selectedKey ?? ""}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {weeks.map((w) => (
                <option
                  key={`${w.season}|${w.weekOf}`}
                  value={`${w.season}|${w.weekOf}`}
                >
                  {w.season} — Week of {formatWeekOf(w.weekOf)}
                </option>
              ))}
            </select>
          )}

          {currentWeek && (
            <div className="workouts-card">
              <div className="workouts-week-label">
                {currentWeek.season} — Week of{" "}
                {formatWeekOf(currentWeek.weekOf)}
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
                    (!d.intervals || Object.keys(d.intervals).length === 0) && (
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
