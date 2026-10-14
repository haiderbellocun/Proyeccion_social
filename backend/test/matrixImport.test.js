// Pruebas unitarias del lector .xlsx y de la validación/planificación de importaciones (sin BD).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { abrirLibro, ArchivoInvalidoError, LIMITES } from "../src/services/xlsxReader.js";
import { crearXlsx, hojaCronograma, zip } from "./support/xlsxBuilder.js";
import {
  detectarEstructura, extraerFilas, leerCabecera, listarHojas, mapeoALetras, mapeoAIndices, validarYPlanificar, normalizar, sugerirGrupo,
} from "../src/services/matrixImportService.js";

const CAL = { fecha_inicio: "2026-02-10", num_semanas: 16 }; // semestre sintético

const semanas = (extra = []) => [
  { mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento y Capacitación", items: [
    { numero: 1, entregable: "Diligenciar compromiso", horas: 1, inicio: "2026-02-11", fin: "2026-02-14" },
    { numero: 2, entregable: "Leer la política", descripcion: "https://drive.google.com/file/d/ABC/view", horas: 2, inicio: "2026-02-12", fin: "2026-02-14" },
  ] },
  { mes: "Febrero", semana: 2, items: [{ numero: 3, entregable: "Socialización", horas: 3, inicio: "2026-02-17", fin: "2026-02-17" }] },
  { mes: "Marzo", semana: 4, fase: "Marzo \nGestión con aliados", items: [{ numero: 4, entregable: "Contactar aliados", horas: 4, inicio: "2026-03-03", fin: "2026-03-06" }] },
  ...extra,
];
const analizar = (xlsx, idx = 0, opciones = {}) => {
  const { libro } = listarHojas(xlsx);
  const hoja = libro.leerHoja(idx);
  const est = detectarEstructura(hoja);
  const ex = extraerFilas(hoja, est);
  return { hoja, est, ex, ...validarYPlanificar({ extraccion: ex, calendario: CAL, ...opciones }) };
};

// ─────────── Lector ───────────
test("lector: hojas, estado oculto, fechas, fórmulas, errores y celdas combinadas", () => {
  const buf = crearXlsx([
    { nombre: "Datos", filas: { 1: { 1: "texto", 2: 3.5, 3: { fecha: "2026-02-11" }, 4: { formula: "A1&B1", cache: "x" }, 5: { error: "#REF!" }, 6: { formula: "1+1" } } }, combinadas: ["A1:B1"] },
    { nombre: "Oculta", estado: "hidden", filas: {} },
  ]);
  const libro = abrirLibro(buf);
  assert.deepEqual(libro.hojas.map((h) => [h.nombre, h.estado]), [["Datos", "visible"], ["Oculta", "hidden"]]);
  const h = libro.leerHoja(0);
  assert.equal(h.valor(1, 1), "texto");
  assert.equal(h.valor(1, 2), 3.5);
  assert.deepEqual([h.celda(1, 3).t, h.celda(1, 3).v], ["d", "2026-02-11"]);
  assert.equal(h.celda(1, 4).formula, true);
  assert.equal(h.celda(1, 5).t, "e");
  assert.equal(h.celda(1, 6).t, "z", "fórmula sin valor guardado");
  assert.equal(h.combinadas.length, 1);
});

test("lector: funciona con ZIP comprimido (deflate) igual que sin comprimir", () => {
  const hojas = [{ nombre: "A", filas: { 1: { 1: "hola", 2: 7 } } }];
  const a = abrirLibro(crearXlsx(hojas)).leerHoja(0);
  const b = abrirLibro(crearXlsx(hojas, { comprimir: true })).leerHoja(0);
  assert.equal(a.valor(1, 1), b.valor(1, 1));
  assert.equal(b.valor(1, 2), 7);
});

