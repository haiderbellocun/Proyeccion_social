// Capturas de la pantalla de inicio de sesión (sin sesión) a 1440/1280/820/390 px. No escribe en la base.
// Uso: node e2e/suites/capturas-login.mjs <carpeta-relativa-a-la-raíz>   (p. ej. docs/b2-integracion/login-redisenio/antes)
import path from "node:path";
import fs from "node:fs";
import { lanzar, pausa, RAIZ } from "../lib/helpers.mjs";
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/login");
fs.mkdirSync(salida, { recursive: true });
const APP = process.env.APP_URL || "http://localhost:5173";
const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  await p.ir(APP + "/"); await pausa(800);
  await p.eval("localStorage.clear(); true");
  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h);
    await p.ir(APP + "/"); await pausa(Number(process.env.ESPERA_MS || 2200));
    const desborde = await p.eval("document.documentElement.scrollWidth - innerWidth");
    await p.foto(path.join(salida, `login-${w}.png`), { completa: true });
    console.log(`${w}px: desborde horizontal = ${desborde}px`);
  }
} finally { await p.cerrar(); }
