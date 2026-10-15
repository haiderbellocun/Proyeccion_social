// Utilidades compartidas por las suites E2E (Chrome por CDP contra la app real y la BD de desarrollo).
// API estable: no cambies firmas sin actualizar todas las suites ni el README.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanzar } from "./cdp.mjs";

export { lanzar };

const aqui = path.dirname(fileURLToPath(import.meta.url));
/** Raíz del repo y carpeta del backend. */
export const RAIZ = path.resolve(aqui, "../..");
export const BACKEND = path.join(RAIZ, "backend");
export const APP = process.env.APP_URL || "http://localhost:5173";
export const API = process.env.API_URL || "http://localhost:4000";
/** Carpeta de salida (capturas, etc.). Por defecto e2e/salida/ (ignorada por git). */
export const OUT = process.env.E2E_OUT ? path.resolve(process.env.E2E_OUT) : path.join(RAIZ, "e2e", "salida");
/** Excel de ejemplo del backend (si existe en el entorno local). */
export const EXCEL = path.join(BACKEND, "ejemplos", "matriz-ejemplo.xlsx");
export const ADMIN = "admin@proysocial.local";

export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/** Línea de resultado estándar: «OK   nombre — detalle» / «FALLA nombre — detalle». */
export const linea = (nombre, cond, detalle = "") => `${cond ? "OK   " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`;

/* ───────── evaluación en la página ───────── */
export const E = (p, js) => p.eval(`(() => { ${js} })()`);
export const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
export const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
export const setInput = (sel, v, proto = "HTMLInputElement") => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}));`;
export const setSel = (sel, v) => `const s=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(v)}); s.dispatchEvent(new Event('change',{bubbles:true}));`;
export const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");

/** Inicia sesión con el acceso de desarrollo y devuelve el id del usuario. */
export async function login(p, correo) {
  await p.ir(APP + "/");
  await pausa(800);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();if(!x.ok)throw new Error('login '+JSON.stringify(d));localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
/** Llamada a la API con el token de la sesión; devuelve {s: estado, d: cuerpo}. `opts` es texto JS adicional para fetch (p. ej. ",method:'PUT',body:'{}'"). */
export const api = (p, ruta, opts = "") => EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}${ruta}',{headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}${opts}}); return JSON.stringify({s:r.status, d:await r.json().catch(()=>null)})`).then((x) => JSON.parse(x));
export const ir = async (p, ruta, espera = 3000) => { await p.ir(APP + ruta); await pausa(espera); };

/* ───────── base de datos: solo proysocial_dev ───────── */
/**
 * Devuelve { pool, q } del backend, abortando (código 2) si la base no es proysocial_dev.
 * Fuerza PGDATABASE/PGHOST y anula DATABASE_URL antes de cargar el pool; las credenciales siguen saliendo de backend/.env.
 */
export async function guardaBD() {
  process.env.PGDATABASE = "proysocial_dev";
  process.env.PGHOST = process.env.PGHOST || "localhost";
  process.env.DATABASE_URL = "";
  process.chdir(BACKEND); // dotenv del backend lee .env desde el directorio actual
  const { pool } = await import(new URL("../../backend/src/db.js", import.meta.url).href);
  const r = await pool.query("select current_database() d");
  if (r.rows[0].d !== "proysocial_dev") { console.error("Base no permitida:", r.rows[0].d); process.exit(2); }
  const q = async (s, params = []) => (await pool.query(s, params)).rows;
  return { pool, q };
}
/** Conteos de las tablas sensibles para comparar la BD antes/después de una suite (línea base sembrada). */
export async function instantanea(q, tablas = ["proyecto_entregables", "entregable_evidencias", "entregable_eventos", "usuarios"]) {
  const t = {};
  for (const tabla of tablas) t[tabla] = Number((await q(`select count(*) n from ${tabla}`))[0].n);
  t.estados = JSON.stringify(await q(`select estado_revision, count(*)::int n from proyecto_entregables group by 1 order by 1`));
  return t;
}

/* ───────── bloqueo: nunca dos ejecuciones a la vez ───────── */
const LOCK = path.join(os.tmpdir(), "proysocial-e2e.lock");
const viva = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
/** Toma el bloqueo o termina con un mensaje claro. Se libera al salir (también con Ctrl+C o error). */
export function tomarBloqueo(nombre = "e2e") {
  if (fs.existsSync(LOCK)) {
    let previo = {};
    try { previo = JSON.parse(fs.readFileSync(LOCK, "utf8")); } catch { /* bloqueo corrupto */ }
    if (previo.pid && viva(previo.pid) && previo.pid !== process.pid) {
      console.error(`Ya hay otra ejecución E2E en curso (${previo.nombre ?? "?"}, PID ${previo.pid}). Las suites comparten la BD de desarrollo y NO deben correr en paralelo. Espera a que termine.`);
      process.exit(3);
    }
  }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, nombre, desde: new Date().toISOString() }));
  const soltar = () => { try { const c = JSON.parse(fs.readFileSync(LOCK, "utf8")); if (c.pid === process.pid) fs.rmSync(LOCK); } catch { /* ya liberado */ } };
  process.on("exit", soltar);
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { soltar(); process.exit(130); });
  return soltar;
}

/** Punto de entrada de cada suite: toma el bloqueo salvo que `run.mjs` ya lo tenga (E2E_LOCK_HELD=1). */
export function iniciarSuite(nombre) {
  if (process.env.E2E_LOCK_HELD === "1") return;
  tomarBloqueo(nombre);
}
