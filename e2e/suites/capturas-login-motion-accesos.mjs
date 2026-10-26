// Capturas del login animado en sus accesos secundarios: acceso de desarrollo (DEV) y demostración abierta (DEMO_OPEN, sin clave).
// Requiere dos frontends/backends locales ya levantados (ver docs/b2-integracion/login-motion/README.md):
//   DEV_URL  (def. http://localhost:5180)  frontend con VITE_API_URL → backend con .env.dev (proysocial_dev)
//   OPEN_URL (def. http://localhost:5181)  frontend con VITE_API_URL → backend con DEMO_ENABLED=true DEMO_OPEN=true sobre proysocial_piloto local
// Uso: node e2e/suites/capturas-login-motion-accesos.mjs [carpeta-relativa-a-la-raíz]. No inicia sesión salvo en la comprobación del modo abierto.
import path from "node:path";
import fs from "node:fs";
import { lanzar, pausa, RAIZ } from "../lib/helpers.mjs";

const salida = path.resolve(RAIZ, process.argv[2] || "docs/b2-integracion/login-motion");
fs.mkdirSync(salida, { recursive: true });
const DEV = process.env.DEV_URL || "http://localhost:5180";
const OPEN = process.env.OPEN_URL || "http://localhost:5181";
const OPEN_API = process.env.OPEN_API || "http://localhost:4351";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const p = await lanzar({ ancho: 1440, alto: 900 });
const E = (js) => p.eval(`(() => { ${js} })()`);
const limpio = async (url) => { await p.ir(url + "/"); await pausa(300); await p.eval("localStorage.clear(); sessionStorage.clear(); true"); await p.ir(url + "/"); await pausa(3200); };
try {
  // ── Acceso de desarrollo ──
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await p.tamano(w, h); await limpio(DEV);
    ok(`DEV ${w}px: 5 usuarios con aparición escalonada`, (await E("return document.querySelectorAll('.lg-dev .lg-user').length")) === 5);
    await p.foto(path.join(salida, `dev-inicio-${w}.png`));
    // Plegar y volver a desplegar para ver de nuevo la aparición escalonada
    await E("document.querySelector('.lg-dev-cab').click(); return true"); await pausa(300);
    await E("if (document.querySelector('.lg-dev-cab').getAttribute('aria-expanded') !== 'true') document.querySelector('.lg-dev-cab').click(); return true"); await pausa(900);
    ok(`DEV ${w}px: los usuarios se despliegan con retardo escalonado (--i)`, await E("const l=[...document.querySelectorAll('.lg-dev-lista > li')]; return l.length===5 && l.every((li,i)=>li.style.getPropertyValue('--i')===String(i))"));
    await p.foto(path.join(salida, `dev-abierto-${w}.png`));
  }
  await p.tamano(1440, 900);

  // ── Demostración abierta (sin clave, con escritura) ──
  await limpio(OPEN);
  const est = await E("return document.querySelector('.lg-demo')?.innerText || ''");
  ok("DEMO abierta: título «Entorno de pruebas · Puedes probar y modificar»", /Entorno de pruebas/.test(est) && /modificar/.test(est), est.replace(/\n/g, " | "));
  ok("DEMO abierta: no pide clave; muestra los 5 usuarios de inmediato", (await E("return document.querySelectorAll('.lg-demo .lg-user').length")) === 5 && (await E("return !document.querySelector('#lg-demo-clave')")));
  await p.foto(path.join(salida, "demo-abierta-1440.png"));
  await p.tamano(390, 844); await limpio(OPEN);
  await p.foto(path.join(salida, "demo-abierta-390.png"));
  await p.tamano(1440, 900); await limpio(OPEN);
  const cons0 = p.consola.length;
  await E("document.querySelector('.lg-demo .lg-user').click(); return true"); await pausa(3500);
  ok("DEMO abierta: elegir el administrador entra a /admin", (await p.eval("location.pathname")) === "/admin", await p.eval("location.pathname"));
  ok("DEMO abierta: sin banda «solo lectura»", await E("return !document.querySelector('.b2-demo')"));
  // Escritura permitida: una escritura inválida debe llegar a la validación del servidor (4xx distinto de 403 «solo lectura»), no ser bloqueada por el modo demo.
  const w = await p.eval(`(async () => { const t = localStorage.getItem('proysocial:token'); const r = await fetch('${OPEN_API}/admin/usuarios', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' }); const d = await r.json().catch(() => ({})); return JSON.stringify({ s: r.status, demo: !!d.demo, e: d.error }); })()`);
  const wj = JSON.parse(w);
  ok("DEMO abierta: la escritura ya no la bloquea el modo demo (llega a la validación)", wj.s !== 403 || !wj.demo, w);
  await p.foto(path.join(salida, "demo-abierta-admin-1440.png"));
  const errores = p.consola.slice(cons0).filter((c) => !/Failed to load resource|favicon|403|400/i.test(c));
  ok("sin excepciones de consola propias", errores.length === 0, errores.slice(0, 3).join(" | "));
} finally {
  await p.cerrar();
}
console.log("\n" + res.join("\n"));
const fallas = res.filter((r) => r.startsWith("FALLA")).length;
console.log(`\n${res.length - fallas}/${res.length} OK`);
process.exit(fallas ? 1 : 0);
