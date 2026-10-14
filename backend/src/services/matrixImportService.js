// Importación de matrices de seguimiento desde Excel (lógica pura: sin BD ni red).
//
// El Excel es solo una FUENTE de la estructura de la matriz (plantilla): entregables, semanas, fechas,
// horas, descripciones. NO se importan fórmulas ni indicadores (se calculan en matrizService), ni datos de
// seguimiento (estatus, fecha real de entrega) ni datos personales (nombre del docente, enlaces de Drive).
import crypto from "node:crypto";
import { abrirLibro, colAIndice, indiceACol } from "./xlsxReader.js";
import { diferenciaDias, esFechaISO, sumarDias } from "./matrizService.js";

export const MAX_FILAS = 2500;
export const CAMPOS = ["numero", "entregable", "descripcion", "horas", "fecha_inicio", "fecha_fin", "ubicacion", "categoria"];
export const CAMPOS_OBLIGATORIOS = ["numero", "entregable"];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const UBICACION_RE = new RegExp(`^\\s*(${MESES.join("|")})\\s*-\\s*semana\\s*(\\d{1,2})`, "i");

export const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const limpiarTexto = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ").trim();

// ───────────── Lectura y estructura ─────────────

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Hojas del libro con una clasificación rápida (sin leer filas completas). */
export function listarHojas(buffer) {
  const libro = abrirLibro(buffer);
  const hojas = libro.hojas.map((h) => {
    let estructura = null;
    try {
      estructura = detectarEstructura(libro.leerHoja(h.indice));
    } catch {
      estructura = { tipo: "ilegible" };
    }
    return { indice: h.indice, nombre: h.nombre, estado: h.estado, tipo: estructura.tipo, fila_encabezado: estructura.filaEncabezado ?? null };
  });
  return { libro, hojas };
}

const SINONIMOS = {
  numero: ["no.", "no", "n°", "nº", "n.°", "numero", "n°.", "num", "#"],
  entregable: ["entregable"],
  descripcion: ["descripcion evidencia documental", "descripcion evidencia", "descripcion"],
  horas: ["horas establecidas", "tiempo en horas", "horas"],
  fecha_inicio: ["fecha de inicio", "fecha inicio"],
  fecha_fin: ["fecha de finalizacion", "fecha programada de entrega", "fecha de finalizacion ", "fecha limite", "fecha fin"],
  ubicacion: ["ubicacion en ms"],
  categoria: ["categoria"],
};
const IGNORADAS = ["fecha real de entrega", "estatus de la entrega", "% avance", "% de avance", "semaforo", "total de entregables"];

/** Detecta fila de encabezado, columnas y tipo de hoja (cronograma | listado | catalogo | desconocida). */
export function detectarEstructura(hoja) {
  const limite = Math.min(hoja.maxFila, 40);
  for (let r = 1; r <= limite; r += 1) {
    const mapeo = {};
    const ignoradas = [];
    for (const [col, celda] of hoja.celdasDeFila(r)) {
      if (celda.t !== "s") continue;
      const n = normalizar(celda.v).replace(/\s*\*$/, "");
      if (!n) continue;
      let campo = null;
      for (const [c, lista] of Object.entries(SINONIMOS)) {
        if (lista.includes(n)) {
          campo = c;
          break;
        }
      }
      if (campo && mapeo[campo] === undefined) mapeo[campo] = col;
      else if (IGNORADAS.some((x) => n.startsWith(x))) ignoradas.push(indiceACol(col));
    }
    if (mapeo.entregable !== undefined && mapeo.numero !== undefined) {
      const tipo = mapeo.fecha_inicio !== undefined || mapeo.fecha_fin !== undefined ? "cronograma" : mapeo.ubicacion !== undefined ? "listado" : "cronograma";
      return { tipo, filaEncabezado: r, mapeo, columnasIgnoradas: ignoradas };
    }
  }
  const nombre = normalizar(hoja.nombre);
  return { tipo: nombre.includes("desplegable") ? "catalogo" : "desconocida", filaEncabezado: null, mapeo: {}, columnasIgnoradas: [] };
}

