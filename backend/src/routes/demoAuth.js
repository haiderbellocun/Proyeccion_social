// Modo demostración del piloto (ver config/demo.js). Solo se monta si demoStatus().enabled y, en cada petición, la base debe ser proysocial_piloto.
// Flujo: POST /acceso (clave) → "pase" corto + lista de usuarios → POST /sesion (pase + correo) → sesión demo de SOLO LECTURA.
// No sustituye a Google OAuth ni al acceso de desarrollo, y no escribe en la base (ni siquiera ultimo_acceso).
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { SESSION_ISSUER, createDemoSessionToken, getJwtSecret, publicUser } from "../middleware/auth.js";
import { DEMO_DB, DEMO_EMAILS, claveCorrecta, crearLimitador, demoAbierto, demoDisponible, demoMotivo, demoPublico, demoStatus, ipCliente } from "../config/demo.js";

const router = express.Router();
const PASE_AUDIENCE = "proysocial-demo-pase";
const PASE_TTL = process.env.DEMO_PASE_TTL || "30m";

// Dos limitadores: por IP y global (la IP se puede variar, el total de fallos no).
const porIp = crearLimitador({ max: 5, ventanaMs: 15 * 60 * 1000 });
const limiteGlobal = crearLimitador({ max: 40, ventanaMs: 15 * 60 * 1000 });
const GLOBAL = "*";
// Modo público: tope de peticiones a /auth/demo/* por IP y de sesiones emitidas (por IP y global) para frenar abuso.
const rutasPorIp = crearLimitador({ max: 600, ventanaMs: 15 * 60 * 1000 });
const sesionesPorIp = crearLimitador({ max: 120, ventanaMs: 15 * 60 * 1000 });
const sesionesGlobal = crearLimitador({ max: 3000, ventanaMs: 15 * 60 * 1000 });
/** Sin clave: DEMO_OPEN (escribe) o DEMO_PUBLIC_READONLY (solo lectura). En ambos casos no hay pase que validar. */
const sinClave = () => demoAbierto() || demoPublico();
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

router.use(async (req, res, next) => {
  // Apagada por configuración → la ruta no existe (404). Encendida pero sin poder confirmar la base (Cloud SQL caído, credenciales rechazadas,
  // base distinta) → 503 explícito: el login lo muestra y permite reintentar, en vez de confundirlo con «demostración apagada».
  if (!demoStatus().enabled) return res.status(404).json({ error: "Ruta no encontrada" });
  if (!(await demoDisponible())) return res.status(503).json({ error: demoMotivo() || "La demostración no está disponible.", demo: true });
  if (demoPublico()) {
    const ip = ipCliente(req);
    const espera = rutasPorIp.espera(ip);
    if (espera > 0) {
      res.set("Retry-After", String(espera));
      return res.status(429).json({ error: "Demasiadas solicitudes. Inténtalo más tarde.", reintentar_en: espera });
    }
    rutasPorIp.fallo(ip); // cuenta cada petición
  }
  next();
});

async function usuariosDemo() {
  const r = await pool.query(
    `SELECT id, nombre, apellido, correo, rol, foto_url
     FROM usuarios
     WHERE estado = 'activo' AND google_sub IS NULL AND LOWER(correo) = ANY($1::text[])
     ORDER BY (rol = 'admin') DESC, nombre, apellido`,
    [DEMO_EMAILS]
  );
  return r.rows;
}

function crearPase() {
  return jwt.sign({ scope: "demo-pase" }, getJwtSecret(), { algorithm: "HS256", issuer: SESSION_ISSUER, audience: PASE_AUDIENCE, expiresIn: PASE_TTL });
}

