import { useEffect, useRef, useState, type ReactNode } from "react";

/* ───────── Iconos mínimos (trazo único de 1.5) ───────── */
export const IBuscar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
export const IExterno = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 2.5H2.5v7h7V7M7 2.5h2.5V5M9.5 2.5 5.5 6.5" />
  </svg>
);

/* ───────── Marca de estado: forma + texto (nunca solo color) ───────── */
export type EstadoVisual = "aprobado" | "enviado" | "observado" | "vencido" | "no_iniciado" | "borrador";
const FORMA: Record<EstadoVisual, ReactNode> = {
  aprobado: <circle cx="5.5" cy="5.5" r="5" fill="currentColor" />,
  enviado: (
    <>
      <circle cx="5.5" cy="5.5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="1.7" fill="currentColor" />
    </>
  ),
  observado: <path d="M5.5 .8 10.4 9.7H.6z" fill="currentColor" />,
  vencido: <rect x=".6" y=".6" width="9.8" height="9.8" rx="1" fill="currentColor" />,
  no_iniciado: <circle cx="5.5" cy="5.5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  borrador: <path d="M1 9.5 9.5 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />,
};
const TEXTO: Record<EstadoVisual, string> = {
  aprobado: "Aprobado", enviado: "En revisión", observado: "Observado", vencido: "Vencido", no_iniciado: "Por hacer", borrador: "Borrador",
};
export function Marca({ e, texto }: { e: EstadoVisual; texto?: string }) {
  return (
    <span className="marca" data-e={e}>
      <svg viewBox="0 0 11 11" aria-hidden>{FORMA[e]}</svg>
      {texto ?? TEXTO[e]}
    </span>
  );
}

/* ───────── Pista de avance: reportado, aprobado y marca de lo esperado ───────── */
export function Pista({ valor, esperado, tipo = "rep", etiqueta }: { valor: number; esperado?: number; tipo?: "rep" | "apr" | "gen"; etiqueta?: string }) {
  return (
    <div className="pista" data-t={tipo} role="img" aria-label={etiqueta ?? `${Math.round(valor)} %`}>
      <i style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
      {esperado != null && <b style={{ left: `calc(${Math.min(100, esperado)}% - 1px)` }} />}
    </div>
  );
}

export const fmt = (v: number, d = 1) => v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: d });

/* ───────── Tooltip: retraso la primera vez; instantáneo si ya hay uno abierto ───────── */
let tooltipsActivos = 0;
export function Tip({ texto, children }: { texto: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number; instantaneo: boolean } | null>(null);
  const t = useRef<number>(0);
  const caja = useRef<HTMLSpanElement>(null);
  const mostrar = () => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const mover = () => {
      tooltipsActivos += 1;
      setPos({ x: r.left + r.width / 2, y: r.top, instantaneo: tooltipsActivos > 1 });
    };
    window.clearTimeout(t.current);
    if (tooltipsActivos > 0) mover();
    else t.current = window.setTimeout(mover, 400);
  };
  const ocultar = () => {
    window.clearTimeout(t.current);
    setPos((p) => {
      if (p) tooltipsActivos = Math.max(0, tooltipsActivos - 1);
      return null;
    });
  };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <span ref={caja} onPointerEnter={mostrar} onPointerLeave={ocultar} onFocus={mostrar} onBlur={ocultar} style={{ display: "contents" }}>
      {children}
      {pos && (
        <span role="tooltip" className="tip" data-instantaneo={pos.instantaneo} style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%,-100%)" }}>
          {texto}
        </span>
      )}
    </span>
  );
}

/* ───────── Toasts (sin contexto: llamada global) ───────── */
interface ToastDato { id: number; texto: string; deshacer?: () => void; saliendo?: boolean }
let toasts: ToastDato[] = [];
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
let contador = 0;
export function toast(texto: string, deshacer?: () => void) {
  const id = ++contador;
  toasts = [...toasts, { id, texto, deshacer }].slice(-3);
  emitir();
  window.setTimeout(() => cerrar(id), 5000);
}
function cerrar(id: number) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, saliendo: true } : t));
  emitir();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitir();
  }, 140);
}
export function ToastHost() {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = () => forzar((n) => n + 1);
    oyentes.add(f);
    return () => void oyentes.delete(f);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-saliendo={t.saliendo ? "true" : "false"}>
          {t.texto}
          {t.deshacer && (
            <button type="button" onClick={() => { t.deshacer?.(); cerrar(t.id); }}>
              Deshacer
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
