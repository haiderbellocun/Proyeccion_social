// Fechas institucionales: siempre America/Bogota. Las fechas "de calendario" llegan del
// backend como YYYY-MM-DD y se muestran sin pasar por la zona horaria del navegador.
export const ZONA_HORARIA = "America/Bogota";

/** Fecha civil de hoy (YYYY-MM-DD) en Bogotá; usar solo como respaldo: la fuente de verdad es `hoy` del backend. */
export function hoyBogota(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Formatea una fecha YYYY-MM-DD (o ISO) sin desplazar el día. */
export function formatFecha(
  iso: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  if (!iso) return "—";
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(soloFecha ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { ...opciones, timeZone: soloFecha ? "UTC" : ZONA_HORARIA });
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
