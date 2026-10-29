// Acceso PÚBLICO de demostración (DEMO_PUBLIC_READONLY) por INTERFAZ: compilación de producción servida por su propio backend (puerto 4344) sobre la base
// local aislada proysocial_piloto, sin clave y con NODE_ENV=production como en Cloud Run. Los cinco perfiles entran con un clic y solo leen.
// Uso: node e2e/suites/demo-publico-ui.mjs [carpeta-de-capturas]   (ver docs/DEMOSTRACION_PILOTO.md)
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, linea, E, EA, RAIZ, BACKEND } from "../lib/helpers.mjs";

iniciarSuite("demo-publico-ui");
const PORT = 4344, PORT_MAL = 4345;
const APP = `http://127.0.0.1:${PORT}`;
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/demo-publico");
fs.mkdirSync(salida, { recursive: true });
const dist = path.join(os.tmpdir(), "proysocial-demo-publico-dist");
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

const b = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, shell: true, env: { ...process.env, VITE_API_URL: "", VITE_GOOGLE_CLIENT_ID: "" }, encoding: "utf8" });
if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(2); }

const entorno = (port, extra = {}) => ({
  ...process.env, PGDATABASE: "proysocial_piloto", PGHOST: "localhost", DATABASE_URL: "", NODE_ENV: "production", JWT_SECRET: "pruebas-demo-publico-ui-secreto-largo-0123456789abcdef",
  EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(port), STATIC_DIR: dist, DEMO_ENABLED: "true", DEMO_PUBLIC_READONLY: "true", DEMO_ACCESS_KEY: "", DEMO_OPEN: "", DEV_LOGIN_ENABLED: "false", ALLOWED_ORIGIN: "", ...extra,
});
const arrancar = (port, extra) => spawn(process.execPath, ["--env-file=.env", "src/index.js"], { cwd: BACKEND, env: entorno(port, extra), stdio: ["ignore", "ignore", "ignore"] });
const server = arrancar(PORT);
let malo, p;
try {
  for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${APP}/health`)).ok) break; } catch { /* iniciando */ } await pausa(150); }
  const est = await (await fetch(`${APP}/auth/demo/estado`)).json().catch(() => ({}));
  if (est.entorno?.base !== "proysocial_piloto" || est.publico !== true || est.abierto !== false) { console.error("Backend/base/modo no permitidos", JSON.stringify(est)); process.exit(2); }

  p = await lanzar({ ancho: 1440, alto: 900 });
  const n = (sel) => E(p, `return document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const desborde = () => E(p, "return document.documentElement.scrollWidth - innerWidth");
  const limpio = async () => { await p.ir(`${APP}/`); await pausa(300); await p.eval("localStorage.clear(); sessionStorage.clear(); true"); await p.ir(`${APP}/`); await p.esperar("document.querySelectorAll('[data-testid=demo-usuario]').length === 5", { etiqueta: "cinco tarjetas" }); await pausa(2500); };
  const tok = () => E(p, "return localStorage.getItem('proysocial:token')");

  await limpio();
  const correos = ["admin@proysocial.local", "andres.torres@proysocial.local", "carlos.mendoza@proysocial.local", "laura.gomez@proysocial.local", "maria.rodriguez@proysocial.local"];
  const tarjetas = await E(p, "return [...document.querySelectorAll('[data-testid=demo-usuario]')].map(b=>b.innerText.replace(/\\s+/g,' ').trim())");
  ok("los cinco usuarios aparecen sin introducir ninguna clave, en el orden del acceso DEV", correos.every((c, i) => tarjetas[i]?.includes(c)) && tarjetas[0].includes("Administrador") && tarjetas.filter((t) => t.includes("Docente")).length === 4, tarjetas.join(" | "));
  ok("no existe ningún campo ni formulario de clave", (await n("#lg-demo-clave")) === 0 && (await n("input[type=password]")) === 0 && !(await p.texto()).includes("Clave de acceso"));
  ok("avatares con iniciales y etiqueta de rol en cada tarjeta", (await n(".lg-demo .lg-user .lg-av")) === 5 && (await n(".lg-demo .lg-rol")) === 5);
  ok("login animado presente y bloque de Google independiente", (await n(".lg-brand .lg-motion")) === 1 && (await p.texto()).includes("Acceso institucional"));
  ok("el acceso DEV no existe en este servidor (404)", (await EA(p, "return (await fetch('/auth/dev/usuarios')).status")) === 404 && (await EA(p, "return (await fetch('/auth/dev/login',{method:'POST'})).status")) === 404);
  await p.foto(path.join(salida, "login-publico-1440.png"));
  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h); await pausa(400);
    ok(`login a ${w}px: cinco tarjetas sin desborde horizontal`, (await n("[data-testid=demo-usuario]")) === 5 && (await desborde()) <= 2, `${await desborde()}px`);
    await p.foto(path.join(salida, `login-publico-${w}.png`), { completa: true });
  }
  await p.tamano(1440, 900);

  const perfiles = [["Admin Sistema", "/admin", "admin"], ["Andres Torres", "/docente", "docente"], ["Carlos Mendoza", "/docente", "docente"], ["Laura Gomez", "/docente", "docente"], ["Maria Rodriguez", "/docente", "docente"]];
  let primero = true;
  for (const [nombre, ruta, rol] of perfiles) {
    if (primero) { primero = false; } else { await p.clic("Cambiar de usuario"); await p.esperar("location.pathname === '/'", { etiqueta: "login para " + nombre }); await p.esperar("document.querySelectorAll('[data-testid=demo-usuario]').length === 5", { etiqueta: "tarjetas" }); }
    await p.clic(nombre);
    await p.esperar(`location.pathname === ${JSON.stringify(ruta)}`, { etiqueta: `panel de ${nombre}` }); await pausa(1500);
    const yo = JSON.parse(await E(p, "return localStorage.getItem('proysocial:user')"));
    ok(`${nombre}: un clic abre ${ruta} y la sesión corresponde a ese usuario`, `${yo.nombre} ${yo.apellido}` === nombre && yo.rol === rol);
    const banda = await E(p, "return document.querySelector('.b2-demo')?.innerText || ''");
    ok(`${nombre}: banda «Modo demostración · Solo lectura» visible`, /Modo demostración/.test(banda) && /Solo lectura/.test(banda), banda.replace(/\s+/g, " "));
    const d = JSON.parse(await EA(p, `const t=localStorage.getItem('proysocial:token'); const h={Authorization:'Bearer '+t,'Content-Type':'application/json'}; const id=${yo.id};
      const lee=await fetch(${JSON.stringify(rol === "admin" ? "/admin/dashboard" : "")}||('/docente/'+id+'/dashboard'),{headers:h});
      const w=[];
      for (const [m,u] of [['POST','/admin/usuarios'],['PUT','/admin/proyectos/1'],['DELETE','/admin/proyectos/1'],['PATCH','/admin/usuarios/2'],['PUT','/docente/'+id+'/info-contacto'],['POST','/docente/'+id+'/matriz/1/completar']]) w.push((await fetch(u,{method:m,headers:h,body:'{}'})).status);
      const sens=[]; for (const u of ['/admin/usuarios','/admin/correos/estado']) sens.push((await fetch(u,{headers:h})).status);
      return JSON.stringify({lee:lee.status,w,sens})`));
    ok(`${nombre}: lectura 200, todas las escrituras 403 y secciones sensibles bloqueadas`, d.lee === 200 && d.w.every((s) => s === 403) && d.sens.every((s) => s === 403), JSON.stringify(d));
    await p.foto(path.join(salida, `panel-${nombre.split(" ")[0].toLowerCase()}-1440.png`));
    await p.ir(`${APP}${ruta}`); await pausa(1500);
    ok(`${nombre}: recargar la página mantiene la sesión`, (await E(p, "return location.pathname")) === ruta && (await n(".b2-demo")) === 1);
  }
  for (const [w, h] of [[1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h); await p.ir(`${APP}/docente`); await pausa(1800);
    ok(`panel con banda demo sin desborde a ${w}px`, (await desborde()) <= 2, `${await desborde()}px`);
  }
  await p.tamano(1440, 900);
  await p.eval("localStorage.clear(); sessionStorage.clear(); true"); await p.ir(`${APP}/`); await pausa(800);
  const manip = await EA(p, "const r=await fetch('/auth/demo/sesion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:'otro@proysocial.local'})}); return r.status");
  ok("no se puede pedir una sesión para un correo distinto de los cinco", manip === 403, String(manip));

  // Base de datos caída: error claro, sin acceso.
  malo = arrancar(PORT_MAL, { PGUSER: "usuario_inexistente_gcp", PGPASSWORD: "incorrecta" });
  for (let i = 0; i < 80; i += 1) { try { await fetch(`http://127.0.0.1:${PORT_MAL}/`); break; } catch { /* iniciando */ } await pausa(150); }
  await p.ir(`http://127.0.0.1:${PORT_MAL}/`); await p.esperar("document.querySelector('[data-testid=demo-fallo]')", { etiqueta: "aviso de base caída" }); await pausa(1500);
  ok("con la base caída: mensaje claro con «Reintentar», sin tarjetas ni sesión", (await p.texto()).includes("base de datos") && (await p.texto()).includes("Reintentar") && (await n("[data-testid=demo-usuario]")) === 0 && (await tok()) === null);
  await p.foto(path.join(salida, "login-publico-base-caida-1440.png"));
  const errores = p.consola.filter((c) => !/favicon|401|403|503|500|net::ERR|Failed to load resource/.test(c));
  ok("sin excepciones de JavaScript", !errores.some((c) => c.startsWith("EXCEPCIÓN")), errores.slice(0, 3).join(" | "));
} finally {
  await p?.cerrar();
  server.kill(); malo?.kill();
}
console.log(res.join("\n"));
console.log(`\nCapturas en ${salida}`);
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
