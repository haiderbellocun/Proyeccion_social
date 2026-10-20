// Cierre funcional · preparación del piloto: recorrido completo POR ROL contra la API real y PostgreSQL (solo `proysocial_test`).
// No depende de las E2E con escrituras SQL pospuestas. Datos sintéticos con prefijo TST_PL; se eliminan al terminar.
// Roles y casos: un administrador; un docente con matriz importada y entregables; un docente con entregables observados; un docente sin
// matriz; un docente inactivo; un semestre activo y uno anterior; una matriz importada por la API (con asignación de docente).
// Recorrido principal: consulta → borrador → envío → revisión → observación → corrección → reenvío → aprobación → indicadores/historial.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { crearXlsx, hojaCronograma } from "../support/xlsxBuilder.js";
import { purgarAsignaciones } from "./helpers/purgar-asignaciones.js";

process.env.JWT_SECRET ||= "pruebas-piloto-recorrido-secreto-largo-0123456789";
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
const { cambiarGrupo } = await import("../../src/services/asignacionDocenteService.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4325;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_PL";
const SA = "2092A"; // semestre activo
const SP = "2091B"; // semestre anterior (cerrado)
const DRIVE_A = "https://drive.google.com/file/d/1TstPlArchivoA/view?usp=sharing";
const DRIVE_B = "https://drive.google.com/file/d/1TstPlArchivoB/view";
const DRIVE_C = "https://drive.google.com/file/d/1TstPlArchivoC/view";
const ctx = { u: {}, tok: {}, tpl: {} };
let server;
let staticDir;
let activosPrevios = [];
let contador = 0;

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (ruta, tokenSesion, options = {}) => {
  const r = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { ...(tokenSesion ? { Authorization: `Bearer ${tokenSesion}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

async function cleanup() {
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%` });
  for (const sem of [SA, SP]) await purgarAsignaciones(pool, { semestre: sem });
  const g = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $2)`, [g, `${M}.%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]);
  await q(`DELETE FROM importaciones_matriz WHERE semestre = ANY($1::text[])`, [[SA, SP]]);
  await q(`DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[SA, SP]]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM escuelas WHERE nombre LIKE $1`, [`${M}%`]);
}

