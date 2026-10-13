import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularMetricas,
  categoriaSlug,
  clasificarItem,
  construirItem,
  diferenciaDias,
  esFechaISO,
  estadoEfectivo,
  fechaBogota,
  fechaDesdeColumnaDate,
  fechasProgramadas,
  metricasPorMes,
  metricasPorSemana,
  normalizarCalendario,
  parseEvidencias,
  resolverRequisitoEvidencia,
  semanaActual,
  semaforoRiesgo,
  tipoIniciativaDeCategoria,
  transicionAdmin,
  transicionDocente,
  transicionReapertura,
  validarEnvio,
} from "../src/services/matrizService.js";

const HOY = "2026-03-10";
const cal = normalizarCalendario({ fecha_inicio: "2026-02-10", num_semanas: 16 }, "2026A");

// Fila mínima de matriz; `e` sobreescribe campos del entregable.
const fila = (fecha_fin, e = {}) =>
  construirItem(
    { plantilla_id: Math.floor(Math.random() * 1e6), semana_numero: 1, mes: "marzo", entregable: "X", fecha_fin, ...e },
    HOY
  );
const reg = (fecha_fin, estado_revision, completado = true, extra = {}) =>
  fila(fecha_fin, { entregable_id: 1, completado, estado_revision, ...extra });

// ─────────── Fechas / calendario ───────────
test("fechaBogota usa la fecha civil de America/Bogota (UTC-5)", () => {
  assert.equal(fechaBogota(new Date("2026-03-01T04:59:59Z")), "2026-02-28");
  assert.equal(fechaBogota(new Date("2026-03-01T05:00:00Z")), "2026-03-01");
  // 8 p. m. en Bogotá ya es el día siguiente en UTC: la fecha civil sigue siendo la de Bogotá.
  assert.equal(fechaBogota(new Date("2026-03-10T01:00:00Z")), "2026-03-09");
});

test("fechaDesdeColumnaDate no desplaza el día (usa componentes locales del Date de pg)", () => {
  assert.equal(fechaDesdeColumnaDate(new Date(2026, 1, 10)), "2026-02-10");
  assert.equal(fechaDesdeColumnaDate("2026-02-10T00:00:00.000Z"), "2026-02-10");
  assert.equal(fechaDesdeColumnaDate(null), null);
});

test("esFechaISO rechaza fechas inexistentes", () => {
  assert.equal(esFechaISO("2026-02-28"), true);
  assert.equal(esFechaISO("2026-02-31"), false);
  assert.equal(esFechaISO("10/02/2026"), false);
});

test("semana actual según el calendario, sin asumir 16 semanas", () => {
  assert.equal(semanaActual(cal, "2026-02-10").numero, 1);
  assert.equal(semanaActual(cal, "2026-02-16").numero, 1);
  assert.equal(semanaActual(cal, "2026-02-17").numero, 2);
  assert.equal(semanaActual(cal, "2026-02-09").estado, "sin_iniciar");
  assert.equal(semanaActual(cal, "2026-02-09").numero, null);
  // Semana 16 termina el 2026-06-01; el 2026-06-02 el semestre de 16 semanas ya finalizó…
  assert.equal(semanaActual(cal, "2026-06-01").numero, 16);
  assert.equal(semanaActual(cal, "2026-06-02").estado, "finalizado");
  // …pero uno de 18 semanas sigue en curso (semana 17).
  const cal18 = normalizarCalendario({ fecha_inicio: "2026-02-10", num_semanas: 18 }, "2026A");
  const s = semanaActual(cal18, "2026-06-02");
  assert.equal(s.numero, 17);
  assert.equal(s.total_semanas, 18);
  assert.equal(s.fecha_fin_semestre, "2026-06-15");
});

test("calendario ausente usa el valor por defecto y lo marca", () => {
  const c = normalizarCalendario(null, "2027A");
  assert.equal(c.por_defecto, true);
  assert.equal(c.fecha_inicio, "2026-02-10");
});

