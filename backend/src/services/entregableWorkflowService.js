// Flujo de estados de los entregables (docente y administrador).
// Todas las escrituras pasan por aquí: transacción, bloqueo de fila, reglas de
// matrizService (estados, evidencias, fechas) e historial en entregable_eventos.
import {
  ErrorNegocio,
  esFechaISO,
  estadoEfectivo,
  hoyBogota,
  parseEvidencias,
  resolveInitiativeForTemplate,
  resolverRequisitoEvidencia,
  transicionAdmin,
  transicionDocente,
  transicionReapertura,
  validarEnvio,
} from "./matrizService.js";
import { analizarEnlace, instantanea, instantaneaDeEntregable, sincronizarEvidencias } from "./evidenciaService.js";

const ES_DUENO = (alias = "p", docente = "$1") => `(
  ${alias}.docente_responsable_id = ${docente}
  OR EXISTS (SELECT 1 FROM proyecto_docentes pd WHERE pd.proyecto_id = ${alias}.id AND pd.docente_id = ${docente})
)`;

async function conTransaccion(pool, fn) {
  for (let intento = 0; intento < 2; intento += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      // Índice único (docente, plantilla): un reintento concurrente reutiliza la fila ya creada.
      if (error?.code === "23505" && intento === 0) continue;
      throw error;
    } finally {
      client.release();
    }
  }
  return null;
}

