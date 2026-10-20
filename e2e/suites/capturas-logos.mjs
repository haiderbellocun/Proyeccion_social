// Verificación visual de los logos (login, cabecera B2 admin y docente, navegación compacta, favicon). Usa el acceso de desarrollo local.
// Uso: node e2e/suites/capturas-logos.mjs <carpeta-relativa-a-la-raíz>
import path from "node:path";
import fs from "node:fs";
import { lanzar, pausa, RAIZ } from "../lib/helpers.mjs";
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/logos");
fs.mkdirSync(salida, { recursive: true });
const APP = process.env.APP_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:4000";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const p = await lanzar({ ancho: 1440, alto: 900 });
const E = (js) => p.eval(`(() => { ${js} })()`);
const login = async (correo) => {
  await p.ir(APP + "/"); await pausa(600);
  await p.eval(`(async()=>{localStorage.clear(); const r=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})}); const d=await r.json(); localStorage.setItem('proysocial:token', d.token); localStorage.setItem('proysocial:user', JSON.stringify(d.user)); return true})()`);
};
// Mide las imágenes visibles: cargadas, sin deformar (proporción mostrada = proporción natural) y dentro de la pantalla
const imgs = (sel) => E(`return [...document.querySelectorAll(${JSON.stringify(sel)})].filter(i=>{const r=i.getBoundingClientRect(); return r.width>0 && r.height>0 && getComputedStyle(i).display!=='none'}).map(i=>{const r=i.getBoundingClientRect(); return {src:i.getAttribute('src'), ok:i.complete && i.naturalWidth>0, nat:+(i.naturalWidth/i.naturalHeight).toFixed(3), vis:+(r.width/r.height).toFixed(3), w:Math.round(r.width), h:Math.round(r.height), dentro:r.left>=0 && r.right<=innerWidth+1}})`);
try {
  const pantallas = [[1440, 900], [1280, 800], [820, 1180], [390, 844]];
  for (const [w, h] of pantallas) {
    await p.tamano(w, h);
    // Login
    await p.ir(APP + "/"); await pausa(1200); await p.eval("localStorage.clear(); true"); await p.ir(APP + "/"); await pausa(2500);
    let m = await imgs("img");
    ok(`login ${w}: un solo logo de ProySocial, cargado y sin deformar`, m.length === 1 && m[0].ok && Math.abs(m[0].nat - m[0].vis) < 0.02 && m[0].dentro, JSON.stringify(m));
    ok(`login ${w}: sin desborde horizontal`, (await E("return document.documentElement.scrollWidth - innerWidth")) <= 1);
    await p.foto(path.join(salida, `login-${w}.png`), { completa: true });
    // Panel de administración
    await login("admin@proysocial.local"); await p.ir(APP + "/admin"); await pausa(3000);
    m = await imgs(".b2-hd img");
    ok(`admin ${w}: un solo logo en la cabecera (${m[0]?.src?.split("/").pop()}), cargado y sin deformar`, m.length === 1 && m[0].ok && Math.abs(m[0].nat - m[0].vis) < 0.03 && m[0].dentro, JSON.stringify(m));
    ok(`admin ${w}: sin desborde horizontal`, (await E("return document.documentElement.scrollWidth - innerWidth")) <= 1);
    await p.foto(path.join(salida, `admin-${w}.png`));
    // Portal docente
    await login("maria.rodriguez@proysocial.local"); await p.ir(APP + "/docente"); await pausa(3000);
    m = await imgs(".b2-hd img");
    ok(`docente ${w}: un solo logo en la cabecera, cargado y sin deformar`, m.length === 1 && m[0].ok && Math.abs(m[0].nat - m[0].vis) < 0.03 && m[0].dentro, JSON.stringify(m));
    await p.foto(path.join(salida, `docente-${w}.png`));
  }
  // Barra lateral expandida (escritorio)
  await p.tamano(1440, 900); await login("admin@proysocial.local"); await p.ir(APP + "/admin"); await pausa(2500);
  const abre = await E("const b=document.querySelector('.b2-side-i[aria-label=\"Expandir menú\"]'); if(b){b.click(); return true} return false"); await pausa(600);
  await p.foto(path.join(salida, `admin-1440-sidebar-expandida.png`));
  ok("barra lateral expandida (la cabecera conserva un único logo)", (await imgs(".b2-hd img")).length === 1, `expandió=${abre}`);
  // Favicon: enlaces, recursos y carga real
  await p.ir(APP + "/"); await pausa(1500);
  const f = await p.eval(`(async()=>{const links=[...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon]')].map(l=>({rel:l.rel, href:l.getAttribute('href')})); const out=[]; for (const l of links){ const r=await fetch(l.href,{cache:'reload'}); const b=await r.blob(); out.push({...l, status:r.status, tipo:r.headers.get('content-type'), bytes:b.size}); } return JSON.stringify(out)})()`);
  const fl = JSON.parse(f);
  ok("favicon: tres enlaces declarados y todos responden 200 con imagen", fl.length === 3 && fl.every((x) => x.status === 200 && /image/.test(x.tipo || "")), JSON.stringify(fl.map((x) => `${x.href}:${x.status}:${x.tipo}`)));
  const cab = await p.eval("[...document.querySelectorAll('link[rel*=icon]')].map(l => l.href).join(' ')");
  ok("sin referencias a iconos provisionales (vite.svg, react.svg) ni rutas de disco", !cab.includes("vite.svg") && !cab.includes("react.svg") && !cab.includes(":\\") && !cab.includes("file:"));
} catch (e) {
  ok("la verificación terminó sin excepciones", false, String(e?.stack || e).slice(0, 400));
} finally {
  await p.cerrar();
  console.log(res.join("\n"));
  const x = res.filter((l) => l.startsWith("FALLA")).length;
  console.log(`\n${res.length - x} OK · ${x} FALLA`);
  process.exit(x ? 1 : 0);
}
