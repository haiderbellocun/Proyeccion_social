// Bloque 3B · Fase B: servicio único de asignaciones docente–grupo (doble escritura historial + espejo + registro de cambios).
// Pruebas contra PostgreSQL REAL, solo en `proysocial_test` (PGDATABASE=proysocial_test exacto, servidor local, sin DATABASE_URL y
// current_database() verificado; en cualquier otro caso se OMITEN). Datos sintéticos con prefijo TST_AS; se eliminan al terminar.
//   npm run test:db:setup      (aplica las migraciones, incluida la fase28)
//   npm run test:integration:protegidos
// Escenarios: asignación inicial, cambio legítimo, cambio de semestre, asignación futura, docente sin grupo, inactivación, eliminación con
// historial, reportes aprobados, motivo faltante, idempotencia, incidencias ambiguas, administradores simultáneos (conexiones reales),
// importación Excel con asignación, error a mitad de transacción, sincronización historial/espejo, reaplicación de la migración, permisos.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crearXlsx, hojaCronograma } from "../support/xlsxBuilder.js";
import { purgarAsignaciones } from "./helpers/purgar-asignaciones.js";

process.env.JWT_SECRET ||= "pruebas-asignaciones-servicio-secreto-largo-0123456789";
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
const servicio = await import("../../src/services/asignacionDocenteService.js");
const { cambiarGrupo, transicionarSemestre, resolverIncidencia, listarIncidencias, diagnosticarDeriva, reconciliar, asegurarEsquema, reiniciarCacheEsquema } = servicio;

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4322;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_AS";
const SA = "2095A"; // semestre activo durante las pruebas
const SB = "2095B"; // semestre siguiente (futuro)
const SC = "2097A"; // semestre más lejano (futuro)
const SEMS = [SA, SB, SC];
const MOTIVO = "Prueba de integración del servicio";
const ctx = { g: {}, t: {}, u: {}, tok: {} };
let server;
let activosPrevios = [];

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const api = async (ruta, token, options = {}) => {
  const r = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const token = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });

/** Huella del estado que una operación rechazada NO debe tocar: filas, cambios, incidencias, espejo y reportes de los docentes de prueba. */
const DOC = `(SELECT id FROM usuarios WHERE correo ILIKE '${M}.%')`;
const huella = async () => (await q(`SELECT
  (SELECT COUNT(*)::int FROM docente_grupo_matriz WHERE docente_id IN ${DOC}) AS filas,
  (SELECT COALESCE(md5(string_agg(d::text, '|' ORDER BY d.id)), '') FROM docente_grupo_matriz d WHERE d.docente_id IN ${DOC}) AS h_filas,
  (SELECT COUNT(*)::int FROM docente_grupo_matriz_cambios WHERE docente_id IN ${DOC}) AS cambios,
  (SELECT COALESCE(md5(string_agg(c::text, '|' ORDER BY c.id)), '') FROM docente_grupo_matriz_cambios c WHERE c.docente_id IN ${DOC}) AS h_cambios,
  (SELECT COALESCE(md5(string_agg(i::text, '|' ORDER BY i.id)), '') FROM docente_grupo_matriz_incidencias i WHERE i.docente_id IN ${DOC}) AS h_inc,
  (SELECT COALESCE(string_agg(u.id || ':' || COALESCE(u.grupo_matriz_id::text, '-') || ':' || u.estado, ',' ORDER BY u.id), '') FROM usuarios u WHERE u.id IN ${DOC}) AS espejo,
  (SELECT COALESCE(md5(string_agg(e::text, '|' ORDER BY e.id)), '') FROM proyecto_entregables e WHERE e.docente_id IN ${DOC}) AS h_reportes`))[0];

