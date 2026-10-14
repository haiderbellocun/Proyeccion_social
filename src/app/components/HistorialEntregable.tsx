import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { formatDateTimeBogota } from "../lib/date";

export interface EventoEntregable {
  id: number;
  tipo: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string | null;
  creado_en: string;
  actor_nombre: string | null;
  actor_rol: string | null;
  detalle: { envio_numero?: number; motivo?: string; evidencias?: { id: number; url: string }[] } | null;
}

export const EVENTO: Record<string, string> = {
  envio: "Enviado a revisión",
  reenvio: "Reenviado tras la corrección",
  retiro: "Envío retirado por el docente",
  observacion: "Observado por el revisor",
  sin_acceso: "Coordinación no pudo abrir la evidencia",
  aprobacion: "Aprobado",
  reapertura: "Reabierto por coordinación",
};

/** Línea de tiempo de un entregable. `ruta` = endpoint de historial (docente o administración). */
export function HistorialEntregable({ ruta }: { ruta: string }) {
  const [eventos, setEventos] = useState<EventoEntregable[] | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError(false);
      const res = await fetch(`${API_BASE}${ruta}`);
      if (!res.ok) throw new Error();
      setEventos(((await res.json()) as { eventos: EventoEntregable[] }).eventos);
    } catch {
      setError(true);
    }
  }, [ruta]);

  useEffect(() => {
    setEventos(null);
    void cargar();
  }, [cargar]);

  return (
    <div aria-live="polite">
      {!eventos && !error && (
        <p className="text-xs text-gray-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando historial…</p>
      )}
      {error && (
        <p className="text-xs text-red-600">
          No se pudo cargar el historial.{" "}
          <button type="button" onClick={() => void cargar()} className="underline">Reintentar</button>
        </p>
      )}
      {eventos && eventos.length === 0 && <p className="text-xs text-gray-500">Todavía no hay movimientos.</p>}
      {eventos && eventos.length > 0 && (
        <ol className="space-y-2">
          {eventos.map((ev) => (
            <li key={ev.id} className="flex gap-2 text-xs text-gray-700">
              <Clock className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${ev.tipo === "sin_acceso" ? "text-amber-500" : "text-gray-400"}`} />
              <div>
                <p>
                  <span style={{ fontWeight: 600 }}>{EVENTO[ev.tipo] ?? ev.tipo}</span>
                  {ev.detalle?.envio_numero ? ` (envío ${ev.detalle.envio_numero})` : ""}
                  {" · "}{formatDateTimeBogota(ev.creado_en)}
                  {ev.actor_nombre ? ` · ${ev.actor_nombre}${ev.actor_rol === "admin" ? " (coordinación)" : ""}` : ""}
                </p>
                {ev.detalle?.evidencias && ev.detalle.evidencias.length > 0 && (
                  <p className="text-gray-500">{ev.detalle.evidencias.length} enlace(s) de evidencia</p>
                )}
                {ev.comentario && <p className="text-gray-600">«{ev.comentario}»</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