async function registrarEvento(client, { entregableId, docenteId, plantillaId, tipo, anterior, nuevo, actorId, comentario, detalle = null }) {
  await client.query(
    `INSERT INTO entregable_eventos
       (entregable_id, docente_id, plantilla_id, tipo, estado_anterior, estado_nuevo, actor_id, comentario, detalle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entregableId, docenteId ?? null, plantillaId ?? null, tipo, anterior ?? null, nuevo ?? null, actorId ?? null, comentario ?? null, detalle ? JSON.stringify(detalle) : null]
  );
}

const serializarUrls = (urls) => {
  if (Array.isArray(urls)) {
    const f = urls.map((u) => String(u || "").trim()).filter(Boolean);
    // Un único enlace se guarda como texto plano (formato histórico); varios, como JSON.
    if (f.length === 1) return f[0];
    return f.length ? JSON.stringify(f) : null;
  }
  if (urls == null || urls === "") return null;
  return String(urls);
};

const estadoDeFila = (fila) =>
  estadoEfectivo({
    entregable_id: fila.id,
    completado: fila.completado === true,
    estado_revision: fila.estado_revision,
    url_evidencia: fila.url_evidencia,
    actividad_reportada: fila.actividad_reportada,
    descripcion_reporte: fila.descripcion_reporte,
    evidencia_exenta: fila.evidencia_exenta,
  });

/** Evidencia exigida: plantilla (con la descripción efectiva de la excepción individual, si existe). */
async function requisitoDeEntregable(client, fila, docenteId) {
  if (fila.plantilla_id == null) return resolverRequisitoEvidencia({});
  const r = await client.query(
    `SELECT tpl.tipo_evidencia, tpl.requiere_evidencia,
            COALESCE(dex.descripcion_evidencia_override, tpl.descripcion_evidencia) AS descripcion_evidencia
     FROM plantilla_entregables tpl
     LEFT JOIN docente_entregable_excepciones dex ON dex.plantilla_id = tpl.id AND dex.docente_id = $2
     WHERE tpl.id = $1`,
    [fila.plantilla_id, docenteId]
  );
  return resolverRequisitoEvidencia(r.rows[0] ?? {});
}

/**
 * Acción del docente sobre un entregable existente (transacción ya abierta).
 * accion: 'guardar_borrador' | 'enviar' | 'retirar'. `docenteId` = dueño del reporte.
 */
async function accionDocenteTx(client, { docenteId, actorId = docenteId, entregableId, accion, datos = {}, ahora, soloDesde = null }) {
  const hoy = hoyBogota(ahora);
  const sel = await client.query(
    `SELECT e.*, p.id AS proyecto_id_real
     FROM proyecto_entregables e
     JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
     JOIN proyectos p ON p.id = s.proyecto_id
     WHERE e.id = $1
     FOR UPDATE OF e`,
    [entregableId]
  );
  if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
  const fila = sel.rows[0];

  let esDueno = fila.docente_id != null && Number(fila.docente_id) === Number(docenteId);
  if (!esDueno && fila.docente_id == null) {
    esDueno = (await client.query(`SELECT 1 FROM proyectos p WHERE p.id = $2 AND ${ES_DUENO("p", "$1")}`, [docenteId, fila.proyecto_id_real])).rowCount > 0;
  }
  if (!esDueno) throw new ErrorNegocio(403, "SIN_PERMISO", "No tienes permiso para modificar este entregable");

  const estadoActual = estadoDeFila(fila);
  if (soloDesde && estadoActual !== soloDesde) {
    // Doble clic / reintento: ya está en revisión, no se duplica el envío.
    if (accion === "enviar" && estadoActual === "enviado") {
      return { id: Number(entregableId), estado: "enviado", estado_anterior: estadoActual, sin_cambios: true };
    }
    throw new ErrorNegocio(400, "ESTADO_INVALIDO", `Solo puedes reenviar reportes con estado '${soloDesde}'. Estado actual: ${estadoActual}`, { estado: estadoActual });
  }
  const t = transicionDocente(estadoActual, accion);
  if (!t.ok) throw new ErrorNegocio(409, t.codigo, t.error, { estado: estadoActual });

  const tieneUrls = Object.prototype.hasOwnProperty.call(datos, "url_evidencia");
  const set = [];
  const params = [];
  const add = (col, val) => {
    params.push(val);
    set.push(`${col} = $${params.length}`);
  };

  if (datos.actividad_reportada !== undefined) add("actividad_reportada", datos.actividad_reportada || null);
  if (datos.descripcion_reporte !== undefined) add("descripcion_reporte", datos.descripcion_reporte || null);
  if (datos.porcentaje_avance != null && !Number.isNaN(Number(datos.porcentaje_avance))) {
    add("porcentaje_avance", Math.max(0, Math.min(100, Math.round(Number(datos.porcentaje_avance)))));
  }
  if (tieneUrls) {
    // Solo enlaces http(s) válidos, también en borradores (el envío además valida el tipo exigido).
    for (const u of parseEvidencias(datos.url_evidencia)) {
      if (!analizarEnlace(u)) throw new ErrorNegocio(422, "EVIDENCIA_INVALIDA", `"${u}" no es un enlace válido (debe iniciar con http:// o https://)`);
    }
    add("url_evidencia", serializarUrls(datos.url_evidencia));
  }
  if (fila.docente_id == null) add("docente_id", docenteId); // reportes históricos: la pertenencia queda explícita

  const limpiarEnvio = () =>
    set.push("completado = false", "fecha_completado = NULL", "fecha_real_entrega = NULL", "fecha_cargue_evidencia = NULL");

  if (accion === "guardar_borrador") {
    add("estado_revision", t.estado);
    if (t.estado !== "observado") limpiarEnvio();
    if (datos.exencion !== undefined) {
      const j = String(datos.exencion || "").trim();
      add("evidencia_exenta", j.length > 0);
      add("justificacion_exencion", j || null);
    }
  } else if (accion === "retirar") {
    if (!t.sinCambios) {
      add("estado_revision", t.estado);
      limpiarEnvio();
    }
  } else if (accion === "enviar") {
    const requisito = await requisitoDeEntregable(client, fila, docenteId);
    const evidencias = parseEvidencias(tieneUrls ? datos.url_evidencia : fila.url_evidencia);
    const exencion = datos.exencion !== undefined ? datos.exencion : fila.evidencia_exenta ? fila.justificacion_exencion : null;
    const v = validarEnvio({ requisito, evidencias, exencion });
    if (!v.ok) throw new ErrorNegocio(422, v.codigo, v.error, { requisito });
    add("evidencia_exenta", v.exenta);
    add("justificacion_exencion", v.exenta ? v.justificacion : null);
    if (!t.sinCambios) {
      // Las fechas las fija el servidor (hora de Bogotá); el navegador no las propone.
      add("estado_revision", "enviado");
      add("completado", true);
      add("fecha_completado", hoy);
      add("fecha_real_entrega", hoy);
      set.push("comentario_revision = NULL", "revisado_en = NULL", "problema_acceso_en = NULL");
      set.push("fecha_cargue_evidencia = NOW()", "fecha_primer_envio = COALESCE(fecha_primer_envio, NOW())");
      set.push("num_envios = COALESCE(num_envios, 0) + 1");
    }
  }

  if (set.length > 0) {
    params.push(entregableId);
    await client.query(`UPDATE proyecto_entregables SET ${set.join(", ")} WHERE id = $${params.length}`, params);
  }
  // Evidencias por enlace (versiones): se alinean con los enlaces vigentes; al enviar se asocian a la ronda de envío.
  let vigentes = null;
  if (accion === "retirar" && !tieneUrls) {
    vigentes = await instantaneaDeEntregable(client, entregableId);
  } else {
    const urlsVigentes = tieneUrls ? datos.url_evidencia : fila.url_evidencia;
    const enviaAhora = accion === "enviar" && !t.sinCambios;
    const sync = await sincronizarEvidencias(client, {
      entregableId,
      docenteId,
      actorId,
      urls: urlsVigentes,
      envioNumero: enviaAhora ? Number(fila.num_envios || 0) + 1 : null,
    });
    vigentes = instantanea(sync.vigentes);
  }
  if (t.evento) {
    await registrarEvento(client, {
      entregableId,
      docenteId,
      plantillaId: fila.plantilla_id,
      tipo: t.evento,
      anterior: estadoActual,
      nuevo: t.estado,
      actorId,
      detalle: { envio_numero: accion === "enviar" ? Number(fila.num_envios || 0) + 1 : Number(fila.num_envios || 0), evidencias: vigentes },
    });
  }
  return { id: Number(entregableId), estado: t.estado, estado_anterior: estadoActual, sin_cambios: Boolean(t.sinCambios) };
}