async function cleanup() {
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%` });
  for (const sem of SEMS) await purgarAsignaciones(pool, { semestre: sem });
  const g = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $2)`, [g, `${M}.%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]);
  await q(`DELETE FROM importaciones_matriz WHERE semestre = ANY($1::text[])`, [SEMS]);
  await q(`DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [SEMS]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

let contador = 0;
const mkUser = async (n, { rol = "docente", tipo = "ANTIGUO", estado = "activo" } = {}) => {
  contador += 1;
  const nombre = `${n}${contador}`;
  return (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente) VALUES ($1, 'Prueba', $2, $3, $4, $5, $6) RETURNING id, nombre, apellido, correo, rol`,
    [`${M}_${nombre}`, `${M}.${nombre}@test.local`, rol, ctx.prog, estado, rol === "docente" ? tipo : null]
  ))[0];
};
/** Docente (opcionalmente ya asignado a un grupo, por el servicio y en el semestre activo). */
const docente = async (n, grupo = null, opts = {}) => {
  const u = await mkUser(n, opts);
  if (grupo) await cambiarGrupo(pool, { docenteId: u.id, grupoId: grupo, actorId: ctx.adm1.id, motivo: "Asignación inicial de la prueba" });
  return u;
};
const filas = (id) => q(`SELECT a.*, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE a.docente_id = $1 ORDER BY a.id`, [id]);
const eventos = (id) => q(`SELECT * FROM docente_grupo_matriz_cambios WHERE docente_id = $1 ORDER BY id`, [id]);
const espejo = async (id) => (await q(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [id]))[0].grupo_matriz_id;
const vigente = async (id) => (await q(`SELECT * FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [id]))[0] ?? null;
const rechaza = async (promesa, estado, codigo) => {
  const e = await promesa.then(() => null, (err) => err);
  assert.ok(e, "la operación debía rechazarse");
  if (estado != null) assert.equal(e.status ?? e.estado ?? e.statusCode, estado, `${e.codigo ?? e.code}: ${e.message}`);
  if (codigo != null) assert.equal(e.codigo ?? e.code, codigo, e.message);
  return e;
};
/** Invariantes de un docente tras cualquier secuencia de operaciones. */
async function invariantes(id) {
  const vig = (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [id]))[0].n;
  assert.ok(vig <= 1, "a lo sumo una asignación vigente");
  const v = await vigente(id);
  assert.equal(await espejo(id), v?.grupo_id ?? null, "el espejo coincide con la asignación vigente");
  const ev = await eventos(id);
  for (let i = 1; i < ev.length; i += 1) assert.equal(ev[i].grupo_anterior_id, ev[i - 1].grupo_nuevo_id, "la cadena de cambios es continua");
  const fs = await filas(id);
  assert.equal(ev.filter((e) => e.origen !== "reconciliacion").length + ev.filter((e) => e.origen === "reconciliacion").length, ev.length);
  for (const f of fs) if (!f.vigente) assert.ok(f.hasta, "las filas cerradas tienen fin");
  return { fs, ev };
}
const proyecto = async (n, docenteId) => {
  const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, NULL, $2, 'proyecto', '2026-02-02', 4) RETURNING id`, [`${M} ${n}`, docenteId]))[0].id;
  for (let k = 1; k <= 4; k += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, '2026-02-02'::date + $3::int, '2026-02-02'::date + $3::int + 6)`, [p, k, (k - 1) * 7]);
  return p;
};
const reporte = (proy, docenteId, plantilla, estado = "aprobado") =>
  q(`INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, horas, completado, estado_revision) SELECT id, $3, $2, 'x', 2, true, $4 FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = 1`, [proy, docenteId, plantilla, estado]);

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  assert.ok((await q(`SELECT to_regclass('docente_grupo_matriz_cambios') AS t`))[0].t, "falta la migración fase28 (npm run test:db:setup)");
  await cleanup();
  const hoy = hoyBogota();
  activosPrevios = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await q(`UPDATE semestres SET activo = false WHERE activo`);
  for (const [codigo, desde] of [[SA, -21], [SB, 120], [SC, 400]]) {
    await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, $4)`, [codigo, sumarDias(hoy, desde), sumarDias(hoy, desde + 111), codigo === SA]);
  }
  ctx.prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`]))[0].id;
  const grupo = async (clave, nombre, tipo, sem, activo = true) => {
    ctx.g[clave] = (await q(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ($1, 'sintético', $2, 10, 1, 0, 0, 0, $3, $4) RETURNING id`, [`${M} ${nombre}`, tipo, activo, sem]
    ))[0].id;
    ctx.t[clave] = (await q(
      `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
       VALUES ($1, 1, 'Proyecto', 'Proyecto', 'Octubre', 1, $2, 'Cargar soporte', 2, 0, 4) RETURNING id`, [ctx.g[clave], `${M} Entrega ${nombre}`]
    ))[0].id;
  };
  await grupo("a1", "A1", "ANTIGUO", SA);
  await grupo("a2", "A2", "ANTIGUO", SA);
  await grupo("a3", "A3", "ANTIGUO", SA);
  await grupo("aN", "AN nuevo", "NUEVO", SA);
  await grupo("aX", "AX inactivo", "ANTIGUO", SA, false);
  await grupo("b1", "B1", "ANTIGUO", SB);
  await grupo("c1", "C1", "ANTIGUO", SC);
  ctx.adm1 = await mkUser("Admin1", { rol: "admin" });
  ctx.adm2 = await mkUser("Admin2", { rol: "admin" });
  ctx.admInactivo = await mkUser("AdminInactivo", { rol: "admin", estado: "inactivo" });
  ctx.tok.adm1 = token(ctx.adm1);
  ctx.tok.adm2 = token(ctx.adm2);
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
    await q(`UPDATE semestres SET activo = false WHERE codigo = ANY($1::text[])`, [SEMS]);
    await cleanup();
    if (activosPrevios.length) await q(`UPDATE semestres SET activo = true WHERE codigo = ANY($1::text[])`, [activosPrevios]);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g,
      (SELECT COUNT(*) FROM semestres WHERE codigo = ANY($3::text[]))::int s, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas,
      (SELECT COUNT(*) FROM docente_grupo_matriz_cambios)::int cambios`, [`${M}.%`, `${M}%`, SEMS]))[0];
    assert.deepEqual(r, { u: 0, g: 0, s: 0, filas: 0, cambios: 0 }, "no deben quedar fixtures ni filas del historial");
  }
  await pool.end();
});

