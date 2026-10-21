// Modo DEMOSTRACIÓN del piloto (solo lectura, usuarios sintéticos). Es independiente del acceso de desarrollo (config/devLogin.js) y de Google
// OAuth. Solo existe si DEMO_ENABLED=true, hay clave configurada y la base conectada se llama exactamente "proysocial_piloto".
import crypto from "node:crypto";
import { pool } from "../db.js";

export const DEMO_DB = "proysocial_piloto";
// Lista cerrada: la demostración no puede entrar con ningún otro usuario, aunque exista en la base.
export const DEMO_EMAILS = [
  "admin@proysocial.local",
  "maria.rodriguez@proysocial.local",
  "carlos.mendoza@proysocial.local",
  "andres.torres@proysocial.local",
  "laura.gomez@proysocial.local",
];
export const DEMO_MIN_KEY_LENGTH = 12;

/** ¿Se permite montar el modo demostración? Devuelve las razones por las que NO. La base se verifica aparte, en demoDisponible(). */
export function demoStatus(env = process.env) {
  const razones = [];
  if (String(env.DEMO_ENABLED || "").toLowerCase() !== "true") razones.push("DEMO_ENABLED no es 'true'");
  if (String(env.DEV_LOGIN_ENABLED || "").toLowerCase() === "true") razones.push("DEV_LOGIN_ENABLED=true (incompatible con la demostración)");
  if (String(env.DEMO_ACCESS_KEY || "").trim().length < DEMO_MIN_KEY_LENGTH) razones.push(`DEMO_ACCESS_KEY ausente o menor de ${DEMO_MIN_KEY_LENGTH} caracteres`);
  if (String(env.JWT_SECRET || "").trim().length < 32) razones.push("JWT_SECRET menor de 32 caracteres");
  if (env.PGDATABASE && env.PGDATABASE !== DEMO_DB) razones.push(`PGDATABASE debe ser exactamente ${DEMO_DB}`);
  return { enabled: razones.length === 0, razones };
}

let baseVerificada = false;
/** Estado de entorno (variables) Y base realmente conectada. Se consulta en cada petición; la base solo se pregunta hasta confirmarla. */
export async function demoDisponible() {
  if (!demoStatus().enabled) return false;
  if (baseVerificada) return true;
  try {
    const r = await pool.query("SELECT current_database() AS d");
    baseVerificada = r.rows[0].d === DEMO_DB;
  } catch {
    baseVerificada = false;
  }
  return baseVerificada;
}

export function esUsuarioDemo(correo) {
  return DEMO_EMAILS.includes(String(correo || "").trim().toLowerCase());
}

/** Comparación en tiempo constante; compara resúmenes para no revelar la longitud de la clave. */
export function claveCorrecta(candidata, env = process.env) {
  // trim: un secreto de Secret Manager suele traer salto de línea final.
  const esperada = String(env.DEMO_ACCESS_KEY || "").trim();
  if (esperada.length < DEMO_MIN_KEY_LENGTH) return false;
  const h = (v) => crypto.createHash("sha256").update(String(v).trim()).digest();
  return crypto.timingSafeEqual(h(candidata), h(esperada));
}

/**
 * Una sesión demo es de SOLO LECTURA y no llega a administración de usuarios, correos ni importaciones. Devuelve el motivo del bloqueo o null.
 * Se evalúa en el servidor (requireAuth): ocultar botones en la interfaz no cuenta.
 */
export function demoBloqueo(method, rawPath) {
  const m = String(method || "").toUpperCase();
  let p = String(rawPath || "").split("?")[0];
  try { p = decodeURIComponent(p); } catch { /* ruta mal codificada: se evalúa tal cual */ }
  p = p.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (m === "POST" && p === "/auth/logout") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(m)) return "Modo demostración: solo lectura. Esta acción no está disponible.";
  if (/^\/admin\/(usuarios|correos|importaciones)(\/|$)/.test(p)) return "Modo demostración: esta sección administrativa no está disponible.";
  return null;
}

/** Limitador de intentos fallidos: tras `max` fallos dentro de la ventana, bloquea hasta que ésta venza. En memoria (por instancia). */
export function crearLimitador({ max, ventanaMs, ahora = () => Date.now() }) {
  const fallos = new Map();
  const vigente = (clave) => {
    const e = fallos.get(clave);
    if (e && ahora() - e.desde >= ventanaMs) {
      fallos.delete(clave);
      return null;
    }
    return e || null;
  };
  return {
    /** Segundos de espera restantes si está bloqueado; 0 si puede intentar. */
    espera(clave) {
      const e = vigente(clave);
      return e && e.n >= max ? Math.max(1, Math.ceil((e.desde + ventanaMs - ahora()) / 1000)) : 0;
    },
    fallo(clave) {
      const e = vigente(clave);
      if (e) e.n += 1;
      else fallos.set(clave, { n: 1, desde: ahora() });
      if (fallos.size > 5000) fallos.delete(fallos.keys().next().value);
    },
    exito(clave) { fallos.delete(clave); },
  };
}

/** IP del cliente. Detrás de Cloud Run el último valor de X-Forwarded-For lo añade Google (los anteriores los puede inventar el cliente). */
export function ipCliente(req) {
  const xff = String(req.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String(req.socket?.remoteAddress || "desconocida");
}
