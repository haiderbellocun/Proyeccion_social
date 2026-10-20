// Seguimiento operativo por INTERFAZ en una base AISLADA (proysocial_test): backend propio (puerto 4332) que sirve el frontend compilado en el
// mismo origen, datos sintéticos TST_SG con PostgreSQL real, sesión de administrador firmada con el JWT_SECRET de la prueba. No usa
// proysocial_dev ni las suites E2E con SQL pospuestas. Compara lo que se ve en pantalla con la API y con PostgreSQL.
// Requisitos: Chrome y proysocial_test migrada (`npm run test:db:setup` en backend/). Uso: node e2e/suites/seguimiento-ui.mjs
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanzar, pausa, iniciarSuite } from "../lib/helpers.mjs";

iniciarSuite("seguimiento-ui");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACK = path.join(RAIZ, "backend");
process.env.PGDATABASE = "proysocial_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.DATABASE_URL = "";
process.env.INSTANCE_CONNECTION_NAME = "";
process.env.JWT_SECRET = "pruebas-seguimiento-ui-secreto-largo-0123456789abcdef";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";
process.chdir(BACK);
const src = (r) => new URL(`../../backend/${r}`, import.meta.url).href;
const { pool } = await import(src("src/db.js"));
const { createSessionToken } = await import(src("src/middleware/auth.js"));
const { SA, M, montar, desmontar } = await import(src("test/integration/helpers/fixture-seguimiento.js"));
if ((await pool.query("select current_database() d")).rows[0].d !== "proysocial_test") { console.error("Base no permitida"); process.exit(2); }
const q = async (s, p = []) => (await pool.query(s, p)).rows;

const PORT = 4332;
const APP = `http://127.0.0.1:${PORT}`;
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
let p, server, dist, ctx;

const tarjetas = (p) => E(p, "return Object.fromEntries([...document.querySelectorAll('.b2-seg-cards dl > div')].map(d => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.replace(/\\s+/g, ' ').trim()]))");
const nombresTabla = (p) => E(p, "return [...document.querySelectorAll('.b2-tabla-r')].map(r => r.querySelector('.b2-tt')?.textContent.replace(/inactivo$/, '').trim())");
const ponerSelect = (etiqueta, valor) => `const s=document.querySelector('select[aria-label="${etiqueta}"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s, ${JSON.stringify(String(valor))}); s.dispatchEvent(new Event('change',{bubbles:true})); return true`;
const esperarCarga = async (p, ms = 12000) => { await pausa(150); await p.esperar("!document.querySelector('.b2-skel-w') && document.querySelector('.b2-seg-cards, .b2-adm-vacio-c, .b2-alert')", { ms }); await pausa(250); };
const apiPagina = (p, ruta) => p.eval(`(async()=>{const r=await fetch(${JSON.stringify(ruta)},{headers:{Authorization:'Bearer '+localStorage.getItem('proysocial:token')}}); return JSON.stringify({s:r.status,d:await r.json()})})()`).then(JSON.parse);

