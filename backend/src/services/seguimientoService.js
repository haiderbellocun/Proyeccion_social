// Seguimiento operativo (coordinación): consolida, SOLO PARA LECTURA, lo que ya calculan las pantallas existentes.
//
// No define fórmulas nuevas: toda cifra sale de `calcularMetricas` / `buildMatrixStats` / `clasificarItem` (matrizService), las mismas que usan
// Matrices, Avance consolidado, Dashboard y Métricas. Aquí solo se decide QUÉ ítems entran en cada cifra:
//   · población  = ítems de matriz de los docentes del semestre, tras los filtros de docente (grupo, docente, programa, escuela) y de
//                  iniciativa. El filtro de estado NO cambia las tarjetas ni los gráficos (un porcentaje sobre una sola categoría no significa nada):
//                  solo decide qué docentes aparecen en la tabla.
//   · periodo    = subconjunto de la población programado en la semana (y/o mes) elegido; por omisión, la semana académica en curso.
// Un ítem «programado en la semana W» es el que tiene `semana_numero = W` en la plantilla (fecha límite dentro de esa semana del calendario).
// Un entregable «enviado durante la semana» aunque estuviera programado para otra se cuenta APARTE (`enviados_fuera_del_periodo`).
// Zona horaria America/Bogotá (hoyBogota / fechaBogota). Sin migraciones ni tablas nuevas.
import {
  ErrorNegocio, buildMatrixStats, calcularMetricas, etiquetaMes, fechaBogota, hoyBogota, itemParaApi, loadAssignedInitiativesMap,
  loadMatrixForDocentes, round1, semanaActual, sumarDias,
} from "./matrizService.js";
import { construirAlcance, leerSemestreParam, resolverSemestre } from "./semestreAlcance.js";

export const ESTADOS_FILTRO = ["pendiente", "no_iniciado", "borrador", "enviado", "observado", "aprobado", "vencido"];
const TIPOS_INICIATIVA = ["proyecto", "actividad", "convenio"];
/** Relaciones ítem → iniciativa que SÍ se pueden demostrar con datos (reporte guardado en la iniciativa o excepción del docente). */
const FUENTES_DEMOSTRABLES = new Set(["reporte", "excepcion"]);

export const DEFINICIONES = Object.freeze({
  docentes: "Docentes con grupo de matriz en el semestre, después de los filtros de grupo, docente, programa, escuela e iniciativa.",
  docentes_con_pendientes: "Docentes con al menos un entregable del periodo que aún requiere acción suya: no iniciado, borrador u observado.",
  programados_periodo: "Entregables de la matriz con semana (y mes) dentro del periodo elegido.",
  reportado_periodo: "Entregables del periodo en estado enviado o aprobado ÷ programados del periodo. Sin programados: «Sin entregables programados».",
  aprobado_periodo: "Entregables del periodo en estado aprobado ÷ programados del periodo. Enviar no es aprobar.",
  reportado_semestre: "Entregables enviados o aprobados ÷ total de la matriz del semestre (definición oficial del sistema).",
  aprobado_semestre: "Entregables aprobados ÷ total de la matriz del semestre.",
  esperado_semestre: "Entregables con fecha límite hasta hoy ÷ total de la matriz del semestre. Brecha = aprobado − esperado (puntos porcentuales).",
  vencidos: "Entregables con fecha límite anterior a hoy que siguen sin iniciar, en borrador u observados. Uno futuro nunca es vencido.",
  pendientes_revision: "Entregables enviados que esperan la revisión de coordinación (estado «enviado»).",
  observados: "Entregables devueltos al docente con observaciones.",
  semana_actual: "Entregables programados para la semana académica en curso hoy (independiente del periodo elegido).",
});

const pct1 = (a, b) => (b > 0 ? round1((100 * a) / b) : null);

function entero(valor, nombre, { min = 1, max = 2_147_483_647 } = {}) {
  if (valor == null || String(valor).trim() === "") return null;
  if (Array.isArray(valor) || typeof valor === "object") throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El filtro ${nombre} debe enviarse una sola vez.`);
  const n = Number(String(valor).trim());
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El filtro ${nombre} no es válido.`);
  return n;
}

