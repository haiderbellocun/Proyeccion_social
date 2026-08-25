import express from "express";
import { pool } from "../db.js";
import {
  buildMatrixStats,
  loadAssignedInitiatives,
  mapMatrixRows,
  resolveInitiativeForTemplate,
} from "../services/matrizService.js";
import { markNotificationsAsRead } from "../services/notificationService.js";

const router = express.Router();

function allowAdminOrSelf(req, res, next, value) {
  const requestedId = Number(value);
  if (!Number.isInteger(requestedId) || requestedId <= 0) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  if (req.user?.rol !== "admin" && Number(req.user?.id) !== requestedId) {
    return res.status(403).json({ error: "No puedes consultar información de otro docente" });
  }
  next();
}

router.param("id", allowAdminOrSelf);
router.param("docenteId", allowAdminOrSelf);

router.param("proyectoId", async (req, res, next, value) => {
  if (req.user?.rol === "admin") return next();
  const proyectoId = Number(value);
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
    return res.status(400).json({ error: "id de iniciativa inválido" });
  }
  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM proyectos p
      WHERE p.id = $1
        AND (
          p.docente_responsable_id = $2
          OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
        )
      `,
      [proyectoId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(403).json({ error: "No tienes acceso a esta iniciativa" });
    }
    next();
  } catch (error) {
    next(error);
  }
});

router.param("entregableId", async (req, res, next, value) => {
  if (req.user?.rol === "admin") return next();
  const entregableId = Number(value);
  if (!Number.isInteger(entregableId) || entregableId <= 0) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      WHERE e.id = $1
        AND (
          e.docente_id = $2
          OR (
            e.docente_id IS NULL
            AND (
              p.docente_responsable_id = $2
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
            )
          )
        )
      `,
      [entregableId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(403).json({ error: "No tienes acceso a este entregable" });
    }
    next();
  } catch (error) {
    next(error);
  }
});

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
        u.nombre || ' ' || u.apellido AS coordinador,
        COUNT(e.id)::int AS total_entregables,
        COUNT(e.id) FILTER (WHERE COALESCE(e.completado, false))::int AS entregables_completados,
        CASE
          WHEN COUNT(e.id) > 0
            THEN ROUND((100.0 * COUNT(e.id) FILTER (WHERE COALESCE(e.completado, false)) / COUNT(e.id))::numeric, 1)::float
          ELSE 0::float
        END AS porcentaje_avance
      FROM proyectos p
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      LEFT JOIN proyecto_semanas ps ON ps.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e
        ON e.proyecto_semana_id = ps.id
       AND (e.docente_id = $1 OR e.docente_id IS NULL)
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      GROUP BY p.id, prog.nombre, u.nombre, u.apellido
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