// ───────────────────────── 1–2. Asignación inicial y cambio legítimo ─────────────────────────
test("1. Asignación inicial: fila vigente con autor y fecha, espejo actualizado y un evento con motivo (sin datos sensibles)", { skip }, async () => {
  const d = await docente("Inicial");
  const r = await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: "  Alta en el grupo A1  " });
  assert.equal(r.cambio, true);
  const v = await vigente(d.id);
  assert.equal(v.grupo_id, ctx.g.a1);
  assert.equal(v.origen, "asignacion_admin");
  assert.equal(v.certeza, "registrada");
  assert.equal(v.creado_por, ctx.adm1.id);
  assert.ok(v.desde && !v.hasta);
  assert.equal(v.evidencia, null, "no se guarda evidencia ni datos adicionales");
  assert.equal(await espejo(d.id), ctx.g.a1);
  const ev = await eventos(d.id);
  assert.equal(ev.length, 1);
  assert.deepEqual(
    { ant: ev[0].grupo_anterior_id, nuevo: ev[0].grupo_nuevo_id, sa: ev[0].semestre_anterior, sn: ev[0].semestre_nuevo, por: ev[0].cambiado_por, origen: ev[0].origen, motivo: ev[0].motivo },
    { ant: null, nuevo: ctx.g.a1, sa: null, sn: SA, por: ctx.adm1.id, origen: "asignacion_admin", motivo: "Alta en el grupo A1" }
  );
  assert.ok(ev[0].cambiado_en, "fecha y hora");
  assert.equal(Number(r.evento_id), Number(ev[0].id));
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('docente_grupo_matriz', 'docente_grupo_matriz_cambios', 'docente_grupo_matriz_incidencias')`)).map((c) => c.column_name);
  assert.ok(!cols.some((c) => /token|password|contrasen|secret|google_sub|correo/i.test(c)), "ninguna columna guarda datos sensibles");
  await invariantes(d.id);
});

test("2. Cambio legítimo dentro del semestre (sin reportes): la fila anterior se cierra con autor y motivo; ambas se conservan", { skip }, async () => {
  const d = await docente("Cambio", ctx.g.a1);
  const r = await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm2.id, motivo: "Reubicación por carga académica" });
  assert.equal(r.cambio, true);
  assert.equal(r.grupo_anterior_id, ctx.g.a1);
  const { fs, ev } = await invariantes(d.id);
  assert.equal(fs.length, 2);
  const cerrada = fs.find((f) => !f.vigente);
  assert.equal(cerrada.grupo_id, ctx.g.a1);
  assert.equal(cerrada.cerrado_por, ctx.adm2.id);
  assert.equal(cerrada.motivo_cierre, "Reubicación por carga académica");
  assert.ok(cerrada.hasta && cerrada.cerrado_en);
  assert.equal((await vigente(d.id)).grupo_id, ctx.g.a2);
  assert.equal(ev.length, 2);
  assert.deepEqual({ ant: ev[1].grupo_anterior_id, nuevo: ev[1].grupo_nuevo_id, por: ev[1].cambiado_por }, { ant: ctx.g.a1, nuevo: ctx.g.a2, por: ctx.adm2.id });
  assert.equal(Number(ev[1].fila_cerrada_id), Number(cerrada.id));
});

// ───────────────────────── 3–4. Cambio de semestre y asignación fuera del semestre activo (B1) ─────────────────────────
test("3. B1 · Cambio de semestre: procedimiento explícito, todo o nada, sin perder lo anterior ni tocar reportes", { skip }, async () => {
  const d1 = await docente("Trans1", ctx.g.a1);
  const d2 = await docente("Trans2", ctx.g.a2);
  const d3 = await docente("Trans3");
  const dN = await docente("TransN", null, { tipo: "NUEVO" });
  const p = await proyecto("Trans", d1.id);
  await reporte(p, d1.id, ctx.t.a1, "aprobado");
  const lista = [{ docente_id: d1.id, grupo_id: ctx.g.b1 }, { docente_id: d2.id, grupo_id: ctx.g.b1 }, { docente_id: d3.id, grupo_id: ctx.g.b1 }];
  try {
    // El semestre siguiente NO está activo: la transición no lo activa por su cuenta.
    let antes = await huella();
    await rechaza(transicionarSemestre(pool, { semestre: SB, asignaciones: lista, actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" }), 409, "SEMESTRE_NO_ACTIVO");
    await rechaza(cambiarGrupo(pool, { docenteId: d1.id, grupoId: ctx.g.b1, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "SEMESTRE_NO_ACTIVO");
    assert.deepEqual(await huella(), antes, "nada cambió");
    // El administrador activa el semestre de forma explícita (endpoint existente).
    assert.equal((await api(`/admin/semestres/${SB}/activar`, ctx.tok.adm1, { method: "PUT" })).status, 200);
    // Ahora el semestre anterior ya no admite asignaciones ordinarias.
    await rechaza(cambiarGrupo(pool, { docenteId: d3.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "SEMESTRE_NO_ACTIVO");
    // Todo o nada: un docente NUEVO hacia un grupo ANTIGUO invalida toda la operación.
    antes = await huella();
    await rechaza(transicionarSemestre(pool, { semestre: SB, asignaciones: [...lista, { docente_id: dN.id, grupo_id: ctx.g.b1 }], actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" }), 409, "TIPO_GRUPO_INCOMPATIBLE");
    await rechaza(transicionarSemestre(pool, { semestre: SB, asignaciones: [lista[0], lista[0]], actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" }), 400, "DOCENTE_REPETIDO");
    await rechaza(transicionarSemestre(pool, { semestre: SB, asignaciones: [], actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" }), 400, "ASIGNACIONES_VACIAS");
    await rechaza(transicionarSemestre(pool, { semestre: SB, asignaciones: lista, actorId: ctx.adm1.id, motivo: "" }), 400, "MOTIVO_OBLIGATORIO");
    assert.deepEqual(await huella(), antes, "las transiciones rechazadas no dejan rastro");
    // Transición válida.
    const r = await transicionarSemestre(pool, { semestre: SB, asignaciones: lista, actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" });
    assert.deepEqual({ s: r.solicitadas, c: r.cambiadas, n: r.sin_cambios }, { s: 3, c: 3, n: 0 });
    for (const d of [d1, d2, d3]) {
      const { fs, ev } = await invariantes(d.id);
      assert.equal((await vigente(d.id)).grupo_id, ctx.g.b1);
      assert.equal((await vigente(d.id)).origen, "transicion_semestre");
      assert.equal(ev.at(-1).origen, "transicion_semestre");
      assert.equal(ev.at(-1).semestre_nuevo, SB);
      assert.ok(fs.every((f) => f.vigente || f.hasta), "las asignaciones anteriores se conservan cerradas");
    }
    assert.equal((await filas(d1.id)).length, 2, "la asignación del semestre anterior sigue en el historial");
    assert.equal((await filas(d1.id))[0].semestre, SA);
    assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE docente_id = $1`, [d1.id]))[0].estado_revision, "aprobado", "el reporte aprobado no se tocó");
    // Idempotente: repetir la misma transición no crea eventos ni filas.
    antes = await huella();
    const otra = await transicionarSemestre(pool, { semestre: SB, asignaciones: lista, actorId: ctx.adm1.id, motivo: "Inicio del nuevo semestre" });
    assert.deepEqual({ c: otra.cambiadas, n: otra.sin_cambios }, { c: 0, n: 3 });
    assert.deepEqual(await huella(), antes);
  } finally {
    await api(`/admin/semestres/${SA}/activar`, ctx.tok.adm1, { method: "PUT" });
  }
});

test("4. B1 · No se asigna a grupos de un semestre futuro mientras otro está activo (409 claro, sin rastro; también por HTTP)", { skip }, async () => {
  const d = await docente("Futuro", ctx.g.a1);
  const antes = await huella();
  const e = await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.c1, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "SEMESTRE_NO_ACTIVO");
  assert.match(e.message, new RegExp(SA));
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.b1, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "SEMESTRE_NO_ACTIVO");
  const http = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.c1, motivo: MOTIVO } });
  assert.equal(http.status, 409);
  assert.equal(http.data.codigo, "SEMESTRE_NO_ACTIVO");
  assert.equal(http.data.semestre_activo, SA);
  assert.deepEqual(await huella(), antes, "estado idéntico antes y después de los rechazos");
});

// ───────────────────────── 5–7. Docente sin grupo, inactivación y eliminación ─────────────────────────
test("5. Docente sin grupo: es un estado válido; quitar el grupo cierra la fila y registra el cambio; repetir no crea eventos", { skip }, async () => {
  const libre = await docente("Libre");
  assert.equal((await filas(libre.id)).length, 0);
  assert.equal((await eventos(libre.id)).length, 0);
  assert.deepEqual(await cambiarGrupo(pool, { docenteId: libre.id, grupoId: null, actorId: ctx.adm1.id }), { cambio: false, docente_id: libre.id, grupo_id: null });
  const d = await docente("Quitar", ctx.g.a1);
  const r = await cambiarGrupo(pool, { docenteId: d.id, grupoId: null, actorId: ctx.adm1.id, motivo: "El docente deja la matriz del semestre" });
  assert.equal(r.cambio, true);
  assert.equal(r.grupo_nuevo_id, null);
  assert.equal(await espejo(d.id), null);
  assert.equal(await vigente(d.id), null);
  const { fs, ev } = await invariantes(d.id);
  assert.equal(fs.length, 1);
  assert.equal(fs[0].vigente, false);
  assert.equal(ev.at(-1).grupo_nuevo_id, null);
  const antes = await huella();
  assert.equal((await cambiarGrupo(pool, { docenteId: d.id, grupoId: null, actorId: ctx.adm1.id })).cambio, false);
  assert.deepEqual(await huella(), antes);
  // Alta por la API sin grupo: sin filas ni eventos; con grupo: un evento de alta.
  const sin = await api("/admin/usuarios", ctx.tok.adm1, { method: "POST", body: { nombres: `${M}x`, apellidos: "Sin", correo: `${M}.altasin@test.local`, rol: "docente", tipo_docente: "ANTIGUO" } });
  assert.equal(sin.status, 201, JSON.stringify(sin.data));
  assert.equal((await filas(sin.data.id)).length, 0);
  const con = await api("/admin/usuarios", ctx.tok.adm1, { method: "POST", body: { nombres: `${M}y`, apellidos: "Con", correo: `${M}.altacon@test.local`, rol: "docente", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.a1 } });
  assert.equal(con.status, 201, JSON.stringify(con.data));
  const evAlta = await eventos(con.data.id);
  assert.equal(evAlta.length, 1);
  assert.equal(evAlta[0].motivo, "Alta del docente con grupo inicial");
  assert.equal(await espejo(con.data.id), ctx.g.a1);
  await invariantes(con.data.id);
});

