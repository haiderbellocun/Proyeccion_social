// Etapa 4B: portal docente B2 contra la app real y proysocial_dev. Escrituras solo con un fixture temporal (TSTE5) de Andrés.
// Uso: npm run e2e -- docente
import { lanzar, pausa, iniciarSuite, guardaBD } from "../lib/helpers.mjs";
iniciarSuite("docente");
const { pool } = await guardaBD();
if ((await pool.query("select current_database() d")).rows[0].d !== "proysocial_dev") { console.error("Base no permitida"); process.exit(2); }
const q = async (s, p = []) => (await pool.query(s, p)).rows;
const APP = "http://localhost:5173", API = "http://localhost:4000";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
const setInput = (sel, v, proto = "HTMLInputElement") => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}))`;
const setSel = (sel, v) => `const s=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(v)}); s.dispatchEvent(new Event('change',{bubbles:true}))`;
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(800);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
const api = (p, ruta, opts = "") => EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}${ruta}',{headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}${opts}}); return JSON.stringify({s:r.status, d:await r.json().catch(()=>null)})`).then((j) => JSON.parse(j));
const ir = async (p, ruta, espera = 3000) => { await p.ir(APP + ruta); await pausa(espera); };
const DOC = { Maria: "maria.rodriguez@proysocial.local", Carlos: "carlos.mendoza@proysocial.local", Andres: "andres.torres@proysocial.local", Laura: "laura.gomez@proysocial.local" };
const ADMIN = "admin@proysocial.local";
const URL_A = "https://drive.google.com/file/d/TSTE5-FIXTURE-A/view", URL_B = "https://drive.google.com/file/d/TSTE5-FIXTURE-B/view";

async function limpiar() {
  const f = await q(`SELECT DISTINCT entregable_id FROM entregable_evidencias WHERE url LIKE '%TSTE5%'`);
  for (const { entregable_id: id } of f) {
    await q(`DELETE FROM entregable_eventos WHERE entregable_id=$1`, [id]);
    await q(`DELETE FROM entregable_evidencias WHERE entregable_id=$1`, [id]);
    await q(`DELETE FROM proyecto_entregables WHERE id=$1`, [id]);
  }
}
const instantanea = async () => {
  const t = {};
  for (const tabla of ["proyecto_entregables", "entregable_evidencias", "entregable_eventos", "usuarios"]) t[tabla] = Number((await q(`select count(*) n from ${tabla}`))[0].n);
  t.estados = JSON.stringify(await q(`select estado_revision, count(*)::int n from proyecto_entregables group by 1 order by 1`));
  t.drive = JSON.stringify(await q(`select id, link_drive from usuarios order by id`));
  return t;
};

