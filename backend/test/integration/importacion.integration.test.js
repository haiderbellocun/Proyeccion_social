// Importación de matrices desde Excel contra PostgreSQL real (solo proysocial_dev / proysocial_test).
// Los datos son sintéticos (prefijo TST_B2, semestres 2098A/2098B) y se eliminan al terminar.
// Ejecutar: PGDATABASE=proysocial_dev PGHOST=localhost DATABASE_URL= npm run test:integration
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { crearXlsx, hojaCronograma } from "../support/xlsxBuilder.js";

process.env.JWT_SECRET ||= "pruebas-integracion-importacion-secreto-largo-0123456789";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";

const DB_OK =
  ["proysocial_test", "proysocial_dev"].includes(process.env.PGDATABASE) &&
  ["localhost", "127.0.0.1", "::1"].includes(process.env.PGHOST || "localhost") &&
  !process.env.DATABASE_URL &&
  !process.env.INSTANCE_CONNECTION_NAME;
const skip = DB_OK ? false : "Defina PGDATABASE=proysocial_dev (o proysocial_test), PGHOST=localhost y DATABASE_URL vacío";

const { pool } = await import("../../src/db.js");
const { createSessionToken } = await import("../../src/middleware/auth.js");
const { hoyBogota, sumarDias } = await import("../../src/services/matrizService.js");

const PORT = 4311;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_B2";
const SEM = "2098A";
const SEM2 = "2098B";
const ctx = {};
let server;
let T = {};

const api = async (path, token, options = {}) => {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

async function cleanup() {
  const q = (s, p) => pool.query(s, p);
  await q(`DELETE FROM entregable_eventos WHERE docente_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM importaciones_matriz WHERE semestre IN ($1, $2)`, [SEM, SEM2]);
  await q(`DELETE FROM usuarios WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM grupos_matriz WHERE semestre IN ($1, $2)`, [SEM, SEM2]);
  await q(`DELETE FROM semestres WHERE codigo IN ($1, $2)`, [SEM, SEM2]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

const contar = async (sql, p = []) => Number((await pool.query(sql, p)).rows[0].n);
const plantillasDe = (g) => contar(`SELECT COUNT(*)::int n FROM plantilla_entregables WHERE grupo_id = $1`, [g]);
const estado = () => Promise.all([
  contar(`SELECT COUNT(*)::int n FROM grupos_matriz WHERE semestre = $1`, [SEM]),
  contar(`SELECT COUNT(*)::int n FROM plantilla_entregables t JOIN grupos_matriz g ON g.id = t.grupo_id WHERE g.semestre = $1`, [SEM]),
  contar(`SELECT COUNT(*)::int n FROM importaciones_matriz WHERE semestre = $1`, [SEM]),
]);

// Matriz sintética: 6 entregables en un semestre que comenzó hace 21 días (hoy cae en la semana 4)
const fechas = () => {
  const ini = sumarDias(hoyBogota(), -21);
  const d = (n) => sumarDias(ini, n);
  return { ini, d };
};
const semanasBase = () => {
  const { d } = fechas();
  return [
    { mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento y Capacitación", items: [
      { numero: 1, entregable: `${M} Compromiso docente`, horas: 1, inicio: d(1), fin: d(4), descripcion: "Cargar soporte" },
      { numero: 2, entregable: `${M} Lectura de la política`, horas: 2, inicio: d(2), fin: d(4), descripcion: "https://drive.google.com/file/d/EJEMPLO/view" },
    ] },
    { mes: "Febrero", semana: 2, items: [{ numero: 3, entregable: `${M} Socialización`, horas: 3, inicio: d(8), fin: d(8) }] },
    { mes: "Marzo", semana: 3, fase: "Marzo\nGestión con aliados", items: [{ numero: 4, entregable: `${M} Reunión con aliado`, horas: 4, inicio: d(14), fin: d(18) }] },
    { mes: "Marzo", semana: 4, items: [{ numero: 5, entregable: `${M} Entrega de hoy`, horas: 2, inicio: d(21), fin: d(21) }] },
    { mes: "Abril", semana: 5, items: [{ numero: 6, entregable: `${M} Entrega futura`, horas: 5, inicio: d(28), fin: d(32) }] },
  ];
};
const archivo = (semanas = semanasBase(), nombre = "matriz-sintetica.xlsx") => ({
  archivo_base64: crearXlsx([hojaCronograma("G1 sintética", semanas), { nombre: "Oculta", estado: "hidden", filas: {} }]).toString("base64"),
  nombre_archivo: nombre,
});
const GRUPO = (nombre = `${M} Grupo`) => ({ nombre, tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 });
const nuevo = (extra = {}) => ({ semestre: SEM, modo: "nuevo_grupo", grupo: GRUPO(), ...extra });
const body = (semanas, destino, extra = {}) => ({ ...archivo(semanas), hoja_indice: 0, destino, ...extra });

before(async () => {
  if (!DB_OK) return;
  assert.ok(["proysocial_test", "proysocial_dev"].includes((await pool.query("select current_database() d")).rows[0].d));
  await cleanup();
  const { ini } = fechas();
  await pool.query(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, FALSE)`, [SEM, ini, sumarDias(ini, 111)]);
  const prog = (await pool.query(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`])).rows[0].id;
  const mk = async (n, rol) => (await pool.query(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado) VALUES ($1, 'Prueba', $2, $3, $4, 'activo') RETURNING id, nombre, apellido, correo, rol`,
    [`${M}_${n}`, `${M}.${n}@test.local`, rol, prog]
  )).rows[0];
  ctx.admin = await mk("Admin", "admin");
  ctx.docente = await mk("Docente", "docente");
  ctx.otro = await mk("Otro", "docente");
  T = { admin: createSessionToken(ctx.admin), docente: createSessionToken(ctx.docente) };
  // Iniciativa del docente (para poder reportar): una sola, 16 semanas
  const p = (await pool.query(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`, [`${M} Proyecto`, prog, ctx.docente.id, ini])).rows[0].id;
  for (let n = 1; n <= 16; n += 1) await pool.query(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(ini, (n - 1) * 7), sumarDias(ini, (n - 1) * 7 + 6)]);

  server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
});
after(async () => {
  if (server) server.kill();
  if (DB_OK) await cleanup();
  await pool.end();
});

