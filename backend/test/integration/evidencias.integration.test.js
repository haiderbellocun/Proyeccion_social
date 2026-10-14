// Bloque 3 (3A/3B): evidencias por entregable con versiones, historial y permisos, contra PostgreSQL real
// (solo proysocial_dev / proysocial_test). Datos sintéticos (prefijo TST_B3, semestre 2096A); se eliminan al terminar.
// Ejecutar: PGDATABASE=proysocial_dev PGHOST=localhost DATABASE_URL= npm run test:integration
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { crearXlsx, hojaCronograma } from "../support/xlsxBuilder.js";

process.env.JWT_SECRET ||= "pruebas-integracion-evidencias-secreto-largo-0123456789";
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
const { rellenarEvidenciasExistentes } = await import("../../src/services/evidenciaService.js");

const PORT = 4341;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_B3";
const SEM = "2096A";
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
const q = (s, p) => pool.query(s, p);
const contar = async (s, p = []) => Number((await q(s, p)).rows[0].n);

async function cleanup() {
  await q(`DELETE FROM entregable_eventos WHERE docente_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM importaciones_matriz WHERE semestre = $1`, [SEM]);
  await q(`DELETE FROM usuarios WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM grupos_matriz WHERE semestre = $1`, [SEM]);
  await q(`DELETE FROM semestres WHERE codigo = $1`, [SEM]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

const DRIVE_A = "https://drive.google.com/file/d/1TstB3ArchivoA/view?usp=sharing";
const DRIVE_A_OTRA_FORMA = "https://drive.google.com/open?id=1TstB3ArchivoA";
const DRIVE_B = "https://drive.google.com/file/d/1TstB3ArchivoB/view";
const DRIVE_C = "https://drive.google.com/file/d/1TstB3ArchivoC/view";

before(async () => {
  if (!DB_OK) return;
  assert.ok(["proysocial_test", "proysocial_dev"].includes((await q("select current_database() d")).rows[0].d));
  await cleanup();
  const ini = sumarDias(hoyBogota(), -21);
  const d = (n) => sumarDias(ini, n);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, FALSE)`, [SEM, ini, sumarDias(ini, 111)]);
  const prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`])).rows[0].id;
  const mk = async (n, rol) => (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado) VALUES ($1, 'Prueba', $2, $3, $4, 'activo') RETURNING id, nombre, apellido, correo, rol`,
    [`${M}_${n}`, `${M}.${n}@test.local`, rol, prog]
  )).rows[0];
  ctx.admin = await mk("Admin", "admin");
  ctx.docente = await mk("Docente", "docente");
  ctx.otro = await mk("Otro", "docente");
  T = { admin: createSessionToken(ctx.admin), docente: createSessionToken(ctx.docente), otro: createSessionToken(ctx.otro) };
  const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`, [`${M} Proyecto`, prog, ctx.docente.id, ini])).rows[0].id;
  for (let n = 1; n <= 16; n += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(ini, (n - 1) * 7), sumarDias(ini, (n - 1) * 7 + 6)]);
  ctx.proyecto = p;

  server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  // Matriz sintética importada por el administrador y asignada al docente
  const semanas = [
    { mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento", items: [
      { numero: 1, entregable: `${M} Informe 1`, horas: 1, inicio: d(1), fin: d(4), descripcion: "Cargar soporte" },
      { numero: 2, entregable: `${M} Informe 2`, horas: 2, inicio: d(2), fin: d(4), descripcion: "Cargar soporte" },
    ] },
    { mes: "Febrero", semana: 4, items: [{ numero: 3, entregable: `${M} Sin requisito`, horas: 1, inicio: d(21), fin: d(24), descripcion: "Esta tarea no implica realizar cargue" }] },
  ];
  const imp = await api("/admin/importaciones/confirmar", T.admin, {
    method: "POST",
    body: {
      archivo_base64: crearXlsx([hojaCronograma("G sintética", semanas)]).toString("base64"),
      nombre_archivo: "evidencias.xlsx", hoja_indice: 0,
      destino: { semestre: SEM, modo: "nuevo_grupo", grupo: { nombre: `${M} Grupo`, tipo_docente: "ANTIGUO", horas_totales: 24, num_proyectos: 1, num_actividades: 2, num_convenios_nuevos: 0, num_convenios_dinamizados: 1 } },
    },
  });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  const asig = await api(`/admin/docentes/${ctx.docente.id}/grupo-matriz`, T.admin, { method: "PUT", body: { grupo_matriz_id: imp.data.grupo_id } });
  assert.equal(asig.status, 200, JSON.stringify(asig.data));
  const m = await api(`/docente/${ctx.docente.id}/matriz`, T.docente);
  ctx.tpl = Object.fromEntries(m.data.items.map((i) => [i.numero, i.plantilla_id]));
});
after(async () => {
  if (server) server.kill();
  if (DB_OK) await cleanup();
  await pool.end();
});

