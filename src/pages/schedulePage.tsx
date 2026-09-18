import { useEffect, useMemo, useState } from "react";
import {
  fetchCrossCountryMeets,
  type CrossCountryGender,
} from "../lib/scheduleData";
import type { CrossCountryMeet } from "../lib/scheduleData";
import { useUser } from "../context/UserContext";

const CURRENT_SEASON = 2026;

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SchedulePage() {
  const { athlete, season: selectedSeason } = useUser();
  const athleteGender: CrossCountryGender | null =
    athlete?.team === "mens-cross-country"
      ? "men"
      : athlete?.team === "womens-cross-country"
        ? "women"
        : null;
  const currentSeason = selectedSeason ?? CURRENT_SEASON;
  const firstSeason = athlete?.graduationYear
    ? Math.max(currentSeason - 3, athlete.graduationYear - 3)
    : currentSeason - 3;
  const availableSeasons = useMemo(
    () =>
      Array.from(
        { length: currentSeason - firstSeason + 1 },
        (_, index) => currentSeason - index,
      ),
    [currentSeason, firstSeason],
  );
  const seasonsKey = availableSeasons.join(",");
  const [season, setSeason] = useState(currentSeason);
  const [meets, setMeets] = useState<CrossCountryMeet[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !athleteGender) return;

    let cancelled = false;

    fetchCrossCountryMeets(availableSeasons, athlete.id, athleteGender)
      .then((data) => {
        if (cancelled) return;
        setMeets(data);
        setLoaded(true);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded(true);
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, athleteGender, availableSeasons, seasonsKey]);

  const loading = !loaded;

  return (
    <div className="schedule-page">
      <h1 className="schedule-title acme-regular text-outline">
        Cross Country Schedule
      </h1>

      <select
        className="identity-year-select"
        value={season}
        onChange={(event) => setSeason(Number(event.target.value))}
      >
        {availableSeasons.map((value) => (
          <option key={value} value={value}>
            {value} Season
          </option>
        ))}
      </select>

      {error && (
        <p className="schedule-message acme-regular text-outline">
          Something went wrong loading the schedule: {error}
        </p>
      )}

      {!error && loading && (
        <p className="schedule-message acme-regular text-outline">Loading...</p>
      )}

      {!error && !loading && meets?.length === 0 && (
        <p className="schedule-message acme-regular text-outline">
          No schedule has been imported for this season yet.
        </p>
      )}

      {!loading && meets && meets.length > 0 && (
        <div className="schedule-list">
          {meets
            .filter((meet) => meet.season === season)
            .sort((a, b) => a.meet_date.localeCompare(b.meet_date))
            .map((meet) => (
            <article key={meet.id} className="schedule-card">
              <div className="schedule-card-header">
                <div>
                  <h2 className="schedule-meet-name">{meet.meet_name}</h2>
                  <p className="schedule-meet-meta">
                    {meet.gender === "men" ? "Men's" : "Women's"} ·{" "}
                    {formatDate(meet.meet_date)}
                    {meet.meet_time && ` · ${meet.meet_time}`}
                  </p>
                </div>
                <span className={`schedule-status ${meet.status}`}>
                  {meet.status}
                </span>
              </div>

              {meet.location && (
                <p className="schedule-meet-location">{meet.location}</p>
              )}
              {meet.result_summary && (
                <p className="schedule-result-summary">
                  {meet.result_summary}
                </p>
              )}
              {meet.athleteResult && (
                <p className="schedule-athlete-result">
                  Your result:{" "}
                  {meet.athleteResult.place &&
                    `Place ${meet.athleteResult.place}`}
                  {meet.athleteResult.place && meet.athleteResult.time && " · "}
                  {meet.athleteResult.time}
                </p>
              )}
              <div className="schedule-links">
                {meet.meet_url && (
                  <a href={meet.meet_url} target="_blank" rel="noreferrer">
                    Meet information
                  </a>
                )}
                {meet.recap_url && (
                  <a href={meet.recap_url} target="_blank" rel="noreferrer">
                    Recap
                  </a>
                )}
                {meet.athleteResult?.result_url && (
                  <a
                    href={meet.athleteResult.result_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Your result
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default SchedulePage;