/** Convierte un mapeo con letras ({numero:"B"}) a índices; null si hay letras inválidas. */
export function mapeoAIndices(mapeoLetras) {
  const out = {};
  for (const [campo, letras] of Object.entries(mapeoLetras || {})) {
    if (!CAMPOS.includes(campo) || letras == null || letras === "") continue;
    if (!/^[A-Za-z]{1,3}$/.test(String(letras))) return null;
    out[campo] = colAIndice(String(letras));
  }
  return out;
}
export const mapeoALetras = (mapeo) => Object.fromEntries(Object.entries(mapeo).map(([k, v]) => [k, indiceACol(v)]));

// ───────────── Celdas ─────────────

const URL_RE = /https?:\/\/[^\s<>"')]+/i;

function aFecha(celda) {
  if (!celda || celda.v == null) return { vacia: true };
  if (celda.t === "e") return { error: "REFERENCIA_ROTA" };
  if (celda.t === "z") return { error: "FORMULA_SIN_VALOR" };
  if (celda.t === "d") return { iso: celda.v };
  if (celda.t === "s") {
    const s = celda.v.trim();
    if (!s) return { vacia: true };
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m && esFechaISO(s)) return { iso: s, texto: true };
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (m) {
      const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if (esFechaISO(iso)) return { iso, texto: true };
    }
  }
  return { error: "FECHA_INVALIDA" };
}

function aHoras(celda) {
  if (!celda || celda.v == null || celda.v === "") return { vacia: true };
  if (celda.t === "e") return { error: "REFERENCIA_ROTA" };
  if (celda.t === "z") return { error: "FORMULA_SIN_VALOR" };
  let n = celda.v;
  if (celda.t === "s") n = Number(String(celda.v).trim().replace(",", "."));
  if (celda.t === "d" || typeof n !== "number" || !Number.isFinite(n)) return { error: "HORAS_INVALIDAS" };
  if (n < 0) return { error: "HORAS_NEGATIVAS" };
  return { valor: Math.round(n * 10) / 10 };
}

function aNumero(celda) {
  if (!celda || celda.v == null) return { vacia: true };
  if (celda.t === "e") return { error: "REFERENCIA_ROTA" };
  if (celda.t === "z") return { error: "FORMULA_SIN_VALOR" };
  if (celda.t === "n") return Number.isInteger(celda.v) && celda.v > 0 ? { valor: celda.v } : { error: "NUMERO_INVALIDO" };
  if (celda.t === "s") {
    const s = celda.v.trim();
    if (/^\d+(\.0+)?$/.test(s) && Number(s) > 0) return { valor: Math.round(Number(s)) };
    return { texto: s };
  }
  return { error: "NUMERO_INVALIDO" };
}

// ───────────── Extracción ─────────────

/**
 * Lee las filas candidatas de una hoja. Propaga el contexto (fase/categoría y «Mes - Semana N») de las
 * filas de encabezado de bloque a los entregables que le siguen. Cada fila trae sus errores de formato.
 */
