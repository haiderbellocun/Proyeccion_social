// Bloque 1.1: CIERRE DE VÍAS DE ELUSIÓN HISTÓRICA. Pruebas de integración contra PostgreSQL REAL, solo en `proysocial_test`.
//
// Cubre las cuatro vías que quedaron abiertas en el Bloque 1: eliminar iniciativas con reportes (incluido `forzar`), cambiar las
// fechas de un semestre con reportes, quitar colaboradores con participación histórica y cambiar el responsable de una iniciativa
// con reportes. Mismas garantías de seguridad que historicos.integration.test.js: solo corren con PGDATABASE=proysocial_test
// exacto, servidor local, sin DATABASE_URL y con current_database() verificado; en cualquier otro caso se OMITEN.
//   npm run test:db:setup
//   npm run test:integration:protegidos
//
// Datos sintéticos (prefijo TST_I, semestres 2094A/2094B) que se eliminan al final. En cada rechazo se compara el estado completo
// de las tablas involucradas antes y después: una operación rechazada no puede dejar escrituras parciales.
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

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4312;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_I";
const S1 = "2094A"; // con reportes
const S2 = "2094B"; // solo configuración
const DRIVE = "https://drive.google.com/file/d/TST-I-EVIDENCIA/view";
const ctx = { tpl: {}, g: {}, u: {}, p: {} };
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

const TABLAS = [
  ["usuarios", "id"], ["semestres", "codigo"], ["grupos_matriz", "id"], ["plantilla_entregables", "id"], ["proyectos", "id"],
  ["proyecto_semanas", "id"], ["proyecto_entregables", "id"], ["proyecto_docentes", "proyecto_id, docente_id"], ["entregable_evidencias", "id"],
  ["entregable_eventos", "id"], ["docente_entregable_excepciones", "id"], ["importaciones_matriz", "id"],
];
/** Huella de todo lo que estas operaciones podrían tocar: filas y contenido (md5) por tabla. */
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
    await new Promise((r) => setTimeout(r, 150));
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
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[S1, S2]]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

