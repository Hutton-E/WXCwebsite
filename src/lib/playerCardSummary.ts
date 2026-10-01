export interface PlayerCardRace {
  event: string;
  season_type: string | null;
  mark: string;
  status?: string | null;
  meet_name?: string | null;
  meet_date?: string | null;
  placing?: string | null;
}

interface PersonalRecord {
  event: string;
  mark: string;
}

interface SummaryAthlete {
  name: string;
  team: string;
  graduationYear: number | null;
  runnerType: string | null;
  crossCountryRating: number | null;
  indoorRating: number | null;
  outdoorRating: number | null;
  indoorConsistencyRating: number | null;
  outdoorConsistencyRating: number | null;
  winFactorRating: number | null;
  speedRating: number | null;
  enduranceRating: number | null;
  raceHistory: readonly PlayerCardRace[];
  personalRecords: Record<string, PersonalRecord[]>;
}

function placingNumber(value: string | null | undefined): number | null {
  const match = value?.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function isFinished(race: PlayerCardRace): boolean {
  return !race.status || race.status.toUpperCase() === "FINISHED";
}

function isNationalMeet(meetName: string, seasonType: string): boolean {
  if (!/\b(ncaa|national)\b/i.test(meetName)) return false;
  if (/\b(region|regional)\b/i.test(meetName)) return false;
  return seasonType === "cross_country"
    ? /cross\s*country/i.test(meetName)
    : seasonType === "indoor"
      ? /indoor/i.test(meetName)
      : /outdoor/i.test(meetName);
}

function isRelayEvent(event: string): boolean {
  return /\brelay\b|\b(?:dmr|smr)\b|\b\d+\s*x\s*\d+\b|\bmedley\b/i.test(event);
}

function isValidTrackEvent(event: string): boolean {
  return !isRelayEvent(event) && (eventMeters(event) ?? 0) >= 800;
}

function summaryRacesForSeason(
  races: readonly PlayerCardRace[],
  seasonType: string,
): readonly PlayerCardRace[] {
  const seasonRaces = races.filter(
    (race) => race.season_type === seasonType && isUsableRace(race),
  );
  if (seasonType === "cross_country") return seasonRaces;
  const validRaces = seasonRaces.filter(
    (race) => isValidTrackEvent(race.event),
  );
  return validRaces.length > 0
    ? validRaces
    : seasonRaces.filter((race) => isRelayEvent(race.event));
}

function countAllAmericans(
  races: readonly PlayerCardRace[],
  seasonType: "cross_country" | "indoor" | "outdoor",
  minimumPlace: number,
  maximumPlace: number,
): number {
  const appearances = new Set<string>();
  for (const race of races) {
    const meetName = race.meet_name ?? "";
    const placing = placingNumber(race.placing);
    if (
      !isFinished(race) ||
      race.season_type !== seasonType ||
      placing === null ||
      placing < minimumPlace ||
      placing > maximumPlace ||
      !isNationalMeet(meetName, seasonType) ||
      (seasonType !== "cross_country" && !/\(f\)\s*$/i.test(race.placing ?? ""))
    ) {
      continue;
    }
    const year = race.meet_date?.slice(0, 4) ?? "career";
    const event = seasonType === "cross_country" ? "xc" : race.event;
    appearances.add(`${year}|${event}`);
  }
  return appearances.size;
}

function markSeconds(mark: string): number | null {
  const normalizedMark = mark.trim();
  if (
    !/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(normalizedMark)
  ) {
    return null;
  }
  const parts = normalizedMark.split(":");
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (values.length === 3) return values[0] * 3600 + values[1] * 60 + values[2];
  if (values.length === 2) return values[0] * 60 + values[1];
  return values[0] ?? null;
}

function isUsableRace(race: PlayerCardRace): boolean {
  return isFinished(race) && markSeconds(race.mark) !== null;
}

function eventMeters(event: string): number | null {
  const normalized = event.toLowerCase().replace(/,/g, "");
  if (normalized.includes("mile")) return 1609;
  if (normalized.includes("steeple")) return 3000;
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(k|m|s)?\b/);
  if (!match) return null;
  return Number(match[1]) * (match[2] === "k" ? 1000 : 1);
}