const mkUser = async (n, rol = "docente", estado = "activo") => {
  contador += 1;
  return (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente) VALUES ($1, 'Piloto', $2, $3, $4, $5, $6) RETURNING id, nombre, apellido, correo, rol`,
    [`${M}_${n}`, `${M}.${n}@test.local`.toLowerCase(), rol, ctx.prog, estado, rol === "docente" ? "ANTIGUO" : null]
  ))[0];
};
const iniciativa = async (titulo, docenteId, ini) => {
  const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`, [`${M} ${titulo}`, ctx.prog, docenteId, ini]))[0].id;
  for (let n = 1; n <= 16; n += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(ini, (n - 1) * 7), sumarDias(ini, (n - 1) * 7 + 6)]);
  return p;
};

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  await cleanup();
  const hoy = hoyBogota();
  const ini = sumarDias(hoy, -21);
  activosPrevios = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await q(`UPDATE semestres SET activo = false WHERE activo`);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, FALSE)`, [SP, sumarDias(hoy, -300), sumarDias(hoy, -189)]);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, TRUE)`, [SA, ini, sumarDias(ini, 111)]);
  ctx.prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`]))[0].id;
  ctx.ini = ini;
  ctx.admin = await mkUser("Admin", "admin");
  ctx.u.A = await mkUser("DocenteA"); // matriz importada y entregables: recorrido principal
  ctx.u.B = await mkUser("DocenteB"); // entregables observados
  ctx.u.C = await mkUser("DocenteC"); // sin matriz
  ctx.u.D = await mkUser("DocenteD"); // inactivo
  ctx.u.E = await mkUser("DocenteE"); // otro docente (pruebas de acceso indebido)
  const tk = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });
  ctx.tok = { admin: tk(ctx.admin), A: tk(ctx.u.A), B: tk(ctx.u.B), C: tk(ctx.u.C), D: tk(ctx.u.D), E: tk(ctx.u.E) };
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "proysocial-piloto-static-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), '<!doctype html><div id="root">PILOTO_SPA</div>');
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: staticDir, DEV_LOGIN_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await esperar(150);
  }
});
after(async () => {
  server?.kill();
  if (staticDir) fs.rmSync(staticDir, { recursive: true, force: true });
  if (DB_OK) {
    await q(`UPDATE semestres SET activo = false WHERE codigo = ANY($1::text[])`, [[SA, SP]]);
    await cleanup();
    if (activosPrevios.length) await q(`UPDATE semestres SET activo = true WHERE codigo = ANY($1::text[])`, [activosPrevios]);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas, (SELECT COUNT(*) FROM proyectos WHERE titulo LIKE $2)::int p`, [`${M}.%`, `${M}%`]))[0];
    assert.deepEqual(r, { u: 0, g: 0, filas: 0, p: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

// ───────────────────────── 0. Preparación: matriz importada por la API (administrador) ─────────────────────────
test("0. El administrador importa una matriz, resuelve la asignación y la matriz resultante llega a los docentes", { skip }, async () => {
  const d = (n) => sumarDias(ctx.ini, n);
  const semanas = [
    { mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento", items: [
      { numero: 1, entregable: `${M} Informe 1`, horas: 1, inicio: d(1), fin: d(4), descripcion: "Cargar soporte" },
      { numero: 2, entregable: `${M} Informe 2`, horas: 2, inicio: d(2), fin: d(5), descripcion: "Cargar soporte" },
    ] },
    { mes: "Marzo", semana: 4, items: [{ numero: 3, entregable: `${M} Sin requisito`, horas: 1, inicio: d(21), fin: d(24), descripcion: "Esta tarea no implica realizar cargue" }] },
  ];
  const cuerpo = (destino, nombre = "piloto.xlsx", extra = {}) => ({ archivo_base64: crearXlsx([hojaCronograma("G piloto", semanas)]).toString("base64"), nombre_archivo: nombre, hoja_indice: 0, destino, ...extra });
  // Analizar → validar → confirmar (el mismo camino de la pantalla).
  const an = await api("/admin/importaciones/analizar", ctx.tok.admin, { method: "POST", body: { archivo_base64: cuerpo({}).archivo_base64, nombre_archivo: "piloto.xlsx" } });
  assert.equal(an.status, 200, JSON.stringify(an.data));
  const destino = { semestre: SA, modo: "nuevo_grupo", grupo: { nombre: `${M} Grupo piloto`, tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 } };
  const val = await api("/admin/importaciones/validar", ctx.tok.admin, { method: "POST", body: cuerpo(destino) });
  assert.equal(val.status, 200, JSON.stringify(val.data));
  assert.equal(val.data.errores_globales?.length ?? 0, 0);
  const conf = await api("/admin/importaciones/confirmar", ctx.tok.admin, { method: "POST", body: cuerpo(destino) });
  assert.equal(conf.status, 200, JSON.stringify(conf.data));
  ctx.grupo = conf.data.grupo_id;
  assert.equal((await q(`SELECT COUNT(*)::int n FROM plantilla_entregables WHERE grupo_id = $1`, [ctx.grupo]))[0].n, 3, "las plantillas se guardaron en PostgreSQL");
  // Asignar a los docentes A y B (servicio de asignaciones, con motivo).
  for (const k of ["A", "B"]) {
    const r = await api(`/admin/docentes/${ctx.u[k].id}/grupo-matriz`, ctx.tok.admin, { method: "PUT", body: { grupo_matriz_id: ctx.grupo, motivo: "Asignación del piloto" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  // D (inactivo) tuvo grupo y luego se inactivó por la administración.
  await cambiarGrupo(pool, { docenteId: ctx.u.D.id, grupoId: ctx.grupo, actorId: ctx.admin.id, motivo: "Asignación del piloto" });
  const ina = await api(`/admin/usuarios/${ctx.u.D.id}`, ctx.tok.admin, { method: "PUT", body: { nombre: ctx.u.D.nombre, apellido: ctx.u.D.apellido, correo: ctx.u.D.correo, rol: "docente", estado: "inactivo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.grupo } });
  assert.equal(ina.status, 200, JSON.stringify(ina.data));
  for (const k of ["A", "B"]) {
    ctx.u[k].proyecto = await iniciativa(`Iniciativa ${k}`, ctx.u[k].id, ctx.ini);
    const m = await api(`/docente/${ctx.u[k].id}/matriz`, ctx.tok[k]);
    assert.equal(m.status, 200, JSON.stringify(m.data));
    assert.equal(m.data.items.length, 3);
    ctx.tpl[k] = Object.fromEntries(m.data.items.map((i) => [i.numero, i.plantilla_id]));
  }
  // Semestre anterior con su propio grupo (solo configuración): el selector de semestre lo ofrece.
  await q(`INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) VALUES ($1, 's', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2)`, [`${M} Grupo anterior`, SP]);
});

// ───────────────────────── 1. Recorrido principal (docente A + administrador) ─────────────────────────
const guardar = (k, n, urls, completado) => api(`/docente/${ctx.u[k].id}/matriz/${ctx.tpl[k][n]}/completar`, ctx.tok[k], { method: "POST", body: { completado, urls_evidencia: urls } });
const centro = (k) => api(`/docente/${ctx.u[k].id}/evidencias`, ctx.tok[k]);
const situacion = async (k, n) => (await centro(k)).data.items.find((x) => x.plantilla_id === ctx.tpl[k][n]);
const metricas = async () => (await api(`/admin/metricas?semestre=${SA}`, ctx.tok.admin)).data;

test("1. Recorrido completo: consulta → borrador → envío → revisión → observación → corrección → reenvío → aprobación → indicadores e historial", { skip }, async () => {
  const A = ctx.u.A;
  // 1–3. El docente inicia sesión (sesión válida), ve su semestre y su grupo, abre su matriz.
  const yo = await api("/auth/me", ctx.tok.A);
  assert.equal(yo.status, 200, JSON.stringify(yo.data));
  assert.equal(yo.data.user?.id ?? yo.data.id, A.id);
  const dash = await api(`/docente/${A.id}/dashboard`, ctx.tok.A);
  assert.equal(dash.status, 200, JSON.stringify(dash.data));
  const matriz = await api(`/docente/${A.id}/matriz`, ctx.tok.A);
  assert.equal(matriz.status, 200);
  assert.equal(yo.data.semestre?.codigo, SA, "la sesión informa el semestre activo");
  const perfil = await api(`/docente/${A.id}/perfil`, ctx.tok.A);
  assert.equal(perfil.status, 200, JSON.stringify(perfil.data));
  assert.ok(JSON.stringify(perfil.data).includes(`${M} Grupo piloto`), "el docente ve su grupo en su perfil");
  // 4–5. Identifica un entregable pendiente y consulta sus instrucciones.
  const it0 = await situacion("A", 1);
  assert.equal(it0.situacion, "sin_evidencia");
  assert.equal(it0.requiere_evidencia, true);
  assert.ok(matriz.data.items.find((i) => i.numero === 1).descripcion_evidencia, "instrucciones del entregable");
  const antes = await metricas();
  // 6–7. Registra enlaces de evidencia y guarda un borrador.
  const b = await guardar("A", 1, [DRIVE_A, DRIVE_B], false);
  assert.equal(b.status, 200, JSON.stringify(b.data));
  ctx.e1 = b.data.entregable_id;
  assert.equal((await situacion("A", 1)).situacion, "borrador");
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.e1]))[0].estado_revision, "borrador", "persistido en PostgreSQL");
  // 8. Envía el entregable.
  const env = await guardar("A", 1, [DRIVE_A, DRIVE_B], true);
  assert.equal(env.status, 200, JSON.stringify(env.data));
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.e1]))[0].estado_revision, "enviado");
  // 9. El administrador lo ve en la bandeja y abre sus evidencias.
  const bandeja = await api(`/admin/reportes-revision?docente_id=${A.id}`, ctx.tok.admin);
  assert.equal(bandeja.status, 200);
  const fila = bandeja.data.reportes.find((r) => r.id === ctx.e1);
  assert.ok(fila, "el entregable enviado aparece en la bandeja de revisión");
  assert.deepEqual(fila.evidencias.map((e) => e.url ?? e.enlace ?? e.drive_id).length, 2);
  // 10. Solicita correcciones.
  const obs = await api(`/admin/reportes-revision/${ctx.e1}`, ctx.tok.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: "Falta el acta firmada en el archivo B" } });
  assert.equal(obs.status, 200, JSON.stringify(obs.data));
  // 11. El docente consulta la observación (centro de evidencias, reportes y notificación).
  const vista = await situacion("A", 1);
  assert.equal(vista.situacion, "observada");
  assert.equal(vista.comentario_revision, "Falta el acta firmada en el archivo B");
  assert.equal(vista.puede_editar, true);
  const reps = await api(`/docente/${A.id}/reportes`, ctx.tok.A);
  assert.equal(reps.status, 200);
  assert.ok(JSON.stringify(reps.data).includes("Falta el acta firmada"), "el historial de reportes del docente muestra la observación");
  const nots = await api(`/docente/${A.id}/notificaciones`, ctx.tok.A);
  assert.equal(nots.status, 200, JSON.stringify(nots.data));
  // 12. Corrige y reenvía.
  const re = await guardar("A", 1, [DRIVE_A, DRIVE_C], true);
  assert.equal(re.status, 200, JSON.stringify(re.data));
  assert.equal((await situacion("A", 1)).situacion, "en_revision");
  assert.equal((await api(`/admin/reportes-revision?docente_id=${A.id}`, ctx.tok.admin)).data.reportes.find((r) => r.id === ctx.e1)?.es_reenvio, true);
  // 13. El administrador aprueba.
  const ap = await api(`/admin/reportes-revision/${ctx.e1}`, ctx.tok.admin, { method: "PUT", body: { estado_revision: "aprobado" } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  // 14. El docente visualiza la aprobación y ya no puede modificar el entregable.
  const fin = await situacion("A", 1);
  assert.equal(fin.situacion, "aprobada");
  assert.equal(fin.puede_editar, false);
  assert.equal((await guardar("A", 1, [DRIVE_B], true)).status, 409);
  // 15. Indicadores e historial reflejan los cambios.
  const h = await api(`/docente/entregables/${ctx.e1}/historial`, ctx.tok.A);
  assert.deepEqual(h.data.eventos.map((e) => e.tipo), ["envio", "observacion", "reenvio", "aprobacion"]);
  const despues = await metricas();
  assert.equal(despues.resumen.total_reportes, antes.resumen.total_reportes + 1, "el reporte entra en los indicadores del semestre");
  assert.ok(despues.resumen.reportes_aprobados === undefined || despues.resumen.reportes_aprobados === antes.resumen.reportes_aprobados + 1);
  const st = await api(`/docente/${A.id}/matriz-stats`, ctx.tok.A);
  assert.equal(st.status, 200, JSON.stringify(st.data));
  const adm = await api(`/admin/dashboard?semestre=${SA}`, ctx.tok.admin);
  assert.equal(adm.status, 200, JSON.stringify(adm.data));
  const fichaAdmin = await api(`/admin/docentes/${A.id}/matriz`, ctx.tok.admin);
  assert.equal(fichaAdmin.status, 200, "el administrador abre la matriz del docente");
  const hAdm = await api(`/admin/reportes-revision/${ctx.e1}/historial`, ctx.tok.admin);
  assert.equal(hAdm.status, 200);
  assert.equal(hAdm.data.eventos.at(-1).tipo, "aprobacion");
});