// ───────────── Seguridad y archivos inválidos ─────────────
test("solo administradores pueden importar; sin sesión 401", { skip }, async () => {
  for (const ruta of ["/admin/importaciones/analizar", "/admin/importaciones/validar", "/admin/importaciones/confirmar"]) {
    assert.equal((await api(ruta, null, { method: "POST", body: archivo() })).status, 401, ruta);
    assert.equal((await api(ruta, T.docente, { method: "POST", body: archivo() })).status, 403, ruta);
  }
  assert.equal((await api("/admin/importaciones", T.docente)).status, 403);
  assert.equal((await api("/admin/importaciones", T.admin)).status, 200);
});

test("archivos corruptos o inválidos se rechazan sin escribir nada", { skip }, async () => {
  const antes = await estado();
  const casos = [
    [{ archivo_base64: Buffer.from("no soy un excel").toString("base64"), nombre_archivo: "a.xlsx" }, 422],
    [{ archivo_base64: crearXlsx([{ nombre: "A", filas: { 1: { 1: "x" } } }]).subarray(0, 50).toString("base64"), nombre_archivo: "roto.xlsx" }, 422],
    [{ archivo_base64: "", nombre_archivo: "a.xlsx" }, 400],
    [{ archivo_base64: "@@@###", nombre_archivo: "a.xlsx" }, 400],
    [{ ...archivo(), nombre_archivo: "matriz.xls" }, 400],
  ];
  for (const [b, status] of casos) {
    for (const ruta of ["analizar", "validar", "confirmar"]) {
      const r = await api(`/admin/importaciones/${ruta}`, T.admin, { method: "POST", body: { ...b, hoja_indice: 0, destino: nuevo() } });
      assert.equal(r.status, status, `${ruta}: ${JSON.stringify(r.data)}`);
    }
  }
  assert.deepEqual(await estado(), antes);
});

