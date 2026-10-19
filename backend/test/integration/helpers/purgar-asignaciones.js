// Ayuda de pruebas: el historial de asignaciones es inmutable y sus claves foráneas son RESTRICT (un docente con historial no se elimina).
// Las suites crean fixtures con prefijo propio y deben poder retirarlos al terminar: este helper borra, en UNA transacción y solo para
// bases de pruebas, las filas del historial que tocan a los usuarios o grupos indicados, desactivando los triggers de protección con
// `session_replication_role = replica` (requiere superusuario, como en proysocial_test). Nunca se usa en código de la aplicación.

/**
 * Elimina del historial (filas, cambios e incidencias) todo lo que referencia a usuarios con correo `LIKE usuarioLike`
 * o a grupos del semestre `semestre`, y opcionalmente los propios usuarios.
 */
export async function purgarAsignaciones(pool, { usuarioLike = null, semestre = null, borrarUsuarios = false }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const db = (await client.query("SELECT current_database() AS d")).rows[0].d;
    if (!["proysocial_test", "proysocial_dev"].includes(db)) throw new Error(`purgarAsignaciones: base no permitida (${db})`);
    if (!(await client.query("SELECT to_regclass('docente_grupo_matriz') AS t")).rows[0].t) { await client.query("ROLLBACK"); return; }
    await client.query("SET LOCAL session_replication_role = replica");
    // Ambos subconsultas referencian $1 y $2 (patrón vacío = no coincide con nada).
    const usuarios = `(SELECT id FROM usuarios WHERE $1::text <> '' AND correo ILIKE $1::text)`;
    const grupos = `(SELECT id FROM grupos_matriz WHERE $2::text <> '' AND semestre = $2::text)`;
    const params = [usuarioLike ?? "", semestre ?? ""];
    await client.query(
      `DELETE FROM docente_grupo_matriz_cambios WHERE docente_id IN ${usuarios} OR cambiado_por IN ${usuarios}
         OR grupo_anterior_id IN ${grupos} OR grupo_nuevo_id IN ${grupos}`, params
    );
    await client.query(`DELETE FROM docente_grupo_matriz_incidencias WHERE docente_id IN ${usuarios} AND $2::text IS NOT NULL`, params);
    await client.query(`DELETE FROM docente_grupo_matriz WHERE docente_id IN ${usuarios} OR grupo_id IN ${grupos}`, params);
    if (borrarUsuarios && usuarioLike) await client.query(`DELETE FROM usuarios WHERE correo ILIKE $1`, [usuarioLike]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
