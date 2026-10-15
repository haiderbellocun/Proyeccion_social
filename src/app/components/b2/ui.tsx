// Piezas de interfaz del diseño B2 (tooltip, popover, menú, estados, inspector). Estilos en b2.css.
import {
  cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactElement, type ReactNode,
} from "react";
import { ICerrar } from "./icons";

/* ───────── estados: forma + color + texto ───────── */
export type Kind = "aprobado" | "revision" | "observado" | "vencido" | "porhacer" | "borrador" | "encurso";

export function EstadoIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, className: "b2-ei", focusable: false } as const;
  switch (kind) {
    case "aprobado":
      return (<svg {...p}><circle cx="8" cy="8" r="7" fill="var(--c-bar)" /><path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case "revision":
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-primary)" strokeWidth="1.6" /><path d="M8 1.8a6.2 6.2 0 010 12.4z" fill="var(--c-primary)" /></svg>);
    case "observado":
      return (<svg {...p}><path d="M8 1.2l6.8 6.8L8 14.8 1.2 8z" fill="var(--c-primary)" /><path d="M8 5v3.5M8 10.7v.01" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>);
    case "vencido":
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-danger)" strokeWidth="1.6" /><path d="M8 1.8a6.2 6.2 0 010 12.4z" fill="var(--c-danger)" /></svg>);
    case "borrador":
      return (<svg {...p}><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="var(--c-primary)" strokeWidth="1.6" /><path d="M5 9.5l4.5-4.5 1.5 1.5L6.5 11H5z" fill="var(--c-primary)" /></svg>);
    case "encurso":
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-primary)" strokeWidth="1.6" /><circle cx="8" cy="8" r="2.2" fill="var(--c-primary)" /></svg>);
    default:
      return (<svg {...p}><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--c-bar)" strokeWidth="1.6" strokeDasharray="2.6 2" /></svg>);
  }
}
export function Estado({ kind, label }: { kind: Kind; label: string }) {
  return (
    <span className="b2-estado" data-k={kind}>
      <EstadoIcon kind={kind} />
      <span>{label}</span>
    </span>
  );
}
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="b2-kbd">{children}</kbd>;

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
      className="b2-tip"
      onPointerEnter={(e) => e.pointerType === "mouse" && abrir(false)}
      onPointerLeave={cerrar}
      onFocus={(e) => (e.target as HTMLElement).matches(":focus-visible") && abrir(true)}
      onBlur={cerrar}
      onKeyDown={(e) => e.key === "Escape" && cerrar()}
    >
      {children}
      {open && <span role="tooltip" className="b2-tip-pop" data-side={side} data-instant={instant || undefined}>{label}</span>}
    </span>
  );
}

/* ───────── popover anclado, con posición fija junto al disparador ───────── */
export function Popover({
  trigger, children, align = "left", label,
}: {
  trigger: (p: { open: boolean; props: Record<string, unknown> }) => ReactElement;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; flip: boolean } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();
  const set = useCallback((o: boolean) => { setOpen(o); if (!o) setPos(null); }, []);
  const cerrar = useCallback(() => {
    set(false);
    (raiz.current?.querySelector("[data-trigger]") as HTMLElement | null)?.focus();
  }, [set]);
  useLayoutEffect(() => {
    if (!open) return;
    const t = raiz.current?.querySelector("[data-trigger]") as HTMLElement | null;
    const c = caja.current;
    if (!t || !c) return;
    const r = t.getBoundingClientRect();
    const h = c.offsetHeight;
    const flip = r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8;
    const top = flip ? r.top - 6 - h : r.bottom + 6;
    const w = c.offsetWidth;
    // Si no cabe hacia el lado preferido, se desplaza para quedar siempre dentro de la pantalla
    if (align === "right" && r.right - w >= 8) setPos({ top, right: Math.max(8, window.innerWidth - r.right), flip });
    else if (align === "right") setPos({ top, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), flip });
    else setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), flip });
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node) && !caja.current?.contains(e.target as Node)) set(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    const scroll = (e: Event) => { if (!caja.current?.contains(e.target as Node)) set(false); };
    const resize = () => set(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open, set, cerrar]);
  const el = trigger({ open, props: { "data-trigger": "", "aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": open ? id : undefined, onClick: () => set(!open) } });
  return (
    <div className="b2-pop-raiz" ref={raiz}>
      {cloneElement(el)}
      {open && (
        <div id={id} ref={caja} className="b2-pop" data-align={align} data-flip={pos?.flip || undefined} role="dialog" aria-label={label}
          style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { top: 0, left: 0, visibility: "hidden" }}>
          {children(cerrar)}
        </div>
      )}
    </div>
  );
}

export function Menu({
  trigger, items, align = "right", label,
}: {
  trigger: (p: { open: boolean; props: Record<string, unknown> }) => ReactElement;
  items: ({ label: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | "sep")[];
  align?: "left" | "right";
  label: string;
}) {
  return (
    <Popover trigger={trigger} align={align} label={label}>
      {(cerrar) => (
        <ul className="b2-menu" role="menu">
          {items.map((it, i) =>
            it === "sep" ? (
              <li key={i} className="b2-menu-sep" role="separator" />
            ) : (
              <li key={i} role="none">
                <button role="menuitem" className="b2-menu-i" data-danger={it.danger || undefined} disabled={it.disabled} onClick={() => { cerrar(); it.onSelect(); }}>
                  <span>{it.label}</span>
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </Popover>
  );
}

/* ───────── inspector: columna acoplada, cajón o hoja inferior según el ancho ───────── */
export function Inspector({ open, onClose, label, children, wide }: { open: boolean; onClose: () => void; label: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [label]);
  return (
    <>
      <div className="b2-scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className="b2-insp" data-open={open} data-wide={wide || undefined} aria-label="Detalle" role="complementary">
        {open && (
          <>
            <div className="b2-insp-grab" aria-hidden="true" />
            <button className="b2-btn b2-btn-ghost b2-btn-ico b2-insp-x" onClick={onClose} aria-label="Cerrar detalle"><ICerrar width={16} height={16} /></button>
            {children}
          </>
        )}
      </aside>
    </>
  );
}

export function Dl({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="b2-dl">
      {rows.map(([k, v]) => (
        <div key={k} className="b2-dl-r"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

export function enControl(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.isContentEditable || !!el.closest("dialog[open]");
}
