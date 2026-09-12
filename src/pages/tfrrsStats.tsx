import { useUser } from "../context/UserContext";
import tfrrsStats from "../data/tfrrs_stats.json";

interface BestEvent {
  event: string;
  time: string;
  resultUrl: string;
}

interface AthleteStats {
  name: string;
  tfrrsId: string;
  fetchedAt: string;
  bests: BestEvent[];
}

const statsById = tfrrsStats as Record<string, AthleteStats>;

function TfrrsStats() {
  const { athlete } = useUser();

  if (!athlete) return null; // RequireIdentity already guards this route

  const stats = statsById[athlete.id];

  return (
    <div className="tfrrs-page">
      <h1 className="tfrrs-title acme-regular text-outline">
        {athlete.name}&apos;s TFRRS Bests
      </h1>

      {!stats && (
        <p className="tfrrs-no-data acme-regular text-outline">
          No TFRRS results found yet — check back once races are logged!
        </p>
      )}

      {stats && (
        <ul className="tfrrs-list">
          {stats.bests.map((b) => (
            <li key={b.event} className="tfrrs-item">
              <span className="tfrrs-event">{b.event}</span>
              <a
                className="tfrrs-time"
                href={b.resultUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {b.time}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TfrrsStats;
