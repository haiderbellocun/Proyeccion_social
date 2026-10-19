// Pruebas de integración del Bloque 1 contra PostgreSQL REAL (solo base de pruebas).
//
// Requisitos (ver docs/BLOQUE1_SEGUIMIENTO.md):
//   PGHOST=localhost  PGPORT=<puerto>  PGDATABASE=proysocial_test  DATABASE_URL=
//   La base debe llamarse exactamente "proysocial_test" y estar en el servidor local; en cualquier
//   otro caso las pruebas se OMITEN (nunca se ejecutan contra otra base). Las migraciones deben estar
//   aplicadas (npm run migrate). Los datos que crean son sintéticos (prefijo TST_) y se eliminan al final.
//
// Ejecutar: npm run test:integration
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

process.env.JWT_SECRET ||= "pruebas-integracion-bloque1-secreto-largo-0123456789";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";

const DB_OK =
  ["proysocial_test", "proysocial_dev"].includes(process.env.PGDATABASE) &&
  ["localhost", "127.0.0.1", "::1"].includes(process.env.PGHOST || "localhost") &&
  !process.env.DATABASE_URL &&
  !process.env.INSTANCE_CONNECTION_NAME;
const skip = DB_OK ? false : "Defina PGDATABASE=proysocial_test (servidor local) y DATABASE_URL vacío para ejecutar estas pruebas";

const { pool } = await import("../../src/db.js");
const { createSessionToken } = await import("../../src/middleware/auth.js");
const { hoyBogota, sumarDias, loadMatrixForDocentes, calcularMetricas } = await import("../../src/services/matrizService.js");

const PORT = 4301;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_B1";
const ctx = { tpl: {}, ids: {} };
let server;
let tokens = {};

async function api(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return;
    } catch {
      /* iniciando */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("El servidor de prueba no inició");
}