const p = await lanzar({ ancho: 1440, alto: 900 });
let antes;
try {
  await limpiar();
  antes = await instantanea();

  // ───────── Shell docente y datos por docente ─────────
  for (const [nombre, correo] of Object.entries(DOC)) {
    const uid = await login(p, correo);
    await ir(p, "/docente");
    const stats = await api(p, `/docente/${uid}/dashboard-stats`);
    const perfil = await api(p, `/docente/${uid}/perfil`);
    ok(`[${nombre}] shell B2 (una sola cabecera, sin shell Tinta)`, await E(p, "return !!document.querySelector('.b2-root .b2-hd') && document.querySelectorAll('.b2-hd').length===1 && !document.querySelector('aside[aria-label=\"Navegación principal\"]')"));
    ok(`[${nombre}] menú superior solo con módulos del docente`, await E(p, "const t=[...document.querySelectorAll('.b2-hd-mod')].map(a=>a.textContent).join('|'); return t==='Mi panel|Mi matriz|Iniciativas|Evidencias|Historial'"));
    ok(`[${nombre}] sin rutas administrativas en la navegación`, await E(p, "return ![...document.querySelectorAll('.b2-hd a, .b2-side a, .b2-bnav a')].some(a=>(a.getAttribute('href')||'').startsWith('/admin'))"));
    ok(`[${nombre}] riel lateral sin duplicar el menú superior (Reportar entregable, Mi perfil)`, await E(p, "const l=[...document.querySelectorAll('.b2-side-i')].map(a=>a.getAttribute('aria-label')||a.textContent.trim()).filter(Boolean); return l.includes('Reportar entregable') && l.includes('Mi perfil') && !l.some(x=>/Mi matriz|Mi panel|Historial|Evidencias|Iniciativas/.test(x))"));
    ok(`[${nombre}] barra de contexto: semana del backend (${stats.d.semana_actual.estado})`, stats.d.semana_actual.estado === "en_curso"
      ? await E(p, `const t=document.querySelector('.b2-ctx').textContent; return t.includes(${JSON.stringify(stats.d.semana_actual.semestre || "")}) && t.includes('Semana ${stats.d.semana_actual.numero} de')`)
      : await E(p, "return /Semestre sin calendario configurado|por iniciar|finalizado/.test(document.querySelector('.b2-ctx').textContent)"));
    ok(`[${nombre}] barra de contexto: programa y grupo del perfil`, perfil.d.grupo_matriz ? await E(p, `const t=document.querySelector('.b2-ctx').textContent; return t.includes(${JSON.stringify(perfil.d.programa.nombre)}) && t.includes(${JSON.stringify(perfil.d.grupo_matriz.nombre)})`) : await E(p, "return /Sin matriz asignada/.test(document.querySelector('.b2-ctx').textContent)"));
    if (stats.d.stats.total > 0) {
      const ind = stats.d.indicadores;
      ok(`[${nombre}] dashboard: reportado/aprobado/esperado/brecha = backend`, await E(p, `const t=document.querySelector('.b2-pg-cols').textContent; return t.includes('${stats.d.stats.pct}%') && t.includes('${ind.pct_aprobado}%') && t.includes('${stats.d.stats.expectedPct}%')`), `rep=${stats.d.stats.pct} apr=${ind.pct_aprobado} esp=${stats.d.stats.expectedPct}`);
      ok(`[${nombre}] dashboard: conteos pendientes/en revisión/observados/vencidos = backend`, await E(p, `const c=[...document.querySelectorAll('.b2-kpis-4 dd')].map(d=>d.textContent).join(','); return c==='${stats.d.conteos.pendientes},${stats.d.conteos.en_revision},${stats.d.conteos.observados},${stats.d.conteos.vencidos}'`), JSON.stringify(stats.d.conteos));
      ok(`[${nombre}] dashboard: tabla de entregables = ${stats.d.activities.length}`, (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr').length")) === stats.d.activities.length);
      ok(`[${nombre}] dashboard: avance por mes del backend (${stats.d.byMonth.length} meses)`, (await E(p, "return document.querySelectorAll('.b2-docs .b2-doc').length")) === stats.d.byMonth.length);
      ok(`[${nombre}] dashboard: gráfica semanal visible`, await E(p, "return !!document.querySelector('.recharts-surface')"));
    } else {
      ok(`[${nombre}] sin matriz: aviso claro y sin métricas inventadas`, await E(p, "return /Aún no tienes una matriz asignada/.test(document.body.innerText)"));
    }
    ok(`[${nombre}] dashboard sin desborde`, await sinDesborde(p));
  }

  // ───────── María: navegación, iniciativas, matriz, evidencias, historial, perfil, notificaciones ─────────
  const uid = await login(p, DOC.Maria);
  await ir(p, "/docente");
  const rutas = [["Mi matriz", "/docente/matriz"], ["Iniciativas", "/docente/proyectos"], ["Evidencias", "/docente/evidencias"], ["Historial", "/docente/historial"], ["Mi panel", "/docente"]];
  for (const [t, r] of rutas) {
    await E(p, `[...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==${JSON.stringify(t)}).click()`); await pausa(1800);
    ok(`navegación «${t}» → ${r} con módulo activo y una sola cabecera`, (await E(p, "return location.pathname")) === r && (await E(p, `return [...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==${JSON.stringify(t)}).getAttribute('aria-current')==='page' && document.querySelectorAll('.b2-hd').length===1`)));
  }
  await E(p, "[...document.querySelectorAll('.b2-side-i')].find(a=>a.getAttribute('aria-label')==='Reportar entregable').click()"); await pausa(1800);
  ok("riel: «Reportar entregable» abre /docente/reportar", (await E(p, "return location.pathname")) === "/docente/reportar");
  await E(p, "[...document.querySelectorAll('.b2-side-i')].find(a=>a.getAttribute('aria-label')==='Mi perfil').click()"); await pausa(1800);
  ok("riel: «Mi perfil» abre /docente/perfil", (await E(p, "return location.pathname")) === "/docente/perfil");
  // notificaciones
  await E(p, "document.querySelector('.b2-hd-btn[aria-label^=\"Notificaciones\"]').click()"); await pausa(1500);
  const nItems = await E(p, "return document.querySelectorAll('[role=dialog][aria-label=\"Notificaciones\"] li').length");
  const badge = await E(p, "return document.querySelector('.b2-hd-count')?.textContent||'0'");
  ok("notificaciones del docente: panel real y contador coinciden", nItems > 0 && String(nItems) === badge, `lista=${nItems} badge=${badge}`);
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(300);

  // iniciativas
  const dash = await api(p, `/docente/${uid}/dashboard`);
  await ir(p, "/docente/proyectos");
  const ini = dash.d.proyectos;
  ok(`iniciativas: filas = backend (${ini.length})`, (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === ini.length);
  await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(500);
  ok("iniciativas: inspector con tipo, fechas, horas, avance y entregables", await E(p, "const t=document.querySelector('.b2-insp').textContent; return document.querySelector('.b2-insp').dataset.open==='true' && /Fin estimado/.test(t) && /Entregables/.test(t) && /entregables completados/.test(t)"));
  await E(p, setInput(".b2-tb-search input", "Convenio")); await pausa(300);
  ok("iniciativas: búsqueda", (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === ini.filter((x) => /convenio/i.test(`${x.titulo} ${x.programa_nombre} ${x.coordinador}`)).length);
  await E(p, setInput(".b2-tb-search input", "")); await pausa(200);
  await E(p, clickTxt(".b2-insp .b2-btn", "Ver detalle")); await pausa(2500);
  const det = await api(p, `/docente/${uid}/iniciativas/${ini[0].id}`);
  const totDet = det.d.semanasDetalle.flatMap((s) => s.entregables).length;
  ok("detalle de iniciativa: entregables por semana = backend", (await E(p, "return document.querySelectorAll('.b2-ent-i').length")) === totDet && /\/docente\/proyectos\/\d+/.test(await E(p, "return location.pathname")), `entregables=${totDet}`);
  ok("detalle: enlaces de evidencia abren en pestaña nueva", await E(p, "const a=[...document.querySelectorAll('.b2-ent-i a')]; return a.every(x=>x.target==='_blank' && x.rel.includes('noopener'))"));
  await ir(p, "/docente/proyectos/999999", 2000);
  ok("detalle inexistente: mensaje y salida", await E(p, "return /No se encontró la iniciativa/.test(document.body.innerText)"));
  // matriz y evidencias dentro del shell nuevo
  await ir(p, "/docente/matriz");
  ok("matriz integrada: sin doble cabecera, con tabla, cronograma y «Por mes»", await E(p, "return document.querySelectorAll('.b2-hd').length===1 && !!document.querySelector('.b2-gantt') && [...document.querySelectorAll('.b2-tb .b2-btn')].some(b=>b.textContent.includes('Por mes')) && document.querySelector('.b2-mxp').classList.contains('b2-fill')"));
  const mat = await api(p, `/docente/${uid}/matriz`);
  ok("matriz: total de entregables = backend", (await E(p, "return document.querySelector('.b2-tb-count').textContent")).includes(String(mat.d.items.length)));
  await ir(p, "/docente/evidencias");
  ok("evidencias integradas: una cabecera, lista, filtros e inspector", await E(p, "return document.querySelectorAll('.b2-hd').length===1 && !!document.querySelector('.b2-ev-fila') && document.querySelectorAll('.b2-chip').length>=6"));
  await E(p, "document.querySelector('.b2-ev-fila').click()"); await pausa(500);
  ok("evidencias: inspector abre", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true'"));
  // historial
  const hist = await api(p, `/docente/${uid}/reportes`);
  await ir(p, "/docente/historial");
  ok(`historial: filas = backend (${hist.d.reportes.length})`, (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === hist.d.reportes.length);
  const cuentas = { approved: hist.d.reportes.filter((r) => r.status === "approved").length, pending: hist.d.reportes.filter((r) => r.status === "pending").length, review: hist.d.reportes.filter((r) => r.status === "review").length };
  ok("historial: chips con conteos del backend", await E(p, `const t=[...document.querySelectorAll('.b2-chip')].map(c=>c.textContent).join('|'); return t.includes('Aprobados${cuentas.approved}') && t.includes('Pendientes${cuentas.pending}') && t.includes('Requieren corrección${cuentas.review}')`));
  await E(p, clickTxt(".b2-chip", "Requieren corrección")); await pausa(300);
  ok("historial: filtro «Requieren corrección»", (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === cuentas.review);
  await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(600);
  ok("historial: inspector con observación y formulario de corrección", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /El administrador solicitó ajustes/.test(t) && /Guardar correcciones y reenviar/.test(t)"));
  await E(p, "[...document.querySelectorAll('.b2-insp .b2-link-btn')].find(b=>/historial/i.test(b.textContent)).click()"); await pausa(1800);
  ok("historial: trazabilidad real (eventos) en el detalle", await E(p, "const h=document.querySelector('.b2-hist'); return !!h && !/Cargando|No se pudo/.test(h.textContent)"));
  const obsId = hist.d.reportes.find((r) => r.status === "review").id;
  await ir(p, `/docente/historial?reporte=${obsId}`);
  ok("historial: enlace ?reporte= abre el detalle", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true'"));
  // perfil
  const perf = await api(p, `/docente/${uid}/perfil`);
  await ir(p, "/docente/perfil");
  ok("perfil: nombre, correo, programa, grupo y avance = backend", await E(p, `const t=document.querySelector('.b2-pg').textContent; return t.includes(${JSON.stringify(perf.d.nombre)}) && t.includes(${JSON.stringify(perf.d.correo)}) && t.includes(${JSON.stringify(perf.d.programa.nombre)}) && t.includes(${JSON.stringify(perf.d.grupo_matriz.nombre)}) && t.includes('${perf.d.stats.completados} de ${perf.d.stats.total_plantillas}')`));
  ok("perfil: solo la edición permitida (enlace de Drive); sin cambio de contraseña", await E(p, "const t=document.querySelector('.b2-pg').textContent; return !!document.querySelector('#perfil-drive') && !/contraseña/i.test(t)"));
  ok("perfil: «Guardar» deshabilitado sin cambios", await E(p, "return [...document.querySelectorAll('.b2-pg .b2-btn')].find(b=>b.textContent.trim()==='Guardar').disabled"));

  // ───────── Reportar entregable ─────────
  await ir(p, "/docente/reportar");
  ok("reportar: iniciativa, semana y entregable preseleccionados", await E(p, "return document.querySelector('#rp-iniciativa').value!=='' && document.querySelector('#rp-semana').value!=='' && document.querySelector('#rp-entregable').value!==''"));
  ok("reportar: instrucciones y estado del entregable en el panel lateral", await E(p, "const t=document.querySelector('.b2-rp-lado').textContent; return /Instrucciones/.test(t) && document.querySelectorAll('.b2-rp-lado .b2-estado').length>=1"));
  const obsPl = (await api(p, `/docente/${uid}/evidencias`)).d.items.find((i) => i.situacion === "observada");
  await ir(p, `/docente/reportar?plantilla=${obsPl.plantilla_id}`);
  ok("reportar ?plantilla=: selecciona el entregable y muestra la observación del revisor", await E(p, `const t=document.querySelector('.b2-rp-lado').textContent; return /Observación del revisor/.test(t) && t.includes(${JSON.stringify((obsPl.comentario_revision || "").slice(0, 20))})`));
  await E(p, setSel("#rp-entregable", "")); await pausa(300);
  await E(p, clickTxt(".b2-rp-barra .b2-btn", "Enviar reporte")); await pausa(500);
  ok("reportar: validación visible (resumen + campo) y no se envía", await E(p, "return !!document.querySelector('.b2-rp-form [role=alert] ul') && !!document.querySelector('#rp-entregable-err')"));
  ok("reportar: «Guardar borrador» y «Enviar reporte» presentes; campos de avance, descripción, enlaces y justificación", await E(p, "const t=document.querySelector('.b2-rp').textContent; return /Guardar borrador/.test(t) && /Enviar reporte/.test(t) && !!document.querySelector('#rp-avance') && !!document.querySelector('#rp-descripcion') && !!document.querySelector('#rp-enlace') && !!document.querySelector('#rp-justificacion')"));
  await E(p, setInput("#rp-enlace", "https://ejemplo.test/x")); await E(p, clickTxt(".b2-rp .b2-btn", "Agregar")); await pausa(200);
  ok("reportar: agregar y quitar enlaces; la justificación se oculta con enlaces", (await E(p, "return document.querySelectorAll('.b2-rp .b2-evid-i').length")) === 1 && !(await E(p, "return !!document.querySelector('#rp-justificacion')")));
  await E(p, "document.querySelector('.b2-rp .b2-evid-i .b2-btn').click()"); await pausa(200);
  ok("reportar: quitar enlace restablece la justificación", await E(p, "return !!document.querySelector('#rp-justificacion')"));
  ok("sin escrituras por las validaciones", JSON.stringify(await instantanea()) === JSON.stringify(antes));

  // ───────── Fixture de Andrés: reportar → historial → corrección ─────────
  const aid = await login(p, DOC.Andres);
  const fx = (await api(p, `/docente/${aid}/evidencias`)).d.items.find((i) => i.situacion === "sin_evidencia" && i.puede_editar && i.requiere_evidencia && i.entregable_id == null && i.iniciativa_id != null);
  ok("fixture: entregable sin registro previo de Andrés", !!fx, fx ? `plantilla=${fx.plantilla_id}` : "");
  if (fx) {
    await ir(p, `/docente/reportar?plantilla=${fx.plantilla_id}`);
    ok("fixture: el entregable llega preseleccionado", await E(p, `return document.querySelector('#rp-entregable').value==='tpl:${fx.plantilla_id}'`));
    await E(p, "const r=document.querySelector('#rp-avance'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(r,'60'); r.dispatchEvent(new Event('input',{bubbles:true}))");
    await E(p, setInput("#rp-descripcion", "TSTE5 descripción del reporte", "HTMLTextAreaElement"));
    await E(p, setInput("#rp-enlace", URL_A)); await E(p, clickTxt(".b2-rp .b2-btn", "Agregar")); await pausa(300);
    await E(p, clickTxt(".b2-rp-barra .b2-btn", "Guardar borrador")); await pausa(2500);
    const b = (await q(`select id, estado_revision, completado, porcentaje_avance, descripcion_reporte from proyecto_entregables where plantilla_id=$1 and docente_id=$2`, [fx.plantilla_id, aid]))[0];
    ok("BD: borrador guardado (avance 60 y descripción)", !!b && b.completado === false && Number(b.porcentaje_avance) === 60 && /TSTE5/.test(b.descripcion_reporte ?? ""), JSON.stringify(b));
    await E(p, clickTxt(".b2-rp-barra .b2-btn", "Enviar reporte")); await pausa(3000);
    const env = (await q(`select estado_revision, completado, num_envios from proyecto_entregables where id=$1`, [b.id]))[0];
    ok("BD: reporte enviado a revisión (num_envios=1)", env.completado === true && env.estado_revision === "enviado" && env.num_envios === 1, JSON.stringify(env));
    ok("reportar: pantalla de confirmación con accesos", await E(p, "return /Reporte enviado/.test(document.body.innerText) && /Ver historial/.test(document.body.innerText)"));
    const evs = await q(`select count(*)::int n from entregable_evidencias where entregable_id=$1 and url like '%TSTE5-FIXTURE-A%'`, [b.id]);
    ok("BD: enlace de evidencia registrado", evs[0].n === 1);
    await ir(p, "/docente/historial");
    ok("historial: el reporte enviado aparece como pendiente", await E(p, "return [...document.querySelectorAll('.b2-tabla-r')].some(r=>/TSTE5|Pendiente de revisión/.test(r.textContent))"));
    // el administrador observa (vía API, con su token)
    await login(p, ADMIN);
    const obs = await api(p, `/admin/reportes-revision/${b.id}`, `,method:'PUT',body:JSON.stringify({estado_revision:'observado',comentario_revision:'TSTE5 falta el acta firmada'})`);
    ok("fixture: el administrador devuelve el reporte con comentario", obs.s === 200, `status=${obs.s}`);
    await login(p, DOC.Andres);
    await ir(p, `/docente/historial?reporte=${b.id}`);
    ok("historial: muestra «Requiere corrección» con el comentario del administrador", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /TSTE5 falta el acta/.test(t) && /Requiere corrección/.test(t)"));
    await E(p, setInput(`#url-${b.id}`, URL_B)); await E(p, setInput(`#desc-${b.id}`, "TSTE5 corregida", "HTMLTextAreaElement")); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-btn", "Guardar correcciones y reenviar")); await pausa(3000);
    const re = (await q(`select estado_revision, num_envios, descripcion_reporte from proyecto_entregables where id=$1`, [b.id]))[0];
    ok("BD: corrección y reenvío → «enviado» (sin estado «reenviado») con 2 envíos", re.estado_revision === "enviado" && re.num_envios === 2 && /TSTE5 corregida/.test(re.descripcion_reporte ?? ""), JSON.stringify(re));
    ok("BD: versión anterior de la evidencia conservada", Number((await q(`select count(*) n from entregable_evidencias where entregable_id=$1 and estado<>'vigente'`, [b.id]))[0].n) >= 1);
    await E(p, "[...document.querySelectorAll('.b2-insp .b2-link-btn')].find(b=>/historial/i.test(b.textContent)).click()"); await pausa(1800);
    ok("historial: trazabilidad con envío, observación y reenvío", await E(p, "const t=document.querySelector('.b2-hist').textContent; return /Enviado a revisión/.test(t) && /Observado/.test(t) && /Reenviado/.test(t)"));
    // el administrador aprueba y el docente ve el bloqueo
    await login(p, ADMIN);
    const ap = await api(p, `/admin/reportes-revision/${b.id}`, `,method:'PUT',body:JSON.stringify({estado_revision:'aprobado'})`);
    ok("fixture: aprobación del administrador", ap.s === 200, `status=${ap.s}`);
    await login(p, DOC.Andres);
    await ir(p, `/docente/reportar?plantilla=${fx.plantilla_id}`);
    ok("reportar: un aprobado se muestra bloqueado en el panel lateral", await E(p, "return /ya está aprobado y no puede modificarse/.test(document.querySelector('.b2-rp-lado').textContent)"));
    const intento = await api(p, `/docente/entregables/${b.id}/borrador`, `,method:'PATCH',body:JSON.stringify({descripcion_reporte:'TSTE5 intruso'})`);
    ok("API: el backend rechaza modificar un aprobado", intento.s >= 400, `status=${intento.s}`);
  }

  // ───────── Perfil: edición del enlace de Drive (se restablece) ─────────
  await login(p, DOC.Laura);
  await ir(p, "/docente/perfil");
  const driveOrig = (await q(`select link_drive from usuarios where correo=$1`, [DOC.Laura]))[0].link_drive;
  await E(p, setInput("#perfil-drive", "https://drive.google.com/drive/folders/TSTE5-PERFIL")); await pausa(200);
  await E(p, clickTxt(".b2-pg .b2-btn", "Guardar")); await pausa(2000);
  ok("BD: enlace de Drive actualizado desde el perfil", (await q(`select link_drive from usuarios where correo=$1`, [DOC.Laura]))[0].link_drive === "https://drive.google.com/drive/folders/TSTE5-PERFIL");
  ok("shell: la carpeta de Drive aparece en el riel tras guardar", await (async () => { await ir(p, "/docente/perfil"); return E(p, "return [...document.querySelectorAll('.b2-side-i')].some(a=>/Mi carpeta de Drive/.test(a.getAttribute('aria-label')||a.textContent))"); })());
  await q(`update usuarios set link_drive=$1 where correo=$2`, [driveOrig, DOC.Laura]);

  // ───────── Errores de conexión y estados vacíos ─────────
  await login(p, DOC.Maria);
  await ir(p, "/docente/matriz");
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>/dashboard-stats|\\/reportes$|\\/dashboard$|\\/perfil$/.test(String(u))?Promise.reject(new TypeError('Failed to fetch')):window.__f(u,...a)");
  await E(p, clickTxt(".b2-hd-mod", "Mi panel")); await pausa(1800);
  ok("panel: error de conexión con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]') && [...document.querySelectorAll('.b2-alert .b2-btn')].some(b=>b.textContent==='Reintentar')"));
  await E(p, clickTxt(".b2-hd-mod", "Iniciativas")); await pausa(1800);
  ok("iniciativas: error de conexión con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]')"));
  await E(p, clickTxt(".b2-hd-mod", "Historial")); await pausa(1800);
  ok("historial: error de conexión con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]')"));
  await E(p, "window.fetch=window.__f"); await E(p, clickTxt(".b2-alert .b2-btn", "Reintentar")); await pausa(1800);
  ok("historial: «Reintentar» recupera los datos", await E(p, "return !document.querySelector('.b2-alert[role=alert]') && document.querySelectorAll('.b2-tabla-r').length>0"));
  await login(p, DOC.Laura);
  for (const [r, texto] of [["/docente/proyectos", /Aún no tienes iniciativas asignadas|iniciativas asignadas/], ["/docente/historial", /Aún no has enviado reportes/], ["/docente/evidencias", /Aún no tienes una matriz asignada/], ["/docente/matriz", /Todavía no tienes entregables asignados/]]) {
    await ir(p, r, 2800);
    ok(`Laura (sin matriz): estado vacío en ${r}`, await E(p, `return ${texto}.test(document.body.innerText)`));
  }

  // ───────── Permisos por rol ─────────
  await login(p, DOC.Maria);
  for (const r of ["/admin", "/admin/revision", "/admin/importar-matriz", "/admin/docentes/3/matriz"]) {
    await ir(p, r, 1800);
    ok(`docente no accede a ${r}`, await E(p, "return !location.pathname.startsWith('/admin')"));
  }
  await login(p, ADMIN);
  await ir(p, "/docente", 1800);
  ok("el administrador no entra a rutas del docente", await E(p, "return !location.pathname.startsWith('/docente')"));
} catch (e) {
  ok(`EXCEPCIÓN tras «${res[res.length - 1]?.slice(0, 90)}»`, false, String(e.message).slice(0, 240));
} finally {
  await limpiar();
  const despues = await instantanea();
  ok("BD tras limpiar: idéntica a la inicial (datos sembrados intactos)", antes && JSON.stringify(despues) === JSON.stringify(antes), antes ? JSON.stringify(Object.keys(antes).filter((k) => antes[k] !== despues[k])) : "");
  ok("BD: sin residuos TSTE5", Number((await q(`select count(*) n from entregable_evidencias where url like '%TSTE5%'`))[0].n) === 0 && Number((await q(`select count(*) n from usuarios where link_drive like '%TSTE5%'`))[0].n) === 0);
  await p.cerrar();
  await pool.end();
}
const errs = p.consola.filter((x) => !/favicon|Download the React DevTools|Failed to fetch/.test(x));
// Diagnóstico: si hay errores de consola, se muestran también las respuestas HTTP >= 400 de la sesión (una petición fallida real
// se distingue así del rechazo simulado de fetch, que no genera respuesta).
ok("consola sin errores inesperados", errs.length === 0, errs.length ? `${errs[0]?.slice(0, 160)} | HTTP>=400: ${p.fallos.join(" ; ") || "ninguna"}` : "");
console.log(res.join("\n"));
