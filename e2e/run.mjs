// Ejecutor serial de las suites E2E. Uso: node e2e/run.mjs [opciones] [suite ...]   (sin suites = todas, en orden)
//   --lista        muestra las suites disponibles
//   --reanudar     omite las suites que ya salieron OK en la última ejecución SI las fuentes no cambiaron desde entonces
// Controles de recursos (variables de entorno):
//   E2E_MIN_FREE_MB   memoria disponible mínima para iniciar una suite (def. 700); si no se alcanza en 60 s se detiene ordenadamente
//   E2E_ABORT_FREE_MB memoria disponible por debajo de la cual se interrumpe la suite en curso (def. 450)
//   E2E_SUITE_TIMEOUT_MS tiempo máximo por suite (def. 1 800 000 = 30 min)
// Registro: e2e/salida/resultados/<fecha>/<suite>.log + resumen.json; e2e/salida/ultimo-resumen.json guarda el último estado por suite.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tomarBloqueo, BACKEND, RAIZ, OUT } from "./lib/helpers.mjs";
import { matarArbol } from "./lib/cdp.mjs";
import { huellaFuentes, limpiarHuerfanos, memoriaLibreMB } from "./lib/entorno.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirSuites = path.join(aqui, "suites");
// Orden de ejecución: primero solo lectura, luego las que escriben fixtures temporales.
const ORDEN = ["regresion-shell", "matrices", "revision", "revision-evidencias", "importador", "docente", "responsive-docente", "administracion", "historicos", "indicadores", "capturas-indicadores"];
const disponibles = fs.readdirSync(dirSuites).filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
const ordenadas = [...ORDEN.filter((s) => disponibles.includes(s)), ...disponibles.filter((s) => !ORDEN.includes(s)).sort()];

const args = process.argv.slice(2);
if (args.includes("--lista")) { console.log(ordenadas.join("\n")); process.exit(0); }
const reanudar = args.includes("--reanudar");
const nombres = args.filter((a) => !a.startsWith("--"));
const pedidas = nombres.length ? nombres : ordenadas;
const desconocidas = pedidas.filter((s) => !disponibles.includes(s));
if (desconocidas.length) { console.error(`Suite desconocida: ${desconocidas.join(", ")}. Disponibles: ${ordenadas.join(", ")}`); process.exit(1); }

const MIN_LIBRE = Number(process.env.E2E_MIN_FREE_MB || 700);
const ABORTAR_LIBRE = Number(process.env.E2E_ABORT_FREE_MB || 450);
const TIEMPO_SUITE = Number(process.env.E2E_SUITE_TIMEOUT_MS || 1_800_000);
// Errores de consola provocados a propósito por las suites que simulan fallos de red/500 (no son defectos).
const ESPERADOS = [/consola sin errores.*(Error al cargar dashboard admin|Failed to fetch)/];

tomarBloqueo("run.mjs");
const huella = huellaFuentes(RAIZ);
const marca = new Date().toISOString().replace(/[:.]/g, "-");
const dirRes = path.join(OUT, "resultados", marca);
fs.mkdirSync(dirRes, { recursive: true });
const archivoUltimo = path.join(OUT, "ultimo-resumen.json");
let previo = null;
try { previo = JSON.parse(fs.readFileSync(archivoUltimo, "utf8")); } catch { /* primera ejecución */ }

const huerfanos = limpiarHuerfanos();
if (huerfanos.chromeCerrados.length || huerfanos.perfilesBorrados) console.log(`Limpieza previa: ${huerfanos.chromeCerrados.length} Chrome de pruebas huérfanos cerrados, ${huerfanos.perfilesBorrados} perfiles temporales borrados.`);
console.log(`Memoria disponible: ${memoriaLibreMB()} MB (mínimo para iniciar: ${MIN_LIBRE} MB; interrupción: ${ABORTAR_LIBRE} MB)`);

let hijoActual = null;
process.on("exit", () => { if (hijoActual?.pid) matarArbol(hijoActual.pid); });

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarMemoria() {
  for (let i = 0; i < 12 && memoriaLibreMB() < MIN_LIBRE; i += 1) await pausa(5000);
  return memoriaLibreMB() >= MIN_LIBRE;
}

const resumen = [];
const estadoPorSuite = { ...(reanudar && previo?.huella === huella ? previo.suites : {}) };
let falloReal = false;
let interrumpida = false;

