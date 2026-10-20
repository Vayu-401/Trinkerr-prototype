import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { User } from "../api/types";
import { useAuth } from "./AuthContext";

export const canUseSurveys = (u: User) => u.role === "admin" || u.verification_status === "verified";

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center text-sm text-muted" role="status">
      Loading your account…
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireVerified({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!canUseSurveys(user)) return <Navigate to="/verification" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Login/register pages: send signed-in people to the right home. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to={canUseSurveys(user) ? "/" : "/verification"} replace />;
  return <>{children}</>;
}
