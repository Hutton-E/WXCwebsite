import { useEffect, useState } from "react";
import {
  fetchAllLiftingWeeks,
  fetchLiftingCore,
  fetchGlossaryDetail,
  glossaryCategoryFor,
} from "../lib/liftingData";
import type {
  LiftingWeek,
  LiftingExercise,
  GlossaryDetail,
} from "../lib/liftingData";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function findCurrentIndex(weeks: LiftingWeek[]): number {
  const today = new Date().toISOString().slice(0, 10);
  let idx = weeks.findIndex((w) => w.weekDate >= today);
  if (idx === -1) idx = weeks.length - 1;
  return idx;
}

function LiftingSheet() {
  const [weeks, setWeeks] = useState<LiftingWeek[] | null>(null);
  const [core, setCore] = useState<LiftingExercise[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [glossaryDetail, setGlossaryDetail] = useState<GlossaryDetail[] | null>(
    null,
  );

  useEffect(() => {
    Promise.all([fetchAllLiftingWeeks(), fetchLiftingCore()])
      .then(([weeksData, coreData]) => {
        setWeeks(weeksData);
        setCore(coreData);
        setIndex(findCurrentIndex(weeksData));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCategory(null);
    setGlossaryDetail(null);
  }, [index]);

  async function handleExerciseClick(exercise: string, weekNumber: number) {
    const category = glossaryCategoryFor(exercise);
    if (!category) return;

    setSelectedCategory(category);
    try {
      const detail = await fetchGlossaryDetail(category, weekNumber);
      setGlossaryDetail(detail);
    } catch {
      setGlossaryDetail([]);
    }
  }

  if (error) {
    return (
      <div className="core-page">
        <p className="core-intro acme-regular text-outline">
          Something went wrong: {error}
        </p>
      </div>
    );
  }

  if (!weeks) {
    return (
      <div className="core-page">
        <p className="core-intro acme-regular text-outline">Loading...</p>
      </div>
    );
  }

  const current = weeks[index];
  const isFriday = current.day === "friday";

  return (
    <div className="core-page">
      <h1 className="core-title acme-regular text-outline">Lifting Sheet</h1>

      <div className="lifting-nav">
        <button
          className="nav-menu-trigger"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </button>
        <span className="lifting-nav-label acme-regular text-outline">
          {current.day === "wednesday" ? "Wednesday" : "Friday"} — Week{" "}
          {current.weekNumber} ({formatDate(current.weekDate)})
        </span>
        <button
          className="nav-menu-trigger"
          onClick={() => setIndex((i) => Math.min(weeks.length - 1, i + 1))}
          disabled={index === weeks.length - 1}
        >
          Next →
        </button>
      </div>

      <div className="core-days-wrapper">
        <div className="core-day-card">
          <div className="core-day-header">
            <span className="core-day-name">
              {current.day === "wednesday" ? "Wednesday" : "Friday"} Lifting
            </span>
          </div>
          <ul className="core-exercise-list">
            {current.exercises.map((ex, i) => {
              const isLinked = glossaryCategoryFor(ex.exercise) !== null;
              return (
                <li key={i} className="core-exercise-item">
                  <strong>{ex.slot}:</strong>{" "}
                  {isLinked ? (
                    <button
                      className="lifting-glossary-link"
                      onClick={() =>
                        handleExerciseClick(ex.exercise, current.weekNumber)
                      }
                    >
                      {ex.exercise}
                    </button>
                  ) : (
                    ex.exercise
                  )}
                  {ex.setsReps && ` — ${ex.setsReps}`}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="core-day-card">
          <div className="core-day-header">
            <span className="core-day-name">
              {selectedCategory
                ? selectedCategory
                : isFriday
                  ? "Friday Core"
                  : "Details"}
            </span>
          </div>

          {!selectedCategory && !isFriday && (
            <p className="workouts-description">
              Click an underlined exercise on the left to see its specific
              movements.
            </p>
          )}

          {!selectedCategory && isFriday && core.length > 0 && (
            <ul className="core-exercise-list">
              {core.map((ex, i) => (
                <li key={i} className="core-exercise-item">
                  {ex.exercise} — {ex.setsReps}
                </li>
              ))}
            </ul>
          )}

          {selectedCategory && glossaryDetail && (
            <ul className="core-exercise-list">
              {glossaryDetail.map((g, i) => (
                <li key={i} className="core-exercise-item">
                  {g.detail}
                </li>
              ))}
              {glossaryDetail.length === 0 && (
                <li className="core-exercise-item">No detail found.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiftingSheet;
