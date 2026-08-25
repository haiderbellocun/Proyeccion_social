import "dotenv/config";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { createSessionToken } from "../src/middleware/auth.js";

const api = `http://127.0.0.1:${Number(process.env.PORT || 4000)}`;

try {
  const result = await pool.query(
    `
    SELECT id, nombre, apellido, correo, rol
    FROM usuarios
    WHERE estado = 'activo'
      AND foto_url IS NOT NULL
      AND foto_url <> ''
    ORDER BY (rol = 'docente') DESC, id
    LIMIT 1
    `
  );
  assert.equal(result.rowCount, 1, "Se requiere un usuario activo con foto de Google");

  const response = await fetch(`${api}/auth/avatar`, {
    headers: { Authorization: `Bearer ${createSessionToken(result.rows[0])}` },
  });
  const contentType = String(response.headers.get("content-type") || "");
  const bytes = Buffer.from(await response.arrayBuffer());

  assert.equal(response.status, 200, `Avatar devolvió HTTP ${response.status}`);
  assert.match(contentType, /^image\//, "El avatar debe responder con una imagen");
  assert.ok(bytes.length > 0, "La imagen del avatar no puede estar vacía");
  console.log("Prueba de foto de perfil: OK");
} finally {
  await pool.end();
}
