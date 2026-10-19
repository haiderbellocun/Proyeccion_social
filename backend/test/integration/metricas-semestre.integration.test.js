// Bloque 2 (CR-01): alcance por semestre de /admin/metricas, /admin/dashboard y /admin/avance-consolidado.
// Pruebas de integración contra PostgreSQL REAL, solo en `proysocial_test` (mismas garantías que los bloques anteriores:
// PGDATABASE=proysocial_test exacto, servidor local, sin DATABASE_URL y current_database() verificado; en otro caso se OMITEN).
//   npm run test:db:setup
//   npm run test:integration:protegidos
//
// Escenario sintético (prefijo TST_K): un semestre ACTIVO en curso (2091B), uno ANTERIOR cerrado (2091A), uno FUTURO (2092A) y
// uno VACÍO (2090B). Cada docente tiene 8 entregables con fechas límite conocidas y un estado conocido; los valores esperados se
// calculan aquí, a partir de esa especificación y de las definiciones aprobadas, y se comparan con la API y con consultas
// SQL independientes: nunca contra la propia API.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET ||= "pruebas-historicos-secreto-largo-0123456789abcdef";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";

const DB_OK =
  process.env.PGDATABASE === "proysocial_test" &&
  ["localhost", "127.0.0.1", "::1"].includes(process.env.PGHOST || "localhost") &&
  !process.env.DATABASE_URL &&
  !process.env.INSTANCE_CONNECTION_NAME;
const skip = DB_OK ? false : "Estas pruebas con escritura solo corren con PGDATABASE=proysocial_test en el servidor local (npm run test:integration:protegidos)";

const { pool } = await import("../../src/db.js");
const { createSessionToken } = await import("../../src/middleware/auth.js");
const { hoyBogota, sumarDias, SEMAFORO_UMBRALES } = await import("../../src/services/matrizService.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4314;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_K";
const SEM = { act: "2091B", ant: "2091A", fut: "2092A", vac: "2090B" };
// Semestres que se solapan (casos límite de atribución de entregables sin plantilla) y un hueco sin semestre.
const OVL = { a: "2088A", b: "2088B" };
const INICIO_OVL = { a: sumarDias(hoy0(), -1500), b: sumarDias(hoy0(), -1450) };
function hoy0() { return hoyBogota(); }
const DRIVE = "https://drive.google.com/file/d/TST-K-EVIDENCIA/view";
const hoy = hoyBogota();
const INICIO = { act: sumarDias(hoy, -35), ant: sumarDias(hoy, -400), fut: sumarDias(hoy, 91), vac: sumarDias(hoy, -700) };
const OFFS = [5, 12, 19, 26, 33, 40, 47, 54]; // día de la fecha límite desde el inicio del semestre
const HORAS = 2;
const ctx = { g: {}, u: {}, p: {}, prog: {}, tpl: {} };
let server;
let tokenAdmin;
let activoOriginal = null;

async function api(ruta, token = tokenAdmin) {
  const r = await fetch(`${API}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const round1 = (v) => Math.round(v * 10) / 10;
const pct = (n, d) => (d > 0 ? round1((n / d) * 100) : 0);

/** Especificación de los docentes sintéticos: grupo, semestre y estado de sus 8 entregables (uno por fecha límite de OFFS). */
const N = "no_iniciado";
const SPEC = {
  A1: { sem: "act", grupo: "gA1", prog: "P1", regional: "Norte", tipo: "ANTIGUO", estados: ["aprobado", "aprobado", "enviado", "observado", N, "borrador", "enviado", N] },
  A2: { sem: "act", grupo: "gA1", prog: "P2", regional: "Sur", tipo: "ANTIGUO", estados: ["enviado", N, N, N, N, N, N, N] },
  N1: { sem: "act", grupo: "gA2", prog: "P1", regional: "Norte", tipo: "NUEVO", estados: ["aprobado", "aprobado", "aprobado", N, N, N, N, N] },
  P1: { sem: "ant", grupo: "gP1", prog: "P1", regional: "Norte", tipo: "ANTIGUO", estados: ["aprobado", "enviado", "observado", N, N, N, N, N] },
  F1: { sem: "fut", grupo: "gF1", prog: "P2", regional: "Sur", tipo: "ANTIGUO", estados: [N, N, N, N, N, N, N, N] },
};
const GRUPOS = { gA1: { sem: "act", tipo: "ANTIGUO" }, gA2: { sem: "act", tipo: "NUEVO" }, gP1: { sem: "ant", tipo: "ANTIGUO" }, gF1: { sem: "fut", tipo: "ANTIGUO" } };

/** Cálculo de referencia (definiciones aprobadas) de un docente a partir de su especificación. */
function refDocente(spec) {
  const items = spec.estados.map((estado, i) => ({ estado, due: sumarDias(INICIO[spec.sem], OFFS[i]) }));
  const c = { total: items.length, reportados: 0, aprobados: 0, enviados: 0, observados: 0, vencidos: 0, exigibles: 0, exigAprobados: 0, exigReportados: 0 };
  for (const it of items) {
    const reportado = it.estado === "enviado" || it.estado === "aprobado";
    if (reportado) c.reportados += 1;
    if (it.estado === "aprobado") c.aprobados += 1;
    if (it.estado === "enviado") c.enviados += 1;
    if (it.estado === "observado") c.observados += 1;
    if ((it.estado === N || it.estado === "borrador" || it.estado === "observado") && it.due < hoy) c.vencidos += 1;
    if (it.due <= hoy) {
      c.exigibles += 1;
      if (it.estado === "aprobado") c.exigAprobados += 1;
      if (reportado) c.exigReportados += 1;
    }
  }
  const pctRep = pct(c.reportados, c.total);
  const pctApr = pct(c.aprobados, c.total);
  const pctEsp = pct(c.exigibles, c.total);
  const cumpl = c.exigibles > 0 ? pct(c.exigReportados, c.exigibles) : null;
  const semaforo = c.exigibles === 0 ? "sin_exigibles" : cumpl >= SEMAFORO_UMBRALES.verde ? "verde" : cumpl >= SEMAFORO_UMBRALES.amarillo ? "amarillo" : "rojo";
  return { ...c, pctRep, pctApr, pctEsp, brecha: c.aprobados - c.exigibles, brechaPct: round1(pctApr - pctEsp), semaforo, horasProg: c.total * HORAS };
}
const docentesDe = (sem) => Object.entries(SPEC).filter(([, s]) => s.sem === sem).map(([k]) => k);

/** Esperado del resumen de /admin/metricas y de /admin/dashboard del semestre (entregables con plantilla + sin plantilla por fecha). */
const SIN_PLANTILLA = { act: { semana: 2, estado: "enviado", dueño: "A1" }, ant: { semana: 3, estado: "enviado", dueño: "P1" } };
function refResumen(sem) {
  const estados = [];
  for (const k of docentesDe(sem)) {
    SPEC[k].estados.forEach((estado, i) => estado !== N && estados.push({ estado, semana: Math.floor(OFFS[i] / 7) + 1, completado: estado !== "borrador" }));
  }
  if (SIN_PLANTILLA[sem]) estados.push({ estado: SIN_PLANTILLA[sem].estado, semana: SIN_PLANTILLA[sem].semana, completado: true });
  const comp = estados.filter((e) => e.completado);
  const aprobados = comp.filter((e) => e.estado === "aprobado").length;
  const pendientes = comp.filter((e) => e.estado === "enviado").length;
  const observados = comp.filter((e) => e.estado === "observado").length;
  const porSemana = {};
  for (const e of estados) {
    const w = (porSemana[e.semana] ??= { rep: 0, apr: 0 });
    if (e.estado === "aprobado" || (e.completado && e.estado === "enviado")) w.rep += 1;
    if (e.estado === "aprobado") w.apr += 1;
  }
  return { total_reportes: comp.length, aprobados, pendientes, con_observaciones: observados, registrados: estados.length, porcentaje_aprobacion: comp.length ? round1((aprobados / comp.length) * 100) : null, porSemana };
}

const TABLAS = [["usuarios", "id"], ["semestres", "codigo"], ["grupos_matriz", "id"], ["plantilla_entregables", "id"], ["proyectos", "id"], ["proyecto_semanas", "id"], ["proyecto_entregables", "id"], ["proyecto_docentes", "proyecto_id, docente_id"], ["entregable_evidencias", "id"], ["entregable_eventos", "id"]];
async function huella() {
  const out = {};
  for (const [t, k] of TABLAS) {
    const r = (await q(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(x::text, '|' ORDER BY ${k}), '')) AS h FROM ${t} x`))[0];
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return;
    } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("El servidor de prueba no inició");
}

