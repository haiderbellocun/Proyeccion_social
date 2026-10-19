// Bloque 1.2: PROTECCIÓN DE LOS CAMPOS HISTÓRICOS DE LAS INICIATIVAS (fecha de inicio, número de semanas y programa).
// Pruebas de integración contra PostgreSQL REAL, solo en `proysocial_test` (mismas garantías de seguridad que los bloques
// anteriores: PGDATABASE=proysocial_test exacto, servidor local, sin DATABASE_URL y current_database() verificado; en cualquier
// otro caso se OMITEN).
//   npm run test:db:setup
//   npm run test:integration:protegidos
//
// Datos sintéticos (prefijo TST_J, semestre 2093A) eliminados al final. En cada rechazo se compara la huella completa de las tablas
// involucradas (incluidas las fechas de proyecto_semanas) y las métricas que ve el docente (dashboard-stats) antes y después.
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
const skip = DB_OK ? false : "Estas pruebas destructivas solo corren con PGDATABASE=proysocial_test en el servidor local (npm run test:integration:protegidos)";

const { pool } = await import("../../src/db.js");
const { createSessionToken } = await import("../../src/middleware/auth.js");
const { hoyBogota, sumarDias } = await import("../../src/services/matrizService.js");
const wf = await import("../../src/services/entregableWorkflowService.js");
const hist = await import("../../src/services/historicosService.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4313;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_J";
const S1 = "2093A";
const DRIVE = "https://drive.google.com/file/d/TST-J-EVIDENCIA/view";
const ctx = { g: {}, u: {}, p: {}, ent: {} };
let server;
let tokenAdmin;

async function api(ruta, options = {}) {
  const response = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { Authorization: `Bearer ${tokenAdmin}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const TABLAS = [
  ["usuarios", "id"], ["semestres", "codigo"], ["grupos_matriz", "id"], ["plantilla_entregables", "id"], ["programas", "id"],
  ["proyectos", "id"], ["proyecto_semanas", "id"], ["proyecto_entregables", "id"], ["proyecto_docentes", "proyecto_id, docente_id"],
  ["entregable_evidencias", "id"], ["entregable_eventos", "id"], ["docente_entregable_excepciones", "id"],
];
async function huella() {
  const out = {};
  for (const [t, k] of TABLAS) {
    const r = (await q(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(x::text, '|' ORDER BY ${k}), '')) AS h FROM ${t} x`))[0];
    out[t] = `${r.n}:${r.h}`;
  }
  return out;
}
const sinCambios = async (antes, mensaje) => assert.deepEqual(await huella(), antes, mensaje ?? "una operación rechazada no debe modificar nada");

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return;
    } catch { /* iniciando */ }
    await esperar(150);
  }
  throw new Error("El servidor de prueba no inició");
}

