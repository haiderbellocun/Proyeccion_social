// Protección de la historia de ProySocial frente a operaciones administrativas.
//
// Un registro (plantilla, grupo, semestre o usuario) con reportes, entregables, evidencias, versiones o eventos que dependan
// de él NO puede eliminarse ni modificarse de forma que reescriba esa historia, en ningún estado del reporte (no solo aprobado)
// y sin opción de «forzar». Estas comprobaciones viven en el backend: no dependen de que el frontend oculte botones.
//
// Atomicidad: cada función espera un `client` dentro de una transacción. Quien las usa debe tomar ANTES el bloqueo de la fila
// afectada (`FOR UPDATE`) y luego contar en la misma transacción: una inserción concurrente de un reporte toma un bloqueo
// compartido sobre esa fila (por la clave foránea) y queda serializada con la comprobación.
import { ErrorNegocio } from "./matrizService.js";

export const HISTORICO_PROTEGIDO = "HISTORICO_PROTEGIDO";

/** Clave del bloqueo consultivo que serializa los cambios que pueden dejar al sistema sin administradores activos. */
export const LOCK_ADMINISTRADORES = 7310002;

const n = (row, k) => Number(row?.[k] ?? 0);

/** Error 409 con el mismo formato que usa el resto de la API: { error, codigo, ...extra }. */
export function errorHistorico(mensaje, resumen, alternativa) {
  return new ErrorNegocio(409, HISTORICO_PROTEGIDO, mensaje, { resumen, ...(alternativa ? { alternativa } : {}) });
}

const plural = (cantidad, uno, varios) => `${cantidad} ${cantidad === 1 ? uno : varios}`;

