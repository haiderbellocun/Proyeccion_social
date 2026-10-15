// Fixtures sintéticos de la suite «importador».
const { crearXlsx, hojaCronograma } = await import(new URL("../../../backend/test/support/xlsxBuilder.js", import.meta.url).href);

/** Devuelve los .xlsx SINTÉTICOS (prefijo TSTE4) en base64, más la fecha de inicio base. No escribe nada en disco. */
export async function generarFixtures() {
const hoy = new Date().toISOString().slice(0, 10);
const sum = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const ini = sum(hoy, -21);
const d = (n) => sum(ini, n);
const M = "TSTE4";
const base = () => [
  { mes: "Febrero", semana: 1, fase: "Febrero\nAlistamiento y Capacitación", items: [
    { numero: 1, entregable: `${M} Compromiso docente`, horas: 1, inicio: d(1), fin: d(4), descripcion: "Cargar soporte" },
    { numero: 2, entregable: `${M} Lectura de la política`, horas: 2, inicio: d(2), fin: d(4), descripcion: "https://drive.google.com/file/d/EJEMPLO/view" },
  ] },
  { mes: "Febrero", semana: 2, items: [{ numero: 3, entregable: `${M} Socialización`, horas: 3, inicio: d(8), fin: d(8) }] },
  { mes: "Marzo", semana: 3, fase: "Marzo\nGestión con aliados", items: [{ numero: 4, entregable: `${M} Reunión con aliado`, horas: 4, inicio: d(14), fin: d(18) }] },
  { mes: "Marzo", semana: 4, items: [{ numero: 5, entregable: `${M} Entrega de hoy`, horas: 2, inicio: d(21), fin: d(21) }] },
  { mes: "Abril", semana: 5, items: [{ numero: 6, entregable: `${M} Entrega futura`, horas: 5, inicio: d(28), fin: d(32) }] },
];
const b64 = (semanas, nombre = "G1 sintética") => crearXlsx([hojaCronograma(nombre, semanas), { nombre: "Oculta", estado: "hidden", filas: {} }]).toString("base64");

const dup = base();
dup.push({ mes: "Abril", semana: 6, items: [
  { numero: 3, entregable: `${M} Número repetido`, inicio: d(35), fin: d(36) },
  { numero: 20, entregable: `${M} Fecha fuera de semestre`, inicio: "2099-12-01", fin: "2099-12-02" },
  { numero: 21, entregable: `${M} Semana 12 con fecha de semana 6`, inicio: d(35), fin: d(37) },
] });
dup[dup.length - 1].semana = 12;

const fechas = base();
fechas[2].items[0] = { numero: 4, entregable: `${M} Fechas invertidas`, horas: 4, inicio: d(18), fin: d(14) };

const grande = [];
let n = 1;
for (let s = 1; s <= 16; s++) {
  const items = [];
  for (let k = 0; k < 13; k++, n++) items.push({ numero: n, entregable: `${M} Entregable masivo ${n} con un nombre largo para probar el recorte de texto en tablas compactas`, horas: 1, inicio: d((s - 1) * 7 + 1), fin: d((s - 1) * 7 + 4) });
  grande.push({ mes: ["Febrero", "Marzo", "Abril", "Mayo"][Math.floor((s - 1) / 4)], semana: s, items });
}
const sinEstructura = crearXlsx([{ nombre: "Notas", filas: { 1: { 1: "Esto no es una matriz" }, 2: { 1: "texto libre" } } }]).toString("base64");

const fx = {
  ini,
  valido: b64(base()),
  duplicados: b64(dup),
  fechas: b64(fechas),
  grande: b64(grande),
  sinEstructura,
  corrupto: Buffer.from("esto no es un zip valido, solo texto de prueba TSTE4").toString("base64"),
  grandeN: n - 1,
};
return fx;
}
