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

// Datos básicos para dashboard docente (proyectos asignados o como responsable)
router.get("/:id/dashboard", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const proyectos = await pool.query(
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
        prog.nombre AS programa_nombre,
        u.nombre || ' ' || u.apellido AS coordinador
      FROM proyectos p
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      ORDER BY p.fecha_inicio
      `,
      [docenteId]
    );

    res.json({
      proyectos: proyectos.rows,
    });
  } catch (error) {
    console.error("Error en /docente/:id/dashboard", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estadísticas y datos para el dashboard del docente (avance por mes, próximas entregas, actividades)
router.get("/:id/dashboard-stats", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const entregablesRows = await pool.query(
      `
      SELECT
        e.id,
        e.descripcion,
        COALESCE(e.completado, false) AS completado,
        e.fecha_completado,
        s.fecha_fin   AS semana_fecha_fin,
        s.numero      AS semana_numero,
        p.titulo      AS proyecto_titulo,
        p.id         AS proyecto_id
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON e.proyecto_semana_id = s.id
      JOIN proyectos p ON s.proyecto_id = p.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      ORDER BY s.fecha_fin, e.id
      `,
      [docenteId]
    );

    const items = entregablesRows.rows || [];
    const total = items.length;
    const completed = items.filter((i) => i.completado).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const monthNames = { 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo" };
    const byMonth = [];
    for (const [num, name] of Object.entries(monthNames)) {
      const mesNum = Number(num);
      const delMes = items.filter((i) => {
        const d = i.semana_fecha_fin ? new Date(i.semana_fecha_fin) : null;
        return d && d.getMonth() + 1 === mesNum;
      });
      const done = delMes.filter((i) => i.completado).length;
      byMonth.push({
        month: name,
        total: delMes.length,
        done,
        pct: delMes.length > 0 ? Math.round((done / delMes.length) * 100) : 0,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = items
      .filter((i) => !i.completado && i.semana_fecha_fin)
      .slice(0, 8)
      .map((i) => ({
        id: i.id,
        proyecto: i.proyecto_titulo,
        entregable: i.descripcion,
        fechaFin: i.semana_fecha_fin,
        semana: i.semana_numero,
      }));

    const activities = items.map((i) => {
      const fin = i.semana_fecha_fin ? new Date(i.semana_fecha_fin) : null;
      let status = "pending";
      if (i.completado) status = "approved";
      else if (fin && fin < today) status = "delayed";
      return {
        id: i.id,
        project: i.proyecto_titulo,
        activity: i.descripcion,
        deadline: fin
          ? fin.toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—",
        status,
      };
    });

    res.json({
      stats: { total, completed, pct },
      byMonth,
      upcoming,
      activities,
    });
  } catch (error) {
    console.error("Error en /docente/:id/dashboard-stats", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Cronograma (semanas + entregables) de proyectos de un docente
router.get("/:id/cronograma", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

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
          ARRAY_AGG(e.descripcion ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),
          '{}'::text[]
        )                                 AS entregables
        ,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'descripcion', e.descripcion,
              'horas', e.horas,
              'completado', COALESCE(e.completado, false),
              'fecha_completado', e.fecha_completado,
              'url_evidencia', e.url_evidencia,
              'fecha_real_entrega', e.fecha_real_entrega
            )
            ORDER BY e.id
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        ) AS entregablesDetalle
      FROM proyectos p
      JOIN proyecto_semanas s
        ON s.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e
        ON e.proyecto_semana_id = s.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      GROUP BY
        p.id,
        p.titulo,
        s.id,
        s.numero,
        s.fecha_inicio,
        s.fecha_fin
      ORDER BY p.titulo, s.numero
      `,
      [docenteId]
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
        entregablesDetalle:
          row.entregablesDetalle || row.entregablesdetalle || [],
      });
    }

    res.json({ proyectos: Array.from(map.values()) });
  } catch (error) {
    console.error("Error en /docente/:id/cronograma", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Últimas notificaciones para el docente (matriz, revisiones, aprobaciones)
router.get("/:id/notificaciones", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const check = await pool.query(
      `SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'docente'`,
      [docenteId]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }

    const result = await pool.query(
      `
      SELECT * FROM (
        SELECT
          'vencido' AS tipo,
          tpl.id AS referencia_id,
          CONCAT('Entregable vencido: ', tpl.entregable) AS mensaje,
          (DATE '2026-02-10' + (tpl.dias_fin_desde_feb::integer * INTERVAL '1 day'))::date AS fecha
        FROM plantilla_entregables tpl
        INNER JOIN usuarios u
          ON u.grupo_matriz_id = tpl.grupo_id AND u.id = $1 AND u.rol = 'docente'
        WHERE tpl.dias_fin_desde_feb IS NOT NULL
          AND (DATE '2026-02-10' + (tpl.dias_fin_desde_feb::integer * INTERVAL '1 day'))::date < CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1
            FROM proyecto_entregables pe
            JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
            JOIN proyectos p ON p.id = ps.proyecto_id
            WHERE (
                p.docente_responsable_id = $1
                OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
              )
              AND ps.numero = tpl.semana_numero
              AND COALESCE(pe.completado, false) = true
              AND (
                TRIM(pe.descripcion) = TRIM(tpl.entregable)
                OR TRIM(COALESCE(pe.actividad_reportada, '')) = TRIM(tpl.entregable)
              )
          )

        UNION ALL

        SELECT
          'observacion' AS tipo,
          pe.id AS referencia_id,
          CONCAT('Reporte con observación: ', COALESCE(pe.actividad_reportada, pe.descripcion)) AS mensaje,
          pe.revisado_en AS fecha
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE (
            p.docente_responsable_id = $1
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
          )
          AND pe.estado_revision = 'observado'
          AND pe.revisado_en IS NOT NULL

        UNION ALL

        SELECT
          'aprobado' AS tipo,
          pe.id AS referencia_id,
          CONCAT('Reporte aprobado: ', COALESCE(pe.actividad_reportada, pe.descripcion)) AS mensaje,
          pe.revisado_en AS fecha
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE (
            p.docente_responsable_id = $1
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
          )
          AND pe.estado_revision = 'aprobado'
          AND pe.revisado_en >= (CURRENT_DATE - INTERVAL '7 days')
      ) AS n
      ORDER BY fecha DESC NULLS LAST
      LIMIT 10
      `,
      [docenteId]
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
    console.error("Error en GET /docente/:id/notificaciones", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Perfil completo del docente (matriz, indicadores, avance)
router.get("/:id/perfil", async (req, res) => {
  const docenteId = Number(req.params.id);
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
        `
        SELECT COUNT(*)::int AS n
        FROM plantilla_entregables
        WHERE grupo_id = $1
        `,
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
    console.error("Error en GET /docente/:id/perfil", error);
    res.status(500).json({ error: "Error interno" });
  }
});

const MATRIZ_PLANTILLA_JOIN = `
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

const MATRIZ_ORDER = `
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

const toDateOnlyISO = (d) => {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const round1 = (x) => Math.round(Number(x) * 10) / 10;

// Estadísticas agregadas (misma lógica de emparejamiento que GET .../matriz)
router.get("/:docenteId/matriz-stats", async (req, res) => {
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
      `
      SELECT grupo_matriz_id
      FROM usuarios
      WHERE id = $1 AND rol = 'docente'
      `,
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
      ${MATRIZ_PLANTILLA_JOIN}
      ${MATRIZ_ORDER}
      `,
      [docenteId]
    );

    const rows = baseRes.rows || [];
    const total = rows.length;
    const completados = rows.filter((r) => r.completado).length;
    const porcentaje_semestral =
      total > 0 ? round1((completados / total) * 100) : 0;

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
        porcentaje_acumulado:
          total > 0 ? round1((accDone / total) * 100) : 0,
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
    console.error("Error en GET /docente/:docenteId/matriz-stats", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Matriz de seguimiento (plantilla + entregable reportado del docente)
router.get("/:docenteId/matriz", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const userRes = await pool.query(
      `
      SELECT grupo_matriz_id
      FROM usuarios
      WHERE id = $1 AND rol = 'docente'
      `,
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
        pe.porcentaje_avance,
        pe.actividad_reportada
      ${MATRIZ_PLANTILLA_JOIN}
      ${MATRIZ_ORDER}
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
        semana_numero:
          row.semana_numero != null ? Number(row.semana_numero) : 0,
        entregable: row.entregable,
        descripcion_evidencia: row.descripcion_evidencia || "",
        horas:
          row.horas_effective != null ? Number(row.horas_effective) : 0,
        fecha_inicio_calculada: toDateOnlyISO(row.fecha_inicio_calculada),
        fecha_fin_calculada: toDateOnlyISO(row.fecha_fin_calculada),
        entregable_id: row.entregable_id != null ? Number(row.entregable_id) : null,
        completado: Boolean(row.completado),
        fecha_real_entrega: toDateOnlyISO(row.fecha_real_entrega),
        url_evidencia: row.url_evidencia || null,
        estado_revision: row.estado_revision || null,
        porcentaje_avance:
          row.porcentaje_avance != null ? Number(row.porcentaje_avance) : null,
        actividad_reportada: row.actividad_reportada || null,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error("Error en GET /docente/:docenteId/matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Marcar/desmarcar completado desde la matriz (crea proyecto_entregable si no existe)
router.post(
  "/:docenteId/matriz/:plantillaId/completar",
  async (req, res) => {
    const docenteId = Number(req.params.docenteId);
    const plantillaId = Number(req.params.plantillaId);
    const { completado, fecha_real_entrega, url_evidencia } = req.body || {};

    if (!docenteId || !plantillaId) {
      return res.status(400).json({ error: "ids inválidos" });
    }
    if (typeof completado !== "boolean") {
      return res.status(400).json({ error: "completado debe ser boolean" });
    }

    const client = await pool.connect();
    try {
      await ensureReportFieldsColumns(client);

      const tplR = await client.query(
        `
        SELECT tpl.* FROM plantilla_entregables tpl
        INNER JOIN usuarios u
          ON u.id = $2 AND u.rol = 'docente' AND u.grupo_matriz_id = tpl.grupo_id
        WHERE tpl.id = $1
        `,
        [plantillaId, docenteId]
      );
      if (tplR.rowCount === 0) {
        return res.status(404).json({ error: "Plantilla no encontrada" });
      }
      const tpl = tplR.rows[0];
      const entregableTexto = String(tpl.entregable || "").trim();
      const semanaNum = tpl.semana_numero != null ? Number(tpl.semana_numero) : null;
      if (semanaNum == null || Number.isNaN(semanaNum)) {
        return res.status(400).json({ error: "Plantilla sin semana_numero" });
      }

      const fechaRealRaw =
        fecha_real_entrega != null && String(fecha_real_entrega).trim() !== ""
          ? String(fecha_real_entrega).trim()
          : null;

      const existing = await client.query(
        `
        SELECT pe.id FROM proyecto_entregables pe
        INNER JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        INNER JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE ps.numero = $1
          AND (
            p.docente_responsable_id = $2
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
          )
          AND (
            TRIM(pe.descripcion) = TRIM($3::text)
            OR TRIM(COALESCE(pe.actividad_reportada, '')) = TRIM($3::text)
          )
        ORDER BY pe.id DESC
        LIMIT 1
        `,
        [semanaNum, docenteId, entregableTexto]
      );

      let entregableId;

      if (existing.rowCount > 0) {
        entregableId = existing.rows[0].id;
        const urlVal =
          url_evidencia !== undefined && url_evidencia !== null
            ? String(url_evidencia)
            : null;

        await client.query(
          `
          UPDATE proyecto_entregables
          SET completado = $1,
              fecha_completado = CASE
                WHEN $1 THEN COALESCE($2::date, CURRENT_DATE)
                ELSE NULL
              END,
              fecha_real_entrega = CASE
                WHEN $2::text IS NOT NULL AND TRIM($2::text) <> '' THEN $2::date
                ELSE fecha_real_entrega
              END,
              url_evidencia = COALESCE($3, url_evidencia),
              estado_revision = CASE
                WHEN $1 THEN 'enviado'
                WHEN estado_revision IN ('aprobado', 'observado') THEN estado_revision
                ELSE 'borrador'
              END
          WHERE id = $4
          `,
          [completado, fechaRealRaw, urlVal, entregableId]
        );
      } else {
        const semana = await client.query(
          `
          SELECT ps.id FROM proyecto_semanas ps
          INNER JOIN proyectos p ON p.id = ps.proyecto_id
          WHERE ps.numero = $1
            AND (
              p.docente_responsable_id = $2
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
            )
          ORDER BY ps.id ASC
          LIMIT 1
          `,
          [semanaNum, docenteId]
        );

        if (semana.rowCount === 0) {
          return res.status(422).json({
            error: "No tienes una iniciativa asignada para esta semana",
            semana_numero: semanaNum,
          });
        }

        const ins = await client.query(
          `
          INSERT INTO proyecto_entregables (
            proyecto_semana_id,
            descripcion,
            completado,
            fecha_completado,
            fecha_real_entrega,
            url_evidencia,
            estado_revision,
            horas
          )
          VALUES (
            $1,
            $2,
            $3,
            CASE WHEN $3 THEN COALESCE($4::date, CURRENT_DATE) ELSE NULL END,
            CASE
              WHEN $4::text IS NOT NULL AND TRIM($4::text) <> '' THEN $4::date
              ELSE NULL
            END,
            $5,
            CASE WHEN $3 THEN 'enviado' ELSE 'borrador' END,
            $6
          )
          RETURNING id
          `,
          [
            semana.rows[0].id,
            entregableTexto,
            completado,
            fechaRealRaw,
            url_evidencia != null ? String(url_evidencia) : null,
            tpl.horas != null ? Number(tpl.horas) : null,
          ]
        );
        entregableId = ins.rows[0].id;
      }

      res.json({ ok: true, entregable_id: entregableId });
    } catch (error) {
      console.error(
        "Error en POST /docente/:docenteId/matriz/:plantillaId/completar",
        error
      );
      res.status(500).json({ error: "Error interno" });
    } finally {
      client.release();
    }
  }
);

// Historial de reportes para docente (estado_revision + comentario admin)
router.get("/:id/reportes", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        e.id,
        COALESCE(e.estado_revision, 'enviado') AS estado_revision,
        e.comentario_revision,
        e.fecha_real_entrega,
        e.fecha_completado,
        e.url_evidencia,
        COALESCE(e.descripcion_reporte, '') AS descripcion_reporte,
        e.descripcion_reporte AS descripcion_reporte_raw,
        COALESCE(e.porcentaje_avance, 100)::int AS porcentaje_avance,
        COALESCE(e.actividad_reportada, e.descripcion) AS actividad,
        p.id AS proyecto_id,
        p.titulo AS proyecto_titulo,
        s.numero AS semana_numero
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      WHERE COALESCE(e.completado, false) = true
        AND (
          p.docente_responsable_id = $1
          OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
        )
      ORDER BY
        COALESCE(e.fecha_real_entrega, e.fecha_completado) DESC NULLS LAST,
        s.numero DESC,
        e.id DESC
      `,
      [docenteId]
    );

    const reports = (result.rows || []).map((r) => {
      const dateIso = r.fecha_real_entrega || r.fecha_completado || null;
      const dateStr = dateIso
        ? new Date(dateIso).toLocaleDateString("es-CO", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "";
      return {
        id: Number(r.id),
        date: dateStr,
        week: `Semana ${r.semana_numero ?? "—"}`,
        project: r.proyecto_titulo || "Iniciativa",
        activity: r.actividad || "Entregable",
        progress: Number(r.porcentaje_avance ?? 100),
        status:
          r.estado_revision === "aprobado"
            ? "approved"
            : r.estado_revision === "observado"
            ? "review"
            : "pending",
        comment: r.comentario_revision || "",
        url_evidencia: r.url_evidencia || "",
        descripcion_reporte: r.descripcion_reporte || "",
      };
    });

    res.json({ reportes: reports });
  } catch (error) {
    console.error("Error en GET /docente/:id/reportes", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /docente/:docenteId/iniciativas/:proyectoId
router.get("/:docenteId/iniciativas/:proyectoId", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  const proyectoId = Number(req.params.proyectoId);
  if (!docenteId || !proyectoId) {
    return res.status(400).json({ error: "ids inválidos" });
  }
  try {
    const proj = await pool.query(
      `SELECT p.id, p.titulo, p.descripcion, p.tipo, p.estado,
              p.fecha_inicio, p.fecha_fin_estimada, p.horas_totales, p.semanas,
              prog.nombre AS programa_nombre,
              u.nombre || ' ' || u.apellido AS coordinador
       FROM proyectos p
       LEFT JOIN programas prog ON prog.id = p.programa_id
       LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
       WHERE p.id = $1`,
      [proyectoId]
    );
    if (proj.rowCount === 0) {
      return res.status(404).json({ error: "Iniciativa no encontrada" });
    }

    const semanas = await pool.query(
      `SELECT
         s.id, s.numero, s.fecha_inicio, s.fecha_fin,
         COALESCE(
           json_agg(
             json_build_object(
               'id',                 e.id,
               'descripcion',        e.descripcion,
               'horas',              e.horas,
               'completado',         COALESCE(e.completado, false),
               'fecha_completado',   e.fecha_completado,
               'url_evidencia',      e.url_evidencia,
               'fecha_real_entrega', e.fecha_real_entrega
             ) ORDER BY e.id
           ) FILTER (WHERE e.id IS NOT NULL),
           '[]'
         ) AS entregables
       FROM proyecto_semanas s
       LEFT JOIN proyecto_entregables e ON e.proyecto_semana_id = s.id
       WHERE s.proyecto_id = $1
       GROUP BY s.id, s.numero, s.fecha_inicio, s.fecha_fin
       ORDER BY s.numero`,
      [proyectoId]
    );

    const tipoMap = {
      proyecto: "project",
      convenio: "agreement",
      actividad: "activity",
      capacitacion: "training",
    };
    const p = proj.rows[0];
    res.json({
      id: p.id,
      titulo: p.titulo,
      descripcion: p.descripcion,
      tipo: tipoMap[p.tipo] || "project",
      estado: p.estado === "en_ejecucion" ? "active" : "inactive",
      fechaInicio: p.fecha_inicio,
      fechaFin: p.fecha_fin_estimada,
      horasTotales: p.horas_totales,
      semanas: p.semanas,
      programa: p.programa_nombre,
      coordinador: p.coordinador,
      semanasDetalle: semanas.rows,
    });
  } catch (error) {
    console.error(
      "Error en GET /docente/:docenteId/iniciativas/:proyectoId",
      error
    );
    res.status(500).json({ error: "Error interno" });
  }
});

// PATCH borrador: guarda texto y evidencias sin marcar como enviado
router.patch("/entregables/:entregableId/borrador", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  if (!entregableId) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  const {
    actividad_reportada,
    descripcion_reporte,
    porcentaje_avance,
    urls_evidencia,
    docente_id,
  } = req.body || {};
  const docenteIdNum = docente_id != null ? Number(docente_id) : null;
  if (!docenteIdNum || Number.isNaN(docenteIdNum)) {
    return res.status(400).json({ error: "docente_id es obligatorio" });
  }

  let urlStored = null;
  if (Array.isArray(urls_evidencia)) {
    const filtered = urls_evidencia.map((u) => String(u || "").trim()).filter(Boolean);
    urlStored = filtered.length ? JSON.stringify(filtered) : null;
  } else if (urls_evidencia != null && urls_evidencia !== "") {
    urlStored = String(urls_evidencia);
  }

  const pct =
    porcentaje_avance != null && !Number.isNaN(Number(porcentaje_avance))
      ? Number(porcentaje_avance)
      : null;

  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);
    const perm = await client.query(
      `
      SELECT 1
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      WHERE e.id = $1
        AND (
          p.docente_responsable_id = $2
          OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
        )
      `,
      [entregableId, docenteIdNum]
    );
    if (perm.rowCount === 0) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para editar este entregable" });
    }

    const hasUrls = Object.prototype.hasOwnProperty.call(req.body || {}, "urls_evidencia");
    const upd = await client.query(
      `
      UPDATE proyecto_entregables
      SET actividad_reportada = $1,
          descripcion_reporte = $2,
          porcentaje_avance   = COALESCE($3, porcentaje_avance),
          url_evidencia       = CASE WHEN $5 THEN $4 ELSE url_evidencia END,
          estado_revision     = 'borrador',
          completado          = false
      WHERE id = $6
      RETURNING id
      `,
      [
        actividad_reportada != null ? String(actividad_reportada) : null,
        descripcion_reporte != null ? String(descripcion_reporte) : null,
        pct,
        urlStored,
        hasUrls,
        entregableId,
      ]
    );
    if (upd.rowCount === 0) {
      return res.status(404).json({ error: "Entregable no encontrado" });
    }
    res.json({ id: upd.rows[0].id });
  } catch (error) {
    console.error("Error en PATCH /docente/entregables/:id/borrador", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// PATCH fecha real de entrega (docente)
router.patch("/entregables/:entregableId/fecha-entrega", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  const { fecha_real_entrega, docente_id } = req.body || {};
  const docenteIdNum = docente_id != null ? Number(docente_id) : null;

  if (!entregableId) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  if (
    fecha_real_entrega == null ||
    String(fecha_real_entrega).trim() === ""
  ) {
    return res.status(400).json({ error: "fecha_real_entrega es requerida" });
  }

  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);
    if (docenteIdNum != null && !Number.isNaN(docenteIdNum)) {
      const perm = await client.query(
        `
        SELECT 1
        FROM proyecto_entregables e
        JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
        JOIN proyectos p ON p.id = s.proyecto_id
        WHERE e.id = $1
          AND (
            p.docente_responsable_id = $2
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
          )
        `,
        [entregableId, docenteIdNum]
      );
      if (perm.rowCount === 0) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para editar este entregable" });
      }
    }

    const r = await client.query(
      `
      UPDATE proyecto_entregables
      SET fecha_real_entrega = $1::date
      WHERE id = $2
      RETURNING id, fecha_real_entrega
      `,
      [String(fecha_real_entrega).trim(), entregableId]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Entregable no encontrado" });
    }
    const row = r.rows[0];
    res.json({
      id: row.id,
      fecha_real_entrega: toDateOnlyISO(row.fecha_real_entrega),
    });
  } catch (error) {
    console.error(
      "Error en PATCH /docente/entregables/:id/fecha-entrega",
      error
    );
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Reenviar reporte observado para revisión (docente)
router.post("/:docenteId/entregables/:entregableId/reenviar", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  const docenteId = Number(req.params.docenteId);

  if (!docenteId || Number.isNaN(docenteId)) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  if (!entregableId || Number.isNaN(entregableId)) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }

  try {
    const check = await pool.query(
      `
      SELECT
        e.id,
        COALESCE(e.estado_revision, 'enviado') AS estado_revision,
        p.docente_responsable_id,
        pd.docente_id AS colaborador_id
      FROM proyecto_entregables e
      INNER JOIN proyecto_semanas ps ON ps.id = e.proyecto_semana_id
      INNER JOIN proyectos p ON p.id = ps.proyecto_id
      LEFT JOIN proyecto_docentes pd
        ON pd.proyecto_id = p.id AND pd.docente_id = $2
      WHERE e.id = $1
      `,
      [entregableId, docenteId]
    );

    if (check.rowCount === 0) {
      return res.status(404).json({ error: "Reporte no encontrado" });
    }

    const row = check.rows[0];
    const docenteResp = Number(row.docente_responsable_id);
    const colaboradorId = row.colaborador_id != null ? Number(row.colaborador_id) : null;

    if (docenteResp !== docenteId && colaboradorId !== docenteId) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para reenviar este reporte" });
    }

    if (row.estado_revision !== "observado") {
      return res.status(400).json({
        error: `Solo puedes reenviar reportes con estado 'observado'. Estado actual: ${row.estado_revision}`,
      });
    }

    await pool.query(
      `
      UPDATE proyecto_entregables
      SET estado_revision = 'enviado',
          comentario_revision = NULL,
          revisado_en = NULL
      WHERE id = $1
      `,
      [entregableId]
    );

    res.json({ ok: true, mensaje: "Reporte reenviado para revisión" });
  } catch (error) {
    console.error(
      "Error en POST /docente/:docenteId/entregables/:entregableId/reenviar",
      error
    );
    res.status(500).json({ error: "Error interno" });
  }
});

// PUT /docente/entregables/:entregableId
router.put("/entregables/:entregableId", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  if (!entregableId) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  const {
    completado,
    fecha_real_entrega,
    url_evidencia,
    docente_id,
    actividad_reportada,
    descripcion_reporte,
    porcentaje_avance,
  } = req.body || {};
  const docenteIdNum = docente_id != null ? Number(docente_id) : null;
  if (docenteIdNum != null && Number.isNaN(docenteIdNum)) {
    return res.status(400).json({ error: "docente_id inválido" });
  }
  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);
    if (docenteIdNum != null) {
      const perm = await client.query(
        `
        SELECT 1
        FROM proyecto_entregables e
        JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
        JOIN proyectos p ON p.id = s.proyecto_id
        WHERE e.id = $1
          AND (
            p.docente_responsable_id = $2
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
          )
        `,
        [entregableId, docenteIdNum]
      );
      if (perm.rowCount === 0) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para reportar este entregable" });
      }
    }

    await client.query(
      `UPDATE proyecto_entregables
       SET completado         = $1,
           fecha_completado   = CASE WHEN $1 = true THEN CURRENT_DATE ELSE NULL END,
           fecha_real_entrega = $2,
           url_evidencia      = $3,
           actividad_reportada = $4,
           descripcion_reporte = $5,
           porcentaje_avance  = $6,
           estado_revision    = CASE
                                WHEN $1 = true THEN
                                  CASE
                                    WHEN COALESCE(estado_revision, 'enviado') = 'observado' THEN 'observado'
                                    ELSE 'enviado'
                                  END
                                ELSE COALESCE(estado_revision, 'enviado')
                              END
       WHERE id = $7`,
      [
        completado === true,
        fecha_real_entrega || null,
        url_evidencia || null,
        actividad_reportada || null,
        descripcion_reporte || null,
        porcentaje_avance != null && !Number.isNaN(Number(porcentaje_avance))
          ? Number(porcentaje_avance)
          : null,
        entregableId,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /docente/entregables/:entregableId", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

export default router;