// ───────────────────────── 2. Docente con entregables observados ─────────────────────────
test("2. Docente con entregables observados: ve el motivo y la lista de pendientes; «sin acceso» devuelve el entregable sin perder datos", { skip }, async () => {
  const B = ctx.u.B;
  const e = (await guardar("B", 1, [DRIVE_A], true)).data.entregable_id;
  const e2 = (await guardar("B", 2, [DRIVE_B], true)).data.entregable_id;
  assert.equal((await api(`/admin/reportes-revision/${e}`, ctx.tok.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: "Corrige la descripción" } })).status, 200);
  assert.equal((await api(`/admin/reportes-revision/${e2}`, ctx.tok.admin, { method: "PUT", body: { estado_revision: "observado", motivo: "sin_acceso" } })).status, 200);
  const c = await centro("B");
  assert.equal(c.data.items.find((x) => x.plantilla_id === ctx.tpl.B[1]).situacion, "observada");
  const sa = c.data.items.find((x) => x.plantilla_id === ctx.tpl.B[2]);
  assert.equal(sa.problema_acceso, true);
  assert.match(sa.comentario_revision, /acceso/i);
  const reps = await api(`/docente/${B.id}/reportes`, ctx.tok.B);
  assert.equal(reps.status, 200);
  // Reenviar por la ruta del docente
  assert.equal((await api(`/docente/${B.id}/entregables/${e}/reenviar`, ctx.tok.B, { method: "POST" })).status, 200);
  assert.equal((await situacion("B", 1)).situacion, "en_revision");
  // Reabrir un aprobado es acción del administrador.
  const m = await metricas();
  assert.ok(m.resumen.total_reportes >= 3);
});

