import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FolderKanban,
  FileEdit,
  Paperclip,
  History,
  User,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  X,
  GraduationCap,
  TableProperties,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { NotificationPanel } from "./NotificationPanel";
import { clearSession } from "../config/auth";
import { notify } from "../lib/notify";
import { UserAvatar } from "./UserAvatar";

const API_BASE_URL = API_BASE;

const navItems = [
  { to: "/docente", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/docente/matriz", label: "Matriz de Seguimiento", icon: TableProperties },
  { to: "/docente/proyectos", label: "Mis Iniciativas", icon: FolderKanban },
  { to: "/docente/reportar", label: "Reportar entregable", icon: FileEdit },
  { to: "/docente/evidencias", label: "Evidencias", icon: Paperclip },
  { to: "/docente/historial", label: "Historial", icon: History },
];

export function TeacherLayout() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

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
    if (!currentUser?.id || currentUser.rol !== "docente") {
      setNotifCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/docente/${currentUser.id}/notificaciones`);
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

  useEffect(() => {
    if (!currentUser) return;
    try {
      const nombre: string | undefined = currentUser.nombre;
      const apellido: string | undefined = currentUser.apellido;
      const correo: string | undefined = currentUser.correo;

      let fullName = "";
      if (nombre || apellido) {
        fullName = [nombre, apellido].filter(Boolean).join(" ");
      } else if (correo) {
        fullName = correo;
      }
      if (fullName) {
        setDisplayName(fullName);
      }
    } catch {
      // ignore parse errors
    }
  }, [currentUser?.id]);

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#1e3a8a] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-700">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-[#1e3a8a]" />
          </div>
          <div>
            <p className="text-white text-sm" style={{ fontWeight: 700 }}>
              ProySocial
            </p>
            <p className="text-blue-300 text-xs">Sistema de Seguimiento</p>
          </div>
          <button
            className="ml-auto lg:hidden text-blue-300 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <p className="text-blue-400 text-xs uppercase tracking-wider px-3 mb-3">
            Docente
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
                    ? "bg-white/15 text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Profile bottom */}
        <div className="px-4 py-4 border-t border-blue-700">
          <NavLink
            to="/docente/perfil"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-200 hover:bg-white/10 hover:text-white transition-all"
          >
            <User className="w-4.5 h-4.5" />
            Perfil
          </NavLink>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-4 shrink-0">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:block">
            <p className="text-gray-500 text-sm">Bienvenido de vuelta,</p>
            <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
              {displayName ?? "Docente"}
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
              {showNotifs && currentUser?.id != null && currentUser.rol === "docente" && (
                <NotificationPanel
                  rol="docente"
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
                <UserAvatar user={currentUser} className="w-8 h-8 shrink-0 text-sm" />
                <span className="hidden sm:block text-sm text-gray-700">
                  {currentUser?.nombre || "Docente"}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/docente/perfil");
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                  >
                    <User className="w-4 h-4" /> Mi perfil
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

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