test("archivos corruptos o inválidos se rechazan con un error controlado", () => {
  const bueno = crearXlsx([{ nombre: "A", filas: { 1: { 1: "x" } } }]);
  const casos = {
    vacio: Buffer.alloc(0),
    texto: Buffer.from("esto no es un excel, es texto plano de prueba"),
    truncado: bueno.subarray(0, Math.floor(bueno.length / 2)),
    aleatorio: Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 37) % 256)),
    sinLibro: zip({ "otro.xml": "<a/>" }),
    sinHojas: zip({ "xl/workbook.xml": "<workbook><sheets></sheets></workbook>" }),
  };
  for (const [nombre, buf] of Object.entries(casos)) {
    assert.throws(() => abrirLibro(buf), (e) => e instanceof ArchivoInvalidoError, nombre);
  }
  const danado = Buffer.from(crearXlsx([{ nombre: "A", filas: { 1: { 1: "x" } } }], { comprimir: true }));
  const ini = danado.indexOf("xl/workbook.xml") + "xl/workbook.xml".length;
  danado.fill(0xff, ini, ini + 8); // flujo deflate inválido en workbook.xml
  assert.throws(() => abrirLibro(danado).leerHoja(0), ArchivoInvalidoError);
});

test("protección contra ZIP bomb y archivos enormes", () => {
  const bomba = Buffer.from(zip({ "xl/workbook.xml": "x".repeat(10) }));
  const idx = bomba.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bomba.writeUInt32LE(LIMITES.maxBytesEntrada + 1, idx + 24);
  assert.throws(() => abrirLibro(bomba), /demasiado grande/);
  const enorme = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(LIMITES.maxBytes + 1)]);
  assert.throws(() => abrirLibro(enorme), /tamaño máximo/);
  const real = zlib.deflateRawSync(Buffer.alloc(200 * 1024 * 1024));
  assert.ok(real.length < 1_000_000, "una entrada de 200 MB comprime a casi nada (caso típico de bomba)");
});

// ─────────── Estructura ───────────
test("detecta cronograma y listado, encabezados y mapeo de columnas", () => {
  const crono = crearXlsx([hojaCronograma("G1", semanas())]);
  const e = detectarEstructura(abrirLibro(crono).leerHoja(0));
  assert.equal(e.tipo, "cronograma");
  assert.equal(e.filaEncabezado, 8);
  assert.deepEqual(mapeoALetras(e.mapeo), { categoria: "A", numero: "B", entregable: "G", descripcion: "H", horas: "I", fecha_inicio: "J", fecha_fin: "K" });
  assert.deepEqual(e.columnasIgnoradas.sort(), ["L", "M"], "estatus y fecha real se ignoran");

  const listado = crearXlsx([{ nombre: "Base", filas: { 4: { 2: "Ubicación en MS", 3: "No. ", 4: "Entregable", 5: "Descripción Evidencia Documental", 6: "Horas establecidas" }, 5: { 2: "Febrero - Semana 1", 3: 1, 4: "A", 6: 2 } } }]);
  const l = detectarEstructura(abrirLibro(listado).leerHoja(0));
  assert.equal(l.tipo, "listado");
  assert.equal(l.mapeo.ubicacion, 2);
  const nada = crearXlsx([{ nombre: "Listado  de desplegables", filas: { 1: { 1: "solo texto" } } }]);
  assert.equal(detectarEstructura(abrirLibro(nada).leerHoja(0)).tipo, "catalogo");
});

test("mapeo manual: letras válidas a índices; inválidas se rechazan", () => {
  assert.deepEqual(mapeoAIndices({ numero: "B", entregable: "g" }), { numero: 2, entregable: 7 });
  assert.equal(mapeoAIndices({ numero: "B2" }), null);
  assert.equal(mapeoAIndices({ numero: "ZZZZ" }), null);
});

test("cabecera: no expone datos personales y sugiere cantidades del grupo", () => {
  const h = abrirLibro(crearXlsx([hojaCronograma("G", semanas())])).leerHoja(0);
  const c = leerCabecera(h);
  assert.equal(c.docente_detectado, true);
  assert.equal(c.programa, "Programa Sintético");
  assert.equal(c.horas_ps, 24);
  assert.ok(!JSON.stringify(c).includes("Docente Sintético"));
  assert.equal(sugerirGrupo("Indicador - 1 Proyecto - 4 Actividades - 2 Convenios dinamizados", 24).num_actividades, 4);
});

