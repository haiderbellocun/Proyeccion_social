import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router";
import { API_BASE, apiFetch } from "../config/api";
import {
  clearSession,
  getSessionToken,
  saveSessionContext,
  type CurrentSemester,
  type CurrentUser,
  type UserRole,
} from "../config/auth";

export function ProtectedRoute({ role, children }: { role: UserRole; children: ReactNode }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "guest" }
    | { status: "ready"; user: CurrentUser }
  >(() => (getSessionToken() ? { status: "loading" } : { status: "guest" }));

  useEffect(() => {
    if (!getSessionToken()) {
      setState({ status: "guest" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiFetch(`${API_BASE}/auth/me`);
        if (!response.ok) throw new Error("Sesión no autorizada");
        const data = await response.json();
        const user = data.user as CurrentUser;
        const semester = (data.semestre || null) as CurrentSemester | null;
        if (!user?.id || !user?.rol) throw new Error("Sesión incompleta");
        saveSessionContext(user, semester);
        if (!cancelled) setState({ status: "ready", user });
      } catch {
        clearSession();
        if (!cancelled) setState({ status: "guest" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (state.status === "guest") return <Navigate to="/" replace />;
  if (state.user.rol !== role) {
    return <Navigate to={state.user.rol === "admin" ? "/admin" : "/docente"} replace />;
  }
  return children;
}