test("6. Inactivar a un docente conserva su historial y su asignación; no genera eventos", { skip }, async () => {
  const d = await docente("Inactivo", ctx.g.a1);
  const antes = await huella();
  const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "inactivo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.a1 };
  const r = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const despues = await huella();
  assert.equal(despues.filas, antes.filas);
  assert.equal(despues.h_filas, antes.h_filas, "las filas del historial no se tocan");
  assert.equal(despues.cambios, antes.cambios);
  assert.equal((await q(`SELECT estado FROM usuarios WHERE id = $1`, [d.id]))[0].estado, "inactivo");
  assert.equal((await vigente(d.id)).grupo_id, ctx.g.a1);
  await invariantes(d.id);
});

test("7. Un docente con historial no se elimina (RESTRICT, 409 coherente); sin historial sí; el administrador autor tampoco", { skip }, async () => {
  const d = await docente("ConHistorial", ctx.g.a1);
  const sinHist = await docente("SinHistorial");
  const antes = await huella();
  const sql = await q(`DELETE FROM usuarios WHERE id = $1`, [d.id]).then(() => null, (e) => e);
  assert.equal(sql?.code, "23001", "PostgreSQL lo impide (RESTRICT)");
  const del = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm2, { method: "DELETE" });
  assert.equal(del.status, 409, JSON.stringify(del.data));
  assert.equal(del.data.codigo, "HISTORICO_PROTEGIDO");
  assert.match(del.data.error, /asignaci/i);
  // Quien hizo cambios queda como autor y no se elimina: se inactiva.
  const delAdmin = await api(`/admin/usuarios/${ctx.adm1.id}`, ctx.tok.adm2, { method: "DELETE" });
  assert.equal(delAdmin.status, 409, JSON.stringify(delAdmin.data));
  assert.deepEqual(await huella(), antes, "ninguna asignación histórica se perdió");
  assert.equal((await q(`SELECT COUNT(*)::int n FROM usuarios WHERE id = ANY($1::int[])`, [[d.id, ctx.adm1.id]]))[0].n, 2);
  assert.equal((await api(`/admin/usuarios/${sinHist.id}`, ctx.tok.adm2, { method: "DELETE" })).status, 200);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM usuarios WHERE id = $1`, [sinHist.id]))[0].n, 0);
  // La auditoría es inmutable.
  const upd = await q(`UPDATE docente_grupo_matriz_cambios SET motivo = 'otro motivo' WHERE docente_id = $1`, [d.id]).then(() => null, (e) => e);
  const dele = await q(`DELETE FROM docente_grupo_matriz_cambios WHERE docente_id = $1`, [d.id]).then(() => null, (e) => e);
  assert.equal(upd?.code, "23514");
  assert.equal(dele?.code, "23514");
});

// ───────────────────────── 8. Reportes aprobados ─────────────────────────
test("8. Con reportes aprobados en el semestre: no cambia de grupo ni queda sin grupo en él; al pasar de semestre el reporte se conserva", { skip }, async () => {
  const d = await docente("Reportes", ctx.g.a1);
  const p = await proyecto("Reportes", d.id);
  await reporte(p, d.id, ctx.t.a1, "aprobado");
  const antes = await huella();
  const e1 = await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "HISTORICO_PROTEGIDO");
  assert.match(e1.message, /entregable/);
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: null, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "HISTORICO_PROTEGIDO");
  const http = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: MOTIVO } });
  assert.equal(http.status, 409);
  assert.equal(http.data.codigo, "HISTORICO_PROTEGIDO");
  assert.deepEqual(await huella(), antes, "ni filas, ni espejo, ni reportes cambian");
  // Reasignar al MISMO grupo es idempotente aunque haya reportes.
  assert.equal((await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id })).cambio, false);
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE docente_id = $1`, [d.id]))[0].estado_revision, "aprobado");
});

// ───────────────────────── 9–10. Motivo e idempotencia ─────────────────────────
test("9. B3 · El motivo es obligatorio para todo cambio efectivo (servicio y rutas HTTP); sin motivo no queda rastro", { skip }, async () => {
  const d = await docente("Motivo", ctx.g.a1);
  const antes = await huella();
  for (const motivo of [undefined, null, "", "    ", "abc", "  abcd  "]) {
    await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo }), 400, "MOTIVO_OBLIGATORIO");
  }
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: "x".repeat(501) }), 400, "MOTIVO_DEMASIADO_LARGO");
  const h1 = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2 } });
  assert.equal(h1.status, 400);
  assert.equal(h1.data.codigo, "MOTIVO_OBLIGATORIO");
  const cuerpo = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.a2 };
  const h2 = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body: cuerpo });
  assert.equal(h2.status, 400);
  assert.equal(h2.data.codigo, "MOTIVO_OBLIGATORIO");
  assert.deepEqual(await huella(), antes, "estado idéntico tras los rechazos");
  // Con motivo, el mismo cambio se acepta por la ruta de edición de usuario.
  const ok = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body: { ...cuerpo, motivo_cambio_grupo: "Reubicación solicitada por la coordinación" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.grupo_matriz_id, ctx.g.a2);
  assert.equal((await eventos(d.id)).at(-1).motivo, "Reubicación solicitada por la coordinación");
  await invariantes(d.id);
});

test("10. B3 · Reenvíos idempotentes: el mismo grupo no crea eventos ni filas (servicio, HTTP y edición de usuario)", { skip }, async () => {
  const d = await docente("Idem", ctx.g.a1);
  const antes = await huella();
  for (let i = 0; i < 5; i += 1) assert.equal((await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: MOTIVO })).cambio, false);
  const http = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a1, motivo: MOTIVO } });
  assert.equal(http.status, 200);
  assert.equal(http.data.ok, true);
  assert.equal(http.data.cambio, false);
  const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.a1 };
  assert.equal((await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body })).status, 200);
  assert.deepEqual(await huella(), antes, "sin eventos ni filas nuevas");
  // Un cambio real devuelve el id del evento (compatibilidad aditiva de la respuesta).
  const real = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: MOTIVO } });
  assert.equal(real.status, 200);
  assert.deepEqual({ ok: real.data.ok, cambio: real.data.cambio, tiene: Number.isInteger(Number(real.data.evento_id)) }, { ok: true, cambio: true, tiene: true });
});

