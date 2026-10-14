// Seguimiento de Proyección Social: lectura de la matriz, indicadores, estados,
// evidencias y asociación con iniciativas. Única fuente de verdad: todas las
// rutas (docente y admin) calculan a través de este módulo.
//
//  - Funciones puras (fechas, estados, indicadores, evidencias, transiciones): sin BD.
//  - Cargadores (loadMatrixItems / loadMatrixForDocentes): leen la matriz con el
//    calendario real del semestre (tabla `semestres`); nunca se asume una fecha.
import { pool } from "../db.js";

export const ZONA_HORARIA = "America/Bogota";
export const ESTADOS = ["no_iniciado", "borrador", "enviado", "observado", "aprobado"];

// Umbrales del semáforo de riesgo (cumplimiento reportado sobre lo exigible).
export const SEMAFORO_UMBRALES = Object.freeze({ verde: 80, amarillo: 50 });

export const round1 = (value) => Math.round(Number(value) * 10) / 10;
const pct = (n, d) => (d > 0 ? round1((n / d) * 100) : 0);

/** Error de negocio con código HTTP y código estable para el cliente. */
export class ErrorNegocio extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export function responderError(res, error, contexto) {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ error: error.message, codigo: error.codigo, ...error.extra });
  }
  console.error(contexto, error);
  return res.status(500).json({ error: "Error interno" });
}

// ───────────────────────── Fechas ─────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha civil (YYYY-MM-DD) de un instante en America/Bogota. */
export function fechaBogota(instante = new Date()) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const hoyBogota = (ahora = new Date()) => fechaBogota(ahora);

/**
 * Normaliza una columna DATE a YYYY-MM-DD. node-pg entrega los DATE como Date a
 * medianoche *local*, por eso se usan los componentes locales (toISOString
 * desplazaría el día según la zona del servidor).
 */
