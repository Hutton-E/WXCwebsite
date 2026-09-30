import { useState } from "react";
import type { Athlete } from "../context/UserContext";

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
        <section className="player-card-summary-panel" aria-label="Athlete summary">
          <h2>ABOUT THE ATHLETE</h2>
          <p>{athlete.cardSummary}</p>
        </section>
      </article>
    </div>
  );
}

export default PlayerCard;