test("fechas programadas derivan del calendario del semestre, no de una fecha fija", () => {
  const c = normalizarCalendario({ fecha_inicio: "2026-08-03", num_semanas: 16 }, "2026B");
  assert.deepEqual(fechasProgramadas(c, { semana_numero: 2, dias_inicio: 7, dias_fin: 11 }), {
    fecha_inicio: "2026-08-10",
    fecha_fin: "2026-08-14",
  });
  // Sin offsets se usa la semana completa.
  assert.deepEqual(fechasProgramadas(c, { semana_numero: 1 }), { fecha_inicio: "2026-08-03", fecha_fin: "2026-08-09" });
  assert.deepEqual(fechasProgramadas(c, {}), { fecha_inicio: null, fecha_fin: null });
});

test("diferenciaDias es estable en cambio de mes", () => {
  assert.equal(diferenciaDias("2026-02-27", "2026-03-02"), 3);
});

// ─────────── Estados ───────────
test("el checkbox `completado` sin estado válido no cuenta como envío en filas históricas vacías", () => {
  // Fila creada por el admin: estado_revision tomó el DEFAULT 'enviado' pero nada se reportó.
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: false, estado_revision: "enviado" }), "no_iniciado");
  // Con contenido pero sin envío = borrador.
  assert.equal(
    estadoEfectivo({ entregable_id: 1, completado: false, estado_revision: "enviado", url_evidencia: "https://x.co" }),
    "borrador"
  );
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: true, estado_revision: "enviado" }), "enviado");
  assert.equal(estadoEfectivo({ entregable_id: 1, completado: true, estado_revision: "borrador" }), "borrador");
  assert.equal(estadoEfectivo(null), "no_iniciado");
  assert.equal(estadoEfectivo({ entregable_id: null }), "no_iniciado");
});

test("vencido es una condición adicional: no destruye el estado de revisión", () => {
  const k = clasificarItem(reg("2026-03-01", "observado"), HOY);
  assert.equal(k.estado, "observado");
  assert.equal(k.vencido, true);
});

test("fecha límite de hoy: exigible pero NO vencido; ayer: vencido", () => {
  const hoy = clasificarItem(fila(HOY), HOY);
  assert.equal(hoy.exigible, true);
  assert.equal(hoy.vencido, false);
  const ayer = clasificarItem(fila("2026-03-09"), HOY);
  assert.equal(ayer.vencido, true);
  const manana = clasificarItem(fila("2026-03-11"), HOY);
  assert.equal(manana.exigible, false);
  assert.equal(manana.vencido, false);
});

test("enviado (en revisión) o aprobado nunca se consideran vencidos", () => {
  assert.equal(clasificarItem(reg("2026-01-01", "enviado"), HOY).vencido, false);
  assert.equal(clasificarItem(reg("2026-01-01", "aprobado"), HOY).vencido, false);
});

test("entrega tardía se detecta con la fecha de Bogotá del primer envío", () => {
  // 2026-03-05T03:00Z = 4 de marzo 22:00 en Bogotá → a tiempo para límite 2026-03-04
  const aTiempo = reg("2026-03-04", "enviado", true, { fecha_primer_envio: new Date("2026-03-05T03:00:00Z") });
  assert.equal(aTiempo.clasificacion.entrega_tardia, false);
  const tarde = reg("2026-03-04", "enviado", true, { fecha_primer_envio: new Date("2026-03-05T06:00:00Z") });
  assert.equal(tarde.clasificacion.entrega_tardia, true);
});

// ─────────── Indicadores ───────────
test("un observado NO suma avance aprobado; un aprobado sí", () => {
  const sinAprobar = calcularMetricas([reg("2026-03-01", "observado")], HOY);
  assert.equal(sinAprobar.aprobados, 0);
  assert.equal(sinAprobar.reportados, 0);
  const aprobado = calcularMetricas([reg("2026-03-01", "aprobado")], HOY);
  assert.equal(aprobado.aprobados, 1);
  assert.equal(aprobado.reportados, 1);
});

