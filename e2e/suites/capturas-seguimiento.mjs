// Capturas de Seguimiento (/admin/avance) a 1440/1280/820/390 px con el acceso de desarrollo local. No escribe en la base.
// Uso: node e2e/suites/capturas-seguimiento.mjs <carpeta-relativa-a-la-raíz> [ruta-adicional]
import path from "node:path";
import fs from "node:fs";
import { lanzar, pausa, RAIZ } from "../lib/helpers.mjs";
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/seguimiento");
fs.mkdirSync(salida, { recursive: true });
const APP = process.env.APP_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:4000";
const ruta = process.argv[3] || "/admin/avance";
const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  await p.ir(APP + "/"); await pausa(600);
  await p.eval(`(async()=>{localStorage.clear(); const r=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:'admin@proysocial.local'})}); const d=await r.json(); localStorage.setItem('proysocial:token', d.token); localStorage.setItem('proysocial:user', JSON.stringify(d.user)); return true})()`);
  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h);
    await p.ir(APP + ruta); await pausa(Number(process.env.ESPERA_MS || 4500));
    const desborde = await p.eval("document.documentElement.scrollWidth - innerWidth");
    // El contenido se desplaza dentro de la vista (no en la ventana): para ver TODA la página se amplía la altura de la ventana.
    const alto = await p.eval("(document.querySelector('[data-scroll]')?.scrollHeight ?? 900) + 140");
    await p.tamano(w, Math.min(Math.max(h, alto), 6000)); await pausa(900);
    await p.foto(path.join(salida, `seguimiento-${w}.png`));
    console.log(`${w}px: desborde horizontal = ${desborde}px`);
  }
  console.log("excepciones:", p.consola.filter((l) => /EXCEPCI/.test(l)).join(" | ") || "ninguna");
} finally { await p.cerrar(); }
