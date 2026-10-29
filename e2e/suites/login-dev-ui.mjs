// Acceso de DESARROLLO local (selector DEV de cinco usuarios) contra los procesos REALES: frontend en APP_URL (def. http://localhost:5173) y backend
// con `npm run dev:local` en API_URL (def. http://localhost:4000). A diferencia de demo-ui (servidor propio y compilado), esta suite detecta un
// backend arrancado con el script equivocado (`npm run dev` usa backend/.env, sin DEV_LOGIN_ENABLED, y el selector no aparece).
// Uso: node e2e/suites/login-dev-ui.mjs [carpeta-de-capturas]
import fs from "node:fs";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, linea, E, APP, API, RAIZ } from "../lib/helpers.mjs";

iniciarSuite("login-dev-ui");
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/login-dev");
fs.mkdirSync(salida, { recursive: true });
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

const dev = await fetch(`${API}/auth/dev/usuarios`).then(async (r) => ({ s: r.status, d: await r.json().catch(() => null) })).catch(() => ({ s: 0, d: null }));
if (dev.s !== 200) {
  console.error(`FALLA /auth/dev/usuarios respondió ${dev.s} en ${API}. El backend debe iniciarse con «npm run dev:local» (desde backend/), no con «npm run dev».`);
  process.exit(2);
}
ok("/auth/dev/usuarios responde con base proysocial_dev y cinco usuarios", dev.d?.entorno?.base === "proysocial_dev" && dev.d?.usuarios?.length === 5, `${dev.d?.usuarios?.length} usuarios`);

const cuentas = [
  ["Admin Sistema", "/admin"], ["Maria Rodriguez", "/docente"], ["Carlos Mendoza", "/docente"], ["Andres Torres", "/docente"], ["Laura Gomez", "/docente"],
];
const p = await lanzar({ ancho: 1440, alto: 900 });
const n = (sel) => E(p, `return document.querySelectorAll(${JSON.stringify(sel)}).length`);
const limpio = async () => {
  await p.ir(`${APP}/`); await pausa(400);
  await p.eval("localStorage.clear(); sessionStorage.clear(); true");
  await p.ir(`${APP}/`);
  await p.esperar("document.querySelector('[data-testid=dev-selector]')", { etiqueta: "selector DEV" });
  await pausa(7000);
};
try {
  await limpio();
  const tarjetas = await E(p, "return [...document.querySelectorAll('[data-testid=dev-usuario]')].map(b=>b.innerText.replace(/\\s+/g,' ').trim())");
  ok("el login muestra los cinco usuarios rápidos", tarjetas.length === 5, tarjetas.join(" | "));
  ok("administrador primero y cuatro docentes con rol, avatar y correo", tarjetas[0].includes("Administrador") && tarjetas.filter((t) => t.includes("Docente")).length === 4 && (await n(".lg-dev .lg-av")) === 5);
  ok("el login animado y el acceso con Google conviven con el selector", (await n(".lg-brand .lg-motion")) === 1 && (await p.texto()).includes("Acceso institucional"));
  ok("no se pide clave en localhost", (await n("#lg-demo-clave")) === 0 && (await n(".lg-demo")) === 0);
  await p.foto(path.join(salida, "login-local-1440.png"));
  await p.tamano(390, 844); await limpio();
  ok("390px: cinco usuarios sin desborde horizontal", (await n("[data-testid=dev-usuario]")) === 5 && (await E(p, "return document.documentElement.scrollWidth - innerWidth")) <= 2);
  await p.foto(path.join(salida, "login-local-390.png"), { completa: true });
  await p.tamano(1440, 900);

  for (const [nombre, ruta] of cuentas) {
    await limpio();
    await p.clic(nombre);
    await p.esperar(`location.pathname === ${JSON.stringify(ruta)}`, { etiqueta: `panel de ${nombre}` });
    await pausa(1800);
    const yo = JSON.parse(await E(p, "return localStorage.getItem('proysocial:user')"));
    ok(`${nombre}: un clic abre ${ruta}`, `${yo.nombre} ${yo.apellido}` === nombre && (await p.eval("location.pathname")) === ruta);
    await p.foto(path.join(salida, `panel-${nombre.split(" ")[0].toLowerCase()}-1440.png`));
    ok(`${nombre}: sesión de desarrollo sin banda de solo lectura`, (await n(".b2-demo")) === 0);
  }
} finally {
  await p.cerrar();
}
console.log(res.join("\n"));
console.log(`\nCapturas en ${salida}`);
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
