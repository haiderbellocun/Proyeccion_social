// Lector mínimo de archivos .xlsx (solo lectura) sin dependencias externas.
// Un .xlsx es un ZIP de XML: se lee con node:zlib. Defensas: tamaño máximo, número de entradas,
// límite de descompresión (zip bomb), sin cifrado ni Zip64, y nunca se escribe nada en disco.
//
// Las fórmulas NO se evalúan: se devuelve el último valor calculado guardado por Excel junto con la marca
// `formula: true`; los valores de error (#REF!, #N/A…) se devuelven con t = "e".
import zlib from "node:zlib";

export const LIMITES = Object.freeze({
  maxBytes: 12 * 1024 * 1024,
  maxEntradas: 400,
  maxBytesEntrada: 40 * 1024 * 1024,
  maxBytesTotal: 120 * 1024 * 1024,
});

export class ArchivoInvalidoError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ArchivoInvalidoError";
    this.status = 422;
    this.codigo = "ARCHIVO_INVALIDO";
  }
}

// ───────────── ZIP ─────────────
function leerZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ArchivoInvalidoError("El archivo está vacío o no es un .xlsx");
  if (buf.length > LIMITES.maxBytes) throw new ArchivoInvalidoError("El archivo supera el tamaño máximo permitido (12 MB)");
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new ArchivoInvalidoError("El archivo no es un .xlsx válido (no es un ZIP)");

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ArchivoInvalidoError("El archivo está dañado (sin directorio central)");
  const total = buf.readUInt16LE(eocd + 10);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || dirOffset === 0xffffffff) throw new ArchivoInvalidoError("ZIP64 no soportado");
  if (total > LIMITES.maxEntradas) throw new ArchivoInvalidoError("El archivo contiene demasiadas partes");

  const entradas = new Map();
  let pos = dirOffset;
  let acumulado = 0;
  for (let n = 0; n < total; n += 1) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new ArchivoInvalidoError("El archivo está dañado (directorio central)");
    const flags = buf.readUInt16LE(pos + 8);
    const metodo = buf.readUInt16LE(pos + 10);
    const tamComprimido = buf.readUInt32LE(pos + 20);
    const tamReal = buf.readUInt32LE(pos + 24);
    const lenNombre = buf.readUInt16LE(pos + 28);
    const lenExtra = buf.readUInt16LE(pos + 30);
    const lenComentario = buf.readUInt16LE(pos + 32);
    const offsetLocal = buf.readUInt32LE(pos + 42);
    const nombre = buf.toString("utf8", pos + 46, pos + 46 + lenNombre);
    pos += 46 + lenNombre + lenExtra + lenComentario;
    if (flags & 1) throw new ArchivoInvalidoError("El archivo está protegido con contraseña");
    if (tamReal > LIMITES.maxBytesEntrada) throw new ArchivoInvalidoError("Una parte del archivo es demasiado grande");
    acumulado += tamReal;
    if (acumulado > LIMITES.maxBytesTotal) throw new ArchivoInvalidoError("El contenido descomprimido es demasiado grande");
    entradas.set(nombre, { metodo, tamComprimido, tamReal, offsetLocal });
  }

  return {
    nombres: [...entradas.keys()],
    leer(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const o = e.offsetLocal;
      if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) throw new ArchivoInvalidoError("El archivo está dañado (parte local)");
      const ini = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
      const datos = buf.subarray(ini, ini + e.tamComprimido);
      try {
        if (e.metodo === 0) return Buffer.from(datos);
        if (e.metodo === 8) return zlib.inflateRawSync(datos, { maxOutputLength: LIMITES.maxBytesEntrada });
      } catch {
        throw new ArchivoInvalidoError(`La parte «${nombre}» está dañada`);
      }
      throw new ArchivoInvalidoError("Método de compresión no soportado");
    },
  };
}

// ───────────── XML ─────────────
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    }
    return ENTIDADES[e] ?? m;
  });
const atributo = (tag, nombre) => {
  const m = new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(tag);
  return m ? decodificar(m[1]) : null;
};
const textoDe = (xml) => {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out += decodificar(m[1]);
  return out;
};