const guardar = (n, urls, completado = false, extra = {}) =>
  api(`/docente/${ctx.docente.id}/matriz/${ctx.tpl[n]}/completar`, T.docente, { method: "POST", body: { completado, urls_evidencia: urls, ...extra } });
const centro = async (token = T.docente) => api(`/docente/${ctx.docente.id}/evidencias`, token);
const item = (data, n) => data.items.find((x) => x.plantilla_id === ctx.tpl[n]);

test("el centro lista todos los entregables con lo que necesita cada uno", { skip }, async () => {
  const r = await centro();
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 3);
  assert.equal(r.data.semestre, SEM);
  assert.equal(item(r.data, 1).situacion, "sin_evidencia");
  assert.equal(item(r.data, 1).requiere_evidencia, true);
  assert.equal(item(r.data, 3).situacion, "sin_requisito");
  assert.equal(r.data.resumen.sin_evidencia, 2);
  assert.equal(r.data.resumen.vencidos_sin_enviar, 2);
  assert.deepEqual(r.data.iniciativas.map((i) => i.id), [ctx.proyecto], "iniciativas a las que se asocian las evidencias");
});

test("guardar enlaces como borrador crea evidencias vinculadas; los duplicados no se repiten", { skip }, async () => {
  const g = await guardar(1, [DRIVE_A, DRIVE_A_OTRA_FORMA, DRIVE_B]);
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const eid = g.data.entregable_id;
  ctx.e1 = eid;
  const filas = (await q(`SELECT * FROM entregable_evidencias WHERE entregable_id = $1 ORDER BY id`, [eid])).rows;
  assert.equal(filas.length, 2, "el mismo archivo de Drive escrito de dos formas cuenta una vez");
  assert.deepEqual(filas.map((f) => f.drive_id), ["1TstB3ArchivoA", "1TstB3ArchivoB"]);
  assert.ok(filas.every((f) => f.docente_id === ctx.docente.id && f.proyecto_id === ctx.proyecto && f.semestre === SEM && f.plantilla_id === ctx.tpl[1]));
  assert.ok(filas.every((f) => f.estado === "vigente" && f.envio_numero === null), "en borrador aún sin ronda de envío");
  // Repetir el guardado no duplica
  await guardar(1, [DRIVE_A, DRIVE_B]);
  assert.equal(await contar(`SELECT COUNT(*)::int n FROM entregable_evidencias WHERE entregable_id = $1`, [eid]), 2);
  const r = await centro();
  assert.equal(item(r.data, 1).situacion, "borrador");
  assert.equal(item(r.data, 1).evidencias.length, 2);
  assert.equal(item(r.data, 1).iniciativa_id, ctx.proyecto, "ya queda ligado a la iniciativa");
});

test("enlaces inválidos se rechazan sin dejar rastro", { skip }, async () => {
  const antes = await contar(`SELECT COUNT(*)::int n FROM entregable_evidencias WHERE entregable_id = $1`, [ctx.e1]);
  const r = await guardar(1, [DRIVE_A, "javascript:alert(1)"], true);
  assert.equal(r.status, 422);
  assert.equal(r.data.codigo, "EVIDENCIA_INVALIDA");
  assert.equal(await contar(`SELECT COUNT(*)::int n FROM entregable_evidencias WHERE entregable_id = $1`, [ctx.e1]), antes);
  const estado = (await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.e1])).rows[0].estado_revision;
  assert.equal(estado, "borrador");
});

