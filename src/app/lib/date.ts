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