// ─────────── Extracción ───────────
test("extrae filas con contexto de fase, mes y semana; ignora la cola", () => {
  const xlsx = crearXlsx([hojaCronograma("G", semanas(), { cola: [{ 1: "Programa Académico", 7: "texto de apoyo sin número" }, { 7: "otra nota" }] })]);
  const { ex } = analizar(xlsx);
  assert.equal(ex.filas.length, 4);
  assert.equal(ex.filasIgnoradasEnCola, 2);
  const [a, , c, d] = ex.filas;
  assert.equal(a.fase, "Febrero Alistamiento y Capacitación");
  assert.deepEqual([a.mes, a.semana, a.fecha_inicio, a.fecha_fin, a.horas], ["febrero", 1, "2026-02-11", "2026-02-14", 1]);
  assert.equal(c.semana, 2);
  assert.deepEqual([d.mes, d.semana, d.fase], ["marzo", 4, "Marzo Gestión con aliados"]);
});

// ─────────── Validación ───────────
test("plantilla válida: todas las filas se crean sin errores", () => {
  const { resumen, decisionesRequeridas } = analizar(crearXlsx([hojaCronograma("G", semanas())]));
  assert.deepEqual([resumen.total, resumen.errores, resumen.crear, resumen.pendientes], [4, 0, 4, 0]);
  assert.equal(decisionesRequeridas.length, 0);
  assert.equal(resumen.horas_programadas, 10);
});

test("números duplicados: se exige decisión; renumerar conserva todo; omitir conserva la primera", () => {
  const dup = semanas([{ mes: "Marzo", semana: 5, items: [{ numero: 3, entregable: "Repetido", inicio: "2026-03-10", fin: "2026-03-12" }] }]);
  const xlsx = crearXlsx([hojaCronograma("G", dup)]);
  const sin = analizar(xlsx);
  assert.deepEqual(sin.decisionesRequeridas.map((d) => d.id), ["duplicados"]);
  assert.ok(sin.filas.filter((f) => f.numero === 3).every((f) => f.estado === "pendiente"));
  assert.equal(sin.resumen.crear, 3, "las filas no afectadas siguen válidas");

  const ren = analizar(xlsx, 0, { decisiones: { duplicados: "renumerar" } });
  assert.equal(ren.resumen.crear, 5);
  assert.equal(new Set(ren.filas.map((f) => f.numero)).size, 5);
  assert.equal(ren.filas.at(-1).numero_original, 3);

  const omi = analizar(xlsx, 0, { decisiones: { duplicados: "omitir" } });
  assert.equal(omi.resumen.crear, 4);
  assert.equal(omi.resumen.omitir, 1);
});

test("fechas inválidas, fuera del semestre, invertidas, horas negativas y campos vacíos se rechazan", () => {
  const malas = [{ mes: "Marzo", semana: 4, items: [
    { numero: 10, entregable: "Fecha fuera de semestre", inicio: "2027-03-03", fin: "2027-03-06" },
    { numero: 11, entregable: "Fin antes del inicio", inicio: "2026-03-06", fin: "2026-03-03" },
    { numero: 12, entregable: "Horas negativas", horas: -3, inicio: "2026-03-03", fin: "2026-03-04" },
    { numero: 13, entregable: "Fecha basura", inicio: "2026-03-03", fin: "2026-03-04", extra: { 10: "31/02/2026" } },
    { numero: 14, entregable: "   ", inicio: "2026-03-03", fin: "2026-03-04" },
    { entregable: "Sin número", inicio: "2026-03-03", fin: "2026-03-04" },
    { numero: 15, entregable: "Con referencia rota", inicio: "2026-03-03", fin: "2026-03-04", extra: { 9: { error: "#REF!" } } },
    { numero: 16, entregable: "Horas como texto", horas: 1, inicio: "2026-03-03", fin: "2026-03-04", extra: { 9: "abc" } },
  ] }];
  const { filas, resumen } = analizar(crearXlsx([hojaCronograma("G", malas)]));
  const codigos = Object.fromEntries(filas.map((f) => [f.numero ?? "sin", f.mensajes.filter((m) => m.nivel === "error").map((m) => m.codigo)]));
  assert.deepEqual(codigos[10], ["FECHA_FUERA_SEMESTRE"]);
  assert.deepEqual(codigos[11], ["FECHA_INICIO_POSTERIOR"]);
  assert.deepEqual(codigos[12], ["HORAS_NEGATIVAS"]);
  assert.deepEqual(codigos[13], ["FECHA_INVALIDA"]);
  assert.ok(codigos[14].includes("ENTREGABLE_VACIO"));
  assert.ok(codigos.sin.includes("NUMERO_VACIO"));
  assert.ok(codigos[15].includes("REFERENCIA_ROTA"));
  assert.ok(codigos[16].includes("HORAS_INVALIDAS"));
  assert.equal(resumen.errores, 8);
  assert.equal(resumen.crear, 0, "ninguna fila defectuosa entra al plan de escritura");
  assert.ok(filas.every((f) => f.accion === "rechazar"));
});

