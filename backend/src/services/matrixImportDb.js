// Importación de matrices: validación contra la base y escritura transaccional.
// Reglas de integridad: nunca se borra nada; no se modifican plantillas que ya tienen reportes de docentes
// (evidencias, aprobaciones); importar dos veces el mismo archivo no duplica registros; todo en una transacción.
import {
  detectarEstructura,
  enlaceDeDescripcion,
  extraerFilas,
  filaPublica,
  leerCabecera,
  listarHojas,
  mapeoAIndices,
  mapeoALetras,
  normalizar,
  sha256,
  sugerirGrupo,
  validarYPlanificar,
} from "./matrixImportService.js";
import { indiceACol } from "./xlsxReader.js";
import { ErrorNegocio, fechaDesdeColumnaDate, normalizarCalendario } from "./matrizService.js";
import { exigirAsignacionSinHistorico } from "./historicosService.js";

const TIPOS_DOCENTE = ["ANTIGUO", "NUEVO"];
const LOCK_IMPORTACION = 74010023; // serializa importaciones: evita carreras sobre el mismo grupo

const globalErr = (codigo, texto) => ({ nivel: "error", codigo, texto });
const globalWarn = (codigo, texto) => ({ nivel: "advertencia", codigo, texto });

const enteroNoNegativo = (v) => Number.isInteger(Number(v)) && Number(v) >= 0;