export function extraerFilas(hoja, estructura, mapeoIndices) {
  const mapeo = mapeoIndices ?? estructura.mapeo;
  const col = (campo) => mapeo[campo];
  const filas = [];
  const contexto = { fase: "", mes: null, semana: null, seccion: "" };
  const generales = { columnasConErrores: new Set(), celdasError: 0, formulas: 0 };
  let truncado = false;

  for (const r of hoja.filasConDatos()) {
    if (r <= (estructura.filaEncabezado ?? 0)) continue;

    // Contexto: texto de categoría/fase (col. «Categoría» o encabezado de sección) y ubicación «Mes - Semana N».
    const catCol = col("categoria");
    const textoCat = catCol ? hoja.celda(r, catCol) : null;
    const colNum = col("numero");
    const celdaNum = colNum ? hoja.celda(r, colNum) : null;
    const celdaUbic = col("ubicacion") ? hoja.celda(r, col("ubicacion")) : null;
    const celdaEnt = hoja.celda(r, col("entregable"));
    const textoEnt = celdaEnt?.t === "s" ? limpiarTexto(celdaEnt.v) : "";

    if (textoCat?.t === "s" && limpiarTexto(textoCat.v)) {
      const t = limpiarTexto(textoCat.v);
      if (!UBICACION_RE.test(t)) contexto.fase = t;
    }
    for (const c of [celdaNum, celdaUbic]) {
      if (c?.t === "s") {
        const m = UBICACION_RE.exec(c.v.replace(/[\t\n]+/g, " "));
        if (m) {
          contexto.mes = m[1].toLowerCase();
          contexto.semana = Number(m[2]);
        } else if (/^\s*\d+\.\s+\S/.test(c.v) || (limpiarTexto(c.v).length > 12 && limpiarTexto(c.v) === limpiarTexto(c.v).toUpperCase() && !celdaEnt)) {
          contexto.seccion = limpiarTexto(c.v);
          if (!textoCat) contexto.fase = contexto.seccion;
        }
      }
    }

    const num = aNumero(celdaNum);
    const esFilaEntregable = num.valor !== undefined || num.error || (textoEnt && celdaNum && celdaNum.t !== "s");
    if (!esFilaEntregable && !(textoEnt && num.vacia)) continue; // fila de contexto o vacía
    if (num.texto !== undefined && !textoEnt) continue; // texto en la columna número sin entregable = encabezado de bloque
    if (num.vacia && !textoEnt) continue;

    if (filas.length >= MAX_FILAS) {
      truncado = true;
      break;
    }

    const errores = [];
    const fila = {
      hoja_fila: r,
      numero: num.valor ?? null,
      entregable: textoEnt,
      descripcion: "",
      horas: null,
      fecha_inicio: null,
      fecha_fin: null,
      fase: contexto.fase,
      mes: contexto.mes,
      semana: contexto.semana,
      ubicacion_propia: false,
      errores,
    };
    if (celdaNum?.formula) generales.formulas += 1;

    if (num.error) errores.push({ codigo: num.error, campo: "numero" });
    else if (num.vacia) errores.push({ codigo: "NUMERO_VACIO", campo: "numero" });
    else if (num.texto !== undefined) errores.push({ codigo: "NUMERO_INVALIDO", campo: "numero" });

    if (celdaEnt?.t === "e") errores.push({ codigo: "REFERENCIA_ROTA", campo: "entregable" });
    else if (celdaEnt?.t === "z") errores.push({ codigo: "FORMULA_SIN_VALOR", campo: "entregable" });
    else if (!textoEnt) errores.push({ codigo: "ENTREGABLE_VACIO", campo: "entregable" });

    const cd = col("descripcion") ? hoja.celda(r, col("descripcion")) : null;
    if (cd?.t === "e") errores.push({ codigo: "REFERENCIA_ROTA", campo: "descripcion" });
    else if (cd?.t === "s") fila.descripcion = limpiarTexto(cd.v);
    else if (cd?.t === "z") errores.push({ codigo: "FORMULA_SIN_VALOR", campo: "descripcion" });

    if (col("horas")) {
      const h = aHoras(hoja.celda(r, col("horas")));
      if (h.error) errores.push({ codigo: h.error, campo: "horas" });
      else if (h.vacia) fila.horas = null;
      else fila.horas = h.valor;
    }
    for (const campo of ["fecha_inicio", "fecha_fin"]) {
      if (!col(campo)) continue;
      const f = aFecha(hoja.celda(r, col(campo)));
      if (f.error) errores.push({ codigo: f.error, campo });
      else if (!f.vacia) {
        fila[campo] = f.iso;
        if (f.texto) fila.fecha_texto = true;
      }
    }
    if (col("ubicacion") && celdaUbic?.t === "s") {
      const m = UBICACION_RE.exec(celdaUbic.v.replace(/[\t\n]+/g, " "));
      if (m) {
        fila.mes = m[1].toLowerCase();
        fila.semana = Number(m[2]);
        fila.ubicacion_propia = true;
      }
    }
    for (const e of errores) if (e.codigo === "REFERENCIA_ROTA") generales.celdasError += 1;
    filas.push(fila);
  }

  // Cola: lo que sigue a la última fila numerada válida (tablas de apoyo, indicadores, notas) no es parte del cronograma.
  let colaIgnorada = 0;
  while (filas.length > 0 && filas[filas.length - 1].numero == null) {
    filas.pop();
    colaIgnorada += 1;
  }

  // Celdas de error/fórmula en columnas ignoradas (indicadores): solo se informa.
  let erroresIgnorados = 0;
  for (const r of hoja.filasConDatos()) {
    for (const [, c] of hoja.celdasDeFila(r)) {
      if (c.t === "e") erroresIgnorados += 1;
    }
  }
  return { filas, contexto: { ...contexto }, truncado, celdasConErrorEnLaHoja: erroresIgnorados, filasIgnoradasEnCola: colaIgnorada };
}