export function fechaDesdeColumnaDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${mm}-${dd}`;
  }
  return null;
}

/** Compatibilidad: fecha de calendario (DATE) como YYYY-MM-DD. */
export const toDateOnlyISO = fechaDesdeColumnaDate;

/** Instante (timestamptz) como ISO UTC. */
export const toTimestampISO = (value) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const aUTC = (iso) => {
  const m = ISO_RE.exec(iso || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function sumarDias(iso, dias) {
  const t = aUTC(iso);
  return t == null ? null : new Date(t + dias * DIA_MS).toISOString().slice(0, 10);
}

export function diferenciaDias(desdeIso, hastaIso) {
  const a = aUTC(desdeIso);
  const b = aUTC(hastaIso);
  return a == null || b == null ? null : Math.round((b - a) / DIA_MS);
}

export function esFechaISO(valor) {
  const t = aUTC(valor);
  return t != null && new Date(t).toISOString().slice(0, 10) === valor; // rechaza 2026-02-31
}

export const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Nombre del mes de una fecha YYYY-MM-DD (independiente de la configuración regional). */
export function mesDeFecha(iso) {
  const m = ISO_RE.exec(iso || "");
  return m ? NOMBRES_MES[Number(m[2]) - 1] : "";
}

// ───────────────────────── Calendario institucional (tabla semestres) ─────────────────────────

/**
 * Calendario de un semestre a partir de una fila de `semestres`
 * ({ codigo, fecha_inicio, fecha_fin, numero_semanas }). Devuelve null si el
 * semestre no está configurado: NO se sustituye por una fecha por defecto.
 */
export function normalizarCalendario(fila) {
  const inicio = fechaDesdeColumnaDate(fila?.fecha_inicio);
  const semanas = Number(fila?.numero_semanas);
  if (!inicio || !Number.isInteger(semanas) || semanas <= 0) return null;
  return {
    semestre: fila.codigo ?? null,
    fecha_inicio: inicio,
    fecha_fin: fechaDesdeColumnaDate(fila.fecha_fin) ?? sumarDias(inicio, semanas * 7 - 1),
    num_semanas: semanas,
  };
}

/** Semana académica vigente. `estado`: sin_calendario | sin_iniciar | en_curso | finalizado. */
export function semanaActual(calendario, hoy = hoyBogota()) {
  if (!calendario) {
    return {
      semestre: null,
      hoy,
      zona_horaria: ZONA_HORARIA,
      numero: null,
      total_semanas: null,
      estado: "sin_calendario",
      advertencia: "El semestre no tiene calendario configurado (tabla semestres).",
    };
  }
  const total = calendario.num_semanas;
  const base = {
    semestre: calendario.semestre,
    hoy,
    zona_horaria: ZONA_HORARIA,
    total_semanas: total,
    fecha_inicio_semestre: calendario.fecha_inicio,
    fecha_fin_semestre: calendario.fecha_fin,
  };
  const dias = diferenciaDias(calendario.fecha_inicio, hoy);
  if (dias == null) return { ...base, numero: null, estado: "sin_calendario" };
  if (dias < 0) return { ...base, numero: null, estado: "sin_iniciar", dias_para_inicio: -dias };
  const n = Math.floor(dias / 7) + 1;
  if (n > total) return { ...base, numero: null, estado: "finalizado" };
  const inicio = sumarDias(calendario.fecha_inicio, (n - 1) * 7);
  return { ...base, numero: n, estado: "en_curso", fecha_inicio_semana: inicio, fecha_fin_semana: sumarDias(inicio, 6) };
}

// ───────────────────────── Categorías / iniciativas ─────────────────────────

export function categoriaSlug(categoria, fase) {
  const text = `${categoria || ""} ${fase || ""}`.toLowerCase();
  if (text.includes("capacit")) return "capacitacion";
  if (text.includes("conveni")) {
    if (text.includes("nuevo")) return "convenio_nuevo";
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
}

/** Tipo de `proyectos.tipo` que corresponde a una categoría de plantilla (null = cualquiera). */
export function tipoIniciativaDeCategoria(slug) {
  if (slug === "proyecto") return "proyecto";
  if (slug.startsWith("actividad")) return "actividad";
  if (slug.startsWith("convenio")) return "convenio";
  if (slug === "capacitacion") return "capacitacion";
  return null;
}

// ───────────────────────── Estados ─────────────────────────

const tieneContenido = (it) =>
  Boolean(it.url_evidencia || it.actividad_reportada || it.descripcion_reporte || it.evidencia_exenta);

/**
 * Estado de revisión efectivo: no_iniciado | borrador | enviado | observado | aprobado.
 * "Vencido" NO es un estado, es una condición calculada (estaVencido). Un `completado`
 * sin estado de revisión válido no cuenta como envío.
 */
export function estadoEfectivo(item) {
  if (!item || item.entregable_id == null) return "no_iniciado";
  const rev = item.estado_revision;
  if (rev === "aprobado") return "aprobado";
  if (rev === "observado") return "observado";
  if (rev === "borrador") return "borrador";
  if (item.completado === true) return "enviado";
  // Filas históricas: estado_revision tomó el DEFAULT 'enviado' sin que se enviara nada.
  return tieneContenido(item) ? "borrador" : "no_iniciado";
}

/** Vencido: pasó la fecha límite y el docente aún debe una acción (no iniciado, borrador u observado). */
export function estaVencido(item, estado, hoy) {
  if (!item.fecha_fin || !hoy) return false;
  if (!(estado === "no_iniciado" || estado === "borrador" || estado === "observado")) return false;
  return item.fecha_fin < hoy;
}

/** Exigible: la fecha límite es hoy o anterior (el día de vencimiento es exigible pero aún no vencido). */
export function esExigible(item, hoy) {
  return Boolean(item.fecha_fin && hoy && item.fecha_fin <= hoy);
}

export function clasificarItem(item, hoy) {
  const estado = estadoEfectivo(item);
  const fechaPrimerEnvio = item.fecha_primer_envio ? fechaBogota(item.fecha_primer_envio) : null;
  return {
    estado,
    reportado: estado === "enviado" || estado === "aprobado",
    aprobado: estado === "aprobado",
    vencido: estaVencido(item, estado, hoy),
    exigible: esExigible(item, hoy),
    entrega_tardia: Boolean(fechaPrimerEnvio && item.fecha_fin && fechaPrimerEnvio > item.fecha_fin),
    requiere_accion_docente: estado === "no_iniciado" || estado === "borrador" || estado === "observado",
  };
}

// ───────────────────────── Indicadores ─────────────────────────

export function semaforoRiesgo(m) {
  if (m.total === 0) return "sin_datos";
  if (m.exigibles === 0) return "sin_exigibles";
  const c = m.cumplimiento_reportado_exigible;
  if (c >= SEMAFORO_UMBRALES.verde) return "verde";
  if (c >= SEMAFORO_UMBRALES.amarillo) return "amarillo";
  return "rojo";
}

/**
 * Indicadores de un conjunto de ítems ya clasificados (cálculo único para todas las pantallas).
 *  reportado = enviado + aprobado · aprobado = solo aprobado · esperado = exigibles (fecha límite <= hoy)
 *  brecha = aprobados − esperado (negativa = atraso) · cumplimiento_exigible = % de exigibles aprobados
 */
export function calcularMetricas(items, hoy = hoyBogota()) {
  const c = {
    total: 0, reportados: 0, aprobados: 0, enviados_pendientes_revision: 0, observados: 0,
    borradores: 0, no_iniciados: 0, vencidos: 0, exigibles: 0, exigibles_aprobados: 0, exigibles_reportados: 0,
    horas_programadas: 0, horas_reportadas: 0, horas_aprobadas: 0,
  };
  for (const it of items) {
    const k = it.clasificacion ?? clasificarItem(it, hoy);
    c.total += 1;
    const horas = Number(it.horas) || 0;
    c.horas_programadas += horas;
    if (k.reportado) {
      c.reportados += 1;
      c.horas_reportadas += horas;
    }
    if (k.aprobado) {
      c.aprobados += 1;
      c.horas_aprobadas += horas;
    }
    if (k.estado === "enviado") c.enviados_pendientes_revision += 1;
    if (k.estado === "observado") c.observados += 1;
    if (k.estado === "borrador") c.borradores += 1;
    if (k.estado === "no_iniciado") c.no_iniciados += 1;
    if (k.vencido) c.vencidos += 1;
    if (k.exigible) {
      c.exigibles += 1;
      if (k.aprobado) c.exigibles_aprobados += 1;
      if (k.reportado) c.exigibles_reportados += 1;
    }
  }
  for (const k of ["horas_programadas", "horas_reportadas", "horas_aprobadas"]) c[k] = round1(c[k]);
  const m = {
    ...c,
    esperado: c.exigibles,
    pct_reportado: pct(c.reportados, c.total),
    pct_aprobado: pct(c.aprobados, c.total),
    pct_esperado: pct(c.exigibles, c.total),
    brecha: c.aprobados - c.exigibles,
    cumplimiento_exigible: c.exigibles > 0 ? pct(c.exigibles_aprobados, c.exigibles) : null,
    cumplimiento_reportado_exigible: c.exigibles > 0 ? pct(c.exigibles_reportados, c.exigibles) : null,
  };
  m.brecha_pct = round1(m.pct_aprobado - m.pct_esperado);
  m.semaforo = semaforoRiesgo(m);
  return m;
}

/** Resumen listo para la API: conserva las claves históricas de `main` y agrega las nuevas. */
export function resumenParaApi(m) {
  return {
    ...m,
    total_entregables: m.total,
    completados: m.reportados, // alias histórico = reportados
    exigibles_a_fecha: m.exigibles,
    completados_exigibles: m.exigibles_reportados,
    porcentaje_semestral: m.pct_reportado,
    porcentaje_real: m.pct_reportado,
    porcentaje_esperado: m.pct_esperado,
    cumplimiento_esperado: m.cumplimiento_reportado_exigible ?? 100,
    brecha_entregables: m.brecha,
    brecha: m.brecha_pct, // puntos porcentuales: aprobado − esperado
  };
}

const MESES_ORDEN = ["febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre", "enero"];
export function etiquetaMes(mes) {
  const k = String(mes || "").trim().toLowerCase();
  return MESES_ORDEN.includes(k) ? k.charAt(0).toUpperCase() + k.slice(1) : String(mes || "").trim();
}

function metricasPorMes(items, hoy) {
  const grupos = new Map();
  for (const it of items) {
    const label = etiquetaMes(it.mes);
    if (!label) continue;
    if (!grupos.has(label)) grupos.set(label, []);
    grupos.get(label).push(it);
  }
  const minSemana = (l) => Math.min(...grupos.get(l).map((i) => Number(i.semana_numero) || 1e9));
  return [...grupos.keys()]
    .sort((a, b) => minSemana(a) - minSemana(b))
    .map((mes) => {
      const m = calcularMetricas(grupos.get(mes), hoy);
      return {
        mes,
        total: m.total,
        completados: m.reportados, // alias histórico
        reportados: m.reportados,
        aprobados: m.aprobados,
        observados: m.observados,
        vencidos: m.vencidos,
        exigibles_a_fecha: m.exigibles,
        porcentaje_mensual: m.pct_reportado, // alias histórico
        porcentaje_esperado: m.pct_esperado,
        pct_reportado: m.pct_reportado,
        pct_aprobado: m.pct_aprobado,
        pct_esperado: m.pct_esperado,
      };
    });
}

function metricasPorSemana(items, hoy, calendario) {
  const total = items.length;
  const semanas = [...new Set(items.map((i) => Number(i.semana_numero)).filter(Boolean))].sort((a, b) => a - b);
  return semanas.map((w) => {
    const sub = items.filter((i) => Number(i.semana_numero) === w);
    const m = calcularMetricas(sub, hoy);
    // Acumulado "a la fecha de cierre de la semana w": por fechas reales si hay calendario.
    const corte = calendario ? sumarDias(calendario.fecha_inicio, w * 7 - 1) : null;
    const esperados = corte
      ? items.filter((i) => i.fecha_fin && i.fecha_fin <= corte)
      : items.filter((i) => Number(i.semana_numero) <= w);
    const antes = (instante) => !corte || !instante || fechaBogota(instante) <= corte;
    const acumReportados = items.filter((i) => i.clasificacion.reportado && antes(i.fecha_primer_envio)).length;
    const acumAprobados = items.filter((i) => i.clasificacion.aprobado && antes(i.aprobado_en ?? i.revisado_en)).length;
    return {
      semana_numero: w,
      mes: etiquetaMes(sub[0]?.mes) || null,
      total: m.total,
      completados: m.reportados, // alias histórico
      reportados: m.reportados,
      aprobados: m.aprobados,
      porcentaje_semanal: m.pct_reportado,
      porcentaje_acumulado: pct(acumReportados, total), // alias histórico (reportado)
      porcentaje_esperado_acumulado: pct(esperados.length, total),
      acumulado_reportado_pct: pct(acumReportados, total),
      acumulado_aprobado_pct: pct(acumAprobados, total),
      acumulado_esperado_pct: pct(esperados.length, total),
    };
  });
}

/** Estadísticas agregadas de la matriz (mismas reglas en docente, admin y consolidado). */
export function buildMatrixStats(items, { hoy = hoyBogota(), calendario = null } = {}) {
  const rows = items || [];
  const m = calcularMetricas(rows, hoy);
  return {
    resumen: resumenParaApi(m),
    por_mes: metricasPorMes(rows, hoy),
    por_semana: metricasPorSemana(rows, hoy, calendario),
    semana_actual: semanaActual(calendario, hoy),
    hoy,
  };
}

// ───────────────────────── Evidencias ─────────────────────────

export const TIPOS_EVIDENCIA = ["drive", "formulario", "enlace", "ninguna"];
export const MIN_JUSTIFICACION = 10;

const HOSTS_DRIVE = ["drive.google.com", "docs.google.com", "drive.usercontent.google.com"];
const hostEs = (host, lista) => lista.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * Qué evidencia exige una plantilla. Sin configuración explícita se infiere del
 * texto histórico, de forma permisiva: no se obliga a todos al mismo formato.
 */
export function resolverRequisitoEvidencia({ tipo_evidencia, requiere_evidencia, descripcion_evidencia } = {}) {
  if (requiere_evidencia === false || tipo_evidencia === "ninguna") return { requiere: false, tipo: "ninguna" };
  if (TIPOS_EVIDENCIA.includes(tipo_evidencia)) return { requiere: true, tipo: tipo_evidencia };
  if (/no implica realizar cargue/i.test(descripcion_evidencia || "")) return { requiere: false, tipo: "ninguna" };
  return { requiere: true, tipo: "enlace" };
}

/** url_evidencia se guarda como URL simple (histórico) o como JSON de varias URLs. */
export function parseEvidencias(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((u) => String(u || "").trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((u) => String(u || "").trim()).filter(Boolean);
    } catch {
      /* se trata como texto */
    }
  }
  return s.split(/\s+/).filter(Boolean);
}

export function validarUrlEvidencia(valor, tipo = "enlace") {
  let u;
  try {
    u = new URL(valor);
  } catch {
    return `"${valor}" no es un enlace válido`;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return `"${valor}" debe iniciar con http:// o https://`;
  const host = u.hostname.toLowerCase();
  if (tipo === "drive" && !hostEs(host, HOSTS_DRIVE)) {
    return `Este entregable requiere un enlace de Google Drive (${valor})`;
  }
  if (tipo === "formulario") {
    const esForm =
      hostEs(host, ["forms.gle", "forms.office.com", "zohopublic.com", "zoho.com", "forms.google.com"]) ||
      (host === "docs.google.com" && u.pathname.startsWith("/forms"));
    if (!esForm) return `Este entregable requiere el enlace de un formulario institucional (${valor})`;
  }
  return null;
}

