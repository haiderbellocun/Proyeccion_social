// Rellena entregable_evidencias con los enlaces anteriores al Bloque 3 (url_evidencia). Idempotente: no repite lo ya migrado.
//   npm run evidencias:backfill
import "dotenv/config";
import { pool } from "../src/db.js";
import { rellenarEvidenciasExistentes } from "../src/services/evidenciaService.js";

const db = (await pool.query("SELECT current_database() AS d")).rows[0].d;
console.log(`Base de datos: ${db}`);
const r = await rellenarEvidenciasExistentes(pool);
console.log(`Entregables procesados: ${r.entregables} · evidencias creadas: ${r.evidencias}`);
await pool.end();
