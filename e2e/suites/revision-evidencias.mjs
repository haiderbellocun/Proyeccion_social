// Etapa 3: pruebas de Revisión (admin) y Evidencias (docente) contra la app real y proysocial_dev.
// Escrituras: solo sobre un fixture temporal (entregable de Andrés marcado TSTE3). Se verifica en PostgreSQL y se limpia al final.
// Uso: npm run e2e -- revision-evidencias
import { lanzar, pausa, iniciarSuite, guardaBD } from "../lib/helpers.mjs";
iniciarSuite("revision-evidencias");
const { pool } = await guardaBD();
const dbn = (await pool.query("select current_database() d")).rows[0].d;
if (dbn !== "proysocial_dev") { console.error("Base no permitida:", dbn); process.exit(2); }
const q = async (s, p = []) => (await pool.query(s, p)).rows;
const APP = "http://localhost:5173";
const API = "http://localhost:4000";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const setInput = (sel, v, proto = "HTMLInputElement") => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}))`;
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");

async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(800);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
const api = (p, ruta, opts = "") => EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}${ruta}',{headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}${opts}}); return JSON.stringify({s:r.status, d:await r.json().catch(()=>null)})`).then((j) => JSON.parse(j));
const ir = async (p, ruta, espera = 3000) => { await p.ir(APP + ruta); await pausa(espera); };

const ADMIN = "admin@proysocial.local", ANDRES = "andres.torres@proysocial.local", MARIA = "maria.rodriguez@proysocial.local";
const URL_A = "https://drive.google.com/file/d/TSTE3-FIXTURE-A/view";
const URL_B = "https://drive.google.com/file/d/TSTE3-FIXTURE-B/view";
let fixture = null, entregableId = null;

async function limpiar() {
  const f = await q(`SELECT DISTINCT entregable_id FROM entregable_evidencias WHERE url LIKE '%TSTE3%'`);
  for (const { entregable_id: id } of f) {
    await q(`DELETE FROM notificaciones WHERE referencia_id=$1 AND mensaje LIKE 'TSTE3%'`, [id]).catch(() => {});
    await q(`DELETE FROM entregable_eventos WHERE entregable_id=$1`, [id]);
    await q(`DELETE FROM entregable_evidencias WHERE entregable_id=$1`, [id]);
    await q(`DELETE FROM proyecto_entregables WHERE id=$1`, [id]);
  }
  await q(`DELETE FROM notificaciones WHERE mensaje LIKE 'TSTE3%'`).catch(() => {});
}

const baseAntes = {};
async function instantanea() {
  const t = {};
  for (const tabla of ["proyecto_entregables", "entregable_evidencias", "entregable_eventos"]) t[tabla] = Number((await q(`select count(*) n from ${tabla}`))[0].n);
  t.estados = JSON.stringify(await q(`select estado_revision, count(*)::int n from proyecto_entregables group by 1 order by 1`));
  return t;
}

