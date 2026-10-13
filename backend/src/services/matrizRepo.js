// Acceso a datos del seguimiento. Todas las rutas leen la matriz a través de
// cargarMatrizDocentes() y escriben mediante las operaciones transaccionales de
// este módulo, de modo que las reglas de matrizService.js se aplican siempre.
import {
  categoriaSlug,
  construirItem,
  estadoEfectivo,
  fechasProgramadas,
  fechaDesdeColumnaDate,
  hoyBogota,
  mesDeFecha,
  normalizarCalendario,
  parseEvidencias,
  resolverRequisitoEvidencia,
  esFechaISO,
  tipoIniciativaDeCategoria,
  transicionAdmin,
  transicionDocente,
  transicionReapertura,
  validarEnvio,
} from "./matrizService.js";

export class ErrorNegocio extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

/** Responde con el error de negocio o con 500 si es inesperado. */
export function responderError(res, error, contexto) {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ error: error.message, codigo: error.codigo, ...error.extra });
  }
  console.error(contexto, error);
  return res.status(500).json({ error: "Error interno" });
}

const DOCENTE_ES_DUENO = (alias = "p", docente = "$1") => `(
  ${alias}.docente_responsable_id = ${docente}
  OR EXISTS (SELECT 1 FROM proyecto_docentes pd WHERE pd.proyecto_id = ${alias}.id AND pd.docente_id = ${docente})
)`;

// Emparejamiento entregable ↔ plantilla:
//   1) relación explícita e.plantilla_id = tpl.id (prioritaria)
//   2) compatibilidad histórica: filas sin plantilla_id, misma semana y mismo texto
const SQL_MATRIZ_DOCENTES = `
  SELECT
    u.id AS docente_id, u.nombre, u.apellido, u.programa_id, pr.nombre AS programa,
    u.regional, u.grupo_matriz_id AS grupo_id, gm.nombre AS grupo_nombre,
    COALESCE(u.tipo_docente, 'ANTIGUO') AS tipo_docente, gm.semestre,
    to_char(cal.fecha_inicio, 'YYYY-MM-DD') AS cal_inicio, cal.num_semanas AS cal_num_semanas,
    tpl.id AS plantilla_id, tpl.numero, tpl.categoria AS categoria_raw, tpl.fase AS fase_raw,
    tpl.mes, tpl.semana_numero, tpl.entregable, tpl.descripcion_evidencia,
    tpl.tipo_evidencia, tpl.requiere_evidencia,
    tpl.dias_inicio_desde_feb AS dias_inicio, tpl.dias_fin_desde_feb AS dias_fin,
    COALESCE(pe.horas, tpl.horas) AS horas_effective,
    pe.id AS entregable_id, COALESCE(pe.completado, false) AS completado,
    pe.estado_revision, pe.comentario_revision, pe.url_evidencia, pe.fecha_real_entrega,
    pe.fecha_primer_envio, pe.fecha_ultimo_envio, pe.num_envios, pe.aprobado_en, pe.revisado_en,
    pe.evidencia_exenta, pe.justificacion_exencion, pe.porcentaje_avance,
    pe.actividad_reportada, pe.descripcion_reporte,
    pe.proyecto_id, pe.proyecto_titulo, pe.proyecto_tipo
  FROM usuarios u
  LEFT JOIN programas pr ON pr.id = u.programa_id
  LEFT JOIN grupos_matriz gm ON gm.id = u.grupo_matriz_id
  LEFT JOIN calendario_semestres cal ON cal.semestre = gm.semestre
  LEFT JOIN plantilla_entregables tpl ON tpl.grupo_id = u.grupo_matriz_id
  LEFT JOIN LATERAL (
    SELECT e.id, e.completado, e.estado_revision, e.comentario_revision, e.url_evidencia,
           e.fecha_real_entrega, e.fecha_primer_envio, e.fecha_ultimo_envio, e.num_envios,
           e.aprobado_en, e.revisado_en, e.evidencia_exenta, e.justificacion_exencion,
           e.porcentaje_avance, e.actividad_reportada, e.descripcion_reporte, e.horas,
           p.id AS proyecto_id, p.titulo AS proyecto_titulo, p.tipo AS proyecto_tipo
    FROM proyecto_entregables e
    JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
    JOIN proyectos p ON p.id = s.proyecto_id
    WHERE ${DOCENTE_ES_DUENO("p", "u.id")}
      AND (
        e.plantilla_id = tpl.id
        OR (
          e.plantilla_id IS NULL
          AND s.numero = tpl.semana_numero
          AND (
            TRIM(e.descripcion) = TRIM(tpl.entregable)
            OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
          )
        )
      )
    ORDER BY (e.plantilla_id IS NOT DISTINCT FROM tpl.id) DESC, e.id DESC
    LIMIT 1
  ) pe ON true
  WHERE u.rol = 'docente'
    AND ($1::int IS NULL OR u.id = $1)
    AND ($2::text IS NULL OR gm.semestre = $2)
    AND ($3::int IS NULL OR u.grupo_matriz_id = $3)
  ORDER BY u.apellido, u.nombre, u.id, tpl.semana_numero NULLS LAST, tpl.numero
`;

