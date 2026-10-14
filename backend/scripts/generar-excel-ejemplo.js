// Genera un .xlsx SINTÉTICO (sin datos reales) para probar el asistente «Importar matriz Excel».
//   npm run ejemplo:excel [-- --salida ruta.xlsx] [-- --inicio AAAA-MM-DD]
// Sin --inicio usa el inicio del semestre activo de la base configurada (PGDATABASE).
// Incluye a propósito un número repetido y una fecha fuera del semestre para ver las validaciones.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { crearXlsx, hojaCronograma } from "../test/support/xlsxBuilder.js";
import { sumarDias } from "../src/services/matrizService.js";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
let inicio = arg("inicio");
if (!inicio) {
  const { pool } = await import("../src/db.js");
  const r = await pool.query(`SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS f FROM semestres WHERE activo = TRUE ORDER BY fecha_inicio DESC LIMIT 1`);
  inicio = r.rows[0]?.f;
  await pool.end();
}
if (!inicio) throw new Error("No hay semestre activo: indique --inicio AAAA-MM-DD");

const d = (n) => sumarDias(inicio, n);
const semanas = [
  { mes: "Agosto", semana: 1, fase: "Agosto\nAlistamiento y Capacitación", items: [
    { numero: 1, entregable: "Diligenciar formulario de compromiso docente", horas: 1, inicio: d(1), fin: d(4), descripcion: "Responder el formulario y cargar captura" },
    { numero: 2, entregable: "Lectura y evaluación de la política", horas: 2, inicio: d(2), fin: d(4), descripcion: "Responder la evaluación de entendimiento" },
  ] },
  { mes: "Agosto", semana: 2, items: [{ numero: 3, entregable: "Participar en la socialización de lineamientos", horas: 3, inicio: d(8), fin: d(8), descripcion: "Participar activamente del evento" }] },
  { mes: "Septiembre", semana: 4, fase: "Septiembre\nGestión con los aliados", items: [
    { numero: 4, entregable: "Reunión con el actor externo", horas: 4, inicio: d(22), fin: d(25), descripcion: "Cargar acta firmada" },
    { numero: 4, entregable: "Entregable con número repetido (ejemplo)", horas: 1, inicio: d(23), fin: d(25) },
  ] },
  { mes: "Octubre", semana: 8, fase: "Octubre\nDesarrollo de proyectos", items: [
    { numero: 5, entregable: "Implementación de la sesión 1", horas: 6, inicio: d(50), fin: d(54), descripcion: "Esta tarea no implica realizar cargue" },
    { numero: 6, entregable: "Entregable con fecha fuera del semestre (ejemplo)", horas: 1, inicio: d(400), fin: d(401) },
  ] },
];
const salida = path.resolve(arg("salida") || "ejemplos/matriz-ejemplo.xlsx");
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, crearXlsx([hojaCronograma("Cronograma sintético", semanas)]));
console.log(`Archivo de ejemplo: ${salida}\nInicio de semestre usado: ${inicio}\nEn el asistente: hoja «Cronograma sintético», semestre activo, grupo nuevo.`);