function paseValido(req) {
  if (sinClave()) return true;
  const m = String(req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  try {
    const p = jwt.verify(m[1], getJwtSecret(), { algorithms: ["HS256"], issuer: SESSION_ISSUER, audience: PASE_AUDIENCE });
    return p.scope === "demo-pase";
  } catch {
    return false;
  }
}

// Las cinco tarjetas (nombre, apellido, correo, rol) son públicas a propósito: sin la clave no sirven para entrar (la sesión exige el pase).
// No incluye ids ni foto.
router.get("/estado", async (_req, res) => {
  let usuarios;
  try {
    usuarios = (await usuariosDemo()).map(({ nombre, apellido, correo, rol }) => ({ nombre, apellido, correo, rol }));
  } catch (error) {
    console.error("Error en GET /auth/demo/estado", error?.message);
    return res.status(503).json({ error: "No se pudieron leer los usuarios de la demostración.", demo: true });
  }
  res.json({
    habilitado: true,
    abierto: demoAbierto(),
    publico: demoPublico(),
    usuarios,
    entorno: demoAbierto()
      ? { base: DEMO_DB, datos: "sinteticos", solo_lectura: false, aviso: "Entorno de pruebas con datos sintéticos; los cambios están permitidos." }
      : { base: DEMO_DB, datos: "sinteticos", solo_lectura: true, aviso: "Entorno de demostración con datos sintéticos; solo lectura." },
  });
});

router.post("/acceso", async (req, res) => {
  if (sinClave()) {
    try {
      return res.json({ pase: crearPase(), usuarios: (await usuariosDemo()).map(publicUser) });
    } catch (error) {
      console.error("Error en POST /auth/demo/acceso", error?.message);
      return res.status(500).json({ error: "Error interno" });
    }
  }
  const ip = ipCliente(req);
  const espera = Math.max(porIp.espera(ip), limiteGlobal.espera(GLOBAL));
  if (espera > 0) {
    res.set("Retry-After", String(espera));
    return res.status(429).json({ error: "Demasiados intentos. Inténtalo más tarde.", reintentar_en: espera });
  }
  const clave = typeof req.body?.clave === "string" ? req.body.clave : "";
  if (!clave || clave.length > 200 || !claveCorrecta(clave)) {
    porIp.fallo(ip);
    limiteGlobal.fallo(GLOBAL);
    await pausa(400);
    return res.status(401).json({ error: "Clave de acceso incorrecta" });
  }
  porIp.exito(ip);
  try {
    res.json({ pase: crearPase(), usuarios: (await usuariosDemo()).map(publicUser) });
  } catch (error) {
    console.error("Error en POST /auth/demo/acceso", error?.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/usuarios", async (req, res) => {
  if (!paseValido(req)) return res.status(401).json({ error: "Acceso de demostración vencido" });
  try {
    res.json({ usuarios: (await usuariosDemo()).map(publicUser) });
  } catch (error) {
    console.error("Error en GET /auth/demo/usuarios", error?.message);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/sesion", async (req, res) => {
  if (!paseValido(req)) return res.status(401).json({ error: "Acceso de demostración vencido" });
  // Solo una cadena: un arreglo u objeto no se convierte (String(["a@b"]) coincidiría con "a@b").
  const correo = typeof req.body?.correo === "string" ? req.body.correo.trim().toLowerCase() : "";
  if (demoPublico()) {
    const ip = ipCliente(req);
    const espera = Math.max(sesionesPorIp.espera(ip), sesionesGlobal.espera(GLOBAL));
    if (espera > 0) {
      res.set("Retry-After", String(espera));
      return res.status(429).json({ error: "Demasiados inicios de sesión de demostración. Inténtalo más tarde.", reintentar_en: espera });
    }
    sesionesPorIp.fallo(ip);
    sesionesGlobal.fallo(GLOBAL);
  }
  try {
    const user = (await usuariosDemo()).find((u) => u.correo.toLowerCase() === correo);
    if (!user) return res.status(403).json({ error: "Usuario no disponible en la demostración" });
    const semestre = (await pool.query(
      `SELECT codigo, fecha_inicio, fecha_fin, numero_semanas FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`
    )).rows[0] || null;
    res.json({ token: createDemoSessionToken(user), user: publicUser(user), semestre, entorno: "demo", solo_lectura: !demoAbierto() });
  } catch (error) {
    console.error("Error en POST /auth/demo/sesion", error?.message);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