export function leerFiltros(query = {}) {
  const texto = (v, nombre, max = 40) => {
    if (v == null || String(v).trim() === "") return null;
    if (Array.isArray(v) || typeof v === "object") throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El filtro ${nombre} debe enviarse una sola vez.`);
    const t = String(v).trim();
    if (t.length > max) throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El filtro ${nombre} no es válido.`);
    return t;
  };
  const estado = texto(query.estado, "estado");
  if (estado && !ESTADOS_FILTRO.includes(estado)) throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El estado debe ser uno de: ${ESTADOS_FILTRO.join(", ")}.`);
  const tipo = texto(query.tipo_iniciativa, "tipo_iniciativa");
  if (tipo && !TIPOS_INICIATIVA.includes(tipo)) throw new ErrorNegocio(400, "FILTRO_INVALIDO", `El tipo de iniciativa debe ser ${TIPOS_INICIATIVA.join(", ")}.`);
  const mes = texto(query.mes, "mes", 20);
  return {
    grupoId: entero(query.grupo_id, "grupo_id"),
    docenteId: entero(query.docente_id, "docente_id"),
    programaId: entero(query.programa_id, "programa_id"),
    escuelaId: entero(query.escuela_id, "escuela_id"),
    iniciativaId: entero(query.iniciativa_id, "iniciativa_id"),
    tipoIniciativa: tipo,
    mes: mes ? etiquetaMes(mes) : null,
    semana: entero(query.semana, "semana", { min: 1, max: 60 }),
    // periodo=semestre: sin semana ni mes, el periodo es TODO el semestre (en lugar de la semana en curso).
    todoElSemestre: texto(query.periodo, "periodo") === "semestre",
    estado,
  };
}

/** Periodo elegido: semana y/o mes (se combinan con Y); sin ninguno, la semana en curso; fuera de calendario, todo el semestre. */
export function resolverPeriodo(f, calendario, hoy) {
  if (f.semana || f.mes) {
    const desde = f.semana && calendario ? sumarDias(calendario.fecha_inicio, (f.semana - 1) * 7) : null;
    const partes = [f.semana ? `Semana ${f.semana}` : null, f.mes ? f.mes : null].filter(Boolean);
    return {
      tipo: f.semana && f.mes ? "semana_mes" : f.semana ? "semana" : "mes",
      semana: f.semana, mes: f.mes, desde, hasta: desde ? sumarDias(desde, 6) : null, etiqueta: partes.join(" · "), origen: "filtro",
    };
  }
  if (f.todoElSemestre) return { tipo: "semestre", semana: null, mes: null, desde: null, hasta: null, etiqueta: "Todo el semestre", origen: "filtro" };
  const sa = semanaActual(calendario, hoy);
  if (sa.estado === "en_curso") {
    return { tipo: "semana", semana: sa.numero, mes: null, desde: sa.fecha_inicio_semana, hasta: sa.fecha_fin_semana, etiqueta: `Semana ${sa.numero}`, origen: "semana_actual" };
  }
  return { tipo: "semestre", semana: null, mes: null, desde: null, hasta: null, etiqueta: "Todo el semestre", origen: "sin_semana_en_curso" };
}

const enPeriodo = (it, per) => (per.semana ? Number(it.semana_numero) === per.semana : true) && (per.mes ? it.mes === per.mes : true);
const requiereAccion = (it) => it.clasificacion.requiere_accion_docente === true;
const demostrable = (it) => it.iniciativa_id != null && FUENTES_DEMOSTRABLES.has(it.iniciativa_fuente);

function coincideEstado(it, estado) {
  if (!estado) return true;
  const k = it.clasificacion;
  if (estado === "vencido") return k.vencido;
  if (estado === "pendiente") return k.requiere_accion_docente;
  return k.estado === estado;
}

/** Métricas oficiales de un conjunto de ítems; los porcentajes son null cuando no hay ítems (nunca un 0 engañoso). */
function metricas(items, hoy) {
  const m = calcularMetricas(items, hoy);
  if (m.total === 0) return { ...m, pct_reportado: null, pct_aprobado: null, pct_esperado: null, brecha_pct: null };
  return m;
}

function resumenMetricas(m) {
  return {
    total: m.total, reportados: m.reportados, aprobados: m.aprobados, enviados_pendientes_revision: m.enviados_pendientes_revision,
    observados: m.observados, borradores: m.borradores, no_iniciados: m.no_iniciados, vencidos: m.vencidos, exigibles: m.exigibles,
    pct_reportado: m.pct_reportado, pct_aprobado: m.pct_aprobado, pct_esperado: m.pct_esperado, brecha: m.brecha, brecha_pct: m.brecha_pct,
    horas_programadas: m.horas_programadas, horas_reportadas: m.horas_reportadas, horas_aprobadas: m.horas_aprobadas, semaforo: m.semaforo,
  };
}

function proximaAccion(items) {
  const pendientes = items.filter(requiereAccion).filter((i) => i.fecha_fin);
  if (!pendientes.length) return null;
  // Primero lo vencido más antiguo; si nada está vencido, lo próximo a vencer.
  const vencidos = pendientes.filter((i) => i.clasificacion.vencido).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin));
  const elegido = vencidos[0] ?? pendientes.sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin))[0];
  return {
    plantilla_id: elegido.plantilla_id, entregable_id: elegido.entregable_id, entregable: elegido.entregable, semana: elegido.semana_numero,
    fecha_fin: elegido.fecha_fin, vencido: elegido.clasificacion.vencido, estado: elegido.clasificacion.estado,
    iniciativa_titulo: demostrable(elegido) ? elegido.iniciativa_titulo : null,
  };
}

async function cargarContexto(db, semestre, hoy) {
  const [programas, grupos, sinGrupo] = await Promise.all([
    db.query(`SELECT p.id, p.nombre, p.escuela_id, e.nombre AS escuela FROM programas p LEFT JOIN escuelas e ON e.id = p.escuela_id`),
    semestre.codigo
      ? db.query(`SELECT id, nombre FROM grupos_matriz WHERE semestre = $1 AND activo = TRUE ORDER BY nombre`, [semestre.codigo])
      : Promise.resolve({ rows: [] }),
    db.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'docente' AND estado = 'activo' AND grupo_matriz_id IS NULL`),
  ]);
  return {
    programas: new Map(programas.rows.map((r) => [Number(r.id), { id: Number(r.id), nombre: r.nombre, escuela_id: r.escuela_id != null ? Number(r.escuela_id) : null, escuela: r.escuela || null }])),
    grupos: grupos.rows.map((g) => ({ id: Number(g.id), nombre: g.nombre })),
    docentesSinGrupo: sinGrupo.rows[0].n,
  };
}