// ───────────────────────── 11. Incidencias ambiguas (B2) ─────────────────────────
test("11. B2 · Una incidencia ambigua bloquea solo a ese docente; se resuelve de forma explícita y trazable, nunca sola", { skip }, async () => {
  const amb = await docente("Ambiguo", ctx.g.a1);
  const ok = await docente("SinIncidencia", ctx.g.a1);
  const inc = (await q(`INSERT INTO docente_grupo_matriz_incidencias (tipo, docente_id, semestre, detalle) VALUES ('dos_grupos_en_un_semestre', $1, $2, $3::jsonb) RETURNING id`, [amb.id, SA, JSON.stringify({ grupos: [ctx.g.a1, ctx.g.a2] })]))[0].id;
  const antes = await huella();
  const e = await rechaza(cambiarGrupo(pool, { docenteId: amb.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "ASIGNACION_AMBIGUA");
  assert.equal(e.extra?.incidencias?.length, 1);
  const http = await api(`/admin/docentes/${amb.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: MOTIVO } });
  assert.equal(http.status, 409);
  assert.equal(http.data.codigo, "ASIGNACION_AMBIGUA");
  assert.deepEqual(await huella(), antes, "el bloqueo no deja rastro");
  // Otro docente funciona con normalidad.
  assert.equal((await cambiarGrupo(pool, { docenteId: ok.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO })).cambio, true);
  // Reenviar el MISMO grupo no depende de la incidencia (no cambia nada).
  assert.equal((await cambiarGrupo(pool, { docenteId: amb.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id })).cambio, false);
  // Listado.
  const lista = await api(`/admin/asignaciones/incidencias?docente_id=${amb.id}`, ctx.tok.adm1);
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.data.incidencias.map((i) => Number(i.id)), [Number(inc)]);
  assert.equal((await listarIncidencias(pool, { docenteId: amb.id })).length, 1);
  // Permisos y validaciones de la resolución.
  const docTok = token(await mkUser("NoAdmin"));
  assert.equal((await api(`/admin/asignaciones/incidencias/${inc}`, docTok, { method: "PUT", body: { estado: "resuelta", nota: "Resuelta por el docente" } })).status, 403);
  assert.equal((await api(`/admin/asignaciones/incidencias/${inc}`, null, { method: "PUT", body: { estado: "resuelta", nota: "Sin sesión alguna" } })).status, 401);
  await rechaza(resolverIncidencia(pool, { id: inc, estado: "resuelta", nota: "corta", actorId: ctx.adm1.id }), 400, "NOTA_OBLIGATORIA");
  await rechaza(resolverIncidencia(pool, { id: inc, estado: "otra", nota: "Nota suficientemente larga", actorId: ctx.adm1.id }), 400, "ESTADO_INVALIDO");
  await rechaza(resolverIncidencia(pool, { id: inc, estado: "resuelta", nota: "Nota suficientemente larga", actorId: ctx.admInactivo.id }), 403, "ACTOR_INVALIDO");
  assert.equal((await q(`SELECT estado FROM docente_grupo_matriz_incidencias WHERE id = $1`, [inc]))[0].estado, "pendiente", "nada se resolvió por su cuenta");
  // Resolución explícita y trazable.
  const res = await api(`/admin/asignaciones/incidencias/${inc}`, ctx.tok.adm2, { method: "PUT", body: { estado: "resuelta", nota: "Confirmado con la coordinación: grupo A1" } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const fila = (await q(`SELECT * FROM docente_grupo_matriz_incidencias WHERE id = $1`, [inc]))[0];
  assert.deepEqual({ estado: fila.estado, por: fila.resuelta_por, nota: fila.nota }, { estado: "resuelta", por: ctx.adm2.id, nota: "Confirmado con la coordinación: grupo A1" });
  assert.ok(fila.resuelta_en);
  assert.equal((await vigente(amb.id)).grupo_id, ctx.g.a1, "resolver no reasigna a nadie");
  await rechaza(resolverIncidencia(pool, { id: inc, estado: "descartada", nota: "Segundo intento de resolver", actorId: ctx.adm1.id }), 409, "INCIDENCIA_YA_RESUELTA");
  // Resuelta la incidencia, el docente vuelve a poder cambiar de grupo.
  assert.equal((await cambiarGrupo(pool, { docenteId: amb.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO })).cambio, true);
  await invariantes(amb.id);
});

// ───────────────────────── 12. Concurrencia ─────────────────────────
test("12. Dos administradores simultáneos (conexiones PostgreSQL reales): una sola vigente, espejo coherente, cadena continua, sin interbloqueos", { skip }, async () => {
  const destinos = [ctx.g.a1, ctx.g.a2, ctx.g.a3];
  const permitidos = new Set(["CONFLICTO_ASIGNACION"]);
  for (let ronda = 0; ronda < 12; ronda += 1) {
    const d = await docente(`Conc${ronda}`);
    const g1 = destinos[ronda % 3];
    const g2 = destinos[(ronda + (ronda % 2 === 0 ? 1 : 0)) % 3]; // algunas rondas piden el MISMO grupo
    const resultados = await Promise.allSettled([
      cambiarGrupo(pool, { docenteId: d.id, grupoId: g1, actorId: ctx.adm1.id, motivo: "Cambio del administrador uno" }),
      cambiarGrupo(pool, { docenteId: d.id, grupoId: g2, actorId: ctx.adm2.id, motivo: "Cambio del administrador dos" }),
    ]);
    for (const r of resultados) {
      if (r.status === "rejected") {
        assert.notEqual(r.reason?.code, "40P01", "sin interbloqueos");
        assert.ok(permitidos.has(r.reason?.codigo), `error inesperado: ${r.reason?.codigo ?? r.reason?.message}`);
      }
    }
    const { ev } = await invariantes(d.id);
    assert.ok(ev.length >= 1 && ev.length <= 2);
    assert.equal(ev.length, g1 === g2 ? 1 : 2, "el mismo destino se aplica una sola vez; destinos distintos se serializan");
  }
  // Por HTTP: dos solicitudes simultáneas con tokens de administradores distintos.
  const dh = await docente("ConcHttp", ctx.g.a1);
  const [a, b] = await Promise.all([
    api(`/admin/docentes/${dh.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: "Administrador uno por HTTP" } }),
    api(`/admin/docentes/${dh.id}/grupo-matriz`, ctx.tok.adm2, { method: "PUT", body: { grupo_matriz_id: ctx.g.a3, motivo: "Administrador dos por HTTP" } }),
  ]);
  assert.deepEqual([a.status, b.status], [200, 200], JSON.stringify([a.data, b.data]));
  const { ev } = await invariantes(dh.id);
  assert.equal(ev.length, 3);
  // Operaciones masivas y puntuales cruzadas (orden de bloqueos consistente): ningún interbloqueo.
  const x = await docente("MasivaX", ctx.g.a1);
  const y = await docente("MasivaY", ctx.g.a1);
  const mezcla = await Promise.allSettled([
    transicionarSemestre(pool, { semestre: SA, asignaciones: [{ docente_id: y.id, grupo_id: ctx.g.a2 }, { docente_id: x.id, grupo_id: ctx.g.a2 }], actorId: ctx.adm1.id, motivo: "Transición simultánea uno" }),
    transicionarSemestre(pool, { semestre: SA, asignaciones: [{ docente_id: x.id, grupo_id: ctx.g.a3 }, { docente_id: y.id, grupo_id: ctx.g.a3 }], actorId: ctx.adm2.id, motivo: "Transición simultánea dos" }),
    cambiarGrupo(pool, { docenteId: x.id, grupoId: ctx.g.a1, actorId: ctx.adm2.id, motivo: "Cambio puntual simultáneo" }),
    cambiarGrupo(pool, { docenteId: y.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: "Cambio puntual simultáneo" }),
  ]);
  for (const r of mezcla) if (r.status === "rejected") assert.notEqual(r.reason?.code, "40P01", `interbloqueo: ${r.reason?.message}`);
  await invariantes(x.id);
  await invariantes(y.id);
  const deriva = await diagnosticarDeriva(pool);
  assert.ok(!deriva.deriva.some((r) => [x.id, y.id, dh.id].includes(r.docente_id)) && deriva.dobles.length === 0);
});