export function colAIndice(letras) {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // A = 1
}
export function indiceACol(n) {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const FORMATOS_FECHA_INTEGRADOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const esFormatoFecha = (codigo) => {
  const limpio = String(codigo).replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(limpio) && !/^[#0?.,%\s]*$/.test(limpio);
};

function serialAFecha(serial, base1904) {
  if (!Number.isFinite(serial)) return null;
  const dias = Math.floor(serial);
  const t = base1904 ? Date.UTC(1904, 0, 1) + dias * 86400000 : Date.UTC(1899, 11, 30) + dias * 86400000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2200) return null;
  return d.toISOString().slice(0, 10);
}

/** Abre un libro. Devuelve { hojas:[{indice,nombre,estado}], hoja(indice) }. */
export function abrirLibro(buffer) {
  const zip = leerZip(buffer);
  const wbXml = zip.leer("xl/workbook.xml");
  if (!wbXml) throw new ArchivoInvalidoError("No es un libro de Excel (.xlsx): falta xl/workbook.xml");
  const wb = wbXml.toString("utf8");
  const base1904 = /<workbookPr[^>]*date1904="(?:1|true)"/.test(wb);

  const rels = new Map();
  const relsXml = zip.leer("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  for (const m of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const target = atributo(m[0], "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const hojas = [];
  for (const m of wb.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const nombre = atributo(m[0], "name");
    const rid = atributo(m[0], "r:id");
    const ruta = rid ? rels.get(rid) : null;
    if (!nombre || !ruta) continue;
    hojas.push({ indice: hojas.length, nombre, estado: atributo(m[0], "state") || "visible", ruta });
  }
  if (hojas.length === 0) throw new ArchivoInvalidoError("El libro no contiene hojas");

  const sstXml = zip.leer("xl/sharedStrings.xml")?.toString("utf8");
  const compartidas = sstXml ? [...sstXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1])) : [];

  const estilosXml = zip.leer("xl/styles.xml")?.toString("utf8") ?? "";
  const formatosPersonalizados = new Map();
  for (const m of estilosXml.matchAll(/<numFmt\s[^>]*\/?>/g)) {
    formatosPersonalizados.set(Number(atributo(m[0], "numFmtId")), atributo(m[0], "formatCode") || "");
  }
  const estiloEsFecha = [];
  const bloque = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilosXml);
  if (bloque) {
    for (const m of bloque[1].matchAll(/<xf\s[^>]*\/?>/g)) {
      const id = Number(atributo(m[0], "numFmtId") || 0);
      estiloEsFecha.push(FORMATOS_FECHA_INTEGRADOS.has(id) || (formatosPersonalizados.has(id) && esFormatoFecha(formatosPersonalizados.get(id))));
    }
  }

  function leerHoja(indice) {
    const h = hojas[indice];
    if (!h) throw new ArchivoInvalidoError("Hoja inexistente");
    const xml = zip.leer(h.ruta)?.toString("utf8");
    if (!xml) throw new ArchivoInvalidoError(`No se pudo leer la hoja «${h.nombre}»`);

    const filas = new Map(); // fila -> Map(col -> celda)
    let maxFila = 0;
    let maxCol = 0;
    for (const rm of xml.matchAll(/<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const numFila = Number(atributo(rm[1], "r"));
      if (!Number.isInteger(numFila) || numFila < 1 || !rm[2]) continue;
      for (const cm of rm[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = atributo(cm[1], "r");
        const refm = ref && /^([A-Z]+)(\d+)$/.exec(ref);
        if (!refm) continue;
        const col = colAIndice(refm[1]);
        const tipo = atributo(cm[1], "t");
        const estilo = Number(atributo(cm[1], "s") || 0);
        const cuerpo = cm[2] ?? "";
        const f = /<f(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/f>)/.test(cuerpo);
        // <v> puede traer atributos (p. ej. xml:space="preserve" en textos con espacios al inicio).
        const vRaw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        let celda = null;
        if (tipo === "inlineStr") {
          celda = { t: "s", v: textoDe(cuerpo) };
        } else if (vRaw === undefined) {
          celda = f ? { t: "z", v: null } : null; // fórmula sin valor guardado
        } else if (tipo === "s") {
          celda = { t: "s", v: compartidas[Number(vRaw)] ?? "" };
        } else if (tipo === "str") {
          celda = { t: "s", v: decodificar(vRaw) };
        } else if (tipo === "e") {
          celda = { t: "e", v: decodificar(vRaw) };
        } else if (tipo === "b") {
          celda = { t: "b", v: vRaw === "1" };
        } else {
          const num = Number(vRaw);
          if (!Number.isFinite(num)) celda = { t: "s", v: decodificar(vRaw) };
          else if (estiloEsFecha[estilo]) {
            const iso = serialAFecha(num, base1904);
            celda = iso ? { t: "d", v: iso, serial: num } : { t: "n", v: num };
          } else celda = { t: "n", v: num };
        }
        if (!celda) continue;
        if (f) celda.formula = true;
        if (!filas.has(numFila)) filas.set(numFila, new Map());
        filas.get(numFila).set(col, celda);
        if (numFila > maxFila) maxFila = numFila;
        if (col > maxCol) maxCol = col;
      }
    }

    const combinadas = [];
    for (const mm of xml.matchAll(/<mergeCell\s[^>]*\/?>/g)) {
      const ref = atributo(mm[0], "ref");
      const r = ref && /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
      if (r) combinadas.push({ c1: colAIndice(r[1]), r1: Number(r[2]), c2: colAIndice(r[3]), r2: Number(r[4]) });
    }

    return {
      indice,
      nombre: h.nombre,
      estado: h.estado,
      maxFila,
      maxCol,
      combinadas,
      celda: (f, c) => filas.get(f)?.get(c) ?? null,
      valor: (f, c) => filas.get(f)?.get(c)?.v ?? null,
      filaTieneDatos: (f) => (filas.get(f)?.size ?? 0) > 0,
      filasConDatos: () => [...filas.keys()].sort((a, b) => a - b),
      celdasDeFila: (f) => [...(filas.get(f)?.entries() ?? [])].sort((a, b) => a[0] - b[0]),
    };
  }

  return { hojas: hojas.map(({ indice, nombre, estado }) => ({ indice, nombre, estado })), leerHoja };
}
