import express from "express";
import { pool } from "../db.js";
import {
  buildMatrixStats,
  hoyBogota,
  itemParaApi,
  loadMatrixForDocentes,
  responderError,
  calcularMetricas,
  toDateOnlyISO,
} from "../services/matrizService.js";
import { aplicarAccionDocente, registrarDesdeMatriz } from "../services/entregableWorkflowService.js";
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
    const vista = await loadDocenteMatrix(docenteId);
    if (!vista) return res.status(404).json({ error: "Docente no encontrado" });
    const { items, hoy, calendario } = vista;
    const matrixStats = buildMatrixStats(items, { hoy, calendario });
    const m = matrixStats.resumen;

    const byMonth = matrixStats.por_mes.map((row) => {
      const monthItems = items.filter((item) => item.mes === row.mes);
      // Fechas YYYY-MM-DD comparadas como texto con el «hoy» institucional (Bogotá).
      const active = monthItems.some(
        (item) =>
          item.fecha_inicio_calculada &&
          item.fecha_fin_calculada &&
          item.fecha_inicio_calculada <= hoy &&
          item.fecha_fin_calculada >= hoy
      );
      return {
        month: row.mes,
        total: row.total,
        done: row.reportados,
        aprobados: row.aprobados,
        pct: row.pct_reportado,
        pct_aprobado: row.pct_aprobado,
        expectedPct: row.pct_esperado,
        active,
      };
    });
    const byWeek = matrixStats.por_semana.map((row) => ({
      semana: row.semana_numero,
      total: row.total,
      done: row.reportados,
      pct: row.acumulado_reportado_pct,
      pct_aprobado: row.acumulado_aprobado_pct,
      expectedPct: row.acumulado_esperado_pct,
    }));

    const porFecha = (a, b) =>
      String(a.fecha_fin_calculada || "9999-12-31").localeCompare(String(b.fecha_fin_calculada || "9999-12-31"));
    const accionables = items.filter((i) => i.clasificacion.requiere_accion_docente).sort(porFecha);
    const vencidos = accionables.filter((i) => i.clasificacion.vencido);
    const observados = items.filter((i) => i.clasificacion.estado === "observado").sort(porFecha);
    const pendientes = accionables.filter((i) => !i.clasificacion.vencido && i.clasificacion.estado !== "observado");
    const proximos = accionables.filter((i) => i.fecha_fin_calculada && i.fecha_fin_calculada >= hoy);

    const resumenItem = (item) => ({
      id: item.id,
      entregable_id: item.entregable_id,
      iniciativa: item.iniciativa_titulo,
      entregable: item.entregable,
      fechaInicio: item.fecha_inicio_calculada,
      fechaFin: item.fecha_fin_calculada,
      semana: item.semana_numero,
      estado: item.clasificacion.estado,
      vencido: item.clasificacion.vencido,
      comentario_revision: item.comentario_revision,
    });

    const STATUS = { aprobado: ["approved", "Aprobado"], enviado: ["review", "En revisión"], observado: ["delayed", "Con observaciones"] };
    const activities = items.map((item) => {
      const k = item.clasificacion;
      const [status, statusLabel] = STATUS[k.estado] ?? (k.vencido ? ["delayed", "Retrasado"] : ["pending", "Pendiente"]);
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
        estado: k.estado,
        vencido: k.vencido,
      };
    });

    res.json({
      stats: {
        total: m.total,
        completed: m.reportados,
        pct: m.porcentaje_real,
        expectedPct: m.porcentaje_esperado,
        compliancePct: m.cumplimiento_esperado,
        due: m.exigibles_a_fecha,
        gap: m.brecha,
        aprobados: m.aprobados,
        approvedPct: m.pct_aprobado,
      },
      indicadores: m,
      semana_actual: matrixStats.semana_actual,
      conteos: {
        pendientes: pendientes.length,
        observados: observados.length,
        vencidos: vencidos.length,
        en_revision: m.enviados_pendientes_revision,
      },
      byMonth,
      byWeek,
      upcoming: proximos.slice(0, 8).map(resumenItem),
      proximo_entregable: proximos[0] ? resumenItem(proximos[0]) : null,
      pendientes: pendientes.slice(0, 20).map(resumenItem),
      observados: observados.slice(0, 20).map(resumenItem),
      vencidos: vencidos.slice(0, 20).map(resumenItem),
      activities,
    });
  } catch (error) {
    responderError(res, error, "Error en /docente/:id/dashboard-stats");
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

    const matrixItems = ((await loadDocenteMatrix(docenteId))?.items ?? []).map(itemParaApi);
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
          estado: item.estado,
          vencido: item.vencido,
          estado_revision: item.estado_revision,
          comentario_revision: item.comentario_revision,
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
          AND fechas.fecha_fin < (NOW() AT TIME ZONE 'America/Bogota')::date
          AND NOT EXISTS (
            SELECT 1
            FROM proyecto_entregables pe
            WHERE pe.plantilla_id = tpl.id
              AND pe.docente_id = $1
              AND COALESCE(pe.completado, false) = true
              AND pe.estado_revision IN ('enviado', 'aprobado')
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
          AND pe.revisado_en >= (((NOW() AT TIME ZONE 'America/Bogota')::date - 7)::timestamp AT TIME ZONE 'America/Bogota')

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

    const vista = await loadDocenteMatrix(docenteId);
    const m = calcularMetricas(vista?.items ?? [], vista?.hoy);

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
        total_plantillas: m.total,
        // completados = reportados (alias histórico); porcentaje_avance = % reportado.
        completados: m.reportados,
        porcentaje_avance: m.pct_reportado,
        reportados: m.reportados,
        aprobados: m.aprobados,
        pct_aprobado: m.pct_aprobado,
        pct_esperado: m.pct_esperado,
        vencidos: m.vencidos,
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

// Matriz del docente: calendario real del semestre (tabla semestres) y «hoy» en America/Bogota.
async function loadDocenteMatrix(docenteId, db = pool) {
  const hoy = hoyBogota();
  const [entry] = await loadMatrixForDocentes(db, { docenteId, hoy });
  return entry ? { ...entry, hoy } : null;
}

// Estadísticas agregadas (mismas reglas que GET .../matriz)
router.get("/:docenteId/matriz-stats", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const vista = await loadDocenteMatrix(docenteId);
    if (!vista) return res.status(404).json({ error: "docente no encontrado" });
    res.json(buildMatrixStats(vista.items, { hoy: vista.hoy, calendario: vista.calendario }));
  } catch (error) {
    responderError(res, error, "Error en GET /docente/:docenteId/matriz-stats");
  }
});

