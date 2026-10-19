import express from "express";
import { pool } from "../db.js";
import {
  ErrorNegocio,
  buildMatrixStats,
  calcularMetricas,
  fechaBogota,
  hoyBogota,
  itemParaApi,
  loadAssignedInitiatives,
  loadMatrixForDocentes,
  mesDeFecha,
  normalizarCalendario,
  resolverRequisitoEvidencia,
  responderError,
  round1,
  semanaActual,
  sumarDias,
  toDateOnlyISO,
} from "../services/matrizService.js";
import { aplicarRevisionAdmin, reabrirEntregable } from "../services/entregableWorkflowService.js";
import {
  ENTREGABLE_CON_AVANCE_SQL,
  LOCK_ADMINISTRADORES,
  bloquearHistoriaDeProyecto,
  bloquearPlantillasDeGrupos,
  describirResumen,
  docentesDeGrupos,
  errorHistorico,
  exigirAsignacionSinHistorico,
  historicoDeCalendarioSemestre,
  historicoDeColaborador,
  historicoDeGrupos,
  historicoDePlantillas,
  historicoDeProyecto,
  historicoDeSemestre,
  historicoDeUsuario,
  plantillasConHistorico,
} from "../services/historicosService.js";
import { evidenciasDeEntregables, historialDeEntregable } from "../services/evidenciaService.js";
import { markNotificationsAsRead } from "../services/notificationService.js";
import {
  emailConfiguration,
  enqueueDailyDigests,
  processEmailQueue,
} from "../services/emailService.js";

const router = express.Router();

const monthLabelFromDate = (value) => {
  const iso = toDateOnlyISO(value);
  return iso ? mesDeFecha(iso) : "";
};

const monthLabelFromWeek = (semesterStart, week) => {
  const iso = toDateOnlyISO(semesterStart);
  if (!iso) return "";
  return monthLabelFromDate(sumarDias(iso, (Math.max(1, Number(week) || 1) - 1) * 7));
};

// Matriz de un docente (calendario real del semestre y «hoy» en America/Bogota).
async function loadAdminMatrix(docenteId, db = pool) {
  const hoy = hoyBogota();
  const [entry] = await loadMatrixForDocentes(db, { docenteId, hoy });
  return entry ? { ...entry, hoy } : null;
}

const SEMESTRE_REGEX = /^\d{4}[AB]$/;
function isValidSemestreValue(s) {
  return typeof s === "string" && SEMESTRE_REGEX.test(String(s).trim());
}

function parseProgramaInput(body) {
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
  const escuelaId = Number(body?.escuela_id);

  if (!nombre || !codigo || !Number.isInteger(escuelaId) || escuelaId <= 0) {
    return { error: "Código, nombre y escuela son obligatorios." };
  }
  if (nombre.length > 200 || codigo.length > 50) {
    return { error: "El programa excede la longitud permitida." };
  }

  return { value: { nombre, codigo, escuela_id: escuelaId } };
}

function parseEscuelaInput(body) {
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const codigoRaw = typeof body?.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
  const codigo = codigoRaw || null;

  if (!nombre) {
    return { error: "El nombre de la escuela es obligatorio." };
  }
  if (nombre.length > 200 || (codigo && codigo.length > 50)) {
    return { error: "La escuela excede la longitud permitida." };
  }

  return { value: { nombre, codigo } };
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
    ? text
    : null;
}

function daysBetweenDateOnly(from, to) {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!fromDate || !toDate) return null;
  return Math.round(
    (new Date(`${toDate}T00:00:00Z`).getTime() -
      new Date(`${fromDate}T00:00:00Z`).getTime()) /
      86_400_000
  );
}

function normalizeOptionalHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) return { value: null };
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") return { error: "El enlace debe usar HTTPS" };
    return { value: parsed.toString() };
  } catch {
    return { error: "El enlace no es una URL válida" };
  }
}

function validateSemesterFields(body) {
  const codigo = String(body?.codigo || "").trim().toUpperCase();
  const fechaInicio = parseDateOnly(body?.fecha_inicio);
  const fechaFin = parseDateOnly(body?.fecha_fin);
  const numeroSemanas = Number(body?.numero_semanas);

  if (!isValidSemestreValue(codigo)) {
    return { error: "El semestre debe tener formato YYYYA o YYYYB" };
  }
  if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) {
    return { error: "Las fechas del semestre no son válidas" };
  }
  if (!Number.isInteger(numeroSemanas) || numeroSemanas < 1 || numeroSemanas > 53) {
    return { error: "numero_semanas debe ser un entero entre 1 y 53" };
  }
  return { codigo, fechaInicio, fechaFin, numeroSemanas };
}

// Dashboard admin (expuesto: stats, progreso_semanal, cumplimiento_por_programa, docentes_recientes)
router.get("/dashboard", async (_req, res) => {
  const client = await pool.connect();
  try {
    const hoy = hoyBogota();
    const semesterR = await client.query(`
      SELECT codigo, fecha_inicio, fecha_fin, numero_semanas
      FROM semestres
      WHERE activo = TRUE
      ORDER BY fecha_inicio DESC
      LIMIT 1
    `);
    const calendarioActivo = normalizarCalendario(semesterR.rows[0] || null);
    const docentes = await loadMatrixForDocentes(client, { hoy });
    const proyectosActivosR = await client.query(
      `SELECT COUNT(*)::int AS total FROM proyectos WHERE estado = 'en_ejecucion'`
    );

    // Conteos globales de entregables registrados (incluye los que no pertenecen a una plantilla).
    const reportesR = await client.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE estado_revision = 'aprobado'
             OR (COALESCE(completado, false) AND estado_revision = 'enviado')
        )::int AS enviados,
        COUNT(*) FILTER (WHERE COALESCE(completado, false) AND estado_revision = 'enviado')::int AS pendientes_revision,
        COUNT(*) FILTER (WHERE estado_revision = 'aprobado')::int AS aprobados,
        COUNT(*) FILTER (WHERE estado_revision = 'observado')::int AS observados
      FROM proyecto_entregables
    `);

    const semanaRows = await client.query(`
      SELECT
        s.numero AS semana,
        COUNT(e.id) FILTER (
          WHERE e.estado_revision = 'aprobado'
             OR (COALESCE(e.completado, false) AND e.estado_revision = 'enviado')
        )::int AS enviados,
        COUNT(e.id) FILTER (WHERE e.estado_revision = 'aprobado')::int AS aprobados
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
    const configuredWeeks = calendarioActivo?.num_semanas ?? 0;
    const reportedWeeks = [...semanaMap.keys()].sort((a, b) => a - b);
    const weekNumbers =
      configuredWeeks > 0
        ? Array.from({ length: configuredWeeks }, (_, index) => index + 1)
        : reportedWeeks;
    const progreso_semanal = weekNumbers.map((semana) => {
      const row = semanaMap.get(semana) || { enviados: 0, aprobados: 0 };
      return {
        semana,
        mes: calendarioActivo ? monthLabelFromWeek(calendarioActivo.fecha_inicio, semana) : "",
        enviados: row.enviados, // alias histórico = reportados (enviados + aprobados)
        reportados: row.enviados,
        aprobados: row.aprobados,
      };
    });

    const porDocente = docentes.map(({ docente, items, calendario }) => ({
      docente,
      items,
      calendario,
      m: calcularMetricas(items, hoy),
    }));

    const porPrograma = new Map();
    for (const { docente, items, m } of porDocente) {
      if (!docente.programa_id || items.length === 0) continue;
      const g = porPrograma.get(docente.programa_id) ?? { programa: docente.programa, docentes: 0, rep: 0, apr: 0, esp: 0 };
      g.docentes += 1;
      g.rep += m.pct_reportado;
      g.apr += m.pct_aprobado;
      g.esp += m.pct_esperado;
      porPrograma.set(docente.programa_id, g);
    }
    const cumplimiento_por_programa = [...porPrograma.values()]
      .sort((a, b) => b.docentes - a.docentes || String(a.programa).localeCompare(String(b.programa)))
      .slice(0, 8)
      .map((g) => ({
        programa: g.programa || "Sin nombre",
        porcentaje: round1(g.rep / g.docentes), // alias histórico = reportado
        porcentaje_reportado: round1(g.rep / g.docentes),
        porcentaje_aprobado: round1(g.apr / g.docentes),
        porcentaje_esperado: round1(g.esp / g.docentes),
        docentes: g.docentes,
      }));

    const docentes_recientes = porDocente.map(({ docente, items, m }) => ({
      id: docente.id,
      nombre: docente.nombre || "—",
      programa: docente.programa || "Sin programa",
      regional: docente.regional || "—",
      porcentaje_avance: m.pct_reportado, // alias histórico = reportado
      porcentaje_reportado: m.pct_reportado,
      porcentaje_aprobado: m.pct_aprobado,
      porcentaje_esperado: m.pct_esperado,
      brecha: m.brecha,
      brecha_pct: m.brecha_pct,
      cumplimiento_exigible: m.cumplimiento_exigible,
      semaforo: m.semaforo,
      pendientes_revision: m.enviados_pendientes_revision,
      observados: m.observados,
      vencidos: m.vencidos,
      reportes_enviados: m.reportados,
      estado: items.length === 0 ? "sin_actividad" : m.vencidos > 0 ? "atrasado" : "al_dia",
    }));

    const conPlantilla = porDocente.filter((d) => d.items.length > 0);
    const promedio = (campo) =>
      conPlantilla.length ? round1(conPlantilla.reduce((s, d) => s + d.m[campo], 0) / conPlantilla.length) : 0;
    const docentes_atrasados = docentes_recientes.filter((d) => d.estado === "atrasado").length;
    const rep0 = reportesR.rows[0] || {};

    res.json({
      stats: {
        total_docentes: docentes.length,
        reportes_enviados: Number(rep0.enviados ?? 0),
        pendientes_revision: Number(rep0.pendientes_revision ?? 0),
        reportes_aprobados: Number(rep0.aprobados ?? 0),
        reportes_observados: Number(rep0.observados ?? 0),
        docentes_atrasados,
        proyectos_activos: proyectosActivosR.rows[0]?.total ?? 0,
        avance_reportado_promedio: promedio("pct_reportado"),
        avance_aprobado_promedio: promedio("pct_aprobado"),
        avance_esperado_promedio: promedio("pct_esperado"),
        semaforo: {
          verde: docentes_recientes.filter((d) => d.semaforo === "verde").length,
          amarillo: docentes_recientes.filter((d) => d.semaforo === "amarillo").length,
          rojo: docentes_recientes.filter((d) => d.semaforo === "rojo").length,
        },
      },
      semana_actual: semanaActual(calendarioActivo, hoy),
      progreso_semanal,
      cumplimiento_por_programa,
      docentes_recientes,
      docentes: docentes.length,
      proyectos_activos: proyectosActivosR.rows[0]?.total,
      reportes: { enviados: Number(rep0.enviados ?? 0), aprobados: Number(rep0.aprobados ?? 0) },
    });
  } catch (error) {
    responderError(res, error, "Error en /admin/dashboard");
  } finally {
    client.release();
  }
});