/**
 * Matriz de seguimiento de uno o varios docentes: [{ docente, calendario, items }].
 * Los ítems llevan ya su clasificación (estado, vencido, exigible…).
 */
export async function cargarMatrizDocentes(db, { docenteId = null, semestre = null, grupoId = null, hoy = hoyBogota() } = {}) {
  const { rows } = await db.query(SQL_MATRIZ_DOCENTES, [docenteId, semestre, grupoId]);
  const porDocente = new Map();
  for (const r of rows) {
    let entry = porDocente.get(r.docente_id);
    if (!entry) {
      entry = {
        docente: {
          id: Number(r.docente_id),
          nombre: [r.nombre, r.apellido].filter(Boolean).join(" ").trim(),
          nombres: r.nombre,
          apellidos: r.apellido,
          programa_id: r.programa_id != null ? Number(r.programa_id) : null,
          programa: r.programa || null,
          regional: r.regional || null,
          grupo_id: r.grupo_id != null ? Number(r.grupo_id) : null,
          grupo_nombre: r.grupo_nombre || null,
          tipo_docente: r.tipo_docente === "NUEVO" ? "NUEVO" : "ANTIGUO",
          semestre: r.semestre || null,
        },
        calendario: normalizarCalendario({ fecha_inicio: r.cal_inicio, num_semanas: r.cal_num_semanas }, r.semestre || null),
        items: [],
      };
      porDocente.set(r.docente_id, entry);
    }
    if (r.plantilla_id == null) continue;
    const fechas = fechasProgramadas(entry.calendario, {
      semana_numero: r.semana_numero,
      dias_inicio: r.dias_inicio,
      dias_fin: r.dias_fin,
    });
    entry.items.push(construirItem({ ...r, ...fechas }, hoy));
  }
  return [...porDocente.values()];
}

/** Calendario de un semestre (o el de respaldo si todavía no está cargado). */
export async function cargarCalendario(db, semestre) {
  if (!semestre) return normalizarCalendario(null, null);
  const { rows } = await db.query(
    `SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, num_semanas FROM calendario_semestres WHERE semestre = $1`,
    [semestre]
  );
  return normalizarCalendario(rows[0] ?? null, semestre);
}

/**
 * Docentes sin grupo de matriz: se evalúan con los entregables de sus iniciativas
 * (semana y fecha límite tomadas de proyecto_semanas) para no perder compatibilidad.
 */
