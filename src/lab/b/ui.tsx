// Piezas compartidas del prototipo B: estados, tooltip, toast, diálogo, popover/menú, inspector y utilidades.
import {
  cloneElement, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactElement, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { inicioSemestre, hoy, type Item } from "../shared/model";
import { ICerrar, IExterno } from "./icons";

export const MENOS = "−";
export const fmt1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
export const signed = (n: number) => (n < 0 ? `${MENOS}${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

const DIA = 86_400_000;
export const aMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const dias = (desde: string, hasta: string) => Math.round((aMs(hasta) - aMs(desde)) / DIA);
export const addDays = (iso: string, n: number) => new Date(aMs(iso) + n * DIA).toISOString().slice(0, 10);
export const semanaRango = (s: number): [string, string] => [addDays(inicioSemestre, (s - 1) * 7), addDays(inicioSemestre, (s - 1) * 7 + 6)];
export const diaHoy = dias(inicioSemestre, hoy);

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
export const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MES[m - 1]} ${y}`;
};
export const fechaCorta = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MES[m - 1]}`;
};

export function tipoEvidencia(url: string, tipo?: string): string {
  const t = tipo ?? "";
  if (t === "drive_archivo") return "Archivo de Drive";
  if (t === "drive_carpeta") return "Carpeta de Drive";
  if (t === "google_doc") return "Documento";
  if (t === "google_hoja") return "Hoja de cálculo";
  if (t === "google_presentacion") return "Presentación";
  if (t === "formulario") return "Formulario";
  if (t) return "Enlace externo";
  if (/drive\.google\.com\/file\//.test(url)) return "Archivo de Drive";
  if (/drive\.google\.com\/.*folders/.test(url)) return "Carpeta de Drive";
  if (/docs\.google\.com\/document/.test(url)) return "Documento";
  if (/docs\.google\.com\/spreadsheets/.test(url)) return "Hoja de cálculo";
  if (/docs\.google\.com\/presentation/.test(url)) return "Presentación";
  if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return "Formulario";
  return "Enlace externo";
}
const corto = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "");

/* ───────── estados: forma + color + texto ───────── */
export type Kind = "aprobado" | "revision" | "observado" | "vencido" | "porhacer";
export const KINDS: Kind[] = ["vencido", "observado", "revision", "porhacer", "aprobado"];
export const KIND_LABEL: Record<Kind, string> = { aprobado: "Aprobado", revision: "En revisión", observado: "Observado", vencido: "Vencido", porhacer: "Por hacer" };
export const kindOf = (i: Item, forzado?: Item["estado"]): Kind => {
  const e = forzado ?? i.estado;
  return e === "aprobado" ? "aprobado" : e === "enviado" ? "revision" : e === "observado" ? "observado" : i.vencido ? "vencido" : "porhacer";
};

export function EstadoIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, className: "ei", focusable: false } as const;
  switch (kind) {
    case "aprobado":
      return (<svg {...p}><circle cx="8" cy="8" r="7" fill="var(--c-bar)" /><path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "revision":
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-primary)" strokeWidth="1.6" /><path d="M8 1.8a6.200 6.200 0 010 12.400z" fill="var(--c-primary)" /></svg>);
    case "observado":
      return (<svg {...p}><path d="M8 1.2l6.800 6.800L8 14.800 1.200 8z" fill="var(--c-primary)" /><path d="M8 5v3.500M8 10.700v.01" stroke="#fff" strokeWidth="1.600" strokeLinecap="round" /></svg>);
    case "vencido":
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-danger)" strokeWidth="1.6" /><path d="M8 1.8a6.200 6.200 0 010 12.400z" fill="var(--c-danger)" /></svg>);
    default:
      return (<svg {...p}><circle cx="8" cy="8" r="6.200" fill="none" stroke="var(--c-bar)" strokeWidth="1.600" strokeDasharray="2.600 2" /></svg>);
  }
}
export function Estado({ kind, label }: { kind: Kind; label?: string }) {
  return (
    <span className="estado" data-k={kind}>
      <EstadoIcon kind={kind} />
      <span>{label ?? KIND_LABEL[kind]}</span>
    </span>
  );
}
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

/* ───────── modo de entrada: el teclado nunca anima ───────── */
export function useInputMode() {
  useEffect(() => {
    const el = document.documentElement;
    const kb = () => (el.dataset.input = "kb");
    const ptr = () => (el.dataset.input = "ptr");
    window.addEventListener("keydown", kb, true);
    window.addEventListener("pointerdown", ptr, true);
    return () => { window.removeEventListener("keydown", kb, true); window.removeEventListener("pointerdown", ptr, true); };
  }, []);
}

/* ───────── tooltip: 400 ms la primera vez; el siguiente, al instante ───────── */
let abiertos = 0;
let cerradoEn = 0;
export function Tip({ label, side = "right", children }: { label: string; side?: "right" | "top" | "bottom"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const timer = useRef<number>();
  const counted = useRef(false);
  const abrir = (inmediato: boolean) => {
    window.clearTimeout(timer.current);
    const caliente = abiertos > 0 || performance.now() - cerradoEn < 300;
    const go = () => { if (!counted.current) { counted.current = true; abiertos++; } setOpen(true); };
    if (inmediato || caliente) { setInstant(true); go(); } else { setInstant(false); timer.current = window.setTimeout(go, 400); }
  };
  const cerrar = () => {
    window.clearTimeout(timer.current);
    if (counted.current) { counted.current = false; abiertos--; cerradoEn = performance.now(); }
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <span
      className="tip"
      onPointerEnter={(e) => e.pointerType === "mouse" && abrir(false)}
      onPointerLeave={cerrar}
      onFocus={(e) => (e.target as HTMLElement).matches(":focus-visible") && abrir(true)}
      onBlur={cerrar}
      onKeyDown={(e) => e.key === "Escape" && cerrar()}
    >
      {children}
      {open && <span role="tooltip" className="tip-pop" data-side={side} data-instant={instant || undefined}>{label}</span>}
    </span>
  );
}

/* ───────── toast ───────── */
interface ToastData { id: number; text: string; undo?: () => void; leaving?: boolean }
type PushToast = (t: { text: string; undo?: () => void }) => void;
const ToastCtx = createContext<PushToast>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastData | null>(null);
  const [paused, setPaused] = useState(false);
  const rest = useRef(5000);
  const started = useRef(0);
  const timer = useRef<number>();
  const seq = useRef(0);
  const salir = useCallback((id: number) => {
    setT((c) => (c && c.id === id ? { ...c, leaving: true } : c));
    window.setTimeout(() => setT((c) => (c && c.id === id ? null : c)), 120);
  }, []);
  const push: PushToast = useCallback((n) => { seq.current += 1; rest.current = 5000; setPaused(false); setT({ id: seq.current, ...n }); }, []);
  useEffect(() => {
    if (!t || t.leaving) return;
    window.clearTimeout(timer.current);
    if (paused) return;
    started.current = performance.now();
    timer.current = window.setTimeout(() => salir(t.id), rest.current);
    return () => { window.clearTimeout(timer.current); rest.current = Math.max(1200, rest.current - (performance.now() - started.current)); };
  }, [t?.id, t?.leaving, paused, salir]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toast-zone">
          {t && (
            <div key={t.id} className="toast" data-leaving={t.leaving || undefined} role="status"
              onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
              <span className="toast-t">{t.text}</span>
              {t.undo && <button className="toast-b" onClick={() => { t.undo?.(); salir(t.id); }}>Deshacer</button>}
            </div>
          )}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

/* ───────── diálogo nativo ───────── */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dlg" aria-labelledby={id} onClose={onClose}>
      <h2 id={id} className="dlg-t">{title}</h2>
      {children}
    </dialog>
  );
}

/* ───────── popover anclado (origen de transformación = el disparador) ───────── */
export function Popover({
  trigger, children, align = "left", label, onOpenChange,
}: {
  trigger: (p: { open: boolean; props: Record<string, unknown> }) => ReactElement;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label: string;
  onOpenChange?: (o: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; flip: boolean } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();
  const set = useCallback((o: boolean) => { setOpen(o); if (!o) setPos(null); onOpenChange?.(o); }, [onOpenChange]);
  const cerrar = useCallback(() => {
    set(false);
    (raiz.current?.querySelector("[data-trigger]") as HTMLElement | null)?.focus();
  }, [set]);
  // Posición fija junto al disparador: no se recorta dentro de contenedores con scroll y se voltea si no cabe debajo.
  useLayoutEffect(() => {
    if (!open) return;
    const t = raiz.current?.querySelector("[data-trigger]") as HTMLElement | null;
    const c = caja.current;
    if (!t || !c) return;
    const r = t.getBoundingClientRect();
    const h = c.offsetHeight;
    const flip = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
    const top = flip ? r.top - 6 - h : r.bottom + 6;
    if (align === "right") setPos({ top, right: Math.max(8, window.innerWidth - r.right), flip });
    else setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - c.offsetWidth - 8)), flip });
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node) && !caja.current?.contains(e.target as Node)) set(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    const scroll = (e: Event) => { if (!caja.current?.contains(e.target as Node)) set(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", () => set(false), { once: true });
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla, true); window.removeEventListener("scroll", scroll, true); };
  }, [open, set, cerrar]);
  const el = trigger({ open, props: { "data-trigger": "", "aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": open ? id : undefined, onClick: () => set(!open) } });
  return (
    <div className="pop-raiz" ref={raiz}>
      {cloneElement(el)}
      {open && (
        <div id={id} ref={caja} className="pop" data-align={align} data-flip={pos?.flip || undefined} data-ready={pos ? "" : undefined} role="dialog" aria-label={label}
          style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { top: 0, left: 0, visibility: "hidden" }}>
          {children(cerrar)}
        </div>
      )}
    </div>
  );
}

/** Menú de acciones (⋮ de fila, menú de usuario). */
export function Menu({
  trigger, items, align = "right", label,
}: {
  trigger: (p: { open: boolean; props: Record<string, unknown> }) => ReactElement;
  items: ({ label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; hint?: string } | "sep")[];
  align?: "left" | "right";
  label: string;
}) {
  return (
    <Popover trigger={trigger} align={align} label={label}>
      {(cerrar) => (
        <ul className="menu" role="menu">
          {items.map((it, i) =>
            it === "sep" ? (
              <li key={i} className="menu-sep" role="separator" />
            ) : (
              <li key={i} role="none">
                <button role="menuitem" className="menu-i" data-danger={it.danger || undefined} disabled={it.disabled}
                  onClick={() => { cerrar(); it.onSelect(); }}>
                  <span>{it.label}</span>
                  {it.hint && <span className="menu-h">{it.hint}</span>}
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </Popover>
  );
}

/* ───────── inspector: columna acoplada en escritorio, cajón en tablet, hoja inferior en móvil ───────── */
export function Inspector({ open, onClose, label, empty, children }: { open: boolean; onClose: () => void; label: string; empty?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [label]);
  return (
    <>
      <div className="scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className="insp" data-open={open} aria-label="Detalle" role="complementary">
        {open ? (
          <>
            <div className="insp-grab" aria-hidden="true" />
            <button className="btn btn-ghost btn-ico insp-x" onClick={onClose} aria-label="Cerrar detalle"><ICerrar width={16} height={16} /></button>
            {children}
          </>
        ) : (
          <div className="insp-empty">{empty}</div>
        )}
      </aside>
    </>
  );
}

export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="dl">
      {rows.map(([k, v]) => (
        <div key={k} className="dl-r"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function Evidencias({ lista }: { lista: { tipo: string; url: string }[] }) {
  if (!lista.length) return <p className="muted">Sin enlaces de evidencia.</p>;
  return (
    <ul className="evid">
      {lista.map((e, i) => (
        <li key={i} className="evid-i">
          <div className="evid-t">
            <span className="evid-k">{e.tipo}</span>
            <span className="evid-u" title={e.url}>{corto(e.url)}</span>
          </div>
          <a className="btn btn-sm" href={e.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${e.tipo.toLowerCase()}`}>
            Abrir <IExterno width={14} height={14} />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function enControl(t: EventTarget | null, conBotones = true) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (conBotones ? /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/ : /^(INPUT|TEXTAREA|SELECT)$/).test(el.tagName) || el.isContentEditable || !!el.closest("dialog[open]");
}

/** Mantiene la fila visible sin animar el desplazamiento. */
export function revelar(cont: HTMLElement | null, fila: HTMLElement | null, cabecera = 0) {
  if (!cont || !fila) return;
  const c = cont.getBoundingClientRect();
  const r = fila.getBoundingClientRect();
  const top = c.top + cabecera;
  if (r.top < top) cont.scrollTop -= top - r.top;
  else if (r.bottom > c.bottom) cont.scrollTop += r.bottom - c.bottom;
}
