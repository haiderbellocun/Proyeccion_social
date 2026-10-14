// Pruebas unitarias de las reglas de seguimiento (sin base de datos ni red).
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMatrixStats,
  calcularMetricas,
  clasificarItem,
  diferenciaDias,
  esFechaISO,
  estadoEfectivo,
  fechaBogota,
  fechaDesdeColumnaDate,
  itemParaApi,
  mapMatrixRows,
  normalizarCalendario,
  parseEvidencias,
  resolveInitiativeForTemplate,
  resolverRequisitoEvidencia,
  resumenParaApi,
  semanaActual,
  semaforoRiesgo,
  tipoIniciativaDeCategoria,
  transicionAdmin,
  transicionDocente,
  transicionReapertura,
  validarEnvio,
  categoriaSlug,
} from "../src/services/matrizService.js";

const HOY = "2026-03-10";
const cal = normalizarCalendario({ codigo: "2026A", fecha_inicio: "2026-02-10", fecha_fin: "2026-06-01", numero_semanas: 16 });

// Fila SQL mínima de matriz (tal como la entrega loadMatrixForDocentes) convertida con mapMatrixRows.
let seq = 0;
const fila = (fecha_fin, e = {}) => {
  seq += 1;
  const row = {
    id: seq, numero: seq, categoria_raw: "Capacitación", fase_raw: "Alistamiento", mes: "marzo", semana_numero: 1,
    entregable: `Entregable ${seq}`, fecha_inicio_calculada: fecha_fin, fecha_fin_calculada: fecha_fin,
    completado: false, ...e,
  };
  return mapMatrixRows([row], [], categoriaSlug, { hoy: HOY })[0];
};
const reg = (fecha_fin, estado_revision, completado = true, extra = {}) =>
  fila(fecha_fin, { entregable_id: 100 + seq, completado, estado_revision, ...extra });

// ─────────── Fechas / calendario ───────────
test("fechaBogota usa la fecha civil de America/Bogota (UTC-5)", () => {
  assert.equal(fechaBogota(new Date("2026-03-01T04:59:59Z")), "2026-02-28");
  assert.equal(fechaBogota(new Date("2026-03-01T05:00:00Z")), "2026-03-01");
  assert.equal(fechaBogota(new Date("2026-03-10T01:00:00Z")), "2026-03-09"); // 8 p. m. en Bogotá
});

test("fechaDesdeColumnaDate no desplaza el día (componentes locales del Date de pg)", () => {
  assert.equal(fechaDesdeColumnaDate(new Date(2026, 1, 10)), "2026-02-10");
  assert.equal(fechaDesdeColumnaDate("2026-02-10T00:00:00.000Z"), "2026-02-10");
  assert.equal(fechaDesdeColumnaDate(null), null);
});

test("esFechaISO / diferenciaDias", () => {
  assert.equal(esFechaISO("2026-02-28"), true);
  assert.equal(esFechaISO("2026-02-31"), false);
  assert.equal(diferenciaDias("2026-02-27", "2026-03-02"), 3);
});

test("semana actual según el calendario del semestre, sin asumir 16 semanas", () => {
  assert.equal(semanaActual(cal, "2026-02-10").numero, 1);
  assert.equal(semanaActual(cal, "2026-02-17").numero, 2);
  assert.equal(semanaActual(cal, "2026-02-09").estado, "sin_iniciar");
  assert.equal(semanaActual(cal, "2026-06-01").numero, 16);
  assert.equal(semanaActual(cal, "2026-06-02").estado, "finalizado");
  const cal18 = normalizarCalendario({ codigo: "X", fecha_inicio: "2026-02-10", numero_semanas: 18 });
  const s = semanaActual(cal18, "2026-06-02");
  assert.equal(s.numero, 17);
  assert.equal(s.total_semanas, 18);
  assert.equal(s.fecha_fin_semestre, "2026-06-15");
});

test("sin calendario configurado NO se usa una fecha por defecto: se advierte", () => {
  assert.equal(normalizarCalendario(null), null);
  assert.equal(normalizarCalendario({ codigo: "X", fecha_inicio: null, numero_semanas: 16 }), null);
  const s = semanaActual(null, HOY);
  assert.equal(s.estado, "sin_calendario");
  assert.equal(s.numero, null);
  assert.match(s.advertencia, /calendario/i);
  // Un ítem sin fechas programadas no es exigible ni vencido (no se inventa un vencimiento).
  const sinFecha = fila(null);
  assert.equal(sinFecha.clasificacion.exigible, false);
  assert.equal(sinFecha.clasificacion.vencido, false);
});

