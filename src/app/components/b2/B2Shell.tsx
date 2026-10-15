// Shell B2 para administrador y docente: cabecera morada, riel lateral contextual, barra de contexto y navegación inferior móvil.
// Una sola arquitectura; lo que cambia por rol es la configuración (módulos, accesos, notificaciones y cuenta).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { clearSession } from "../../config/auth";
import { useCurrentSemester, useCurrentUser } from "../../hooks/useCurrentUser";
import { notify } from "../../lib/notify";
import { NotificationPanel } from "../NotificationPanel";
import { UserAvatar } from "../UserAvatar";
import { etiquetaSemana } from "../../data/matrizConstants";
import { B2Provider, useB2 } from "./B2Context";
import { lateralPara, lateralParaDocente, MODULOS_ADMIN, MODULOS_DOCENTE, type ItemLateral } from "./b2-nav";
import { IAyuda, IBell, IBuscar, ICalendario, ICerrar, IChevD, IExpandirTodo, IExterno, IRefrescar, Marca } from "./icons";
import { Kbd, Menu, Popover, Tip } from "./ui";
import "@fontsource-variable/nunito-sans";
import "./b2.css";
import "./b2-matriz.css";
import "./b2-matriz-real.css";
import "./b2-bandeja.css";
import "./b2-importar.css";
import "./b2-docente.css";

export type RolShell = "admin" | "docente";
const ABIERTO_KEY = "proysocial:b2-sidebar-open";
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

const CONFIG = {
  admin: { home: "/admin", modulos: MODULOS_ADMIN, notificaciones: "/admin/notificaciones", placeholder: "Buscar docente o entregable", ayudaBuscar: "Buscar en el panel" },
  docente: { home: "/docente", modulos: MODULOS_DOCENTE, notificaciones: "", placeholder: "Buscar entregable o iniciativa", ayudaBuscar: "Buscar en tu panel" },
} as const;

const corta = (iso: string) => {
  const m = iso.slice(0, 10).split("-").map(Number);
  return m.length === 3 && m[1] >= 1 ? `${m[2]} ${MES[m[1] - 1]}` : iso;
};

/** Semana local con la misma lógica que ya usaba el shell anterior; las pantallas publican la del backend cuando cargan. */
function semanaLocal(fechaInicio: string, numeroSemanas: number): number {
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const dias = Math.floor((Date.now() - inicio.getTime()) / 86_400_000);
  return Math.max(1, Math.min(numeroSemanas, Math.floor(dias / 7) + 1));
}

interface PerfilCtx { programa: string | null; regional: string | null; grupo: string | null; horas: number | null; tipo: string | null; drive: string | null }