async function cleanup() {
  const grupos = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  const usuarios = (await q(`SELECT id FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`])).map((r) => r.id);
  const entregables = (await q(
    `SELECT pe.id FROM proyecto_entregables pe JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id JOIN proyectos p ON p.id = ps.proyecto_id WHERE p.titulo LIKE $1`,
    [`${M}%`]
  )).map((r) => r.id);
  await q(
    `DELETE FROM entregable_eventos WHERE entregable_id = ANY($3::int[]) OR plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id = ANY($2::int[]) OR actor_id = ANY($2::int[])`,
    [grupos, usuarios, entregables]
  );
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id = ANY($1::int[])`, [usuarios]);
  await q(`DELETE FROM notificaciones WHERE usuario_id = ANY($1::int[])`, [usuarios]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE id = ANY($1::int[])`, [usuarios]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM semestres WHERE codigo = $1`, [S1]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

const hoy = hoyBogota();
const INICIO = sumarDias(hoy, -21);
async function mkProyecto(titulo, responsable, programa = ctx.prog1, semanas = 16) {
  const p = (await q(
    `INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, $5) RETURNING id`,
    [`${M} ${titulo}`, programa, responsable.id, INICIO, semanas]
  ))[0].id;
  for (let n = 1; n <= semanas; n += 1) {
    await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(INICIO, (n - 1) * 7), sumarDias(INICIO, (n - 1) * 7 + 6)]);
    await q(`INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas) SELECT id, 'Entregable programado', 2 FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = $2`, [p, n]);
  }
  return p;
}
let seq = 0;
async function mkPlantilla(texto, { categoria = "Proyecto", fase = "Proyecto" } = {}) {
  seq += 1;
  return (await q(
    `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
     VALUES ($1, $2, $3, $4, 'Octubre', $5, $6, 'Cargar soporte', 2, 0, 4) RETURNING id`,
    [ctx.g1, 100 + seq, categoria, fase, (seq % 14) + 1, `${M} ${texto} ${seq}`]
  ))[0].id;
}
const reportar = (docente, plantilla, proyecto, completado = true) =>
  wf.registrarDesdeMatriz(pool, { docenteId: docente.id, plantillaId: plantilla, completado, proyectoId: proyecto, datos: completado ? { url_evidencia: [DRIVE] } : {} });
/** Cuerpo del PUT tal como lo envía el frontend al guardar una iniciativa (todos los campos, con sus valores actuales). */
async function cuerpo(proyectoId, extra = {}) {
  const p = (await q(`SELECT p.*, to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio, pr.nombre AS programa FROM proyectos p LEFT JOIN programas pr ON pr.id = p.programa_id WHERE p.id = $1`, [proyectoId]))[0];
  return {
    titulo: p.titulo, descripcion: p.descripcion ?? "", programaId: p.programa_id, programaNombre: p.programa, docenteId: p.docente_responsable_id,
    tipoVisual: "project", estado: p.estado, semanas: Number(p.semanas), fechaInicio: p.inicio, fechaFin: null, ...extra,
  };
}
const put = async (proyectoId, extra) => api(`/admin/proyectos/${proyectoId}`, { method: "PUT", body: await cuerpo(proyectoId, extra) });
const fila = async (proyectoId) => (await q(`SELECT p.titulo, p.descripcion, p.estado, p.programa_id, p.semanas, p.docente_responsable_id, to_char(p.fecha_inicio, 'YYYY-MM-DD') AS inicio, p.horas_totales FROM proyectos p WHERE p.id = $1`, [proyectoId]))[0];
const semanasDe = async (proyectoId) => q(`SELECT numero, to_char(fecha_inicio, 'YYYY-MM-DD') AS fi, to_char(fecha_fin, 'YYYY-MM-DD') AS ff FROM proyecto_semanas WHERE proyecto_id = $1 ORDER BY numero`, [proyectoId]);
const metricas = async (docente) => {
  const r = await api(`/docente/${docente.id}/dashboard-stats`);
  assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 200));
  return r.data;
};

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  await cleanup();
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, false)`, [S1, INICIO, sumarDias(INICIO, 16 * 7 - 1)]);
  ctx.prog1 = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa 1`, `${M}_P1`]))[0].id;
  ctx.prog2 = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa 2`, `${M}_P2`]))[0].id;
  ctx.g1 = (await q(
    `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
     VALUES ($1, 'sintético', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`,
    [`${M} G1`, S1]
  ))[0].id;
  const mkUser = async (nombre, rol) =>
    (await q(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, grupo_matriz_id)
       VALUES ($1, 'Prueba', $2, $3, $4, 'activo', $5, $6) RETURNING id, nombre, apellido, correo, rol`,
      [`${M}_${nombre}`, `${M}.${nombre}@test.local`, rol, ctx.prog1, rol === "docente" ? "ANTIGUO" : null, rol === "docente" ? ctx.g1 : null]
    ))[0];
  ctx.u.admin = await mkUser("Admin", "admin");
  for (const n of ["A", "B", "C"]) ctx.u[n] = await mkUser(n, "docente");
  tokenAdmin = createSessionToken(ctx.u.admin);
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
              (SELECT COUNT(*) FROM semestres WHERE codigo = $3)::int s, (SELECT COUNT(*) FROM proyectos WHERE titulo LIKE $2)::int p,
              (SELECT COUNT(*) FROM programas WHERE nombre LIKE $2)::int pr`,
      [`${M}.%`, `${M}%`, S1]
    ))[0];
    assert.deepEqual(quedan, { u: 0, g: 0, s: 0, p: 0, pr: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

const esHistorico = (r) => {
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.codigo, "HISTORICO_PROTEGIDO");
  assert.ok(typeof r.data.error === "string" && r.data.error.length > 30, "explicación concreta para el frontend");
  assert.equal(r.data.requiere_confirmacion, undefined);
  assert.ok(r.data.resumen && r.data.resumen.total > 0);
  assert.ok(r.data.alternativa);
};
/** Exige el 409 estándar y que NADA cambió: huella completa, fila de la iniciativa, calendario y métricas del docente. */
async function rechazada(proyectoId, docente, operacion) {
  const antes = await huella();
  const filaAntes = await fila(proyectoId);
  const semanasAntes = await semanasDe(proyectoId);
  const metricasAntes = await metricas(docente);
  const r = await operacion();
  esHistorico(r);
  await sinCambios(antes);
  assert.deepEqual(await fila(proyectoId), filaAntes, "la iniciativa conserva sus valores");
  assert.deepEqual(await semanasDe(proyectoId), semanasAntes, "el calendario conserva sus fechas");
  assert.deepEqual(await metricas(docente), metricasAntes, "las métricas del docente no cambian tras el rechazo");
  return r;
}

// ───────────────────────── 1–3. Campos protegidos con reportes ─────────────────────────
test("0. Fixtures: iniciativas con reportes en borrador, enviado, aprobado y observado", { skip }, async () => {
  ctx.p.env = await mkProyecto("Con enviado", ctx.u.A);
  ctx.ent.env = (await reportar(ctx.u.A, await mkPlantilla("enviado"), ctx.p.env)).entregable_id;
  ctx.p.bor = await mkProyecto("Con borrador", ctx.u.B);
  ctx.ent.bor = (await reportar(ctx.u.B, await mkPlantilla("borrador"), ctx.p.bor, false)).entregable_id;
  ctx.p.apr = await mkProyecto("Con aprobado", ctx.u.A);
  const a = await reportar(ctx.u.A, await mkPlantilla("aprobado"), ctx.p.apr);
  await wf.aplicarRevisionAdmin(pool, { entregableId: a.entregable_id, estadoNuevo: "aprobado", actorId: ctx.u.admin.id });
  ctx.p.obs = await mkProyecto("Con observado", ctx.u.B);
  const o = await reportar(ctx.u.B, await mkPlantilla("observado"), ctx.p.obs);
  await wf.aplicarRevisionAdmin(pool, { entregableId: o.entregable_id, estadoNuevo: "observado", actorId: ctx.u.admin.id, comentario: "ajustar" });
  const estados = (await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = ANY($1::int[]) ORDER BY id`, [[ctx.ent.env, ctx.ent.bor, a.entregable_id, o.entregable_id]])).map((r) => r.estado_revision);
  assert.deepEqual(estados.sort(), ["aprobado", "borrador", "enviado", "observado"]);
  ctx.proyectosConReportes = [[ctx.p.env, ctx.u.A], [ctx.p.bor, ctx.u.B], [ctx.p.apr, ctx.u.A], [ctx.p.obs, ctx.u.B]];
});

test("1. Cambiar la fecha de inicio con reportes (en cualquier estado) se rechaza", { skip }, async () => {
  for (const [p, d] of ctx.proyectosConReportes) {
    const nueva = sumarDias(INICIO, 7);
    const r = await rechazada(p, d, async () => put(p, { fechaInicio: nueva }));
    assert.match(r.data.error, /fecha de inicio/);
    await rechazada(p, d, async () => put(p, { fechaInicio: sumarDias(INICIO, -30), forzar_cronograma: true }));
  }
});

test("2. Cambiar el número de semanas con reportes (aumentar o reducir) se rechaza", { skip }, async () => {
  for (const [p, d] of ctx.proyectosConReportes) {
    const r = await rechazada(p, d, async () => put(p, { semanas: 20 }));
    assert.match(r.data.error, /número de semanas/);
    await rechazada(p, d, async () => put(p, { semanas: 12, forzar_cronograma: true }));
  }
});

test("3. Cambiar el programa con reportes se rechaza (por id y por nombre)", { skip }, async () => {
  for (const [p, d] of ctx.proyectosConReportes) {
    const r = await rechazada(p, d, async () => put(p, { programaId: ctx.prog2 }));
    assert.match(r.data.error, /programa académico/);
    assert.match(r.data.error, /indicadores/);
    await rechazada(p, d, async () => {
      const c = await cuerpo(p);
      delete c.programaId;
      return api(`/admin/proyectos/${p}`, { method: "PUT", body: { ...c, programaNombre: `${M} Programa 2` } });
    });
  }
});

test("3b. Una operación que mezcla un campo permitido con uno protegido se rechaza completa", { skip }, async () => {
  const [p, d] = [ctx.p.env, ctx.u.A];
  const r = await rechazada(p, d, async () => put(p, { titulo: `${M} Con enviado (otro título)`, descripcion: "nueva", fechaInicio: sumarDias(INICIO, 7), semanas: 18, programaId: ctx.prog2, estado: "suspendido" }));
  assert.match(r.data.error, /la fecha de inicio, el número de semanas, el programa académico/);
  assert.equal((await fila(p)).titulo, `${M} Con enviado`, "ni siquiera el título cambió: sin escrituras parciales");
});

// ───────────────────────── 4. Mismos valores y campos no protegidos ─────────────────────────
test("4. Reenviar los mismos valores no genera conflicto; los campos no protegidos siguen editables con reportes", { skip }, async () => {
  const p = ctx.p.env;
  const antes = await huella();
  const igual = await put(p, {});
  assert.equal(igual.status, 200, JSON.stringify(igual.data));
  // Reenviar los mismos valores reescribe la fila con los valores normalizados del formulario (p. ej. descripción NULL → «»):
  // eso queda fuera del alcance protegido. Todo lo demás (calendario, reportes, evidencias, eventos, vínculos) permanece idéntico.
  const despuesIgual = await huella();
  assert.deepEqual({ ...despuesIgual, proyectos: undefined }, { ...antes, proyectos: undefined }, "reenviar los mismos valores no cambia nada más");
  const fIgual = await fila(p);
  assert.deepEqual([fIgual.inicio, Number(fIgual.semanas), fIgual.programa_id], [INICIO, 16, ctx.prog1]);
  // Campos fuera del alcance protegido: título, descripción, estado, fecha de fin estimada, horas y tipo.
  const seguro = await put(p, { titulo: `${M} Con enviado (renombrada)`, descripcion: "texto", estado: "suspendido", fechaFin: sumarDias(INICIO, 200), horasTotales: 120 });
  assert.equal(seguro.status, 200, JSON.stringify(seguro.data));
  const f = await fila(p);
  assert.equal(f.titulo, `${M} Con enviado (renombrada)`);
  assert.equal(f.estado, "suspendido");
  assert.equal(Number(f.horas_totales), 120);
  assert.equal(f.inicio, INICIO);
  assert.equal(Number(f.semanas), 16);
  assert.equal(f.programa_id, ctx.prog1);
  assert.deepEqual((await semanasDe(p)).map((s) => s.fi), Array.from({ length: 16 }, (_, i) => sumarDias(INICIO, i * 7)), "el calendario no se tocó");
  await put(p, { titulo: `${M} Con enviado`, estado: "en_ejecucion", horasTotales: "" }); // se restablece
});

// ───────────────────────── 5. Sin históricos ─────────────────────────
test("5. Editar una iniciativa sin históricos (fecha, semanas y programa) sigue funcionando", { skip }, async () => {
  const p = await mkProyecto("Sin historia", ctx.u.C);
  assert.equal((await hist.historicoDeProyecto(pool, p)).total, 0, "el cronograma vacío no es historia");
  const nueva = sumarDias(INICIO, 7);
  const r = await put(p, { fechaInicio: nueva, semanas: 12, programaId: ctx.prog2 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const f = await fila(p);
  assert.equal(f.inicio, nueva);
  assert.equal(Number(f.semanas), 12);
  assert.equal(f.programa_id, ctx.prog2);
  const semanas = await semanasDe(p);
  assert.equal(semanas.length, 12, "se retiraron las semanas sobrantes (sin avance)");
  assert.deepEqual(semanas.map((s) => s.fi), Array.from({ length: 12 }, (_, i) => sumarDias(nueva, i * 7)));
  const mas = await put(p, { semanas: 18 });
  assert.equal(mas.status, 200);
  assert.equal((await semanasDe(p)).length, 18);
  ctx.p.libre = p;
});

// ───────────────────────── Transversales ─────────────────────────
test("6. Entregables transversales: el reporte sigue funcionando y la iniciativa de soporte queda protegida", { skip }, async () => {
  const pt = await mkProyecto("Soporte transversal", ctx.u.C);
  ctx.p.trans = pt;
  // C tiene como iniciativa (además de «Sin historia») la de soporte; el reporte transversal usa la primera iniciativa asignada.
  await q(`DELETE FROM proyectos WHERE id = $1`, [ctx.p.libre]);
  const t1 = await mkPlantilla("Presupuesto semestral", { categoria: "Gestión", fase: "Gestión" });
  const r1 = await reportar(ctx.u.C, t1, null);
  const fila1 = (await q(`SELECT pe.transversal, ps.proyecto_id FROM proyecto_entregables pe JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id WHERE pe.id = $1`, [r1.entregable_id]))[0];
  assert.equal(fila1.transversal, true, "es un reporte transversal");
  assert.equal(fila1.proyecto_id, pt, "usa la iniciativa de soporte");
  // La iniciativa de soporte con reporte transversal está protegida como cualquier otra...
  await rechazada(pt, ctx.u.C, async () => put(pt, { fechaInicio: sumarDias(INICIO, 7) }));
  await rechazada(pt, ctx.u.C, async () => put(pt, { programaId: ctx.prog2 }));
  // ...y tras el rechazo el flujo de reporte transversal sigue funcionando (incluida una segunda entrega).
  const t2 = await mkPlantilla("Capacitación general de gestión", { categoria: "Gestión", fase: "Gestión" });
  const r2 = await reportar(ctx.u.C, t2, null);
  assert.equal((await q(`SELECT transversal FROM proyecto_entregables WHERE id = $1`, [r2.entregable_id]))[0].transversal, true);
  // Un docente SIN iniciativa sigue recibiendo el error propio del modelo (no se impone ninguna regla nueva).
  const sin = (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, grupo_matriz_id)
     VALUES ($1, 'Prueba', $2, 'docente', $3, 'activo', 'ANTIGUO', $4) RETURNING id`,
    [`${M}_Sin`, `${M}.Sin@test.local`, ctx.prog1, ctx.g1]
  ))[0];
  const t3 = await mkPlantilla("Informe general", { categoria: "Gestión", fase: "Gestión" });
  await assert.rejects(() => reportar({ id: sin.id }, t3, null), (e) => e?.codigo === "SIN_INICIATIVA" || e?.status === 422);
});

