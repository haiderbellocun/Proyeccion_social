// Responsive y capturas del portal docente (María). Solo lectura. Las capturas van a E2E_OUT (por defecto e2e/salida/).
import fs from "node:fs";
import { lanzar, pausa, iniciarSuite, OUT } from "../lib/helpers.mjs";
iniciarSuite("responsive-docente");
fs.mkdirSync(OUT, { recursive: true });
const APP = "http://localhost:5173", API = "http://localhost:4000";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(700);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
const ir = async (p, ruta, espera = 2800) => { await p.ir(APP + ruta); await pausa(espera); };
const PAGS = [
  ["panel", "/docente", null],
  ["iniciativas", "/docente/proyectos", "document.querySelector('.b2-tabla-r, .b2-ml-i').click()"],
  ["detalle", null, null],
  ["reportar", "/docente/reportar", null],
  ["historial", "/docente/historial", "document.querySelector('.b2-tabla-r, .b2-ml-i').click()"],
  ["perfil", "/docente/perfil", null],
  ["matriz", "/docente/matriz", null],
  ["evidencias", "/docente/evidencias", "document.querySelector('.b2-ev-fila, .b2-ml-i').click()"],
];
for (const ancho of [1440, 1280, 820, 390]) {
  const p = await lanzar({ ancho, alto: ancho < 600 ? 844 : 900 });
  try {
    const uid = await login(p, "maria.rodriguez@proysocial.local");
    const ini = await EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}/docente/${uid}/dashboard',{headers:{Authorization:'Bearer '+t}}); const d=await r.json(); return d.proyectos[0].id`);
    for (const [nombre, ruta0, accion] of PAGS) {
      const ruta = ruta0 ?? `/docente/proyectos/${ini}`;
      await ir(p, ruta);
      const w = `${ancho}`;
      ok(`${w} ${nombre}: sin desborde horizontal`, await sinDesborde(p));
      if (ancho <= 900) ok(`${w} ${nombre}: navegación inferior B2 y menú superior oculto`, await E(p, "return getComputedStyle(document.querySelector('.b2-bnav')).display==='flex' && getComputedStyle(document.querySelector('.b2-hd-nav')).display==='none'"));
      if (ancho === 1440 || ancho === 390) await p.foto(`${OUT}/${nombre}-${w}.png`);
      if (accion) {
        await E(p, accion); await pausa(600);
        ok(`${w} ${nombre}: detalle ${ancho <= 720 ? "como hoja inferior" : ancho < 1180 ? "como cajón" : "acoplado"}`, await E(p, ancho <= 720 ? "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && Math.abs(r.bottom-innerHeight)<2" : "return document.querySelector('.b2-insp').dataset.open==='true'"));
        if (ancho === 1440 || ancho === 390) await p.foto(`${OUT}/${nombre}-detalle-${w}.png`);
      }
      if (ancho === 390) {
        ok(`390 ${nombre}: botones y campos cómodos (≥ 36 px)`, await E(p, "const els=[...document.querySelectorAll('main .b2-btn, main .b2-input, main .b2-sel, main .b2-chip')].filter(e=>e.offsetParent!==null && !e.closest('.b2-gantt')); return els.every(e=>e.getBoundingClientRect().height>=34)"));
        ok(`390 ${nombre}: etiquetas inferiores completas`, await E(p, "return [...document.querySelectorAll('.b2-bnav a span')].every(s=>s.scrollWidth<=s.clientWidth+1)"));
      }
    }
    const errs = p.consola.filter((x) => !/favicon|Download the React DevTools/.test(x));
    ok(`${ancho} consola sin errores`, errs.length === 0, errs[0]?.slice(0, 140));
  } catch (e) { ok(`EXCEPCIÓN ${ancho}`, false, String(e.message).slice(0, 200)); }
  finally { await p.cerrar(); }
}
console.log(res.join("\n"));
