import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUser } from "../context/UserContext";

function RequireIdentity({ children }: { children: ReactNode }) {
  const { athlete, athleteId, athleteLoading } = useUser();
  const location = useLocation();

  // A session is stored but the athlete record hasn't finished loading from
  // Supabase yet — wait rather than redirecting prematurely on every refresh.
  if (athleteId && athleteLoading) return null;

  if (!athlete) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireIdentity;