async function cleanup() {
  const q = (sql, p) => pool.query(sql, p);
  await q(`DELETE FROM entregable_eventos WHERE docente_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id IN (SELECT id FROM grupos_matriz WHERE nombre LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM semestres WHERE codigo = $1`, [ctx.semestre ?? "2099B"]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

before(async () => {
  if (!DB_OK) return;
  const who = await pool.query("select current_database() d");
  assert.ok(["proysocial_test", "proysocial_dev"].includes(who.rows[0].d));

  ctx.hoy = hoyBogota();
  ctx.semestre = "2099B";
  await cleanup();
  // Semestre sintético que comienza hace 21 días: las fechas de cada plantilla son relativas a hoy.
  await pool.query(
    `INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, false)`,
    [ctx.semestre, sumarDias(ctx.hoy, -21), sumarDias(ctx.hoy, -21 + 16 * 7 - 1)]
  );
  const prog = (await pool.query(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`])).rows[0].id;
  const grupo = (await pool.query(
    `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades,
       num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
     VALUES ($1, 'sintético', 'ANTIGUO', 1, 2, 0, 0, 0, true, $2) RETURNING id`,
    [`${M} Grupo`, ctx.semestre]
  )).rows[0].id;
  ctx.grupo = grupo;

  // dias_fin relativos al inicio del semestre (hoy-21): 0 => hoy-21 ... 21 => HOY, 28 => hoy+7 ...
  const defs = [
    ["P1", 1, 0, 4, "Proyecto", "Entrega P1", null, null],
    ["P2", 2, 7, 11, "Proyecto", "Entrega P2", null, null],
    ["P3", 3, 14, 18, "Proyecto", "Entrega P3", null, null],
    ["P4", 4, 20, 20, "Capacitación", "Entrega P4 (vence ayer)", null, null],
    ["P5", 4, 21, 21, "Capacitación", "Entrega P5 (vence hoy)", null, null],
    ["P6", 5, 28, 28, "Capacitación", "Entrega P6 drive", "drive", null],
    ["P7", 6, 35, 35, "Capacitación", "Entrega P7 formulario", "formulario", null],
    ["P8", 7, 42, 42, "Capacitación", "Entrega P8 sin evidencia", "ninguna", null],
  ];
  for (const [clave, semana, ini, fin, cat, texto, tipo] of defs) {
    const r = await pool.query(
      `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable,
         descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb, tipo_evidencia)
       VALUES ($1, $2, $3, $3, 'Octubre', $4, $5, 'Cargar soporte', 1, $6, $7, $8) RETURNING id`,
      [grupo, semana * 10 + 1, cat, semana, `${M} ${texto}`, ini, fin, tipo]
    );
    ctx.tpl[clave] = r.rows[0].id;
  }

  const mkUser = async (nombre, rol, grupoId) =>
    (await pool.query(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, grupo_matriz_id)
       VALUES ($1, 'Prueba', $2, $3, $4, 'activo', $5) RETURNING id, nombre, apellido, correo, rol`,
      [`${M}_${nombre}`, `${M}.${nombre}@test.local`, rol, prog, grupoId]
    )).rows[0];
  ctx.admin = await mkUser("Admin", "admin", null);
  ctx.d1 = await mkUser("D1", "docente", grupo);
  ctx.d2 = await mkUser("D2", "docente", grupo);
  ctx.sinGrupo = await mkUser("SinGrupo", "docente", null);
  tokens = {
    admin: createSessionToken(ctx.admin),
    d1: createSessionToken(ctx.d1),
    d2: createSessionToken(ctx.d2),
  };

  const mkProyecto = async (titulo, docente, tipo = "proyecto") => {
    const p = (await pool.query(
      `INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas)
       VALUES ($1, $2, $3, $4, $5::date, 16) RETURNING id`,
      [`${M} ${titulo}`, prog, docente, tipo, sumarDias(ctx.hoy, -21)]
    )).rows[0].id;
    const semanas = {};
    for (let n = 1; n <= 16; n += 1) {
      semanas[n] = (await pool.query(
        `INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
         VALUES ($1, $2, $3::date, $4::date) RETURNING id`,
        [p, n, sumarDias(ctx.hoy, -21 + (n - 1) * 7), sumarDias(ctx.hoy, -21 + (n - 1) * 7 + 6)]
      )).rows[0].id;
    }
    return { id: p, semanas };
  };
  ctx.projA = await mkProyecto("Proyecto A", ctx.d1.id);
  ctx.projB = await mkProyecto("Proyecto B", ctx.d1.id);
  ctx.projC = await mkProyecto("Proyecto C", ctx.d2.id);
  ctx.projCap = await mkProyecto("Capacitación", ctx.d1.id, "capacitacion");
  await pool.query(`INSERT INTO proyecto_docentes (proyecto_id, docente_id) VALUES ($1, $2)`, [ctx.projCap.id, ctx.d2.id]);

  server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer();
});

after(async () => {
  if (server) server.kill();
  if (DB_OK) await cleanup();
  await pool.end();
});

const matriz = async (docente, token) => (await api(`/docente/${docente.id}/matriz`, token)).data;
const item = (m, clave) => m.items.find((i) => i.id === ctx.tpl[clave]);
const countRows = async (docenteId, plantillaId) =>
  Number((await pool.query(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1 AND plantilla_id = $2`, [docenteId, plantillaId])).rows[0].n);
const completar = (docente, clave, body, token = tokens.d1) =>
  api(`/docente/${docente.id}/matriz/${ctx.tpl[clave]}/completar`, token, { method: "POST", body });
const DRIVE = "https://drive.google.com/file/d/abc123/view";

// ───────────────────────── Calendario y matriz ─────────────────────────

test("la matriz usa el calendario real del semestre y las fechas relativas a hoy (Bogotá)", { skip }, async () => {
  const m = await matriz(ctx.d1, tokens.d1);
  assert.equal(m.items.length, 8);
  assert.equal(m.hoy, ctx.hoy);
  assert.equal(m.semana_actual.estado, "en_curso");
  assert.equal(m.semana_actual.numero, 4); // hoy = inicio + 21 días => semana 4
  assert.equal(m.semana_actual.total_semanas, 16);
  assert.equal(item(m, "P5").fecha_fin_calculada, ctx.hoy); // vence hoy
  assert.equal(item(m, "P4").fecha_fin_calculada, sumarDias(ctx.hoy, -1));
  // Sin entregables enviados: exigibles = P1..P5; vencidos = P1..P4 (el de hoy no está vencido).
  assert.equal(m.resumen.exigibles, 5);
  assert.equal(m.resumen.vencidos, 4);
  assert.equal(item(m, "P5").vencido, false);
  assert.equal(item(m, "P5").exigible, true);
  assert.equal(item(m, "P4").vencido, true);
  assert.equal(m.resumen.reportados, 0);
  assert.equal(m.resumen.semaforo, "rojo");
});

test("un docente sin grupo no recibe una fecha inventada: matriz vacía", { skip }, async () => {
  const token = createSessionToken(ctx.sinGrupo);
  const r = await api(`/docente/${ctx.sinGrupo.id}/matriz`, token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, []);
  assert.equal(r.data.semana_actual.estado, "sin_calendario");
});

// ───────────────────────── Permisos ─────────────────────────

test("permisos: sin token 401, docente en /admin 403, y ningún docente ve o modifica datos de otro", { skip }, async () => {
  assert.equal((await api(`/docente/${ctx.d1.id}/matriz`)).status, 401);
  assert.equal((await api(`/admin/dashboard`, tokens.d1)).status, 403);
  assert.equal((await api(`/docente/${ctx.d1.id}/matriz`, tokens.d2)).status, 403);
  assert.equal((await completar(ctx.d1, "P1", { completado: true, url_evidencia: DRIVE }, tokens.d2)).status, 403);
  assert.equal(await countRows(ctx.d1.id, ctx.tpl.P1), 0);
});

// ───────────────────────── Envío, evidencias y duplicados ─────────────────────────

test("un entregable que requiere evidencia no se envía sin ella y no deja filas a medias", { skip }, async () => {
  const r = await completar(ctx.d1, "P4", { completado: true });
  assert.equal(r.status, 422);
  assert.equal(r.data.codigo, "EVIDENCIA_REQUERIDA");
  assert.equal(await countRows(ctx.d1.id, ctx.tpl.P4), 0);
});

test("excepción justificada: se envía sin enlace, queda marcada y el administrador la ve", { skip }, async () => {
  assert.equal((await completar(ctx.d1, "P4", { completado: true, justificacion_exencion: "corta" })).status, 422);
  const r = await completar(ctx.d1, "P4", { completado: true, justificacion_exencion: "Reunión presencial sin soporte documental" });
  assert.equal(r.status, 200);
  const m = await matriz(ctx.d1, tokens.d1);
  assert.equal(item(m, "P4").evidencia_exenta, true);
  assert.equal(item(m, "P4").estado, "enviado");
  const cola = await api(`/admin/reportes-revision?limit=100`, tokens.admin);
  const rep = cola.data.reportes.find((x) => x.id === r.data.entregable_id);
  assert.ok(rep, "aparece en la cola de revisión");
  assert.equal(rep.evidencia_exenta, true);
  assert.match(rep.justificacion_exencion, /sin soporte/);
});

test("formatos de evidencia por plantilla: drive, formulario y ninguna", { skip }, async () => {
  assert.equal((await completar(ctx.d1, "P6", { completado: true, url_evidencia: "https://ejemplo.com/a.pdf" })).data.codigo, "EVIDENCIA_INVALIDA");
  assert.equal((await completar(ctx.d1, "P6", { completado: true, url_evidencia: DRIVE })).status, 200);
  assert.equal((await completar(ctx.d1, "P7", { completado: true, url_evidencia: DRIVE })).data.codigo, "EVIDENCIA_INVALIDA");
  assert.equal((await completar(ctx.d1, "P7", { completado: true, url_evidencia: "https://forms.gle/xyz" })).status, 200);
  assert.equal((await completar(ctx.d1, "P8", { completado: true })).status, 200); // no requiere evidencia
});

test("envío válido registra primer envío, fecha del servidor, historial y no se duplica al repetir ni en paralelo", { skip }, async () => {
  const r1 = await completar(ctx.d1, "P1", { completado: true, url_evidencia: DRIVE, proyecto_id: ctx.projA.id });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.estado, "enviado");
  const r2 = await completar(ctx.d1, "P1", { completado: true, url_evidencia: DRIVE, proyecto_id: ctx.projA.id });
  assert.equal(r2.data.entregable_id, r1.data.entregable_id);
  assert.equal(r2.data.sin_cambios, true);
  assert.equal(await countRows(ctx.d1.id, ctx.tpl.P1), 1);
  const fila = (await pool.query(`SELECT num_envios, fecha_primer_envio, fecha_cargue_evidencia, fecha_real_entrega FROM proyecto_entregables WHERE id = $1`, [r1.data.entregable_id])).rows[0];
  assert.equal(fila.num_envios, 1);
  assert.ok(fila.fecha_primer_envio && fila.fecha_cargue_evidencia);
  assert.equal(r1.data.fecha_real_entrega, ctx.hoy);
  const ev = await pool.query(`SELECT tipo FROM entregable_eventos WHERE entregable_id = $1 ORDER BY id`, [r1.data.entregable_id]);
  assert.deepEqual(ev.rows.map((e) => e.tipo), ["envio"]);

  // Envíos simultáneos del mismo entregable: una sola fila.
  const par = await Promise.all(Array.from({ length: 6 }, () => completar(ctx.d1, "P2", { completado: true, url_evidencia: DRIVE, proyecto_id: ctx.projA.id })));
  assert.ok(par.every((x) => x.status === 200), JSON.stringify(par.map((x) => x.status)));
  assert.equal(await countRows(ctx.d1.id, ctx.tpl.P2), 1);
  assert.equal(Number((await pool.query(`SELECT num_envios FROM proyecto_entregables WHERE docente_id = $1 AND plantilla_id = $2`, [ctx.d1.id, ctx.tpl.P2])).rows[0].num_envios), 1);
});

test("la fecha de entrega nunca la propone el navegador", { skip }, async () => {
  const p = await api(`/docente/entregables/${(await pool.query(`SELECT id FROM proyecto_entregables WHERE docente_id=$1 AND plantilla_id=$2`, [ctx.d1.id, ctx.tpl.P1])).rows[0].id}/fecha-entrega`, tokens.d1, { method: "PATCH", body: { fecha_real_entrega: "2020-01-01", docente_id: ctx.d1.id } });
  assert.equal(p.status, 403);
});

// ───────────────────────── Asociación explícita de iniciativas ─────────────────────────

test("con dos iniciativas del mismo tipo no se adivina: 409 con candidatos; proyecto_id explícito resuelve", { skip }, async () => {
  const r = await completar(ctx.d1, "P3", { completado: true, url_evidencia: DRIVE });
  assert.equal(r.status, 409);
  assert.equal(r.data.codigo, "INICIATIVA_AMBIGUA");
  assert.equal(r.data.candidatos.length, 2);
  assert.equal(await countRows(ctx.d1.id, ctx.tpl.P3), 0);

  assert.equal((await completar(ctx.d1, "P3", { completado: true, url_evidencia: DRIVE, proyecto_id: ctx.projC.id })).status, 422); // ajena
  const ok = await completar(ctx.d1, "P3", { completado: true, url_evidencia: DRIVE, proyecto_id: ctx.projB.id });
  assert.equal(ok.status, 200);
  const fila = (await pool.query(
    `SELECT s.proyecto_id, e.plantilla_id, e.docente_id, s.numero FROM proyecto_entregables e JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id WHERE e.id = $1`,
    [ok.data.entregable_id]
  )).rows[0];
  assert.equal(fila.proyecto_id, ctx.projB.id);
  assert.equal(fila.plantilla_id, ctx.tpl.P3);
  assert.equal(fila.docente_id, ctx.d1.id);
  assert.equal(fila.numero, 3);
  const m = await matriz(ctx.d1, tokens.d1);
  assert.equal(item(m, "P3").iniciativa_id, ctx.projB.id);
});

test("las excepciones individuales de un docente no alteran la matriz de otro", { skip }, async () => {
  await pool.query(
    `INSERT INTO docente_entregable_excepciones (docente_id, plantilla_id, fecha_fin_override, motivo) VALUES ($1, $2, $3::date, 'prueba')
     ON CONFLICT (docente_id, plantilla_id) DO UPDATE SET fecha_fin_override = EXCLUDED.fecha_fin_override`,
    [ctx.d2.id, ctx.tpl.P6, sumarDias(ctx.hoy, -2)]
  );
  const m2 = await matriz(ctx.d2, tokens.d2);
  const m1 = await matriz(ctx.d1, tokens.d1);
  assert.equal(item(m2, "P6").fecha_fin_calculada, sumarDias(ctx.hoy, -2));
  assert.equal(item(m2, "P6").exigible, true);
  assert.equal(item(m1, "P6").fecha_fin_calculada, sumarDias(ctx.hoy, 7));
  assert.equal(item(m1, "P6").exigible, false);
});

// ───────────────────────── Revisión del administrador ─────────────────────────

test("observar no suma avance aprobado; aprobar sí; el vencido no destruye el estado", { skip }, async () => {
  const idP1 = (await pool.query(`SELECT id FROM proyecto_entregables WHERE docente_id=$1 AND plantilla_id=$2`, [ctx.d1.id, ctx.tpl.P1])).rows[0].id;
  const idP2 = (await pool.query(`SELECT id FROM proyecto_entregables WHERE docente_id=$1 AND plantilla_id=$2`, [ctx.d1.id, ctx.tpl.P2])).rows[0].id;
  ctx.ids.p1 = idP1;
  ctx.ids.p2 = idP2;

  assert.equal((await api(`/admin/reportes-revision/${idP2}`, tokens.d1, { method: "PUT", body: { estado_revision: "aprobado" } })).status, 403);
  assert.equal((await api(`/admin/reportes-revision/${idP2}`, tokens.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: " " } })).status, 400);
  assert.equal((await api(`/admin/reportes-revision/${idP2}`, tokens.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: "Falta la firma" } })).status, 200);
  let m = await matriz(ctx.d1, tokens.d1);
  assert.equal(item(m, "P2").estado, "observado");
  assert.equal(item(m, "P2").vencido, true, "observado y vencido a la vez");
  assert.equal(item(m, "P2").comentario_revision, "Falta la firma");
  const antes = m.resumen.aprobados;

  assert.equal((await api(`/admin/reportes-revision/${idP1}`, tokens.admin, { method: "PUT", body: { estado_revision: "aprobado" } })).status, 200);
  m = await matriz(ctx.d1, tokens.d1);
  assert.equal(m.resumen.aprobados, antes + 1);
  assert.equal(item(m, "P1").estado, "aprobado");
  assert.equal(item(m, "P2").aprobado, false);
});

test("un borrador nunca puede aprobarse", { skip }, async () => {
  const bor = await api(`/docente/entregables/${ctx.ids.p2}/borrador`, tokens.d1, { method: "PATCH", body: { descripcion_reporte: "ajustes", docente_id: ctx.d1.id } });
  assert.equal(bor.data.estado, "observado", "corregir un observado no pierde el estado");
  // Entregable en borrador creado por un envío fallido no existe; se prueba con un borrador real:
  const r = await pool.query(
    `INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, completado, estado_revision)
     SELECT s.id, $1, $2, 'borrador manual', false, 'borrador' FROM proyecto_semanas s WHERE s.proyecto_id = $3 AND s.numero = 6 RETURNING id`,
    [ctx.tpl.P5, ctx.d1.id, ctx.projCap.id]
  );
  const res = await api(`/admin/reportes-revision/${r.rows[0].id}`, tokens.admin, { method: "PUT", body: { estado_revision: "aprobado" } });
  assert.equal(res.status, 409);
  assert.equal(res.data.codigo, "NO_ENVIADO");
  await pool.query(`DELETE FROM proyecto_entregables WHERE id = $1`, [r.rows[0].id]);
});

test("corrección y reenvío de un observado: vuelve a revisión, cuenta el reenvío y es idempotente", { skip }, async () => {
  const a = await api(`/docente/${ctx.d1.id}/entregables/${ctx.ids.p2}/reenviar`, tokens.d1, { method: "POST" });
  assert.equal(a.status, 200);
  const b = await api(`/docente/${ctx.d1.id}/entregables/${ctx.ids.p2}/reenviar`, tokens.d1, { method: "POST" });
  assert.equal(b.status, 200);
  const fila = (await pool.query(`SELECT estado_revision, num_envios, comentario_revision FROM proyecto_entregables WHERE id = $1`, [ctx.ids.p2])).rows[0];
  assert.equal(fila.estado_revision, "enviado");
  assert.equal(fila.num_envios, 2);
  assert.equal(fila.comentario_revision, null);
  const ev = await pool.query(`SELECT tipo FROM entregable_eventos WHERE entregable_id = $1 ORDER BY id`, [ctx.ids.p2]);
  assert.deepEqual(ev.rows.map((e) => e.tipo), ["envio", "observacion", "reenvio"]);
});

test("un aprobado no puede alterarse por ninguna ruta; solo la reapertura administrativa lo devuelve", { skip }, async () => {
  const id = ctx.ids.p1;
  const put = await api(`/docente/entregables/${id}`, tokens.d1, { method: "PUT", body: { completado: false } });
  assert.equal(put.status, 409);
  assert.equal((await api(`/docente/entregables/${id}`, tokens.d1, { method: "PUT", body: { completado: true, url_evidencia: "https://otra.com/x" } })).status, 409);
  assert.equal((await api(`/docente/entregables/${id}/borrador`, tokens.d1, { method: "PATCH", body: { descripcion_reporte: "x" } })).status, 409);
  assert.equal((await completar(ctx.d1, "P1", { completado: false })).status, 409);
  assert.equal((await api(`/admin/reportes-revision/${id}`, tokens.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: "x" } })).status, 409);
  assert.equal((await pool.query(`SELECT estado_revision, url_evidencia FROM proyecto_entregables WHERE id = $1`, [id])).rows[0].estado_revision, "aprobado");

  assert.equal((await api(`/admin/reportes-revision/${id}/reabrir`, tokens.d1, { method: "POST", body: { motivo: "intento del docente" } })).status, 403);
  assert.equal((await api(`/admin/reportes-revision/${id}/reabrir`, tokens.admin, { method: "POST", body: { motivo: "corto" } })).status, 409);
  const ok = await api(`/admin/reportes-revision/${id}/reabrir`, tokens.admin, { method: "POST", body: { motivo: "El soporte cargado corresponde a otra semana", destino: "observado" } });
  assert.equal(ok.status, 200);
  assert.equal((await pool.query(`SELECT estado_revision, aprobado_en FROM proyecto_entregables WHERE id = $1`, [id])).rows[0].aprobado_en, null);
  const ev = await pool.query(`SELECT tipo, actor_id FROM entregable_eventos WHERE entregable_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
  assert.equal(ev.rows[0].tipo, "reapertura");
  assert.equal(ev.rows[0].actor_id, ctx.admin.id);
});

// ───────────────────────── Indicadores contra lo almacenado ─────────────────────────

test("los indicadores de la API coinciden con los datos almacenados y entre pantallas", { skip }, async () => {
  const m = await matriz(ctx.d1, tokens.d1);
  const sql = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE estado_revision = 'aprobado' OR (completado AND estado_revision = 'enviado'))::int AS reportados,
       COUNT(*) FILTER (WHERE estado_revision = 'aprobado')::int AS aprobados,
       COUNT(*) FILTER (WHERE estado_revision = 'observado')::int AS observados
     FROM proyecto_entregables WHERE docente_id = $1 AND plantilla_id IS NOT NULL`,
    [ctx.d1.id]
  );
  assert.equal(m.resumen.reportados, sql.rows[0].reportados);
  assert.equal(m.resumen.aprobados, sql.rows[0].aprobados);
  assert.equal(m.resumen.observados, sql.rows[0].observados);
  assert.equal(m.resumen.completados, m.resumen.reportados);
  assert.equal(m.resumen.brecha_entregables, m.resumen.aprobados - m.resumen.esperado);

  // Mismo docente en las otras pantallas: stats, consolidado, panel docente, dashboard admin.
  const stats = (await api(`/docente/${ctx.d1.id}/matriz-stats`, tokens.d1)).data;
  assert.deepEqual({ r: stats.resumen.reportados, a: stats.resumen.aprobados, v: stats.resumen.vencidos }, { r: m.resumen.reportados, a: m.resumen.aprobados, v: m.resumen.vencidos });
  const adminM = (await api(`/admin/docentes/${ctx.d1.id}/matriz`, tokens.admin)).data;
  assert.equal(adminM.resumen.aprobados, m.resumen.aprobados);
  const cons = (await api(`/admin/avance-consolidado?semestre=${ctx.semestre}`, tokens.admin)).data;
  const fila = cons.docentes.find((d) => d.id === ctx.d1.id);
  assert.equal(fila.aprobados, m.resumen.aprobados);
  assert.equal(fila.avance_aprobado, m.resumen.pct_aprobado);
  assert.equal(fila.entregables_vencidos, m.resumen.vencidos);
  assert.equal(fila.semaforo, m.resumen.semaforo);
  const dash = (await api(`/docente/${ctx.d1.id}/dashboard-stats`, tokens.d1)).data;
  assert.equal(dash.stats.completed, m.resumen.reportados);
  assert.equal(dash.indicadores.aprobados, m.resumen.aprobados);
  const adminDash = (await api(`/admin/dashboard?semestre=${ctx.semestre}`, tokens.admin)).data;
  const d = adminDash.docentes_recientes.find((x) => x.id === ctx.d1.id);
  assert.equal(d.porcentaje_aprobado, m.resumen.pct_aprobado);
  assert.equal(d.vencidos, m.resumen.vencidos);

  // Y con la función pura sobre los mismos datos, con «hoy» inyectado.
  const [entry] = await loadMatrixForDocentes(pool, { docenteId: ctx.d1.id, hoy: ctx.hoy });
  assert.equal(calcularMetricas(entry.items, ctx.hoy).aprobados, m.resumen.aprobados);
});

// ───────────────────────── Cronograma sin pérdida de datos ─────────────────────────

test("editar el cronograma (entregables-semanales) conserva reportes, evidencias y revisiones", { skip }, async () => {
  const semana = ctx.projB.semanas[3];
  const antes = (await pool.query(`SELECT id, url_evidencia, estado_revision FROM proyecto_entregables WHERE proyecto_semana_id = $1`, [semana])).rows;
  assert.equal(antes.length, 1, "hay un reporte en la semana 3 del proyecto B");
  await pool.query(`INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas) VALUES ($1, 'vacío viejo', 1)`, [semana]);

  const r = await api(`/admin/proyectos/${ctx.projB.id}/entregables-semanales`, tokens.admin, {
    method: "POST",
    body: { semanas: [{ semanaId: semana, entregables: [{ texto: "Nuevo planificado", horas: 2 }] }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.conservados_con_avance, 1);
  assert.equal(r.data.retirados, 1); // solo el "vacío viejo"
  assert.equal(r.data.creados, 1);
  const despues = (await pool.query(`SELECT id, url_evidencia, estado_revision, descripcion FROM proyecto_entregables WHERE proyecto_semana_id = $1 ORDER BY id`, [semana])).rows;
  const original = despues.find((x) => x.id === antes[0].id);
  assert.ok(original, "el reporte original sigue existiendo");
  assert.equal(original.url_evidencia, antes[0].url_evidencia);
  assert.equal(original.estado_revision, antes[0].estado_revision);
  assert.ok(despues.some((x) => x.descripcion === "Nuevo planificado"));

  // Una semana de otra iniciativa se rechaza (no se escribe en proyectos ajenos).
  const ajena = await api(`/admin/proyectos/${ctx.projB.id}/entregables-semanales`, tokens.admin, {
    method: "POST", body: { semanas: [{ semanaId: ctx.projC.semanas[1], entregables: ["x"] }] },
  });
  assert.equal(ajena.status, 400);
  assert.equal(Number((await pool.query(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE proyecto_semana_id = $1`, [ctx.projC.semanas[1]])).rows[0].n), 0);
});