// Estadísticas del dashboard. La fuente de verdad es la plantilla del grupo,
// incluso cuando el docente aún no ha creado ningún reporte.
router.get("/:id/dashboard-stats", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const items = await loadDocenteMatrixItems(docenteId);
    const matrixStats = buildMatrixStats(items);
    const total = matrixStats.resumen.total_entregables;
    const completed = matrixStats.resumen.completados;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const byMonth = matrixStats.por_mes.map((row) => {
      const monthItems = items.filter((item) => item.mes === row.mes);
      const active = monthItems.some((item) => {
        if (!item.fecha_inicio_calculada || !item.fecha_fin_calculada) return false;
        return (
          new Date(`${item.fecha_inicio_calculada}T00:00:00`) <= today &&
          new Date(`${item.fecha_fin_calculada}T23:59:59`) >= today
        );
      });
      return {
        month: row.mes,
        total: row.total,
        done: row.completados,
        pct: row.porcentaje_mensual,
        expectedPct: row.porcentaje_esperado,
        active,
      };
    });
    const byWeek = matrixStats.por_semana.map((row) => ({
      semana: row.semana_numero,
      total: row.total,
      done: row.completados,
      pct: row.porcentaje_acumulado,
      expectedPct: row.porcentaje_esperado_acumulado,
    }));

    const upcoming = items
      .filter((item) => {
        if (item.completado || !item.fecha_fin_calculada) return false;
        const deadline = new Date(`${item.fecha_fin_calculada}T23:59:59`);
        deadline.setHours(0, 0, 0, 0);
        return deadline >= today;
      })
      .sort((a, b) =>
        String(a.fecha_fin_calculada).localeCompare(String(b.fecha_fin_calculada))
      )
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        iniciativa: item.iniciativa_titulo,
        entregable: item.entregable,
        fechaInicio: item.fecha_inicio_calculada,
        fechaFin: item.fecha_fin_calculada,
        semana: item.semana_numero,
      }));

    const activities = items.map((item) => {
      const fin = item.fecha_fin_calculada
        ? new Date(`${item.fecha_fin_calculada}T23:59:59`)
        : null;
      let status = "pending";
      let statusLabel = "Pendiente";
      if (item.completado && item.estado_revision === "aprobado") {
        status = "approved";
        statusLabel = "Aprobado";
      } else if (item.completado && item.estado_revision === "observado") {
        status = "delayed";
        statusLabel = "Con observaciones";
      } else if (item.completado) {
        status = "review";
        statusLabel = "En revisión";
      } else if (fin && fin < today) {
        status = "delayed";
        statusLabel = "Retrasado";
      }
      return {
        id: item.id,
        entregableId: item.entregable_id,
        category: item.categoria,
        deliverable: item.entregable,
        initiative: item.iniciativa_titulo,
        initiativeType: item.iniciativa_tipo,
        startDate: item.fecha_inicio_calculada,
        deadline: item.fecha_fin_calculada,
        status,
        statusLabel,
      };
    });

    res.json({
      stats: {
        total,
        completed,
        pct: matrixStats.resumen.porcentaje_real,
        expectedPct: matrixStats.resumen.porcentaje_esperado,
        compliancePct: matrixStats.resumen.cumplimiento_esperado,
        due: matrixStats.resumen.exigibles_a_fecha,
        gap: matrixStats.resumen.brecha,
      },
      byMonth,
      byWeek,
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
              'plantillaId', e.plantilla_id,
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
       AND (e.docente_id = $1 OR e.docente_id IS NULL)
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

    const matrixItems = await loadDocenteMatrixItems(docenteId);
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
      const existingDetails =
        row.entregablesDetalle || row.entregablesdetalle || [];
      const plannedDetails = matrixItems
        .filter(
          (item) =>
            Number(item.iniciativa_id) === Number(row.proyecto_id) &&
            Number(item.semana_numero) === Number(row.semana_numero)
        )
        .map((item) => ({
          id: item.entregable_id,
          plantillaId: item.id,
          descripcion: item.entregable,
          horas: item.horas,
          completado: item.completado,
          fecha_completado: item.fecha_real_entrega,
          url_evidencia: item.url_evidencia,
          fecha_real_entrega: item.fecha_real_entrega,
          descripcion_evidencia: item.descripcion_evidencia,
          enlace_referencia: item.enlace_referencia,
          fecha_inicio: item.fecha_inicio_calculada,
          fecha_fin: item.fecha_fin_calculada,
        }));
      const plannedTemplateIds = new Set(
        plannedDetails.map((item) => Number(item.plantillaId))
      );
      const adHocDetails = existingDetails.filter(
        (item) =>
          item.plantillaId == null ||
          !plannedTemplateIds.has(Number(item.plantillaId))
      );
      const details = [...plannedDetails, ...adHocDetails];
      proj.weeks.push({
        id: row.semana_id,
        numero: row.semana_numero,
        fechaInicio: toDateOnlyISO(row.semana_fecha_inicio),
        fechaFin: toDateOnlyISO(row.semana_fecha_fin),
        entregables: details.map((item) => item.descripcion),
        entregablesDetalle: details,
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
      WITH origen AS (
        SELECT
          'vencido'::text AS tipo,
          tpl.id::bigint AS referencia_id,
          CONCAT('Entregable vencido: ', COALESCE(dex.entregable_override, tpl.entregable)) AS mensaje,
          fechas.fecha_fin::timestamp AS fecha,
          CONCAT('vencido:', tpl.id, ':', fechas.fecha_fin::text) AS clave,
          CONCAT('/docente/matriz?plantilla=', tpl.id) AS destino
        FROM plantilla_entregables tpl
        INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
        INNER JOIN semestres sem ON sem.codigo = gm.semestre
        INNER JOIN usuarios u
          ON u.grupo_matriz_id = tpl.grupo_id AND u.id = $1 AND u.rol = 'docente'
        LEFT JOIN docente_entregable_excepciones dex
          ON dex.docente_id = $1 AND dex.plantilla_id = tpl.id
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            dex.fecha_fin_override,
            (sem.fecha_inicio + (tpl.dias_fin_desde_feb::integer * INTERVAL '1 day'))::date
          ) AS fecha_fin
        ) fechas
        WHERE fechas.fecha_fin IS NOT NULL
          AND fechas.fecha_fin < CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1
            FROM proyecto_entregables pe
            WHERE pe.plantilla_id = tpl.id
              AND pe.docente_id = $1
              AND COALESCE(pe.completado, false) = true
          )

        UNION ALL

        SELECT
          'observacion'::text AS tipo,
          pe.id::bigint AS referencia_id,
          CONCAT('Reporte con observación: ', COALESCE(pe.actividad_reportada, pe.descripcion)) AS mensaje,
          pe.revisado_en AS fecha,
          CONCAT('observacion:', pe.id, ':', pe.revisado_en::text) AS clave,
          CONCAT('/docente/historial?reporte=', pe.id) AS destino
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE COALESCE(pe.docente_id, p.docente_responsable_id) = $1
          AND pe.estado_revision = 'observado'
          AND pe.revisado_en IS NOT NULL

        UNION ALL

        SELECT
          'aprobado'::text AS tipo,
          pe.id::bigint AS referencia_id,
          CONCAT('Reporte aprobado: ', COALESCE(pe.actividad_reportada, pe.descripcion)) AS mensaje,
          pe.revisado_en AS fecha,
          CONCAT('aprobado:', pe.id, ':', pe.revisado_en::text) AS clave,
          CONCAT('/docente/historial?reporte=', pe.id) AS destino
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE COALESCE(pe.docente_id, p.docente_responsable_id) = $1
          AND pe.estado_revision = 'aprobado'
          AND pe.revisado_en >= (CURRENT_DATE - INTERVAL '7 days')

        UNION ALL

        SELECT
          n.tipo::text,
          n.id::bigint AS referencia_id,
          n.mensaje,
          n.creado_en AS fecha,
          CONCAT('persistente:', n.id) AS clave,
          CASE
            WHEN n.referencia_tipo = 'reporte' AND n.referencia_id IS NOT NULL
              THEN CONCAT('/docente/historial?reporte=', n.referencia_id)
            ELSE NULL
          END AS destino
        FROM notificaciones n
        WHERE n.usuario_id = $1
          AND COALESCE(n.leida, false) = false
      ), pendientes AS (
        SELECT origen.*
        FROM origen
        LEFT JOIN notificacion_lecturas lectura
          ON lectura.usuario_id = $1 AND lectura.clave = origen.clave
        WHERE lectura.clave IS NULL
      )
      SELECT tipo, referencia_id, mensaje, fecha, clave, destino
      FROM pendientes
      ORDER BY fecha DESC NULLS LAST
      `,
      [docenteId]
    );

    const notificaciones = (result.rows || []).map((row) => ({
      tipo: row.tipo,
      referencia_id: Number(row.referencia_id),
      mensaje: row.mensaje,
      clave: row.clave,
      destino: row.destino || null,
      fecha:
        row.fecha != null
          ? row.fecha instanceof Date
            ? row.fecha.toISOString()
            : String(row.fecha)
          : null,
    }));

    res.json({
      notificaciones,
      total_no_leidas: notificaciones.length,
    });
  } catch (error) {
    console.error("Error en GET /docente/:id/notificaciones", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/:id/notificaciones/leer", async (req, res) => {
  const docenteId = Number(req.params.id);
  try {
    const marked = await markNotificationsAsRead(
      docenteId,
      req.body?.notificaciones ?? req.body
    );
    res.json({ marcadas: marked });
  } catch (error) {
    console.error("Error en PATCH /docente/:id/notificaciones/leer", error);
    res.status(Number(error?.status) || 500).json({
      error: Number(error?.status)
        ? error.message
        : "No fue posible marcar la notificación",
    });
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
        p.nombre AS programa_nombre,
        e.id AS escuela_id,
        COALESCE(e.nombre, 'Sin escuela') AS escuela_nombre,
        gm.id AS gm_id,
        gm.nombre AS gm_nombre,
        gm.horas_totales AS gm_horas,
        gm.num_proyectos AS gm_num_proyectos,
        gm.num_actividades AS gm_num_actividades,
        gm.num_convenios_nuevos AS gm_num_convenios_nuevos,
        gm.num_convenios_dinamizados AS gm_num_convenios_dinamizados
      FROM usuarios u
      LEFT JOIN programas p ON p.id = u.programa_id
      LEFT JOIN escuelas e ON e.id = p.escuela_id
      LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
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
          e.docente_id = $1
          OR (
            e.docente_id IS NULL
            AND (
              p.docente_responsable_id = $1
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
            )
          )
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
        id: row.escuela_id ?? null,
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

// El docente solo puede actualizar su propio enlace de trabajo. Los demás
// datos de perfil siguen bajo control administrativo.
router.put("/:id/info-contacto", async (req, res) => {
  const docenteId = Number(req.params.id);
  const linkDrive = req.body?.link_drive;
  if (typeof linkDrive !== "string") {
    return res.status(400).json({ error: "link_drive es obligatorio" });
  }

  const normalized = linkDrive.trim();
  if (normalized) {
    try {
      const url = new URL(normalized);
      if (url.protocol !== "https:") {
        return res.status(400).json({ error: "El enlace debe usar HTTPS" });
      }
    } catch {
      return res.status(400).json({ error: "El enlace de Drive no es válido" });
    }
  }

  try {
    const result = await pool.query(
      `
      UPDATE usuarios
      SET link_drive = $1
      WHERE id = $2 AND rol = 'docente'
      RETURNING id, link_drive
      `,
      [normalized || null, docenteId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en PUT /docente/:id/info-contacto", error);
    res.status(500).json({ error: "Error interno" });
  }
});

const MATRIZ_PLANTILLA_JOIN = `
  FROM plantilla_entregables tpl
  INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
  INNER JOIN semestres sem ON sem.codigo = gm.semestre
  INNER JOIN usuarios u
    ON u.id = $1
   AND u.rol = 'docente'
   AND u.grupo_matriz_id = tpl.grupo_id
  LEFT JOIN docente_entregable_excepciones dex
    ON dex.docente_id = u.id
   AND dex.plantilla_id = tpl.id
  LEFT JOIN proyectos p_override ON p_override.id = dex.proyecto_id
  LEFT JOIN LATERAL (
    SELECT
      e.id,
      e.completado,
      e.fecha_real_entrega,
      e.fecha_cargue_evidencia,
      e.url_evidencia,
      e.estado_revision,
      e.comentario_revision,
      e.porcentaje_avance,
      e.actividad_reportada,
      e.horas,
      p.id AS proyecto_id,
      p.titulo AS proyecto_titulo,
      p.tipo AS proyecto_tipo
    FROM proyecto_entregables e
    INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
    INNER JOIN proyectos p ON p.id = s.proyecto_id
    WHERE e.plantilla_id = tpl.id
      AND e.docente_id = u.id
      AND (
        p.docente_responsable_id = u.id
        OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = u.id)
      )
    ORDER BY e.id DESC
    LIMIT 1
  ) pe ON true
