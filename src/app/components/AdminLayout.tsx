import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  ClipboardCheck,
  BarChart3,
  BarChart2,
  Target,
  Settings,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCurrentSemester, useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { NotificationPanel } from "./NotificationPanel";
import { clearSession } from "../config/auth";
import { notify } from "../lib/notify";
import { UserAvatar } from "./UserAvatar";

const API_BASE_URL = API_BASE;

function getSemanaActual(fechaInicio: string, numeroSemanas: number): number {
  const inicioSemestre = new Date(`${fechaInicio}T00:00:00`);
  const hoy = new Date();
  const diffMs = hoy.getTime() - inicioSemestre.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(numeroSemanas, Math.floor(diffDias / 7) + 1));
}

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/revision", label: "Revisión de Reportes", icon: ClipboardCheck },
  { to: "/admin/reportes", label: "Reportes y Métricas", icon: BarChart3 },
  { to: "/admin/avance", label: "Avance Consolidado", icon: BarChart2 },
  { to: "/admin/indicadores", label: "Indicadores", icon: Target },
  { to: "/admin/sistema", label: "Administración", icon: Settings },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const currentSemester = useCurrentSemester();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const semanaActual = currentSemester
    ? getSemanaActual(currentSemester.fecha_inicio, currentSemester.numero_semanas)
    : null;
  const displayName = [currentUser?.nombre, currentUser?.apellido].filter(Boolean).join(" ");
  const initials = [currentUser?.nombre, currentUser?.apellido]
    .filter(Boolean)
    .map((part) => part?.[0]?.toUpperCase())
    .join("") || "--";

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    } finally {
      clearSession();
      notify.info("Sesión cerrada");
      navigate("/", { replace: true });
    }
  };

  useEffect(() => {
    if (!currentUser?.id || currentUser.rol !== "admin") {
      setNotifCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/notificaciones`);
        const data = await res.json().catch(() => ({}));
        const n = Number(
          data.total_no_leidas ??
            (Array.isArray(data.notificaciones) ? data.notificaciones.length : 0)
        );
        if (!cancelled) setNotifCount(n);
      } catch {
        if (!cancelled) setNotifCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!showNotifs) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showNotifs]);

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#0f172a] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
          <div className="w-9 h-9 bg-[#1d4ed8] rounded-lg flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white text-sm" style={{ fontWeight: 700 }}>
              ProySocial
            </p>
            <p className="text-slate-400 text-xs">Panel Administrativo</p>
          </div>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <p className="text-slate-500 text-xs uppercase tracking-wider px-3 mb-3">
            Administrador
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-[#1d4ed8] text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`
              }
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-[#1d4ed8] rounded-full flex items-center justify-center text-white text-xs">
              {initials}
            </div>
            <div>
              <p className="text-white text-xs" style={{ fontWeight: 600 }}>
                {displayName || "Administrador"}
              </p>
              <p className="text-slate-400 text-xs truncate max-w-[160px]">{currentUser?.correo || "—"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-4 shrink-0">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
              Panel de Administración
            </p>
            <p className="text-gray-500 text-xs">
              {currentSemester && semanaActual
                ? `Semana ${semanaActual} — Ciclo ${currentSemester.codigo}`
                : "Sin semestre activo configurado"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setShowNotifs((v) => !v)}
                className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-expanded={showNotifs}
                aria-label="Notificaciones"
              >
                <Bell className="w-5 h-5" />
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-0.5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
                    {notifCount}
                  </span>
                )}
              </button>
              {showNotifs && currentUser?.id != null && currentUser.rol === "admin" && (
                <NotificationPanel
                  rol="admin"
                  userId={currentUser.id}
                  onClose={() => setShowNotifs(false)}
                  onUnreadCountChange={setNotifCount}
                />
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <UserAvatar user={currentUser} className="w-8 h-8 shrink-0 bg-[#0f172a] text-sm" />
                <span className="hidden sm:block text-sm text-gray-700">
                  {currentUser?.nombre || "Admin"}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/admin/sistema");
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                  >
                    <User className="w-4 h-4" /> Administrar usuarios
                  </button>
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={() => void logout()}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
