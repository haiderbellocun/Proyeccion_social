// Kit de Administración B2: piezas compartidas por las seis pestañas (tabla de datos, formularios en inspector,
// confirmaciones, estados vacíos/carga/error, paginación). Reutiliza Inspector, Menu, Estado y los estilos B2 existentes.
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from "react";
import { IAbajo, IArriba, IBuscar, IChevL, IChevR, ICerrar, IKebab } from "./icons";
import { Inspector, Menu, enControl } from "./ui";
import { useMedia } from "./matriz-util";
import "./b2-admin.css";

export { Inspector, Menu };

/* ───────── pestañas de Administración ───────── */
export const TABS_ADMIN = [
  { id: "usuarios", label: "Usuarios" },
  { id: "semestres", label: "Semestres" },
  { id: "programas", label: "Escuelas y programas" },
  { id: "proyectos", label: "Iniciativas" },
  { id: "tareas", label: "Tareas semanales" },
  { id: "plantillas", label: "Plantillas" },
] as const;
export type TabAdmin = (typeof TABS_ADMIN)[number]["id"];

// Cada pestaña monta su propia cabecera; al navegar con el teclado el foco debe reaparecer en la pestaña elegida.
let pedirFoco = false;

export function AdmCabecera({ tab, onTab }: { tab: TabAdmin; onTab: (t: TabAdmin) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!pedirFoco) return;
    pedirFoco = false;
    refs.current[tab]?.focus();
  }, [tab]);
  const teclas = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS_ADMIN.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS_ADMIN.length) % TABS_ADMIN.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS_ADMIN.length - 1;
    else return;
    e.preventDefault();
    pedirFoco = true;
    onTab(TABS_ADMIN[n].id);
    refs.current[TABS_ADMIN[n].id]?.focus();
  };
  return (
    <header className="b2-adm-cab">
      <div>
        <h1 className="b2-mx-t">Administración del sistema</h1>
        <p className="b2-mx-s">Usuarios, semestres, escuelas y programas, iniciativas, tareas semanales y plantillas.</p>
      </div>
      <div className="b2-adm-tabs" role="tablist" aria-label="Secciones de administración">
        {TABS_ADMIN.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="b2-adm-tab"
            data-on={tab === t.id || undefined}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => teclas(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
}

/* ───────── marco de pestaña: columna principal + inspector acoplado ───────── */
export function AdmPagina({
  tab, cabecera, titulo, subtitulo, acciones, children, inspector, inspectorAbierto, inspectorEtiqueta, onCerrarInspector, ancho,
}: {
  tab: TabAdmin;
  cabecera: ReactNode;
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  inspectorAbierto: boolean;
  inspectorEtiqueta: string;
  onCerrarInspector: () => void;
  ancho?: boolean;
}) {
  // Esc cierra el inspector estén donde estén el foco (menús y diálogos abiertos lo gestionan ellos).
  useEffect(() => {
    if (!inspectorAbierto) return;
    const alEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open], .b2-pop")) return;
      onCerrarInspector();
    };
    document.addEventListener("keydown", alEscape);
    return () => document.removeEventListener("keydown", alEscape);
  }, [inspectorAbierto, onCerrarInspector]);
  return (
    <>
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx b2-adm" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {cabecera}
          <div className="b2-adm-sec">
            <div className="b2-adm-sec-t">
              <h2>{titulo}</h2>
              {subtitulo && <p>{subtitulo}</p>}
            </div>
            {acciones && <div className="b2-mx-acc">{acciones}</div>}
          </div>
          {children}
        </section>
      </div>
      <Inspector open={inspectorAbierto} onClose={onCerrarInspector} label={inspectorEtiqueta} wide={ancho}>
        {inspector}
      </Inspector>
    </>
  );
}

/* ───────── barra de búsqueda y filtros ───────── */
export function Barra({ children, contador }: { children: ReactNode; contador?: ReactNode }) {
  return (
    <div className="b2-tb b2-adm-tb" role="toolbar" aria-label="Búsqueda y filtros">
      {children}
      {contador != null && <><div className="b2-tb-fill" /><span className="b2-tb-count" aria-live="polite">{contador}</span></>}
    </div>
  );
}
export function Buscar({ value, onChange, placeholder, etiqueta }: { value: string; onChange: (v: string) => void; placeholder: string; etiqueta: string }) {
  return (
    <label className="b2-tb-search b2-adm-buscar">
      <IBuscar width={15} height={15} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={etiqueta} />
    </label>
  );
}
export function Filtro({ value, onChange, etiqueta, children, ancho = 190 }: { value: string; onChange: (v: string) => void; etiqueta: string; children: ReactNode; ancho?: number }) {
  return (
    <select className="b2-sel b2-adm-filtro" style={{ "--w": `${ancho}px` } as CSSProperties} value={value} onChange={(e) => onChange(e.target.value)} aria-label={etiqueta}>
      {children}
    </select>
  );
}
export function Chips<T extends string>({ value, onChange, etiqueta, items }: { value: T; onChange: (v: T) => void; etiqueta: string; items: { id: T; label: string; n?: number }[] }) {
  return (
    <div className="b2-chips b2-chips-flush" role="group" aria-label={etiqueta}>
      {items.map((it) => (
        <button key={it.id} type="button" className="b2-chip" data-on={value === it.id || undefined} aria-pressed={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}{it.n != null && <b>{it.n}</b>}
        </button>
      ))}
    </div>
  );
}

