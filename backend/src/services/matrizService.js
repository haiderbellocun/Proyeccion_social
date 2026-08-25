import { pool } from "../db.js";

export const round1 = (value) => Math.round(Number(value) * 10) / 10;

export const toDateOnlyISO = (value) => {
  if (value == null) return null;
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

export const toTimestampISO = (value) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export async function loadAssignedInitiatives(docenteId, db = pool) {
  const result = await db.query(
    `
    SELECT DISTINCT p.id, p.titulo, p.tipo, p.fecha_inicio
    FROM proyectos p
    WHERE p.docente_responsable_id = $1
       OR p.id IN (
         SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1
       )
    ORDER BY p.tipo, p.fecha_inicio, p.id
    `,
    [docenteId]
  );
  return (result.rows || []).map((row) => ({
    id: Number(row.id),
    titulo: String(row.titulo || "").trim() || "Iniciativa sin nombre",
    tipo: row.tipo || "proyecto",
    fecha_inicio: toDateOnlyISO(row.fecha_inicio),
  }));
}

const extractOrdinal = (text, expression) => {
  const match = text.match(expression);
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
};

function inferInitiative(row, initiatives) {
  const reportId = row.report_project_id != null ? Number(row.report_project_id) : null;
  if (reportId) {
    return {
      id: reportId,
      titulo: row.report_project_title || "Iniciativa",
      tipo: row.report_project_type || "proyecto",
      fuente: "reporte",
    };
  }

  const overrideId = row.override_project_id != null ? Number(row.override_project_id) : null;
  if (overrideId) {
    return {
      id: overrideId,
      titulo: row.override_project_title || "Iniciativa",
      tipo: row.override_project_type || "proyecto",
      fuente: "excepcion",
    };
  }

  const text = `${row.entregable_effective || row.entregable || ""} ${
    row.categoria_raw || row.categoria || ""
  } ${row.fase_raw || row.fase || ""}`.toLowerCase();

  const candidatesByType = (tipo) => initiatives.filter((item) => item.tipo === tipo);
  let tipo = null;
  let ordinal = null;

  ordinal = extractOrdinal(text, /proyecto\s*(?:n[.º°o]?\s*)?(\d+)/i);
  if (ordinal || /\bproyecto(s)?\b/i.test(text)) tipo = "proyecto";

  if (!tipo) {
    ordinal = extractOrdinal(text, /actividad\s*(?:n[.º°o]?\s*)?(\d+)/i);
    if (ordinal || /\bactividad(es)?\b/i.test(text)) tipo = "actividad";
  }

  if (!tipo) {
    ordinal = extractOrdinal(text, /convenio\s*(?:n[.º°o]?\s*)?(\d+)/i);
    if (ordinal || /\bconvenio(s)?\b/i.test(text)) tipo = "convenio";
  }

  if (!tipo && /capacitaci[oó]n|socializaci[oó]n|tutorial|pol[ií]tica/i.test(text)) {
    tipo = "capacitacion";
  }

  if (tipo) {
    const candidates = candidatesByType(tipo);
    const selected = ordinal ? candidates[ordinal - 1] : candidates.length === 1 ? candidates[0] : null;
    if (selected) return { ...selected, fuente: "inferida" };
    if (candidates.length > 1) {
      const plural =
        tipo === "proyecto"
          ? "Todos los proyectos asignados"
          : tipo === "actividad"
          ? "Todas las actividades asignadas"
          : tipo === "convenio"
          ? "Todos los convenios asignados"
          : "Capacitación general";
      return { id: null, titulo: plural, tipo, fuente: "general" };
    }
  }

  return {
    id: null,
    titulo: "Gestión general del semestre",
    tipo: "general",
    fuente: "general",
  };
}

export function mapMatrixRows(rows, initiatives, mapCategorySlug) {
  return (rows || []).map((row) => {
    const initiative = inferInitiative(row, initiatives);
    return {
      id: Number(row.id),
      numero: row.numero != null ? Number(row.numero) : 0,
      categoria: mapCategorySlug(row.categoria_raw, row.fase_raw),
      fase: row.fase_raw ? String(row.fase_raw).trim() : "",
      mes: String(row.mes || "").trim(),
      semana_numero: row.semana_numero != null ? Number(row.semana_numero) : 0,
      semestre_fecha_inicio: toDateOnlyISO(row.semestre_fecha_inicio),
      entregable: row.entregable_effective || row.entregable || "",
      descripcion_evidencia:
        row.descripcion_evidencia_effective ?? row.descripcion_evidencia ?? "",
      enlace_referencia: row.enlace_referencia_effective || null,
      horas: row.horas_effective != null ? Number(row.horas_effective) : 0,
      fecha_inicio_calculada: toDateOnlyISO(row.fecha_inicio_calculada),
      fecha_fin_calculada: toDateOnlyISO(row.fecha_fin_calculada),
      entregable_id: row.entregable_id != null ? Number(row.entregable_id) : null,
      completado: Boolean(row.completado),
      fecha_real_entrega: toDateOnlyISO(row.fecha_real_entrega),
      fecha_cargue_evidencia: toTimestampISO(row.fecha_cargue_evidencia),
      url_evidencia: row.url_evidencia || null,
      estado_revision: row.estado_revision || null,
      comentario_revision: row.comentario_revision || null,
      porcentaje_avance:
        row.porcentaje_avance != null ? Number(row.porcentaje_avance) : null,
      actividad_reportada: row.actividad_reportada || null,
      iniciativa_id: initiative.id,
      iniciativa_titulo: initiative.titulo,
      iniciativa_tipo: initiative.tipo,
      iniciativa_fuente: initiative.fuente,
      tiene_excepcion: row.exception_id != null,
      excepcion_id: row.exception_id != null ? Number(row.exception_id) : null,
      motivo_excepcion: row.exception_reason || null,
      proyecto_override_id:
        row.override_project_id != null ? Number(row.override_project_id) : null,
    };
  });
}

export function buildMatrixStats(items) {
  const rows = items || [];
  const total = rows.length;
  const completados = rows.filter((row) => row.completado).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = rows.filter((row) => {
    if (!row.fecha_fin_calculada) return false;
    const deadline = new Date(`${row.fecha_fin_calculada}T23:59:59`);
    return deadline <= today;
  });
  const exigibles = due.length;
  const completadosExigibles = due.filter((row) => row.completado).length;
  const porcentajeReal = total > 0 ? round1((completados / total) * 100) : 0;
  const porcentajeEsperado = total > 0 ? round1((exigibles / total) * 100) : 0;
  const cumplimientoEsperado =
    exigibles > 0 ? round1((completados / exigibles) * 100) : completados > 0 ? 100 : 100;

  const monthLabels = [
    ...new Set(rows.map((row) => String(row.mes || "").trim()).filter(Boolean)),
  ];
  const por_mes = monthLabels.map((label) => {
    const sub = rows.filter((row) => String(row.mes || "").trim() === label);
    const monthTotal = sub.length;
    const monthCompleted = sub.filter((row) => row.completado).length;
    const monthDue = sub.filter((row) => {
      if (!row.fecha_fin_calculada) return false;
      return new Date(`${row.fecha_fin_calculada}T23:59:59`) <= today;
    }).length;
    return {
      mes: label,
      total: monthTotal,
      completados: monthCompleted,
      exigibles_a_fecha: monthDue,
      porcentaje_mensual:
        monthTotal > 0 ? round1((monthCompleted / monthTotal) * 100) : 0,
      porcentaje_esperado:
        monthTotal > 0 ? round1((monthDue / monthTotal) * 100) : 0,
    };
  });

  const weekNums = [
    ...new Set(rows.map((row) => Number(row.semana_numero)).filter(Boolean)),
  ].sort((a, b) => a - b);
  const por_semana = weekNums.map((week) => {
    const sub = rows.filter((row) => Number(row.semana_numero) === week);
    const weekTotal = sub.length;
    const weekCompleted = sub.filter((row) => row.completado).length;
    const semesterStart = rows.find((row) => row.semestre_fecha_inicio)
      ?.semestre_fecha_inicio;
    let cumulativeExpected;
    let accumulatedCompleted;
    if (semesterStart) {
      const threshold = new Date(`${semesterStart}T23:59:59`);
      threshold.setDate(threshold.getDate() + week * 7 - 1);
      cumulativeExpected = rows.filter((row) => {
        if (!row.fecha_fin_calculada) return false;
        return new Date(`${row.fecha_fin_calculada}T23:59:59`) <= threshold;
      });
      accumulatedCompleted = rows.filter((row) => {
        if (!row.completado) return false;
        if (!row.fecha_cargue_evidencia) return true;
        return new Date(row.fecha_cargue_evidencia) <= threshold;
      }).length;
    } else {
      cumulativeExpected = rows.filter(
        (row) => Number(row.semana_numero) <= week
      );
      accumulatedCompleted = cumulativeExpected.filter(
        (row) => row.completado
      ).length;
    }
    return {
      semana_numero: week,
      mes: String(sub[0]?.mes || "").trim(),
      total: weekTotal,
      completados: weekCompleted,
      porcentaje_semanal:
        weekTotal > 0 ? round1((weekCompleted / weekTotal) * 100) : 0,
      porcentaje_acumulado:
        total > 0 ? round1((accumulatedCompleted / total) * 100) : 0,
      porcentaje_esperado_acumulado:
        total > 0 ? round1((cumulativeExpected.length / total) * 100) : 0,
    };
  });

  return {
    resumen: {
      total_entregables: total,
      completados,
      exigibles_a_fecha: exigibles,
      completados_exigibles: completadosExigibles,
      porcentaje_semestral: porcentajeReal,
      porcentaje_real: porcentajeReal,
      porcentaje_esperado: porcentajeEsperado,
      cumplimiento_esperado: cumplimientoEsperado,
      brecha: round1(porcentajeReal - porcentajeEsperado),
    },
    por_mes,
    por_semana,
  };
}

export async function resolveInitiativeForTemplate(
  docenteId,
  templateRow,
  db = pool
) {
  const initiatives = await loadAssignedInitiatives(docenteId, db);
  const mapped = inferInitiative(templateRow, initiatives);
  if (mapped.id) return mapped;

  // El reporte necesita una iniciativa concreta por la FK histórica. Para un
  // entregable transversal se usa la primera iniciativa asignada, manteniendo
  // en la interfaz la etiqueta "Gestión general del semestre".
  return initiatives[0] ? { ...initiatives[0], fuente: "soporte_general" } : mapped;
}
