import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, UserRound, X } from "lucide-react";
import { useCurrentSemester, useCurrentUser } from "../../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { clearSession } from "../../config/auth";
import { notify } from "../../lib/notify";
import { Marca } from "../ds/Marca";
import { NotificationPanel } from "../NotificationPanel";
import { UserAvatar } from "../UserAvatar";
import { migasDe, type ShellConfig } from "./navigation";

const COLAPSADO_KEY = "proysocial:sidebar-collapsed";

function semanaActual(fechaInicio: string, numeroSemanas: number): number {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const dias = Math.floor((Date.now() - inicio.getTime()) / 86_400_000);
  return Math.max(1, Math.min(numeroSemanas, Math.floor(dias / 7) + 1));
}

export function AppShell({ config }: { config: ShellConfig }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const user = useCurrentUser();
  const semestre = useCurrentSemester();
  const [colapsado, setColapsado] = useState(() => {
    try {
      return window.localStorage.getItem(COLAPSADO_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [notifsAbiertas, setNotifsAbiertas] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const perfilRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(" ") || user?.correo || config.roleLabel;
  const semana = semestre ? semanaActual(semestre.fecha_inicio, semestre.numero_semanas) : null;
  const migas = migasDe(pathname, search, config);

  const alternarColapso = () =>
    setColapsado((c) => {
      const n = !c;
      try {
        window.localStorage.setItem(COLAPSADO_KEY, n ? "1" : "0");
      } catch {
        /* preferencia no persistida */
      }
      return n;
    });

  const cerrarSesion = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } finally {
      clearSession();
      notify.info("Sesión cerrada");
      navigate("/", { replace: true });
    }
  }, [navigate]);

  // Contador de notificaciones (misma lógica que antes, por rol)
  useEffect(() => {
    if (!user?.id || user.rol !== config.rol) {
      setNotifCount(0);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}${config.notificationsUrl(user.id)}`);
        const data = await res.json().catch(() => ({}));
        const n = Number(data.total_no_leidas ?? (Array.isArray(data.notificaciones) ? data.notificaciones.length : 0));
        if (!cancelado) setNotifCount(Number.isFinite(n) ? n : 0);
      } catch {
        if (!cancelado) setNotifCount(0);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.id, user?.rol, config]);

  // Cierre de menús: clic fuera y Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (notifsAbiertas && notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifsAbiertas(false);
      if (perfilAbierto && perfilRef.current && !perfilRef.current.contains(e.target as Node)) setPerfilAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setNotifsAbiertas(false);
      setPerfilAbierto(false);
      setDrawer(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifsAbiertas, perfilAbierto]);

  // Al navegar: se cierra el cajón móvil y el contenido vuelve arriba
  useEffect(() => {
    setDrawer(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const compacto = colapsado && !drawer;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white">
        Saltar al contenido
      </a>

      {drawer && <div className="fixed inset-0 z-30 bg-ink/60 backdrop-blur-[1px] lg:hidden" onClick={() => setDrawer(false)} aria-hidden />}

      {/* ───────── Navegación ───────── */}
      <aside
        aria-label="Navegación principal"
        className={`on-ink fixed inset-y-0 left-0 z-40 flex flex-col bg-ink text-ink-text transition-[width,transform] duration-200 ease-out lg:static ${
          drawer ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${compacto ? "w-[72px]" : "w-[264px] lg:w-[248px]"}`}
      >
        <div className={`flex h-14 shrink-0 items-center gap-3 border-b border-ink-line ${compacto ? "justify-center px-0" : "px-4"}`}>
          <Link to={config.home} className="flex items-center gap-3 rounded-md" aria-label="ProySocial, ir al inicio">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
              <Marca />
            </span>
            {!compacto && (
              <span className="leading-tight">
                <span className="block text-[0.9375rem] text-white" style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>ProySocial</span>
                <span className="block text-[0.6875rem] text-ink-muted">CUN · {config.tagline}</span>
              </span>
            )}
          </Link>
          <button type="button" className="ml-auto rounded-md p-1.5 text-ink-muted hover:bg-ink-2 hover:text-white lg:hidden" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {config.groups.map((g) => (
            <div key={g.label}>
              {!compacto ? (
                <p className="mb-1.5 px-2.5 text-[0.6875rem] font-medium text-ink-muted">{g.label}</p>
              ) : (
                <div className="mx-3 mb-2 border-t border-ink-line" aria-hidden />
              )}
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      title={compacto ? item.label : undefined}
                      aria-label={compacto ? item.label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-lg py-2 text-[0.8125rem] transition-colors ${compacto ? "justify-center px-0" : "px-2.5"} ${
                          isActive ? "bg-ink-3 text-white" : "text-ink-text hover:bg-ink-2 hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute -left-3 top-1.5 h-[calc(100%-0.75rem)] w-[3px] rounded-r-full bg-signal-bright" aria-hidden />}
                          <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-signal-bright" : "text-ink-muted group-hover:text-ink-text"}`} />
                          {!compacto && <span className="truncate" style={{ fontWeight: isActive ? 600 : 500 }}>{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-line p-3">
          {config.footer.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={compacto ? item.label : undefined}
              aria-label={compacto ? item.label : undefined}
              className={({ isActive }) =>
                `mb-2 flex items-center gap-3 rounded-lg py-2 text-[0.8125rem] transition-colors ${compacto ? "justify-center px-0" : "px-2.5"} ${isActive ? "bg-ink-3 text-white" : "text-ink-text hover:bg-ink-2 hover:text-white"}`
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
              {!compacto && item.label}
            </NavLink>
          ))}
          <div className={`flex items-center gap-2.5 rounded-lg bg-ink-2 p-2 ${compacto ? "justify-center" : ""}`}>
            <UserAvatar user={user} className="h-8 w-8 shrink-0 bg-brand text-xs text-white" />
            {!compacto && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs text-white" style={{ fontWeight: 600 }}>{nombre}</p>
                <p className="truncate text-[0.6875rem] text-ink-muted">{config.roleLabel}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={alternarColapso}
            className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-ink-muted transition-colors hover:bg-ink-2 hover:text-white lg:flex"
            aria-label={colapsado ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-pressed={colapsado}
          >
            {colapsado ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Contraer</>}
          </button>
        </div>
      </aside>

      {/* ───────── Contenido ───────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-5">
          <button type="button" className="rounded-md p-2 text-text-muted hover:bg-gray-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú" aria-expanded={drawer}>
            <Menu className="h-5 w-5" />
          </button>

          <nav aria-label="Ruta de navegación" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-[0.8125rem] text-text-subtle">
              {migas.map((m, i) => {
                const ultima = i === migas.length - 1;
                return (
                  <li key={`${m.label}-${i}`} className={`flex items-center gap-1.5 ${ultima ? "min-w-0" : "hidden sm:flex"}`}>
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />}
                    {m.to && !ultima ? (
                      <Link to={m.to} className="rounded px-0.5 hover:text-text">{m.label}</Link>
                    ) : (
                      <span className={ultima ? "truncate text-text" : ""} style={ultima ? { fontWeight: 600 } : undefined} aria-current={ultima ? "page" : undefined}>{m.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <span
              className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-text-muted md:inline-flex"
              title={semestre ? `Semestre activo ${semestre.codigo}` : "No hay un semestre activo configurado"}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${semestre ? "bg-signal" : "bg-gray-300"}`} aria-hidden />
              {semestre && semana ? (
                <>
                  <span className="text-text" style={{ fontWeight: 600 }}>{semestre.codigo}</span>
                  <span className="tabular-nums">Semana {semana} de {semestre.numero_semanas}</span>
                </>
              ) : (
                "Sin semestre activo"
              )}
            </span>

            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifsAbiertas((v) => !v)}
                className="relative rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-text"
                aria-expanded={notifsAbiertas}
                aria-label={notifCount > 0 ? `Notificaciones: ${notifCount} sin leer` : "Notificaciones"}
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.625rem] leading-none text-white tabular-nums" style={{ fontWeight: 650 }}>
                    {notifCount > 99 ? "99+" : notifCount}
                  </span>
                )}
              </button>
              {notifsAbiertas && user?.id != null && user.rol === config.rol && (
                <NotificationPanel rol={config.rol} userId={user.id} onClose={() => setNotifsAbiertas(false)} onUnreadCountChange={setNotifCount} />
              )}
            </div>

            <div className="relative" ref={perfilRef}>
              <button
                type="button"
                onClick={() => setPerfilAbierto((v) => !v)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-gray-100"
                aria-expanded={perfilAbierto}
                aria-haspopup="menu"
              >
                <UserAvatar user={user} className="h-8 w-8 shrink-0 bg-ink text-xs text-white" />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block max-w-[10rem] truncate text-[0.8125rem] text-text" style={{ fontWeight: 600 }}>{user?.nombre || config.roleLabel}</span>
                  <span className="block text-[0.6875rem] text-text-subtle">{config.roleLabel}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-text-subtle" />
              </button>
              {perfilAbierto && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  <div className="border-b border-line px-3.5 py-3">
                    <p className="truncate text-sm text-text" style={{ fontWeight: 600 }}>{nombre}</p>
                    <p className="truncate text-xs text-text-subtle">{user?.correo}</p>
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setPerfilAbierto(false);
                        navigate(config.profileTo);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text-muted hover:bg-gray-100 hover:text-text"
                    >
                      <UserRound className="h-4 w-4" /> {config.profileLabel}
                    </button>
                    <button type="button" role="menuitem" onClick={() => void cerrarSesion()} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-700 hover:bg-red-50">
                      <LogOut className="h-4 w-4" /> Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="contenido" ref={mainRef} className="flex-1 overflow-y-auto" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
