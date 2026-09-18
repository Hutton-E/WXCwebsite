import { useEffect, useMemo, useState } from "react";
import {
  fetchPublicCrossCountryMeets,
  type CrossCountryGender,
  type CrossCountryMeet,
} from "../lib/scheduleData";

const CURRENT_SEASON = 2026;
const AVAILABLE_SEASONS = Array.from(
  { length: CURRENT_SEASON - 2017 + 1 },
  (_, index) => CURRENT_SEASON - index,
);

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ScheduleCard({ meet }: { meet: CrossCountryMeet }) {
  return (
    <article className="schedule-card">
      <div className="schedule-card-header">
        <div>
          <h3 className="schedule-meet-name">{meet.meet_name}</h3>
          <p className="schedule-meet-meta">
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
        <p className="schedule-result-summary">{meet.result_summary}</p>
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
      </div>
    </article>
  );
}

function GenderScheduleColumn({
  gender,
  meets,
}: {
  gender: CrossCountryGender;
  meets: CrossCountryMeet[];
}) {
  const label = gender === "men" ? "Men's Cross Country" : "Women's Cross Country";

  return (
    <section className="season-schedule-column">
      <h2 className="season-schedule-column-title acme-regular text-outline">
        {label}
      </h2>
      <div className="season-schedule-column-scroll">
        {meets.length > 0 ? (
          meets.map((meet) => <ScheduleCard key={meet.id} meet={meet} />)
        ) : (
          <p className="schedule-message acme-regular text-outline">
            No schedule has been imported for this season yet.
          </p>
        )}
      </div>
    </section>
  );
}

function SeasonSchedulePage() {
  const [meets, setMeets] = useState<CrossCountryMeet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(CURRENT_SEASON);

  useEffect(() => {
    let cancelled = false;

    fetchPublicCrossCountryMeets(season)
      .then((data) => {
        if (cancelled) return;
        setMeets(data);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [season]);

  const meetsByGender = useMemo(
    () => ({
      men: meets?.filter((meet) => meet.gender === "men") ?? [],
      women: meets?.filter((meet) => meet.gender === "women") ?? [],
    }),
    [meets],
  );

  return (
    <div className="season-schedule-page">
      <h1 className="schedule-title acme-regular text-outline">
        {season} Cross Country Schedule
      </h1>

      <select
        className="identity-year-select season-schedule-season-select"
        value={season}
        onChange={(event) => setSeason(Number(event.target.value))}
      >
        {AVAILABLE_SEASONS.map((value) => (
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

      {!error && !meets && (
        <p className="schedule-message acme-regular text-outline">Loading...</p>
      )}

      {!error && meets && (
        <div className="season-schedule-columns">
          <GenderScheduleColumn gender="men" meets={meetsByGender.men} />
          <GenderScheduleColumn gender="women" meets={meetsByGender.women} />
        </div>
      )}
    </div>
  );
}

export default SeasonSchedulePage;
