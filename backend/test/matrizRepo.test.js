// Pruebas de las operaciones transaccionales con una BD simulada (sin servicios externos).
// Verifican las reglas de negocio: permisos, estados, evidencias, duplicados y fechas.
// Las pruebas contra PostgreSQL real están documentadas en backend/test/README.md.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ErrorNegocio,
  actualizarFechaEntrega,
  aplicarAccionDocente,
  aplicarRevisionAdmin,
  reabrirEntregable,
  registrarDesdeMatriz,
} from "../src/services/matrizRepo.js";

const norm = (sql) => sql.replace(/\s+/g, " ").trim();

/**
 * Pool simulado. `estado` define lo que devuelve cada consulta de lectura;
 * `log` acumula las escrituras para poder afirmar sobre ellas.
 */
function fakePool(estado = {}) {
  const log = { updates: [], inserts: [], eventos: [], tx: [] };
  const cfg = {
    entregable: { id: 5, proyecto_semana_id: 7, completado: true, estado_revision: "enviado", url_evidencia: "https://drive.google.com/x", semana_numero: 3, proyecto_id_real: 11, descripcion: "E", plantilla_id: 1 },
    esDueno: true,
    plantilla: { id: 1, grupo_id: 2, categoria: "Actividad 1", fase: "Actividades", semana_numero: 3, entregable: "E", horas: 2, descripcion_evidencia: "Cargar PDF" },
    esAdmin: true,
    candidatas: [{ id: 11, titulo: "Actividad A", tipo: "actividad", semana_id: 70 }],
    existente: null,
    ...estado,
  };
  const query = async (sql, params = []) => {
    const q = norm(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(q)) {
      log.tx.push(q);
      return { rows: [], rowCount: 0 };
    }
    if (q.includes("p.id AS proyecto_id_real") && q.includes("FOR UPDATE OF e")) {
      return cfg.entregable ? { rows: [cfg.entregable], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (q.includes("SELECT e.id, e.estado_revision, p.id AS proyecto_id")) {
      return { rows: [{ id: cfg.entregable.id, estado_revision: cfg.entregable.estado_revision, proyecto_id: 11 }], rowCount: 1 };
    }
    if (q.startsWith("SELECT 1 FROM proyectos p WHERE p.id = $2")) {
      return { rows: cfg.esDueno ? [{}] : [], rowCount: cfg.esDueno ? 1 : 0 };
    }
    if (q.startsWith("SELECT * FROM plantilla_entregables WHERE id")) return { rows: [cfg.plantilla], rowCount: 1 };
    if (q.includes("JOIN usuarios u ON u.id = $1 AND u.grupo_matriz_id")) return { rows: [], rowCount: 0 };
    if (q.includes("JOIN usuarios u ON u.id = $2 AND u.rol = 'docente'")) {
      return cfg.plantilla ? { rows: [cfg.plantilla], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (q.includes("ORDER BY (e.plantilla_id IS NOT DISTINCT FROM $2::int)")) {
      return cfg.existente ? { rows: [{ id: cfg.existente }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (q.includes("SELECT DISTINCT ON (p.id)")) return { rows: cfg.candidatas, rowCount: cfg.candidatas.length };
    if (q.includes("JOIN plantilla_entregables t2")) return { rows: [], rowCount: 0 };
    if (q.startsWith("INSERT INTO proyecto_entregables")) {
      log.inserts.push({ q, params });
      return { rows: [{ id: 99 }], rowCount: 1 };
    }
    if (q.startsWith("UPDATE proyecto_entregables e SET plantilla_id")) return { rows: [], rowCount: 0 };
    if (q.startsWith("UPDATE proyecto_entregables")) {
      log.updates.push({ q, params });
      return { rows: [{ id: 5, fecha_real_entrega: params[0] }], rowCount: 1 };
    }
    if (q.startsWith("INSERT INTO entregable_eventos")) {
      log.eventos.push({ tipo: params[1], anterior: params[2], nuevo: params[3], actor: params[4], comentario: params[5] });
      return { rows: [], rowCount: 1 };
    }
    if (q.includes("FROM usuarios WHERE id = $1 AND rol = 'admin'")) {
      return { rows: cfg.esAdmin ? [{}] : [], rowCount: cfg.esAdmin ? 1 : 0 };
    }
    if (q.startsWith("SELECT * FROM proyecto_entregables WHERE id = $1 FOR UPDATE")) {
      return cfg.entregable ? { rows: [cfg.entregable], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    throw new Error(`Consulta no simulada: ${q.slice(0, 120)}`);
  };
  const client = { query, release() {} };
  return { pool: { connect: async () => client }, log, cfg };
}

const rechaza = (promesa, status, codigo) =>
  assert.rejects(promesa, (e) => e instanceof ErrorNegocio && e.status === status && e.codigo === codigo);

// ─────────── Acciones del docente ───────────
test("un docente no puede modificar entregables de otro docente (403) ni escribir nada", async () => {
  const { pool, log } = fakePool({ esDueno: false });
  await rechaza(aplicarAccionDocente(pool, { docenteId: 99, entregableId: 5, accion: "enviar" }), 403, "SIN_PERMISO");
  assert.equal(log.updates.length, 0);
  assert.ok(log.tx.some((t) => t.startsWith("ROLLBACK")));
});

test("entregable inexistente responde 404", async () => {
  const { pool } = fakePool({ entregable: null });
  await rechaza(aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar" }), 404, "NO_ENCONTRADO");
});

test("un entregable aprobado no puede modificarse ni retirarse (ni con PUT, borrador o reenviar)", async () => {
  for (const accion of ["enviar", "retirar", "guardar_borrador"]) {
    const { pool, log } = fakePool({ entregable: { id: 5, completado: true, estado_revision: "aprobado", proyecto_id_real: 11, semana_numero: 3 } });
    await rechazaBloqueo(pool, accion);
    assert.equal(log.updates.length, 0, accion);
  }
});
const rechazaBloqueo = (pool, accion) =>
  rechaza(aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion, datos: { url_evidencia: "https://x.co" } }), 409, "ESTADO_BLOQUEADO");

test("no se puede enviar un entregable que requiere evidencia sin enlace ni justificación", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: false, estado_revision: "borrador", url_evidencia: null, proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  await rechaza(aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar" }), 422, "EVIDENCIA_REQUERIDA");
  assert.equal(log.updates.length, 0);
  assert.equal(log.eventos.length, 0);
});

test("entregable sin evidencia obligatoria se envía sin enlace", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: false, estado_revision: "borrador", url_evidencia: null, proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
    plantilla: { id: 1, tipo_evidencia: "ninguna", descripcion_evidencia: "Esta tarea no implica realizar cargue" },
  });
  const out = await aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar" });
  assert.equal(out.estado, "enviado");
});

test("envío válido: pasa a enviado, cuenta el envío, fija fechas y registra el evento", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: false, estado_revision: "borrador", url_evidencia: null, proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  const ahora = new Date("2026-03-10T02:00:00Z"); // 9 p. m. del 9 de marzo en Bogotá
  const out = await aplicarAccionDocente(pool, {
    docenteId: 1,
    entregableId: 5,
    accion: "enviar",
    datos: { url_evidencia: ["https://drive.google.com/file/d/1/view"] },
    ahora,
  });
  assert.equal(out.estado, "enviado");
  const u = log.updates[0];
  assert.match(u.q, /num_envios = COALESCE\(num_envios, 0\) \+ 1/);
  assert.match(u.q, /fecha_primer_envio = COALESCE\(fecha_primer_envio, NOW\(\)\)/);
  assert.ok(u.params.includes("2026-03-09"), "la fecha de entrega usa el día de Bogotá, no el de UTC");
  assert.deepEqual(log.eventos.map((e) => e.tipo), ["envio"]);
  assert.ok(log.tx.includes("COMMIT"));
});

test("reenviar/enviar dos veces no duplica registros ni cuenta otro envío", async () => {
  const { pool, log } = fakePool(); // ya está 'enviado' con evidencia
  const out = await aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar" });
  assert.equal(out.sin_cambios, true);
  assert.equal(log.eventos.length, 0);
  assert.ok(log.updates.every((u) => !/num_envios/.test(u.q)));
  assert.equal(log.inserts.length, 0);
});

test("un observado se reenvía: queda enviado, limpia la observación y registra el reenvío", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: true, estado_revision: "observado", comentario_revision: "Falta firma", url_evidencia: "https://drive.google.com/x", proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  const out = await aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar", soloDesde: "observado" });
  assert.equal(out.estado, "enviado");
  assert.match(log.updates[0].q, /comentario_revision = NULL/);
  assert.deepEqual(log.eventos.map((e) => e.tipo), ["reenvio"]);
});

test("reenviar solo aplica a observados; repetirlo cuando ya está en revisión es idempotente", async () => {
  const borrador = fakePool({
    entregable: { id: 5, completado: false, estado_revision: "borrador", proyecto_id_real: 11, semana_numero: 3 },
  });
  await rechaza(aplicarAccionDocente(borrador.pool, { docenteId: 1, entregableId: 5, accion: "enviar", soloDesde: "observado" }), 400, "ESTADO_INVALIDO");
  const { pool, log } = fakePool(); // ya 'enviado'
  const out = await aplicarAccionDocente(pool, { docenteId: 1, entregableId: 5, accion: "enviar", soloDesde: "observado" });
  assert.equal(out.sin_cambios, true);
  assert.equal(log.updates.length, 0);
  assert.equal(log.eventos.length, 0);
});

test("corregir un observado (borrador) conserva el estado observado y su completado", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: true, estado_revision: "observado", url_evidencia: "https://x.co", proyecto_id_real: 11, semana_numero: 3 },
  });
  const out = await aplicarAccionDocente(pool, {
    docenteId: 1, entregableId: 5, accion: "guardar_borrador", datos: { descripcion_reporte: "Corregido" },
  });
  assert.equal(out.estado, "observado");
  assert.doesNotMatch(log.updates[0].q, /completado =/);
});

