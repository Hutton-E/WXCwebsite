import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  fetchMileageForAthlete,
  fetchMileageForTeamWeek,
} from "../lib/mileageData";
import type { MileageEntry, TeamMileageEntry } from "../lib/mileageData";

const DAYS: { key: keyof MileageEntry; label: string }[] = [
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

function parseMileage(value: string): number | null {
  const numericValues = value.match(/\d+(?:\.\d+)?/g);
  if (!numericValues || numericValues.length === 0) return null;

  const mileage = Number(numericValues[numericValues.length - 1]);
  return Number.isFinite(mileage) ? mileage : null;
}

function hasSplitMileage(value: string): boolean {
  return /\d+\s*\/\s*\d+/.test(value);
}

function formatMileageValue(value: string): string {
  const mileage = parseMileage(value);
  if (mileage === null) return value;

  if (hasSplitMileage(value)) {
    const firstMileageIndex = value.search(/\d/);
    return value.slice(firstMileageIndex).trim();
  }

  const annotations = [
    /\bxt\b/i.test(value) ? "XT" : null,
    /(?:^|[^a-z])race\??(?:$|[^a-z])/i.test(value) ? "race?" : null,
    /\bwo\b/i.test(value) ? "WO" : null,
  ].filter(Boolean);

  return annotations.length > 0
    ? `${mileage} / ${annotations.join(" / ")}`
    : String(mileage);
}

function mileageComparisonKey(value: string): string {
  if (hasSplitMileage(value)) {
    return formatMileageValue(value).toLowerCase();
  }

  const mileage = parseMileage(value);
  return mileage === null ? value.trim().toLowerCase() : String(mileage);
}

function getSpecialMileageLink(
  day: keyof MileageEntry,
  value: string,
): { label: string; path: string } | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("race")) {
    return { label: "View race schedule", path: "/season-schedule" };
  }
  if (
    (day === "tuesday" || day === "friday") &&
    normalized.includes("wo")
  ) {
    return { label: "View workout", path: "/workouts" };
  }
  return null;
}

function MileageMatches({
  athleteId,
  value,
  entries,
  label,
  field,
}: {
  athleteId: string;
  value: string;
  entries: TeamMileageEntry[];
  label: string;
  field: keyof MileageEntry;
}) {
  const currentValue = parseMileage(value);
  if (currentValue === null) return null;

  const others = entries.filter((entry) => entry.athleteId !== athleteId);
  const exactMatches = others.filter(
    (entry) =>
      mileageComparisonKey(entry[field] as string) ===
      mileageComparisonKey(value),
  );
  const candidates = others
    .map((entry) => ({
      entry,
      value:       parseMileage((entry[field] as string) ?? ""),
    }))
    .filter((candidate) => candidate.value !== null)
    .sort(
      (left, right) =>
        Math.abs(left.value! - currentValue) -
        Math.abs(right.value! - currentValue),
    );
  const closestDistance = candidates[0]
    ? Math.abs(candidates[0].value! - currentValue)
    : null;
  const closest = candidates.filter(
    (candidate) =>
      Math.abs(candidate.value! - currentValue) === closestDistance,
  );

  return (
    <div className="mileage-matches acme-regular text-outline">
      {exactMatches.length > 0 ? (
        <>
          <strong className="mileage-match-heading">
            Others with the same {label} mileage ({formatMileageValue(value)})
          </strong>
          <span>
            {exactMatches.map((entry) => entry.athleteName).join(", ")}
          </span>
        </>
      ) : closest.length > 0 ? (
        <>
          <strong>Closest person(s) with mileage to yours is...</strong>
          <span>
            {closest
              .map(
                ({ entry, value: matchValue }) =>
                  `${entry.athleteName} (${formatMileageValue(String(matchValue))})`,
              )
              .join(", ")}
          </span>
        </>
      ) : (
        <strong>No other mileage entries are available for comparison.</strong>
      )}
    </div>
  );
}

