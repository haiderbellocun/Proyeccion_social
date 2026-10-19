// Alcance por semestre de las métricas administrativas (Bloque 2, CR-01).
//
// Todas las pantallas de coordinación miden UN semestre a la vez. Este módulo concentra:
//   1. cómo se interpreta el parámetro `semestre` (ausente = semestre activo; inválido = 400; inexistente = 404);
//   2. de qué semestre es cada entregable (SQL único, sin duplicar filas), y
//   3. el bloque aditivo `alcance` que las respuestas devuelven para que el cliente sepa qué se midió y con qué criterio.
//
// Reglas de atribución (solo relaciones almacenadas; no se infiere ninguna asignación histórica):
//   · Un entregable con plantilla pertenece al semestre de SU plantilla (plantilla → grupo → semestre), sin importar a qué grupo
//     pertenezca hoy el docente.
//   · Un entregable sin plantilla (de la iniciativa) NO tiene un vínculo almacenado con el periodo académico (`proyectos` y
//     `proyecto_semanas` no tienen semestre). La única relación verificable son las fechas: se atribuye al semestre solo si
//     EXACTAMENTE UNO contiene el inicio de su semana. Si ninguno (hueco) o más de uno (solapamiento) lo contiene, no se atribuye
//     a ninguno (no se elige uno arbitrariamente) y las respuestas lo informan en `alcance`.
//   · Un docente pertenece al semestre de su grupo VIGENTE (`usuarios.grupo_matriz_id`): no existe historia de asignación (AL-01).
import { ErrorNegocio, normalizarCalendario, semanaActual } from "./matrizService.js";

const SEMESTRE_RE = /^\d{4}[AB]$/;

/** Lee `?semestre=`: vacío/ausente → null; varios valores, formato inválido o «todos» → 400. */
export function leerSemestreParam(query) {
  const crudo = query?.semestre;
  if (crudo == null) return null;
  if (Array.isArray(crudo) || typeof crudo === "object") {
    throw new ErrorNegocio(400, "SEMESTRE_INVALIDO", "El parámetro semestre debe enviarse una sola vez, con formato año + A o B (p. ej. 2026B).");
  }
  const texto = String(crudo).trim();
  if (texto === "") return null;
  const codigo = texto.toUpperCase();
  if (!SEMESTRE_RE.test(codigo)) {
    throw new ErrorNegocio(400, "SEMESTRE_INVALIDO", `Semestre inválido «${texto.slice(0, 20)}»: use el formato año + A o B (p. ej. 2026B).`);
  }
  return codigo;
}

/**
 * Semestre consultado. Sin parámetro se usa el activo; si no hay activo, `codigo` es null y las respuestas salen vacías con una
 * advertencia (no se sustituye por otro semestre). Un código con formato válido que no existe responde 404.
 */
export async function resolverSemestre(db, codigoSolicitado) {
  if (codigoSolicitado) {
    const r = await db.query(`SELECT codigo, fecha_inicio, fecha_fin, numero_semanas, activo FROM semestres WHERE codigo = $1`, [codigoSolicitado]);
    if (r.rowCount === 0) throw new ErrorNegocio(404, "SEMESTRE_NO_ENCONTRADO", `El semestre ${codigoSolicitado} no existe.`);
    return { fila: r.rows[0], codigo: r.rows[0].codigo, activo: r.rows[0].activo === true, origen: "parametro", calendario: normalizarCalendario(r.rows[0]) };
  }
  const r = await db.query(`SELECT codigo, fecha_inicio, fecha_fin, numero_semanas, activo FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`);
  if (r.rowCount === 0) return { fila: null, codigo: null, activo: false, origen: "semestre_activo", calendario: null };
  return { fila: r.rows[0], codigo: r.rows[0].codigo, activo: true, origen: "semestre_activo", calendario: normalizarCalendario(r.rows[0]) };
}

/**
 * Entregables del semestre `$paramIdx` (una fila por entregable; sin duplicados por relaciones múltiples). Se usa como CTE
 * `ent` con columnas: id, completado, estado_revision, fecha_real_entrega, fecha_completado, semana, proyecto_id,
 * plantilla_id, docente_id, semestre_plantilla.
 */
export function cteEntregablesDelSemestre(paramIdx = 1) {
  const p = `$${paramIdx}`;
  return `
  sem AS (SELECT codigo, fecha_inicio, fecha_fin FROM semestres WHERE codigo = ${p}),
  ent AS (
    SELECT pe.id, pe.completado, pe.estado_revision, pe.fecha_real_entrega, pe.fecha_completado,
           ps.numero AS semana, ps.proyecto_id, pe.plantilla_id, pe.docente_id, gm.semestre AS semestre_plantilla
    FROM proyecto_entregables pe
    JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
    LEFT JOIN plantilla_entregables tpl ON tpl.id = pe.plantilla_id
    LEFT JOIN grupos_matriz gm ON gm.id = tpl.grupo_id
    CROSS JOIN sem
    WHERE gm.semestre = sem.codigo
       OR (pe.plantilla_id IS NULL
           AND ps.fecha_inicio BETWEEN sem.fecha_inicio AND sem.fecha_fin
           AND NOT EXISTS (
             SELECT 1 FROM semestres o
             WHERE o.codigo <> sem.codigo AND ps.fecha_inicio BETWEEN o.fecha_inicio AND o.fecha_fin))
  )`;
}