const hoy = hoyBogota();
async function mkProyecto(titulo, responsable, colaboradores = []) {
  const p = (await q(
    `INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`,
    [`${M} ${titulo}`, ctx.prog, responsable.id, sumarDias(hoy, -21)]
  ))[0].id;
  for (let n = 1; n <= 16; n += 1) {
    await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(hoy, -21 + (n - 1) * 7), sumarDias(hoy, -21 + (n - 1) * 7 + 6)]);
    await q(`INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas) SELECT id, 'Entregable programado', 2 FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = $2`, [p, n]);
  }
  for (const c of colaboradores) await q(`INSERT INTO proyecto_docentes (proyecto_id, docente_id, rol) VALUES ($1, $2, 'colaborador')`, [p, c.id]);
  return p;
}
let seq = 0;
/** Plantilla nueva en g1 (el índice único docente+plantilla exige una distinta por reporte). */
async function mkPlantilla(texto) {
  seq += 1;
  return (await q(
    `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
     VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Octubre', $3, $4, 'Cargar soporte', 2, 0, 4) RETURNING id`,
    [ctx.g.g1, 100 + seq, (seq % 14) + 1, `${M} ${texto} ${seq}`]
  ))[0].id;
}
const reportar = (docente, plantilla, proyecto, completado = true) =>
  wf.registrarDesdeMatriz(pool, { docenteId: docente.id, plantillaId: plantilla, completado, proyectoId: proyecto, datos: completado ? { url_evidencia: [DRIVE] } : {} });

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  await cleanup();

  for (const [codigo, desde] of [[S1, -21], [S2, 200]]) {
    await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, false)`, [codigo, sumarDias(hoy, desde), sumarDias(hoy, desde + 16 * 7 - 1)]);
  }
  ctx.prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`]))[0].id;
  const mkGrupo = async (clave, nombre, semestre) => {
    ctx.g[clave] = (await q(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ($1, 'sintético', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`,
      [`${M} ${nombre}`, semestre]
    ))[0].id;
  };
  await mkGrupo("g1", "G1", S1);
  await mkGrupo("gs2", "GS2 solo configuración", S2);
  await q(
    `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
     VALUES ($1, 1, 'Proyecto', 'Proyecto', 'Octubre', 1, $2, 'Cargar soporte', 2, 0, 4)`,
    [ctx.g.gs2, `${M} S2`]
  );

  const mkUser = async (nombre, rol) =>
    (await q(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, grupo_matriz_id)
       VALUES ($1, 'Prueba', $2, $3, $4, 'activo', $5, $6) RETURNING id, nombre, apellido, correo, rol`,
      [`${M}_${nombre}`, `${M}.${nombre}@test.local`, rol, ctx.prog, rol === "docente" ? "ANTIGUO" : null, rol === "docente" ? ctx.g.g1 : null]
    ))[0];
  ctx.u.admin = await mkUser("Admin", "admin");
  for (const n of ["A", "B", "C", "D", "E"]) ctx.u[n] = await mkUser(n, "docente");
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
              (SELECT COUNT(*) FROM semestres WHERE codigo = ANY($3::text[]))::int s, (SELECT COUNT(*) FROM proyectos WHERE titulo LIKE $2)::int p`,
      [`${M}.%`, `${M}%`, [S1, S2]]
    ))[0];
    assert.deepEqual(quedan, { u: 0, g: 0, s: 0, p: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

const esHistorico = (r) => {
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.codigo, "HISTORICO_PROTEGIDO");
  assert.ok(typeof r.data.error === "string" && r.data.error.length > 10, "mensaje claro para el frontend");
  assert.equal(r.data.requiere_confirmacion, undefined, "no se ofrece confirmación forzada");
  assert.ok(r.data.resumen && r.data.resumen.total > 0, "incluye el resumen de lo que depende del registro");
  assert.ok(r.data.alternativa, "propone qué hacer");
};
/** Ejecuta la operación, exige el 409 estándar y verifica que NADA cambió (ni vínculos, ni evidencias, ni eventos). */
async function rechazada(operacion) {
  const antes = await huella();
  const r = await operacion();
  esHistorico(r);
  await sinCambios(antes);
  return r;
}
const estados = async () => q(`SELECT id, estado_revision, docente_id, plantilla_id, num_envios FROM proyecto_entregables WHERE plantilla_id IS NOT NULL ORDER BY id`);
const sinHuerfanos = async () => {
  const [r] = await q(
    `SELECT
       (SELECT COUNT(*) FROM proyecto_entregables pe WHERE pe.plantilla_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proyecto_semanas s JOIN proyectos p ON p.id = s.proyecto_id WHERE s.id = pe.proyecto_semana_id))::int AS reportes_sin_iniciativa,
       (SELECT COUNT(*) FROM entregable_evidencias v WHERE NOT EXISTS (SELECT 1 FROM proyecto_entregables pe WHERE pe.id = v.entregable_id))::int AS evidencias_sin_entregable,
       (SELECT COUNT(*) FROM entregable_eventos ev WHERE ev.entregable_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proyecto_entregables pe WHERE pe.id = ev.entregable_id))::int AS eventos_sin_entregable`
  );
  return r;
};

// ───────────────────────── 1–4. Eliminación de iniciativas ─────────────────────────
test("1. Eliminar con borrador, incluso con forzar (y variantes), se rechaza sin tocar nada", { skip }, async () => {
  ctx.p.bor = await mkProyecto("Con borrador", ctx.u.A);
  ctx.ent = {};
  ctx.ent.bor = (await reportar(ctx.u.A, await mkPlantilla("borrador"), ctx.p.bor, false)).entregable_id;
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.ent.bor]))[0].estado_revision, "borrador");
  for (const sufijo of ["", "?forzar=true", "?forzar=1", "?forzar=TRUE&force=true&confirmar=true", "?forzar_cronograma=true"]) {
    await rechazada(() => api(`/admin/proyectos/${ctx.p.bor}${sufijo}`, { method: "DELETE" }));
  }
});

test("2. Eliminar con reporte enviado (con evidencia), incluso con forzar, se rechaza", { skip }, async () => {
  ctx.p.env = await mkProyecto("Con enviado", ctx.u.A);
  ctx.ent.env = (await reportar(ctx.u.A, await mkPlantilla("enviado"), ctx.p.env)).entregable_id;
  assert.equal((await q(`SELECT estado_revision FROM proyecto_entregables WHERE id = $1`, [ctx.ent.env]))[0].estado_revision, "enviado");
  assert.ok((await q(`SELECT COUNT(*)::int n FROM entregable_evidencias WHERE entregable_id = $1`, [ctx.ent.env]))[0].n > 0);
  const r = await rechazada(() => api(`/admin/proyectos/${ctx.p.env}?forzar=true`, { method: "DELETE" }));
  assert.ok(r.data.resumen.evidencias > 0 && r.data.resumen.eventos > 0);
  await rechazada(() => api(`/admin/proyectos/${ctx.p.env}`, { method: "DELETE" }));
});

test("3. Eliminar con reporte aprobado, o observado, se rechaza (con y sin forzar)", { skip }, async () => {
  ctx.p.apr = await mkProyecto("Con aprobado", ctx.u.A);
  const a = await reportar(ctx.u.A, await mkPlantilla("aprobado"), ctx.p.apr);
  await wf.aplicarRevisionAdmin(pool, { entregableId: a.entregable_id, estadoNuevo: "aprobado", actorId: ctx.u.admin.id });
  ctx.p.obs = await mkProyecto("Con observado", ctx.u.A);
  const o = await reportar(ctx.u.A, await mkPlantilla("observado"), ctx.p.obs);
  await wf.aplicarRevisionAdmin(pool, { entregableId: o.entregable_id, estadoNuevo: "observado", actorId: ctx.u.admin.id, comentario: "ajustar" });
  for (const p of [ctx.p.apr, ctx.p.obs]) {
    await rechazada(() => api(`/admin/proyectos/${p}`, { method: "DELETE" }));
    await rechazada(() => api(`/admin/proyectos/${p}?forzar=true`, { method: "DELETE" }));
  }
});

test("4. Eliminar una iniciativa sin dependencias protegidas sigue funcionando", { skip }, async () => {
  ctx.p.vacio = await mkProyecto("Sin reportes", ctx.u.D, [ctx.u.C]);
  const antes = await huella();
  const r = await api(`/admin/proyectos/${ctx.p.vacio}`, { method: "DELETE" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ok, true);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM proyectos WHERE id = $1`, [ctx.p.vacio]))[0].n, 0);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_semanas WHERE proyecto_id = $1`, [ctx.p.vacio]))[0].n, 0, "su cronograma vacío se elimina con ella");
  const despues = await huella();
  assert.notEqual(despues.proyectos, antes.proyectos);
  assert.equal(despues.entregable_evidencias, antes.entregable_evidencias, "las evidencias de otras iniciativas no se tocan");
  assert.equal(despues.entregable_eventos, antes.entregable_eventos);
  assert.equal(despues.usuarios, antes.usuarios, "el docente y el colaborador siguen existiendo");
  assert.equal((await api(`/admin/proyectos/${ctx.p.vacio}`, { method: "DELETE" })).status, 404);
});

// ───────────────────────── 5–6. Calendario del semestre ─────────────────────────
const fechasDe = async (codigo) => (await q(`SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin, numero_semanas FROM semestres WHERE codigo = $1`, [codigo]))[0];

test("5. Cambiar fechas, semanas o código de un semestre con reportes se rechaza", { skip }, async () => {
  const s = await fechasDe(S1);
  const cuerpo = (extra) => ({ codigo: S1, fecha_inicio: s.fecha_inicio, fecha_fin: s.fecha_fin, numero_semanas: s.numero_semanas, ...extra });
  const mover = (dias) => sumarDias(s.fecha_inicio, dias);
  for (const extra of [
    { fecha_inicio: mover(7) },
    { fecha_fin: mover(200) },
    { numero_semanas: 20 },
    { fecha_inicio: mover(3), fecha_fin: mover(150), numero_semanas: 18 },
    { codigo: "2093B" },
  ]) {
    const r = await rechazada(() => api(`/admin/semestres/${S1}`, { method: "PUT", body: cuerpo(extra) }));
    assert.match(r.data.error, /calendario/);
  }
  assert.deepEqual(await fechasDe(S1), s, "las fechas históricas no cambian");
  // Reenviar exactamente los mismos valores es una operación nula (no reinterpreta nada).
  const antes = await huella();
  const igual = await api(`/admin/semestres/${S1}`, { method: "PUT", body: cuerpo({}) });
  assert.equal(igual.status, 200, JSON.stringify(igual.data));
  await sinCambios(antes);
});

test("6. Editar un semestre sin históricos (fechas, semanas y código) sigue permitido", { skip }, async () => {
  const s = await fechasDe(S2);
  const nuevoInicio = sumarDias(s.fecha_inicio, 7);
  const nuevoFin = sumarDias(s.fecha_fin, 7);
  const r = await api(`/admin/semestres/${S2}`, { method: "PUT", body: { codigo: S2, fecha_inicio: nuevoInicio, fecha_fin: nuevoFin, numero_semanas: 15 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(await fechasDe(S2), { fecha_inicio: nuevoInicio, fecha_fin: nuevoFin, numero_semanas: 15 });
  // Validación fallida: sin cambios parciales.
  const antes = await huella();
  const mala = await api(`/admin/semestres/${S2}`, { method: "PUT", body: { codigo: S2, fecha_inicio: nuevoFin, fecha_fin: nuevoInicio, numero_semanas: 15 } });
  assert.equal(mala.status, 400);
  await sinCambios(antes);
  // Un grupo con plantillas sin ningún reporte tampoco bloquea el cambio.
  const otra = await api(`/admin/semestres/${S2}`, { method: "PUT", body: { codigo: S2, fecha_inicio: s.fecha_inicio, fecha_fin: s.fecha_fin, numero_semanas: 16 } });
  assert.equal(otra.status, 200);
});

// ───────────────────────── 7–8. Colaboradores ─────────────────────────
test("7. Retirar un colaborador con reportes se rechaza y no deja escrituras parciales", { skip }, async () => {
  ctx.p.colab = await mkProyecto("Con colaboradores", ctx.u.D, [ctx.u.B, ctx.u.C]);
  ctx.ent.colab = (await reportar(ctx.u.B, await mkPlantilla("colaborador"), ctx.p.colab)).entregable_id;
  const ids = async () => (await q(`SELECT docente_id FROM proyecto_docentes WHERE proyecto_id = $1 ORDER BY docente_id`, [ctx.p.colab])).map((r) => r.docente_id);
  const iniciales = await ids();
  assert.deepEqual(iniciales, [ctx.u.B.id, ctx.u.C.id].sort((a, b) => a - b));
  // Quitar a B (con reporte) conservando a C; quitarlos a ambos; lista vacía; y la variante docenteIds.
  const r = await rechazada(() => api(`/admin/proyectos/${ctx.p.colab}/docentes`, { method: "PUT", body: { docentes: [{ id: ctx.u.C.id }] } }));
  assert.ok(r.data.resumen.colaboradores.some((c) => c.docente_id === ctx.u.B.id));
  await rechazada(() => api(`/admin/proyectos/${ctx.p.colab}/docentes`, { method: "PUT", body: { docentes: [] } }));
  await rechazada(() => api(`/admin/proyectos/${ctx.p.colab}/docentes`, { method: "PUT", body: { docenteIds: [ctx.u.E.id] } }));
  assert.deepEqual(await ids(), iniciales, "la participación histórica se conserva");
  assert.equal((await q(`SELECT docente_id FROM proyecto_entregables WHERE id = $1`, [ctx.ent.colab]))[0].docente_id, ctx.u.B.id);
});

test("8. Retirar un colaborador sin reportes, y reenviar la lista, siguen funcionando", { skip }, async () => {
  const antes = await huella();
  // Quita a C (sin participación) y conserva a B: permitido; el reporte de B no se toca.
  const r = await api(`/admin/proyectos/${ctx.p.colab}/docentes`, { method: "PUT", body: { docentes: [{ id: ctx.u.B.id }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ids = (await q(`SELECT docente_id FROM proyecto_docentes WHERE proyecto_id = $1`, [ctx.p.colab])).map((x) => x.docente_id);
  assert.deepEqual(ids, [ctx.u.B.id]);
  const despues = await huella();
  assert.equal(despues.proyecto_entregables, antes.proyecto_entregables);
  assert.equal(despues.entregable_evidencias, antes.entregable_evidencias);
  assert.equal(despues.entregable_eventos, antes.entregable_eventos);
  // Reenviar la misma lista y añadir colaboradores nuevos también funciona.
  const mas = await api(`/admin/proyectos/${ctx.p.colab}/docentes`, { method: "PUT", body: { docentes: [{ id: ctx.u.B.id }, { id: ctx.u.C.id }, { id: ctx.u.E.id }] } });
  assert.equal(mas.status, 200, JSON.stringify(mas.data));
  assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_docentes WHERE proyecto_id = $1`, [ctx.p.colab]))[0].n, 3);
});