/** GET /admin/seguimiento — tarjetas, tabla por docente, gráficos y opciones de filtro (una sola población coherente). */
export async function consultarSeguimiento(db, query = {}) {
  const hoy = hoyBogota();
  const f = leerFiltros(query);
  const semestre = await resolverSemestre(db, leerSemestreParam(query));
  const calendario = semestre.calendario;
  const periodo = resolverPeriodo(f, calendario, hoy);
  const semActual = semanaActual(calendario, hoy);
  const ctx = await cargarContexto(db, semestre, hoy);
  const entradas = semestre.codigo ? await loadMatrixForDocentes(db, { semestre: semestre.codigo, hoy }) : [];
  const estados = entradas.length
    ? new Map((await db.query(`SELECT id, estado FROM usuarios WHERE id = ANY($1::int[])`, [entradas.map((e) => e.docente.id)])).rows.map((r) => [Number(r.id), r.estado]))
    : new Map();
  const iniciativasPorDocente = await loadAssignedInitiativesMap(entradas.map((e) => e.docente.id), db);

  // 1) filtros de docente y de iniciativa → `base` (sin el filtro de grupo: lo necesita la comparación entre grupos)
  const programaDe = (e) => ctx.programas.get(e.docente.programa_id) ?? null;
  const filtroIniciativa = (it) => {
    if (f.iniciativaId == null && !f.tipoIniciativa) return true;
    if (!demostrable(it)) return false;
    if (f.iniciativaId != null && it.iniciativa_id !== f.iniciativaId) return false;
    if (f.tipoIniciativa && it.iniciativa_tipo !== f.tipoIniciativa) return false;
    return true;
  };
  const baseSinGrupo = entradas
    .filter((e) => f.docenteId == null || e.docente.id === f.docenteId)
    .filter((e) => f.programaId == null || e.docente.programa_id === f.programaId)
    .filter((e) => f.escuelaId == null || programaDe(e)?.escuela_id === f.escuelaId)
    .map((e) => ({ ...e, items: e.items.filter(filtroIniciativa) }))
    .filter((e) => (f.iniciativaId == null && !f.tipoIniciativa) || e.items.length > 0);
  const poblacion = baseSinGrupo.filter((e) => f.grupoId == null || e.docente.grupo_id === f.grupoId);

  const itemsPoblacion = poblacion.flatMap((e) => e.items);
  const itemsPeriodo = itemsPoblacion.filter((it) => enPeriodo(it, periodo));

  // 2) filas por docente
  const filas = poblacion.map((e) => {
    const delPeriodo = e.items.filter((it) => enPeriodo(it, periodo));
    const mp = metricas(delPeriodo, hoy);
    const ms = metricas(e.items, hoy);
    const fuera = periodo.desde
      ? e.items.filter((it) => !enPeriodo(it, periodo) && it.fecha_primer_envio && fechaBogota(it.fecha_primer_envio) >= periodo.desde && fechaBogota(it.fecha_primer_envio) <= periodo.hasta).length
      : 0;
    const envios = e.items.map((i) => i.fecha_cargue_evidencia).filter(Boolean).sort();
    const prog = programaDe(e);
    return {
      id: e.docente.id,
      nombre: e.docente.nombre || "—",
      programa_id: e.docente.programa_id,
      programa: e.docente.programa || "—",
      escuela: prog?.escuela ?? null,
      regional: e.docente.regional || null,
      grupo_id: e.docente.grupo_id,
      grupo_nombre: e.docente.grupo_nombre || null,
      tipo_docente: e.docente.tipo_docente,
      estado_usuario: estados.get(e.docente.id) ?? "activo",
      iniciativas: (iniciativasPorDocente.get(e.docente.id) ?? []).map((i) => ({ id: i.id, titulo: i.titulo, tipo: i.tipo })),
      periodo: {
        programados: mp.total, reportados: mp.reportados, aprobados: mp.aprobados,
        pendientes: delPeriodo.filter(requiereAccion).length, vencidos: mp.vencidos, observados: mp.observados, por_revisar: mp.enviados_pendientes_revision,
        pct_reportado: mp.pct_reportado, pct_aprobado: mp.pct_aprobado, enviados_fuera_del_periodo: fuera,
      },
      semestre: resumenMetricas(ms),
      proxima_accion: proximaAccion(e.items),
      ultimo_envio: envios.length ? envios[envios.length - 1] : null,
      _coincideEstado: f.estado ? delPeriodo.some((it) => coincideEstado(it, f.estado)) : true,
    };
  });
  const tabla = filas.filter((r) => r._coincideEstado).map(({ _coincideEstado, ...r }) => r);

  // 3) tarjetas (misma población que la tabla antes del filtro de estado)
  const mPeriodo = metricas(itemsPeriodo, hoy);
  const mSemestre = metricas(itemsPoblacion, hoy);
  const programadosSemanaActual = semActual.estado === "en_curso" ? itemsPoblacion.filter((it) => Number(it.semana_numero) === semActual.numero).length : null;
  const tarjetas = {
    docentes: poblacion.length,
    docentes_visibles_en_tabla: tabla.length,
    docentes_con_pendientes: filas.filter((r) => r.periodo.pendientes > 0).length,
    periodo: {
      etiqueta: periodo.etiqueta,
      programados: mPeriodo.total, reportados: mPeriodo.reportados, aprobados: mPeriodo.aprobados,
      pendientes: itemsPeriodo.filter(requiereAccion).length, vencidos: mPeriodo.vencidos,
      pct_reportado: mPeriodo.pct_reportado, pct_aprobado: mPeriodo.pct_aprobado,
      sin_programados: mPeriodo.total === 0,
      enviados_fuera_del_periodo: filas.reduce((s, r) => s + r.periodo.enviados_fuera_del_periodo, 0),
    },
    semestre: {
      programados: mSemestre.total, reportados: mSemestre.reportados, aprobados: mSemestre.aprobados,
      pct_reportado: mSemestre.pct_reportado, pct_aprobado: mSemestre.pct_aprobado, pct_esperado: mSemestre.pct_esperado,
      brecha_pct: mSemestre.brecha_pct, brecha: mSemestre.brecha, exigibles: mSemestre.exigibles,
    },
    vencidos: mSemestre.vencidos,
    enviados_pendientes_revision: mSemestre.enviados_pendientes_revision,
    observados: mSemestre.observados,
    programados_semana_actual: programadosSemanaActual,
    semana_actual: semActual.estado === "en_curso" ? semActual.numero : null,
  };

  // 4) gráficos
  const stats = buildMatrixStats(itemsPoblacion, { hoy, calendario });
  const evolucion = stats.por_semana.map((s) => ({
    semana: s.semana_numero, mes: s.mes, programados: s.total, reportados: s.reportados, aprobados: s.aprobados,
    pct_reportado: pct1(s.reportados, s.total), pct_aprobado: pct1(s.aprobados, s.total),
    acumulado_reportado_pct: s.acumulado_reportado_pct, acumulado_aprobado_pct: s.acumulado_aprobado_pct, acumulado_esperado_pct: s.acumulado_esperado_pct,
  }));
  const porGrupo = ctx.grupos.map((g) => {
    const entradasG = baseSinGrupo.filter((e) => e.docente.grupo_id === g.id);
    const m = metricas(entradasG.flatMap((e) => e.items), hoy);
    return {
      id: g.id, nombre: g.nombre, docentes: entradasG.length, total: m.total, reportados: m.reportados, aprobados: m.aprobados,
      pct_reportado: m.pct_reportado, pct_aprobado: m.pct_aprobado, pct_esperado: m.pct_esperado, brecha_pct: m.brecha_pct,
      vencidos: m.vencidos, enviados_pendientes_revision: m.enviados_pendientes_revision, observados: m.observados, seleccionado: f.grupoId === g.id,
    };
  });
  const estadoEntregables = {
    total: mSemestre.total, no_iniciados: mSemestre.no_iniciados, borradores: mSemestre.borradores, enviados: mSemestre.enviados_pendientes_revision,
    observados: mSemestre.observados, aprobados: mSemestre.aprobados,
    // Condición, no estado: ya está contada dentro de no iniciados + borradores + observados.
    de_los_cuales_vencidos: mSemestre.vencidos,
  };

  // 5) opciones de filtro (sobre lo que de verdad existe)
  const meses = [];
  const itemsTodos = entradas.flatMap((e) => e.items);
  for (const it of [...itemsTodos].sort((a, b) => (a.semana_numero || 1e9) - (b.semana_numero || 1e9))) if (it.mes && !meses.includes(it.mes)) meses.push(it.mes);
  const semanas = calendario
    ? Array.from({ length: calendario.num_semanas }, (_, i) => {
        const n = i + 1;
        const desde = sumarDias(calendario.fecha_inicio, i * 7);
        const delaSemana = itemsTodos.filter((it) => Number(it.semana_numero) === n);
        return { numero: n, desde, hasta: sumarDias(desde, 6), actual: semActual.numero === n, programados: delaSemana.length, mes: delaSemana[0]?.mes ?? null };
      })
    : [];
  const programasOpc = new Map();
  for (const e of entradas) {
    const p = programaDe(e);
    if (p) programasOpc.set(p.id, p);
  }
  const iniciativasOpc = new Map();
  for (const it of itemsTodos) if (demostrable(it) && !iniciativasOpc.has(it.iniciativa_id)) iniciativasOpc.set(it.iniciativa_id, { id: it.iniciativa_id, titulo: it.iniciativa_titulo, tipo: it.iniciativa_tipo });
  const escuelasOpc = new Map();
  for (const p of programasOpc.values()) if (p.escuela_id != null) escuelasOpc.set(p.escuela_id, { id: p.escuela_id, nombre: p.escuela });
  const opciones = {
    semanas, meses,
    grupos: ctx.grupos,
    programas: [...programasOpc.values()].map((p) => ({ id: p.id, nombre: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    escuelas: [...escuelasOpc.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    iniciativas: [...iniciativasOpc.values()].sort((a, b) => a.titulo.localeCompare(b.titulo)),
    tipos_iniciativa: TIPOS_INICIATIVA,
    docentes: entradas.map((e) => ({ id: e.docente.id, nombre: e.docente.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    estados: ESTADOS_FILTRO,
  };

  const alcance = await construirAlcance(db, semestre, { hoy, vacio: poblacion.length === 0 });
  const avisos = [];
  if (ctx.docentesSinGrupo > 0) avisos.push(`${ctx.docentesSinGrupo} docente(s) activos sin grupo de matriz no pertenecen a ningún semestre y no se incluyen.`);
  if (f.iniciativaId != null || f.tipoIniciativa) avisos.push("El filtro de iniciativa solo incluye entregables con una relación demostrable (reporte guardado en la iniciativa o excepción del docente); los aún no reportados no tienen iniciativa asociada.");
  if (!calendario) avisos.push("El semestre no tiene calendario configurado: no se pueden ubicar semanas ni fechas límite.");

  return {
    semestre: { codigo: semestre.codigo, activo: semestre.activo, calendario },
    hoy, zona_horaria: "America/Bogota",
    semana_actual: semActual,
    filtros: { ...f, estado: f.estado },
    periodo,
    definiciones: DEFINICIONES,
    tarjetas,
    graficos: { evolucion_semanal: evolucion, por_grupo: porGrupo, estado_entregables: estadoEntregables },
    docentes: tabla,
    opciones,
    docentes_sin_grupo: ctx.docentesSinGrupo,
    avisos,
    alcance,
  };
}

const ORDEN_ESTADOS = ["vencido", "observado", "borrador", "no_iniciado", "enviado", "aprobado"];

/** GET /admin/seguimiento/docentes/:id — detalle de un docente: general, semana, semestre, iniciativas reales y entregables. */
export async function consultarSeguimientoDocente(db, docenteId, query = {}) {
  const id = entero(docenteId, "id");
  if (id == null) throw new ErrorNegocio(400, "DOCENTE_INVALIDO", "id de docente inválido");
  const hoy = hoyBogota();
  const f = leerFiltros(query);
  const semestre = await resolverSemestre(db, leerSemestreParam(query));
  const calendario = semestre.calendario;
  const periodo = resolverPeriodo(f, calendario, hoy);
  const usuario = (await db.query(
    `SELECT u.id, u.nombre, u.apellido, u.correo, u.rol, u.estado, u.regional, u.programa_id, p.nombre AS programa, e.nombre AS escuela, u.grupo_matriz_id, g.nombre AS grupo_nombre, g.semestre AS grupo_semestre, COALESCE(u.tipo_docente,'ANTIGUO') AS tipo_docente
     FROM usuarios u LEFT JOIN programas p ON p.id = u.programa_id LEFT JOIN escuelas e ON e.id = p.escuela_id LEFT JOIN grupos_matriz g ON g.id = u.grupo_matriz_id
     WHERE u.id = $1 AND u.rol = 'docente'`, [id]
  )).rows[0];
  if (!usuario) throw new ErrorNegocio(404, "DOCENTE_NO_ENCONTRADO", "Docente no encontrado");
  const [entrada] = semestre.codigo ? await loadMatrixForDocentes(db, { docenteId: id, semestre: semestre.codigo, hoy }) : [];
  const items = entrada?.items ?? [];
  const asignadas = (await loadAssignedInitiativesMap([id], db)).get(id) ?? [];
  const roles = asignadas.length
    ? new Map((await db.query(`SELECT id, (docente_responsable_id = $1) AS responsable FROM proyectos WHERE id = ANY($2::int[])`, [id, asignadas.map((a) => a.id)])).rows.map((r) => [Number(r.id), r.responsable === true]))
    : new Map();

  const delPeriodo = items.filter((it) => enPeriodo(it, periodo));
  const mp = metricas(delPeriodo, hoy);
  const ms = metricas(items, hoy);
  const fuera = periodo.desde
    ? items.filter((it) => !enPeriodo(it, periodo) && it.fecha_primer_envio && fechaBogota(it.fecha_primer_envio) >= periodo.desde && fechaBogota(it.fecha_primer_envio) <= periodo.hasta)
    : [];

  const compacto = (it) => {
    const api = itemParaApi(it);
    return {
      plantilla_id: it.plantilla_id, entregable_id: it.entregable_id, entregable: it.entregable, numero: it.numero, mes: it.mes, semana: it.semana_numero,
      fecha_inicio: it.fecha_inicio_calculada, fecha_fin: it.fecha_fin, estado: api.estado, vencido: api.vencido, exigible: api.exigible,
      requiere_correccion: api.estado === "observado", comentario_revision: it.comentario_revision, horas: it.horas,
      iniciativa: it.iniciativa_id != null ? { id: it.iniciativa_id, titulo: it.iniciativa_titulo, tipo: it.iniciativa_tipo, relacion: demostrable(it) ? "demostrada" : it.iniciativa_fuente === "inferida" ? "sugerida_por_nombre" : "ninguna" } : null,
      evidencias: api.evidencias, requiere_evidencia: api.requiere_evidencia, num_envios: it.num_envios, fecha_primer_envio: api.fecha_primer_envio,
      en_periodo: enPeriodo(it, periodo),
    };
  };
  const claveEstado = (e) => (e.vencido ? "vencido" : e.estado);
  const entregables = items.map(compacto).sort(
    (a, b) => ORDEN_ESTADOS.indexOf(claveEstado(a)) - ORDEN_ESTADOS.indexOf(claveEstado(b)) || String(a.fecha_fin ?? "9999").localeCompare(String(b.fecha_fin ?? "9999"))
  );

  const iniciativas = asignadas.map((a) => {
    const suyos = items.filter((it) => demostrable(it) && it.iniciativa_id === a.id);
    const m = metricas(suyos, hoy);
    return {
      id: a.id, titulo: a.titulo, tipo: a.tipo, rol: roles.get(a.id) ? "responsable" : "colaborador",
      entregables_vinculados: m.total, reportados: m.reportados, aprobados: m.aprobados, observados: m.observados,
      pendientes_revision: m.enviados_pendientes_revision, pendientes: suyos.filter(requiereAccion).length, vencidos: m.vencidos,
      // Solo hay avance atribuible sobre lo que está vinculado de forma demostrable a la iniciativa (no sobre toda la matriz).
      aprobados_de_vinculados_pct: m.total > 0 ? m.pct_aprobado : null,
      reportados_de_vinculados_pct: m.total > 0 ? m.pct_reportado : null,
    };
  });
  const generales = items.filter((it) => !demostrable(it));

  return {
    docente: {
      id: usuario.id, nombre: [usuario.nombre, usuario.apellido].filter(Boolean).join(" "), correo: usuario.correo, estado_usuario: usuario.estado, programa: usuario.programa || null,
      escuela: usuario.escuela || null, regional: usuario.regional || null, grupo_id: usuario.grupo_matriz_id, grupo_nombre: usuario.grupo_nombre || null,
      tipo_docente: usuario.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO", grupo_semestre: usuario.grupo_semestre || null,
    },
    semestre: { codigo: semestre.codigo, activo: semestre.activo, calendario },
    hoy, periodo,
    sin_matriz: items.length === 0,
    motivo_sin_matriz: items.length === 0
      ? (usuario.grupo_matriz_id == null ? "El docente no tiene grupo de matriz asignado." : usuario.grupo_semestre !== semestre.codigo ? `Su grupo pertenece al semestre ${usuario.grupo_semestre}, no al ${semestre.codigo}.` : "Su grupo no tiene entregables en la matriz.")
      : null,
    general: { ...resumenMetricas(ms), exigibles: ms.exigibles },
    periodo_detalle: {
      programados: mp.total, reportados: mp.reportados, aprobados: mp.aprobados, pendientes: delPeriodo.filter(requiereAccion).length,
      vencidos: mp.vencidos, observados: mp.observados, por_revisar: mp.enviados_pendientes_revision,
      pct_reportado: mp.pct_reportado, pct_aprobado: mp.pct_aprobado, sin_programados: mp.total === 0,
      enviados_fuera_del_periodo: fuera.map((it) => ({ plantilla_id: it.plantilla_id, entregable_id: it.entregable_id, entregable: it.entregable, semana_programada: it.semana_numero, fecha_primer_envio: fechaBogota(it.fecha_primer_envio), estado: it.clasificacion.estado })),
    },
    iniciativas,
    sin_iniciativa_demostrable: {
      titulo: "Entregables generales o sin relación demostrable con una iniciativa",
      nota: "Capacitaciones, gestión general y entregables aún no reportados no se atribuyen a un proyecto, actividad o convenio sin una relación demostrable.",
      total: generales.length, reportados: generales.filter((i) => i.clasificacion.reportado).length, aprobados: generales.filter((i) => i.clasificacion.aprobado).length,
      sugeridos_por_nombre: generales.filter((i) => i.iniciativa_fuente === "inferida").length,
    },
    entregables,
  };
}