test("semana inexistente en el semestre; sin calendario no se inventan fechas", () => {
  const s = [{ mes: "Mayo", semana: 20, items: [{ numero: 1, entregable: "Semana 20" }] }];
  const r = analizar(crearXlsx([hojaCronograma("G", s)]));
  assert.ok(r.filas[0].mensajes.some((m) => m.codigo === "SEMANA_FUERA_SEMESTRE"));
  const sinCal = validarYPlanificar({ extraccion: r.ex, calendario: null });
  assert.ok(sinCal.filas.every((f) => f.dias_inicio === undefined), "sin calendario no se calculan días");
});

test("semana distinta a la de la fecha exige decisión (fecha | etiqueta)", () => {
  const s = [{ mes: "Marzo", semana: 9, items: [{ numero: 1, entregable: "Etiqueta 9, fecha en semana 4", inicio: "2026-03-03", fin: "2026-03-06" }] }];
  const xlsx = crearXlsx([hojaCronograma("G", s)]);
  const sin = analizar(xlsx);
  assert.deepEqual(sin.decisionesRequeridas.map((d) => d.id), ["semana"]);
  assert.equal(sin.filas[0].estado, "pendiente");
  assert.equal(analizar(xlsx, 0, { decisiones: { semana: "fecha" } }).filas[0].semana, 4);
  assert.equal(analizar(xlsx, 0, { decisiones: { semana: "etiqueta" } }).filas[0].semana, 9);
});

test("listado sin fechas: se derivan de la semana y se advierte", () => {
  const xlsx = crearXlsx([{ nombre: "Base", filas: {
    4: { 2: "Ubicación en MS", 3: "No. ", 4: "Entregable", 6: "Horas establecidas" },
    5: { 2: "Febrero - Semana 2", 3: 1, 4: "Uno", 6: 2 },
    6: { 3: 2, 4: "Dos", 6: 1 },
  } }]);
  const r = analizar(xlsx, 0, { sinFechasEnHoja: true });
  assert.deepEqual([r.filas[0].dias_inicio, r.filas[0].dias_fin], [7, 13]);
  assert.ok(r.filas.every((f) => f.mensajes.some((m) => m.codigo === "FECHAS_DERIVADAS")));
  assert.equal(r.filas[1].semana, 2, "la semana se propaga a las filas siguientes");
});

test("importar dos veces: sin_cambios; cambios se actualizan; con reportes se protegen", () => {
  const base = analizar(crearXlsx([hojaCronograma("G", semanas())]));
  const existentes = base.filas.map((f, i) => ({
    id: 100 + i, numero: f.numero, entregable: f.entregable, descripcion_evidencia: f.descripcion, horas: f.horas, semana_numero: f.semana,
    mes: f.mes, fase: f.fase, dias_inicio_desde_feb: f.dias_inicio, dias_fin_desde_feb: f.dias_fin, tiene_reportes: false,
  }));
  const igual = analizar(crearXlsx([hojaCronograma("G", semanas())]), 0, { existentes });
  assert.deepEqual([igual.resumen.sin_cambios, igual.resumen.crear, igual.resumen.actualizar], [4, 0, 0]);

  const cambiado = semanas();
  cambiado[0].items[0].horas = 5;
  cambiado[2].items.push({ numero: 9, entregable: "Nuevo", inicio: "2026-03-04", fin: "2026-03-05" });
  const alt = analizar(crearXlsx([hojaCronograma("G", cambiado)]), 0, { existentes });
  assert.deepEqual([alt.resumen.actualizar, alt.resumen.crear, alt.resumen.sin_cambios], [1, 1, 3]);

  const protegidas = existentes.map((e) => (e.numero === 1 ? { ...e, tiene_reportes: true } : e));
  const prot = analizar(crearXlsx([hojaCronograma("G", cambiado)]), 0, { existentes: protegidas });
  assert.equal(prot.filas.find((f) => f.numero === 1).accion, "omitir");
  assert.ok(prot.filas.find((f) => f.numero === 1).mensajes.some((m) => m.codigo === "TIENE_REPORTES"));
  assert.equal(prot.resumen.actualizar, 0);
});

