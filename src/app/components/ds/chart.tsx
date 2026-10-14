import { useMemo } from "react";

/**
 * Tema compartido para gráficos (Recharts). Los atributos SVG no resuelven var(), así que los colores se
 * leen de los tokens de theme.css en tiempo de ejecución: theme.css sigue siendo la única fuente de verdad.
 */
const FALLBACK = {
  reportado: "#2e4fe0", aprobado: "#137652", esperado: "#8c99ad", enviado: "#5632ae", observado: "#a06c00", vencido: "#bf2a48",
  signal: "#0e9fb8", grid: "#e2e7ef", axis: "#66748b", text: "#141d2e", muted: "#4d5a71", cursor: "rgba(20,29,46,0.04)",
};

export type ChartColors = typeof FALLBACK;

export function chartColors(): ChartColors {
  if (typeof window === "undefined") return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  return {
    reportado: v("--color-st-reportado", FALLBACK.reportado),
    aprobado: v("--color-st-aprobado", FALLBACK.aprobado),
    esperado: v("--color-st-esperado", FALLBACK.esperado),
    enviado: v("--color-st-enviado", FALLBACK.enviado),
    observado: v("--color-st-observado", FALLBACK.observado),
    vencido: v("--color-st-vencido", FALLBACK.vencido),
    signal: v("--color-signal", FALLBACK.signal),
    grid: v("--color-line", FALLBACK.grid),
    axis: v("--color-text-subtle", FALLBACK.axis),
    text: v("--color-text", FALLBACK.text),
    muted: v("--color-text-muted", FALLBACK.muted),
    cursor: FALLBACK.cursor,
  };
}

export function useChartColors(): ChartColors {
  return useMemo(chartColors, []);
}

export const axisTick = (c: ChartColors) => ({ fontSize: 11, fill: c.axis });

interface TooltipPayload {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

/** Tooltip legible y consistente para todos los gráficos. */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
  labelPrefix = "",
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  unit?: string;
  labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      {label != null && <p className="mb-1 text-text" style={{ fontWeight: 600 }}>{labelPrefix}{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 text-text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 tabular-nums text-text" style={{ fontWeight: 600 }}>{p.value}{unit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Leyenda propia (los colores no son la única señal: cada serie lleva nombre y forma). */
export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: i.dashed ? "transparent" : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }}
            aria-hidden
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