test("al enviar, las evidencias quedan en la ronda 1; el administrador observa y el docente ve el motivo", { skip }, async () => {
  const s = await guardar(1, [DRIVE_A, DRIVE_B], true);
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const filas = (await q(`SELECT envio_numero FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente'`, [ctx.e1])).rows;
  assert.ok(filas.every((f) => f.envio_numero === 1));

  const o = await api(`/admin/reportes-revision/${ctx.e1}`, T.admin, { method: "PUT", body: { estado_revision: "observado", comentario_revision: "El archivo B no corresponde al entregable" } });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  const r = await centro();
  const it = item(r.data, 1);
  assert.equal(it.situacion, "observada");
  assert.equal(it.comentario_revision, "El archivo B no corresponde al entregable");
  assert.equal(it.evidencias.length, 2);
  assert.equal(it.puede_editar, true);
});

test("corregir una evidencia observada conserva la versión anterior y abre la ronda 2", { skip }, async () => {
  const r = await guardar(1, [DRIVE_A, DRIVE_C], true);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const todas = (await q(`SELECT drive_id, estado, envio_numero FROM entregable_evidencias WHERE entregable_id = $1 ORDER BY id`, [ctx.e1])).rows;
  const por = (id) => todas.find((x) => x.drive_id === id);
  assert.deepEqual([por("1TstB3ArchivoA").estado, por("1TstB3ArchivoA").envio_numero], ["vigente", 1], "la que no cambió conserva su ronda");
  assert.deepEqual([por("1TstB3ArchivoB").estado, por("1TstB3ArchivoB").envio_numero], ["reemplazada", 1], "la anterior queda como versión previa");
  assert.deepEqual([por("1TstB3ArchivoC").estado, por("1TstB3ArchivoC").envio_numero], ["vigente", 2]);
  const c = await centro();
  assert.equal(item(c.data, 1).versiones_anteriores.length, 1);
  assert.equal(item(c.data, 1).situacion, "en_revision");
});

test("el historial no se sobrescribe y cada evento referencia las evidencias", { skip }, async () => {
  const h = await api(`/docente/entregables/${ctx.e1}/historial`, T.docente);
  assert.equal(h.status, 200);
  assert.deepEqual(h.data.eventos.map((e) => e.tipo), ["envio", "observacion", "reenvio"]);
  const [envio, obs, reenvio] = h.data.eventos;
  assert.equal(envio.estado_nuevo, "enviado");
  assert.equal(envio.detalle.envio_numero, 1);
  assert.deepEqual(envio.detalle.evidencias.map((e) => e.drive_id).sort(), ["1TstB3ArchivoA", "1TstB3ArchivoB"]);
  assert.equal(obs.comentario, "El archivo B no corresponde al entregable");
  assert.equal(obs.actor_id, ctx.admin.id);
  assert.ok(obs.actor_nombre.includes(M));
  assert.equal(reenvio.detalle.envio_numero, 2);
  assert.deepEqual(reenvio.detalle.evidencias.map((e) => e.drive_id).sort(), ["1TstB3ArchivoA", "1TstB3ArchivoC"]);
  assert.equal(h.data.evidencias.length, 3, "todas las versiones siguen consultables");
});