/** Metadatos de cabecera SIN datos personales (no se devuelve el nombre del docente ni enlaces). */
export function leerCabecera(hoja) {
  const out = { docente_detectado: false, programa: null, regional: null, horas_ps: null, titulo: null, tiene_link_drive: false };
  const limite = Math.min(hoja.maxFila, 12);
  for (let r = 1; r <= limite; r += 1) {
    const etiqueta = hoja.celda(r, 1);
    if (etiqueta?.t === "s") {
      const e = normalizar(etiqueta.v);
      const valor = [2, 3, 4, 5].map((c) => hoja.celda(r, c)).find((c) => c?.t === "s" && c.v.trim());
      if (e.startsWith("nombre docente") && valor) out.docente_detectado = true;
      else if (e.startsWith("programa academico") && valor) out.programa = limpiarTexto(valor.v);
      else if (e === "regional" && valor) out.regional = limpiarTexto(valor.v);
      else if (e.startsWith("link drive") && valor) out.tiene_link_drive = true;
      else if (e.startsWith("horas de p")) {
        const h = [2, 3, 4, 5, 6].map((c) => hoja.celda(r, c)).find((c) => c?.v != null && /\d/.test(String(c.v)));
        const m = h && /(\d+(?:[.,]\d+)?)/.exec(String(h.v));
        if (m) out.horas_ps = Number(m[1].replace(",", "."));
      }
    }
    for (const [, c] of hoja.celdasDeFila(r)) {
      if (c.t === "s" && /indicador/i.test(c.v) && /proyecto|actividad|convenio/i.test(c.v)) out.titulo = limpiarTexto(c.v).slice(0, 160);
    }
  }
  return out;
}

/** Sugerencia de cantidades del grupo a partir del título de la hoja (solo sugerencia; el admin confirma). */
export function sugerirGrupo(titulo, horasPs) {
  const t = normalizar(titulo || "");
  const n = (re) => {
    const m = re.exec(t);
    return m ? Number(m[1]) : null;
  };
  return {
    horas_totales: horasPs ?? null,
    num_proyectos: n(/(\d+)\s*(?:pro\b|proyectos?)/),
    num_actividades: n(/(\d+)\s*(?:act\b|actividades?)/),
    num_convenios_nuevos: n(/(\d+)\s*conv(?:enios?)?\.?\s*nuev/),
    num_convenios_dinamizados: n(/(\d+)\s*conv(?:enios?)?\.?\s*dinam/),
    tipo_docente: /\bnuevo\b/.test(t) ? "NUEVO" : /\bantiguo\b/.test(t) ? "ANTIGUO" : null,
  };
}

