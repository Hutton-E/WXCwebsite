import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  fetchGeneralWorkouts,
  fetchWorkoutPeers,
  fetchWorkoutsForAthlete,
} from "../lib/workoutData";
import type { WorkoutDay, WorkoutPeer } from "../lib/workoutData";

function formatWeekOf(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
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

function getIntervalDistance(label: string): number {
  const match = label.match(/\d+/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[0]);
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

function getSelectedWeekStorageKey(
  athleteName: string,
  team: string,
  preview: boolean,
) {
  return `workouts-selected-week:${team}:${athleteName}:${preview ? "preview" : "published"}`;
}

function GeneralWorkoutDay({ day }: { day: WorkoutDay }) {
  return (
    <div className="workouts-general-group">
      <span className="workouts-group-badge">
        {day.groupLetter ? `Group ${day.groupLetter}` : "Workout"}
      </span>
      <p className="workouts-description">
        {day.description ?? "No workout description found for this group."}
      </p>
    </div>
  );
}

function hasIntervals(intervals: Record<string, string> | null): boolean {
  return Boolean(intervals && Object.keys(intervals).length > 0);
}

function paceSignature(intervals: Record<string, string> | null): string | null {
  if (!hasIntervals(intervals)) return null;

  return Object.entries(intervals!)
    .map(([label, value]) => `${normalizeIntervalLabel(label)}=${value.trim().toLowerCase()}`)
    .sort()
    .join("|");
}

function normalizeIntervalLabel(label: string): string {
  return label.toLowerCase().replace(/[^\w]+/g, " ").trim();
}

function paceDistance(
  left: Record<string, string>,
  right: Record<string, string>,
): number {
  const rightIntervals = new Map(
    Object.entries(right).map(([label, value]) => [
      normalizeIntervalLabel(label),
      value,
    ]),
  );
  const sharedTimedIntervals = Object.entries(left).flatMap(([label, value]) => {
      const rightValue = rightIntervals.get(normalizeIntervalLabel(label));
      if (rightValue === undefined) return [];
      const leftSeconds = parsePaceSeconds(value);
      const rightSeconds = parsePaceSeconds(rightValue);
      return leftSeconds !== null && rightSeconds !== null
        ? [Math.abs(leftSeconds - rightSeconds)]
        : [];
    });
  if (sharedTimedIntervals.length === 0) return Number.POSITIVE_INFINITY;

  return (
    sharedTimedIntervals.reduce((total, difference) => total + difference, 0) /
    sharedTimedIntervals.length
  );
}

function parsePaceSeconds(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      seconds >= 0 &&
      seconds < 60
    ) {
      return minutes * 60 + seconds;
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function groupPeersByWorkoutGroup(peers: WorkoutPeer[]) {
  const groups = new Map<
    string,
    { names: string[]; intervals: Record<string, string> | null }
  >();
  for (const peer of peers) {
    const group = workoutGroupName(peer.groupLetter);
    const existing = groups.get(group) ?? {
      names: [],
      intervals: peer.intervals,
    };
    existing.names.push(peer.name);
    groups.set(group, existing);
  }
  return [...groups.entries()];
}

function workoutGroupName(groupLetter: string | null): string {
  return groupLetter ? `Group ${groupLetter}` : "No workout group";
}

function isXtPeer(peer: WorkoutPeer): boolean {
  return peer.groupLetter?.trim().toUpperCase() === "XT";
}

function formatPace(intervals: Record<string, string> | null): string | null {
  if (!hasIntervals(intervals)) return null;

  return Object.entries(intervals!)
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .map(([label, value]) => `${label}: ${value}`)
    .join(", ");
}

function PaceGroup({
  heading,
  peers,
  exactGroupLetter,
}: {
  heading: string | null;
  peers: WorkoutPeer[];
  exactGroupLetter?: string | null;
}) {
  if (peers.length === 0) return null;

  const groupedPeers = groupPeersByWorkoutGroup(peers);
  const exactGroupPeers =
    exactGroupLetter === undefined
      ? []
      : peers.filter(
          (peer) =>
            peer.groupLetter?.trim().toUpperCase() ===
            exactGroupLetter?.trim().toUpperCase(),
        );
  return (
    <div className="workouts-pace-group">
      {heading && <p className="workouts-pace-heading">{heading}</p>}
      <ul className="workouts-pace-list">
        {groupedPeers.map(([group, details]) => (
          <li key={group} className="workouts-pace-item">
            <strong>{group}:</strong> {details.names.join(", ")}
            {formatPace(details.intervals) && (
              <span className="workouts-pace-value">
                {" "}
                ({formatPace(details.intervals)})
              </span>
            )}
          </li>
        ))}
      </ul>
      {exactGroupLetter !== undefined && (
        <p className="workouts-pace-item">
          <strong>
            In your exact workout group ({workoutGroupName(exactGroupLetter)}):
          </strong>{" "}
          {exactGroupPeers.length > 0
            ? exactGroupPeers.map((peer) => peer.name).join(", ")
            : "Nobody in this pace group."}
        </p>
      )}
    </div>
  );
}

function PaceMatches({
  athleteId,
  day,
  peers,
}: {
  athleteId: string;
  day: WorkoutDay;
  peers: WorkoutPeer[];
}) {
  const currentPeer = peers.find((peer) => peer.athleteId === athleteId);
  const currentGroupLetter = currentPeer?.groupLetter ?? day.groupLetter;
  if (currentGroupLetter?.trim().toUpperCase() === "XT" || peers.length <= 1) {
    return null;
  }

  const comparisonPeers = peers.filter((peer) => !isXtPeer(peer));
  const otherPeers = comparisonPeers.filter(
    (peer) => peer.athleteId !== athleteId,
  );
  const currentIntervals = currentPeer?.intervals ?? day.intervals;
  const currentSignature = paceSignature(currentIntervals);
  const pacePeers = comparisonPeers.filter((peer) =>
    hasIntervals(peer.intervals),
  );

  if (!currentSignature) {
    if (pacePeers.length === 0) {
      return (
        <PaceGroup
          heading="Your workout group"
          peers={otherPeers}
        />
      );
    }

    return (
      <div className="workouts-pace-group">
        <p className="workouts-pace-heading">
          No interval pace was supplied for you. Here are all athletes with
          interval paces:
        </p>
        <PaceGroup heading={null} peers={pacePeers} />
      </div>
    );
  }

  const samePacePeers = otherPeers.filter(
    (peer) => paceSignature(peer.intervals) === currentSignature,
  );

  if (samePacePeers.length === 0 && currentIntervals) {
    const paceGroups = new Map<string, WorkoutPeer[]>();
    for (const peer of pacePeers) {
      const signature = paceSignature(peer.intervals);
      if (!signature || signature === currentSignature) continue;
      paceGroups.set(signature, [...(paceGroups.get(signature) ?? []), peer]);
    }

    const closestGroup = [...paceGroups.values()]
      .map((group) => ({
        group,
        distance: paceDistance(currentIntervals, group[0].intervals!),
      }))
      .filter(({ distance }) => Number.isFinite(distance))
      .sort((left, right) => left.distance - right.distance)[0]?.group;

    if (closestGroup) {
      return (
        <PaceGroup
          heading="The closest pace group in your workout is..."
          peers={closestGroup}
          exactGroupLetter={currentGroupLetter}
        />
      );
    }
  }

  return (
    <PaceGroup
      heading={
        samePacePeers.length > 0
          ? "You have the same paces as..."
          : "No other athlete has your exact interval paces."
      }
      peers={samePacePeers}
      exactGroupLetter={currentGroupLetter}
    />
  );
}

function WorkoutsPage() {
  const { athlete } = useUser();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";

  const [viewMode, setViewMode] = useState<"personalized" | "general">(
    "personalized",
  );
  const [weeks, setWeeks] = useState<WeekGroup[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, WorkoutPeer[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeeks(null);
    setPeers({});
    setError(null);

    const workoutsPromise =
      viewMode === "personalized"
        ? fetchWorkoutsForAthlete(athlete.name, athlete.team, preview)
        : fetchGeneralWorkouts(athlete.team, preview);

    workoutsPromise
      .then((rows) => {
        if (cancelled) return [];
        const grouped = groupByWeek(rows);
        setWeeks(grouped);
        const storageKey = getSelectedWeekStorageKey(
          athlete.name,
          athlete.team,
          preview,
        );
        const savedKey = window.localStorage.getItem(storageKey);
        const nextKey =
          savedKey &&
          grouped.some((week) => `${week.season}|${week.weekOf}` === savedKey)
            ? savedKey
            : grouped.length > 0
              ? `${grouped[0].season}|${grouped[0].weekOf}`
              : null;
        setSelectedKey(nextKey);
        if (nextKey) {
          window.localStorage.setItem(storageKey, nextKey);
        }

        if (viewMode === "general") return [];

        const uniqueDays = [
          ...new Map(
            rows.map((row) => [
              `${row.season}|${row.weekOf}|${row.day}`,
              row,
            ]),
          ).values(),
        ];

        return Promise.all(
          uniqueDays.map(async (row) => {
            const key = `${row.season}|${row.weekOf}|${row.day}`;
            return [
              key,
              await fetchWorkoutPeers(
                row.weekOf,
                row.season,
                row.day,
                athlete.team,
                preview,
              ),
            ] as const;
          }),
        );
      })
      .then((peerRows) => {
        if (cancelled) return;
        setPeers(Object.fromEntries(peerRows));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, preview, viewMode]);

  if (!athlete) return null;

  const currentWeek =
    weeks?.find((w) => `${w.season}|${w.weekOf}` === selectedKey) ?? null;
  const visibleDays =
    currentWeek?.days.filter(
      (day) =>
        day.season === currentWeek.season && day.weekOf === currentWeek.weekOf,
    ) ?? [];

  return (
    <div className="workouts-page">
      {preview && (
        <div className="preview-banner">
          PREVIEW MODE — showing draft data, not visible to athletes yet
        </div>
      )}

      <h1 className="workouts-title acme-regular text-outline">
        {viewMode === "personalized" ? `${athlete.name}'s Workouts` : "All Workouts"}
      </h1>

      <div className="workouts-view-switcher" aria-label="Workout view">
        <button
          className={`workouts-view-button ${
            viewMode === "personalized" ? "is-active" : ""
          }`}
          onClick={() => setViewMode("personalized")}
          type="button"
        >
          My workouts
        </button>
        <button
          className={`workouts-view-button ${
            viewMode === "general" ? "is-active" : ""
          }`}
          onClick={() => setViewMode("general")}
          type="button"
        >
          All group workouts
        </button>
      </div>

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
              onChange={(e) => {
                const nextKey = e.target.value;
                setSelectedKey(nextKey);
                window.localStorage.setItem(
                  getSelectedWeekStorageKey(
                    athlete.name,
                    athlete.team,
                    preview,
                  ),
                  nextKey,
                );
              }}
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
            <div className="workouts-card" key={selectedKey}>
              <div className="workouts-week-label">
                {currentWeek.season} — Week of{" "}
                {formatWeekOf(currentWeek.weekOf)}
              </div>

              {visibleDays.map((d) => (
                <div key={d.day} className="workouts-day-block">
                  <div className="workouts-day-header">
                    <span className="workouts-day-name">
                      {capitalize(d.day)}
                    </span>
                    {viewMode === "personalized" && d.groupLetter && (
                      <span className="workouts-group-badge">
                        Group {d.groupLetter}
                      </span>
                    )}
                  </div>

                  {viewMode === "general" ? (
                    <GeneralWorkoutDay day={d} />
                  ) : d.description ? (
                    <p className="workouts-description">{d.description}</p>
                  ) : null}

                  {d.note && <p className="workouts-note">{d.note}</p>}

                  {viewMode === "personalized" && (
                    <PaceMatches
                      athleteId={athlete.id}
                      day={d}
                      peers={
                        peers[
                          `${currentWeek.season}|${currentWeek.weekOf}|${d.day}`
                        ] ?? []
                      }
                    />
                  )}

                  {d.intervals && Object.keys(d.intervals).length > 0 && (
                    <ul className="workouts-interval-list">
                      {Object.entries(d.intervals)
                        .sort(
                          ([labelA], [labelB]) =>
                            getIntervalDistance(labelA) -
                            getIntervalDistance(labelB),
                        )
                        .map(([label, value]) => (
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

                  {viewMode === "personalized" &&
                    !d.description &&
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