/** ¿Puede enviarse? `exencion` = justificación escrita cuando la evidencia no aplica (la revisa el administrador). */
export function validarEnvio({ requisito, evidencias = [], exencion = null }) {
  if (!requisito.requiere) return { ok: true, exenta: false };
  const justificacion = String(exencion ?? "").trim();
  if (evidencias.length === 0) {
    if (justificacion.length >= MIN_JUSTIFICACION) return { ok: true, exenta: true, justificacion };
    return {
      ok: false,
      codigo: "EVIDENCIA_REQUERIDA",
      error:
        justificacion.length > 0
          ? `La justificación debe tener al menos ${MIN_JUSTIFICACION} caracteres`
          : "Este entregable requiere evidencia (enlace) o una justificación de excepción",
    };
  }
  for (const url of evidencias) {
    const err = validarUrlEvidencia(url, requisito.tipo);
    if (err) return { ok: false, codigo: "EVIDENCIA_INVALIDA", error: err };
  }
  return { ok: true, exenta: false };
}

// ───────────────────────── Transiciones ─────────────────────────

const bloqueado = {
  ok: false,
  codigo: "ESTADO_BLOQUEADO",
  error: "El entregable ya fue aprobado y no puede modificarse sin un procedimiento administrativo de reapertura",
};