// ───────────────────────── 13. Importación Excel ─────────────────────────
test("13. Importación Excel con asignación: usa el servicio (origen «importacion», lote en el motivo); reimportar no duplica; fuera del semestre activo se rechaza", { skip }, async () => {
  const ini = sumarDias(hoyBogota(), -21);
  const d = (n) => sumarDias(ini, n);
  const semanas = [{ mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento", items: [{ numero: 1, entregable: `${M} Informe 1`, horas: 1, inicio: d(1), fin: d(4), descripcion: "Cargar soporte" }] }];
  const GRUPO = (nombre) => ({ nombre, tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 });
  const cuerpo = (destino, nombreArchivo = "asignacion.xlsx", extra = {}) => ({
    archivo_base64: crearXlsx([hojaCronograma("G sintética", semanas)]).toString("base64"), nombre_archivo: nombreArchivo, hoja_indice: 0, destino, ...extra,
  });
  const creado = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SA, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo importado`) }) });
  assert.equal(creado.status, 200, JSON.stringify(creado.data));
  const gImp = creado.data.grupo_id;
  const nuevoDoc = await docente("ImportaNuevo");
  const conGrupo = await docente("ImportaReasigna", ctx.g.a1);
  // Asignación inicial por importación.
  const imp = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SA, modo: "grupo_existente", grupo_id: gImp, asignar_docente_id: nuevoDoc.id }) });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.resumen.docente_asignado_id, nuevoDoc.id);
  assert.equal(await espejo(nuevoDoc.id), gImp);
  const v = await vigente(nuevoDoc.id);
  assert.deepEqual({ g: v.grupo_id, origen: v.origen, por: v.creado_por }, { g: gImp, origen: "importacion", por: ctx.adm1.id });
  const ev = await eventos(nuevoDoc.id);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].origen, "importacion");
  assert.match(ev[0].motivo, /asignacion\.xlsx/);
  assert.match(ev[0].motivo, /lote/);
  // Reimportar el mismo archivo con el mismo docente no duplica la asignación.
  const antes = await huella();
  const otra = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SA, modo: "grupo_existente", grupo_id: gImp, asignar_docente_id: nuevoDoc.id }) });
  assert.equal(otra.status, 200, JSON.stringify(otra.data));
  assert.equal((await eventos(nuevoDoc.id)).length, 1);
  assert.equal((await filas(nuevoDoc.id)).length, 1);
  assert.equal((await huella()).h_filas, antes.h_filas);
  // Un docente con otro grupo exige decisión explícita y, al reasignar, el historial conserva la fila anterior.
  const sinDecision = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SA, modo: "grupo_existente", grupo_id: gImp, asignar_docente_id: conGrupo.id }) });
  assert.equal(sinDecision.status, 409);
  assert.equal((await vigente(conGrupo.id)).grupo_id, ctx.g.a1, "sin decisión no se reasigna");
  const reasigna = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SA, modo: "grupo_existente", grupo_id: gImp, asignar_docente_id: conGrupo.id }, "reasigna.xlsx", { decisiones: { docente: "reasignar" } }) });
  assert.equal(reasigna.status, 200, JSON.stringify(reasigna.data));
  const { fs, ev: evR } = await invariantes(conGrupo.id);
  assert.equal(fs.length, 2);
  assert.equal(evR.at(-1).origen, "importacion");
  assert.equal(evR.at(-1).grupo_anterior_id, ctx.g.a1);
  // Fuera del semestre activo: la vista previa lo avisa y la confirmación se rechaza sin rastro.
  const otroSem = await docente("ImportaFuturo");
  const gB = (await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SB, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo futuro`) }, "futuro.xlsx") }));
  const estado = await huella();
  if (gB.status === 200) {
    const prev = await api("/admin/importaciones/validar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SB, modo: "grupo_existente", grupo_id: gB.data.grupo_id, asignar_docente_id: otroSem.id }, "futuro.xlsx") });
    assert.ok(prev.data.errores_globales?.some((e) => e.codigo === "DOCENTE_SEMESTRE_NO_ACTIVO"), JSON.stringify(prev.data.errores_globales));
    const rej = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: cuerpo({ semestre: SB, modo: "grupo_existente", grupo_id: gB.data.grupo_id, asignar_docente_id: otroSem.id }, "futuro.xlsx") });
    assert.ok(rej.status >= 400, JSON.stringify(rej.data));
    assert.deepEqual(await huella(), estado);
    assert.equal(await espejo(otroSem.id), null);
  }
});

