import { createContext, useContext, useState, type ReactNode } from "react";

interface Athlete {
  id: string;
  name: string;
  team: string;
  year: string;
  hometown: string;
  highSchool: string;
  profileUrl: string;
}

interface RosterFile {
  season: number;
  athletes: Athlete[];
}

interface UserContextValue {
  athleteId: string | null;
  season: number | null;
  athlete: Athlete | null;
  availableSeasons: number[];
  selectAthlete: (id: string, season: number) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const ID_KEY = "wxc_selected_athlete_id";
const SEASON_KEY = "wxc_selected_season";

// Eagerly loads every distance_roster_*.json file in src/data at build time.
const rosterModules = import.meta.glob("../data/distance_roster_*.json", {
  eager: true,
}) as Record<string, RosterFile>;

function parseSeasonFromPath(filePath: string): number | null {
  const match = filePath.match(/distance_roster_(\d{2})\.json$/);
  if (!match) return null;
  return 2000 + parseInt(match[1], 10);
}

const rostersBySeason: Record<number, Athlete[]> = {};
for (const [filePath, mod] of Object.entries(rosterModules)) {
  const season = mod.season ?? parseSeasonFromPath(filePath);
  if (season && mod.athletes) {
    rostersBySeason[season] = mod.athletes;
  }
}

const availableSeasons = Object.keys(rostersBySeason)
  .map(Number)
  .sort((a, b) => b - a); // newest first

function findAthlete(id: string | null, season: number | null): Athlete | null {
  if (!id || !season) return null;
  const roster = rostersBySeason[season];
  if (!roster) return null;
  return roster.find((a) => a.id === id) ?? null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(ID_KEY),
  );
  const [season, setSeasonState] = useState<number | null>(() => {
    const stored = sessionStorage.getItem(SEASON_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

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
  }

  const athlete = findAthlete(athleteId, season);

  return (
    <UserContext.Provider
      value={{
        athleteId,
        season,
        athlete,
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