test("borradores no cuentan como avance reportado", () => {
  const m = calcularMetricas([reg("2026-03-01", "borrador", false), fila("2026-03-01")], HOY);
  assert.equal(m.reportados, 0);
  assert.equal(m.borradores, 1);
  assert.equal(m.no_iniciados, 1);
});

test("indicadores: reportado, aprobado, esperado, brecha y cumplimiento exigible", () => {
  const items = [
    reg("2026-03-01", "aprobado"), // exigible, aprobado
    reg("2026-03-02", "enviado"), // exigible, reportado en revisión
    reg("2026-03-03", "observado"), // exigible, vencido
    fila("2026-03-04"), // exigible, vencido, no iniciado
    reg("2026-03-20", "aprobado"), // futuro, aprobado por adelantado
    fila("2026-03-25"), // futuro
    fila("2026-04-01"), // futuro
    fila(HOY), // vence hoy: exigible, no vencido
  ];
  const m = calcularMetricas(items, HOY);
  assert.equal(m.total, 8);
  assert.equal(m.reportados, 3); // 2 aprobados + 1 enviado
  assert.equal(m.aprobados, 2);
  assert.equal(m.enviados_pendientes_revision, 1);
  assert.equal(m.observados, 1);
  assert.equal(m.exigibles, 5);
  assert.equal(m.esperado, 5);
  assert.equal(m.vencidos, 2);
  assert.equal(m.brecha, -3); // 2 aprobados − 5 esperados
  assert.equal(m.exigibles_aprobados, 1);
  assert.equal(m.cumplimiento_exigible, 20); // 1 de 5
  assert.equal(m.cumplimiento_reportado_exigible, 40); // 2 de 5
  assert.equal(m.pct_reportado, 37.5);
  assert.equal(m.pct_aprobado, 25);
  assert.equal(m.pct_esperado, 62.5);
  assert.equal(m.brecha_pct, -37.5);
});

test("sin entregables exigibles no hay cumplimiento exigible ni división por cero", () => {
  const m = calcularMetricas([fila("2026-12-01")], HOY);
  assert.equal(m.cumplimiento_exigible, null);
  assert.equal(m.semaforo, "sin_exigibles");
  const vacio = calcularMetricas([], HOY);
  assert.equal(vacio.pct_reportado, 0);
  assert.equal(vacio.semaforo, "sin_datos");
});

test("semáforo según cumplimiento reportado sobre lo exigible", () => {
  const base = { total: 10, exigibles: 10 };
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 80 }), "verde");
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 79.9 }), "amarillo");
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 50 }), "amarillo");
  assert.equal(semaforoRiesgo({ ...base, cumplimiento_reportado_exigible: 49.9 }), "rojo");
});

test("indicadores individuales y consolidados usan el mismo criterio", () => {
  const a = [reg("2026-03-01", "aprobado"), fila("2026-03-02")];
  const b = [reg("2026-03-01", "observado"), reg("2026-03-02", "enviado")];
  const ma = calcularMetricas(a, HOY);
  const mb = calcularMetricas(b, HOY);
  const mc = calcularMetricas([...a, ...b], HOY);
  for (const campo of ["total", "reportados", "aprobados", "exigibles", "vencidos", "observados"]) {
    assert.equal(mc[campo], ma[campo] + mb[campo], campo);
  }
});

