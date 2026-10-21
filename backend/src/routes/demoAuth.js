// Modo demostración del piloto (ver config/demo.js). Solo se monta si demoStatus().enabled y, en cada petición, la base debe ser proysocial_piloto.
// Flujo: POST /acceso (clave) → "pase" corto + lista de usuarios → POST /sesion (pase + correo) → sesión demo de SOLO LECTURA.
// No sustituye a Google OAuth ni al acceso de desarrollo, y no escribe en la base (ni siquiera ultimo_acceso).
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { SESSION_ISSUER, createDemoSessionToken, getJwtSecret, publicUser } from "../middleware/auth.js";
import { DEMO_DB, DEMO_EMAILS, claveCorrecta, crearLimitador, demoDisponible, ipCliente } from "../config/demo.js";

const router = express.Router();
const PASE_AUDIENCE = "proysocial-demo-pase";
const PASE_TTL = process.env.DEMO_PASE_TTL || "30m";

// Dos limitadores: por IP y global (la IP se puede variar, el total de fallos no).
const porIp = crearLimitador({ max: 5, ventanaMs: 15 * 60 * 1000 });
const limiteGlobal = crearLimitador({ max: 40, ventanaMs: 15 * 60 * 1000 });
const GLOBAL = "*";
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

router.use(async (_req, res, next) => {
  if (!(await demoDisponible())) return res.status(404).json({ error: "Ruta no encontrada" });
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
  const m = String(req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  try {
    const p = jwt.verify(m[1], getJwtSecret(), { algorithms: ["HS256"], issuer: SESSION_ISSUER, audience: PASE_AUDIENCE });
    return p.scope === "demo-pase";
  } catch {
    return false;
  }
}

router.get("/estado", (_req, res) => {
  res.json({
    habilitado: true,
    entorno: { base: DEMO_DB, datos: "sinteticos", solo_lectura: true, aviso: "Entorno de demostración con datos sintéticos; solo lectura." },
  });
});

router.post("/acceso", async (req, res) => {
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
  const correo = String(req.body?.correo || "").trim().toLowerCase();
  try {
    const user = (await usuariosDemo()).find((u) => u.correo.toLowerCase() === correo);
    if (!user) return res.status(403).json({ error: "Usuario no disponible en la demostración" });
    const semestre = (await pool.query(
      `SELECT codigo, fecha_inicio, fecha_fin, numero_semanas FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`
    )).rows[0] || null;
    res.json({ token: createDemoSessionToken(user), user: publicUser(user), semestre, entorno: "demo", solo_lectura: true });
  } catch (error) {
    console.error("Error en POST /auth/demo/sesion", error?.message);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
