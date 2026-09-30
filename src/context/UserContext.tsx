import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import {
  findTopAchievements,
  type AthleteAchievement,
  type AthleteRaceRecord,
} from "../lib/athleteAchievements";
import type { BestWorldAthleticsPerformance } from "../lib/athlete_attributes";
import {
  calculateBestWorldAthleticsPerformance,
  calculateCrossCountryRecordRating,
  calculateIndoorRecordRating,
  calculateOutdoorRecordRating,
  type AthleteRosterInfo,
} from "../lib/athlete_attributes";

export interface Athlete {
  id: string;
  season: number;
  name: string;
  team: string;
  hometown: string | null;
  highSchool: string | null;
  photoUrl: string | null;
  tfrrsId: string | null;
  graduationYear: number | null;
  crossCountryRating: number | null;
  indoorRating: number | null;
  outdoorRating: number | null;
  indoorConsistencyRating: number | null;
  outdoorConsistencyRating: number | null;
  speedRating: number | null;
  enduranceRating: number | null;
  winFactorRating: number | null;
  runnerType: string | null;
  overallRating: number | null;
  overallRank: number | null;
  allAmericanCount: number;
  secondTeamAllAmericanCount: number;
  raceHistory: AthleteRaceRecord[];
  topAchievements: AthleteAchievement[];
  schoolRecords: {
    crossCountry: string[];
    indoor: string[];
    outdoor: string[];
  };
  bestWorldAthleticsPerformance: BestWorldAthleticsPerformance | null;
}