test("cambiar semanas/fecha de una iniciativa con reportes se rechaza y no destruye ni reprograma nada (Bloque 1.2)", { skip }, async () => {
  const id = ctx.projA.id; // tiene el reporte de P1 (semana 1) y P2 (semana 2)
  const reportes = async () => Number((await pool.query(`SELECT COUNT(*)::int n FROM proyecto_entregables e JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id WHERE s.proyecto_id = $1 AND e.docente_id IS NOT NULL`, [id])).rows[0].n);
  const calendario = async () => JSON.stringify((await pool.query(`SELECT numero, fecha_inicio::text, fecha_fin::text FROM proyecto_semanas WHERE proyecto_id = $1 ORDER BY numero`, [id])).rows);
  const antes = await reportes();
  const cal = await calendario();
  assert.ok(antes >= 2, `esperaba reportes en el proyecto A (hay ${antes})`);

  // Reducir, reprogramar y ampliar: desde el Bloque 1.2 los tres cambios se rechazan con HISTORICO_PROTEGIDO
  // (antes se reprogramaba «en el lugar»). Los reportes y el calendario permanecen intactos.
  for (const body of [{ semanas: 1, forzar_cronograma: true }, { fechaInicio: sumarDias(ctx.hoy, -14), forzar_cronograma: true }, { semanas: 18 }]) {
    const r = await api(`/admin/proyectos/${id}`, tokens.admin, { method: "PUT", body });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.codigo, "HISTORICO_PROTEGIDO");
    assert.equal(await reportes(), antes);
    assert.equal(await calendario(), cal);
  }
});

