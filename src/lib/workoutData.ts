import { supabase } from "./supabaseClient";

export interface WorkoutGroupRow {
  week_of: string;
  day: string;
  group_letter: string;
  description: string;
}

export interface WorkoutDay {
  weekOf: string;
  day: string;
  season: number;
  groupLetter: string | null;
  description: string | null;
  intervals: Record<string, string> | null;
  note: string | null;
}

export interface WorkoutPeer {
  athleteId: string;
  name: string;
  groupLetter: string | null;
  intervals: Record<string, string> | null;
}

// Queries by NAME, not by the season-scoped athlete_id — a real person's
// id changes every season, but their name stays constant, so this
// surfaces every historical record for them regardless of which season
// they're currently logged in as.
//
// preview=false (default): only published (is_draft = false) data shows —
// this is what real athletes see.
// preview=true: draft data is included too — used only via the admin's
// own ?preview=1 link before publishing.
export async function fetchWorkoutsForAthlete(
  athleteName: string,
  team: string,
  preview = false,
): Promise<WorkoutDay[]> {
  let query = supabase
    .from("workouts")
    .select("week_of, day, season, group_letter, intervals, note")
    .ilike("athlete_name", athleteName)
    .order("season", { ascending: false })
    .order("week_of", { ascending: false });

  if (!preview) {
    query = query.eq("is_draft", false);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const weeksOf = [...new Set(rows.map((r) => r.week_of))];
  const letters = [...new Set(rows.map((r) => r.group_letter).filter(Boolean))];

  let groupLookup = new Map<string, string>();
  if (letters.length > 0) {
    let groupQuery = supabase
      .from("workout_groups")
      .select("week_of, day, group_letter, description")
      .eq("team", team)
      .in("week_of", weeksOf);

    if (!preview) {
      groupQuery = groupQuery.eq("is_draft", false);
    }

    const { data: groups, error: groupError } = await groupQuery;
    if (groupError) throw new Error(groupError.message);

    groupLookup = new Map(
      (groups ?? []).map((g: WorkoutGroupRow) => [
        `${g.week_of}|${g.day}|${g.group_letter}`,
        g.description,
      ]),
    );
  }

  return rows.map((r) => ({
    weekOf: r.week_of,
    day: r.day,
    season: r.season,
    groupLetter: r.group_letter,
    description: r.group_letter
      ? (groupLookup.get(`${r.week_of}|${r.day}|${r.group_letter}`) ?? null)
      : null,
    intervals: r.intervals,
    note: r.note,
  }));
}

export async function fetchWorkoutPeers(
  weekOf: string,
  season: number,
  day: string,
  team: string,
  preview = false,
): Promise<WorkoutPeer[]> {
  let query = supabase
    .from("workouts")
    .select("athlete_id, athlete_name, group_letter, intervals")
    .eq("week_of", weekOf)
    .eq("season", season)
    .eq("day", day);

  if (!preview) {
    query = query.eq("is_draft", false);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const athleteIds = [
    ...new Set(
      rows
        .map((row) => row.athlete_id)
        .filter((athleteId): athleteId is string => Boolean(athleteId)),
    ),
  ];

  if (athleteIds.length === 0) return [];

  const { data: athletes, error: athleteError } = await supabase
    .from("athletes")
    .select("id, team")
    .eq("season", season)
    .eq("team", team)
    .in("id", athleteIds);

  if (athleteError) throw new Error(athleteError.message);

  const teamAthleteIds = new Set((athletes ?? []).map((athlete) => athlete.id));

  return rows
    .filter((row) => teamAthleteIds.has(row.athlete_id))
    .map((row) => ({
      athleteId: row.athlete_id,
      name: row.athlete_name,
      groupLetter: row.group_letter,
      intervals: row.intervals,
    }));
}