// ───────────── Pasos 2-3: hojas y estructura ─────────────
test("analiza hojas (incluye ocultas) y detecta estructura y mapeo", { skip }, async () => {
  const r = await api("/admin/importaciones/analizar", T.admin, { method: "POST", body: archivo() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.hojas.map((h) => [h.nombre === "G1 sintética", h.estado, h.tipo]), [[true, "visible", "cronograma"], [false, "hidden", "desconocida"]]);
  const h = await api("/admin/importaciones/hoja", T.admin, { method: "POST", body: { ...archivo(), hoja_indice: 0 } });
  assert.equal(h.data.fila_encabezado, 8);
  assert.equal(h.data.mapeo_sugerido.entregable, "G");
  assert.equal(h.data.total_filas_detectadas, 6);
  assert.equal(h.data.cabecera.datos_personales_detectados, true);
  assert.ok(!JSON.stringify(h.data).includes("Docente Sintético"), "no se expone el nombre del docente");
});

// ───────────── Simulación sin escrituras ─────────────
test("la validación previa no escribe nada y describe qué se creará", { skip }, async () => {
  const antes = await estado();
  const r = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, nuevo()) });
  assert.equal(r.status, 200);
  assert.equal(r.data.escribe_datos, false);
  assert.equal(r.data.puede_confirmar, true);
  assert.deepEqual([r.data.resumen.total, r.data.resumen.crear, r.data.resumen.errores], [6, 6, 0]);
  assert.equal(r.data.resumen.horas_programadas, 17);
  assert.equal(r.data.calendario.num_semanas, 16);
  assert.ok(r.data.filas.every((f) => f.accion === "crear" && f.dias_inicio >= 0));
  assert.deepEqual(await estado(), antes);
});

test("errores de destino: semestre sin calendario, grupo de otro semestre, nombre repetido", { skip }, async () => {
  const inex = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, nuevo({ semestre: "2097A" })) });
  assert.ok(inex.data.errores_globales.some((e) => e.codigo === "SEMESTRE_INEXISTENTE"));
  assert.equal(inex.data.puede_confirmar, false);
  const sinNombre = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, nuevo({ grupo: { ...GRUPO(), nombre: "" } })) });
  assert.ok(sinNombre.data.errores_globales.some((e) => e.codigo === "GRUPO_NOMBRE_REQUERIDO"));
  const conf = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, nuevo({ semestre: "2097A" })) });
  assert.equal(conf.status, 409);
  assert.equal(conf.data.codigo, "VALIDACION_FALLIDA");
});

// ───────────── Importación válida + idempotencia + asignación ─────────────
test("importa una plantilla válida, registra el lote y no duplica al repetir", { skip }, async () => {
  const r = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, nuevo()) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.resumen.creadas, 6);
  assert.equal(r.data.resumen.grupo_nuevo, true);
  ctx.grupo = r.data.grupo_id;
  assert.equal(await plantillasDe(ctx.grupo), 6);

  // Trazabilidad: quién, cuándo, archivo (hash) y filas de origen; sin datos personales
  const lote = (await pool.query(`SELECT * FROM importaciones_matriz WHERE grupo_id = $1`, [ctx.grupo])).rows[0];
  assert.equal(lote.usuario_id, ctx.admin.id);
  assert.equal(lote.archivo_sha256.length, 64);
  assert.equal(lote.resumen.creadas, 6);
  assert.ok(lote.creado_en);
  assert.ok(!JSON.stringify(lote).includes("Docente Sintético"));
  const t = (await pool.query(`SELECT numero, categoria, fase, mes, semana_numero, horas::float h, dias_inicio_desde_feb di, dias_fin_desde_feb df, enlace_referencia, importacion_id, origen_fila FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [ctx.grupo])).rows;
  assert.equal(t[0].fase, "Febrero Alistamiento y Capacitación");
  assert.deepEqual([t[0].mes, t[0].semana_numero, t[0].h, t[0].di, t[0].df], ["febrero", 1, 1, 1, 4]);
  assert.equal(t[1].enlace_referencia, "https://drive.google.com/file/d/EJEMPLO/view");
  assert.ok(t.every((x) => x.importacion_id === lote.id && x.origen_fila >= 9));
  // El grupo creado tiene los datos indicados por el administrador
  const g = (await pool.query(`SELECT nombre, tipo_docente, horas_totales, semestre FROM grupos_matriz WHERE id = $1`, [ctx.grupo])).rows[0];
  assert.deepEqual([g.tipo_docente, g.horas_totales, g.semestre], ["ANTIGUO", 24, SEM]);

  // Repetir exactamente el mismo archivo: nombre repetido (grupo nuevo) -> rechazado
  const dupNombre = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, nuevo()) });
  assert.equal(dupNombre.status, 409);
  assert.equal(dupNombre.data.codigo, "VALIDACION_FALLIDA");
  // Repetir contra el grupo existente: sin cambios y sin nuevo lote
  const igual = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, { semestre: SEM, modo: "grupo_existente", grupo_id: ctx.grupo }) });
  assert.equal(igual.status, 200);
  assert.equal(igual.data.sin_cambios, true);
  assert.equal(await plantillasDe(ctx.grupo), 6);
  assert.equal(await contar(`SELECT COUNT(*)::int n FROM importaciones_matriz WHERE grupo_id = $1`, [ctx.grupo]), 1);
  // Dos confirmaciones simultáneas del mismo archivo: una sola fila por entregable
  const grupo2 = { semestre: SEM, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo paralelo`) };
  const par = await Promise.all([1, 2, 3].map(() => api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, grupo2) })));
  assert.equal(par.filter((x) => x.status === 200).length, 1, JSON.stringify(par.map((x) => x.status)));
  const gp = (await pool.query(`SELECT id FROM grupos_matriz WHERE nombre = $1 AND semestre = $2`, [`${M} Grupo paralelo`, SEM])).rows;
  assert.equal(gp.length, 1);
  assert.equal(await plantillasDe(gp[0].id), 6);
});

