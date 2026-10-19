// Servicio ÚNICO de asignaciones docente–grupo (AL-01, Bloque 3B Fase B).
//
// Es la única vía por la que el backend escribe la asignación de un docente a un grupo. Mantiene, en UNA transacción:
//   · docente_grupo_matriz (historial con vigencias),
//   · usuarios.grupo_matriz_id (espejo: el grupo vigente, que siguen leyendo las pantallas y las métricas hasta la Fase C) y
//   · docente_grupo_matriz_cambios (registro inmutable: docente, grupo anterior y nuevo, semestre, fecha, administrador y motivo).
//
// Reglas (decisiones aprobadas):
//   · B1  Solo se asigna a grupos del semestre ACTIVO. Cambiar de semestre es un procedimiento explícito (`transicionarSemestre`); no se
//         activan semestres ni se reasigna a nadie por suposición.
//   · B2  Las incidencias de asignación ambigua bloquean únicamente las operaciones de ESE docente; se resuelven de forma explícita y
//         trazable (`resolverIncidencia`), nunca automática.
//   · B3  Todo cambio efectivo exige motivo y administrador. Un reenvío idempotente (mismo grupo) no crea eventos ni filas.
//   · Un docente con reportes en un grupo de un semestre no cambia a otro grupo del MISMO semestre ni se queda sin grupo en él.
//
// Orden de bloqueos (el mismo que usan las rutas de administración): [LOCK_ADMINISTRADORES, si la ruta lo toma] → fila del docente
// (FOR UPDATE) → bloqueo consultivo del docente (7310028) → fila del grupo destino (FOR SHARE) → consultas. Las operaciones masivas
// recorren a los docentes en orden de id.
import { ErrorNegocio } from "./matrizService.js";
import { errorHistorico } from "./historicosService.js";

export const LOCK_ASIGNACIONES = 7310028;
export const ORIGENES = ["asignacion_admin", "importacion", "transicion_semestre", "reconciliacion"];
const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;
const MAX_TRANSICION = 500;

let esquemaListo = false;
export const reiniciarCacheEsquema = () => { esquemaListo = false; };

/** ¿Existe el historial en esta base? (la migración fase28 se aplica de forma coordinada con este código). */
export async function existeHistorial(db) {
  const r = await db.query(`SELECT to_regclass('docente_grupo_matriz') AS t, to_regclass('docente_grupo_matriz_cambios') AS c`);
  return Boolean(r.rows[0].t && r.rows[0].c);
}

/** Falla de forma EXPLÍCITA (503) si la migración no está aplicada: nunca escribe el espejo sin registrar el historial. */
export async function asegurarEsquema(db) {
  if (esquemaListo) return;
  if (!(await existeHistorial(db))) {
    throw new ErrorNegocio(503, "ESQUEMA_ASIGNACIONES_PENDIENTE", "El historial de asignaciones aún no está disponible en esta base (migración fase28 pendiente). No se puede cambiar el grupo de un docente hasta aplicarla.");
  }
  esquemaListo = true;
}

export function validarMotivo(motivo) {
  const t = String(motivo ?? "").trim();
  if (t.length < MOTIVO_MIN) {
    throw new ErrorNegocio(400, "MOTIVO_OBLIGATORIO", `Indica el motivo del cambio de grupo (mínimo ${MOTIVO_MIN} caracteres).`);
  }
  if (t.length > MOTIVO_MAX) throw new ErrorNegocio(400, "MOTIVO_DEMASIADO_LARGO", `El motivo no puede superar ${MOTIVO_MAX} caracteres.`);
  return t;
}

