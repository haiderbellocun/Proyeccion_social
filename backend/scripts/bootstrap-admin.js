import { pool } from "../src/db.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = String(argument("email") || process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const firstName = String(argument("nombre") || process.env.ADMIN_NOMBRE || "").trim();
const lastName = String(argument("apellido") || process.env.ADMIN_APELLIDO || "").trim();

async function bootstrap() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Indica un correo válido con --email");
  }
  if (!firstName || !lastName) {
    throw new Error("Indica --nombre y --apellido");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id FROM usuarios WHERE LOWER(TRIM(correo)) = $1 FOR UPDATE",
      [email]
    );
    const result = existing.rowCount > 0
      ? await client.query(
          `
          UPDATE usuarios
          SET nombre = $1, apellido = $2, correo = $3, rol = 'admin', estado = 'activo'
          WHERE id = $4
          RETURNING id, nombre, apellido, correo, rol, estado
          `,
          [firstName, lastName, email, existing.rows[0].id]
        )
      : await client.query(
          `
          INSERT INTO usuarios (nombre, apellido, correo, rol, estado)
          VALUES ($1, $2, $3, 'admin', 'activo')
          RETURNING id, nombre, apellido, correo, rol, estado
          `,
          [firstName, lastName, email]
        );
    await client.query("COMMIT");
    console.log(JSON.stringify(result.rows[0], null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

bootstrap()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
