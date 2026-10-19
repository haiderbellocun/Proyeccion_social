import { lanzar, pausa, iniciarSuite } from "../lib/helpers.mjs";
iniciarSuite("matrices");
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const APP = "http://localhost:5173";
const API = "http://localhost:4000";
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const corta = (iso) => { const [, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MES[m - 1]}`; };
const dias = (a, b) => Math.round((Date.parse(b.slice(0, 10) + "T00:00:00Z") - Date.parse(a.slice(0, 10) + "T00:00:00Z")) / 86400000);

async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(900);
  return EA(p, `const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
async function sesion(ancho, correo, fn) {
  const p = await lanzar({ ancho, alto: ancho < 600 ? 844 : 900 });
  try {
    const uid = await login(p, correo);
    try { await fn(p, uid); } catch (e) { ok(`EXCEPCIÓN en ${ancho}px (${correo.split('@')[0]})`, false, String(e.message).slice(0, 200)); }
    const errs = p.consola.filter((x) => !/favicon|Download the React DevTools/.test(x));
    ok(`${ancho}px (${correo.split("@")[0]}) consola sin errores`, errs.length === 0, errs[0]?.slice(0, 140));
  } finally { await p.cerrar(); }
}
const ir = async (p, ruta, espera = 3200) => { await p.ir(APP + ruta); await pausa(espera); };
const api = (p, ruta) => EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}${ruta}',{headers:{Authorization:'Bearer '+t}}); return JSON.stringify({s:r.status, d:await r.json().catch(()=>null)})`).then((j) => JSON.parse(j));
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
const setInput = (sel, v) => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}))`;
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;

async function suiteMatriz(p, rol, ruta, apiMatriz, apiStats) {
  await ir(p, ruta);
  const m = await api(p, apiMatriz);
  const items = m.d.items;
  const sa = (apiStats ? (await api(p, apiStats)).d : m.d);
  const resumen = sa.resumen ?? m.d.resumen;
  const semana = sa.semana_actual ?? m.d.semana_actual;
  ok(`[${rol}] shell/estructura B2 con tabla y cronograma`, await E(p, "return !!document.querySelector('.b2-gantt .b2-g-head') && !!document.querySelector('.b2-g-body')"));
  // total de entregables
  await E(p, `[...document.querySelectorAll('.b2-tb .b2-btn')].find(b=>/Expandir todo|Contraer todo/.test(b.textContent)).click()`); await pausa(200);
  const hace = await E(p, "return [...document.querySelectorAll('.b2-tb .b2-btn')].find(b=>/Expandir todo|Contraer todo/.test(b.textContent)).textContent");
  if (/Expandir/.test(hace)) { /* ya estaba contraído tras el clic: expandir */ await E(p, `[...document.querySelectorAll('.b2-tb .b2-btn')].find(b=>/Expandir todo/.test(b.textContent)).click()`); }
  await pausa(300);
  // al contraer/expandir todo solo se abren los meses; abrimos fases cerradas
  ok(`[${rol}] contador = total del backend`, (await E(p, "return document.querySelector('.b2-tb-count').textContent")).includes(String(items.length)), `API=${items.length}`);
  ok(`[${rol}] indicadores = /matriz-stats (reportado, aprobado, esperado, exigible, brecha, horas)`, await E(p, `const t=document.querySelector('.b2-mx-stats').textContent; return t.includes('${Math.round(resumen.pct_reportado)}%') && t.includes('${Math.round(resumen.pct_aprobado)}%') && t.includes('${Math.round(resumen.pct_esperado)}%') && t.includes('${resumen.horas_programadas} h') && t.includes('${Math.abs(resumen.brecha_entregables)}')`), `rep=${resumen.pct_reportado} apr=${resumen.pct_aprobado} esp=${resumen.pct_esperado} brecha=${resumen.brecha_entregables}`);
  // semanas del semestre = backend
  const nsem = await E(p, "return document.querySelectorAll('.b2-g-sem').length");
  const cal = semana.fecha_inicio_semestre && semana.fecha_fin_semestre ? Math.max(semana.total_semanas || 0, Math.ceil((dias(semana.fecha_inicio_semestre, semana.fecha_fin_semestre) + 1) / 7)) : null;
  ok(`[${rol}] número de semanas del cronograma = calendario del backend`, cal != null && nsem === cal, `semanas=${nsem} backend=${cal} (total_semanas=${semana.total_semanas})`);
  // semana actual y línea de hoy
  ok(`[${rol}] semana actual resaltada = ${semana.numero}`, await E(p, `return document.querySelector('.b2-g-sem[data-now]')?.textContent.startsWith('S${semana.numero} ')`));
  const esperadoX = (dias(semana.fecha_inicio_semestre, semana.hoy) + 0.5) * 14;
  const medidoX = await E(p, "const l=document.querySelector('.b2-g-linea').getBoundingClientRect(); const h=document.querySelector('.b2-g-hr').getBoundingClientRect(); return l.left + l.width/2 - h.left");
  ok(`[${rol}] línea de hoy en la fecha del backend (${semana.hoy})`, Math.abs(medidoX - esperadoX) < 2, `esperado=${esperadoX} medido=${Math.round(medidoX)}`);
  // fechas y alineación de barras (primer entregable con fechas visible)
  await E(p, `[...document.querySelectorAll('.b2-g-grupo[aria-expanded=false]')].forEach(g=>g.click())`); await pausa(300);
  const muestra = items.filter((i) => i.fecha_inicio_calculada && i.fecha_fin_calculada).slice(0, 25);
  let fechasOk = 0, barrasOk = 0, vistas = 0;
  for (const it of muestra) {
    const r = await E(p, `const h=${JSON.stringify(it.entregable)}; const row=[...document.querySelectorAll('.b2-g-item')].find(x=>x.querySelector('.b2-c-t .b2-tt')?.getAttribute('title')===h); if(!row) return null; const f=[...row.querySelectorAll('.b2-c-f')].map(c=>c.textContent); const b=row.querySelector('.b2-bar'); const hr=document.querySelector('.b2-g-hr').getBoundingClientRect(); const rr=row.getBoundingClientRect(); const bb=b?b.getBoundingClientRect():null; return JSON.stringify({f, left: bb? Math.round(bb.left-hr.left):null, w: bb? Math.round(bb.width):null, dentro: bb? (bb.top>=rr.top && bb.bottom<=rr.bottom):null})`);
    if (!r) continue;
    vistas++;
    const o = JSON.parse(r);
    const [fi, ff] = [corta(it.fecha_inicio_calculada), corta(it.fecha_fin_calculada)];
    if (o.f[o.f.length - 1] === ff && (o.f.length < 2 || o.f[0] === fi)) fechasOk++;
    const ex = dias(semana.fecha_inicio_semestre, it.fecha_inicio_calculada) * 14;
    const ew = (dias(it.fecha_inicio_calculada, it.fecha_fin_calculada) + 1) * 14;
    if (o.dentro && Math.abs(o.left - ex) <= 1 && Math.abs(o.w - ew) <= 1) barrasOk++;
  }
  ok(`[${rol}] fechas de la tabla = fechas del backend`, vistas > 0 && fechasOk === vistas, `${fechasOk}/${vistas}`);
  ok(`[${rol}] barras alineadas con su fila y con la escala de días (inicio y duración)`, vistas > 0 && barrasOk === vistas, `${barrasOk}/${vistas}`);
  // estados / vencidos
  const venc = items.filter((i) => i.vencido).length;
  await E(p, clickTxt(".b2-tb .b2-btn", "Filtros")); await pausa(300);
  await E(p, "[...document.querySelectorAll('.b2-pop .b2-chk')].find(l=>l.textContent.trim()==='Vencidos').querySelector('input').click()"); await pausa(400);
  const nVenc = await E(p, "return document.querySelectorAll('.b2-g-item').length");
  ok(`[${rol}] filtro «Vencidos» = condición vencido del backend`, nVenc === venc, `filas=${nVenc} API=${venc}`);
  const obs = items.filter((i) => i.estado === "observado").length;
  await E(p, "[...document.querySelectorAll('.b2-pop .b2-chk')].find(l=>l.textContent.trim().startsWith('Observado')).querySelector('input').click()"); await pausa(400);
  ok(`[${rol}] filtro «Observado» = estado del backend`, (await E(p, "return document.querySelectorAll('.b2-g-item').length")) === obs, `API=${obs}`);
  await E(p, "[...document.querySelectorAll('.b2-pop .b2-chk')].find(l=>l.textContent.trim()==='Todos').querySelector('input').click()"); await pausa(300);
  // mes y semana
  const mes = items[0].mes;
  await E(p, `const s=document.querySelector('#b2-f-mes'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(mes)}); s.dispatchEvent(new Event('change',{bubbles:true}))`); await pausa(400);
  const nMes = items.filter((i) => i.mes === mes).length;
  ok(`[${rol}] filtro por mes (${mes})`, (await E(p, "return document.querySelectorAll('.b2-g-item').length")) === nMes, `API=${nMes}`);
  await E(p, `const s=document.querySelector('#b2-f-mes'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'todos'); s.dispatchEvent(new Event('change',{bubbles:true}))`); await pausa(300);
  const sem = items[Math.floor(items.length / 2)].semana_numero;
  await E(p, `const s=document.querySelector('#b2-f-sem'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'${sem}'); s.dispatchEvent(new Event('change',{bubbles:true}))`); await pausa(400);
  const nSem = items.filter((i) => i.semana_numero === sem).length;
  ok(`[${rol}] filtro por semana (S${sem})`, (await E(p, "return document.querySelectorAll('.b2-g-item').length")) === nSem, `API=${nSem}`);
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(200);
  await E(p, clickTxt(".b2-tb .b2-btn", "Limpiar filtros")); await pausa(400);
  // búsqueda
  const palabra = items.find((i) => i.entregable.length > 12).entregable.split(" ").find((w) => w.length > 6) || "Anexos";
  await E(p, setInput(".b2-tb-search input", palabra)); await pausa(500);
  const nBus = items.filter((i) => `${i.entregable} ${i.iniciativa_titulo} ${i.numero ?? ""} ${i.fase}`.toLowerCase().includes(palabra.toLowerCase())).length;
  ok(`[${rol}] búsqueda «${palabra}»`, (await E(p, "return document.querySelectorAll('.b2-g-item').length")) === nBus, `API=${nBus}`);
  await E(p, setInput(".b2-tb-search input", "")); await pausa(400);
  // selección + inspector + evidencia + observación
  const conObs = items.find((i) => i.estado === "observado" && i.comentario_revision);
  const conEv = items.find((i) => (i.evidencias?.length || i.url_evidencia));
  const objetivo = conObs || conEv || items[0];
  await E(p, setInput(".b2-tb-search input", objetivo.entregable.slice(0, 30))); await pausa(500);
  await E(p, `[...document.querySelectorAll('.b2-g-item')].find(r=>r.querySelector('.b2-tt')?.getAttribute('title')===${JSON.stringify(objetivo.entregable)}).click()`); await pausa(500);
  ok(`[${rol}] selección abre el inspector con el entregable`, await E(p, `return document.querySelector('.b2-insp').dataset.open==='true' && document.querySelector('.b2-insp-h').textContent===${JSON.stringify(objetivo.entregable)}`));
  ok(`[${rol}] fila seleccionada resaltada`, await E(p, "return getComputedStyle(document.querySelector('.b2-g-row[data-sel]')).backgroundColor==='rgb(237, 234, 245)'"));
  if (conObs) ok(`[${rol}] observaciones de revisión visibles`, await E(p, `return document.querySelector('.b2-insp .b2-callout')?.textContent.includes(${JSON.stringify(conObs.comentario_revision.slice(0, 25))})`));
  if (conEv && objetivo === conEv) { const url = conEv.evidencias?.[0] ?? conEv.url_evidencia; ok(`[${rol}] enlace de evidencia = backend (abre en pestaña nueva, noopener)`, await E(p, `const a=[...document.querySelectorAll('.b2-insp .b2-evid-i a')].find(x=>x.href===${JSON.stringify(url)}); return !!a && a.target==='_blank' && a.rel.includes('noopener')`)); }
  ok(`[${rol}] tabla compacta con el inspector abierto`, await E(p, "return !document.querySelector('.b2-g-hl .b2-c-h')"));
  const hist = objetivo.entregable_id != null;
  if (hist) {
    await E(p, "[...document.querySelectorAll('.b2-insp .b2-link-btn')].find(b=>/historial del entregable/.test(b.textContent)).click()"); await pausa(1800);
    ok(`[${rol}] historial real cargado en el inspector`, await E(p, "const h=document.querySelector('.b2-hist'); return !!h && !/Cargando/.test(h.textContent) && !/No se pudo/.test(h.textContent)"));
  }
  return { items, resumen, semana, objetivo };
}

// ───────── Administrador: matriz de María (88 entregables, observados, evidencias aprobadas) ─────────
await sesion(1440, "admin@proysocial.local", async (p) => {
  const r = await suiteMatriz(p, "admin", "/admin/docentes/2/matriz", "/admin/docentes/2/matriz", "/admin/docentes/2/matriz-stats");
  ok("[admin] acciones administrativas en el inspector", await E(p, "return /Crear excepción|Editar excepción/.test(document.querySelector('.b2-insp').textContent)"));
  await E(p, "[...document.querySelectorAll('.b2-insp .b2-btn')].find(b=>/excepción/i.test(b.textContent)).click()"); await pausa(800);
  ok("[admin] «Crear/Editar excepción» abre el diálogo existente (sin guardar)", await E(p, "return !!document.querySelector('[role=dialog] #exc-motivo')"));
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(500);
  // aprobado: Reabrir
  await E(p, setInput(".b2-tb-search input", "")); await pausa(300);
  const apr = r.items.find((i) => i.estado === "aprobado" && i.entregable_id);
  await E(p, setInput(".b2-tb-search input", apr.entregable.slice(0, 30))); await pausa(500);
  await E(p, `[...document.querySelectorAll('.b2-g-item')].find(r=>r.querySelector('.b2-tt')?.getAttribute('title')===${JSON.stringify(apr.entregable)}).click()`); await pausa(500);
  ok("[admin] un aprobado solo se modifica con «Reabrir» (flujo de reapertura)", await E(p, "return [...document.querySelectorAll('.b2-insp .b2-btn')].some(b=>/Reabrir/.test(b.textContent))"));
  await E(p, "[...document.querySelectorAll('.b2-insp .b2-btn')].find(b=>/Reabrir/.test(b.textContent)).click()"); await pausa(700);
  ok("[admin] «Reabrir» abre el diálogo con motivo obligatorio", await E(p, "return !!document.querySelector('[role=dialog] #reabrir-motivo')"));
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(400);
  // teclado y sincronía
  await E(p, setInput(".b2-tb-search input", "")); await pausa(400);
  await E(p, "document.querySelector('.b2-gantt').focus(); document.querySelector('.b2-gantt').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))"); await pausa(200);
  ok("[admin] teclado: flecha abajo marca una fila", await E(p, "return !!document.querySelector('.b2-g-row[data-sel]')"));
  await E(p, "const g=document.querySelector('.b2-gantt'); g.scrollLeft=400; g.scrollTop=250"); await pausa(300);
  ok("[admin] desplazamiento horizontal: la tabla queda fija y las semanas se mueven", await E(p, "const g=document.querySelector('.b2-gantt').getBoundingClientRect(); const l=document.querySelector('.b2-g-hl').getBoundingClientRect(); const h=document.querySelector('.b2-g-head').getBoundingClientRect(); return Math.abs(l.left-g.left)<2 && Math.abs(h.top-g.top)<2"));
  ok("[admin] vertical: fila de tabla y de cronograma comparten la misma altura/posición", await E(p, "const r=[...document.querySelectorAll('.b2-g-item')].slice(0,8); return r.every(x=>{const a=x.querySelector('.b2-g-l').getBoundingClientRect(); const b=x.querySelector('.b2-g-r').getBoundingClientRect(); return Math.abs(a.top-b.top)<1 && Math.abs(a.height-b.height)<1})"));
  const t0 = Date.now();
  await E(p, "const g=document.querySelector('.b2-gantt'); for(let i=0;i<20;i++){ g.scrollTop = (i*173)%Math.max(1,g.scrollHeight-g.clientHeight); g.scrollLeft=(i*97)%600; }");
  ok("[admin] rendimiento: 20 desplazamientos rápidos sin bloquear", Date.now() - t0 < 1500, `${Date.now() - t0} ms; filas=${await E(p, "return document.querySelectorAll('.b2-g-row').length")}`);
  // Hoy y zoom
  await E(p, "document.querySelector('.b2-gantt').scrollLeft=0"); await E(p, clickTxt(".b2-tb .b2-btn", "Hoy")); await pausa(300);
  ok("[admin] «Hoy» centra la línea de hoy", await E(p, "const g=document.querySelector('.b2-gantt').getBoundingClientRect(); const l=document.querySelector('.b2-g-linea').getBoundingClientRect(); return l.left>g.left+200 && l.right<g.right"));
  await E(p, clickTxt(".b2-seg button", "Mensual")); await pausa(300);
  ok("[admin] escala mensual más corta que la semanal", (await E(p, "return document.querySelector('.b2-g-hr').getBoundingClientRect().width")) < 700);
  // docente sin matriz
  await ir(p, "/admin/docentes/5/matriz");
  ok("[admin] docente sin matriz: estado vacío claro", await E(p, "return /no tiene entregables asignados/.test(document.body.innerText)"));
  // docente no válido
  await ir(p, "/admin/docentes/abc/matriz");
  ok("[admin] identificador no válido: mensaje y salida", await E(p, "return /Docente no válido/.test(document.body.innerText)"));
  // error de conexión + calendario inválido (simulados en el navegador, sin tocar datos)
  await ir(p, "/admin/avance");
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>String(u).includes('/admin/docentes/2/matriz')?Promise.reject(new TypeError('Failed to fetch')):window.__f(u,...a)");
  await E(p, "history.pushState({}, '', '/admin/docentes/2/matriz'); window.dispatchEvent(new PopStateEvent('popstate'))"); await pausa(2200);
  ok("[admin] error de conexión: aviso con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]') && [...document.querySelectorAll('.b2-alert .b2-btn')].some(b=>b.textContent==='Reintentar')"));
  await E(p, "window.fetch=(u,...a)=>{ if(String(u).includes('/admin/docentes/2/matriz-stats')) return window.__f(u,...a).then(async r=>{const d=await r.json(); d.semana_actual={estado:'sin_calendario',semestre:null,hoy:d.hoy,numero:null,total_semanas:null,advertencia:'Semestre sin calendario válido.'}; return new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json'}})}); return window.__f(u,...a)}");
  await E(p, "[...document.querySelectorAll('.b2-alert .b2-btn')].find(b=>b.textContent==='Reintentar').click()"); await pausa(2500);
  ok("[admin] semestre sin calendario válido: el cronograma usa las fechas de los entregables y lo avisa", await E(p, "return !!document.querySelector('.b2-mx-aviso') && !document.querySelector('.b2-g-linea') && document.querySelectorAll('.b2-g-sem').length>0"));
});

// ───────── Docente María ─────────
await sesion(1440, "maria.rodriguez@proysocial.local", async (p, uid) => {
  const r = await suiteMatriz(p, "docente", "/docente/matriz", `/docente/${uid}/matriz`, `/docente/${uid}/matriz-stats`);
  ok("[docente] la matriz vive en el shell B2 del docente (una cabecera, sin barra lateral Tinta)", await E(p, "return !!document.querySelector('.b2-root .b2-hd') && !document.querySelector('aside.tinta-side, nav[aria-label*=Navegaci]') && ![...document.querySelectorAll('.b2-hd-mod')].some(a=>(a.getAttribute('href')||'').startsWith('/admin'))"));
  ok("[docente] inspector con acciones del flujo real (envío/corrección o estado)", await E(p, "return !!document.querySelector('.b2-insp .b2-acc-form')"));
  // validación local de envío sin evidencia (no envía nada)
  const pend = r.items.find((i) => (i.estado === "no_iniciado" || i.estado === "borrador") && i.requiere_evidencia);
  if (pend) {
    await E(p, setInput(".b2-tb-search input", pend.entregable.slice(0, 30))); await pausa(500);
    await E(p, `[...document.querySelectorAll('.b2-g-item')].find(r=>r.querySelector('.b2-tt')?.getAttribute('title')===${JSON.stringify(pend.entregable)}).click()`); await pausa(500);
    await E(p, "[...document.querySelectorAll('.b2-insp .b2-btn')].find(b=>/Enviar para revisión/.test(b.textContent)).click()"); await pausa(400);
    ok("[docente] enviar sin evidencia: validación en pantalla (no se envía)", await E(p, "return /Agrega el enlace de la evidencia/.test(document.querySelector('.b2-insp').textContent)"));
    ok("[docente] «Reportar con descripción y avance» lleva al flujo real", await E(p, "return [...document.querySelectorAll('.b2-insp .b2-btn')].some(b=>/Reportar con descripción/.test(b.textContent))"));
  }
  const apr = r.items.find((i) => i.estado === "aprobado");
  await E(p, setInput(".b2-tb-search input", apr.entregable.slice(0, 30))); await pausa(500);
  await E(p, `[...document.querySelectorAll('.b2-g-item')].find(r=>r.querySelector('.b2-tt')?.getAttribute('title')===${JSON.stringify(apr.entregable)}).click()`); await pausa(500);
  ok("[docente] aprobado: bloqueado, sin formulario de envío", await E(p, "return /no puede modificarse/.test(document.querySelector('.b2-insp').textContent) && !/Enviar para revisión/.test(document.querySelector('.b2-insp').textContent)"));
  const obs = r.items.find((i) => i.estado === "observado");
  if (obs) {
    await E(p, setInput(".b2-tb-search input", obs.entregable.slice(0, 30))); await pausa(500);
    await E(p, `[...document.querySelectorAll('.b2-g-item')].find(r=>r.querySelector('.b2-tt')?.getAttribute('title')===${JSON.stringify(obs.entregable)}).click()`); await pausa(500);
    ok("[docente] observado: ofrece «Reenviar corrección» (el reenvío vuelve a revisión)", await E(p, "return [...document.querySelectorAll('.b2-insp .b2-btn')].some(b=>/Reenviar corrección/.test(b.textContent))"));
  }
  // deep link desde notificación
  await ir(p, `/docente/matriz?plantilla=${obs ? obs.id : r.items[3].id}`);
  ok("[docente] enlace ?plantilla= abre el inspector del entregable", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true'"));
  ok("[docente] y deja visible su fila", await E(p, "const f=document.querySelector('.b2-g-row[data-sel]'); if(!f) return false; const g=document.querySelector('.b2-gantt').getBoundingClientRect(); const r=f.getBoundingClientRect(); return r.top>=g.top && r.bottom<=g.bottom"));
  // no puede ver la matriz de otro docente por la ruta admin
  await ir(p, "/admin/docentes/3/matriz", 1800);
  ok("[docente] no accede a la matriz administrativa", await E(p, "return !location.pathname.startsWith('/admin')"));
});

// ───────── Otros docentes: Carlos (con matriz distinta) y Laura (sin matriz) ─────────
for (const [correo, nombre] of [["carlos.mendoza@proysocial.local", "Carlos"], ["andres.torres@proysocial.local", "Andres"], ["laura.gomez@proysocial.local", "Laura"]]) {
  await sesion(1280, correo, async (p, uid) => {
    await ir(p, "/docente/matriz");
    const m = await api(p, `/docente/${uid}/matriz`);
    const n = m.d.items?.length ?? 0;
    if (n > 0) {
      ok(`[${nombre}] total = backend (${n}) y sin desborde`, (await E(p, "return document.querySelector('.b2-tb-count').textContent")).includes(String(n)) && (await sinDesborde(p)));
      ok(`[${nombre}] matriz con cronograma y columnas esenciales a 1280`, await E(p, "return !!document.querySelector('.b2-g-hr') && !!document.querySelector('.b2-g-hl .b2-c-e')"));
    } else {
      ok(`[${nombre}] sin matriz asignada: estado vacío explicativo`, await E(p, "return /Todavía no tienes entregables asignados/.test(document.body.innerText)") && (await sinDesborde(p)));
    }
  });
}

// ───────── Responsive ─────────
await sesion(820, "admin@proysocial.local", async (p) => {
  await ir(p, "/admin/docentes/2/matriz");
  ok("820: sin desborde", await sinDesborde(p));
  ok("820: navegación inferior B2 y cronograma visibles", await E(p, "return getComputedStyle(document.querySelector('.b2-bnav')).display==='flex' && !!document.querySelector('.b2-g-hr')"));
  await E(p, "document.querySelector('.b2-g-item').click()"); await pausa(500);
  ok("820: inspector como cajón lateral", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && r.right<=innerWidth+1 && r.left>0"));
});
await sesion(390, "admin@proysocial.local", async (p) => {
  await ir(p, "/admin/docentes/2/matriz");
  ok("390 admin: sin desborde", await sinDesborde(p));
  ok("390 admin: lista móvil (no Gantt)", await E(p, "return !!document.querySelector('.b2-ml') && !document.querySelector('.b2-gantt .b2-g-head')"));
  ok("390 admin: semana actual identificada", await E(p, "return document.querySelector('.b2-ml-tag')?.textContent==='Semana actual'"));
  await E(p, "document.querySelector('[aria-label=\"Periodo anterior\"]').click()"); await pausa(300);
  ok("390 admin: otra semana → «Consultando» + «Volver a hoy»", await E(p, "return document.querySelector('.b2-ml-tag').textContent==='Consultando' && !!document.querySelector('.b2-ml-hoy .b2-btn-primary')"));
  await E(p, "document.querySelector('.b2-ml-hoy .b2-btn-primary').click()"); await pausa(300);
  ok("390 admin: «Volver a hoy» regresa a la semana actual", await E(p, "return document.querySelector('.b2-ml-tag').textContent==='Semana actual'"));
  await E(p, clickTxt(".b2-seg button", "Mes")); await pausa(300);
  ok("390 admin: modo Mes", await E(p, "return /octubre/i.test(document.querySelector('.b2-ml-per strong').textContent)"));
  await E(p, "document.querySelector('[aria-label=\"Periodo anterior\"]').click()"); await pausa(300);
  await E(p, "document.querySelector('.b2-ml-i')?.click()"); await pausa(500);
  ok("390 admin: inspector como hoja inferior", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && Math.abs(r.bottom-innerHeight)<2 && r.width>=innerWidth-2"));
  ok("390 admin: etiquetas inferiores completas y táctiles ≥ 40 px", await E(p, "return [...document.querySelectorAll('.b2-bnav a')].every(a=>a.getBoundingClientRect().height>=40) && [...document.querySelectorAll('.b2-bnav a span')].every(s=>s.scrollWidth<=s.clientWidth+1)"));
});
// ───────── Móvil (390 px): periodos con y sin entregables, elegidos con la API real (sin semanas fijas) ─────────
// La lista móvil muestra los entregables cuyo rango de fechas calculadas toca la semana consultada. Los escenarios se eligen
// con las mismas fechas del backend (calendario del semestre activo, America/Bogota): nunca se supone que el periodo anterior
// tenga entregables ni se fija un número de semana. Si ningún docente de prueba ofrece el escenario, la prueba FALLA indicando
// que falta el escenario (no se marca como aprobada sin haber validado el inspector).
const DOCENTES_MOVIL = ["maria.rodriguez@proysocial.local", "carlos.mendoza@proysocial.local", "andres.torres@proysocial.local"];
async function datosApi(correo) {
  const lg = await (await fetch(`${API}/auth/dev/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo }) })).json();
  const h = { Authorization: `Bearer ${lg.token}` };
  const m = await (await fetch(`${API}/docente/${lg.user.id}/matriz`, { headers: h })).json();
  const st = await (await fetch(`${API}/docente/${lg.user.id}/matriz-stats`, { headers: h })).json();
  const sa = st.semana_actual ?? m.semana_actual;
  const items = m.items ?? [];
  if (!sa?.fecha_inicio_semestre || !sa?.fecha_fin_semestre || sa.numero == null || !items.length) return { correo, sinCalendario: true };
  const ini = sa.fecha_inicio_semestre;
  const NS = Math.max(sa.total_semanas || 0, Math.ceil((dias(ini, sa.fecha_fin_semestre) + 1) / 7));
  const delSemana = (w) => items
    .filter((i) => i.fecha_inicio_calculada && i.fecha_fin_calculada && dias(ini, i.fecha_fin_calculada) >= (w - 1) * 7 && dias(ini, i.fecha_inicio_calculada) <= (w - 1) * 7 + 6)
    .sort((x, y) => (x.fecha_fin_calculada ?? "").localeCompare(y.fecha_fin_calculada ?? ""));
  const semanas = Array.from({ length: NS }, (_, k) => k + 1);
  const cerca = (ws) => ws.sort((x, y) => Math.abs(x - sa.numero) - Math.abs(y - sa.numero) || x - y);
  const conItems = cerca(semanas.filter((w) => delSemana(w).length > 0));
  const vacias = cerca(semanas.filter((w) => delSemana(w).length === 0));
  return { correo, semHoy: sa.numero, hoy: sa.hoy, NS, delSemana, conItems, vacias };
}
const semanaMostrada = (p) => E(p, "return Number(document.querySelector('.b2-ml-per strong').textContent.replace(/\\D/g, ''))");
async function irASemana(p, destino) {
  for (let k = 0; k < 40; k += 1) {
    const cur = await semanaMostrada(p);
    if (cur === destino) return true;
    await E(p, `document.querySelector('[aria-label="${cur < destino ? "Periodo siguiente" : "Periodo anterior"}"]').click()`); await pausa(150);
  }
  return false;
}
const escenarios = [];
for (const correo of DOCENTES_MOVIL) escenarios.push(await datosApi(correo));
const conEntregables = escenarios.find((e) => !e.sinCalendario && e.conItems.length > 0);
const conVacio = escenarios.find((e) => !e.sinCalendario && e.vacias.length > 0 && e.semHoy != null);