// ─────────── Estados ───────────
test("el checkbox `completado` sin estado válido no cuenta como envío en filas históricas vacías", () => {
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: false, estado_revision: "enviado" }), "no_iniciado");
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: false, estado_revision: "enviado", url_evidencia: "https://x.co" }), "borrador");
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: true, estado_revision: "enviado" }), "enviado");
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: true, estado_revision: "borrador" }), "borrador");
  assert.equal(estadoEfectivo(null), "no_iniciado");
});

test("vencido es una condición adicional: no destruye el estado de revisión", () => {
  const k = reg("2026-03-01", "observado").clasificacion;
  assert.equal(k.estado, "observado");
  assert.equal(k.vencido, true);
});

test("fecha límite de hoy: exigible pero NO vencido; ayer: vencido", () => {
  assert.equal(fila(HOY).clasificacion.exigible, true);
  assert.equal(fila(HOY).clasificacion.vencido, false);
  assert.equal(fila("2026-03-09").clasificacion.vencido, true);
  assert.equal(fila("2026-03-11").clasificacion.exigible, false);
});

test("enviado o aprobado nunca se consideran vencidos", () => {
  assert.equal(reg("2026-01-01", "enviado").clasificacion.vencido, false);
  assert.equal(reg("2026-01-01", "aprobado").clasificacion.vencido, false);
});

test("entrega tardía con la fecha de Bogotá del primer envío", () => {
  const aTiempo = reg("2026-03-04", "enviado", true, { fecha_primer_envio: new Date("2026-03-05T03:00:00Z") }); // 4-mar 22:00 Bogotá
  assert.equal(aTiempo.clasificacion.entrega_tardia, false);
  const tarde = reg("2026-03-04", "enviado", true, { fecha_primer_envio: new Date("2026-03-05T06:00:00Z") });
  assert.equal(tarde.clasificacion.entrega_tardia, true);
});

// ─────────── Indicadores ───────────
test("un observado NO suma avance aprobado; un aprobado sí", () => {
  const obs = calcularMetricas([reg("2026-03-01", "observado")], HOY);
  assert.equal(obs.aprobados, 0);
  assert.equal(obs.reportados, 0);
  const apr = calcularMetricas([reg("2026-03-01", "aprobado")], HOY);
  assert.equal(apr.aprobados, 1);
  assert.equal(apr.reportados, 1);
});

test("los borradores no cuentan como avance reportado", () => {
  const m = calcularMetricas([reg("2026-03-01", "borrador", false), fila("2026-03-01")], HOY);
  assert.equal(m.reportados, 0);
  assert.equal(m.borradores, 1);
  assert.equal(m.no_iniciados, 1);
});

test("reportado, aprobado, esperado, brecha y cumplimiento exigible", () => {
  const items = [
    reg("2026-03-01", "aprobado"),
    reg("2026-03-02", "enviado"),
    reg("2026-03-03", "observado"),
    fila("2026-03-04"),
    reg("2026-03-20", "aprobado"),
    fila("2026-03-25"),
    fila("2026-04-01"),
    fila(HOY),
  ];
  const m = calcularMetricas(items, HOY);
  assert.equal(m.total, 8);
  assert.equal(m.reportados, 3);
  assert.equal(m.aprobados, 2);
  assert.equal(m.exigibles, 5);
  assert.equal(m.vencidos, 2);
  assert.equal(m.brecha, -3);
  assert.equal(m.cumplimiento_exigible, 20);
  assert.equal(m.cumplimiento_reportado_exigible, 40);
  assert.equal(m.pct_reportado, 37.5);
  assert.equal(m.pct_aprobado, 25);
  assert.equal(m.pct_esperado, 62.5);
  assert.equal(m.brecha_pct, -37.5);
  // Claves históricas de `main` conservadas para el frontend existente.
  const api = resumenParaApi(m);
  assert.equal(api.total_entregables, 8);
  assert.equal(api.completados, 3);
  assert.equal(api.porcentaje_real, 37.5);
  assert.equal(api.exigibles_a_fecha, 5);
  assert.equal(api.brecha, -37.5);
  assert.equal(api.brecha_entregables, -3);
});

test("sin exigibles no hay división por cero", () => {
  const m = calcularMetricas([fila("2026-12-01")], HOY);
  assert.equal(m.cumplimiento_exigible, null);
  assert.equal(m.semaforo, "sin_exigibles");
  assert.equal(resumenParaApi(m).cumplimiento_esperado, 100);
  assert.equal(calcularMetricas([], HOY).semaforo, "sin_datos");
});