// ───────────────────────── 9–10. Responsable ─────────────────────────
test("9. Cambiar el responsable de una iniciativa con reportes se rechaza", { skip }, async () => {
  const antes = await q(`SELECT id, docente_responsable_id FROM proyectos WHERE id = ANY($1::int[]) ORDER BY id`, [[ctx.p.env, ctx.p.bor, ctx.p.apr, ctx.p.colab]]);
  for (const p of [ctx.p.bor, ctx.p.env, ctx.p.apr]) {
    await rechazada(() => api(`/admin/proyectos/${p}`, { method: "PUT", body: { docenteId: ctx.u.E.id } }));
  }
  // También cuando el reporte es de un colaborador: la atribución depende del responsable.
  await rechazada(() => api(`/admin/proyectos/${ctx.p.colab}`, { method: "PUT", body: { docenteId: ctx.u.E.id, titulo: `${M} Con colaboradores` } }));
  assert.deepEqual(await q(`SELECT id, docente_responsable_id FROM proyectos WHERE id = ANY($1::int[]) ORDER BY id`, [[ctx.p.env, ctx.p.bor, ctx.p.apr, ctx.p.colab]]), antes);
});

test("10. Cambio legítimo de responsable (sin históricos) y edición segura con reportes", { skip }, async () => {
  ctx.p.libre = await mkProyecto("Sin historia", ctx.u.D);
  const r = await api(`/admin/proyectos/${ctx.p.libre}`, { method: "PUT", body: { docenteId: ctx.u.E.id } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await q(`SELECT docente_responsable_id FROM proyectos WHERE id = $1`, [ctx.p.libre]))[0].docente_responsable_id, ctx.u.E.id);
  // Con reportes, editar sin cambiar la atribución (título, descripción, mismo responsable) sí se permite.
  const seguro = await api(`/admin/proyectos/${ctx.p.env}`, { method: "PUT", body: { titulo: `${M} Con enviado (renombrada)`, docenteId: ctx.u.A.id, descripcion: "texto" } });
  assert.equal(seguro.status, 200, JSON.stringify(seguro.data));
  assert.equal((await q(`SELECT docente_responsable_id FROM proyectos WHERE id = $1`, [ctx.p.env]))[0].docente_responsable_id, ctx.u.A.id);
});