/** Lee el calendario y el grupo de destino; devuelve errores globales (nunca inventa datos). */
async function resolverDestino(db, destino = {}, decisiones = {}, { forUpdate = false } = {}) {
  const errores = [];
  const avisos = [];
  const decisionesRequeridas = [];
  const out = { calendario: null, grupo: null, existentes: [], docente: null, grupoNuevo: null };

  const codigo = String(destino.semestre || "").trim().toUpperCase();
  if (!codigo) errores.push(globalErr("SEMESTRE_REQUERIDO", "Selecciona el semestre de destino"));
  else {
    const r = await db.query(`SELECT codigo, fecha_inicio, fecha_fin, numero_semanas FROM semestres WHERE codigo = $1`, [codigo]);
    out.calendario = normalizarCalendario(r.rows[0] ?? null);
    if (!out.calendario) {
      errores.push(globalErr("SEMESTRE_INEXISTENTE", `El semestre ${codigo} no tiene calendario configurado. Créalo primero en Semestres.`));
    }
  }

  const modo = destino.modo;
  if (!["nuevo_grupo", "grupo_existente"].includes(modo)) {
    errores.push(globalErr("MODO_INVALIDO", "Elige si se crea un grupo nuevo o se actualiza uno existente"));
  } else if (modo === "grupo_existente") {
    const gid = Number(destino.grupo_id);
    if (!Number.isInteger(gid) || gid <= 0) errores.push(globalErr("GRUPO_REQUERIDO", "Selecciona el grupo de destino"));
    else {
      const g = await db.query(`SELECT id, nombre, semestre, horas_totales FROM grupos_matriz WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`, [gid]);
      if (g.rowCount === 0) errores.push(globalErr("GRUPO_INEXISTENTE", "El grupo de destino no existe"));
      else if (codigo && g.rows[0].semestre !== codigo) {
        errores.push(globalErr("GRUPO_INCOMPATIBLE", `El grupo pertenece al semestre ${g.rows[0].semestre}, no a ${codigo}. Los semestres antiguos no se modifican.`));
      } else {
        out.grupo = g.rows[0];
        const ex = await db.query(
          `SELECT t.id, t.numero, t.entregable, t.descripcion_evidencia, t.horas, t.semana_numero, t.mes, t.fase,
                  t.dias_inicio_desde_feb, t.dias_fin_desde_feb,
                  EXISTS (SELECT 1 FROM proyecto_entregables e WHERE e.plantilla_id = t.id) AS tiene_reportes
           FROM plantilla_entregables t WHERE t.grupo_id = $1 ORDER BY t.numero, t.id`,
          [gid]
        );
        out.existentes = ex.rows;
      }
    }
  } else {
    const g = destino.grupo || {};
    const nombre = String(g.nombre || "").trim();
    if (!nombre) errores.push(globalErr("GRUPO_NOMBRE_REQUERIDO", "Escribe el nombre del grupo nuevo"));
    else if (nombre.length > 100) errores.push(globalErr("GRUPO_NOMBRE_LARGO", "El nombre del grupo supera 100 caracteres"));
    else if (codigo) {
      const dup = await db.query(`SELECT 1 FROM grupos_matriz WHERE semestre = $1 AND LOWER(TRIM(nombre)) = LOWER($2)`, [codigo, nombre]);
      if (dup.rowCount > 0) errores.push(globalErr("NOMBRE_DUPLICADO", `Ya existe un grupo «${nombre}» en ${codigo}. Para completarlo, elige «grupo existente».`));
    }
    if (!TIPOS_DOCENTE.includes(String(g.tipo_docente || "").toUpperCase())) errores.push(globalErr("TIPO_DOCENTE_INVALIDO", "El tipo de docente debe ser ANTIGUO o NUEVO"));
    if (!enteroNoNegativo(g.horas_totales) || Number(g.horas_totales) < 1) errores.push(globalErr("HORAS_GRUPO_INVALIDAS", "Las horas totales del grupo deben ser un entero positivo"));
    for (const k of ["num_proyectos", "num_actividades", "num_convenios_nuevos", "num_convenios_dinamizados"]) {
      if (g[k] != null && g[k] !== "" && !enteroNoNegativo(g[k])) errores.push(globalErr("CANTIDAD_INVALIDA", `${k} debe ser un entero mayor o igual a 0`));
    }
    out.grupoNuevo = {
      nombre,
      descripcion: String(g.descripcion || "").trim() || null,
      tipo_docente: String(g.tipo_docente || "").toUpperCase(),
      horas_totales: Number(g.horas_totales),
      num_proyectos: Number(g.num_proyectos || 0),
      num_actividades: Number(g.num_actividades || 0),
      num_convenios_nuevos: Number(g.num_convenios_nuevos || 0),
      num_convenios_dinamizados: Number(g.num_convenios_dinamizados || 0),
    };
  }

  // Asignación opcional a un docente (valida existencia; no reasigna sin decisión)
  if (destino.asignar_docente_id != null && destino.asignar_docente_id !== "") {
    const did = Number(destino.asignar_docente_id);
    const d = Number.isInteger(did) && did > 0
      ? await db.query(`SELECT id, nombre, apellido, estado, grupo_matriz_id FROM usuarios WHERE id = $1 AND rol = 'docente'`, [did])
      : { rowCount: 0, rows: [] };
    if (d.rowCount === 0) errores.push(globalErr("DOCENTE_INEXISTENTE", "El docente seleccionado no existe"));
    else if (d.rows[0].estado !== "activo") errores.push(globalErr("DOCENTE_INACTIVO", "El docente seleccionado está inactivo"));
    else {
      out.docente = d.rows[0];
      if (d.rows[0].grupo_matriz_id && !(out.grupo && d.rows[0].grupo_matriz_id === out.grupo.id)) {
        if (decisiones.docente === "reasignar") avisos.push(globalWarn("DOCENTE_REASIGNADO", "El docente cambiará de grupo de matriz; su matriz anterior y sus reportes no se borran."));
        else if (decisiones.docente === "mantener") out.docente = null;
        else {
          decisionesRequeridas.push({
            id: "docente",
            pregunta: "El docente ya tiene un grupo de matriz asignado. ¿Reasignarlo al grupo de esta importación?",
            opciones: [
              { valor: "mantener", texto: "Mantener su grupo actual (solo importar la matriz)" },
              { valor: "reasignar", texto: "Reasignarlo a este grupo (sus reportes anteriores se conservan)" },
            ],
          });
        }
      }
    }
  }
  return { errores, avisos, decisionesRequeridas, ...out };
}

