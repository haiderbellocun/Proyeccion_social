// Bloque 3B · cierre de la Fase B: el backend NUEVO contra una base que todavía tiene las 34 migraciones (sin fase28).
// Crea una base LOCAL desechable `proysocial_test_pre28` (nombre exacto, solo servidor local, sin DATABASE_URL), la migra con el ejecutor
// estándar SIN la compuerta (queda en 34 migraciones y «Pendiente (NO aplicada)»), arranca el servidor contra ella y comprueba que toda
// operación de asignación falla de forma EXPLÍCITA (503 ESQUEMA_ASIGNACIONES_PENDIENTE) sin dejar escrituras parciales, que lo demás
// sigue funcionando, y que al aplicar la migración con la compuerta el mismo servidor opera sin reiniciarse. La base se elimina al terminar.
// No toca proysocial_dev ni proysocial_test.
import "dotenv/config";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";
import { crearXlsx, hojaCronograma } from "../support/xlsxBuilder.js";

const PRE = "proysocial_test_pre28";
const DB_OK =
  process.env.PGDATABASE === "proysocial_test" &&
  ["localhost", "127.0.0.1", "::1"].includes(process.env.PGHOST || "localhost") &&
  !process.env.DATABASE_URL &&
  !process.env.INSTANCE_CONNECTION_NAME;
const skip = DB_OK ? false : "Solo corre con PGDATABASE=proysocial_test en el servidor local (npm run test:integration:protegidos)";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4324;
const API = `http://127.0.0.1:${PORT}`;
const conn = { host: process.env.PGHOST || "localhost", port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || "postgres", password: process.env.PGPASSWORD || undefined };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const SA = "2094A";
const MOTIVO = "Prueba contra base sin migración 28";
let server;
let db; // cliente a la base desechable
const ctx = {};

const envPre = (extra = {}) => ({ ...process.env, PGDATABASE: PRE, PGHOST: conn.host, DATABASE_URL: "", INSTANCE_CONNECTION_NAME: "", ...extra });
const migrar = (extra = {}) => spawnSync(process.execPath, ["scripts/migrate.js"], { cwd: backendDir, env: envPre(extra), encoding: "utf8" });
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const api = async (ruta, tokenSesion, options = {}) => {
  const r = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { ...(tokenSesion ? { Authorization: `Bearer ${tokenSesion}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
async function soltarBase() {
  const admin = new pkg.Client({ ...conn, database: "postgres" });
  await admin.connect();
  try { await admin.query(`DROP DATABASE IF EXISTS ${PRE} WITH (FORCE)`); } finally { await admin.end(); }
}

before(async () => {
  if (!DB_OK) return;
  await soltarBase();
  const admin = new pkg.Client({ ...conn, database: "postgres" });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${PRE}`);
  await admin.end();
  const m = migrar(); // sin PROYSOCIAL_APLICAR_FASE28
  assert.equal(m.status, 0, m.stdout + m.stderr);
  assert.match(m.stdout, /Pendiente \(NO aplicada\)/);
  db = new pkg.Client({ ...conn, database: PRE });
  await db.connect();
  process.env.JWT_SECRET ||= "pruebas-esquema-pendiente-secreto-largo-0123456789";
  const { createSessionToken } = await import("../../src/middleware/auth.js");
  const mk = async (n, rol) => (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, estado, tipo_docente) VALUES ($1, 'Pre', $2, $3, 'activo', $4) RETURNING id, nombre, apellido, correo, rol`, [n, `${n}@test.local`, rol, rol === "docente" ? "ANTIGUO" : null]))[0];
  ctx.admin = await mk("PreAdmin", "admin");
  ctx.docente = await mk("PreDocente", "docente");
  ctx.tok = createSessionToken(ctx.admin);
  await q(`UPDATE semestres SET activo = FALSE`);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, CURRENT_DATE - 21, CURRENT_DATE + 90, 16, TRUE)`, [SA]);
  ctx.grupo = (await q(`INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) VALUES ('Pre G1', 's', 'ANTIGUO', 10, 1, 0, 0, 0, true, $1) RETURNING id`, [SA]))[0].id;
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: envPre({ PORT: String(PORT), JWT_SECRET: process.env.JWT_SECRET, ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false", EMAIL_ENABLED: "false" }),
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await esperar(150);
  }
});
after(async () => {
  server?.kill();
  await db?.end().catch(() => {});
  if (DB_OK) await soltarBase();
});

const estado = async () => ({
  espejo: (await q(`SELECT id, grupo_matriz_id FROM usuarios ORDER BY id`)).map((r) => `${r.id}:${r.grupo_matriz_id}`).join(","),
  usuarios: (await q(`SELECT COUNT(*)::int n FROM usuarios`))[0].n,
  importaciones: (await q(`SELECT COUNT(*)::int n FROM importaciones_matriz`))[0].n,
  grupos: (await q(`SELECT COUNT(*)::int n FROM grupos_matriz`))[0].n,
});

test("1. La base tiene las 34 migraciones y NO existen las tablas del historial; el ejecutor la dejó «Pendiente»", { skip }, async () => {
  assert.equal((await q(`SELECT COUNT(*)::int n FROM schema_migrations`))[0].n, 34);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM schema_migrations WHERE nombre LIKE 'fase28%'`))[0].n, 0);
  assert.deepEqual(await q(`SELECT to_regclass('docente_grupo_matriz') AS a, to_regclass('docente_grupo_matriz_cambios') AS b, to_regclass('docente_grupo_matriz_incidencias') AS c`), [{ a: null, b: null, c: null }]);
  const otra = migrar(); // repetir sin compuerta: sigue sin aplicarse y no falla
  assert.equal(otra.status, 0, otra.stdout + otra.stderr);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM schema_migrations`))[0].n, 34);
});

