import { useEffect, useMemo, useState } from "react";
import PlayerCard from "../components/playerCard";
import { fetchPlayerCards } from "../lib/playerCardData";
import type { Athlete } from "../context/UserContext";

type GenderFilter = "all" | "women" | "men";
type SortField =
  | "overallRating"
  | "crossCountryRating"
  | "indoorRating"
  | "indoorConsistencyRating"
  | "outdoorRating"
  | "outdoorConsistencyRating"
  | "speedRating"
  | "enduranceRating"
  | "winFactorRating"
  | "graduationYear";

const sortOptions: { value: SortField; label: string }[] = [
  { value: "overallRating", label: "Overall" },
  { value: "graduationYear", label: "Class graduation date" },
  { value: "crossCountryRating", label: "XC" },
  { value: "indoorRating", label: "Indoor" },
  { value: "indoorConsistencyRating", label: "Indoor consistency" },
  { value: "outdoorRating", label: "Outdoor" },
  { value: "outdoorConsistencyRating", label: "Outdoor consistency" },
  { value: "speedRating", label: "Speed" },
  { value: "enduranceRating", label: "Endurance" },
  { value: "winFactorRating", label: "Win factor" },
];

function getGender(team: string): Exclude<GenderFilter, "all"> {
  return team === "womens-cross-country" ? "women" : "men";
}

function PlayerCardsPage() {
  const [cards, setCards] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("all");
  const [classYear, setClassYear] = useState("all");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [sortField, setSortField] = useState<SortField>("overallRating");
  const [descending, setDescending] = useState(true);
  const [minimumRank, setMinimumRank] = useState("");
  const [maximumRank, setMaximumRank] = useState("");
  const [runnerType, setRunnerType] = useState("all");
  const [allAmerican, setAllAmerican] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetchPlayerCards()
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((fetchError: Error) => {
        if (!cancelled) setError(fetchError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const seasons = useMemo(
    () => [...new Set(cards.map((card) => card.season))].sort((a, b) => b - a),
    [cards],
  );
  const classYears = useMemo(
    () =>
      [
        ...new Set(
          cards
            .map((card) => card.graduationYear)
            .filter((value): value is number => value !== null),
        ),
      ].sort((a, b) => a - b),
    [cards],
  );
  const runnerTypes = useMemo(
    () => {
      const values = cards
        .map((card) => card.runnerType)
        .filter((value): value is string => Boolean(value));
      return [...new Set(values)].sort((a, b) => a.localeCompare(b));
    },
    [cards],
  );

  const cardsForSelectedSeason = useMemo(() => {
    if (season !== "all") {
      return cards.filter((card) => card.season === Number(season));
    }

    const latestByTfrrsId = new Map<string, Athlete>();
    const cardsWithoutTfrrsId: Athlete[] = [];

    for (const card of cards) {
      if (!card.tfrrsId) {
        cardsWithoutTfrrsId.push(card);
        continue;
      }

      const existing = latestByTfrrsId.get(card.tfrrsId);
      if (!existing || card.season > existing.season) {
        latestByTfrrsId.set(card.tfrrsId, card);
      }
    }

    return [...latestByTfrrsId.values(), ...cardsWithoutTfrrsId];
  }, [cards, season]);

  const filteredCards = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    const minRank = minimumRank ? Number(minimumRank) : null;
    const maxRank = maximumRank ? Number(maximumRank) : null;

    return cardsForSelectedSeason
      .filter((card) => {
        const matchesQuery =
          !lowerQuery || card.name.toLowerCase().includes(lowerQuery);
        const matchesSeason = season === "all" || card.season === Number(season);
        const matchesClassYear =
          classYear === "all" || card.graduationYear === Number(classYear);
        const matchesGender =
          gender === "all" || getGender(card.team) === gender;
        const matchesRank =
          (minRank === null ||
            (card.overallRank !== null && card.overallRank >= minRank)) &&
          (maxRank === null ||
            (card.overallRank !== null && card.overallRank <= maxRank));
        const matchesRunnerType =
          runnerType === "all" || card.runnerType === runnerType;
        const matchesAllAmerican =
          allAmerican === "all" ||
          (allAmerican === "yes"
            ? card.allAmericanCount + card.secondTeamAllAmericanCount > 0
            : card.allAmericanCount + card.secondTeamAllAmericanCount === 0);
        return (
          matchesQuery &&
          matchesSeason &&
          matchesClassYear &&
          matchesGender &&
          matchesRank &&
          matchesRunnerType &&
          matchesAllAmerican
        );
      })
      .sort((first, second) => {
        const firstValue = first[sortField];
        const secondValue = second[sortField];
        if (firstValue === secondValue) return first.name.localeCompare(second.name);
        if (firstValue === null || firstValue === undefined) return 1;
        if (secondValue === null || secondValue === undefined) return -1;
        const comparison = Number(firstValue) - Number(secondValue);
        return descending ? -comparison : comparison;
      });
  }, [
    allAmerican,
    cardsForSelectedSeason,
    classYear,
    descending,
    gender,
    maximumRank,
    minimumRank,
    query,
    runnerType,
    season,
    sortField,
  ]);

  return (
    <main className="player-cards-browser">
      <h1 className="player-cards-title acme-regular text-outline">
        View Player Cards
      </h1>
      <section className="player-cards-filters" aria-label="Player card filters">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
          />
        </label>
        <label>
          Season
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            <option value="all">All seasons</option>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class Year
          <select
            value={classYear}
            onChange={(event) => setClassYear(event.target.value)}
          >
            <option value="all">All class years</option>
            {classYears.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Team
          <select value={gender} onChange={(event) => setGender(event.target.value as GenderFilter)}>
            <option value="all">Women & Men</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            value={descending ? "descending" : "ascending"}
            onChange={(event) => setDescending(event.target.value === "descending")}
          >
            <option value="descending">Descending</option>
            <option value="ascending">Ascending</option>
          </select>
        </label>
        <label>
          Overall rank from
          <input
            type="number"
            min="1"
            value={minimumRank}
            onChange={(event) => setMinimumRank(event.target.value)}
            placeholder="Any"
          />
        </label>
        <label>
          Overall rank to
          <input
            type="number"
            min="1"
            value={maximumRank}
            onChange={(event) => setMaximumRank(event.target.value)}
            placeholder="Any"
          />
        </label>
        <label>
          Runner type
          <select value={runnerType} onChange={(event) => setRunnerType(event.target.value)}>
            <option value="all">All running types</option>
            {runnerTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          All-American
          <select value={allAmerican} onChange={(event) => setAllAmerican(event.target.value)}>
            <option value="all">Any status</option>
            <option value="yes">All-American</option>
            <option value="no">Not All-American</option>
          </select>
        </label>
      </section>

      {loading && <p className="player-cards-status">Loading player cards...</p>}
      {error && <p className="player-cards-status">Unable to load player cards: {error}</p>}
      {!loading && !error && (
        <p className="player-cards-count">
          Showing {filteredCards.length} of {cardsForSelectedSeason.length}{" "}
          player cards
        </p>
      )}
      <section className="player-cards-grid" aria-live="polite">
        {filteredCards.map((card) => (
          <PlayerCard key={`${card.id}-${card.season}`} athlete={card} />
        ))}
      </section>
    </main>
  );
}

export default PlayerCardsPage;