/** Iniciativas en ejecución cuyo cronograma (inicio + semanas) toca las fechas del semestre. */
export async function contarProyectosActivos(db, fila) {
  if (!fila) return 0;
  const r = await db.query(
    `SELECT COUNT(*)::int AS total FROM proyectos
     WHERE estado = 'en_ejecucion'
       AND fecha_inicio <= $2::date
       AND (fecha_inicio + (semanas * 7 - 1) * INTERVAL '1 day')::date >= $1::date`,
    [fila.fecha_inicio, fila.fecha_fin]
  );
  return Number(r.rows[0]?.total ?? 0);
}

/**
 * Bloque aditivo `alcance`. `vacio` = el semestre no tiene docentes ni entregables que medir. Advierte (no oculta) cuando hay reportes del
 * semestre que no pueden asociarse a un docente de su matriz vigente (por no existir historia de asignación).
 */
export async function construirAlcance(db, semestre, { hoy, vacio, extraAdvertencias = [] }) {
  const advertencias = [...extraAdvertencias];
  let fueraDeMatriz = 0;
  let sinGrupo = 0;
  let porFecha = 0;
  let sinSemestre = 0;
  let ambiguos = 0;
  if (semestre.codigo) {
    const r = await db.query(
      `WITH ${cteEntregablesDelSemestre(1)}
       SELECT COUNT(*)::int AS n
       FROM ent
       LEFT JOIN usuarios u ON u.id = ent.docente_id
       LEFT JOIN grupos_matriz g ON g.id = u.grupo_matriz_id
       WHERE ent.plantilla_id IS NOT NULL AND (u.id IS NULL OR g.semestre IS DISTINCT FROM ent.semestre_plantilla)`,
      [semestre.codigo]
    );
    fueraDeMatriz = Number(r.rows[0]?.n ?? 0);
    const g = await db.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'docente' AND grupo_matriz_id IS NULL`);
    sinGrupo = Number(g.rows[0]?.n ?? 0);
    // Entregables sin plantilla: atribuidos a este semestre solo por fechas, y los que ningún semestre puede reclamar.
    const pf = await db.query(`WITH ${cteEntregablesDelSemestre(1)} SELECT COUNT(*) FILTER (WHERE plantilla_id IS NULL)::int AS n FROM ent`, [semestre.codigo]);
    porFecha = Number(pf.rows[0]?.n ?? 0);
    const sd = await db.query(
      `SELECT COUNT(*) FILTER (WHERE n = 0)::int AS sin_semestre, COUNT(*) FILTER (WHERE n > 1)::int AS ambiguos
       FROM (SELECT (SELECT COUNT(*) FROM semestres s WHERE ps.fecha_inicio BETWEEN s.fecha_inicio AND s.fecha_fin) AS n
             FROM proyecto_entregables pe JOIN proyecto_semanas ps ON ps.id = pe.proyecto_semana_id
             WHERE pe.plantilla_id IS NULL) x`
    );
    sinSemestre = Number(sd.rows[0]?.sin_semestre ?? 0);
    ambiguos = Number(sd.rows[0]?.ambiguos ?? 0);
  }
  if (!semestre.codigo) advertencias.push("No hay un semestre activo: sin parámetro `semestre` no hay periodo que medir.");
  if (fueraDeMatriz > 0) {
    advertencias.push(
      `${fueraDeMatriz} entregable(s) del semestre pertenecen a un docente que hoy no está asignado a un grupo de este semestre: ` +
        "cuentan en los totales por estado pero no en el desglose por docente, grupo, regional ni ranking (no existe historia de asignación docente–grupo)."
    );
  }
  if (porFecha > 0) {
    advertencias.push(
      `${porFecha} entregable(s) sin plantilla se atribuyen a este semestre solo por las fechas de su semana (no existe un vínculo almacenado con el periodo académico): cuentan en los totales por estado, no en el desglose por docente.`
    );
  }
  if (sinSemestre > 0) advertencias.push(`${sinSemestre} entregable(s) sin plantilla tienen la semana fuera de todos los semestres: no se cuentan en ninguno.`);
  if (ambiguos > 0) advertencias.push(`${ambiguos} entregable(s) sin plantilla tienen la semana dentro de más de un semestre: no se atribuyen a ninguno.`);
  const sa = semestre.calendario ? semanaActual(semestre.calendario, hoy) : null;
  const estadoPeriodo = !semestre.codigo ? "sin_semestre"
    : !semestre.calendario ? "sin_calendario"
    : sa.estado === "finalizado" ? "cerrado"
    : sa.estado === "sin_iniciar" ? "futuro"
    : "en_curso";
  return {
    semestre: semestre.codigo,
    activo: semestre.activo,
    origen: semestre.origen,
    estado_periodo: estadoPeriodo,
    calendario: semestre.calendario ? { fecha_inicio: semestre.calendario.fecha_inicio, fecha_fin: semestre.calendario.fecha_fin, num_semanas: semestre.calendario.num_semanas } : null,
    hoy,
    zona_horaria: "America/Bogota",
    vacio: Boolean(vacio),
    docentes_sin_grupo: sinGrupo,
    reportes_fuera_de_matriz_vigente: fueraDeMatriz,
    entregables_atribuidos_por_fecha: porFecha,
    entregables_sin_semestre: sinSemestre,
    entregables_semestre_ambiguo: ambiguos,
    criterio: {
      entregables: "plantilla → grupo → semestre (vínculo almacenado); sin plantilla: solo por fechas, si exactamente un semestre contiene el inicio de su semana (atribución inferida, se cuantifica en entregables_atribuidos_por_fecha)",
      docentes: "asignación vigente: el grupo actual del docente pertenece al semestre (no existe historia de asignación)",
      exigibles: "fecha límite del entregable ≤ hoy (America/Bogota); en semestres futuros no hay exigibles",
    },
    advertencias,
  };
}