async function cleanup() {
  const grupos = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  const usuarios = (await q(`SELECT id FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id = ANY($2::int[]) OR actor_id = ANY($2::int[])`, [grupos, usuarios]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM notificaciones WHERE usuario_id = ANY($1::int[])`, [usuarios]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE id = ANY($1::int[])`, [usuarios]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[...Object.values(SEM), ...Object.values(OVL)]]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
  // Restaura el semestre activo original de la base de pruebas (la prueba lo reemplaza mientras corre).
  if (activoOriginal) await q(`UPDATE semestres SET activo = (codigo = $1)`, [activoOriginal]);
}

async function mkProyecto(titulo, responsableId, inicio, semanas = 16) {
  const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, $5) RETURNING id`, [`${M} ${titulo}`, ctx.prog.P1, responsableId, inicio, semanas]))[0].id;
  for (let n = 1; n <= semanas; n += 1) {
    await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(inicio, (n - 1) * 7), sumarDias(inicio, (n - 1) * 7 + 6)]);
  }
  return p;
}
const semanaId = async (proyecto, numero) => (await q(`SELECT id FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = $2`, [proyecto, numero]))[0].id;
async function insertarEntregable({ semana, plantilla, docente, estado, fecha }) {
  const completado = estado === "enviado" || estado === "aprobado" || estado === "observado";
  await q(
    `INSERT INTO proyecto_entregables
       (proyecto_semana_id, plantilla_id, docente_id, descripcion, horas, completado, estado_revision, url_evidencia, fecha_real_entrega,
        fecha_primer_envio, fecha_cargue_evidencia, num_envios, aprobado_en, revisado_en, actividad_reportada)
     VALUES ($1, $2, $3, 'Entregable sintético', $4, $5, $6, $7, $8::date,
        CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN 1 ELSE 0 END,
        CASE WHEN $6 = 'aprobado' THEN now() END, CASE WHEN $6 IN ('aprobado', 'observado') THEN now() END,
        CASE WHEN $6 = 'borrador' THEN 'avance parcial' END)`,
    [semana, plantilla, docente, HORAS, completado, estado, completado ? DRIVE : null, completado ? fecha : null]
  );
}

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  activoOriginal = (await q(`SELECT codigo FROM semestres WHERE activo LIMIT 1`))[0]?.codigo ?? null;
  await cleanup();
  activoOriginal = activoOriginal ?? (await q(`SELECT codigo FROM semestres ORDER BY fecha_inicio DESC LIMIT 1`))[0]?.codigo ?? null;

  await q(`UPDATE semestres SET activo = false`);
  for (const k of ["act", "ant", "fut", "vac"]) {
    await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, $4)`, [SEM[k], INICIO[k], sumarDias(INICIO[k], 111), k === "act"]);
  }
  for (const k of ["P1", "P2"]) ctx.prog[k] = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa ${k}`, `${M}_${k}`]))[0].id;
  for (const [k, g] of Object.entries(GRUPOS)) {
    ctx.g[k] = (await q(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ($1, 'sintético', $2, 16, 1, 0, 0, 0, true, $3) RETURNING id`,
      [`${M} ${k}`, g.tipo, SEM[g.sem]]
    ))[0].id;
    ctx.tpl[k] = [];
    for (let i = 0; i < OFFS.length; i += 1) {
      ctx.tpl[k].push((await q(
        `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
         VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Octubre', $3, $4, 'Cargar soporte', $5, $6, $7) RETURNING id`,
        [ctx.g[k], i + 1, Math.floor(OFFS[i] / 7) + 1, `${M} ${k} entrega ${i + 1}`, HORAS, OFFS[i] - 4, OFFS[i]]
      ))[0].id);
    }
  }
  const mkUser = async (clave, rol, spec) =>
    (await q(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, regional, grupo_matriz_id)
       VALUES ($1, 'Prueba', $2, $3, $4, 'activo', $5, $6, $7) RETURNING id, nombre, apellido, correo, rol`,
      [`${M}_${clave}`, `${M}.${clave}@test.local`, rol, spec ? ctx.prog[spec.prog] : ctx.prog.P1, spec?.tipo ?? null, spec?.regional ?? null, spec ? ctx.g[spec.grupo] : null]
    ))[0];
  ctx.u.admin = await mkUser("Admin", "admin", null);
  for (const [k, spec] of Object.entries(SPEC)) ctx.u[k] = await mkUser(k, "docente", spec);
  ctx.u.Sin = await mkUser("Sin", "docente", null); // docente sin grupo: no pertenece a ningún semestre
  tokenAdmin = createSessionToken(ctx.u.admin);

  // Una iniciativa por docente, con el cronograma del semestre de su grupo; los entregables se crean con su estado.
  for (const [k, spec] of Object.entries(SPEC)) {
    const p = await mkProyecto(`Iniciativa de ${k}`, ctx.u[k].id, INICIO[spec.sem]);
    ctx.p[k] = p;
    for (let i = 0; i < OFFS.length; i += 1) {
      if (spec.estados[i] === N) continue;
      const due = sumarDias(INICIO[spec.sem], OFFS[i]);
      await insertarEntregable({ semana: await semanaId(p, Math.floor(OFFS[i] / 7) + 1), plantilla: ctx.tpl[spec.grupo][i], docente: ctx.u[k].id, estado: spec.estados[i], fecha: sumarDias(due, -1) });
    }
  }
  // Entregables SIN plantilla (de la iniciativa): pertenecen al semestre cuyas fechas contienen su semana.
  for (const [sem, def] of Object.entries(SIN_PLANTILLA)) {
    await insertarEntregable({ semana: await semanaId(ctx.p[def.dueño], def.semana), plantilla: null, docente: null, estado: def.estado, fecha: sumarDias(INICIO[sem], (def.semana - 1) * 7 + 1) });
  }
  // Casos límite de atribución: dos semestres solapados y una iniciativa cuya semana no cae en ningún semestre.
  for (const k of ["a", "b"]) await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, false)`, [OVL[k], INICIO_OVL[k], sumarDias(INICIO_OVL[k], 111)]);
  ctx.p.solapada = await mkProyecto("Iniciativa en semestres solapados", ctx.u.A1.id, INICIO_OVL.a);
  await insertarEntregable({ semana: await semanaId(ctx.p.solapada, 9), plantilla: null, docente: null, estado: "enviado", fecha: INICIO_OVL.b });
  ctx.p.hueco = await mkProyecto("Iniciativa fuera de todo semestre", ctx.u.A1.id, sumarDias(hoy, -1000));
  await insertarEntregable({ semana: await semanaId(ctx.p.hueco, 1), plantilla: null, docente: null, estado: "enviado", fecha: sumarDias(hoy, -1000) });
  // Relaciones múltiples (no deben duplicar entregables): A2 también es colaborador de la iniciativa de A1 y de la de N1.
  for (const dueño of ["A1", "N1"]) await q(`INSERT INTO proyecto_docentes (proyecto_id, docente_id, rol) VALUES ($1, $2, 'colaborador')`, [ctx.p[dueño], ctx.u.A2.id]);

  server = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ALLOWED_ORIGIN: "http://localhost:5173" },
    stdio: "ignore",
  });
  await waitForServer();
});

