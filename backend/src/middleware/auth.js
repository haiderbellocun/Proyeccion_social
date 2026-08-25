import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const SESSION_ISSUER = "proysocial-api";
const SESSION_AUDIENCE = "proysocial-web";

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret.length < 32) {
    const error = new Error("JWT_SECRET debe tener al menos 32 caracteres");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return secret;
}

export function publicUser(user) {
  return {
    id: Number(user.id),
    nombre: user.nombre,
    apellido: user.apellido,
    correo: user.correo,
    rol: user.rol,
    foto_url: user.foto_url || null,
  };
}

export function createSessionToken(user) {
  return jwt.sign(
    { email: user.correo, role: user.rol },
    getJwtSecret(),
    {
      algorithm: "HS256",
      subject: String(user.id),
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      expiresIn: process.env.SESSION_TTL || "8h",
    }
  );
}

export async function requireAuth(req, res, next) {
  const header = String(req.get("authorization") || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Debes iniciar sesión" });
  }

  try {
    const payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Sesión inválida" });
    }

    // El rol y el estado se consultan en cada petición para que un cambio en
    // administración revoque los permisos sin esperar a que venza el token.
    const result = await pool.query(
      `
      SELECT id, nombre, apellido, correo, rol, estado, foto_url
      FROM usuarios
      WHERE id = $1
        AND estado = 'activo'
        AND rol IN ('admin', 'docente')
      `,
      [userId]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "La sesión ya no está autorizada" });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error?.code === "AUTH_NOT_CONFIGURED") {
      console.error(error.message);
      return res.status(503).json({ error: "Autenticación no configurada" });
    }
    return res.status(401).json({ error: "Sesión inválida o vencida" });
  }
}

export function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user || !allowed.has(req.user.rol)) {
      return res.status(403).json({ error: "No tienes permisos para esta acción" });
    }
    next();
  };
}