test("semáforo según cumplimiento reportado sobre lo exigible", () => {
  const base = { total: 10, exigibles: 10 };
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 80 }), "verde");
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 79.9 }), "amarillo");
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 49.9 }), "rojo");
});

test("indicadores individuales y consolidados usan el mismo criterio", () => {
  const a = [reg("2026-03-01", "aprobado"), fila("2026-03-02")];
  const b = [reg("2026-03-01", "observado"), reg("2026-03-02", "enviado")];
  const [ma, mb, mc] = [calcularMetricas(a, HOY), calcularMetricas(b, HOY), calcularMetricas([...a, ...b], HOY)];
  for (const campo of ["total", "reportados", "aprobados", "exigibles", "vencidos", "observados"]) {
    assert.equal(mc[campo], ma[campo] + mb[campo], campo);
  }
});

test("buildMatrixStats: meses dinámicos, semanas por calendario y claves históricas", () => {
  const items = [
    reg("2026-02-12", "aprobado", true, { mes: "febrero", semana_numero: 1, fecha_primer_envio: new Date("2026-02-11T15:00:00Z"), aprobado_en: new Date("2026-02-12T15:00:00Z") }),
    fila("2026-03-04", { mes: "marzo", semana_numero: 4 }),
    fila("2026-08-20", { mes: "agosto", semana_numero: 3 }),
  ];
  const st = buildMatrixStats(items, { hoy: HOY, calendario: cal });
  assert.deepEqual(st.por_mes.map((m) => m.mes), ["Febrero", "Agosto", "Marzo"]);
  const feb = st.por_mes[0];
  assert.equal(feb.completados, 1);
  assert.equal(feb.porcentaje_mensual, 100);
  assert.equal(feb.aprobados, 1);
  assert.deepEqual(st.por_semana.map((s) => s.semana_numero), [1, 3, 4]);
  assert.equal(st.por_semana[0].acumulado_aprobado_pct, 33.3);
  assert.equal(st.por_semana[0].porcentaje_esperado_acumulado, 33.3);
  assert.equal(st.semana_actual.numero, 5);
  assert.equal(st.hoy, HOY);
});

test("buildMatrixStats sin calendario: la semana se marca sin_calendario", () => {
  assert.equal(buildMatrixStats([fila(null)], { hoy: HOY, calendario: null }).semana_actual.estado, "sin_calendario");
});

// ─────────── Ítems para la API ───────────
test("itemParaApi: completado histórico = reportado; observado no es completado", () => {
  const o = itemParaApi(reg("2026-03-01", "observado", true, { url_evidencia: "https://drive.google.com/x" }));
  assert.equal(o.completado, false);
  assert.equal(o.estado, "observado");
  assert.equal(o.vencido, true);
  assert.equal(o.url_evidencia, "https://drive.google.com/x");
  assert.equal(itemParaApi(reg("2026-03-01", "enviado")).completado, true);
  assert.equal(itemParaApi(reg("2026-03-01", "aprobado")).aprobado, true);
});

test("itemParaApi expone el requisito de evidencia configurado por plantilla", () => {
  const d = itemParaApi(fila(HOY, { tipo_evidencia: "drive" }));
  assert.deepEqual([d.requiere_evidencia, d.tipo_evidencia], [true, "drive"]);
  const n = itemParaApi(fila(HOY, { requiere_evidencia: false }));
  assert.equal(n.requiere_evidencia, false);
});

// ─────────── Categorías / iniciativas ───────────
test("categorías de plantilla y tipo de iniciativa compatible", () => {
  assert.equal(categoriaSlug("Proyecto 1", "Alistamiento"), "proyecto");
  assert.equal(categoriaSlug("Actividad 2", ""), "actividad2");
  assert.equal(tipoIniciativaDeCategoria("actividad3"), "actividad");
  assert.equal(tipoIniciativaDeCategoria("presupuesto"), null);
});

