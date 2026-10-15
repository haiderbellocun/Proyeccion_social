// Controlador mínimo de Chrome por CDP (solo QA local; sin dependencias). Usa el Chrome instalado en modo headless
// con un perfil temporal, de modo que no toca la sesión ni los datos del navegador del usuario.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

/** Localiza Chrome: CHROME_PATH o las rutas habituales de Windows, macOS y Linux. */
export function rutaChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const r = candidatos.find((c) => fs.existsSync(c));
  if (!r) throw new Error("No se encontró Chrome. Define CHROME_PATH con la ruta del ejecutable.");
  return r;
}

/** Puerto de depuración libre (evita choques entre ejecuciones). */
function puertoLibre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

export async function lanzar({ puerto, ancho = 1366, alto = 900 } = {}) {
  const CHROME = rutaChrome();
  puerto = puerto ?? await puertoLibre();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "proysocial-e2e-chrome-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "--no-first-run", "--disable-gpu",
    `--window-size=${ancho},${alto}`, "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
      ws = lista.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* arrancando */ }
  }
  if (!ws) throw new Error("Chrome no arrancó");
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0;
  const pend = new Map();
  const consola = [];
  const fallos = [];
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const { res, rej } = pend.get(d.id); pend.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); return; }
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) consola.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
    if (d.method === "Runtime.exceptionThrown") consola.push(`EXCEPCIÓN: ${d.params.exceptionDetails.exception?.description?.slice(0, 300) ?? d.params.exceptionDetails.text}`);
    if (d.method === "Network.responseReceived" && d.params.response.status >= 400) fallos.push(`${d.params.response.status} ${d.params.response.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120)}`);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { id += 1; pend.set(id, { res, rej }); sock.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });

  const p = {
    consola, fallos, send,
    async ir(url) { await send("Page.navigate", { url }); await new Promise((r) => setTimeout(r, 1200)); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async esperar(fnExpr, { ms = 15000, etiqueta = "" } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await p.eval(`!!(${fnExpr})`)) return true; } catch { /* aún no */ }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Tiempo agotado esperando: ${etiqueta || fnExpr}`);
    },
    // Click en el primer botón/enlace visible cuyo texto contiene `texto`
    async clic(texto, { selector = "button, a, [role=button], label" } = {}) {
      const ok = await p.eval(`(() => { const t = ${JSON.stringify(texto)}.toLowerCase(); const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetParent !== null && !e.disabled && e.innerText && e.innerText.toLowerCase().includes(t)); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
      if (!ok) throw new Error(`No se encontró para clic: ${texto}`);
      await new Promise((r) => setTimeout(r, 350));
    },
    async escribir(selector, valor) {
      await p.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('sin ${selector}'); const set = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(valor)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    },
    async archivo(selector, ruta) {
      const { root } = await send("DOM.getDocument");
      const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`sin input ${selector}`);
      await send("DOM.setFileInputFiles", { files: [ruta], nodeId });
    },
    async foto(archivo, { completa = false } = {}) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: completa });
      fs.writeFileSync(archivo, Buffer.from(r.data, "base64"));
    },
    async tamano(ancho, alto) { await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 600 }); await new Promise((r) => setTimeout(r, 400)); },
    texto: () => p.eval("document.body.innerText"),
    async cerrar() { try { sock.close(); } catch {} proc.kill(); try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {} },
  };
  return p;
}