test("por mes y por semana derivan de los datos (meses dinámicos, alias históricos presentes)", () => {
  const items = [
    reg("2026-02-12", "aprobado", true, { mes: "febrero", semana_numero: 1 }),
    fila("2026-03-04", { mes: "marzo", semana_numero: 4 }),
    fila("2026-08-20", { mes: "agosto", semana_numero: 3 }),
  ];
  const meses = metricasPorMes(items, HOY).map((m) => m.mes);
  // Orden por primera semana en que aparece cada mes (no por calendario fijo).
  assert.deepEqual(meses, ["Febrero", "Agosto", "Marzo"]);
  const feb = metricasPorMes(items, HOY).find((m) => m.mes === "Febrero");
  assert.equal(feb.completados, 1);
  assert.equal(feb.aprobados, 1);
  assert.equal(feb.porcentaje_mensual, 100);
  const sem = metricasPorSemana(items, HOY);
  assert.deepEqual(sem.map((s) => s.semana_numero), [1, 3, 4]);
  assert.equal(sem[0].acumulado_aprobado_pct, 33.3);
});

// ─────────── Categorías / iniciativas ───────────
test("categorías de plantilla y tipo de iniciativa compatible", () => {
  assert.equal(categoriaSlug("Proyecto 1", "Alistamiento"), "proyecto");
  assert.equal(categoriaSlug("Actividad 2", ""), "actividad2");
  assert.equal(categoriaSlug("Convenios", "Convenio nuevo"), "convenio_nuevo");
  assert.equal(tipoIniciativaDeCategoria("actividad3"), "actividad");
  assert.equal(tipoIniciativaDeCategoria("convenio_dinamizado"), "convenio");
  assert.equal(tipoIniciativaDeCategoria("presupuesto"), null);
});

// ─────────── Evidencias ───────────
test("requisito de evidencia: explícito, inferido por texto histórico o permisivo por defecto", () => {
  assert.deepEqual(resolverRequisitoEvidencia({ tipo_evidencia: "drive" }), { requiere: true, tipo: "drive" });
  assert.deepEqual(resolverRequisitoEvidencia({ requiere_evidencia: false }), { requiere: false, tipo: "ninguna" });
  assert.deepEqual(
    resolverRequisitoEvidencia({ descripcion_evidencia: "Esta tarea no implica realizar cargue en la carpeta" }),
    { requiere: false, tipo: "ninguna" }
  );
  // Sin configuración: cualquier enlace sirve; no se impone Drive a todos.
  assert.deepEqual(resolverRequisitoEvidencia({ descripcion_evidencia: "Cargar PDF" }), { requiere: true, tipo: "enlace" });
});

test("un entregable que requiere evidencia no puede enviarse sin ella", () => {
  const req = { requiere: true, tipo: "enlace" };
  const v = validarEnvio({ requisito: req, evidencias: [] });
  assert.equal(v.ok, false);
  assert.equal(v.codigo, "EVIDENCIA_REQUERIDA");
});

test("excepción justificada: exige texto suficiente y queda marcada como exenta", () => {
  const req = { requiere: true, tipo: "enlace" };
  assert.equal(validarEnvio({ requisito: req, evidencias: [], exencion: "corta" }).ok, false);
  const ok = validarEnvio({ requisito: req, evidencias: [], exencion: "Reunión virtual sin soporte documental" });
  assert.equal(ok.ok, true);
  assert.equal(ok.exenta, true);
});

test("entregable sin evidencia obligatoria se envía sin enlace", () => {
  assert.equal(validarEnvio({ requisito: { requiere: false, tipo: "ninguna" }, evidencias: [] }).ok, true);
});

test("formatos de evidencia distintos por tipo", () => {
  const drive = { requiere: true, tipo: "drive" };
  assert.equal(validarEnvio({ requisito: drive, evidencias: ["https://drive.google.com/file/d/abc/view"] }).ok, true);
  assert.equal(validarEnvio({ requisito: drive, evidencias: ["https://ejemplo.com/a.pdf"] }).ok, false);
  const form = { requiere: true, tipo: "formulario" };
  assert.equal(validarEnvio({ requisito: form, evidencias: ["https://forms.gle/abc"] }).ok, true);
  assert.equal(validarEnvio({ requisito: form, evidencias: ["https://docs.google.com/forms/d/e/1/viewform"] }).ok, true);
  assert.equal(validarEnvio({ requisito: form, evidencias: ["https://drive.google.com/x"] }).ok, false);
  const enlace = { requiere: true, tipo: "enlace" };
  assert.equal(validarEnvio({ requisito: enlace, evidencias: ["https://cualquiera.org/x"] }).ok, true);
  assert.equal(validarEnvio({ requisito: enlace, evidencias: ["no es un link"] }).codigo, "EVIDENCIA_INVALIDA");
  assert.equal(validarEnvio({ requisito: enlace, evidencias: ["javascript:alert(1)"] }).ok, false);
});

