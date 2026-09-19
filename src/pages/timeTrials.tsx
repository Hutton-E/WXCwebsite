import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  fetchTimeTrialRace,
  fetchTimeTrialResults,
} from "../lib/timeTrialData";
import type { TimeTrialResult } from "../lib/timeTrialData";

function TimeTrials() {
  const navigate = useNavigate();
  const { athlete, season } = useUser();
  const [results, setResults] = useState<TimeTrialResult[] | null>(null);
  const [raceResults, setRaceResults] = useState<TimeTrialResult[] | null>(null);
  const [selectedRace, setSelectedRace] = useState<TimeTrialResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athlete || !season) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResults(null);
    setError(null);

    fetchTimeTrialResults(athlete.name)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [athlete, season]);

  function showRace(result: TimeTrialResult) {
    setSelectedRace(result);
    setRaceResults(null);
    fetchTimeTrialRace(
      result.trial_name,
      result.year_label,
      result.source_block,
    )
      .then(setRaceResults)
      .catch((err) => setError(err.message));
  }

  if (!athlete) return null;

  const raceCounts = new Map<string, number>();
  for (const result of results ?? []) {
    const key = `${result.trial_name}:${result.year_label}`;
    raceCounts.set(key, (raceCounts.get(key) ?? 0) + 1);
  }

  if (selectedRace) {
    return (
      <div className="time-trials-page">
        <button
          className="time-trials-back"
          onClick={() => {
            setSelectedRace(null);
            setRaceResults(null);
          }}
        >
          Back to my time trials
        </button>
        <h1 className="time-trials-title acme-regular text-outline">
          {selectedRace.trial_name} · {selectedRace.year_label}
          {" · Group "}
          {selectedRace.source_block}
        </h1>
        {raceResults === null && (
          <p className="time-trials-no-data acme-regular text-outline">
            Loading race results...
          </p>
        )}
        {raceResults && (
          <div className="time-trials-race">
            <div className="time-trials-race-header">
              <span>Place</span>
              <span>Athlete</span>
              <span>Time</span>
              <span>Details</span>
            </div>
            {raceResults.map((result) => (
              <div
                key={result.id}
                className={`time-trials-race-row${
                  result.athlete_name === athlete.name ? " current" : ""
                }`}
              >
                <span>{result.position ?? "—"}</span>
                <strong>{result.athlete_name}</strong>
                <span>{result.result_time}</span>
                <span>
                  {Object.entries(result.details)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ") || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="time-trials-page">
      <button
        className="time-trials-home-back"
        onClick={() => navigate("/")}
        aria-label="Back to home"
      >
        ← Back
      </button>
      <h1 className="time-trials-title acme-regular text-outline">
        {athlete.name}&apos;s Time Trials
      </h1>

      {error && (
        <p className="time-trials-no-data acme-regular text-outline">
          Something went wrong loading your time trials: {error}
        </p>
      )}

      {!error && results === null && (
        <p className="time-trials-no-data acme-regular text-outline">
          Loading...
        </p>
      )}

      {!error && results !== null && results.length === 0 && (
        <p className="time-trials-no-data acme-regular text-outline">
          No time trial results were found for you.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="time-trials-list">
          {results.map((result) => (
            <div key={result.id} className="time-trials-card">
              <div className="time-trials-card-header">
                <span className="time-trials-event">
                  {result.trial_name}
                  {(raceCounts.get(`${result.trial_name}:${result.year_label}`) ??
                    0) > 1 && ` · Group ${result.source_block}`}
                </span>
                <span className="time-trials-time">{result.result_time}</span>
              </div>
              <div className="time-trials-year">
                Season: {result.season} · Workbook year: {result.year_label}
              </div>
              <button
                className="time-trials-race-link"
                onClick={() => showRace(result)}
              >
                See time trial results?
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TimeTrials;