test("2. Con el esquema pendiente toda operación de asignación falla de forma explícita (503) y no deja escrituras parciales", { skip }, async () => {
  const antes = await estado();
  const comprobar = (r, etiqueta) => {
    assert.equal(r.status, 503, `${etiqueta}: ${r.status} ${JSON.stringify(r.data)}`);
    assert.equal(r.data.codigo, "ESQUEMA_ASIGNACIONES_PENDIENTE", etiqueta);
    assert.doesNotMatch(JSON.stringify(r.data), /docente_grupo_matriz\b.*does not exist|relation|syntax/i, "sin detalle interno de la base");
  };
  comprobar(await api(`/admin/docentes/${ctx.docente.id}/grupo-matriz`, ctx.tok, { method: "PUT", body: { grupo_matriz_id: ctx.grupo, motivo: MOTIVO } }), "PUT grupo-matriz");
  const b = { nombre: ctx.docente.nombre, apellido: ctx.docente.apellido, correo: ctx.docente.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.grupo, motivo_cambio_grupo: MOTIVO };
  comprobar(await api(`/admin/usuarios/${ctx.docente.id}`, ctx.tok, { method: "PUT", body: b }), "PUT usuarios");
  comprobar(await api("/admin/usuarios", ctx.tok, { method: "POST", body: { nombres: "Pre", apellidos: "Nuevo", correo: "pre.nuevo@test.local", rol: "docente", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.grupo } }), "POST usuarios con grupo");
  comprobar(await api(`/admin/semestres/${SA}/asignaciones`, ctx.tok, { method: "POST", body: { asignaciones: [{ docente_id: ctx.docente.id, grupo_id: ctx.grupo }], motivo: MOTIVO } }), "transición");
  comprobar(await api(`/admin/asignaciones/incidencias`, ctx.tok), "incidencias");
  // Importación con asignación: se rechaza y NO queda nada de la importación (ni grupo, ni plantillas, ni registro).
  const ini = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const sumar = (n) => new Date(new Date(`${ini}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
  const semanas = [{ mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento", items: [{ numero: 1, entregable: "Pre Informe", horas: 1, inicio: sumar(1), fin: sumar(4), descripcion: "Cargar soporte" }] }];
  const base = { archivo_base64: crearXlsx([hojaCronograma("G", semanas)]).toString("base64"), nombre_archivo: "pre.xlsx", hoja_indice: 0 };
  const creado = await api("/admin/importaciones/confirmar", ctx.tok, { method: "POST", body: { ...base, destino: { semestre: SA, modo: "nuevo_grupo", grupo: { nombre: "Pre Importado", tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 } } } });
  assert.equal(creado.status, 200, JSON.stringify(creado.data)); // importar SIN asignar no necesita el historial
  const tras = await estado();
  const rej = await api("/admin/importaciones/confirmar", ctx.tok, { method: "POST", body: { ...base, destino: { semestre: SA, modo: "grupo_existente", grupo_id: creado.data.grupo_id, asignar_docente_id: ctx.docente.id } } });
  assert.ok(rej.status >= 400, JSON.stringify(rej.data));
  assert.equal(rej.data.codigo, "ESQUEMA_ASIGNACIONES_PENDIENTE", JSON.stringify(rej.data));
  assert.deepEqual(await estado(), tras, "el rechazo de la importación no dejó nada a medias");
  // Nada del resto de rechazos cambió el estado inicial (salvo la importación sin asignar, hecha a propósito).
  assert.equal(antes.usuarios, tras.usuarios);
  assert.equal(antes.espejo, tras.espejo, "el espejo no se escribió nunca sin historial");
  // Quitar un grupo inexistente es un no-op idempotente solo si el esquema existe: aquí también falla explícito.
  comprobar(await api(`/admin/docentes/${ctx.docente.id}/grupo-matriz`, ctx.tok, { method: "PUT", body: { grupo_matriz_id: null, motivo: MOTIVO } }), "quitar grupo");
});

test("3. Lo que no depende del historial sigue funcionando: métricas, semestres, alta sin grupo, edición sin cambio de grupo y eliminación de un docente", { skip }, async () => {
  assert.equal((await api("/admin/semestres", ctx.tok)).status, 200);
  assert.equal((await api("/admin/metricas", ctx.tok)).status, 200);
  const alta = await api("/admin/usuarios", ctx.tok, { method: "POST", body: { nombres: "Pre", apellidos: "SinGrupo", correo: "pre.singrupo@test.local", rol: "docente", tipo_docente: "ANTIGUO" } });
  assert.equal(alta.status, 201, JSON.stringify(alta.data));
  const ed = await api(`/admin/usuarios/${alta.data.id}`, ctx.tok, { method: "PUT", body: { nombre: "Pre", apellido: "SinGrupo2", correo: "pre.singrupo@test.local", rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: null } });
  assert.equal(ed.status, 200, JSON.stringify(ed.data));
  assert.equal((await api(`/admin/usuarios/${alta.data.id}`, ctx.tok, { method: "DELETE" })).status, 200, "las comprobaciones de historia toleran la ausencia de la tabla");
});

test("4. Al aplicar la migración con la compuerta, el MISMO servidor (sin reiniciar) empieza a operar y todo queda registrado", { skip }, async () => {
  const m = migrar({ PROYSOCIAL_APLICAR_FASE28: "1" });
  assert.equal(m.status, 0, m.stdout + m.stderr);
  assert.match(m.stdout, /Aplicada: fase28_docente_grupo_matriz\.sql/);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM schema_migrations`))[0].n, 35);
  const r = await api(`/admin/docentes/${ctx.docente.id}/grupo-matriz`, ctx.tok, { method: "PUT", body: { grupo_matriz_id: ctx.grupo, motivo: MOTIVO } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.cambio, true);
  assert.deepEqual(
    { espejo: (await q(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [ctx.docente.id]))[0].grupo_matriz_id, vigente: (await q(`SELECT grupo_id FROM docente_grupo_matriz WHERE docente_id = $1 AND vigente`, [ctx.docente.id]))[0]?.grupo_id, eventos: (await q(`SELECT COUNT(*)::int n FROM docente_grupo_matriz_cambios WHERE docente_id = $1`, [ctx.docente.id]))[0].n },
    { espejo: ctx.grupo, vigente: ctx.grupo, eventos: 1 }
  );
});
