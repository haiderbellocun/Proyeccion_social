// Bloque 3B · cierre de la Fase B: carrera entre el cambio de asignación de un docente (administrador A) y la eliminación, el archivo o el
// cambio de semestre del grupo relacionado (administrador B). PostgreSQL REAL, solo `proysocial_test` (mismas guardas que las demás suites).
// Los órdenes se fuerzan de forma DETERMINISTA reteniendo bloqueos con una conexión propia y se complementan con carreras libres repetidas
// a través del servicio y de las rutas HTTP reales. Datos sintéticos con prefijo TST_AC; se eliminan al terminar.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purgarAsignaciones } from "./helpers/purgar-asignaciones.js";

process.env.JWT_SECRET ||= "pruebas-concurrencia-grupo-secreto-largo-0123456789";
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
const { hoyBogota, sumarDias } = await import("../../src/services/matrizService.js");
const { cambiarGrupo, cambiarGrupoTx, diagnosticarDeriva } = await import("../../src/services/asignacionDocenteService.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4323;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_AC";
const SA = "2093A"; // activo
const SB = "2093B"; // siguiente
const MOTIVO = "Prueba de concurrencia grupo";
const ctx = { adm1: null, adm2: null, tok: {} };
let server;
let activosPrevios = [];
let contador = 0;

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (ruta, tokenSesion, options = {}) => {
  const r = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { Authorization: `Bearer ${tokenSesion}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
/** ¿Sigue la promesa sin resolverse tras `ms`? (la operación está bloqueada esperando un bloqueo de la otra). */
const sigueBloqueada = (p, ms = 500) => Promise.race([p.then(() => false, () => false), esperar(ms).then(() => true)]);

async function cleanup() {
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%` });
  for (const sem of [SA, SB]) await purgarAsignaciones(pool, { semestre: sem });
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]);
  await q(`DELETE FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[SA, SB]]);
}
const mkGrupo = async (n, sem = SA) => (await q(
  `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
   VALUES ($1, 'sintético', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`, [`${M} ${n}${++contador}`, sem]
))[0].id;
const mkUser = async (n, rol = "docente") => (await q(
  `INSERT INTO usuarios (nombre, apellido, correo, rol, estado, tipo_docente) VALUES ($1, 'Prueba', $2, $3, 'activo', $4) RETURNING id, nombre, apellido, correo, rol`,
  [`${M}_${n}${++contador}`, `${M}.${n}${contador}@test.local`, rol, rol === "docente" ? "ANTIGUO" : null]
))[0];
const existeGrupo = async (id) => (await q(`SELECT activo FROM grupos_matriz WHERE id = $1`, [id]))[0] ?? null;
const estadoDocente = async (id) => ({
  espejo: (await q(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [id]))[0].grupo_matriz_id,
  vigente: (await q(`SELECT grupo_id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [id]))[0]?.grupo_id ?? null,
  filas: (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = $1`, [id]))[0].n,
  eventos: (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz_cambios WHERE docente_id = $1`, [id]))[0].n,
  vigentes: (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [id]))[0].n,
});
/** Integridad global de lo creado por esta suite: sin referencias huérfanas, sin duplicados, sin vigentes múltiples, espejo = vigente. */
async function integridad() {
  const huerfanas = (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz a LEFT JOIN grupos_matriz g ON g.id = a.grupo_id WHERE g.id IS NULL`))[0].n;
  assert.equal(huerfanas, 0, "ninguna fila del historial apunta a un grupo inexistente");
  const espejoHuerfano = (await q(`SELECT COUNT(*)::int n FROM usuarios u LEFT JOIN grupos_matriz g ON g.id = u.grupo_matriz_id WHERE u.grupo_matriz_id IS NOT NULL AND g.id IS NULL`))[0].n;
  assert.equal(espejoHuerfano, 0, "ningún espejo apunta a un grupo inexistente");
  const dobles = (await q(`SELECT COUNT(*)::int n FROM (SELECT docente_id FROM docente_grupo_matriz WHERE vigente GROUP BY 1 HAVING COUNT(*) > 1) x`))[0].n;
  assert.equal(dobles, 0, "una sola vigente por docente");
  const dup = (await q(`SELECT COUNT(*)::int n FROM (SELECT docente_id, grupo_id, COALESCE(desde, '-infinity') FROM docente_grupo_matriz GROUP BY 1, 2, 3 HAVING COUNT(*) > 1) x`))[0].n;
  assert.equal(dup, 0, "sin filas duplicadas");
  const deriva = (await diagnosticarDeriva(pool)).deriva.filter((r) => r.docente_id != null);
  assert.deepEqual(deriva, [], "el espejo coincide con la asignación vigente");
  const cadena = (await q(`SELECT COUNT(*)::int n FROM (SELECT grupo_anterior_id, LAG(grupo_nuevo_id) OVER (PARTITION BY docente_id ORDER BY id) AS previo, ROW_NUMBER() OVER (PARTITION BY docente_id ORDER BY id) AS k FROM docente_grupo_matriz_cambios WHERE docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE '${M}.%')) x WHERE k > 1 AND grupo_anterior_id IS DISTINCT FROM previo`))[0].n;
  assert.equal(cadena, 0, "cadena de cambios continua");
}

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  assert.ok((await q(`SELECT to_regclass('docente_grupo_matriz_cambios') AS t`))[0].t, "falta la migración fase28 (npm run test:db:setup)");
  await cleanup();
  const hoy = hoyBogota();
  activosPrevios = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await q(`UPDATE semestres SET activo = false WHERE activo`);
  for (const [codigo, desde] of [[SA, -21], [SB, 120]]) {
    await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, $4)`, [codigo, sumarDias(hoy, desde), sumarDias(hoy, desde + 111), codigo === SA]);
  }
  ctx.adm1 = await mkUser("Admin1", "admin");
  ctx.adm2 = await mkUser("Admin2", "admin");
  const tk = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });
  ctx.tok = { a: tk(ctx.adm1), b: tk(ctx.adm2) };
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await esperar(150);
  }
});
after(async () => {
  server?.kill();
  if (DB_OK) {
    await q(`UPDATE semestres SET activo = false WHERE codigo = ANY($1::text[])`, [[SA, SB]]);
    await cleanup();
    if (activosPrevios.length) await q(`UPDATE semestres SET activo = true WHERE codigo = ANY($1::text[])`, [activosPrevios]);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas, (SELECT COUNT(*) FROM docente_grupo_matriz_cambios)::int cambios`, [`${M}.%`, `${M}%`]))[0];
    assert.deepEqual(r, { u: 0, g: 0, filas: 0, cambios: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

// ───────────────────────── Órdenes deterministas ─────────────────────────
test("1. A primero (transacción abierta con el cambio): la eliminación del grupo espera, y al terminar A se rechaza; el cambio queda íntegro", { skip }, async () => {
  const d = await mkUser("D1");
  const g = await mkGrupo("destino");
  const c = await pool.connect();
  let b;
  try {
    await c.query("BEGIN");
    assert.equal((await cambiarGrupoTx(c, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO })).cambio, true);
    b = api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "DELETE" });
    assert.equal(await sigueBloqueada(b), true, "B espera al bloqueo del grupo mientras A no confirma");
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await b;
  assert.equal(r.status, 400, JSON.stringify(r.data)); // «Desasigna los docentes antes de eliminar»
  assert.ok(await existeGrupo(g), "el grupo sigue existiendo");
  assert.deepEqual(await estadoDocente(d.id), { espejo: g, vigente: g, filas: 1, eventos: 1, vigentes: 1 });
  await integridad();
});

test("2. A primero y B archiva el grupo: el archivo espera, se aplica después y el historial conserva la asignación", { skip }, async () => {
  const d = await mkUser("D2");
  const g = await mkGrupo("archivar");
  const c = await pool.connect();
  let b;
  try {
    await c.query("BEGIN");
    await cambiarGrupoTx(c, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO });
    b = api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "PUT", body: { activo: false } });
    assert.equal(await sigueBloqueada(b), true, "el archivo espera al cambio de A");
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await b;
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await existeGrupo(g)).activo, false);
  assert.deepEqual(await estadoDocente(d.id), { espejo: g, vigente: g, filas: 1, eventos: 1, vigentes: 1 }, "archivar no altera la asignación ni el historial");
  await integridad();
});

test("3. B primero (retiene el grupo): el cambio de A espera y, al eliminarse el grupo, se rechaza sin escrituras parciales", { skip }, async () => {
  const d = await mkUser("D3");
  const g = await mkGrupo("eliminado");
  const antes = await estadoDocente(d.id);
  const c = await pool.connect();
  let a;
  try {
    await c.query("BEGIN");
    await c.query(`SELECT id FROM grupos_matriz WHERE id = $1 FOR UPDATE`, [g]);
    a = cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO }).then((v) => ({ ok: v }), (e) => ({ error: e }));
    assert.equal(await sigueBloqueada(a), true, "A espera al bloqueo del grupo");
    await c.query(`DELETE FROM grupos_matriz WHERE id = $1`, [g]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await a;
  assert.equal(r.error?.codigo, "GRUPO_NO_DISPONIBLE", r.error?.message);
  assert.equal(r.error?.status, 404);
  assert.deepEqual(await estadoDocente(d.id), antes, "sin escrituras parciales: el docente quedó como estaba");
  assert.equal(await existeGrupo(g), null);
  await integridad();
});

test("4. B primero archiva el grupo: el cambio de A se rechaza (grupo inactivo) y el docente no cambia", { skip }, async () => {
  const d = await mkUser("D4");
  const g = await mkGrupo("archivado");
  const antes = await estadoDocente(d.id);
  const c = await pool.connect();
  let a;
  try {
    await c.query("BEGIN");
    await c.query(`UPDATE grupos_matriz SET activo = false WHERE id = $1`, [g]);
    a = cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO }).then((v) => ({ ok: v }), (e) => ({ error: e }));
    assert.equal(await sigueBloqueada(a), true, "A espera al archivo de B");
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await a;
  assert.equal(r.error?.codigo, "GRUPO_NO_DISPONIBLE", r.error?.message);
  assert.deepEqual(await estadoDocente(d.id), antes);
  await integridad();
});

test("5. B primero cambia el semestre del grupo: A se rechaza (B1, ya no es el semestre activo) y el docente no cambia", { skip }, async () => {
  const d = await mkUser("D5");
  const g = await mkGrupo("semestre");
  const antes = await estadoDocente(d.id);
  const c = await pool.connect();
  let a;
  try {
    await c.query("BEGIN");
    await c.query(`SELECT id FROM grupos_matriz WHERE id = $1 FOR UPDATE`, [g]);
    a = cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO }).then((v) => ({ ok: v }), (e) => ({ error: e }));
    assert.equal(await sigueBloqueada(a), true);
    await c.query(`UPDATE grupos_matriz SET semestre = $2 WHERE id = $1`, [g, SB]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await a;
  assert.equal(r.error?.codigo, "SEMESTRE_NO_ACTIVO", r.error?.message);
  assert.deepEqual(await estadoDocente(d.id), antes);
  await integridad();
});

test("6. Un docente que SALE del grupo mientras B intenta eliminarlo: el grupo no se elimina (tiene historial) y el historial conserva ambos valores", { skip }, async () => {
  const d = await mkUser("D6");
  const g1 = await mkGrupo("origen");
  const g2 = await mkGrupo("nuevo");
  await cambiarGrupo(pool, { docenteId: d.id, grupoId: g1, actorId: ctx.adm1.id, motivo: MOTIVO });
  const c = await pool.connect();
  let b;
  try {
    await c.query("BEGIN");
    await cambiarGrupoTx(c, { docenteId: d.id, grupoId: g2, actorId: ctx.adm1.id, motivo: MOTIVO });
    b = api(`/admin/grupos-matriz/${g1}`, ctx.tok.b, { method: "DELETE" });
    await sigueBloqueada(b, 300); // puede o no esperar según el orden de bloqueos; lo relevante es el resultado
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  const r = await b;
  assert.ok([400, 409].includes(r.status), `${r.status} ${JSON.stringify(r.data)}`);
  assert.ok(await existeGrupo(g1), "el grupo con historial no se elimina");
  assert.deepEqual(await estadoDocente(d.id), { espejo: g2, vigente: g2, filas: 2, eventos: 2, vigentes: 1 });
  await integridad();
});

// ───────────────────────── Carreras libres repetidas ─────────────────────────
test("7. Carreras libres repetidas (servicio vs eliminación / archivo / cambio de semestre por HTTP): consistentes y sin interbloqueos", { skip }, async () => {
  const variantes = [
    { nombre: "eliminar", b: (g) => api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "DELETE" }) },
    { nombre: "archivar", b: (g) => api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "PUT", body: { activo: false } }) },
    { nombre: "semestre", b: (g) => api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "PUT", body: { semestre: SB } }) },
  ];
  const resumen = {};
  for (let ronda = 0; ronda < 18; ronda += 1) {
    const v = variantes[ronda % 3];
    const d = await mkUser(`R${ronda}`);
    const g = await mkGrupo(`carrera_${v.nombre}_`);
    const antes = await estadoDocente(d.id);
    const ordenBFirst = ronda % 2 === 1;
    const lanzaA = () => cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO }).then((x) => ({ ok: x }), (e) => ({ error: e }));
    const lanzaB = () => v.b(g);
    const [ra, rb] = ordenBFirst ? (await Promise.all([lanzaB(), lanzaA()])).reverse() : await Promise.all([lanzaA(), lanzaB()]);
    // Sin interbloqueos ni errores internos.
    assert.notEqual(ra.error?.code, "40P01", "interbloqueo en A");
    assert.notEqual(rb.status, 500, `error interno en B (${v.nombre}): ${JSON.stringify(rb.data)}`);
    assert.ok([200, 400, 404, 409].includes(rb.status), `B ${v.nombre}: ${rb.status}`);
    const grupo = await existeGrupo(g);
    const e = await estadoDocente(d.id);
    if (ra.ok?.cambio) {
      // A ganó: el docente quedó en el grupo y B no pudo eliminarlo ni cambiar su semestre (archivar sí es compatible).
      assert.ok(grupo, "el grupo sigue existiendo");
      assert.deepEqual({ espejo: e.espejo, vigente: e.vigente, filas: e.filas, eventos: e.eventos, vigentes: e.vigentes }, { espejo: g, vigente: g, filas: 1, eventos: 1, vigentes: 1 });
      if (v.nombre !== "archivar") assert.ok([400, 409].includes(rb.status), `${v.nombre} debía rechazarse: ${rb.status}`);
      else assert.equal(rb.status, 200);
      resumen[`${v.nombre}:A_gana`] = (resumen[`${v.nombre}:A_gana`] ?? 0) + 1;
    } else {
      // B ganó: A se rechazó con un error funcional y el docente quedó exactamente como estaba.
      assert.ok(["GRUPO_NO_DISPONIBLE", "SEMESTRE_NO_ACTIVO"].includes(ra.error?.codigo), `A: ${ra.error?.codigo ?? ra.error?.message}`);
      assert.deepEqual(e, antes);
      assert.equal(rb.status, 200, `B debía aplicarse: ${JSON.stringify(rb.data)}`);
      resumen[`${v.nombre}:B_gana`] = (resumen[`${v.nombre}:B_gana`] ?? 0) + 1;
    }
    await integridad();
  }
  console.log("   (resultado de las carreras)", JSON.stringify(resumen));
});

test("8. Cambios simultáneos de varios docentes hacia el mismo grupo mientras B lo archiva o intenta eliminarlo: sin interbloqueos ni parciales", { skip }, async () => {
  for (let ronda = 0; ronda < 6; ronda += 1) {
    const g = await mkGrupo("multiple");
    const docs = await Promise.all([1, 2, 3, 4].map((i) => mkUser(`M${ronda}_${i}`)));
    const op = ronda % 2 === 0
      ? () => api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "DELETE" })
      : () => api(`/admin/grupos-matriz/${g}`, ctx.tok.b, { method: "PUT", body: { activo: false } });
    const res = await Promise.allSettled([
      ...docs.map((d, i) => cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: i % 2 ? ctx.adm1.id : ctx.adm2.id, motivo: MOTIVO })),
      op(),
    ]);
    for (const r of res) if (r.status === "rejected") assert.notEqual(r.reason?.code, "40P01", "interbloqueo");
    const b = res.at(-1);
    assert.equal(b.status, "fulfilled");
    assert.notEqual(b.value.status, 500, JSON.stringify(b.value.data));
    // Cada docente está en el grupo o intacto, nunca a medias.
    for (const d of docs) {
      const e = await estadoDocente(d.id);
      assert.ok((e.espejo === g && e.vigente === g && e.filas === 1 && e.eventos === 1) || (e.espejo === null && e.vigente === null && e.filas === 0 && e.eventos === 0), JSON.stringify(e));
    }
    await integridad();
  }
});

test("9. Defensa en la base: aunque se eludiera la ruta, un grupo con asignaciones registradas no se puede borrar (el SET NULL del espejo nunca se dispara a espaldas del historial)", { skip }, async () => {
  const d = await mkUser("D9");
  const g = await mkGrupo("protegido");
  await cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.adm1.id, motivo: MOTIVO });
  const antes = await estadoDocente(d.id);
  const err = await q(`DELETE FROM grupos_matriz WHERE id = $1`, [g]).then(() => null, (e) => e);
  assert.equal(err?.code, "23503", "la FK del historial impide el borrado");
  assert.deepEqual(await estadoDocente(d.id), antes);
  assert.ok(await existeGrupo(g));
  await integridad();
});