/** Texto breve de lo que depende del registro, p. ej. «3 entregables, 2 evidencias y 5 eventos de historial». */
export function describirResumen(r) {
  const partes = [];
  if (r.entregables) partes.push(plural(r.entregables, "entregable", "entregables"));
  if (r.evidencias) partes.push(plural(r.evidencias, "evidencia", "evidencias"));
  if (r.eventos) partes.push(plural(r.eventos, "evento de historial", "eventos de historial"));
  if (r.importaciones) partes.push(plural(r.importaciones, "importación de Excel", "importaciones de Excel"));
  if (r.docentes) partes.push(plural(r.docentes, "docente asignado", "docentes asignados"));
  if (r.excepciones_movidas) partes.push(plural(r.excepciones_movidas, "entregable que cambiaría de iniciativa o semana", "entregables que cambiarían de iniciativa o semana"));
  if (partes.length === 0) return "";
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Bloquea las plantillas de los grupos indicados (ids ordenados para evitar interbloqueos) y devuelve sus ids. */
export async function bloquearPlantillasDeGrupos(client, grupoIds) {
  const r = await client.query(`SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [grupoIds]);
  return r.rows.map((x) => Number(x.id));
}

/** Historia que depende de un conjunto de plantillas: entregables, evidencias (incluye versiones) y eventos. */
export async function historicoDePlantillas(client, plantillaIds) {
  if (!plantillaIds.length) return { entregables: 0, evidencias: 0, eventos: 0, total: 0 };
  const r = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM proyecto_entregables WHERE plantilla_id = ANY($1::int[]))::int AS entregables,
       (SELECT COUNT(*) FROM entregable_evidencias WHERE plantilla_id = ANY($1::int[]))::int AS evidencias,
       (SELECT COUNT(*) FROM entregable_eventos WHERE plantilla_id = ANY($1::int[]))::int AS eventos`,
    [plantillaIds]
  );
  const x = r.rows[0];
  const out = { entregables: n(x, "entregables"), evidencias: n(x, "evidencias"), eventos: n(x, "eventos") };
  return { ...out, total: out.entregables + out.evidencias + out.eventos };
}

/** ¿Cuáles de estas plantillas tienen historia? (para la actualización masiva, que protege solo las afectadas). */
export async function plantillasConHistorico(client, plantillaIds) {
  if (!plantillaIds.length) return new Set();
  const r = await client.query(
    `SELECT id FROM plantilla_entregables p
     WHERE p.id = ANY($1::int[])
       AND (EXISTS (SELECT 1 FROM proyecto_entregables e WHERE e.plantilla_id = p.id)
         OR EXISTS (SELECT 1 FROM entregable_evidencias v WHERE v.plantilla_id = p.id)
         OR EXISTS (SELECT 1 FROM entregable_eventos ev WHERE ev.plantilla_id = p.id))`,
    [plantillaIds]
  );
  return new Set(r.rows.map((x) => Number(x.id)));
}

/** Historia de un grupo: la de sus plantillas, más las importaciones de Excel que lo crearon o actualizaron. */
export async function historicoDeGrupos(client, grupoIds, plantillaIds) {
  const base = await historicoDePlantillas(client, plantillaIds);
  const imp = await client.query(`SELECT COUNT(*)::int AS n FROM importaciones_matriz WHERE grupo_id = ANY($1::int[])`, [grupoIds]);
  const importaciones = n(imp.rows[0], "n");
  return { ...base, importaciones, total: base.total + importaciones };
}

/** Docentes asignados a los grupos (relación académica vigente: no se desvincula para poder eliminar). */
export async function docentesDeGrupos(client, grupoIds) {
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE grupo_matriz_id = ANY($1::int[])`, [grupoIds]);
  return n(r.rows[0], "n");
}

/** Historia de un semestre: la de todos sus grupos y las evidencias etiquetadas con el semestre. */
export async function historicoDeSemestre(client, codigo, grupoIds, plantillaIds) {
  const base = await historicoDeGrupos(client, grupoIds, plantillaIds);
  const ev = await client.query(`SELECT COUNT(*)::int AS n FROM entregable_evidencias WHERE semestre = $1`, [codigo]);
  const imp = await client.query(`SELECT COUNT(*)::int AS n FROM importaciones_matriz WHERE semestre = $1 AND (grupo_id IS NULL OR NOT (grupo_id = ANY($2::int[])))`, [codigo, grupoIds]);
  const evidencias = Math.max(base.evidencias, n(ev.rows[0], "n"));
  const importaciones = base.importaciones + n(imp.rows[0], "n");
  return { ...base, evidencias, importaciones, total: base.entregables + evidencias + base.eventos + importaciones };
}

/**
 * Historia de un usuario: reportes y evidencias propias, eventos donde figura como docente o como actor,
 * evidencias que creó e importaciones o ajustes administrativos que hizo.
 */
export async function historicoDeUsuario(client, usuarioId) {
  const r = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM proyecto_entregables WHERE docente_id = $1)::int AS entregables,
       (SELECT COUNT(*) FROM entregable_evidencias WHERE docente_id = $1 OR creado_por = $1)::int AS evidencias,
       (SELECT COUNT(*) FROM entregable_eventos WHERE docente_id = $1 OR actor_id = $1)::int AS eventos,
       ((SELECT COUNT(*) FROM importaciones_matriz WHERE usuario_id = $1)
        + (SELECT COUNT(*) FROM docente_entregable_excepciones WHERE creado_por = $1)
        + (SELECT COUNT(*) FROM actualizaciones_masivas_entregables WHERE creado_por = $1))::int AS importaciones`,
    [usuarioId]
  );
  const x = r.rows[0];
  const out = { entregables: n(x, "entregables"), evidencias: n(x, "evidencias"), eventos: n(x, "eventos"), importaciones: n(x, "importaciones") };
  return { ...out, total: out.entregables + out.evidencias + out.eventos + out.importaciones };
}

/**
 * Reasignar a un docente a otro grupo (o quitarle el grupo) dejaría sus reportes vinculados a plantillas de otro grupo
 * fuera de su matriz y de los indicadores. Hasta contar con el modelo histórico de asignaciones, se bloquea.
 * Debe llamarse con la fila del docente ya bloqueada (`FOR UPDATE`).
 */
export async function historicoDeAsignacion(client, docenteId, grupoDestino) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS entregables
     FROM proyecto_entregables e
     JOIN plantilla_entregables t ON t.id = e.plantilla_id
     WHERE e.docente_id = $1 AND t.grupo_id IS DISTINCT FROM $2::int`,
    [docenteId, grupoDestino]
  );
  return { entregables: n(r.rows[0], "entregables") };
}

/** Lanza el 409 estándar si la asignación comprometería reportes anteriores. */
export async function exigirAsignacionSinHistorico(client, docenteId, grupoDestino) {
  const h = await historicoDeAsignacion(client, docenteId, grupoDestino);
  if (h.entregables > 0) {
    throw errorHistorico(
      `No se puede cambiar el grupo de este docente: tiene ${describirResumen(h)} vinculados a su grupo actual y la reasignación los dejaría fuera de su matriz y de los indicadores. ` +
        "Se habilitará cuando exista el historial de asignaciones por semestre.",
      h,
      "Mantén al docente en su grupo actual; para un nuevo periodo, crea el grupo del semestre siguiente cuando el historial de asignaciones esté disponible."
    );
  }
}
