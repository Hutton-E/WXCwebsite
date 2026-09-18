import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { fetchMileageForAthlete } from "../lib/mileageData";
import type { MileageEntry } from "../lib/mileageData";

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

function MileagePage() {
  const { athlete, season } = useUser();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";

  const [entries, setEntries] = useState<MileageEntry[] | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    setError(null);

    fetchMileageForAthlete(athlete.id, season, preview)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setSelectedWeek(data.length > 0 ? data[0].week_of : null);
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
              onChange={(e) => setSelectedWeek(e.target.value)}
            >
              {entries.map((e) => (
                <option key={e.week_of} value={e.week_of}>
                  Week of {formatWeekOf(e.week_of)}
                </option>
              ))}
            </select>
          )}

          {currentEntry && (
            <div className="mileage-card">
              <div className="mileage-week-label">
                Week of {formatWeekOf(currentEntry.week_of)}
              </div>

              <div className="mileage-days-grid">
                {DAYS.map(({ key, label }) => (
                  <div key={key} className="mileage-day-cell">
                    <span className="mileage-day-label">{label}</span>
                    <span className="mileage-day-value">
                      {(currentEntry[key] as string) || "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mileage-total-row">
                <span className="mileage-total-label">Weekly Total</span>
                <span className="mileage-total-value">
                  {currentEntry.weekly_total || "—"}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MileagePage;
