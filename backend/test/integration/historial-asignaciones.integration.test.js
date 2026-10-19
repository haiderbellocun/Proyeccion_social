// Bloque 3B · Fase A: historial de asignaciones docente–grupo (migración fase28). Pruebas contra PostgreSQL REAL, solo en `proysocial_test`
// (mismas guardas que los bloques anteriores: PGDATABASE=proysocial_test exacto, servidor local, sin DATABASE_URL y current_database()
// verificado; en cualquier otro caso se OMITEN). La tabla nueva todavía NO la usa ningún endpoint: estas pruebas verifican el esquema, el
// backfill y que el comportamiento actual de la API no cambia.
//   npm run test:db:setup      (aplica las migraciones, incluida la fase28)
//   npm run test:integration:protegidos
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4315;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_M";
const SEM = { a: "2083A", b: "2083B", c: "2084A" };
const ctx = { g: {}, u: {}, t: {}, p: {} };
let server;
let tokenAdmin;

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const api = async (ruta, options = {}) => {
  const r = await fetch(`${API}${ruta}`, { ...options, headers: { Authorization: `Bearer ${tokenAdmin}`, ...(options.body ? { "Content-Type": "application/json" } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
/** Ejecuta una sentencia que debe fallar y devuelve el error (dentro de un SAVEPOINT para no abortar la transacción del cliente). */
async function falla(c, sql, params = []) {
  await c.query("SAVEPOINT s");
  try { await c.query(sql, params); await c.query("RELEASE SAVEPOINT s"); return null; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return e; }
}
const conTx = async (fn) => {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
};

async function cleanup() {
  const g = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[]))`, [g]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[]))`, [g]);
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]); // arrastra sus filas del historial (CASCADE) e incidencias
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [Object.values(SEM)]);
}
async function waitForServer() {
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${API}/health`)).ok) return; } catch { /* iniciando */ } await esperar(150); }
  throw new Error("El servidor de prueba no inició");
}
const user = async (n, grupo = null, rol = "docente") =>
  (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, estado, tipo_docente, grupo_matriz_id) VALUES ($1,'M',$2,$3,'activo',$4,$5) RETURNING id`, [`${M}_${n}`, `${M}.${n}@test.local`, rol, rol === "docente" ? "ANTIGUO" : null, grupo]))[0].id;
const proyecto = async (n, docente) => {
  const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, NULL, $2, 'proyecto', '2026-02-02', 4) RETURNING id`, [`${M} ${n}`, docente]))[0].id;
  for (let k = 1; k <= 4; k += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1,$2,'2026-02-02'::date + $3::int,'2026-02-02'::date + $3::int + 6)`, [p, k, (k - 1) * 7]);
  return p;
};
const reporte = (proy, docente, plantilla, estado = "enviado") =>
  q(`INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, horas, completado, estado_revision) SELECT id, $3, $2, 'x', 2, true, $4 FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = 1`, [proy, docente, plantilla, estado]);
