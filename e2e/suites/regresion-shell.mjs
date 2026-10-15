import { lanzar, pausa, iniciarSuite } from "../lib/helpers.mjs";
iniciarSuite("regresion-shell");
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const APP = "http://localhost:5173";

async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(1000);
  const r = await EA(p, `const x=await fetch('http://localhost:4000/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.rol`);
  return r;
}
async function sesion(ancho, fn, correo = "admin@proysocial.local") {
  const p = await lanzar({ ancho, alto: ancho < 600 ? 844 : 900 });
  try {
    await login(p, correo);
    await fn(p);
    const errs = p.consola.filter((x) => !/favicon|Download the React DevTools/.test(x));
    ok(`${ancho}px consola sin errores`, errs.length === 0, errs[0]?.slice(0, 120));
  } finally { await p.cerrar(); }
}
const ir = async (p, ruta) => { await p.ir(APP + ruta); await pausa(2600); };
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");

await sesion(1440, async (p) => {
  await ir(p, "/admin");
  ok("shell B2 presente", await E(p, "return !!document.querySelector('.b2-root .b2-hd') && !!document.querySelector('.b2-side') && !!document.querySelector('.b2-ctx')"));
  ok("cabecera usa #261E36", await E(p, "return getComputedStyle(document.querySelector('.b2-hd')).backgroundColor==='rgb(38, 30, 54)'"));
  ok("semestre y semana en la barra de contexto", await E(p, "return /2026B/.test(document.querySelector('.b2-ctx').textContent) && /Semana \\d+ de \\d+/.test(document.querySelector('.b2-ctx').textContent)"));
  // datos del backend == datos en pantalla
  const api = await EA(p, "const t=localStorage.getItem('proysocial:token'); const h={Authorization:'Bearer '+t}; const d=await (await fetch('http://localhost:4000/admin/dashboard',{headers:h})).json(); const c=await (await fetch('http://localhost:4000/admin/reportes-revision?estado=enviado&page=1&limit=8',{headers:h})).json(); return JSON.stringify({pend:d.stats.pendientes_revision, rep:d.stats.avance_reportado_promedio, rojo:d.stats.semaforo.rojo, filas:(c.reportes||c.data).length, total:c.pagination.total, docs:d.docentes_recientes.length, notif:null, semana:d.semana_actual.numero})");
  const a = JSON.parse(api);
  ok("«por revisar» coincide con /admin/dashboard", (await E(p, "return document.querySelector('.b2-hero-n').textContent")) === String(a.pend), `API=${a.pend}`);
  ok("filas de la cola coinciden con /admin/reportes-revision", (await E(p, "return document.querySelectorAll('.b2-cola-r').length")) === a.filas, `API=${a.filas}`);
  ok("docentes listados coinciden", (await E(p, "return document.querySelectorAll('.b2-docs')[0].querySelectorAll('.b2-doc').length")) === a.docs, `API=${a.docs}`);
  ok("«en riesgo» coincide con semáforo rojo", (await E(p, "return [...document.querySelectorAll('.b2-kpis-3 > div')].find(d=>/En riesgo/.test(d.textContent)).querySelector('dd').textContent")) === String(a.rojo));
  ok("semana actual = backend", await E(p, `return document.querySelector('.b2-ctx').textContent.includes('Semana ${a.semana} de')`));
  // selección e inspector
  await E(p, "document.querySelector('.b2-cola-r').click()"); await pausa(500);
  ok("selección abre el inspector con evidencias reales", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true' && !!document.querySelector('.b2-insp .b2-evid-i')"));
  ok("enlace de evidencia seguro (noopener)", await E(p, "const a=document.querySelector('.b2-evid-i a'); return !a || (a.rel.includes('noopener') && a.target==='_blank')"));
  await E(p, "document.querySelector('.b2-insp-x').click()"); await pausa(300);
  ok("cerrar inspector", (await E(p, "return document.querySelector('.b2-insp').dataset.open")) === "false");
  await E(p, "document.querySelector('.b2-cola').focus(); document.querySelector('.b2-cola').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); document.querySelector('.b2-cola').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"); await pausa(400);
  ok("teclado: Enter abre el detalle de la fila marcada", (await E(p, "return document.querySelector('.b2-insp').dataset.open")) === "true");
  await E(p, "document.querySelector('.b2-cola').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(300);
  // revisar → navega con ?reporte=
  await E(p, "document.querySelector('.b2-cola-r').click()"); await pausa(300);
  await E(p, "[...document.querySelectorAll('.b2-insp-acc .b2-btn')].find(b=>/Revisar este/.test(b.textContent)).click()"); await pausa(1800);
  ok("«Revisar este entregable» abre /admin/revision?reporte=", await E(p, "return location.pathname==='/admin/revision' && /reporte=\\d+/.test(location.search)"));
  ok("la pantalla de revisión (diseño anterior) sigue funcionando", await E(p, "return document.body.innerText.includes('Revisión de reportes')"));
  // navegación por módulos
  const rutas = [["Seguimiento", "/admin/avance"], ["Revisión", "/admin/revision"], ["Indicadores y reportes", "/admin/indicadores"], ["Administración", "/admin/sistema"], ["Panel", "/admin"]];
  for (const [t, r] of rutas) {
    await E(p, `[...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==${JSON.stringify(t)}).click()`); await pausa(1500);
    ok(`módulo «${t}» → ${r}`, (await E(p, "return location.pathname")) === r && (await E(p, `return [...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==${JSON.stringify(t)}).getAttribute('aria-current')==='page'`)));
  }
  // riel contextual
  await E(p, "[...document.querySelectorAll('.b2-side-i')].find(a=>a.getAttribute('aria-label')==='Avance por docente').click()"); await pausa(1500);
  ok("riel lateral: «Avance por docente» → /admin/avance", (await E(p, "return location.pathname")) === "/admin/avance");
  await ir(p, "/admin/sistema?tab=semestres");
  ok("riel de Administración marca la pestaña activa", await E(p, "return document.querySelector('.b2-side-i[data-active]')?.getAttribute('aria-label')==='Semestres'"));
  await E(p, "[...document.querySelectorAll('.b2-side-i')].find(a=>a.getAttribute('aria-label')==='Escuelas y programas').click()"); await pausa(1200);
  ok("riel de Administración cambia de pestaña (?tab=programas)", (await E(p, "return location.search")) === "?tab=programas");
  // barra de contexto: actualizar solo en panel
  await ir(p, "/admin");
  ok("botón Actualizar visible en el panel", await E(p, "return [...document.querySelectorAll('.b2-ctx-btn')].some(b=>b.textContent.includes('Actualizar'))"));
  await ir(p, "/admin/avance");
  ok("sin botón Actualizar fuera del panel", await E(p, "return ![...document.querySelectorAll('.b2-ctx-btn')].some(b=>b.textContent.includes('Actualizar'))"));
  ok("sin buscador fuera del panel (no hay soporte real)", await E(p, "return !document.querySelector('.b2-hd-search')"));
  // notificaciones
  await ir(p, "/admin");
  await E(p, "document.querySelector('.b2-hd-btn[aria-label^=\"Notificaciones\"]').click()"); await pausa(1500);
  ok("panel de notificaciones real abre", await E(p, "return !!document.querySelector('[role=dialog][aria-label=\"Notificaciones\"]')"));
  const nItems = await E(p, "return document.querySelectorAll('[role=dialog][aria-label=\"Notificaciones\"] li').length");
  const badge = await E(p, "return document.querySelector('.b2-hd-count')?.textContent || '0'");
  ok("contador de la campana coincide con las notificaciones", String(nItems) === badge || badge === "99+", `lista=${nItems} badge=${badge}`);
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(300);
  ok("Esc cierra las notificaciones", !(await E(p, "return !!document.querySelector('[role=dialog][aria-label=\"Notificaciones\"]')")));
  // búsqueda real (docentes + cola por ?q=)
  await E(p, "const i=document.querySelector('.b2-hd-search input'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'Carlos'); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(1500);
  ok("búsqueda filtra docentes y cola", (await E(p, "return document.querySelectorAll('.b2-docs')[0].querySelectorAll('.b2-doc').length")) === 1 && (await E(p, "return [...document.querySelectorAll('.b2-cola-r')].every(r=>/Carlos/.test(r.textContent))")));
  await E(p, "document.querySelector('.b2-hd-clear').click()"); await pausa(1200);
  ok("limpiar búsqueda restablece la cola", (await E(p, "return document.querySelectorAll('.b2-cola-r').length")) >= 5);
  // filtros por docente
  await E(p, "[...document.querySelectorAll('.b2-chip')].find(b=>/Críticos/.test(b.textContent)).click()"); await pausa(300);
  ok("filtro «Críticos» reduce docentes", (await E(p, "return document.querySelectorAll('.b2-docs')[0].querySelectorAll('.b2-doc').length")) <= 2);
  await E(p, "document.querySelector('.b2-docs .b2-doc').click()"); await pausa(1800);
  ok("clic en docente abre su matriz", await E(p, "return /^\\/admin\\/docentes\\/\\d+\\/matriz/.test(location.pathname)"));
  // error y carga
  await ir(p, "/admin/avance");
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>String(u).includes('/admin/dashboard')?new Promise(r=>setTimeout(()=>r(window.__f(u,...a)),1500)):window.__f(u,...a)");
  await E(p, "[...document.querySelectorAll('.b2-hd-mod')].find(a=>a.textContent==='Panel').click()"); await pausa(500);
  ok("estado de carga: esqueleto visible mientras llega la API", await E(p, "return document.querySelectorAll('.b2-skel').length>0"));
  await pausa(2500);
  await E(p, "window.fetch=(u,...a)=>String(u).includes('/admin/dashboard')?Promise.resolve(new Response('{}',{status:500,headers:{'Content-Type':'application/json'}})):window.__f(u,...a)");
  await E(p, "[...document.querySelectorAll('.b2-ctx-btn')].find(b=>b.textContent.includes('Actualizar')).click()"); await pausa(1500);
  ok("estado de error con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]') && [...document.querySelectorAll('.b2-alert .b2-btn')].some(b=>b.textContent==='Reintentar')"));
  await E(p, "window.fetch=window.__f"); await E(p, "[...document.querySelectorAll('.b2-alert .b2-btn')].find(b=>b.textContent==='Reintentar').click()"); await pausa(1800);
  ok("«Reintentar» recupera los datos", await E(p, "return !document.querySelector('.b2-hero-n') ? false : /^\\d+$/.test(document.querySelector('.b2-hero-n').textContent)"));
  // cuenta
  await E(p, "document.querySelector('.b2-hd-user').click()"); await pausa(300);
  ok("menú de perfil: correo, administrar usuarios, cerrar sesión", await E(p, "const t=document.querySelector('.b2-menu').textContent; return /admin@proysocial\\.local/.test(t) && /Administrar usuarios/.test(t) && /Cerrar sesión/.test(t)"));
  await E(p, "[...document.querySelectorAll('.b2-menu-i')].find(b=>/Cerrar sesión/.test(b.textContent)).click()"); await pausa(1500);
  ok("cerrar sesión vuelve al inicio y borra el token", (await E(p, "return location.pathname")) === "/" && (await E(p, "return localStorage.getItem('proysocial:token')")) == null);
});

// Las demás rutas admin con el shell B2
await sesion(1280, async (p) => {
  const rutas = ["/admin", "/admin/revision", "/admin/reportes", "/admin/avance", "/admin/indicadores", "/admin/importar-matriz", "/admin/sistema"];
  for (const r of rutas) {
    await ir(p, r);
    ok(`1280 ${r}: carga, contenido y sin desborde`, (await E(p, "return document.querySelector('.b2-main').innerText.length>40")) && (await sinDesborde(p)));
  }
  await ir(p, "/admin");
  await E(p, "[...document.querySelectorAll('.b2-side-i')].at(-1).click()"); await pausa(400);
  ok("1280: riel expandible muestra etiquetas", await E(p, "return getComputedStyle(document.querySelector('.b2-side-l')).display!=='none' && document.querySelector('.b2-side').getBoundingClientRect().width>150"));
  await ir(p, "/admin");
  ok("1280: el estado expandido persiste al recargar", await E(p, "return document.querySelector('.b2-side').dataset.open==='true'"));
  await E(p, "localStorage.setItem('proysocial:b2-sidebar-open','0')");
});

// Docente: shell anterior intacto
await sesion(1440, async (p) => {
  await ir(p, "/docente");
  ok("docente: usa el mismo shell B2 que el administrador (sin shell Tinta)", await E(p, "return !!document.querySelector('.b2-root .b2-hd') && !!document.querySelector('.b2-side') && !!document.querySelector('.b2-ctx') && !document.querySelector('aside[aria-label=\"Navegación principal\"]')"));
  for (const r of ["/docente", "/docente/matriz", "/docente/proyectos", "/docente/evidencias", "/docente/historial", "/docente/reportar", "/docente/perfil"]) {
    await ir(p, r);
    ok(`docente ${r}: carga`, await E(p, "return document.querySelector('main').innerText.length>30"));
  }
  await ir(p, "/admin");
  ok("docente no accede a /admin (autorización intacta)", await E(p, "return !location.pathname.startsWith('/admin') || !document.querySelector('.b2-root')"));
}, "maria.rodriguez@proysocial.local");

await sesion(820, async (p) => {
  await ir(p, "/admin");
  ok("820: sin desborde", await sinDesborde(p));
  ok("820: navegación inferior visible, menú superior oculto", await E(p, "return getComputedStyle(document.querySelector('.b2-bnav')).display==='flex' && getComputedStyle(document.querySelector('.b2-hd-nav')).display==='none'"));
  await E(p, "document.querySelector('.b2-cola-r').click()"); await pausa(500);
  ok("820: inspector como cajón", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && r.right<=innerWidth+1 && r.left>0"));
});

await sesion(390, async (p) => {
  await ir(p, "/admin");
  ok("390: sin desborde horizontal", await sinDesborde(p));
  ok("390: etiquetas de la barra inferior completas", await E(p, "return [...document.querySelectorAll('.b2-bnav a span')].every(s=>s.scrollWidth<=s.clientWidth+1)"));
  ok("390: objetivos táctiles ≥ 40 px (barra inferior y cabecera)", await E(p, "return [...document.querySelectorAll('.b2-bnav a, .b2-hd-btn')].every(a=>{const r=a.getBoundingClientRect(); return r.height>=40 && r.width>=40})"));
  ok("390: botones principales ≥ 40 px de alto", await E(p, "return [...document.querySelectorAll('.b2-pg-acc .b2-btn')].every(b=>b.getBoundingClientRect().height>=40)"));
  ok("390: filtros de docentes ≥ 32 px", await E(p, "return [...document.querySelectorAll('.b2-chip')].every(b=>b.getBoundingClientRect().height>=32)"));
  await E(p, "document.querySelector('.b2-cola-r').click()"); await pausa(500);
  ok("390: inspector como hoja inferior", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return Math.abs(r.bottom-innerHeight)<2 && r.width>=innerWidth-2"));
  await E(p, "document.querySelector('.b2-insp-x').click()"); await pausa(300);
  await E(p, "[...document.querySelectorAll('.b2-bnav a')].find(a=>/Revisión/.test(a.textContent)).click()"); await pausa(1500);
  ok("390: navegación inferior cambia de módulo", (await E(p, "return location.pathname")) === "/admin/revision");
  ok("390: /admin/revision sin desborde", await sinDesborde(p));
});
console.log(res.join("\n"));