// Matriz de seguimiento (plantilla + entregable reportado del docente)
router.get("/:docenteId/matriz", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const vista = await loadDocenteMatrix(docenteId);
    if (!vista) return res.status(404).json({ error: "docente no encontrado" });
    const stats = buildMatrixStats(vista.items, { hoy: vista.hoy, calendario: vista.calendario });
    res.json({
      items: vista.items.map(itemParaApi),
      resumen: stats.resumen,
      semana_actual: stats.semana_actual,
      hoy: vista.hoy,
    });
  } catch (error) {
    responderError(res, error, "Error en GET /docente/:docenteId/matriz");
  }
});

// Enviar / retirar un entregable desde la matriz (crea el reporte vinculado a la plantilla si no existe).
// Las validaciones (evidencia, estados, iniciativa, duplicados) las aplica entregableWorkflowService.
router.post("/:docenteId/matriz/:plantillaId/completar", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  const plantillaId = Number(req.params.plantillaId);
  const body = req.body || {};

  if (!docenteId || !plantillaId) {
    return res.status(400).json({ error: "ids inválidos" });
  }
  if (typeof body.completado !== "boolean") {
    return res.status(400).json({ error: "completado debe ser boolean" });
  }

  const datos = {};
  if (body.url_evidencia !== undefined && body.url_evidencia !== null) datos.url_evidencia = body.url_evidencia;
  if (body.urls_evidencia !== undefined) datos.url_evidencia = body.urls_evidencia;
  if (body.justificacion_exencion !== undefined) datos.exencion = body.justificacion_exencion;
  // La fecha de entrega nunca se acepta desde el navegador: la registra el servidor.

  try {
    const proyectoId = body.proyecto_id != null ? Number(body.proyecto_id) : null;
    if (proyectoId != null && (!Number.isInteger(proyectoId) || proyectoId <= 0)) {
      return res.status(400).json({ error: "proyecto_id inválido" });
    }
    const out = await registrarDesdeMatriz(pool, {
      docenteId,
      actorId: Number(req.user?.id) || docenteId,
      plantillaId,
      completado: body.completado,
      proyectoId,
      datos,
    });
    const saved = out.entregable_id
      ? await pool.query(
          `SELECT fecha_real_entrega, fecha_cargue_evidencia FROM proyecto_entregables WHERE id = $1`,
          [out.entregable_id]
        )
      : { rows: [] };
    res.json({
      ...out,
      fecha_real_entrega: toDateOnlyISO(saved.rows[0]?.fecha_real_entrega),
      fecha_cargue_evidencia: saved.rows[0]?.fecha_cargue_evidencia || null,
    });
  } catch (error) {
    responderError(res, error, "Error en POST /docente/:docenteId/matriz/:plantillaId/completar");
  }
});

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

