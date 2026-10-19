// Bloque 1 del fortalecimiento: PROTECCIÓN DE HISTÓRICOS. Pruebas de integración contra PostgreSQL REAL, solo en `proysocial_test`.
//
// Estas pruebas intentan eliminar y modificar datos, por eso solo se ejecutan si:
//   - PGDATABASE es exactamente "proysocial_test", en el servidor local y sin DATABASE_URL ni Cloud SQL, y
//   - la base conectada (current_database()) es "proysocial_test".
// En cualquier otro caso (desarrollo, producción, variables ausentes) se OMITEN todas. Preparación:
//   npm run test:db:setup            (crea proysocial_test desde las migraciones; sin datos de otras bases)
//   npm run test:integration:protegidos
//
// Los datos son sintéticos (prefijo TST_H) y se eliminan al final. En cada rechazo se compara el estado completo de las tablas
// involucradas antes y después: una operación rechazada no puede dejar escrituras parciales.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purgarAsignaciones } from "./helpers/purgar-asignaciones.js";
import { conSemestreActivo } from "./helpers/semestre-activo.js";

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
const { alinearHistorial } = await import("./helpers/alinear-historial.js");
const { hoyBogota, sumarDias } = await import("../../src/services/matrizService.js");
const wf = await import("../../src/services/entregableWorkflowService.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4311;
const API = `http://127.0.0.1:${PORT}`;
const M = "TST_H";
const S1 = "2095A";
const S2 = "2095B";
const DRIVE = "https://drive.google.com/file/d/TST-H-EVIDENCIA/view";
const ctx = { tpl: {}, g: {}, u: {}, p: {} };
let server;
let tokens = {};

async function api(ruta, token, options = {}) {
  const response = await fetch(`${API}${ruta}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

/** Huella de todo lo que estas operaciones podrían tocar: filas y contenido (md5) por tabla. */
const TABLAS = [
  ["usuarios", "id"], ["semestres", "codigo"], ["grupos_matriz", "id"], ["plantilla_entregables", "id"], ["proyectos", "id"],
  ["proyecto_semanas", "id"], ["proyecto_entregables", "id"], ["entregable_evidencias", "id"], ["entregable_eventos", "id"],
  ["docente_entregable_excepciones", "id"], ["importaciones_matriz", "id"],
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
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("El servidor de prueba no inició");
}

async function cleanup() {
  const grupos = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  const usuarios = (await q(`SELECT id FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`])).map((r) => r.id);
  // El historial de asignaciones es inmutable y RESTRICT: se purga (solo en pruebas) antes de retirar fixtures.
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%`, semestre: S1 });
  await purgarAsignaciones(pool, { semestre: S2 });
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id = ANY($2::int[]) OR actor_id = ANY($2::int[])`, [grupos, usuarios]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id = ANY($1::int[])`, [usuarios]);
  await q(`DELETE FROM importaciones_matriz WHERE grupo_id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM notificaciones WHERE usuario_id = ANY($1::int[])`, [usuarios]).catch(() => {});
  await q(`DELETE FROM usuarios WHERE id = ANY($1::int[])`, [usuarios]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [grupos]);
  await q(`DELETE FROM actualizaciones_masivas_entregables WHERE semestre = ANY($1::text[])`, [[S1, S2]]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[S1, S2]]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  await cleanup();

  const hoy = hoyBogota();
  for (const [codigo, desde] of [[S1, -21], [S2, 200]]) {
    await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, false)`, [codigo, sumarDias(hoy, desde), sumarDias(hoy, desde + 16 * 7 - 1)]);
  }
  const prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`]))[0].id;
  ctx.prog = prog;

  const mkGrupo = async (clave, nombre, tipo, semestre, activo = true) => {
    ctx.g[clave] = (await q(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ($1, 'sintético', $2, 10, 1, 0, 0, 0, $3, $4) RETURNING id`,
      [`${M} ${nombre}`, tipo, activo, semestre]
    ))[0].id;
  };
  await mkGrupo("g1", "G1", "ANTIGUO", S1);
  await mkGrupo("g2", "G2", "ANTIGUO", S1);
  await mkGrupo("g3", "G3 nuevo", "NUEVO", S1);
  await mkGrupo("g4", "G4 vacío", "ANTIGUO", S1);
  await mkGrupo("g5", "G5 inactivo", "ANTIGUO", S1, false);
  await mkGrupo("gh", "GH historia", "ANTIGUO", S1);
  await mkGrupo("gs2", "GS2 solo configuración", "ANTIGUO", S2);

  const mkTpl = async (clave, grupo, semana, texto, ini, fin) => {
    ctx.tpl[clave] = (await q(
      `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
       VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Octubre', $3, $4, 'Cargar soporte', 2, $5, $6) RETURNING id`,
      [grupo, semana * 10 + 1, semana, `${M} ${texto}`, ini, fin]
    ))[0].id;
  };
  await mkTpl("a", ctx.g.g1, 1, "Entrega A", 0, 4); // aprobado (d1)
  await mkTpl("b", ctx.g.g1, 2, "Entrega B", 7, 11); // borrador (d1): historia en CUALQUIER estado
  await mkTpl("c", ctx.g.g1, 3, "Entrega C", 14, 18); // sin reportes
  await mkTpl("a2", ctx.g.g2, 1, "Entrega A", 0, 4); // mismo entregable que «a» en otro grupo del semestre (actualización masiva)
  await mkTpl("t3", ctx.g.g3, 1, "Entrega N", 0, 4);
  await mkTpl("e", ctx.g.g4, 1, "Entrega E", 0, 4);
  await mkTpl("h", ctx.g.gh, 1, "Entrega H", 0, 4); // enviado (dH)
  await mkTpl("s2", ctx.g.gs2, 1, "Entrega S2", 0, 4);

  const mkUser = async (nombre, rol, grupoId, tipo = "ANTIGUO") =>
    (await q(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, grupo_matriz_id)
       VALUES ($1, 'Prueba', $2, $3, $4, 'activo', $5, $6) RETURNING id, nombre, apellido, correo, rol`,
      [`${M}_${nombre}`, `${M}.${nombre}@test.local`, rol, prog, rol === "docente" ? tipo : null, grupoId]
    ))[0];
  ctx.u.adminA = await mkUser("AdminA", "admin", null);
  ctx.u.adminB = await mkUser("AdminB", "admin", null);
  ctx.u.d1 = await mkUser("D1", "docente", ctx.g.g1);
  ctx.u.d2 = await mkUser("D2", "docente", ctx.g.g2);
  ctx.u.dH = await mkUser("DH", "docente", ctx.g.gh);
  ctx.u.dLibre = await mkUser("DLibre", "docente", null);
  await alinearHistorial(pool);
  tokens = { adminA: createSessionToken(ctx.u.adminA), adminB: createSessionToken(ctx.u.adminB), d1: createSessionToken(ctx.u.d1) };

  const mkProyecto = async (titulo, docente) => {
    const p = (await q(
      `INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`,
      [`${M} ${titulo}`, prog, docente.id, sumarDias(hoy, -21)]
    ))[0].id;
    for (let n = 1; n <= 16; n += 1) {
      await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(hoy, -21 + (n - 1) * 7), sumarDias(hoy, -21 + (n - 1) * 7 + 6)]);
    }
    return p;
  };
  ctx.p.p1 = await mkProyecto("Proyecto 1 de D1", ctx.u.d1);
  ctx.p.p2 = await mkProyecto("Proyecto 2 de D1", ctx.u.d1);
  ctx.p.pH = await mkProyecto("Proyecto de DH", ctx.u.dH);

  // Historia real generada con el flujo del producto (envío, revisión, evidencias, eventos).
  const enviar = (docente, plantilla, proyecto, completado = true) =>
    wf.registrarDesdeMatriz(pool, { docenteId: docente.id, plantillaId: plantilla, completado, proyectoId: proyecto, datos: completado ? { url_evidencia: [DRIVE] } : {} });
  const a = await enviar(ctx.u.d1, ctx.tpl.a, ctx.p.p1);
  await wf.aplicarRevisionAdmin(pool, { entregableId: a.entregable_id, estadoNuevo: "aprobado", actorId: ctx.u.adminA.id });
  ctx.ent = { a: a.entregable_id };
  ctx.ent.b = (await enviar(ctx.u.d1, ctx.tpl.b, ctx.p.p1, false)).entregable_id;
  ctx.ent.h = (await enviar(ctx.u.dH, ctx.tpl.h, ctx.p.pH)).entregable_id;

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
    const quedan = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g, (SELECT COUNT(*) FROM semestres WHERE codigo = ANY($3::text[]))::int s`, [`${M}.%`, `${M}%`, [S1, S2]]))[0];
    assert.deepEqual(quedan, { u: 0, g: 0, s: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

const esHistorico = (r) => {
  assert.equal(r.status, 409, JSON.stringify(r.data));
  assert.equal(r.data.codigo, "HISTORICO_PROTEGIDO");
  assert.ok(typeof r.data.error === "string" && r.data.error.length > 10, "mensaje claro para el frontend");
  assert.equal(r.data.requiere_confirmacion, undefined, "no se ofrece confirmación forzada");
  assert.ok(r.data.resumen, "incluye el resumen de lo que depende del registro");
};

/* ───────────── 1-4. Eliminar plantilla, grupo y semestre con historia (y eliminación forzada) ───────────── */

test("1. una plantilla con reportes no se elimina, en ningún estado (aprobado y borrador), ni con eliminación forzada", { skip }, async () => {
  const antes = await huella();
  for (const clave of ["a", "b"]) {
    const r = await api(`/admin/plantillas/${ctx.tpl[clave]}`, tokens.adminA, { method: "DELETE" });
    esHistorico(r);
    assert.ok(r.data.resumen.entregables >= 1 && r.data.resumen.evidencias >= 0);
    esHistorico(await api(`/admin/plantillas/${ctx.tpl[clave]}?forzar=true`, tokens.adminA, { method: "DELETE" }));
  }
  await sinCambios(antes);
});

test("2. un grupo con entregables no se elimina: con docentes asignados se pide desasignarlos y sin docentes lo bloquea la historia", { skip }, async () => {
  const antes = await huella();
  // Con docentes asignados: regla existente (400) conservada.
  const conDocentes = await api(`/admin/grupos-matriz/${ctx.g.g1}?forzar=true`, tokens.adminA, { method: "DELETE" });
  assert.equal(conDocentes.status, 400);
  // Historia sin docentes asignados (situación heredada): se simula desasignando por SQL a quien reportó.
  await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE id = $1`, [ctx.u.dH.id]);
  await alinearHistorial(pool);
  const antes2 = await huella();
  esHistorico(await api(`/admin/grupos-matriz/${ctx.g.gh}`, tokens.adminA, { method: "DELETE" }));
  esHistorico(await api(`/admin/grupos-matriz/${ctx.g.gh}?forzar=true`, tokens.adminA, { method: "DELETE" }));
  await sinCambios(antes2);
  await q(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2`, [ctx.g.gh, ctx.u.dH.id]);
  await alinearHistorial(pool);
  await sinCambios(antes);
});

test("3. un semestre con históricos no se elimina (ni con eliminación forzada)", { skip }, async () => {
  const antes = await huella();
  esHistorico(await api(`/admin/semestres/${S1}`, tokens.adminA, { method: "DELETE" }));
  const forzado = await api(`/admin/semestres/${S1}?forzar=true`, tokens.adminA, { method: "DELETE" });
  esHistorico(forzado);
  assert.ok(forzado.data.resumen.docentes >= 1, "informa los docentes asignados");
  await sinCambios(antes);
});

test("4. las opciones de eliminación forzada tampoco saltan la protección en plantillas, grupos y semestres con historia", { skip }, async () => {
  const antes = await huella();
  const respuestas = [
    await api(`/admin/plantillas/${ctx.tpl.a}?forzar=true`, tokens.adminA, { method: "DELETE" }),
    await api(`/admin/semestres/${S1}?forzar=true`, tokens.adminA, { method: "DELETE" }),
  ];
  respuestas.forEach(esHistorico);
  await sinCambios(antes);
});

/* ───────────── 5-6. Edición de plantillas ───────────── */

test("5. una plantilla con reportes no se modifica: ni horas, fechas, semana, número, texto, instrucciones o enlace", { skip }, async () => {
  const antes = await huella();
  const intentos = [
    { horas: 99 },
    { fecha_inicio: "2095-01-01", fecha_fin: "2095-01-05" },
    { semana_numero: 9 },
    { numero: 777 },
    { entregable: "Otro significado" },
    { descripcion_evidencia: "Otras instrucciones" },
    { enlace_referencia: "https://example.com/nuevo" },
    { tipo_evidencia: "formulario", horas: 3 },
  ];
  for (const body of intentos) {
    for (const clave of ["a", "b"]) {
      esHistorico(await api(`/admin/plantillas/${ctx.tpl[clave]}`, tokens.adminA, { method: "PUT", body }));
    }
  }
  await sinCambios(antes);
});

test("6. una plantilla sin reportes conserva su edición normal (y las validaciones existentes)", { skip }, async () => {
  const ok = await api(`/admin/plantillas/${ctx.tpl.c}`, tokens.adminA, { method: "PUT", body: { horas: 5, entregable: `${M} Entrega C editada`, enlace_referencia: "https://example.com/c" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(Number(ok.data.plantilla.horas), 5);
  assert.equal(ok.data.plantilla.entregable, `${M} Entrega C editada`);
  const fechas = await api(`/admin/plantillas/${ctx.tpl.c}`, tokens.adminA, { method: "PUT", body: { fecha_inicio: "2095-03-01", fecha_fin: "2095-03-05" } });
  assert.equal(fechas.status, 200, JSON.stringify(fechas.data));
  const invalida = await api(`/admin/plantillas/${ctx.tpl.c}`, tokens.adminA, { method: "PUT", body: { fecha_inicio: "2095-03-05", fecha_fin: "2095-03-01" } });
  assert.equal(invalida.status, 400);
  assert.equal((await api(`/admin/plantillas/999999999`, tokens.adminA, { method: "PUT", body: { horas: 1 } })).status, 404);
});

test("6b. la actualización masiva solo cambia plantillas sin reportes y protege las que los tienen", { skip }, async () => {
  const vista = await api(`/admin/plantillas/actualizacion-masiva/preview`, tokens.adminA, { method: "POST", body: { plantilla_id: ctx.tpl.a2 } });
  assert.equal(vista.status, 200);
  assert.equal(vista.data.plantillas_afectadas, 1, "solo la de G2 puede cambiar");
  assert.equal(vista.data.plantillas_protegidas, 1, "la de G1 tiene reportes");
  const aplicado = await api(`/admin/plantillas/actualizacion-masiva`, tokens.adminA, { method: "PUT", body: { plantilla_id: ctx.tpl.a2, descripcion_evidencia: "Nueva instrucción compartida" } });
  assert.equal(aplicado.status, 200, JSON.stringify(aplicado.data));
  assert.equal(aplicado.data.plantillas_afectadas, 1);
  assert.equal(aplicado.data.plantillas_protegidas, 1);
  const filas = await q(`SELECT id, descripcion_evidencia FROM plantilla_entregables WHERE id = ANY($1::int[])`, [[ctx.tpl.a, ctx.tpl.a2]]);
  assert.equal(filas.find((f) => f.id === ctx.tpl.a2).descripcion_evidencia, "Nueva instrucción compartida");
  assert.equal(filas.find((f) => f.id === ctx.tpl.a).descripcion_evidencia, "Cargar soporte", "la plantilla con reportes no cambia");
  // Si todas las coincidentes están protegidas, se rechaza sin escribir nada.
  await q(`UPDATE plantilla_entregables SET entregable = $1 WHERE id = $2`, [`${M} Entrega solo protegida`, ctx.tpl.b]);
  const todas = await api(`/admin/plantillas/actualizacion-masiva`, tokens.adminA, { method: "PUT", body: { plantilla_id: ctx.tpl.b, descripcion_evidencia: "No debe aplicarse" } });
  esHistorico(todas);
  await q(`UPDATE plantilla_entregables SET entregable = $1 WHERE id = $2`, [`${M} Entrega B`, ctx.tpl.b]);
});

/* ───────────── 7-8. Docentes ───────────── */

test("7. un docente con historial no se elimina; el administrador con acciones registradas tampoco", { skip }, async () => {
  const antes = await huella();
  const r = await api(`/admin/usuarios/${ctx.u.d1.id}`, tokens.adminA, { method: "DELETE" });
  esHistorico(r);
  assert.ok(r.data.resumen.entregables >= 1);
  esHistorico(await api(`/admin/usuarios/${ctx.u.dH.id}`, tokens.adminA, { method: "DELETE" }));
  // adminA aprobó un entregable: figura como actor del historial.
  esHistorico(await api(`/admin/usuarios/${ctx.u.adminA.id}`, tokens.adminB, { method: "DELETE" }));
  await sinCambios(antes);
});

test("8. inactivar a un docente conserva sus reportes, evidencias y eventos", { skip }, async () => {
  const d = ctx.u.d1;
  const antes = await huella();
  const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "inactivo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.g1, motivo_cambio_grupo: "Prueba de integración" };
  const r = await api(`/admin/usuarios/${d.id}`, tokens.adminA, { method: "PUT", body });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.estado, "inactivo");
  const despues = await huella();
  for (const t of ["proyecto_entregables", "entregable_evidencias", "entregable_eventos", "plantilla_entregables", "grupos_matriz"]) assert.equal(despues[t], antes[t], `${t} intacta`);
  assert.equal((await q(`SELECT estado FROM usuarios WHERE id = $1`, [d.id]))[0].estado, "inactivo");
  // Se reactiva para el resto de las pruebas.
  const re = await api(`/admin/usuarios/${d.id}`, tokens.adminA, { method: "PUT", body: { ...body, estado: "activo" } });
  assert.equal(re.status, 200);
});

test("8b. un docente sin historial sí puede eliminarse (la protección no bloquea lo legítimo)", { skip }, async () => {
  const tmp = (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, estado, tipo_docente) VALUES ($1, 'Prueba', $2, 'docente', 'activo', 'ANTIGUO') RETURNING id`, [`${M}_Tmp`, `${M}.tmp@test.local`]))[0];
  const r = await api(`/admin/usuarios/${tmp.id}`, tokens.adminA, { method: "DELETE" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await q(`SELECT COUNT(*)::int n FROM usuarios WHERE id = $1`, [tmp.id]))[0].n, 0);
});

/* ───────────── 9-10. Asignación de grupo ───────────── */

test("9. se puede reasignar a un docente sin historial, por las dos rutas, con las mismas reglas", { skip }, async () => {
  await conSemestreActivo(q, S1, async () => {
    const d = ctx.u.d2; // sin reportes
    const aG = await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g4, motivo: "Prueba de integración" } });
    assert.equal(aG.status, 200, JSON.stringify(aG.data));
    assert.equal((await q(`SELECT grupo_matriz_id FROM usuarios WHERE id = $1`, [d.id]))[0].grupo_matriz_id, ctx.g.g4);
    const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.g2, motivo_cambio_grupo: "Prueba de integración" };
    const porUsuario = await api(`/admin/usuarios/${d.id}`, tokens.adminA, { method: "PUT", body });
    assert.equal(porUsuario.status, 200, JSON.stringify(porUsuario.data));
    assert.equal(porUsuario.data.grupo_matriz_id, ctx.g.g2);
    // Quitar el grupo a quien no tiene historial también es legítimo.
    assert.equal((await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: null, motivo: "Prueba de integración" } })).status, 200);
    assert.equal((await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g2, motivo: "Prueba de integración" } })).status, 200);
  });
});

test("9b. la ruta de asignación aplica las reglas que antes solo tenía «Editar usuario» (grupo activo, mismo tipo)", { skip }, async () => {
  await conSemestreActivo(q, S1, async () => {
    const d = ctx.u.dLibre; // sin grupo ni historial
    const antes = await huella();
    const tipo = await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g3, motivo: "Prueba de integración" } });
    assert.equal(tipo.status, 409, "grupo NUEVO para un docente ANTIGUO");
    const inactivo = await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g5, motivo: "Prueba de integración" } });
    assert.equal(inactivo.status, 404, "grupo inactivo");
    assert.equal((await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: 999999999, motivo: "Prueba de integración" } })).status, 404);
    // Cambiar el tipo estando en un grupo de otro tipo se rechaza (hay que cambiar tipo y grupo a la vez).
    await q(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2`, [ctx.g.g4, d.id]);
    await alinearHistorial(pool);
    const desajuste = await api(`/admin/docentes/${d.id}/tipo-docente`, tokens.adminA, { method: "PUT", body: { tipo_docente: "NUEVO" } });
    assert.equal(desajuste.status, 409);
    assert.equal(desajuste.data.codigo, "TIPO_GRUPO_INCOMPATIBLE");
    assert.equal((await api(`/admin/docentes/${d.id}/tipo-docente`, tokens.adminA, { method: "PUT", body: { tipo_docente: "ANTIGUO" } })).status, 200);
    await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE id = $1`, [d.id]);
    await alinearHistorial(pool);
    assert.deepEqual(await huella(), antes, "estado final igual al inicial");
  });
});

test("10. una reasignación que alteraría históricos se bloquea con un 409 claro, por todas las rutas", { skip }, async () => {
  await conSemestreActivo(q, S1, async () => {
    const d = ctx.u.d1; // tiene un aprobado y un borrador en G1
    const antes = await huella();
    const porGrupo = await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g2, motivo: "Prueba de integración" } });
    esHistorico(porGrupo);
    esHistorico(await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: null, motivo: "Prueba de integración" } }));
    const body = { nombre: d.nombre, apellido: d.apellido, correo: d.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: ctx.g.g2, motivo_cambio_grupo: "Prueba de integración" };
    esHistorico(await api(`/admin/usuarios/${d.id}`, tokens.adminA, { method: "PUT", body }));
    // Convertirlo en administrador le quitaría el grupo: también se bloquea.
    esHistorico(await api(`/admin/usuarios/${d.id}`, tokens.adminA, { method: "PUT", body: { ...body, rol: "admin", grupo_matriz_id: ctx.g.g1, motivo_cambio_grupo: "Prueba de integración" } }));
    await sinCambios(antes);
    // Dejarlo en su mismo grupo sí se permite.
    const igual = await api(`/admin/docentes/${d.id}/grupo-matriz`, tokens.adminA, { method: "PUT", body: { grupo_matriz_id: ctx.g.g1, motivo: "Prueba de integración" } });
    assert.equal(igual.status, 200);
  });
});

test("10b. la excepción individual no mueve un reporte existente a otra iniciativa; sí puede dejarlo donde está", { skip }, async () => {
  const antes = await huella();
  const mover = await api(`/admin/docentes/${ctx.u.d1.id}/plantillas/${ctx.tpl.a}/excepcion`, tokens.adminA, { method: "PUT", body: { motivo: "Prueba de movimiento", proyecto_id: ctx.p.p2 } });
  esHistorico(mover);
  await sinCambios(antes);
  const igual = await api(`/admin/docentes/${ctx.u.d1.id}/plantillas/${ctx.tpl.a}/excepcion`, tokens.adminA, { method: "PUT", body: { motivo: "Sin mover el reporte", proyecto_id: ctx.p.p1 } });
  assert.equal(igual.status, 200, JSON.stringify(igual.data));
  await q(`DELETE FROM docente_entregable_excepciones WHERE docente_id = $1`, [ctx.u.d1.id]);
});

test("10c. el cambio de semestre de un grupo con historia se bloquea (con docentes: regla existente)", { skip }, async () => {
  const antes = await huella();
  const conDocentes = await api(`/admin/grupos-matriz/${ctx.g.g1}`, tokens.adminA, { method: "PUT", body: { semestre: S2 } });
  assert.equal(conDocentes.status, 400);
  await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE id = $1`, [ctx.u.dH.id]);
  await alinearHistorial(pool);
  const antes2 = await huella();
  esHistorico(await api(`/admin/grupos-matriz/${ctx.g.gh}`, tokens.adminA, { method: "PUT", body: { semestre: S2 } }));
  await sinCambios(antes2);
  await q(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2`, [ctx.g.gh, ctx.u.dH.id]);
  await alinearHistorial(pool);
  await sinCambios(antes);
  // Un grupo que ya figura en el historial de asignaciones (aunque hoy no tenga docentes) tampoco cambia de semestre.
  const conAsignaciones = (await q(`SELECT grupo_id FROM docente_grupo_matriz WHERE grupo_id = $1 LIMIT 1`, [ctx.g.g4])).length;
  if (conAsignaciones) {
    const quieto = await api(`/admin/grupos-matriz/${ctx.g.g4}`, tokens.adminA, { method: "PUT", body: { semestre: S2 } });
    assert.ok([400, 409].includes(quieto.status), JSON.stringify(quieto.data));
  }
  // Sin historia, el cambio de semestre sigue funcionando.
  const g6 = (await q(
    `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
     VALUES ($1, 'sintético', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`, [`${M} G6 libre`, S1]
  ))[0].id;
  ctx.g.g6 = g6;
  const libre = await api(`/admin/grupos-matriz/${g6}`, tokens.adminA, { method: "PUT", body: { semestre: S2 } });
  assert.equal(libre.status, 200, JSON.stringify(libre.data));
  assert.equal((await api(`/admin/grupos-matriz/${g6}`, tokens.adminA, { method: "PUT", body: { semestre: S1 } })).status, 200);
});

/* ───────────── 11. Concurrencia de administradores ───────────── */

test("11. dos administradores que se desactivan o eliminan a la vez nunca dejan el sistema sin administradores activos", { skip }, async () => {
  // Se aísla el escenario: solo deben existir estos dos administradores activos.
  await q(`UPDATE usuarios SET estado = 'inactivo' WHERE rol = 'admin' AND correo ILIKE $1`, [`${M}.%`]);
  const otros = (await q(`SELECT COUNT(*)::int n FROM usuarios WHERE rol = 'admin' AND estado = 'activo'`))[0].n;
  assert.equal(otros, 0, "la base de pruebas no debe tener otros administradores activos");
  const nuevoAdmin = async (n) => (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, estado) VALUES ($1, 'Par', $2, 'admin', 'activo') RETURNING id, nombre, apellido, correo, rol`, [`${M}_P${n}`, `${M}.par${n}@test.local`]))[0];
  const activos = async () => (await q(`SELECT COUNT(*)::int n FROM usuarios WHERE rol = 'admin' AND estado = 'activo'`))[0].n;
  const cuerpo = (u, estado) => ({ nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: "admin", estado });
  try {
    for (let ronda = 0; ronda < 6; ronda += 1) {
      const a = await nuevoAdmin(`a${ronda}`);
      const b = await nuevoAdmin(`b${ronda}`);
      const ta = createSessionToken(a);
      const tb = createSessionToken(b);
      const variante = ronda % 3;
      const [r1, r2] = await Promise.all(
        variante === 0
          ? [api(`/admin/usuarios/${b.id}`, ta, { method: "PUT", body: cuerpo(b, "inactivo") }), api(`/admin/usuarios/${a.id}`, tb, { method: "PUT", body: cuerpo(a, "inactivo") })]
          : variante === 1
            ? [api(`/admin/usuarios/${b.id}`, ta, { method: "DELETE" }), api(`/admin/usuarios/${a.id}`, tb, { method: "DELETE" })]
            : [api(`/admin/usuarios/${b.id}`, ta, { method: "PUT", body: cuerpo(b, "inactivo") }), api(`/admin/usuarios/${a.id}`, tb, { method: "DELETE" })]
      );
      const estados = [r1.status, r2.status].sort();
      assert.ok(estados.includes(409) || estados.includes(401), `ronda ${ronda}: al menos una operación debe rechazarse (${estados})`);
      assert.ok((await activos()) >= 1, `ronda ${ronda}: debe quedar al menos un administrador activo`);
      await q(`DELETE FROM usuarios WHERE id = ANY($1::int[])`, [[a.id, b.id]]);
    }
  } finally {
    await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.par%`]);
    await q(`UPDATE usuarios SET estado = 'activo' WHERE rol = 'admin' AND correo ILIKE $1`, [`${M}.Admin%`]);
  }
});

test("11b. eliminar o desactivar al último administrador activo sigue bloqueado, y la propia cuenta también", { skip }, async () => {
  await q(`UPDATE usuarios SET estado = 'inactivo' WHERE id = $1`, [ctx.u.adminB.id]);
  try {
    const antes = await huella();
    const solo = { nombre: ctx.u.adminA.nombre, apellido: ctx.u.adminA.apellido, correo: ctx.u.adminA.correo, rol: "admin", estado: "inactivo" };
    const propia = await api(`/admin/usuarios/${ctx.u.adminA.id}`, tokens.adminA, { method: "PUT", body: solo });
    assert.equal(propia.status, 409);
    assert.equal((await api(`/admin/usuarios/${ctx.u.adminA.id}`, tokens.adminA, { method: "DELETE" })).status, 409);
    await sinCambios(antes);
  } finally {
    await q(`UPDATE usuarios SET estado = 'activo' WHERE id = $1`, [ctx.u.adminB.id]);
  }
});

/* ───────────── 12. Carreras entre comprobar y eliminar ───────────── */

test("12. eliminar una plantilla mientras se crea un reporte nunca deja un reporte huérfano", { skip }, async () => {
  const hoyTexto = hoyBogota();
  assert.ok(hoyTexto);
  let borradas = 0;
  let conservadas = 0;
  for (let i = 0; i < 12; i += 1) {
    const semana = 4 + (i % 10);
    const tpl = (await q(
      `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
       VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Octubre', $3, $4, 'Cargar soporte', 1, 0, 4) RETURNING id`,
      [ctx.g.g1, 900 + i, semana, `${M} Carrera ${i}`]
    ))[0].id;
    const [del, rep] = await Promise.allSettled([
      api(`/admin/plantillas/${tpl}`, tokens.adminA, { method: "DELETE" }),
      wf.registrarDesdeMatriz(pool, { docenteId: ctx.u.d1.id, plantillaId: tpl, completado: false, proyectoId: ctx.p.p1 }),
    ]);
    const existe = (await q(`SELECT COUNT(*)::int n FROM plantilla_entregables WHERE id = $1`, [tpl]))[0].n;
    const huerfanos = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1 AND plantilla_id IS NULL`, [ctx.u.d1.id]))[0].n;
    assert.equal(huerfanos, 0, `ronda ${i}: ningún reporte puede quedar sin plantilla`);
    const reportes = (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE plantilla_id = $1`, [tpl]))[0].n;
    if (existe === 1) {
      conservadas += 1;
      assert.equal(del.value?.status, 409, `ronda ${i}: si hay reporte, la eliminación debe rechazarse`);
      assert.equal(reportes, 1);
    } else {
      borradas += 1;
      assert.equal(del.value?.status, 200);
      assert.equal(reportes, 0);
      assert.equal(rep.status, "rejected", `ronda ${i}: el reporte no pudo crearse sobre una plantilla eliminada`);
    }
  }
  assert.equal(borradas + conservadas, 12);
});

