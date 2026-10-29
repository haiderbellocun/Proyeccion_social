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

/** Modo abierto (DEMO_OPEN=true): se elige usuario sin clave y la sesión puede escribir. Solo para datos sintéticos de pruebas con revisores. */
export function demoAbierto(env = process.env) {
  return String(env.DEMO_OPEN || "").toLowerCase() === "true";
}

/**
 * Acceso PÚBLICO de solo lectura (DEMO_PUBLIC_READONLY=true): cualquiera con el enlace elige uno de los cinco perfiles sintéticos SIN clave.
 * La ausencia de clave no da escritura: las sesiones siguen siendo "demo" (solo lectura, bloqueo en requireAuth). Es incompatible con
 * DEMO_OPEN (que sí escribe) y solo se mantiene mientras la base contenga exclusivamente los cinco usuarios sintéticos (ver demoDisponible).
 */
export function demoPublico(env = process.env) {
  return String(env.DEMO_PUBLIC_READONLY || "").toLowerCase() === "true";
}

/** ¿Se permite montar el modo demostración? Devuelve las razones por las que NO. La base se verifica aparte, en demoDisponible(). */
export function demoStatus(env = process.env) {
  const razones = [];
  if (String(env.DEMO_ENABLED || "").toLowerCase() !== "true") razones.push("DEMO_ENABLED no es 'true'");
  if (String(env.DEV_LOGIN_ENABLED || "").toLowerCase() === "true") razones.push("DEV_LOGIN_ENABLED=true (incompatible con la demostración)");
  if (demoPublico(env) && demoAbierto(env)) razones.push("DEMO_PUBLIC_READONLY es incompatible con DEMO_OPEN (el acceso público nunca puede escribir)");
  if (!demoAbierto(env) && !demoPublico(env) && String(env.DEMO_ACCESS_KEY || "").trim().length < DEMO_MIN_KEY_LENGTH) razones.push(`DEMO_ACCESS_KEY ausente o menor de ${DEMO_MIN_KEY_LENGTH} caracteres`);
  if (String(env.JWT_SECRET || "").trim().length < 32) razones.push("JWT_SECRET menor de 32 caracteres");
  if (env.PGDATABASE && env.PGDATABASE !== DEMO_DB) razones.push(`PGDATABASE debe ser exactamente ${DEMO_DB}`);
  return { enabled: razones.length === 0, razones };
}

let baseVerificada = false;
let motivoNoDisponible = "";
let datosVerificados = { ok: false, hasta: 0 };
const DATOS_TTL_MS = () => Number(process.env.DEMO_DATOS_TTL_MS || 60000);

/** Último motivo por el que demoDisponible() devolvió false (para un mensaje claro al usuario; no incluye datos internos). */
export function demoMotivo() {
  return motivoNoDisponible;
}

/**
 * Acceso público: la base solo puede tener los cinco usuarios sintéticos (activos o no), todos sin cuenta de Google vinculada. Si aparece
 * cualquier otro usuario (datos reales) el acceso público se apaga solo. Se reevalúa cada minuto (DEMO_DATOS_TTL_MS).
 */
async function soloDatosSinteticos() {
  if (Date.now() < datosVerificados.hasta) return datosVerificados.ok;
  const r = await pool.query(
    "SELECT COUNT(*)::int AS otros FROM usuarios WHERE LOWER(correo) <> ALL($1::text[]) OR google_sub IS NOT NULL",
    [DEMO_EMAILS]
  );
  datosVerificados = { ok: r.rows[0].otros === 0, hasta: Date.now() + DATOS_TTL_MS() };
  return datosVerificados.ok;
}

/** Estado de entorno (variables) Y base realmente conectada. Se consulta en cada petición; la base solo se pregunta hasta confirmarla. */
export async function demoDisponible() {
  motivoNoDisponible = "";
  if (!demoStatus().enabled) return false;
  try {
    if (!baseVerificada) {
      const r = await pool.query("SELECT current_database() AS d");
      baseVerificada = r.rows[0].d === DEMO_DB;
      if (!baseVerificada) {
        motivoNoDisponible = "La base conectada no es la del piloto.";
        return false;
      }
    }
    if (demoPublico() && !(await soloDatosSinteticos())) {
      motivoNoDisponible = "El acceso público de demostración está deshabilitado: la base contiene usuarios distintos de los sintéticos.";
      return false;
    }
  } catch {
    baseVerificada = false;
    motivoNoDisponible = "La base de datos no está disponible para la demostración. Inténtalo de nuevo en unos minutos.";
    return false;
  }
  return true;
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
export function demoBloqueo(method, rawPath, env = process.env) {
  if (demoAbierto(env)) return null;
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
