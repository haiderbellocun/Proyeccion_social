// SOLO desarrollo local (ver config/devLogin.js). Se monta únicamente si devLoginStatus().enabled.
// Permite entrar con usuarios SINTÉTICOS (@proysocial.local) de la base proysocial_dev.
// No sustituye a Google OAuth: las rutas /auth/google y la verificación JWT no cambian.
import express from "express";
import { pool } from "../db.js";
import { createSessionToken, publicUser } from "../middleware/auth.js";
import { DEV_DB, devEmails, devLoginStatus, esPeticionLocal } from "../config/devLogin.js";

const router = express.Router();

router.use(async (req, res, next) => {
  // Se vuelve a comprobar en cada petición (defensa en profundidad).
  if (!devLoginStatus().enabled || !esPeticionLocal(req)) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  try {
    const db = await pool.query("SELECT current_database() AS d");
    if (db.rows[0].d !== DEV_DB) return res.status(404).json({ error: "Ruta no encontrada" });
  } catch {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  next();
});

async function usuariosPermitidos() {
  const r = await pool.query(
    `SELECT id, nombre, apellido, correo, rol, foto_url
     FROM usuarios
     WHERE estado = 'activo' AND google_sub IS NULL AND LOWER(correo) = ANY($1::text[])
     ORDER BY (rol = 'admin') DESC, nombre`,
    [devEmails()]
  );
  return r.rows;
}

router.get("/usuarios", async (_req, res) => {
  try {
    res.json({
      entorno: { base: DEV_DB, datos: "sinteticos", aviso: "Base de pruebas local con datos sintéticos; no es producción." },
      usuarios: (await usuariosPermitidos()).map(publicUser),
    });
  } catch (error) {
    console.error("Error en GET /auth/dev/usuarios", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/login", async (req, res) => {
  const correo = String(req.body?.correo || "").trim().toLowerCase();
  try {
    const user = (await usuariosPermitidos()).find((u) => u.correo.toLowerCase() === correo);
    if (!user) return res.status(403).json({ error: "Usuario no habilitado para acceso de desarrollo" });
    await pool.query("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1", [user.id]);
    const semestre = (await pool.query(
      `SELECT codigo, fecha_inicio, fecha_fin, numero_semanas FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`
    )).rows[0] || null;
    res.json({ token: createSessionToken(user), user: publicUser(user), semestre, entorno: "dev-local" });
  } catch (error) {
    console.error("Error en POST /auth/dev/login", error);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