test("una iniciativa con reportes revisados no puede eliminarse", { skip }, async () => {
  const r = await api(`/admin/proyectos/${ctx.projA.id}?forzar=true`, tokens.admin, { method: "DELETE" });
  assert.equal(r.status, 409);
  assert.ok(Number((await pool.query(`SELECT COUNT(*)::int n FROM proyectos WHERE id = $1`, [ctx.projA.id])).rows[0].n) === 1);
});

// ───────────────────────── Datos históricos ─────────────────────────

test("datos con forma histórica se interpretan con las reglas nuevas y la migración solo rellena columnas nuevas", { skip }, async () => {
  const { readFile } = await import("node:fs/promises");
  const hist = (await pool.query(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, estado, grupo_matriz_id)
     VALUES ('${M}_Hist', 'Prueba', '${M}.hist@test.local', 'docente', 'activo', $1) RETURNING id, nombre, apellido, correo, rol`,
    [ctx.grupo]
  )).rows[0];
  const proy = (await pool.query(
    `INSERT INTO proyectos (titulo, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ('${M} Historico', $1, 'capacitacion', $2::date, 16) RETURNING id`,
    [hist.id, sumarDias(ctx.hoy, -21)]
  )).rows[0].id;
  const sem = async (n) => (await pool.query(
    `INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $3::date + 6) RETURNING id`,
    [proy, n, sumarDias(ctx.hoy, -21 + (n - 1) * 7)]
  )).rows[0].id;
  const fila = async (semana, plantilla, v) => (await pool.query(
    `INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, completado, estado_revision, url_evidencia, fecha_completado, fecha_cargue_evidencia, revisado_en)
     VALUES ($1, $2, $3, 'hist', $4, $5, $6, $7::date, $8::timestamptz, $9::timestamptz) RETURNING id`,
    [semana, plantilla, hist.id, v.comp, v.est, v.url ?? null, v.fecha ?? null, v.cargue ?? null, v.rev ?? null]
  )).rows[0].id;
  const ids = {
    enviado: await fila(await sem(4), ctx.tpl.P5, { comp: true, est: "enviado", url: DRIVE, fecha: sumarDias(ctx.hoy, -1), cargue: `${sumarDias(ctx.hoy, -1)}T15:00:00-05` }),
    aprobado: await fila(await sem(5), ctx.tpl.P6, { comp: true, est: "aprobado", url: DRIVE, fecha: sumarDias(ctx.hoy, -3), cargue: `${sumarDias(ctx.hoy, -3)}T10:00:00-05`, rev: `${sumarDias(ctx.hoy, -2)}T10:00:00-05` }),
    observado: await fila(await sem(6), ctx.tpl.P7, { comp: true, est: "observado", url: DRIVE, fecha: sumarDias(ctx.hoy, -3), rev: `${sumarDias(ctx.hoy, -2)}T10:00:00-05` }),
    borrador: await fila(await sem(7), ctx.tpl.P8, { comp: false, est: "borrador", url: DRIVE }),
    // Fila creada por el administrador: estado_revision tomó el DEFAULT 'enviado' y nunca se envió nada.
    vacio: await fila(await sem(3), ctx.tpl.P3, { comp: false, est: "enviado" }),
  };
  // Se vuelve a ejecutar la migración (idempotente): rellena solo columnas nuevas vacías.
  const sql = await readFile(new URL("../../migrations/fase22_bloque1_seguimiento.sql", import.meta.url), "utf8");
  await pool.query(sql);
  const filas = Object.fromEntries((await pool.query(`SELECT id, num_envios, fecha_primer_envio IS NOT NULL AS fp, aprobado_en IS NOT NULL AS ap, estado_revision, url_evidencia FROM proyecto_entregables WHERE docente_id = $1`, [hist.id])).rows.map((r) => [r.id, r]));
  assert.equal(filas[ids.enviado].num_envios, 1);
  assert.equal(filas[ids.enviado].fp, true);
  assert.equal(filas[ids.aprobado].ap, true, "aprobado_en se rellena desde revisado_en");
  assert.equal(filas[ids.borrador].num_envios, 0);
  assert.equal(filas[ids.vacio].num_envios, 0);
  assert.equal(filas[ids.aprobado].url_evidencia, DRIVE, "la evidencia histórica no se toca");

  const token = createSessionToken(hist);
  const m = (await api(`/docente/${hist.id}/matriz`, token)).data;
  const porClave = Object.fromEntries(["P3", "P5", "P6", "P7", "P8"].map((k) => [k, item(m, k).estado]));
  assert.deepEqual(porClave, { P3: "no_iniciado", P5: "enviado", P6: "aprobado", P7: "observado", P8: "borrador" });
  // La fila 'vacío' con estado explícito 'enviado' y sin envío real: sin completado ni contenido NO cuenta como envío.
  assert.equal(item(m, "P3").completado, false);
  assert.equal(m.resumen.reportados, 2);
  assert.equal(m.resumen.aprobados, 1);
});