test("parseEvidencias soporta el formato histórico (texto) y el JSON de varios enlaces", () => {
  assert.deepEqual(parseEvidencias("https://a.co/x"), ["https://a.co/x"]);
  assert.deepEqual(parseEvidencias('["https://a.co/x","https://b.co/y"]'), ["https://a.co/x", "https://b.co/y"]);
  assert.deepEqual(parseEvidencias("https://a.co/x https://b.co/y"), ["https://a.co/x", "https://b.co/y"]);
  assert.deepEqual(parseEvidencias(null), []);
  assert.deepEqual(parseEvidencias("  "), []);
});

// ─────────── Transiciones ───────────
test("docente: un aprobado queda bloqueado para cualquier acción", () => {
  for (const accion of ["guardar_borrador", "enviar", "retirar"]) {
    const t = transicionDocente("aprobado", accion);
    assert.equal(t.ok, false, accion);
    assert.equal(t.codigo, "ESTADO_BLOQUEADO");
  }
});

test("docente: observado permite corregir (sin perder el estado) y reenviar", () => {
  assert.equal(transicionDocente("observado", "guardar_borrador").estado, "observado");
  const re = transicionDocente("observado", "enviar");
  assert.equal(re.estado, "enviado");
  assert.equal(re.evento, "reenvio");
  assert.equal(transicionDocente("observado", "retirar").ok, false);
});

test("docente: enviar dos veces no duplica el envío", () => {
  const t = transicionDocente("enviado", "enviar");
  assert.equal(t.ok, true);
  assert.equal(t.sinCambios, true);
  assert.equal(t.evento, null);
});

test("docente: primer envío y retiro", () => {
  assert.equal(transicionDocente("no_iniciado", "enviar").evento, "envio");
  assert.equal(transicionDocente("borrador", "enviar").evento, "envio");
  assert.equal(transicionDocente("enviado", "retirar").estado, "borrador");
});

test("admin: solo decide sobre entregables enviados; observar exige comentario", () => {
  assert.equal(transicionAdmin("enviado", "aprobado").estado, "aprobado");
  assert.equal(transicionAdmin("enviado", "observado", { comentario: "" }).codigo, "COMENTARIO_REQUERIDO");
  assert.equal(transicionAdmin("enviado", "observado", { comentario: "Falta firma" }).estado, "observado");
  assert.equal(transicionAdmin("borrador", "aprobado").codigo, "NO_ENVIADO");
  assert.equal(transicionAdmin("no_iniciado", "aprobado").codigo, "NO_ENVIADO");
  assert.equal(transicionAdmin("enviado", "enviado").ok, false);
});

test("admin: un aprobado no vuelve atrás sin el procedimiento de reapertura", () => {
  assert.equal(transicionAdmin("aprobado", "observado", { comentario: "x" }).codigo, "ESTADO_BLOQUEADO");
  assert.equal(transicionAdmin("aprobado", "aprobado").sinCambios, true);
  assert.equal(transicionReapertura("aprobado", { motivo: "corto" }).codigo, "MOTIVO_REQUERIDO");
  assert.equal(transicionReapertura("enviado", { motivo: "motivo suficientemente largo" }).codigo, "ESTADO_INVALIDO");
  const ok = transicionReapertura("aprobado", { motivo: "El acta cargada no corresponde", destino: "observado" });
  assert.equal(ok.estado, "observado");
  assert.equal(ok.evento, "reapertura");
});