test("fecha real de entrega futura (hora de Bogotá) se rechaza", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 5, completado: false, estado_revision: "borrador", url_evidencia: "https://x.co", proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  await rechaza(
    aplicarAccionDocente(pool, {
      docenteId: 1, entregableId: 5, accion: "enviar",
      datos: { fecha_real_entrega: "2026-03-11" }, ahora: new Date("2026-03-10T15:00:00Z"),
    }),
    422, "FECHA_FUTURA"
  );
  assert.equal(log.updates.length, 0);
});

test("fecha-entrega: exige permiso, rechaza futuras y aprobados", async () => {
  const hoy = new Date("2026-03-10T15:00:00Z");
  const ok = fakePool({ entregable: { id: 5, estado_revision: "enviado" } });
  const r = await actualizarFechaEntrega(ok.pool, { docenteId: 1, entregableId: 5, fecha: "2026-03-10", ahora: hoy });
  assert.equal(r.fecha_real_entrega, "2026-03-10");
  await rechaza(actualizarFechaEntrega(fakePool({ entregable: { id: 5, estado_revision: "enviado" } }).pool, { docenteId: 1, entregableId: 5, fecha: "2026-03-11", ahora: hoy }), 422, "FECHA_FUTURA");
  await rechaza(actualizarFechaEntrega(fakePool({ entregable: { id: 5, estado_revision: "aprobado" } }).pool, { docenteId: 1, entregableId: 5, fecha: "2026-03-10", ahora: hoy }), 409, "ESTADO_BLOQUEADO");
  await rechaza(actualizarFechaEntrega(fakePool({ esDueno: false, entregable: { id: 5, estado_revision: "enviado" } }).pool, { docenteId: 9, entregableId: 5, fecha: "2026-03-10", ahora: hoy }), 403, "SIN_PERMISO");
});