// ───────────── Validación y plan ─────────────

const MSG = {
  NUMERO_VACIO: "Falta el número del entregable",
  NUMERO_INVALIDO: "El número del entregable no es un entero positivo",
  ENTREGABLE_VACIO: "Falta el nombre del entregable",
  REFERENCIA_ROTA: "La celda contiene una referencia dañada (#REF!/error de Excel)",
  FORMULA_SIN_VALOR: "La celda es una fórmula sin valor calculado guardado",
  FECHA_INVALIDA: "La fecha no es válida",
  HORAS_INVALIDAS: "Las horas no son un número válido",
  HORAS_NEGATIVAS: "Las horas no pueden ser negativas",
  FECHA_INICIO_POSTERIOR: "La fecha de inicio es posterior a la fecha de finalización",
  FECHA_FUERA_SEMESTRE: "La fecha está fuera del semestre de destino",
  SEMANA_FUERA_SEMESTRE: "La semana no existe en el semestre de destino",
  SEMANA_VACIA: "No se pudo determinar la semana (falta «Mes - Semana N»)",
  NUMERO_DUPLICADO: "El número está repetido en el archivo",
  SEMANA_DISTINTA_A_FECHA: "La semana indicada no coincide con la semana que corresponde a la fecha de inicio",
  FECHAS_DERIVADAS: "La hoja no trae fechas: se derivan de la semana (inicio y fin de la semana)",
  HORAS_VACIAS: "Sin horas: se registrarán como 0",
  HORAS_ALTAS: "Horas inusualmente altas (> 60)",
  ENTREGABLE_REPETIDO: "Mismo entregable, semana y fechas que otra fila con distinto número",
  SALTO_NUMERACION: "Hay saltos en la numeración",
  TIENE_REPORTES: "La plantilla ya tiene reportes de docentes: no se modifica",
  FECHA_COMO_TEXTO: "La fecha estaba escrita como texto",
  CONFLICTO_DE_TEXTO: "El número ya existe en el grupo con otro entregable",
};
export const mensaje = (codigo) => MSG[codigo] ?? codigo;

const ERRORES_DE_FILA = new Set(["NUMERO_VACIO", "NUMERO_INVALIDO", "ENTREGABLE_VACIO", "REFERENCIA_ROTA", "FORMULA_SIN_VALOR", "FECHA_INVALIDA", "HORAS_INVALIDAS", "HORAS_NEGATIVAS"]);

/**
 * Valida y planifica contra el calendario del semestre y lo ya existente en el grupo.
 *  calendario: { fecha_inicio, num_semanas } del semestre de destino (obligatorio para importar)
 *  existentes: plantillas del grupo destino [{id, numero, entregable, ..., tiene_reportes}] ([] si el grupo es nuevo)
 *  decisiones: { duplicados: 'renumerar'|'omitir', semana: 'fecha'|'etiqueta' }
 * No lee ni escribe en BD. Devuelve filas con estado/acción, resumen y decisiones requeridas.
 */