const asignar = (c, docente, grupo, o = {}) =>
  c.query(`INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [docente, grupo, o.vigente ?? true, o.desde ?? "2026-08-03T08:00:00Z", o.hasta ?? null, o.origen ?? "asignacion_admin", o.certeza ?? "registrada", ctx.u.admin]);
const cerrar = (c, id, hasta, motivo = "cambio") => c.query(`UPDATE docente_grupo_matriz SET vigente = false, hasta = $2, cerrado_por = $3, cerrado_en = now(), motivo_cierre = $4 WHERE id = $1`, [id, hasta, ctx.u.admin, motivo]);
const filas = (docente) => q(`SELECT g.semestre, a.grupo_id, a.vigente, a.origen, a.certeza, a.desde, a.hasta FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE a.docente_id = $1 ORDER BY a.id`, [docente]);
/** Fila efectiva del semestre (vigente; si no, la de mayor `hasta`); ambigua si hay más de una fila y alguna cerrada sin fecha de cierre. */
const efectiva = (sem) => q(`
  WITH f AS (SELECT a.*, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE g.semestre = $1),
       n AS (SELECT docente_id, COUNT(*)::int AS filas, COUNT(*) FILTER (WHERE NOT vigente AND hasta IS NULL)::int AS sin_fecha FROM f GROUP BY docente_id)
  SELECT n.docente_id, n.filas, (n.filas > 1 AND n.sin_fecha > 0) AS ambigua,
         (SELECT f2.grupo_id FROM f f2 WHERE f2.docente_id = n.docente_id ORDER BY f2.vigente DESC, f2.hasta DESC NULLS LAST, f2.id DESC LIMIT 1) AS grupo_efectivo
  FROM n ORDER BY n.docente_id`, [sem]);

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  assert.ok((await q(`SELECT to_regclass('docente_grupo_matriz') AS t`))[0].t, "falta la migración fase28 (npm run test:db:setup)");
  await cleanup();
  for (const [c, d] of [[SEM.a, "2026-02-02"], [SEM.b, "2026-08-03"], [SEM.c, "2027-02-01"]]) await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $2::date + 111, 16, false)`, [c, d]);
  const grupo = async (n, sem, activo = true) => (await q(`INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) VALUES ($1,'x','ANTIGUO',10,1,0,0,0,$2,$3) RETURNING id`, [`${M} ${n}`, activo, sem]))[0].id;
  ctx.g = { a1: await grupo("A1", SEM.a, false), a2: await grupo("A2", SEM.a), b1: await grupo("B1", SEM.b), b2: await grupo("B2", SEM.b), c1: await grupo("C1", SEM.c) };
  const tpl = async (g, n) => (await q(`INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES ($1,$2,'Proyecto','Proyecto','Octubre',1,$3,'x',2,0,4) RETURNING id`, [g, n, `${M} e${n}`]))[0].id;
  for (const k of Object.keys(ctx.g)) ctx.t[k] = await tpl(ctx.g[k], 1);
  ctx.u.admin = await user("Admin", null, "admin");
  tokenAdmin = createSessionToken({ id: ctx.u.admin, nombre: `${M}_Admin`, apellido: "M", correo: `${M}.Admin@test.local`, rol: "admin" });
  server = spawn(process.execPath, ["src/index.js"], { cwd: backendDir, env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ALLOWED_ORIGIN: "http://localhost:5173" }, stdio: "ignore" });
  await waitForServer();
});
after(async () => {
  server?.kill();
  if (DB_OK) {
    await cleanup();
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g, (SELECT COUNT(*) FROM semestres WHERE codigo = ANY($3::text[]))::int s, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas, (SELECT COUNT(*) FROM docente_grupo_matriz_incidencias)::int inc`, [`${M}.%`, `${M}%`, Object.values(SEM)]))[0];
    assert.deepEqual(r, { u: 0, g: 0, s: 0, filas: 0, inc: 0 }, "no deben quedar fixtures ni filas del historial");
  }
  await pool.end();
});

// ───────────────────────── 1–3. Asignación y cambios ─────────────────────────
test("1. Asignación inicial: una fila vigente con autor y fecha; el espejo usuarios.grupo_matriz_id es independiente", { skip }, async () => {
  const d = await user("D1");
  await conTx(async (c) => { await asignar(c, d, ctx.g.b1); await c.query(`UPDATE usuarios SET grupo_matriz_id = $2 WHERE id = $1`, [d, ctx.g.b1]); });
  const [f] = await filas(d);
  assert.deepEqual([f.semestre, f.vigente, f.origen, f.certeza], [SEM.b, true, "asignacion_admin", "registrada"]);
  const [x] = await q(`SELECT creado_por, creado_en FROM docente_grupo_matriz WHERE docente_id = $1`, [d]);
  assert.equal(x.creado_por, ctx.u.admin);
  assert.ok(x.creado_en);
  ctx.u.d1 = d;
});

test("2. Cambio entre semestres: se cierra la fila (quién, cuándo, por qué) y se abre la del semestre siguiente; ambas se conservan", { skip }, async () => {
  const d = ctx.u.d1;
  await conTx(async (c) => {
    const [{ id }] = (await c.query(`SELECT id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [d])).rows;
    await cerrar(c, id, "2026-10-01T00:00:00Z", "paso al semestre siguiente");
    await asignar(c, d, ctx.g.c1, { desde: "2026-10-01T00:00:00Z" }); // contigua: [desde, hasta) no se solapa
  });
  const f = await filas(d);
  assert.deepEqual(f.map((x) => [x.semestre, x.vigente]), [[SEM.b, false], [SEM.c, true]]);
  const [cierre] = await q(`SELECT cerrado_por, cerrado_en, motivo_cierre, hasta FROM docente_grupo_matriz WHERE docente_id = $1 AND NOT vigente`, [d]);
  assert.equal(cierre.cerrado_por, ctx.u.admin);
  assert.ok(cierre.cerrado_en && cierre.hasta);
  assert.equal(cierre.motivo_cierre, "paso al semestre siguiente");
  const e = await efectiva(SEM.b);
  assert.equal(e.find((r) => r.docente_id === d).grupo_efectivo, ctx.g.b1, "consulta histórica: su grupo de 2083B sigue siendo B1");
  assert.equal((await efectiva(SEM.c)).find((r) => r.docente_id === d).grupo_efectivo, ctx.g.c1);
});

