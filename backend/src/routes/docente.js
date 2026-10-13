import express from "express";
import { pool } from "../db.js";
import {
  calcularMetricas,
  hoyBogota,
  itemParaApi,
  metricasPorMes,
  metricasPorSemana,
  resumenParaApi,
  semanaActual,
} from "../services/matrizService.js";
import {
  actualizarFechaEntrega,
  aplicarAccionDocente,
  cargarItemsPorIniciativas,
  cargarMatrizDocentes,
  docenteTieneIniciativa,
  registrarDesdeMatriz,
  responderError,
} from "../services/matrizRepo.js";

const router = express.Router();

const idValido = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Vista de indicadores de un docente: matriz por plantilla; si no tiene grupo, sus iniciativas.
async function cargarVistaDocente(docenteId) {
  const hoy = hoyBogota();
  const [d] = await cargarMatrizDocentes(pool, { docenteId, hoy });
  if (!d) return null;
  let items = d.items;
  let origen = "matriz";
  if (items.length === 0) {
    items = await cargarItemsPorIniciativas(pool, docenteId, hoy);
    origen = "iniciativas";
  }
  return {
    docente: d.docente,
    calendario: d.calendario,
    items,
    origen,
    hoy,
    semana: semanaActual(d.calendario, hoy),
    metricas: calcularMetricas(items, hoy),
  };
}

const formatoFechaCorta = (iso) =>
  iso
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const etiquetaItem = (it) => it.proyecto_titulo || it.fase || it.categoria_raw || "Matriz";

const itemLiviano = (it) => ({
  id: it.entregable_id ?? it.plantilla_id,
  plantilla_id: it.plantilla_id,
  entregable_id: it.entregable_id,
  proyecto: etiquetaItem(it),
  entregable: it.actividad_reportada || it.entregable,
  fechaFin: it.fecha_fin,
  semana: it.semana_numero,
  estado: it.clasificacion.estado,
  vencido: it.clasificacion.vencido,
  comentario_revision: it.comentario_revision || null,
});

