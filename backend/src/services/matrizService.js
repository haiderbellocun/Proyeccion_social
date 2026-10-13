// Reglas de negocio del seguimiento de Proyección Social (sin acceso a BD).
// Única fuente de verdad para estados, fechas e indicadores: todas las rutas
// (docente y admin) deben calcular a través de estas funciones.

export const ZONA_HORARIA = "America/Bogota";

// Valor de respaldo mientras un semestre no tenga fila en calendario_semestres.
export const CALENDARIO_POR_DEFECTO = Object.freeze({
  fecha_inicio: "2026-02-10",
  num_semanas: 16,
});

export const ESTADOS = ["no_iniciado", "borrador", "enviado", "observado", "aprobado"];

// Umbrales del semáforo de riesgo (cumplimiento reportado sobre lo exigible).
export const SEMAFORO_UMBRALES = Object.freeze({ verde: 80, amarillo: 50 });

const DIA_MS = 24 * 60 * 60 * 1000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const round1 = (x) => Math.round(Number(x) * 10) / 10;
const pct = (n, d) => (d > 0 ? round1((n / d) * 100) : 0);

// ───────────────────────── Fechas ─────────────────────────

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
 * Normaliza un valor de columna DATE a YYYY-MM-DD.
 * node-pg entrega los DATE como Date a medianoche *local*; por eso se usan los
 * getters locales (toISOString desplazaría el día según la zona del servidor).
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

