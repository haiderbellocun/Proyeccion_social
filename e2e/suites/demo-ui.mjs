// Modo demostración del piloto por INTERFAZ, contra una base LOCAL aislada llamada proysocial_piloto (clon de proysocial_dev) y un backend propio
// (puerto 4340) que sirve el frontend compilado en el mismo origen, igual que Cloud Run. No usa proysocial_dev ni el acceso de desarrollo.
// Uso: node e2e/suites/demo-ui.mjs [carpeta-de-capturas]      Requisitos: Chrome y la base local proysocial_piloto (ver docs/DEMOSTRACION_PILOTO.md).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, linea, E, EA, RAIZ, BACKEND } from "../lib/helpers.mjs";

iniciarSuite("demo-ui");
const PORT = 4340;
const APP = `http://127.0.0.1:${PORT}`;
const CLAVE = "clave-demo-e2e-7Q";
const salida = path.resolve(RAIZ, process.argv[2] || "e2e/salida/demo");
fs.mkdirSync(salida, { recursive: true });
const dist = path.join(os.tmpdir(), "proysocial-demo-dist");
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

// 1) Frontend compilado para el mismo origen (VITE_API_URL vacío, sin Google configurado: el acceso normal queda en su estado «sin configurar»).
const b = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, shell: true, env: { ...process.env, VITE_API_URL: "", VITE_GOOGLE_CLIENT_ID: "" }, encoding: "utf8" });
if (b.status !== 0) { console.error(b.stdout, b.stderr); process.exit(2); }

