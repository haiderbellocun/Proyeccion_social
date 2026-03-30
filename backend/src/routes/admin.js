import express from "express";
import { pool } from "../db.js";

const router = express.Router();

let reportFieldsColumnsEnsured = false;

async function ensureReportFieldsColumns(client) {
  if (reportFieldsColumnsEnsured) return;
  await client.query(`
    ALTER TABLE proyecto_entregables
      ADD COLUMN IF NOT EXISTS actividad_reportada TEXT,
      ADD COLUMN IF NOT EXISTS descripcion_reporte TEXT,
      ADD COLUMN IF NOT EXISTS porcentaje_avance INTEGER;
  `);
  reportFieldsColumnsEnsured = true;
}

const mesFromSemana = (semana) => {
  const w = Number(semana) || 0;
  if (w <= 4) return "Febrero";
  if (w <= 8) return "Marzo";
  if (w <= 12) return "Abril";
  return "Mayo";
};

const round1 = (x) => Math.round(Number(x) * 10) / 10;

const toDateOnlyISO = (d) => {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const ADMIN_MATRIZ_PLANTILLA_JOIN = `
  FROM plantilla_entregables tpl
  INNER JOIN usuarios u
    ON u.id = $1
   AND u.rol = 'docente'
   AND u.grupo_matriz_id = tpl.grupo_id
  LEFT JOIN LATERAL (
    SELECT
      e.id,
      e.completado,
      e.fecha_real_entrega,
      e.url_evidencia,
      e.estado_revision,
      e.comentario_revision,
      e.porcentaje_avance,
      e.actividad_reportada,
      e.horas
    FROM proyecto_entregables e
    INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
    INNER JOIN proyectos p ON p.id = s.proyecto_id
    WHERE s.numero = tpl.semana_numero
      AND (
        p.docente_responsable_id = u.id
        OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
      )
      AND (
        TRIM(e.descripcion) = TRIM(tpl.entregable)
        OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
      )
    ORDER BY e.id DESC
    LIMIT 1
  ) pe ON true
`;

const ADMIN_MATRIZ_ORDER = `
  ORDER BY
    CASE LOWER(TRIM(tpl.mes))
      WHEN 'febrero' THEN 1
      WHEN 'marzo' THEN 2
      WHEN 'abril' THEN 3
      WHEN 'mayo' THEN 4
      ELSE 5
    END,
    tpl.semana_numero NULLS LAST,
    tpl.numero
`;

const mapCategorySlug = (categoria, fase) => {
  const text = `${categoria || ""} ${fase || ""}`.toLowerCase();
  if (text.includes("capacit")) return "capacitacion";
  if (text.includes("conveni")) {
    if (text.includes("nuevo")) return "convenio_nuevo";
    if (text.includes("dinam")) return "convenio_dinamizado";
    return "convenio_dinamizado";
  }
  if (text.includes("presup")) return "presupuesto";
  if (text.includes("proyect")) return "proyecto";
  const m = text.match(/actividad\s*(\d+)/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 4) return `actividad${n}`;
  }
  if (text.includes("actividad")) return "actividad1";
  return "proyecto";
};

const SEMESTRE_REGEX = /^\d{4}[AB]$/;
function isValidSemestreValue(s) {
  return typeof s === "string" && SEMESTRE_REGEX.test(String(s).trim());
}

