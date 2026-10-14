// Evidencias por entregable (Bloque 3): análisis de enlaces, versiones y consultas.
// - Funciones puras (analizarEnlace): sin BD ni red.
// - sincronizarEvidencias: se llama SIEMPRE dentro de la transacción del flujo de entregables
//   (entregableWorkflowService); mantiene entregable_evidencias alineada con url_evidencia.
// Nunca se borran filas: una evidencia cambiada queda como «reemplazada» (versión anterior) y una
// que no llegó a enviarse como «retirada».
import { parseEvidencias } from "./matrizService.js";

const HOSTS_DRIVE = ["drive.google.com", "drive.usercontent.google.com"];
const ID_DRIVE = /^[A-Za-z0-9_-]{5,128}$/;

const hostEs = (host, base) => host === base || host.endsWith(`.${base}`);

/**
 * Interpreta un enlace de evidencia.
 * @returns {{url:string, clave:string, tipo_enlace:string, drive_id:string|null}|null} null si no es http(s) válido.
 */
export function analizarEnlace(valor) {
  let u;
  try {
    u = new URL(String(valor || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const partes = u.pathname.split("/").filter(Boolean);
  let tipo = "otro";
  let driveId = null;
  const idDe = (candidato) => (candidato && ID_DRIVE.test(candidato) ? candidato : null);

  if (HOSTS_DRIVE.some((h) => hostEs(host, h))) {
    const iFile = partes.indexOf("d");
    const iFolder = partes.indexOf("folders");
    if (partes[0] === "file" && iFile >= 0) {
      tipo = "drive_archivo";
      driveId = idDe(partes[iFile + 1]);
    } else if (iFolder >= 0) {
      tipo = "drive_carpeta";
      driveId = idDe(partes[iFolder + 1]);
    } else if (u.searchParams.get("id")) {
      tipo = "drive_archivo";
      driveId = idDe(u.searchParams.get("id"));
    } else {
      tipo = "drive_archivo";
    }
  } else if (host === "docs.google.com") {
    const tipoDoc = partes[0];
    if (tipoDoc === "forms") tipo = "formulario";
    else if (tipoDoc === "spreadsheets") tipo = "google_hoja";
    else if (tipoDoc === "presentation") tipo = "google_presentacion";
    else if (["document", "drawings"].includes(tipoDoc)) tipo = "google_doc";
    const iD = partes.indexOf("d");
    if (iD >= 0 && tipo !== "formulario") driveId = idDe(partes[iD + 1]);
  } else if (hostEs(host, "forms.gle") || hostEs(host, "forms.office.com") || hostEs(host, "zohopublic.com")) {
    tipo = "formulario";
  }

  const ruta = u.pathname.replace(/\/+$/, "");
  const clave = driveId ? `drive:${driveId}` : `${host}${ruta}${u.search}`.toLowerCase();
  return { url: u.toString(), clave, tipo_enlace: tipo, drive_id: driveId };
}

/** Enlaces únicos (por clave) conservando el orden de entrada; ignora los no analizables. */
export function enlacesUnicos(urls) {
  const vistos = new Set();
  const out = [];
  for (const raw of Array.isArray(urls) ? urls : parseEvidencias(urls)) {
    const a = analizarEnlace(raw);
    if (!a || vistos.has(a.clave)) continue;
    vistos.add(a.clave);
    out.push({ ...a, url: String(raw).trim() });
  }
  return out;
}

const COLS_PUBLICAS = `id, entregable_id, url, tipo_enlace, drive_id, titulo, envio_numero, estado, creado_por, creado_en, reemplazada_en`;

/** Contexto inequívoco del entregable: iniciativa, plantilla, docente y semestre. */
async function contextoDeEntregable(client, entregableId) {
  const r = await client.query(
    `SELECT e.id, e.docente_id, e.plantilla_id, s.proyecto_id, g.semestre
     FROM proyecto_entregables e
     JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
     LEFT JOIN plantilla_entregables t ON t.id = e.plantilla_id
     LEFT JOIN grupos_matriz g ON g.id = t.grupo_id
     WHERE e.id = $1`,
    [entregableId]
  );
  return r.rows[0] ?? null;
}

/**
 * Alinea las evidencias del entregable con la lista de enlaces indicada (transacción abierta).
 * - enlaces nuevos  -> se insertan (envio_numero NULL hasta el envío);
 * - enlaces que ya no están -> «reemplazada» si ya habían sido enviados, «retirada» si eran borrador;
 * - con `envioNumero` -> las vigentes aún sin ronda quedan asociadas a ese envío.
 */
export async function sincronizarEvidencias(client, { entregableId, docenteId, urls, actorId = null, envioNumero = null }) {
  const ctx = await contextoDeEntregable(client, entregableId);
  if (!ctx) return { vigentes: [], nuevas: 0, cerradas: 0 };
  const deseadas = enlacesUnicos(urls);
  const claves = new Set(deseadas.map((d) => d.clave));

  const actuales = (await client.query(`SELECT id, url_clave, envio_numero FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente' FOR UPDATE`, [entregableId])).rows;
  let cerradas = 0;
  for (const fila of actuales) {
    if (claves.has(fila.url_clave)) continue;
    await client.query(`UPDATE entregable_evidencias SET estado = $2, reemplazada_en = NOW() WHERE id = $1`, [fila.id, fila.envio_numero == null ? "retirada" : "reemplazada"]);
    cerradas += 1;
  }
  const existentes = new Set(actuales.map((a) => a.url_clave));
  let nuevas = 0;
  for (const d of deseadas) {
    if (existentes.has(d.clave)) continue;
    await client.query(
      `INSERT INTO entregable_evidencias (entregable_id, docente_id, proyecto_id, plantilla_id, semestre, url, url_clave, tipo_enlace, drive_id, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [entregableId, docenteId ?? ctx.docente_id ?? null, ctx.proyecto_id, ctx.plantilla_id, ctx.semestre, d.url, d.clave, d.tipo_enlace, d.drive_id, actorId]
    );
    nuevas += 1;
  }
  if (envioNumero != null) {
    await client.query(`UPDATE entregable_evidencias SET envio_numero = $2 WHERE entregable_id = $1 AND estado = 'vigente' AND envio_numero IS NULL`, [entregableId, envioNumero]);
  }
  const vigentes = (await client.query(`SELECT ${COLS_PUBLICAS} FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente' ORDER BY id`, [entregableId])).rows;
  return { vigentes, nuevas, cerradas };
}

/** Referencia compacta para el historial (entregable_eventos.detalle). */
export const instantanea = (vigentes) => vigentes.map((v) => ({ id: Number(v.id), url: v.url, tipo_enlace: v.tipo_enlace, drive_id: v.drive_id, envio_numero: v.envio_numero }));

export async function instantaneaDeEntregable(client, entregableId) {
  const r = await client.query(`SELECT ${COLS_PUBLICAS} FROM entregable_evidencias WHERE entregable_id = $1 AND estado = 'vigente' ORDER BY id`, [entregableId]);
  return instantanea(r.rows);
}

/** Todas las versiones (vigentes y anteriores) de varios entregables: Map(entregable_id -> filas). */
export async function evidenciasDeEntregables(pool, entregableIds) {
  const mapa = new Map();
  if (!entregableIds.length) return mapa;
  const r = await pool.query(`SELECT ${COLS_PUBLICAS} FROM entregable_evidencias WHERE entregable_id = ANY($1::int[]) ORDER BY entregable_id, id`, [entregableIds]);
  for (const fila of r.rows) {
    const lista = mapa.get(fila.entregable_id) ?? [];
    lista.push({ ...fila, id: Number(fila.id) });
    mapa.set(fila.entregable_id, lista);
  }
  return mapa;
}

/** Iniciativa REAL (la del reporte guardado) y marca de problema de acceso: Map(entregable_id -> {id, titulo, tipo, problema_acceso_en}). */
export async function iniciativasDeEntregables(pool, entregableIds) {
  const mapa = new Map();
  if (!entregableIds.length) return mapa;
  const r = await pool.query(
    `SELECT e.id AS entregable_id, p.id, p.titulo, p.tipo, e.problema_acceso_en
     FROM proyecto_entregables e
     JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
     JOIN proyectos p ON p.id = s.proyecto_id
     WHERE e.id = ANY($1::int[])`,
    [entregableIds]
  );
  for (const f of r.rows) mapa.set(f.entregable_id, { id: f.id, titulo: f.titulo, tipo: f.tipo, problema_acceso_en: f.problema_acceso_en });
  return mapa;
}

/** Línea de tiempo del entregable: eventos (con actor) y versiones de evidencias. Solo lectura. */
export async function historialDeEntregable(pool, entregableId) {
  const eventos = await pool.query(
    `SELECT ev.id, ev.tipo, ev.estado_anterior, ev.estado_nuevo, ev.comentario, ev.creado_en, ev.detalle,
            ev.actor_id, NULLIF(TRIM(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), '') AS actor_nombre, u.rol AS actor_rol
     FROM entregable_eventos ev
     LEFT JOIN usuarios u ON u.id = ev.actor_id
     WHERE ev.entregable_id = $1
     ORDER BY ev.creado_en, ev.id`,
    [entregableId]
  );
  const evidencias = (await evidenciasDeEntregables(pool, [Number(entregableId)])).get(Number(entregableId)) ?? [];
  return { eventos: eventos.rows.map((e) => ({ ...e, id: Number(e.id) })), evidencias };
}

/** Rellena entregable_evidencias para entregables con url_evidencia anterior al Bloque 3. Idempotente. */
export async function rellenarEvidenciasExistentes(pool) {
  const filas = (await pool.query(
    `SELECT e.id, e.docente_id, e.url_evidencia, e.num_envios, e.estado_revision
     FROM proyecto_entregables e
     WHERE e.url_evidencia IS NOT NULL AND e.url_evidencia <> ''
       AND NOT EXISTS (SELECT 1 FROM entregable_evidencias x WHERE x.entregable_id = e.id)
     ORDER BY e.id`
  )).rows;
  let creadas = 0;
  for (const f of filas) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const enviado = f.estado_revision !== "borrador";
      const out = await sincronizarEvidencias(client, {
        entregableId: f.id,
        docenteId: f.docente_id,
        urls: f.url_evidencia,
        envioNumero: enviado ? Math.max(1, Number(f.num_envios) || 1) : null,
      });
      creadas += out.nuevas;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return { entregables: filas.length, evidencias: creadas };
}

// ───────────────────────── Centro de evidencias (vista del docente) ─────────────────────────

/**
 * Qué necesita hacer el docente con la evidencia de un entregable (ya clasificado por matrizService):
 *  sin_requisito | sin_evidencia | borrador | observada | en_revision | aprobada
 */
export function situacionEvidencia(item, vigentes) {
  if (item.estado === "aprobado") return "aprobada";
  if (item.estado === "enviado") return "en_revision";
  if (item.estado === "observado") return "observada";
  const tiene = vigentes.length > 0 || item.evidencia_exenta === true;
  if (!item.requiere_evidencia && !tiene) return "sin_requisito";
  return tiene ? "borrador" : "sin_evidencia";
}

export const SITUACIONES = ["sin_evidencia", "borrador", "observada", "en_revision", "aprobada", "sin_requisito"];

/** Une los ítems de la matriz (itemParaApi) con sus evidencias versionadas. Solo lectura. */
export function armarCentroEvidencias(items, mapa, iniciativasReales = new Map()) {
  const salida = items.map((it) => {
    const todas = (it.entregable_id && mapa.get(it.entregable_id)) || [];
    const vigentes = todas.filter((e) => e.estado === "vigente");
    const anteriores = todas.filter((e) => e.estado !== "vigente");
    const situacion = situacionEvidencia(it, vigentes);
    // La iniciativa del reporte guardado manda; si aún no existe se muestra la inferida por categoría (o ninguna).
    const real = it.entregable_id ? iniciativasReales.get(it.entregable_id) : null;
    const bloqueado = it.estado === "aprobado";
    return {
      plantilla_id: it.plantilla_id,
      entregable_id: it.entregable_id ?? null,
      numero: it.numero,
      entregable: it.entregable,
      mes: it.mes,
      semana_numero: it.semana_numero,
      iniciativa_id: real?.id ?? it.iniciativa_id ?? null,
      iniciativa_titulo: real?.titulo ?? it.iniciativa_titulo ?? null,
      iniciativa_tipo: real?.tipo ?? it.iniciativa_tipo ?? null,
      fecha_inicio: it.fecha_inicio_calculada ?? null,
      fecha_fin: it.fecha_fin_calculada ?? null,
      estado: it.estado,
      situacion,
      vencido: it.vencido === true,
      entrega_tardia: it.entrega_tardia === true,
      requiere_evidencia: it.requiere_evidencia,
      tipo_evidencia: it.tipo_evidencia,
      descripcion_evidencia: it.descripcion_evidencia || "",
      enlace_referencia: it.enlace_referencia ?? null,
      comentario_revision: it.comentario_revision ?? null,
      revisado_en: it.revisado_en ?? null,
      num_envios: it.num_envios ?? 0,
      fecha_primer_envio: it.fecha_primer_envio ?? null,
      fecha_real_entrega: it.fecha_real_entrega ?? null,
      evidencia_exenta: it.evidencia_exenta === true,
      justificacion_exencion: it.justificacion_exencion ?? null,
      problema_acceso: real?.problema_acceso_en != null && it.estado === "observado",
      problema_acceso_en: real?.problema_acceso_en ?? null,
      evidencias: vigentes,
      versiones_anteriores: anteriores,
      puede_editar: !bloqueado,
    };
  });
  const resumen = { total: salida.length, vencidos_sin_enviar: 0 };
  for (const s of SITUACIONES) resumen[s] = 0;
  for (const s of salida) {
    resumen[s.situacion] += 1;
    if (s.vencido && s.estado !== "aprobado" && s.estado !== "enviado") resumen.vencidos_sin_enviar += 1;
  }
  return { items: salida, resumen };
}
