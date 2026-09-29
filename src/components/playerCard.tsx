import type { Athlete } from "../context/UserContext";

interface PlayerCardProps {
  athlete: Athlete;
}

function PlayerCard({ athlete }: PlayerCardProps) {
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
    <article className="player-card" aria-label={`${athlete.name} player card`}>
      <header className="player-card-topline">
        <div className="player-card-corner player-card-rank">
          <span>RANK</span>
          <strong>--</strong>
        </div>
        <span className="player-card-brand">WARTBURG RUNNER</span>
        <div className="player-card-corner player-card-graduation">
          <span>CLASS</span>
          <strong>{athlete.graduationYear ?? "--"}</strong>
        </div>
      </header>

      <figure className="player-card-portrait">
        {athlete.photoUrl ? (
          <img
            className="player-card-photo"
            src={athlete.photoUrl}
            alt={athlete.name}
          />
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
          <strong>--</strong>
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
                  <strong
                    aria-label={`${description} consistency: ${consistency}`}
                  >
                    {consistency.toFixed(1)}
                  </strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section
        className="player-card-attributes"
        aria-label="Runner attributes"
      >
        {[
          {
            label: "SPEED",
            description: "Speed",
            value: athlete.speedRating,
          },
          {
            label: "ENDURANCE",
            description: "Endurance",
            value: athlete.enduranceRating,
          },
          {
            label: "WIN FACTOR",
            description: "Win factor",
            value: athlete.winFactorRating,
          },
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
  );
}

export default PlayerCard;