export function aplicarAccionDocente(pool, params) {
  return conTransaccion(pool, (client) => accionDocenteTx(client, params));
}

/**
 * Enviar / retirar desde la matriz (crea el reporte vinculado a la plantilla si no existe).
 * Un único reporte por (docente, plantilla); todo en una transacción: si la validación
 * de evidencia falla no queda ninguna fila a medias.
 */
export function registrarDesdeMatriz(pool, { docenteId, actorId = docenteId, plantillaId, completado, proyectoId = null, datos = {}, ahora }) {
  return conTransaccion(pool, async (client) => {
    // Serializa las operaciones del mismo docente (evita duplicados por doble clic/reintentos).
    await client.query("SELECT id FROM usuarios WHERE id = $1 FOR UPDATE", [docenteId]);

    const tplR = await client.query(
      `SELECT tpl.*, tpl.categoria AS categoria_raw, tpl.fase AS fase_raw,
              COALESCE(dex.entregable_override, tpl.entregable) AS entregable_effective,
              dex.proyecto_id AS override_project_id,
              p_override.titulo AS override_project_title, p_override.tipo AS override_project_type
       FROM plantilla_entregables tpl
       INNER JOIN usuarios u ON u.id = $2 AND u.rol = 'docente' AND u.grupo_matriz_id = tpl.grupo_id
       LEFT JOIN docente_entregable_excepciones dex ON dex.docente_id = u.id AND dex.plantilla_id = tpl.id
       LEFT JOIN proyectos p_override ON p_override.id = dex.proyecto_id
       WHERE tpl.id = $1`,
      [plantillaId, docenteId]
    );
    if (tplR.rowCount === 0) throw new ErrorNegocio(404, "PLANTILLA_NO_ENCONTRADA", "Plantilla no encontrada");
    const tpl = tplR.rows[0];
    const semanaNum = tpl.semana_numero != null ? Number(tpl.semana_numero) : null;
    if (semanaNum == null || Number.isNaN(semanaNum)) throw new ErrorNegocio(400, "PLANTILLA_SIN_SEMANA", "Plantilla sin semana_numero");

    const existente = await client.query(
      `SELECT e.id
       FROM proyecto_entregables e
       INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
       INNER JOIN proyectos p ON p.id = s.proyecto_id
       WHERE e.plantilla_id = $1 AND e.docente_id = $2 AND ${ES_DUENO("p", "$2")}
       ORDER BY e.id DESC LIMIT 1
       FOR UPDATE OF e`,
      [plantillaId, docenteId]
    );

    let entregableId = existente.rows[0]?.id ?? null;
    if (entregableId == null) {
      // Como en `main`: marcar sin completar crea el borrador vinculado a la plantilla (sirve para guardar avances).
      const iniciativa = await resolveInitiativeForTemplate(docenteId, tpl, client, { proyectoId });
      if (!iniciativa.id) {
        throw new ErrorNegocio(422, "SIN_INICIATIVA", "No tienes una iniciativa asignada. El administrador debe asignarla antes de reportar.", { semana_numero: semanaNum });
      }
      const semana = await client.query(
        `SELECT id FROM proyecto_semanas WHERE proyecto_id = $1 AND numero = $2 ORDER BY id LIMIT 1`,
        [iniciativa.id, semanaNum]
      );
      if (semana.rowCount === 0) {
        throw new ErrorNegocio(422, "SIN_INICIATIVA", "No tienes una iniciativa asignada para esta semana", { semana_numero: semanaNum });
      }
      const ins = await client.query(
        `INSERT INTO proyecto_entregables
           (proyecto_semana_id, plantilla_id, docente_id, descripcion, completado, estado_revision, horas, transversal)
         VALUES ($1, $2, $3, $4, false, 'borrador', $5, $6)
         RETURNING id`,
        [semana.rows[0].id, plantillaId, docenteId, String(tpl.entregable_effective || tpl.entregable || "").trim(), tpl.horas != null ? Number(tpl.horas) : null, iniciativa.fuente === "soporte_general"]
      );
      entregableId = ins.rows[0].id;
    }

    const out = await accionDocenteTx(client, {
      docenteId,
      actorId,
      entregableId,
      accion: completado ? "enviar" : "retirar",
      datos,
      ahora,
    });
    return { ok: true, entregable_id: out.id, estado: out.estado, sin_cambios: out.sin_cambios };
  });
}