export async function cargarItemsPorIniciativas(db, docenteId, hoy = hoyBogota()) {
  const { rows } = await db.query(
    `
    SELECT e.id AS entregable_id, e.descripcion AS entregable, COALESCE(e.completado, false) AS completado,
           e.estado_revision, e.comentario_revision, e.url_evidencia, e.fecha_real_entrega,
           e.fecha_primer_envio, e.fecha_ultimo_envio, e.num_envios, e.aprobado_en, e.revisado_en,
           e.evidencia_exenta, e.justificacion_exencion, e.porcentaje_avance,
           e.actividad_reportada, e.descripcion_reporte, e.horas AS horas_effective,
           s.numero AS semana_numero,
           to_char(s.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, to_char(s.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
           p.id AS proyecto_id, p.titulo AS proyecto_titulo, p.tipo AS proyecto_tipo
    FROM proyecto_entregables e
    JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
    JOIN proyectos p ON p.id = s.proyecto_id
    WHERE ${DOCENTE_ES_DUENO("p", "$1")}
    ORDER BY s.fecha_fin, e.id
    `,
    [docenteId]
  );
  return rows.map((r) =>
    construirItem(
      { ...r, plantilla_id: null, numero: r.entregable_id, categoria_raw: r.proyecto_tipo, mes: mesDeFecha(r.fecha_fin) },
      hoy
    )
  );
}

// ───────────────────────── Transacciones ─────────────────────────

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
      // Violación del índice único (doble clic / reintento concurrente): se reintenta una vez y se reutiliza la fila.
      if (error?.code === "23505" && intento === 0) continue;
      throw error;
    } finally {
      client.release();
    }
  }
  return null;
}

