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

// Matriz de seguimiento (basada en grupos_matriz + plantilla_entregables)
router.get("/:docenteId/matriz", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(days || 0));
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const toISODate = (d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  };

  const formatDisplayCO = (d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  };

  const mapCategory = (categoria, fase) => {
    const text = `${categoria || ""} ${fase || ""}`.toLowerCase();
    if (text.includes("capacit")) return "capacitacion";
    if (text.includes("conveni")) {
      if (text.includes("nuevo")) return "convenio_nuevo";
      if (text.includes("dinam")) return "convenio_dinamizado";
      return "convenio_dinamizado";
    }
    if (text.includes("presup")) return "presupuesto";
    if (text.includes("proyect")) return "proyecto";

    const m = text.match(/actividad\\s*(\\d+)/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 4) return `actividad${n}`;
    }
    if (text.includes("actividad")) return "actividad1";
    return "proyecto";
  };

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

    const grupoMatrizId = userRes.rows[0].grupo_matriz_id;
    if (!grupoMatrizId) {
      return res.json({ items: [] });
    }

    const tplRes = await pool.query(
      `
      SELECT
        id,
        semana_numero,
        numero,
        categoria,
        fase,
        mes,
        entregable,
        descripcion_evidencia,
        horas,
        dias_inicio_desde_feb,
        dias_fin_desde_feb
      FROM plantilla_entregables
      WHERE grupo_id = $1
      ORDER BY semana_numero, numero
      `,
      [grupoMatrizId]
    );

    const templates = tplRes.rows || [];
    if (templates.length === 0) {
      return res.json({ items: [] });
    }

    const cronSemanaRes = await pool.query(
      `
      SELECT
        s.numero AS min_semana_numero,
        s.fecha_inicio AS min_fecha_inicio
      FROM proyectos p
      JOIN proyecto_semanas s ON s.proyecto_id = p.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      ORDER BY s.fecha_inicio ASC
      LIMIT 1
      `,
      [docenteId]
    );

    const minSemanaNumero = cronSemanaRes.rows[0]?.min_semana_numero;
    const cronBaseFechaInicio = cronSemanaRes.rows[0]?.min_fecha_inicio;

    const tplForBase = templates.find(
      (t) => Number(t.semana_numero) === Number(minSemanaNumero)
    );

    let baseFebDate = null;
    if (cronBaseFechaInicio && tplForBase && tplForBase.dias_inicio_desde_feb != null) {
      baseFebDate = addDays(cronBaseFechaInicio, -Number(tplForBase.dias_inicio_desde_feb));
    } else {
      const year = new Date().getFullYear();
      baseFebDate = new Date(`${year}-02-01T00:00:00`);
    }

    const actualRes = await pool.query(
      `
      SELECT
        s.numero AS semana_numero,
        e.descripcion AS entregable_desc,
        e.horas AS horas,
        COALESCE(e.completado, false) AS completado,
        e.fecha_real_entrega AS fecha_real_entrega,
        e.url_evidencia AS url_evidencia
      FROM proyectos p
      JOIN proyecto_semanas s ON s.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e ON e.proyecto_semana_id = s.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      `,
      [docenteId]
    );

    const actualMap = new Map();
    for (const row of actualRes.rows || []) {
      if (!row.entregable_desc) continue;
      const key = `${row.semana_numero}||${row.entregable_desc}`;
      const prev = actualMap.get(key);
      if (!prev) {
        actualMap.set(key, row);
        continue;
      }
      const prevDate = prev.fecha_real_entrega ? new Date(prev.fecha_real_entrega).getTime() : null;
      const newDate = row.fecha_real_entrega ? new Date(row.fecha_real_entrega).getTime() : null;
      if (newDate && (!prevDate || newDate > prevDate)) {
        actualMap.set(key, row);
      }
    }

    const monthKeyMap = {
      2: "Febrero",
      3: "Marzo",
      4: "Abril",
      5: "Mayo",
    };

    const items = templates.map((t) => {
      const weekNum = Number(t.semana_numero);
      const start = addDays(baseFebDate, Number(t.dias_inicio_desde_feb || 0));
      const end = addDays(baseFebDate, Number(t.dias_fin_desde_feb || 0));

      const scheduledDateISO = toISODate(end);
      const actualKey = `${weekNum}||${t.entregable}`;
      const actual = actualMap.get(actualKey);

      const actualDateISO = actual?.fecha_real_entrega
        ? toISODate(actual.fecha_real_entrega)
        : null;

      const evidence = actual?.url_evidencia || null;

      return {
        id: Number(t.id),
        numero: t.numero != null ? Number(t.numero) : null,
        month: monthKeyMap[end.getMonth() + 1] || "Marzo",
        week: weekNum,
        startDate: formatDisplayCO(start),
        endDate: formatDisplayCO(end),
        hours: actual?.horas != null ? Number(actual.horas) : Number(t.horas || 0),
        deliverable: t.entregable,
        description: t.descripcion_evidencia || t.entregable,
        category: mapCategory(t.categoria, t.fase),
        indicator: t.fase || t.categoria || "—",
        phase: (t.fase && String(t.fase).trim()) || "Sin fase",
        completado: Boolean(actual?.completado),
        scheduledDate: scheduledDateISO,
        actualDate: actualDateISO,
        evidence,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error("Error en GET /docente/:docenteId/matriz", error);
    res.status(500).json({ error: "Error interno" });
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
           estado_revision    = CASE WHEN $1 = true THEN 'enviado' ELSE COALESCE(estado_revision, 'enviado') END
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
