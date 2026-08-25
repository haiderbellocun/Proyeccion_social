import nodemailer from "nodemailer";
import { pool } from "../db.js";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WORKER_INTERVAL_MS = 60_000;
const PROCESSING_TIMEOUT_MINUTES = 10;

let transporter = null;
let processingPromise = null;
let workerTimer = null;
let configurationWarningShown = false;

function envBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return ["1", "true", "yes", "si", "sí", "on"].includes(
    String(raw).trim().toLowerCase()
  );
}

function envInteger(name, fallback, minimum, maximum) {
  const value = Number.parseInt(String(process.env[name] || ""), 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function emailConfiguration() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = envInteger("SMTP_PORT", 587, 1, 65_535);
  const secure = envBoolean("SMTP_SECURE", port === 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const password = String(
    process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ""
  );
  const legacyFromAddress = String(
    process.env.EMAIL_FROM_ADDRESS || user || ""
  ).trim();
  const legacyFromName = String(process.env.EMAIL_FROM_NAME || "ProySocial").trim();
  const from = String(
    process.env.SMTP_FROM ||
      (legacyFromAddress ? `${legacyFromName} <${legacyFromAddress}>` : "")
  ).trim();
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || "")
    .split(",")[0]
    .trim();
  const appPublicUrl = String(
    process.env.APP_PUBLIC_URL || allowedOrigin || "http://localhost:5173"
  ).replace(/\/$/, "");
  const credentialsComplete = (!user && !password) || Boolean(user && password);
  const explicitEnabled = String(process.env.EMAIL_ENABLED || "").trim();
  const enabled = explicitEnabled
    ? envBoolean("EMAIL_ENABLED", false)
    : Boolean(host || user || password || from);
  return {
    enabled,
    configured: enabled && Boolean(host && from && credentialsComplete),
    host,
    port,
    secure,
    user,
    password,
    from,
    appPublicUrl,
    rejectUnauthorized: envBoolean("SMTP_TLS_REJECT_UNAUTHORIZED", true),
    batchSize: envInteger("EMAIL_BATCH_SIZE", DEFAULT_BATCH_SIZE, 1, 100),
    maxAttempts: envInteger("EMAIL_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 1, 20),
    workerIntervalMs: envInteger(
      "EMAIL_WORKER_INTERVAL_MS",
      DEFAULT_WORKER_INTERVAL_MS,
      10_000,
      3_600_000
    ),
  };
}

function getTransporter() {
  const config = emailConfiguration();
  if (!config.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
      tls: { rejectUnauthorized: config.rejectUnauthorized },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function actionUrl(destination, appPublicUrl) {
  if (!destination) return null;
  try {
    const url = new URL(String(destination), `${appPublicUrl}/`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function renderNotificationEmail(row, config = emailConfiguration()) {
  const greeting = row.destinatario_nombre
    ? `Hola ${row.destinatario_nombre},`
    : "Hola,";
  const url = actionUrl(row.destino, config.appPublicUrl);
  const messageHtml = escapeHtml(row.mensaje).replaceAll("\n", "<br />");
  const button = url
    ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;margin-top:20px">Abrir en ProySocial</a>`
    : "";
  const text = [
    greeting,
    "",
    row.mensaje,
    ...(url ? ["", `Abrir en ProySocial: ${url}`] : []),
    "",
    "Este es un correo automático de ProySocial.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:620px;margin:0 auto;padding:32px 16px">
      <div style="background:#1e3a8a;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:20px;font-weight:700">ProySocial</div>
        <div style="font-size:12px;color:#bfdbfe;margin-top:3px">Sistema de Seguimiento de Proyección Social</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;padding:28px 24px;border-radius:0 0 12px 12px">
        <p style="margin:0 0 18px;font-size:15px">${escapeHtml(greeting)}</p>
        <h1 style="font-size:20px;margin:0 0 16px;color:#0f172a">${escapeHtml(row.asunto)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0">${messageHtml}</p>
        ${button}
        <p style="font-size:12px;color:#94a3b8;margin:28px 0 0;border-top:1px solid #e2e8f0;padding-top:16px">
          Este es un correo automático. La información y el estado actualizado están disponibles en ProySocial.
        </p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text, actionUrl: url };
}

export async function enqueueEmailForUser(
  {
    userId,
    key,
    type,
    subject,
    message,
    destination = null,
  },
  db = pool
) {
  const result = await db.query(
    `
    SELECT encolar_correo_notificacion($1, $2, $3, $4, $5, $6)
    `,
    [userId, key, type, subject, message, destination]
  );
  return result.rowCount;
}

export async function enqueueDailyDigests(db = pool, now = new Date()) {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const teacherDigests = await db.query(
    `
    WITH vencidos AS (
      SELECT
        u.id AS usuario_id,
        COUNT(*)::int AS total,
        ARRAY_AGG(
          COALESCE(dex.entregable_override, tpl.entregable)
          ORDER BY COALESCE(
            dex.fecha_fin_override,
            (sem.fecha_inicio + tpl.dias_fin_desde_feb::integer * INTERVAL '1 day')::date
          ), tpl.id
        ) AS nombres
      FROM usuarios u
      INNER JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
      INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
      INNER JOIN semestres sem ON sem.codigo = gm.semestre
      LEFT JOIN docente_entregable_excepciones dex
        ON dex.docente_id = u.id AND dex.plantilla_id = tpl.id
      WHERE u.rol = 'docente'
        AND u.estado = 'activo'
        AND COALESCE(
          dex.fecha_fin_override,
          (sem.fecha_inicio + tpl.dias_fin_desde_feb::integer * INTERVAL '1 day')::date
        ) < CURRENT_DATE
        AND NOT EXISTS (
          SELECT 1
          FROM proyecto_entregables pe
          WHERE pe.plantilla_id = tpl.id
            AND pe.docente_id = u.id
            AND COALESCE(pe.completado, false) = true
        )
      GROUP BY u.id
    )
    SELECT usuario_id, total, nombres
    FROM vencidos
    `
  );

  for (const row of teacherDigests.rows) {
    const names = (row.nombres || []).slice(0, 5);
    const remaining = Number(row.total) - names.length;
    const list = names.map((name) => `• ${name}`).join("\n");
    const extra = remaining > 0 ? `\n• y ${remaining} entregables más` : "";
    await enqueueEmailForUser(
      {
        userId: Number(row.usuario_id),
        key: `resumen_vencidos:${dateKey}`,
        type: "vencido",
        subject: `Tienes ${row.total} entregable${Number(row.total) === 1 ? "" : "s"} vencido${Number(row.total) === 1 ? "" : "s"}`,
        message: `Estos entregables siguen pendientes:\n\n${list}${extra}`,
        destination: "/docente/matriz",
      },
      db
    );
  }

  const inactivity = await db.query(
    `
    WITH actividad AS (
      SELECT
        u.id,
        CONCAT_WS(' ', u.nombre, u.apellido) AS nombre,
        MAX(
          COALESCE(
            pe.fecha_cargue_evidencia,
            pe.fecha_completado::timestamptz,
            pe.fecha_real_entrega::timestamptz,
            pe.creado_en::timestamptz
          )
        ) AS ultima_actividad
      FROM usuarios u
      LEFT JOIN proyecto_entregables pe ON pe.docente_id = u.id
      WHERE u.rol = 'docente' AND u.estado = 'activo'
      GROUP BY u.id, u.nombre, u.apellido, u.creado_en
      HAVING COALESCE(
        MAX(
          COALESCE(
            pe.fecha_cargue_evidencia,
            pe.fecha_completado::timestamptz,
            pe.fecha_real_entrega::timestamptz,
            pe.creado_en::timestamptz
          )
        ),
        u.creado_en::timestamptz
      ) < NOW() - INTERVAL '14 days'
    )
    SELECT
      COUNT(*)::int AS total,
      ARRAY_AGG(nombre ORDER BY nombre) AS nombres
    FROM actividad
    `
  );
  const inactiveTotal = Number(inactivity.rows[0]?.total || 0);
  if (inactiveTotal > 0) {
    const admins = await db.query(
      "SELECT id FROM usuarios WHERE rol = 'admin' AND estado = 'activo'"
    );
    const names = (inactivity.rows[0]?.nombres || []).slice(0, 10);
    const remaining = inactiveTotal - names.length;
    const list = names.map((name) => `• ${name}`).join("\n");
    const extra = remaining > 0 ? `\n• y ${remaining} docentes más` : "";
    for (const admin of admins.rows) {
      await enqueueEmailForUser(
        {
          userId: Number(admin.id),
          key: `resumen_inactividad:${dateKey}`,
          type: "sin_actividad",
          subject: `${inactiveTotal} docente${inactiveTotal === 1 ? "" : "s"} sin actividad reciente`,
          message: `Docentes sin reportes durante más de 14 días:\n\n${list}${extra}`,
          destination: "/admin/avance",
        },
        db
      );
    }
  }

  return {
    teachers: teacherDigests.rowCount,
    inactiveTeachers: inactiveTotal,
  };
}

async function claimPendingEmails(config, onlyKeys = null) {
  const keys = Array.isArray(onlyKeys) && onlyKeys.length > 0
    ? onlyKeys.map((key) => String(key))
    : null;
  const result = await pool.query(
    `
    WITH candidates AS (
      SELECT id
      FROM notificacion_correos
      WHERE intentos < $1
        AND ($4::text[] IS NULL OR clave = ANY($4::text[]))
        AND (
          (estado IN ('pendiente', 'fallido') AND proximo_intento_en <= CURRENT_TIMESTAMP)
          OR (
            estado = 'procesando'
            AND actualizado_en < CURRENT_TIMESTAMP - ($2::text || ' minutes')::interval
          )
        )
      ORDER BY creado_en, id
      LIMIT $3
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notificacion_correos correo
    SET estado = 'procesando',
        intentos = correo.intentos + 1,
        actualizado_en = CURRENT_TIMESTAMP,
        ultimo_error = NULL
    FROM candidates
    WHERE correo.id = candidates.id
    RETURNING correo.*
    `,
    [config.maxAttempts, PROCESSING_TIMEOUT_MINUTES, config.batchSize, keys]
  );
  return result.rows;
}

function retryDelaySeconds(attempts) {
  return Math.min(3600, 30 * 2 ** Math.max(0, Number(attempts) - 1));
}

async function markSent(id, providerMessageId) {
  await pool.query(
    `
    UPDATE notificacion_correos
    SET estado = 'enviado',
        enviado_en = CURRENT_TIMESTAMP,
        actualizado_en = CURRENT_TIMESTAMP,
        proveedor_mensaje_id = $2,
        ultimo_error = NULL
    WHERE id = $1
    `,
    [id, providerMessageId || null]
  );
}

async function markFailed(row, error, maxAttempts) {
  const finalAttempt = Number(row.intentos) >= maxAttempts;
  const message = String(error?.message || error || "Error SMTP desconocido").slice(
    0,
    2000
  );
  await pool.query(
    `
    UPDATE notificacion_correos
    SET estado = 'fallido',
        ultimo_error = $2,
        actualizado_en = CURRENT_TIMESTAMP,
        proximo_intento_en = CASE
          WHEN $3 THEN CURRENT_TIMESTAMP + INTERVAL '100 years'
          ELSE CURRENT_TIMESTAMP + ($4::text || ' seconds')::interval
        END
    WHERE id = $1
    `,
    [row.id, message, finalAttempt, retryDelaySeconds(row.intentos)]
  );
}

export async function processEmailQueue(options = {}) {
  if (processingPromise) return processingPromise;
  processingPromise = (async () => {
    const config = emailConfiguration();
    const customSender = options.sendMail;
    const smtpTransporter = customSender ? null : getTransporter();
    if (!customSender && !smtpTransporter) {
      if (config.enabled && !configurationWarningShown) {
        console.warn(
          "La configuración de correo está incompleta. Revisa SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM."
        );
        configurationWarningShown = true;
      }
      return { configured: false, processed: 0, sent: 0, failed: 0 };
    }

    const rows = await claimPendingEmails(config, options.keys);
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const rendered = renderNotificationEmail(row, config);
        const mail = {
          from: config.from || "ProySocial <no-reply@proysocial.local>",
          to: {
            name: row.destinatario_nombre || undefined,
            address: row.destinatario_email,
          },
          subject: row.asunto,
          text: rendered.text,
          html: rendered.html,
        };
        const info = customSender
          ? await customSender(mail, row)
          : await smtpTransporter.sendMail(mail);
        await markSent(row.id, info?.messageId);
        sent += 1;
      } catch (error) {
        await markFailed(row, error, config.maxAttempts);
        failed += 1;
      }
    }
    return {
      configured: true,
      processed: rows.length,
      sent,
      failed,
    };
  })();

  try {
    return await processingPromise;
  } finally {
    processingPromise = null;
  }
}

export function requestEmailProcessing() {
  void processEmailQueue().catch((error) => {
    console.error("Error procesando la cola de correos", error);
  });
}

export function startEmailWorker() {
  const config = emailConfiguration();
  if (!config.enabled || workerTimer) return;

  const run = async () => {
    try {
      await enqueueDailyDigests();
      await processEmailQueue();
    } catch (error) {
      console.error("Error en el trabajador de correos", error);
    }
  };
  void run();
  workerTimer = setInterval(() => void run(), config.workerIntervalMs);
  workerTimer.unref?.();
}

export async function stopEmailWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  if (processingPromise) await processingPromise.catch(() => {});
  if (transporter) transporter.close();
  transporter = null;
}
