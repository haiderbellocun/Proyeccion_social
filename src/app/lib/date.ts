const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Convierte fechas de la API (incluidos timestamps ISO de PostgreSQL) al
 * formato estable que esperan los controles `type="date"`.
 */
export function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  const match = text.match(DATE_ONLY_PREFIX);
  if (!match) return null;

  const candidate = match[1];
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

export function formatDateOnly(value: unknown): string {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return "—";
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Instante (timestamptz) en hora institucional America/Bogota. */
export function formatDateTimeBogota(value: unknown): string {
  if (value == null || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
