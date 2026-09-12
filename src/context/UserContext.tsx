import { createContext, useContext, useState, type ReactNode } from "react";
import rosterData from "../data/distance_roster.json";

interface Athlete {
  id: string;
  name: string;
  team: string;
  year: string;
  hometown: string;
  highSchool: string;
  profileUrl: string;
}

interface UserContextValue {
  athleteId: string | null;
  athlete: Athlete | null;
  selectAthlete: (id: string) => void;
  clearAthlete: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const STORAGE_KEY = "wxc_selected_athlete_id";

function findAthlete(id: string | null): Athlete | null {
  if (!id) return null;
  return rosterData.athletes.find((a) => a.id === id) ?? null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [athleteId, setAthleteIdState] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  function selectAthlete(id: string) {
    sessionStorage.setItem(STORAGE_KEY, id);
    setAthleteIdState(id);
  }

  function clearAthlete() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAthleteIdState(null);
  }

  const athlete = findAthlete(athleteId);

  return (
    <UserContext.Provider
      value={{ athleteId, athlete, selectAthlete, clearAthlete }}
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