// ─────────── Matriz: asociación a iniciativas ───────────
test("matriz: crea el entregable vinculado a la plantilla (plantilla_id) y a la iniciativa elegida", async () => {
  const { pool, log } = fakePool({
    existente: null,
    // Tras crear, la acción lee la fila recién insertada.
    entregable: { id: 99, completado: false, estado_revision: "borrador", url_evidencia: null, proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  const out = await registrarDesdeMatriz(pool, {
    docenteId: 1, plantillaId: 1, completado: true, datos: { url_evidencia: "https://drive.google.com/x" },
  });
  assert.equal(out.entregable_id, 99);
  const ins = log.inserts[0];
  assert.deepEqual(ins.params, [70, "E", 2, 1]); // semana de la iniciativa, texto, horas, plantilla_id
});

test("matriz: con varias iniciativas compatibles NO adivina; pide proyecto_id y no escribe", async () => {
  const { pool, log } = fakePool({
    candidatas: [
      { id: 11, titulo: "Actividad A", tipo: "actividad", semana_id: 70 },
      { id: 12, titulo: "Actividad B", tipo: "actividad", semana_id: 71 },
    ],
  });
  await assert.rejects(
    registrarDesdeMatriz(pool, { docenteId: 1, plantillaId: 1, completado: true, datos: { url_evidencia: "https://x.co" } }),
    (e) => e.status === 409 && e.codigo === "INICIATIVA_AMBIGUA" && e.extra.candidatos.length === 2
  );
  assert.equal(log.inserts.length, 0);
});

test("matriz: proyecto_id explícito resuelve la ambigüedad; uno ajeno se rechaza", async () => {
  const dos = [
    { id: 11, titulo: "Actividad A", tipo: "actividad", semana_id: 70 },
    { id: 12, titulo: "Actividad B", tipo: "actividad", semana_id: 71 },
  ];
  const a = fakePool({
    candidatas: dos,
    entregable: { id: 99, completado: false, estado_revision: "borrador", proyecto_id_real: 12, semana_numero: 3, plantilla_id: 1 },
  });
  await registrarDesdeMatriz(a.pool, { docenteId: 1, plantillaId: 1, completado: true, proyectoId: 12, datos: { url_evidencia: "https://x.co" } });
  assert.equal(a.log.inserts[0].params[0], 71);
  const b = fakePool({ candidatas: dos });
  await rechaza(
    registrarDesdeMatriz(b.pool, { docenteId: 1, plantillaId: 1, completado: true, proyectoId: 555, datos: {} }),
    422, "INICIATIVA_INVALIDA"
  );
});

test("matriz: si la validación falla no queda un registro a medias (ROLLBACK de la creación)", async () => {
  const { pool, log } = fakePool({
    entregable: { id: 99, completado: false, estado_revision: "borrador", url_evidencia: null, proyecto_id_real: 11, semana_numero: 3, plantilla_id: 1 },
  });
  await rechaza(registrarDesdeMatriz(pool, { docenteId: 1, plantillaId: 1, completado: true, datos: {} }), 422, "EVIDENCIA_REQUERIDA");
  assert.equal(log.inserts.length, 1); // se insertó dentro de la transacción…
  assert.ok(log.tx.some((t) => t.startsWith("ROLLBACK"))); // …y se revierte
  assert.ok(!log.tx.includes("COMMIT"));
});

test("matriz: desmarcar algo que nunca se registró no crea filas", async () => {
  const { pool, log } = fakePool({ existente: null });
  const out = await registrarDesdeMatriz(pool, { docenteId: 1, plantillaId: 1, completado: false });
  assert.equal(out.sin_cambios, true);
  assert.equal(log.inserts.length, 0);
});

test("matriz: plantilla de otro grupo (no del docente) responde 404", async () => {
  const { pool } = fakePool({ plantilla: null });
  await rechaza(registrarDesdeMatriz(pool, { docenteId: 1, plantillaId: 77, completado: true }), 404, "PLANTILLA_NO_ENCONTRADA");
});

// ─────────── Revisión del administrador ───────────
test("admin: aprobar un enviado fija aprobado_en y registra el evento", async () => {
  const { pool, log } = fakePool(); // enviado, completado
  const out = await aplicarRevisionAdmin(pool, { entregableId: 5, estadoNuevo: "aprobado", comentario: "", actorId: 3 });
  assert.equal(out.estado, "aprobado");
  assert.match(log.updates[0].q, /aprobado_en = CASE WHEN \$1 = 'aprobado' THEN NOW\(\)/);
  assert.deepEqual(log.eventos.map((e) => [e.tipo, e.actor]), [["aprobacion", 3]]);
});

test("admin: no puede aprobar un borrador que el docente nunca envió", async () => {
  const { pool, log } = fakePool({ entregable: { id: 5, completado: false, estado_revision: "borrador", url_evidencia: "https://x.co" } });
  await rechaza(aplicarRevisionAdmin(pool, { entregableId: 5, estadoNuevo: "aprobado" }), 409, "NO_ENVIADO");
  assert.equal(log.updates.length, 0);
});

test("admin: un aprobado no cambia de estado por la vía normal", async () => {
  const { pool, log } = fakePool({ entregable: { id: 5, completado: true, estado_revision: "aprobado" } });
  await rechaza(aplicarRevisionAdmin(pool, { entregableId: 5, estadoNuevo: "observado", comentario: "x" }), 409, "ESTADO_BLOQUEADO");
  assert.equal(log.updates.length, 0);
});

test("admin: observar exige comentario", async () => {
  const { pool } = fakePool();
  await rechaza(aplicarRevisionAdmin(pool, { entregableId: 5, estadoNuevo: "observado", comentario: "  " }), 400, "COMENTARIO_REQUERIDO");
});

test("reapertura: solo administradores, con motivo, y deja evento", async () => {
  const aprobado = { id: 5, completado: true, estado_revision: "aprobado" };
  await rechaza(reabrirEntregable(fakePool({ esAdmin: false, entregable: aprobado }).pool, { entregableId: 5, actorId: 8, motivo: "motivo suficientemente largo" }), 403, "SOLO_ADMIN");
  await rechaza(reabrirEntregable(fakePool({ entregable: aprobado }).pool, { entregableId: 5, actorId: 3, motivo: "corto" }), 409, "MOTIVO_REQUERIDO");
  const { pool, log } = fakePool({ entregable: aprobado });
  const out = await reabrirEntregable(pool, { entregableId: 5, actorId: 3, motivo: "El acta cargada no corresponde", destino: "observado" });
  assert.equal(out.estado, "observado");
  assert.deepEqual(log.eventos.map((e) => e.tipo), ["reapertura"]);
});
