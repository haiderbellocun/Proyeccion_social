import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

// Postgres con SCRAM exige que password sea string; si está vacío usamos undefined para "sin contraseña"
const pgPassword = process.env.PGPASSWORD;
const password = pgPassword !== undefined && pgPassword !== "" ? String(pgPassword) : undefined;

export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "app_proyecion",
  user: process.env.PGUSER || "postgres",
  password,
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

