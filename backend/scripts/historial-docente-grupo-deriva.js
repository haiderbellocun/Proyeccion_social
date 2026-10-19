// Comprobación (SOLO LECTURA) de coherencia entre el historial docente–grupo y su espejo `usuarios.grupo_matriz_id` (AL-01, Fase A/B).
// Mientras la aplicación no escriba el historial (Fase A), cualquier reasignación hecha por los endpoints actuales deja una «deriva»;
// con la doble escritura (Fase B) debe ser siempre 0. No escribe nada: corre en una transacción READ ONLY.
// Uso (desde backend/):  node --env-file=.env.dev scripts/historial-docente-grupo-deriva.js
import { pool } from "../src/db.js";

const client = await pool.connect();
let codigo = 0;
try {
  await client.query("BEGIN READ ONLY");
  const base = (await client.query("SELECT current_database() AS d")).rows[0].d;
  const existe = (await client.query("SELECT to_regclass('docente_grupo_matriz') AS t")).rows[0].t;
  if (!existe) {
    console.log(`Base ${base}: la migración fase28 NO está aplicada (no existe docente_grupo_matriz). Nada que comprobar.`);
  } else {
    const deriva = (await client.query(
      `SELECT u.id AS docente_id, TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS docente, u.grupo_matriz_id AS espejo, a.grupo_id AS historial_vigente
       FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente
       WHERE u.rol = 'docente' AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id ORDER BY u.id`
    )).rows;
    const dobles = (await client.query(`SELECT docente_id, COUNT(*)::int AS n FROM docente_grupo_matriz WHERE vigente GROUP BY docente_id HAVING COUNT(*) > 1`)).rows;
    const incidencias = (await client.query(`SELECT tipo, estado, COUNT(*)::int AS n FROM docente_grupo_matriz_incidencias GROUP BY tipo, estado ORDER BY tipo, estado`)).rows;
    console.log(`Base ${base}: ${deriva.length} docente(s) con deriva, ${dobles.length} con más de una vigente (debe ser 0).`);
    for (const d of deriva) console.log(`  docente ${d.docente_id} (${d.docente}): usuarios.grupo_matriz_id=${d.espejo ?? "NULL"} · historial vigente=${d.historial_vigente ?? "ninguna"}`);
    console.log("Incidencias del backfill:", JSON.stringify(incidencias));
    if (deriva.length || dobles.length) codigo = 3;
  }
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}
process.exit(codigo);
