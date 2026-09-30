export interface AthleteRaceRecord {
  event: string;
  season_type: string | null;
  meet_date: string | null;
  mark: string;
  status?: string | null;
  meet_name?: string | null;
  placing?: string | null;
  round?: string | null;
  result_url?: string | null;
}

export type AchievementLevel = "national" | "regional" | "conference" | "notable";

export interface AthleteAchievement {
  level: AchievementLevel;
  label: string;
  meetName: string;
  event: string;
  placing: number;
  seasonType: string;
  year: number | null;
}

export interface AchievementAnalysis {
  regionalChampions: Record<string, number>;
  nationalChampions: Record<string, number>;
  conferenceChampions: Record<string, number>;
  nationalTrackFinishes: Array<{ seasonType: string; event: string; placing: number }>;
  firstTeamEvents: string[];
  secondTeamEvents: string[];
  firstTeamBySeason: Record<string, number>;
  secondTeamBySeason: Record<string, number>;
  firstTeamByDiscipline: Record<string, number>;
  secondTeamByDiscipline: Record<string, number>;
  accoladeYears: Array<{ year: number; description: string }>;
  topAchievements: AthleteAchievement[];
}

function parsePlacing(placing: string | null | undefined): number | null {
  const match = placing?.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function classifyMeet(meetName: string): AchievementLevel | null {
  if (/\b(regional|regionals|midwest regional)\b/i.test(meetName)) {
    return "regional";
  }
  if (/\b(conference|a-?r-?c|american rivers|i+iac)\b/i.test(meetName)) {
    return "conference";
  }
  if (/\b(ncaa|national)\b/i.test(meetName)) {
    return "national";
  }
  return null;
}

function levelPriority(level: AchievementLevel): number {
  return { national: 4, regional: 3, conference: 2, notable: 1 }[level];
}

function formatLevel(level: AchievementLevel): string {
  return {
    national: "national",
    regional: "regional",
    conference: "conference",
    notable: "notable",
  }[level];
}

export function findTopAchievements(
  raceHistory: readonly AthleteRaceRecord[],
): AthleteAchievement[] {
  const achievements = raceHistory
    .map((race) => {
      const meetName = race.meet_name?.trim();
      const placing = parsePlacing(race.placing);
      if (
        !meetName ||
        placing === null ||
        placing < 1 ||
        placing > 8 ||
        race.status?.toUpperCase() !== "FINISHED"
      ) {
        return null;
      }

      const championshipLevel = classifyMeet(meetName);
      const level =
        championshipLevel ??
        (placing <= 3 && race.season_type === "cross_country" ? "notable" : null);
      if (!level) return null;

      return {
        level,
        label: `${formatLevel(level)} ${placing === 1 ? "champion" : `top-${placing} finish`}`,
        meetName,
        event: race.event,
        placing,
        seasonType: race.season_type ?? "track",
        year: race.meet_date ? Number(race.meet_date.slice(0, 4)) : null,
      };
    })
    .filter((achievement): achievement is AthleteAchievement => achievement !== null)
    .sort(
      (first, second) =>
        levelPriority(second.level) - levelPriority(first.level) ||
        first.placing - second.placing,
    );

  const uniqueAchievements = new Map<string, AthleteAchievement>();
  for (const achievement of achievements) {
    const key = `${achievement.level}|${achievement.meetName}|${achievement.event}`;
    if (!uniqueAchievements.has(key)) uniqueAchievements.set(key, achievement);
  }
  return [...uniqueAchievements.values()].slice(0, 3);
}

function isNationalMeet(meetName: string): boolean {
  return /\b(ncaa|national)\b/i.test(meetName);
}

function isFinalResult(race: AthleteRaceRecord): boolean {
  return race.season_type === "cross_country" || /\(f\)\s*$/i.test(race.placing ?? "");
}

function seasonLabel(seasonType: string): string {
  return seasonType === "cross_country" ? "XC" : seasonType;
}

export function analyzeAchievements(
  raceHistory: readonly AthleteRaceRecord[],
): AchievementAnalysis {
  const regionalChampions: Record<string, number> = {};
  const nationalChampions: Record<string, number> = {};
  const conferenceChampions: Record<string, number> = {};
  const nationalTrackFinishes = new Map<
    string,
    { seasonType: string; event: string; placing: number }
  >();
  const firstTeamEvents = new Set<string>();
  const secondTeamEvents = new Set<string>();
  const firstTeamBySeason = new Map<string, Set<string>>();
  const secondTeamBySeason = new Map<string, Set<string>>();
  const firstTeamByDiscipline = new Map<string, Set<string>>();
  const secondTeamByDiscipline = new Map<string, Set<string>>();
  const accoladeYears = new Map<number, Set<string>>();
  const countedChampionships = new Set<string>();

  for (const race of raceHistory) {
    if (race.status?.toUpperCase() !== "FINISHED" || !race.meet_name) continue;
    const placing = parsePlacing(race.placing);
    if (placing === null) continue;

    const seasonType = race.season_type ?? "track";
    const level = classifyMeet(race.meet_name);
    if (
      placing === 1 &&
      (level === "regional" ||
        level === "conference" ||
        (level === "national" && isNationalMeet(race.meet_name)))
    ) {
      const counts =
        level === "regional"
          ? regionalChampions
          : level === "conference"
            ? conferenceChampions
            : nationalChampions;
      const championshipKey = `${level}|${seasonType}|${race.meet_name}|${race.event}|${race.meet_date ?? "career"}`;
      if (!countedChampionships.has(championshipKey)) {
        countedChampionships.add(championshipKey);
        counts[seasonType] = (counts[seasonType] ?? 0) + 1;
        const year = race.meet_date ? Number(race.meet_date.slice(0, 4)) : null;
        if (year) {
          const description = `${seasonLabel(seasonType)} ${level} champion`;
          const descriptions = accoladeYears.get(year) ?? new Set<string>();
          descriptions.add(description);
          accoladeYears.set(year, descriptions);
        }
      }
    }

    const national = level === "national" && isNationalMeet(race.meet_name);
    if (national && isFinalResult(race)) {
      const year = race.meet_date?.slice(0, 4) ?? "career";
      if (seasonType === "cross_country" && placing <= 40) {
        firstTeamEvents.add("cross country");
        const year = race.meet_date?.slice(0, 4) ?? "career";
        const events = firstTeamBySeason.get(year) ?? new Set<string>();
        events.add("cross country");
        firstTeamBySeason.set(year, events);
        const discipline = firstTeamByDiscipline.get(seasonType) ?? new Set<string>();
        discipline.add(`${race.event}|${year}`);
        firstTeamByDiscipline.set(seasonType, discipline);
      }
      if (seasonType === "indoor" || seasonType === "outdoor") {
        const key = `${seasonType}|${race.event}|${year}`;
        if (placing <= 8) {
          firstTeamEvents.add(race.event);
          const events = firstTeamBySeason.get(year) ?? new Set<string>();
          events.add(`${seasonLabel(seasonType)} ${race.event}`);
          firstTeamBySeason.set(year, events);
          const discipline = firstTeamByDiscipline.get(seasonType) ?? new Set<string>();
          discipline.add(`${race.event}|${year}`);
          firstTeamByDiscipline.set(seasonType, discipline);
        } else if (placing <= 16) {
          secondTeamEvents.add(race.event);
          const events = secondTeamBySeason.get(year) ?? new Set<string>();
          events.add(`${seasonLabel(seasonType)} ${race.event}`);
          secondTeamBySeason.set(year, events);
          const discipline = secondTeamByDiscipline.get(seasonType) ?? new Set<string>();
          discipline.add(`${race.event}|${year}`);
          secondTeamByDiscipline.set(seasonType, discipline);
        }
        if (placing <= 8) {
          nationalTrackFinishes.set(key, {
            seasonType,
            event: race.event,
            placing,
          });
        }
      }
    }
  }

  return {
    regionalChampions,
    nationalChampions,
    conferenceChampions,
    nationalTrackFinishes: [...nationalTrackFinishes.values()],
    firstTeamEvents: [...firstTeamEvents],
    secondTeamEvents: [...secondTeamEvents],
    firstTeamBySeason: Object.fromEntries(
      [...firstTeamBySeason.entries()].map(([year, events]) => [year, events.size]),
    ),
    secondTeamBySeason: Object.fromEntries(
      [...secondTeamBySeason.entries()].map(([year, events]) => [year, events.size]),
    ),
    firstTeamByDiscipline: Object.fromEntries(
      [...firstTeamByDiscipline.entries()].map(([discipline, events]) => [discipline, events.size]),
    ),
    secondTeamByDiscipline: Object.fromEntries(
      [...secondTeamByDiscipline.entries()].map(([discipline, events]) => [discipline, events.size]),
    ),
    accoladeYears: [...accoladeYears.entries()]
      .map(([year, descriptions]) => ({ year, description: [...descriptions].join(" and ") }))
      .sort((first, second) => first.year - second.year),
    topAchievements: findTopAchievements(raceHistory),
  };
}

function countPhrase(
  counts: Record<string, number>,
  suffix: string,
): string | null {
  const phrases = Object.entries(counts).map(
    ([seasonType, count]) => `${count}x ${seasonLabel(seasonType)}${suffix}`,
  );
  return phrases.length > 0 ? phrases.join(" and ") : null;
}

export function buildAchievementSummary(
  name: string,
  raceHistory: readonly AthleteRaceRecord[],
  runnerType: string | null,
  ratings: {
    crossCountry: number | null;
    indoor: number | null;
    outdoor: number | null;
    speed: number | null;
    endurance: number | null;
    winFactor: number | null;
  },
  allAmericanCounts: { firstTeam: number; secondTeam: number },
): string {
  const analysis = analyzeAchievements(raceHistory);
  const achievementPhrases = [
    countPhrase(analysis.regionalChampions, " regional champion"),
    ...Object.entries(analysis.nationalChampions).map(
      ([seasonType, count]) =>
        `${count}x ${seasonLabel(seasonType).toLowerCase()} race national champion`,
    ),
    countPhrase(analysis.conferenceChampions, " conference champion"),
    ...analysis.nationalTrackFinishes
      .filter(({ placing }) => placing > 1)
      .slice(0, 2)
      .map(
        ({ seasonType, event, placing }) =>
          `${seasonLabel(seasonType).toLowerCase()} national ${placing === 2 ? "runner-up" : `top-${placing} finisher`} in ${event}`,
      ),
    allAmericanCounts.firstTeam > 0
      ? `${allAmericanCounts.firstTeam}x first-team All-American${
          analysis.firstTeamEvents.length > 0
            ? ` in ${analysis.firstTeamEvents.slice(0, 3).join(", ")}`
            : ""
        }`
      : null,
    allAmericanCounts.secondTeam > 0
      ? `${allAmericanCounts.secondTeam}x second-team All-American${
          analysis.secondTeamEvents.length > 0
            ? ` in ${analysis.secondTeamEvents.slice(0, 3).join(", ")}`
            : ""
        }`
      : null,
  ].filter((phrase): phrase is string => phrase !== null);

  const ratingAreas = [
    { label: "cross-country strength", value: ratings.crossCountry },
    { label: "indoor track speed", value: ratings.indoor },
    { label: "outdoor track strength", value: ratings.outdoor },
    { label: "speed", value: ratings.speed },
    { label: "endurance", value: ratings.endurance },
    { label: "competitive finishes", value: ratings.winFactor },
  ]
    .filter((rating): rating is { label: string; value: number } => rating.value !== null)
    .sort((first, second) => second.value - first.value);
  const strongestArea = ratingAreas[0]?.label ?? "consistent results";
  const firstName = name.split(" ")[0];
  const archetypePhrase =
    runnerType === "Grass God"
      ? `${firstName} is a cross-country force whose ${strongestArea} sets the tone`
      : runnerType === "Indoor Demon"
        ? `${firstName} brings proven indoor-track firepower, led by ${strongestArea}`
        : runnerType === "Outdoor Allstar"
          ? `${firstName} shines when the outdoor season reaches its biggest moments, led by ${strongestArea}`
          : runnerType === "Jack-Of-All-Races"
            ? `${firstName} is a versatile threat across disciplines, with ${strongestArea} standing out`
            : `${firstName} has built a confident, competitive profile around ${strongestArea}`;

  if (achievementPhrases.length === 0) {
    return `${archetypePhrase} and gives Wartburg a dependable competitor with a clear ability to contribute wherever the race takes them.`;
  }
  return `${firstName} is a ${achievementPhrases.join(", and ")}. ${archetypePhrase}, making this runner a confident presence on the start line.`;
}