// ───────────────────────── 14. Error a mitad de la transacción ─────────────────────────
test("14. Un fallo a mitad de la transacción deshace todo: historial, espejo y registro quedan idénticos (servicio, HTTP e importación)", { skip }, async () => {
  const d = await docente("Falla", ctx.g.a1);
  const nuevo = await docente("FallaNuevo");
  await q(`CREATE OR REPLACE FUNCTION tst_as_falla() RETURNS trigger AS $f$ BEGIN IF NEW.motivo LIKE '%FALLA_SIMULADA%' THEN RAISE EXCEPTION 'falla simulada del registro'; END IF; RETURN NEW; END $f$ LANGUAGE plpgsql`);
  await q(`DROP TRIGGER IF EXISTS tst_as_falla ON docente_grupo_matriz_cambios`);
  await q(`CREATE TRIGGER tst_as_falla BEFORE INSERT ON docente_grupo_matriz_cambios FOR EACH ROW EXECUTE FUNCTION tst_as_falla()`);
  try {
    // El fallo ocurre DESPUÉS de cerrar la fila, abrir la nueva y actualizar el espejo (último paso).
    const antes = await huella();
    const e = await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: "Cambio con FALLA_SIMULADA" }).then(() => null, (err) => err);
    assert.match(e?.message ?? "", /falla simulada/);
    assert.deepEqual(await huella(), antes, "rollback total");
    assert.equal(await espejo(d.id), ctx.g.a1);
    assert.equal((await vigente(d.id)).grupo_id, ctx.g.a1);
    // Por HTTP: 500 genérico, sin detalle interno y sin cambios.
    const http = await api(`/admin/docentes/${d.id}/grupo-matriz`, ctx.tok.adm1, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: "Cambio con FALLA_SIMULADA" } });
    assert.equal(http.status, 500);
    assert.doesNotMatch(JSON.stringify(http.data), /falla simulada|docente_grupo_matriz/);
    assert.deepEqual(await huella(), antes);
    // Transición masiva: si el último falla, ninguno se aplica.
    const x = await docente("FallaMasivaX", ctx.g.a1);
    const antes2 = await huella();
    await rechaza(transicionarSemestre(pool, { semestre: SA, asignaciones: [{ docente_id: x.id, grupo_id: ctx.g.a2 }, { docente_id: d.id, grupo_id: ctx.g.a2 }], actorId: ctx.adm1.id, motivo: "Transición con FALLA_SIMULADA" }));
    assert.deepEqual(await huella(), antes2, "ninguna asignación de la transición quedó aplicada");
    // Importación: el lote completo (grupo, plantillas, importación) se deshace si falla la asignación.
    const ini = sumarDias(hoyBogota(), -21);
    const semanas = [{ mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento", items: [{ numero: 1, entregable: `${M} Informe F`, horas: 1, inicio: sumarDias(ini, 1), fin: sumarDias(ini, 4), descripcion: "Cargar soporte" }] }];
    const GRUPO = { nombre: `${M} Grupo falla`, tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 };
    const grupoOk = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: { archivo_base64: crearXlsx([hojaCronograma("G", semanas)]).toString("base64"), nombre_archivo: "ok.xlsx", hoja_indice: 0, destino: { semestre: SA, modo: "nuevo_grupo", grupo: GRUPO } } });
    assert.equal(grupoOk.status, 200, JSON.stringify(grupoOk.data));
    const importaciones = async () => (await q(`SELECT COUNT(*)::int n FROM importaciones_matriz WHERE semestre = $1`, [SA]))[0].n;
    const nImp = await importaciones();
    const antes3 = await huella();
    const fallo = await api("/admin/importaciones/confirmar", ctx.tok.adm1, { method: "POST", body: { archivo_base64: crearXlsx([hojaCronograma("G", semanas)]).toString("base64"), nombre_archivo: "FALLA_SIMULADA.xlsx", hoja_indice: 0, destino: { semestre: SA, modo: "grupo_existente", grupo_id: grupoOk.data.grupo_id, asignar_docente_id: nuevo.id } } });
    assert.ok(fallo.status >= 400, JSON.stringify(fallo.data));
    assert.equal(await importaciones(), nImp, "la importación tampoco quedó registrada");
    assert.deepEqual(await huella(), antes3);
    assert.equal(await espejo(nuevo.id), null);
  } finally {
    await q(`DROP TRIGGER IF EXISTS tst_as_falla ON docente_grupo_matriz_cambios`);
    await q(`DROP FUNCTION IF EXISTS tst_as_falla()`);
  }
  // Sin el fallo simulado el mismo cambio se aplica.
  assert.equal((await cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: "Cambio ya sin fallo" })).cambio, true);
  await invariantes(d.id);
});