// 2) Backend de demostración sobre proysocial_piloto local.
const server = spawn(process.execPath, ["--env-file=.env", "src/index.js"], {
  cwd: BACKEND,
  env: {
    ...process.env, PGDATABASE: "proysocial_piloto", PGHOST: "localhost", DATABASE_URL: "", NODE_ENV: "development",
    JWT_SECRET: "pruebas-demo-ui-secreto-largo-0123456789abcdef", EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(PORT),
    STATIC_DIR: dist, DEMO_ENABLED: "true", DEMO_ACCESS_KEY: CLAVE, DEV_LOGIN_ENABLED: "false", ALLOWED_ORIGIN: "",
  },
  stdio: ["ignore", "ignore", "ignore"],
});
let p;
try {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${APP}/health`)).ok) break; } catch { /* iniciando */ }
    await pausa(150);
  }
  const est = await (await fetch(`${APP}/auth/demo/estado`)).json().catch(() => ({}));
  if (est.entorno?.base !== "proysocial_piloto") { console.error("Backend/base no permitidos"); process.exit(2); }

  p = await lanzar({ ancho: 1440, alto: 900 });
  const n = (sel) => E(p, `return document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const desborde = () => E(p, "return document.documentElement.scrollWidth - innerWidth");
  const rolesUi = {};

  await p.ir(`${APP}/`); await pausa(1000);
  await p.eval("localStorage.clear(); sessionStorage.clear(); true");
  await p.ir(`${APP}/`); await p.esperar("document.querySelector('.lg-demo')", { etiqueta: "bloque demo" });
  ok("el login muestra «Entorno de demostración · Datos sintéticos»", (await p.texto()).includes("Entorno de demostración") && (await p.texto()).includes("Datos sintéticos"));
  ok("identidad B2 conservada (logo ProySocial y panel institucional)", (await n("img.lg-logo")) === 1 && (await n(".lg-brand")) === 1);
  const correos = ["admin@proysocial.local", "andres.torres@proysocial.local", "carlos.mendoza@proysocial.local", "laura.gomez@proysocial.local", "maria.rodriguez@proysocial.local"];
  const tarjetas = await E(p, "return [...document.querySelectorAll('[data-testid=demo-usuario]')].map(b=>b.innerText.replace(/\\s+/g,' ').trim())");
  ok("las cinco tarjetas se ven ANTES de validar la clave, en el mismo orden que el acceso DEV", tarjetas.length === 5 && correos.every((c, i) => tarjetas[i].includes(c)), tarjetas.join(" | "));
  ok("administrador primero y cuatro docentes con etiqueta de rol y avatar", tarjetas[0].includes("Administrador") && tarjetas.filter((t) => t.includes("Docente")).length === 4 && (await n(".lg-demo .lg-user .lg-av")) === 5);
  ok("sin clave no hay sesión ni campo de clave todavía", (await E(p, "return localStorage.getItem('proysocial:token')")) === null && (await n("#lg-demo-clave")) === 0 && !(await p.texto()).includes("Explorar demostración"));
  ok("el login animado sigue presente junto al selector", (await n(".lg-brand .lg-motion")) === 1);
  const sinId = await EA(p, "const d=await (await fetch('/auth/demo/estado')).json(); return JSON.stringify(Object.keys(d.usuarios[0]).sort())");
  ok("/auth/demo/estado solo expone nombre, apellido, correo y rol (sin ids ni fotos)", sinId === JSON.stringify(["apellido", "correo", "nombre", "rol"]), sinId);
  await p.foto(path.join(salida, "login-demo-cerrado-1440.png"), { completa: true });

  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h); await pausa(300);
    ok(`login con las cinco tarjetas sin desborde horizontal a ${w}px`, (await desborde()) <= 2 && (await n("[data-testid=demo-usuario]")) === 5, `${await desborde()}px`);
    await p.foto(path.join(salida, `login-demo-usuarios-${w}.png`), { completa: true });
  }
  await p.tamano(1440, 900);

  // Elegir un usuario SIN clave: pide la clave; clave inválida no entra.
  await p.clic("Admin Sistema");
  await p.esperar("document.querySelector('#lg-demo-clave')", { etiqueta: "campo de clave tras elegir usuario" });
  ok("elegir una tarjeta sin clave solicita la clave del piloto y no abre sesión", (await p.texto()).includes("Clave de acceso al piloto") && (await E(p, "return localStorage.getItem('proysocial:token')")) === null);
  await p.foto(path.join(salida, "login-demo-clave-1440.png"), { completa: true });
  await p.escribir("#lg-demo-clave", "clave-equivocada-123"); await p.clic("Entrar"); await pausa(1200);
  ok("clave inválida: aviso de error, sin sesión y las tarjetas siguen visibles", (await p.texto()).includes("Clave de acceso incorrecta") && (await E(p, "return localStorage.getItem('proysocial:token')")) === null && (await n("[data-testid=demo-usuario]")) === 5);
  await p.foto(path.join(salida, "login-demo-error-1440.png"), { completa: true });
  ok("la clave no queda guardada en el navegador", !(await E(p, "return JSON.stringify([localStorage, sessionStorage])")).includes(CLAVE));
  await p.escribir("#lg-demo-clave", CLAVE); await p.clic("Entrar");
  await p.esperar("location.pathname === '/admin'", { etiqueta: "panel admin tras la clave" }); await pausa(1500);
  ok("con la clave correcta entra directo como el usuario elegido (sin segundo clic)", (await E(p, "return JSON.parse(localStorage.getItem('proysocial:user')).rol")) === "admin");
  ok("la clave tampoco queda guardada tras entrar", !(await E(p, "return JSON.stringify([localStorage, sessionStorage])")).includes(CLAVE));


  // Administrador
  await p.clic("Admin Sistema");
  await p.esperar("location.pathname === '/admin'", { etiqueta: "panel admin" }); await pausa(1500);
  ok("administrador: entra al panel real y ve el aviso «Modo demostración · Solo lectura»", (await n(".b2-demo")) === 1 && (await p.texto()).includes("Solo lectura"));
  await p.foto(path.join(salida, "admin-panel-1440.png"));
  const r1 = JSON.parse(await EA(p, `const t=localStorage.getItem('proysocial:token'); const h={Authorization:'Bearer '+t,'Content-Type':'application/json'};
    const g=await fetch('/admin/dashboard',{headers:h}); const w=await fetch('/admin/proyectos/1',{method:'PUT',headers:h,body:'{}'}); const u=await fetch('/admin/usuarios',{headers:h});
    return JSON.stringify({get:g.status,put:w.status,usuarios:u.status})`));
  ok("servidor: lectura 200, escritura 403 y usuarios 403 para la sesión demo", r1.get === 200 && r1.put === 403 && r1.usuarios === 403, JSON.stringify(r1));
  for (const ruta of ["/admin/revision", "/admin/reportes", "/admin/avance", "/admin/indicadores", "/admin/importar-matriz", "/admin/sistema", "/admin"]) {
    await p.ir(`${APP}${ruta}`); await pausa(1800);
    const sesionViva = (await E(p, "return location.pathname")) === ruta;
    rolesUi[ruta] = sesionViva;
    ok(`admin navega ${ruta} (sin salir de la sesión, con aviso demo)`, sesionViva && (await n(".b2-demo")) === 1);
    if (["/admin/avance", "/admin/reportes"].includes(ruta)) await p.foto(path.join(salida, `admin-${ruta.split("/").pop()}-1440.png`));
  }
  await p.ir(`${APP}/admin`); await pausa(1500);
  ok("recargar el navegador conserva la sesión demo", (await E(p, "return location.pathname")) === "/admin" && (await n(".b2-demo")) === 1);
  const ruta403 = await EA(p, "const r=await fetch('/docente/1/matriz',{headers:{Authorization:'Bearer '+localStorage.getItem('proysocial:token')}}); return r.status");
  ok("el administrador demo no es docente de nadie (API del docente responde por rol, sin 5xx)", ruta403 < 500, String(ruta403));

  // Cambiar de usuario → docente
  await p.clic("Cambiar de usuario");
  await p.esperar("location.pathname === '/'", { etiqueta: "volver al login" });
  ok("«Cambiar de usuario» cierra la sesión y deja elegir otro", (await E(p, "return localStorage.getItem('proysocial:token')")) === null);
  await p.esperar("document.querySelectorAll('.lg-demo .lg-user').length === 5", { etiqueta: "usuarios otra vez" });
  await p.clic("Maria Rodriguez");
  await p.esperar("location.pathname === '/docente'", { etiqueta: "panel docente" }); await pausa(1500);
  ok("docente: entra a su panel con aviso de demostración", (await n(".b2-demo")) === 1);
  await p.foto(path.join(salida, "docente-panel-1440.png"));
  for (const ruta of ["/docente/matriz", "/docente/proyectos", "/docente/reportar", "/docente/evidencias", "/docente/historial", "/docente/perfil", "/docente"]) {
    await p.ir(`${APP}${ruta}`); await pausa(1800);
    ok(`docente navega ${ruta}`, (await E(p, "return location.pathname")) === ruta && (await n(".b2-demo")) === 1);
  }
  await p.ir(`${APP}/admin`); await pausa(1500);
  ok("un docente no accede a /admin", (await E(p, "return location.pathname")) !== "/admin");
  await p.ir(`${APP}/docente/matriz`); await pausa(2000);
  await p.foto(path.join(salida, "docente-matriz-1440.png"));
  for (const [w, h] of [[1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h); await p.ir(`${APP}/docente`); await pausa(1800);
    ok(`panel docente sin desborde horizontal a ${w}px`, (await desborde()) <= 2, `${await desborde()}px`);
    await p.foto(path.join(salida, `docente-panel-${w}.png`));
  }
  await p.tamano(1440, 900);

  const conDatos = [];
  // Los cuatro docentes: portal propio, datos sintéticos visibles y escritura bloqueada por el servidor.
  for (const nombre of ["Maria Rodriguez", "Carlos Mendoza", "Andres Torres", "Laura Gomez"]) {
    await p.clic("Cambiar de usuario"); await p.esperar("location.pathname === '/'", { etiqueta: "login para " + nombre });
    await p.esperar("document.querySelectorAll('[data-testid=demo-usuario]').length === 5", { etiqueta: "usuarios para " + nombre });
    await p.clic(nombre);
    await p.esperar("location.pathname === '/docente'", { etiqueta: "portal de " + nombre }); await pausa(1500);
    const yo = JSON.parse(await E(p, "return localStorage.getItem('proysocial:user')"));
    ok(`${nombre}: abre el portal docente con aviso de demostración`, `${yo.nombre} ${yo.apellido}` === nombre && yo.rol === "docente" && (await n(".b2-demo")) === 1);
    const d = JSON.parse(await EA(p, `const h={Authorization:'Bearer '+localStorage.getItem('proysocial:token'),'Content-Type':'application/json'};
      const m=await fetch('/docente/'+${yo.id}+'/matriz',{headers:h}); const mj=await m.json().catch(()=>null);
      const pr=await fetch('/docente/'+${yo.id}+'/dashboard',{headers:h}); const pj=await pr.json().catch(()=>null);
      const w=await fetch('/docente/'+${yo.id}+'/info-contacto',{method:'PUT',headers:h,body:'{}'});
      return JSON.stringify({m:m.status,mn:JSON.stringify(mj||{}).length,p:pr.status,pn:JSON.stringify(pj||{}).length,w:w.status})`));
    ok(`${nombre}: matriz y panel responden 200; una escritura recibe 403`, d.m === 200 && d.p === 200 && d.w === 403, JSON.stringify(d));
    conDatos.push([nombre, d.mn > 1000]);
    await p.ir(`${APP}/docente/matriz`); await pausa(1500);
    ok(`${nombre}: la pantalla de matriz carga sin error`, !(await p.texto()).toLowerCase().includes("error al cargar"));
  }

  // Volumen de datos: depende de lo sembrado en la base (no del selector). Se informa por docente; se exige que la mayoría tenga matriz poblada.
  ok("matrices con datos sintéticos (al menos 3 de 4 docentes)", conDatos.filter(([, v]) => v).length >= 3, conDatos.map(([n, v]) => `${n}: ${v ? "con datos" : "SIN asignaciones en la base"}`).join(" | "));

  // Cerrar la demostración por completo
  await p.clic("Cambiar de usuario"); await p.esperar("location.pathname === '/'", { etiqueta: "login" });
  await p.esperar("document.querySelector('.lg-demo')", { etiqueta: "bloque demo" });
  await p.clic("Cerrar acceso de demostración"); await pausa(500);
  ok("«Cerrar acceso de demostración» descarta el pase: las tarjetas siguen y volver a elegir pide la clave", (await n("[data-testid=demo-usuario]")) === 5 && (await n("#lg-demo-clave")) === 0 && (await E(p, "return sessionStorage.getItem('proysocial:demo-pase')")) === null);
  await p.clic("Carlos Mendoza"); await p.esperar("document.querySelector('#lg-demo-clave')", { etiqueta: "clave otra vez" });
  ok("tras cerrar el acceso, elegir un usuario vuelve a exigir la clave", (await E(p, "return location.pathname")) === "/");

  // Fallo de base de datos (como el /health 500 «password authentication failed» de Cloud SQL): backend REAL con usuario de base inexistente.
  // El selector NO se oculta en silencio: /auth/demo/estado responde 503, el login lo muestra y «Reintentar» está disponible.
  const PORT_MAL = 4342;
  const malo = spawn(process.execPath, ["--env-file=.env", "src/index.js"], {
    cwd: BACKEND,
    env: { ...process.env, PGDATABASE: "proysocial_piloto", PGHOST: "localhost", PGUSER: "usuario_inexistente_gcp", PGPASSWORD: "incorrecta", DATABASE_URL: "", NODE_ENV: "production", JWT_SECRET: "pruebas-demo-ui-secreto-largo-0123456789abcdef", EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(PORT_MAL), STATIC_DIR: dist, DEMO_ENABLED: "true", DEMO_ACCESS_KEY: CLAVE, DEV_LOGIN_ENABLED: "false", ALLOWED_ORIGIN: "" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    for (let i = 0; i < 80; i += 1) { try { await fetch(`http://127.0.0.1:${PORT_MAL}/`); break; } catch { /* iniciando */ } await pausa(150); }
    const h = await fetch(`http://127.0.0.1:${PORT_MAL}/health`).then((r) => r.status).catch(() => 0);
    const es = await fetch(`http://127.0.0.1:${PORT_MAL}/auth/demo/estado`).then((r) => r.status).catch(() => 0);
    ok("con la base rechazando credenciales: /health → 500 y /auth/demo/estado → 503 (no 404)", h === 500 && es === 503, `health=${h} estado=${es}`);
    await p.eval("localStorage.clear(); sessionStorage.clear(); true");
    await p.ir(`http://127.0.0.1:${PORT_MAL}/`); await p.esperar("document.querySelector('[data-testid=demo-fallo]')", { etiqueta: "aviso de fallo" });
    ok("el login muestra el problema de base de datos y «Reintentar», sin ocultar el selector", (await p.texto()).includes("No se pudo cargar el acceso de demostración") && (await p.texto()).includes("base de datos") && (await p.texto()).includes("Reintentar"));
    await pausa(1500); await p.foto(path.join(salida, "login-demo-fallo-1440.png"));
    await p.clic("Reintentar");
    await p.esperar("document.querySelector('[data-testid=demo-fallo]')", { etiqueta: "aviso tras reintentar con el servidor caído" });
    ok("con la base aún caída, «Reintentar» vuelve a mostrar el problema (no lo oculta)", (await p.texto()).includes("base de datos") && (await n("[data-testid=demo-selector]")) === 1);
  } finally { malo.kill(); }

  await p.ir(`${APP}/`); await p.esperar("document.querySelector('.lg-demo')", { etiqueta: "bloque demo" });

  // Acceso normal sin cambios
  ok("el acceso de Google conserva su bloque propio", (await p.texto()).includes("Acceso institucional"));
  const errores = p.consola.filter((c) => !/favicon|401|403|net::ERR/.test(c));
  ok("sin excepciones de JavaScript", !errores.some((c) => c.startsWith("EXCEPCIÓN")), errores.slice(0, 3).join(" | "));
} finally {
  await p?.cerrar();
  server.kill();
}
console.log(res.join("\n"));
console.log(`\nCapturas en ${salida}`);
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