test("asignar la matriz a un docente genera su cronograma e indicadores, sin duplicar tareas", { skip }, async () => {
  const dest = { semestre: SEM, modo: "grupo_existente", grupo_id: ctx.grupo, asignar_docente_id: ctx.docente.id };
  const r = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, dest) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.resumen.docente_asignado_id, ctx.docente.id);
  // Sin copiar tareas por docente: no hay entregables físicos hasta que el docente reporta
  assert.equal(await contar(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [ctx.docente.id]), 0);

  const m = await api(`/docente/${ctx.docente.id}/matriz`, T.docente);
  assert.equal(m.status, 200);
  assert.equal(m.data.items.length, 6);
  const { d } = fechas();
  const it = (n) => m.data.items.find((x) => x.numero === n);
  assert.equal(it(1).fecha_fin_calculada, d(4));
  assert.equal(it(5).fecha_fin_calculada, hoyBogota(), "vence hoy");
  assert.equal(m.data.semana_actual.numero, 4);
  assert.equal(m.data.resumen.exigibles, 5);
  assert.equal(m.data.resumen.vencidos, 4, "el que vence hoy no está vencido");
  assert.equal(m.data.resumen.horas_programadas, 17);
  assert.equal(m.data.resumen.reportados + m.data.resumen.aprobados, 0);
});