test("3. Cambio legítimo dentro de un semestre (sin reportes): dos filas del mismo semestre, una cerrada y otra vigente", { skip }, async () => {
  const d = await user("D3");
  await conTx(async (c) => {
    const r = await asignar(c, d, ctx.g.b1, { desde: "2026-08-03T08:00:00Z" });
    await cerrar(c, r.rows[0].id, "2026-09-10T00:00:00Z", "reasignación dentro del semestre");
    await asignar(c, d, ctx.g.b2, { desde: "2026-09-10T00:00:00Z" });
  });
  assert.deepEqual((await filas(d)).map((x) => [x.semestre, x.grupo_id, x.vigente]), [[SEM.b, ctx.g.b1, false], [SEM.b, ctx.g.b2, true]]);
  const e = (await efectiva(SEM.b)).find((r) => r.docente_id === d);
  assert.equal(e.grupo_efectivo, ctx.g.b2);
  assert.equal(e.ambigua, false, "con fechas conocidas la fila efectiva no es ambigua");
});

test("4. Con reportes en el grupo, no se puede cambiar a otro grupo del MISMO semestre (HISTORICO_PROTEGIDO); a otro semestre sí", { skip }, async () => {
  const d = await user("D4");
  await q(`UPDATE usuarios SET grupo_matriz_id = $2 WHERE id = $1`, [d, ctx.g.b1]);
  await conTx(async (c) => { await asignar(c, d, ctx.g.b1); });
  await reporte(await proyecto("p4", d), d, ctx.t.b1);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const [{ id }] = (await c.query(`SELECT id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [d])).rows;
    await cerrar(c, id, "2026-09-10T00:00:00Z");
    const e = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza, creado_por) VALUES ($1,$2,true,'2026-09-10T00:00:00Z','asignacion_admin','registrada',$3)`, [d, ctx.g.b2, ctx.u.admin]);
    assert.match(e?.message ?? "", /HISTORICO_PROTEGIDO/);
    await c.query("ROLLBACK"); // la operación completa se deshace: sigue vigente en B1
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  assert.deepEqual((await filas(d)).map((x) => [x.grupo_id, x.vigente]), [[ctx.g.b1, true]]);
  // A otro semestre sí se puede (el bloqueo es solo dentro del semestre).
  await conTx(async (c2) => {
    const [{ id }] = (await c2.query(`SELECT id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [d])).rows;
    await cerrar(c2, id, "2026-10-01T00:00:00Z");
    await asignar(c2, d, ctx.g.c1, { desde: "2026-10-01T00:00:00Z" });
  });
  assert.deepEqual((await filas(d)).map((x) => x.vigente), [false, true]);
});

// ───────────────────────── 5–8. Restricciones ─────────────────────────
test("5. Una sola asignación vigente por docente (índice parcial único) y sin solapamiento de vigencias conocidas", { skip }, async () => {
  const d = await user("D5");
  await conTx(async (c) => { await asignar(c, d, ctx.g.b1, { desde: "2026-08-03T08:00:00Z" }); });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Segunda vigente en otro grupo y otra fecha posterior: la unicidad parcial la impide aunque no se solapen por fecha cerrada.
    const e1 = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true,'2026-09-15T00:00:00Z','asignacion_admin','registrada')`, [d, ctx.g.b2]);
    assert.ok(["23505", "23P01"].includes(e1?.code), `${e1?.code} ${e1?.message}`);
    // Fila cerrada que se solapa con la vigente (que no tiene fin): rechazada por el control de vigencias.
    const e2 = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza) VALUES ($1,$2,false,'2026-10-01T00:00:00Z','2026-10-20T00:00:00Z','asignacion_admin','registrada')`, [d, ctx.g.b2]);
    assert.equal(e2?.code, "23P01");
    await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  assert.equal((await filas(d)).length, 1);
});

test("6. Fechas desconocidas solo en filas heredadas: lo creado por la aplicación debe traer inicio (y fin si está cerrado)", { skip }, async () => {
  const d = await user("D6");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const sinDesde = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true,NULL,'asignacion_admin','registrada')`, [d, ctx.g.b1]);
    assert.equal(sinDesde?.constraint, "dgm_fechas_heredadas");
    const cerradaSinFin = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza) VALUES ($1,$2,false,'2026-08-03T00:00:00Z',NULL,'importacion','registrada')`, [d, ctx.g.b1]);
    assert.equal(cerradaSinFin?.constraint, "dgm_fechas_heredadas");
    const heredada = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza) VALUES ($1,$2,false,NULL,NULL,'evidencia_reportes','alta')`, [d, ctx.g.a2]);
    assert.equal(heredada, null, "una fila heredada con fechas desconocidas sí es válida");
    const evidenciaVigente = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES ($1,$2,true,'evidencia_reportes','alta')`, [d, ctx.g.b2]);
    assert.equal(evidenciaVigente?.constraint, "dgm_evidencia_no_vigente");
    const incoherente = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true,'2026-08-03T00:00:00Z','asignacion_admin','alta')`, [d, ctx.g.b2]);
    assert.equal(incoherente?.constraint, "dgm_certeza_coherente");
    const periodo = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza) VALUES ($1,$2,false,'2026-09-01T00:00:00Z','2026-08-01T00:00:00Z','asignacion_admin','registrada')`, [d, ctx.g.b2]);
    assert.equal(periodo?.constraint, "dgm_periodo_valido");
    await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
});

test("7. Sin preasignaciones: una asignación creada por la aplicación no puede empezar en el futuro ni pisar la vigente", { skip }, async () => {
  const d = await user("D7");
  await conTx(async (c) => { await asignar(c, d, ctx.g.b1, { desde: "2026-08-03T08:00:00Z" }); });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const futura = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true, now() + interval '30 days','asignacion_admin','registrada')`, [d, ctx.g.c1]);
    assert.match(futura?.message ?? "", /preasignaciones/);
    const futuraCerrada = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza) VALUES ($1,$2,false, now() + interval '30 days', now() + interval '60 days','importacion','registrada')`, [d, ctx.g.c1]);
    assert.match(futuraCerrada?.message ?? "", /preasignaciones/);
    await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  assert.deepEqual((await filas(d)).map((x) => [x.grupo_id, x.vigente]), [[ctx.g.b1, true]], "el historial y la vigente no cambiaron");
});

test("8. Duplicados, claves foráneas, rol y protección de grupos archivados", { skip }, async () => {
  const d = await user("D8");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES ($1,$2,false,'evidencia_reportes','alta')`, [d, ctx.g.a1]);
    const dup = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES ($1,$2,false,'evidencia_excepciones','media')`, [d, ctx.g.a1]);
    assert.equal(dup?.constraint, "uq_dgm_sin_duplicados", "mismo docente, grupo e inicio desconocido");
    const sinDocente = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES (999999999,$1,false,'evidencia_reportes','alta')`, [ctx.g.a1]);
    assert.equal(sinDocente?.code, "23503");
    const sinGrupo = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES ($1,999999999,false,'evidencia_reportes','alta')`, [d]);
    assert.equal(sinGrupo?.code, "23503");
    const noDocente = await falla(c, `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, origen, certeza) VALUES ($1,$2,false,'evidencia_reportes','alta')`, [ctx.u.admin, ctx.g.a1]);
    assert.equal(noDocente?.code, "23514", "solo usuarios con rol docente");
    // Grupo archivado (A1 está inactivo) con asignaciones: se conserva y no se puede eliminar.
    assert.equal((await c.query(`SELECT activo FROM grupos_matriz WHERE id = $1`, [ctx.g.a1])).rows[0].activo, false);
    const borrar = await falla(c, `DELETE FROM grupos_matriz WHERE id = $1`, [ctx.g.a1]);
    assert.equal(borrar?.code, "23503");
    await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
});

test("9. Periodos anteriores protegidos: no se borra, no se reasigna, no se reabre; borrar un docente sin historia sí arrastra sus filas", { skip }, async () => {
  const d = ctx.u.d1; // tiene una fila cerrada (2083B) y una vigente (2084A)
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const del = await falla(c, `DELETE FROM docente_grupo_matriz WHERE docente_id = $1`, [d]);
    assert.match(del?.message ?? "", /no se elimina/);
    const cerrada = (await c.query(`SELECT id FROM docente_grupo_matriz WHERE docente_id = $1 AND NOT vigente`, [d])).rows[0].id;
    for (const sql of [`UPDATE docente_grupo_matriz SET grupo_id = ${ctx.g.b2} WHERE id = ${cerrada}`, `UPDATE docente_grupo_matriz SET hasta = '2030-01-01' WHERE id = ${cerrada}`, `UPDATE docente_grupo_matriz SET vigente = true, hasta = NULL WHERE id = ${cerrada}`, `UPDATE docente_grupo_matriz SET motivo_cierre = 'otro' WHERE id = ${cerrada}`, `UPDATE docente_grupo_matriz SET desde = '2020-01-01' WHERE id = ${cerrada}`]) {
      assert.ok(await falla(c, sql), `debe fallar: ${sql}`);
    }
    await c.query("ROLLBACK");
  } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  // Comportamiento heredado: un docente sin historia (reportes) se elimina y arrastra sus filas, como arrastra sus excepciones.
  const borrable = await user("Borrable");
  await conTx(async (c2) => { await asignar(c2, borrable, ctx.g.b1); });
  await q(`DELETE FROM usuarios WHERE id = $1`, [borrable]);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = $1`, [borrable]))[0].n, 0);
});

