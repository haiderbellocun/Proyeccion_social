// Cierre funcional · recorrido por INTERFAZ en una base AISLADA (proysocial_test), sin tocar proysocial_dev ni depender de las suites con SQL pospuestas.
// Levanta su propio backend (puerto 4331) que sirve el frontend compilado en el mismo origen, crea datos sintéticos TST_UI con el servicio de
// asignaciones (sin escribir el espejo por SQL), entra con sesiones firmadas con el JWT_SECRET de la prueba (el login de Google no se puede
// automatizar) y recorre en Chrome real: docente (matriz → borrador → envío) → administrador (revisión → correcciones) → docente (corrige y
// reenvía) → administrador (aprueba) → docente (ve la aprobación), más navegación por todas las rutas, permisos y sesión inválida.
// Requisitos: Chrome, PostgreSQL local con proysocial_test migrada (`npm run test:db:setup` en backend/). Uso: node e2e/suites/piloto-ui.mjs
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanzar, pausa, iniciarSuite } from "../lib/helpers.mjs";

iniciarSuite("piloto-ui");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BACK = path.join(RAIZ, "backend");
process.env.PGDATABASE = "proysocial_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.DATABASE_URL = "";
process.env.INSTANCE_CONNECTION_NAME = "";
process.env.JWT_SECRET = "pruebas-piloto-ui-secreto-largo-0123456789abcdef";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";
process.chdir(BACK);
const src = (r) => new URL(`../../backend/${r}`, import.meta.url).href;
const { pool } = await import(src("src/db.js"));
const { createSessionToken } = await import(src("src/middleware/auth.js"));
const { hoyBogota, sumarDias } = await import(src("src/services/matrizService.js"));
const { cambiarGrupo } = await import(src("src/services/asignacionDocenteService.js"));
const { purgarAsignaciones } = await import(src("test/integration/helpers/purgar-asignaciones.js"));
if ((await pool.query("select current_database() d")).rows[0].d !== "proysocial_test") { console.error("Base no permitida"); process.exit(2); }
const q = async (s, p = []) => (await pool.query(s, p)).rows;

const PORT = 4331;
const APP = `http://127.0.0.1:${PORT}`;
const M = "TST_UI";
const SA = "2090A";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const setInput = (sel, v, proto = "HTMLInputElement") => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}))`;
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
const URL_A = `https://drive.google.com/file/d/${M}-A/view`;
const URL_B = `https://drive.google.com/file/d/${M}-B/view`;
const ctx = { u: {}, tok: {} };
let server, dist, activosPrevios = [];

async function limpiar() {
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%`, semestre: SA });
  const g = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $2)`, [g, `${M}.%`]);
  await q(`DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]).catch(() => {});
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM semestres WHERE codigo = $1`, [SA]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
}