// ───────────── Datos existentes protegidos ─────────────
test("reimportar con cambios actualiza lo editable, conserva reportes y protege plantillas con avance", { skip }, async () => {
  // El docente reporta el entregable 1 y el administrador lo aprueba
  const plantilla1 = (await pool.query(`SELECT id FROM plantilla_entregables WHERE grupo_id = $1 AND numero = 1`, [ctx.grupo])).rows[0].id;
  const env = await api(`/docente/${ctx.docente.id}/matriz/${plantilla1}/completar`, T.docente, { method: "POST", body: { completado: true, urls_evidencia: ["https://drive.google.com/file/d/ZZZ/view"] } });
  assert.equal(env.status, 200, JSON.stringify(env.data));
  assert.equal((await api(`/admin/reportes-revision/${env.data.entregable_id}`, T.admin, { method: "PUT", body: { estado_revision: "aprobado" } })).status, 200);

  const cambiado = semanasBase();
  cambiado[0].items[0].entregable = `${M} Compromiso docente (EDITADO)`; // con reporte aprobado: debe protegerse
  cambiado[0].items[0].horas = 9;
  cambiado[1].items[0].horas = 7; // sin reporte: se actualiza
  cambiado[4].items.push({ numero: 7, entregable: `${M} Entrega nueva`, horas: 1, inicio: fechas().d(30), fin: fechas().d(31) });
  const dest = { semestre: SEM, modo: "grupo_existente", grupo_id: ctx.grupo };
  const prev = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(cambiado, dest) });
  assert.deepEqual([prev.data.resumen.actualizar, prev.data.resumen.crear, prev.data.resumen.omitir, prev.data.resumen.sin_cambios], [1, 1, 1, 4]);
  assert.ok(prev.data.filas.find((f) => f.numero === 1).mensajes.some((x) => x.codigo === "TIENE_REPORTES"));

  const r = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(cambiado, dest) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.resumen.creadas, r.data.resumen.actualizadas, r.data.resumen.omitidas], [1, 1, 1]);
  const t = (await pool.query(`SELECT numero, entregable, horas::float h FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [ctx.grupo])).rows;
  assert.equal(t.length, 7);
  assert.equal(t[0].entregable, `${M} Compromiso docente`, "plantilla con reporte aprobado: intacta");
  assert.equal(t[0].h, 1);
  assert.equal(t[2].h, 7);
  // Reporte y aprobación conservados; indicadores recalculados desde los registros
  const fila = (await pool.query(`SELECT estado_revision, url_evidencia FROM proyecto_entregables WHERE id = $1`, [env.data.entregable_id])).rows[0];
  assert.deepEqual([fila.estado_revision, fila.url_evidencia], ["aprobado", "https://drive.google.com/file/d/ZZZ/view"]);
  const m = (await api(`/docente/${ctx.docente.id}/matriz`, T.docente)).data;
  assert.deepEqual([m.items.length, m.resumen.aprobados, m.resumen.reportados], [7, 1, 1]);
  assert.equal(m.resumen.vencidos, 3);
  assert.equal(m.resumen.horas_programadas, 22);
  const adm = (await api(`/admin/docentes/${ctx.docente.id}/matriz-stats`, T.admin)).data;
  assert.equal(adm.resumen.aprobados, 1);
});

// ───────────── Decisiones y filas con errores ─────────────
test("duplicados, semana distinta y filas defectuosas exigen decisión o confirmación explícita", { skip }, async () => {
  const { d } = fechas();
  const malas = semanasBase();
  malas.push({ mes: "Abril", semana: 6, items: [
    { numero: 3, entregable: `${M} Número repetido`, inicio: d(35), fin: d(36) },
    { numero: 20, entregable: `${M} Fecha fuera de semestre`, inicio: "2099-12-01", fin: "2099-12-02" },
    { numero: 21, entregable: `${M} Semana 12 con fecha de semana 6`, inicio: d(35), fin: d(37) },
  ] });
  malas[malas.length - 1].items[2] = { ...malas[malas.length - 1].items[2], extra: {} };
  malas[malas.length - 1].semana = 12; // etiqueta 12; fechas de la semana 6
  const dest = { semestre: SEM, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo con errores`) };
  const antes = await estado();
  const prev = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(malas, dest) });
  assert.deepEqual(prev.data.decisiones_requeridas.map((x) => x.id).sort(), ["duplicados", "semana"]);
  assert.equal(prev.data.puede_confirmar, false);
  assert.ok(prev.data.filas.find((f) => f.numero === 20).mensajes.some((x) => x.codigo === "FECHA_FUERA_SEMESTRE"));
  // Confirmar sin decisiones: 409 y nada escrito
  const sinDec = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(malas, dest) });
  assert.equal(sinDec.data.codigo, "DECISIONES_PENDIENTES");
  assert.deepEqual(await estado(), antes);
  // Con decisiones pero con una fila errónea: exige omitir_errores explícito
  const decisiones = { duplicados: "renumerar", semana: "fecha" };
  const conErr = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(malas, dest, { decisiones }) });
  assert.equal(conErr.data.codigo, "FILAS_CON_ERRORES");
  assert.deepEqual(await estado(), antes);
  const ok = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(malas, dest, { decisiones, opciones: { omitir_errores: true } }) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.resumen.rechazadas, 1);
  const filas = (await pool.query(`SELECT numero, semana_numero FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [ok.data.grupo_id])).rows;
  assert.equal(filas.length, 8, "6 válidas + 2 de las tres nuevas; la de fecha inválida no contamina la base");
  assert.ok(!filas.some((f) => f.numero === 20));
  assert.equal(filas.find((f) => f.numero === 21).semana_numero, 6, "decisión: semana por fecha");
  assert.equal(new Set(filas.map((f) => f.numero)).size, 8, "sin números repetidos");
});

test("asignar a un docente que ya tiene otro grupo exige decisión; docentes inexistentes se rechazan", { skip }, async () => {
  await pool.query(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2`, [ctx.grupo, ctx.otro.id]);
  const g2 = (await pool.query(`SELECT id FROM grupos_matriz WHERE nombre = $1 AND semestre = $2`, [`${M} Grupo con errores`, SEM])).rows[0].id;
  const dest = { semestre: SEM, modo: "grupo_existente", grupo_id: g2, asignar_docente_id: ctx.otro.id };
  const prev = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, dest) });
  assert.ok(prev.data.decisiones_requeridas.some((x) => x.id === "docente"));
  const inex = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, { ...dest, asignar_docente_id: 999999 }) });
  assert.ok(inex.data.errores_globales.some((e) => e.codigo === "DOCENTE_INEXISTENTE"));
  const mantener = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(undefined, dest, { decisiones: { docente: "mantener" } }) });
  assert.equal(mantener.data.decisiones_requeridas.some((x) => x.id === "docente"), false);
  assert.equal((await pool.query(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [ctx.otro.id])).rows[0].grupo_matriz_id, ctx.grupo, "la validación no reasigna");
});