/** Decisión del administrador (aprobar / observar) sobre un entregable enviado. */
export const MENSAJE_SIN_ACCESO =
  "No tengo acceso a la evidencia. Revisa los permisos del enlace y compártelo con las cuentas de coordinación; luego vuelve a enviar el entregable.";

/**
 * Decisión del administrador. `motivo: 'sin_acceso'` = «No tengo acceso a la evidencia»: el entregable pasa a
 * observado (sin perder datos ni versiones) para que el docente corrija los permisos del enlace.
 */
export function aplicarRevisionAdmin(pool, { entregableId, estadoNuevo, comentario, actorId = null, motivo = null, evidenciasAfectadas = [] }) {
  return conTransaccion(pool, async (client) => {
    const sel = await client.query(`SELECT * FROM proyecto_entregables WHERE id = $1 FOR UPDATE`, [entregableId]);
    if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
    const fila = sel.rows[0];
    const estadoActual = estadoDeFila(fila);
    const sinAcceso = motivo === "sin_acceso";
    if (sinAcceso && estadoNuevo !== "observado") throw new ErrorNegocio(400, "ESTADO_INVALIDO", "«No tengo acceso a la evidencia» devuelve el entregable como observado");
    const comentarioFinal = sinAcceso && !String(comentario ?? "").trim() ? MENSAJE_SIN_ACCESO : comentario;
    const t = transicionAdmin(estadoActual, estadoNuevo, { comentario: comentarioFinal });
    if (!t.ok) throw new ErrorNegocio(t.codigo === "NO_ENVIADO" || t.codigo === "ESTADO_BLOQUEADO" ? 409 : 400, t.codigo, t.error);
    if (t.sinCambios) return { ok: true, estado: t.estado, sin_cambios: true };

    const nota = String(comentarioFinal ?? "").trim() || null;
    await client.query(
      `UPDATE proyecto_entregables
       SET estado_revision = $1, comentario_revision = $2, revisado_en = NOW(),
           aprobado_en = CASE WHEN $1 = 'aprobado' THEN NOW() ELSE NULL END,
           problema_acceso_en = CASE WHEN $4::boolean THEN NOW() ELSE NULL END,
           completado = true
       WHERE id = $3`,
      [t.estado, nota, entregableId, sinAcceso]
    );
    const afectadas = Array.isArray(evidenciasAfectadas) ? evidenciasAfectadas.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    await registrarEvento(client, {
      entregableId, docenteId: fila.docente_id, plantillaId: fila.plantilla_id,
      tipo: sinAcceso ? "sin_acceso" : t.evento, anterior: estadoActual, nuevo: t.estado, actorId, comentario: nota,
      detalle: {
        envio_numero: Number(fila.num_envios || 0),
        evidencias: await instantaneaDeEntregable(client, entregableId),
        ...(sinAcceso ? { motivo: "sin_acceso", evidencias_afectadas: afectadas } : {}),
      },
    });
    return { ok: true, estado: t.estado, sin_cambios: false };
  });
}

/** Procedimiento controlado para devolver un aprobado a revisión (administrador identificado + motivo). */
export function reabrirEntregable(pool, { entregableId, actorId, motivo, destino = "enviado" }) {
  return conTransaccion(pool, async (client) => {
    const admin = await client.query(`SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'admin' AND estado = 'activo'`, [actorId]);
    if (admin.rowCount === 0) throw new ErrorNegocio(403, "SOLO_ADMIN", "Solo un administrador puede reabrir un entregable aprobado");
    const sel = await client.query(`SELECT * FROM proyecto_entregables WHERE id = $1 FOR UPDATE`, [entregableId]);
    if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
    const fila = sel.rows[0];
    const estadoActual = estadoDeFila(fila);
    const t = transicionReapertura(estadoActual, { motivo, destino });
    if (!t.ok) throw new ErrorNegocio(409, t.codigo, t.error);
    await client.query(
      `UPDATE proyecto_entregables
       SET estado_revision = $1, aprobado_en = NULL, revisado_en = NOW(), comentario_revision = $2
       WHERE id = $3`,
      [t.estado, destino === "observado" ? String(motivo).trim() : null, entregableId]
    );
    await registrarEvento(client, {
      entregableId, docenteId: fila.docente_id, plantillaId: fila.plantilla_id,
      tipo: t.evento, anterior: estadoActual, nuevo: t.estado, actorId, comentario: String(motivo).trim(),
      detalle: { envio_numero: Number(fila.num_envios || 0), evidencias: await instantaneaDeEntregable(client, entregableId) },
    });
    return { ok: true, estado: t.estado };
  });
}

export { esFechaISO };