/** Datos de contexto del docente (programa, grupo, Drive) con el endpoint de perfil que ya existe. */
function usePerfilDocente(userId: number | undefined, rol: RolShell) {
  const [perfil, setPerfil] = useState<PerfilCtx | null>(null);
  useEffect(() => {
    if (rol !== "docente" || !userId) { setPerfil(null); return; }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/docente/${userId}/perfil`);
        if (!res.ok) return;
        const p = await res.json();
        if (!cancelado) setPerfil({
          programa: p.programa?.nombre ?? null, regional: p.regional ?? null, grupo: p.grupo_matriz?.nombre ?? null,
          horas: p.grupo_matriz?.horas_totales ?? null, tipo: p.tipo_docente ?? null, drive: p.link_drive ?? null,
        });
      } catch { /* el contexto es informativo */ }
    })();
    return () => { cancelado = true; };
  }, [userId, rol]);
  return perfil;
}

function useNotificaciones(userId: number | undefined, rol: RolShell, userRol: string | undefined) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId || userRol !== rol) { setCount(0); return; }
    let cancelado = false;
    (async () => {
      try {
        const url = rol === "admin" ? `${API_BASE}/admin/notificaciones` : `${API_BASE}/docente/${userId}/notificaciones`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        const n = Number(data.total_no_leidas ?? (Array.isArray(data.notificaciones) ? data.notificaciones.length : 0));
        if (!cancelado) setCount(Number.isFinite(n) ? n : 0);
      } catch {
        if (!cancelado) setCount(0);
      }
    })();
    return () => { cancelado = true; };
  }, [userId, rol, userRol]);
  return [count, setCount] as const;
}

function Cabecera({ rol, buscar }: { rol: RolShell; buscar: React.RefObject<HTMLInputElement> }) {
  const cfg = CONFIG[rol];
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const { busqueda, setBusqueda } = useB2();
  const [notifs, setNotifs] = useNotificaciones(user?.id, rol, user?.rol);
  const [notifAbierta, setNotifAbierta] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const enPanel = pathname === cfg.home || pathname === `${cfg.home}/`;
  const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(" ") || user?.correo || (rol === "admin" ? "Administrador" : "Docente");
  const rolLabel = rol === "admin" ? "Administrador" : "Docente";

  useEffect(() => {
    if (!notifAbierta) return;
    const fuera = (e: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifAbierta(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setNotifAbierta(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [notifAbierta]);

  const cerrarSesion = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } finally {
      clearSession();
      notify.info("Sesión cerrada");
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return (
    <header className="b2-hd">
      <Link className="b2-hd-logo" to={cfg.home} aria-label="ProySocial, ir al inicio">
        <Marca size={26} />
        <span className="b2-hd-name">ProySocial</span>
      </Link>
      <nav className="b2-hd-nav" aria-label="Módulos">
        {cfg.modulos.map((m) => {
          const activo = m.activo(pathname);
          return (
            <Link key={m.id} to={m.to} className="b2-hd-mod" data-active={activo || undefined} aria-current={activo ? "page" : undefined}>{m.label}</Link>
          );
        })}
      </nav>
      <div className="b2-hd-fill" />
      {enPanel && (
        <label className="b2-hd-search">
          <IBuscar width={16} height={16} />
          <input ref={buscar} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={cfg.placeholder} aria-label={cfg.placeholder} />
          {busqueda ? (
            <button type="button" className="b2-hd-clear" aria-label="Limpiar búsqueda" onClick={() => { setBusqueda(""); buscar.current?.focus(); }}><ICerrar width={14} height={14} /></button>
          ) : <Kbd>/</Kbd>}
        </label>
      )}
      <div className="b2-pop-raiz" ref={notifRef}>
        <Tip label="Notificaciones" side="bottom">
          <button type="button" className="b2-hd-btn" onClick={() => setNotifAbierta((v) => !v)} aria-expanded={notifAbierta}
            aria-label={notifs > 0 ? `Notificaciones: ${notifs} sin leer` : "Notificaciones"}>
            <IBell width={18} height={18} />
            {notifs > 0 && <span className="b2-hd-count">{notifs > 99 ? "99+" : notifs}</span>}
          </button>
        </Tip>
        {notifAbierta && user?.id != null && user.rol === rol && (
          <NotificationPanel rol={rol} userId={user.id} onClose={() => setNotifAbierta(false)} onUnreadCountChange={setNotifs} />
        )}
      </div>
      <Popover align="right" label="Ayuda"
        trigger={({ props }) => (
          <Tip label="Ayuda" side="bottom"><button type="button" className="b2-hd-btn" aria-label="Ayuda" {...props}><IAyuda width={18} height={18} /></button></Tip>
        )}>
        {() => (
          <div className="b2-pop-body">
            <p className="b2-pop-t">Atajos de teclado</p>
            <dl className="b2-atajos">
              <div><dt><Kbd>/</Kbd></dt><dd>{cfg.ayudaBuscar}</dd></div>
              <div><dt><Kbd>↑</Kbd> <Kbd>↓</Kbd></dt><dd>Moverse por las filas</dd></div>
              <div><dt><Kbd>Enter</Kbd></dt><dd>Abrir el detalle</dd></div>
              <div><dt><Kbd>Esc</Kbd></dt><dd>Cerrar el detalle</dd></div>
            </dl>
          </div>
        )}
      </Popover>
      <Menu align="right" label="Cuenta"
        trigger={({ props }) => (
          <button type="button" className="b2-hd-user" aria-label={`Cuenta de ${nombre}`} {...props}>
            <UserAvatar user={user} className="b2-hd-av" />
            <span className="b2-hd-uname">{nombre}</span>
            <IChevD width={14} height={14} />
          </button>
        )}
        items={[
          { label: `${nombre} · ${rolLabel}`, disabled: true, onSelect: () => {} },
          { label: user?.correo || "", disabled: true, onSelect: () => {} },
          "sep",
          rol === "admin"
            ? { label: "Administrar usuarios", onSelect: () => navigate("/admin/sistema?tab=usuarios") }
            : { label: "Mi perfil", onSelect: () => navigate("/docente/perfil") },
          { label: "Cerrar sesión", danger: true, onSelect: () => void cerrarSesion() },
        ]} />
    </header>
  );
}

function Contexto({ rol, perfil }: { rol: RolShell; perfil: PerfilCtx | null }) {
  const semestre = useCurrentSemester();
  const { semana, puedeRecargar, recargar } = useB2();
  const enCurso = semana?.estado === "en_curso" && semana.numero != null;
  const numero = enCurso ? semana!.numero! : semestre ? semanaLocal(semestre.fecha_inicio, semestre.numero_semanas) : null;
  const total = enCurso ? semana!.total_semanas ?? semestre?.numero_semanas : semestre?.numero_semanas;
  const codigo = semana?.semestre ?? semestre?.codigo ?? null;
  const inicio = semana?.fecha_inicio_semestre ?? semestre?.fecha_inicio;
  const fin = semana?.fecha_fin_semestre ?? semestre?.fecha_fin;
  return (
    <div className="b2-ctx" role="group" aria-label="Semestre y semana actual">
      {codigo ? (
        <>
          <span className="b2-ctx-i"><ICalendario width={14} height={14} />{codigo}</span>
          {semana && !enCurso
            ? <span className="b2-ctx-i" title={semana.advertencia}>{etiquetaSemana(semana)}</span>
            : numero != null && total != null && <span className="b2-ctx-i">Semana {numero} de {total}</span>}
          {inicio && fin && <span className="b2-ctx-i b2-ctx-rango">{corta(inicio)} – {corta(fin)}</span>}
        </>
      ) : (
        <span className="b2-ctx-i"><ICalendario width={14} height={14} />Sin semestre activo</span>
      )}
      <span className="b2-ctx-sep" />
      {rol === "admin" ? (
        <span className="b2-ctx-i b2-ctx-prog">Coordinación</span>
      ) : (
        <>
          {perfil?.programa && <span className="b2-ctx-i b2-ctx-prog">{perfil.programa}</span>}
          {perfil?.grupo && <span className="b2-ctx-i b2-ctx-prog">Grupo {perfil.grupo}{perfil.horas != null ? ` · ${perfil.horas} h` : ""}</span>}
          {perfil && !perfil.grupo && <span className="b2-ctx-i b2-ctx-prog">Sin matriz asignada</span>}
        </>
      )}
      <div className="b2-ctx-fill" />
      {puedeRecargar && (
        <button type="button" className="b2-ctx-btn" onClick={recargar}><IRefrescar width={13} height={13} />Actualizar</button>
      )}
    </div>
  );
}

function Lateral({ rol, abierta, onToggle, drive }: { rol: RolShell; abierta: boolean; onToggle: () => void; drive: string | null }) {
  const { pathname, search } = useLocation();
  const grupos: ItemLateral[][] = rol === "admin" ? lateralPara(pathname) : lateralParaDocente(pathname, drive);
  return (
    <nav className="b2-side" data-open={abierta} aria-label="Accesos del módulo">
      {grupos.map((g, gi) => (
        <div className="b2-side-g" key={gi}>
          {g.map((it) => {
            const activo = it.activo(pathname, search);
            const contenido = (
              <>
                <span className="b2-side-ic"><it.icono width={18} height={18} /></span>
                <span className="b2-side-l">{it.label}</span>
                {it.externo && <IExterno className="b2-side-ext" width={12} height={12} />}
              </>
            );
            const enlace = it.externo ? (
              <a href={it.to} target="_blank" rel="noopener noreferrer" className="b2-side-i" aria-label={abierta ? undefined : `${it.label} (se abre en una pestaña nueva)`}>{contenido}</a>
            ) : (
              <Link to={it.to} className="b2-side-i" data-active={activo || undefined} aria-current={activo ? "page" : undefined} aria-label={abierta ? undefined : it.label}>{contenido}</Link>
            );
            return abierta ? <div key={it.to}>{enlace}</div> : <Tip key={it.to} label={it.label}>{enlace}</Tip>;
          })}
        </div>
      ))}
      <div className="b2-side-fin">
        <Tip label={abierta ? "Contraer menú" : "Expandir menú"}>
          <button type="button" className="b2-side-i" onClick={onToggle} aria-label={abierta ? "Contraer menú" : "Expandir menú"} aria-expanded={abierta}>
            <span className="b2-side-ic"><IExpandirTodo width={18} height={18} style={{ transform: abierta ? "rotate(90deg)" : "rotate(-90deg)" }} /></span>
            <span className="b2-side-l">Contraer menú</span>
          </button>
        </Tip>
      </div>
    </nav>
  );
}

function BarraInferior({ rol }: { rol: RolShell }) {
  const { pathname } = useLocation();
  return (
    <nav className="b2-bnav" aria-label="Módulos">
      {CONFIG[rol].modulos.map((m) => {
        const activo = m.activo(pathname);
        return (
          <Link key={m.id} to={m.to} data-active={activo || undefined} aria-current={activo ? "page" : undefined}>
            <m.icono width={20} height={20} />
            <span>{m.corto}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Estructura({ rol }: { rol: RolShell }) {
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const perfil = usePerfilDocente(user?.id, rol);
  const buscar = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [abierta, setAbierta] = useState(() => {
    try { return window.localStorage.getItem(ABIERTO_KEY) === "1"; } catch { return false; }
  });
  const alternar = () => setAbierta((a) => {
    const n = !a;
    try { window.localStorage.setItem(ABIERTO_KEY, n ? "1" : "0"); } catch { /* preferencia no persistida */ }
    return n;
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || !buscar.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      buscar.current.focus();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <div className="b2-root">
      <a className="b2-skip" href="#contenido">Saltar al contenido</a>
      <Cabecera rol={rol} buscar={buscar} />
      <Contexto rol={rol} perfil={perfil} />
      <div className="b2-cuerpo">
        <Lateral rol={rol} abierta={abierta} onToggle={alternar} drive={perfil?.drive ?? null} />
        <main id="contenido" ref={mainRef} className="b2-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <BarraInferior rol={rol} />
    </div>
  );
}

export function B2Shell({ rol = "admin" }: { rol?: RolShell }) {
  return (
    <B2Provider>
      <Estructura rol={rol} />
    </B2Provider>
  );
}