/** Traduce los errores de las reglas que impone PostgreSQL a respuestas funcionales. */
function traducirErrorBd(e) {
  if (e?.code === "23505") return new ErrorNegocio(409, "CONFLICTO_ASIGNACION", "La asignación del docente cambió mientras se procesaba la solicitud. Vuelve a intentarlo.");
  if (e?.code === "23P01") return new ErrorNegocio(409, "VIGENCIAS_SOLAPADAS", "Las vigencias de las asignaciones del docente no pueden solaparse.");
  if (e?.code === "23514" && /HISTORICO_PROTEGIDO/.test(e.message || "")) {
    return errorHistorico("El docente tiene reportes en otro grupo de este semestre; no puede cambiar de grupo dentro del mismo semestre.", { entregables: 0, total: 1 },
      "Mantén al docente en su grupo actual; el cambio de grupo se hace al pasar a otro semestre.");
  }
  if (e?.code === "23514" && /preasignaciones/.test(e.message || "")) return new ErrorNegocio(409, "PREASIGNACION_NO_PERMITIDA", "Una asignación no puede empezar en el futuro.");
  return e;
}

/**
 * Cambia (o quita, con `grupoId = null`) el grupo de un docente. Debe llamarse DENTRO de una transacción abierta (`client`).
 * Devuelve { cambio: false } si el docente ya está en ese grupo (idempotente), o el detalle del cambio y el id del evento.
 */
