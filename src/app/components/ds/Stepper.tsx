import { Check } from "lucide-react";

/**
 * Indicador de pasos de un asistente. En pantallas anchas muestra todos los pasos conectados;
 * en móvil, un resumen «Paso n de N» con barra de avance (sin perder información).
 */
export function Stepper({ steps, current, label = "Pasos" }: { steps: string[]; current: number; label?: string }) {
  const total = steps.length;
  return (
    <nav aria-label={label} className="ds-panel px-4 py-3.5">
      <p className="text-sm text-text md:hidden" style={{ fontWeight: 600 }}>
        Paso {current + 1} de {total}
        <span className="font-normal text-text-muted"> · {steps[current]}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 md:hidden" aria-hidden>
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${((current + 1) / total) * 100}%` }} />
      </div>

      <ol className="hidden items-center md:flex">
        {steps.map((s, i) => {
          const hecho = i < current;
          const activo = i === current;
          return (
            <li key={s} aria-current={activo ? "step" : undefined} className={`flex items-center ${i < total - 1 ? "flex-1" : ""}`}>
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums transition-colors ${
                    hecho ? "bg-emerald-600 text-white" : activo ? "bg-brand text-white ring-4 ring-blue-100" : "border border-line-strong bg-surface text-text-subtle"
                  }`}
                  style={{ fontWeight: 650 }}
                >
                  {hecho ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                  <span className="sr-only">{hecho ? " (completado)" : activo ? " (paso actual)" : ""}</span>
                </span>
                <span className={`whitespace-nowrap text-[0.8125rem] ${activo ? "text-text" : hecho ? "hidden text-text-muted min-[1560px]:inline" : "hidden text-text-subtle min-[1560px]:inline"}`} style={{ fontWeight: activo ? 650 : 500 }}>
                  {s}
                </span>
              </span>
              {i < total - 1 && <span className={`mx-2 h-px min-w-3 flex-1 ${hecho ? "bg-emerald-500" : "bg-line"}`} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
