import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useUser } from "../context/UserContext";

function RequireIdentity({ children }: { children: ReactNode }) {
  const { athlete } = useUser();
  const location = useLocation();

  if (!athlete) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireIdentity;