if (!conEntregables) {
  ok("390 docente: inspector con acciones del flujo real", false, "FALTA ESCENARIO: ningún docente de prueba tiene entregables con fechas en el semestre activo");
} else {
  const { correo, semHoy, delSemana } = conEntregables;
  // Prefiere un periodo distinto del actual (ejercita la navegación); si solo hoy tiene entregables, usa hoy.
  const destino = conEntregables.conItems.find((w) => w !== semHoy) ?? semHoy;
  const esperados = delSemana(destino);
  await sesion(390, correo, async (p) => {
    await ir(p, "/docente/matriz");
    ok("390 docente: sin desborde", await sinDesborde(p));
    ok("390 docente: lista móvil y semana actual", await E(p, `return !!document.querySelector('.b2-ml') && document.querySelector('.b2-ml-tag')?.textContent==='Semana actual' && Number(document.querySelector('.b2-ml-per strong').textContent.replace(/\\D/g,''))===${semHoy}`));
    ok(`390 docente: navega al periodo con entregables (semana ${destino}, elegida desde la API)`, await irASemana(p, destino) && (await semanaMostrada(p)) === destino);
    ok("390 docente: el periodo consultado se identifica", await E(p, `return document.querySelector('.b2-ml-tag').textContent===${JSON.stringify(destino === semHoy ? "Semana actual" : "Consultando")}`));
    const nombres = await E(p, "return [...document.querySelectorAll('.b2-ml-i .b2-ml-n')].map(n=>n.textContent.trim())");
    ok(`390 docente: la lista del periodo coincide con la API (${esperados.length} entregables, mismo orden)`, JSON.stringify(nombres) === JSON.stringify(esperados.map((i) => i.entregable.trim())), `UI=${nombres.length} API=${esperados.length}`);
    const limites = await E(p, "return [...document.querySelectorAll('.b2-ml-i .b2-ml-f')].map(n=>n.textContent)");
    ok("390 docente: la fecha límite de cada entregable coincide con la API", limites.length === esperados.length && esperados.every((i, k) => limites[k].includes(corta(i.fecha_fin_calculada))), limites.slice(0, 2).join(" | "));
    for (let k = 0; k < Math.min(esperados.length, 6); k += 1) {
      const it = esperados[k];
      await E(p, `document.querySelectorAll('.b2-ml-i')[${k}].click()`); await pausa(500);
      const abierto = await E(p, `const i=document.querySelector('.b2-insp'); return i.dataset.open==='true' && i.textContent.includes(${JSON.stringify(it.entregable.trim())}) && !!i.querySelector('.b2-acc-form')`);
      const txt = await E(p, "return document.querySelector('.b2-insp .b2-acc-form')?.innerText ?? ''");
      const btn = (re) => E(p, `return [...document.querySelectorAll('.b2-insp .b2-btn')].some(b=>${re}.test(b.textContent))`);
      let acciones;
      if (it.estado === "aprobado") acciones = /no puede modificarse/.test(txt) && !(await btn("/Enviar para revisión/")) && !(await btn("/Retirar envío/"));
      else if (it.estado === "enviado") acciones = /Envío en revisión/.test(txt) && (await btn("/Retirar envío/")) && !(await btn("/Enviar para revisión/"));
      else if (it.estado === "observado") acciones = /Corregir y reenviar/.test(txt) && (await btn("/Reenviar corrección/"));
      else acciones = /Enviar evidencia/.test(txt) && (await btn("/Enviar para revisión/"));
      ok(`390 docente: inspector del entregable ${k + 1}/${Math.min(esperados.length, 6)} (estado real «${it.estado}»): abre y ofrece las acciones de su estado`, abierto && acciones, `${it.estado} · ${txt.slice(0, 60).replace(/\s+/g, " ")}`);
    }
    ok("390 docente: botones del inspector ≥ 36 px", await E(p, "const b=[...document.querySelectorAll('.b2-insp .b2-btn')]; return b.length>0 && b.every(x=>x.getBoundingClientRect().height>=36)"));
  });
}