export async function cambiarGrupoTx(client, { docenteId, grupoId = null, actorId, motivo, origen = "asignacion_admin" }) {
  await asegurarEsquema(client);
  if (!ORIGENES.includes(origen) || origen === "reconciliacion") throw new ErrorNegocio(500, "ORIGEN_INVALIDO", "Origen de asignación no válido");
  const docente = Number(docenteId);
  const destinoId = grupoId == null || grupoId === "" ? null : Number(grupoId);
  if (!Number.isInteger(docente) || docente <= 0) throw new ErrorNegocio(400, "DOCENTE_INVALIDO", "id de docente inválido");
  if (destinoId !== null && (!Number.isInteger(destinoId) || destinoId <= 0)) throw new ErrorNegocio(400, "GRUPO_INVALIDO", "grupo_matriz_id es inválido");

  // 1. Administrador responsable.
  const actor = (await client.query(`SELECT id, rol, estado FROM usuarios WHERE id = $1`, [actorId])).rows[0];
  if (!actor || actor.rol !== "admin" || actor.estado !== "activo") {
    throw new ErrorNegocio(403, "ACTOR_INVALIDO", "Solo un administrador activo puede cambiar la asignación de un docente.");
  }

  // 2. Docente: bloqueo de su fila y del bloqueo consultivo (orden fijo).
  const u = (await client.query(`SELECT id, rol, estado, tipo_docente, grupo_matriz_id FROM usuarios WHERE id = $1 FOR UPDATE`, [docente])).rows[0];
  if (!u || u.rol !== "docente") throw new ErrorNegocio(404, "DOCENTE_NO_ENCONTRADO", "Docente no encontrado");
  await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [LOCK_ASIGNACIONES, docente]);

  // 3. Estado actual: el espejo y la asignación vigente deben coincidir (si no, hay que reconciliar antes de seguir).
  const vigente = (await client.query(
    `SELECT a.id, a.grupo_id, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE a.docente_id = $1 AND a.vigente FOR UPDATE OF a`, [docente]
  )).rows[0] ?? null;
  const espejo = u.grupo_matriz_id == null ? null : Number(u.grupo_matriz_id);
  if ((vigente?.grupo_id ?? null) !== espejo) {
    throw new ErrorNegocio(409, "ASIGNACION_INCONSISTENTE", "La asignación vigente del docente no coincide con su grupo actual. Reconcilia los datos antes de cambiarla (scripts/historial-docente-grupo-reconciliar.js).");
  }

  // 4. Idempotencia: mismo grupo → sin cambios, sin eventos ni filas nuevas.
  if ((vigente?.grupo_id ?? null) === destinoId) return { cambio: false, docente_id: docente, grupo_id: destinoId };

  const motivoOk = validarMotivo(motivo);

  // 5. Incidencias ambiguas de ESTE docente: bloquean solo sus cambios (otros docentes no se afectan).
  const inc = (await client.query(`SELECT id, tipo, semestre FROM docente_grupo_matriz_incidencias WHERE docente_id = $1 AND estado = 'pendiente' AND tipo = 'dos_grupos_en_un_semestre' ORDER BY id`, [docente])).rows;
  if (inc.length > 0) {
    throw new ErrorNegocio(409, "ASIGNACION_AMBIGUA", "La asignación de este docente tiene una incidencia sin resolver (evidencia en dos grupos de un mismo semestre). Resuélvela de forma explícita antes de cambiar su grupo.", { incidencias: inc });
  }

  // 6. Grupo destino: bloqueo compartido (no se elimina ni cambia de semestre mientras se asigna) y reglas de negocio.
  let destino = null;
  if (destinoId !== null) {
    destino = (await client.query(`SELECT id, nombre, semestre, activo, tipo_docente FROM grupos_matriz WHERE id = $1 FOR SHARE`, [destinoId])).rows[0] ?? null;
    if (!destino || destino.activo !== true) throw new ErrorNegocio(404, "GRUPO_NO_DISPONIBLE", "Grupo matriz no encontrado o inactivo");
    if (destino.tipo_docente !== (u.tipo_docente || "ANTIGUO")) {
      throw new ErrorNegocio(409, "TIPO_GRUPO_INCOMPATIBLE", "El tipo del docente no coincide con el grupo matriz seleccionado");
    }
    // B1: solo grupos del semestre activo.
    const activo = (await client.query(`SELECT codigo FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`)).rows[0]?.codigo ?? null;
    if (activo == null) throw new ErrorNegocio(409, "SIN_SEMESTRE_ACTIVO", "No hay un semestre activo: actívalo antes de asignar docentes a un grupo.");
    if (destino.semestre !== activo) {
      throw new ErrorNegocio(409, "SEMESTRE_NO_ACTIVO", `Solo se pueden asignar docentes a grupos del semestre activo (${activo}); el grupo seleccionado es del semestre ${destino.semestre ?? "sin semestre"}.`, { semestre_activo: activo, semestre_grupo: destino.semestre ?? null });
    }
  }

  // 7. Protección histórica: con reportes en un grupo de un semestre, no se cambia a otro grupo del mismo semestre ni se queda sin grupo en él.
  const reportes = (await client.query(
    `SELECT g.id AS grupo_id, g.semestre, COUNT(*)::int AS n
     FROM proyecto_entregables pe JOIN plantilla_entregables t ON t.id = pe.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id
     WHERE pe.docente_id = $1 GROUP BY g.id, g.semestre`, [docente]
  )).rows;
  const afectados = destino
    ? reportes.filter((r) => r.semestre === destino.semestre && r.grupo_id !== destino.id)
    : reportes.filter((r) => vigente && r.semestre === vigente.semestre);
  if (afectados.length > 0) {
    const n = afectados.reduce((s, r) => s + r.n, 0);
    throw errorHistorico(
      `No se puede ${destino ? "cambiar el grupo del docente dentro del semestre" : "dejar al docente sin grupo en su semestre"}: tiene ${n} entregable${n === 1 ? "" : "s"} reportado${n === 1 ? "" : "s"} en ese semestre. Los reportes no se mueven ni se reinterpretan.`,
      { entregables: n, total: n },
      "Mantén al docente en su grupo actual; el cambio de grupo se hace al pasar a otro semestre."
    );
  }

  // 8. Cambio: cerrar la vigente, abrir la nueva, actualizar el espejo y registrar el evento (misma transacción).
  const t = (await client.query(`SELECT clock_timestamp() AS t`)).rows[0].t;
  try {
    let cerradaId = null;
    if (vigente) {
      await client.query(`UPDATE docente_grupo_matriz SET vigente = false, hasta = $2, cerrado_por = $3, cerrado_en = $2, motivo_cierre = $4 WHERE id = $1`, [vigente.id, t, actorId, motivoOk]);
      cerradaId = vigente.id;
    }
    let abiertaId = null;
    if (destino) {
      abiertaId = (await client.query(
        `INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza, creado_por, creado_en) VALUES ($1, $2, true, $3, $4, 'registrada', $5, $3) RETURNING id`,
        [docente, destino.id, t, origen, actorId]
      )).rows[0].id;
    }
    await client.query(`UPDATE usuarios SET grupo_matriz_id = $2 WHERE id = $1`, [docente, destinoId]);
    const evento = (await client.query(
      `INSERT INTO docente_grupo_matriz_cambios (docente_id, grupo_anterior_id, grupo_nuevo_id, semestre_anterior, semestre_nuevo, cambiado_en, cambiado_por, motivo, origen, fila_cerrada_id, fila_abierta_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [docente, vigente?.grupo_id ?? null, destino?.id ?? null, vigente?.semestre ?? null, destino?.semestre ?? null, t, actorId, motivoOk, origen, cerradaId, abiertaId]
    )).rows[0].id;
    return {
      cambio: true, docente_id: docente, grupo_anterior_id: vigente?.grupo_id ?? null, grupo_nuevo_id: destino?.id ?? null,
      semestre_anterior: vigente?.semestre ?? null, semestre_nuevo: destino?.semestre ?? null, cambiado_en: t, evento_id: evento,
    };
  } catch (e) {
    throw traducirErrorBd(e);
  }
}

/** Igual que `cambiarGrupoTx`, abriendo y confirmando su propia transacción (todo o nada). */
export async function cambiarGrupo(pool, params) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await cambiarGrupoTx(client, params);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Procedimiento explícito de CAMBIO DE SEMESTRE: aplica una lista EXPLÍCITA de (docente → grupo) del semestre activo, todo o nada. No
 * activa semestres ni elige grupos: cada asignación la indica el administrador. Las asignaciones anteriores se cierran, no se pierden.
 */
export async function transicionarSemestre(pool, { semestre, asignaciones, actorId, motivo }) {
  const sem = String(semestre ?? "").trim().toUpperCase();
  if (!Array.isArray(asignaciones) || asignaciones.length === 0) throw new ErrorNegocio(400, "ASIGNACIONES_VACIAS", "Indica al menos una asignación (docente_id y grupo_id).");
  if (asignaciones.length > MAX_TRANSICION) throw new ErrorNegocio(400, "DEMASIADAS_ASIGNACIONES", `Máximo ${MAX_TRANSICION} asignaciones por operación.`);
  const lista = asignaciones.map((a) => {
    const g = a?.grupo_id ?? a?.grupoId;
    return { docenteId: Number(a?.docente_id ?? a?.docenteId), grupoId: g == null ? null : Number(g) };
  });
  if (lista.some((a) => !Number.isInteger(a.docenteId) || a.docenteId <= 0 || !Number.isInteger(a.grupoId) || a.grupoId <= 0)) {
    throw new ErrorNegocio(400, "ASIGNACION_INVALIDA", "Cada asignación necesita docente_id y grupo_id enteros positivos.");
  }
  if (new Set(lista.map((a) => a.docenteId)).size !== lista.length) throw new ErrorNegocio(400, "DOCENTE_REPETIDO", "Un docente no puede aparecer dos veces en la misma operación.");
  validarMotivo(motivo);
  lista.sort((a, b) => a.docenteId - b.docenteId); // orden fijo de bloqueos: sin interbloqueos entre operaciones masivas
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await asegurarEsquema(client);
    const activo = (await client.query(`SELECT codigo FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`)).rows[0]?.codigo ?? null;
    if (activo == null) throw new ErrorNegocio(409, "SIN_SEMESTRE_ACTIVO", "No hay un semestre activo.");
    if (sem !== activo) throw new ErrorNegocio(409, "SEMESTRE_NO_ACTIVO", `La transición solo se aplica al semestre activo (${activo}); se pidió ${sem || "(vacío)"}. Activa el semestre explícitamente antes.`, { semestre_activo: activo });
    const resultados = [];
    for (const a of lista) resultados.push(await cambiarGrupoTx(client, { docenteId: a.docenteId, grupoId: a.grupoId, actorId, motivo, origen: "transicion_semestre" }));
    await client.query("COMMIT");
    return { semestre: sem, solicitadas: lista.length, cambiadas: resultados.filter((r) => r.cambio).length, sin_cambios: resultados.filter((r) => !r.cambio).length, resultados };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ───────────────────────── Incidencias (B2) ─────────────────────────

export async function listarIncidencias(db, { estado = "pendiente", docenteId = null, limite = 100 } = {}) {
  await asegurarEsquema(db);
  if (estado && !["pendiente", "resuelta", "descartada", "todas"].includes(estado)) throw new ErrorNegocio(400, "ESTADO_INVALIDO", "estado debe ser pendiente, resuelta, descartada o todas");
  const r = await db.query(
    `SELECT id, tipo, docente_id, semestre, detalle, estado, detectada_en, resuelta_por, resuelta_en, nota
     FROM docente_grupo_matriz_incidencias
     WHERE ($1::text = 'todas' OR estado = $1) AND ($2::int IS NULL OR docente_id = $2) ORDER BY id LIMIT $3`,
    [estado || "pendiente", docenteId, Math.min(Math.max(Number(limite) || 100, 1), 500)]
  );
  return r.rows;
}

/** Resolución EXPLÍCITA y trazable: quién, cuándo y por qué. No asigna ni mueve ningún grupo. */
export async function resolverIncidencia(pool, { id, estado, nota, actorId }) {
  const incId = Number(id);
  if (!Number.isInteger(incId) || incId <= 0) throw new ErrorNegocio(400, "INCIDENCIA_INVALIDA", "id de incidencia inválido");
  if (!["resuelta", "descartada"].includes(estado)) throw new ErrorNegocio(400, "ESTADO_INVALIDO", "estado debe ser resuelta o descartada");
  const texto = String(nota ?? "").trim();
  if (texto.length < 10) throw new ErrorNegocio(400, "NOTA_OBLIGATORIA", "Explica la resolución (mínimo 10 caracteres).");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await asegurarEsquema(client);
    const actor = (await client.query(`SELECT rol, estado FROM usuarios WHERE id = $1`, [actorId])).rows[0];
    if (!actor || actor.rol !== "admin" || actor.estado !== "activo") throw new ErrorNegocio(403, "ACTOR_INVALIDO", "Solo un administrador activo puede resolver incidencias.");
    const inc = (await client.query(`SELECT id, estado FROM docente_grupo_matriz_incidencias WHERE id = $1 FOR UPDATE`, [incId])).rows[0];
    if (!inc) throw new ErrorNegocio(404, "INCIDENCIA_NO_ENCONTRADA", "Incidencia no encontrada");
    if (inc.estado !== "pendiente") throw new ErrorNegocio(409, "INCIDENCIA_YA_RESUELTA", `La incidencia ya está ${inc.estado}.`);
    const r = await client.query(
      `UPDATE docente_grupo_matriz_incidencias SET estado = $2, resuelta_por = $3, resuelta_en = now(), nota = $4 WHERE id = $1
       RETURNING id, tipo, docente_id, semestre, estado, resuelta_por, resuelta_en, nota`,
      [incId, estado, actorId, texto]
    );
    await client.query("COMMIT");
    return r.rows[0];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ───────────────────────── Consistencia y reconciliación ─────────────────────────

/** Docentes cuyo espejo (`usuarios.grupo_matriz_id`) no coincide con su asignación vigente, y docentes con más de una vigente. */
export async function diagnosticarDeriva(db) {
  const deriva = (await db.query(
    `SELECT u.id AS docente_id, u.grupo_matriz_id AS espejo, a.grupo_id AS historial_vigente
     FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente
     WHERE u.rol = 'docente' AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id ORDER BY u.id`
  )).rows;
  const dobles = (await db.query(`SELECT docente_id, COUNT(*)::int AS n FROM docente_grupo_matriz WHERE vigente GROUP BY docente_id HAVING COUNT(*) > 1`)).rows;
  return { deriva, dobles };
}

/**
 * Reconciliación TÉCNICA (origen `reconciliacion`, sin administrador): el espejo es la fuente cuando el historial está desfasado (así
 * lo escribía el código anterior). Cierra la vigente desfasada y abre la que corresponde, sin perder nada y sin inventar fechas pasadas
 * (la nueva empieza «ahora»). Si una regla de la base impide un caso (p. ej. reportes en el mismo semestre) lo informa y no lo toca.
 */
export async function reconciliar(pool, { aplicar = false } = {}) {
  await asegurarEsquema(pool);
  const { deriva } = await diagnosticarDeriva(pool);
  const resultado = { pendientes: deriva.length, reconciliados: [], no_reconciliados: [] };
  if (!aplicar) { resultado.pendientes_detalle = deriva; return resultado; }
  for (const d of deriva) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const u = (await client.query(`SELECT id, grupo_matriz_id FROM usuarios WHERE id = $1 AND rol = 'docente' FOR UPDATE`, [d.docente_id])).rows[0];
      await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [LOCK_ASIGNACIONES, d.docente_id]);
      const vigente = (await client.query(`SELECT a.id, a.grupo_id, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE a.docente_id = $1 AND a.vigente FOR UPDATE OF a`, [d.docente_id])).rows[0] ?? null;
      const espejo = u?.grupo_matriz_id == null ? null : Number(u.grupo_matriz_id);
      if (!u || (vigente?.grupo_id ?? null) === espejo) { await client.query("ROLLBACK"); continue; }
      const destino = espejo == null ? null : (await client.query(`SELECT id, semestre FROM grupos_matriz WHERE id = $1`, [espejo])).rows[0];
      const t = (await client.query(`SELECT clock_timestamp() AS t`)).rows[0].t;
      const motivo = "Reconciliación técnica: el historial se alinea con usuarios.grupo_matriz_id (escrito por el código anterior)";
      let cerradaId = null;
      if (vigente) {
        await client.query(`UPDATE docente_grupo_matriz SET vigente = false, hasta = $2, cerrado_en = $2, motivo_cierre = $3 WHERE id = $1`, [vigente.id, t, motivo]);
        cerradaId = vigente.id;
      }
      let abiertaId = null;
      if (destino) {
        abiertaId = (await client.query(`INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, certeza, creado_en) VALUES ($1, $2, true, $3, 'reconciliacion', 'registrada', $3) RETURNING id`, [d.docente_id, destino.id, t])).rows[0].id;
      }
      await client.query(
        `INSERT INTO docente_grupo_matriz_cambios (docente_id, grupo_anterior_id, grupo_nuevo_id, semestre_anterior, semestre_nuevo, cambiado_en, cambiado_por, motivo, origen, fila_cerrada_id, fila_abierta_id)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'reconciliacion', $8, $9)`,
        [d.docente_id, vigente?.grupo_id ?? null, destino?.id ?? null, vigente?.semestre ?? null, destino?.semestre ?? null, t, motivo, cerradaId, abiertaId]
      );
      await client.query("COMMIT");
      resultado.reconciliados.push(d.docente_id);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      resultado.no_reconciliados.push({ docente_id: d.docente_id, motivo: String(e?.message || e).slice(0, 200) });
    } finally {
      client.release();
    }
  }
  return resultado;
}
