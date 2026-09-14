import { useEffect, useState } from "react";
import { fetchCoreRoutine } from "../lib/coreData";
import type { CoreRoutine } from "../lib/coreData";

function CorePage() {
  const [routine, setRoutine] = useState<CoreRoutine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCoreRoutine()
      .then((data) => {
        if (!cancelled) setRoutine(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="core-page">
      <h1 className="core-title acme-regular text-outline">Core Routine</h1>

      {error && (
        <p className="core-intro acme-regular text-outline">
          Something went wrong loading the routine: {error}
        </p>
      )}

      {!error && !routine && <p className="core-intro acme-regular text-outline">Loading...</p>}

      {routine && (
        <>
          <p className="core-intro acme-regular text-outline">{routine.intro}</p>

          <div className="core-days-wrapper">
            {routine.days.map(({ day, routine: dayRoutine }) => (
              <div key={day} className="core-day-card">
                <div className="core-day-header">
                  <span className="core-day-name">{day}</span>
                  {dayRoutine.note && (
                    <span className="core-day-note">{dayRoutine.note}</span>
                  )}
                </div>
                <ul className="core-exercise-list">
                  {dayRoutine.exercises.map((ex, i) => (
                    <li key={`${ex.name}-${i}`} className="core-exercise-item">
                      {ex.url ? (
                        <a
                          className="core-exercise-link"
                          href={ex.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ex.name}
                        </a>
                      ) : (
                        <span className="core-exercise-plain">{ex.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default CorePage;