try {
  ctx = await montar(pool);
  const tk = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });
  const admin = ctx.admin;
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "proysocial-seg-dist-"));
  const build = spawnSync(process.execPath, [path.join(RAIZ, "node_modules/vite/bin/vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, env: { ...process.env, VITE_API_URL: "" }, encoding: "utf8" });
  if (build.status !== 0) throw new Error("Falló la compilación del frontend:\n" + build.stdout.slice(-600) + build.stderr.slice(-600));
  server = spawn(process.execPath, ["src/index.js"], { cwd: BACK, env: { ...process.env, PORT: String(PORT), STATIC_DIR: dist, DEV_LOGIN_ENABLED: "false", NODE_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${APP}/health`)).ok) break; } catch { /* iniciando */ } await pausa(150); }
  p = await lanzar({ ancho: 1440, alto: 900 });
  const sesion = async (u) => {
    await p.ir(APP + "/"); await pausa(400);
    await p.eval(`localStorage.clear(); localStorage.setItem('proysocial:token', ${JSON.stringify(tk(u))}); localStorage.setItem('proysocial:user', ${JSON.stringify(JSON.stringify({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol, foto_url: null }))}); true`);
  };
  const ir = async (ruta) => { await p.ir(APP + ruta); await esperarCarga(p); };
  await sesion(admin);

  // ───────── Lo que se ve = lo que dice la API = lo que dice PostgreSQL ─────────
  await ir(`/admin/avance?semestre=${SA}`);
  const api = (await apiPagina(p, `/admin/seguimiento?semestre=${SA}`)).d;
  const c = await tarjetas(p);
  ok("las 10 tarjetas están presentes", Object.keys(c).length === 10, Object.keys(c).join(" | "));
  ok("tarjeta «Docentes del semestre» = API", c["Docentes del semestre"]?.startsWith(String(api.tarjetas.docentes)), c["Docentes del semestre"]);
  ok("tarjeta «Vencidos» = API", c["Vencidos"]?.startsWith(String(api.tarjetas.vencidos)), c["Vencidos"]);
  ok("tarjeta «En revisión» = API", c["En revisión"]?.startsWith(String(api.tarjetas.enviados_pendientes_revision)), c["En revisión"]);
  ok("tarjeta «Observados» = API", c["Observados"]?.startsWith(String(api.tarjetas.observados)), c["Observados"]);
  ok("la semana en curso (4) es el periodo por omisión y sus tarjetas lo indican", Object.keys(c).some((k) => k.includes("Semana 4")) && (await E(p, "return document.body.innerText.includes('Semana 4')")));
  const verdad = (await q(`SELECT COUNT(*) FILTER (WHERE e.estado_revision = 'aprobado')::int apr, COUNT(*) FILTER (WHERE e.estado_revision = 'enviado' AND e.completado)::int env, COUNT(*) FILTER (WHERE e.estado_revision = 'observado')::int obs
    FROM usuarios u JOIN grupos_matriz g ON g.id = u.grupo_matriz_id AND g.semestre = $1 JOIN plantilla_entregables t ON t.grupo_id = g.id LEFT JOIN proyecto_entregables e ON e.plantilla_id = t.id AND e.docente_id = u.id WHERE u.rol = 'docente'`, [SA]))[0];
  ok("PostgreSQL: aprobados / en revisión / observados coinciden con las tarjetas", Number(c["En revisión"].match(/\d+/)[0]) === verdad.env && Number(c["Observados"].match(/\d+/)[0]) === verdad.obs && api.tarjetas.semestre.aprobados === verdad.apr, JSON.stringify(verdad));
  ok("la tabla lista a los 4 docentes con grupo del semestre y no al docente sin grupo ni al del semestre anterior", (await nombresTabla(p)).length === 4, JSON.stringify(await nombresTabla(p)));
  ok("ordenada por vencidos (el más atrasado primero)", (await nombresTabla(p))[0]?.includes("Docente2") || (await nombresTabla(p))[0]?.includes("Docente1"), (await nombresTabla(p))[0]);
  ok("el aviso informa del docente activo sin grupo (no se inventa)", await E(p, "return /sin grupo de matriz/.test(document.body.innerText)"));
  ok("hay tres gráficos con título y su tabla de datos alternativa", (await E(p, "return document.querySelectorAll('.b2-fig h3').length")) >= 3 && (await E(p, "return document.querySelectorAll('.b2-fig-tabla').length")) >= 3 && await E(p, "return !!document.querySelector('.b2-cg')"));
  ok("los vencidos aparecen como condición, no como un estado más", await E(p, "return /de 335 que requieren acción|que requieren acción del docente/.test(document.body.innerText) || /que requieren acción del docente/.test(document.body.innerText)"));

  // ───────── Filtros combinados ─────────
  await E(p, ponerSelect("Grupo", ctx.g.g2)); await esperarCarga(p);
  ok("grupo 2: la tabla muestra solo a su docente y las tarjetas lo recalculan", JSON.stringify(await nombresTabla(p)).includes("Docente3") && (await nombresTabla(p)).length === 1 && (await tarjetas(p))["Docentes del semestre"]?.startsWith("1"));
  ok("el filtro queda en la dirección (se puede compartir y recargar)", (await p.eval("location.search")).includes(`grupo=${ctx.g.g2}`));
  await E(p, ponerSelect("Semana académica", "1")); await esperarCarga(p);
  ok("grupo 2 + semana 1: sin entregables programados (no un porcentaje engañoso)", await E(p, "return document.body.innerText.includes('Sin entregables programados')"));
  await E(p, ponerSelect("Grupo", "")); await esperarCarga(p);
  const t1 = await tarjetas(p);
  ok("semana 1 de todos los grupos: 2 programados, reportado 100 % y aprobado 50 %", Object.entries(t1).some(([k, v]) => k.startsWith("Reportado · Semana 1") && v.startsWith("100%")) && Object.entries(t1).some(([k, v]) => k.startsWith("Aprobado · Semana 1") && v.startsWith("50%")), JSON.stringify(t1).slice(0, 300));
  await E(p, ponerSelect("Semana académica", "semestre")); await esperarCarga(p);
  await p.eval("[...document.querySelectorAll('.b2-chip')].find(b=>b.textContent.trim().startsWith('Observados')).click(); true"); await esperarCarga(p);
  ok("todo el semestre + estado «Observados»: solo el docente con observaciones", JSON.stringify(await nombresTabla(p)).includes("Docente1") && (await nombresTabla(p)).length === 1);
  ok("las tarjetas no se estrechan con el filtro de estado (siguen siendo los 4 docentes del semestre)", (await E(p, "return document.querySelector('.b2-seg-cards dd').firstChild.textContent.trim()")) === "4");
  await p.eval("[...document.querySelectorAll('.b2-chip')].find(b=>b.textContent.trim().startsWith('Todos')).click(); true"); await esperarCarga(p);
  await E(p, ponerSelect("Programa", ctx.prog1)); await esperarCarga(p);
  ok("programa 1: solo sus docentes", (await nombresTabla(p)).length === 2);
  await E(p, ponerSelect("Escuela", ctx.esc)); await esperarCarga(p);
  ok("escuela (programa 1): mismos docentes; el filtro existe porque hay relación real", (await nombresTabla(p)).length === 2);
  await E(p, ponerSelect("Grupo", ctx.g.g2)); await esperarCarga(p);
  ok("combinación sin resultados: estado vacío claro con salida para limpiar filtros", await E(p, "return /Ningún docente coincide con los filtros/.test(document.body.innerText) && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Limpiar filtros')"));
  await p.eval("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Limpiar filtros').click(); true"); await esperarCarga(p);
  ok("«Limpiar filtros» restablece la población completa", (await nombresTabla(p)).length === 4);
  await E(p, ponerSelect("Grupo", ctx.g.g3)); await esperarCarga(p);
  ok("grupo sin entregables: el docente figura con «Sin entregables» y sin porcentajes", JSON.stringify(await nombresTabla(p)).includes("GrupoVacio") && await E(p, "return /Sin entregables/.test(document.querySelector('.b2-tabla-r').textContent)"));
  await E(p, ponerSelect("Grupo", "")); await esperarCarga(p);

  // ───────── Respuestas tardías: un filtro nuevo nunca es pisado por la respuesta del anterior ─────────
  await E(p, `window.__fetch0 = window.fetch; window.fetch = (u, i) => { const url = String(u); const lento = url.includes('/admin/seguimiento?') && url.includes('grupo_id=${ctx.g.g1}'); return lento ? new Promise((r) => setTimeout(r, 2500)).then(() => window.__fetch0(u, i)) : window.__fetch0(u, i); }; return true`);
  await E(p, ponerSelect("Grupo", ctx.g.g1));      // respuesta LENTA (2,5 s)
  await pausa(150);
  await E(p, ponerSelect("Grupo", ctx.g.g2));      // respuesta rápida; llega antes y es la vigente
  await pausa(4000);
  const nombresFinal = await nombresTabla(p);
  ok("cambio rápido de filtros: la respuesta tardía del grupo 1 NO sustituye al grupo 2", nombresFinal.length === 1 && nombresFinal[0].includes("Docente3") && (await tarjetas(p))["Docentes del semestre"]?.startsWith("1"), JSON.stringify(nombresFinal));
  ok("el selector y la dirección siguen en el grupo 2", (await E(p, "return document.querySelector('select[aria-label=\"Grupo\"]').value")) === String(ctx.g.g2) && (await p.eval("location.search")).includes(`grupo=${ctx.g.g2}`));
  await E(p, "window.fetch = window.__fetch0; return true");
  await E(p, ponerSelect("Grupo", "")); await esperarCarga(p);

  // ───────── Detalle del docente y navegación a las pantallas reales ─────────
  await p.eval("[...document.querySelectorAll('.b2-tabla-r')].find(r => r.textContent.includes('Docente1')).click(); true");
  await p.esperar("document.querySelector('.b2-seg-det .b2-insp-h')", { ms: 10000 }); await pausa(1200);
  const insp = await E(p, "return document.querySelector('.b2-seg-det').innerText");
  ok("detalle: nombre, grupo y programa del docente", insp.includes("Docente1") && insp.includes("Grupo 1") && insp.includes("Programa 1"));
  ok("detalle: resumen del semestre con reportado, aprobado, esperado y brecha", /Reportado/.test(insp) && /Aprobado/.test(insp) && /Esperado/.test(insp) && /Brecha/.test(insp));
  ok("detalle: semana en curso con sus cifras", /Semana 4/.test(insp) && /Programados/.test(insp));
  ok("detalle: su proyecto real, como responsable", insp.includes("Proyecto 1") && /responsable/.test(insp));
  ok("detalle: lo no reportado no se atribuye a ningún proyecto", /sin relación demostrable/i.test(insp));
  ok("detalle: pendientes agrupados (vencidos / observados / en revisión / aprobados)", /Vencidos/.test(insp) && /Observados/.test(insp) && /Enviados a revisión/.test(insp) && /Aprobados/.test(insp));
  ok("detalle: la observación del revisor es visible", insp.includes("Falta el anexo firmado"));
  const enlaces = await E(p, "return [...document.querySelectorAll('.b2-seg-det a.b2-link')].map(a => ({ h: a.href, t: a.target, r: a.rel }))");
  ok("detalle: enlaces de evidencia reales, en pestaña nueva y con rel seguro", enlaces.length >= 1 && enlaces.every((a) => a.h.startsWith("https://drive.google.com/") && a.t === "_blank" && /noopener/.test(a.r)));
  // a la revisión del entregable observado
  await p.eval("document.querySelectorAll('.b2-seg-det .b2-seg-grp').forEach(d => d.open = true); [...document.querySelectorAll('.b2-seg-det .b2-seg-ents li')].find(li => li.textContent.includes('Falta el anexo firmado')).querySelector('button').click(); true");
  await pausa(3500);
  ok("«Ver en revisión» abre la bandeja con ese entregable", (await p.eval("location.pathname + location.search")).startsWith("/admin/revision?reporte=") && await E(p, "return document.querySelector('.b2-insp')?.dataset.open === 'true'"), await p.eval("location.pathname + location.search"));
  await ir(`/admin/avance?semestre=${SA}&detalle=${ctx.u.d1.id}`);
  await p.esperar("document.querySelector('.b2-seg-det .b2-insp-acc')", { ms: 10000 });
  await p.eval("[...document.querySelectorAll('.b2-seg-det .b2-insp-acc button')].find(b => b.textContent.includes('Abrir su matriz')).click(); true"); await pausa(3500);
  ok("«Abrir su matriz» lleva a la matriz real del docente", (await p.eval("location.pathname")) === `/admin/docentes/${ctx.u.d1.id}/matriz` && await E(p, "return !!document.querySelector('.b2-hd') && !/Algo salió mal/i.test(document.body.innerText)"));
  await ir(`/admin/avance?semestre=${SA}&detalle=${ctx.u.d1.id}`);
  await p.esperar("document.querySelector('.b2-seg-det .b2-insp-acc')", { ms: 10000 });
  await p.eval("[...document.querySelectorAll('.b2-seg-det .b2-insp-acc button')].find(b => b.textContent.includes('Ir a la bandeja')).click(); true"); await pausa(3000);
  ok("«Ir a la bandeja de revisión» abre la revisión real", (await p.eval("location.pathname")) === "/admin/revision" && await E(p, "return !!document.querySelector('.b2-tabla')"));
  await ir(`/admin/avance?semestre=${SA}&detalle=${ctx.u.d1.id}`);
  await p.esperar("document.querySelector('.b2-seg-det .b2-insp-acc')", { ms: 10000 });
  await p.eval("[...document.querySelectorAll('.b2-seg-det .b2-insp-acc button')].find(b => b.textContent.includes('Indicadores del grupo')).click(); true"); await pausa(3000);
  ok("«Indicadores del grupo» abre Indicadores", (await p.eval("location.pathname")) === "/admin/indicadores");
  await ir(`/admin/avance?semestre=${SA}&detalle=${ctx.u.d1.id}`);
  await p.esperar("document.querySelector('.b2-seg-det .b2-insp-acc')", { ms: 10000 });
  await p.eval("[...document.querySelectorAll('.b2-seg-det .b2-insp-acc button')].find(b => b.textContent.includes('Ver iniciativas')).click(); true"); await pausa(3000);
  ok("«Ver iniciativas» abre Administración → Iniciativas", (await p.eval("location.pathname + location.search")).startsWith("/admin/sistema?tab=proyectos"));
  // docente sin matriz: el detalle lo explica
  await ir(`/admin/avance?semestre=${SA}&grupo=${ctx.g.g3}&detalle=${ctx.u.d5.id}`);
  await p.esperar("document.querySelector('.b2-seg-det .b2-aviso-sem')", { ms: 10000 });
  ok("docente de un grupo sin entregables: el detalle explica por qué no hay avance", await E(p, "return /no tiene entregables/.test(document.querySelector('.b2-seg-det .b2-aviso-sem').textContent)"));

  // ───────── Coherencia con Dashboard y Avance ─────────
  await p.ir(`${APP}/admin`); await pausa(4000);
  const dash = await E(p, "const t=document.body.innerText; const m=t.match(/Pendientes de revisi[oó]n\\s*(\\d+)/); return m ? Number(m[1]) : null");
  ok("Dashboard: «Pendientes de revisión» = tarjeta «En revisión» de Seguimiento", dash === api.tarjetas.enviados_pendientes_revision, `dashboard=${dash} seguimiento=${api.tarjetas.enviados_pendientes_revision}`);

  // ───────── Errores ─────────
  await ir(`/admin/avance?semestre=${SA}`);
  await E(p, "window.__fetch1 = window.fetch; window.fetch = (u, i) => String(u).includes('/admin/seguimiento?') ? Promise.resolve(new Response(JSON.stringify({ error: 'Falla simulada' }), { status: 500, headers: { 'Content-Type': 'application/json' } })) : window.__fetch1(u, i); return true");
  await p.eval("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Actualizar')).click(); true"); await pausa(2000);
  ok("error del servidor: mensaje claro con «Reintentar» (sin JSON ni carga infinita)", await E(p, "return !!document.querySelector('.b2-alert') && /Reintentar/.test(document.querySelector('.b2-alert').textContent) && !/\\{\"error\"/.test(document.body.innerText) && !document.querySelector('.b2-skel-w')"));
  await E(p, "window.fetch = window.__fetch1; return true");
  await p.eval("[...document.querySelectorAll('.b2-alert button')].find(b=>/Reintentar/.test(b.textContent)).click(); true"); await esperarCarga(p);
  ok("«Reintentar» recupera la información", (await nombresTabla(p)).length === 4);

  // ───────── Responsive ─────────
  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
    await p.tamano(w, h); await ir(`/admin/avance?semestre=${SA}`);
    const m = await E(p, "return { sc: document.documentElement.scrollWidth - innerWidth, tabla: !!document.querySelector('[role=table]'), movil: !!document.querySelector('.b2-ml-list'), tarjetas: document.querySelectorAll('.b2-seg-cards dl > div').length, tablaDesborda: (() => { const t = document.querySelector('[role=table]'); return t ? t.scrollWidth - t.clientWidth : 0; })() }");
    ok(`${w} px: sin desborde horizontal y ${m.movil ? "filas en tarjetas" : "tabla"}`, m.sc <= 1 && m.tablaDesborda <= 1 && m.tarjetas === 10 && (w <= 720 ? m.movil && !m.tabla : m.tabla), JSON.stringify(m));
    if (w <= 820) {
      await p.eval("(document.querySelector('.b2-ml-i') || document.querySelector('.b2-tabla-r')).click(); true");
      await p.esperar("document.querySelector('.b2-seg-det .b2-insp-h')", { ms: 10000 }); await pausa(800);
      ok(`${w} px: el detalle se abre y cabe en la pantalla`, await E(p, "const r=document.querySelector('.b2-seg-det').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth - innerWidth <= 1"));
      await p.eval("document.querySelector('.b2-seg-det .b2-insp-acc .b2-btn-ghost').click(); true"); await pausa(400);
    }
  }
  ok("sin excepciones de JavaScript durante toda la prueba", !p.consola.some((l) => l.startsWith("EXCEPCIÓN")), p.consola.filter((l) => l.startsWith("EXCEPCIÓN")).join(" | ").slice(0, 300));
} catch (e) {
  ok("la suite terminó sin excepciones", false, String(e?.stack || e).slice(0, 700));
  try { console.log("--- pantalla:", (await p.texto()).slice(0, 400), "| URL:", await p.eval("location.href")); } catch { /* sin página */ }
} finally {
  try { await p?.cerrar(); } catch { /* ya cerrado */ }
  try { server?.kill(); } catch { /* ya detenido */ }
  try {
    await desmontar(pool, ctx);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas`, [`${M}.%`]))[0];
    ok("BD tras limpiar: sin fixtures ni historial residual", r.u === 0 && r.filas === 0, JSON.stringify(r));
  } catch (e) { ok("limpieza", false, String(e).slice(0, 300)); }
  if (dist) try { fs.rmSync(dist, { recursive: true, force: true }); } catch { /* temporal */ }
  await pool.end().catch(() => {});
  console.log(res.join("\n"));
  const f = res.filter((l) => l.startsWith("FALLA")).length;
  console.log(`\n${res.length - f} OK · ${f} FALLA`);
  process.exit(f ? 1 : 0);
}