/** Acciones del docente: 'guardar_borrador' | 'enviar' | 'retirar'. */
export function transicionDocente(estadoActual, accion) {
  if (estadoActual === "aprobado") return bloqueado;
  switch (accion) {
    case "guardar_borrador":
      if (estadoActual === "observado") return { ok: true, estado: "observado", evento: null };
      return { ok: true, estado: "borrador", evento: estadoActual === "enviado" ? "retiro" : null };
    case "enviar":
      if (estadoActual === "enviado") return { ok: true, estado: "enviado", evento: null, sinCambios: true };
      return { ok: true, estado: "enviado", evento: estadoActual === "observado" ? "reenvio" : "envio" };
    case "retirar":
      if (estadoActual === "enviado") return { ok: true, estado: "borrador", evento: "retiro" };
      if (estadoActual === "observado") {
        return { ok: false, codigo: "ESTADO_INVALIDO", error: "Un entregable observado se corrige y se reenvía; no puede retirarse" };
      }
      return { ok: true, estado: estadoActual, evento: null, sinCambios: true };
    default:
      return { ok: false, codigo: "ACCION_INVALIDA", error: `Acción no soportada: ${accion}` };
  }
}

/** Decisiones del administrador: 'aprobado' | 'observado'. */
export function transicionAdmin(estadoActual, estadoNuevo, { comentario = "" } = {}) {
  if (!["aprobado", "observado"].includes(estadoNuevo)) {
    return { ok: false, codigo: "ESTADO_INVALIDO", error: "estado_revision debe ser aprobado u observado" };
  }
  if (estadoNuevo === "observado" && !String(comentario).trim()) {
    return { ok: false, codigo: "COMENTARIO_REQUERIDO", error: "Debes ingresar un comentario para estado observado" };
  }
  if (estadoActual === "aprobado") {
    if (estadoNuevo === "aprobado") return { ok: true, estado: "aprobado", evento: null, sinCambios: true };
    return {
      ok: false,
      codigo: "ESTADO_BLOQUEADO",
      error: "El reporte ya fue aprobado y no puede cambiarse de estado; usa el procedimiento de reapertura",
    };
  }
  if (estadoActual === "no_iniciado" || estadoActual === "borrador") {
    return { ok: false, codigo: "NO_ENVIADO", error: "El docente aún no ha enviado este entregable para revisión" };
  }
  return { ok: true, estado: estadoNuevo, evento: estadoNuevo === "aprobado" ? "aprobacion" : "observacion" };
}

