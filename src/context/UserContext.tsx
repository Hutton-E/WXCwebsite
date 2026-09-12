import { createContext, useContext, useState, type ReactNode } from "react";

interface UserContextValue {
  name: string | null;
  setName: (name: string) => void;
  clearName: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);
const STORAGE_KEY = "wxc_selected_name";

export function UserProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  function setName(newName: string) {
    sessionStorage.setItem(STORAGE_KEY, newName);
    setNameState(newName);
  }

  function clearName() {
    sessionStorage.removeItem(STORAGE_KEY);
    setNameState(null);
  }

  return (
    <UserContext.Provider value={{ name, setName, clearName }}>
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
