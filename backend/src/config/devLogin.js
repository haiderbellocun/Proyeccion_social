// Acceso de desarrollo LOCAL. Nunca aplica en producción: se decide en el servidor con
// variables del servidor (no hay forma de activarlo desde el frontend) y exige una base
// llamada exactamente "proysocial_dev" en el equipo local.
export const DEV_DB = "proysocial_dev";
export const DEV_EMAIL_DOMAIN = "@proysocial.local";
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

/** ¿Se permite montar las rutas de acceso de desarrollo? Devuelve las razones por las que NO. */
export function devLoginStatus(env = process.env) {
  const razones = [];
  if (String(env.NODE_ENV || "").toLowerCase() === "production") razones.push("NODE_ENV=production");
  if (String(env.DEV_LOGIN_ENABLED || "").toLowerCase() !== "true") razones.push("DEV_LOGIN_ENABLED no es 'true'");
  if (env.DATABASE_URL) razones.push("DATABASE_URL definido (conexión remota)");
  if (env.INSTANCE_CONNECTION_NAME || env.K_SERVICE) razones.push("entorno Cloud");
  if (String(env.PGSSL || "").toLowerCase() === "true") razones.push("PGSSL=true");
  if (!LOOPBACK.has(String(env.PGHOST || "localhost").toLowerCase())) razones.push("PGHOST no es local");
  if (env.PGDATABASE !== DEV_DB) razones.push(`PGDATABASE debe ser exactamente ${DEV_DB}`);
  if (String(env.DEV_LOGIN_EMAILS || "").trim() === "") razones.push("DEV_LOGIN_EMAILS vacío (lista explícita de usuarios)");
  return { enabled: razones.length === 0, razones };
}

export function devEmails(env = process.env) {
  return String(env.DEV_LOGIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.endsWith(DEV_EMAIL_DOMAIN));
}

/** La petición debe venir del propio equipo y sin proxy. */
export function esPeticionLocal(req) {
  const addr = String(req.socket?.remoteAddress || "");
  const host = String(req.hostname || "").toLowerCase();
  return LOOPBACK.has(addr) && LOOPBACK.has(host) && !req.get("x-forwarded-for");
}