/** Lectura + validación completa. Es lo que usan tanto la simulación como la confirmación. */
export async function prepararImportacion(db, { buffer, hoja_indice, mapeo, destino, decisiones = {}, forUpdate = false }) {
  const { libro, hojas } = listarHojas(buffer);
  const idx = Number(hoja_indice);
  const info = hojas.find((h) => h.indice === idx);
  if (!info) throw new ErrorNegocio(400, "HOJA_INEXISTENTE", "La hoja seleccionada no existe en el archivo");
  const hoja = libro.leerHoja(idx);
  const estructura = detectarEstructura(hoja);
  const erroresGlobales = [];
  const avisosGlobales = [];

  if (!["cronograma", "listado"].includes(estructura.tipo)) {
    erroresGlobales.push(globalErr("HOJA_NO_SOPORTADA", "Esta hoja no tiene la estructura de una matriz (faltan las columnas «N°» y «Entregable»)."));
  }
  let mapeoFinal = estructura.mapeo;
  if (mapeo && Object.keys(mapeo).length > 0) {
    const m = mapeoAIndices(mapeo);
    if (!m) erroresGlobales.push(globalErr("MAPEO_INVALIDO", "El mapeo de columnas contiene letras inválidas"));
    else mapeoFinal = m;
  }
  for (const c of ["numero", "entregable"]) {
    if (!mapeoFinal[c]) erroresGlobales.push(globalErr("COLUMNA_OBLIGATORIA", `Falta asignar la columna de «${c}»`));
  }

  const cabecera = leerCabecera(hoja);
  const dest = await resolverDestino(db, destino, decisiones, { forUpdate });
  erroresGlobales.push(...dest.errores);
  avisosGlobales.push(...dest.avisos);

  if (cabecera.programa) {
    const todos = await db.query(`SELECT nombre FROM programas`);
    if (!todos.rows.some((r) => normalizar(r.nombre) === normalizar(cabecera.programa))) {
      avisosGlobales.push(globalWarn("PROGRAMA_NO_REGISTRADO", `El programa de la cabecera («${cabecera.programa}») no está registrado en ProySocial. No se crea automáticamente.`));
    }
  }
  if (cabecera.docente_detectado) {
    avisosGlobales.push(globalWarn("DATOS_PERSONALES_IGNORADOS", "La hoja incluye datos de un docente (nombre, enlace de Drive). Se ignoran: no se importan ni se guardan."));
  }
  const hojaTieneEstatus = estructura.columnasIgnoradas.length > 0;
  if (hojaTieneEstatus) avisosGlobales.push(globalWarn("SEGUIMIENTO_IGNORADO", "Las columnas de estatus, fechas reales y porcentajes no se importan: los indicadores se calculan en ProySocial."));
  if (dest.grupo && cabecera.horas_ps && Number(dest.grupo.horas_totales) !== cabecera.horas_ps) {
    avisosGlobales.push(globalWarn("HORAS_GRUPO_DISTINTAS", `La hoja indica ${cabecera.horas_ps} h de P.S. y el grupo tiene ${dest.grupo.horas_totales} h.`));
  }

  let extraccion = { filas: [], contexto: {}, truncado: false, filasIgnoradasEnCola: 0, celdasConErrorEnLaHoja: 0 };
  let plan = { filas: [], resumen: null, decisionesRequeridas: [] };
  if (!erroresGlobales.some((e) => ["HOJA_NO_SOPORTADA", "MAPEO_INVALIDO", "COLUMNA_OBLIGATORIA"].includes(e.codigo))) {
    extraccion = extraerFilas(hoja, estructura, mapeoFinal);
    if (extraccion.truncado) erroresGlobales.push(globalErr("DEMASIADAS_FILAS", "La hoja supera el máximo de filas por importación"));
    if (extraccion.filas.length === 0) erroresGlobales.push(globalErr("SIN_FILAS", "No se encontraron entregables en la hoja con el mapeo indicado"));
    plan = validarYPlanificar({
      extraccion,
      calendario: dest.calendario,
      existentes: dest.existentes,
      decisiones,
      sinFechasEnHoja: estructura.tipo === "listado" || (!mapeoFinal.fecha_inicio && !mapeoFinal.fecha_fin),
    });
  }
  if (extraccion.filasIgnoradasEnCola > 0) avisosGlobales.push(globalWarn("COLA_IGNORADA", `${extraccion.filasIgnoradasEnCola} fila(s) después del último entregable numerado se ignoraron (tablas de apoyo).`));
  if (extraccion.celdasConErrorEnLaHoja > 0) avisosGlobales.push(globalWarn("CELDAS_CON_ERROR", `La hoja contiene ${extraccion.celdasConErrorEnLaHoja} celda(s) con error de Excel (#REF!, etc.); solo importan si están en columnas usadas.`));

  const decisionesRequeridas = [...plan.decisionesRequeridas, ...dest.decisionesRequeridas];
  return {
    hojaInfo: { indice: idx, nombre: info.nombre, estado: info.estado, tipo: estructura.tipo },
    estructura,
    mapeoFinal,
    cabecera,
    extraccion,
    plan,
    destino: dest,
    erroresGlobales,
    avisosGlobales,
    decisionesRequeridas,
    sha: null,
  };
}