/* ───────────── 13 y casos legítimos ───────────── */

test("13. las evidencias, versiones y reportes aprobados conservan sus referencias originales tras todos los intentos", { skip }, async () => {
  const a = (await q(`SELECT e.id, e.plantilla_id, e.docente_id, e.estado_revision, e.proyecto_semana_id FROM proyecto_entregables e WHERE e.id = $1`, [ctx.ent.a]))[0];
  assert.equal(a.estado_revision, "aprobado");
  assert.equal(a.plantilla_id, ctx.tpl.a);
  assert.equal(a.docente_id, ctx.u.d1.id);
  const ev = await q(`SELECT entregable_id, plantilla_id, docente_id, url, estado, semestre FROM entregable_evidencias WHERE entregable_id = ANY($1::int[]) ORDER BY id`, [[ctx.ent.a, ctx.ent.b, ctx.ent.h]]);
  assert.ok(ev.length >= 2);
  assert.ok(ev.every((x) => x.plantilla_id != null && x.docente_id != null && x.semestre === S1));
  const eventos = await q(`SELECT tipo, plantilla_id, docente_id FROM entregable_eventos WHERE entregable_id = $1`, [ctx.ent.a]);
  assert.ok(eventos.length >= 2 && eventos.every((x) => x.plantilla_id === ctx.tpl.a));
  // El docente sigue viendo su matriz con el aprobado.
  const matriz = await api(`/docente/${ctx.u.d1.id}/matriz`, tokens.d1);
  assert.equal(matriz.status, 200);
  const item = matriz.data.items.find((i) => i.id === ctx.tpl.a);
  assert.equal(item.estado, "aprobado");
});