function comparableTrackScore(record: PersonalRecord): number {
  const seconds = markSeconds(record.mark);
  const meters = eventMeters(record.event);
  return seconds && meters ? meters ** 1.06 / seconds : 0;
}

function normalizedEvent(event: string): string {
  return event.toLowerCase().replace(/\s+/g, " ").trim();
}

function mostCommonEvent(
  races: readonly PlayerCardRace[],
  seasonType: string,
): string | null {
  const seasonRaces = summaryRacesForSeason(races, seasonType);
  if (seasonRaces.length === 0) return null;

  const counts = new Map<string, { event: string; count: number }>();
  for (const race of seasonRaces) {
    const key = normalizedEvent(race.event);
    const current = counts.get(key);
    counts.set(key, {
      event: current?.event ?? race.event,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...counts.values()].sort(
    (first, second) => second.count - first.count,
  )[0]?.event ?? null;
}

function mostCommonEventPersonalRecord(
  races: readonly PlayerCardRace[],
  records: Record<string, PersonalRecord[]>,
  seasonType: string,
): { event: string; mark: string; meet: string } | null {
  const event = mostCommonEvent(races, seasonType);
  if (!event) return null;

  const matchingRecords = (records[seasonType] ?? []).filter(
    (record) =>
      normalizedEvent(record.event) === normalizedEvent(event) &&
      markSeconds(record.mark) !== null,
  );
  const personalRecord =
    matchingRecords.length > 0
      ? matchingRecords.reduce((best, record) =>
          comparableTrackScore(record) > comparableTrackScore(best)
            ? record
            : best,
        )
      : null;
  const matchingRaces = summaryRacesForSeason(races, seasonType).filter(
    (race) => normalizedEvent(race.event) === normalizedEvent(event),
  );
  const recordRace =
    matchingRaces.find(
      (race) => personalRecord !== null && race.mark === personalRecord.mark,
    ) ??
    matchingRaces.reduce<PlayerCardRace | null>((best, race) => {
      if (!best) return race;
      return markSeconds(race.mark) !== null &&
        markSeconds(best.mark) !== null &&
        markSeconds(race.mark)! < markSeconds(best.mark)!
        ? race
        : best;
    }, null);

  return {
    event: personalRecord?.event ?? event,
    mark: personalRecord?.mark ?? recordRace?.mark ?? "an unlisted mark",
    meet: recordRace?.meet_name ?? "an unlisted meet",
  };
}

function nationalChampionAchievements(
  races: readonly PlayerCardRace[],
): string[] {
  return races
    .filter((race) => {
      const seasonType = race.season_type ?? "";
      const meetName = race.meet_name ?? "";
      return (
        placingNumber(race.placing) === 1 &&
        /\(f\)\s*$/i.test(race.placing ?? "") &&
        isNationalMeet(meetName, seasonType) &&
        !/\b(region|regional)\b/i.test(meetName)
      );
    })
    .map(
      (race) =>
        `was a National Champ in the ${race.event} at the ${race.meet_name}`,
    );
}

function formatAllAmericanRecognition(
  count: number,
  seasonLabel: string,
  teamLabel: string,
): string | null {
  if (count === 0) return null;
  const countLabel = count === 1 ? "a" : `a ${count}-time`;
  return `${countLabel} ${seasonLabel} ${teamLabel}-team All-American`;
}

function joinRecognitions(recognitions: readonly string[]): string {
  if (recognitions.length <= 1) return recognitions[0] ?? "";
  if (recognitions.length === 2) {
    return `${recognitions[0]} and ${recognitions[1]}`;
  }
  return `${recognitions.slice(0, -1).join(", ")}, and ${recognitions.at(-1)}`;
}

function hasGraduated(graduationYear: number | null): boolean {
  if (graduationYear === null) return true;
  const now = new Date();
  return (
    now.getFullYear() > graduationYear ||
    (now.getFullYear() === graduationYear && now.getMonth() >= 4)
  );
}

function zeroAllAmericanSentence(
  athlete: SummaryAthlete,
  firstName: string,
): string {
  const ratings = [
    ["XC", athlete.crossCountryRating],
    ["indoor", athlete.indoorRating],
    ["indoor consistency", athlete.indoorConsistencyRating],
    ["outdoor", athlete.outdoorRating],
    ["outdoor consistency", athlete.outdoorConsistencyRating],
    ["win factor", athlete.winFactorRating],
    ["speed", athlete.speedRating],
    ["endurance", athlete.enduranceRating],
  ]
    .filter((rating): rating is [string, number] => rating[1] !== null)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([name, value]) => `${name} (${value})`);
  const strengths =
    ratings.length > 0
      ? `with top profile strengths in ${ratings.slice(0, -1).join(", ")}${
          ratings.length > 1 ? ", and " : ""
        }${ratings.at(-1)}`
      : "through consistent development and competition across all three seasons";

  if (athlete.graduationYear !== null && !hasGraduated(athlete.graduationYear)) {
    return `${firstName} graduates in ${athlete.graduationYear} and is currently building a strong collegiate profile ${strengths}.`;
  }
  return `${firstName} completed a strong collegiate career ${strengths}.`;
}

export function buildPlayerCardSummary(athlete: SummaryAthlete): string {
  const firstName = athlete.name.split(/\s+/)[0];
  const xcAllAmericans = countAllAmericans(athlete.raceHistory, "cross_country", 1, 40);
  const indoorAllAmericans = countAllAmericans(athlete.raceHistory, "indoor", 1, 8);
  const outdoorAllAmericans = countAllAmericans(athlete.raceHistory, "outdoor", 1, 8);
  const indoorSecondTeamAllAmericans = countAllAmericans(
    athlete.raceHistory,
    "indoor",
    9,
    16,
  );
  const outdoorSecondTeamAllAmericans = countAllAmericans(
    athlete.raceHistory,
    "outdoor",
    9,
    16,
  );
  const allAmericanRecognitions = [
    formatAllAmericanRecognition(xcAllAmericans, "XC", "first"),
    formatAllAmericanRecognition(indoorAllAmericans, "indoor", "first"),
    formatAllAmericanRecognition(outdoorAllAmericans, "outdoor", "first"),
    formatAllAmericanRecognition(
      indoorSecondTeamAllAmericans,
      "indoor",
      "second",
    ),
    formatAllAmericanRecognition(
      outdoorSecondTeamAllAmericans,
      "outdoor",
      "second",
    ),
  ].filter((recognition): recognition is string => recognition !== null);
  const allAmericanRecognitionText = joinRecognitions(allAmericanRecognitions);
  const graduatedRecognitionSentence = `${firstName} graduated in ${
    athlete.graduationYear ?? "their final Wartburg season"
  } as ${allAmericanRecognitionText}.`;
  const statusSentence =
    allAmericanRecognitions.length === 0
      ? zeroAllAmericanSentence(athlete, firstName)
      : athlete.graduationYear !== null && !hasGraduated(athlete.graduationYear)
        ? `${firstName} graduates in ${athlete.graduationYear} and is currently ${allAmericanRecognitionText}.`
        : graduatedRecognitionSentence;
  const seasonSentences = [
    ["cross-country", "cross_country"],
    ["indoor", "indoor"],
    ["outdoor", "outdoor"],
  ].map(([label, seasonType]) => {
    const record = mostCommonEventPersonalRecord(
      athlete.raceHistory,
      athlete.personalRecords,
      seasonType,
    );
    if (!record) return `This athlete has no recorded ${label} data.`;
    return `${firstName}'s most-run ${label} event is ${record.event}, with a PR of ${record.mark} at the ${record.meet}.`;
  });
  const nationalChampSentences = nationalChampionAchievements(
    athlete.raceHistory,
  ).map((achievement) => `${firstName} ${achievement}.`);

  return [statusSentence, ...seasonSentences, ...nationalChampSentences].join(
    " ",
  );
}