async function registrarEvento(client, { entregableId, tipo, anterior, nuevo, actorId, comentario }) {
  await client.query(
    `INSERT INTO entregable_eventos (entregable_id, tipo, estado_anterior, estado_nuevo, actor_id, comentario)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entregableId, tipo, anterior ?? null, nuevo ?? null, actorId ?? null, comentario ?? null]
  );
}

async function buscarPlantillaDelDocente(client, docenteId, plantillaId) {
  const r = await client.query(
    `SELECT tpl.* FROM plantilla_entregables tpl
     JOIN usuarios u ON u.id = $2 AND u.rol = 'docente' AND u.grupo_matriz_id = tpl.grupo_id
     WHERE tpl.id = $1`,
    [plantillaId, docenteId]
  );
  return r.rows[0] ?? null;
}

async function requisitoDeEntregable(client, fila, docenteId) {
  let tpl = null;
  if (fila.plantilla_id != null) {
    tpl = (await client.query(`SELECT * FROM plantilla_entregables WHERE id = $1`, [fila.plantilla_id])).rows[0] ?? null;
  } else {
    tpl =
      (
        await client.query(
          `SELECT tpl.* FROM plantilla_entregables tpl
           JOIN usuarios u ON u.id = $1 AND u.grupo_matriz_id = tpl.grupo_id
           WHERE tpl.semana_numero = $2
             AND (TRIM(tpl.entregable) = TRIM($3) OR TRIM(tpl.entregable) = TRIM(COALESCE($4, '')))
           ORDER BY tpl.id LIMIT 1`,
          [docenteId, fila.semana_numero, fila.descripcion, fila.actividad_reportada]
        )
      ).rows[0] ?? null;
  }
  return resolverRequisitoEvidencia(tpl ?? {});
}

const valorFecha = (v, hoy) => {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim();
  if (!esFechaISO(s)) throw new ErrorNegocio(422, "FECHA_INVALIDA", "fecha_real_entrega debe tener formato AAAA-MM-DD");
  if (s > hoy) throw new ErrorNegocio(422, "FECHA_FUTURA", "La fecha real de entrega no puede ser futura");
  return s;
};

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

/**
 * Acción del docente sobre un entregable existente (dentro de una transacción abierta).
 * accion: 'guardar_borrador' | 'enviar' | 'retirar'.
 */
async function accionDocenteTx(client, { docenteId, entregableId, accion, datos = {}, ahora, soloDesde = null }) {
  const hoy = hoyBogota(ahora);
  const sel = await client.query(
    `SELECT e.*, s.numero AS semana_numero, p.id AS proyecto_id_real
     FROM proyecto_entregables e
     JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
     JOIN proyectos p ON p.id = s.proyecto_id
     WHERE e.id = $1
     FOR UPDATE OF e`,
    [entregableId]
  );
  if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
  const fila = sel.rows[0];

  const dueno = await client.query(
    `SELECT 1 FROM proyectos p WHERE p.id = $2 AND ${DOCENTE_ES_DUENO("p", "$1")}`,
    [docenteId, fila.proyecto_id_real]
  );
  if (dueno.rowCount === 0) throw new ErrorNegocio(403, "SIN_PERMISO", "No tienes permiso para modificar este entregable");

  const estadoActual = estadoEfectivo({
    entregable_id: fila.id,
    completado: fila.completado === true,
    estado_revision: fila.estado_revision,
    url_evidencia: fila.url_evidencia,
    actividad_reportada: fila.actividad_reportada,
    descripcion_reporte: fila.descripcion_reporte,
    evidencia_exenta: fila.evidencia_exenta,
  });
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
  if (tieneUrls) add("url_evidencia", serializarUrls(datos.url_evidencia));

  if (accion === "guardar_borrador") {
    add("estado_revision", t.estado);
    if (t.estado !== "observado") {
      add("completado", false);
      set.push("fecha_completado = NULL");
    }
    if (datos.exencion !== undefined) {
      const j = String(datos.exencion || "").trim();
      add("evidencia_exenta", j.length > 0);
      add("justificacion_exencion", j || null);
    }
  } else if (accion === "retirar") {
    if (!t.sinCambios) {
      add("estado_revision", t.estado);
      add("completado", false);
      set.push("fecha_completado = NULL");
    }
  } else if (accion === "enviar") {
    const requisito = await requisitoDeEntregable(client, fila, docenteId);
    const evidencias = parseEvidencias(tieneUrls ? datos.url_evidencia : fila.url_evidencia);
    const exencion =
      datos.exencion !== undefined ? datos.exencion : fila.evidencia_exenta ? fila.justificacion_exencion : null;
    const v = validarEnvio({ requisito, evidencias, exencion });
    if (!v.ok) throw new ErrorNegocio(422, v.codigo, v.error, { requisito });
    if (t.sinCambios) {
      // Ya estaba enviado: solo se actualizan los datos del reporte, sin nuevo envío ni cambio de estado.
      add("evidencia_exenta", v.exenta);
      add("justificacion_exencion", v.exenta ? v.justificacion : null);
    } else {
    const fechaReal = valorFecha(datos.fecha_real_entrega, hoy);
    add("estado_revision", "enviado");
    add("completado", true);
    add("fecha_completado", hoy);
    add("fecha_real_entrega", fechaReal ?? fechaDesdeColumnaDate(fila.fecha_real_entrega) ?? hoy);
    add("evidencia_exenta", v.exenta);
    add("justificacion_exencion", v.exenta ? v.justificacion : null);
    set.push("comentario_revision = NULL", "revisado_en = NULL");
    set.push("fecha_primer_envio = COALESCE(fecha_primer_envio, NOW())", "fecha_ultimo_envio = NOW()");
    set.push("num_envios = COALESCE(num_envios, 0) + 1");
    }
  }

  if (set.length > 0) {
    params.push(entregableId);
    await client.query(`UPDATE proyecto_entregables SET ${set.join(", ")} WHERE id = $${params.length}`, params);
  }
  if (t.evento) {
    await registrarEvento(client, {
      entregableId,
      tipo: t.evento,
      anterior: estadoActual,
      nuevo: t.estado,
      actorId: docenteId,
    });
  }
  return { id: Number(entregableId), estado: t.estado, estado_anterior: estadoActual, sin_cambios: Boolean(t.sinCambios) };
}

export function aplicarAccionDocente(pool, params) {
  return conTransaccion(pool, (client) => accionDocenteTx(client, params));
}

/** Fecha real de entrega declarada: no futura (hora de Bogotá) y no modifica un entregable aprobado. */
export function actualizarFechaEntrega(pool, { docenteId, entregableId, fecha, ahora }) {
  return conTransaccion(pool, async (client) => {
    const hoy = hoyBogota(ahora);
    const sel = await client.query(
      `SELECT e.id, e.estado_revision, p.id AS proyecto_id
       FROM proyecto_entregables e
       JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
       JOIN proyectos p ON p.id = s.proyecto_id
       WHERE e.id = $1 FOR UPDATE OF e`,
      [entregableId]
    );
    if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
    if (!(await docenteTieneIniciativa(client, docenteId, sel.rows[0].proyecto_id))) {
      throw new ErrorNegocio(403, "SIN_PERMISO", "No tienes permiso para editar este entregable");
    }
    if (sel.rows[0].estado_revision === "aprobado") {
      throw new ErrorNegocio(409, "ESTADO_BLOQUEADO", "El entregable ya fue aprobado y no puede modificarse");
    }
    const f = valorFecha(fecha, hoy);
    if (!f) throw new ErrorNegocio(400, "FECHA_INVALIDA", "fecha_real_entrega es requerida");
    const r = await client.query(
      `UPDATE proyecto_entregables SET fecha_real_entrega = $1::date WHERE id = $2 RETURNING id`,
      [f, entregableId]
    );
    return { id: r.rows[0].id, fecha_real_entrega: f };
  });
}

/** Busca el entregable ya registrado para una plantilla: relación explícita y, si no, texto histórico. */
async function buscarEntregableDePlantilla(client, docenteId, tpl) {
  const r = await client.query(
    `
    SELECT e.id
    FROM proyecto_entregables e
    JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
    JOIN proyectos p ON p.id = s.proyecto_id
    WHERE ${DOCENTE_ES_DUENO("p", "$1")}
      AND (
        e.plantilla_id = $2
        OR (
          e.plantilla_id IS NULL AND s.numero = $3
          AND (TRIM(e.descripcion) = TRIM($4::text) OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM($4::text))
        )
      )
    ORDER BY (e.plantilla_id IS NOT DISTINCT FROM $2::int) DESC, e.id DESC
    LIMIT 1
    FOR UPDATE OF e
    `,
    [docenteId, tpl.id, tpl.semana_numero, String(tpl.entregable || "").trim()]
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Elige de forma explícita (por id) la iniciativa donde se registra un entregable de plantilla.
 * Nunca adivina entre varias: si hay más de una candidata devuelve 409 con la lista.
 */
async function resolverIniciativa(client, { docenteId, tpl, proyectoId }) {
  const cand = await client.query(
    `
    SELECT DISTINCT ON (p.id) p.id, p.titulo, p.tipo, s.id AS semana_id
    FROM proyectos p
    JOIN proyecto_semanas s ON s.proyecto_id = p.id AND s.numero = $2
    WHERE ${DOCENTE_ES_DUENO("p", "$1")}
    ORDER BY p.id, s.id
    `,
    [docenteId, tpl.semana_numero]
  );
  let candidatas = cand.rows;
  if (candidatas.length === 0) {
    throw new ErrorNegocio(422, "SIN_INICIATIVA", "No tienes una iniciativa asignada para esta semana", {
      semana_numero: tpl.semana_numero,
    });
  }
  if (proyectoId != null) {
    const elegida = candidatas.find((c) => Number(c.id) === Number(proyectoId));
    if (!elegida) {
      throw new ErrorNegocio(422, "INICIATIVA_INVALIDA", "La iniciativa indicada no corresponde a este entregable o no te pertenece");
    }
    return elegida;
  }
  const tipo = tipoIniciativaDeCategoria(categoriaSlug(tpl.categoria, tpl.fase));
  if (tipo) {
    const mismoTipo = candidatas.filter((c) => c.tipo === tipo);
    if (mismoTipo.length > 0) candidatas = mismoTipo;
  }
  if (candidatas.length > 1) {
    // Preferir la iniciativa donde ya están registrados otros entregables de la misma categoría/fase (por ids).
    const previas = await client.query(
      `
      SELECT DISTINCT s.proyecto_id
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN plantilla_entregables t2 ON t2.id = e.plantilla_id
      WHERE t2.grupo_id = $1
        AND t2.categoria IS NOT DISTINCT FROM $2
        AND t2.fase IS NOT DISTINCT FROM $3
        AND s.proyecto_id = ANY($4::int[])
      `,
      [tpl.grupo_id, tpl.categoria, tpl.fase, candidatas.map((c) => Number(c.id))]
    );
    if (previas.rowCount === 1) {
      const id = Number(previas.rows[0].proyecto_id);
      return candidatas.find((c) => Number(c.id) === id);
    }
  }
  if (candidatas.length > 1) {
    throw new ErrorNegocio(
      409,
      "INICIATIVA_AMBIGUA",
      "Tienes varias iniciativas para este entregable; indica a cuál corresponde (proyecto_id)",
      { candidatos: candidatas.map((c) => ({ id: Number(c.id), titulo: c.titulo, tipo: c.tipo })) }
    );
  }
  return candidatas[0];
}

/**
 * Marca como enviado / retira un entregable desde la matriz (crea el registro si no existe).
 * Todo en una transacción: si la validación de evidencia falla no queda ninguna fila a medias.
 */
export function registrarDesdeMatriz(pool, { docenteId, plantillaId, completado, proyectoId = null, datos = {}, ahora }) {
  return conTransaccion(pool, async (client) => {
    const tpl = await buscarPlantillaDelDocente(client, docenteId, plantillaId);
    if (!tpl) throw new ErrorNegocio(404, "PLANTILLA_NO_ENCONTRADA", "Plantilla no encontrada");
    if (tpl.semana_numero == null || Number.isNaN(Number(tpl.semana_numero))) {
      throw new ErrorNegocio(400, "PLANTILLA_SIN_SEMANA", "Plantilla sin semana_numero");
    }

    let entregableId = await buscarEntregableDePlantilla(client, docenteId, tpl);
    if (entregableId == null) {
      if (!completado) return { ok: true, entregable_id: null, estado: "no_iniciado", sin_cambios: true };
      const iniciativa = await resolverIniciativa(client, { docenteId, tpl, proyectoId });
      const ins = await client.query(
        `INSERT INTO proyecto_entregables
           (proyecto_semana_id, descripcion, horas, completado, estado_revision, plantilla_id)
         VALUES ($1, $2, $3, false, 'borrador', $4)
         RETURNING id`,
        [iniciativa.semana_id, String(tpl.entregable || "").trim(), tpl.horas != null ? Number(tpl.horas) : null, tpl.id]
      );
      entregableId = ins.rows[0].id;
    } else {
      // Adopta la relación explícita en filas históricas, sin pisar otra ya existente.
      await client.query(
        `UPDATE proyecto_entregables e SET plantilla_id = $1
         WHERE e.id = $2 AND e.plantilla_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM proyecto_entregables x
             WHERE x.plantilla_id = $1 AND x.proyecto_semana_id = e.proyecto_semana_id
           )`,
        [tpl.id, entregableId]
      );
    }

    const out = await accionDocenteTx(client, {
      docenteId,
      entregableId,
      accion: completado ? "enviar" : "retirar",
      datos,
      ahora,
    });
    return { ok: true, entregable_id: out.id, estado: out.estado, sin_cambios: out.sin_cambios };
  });
}

/** Decisión del administrador (aprobar / observar) sobre un entregable enviado. */
export function aplicarRevisionAdmin(pool, { entregableId, estadoNuevo, comentario, actorId = null }) {
  return conTransaccion(pool, async (client) => {
    const sel = await client.query(`SELECT * FROM proyecto_entregables WHERE id = $1 FOR UPDATE`, [entregableId]);
    if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
    const fila = sel.rows[0];
    const estadoActual = estadoEfectivo({
      entregable_id: fila.id,
      completado: fila.completado === true,
      estado_revision: fila.estado_revision,
      url_evidencia: fila.url_evidencia,
      actividad_reportada: fila.actividad_reportada,
      descripcion_reporte: fila.descripcion_reporte,
      evidencia_exenta: fila.evidencia_exenta,
    });
    const t = transicionAdmin(estadoActual, estadoNuevo, { comentario });
    if (!t.ok) throw new ErrorNegocio(t.codigo === "NO_ENVIADO" || t.codigo === "ESTADO_BLOQUEADO" ? 409 : 400, t.codigo, t.error);
    if (t.sinCambios) return { ok: true, estado: t.estado, sin_cambios: true };

    await client.query(
      `UPDATE proyecto_entregables
       SET estado_revision = $1, comentario_revision = $2, revisado_en = NOW(),
           aprobado_en = CASE WHEN $1 = 'aprobado' THEN NOW() ELSE NULL END,
           completado = true
       WHERE id = $3`,
      [t.estado, String(comentario ?? "").trim() || null, entregableId]
    );
    await registrarEvento(client, {
      entregableId,
      tipo: t.evento,
      anterior: estadoActual,
      nuevo: t.estado,
      actorId,
      comentario: String(comentario ?? "").trim() || null,
    });
    return { ok: true, estado: t.estado, sin_cambios: false };
  });
}

/** Procedimiento controlado para devolver un aprobado a revisión (solo administradores, con motivo). */
export function reabrirEntregable(pool, { entregableId, actorId, motivo, destino = "enviado" }) {
  return conTransaccion(pool, async (client) => {
    const admin = await client.query(`SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'admin'`, [actorId]);
    if (admin.rowCount === 0) throw new ErrorNegocio(403, "SOLO_ADMIN", "Solo un administrador puede reabrir un entregable aprobado");
    const sel = await client.query(`SELECT * FROM proyecto_entregables WHERE id = $1 FOR UPDATE`, [entregableId]);
    if (sel.rowCount === 0) throw new ErrorNegocio(404, "NO_ENCONTRADO", "Entregable no encontrado");
    const fila = sel.rows[0];
    const estadoActual = estadoEfectivo({ entregable_id: fila.id, completado: fila.completado === true, estado_revision: fila.estado_revision });
    const t = transicionReapertura(estadoActual, { motivo, destino });
    if (!t.ok) throw new ErrorNegocio(409, t.codigo, t.error);
    await client.query(
      `UPDATE proyecto_entregables
       SET estado_revision = $1, aprobado_en = NULL, revisado_en = NOW(),
           comentario_revision = $2
       WHERE id = $3`,
      [t.estado, destino === "observado" ? String(motivo).trim() : null, entregableId]
    );
    await registrarEvento(client, {
      entregableId,
      tipo: t.evento,
      anterior: estadoActual,
      nuevo: t.estado,
      actorId,
      comentario: String(motivo).trim(),
    });
    return { ok: true, estado: t.estado };
  });
}

/** ¿El docente es responsable o colaborador de la iniciativa? */
export async function docenteTieneIniciativa(db, docenteId, proyectoId) {
  const r = await db.query(`SELECT 1 FROM proyectos p WHERE p.id = $2 AND ${DOCENTE_ES_DUENO("p", "$1")}`, [docenteId, proyectoId]);
  return r.rowCount > 0;
}
