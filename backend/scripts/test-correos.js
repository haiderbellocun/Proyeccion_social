import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";
import {
  enqueueDailyDigests,
  enqueueEmailForUser,
  processEmailQueue,
  renderNotificationEmail,
} from "../src/services/emailService.js";

const userResult = await pool.query(
  `
  SELECT id, correo
  FROM usuarios
  WHERE estado = 'activo' AND NULLIF(TRIM(correo), '') IS NOT NULL
  ORDER BY id
  LIMIT 1
  `
);

if (userResult.rowCount === 0) {
  console.log("Prueba omitida: no existe un usuario activo con correo");
  await pool.end();
  process.exit(0);
}

const userId = Number(userResult.rows[0].id);
const key = `prueba_correo:${randomUUID()}`;
let emailId = null;

try {
  await enqueueEmailForUser({
    userId,
    key,
    type: "prueba",
    subject: "Prueba de correo ProySocial",
    message: "Mensaje de prueba <seguro>",
    destination: "/docente/matriz",
  });

  const queued = await pool.query(
    "SELECT * FROM notificacion_correos WHERE usuario_id = $1 AND clave = $2",
    [userId, key]
  );
  if (queued.rowCount !== 1 || queued.rows[0].estado !== "pendiente") {
    throw new Error("El correo no quedó en la cola pendiente");
  }
  emailId = Number(queued.rows[0].id);

  const rendered = renderNotificationEmail(queued.rows[0], {
    appPublicUrl: "http://localhost:5173",
  });
  if (rendered.html.includes("<seguro>")) {
    throw new Error("El contenido HTML no fue escapado");
  }
  if (!rendered.actionUrl?.includes("/docente/matriz")) {
    throw new Error("El correo no contiene el destino esperado");
  }

  let capturedMail = null;
  const delivery = await processEmailQueue({
    keys: [key],
    sendMail: async (mail) => {
      capturedMail = mail;
      return { messageId: "test-proysocial-message" };
    },
  });
  if (delivery.sent !== 1 || delivery.failed !== 0) {
    throw new Error("La cola no registró el envío simulado");
  }
  if (capturedMail?.to?.address !== userResult.rows[0].correo) {
    throw new Error("El destinatario del correo no coincide con el usuario");
  }

  const sent = await pool.query(
    `
    SELECT estado, intentos, proveedor_mensaje_id, enviado_en
    FROM notificacion_correos
    WHERE id = $1
    `,
    [emailId]
  );
  if (
    sent.rows[0]?.estado !== "enviado" ||
    sent.rows[0]?.proveedor_mensaje_id !== "test-proysocial-message" ||
    !sent.rows[0]?.enviado_en
  ) {
    throw new Error("El envío no quedó auditado correctamente");
  }

  const teacherResult = await pool.query(
    `SELECT id FROM usuarios WHERE rol = 'docente' AND estado = 'activo' ORDER BY id LIMIT 1`
  );
  const adminResult = await pool.query(
    `SELECT id FROM usuarios WHERE rol = 'admin' AND estado = 'activo' ORDER BY id LIMIT 1`
  );
  if (teacherResult.rowCount > 0 && adminResult.rowCount > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const teacherId = Number(teacherResult.rows[0].id);
      const adminId = Number(adminResult.rows[0].id);
      const project = await client.query(
        `
        INSERT INTO proyectos (
          titulo, docente_responsable_id, tipo, estado,
          fecha_inicio, fecha_fin_estimada
        )
        VALUES ($1, $2, 'proyecto', 'en_ejecucion', CURRENT_DATE, CURRENT_DATE)
        RETURNING id
        `,
        [`Prueba correo ${randomUUID()}`, teacherId]
      );
      const week = await client.query(
        `
        INSERT INTO proyecto_semanas (
          proyecto_id, numero, fecha_inicio, fecha_fin
        )
        VALUES ($1, 9999, CURRENT_DATE, CURRENT_DATE)
        RETURNING id
        `,
        [project.rows[0].id]
      );
      const report = await client.query(
        `
        INSERT INTO proyecto_entregables (
          proyecto_semana_id,
          docente_id,
          descripcion,
          completado,
          estado_revision,
          fecha_completado,
          fecha_real_entrega,
          fecha_cargue_evidencia
        )
        VALUES ($1, $2, 'Entregable de prueba', TRUE, 'enviado',
          CURRENT_DATE, CURRENT_DATE, CURRENT_TIMESTAMP)
        RETURNING id
        `,
        [week.rows[0].id, teacherId]
      );
      const newReportEmail = await client.query(
        `
        SELECT 1
        FROM notificacion_correos
        WHERE usuario_id = $1
          AND tipo = 'nuevo_reporte'
          AND clave LIKE $2
        `,
        [adminId, `nuevo_reporte:${report.rows[0].id}:%`]
      );
      if (newReportEmail.rowCount !== 1) {
        throw new Error("El trigger no encoló el correo del nuevo reporte");
      }

      await client.query(
        `
        UPDATE proyecto_entregables
        SET estado_revision = 'observado',
            comentario_revision = 'Debe ajustar la evidencia',
            revisado_en = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [report.rows[0].id]
      );
      const reviewEmail = await client.query(
        `
        SELECT mensaje
        FROM notificacion_correos
        WHERE usuario_id = $1
          AND tipo = 'observacion'
          AND clave LIKE $2
        `,
        [teacherId, `observado:${report.rows[0].id}:%`]
      );
      if (
        reviewEmail.rowCount !== 1 ||
        !reviewEmail.rows[0].mensaje.includes("Debe ajustar la evidencia")
      ) {
        throw new Error("El trigger no encoló la observación para el docente");
      }
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const digestClient = await pool.connect();
  try {
    await digestClient.query("BEGIN");
    const digest = await enqueueDailyDigests(
      digestClient,
      new Date("2026-08-13T12:00:00-05:00")
    );
    if (digest.teachers > 0) {
      const queuedDigest = await digestClient.query(
        `
        SELECT COUNT(*)::int AS total
        FROM notificacion_correos
        WHERE clave = 'resumen_vencidos:2026-08-13'
        `
      );
      if (Number(queuedDigest.rows[0]?.total || 0) !== digest.teachers) {
        throw new Error("Los resúmenes diarios no quedaron deduplicados por docente");
      }
    }
    await digestClient.query("ROLLBACK");
  } catch (error) {
    await digestClient.query("ROLLBACK");
    throw error;
  } finally {
    digestClient.release();
  }

  console.log("Prueba de cola, plantilla y triggers de correos: OK");
} finally {
  await pool.query(
    "DELETE FROM notificacion_correos WHERE usuario_id = $1 AND clave = $2",
    [userId, key]
  );
  await pool.end();
}