`;

const MATRIZ_ORDER = `
  ORDER BY
    COALESCE(
      dex.fecha_inicio_override,
      (sem.fecha_inicio + COALESCE(tpl.dias_inicio_desde_feb, 0) * INTERVAL '1 day')::date
    ) NULLS LAST,
    COALESCE(
      dex.fecha_fin_override,
      (sem.fecha_inicio + COALESCE(tpl.dias_fin_desde_feb, 0) * INTERVAL '1 day')::date
    ) NULLS LAST,
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

async function loadDocenteMatrixItems(docenteId, db = pool) {
  const [tplRes, initiatives] = await Promise.all([
    db.query(
      `
      SELECT
        tpl.id,
        tpl.numero,
        tpl.categoria AS categoria_raw,
        tpl.fase AS fase_raw,
        tpl.mes,
        tpl.semana_numero,
        sem.fecha_inicio AS semestre_fecha_inicio,
        tpl.entregable,
        tpl.descripcion_evidencia,
        COALESCE(dex.entregable_override, tpl.entregable) AS entregable_effective,
        COALESCE(
          dex.descripcion_evidencia_override,
          tpl.descripcion_evidencia
        ) AS descripcion_evidencia_effective,
        COALESCE(
          dex.enlace_referencia_override,
          tpl.enlace_referencia
        ) AS enlace_referencia_effective,
        COALESCE(pe.horas, tpl.horas) AS horas_effective,
        COALESCE(
          dex.fecha_inicio_override,
          (sem.fecha_inicio + COALESCE(tpl.dias_inicio_desde_feb, 0) * INTERVAL '1 day')::date
        ) AS fecha_inicio_calculada,
        COALESCE(
          dex.fecha_fin_override,
          (sem.fecha_inicio + COALESCE(tpl.dias_fin_desde_feb, 0) * INTERVAL '1 day')::date
        ) AS fecha_fin_calculada,
        dex.id AS exception_id,
        dex.motivo AS exception_reason,
        dex.proyecto_id AS override_project_id,
        p_override.titulo AS override_project_title,
        p_override.tipo AS override_project_type,
        pe.proyecto_id AS report_project_id,
        pe.proyecto_titulo AS report_project_title,
        pe.proyecto_tipo AS report_project_type,
        pe.id AS entregable_id,
        COALESCE(pe.completado, false) AS completado,
        pe.fecha_real_entrega,
        pe.fecha_cargue_evidencia,
        pe.url_evidencia,
        pe.estado_revision,
        pe.comentario_revision,
        pe.porcentaje_avance,
        pe.actividad_reportada
      ${MATRIZ_PLANTILLA_JOIN}
      ${MATRIZ_ORDER}
      `,
      [docenteId]
    ),
    loadAssignedInitiatives(docenteId, db),
  ]);

  return mapMatrixRows(tplRes.rows, initiatives, mapCategorySlug);
}

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
      porcentaje_real: 0,
      porcentaje_esperado: 0,
      cumplimiento_esperado: 100,
      exigibles_a_fecha: 0,
      completados_exigibles: 0,
      brecha: 0,
    },
    por_mes: [],
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

    const items = await loadDocenteMatrixItems(docenteId);
    res.json(buildMatrixStats(items));
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

    const items = await loadDocenteMatrixItems(docenteId);
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
    const { completado, url_evidencia } = req.body || {};

    if (!docenteId || !plantillaId) {
      return res.status(400).json({ error: "ids inválidos" });
    }
    if (typeof completado !== "boolean") {
      return res.status(400).json({ error: "completado debe ser boolean" });
    }

    const client = await pool.connect();
    try {

      const tplR = await client.query(
        `
        SELECT
          tpl.*,
          tpl.categoria AS categoria_raw,
          tpl.fase AS fase_raw,
          COALESCE(dex.entregable_override, tpl.entregable) AS entregable_effective,
          dex.proyecto_id AS override_project_id,
          p_override.titulo AS override_project_title,
          p_override.tipo AS override_project_type
        FROM plantilla_entregables tpl
        INNER JOIN usuarios u
          ON u.id = $2 AND u.rol = 'docente' AND u.grupo_matriz_id = tpl.grupo_id
        LEFT JOIN docente_entregable_excepciones dex
          ON dex.docente_id = u.id AND dex.plantilla_id = tpl.id
        LEFT JOIN proyectos p_override ON p_override.id = dex.proyecto_id
        WHERE tpl.id = $1
        `,
        [plantillaId, docenteId]
      );
      if (tplR.rowCount === 0) {
        return res.status(404).json({ error: "Plantilla no encontrada" });
      }
      const tpl = tplR.rows[0];
      const entregableTexto = String(tpl.entregable_effective || tpl.entregable || "").trim();
      const semanaNum = tpl.semana_numero != null ? Number(tpl.semana_numero) : null;
      if (semanaNum == null || Number.isNaN(semanaNum)) {
        return res.status(400).json({ error: "Plantilla sin semana_numero" });
      }

      const existing = await client.query(
        `
        SELECT pe.id FROM proyecto_entregables pe
        INNER JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        INNER JOIN proyectos p ON p.id = ps.proyecto_id
        WHERE pe.plantilla_id = $1
          AND pe.docente_id = $2
          AND (
            p.docente_responsable_id = $2
            OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
          )
        ORDER BY pe.id DESC
        LIMIT 1
        `,
        [plantillaId, docenteId]
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
                WHEN $1 THEN CURRENT_DATE
                ELSE NULL
              END,
              fecha_real_entrega = CASE
                WHEN $1 THEN CURRENT_DATE
                ELSE NULL
              END,
              fecha_cargue_evidencia = CASE
                WHEN $1 THEN CURRENT_TIMESTAMP
                ELSE NULL
              END,
              url_evidencia = COALESCE($2, url_evidencia),
              estado_revision = CASE
                WHEN $1 THEN 'enviado'
                WHEN estado_revision IN ('aprobado', 'observado') THEN estado_revision
                ELSE 'borrador'
              END
          WHERE id = $3
          `,
          [completado, urlVal, entregableId]
        );
      } else {
        const initiative = await resolveInitiativeForTemplate(docenteId, tpl, client);
        if (!initiative.id) {
          return res.status(422).json({
            error:
              "No tienes una iniciativa asignada. El administrador debe asignarla antes de reportar.",
            semana_numero: semanaNum,
          });
        }
        const semana = await client.query(
          `
          SELECT ps.id FROM proyecto_semanas ps
          WHERE ps.numero = $1
            AND ps.proyecto_id = $2
          ORDER BY ps.id ASC
          LIMIT 1
          `,
          [semanaNum, initiative.id]
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
            plantilla_id,
            docente_id,
            descripcion,
            completado,
            fecha_completado,
            fecha_real_entrega,
            fecha_cargue_evidencia,
            url_evidencia,
            estado_revision,
            horas
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            CASE WHEN $5 THEN CURRENT_DATE ELSE NULL END,
            CASE WHEN $5 THEN CURRENT_DATE ELSE NULL END,
            CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE NULL END,
            $6,
            CASE WHEN $5 THEN 'enviado' ELSE 'borrador' END,
            $7
          )
          RETURNING id, fecha_cargue_evidencia
          `,
          [
            semana.rows[0].id,
            plantillaId,
            docenteId,
            entregableTexto,
            completado,
            url_evidencia != null ? String(url_evidencia) : null,
            tpl.horas != null ? Number(tpl.horas) : null,
          ]
        );
        entregableId = ins.rows[0].id;
      }

      const saved = await client.query(
        `SELECT fecha_real_entrega, fecha_cargue_evidencia
         FROM proyecto_entregables WHERE id = $1`,
        [entregableId]
      );
      res.json({
        ok: true,
        entregable_id: entregableId,
        fecha_real_entrega: toDateOnlyISO(saved.rows[0]?.fecha_real_entrega),
        fecha_cargue_evidencia: saved.rows[0]?.fecha_cargue_evidencia || null,
      });
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
          e.docente_id = $1
          OR (
            e.docente_id IS NULL
            AND (
              p.docente_responsable_id = $1
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
            )
          )
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
       LEFT JOIN proyecto_entregables e
         ON e.proyecto_semana_id = s.id
        AND (e.docente_id = $2 OR e.docente_id IS NULL)
       WHERE s.proyecto_id = $1
       GROUP BY s.id, s.numero, s.fecha_inicio, s.fecha_fin
       ORDER BY s.numero`,
      [proyectoId, docenteId]
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
    const perm = await client.query(
      `
      SELECT 1
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      WHERE e.id = $1
        AND (
          e.docente_id = $2
          OR (
            e.docente_id IS NULL
            AND (
              p.docente_responsable_id = $2
              OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
            )
          )
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
          completado          = false,
          fecha_completado    = NULL,
          fecha_real_entrega  = NULL,
          fecha_cargue_evidencia = NULL
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

// Compatibilidad explícita para clientes antiguos: la fecha real nunca se
// acepta desde el navegador; el servidor la registra al enviar la evidencia.
router.patch("/entregables/:entregableId/fecha-entrega", (_req, res) => {
  res.status(403).json({
    error:
      "La fecha de entrega se registra automáticamente y no puede ser modificada por el docente.",
  });
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
        AND (e.docente_id = $2 OR e.docente_id IS NULL)
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
          revisado_en = NULL,
          completado = true,
          fecha_completado = CURRENT_DATE,
          fecha_real_entrega = CURRENT_DATE,
          fecha_cargue_evidencia = CURRENT_TIMESTAMP,
          docente_id = COALESCE(docente_id, $2)
      WHERE id = $1
      `,
      [entregableId, docenteId]
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
    if (docenteIdNum != null) {
      const perm = await client.query(
        `
        SELECT 1
        FROM proyecto_entregables e
        JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
        JOIN proyectos p ON p.id = s.proyecto_id
        WHERE e.id = $1
          AND (
            e.docente_id = $2
            OR (
              e.docente_id IS NULL
              AND (
                p.docente_responsable_id = $2
                OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2)
              )
            )
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

    const updated = await client.query(
      `UPDATE proyecto_entregables
       SET completado         = $1,
           fecha_completado   = CASE WHEN $1 = true THEN CURRENT_DATE ELSE NULL END,
           fecha_real_entrega = CASE WHEN $1 = true THEN CURRENT_DATE ELSE NULL END,
           fecha_cargue_evidencia = CASE
                                      WHEN $1 = true THEN CURRENT_TIMESTAMP
                                      ELSE NULL
                                    END,
           url_evidencia      = $2,
           actividad_reportada = $3,
           descripcion_reporte = $4,
           porcentaje_avance  = $5,
           estado_revision    = CASE
                                WHEN $1 = true THEN
                                  CASE
                                    WHEN COALESCE(estado_revision, 'enviado') = 'observado' THEN 'observado'
                                    ELSE 'enviado'
                                  END
                                ELSE COALESCE(estado_revision, 'enviado')
                              END
       WHERE id = $6
       RETURNING fecha_real_entrega, fecha_cargue_evidencia`,
      [
        completado === true,
        url_evidencia || null,
        actividad_reportada || null,
        descripcion_reporte || null,
        porcentaje_avance != null && !Number.isNaN(Number(porcentaje_avance))
          ? Number(porcentaje_avance)
          : null,
        entregableId,
      ]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: "Entregable no encontrado" });
    }
    res.json({
      ok: true,
      fecha_real_entrega: toDateOnlyISO(updated.rows[0].fecha_real_entrega),
      fecha_cargue_evidencia: updated.rows[0].fecha_cargue_evidencia,
    });
  } catch (error) {
    console.error("Error en PUT /docente/entregables/:entregableId", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

export default router;
