import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import { markNotificationsAsRead } from "../src/services/notificationService.js";

const teacherResult = await pool.query(
  `
  SELECT id
  FROM usuarios
  WHERE rol = 'docente' AND estado = 'activo'
  ORDER BY id
  LIMIT 1
  `
);

if (teacherResult.rowCount === 0) {
  console.log("Prueba omitida: no existe un docente activo");
  await pool.end();
  process.exit(0);
}

const teacherId = Number(teacherResult.rows[0].id);
let notificationId = null;
let notificationKey = null;

try {
  const inserted = await pool.query(
    `
    INSERT INTO notificaciones (
      usuario_id, tipo, mensaje, referencia_tipo
    )
    VALUES ($1, 'mensaje_admin', $2, 'prueba_automatica')
    RETURNING id
    `,
    [teacherId, `Prueba automática ${randomUUID()}`]
  );
  notificationId = Number(inserted.rows[0].id);
  notificationKey = `persistente:${notificationId}`;

  const marked = await markNotificationsAsRead(teacherId, [
    {
      clave: notificationKey,
      tipo: "mensaje_admin",
      referencia_id: notificationId,
    },
  ]);
  if (marked !== 1) throw new Error(`Se esperaba una lectura y se registraron ${marked}`);

  const verified = await pool.query(
    `
    SELECT n.leida, l.leida_en
    FROM notificaciones n
    JOIN notificacion_lecturas l
      ON l.usuario_id = n.usuario_id AND l.clave = $2
    WHERE n.id = $1
    `,
    [notificationId, notificationKey]
  );
  if (verified.rowCount !== 1 || verified.rows[0].leida !== true) {
    throw new Error("La notificación no quedó marcada como leída");
  }

  console.log("Prueba de lectura persistente de notificaciones: OK");
} finally {
  if (notificationKey) {
    await pool.query(
      "DELETE FROM notificacion_correos WHERE usuario_id = $1 AND clave = $2",
      [teacherId, notificationKey]
    ).catch(() => {});
    await pool.query(
      "DELETE FROM notificacion_lecturas WHERE usuario_id = $1 AND clave = $2",
      [teacherId, notificationKey]
    );
  }
  if (notificationId) {
    await pool.query("DELETE FROM notificaciones WHERE id = $1", [notificationId]);
  }
  await pool.end();
}
