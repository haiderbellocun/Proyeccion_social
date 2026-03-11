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
import { useState } from "react";

const navItems = [
  { to: "/docente", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/docente/matriz", label: "Matriz de Seguimiento", icon: TableProperties },
  { to: "/docente/proyectos", label: "Mis Proyectos", icon: FolderKanban },
  { to: "/docente/reportar", label: "Reportar Avance", icon: FileEdit },
  { to: "/docente/evidencias", label: "Evidencias", icon: Paperclip },
  { to: "/docente/historial", label: "Historial", icon: History },
];

export function TeacherLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
              Mg. María Rodríguez
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white text-sm">
                  MR
                </div>
                <span className="hidden sm:block text-sm text-gray-700">
                  Docente
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left">
                    <User className="w-4 h-4" /> Mi perfil
                  </button>
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={() => navigate("/")}
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