function respuestaVista(prep, buffer, nombreArchivo, { maxFilas = 400 } = {}) {
  const r = prep.plan.resumen;
  return {
    archivo: { nombre: nombreArchivo ?? null, bytes: buffer.length, sha256: sha256(buffer) },
    hoja: { indice: prep.hojaInfo.indice, estado: prep.hojaInfo.estado, tipo: prep.hojaInfo.tipo },
    mapeo: mapeoALetras(prep.mapeoFinal),
    cabecera: {
      programa: prep.cabecera.programa,
      regional: prep.cabecera.regional,
      horas_ps: prep.cabecera.horas_ps,
      datos_personales_detectados: prep.cabecera.docente_detectado || prep.cabecera.tiene_link_drive,
    },
    sugerencia_grupo: sugerirGrupo(prep.cabecera.titulo, prep.cabecera.horas_ps),
    calendario: prep.destino.calendario,
    resumen: r,
    errores_globales: prep.erroresGlobales,
    avisos_globales: prep.avisosGlobales,
    decisiones_requeridas: prep.decisionesRequeridas,
    filas: prep.plan.filas.slice(0, maxFilas).map(filaPublica),
    filas_truncadas: prep.plan.filas.length > maxFilas,
    puede_confirmar:
      prep.erroresGlobales.length === 0 && prep.decisionesRequeridas.length === 0 && Boolean(r) && r.crear + r.actualizar > 0,
    escribe_datos: false,
  };
}

/** Paso 2: hojas del libro y estructura detectada (sin destino). */
export function analizarArchivo(buffer, nombreArchivo) {
  const { hojas } = listarHojas(buffer);
  return {
    archivo: { nombre: nombreArchivo ?? null, bytes: buffer.length, sha256: sha256(buffer) },
    hojas: hojas.map((h) => ({ indice: h.indice, nombre: h.nombre, estado: h.estado, tipo: h.tipo, fila_encabezado: h.fila_encabezado })),
  };
}

/** Texto del encabezado de cada columna (para mostrar «Columna B — N°» en el mapeo). */
function encabezadosDe(hoja, fila) {
  const out = {};
  if (!fila) return out;
  for (const [col, c] of hoja.celdasDeFila(fila)) {
    if (c.t === "s" && c.v.trim()) out[indiceACol(col)] = c.v.replace(/s+/g, " ").trim().slice(0, 40);
  }
  return out;
}

export function inspeccionarHoja(buffer, hoja_indice) {
  const { libro, hojas } = listarHojas(buffer);
  const info = hojas.find((h) => h.indice === Number(hoja_indice));
  if (!info) throw new ErrorNegocio(400, "HOJA_INEXISTENTE", "La hoja seleccionada no existe en el archivo");
  const hoja = libro.leerHoja(info.indice);
  const est = detectarEstructura(hoja);
  const cab = leerCabecera(hoja);
  const ex = est.filaEncabezado ? extraerFilas(hoja, est) : { filas: [], filasIgnoradasEnCola: 0 };
  return {
    hoja: { indice: info.indice, estado: info.estado, tipo: est.tipo },
    fila_encabezado: est.filaEncabezado,
    mapeo_sugerido: mapeoALetras(est.mapeo),
    columnas_ignoradas: est.columnasIgnoradas,
    cabecera: { programa: cab.programa, regional: cab.regional, horas_ps: cab.horas_ps, datos_personales_detectados: cab.docente_detectado || cab.tiene_link_drive },
    sugerencia_grupo: sugerirGrupo(cab.titulo, cab.horas_ps),
    encabezados: encabezadosDe(hoja, est.filaEncabezado),
    muestra: ex.filas.slice(0, 12).map((f) => ({ hoja_fila: f.hoja_fila, numero: f.numero, entregable: f.entregable, semana: f.semana, mes: f.mes, horas: f.horas, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin })),
    total_filas_detectadas: ex.filas.length,
    filas_ignoradas_en_cola: ex.filasIgnoradasEnCola ?? 0,
  };
}

/** Modo simulación: valida y planifica SIN escribir nada. */
export async function validarImportacion(db, params) {
  const prep = await prepararImportacion(db, params);
  return respuestaVista(prep, params.buffer, params.nombre_archivo);
}

const truncar = (s, n) => (s && s.length > n ? s.slice(0, n) : s);