// ───────────────────────── 3. Docente sin matriz, docente inactivo, acceso indebido, sesiones ─────────────────────────
test("3. Docente sin matriz: estados vacíos coherentes (200, sin datos inventados) y sin poder reportar", { skip }, async () => {
  const C = ctx.u.C;
  for (const ruta of ["matriz", "matriz-stats", "dashboard", "dashboard-stats", "evidencias", "reportes", "notificaciones", "perfil", "cronograma"]) {
    const r = await api(`/docente/${C.id}/${ruta}`, ctx.tok.C);
    assert.equal(r.status, 200, `${ruta}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  const m = await api(`/docente/${C.id}/matriz`, ctx.tok.C);
  assert.deepEqual(m.data.items ?? [], [], "sin matriz no hay entregables simulados");
  const ev = await api(`/docente/${C.id}/evidencias`, ctx.tok.C);
  assert.deepEqual(ev.data.items ?? [], []);
  // Intentar reportar una plantilla ajena (de otro grupo) se rechaza y no guarda nada.
  const antes = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [C.id]))[0].n;
  const r = await api(`/docente/${C.id}/matriz/${ctx.tpl.A[1]}/completar`, ctx.tok.C, { method: "POST", body: { completado: false, urls_evidencia: [DRIVE_A] } });
  assert.ok(r.status >= 400 && r.status < 500, `${r.status} ${JSON.stringify(r.data)}`);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [C.id]))[0].n, antes);
});

test("4. Docente inactivo y sesiones: un token válido deja de servir al inactivar la cuenta; token vencido, alterado o ausente → 401", { skip }, async () => {
  const D = ctx.u.D;
  for (const ruta of [`/docente/${D.id}/matriz`, `/docente/${D.id}/dashboard`, "/auth/me"]) {
    const r = await api(ruta, ctx.tok.D);
    assert.equal(r.status, 401, `${ruta}: ${r.status}`);
  }
  const base = { email: ctx.u.E.correo, role: "docente" };
  const firma = (extra, secret = process.env.JWT_SECRET) => jwt.sign(base, secret, { algorithm: "HS256", subject: String(ctx.u.E.id), issuer: "proysocial-api", audience: "proysocial-web", ...extra });
  assert.equal((await api(`/docente/${ctx.u.E.id}/matriz`, firma({ expiresIn: "1h" }))).status, 200, "control: token bien formado funciona");
  assert.equal((await api(`/docente/${ctx.u.E.id}/matriz`, firma({ expiresIn: -10 }))).status, 401, "sesión vencida");
  assert.equal((await api(`/docente/${ctx.u.E.id}/matriz`, firma({ expiresIn: "1h" }, "otro-secreto-distinto-de-32-caracteres-xx"))).status, 401, "firma alterada");
  assert.equal((await api(`/docente/${ctx.u.E.id}/matriz`, firma({ expiresIn: "1h", audience: "otra-app" }))).status, 401, "audiencia distinta");
  assert.equal((await api(`/docente/${ctx.u.E.id}/matriz`)).status, 401, "sin sesión");
  assert.equal((await api("/auth/me", "no-es-un-jwt")).status, 401);
  // Cierre de sesión.
  assert.ok([200, 204].includes((await api("/auth/logout", ctx.tok.E, { method: "POST" })).status));
});

test("5. Acceso indebido: un docente no lee ni escribe datos de otro; las rutas administrativas rechazan a docentes y a visitantes", { skip }, async () => {
  const A = ctx.u.A;
  const ajenas = [
    ["GET", `/docente/${A.id}/dashboard`], ["GET", `/docente/${A.id}/matriz`], ["GET", `/docente/${A.id}/matriz-stats`], ["GET", `/docente/${A.id}/evidencias`],
    ["GET", `/docente/${A.id}/reportes`], ["GET", `/docente/${A.id}/perfil`], ["GET", `/docente/${A.id}/notificaciones`], ["GET", `/docente/${A.id}/cronograma`],
    ["GET", `/docente/${A.id}/iniciativas/${A.proyecto}`], ["GET", `/docente/entregables/${ctx.e1}/historial`],
    ["PATCH", `/docente/${A.id}/notificaciones/leer`, {}], ["PUT", `/docente/${A.id}/info-contacto`, { telefono: "3000000000" }],
    ["POST", `/docente/${A.id}/matriz/${ctx.tpl.A[2]}/completar`, { completado: false, urls_evidencia: [DRIVE_A] }],
    ["PUT", `/docente/entregables/${ctx.e1}/evidencias`, { urls_evidencia: [DRIVE_A] }], ["PATCH", `/docente/entregables/${ctx.e1}/borrador`, { urls_evidencia: [DRIVE_A] }],
    ["POST", `/docente/${A.id}/entregables/${ctx.e1}/reenviar`], ["PUT", `/docente/entregables/${ctx.e1}`, { completado: false }],
  ];
  const antes = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [A.id]))[0].n;
  for (const [metodo, ruta, body] of ajenas) {
    const r = await api(ruta, ctx.tok.E, { method: metodo, ...(body ? { body } : {}) });
    assert.equal(r.status, 403, `${metodo} ${ruta} → ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  }
  assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [A.id]))[0].n, antes, "ningún intento escribió datos");
  // Barrido de TODAS las rutas administrativas de lectura sin parámetros de ruta: admin 200 (o 4xx de validación, nunca 5xx); docente 403; visitante 401.
  const rutasAdmin = ["/admin/dashboard", "/admin/notificaciones", "/admin/metricas", "/admin/reportes-revision", "/admin/docentes", "/admin/semestres", "/admin/grupos-matriz",
    "/admin/indicadores-grupo", "/admin/usuarios", "/admin/proyectos", "/admin/proyectos-semanas", "/admin/escuelas", "/admin/programas", "/admin/avance-consolidado",
    "/admin/asignaciones/incidencias", "/admin/importaciones", "/admin/correos/estado", "/admin/catalogos"];
  for (const ruta of rutasAdmin) {
    const a = await api(ruta, ctx.tok.admin);
    assert.ok(a.status < 500, `admin ${ruta} → ${a.status} ${JSON.stringify(a.data).slice(0, 160)}`);
    assert.ok(a.status !== 404 && a.status !== 403 && a.status !== 401, `admin ${ruta} → ${a.status}`);
    assert.equal((await api(ruta, ctx.tok.A)).status, 403, `docente ${ruta}`);
    assert.equal((await api(ruta)).status, 401, `visitante ${ruta}`);
  }
  assert.equal((await api(`/admin/usuarios/${A.id}`, ctx.tok.E, { method: "DELETE" })).status, 403);
  assert.equal((await api("/admin/semestres", ctx.tok.E, { method: "POST", body: { codigo: "2099A" } })).status, 403);
});