test("la iniciativa de una fila: reporte (id) > excepción (id) > inferencia por texto", () => {
  const ini = [{ id: 1, titulo: "P1", tipo: "proyecto" }, { id: 2, titulo: "P2", tipo: "proyecto" }];
  const base = { id: 1, categoria_raw: "Proyecto 2", fase_raw: "", mes: "marzo", entregable: "x", semana_numero: 1 };
  const infer = mapMatrixRows([base], ini, categoriaSlug, { hoy: HOY })[0];
  assert.equal(infer.iniciativa_id, 2);
  assert.equal(infer.iniciativa_fuente, "inferida");
  const exc = mapMatrixRows([{ ...base, override_project_id: 1, override_project_title: "P1", override_project_type: "proyecto" }], ini, categoriaSlug, { hoy: HOY })[0];
  assert.equal(exc.iniciativa_id, 1);
  assert.equal(exc.iniciativa_fuente, "excepcion");
  const rep = mapMatrixRows([{ ...base, override_project_id: 1, report_project_id: 2, report_project_title: "P2", report_project_type: "proyecto" }], ini, categoriaSlug, { hoy: HOY })[0];
  assert.equal(rep.iniciativa_id, 2);
  assert.equal(rep.iniciativa_fuente, "reporte");
});

const dbConIniciativas = (rows) => ({ query: async () => ({ rows }) });
const inic = (id, tipo) => ({ docente_id: 7, id, titulo: `I${id}`, tipo, fecha_inicio: "2026-02-10" });

test("resolver iniciativa: varias del mismo tipo => 409 con candidatos; proyecto_id explícito; ajena => 422", async () => {
  const db = dbConIniciativas([inic(1, "proyecto"), inic(2, "proyecto")]);
  const tpl = { categoria_raw: "Proyecto", fase_raw: "Ejecución", entregable: "Informe" };
  await assert.rejects(resolveInitiativeForTemplate(7, tpl, db), (e) => e.status === 409 && e.codigo === "INICIATIVA_AMBIGUA" && e.extra.candidatos.length === 2);
  assert.equal((await resolveInitiativeForTemplate(7, tpl, db, { proyectoId: 2 })).id, 2);
  await assert.rejects(resolveInitiativeForTemplate(7, tpl, db, { proyectoId: 99 }), (e) => e.status === 422);
  // Con ordinal explícito en la plantilla se resuelve sin preguntar; con una sola iniciativa también.
  assert.equal((await resolveInitiativeForTemplate(7, { ...tpl, categoria_raw: "Proyecto 2" }, db)).id, 2);
  assert.equal((await resolveInitiativeForTemplate(7, tpl, dbConIniciativas([inic(5, "proyecto")]))).id, 5);
});

test("resolver iniciativa: entregable transversal usa soporte general; excepción individual manda", async () => {
  const db = dbConIniciativas([inic(1, "proyecto"), inic(2, "proyecto")]);
  const r = await resolveInitiativeForTemplate(7, { categoria_raw: "Gestión de presupuesto", fase_raw: "", entregable: "Firmar formato" }, db);
  assert.equal(r.fuente, "soporte_general");
  const ex = await resolveInitiativeForTemplate(7, { categoria_raw: "Proyecto", fase_raw: "", entregable: "x", override_project_id: 2, override_project_title: "I2", override_project_type: "proyecto" }, db);
  assert.equal(ex.id, 2);
  assert.equal(ex.fuente, "excepcion");
});

// ─────────── Evidencias ───────────
test("requisito de evidencia: explícito, inferido por texto histórico o permisivo por defecto", () => {
  assert.deepEqual(resolverRequisitoEvidencia({ tipo_evidencia: "drive" }), { requiere: true, tipo: "drive" });
  assert.deepEqual(resolverRequisitoEvidencia({ requiere_evidencia: false }), { requiere: false, tipo: "ninguna" });
  assert.deepEqual(resolverRequisitoEvidencia({ descripcion_evidencia: "Esta tarea no implica realizar cargue" }), { requiere: false, tipo: "ninguna" });
  assert.deepEqual(resolverRequisitoEvidencia({ descripcion_evidencia: "Cargar PDF" }), { requiere: true, tipo: "enlace" });
});

test("no se puede enviar sin evidencia; la excepción exige justificación suficiente", () => {
  const req = { requiere: true, tipo: "enlace" };
  assert.equal(validarEnvio({ requisito: req, evidencias: [] }).codigo, "EVIDENCIA_REQUERIDA");
  assert.equal(validarEnvio({ requisito: req, evidencias: [], exencion: "corta" }).ok, false);
  const ok = validarEnvio({ requisito: req, evidencias: [], exencion: "Reunión virtual sin soporte documental" });
  assert.deepEqual([ok.ok, ok.exenta], [true, true]);
  assert.equal(validarEnvio({ requisito: { requiere: false, tipo: "ninguna" }, evidencias: [] }).ok, true);
});