// ───────────────────────── 11. Concurrencia ─────────────────────────
const RETRASOS = [0, 4, 10, 18, 28, 40, 60, 90, 130, 180]; // ms de espera del reporte: cubre ambos órdenes de llegada
const RONDAS = RETRASOS.length;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
test("11a. Eliminar la iniciativa mientras se carga un reporte nunca deja un reporte perdido", { skip }, async () => {
  const resultados = { eliminada: 0, protegida: 0 };
  for (let i = 0; i < RONDAS; i += 1) {
    const p = await mkProyecto(`Carrera eliminar ${i}`, ctx.u.A);
    const plantilla = await mkPlantilla("carrera eliminar");
    const [del, rep] = await Promise.all([
      api(`/admin/proyectos/${p}?forzar=true`, { method: "DELETE" }),
      esperar(RETRASOS[i]).then(() => reportar(ctx.u.A, plantilla, p)).then((x) => ({ ok: true, x }), (error) => ({ ok: false, error })),
    ]);
    const existe = (await q(`SELECT COUNT(*)::int n FROM proyectos WHERE id = $1`, [p]))[0].n === 1;
    const reporte = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables pe JOIN proyecto_semanas s ON s.id = pe.proyecto_semana_id WHERE s.proyecto_id = $1 AND pe.plantilla_id = $2`, [p, plantilla]))[0].n;
    if (del.status === 200) {
      resultados.eliminada += 1;
      assert.equal(rep.ok, false, "si la iniciativa se eliminó, el reporte no pudo confirmarse");
      assert.equal(existe, false);
    } else {
      esHistorico(del);
      resultados.protegida += 1;
      assert.equal(existe, true, "protegida: la iniciativa sigue existiendo");
      assert.equal(rep.ok, true);
      assert.equal(reporte, 1, "y su reporte se conserva");
    }
  }
  assert.deepEqual(await sinHuerfanos(), { reportes_sin_iniciativa: 0, evidencias_sin_entregable: 0, eventos_sin_entregable: 0 });
  console.log(`   (carrera eliminar vs reportar: ${JSON.stringify(resultados)})`);
});

test("11b. Retirar al colaborador mientras reporta nunca deja su reporte sin vínculo", { skip }, async () => {
  const resultados = { retirado: 0, protegido: 0 };
  for (let i = 0; i < RONDAS; i += 1) {
    const p = await mkProyecto(`Carrera colaborador ${i}`, ctx.u.D, [ctx.u.B]);
    const plantilla = await mkPlantilla("carrera colaborador");
    const [put, rep] = await Promise.all([
      api(`/admin/proyectos/${p}/docentes`, { method: "PUT", body: { docentes: [] } }),
      esperar(RETRASOS[i]).then(() => reportar(ctx.u.B, plantilla, p)).then((x) => ({ ok: true, x }), (error) => ({ ok: false, error })),
    ]);
    const sigue = (await q(`SELECT COUNT(*)::int n FROM proyecto_docentes WHERE proyecto_id = $1 AND docente_id = $2`, [p, ctx.u.B.id]))[0].n === 1;
    const reporte = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables pe JOIN proyecto_semanas s ON s.id = pe.proyecto_semana_id WHERE s.proyecto_id = $1 AND pe.docente_id = $2`, [p, ctx.u.B.id]))[0].n;
    if (put.status === 200) {
      resultados.retirado += 1;
      assert.equal(sigue, false);
      assert.equal(reporte, 0, "si se retiró, no quedó ningún reporte suyo en la iniciativa");
    } else {
      esHistorico(put);
      resultados.protegido += 1;
      assert.equal(sigue, true);
      assert.equal(reporte, 1);
    }
    void rep;
  }
  assert.deepEqual(await sinHuerfanos(), { reportes_sin_iniciativa: 0, evidencias_sin_entregable: 0, eventos_sin_entregable: 0 });
  console.log(`   (carrera retirar colaborador vs reportar: ${JSON.stringify(resultados)})`);
});

