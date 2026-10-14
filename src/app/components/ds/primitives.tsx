import type { ComponentType, ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Primitivos del sistema de diseño «Tinta».
 * Toda la presentación sale de los tokens de src/styles/theme.css: aquí no hay colores arbitrarios.
 */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "violet" | "signal";

/** Clases por tono: fondo suave + texto legible (≥ 4.5:1) + punto de color. */
export const TONE: Record<Tone, { soft: string; text: string; dot: string; bar: string; ring: string }> = {
  neutral: { soft: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-400", bar: "bg-gray-400", ring: "ring-gray-200" },
  brand: { soft: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", bar: "bg-brand", ring: "ring-blue-200" },
  success: { soft: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", bar: "bg-emerald-500", ring: "ring-emerald-200" },
  warning: { soft: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", bar: "bg-amber-400", ring: "ring-amber-200" },
  danger: { soft: "bg-red-50", text: "text-red-700", dot: "bg-red-500", bar: "bg-red-500", ring: "ring-red-200" },
  violet: { soft: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", bar: "bg-purple-500", ring: "ring-purple-200" },
  signal: { soft: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500", bar: "bg-cyan-500", ring: "ring-cyan-200" },
};

/** Estado de entregable → tono (misma lectura en todas las pantallas). */
export const TONE_ESTADO: Record<string, Tone> = {
  aprobado: "success",
  aprobada: "success",
  enviado: "violet",
  en_revision: "violet",
  observado: "warning",
  observada: "warning",
  vencido: "danger",
  borrador: "brand",
  no_iniciado: "neutral",
  sin_evidencia: "neutral",
};

export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
  className = "",
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${t.soft} ${t.text} ${className}`}
      style={{ fontWeight: 550 }}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />}
      {children}
    </span>
  );
}

/* ─────────────── Estructura de página ─────────────── */

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted max-w-[68ch]">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Contenedor estándar de página: ancho máximo, gutter responsivo y ritmo vertical. */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? "max-w-[1600px]" : "max-w-[1440px]"} space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7`}>{children}</div>;
}

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "ds-panel-body",
  as: Tag = "section",
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Pasa "" para contenido a sangre (tablas). */
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={`ds-panel ${className}`}>
      {(title || action) && (
        <div className="ds-panel-header">
          <div className="min-w-0">
            {title && <h3 className="text-[0.9375rem]">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-text-subtle">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/* ─────────────── Indicadores ─────────────── */

export function ProgressBar({
  value,
  tone = "brand",
  marker,
  label,
  className = "",
}: {
  value: number;
  tone?: Tone;
  /** Posición (0–100) de un valor de referencia, p. ej. lo esperado a la fecha. */
  marker?: number | null;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={`relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100 ${className}`}
    >
      <div className={`h-full rounded-full ${TONE[tone].bar} transition-[width] duration-500`} style={{ width: `${v}%` }} />
      {marker != null && marker > 0 && marker <= 100 && (
        <span className="absolute top-0 h-full w-0.5 bg-gray-800/70" style={{ left: `${marker}%` }} aria-hidden title={`Esperado: ${Math.round(marker)}%`} />
      )}
    </div>
  );
}

/** Barra apilada por estados (aprobado, en revisión, observado…). */
export function StackedBar({ parts, total, className = "" }: { parts: { tone: Tone; value: number; label: string }[]; total: number; className?: string }) {
  const t = total > 0 ? total : 1;
  return (
    <div className={`flex h-2 w-full overflow-hidden rounded-full bg-gray-100 ${className}`} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.label} className={TONE[p.tone].bar} style={{ width: `${(p.value / t) * 100}%` }} title={`${p.label}: ${p.value}`} />
        ))}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  progress,
  marker,
  trailing,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  progress?: number | null;
  marker?: number | null;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ds-panel flex flex-col gap-2 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-subtle">{label}</p>
        {Icon && (
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${TONE[tone].soft} ${TONE[tone].text}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[1.75rem] leading-none tracking-tight tabular-nums" style={{ fontWeight: 650 }} data-numeric>
          {value}
        </p>
        {trailing}
      </div>
      {progress != null && <ProgressBar value={progress} tone={tone === "neutral" ? "brand" : tone} marker={marker} />}
      {hint && <p className="text-xs leading-snug text-text-subtle">{hint}</p>}
    </div>
  );
}

/* ─────────────── Estados de pantalla ─────────────── */

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand ${className}`} aria-hidden />;
}

export function PageLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-text-subtle" role="status">
      <Spinner className="h-5 w-5" /> {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" role="status">
      {Icon && (
        <span className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-sm text-text" style={{ fontWeight: 600 }}>{title}</p>
      {children && <p className="max-w-[48ch] text-sm text-text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function InlineAlert({ tone = "danger", children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  const t = TONE[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${t.soft} ${t.text} border-current/15`}>
      <span className="min-w-[12rem] flex-1">{children}</span>
      {action}
    </div>
  );
}

/* ─────────────── Filtros por estado (tabs con contador) ─────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number; tone?: Tone }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const activo = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(it.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] transition-colors ${
              activo ? "border-ink bg-ink text-white" : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text"
            }`}
          >
            {it.tone && <span className={`h-1.5 w-1.5 rounded-full ${TONE[it.tone].dot}`} aria-hidden />}
            {it.label}
            {it.count != null && (
              <span className={`tabular-nums ${activo ? "text-white/70" : "text-text-subtle"}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