for (const suite of pedidas) {
  if (interrumpida) { resumen.push({ suite, ok: 0, esperadas: 0, reales: 0, estado: "NO EJECUTADA (memoria)" }); continue; }
  if (reanudar && previo?.huella === huella && previo.suites?.[suite]?.estado === "OK") {
    const p = previo.suites[suite];
    console.log(`\n══ ${suite} ══ (resultado válido reutilizado: fuentes sin cambios desde ${p.cuando})`);
    resumen.push({ ...p, estado: "OK", reutilizada: true });
    continue;
  }
  console.log(`\n══ ${suite} ══`);
  if (!(await esperarMemoria())) {
    console.error(`Memoria insuficiente (${memoriaLibreMB()} MB < ${MIN_LIBRE} MB). Se detiene ordenadamente; los resultados disponibles se guardan.`);
    interrumpida = true;
    resumen.push({ suite, ok: 0, esperadas: 0, reales: 0, estado: "NO EJECUTADA (memoria)" });
    continue;
  }
  const log = fs.createWriteStream(path.join(dirRes, `${suite}.log`));
  const inicio = Date.now();
  const salida = await new Promise((resolve) => {
    const hijo = spawn(process.execPath, [path.join(dirSuites, `${suite}.mjs`)], {
      cwd: BACKEND, env: { ...process.env, E2E_LOCK_HELD: "1" }, stdio: ["ignore", "pipe", "pipe"],
    });
    hijoActual = hijo;
    let buf = "";
    let motivo = null;
    hijo.stdout.on("data", (d) => { buf += d; log.write(d); process.stdout.write(d); });
    hijo.stderr.on("data", (d) => { log.write(d); process.stderr.write(d); });
    const vigilante = setInterval(() => {
      if (Date.now() - inicio > TIEMPO_SUITE) { motivo = "TIEMPO AGOTADO"; matarArbol(hijo.pid); }
      else if (memoriaLibreMB() < ABORTAR_LIBRE) { motivo = "INTERRUMPIDA (memoria)"; matarArbol(hijo.pid); }
    }, 5000);
    hijo.on("close", (codigo) => { clearInterval(vigilante); hijoActual = null; resolve({ buf, codigo, motivo }); });
  });
  log.end();
  // Tras cada suite: nada de Chrome de pruebas debe quedar vivo (aunque la suite haya terminado mal).
  limpiarHuerfanos({ minutos: 0 });
  const lineas = salida.buf.split(/\r?\n/);
  const ok = lineas.filter((l) => l.startsWith("OK")).length;
  const fallas = lineas.filter((l) => l.startsWith("FALLA"));
  const esperadas = fallas.filter((l) => ESPERADOS.some((r) => r.test(l)));
  const reales = fallas.filter((l) => !esperadas.includes(l));
  const rota = salida.motivo != null || salida.codigo !== 0 || (ok === 0 && fallas.length === 0);
  if (salida.motivo === "INTERRUMPIDA (memoria)") interrumpida = true;
  if (reales.length || rota) falloReal = true;
  const estado = salida.motivo ?? (rota ? `SALIÓ CON CÓDIGO ${salida.codigo}` : reales.length ? "FALLA" : "OK");
  const fila = { suite, ok, esperadas: esperadas.length, reales: reales.length, estado, segundos: Math.round((Date.now() - inicio) / 1000), cuando: new Date().toISOString() };
  resumen.push(fila);
  estadoPorSuite[suite] = fila;
}

console.log("\n══ Resumen ══");
for (const r of resumen) console.log(`${r.estado.padEnd(24)} ${r.suite.padEnd(24)} OK=${r.ok} esperadas=${r.esperadas} FALLA=${r.reales}${r.reutilizada ? "  (reutilizada)" : ""}`);
const final = limpiarHuerfanos({ minutos: 0 });
console.log(`Procesos de pruebas huérfanos al terminar: ${final.chromeCerrados.length}. Memoria disponible: ${memoriaLibreMB()} MB.`);
fs.writeFileSync(path.join(dirRes, "resumen.json"), JSON.stringify({ huella, resumen, memoriaLibreMB: memoriaLibreMB() }, null, 2));
fs.writeFileSync(archivoUltimo, JSON.stringify({ huella, suites: estadoPorSuite }, null, 2));
process.exit(interrumpida ? 4 : falloReal ? 1 : 0);
