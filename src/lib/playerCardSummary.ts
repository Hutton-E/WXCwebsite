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

function finishLevel(meetName: string, seasonType: string): number {
  if (isNationalMeet(meetName, seasonType)) return 3;
  if (/\b(region|regional)\b/i.test(meetName)) return 2;
  if (/\b(conference|a-?r-?c|american rivers|i+iac)\b/i.test(meetName)) {
    return 1;
  }
  return 0;
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
  const seasonRaces = races.filter((race) => race.season_type === seasonType);
  if (seasonType === "cross_country") return seasonRaces;
  const validRaces = seasonRaces.filter(
    (race) => isFinished(race) && isValidTrackEvent(race.event),
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
  const parts = mark.replace(/[A-Za-z]/g, "").trim().split(":");
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (values.length === 3) return values[0] * 3600 + values[1] * 60 + values[2];
  if (values.length === 2) return values[0] * 60 + values[1];
  return values[0] ?? null;
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

function bestRecord(
  records: Record<string, PersonalRecord[]>,
  seasonType: string,
  team: string,
): PersonalRecord | null {
  const allSeasonRecords = (records[seasonType] ?? []).filter(
    (record) => record.event && record.mark,
  );
  const seasonRecords =
    seasonType === "cross_country"
      ? allSeasonRecords
      : allSeasonRecords.filter((record) => isValidTrackEvent(record.event)).length > 0
        ? allSeasonRecords.filter((record) => isValidTrackEvent(record.event))
        : allSeasonRecords.filter((record) => isRelayEvent(record.event));
  if (seasonRecords.length === 0) return null;
  if (seasonType === "cross_country") {
    const target = team.startsWith("womens") ? /\b6\s*k\b/i : /\b8\s*k\b/i;
    return seasonRecords.find((record) => target.test(record.event)) ?? seasonRecords[0];
  }
  return seasonRecords.reduce((best, record) =>
    comparableTrackScore(record) > comparableTrackScore(best) ? record : best,
  );
}

function ordinal(place: number): string {
  if (place % 100 >= 11 && place % 100 <= 13) return `${place}th`;
  const suffix =
    place % 10 === 1
      ? "st"
      : place % 10 === 2
        ? "nd"
        : place % 10 === 3
          ? "rd"
          : "th";
  return `${place}${suffix}`;
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

function bestSeasonFinish(
  races: readonly PlayerCardRace[],
  seasonType: string,
): string | null {
  const eligibleRaces = summaryRacesForSeason(races, seasonType).filter((race) => {
    const meetName = race.meet_name ?? "";
    const place = placingNumber(race.placing);
    if (
      race.season_type !== seasonType ||
      !isFinished(race) ||
      !meetName ||
      place === null
    ) {
      return false;
    }
    if (isNationalMeet(meetName, seasonType)) {
      if (seasonType === "cross_country" && place > 40) return false;
      if (
        seasonType !== "cross_country" &&
        !/\(f\)\s*$/i.test(race.placing ?? "")
      ) {
        return false;
      }
    }
    return true;
  });
  const best = eligibleRaces
    .sort(
      (first, second) => {
        const firstMeet = first.meet_name ?? "";
        const secondMeet = second.meet_name ?? "";
        return (
          finishLevel(secondMeet, seasonType) -
            finishLevel(firstMeet, seasonType) ||
          (placingNumber(first.placing) ?? Infinity) -
            (placingNumber(second.placing) ?? Infinity)
        );
      },
    )[0];
  const place = best ? placingNumber(best.placing) : null;
  if (!best || !place) return null;
  if (seasonType !== "cross_country") {
    if (isRelayEvent(best.event)) {
      return `${ordinal(place)} in the full-team ${best.event} (${best.mark}) at ${best.meet_name}`;
    }
    return `${ordinal(place)} in ${best.event} (${best.mark}) at ${best.meet_name}`;
  }
  return `${ordinal(place)} at ${best.meet_name}`;
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
  const grassGod = athlete.runnerType === "Grass God";
  const indoorDemon = athlete.runnerType === "Indoor Demon";
  const outdoorSpecialist =
    athlete.runnerType === "Outdoor Allstar" ||
    athlete.runnerType === "Outdoor Outlaw";
  const jackOfAllRaces = athlete.runnerType === "Jack-Of-All-Races";
  const seasons = grassGod
    ? ["cross_country"]
    : indoorDemon
      ? ["indoor"]
      : outdoorSpecialist
        ? ["outdoor"]
        : jackOfAllRaces
          ? ["cross_country", "indoor", "outdoor"]
          : ["cross_country", "indoor", "outdoor"];
  const records = seasons
    .map((seasonType) => bestRecord(athlete.personalRecords, seasonType, athlete.team))
    .filter((record): record is PersonalRecord => record !== null)
    .map((record) => `${record.event} (${record.mark})`);
  const finishes = seasons
    .map((seasonType) => bestSeasonFinish(athlete.raceHistory, seasonType))
    .filter((finish): finish is string => finish !== null);
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
  const archetypeLead = grassGod
    ? "As a Grass God, their target-distance XC PR and best cross-country finish show a runner built for the long haul"
    : indoorDemon
      ? "As an Indoor Demon, their fastest comparable indoor event and best indoor finish show sharp speed and precision"
      : outdoorSpecialist
        ? "As an Outdoor Allstar, their fastest comparable outdoor event and best outdoor finish show range and confidence"
        : jackOfAllRaces
          ? "As a Jack-Of-All-Races, their fastest XC, indoor, and outdoor events show a rare ability to contribute across every season"
          : "Their best available marks and finishes show a versatile competitor with a clear competitive identity";
  const performanceSentence =
    records.length > 0
      ? `${archetypeLead}, highlighted by ${records.join(" and ")}${finishes.length > 0 ? ` and ${finishes.join(" and ")}` : ""}.`
      : finishes.length > 0
        ? `${archetypeLead}, highlighted by ${finishes.join(" and ")}.`
        : `${firstName} developed as a ${athlete.runnerType ?? "versatile"} competitor across the available results.`;

  return `${statusSentence} ${performanceSentence.replace("their", `${firstName}'s`)}`;
}
