import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import {
  calculateOverallRanks,
  type OverallRankingAthlete,
} from "../lib/overallRanking";

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
  overallRank: number | null;
  runnerType: string | null;
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
        let overallRank: number | null = null;
        if (data.tfrrs_id) {
          const [ratingsResult, rosterResult, consistencyResult] =
            await Promise.all([
              supabase
                .from("tfrrs_athlete_performance")
                .select(
                  "cross_country_rating, indoor_rating, outdoor_rating, speed_rating, endurance_rating, win_factor_rating, runner_type",
                )
                .eq("tfrrs_id", data.tfrrs_id)
                .maybeSingle(),
              supabase
                .from("athletes")
                .select("tfrrs_id")
                .eq("season", season)
                .not("tfrrs_id", "is", null),
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

          if (rosterResult.error) {
            console.error(
              "Failed to load athlete roster for overall rankings:",
              rosterResult.error,
            );
          } else {
            const tfrrsIds = [
              ...new Set(
                (rosterResult.data ?? [])
                  .map((row) => row.tfrrs_id)
                  .filter((tfrrsId): tfrrsId is string => Boolean(tfrrsId)),
              ),
            ];
            if (tfrrsIds.length > 0) {
              const { data: rankingRows, error: rankingError } = await supabase
                .from("tfrrs_athlete_performance")
                .select(
                  "tfrrs_id, cross_country_rating, indoor_rating, outdoor_rating, speed_rating, endurance_rating, win_factor_rating",
                )
                .in("tfrrs_id", tfrrsIds);

              if (rankingError) {
                console.error(
                  "Failed to load athlete ratings for overall rankings:",
                  rankingError,
                );
              } else {
                const rankingAthletes: OverallRankingAthlete[] = (
                  rankingRows ?? []
                ).map((row) => ({
                  id: row.tfrrs_id,
                  ratings: {
                    crossCountryRating: row.cross_country_rating,
                    indoorRating: row.indoor_rating,
                    outdoorRating: row.outdoor_rating,
                    speedRating: row.speed_rating,
                    enduranceRating: row.endurance_rating,
                    winFactorRating: row.win_factor_rating,
                  },
                }));
                overallRank =
                  calculateOverallRanks(rankingAthletes).get(data.tfrrs_id) ??
                  null;
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
          photoUrl: data.photo_url,
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
          overallRank,
          runnerType: ratings?.runner_type ?? null,
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
