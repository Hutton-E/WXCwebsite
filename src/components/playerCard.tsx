import { useState } from "react";
import type { Athlete } from "../context/UserContext";

interface PlayerCardProps {
  athlete: Athlete;
}

function PlayerCard({ athlete }: PlayerCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [openExample, setOpenExample] = useState<string | null>(null);
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
        <section className="player-card-rating-guide" aria-label="How ratings are calculated">
          <h2>HOW RATINGS ARE CALCULATED</h2>
          <dl>
            {[
              {
                key: "overall",
                label: "Overall",
                description:
                  "Combines season performance, physical ability, and success in competition.",
                example: "Note - Takes a weighted average of the following: cross country, a weighted average from indoor/outdoor track performances with their relative consistencies, a weighted average of speed/endurance, a win-factor bonus.",
              },
              {
                key: "xc",
                label: "XC",
                description:
                  "Compares the athlete's best cross country time with the team's best at the standard distance, with credit for All-American finishes.",
                example: "Note - There is no consistency rating for xc because every race is different (course, weather, footing, etc). The odds you have atleast one good day/course in your entire career are high. Therefore, rating is ultimately based on your fastest performance against WXC's fastest performance.",
              },
              {
                key: "indoor-outdoor",
                label: "Indoor / Outdoor",
                description:
                  "Compares an athlete's performances with Wartburg school records, giving more weight to events they run more often.",
                example:
                  "Note - Each event's score is weighted by the number of times it was run. Example: An athlete, in their entire career, has run fifty 800m races, but also three 5000m races. The 800-meter races give that event performance a higher weight, while the 5000-meter races give that event performance a lower weight. The 800-meter results therefore have much more influence on the final indoor rating because the athlete has competed in that event far more often.",
              },
              {
                key: "consistency",
                label: "Consistency",
                description:
                  "Rewards performances that stay close to the athlete's personal best and penalizes large swings from race to race.",
                example:
                  "Note - Consistency compares an athlete's race times to their personal best in that event. Personal Best performances in succession will receive max points. Example: An athlete who repeatedly runs close to their personal best will receive a higher consistency rating, while an athlete whose times vary widely from race to race will receive a lower rating.",
              },
              {
                key: "speed",
                label: "Speed",
                description:
                  "Converts the athlete's best track mark to an equivalent 400-meter time and compares it with the team's fastest.",
                example:
                  "Note - Speed estimates how fast an athlete has or could run 400 meters. A recorded 400-meter time is used when available. Otherwise, the athlete's best performance from their three shortest race distances is converted into a predicted 400-meter time, with a small adjustment based on their most common race type. Distance-focused athletes who primarily run the 5K to 10K receive a larger penalty because their events are farther from 400 meters.",
              },
              {
                key: "endurance",
                label: "Endurance",
                description:
                  "Converts the athlete's best distance performance to an equivalent 10,000-meter time and compares it with the team's fastest.",
                example:
                  "Note - Endurance estimates how well an athlete has or could run 10,000 meters. A recorded 10,000-meter time is used when available. Otherwise, the athlete's best performance at their longest race distance is converted into a predicted 10,000-meter time, with a small adjustment based on their most common race type. Mid-distance athletes who primarily run the 800m/1500m/Mile receive a larger adjustment because their events are farther from 10,000 meters.",
              },
              {
                key: "win-factor",
                label: "Win factor",
                description:
                  "Measures average race success, with more credit for high finishes at conference, regional, and national meets.",
                example:
                  "Note - Win factor measures how successfully an athlete finishes races. Completed races earn points based on placing, with more points available at conference, regional, and national meets. Each race is converted into a percentage of its meet's maximum score, then averaged by season and across the athlete's career. Athletes with fewer completed races are adjusted toward the team average, while consistently strong finishes at important meets produce a higher rating.",
              },
            ].map(({ key, label, description, example }) => {
              const isOpen = openExample === key;
              return (
                <div key={key} className={isOpen ? "is-example-open" : ""}>
                  <dt>{label}</dt>
                  <dd>{description}</dd>
                  <button
                    className="player-card-example-tab"
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`rating-example-${key}`}
                    onClick={() => setOpenExample(isOpen ? null : key)}
                  >
                    Info.
                  </button>
                  <div
                    id={`rating-example-${key}`}
                    className="player-card-rating-example"
                    aria-hidden={!isOpen}
                  >
                    {example}
                  </div>
                </div>
              );
            })}
          </dl>
        </section>
      </article>
    </div>
  );
}

export default PlayerCard;