interface UserContextValue {
  athleteId: string | null;
  season: number | null;
  athlete: Athlete | null;
  athleteLoading: boolean;
  availableSeasons: number[];
  selectAthlete: (id: string, season: number) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const ID_KEY = "wxc_selected_athlete_id";
const SEASON_KEY = "wxc_selected_season";

function normalizeAthleteName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(ID_KEY),
  );
  const [season, setSeasonState] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(SEASON_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("athletes")
      .select("season")
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const uniqueSeasons = [...new Set(data.map((row) => row.season))].sort(
          (a, b) => b - a,
        );
        setAvailableSeasons(uniqueSeasons);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!athleteId || !season) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAthlete(null);
      return;
    }

    let cancelled = false;
    setAthleteLoading(true);

    supabase
      .from("athletes")
      .select(
        "id, season, name, team, hometown, high_school, photo_url, tfrrs_id, graduation_year",
      )
      .eq("id", athleteId)
      .eq("season", season)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setAthlete(null);
          setAthleteLoading(false);
          return;
        }

        let ratings = null;
        let consistencyRatings = null;
        if (data.tfrrs_id) {
          const [ratingsResult, consistencyResult] = await Promise.all([
            supabase
              .from("tfrrs_athlete_performance")
              .select(
                "race_history, cross_country_rating, indoor_rating, outdoor_rating, speed_rating, endurance_rating, win_factor_rating, runner_type, overall_rating, overall_rank, all_american_count, second_team_all_american_count",
              )
              .eq("tfrrs_id", data.tfrrs_id)
              .maybeSingle(),
            supabase
              .from("tfrrs_athlete_performance")
              .select("indoor_consistency_rating, outdoor_consistency_rating")
              .eq("tfrrs_id", data.tfrrs_id)
              .maybeSingle(),
          ]);

          if (ratingsResult.error) {
            console.error("Failed to load athlete ratings:", ratingsResult.error);
          } else {
            ratings = ratingsResult.data;
          }
          if (consistencyResult.error) {
            console.error(
              "Failed to load track consistency ratings. Apply supabase/athlete_consistency_scores.sql:",
              consistencyResult.error,
            );
          } else {
            consistencyRatings = consistencyResult.data;
          }
        }

        let photoUrl = data.photo_url;
        if (!photoUrl) {
          const { data: historicalRows, error: historicalPhotoError } =
            await supabase
              .from("athletes")
              .select("name, team, season, tfrrs_id, photo_url")
              .eq("team", data.team)
              .lt("season", data.season)
              .not("photo_url", "is", null)
              .order("season", { ascending: false });

          if (historicalPhotoError) {
            console.error(
              "Failed to load historical roster photo fallback:",
              historicalPhotoError,
            );
          } else {
            const normalizedName = normalizeAthleteName(data.name);
            const historicalPhoto = (historicalRows ?? []).find(
              (row) =>
                (data.tfrrs_id &&
                  row.tfrrs_id &&
                  row.tfrrs_id === data.tfrrs_id) ||
                normalizeAthleteName(row.name) === normalizedName,
            );
            photoUrl = historicalPhoto?.photo_url ?? null;
          }
        }

        let schoolRecords = { crossCountry: [], indoor: [], outdoor: [] } as {
          crossCountry: string[];
          indoor: string[];
          outdoor: string[];
        };
        let bestWorldAthleticsPerformance: BestWorldAthleticsPerformance | null =
          null;
        if (data.tfrrs_id && ratings?.race_history) {
          const { data: teamRows, error: teamRowsError } = await supabase
            .from("athletes")
            .select("tfrrs_id, team, season")
            .eq("team", data.team)
            .not("tfrrs_id", "is", null)
            .order("season", { ascending: false });
          if (teamRowsError) {
            console.error("Failed to load team roster for record analysis:", teamRowsError);
          } else {
            const teamIds = [...new Set((teamRows ?? []).map((row) => row.tfrrs_id))];
            const { data: teamPerformances, error: teamPerformanceError } =
              await supabase
                .from("tfrrs_athlete_performance")
                .select("tfrrs_id, race_history")
                .in("tfrrs_id", teamIds);
            if (teamPerformanceError) {
              console.error(
                "Failed to load team performance history for record analysis:",
                teamPerformanceError,
              );
            } else {
              const performanceById = new Map(
                (teamPerformances ?? []).map((row) => [row.tfrrs_id, row]),
              );
              const teamRunners: AthleteRosterInfo[] = teamIds.flatMap((tfrrsId) => {
                const teamRow = teamRows?.find((row) => row.tfrrs_id === tfrrsId);
                const performance = performanceById.get(tfrrsId);
                return teamRow && performance
                  ? [
                      {
                        tfrrsId,
                        team: teamRow.team,
                        raceHistory: performance.race_history ?? [],
                      },
                    ]
                  : [];
              });
              const currentRunner = teamRunners.find(
                (runner) => runner.tfrrsId === data.tfrrs_id,
              );
              if (currentRunner) {
                const crossCountryRecords = calculateCrossCountryRecordRating(
                  currentRunner,
                  teamRunners,
                );
                const indoorRecords = calculateIndoorRecordRating(
                  currentRunner,
                  teamRunners,
                );
                const outdoorRecords = calculateOutdoorRecordRating(
                  currentRunner,
                  teamRunners,
                );
                schoolRecords = {
                  crossCountry: crossCountryRecords.distances
                    .filter((record) => record.recordHolderTfrrsId === data.tfrrs_id)
                    .map((record) => `${record.distance} XC`),
                  indoor: indoorRecords.events
                    .filter((event) => event.recordHolderTfrrsId === data.tfrrs_id)
                    .map((event) => event.event),
                  outdoor: outdoorRecords.events
                    .filter((event) => event.recordHolderTfrrsId === data.tfrrs_id)
                    .map((event) => event.event),
                };
                bestWorldAthleticsPerformance =
                  calculateBestWorldAthleticsPerformance(currentRunner);
              }
            }
          }
        }

        if (cancelled) return;
        setAthlete({
          id: data.id,
          season: data.season,
          name: data.name,
          team: data.team,
          hometown: data.hometown,
          highSchool: data.high_school,
          photoUrl,
          tfrrsId: data.tfrrs_id,
          graduationYear: data.graduation_year,
          crossCountryRating: ratings?.cross_country_rating ?? null,
          indoorRating: ratings?.indoor_rating ?? null,
          outdoorRating: ratings?.outdoor_rating ?? null,
          indoorConsistencyRating:
            consistencyRatings?.indoor_consistency_rating ?? null,
          outdoorConsistencyRating:
            consistencyRatings?.outdoor_consistency_rating ?? null,
          speedRating: ratings?.speed_rating ?? null,
          enduranceRating: ratings?.endurance_rating ?? null,
          winFactorRating: ratings?.win_factor_rating ?? null,
          runnerType: ratings?.runner_type ?? null,
          overallRating: ratings?.overall_rating ?? null,
          overallRank: ratings?.overall_rank ?? null,
          allAmericanCount: ratings?.all_american_count ?? 0,
          secondTeamAllAmericanCount:
            ratings?.second_team_all_american_count ?? 0,
          raceHistory: ratings?.race_history ?? [],
          topAchievements: findTopAchievements(ratings?.race_history ?? []),
          schoolRecords,
          bestWorldAthleticsPerformance,
        });
        setAthleteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [athleteId, season]);

  function selectAthlete(id: string, selectedSeason: number) {
    sessionStorage.setItem(ID_KEY, id);
    sessionStorage.setItem(SEASON_KEY, String(selectedSeason));
    setAthleteIdState(id);
    setSeasonState(selectedSeason);
  }

  function clearAthlete() {
    sessionStorage.removeItem(ID_KEY);
    sessionStorage.removeItem(SEASON_KEY);
    setAthleteIdState(null);
    setSeasonState(null);
    setAthlete(null);
  }

  return (
    <UserContext.Provider
      value={{
        athleteId,
        season,
        athlete,
        athleteLoading,
        availableSeasons,
        selectAthlete,
        clearAthlete,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