// ───────────────────────── 10. Concurrencia ─────────────────────────
test("10. Dos operaciones administrativas simultáneas sobre el mismo docente: una sola vigente, la otra recibe un error limpio, sin interbloqueo", { skip }, async () => {
  const d = await user("D10");
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await a.query("BEGIN"); await b.query("BEGIN");
    await a.query(`INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true,'2026-08-03T08:00:00Z','asignacion_admin','registrada')`, [d, ctx.g.b1]);
    let errB = null; let terminadaB = false;
    const pb = b.query(`INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza) VALUES ($1,$2,true,'2026-08-03T09:00:00Z','asignacion_admin','registrada')`, [d, ctx.g.b2])
      .catch((e) => { errB = e; }).then(() => { terminadaB = true; });
    await esperar(400);
    assert.equal(terminadaB, false, "la segunda operación espera a la primera (bloqueo por docente)");
    await a.query("COMMIT");
    await pb;
    assert.ok(errB && ["23505", "23P01"].includes(errB.code), `${errB?.code} ${errB?.message}`);
    await b.query("ROLLBACK");
  } finally { await a.query("ROLLBACK").catch(() => {}); await b.query("ROLLBACK").catch(() => {}); a.release(); b.release(); }
  assert.deepEqual((await filas(d)).map((x) => [x.grupo_id, x.vigente]), [[ctx.g.b1, true]]);
  // Dos cierres simultáneos de la misma fila vigente: el segundo no puede cerrar dos veces.
  const e = await Promise.all([0, 1].map(async (i) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT id FROM usuarios WHERE id = $1 FOR UPDATE`, [d]); // el servicio de la Fase B bloquea primero al docente
      const r = await c.query(`UPDATE docente_grupo_matriz SET vigente = false, hasta = '2026-10-01T00:00:00Z', cerrado_por = $2, cerrado_en = now(), motivo_cierre = $3 WHERE docente_id = $1 AND vigente`, [d, ctx.u.admin, `cierre ${i}`]);
      await c.query("COMMIT");
      return r.rowCount;
    } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  }));
  assert.deepEqual(e.sort(), [0, 1], "solo uno de los dos cierra la fila vigente");
});

// ───────────────────────── 11–12. Backfill: casos difíciles e idempotencia ─────────────────────────
const montarCasosDeBackfill = async () => {
  const G = ctx.g;
  const D = {};
  D.normal = await user("Normal", G.b1);                 // vigente en B1 + reportes en A1 (archivado, otro semestre) → vigente + histórica
  D.conflicto = await user("Conflicto", G.a2);           // reportes en A1 y A2 (mismo semestre) → conflicto
  D.sinPlantilla = await user("SinPlantilla", G.b1);     // reporte sin plantilla → incidencia
  D.soloExcepcion = await user("SoloExcepcion", G.b2);   // vigente en B2 + excepción en A2 → histórica por excepción (certeza media)
  D.sinNada = await user("SinNada", null);               // sin grupo ni evidencia → no reconstruible
  D.soloVigente = await user("SoloVigente", G.c1);       // solo grupo vigente
  const pn = await proyecto("normal", D.normal); await reporte(pn, D.normal, ctx.t.a1, "aprobado"); await reporte(pn, D.normal, ctx.t.b1);
  const pc = await proyecto("conflicto", D.conflicto); await reporte(pc, D.conflicto, ctx.t.a1); await reporte(pc, D.conflicto, ctx.t.a2);
  const ps = await proyecto("sinPlantilla", D.sinPlantilla);
  await q(`INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, horas, completado, estado_revision) SELECT id, NULL, $2, 'x', 2, true, 'enviado' FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = 1`, [ps, D.sinPlantilla]);
  await q(`INSERT INTO docente_entregable_excepciones (docente_id, plantilla_id, motivo) VALUES ($1,$2,'prueba')`, [D.soloExcepcion, ctx.t.a2]);
  return D;
};

test("11. Backfill: solo evidencia verificable; certeza, vigencia desconocida y fuente por fila; conflictos y no reconstruibles se registran sin resolverse", { skip }, async () => {
  const D = await montarCasosDeBackfill();
  const r = (await q(`SELECT docente_grupo_matriz_backfill() AS r`))[0].r;
  const clave = (d) => Object.entries(D).find(([, v]) => v === d)?.[0];
  const f = (await q(`SELECT a.docente_id, a.grupo_id, a.vigente, a.origen, a.certeza, a.desde, a.hasta, a.evidencia, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE a.docente_id = ANY($1::int[]) ORDER BY a.docente_id, a.grupo_id`, [Object.values(D)]));
  const resumen = f.map((x) => `${clave(x.docente_id)}:${Object.entries(ctx.g).find(([, v]) => v === x.grupo_id)[0]}:${x.origen}:${x.certeza}:${x.vigente}`).sort();
  assert.deepEqual(resumen, [
    "conflicto:a2:vigente_al_migrar:alta:true",       // la vigente es el dato actual: se inserta; la evidencia en conflicto NO
    "normal:a1:evidencia_reportes:alta:false",
    "normal:b1:vigente_al_migrar:alta:true",
    "sinPlantilla:b1:vigente_al_migrar:alta:true",
    "soloExcepcion:a2:evidencia_excepciones:media:false",
    "soloExcepcion:b2:vigente_al_migrar:alta:true",
    "soloVigente:c1:vigente_al_migrar:alta:true",
  ].sort());
  assert.ok(f.every((x) => x.desde === null && x.hasta === null), "ninguna fecha se inventa: todas desconocidas");
  assert.ok(f.every((x) => x.evidencia.vigencia === "desconocida" && Array.isArray(x.evidencia.fuentes)));
  const normalB1 = f.find((x) => x.docente_id === D.normal && x.vigente);
  assert.deepEqual([normalB1.evidencia.reportes, normalB1.evidencia.fuentes.sort()], [1, ["reportes", "vigente"]], "fuentes fusionadas en una sola fila");
  const hist = f.find((x) => x.docente_id === D.normal && !x.vigente);
  assert.deepEqual([hist.evidencia.reportes, hist.evidencia.aprobados, hist.semestre], [1, 1, SEM.a]);
  assert.equal(f.some((x) => x.docente_id === D.sinNada), false, "un docente sin grupo ni evidencia no recibe ningún grupo");
  assert.equal(f.some((x) => x.docente_id === D.conflicto && x.grupo_id === ctx.g.a1), false, "la evidencia en conflicto no se asigna");
  const inc = await q(`SELECT tipo, docente_id, semestre, estado, detalle FROM docente_grupo_matriz_incidencias WHERE docente_id = ANY($1::int[]) ORDER BY tipo, docente_id`, [Object.values(D)]);
  assert.deepEqual(inc.map((x) => `${x.tipo}:${clave(x.docente_id)}:${x.estado}`), ["dos_grupos_en_un_semestre:conflicto:pendiente", "reportes_sin_plantilla:sinPlantilla:pendiente", "sin_evidencia:sinNada:pendiente"]);
  assert.equal(inc[0].semestre, SEM.a);
  assert.equal(inc[0].detalle.grupos.length >= 2, true);
  assert.ok(r.filas_insertadas >= 7 && r.incidencias_nuevas >= 3, JSON.stringify(r));
  // Fuente independiente: la misma cuenta por consulta directa (pares docente–grupo demostrables, sin conflictos).
  const [indep] = await q(`SELECT COUNT(*)::int n FROM (
      SELECT u.id d, u.grupo_matriz_id g FROM usuarios u WHERE u.id = ANY($1::int[]) AND u.grupo_matriz_id IS NOT NULL
      UNION SELECT pe.docente_id, t.grupo_id FROM proyecto_entregables pe JOIN plantilla_entregables t ON t.id = pe.plantilla_id WHERE pe.docente_id = ANY($1::int[]) AND pe.docente_id <> $2
      UNION SELECT dex.docente_id, t.grupo_id FROM docente_entregable_excepciones dex JOIN plantilla_entregables t ON t.id = dex.plantilla_id WHERE dex.docente_id = ANY($1::int[])
    ) x`, [Object.values(D), D.conflicto]);
  assert.equal(indep.n, f.length, "pares demostrables (la vigente del conflicto incluida, su evidencia en conflicto excluida) = filas insertadas");
  // Equivalencia: la vista previa de solo lectura predice EXACTAMENTE las filas que insertó el backfill (mismas reglas).
  const pv = spawnSync(process.execPath, ["--env-file=.env.test", "scripts/historial-docente-grupo-preview.js", "--json"], { cwd: backendDir, env: { ...process.env }, encoding: "utf8" });
  assert.equal(pv.status, 0, pv.stderr);
  const ids = new Set(Object.values(D));
  const prevista = JSON.parse(pv.stdout).filas_que_insertaria.filter((x) => ids.has(x.docente_id)).map((x) => `${x.docente_id}:${x.grupo_id}:${x.origen}:${x.certeza}:${x.vigente}`).sort();
  const real = f.map((x) => `${x.docente_id}:${x.grupo_id}:${x.origen}:${x.certeza}:${x.vigente}`).sort();
  assert.deepEqual(prevista, real, "la vista previa coincide con lo que inserta la migración");
  ctx.D = D;
});

test("12. El backfill es idempotente: repetirlo no cambia nada", { skip }, async () => {
  const total = async () => (await q(`SELECT (SELECT COUNT(*) FROM docente_grupo_matriz)::int f, (SELECT COUNT(*) FROM docente_grupo_matriz_incidencias)::int i, (SELECT md5(COALESCE(string_agg(x::text, '|' ORDER BY id), '')) FROM docente_grupo_matriz x) h`))[0];
  const antes = await total();
  const r = (await q(`SELECT docente_grupo_matriz_backfill() AS r`))[0].r;
  const r2 = (await q(`SELECT docente_grupo_matriz_backfill() AS r`))[0].r;
  assert.deepEqual([r.filas_insertadas, r.incidencias_nuevas, r2.filas_insertadas, r2.incidencias_nuevas], [0, 0, 0, 0]);
  assert.deepEqual(await total(), antes);
});

// ───────────────────────── 13. Migración con datos, reversión y reaplicación ─────────────────────────
test("13. Reversión documentada y reaplicación de la migración CON datos existentes: se reconstruye lo demostrable y usuarios.grupo_matriz_id no se toca", { skip }, async () => {
  const espejoAntes = await q(`SELECT id, grupo_matriz_id FROM usuarios WHERE correo ILIKE $1 ORDER BY id`, [`${M}.%`]);
  const vigentesAntes = (await q(`SELECT docente_id, grupo_id FROM docente_grupo_matriz WHERE vigente AND docente_id = ANY($1::int[]) ORDER BY docente_id`, [Object.values(ctx.D)]));
  // Reversión (el bloque «REVERSIÓN» de la migración).
  await conTx(async (c) => {
    await c.query(`DROP TRIGGER IF EXISTS trg_dgm_proteger ON docente_grupo_matriz`);
    await c.query(`DROP TRIGGER IF EXISTS trg_dgm_validar ON docente_grupo_matriz`);
    await c.query(`DROP FUNCTION IF EXISTS docente_grupo_matriz_backfill()`);
    await c.query(`DROP FUNCTION IF EXISTS dgm_proteger()`);
    await c.query(`DROP FUNCTION IF EXISTS dgm_validar()`);
    await c.query(`DROP TABLE IF EXISTS docente_grupo_matriz_incidencias`);
    await c.query(`DROP TABLE IF EXISTS docente_grupo_matriz`);
    await c.query(`DELETE FROM schema_migrations WHERE nombre = 'fase28_docente_grupo_matriz.sql'`);
  });
  assert.equal((await q(`SELECT to_regclass('docente_grupo_matriz') AS t`))[0].t, null, "revertida");
  assert.deepEqual(await q(`SELECT id, grupo_matriz_id FROM usuarios WHERE correo ILIKE $1 ORDER BY id`, [`${M}.%`]), espejoAntes, "usuarios.grupo_matriz_id intacto tras la reversión");
  assert.ok((await api("/admin/semestres")).status === 200 && (await api("/admin/metricas")).status === 200, "la aplicación sigue funcionando sin la tabla");
  // Reaplicación con el ejecutor estándar sobre una base con datos.
  const m = spawnSync(process.execPath, ["scripts/migrate.js"], { cwd: backendDir, env: { ...process.env }, encoding: "utf8" });
  assert.equal(m.status, 0, m.stdout + m.stderr);
  assert.match(m.stdout, /Aplicada: fase28_docente_grupo_matriz\.sql/);
  const vigentesDespues = (await q(`SELECT docente_id, grupo_id FROM docente_grupo_matriz WHERE vigente AND docente_id = ANY($1::int[]) ORDER BY docente_id`, [Object.values(ctx.D)]));
  assert.deepEqual(vigentesDespues, vigentesAntes);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = ANY($1::int[])`, [Object.values(ctx.D)]))[0].n, 7, "se reconstruyen las 7 filas demostrables");
  assert.equal((await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz_incidencias WHERE docente_id = ANY($1::int[])`, [Object.values(ctx.D)]))[0].n, 3);
  // Reejecutar el archivo completo sobre lo ya aplicado también es inocuo (idempotente).
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile(path.join(backendDir, "migrations/fase28_docente_grupo_matriz.sql"), "utf8");
  await conTx(async (c) => { await c.query(sql); });
  assert.equal((await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = ANY($1::int[])`, [Object.values(ctx.D)]))[0].n, 7);
});

