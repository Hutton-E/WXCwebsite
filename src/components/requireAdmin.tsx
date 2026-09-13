import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "../context/AdminAuthContext";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return null; // avoid flashing a redirect while session is still loading

  if (!session) {
    return <Navigate to="/admin" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireAdmin;