// ───────────────────────── 6. Concurrencia ─────────────────────────
const RETRASOS = [0, 4, 10, 18, 28, 40, 60, 90, 130, 180]; // ms de espera del reporte: cubre ambos órdenes de llegada
const consistente = async (p) => {
  const f = await fila(p);
  const semanas = await semanasDe(p);
  assert.equal(semanas.length, Number(f.semanas), "una semana por cada semana de la iniciativa");
  assert.deepEqual(semanas.map((s) => s.fi), Array.from({ length: Number(f.semanas) }, (_, i) => sumarDias(f.inicio, i * 7)), "calendario coherente con la fecha de inicio");
  return f;
};
for (const [nombre, cambio] of [
  ["fecha de inicio", () => ({ fechaInicio: sumarDias(INICIO, 7) })],
  ["número de semanas", () => ({ semanas: 18 })],
  ["programa", () => ({ programaId: ctx.prog2 })],
  ["calendario y programa a la vez", () => ({ fechaInicio: sumarDias(INICIO, 14), semanas: 14, programaId: ctx.prog2 })],
]) {
  test(`7. Carrera: un reporte nuevo mientras se cambia ${nombre}; nunca queda un reporte con otro calendario o programa`, { skip }, async () => {
    const resultados = { cambiado: 0, protegido: 0 };
    for (let i = 0; i < RETRASOS.length; i += 1) {
      const p = await mkProyecto(`Carrera ${nombre} ${i}`, ctx.u.A);
      const plantilla = await mkPlantilla("carrera");
      const [r, rep] = await Promise.all([
        put(p, cambio()),
        esperar(RETRASOS[i]).then(() => reportar(ctx.u.A, plantilla, p)).then((x) => ({ ok: true, x }), (error) => ({ ok: false, error })),
      ]);
      const f = await consistente(p);
      assert.equal(rep.ok, true, `el reporte del responsable nunca se pierde: ${rep.error?.message ?? ""}`);
      assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_entregables pe JOIN proyecto_semanas s ON s.id = pe.proyecto_semana_id WHERE s.proyecto_id = $1 AND pe.plantilla_id = $2`, [p, plantilla]))[0].n, 1);
      if (r.status === 200) {
        resultados.cambiado += 1;
        assert.notDeepEqual([f.inicio, Number(f.semanas), f.programa_id], [INICIO, 16, ctx.prog1]);
      } else {
        esHistorico(r);
        resultados.protegido += 1;
        assert.deepEqual([f.inicio, Number(f.semanas), f.programa_id], [INICIO, 16, ctx.prog1], "rechazada: sin cambios");
      }
    }
    console.log(`   (${nombre}: ${JSON.stringify(resultados)})`);
  });
}

test("7e. Determinista: con un reporte en curso (transacción abierta) la modificación espera y después se rechaza", { skip }, async () => {
  for (const [nombre, extra] of [["fecha", () => ({ fechaInicio: sumarDias(INICIO, 7) })], ["semanas", () => ({ semanas: 18 })], ["programa", () => ({ programaId: ctx.prog2 })]]) {
    const p = await mkProyecto(`En curso ${nombre}`, ctx.u.A);
    const plantilla = await mkPlantilla("en curso");
    const cliente = await pool.connect();
    try {
      // Equivale al comienzo de registrarDesdeMatriz: bloquea al docente y crea su reporte sin confirmar todavía.
      await cliente.query("BEGIN");
      await cliente.query("SELECT id FROM usuarios WHERE id = $1 FOR UPDATE", [ctx.u.A.id]);
      const semana = (await cliente.query("SELECT id FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = 1", [p])).rows[0].id;
      await cliente.query(
        `INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, completado, estado_revision) VALUES ($1, $2, $3, 'en curso', false, 'borrador')`,
        [semana, plantilla, ctx.u.A.id]
      );
      let terminada = false;
      const pendiente = put(p, extra()).then((r) => { terminada = true; return r; });
      await esperar(400);
      assert.equal(terminada, false, `${nombre}: debe esperar a que el reporte en curso termine`);
      await cliente.query("COMMIT");
      esHistorico(await pendiente);
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
      cliente.release();
    }
    const f = await consistente(p);
    assert.deepEqual([f.inicio, Number(f.semanas), f.programa_id], [INICIO, 16, ctx.prog1]);
  }
});

test("7f. Determinista: mientras el administrador comprueba y escribe, un reporte espera y luego se registra (sin interbloqueo)", { skip }, async () => {
  const p = await mkProyecto("Admin primero", ctx.u.A);
  const plantilla = await mkPlantilla("admin primero");
  const admin = await pool.connect();
  try {
    await admin.query("BEGIN");
    await admin.query("SELECT id FROM proyectos WHERE id = $1 FOR NO KEY UPDATE", [p]);
    await hist.bloquearHistoriaDeProyecto(admin, p); // mismo orden y mismos bloqueos que usa el PUT
    assert.equal((await hist.historicoDeProyecto(admin, p)).total, 0);
    let terminada = false;
    const pendiente = reportar(ctx.u.A, plantilla, p).then((x) => { terminada = true; return x; });
    await esperar(400);
    assert.equal(terminada, false, "el reporte espera al administrador");
    await admin.query("UPDATE proyectos SET semanas = semanas WHERE id = $1", [p]);
    await admin.query("COMMIT");
    const rep = await pendiente;
    assert.equal(rep.ok, true);
  } finally {
    await admin.query("ROLLBACK").catch(() => {});
    admin.release();
  }
});

test("7g. Dos modificaciones simultáneas de una iniciativa sin historia terminan en un estado coherente", { skip }, async () => {
  const p = await mkProyecto("Doble edición", ctx.u.B);
  const [a, b] = await Promise.all([put(p, { semanas: 10, fechaInicio: sumarDias(INICIO, 7) }), put(p, { semanas: 20, programaId: ctx.prog2 })]);
  assert.ok([a.status, b.status].every((s) => s === 200), `${a.status}/${b.status}: ${JSON.stringify([a.data, b.data]).slice(0, 200)}`);
  await consistente(p);
});

// ───────────────────────── 8. Integridad final ─────────────────────────
test("8. Integridad: fechas, semanas y programa de las iniciativas con reportes intactos; relaciones históricas completas", { skip }, async () => {
  for (const [p] of ctx.proyectosConReportes) {
    const f = await fila(p);
    assert.deepEqual([f.inicio, Number(f.semanas), f.programa_id], [INICIO, 16, ctx.prog1]);
    assert.deepEqual((await semanasDe(p)).map((s) => s.fi), Array.from({ length: 16 }, (_, i) => sumarDias(INICIO, i * 7)));
  }
  const [r] = await q(
    `SELECT
       (SELECT COUNT(*) FROM proyecto_entregables pe WHERE pe.plantilla_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proyecto_semanas s JOIN proyectos p ON p.id = s.proyecto_id WHERE s.id = pe.proyecto_semana_id))::int AS reportes_sin_iniciativa,
       (SELECT COUNT(*) FROM entregable_evidencias v WHERE NOT EXISTS (SELECT 1 FROM proyecto_entregables pe WHERE pe.id = v.entregable_id))::int AS evidencias_sin_entregable,
       (SELECT COUNT(*) FROM entregable_eventos ev WHERE ev.entregable_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proyecto_entregables pe WHERE pe.id = ev.entregable_id))::int AS eventos_sin_entregable`
  );
  assert.deepEqual(r, { reportes_sin_iniciativa: 0, evidencias_sin_entregable: 0, eventos_sin_entregable: 0 });
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.ent.env]))[0].estado_revision, "enviado");
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.ent.bor]))[0].estado_revision, "borrador");
});