// ───────────────────────── 14. Compatibilidad: ningún endpoint cambia todavía ─────────────────────────
test("14. La tabla nueva no cambia el comportamiento de los endpoints (métricas, eliminación de docentes sin historia, reasignación)", { skip }, async () => {
  // Métricas idénticas antes y después de ejecutar el backfill.
  const antes = await api(`/admin/metricas?semestre=${SEM.b}`);
  await q(`SELECT docente_grupo_matriz_backfill()`);
  const despues = await api(`/admin/metricas?semestre=${SEM.b}`);
  assert.equal(antes.status, 200);
  assert.deepEqual({ ...despues.data, alcance: null }, { ...antes.data, alcance: null });
  // Eliminar un docente sin historia con fila en el historial: 200, igual que antes (sus filas desaparecen con él).
  const borrable = await user("Borrable2", ctx.g.b1);
  await conTx(async (c) => { await asignar(c, borrable, ctx.g.b1); });
  const del = await api(`/admin/usuarios/${borrable}`, { method: "DELETE" });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal((await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = $1`, [borrable]))[0].n, 0);
  // Reasignar un docente sin historia por la ruta actual funciona y TODAVÍA no escribe el historial (la doble escritura es la Fase B).
  const movible = await user("Movible", ctx.g.b1);
  await q(`SELECT docente_grupo_matriz_backfill()`);
  const ant = (await q(`SELECT grupo_id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [movible]))[0].grupo_id;
  const put = await api(`/admin/docentes/${movible}/grupo-matriz`, { method: "PUT", body: { grupo_matriz_id: ctx.g.b2 } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.equal((await q(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [movible]))[0].grupo_matriz_id, ctx.g.b2, "el espejo cambia");
  assert.equal((await q(`SELECT grupo_id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [movible]))[0].grupo_id, ant, "la tabla NO se actualiza todavía");
  // La deriva es detectable con una consulta (y es la razón de aplicar las Fases A y B juntas en cada base).
  const deriva = await q(`SELECT u.id FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente WHERE u.rol = 'docente' AND u.correo ILIKE $1 AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id`, [`${M}.%`]);
  assert.ok(deriva.some((r) => r.id === movible), "la consulta de deriva detecta al docente reasignado");
});