// ───────────────────────── 15. Sincronización historial / espejo ─────────────────────────
test("15. Sincronización: tras una mezcla de operaciones no hay deriva; la deriva ajena se detecta, bloquea al docente y se reconcilia de forma técnica", { skip }, async () => {
  const a = await docente("Sync1", ctx.g.a1);
  const b = await docente("Sync2");
  const c = await docente("Sync3", ctx.g.a2);
  await cambiarGrupo(pool, { docenteId: a.id, grupoId: ctx.g.a3, actorId: ctx.adm1.id, motivo: MOTIVO });
  await cambiarGrupo(pool, { docenteId: b.id, grupoId: ctx.g.a1, actorId: ctx.adm2.id, motivo: MOTIVO });
  await cambiarGrupo(pool, { docenteId: c.id, grupoId: null, actorId: ctx.adm2.id, motivo: MOTIVO });
  let diag = await diagnosticarDeriva(pool);
  assert.deepEqual(diag.deriva.filter((r) => [a.id, b.id, c.id].includes(r.docente_id)), []);
  assert.deepEqual(diag.dobles, []);
  // Simula una escritura del código ANTERIOR sobre el espejo (sin historial).
  await q(`UPDATE usuarios SET grupo_matriz_id = $2 WHERE id = $1`, [b.id, ctx.g.a2]);
  diag = await diagnosticarDeriva(pool);
  assert.deepEqual(diag.deriva.filter((r) => r.docente_id === b.id), [{ docente_id: b.id, espejo: ctx.g.a2, historial_vigente: ctx.g.a1 }]);
  const antes = await huella();
  await rechaza(cambiarGrupo(pool, { docenteId: b.id, grupoId: ctx.g.a3, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "ASIGNACION_INCONSISTENTE");
  assert.deepEqual(await huella(), antes, "con deriva no se escribe nada");
  assert.equal((await cambiarGrupo(pool, { docenteId: a.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: MOTIVO })).cambio, true, "los demás docentes siguen funcionando");
  // Simulación (solo lectura) y reconciliación.
  const sim = await reconciliar(pool, { aplicar: false });
  assert.ok(sim.pendientes_detalle.some((r) => r.docente_id === b.id));
  assert.equal((await vigente(b.id)).grupo_id, ctx.g.a1, "la simulación no escribe");
  const rec = await reconciliar(pool, { aplicar: true });
  assert.ok(rec.reconciliados.includes(b.id));
  assert.deepEqual(rec.no_reconciliados, []);
  const { fs, ev } = await invariantes(b.id);
  assert.equal((await vigente(b.id)).grupo_id, ctx.g.a2);
  assert.equal((await vigente(b.id)).origen, "reconciliacion");
  assert.equal(fs.length, 2);
  const tecnico = ev.at(-1);
  assert.deepEqual({ origen: tecnico.origen, por: tecnico.cambiado_por }, { origen: "reconciliacion", por: null }, "origen técnico verificable, sin administrador");
  assert.equal((await diagnosticarDeriva(pool)).deriva.length, 0);
  // Idempotente.
  const antes2 = await huella();
  assert.equal((await reconciliar(pool, { aplicar: true })).reconciliados.length, 0);
  assert.deepEqual(await huella(), antes2);
});

// ───────────────────────── 16. Reaplicación segura de la migración ─────────────────────────
test("16. Reaplicar la migración (ejecutor estándar y archivo completo) con datos existentes no cambia ni duplica nada", { skip }, async () => {
  await docente("Migra1", ctx.g.a1);
  const d2 = await docente("Migra2", ctx.g.a2);
  await cambiarGrupo(pool, { docenteId: d2.id, grupoId: ctx.g.a3, actorId: ctx.adm1.id, motivo: MOTIVO });
  const antes = await huella();
  for (const env of [{ PROYSOCIAL_APLICAR_FASE28: "1" }, {}]) {
    const m = spawnSync(process.execPath, ["scripts/migrate.js"], { cwd: backendDir, env: { ...process.env, ...env }, encoding: "utf8" });
    assert.equal(m.status, 0, m.stdout + m.stderr);
    assert.doesNotMatch(m.stdout, /Aplicada: fase28/, "una migración ya aplicada no se vuelve a ejecutar");
  }
  assert.deepEqual(await huella(), antes);
  const sql = await readFile(path.join(backendDir, "migrations/fase28_docente_grupo_matriz.sql"), "utf8");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(sql);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  assert.deepEqual(await huella(), antes, "ejecutar el archivo completo otra vez es inocuo (idempotente)");
  const bf = (await q(`SELECT docente_grupo_matriz_backfill() AS r`))[0].r;
  assert.equal(bf.omitido, true, "con el historial en uso el backfill (carga inicial) no hace nada");
});

// ───────────────────────── 17. Permisos, actor y reglas del destino ─────────────────────────
test("17. Permisos y validaciones: solo administradores activos; grupo inactivo/inexistente/de otro tipo se rechaza sin rastro", { skip }, async () => {
  const d = await docente("Perm", ctx.g.a1);
  const nuevoTipo = await docente("PermNuevo", null, { tipo: "NUEVO" });
  const docTok = token(d);
  const antes = await huella();
  assert.equal((await api(`/admin/docentes/${d.id}/grupo-matriz`, docTok, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: MOTIVO } })).status, 403);
  assert.equal((await api(`/admin/docentes/${d.id}/grupo-matriz`, null, { method: "PUT", body: { grupo_matriz_id: ctx.g.a2, motivo: MOTIVO } })).status, 401);
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: ctx.admInactivo.id, motivo: MOTIVO }), 403, "ACTOR_INVALIDO");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: d.id, motivo: MOTIVO }), 403, "ACTOR_INVALIDO");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.a2, actorId: 999999999, motivo: MOTIVO }), 403, "ACTOR_INVALIDO");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.aX, actorId: ctx.adm1.id, motivo: MOTIVO }), 404, "GRUPO_NO_DISPONIBLE");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: 999999999, actorId: ctx.adm1.id, motivo: MOTIVO }), 404, "GRUPO_NO_DISPONIBLE");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: ctx.g.aN, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "TIPO_GRUPO_INCOMPATIBLE");
  await rechaza(cambiarGrupo(pool, { docenteId: ctx.adm2.id, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO }), 404, "DOCENTE_NO_ENCONTRADO");
  await rechaza(cambiarGrupo(pool, { docenteId: 999999999, grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO }), 404, "DOCENTE_NO_ENCONTRADO");
  await rechaza(cambiarGrupo(pool, { docenteId: "abc", grupoId: ctx.g.a2, actorId: ctx.adm1.id, motivo: MOTIVO }), 400, "DOCENTE_INVALIDO");
  await rechaza(cambiarGrupo(pool, { docenteId: d.id, grupoId: "xyz", actorId: ctx.adm1.id, motivo: MOTIVO }), 400, "GRUPO_INVALIDO");
  await rechaza(cambiarGrupo(pool, { docenteId: nuevoTipo.id, grupoId: ctx.g.a1, actorId: ctx.adm1.id, motivo: MOTIVO }), 409, "TIPO_GRUPO_INCOMPATIBLE");
  assert.deepEqual(await huella(), antes, "ningún rechazo dejó rastro");
  // Cambio de tipo de docente que dejaría una asignación incompatible: se rechaza; quitando el grupo con motivo, se acepta.
  const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "activo", tipo_docente: "NUEVO", grupo_matriz_id: ctx.g.a1 };
  const conflicto = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body });
  assert.equal(conflicto.status, 409, JSON.stringify(conflicto.data));
  assert.deepEqual(await huella(), antes, "el conflicto de tipo no cambia nada");
  const quita = await api(`/admin/usuarios/${d.id}`, ctx.tok.adm1, { method: "PUT", body: { ...body, grupo_matriz_id: null, motivo_cambio_grupo: "Cambio de tipo de docente: se retira del grupo" } });
  assert.equal(quita.status, 200, JSON.stringify(quita.data));
  assert.equal(await espejo(d.id), null);
  assert.equal(await vigente(d.id), null);
  assert.equal((await q(`SELECT tipo_docente FROM usuarios WHERE id = $1`, [d.id]))[0].tipo_docente, "NUEVO");
  await invariantes(d.id);
});

// ───────────────────────── 18. Esquema pendiente ─────────────────────────
test("18. Si el historial aún no existe en la base, el servicio falla de forma explícita (503) y no escribe el espejo", { skip }, async () => {
  const falso = { query: async () => ({ rows: [{ t: null, c: null }] }) };
  reiniciarCacheEsquema();
  try {
    await rechaza(asegurarEsquema(falso), 503, "ESQUEMA_ASIGNACIONES_PENDIENTE");
    await rechaza(cambiarGrupo({ connect: async () => ({ query: async (s) => (/BEGIN|ROLLBACK/.test(s) ? {} : { rows: [{ t: null, c: null }] }), release() {} }) }, { docenteId: 1, grupoId: 1, actorId: 1, motivo: MOTIVO }), 503, "ESQUEMA_ASIGNACIONES_PENDIENTE");
  } finally {
    reiniciarCacheEsquema();
    await asegurarEsquema(pool);
  }
});
