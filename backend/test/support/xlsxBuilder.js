// Genera archivos .xlsx SINTÉTICOS para pruebas (ZIP "stored" + XML mínimo). No usa datos reales.
import zlib from "node:zlib";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colLetra = (n) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const serial = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000);

function celdaXml(ref, v) {
  if (v == null) return "";
  if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  if (v.fecha) return `<c r="${ref}" s="1"><v>${serial(v.fecha)}</v></c>`;
  if (v.error) return `<c r="${ref}" t="e"><f>#REF!</f><v>${esc(v.error)}</v></c>`;
  if (v.formula !== undefined) {
    if (v.cache === undefined) return `<c r="${ref}"><f>${esc(v.formula)}</f></c>`;
    if (typeof v.cache === "number") return `<c r="${ref}"><f>${esc(v.formula)}</f><v>${v.cache}</v></c>`;
    return `<c r="${ref}" t="str"><f>${esc(v.formula)}</f><v xml:space="preserve">${esc(v.cache)}</v></c>`;
  }
  return "";
}

function hojaXml(filas, combinadas = []) {
  const rows = Object.keys(filas)
    .map(Number)
    .sort((a, b) => a - b)
    .map((r) => {
      const celdas = Object.entries(filas[r])
        .map(([c, v]) => [Number(c), v])
        .sort((a, b) => a[0] - b[0])
        .map(([c, v]) => celdaXml(`${colLetra(c)}${r}`, v))
        .join("");
      return `<row r="${r}">${celdas}</row>`;
    })
    .join("");
  const merges = combinadas.length ? `<mergeCells count="${combinadas.length}">${combinadas.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData>${merges}</worksheet>`;
}

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) : (() => {
    let c, crc = 0xffffffff;
    for (const b of buf) {
      c = (crc ^ b) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  })();
}

export function zip(entradas, { comprimir = false } = {}) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(entradas)) {
    const data = Buffer.from(contenido);
    const nom = Buffer.from(nombre);
    const crc = crc32(data);
    const comp = comprimir ? zlib.deflateRawSync(data) : data;
    const metodo = comprimir ? 8 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(metodo, 8);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nom.length, 26);
    locales.push(lh, nom, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(metodo, 10);
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nom.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrales.push(ch, nom);
    offset += 30 + nom.length + comp.length;
  }
  const dir = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(entradas).length, 8); fin.writeUInt16LE(Object.keys(entradas).length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, dir, fin]);
}

/** hojas: [{ nombre, estado?, filas: { [fila]: { [columna(1=A)]: valor } }, combinadas? }] */
export function crearXlsx(hojas, opciones = {}) {
  const entradas = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
      .map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}"${h.estado === "hidden" ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  };
  hojas.forEach((h, i) => {
    entradas[`xl/worksheets/sheet${i + 1}.xml`] = hojaXml(h.filas, h.combinadas);
  });
  return zip(entradas, opciones);
}

/**
 * Hoja de cronograma con el diseño real (cabecera con «Categoría, N°, Entregable…», filas de bloque
 * «Mes - Semana N» y entregables numerados), pero con datos inventados.
 * semanas: [{ mes, semana, fase?, items:[{ numero, entregable, descripcion?, horas?, inicio?, fin? }] }]
 */
export function hojaCronograma(nombre, semanas, { extraTop = {}, cola = [] } = {}) {
  const filas = { 1: { 1: "Nombre Docente", 4: "Docente Sintético" }, 2: { 1: "Programa Académico", 4: "Programa Sintético" }, 6: { 1: "Horas de P.S.", 4: "24 Horas" } };
  filas[8] = { 1: "Categoría", 2: "N° ", 7: "Entregable", 8: "Descripción Evidencia Documental", 9: "Tiempo en horas", 10: "Fecha de inicio", 11: "Fecha de finalización", 12: "Estatus de la entrega", 13: "Fecha real de entrega" };
  let r = 9;
  for (const s of semanas) {
    filas[r] = { 2: `${s.mes} - Semana ${s.semana}`, 9: 24, 10: `${s.mes} - Semana ${s.semana}` };
    if (s.fase) filas[r][1] = s.fase;
    r += 1;
    for (const it of s.items) {
      filas[r] = {
        2: it.numero ?? undefined, 7: it.entregable, 8: it.descripcion ?? "Cargar soporte", 9: it.horas ?? 1,
        10: it.inicio ? { fecha: it.inicio } : undefined, 11: it.fin ? { fecha: it.fin } : undefined, 12: "No iniciada",
        ...(it.extra || {}),
      };
      if (it.numero === undefined) delete filas[r][2];
      r += 1;
    }
  }
  for (const c of cola) {
    filas[r] = c;
    r += 1;
  }
  Object.assign(filas, extraTop);
  return { nombre, filas };
}