test("formatos de evidencia por tipo", () => {
  const drive = { requiere: true, tipo: "drive" };
  assert.equal(validarEnvio({ requisito: drive, evidencias: ["https://drive.google.com/file/d/abc/view"] }).ok, true);
  assert.equal(validarEnvio({ requisito: drive, evidencias: ["https://ejemplo.com/a.pdf"] }).ok, false);
  const form = { requiere: true, tipo: "formulario" };
  assert.equal(validarEnvio({ requisito: form, evidencias: ["https://forms.gle/abc"] }).ok, true);
  assert.equal(validarEnvio({ requisito: form, evidencias: ["https://drive.google.com/x"] }).ok, false);
  const enlace = { requiere: true, tipo: "enlace" };
  assert.equal(validarEnvio({ requisito: enlace, evidencias: ["javascript:alert(1)"] }).ok, false);
  assert.equal(validarEnvio({ requisito: enlace, evidencias: ["no es un link"] }).codigo, "EVIDENCIA_INVALIDA");
});

test("parseEvidencias soporta texto histórico y JSON", () => {
  assert.deepEqual(parseEvidencias("https://a.co/x"), ["https://a.co/x"]);
  assert.deepEqual(parseEvidencias('["https://a.co/x","https://b.co/y"]'), ["https://a.co/x", "https://b.co/y"]);
  assert.deepEqual(parseEvidencias(null), []);
});

// ─────────── Transiciones ───────────
test("docente: un aprobado queda bloqueado para cualquier acción", () => {
  for (const accion of ["guardar_borrador", "enviar", "retirar"]) {
    assert.equal(transicionDocente("aprobado", accion).codigo, "ESTADO_BLOQUEADO", accion);
  }
});

test("docente: observado se corrige sin perder estado y se reenvía; enviar dos veces no duplica", () => {
  assert.equal(transicionDocente("observado", "guardar_borrador").estado, "observado");
  assert.equal(transicionDocente("observado", "enviar").evento, "reenvio");
  assert.equal(transicionDocente("observado", "retirar").ok, false);
  assert.equal(transicionDocente("enviado", "enviar").sinCambios, true);
  assert.equal(transicionDocente("no_iniciado", "enviar").evento, "envio");
  assert.equal(transicionDocente("enviado", "retirar").estado, "borrador");
});

test("admin: solo decide sobre enviados; observar exige comentario; aprobado exige reapertura", () => {
  assert.equal(transicionAdmin("enviado", "aprobado").estado, "aprobado");
  assert.equal(transicionAdmin("enviado", "observado", { comentario: "" }).codigo, "COMENTARIO_REQUERIDO");
  assert.equal(transicionAdmin("borrador", "aprobado").codigo, "NO_ENVIADO");
  assert.equal(transicionAdmin("aprobado", "observado", { comentario: "x" }).codigo, "ESTADO_BLOQUEADO");
  assert.equal(transicionReapertura("aprobado", { motivo: "corto" }).codigo, "MOTIVO_REQUERIDO");
  assert.equal(transicionReapertura("enviado", { motivo: "motivo suficientemente largo" }).codigo, "ESTADO_INVALIDO");
  assert.equal(transicionReapertura("aprobado", { motivo: "El acta no corresponde", destino: "observado" }).evento, "reapertura");
});

test("horas programadas, reportadas y aprobadas se calculan desde los ítems", () => {
  const items = [
    reg("2026-03-01", "aprobado", true, { horas_effective: 3 }),
    reg("2026-03-02", "enviado", true, { horas_effective: 2 }),
    fila("2026-03-03", { horas_effective: 5 }),
  ];
  const m = calcularMetricas(items, HOY);
  assert.deepEqual([m.horas_programadas, m.horas_reportadas, m.horas_aprobadas], [10, 5, 3]);
});

test("reporte transversal: no se presenta como proyecto aunque esté apoyado en una iniciativa", () => {
  const ini = [{ id: 1, titulo: "P1", tipo: "proyecto" }];
  const base = { id: 1, categoria_raw: "Presupuesto", fase_raw: "", mes: "marzo", entregable: "x", semana_numero: 1, entregable_id: 5, completado: true, estado_revision: "enviado", report_project_id: 1, report_project_title: "P1", report_project_type: "proyecto" };
  assert.equal(mapMatrixRows([base], ini, categoriaSlug, { hoy: HOY })[0].iniciativa_id, 1);
  const t = mapMatrixRows([{ ...base, report_transversal: true }], ini, categoriaSlug, { hoy: HOY })[0];
  assert.deepEqual([t.iniciativa_id, t.iniciativa_fuente], [null, "transversal"]);
});