function MileagePage() {
  const { athlete, season } = useUser();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";

  const [entries, setEntries] = useState<MileageEntry[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedMileage, setSelectedMileage] = useState("weekly_total");
  const [teamEntries, setTeamEntries] = useState<TeamMileageEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    setTeamEntries([]);
    setError(null);

    fetchMileageForAthlete(athlete.id, season, preview)
      .then((data) => {
        if (cancelled) return [];
        setEntries(data);
        setSelectedWeek(data.length > 0 ? data[0].week_of : null);
        if (data.length > 0) {
          return fetchMileageForTeamWeek(
            athlete.team,
            season,
            data[0].week_of,
            preview,
          );
        }
        return [];
      })
      .then((teamData) => {
        if (!cancelled) setTeamEntries(teamData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season, preview]);

  if (!athlete) return null;

  const currentEntry = entries?.find((e) => e.week_of === selectedWeek) ?? null;
  const currentTeamEntry = teamEntries.find(
    (entry) => entry.athleteId === athlete.id,
  );
  const isDayView = selectedMileage !== "weekly_total";
  const selectedDay = isDayView
    ? DAYS.find(({ key }) => key === selectedMileage)
    : null;
  const selectedDayValue = selectedDay
    ? (currentEntry?.[selectedDay.key] as string)
    : null;

  return (
    <div className="mileage-page">
      {preview && (
        <div className="preview-banner">
          PREVIEW MODE — showing draft data, not visible to athletes yet
        </div>
      )}

      <h1 className="mileage-title acme-regular text-outline">
        {athlete.name}&apos;s Mileage
      </h1>

      {error && (
        <p className="mileage-no-data acme-regular text-outline">
          Something went wrong loading your mileage: {error}
        </p>
      )}

      {!error && entries === null && (
        <p className="mileage-no-data acme-regular text-outline">Loading...</p>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <p className="mileage-no-data acme-regular text-outline">
          No mileage has been logged for you yet — check back once this week's
          sheet is in!
        </p>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <>
          {entries.length > 1 && (
            <select
              className="identity-year-select"
              value={selectedWeek ?? ""}
              onChange={(e) => {
                const week = e.target.value;
                setSelectedWeek(week);
                setTeamEntries([]);
                fetchMileageForTeamWeek(athlete.team, season!, week, preview)
                  .then(setTeamEntries)
                  .catch((err) => setError(err.message));
              }}
            >
              {entries.map((e) => (
                <option key={e.week_of} value={e.week_of}>
                  Week of {formatWeekOf(e.week_of)}
                </option>
              ))}
            </select>
          )}

          <label className="mileage-view-select-label acme-regular text-outline">
            Compare mileage:
            <select
              className="identity-year-select"
              value={selectedMileage}
              onChange={(e) => setSelectedMileage(e.target.value)}
            >
              <option value="weekly_total">Weekly total</option>
              {DAYS.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {currentEntry && (
            <div className="mileage-card" key={selectedWeek}>
              <div className="mileage-week-label">
                Week of {formatWeekOf(currentEntry.week_of)}
              </div>

              {isDayView && selectedDay ? (
                <div className="mileage-selected-day">
                  <span className="mileage-day-label">{selectedDay.label}</span>
                  <span className="mileage-selected-day-value">
                    {selectedDayValue
                      ? formatMileageValue(selectedDayValue)
                      : "—"}
                  </span>
                  {getSpecialMileageLink(
                    selectedDay.key,
                    selectedDayValue || "",
                  ) && (
                    <Link
                      className="mileage-special-link"
                      to={
                        getSpecialMileageLink(
                          selectedDay.key,
                          selectedDayValue || "",
                        )!.path
                      }
                    >
                      {
                        getSpecialMileageLink(
                          selectedDay.key,
                          selectedDayValue || "",
                        )!.label
                      }
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="mileage-days-grid">
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="mileage-day-cell">
                        <span className="mileage-day-label">{label}</span>
                        <span className="mileage-day-value">
                          {(currentEntry[key] as string)
                            ? formatMileageValue(currentEntry[key] as string)
                            : "—"}
                        </span>
                        {getSpecialMileageLink(
                          key,
                          (currentEntry[key] as string) || "",
                        ) && (
                          <Link
                            className="mileage-special-link"
                            to={
                              getSpecialMileageLink(
                                key,
                                (currentEntry[key] as string) || "",
                              )!.path
                            }
                          >
                            {
                              getSpecialMileageLink(
                                key,
                                (currentEntry[key] as string) || "",
                              )!.label
                            }
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mileage-total-row">
                    <span className="mileage-total-label">Weekly Total</span>
                    <span className="mileage-total-value">
                      {currentEntry.weekly_total
                        ? formatMileageValue(currentEntry.weekly_total)
                        : "—"}
                    </span>
                  </div>

                  {currentEntry.notes && (
                    <div className="mileage-notes">
                      <span className="mileage-notes-label">Notes</span>
                      <span className="mileage-notes-value">
                        {currentEntry.notes}
                      </span>
                    </div>
                  )}
                </>
              )}

              {currentTeamEntry && (
                <MileageMatches
                  athleteId={athlete.id}
                  value={
                    selectedMileage === "weekly_total"
                      ? currentTeamEntry.weekly_total
                      : (currentTeamEntry[
                          selectedMileage as keyof MileageEntry
                        ] as string)
                  }
                  entries={teamEntries}
                  label={
                    selectedMileage === "weekly_total"
                      ? "weekly total"
                      : selectedMileage
                  }
                  field={selectedMileage as keyof MileageEntry}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MileagePage;