const porFechaFin = (a, b) =>
  (a.fecha_fin || "9999-12-31").localeCompare(b.fecha_fin || "9999-12-31") || a.semana_numero - b.semana_numero;

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
        to_char(p.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        to_char(p.fecha_fin_estimada, 'YYYY-MM-DD') AS fecha_fin_estimada,
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

// Indicadores y listas accionables del dashboard del docente.
router.get("/:id/dashboard-stats", async (req, res) => {
  const docenteId = idValido(req.params.id);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });

  try {
    const vista = await cargarVistaDocente(docenteId);
    if (!vista) return res.status(404).json({ error: "Docente no encontrado" });
    const { items, metricas: m, hoy } = vista;

    const accionables = items.filter((i) => i.clasificacion.requiere_accion_docente).sort(porFechaFin);
    const vencidos = accionables.filter((i) => i.clasificacion.vencido);
    const observados = items.filter((i) => i.clasificacion.estado === "observado").sort(porFechaFin);
    const pendientes = accionables.filter((i) => !i.clasificacion.vencido && i.clasificacion.estado !== "observado");
    const proximos = accionables.filter((i) => i.fecha_fin && i.fecha_fin >= hoy);
    const proximo = proximos[0] ? itemLiviano(proximos[0]) : null;

    const porMes = metricasPorMes(items, hoy).map((x) => ({
      month: x.mes,
      total: x.total,
      done: x.reportados,
      aprobados: x.aprobados,
      pct: x.pct_reportado,
      pct_aprobado: x.pct_aprobado,
      pct_esperado: x.pct_esperado,
    }));

    const STATUS_LEGACY = { aprobado: "approved", enviado: "review", observado: "observed" };
    const activities = items
      .slice()
      .sort(porFechaFin)
      .map((i) => ({
        id: i.entregable_id ?? i.plantilla_id,
        plantilla_id: i.plantilla_id,
        entregable_id: i.entregable_id,
        project: etiquetaItem(i),
        activity: i.actividad_reportada || i.entregable,
        deadline: formatoFechaCorta(i.fecha_fin),
        fecha_fin: i.fecha_fin,
        estado: i.clasificacion.estado,
        vencido: i.clasificacion.vencido,
        status: i.clasificacion.vencido ? "delayed" : STATUS_LEGACY[i.clasificacion.estado] || "pending",
      }));

    res.json({
      // Claves históricas: completed = reportados (enviados + aprobados), pct = % reportado.
      stats: { total: m.total, completed: m.reportados, pct: m.pct_reportado },
      indicadores: resumenParaApi(m),
      semana_actual: vista.semana,
      origen: vista.origen,
      byMonth: porMes,
      por_semana: metricasPorSemana(items, hoy),
      upcoming: accionables.slice(0, 8).map((i) => ({ ...itemLiviano(i), fechaFin: i.fecha_fin })),
      conteos: {
        pendientes: pendientes.length,
        observados: observados.length,
        vencidos: vencidos.length,
        en_revision: m.enviados_pendientes_revision,
      },
      proximo_entregable: proximo,
      pendientes: pendientes.slice(0, 20).map(itemLiviano),
      observados: observados.slice(0, 20).map(itemLiviano),
      vencidos: vencidos.slice(0, 20).map(itemLiviano),
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
        to_char(s.fecha_inicio, 'YYYY-MM-DD') AS semana_fecha_inicio,
        to_char(s.fecha_fin, 'YYYY-MM-DD')    AS semana_fecha_fin,
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
              'fecha_real_entrega', e.fecha_real_entrega,
              'estado_revision', e.estado_revision,
              'comentario_revision', e.comentario_revision
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

// Últimas notificaciones para el docente (vencidos, observaciones, aprobaciones recientes)
router.get("/:id/notificaciones", async (req, res) => {
  const docenteId = idValido(req.params.id);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });

  try {
    const vista = await cargarVistaDocente(docenteId);
    if (!vista) return res.status(404).json({ error: "Docente no encontrado" });
    const { items, hoy } = vista;
    const hace7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const iso = (d) => (d ? (d instanceof Date ? d : new Date(d)).toISOString() : null);

    const lista = [];
    for (const it of items) {
      const nombre = it.actividad_reportada || it.entregable;
      const k = it.clasificacion;
      if (k.vencido) {
        lista.push({
          tipo: "vencido",
          referencia_id: it.entregable_id ?? it.plantilla_id,
          mensaje: `Entregable vencido: ${nombre}`,
          fecha: it.fecha_fin ? `${it.fecha_fin}T12:00:00-05:00` : null,
        });
      }
      if (k.estado === "observado" && it.revisado_en) {
        lista.push({
          tipo: "observacion",
          referencia_id: it.entregable_id,
          mensaje: `Reporte con observación: ${nombre}`,
          fecha: iso(it.revisado_en),
        });
      }
      const aprobadoEn = it.aprobado_en ?? it.revisado_en;
      if (k.estado === "aprobado" && aprobadoEn && new Date(aprobadoEn).getTime() >= hace7) {
        lista.push({
          tipo: "aprobado",
          referencia_id: it.entregable_id,
          mensaje: `Reporte aprobado: ${nombre}`,
          fecha: iso(aprobadoEn),
        });
      }
    }
    lista.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    res.json({ notificaciones: lista.slice(0, 10).map((n) => ({ ...n, referencia_id: Number(n.referencia_id) })), hoy });
  } catch (error) {
    responderError(res, error, "Error en GET /docente/:id/notificaciones");
  }
});

// Perfil completo del docente (matriz, indicadores, avance)
router.get("/:id/perfil", async (req, res) => {
  const docenteId = idValido(req.params.id);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });

  try {
    const user = await pool.query(
      `
      SELECT
        u.id, u.nombre, u.apellido, u.correo, u.rol, u.tipo_docente, u.regional, u.link_drive,
        u.programa_id, u.grupo_matriz_id, u.perfil_indicador_id,
        p.nombre AS programa_nombre,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        gm.id AS gm_id, gm.nombre AS gm_nombre, gm.horas_totales AS gm_horas,
        gm.num_proyectos AS gm_num_proyectos, gm.num_actividades AS gm_num_actividades,
        gm.num_convenios_nuevos AS gm_num_convenios_nuevos,
        gm.num_convenios_dinamizados AS gm_num_convenios_dinamizados,
        pi.id AS pi_id, pi.nombre AS pi_nombre,
        pi.num_proyectos AS pi_num_proyectos, pi.num_actividades AS pi_num_actividades,
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
    if (user.rowCount === 0) return res.status(404).json({ error: "Docente no encontrado" });
    const row = user.rows[0];

    const hoy = hoyBogota();
    const [d] = await cargarMatrizDocentes(pool, { docenteId, hoy });
    const items = d?.items ?? [];
    const m = calcularMetricas(items, hoy);

    res.json({
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      correo: row.correo,
      rol: row.rol,
      tipo_docente: row.tipo_docente,
      regional: row.regional,
      link_drive: row.link_drive,
      programa: { id: row.programa_id, nombre: row.programa_nombre || "Sin programa" },
      escuela: { id: null, nombre: row.escuela_nombre || "Sin escuela" },
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
    responderError(res, error, "Error en GET /docente/:id/perfil");
  }
});

// Matriz de seguimiento (plantilla + entregable reportado del docente)
router.get("/:docenteId/matriz", async (req, res) => {
  const docenteId = idValido(req.params.docenteId);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });

  try {
    const hoy = hoyBogota();
    const [d] = await cargarMatrizDocentes(pool, { docenteId, hoy });
    if (!d) return res.status(404).json({ error: "docente no encontrado" });
    res.json({
      items: d.items.map(itemParaApi),
      resumen: resumenParaApi(calcularMetricas(d.items, hoy)),
      semana_actual: semanaActual(d.calendario, hoy),
      hoy,
    });
  } catch (error) {
    responderError(res, error, "Error en GET /docente/:docenteId/matriz");
  }
});

// Estadísticas agregadas (mismas reglas que GET .../matriz)
router.get("/:docenteId/matriz-stats", async (req, res) => {
  const docenteId = idValido(req.params.docenteId);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });

  try {
    const hoy = hoyBogota();
    const [d] = await cargarMatrizDocentes(pool, { docenteId, hoy });
    if (!d) return res.status(404).json({ error: "docente no encontrado" });
    res.json({
      resumen: resumenParaApi(calcularMetricas(d.items, hoy)),
      por_mes: metricasPorMes(d.items, hoy),
      por_semana: metricasPorSemana(d.items, hoy),
      semana_actual: semanaActual(d.calendario, hoy),
      hoy,
    });
  } catch (error) {
    responderError(res, error, "Error en GET /docente/:docenteId/matriz-stats");
  }
});

// Enviar / retirar un entregable desde la matriz (crea el registro vinculado a la plantilla si no existe).
router.post("/:docenteId/matriz/:plantillaId/completar", async (req, res) => {
  const docenteId = idValido(req.params.docenteId);
  const plantillaId = idValido(req.params.plantillaId);
  const body = req.body || {};
  if (!docenteId || !plantillaId) return res.status(400).json({ error: "ids inválidos" });
  if (typeof body.completado !== "boolean") {
    return res.status(400).json({ error: "completado debe ser boolean" });
  }

  const datos = {};
  if (body.fecha_real_entrega !== undefined) datos.fecha_real_entrega = body.fecha_real_entrega;
  if (body.url_evidencia !== undefined && body.url_evidencia !== null) datos.url_evidencia = body.url_evidencia;
  if (body.urls_evidencia !== undefined) datos.url_evidencia = body.urls_evidencia;
  if (body.justificacion_exencion !== undefined) datos.exencion = body.justificacion_exencion;

  try {
    const out = await registrarDesdeMatriz(pool, {
      docenteId,
      plantillaId,
      completado: body.completado,
      proyectoId: body.proyecto_id != null ? idValido(body.proyecto_id) : null,
      datos,
    });
    res.json(out);
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
    // Un docente solo puede ver iniciativas propias o en las que colabora.
    if (!(await docenteTieneIniciativa(pool, docenteId, proyectoId))) {
      return res.status(403).json({ error: "No tienes acceso a esta iniciativa" });
    }
    const proj = await pool.query(
      `SELECT p.id, p.titulo, p.descripcion, p.tipo, p.estado,
              to_char(p.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
              to_char(p.fecha_fin_estimada, 'YYYY-MM-DD') AS fecha_fin_estimada,
              p.horas_totales, p.semanas,
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
         s.id, s.numero,
         to_char(s.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
         to_char(s.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
         COALESCE(
           json_agg(
             json_build_object(
               'id',                 e.id,
               'descripcion',        e.descripcion,
               'horas',              e.horas,
               'completado',         COALESCE(e.completado, false),
               'fecha_completado',   e.fecha_completado,
               'url_evidencia',      e.url_evidencia,
               'fecha_real_entrega', e.fecha_real_entrega,
               'estado_revision',    e.estado_revision,
               'comentario_revision', e.comentario_revision
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

// Guardar borrador: texto y evidencias sin enviar a revisión (un observado conserva su estado).
router.patch("/entregables/:entregableId/borrador", async (req, res) => {
  const entregableId = idValido(req.params.entregableId);
  if (!entregableId) return res.status(400).json({ error: "id de entregable inválido" });
  const b = req.body || {};
  const docenteId = idValido(b.docente_id);
  if (!docenteId) return res.status(400).json({ error: "docente_id es obligatorio" });

  const datos = {
    actividad_reportada: b.actividad_reportada != null ? String(b.actividad_reportada) : null,
    descripcion_reporte: b.descripcion_reporte != null ? String(b.descripcion_reporte) : null,
    porcentaje_avance: b.porcentaje_avance,
  };
  if (Object.prototype.hasOwnProperty.call(b, "urls_evidencia")) datos.url_evidencia = b.urls_evidencia;
  if (b.justificacion_exencion !== undefined) datos.exencion = b.justificacion_exencion;

  try {
    const out = await aplicarAccionDocente(pool, { docenteId, entregableId, accion: "guardar_borrador", datos });
    res.json(out);
  } catch (error) {
    responderError(res, error, "Error en PATCH /docente/entregables/:id/borrador");
  }
});

// Fecha real de entrega declarada por el docente (no puede ser futura ni modificar un aprobado).
router.patch("/entregables/:entregableId/fecha-entrega", async (req, res) => {
  const entregableId = idValido(req.params.entregableId);
  const docenteId = idValido((req.body || {}).docente_id);
  const fecha = String((req.body || {}).fecha_real_entrega ?? "").trim();

  if (!entregableId) return res.status(400).json({ error: "id de entregable inválido" });
  if (!docenteId) return res.status(400).json({ error: "docente_id es obligatorio" });
  if (!fecha) return res.status(400).json({ error: "fecha_real_entrega es requerida" });

  try {
    const out = await actualizarFechaEntrega(pool, { docenteId, entregableId, fecha });
    res.json(out);
  } catch (error) {
    responderError(res, error, "Error en PATCH /docente/entregables/:id/fecha-entrega");
  }
});

// Reenviar un reporte observado (corregido) para revisión
router.post("/:docenteId/entregables/:entregableId/reenviar", async (req, res) => {
  const entregableId = idValido(req.params.entregableId);
  const docenteId = idValido(req.params.docenteId);
  if (!docenteId) return res.status(400).json({ error: "id de docente inválido" });
  if (!entregableId) return res.status(400).json({ error: "id de entregable inválido" });

  try {
    const out = await aplicarAccionDocente(pool, {
      docenteId,
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

// Reporte de un entregable (enviar o retirar). El docente es obligatorio: sin él no hay validación de permisos.
router.put("/entregables/:entregableId", async (req, res) => {
  const entregableId = idValido(req.params.entregableId);
  if (!entregableId) return res.status(400).json({ error: "id de entregable inválido" });
  const b = req.body || {};
  const docenteId = idValido(b.docente_id);
  if (!docenteId) return res.status(400).json({ error: "docente_id es obligatorio" });

  const datos = {};
  if (b.fecha_real_entrega !== undefined) datos.fecha_real_entrega = b.fecha_real_entrega;
  if (b.url_evidencia !== undefined) datos.url_evidencia = b.url_evidencia;
  if (b.urls_evidencia !== undefined) datos.url_evidencia = b.urls_evidencia;
  if (b.actividad_reportada !== undefined) datos.actividad_reportada = b.actividad_reportada;
  if (b.descripcion_reporte !== undefined) datos.descripcion_reporte = b.descripcion_reporte;
  if (b.porcentaje_avance !== undefined) datos.porcentaje_avance = b.porcentaje_avance;
  if (b.justificacion_exencion !== undefined) datos.exencion = b.justificacion_exencion;

  try {
    const out = await aplicarAccionDocente(pool, {
      docenteId,
      entregableId,
      accion: b.completado === true ? "enviar" : "retirar",
      datos,
    });
    res.json({ ok: true, ...out });
  } catch (error) {
    responderError(res, error, "Error en PUT /docente/entregables/:entregableId");
  }
});

export default router;