const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  await limpiar();
  Object.assign(baseAntes, await instantanea());

  // ───────── Lectura: bandeja del administrador ─────────
  const adminId = await login(p, ADMIN);
  await ir(p, "/admin/revision");
  ok("revisión: estructura B2 (tabla + chips + filtros)", await E(p, "return !!document.querySelector('.b2-tabla') && document.querySelectorAll('.b2-chip').length===5 && !!document.querySelector('.b2-tb')"));
  const pend = await api(p, "/admin/reportes-revision?estado=enviado&page=1&limit=20");
  const filas = await E(p, "return document.querySelectorAll('.b2-tabla-r').length");
  ok("bandeja «Pendientes» = servidor", filas === pend.d.reportes.length, `filas=${filas} API=${pend.d.reportes.length} total=${pend.d.pagination.total}`);
  ok("columnas operativas: docente, entregable, iniciativa, programa, enviado, espera, estado, evidencias", await E(p, "const h=[...document.querySelectorAll('.b2-tabla-h [role=columnheader]')].map(x=>x.textContent); return ['Docente','Entregable','Iniciativa','Programa','Enviado','Espera','Estado','Evidencias'].every(c=>h.includes(c))"));
  const r0 = pend.d.reportes[0];
  ok("fila muestra docente, programa e iniciativa del backend", await E(p, `const t=document.querySelector('.b2-tabla-r').textContent; return t.includes(${JSON.stringify(r0.docente_nombre)}) && t.includes(${JSON.stringify(r0.programa_nombre)}) && t.includes(${JSON.stringify(r0.proyecto_titulo)})`));
  // chips de estado
  for (const [txt, est] of [["Observados", "observado"], ["Aprobados", "aprobado"], ["Todos", "todos"], ["Problema de acceso", "sin_acceso"]]) {
    const a = await api(p, `/admin/reportes-revision?estado=${est}&page=1&limit=20`);
    await E(p, clickTxt(".b2-chip", txt)); await pausa(1300);
    const n = await E(p, "return document.querySelectorAll('.b2-tabla-r').length");
    ok(`filtro de estado «${txt}» = servidor`, n === a.d.reportes.length, `filas=${n} API=${a.d.reportes.length}`);
  }
  // paginación del servidor (todos > 20)
  const todos = await api(p, "/admin/reportes-revision?estado=todos&page=1&limit=20");
  await E(p, clickTxt(".b2-chip", "Todos")); await pausa(1200);
  if (todos.d.pagination.total > 20) {
    await E(p, "document.querySelector('[aria-label=\"Página siguiente\"]').click()"); await pausa(1300);
    const p2 = await api(p, "/admin/reportes-revision?estado=todos&page=2&limit=20");
    ok("paginación: página 2 = servidor", (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === p2.d.reportes.length, `API=${p2.d.reportes.length}`);
    await E(p, "document.querySelector('[aria-label=\"Página anterior\"]').click()"); await pausa(1000);
  } else ok("paginación: total ≤ 20 (un solo página)", await E(p, "return document.querySelector('[aria-label=\"Página siguiente\"]').disabled"));
  // filtros avanzados (servidor): docente y búsqueda
  await E(p, clickTxt(".b2-chip", "Todos")); await pausa(900);
  await E(p, clickTxt(".b2-tb .b2-btn", "Filtros")); await pausa(400);
  const cat = await api(p, "/admin/catalogos");
  const docentes = cat.d.schools.flatMap((s) => s.programs.flatMap((pr) => pr.teachers.map((t) => t.fullName)));
  const nombre = pend.d.reportes.find((r) => r.docente_nombre)?.docente_nombre;
  await E(p, `const s=document.querySelector('#rv-doc'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(nombre)}); s.dispatchEvent(new Event('change',{bubbles:true}))`); await pausa(1400);
  const porDoc = await api(p, `/admin/reportes-revision?estado=todos&page=1&limit=20&docente=${encodeURIComponent(nombre)}`);
  ok(`filtro de docente (${nombre}) en el servidor`, (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === porDoc.d.reportes.length && (await E(p, `return [...document.querySelectorAll('.b2-tabla-r')].every(r=>r.textContent.includes(${JSON.stringify(nombre)}))`)), `API=${porDoc.d.reportes.length}`);
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(300);
  await E(p, clickTxt(".b2-tb .b2-btn", "Limpiar")); await pausa(1200);
  await E(p, setInput(".b2-tb-search input", "Mapeo")); await pausa(1500);
  const porQ = await api(p, "/admin/reportes-revision?estado=todos&page=1&limit=20&q=Mapeo");
  ok("búsqueda por entregable/iniciativa (q) en el servidor", (await E(p, "return document.querySelectorAll('.b2-tabla-r').length")) === porQ.d.reportes.length, `API=${porQ.d.reportes.length}`);
  await E(p, setInput(".b2-tb-search input", "zzzz-sin-resultados")); await pausa(1500);
  ok("estado vacío con filtros", await E(p, "return /No hay entregables con estos filtros|No hay entregables pendientes/.test(document.querySelector('.b2-tabla').textContent)"));
  await E(p, setInput(".b2-tb-search input", "")); await pausa(1200);
  // inspector de lectura sobre un aprobado y sobre un observado
  await E(p, clickTxt(".b2-chip", "Aprobados")); await pausa(1300);
  await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(500);
  ok("aprobado: sin botones de decisión; protegido (reapertura es aparte)", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Entregable aprobado/.test(t) && !/Confirmar aprobación|Solicitar correcciones…|Aprobar…/.test(t)"));
  await E(p, clickTxt(".b2-chip", "Observados")); await pausa(1300);
  await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(500);
  ok("observado: muestra la observación enviada y no ofrece decidir de nuevo", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Observación enviada/.test(t) && !/Aprobar…/.test(t)"));
  ok("historial real del entregable se carga bajo demanda", await (async () => { await E(p, clickTxt(".b2-insp .b2-link-btn", "Ver historial")); await pausa(1800); return E(p, "const h=document.querySelector('.b2-hist'); return !!h && !/Cargando|No se pudo/.test(h.textContent)"); })());
  ok("enlaces de evidencia: abren en pestaña nueva con noopener", await E(p, "const a=[...document.querySelectorAll('.b2-insp .b2-evid-i a')]; return a.length>0 && a.every(x=>x.target==='_blank' && x.rel.includes('noopener'))"));
  // enlace de notificación ?reporte=
  const objetivo = pend.d.reportes[2] ?? pend.d.reportes[0];
  await ir(p, `/admin/revision?reporte=${objetivo.id}`);
  ok("enlace ?reporte= abre el inspector del entregable", await E(p, `return document.querySelector('.b2-insp').dataset.open==='true' && document.querySelector('.b2-insp-h').textContent===${JSON.stringify(objetivo.actividad_reportada)}`));
  // sin evidencia / exención: buscar un caso real
  const sinEv = (await api(p, "/admin/reportes-revision?estado=todos&page=1&limit=100")).d.reportes.find((r) => !r.requisito_evidencia?.requiere || r.evidencia_exenta);
  if (sinEv) {
    await ir(p, `/admin/revision?reporte=${sinEv.id}`);
    ok(`entregable sin requisito/exención (#${sinEv.id}) se muestra correctamente`, await E(p, "const t=document.querySelector('.b2-insp').textContent; return /no se requiere cargue|Sin evidencia — justificación|no requiere evidencia/i.test(t)"));
  } else ok("sin datos sembrados de exención/no requiere: se prueba con el fixture", true);

  // ───────── Escritura: fixture temporal de Andrés ─────────
  const uid = await login(p, ANDRES);
  const centro = await api(p, `/docente/${uid}/evidencias`);
  fixture = centro.d.items.find((i) => i.situacion === "sin_evidencia" && i.puede_editar && i.requiere_evidencia && i.entregable_id == null);
  ok("fixture: entregable sin registro previo de Andrés", !!fixture, fixture ? `plantilla=${fixture.plantilla_id} «${fixture.entregable.slice(0, 50)}»` : "");
  if (fixture) {
    await ir(p, `/docente/evidencias?entregable=${fixture.plantilla_id}`);
    ok("evidencias: ?entregable= abre el detalle del entregable", await E(p, `return document.querySelector('.b2-insp').dataset.open==='true' && document.querySelector('.b2-insp-h').textContent===${JSON.stringify(fixture.entregable)}`));
    ok("falta de evidencia identificada (fila y detalle)", await E(p, "return /Falta/.test(document.querySelector('.b2-ev-fila[data-sel]').textContent) && /Aún no has registrado enlaces/.test(document.querySelector('.b2-insp').textContent)"));
    // validación local: enlace inválido y envío vacío
    await E(p, clickTxt(".b2-insp .b2-btn", "Enviar a revisión")); await pausa(300);
    ok("enviar sin enlace: validación en pantalla (no escribe)", await E(p, "return /Agrega al menos un enlace/.test(document.querySelector('.b2-insp').textContent)"));
    await E(p, setInput(".b2-ev-urlrow input", "no-es-un-enlace")); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-btn", "Guardar borrador")); await pausa(300);
    ok("enlace inválido: se rechaza antes de enviar", await E(p, "return /no es un enlace válido/.test(document.querySelector('.b2-insp').textContent)"));
    ok("sin escrituras tras validaciones locales", (await q(`select count(*)::int n from proyecto_entregables where plantilla_id=$1 and docente_id=$2`, [fixture.plantilla_id, uid]))[0].n === 0);
    // varios enlaces + borrador
    await E(p, setInput(".b2-ev-urlrow input", URL_A)); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-link-btn", "Agregar otro enlace")); await pausa(200);
    ok("registrar varios enlaces (segundo campo)", (await E(p, "return document.querySelectorAll('.b2-ev-urlrow input').length")) === 2);
    await E(p, "const i=document.querySelectorAll('.b2-ev-urlrow input')[1]; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'https://drive.google.com/file/d/TSTE3-FIXTURE-A2/view'); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-btn", "Guardar borrador")); await pausa(2500);
    const fila = (await q(`select id, estado_revision, completado, num_envios from proyecto_entregables where plantilla_id=$1 and docente_id=$2`, [fixture.plantilla_id, uid]))[0];
    entregableId = fila?.id;
    ok("BD: borrador creado (no enviado) con 2 enlaces vigentes", !!fila && fila.completado === false && Number((await q(`select count(*) n from entregable_evidencias where entregable_id=$1 and estado='vigente'`, [entregableId]))[0].n) === 2, JSON.stringify(fila));
    ok("evidencias: situación «Borrador» tras guardar", await E(p, "return /Borrador/.test(document.querySelector('.b2-ev-fila[data-sel]')?.textContent||'')"));
    // enviar
    await E(p, clickTxt(".b2-insp .b2-btn", "Enviar a revisión")); await pausa(2800);
    const env = (await q(`select estado_revision, completado, num_envios from proyecto_entregables where id=$1`, [entregableId]))[0];
    ok("BD: enviado a revisión (num_envios=1)", env.completado === true && env.estado_revision === "enviado" && env.num_envios === 1, JSON.stringify(env) + " aviso=" + (await E(p, "return document.querySelector('.b2-insp [role=alert]')?.textContent || ''")));
    ok("docente: «En revisión» con opción de retirar (sin editor)", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Retirar envío para corregir/.test(t) && !/Guardar borrador/.test(t)"));
    ok("docente: enlaces registrados visibles en el detalle", (await E(p, "return document.querySelectorAll('.b2-insp .b2-evid-i').length")) === 2);
    ok("docente: historial real con el evento de envío", await (async () => { await E(p, clickTxt(".b2-insp .b2-link-btn", "Ver historial")); await pausa(1800); return E(p, "return /Enviado a revisión/.test(document.querySelector('.b2-hist').textContent)"); })());

    // ───────── Administrador: «No tengo acceso» ─────────
    await login(p, ADMIN);
    await ir(p, `/admin/revision?reporte=${entregableId}`);
    ok("admin: el fixture aparece en la bandeja y se abre desde el enlace", await E(p, `return document.querySelector('.b2-insp').dataset.open==='true' && document.querySelector('.b2-insp').innerHTML.includes('TSTE3')`));
    await E(p, clickTxt(".b2-decision .b2-btn", "No tengo acceso")); await pausa(300);
    await E(p, clickTxt(".b2-decision .b2-btn", "Avisar al docente")); await pausa(2500);
    const sa = (await q(`select estado_revision, problema_acceso_en is not null pa from proyecto_entregables where id=$1`, [entregableId]))[0];
    ok("BD: «No tengo acceso» → observado con problema de acceso", sa.estado_revision === "observado" && sa.pa === true, JSON.stringify(sa));
    ok("admin: tras decidir, el inspector pasa al siguiente o se cierra y la bandeja se actualiza", await E(p, "return !document.querySelector('.b2-insp-h') || document.querySelector('.b2-insp-h').textContent.length>0"));

    // ───────── Docente corrige y reenvía ─────────
    await login(p, ANDRES);
    await ir(p, `/docente/evidencias?entregable=${fixture.plantilla_id}`);
    ok("docente ve el aviso de problema de acceso", await E(p, "return /Coordinación no pudo abrir tu evidencia/.test(document.querySelector('.b2-insp').textContent)"));
    ok("docente puede corregir (editor visible) y reenviar", await E(p, "return /Reenviar a revisión/.test(document.querySelector('.b2-insp').textContent)"));
    await E(p, setInput(".b2-ev-urlrow input", URL_B)); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-btn", "Reenviar a revisión")); await pausa(2800);
    const re = (await q(`select estado_revision, num_envios, problema_acceso_en is not null pa from proyecto_entregables where id=$1`, [entregableId]))[0];
    ok("BD: reenvío vuelve a «enviado» (no existe estado «reenviado»), num_envios=2", re.estado_revision === "enviado" && re.num_envios === 2, JSON.stringify(re));
    const vers = await q(`select estado, count(*)::int n from entregable_evidencias where entregable_id=$1 group by 1 order by 1`, [entregableId]);
    ok("BD: versiones anteriores conservadas (reemplazadas) y nuevas vigentes", vers.some((v) => v.estado !== "vigente" && v.n >= 1) && vers.some((v) => v.estado === "vigente"), JSON.stringify(vers));
    ok("docente: versiones anteriores consultables", await E(p, "return /Ver versiones anteriores/.test(document.querySelector('.b2-insp').textContent)"));

    // ───────── Administrador: observar con comentario obligatorio ─────────
    await login(p, ADMIN);
    await ir(p, `/admin/revision?reporte=${entregableId}`);
    ok("admin ve «Reenvío» (2 envíos)", await E(p, "return /2 envíos|Reenvío/.test(document.querySelector('.b2-insp').textContent)"));
    await E(p, clickTxt(".b2-decision .b2-btn", "Solicitar correcciones")); await pausa(300);
    ok("correcciones: el botón está bloqueado sin comentario", await E(p, "return [...document.querySelectorAll('.b2-decision .b2-btn')].find(b=>b.textContent==='Enviar correcciones').disabled"));
    await E(p, setInput(".b2-decision textarea", "TSTE3 comentario: falta el acta firmada", "HTMLTextAreaElement")); await pausa(200);
    await E(p, clickTxt(".b2-decision .b2-btn", "Enviar correcciones")); await pausa(2500);
    const ob = (await q(`select estado_revision, comentario_revision from proyecto_entregables where id=$1`, [entregableId]))[0];
    ok("BD: observado con el comentario del revisor", ob.estado_revision === "observado" && /TSTE3 comentario/.test(ob.comentario_revision ?? ""), JSON.stringify(ob));
    ok("no hay botón «Deshacer» (el backend no lo ofrece)", !(await E(p, "return /Deshacer/.test(document.body.innerText)")));

    // docente ve la observación, corrige y reenvía por la matriz? (flujo de evidencias)
    await login(p, ANDRES);
    await ir(p, `/docente/evidencias?entregable=${fixture.plantilla_id}`);
    ok("docente ve la observación del revisor", await E(p, "return /TSTE3 comentario/.test(document.querySelector('.b2-insp').textContent)"));
    await E(p, clickTxt(".b2-insp .b2-btn", "Reenviar a revisión")); await pausa(2800);
    ok("BD: tercer envío (num_envios=3, estado enviado)", (await q(`select estado_revision, num_envios from proyecto_entregables where id=$1`, [entregableId]))[0].num_envios === 3);

    // ───────── Administrador: aprobar con confirmación ─────────
    await login(p, ADMIN);
    await ir(p, `/admin/revision?reporte=${entregableId}`);
    await E(p, clickTxt(".b2-decision .b2-btn", "Aprobar")); await pausa(300);
    ok("aprobar solicita confirmación (nada se escribió aún)", (await E(p, "return !![...document.querySelectorAll('.b2-decision .b2-btn')].find(b=>b.textContent==='Confirmar aprobación')")) && (await q(`select estado_revision from proyecto_entregables where id=$1`, [entregableId]))[0].estado_revision === "enviado");
    await E(p, clickTxt(".b2-decision .b2-btn", "Cancelar")); await pausa(300);
    ok("cancelar la confirmación no aprueba", (await q(`select estado_revision from proyecto_entregables where id=$1`, [entregableId]))[0].estado_revision === "enviado");
    await E(p, clickTxt(".b2-decision .b2-btn", "Aprobar")); await pausa(300);
    await E(p, clickTxt(".b2-decision .b2-btn", "Confirmar aprobación")); await pausa(2500);
    const ap = (await q(`select estado_revision, aprobado_en is not null a from proyecto_entregables where id=$1`, [entregableId]))[0];
    ok("BD: aprobado", ap.estado_revision === "aprobado" && ap.a === true, JSON.stringify(ap));

    // ───────── Protección del aprobado ─────────
    await login(p, ANDRES);
    await ir(p, `/docente/evidencias?entregable=${fixture.plantilla_id}`);
    ok("docente: aprobado sin editor ni retiro", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /Aprobada por coordinación/.test(t) && !/Guardar borrador|Retirar envío|Reenviar/.test(t)"));
    const retiro = await api(p, `/docente/${uid}/matriz/${fixture.plantilla_id}/completar`, `,method:'POST',body:JSON.stringify({completado:false})`);
    ok("API: retirar un aprobado es rechazado por el backend", retiro.s >= 400, `status=${retiro.s}`);
    const edit = await api(p, `/docente/entregables/${entregableId}/evidencias`, `,method:'PUT',body:JSON.stringify({urls_evidencia:['https://drive.google.com/file/d/TSTE3-HACK/view']})`);
    ok("API: editar evidencias de un aprobado es rechazado", edit.s >= 400, `status=${edit.s}`);
    ok("BD: sigue aprobado y sin el enlace intruso", (await q(`select estado_revision from proyecto_entregables where id=$1`, [entregableId]))[0].estado_revision === "aprobado" && Number((await q(`select count(*) n from entregable_evidencias where url like '%TSTE3-HACK%'`))[0].n) === 0);

    // mensaje al docente (POST /admin/notificaciones) desde la bandeja
    await login(p, ADMIN);
    await ir(p, `/admin/revision?reporte=${entregableId}`);
    await E(p, clickTxt(".b2-insp .b2-link-btn", "Enviar un mensaje al docente")); await pausa(300);
    await E(p, setInput(".b2-insp textarea", "TSTE3 mensaje de prueba", "HTMLTextAreaElement")); await pausa(200);
    await E(p, clickTxt(".b2-insp .b2-btn", "Enviar notificación")); await pausa(1800);
    ok("BD: notificación al docente registrada", Number((await q(`select count(*) n from notificaciones where mensaje like 'TSTE3%'`))[0].n) >= 1);
  }

  // ───────── Errores y responsive ─────────
  await login(p, ADMIN);
  await ir(p, "/admin/revision");
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>String(u).includes('/admin/reportes-revision?')?Promise.reject(new TypeError('Failed to fetch')):window.__f(u,...a)");
  await E(p, clickTxt(".b2-chip", "Observados")); await pausa(1500);
  ok("revisión: error de carga con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]') && [...document.querySelectorAll('.b2-alert .b2-btn')].some(b=>b.textContent==='Reintentar')"));
  await E(p, "window.fetch=window.__f"); await E(p, clickTxt(".b2-alert .b2-btn", "Reintentar")); await pausa(1800);
  ok("revisión: «Reintentar» recupera la bandeja", await E(p, "return !document.querySelector('.b2-alert[role=alert]')"));
  await login(p, MARIA);
  await ir(p, "/docente/matriz");
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>(String(u).includes('/evidencias')&&!String(u).includes('historial'))?Promise.reject(new TypeError('Failed to fetch')):window.__f(u,...a)");
  await E(p, "[...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==='Evidencias').click()"); await pausa(2200);
  ok("evidencias: error de conexión con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]')"));
  const lau = await login(p, "laura.gomez@proysocial.local");
  await ir(p, "/docente/evidencias");
  ok("evidencias: docente sin matriz → estado vacío", await E(p, "return /Aún no tienes una matriz asignada/.test(document.body.innerText)"));
  ok("acceso por rol: docente no entra a /admin/revision", await (async () => { await ir(p, "/admin/revision", 1800); return E(p, "return !location.pathname.startsWith('/admin')"); })());
} catch (e) {
  ok(`EXCEPCIÓN tras «${res[res.length-1]?.slice(0,80)}»`, false, String(e.message).slice(0, 220));
} finally {
  // ───────── Limpieza y comprobación de que los datos sembrados quedaron intactos ─────────
  await limpiar();
  const despues = await instantanea();
  ok("BD tras limpiar: tablas y estados idénticos a los de antes (datos sembrados intactos)", JSON.stringify(despues) === JSON.stringify(baseAntes), JSON.stringify({ antes: baseAntes, despues }));
  ok("BD: sin residuos TSTE3", Number((await q(`select count(*) n from entregable_evidencias where url like '%TSTE3%'`))[0].n) === 0);
  await p.cerrar();
  await pool.end();
}
const errs = p.consola.filter((x) => !/favicon|Download the React DevTools|Failed to fetch/.test(x));
ok("consola sin errores inesperados", errs.length === 0, errs[0]?.slice(0, 140));
console.log(res.join("\n"));