// Dashboard admin (expuesto: stats, progreso_semanal, cumplimiento_por_programa, docentes_recientes)
router.get("/dashboard", async (_req, res) => {
  const client = await pool.connect();
  try {
    const totalDocentesR = await client.query(
      `SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'docente'`
    );
    const proyectosActivosR = await client.query(
      `SELECT COUNT(*)::int AS total FROM proyectos WHERE estado = 'en_ejecucion'`
    );

    const reportesR = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(completado, false) = true)::int AS enviados,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados
      FROM proyecto_entregables
    `);

    const semanaRows = await client.query(`
      SELECT
        s.numero AS semana,
        COUNT(e.id) FILTER (WHERE COALESCE(e.completado, false) = true)::int AS enviados,
        COUNT(e.id) FILTER (
          WHERE COALESCE(e.completado, false) = true
            AND COALESCE(e.estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados
      FROM proyecto_semanas s
      LEFT JOIN proyecto_entregables e ON e.proyecto_semana_id = s.id
      GROUP BY s.numero
      ORDER BY s.numero
    `);

    const semanaMap = new Map();
    for (const r of semanaRows.rows || []) {
      semanaMap.set(Number(r.semana), {
        enviados: Number(r.enviados || 0),
        aprobados: Number(r.aprobados || 0),
      });
    }
    const progreso_semanal = [];
    for (let semana = 1; semana <= 16; semana++) {
      const row = semanaMap.get(semana) || { enviados: 0, aprobados: 0 };
      progreso_semanal.push({
        semana,
        mes: mesFromSemana(semana),
        enviados: row.enviados,
        aprobados: row.aprobados,
      });
    }

    const cumplimientoR = await client.query(`
      WITH docente_tpl AS (
        SELECT
          u.id AS docente_id,
          u.programa_id,
          COUNT(tpl.id)::int AS total_tpl,
          COUNT(DISTINCT pe.id) FILTER (WHERE COALESCE(pe.completado, false))::int AS done_tpl
        FROM usuarios u
        INNER JOIN plantilla_entregables tpl
          ON tpl.grupo_id = u.grupo_matriz_id
        LEFT JOIN LATERAL (
          SELECT e.id, e.completado
          FROM proyecto_entregables e
          INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
          INNER JOIN proyectos p ON p.id = s.proyecto_id
          WHERE u.grupo_matriz_id IS NOT NULL
            AND s.numero = tpl.semana_numero
            AND (
              p.docente_responsable_id = u.id
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
            )
            AND (
              TRIM(e.descripcion) = TRIM(tpl.entregable)
              OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
            )
          ORDER BY e.id DESC
          LIMIT 1
        ) pe ON true
        WHERE u.rol = 'docente'
          AND u.programa_id IS NOT NULL
        GROUP BY u.id, u.programa_id
      ),
      por_prog AS (
        SELECT
          programa_id,
          COUNT(*)::int AS docentes,
          AVG(
            CASE
              WHEN total_tpl > 0 THEN (100.0 * done_tpl / total_tpl)
              ELSE 0::numeric
            END
          ) AS porcentaje
        FROM docente_tpl
        GROUP BY programa_id
      )
      SELECT
        p.nombre AS programa,
        pp.docentes,
        ROUND(pp.porcentaje::numeric, 1)::float AS porcentaje
      FROM por_prog pp
      JOIN programas p ON p.id = pp.programa_id
      ORDER BY pp.docentes DESC, p.nombre
      LIMIT 8
    `);

    const cumplimiento_por_programa = (cumplimientoR.rows || []).map((r) => ({
      programa: r.programa || "Sin nombre",
      porcentaje: round1(r.porcentaje ?? 0),
      docentes: Number(r.docentes || 0),
    }));

    const docentesR = await client.query(`
      WITH base AS (
        SELECT
          u.id,
          u.nombre,
          u.apellido,
          COALESCE(pr.nombre, 'Sin programa') AS programa,
          COALESCE(NULLIF(TRIM(u.regional), ''), '—') AS regional,
          u.grupo_matriz_id,
          COUNT(tpl.id)::int AS total_tpl,
          COUNT(DISTINCT pe.id) FILTER (WHERE COALESCE(pe.completado, false))::int AS done_tpl,
          (
            SELECT COUNT(*)::int
            FROM proyecto_entregables e2
            JOIN proyecto_semanas s2 ON s2.id = e2.proyecto_semana_id
            JOIN proyectos p2 ON p2.id = s2.proyecto_id
            WHERE COALESCE(e2.completado, false) = true
              AND (
                p2.docente_responsable_id = u.id
                OR p2.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
              )
          ) AS reportes_enviados
        FROM usuarios u
        LEFT JOIN programas pr ON pr.id = u.programa_id
        LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
        LEFT JOIN LATERAL (
          SELECT e.id, e.completado
          FROM proyecto_entregables e
          INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
          INNER JOIN proyectos p ON p.id = s.proyecto_id
          WHERE u.grupo_matriz_id IS NOT NULL
            AND tpl.grupo_id = u.grupo_matriz_id
            AND s.numero = tpl.semana_numero
            AND (
              p.docente_responsable_id = u.id
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
            )
            AND (
              TRIM(e.descripcion) = TRIM(tpl.entregable)
              OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
            )
          ORDER BY e.id DESC
          LIMIT 1
        ) pe ON true
        WHERE u.rol = 'docente'
        GROUP BY u.id, u.nombre, u.apellido, pr.nombre, u.regional, u.grupo_matriz_id
      )
      SELECT
        id,
        nombre,
        apellido,
        programa,
        regional,
        total_tpl,
        done_tpl,
        reportes_enviados,
        CASE
          WHEN grupo_matriz_id IS NULL OR total_tpl = 0 THEN 'sin_actividad'
          WHEN total_tpl > 0 AND (100.0 * done_tpl / total_tpl) < 40 THEN 'atrasado'
          ELSE 'al_dia'
        END AS estado,
        CASE
          WHEN total_tpl > 0 THEN ROUND((100.0 * done_tpl / total_tpl)::numeric, 1)::float
          ELSE 0::float
        END AS porcentaje_avance
      FROM base
      ORDER BY apellido, nombre
    `);

    const docentes_recientes = (docentesR.rows || []).map((r) => ({
      id: Number(r.id),
      nombre: [r.nombre, r.apellido].filter(Boolean).join(" ").trim() || "—",
      programa: r.programa || "—",
      regional: r.regional || "—",
      porcentaje_avance: round1(r.porcentaje_avance ?? 0),
      reportes_enviados: Number(r.reportes_enviados || 0),
      estado: r.estado,
    }));

    const docentes_atrasados = docentes_recientes.filter((d) => d.estado === "atrasado").length;

    res.json({
      stats: {
        total_docentes: totalDocentesR.rows[0]?.total ?? 0,
        reportes_enviados: Number(reportesR.rows[0]?.enviados ?? 0),
        docentes_atrasados,
        proyectos_activos: proyectosActivosR.rows[0]?.total ?? 0,
      },
      progreso_semanal,
      cumplimiento_por_programa,
      docentes_recientes,
      docentes: totalDocentesR.rows[0]?.total,
      proyectos_activos: proyectosActivosR.rows[0]?.total,
      reportes: reportesR.rows[0],
    });
  } catch (error) {
    console.error("Error en /admin/dashboard", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

router.get("/notificaciones", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT * FROM (
        SELECT
          'nuevo_reporte' AS tipo,
          pe.id AS referencia_id,
          CONCAT(
            u.nombre, ' ', u.apellido,
            ' envió un reporte: ',
            COALESCE(pe.actividad_reportada, pe.descripcion)
          ) AS mensaje,
          COALESCE(pe.revisado_en, pe.fecha_real_entrega, pe.fecha_completado, NOW()) AS fecha
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        JOIN usuarios u ON u.id = p.docente_responsable_id
        WHERE COALESCE(pe.estado_revision, 'enviado') = 'enviado'
          AND COALESCE(pe.completado, false) = true
          AND COALESCE(pe.fecha_real_entrega, pe.fecha_completado, pe.revisado_en)
              >= NOW() - INTERVAL '48 hours'

        UNION ALL

        SELECT
          'sin_actividad' AS tipo,
          u.id AS referencia_id,
          CONCAT(u.nombre, ' ', u.apellido, ' lleva más de 14 días sin reportar') AS mensaje,
          CURRENT_TIMESTAMP AS fecha
        FROM usuarios u
        WHERE u.rol = 'docente'
          AND NOT EXISTS (
            SELECT 1
            FROM proyecto_entregables pe
            JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
            JOIN proyectos p ON p.id = ps.proyecto_id
            WHERE (
                p.docente_responsable_id = u.id
                OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
              )
              AND COALESCE(pe.completado, false) = true
              AND COALESCE(pe.fecha_completado, pe.fecha_real_entrega)
                  >= CURRENT_DATE - INTERVAL '14 days'
          )
      ) AS sub
      ORDER BY fecha DESC NULLS LAST
      LIMIT 10
      `
    );

    const notificaciones = (result.rows || []).map((row) => ({
      tipo: row.tipo,
      referencia_id: Number(row.referencia_id),
      mensaje: row.mensaje,
      fecha:
        row.fecha != null
          ? row.fecha instanceof Date
            ? row.fecha.toISOString()
            : String(row.fecha)
          : null,
    }));

    res.json({ notificaciones });
  } catch (error) {
    console.error("Error en GET /admin/notificaciones", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/metricas", async (_req, res) => {
  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);

    const resumenR = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(completado, false) = true)::int AS total_reportes,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'enviado'
        )::int AS pendientes,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'observado'
        )::int AS con_observaciones
      FROM proyecto_entregables
    `);

    const row0 = resumenR.rows[0] || {};
    const totalReportes = Number(row0.total_reportes || 0);
    const aprobados = Number(row0.aprobados || 0);
    const pendientes = Number(row0.pendientes || 0);
    const observados = Number(row0.con_observaciones || 0);
    const porcentaje_aprobacion =
      totalReportes > 0 ? round1((aprobados / totalReportes) * 100) : 0;

    const porMesR = await client.query(`
      SELECT
        EXTRACT(MONTH FROM COALESCE(e.fecha_real_entrega, e.fecha_completado))::int AS mes_num,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados,
        COUNT(*) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'observado'
        )::int AS observados,
        COUNT(*) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'enviado'
        )::int AS pendientes
      FROM proyecto_entregables e
      WHERE COALESCE(e.completado, false) = true
        AND EXTRACT(MONTH FROM COALESCE(e.fecha_real_entrega, e.fecha_completado)) IN (2, 3, 4, 5)
      GROUP BY mes_num
    `);

    const mesNumToLabel = { 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo" };
    const porMesMap = new Map();
    for (const r of porMesR.rows || []) {
      const label = mesNumToLabel[r.mes_num];
      if (label) porMesMap.set(label, r);
    }
    const por_mes = ["Febrero", "Marzo", "Abril", "Mayo"].map((mes) => {
      const r = porMesMap.get(mes) || {};
      return {
        mes,
        total: Number(r.total || 0),
        aprobados: Number(r.aprobados || 0),
        observados: Number(r.observados || 0),
        pendientes: Number(r.pendientes || 0),
      };
    });

    const porGrupoR = await client.query(`
      WITH pairs AS (
        SELECT
          u.grupo_matriz_id AS grupo_id,
          u.id AS docente_id,
          tpl.id AS tpl_id,
          COALESCE(pe.completado, false) AS ok
        FROM usuarios u
        INNER JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
        LEFT JOIN LATERAL (
          SELECT e.completado
          FROM proyecto_entregables e
          INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
          INNER JOIN proyectos p ON p.id = s.proyecto_id
          WHERE s.numero = tpl.semana_numero
            AND (
              p.docente_responsable_id = u.id
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
            )
            AND (
              TRIM(e.descripcion) = TRIM(tpl.entregable)
              OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
            )
          ORDER BY e.id DESC
          LIMIT 1
        ) pe ON true
        WHERE u.rol = 'docente'
          AND u.grupo_matriz_id IS NOT NULL
      ),
      agg AS (
        SELECT
          grupo_id,
          COUNT(DISTINCT docente_id)::int AS total_docentes,
          COUNT(*)::int AS entregables_total,
          COUNT(*) FILTER (WHERE ok)::int AS entregables_completados
        FROM pairs
        GROUP BY grupo_id
      )
      SELECT
        gm.id AS grupo_id,
        gm.nombre AS grupo_nombre,
        COALESCE(gm.tipo_docente, 'ANTIGUO') AS tipo_docente,
        COALESCE(a.total_docentes, 0)::int AS total_docentes,
        COALESCE(a.entregables_completados, 0)::int AS entregables_completados,
        COALESCE(a.entregables_total, 0)::int AS entregables_total
      FROM grupos_matriz gm
      LEFT JOIN agg a ON a.grupo_id = gm.id
      ORDER BY gm.nombre
    `);

    const por_grupo = (porGrupoR.rows || []).map((r) => {
      const total = Number(r.entregables_total || 0);
      const done = Number(r.entregables_completados || 0);
      const pct = total > 0 ? round1((done / total) * 100) : 0;
      return {
        grupo_id: Number(r.grupo_id),
        grupo_nombre: r.grupo_nombre || "",
        tipo_docente: r.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO",
        total_docentes: Number(r.total_docentes || 0),
        entregables_completados: done,
        entregables_total: total,
        porcentaje: pct,
      };
    });

    const porRegionalR = await client.query(`
      WITH docente_tpl AS (
        SELECT
          u.id AS docente_id,
          COALESCE(NULLIF(TRIM(u.regional), ''), 'Sin regional') AS regional,
          COUNT(tpl.id)::int AS total_tpl,
          COUNT(DISTINCT pe.id) FILTER (WHERE COALESCE(pe.completado, false))::int AS done_tpl
        FROM usuarios u
        INNER JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
        LEFT JOIN LATERAL (
          SELECT e.id, e.completado
          FROM proyecto_entregables e
          INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
          INNER JOIN proyectos p ON p.id = s.proyecto_id
          WHERE s.numero = tpl.semana_numero
            AND (
              p.docente_responsable_id = u.id
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
            )
            AND (
              TRIM(e.descripcion) = TRIM(tpl.entregable)
              OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
            )
          ORDER BY e.id DESC
          LIMIT 1
        ) pe ON true
        WHERE u.rol = 'docente'
        GROUP BY u.id, regional
      )
      SELECT
        regional,
        COUNT(*)::int AS docentes,
        ROUND(AVG(
          CASE
            WHEN total_tpl > 0 THEN (100.0 * done_tpl / total_tpl)
            ELSE 0::numeric
          END
        )::numeric, 1)::float AS porcentaje_avance
      FROM docente_tpl
      GROUP BY regional
      ORDER BY regional
    `);

    const por_regional = (porRegionalR.rows || []).map((r) => ({
      regional: r.regional || "—",
      docentes: Number(r.docentes || 0),
      porcentaje_avance: round1(r.porcentaje_avance ?? 0),
    }));

    const topAtrR = await client.query(`
      WITH docente_tpl AS (
        SELECT
          u.id AS docente_id,
          u.grupo_matriz_id,
          u.nombre,
          u.apellido,
          COALESCE(pr.nombre, 'Sin programa') AS programa,
          COALESCE(NULLIF(TRIM(u.regional), ''), '—') AS regional,
          COALESCE(gm.nombre, '—') AS grupo,
          COUNT(tpl.id)::int AS total_tpl,
          COUNT(DISTINCT pe.id) FILTER (WHERE COALESCE(pe.completado, false))::int AS done_tpl
        FROM usuarios u
        LEFT JOIN programas pr ON pr.id = u.programa_id
        LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
        LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
        LEFT JOIN LATERAL (
          SELECT e.id, e.completado
          FROM proyecto_entregables e
          INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
          INNER JOIN proyectos p ON p.id = s.proyecto_id
          WHERE u.grupo_matriz_id IS NOT NULL
            AND tpl.grupo_id = u.grupo_matriz_id
            AND s.numero = tpl.semana_numero
            AND (
              p.docente_responsable_id = u.id
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
            )
            AND (
              TRIM(e.descripcion) = TRIM(tpl.entregable)
              OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
            )
          ORDER BY e.id DESC
          LIMIT 1
        ) pe ON true
        WHERE u.rol = 'docente'
        GROUP BY u.id, u.grupo_matriz_id, u.nombre, u.apellido, pr.nombre, u.regional, gm.nombre
      )
      SELECT
        d.docente_id,
        d.nombre,
        d.apellido,
        d.programa,
        d.regional,
        d.grupo,
        d.total_tpl,
        d.done_tpl,
        CASE
          WHEN d.total_tpl > 0 THEN ROUND((100.0 * d.done_tpl / d.total_tpl)::numeric, 1)::float
          ELSE 0::float
        END AS porcentaje_avance,
        (
          SELECT COUNT(*)::int
          FROM plantilla_entregables tpl
          WHERE tpl.grupo_id = d.grupo_matriz_id
            AND d.grupo_matriz_id IS NOT NULL
            AND tpl.dias_fin_desde_feb IS NOT NULL
            AND (DATE '2026-02-10' + tpl.dias_fin_desde_feb * INTERVAL '1 day')::date < CURRENT_DATE
            AND NOT EXISTS (
              SELECT 1
              FROM proyecto_entregables e
              INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
              INNER JOIN proyectos p ON p.id = s.proyecto_id
              WHERE s.numero = tpl.semana_numero
                AND (
                  p.docente_responsable_id = d.docente_id
                  OR p.id IN (
                    SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = d.docente_id
                  )
                )
                AND (
                  TRIM(e.descripcion) = TRIM(tpl.entregable)
                  OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
                )
                AND COALESCE(e.completado, false) = true
            )
        ) AS entregables_vencidos
      FROM docente_tpl d
      WHERE d.total_tpl > 0
      ORDER BY porcentaje_avance ASC, entregables_vencidos DESC NULLS LAST
      LIMIT 10
    `);

    const top_atrasados = (topAtrR.rows || []).map((r) => ({
      docente_id: Number(r.docente_id),
      nombre: [r.nombre, r.apellido].filter(Boolean).join(" ").trim(),
      programa: r.programa || "—",
      regional: r.regional || "—",
      grupo: r.grupo || "—",
      entregables_vencidos: Number(r.entregables_vencidos || 0),
      porcentaje_avance: round1(r.porcentaje_avance ?? 0),
    }));

    res.json({
      resumen: {
        total_reportes: totalReportes,
        aprobados,
        pendientes,
        con_observaciones: observados,
        porcentaje_aprobacion,
      },
      por_mes,
      por_grupo,
      por_regional,
      top_atrasados,
    });
  } catch (error) {
    console.error("Error en /admin/metricas", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Listado para revisión admin de avances enviados por docentes
router.get("/reportes-revision", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);
    const countResult = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM proyecto_entregables e
      WHERE COALESCE(e.completado, false) = true
      `
    );
    const result = await client.query(
      `
      SELECT
        e.id,
        COALESCE(e.estado_revision, 'enviado') AS estado_revision,
        e.comentario_revision,
        e.fecha_real_entrega,
        e.fecha_completado,
        e.url_evidencia,
        COALESCE(e.actividad_reportada, e.descripcion) AS actividad_reportada,
        COALESCE(e.descripcion_reporte, '') AS descripcion_reporte,
        COALESCE(e.porcentaje_avance, 100)::int AS porcentaje_avance,
        COALESCE(e.horas, 0)::numeric AS horas,
        s.numero AS semana_numero,
        p.id AS proyecto_id,
        p.titulo AS proyecto_titulo,
        prog.nombre AS programa_nombre,
        u.id AS docente_id,
        u.nombre,
        u.apellido,
        u.correo
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      WHERE COALESCE(e.completado, false) = true
      ORDER BY
        CASE COALESCE(e.estado_revision, 'enviado')
          WHEN 'enviado' THEN 0
          WHEN 'observado' THEN 1
          WHEN 'aprobado' THEN 2
          ELSE 3
        END,
        COALESCE(e.fecha_real_entrega, e.fecha_completado) DESC NULLS LAST,
        e.id DESC
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const reportes = (result.rows || []).map((r) => ({
      id: r.id,
      estado_revision: r.estado_revision,
      comentario_revision: r.comentario_revision || "",
      fecha_real_entrega: r.fecha_real_entrega,
      fecha_completado: r.fecha_completado,
      url_evidencia: r.url_evidencia || "",
      actividad_reportada: r.actividad_reportada || "Entregable",
      descripcion_reporte: r.descripcion_reporte || "",
      porcentaje_avance: Number(r.porcentaje_avance ?? 100),
      horas: Number(r.horas || 0),
      semana_numero: Number(r.semana_numero || 0),
      proyecto_id: r.proyecto_id,
      proyecto_titulo: r.proyecto_titulo || "Iniciativa",
      programa_nombre: r.programa_nombre || "Sin programa",
      docente_id: r.docente_id,
      docente_nombre: [r.nombre, r.apellido].filter(Boolean).join(" "),
      docente_correo: r.correo || "",
    }));

    res.json({
      reportes,
      data: reportes,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/reportes-revision", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Cambiar estado de revisión admin para un entregable reportado
router.put("/reportes-revision/:id", async (req, res) => {
  const entregableId = Number(req.params.id);
  const { estado_revision, comentario_revision } = req.body || {};
  if (!entregableId) {
    return res.status(400).json({ error: "id inválido" });
  }
  if (!["aprobado", "observado", "enviado"].includes(estado_revision)) {
    return res.status(400).json({
      error: "estado_revision debe ser aprobado, observado o enviado",
    });
  }
  if (estado_revision === "observado" && !String(comentario_revision || "").trim()) {
    return res.status(400).json({
      error: "Debes ingresar un comentario para estado observado",
    });
  }

  const client = await pool.connect();
  try {
    const current = await client.query(
      `
      SELECT COALESCE(estado_revision, 'enviado') AS estado_revision
      FROM proyecto_entregables
      WHERE id = $1
      FOR UPDATE
      `,
      [entregableId]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: "Entregable no encontrado" });
    }
    const currentStatus = current.rows[0].estado_revision;
    if (currentStatus === "aprobado" && estado_revision !== "aprobado") {
      return res.status(409).json({
        error: "El reporte ya fue aprobado y no puede cambiarse de estado",
      });
    }

    await client.query(
      `
      UPDATE proyecto_entregables
      SET
        estado_revision = $1,
        comentario_revision = $2,
        revisado_en = NOW()
      WHERE id = $3
      `,
      [estado_revision, comentario_revision || null, entregableId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/reportes-revision/:id", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Listado de docentes con programa y escuela (para administración de usuarios)
router.get("/docentes", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM usuarios u
      WHERE u.rol = 'docente'
      `
    );
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.estado,
        u.perfil_indicador_id,
        u.tipo_docente,
        u.regional,
        u.link_drive,
        u.grupo_matriz_id,
        p.nombre   AS programa_nombre,
        p.codigo   AS programa_codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        pi.nombre AS perfil_nombre,
        gm.nombre AS grupo_matriz_nombre,
        COALESCE(
          ROUND(
            (
              100.0 * (
                SELECT COUNT(*)::float
                FROM proyecto_entregables pe2
                INNER JOIN proyecto_semanas ps2 ON ps2.id = pe2.proyecto_semana_id
                INNER JOIN proyectos p2 ON p2.id = ps2.proyecto_id
                WHERE (
                    p2.docente_responsable_id = u.id
                    OR p2.id IN (
                      SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id
                    )
                  )
                  AND COALESCE(pe2.completado, false) = true
              )
              / NULLIF(
                (SELECT COUNT(*)::float FROM plantilla_entregables tplc WHERE tplc.grupo_id = u.grupo_matriz_id),
                0
              )
            )::numeric,
            1
          ),
          0
        )::float AS porcentaje_avance
      FROM usuarios u
      LEFT JOIN programas p
        ON p.id = u.programa_id
      LEFT JOIN perfiles_indicador pi
        ON pi.id = u.perfil_indicador_id
      LEFT JOIN grupos_matriz gm
        ON gm.id = u.grupo_matriz_id
      WHERE u.rol = 'docente'
      ORDER BY escuela_nombre, programa_nombre, u.apellido, u.nombre
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const docentes = result.rows.map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      role: "Docente",
      program: row.programa_nombre || "Sin programa",
      school: row.escuela_nombre,
      status: row.estado === "activo" ? "active" : "delayed",
      perfil_id: row.perfil_indicador_id || null,
      perfil_nombre: row.perfil_nombre || null,
      tipo_docente: row.tipo_docente || null,
      regional: row.regional || null,
      link_drive: row.link_drive || null,
      grupo_matriz_id: row.grupo_matriz_id || null,
      grupo_matriz_nombre: row.grupo_matriz_nombre || null,
      porcentaje_avance: round1(row.porcentaje_avance ?? 0),
    }));

    res.json({
      docentes,
      data: docentes,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/docentes", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/semestres", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT DISTINCT semestre
      FROM grupos_matriz
      ORDER BY semestre DESC
      `
    );
    const semestres = (result.rows || []).map((r) => r.semestre).filter(Boolean);
    res.json({ semestres });
  } catch (error) {
    console.error("Error en GET /admin/semestres", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de grupos/plantillas de matriz (para asignación admin)
router.get("/grupos-matriz", async (req, res) => {
  const semestreQ = req.query.semestre;
  const params = [];
  let filter = "";
  if (semestreQ != null && String(semestreQ).trim() !== "") {
    params.push(String(semestreQ).trim());
    filter = `WHERE gm.semestre = $1`;
  }
  try {
    const result = await pool.query(
      `
      SELECT
        gm.id,
        gm.nombre,
        gm.descripcion,
        gm.tipo_docente,
        gm.horas_totales,
        gm.num_proyectos,
        gm.num_actividades,
        gm.num_convenios_nuevos,
        gm.num_convenios_dinamizados,
        gm.activo,
        gm.semestre,
        COALESCE(dc.num_docentes, 0)::int AS num_docentes
      FROM grupos_matriz gm
      LEFT JOIN (
        SELECT grupo_matriz_id, COUNT(*)::int AS num_docentes
        FROM usuarios
        WHERE rol = 'docente' AND grupo_matriz_id IS NOT NULL
        GROUP BY grupo_matriz_id
      ) dc ON dc.grupo_matriz_id = gm.id
      ${filter}
      ORDER BY gm.nombre ASC
      `,
      params
    );
    res.json({ grupos: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/grupos-matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/grupos-matriz/:id/clonar", async (req, res) => {
  const grupoId = Number(req.params.id);
  const { semestre_destino, clonar_plantillas } = req.body || {};
  if (!grupoId) {
    return res.status(400).json({ error: "id de grupo inválido" });
  }
  if (!isValidSemestreValue(semestre_destino)) {
    return res.status(400).json({
      error: "semestre_destino debe tener formato YYYYA o YYYYB (ej: 2026B)",
    });
  }
  const dest = String(semestre_destino).trim();
  const copiarPlantillas = clonar_plantillas !== false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const src = await client.query(`SELECT * FROM grupos_matriz WHERE id = $1`, [grupoId]);
    if (src.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Grupo no encontrado" });
    }
    const g = src.rows[0];
    const ins = await client.query(
      `
      INSERT INTO grupos_matriz (
        nombre, descripcion, tipo_docente, horas_totales,
        num_proyectos, num_actividades, num_convenios_nuevos,
        num_convenios_dinamizados, semestre, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *
      `,
      [
        g.nombre,
        g.descripcion ?? null,
        g.tipo_docente,
        g.horas_totales,
        g.num_proyectos,
        g.num_actividades,
        g.num_convenios_nuevos,
        g.num_convenios_dinamizados,
        dest,
      ]
    );
    const nuevo = ins.rows[0];
    let plantillas_clonadas = 0;
    if (copiarPlantillas) {
      const insP = await client.query(
        `
        INSERT INTO plantilla_entregables (
          grupo_id, numero, categoria, fase, mes,
          semana_numero, entregable, descripcion_evidencia, horas,
          dias_inicio_desde_feb, dias_fin_desde_feb
        )
        SELECT
          $1, numero, categoria, fase, mes, semana_numero, entregable,
          descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb
        FROM plantilla_entregables
        WHERE grupo_id = $2
        `,
        [nuevo.id, grupoId]
      );
      plantillas_clonadas = insP.rowCount || 0;
    }
    await client.query("COMMIT");
    res.status(201).json({ grupo: nuevo, plantillas_clonadas });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en POST /admin/grupos-matriz/:id/clonar", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

router.post("/grupos-matriz", async (req, res) => {
  const b = req.body || {};
  const {
    nombre,
    descripcion,
    tipo_docente,
    horas_totales,
    num_proyectos,
    num_actividades,
    num_convenios_nuevos,
    num_convenios_dinamizados,
    semestre,
  } = b;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: "nombre es requerido" });
  }
  if (!["ANTIGUO", "NUEVO"].includes(tipo_docente)) {
    return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
  }
  const horas = Number(horas_totales);
  if (!Number.isFinite(horas) || horas <= 0) {
    return res.status(400).json({ error: "horas_totales debe ser un número mayor que 0" });
  }
  const np = Number(num_proyectos);
  const na = Number(num_actividades);
  const ncn = Number(num_convenios_nuevos);
  const ncd = Number(num_convenios_dinamizados);
  if (
    ![np, na, ncn, ncd].every((n) => Number.isFinite(n) && n >= 0)
  ) {
    return res.status(400).json({
      error: "Los contadores num_proyectos, num_actividades y convenios deben ser >= 0",
    });
  }
  if (!isValidSemestreValue(semestre)) {
    return res.status(400).json({
      error: "semestre debe tener formato YYYYA o YYYYB (ej: 2026A)",
    });
  }

  try {
    const r = await pool.query(
      `
      INSERT INTO grupos_matriz (
        nombre, descripcion, tipo_docente, horas_totales,
        num_proyectos, num_actividades, num_convenios_nuevos,
        num_convenios_dinamizados, semestre, activo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *
      `,
      [
        String(nombre).trim(),
        descripcion != null ? String(descripcion) : null,
        tipo_docente,
        horas,
        np,
        na,
        ncn,
        ncd,
        String(semestre).trim(),
      ]
    );
    res.status(201).json({ grupo: r.rows[0] });
  } catch (error) {
    console.error("Error en POST /admin/grupos-matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/grupos-matriz/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const curR = await pool.query(
      `SELECT semestre FROM grupos_matriz WHERE id = $1`,
      [id]
    );
    if (curR.rowCount === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }
    const semestreActual = curR.rows[0].semestre;

    if (b.semestre !== undefined && b.semestre !== null) {
      const nuevoS = String(b.semestre).trim();
      if (!isValidSemestreValue(nuevoS)) {
        return res.status(400).json({ error: "semestre inválido (formato YYYYA o YYYYB)" });
      }
      if (nuevoS !== semestreActual) {
        const docC = await pool.query(
          `SELECT COUNT(*)::int AS n FROM usuarios WHERE grupo_matriz_id = $1`,
          [id]
        );
        if ((docC.rows[0]?.n ?? 0) > 0) {
          return res.status(400).json({
            error:
              "No se puede cambiar el semestre: hay docentes asignados a este grupo. Desasigna los docentes primero.",
          });
        }
      }
    }

    const sets = [];
    const vals = [];
    let i = 1;
    const add = (col, val) => {
      sets.push(`${col} = $${i++}`);
      vals.push(val);
    };

    if (b.nombre !== undefined) {
      if (!String(b.nombre).trim()) {
        return res.status(400).json({ error: "nombre no puede estar vacío" });
      }
      add("nombre", String(b.nombre).trim());
    }
    if (b.descripcion !== undefined) {
      add("descripcion", b.descripcion == null ? null : String(b.descripcion));
    }
    if (b.tipo_docente !== undefined) {
      if (!["ANTIGUO", "NUEVO"].includes(b.tipo_docente)) {
        return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
      }
      add("tipo_docente", b.tipo_docente);
    }
    if (b.horas_totales !== undefined) {
      const h = Number(b.horas_totales);
      if (!Number.isFinite(h) || h <= 0) {
        return res.status(400).json({ error: "horas_totales debe ser > 0" });
      }
      add("horas_totales", h);
    }
    if (b.num_proyectos !== undefined) {
      const n = Number(b.num_proyectos);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "num_proyectos debe ser >= 0" });
      }
      add("num_proyectos", n);
    }
    if (b.num_actividades !== undefined) {
      const n = Number(b.num_actividades);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "num_actividades debe ser >= 0" });
      }
      add("num_actividades", n);
    }
    if (b.num_convenios_nuevos !== undefined) {
      const n = Number(b.num_convenios_nuevos);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "num_convenios_nuevos debe ser >= 0" });
      }
      add("num_convenios_nuevos", n);
    }
    if (b.num_convenios_dinamizados !== undefined) {
      const n = Number(b.num_convenios_dinamizados);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "num_convenios_dinamizados debe ser >= 0" });
      }
      add("num_convenios_dinamizados", n);
    }
    if (b.semestre !== undefined && b.semestre !== null) {
      add("semestre", String(b.semestre).trim());
    }
    if (b.activo !== undefined) {
      add("activo", Boolean(b.activo));
    }

    if (sets.length === 0) {
      const full = await pool.query(`SELECT * FROM grupos_matriz WHERE id = $1`, [id]);
      return res.json({ grupo: full.rows[0] });
    }

    vals.push(id);
    const upd = await pool.query(
      `
      UPDATE grupos_matriz
      SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING *
      `,
      vals
    );
    res.json({ grupo: upd.rows[0] });
  } catch (error) {
    console.error("Error en PUT /admin/grupos-matriz/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.delete("/grupos-matriz/:id", async (req, res) => {
  const id = Number(req.params.id);
  const forzar = String(req.query.forzar || "") === "true";
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  const client = await pool.connect();
  try {
    const ex = await client.query(`SELECT id FROM grupos_matriz WHERE id = $1`, [id]);
    if (ex.rowCount === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const docQ = await client.query(
      `SELECT COUNT(*)::int AS n FROM usuarios WHERE grupo_matriz_id = $1`,
      [id]
    );
    const nDoc = docQ.rows[0]?.n ?? 0;
    if (nDoc > 0) {
      return res.status(400).json({
        error: `Desasigna los docentes antes de eliminar este grupo (${nDoc} docente(s) asignado(s)).`,
      });
    }

    const tplQ = await client.query(
      `SELECT COUNT(*)::int AS n FROM plantilla_entregables WHERE grupo_id = $1`,
      [id]
    );
    const nTpl = tplQ.rows[0]?.n ?? 0;
    if (nTpl > 0 && !forzar) {
      return res.status(400).json({
        error:
          "Este grupo tiene plantillas de entregables. Confirma si deseas eliminarlas junto con el grupo.",
        tiene_plantillas: true,
        num_plantillas: nTpl,
      });
    }

    await client.query("BEGIN");
    if (forzar && nTpl > 0) {
      await client.query(`DELETE FROM plantilla_entregables WHERE grupo_id = $1`, [id]);
    }
    await client.query(`DELETE FROM grupos_matriz WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en DELETE /admin/grupos-matriz/:id", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// GET /admin/indicadores-grupo
router.get("/indicadores-grupo", async (req, res) => {
  const semestreQ = req.query.semestre;
  const params = [];
  let semFilter = "";
  if (semestreQ != null && String(semestreQ).trim() !== "") {
    params.push(String(semestreQ).trim());
    semFilter = `AND gm.semestre = $${params.length}`;
  }
  try {
    const result = await pool.query(
      `
      SELECT
        gm.id,
        gm.nombre,
        gm.descripcion,
        gm.semestre,
        gm.tipo_docente,
        gm.horas_totales,
        gm.num_proyectos,
        gm.num_actividades,
        gm.num_convenios_nuevos,
        gm.num_convenios_dinamizados,
        COALESCE(doc.num_docentes, 0)::int AS num_docentes,
        COALESCE(pt.num_plantilla_entregables, 0)::int AS num_plantilla_entregables
      FROM grupos_matriz gm
      LEFT JOIN (
        SELECT
          grupo_matriz_id,
          COUNT(DISTINCT id)::int AS num_docentes
        FROM usuarios
        WHERE rol = 'docente'
        GROUP BY grupo_matriz_id
      ) doc
        ON doc.grupo_matriz_id = gm.id
      LEFT JOIN (
        SELECT
          grupo_id,
          COUNT(*)::int AS num_plantilla_entregables
        FROM plantilla_entregables
        GROUP BY grupo_id
      ) pt
        ON pt.grupo_id = gm.id
      WHERE gm.activo = true
      ${semFilter}
      ORDER BY gm.tipo_docente DESC, gm.horas_totales DESC
      `,
      params
    );

    res.json({ grupos: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/indicadores-grupo", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/tipo-docente", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { tipo_docente } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  if (!["ANTIGUO", "NUEVO"].includes(tipo_docente)) {
    return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
  }

  try {
    await pool.query(
      `UPDATE usuarios SET tipo_docente = $1 WHERE id = $2 AND rol = 'docente'`,
      [tipo_docente, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/tipo-docente", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/info-contacto", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { regional, link_drive } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  const sets = [];
  const vals = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "regional")) {
    sets.push(`regional = $${i++}`);
    vals.push(regional ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "link_drive")) {
    sets.push(`link_drive = $${i++}`);
    vals.push(link_drive ?? null);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Debes enviar regional y/o link_drive" });
  }
  vals.push(docenteId);

  try {
    await pool.query(
      `
      UPDATE usuarios
      SET ${sets.join(", ")}
      WHERE id = $${i} AND rol = 'docente'
      `,
      vals
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/info-contacto", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/grupo-matriz", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { grupo_matriz_id } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    await pool.query(
      `
      UPDATE usuarios
      SET grupo_matriz_id = $1
      WHERE id = $2 AND rol = 'docente'
      `,
      [grupo_matriz_id || null, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/grupo-matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de usuarios (docentes y administradores) para gestión
router.get("/usuarios", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50);
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM usuarios u
      WHERE u.rol IN ('docente', 'admin')
      `
    );
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.estado,
        u.programa_id,
        u.tipo_docente,
        u.grupo_matriz_id,
        p.nombre   AS programa_nombre,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        gm.nombre AS grupo_matriz_nombre
      FROM usuarios u
      LEFT JOIN programas p ON p.id = u.programa_id
      LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
      WHERE u.rol IN ('docente', 'admin')
      ORDER BY escuela_nombre, programa_nombre, u.apellido, u.nombre
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const usuarios = (result.rows || []).map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      rol: row.rol,
      role: row.rol === "admin" ? "Administrador" : "Docente",
      program: row.programa_nombre || "Sin programa",
      school: row.escuela_nombre,
      status: row.estado === "activo" ? "active" : "delayed",
      tipo_docente: row.tipo_docente || null,
      programa_id: row.programa_id || null,
      grupo_matriz_id: row.grupo_matriz_id || null,
      grupo_matriz_nombre: row.grupo_matriz_nombre || null,
    }));

    res.json({
      usuarios,
      data: usuarios,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en GET /admin/usuarios", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/usuarios/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const { nombre, apellido, correo, rol, programa_id } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "id de usuario inválido" });
  }
  if (!nombre || !String(nombre).trim() || !apellido || !String(apellido).trim()) {
    return res.status(400).json({ error: "nombre y apellido son obligatorios" });
  }
  if (!correo || !String(correo).trim()) {
    return res.status(400).json({ error: "correo es obligatorio" });
  }
  const rolDb = rol === "admin" ? "admin" : rol === "docente" ? "docente" : null;
  if (!rolDb) {
    return res.status(400).json({ error: "rol debe ser admin o docente" });
  }

  const progId =
    programa_id === null || programa_id === ""
      ? null
      : Number(programa_id);

  try {
    const r = await pool.query(
      `
      UPDATE usuarios
      SET
        nombre = $1,
        apellido = $2,
        correo = $3,
        rol = $4,
        programa_id = $5
      WHERE id = $6
        AND rol IN ('docente', 'admin')
      RETURNING id, nombre, apellido, correo, rol, programa_id, estado,
                tipo_docente, grupo_matriz_id
      `,
      [String(nombre).trim(), String(apellido).trim(), String(correo).trim(), rolDb, progId, userId]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const u = r.rows[0];
    let programaNombre = null;
    let escuelaNombre = null;
    if (u.programa_id) {
      const p = await pool.query(
        "SELECT nombre, facultad FROM programas WHERE id = $1",
        [u.programa_id]
      );
      if (p.rowCount > 0) {
        programaNombre = p.rows[0].nombre;
        escuelaNombre = p.rows[0].facultad || "Sin escuela";
      }
    }
    let grupoNombre = null;
    if (u.grupo_matriz_id) {
      const g = await pool.query("SELECT nombre FROM grupos_matriz WHERE id = $1", [
        u.grupo_matriz_id,
      ]);
      if (g.rowCount > 0) grupoNombre = g.rows[0].nombre;
    }
    res.json({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      name: `${u.nombre} ${u.apellido}`,
      email: u.correo,
      role: u.rol === "admin" ? "Administrador" : "Docente",
      rol: u.rol,
      programa_id: u.programa_id,
      program: programaNombre || "Sin programa",
      school: escuelaNombre || "Sin escuela",
      status: u.estado === "activo" ? "active" : "delayed",
      tipo_docente: u.tipo_docente || null,
      grupo_matriz_id: u.grupo_matriz_id || null,
      grupo_matriz_nombre: grupoNombre || null,
    });
  } catch (error) {
    console.error("Error en PUT /admin/usuarios/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.delete("/usuarios/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "id de usuario inválido" });
  }

  const client = await pool.connect();
  try {
    const u = await client.query(
      `SELECT id, rol, nombre, apellido FROM usuarios WHERE id = $1 AND rol IN ('docente', 'admin')`,
      [userId]
    );
    if (u.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const asResp = await client.query(
      `SELECT COUNT(*)::int AS n FROM proyectos WHERE docente_responsable_id = $1`,
      [userId]
    );
    const n = asResp.rows[0]?.n ?? 0;
    if (n > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: el usuario es responsable de ${n} iniciativa(s). Reasigne el docente responsable antes de eliminar.`,
      });
    }

    await client.query(`DELETE FROM usuarios WHERE id = $1`, [userId]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /admin/usuarios/:id", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

router.post("/usuarios", async (req, res) => {
  const {
    nombres,
    apellidos,
    correo,
    rol,
    programaNombre,
    tipo_docente,
    regional,
    link_drive,
    grupo_matriz_id,
  } = req.body || {};

  if (!nombres || !apellidos || !correo || !rol) {
    return res
      .status(400)
      .json({ error: "nombres, apellidos, correo y rol son obligatorios" });
  }

  try {
    let programaId = null;
    if (programaNombre) {
      const programa = await pool.query(
        "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
        [programaNombre]
      );
      if (programa.rowCount > 0) {
        programaId = programa.rows[0].id;
      }
    }

    const result = await pool.query(
      `
      INSERT INTO usuarios (
        nombre,
        apellido,
        correo,
        password_hash,
        rol,
        programa_id,
        estado,
        tipo_docente,
        regional,
        link_drive,
        grupo_matriz_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'activo', $7, $8, $9, $10)
      RETURNING id, nombre, apellido, correo, rol, estado, programa_id,
                tipo_docente, regional, link_drive, grupo_matriz_id
      `,
      [
        nombres,
        apellidos,
        correo,
        "cun123",
        rol === "admin" ? "admin" : "docente",
        programaId,
        tipo_docente || "ANTIGUO",
        regional || null,
        link_drive || null,
        grupo_matriz_id || null,
      ]
    );

    const created = result.rows[0];

    let programaNombreCreado = null;
    let escuelaNombreCreada = null;
    if (created.programa_id) {
      const programa = await pool.query(
        "SELECT nombre, facultad FROM programas WHERE id = $1",
        [created.programa_id]
      );
      if (programa.rowCount > 0) {
        programaNombreCreado = programa.rows[0].nombre;
        escuelaNombreCreada = programa.rows[0].facultad || "Sin escuela";
      }
    }

    res.status(201).json({
      id: created.id,
      name: `${created.nombre} ${created.apellido}`,
      email: created.correo,
      role: created.rol === "admin" ? "Administrador" : "Docente",
      program: programaNombreCreado || "Sin programa",
      school: escuelaNombreCreada || "Sin escuela",
      status: created.estado === "activo" ? "active" : "delayed",
      passwordTemporal: "cun123",
    });
  } catch (error) {
    console.error("Error en /admin/usuarios", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/proyectos", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM proyectos p
      `
    );
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.titulo,
        p.descripcion,
        p.tipo,
        p.estado,
        p.fecha_inicio,
        p.fecha_fin_estimada,
        p.horas_totales,
        p.semanas,
        u.id AS coordinador_id,
        u.nombre || ' ' || u.apellido AS coordinador,
        prog.nombre AS programa
      FROM proyectos p
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      ORDER BY p.fecha_inicio DESC, p.id DESC
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const proyectos = result.rows.map((row) => ({
      id: row.id,
      name: row.titulo,
      description: row.descripcion,
      coordinatorId: row.coordinador_id,
      coordinator: row.coordinador || "Sin asignar",
      program: row.programa || "Sin programa",
      type:
        row.tipo === "convenio"
          ? "agreement"
          : row.tipo === "proyecto"
          ? "project"
          : "activity",
      status:
        row.estado === "en_ejecucion"
          ? "active"
          : row.estado === "completado"
          ? "inactive"
          : "delayed",
      startDate: row.fecha_inicio,
      endDate: row.fecha_fin_estimada,
      totalHours: row.horas_totales,
      weeks: row.semanas,
    }));

    res.json({
      proyectos,
      data: proyectos,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/proyectos (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/proyectos-semanas", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id                              AS proyecto_id,
        p.titulo                          AS proyecto_titulo,
        s.id                              AS semana_id,
        s.numero                          AS semana_numero,
        s.fecha_inicio                    AS semana_fecha_inicio,
        s.fecha_fin                       AS semana_fecha_fin,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'texto', e.descripcion,
              'horas', e.horas,
              'completado', COALESCE(e.completado, false),
              'url_evidencia', e.url_evidencia
            )
            ORDER BY e.id
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        )                                 AS entregables
      FROM proyectos p
      JOIN proyecto_semanas s
        ON s.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e
        ON e.proyecto_semana_id = s.id
      GROUP BY
        p.id,
        p.titulo,
        s.id,
        s.numero,
        s.fecha_inicio,
        s.fecha_fin
      ORDER BY p.titulo, s.numero
      `
    );

    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.proyecto_id)) {
        map.set(row.proyecto_id, {
          id: row.proyecto_id,
          name: row.proyecto_titulo,
          weeks: [],
        });
      }
      const proj = map.get(row.proyecto_id);
      proj.weeks.push({
        id: row.semana_id,
        numero: row.semana_numero,
        fechaInicio: row.semana_fecha_inicio,
        fechaFin: row.semana_fecha_fin,
        entregables: row.entregables || [],
      });
    }

    res.json({ proyectos: Array.from(map.values()) });
  } catch (error) {
    console.error("Error en /admin/proyectos-semanas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/proyectos/:id/docentes", async (req, res) => {
  const proyectoId = Number(req.params.id);
  if (!proyectoId) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        p.nombre AS programa_nombre
      FROM proyecto_docentes pd
      JOIN usuarios u ON u.id = pd.docente_id
      LEFT JOIN programas p ON p.id = u.programa_id
      WHERE pd.proyecto_id = $1
      ORDER BY u.apellido, u.nombre
      `,
      [proyectoId]
    );

    const docentes = result.rows.map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      program: row.programa_nombre || "Sin programa",
    }));

    res.json({ docentes });
  } catch (error) {
    console.error("Error en /admin/proyectos/:id/docentes (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/proyectos/:id/docentes", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const body = req.body || {};
  const { docenteIds, docentes: docentesBody } = body;

  if (!proyectoId) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  let lista = [];

  if (Array.isArray(docentesBody)) {
    lista = docentesBody
      .map((d) => {
        const idNum = Number(d?.id);
        const gm =
          d?.grupo_matriz_id != null && d.grupo_matriz_id !== ""
            ? Number(d.grupo_matriz_id)
            : null;
        return {
          id: idNum,
          grupo_matriz_id:
            gm != null && !Number.isNaN(gm) && gm > 0 ? gm : null,
        };
      })
      .filter((d) => d.id > 0);
  } else if (Array.isArray(docenteIds)) {
    lista = docenteIds
      .map((id) => ({ id: Number(id), grupo_matriz_id: null }))
      .filter((d) => d.id > 0);
  } else {
    return res.status(400).json({
      error:
        "Se requiere docentes: [{ id, grupo_matriz_id? }] o docenteIds: number[]",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM proyecto_docentes WHERE proyecto_id = $1", [
      proyectoId,
    ]);

    for (const row of lista) {
      await client.query(
        `
        INSERT INTO proyecto_docentes (proyecto_id, docente_id, rol)
        VALUES ($1, $2, 'colaborador')
        ON CONFLICT (proyecto_id, docente_id) DO NOTHING
        `,
        [proyectoId, row.id]
      );
    }

    for (const row of lista) {
      if (!row.grupo_matriz_id) continue;

      const existsGrupo = await client.query(
        `SELECT 1 FROM grupos_matriz WHERE id = $1`,
        [row.grupo_matriz_id]
      );
      if (existsGrupo.rowCount === 0) continue;

      const uRes = await client.query(
        `
        SELECT grupo_matriz_id
        FROM usuarios
        WHERE id = $1 AND rol = 'docente'
        FOR UPDATE
        `,
        [row.id]
      );
      if (uRes.rowCount === 0) continue;
      if (uRes.rows[0].grupo_matriz_id != null) continue;

      await client.query(
        `
        UPDATE usuarios
        SET grupo_matriz_id = $1
        WHERE id = $2 AND rol = 'docente' AND grupo_matriz_id IS NULL
        `,
        [row.grupo_matriz_id, row.id]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /admin/proyectos/:id/docentes (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al asignar docentes" });
  } finally {
    client.release();
  }
});

router.post("/proyectos/:id/entregables-semanales", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const { semanas } = req.body || {};

  if (!proyectoId || !Array.isArray(semanas)) {
    return res
      .status(400)
      .json({ error: "proyectoId inválido o formato de semanas incorrecto" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      DELETE FROM proyecto_entregables
      WHERE proyecto_semana_id IN (
        SELECT id FROM proyecto_semanas WHERE proyecto_id = $1
      )
      `,
      [proyectoId]
    );

    for (const semana of semanas) {
      if (!semana || !semana.semanaId || !Array.isArray(semana.entregables)) {
        continue;
      }
      for (const ent of semana.entregables) {
        const texto =
          typeof ent === "string"
            ? ent
            : ent && typeof ent.texto === "string"
            ? ent.texto
            : "";
        const horasRaw =
          typeof ent === "object" && ent !== null ? ent.horas ?? null : null;
        const trimmed = (texto || "").trim();
        if (!trimmed) continue;
        const horas =
          horasRaw !== null && horasRaw !== undefined && horasRaw !== ""
            ? Number(horasRaw)
            : null;
        await client.query(
          `
          INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas)
          VALUES ($1, $2, $3)
          `,
          [semana.semanaId, trimmed, isNaN(horas) ? null : horas]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /admin/proyectos/:id/entregables-semanales (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al guardar entregables" });
  } finally {
    client.release();
  }
});

router.post("/proyectos", async (req, res) => {
  const {
    titulo,
    descripcion,
    programaNombre,
    docenteId,
    tipoVisual,
    estado,
    fechaInicio,
    fechaFin,
    horasTotales,
    semanas,
    semanasDetalle,
    semanasEntregables,
  } = req.body || {};

  if (!titulo || !programaNombre || !docenteId) {
    return res
      .status(400)
      .json({ error: "titulo, programaNombre y docenteId son obligatorios" });
  }

  const tipo =
    tipoVisual === "agreement"
      ? "convenio"
      : tipoVisual === "activity"
      ? "actividad"
      : "proyecto";
  const estadoProyecto = estado || "en_ejecucion";

  try {
    const prog = await pool.query(
      "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
      [programaNombre]
    );
    if (prog.rowCount === 0) {
      return res.status(400).json({ error: "Programa no encontrado" });
    }

    const docente = await pool.query(
      "SELECT id, nombre, apellido FROM usuarios WHERE id = $1 LIMIT 1",
      [docenteId]
    );
    if (docente.rowCount === 0) {
      return res.status(400).json({ error: "Docente no encontrado" });
    }

    const insert = await pool.query(
      `
      INSERT INTO proyectos
        (titulo, descripcion, programa_id, docente_responsable_id, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, titulo, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas
      `,
      [
        titulo,
        descripcion || "",
        prog.rows[0].id,
        docente.rows[0].id,
        tipo,
        estadoProyecto,
        fechaInicio || new Date().toISOString().slice(0, 10),
        fechaFin || null,
        horasTotales != null ? Number(horasTotales) : null,
        semanas != null ? Number(semanas) : null,
      ]
    );

    const created = insert.rows[0];
    const detalle = Array.isArray(semanasDetalle) ? semanasDetalle : null;

    if (detalle && detalle.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      for (const semana of detalle) {
        if (!semana || !semana.numero || !semana.fechaInicio || !semana.fechaFin) {
          continue;
        }
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        params.push(
          created.id,
          Number(semana.numero),
          String(semana.fechaInicio),
          String(semana.fechaFin)
        );
      }

      if (values.length > 0) {
        await pool.query(
          `
          INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
          VALUES ${values.join(", ")}
          `,
          params
        );
      }
    } else if (created.semanas && created.fecha_inicio) {
      const semanasCantidad = Number(created.semanas);
      const start = new Date(created.fecha_inicio);

      const values = [];
      const params = [];
      let paramIndex = 1;

      for (let i = 0; i < semanasCantidad; i++) {
        const semanaNumero = i + 1;
        const semanaInicio = new Date(start);
        semanaInicio.setDate(start.getDate() + i * 7);
        const semanaFin = new Date(semanaInicio);
        semanaFin.setDate(semanaInicio.getDate() + 6);

        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(
          created.id,
          semanaNumero,
          semanaInicio.toISOString().slice(0, 10),
          semanaFin.toISOString().slice(0, 10)
        );
      }

      if (values.length > 0) {
        await pool.query(
          `
          INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
          VALUES ${values.join(", ")}
          `,
          params
        );
      }
    }

    const entregablesIniciales = Array.isArray(semanasEntregables)
      ? semanasEntregables
      : null;

    if (entregablesIniciales && entregablesIniciales.length > 0) {
      const semanasRows = await pool.query(
        "SELECT id, numero FROM proyecto_semanas WHERE proyecto_id = $1",
        [created.id]
      );
      const numToId = new Map();
      for (const row of semanasRows.rows) {
        numToId.set(Number(row.numero), row.id);
      }

      for (const semana of entregablesIniciales) {
        if (!semana || semana.numero == null || !Array.isArray(semana.entregables)) {
          continue;
        }
        const semanaId = numToId.get(Number(semana.numero));
        if (!semanaId) continue;
        for (const ent of semana.entregables) {
          const texto =
            typeof ent === "string"
              ? ent
              : ent && typeof ent.texto === "string"
              ? ent.texto
              : "";
          const horasRaw =
            typeof ent === "object" && ent !== null ? ent.horas ?? null : null;
          const trimmed = (texto || "").trim();
          if (!trimmed) continue;
          const horas =
            horasRaw !== null && horasRaw !== undefined && horasRaw !== ""
              ? Number(horasRaw)
              : null;
          await pool.query(
            `
            INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas)
            VALUES ($1, $2, $3)
            `,
            [semanaId, trimmed, isNaN(horas) ? null : horas]
          );
        }
      }
    }

    res.status(201).json({
      id: created.id,
      name: created.titulo,
      type:
        tipo === "convenio"
          ? "agreement"
          : tipo === "actividad"
          ? "activity"
          : "project",
      status: estadoProyecto === "en_ejecucion" ? "active" : "delayed",
      startDate: created.fecha_inicio,
      endDate: created.fecha_fin_estimada,
      totalHours: created.horas_totales,
      weeks: created.semanas,
    });
  } catch (error) {
    console.error("Error en /admin/proyectos (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno en creación de proyecto" });
  }
});

router.put("/proyectos/:id", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const { fechaInicio, fechaFin } = req.body || {};
  if (!proyectoId) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }
  try {
    const fields = [];
    const params = [];
    let i = 1;
    if (fechaInicio !== undefined) {
      fields.push(`fecha_inicio = $${i++}`);
      params.push(fechaInicio || null);
    }
    if (fechaFin !== undefined) {
      fields.push(`fecha_fin_estimada = $${i++}`);
      params.push(fechaFin || null);
    }
    if (fields.length === 0) {
      return res.json({ ok: true });
    }
    params.push(proyectoId);
    await pool.query(
      `UPDATE proyectos SET ${fields.join(", ")} WHERE id = $${i}`,
      params
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/proyectos/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/perfiles-indicador", async (_req, res) => {
  try {
    const [perfilesResult, asignacionesResult] = await Promise.all([
      pool.query(
        `
        SELECT
          id,
          nombre,
          num_proyectos,
          num_actividades,
          num_convenios_nuevos,
          num_convenios_dinamizados,
          (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
        FROM perfiles_indicador
        ORDER BY nombre
        `
      ),
      pool.query(
        `
        SELECT
          ppi.programa_id,
          ppi.perfil_id,
          ppi.semestre,
          p.nombre AS programa_nombre
        FROM programa_perfil_indicador ppi
        JOIN programas p ON p.id = ppi.programa_id
        ORDER BY p.nombre
        `
      ),
    ]);

    res.json({
      perfiles: perfilesResult.rows || [],
      asignaciones: asignacionesResult.rows || [],
    });
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/perfiles-indicador", async (req, res) => {
  const {
    nombre,
    num_proyectos,
    num_actividades,
    num_convenios_nuevos,
    num_convenios_dinamizados,
    num_convenios,
  } = req.body || {};

  const nProy = Number(num_proyectos ?? 0);
  const nAct = Number(num_actividades ?? 0);
  const nConvNuevos =
    num_convenios_nuevos !== undefined && num_convenios_nuevos !== null
      ? Number(num_convenios_nuevos ?? 0)
      : Number(num_convenios ?? 0);
  const nConvDinamizados =
    num_convenios_dinamizados !== undefined && num_convenios_dinamizados !== null
      ? Number(num_convenios_dinamizados ?? 0)
      : 0;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del perfil es obligatorio." });
  }
  if (nProy < 0 || nAct < 0 || nConvNuevos < 0 || nConvDinamizados < 0) {
    return res
      .status(400)
      .json({
        error:
          "Los números de proyectos, actividades y convenios deben ser mayores o iguales a 0.",
      });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO perfiles_indicador (
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados,
        (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
      `,
      [nombre.trim(), nProy, nAct, nConvNuevos, nConvDinamizados]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al crear perfil" });
  }
});

router.put("/perfiles-indicador/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    nombre,
    num_proyectos,
    num_actividades,
    num_convenios_nuevos,
    num_convenios_dinamizados,
    num_convenios,
  } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: "ID de perfil inválido." });
  }

  const nProy = Number(num_proyectos ?? 0);
  const nAct = Number(num_actividades ?? 0);
  const nConvNuevos =
    num_convenios_nuevos !== undefined && num_convenios_nuevos !== null
      ? Number(num_convenios_nuevos ?? 0)
      : Number(num_convenios ?? 0);
  const nConvDinamizados =
    num_convenios_dinamizados !== undefined && num_convenios_dinamizados !== null
      ? Number(num_convenios_dinamizados ?? 0)
      : 0;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del perfil es obligatorio." });
  }
  if (nProy < 0 || nAct < 0 || nConvNuevos < 0 || nConvDinamizados < 0) {
    return res
      .status(400)
      .json({
        error:
          "Los números de proyectos, actividades y convenios deben ser mayores o iguales a 0.",
      });
  }

  try {
    const result = await pool.query(
      `
      UPDATE perfiles_indicador
      SET nombre = $1,
          num_proyectos = $2,
          num_actividades = $3,
          num_convenios_nuevos = $4,
          num_convenios_dinamizados = $5
      WHERE id = $6
      RETURNING
        id,
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados,
        (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
      `,
      [nombre.trim(), nProy, nAct, nConvNuevos, nConvDinamizados, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Perfil no encontrado." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador/:id (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al actualizar perfil" });
  }
});

router.delete("/perfiles-indicador/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "ID de perfil inválido." });
  }

  try {
    const asignaciones = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM programa_perfil_indicador
      WHERE perfil_id = $1
      `,
      [id]
    );

    const total = asignaciones.rows[0]?.total ?? 0;
    if (total > 0) {
      return res.status(409).json({
        error: "No se puede eliminar el perfil porque tiene programas asignados.",
      });
    }

    await pool.query("DELETE FROM perfiles_indicador WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador/:id (DELETE)", {
      mensaje: (error && error.message) || String(error),
    });
    res.status(500).json({ error: "Error interno al eliminar perfil" });
  }
});

router.get("/programas", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela,
        ppi.perfil_id,
        ppi.semestre,
        pi.nombre AS perfil_nombre
      FROM programas p
      LEFT JOIN programa_perfil_indicador ppi
        ON ppi.programa_id = p.id
       AND ppi.semestre = '2025C'
      LEFT JOIN perfiles_indicador pi
        ON pi.id = ppi.perfil_id
      ORDER BY escuela, p.nombre
      `
    );

    res.json({ programas: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/programas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/programas/:id/perfil", async (req, res) => {
  const programaId = Number(req.params.id);
  const { perfil_id, semestre } = req.body || {};

  if (!programaId) {
    return res.status(400).json({ error: "ID de programa inválido." });
  }
  if (!semestre || typeof semestre !== "string" || !semestre.trim()) {
    return res.status(400).json({ error: "El semestre es obligatorio." });
  }

  try {
    if (perfil_id === null || perfil_id === undefined) {
      await pool.query(
        `
        DELETE FROM programa_perfil_indicador
        WHERE programa_id = $1 AND semestre = $2
        `,
        [programaId, semestre]
      );
      return res.json({ ok: true });
    }

    const perfilIdNum = Number(perfil_id);
    if (!perfilIdNum) {
      return res.status(400).json({ error: "perfil_id inválido." });
    }

    await pool.query(
      `
      INSERT INTO programa_perfil_indicador (programa_id, perfil_id, semestre)
      VALUES ($1, $2, $3)
      ON CONFLICT (programa_id, semestre)
      DO UPDATE SET perfil_id = EXCLUDED.perfil_id
      `,
      [programaId, perfilIdNum, semestre]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error en /admin/programas/:id/perfil (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al asignar perfil al programa" });
  }
});

router.put("/docentes/:id/perfil", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { perfil_id } = req.body || {};
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  try {
    await pool.query(
      "UPDATE usuarios SET perfil_indicador_id = $1 WHERE id = $2",
      [perfil_id || null, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/perfil", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// --- Matriz / perfil docente (admin, sin restricción de sesión docente) ---
router.get("/docentes/:docenteId/perfil", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const user = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.tipo_docente,
        u.regional,
        u.link_drive,
        u.programa_id,
        u.grupo_matriz_id,
        u.perfil_indicador_id,
        p.nombre AS programa_nombre,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        gm.id AS gm_id,
        gm.nombre AS gm_nombre,
        gm.horas_totales AS gm_horas,
        gm.num_proyectos AS gm_num_proyectos,
        gm.num_actividades AS gm_num_actividades,
        gm.num_convenios_nuevos AS gm_num_convenios_nuevos,
        gm.num_convenios_dinamizados AS gm_num_convenios_dinamizados,
        pi.id AS pi_id,
        pi.nombre AS pi_nombre,
        pi.num_proyectos AS pi_num_proyectos,
        pi.num_actividades AS pi_num_actividades,
        pi.num_convenios_nuevos AS pi_num_convenios_nuevos,
        pi.num_convenios_dinamizados AS pi_num_convenios_dinamizados
      FROM usuarios u
      LEFT JOIN programas p ON p.id = u.programa_id
      LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
      LEFT JOIN perfiles_indicador pi ON pi.id = u.perfil_indicador_id
      WHERE u.id = $1 AND u.rol = 'docente'
      `,
      [docenteId]
    );
    if (user.rowCount === 0) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }
    const row = user.rows[0];

    let totalPlantillas = 0;
    if (row.grupo_matriz_id != null) {
      const statsPlantilla = await pool.query(
        `SELECT COUNT(*)::int AS n FROM plantilla_entregables WHERE grupo_id = $1`,
        [row.grupo_matriz_id]
      );
      totalPlantillas = statsPlantilla.rows[0]?.n ?? 0;
    }

    const completadosQ = await pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      WHERE COALESCE(e.completado, false) = true
        AND (
          p.docente_responsable_id = $1
          OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
        )
      `,
      [docenteId]
    );
    const completados = completadosQ.rows[0]?.n ?? 0;
    const porcentajeAvance =
      totalPlantillas > 0 ? Math.round((completados / totalPlantillas) * 100) : 0;

    res.json({
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      correo: row.correo,
      rol: row.rol,
      tipo_docente: row.tipo_docente,
      regional: row.regional,
      link_drive: row.link_drive,
      programa: {
        id: row.programa_id,
        nombre: row.programa_nombre || "Sin programa",
      },
      escuela: {
        id: null,
        nombre: row.escuela_nombre || "Sin escuela",
      },
      grupo_matriz:
        row.grupo_matriz_id != null
          ? {
              id: row.gm_id,
              nombre: row.gm_nombre,
              horas_totales: row.gm_horas,
              num_proyectos: Number(row.gm_num_proyectos ?? 0),
              num_actividades: Number(row.gm_num_actividades ?? 0),
              num_convenios_nuevos: Number(row.gm_num_convenios_nuevos ?? 0),
              num_convenios_dinamizados: Number(row.gm_num_convenios_dinamizados ?? 0),
            }
          : null,
      perfil_indicador: row.pi_id
        ? {
            id: row.pi_id,
            nombre: row.pi_nombre,
            num_proyectos: Number(row.pi_num_proyectos ?? 0),
            num_actividades: Number(row.pi_num_actividades ?? 0),
            num_convenios_nuevos: Number(row.pi_num_convenios_nuevos ?? 0),
            num_convenios_dinamizados: Number(row.pi_num_convenios_dinamizados ?? 0),
          }
        : null,
      stats: {
        total_plantillas: totalPlantillas,
        completados,
        porcentaje_avance: porcentajeAvance,
      },
    });
  } catch (error) {
    console.error("Error en GET /admin/docentes/:docenteId/perfil", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/docentes/:docenteId/matriz-stats", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  const emptyPayload = () => ({
    resumen: {
      total_entregables: 0,
      completados: 0,
      porcentaje_semestral: 0,
    },
    por_mes: ["Febrero", "Marzo", "Abril", "Mayo"].map((mes) => ({
      mes,
      total: 0,
      completados: 0,
      porcentaje_mensual: 0,
    })),
    por_semana: [],
  });

  try {
    const userRes = await pool.query(
      `SELECT grupo_matriz_id FROM usuarios WHERE id = $1 AND rol = 'docente'`,
      [docenteId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "docente no encontrado" });
    }

    if (!userRes.rows[0].grupo_matriz_id) {
      return res.json(emptyPayload());
    }

    const baseRes = await pool.query(
      `
      SELECT
        tpl.mes,
        tpl.semana_numero,
        COALESCE(pe.completado, false) AS completado
      ${ADMIN_MATRIZ_PLANTILLA_JOIN}
      ${ADMIN_MATRIZ_ORDER}
      `,
      [docenteId]
    );

    const rows = baseRes.rows || [];
    const total = rows.length;
    const completados = rows.filter((r) => r.completado).length;
    const porcentaje_semestral = total > 0 ? round1((completados / total) * 100) : 0;

    const mesLabels = ["Febrero", "Marzo", "Abril", "Mayo"];
    const mesKeyToLabel = {
      febrero: "Febrero",
      marzo: "Marzo",
      abril: "Abril",
      mayo: "Mayo",
    };

    const por_mes = mesLabels.map((label) => {
      const sub = rows.filter(
        (r) => mesKeyToLabel[String(r.mes || "").toLowerCase()] === label
      );
      const t = sub.length;
      const c = sub.filter((r) => r.completado).length;
      return {
        mes: label,
        total: t,
        completados: c,
        porcentaje_mensual: t > 0 ? round1((c / t) * 100) : 0,
      };
    });

    const weekNums = [...new Set(rows.map((r) => Number(r.semana_numero)).filter(Boolean))].sort(
      (a, b) => a - b
    );

    const por_semana = weekNums.map((w) => {
      const sub = rows.filter((r) => Number(r.semana_numero) === w);
      const t = sub.length;
      const c = sub.filter((r) => r.completado).length;
      const accDone = rows.filter(
        (r) => Number(r.semana_numero) <= w && r.completado
      ).length;
      const sampleMes = sub[0]?.mes;
      const mes =
        mesKeyToLabel[String(sampleMes || "").toLowerCase()] || "Febrero";
      return {
        semana_numero: w,
        mes,
        total: t,
        completados: c,
        porcentaje_semanal: t > 0 ? round1((c / t) * 100) : 0,
        porcentaje_acumulado: total > 0 ? round1((accDone / total) * 100) : 0,
      };
    });

    res.json({
      resumen: {
        total_entregables: total,
        completados,
        porcentaje_semestral,
      },
      por_mes,
      por_semana,
    });
  } catch (error) {
    console.error("Error en GET /admin/docentes/:docenteId/matriz-stats", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/docentes/:docenteId/matriz", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const userRes = await pool.query(
      `SELECT grupo_matriz_id FROM usuarios WHERE id = $1 AND rol = 'docente'`,
      [docenteId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: "docente no encontrado" });
    }

    if (!userRes.rows[0].grupo_matriz_id) {
      return res.json({ items: [] });
    }

    const tplRes = await pool.query(
      `
      SELECT
        tpl.id,
        tpl.numero,
        tpl.categoria AS categoria_raw,
        tpl.fase AS fase_raw,
        tpl.mes,
        tpl.semana_numero,
        tpl.entregable,
        tpl.descripcion_evidencia,
        COALESCE(pe.horas, tpl.horas) AS horas_effective,
        (DATE '2026-02-10' + COALESCE(tpl.dias_inicio_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_inicio_calculada,
        (DATE '2026-02-10' + COALESCE(tpl.dias_fin_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_fin_calculada,
        pe.id AS entregable_id,
        COALESCE(pe.completado, false) AS completado,
        pe.fecha_real_entrega,
        pe.url_evidencia,
        pe.estado_revision,
        pe.comentario_revision,
        pe.porcentaje_avance,
        pe.actividad_reportada
      ${ADMIN_MATRIZ_PLANTILLA_JOIN}
      ${ADMIN_MATRIZ_ORDER}
      `,
      [docenteId]
    );

    const monthKeyMap = {
      febrero: "Febrero",
      marzo: "Marzo",
      abril: "Abril",
      mayo: "Mayo",
    };

    const items = (tplRes.rows || []).map((row) => {
      const mesKey = String(row.mes || "").toLowerCase();
      return {
        id: Number(row.id),
        numero: row.numero != null ? Number(row.numero) : 0,
        categoria: mapCategorySlug(row.categoria_raw, row.fase_raw),
        fase: row.fase_raw ? String(row.fase_raw).trim() : "",
        mes: monthKeyMap[mesKey] || row.mes || "",
        semana_numero: row.semana_numero != null ? Number(row.semana_numero) : 0,
        entregable: row.entregable,
        descripcion_evidencia: row.descripcion_evidencia || "",
        horas: row.horas_effective != null ? Number(row.horas_effective) : 0,
        fecha_inicio_calculada: toDateOnlyISO(row.fecha_inicio_calculada),
        fecha_fin_calculada: toDateOnlyISO(row.fecha_fin_calculada),
        entregable_id: row.entregable_id != null ? Number(row.entregable_id) : null,
        completado: Boolean(row.completado),
        fecha_real_entrega: toDateOnlyISO(row.fecha_real_entrega),
        url_evidencia: row.url_evidencia || null,
        estado_revision: row.estado_revision || null,
        comentario_revision: row.comentario_revision || null,
        porcentaje_avance:
          row.porcentaje_avance != null ? Number(row.porcentaje_avance) : null,
        actividad_reportada: row.actividad_reportada || null,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error("Error en GET /admin/docentes/:docenteId/matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/avance-consolidado", async (req, res) => {
  const semestreQ = req.query.semestre;
  const grupoIdQ = req.query.grupo_id;
  const semestre =
    semestreQ != null && String(semestreQ).trim() !== ""
      ? String(semestreQ).trim()
      : null;
  const grupoId =
    grupoIdQ != null && String(grupoIdQ).trim() !== ""
      ? Number(String(grupoIdQ).trim())
      : null;

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre || ' ' || u.apellido AS nombre,
        pr.nombre AS programa,
        u.regional,
        u.grupo_matriz_id AS grupo_id,
        gm.nombre AS grupo_nombre,
        COALESCE(u.tipo_docente, 'ANTIGUO') AS tipo_docente,
        COUNT(tpl.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'febrero') AS total_feb,
        COUNT(pe.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'febrero' AND COALESCE(pe.completado, false)) AS comp_feb,
        COUNT(tpl.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'marzo') AS total_mar,
        COUNT(pe.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'marzo' AND COALESCE(pe.completado, false)) AS comp_mar,
        COUNT(tpl.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'abril') AS total_abr,
        COUNT(pe.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'abril' AND COALESCE(pe.completado, false)) AS comp_abr,
        COUNT(tpl.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'mayo') AS total_may,
        COUNT(pe.id) FILTER (WHERE LOWER(TRIM(tpl.mes)) = 'mayo' AND COALESCE(pe.completado, false)) AS comp_may,
        COUNT(tpl.id) AS total_global,
        COUNT(pe.id) FILTER (WHERE COALESCE(pe.completado, false)) AS comp_global,
        MAX(pe.fecha_completado) AS ultimo_reporte
      FROM usuarios u
      LEFT JOIN programas pr ON pr.id = u.programa_id
      LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
      LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
      LEFT JOIN LATERAL (
        SELECT e.id, e.completado, e.fecha_completado
        FROM proyecto_entregables e
        INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
        INNER JOIN proyectos p ON p.id = s.proyecto_id
        WHERE s.numero = tpl.semana_numero
          AND (
            p.docente_responsable_id = u.id
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
          )
          AND (
            TRIM(e.descripcion) = TRIM(tpl.entregable)
            OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
          )
        ORDER BY e.id DESC
        LIMIT 1
      ) pe ON true
      WHERE u.rol = 'docente'
        AND ($1::text IS NULL OR gm.semestre = $1)
        AND ($2::int IS NULL OR u.grupo_matriz_id = $2)
      GROUP BY u.id, u.nombre, u.apellido, pr.nombre, u.regional,
               u.grupo_matriz_id, gm.nombre, u.tipo_docente
      ORDER BY u.nombre, u.apellido
      `,
      [semestre, grupoId != null && !Number.isNaN(grupoId) ? grupoId : null]
    );

    const rows = result.rows || [];

    const docentesPayload = [];
    for (const r of rows) {
      const gid = r.grupo_id != null ? Number(r.grupo_id) : null;
      let entregablesVencidos = 0;
      if (gid != null) {
        const venR = await pool.query(
          `
          SELECT COUNT(*)::int AS n
          FROM plantilla_entregables tpl
          WHERE tpl.grupo_id = $1
            AND tpl.dias_fin_desde_feb IS NOT NULL
            AND (DATE '2026-02-10' + tpl.dias_fin_desde_feb * INTERVAL '1 day')::date < CURRENT_DATE
            AND NOT EXISTS (
              SELECT 1
              FROM proyecto_entregables e
              INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
              INNER JOIN proyectos p ON p.id = s.proyecto_id
              WHERE s.numero = tpl.semana_numero
                AND (
                  p.docente_responsable_id = $2
                  OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
                )
                AND (
                  TRIM(e.descripcion) = TRIM(tpl.entregable)
                  OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
                )
                AND COALESCE(e.completado, false) = true
            )
          `,
          [gid, Number(r.id)]
        );
        entregablesVencidos = venR.rows[0]?.n ?? 0;
      }

      const pct = (c, t) => (t > 0 ? round1((c / t) * 100) : 0);
      const tf = Number(r.total_feb || 0);
      const cf = Number(r.comp_feb || 0);
      const tm = Number(r.total_mar || 0);
      const cm = Number(r.comp_mar || 0);
      const ta = Number(r.total_abr || 0);
      const ca = Number(r.comp_abr || 0);
      const ty = Number(r.total_may || 0);
      const cy = Number(r.comp_may || 0);
      const tg = Number(r.total_global || 0);
      const cg = Number(r.comp_global || 0);

      docentesPayload.push({
        id: Number(r.id),
        nombre: String(r.nombre || "").trim() || "—",
        programa: r.programa || "—",
        regional: r.regional || "—",
        grupo_id: gid,
        grupo_nombre: r.grupo_nombre || "—",
        tipo_docente: r.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO",
        avance_global: tg > 0 ? round1((cg / tg) * 100) : 0,
        avance_por_mes: {
          febrero: { completados: cf, total: tf, porcentaje: pct(cf, tf) },
          marzo: { completados: cm, total: tm, porcentaje: pct(cm, tm) },
          abril: { completados: ca, total: ta, porcentaje: pct(ca, ta) },
          mayo: { completados: cy, total: ty, porcentaje: pct(cy, ty) },
        },
        entregables_vencidos: entregablesVencidos,
        ultimo_reporte: toDateOnlyISO(r.ultimo_reporte),
      });
    }

    const n = docentesPayload.length;
    const avg = (arr) =>
      arr.length === 0 ? 0 : round1(arr.reduce((a, b) => a + b, 0) / arr.length);

    const promedio_global =
      n > 0 ? round1(docentesPayload.reduce((s, d) => s + d.avance_global, 0) / n) : 0;

    const mesKeys = ["febrero", "marzo", "abril", "mayo"];
    const por_mes = {};
    for (const mk of mesKeys) {
      const vals = docentesPayload
        .filter((d) => d.grupo_id != null && d.avance_por_mes[mk].total > 0)
        .map((d) => d.avance_por_mes[mk].porcentaje);
      por_mes[mk] = avg(vals);
    }

    res.json({
      docentes: docentesPayload,
      totales: {
        docentes: n,
        promedio_global,
        por_mes,
      },
    });
  } catch (error) {
    console.error("Error en GET /admin/avance-consolidado", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/grupos-matriz/:grupoId/plantillas", async (req, res) => {
  const grupoId = Number(req.params.grupoId);
  if (!grupoId) {
    return res.status(400).json({ error: "id de grupo inválido" });
  }
  try {
    const r = await pool.query(
      `
      SELECT * FROM plantilla_entregables
      WHERE grupo_id = $1
      ORDER BY semana_numero ASC NULLS LAST, numero ASC NULLS LAST
      `,
      [grupoId]
    );
    res.json({ plantillas: r.rows || [] });
  } catch (error) {
    console.error("Error en GET /admin/grupos-matriz/:grupoId/plantillas", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/grupos-matriz/:grupoId/plantillas", async (req, res) => {
  const grupoId = Number(req.params.grupoId);
  const b = req.body || {};
  if (!grupoId) {
    return res.status(400).json({ error: "id de grupo inválido" });
  }

  const {
    numero,
    categoria,
    fase,
    mes,
    semana_numero,
    entregable,
    descripcion_evidencia,
    horas,
    dias_inicio_desde_feb,
    dias_fin_desde_feb,
  } = b;

  if (
    numero == null ||
    !categoria ||
    !fase ||
    !mes ||
    semana_numero == null ||
    !entregable ||
    horas == null ||
    dias_inicio_desde_feb == null ||
    dias_fin_desde_feb == null
  ) {
    return res.status(400).json({ error: "Faltan campos obligatorios para la plantilla" });
  }

  try {
    const ex = await pool.query(`SELECT id FROM grupos_matriz WHERE id = $1`, [grupoId]);
    if (ex.rowCount === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const ins = await pool.query(
      `
      INSERT INTO plantilla_entregables (
        grupo_id, numero, categoria, fase, mes, semana_numero,
        entregable, descripcion_evidencia, horas,
        dias_inicio_desde_feb, dias_fin_desde_feb
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        grupoId,
        Number(numero),
        String(categoria),
        String(fase),
        String(mes),
        Number(semana_numero),
        String(entregable),
        descripcion_evidencia != null ? String(descripcion_evidencia) : "",
        Number(horas),
        Number(dias_inicio_desde_feb),
        Number(dias_fin_desde_feb),
      ]
    );
    res.status(201).json({ plantilla: ins.rows[0] });
  } catch (error) {
    console.error("Error en POST /admin/grupos-matriz/:grupoId/plantillas", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/plantillas/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  const sets = [];
  const vals = [];
  let i = 1;
  const add = (col, val) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };

  if (b.entregable !== undefined) add("entregable", String(b.entregable));
  if (b.descripcion_evidencia !== undefined) {
    add("descripcion_evidencia", b.descripcion_evidencia == null ? null : String(b.descripcion_evidencia));
  }
  if (b.horas !== undefined) add("horas", b.horas == null ? null : Number(b.horas));
  if (b.semana_numero !== undefined) add("semana_numero", Number(b.semana_numero));
  if (b.mes !== undefined) add("mes", b.mes == null ? null : String(b.mes));
  if (b.categoria !== undefined) add("categoria", b.categoria == null ? null : String(b.categoria));
  if (b.fase !== undefined) add("fase", b.fase == null ? null : String(b.fase));
  if (b.dias_inicio_desde_feb !== undefined) {
    add("dias_inicio_desde_feb", b.dias_inicio_desde_feb == null ? null : Number(b.dias_inicio_desde_feb));
  }
  if (b.dias_fin_desde_feb !== undefined) {
    add("dias_fin_desde_feb", b.dias_fin_desde_feb == null ? null : Number(b.dias_fin_desde_feb));
  }
  if (b.numero !== undefined) add("numero", b.numero == null ? null : Number(b.numero));

  if (sets.length === 0) {
    const cur = await pool.query(`SELECT * FROM plantilla_entregables WHERE id = $1`, [id]);
    if (cur.rowCount === 0) return res.status(404).json({ error: "Plantilla no encontrada" });
    return res.json({ plantilla: cur.rows[0] });
  }

  vals.push(id);
  try {
    const upd = await pool.query(
      `
      UPDATE plantilla_entregables
      SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING *
      `,
      vals
    );
    if (upd.rowCount === 0) {
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    res.json({ plantilla: upd.rows[0] });
  } catch (error) {
    console.error("Error en PUT /admin/plantillas/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.delete("/plantillas/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const tplR = await pool.query(
      `SELECT entregable FROM plantilla_entregables WHERE id = $1`,
      [id]
    );
    if (tplR.rowCount === 0) {
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    const texto = String(tplR.rows[0].entregable || "").trim();

    const cnt = await pool.query(
      `
      SELECT COUNT(*)::int AS n
      FROM proyecto_entregables
      WHERE TRIM(descripcion) = TRIM($1::text)
         OR TRIM(COALESCE(actividad_reportada, '')) = TRIM($1::text)
      `,
      [texto]
    );
    const usos = cnt.rows[0]?.n ?? 0;
    if (usos > 0) {
      return res.status(400).json({
        error:
          "No se puede eliminar: existen entregables de proyectos vinculados por texto a esta plantilla.",
        usos,
      });
    }

    await pool.query(`DELETE FROM plantilla_entregables WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en DELETE /admin/plantillas/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