// Docente dueño del entregable: el docente autenticado; un administrador actúa sobre el dueño registrado.
async function docenteDelEntregable(req, entregableId) {
  if (req.user?.rol !== "admin") return Number(req.user.id);
  const bodyId = Number(req.body?.docente_id);
  if (Number.isInteger(bodyId) && bodyId > 0) return bodyId;
  const r = await pool.query(
    `SELECT COALESCE(e.docente_id, p.docente_responsable_id) AS docente_id
     FROM proyecto_entregables e
     JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
     JOIN proyectos p ON p.id = s.proyecto_id
     WHERE e.id = $1`,
    [entregableId]
  );
  return r.rows[0]?.docente_id != null ? Number(r.rows[0].docente_id) : null;
}

// PATCH borrador: guarda texto y evidencias sin enviar a revisión (un observado conserva su estado).
router.patch("/entregables/:entregableId/borrador", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  if (!entregableId) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  const b = req.body || {};
  const datos = {
    actividad_reportada: b.actividad_reportada != null ? String(b.actividad_reportada) : null,
    descripcion_reporte: b.descripcion_reporte != null ? String(b.descripcion_reporte) : null,
    porcentaje_avance: b.porcentaje_avance,
  };
  if (Object.prototype.hasOwnProperty.call(b, "urls_evidencia")) datos.url_evidencia = b.urls_evidencia;
  if (b.justificacion_exencion !== undefined) datos.exencion = b.justificacion_exencion;

  try {
    const docenteId = await docenteDelEntregable(req, entregableId);
    if (!docenteId) return res.status(400).json({ error: "docente_id es obligatorio" });
    const out = await aplicarAccionDocente(pool, {
      docenteId,
      actorId: Number(req.user.id),
      entregableId,
      accion: "guardar_borrador",
      datos,
    });
    res.json(out);
  } catch (error) {
    responderError(res, error, "Error en PATCH /docente/entregables/:id/borrador");
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

// Reenviar reporte observado (ya corregido) para revisión; repetir la petición no duplica el envío.
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
    const out = await aplicarAccionDocente(pool, {
      docenteId,
      actorId: Number(req.user.id),
      entregableId,
      accion: "enviar",
      datos: {},
      soloDesde: "observado",
    });
    res.json({ ok: true, estado: out.estado, mensaje: "Reporte reenviado para revisión" });
  } catch (error) {
    responderError(res, error, "Error en POST /docente/:docenteId/entregables/:entregableId/reenviar");
  }
});

// PUT /docente/entregables/:entregableId — enviar (completado=true) o retirar (completado=false) un reporte.
router.put("/entregables/:entregableId", async (req, res) => {
  const entregableId = Number(req.params.entregableId);
  if (!entregableId) {
    return res.status(400).json({ error: "id de entregable inválido" });
  }
  const b = req.body || {};
  const datos = {};
  if (b.url_evidencia !== undefined) datos.url_evidencia = b.url_evidencia;
  if (b.urls_evidencia !== undefined) datos.url_evidencia = b.urls_evidencia;
  if (b.actividad_reportada !== undefined) datos.actividad_reportada = b.actividad_reportada;
  if (b.descripcion_reporte !== undefined) datos.descripcion_reporte = b.descripcion_reporte;
  if (b.porcentaje_avance !== undefined) datos.porcentaje_avance = b.porcentaje_avance;
  if (b.justificacion_exencion !== undefined) datos.exencion = b.justificacion_exencion;

  try {
    const docenteId = await docenteDelEntregable(req, entregableId);
    if (!docenteId) return res.status(404).json({ error: "Entregable no encontrado" });
    const out = await aplicarAccionDocente(pool, {
      docenteId,
      actorId: Number(req.user.id),
      entregableId,
      accion: b.completado === true ? "enviar" : "retirar",
      datos,
    });
    const saved = await pool.query(
      `SELECT fecha_real_entrega, fecha_cargue_evidencia FROM proyecto_entregables WHERE id = $1`,
      [entregableId]
    );
    res.json({
      ok: true,
      ...out,
      fecha_real_entrega: toDateOnlyISO(saved.rows[0]?.fecha_real_entrega),
      fecha_cargue_evidencia: saved.rows[0]?.fecha_cargue_evidencia || null,
    });
  } catch (error) {
    responderError(res, error, "Error en PUT /docente/entregables/:entregableId");
  }
});

export default router;