test("PUT de evidencias guarda solo enlaces, conserva el resto del reporte y respeta el estado", { skip }, async () => {
  // Entregable 2 (aún sin reporte): borrador con actividad escrita, luego se editan solo los enlaces
  const g = await guardar(2, [DRIVE_A], false);
  const e2 = g.data.entregable_id;
  await q(`UPDATE proyecto_entregables SET actividad_reportada = 'Actividad realizada', porcentaje_avance = 40 WHERE id = $1`, [e2]);
  const r = await api(`/docente/entregables/${e2}/evidencias`, T.docente, { method: "PUT", body: { urls_evidencia: [DRIVE_B, DRIVE_C] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const fila = (await q(`SELECT actividad_reportada, porcentaje_avance, estado_revision FROM proyecto_entregables WHERE id = $1`, [e2])).rows[0];
  assert.deepEqual([fila.actividad_reportada, fila.porcentaje_avance, fila.estado_revision], ["Actividad realizada", 40, "borrador"]);
  const ev = (await q(`SELECT drive_id, estado FROM entregable_evidencias WHERE entregable_id = $1 ORDER BY id`, [e2])).rows;
  assert.deepEqual(ev.map((x) => [x.drive_id, x.estado]), [["1TstB3ArchivoA", "retirada"], ["1TstB3ArchivoB", "vigente"], ["1TstB3ArchivoC", "vigente"]], "la que nunca se envió queda retirada, no borrada");
  // validaciones de forma
  assert.equal((await api(`/docente/entregables/${e2}/evidencias`, T.docente, { method: "PUT", body: { urls_evidencia: "x" } })).status, 400);
  assert.equal((await api(`/docente/entregables/${e2}/evidencias`, T.docente, { method: "PUT", body: { urls_evidencia: ["file:///etc/passwd"] } })).status, 422, "tampoco se guardan borradores con enlaces no http(s)");
  assert.equal((await api(`/docente/entregables/${e2}/evidencias`, T.otro, { method: "PUT", body: { urls_evidencia: [DRIVE_A] } })).status, 403);
});

test("una evidencia aprobada no se puede modificar ni se pierde", { skip }, async () => {
  const ap = await api(`/admin/reportes-revision/${ctx.e1}`, T.admin, { method: "PUT", body: { estado_revision: "aprobado" } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  const antes = (await q(`SELECT id, estado FROM entregable_evidencias WHERE entregable_id = $1 ORDER BY id`, [ctx.e1])).rows;
  const cambio = await guardar(1, [DRIVE_B], true);
  assert.equal(cambio.status, 409);
  assert.equal(cambio.data.codigo, "ESTADO_BLOQUEADO");
  const patch = await api(`/docente/entregables/${ctx.e1}/borrador`, T.docente, { method: "PATCH", body: { urls_evidencia: [DRIVE_B] } });
  assert.equal(patch.status, 409);
  const put = await api(`/docente/entregables/${ctx.e1}/evidencias`, T.docente, { method: "PUT", body: { urls_evidencia: [DRIVE_B] } });
  assert.equal(put.status, 409);
  assert.deepEqual((await q(`SELECT id, estado FROM entregable_evidencias WHERE entregable_id = $1 ORDER BY id`, [ctx.e1])).rows, antes);
  const c = await centro();
  assert.equal(item(c.data, 1).situacion, "aprobada");
  assert.equal(item(c.data, 1).puede_editar, false);
  const h = await api(`/docente/entregables/${ctx.e1}/historial`, T.docente);
  assert.equal(h.data.eventos.at(-1).tipo, "aprobacion");
  assert.equal(h.data.eventos.at(-1).detalle.evidencias.length, 2);
});

test("permisos: un docente no ve ni toca evidencias de otro; sin sesión 401; el administrador sí consulta", { skip }, async () => {
  assert.equal((await api(`/docente/${ctx.docente.id}/evidencias`)).status, 401);
  assert.equal((await centro(T.otro)).status, 403);
  assert.equal((await api(`/docente/entregables/${ctx.e1}/historial`, T.otro)).status, 403);
  assert.equal((await api(`/docente/entregables/${ctx.e1}/borrador`, T.otro, { method: "PATCH", body: { urls_evidencia: [DRIVE_B] } })).status, 403);
  assert.equal((await centro(T.admin)).status, 200);
  assert.equal((await api(`/docente/entregables/${ctx.e1}/historial`, T.admin)).status, 200);
});

test("el relleno de evidencias anteriores es idempotente", { skip }, async () => {
  await q(`DELETE FROM entregable_evidencias WHERE entregable_id = $1`, [ctx.e1]);
  const uno = await rellenarEvidenciasExistentes(pool);
  assert.ok(uno.entregables >= 1);
  const filas = (await q(`SELECT estado, envio_numero FROM entregable_evidencias WHERE entregable_id = $1`, [ctx.e1])).rows;
  assert.equal(filas.length, 2);
  assert.ok(filas.every((f) => f.estado === "vigente" && f.envio_numero >= 1));
  const dos = await rellenarEvidenciasExistentes(pool);
  assert.equal(dos.evidencias, 0);
});

// ───────────── 3D: bandeja de revisión de coordinación y «No tengo acceso a la evidencia» ─────────────
const HOJA = "https://docs.google.com/spreadsheets/d/1TstB3HojaDeCalculo/edit#gid=0";
const bandeja = (qs = "", token = T.admin) => api(`/admin/reportes-revision?docente_id=${ctx.docente.id}&${qs}`, token);

test("la bandeja muestra enlaces, versiones, programa, semestre, requisito y respeta los filtros", { skip }, async () => {
  const e = await guardar(2, [DRIVE_B, HOJA], true);
  assert.equal(e.status, 200, JSON.stringify(e.data));
  ctx.e2 = e.data.entregable_id;
  const r = await bandeja();
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.reportes.length, 1, "por defecto solo lo pendiente de revisión");
  const x = r.data.reportes[0];
  assert.equal(x.id, ctx.e2);
  assert.deepEqual([x.semestre, x.programa_nombre, x.docente_nombre.includes(M)], [SEM, `${M} Programa`, true]);
  assert.equal(x.proyecto_id, ctx.proyecto);
  assert.deepEqual(x.evidencias.map((v) => v.tipo_enlace).sort(), ["drive_archivo", "google_hoja"]);
  assert.equal(x.versiones_anteriores.length, 2, "las versiones A y C (retiradas antes del envío) siguen consultables");
  assert.equal(x.requisito_evidencia.requiere, true);
  assert.equal(x.dias_en_espera, 0);
  // Filtros
  assert.equal((await bandeja(`semestre=${SEM}`)).data.reportes.length, 1);
  assert.equal((await bandeja("semestre=1999Z")).data.reportes.length, 0);
  assert.equal((await bandeja(`programa=${encodeURIComponent(`${M} Programa`)}`)).data.reportes.length, 1);
  assert.equal((await bandeja("programa=Otro")).data.reportes.length, 0);
  assert.equal((await bandeja(`desde=${hoyBogota()}&hasta=${hoyBogota()}`)).data.reportes.length, 1);
  assert.equal((await bandeja(`desde=${sumarDias(hoyBogota(), 1)}`)).data.reportes.length, 0);
  assert.equal((await bandeja("estado=aprobado")).data.reportes.length, 1, "e1 aprobado");
  assert.equal((await bandeja("estado=todos")).data.reportes.length, 2);
  assert.equal((await bandeja("q=Informe 2")).data.reportes.length, 1);
  // Validaciones y permisos
  assert.equal((await bandeja("estado=raro")).status, 400);
  assert.equal((await bandeja("desde=ayer")).status, 400);
  assert.equal((await bandeja("", T.docente)).status, 403);
  assert.equal((await api("/admin/reportes-revision")).status, 401);
});

test("«No tengo acceso a la evidencia» devuelve el entregable al docente sin perder datos ni historial", { skip }, async () => {
  await q("UPDATE proyecto_entregables SET actividad_reportada = 'Actividad con acceso', porcentaje_avance = 70 WHERE id = $1", [ctx.e2]);
  const antes = (await q("SELECT id FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente' ORDER BY id", [ctx.e2])).rows.map((r) => Number(r.id));
  assert.equal((await api(`/admin/reportes-revision/${ctx.e2}`, T.admin, { method: "PUT", body: { estado_revision: "aprobado", motivo: "sin_acceso" } })).status, 400, "no se combina con aprobar");
  assert.equal((await api(`/admin/reportes-revision/${ctx.e2}`, T.admin, { method: "PUT", body: { estado_revision: "observado", motivo: "otro" } })).status, 400);
  const r = await api(`/admin/reportes-revision/${ctx.e2}`, T.admin, { method: "PUT", body: { estado_revision: "observado", motivo: "sin_acceso", evidencias_afectadas: [antes[1]] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const fila = (await q("SELECT estado_revision, comentario_revision, problema_acceso_en, actividad_reportada, porcentaje_avance, num_envios FROM proyecto_entregables WHERE id = $1", [ctx.e2])).rows[0];
  assert.equal(fila.estado_revision, "observado");
  assert.match(fila.comentario_revision, /No tengo acceso a la evidencia/);
  assert.ok(fila.problema_acceso_en);
  assert.deepEqual([fila.actividad_reportada, fila.porcentaje_avance, fila.num_envios], ["Actividad con acceso", 70, 1], "los datos del entregable se conservan");
  assert.deepEqual((await q("SELECT id FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente' ORDER BY id", [ctx.e2])).rows.map((x) => Number(x.id)), antes, "las evidencias no se tocan");

  // Bandeja: aparece como problema de acceso, ya no como pendiente
  assert.equal((await bandeja()).data.reportes.length, 0);
  const pa = await bandeja("estado=sin_acceso");
  assert.equal(pa.data.reportes.length, 1);
  assert.equal(pa.data.reportes[0].problema_acceso, true);
  // El docente lo ve en su centro, con el motivo
  const c = item((await centro()).data, 2);
  assert.equal(c.situacion, "observada");
  assert.equal(c.problema_acceso, true);
  assert.match(c.comentario_revision, /compártelo con las cuentas de coordinación/);
  // Historial: evento propio con las evidencias afectadas
  const h = await api(`/admin/reportes-revision/${ctx.e2}/historial`, T.admin);
  const ev = h.data.eventos.at(-1);
  assert.equal(ev.tipo, "sin_acceso");
  assert.deepEqual([ev.estado_anterior, ev.estado_nuevo, ev.detalle.motivo, ev.detalle.evidencias_afectadas], ["enviado", "observado", "sin_acceso", [antes[1]]]);
  assert.equal(ev.actor_id, ctx.admin.id);
  assert.equal((await api(`/admin/reportes-revision/${ctx.e2}/historial`, T.docente)).status, 403);
});

test("el docente corrige los permisos, reenvía y el problema de acceso se limpia sin perder el historial", { skip }, async () => {
  const r = await guardar(2, [DRIVE_B, HOJA], true);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const fila = (await q("SELECT estado_revision, problema_acceso_en, num_envios FROM proyecto_entregables WHERE id = $1", [ctx.e2])).rows[0];
  assert.deepEqual([fila.estado_revision, fila.problema_acceso_en, fila.num_envios], ["enviado", null, 2]);
  assert.equal((await bandeja("estado=sin_acceso")).data.reportes.length, 0);
  assert.equal((await bandeja()).data.reportes[0].es_reenvio, true);
  const h = await api(`/admin/reportes-revision/${ctx.e2}/historial`, T.admin);
  assert.deepEqual(h.data.eventos.map((e) => e.tipo), ["envio", "sin_acceso", "reenvio"], "el historial conserva todo");
  // Coordinación aprueba; ya no se puede marcar sin acceso ni cambiar
  assert.equal((await api(`/admin/reportes-revision/${ctx.e2}`, T.admin, { method: "PUT", body: { estado_revision: "aprobado" } })).status, 200);
  const tarde = await api(`/admin/reportes-revision/${ctx.e2}`, T.admin, { method: "PUT", body: { estado_revision: "observado", motivo: "sin_acceso" } });
  assert.equal(tarde.status, 409);
  assert.equal(tarde.data.codigo, "ESTADO_BLOQUEADO");
  assert.equal((await q("SELECT problema_acceso_en FROM proyecto_entregables WHERE id = $1", [ctx.e2])).rows[0].problema_acceso_en, null);
});