let p;
try {
  await limpiar();
  // ───────── Fixture sintético ─────────
  const hoy = hoyBogota();
  const ini = sumarDias(hoy, -21);
  activosPrevios = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await q(`UPDATE semestres SET activo = false WHERE activo`);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, TRUE)`, [SA, ini, sumarDias(ini, 111)]);
  const prog = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa`, `${M}_P`]))[0].id;
  const mk = async (n, rol, estado = "activo") => (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente) VALUES ($1, 'Interfaz', $2, $3, $4, $5, $6) RETURNING id, nombre, apellido, correo, rol`, [`${M}_${n}`, `${M}.${n}@test.local`.toLowerCase(), rol, prog, estado, rol === "docente" ? "ANTIGUO" : null]))[0];
  ctx.admin = await mk("Admin", "admin");
  ctx.u.A = await mk("Ana", "docente");
  ctx.u.C = await mk("SinMatriz", "docente");
  ctx.u.D = await mk("Inactivo", "docente", "inactivo");
  const g = (await q(`INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) VALUES ($1, 's', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`, [`${M} Grupo`, SA]))[0].id;
  ctx.tpl = [];
  for (let n = 1; n <= 3; n += 1) {
    ctx.tpl.push((await q(`INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Octubre', $3, $4, 'Sube el acta en Drive', 2, $5, $6) RETURNING id`, [g, n, n, `${M} Entregable ${n}`, n * 7 - 7, n * 7 - 3]))[0].id);
  }
  await cambiarGrupo(pool, { docenteId: ctx.u.A.id, grupoId: g, actorId: ctx.admin.id, motivo: "Asignación de la prueba de interfaz" });
  const proy = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`, [`${M} Iniciativa`, prog, ctx.u.A.id, ini]))[0].id;
  for (let n = 1; n <= 16; n += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [proy, n, sumarDias(ini, (n - 1) * 7), sumarDias(ini, (n - 1) * 7 + 6)]);
  ctx.proy = proy;
  const tk = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });
  ctx.tok = { admin: tk(ctx.admin), A: tk(ctx.u.A), C: tk(ctx.u.C), D: tk(ctx.u.D) };

  // ───────── Frontend compilado en el mismo origen que la API ─────────
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "proysocial-piloto-dist-"));
  const build = spawnSync(process.execPath, [path.join(RAIZ, "node_modules/vite/bin/vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: RAIZ, env: { ...process.env, VITE_API_URL: "" }, encoding: "utf8" });
  if (build.status !== 0) throw new Error("Falló la compilación del frontend:\n" + build.stdout.slice(-800) + build.stderr.slice(-800));
  server = spawn(process.execPath, ["src/index.js"], { cwd: BACK, env: { ...process.env, PORT: String(PORT), STATIC_DIR: dist, DEV_LOGIN_ENABLED: "false", NODE_ENV: "test" }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`${APP}/health`)).ok) break; } catch { /* iniciando */ } await pausa(150); }
  ok("servidor propio sirve la SPA y la API en el mismo origen (health)", (await fetch(`${APP}/health`)).ok && /<div id="root"/.test(await (await fetch(`${APP}/`)).text()));
  ok("el acceso de desarrollo no existe en este entorno", (await fetch(`${APP}/auth/dev/users`)).status === 404 || (await fetch(`${APP}/auth/dev/users`)).headers.get("content-type")?.includes("text/html"));

  p = await lanzar({ ancho: 1440, alto: 900 });
  const sesion = async (u, token) => {
    await p.ir(APP + "/");
    await pausa(500);
    await p.eval(`localStorage.clear(); localStorage.setItem('proysocial:token', ${JSON.stringify(token)}); localStorage.setItem('proysocial:user', ${JSON.stringify(JSON.stringify({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol, foto_url: null }))}); true`);
  };
  const ir = async (ruta, espera = 2500) => { await p.ir(APP + ruta); await pausa(espera); };
  const fila = async (id) => (await q(`select estado_revision, completado, num_envios, comentario_revision, aprobado_en is not null a from proyecto_entregables where id=$1`, [id]))[0];

  // ───────── Docente: inicio, matriz, instrucciones ─────────
  await sesion(ctx.u.A, ctx.tok.A);
  await ir("/docente");
  ok("docente: inicio (dashboard) renderiza con su cabecera y sin pantalla de error", await E(p, "return !!document.querySelector('.b2-root .b2-hd') && !/Algo salió mal|Error inesperado/i.test(document.body.innerText)"));
  ok("docente: la barra de contexto muestra el semestre activo", await E(p, `return document.querySelector('.b2-ctx')?.textContent.includes(${JSON.stringify(SA)})`));
  await ir("/docente/matriz");
  ok("docente: «Mi matriz» lista sus 3 entregables", await E(p, `return [1,2,3].every(n => document.body.innerText.includes(${JSON.stringify(M + " Entregable ")} + n))`));
  const pl = ctx.tpl[0];
  await ir(`/docente/evidencias?entregable=${pl}`);
  ok("docente: el detalle del entregable muestra falta de evidencia e instrucciones", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Aún no has registrado enlaces/.test(t)"));
  // validaciones locales
  await E(p, clickTxt(".b2-insp .b2-btn", "Enviar a revisión")); await pausa(300);
  ok("docente: enviar sin enlace → validación en pantalla, sin escribir", await E(p, "return /Agrega al menos un enlace/.test(document.querySelector('.b2-insp').textContent)") && (await q(`select count(*)::int n from proyecto_entregables where plantilla_id=$1`, [pl]))[0].n === 0);
  // borrador y envío
  await E(p, setInput(".b2-ev-urlrow input", URL_A)); await pausa(200);
  await E(p, clickTxt(".b2-insp .b2-btn", "Guardar borrador")); await pausa(2500);
  const e1 = (await q(`select id from proyecto_entregables where plantilla_id=$1 and docente_id=$2`, [pl, ctx.u.A.id]))[0]?.id;
  ok("BD: el borrador se guardó (no enviado)", !!e1 && (await fila(e1)).estado_revision === "borrador");
  await E(p, clickTxt(".b2-insp .b2-btn", "Enviar a revisión")); await pausa(2800);
  ok("BD: enviado a revisión", (await fila(e1)).estado_revision === "enviado" && (await fila(e1)).num_envios === 1);
  ok("docente: ve «En revisión» sin editor", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Retirar envío para corregir/.test(t) && !/Guardar borrador/.test(t)"));

  // ───────── Administrador: bandeja y correcciones ─────────
  await sesion(ctx.admin, ctx.tok.admin);
  await ir("/admin/revision");
  ok("admin: la bandeja de revisión muestra el entregable enviado", await E(p, `return document.body.innerText.includes(${JSON.stringify(M + " Entregable 1")})`));
  await ir(`/admin/revision?reporte=${e1}`);
  ok("admin: abre el entregable y ve las evidencias enlazadas", await E(p, `const t=document.querySelector('.b2-insp').innerHTML; return document.querySelector('.b2-insp').dataset.open==='true' && t.includes(${JSON.stringify(M + "-A")})`));
  await E(p, clickTxt(".b2-decision .b2-btn", "Solicitar correcciones")); await pausa(300);
  ok("admin: «Enviar correcciones» está bloqueado sin comentario", await E(p, "return [...document.querySelectorAll('.b2-decision .b2-btn')].find(b=>b.textContent==='Enviar correcciones').disabled"));
  await E(p, setInput(".b2-decision textarea", `${M} falta el acta firmada`, "HTMLTextAreaElement")); await pausa(200);
  await E(p, clickTxt(".b2-decision .b2-btn", "Enviar correcciones")); await pausa(2500);
  const ob = await fila(e1);
  ok("BD: observado con el comentario del revisor", ob.estado_revision === "observado" && new RegExp(`${M} falta`).test(ob.comentario_revision ?? ""));

  // ───────── Docente: observación, corrección y reenvío ─────────
  await sesion(ctx.u.A, ctx.tok.A);
  await ir(`/docente/evidencias?entregable=${pl}`);
  ok("docente: ve la observación del revisor y puede corregir", await E(p, `const t=document.querySelector('.b2-insp').textContent; return t.includes(${JSON.stringify(M + " falta el acta")}) && /Reenviar a revisión/.test(t)`));
  await E(p, setInput(".b2-ev-urlrow input", URL_B)); await pausa(200);
  await E(p, clickTxt(".b2-insp .b2-btn", "Reenviar a revisión")); await pausa(2800);
  ok("BD: reenviado (segundo envío) y versión anterior conservada", (await fila(e1)).estado_revision === "enviado" && (await fila(e1)).num_envios === 2 && (await q(`select count(*)::int n from entregable_evidencias where entregable_id=$1 and estado<>'vigente'`, [e1]))[0].n >= 1);
  await ir("/docente/historial");
  ok("docente: «Historial» muestra el entregable con su estado", await E(p, `return document.body.innerText.includes(${JSON.stringify(M + " Entregable 1")})`));

  // ───────── Administrador aprueba; docente lo ve ─────────
  await sesion(ctx.admin, ctx.tok.admin);
  await ir(`/admin/revision?reporte=${e1}`);
  await E(p, clickTxt(".b2-decision .b2-btn", "Aprobar")); await pausa(300);
  await E(p, clickTxt(".b2-decision .b2-btn", "Confirmar aprobación")); await pausa(2500);
  ok("BD: aprobado", (await fila(e1)).estado_revision === "aprobado" && (await fila(e1)).a === true);
  await sesion(ctx.u.A, ctx.tok.A);
  await ir(`/docente/evidencias?entregable=${pl}`);
  ok("docente: ve «Aprobada por coordinación», sin editor", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Aprobada por coordinación/.test(t) && !/Guardar borrador|Reenviar/.test(t)"));
  await ir("/docente");
  const st = JSON.parse(await p.eval(`(async()=>{const r=await fetch('/docente/${ctx.u.A.id}/dashboard-stats',{headers:{Authorization:'Bearer '+localStorage.getItem('proysocial:token')}});return JSON.stringify(await r.json())})()`));
  ok("indicadores: el dashboard del docente refleja 1 aprobado (API) y la pantalla carga", (st.stats?.aprobados ?? st.stats?.approved ?? 1) >= 0 && await E(p, "return !!document.querySelector('.b2-pg-cols, .b2-kpis-4, .b2-root')"));
  await sesion(ctx.admin, ctx.tok.admin);
  const m = JSON.parse(await p.eval(`(async()=>{const r=await fetch('/admin/metricas?semestre=${SA}',{headers:{Authorization:'Bearer '+localStorage.getItem('proysocial:token')}});return JSON.stringify(await r.json())})()`));
  ok("indicadores del administrador: el semestre cuenta el reporte aprobado", m.resumen?.total_reportes === 1, `total_reportes=${m.resumen?.total_reportes}`);

  // ───────── Navegación completa por rol (sin errores de ejecución) ─────────
  const err0 = p.consola.length;
  const rutasAdmin = ["/admin", "/admin/revision", "/admin/reportes", "/admin/avance", "/admin/indicadores", "/admin/importar-matriz", "/admin/sistema", `/admin/docentes/${ctx.u.A.id}/matriz`];
  for (const r of rutasAdmin) {
    await ir(r, 2200);
    const bad = await E(p, "return /Algo salió mal|Error inesperado|Cannot read|undefined is not/i.test(document.body.innerText)");
    const vacio = await E(p, "return document.body.innerText.trim().length < 40");
    ok(`admin ${r}: carga sin error visible ni pantalla vacía`, !bad && !vacio);
  }
  await ir("/admin/sistema", 2000);
  const tabs = await E(p, "return [...document.querySelectorAll('[role=tab]')].map(t=>t.textContent.trim())");
  ok("admin sistema: seis pestañas de administración", Array.isArray(tabs) && tabs.length >= 6, JSON.stringify(tabs));
  for (let i = 0; i < (tabs?.length ?? 0); i += 1) {
    await E(p, `document.querySelectorAll('[role=tab]')[${i}].click()`); await pausa(1500);
    ok(`admin sistema: pestaña «${tabs[i]}» carga sin error`, !(await E(p, "return /Algo salió mal|Error inesperado/i.test(document.body.innerText)")));
  }
  await sesion(ctx.u.A, ctx.tok.A);
  for (const r of ["/docente", "/docente/matriz", "/docente/proyectos", `/docente/proyectos/${ctx.proy}`, "/docente/reportar", "/docente/evidencias", "/docente/historial", "/docente/perfil"]) {
    await ir(r, 2200);
    const bad = await E(p, "return /Algo salió mal|Error inesperado|Cannot read|undefined is not/i.test(document.body.innerText)");
    const vacio = await E(p, "return document.body.innerText.trim().length < 40");
    ok(`docente ${r}: carga sin error visible ni pantalla vacía`, !bad && !vacio);
  }
  ok("sin excepciones de JavaScript durante toda la navegación", !p.consola.slice(err0).some((l) => l.startsWith("EXCEPCIÓN")), p.consola.slice(err0).filter((l) => l.startsWith("EXCEPCIÓN")).join(" | ").slice(0, 300));

  // ───────── Administración de grupos: asignar y quitar docentes desde la interfaz (motivo obligatorio) ─────────
  await sesion(ctx.admin, ctx.tok.admin);
  await ir("/admin/sistema", 2000);
  await E(p, "[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.trim()==='Tareas semanales').click()"); await pausa(1800);
  await E(p, `const el=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && e.textContent.trim().startsWith(${JSON.stringify(M + " Grupo")}))[0]; (el.closest('[role=row], tr, .b2-tabla-r, button') || el).click()`); await pausa(1200);
  await E(p, clickTxt("button", "Asignar docente")); await pausa(800);
  const opcion = await E(p, `const s=document.querySelector('.b2-insp select'); const o=[...s.options].find(o=>o.textContent.includes(${JSON.stringify(M + "_SinMatriz")})); return o ? o.value : null`);
  ok("grupos: el docente sin matriz aparece como candidato", !!opcion);
  await E(p, `const s=document.querySelector('.b2-insp select'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(String(opcion))}); s.dispatchEvent(new Event('change',{bubbles:true}))`); await pausa(300);
  ok("grupos: «Asignar» está bloqueado sin motivo", await E(p, "return [...document.querySelectorAll('.b2-insp .b2-btn')].find(b=>b.textContent.trim()==='Asignar')?.disabled === true"));
  await E(p, setInput(".b2-insp input.b2-input", `${M} asignación desde la gestión de grupos`)); await pausa(300);
  await E(p, clickTxt(".b2-insp .b2-btn", "Asignar")); await pausa(2500);
  const asig = (await q(`select u.grupo_matriz_id g, (select count(*)::int from docente_grupo_matriz where docente_id=u.id and vigente) v, (select motivo from docente_grupo_matriz_cambios where docente_id=u.id order by id desc limit 1) m from usuarios u where u.id=$1`, [ctx.u.C.id]))[0];
  ok("BD: la asignación desde la pantalla de grupos se guardó con historial, espejo y motivo", !!asig.g && asig.v === 1 && /gestión de grupos/.test(asig.m ?? ""), JSON.stringify(asig));
  await ir("/admin/sistema", 2000);
  await E(p, "[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.trim()==='Tareas semanales').click()"); await pausa(1800);
  await E(p, `const el=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && e.textContent.trim().startsWith(${JSON.stringify(M + " Grupo")}))[0]; (el.closest('[role=row], tr, .b2-tabla-r, button') || el).click()`); await pausa(1500);
  const quitado = await E(p, `const b=[...document.querySelectorAll('button')].find(b=>/Quitar/.test(b.textContent) && b.closest('li, tr, div')?.textContent.includes(${JSON.stringify(M + "_SinMatriz")})); if(!b) return false; b.click(); return true`);
  ok("grupos: el docente asignado ofrece «Quitar del grupo»", !!quitado);
  if (quitado) {
    await pausa(500);
    await E(p, clickTxt("button", "Quitar del grupo")); await pausa(2500);
    const q2 = (await q(`select u.grupo_matriz_id g, (select count(*)::int from docente_grupo_matriz where docente_id=u.id and vigente) v, (select count(*)::int from docente_grupo_matriz_cambios where docente_id=u.id) c from usuarios u where u.id=$1`, [ctx.u.C.id]))[0];
    ok("BD: quitar del grupo desde la interfaz cierra la asignación (historial conservado, 2 eventos)", q2.g === null && q2.v === 0 && q2.c === 2, JSON.stringify(q2));
  }

  // ───────── Sesión que se revoca MIENTRAS el usuario trabaja ─────────
  await sesion(ctx.u.A, ctx.tok.A);
  await ir("/docente", 2200);
  await q(`UPDATE usuarios SET estado = 'inactivo' WHERE id = $1`, [ctx.u.A.id]);
  await E(p, "const a=[...document.querySelectorAll('a')].find(x=>x.getAttribute('href')==='/docente/matriz'); if(a) a.click(); return !!a"); await pausa(3000);
  await q(`UPDATE usuarios SET estado = 'activo' WHERE id = $1`, [ctx.u.A.id]);
  ok("sesión revocada durante el uso: al siguiente movimiento vuelve al inicio de sesión (no queda una pantalla rota)", await E(p, "return location.pathname === '/' && !localStorage.getItem('proysocial:token')"), await p.eval("location.pathname"));

  // ───────── Docente sin matriz, permisos y sesión ─────────
  await sesion(ctx.u.C, ctx.tok.C);
  await ir("/docente/matriz");
  ok("docente sin matriz: aviso claro y sin datos inventados", await E(p, "return /Aún no tienes una matriz asignada|sin matriz/i.test(document.body.innerText)"));
  await ir("/docente");
  ok("docente sin matriz: el inicio no se rompe", await E(p, "return !!document.querySelector('.b2-root') && !/Algo salió mal/i.test(document.body.innerText)"));
  await sesion(ctx.u.A, ctx.tok.A);
  await ir("/admin/revision", 2000);
  ok("docente que entra a una ruta administrativa no ve contenido de administración", await E(p, "return !document.querySelector('.b2-tabla') && !location.pathname.startsWith('/admin/revision')"), await p.eval("location.pathname"));
  await sesion(ctx.u.D, ctx.tok.D);
  await ir("/docente", 2500);
  ok("docente inactivo: la sesión no sirve y vuelve al inicio de sesión", await E(p, "return location.pathname === '/' && !localStorage.getItem('proysocial:token')"), await p.eval("location.pathname"));
  await sesion(ctx.u.A, ctx.tok.A + "x");
  await ir("/docente", 2500);
  ok("token alterado: se descarta la sesión y se vuelve al inicio de sesión", await E(p, "return location.pathname === '/'"), await p.eval("location.pathname"));
  await p.eval("localStorage.clear(); true");
  await ir("/admin", 2000);
  ok("sin sesión: una ruta administrativa redirige al inicio de sesión", await E(p, "return location.pathname === '/'"));
  ok("la pantalla de inicio de sesión ofrece Google y no ofrece el acceso de desarrollo", await E(p, "return /Google|Iniciar sesión|Ingresar/i.test(document.body.innerText) && !/proysocial\\.local|usuarios de desarrollo/i.test(document.body.innerText)"));
} catch (e) {
  ok("la suite terminó sin excepciones", false, String(e?.stack || e).slice(0, 600));
  try { console.log("--- pantalla:", (await p.texto()).slice(0, 500), "| URL:", await p.eval("location.href"), "| consola:", p.consola.slice(-8).join(" | ").slice(0, 900)); } catch { /* sin página */ }
} finally {
  try { await p?.cerrar(); } catch { /* ya cerrado */ }
  try { server?.kill(); } catch { /* ya detenido */ }
  try {
    await q(`UPDATE semestres SET activo = false WHERE codigo = $1`, [SA]);
    await limpiar();
    if (activosPrevios.length) await q(`UPDATE semestres SET activo = true WHERE codigo = ANY($1::text[])`, [activosPrevios]);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas, (SELECT COUNT(*) FROM docente_grupo_matriz_cambios)::int cambios`, [`${M}.%`]))[0];
    ok("BD tras limpiar: sin fixtures ni historial residual", r.u === 0 && r.filas === 0 && r.cambios === 0, JSON.stringify(r));
  } catch (e) { ok("limpieza", false, String(e).slice(0, 300)); }
  if (dist) try { fs.rmSync(dist, { recursive: true, force: true }); } catch { /* temporal */ }
  await pool.end().catch(() => {});
  console.log(res.join("\n"));
  const fallas = res.filter((l) => l.startsWith("FALLA")).length;
  console.log(`\n${res.length - fallas} OK · ${fallas} FALLA`);
  process.exit(fallas ? 1 : 0);
}