router.get("/notificaciones", async (req, res) => {
  try {
    const result = await pool.query(
      `
      WITH origen AS (
        SELECT
          'nuevo_reporte'::text AS tipo,
          pe.id::bigint AS referencia_id,
          CONCAT(
            u.nombre, ' ', u.apellido,
            ' envió un reporte: ',
            COALESCE(pe.actividad_reportada, pe.descripcion)
          ) AS mensaje,
          evento.fecha_evento AS fecha,
          CONCAT('nuevo_reporte:', pe.id, ':', evento.fecha_evento::text) AS clave,
          CONCAT('/admin/revision?reporte=', pe.id) AS destino
        FROM proyecto_entregables pe
        JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
        JOIN proyectos p ON p.id = ps.proyecto_id
        JOIN usuarios u ON u.id = COALESCE(pe.docente_id, p.docente_responsable_id)
        CROSS JOIN LATERAL (
          SELECT COALESCE(
            pe.fecha_cargue_evidencia,
            pe.fecha_completado::timestamptz,
            pe.fecha_real_entrega::timestamptz,
            pe.creado_en::timestamptz
          ) AS fecha_evento
        ) evento
        WHERE COALESCE(pe.estado_revision, 'enviado') = 'enviado'
          AND COALESCE(pe.completado, false) = true
          AND evento.fecha_evento >= NOW() - INTERVAL '48 hours'

        UNION ALL

        SELECT
          'sin_actividad'::text AS tipo,
          u.id::bigint AS referencia_id,
          CONCAT(u.nombre, ' ', u.apellido, ' lleva más de 14 días sin reportar') AS mensaje,
          COALESCE(actividad.ultima_actividad, u.creado_en::timestamptz)
            + INTERVAL '14 days' AS fecha,
          CONCAT(
            'sin_actividad:', u.id, ':',
            COALESCE(actividad.ultima_actividad::text, 'sin-reportes')
          ) AS clave,
          CONCAT('/admin/docentes/', u.id, '/matriz') AS destino
        FROM usuarios u
        LEFT JOIN LATERAL (
          SELECT MAX(
            COALESCE(
              pe.fecha_cargue_evidencia,
              pe.fecha_completado::timestamptz,
              pe.fecha_real_entrega::timestamptz,
              pe.creado_en::timestamptz
            )
          ) AS ultima_actividad
          FROM proyecto_entregables pe
          JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
          JOIN proyectos p ON p.id = ps.proyecto_id
          WHERE COALESCE(pe.docente_id, p.docente_responsable_id) = u.id
            AND COALESCE(pe.completado, false) = true
        ) actividad ON TRUE
        WHERE u.rol = 'docente'
          AND u.estado = 'activo'
          AND COALESCE(actividad.ultima_actividad, u.creado_en::timestamptz)
              < NOW() - INTERVAL '14 days'
      ), pendientes AS (
        SELECT origen.*
        FROM origen
        LEFT JOIN notificacion_lecturas lectura
          ON lectura.usuario_id = $1 AND lectura.clave = origen.clave
        WHERE lectura.clave IS NULL
      )
      SELECT tipo, referencia_id, mensaje, fecha, clave, destino
      FROM pendientes
      ORDER BY fecha DESC NULLS LAST, clave
      `,
      [req.user.id]
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
    console.error("Error en GET /admin/notificaciones", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.patch("/notificaciones/leer", async (req, res) => {
  try {
    const marked = await markNotificationsAsRead(
      req.user.id,
      req.body?.notificaciones ?? req.body
    );
    res.json({ marcadas: marked });
  } catch (error) {
    console.error("Error en PATCH /admin/notificaciones/leer", error);
    res.status(Number(error?.status) || 500).json({
      error: Number(error?.status)
        ? error.message
        : "No fue posible marcar la notificación",
    });
  }
});

router.get("/correos/estado", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'procesando')::int AS procesando,
        COUNT(*) FILTER (WHERE estado = 'enviado')::int AS enviados,
        COUNT(*) FILTER (WHERE estado = 'fallido')::int AS fallidos,
        MAX(enviado_en) AS ultimo_envio
      FROM notificacion_correos
      `
    );
    const config = emailConfiguration();
    res.json({
      enabled: config.enabled,
      configured: config.configured,
      queue: result.rows[0],
    });
  } catch (error) {
    console.error("Error en GET /admin/correos/estado", error);
    res.status(500).json({ error: "No fue posible consultar el estado de correos" });
  }
});

router.post("/correos/procesar", async (_req, res) => {
  try {
    const digest = await enqueueDailyDigests();
    const delivery = await processEmailQueue();
    res.json({ digest, delivery });
  } catch (error) {
    console.error("Error en POST /admin/correos/procesar", error);
    res.status(500).json({ error: "No fue posible procesar los correos" });
  }
});

router.post("/notificaciones", async (req, res) => {
  const docenteId = Number(req.body?.docente_id);
  const mensaje = String(req.body?.mensaje || "").trim();
  const referenciaId = req.body?.referencia_id == null ? null : Number(req.body.referencia_id);

  if (!Number.isInteger(docenteId) || docenteId <= 0) {
    return res.status(400).json({ error: "docente_id es inválido" });
  }
  if (!mensaje || mensaje.length > 1000) {
    return res.status(400).json({ error: "El mensaje debe tener entre 1 y 1000 caracteres" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO notificaciones (
        usuario_id, creado_por_id, tipo, mensaje, referencia_tipo, referencia_id
      )
      SELECT id, $2, 'mensaje_admin', $3, 'reporte', $4
      FROM usuarios
      WHERE id = $1 AND rol = 'docente' AND estado = 'activo'
      RETURNING id, usuario_id, tipo, mensaje, referencia_id, creado_en
      `,
      [docenteId, req.user.id, mensaje, Number.isInteger(referenciaId) ? referenciaId : null]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Docente activo no encontrado" });
    }
    res.status(201).json({ notificacion: result.rows[0] });
  } catch (error) {
    console.error("Error en POST /admin/notificaciones", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/metricas", async (_req, res) => {
  const client = await pool.connect();
  try {
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
      WITH periodo AS (
        SELECT fecha_inicio, fecha_fin
        FROM semestres
        WHERE activo = TRUE
        ORDER BY fecha_inicio DESC
        LIMIT 1
      ),
      meses AS (
        SELECT generate_series(
          date_trunc('month', fecha_inicio),
          date_trunc('month', fecha_fin),
          INTERVAL '1 month'
        )::date AS mes_inicio
        FROM periodo
      )
      SELECT
        m.mes_inicio,
        COUNT(e.id)::int AS total,
        COUNT(e.id) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados,
        COUNT(e.id) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'observado'
        )::int AS observados,
        COUNT(e.id) FILTER (
          WHERE COALESCE(e.estado_revision, 'enviado') = 'enviado'
        )::int AS pendientes
      FROM meses m
      LEFT JOIN proyecto_entregables e
        ON COALESCE(e.completado, false) = true
       AND COALESCE(e.fecha_real_entrega, e.fecha_completado) >= m.mes_inicio
       AND COALESCE(e.fecha_real_entrega, e.fecha_completado) < m.mes_inicio + INTERVAL '1 month'
      GROUP BY m.mes_inicio
      ORDER BY m.mes_inicio
    `);

    const por_mes = (porMesR.rows || []).map((r) => ({
      mes: monthLabelFromDate(r.mes_inicio),
      total: Number(r.total || 0),
      aprobados: Number(r.aprobados || 0),
      observados: Number(r.observados || 0),
      pendientes: Number(r.pendientes || 0),
    }));

    const hoy = hoyBogota();
    const docentesMatriz = await loadMatrixForDocentes(client, { hoy });
    const porDocente = docentesMatriz
      .map(({ docente, items }) => ({ docente, items, m: calcularMetricas(items, hoy) }))
      .filter((d) => d.items.length > 0);

    const gruposR = await client.query(`
      SELECT id AS grupo_id, nombre AS grupo_nombre, COALESCE(tipo_docente, 'ANTIGUO') AS tipo_docente
      FROM grupos_matriz
      ORDER BY nombre
    `);
    const por_grupo = (gruposR.rows || []).map((g) => {
      const miembros = porDocente.filter((d) => d.docente.grupo_id === Number(g.grupo_id));
      const total = miembros.reduce((s, d) => s + d.m.total, 0);
      const reportados = miembros.reduce((s, d) => s + d.m.reportados, 0);
      const aprobados = miembros.reduce((s, d) => s + d.m.aprobados, 0);
      const esperado = miembros.reduce((s, d) => s + d.m.esperado, 0);
      return {
        grupo_id: Number(g.grupo_id),
        grupo_nombre: g.grupo_nombre || "",
        tipo_docente: g.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO",
        total_docentes: miembros.length,
        entregables_completados: reportados, // alias histórico = reportados
        entregables_reportados: reportados,
        entregables_aprobados: aprobados,
        entregables_esperados: esperado,
        entregables_total: total,
        porcentaje: total > 0 ? round1((reportados / total) * 100) : 0,
        porcentaje_aprobado: total > 0 ? round1((aprobados / total) * 100) : 0,
        porcentaje_esperado: total > 0 ? round1((esperado / total) * 100) : 0,
      };
    });

    const regionales = new Map();
    for (const d of porDocente) {
      const regional = (d.docente.regional || "").trim() || "Sin regional";
      const g = regionales.get(regional) ?? { regional, docentes: 0, rep: 0, apr: 0 };
      g.docentes += 1;
      g.rep += d.m.pct_reportado;
      g.apr += d.m.pct_aprobado;
      regionales.set(regional, g);
    }
    const por_regional = [...regionales.values()]
      .sort((a, b) => a.regional.localeCompare(b.regional))
      .map((g) => ({
        regional: g.regional,
        docentes: g.docentes,
        porcentaje_avance: round1(g.rep / g.docentes), // alias histórico = reportado
        porcentaje_reportado: round1(g.rep / g.docentes),
        porcentaje_aprobado: round1(g.apr / g.docentes),
      }));

    const top_atrasados = porDocente
      .slice()
      .sort(
        (a, b) =>
          b.m.vencidos - a.m.vencidos ||
          a.m.pct_aprobado - b.m.pct_aprobado ||
          a.docente.nombre.localeCompare(b.docente.nombre)
      )
      .slice(0, 10)
      .map(({ docente, m }) => ({
        docente_id: docente.id,
        nombre: docente.nombre,
        programa: docente.programa || "Sin programa",
        regional: docente.regional || "—",
        grupo: docente.grupo_nombre || "—",
        entregables_vencidos: m.vencidos,
        porcentaje_avance: m.pct_reportado, // alias histórico = reportado
        porcentaje_reportado: m.pct_reportado,
        porcentaje_aprobado: m.pct_aprobado,
        semaforo: m.semaforo,
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

// Bandeja de revisión de entregables (coordinación). Por defecto lista los enviados pendientes, como antes;
// con `estado` también observados, aprobados, con problema de acceso o todos. Filtros en el servidor:
// escuela, programa, docente (nombre o docente_id), semestre, iniciativa (q) y rango de fechas de envío.
const ESTADOS_BANDEJA = ["enviado", "observado", "aprobado", "sin_acceso", "todos"];
router.get("/reportes-revision", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20));
  const requestedReportId =
    req.query.reporte == null
      ? null
      : Number.parseInt(String(req.query.reporte), 10);
  if (
    requestedReportId != null &&
    (!Number.isInteger(requestedReportId) || requestedReportId <= 0)
  ) {
    return res.status(400).json({ error: "reporte inválido" });
  }
  const estado = String(req.query.estado || "enviado");
  if (!ESTADOS_BANDEJA.includes(estado)) return res.status(400).json({ error: "estado inválido" });
  const texto = (k) => {
    const v = String(req.query[k] ?? "").trim();
    return v ? v.slice(0, 120) : null;
  };
  const fecha = (k) => {
    const v = String(req.query[k] ?? "").trim();
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    return v;
  };
  const desde = fecha("desde");
  const hasta = fecha("hasta");
  if (desde === undefined || hasta === undefined) return res.status(400).json({ error: "las fechas deben tener formato AAAA-MM-DD" });
  const docenteId = req.query.docente_id == null ? null : Number.parseInt(String(req.query.docente_id), 10);
  if (docenteId != null && (!Number.isInteger(docenteId) || docenteId <= 0)) return res.status(400).json({ error: "docente_id inválido" });

  const filtros = ["COALESCE(e.completado, false) = true"];
  const params = [];
  const add = (sql, valor) => {
    params.push(valor);
    filtros.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (estado === "sin_acceso") filtros.push("e.problema_acceso_en IS NOT NULL AND COALESCE(e.estado_revision, 'enviado') = 'observado'");
  else if (estado === "todos") filtros.push("COALESCE(e.estado_revision, 'enviado') IN ('enviado', 'observado', 'aprobado')");
  else add("COALESCE(e.estado_revision, 'enviado') = ?", estado);
  if (requestedReportId != null) add("e.id = ?", requestedReportId);
  if (docenteId != null) add("u.id = ?", docenteId);
  if (texto("docente")) add("TRIM(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')) = ?", texto("docente"));
  if (texto("programa")) add("prog.nombre = ?", texto("programa"));
  if (texto("escuela")) add("COALESCE(esc.nombre, 'Sin escuela') = ?", texto("escuela"));
  if (texto("semestre")) add("g.semestre = ?", texto("semestre"));
  if (texto("q")) add("(COALESCE(e.actividad_reportada, e.descripcion) ILIKE '%' || ? || '%' OR e.descripcion ILIKE '%' || ? || '%' OR p.titulo ILIKE '%' || ? || '%')", texto("q"));
  if (desde) add("(e.fecha_cargue_evidencia AT TIME ZONE 'America/Bogota')::date >= ?::date", desde);
  if (hasta) add("(e.fecha_cargue_evidencia AT TIME ZONE 'America/Bogota')::date <= ?::date", hasta);
  const donde = filtros.join(" AND ");
  const desdeSql = `
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN escuelas esc ON esc.id = prog.escuela_id
      LEFT JOIN usuarios u ON u.id = COALESCE(e.docente_id, p.docente_responsable_id)
      LEFT JOIN plantilla_entregables t ON t.id = e.plantilla_id
      LEFT JOIN grupos_matriz g ON g.id = t.grupo_id
      LEFT JOIN docente_entregable_excepciones dex ON dex.plantilla_id = t.id AND dex.docente_id = u.id
      WHERE ${donde}`;
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${desdeSql}`, params);
    const result = await pool.query(
      `
      SELECT
        e.id,
        COALESCE(e.estado_revision, 'enviado') AS estado_revision,
        e.comentario_revision,
        e.revisado_en,
        e.problema_acceso_en,
        e.fecha_real_entrega,
        e.fecha_completado,
        e.fecha_cargue_evidencia,
        e.fecha_primer_envio,
        COALESCE(e.num_envios, 0)::int AS num_envios,
        e.evidencia_exenta,
        e.justificacion_exencion,
        e.url_evidencia,
        COALESCE(e.actividad_reportada, e.descripcion) AS actividad_reportada,
        COALESCE(e.descripcion_reporte, '') AS descripcion_reporte,
        COALESCE(e.porcentaje_avance, 100)::int AS porcentaje_avance,
        COALESCE(e.horas, 0)::numeric AS horas,
        s.numero AS semana_numero,
        p.id AS proyecto_id,
        p.titulo AS proyecto_titulo,
        p.tipo AS proyecto_tipo,
        g.semestre,
        t.tipo_evidencia, t.requiere_evidencia,
        COALESCE(dex.descripcion_evidencia_override, t.descripcion_evidencia) AS descripcion_evidencia,
        prog.nombre AS programa_nombre,
        COALESCE(esc.nombre, 'Sin escuela') AS escuela_nombre,
        u.id AS docente_id,
        u.nombre,
        u.apellido,
        u.correo
      ${desdeSql}
      ORDER BY
        CASE COALESCE(e.estado_revision, 'enviado')
          WHEN 'enviado' THEN 0
          WHEN 'observado' THEN 1
          WHEN 'aprobado' THEN 2
          ELSE 3
        END,
        e.fecha_cargue_evidencia ASC NULLS LAST,
        e.id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    const ids = result.rows.map((r) => r.id);
    const evidencias = await evidenciasDeEntregables(pool, ids);
    const hoy = hoyBogota();
    const reportes = (result.rows || []).map((r) => {
      const todas = evidencias.get(r.id) ?? [];
      const requisito = resolverRequisitoEvidencia({ tipo_evidencia: r.tipo_evidencia, requiere_evidencia: r.requiere_evidencia, descripcion_evidencia: r.descripcion_evidencia });
      const envio = r.fecha_cargue_evidencia ? fechaBogota(r.fecha_cargue_evidencia) : null;
      return {
        id: r.id,
        estado_revision: r.estado_revision,
        comentario_revision: r.comentario_revision || "",
        revisado_en: r.revisado_en,
        problema_acceso: r.problema_acceso_en != null && r.estado_revision === "observado",
        problema_acceso_en: r.problema_acceso_en,
        fecha_real_entrega: r.fecha_real_entrega,
        fecha_completado: r.fecha_completado,
        fecha_cargue_evidencia: r.fecha_cargue_evidencia,
        fecha_primer_envio: r.fecha_primer_envio ? fechaBogota(r.fecha_primer_envio) : null,
        dias_en_espera: r.estado_revision === "enviado" && envio ? Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${envio}T00:00:00Z`)) / 86400000)) : null,
        num_envios: r.num_envios,
        es_reenvio: r.num_envios > 1,
        evidencia_exenta: r.evidencia_exenta === true,
        justificacion_exencion: r.justificacion_exencion || "",
        url_evidencia: r.url_evidencia || "",
        evidencias: todas.filter((x) => x.estado === "vigente"),
        versiones_anteriores: todas.filter((x) => x.estado !== "vigente"),
        requisito_evidencia: { requiere: requisito.requiere, tipo: requisito.tipo, descripcion: r.descripcion_evidencia || "" },
        actividad_reportada: r.actividad_reportada || "Entregable",
        descripcion_reporte: r.descripcion_reporte || "",
        porcentaje_avance: Number(r.porcentaje_avance ?? 100),
        horas: Number(r.horas || 0),
        semana_numero: Number(r.semana_numero || 0),
        semestre: r.semestre || null,
        proyecto_id: r.proyecto_id,
        proyecto_titulo: r.proyecto_titulo || "Iniciativa",
        proyecto_tipo: r.proyecto_tipo || null,
        programa_nombre: r.programa_nombre || "Sin programa",
        escuela_nombre: r.escuela_nombre || "Sin escuela",
        docente_id: r.docente_id,
        docente_nombre: [r.nombre, r.apellido].filter(Boolean).join(" "),
        docente_correo: r.correo || "",
      };
    });

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
  }
});

// Historial completo de un entregable (versiones de evidencias y eventos con responsable).
router.get("/reportes-revision/:id/historial", async (req, res) => {
  const entregableId = Number(req.params.id);
  if (!Number.isInteger(entregableId) || entregableId <= 0) return res.status(400).json({ error: "id inválido" });
  try {
    res.json(await historialDeEntregable(pool, entregableId));
  } catch (error) {
    responderError(res, error, "Error en GET /admin/reportes-revision/:id/historial");
  }
});

// Cambiar estado de revisión admin para un entregable reportado.
// Solo aprobar u observar un entregable enviado; un aprobado no cambia por esta vía (ver /reabrir).
router.put("/reportes-revision/:id", async (req, res) => {
  const entregableId = Number(req.params.id);
  const { estado_revision, comentario_revision, motivo, evidencias_afectadas } = req.body || {};
  if (motivo != null && motivo !== "sin_acceso") return res.status(400).json({ error: "motivo inválido" });
  if (!entregableId) {
    return res.status(400).json({ error: "id inválido" });
  }
  if (!["aprobado", "observado"].includes(estado_revision)) {
    return res.status(400).json({
      error: "estado_revision debe ser aprobado u observado",
    });
  }
  try {
    const out = await aplicarRevisionAdmin(pool, {
      entregableId,
      estadoNuevo: estado_revision,
      comentario: comentario_revision,
      actorId: Number(req.user?.id) || null,
      motivo: motivo ?? null,
      evidenciasAfectadas: evidencias_afectadas,
    });
    res.json(out);
  } catch (error) {
    responderError(res, error, "Error en PUT /admin/reportes-revision/:id");
  }
});