test("11c. Cambiar el responsable mientras se reporta nunca reatribuye un reporte", { skip }, async () => {
  const resultados = { cambiado: 0, protegido: 0 };
  for (let i = 0; i < RONDAS; i += 1) {
    const p = await mkProyecto(`Carrera responsable ${i}`, ctx.u.A);
    const plantilla = await mkPlantilla("carrera responsable");
    const [put, rep] = await Promise.all([
      api(`/admin/proyectos/${p}`, { method: "PUT", body: { docenteId: ctx.u.E.id } }),
      esperar(RETRASOS[i]).then(() => reportar(ctx.u.A, plantilla, p)).then((x) => ({ ok: true, x }), (error) => ({ ok: false, error })),
    ]);
    const resp = (await q(`SELECT docente_responsable_id FROM proyectos WHERE id = $1`, [p]))[0].docente_responsable_id;
    const reporte = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables pe JOIN proyecto_semanas s ON s.id = pe.proyecto_semana_id WHERE s.proyecto_id = $1 AND pe.plantilla_id = $2`, [p, plantilla]))[0].n;
    if (put.status === 200) {
      resultados.cambiado += 1;
      assert.equal(resp, ctx.u.E.id);
      // El reporte se registró antes del cambio solo si el cambio llegó a ver la historia; no es posible: sería 409.
      assert.equal(reporte === 1 && rep.ok === true, false, "no puede haber un reporte confirmado bajo el responsable anterior tras el cambio");
    } else {
      esHistorico(put);
      resultados.protegido += 1;
      assert.equal(resp, ctx.u.A.id);
      assert.equal(reporte, 1);
    }
  }
  console.log(`   (carrera cambiar responsable vs reportar: ${JSON.stringify(resultados)})`);
});

test("11e. Con un reporte en curso (transacción abierta), cada operación espera y después se rechaza", { skip }, async () => {
  const casos = [
    ["eliminar", (p) => api(`/admin/proyectos/${p}?forzar=true`, { method: "DELETE" }), (p) => ({ proyecto: p })],
    ["retirar colaborador", (p) => api(`/admin/proyectos/${p}/docentes`, { method: "PUT", body: { docentes: [] } }), (p) => ({ proyecto: p })],
    ["cambiar responsable", (p) => api(`/admin/proyectos/${p}`, { method: "PUT", body: { docenteId: ctx.u.E.id } }), (p) => ({ proyecto: p })],
  ];
  for (const [nombre, operacion] of casos) {
    const p = await mkProyecto(`Reporte en curso ${nombre}`, ctx.u.A, [ctx.u.B]);
    const plantilla = await mkPlantilla("en curso");
    const cliente = await pool.connect();
    try {
      // Equivale al comienzo de registrarDesdeMatriz: bloquea al docente y crea su reporte sin confirmar todavía.
      await cliente.query("BEGIN");
      await cliente.query("SELECT id FROM usuarios WHERE id = $1 FOR UPDATE", [ctx.u.B.id]);
      const semana = (await cliente.query("SELECT id FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = 1", [p])).rows[0].id;
      await cliente.query(
        `INSERT INTO proyecto_entregables (proyecto_semana_id, plantilla_id, docente_id, descripcion, completado, estado_revision) VALUES ($1, $2, $3, 'en curso', false, 'borrador')`,
        [semana, plantilla, ctx.u.B.id]
      );
      let terminada = false;
      const pendiente = operacion(p).then((r) => { terminada = true; return r; });
      await esperar(400);
      assert.equal(terminada, false, `${nombre}: debe esperar a que el reporte en curso termine`);
      await cliente.query("COMMIT");
      const r = await pendiente;
      esHistorico(r);
    } finally {
      await cliente.query("ROLLBACK").catch(() => {});
      cliente.release();
    }
    assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_docentes WHERE proyecto_id = $1 AND docente_id = $2`, [p, ctx.u.B.id]))[0].n, 1, `${nombre}: el vínculo se conserva`);
    assert.equal((await q(`SELECT docente_responsable_id FROM proyectos WHERE id = $1`, [p]))[0].docente_responsable_id, ctx.u.A.id);
    assert.equal((await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE plantilla_id = $1 AND docente_id = $2`, [plantilla, ctx.u.B.id]))[0].n, 1, `${nombre}: el reporte se conserva`);
  }
});

test("11d. Dos eliminaciones simultáneas de la misma iniciativa vacía: una elimina y la otra recibe 404", { skip }, async () => {
  const p = await mkProyecto("Doble eliminación", ctx.u.D);
  const [a, b] = await Promise.all([api(`/admin/proyectos/${p}`, { method: "DELETE" }), api(`/admin/proyectos/${p}`, { method: "DELETE" })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 404]);
});

// ───────────────────────── 12. Integridad final ─────────────────────────
test("12. Integridad: ningún reporte sin iniciativa, ninguna evidencia sin su entregable, estados y atribución intactos", { skip }, async () => {
  assert.deepEqual(await sinHuerfanos(), { reportes_sin_iniciativa: 0, evidencias_sin_entregable: 0, eventos_sin_entregable: 0 });
  const e = await estados();
  const porId = Object.fromEntries(e.map((x) => [x.id, x]));
  assert.equal(porId[ctx.ent.bor].estado_revision, "borrador");
  assert.equal(porId[ctx.ent.env].estado_revision, "enviado");
  assert.equal(porId[ctx.ent.colab].docente_id, ctx.u.B.id);
  for (const id of Object.values(ctx.ent)) assert.equal(porId[id].docente_id != null, true, "el reporte conserva a su docente");
  // Las iniciativas con historia siguen existiendo y con su responsable original.
  const resp = Object.fromEntries((await q(`SELECT id, docente_responsable_id FROM proyectos WHERE id = ANY($1::int[])`, [[ctx.p.bor, ctx.p.env, ctx.p.apr, ctx.p.obs]])).map((r) => [r.id, r.docente_responsable_id]));
  for (const p of [ctx.p.bor, ctx.p.env, ctx.p.apr, ctx.p.obs]) assert.equal(resp[p], ctx.u.A.id);
  // El calendario del semestre con reportes no se modificó.
  const s = await fechasDe(S1);
  assert.equal(s.numero_semanas, 16);
  assert.equal(s.fecha_inicio, sumarDias(hoy, -21));
});
