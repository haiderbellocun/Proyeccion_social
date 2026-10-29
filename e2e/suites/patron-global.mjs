// Patrón geométrico de fondo (identidad B2) en TODAS las vistas principales: capturas reales a 1440/1280/820/390 y diagnóstico de qué fondos opacos tapan el lienzo.
// Compilación de producción servida por su backend (puerto 4346) sobre la base local aislada proysocial_piloto en modo demo público (solo lectura).
// Uso: [PATRON_ETIQUETA=antes|despues] node e2e/suites/patron-global.mjs [carpeta]      (por defecto e2e/salida/patron-global)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, linea, E, RAIZ, BACKEND } from "../lib/helpers.mjs";

iniciarSuite("patron-global");
const etiqueta = process.env.PATRON_ETIQUETA || "despues";
const PORT = 4346;
const APP = `http://127.0.0.1:${PORT}`;
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/patron-global");
fs.mkdirSync(salida, { recursive: true });
const dist = path.join(os.tmpdir(), `proysocial-patron-${etiqueta}`);
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

const b = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, shell: true, env: { ...process.env, VITE_API_URL: "", VITE_GOOGLE_CLIENT_ID: "" }, encoding: "utf8" });
if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(2); }

const server = spawn(process.execPath, ["--env-file=.env", "src/index.js"], {
  cwd: BACKEND, stdio: ["ignore", "ignore", "ignore"],
  env: { ...process.env, PGDATABASE: "proysocial_piloto", PGHOST: "localhost", DATABASE_URL: "", NODE_ENV: "production", JWT_SECRET: "pruebas-patron-global-secreto-largo-0123456789abcdef", EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(PORT), STATIC_DIR: dist, DEMO_ENABLED: "true", DEMO_PUBLIC_READONLY: "true", DEMO_ACCESS_KEY: "", DEMO_OPEN: "", DEV_LOGIN_ENABLED: "false", ALLOWED_ORIGIN: "" },
});
let p;
try {
  for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${APP}/health`)).ok) break; } catch { /* iniciando */ } await pausa(150); }
  const est = await (await fetch(`${APP}/auth/demo/estado`)).json().catch(() => ({}));
  if (est.entorno?.base !== "proysocial_piloto" || est.abierto !== false) { console.error("Backend/base no permitidos", JSON.stringify(est)); process.exit(2); }

  p = await lanzar({ ancho: 1440, alto: 900 });
  const ANCHOS = [[1440, 900], [1280, 800], [820, 1180], [390, 844]];
  // Diagnóstico: elementos de la vista que cubren buena parte del lienzo con fondo opaco (los que taparían el patrón).
  const tapan = () => E(p, `const m=document.querySelector('.b2-main').getBoundingClientRect(); const out=[];
    for (const el of document.querySelectorAll('.b2-main *')) { const r=el.getBoundingClientRect(); if (r.width<m.width*0.6||r.height<m.height*0.5) continue;
      const bg=getComputedStyle(el).backgroundColor; const a=bg.replace(/[^0-9.,]/g,"").split(",").map(Number); if (a.length===4 ? a[3]<0.5 : false) continue; if (a[0]===255&&a[1]===255&&a[2]===255) continue;
      out.push((el.className&&el.className.baseVal===undefined?el.className:el.tagName).toString().split(' ').slice(0,2).join('.')+' '+bg+' '+Math.round(r.width)+'x'+Math.round(r.height)); }
    return out.slice(0,4).join(' | ')`);
  const patron = () => E(p, `const c=document.querySelector('.b2-cuerpo'); const cs=getComputedStyle(c,'::before'); const m=getComputedStyle(document.querySelector('.b2-main'));
    return JSON.stringify({op:cs.opacity, mask:(cs.maskImage||cs.webkitMaskImage||'').slice(0,40), z:cs.zIndex, mainBg:m.backgroundColor})`);

  const entrar = async (nombre) => {
    await p.ir(`${APP}/`); await pausa(300); await p.eval("localStorage.clear(); sessionStorage.clear(); true"); await p.ir(`${APP}/`);
    await p.esperar("document.querySelectorAll('[data-testid=demo-usuario]').length === 5", { etiqueta: "tarjetas" }); await pausa(800);
    await p.clic(nombre); await p.esperar("location.pathname === '/admin' || location.pathname === '/docente'", { etiqueta: "panel" }); await pausa(1200);
    return JSON.parse(await E(p, "return localStorage.getItem('proysocial:user')"));
  };
  const vistas = async (prefijo, rutas) => {
    for (const [id, ruta] of rutas) {
      await p.tamano(1440, 900); await p.ir(`${APP}${ruta}`); await pausa(1800);
      const cubre = await tapan();
      ok(`${prefijo}/${id}: sin fondo opaco de página sobre el lienzo`, cubre === "", cubre);
      for (const [w, h] of ANCHOS) {
        await p.tamano(w, h); await pausa(450);
        const desb = await E(p, "return document.documentElement.scrollWidth - innerWidth");
        ok(`${prefijo}/${id} a ${w}px sin desborde horizontal`, desb <= 2, `${desb}px`);
        await p.foto(path.join(salida, `${etiqueta}-${prefijo}-${id}-${w}.png`));
      }
    }
  };
  const maria = await entrar("Maria Rodriguez");
  if (etiqueta === "despues") ok("la capa del patrón existe detrás del contenido y .b2-main es transparente", /"z":"-1"/.test(await patron()) && /rgba\(0, 0, 0, 0\)/.test(await patron()), await patron());
  await vistas("docente", [["panel", "/docente"], ["matriz", "/docente/matriz"], ["iniciativas", "/docente/proyectos"], ["evidencias", "/docente/evidencias"], ["historial", "/docente/historial"], ["reportar", "/docente/reportar"], ["perfil", "/docente/perfil"]]);
  await entrar("Admin Sistema");
  await vistas("admin", [["panel", "/admin"], ["revision", "/admin/revision"], ["reportes", "/admin/reportes"], ["avance", "/admin/avance"], ["indicadores", "/admin/indicadores"], ["importar", "/admin/importar-matriz"], ["sistema", "/admin/sistema"], ["matriz-docente", `/admin/docentes/${maria.id}/matriz`]]);
  const errores = p.consola.filter((c) => !/favicon|401|403|503|500|net::ERR|Failed to load resource/.test(c));
  ok("sin excepciones de JavaScript", !errores.some((c) => c.startsWith("EXCEPCIÓN")), errores.slice(0, 3).join(" | "));
} finally {
  await p?.cerrar();
  server.kill();
}
console.log(res.join("\n"));
console.log(`\nCapturas en ${salida}`);
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