after(async () => {
  server?.kill();
  if (DB_OK) {
    await cleanup();
    const quedan = (await q(
      `SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g,
              (SELECT COUNT(*) FROM semestres WHERE codigo = ANY($3::text[]))::int s, (SELECT COUNT(*) FROM proyectos WHERE titulo LIKE $2)::int p,
              (SELECT COUNT(*) FROM programas WHERE nombre LIKE $2)::int pr`,
      [`${M}.%`, `${M}%`, [...Object.values(SEM), ...Object.values(OVL)]]
    ))[0];
    assert.deepEqual(quedan, { u: 0, g: 0, s: 0, p: 0, pr: 0 }, "no deben quedar fixtures");
    assert.equal((await q(`SELECT COUNT(*)::int n FROM semestres WHERE activo`))[0].n, 1, "se restauró el semestre activo original");
  }
  await pool.end();
});

const por = (arr, k) => Object.fromEntries(arr.map((x) => [x[k], x]));
const ids = (...claves) => claves.map((k) => ctx.u[k].id).sort((a, b) => a - b);
const mesesEsperados = (sem) => {
  const out = [];
  const ini = new Date(`${INICIO[sem]}T00:00:00Z`);
  const fin = new Date(`${sumarDias(INICIO[sem], 111)}T00:00:00Z`);
  for (let y = ini.getUTCFullYear(), m = ini.getUTCMonth(); y < fin.getUTCFullYear() || (y === fin.getUTCFullYear() && m <= fin.getUTCMonth()); m += 1) {
    if (m > 11) { m = 0; y += 1; }
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return out;
};
/** Esperado de `por_mes`: reportes completados por mes de la fecha de entrega (día anterior a la fecha límite / de envío). */
function refPorMes(sem) {
  const cuenta = {};
  const sumar = (fecha, estado) => { const k = fecha.slice(0, 7); (cuenta[k] ??= { total: 0, aprobados: 0, observados: 0, pendientes: 0 }); const c = cuenta[k]; c.total += 1; if (estado === "aprobado") c.aprobados += 1; if (estado === "observado") c.observados += 1; if (estado === "enviado") c.pendientes += 1; };
  for (const k of docentesDe(sem)) SPEC[k].estados.forEach((estado, i) => estado !== N && estado !== "borrador" && sumar(sumarDias(sumarDias(INICIO[sem], OFFS[i]), -1), estado));
  if (SIN_PLANTILLA[sem]) sumar(sumarDias(INICIO[sem], (SIN_PLANTILLA[sem].semana - 1) * 7 + 1), SIN_PLANTILLA[sem].estado);
  return mesesEsperados(sem).map((mes) => cuenta[mes] ?? { total: 0, aprobados: 0, observados: 0, pendientes: 0 });
}

// ───────────────────────── 1–3. Alcance por semestre ─────────────────────────
test("1–2. Sin parámetro se usa el semestre activo; coincide con pedirlo explícitamente", { skip }, async () => {
  const sin = await api("/admin/metricas");
  const con = await api(`/admin/metricas?semestre=${SEM.act}`);
  assert.equal(sin.status, 200);
  assert.equal(sin.data.alcance.semestre, SEM.act);
  assert.equal(sin.data.alcance.origen, "semestre_activo");
  assert.equal(sin.data.alcance.activo, true);
  assert.equal(con.data.alcance.origen, "parametro");
  assert.deepEqual({ ...sin.data, alcance: null }, { ...con.data, alcance: null }, "mismo contenido con y sin parámetro");
  for (const ruta of ["dashboard", "avance-consolidado"]) {
    const a = await api(`/admin/${ruta}`);
    const b = await api(`/admin/${ruta}?semestre=${SEM.act}`);
    assert.equal(a.data.alcance.semestre, SEM.act, ruta);
    assert.deepEqual({ ...a.data, alcance: null }, { ...b.data, alcance: null }, ruta);
  }
});

test("1. /admin/metricas del semestre activo no contiene datos de los otros semestres", { skip }, async () => {
  const { data } = await api(`/admin/metricas?semestre=${SEM.act}`);
  const ref = refResumen("act");
  assert.deepEqual(data.resumen, { total_reportes: ref.total_reportes, aprobados: ref.aprobados, pendientes: ref.pendientes, con_observaciones: ref.con_observaciones, porcentaje_aprobacion: ref.porcentaje_aprobacion });
  // Solo grupos del semestre; ningún grupo ni docente del semestre anterior o futuro.
  assert.deepEqual(data.por_grupo.map((g) => g.grupo_id).sort(), [ctx.g.gA1, ctx.g.gA2].sort((a, b) => a - b));
  assert.ok(data.por_grupo.every((g) => g.semestre === SEM.act));
  assert.deepEqual(data.top_atrasados.map((d) => d.docente_id).sort((a, b) => a - b), ids("A1", "A2", "N1"));
  assert.ok(!data.top_atrasados.some((d) => [ctx.u.P1.id, ctx.u.F1.id, ctx.u.Sin.id].includes(d.docente_id)));
  assert.equal(data.por_mes.length, mesesEsperados("act").length, "meses del calendario del semestre");
  assert.deepEqual(data.por_mes.map(({ total, aprobados, observados, pendientes }) => ({ total, aprobados, observados, pendientes })), refPorMes("act"));
});

test("3. Un semestre anterior se consulta de forma explícita y devuelve solo su periodo", { skip }, async () => {
  const { data } = await api(`/admin/metricas?semestre=${SEM.ant}`);
  const ref = refResumen("ant");
  assert.equal(data.alcance.semestre, SEM.ant);
  assert.equal(data.alcance.activo, false);
  assert.equal(data.alcance.estado_periodo, "cerrado");
  assert.deepEqual(data.resumen, { total_reportes: ref.total_reportes, aprobados: ref.aprobados, pendientes: ref.pendientes, con_observaciones: ref.con_observaciones, porcentaje_aprobacion: ref.porcentaje_aprobacion });
  assert.deepEqual(data.por_grupo.map((g) => g.grupo_id), [ctx.g.gP1]);
  assert.deepEqual(data.top_atrasados.map((d) => d.docente_id), [ctx.u.P1.id]);
  assert.deepEqual(data.por_mes.map(({ total, aprobados, observados, pendientes }) => ({ total, aprobados, observados, pendientes })), refPorMes("ant"));
  // Histórico cerrado: todas sus fechas límite ya pasaron, así que todo lo no aprobado/enviado cuenta como vencido (cumplimiento histórico).
  const r = refDocente(SPEC.P1);
  assert.equal(data.top_atrasados[0].entregables_vencidos, r.vencidos);
  assert.equal(r.exigibles, 8);
});

// ───────────────────────── 4. Semestre vacío ─────────────────────────
test("4. Un semestre sin información devuelve estado vacío válido, sin valores heredados ni ceros engañosos", { skip }, async () => {
  const m = await api(`/admin/metricas?semestre=${SEM.vac}`);
  assert.equal(m.status, 200);
  assert.equal(m.data.alcance.vacio, true);
  assert.deepEqual(m.data.resumen, { total_reportes: 0, aprobados: 0, pendientes: 0, con_observaciones: 0, porcentaje_aprobacion: null });
  assert.deepEqual(m.data.por_grupo, []);
  assert.deepEqual(m.data.por_regional, []);
  assert.deepEqual(m.data.top_atrasados, []);
  assert.ok(m.data.por_mes.every((x) => x.total === 0) && m.data.por_mes.length === mesesEsperados("vac").length);
  const d = await api(`/admin/dashboard?semestre=${SEM.vac}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.alcance.vacio, true);
  assert.equal(d.data.stats.total_docentes, 0);
  assert.equal(d.data.stats.reportes_enviados, 0);
  assert.equal(d.data.stats.proyectos_activos, 0);
  assert.equal(d.data.stats.avance_reportado_promedio, null, "promedio no calculable = null, no 0");
  assert.equal(d.data.stats.avance_aprobado_promedio, null);
  assert.deepEqual(d.data.docentes_recientes, []);
  assert.deepEqual(d.data.cumplimiento_por_programa, []);
  assert.ok(d.data.progreso_semanal.length === 16 && d.data.progreso_semanal.every((s) => s.reportados === 0 && s.aprobados === 0));
  const a = await api(`/admin/avance-consolidado?semestre=${SEM.vac}`);
  assert.equal(a.status, 200);
  assert.deepEqual(a.data.docentes, []);
  assert.equal(a.data.totales.promedio_global, null);
  assert.equal(a.data.totales.docentes, 0);
});

// ───────────────────────── 5. Totales contra consultas independientes ─────────────────────────
test("5. Los totales coinciden con consultas independientes a PostgreSQL (una por semestre)", { skip }, async () => {
  for (const sem of ["act", "ant", "fut", "vac"]) {
    // Consulta de referencia, formulada de otro modo: parte de grupos → plantillas → entregables, y suma aparte los sin plantilla por fecha.
    const [conPlantilla] = await q(
      `SELECT COUNT(*) FILTER (WHERE pe.completado)::int AS total, COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'aprobado')::int AS apr,
              COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'enviado')::int AS pen, COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'observado')::int AS obs,
              COUNT(*)::int AS registrados
       FROM grupos_matriz g JOIN plantilla_entregables t ON t.grupo_id = g.id JOIN proyecto_entregables pe ON pe.plantilla_id = t.id
       WHERE g.semestre = $1`, [SEM[sem]]);
    const [sinPlantilla] = await q(
      `SELECT COUNT(*) FILTER (WHERE pe.completado)::int AS total, COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'aprobado')::int AS apr,
              COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'enviado')::int AS pen, COUNT(*) FILTER (WHERE pe.completado AND pe.estado_revision = 'observado')::int AS obs,
              COUNT(*)::int AS registrados
       FROM proyecto_entregables pe JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
       WHERE pe.plantilla_id IS NULL AND ps.fecha_inicio BETWEEN $1::date AND $2::date`, [INICIO[sem], sumarDias(INICIO[sem], 111)]);
    const esperado = { total_reportes: conPlantilla.total + sinPlantilla.total, aprobados: conPlantilla.apr + sinPlantilla.apr, pendientes: conPlantilla.pen + sinPlantilla.pen, con_observaciones: conPlantilla.obs + sinPlantilla.obs };
    const { data } = await api(`/admin/metricas?semestre=${SEM[sem]}`);
    assert.deepEqual({ total_reportes: data.resumen.total_reportes, aprobados: data.resumen.aprobados, pendientes: data.resumen.pendientes, con_observaciones: data.resumen.con_observaciones }, esperado, `resumen ${sem}`);
    // Y la misma cifra sale de la especificación sintética (no solo de la base de datos).
    assert.equal(data.resumen.total_reportes, refResumen(sem).total_reportes, `resumen ${sem} contra la especificación`);
    const d = await api(`/admin/dashboard?semestre=${SEM[sem]}`);
    assert.equal(d.data.stats.reportes_enviados, esperado.aprobados + esperado.pendientes, `dashboard enviados ${sem}`);
    assert.equal(d.data.stats.pendientes_revision, esperado.pendientes);
    assert.equal(d.data.stats.reportes_aprobados, esperado.aprobados);
    assert.equal(d.data.stats.reportes_observados, esperado.con_observaciones);
    // 14: ninguna fila duplicada por relaciones múltiples (colaboradores): los registrados coinciden con el conteo directo de filas.
    const total = d.data.progreso_semanal.reduce((s, w) => s + w.reportados, 0);
    assert.equal(total, esperado.aprobados + esperado.pendientes, `progreso semanal ${sem}: suma de semanas = enviados + aprobados`);
  }
});

// ───────────────────────── 6–8. Rankings, vencimientos y fórmulas ─────────────────────────
test("6. Rankings, regionales y programas usan únicamente la población del semestre", { skip }, async () => {
  const { data } = await api(`/admin/metricas?semestre=${SEM.act}`);
  const refs = Object.fromEntries(docentesDe("act").map((k) => [k, refDocente(SPEC[k])]));
  const esperadoRanking = docentesDe("act")
    .map((k) => ({ id: ctx.u[k].id, nombre: `${M}_${k} Prueba`, v: refs[k].vencidos, apr: refs[k].pctApr }))
    .sort((a, b) => b.v - a.v || a.apr - b.apr || a.nombre.localeCompare(b.nombre));
  assert.deepEqual(data.top_atrasados.map((d) => d.docente_id), esperadoRanking.map((d) => d.id));
  assert.deepEqual(data.top_atrasados.map((d) => d.entregables_vencidos), esperadoRanking.map((d) => d.v));
  const regionales = por(data.por_regional, "regional");
  for (const regional of ["Norte", "Sur"]) {
    const miembros = docentesDe("act").filter((k) => SPEC[k].regional === regional);
    assert.equal(regionales[regional].docentes, miembros.length);
    assert.equal(regionales[regional].porcentaje_reportado, round1(miembros.reduce((s, k) => s + refs[k].pctRep, 0) / miembros.length));
    assert.equal(regionales[regional].porcentaje_aprobado, round1(miembros.reduce((s, k) => s + refs[k].pctApr, 0) / miembros.length));
  }
  const dash = await api(`/admin/dashboard?semestre=${SEM.act}`);
  const programas = por(dash.data.cumplimiento_por_programa, "programa");
  for (const p of ["P1", "P2"]) {
    const miembros = docentesDe("act").filter((k) => SPEC[k].prog === p);
    assert.equal(programas[`${M} Programa ${p}`].docentes, miembros.length, `programa ${p} solo con docentes del semestre`);
    assert.equal(programas[`${M} Programa ${p}`].porcentaje_reportado, round1(miembros.reduce((s, k) => s + refs[k].pctRep, 0) / miembros.length));
  }
});

test("7. Los vencimientos respetan las fechas y semanas de cada semestre (activo, cerrado, futuro)", { skip }, async () => {
  const dash = async (sem) => (await api(`/admin/dashboard?semestre=${SEM[sem]}`)).data;
  // Activo en curso: vencidos y exigibles según la fecha de hoy (America/Bogota) y el calendario del semestre.
  const act = await dash("act");
  assert.equal(act.semana_actual.estado, "en_curso");
  assert.equal(act.semana_actual.numero, Math.floor(35 / 7) + 1);
  const filas = por(act.docentes_recientes, "id");
  for (const k of docentesDe("act")) {
    const r = refDocente(SPEC[k]);
    assert.equal(filas[ctx.u[k].id].vencidos, r.vencidos, `vencidos de ${k}`);
    assert.equal(filas[ctx.u[k].id].estado, r.vencidos > 0 ? "atrasado" : "al_dia");
  }
  assert.equal(refDocente(SPEC.A1).exigibles, 5, "5 entregables exigibles y 3 de semanas futuras (no incumplidos)");
  assert.equal(act.stats.docentes_atrasados, docentesDe("act").filter((k) => refDocente(SPEC[k]).vencidos > 0).length);
  // Futuro: nada es exigible ni está vencido; el semáforo no marca incumplimiento.
  const fut = await dash("fut");
  assert.equal(fut.semana_actual.estado, "sin_iniciar");
  assert.equal(fut.alcance.estado_periodo, "futuro");
  const f = fut.docentes_recientes[0];
  assert.deepEqual([f.vencidos, f.porcentaje_esperado, f.semaforo, f.estado, f.brecha], [0, 0, "sin_exigibles", "al_dia", 0]);
  assert.equal(fut.stats.docentes_atrasados, 0);
  assert.equal(fut.stats.semaforo.rojo + fut.stats.semaforo.amarillo + fut.stats.semaforo.verde, 0);
  // Cerrado: cumplimiento histórico (todo era exigible); sus vencidos no aparecen en el semestre activo.
  const ant = await dash("ant");
  assert.equal(ant.semana_actual.estado, "finalizado");
  const p = ant.docentes_recientes[0];
  const rp = refDocente(SPEC.P1);
  assert.deepEqual([p.vencidos, p.porcentaje_esperado, p.semaforo], [rp.vencidos, 100, rp.semaforo]);
  assert.ok(act.docentes_recientes.every((d) => d.id !== ctx.u.P1.id), "los vencidos de un semestre cerrado no contaminan el activo");
});

test("8. Las fórmulas aprobadas se conservan (reportado, aprobado, esperado, brecha, cumplimiento, vencidos, horas)", { skip }, async () => {
  const dash = (await api(`/admin/dashboard?semestre=${SEM.act}`)).data;
  const av = (await api(`/admin/avance-consolidado?semestre=${SEM.act}`)).data;
  const filasDash = por(dash.docentes_recientes, "id");
  const filasAv = por(av.docentes, "id");
  for (const k of docentesDe("act")) {
    const r = refDocente(SPEC[k]);
    const d = filasDash[ctx.u[k].id];
    const a = filasAv[ctx.u[k].id];
    assert.deepEqual(
      { rep: d.porcentaje_reportado, apr: d.porcentaje_aprobado, esp: d.porcentaje_esperado, brecha: d.brecha, brechaPct: d.brecha_pct, venc: d.vencidos, obs: d.observados, pen: d.pendientes_revision, sem: d.semaforo, enviados: d.reportes_enviados },
      { rep: r.pctRep, apr: r.pctApr, esp: r.pctEsp, brecha: r.brecha, brechaPct: r.brechaPct, venc: r.vencidos, obs: r.observados, pen: r.enviados, sem: r.semaforo, enviados: r.reportados },
      `panel de ${k}`
    );
    assert.deepEqual(
      { rep: a.avance_reportado, apr: a.avance_aprobado, esp: a.avance_esperado, brecha: a.brecha, brechaEnt: a.brecha_entregables, exig: a.exigibles_a_fecha, venc: a.entregables_vencidos, total: a.total_entregables },
      { rep: r.pctRep, apr: r.pctApr, esp: r.pctEsp, brecha: r.brechaPct, brechaEnt: r.brecha, exig: r.exigibles, venc: r.vencidos, total: r.total },
      `avance consolidado de ${k}`
    );
    assert.equal(a.cumplimiento_exigible, r.exigibles > 0 ? pct(r.exigAprobados, r.exigibles) : null);
    assert.equal(a.cumplimiento_reportado_exigible, r.exigibles > 0 ? pct(r.exigReportados, r.exigibles) : null);
  }
  // Por grupo (metricas): sumas de los docentes del grupo.
  const grupos = por((await api(`/admin/metricas?semestre=${SEM.act}`)).data.por_grupo, "grupo_id");
  for (const gk of ["gA1", "gA2"]) {
    const miembros = docentesDe("act").filter((k) => SPEC[k].grupo === gk).map((k) => refDocente(SPEC[k]));
    const g = grupos[ctx.g[gk]];
    const total = miembros.reduce((s, r) => s + r.total, 0);
    assert.deepEqual(
      { docentes: g.total_docentes, rep: g.entregables_reportados, apr: g.entregables_aprobados, esp: g.entregables_esperados, total: g.entregables_total, p: g.porcentaje, pa: g.porcentaje_aprobado, pe: g.porcentaje_esperado },
      { docentes: miembros.length, rep: miembros.reduce((s, r) => s + r.reportados, 0), apr: miembros.reduce((s, r) => s + r.aprobados, 0), esp: miembros.reduce((s, r) => s + r.exigibles, 0), total, p: pct(miembros.reduce((s, r) => s + r.reportados, 0), total), pa: pct(miembros.reduce((s, r) => s + r.aprobados, 0), total), pe: pct(miembros.reduce((s, r) => s + r.exigibles, 0), total) },
      `grupo ${gk}`
    );
  }
  // Horas y estados en la matriz administrativa de un docente (misma fuente de las definiciones).
  const m = (await api(`/admin/docentes/${ctx.u.A1.id}/matriz-stats`)).data.resumen;
  const rA1 = refDocente(SPEC.A1);
  assert.deepEqual({ total: m.total, aprobados: m.aprobados, vencidos: m.vencidos, horas: m.horas_programadas, esperado: m.esperado }, { total: 8, aprobados: rA1.aprobados, vencidos: rA1.vencidos, horas: rA1.horasProg, esperado: rA1.exigibles });
  // Valores no calculables no se reemplazan por cero.
  assert.equal(filasAv[ctx.u.A2.id].cumplimiento_exigible, pct(0, 5), "A2 sin aprobados: 0 % legítimo (hay exigibles)");
  const fut = (await api(`/admin/avance-consolidado?semestre=${SEM.fut}`)).data.docentes[0];
  assert.equal(fut.cumplimiento_exigible, null, "sin exigibles el cumplimiento no es calculable: null");
});

// ───────────────────────── 7 (módulos). Consistencia entre pantallas ─────────────────────────
test("Consistencia: dashboard, avance consolidado y métricas describen la misma población y cifras del semestre", { skip }, async () => {
  for (const sem of ["act", "ant", "fut"]) {
    const dash = (await api(`/admin/dashboard?semestre=${SEM[sem]}`)).data;
    const av = (await api(`/admin/avance-consolidado?semestre=${SEM[sem]}`)).data;
    const met = (await api(`/admin/metricas?semestre=${SEM[sem]}`)).data;
    const esperados = ids(...docentesDe(sem));
    assert.deepEqual(dash.docentes_recientes.map((d) => d.id).sort((a, b) => a - b), esperados, `población del panel ${sem}`);
    assert.deepEqual(av.docentes.map((d) => d.id).sort((a, b) => a - b), esperados, `población del avance ${sem}`);
    assert.equal(dash.stats.total_docentes, esperados.length);
    assert.equal(av.totales.docentes, esperados.length);
    assert.equal(met.por_grupo.reduce((s, g) => s + g.total_docentes, 0), esperados.length);
    // Mismo promedio reportado/aprobado/esperado en ambas pantallas (misma población y definición).
    assert.equal(dash.stats.avance_reportado_promedio, av.totales.promedio_global, `promedio reportado ${sem}`);
    assert.equal(dash.stats.avance_aprobado_promedio, av.totales.promedio_aprobado);
    assert.equal(dash.stats.avance_esperado_promedio, av.totales.promedio_esperado);
    assert.deepEqual(dash.stats.semaforo, av.totales.semaforo);
    // Por grupo (reportado) = suma de los docentes del panel.
    assert.equal(met.por_grupo.reduce((s, g) => s + g.entregables_reportados, 0), av.docentes.reduce((s, d) => s + d.reportados, 0));
    // Diferencia legítima y documentada: «total_reportes» de métricas cuenta todo completado (incluye observados y los sin
    // plantilla); «reportes_enviados» del panel cuenta aprobados + enviados.
    assert.equal(met.resumen.total_reportes, dash.stats.reportes_enviados + dash.stats.reportes_observados, `diferencia de definición ${sem}`);
  }
});

// ───────────────────────── 10. Parámetros inválidos y permisos ─────────────────────────
test("10. Parámetros inválidos reciben respuestas coherentes", { skip }, async () => {
  for (const ruta of ["metricas", "dashboard", "avance-consolidado"]) {
    for (const [valor, estado, codigo] of [["todos", 400, "SEMESTRE_INVALIDO"], ["2026", 400, "SEMESTRE_INVALIDO"], ["20x6B", 400, "SEMESTRE_INVALIDO"], ["2026C", 400, "SEMESTRE_INVALIDO"], ["1999B", 404, "SEMESTRE_NO_ENCONTRADO"]]) {
      const r = await api(`/admin/${ruta}?semestre=${encodeURIComponent(valor)}`);
      assert.equal(r.status, estado, `${ruta} ${valor}`);
      assert.equal(r.data.codigo, codigo);
      assert.ok(typeof r.data.error === "string" && r.data.error.length > 10);
    }
    assert.equal((await api(`/admin/${ruta}?semestre=${SEM.act}&semestre=${SEM.ant}`)).status, 400, `${ruta}: parámetro repetido`);
    assert.equal((await api(`/admin/${ruta}?semestre=`)).status, 200, `${ruta}: vacío = ausente`);
    assert.equal((await api(`/admin/${ruta}?semestre=${SEM.act.toLowerCase()}`)).data.alcance.semestre, SEM.act, `${ruta}: minúsculas aceptadas`);
  }
  for (const g of ["abc", "0", "-3", "1.5"]) assert.equal((await api(`/admin/avance-consolidado?grupo_id=${g}`)).status, 400, `grupo_id ${g}`);
  const delOtro = await api(`/admin/avance-consolidado?semestre=${SEM.ant}&grupo_id=${ctx.g.gA1}`);
  assert.equal(delOtro.status, 200);
  assert.deepEqual(delOtro.data.docentes, [], "un grupo de otro semestre no devuelve docentes");
});

test("11–12. Permisos administrativos y aislamiento de las rutas docentes", { skip }, async () => {
  const tDoc = createSessionToken(ctx.u.A1);
  for (const ruta of ["metricas", "dashboard", "avance-consolidado"]) {
    assert.equal((await api(`/admin/${ruta}`, null)).status, 401, `${ruta} sin sesión`);
    assert.equal((await api(`/admin/${ruta}`, tDoc)).status, 403, `${ruta} con sesión de docente`);
    assert.equal((await api(`/admin/${ruta}`)).status, 200, `${ruta} administrador`);
  }
  // El docente ve solo lo suyo, del semestre de su grupo, sin mezclarse con otros semestres.
  const propio = await api(`/docente/${ctx.u.A1.id}/matriz-stats`, tDoc);
  assert.equal(propio.status, 200);
  const rA1 = refDocente(SPEC.A1);
  assert.deepEqual({ total: propio.data.resumen.total, aprobados: propio.data.resumen.aprobados, vencidos: propio.data.resumen.vencidos }, { total: 8, aprobados: rA1.aprobados, vencidos: rA1.vencidos });
  assert.equal(propio.data.semana_actual.semestre, SEM.act);
  assert.equal((await api(`/docente/${ctx.u.A2.id}/matriz-stats`, tDoc)).status, 403, "no accede a otro docente");
  assert.equal((await api(`/docente/${ctx.u.P1.id}/matriz`, tDoc)).status, 403);
});

// ───────────────────────── 13. Compatibilidad ─────────────────────────
test("13. Las respuestas conservan sus nombres de campo y estructura (los campos nuevos son aditivos)", { skip }, async () => {
  const tiene = (obj, claves, ctxt) => { for (const k of claves) assert.ok(k in obj, `${ctxt}: falta «${k}»`); };
  const m = (await api("/admin/metricas")).data;
  tiene(m, ["resumen", "por_mes", "por_grupo", "por_regional", "top_atrasados", "alcance"], "metricas");
  tiene(m.resumen, ["total_reportes", "aprobados", "pendientes", "con_observaciones", "porcentaje_aprobacion"], "metricas.resumen");
  tiene(m.por_mes[0], ["mes", "total", "aprobados", "observados", "pendientes"], "por_mes");
  tiene(m.por_grupo[0], ["grupo_id", "grupo_nombre", "tipo_docente", "total_docentes", "entregables_completados", "entregables_reportados", "entregables_aprobados", "entregables_esperados", "entregables_total", "porcentaje", "porcentaje_aprobado", "porcentaje_esperado", "semestre"], "por_grupo");
  tiene(m.por_regional[0], ["regional", "docentes", "porcentaje_avance", "porcentaje_reportado", "porcentaje_aprobado"], "por_regional");
  tiene(m.top_atrasados[0], ["docente_id", "nombre", "programa", "regional", "grupo", "entregables_vencidos", "porcentaje_avance", "porcentaje_reportado", "porcentaje_aprobado", "semaforo"], "top_atrasados");
  const d = (await api("/admin/dashboard")).data;
  tiene(d, ["stats", "semana_actual", "progreso_semanal", "cumplimiento_por_programa", "docentes_recientes", "docentes", "proyectos_activos", "reportes", "alcance"], "dashboard");
  tiene(d.stats, ["total_docentes", "reportes_enviados", "pendientes_revision", "reportes_aprobados", "reportes_observados", "docentes_atrasados", "proyectos_activos", "avance_reportado_promedio", "avance_aprobado_promedio", "avance_esperado_promedio", "semaforo"], "dashboard.stats");
  tiene(d.progreso_semanal[0], ["semana", "mes", "enviados", "reportados", "aprobados"], "progreso_semanal");
  tiene(d.cumplimiento_por_programa[0], ["programa", "porcentaje", "porcentaje_reportado", "porcentaje_aprobado", "porcentaje_esperado", "docentes"], "cumplimiento_por_programa");
  tiene(d.docentes_recientes[0], ["id", "nombre", "programa", "regional", "porcentaje_avance", "porcentaje_reportado", "porcentaje_aprobado", "porcentaje_esperado", "brecha", "brecha_pct", "cumplimiento_exigible", "semaforo", "pendientes_revision", "observados", "vencidos", "reportes_enviados", "estado"], "docentes_recientes");
  const a = (await api("/admin/avance-consolidado")).data;
  tiene(a, ["meses", "docentes", "totales", "hoy", "alcance"], "avance");
  tiene(a.totales, ["docentes", "promedio_global", "promedio_aprobado", "promedio_esperado", "con_retraso", "pendientes_revision", "semaforo", "por_mes"], "avance.totales");
  tiene(a.docentes[0], ["id", "nombre", "programa", "regional", "grupo_id", "grupo_nombre", "tipo_docente", "avance_global", "avance_real", "avance_reportado", "avance_aprobado", "avance_esperado", "cumplimiento_esperado", "cumplimiento_exigible", "brecha", "brecha_entregables", "exigibles_a_fecha", "semaforo", "pendientes_revision", "observados", "total_entregables", "reportados", "aprobados", "avance_por_mes", "entregables_vencidos", "ultimo_reporte", "semana_actual"], "avance.docentes");
  tiene(m.alcance, ["semestre", "activo", "origen", "estado_periodo", "calendario", "hoy", "zona_horaria", "vacio", "docentes_sin_grupo", "reportes_fuera_de_matriz_vigente", "entregables_atribuidos_por_fecha", "entregables_sin_semestre", "entregables_semestre_ambiguo", "criterio", "advertencias"], "alcance");
  assert.equal(m.alcance.zona_horaria, "America/Bogota");
  assert.equal(m.alcance.docentes_sin_grupo, 1, "el docente sin grupo se informa, no se mezcla en ningún semestre");
  // Proyectos activos: solo iniciativas cuyo cronograma toca las fechas del semestre.
  assert.equal(d.stats.proyectos_activos, 3);
  assert.equal((await api(`/admin/dashboard?semestre=${SEM.ant}`)).data.stats.proyectos_activos, 1);
  assert.equal((await api(`/admin/dashboard?semestre=${SEM.fut}`)).data.stats.proyectos_activos, 1);
});

// ───────────────────────── 14. Sin duplicados ─────────────────────────
test("14. Los entregables no se duplican por relaciones múltiples (colaboradores, varias iniciativas)", { skip }, async () => {
  const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM proyecto_docentes WHERE docente_id = $1`, [ctx.u.A2.id]);
  assert.equal(n, 2, "A2 es colaborador de dos iniciativas ajenas");
  const av = (await api(`/admin/avance-consolidado?semestre=${SEM.act}`)).data;
  const a2 = av.docentes.find((d) => d.id === ctx.u.A2.id);
  assert.equal(a2.total_entregables, 8, "8 entregables, no 8 × iniciativas");
  assert.equal(a2.reportados, 1);
  const dash = (await api(`/admin/dashboard?semestre=${SEM.act}`)).data;
  const ref = refResumen("act");
  assert.equal(dash.stats.reportes_aprobados + dash.stats.pendientes_revision + dash.stats.reportes_observados, ref.total_reportes);
  assert.equal(dash.progreso_semanal.reduce((s, w) => s + w.aprobados, 0), dash.stats.reportes_aprobados);
  for (const w of dash.progreso_semanal) {
    const e = ref.porSemana[w.semana] ?? { rep: 0, apr: 0 };
    assert.deepEqual([w.reportados, w.aprobados, w.enviados], [e.rep, e.apr, e.rep], `semana ${w.semana}`);
  }
});