if (!conVacio) {
  ok("390 docente: periodo sin entregables", false, "FALTA ESCENARIO: ningún docente de prueba tiene un periodo del semestre sin entregables");
} else {
  const { correo, semHoy, vacias, delSemana, NS } = conVacio;
  const vacia = vacias.find((w) => w !== semHoy) ?? vacias[0];
  await sesion(390, correo, async (p) => {
    await ir(p, "/docente/matriz");
    ok(`390 docente: navega a un periodo sin entregables (semana ${vacia}, elegida desde la API)`, await irASemana(p, vacia) && (await semanaMostrada(p)) === vacia);
    await pausa(300);
    ok("390 docente: periodo vacío muestra su estado vacío", await E(p, "const v=document.querySelector('.b2-ml-vacio'); return !!v && /No hay entregables esta semana/.test(v.textContent)"));
    ok("390 docente: periodo vacío sin entregables ni acciones de entregables inexistentes", await E(p, "return document.querySelectorAll('.b2-ml-i').length===0 && !document.querySelector('.b2-insp[data-open=\"true\"] .b2-acc-form') && ![...document.querySelectorAll('.b2-ml-list .b2-btn')].some(b=>/Enviar|Retirar|Reenviar/.test(b.textContent))"));
    ok("390 docente: periodo vacío sin desborde y sin aviso de error", (await sinDesborde(p)) && await E(p, "return !document.querySelector('.b2-alert[role=alert]')"));
    // Navegar a otro periodo (el contiguo disponible).
    const sentido = vacia < NS ? "Periodo siguiente" : "Periodo anterior";
    const otra = vacia < NS ? vacia + 1 : vacia - 1;
    await E(p, `document.querySelector('[aria-label="${sentido}"]').click()`); await pausa(300);
    ok(`390 docente: puede navegar a otro periodo (semana ${otra})`, (await semanaMostrada(p)) === otra);
    const hay = delSemana(otra).length;
    ok("390 docente: el otro periodo muestra su contenido real (entregables o estado vacío, según la API)", await E(p, `return ${hay > 0} ? document.querySelectorAll('.b2-ml-i').length===${hay} : (document.querySelectorAll('.b2-ml-i').length===0 && !!document.querySelector('.b2-ml-vacio'))`));
    // «Volver a hoy» desde un periodo distinto del actual.
    await irASemana(p, vacia === semHoy ? (vacia < NS ? vacia + 1 : vacia - 1) : vacia);
    ok("390 docente: «Volver a hoy» aparece fuera del periodo actual", await E(p, "return !!document.querySelector('.b2-ml-hoy .b2-btn-primary') && document.querySelector('.b2-ml-tag').textContent==='Consultando'"));
    await E(p, "document.querySelector('.b2-ml-hoy .b2-btn-primary').click()"); await pausa(300);
    ok("390 docente: «Volver a hoy» regresa a la semana actual", await E(p, `return document.querySelector('.b2-ml-tag').textContent==='Semana actual' && Number(document.querySelector('.b2-ml-per strong').textContent.replace(/\\D/g,''))===${semHoy} && !document.querySelector('.b2-ml-hoy')`));
  });
}
console.log(res.join("\n"));