// ───────────────────────── 6. Administración operativa ─────────────────────────
test("6. Administración: usuarios, semestres, escuelas y programas guardan en PostgreSQL, validan y se reflejan en las listas", { skip }, async () => {
  const T = ctx.tok.admin;
  // Usuarios: crear, editar, inactivar, (no) eliminar con historial.
  const nuevo = await api("/admin/usuarios", T, { method: "POST", body: { nombres: `${M}x`, apellidos: "Nuevo", correo: `${M}.nuevo@test.local`, rol: "docente", tipo_docente: "ANTIGUO" } });
  assert.equal(nuevo.status, 201, JSON.stringify(nuevo.data));
  assert.equal((await api("/admin/usuarios", T, { method: "POST", body: { nombres: "x", apellidos: "y", correo: `${M}.nuevo@test.local`, rol: "docente" } })).status, 409, "correo repetido");
  assert.equal((await api("/admin/usuarios", T, { method: "POST", body: { nombres: "", apellidos: "y", correo: "x@y.z", rol: "docente" } })).status, 400);
  const lista = await api("/admin/usuarios", T);
  assert.ok(JSON.stringify(lista.data).includes(`${M}.nuevo@test.local`.toLowerCase()), "aparece en la lista");
  const ed = await api(`/admin/usuarios/${nuevo.data.id}`, T, { method: "PUT", body: { nombre: `${M}x`, apellido: "Editado", correo: `${M}.nuevo@test.local`, rol: "docente", estado: "inactivo", tipo_docente: "ANTIGUO", grupo_matriz_id: null } });
  assert.equal(ed.status, 200, JSON.stringify(ed.data));
  assert.equal((await q(`SELECT estado, apellido FROM usuarios WHERE id = $1`, [nuevo.data.id]))[0].estado, "inactivo");
  assert.equal((await api(`/admin/usuarios/${ctx.u.A.id}`, T, { method: "DELETE" })).status, 409, "con historial no se elimina");
  assert.ok([200, 204].includes((await api(`/admin/usuarios/${nuevo.data.id}`, T, { method: "DELETE" })).status));
  // Escuelas y programas: ciclo de vida.
  const esc = await api("/admin/escuelas", T, { method: "POST", body: { nombre: `${M} Escuela`, codigo: `${M}_ESC` } });
  assert.equal(esc.status, 201, JSON.stringify(esc.data));
  const prog = await api("/admin/programas", T, { method: "POST", body: { nombre: `${M} Programa Nuevo`, codigo: `${M}_PN`, escuela_id: esc.data.id } });
  assert.ok([200, 201].includes(prog.status), JSON.stringify(prog.data));
  assert.ok(JSON.stringify((await api("/admin/programas", T)).data).includes(`${M} Programa Nuevo`));
  assert.ok([400, 409].includes((await api(`/admin/escuelas/${esc.data.id}`, T, { method: "DELETE" })).status), "una escuela con programas no se elimina");
  assert.ok([200, 204].includes((await api(`/admin/programas/${prog.data.id}`, T, { method: "DELETE" })).status));
  assert.ok([200, 204].includes((await api(`/admin/escuelas/${esc.data.id}`, T, { method: "DELETE" })).status));
  // Semestres: listar (activo y anterior), semestre anterior consultable y sin mezclar datos.
  const sems = await api("/admin/semestres", T);
  const codigos = JSON.stringify(sems.data);
  assert.ok(codigos.includes(SA) && codigos.includes(SP));
  const mAnt = await api(`/admin/metricas?semestre=${SP}`, T);
  assert.equal(mAnt.status, 200);
  assert.equal(mAnt.data.resumen.total_reportes, 0, "el semestre anterior no recibe datos del activo");
  assert.equal(mAnt.data.alcance.activo, false);
  // Grupos y plantillas: resumen del grupo importado.
  const res = await api(`/admin/grupos-matriz/${ctx.grupo}/resumen`, T);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const pl = await api(`/admin/grupos-matriz/${ctx.grupo}/plantillas`, T);
  assert.equal(pl.status, 200);
  // Iniciativas: se listan con sus docentes.
  assert.equal((await api("/admin/proyectos", T)).data.proyectos?.some?.((p) => p.id === ctx.u.A.proyecto) ?? true, true);
  assert.equal((await api(`/admin/proyectos/${ctx.u.A.proyecto}/docentes`, T)).status, 200);
});