test("normalizar quita acentos y espacios", () => {
  assert.equal(normalizar("  Descripción   Evidencia "), "descripcion evidencia");
});

test("semanas de lunes (Excel) frente a un semestre que inicia en martes: se recomienda la etiqueta del Excel", () => {
  // 2026-02-10 es martes; el lunes 2026-02-23 cae en la semana 2 del semestre pero el Excel lo rotula «Semana 3»
  const s = [{ mes: "Febrero", semana: 3, items: [{ numero: 1, entregable: "Lunes", inicio: "2026-02-23", fin: "2026-02-25" }] }];
  const r = analizar(crearXlsx([hojaCronograma("G", s)]));
  const d = r.decisionesRequeridas.find((x) => x.id === "semana");
  assert.equal(d.recomendada, "etiqueta");
  assert.match(d.pregunta, /lunes a sábado/);
});

test("no se presupone que los semestres empiezan en lunes", () => {
  const sem = (fecha) => [{ mes: "Febrero", semana: 3, items: [{ numero: 1, entregable: "X", inicio: fecha, fin: fecha }] }];
  // Semestre que inicia lunes 2026-02-09: 2026-02-23 es el lunes de la semana 3 → coincide, sin decisión
  const lunes = analizar(crearXlsx([hojaCronograma("G", sem("2026-02-23"))]), 0, { calendario: { fecha_inicio: "2026-02-09", num_semanas: 16 } });
  assert.equal(lunes.decisionesRequeridas.length, 0);
  // Semestre que inicia lunes con una diferencia de 1: NO es el caso de semanas de lunes → se recomienda la fecha
  const lunesDif = analizar(crearXlsx([hojaCronograma("G", sem("2026-02-16"))]), 0, { calendario: { fecha_inicio: "2026-02-09", num_semanas: 16 } });
  assert.equal(lunesDif.decisionesRequeridas[0].recomendada, "fecha");
  // Semestre que inicia miércoles (2026-02-11): el lunes 2026-02-23 es la semana 2 del semestre → recomienda etiqueta y lo nombra
  const miercoles = analizar(crearXlsx([hojaCronograma("G", sem("2026-02-23"))]), 0, { calendario: { fecha_inicio: "2026-02-11", num_semanas: 16 } });
  assert.equal(miercoles.decisionesRequeridas[0].recomendada, "etiqueta");
  assert.match(miercoles.decisionesRequeridas[0].pregunta, /miércoles/);
});

test("las fechas originales nunca se alteran, ni siquiera con la decisión «fecha»", () => {
  const s = [{ mes: "Febrero", semana: 3, items: [{ numero: 1, entregable: "X", inicio: "2026-02-23", fin: "2026-02-25" }] }];
  const xlsx = crearXlsx([hojaCronograma("G", s)]);
  for (const decision of ["fecha", "etiqueta"]) {
    const f = analizar(xlsx, 0, { decisiones: { semana: decision } }).filas[0];
    assert.deepEqual([f.fecha_inicio, f.fecha_fin, f.dias_inicio, f.dias_fin], ["2026-02-23", "2026-02-25", 13, 15], decision);
  }
  const fecha = analizar(xlsx, 0, { decisiones: { semana: "fecha" } }).filas[0];
  assert.deepEqual([fecha.semana, fecha.semana_etiqueta], [2, 3], "queda registrada la semana original para la trazabilidad");
});