/** Confirma la importación en una transacción. Vuelve a validar todo en el servidor. */
export async function confirmarImportacion(pool, params, { usuarioId }) {
  const { buffer, nombre_archivo, opciones = {} } = params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_IMPORTACION]);
    const prep = await prepararImportacion(client, { ...params, forUpdate: true });

    if (prep.erroresGlobales.length > 0) {
      throw new ErrorNegocio(409, "VALIDACION_FALLIDA", "La importación tiene errores de configuración; corrígelos antes de confirmar.", { errores_globales: prep.erroresGlobales });
    }
    if (prep.decisionesRequeridas.length > 0) {
      throw new ErrorNegocio(409, "DECISIONES_PENDIENTES", "Faltan decisiones administrativas para continuar.", { decisiones_requeridas: prep.decisionesRequeridas });
    }
    const filas = prep.plan.filas;
    const conError = filas.filter((f) => f.accion === "rechazar");
    if (conError.length > 0 && opciones.omitir_errores !== true) {
      throw new ErrorNegocio(409, "FILAS_CON_ERRORES", `${conError.length} fila(s) tienen errores. Corrige el archivo o confirma explícitamente importar solo las filas válidas (omitir_errores).`, {
        filas_con_errores: conError.slice(0, 50).map(filaPublica),
      });
    }

    const aCrear = filas.filter((f) => f.accion === "crear");
    const aActualizar = filas.filter((f) => f.accion === "actualizar");
    const esNuevoGrupo = Boolean(prep.destino.grupoNuevo);
    const asignaDocente = Boolean(prep.destino.docente && prep.destino.docente.grupo_matriz_id !== (prep.destino.grupo?.id ?? null));

    if (!esNuevoGrupo && aCrear.length === 0 && aActualizar.length === 0 && !asignaDocente) {
      await client.query("ROLLBACK");
      return { ok: true, sin_cambios: true, lote: null, mensaje: "No hay cambios: la matriz del grupo ya contiene estos entregables.", resumen: prep.plan.resumen };
    }
    if (esNuevoGrupo && aCrear.length === 0) {
      throw new ErrorNegocio(409, "SIN_FILAS_VALIDAS", "No hay filas válidas para crear el grupo nuevo.");
    }

    // Grupo
    let grupoId = prep.destino.grupo?.id ?? null;
    if (esNuevoGrupo) {
      const g = prep.destino.grupoNuevo;
      try {
        const ins = await client.query(
          `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades,
             num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9) RETURNING id`,
          [g.nombre, g.descripcion, g.tipo_docente, g.horas_totales, g.num_proyectos, g.num_actividades, g.num_convenios_nuevos, g.num_convenios_dinamizados, String(params.destino.semestre).trim().toUpperCase()]
        );
        grupoId = ins.rows[0].id;
      } catch (e) {
        if (e?.code === "23505") throw new ErrorNegocio(409, "NOMBRE_DUPLICADO", "Ya existe un grupo con ese nombre en el semestre");
        throw e;
      }
    }

    const lote = await client.query(
      `INSERT INTO importaciones_matriz (usuario_id, archivo_nombre, archivo_sha256, hoja_indice, tipo_hoja, semestre, grupo_id, modo, decisiones, resumen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb) RETURNING id, lote, creado_en`,
      [
        usuarioId ?? null,
        truncar(nombre_archivo ?? null, 200),
        sha256(buffer),
        prep.hojaInfo.indice,
        prep.hojaInfo.tipo,
        String(params.destino.semestre).trim().toUpperCase(),
        grupoId,
        params.destino.modo,
        JSON.stringify({ ...params.decisiones, omitir_errores: opciones.omitir_errores === true }),
      ]
    );
    const importacionId = lote.rows[0].id;

    const aplicadas = [];
    let creadas = 0;
    let actualizadas = 0;
    let omitidasConcurrencia = 0;
    for (const f of aCrear) {
      await client.query(
        `INSERT INTO plantilla_entregables
           (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas,
            dias_inicio_desde_feb, dias_fin_desde_feb, enlace_referencia, importacion_id, origen_hoja_indice, origen_fila,
            semana_original, numero_original)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          grupoId, f.numero, truncar(f.fase || null, 100), truncar(f.mes || null, 20), f.semana, f.entregable, f.descripcion || null,
          f.horas ?? 0, f.dias_inicio, f.dias_fin, enlaceDeDescripcion(f.descripcion), importacionId, prep.hojaInfo.indice, f.hoja_fila,
          f.semana_etiqueta ?? null, f.numero_original ?? null,
        ]
      );
      creadas += 1;
      aplicadas.push({ hoja_fila: f.hoja_fila, numero: f.numero, accion: "crear" });
    }
    for (const f of aActualizar) {
      // Se vuelve a comprobar dentro de la misma sentencia: si ya hay reportes, NO se toca.
      const r = await client.query(
        `UPDATE plantilla_entregables t
         SET categoria = $2, fase = $2, mes = $3, semana_numero = $4, entregable = $5, descripcion_evidencia = $6, horas = $7,
             dias_inicio_desde_feb = $8, dias_fin_desde_feb = $9, enlace_referencia = COALESCE($10, enlace_referencia),
             importacion_id = $11, origen_hoja_indice = $12, origen_fila = $13,
             semana_original = $14, numero_original = $15
         WHERE t.id = $1 AND NOT EXISTS (SELECT 1 FROM proyecto_entregables e WHERE e.plantilla_id = t.id)`,
        [f.plantilla_id, truncar(f.fase || null, 100), truncar(f.mes || null, 20), f.semana, f.entregable, f.descripcion || null, f.horas ?? 0, f.dias_inicio, f.dias_fin, enlaceDeDescripcion(f.descripcion), importacionId, prep.hojaInfo.indice, f.hoja_fila, f.semana_etiqueta ?? null, f.numero_original ?? null]
      );
      if (r.rowCount === 1) {
        actualizadas += 1;
        aplicadas.push({ hoja_fila: f.hoja_fila, numero: f.numero, accion: "actualizar" });
      } else {
        omitidasConcurrencia += 1;
        aplicadas.push({ hoja_fila: f.hoja_fila, numero: f.numero, accion: "omitir_con_reportes" });
      }
    }

    let docenteAsignado = null;
    if (asignaDocente) {
      // Reasignar al docente con reportes vinculados a otro grupo dejaría su historia fuera de la matriz: se bloquea.
      await client.query(`SELECT id FROM usuarios WHERE id = $1 FOR UPDATE`, [prep.destino.docente.id]);
      await exigirAsignacionSinHistorico(client, prep.destino.docente.id, grupoId);
      await client.query(`UPDATE usuarios SET grupo_matriz_id = $1 WHERE id = $2 AND rol = 'docente'`, [grupoId, prep.destino.docente.id]);
      docenteAsignado = prep.destino.docente.id;
    }

    const r = prep.plan.resumen;
    const resumen = {
      filas_en_hoja: r.total,
      creadas,
      actualizadas,
      sin_cambios: r.sin_cambios,
      omitidas: r.omitir + omitidasConcurrencia,
      rechazadas: r.rechazar,
      advertencias: r.advertencias,
      horas_programadas: r.horas_programadas,
      grupo_nuevo: esNuevoGrupo,
      docente_asignado_id: docenteAsignado,
      avisos: prep.avisosGlobales.map((a) => a.codigo),
    };
    await client.query(`UPDATE importaciones_matriz SET resumen = $1 WHERE id = $2`, [JSON.stringify(resumen), importacionId]);
    await client.query("COMMIT");

    return {
      ok: true,
      sin_cambios: false,
      lote: lote.rows[0].lote,
      importacion_id: importacionId,
      creado_en: lote.rows[0].creado_en,
      grupo_id: grupoId,
      resumen,
      filas: aplicadas,
      rechazadas: filas.filter((f) => f.accion === "rechazar").slice(0, 100).map(filaPublica),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listarImportaciones(db, { limite = 30 } = {}) {
  const r = await db.query(
    `SELECT i.id, i.lote, i.creado_en, i.archivo_nombre, i.semestre, i.grupo_id, g.nombre AS grupo_nombre, i.modo, i.tipo_hoja,
            i.resumen, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
     FROM importaciones_matriz i
     LEFT JOIN grupos_matriz g ON g.id = i.grupo_id
     LEFT JOIN usuarios u ON u.id = i.usuario_id
     ORDER BY i.creado_en DESC LIMIT $1`,
    [Math.min(Math.max(Number(limite) || 30, 1), 200)]
  );
  return r.rows.map((x) => ({
    ...x,
    usuario: [x.usuario_nombre, x.usuario_apellido].filter(Boolean).join(" ") || null,
    creado_en: x.creado_en,
  }));
}

export { fechaDesdeColumnaDate };
