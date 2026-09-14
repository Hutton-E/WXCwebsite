import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { fetchFmsAssignments, fetchFmsExercises } from "../lib/fmsData";
import type { FmsAssignment, FmsExercise } from "../lib/fmsData";

const PHASE_ORDER = ["Weeks 1-3", "Weeks 4-6", "Weeks 7-9"];

interface AssignmentWithExercises {
  assignment: FmsAssignment;
  exercisesByPhase: Map<string, FmsExercise[]>;
}

function FmsPage() {
  const { athlete, season } = useUser();
  const [data, setData] = useState<AssignmentWithExercises[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(null);

    fetchFmsAssignments(athlete.id, season)
      .then(async (assignments) => {
        if (cancelled) return;
        const results: AssignmentWithExercises[] = [];
        for (const assignment of assignments) {
          const exercises = await fetchFmsExercises(assignment.category);
          const byPhase = new Map<string, FmsExercise[]>();
          exercises.forEach((ex) => {
            if (!byPhase.has(ex.phase)) byPhase.set(ex.phase, []);
            byPhase.get(ex.phase)!.push(ex);
          });
          results.push({ assignment, exercisesByPhase: byPhase });
        }
        if (!cancelled) setData(results);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  if (!athlete) return null;

  return (
    <div className="core-page">
      <h1 className="core-title acme-regular text-outline">
        {athlete.name}&apos;s FMS Correctives
      </h1>

      {error && <p className="core-intro">Something went wrong: {error}</p>}
      {!error && data === null && <p className="core-intro">Loading...</p>}

      {!error && data !== null && data.length === 0 && (
        <p className="core-intro">
          No FMS corrective has been assigned to you yet — check with your
          coach.
        </p>
      )}

      {data?.map(({ assignment, exercisesByPhase }) => (
        <div key={assignment.category} className="fms-category-block">
          <p className="core-intro acme-regular text-outline">
            {assignment.category} ({assignment.variant}) — do these twice a
            week.
          </p>

          <div className="core-days-wrapper">
            {PHASE_ORDER.filter((p) => exercisesByPhase.has(p)).map((phase) => (
              <div key={phase} className="core-day-card">
                <div className="core-day-header">
                  <span className="core-day-name">{phase}</span>
                </div>
                <ul className="core-exercise-list">
                  {exercisesByPhase.get(phase)!.map((ex, i) => (
                    <li key={i} className="core-exercise-item">
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
                      {ex.reps && <span> — {ex.reps}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default FmsPage;
