import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { fetchWorkoutPeers, fetchWorkoutsForAthlete } from "../lib/workoutData";
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

function hasIntervals(intervals: Record<string, string> | null): boolean {
  return Boolean(intervals && Object.keys(intervals).length > 0);
}

function paceSignature(intervals: Record<string, string> | null): string | null {
  if (!hasIntervals(intervals)) return null;

  return Object.entries(intervals!)
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .map(([label, value]) => `${label.trim().toLowerCase()}=${value.trim().toLowerCase()}`)
    .join("|");
}

function paceDistance(
  left: Record<string, string>,
  right: Record<string, string>,
): number {
  const sharedLabels = Object.keys(left).filter((label) => label in right);
  if (sharedLabels.length === 0) return Number.POSITIVE_INFINITY;

  return (
    sharedLabels.reduce((total, label) => {
      const leftSeconds = parsePaceSeconds(left[label]);
      const rightSeconds = parsePaceSeconds(right[label]);
      return total + Math.abs(leftSeconds - rightSeconds);
    }, 0) / sharedLabels.length
  );
}

function parsePaceSeconds(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes * 60 + seconds;
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue
    : Number.POSITIVE_INFINITY;
}

function groupPeersByWorkoutGroup(peers: WorkoutPeer[]) {
  const groups = new Map<
    string,
    { names: string[]; intervals: Record<string, string> | null }
  >();
  for (const peer of peers) {
    const group = peer.groupLetter ? `Group ${peer.groupLetter}` : "No workout group";
    const existing = groups.get(group) ?? {
      names: [],
      intervals: peer.intervals,
    };
    existing.names.push(peer.name);
    groups.set(group, existing);
  }
  return [...groups.entries()];
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
}: {
  heading: string;
  peers: WorkoutPeer[];
}) {
  if (peers.length === 0) return null;

  const groupedPeers = groupPeersByWorkoutGroup(peers);
  return (
    <div className="workouts-pace-group">
      <p className="workouts-pace-heading">{heading}</p>
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
  if (peers.length <= 1) return null;

  const currentPeer = peers.find((peer) => peer.athleteId === athleteId);
  const otherPeers = peers.filter((peer) => peer.athleteId !== athleteId);
  const currentSignature = paceSignature(currentPeer?.intervals ?? day.intervals);
  const pacePeers = peers.filter((peer) => hasIntervals(peer.intervals));

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
          No interval pace was supplied for you. Your workout group is closest
          to:
        </p>
        <PaceGroup heading="Athletes with interval paces" peers={pacePeers} />
      </div>
    );
  }

  const samePacePeers = otherPeers.filter(
    (peer) => paceSignature(peer.intervals) === currentSignature,
  );

  if (samePacePeers.length === 0 && currentPeer?.intervals) {
    const paceGroups = new Map<string, WorkoutPeer[]>();
    for (const peer of pacePeers) {
      const signature = paceSignature(peer.intervals);
      if (!signature || signature === currentSignature) continue;
      paceGroups.set(signature, [...(paceGroups.get(signature) ?? []), peer]);
    }

    const closestGroup = [...paceGroups.values()].sort(
      (left, right) =>
        paceDistance(currentPeer.intervals!, left[0].intervals!) -
        paceDistance(currentPeer.intervals!, right[0].intervals!),
    )[0];

    if (closestGroup) {
      return (
        <PaceGroup
          heading="The closest pace group to you is..."
          peers={closestGroup}
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
    />
  );
}

function WorkoutsPage() {
  const { athlete } = useUser();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";

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

    fetchWorkoutsForAthlete(athlete.name, athlete.team, preview)
      .then((rows) => {
        if (cancelled) return [];
        const grouped = groupByWeek(rows);
        setWeeks(grouped);
        setSelectedKey(
          grouped.length > 0
            ? `${grouped[0].season}|${grouped[0].weekOf}`
            : null,
        );

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
  }, [athlete, preview]);

  if (!athlete) return null;

  const currentWeek =
    weeks?.find((w) => `${w.season}|${w.weekOf}` === selectedKey) ?? null;

  return (
    <div className="workouts-page">
      {preview && (
        <div className="preview-banner">
          PREVIEW MODE — showing draft data, not visible to athletes yet
        </div>
      )}

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

                  <PaceMatches
                    athleteId={athlete.id}
                    day={d}
                    peers={peers[`${currentWeek.season}|${currentWeek.weekOf}|${d.day}`] ?? []}
                  />

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
