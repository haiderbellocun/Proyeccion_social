import express from "express";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db.js";
import {
  createSessionToken,
  publicUser,
  requireAuth,
} from "../middleware/auth.js";

const router = express.Router();
const googleClient = new OAuth2Client();
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function toDateOnly(value) {
  if (value == null) return null;
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function allowedGoogleDomains() {
  return String(process.env.ALLOWED_GOOGLE_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function isTrustedGooglePhotoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (hostname === "googleusercontent.com" ||
        hostname.endsWith(".googleusercontent.com"))
    );
  } catch {
    return false;
  }
}

router.post("/google", async (req, res) => {
  const credential = String(req.body?.credential || "").trim();
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();

  if (!clientId) {
    return res.status(503).json({ error: "GOOGLE_CLIENT_ID no está configurado" });
  }
  if (!credential) {
    return res.status(400).json({ error: "credential de Google es requerido" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.warn("Google rechazó una credencial de inicio de sesión", error?.message);
    return res.status(401).json({ error: "Token de Google inválido o vencido" });
  }

  const googleSub = String(payload?.sub || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();

  if (!googleSub || !email || payload?.email_verified !== true) {
    return res.status(401).json({ error: "La cuenta de Google no pudo verificarse" });
  }

  const domains = allowedGoogleDomains();
  if (domains.length > 0) {
    const hostedDomain = String(payload?.hd || "").trim().toLowerCase();
    if (!hostedDomain || !domains.includes(hostedDomain)) {
      return res.status(403).json({ error: "La cuenta no pertenece a un dominio autorizado" });
    }
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `
      SELECT id, nombre, apellido, correo, rol, estado, google_sub, foto_url
      FROM usuarios
      WHERE google_sub = $1
         OR LOWER(TRIM(correo)) = $2
      ORDER BY (google_sub = $1) DESC
      LIMIT 1
      FOR UPDATE
      `,
      [googleSub, email]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "Tu cuenta de Google aún no está autorizada en ProySocial",
      });
    }

    let user = result.rows[0];
    if (user.estado !== "activo") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Tu usuario está inactivo" });
    }
    if (user.google_sub && user.google_sub !== googleSub) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "El correo está vinculado a otra cuenta de Google",
      });
    }

    const updated = await client.query(
      `
      UPDATE usuarios
      SET google_sub = $1,
          foto_url = $2,
          ultimo_acceso = NOW()
      WHERE id = $3
      RETURNING id, nombre, apellido, correo, rol, foto_url
      `,
      [googleSub, payload?.picture || null, user.id]
    );
    user = updated.rows[0];
    const token = createSessionToken(user);
    await client.query("COMMIT");

    res.json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("Error en POST /auth/google", error);
    if (String(error?.message || "").includes("JWT_SECRET")) {
      return res.status(503).json({ error: "Autenticación no configurada" });
    }
    res.status(500).json({ error: "No fue posible completar el inicio de sesión" });
  } finally {
    client?.release();
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const semesterResult = await pool.query(
      `
      SELECT codigo, fecha_inicio, fecha_fin, numero_semanas
      FROM semestres
      WHERE activo = TRUE
      ORDER BY fecha_inicio DESC
      LIMIT 1
      `
    );
    const semester = semesterResult.rows[0] || null;
    res.json({
      user: publicUser(req.user),
      semestre: semester
        ? {
            ...semester,
            fecha_inicio: toDateOnly(semester.fecha_inicio),
            fecha_fin: toDateOnly(semester.fecha_fin),
          }
        : null,
    });
  } catch (error) {
    console.error("Error en GET /auth/me", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/avatar", requireAuth, async (req, res) => {
  const photoUrl = String(req.user?.foto_url || "").trim();
  if (!photoUrl) {
    return res.status(404).json({ error: "El usuario no tiene una foto de perfil" });
  }
  if (!isTrustedGooglePhotoUrl(photoUrl)) {
    return res.status(422).json({ error: "La foto de perfil no tiene un origen permitido" });
  }

  try {
    const upstream = await fetch(photoUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
        "User-Agent": "ProySocial/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "Google no pudo entregar la foto de perfil" });
    }

    const contentType = String(upstream.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (!contentType.startsWith("image/") || declaredLength > MAX_AVATAR_BYTES) {
      return res.status(502).json({ error: "La respuesta de la foto no es válida" });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
      return res.status(502).json({ error: "La foto de perfil excede el tamaño permitido" });
    }

    res.vary("Authorization");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.type(contentType);
    return res.send(bytes);
  } catch (error) {
    console.warn("No fue posible obtener la foto de perfil de Google", error?.message);
    return res.status(502).json({ error: "No fue posible cargar la foto de perfil" });
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  res.status(204).send();
});

export default router;