// ───────────────────────── Atribución de entregables sin plantilla ─────────────────────────
test("Atribución sin plantilla: solo por fechas, sin elegir entre semestres solapados y sin inventar el de un hueco; se informa la cantidad", { skip }, async () => {
  const resumenes = {};
  for (const sem of ["act", "ant", "fut", "vac"]) {
    const { data } = await api(`/admin/metricas?semestre=${SEM[sem]}`);
    resumenes[sem] = data;
    const esperadoPorFecha = SIN_PLANTILLA[sem] ? 1 : 0;
    assert.equal(data.alcance.entregables_atribuidos_por_fecha, esperadoPorFecha, `atribuidos por fecha en ${sem}`);
    assert.equal(data.alcance.advertencias.some((x) => /solo por las fechas de su semana/.test(x)), esperadoPorFecha > 0, `advertencia en ${sem}`);
    // Los dos entregables sin semestre válido (solapado y hueco) no cuentan en NINGÚN semestre: los totales siguen siendo los de la especificación.
    assert.equal(data.resumen.total_reportes, refResumen(sem).total_reportes, `totales de ${sem} sin los entregables ambiguos ni sin semestre`);
    assert.equal(data.alcance.entregables_sin_semestre, 1, "el entregable de la iniciativa fuera de todo semestre se informa");
    assert.equal(data.alcance.entregables_semestre_ambiguo, 1, "el de los semestres solapados se informa");
    assert.ok(data.alcance.advertencias.some((x) => /fuera de todos los semestres/.test(x)) && data.alcance.advertencias.some((x) => /más de un semestre/.test(x)));
  }
  // Los semestres solapados tampoco reclaman el entregable ambiguo.
  for (const k of ["a", "b"]) {
    const { data } = await api(`/admin/metricas?semestre=${OVL[k]}`);
    assert.equal(data.resumen.total_reportes, 0, `el entregable ambiguo no se atribuye a ${OVL[k]}`);
    assert.equal(data.alcance.entregables_atribuidos_por_fecha, 0);
  }
  // Verificación independiente en PostgreSQL: cuántos entregables sin plantilla contiene exactamente un semestre.
  const [r] = await q(`SELECT COUNT(*) FILTER (WHERE n = 1)::int AS un_semestre, COUNT(*) FILTER (WHERE n = 0)::int AS ninguno, COUNT(*) FILTER (WHERE n > 1)::int AS varios
    FROM (SELECT (SELECT COUNT(*) FROM semestres s WHERE ps.fecha_inicio BETWEEN s.fecha_inicio AND s.fecha_fin) AS n
          FROM proyecto_entregables pe JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id WHERE pe.plantilla_id IS NULL) x`);
  assert.deepEqual(r, { un_semestre: 2, ninguno: 1, varios: 1 });
});

