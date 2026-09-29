import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";

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
  overallRating: number | null;
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
        if (data.tfrrs_id) {
          const [ratingsResult, consistencyResult] = await Promise.all([
            supabase
              .from("tfrrs_athlete_performance")
              .select(
                "cross_country_rating, indoor_rating, outdoor_rating, speed_rating, endurance_rating, win_factor_rating, overall_rating, runner_type",
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
          overallRating: ratings?.overall_rating ?? null,
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