test("un grupo de otro semestre es incompatible (los semestres antiguos no se modifican)", { skip }, async () => {
  const otro = (await pool.query(`SELECT id FROM grupos_matriz WHERE semestre <> $1 LIMIT 1`, [SEM])).rows[0];
  if (!otro) return;
  const antes = await plantillasDe(otro.id);
  const r = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(undefined, { semestre: SEM, modo: "grupo_existente", grupo_id: otro.id }) });
  assert.equal(r.data.codigo, "VALIDACION_FALLIDA");
  assert.ok(r.data.errores_globales.some((e) => e.codigo === "GRUPO_INCOMPATIBLE"));
  assert.equal(await plantillasDe(otro.id), antes);
});

// ───────────── Reutilización entre semestres ─────────────
test("clonar el semestre ajusta fechas y meses al nuevo calendario sin tocar el antiguo", { skip }, async () => {
  await pool.query(`UPDATE plantilla_entregables SET tipo_evidencia = 'drive', enlace_referencia = 'https://drive.google.com/x' WHERE grupo_id = $1 AND numero = 2`, [ctx.grupo]);
  const antes = (await pool.query(`SELECT numero, mes, fase, dias_inicio_desde_feb di, dias_fin_desde_feb df, tipo_evidencia FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [ctx.grupo])).rows;
  const inicio2 = sumarDias(hoyBogota(), 90);
  const r = await api("/admin/semestres/clonar", T.admin, {
    method: "POST",
    body: { semestre_origen: SEM, semestre_destino: SEM2, fecha_inicio: inicio2, fecha_fin: sumarDias(inicio2, 111), numero_semanas: 16, clonar_plantillas: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.plantillas_clonadas >= 6);
  // Semestre antiguo intacto
  const despues = (await pool.query(`SELECT numero, mes, fase, dias_inicio_desde_feb di, dias_fin_desde_feb df, tipo_evidencia FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [ctx.grupo])).rows;
  assert.deepEqual(despues, antes);
  assert.equal((await pool.query(`SELECT to_char(fecha_inicio,'YYYY-MM-DD') f FROM semestres WHERE codigo = $1`, [SEM])).rows[0].f, fechas().ini);
  // Copia con offsets relativos y meses recalculados con el nuevo calendario
  const g2 = (await pool.query(`SELECT id FROM grupos_matriz WHERE semestre = $1 AND nombre = $2`, [SEM2, `${M} Grupo`])).rows[0].id;
  const c = (await pool.query(`SELECT numero, mes, fase, dias_inicio_desde_feb di, dias_fin_desde_feb df, tipo_evidencia, enlace_referencia FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [g2])).rows;
  assert.equal(c.length, antes.length);
  assert.deepEqual(c.map((x) => [x.di, x.df]), antes.map((x) => [x.di, x.df]));
  assert.equal(c[1].tipo_evidencia, "drive", "se conserva la configuración de evidencia");
  assert.equal(c[1].enlace_referencia, "https://drive.google.com/x");
  const mesEsperado = (n) => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][new Date(`${sumarDias(inicio2, n)}T12:00:00Z`).getUTCMonth()];
  assert.equal(c[0].mes, mesEsperado(4));
  assert.ok(c[0].fase.toLowerCase().startsWith(mesEsperado(4)), `la fase adopta el mes nuevo: ${c[0].fase}`);
  assert.ok(antes[0].fase.startsWith("Febrero"), "la fase del semestre antiguo no cambió");
});

test("historial de importaciones: quién y cuándo", { skip }, async () => {
  const r = await api("/admin/importaciones", T.admin);
  const lote = r.data.importaciones.find((x) => x.grupo_id === ctx.grupo && x.resumen.grupo_nuevo === true);
  assert.ok(lote);
  assert.ok(lote.usuario.includes(M), "registra el usuario administrador");
  assert.ok(lote.lote && lote.creado_en && lote.resumen.creadas === 6);
});

// ───────────── Cierre de Bloque 2: trazabilidad, resumen del grupo y decisión de semana ─────────────
test("encabezados del Excel, trazabilidad semana/número original y resumen del grupo importado", { skip }, async () => {
  const h = await api("/admin/importaciones/hoja", T.admin, { method: "POST", body: { ...archivo(), hoja_indice: 0 } });
  assert.ok(h.data.encabezados && typeof h.data.encabezados === "object", "devuelve el texto de cada columna para el mapeo");
  assert.ok(Object.values(h.data.encabezados).some((t) => /entregable/i.test(String(t))));

  // Semana de la etiqueta distinta a la de la fecha: la decisión «etiqueta» conserva la semana del Excel y las fechas originales
  const { d } = fechas();
  const semanas = semanasBase();
  semanas.push({ mes: "Mayo", semana: 12, items: [{ numero: 7, entregable: `${M} Etiqueta distinta`, horas: 2, inicio: d(35), fin: d(37) }] });
  const dest = { semestre: SEM, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo etiqueta`) };
  const antes = await estado();
  const prev = await api("/admin/importaciones/validar", T.admin, { method: "POST", body: body(semanas, dest) });
  const dec = prev.data.decisiones_requeridas.find((x) => x.id === "semana");
  assert.ok(dec && dec.opciones.some((o) => o.valor === "fecha") && dec.opciones.some((o) => o.valor === "etiqueta"));
  assert.equal(prev.data.puede_confirmar, false, "sin decisión no se puede confirmar");
  assert.deepEqual(await estado(), antes, "validar no escribe nada");
  const ok = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(semanas, dest, { decisiones: { semana: "etiqueta" } }) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const t = (await pool.query(
    `SELECT numero, numero_original, semana_numero, semana_original, dias_inicio_desde_feb di, dias_fin_desde_feb df FROM plantilla_entregables WHERE grupo_id = $1 AND numero = 7`,
    [ok.data.grupo_id])).rows[0];
  assert.equal(t.semana_numero, 12, "decisión: se conserva la semana del Excel");
  assert.equal(t.semana_original, null, "sin ajuste no hay semana original que registrar");
  assert.equal(t.numero_original, null);
  assert.deepEqual([t.di, t.df], [35, 37], "las fechas originales no se alteran");

  // Decisión «fecha»: la semana cambia a la de la fecha y la etiqueta original del Excel queda registrada
  const ajust = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(semanas, { semestre: SEM, modo: "nuevo_grupo", grupo: GRUPO(`${M} Grupo por fecha`) }, { decisiones: { semana: "fecha" } }) });
  assert.equal(ajust.status, 200, JSON.stringify(ajust.data));
  const a = (await pool.query(`SELECT semana_numero, semana_original, dias_inicio_desde_feb di FROM plantilla_entregables WHERE grupo_id = $1 AND numero = 7`, [ajust.data.grupo_id])).rows[0];
  assert.equal(a.semana_numero, 6);
  assert.equal(a.semana_original, 12, "queda la semana original del Excel");
  assert.equal(a.di, 35, "la fecha original no se corrige");

  // Resumen del grupo para el panel «Ver matriz del grupo»
  const r = await api(`/admin/grupos-matriz/${ok.data.grupo_id}/resumen`, T.admin);
  assert.equal(r.status, 200);
  assert.equal(r.data.totales.total, 7);
  assert.ok(r.data.totales.importadas >= 7);
  assert.ok(r.data.importaciones.length >= 1 && r.data.importaciones[0].usuario);
  assert.ok(Array.isArray(r.data.docentes));
  assert.equal((await api(`/admin/grupos-matriz/${ok.data.grupo_id}/resumen`, T.docente)).status, 403, "solo administradores");
  // Idempotencia: repetir no duplica
  const otra = await api("/admin/importaciones/confirmar", T.admin, { method: "POST", body: body(semanas, { semestre: SEM, modo: "grupo_existente", grupo_id: ok.data.grupo_id }, { decisiones: { semana: "etiqueta" } }) });
  assert.equal(otra.status, 200);
  assert.equal(await plantillasDe(ok.data.grupo_id), 7);
});