// ───────────────────────── AL-01: límite visible del modelo ─────────────────────────
test("AL-01. Un reporte de un semestre anterior cuyo docente hoy está en otro grupo se cuenta en su semestre pero no se atribuye al grupo actual (y se advierte)", { skip }, async () => {
  const antes = await huella();
  const mov = (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, regional, grupo_matriz_id)
     VALUES ($1, 'Prueba', $2, 'docente', $3, 'activo', 'ANTIGUO', 'Norte', $4) RETURNING id`,
    [`${M}_Mov`, `${M}.Mov@test.local`, ctx.prog.P1, ctx.g.gA1]
  ))[0];
  const p = await mkProyecto("Iniciativa de Mov", mov.id, INICIO.act);
  // Dato heredado (anterior a las protecciones del Bloque 1): reporte sobre una plantilla del semestre anterior.
  await insertarEntregable({ semana: await semanaId(p, 1), plantilla: ctx.tpl.gP1[3], docente: mov.id, estado: "enviado", fecha: sumarDias(INICIO.ant, 20) });
  const refAnt = refResumen("ant");
  const m = (await api(`/admin/metricas?semestre=${SEM.ant}`)).data;
  assert.equal(m.resumen.total_reportes, refAnt.total_reportes + 1, "el reporte cuenta en el semestre de su plantilla");
  assert.deepEqual(m.top_atrasados.map((d) => d.docente_id), [ctx.u.P1.id], "no se atribuye al grupo actual del docente");
  assert.equal(m.por_grupo.reduce((s, g) => s + g.total_docentes, 0), 1);
  assert.equal(m.alcance.reportes_fuera_de_matriz_vigente, 1);
  assert.ok(m.alcance.advertencias.some((x) => /no existe historia de asignación/.test(x)), "la limitación se informa, no se oculta");
  // El semestre activo no recibe el reporte del anterior en ninguna de sus cifras.
  const act = (await api(`/admin/metricas?semestre=${SEM.act}`)).data;
  assert.equal(act.resumen.total_reportes, refResumen("act").total_reportes);
  assert.equal(act.alcance.reportes_fuera_de_matriz_vigente, 0);
  const fila = (await api(`/admin/dashboard?semestre=${SEM.act}`)).data.docentes_recientes.find((d) => d.id === mov.id);
  assert.equal(fila.reportes_enviados, 0, "su matriz vigente (semestre activo) no incluye el reporte del anterior");
  // Limpieza de este caso.
  await q(`DELETE FROM proyectos WHERE id = $1`, [p]);
  await q(`DELETE FROM usuarios WHERE id = $1`, [mov.id]);
  assert.deepEqual(await huella(), antes, "estado restaurado");
});

// ───────────────────────── 15. Protecciones históricas intactas ─────────────────────────
test("15. Las consultas de métricas no escriben nada y las protecciones históricas siguen activas", { skip }, async () => {
  const antes = await huella();
  for (const ruta of ["metricas", "dashboard", "avance-consolidado"]) for (const sem of Object.values(SEM)) await api(`/admin/${ruta}?semestre=${sem}`);
  assert.deepEqual(await huella(), antes, "leer métricas no modifica datos");
  const r = await fetch(`${API}/admin/proyectos/${ctx.p.A1}?forzar=true`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).codigo, "HISTORICO_PROTEGIDO");
  assert.deepEqual(await huella(), antes);
});
