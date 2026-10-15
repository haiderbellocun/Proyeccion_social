// Cuidado del entorno de pruebas: memoria, procesos huérfanos propios del ejecutor y huella de las fuentes.
// Solo actúa sobre lo que las pruebas crean (Chrome con perfil «proysocial-e2e-chrome-*»); nunca toca el Chrome del usuario.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matarArbol } from "./cdp.mjs";

export const PREFIJO_PERFIL = "proysocial-e2e-chrome-";

/** Memoria física disponible (libre + caché reutilizable) en MB. */
export const memoriaLibreMB = () => Math.round(os.freemem() / 1048576);

const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** Procesos Chrome de las pruebas (solo los principales: los que llevan nuestro perfil temporal y no son hijos «--type=»). */
function chromePrincipalesDePruebas() {
  const lista = [];
  if (process.platform === "win32") {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match '${PREFIJO_PERFIL}' -and $_.CommandLine -notmatch '--type=' } | Select-Object ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Compress`;
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" });
    const txt = (r.stdout || "").trim();
    if (!txt) return lista;
    const filas = [].concat(JSON.parse(txt));
    for (const f of filas) lista.push({ pid: f.ProcessId, padre: f.ParentProcessId, linea: f.CommandLine || "" });
  } else {
    const r = spawnSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" });
    for (const l of (r.stdout || "").split("\n")) {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
      if (m && m[3].includes(PREFIJO_PERFIL) && !m[3].includes("--type=")) lista.push({ pid: Number(m[1]), padre: Number(m[2]), linea: m[3] });
    }
  }
  return lista;
}

/**
 * Cierra los Chrome de pruebas cuyo proceso padre (la suite que los lanzó) ya no existe y borra los perfiles temporales
 * sin uso (más de `minutos` de antigüedad). Devuelve un resumen. No toca nada que no lleve el prefijo de las pruebas.
 */
export function limpiarHuerfanos({ minutos = 30 } = {}) {
  const cerrados = [];
  const enUso = new Set();
  for (const c of chromePrincipalesDePruebas()) {
    const perfil = /--user-data-dir="?([^"\s]+proysocial-e2e-chrome-[^"\s]+)"?/.exec(c.linea)?.[1];
    if (!vivo(c.padre)) { matarArbol(c.pid); cerrados.push(c.pid); }
    else if (perfil) enUso.add(path.resolve(perfil));
  }
  let perfilesBorrados = 0;
  const limite = Date.now() - minutos * 60_000;
  for (const d of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (!d.isDirectory() || !d.name.startsWith(PREFIJO_PERFIL)) continue;
    const ruta = path.join(os.tmpdir(), d.name);
    if (enUso.has(path.resolve(ruta))) continue;
    try {
      if (fs.statSync(ruta).mtimeMs > limite) continue;
      fs.rmSync(ruta, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      perfilesBorrados += 1;
    } catch { /* en uso o sin permiso: se deja */ }
  }
  return { chromeCerrados: cerrados, perfilesBorrados };
}

/** Huella de las fuentes (front, backend y pruebas) para decidir si un resultado anterior sigue siendo válido. */
export function huellaFuentes(raiz) {
  const h = crypto.createHash("sha1");
  const omitir = new Set(["node_modules", "dist", "salida", ".git"]);
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (omitir.has(e.name)) continue;
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (!e.name.endsWith(".md")) { const st = fs.statSync(ruta); h.update(`${path.relative(raiz, ruta)}|${st.size}|${Math.floor(st.mtimeMs)}\n`); }
    }
  };
  for (const d of ["src", path.join("backend", "src"), "e2e"]) if (fs.existsSync(path.join(raiz, d))) recorrer(path.join(raiz, d));
  for (const f of ["package.json", path.join("backend", "package.json")]) if (fs.existsSync(path.join(raiz, f))) { const st = fs.statSync(path.join(raiz, f)); h.update(`${f}|${st.size}|${Math.floor(st.mtimeMs)}\n`); }
  return h.digest("hex");
}