export function validarYPlanificar({ extraccion, calendario, existentes = [], decisiones = {}, sinFechasEnHoja = false }) {
  const filas = extraccion.filas.map((f, i) => ({ ...f, orden: i, mensajes: [], estado: "valida", accion: null }));
  const agregar = (f, nivel, codigo, extra = {}) => f.mensajes.push({ nivel, codigo, texto: mensaje(codigo), ...extra });
  const decisionesRequeridas = [];

  // 1) Errores de formato de la lectura
  for (const f of filas) {
    for (const e of f.errores) agregar(f, "error", e.codigo, { campo: e.campo });
  }

  // 2) Números duplicados en el archivo
  const porNumero = new Map();
  for (const f of filas) {
    if (f.numero == null) continue;
    if (!porNumero.has(f.numero)) porNumero.set(f.numero, []);
    porNumero.get(f.numero).push(f);
  }
  const duplicados = [...porNumero.entries()].filter(([, v]) => v.length > 1);
  if (duplicados.length > 0) {
    const decision = decisiones.duplicados;
    if (decision === "omitir") {
      for (const [, grupo] of duplicados) {
        grupo.slice(1).forEach((f) => {
          f.omitir = true;
          agregar(f, "advertencia", "NUMERO_DUPLICADO", { detalle: "Se omite (decisión: conservar solo la primera aparición)" });
        });
      }
    } else if (decision === "renumerar") {
      let siguiente = Math.max(...filas.map((f) => f.numero ?? 0), 0) + 1;
      for (const [, grupo] of duplicados) {
        grupo.slice(1).forEach((f) => {
          f.numero_original = f.numero;
          f.numero = siguiente;
          siguiente += 1;
          agregar(f, "advertencia", "NUMERO_DUPLICADO", { detalle: `Renumerado ${f.numero_original} → ${f.numero} (decisión administrativa)` });
        });
      }
    } else {
      for (const [, grupo] of duplicados) grupo.forEach((f) => agregar(f, "pendiente", "NUMERO_DUPLICADO"));
      decisionesRequeridas.push({
        id: "duplicados",
        pregunta: `Hay ${duplicados.length} número(s) repetido(s) en el archivo (${duplicados.slice(0, 6).map(([n]) => n).join(", ")}${duplicados.length > 6 ? "…" : ""}). ¿Qué hacer?`,
        opciones: [
          { valor: "renumerar", texto: "Renumerar las repeticiones con números nuevos al final (conserva todos los entregables)" },
          { valor: "omitir", texto: "Conservar solo la primera aparición de cada número y omitir las demás" },
        ],
      });
    }
  }

  // 3) Fechas y semanas frente al calendario del semestre
  const semanasTotales = calendario?.num_semanas ?? null;
  const anotarSemana = (f) => {
    if (f.semana == null) {
      agregar(f, "error", "SEMANA_VACIA");
      return;
    }
    if (semanasTotales && (f.semana < 1 || f.semana > semanasTotales)) agregar(f, "error", "SEMANA_FUERA_SEMESTRE");
  };
  let hayMismatch = false;
  for (const f of filas) {
    anotarSemana(f);
    if (sinFechasEnHoja || (!f.fecha_inicio && !f.fecha_fin)) {
      if (f.semana != null && semanasTotales && f.semana >= 1 && f.semana <= semanasTotales) {
        f.dias_inicio = (f.semana - 1) * 7;
        f.dias_fin = f.semana * 7 - 1;
        agregar(f, "advertencia", "FECHAS_DERIVADAS");
      }
      continue;
    }
    const inicio = f.fecha_inicio ?? f.fecha_fin;
    const fin = f.fecha_fin ?? f.fecha_inicio;
    if (f.fecha_texto) agregar(f, "advertencia", "FECHA_COMO_TEXTO");
    if (inicio > fin) {
      agregar(f, "error", "FECHA_INICIO_POSTERIOR");
      continue;
    }
    if (!calendario) continue;
    const di = diferenciaDias(calendario.fecha_inicio, inicio);
    const df = diferenciaDias(calendario.fecha_inicio, fin);
    if (di < 0 || df >= calendario.num_semanas * 7) {
      agregar(f, "error", "FECHA_FUERA_SEMESTRE", { detalle: `${inicio} – ${fin} vs semestre ${calendario.fecha_inicio} … ${calendario.fecha_fin}` });
      continue;
    }
    f.dias_inicio = di;
    f.dias_fin = df;
    const semanaFecha = Math.floor(di / 7) + 1;
    f.semana_por_fecha = semanaFecha;
    if (f.semana != null && f.semana !== semanaFecha) {
      hayMismatch = true;
      f.semana_distinta = true;
    }
  }
  if (hayMismatch) {
    const d = decisiones.semana;
    for (const f of filas.filter((x) => x.semana_distinta)) {
      if (d === "fecha") {
        f.semana_etiqueta = f.semana;
        f.semana = f.semana_por_fecha;
        agregar(f, "advertencia", "SEMANA_DISTINTA_A_FECHA", { detalle: `Se usa la semana de la fecha (${f.semana}) en lugar de la etiqueta (${f.semana_etiqueta})` });
      } else if (d === "etiqueta") {
        agregar(f, "advertencia", "SEMANA_DISTINTA_A_FECHA", { detalle: `Se usa la etiqueta del Excel (semana ${f.semana}); las fechas se conservan` });
      } else {
        agregar(f, "pendiente", "SEMANA_DISTINTA_A_FECHA", { detalle: `Etiqueta: semana ${f.semana}; por fecha: semana ${f.semana_por_fecha}` });
      }
    }
    if (!d) {
      const dif = new Set(filas.filter((x) => x.semana_distinta).map((x) => x.semana - x.semana_por_fecha));
      const diaInicio = calendario ? new Date(`${calendario.fecha_inicio}T12:00:00Z`).getUTCDay() : 1;
      // Las matrices de Excel agrupan por semanas de lunes a sábado; si el semestre inicia otro día,
      // la fecha de inicio de algunas tareas cae un día antes de la «semana» del Excel (diferencia constante de 1).
      const alineadoALunes = dif.size === 1 && [...dif][0] === 1 && diaInicio !== 1;
      decisionesRequeridas.push({
        id: "semana",
        recomendada: alineadoALunes ? "etiqueta" : "fecha",
        pregunta: `${filas.filter((x) => x.semana_distinta).length} fila(s) tienen una semana distinta a la de su fecha de inicio. La semana decide a qué semana de cada iniciativa se asocia el entregable. ¿Cuál usar?${alineadoALunes ? " Todas las diferencias son de exactamente 1 semana y el semestre inicia en " + ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][diaInicio] + ": el Excel agrupa las semanas de lunes a sábado. Se recomienda usar la semana escrita en el Excel (las fechas se conservan igual)." : ""}`,
        opciones: [
          { valor: "fecha", texto: "La semana que corresponde a la fecha de inicio según el calendario del semestre" + (alineadoALunes ? "" : " (recomendado)") },
          { valor: "etiqueta", texto: "La semana escrita en el Excel («Mes - Semana N»)" + (alineadoALunes ? " (recomendado)" : "") },
        ],
      });
    }
  }

  // 4) Horas, repetidos y saltos
  for (const f of filas) {
    if (f.horas == null && !f.errores.some((e) => e.campo === "horas")) agregar(f, "advertencia", "HORAS_VACIAS");
    if (f.horas != null && f.horas > 60) agregar(f, "advertencia", "HORAS_ALTAS");
  }
  const vistos = new Map();
  for (const f of filas) {
    const clave = `${normalizar(f.entregable)}|${f.semana}|${f.fecha_inicio}|${f.fecha_fin}`;
    if (vistos.has(clave) && f.numero !== vistos.get(clave).numero && f.entregable) agregar(f, "advertencia", "ENTREGABLE_REPETIDO");
    else vistos.set(clave, f);
  }
  const numeros = [...new Set(filas.map((f) => f.numero).filter((n) => n != null))].sort((a, b) => a - b);
  const saltos = [];
  for (let i = 1; i < numeros.length; i += 1) if (numeros[i] - numeros[i - 1] > 1) saltos.push(`${numeros[i - 1]}→${numeros[i]}`);

  // 5) Estado y acción por fila (frente a lo existente)
  const existentesPorNumero = new Map(existentes.map((e) => [Number(e.numero), e]));
  const igual = (f, e) =>
    normalizar(e.entregable) === normalizar(f.entregable) &&
    normalizar(e.descripcion_evidencia) === normalizar(f.descripcion) &&
    Number(e.horas ?? 0) === Number(f.horas ?? 0) &&
    Number(e.semana_numero) === Number(f.semana) &&
    Number(e.dias_inicio_desde_feb ?? -1) === Number(f.dias_inicio ?? -1) &&
    Number(e.dias_fin_desde_feb ?? -1) === Number(f.dias_fin ?? -1) &&
    normalizar(e.mes) === normalizar(f.mes) &&
    normalizar(e.fase) === normalizar(f.fase);
  for (const f of filas) {
    const tieneError = f.mensajes.some((m) => m.nivel === "error");
    const pendiente = f.mensajes.some((m) => m.nivel === "pendiente");
    if (f.omitir) {
      f.estado = "advertencia";
      f.accion = "omitir";
      continue;
    }
    if (tieneError) {
      f.estado = "error";
      f.accion = "rechazar";
      continue;
    }
    if (pendiente) {
      f.estado = "pendiente";
      f.accion = "pendiente";
      continue;
    }
    const e = existentesPorNumero.get(f.numero);
    if (!e) f.accion = "crear";
    else if (igual(f, e)) f.accion = "sin_cambios";
    else if (normalizar(e.entregable) !== normalizar(f.entregable) && e.tiene_reportes) {
      f.accion = "omitir";
      agregar(f, "advertencia", "TIENE_REPORTES");
      agregar(f, "advertencia", "CONFLICTO_DE_TEXTO");
    } else if (e.tiene_reportes) {
      f.accion = "omitir";
      agregar(f, "advertencia", "TIENE_REPORTES");
    } else {
      f.accion = "actualizar";
      f.plantilla_id = e.id;
    }
    if (e && f.accion !== "crear") f.plantilla_id = e.id;
    f.estado = f.mensajes.some((m) => m.nivel === "advertencia") ? "advertencia" : "valida";
  }

  const cuenta = (fn) => filas.filter(fn).length;
  const resumen = {
    total: filas.length,
    validas: cuenta((f) => f.estado === "valida"),
    advertencias: cuenta((f) => f.estado === "advertencia"),
    errores: cuenta((f) => f.estado === "error"),
    pendientes: cuenta((f) => f.estado === "pendiente"),
    crear: cuenta((f) => f.accion === "crear"),
    actualizar: cuenta((f) => f.accion === "actualizar"),
    sin_cambios: cuenta((f) => f.accion === "sin_cambios"),
    omitir: cuenta((f) => f.accion === "omitir"),
    rechazar: cuenta((f) => f.accion === "rechazar"),
    saltos_numeracion: saltos.slice(0, 10),
    horas_programadas: Math.round(filas.filter((f) => ["crear", "actualizar", "sin_cambios"].includes(f.accion)).reduce((s, f) => s + (f.horas ?? 0), 0) * 10) / 10,
  };
  return { filas, resumen, decisionesRequeridas };
}

/** Vista pública de una fila (sin campos internos). */
export function filaPublica(f) {
  return {
    orden: f.orden,
    hoja_fila: f.hoja_fila,
    numero: f.numero,
    numero_original: f.numero_original ?? null,
    entregable: f.entregable,
    descripcion: f.descripcion,
    horas: f.horas,
    fase: f.fase,
    mes: f.mes,
    semana: f.semana,
    fecha_inicio: f.fecha_inicio,
    fecha_fin: f.fecha_fin,
    dias_inicio: f.dias_inicio ?? null,
    dias_fin: f.dias_fin ?? null,
    estado: f.estado,
    accion: f.accion,
    mensajes: f.mensajes,
  };
}

/** Enlace de referencia: solo si la descripción contiene una URL https. */
export function enlaceDeDescripcion(texto) {
  const m = URL_RE.exec(texto || "");
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export { sumarDias };