// Procedimiento administrativo controlado para devolver un entregable aprobado a revisión.
router.post("/reportes-revision/:id/reabrir", async (req, res) => {
  const entregableId = Number(req.params.id);
  const { motivo, destino } = req.body || {};
  if (!entregableId) return res.status(400).json({ error: "id inválido" });
  try {
    const out = await reabrirEntregable(pool, {
      entregableId,
      actorId: Number(req.user?.id),
      motivo: String(motivo ?? ""),
      destino: destino === "observado" ? "observado" : "enviado",
    });
    res.json(out);
  } catch (error) {
    responderError(res, error, "Error en POST /admin/reportes-revision/:id/reabrir");
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
        u.tipo_docente,
        u.regional,
        u.link_drive,
        u.grupo_matriz_id,
        p.nombre   AS programa_nombre,
        p.codigo   AS programa_codigo,
        COALESCE(e.nombre, 'Sin escuela') AS escuela_nombre,
        gm.nombre AS grupo_matriz_nombre,
        COALESCE(
          ROUND(
            (
              100.0 * (
                SELECT COUNT(*)::float
                FROM proyecto_entregables pe2
                -- Mismo criterio que matrizService: reportado = enviado (con completado) o aprobado,
                -- contado una vez por entregable de la matriz del docente.
                WHERE pe2.docente_id = u.id
                  AND pe2.plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = u.grupo_matriz_id)
                  AND (
                    pe2.estado_revision = 'aprobado'
                    OR (COALESCE(pe2.completado, false) AND pe2.estado_revision = 'enviado')
                  )
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
      LEFT JOIN escuelas e ON e.id = p.escuela_id
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
      SELECT
        s.codigo,
        s.fecha_inicio,
        s.fecha_fin,
        s.numero_semanas,
        s.activo,
        COUNT(DISTINCT gm.id)::int AS num_grupos,
        COUNT(DISTINCT tpl.id)::int AS num_plantillas,
        COUNT(DISTINCT u.id)::int AS num_docentes,
        COUNT(DISTINCT pe.id)::int AS num_reportes
      FROM semestres s
      LEFT JOIN grupos_matriz gm ON gm.semestre = s.codigo
      LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = gm.id
      LEFT JOIN usuarios u ON u.grupo_matriz_id = gm.id AND u.rol = 'docente'
      LEFT JOIN proyecto_entregables pe ON pe.plantilla_id = tpl.id
      GROUP BY s.codigo, s.fecha_inicio, s.fecha_fin, s.numero_semanas, s.activo
      ORDER BY s.fecha_inicio DESC
      `
    );
    const detalle = result.rows || [];
    const semestres = detalle.map((r) => r.codigo).filter(Boolean);
    const activo = detalle.find((r) => r.activo) || null;
    res.json({ semestres, detalle, activo });
  } catch (error) {
    console.error("Error en GET /admin/semestres", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de grupos/plantillas de matriz (para asignación admin)
router.post("/semestres", async (req, res) => {
  const validated = validateSemesterFields(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { codigo, fechaInicio, fechaFin, numeroSemanas } = validated;
  const active = req.body?.activo === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (active) await client.query("UPDATE semestres SET activo = FALSE WHERE activo = TRUE");
    const result = await client.query(
      `
      INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING codigo, fecha_inicio, fecha_fin, numero_semanas, activo
      `,
      [codigo, fechaInicio, fechaFin, numeroSemanas, active]
    );
    await client.query("COMMIT");
    res.status(201).json({ semestre: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      return res.status(409).json({ error: `El semestre ${codigo} ya existe` });
    }
    console.error("Error en POST /admin/semestres", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

router.put("/semestres/:codigo/activar", async (req, res) => {
  const codigo = String(req.params.codigo || "").trim().toUpperCase();
  if (!isValidSemestreValue(codigo)) {
    return res.status(400).json({ error: "Semestre inválido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT 1 FROM semestres WHERE codigo = $1 FOR UPDATE", [codigo]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Semestre no encontrado" });
    }
    await client.query("UPDATE semestres SET activo = FALSE WHERE activo = TRUE");
    const result = await client.query(
      `
      UPDATE semestres
      SET activo = TRUE
      WHERE codigo = $1
      RETURNING codigo, fecha_inicio, fecha_fin, numero_semanas, activo
      `,
      [codigo]
    );
    await client.query("COMMIT");
    res.json({ semestre: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en PUT /admin/semestres/:codigo/activar", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

router.put("/semestres/:codigo", async (req, res) => {
  const codigoActual = String(req.params.codigo || "").trim().toUpperCase();
  if (!isValidSemestreValue(codigoActual)) {
    return res.status(400).json({ error: "Semestre inválido" });
  }

  const validated = validateSemesterFields({
    codigo: req.body?.codigo ?? codigoActual,
    fecha_inicio: req.body?.fecha_inicio,
    fecha_fin: req.body?.fecha_fin,
    numero_semanas: req.body?.numero_semanas,
  });
  if (validated.error) return res.status(400).json({ error: validated.error });

  const {
    codigo: codigoNuevo,
    fechaInicio,
    fechaFin,
    numeroSemanas,
  } = validated;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT codigo, fecha_inicio, fecha_fin, numero_semanas FROM semestres WHERE codigo = $1 FOR UPDATE",
      [codigoActual]
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Semestre no encontrado" });
    }

    // Código, fechas y número de semanas definen el calendario con el que se interpretan los reportes (semana académica,
    // vencimientos, cumplimiento). Con historia no pueden cambiar; reenviar los mismos valores es una operación nula.
    // Estos cuatro son los únicos campos editables del semestre (el estado «activo» tiene su propio endpoint).
    const actual = current.rows[0];
    const cambios = [];
    if (codigoNuevo !== actual.codigo) cambios.push("el código");
    if (fechaInicio !== toDateOnlyISO(actual.fecha_inicio)) cambios.push("la fecha de inicio");
    if (fechaFin !== toDateOnlyISO(actual.fecha_fin)) cambios.push("la fecha de fin");
    if (numeroSemanas !== Number(actual.numero_semanas)) cambios.push("el número de semanas");
    if (cambios.length > 0) {
      const gruposSem = (
        await client.query(`SELECT id FROM grupos_matriz WHERE semestre = $1 ORDER BY id FOR UPDATE`, [codigoActual])
      ).rows.map((r) => Number(r.id));
      if (gruposSem.length > 0) {
        const plantillaIds = await bloquearPlantillasDeGrupos(client, gruposSem);
        const h = await historicoDeCalendarioSemestre(client, codigoActual, gruposSem, plantillaIds);
        if (h.total > 0) {
          throw errorHistorico(
            `No se puede cambiar ${cambios.join(", ")} del semestre ${codigoActual}: ${describirResumen(h)} se interpretan con ese calendario.`,
            h,
            "Un semestre con reportes conserva su calendario. Para el siguiente periodo, crea o clona un semestre nuevo."
          );
        }
      }
    }

    const maxWeek = await client.query(
      `
      SELECT COALESCE(MAX(tpl.semana_numero), 0)::int AS maxima
      FROM grupos_matriz gm
      LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = gm.id
      WHERE gm.semestre = $1
      `,
      [codigoActual]
    );
    if (Number(maxWeek.rows[0]?.maxima || 0) > numeroSemanas) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `No se puede reducir a ${numeroSemanas} semanas: existen plantillas hasta la semana ${maxWeek.rows[0].maxima}.`,
      });
    }

    const updated = await client.query(
      `
      UPDATE semestres
      SET codigo = $1,
          fecha_inicio = $2,
          fecha_fin = $3,
          numero_semanas = $4
      WHERE codigo = $5
      RETURNING codigo, fecha_inicio, fecha_fin, numero_semanas, activo
      `,
      [codigoNuevo, fechaInicio, fechaFin, numeroSemanas, codigoActual]
    );
    await client.query("COMMIT");
    res.json({ semestre: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en PUT /admin/semestres/:codigo");
    if (error?.code === "23505") {
      return res.status(409).json({ error: `El semestre ${codigoNuevo} ya existe` });
    }
    console.error("Error en PUT /admin/semestres/:codigo", error);
    res.status(500).json({ error: "Error interno al actualizar el semestre" });
  } finally {
    client.release();
  }
});

router.delete("/semestres/:codigo", async (req, res) => {
  const codigo = String(req.params.codigo || "").trim().toUpperCase();
  const forzar = String(req.query.forzar || "") === "true";
  if (!isValidSemestreValue(codigo)) {
    return res.status(400).json({ error: "Semestre inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const semester = await client.query(
      "SELECT codigo, activo FROM semestres WHERE codigo = $1 FOR UPDATE",
      [codigo]
    );
    if (semester.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Semestre no encontrado" });
    }
    if (semester.rows[0].activo) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "No se puede eliminar el semestre activo. Activa otro semestre primero.",
      });
    }

    // Historia y docentes asignados: protegidos siempre, con o sin `forzar`. Se bloquean grupos y plantillas antes de contar.
    const gruposSem = (
      await client.query(`SELECT id FROM grupos_matriz WHERE semestre = $1 ORDER BY id FOR UPDATE`, [codigo])
    ).rows.map((r) => Number(r.id));
    if (gruposSem.length > 0) {
      const plantillaIds = await bloquearPlantillasDeGrupos(client, gruposSem);
      const nDoc = await docentesDeGrupos(client, gruposSem);
      const h = await historicoDeSemestre(client, codigo, gruposSem, plantillaIds);
      if (nDoc > 0 || h.total > 0) {
        const detalle = { ...h, docentes: nDoc };
        throw errorHistorico(
          `No se puede eliminar el semestre ${codigo}: ${describirResumen(detalle)} dependen de él.`,
          detalle,
          "Un semestre con historia no se elimina: déjalo cerrado (activa otro semestre) o inactiva sus grupos."
        );
      }
    }

    const related = await client.query(
      `
      SELECT
        COUNT(DISTINCT gm.id)::int AS grupos,
        COUNT(DISTINCT tpl.id)::int AS plantillas,
        COUNT(DISTINCT u.id)::int AS docentes,
        COUNT(DISTINCT pe.id)::int AS reportes
      FROM semestres s
      LEFT JOIN grupos_matriz gm ON gm.semestre = s.codigo
      LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = gm.id
      LEFT JOIN usuarios u ON u.grupo_matriz_id = gm.id AND u.rol = 'docente'
      LEFT JOIN proyecto_entregables pe ON pe.plantilla_id = tpl.id
      WHERE s.codigo = $1
      `,
      [codigo]
    );
    const counts = related.rows[0];
    const hasRelated =
      counts.grupos > 0 ||
      counts.plantillas > 0 ||
      counts.docentes > 0 ||
      counts.reportes > 0;
    if (hasRelated && !forzar) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "El semestre tiene información relacionada. Confirma la eliminación completa.",
        requiere_confirmacion: true,
        resumen: counts,
      });
    }

    if (forzar) {
      // Sin historia ni docentes (comprobado arriba): solo se eliminan grupos y plantillas sin reportes.
      await client.query("DELETE FROM grupos_matriz WHERE semestre = $1", [codigo]);
    }
    await client.query("DELETE FROM semestres WHERE codigo = $1", [codigo]);
    await client.query("COMMIT");
    res.json({ ok: true, eliminado: codigo, resumen: counts });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en DELETE /admin/semestres/:codigo");
    console.error("Error en DELETE /admin/semestres/:codigo", error);
    res.status(500).json({ error: "Error interno al eliminar el semestre" });
  } finally {
    client.release();
  }
});

// Copia de plantillas a otro semestre: conserva TODAS las columnas de configuración (enlace, tipo de
// evidencia) y recalcula el mes (y la palabra de mes inicial de fase/categoría) con el calendario del
// semestre destino, porque las fechas son offsets relativos al inicio del semestre.
const MES_DESTINO_SQL = (inicio) => `(ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[EXTRACT(MONTH FROM (${inicio} + dias_fin_desde_feb))::int]`;
const CLONAR_PLANTILLAS_SQL = (inicio) => `
  INSERT INTO plantilla_entregables (
    grupo_id, numero, categoria, fase, mes,
    semana_numero, entregable, descripcion_evidencia, horas,
    dias_inicio_desde_feb, dias_fin_desde_feb,
    enlace_referencia, tipo_evidencia, requiere_evidencia
  )
  SELECT
    $1, numero,
    CASE WHEN dias_fin_desde_feb IS NOT NULL AND LOWER(SPLIT_PART(categoria, ' ', 1)) = LOWER(COALESCE(mes, ''))
         THEN INITCAP(${MES_DESTINO_SQL(inicio)}) || SUBSTR(categoria, LENGTH(SPLIT_PART(categoria, ' ', 1)) + 1) ELSE categoria END,
    CASE WHEN dias_fin_desde_feb IS NOT NULL AND LOWER(SPLIT_PART(fase, ' ', 1)) = LOWER(COALESCE(mes, ''))
         THEN INITCAP(${MES_DESTINO_SQL(inicio)}) || SUBSTR(fase, LENGTH(SPLIT_PART(fase, ' ', 1)) + 1) ELSE fase END,
    CASE WHEN dias_fin_desde_feb IS NOT NULL THEN ${MES_DESTINO_SQL(inicio)} ELSE mes END,
    semana_numero, entregable, descripcion_evidencia, horas,
    dias_inicio_desde_feb, dias_fin_desde_feb,
    enlace_referencia, tipo_evidencia, requiere_evidencia
  FROM plantilla_entregables
  WHERE grupo_id = $2
`;

router.post("/semestres/clonar", async (req, res) => {
  const origen = String(req.body?.semestre_origen || "").trim().toUpperCase();
  const validated = validateSemesterFields({
    codigo: req.body?.semestre_destino,
    fecha_inicio: req.body?.fecha_inicio,
    fecha_fin: req.body?.fecha_fin,
    numero_semanas: req.body?.numero_semanas,
  });
  if (!isValidSemestreValue(origen)) {
    return res.status(400).json({ error: "semestre_origen es inválido" });
  }
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { codigo: destino, fechaInicio, fechaFin, numeroSemanas } = validated;
  if (origen === destino) {
    return res.status(400).json({ error: "El semestre destino debe ser distinto al origen" });
  }
  const copiarPlantillas = req.body?.clonar_plantillas !== false;
  const activar = req.body?.activar === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sourceSemester = await client.query(
      "SELECT 1 FROM semestres WHERE codigo = $1 FOR SHARE",
      [origen]
    );
    if (sourceSemester.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "El semestre origen no existe" });
    }
    const sourceGroups = await client.query(
      "SELECT * FROM grupos_matriz WHERE semestre = $1 ORDER BY id FOR SHARE",
      [origen]
    );
    if (sourceGroups.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El semestre origen no tiene grupos para clonar" });
    }
    if (activar) await client.query("UPDATE semestres SET activo = FALSE WHERE activo = TRUE");
    await client.query(
      `
      INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [destino, fechaInicio, fechaFin, numeroSemanas, activar]
    );

    let templatesCloned = 0;
    for (const group of sourceGroups.rows) {
      const inserted = await client.query(
        `
        INSERT INTO grupos_matriz (
          nombre, descripcion, tipo_docente, horas_totales,
          num_proyectos, num_actividades, num_convenios_nuevos,
          num_convenios_dinamizados, semestre, activo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        `,
        [
          group.nombre,
          group.descripcion,
          group.tipo_docente,
          group.horas_totales,
          group.num_proyectos,
          group.num_actividades,
          group.num_convenios_nuevos,
          group.num_convenios_dinamizados,
          destino,
          group.activo,
        ]
      );
      if (copiarPlantillas) {
        const templates = await client.query(CLONAR_PLANTILLAS_SQL("$3::date"), [
          inserted.rows[0].id,
          group.id,
          fechaInicio,
        ]);
        templatesCloned += templates.rowCount || 0;
      }
    }

    await client.query("COMMIT");
    res.status(201).json({
      semestre: {
        codigo: destino,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        numero_semanas: numeroSemanas,
        activo: activar,
      },
      grupos_clonados: sourceGroups.rowCount,
      plantillas_clonadas: templatesCloned,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      return res.status(409).json({ error: `El semestre ${destino} ya existe` });
    }
    console.error("Error en POST /admin/semestres/clonar", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

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
    const semester = await client.query("SELECT 1 FROM semestres WHERE codigo = $1", [dest]);
    if (semester.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El semestre destino no tiene calendario configurado" });
    }
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
        CLONAR_PLANTILLAS_SQL("(SELECT fecha_inicio FROM semestres WHERE codigo = $3)"),
        [nuevo.id, grupoId, dest]
      );
      plantillas_clonadas = insP.rowCount || 0;
    }
    await client.query("COMMIT");
    res.status(201).json({ grupo: nuevo, plantillas_clonadas });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ese grupo ya existe en el semestre destino" });
    }
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
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, true
      WHERE EXISTS (SELECT 1 FROM semestres WHERE codigo = $9::varchar)
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
    if (r.rowCount === 0) {
      return res.status(409).json({ error: "El semestre no tiene calendario configurado" });
    }
    res.status(201).json({ grupo: r.rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un grupo con ese nombre en el semestre" });
    }
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
    let cambiaSemestre = false;

    if (b.semestre !== undefined && b.semestre !== null) {
      const nuevoS = String(b.semestre).trim();
      if (!isValidSemestreValue(nuevoS)) {
        return res.status(400).json({ error: "semestre inválido (formato YYYYA o YYYYB)" });
      }
      const semesterExists = await pool.query(
        "SELECT 1 FROM semestres WHERE codigo = $1",
        [nuevoS]
      );
      if (semesterExists.rowCount === 0) {
        return res.status(409).json({ error: "El semestre no tiene calendario configurado" });
      }
      if (nuevoS !== semestreActual) {
        cambiaSemestre = true;
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
    // Cambiar el semestre de un grupo con historia recalcularía retroactivamente sus fechas: bloqueo + comprobación + escritura atómicos.
    const tx = await pool.connect();
    let upd;
    try {
      await tx.query("BEGIN");
      await tx.query(`SELECT id FROM grupos_matriz WHERE id = $1 FOR UPDATE`, [id]);
      if (cambiaSemestre) {
        if ((await docentesDeGrupos(tx, [id])) > 0) {
          throw new ErrorNegocio(
            400,
            "GRUPO_CON_DOCENTES",
            "No se puede cambiar el semestre: hay docentes asignados a este grupo. Desasigna los docentes primero."
          );
        }
        const plantillaIds = await bloquearPlantillasDeGrupos(tx, [id]);
        const h = await historicoDeGrupos(tx, [id], plantillaIds);
        if (h.total > 0) {
          throw errorHistorico(
            `No se puede cambiar el semestre del grupo: ${describirResumen(h)} dependen de él.`,
            h,
            "Crea un grupo nuevo en el semestre deseado (clonación) y conserva este con su historia."
          );
        }
      }
      upd = await tx.query(
        `
        UPDATE grupos_matriz
        SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING *
        `,
        vals
      );
      await tx.query("COMMIT");
    } catch (inner) {
      await tx.query("ROLLBACK").catch(() => {});
      throw inner;
    } finally {
      tx.release();
    }
    res.json({ grupo: upd.rows[0] });
  } catch (error) {
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en PUT /admin/grupos-matriz/:id");
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un grupo con ese nombre en el semestre" });
    }
    console.error("Error en PUT /admin/grupos-matriz/:id", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Un grupo con historia (reportes, evidencias, eventos o importaciones) o con docentes asignados no se elimina.
// `forzar` solo confirma la eliminación de plantillas SIN reportes; nunca permite saltarse la historia.
router.delete("/grupos-matriz/:id", async (req, res) => {
  const id = Number(req.params.id);
  const forzar = String(req.query.forzar || "") === "true";
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ex = await client.query(`SELECT id FROM grupos_matriz WHERE id = $1 FOR UPDATE`, [id]);
    if (ex.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const nDoc = await docentesDeGrupos(client, [id]);
    if (nDoc > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Desasigna los docentes antes de eliminar este grupo (${nDoc} docente(s) asignado(s)).`,
      });
    }

    const plantillaIds = await bloquearPlantillasDeGrupos(client, [id]);
    const h = await historicoDeGrupos(client, [id], plantillaIds);
    if (h.total > 0) {
      throw errorHistorico(
        `No se puede eliminar el grupo: ${describirResumen(h)} dependen de él.`,
        h,
        "Inactiva el grupo (activo = false) en lugar de eliminarlo: conserva toda su historia."
      );
    }
    const nTpl = plantillaIds.length;
    if (nTpl > 0 && !forzar) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "Este grupo tiene plantillas de entregables. Confirma si deseas eliminarlas junto con el grupo.",
        tiene_plantillas: true,
        num_plantillas: nTpl,
      });
    }

    if (nTpl > 0) {
      await client.query(`DELETE FROM plantilla_entregables WHERE grupo_id = $1`, [id]);
    }
    await client.query(`DELETE FROM grupos_matriz WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en DELETE /admin/grupos-matriz/:id");
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT u.id, g.tipo_docente AS tipo_grupo
       FROM usuarios u
       LEFT JOIN grupos_matriz g ON g.id = u.grupo_matriz_id
       WHERE u.id = $1 AND u.rol = 'docente'
       FOR UPDATE OF u`,
      [docenteId]
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Docente no encontrado" });
    }
    // Misma regla que «Editar usuario»: el tipo del docente debe coincidir con el de su grupo.
    const tipoGrupo = cur.rows[0].tipo_grupo;
    if (tipoGrupo && tipoGrupo !== tipo_docente) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "El tipo del docente no coincide con el grupo matriz asignado. Cambia el tipo y el grupo a la vez desde «Editar usuario».",
        codigo: "TIPO_GRUPO_INCOMPATIBLE",
      });
    }
    await client.query(`UPDATE usuarios SET tipo_docente = $1 WHERE id = $2`, [tipo_docente, docenteId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en PUT /admin/docentes/:id/tipo-docente");
  } finally {
    client.release();
  }
});

router.put("/docentes/:id/info-contacto", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { regional, link_drive } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  const normalizedLink = normalizeOptionalHttpsUrl(link_drive);
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "link_drive") && normalizedLink.error) {
    return res.status(400).json({ error: normalizedLink.error });
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
    vals.push(normalizedLink.value);
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Debes enviar regional y/o link_drive" });
  }
  vals.push(docenteId);

  try {
    const result = await pool.query(
      `
      UPDATE usuarios
      SET ${sets.join(", ")}
      WHERE id = $${i} AND rol = 'docente'
      RETURNING id
      `,
      vals
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }
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
  const groupId = grupo_matriz_id == null || grupo_matriz_id === ""
    ? null
    : Number(grupo_matriz_id);
  if (groupId !== null && (!Number.isInteger(groupId) || groupId <= 0)) {
    return res.status(400).json({ error: "grupo_matriz_id es inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT id, COALESCE(tipo_docente, 'ANTIGUO') AS tipo, grupo_matriz_id
       FROM usuarios WHERE id = $1 AND rol = 'docente' FOR UPDATE`,
      [docenteId]
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Docente no encontrado" });
    }
    // Mismas reglas que «Editar usuario»: grupo activo y del mismo tipo que el docente.
    if (groupId !== null) {
      const group = await client.query("SELECT tipo_docente FROM grupos_matriz WHERE id = $1 AND activo = true", [groupId]);
      if (group.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Grupo matriz no encontrado o inactivo" });
      }
      if (group.rows[0].tipo_docente !== cur.rows[0].tipo) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "El tipo del docente no coincide con el grupo matriz seleccionado" });
      }
    }
    // Cambiar o quitar el grupo de un docente con reportes dejaría su historia fuera de la matriz: se bloquea.
    if (Number(groupId ?? 0) !== Number(cur.rows[0].grupo_matriz_id ?? 0)) {
      await exigirAsignacionSinHistorico(client, docenteId, groupId);
    }
    await client.query(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2`, [groupId, docenteId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en PUT /admin/docentes/:id/grupo-matriz");
  } finally {
    client.release();
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
        u.regional,
        u.link_drive,
        u.grupo_matriz_id,
        p.nombre   AS programa_nombre,
        COALESCE(e.nombre, 'Sin escuela') AS escuela_nombre,
        gm.nombre AS grupo_matriz_nombre
      FROM usuarios u
      LEFT JOIN programas p ON p.id = u.programa_id
      LEFT JOIN escuelas e ON e.id = p.escuela_id
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
      estado: row.estado,
      tipo_docente: row.tipo_docente || null,
      regional: row.regional || null,
      link_drive: row.link_drive || null,
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
  const {
    nombre,
    apellido,
    correo,
    rol,
    programa_id,
    estado,
    tipo_docente,
    regional,
    link_drive,
    grupo_matriz_id,
  } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: "id de usuario inválido" });
  }
  if (!nombre || !String(nombre).trim() || !apellido || !String(apellido).trim()) {
    return res.status(400).json({ error: "nombre y apellido son obligatorios" });
  }
  if (!correo || !String(correo).trim()) {
    return res.status(400).json({ error: "correo es obligatorio" });
  }
  const normalizedEmail = String(correo).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: "correo no es válido" });
  }
  const rolDb = rol === "admin" ? "admin" : rol === "docente" ? "docente" : null;
  if (!rolDb) {
    return res.status(400).json({ error: "rol debe ser admin o docente" });
  }

  const progId =
    programa_id === undefined
      ? undefined
      : programa_id === null || programa_id === ""
      ? null
      : Number(programa_id);
  if (progId !== undefined && progId !== null && (!Number.isInteger(progId) || progId <= 0)) {
    return res.status(400).json({ error: "programa_id es inválido" });
  }

  const groupId =
    grupo_matriz_id === undefined || grupo_matriz_id === null || grupo_matriz_id === ""
      ? null
      : Number(grupo_matriz_id);
  if (groupId !== null && (!Number.isInteger(groupId) || groupId <= 0)) {
    return res.status(400).json({ error: "grupo_matriz_id es inválido" });
  }
  const normalizedLink = link_drive === undefined
    ? null
    : normalizeOptionalHttpsUrl(link_drive);
  if (normalizedLink?.error) {
    return res.status(400).json({ error: normalizedLink.error });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializa con otros cambios de administradores (evita dejar el sistema sin administradores activos).
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ADMINISTRADORES]);
    const currentResult = await client.query(
      `
      SELECT id, correo, rol, estado, programa_id, tipo_docente, regional, link_drive, grupo_matriz_id
      FROM usuarios
      WHERE id = $1 AND rol IN ('docente', 'admin')
      FOR UPDATE
      `,
      [userId]
    );
    if (currentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const current = currentResult.rows[0];
    const finalProgramId = progId === undefined ? current.programa_id : progId;
    const finalGroupId = grupo_matriz_id === undefined ? current.grupo_matriz_id : groupId;
    const stateDb = estado === undefined ? current.estado : String(estado).trim().toLowerCase();
    if (!["activo", "inactivo"].includes(stateDb)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "estado debe ser activo o inactivo" });
    }
    if (userId === Number(req.user.id) && (rolDb !== "admin" || stateDb !== "activo")) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "No puedes retirar tu propio rol ni desactivar tu cuenta administrativa",
      });
    }

    const removesActiveAdmin =
      current.rol === "admin" &&
      current.estado === "activo" &&
      (rolDb !== "admin" || stateDb !== "activo");
    if (removesActiveAdmin) {
      const otherAdmins = await client.query(
        `
        SELECT COUNT(*)::int AS total
        FROM usuarios
        WHERE rol = 'admin' AND estado = 'activo' AND id <> $1
        `,
        [userId]
      );
      if (Number(otherAdmins.rows[0]?.total || 0) === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Debe permanecer al menos un administrador activo" });
      }
    }

    const teacherType = tipo_docente === undefined
      ? current.tipo_docente || "ANTIGUO"
      : String(tipo_docente).trim().toUpperCase();
    if (rolDb === "docente" && !["ANTIGUO", "NUEVO"].includes(teacherType)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
    }

    if (finalProgramId !== null) {
      const program = await client.query("SELECT 1 FROM programas WHERE id = $1", [finalProgramId]);
      if (program.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Programa no encontrado" });
      }
    }
    if (rolDb === "docente" && finalGroupId !== null) {
      const group = await client.query(
        "SELECT tipo_docente FROM grupos_matriz WHERE id = $1 AND activo = true",
        [finalGroupId]
      );
      if (group.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Grupo matriz no encontrado o inactivo" });
      }
      if (group.rows[0].tipo_docente !== teacherType) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "El tipo del docente no coincide con el grupo matriz seleccionado",
        });
      }
    }
    // Cambiar o quitar el grupo de un docente con reportes dejaría su historia fuera de la matriz: se bloquea.
    const grupoFinal = rolDb === "docente" ? finalGroupId : null;
    if (current.rol === "docente" && Number(grupoFinal ?? 0) !== Number(current.grupo_matriz_id ?? 0)) {
      await exigirAsignacionSinHistorico(client, userId, grupoFinal);
    }
    const regionalValue = regional === undefined
      ? current.regional
      : String(regional || "").trim() || null;
    const linkValue = link_drive === undefined ? current.link_drive : normalizedLink.value;

    const r = await client.query(
      `
      UPDATE usuarios
      SET
        nombre = $1,
        apellido = $2,
        correo = LOWER(TRIM($3)),
        rol = $4,
        programa_id = $5,
        estado = $6,
        tipo_docente = $7,
        regional = $8,
        link_drive = $9,
        grupo_matriz_id = $10,
        google_sub = CASE WHEN correo <> LOWER(TRIM($3)) THEN NULL ELSE google_sub END,
        foto_url = CASE WHEN correo <> LOWER(TRIM($3)) THEN NULL ELSE foto_url END,
        ultimo_acceso = CASE WHEN correo <> LOWER(TRIM($3)) THEN NULL ELSE ultimo_acceso END
      WHERE id = $11
        AND rol IN ('docente', 'admin')
      RETURNING id, nombre, apellido, correo, rol, programa_id, estado,
                tipo_docente, regional, link_drive, grupo_matriz_id
      `,
      [
        String(nombre).trim(),
        String(apellido).trim(),
        normalizedEmail,
        rolDb,
        finalProgramId,
        stateDb,
        rolDb === "docente" ? teacherType : null,
        rolDb === "docente" ? regionalValue : null,
        rolDb === "docente" ? linkValue : null,
        rolDb === "docente" ? finalGroupId : null,
        userId,
      ]
    );
    const u = r.rows[0];
    let programaNombre = null;
    let escuelaNombre = null;
    if (u.programa_id) {
      const p = await client.query(
        `
        SELECT p.nombre, e.id AS escuela_id, COALESCE(e.nombre, 'Sin escuela') AS escuela_nombre
        FROM programas p
        LEFT JOIN escuelas e ON e.id = p.escuela_id
        WHERE p.id = $1
        `,
        [u.programa_id]
      );
      if (p.rowCount > 0) {
        programaNombre = p.rows[0].nombre;
        escuelaNombre = p.rows[0].escuela_nombre || "Sin escuela";
      }
    }
    let grupoNombre = null;
    if (u.grupo_matriz_id) {
      const g = await client.query("SELECT nombre FROM grupos_matriz WHERE id = $1", [
        u.grupo_matriz_id,
      ]);
      if (g.rowCount > 0) grupoNombre = g.rows[0].nombre;
    }
    await client.query("COMMIT");
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
      estado: u.estado,
      tipo_docente: u.tipo_docente || null,
      regional: u.regional || null,
      link_drive: u.link_drive || null,
      grupo_matriz_id: u.grupo_matriz_id || null,
      grupo_matriz_nombre: grupoNombre || null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en PUT /admin/usuarios/:id");
    console.error("Error en PUT /admin/usuarios/:id", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Un usuario con historia (reportes, evidencias, eventos o importaciones) no se elimina: se inactiva.
router.delete("/usuarios/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "id de usuario inválido" });
  }
  if (userId === Number(req.user.id)) {
    return res.status(409).json({ error: "No puedes eliminar tu propia cuenta activa" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializa con cualquier otro cambio que pueda dejar al sistema sin administradores activos.
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ADMINISTRADORES]);
    const u = await client.query(
      `SELECT id, rol, estado, nombre, apellido FROM usuarios WHERE id = $1 AND rol IN ('docente', 'admin') FOR UPDATE`,
      [userId]
    );
    if (u.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    if (u.rows[0].rol === "admin" && u.rows[0].estado === "activo") {
      const otros = await client.query(
        "SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'admin' AND estado = 'activo' AND id <> $1",
        [userId]
      );
      if (Number(otros.rows[0]?.total || 0) === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Debe permanecer al menos un administrador activo" });
      }
    }

    const h = await historicoDeUsuario(client, userId);
    if (h.total > 0) {
      const nombre = `${u.rows[0].nombre} ${u.rows[0].apellido}`.trim();
      throw errorHistorico(
        `No se puede eliminar a ${nombre}: tiene ${describirResumen(h)}.`,
        h,
        "Inactívalo (Editar usuario → Estado: Inactivo): conserva todo su historial y le retira el acceso."
      );
    }

    const asResp = await client.query(
      `SELECT COUNT(*)::int AS n FROM proyectos WHERE docente_responsable_id = $1`,
      [userId]
    );
    const n = asResp.rows[0]?.n ?? 0;
    if (n > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `No se puede eliminar: el usuario es responsable de ${n} iniciativa(s). Reasigne el docente responsable antes de eliminar.`,
      });
    }

    await client.query(`DELETE FROM usuarios WHERE id = $1`, [userId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error?.code === "23503") {
      return res.status(409).json({
        error: "No se puede eliminar: el usuario tiene registros relacionados. Inactívalo en su lugar.",
        codigo: "HISTORICO_PROTEGIDO",
      });
    }
    responderError(res, error, "Error en DELETE /admin/usuarios/:id");
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
  const normalizedEmail = String(correo).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: "correo no es válido" });
  }
  if (!["admin", "docente"].includes(rol)) {
    return res.status(400).json({ error: "rol debe ser admin o docente" });
  }
  const normalizedLink = normalizeOptionalHttpsUrl(link_drive);
  if (normalizedLink.error) {
    return res.status(400).json({ error: normalizedLink.error });
  }
  const teacherType = tipo_docente || "ANTIGUO";
  if (rol === "docente" && !["ANTIGUO", "NUEVO"].includes(teacherType)) {
    return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
  }
  const groupId = grupo_matriz_id == null || grupo_matriz_id === ""
    ? null
    : Number(grupo_matriz_id);
  if (groupId !== null && (!Number.isInteger(groupId) || groupId <= 0)) {
    return res.status(400).json({ error: "grupo_matriz_id es inválido" });
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
      } else {
        return res.status(400).json({ error: "El programa seleccionado no existe" });
      }
    }
    if (rol === "docente" && groupId !== null) {
      const group = await pool.query(
        "SELECT tipo_docente FROM grupos_matriz WHERE id = $1 AND activo = true",
        [groupId]
      );
      if (group.rowCount === 0) {
        return res.status(400).json({
          error: "El grupo matriz seleccionado no existe o está inactivo",
        });
      }
      if (group.rows[0].tipo_docente !== teacherType) {
        return res.status(409).json({
          error: "El tipo del docente no coincide con el grupo matriz seleccionado",
        });
      }
    }

    const result = await pool.query(
      `
      INSERT INTO usuarios (
        nombre,
        apellido,
        correo,
        rol,
        programa_id,
        estado,
        tipo_docente,
        regional,
        link_drive,
        grupo_matriz_id
      )
      VALUES ($1, $2, LOWER(TRIM($3)), $4, $5, 'activo', $6, $7, $8, $9)
      RETURNING id, nombre, apellido, correo, rol, estado, programa_id,
                tipo_docente, regional, link_drive, grupo_matriz_id
      `,
      [
        String(nombres).trim(),
        String(apellidos).trim(),
        normalizedEmail,
        rol,
        programaId,
        rol === "docente" ? teacherType : null,
        regional || null,
        normalizedLink.value,
        rol === "docente" ? groupId : null,
      ]
    );

    const created = result.rows[0];

    let programaNombreCreado = null;
    let escuelaNombreCreada = null;
    if (created.programa_id) {
      const programa = await pool.query(
        `
        SELECT p.nombre, e.id AS escuela_id, COALESCE(e.nombre, 'Sin escuela') AS escuela_nombre
        FROM programas p
        LEFT JOIN escuelas e ON e.id = p.escuela_id
        WHERE p.id = $1
        `,
        [created.programa_id]
      );
      if (programa.rowCount > 0) {
        programaNombreCreado = programa.rows[0].nombre;
        escuelaNombreCreada = programa.rows[0].escuela_nombre || "Sin escuela";
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
      acceso: "El usuario debe ingresar con esta cuenta de Google",
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }
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
        p.programa_id,
        u.id AS coordinador_id,
        u.nombre || ' ' || u.apellido AS coordinador,
        prog.nombre AS programa,
        prog.escuela_id,
        esc.nombre AS escuela
      FROM proyectos p
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN escuelas esc ON esc.id = prog.escuela_id
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
      programId: row.programa_id,
      schoolId: row.escuela_id,
      school: row.escuela || "Sin escuela",
      coordinatorId: row.coordinador_id,
      coordinator: row.coordinador || "Sin asignar",
      program: row.programa || "Sin programa",
      state: row.estado,
      type:
        row.tipo === "convenio"
          ? "agreement"
          : row.tipo === "proyecto"
          ? "project"
          : "activity",
      status:
        row.estado === "en_ejecucion"
          ? "active"
          : row.estado === "finalizado"
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

  const uniqueTeachers = new Map();
  for (const row of lista) {
    if (!uniqueTeachers.has(row.id) || row.grupo_matriz_id) {
      uniqueTeachers.set(row.id, row);
    }
  }
  lista = Array.from(uniqueTeachers.values());

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const project = await client.query(
      "SELECT id FROM proyectos WHERE id = $1 FOR NO KEY UPDATE",
      [proyectoId]
    );
    if (project.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Proyecto no encontrado" });
    }

    if (lista.length > 0) {
      const teacherIds = lista.map((row) => row.id);
      const teachers = await client.query(
        `
        SELECT id, COALESCE(tipo_docente, 'ANTIGUO') AS tipo_docente
        FROM usuarios
        WHERE id = ANY($1::int[]) AND rol = 'docente' AND estado = 'activo'
        FOR UPDATE
        `,
        [teacherIds]
      );
      const teacherById = new Map(
        teachers.rows.map((row) => [Number(row.id), row])
      );
      const missingIds = teacherIds.filter((id) => !teacherById.has(id));
      if (missingIds.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Solo se pueden asignar docentes activos existentes",
          docente_ids_invalidos: missingIds,
        });
      }

      const groupIds = Array.from(
        new Set(lista.map((row) => row.grupo_matriz_id).filter(Boolean))
      );
      if (groupIds.length > 0) {
        const groups = await client.query(
          `
          SELECT id, tipo_docente
          FROM grupos_matriz
          WHERE id = ANY($1::int[]) AND activo = true
          `,
          [groupIds]
        );
        const groupById = new Map(groups.rows.map((row) => [Number(row.id), row]));
        const missingGroups = groupIds.filter((id) => !groupById.has(id));
        if (missingGroups.length > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "Uno o más grupos matriz no existen o están inactivos",
            grupo_ids_invalidos: missingGroups,
          });
        }
        const incompatible = lista.find((row) => {
          if (!row.grupo_matriz_id) return false;
          return (
            groupById.get(row.grupo_matriz_id)?.tipo_docente !==
            teacherById.get(row.id)?.tipo_docente
          );
        });
        if (incompatible) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: "El tipo del docente no coincide con el grupo matriz seleccionado",
            docente_id: incompatible.id,
            grupo_matriz_id: incompatible.grupo_matriz_id,
          });
        }
      }
    }

    // Quitar a un colaborador con participación histórica (reportes, evidencias o eventos en esta iniciativa) se rechaza:
    // la lista enviada reemplaza a la actual, así que se comprueba cada colaborador que dejaría de figurar.
    const actuales = await client.query(
      "SELECT docente_id FROM proyecto_docentes WHERE proyecto_id = $1 ORDER BY docente_id",
      [proyectoId]
    );
    const nuevos = new Set(lista.map((row) => row.id));
    const retirados = actuales.rows.map((r) => Number(r.docente_id)).filter((id) => !nuevos.has(id));
    if (retirados.length > 0) {
      await bloquearHistoriaDeProyecto(client, proyectoId);
      const conHistoria = [];
      for (const docenteId of retirados) {
        const h = await historicoDeColaborador(client, proyectoId, docenteId);
        if (h.total > 0) conHistoria.push({ docente_id: docenteId, ...h });
      }
      if (conHistoria.length > 0) {
        const total = conHistoria.reduce(
          (acc, h) => ({
            entregables: acc.entregables + h.entregables,
            evidencias: acc.evidencias + h.evidencias,
            eventos: acc.eventos + h.eventos,
          }),
          { entregables: 0, evidencias: 0, eventos: 0 }
        );
        throw errorHistorico(
          `No se puede retirar ${conHistoria.length === 1 ? "al colaborador" : "a los colaboradores"} de la iniciativa: ${describirResumen(total)} de su participación quedarían sin su vínculo.`,
          { ...total, total: total.entregables + total.evidencias + total.eventos, colaboradores: conHistoria },
          "Mantén al colaborador en la iniciativa; sus reportes se conservan con su participación original."
        );
      }
    }

    // Solo se borran los colaboradores retirados (sin historia, comprobado arriba); los que continúan no se tocan.
    if (retirados.length > 0) {
      await client.query(
        "DELETE FROM proyecto_docentes WHERE proyecto_id = $1 AND docente_id = ANY($2::int[])",
        [proyectoId, retirados]
      );
    }

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
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en /admin/proyectos/:id/docentes (PUT)");
    console.error("Error en /admin/proyectos/:id/docentes (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al asignar docentes" });
  } finally {
    client.release();
  }
});

// Actualiza los entregables de cada semana SIN borrar información histórica:
//  - un entregable con avance (reportado, evidencia, descripción, revisión, vínculo con la matriz o
//    con un docente) NUNCA se elimina ni se modifica, aunque ya no figure en la lista enviada;
//  - los entregables "vacíos" (programados pero sin ningún reporte) se sincronizan: se actualizan
//    horas, se agregan los nuevos y se retiran los que el administrador quitó de la lista.
// (La condición «con avance» vive en historicosService.js: ENTREGABLE_CON_AVANCE_SQL, alias `pe`.)

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
    const semanasProyecto = await client.query(
      "SELECT id FROM proyecto_semanas WHERE proyecto_id = $1 FOR UPDATE",
      [proyectoId]
    );
    const validas = new Set(semanasProyecto.rows.map((r) => Number(r.id)));

    const conservados = [];
    let creados = 0;
    let retirados = 0;
    let actualizados = 0;

    for (const semana of semanas) {
      if (!semana || !semana.semanaId || !Array.isArray(semana.entregables)) continue;
      const semanaId = Number(semana.semanaId);
      if (!validas.has(semanaId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `La semana ${semana.semanaId} no pertenece a la iniciativa ${proyectoId}`,
        });
      }

      // Lista solicitada (texto -> horas), respetando repeticiones.
      const pedidos = [];
      for (const ent of semana.entregables) {
        const texto =
          typeof ent === "string" ? ent : ent && typeof ent.texto === "string" ? ent.texto : "";
        const trimmed = (texto || "").trim();
        if (!trimmed) continue;
        const horasRaw = typeof ent === "object" && ent !== null ? ent.horas ?? null : null;
        const horas =
          horasRaw !== null && horasRaw !== undefined && horasRaw !== "" ? Number(horasRaw) : null;
        pedidos.push({ texto: trimmed, horas: Number.isFinite(horas) ? horas : null });
      }

      const existentes = await client.query(
        `
        SELECT pe.id, pe.descripcion, ${ENTREGABLE_CON_AVANCE_SQL} AS con_avance
        FROM proyecto_entregables pe
        WHERE pe.proyecto_semana_id = $1
        ORDER BY pe.id
        FOR UPDATE
        `,
        [semanaId]
      );

      const pendientes = [...pedidos];
      for (const fila of existentes.rows) {
        const idx = pendientes.findIndex((p) => p.texto === String(fila.descripcion || "").trim());
        if (fila.con_avance) {
          conservados.push(Number(fila.id));
          if (idx >= 0) pendientes.splice(idx, 1); // ya existe: no se duplica
          continue;
        }
        if (idx >= 0) {
          const [p] = pendientes.splice(idx, 1);
          await client.query("UPDATE proyecto_entregables SET horas = $1 WHERE id = $2", [p.horas, fila.id]);
          actualizados += 1;
        } else {
          await client.query("DELETE FROM proyecto_entregables WHERE id = $1", [fila.id]);
          retirados += 1;
        }
      }
      for (const p of pendientes) {
        await client.query(
          "INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas) VALUES ($1, $2, $3)",
          [semanaId, p.texto, p.horas]
        );
        creados += 1;
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, creados, actualizados, retirados, conservados_con_avance: conservados.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en /admin/proyectos/:id/entregables-semanales (POST)", {
      mensaje: (error && error.message) || String(error),
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
    programaId,
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

  if (
    !titulo ||
    !String(titulo).trim() ||
    (!programaId && !programaNombre) ||
    !docenteId
  ) {
    return res
      .status(400)
      .json({ error: "titulo, programa y docenteId son obligatorios" });
  }
  const startDate = parseDateOnly(fechaInicio);
  const endDate = fechaFin ? parseDateOnly(fechaFin) : null;
  const weekCount = Number(semanas);
  const teacherId = Number(docenteId);
  if (!startDate) {
    return res.status(400).json({ error: "fechaInicio es obligatoria y debe ser válida" });
  }
  if (fechaFin && (!endDate || endDate < startDate)) {
    return res.status(400).json({ error: "fechaFin no es válida" });
  }
  if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 53) {
    return res.status(400).json({ error: "semanas debe ser un entero entre 1 y 53" });
  }
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return res.status(400).json({ error: "docenteId no es válido" });
  }
  const totalHours = horasTotales == null || horasTotales === "" ? null : Number(horasTotales);
  if (totalHours !== null && (!Number.isFinite(totalHours) || totalHours < 0)) {
    return res.status(400).json({ error: "horasTotales no es válido" });
  }

  const tipo =
    tipoVisual === "agreement"
      ? "convenio"
      : tipoVisual === "activity"
      ? "actividad"
      : "proyecto";
  const estadoProyecto = estado || "en_ejecucion";
  if (!["en_ejecucion", "finalizado", "suspendido"].includes(estadoProyecto)) {
    return res.status(400).json({ error: "estado no es válido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const programIdNumber = Number(programaId);
    const prog = Number.isInteger(programIdNumber) && programIdNumber > 0
      ? await client.query("SELECT id FROM programas WHERE id = $1", [programIdNumber])
      : await client.query(
          "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
          [String(programaNombre || "").trim()]
        );
    if (prog.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Programa no encontrado" });
    }

    const docente = await client.query(
      "SELECT id, nombre, apellido FROM usuarios WHERE id = $1 AND rol = 'docente' AND estado = 'activo' LIMIT 1",
      [teacherId]
    );
    if (docente.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Docente no encontrado" });
    }

    const insert = await client.query(
      `
      INSERT INTO proyectos
        (titulo, descripcion, programa_id, docente_responsable_id, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, titulo, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas
      `,
      [
        String(titulo).trim(),
        String(descripcion || "").trim(),
        prog.rows[0].id,
        docente.rows[0].id,
        tipo,
        estadoProyecto,
        startDate,
        endDate,
        totalHours,
        weekCount,
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
        await client.query(
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
        await client.query(
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
      const semanasRows = await client.query(
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
          await client.query(
            `
            INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas)
            VALUES ($1, $2, $3)
            `,
            [semanaId, trimmed, isNaN(horas) ? null : horas]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json({
      id: created.id,
      name: created.titulo,
      type:
        tipo === "convenio"
          ? "agreement"
          : tipo === "actividad"
          ? "activity"
          : "project",
      status:
        estadoProyecto === "en_ejecucion"
          ? "active"
          : estadoProyecto === "finalizado"
          ? "inactive"
          : "delayed",
      startDate: created.fecha_inicio,
      endDate: created.fecha_fin_estimada,
      totalHours: created.horas_totales,
      weeks: created.semanas,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en /admin/proyectos (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno en creación de proyecto" });
  } finally {
    client.release();
  }
});

router.put("/proyectos/:id", async (req, res) => {
  const proyectoId = Number(req.params.id);
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      "SELECT * FROM proyectos WHERE id = $1 FOR NO KEY UPDATE",
      [proyectoId]
    );
    if (currentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Iniciativa no encontrada" });
    }
    const current = currentResult.rows[0];

    const titulo = body.titulo === undefined
      ? current.titulo
      : String(body.titulo || "").trim();
    const descripcion = body.descripcion === undefined
      ? current.descripcion
      : String(body.descripcion || "").trim();
    if (!titulo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El título es obligatorio" });
    }

    let programaId = current.programa_id;
    if (body.programaId !== undefined || body.programa_id !== undefined) {
      programaId = Number(body.programaId ?? body.programa_id);
    } else if (body.programaNombre !== undefined) {
      const byName = await client.query(
        "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
        [String(body.programaNombre || "").trim()]
      );
      programaId = byName.rows[0]?.id ?? null;
    }
    if (!Number.isInteger(Number(programaId)) || Number(programaId) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Programa no válido" });
    }
    const programExists = await client.query("SELECT id FROM programas WHERE id = $1", [
      programaId,
    ]);
    if (programExists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Programa no encontrado" });
    }

    const teacherId = body.docenteId === undefined
      ? Number(current.docente_responsable_id)
      : Number(body.docenteId);
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Docente responsable no válido" });
    }
    // La historia de la iniciativa se bloquea y se cuenta una sola vez por transacción (mismo orden de bloqueos del
    // Bloque 1.1: participantes, semanas y entregables) y solo si algún campo protegido va a cambiar.
    let historiaProyecto = null;
    const historiaDeLaIniciativa = async () => {
      if (!historiaProyecto) {
        await bloquearHistoriaDeProyecto(client, proyectoId);
        historiaProyecto = await historicoDeProyecto(client, proyectoId);
      }
      return historiaProyecto;
    };
    const cambiaResponsable = teacherId !== Number(current.docente_responsable_id);
    if (cambiaResponsable) {
      // La atribución de los reportes (permisos, matriz e indicadores) depende del responsable. Sin un historial de
      // responsables por periodo, solo puede cambiarse si la iniciativa no tiene historia.
      const historia = await historiaDeLaIniciativa();
      if (historia.total > 0) {
        throw errorHistorico(
          `No se puede cambiar el docente responsable: ${describirResumen(historia)} de esta iniciativa quedarían atribuidos a otra persona.`,
          historia,
          "Mantén al responsable actual. Si debe dejar la iniciativa, cámbiala a 'suspendido' o 'finalizado'; el cambio de responsable se habilitará con el historial de responsables por periodo."
        );
      }
    }
    const teacherExists = await client.query(
      "SELECT id FROM usuarios WHERE id = $1 AND rol = 'docente' AND estado = 'activo'",
      [teacherId]
    );
    if (teacherExists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Docente responsable no encontrado o inactivo" });
    }

    const tipoVisual = body.tipoVisual;
    const tipo = tipoVisual === undefined && body.tipo === undefined
      ? current.tipo
      : tipoVisual === "agreement" || body.tipo === "convenio"
      ? "convenio"
      : tipoVisual === "activity" || body.tipo === "actividad"
      ? "actividad"
      : "proyecto";
    const estado = body.estado === undefined ? current.estado : String(body.estado);
    if (!["en_ejecucion", "finalizado", "suspendido"].includes(estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Estado no válido" });
    }

    const fechaInicio = body.fechaInicio === undefined
      ? toDateOnlyISO(current.fecha_inicio)
      : parseDateOnly(body.fechaInicio);
    const fechaFin = body.fechaFin === undefined
      ? toDateOnlyISO(current.fecha_fin_estimada)
      : body.fechaFin
      ? parseDateOnly(body.fechaFin)
      : null;
    if (!fechaInicio || (body.fechaFin && !fechaFin) || (fechaFin && fechaFin < fechaInicio)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Las fechas de la iniciativa no son válidas" });
    }

    const semanas = body.semanas === undefined ? Number(current.semanas) : Number(body.semanas);
    if (!Number.isInteger(semanas) || semanas < 1 || semanas > 53) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "semanas debe ser un entero entre 1 y 53" });
    }
    const horasTotales = body.horasTotales === undefined
      ? current.horas_totales
      : body.horasTotales === "" || body.horasTotales === null
      ? null
      : Number(body.horasTotales);
    if (horasTotales !== null && (!Number.isFinite(Number(horasTotales)) || Number(horasTotales) < 0)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "horasTotales no es válido" });
    }

    // Fecha de inicio, número de semanas y programa definen el calendario de los reportes (semanas y vencimientos) y su
    // clasificación en los indicadores por programa. Con historia no pueden cambiar; reenviar los mismos valores es una
    // operación nula. Se comprueba antes de cualquier escritura: un rechazo no deja cambios parciales.
    const camposHistoricos = [];
    if (toDateOnlyISO(current.fecha_inicio) !== fechaInicio) camposHistoricos.push("la fecha de inicio");
    if (Number(current.semanas) !== semanas) camposHistoricos.push("el número de semanas");
    if (Number(current.programa_id) !== Number(programaId)) camposHistoricos.push("el programa académico");
    if (camposHistoricos.length > 0) {
      const historia = await historiaDeLaIniciativa();
      if (historia.total > 0) {
        const razon = camposHistoricos.includes("el programa académico")
          ? "reclasificaría esos reportes en otro programa en los indicadores"
          : "reprogramaría sus semanas y vencimientos";
        throw errorHistorico(
          `No se puede cambiar ${camposHistoricos.join(", ")} de la iniciativa: ${describirResumen(historia)} ya reportados ${razon}.`,
          historia,
          "Puedes editar el título, la descripción, el tipo, el estado, la fecha de fin estimada y las horas. Para un nuevo periodo, crea una iniciativa nueva."
        );
      }
    }

    const scheduleChanged =
      toDateOnlyISO(current.fecha_inicio) !== fechaInicio || Number(current.semanas) !== semanas;
    if (scheduleChanged) {
      // El cronograma se ajusta SIN destruir reportes: las semanas existentes se reprograman en el
      // lugar (conservan sus entregables), se agregan las que falten y solo se retiran semanas
      // sobrantes que no tengan ningún avance. Reducir por debajo de una semana con reportes se rechaza.
      const sobrantes = await client.query(
        `
        SELECT
          ps.id,
          ps.numero,
          COUNT(pe.id) FILTER (
            WHERE COALESCE(pe.completado, FALSE)
               OR pe.url_evidencia IS NOT NULL
               OR pe.descripcion_reporte IS NOT NULL
               OR pe.actividad_reportada IS NOT NULL
               OR pe.plantilla_id IS NOT NULL
               OR pe.docente_id IS NOT NULL
               OR pe.revisado_en IS NOT NULL
               OR COALESCE(pe.num_envios, 0) > 0
               OR pe.estado_revision IN ('borrador', 'observado', 'aprobado')
          )::int AS con_avance
        FROM proyecto_semanas ps
        LEFT JOIN proyecto_entregables pe ON pe.proyecto_semana_id = ps.id
        WHERE ps.proyecto_id = $1 AND ps.numero > $2
        GROUP BY ps.id, ps.numero
        ORDER BY ps.numero
        `,
        [proyectoId, semanas]
      );
      const bloqueadas = sobrantes.rows.filter((r) => r.con_avance > 0);
      if (bloqueadas.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error:
            "No se puede reducir el cronograma: hay reportes o evidencias en semanas que quedarían fuera.",
          semanas_con_reportes: bloqueadas.map((r) => Number(r.numero)),
        });
      }
      if (sobrantes.rowCount > 0) {
        await client.query("DELETE FROM proyecto_semanas WHERE id = ANY($1::int[])", [
          sobrantes.rows.map((r) => Number(r.id)),
        ]);
      }

      const start = new Date(`${fechaInicio}T00:00:00Z`);
      for (let offset = 0; offset < semanas; offset += 1) {
        const weekStart = new Date(start);
        weekStart.setUTCDate(start.getUTCDate() + offset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
        await client.query(
          `
          INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (proyecto_id, numero)
          DO UPDATE SET fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin
          `,
          [proyectoId, offset + 1, weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)]
        );
      }
    }

    const updated = await client.query(
      `
      UPDATE proyectos
      SET titulo = $1,
          descripcion = $2,
          programa_id = $3,
          docente_responsable_id = $4,
          tipo = $5,
          estado = $6,
          fecha_inicio = $7,
          fecha_fin_estimada = $8,
          horas_totales = $9,
          semanas = $10
      WHERE id = $11
      RETURNING *
      `,
      [
        titulo,
        descripcion,
        programaId,
        teacherId,
        tipo,
        estado,
        fechaInicio,
        fechaFin,
        horasTotales,
        semanas,
        proyectoId,
      ]
    );
    await client.query("COMMIT");
    res.json({ ok: true, proyecto: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en PUT /admin/proyectos/:id");
    console.error("Error en PUT /admin/proyectos/:id", error);
    res.status(500).json({ error: "Error interno al actualizar la iniciativa" });
  } finally {
    client.release();
  }
});

router.delete("/proyectos/:id", async (req, res) => {
  // `forzar` (u otra variante) se ignora a propósito: la historia de una iniciativa nunca se elimina.
  const proyectoId = Number(req.params.id);
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const project = await client.query(
      "SELECT id, titulo FROM proyectos WHERE id = $1 FOR NO KEY UPDATE",
      [proyectoId]
    );
    if (project.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Iniciativa no encontrada" });
    }

    // Se bloquean semanas y entregables y luego se cuenta en la misma transacción: un reporte que se esté cargando
    // en este instante queda serializado con la comprobación (ver historicosService).
    await bloquearHistoriaDeProyecto(client, proyectoId);
    const historia = await historicoDeProyecto(client, proyectoId);
    if (historia.total > 0) {
      throw errorHistorico(
        `No se puede eliminar la iniciativa «${project.rows[0].titulo}»: ${describirResumen(historia)} dependen de ella.`,
        historia,
        "Cámbiala a 'finalizado' o 'suspendido' para conservar su historial."
      );
    }

    const related = await client.query(
      `
      SELECT
        COUNT(DISTINCT ps.id)::int AS semanas,
        COUNT(DISTINCT pe.id)::int AS entregables,
        COUNT(DISTINCT pd.docente_id)::int AS colaboradores
      FROM proyectos p
      LEFT JOIN proyecto_semanas ps ON ps.proyecto_id = p.id
      LEFT JOIN proyecto_entregables pe ON pe.proyecto_semana_id = ps.id
      LEFT JOIN proyecto_docentes pd ON pd.proyecto_id = p.id
      WHERE p.id = $1
      `,
      [proyectoId]
    );
    await client.query("DELETE FROM proyectos WHERE id = $1", [proyectoId]);
    await client.query("COMMIT");
    res.json({ ok: true, eliminado: project.rows[0], resumen: related.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ErrorNegocio) return responderError(res, error, "Error en DELETE /admin/proyectos/:id");
    console.error("Error en DELETE /admin/proyectos/:id", error);
    res.status(500).json({ error: "Error interno al eliminar la iniciativa" });
  } finally {
    client.release();
  }
});

router.get("/escuelas", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        e.id,
        e.nombre,
        e.codigo,
        COUNT(p.id)::int AS num_programas
      FROM escuelas e
      LEFT JOIN programas p ON p.escuela_id = e.id
      GROUP BY e.id
      ORDER BY e.nombre
      `
    );
    res.json({ escuelas: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/escuelas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/escuelas", async (req, res) => {
  const parsed = parseEscuelaInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { nombre, codigo } = parsed.value;
  try {
    const result = await pool.query(
      `
      INSERT INTO escuelas (nombre, codigo)
      VALUES ($1, $2)
      RETURNING id, nombre, codigo
      `,
      [nombre, codigo]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe una escuela con ese nombre o código." });
    }
    console.error("Error en /admin/escuelas (POST)", error);
    res.status(500).json({ error: "Error interno al crear la escuela" });
  }
});

router.put("/escuelas/:id", async (req, res) => {
  const escuelaId = Number(req.params.id);
  if (!Number.isInteger(escuelaId) || escuelaId <= 0) {
    return res.status(400).json({ error: "ID de escuela inválido." });
  }
  const parsed = parseEscuelaInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { nombre, codigo } = parsed.value;
  try {
    const result = await pool.query(
      `
      UPDATE escuelas
      SET nombre = $1, codigo = $2
      WHERE id = $3
      RETURNING id, nombre, codigo
      `,
      [nombre, codigo, escuelaId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Escuela no encontrada." });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe una escuela con ese nombre o código." });
    }
    console.error("Error en /admin/escuelas/:id (PUT)", error);
    res.status(500).json({ error: "Error interno al actualizar la escuela" });
  }
});

router.delete("/escuelas/:id", async (req, res) => {
  const escuelaId = Number(req.params.id);
  if (!Number.isInteger(escuelaId) || escuelaId <= 0) {
    return res.status(400).json({ error: "ID de escuela inválido." });
  }
  try {
    const refs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM programas WHERE escuela_id = $1`,
      [escuelaId]
    );
    if ((refs.rows[0]?.n || 0) > 0) {
      return res.status(400).json({
        error: "No se puede eliminar: hay programas asociados a esta escuela.",
        usos: refs.rows[0].n,
      });
    }
    const result = await pool.query(`DELETE FROM escuelas WHERE id = $1 RETURNING id`, [escuelaId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Escuela no encontrada." });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error en /admin/escuelas/:id (DELETE)", error);
    res.status(500).json({ error: "Error interno al eliminar la escuela" });
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
        p.escuela_id,
        COALESCE(e.nombre, 'Sin escuela') AS escuela
      FROM programas p
      LEFT JOIN escuelas e ON e.id = p.escuela_id
      ORDER BY escuela, p.nombre
      `
    );

    res.json({ programas: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/programas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/programas", async (req, res) => {
  const parsed = parseProgramaInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { nombre, codigo, escuela_id } = parsed.value;
  try {
    const escuela = await pool.query(`SELECT id, nombre FROM escuelas WHERE id = $1`, [escuela_id]);
    if (escuela.rowCount === 0) {
      return res.status(400).json({ error: "La escuela indicada no existe." });
    }
    const result = await pool.query(
      `
      INSERT INTO programas (nombre, codigo, escuela_id)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, codigo, escuela_id
      `,
      [nombre, codigo, escuela_id]
    );
    res.status(201).json({
      ...result.rows[0],
      escuela: escuela.rows[0].nombre,
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un programa con ese nombre o código." });
    }
    if (error?.code === "23514") {
      return res.status(400).json({ error: "Los datos del programa no son válidos." });
    }
    console.error("Error en /admin/programas (POST)", error);
    res.status(500).json({ error: "Error interno al crear el programa" });
  }
});

router.put("/programas/:id", async (req, res) => {
  const programaId = Number(req.params.id);
  if (!Number.isInteger(programaId) || programaId <= 0) {
    return res.status(400).json({ error: "ID de programa inválido." });
  }

  const parsed = parseProgramaInput(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const { nombre, codigo, escuela_id } = parsed.value;
  try {
    const escuela = await pool.query(`SELECT id, nombre FROM escuelas WHERE id = $1`, [escuela_id]);
    if (escuela.rowCount === 0) {
      return res.status(400).json({ error: "La escuela indicada no existe." });
    }
    const result = await pool.query(
      `
      UPDATE programas
      SET nombre = $1, codigo = $2, escuela_id = $3
      WHERE id = $4
      RETURNING id, nombre, codigo, escuela_id
      `,
      [nombre, codigo, escuela_id, programaId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Programa no encontrado." });
    }
    res.json({
      ...result.rows[0],
      escuela: escuela.rows[0].nombre,
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Ya existe un programa con ese nombre o código." });
    }
    if (error?.code === "23514") {
      return res.status(400).json({ error: "Los datos del programa no son válidos." });
    }
    console.error("Error en /admin/programas/:id (PUT)", error);
    res.status(500).json({ error: "Error interno al actualizar el programa" });
  }
});

router.delete("/programas/:id", async (req, res) => {
  const programaId = Number(req.params.id);
  if (!Number.isInteger(programaId) || programaId <= 0) {
    return res.status(400).json({ error: "ID de programa inválido." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const programa = await client.query(
      "SELECT id FROM programas WHERE id = $1 FOR UPDATE",
      [programaId]
    );
    if (programa.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Programa no encontrado." });
    }

    const referencias = await client.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM usuarios WHERE programa_id = $1) AS usuarios,
        (SELECT COUNT(*)::int FROM proyectos WHERE programa_id = $1) AS proyectos
      `,
      [programaId]
    );
    const counts = referencias.rows[0];
    if (counts.usuarios > 0 || counts.proyectos > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "No se puede eliminar: el programa tiene usuarios o iniciativas asociados.",
        referencias: counts,
      });
    }

    await client.query("DELETE FROM programas WHERE id = $1", [programaId]);
    await client.query("COMMIT");
    res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /admin/programas/:id (DELETE)", error);
    res.status(500).json({ error: "Error interno al eliminar el programa" });
  } finally {
    client.release();
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

    const vista = await loadAdminMatrix(docenteId);
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
    console.error("Error en GET /admin/docentes/:docenteId/perfil", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/docentes/:docenteId/matriz-stats", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const vista = await loadAdminMatrix(docenteId);
    if (!vista) return res.status(404).json({ error: "docente no encontrado" });
    res.json(buildMatrixStats(vista.items, { hoy: vista.hoy, calendario: vista.calendario }));
  } catch (error) {
    responderError(res, error, "Error en GET /admin/docentes/:docenteId/matriz-stats");
  }
});

router.get("/docentes/:docenteId/matriz", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const vista = await loadAdminMatrix(docenteId);
    if (!vista) return res.status(404).json({ error: "docente no encontrado" });
    const stats = buildMatrixStats(vista.items, { hoy: vista.hoy, calendario: vista.calendario });
    res.json({
      items: vista.items.map(itemParaApi),
      resumen: stats.resumen,
      semana_actual: stats.semana_actual,
      hoy: vista.hoy,
    });
  } catch (error) {
    responderError(res, error, "Error en GET /admin/docentes/:docenteId/matriz");
  }
});

router.get("/docentes/:docenteId/iniciativas", async (req, res) => {
  const docenteId = Number(req.params.docenteId);
  if (!Number.isInteger(docenteId) || docenteId <= 0) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  try {
    const docente = await pool.query(
      `SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'docente'`,
      [docenteId]
    );
    if (docente.rowCount === 0) {
      return res.status(404).json({ error: "Docente no encontrado" });
    }
    res.json({ iniciativas: await loadAssignedInitiatives(docenteId) });
  } catch (error) {
    console.error("Error en GET /admin/docentes/:docenteId/iniciativas", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put(
  "/docentes/:docenteId/plantillas/:plantillaId/excepcion",
  async (req, res) => {
    const docenteId = Number(req.params.docenteId);
    const plantillaId = Number(req.params.plantillaId);
    if (
      !Number.isInteger(docenteId) ||
      docenteId <= 0 ||
      !Number.isInteger(plantillaId) ||
      plantillaId <= 0
    ) {
      return res.status(400).json({ error: "Identificadores inválidos" });
    }

    const body = req.body || {};
    const motivo = String(body.motivo || "").trim();
    if (!motivo) {
      return res.status(400).json({ error: "El motivo de la excepción es obligatorio" });
    }

    const optionalText = (value) => {
      if (value == null) return null;
      const text = String(value).trim();
      return text || null;
    };
    const entregableOverride = optionalText(body.entregable_override);
    const descripcionOverride = optionalText(body.descripcion_evidencia_override);
    const fechaInicio = body.fecha_inicio_override
      ? parseDateOnly(body.fecha_inicio_override)
      : null;
    const fechaFin = body.fecha_fin_override
      ? parseDateOnly(body.fecha_fin_override)
      : null;
    if (
      (body.fecha_inicio_override && !fechaInicio) ||
      (body.fecha_fin_override && !fechaFin)
    ) {
      return res.status(400).json({ error: "Las fechas de la excepción no son válidas" });
    }

    let enlaceOverride = null;
    if (body.enlace_referencia_override) {
      const parsed = normalizeOptionalHttpsUrl(body.enlace_referencia_override);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      enlaceOverride = parsed.value;
    }
    const proyectoId =
      body.proyecto_id == null || body.proyecto_id === ""
        ? null
        : Number(body.proyecto_id);
    if (proyectoId != null && (!Number.isInteger(proyectoId) || proyectoId <= 0)) {
      return res.status(400).json({ error: "La iniciativa seleccionada no es válida" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const context = await client.query(
        `
        SELECT
          tpl.semana_numero,
          (sem.fecha_inicio + COALESCE(tpl.dias_inicio_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_inicio_base,
          (sem.fecha_inicio + COALESCE(tpl.dias_fin_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_fin_base
        FROM plantilla_entregables tpl
        INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
        INNER JOIN semestres sem ON sem.codigo = gm.semestre
        INNER JOIN usuarios u
          ON u.id = $1 AND u.rol = 'docente' AND u.grupo_matriz_id = tpl.grupo_id
        WHERE tpl.id = $2
        FOR UPDATE OF tpl
        `,
        [docenteId, plantillaId]
      );
      if (context.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          error: "El entregable no pertenece al grupo matriz de este docente",
        });
      }
      const base = context.rows[0];
      const effectiveStart = fechaInicio || toDateOnlyISO(base.fecha_inicio_base);
      const effectiveEnd = fechaFin || toDateOnlyISO(base.fecha_fin_base);
      if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "La fecha límite no puede ser anterior a la fecha de inicio",
        });
      }

      let targetWeekId = null;
      if (proyectoId != null) {
        const assigned = await client.query(
          `
          SELECT ps.id AS semana_id
          FROM proyectos p
          INNER JOIN proyecto_semanas ps
            ON ps.proyecto_id = p.id AND ps.numero = $3
          WHERE p.id = $1
            AND (
              p.docente_responsable_id = $2
              OR p.id IN (
                SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $2
              )
            )
          `,
          [proyectoId, docenteId, Number(base.semana_numero)]
        );
        if (assigned.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error:
              "La iniciativa no está asignada al docente o no tiene configurada esa semana",
          });
        }
        targetWeekId = Number(assigned.rows[0].semana_id);
      }

      if (targetWeekId != null) {
        // Mover un reporte ya existente a otra iniciativa o semana reescribiría su historia.
        const movidos = await client.query(
          `SELECT id FROM proyecto_entregables WHERE docente_id = $1 AND plantilla_id = $2 AND proyecto_semana_id <> $3 FOR UPDATE`,
          [docenteId, plantillaId, targetWeekId]
        );
        if (movidos.rowCount > 0) {
          throw errorHistorico(
            "No se puede asignar la excepción a esa iniciativa: el docente ya tiene un reporte de este entregable en otra iniciativa o semana y moverlo alteraría el histórico.",
            { excepciones_movidas: movidos.rowCount },
            "Deja el reporte donde está; la excepción solo puede cambiar la iniciativa de entregables aún sin reportar."
          );
        }
      }

      const saved = await client.query(
        `
        INSERT INTO docente_entregable_excepciones (
          docente_id,
          plantilla_id,
          entregable_override,
          descripcion_evidencia_override,
          enlace_referencia_override,
          fecha_inicio_override,
          fecha_fin_override,
          proyecto_id,
          motivo,
          creado_por
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (docente_id, plantilla_id)
        DO UPDATE SET
          entregable_override = EXCLUDED.entregable_override,
          descripcion_evidencia_override = EXCLUDED.descripcion_evidencia_override,
          enlace_referencia_override = EXCLUDED.enlace_referencia_override,
          fecha_inicio_override = EXCLUDED.fecha_inicio_override,
          fecha_fin_override = EXCLUDED.fecha_fin_override,
          proyecto_id = EXCLUDED.proyecto_id,
          motivo = EXCLUDED.motivo,
          actualizado_en = CURRENT_TIMESTAMP
        RETURNING *
        `,
        [
          docenteId,
          plantillaId,
          entregableOverride,
          descripcionOverride,
          enlaceOverride,
          fechaInicio,
          fechaFin,
          proyectoId,
          motivo,
          Number(req.user?.id) || null,
        ]
      );

      if (targetWeekId != null) {
        await client.query(
          `
          UPDATE proyecto_entregables
          SET proyecto_semana_id = $1
          WHERE docente_id = $2 AND plantilla_id = $3
          `,
          [targetWeekId, docenteId, plantillaId]
        );
      }

      await client.query("COMMIT");
      res.json({ excepcion: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof ErrorNegocio) {
        return responderError(res, error, "Error en PUT /admin/docentes/:docenteId/plantillas/:plantillaId/excepcion");
      }
      console.error(
        "Error en PUT /admin/docentes/:docenteId/plantillas/:plantillaId/excepcion",
        error
      );
      res.status(500).json({ error: "Error interno" });
    } finally {
      client.release();
    }
  }
);

router.delete(
  "/docentes/:docenteId/plantillas/:plantillaId/excepcion",
  async (req, res) => {
    const docenteId = Number(req.params.docenteId);
    const plantillaId = Number(req.params.plantillaId);
    if (!Number.isInteger(docenteId) || !Number.isInteger(plantillaId)) {
      return res.status(400).json({ error: "Identificadores inválidos" });
    }
    try {
      const result = await pool.query(
        `
        DELETE FROM docente_entregable_excepciones
        WHERE docente_id = $1 AND plantilla_id = $2
        RETURNING id
        `,
        [docenteId, plantillaId]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "La excepción no existe" });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error(
        "Error en DELETE /admin/docentes/:docenteId/plantillas/:plantillaId/excepcion",
        error
      );
      res.status(500).json({ error: "Error interno" });
    }
  }
);

router.get("/avance-consolidado", async (req, res) => {
  const semestreQ = req.query.semestre;
  const grupoIdQ = req.query.grupo_id;
  const semestre =
    semestreQ != null && String(semestreQ).trim() !== "" ? String(semestreQ).trim() : null;
  const grupoIdNum =
    grupoIdQ != null && String(grupoIdQ).trim() !== "" ? Number(String(grupoIdQ).trim()) : null;
  const grupoId = grupoIdNum != null && !Number.isNaN(grupoIdNum) ? grupoIdNum : null;

  try {
    const hoy = hoyBogota();
    const docentes = await loadMatrixForDocentes(pool, { semestre, grupoId, hoy });

    const meses = [];
    const docentesPayload = docentes.map(({ docente, calendario, items }) => {
      const stats = buildMatrixStats(items, { hoy, calendario });
      const m = stats.resumen;
      const avancePorMes = stats.por_mes.map((month) => {
        if (month.mes && !meses.includes(month.mes)) meses.push(month.mes);
        return {
          mes: month.mes,
          completados: month.reportados, // alias histórico = reportados
          reportados: month.reportados,
          aprobados: month.aprobados,
          total: month.total,
          porcentaje: month.pct_reportado,
          porcentaje_aprobado: month.pct_aprobado,
        };
      });
      const ultimoEnvio = items
        .map((i) => i.fecha_cargue_evidencia)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        id: docente.id,
        nombre: docente.nombre || "—",
        programa: docente.programa || "—",
        regional: docente.regional || "—",
        grupo_id: docente.grupo_id,
        grupo_nombre: docente.grupo_nombre || "—",
        tipo_docente: docente.tipo_docente,
        // avance_global / avance_real = % reportado (alias históricos); ver avance_aprobado.
        avance_global: m.pct_reportado,
        avance_real: m.pct_reportado,
        avance_reportado: m.pct_reportado,
        avance_aprobado: m.pct_aprobado,
        avance_esperado: m.pct_esperado,
        cumplimiento_esperado: m.cumplimiento_esperado,
        cumplimiento_exigible: m.cumplimiento_exigible,
        cumplimiento_reportado_exigible: m.cumplimiento_reportado_exigible,
        brecha: m.brecha, // puntos porcentuales: aprobado − esperado
        brecha_entregables: m.brecha_entregables,
        exigibles_a_fecha: m.exigibles_a_fecha,
        semaforo: m.semaforo,
        pendientes_revision: m.enviados_pendientes_revision,
        observados: m.observados,
        total_entregables: m.total,
        reportados: m.reportados,
        aprobados: m.aprobados,
        avance_por_mes: avancePorMes,
        entregables_vencidos: m.vencidos,
        ultimo_reporte: ultimoEnvio ? fechaBogota(ultimoEnvio) : null,
        semana_actual: stats.semana_actual.numero,
      };
    });

    const n = docentesPayload.length;
    const avg = (arr) =>
      arr.length === 0 ? 0 : round1(arr.reduce((a, b) => a + b, 0) / arr.length);
    const conGrupo = docentesPayload.filter((d) => d.total_entregables > 0);

    const por_mes = meses.map((mes) => {
      const vals = docentesPayload
        .map((d) => d.avance_por_mes.find((month) => month.mes === mes))
        .filter((month) => month && month.total > 0)
        .map((month) => month.porcentaje);
      return { mes, porcentaje: avg(vals) };
    });

    res.json({
      meses,
      docentes: docentesPayload,
      totales: {
        docentes: n,
        promedio_global: n > 0 ? round1(docentesPayload.reduce((s, d) => s + d.avance_global, 0) / n) : 0,
        promedio_aprobado: avg(conGrupo.map((d) => d.avance_aprobado)),
        promedio_esperado: avg(conGrupo.map((d) => d.avance_esperado)),
        con_retraso: docentesPayload.filter((d) => d.entregables_vencidos > 0).length,
        pendientes_revision: docentesPayload.reduce((s, d) => s + d.pendientes_revision, 0),
        semaforo: {
          verde: docentesPayload.filter((d) => d.semaforo === "verde").length,
          amarillo: docentesPayload.filter((d) => d.semaforo === "amarillo").length,
          rojo: docentesPayload.filter((d) => d.semaforo === "rojo").length,
        },
        por_mes,
      },
      hoy,
    });
  } catch (error) {
    responderError(res, error, "Error en GET /admin/avance-consolidado");
  }
});

// Resumen de un grupo: docentes asignados, origen (importaciones) y totales de la matriz.
router.get("/grupos-matriz/:grupoId/resumen", async (req, res) => {
  const grupoId = Number(req.params.grupoId);
  if (!Number.isInteger(grupoId) || grupoId <= 0) {
    return res.status(400).json({ error: "id de grupo inválido" });
  }
  try {
    const g = await pool.query(
      `SELECT gm.id, gm.nombre, gm.semestre, gm.tipo_docente, gm.horas_totales, sem.numero_semanas,
              to_char(sem.fecha_inicio, 'YYYY-MM-DD') AS semestre_fecha_inicio
       FROM grupos_matriz gm LEFT JOIN semestres sem ON sem.codigo = gm.semestre WHERE gm.id = $1`,
      [grupoId]
    );
    if (g.rowCount === 0) return res.status(404).json({ error: "Grupo no encontrado" });
    const [docentes, importaciones, totales] = await Promise.all([
      pool.query(
        `SELECT id, nombre, apellido, estado FROM usuarios WHERE rol = 'docente' AND grupo_matriz_id = $1 ORDER BY apellido, nombre`,
        [grupoId]
      ),
      pool.query(
        `SELECT i.id, i.lote, i.creado_en, i.archivo_nombre, i.resumen, i.decisiones, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
         FROM importaciones_matriz i LEFT JOIN usuarios u ON u.id = i.usuario_id
         WHERE i.grupo_id = $1 ORDER BY i.creado_en DESC LIMIT 20`,
        [grupoId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(importacion_id)::int AS importadas, COALESCE(SUM(horas), 0)::float AS horas,
                COUNT(*) FILTER (WHERE semana_original IS NOT NULL OR numero_original IS NOT NULL)::int AS con_ajustes
         FROM plantilla_entregables WHERE grupo_id = $1`,
        [grupoId]
      ),
    ]);
    res.json({
      grupo: g.rows[0],
      docentes: docentes.rows,
      importaciones: importaciones.rows.map((i) => ({
        ...i,
        usuario: [i.usuario_nombre, i.usuario_apellido].filter(Boolean).join(" ") || null,
      })),
      totales: totales.rows[0],
    });
  } catch (error) {
    console.error("Error en GET /admin/grupos-matriz/:grupoId/resumen", error);
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
      SELECT
        tpl.*,
        (sem.fecha_inicio + COALESCE(tpl.dias_inicio_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_inicio_calculada,
        (sem.fecha_inicio + COALESCE(tpl.dias_fin_desde_feb, 0) * INTERVAL '1 day')::date AS fecha_fin_calculada,
        imp.lote AS importacion_lote,
        imp.creado_en AS importacion_fecha,
        imp.archivo_nombre AS importacion_archivo
      FROM plantilla_entregables tpl
      INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
      INNER JOIN semestres sem ON sem.codigo = gm.semestre
      LEFT JOIN importaciones_matriz imp ON imp.id = tpl.importacion_id
      WHERE tpl.grupo_id = $1
      ORDER BY fecha_inicio_calculada ASC NULLS LAST, tpl.numero ASC NULLS LAST
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
    enlace_referencia,
    horas,
    dias_inicio_desde_feb,
    dias_fin_desde_feb,
    fecha_inicio,
    fecha_fin,
  } = b;

  const hasExactDates = fecha_inicio != null || fecha_fin != null;
  const exactStart = hasExactDates ? parseDateOnly(fecha_inicio) : null;
  const exactEnd = hasExactDates ? parseDateOnly(fecha_fin) : null;

  if (
    numero == null ||
    !categoria ||
    !fase ||
    !mes ||
    semana_numero == null ||
    !entregable ||
    horas == null ||
    (!hasExactDates &&
      (dias_inicio_desde_feb == null || dias_fin_desde_feb == null)) ||
    (hasExactDates && (!exactStart || !exactEnd || exactEnd < exactStart))
  ) {
    return res.status(400).json({ error: "Faltan campos obligatorios para la plantilla" });
  }

  try {
    const parsedLink = normalizeOptionalHttpsUrl(enlace_referencia);
    if (parsedLink.error) {
      return res.status(400).json({ error: parsedLink.error });
    }
    const ex = await pool.query(
      `
      SELECT gm.id, sem.fecha_inicio
      FROM grupos_matriz gm
      INNER JOIN semestres sem ON sem.codigo = gm.semestre
      WHERE gm.id = $1
      `,
      [grupoId]
    );
    if (ex.rowCount === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const startOffset = hasExactDates
      ? daysBetweenDateOnly(toDateOnlyISO(ex.rows[0].fecha_inicio), exactStart)
      : Number(dias_inicio_desde_feb);
    const endOffset = hasExactDates
      ? daysBetweenDateOnly(toDateOnlyISO(ex.rows[0].fecha_inicio), exactEnd)
      : Number(dias_fin_desde_feb);
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
      return res.status(400).json({ error: "No fue posible calcular las fechas" });
    }

    const ins = await pool.query(
      `
      INSERT INTO plantilla_entregables (
        grupo_id, numero, categoria, fase, mes, semana_numero,
        entregable, descripcion_evidencia, enlace_referencia, horas,
        dias_inicio_desde_feb, dias_fin_desde_feb
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        parsedLink.value,
        Number(horas),
        startOffset,
        endOffset,
      ]
    );
    res.status(201).json({ plantilla: ins.rows[0] });
  } catch (error) {
    console.error("Error en POST /admin/grupos-matriz/:grupoId/plantillas", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/plantillas/actualizacion-masiva/preview", async (req, res) => {
  const plantillaId = Number(req.body?.plantilla_id);
  if (!Number.isInteger(plantillaId) || plantillaId <= 0) {
    return res.status(400).json({ error: "plantilla_id es obligatorio" });
  }
  try {
    const result = await pool.query(
      `
      WITH source AS (
        SELECT
          gm.semestre,
          LOWER(REGEXP_REPLACE(TRIM(tpl.entregable), '\\s+', ' ', 'g')) AS clave
        FROM plantilla_entregables tpl
        INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
        WHERE tpl.id = $1
      )
      SELECT
        tpl.id AS plantilla_id,
        tpl.grupo_id,
        gm.nombre AS grupo_nombre,
        gm.semestre,
        tpl.entregable,
        tpl.descripcion_evidencia,
        tpl.enlace_referencia
      FROM plantilla_entregables tpl
      INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
      CROSS JOIN source s
      WHERE gm.semestre = s.semestre
        AND LOWER(REGEXP_REPLACE(TRIM(tpl.entregable), '\\s+', ' ', 'g')) = s.clave
      ORDER BY gm.nombre, tpl.id
      `,
      [plantillaId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    // Las plantillas con reportes no se modifican: la vista previa cuenta solo las que realmente cambiarían.
    const conHistorico = await plantillasConHistorico(pool, result.rows.map((row) => Number(row.plantilla_id)));
    const coincidencias = result.rows.map((row) => ({ ...row, protegida: conHistorico.has(Number(row.plantilla_id)) }));
    const actualizables = coincidencias.filter((row) => !row.protegida);
    const groups = new Set(actualizables.map((row) => Number(row.grupo_id)));
    res.json({
      semestre: result.rows[0].semestre,
      entregable_clave: result.rows[0].entregable,
      plantillas_afectadas: actualizables.length,
      plantillas_protegidas: coincidencias.length - actualizables.length,
      grupos_afectados: groups.size,
      coincidencias,
    });
  } catch (error) {
    console.error("Error en POST /admin/plantillas/actualizacion-masiva/preview", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/plantillas/actualizacion-masiva", async (req, res) => {
  const plantillaId = Number(req.body?.plantilla_id);
  const hasDescription = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "descripcion_evidencia"
  );
  const hasLink = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "enlace_referencia"
  );
  if (!Number.isInteger(plantillaId) || plantillaId <= 0) {
    return res.status(400).json({ error: "plantilla_id es obligatorio" });
  }
  if (!hasDescription && !hasLink) {
    return res.status(400).json({
      error: "Debes indicar la descripción, el enlace o ambos campos",
    });
  }
  const description = hasDescription
    ? String(req.body.descripcion_evidencia || "").trim()
    : null;
  let link = null;
  if (hasLink) {
    const parsed = normalizeOptionalHttpsUrl(req.body.enlace_referencia);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    link = parsed.value;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const matches = await client.query(
      `
      WITH source AS (
        SELECT
          gm.semestre,
          LOWER(REGEXP_REPLACE(TRIM(tpl.entregable), '\\s+', ' ', 'g')) AS clave,
          tpl.entregable AS entregable_clave
        FROM plantilla_entregables tpl
        INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
        WHERE tpl.id = $1
      )
      SELECT
        tpl.id,
        tpl.grupo_id,
        s.semestre,
        s.entregable_clave
      FROM plantilla_entregables tpl
      INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
      CROSS JOIN source s
      WHERE gm.semestre = s.semestre
        AND LOWER(REGEXP_REPLACE(TRIM(tpl.entregable), '\\s+', ' ', 'g')) = s.clave
      FOR UPDATE OF tpl
      `,
      [plantillaId]
    );
    if (matches.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    // Solo se actualizan las plantillas sin historia; las que tienen reportes quedan protegidas (se informa cuántas).
    const protegidas = await plantillasConHistorico(client, matches.rows.map((row) => Number(row.id)));
    const actualizables = matches.rows.filter((row) => !protegidas.has(Number(row.id)));
    if (actualizables.length === 0) {
      throw errorHistorico(
        `No se puede actualizar: las ${matches.rowCount} plantilla(s) coincidentes tienen reportes y el cambio alteraría el histórico.`,
        { plantillas_protegidas: matches.rowCount },
        "Las plantillas con reportes quedan congeladas hasta contar con el versionado de plantillas."
      );
    }
    const ids = actualizables.map((row) => Number(row.id));
    await client.query(
      `
      UPDATE plantilla_entregables
      SET descripcion_evidencia = CASE WHEN $2 THEN $3 ELSE descripcion_evidencia END,
          enlace_referencia = CASE WHEN $4 THEN $5 ELSE enlace_referencia END
      WHERE id = ANY($1::int[])
      `,
      [ids, hasDescription, description, hasLink, link]
    );
    const groups = new Set(actualizables.map((row) => Number(row.grupo_id)));
    await client.query(
      `
      INSERT INTO actualizaciones_masivas_entregables (
        semestre,
        entregable_clave,
        descripcion_evidencia,
        enlace_referencia,
        plantillas_afectadas,
        grupos_afectados,
        creado_por
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        matches.rows[0].semestre,
        matches.rows[0].entregable_clave,
        hasDescription ? description : null,
        hasLink ? link : null,
        actualizables.length,
        groups.size,
        Number(req.user?.id) || null,
      ]
    );
    await client.query("COMMIT");
    res.json({
      ok: true,
      semestre: matches.rows[0].semestre,
      plantillas_afectadas: actualizables.length,
      plantillas_protegidas: matches.rowCount - actualizables.length,
      grupos_afectados: groups.size,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en PUT /admin/plantillas/actualizacion-masiva");
  } finally {
    client.release();
  }
});

router.put("/plantillas/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  if (b.fecha_inicio !== undefined || b.fecha_fin !== undefined) {
    const exactStart = parseDateOnly(b.fecha_inicio);
    const exactEnd = parseDateOnly(b.fecha_fin);
    if (!exactStart || !exactEnd || exactEnd < exactStart) {
      return res.status(400).json({ error: "El periodo de entrega no es válido" });
    }
    try {
      const context = await pool.query(
        `
        SELECT sem.fecha_inicio
        FROM plantilla_entregables tpl
        INNER JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
        INNER JOIN semestres sem ON sem.codigo = gm.semestre
        WHERE tpl.id = $1
        `,
        [id]
      );
      if (context.rowCount === 0) {
        return res.status(404).json({ error: "Plantilla no encontrada" });
      }
      const semesterStart = toDateOnlyISO(context.rows[0].fecha_inicio);
      b.dias_inicio_desde_feb = daysBetweenDateOnly(semesterStart, exactStart);
      b.dias_fin_desde_feb = daysBetweenDateOnly(semesterStart, exactEnd);
    } catch (error) {
      console.error("Error al calcular fechas de plantilla", error);
      return res.status(500).json({ error: "Error interno" });
    }
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
  if (b.enlace_referencia !== undefined) {
    const parsedLink = normalizeOptionalHttpsUrl(b.enlace_referencia);
    if (parsedLink.error) {
      return res.status(400).json({ error: parsedLink.error });
    }
    add("enlace_referencia", parsedLink.value);
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
  // Una plantilla con reportes no se modifica (ningún campo): cambiaría retroactivamente horas, fechas, requisitos o el
  // significado del entregable. Bloqueo de la fila + comprobación + escritura en una sola transacción.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query(`SELECT id FROM plantilla_entregables WHERE id = $1 FOR UPDATE`, [id]);
    if (lock.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    const h = await historicoDePlantillas(client, [id]);
    if (h.total > 0) {
      throw errorHistorico(
        `No se puede modificar la plantilla: ${describirResumen(h)} dependen de ella y el cambio alteraría el histórico.`,
        h,
        "Las plantillas con reportes quedan congeladas hasta contar con el versionado de plantillas."
      );
    }
    const upd = await client.query(
      `
      UPDATE plantilla_entregables
      SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING *
      `,
      vals
    );
    await client.query("COMMIT");
    res.json({ plantilla: upd.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en PUT /admin/plantillas/:id");
  } finally {
    client.release();
  }
});

// La historia protegida no se elimina: sin reportes, entregables, evidencias ni eventos que dependan de la plantilla.
// El parámetro `forzar` ya no existe (se ignora): ninguna confirmación permite saltarse esta restricción.
router.delete("/plantillas/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "id inválido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tpl = await client.query(`SELECT id FROM plantilla_entregables WHERE id = $1 FOR UPDATE`, [id]);
    if (tpl.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Plantilla no encontrada" });
    }
    const h = await historicoDePlantillas(client, [id]);
    if (h.total > 0) {
      throw errorHistorico(
        `No se puede eliminar la plantilla: ${describirResumen(h)} dependen de ella.`,
        h,
        "Una plantilla con reportes no se elimina. Los cambios controlados se habilitarán con el versionado de plantillas."
      );
    }
    await client.query(`DELETE FROM plantilla_entregables WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.json({ ok: true, reportes_conservados: 0 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    responderError(res, error, "Error en DELETE /admin/plantillas/:id");
  } finally {
    client.release();
  }
});

export default router;
