import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import {
  fetchFmsAssignments,
  fetchFmsAssignmentsForTeam,
  fetchFmsExercises,
} from "../lib/fmsData";
import type {
  FmsAssignment,
  FmsExercise,
  FmsTeamAssignment,
} from "../lib/fmsData";

const PHASE_ORDER = ["Weeks 1-3", "Weeks 4-6", "Weeks 7-9"];

interface AssignmentWithExercises {
  assignment: FmsAssignment;
  exercisesByPhase: Map<string, FmsExercise[]>;
}

function groupExercisesByPhase(exercises: FmsExercise[]) {
  const byPhase = new Map<string, FmsExercise[]>();
  exercises.forEach((exercise) => {
    if (!byPhase.has(exercise.phase)) byPhase.set(exercise.phase, []);
    byPhase.get(exercise.phase)!.push(exercise);
  });
  return byPhase;
}

function FmsExercises({
  exercisesByPhase,
}: {
  exercisesByPhase: Map<string, FmsExercise[]>;
}) {
  return (
    <div className="core-days-wrapper">
      {PHASE_ORDER.filter((phase) => exercisesByPhase.has(phase)).map((phase) => (
        <div key={phase} className="core-day-card">
          <div className="core-day-header">
            <span className="core-day-name">{phase}</span>
          </div>
          <ul className="core-exercise-list">
            {exercisesByPhase.get(phase)!.map((exercise, index) => (
              <li key={index} className="core-exercise-item">
                {exercise.url ? (
                  <a
                    className="core-exercise-link"
                    href={exercise.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {exercise.name}
                  </a>
                ) : (
                  <span className="core-exercise-plain">{exercise.name}</span>
                )}
                {exercise.reps && <span> — {exercise.reps}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FmsPage() {
  const { athlete, season } = useUser();
  const [data, setData] = useState<AssignmentWithExercises[] | null>(null);
  const [teamAssignments, setTeamAssignments] = useState<
    FmsTeamAssignment[]
  >([]);
  const [exercisesByCategory, setExercisesByCategory] = useState<
    Map<string, Map<string, FmsExercise[]>>
  >(new Map());
  const [selectedCategory, setSelectedCategory] = useState("assigned");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setTeamAssignments([]);
    setExercisesByCategory(new Map());
    setError(null);

    Promise.all([
      fetchFmsAssignments(athlete.id, season),
      fetchFmsAssignmentsForTeam(athlete.team, season),
    ])
      .then(async ([assignments, allAssignments]) => {
        if (cancelled) return;
        const categories = [
          ...new Set(allAssignments.map((assignment) => assignment.category)),
        ];
        const exerciseSets = await Promise.all(
          categories.map(async (category) => [
            category,
            groupExercisesByPhase(await fetchFmsExercises(category)),
          ] as const),
        );
        const exercisesByCategory = new Map(exerciseSets);
        const results = assignments.map((assignment) => ({
          assignment,
          exercisesByPhase:
            exercisesByCategory.get(assignment.category) ??
            new Map<string, FmsExercise[]>(),
        }));
        setTeamAssignments(allAssignments);
        setExercisesByCategory(exercisesByCategory);
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

      {data && data.length > 0 && (
        <label className="fms-view-select-label acme-regular text-outline">
          View FMS exercises:
          <select
            className="identity-year-select"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
          >
            <option value="assigned">All assigned FMS</option>
            {[...new Set(teamAssignments.map((item) => item.category))]
              .sort()
              .map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
          </select>
        </label>
      )}

      {error && <p className="core-intro">Something went wrong: {error}</p>}
      {!error && data === null && <p className="core-intro">Loading...</p>}

      {!error && data !== null && data.length === 0 && (
        <p className="core-intro">
          No FMS corrective has been assigned to you yet — check with your
          coach.
        </p>
      )}

      {data
        ?.filter(
          ({ assignment }) =>
            selectedCategory === "assigned" ||
            assignment.category === selectedCategory,
        )
        .map(({ assignment, exercisesByPhase }) => (
        <div key={assignment.category} className="fms-category-block">
          <p className="core-intro acme-regular text-outline">
            {assignment.category} ({assignment.variant}) — do these twice a
            week.
          </p>

          <FmsExercises exercisesByPhase={exercisesByPhase} />
          <FmsMatches
            athlete={athlete}
            assignment={assignment}
            teamAssignments={teamAssignments}
          />
        </div>
      ))}

      {data &&
        selectedCategory !== "assigned" &&
        !data.some(
          ({ assignment }) => assignment.category === selectedCategory,
        ) &&
        exercisesByCategory.has(selectedCategory) && (
          <div className="fms-category-block">
            <p className="core-intro acme-regular text-outline">
              {selectedCategory} — general exercise reference
            </p>
            <FmsExercises
              exercisesByPhase={exercisesByCategory.get(selectedCategory)!}
            />
          </div>
        )}
    </div>
  );
}

function FmsMatches({
  athlete,
  assignment,
  teamAssignments,
}: {
  athlete: { id: string };
  assignment: FmsAssignment;
  teamAssignments: FmsTeamAssignment[];
}) {
  const categoryMatches = teamAssignments.filter(
    (item) =>
      item.category === assignment.category && item.athleteId !== athlete.id,
  );
  const exactMatches = categoryMatches.filter(
    (item) =>
      item.variant === assignment.variant,
  );

  return (
    <div className="fms-matches">
      <strong>
        {categoryMatches.length > 0
          ? `Others with ${assignment.category}`
          : `You are the only athlete with ${assignment.category}`}
      </strong>
      {categoryMatches.length > 0 && (
        <span>
          {categoryMatches
            .map((match) => `${match.athleteName} (${match.variant})`)
            .join(", ")}
        </span>
      )}
      <strong>
        {exactMatches.length > 0
          ? `Others with your exact value: ${assignment.variant}`
          : `You are the only athlete with ${assignment.category} (${assignment.variant})`}
      </strong>
      {exactMatches.length > 0 && (
        <span>{exactMatches.map((match) => match.athleteName).join(", ")}</span>
      )}
    </div>
  );
}

export default FmsPage;