const aUTC = (iso) => {
  const m = ISO_RE.exec(iso || "");
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export function sumarDias(iso, dias) {
  const t = aUTC(iso);
  if (t == null) return null;
  return new Date(t + dias * DIA_MS).toISOString().slice(0, 10);
}

export function diferenciaDias(desdeIso, hastaIso) {
  const a = aUTC(desdeIso);
  const b = aUTC(hastaIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DIA_MS);
}

export function esFechaISO(valor) {
  const t = aUTC(valor);
  if (t == null) return false;
  return new Date(t).toISOString().slice(0, 10) === valor; // rechaza 2026-02-31
}

// ───────────────────────── Calendario ─────────────────────────

export function normalizarCalendario(fila, semestre = null) {
  const fechaInicio = fechaDesdeColumnaDate(fila?.fecha_inicio);
  const num = Number(fila?.num_semanas);
  if (fechaInicio && Number.isFinite(num) && num > 0) {
    return { semestre, fecha_inicio: fechaInicio, num_semanas: num, por_defecto: false };
  }
  return { semestre, ...CALENDARIO_POR_DEFECTO, por_defecto: true };
}

/** Fecha de inicio/fin de la semana n (1-based) del calendario. */
export function rangoSemana(calendario, n) {
  const inicio = sumarDias(calendario.fecha_inicio, (n - 1) * 7);
  return { inicio, fin: sumarDias(inicio, 6) };
}

/**
 * Semana académica vigente. No asume 16 semanas: usa calendario.num_semanas.
 * estado: 'sin_iniciar' | 'en_curso' | 'finalizado'
 */
export function semanaActual(calendario, hoy = hoyBogota()) {
  const total = calendario.num_semanas;
  const fechaFinSemestre = sumarDias(calendario.fecha_inicio, total * 7 - 1);
  const base = {
    semestre: calendario.semestre ?? null,
    hoy,
    zona_horaria: ZONA_HORARIA,
    total_semanas: total,
    fecha_inicio_semestre: calendario.fecha_inicio,
    fecha_fin_semestre: fechaFinSemestre,
    calendario_por_defecto: Boolean(calendario.por_defecto),
  };
  const dias = diferenciaDias(calendario.fecha_inicio, hoy);
  if (dias == null) return { ...base, numero: null, estado: "sin_iniciar" };
  if (dias < 0) return { ...base, numero: null, estado: "sin_iniciar", dias_para_inicio: -dias };
  const n = Math.floor(dias / 7) + 1;
  if (n > total) return { ...base, numero: null, estado: "finalizado" };
  const { inicio, fin } = rangoSemana(calendario, n);
  return { ...base, numero: n, estado: "en_curso", fecha_inicio_semana: inicio, fecha_fin_semana: fin };
}

/** Fecha programada (inicio/fin) de un entregable a partir de los offsets de la plantilla. */
export function fechasProgramadas(calendario, { semana_numero, dias_inicio, dias_fin }) {
  const sem = semana_numero != null ? Number(semana_numero) : null;
  const tieneSemana = sem != null && Number.isFinite(sem) && sem > 0;
  const dIni = dias_inicio != null ? Number(dias_inicio) : tieneSemana ? (sem - 1) * 7 : null;
  const dFin = dias_fin != null ? Number(dias_fin) : tieneSemana ? sem * 7 - 1 : null;
  return {
    fecha_inicio: dIni != null ? sumarDias(calendario.fecha_inicio, dIni) : null,
    fecha_fin: dFin != null ? sumarDias(calendario.fecha_inicio, dFin) : null,
  };
}

// ───────────────────────── Categorías ─────────────────────────

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
 * Estado de revisión efectivo de un entregable de la matriz.
 *  no_iniciado | borrador | enviado | observado | aprobado
 * "Vencido" NO es un estado: es una condición calculada (ver estaVencido).
 * Un checkbox `completado` sin estado de revisión válido no cuenta como envío.
 */
export function estadoEfectivo(item) {
  if (!item || item.entregable_id == null) return "no_iniciado";
  const rev = item.estado_revision;
  if (rev === "aprobado") return "aprobado";
  if (rev === "observado") return "observado";
  if (rev === "borrador") return "borrador";
  if (item.completado === true) return "enviado";
  // Filas históricas: estado_revision tomó el DEFAULT 'enviado' sin que se haya enviado nada.
  return tieneContenido(item) ? "borrador" : "no_iniciado";
}

/** Un entregable está vencido si pasó su fecha límite y el docente aún le debe una acción. */
export function estaVencido(item, estado, hoy) {
  if (!item.fecha_fin || !hoy) return false;
  if (!(estado === "no_iniciado" || estado === "borrador" || estado === "observado")) return false;
  return item.fecha_fin < hoy;
}

/** Exigible: su fecha límite es hoy o anterior (el día de vencimiento es exigible pero aún no vencido). */
export function esExigible(item, hoy) {
  return Boolean(item.fecha_fin && hoy && item.fecha_fin <= hoy);
}

export function clasificarItem(item, hoy) {
  const estado = estadoEfectivo(item);
  const reportado = estado === "enviado" || estado === "aprobado";
  const fechaPrimerEnvio = item.fecha_primer_envio ? fechaBogota(item.fecha_primer_envio) : null;
  return {
    estado,
    reportado,
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
 * Indicadores de un conjunto de entregables (cálculo único para todas las pantallas).
 *  - reportado: enviado o aprobado (no borradores, no observados)
 *  - aprobado: solo aprobado por un administrador
 *  - esperado: entregables exigibles (fecha límite <= hoy)
 *  - brecha: aprobados − esperado (negativa = atraso)
 *  - cumplimiento_exigible: % de exigibles ya aprobados
 */
export function calcularMetricas(items, hoy = hoyBogota()) {
  const c = {
    total: 0,
    reportados: 0,
    aprobados: 0,
    enviados_pendientes_revision: 0,
    observados: 0,
    borradores: 0,
    no_iniciados: 0,
    vencidos: 0,
    exigibles: 0,
    exigibles_aprobados: 0,
    exigibles_reportados: 0,
  };
  for (const it of items) {
    const k = it.clasificacion ?? clasificarItem(it, hoy);
    c.total += 1;
    if (k.reportado) c.reportados += 1;
    if (k.aprobado) c.aprobados += 1;
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

export const NOMBRES_MES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/** Nombre del mes de una fecha YYYY-MM-DD (independiente de la configuración regional). */
export function mesDeFecha(iso) {
  const m = ISO_RE.exec(iso || "");
  return m ? NOMBRES_MES[Number(m[2]) - 1] : "";
}

const MESES_ORDEN = ["febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre", "enero"];
const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Etiqueta de mes tal como la usa la matriz ('Febrero'); vacío si no es reconocible. */
export function etiquetaMes(mes) {
  const k = String(mes || "").trim().toLowerCase();
  return MESES_ORDEN.includes(k) ? capitalizar(k) : String(mes || "").trim();
}

export function metricasPorMes(items, hoy, mesesPorDefecto = ["Febrero", "Marzo", "Abril", "Mayo"]) {
  const grupos = new Map();
  for (const it of items) {
    const label = etiquetaMes(it.mes);
    if (!label) continue;
    if (!grupos.has(label)) grupos.set(label, []);
    grupos.get(label).push(it);
  }
  const labels = grupos.size > 0 ? [...grupos.keys()] : mesesPorDefecto;
  const minSemana = (label) =>
    Math.min(...(grupos.get(label) ?? []).map((i) => Number(i.semana_numero) || 1e9), 1e9);
  labels.sort((a, b) => minSemana(a) - minSemana(b));
  return labels.map((mes) => {
    const sub = grupos.get(mes) ?? [];
    const m = calcularMetricas(sub, hoy);
    return {
      mes,
      total: m.total,
      completados: m.reportados, // alias histórico = reportados
      reportados: m.reportados,
      aprobados: m.aprobados,
      esperado: m.esperado,
      observados: m.observados,
      vencidos: m.vencidos,
      porcentaje_mensual: m.pct_reportado, // alias histórico
      pct_reportado: m.pct_reportado,
      pct_aprobado: m.pct_aprobado,
      pct_esperado: m.pct_esperado,
    };
  });
}

export function metricasPorSemana(items, hoy) {
  const total = items.length;
  const semanas = [...new Set(items.map((i) => Number(i.semana_numero)).filter(Boolean))].sort((a, b) => a - b);
  return semanas.map((w) => {
    const sub = items.filter((i) => Number(i.semana_numero) === w);
    const hasta = items.filter((i) => Number(i.semana_numero) <= w);
    const m = calcularMetricas(sub, hoy);
    const acum = calcularMetricas(hasta, hoy);
    return {
      semana_numero: w,
      mes: etiquetaMes(sub[0]?.mes) || null,
      total: m.total,
      completados: m.reportados, // alias histórico
      reportados: m.reportados,
      aprobados: m.aprobados,
      porcentaje_semanal: m.pct_reportado,
      porcentaje_acumulado: pct(acum.reportados, total), // alias histórico (reportado)
      acumulado_reportado_pct: pct(acum.reportados, total),
      acumulado_aprobado_pct: pct(acum.aprobados, total),
      acumulado_esperado_pct: pct(hasta.length, total),
    };
  });
}

// ───────────────────────── Evidencias ─────────────────────────

export const TIPOS_EVIDENCIA = ["drive", "formulario", "enlace", "ninguna"];

const HOSTS_DRIVE = ["drive.google.com", "docs.google.com", "drive.usercontent.google.com"];
const hostEs = (host, lista) => lista.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * Qué evidencia exige una plantilla. Sin configuración explícita se infiere del texto
 * histórico, de forma permisiva: no se obliga a todos al mismo formato.
 */
export function resolverRequisitoEvidencia({ tipo_evidencia, requiere_evidencia, descripcion_evidencia } = {}) {
  if (requiere_evidencia === false || tipo_evidencia === "ninguna") return { requiere: false, tipo: "ninguna" };
  if (TIPOS_EVIDENCIA.includes(tipo_evidencia)) return { requiere: true, tipo: tipo_evidencia };
  if (/no implica realizar cargue/i.test(descripcion_evidencia || "")) return { requiere: false, tipo: "ninguna" };
  return { requiere: true, tipo: "enlace" };
}

/** url_evidencia se guarda como URL simple (histórico) o como JSON de URLs. */
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

export const MIN_JUSTIFICACION = 10;

/**
 * Valida si un entregable puede enviarse. `exencion` = justificación escrita cuando
 * la evidencia no aplica; queda registrada y el administrador la revisa al aprobar.
 */
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

/**
 * Acciones del docente: 'guardar_borrador' | 'enviar' | 'retirar'.
 * Devuelve { ok, estado, evento, sinCambios } o { ok:false, codigo, error }.
 */
export function transicionDocente(estadoActual, accion) {
  if (estadoActual === "aprobado") return bloqueado;
  switch (accion) {
    case "guardar_borrador":
      // Un observado se corrige sin perder su estado; enviado/borrador/no_iniciado pasan a borrador.
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

/** Decisiones del administrador sobre un entregable: 'aprobado' | 'observado'. */
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

// ───────────────────────── Normalización de filas ─────────────────────────

/**
 * Convierte una fila (plantilla × entregable) de SQL en el ítem normalizado de la matriz
 * y le adjunta su clasificación. Las fechas DATE llegan como texto (to_char) desde SQL.
 */
export function construirItem(row, hoy) {
  const item = {
    plantilla_id: row.plantilla_id != null ? Number(row.plantilla_id) : null,
    numero: row.numero != null ? Number(row.numero) : 0,
    categoria_raw: row.categoria_raw ?? null,
    fase_raw: row.fase_raw ?? null,
    categoria: categoriaSlug(row.categoria_raw, row.fase_raw),
    fase: row.fase_raw ? String(row.fase_raw).trim() : "",
    mes: etiquetaMes(row.mes),
    semana_numero: row.semana_numero != null ? Number(row.semana_numero) : 0,
    entregable: row.entregable,
    descripcion_evidencia: row.descripcion_evidencia || "",
    tipo_evidencia: row.tipo_evidencia ?? null,
    requiere_evidencia: row.requiere_evidencia ?? null,
    horas: row.horas_effective != null ? Number(row.horas_effective) : 0,
    fecha_inicio: row.fecha_inicio ?? null,
    fecha_fin: row.fecha_fin ?? null,
    entregable_id: row.entregable_id != null ? Number(row.entregable_id) : null,
    completado: row.completado === true,
    estado_revision: row.estado_revision ?? null,
    comentario_revision: row.comentario_revision ?? null,
    url_evidencia: row.url_evidencia ?? null,
    fecha_real_entrega: fechaDesdeColumnaDate(row.fecha_real_entrega),
    fecha_primer_envio: row.fecha_primer_envio ?? null,
    fecha_ultimo_envio: row.fecha_ultimo_envio ?? null,
    num_envios: row.num_envios != null ? Number(row.num_envios) : 0,
    aprobado_en: row.aprobado_en ?? null,
    revisado_en: row.revisado_en ?? null,
    evidencia_exenta: row.evidencia_exenta === true,
    justificacion_exencion: row.justificacion_exencion ?? null,
    porcentaje_avance: row.porcentaje_avance != null ? Number(row.porcentaje_avance) : null,
    actividad_reportada: row.actividad_reportada ?? null,
    descripcion_reporte: row.descripcion_reporte ?? null,
    proyecto_id: row.proyecto_id != null ? Number(row.proyecto_id) : null,
    proyecto_titulo: row.proyecto_titulo ?? null,
    proyecto_tipo: row.proyecto_tipo ?? null,
  };
  item.clasificacion = clasificarItem(item, hoy);
  return item;
}

/** Representación pública (JSON de la API) de un ítem; mantiene las claves históricas. */
export function itemParaApi(item) {
  const k = item.clasificacion;
  const requisito = resolverRequisitoEvidencia(item);
  return {
    id: item.plantilla_id,
    numero: item.numero,
    categoria: item.categoria,
    fase: item.fase,
    mes: item.mes,
    semana_numero: item.semana_numero,
    entregable: item.entregable,
    descripcion_evidencia: item.descripcion_evidencia,
    requiere_evidencia: requisito.requiere,
    tipo_evidencia: requisito.tipo,
    horas: item.horas,
    fecha_inicio_calculada: item.fecha_inicio,
    fecha_fin_calculada: item.fecha_fin,
    entregable_id: item.entregable_id,
    // `completado` histórico = el docente ya lo envió (enviado o aprobado).
    completado: k.reportado,
    estado: k.estado,
    estado_revision: item.estado_revision,
    aprobado: k.aprobado,
    vencido: k.vencido,
    exigible: k.exigible,
    entrega_tardia: k.entrega_tardia,
    requiere_accion_docente: k.requiere_accion_docente,
    fecha_real_entrega: item.fecha_real_entrega,
    fecha_primer_envio: item.fecha_primer_envio ? fechaBogota(item.fecha_primer_envio) : null,
    fecha_ultimo_envio: item.fecha_ultimo_envio ? fechaBogota(item.fecha_ultimo_envio) : null,
    num_envios: item.num_envios,
    // url_evidencia = primer enlace (compatibilidad); evidencias = todos.
    url_evidencia: parseEvidencias(item.url_evidencia)[0] || null,
    evidencias: parseEvidencias(item.url_evidencia),
    evidencia_exenta: item.evidencia_exenta,
    justificacion_exencion: item.justificacion_exencion,
    comentario_revision: item.comentario_revision || null,
    porcentaje_avance: item.porcentaje_avance,
    actividad_reportada: item.actividad_reportada || null,
    iniciativa: item.proyecto_id != null ? { id: item.proyecto_id, titulo: item.proyecto_titulo, tipo: item.proyecto_tipo } : null,
  };
}

/** Resumen de indicadores listo para la API (incluye alias históricos). */
export function resumenParaApi(metricas) {
  return {
    ...metricas,
    total_entregables: metricas.total,
    completados: metricas.reportados, // alias histórico = reportados
    porcentaje_semestral: metricas.pct_reportado, // alias histórico
  };
}