/** Reapertura controlada de un aprobado: requiere motivo y un administrador identificado. */
export function transicionReapertura(estadoActual, { motivo = "", destino = "enviado" } = {}) {
  if (estadoActual !== "aprobado") {
    return { ok: false, codigo: "ESTADO_INVALIDO", error: "Solo se pueden reabrir entregables aprobados" };
  }
  if (!["enviado", "observado"].includes(destino)) {
    return { ok: false, codigo: "ESTADO_INVALIDO", error: "destino debe ser enviado u observado" };
  }
  if (String(motivo).trim().length < MIN_JUSTIFICACION) {
    return { ok: false, codigo: "MOTIVO_REQUERIDO", error: `El motivo de reapertura debe tener al menos ${MIN_JUSTIFICACION} caracteres` };
  }
  return { ok: true, estado: destino, evento: "reapertura" };
}

// ───────────────────────── Iniciativas ─────────────────────────

/** Iniciativas asignadas a varios docentes de una vez: Map(docenteId -> iniciativas[]). */
export async function loadAssignedInitiativesMap(docenteIds, db = pool) {
  const ids = [...new Set((docenteIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const map = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return map;
  const result = await db.query(
    `
    SELECT DISTINCT a.docente_id, p.id, p.titulo, p.tipo, p.fecha_inicio
    FROM (
      SELECT id AS proyecto_id, docente_responsable_id AS docente_id FROM proyectos
      UNION
      SELECT proyecto_id, docente_id FROM proyecto_docentes
    ) a
    INNER JOIN proyectos p ON p.id = a.proyecto_id
    WHERE a.docente_id = ANY($1::int[])
    ORDER BY a.docente_id, p.tipo, p.fecha_inicio, p.id
    `,
    [ids]
  );
  for (const row of result.rows || []) {
    map.get(Number(row.docente_id))?.push({
      id: Number(row.id),
      titulo: String(row.titulo || "").trim() || "Iniciativa sin nombre",
      tipo: row.tipo || "proyecto",
      fecha_inicio: toDateOnlyISO(row.fecha_inicio),
    });
  }
  return map;
}

export async function loadAssignedInitiatives(docenteId, db = pool) {
  return (await loadAssignedInitiativesMap([docenteId], db)).get(Number(docenteId)) ?? [];
}

const extractOrdinal = (text, expression) => {
  const match = text.match(expression);
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
};

/**
 * Iniciativa de una fila de matriz. Prioridad: 1) iniciativa donde ya está el reporte (id de BD),
 * 2) excepción individual del docente (id de BD), 3) inferencia por texto (solo compatibilidad).
 */
function inferInitiative(row, initiatives) {
  if (row.entregable_id != null && row.report_transversal === true) {
    // Reporte transversal: el vínculo con una iniciativa es solo de soporte, no se muestra como proyecto.
    return { id: null, titulo: "Gestión general del semestre", tipo: "general", fuente: "transversal" };
  }
  const reportId = row.report_project_id != null ? Number(row.report_project_id) : null;
  if (reportId) {
    return { id: reportId, titulo: row.report_project_title || "Iniciativa", tipo: row.report_project_type || "proyecto", fuente: "reporte" };
  }
  const overrideId = row.override_project_id != null ? Number(row.override_project_id) : null;
  if (overrideId) {
    return { id: overrideId, titulo: row.override_project_title || "Iniciativa", tipo: row.override_project_type || "proyecto", fuente: "excepcion" };
  }

  const text = `${row.entregable_effective || row.entregable || ""} ${row.categoria_raw || row.categoria || ""} ${row.fase_raw || row.fase || ""}`.toLowerCase();
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
  if (!tipo && /capacitaci[oó]n|socializaci[oó]n|tutorial|pol[ií]tica/i.test(text)) tipo = "capacitacion";

  if (tipo) {
    const candidates = candidatesByType(tipo);
    const selected = ordinal ? candidates[ordinal - 1] : candidates.length === 1 ? candidates[0] : null;
    if (selected) return { ...selected, fuente: "inferida" };
    if (candidates.length > 1) {
      const plural =
        tipo === "proyecto" ? "Todos los proyectos asignados"
        : tipo === "actividad" ? "Todas las actividades asignadas"
        : tipo === "convenio" ? "Todos los convenios asignados"
        : "Capacitación general";
      return { id: null, titulo: plural, tipo, fuente: "general" };
    }
  }
  return { id: null, titulo: "Gestión general del semestre", tipo: "general", fuente: "general" };
}

/**
 * Iniciativa donde se registra un entregable nuevo. Nunca adivina entre varias del mismo tipo:
 * responde 409 INICIATIVA_AMBIGUA con los candidatos (el cliente reintenta con `proyectoId`).
 */
export async function resolveInitiativeForTemplate(docenteId, templateRow, db = pool, { proyectoId = null } = {}) {
  const initiatives = await loadAssignedInitiatives(docenteId, db);
  if (proyectoId != null) {
    const elegida = initiatives.find((i) => i.id === Number(proyectoId));
    if (!elegida) {
      throw new ErrorNegocio(422, "INICIATIVA_INVALIDA", "La iniciativa indicada no te pertenece");
    }
    return { ...elegida, fuente: "explicita" };
  }
  const mapped = inferInitiative(templateRow, initiatives);
  if (mapped.id) return mapped;
  if (mapped.tipo && mapped.tipo !== "general") {
    const candidatos = initiatives.filter((i) => i.tipo === mapped.tipo);
    if (candidatos.length > 1) {
      throw new ErrorNegocio(
        409,
        "INICIATIVA_AMBIGUA",
        "Tienes varias iniciativas para este entregable; indica a cuál corresponde (proyecto_id)",
        { candidatos: candidatos.map((c) => ({ id: c.id, titulo: c.titulo, tipo: c.tipo })) }
      );
    }
  }
  // Entregable transversal (capacitación, presupuesto…): el reporte necesita una iniciativa por la FK histórica.
  return initiatives[0] ? { ...initiatives[0], fuente: "soporte_general" } : mapped;
}

// ───────────────────────── Carga de la matriz ─────────────────────────

const SQL_MATRIZ = `
  SELECT
    u.id AS docente_id, u.nombre AS docente_nombre, u.apellido AS docente_apellido,
    u.programa_id, pr.nombre AS programa, u.regional, u.grupo_matriz_id AS grupo_id,
    gm.nombre AS grupo_nombre, COALESCE(u.tipo_docente, 'ANTIGUO') AS tipo_docente,
    gm.semestre AS semestre_codigo,
    sem.fecha_inicio AS semestre_fecha_inicio, sem.fecha_fin AS semestre_fecha_fin,
    sem.numero_semanas AS semestre_numero_semanas,
    tpl.id, tpl.numero, tpl.categoria AS categoria_raw, tpl.fase AS fase_raw, tpl.mes, tpl.semana_numero,
    tpl.entregable, tpl.descripcion_evidencia, tpl.tipo_evidencia, tpl.requiere_evidencia,
    COALESCE(dex.entregable_override, tpl.entregable) AS entregable_effective,
    COALESCE(dex.descripcion_evidencia_override, tpl.descripcion_evidencia) AS descripcion_evidencia_effective,
    COALESCE(dex.enlace_referencia_override, tpl.enlace_referencia) AS enlace_referencia_effective,
    COALESCE(pe.horas, tpl.horas) AS horas_effective,
    COALESCE(dex.fecha_inicio_override,
      CASE WHEN sem.fecha_inicio IS NOT NULL AND tpl.dias_inicio_desde_feb IS NOT NULL
           THEN (sem.fecha_inicio + tpl.dias_inicio_desde_feb * INTERVAL '1 day')::date END) AS fecha_inicio_calculada,
    COALESCE(dex.fecha_fin_override,
      CASE WHEN sem.fecha_inicio IS NOT NULL AND tpl.dias_fin_desde_feb IS NOT NULL
           THEN (sem.fecha_inicio + tpl.dias_fin_desde_feb * INTERVAL '1 day')::date END) AS fecha_fin_calculada,
    dex.id AS exception_id, dex.motivo AS exception_reason,
    dex.proyecto_id AS override_project_id, p_override.titulo AS override_project_title, p_override.tipo AS override_project_type,
    pe.proyecto_id AS report_project_id, pe.proyecto_titulo AS report_project_title, pe.proyecto_tipo AS report_project_type,
    pe.id AS entregable_id, COALESCE(pe.completado, false) AS completado,
    pe.fecha_real_entrega, pe.fecha_cargue_evidencia, pe.fecha_primer_envio, pe.num_envios,
    pe.aprobado_en, pe.revisado_en, pe.url_evidencia, pe.estado_revision, pe.comentario_revision,
    pe.evidencia_exenta, pe.justificacion_exencion, pe.porcentaje_avance, pe.actividad_reportada, pe.descripcion_reporte,
    pe.transversal AS report_transversal
  FROM usuarios u
  LEFT JOIN programas pr ON pr.id = u.programa_id
  LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
  LEFT JOIN semestres sem ON sem.codigo = gm.semestre
  LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
  LEFT JOIN docente_entregable_excepciones dex ON dex.docente_id = u.id AND dex.plantilla_id = tpl.id
  LEFT JOIN proyectos p_override ON p_override.id = dex.proyecto_id
  LEFT JOIN LATERAL (
    SELECT e.id, e.completado, e.fecha_real_entrega, e.fecha_cargue_evidencia, e.fecha_primer_envio, e.num_envios,
           e.aprobado_en, e.revisado_en, e.url_evidencia, e.estado_revision, e.comentario_revision,
           e.evidencia_exenta, e.justificacion_exencion, e.porcentaje_avance, e.actividad_reportada,
           e.descripcion_reporte, e.horas, e.transversal,
           p.id AS proyecto_id, p.titulo AS proyecto_titulo, p.tipo AS proyecto_tipo
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
  WHERE u.rol = 'docente'
    AND ($1::int IS NULL OR u.id = $1)
    AND ($2::text IS NULL OR gm.semestre = $2)
    AND ($3::int IS NULL OR u.grupo_matriz_id = $3)
`;

/** Ítems de matriz ya clasificados. */
export function mapMatrixRows(rows, initiatives, mapCategorySlug = categoriaSlug, { hoy = hoyBogota() } = {}) {
  const items = (rows || []).map((row) => {
    const initiative = inferInitiative(row, initiatives);
    const item = {
      id: Number(row.id),
      plantilla_id: Number(row.id),
      numero: row.numero != null ? Number(row.numero) : 0,
      categoria: mapCategorySlug(row.categoria_raw, row.fase_raw),
      fase: row.fase_raw ? String(row.fase_raw).trim() : "",
      mes: etiquetaMes(row.mes),
      semana_numero: row.semana_numero != null ? Number(row.semana_numero) : 0,
      semestre_fecha_inicio: toDateOnlyISO(row.semestre_fecha_inicio),
      entregable: row.entregable_effective || row.entregable || "",
      descripcion_evidencia: row.descripcion_evidencia_effective ?? row.descripcion_evidencia ?? "",
      tipo_evidencia_config: row.tipo_evidencia ?? null,
      requiere_evidencia_config: row.requiere_evidencia ?? null,
      enlace_referencia: row.enlace_referencia_effective || null,
      horas: row.horas_effective != null ? Number(row.horas_effective) : 0,
      fecha_inicio_calculada: toDateOnlyISO(row.fecha_inicio_calculada),
      fecha_fin_calculada: toDateOnlyISO(row.fecha_fin_calculada),
      entregable_id: row.entregable_id != null ? Number(row.entregable_id) : null,
      fecha_real_entrega: toDateOnlyISO(row.fecha_real_entrega),
      fecha_cargue_evidencia: toTimestampISO(row.fecha_cargue_evidencia),
      fecha_primer_envio: toTimestampISO(row.fecha_primer_envio),
      num_envios: row.num_envios != null ? Number(row.num_envios) : 0,
      aprobado_en: toTimestampISO(row.aprobado_en),
      revisado_en: toTimestampISO(row.revisado_en),
      url_evidencia_raw: row.url_evidencia || null,
      estado_revision: row.estado_revision || null,
      comentario_revision: row.comentario_revision || null,
      evidencia_exenta: row.evidencia_exenta === true,
      justificacion_exencion: row.justificacion_exencion || null,
      porcentaje_avance: row.porcentaje_avance != null ? Number(row.porcentaje_avance) : null,
      actividad_reportada: row.actividad_reportada || null,
      iniciativa_id: initiative.id,
      iniciativa_titulo: initiative.titulo,
      iniciativa_tipo: initiative.tipo,
      iniciativa_fuente: initiative.fuente,
      tiene_excepcion: row.exception_id != null,
      excepcion_id: row.exception_id != null ? Number(row.exception_id) : null,
      motivo_excepcion: row.exception_reason || null,
      proyecto_override_id: row.override_project_id != null ? Number(row.override_project_id) : null,
    };
    item.fecha_fin = item.fecha_fin_calculada;
    item.clasificacion = clasificarItem(
      {
        entregable_id: item.entregable_id,
        completado: row.completado === true,
        estado_revision: item.estado_revision,
        url_evidencia: item.url_evidencia_raw,
        actividad_reportada: item.actividad_reportada,
        descripcion_reporte: row.descripcion_reporte || null,
        evidencia_exenta: item.evidencia_exenta,
        fecha_fin: item.fecha_fin,
        fecha_primer_envio: item.fecha_primer_envio,
      },
      hoy
    );
    return item;
  });
  // Orden de la matriz: fecha de inicio, fecha límite, número.
  const k = (v) => v || "9999-12-31";
  items.sort(
    (a, b) =>
      k(a.fecha_inicio_calculada).localeCompare(k(b.fecha_inicio_calculada)) ||
      k(a.fecha_fin_calculada).localeCompare(k(b.fecha_fin_calculada)) ||
      a.numero - b.numero
  );
  return items;
}

/** Representación pública (JSON de la API): claves históricas de `main` + estado/vencido/evidencia. */
export function itemParaApi(item) {
  const k = item.clasificacion;
  const requisito = resolverRequisitoEvidencia({
    tipo_evidencia: item.tipo_evidencia_config,
    requiere_evidencia: item.requiere_evidencia_config,
    descripcion_evidencia: item.descripcion_evidencia,
  });
  const evidencias = parseEvidencias(item.url_evidencia_raw);
  const {
    clasificacion, tipo_evidencia_config, requiere_evidencia_config, url_evidencia_raw, fecha_fin, ...publico
  } = item;
  return {
    ...publico,
    // `completado` histórico = el docente ya lo envió (en revisión o aprobado).
    completado: k.reportado,
    estado: k.estado,
    aprobado: k.aprobado,
    vencido: k.vencido,
    exigible: k.exigible,
    entrega_tardia: k.entrega_tardia,
    requiere_accion_docente: k.requiere_accion_docente,
    requiere_evidencia: requisito.requiere,
    tipo_evidencia: requisito.tipo,
    // url_evidencia = primer enlace (compatibilidad); evidencias = todos.
    url_evidencia: evidencias[0] || null,
    evidencias,
    fecha_primer_envio: item.fecha_primer_envio ? fechaBogota(item.fecha_primer_envio) : null,
  };
}

/**
 * Matriz de uno o varios docentes: [{ docente, calendario, items }].
 * Un docente sin grupo devuelve items vacíos; sin semestre configurado, calendario null
 * (las fechas quedan sin definir y la API lo advierte; nunca se asume una fecha).
 */
export async function loadMatrixForDocentes(db, { docenteId = null, semestre = null, grupoId = null, hoy = hoyBogota() } = {}) {
  const { rows } = await db.query(SQL_MATRIZ, [docenteId, semestre, grupoId]);
  const porDocente = new Map();
  for (const r of rows) {
    let entry = porDocente.get(r.docente_id);
    if (!entry) {
      entry = {
        docente: {
          id: Number(r.docente_id),
          nombre: [r.docente_nombre, r.docente_apellido].filter(Boolean).join(" ").trim(),
          programa_id: r.programa_id != null ? Number(r.programa_id) : null,
          programa: r.programa || null,
          regional: r.regional || null,
          grupo_id: r.grupo_id != null ? Number(r.grupo_id) : null,
          grupo_nombre: r.grupo_nombre || null,
          tipo_docente: r.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO",
          semestre: r.semestre_codigo || null,
        },
        calendario: normalizarCalendario(
          r.semestre_fecha_inicio
            ? { codigo: r.semestre_codigo, fecha_inicio: r.semestre_fecha_inicio, fecha_fin: r.semestre_fecha_fin, numero_semanas: r.semestre_numero_semanas }
            : null
        ),
        rows: [],
      };
      porDocente.set(r.docente_id, entry);
    }
    if (r.id != null) entry.rows.push(r);
  }
  const initiatives = await loadAssignedInitiativesMap([...porDocente.keys()], db);
  return [...porDocente.values()].map(({ rows: docRows, ...rest }) => ({
    ...rest,
    items: mapMatrixRows(docRows, initiatives.get(Number(rest.docente.id)) ?? [], categoriaSlug, { hoy }),
  }));
}

/** Compatibilidad: ítems de un solo docente. */
export async function loadMatrixItems(docenteId, db = pool, hoy = hoyBogota()) {
  const [entry] = await loadMatrixForDocentes(db, { docenteId, hoy });
  return entry?.items ?? [];
}
