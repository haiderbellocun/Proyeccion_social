import { pool } from "../db.js";

const MAX_NOTIFICATIONS_PER_REQUEST = 2000;

function normalizeNotification(item) {
  const clave = String(item?.clave || "").trim();
  const tipo = String(item?.tipo || "").trim();
  const parsedReference =
    item?.referencia_id == null ? null : Number(item.referencia_id);
  const referenciaId = Number.isSafeInteger(parsedReference)
    ? parsedReference
    : null;

  if (!clave || clave.length > 300 || !tipo || tipo.length > 40) {
    return null;
  }
  return {
    clave,
    tipo,
    referencia_id: referenciaId,
  };
}

export async function markNotificationsAsRead(userId, rawNotifications) {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    const error = new Error("Usuario inválido");
    error.status = 400;
    throw error;
  }

  const source = Array.isArray(rawNotifications)
    ? rawNotifications
    : [rawNotifications];
  if (source.length === 0 || source.length > MAX_NOTIFICATIONS_PER_REQUEST) {
    const error = new Error("Cantidad de notificaciones inválida");
    error.status = 400;
    throw error;
  }

  const unique = new Map();
  for (const item of source) {
    const normalized = normalizeNotification(item);
    if (normalized) unique.set(normalized.clave, normalized);
  }
  const notifications = [...unique.values()];
  if (notifications.length === 0) {
    const error = new Error("No se recibió una notificación válida");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `
      INSERT INTO notificacion_lecturas (
        usuario_id, clave, tipo, referencia_id, leida_en
      )
      SELECT $1, item.clave, item.tipo, item.referencia_id, CURRENT_TIMESTAMP
      FROM jsonb_to_recordset($2::jsonb) AS item(
        clave TEXT,
        tipo TEXT,
        referencia_id BIGINT
      )
      ON CONFLICT (usuario_id, clave)
      DO UPDATE SET leida_en = EXCLUDED.leida_en
      RETURNING clave
      `,
      [parsedUserId, JSON.stringify(notifications)]
    );

    const persistentIds = notifications
      .filter(
        (item) =>
          item.clave.startsWith("persistente:") &&
          Number.isSafeInteger(item.referencia_id)
      )
      .map((item) => item.referencia_id);
    if (persistentIds.length > 0) {
      await client.query(
        `
        UPDATE notificaciones
        SET leida = TRUE
        WHERE usuario_id = $1
          AND id = ANY($2::bigint[])
        `,
        [parsedUserId, persistentIds]
      );
    }

    await client.query("COMMIT");
    return inserted.rowCount;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
