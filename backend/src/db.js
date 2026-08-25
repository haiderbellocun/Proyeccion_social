import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

// Postgres con SCRAM exige que password sea string; si está vacío usamos undefined para "sin contraseña"
const pgPassword = process.env.PGPASSWORD;
const password = pgPassword !== undefined && pgPassword !== "" ? String(pgPassword) : undefined;

const cloudSqlHost = process.env.INSTANCE_CONNECTION_NAME
  ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`
  : null;
const ssl = String(process.env.PGSSL || "").toLowerCase() === "true"
  ? { rejectUnauthorized: false }
  : undefined;

const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl }
  : {
      host: cloudSqlHost || process.env.PGHOST || "localhost",
      port: cloudSqlHost ? undefined : Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "proyeccion-social",
      user: process.env.PGUSER || "postgres",
      password,
      ssl: cloudSqlHost ? undefined : ssl,
    };

export const pool = new Pool({
  ...connectionConfig,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