/* ───────── tabla de datos (escritorio) / lista (móvil) ───────── */
export interface Col<T> {
  id: string;
  titulo: string;
  /** Pista de la rejilla CSS (p. ej. "minmax(200px,1fr)" o "90px"). */
  ancho: string;
  /** 1 = siempre; 2 = desde ~820 px de ancho útil; 3 = desde ~1080 px. */
  prioridad?: 1 | 2 | 3;
  num?: boolean;
  /** Clave de orden: si se define, el encabezado es un botón que ordena (requiere `orden` y `onOrden` en la tabla). */
  orden?: string;
  celda: (r: T) => ReactNode;
}
export interface FilaMovil {
  titulo: ReactNode;
  lineas?: ReactNode[];
  lado?: ReactNode;
}

function useAncho(ref: React.RefObject<HTMLElement | null>) {
  const [ancho, setAncho] = useState(1200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return ancho;
}

export function DataTable<T>({
  etiqueta, cols, rows, getKey, selId, onSelect, cargando, vacio, filaMovil, acciones, ocupado, orden, onOrden,
}: {
  etiqueta: string;
  cols: Col<T>[];
  rows: T[];
  getKey: (r: T) => string | number;
  selId: string | number | null;
  onSelect: (r: T | null) => void;
  cargando: boolean;
  vacio: ReactNode;
  filaMovil: (r: T) => FilaMovil;
  /** Elementos del menú contextual de la fila (kebab). */
  acciones?: (r: T) => ({ label: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | "sep")[];
  ocupado?: boolean;
  orden?: { clave: string; dir: "asc" | "desc" };
  onOrden?: (clave: string) => void;
}) {
  const movil = useMedia("(max-width: 720px)");
  const ref = useRef<HTMLDivElement>(null);
  const ancho = useAncho(ref);
  const nivel = ancho >= 1080 ? 3 : ancho >= 820 ? 2 : 1;
  const visibles = useMemo(() => cols.filter((c) => (c.prioridad ?? 1) <= nivel), [cols, nivel]);
  const plantilla = useMemo(() => `${visibles.map((c) => c.ancho).join(" ")}${acciones ? " 32px" : ""}`, [visibles, acciones]);
  const [cursor, setCursor] = useState(0);
  useEffect(() => { setCursor((c) => Math.min(c, Math.max(0, rows.length - 1))); }, [rows.length]);

  const teclas = (e: KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(rows.length - 1, cursor + 1); setCursor(n); if (selId != null && rows[n]) onSelect(rows[n]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (selId != null && rows[n]) onSelect(rows[n]); }
    else if (e.key === "Enter" && rows[cursor]) { e.preventDefault(); onSelect(rows[cursor]); }
    else if (e.key === "Escape" && selId != null) onSelect(null);
  };

  if (movil) {
    return (
      <div className="b2-ml b2-adm-ml" aria-busy={cargando}>
        {cargando && <div className="b2-skel-w" aria-hidden="true">{[90, 78, 84, 70].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div>}
        {!cargando && rows.length === 0 && <div className="b2-adm-vacio" role="status">{vacio}</div>}
        {!cargando && rows.length > 0 && (
          <ul className="b2-ml-list" aria-label={etiqueta}>
            {rows.map((r) => {
              const f = filaMovil(r);
              const k = getKey(r);
              return (
                <li key={k} className="b2-adm-mli">
                  <button type="button" className="b2-ml-i" data-sel={selId === k || undefined} onClick={() => onSelect(r)} disabled={ocupado}>
                    <span className="b2-ml-t">
                      <span className="b2-ml-n">{f.titulo}</span>
                      {(f.lineas ?? []).map((l, i) => <span key={i} className="b2-ml-m">{l}</span>)}
                    </span>
                    {f.lado && <span className="b2-adm-lado">{f.lado}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="b2-tabla b2-adm-tabla" role="table" aria-label={etiqueta} aria-busy={cargando} tabIndex={0} onKeyDown={teclas} style={{ "--cols": plantilla } as CSSProperties}>
      <div className="b2-tabla-h" role="row">
        {visibles.map((c) => (
          <span key={c.id} role="columnheader" className={c.num ? "b2-c-num" : undefined} aria-sort={c.orden && orden ? (orden.clave === c.orden ? (orden.dir === "asc" ? "ascending" : "descending") : "none") : undefined}>
            {c.orden && onOrden ? (
              <button type="button" className="b2-th-btn" data-on={orden?.clave === c.orden || undefined} onClick={() => onOrden(c.orden!)} aria-label={`Ordenar por ${c.titulo}`}>
                {c.titulo}
                {orden?.clave === c.orden ? (orden.dir === "asc" ? <IArriba width={12} height={12} /> : <IAbajo width={12} height={12} />) : null}
              </button>
            ) : c.titulo}
          </span>
        ))}
        {acciones && <span role="columnheader" className="b2-sr-only">Acciones</span>}
      </div>
      {cargando && <div className="b2-skel-w" aria-hidden="true">{[90, 80, 86, 74, 82].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div>}
      {!cargando && rows.length === 0 && <div className="b2-adm-vacio" role="status">{vacio}</div>}
      {!cargando && rows.map((r, i) => {
        const k = getKey(r);
        return (
          <div
            key={k}
            className="b2-tabla-r"
            role="row"
            aria-selected={selId === k}
            data-sel={selId === k || undefined}
            data-cur={i === cursor || undefined}
            onClick={() => { setCursor(i); onSelect(r); }}
          >
            {visibles.map((c) => <span key={c.id} role="cell" className={c.num ? "b2-c-num" : "b2-adm-celda"}>{c.celda(r)}</span>)}
            {acciones && (
              <span role="cell" className="b2-adm-kebab" onClick={(e) => e.stopPropagation()}>
                <Menu
                  label="Acciones"
                  items={acciones(r)}
                  trigger={({ props }) => (
                    <button type="button" className="b2-btn b2-btn-ghost b2-btn-ico b2-btn-sm" aria-label="Más acciones" {...props}><IKebab width={16} height={16} /></button>
                  )}
                />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── paginación ───────── */
export function Paginador({ pagina, total, limite, onPagina, etiqueta = "registros" }: { pagina: number; total: number; limite: number; onPagina: (p: number) => void; etiqueta?: string }) {
  const paginas = Math.max(1, Math.ceil(total / limite));
  return (
    <div className="b2-adm-pie">
      <span aria-live="polite">{total} {etiqueta} · Página {pagina} de {paginas}</span>
      <div className="b2-pager">
        <button type="button" className="b2-btn b2-btn-sm b2-btn-ico" disabled={pagina <= 1} onClick={() => onPagina(Math.max(1, pagina - 1))} aria-label="Página anterior"><IChevL width={14} height={14} /></button>
        <button type="button" className="b2-btn b2-btn-sm b2-btn-ico" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)} aria-label="Página siguiente"><IChevR width={14} height={14} /></button>
      </div>
    </div>
  );
}

/* ───────── estados ───────── */
export function ErrorCarga({ children, onReintentar }: { children: ReactNode; onReintentar: () => void }) {
  return (
    <div className="b2-alert" role="alert">
      <span>{children}</span>
      <button type="button" className="b2-btn b2-btn-sm" onClick={onReintentar}>Reintentar</button>
    </div>
  );
}
export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="b2-adm-vacio-c">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
      {accion}
    </div>
  );
}
export function Cargando({ etiqueta = "Cargando…" }: { etiqueta?: string }) {
  return (
    <div className="b2-skel-w" role="status" aria-label={etiqueta}>
      {[88, 74, 82].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}
    </div>
  );
}
export function Tag({ tono = "neutro", children }: { tono?: "neutro" | "primario" | "ok" | "aviso" | "peligro"; children: ReactNode }) {
  return <span className="b2-adm-tag" data-t={tono}>{children}</span>;
}
export function Resumen({ items }: { items: { k: string; v: ReactNode; alerta?: boolean }[] }) {
  return (
    <dl className="b2-mx-stats b2-adm-stats">
      {items.map((it) => (
        <div key={it.k}><dt>{it.k}</dt><dd className={it.alerta ? "b2-neg" : undefined}>{it.v}</dd></div>
      ))}
    </dl>
  );
}

/* ───────── campos de formulario ───────── */
export function Campo({ etiqueta, error, ayuda, obligatorio, children, ancho, htmlFor }: {
  etiqueta: string; error?: string | null; ayuda?: ReactNode; obligatorio?: boolean; children: (p: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode; ancho?: "completo"; htmlFor?: string;
}) {
  const id = useId();
  const cid = htmlFor ?? id;
  const did = `${cid}-d`;
  return (
    <div className="b2-campo-f" data-w={ancho}>
      <label className="b2-label" htmlFor={cid}>{etiqueta}{obligatorio && <span aria-hidden="true"> *</span>}</label>
      {children({ id: cid, ...(error ? { "aria-invalid": true as const } : {}), ...(error || ayuda ? { "aria-describedby": did } : {}) })}
      {error ? <p id={did} className="b2-campo-e" role="alert">{error}</p> : ayuda ? <p id={did} className="b2-campo-a">{ayuda}</p> : null}
    </div>
  );
}
export function Grupo({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <fieldset className="b2-form-g">
      {titulo && <legend>{titulo}</legend>}
      {children}
    </fieldset>
  );
}

/** Contenido de inspector para crear/editar: encabezado, campos con scroll y barra de acciones fija. */
export function FormInspector({
  sup, titulo, onCerrar, onGuardar, guardando, etiquetaGuardar, errores, children, deshabilitarGuardar, extraAcciones,
}: {
  sup?: string;
  titulo: string;
  onCerrar: () => void;
  onGuardar: () => void;
  guardando: boolean;
  etiquetaGuardar: string;
  errores?: string[];
  children: ReactNode;
  deshabilitarGuardar?: boolean;
  extraAcciones?: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus();
  }, []);
  return (
    <form
      ref={ref}
      className="b2-form"
      noValidate
      onSubmit={(e) => { e.preventDefault(); if (!guardando && !deshabilitarGuardar) onGuardar(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !guardando) { e.stopPropagation(); onCerrar(); } }}
    >
      <div className="b2-insp-c b2-form-c">
        {sup && <p className="b2-insp-sup">{sup}</p>}
        <h2 className="b2-insp-h">{titulo}</h2>
        {errores && errores.length > 0 && (
          <div className="b2-nota-aviso b2-form-err" data-t="err" role="alert">
            <strong>Revisa estos campos</strong>
            <ul>{errores.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {children}
      </div>
      <div className="b2-form-pie">
        {extraAcciones}
        <button type="button" className="b2-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button type="submit" className="b2-btn b2-btn-primary" disabled={guardando || deshabilitarGuardar}>{guardando ? "Guardando…" : etiquetaGuardar}</button>
      </div>
    </form>
  );
}
export function CerrarInspectorBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" className="b2-btn b2-btn-ghost b2-btn-ico" onClick={onClick} aria-label="Cerrar"><ICerrar width={16} height={16} /></button>;
}

/* ───────── confirmación segura ───────── */
export interface OpcionesConfirmar {
  titulo: string;
  descripcion: ReactNode;
  etiqueta?: string;
  tono?: "peligro" | "aviso" | "primario";
}
function DialogoConfirmar({ o, onResolver }: { o: OpcionesConfirmar; onResolver: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  const did = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const peligro = o.tono === "peligro";
  return (
    <dialog
      ref={ref}
      className="b2-dlg b2-adm-dlg"
      aria-labelledby={tid}
      aria-describedby={did}
      onCancel={(e) => { e.preventDefault(); onResolver(false); }}
      onClick={(e) => { if (e.target === ref.current) onResolver(false); }}
    >
      <h2 id={tid} className="b2-dlg-t">{o.titulo}</h2>
      <div id={did} className="b2-adm-dlg-d">{o.descripcion}</div>
      <div className="b2-adm-dlg-acc">
        <button type="button" className="b2-btn" autoFocus={peligro} onClick={() => onResolver(false)}>Cancelar</button>
        <button type="button" className={`b2-btn ${peligro ? "b2-btn-peligro" : "b2-btn-primary"}`} autoFocus={!peligro} onClick={() => onResolver(true)}>{o.etiqueta ?? "Confirmar"}</button>
      </div>
    </dialog>
  );
}
export function useConfirmar() {
  const [estado, setEstado] = useState<{ o: OpcionesConfirmar; resolver: (v: boolean) => void } | null>(null);
  const confirmar = useCallback((o: OpcionesConfirmar) => new Promise<boolean>((resolver) => setEstado({ o, resolver })), []);
  const dialogo = estado ? (
    <DialogoConfirmar o={estado.o} onResolver={(v) => { estado.resolver(v); setEstado(null); }} />
  ) : null;
  return { confirmar, dialogo };
}

/* ───────── utilidades ───────── */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaCorta = (v: string | null | undefined) => {
  const s = String(v ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]} ${y}`;
};
export const soloFecha = (v: string | null | undefined) => String(v ?? "").slice(0, 10);
export const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
