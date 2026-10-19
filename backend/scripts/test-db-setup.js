// Prepara la base de PRUEBAS DE INTEGRACIÓN LOCAL: proysocial_test (aislada de proysocial_dev y de producción).
//
//   npm run test:db:setup            crea la base si no existe y aplica las migraciones (idempotente)
//   npm run test:db:setup -- --reset elimina y recrea SOLO la base proysocial_test
//
// Reglas de seguridad:
//  - Solo el servidor PostgreSQL local (sin DATABASE_URL ni Cloud SQL).
//  - Solo toca la base llamada exactamente "proysocial_test". Nunca crea, borra ni modifica proysocial_dev u otras.
//  - No copia datos de otras bases: el esquema sale de las migraciones actuales (las pruebas crean sus propios datos sintéticos).
//  - No imprime secretos. Genera backend/.env.test (ignorado por git) sin contraseña: la credencial de PostgreSQL
//    sigue saliendo de backend/.env, igual que en el resto de scripts.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const TEST_DB = "proysocial_test";
const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "..");
const reset = process.argv.includes("--reset");

const host = String(process.env.PGHOST || "localhost").toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(host) || process.env.DATABASE_URL || process.env.INSTANCE_CONNECTION_NAME) {
  console.error("Rechazado: la base de pruebas solo puede crearse en el servidor PostgreSQL local (sin DATABASE_URL).");
  process.exit(1);
}
const conn = {
  host,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined,
};

const admin = new pkg.Client({ ...conn, database: "postgres" });
await admin.connect();
const existe = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB])).rowCount > 0;
if (existe && reset) {
  await admin.query(`DROP DATABASE ${TEST_DB} WITH (FORCE)`);
  console.log(`Base ${TEST_DB} eliminada (--reset).`);
}
if (!existe || reset) {
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  console.log(`Base ${TEST_DB} creada.`);
} else {
  console.log(`Base ${TEST_DB} ya existe: se conserva.`);
}
await admin.end();

// Migraciones con el ejecutor de siempre, apuntando solo a proysocial_test
// La base de pruebas aplica TODAS las migraciones, incluida la fase28 (compuerta de migrate.js), para probar el código nuevo.
const env = { ...process.env, PGDATABASE: TEST_DB, PGHOST: host, DATABASE_URL: "", INSTANCE_CONNECTION_NAME: "", PROYSOCIAL_APLICAR_FASE28: "1" };
const mig = spawnSync(process.execPath, ["scripts/migrate.js"], { cwd: backendDir, env, stdio: "inherit" });
if (mig.status !== 0) process.exit(mig.status ?? 1);

const envPath = path.join(backendDir, ".env.test");
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    [
      "# Entorno de PRUEBAS DE INTEGRACIÓN (generado por npm run test:db:setup). Ignorado por git. La credencial de PostgreSQL sale de backend/.env.",
      "NODE_ENV=test",
      `PGHOST=${host}`,
      `PGPORT=${conn.port}`,
      `PGDATABASE=${TEST_DB}`,
      "DATABASE_URL=",
      "INSTANCE_CONNECTION_NAME=",
      `JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`,
      "EMAIL_ENABLED=false",
      "SMTP_HOST=",
      "",
    ].join("\n")
  );
  console.log("Creado backend/.env.test.");
}
console.log(`Listo. Ejecute: npm run test:integration:protegidos`);