test("14. las eliminaciones legítimas siguen funcionando: plantilla, grupo y semestre sin historia", { skip }, async () => {
  // Plantilla sin reportes.
  assert.equal((await api(`/admin/plantillas/${ctx.tpl.c}`, tokens.adminA, { method: "DELETE" })).status, 200);
  // Un grupo que figura en el historial de asignaciones (la prueba 9 pasó a un docente por g4) ya no se elimina.
  esHistorico(await api(`/admin/grupos-matriz/${ctx.g.g4}?forzar=true`, tokens.adminA, { method: "DELETE" }));
  // Grupo sin historia ni docentes: primero la confirmación existente por plantillas, luego eliminar.
  await q(
    `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
     VALUES ($1, 11, 'Proyecto', 'Proyecto', 'Octubre', 1, $2, 'Cargar soporte', 2, 0, 4)`, [ctx.g.g6, `${M} Entrega G6`]
  );
  const pide = await api(`/admin/grupos-matriz/${ctx.g.g6}`, tokens.adminA, { method: "DELETE" });
  assert.equal(pide.status, 400);
  assert.equal(pide.data.tiene_plantillas, true);
  assert.equal((await api(`/admin/grupos-matriz/${ctx.g.g6}?forzar=true`, tokens.adminA, { method: "DELETE" })).status, 200);
  // Semestre solo con configuración: confirmación existente y luego eliminación.
  const confirma = await api(`/admin/semestres/${S2}`, tokens.adminA, { method: "DELETE" });
  assert.equal(confirma.status, 409);
  assert.equal(confirma.data.requiere_confirmacion, true);
  assert.equal((await api(`/admin/semestres/${S2}?forzar=true`, tokens.adminA, { method: "DELETE" })).status, 200);
  assert.equal((await q(`SELECT COUNT(*)::int n FROM semestres WHERE codigo = $1`, [S2]))[0].n, 0);
  // Y el semestre con historia sigue ahí.
  assert.equal((await q(`SELECT COUNT(*)::int n FROM semestres WHERE codigo = $1`, [S1]))[0].n, 1);
});
