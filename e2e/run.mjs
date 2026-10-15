// Ejecutor serial de las suites E2E. Uso: node e2e/run.mjs [suite ...]   (sin argumentos = todas, en orden)
//   node e2e/run.mjs --lista     muestra las suites disponibles
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tomarBloqueo, BACKEND } from "./lib/helpers.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirSuites = path.join(aqui, "suites");
// Orden de ejecución: primero solo lectura, luego las que escriben fixtures temporales.
const ORDEN = ["regresion-shell", "matrices", "revision", "revision-evidencias", "importador", "docente", "responsive-docente", "administracion"];
const disponibles = fs.readdirSync(dirSuites).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
const ordenadas = [...ORDEN.filter((s) => disponibles.includes(s)), ...disponibles.filter((s) => !ORDEN.includes(s)).sort()];

const args = process.argv.slice(2);
if (args.includes("--lista")) { console.log(ordenadas.join("\n")); process.exit(0); }
const pedidas = args.length ? args : ordenadas;
const desconocidas = pedidas.filter((s) => !disponibles.includes(s));
if (desconocidas.length) { console.error(`Suite desconocida: ${desconocidas.join(", ")}. Disponibles: ${ordenadas.join(", ")}`); process.exit(1); }

// Errores de consola provocados a propósito por las suites que simulan fallos de red/500 (no son defectos).
const ESPERADOS = [/consola sin errores.*(Error al cargar dashboard admin|Failed to fetch)/];

tomarBloqueo("run.mjs");
const resumen = [];
let falloReal = false;
for (const suite of pedidas) {
  console.log(`\n══ ${suite} ══`);
  const salida = await new Promise((resolve) => {
    const hijo = spawn(process.execPath, [path.join(dirSuites, `${suite}.mjs`)], {
      cwd: BACKEND, env: { ...process.env, E2E_LOCK_HELD: "1" }, stdio: ["ignore", "pipe", "inherit"],
    });
    let buf = "";
    hijo.stdout.on("data", (d) => { buf += d; process.stdout.write(d); });
    hijo.on("close", (codigo) => resolve({ buf, codigo }));
  });
  const lineas = salida.buf.split(/\r?\n/);
  const ok = lineas.filter((l) => l.startsWith("OK")).length;
  const fallas = lineas.filter((l) => l.startsWith("FALLA"));
  const esperadas = fallas.filter((l) => ESPERADOS.some((r) => r.test(l)));
  const reales = fallas.filter((l) => !esperadas.includes(l));
  const rota = salida.codigo !== 0 || (ok === 0 && fallas.length === 0);
  if (reales.length || rota) falloReal = true;
  resumen.push({ suite, ok, esperadas: esperadas.length, reales: reales.length, estado: rota ? `SALIÓ CON CÓDIGO ${salida.codigo}` : reales.length ? "FALLA" : "OK" });
}
console.log("\n══ Resumen ══");
for (const r of resumen) console.log(`${r.estado.padEnd(8)} ${r.suite.padEnd(22)} OK=${r.ok} esperadas=${r.esperadas} FALLA=${r.reales}`);
process.exit(falloReal ? 1 : 0);
