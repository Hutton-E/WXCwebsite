import { useState } from "react";
import type { Athlete } from "../context/UserContext";
import {
  analyzeAchievements,
  buildAchievementSummary,
} from "../lib/athleteAchievements";

interface PlayerCardProps {
  athlete: Athlete;
}

function PlayerCard({ athlete }: PlayerCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const initials = athlete.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const ratingScores = [
    {
      label: "XC",
      description: "Cross country",
      value: athlete.crossCountryRating,
      consistency: null,
    },
    {
      label: "INDOOR",
      description: "Indoor track",
      value: athlete.indoorRating,
      consistency: athlete.indoorConsistencyRating,
    },
    {
      label: "OUTDOOR",
      description: "Outdoor track",
      value: athlete.outdoorRating,
      consistency: athlete.outdoorConsistencyRating,
    },
  ];
  const scoreSignals = [
    {
      label: "SEASON FORM",
      value: athlete.overallRating,
      detail: "65% of the overall score",
    },
    {
      label: "PHYSICAL",
      value:
        athlete.speedRating !== null && athlete.enduranceRating !== null
          ? (athlete.speedRating + athlete.enduranceRating) / 2
          : athlete.speedRating ?? athlete.enduranceRating,
      detail: "25%: speed and endurance",
    },
    {
      label: "WIN FACTOR",
      value: athlete.winFactorRating,
      detail: "10%: finishes at scored meets",
    },
  ];
  const achievementSummary = buildAchievementSummary(
    athlete.name,
    athlete.raceHistory,
    athlete.runnerType,
    {
      crossCountry: athlete.crossCountryRating,
      indoor: athlete.indoorRating,
      outdoor: athlete.outdoorRating,
      speed: athlete.speedRating,
      endurance: athlete.enduranceRating,
      winFactor: athlete.winFactorRating,
    },
    {
      firstTeam: athlete.allAmericanCount,
      secondTeam: athlete.secondTeamAllAmericanCount,
    },
  );
  const achievementAnalysis = analyzeAchievements(athlete.raceHistory);
  const firstName = athlete.name.split(" ")[0];
  const bestPerformance = athlete.bestWorldAthleticsPerformance;
  const fallbackPerformance =
    athlete.topAchievements[0]
      ? `${athlete.topAchievements[0].label} at ${athlete.topAchievements[0].meetName}`
      : bestPerformance
        ? `${bestPerformance.mark} in the ${bestPerformance.event} (${bestPerformance.points} World Athletics points)`
      : athlete.runnerType
        ? `${athlete.runnerType} profile across the available results`
        : "a growing body of competitive results";
  function scoreSignal(value: number | null): string {
    if (value === null) return "Not enough data yet";
    if (value >= 90) return "A standout strength";
    if (value >= 75) return "A strong contributor";
    if (value >= 60) return "Building momentum";
    return "Room to grow";
  }

  return (
    <div className={`player-card-shell${isFlipped ? " is-flipped" : ""}`}>
      <article className="player-card player-card-face player-card-front" aria-label={`${athlete.name} player card`}>
        <button
          className="player-card-flip-control"
          type="button"
          aria-label={`View back of ${athlete.name} player card`}
          onClick={() => setIsFlipped(true)}
        >
          <span>View Card Back</span>
          <span aria-hidden="true">↻</span>
        </button>
        <header className="player-card-topline">
          <div className="player-card-corner player-card-rank">
            <span>OVERALL</span>
            <strong>{athlete.overallRating?.toFixed(2) ?? "--"}</strong>
          </div>
          <span className="player-card-brand"> Wartburg XC/TF</span>
          <div className="player-card-corner player-card-graduation">
            <span>CLASS</span>
            <strong>{athlete.graduationYear ?? "--"}</strong>
          </div>
        </header>
        <figure className="player-card-portrait">
          {athlete.photoUrl ? (
            <img className="player-card-photo" src={athlete.photoUrl} alt={athlete.name} />
          ) : (
            <div className="player-card-photo-fallback" aria-hidden="true">
              <span>{initials}</span>
              <small>CROSS COUNTRY</small>
            </div>
          )}
          <figcaption className="player-card-name">{athlete.name}</figcaption>
        </figure>
        <section className="player-card-type" aria-label="Runner type">
          <div className="player-card-section-heading">
            <span>RUNNER TYPE</span>
            <strong>
              1st-T AA: {athlete.allAmericanCount} | 2nd-T AA:{" "}
              {athlete.secondTeamAllAmericanCount}
            </strong>
          </div>
          <p>{athlete.runnerType ?? "--"}</p>
        </section>
        <section className="player-card-consistency" aria-label="Ratings">
          <h2>RATINGS</h2>
          <div className="player-card-consistency-grid">
            {ratingScores.map(({ label, description, value, consistency }) => (
              <div className="player-card-rating-slot" key={label}>
                <div className="player-card-rating-row">
                  <span>{label}</span>
                  <strong aria-label={`${description}: ${value ?? "not rated"}`}>
                    {value?.toFixed(1) ?? "--"}
                  </strong>
                </div>
                {consistency !== null && (
                  <div className="player-card-rating-row player-card-rating-row-consistency">
                    <span>CONSISTENCY</span>
                    <strong aria-label={`${description} consistency: ${consistency}`}>
                      {consistency.toFixed(1)}
                    </strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="player-card-attributes" aria-label="Runner attributes">
          {[
            { label: "SPEED", description: "Speed", value: athlete.speedRating },
            { label: "ENDURANCE", description: "Endurance", value: athlete.enduranceRating },
            { label: "WIN FACTOR", description: "Win factor", value: athlete.winFactorRating },
          ].map(({ label, description, value }) => (
            <div className="player-card-attribute-slot" key={label}>
              <span>{label}</span>
              <strong aria-label={`${description}: ${value ?? "not rated"}`}>
                {value?.toFixed(1) ?? "--"}
              </strong>
            </div>
          ))}
        </section>
        <footer className="player-card-footer">
          {athlete.season} SEASON <span>WARTBURG CROSS COUNTRY</span>
        </footer>
      </article>
      <article className="player-card player-card-face player-card-back" aria-label={`${athlete.name} rating guide`}>
        <button
          className="player-card-flip-control player-card-flip-control-back"
          type="button"
          aria-label={`View front of ${athlete.name} player card`}
          onClick={() => setIsFlipped(false)}
        >
          <span>View Card Front</span>
          <span aria-hidden="true">↻</span>
        </button>
        <header className="player-card-back-header">
          <span>FULL PICTURE</span>
          <strong>{athlete.name}</strong>
          <small>Verified TFRRS results and team records</small>
        </header>
        <section className="player-card-back-section">
          <p className="player-card-back-summary">
            In total, {firstName} is a {athlete.allAmericanCount}x first-team All-American in XC,
            {achievementAnalysis.firstTeamByDiscipline.indoor ?? 0}x first-team All-American indoors,
            {achievementAnalysis.firstTeamByDiscipline.outdoor ?? 0}x first-team All-American outdoors,
            {achievementAnalysis.secondTeamByDiscipline.indoor ?? 0}x second-team All-American indoors,
            {achievementAnalysis.secondTeamByDiscipline.outdoor ?? 0}x second-team All-American outdoors.
            {bestPerformance
              ? ` The standout mark is ${bestPerformance.mark} in ${bestPerformance.event}, worth ${bestPerformance.points} World Athletics points.`
              : ` The standout performance is ${fallbackPerformance}.`}
            {" "}{achievementSummary}
          </p>
        </section>
        <section className="player-card-back-section" aria-label="Your score signals">
          <h2>WHY THIS SCORE</h2>
          <div className="player-card-signal-list">
            {scoreSignals.map(({ label, value, detail }) => (
              <div className="player-card-signal" key={label}>
                <div>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
                <span>
                  <strong>{value?.toFixed(1) ?? "--"}</strong>
                  <small>{scoreSignal(value)}</small>
                </span>
              </div>
            ))}
          </div>
          <p className="player-card-back-note">
            The overall score blends these signals, and missing data is never treated as a zero.
          </p>
        </section>
        <p className="player-card-back-footnote">
          Event ratings compare your best marks with Wartburg records. Track ratings include consistency, and strong national finishes can add a small bonus.
        </p>
      </article>
    </div>
  );
}

export default PlayerCard;