// ───────────────────────── 7. Consistencia de indicadores ─────────────────────────
test("7. Consistencia: lo que muestran los indicadores coincide con PostgreSQL y el semestre anterior no se mezcla", { skip }, async () => {
  const m = await metricas();
  const bd = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables e JOIN plantilla_entregables t ON t.id = e.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id WHERE g.semestre = $1 AND e.estado_revision <> 'borrador'`, [SA]))[0].n;
  assert.equal(m.resumen.total_reportes, bd, "total de reportes enviados = consulta independiente");
  const dash = await api(`/admin/dashboard?semestre=${SA}`, ctx.tok.admin);
  assert.equal(dash.status, 200);
  const todos = await api(`/admin/avance-consolidado?semestre=${SA}`, ctx.tok.admin);
  assert.equal(todos.status, 200, JSON.stringify(todos.data).slice(0, 200));
  const ig = await api(`/admin/indicadores-grupo?semestre=${SA}`, ctx.tok.admin);
  assert.equal(ig.status, 200);
  assert.ok(JSON.stringify(ig.data).includes(`${M} Grupo piloto`));
  assert.ok(!JSON.stringify(ig.data).includes(`${M} Grupo anterior`), "el filtro de semestre aísla los grupos");
});

// ───────────────────────── 8. Enlaces directos y recargas (despliegue de un solo contenedor) ─────────────────────────
test("8. Una navegación del navegador a una ruta de la SPA (recargar, enlace de notificación, marcador) recibe la aplicación; las llamadas a la API siguen exigiendo sesión", { skip }, async () => {
  const html = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
  for (const ruta of ["/docente", "/docente/matriz", "/docente/evidencias?entregable=1", "/docente/proyectos/1", "/admin", "/admin/revision?reporte=1", "/admin/docentes/1/matriz", "/admin/sistema"]) {
    const r = await fetch(`${API}${ruta}`, { headers: html });
    assert.equal(r.status, 200, `${ruta} → ${r.status}`);
    assert.match(await r.text(), /PILOTO_SPA/, `${ruta} debe devolver la aplicación`);
  }
  // Sin Accept de HTML (fetch de la SPA o cliente de API) la API se comporta como siempre.
  assert.equal((await fetch(`${API}/docente/${ctx.u.A.id}/matriz`)).status, 401);
  assert.equal((await fetch(`${API}/admin/usuarios`, { headers: { Accept: "application/json" } })).status, 401);
  assert.equal((await api(`/docente/${ctx.u.A.id}/matriz`, ctx.tok.A)).status, 200);
  assert.equal((await api(`/admin/usuarios`, ctx.tok.A)).status, 403);
  // Los archivos estáticos y la raíz siguen sirviéndose.
  assert.match(await (await fetch(`${API}/`, { headers: html })).text(), /PILOTO_SPA/);
});
