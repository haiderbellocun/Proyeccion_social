// Etapa 4C: Administración B2 (seis pestañas) contra la app real y proysocial_dev.
// Escrituras solo con fixtures sintéticos TSTA4C (y semestres 2098A/2097A); se limpian y se compara la BD antes/después.
// Uso: npm run e2e -- administracion        (ADM_SOLO=6a,6b para ejecutar solo algunas secciones al depurar)
import { lanzar, pausa, iniciarSuite, guardaBD, instantanea, login, api, ir, E, EA, linea, APP, ADMIN } from "../lib/helpers.mjs";
iniciarSuite("administracion");
const { pool, q } = await guardaBD();
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));
const DOC = { Maria: "maria.rodriguez@proysocial.local" };
const SOLO = (process.env.ADM_SOLO || "").split(",").filter(Boolean);
const quiere = (id) => SOLO.length === 0 || SOLO.includes(id);
const TABS = [["usuarios", "Usuarios"], ["semestres", "Semestres"], ["programas", "Escuelas y programas"], ["proyectos", "Iniciativas"], ["tareas", "Tareas semanales"], ["plantillas", "Plantillas"]];

/* ───────── utilidades de interfaz ───────── */
const visible = "x.offsetParent!==null";
/** Clic en el primer botón/enlace visible y habilitado con ese texto exacto (ámbito CSS opcional). Devuelve si lo encontró. */
const clic = (p, txt, ambito = "document") => E(p, `const b=[...${ambito}.querySelectorAll('button,a')].find(x=>${visible}&&!x.disabled&&(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
const existeBtn = (p, txt, ambito = "document") => E(p, `return [...${ambito}.querySelectorAll('button,a')].some(x=>${visible}&&(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(txt)})`);
const btnDeshabilitado = (p, txt, ambito = "document") => E(p, `const b=[...${ambito}.querySelectorAll('button')].find(x=>${visible}&&x.textContent.trim()===${JSON.stringify(txt)}); return !!b&&b.disabled`);
/** Escribe en un campo por el texto de su etiqueta (inputs, selects —por valor o texto de opción— y textareas). */
const campo = (p, etq, val) => E(p, `
  const ls=[...document.querySelectorAll('label')].filter(x=>${visible});
  const l=ls.find(x=>x.textContent.replace(/\\s*\\*\\s*$/,'').trim().startsWith(${JSON.stringify(etq)}));
  if(!l) throw new Error('sin campo '+${JSON.stringify(etq)});
  const el=document.getElementById(l.htmlFor); if(!el) throw new Error('sin control '+${JSON.stringify(etq)});
  let v=${JSON.stringify(val)};
  const tag=el.tagName;
  if(tag==='SELECT'){ const o=[...el.options].find(o=>o.value===v||o.textContent.trim()===v)||[...el.options].find(o=>o.textContent.trim().startsWith(v)); if(!o) throw new Error('sin opción '+v+' en '+${JSON.stringify(etq)}+': '+[...el.options].map(o=>o.textContent.trim()).join('|')); v=o.value; }
  const proto=tag==='SELECT'?HTMLSelectElement.prototype:tag==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);
  el.dispatchEvent(new Event(tag==='SELECT'?'change':'input',{bubbles:true}));`);
const valorCampo = (p, etq) => E(p, `const l=[...document.querySelectorAll('label')].filter(x=>${visible}).find(x=>x.textContent.replace(/\\s*\\*\\s*$/,'').trim().startsWith(${JSON.stringify(etq)})); if(!l) return null; const el=document.getElementById(l.htmlFor); return el?el.value:null`);
/** Marca/desmarca un checkbox o radio por el texto de su etiqueta. */
const marcar = (p, txt, estado = true) => E(p, `const l=[...document.querySelectorAll('label')].filter(x=>${visible}).find(x=>x.textContent.trim().startsWith(${JSON.stringify(txt)})); if(!l) throw new Error('sin casilla '+${JSON.stringify(txt)}); const i=l.querySelector('input'); if(i.checked!==${estado}) i.click(); return i.checked`);
const guardar = (p) => E(p, `const b=document.querySelector('.b2-form-pie button[type=submit]'); if(!b||b.disabled) return false; b.click(); return true`);
const erroresForm = (p) => E(p, `return [...document.querySelectorAll('.b2-campo-e')].map(e=>e.textContent.trim())`);
const inspAbierto = (p) => E(p, "return !!document.querySelector('aside.b2-insp[data-open=\"true\"]')");
const inspTexto = (p) => E(p, "return document.querySelector('aside.b2-insp[data-open=\"true\"]')?.innerText ?? ''");
const toasts = (p) => E(p, "return [...document.querySelectorAll('[data-sonner-toast]')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())");
const esperarToast = async (p, re, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await toasts(p)).some((t) => re.test(t))) return true; await pausa(200); } return false; };
const dialogo = (p) => E(p, "const d=document.querySelector('dialog.b2-adm-dlg[open]'); return d?d.innerText.replace(/\\s+/g,' ').trim():null");
const confirmar = (p, txt) => E(p, `const d=document.querySelector('dialog.b2-adm-dlg[open]'); const b=d&&[...d.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
const filas = (p) => E(p, "return document.querySelectorAll('.b2-tabla-r').length");
const textoFilas = (p) => E(p, "return [...document.querySelectorAll('.b2-tabla-r')].map(r=>r.innerText.replace(/\\s+/g,' ').trim())");
const clicFila = (p, txt) => E(p, `const r=[...document.querySelectorAll('.b2-tabla-r')].find(x=>x.innerText.includes(${JSON.stringify(txt)})); if(!r) return false; r.click(); return true`);
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
const tecla = async (p, key, code, vk) => { await p.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk }); await p.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); };
const esperar = (p, expr, etiqueta, ms = 8000) => p.esperar(expr, { ms, etiqueta }).then(() => true).catch(() => false);
const marcaConsola = (p) => p.consola.length;
const consolaDesde = (p, n) => p.consola.slice(n);
const esperaCarga = async (p) => { await esperar(p, "!document.querySelector('.b2-skel') ", "fin de la carga", 10000); await pausa(300); };
const irAdm = async (p, tab, extra = "") => { await ir(p, `/admin/sistema?tab=${tab}${extra}`, 1500); await esperaCarga(p); };

const cuenta = async (tabla, donde = "true", params = []) => Number((await q(`select count(*)::int n from ${tabla} where ${donde}`, params))[0].n);
const campoInput = (p, aria, val) => E(p, `const i=document.querySelector('input[aria-label=${JSON.stringify(aria)}]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(val)}); i.dispatchEvent(new Event('input',{bubbles:true}))`);
const abrirFila = async (p, txt) => { const o = await clicFila(p, txt); await pausa(700); return o && await inspAbierto(p); };
const cancelarForm = async (p) => { await clic(p, "Cancelar", "document.querySelector('aside.b2-insp[data-open=\"true\"]')"); await pausa(500); };

/* ───────── fixtures y limpieza ───────── */
const FX = "TSTA4C";
const MAIL = "tsta4c.docente@proysocial.local";
async function conteos() {
  const t = { ...(await instantanea(q)) };
  for (const tabla of ["usuarios", "escuelas", "programas", "proyectos", "proyecto_semanas", "proyecto_docentes", "grupos_matriz", "plantilla_entregables", "semestres"]) t[tabla] = Number((await q(`select count(*)::int n from ${tabla}`))[0].n);
  t.activo = JSON.stringify(await q("select codigo from semestres where activo"));
  t.grupo_docentes = JSON.stringify(await q("select id, grupo_matriz_id, programa_id, estado from usuarios order by id").then((r) => r.filter((u) => u.id <= 5)));
  return t;
}
async function limpiar() {
  // Orden inverso a las dependencias; solo filas con el prefijo del fixture o los semestres sintéticos.
  const ids = (await q(`select id from proyectos where titulo like '${FX}%'`)).map((r) => r.id);
  for (const id of ids) {
    await q(`delete from proyecto_entregables where proyecto_semana_id in (select id from proyecto_semanas where proyecto_id=$1)`, [id]);
    await q(`delete from proyecto_docentes where proyecto_id=$1`, [id]);
    await q(`delete from proyecto_semanas where proyecto_id=$1`, [id]);
    await q(`delete from proyectos where id=$1`, [id]);
  }
  const u = (await q(`select id from usuarios where correo=$1 or nombre like '${FX}%'`, [MAIL])).map((r) => r.id);
  for (const id of u) {
    await q(`update proyectos set docente_responsable_id=null where docente_responsable_id=$1`, [id]).catch(() => {});
    await q(`delete from proyecto_docentes where docente_id=$1`, [id]);
    await q(`delete from usuarios where id=$1`, [id]);
  }
  const g = (await q(`select id from grupos_matriz where nombre like '${FX}%' or semestre in ('2098A','2097A')`)).map((r) => r.id);
  for (const id of g) {
    await q(`update usuarios set grupo_matriz_id=null where grupo_matriz_id=$1`, [id]);
    await q(`delete from plantilla_entregables where grupo_id=$1`, [id]);
    await q(`delete from grupos_matriz where id=$1`, [id]);
  }
  await q(`delete from semestres where codigo in ('2098A','2097A') and not activo`);
  await q(`delete from programas where nombre like '${FX}%' or codigo like '${FX}%'`);
  await q(`delete from escuelas where nombre like '${FX}%' or codigo like '${FX}%'`);
}
async function residuos() {
  const r = {};
  r.usuarios = (await q(`select count(*)::int n from usuarios where correo=$1 or nombre like '${FX}%'`, [MAIL]))[0].n;
  r.escuelas = (await q(`select count(*)::int n from escuelas where nombre like '${FX}%' or codigo like '${FX}%'`))[0].n;
  r.programas = (await q(`select count(*)::int n from programas where nombre like '${FX}%' or codigo like '${FX}%'`))[0].n;
  r.proyectos = (await q(`select count(*)::int n from proyectos where titulo like '${FX}%'`))[0].n;
  r.grupos = (await q(`select count(*)::int n from grupos_matriz where nombre like '${FX}%' or semestre in ('2098A','2097A')`))[0].n;
  r.semestres = (await q(`select count(*)::int n from semestres where codigo in ('2098A','2097A')`))[0].n;
  return r;
}

let semActivoGlobal = "";
const p = await lanzar({ ancho: 1440, alto: 900 });
let antes;
const seccion = async (id, nombre, fn, esperados = []) => {
  if (!quiere(id)) return;
  const c0 = marcaConsola(p);
  try { await fn(); } catch (e) { ok(`EXCEPCIÓN en «${nombre}»`, false, String(e.message).slice(0, 260)); }
  const errores = consolaDesde(p, c0).filter((l) => !esperados.some((r) => r.test(l)));
  ok(`[${id}] consola sin errores${esperados.length ? " (salvo los provocados a propósito)" : ""}`, errores.length === 0, errores.slice(0, 3).join(" | ").slice(0, 300));
};

try {
  await limpiar();
  antes = await conteos();
  const semActivo = (await q("select codigo from semestres where activo"))[0].codigo;
  semActivoGlobal = semActivo;
  const grupoSembrado = (await q(`select id, nombre from grupos_matriz where semestre=$1 order by id limit 1`, [semActivo]))[0];
  await login(p, ADMIN);

  /* ───────── 1. Navegación ───────── */
  await seccion("1", "Navegación", async () => {
    await ir(p, "/admin/sistema", 1500); await esperaCarga(p);
    ok("pestañas: 6 con rol tab dentro de un tablist", await E(p, "return document.querySelectorAll('[role=tablist] [role=tab]').length===6"));
    ok("pestaña por defecto: Usuarios (aria-selected)", await E(p, "return document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()==='Usuarios'"));
    for (const [id, nombre] of TABS) {
      await clic(p, nombre, "document.querySelector('[role=tablist]')"); await pausa(900); await esperaCarga(p);
      ok(`pestaña «${nombre}»: URL ?tab=${id}, seleccionada y panel visible`, await E(p, `return new URLSearchParams(location.search).get('tab')===${JSON.stringify(id)} && document.querySelector('[role=tab][aria-selected=true]').id==='tab-${id}' && !!document.getElementById('panel-${id}')`));
    }
    await ir(p, "/admin/sistema?tab=usuarios", 1200);
    await E(p, "document.getElementById('tab-usuarios').focus()");
    await tecla(p, "ArrowRight", "ArrowRight", 39); await pausa(500);
    ok("teclado: flecha derecha pasa a Semestres y mueve el foco", await E(p, "return document.querySelector('[role=tab][aria-selected=true]').id==='tab-semestres' && document.activeElement.id==='tab-semestres'"));
    await tecla(p, "End", "End", 35); await pausa(500);
    ok("teclado: Fin va a Plantillas", await E(p, "return document.querySelector('[role=tab][aria-selected=true]').id==='tab-plantillas'"));
    await tecla(p, "Home", "Home", 36); await pausa(500);
    ok("teclado: Inicio vuelve a Usuarios", await E(p, "return document.querySelector('[role=tab][aria-selected=true]').id==='tab-usuarios'"));
    await tecla(p, "ArrowLeft", "ArrowLeft", 37); await pausa(500);
    ok("teclado: flecha izquierda desde Usuarios envuelve a Plantillas", await E(p, "return document.querySelector('[role=tab][aria-selected=true]').id==='tab-plantillas'"));
    // El riel lateral sincroniza la pestaña (antes el estado solo se leía al montar)
    for (const [id, nombre] of [["tareas", "Tareas semanales"], ["programas", "Escuelas y programas"], ["usuarios", "Usuarios"]]) {
      const hizo = await E(p, `const a=[...document.querySelectorAll('.b2-side a')].find(x=>x.textContent.trim()===${JSON.stringify(nombre)}||x.getAttribute('aria-label')===${JSON.stringify(nombre)}); if(!a) return false; a.click(); return true`);
      await pausa(900);
      ok(`riel lateral «${nombre}» activa la pestaña ${id}`, hizo && await E(p, `return document.querySelector('[role=tab][aria-selected=true]').id==='tab-${id}' && new URLSearchParams(location.search).get('tab')===${JSON.stringify(id)}`));
    }
    // Enlace profundo: semestre y grupo en la URL; la lista corresponde solo a ese semestre
    await irAdm(p, "plantillas", `&semestre=${semActivo}&grupo=${grupoSembrado.id}`);
    await pausa(1500);
    const apiG = await api(p, `/admin/grupos-matriz?semestre=${semActivo}`);
    ok(`deep link plantillas: semestre ${semActivo} seleccionado`, await E(p, `const s=document.querySelector('select[aria-label="Semestre"]')||[...document.querySelectorAll('.b2-adm-lat select')][0]; return s&&s.value===${JSON.stringify(semActivo)}`));
    ok(`deep link plantillas: grupo ${grupoSembrado.id} seleccionado`, await E(p, `return (document.querySelector('.b2-adm-lat-i[aria-current="true"]')?.innerText||'').includes(${JSON.stringify(grupoSembrado.nombre.slice(0, 20))})`));
    const items = await E(p, "return [...document.querySelectorAll('.b2-adm-lat-i')].map(i=>i.innerText)");
    ok(`deep link plantillas: la lista solo trae grupos de ${semActivo} (${apiG.d.grupos.length})`, items.length === apiG.d.grupos.length && items.every((t) => t.includes(semActivo)), `${items.length} ítems`);
    ok("sin desborde horizontal", await sinDesborde(p));
  });

  /* ───────── 2. Identidad B2 ───────── */
  await seccion("2", "Identidad B2", async () => {
    await ir(p, "/admin", 2500);
    const panel = await E(p, "const c=s=>getComputedStyle(document.querySelector(s)); return JSON.stringify({hd:c('.b2-hd').backgroundColor, ctx:c('.b2-ctx').backgroundColor, font:c('.b2-root').fontFamily.split(',')[0], prim:c('.b2-root').getPropertyValue('--c-primary').trim(), sel:c('.b2-root').getPropertyValue('--c-select').trim()})").then(JSON.parse);
    await irAdm(p, "usuarios");
    const adm = await E(p, "const c=s=>getComputedStyle(document.querySelector(s)); return JSON.stringify({hd:c('.b2-hd').backgroundColor, ctx:c('.b2-ctx').backgroundColor, font:c('.b2-root').fontFamily.split(',')[0], prim:c('.b2-root').getPropertyValue('--c-primary').trim(), sel:c('.b2-root').getPropertyValue('--c-select').trim()})").then(JSON.parse);
    ok("encabezado de Administración: rgb(38, 30, 54)", adm.hd === "rgb(38, 30, 54)", adm.hd);
    ok("mismos tokens y fuente que el panel (encabezado, contexto, primario, selección, tipografía)", JSON.stringify(adm) === JSON.stringify(panel), JSON.stringify(adm));
    ok("una sola cabecera y un solo menú superior; sin shell Tinta", await E(p, "return document.querySelectorAll('.b2-hd').length===1 && document.querySelectorAll('.b2-hd-nav').length===1 && !document.querySelector('aside[aria-label=\"Navegación principal\"]')"));
    ok("un solo h1 y riel lateral y barra de contexto presentes", await E(p, "return document.querySelectorAll('h1').length===1 && !!document.querySelector('.b2-side') && !!document.querySelector('.b2-ctx')"));
    ok("Administración activa en el menú superior", await E(p, "return document.querySelector('.b2-hd-mod[data-active]')?.textContent.trim()==='Administración'"));
    ok("riel: pestañas con los mismos nombres que la página", await E(p, `const t=[...document.querySelectorAll('.b2-side-i')].map(a=>(a.getAttribute('aria-label')||a.textContent).trim()); return ${JSON.stringify(TABS.map((t) => t[1]))}.every(n=>t.includes(n))`));
    ok("sin Tailwind/Tinta en las pantallas (sin clases ds-)", await E(p, "return !document.querySelector('[class*=\"ds-btn\"],[class*=\"ds-input\"],[class*=\"ds-table\"]')"));
  });

  /* ───────── 3. Lectura por pestaña ───────── */
  await seccion("3a", "Lectura: usuarios", async () => {
    const apiU = await api(p, "/admin/usuarios?page=1&limit=50");
    const total = apiU.d.pagination.total;
    await irAdm(p, "usuarios");
    ok(`usuarios: ${total} filas = API`, (await filas(p)) === total);
    await E(p, "const i=document.querySelector('input[aria-label=\"Buscar usuarios\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'laura'); i.dispatchEvent(new Event('input',{bubbles:true}))");
    await pausa(500);
    ok("usuarios: buscar «laura» deja 1 fila", (await filas(p)) === 1 && (await textoFilas(p))[0].includes("Laura"));
    ok("usuarios: aparece «Limpiar»", await existeBtn(p, "Limpiar"));
    await clic(p, "Limpiar"); await pausa(400);
    ok("usuarios: «Limpiar» restablece todas las filas", (await filas(p)) === total);
    const doc = apiU.d.usuarios.filter((u) => u.rol === "docente").length;
    await E(p, "[...document.querySelectorAll('.b2-chip')].find(c=>c.textContent.startsWith('Docentes')).click()"); await pausa(400);
    ok(`usuarios: chip Docentes = ${doc}`, (await filas(p)) === doc);
    await E(p, "[...document.querySelectorAll('.b2-chip')].find(c=>c.textContent.startsWith('Todos')).click()"); await pausa(300);
    await campoSel(p, "Filtrar por estado", /inactiv/i); await pausa(400);
    ok("usuarios: filtro Inactivos sin resultados muestra estado vacío con «Limpiar»", (await filas(p)) === 0 && await existeBtn(p, "Limpiar"));
    await clic(p, "Limpiar"); await pausa(400);
    ok("usuarios: clic en fila abre el inspector con el dato correcto", await clicFila(p, "Laura") && (await pausa(500), (await inspTexto(p)).includes("laura.gomez@proysocial.local")));
    await tecla(p, "Escape", "Escape", 27); await pausa(500);
    ok("usuarios: Esc cierra el inspector", !(await inspAbierto(p)));
    await E(p, "document.querySelector('.b2-adm-kebab button').click()"); await pausa(400);
    ok("usuarios: el kebab abre el menú con Editar y Eliminar", await E(p, "const m=[...document.querySelectorAll('.b2-menu-i')].map(x=>x.textContent.trim()); return m.includes('Editar')&&m.includes('Eliminar')"));
    await tecla(p, "Escape", "Escape", 27);
  });
  await seccion("3b", "Lectura: semestres", async () => {
    const apiS = await api(p, "/admin/semestres");
    await irAdm(p, "semestres");
    ok(`semestres: ${apiS.d.detalle.length} filas = API`, (await filas(p)) === apiS.d.detalle.length);
    ok(`semestres: ${semActivo} aparece como activo`, (await textoFilas(p)).some((t) => t.includes(semActivo) && t.includes("Activo")));
    await clicFila(p, semActivo); await pausa(500);
    ok("semestres: inspector con periodo y conteos", /Inicio/.test(await inspTexto(p)) && /Grupos/.test(await inspTexto(p)));
    ok("semestres: «Eliminar semestre» deshabilitado para el activo con explicación", await btnDeshabilitado(p, "Eliminar semestre") && /semestre activo/i.test(await inspTexto(p)));
    ok("semestres: «Clonar este semestre» lleva a Tareas semanales", await clic(p, "Clonar este semestre") && (await pausa(900), await E(p, "return new URLSearchParams(location.search).get('tab')==='tareas'")));
  });
  await seccion("3c", "Lectura: escuelas y programas", async () => {
    const apiP = await api(p, "/admin/programas");
    await irAdm(p, "programas");
    ok("programas: lista lateral de escuelas presente", await E(p, "return !!document.querySelector('nav[aria-label=\"Escuelas\"]')"));
    ok(`programas: ${apiP.d.programas.length} programa(s) = API en «Todas las escuelas»`, (await filas(p)) === apiP.d.programas.length);
    ok("programas: «Nueva escuela» disponible", await existeBtn(p, "Nueva escuela"));
  });
  await seccion("3d", "Lectura: iniciativas", async () => {
    const apiI = await api(p, "/admin/proyectos?page=1&limit=20");
    await irAdm(p, "proyectos");
    ok(`iniciativas: ${apiI.d.proyectos.length} filas = API`, (await filas(p)) === apiI.d.proyectos.length);
    await E(p, "const i=document.querySelector('input[aria-label=\"Buscar iniciativa\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Convenio'); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(500);
    const conv = apiI.d.proyectos.filter((x) => /convenio/i.test(x.name + x.coordinator + x.program)).length;
    ok(`iniciativas: buscar «Convenio» = ${conv}`, (await filas(p)) === conv);
    await E(p, "const i=document.querySelector('input[aria-label=\"Buscar iniciativa\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,''); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(300);
    await campoSel(p, "Filtrar por tipo", /proyecto/i); await pausa(400);
    ok(`iniciativas: filtro por tipo Proyecto = ${apiI.d.proyectos.filter((x) => x.type === "project").length}`, (await filas(p)) === apiI.d.proyectos.filter((x) => x.type === "project").length);
    await campoSel(p, "Filtrar por tipo", /todos/i); await pausa(300);
    await E(p, "[...document.querySelectorAll('.b2-chip')].find(c=>/^Suspendidas/.test(c.textContent)).click()"); await pausa(400);
    ok("iniciativas: chip Suspendidas (0) deja la tabla vacía con mensaje", (await filas(p)) === 0);
    await E(p, "[...document.querySelectorAll('.b2-chip')].find(c=>/^Todas/.test(c.textContent)).click()"); await pausa(300);
    await clicFila(p, apiI.d.proyectos[0].name.slice(0, 15)); await pausa(900);
    const t = await inspTexto(p);
    ok("iniciativas: inspector con datos, semestre derivado y cronograma", t.includes(apiI.d.proyectos[0].name) && /Semestre/.test(t) && /Cronograma/.test(t));
  });
  await seccion("3e", "Lectura: tareas semanales", async () => {
    await irAdm(p, "tareas");
    const apiG = await api(p, `/admin/grupos-matriz?semestre=${semActivo}`);
    ok(`tareas: ${apiG.d.grupos.length} grupos de ${semActivo} = filas`, (await filas(p)) === apiG.d.grupos.length);
    ok("tareas: resumen con 4 indicadores", await E(p, "return document.querySelectorAll('.b2-adm-stats > div').length===4"));
    ok("tareas: indica semestre activo", await E(p, "return /Semestre activo/.test(document.body.innerText)"));
    await clicFila(p, grupoSembrado.nombre.slice(0, 20)); await pausa(1200);
    const t = await inspTexto(p);
    ok("tareas: inspector con carga, resumen de semanas/entregables y docentes", /Horas totales/.test(t) && /Entregables/.test(t) && /Docentes/.test(t));
    ok("tareas: «Ver plantillas y semanas» abre Plantillas con ese grupo", await clic(p, "Ver plantillas y semanas") && (await pausa(1800), await E(p, `return new URLSearchParams(location.search).get('tab')==='plantillas' && new URLSearchParams(location.search).get('grupo')===${JSON.stringify(String(grupoSembrado.id))} && !!document.querySelector('.b2-adm-lat-i[aria-current="true"]')`)));
  });
  await seccion("3f", "Lectura: plantillas", async () => {
    await irAdm(p, "plantillas", `&semestre=${semActivo}&grupo=${grupoSembrado.id}`);
    await pausa(1500);
    const apiPl = await api(p, `/admin/grupos-matriz/${grupoSembrado.id}/plantillas`);
    const n = apiPl.d.plantillas.length;
    ok(`plantillas: ${n} en total y página de 20 (${Math.min(20, n)} filas)`, (await filas(p)) === Math.min(20, n) && await E(p, `return document.body.innerText.includes('${n} plantillas')`));
    await E(p, "const i=document.querySelector('input[aria-label=\"Buscar plantillas\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'zzz-no-existe'); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(500);
    ok("plantillas: búsqueda sin coincidencias muestra estado vacío", (await filas(p)) === 0);
    await E(p, "const i=document.querySelector('input[aria-label=\"Buscar plantillas\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,''); i.dispatchEvent(new Event('input',{bubbles:true}))"); await pausa(400);
    await campoSel(p, "Filtrar por semana", /^2$|Semana 2$/); await pausa(500);
    const sem2 = apiPl.d.plantillas.filter((x) => Number(x.semana_numero) === 2).length;
    ok(`plantillas: filtro por semana 2 = ${sem2}`, (await textoFilas(p)).length === Math.min(20, sem2));
    await campoSel(p, "Filtrar por semana", /^Todas/); await pausa(300);
    await E(p, "document.querySelectorAll('.b2-tabla-r')[1].click()"); await pausa(600);
    ok("plantillas: el inspector muestra instrucciones de evidencia y acciones", /Instrucciones/.test(await inspTexto(p)) && await existeBtn(p, "Editar") && await existeBtn(p, "Actualizar evidencia compartida"));
    ok("plantillas: botón «Eliminar» presente y no se ejecuta", await existeBtn(p, "Eliminar"));
  });

  /* ───────── 4. Permisos y reglas reales del backend ───────── */
  await seccion("4", "Permisos", async () => {
    await login(p, DOC.Maria);
    await ir(p, "/admin/sistema", 2000);
    ok("docente: /admin/sistema redirige fuera de Administración", await E(p, "return !location.pathname.startsWith('/admin')"), await E(p, "return location.pathname"));
    ok("docente: ninguna ruta /admin en su navegación", await E(p, "return ![...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').startsWith('/admin'))"));
    const g = await api(p, "/admin/usuarios?page=1&limit=5");
    ok("docente: GET /admin/usuarios → 403", g.s === 403, String(g.s));
    const s = await api(p, "/admin/semestres", ",method:'POST',body:JSON.stringify({})");
    ok("docente: POST /admin/semestres (cuerpo inválido) → 403", s.s === 403, String(s.s));
    const pl = await api(p, "/admin/plantillas/1", ",method:'PUT',body:JSON.stringify({})");
    ok("docente: PUT /admin/plantillas/1 → 403", pl.s === 403, String(pl.s));
    const nt = await EA(p, `const r=await fetch('${APP.replace("5173", "4000")}/admin/usuarios'); return r.status`);
    ok("sin sesión: GET /admin/usuarios → 401", nt === 401, String(nt));
    // Reglas del backend con la cuenta administradora (el código responde 409 antes de escribir)
    const base = await conteos();
    await login(p, ADMIN);
    const adminId = (await q("select id from usuarios where correo=$1", [ADMIN]))[0].id;
    const del = await api(p, `/admin/usuarios/${adminId}`, ",method:'DELETE'");
    ok("regla: no se puede eliminar la propia cuenta administradora → 409", del.s === 409 && /propia cuenta/i.test(del.d?.error || ""), `${del.s} ${del.d?.error}`);
    const inact = await api(p, `/admin/usuarios/${adminId}`, `,method:'PUT',body:JSON.stringify({nombre:'Admin',apellido:'Sistema',correo:'${ADMIN}',rol:'admin',estado:'inactivo'})`);
    ok("regla: no se puede desactivar la propia cuenta administradora → 409", inact.s === 409 && /desactivar|propio rol/i.test(inact.d?.error || ""), `${inact.s} ${inact.d?.error}`);
    const dsem = await api(p, `/admin/semestres/${semActivo}`, ",method:'DELETE'");
    ok(`regla: no se puede eliminar el semestre activo ${semActivo} → 409`, dsem.s === 409 && /semestre activo/i.test(dsem.d?.error || ""), `${dsem.s} ${dsem.d?.error}`);
    const despues = await conteos();
    ok("BD intacta tras los intentos rechazados", JSON.stringify(base) === JSON.stringify(despues));
  });

  /* ───────── 5. Estados de error y carga ───────── */
  await seccion("5", "Errores y carga", async () => {
    await irAdm(p, "semestres");
    await E(p, "window.__fetch0=window.fetch; window.fetch=(u,o)=>String(u).includes('/admin/usuarios')?Promise.reject(new TypeError('Failed to fetch')):window.__fetch0(u,o)");
    await clic(p, "Usuarios", "document.querySelector('[role=tablist]')"); await pausa(1500);
    ok("error de red en usuarios: alerta con «Reintentar»", await E(p, "return !!document.querySelector('.b2-alert[role=alert]')") && await existeBtn(p, "Reintentar"));
    await E(p, "window.fetch=window.__fetch0");
    await clic(p, "Reintentar"); await esperar(p, "document.querySelectorAll('.b2-tabla-r').length>0", "filas tras reintentar");
    ok("«Reintentar» recupera la tabla", (await filas(p)) > 0 && !(await E(p, "return !!document.querySelector('.b2-alert[role=alert]')")));
    // Esqueleto de carga: se ve mientras la respuesta tarda
    await E(p, "window.__fetch0=window.fetch; window.fetch=(u,o)=>String(u).includes('/admin/semestres')?new Promise(r=>setTimeout(()=>r(window.__fetch0(u,o)),1500)):window.__fetch0(u,o)");
    await clic(p, "Semestres", "document.querySelector('[role=tablist]')"); await pausa(500);
    ok("carga: esqueleto visible mientras responde el servidor", await E(p, "return !!document.querySelector('.b2-skel')"));
    await pausa(2200);
    ok("carga: tras responder se muestran las filas", (await filas(p)) > 0 && !(await E(p, "return !!document.querySelector('.b2-skel')")));
    await E(p, "window.fetch=window.__fetch0");
  }, [/Failed to fetch/]);

  /* ───────── 6. Escrituras con fixtures (secciones añadidas más abajo) ───────── */
  await escrituras();

  /* ───────── 7. Responsive ───────── */
  await seccion("7", "Responsive", responsive);

  /* ───────── 8. Regresión del shell compartido ───────── */
  await seccion("8", "Regresión", async () => {
    for (const ruta of ["/admin", "/admin/importar-matriz", "/admin/revision"]) {
      await ir(p, ruta, 2500);
      ok(`${ruta}: mismo shell B2 y sin errores`, await E(p, "return document.querySelectorAll('.b2-hd').length===1 && getComputedStyle(document.querySelector('.b2-hd')).backgroundColor==='rgb(38, 30, 54)'") && await sinDesborde(p));
    }
  });
} catch (e) {
  ok("EXCEPCIÓN general", false, String(e.stack || e).slice(0, 400));
} finally {
  try { await limpiar(); } catch (e) { ok("limpieza", false, String(e.message)); }
  try {
    const despues = await conteos();
    const iguales = JSON.stringify(antes) === JSON.stringify(despues);
    ok("BD tras limpiar: tablas, estados y semestre activo idénticos a los de antes", iguales, iguales ? "" : JSON.stringify({ antes, despues }).slice(0, 600));
    const r = await residuos();
    ok("barrido de residuos TSTA4C = 0", Object.values(r).every((n) => n === 0), JSON.stringify(r));
  } catch (e) { ok("verificación final", false, String(e.message)); }
  await p.cerrar();
  await pool.end();
  console.log(res.join("\n"));
}

/* ───────── helpers que dependen de funciones declaradas arriba ───────── */
/** Elige una opción (por regex sobre su texto) de un select identificado por aria-label. */
async function campoSel(p, aria, re) {
  const val = await E(p, `const s=document.querySelector('select[aria-label=${JSON.stringify(aria)}]'); if(!s) throw new Error('sin select '+${JSON.stringify(aria)}); const o=[...s.options].find(o=>new RegExp(${JSON.stringify(re.source)},${JSON.stringify(re.flags)}).test(o.textContent.trim())); if(!o) throw new Error('sin opción '+${JSON.stringify(String(re))}+': '+[...s.options].map(o=>o.textContent.trim()).join('|')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true})); return o.value`);
  return val;
}
/* ───────── 6. Escrituras con fixtures sintéticos ───────── */
async function escrituras() {
  await seccion("6a", "Escuela y programa", async () => {
    await irAdm(p, "programas");
    const e0 = await cuenta("escuelas"), pr0 = await cuenta("programas");
    // Escuela: validación en línea sin llamar al backend
    await clic(p, "Nueva escuela"); await pausa(500);
    ok("escuela: «Nueva escuela» abre el formulario en el inspector (no en un modal)", await inspAbierto(p) && !(await dialogo(p)));
    await guardar(p); await pausa(500);
    ok("escuela: guardar vacío muestra error en línea del nombre y resumen", (await erroresForm(p)).length >= 1 && await E(p, "return !!document.querySelector('.b2-form-err')"));
    ok("escuela: guardar vacío no escribe en la BD", (await cuenta("escuelas")) === e0);
    await campo(p, "Nombre", `${FX} Escuela`); await campo(p, "Código", "tsta4c-e");
    await guardar(p);
    ok("escuela: toast «Escuela creada»", await esperarToast(p, /Escuela creada/));
    const esc = (await q(`select id, codigo, nombre from escuelas where nombre=$1`, [`${FX} Escuela`]))[0];
    ok("escuela: BD con el código en mayúsculas", esc?.codigo === "TSTA4C-E", JSON.stringify(esc));
    await pausa(900);
    ok("escuela: aparece en la lista lateral", await E(p, `return document.querySelector('nav[aria-label="Escuelas"]').innerText.includes(${JSON.stringify(FX + " Escuela")})`));
    // Programa: sin escuelas preseleccionadas, con validación
    await E(p, `[...document.querySelectorAll('.b2-adm-lat-i')].find(i=>i.innerText.includes(${JSON.stringify(FX + " Escuela")})).click()`); await pausa(700);
    ok("escuela: elegirla muestra su detalle sin programas y permite crear uno", /Editar escuela/.test(await inspTexto(p)) || await existeBtn(p, "Editar escuela"));
    await cancelarForm(p);
    await clic(p, "Nuevo programa"); await pausa(500);
    await guardar(p); await pausa(400);
    ok("programa: guardar vacío muestra errores en línea y no escribe", (await erroresForm(p)).length >= 2 && (await cuenta("programas")) === pr0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Código", "tsta4c-p"); await campo(p, "Nombre", `${FX} Programa`);
    const escVal = await valorCampo(p, "Escuela");
    if (!escVal) await campo(p, "Escuela", `${FX} Escuela`);
    await guardar(p);
    ok("programa: toast «Programa creado»", await esperarToast(p, /Programa creado/));
    const prog = (await q(`select id, codigo, escuela_id from programas where nombre=$1`, [`${FX} Programa`]))[0];
    ok("programa: BD con código en mayúsculas y la escuela fixture", prog?.codigo === "TSTA4C-P" && prog.escuela_id === esc.id, JSON.stringify(prog));
    await pausa(900);
    ok("programa: aparece en la tabla de la escuela elegida", (await textoFilas(p)).some((t) => t.includes(`${FX} Programa`)));
    // Edición
    ok("programa: clic en la fila abre el detalle", await abrirFila(p, `${FX} Programa`) && /Editar programa/.test(await E(p, "return document.querySelector('aside.b2-insp').innerText")));
    await clic(p, "Editar programa"); await pausa(500);
    ok("programa: el formulario de edición trae los valores actuales", (await valorCampo(p, "Nombre")) === `${FX} Programa`);
    await campo(p, "Nombre", `${FX} Programa B`); await guardar(p);
    ok("programa: edición con «Cambios guardados» y BD actualizada", await esperarToast(p, /Cambios guardados/) && (await cuenta("programas", "nombre=$1", [`${FX} Programa B`])) === 1);
    await campo(p, "Nombre", `${FX} Programa`).catch(() => {});
    // Restaura el nombre original para los siguientes flujos
    await q(`update programas set nombre=$1 where id=$2`, [`${FX} Programa`, prog.id]);
    // La escuela con programas no se puede eliminar (deshabilitado + explicación)
    await irAdm(p, "programas"); await pausa(500);
    await E(p, `[...document.querySelectorAll('.b2-adm-lat-i')].find(i=>i.innerText.includes(${JSON.stringify(FX + " Escuela")})).click()`); await pausa(700);
    ok("escuela con programas: «Eliminar escuela» deshabilitado con explicación", await btnDeshabilitado(p, "Eliminar escuela") && /programas asociados/i.test(await inspTexto(p)));
    await tecla(p, "Escape", "Escape", 27); await pausa(400);
    // Programa temporal: confirmación de borrado (cancelar no borra; confirmar borra)
    await clic(p, "Nuevo programa"); await pausa(500);
    await campo(p, "Código", "tsta4c-t"); await campo(p, "Nombre", `${FX} Programa Temporal`);
    if (!(await valorCampo(p, "Escuela"))) await campo(p, "Escuela", `${FX} Escuela`);
    await guardar(p); await esperarToast(p, /Programa creado/); await pausa(900);
    await abrirFila(p, `${FX} Programa Temporal`);
    await clic(p, "Eliminar programa"); await pausa(500);
    ok("programa temporal: eliminar pide confirmación segura (diálogo con foco en Cancelar)", /eliminar/i.test((await dialogo(p)) || "") && await E(p, "return document.activeElement?.textContent.trim()==='Cancelar'"));
    await confirmar(p, "Cancelar"); await pausa(400);
    ok("programa temporal: cancelar conserva el registro", (await cuenta("programas", "nombre=$1", [`${FX} Programa Temporal`])) === 1 && !(await dialogo(p)));
    await clic(p, "Eliminar programa"); await pausa(400); await confirmar(p, "Eliminar");
    ok("programa temporal: confirmar elimina (toast y BD)", await esperarToast(p, /Programa eliminado/) && (await cuenta("programas", "nombre=$1", [`${FX} Programa Temporal`])) === 0);
  });

  const ctx = {};
  const cargaCtx = async () => {
    ctx.esc = (await q(`select id from escuelas where nombre=$1`, [`${FX} Escuela`]))[0];
    ctx.prog = (await q(`select id from programas where nombre=$1`, [`${FX} Programa`]))[0];
    ctx.user = (await q(`select id from usuarios where correo=$1`, [MAIL]))[0];
    ctx.proy = (await q(`select id from proyectos where titulo like '${FX}%' order by id limit 1`))[0];
    ctx.g26 = (await q(`select id from grupos_matriz where nombre=$1 and semestre=$2`, [`${FX} Grupo`, semActivoGlobal]))[0];
    ctx.g98 = (await q(`select id from grupos_matriz where nombre=$1 and semestre='2098A'`, [`${FX} Grupo Clon`]))[0];
  };
  await cargaCtx();

  await seccion("6c", "Usuario docente", async () => {
    await cargaCtx();
    await irAdm(p, "usuarios");
    const u0 = await cuenta("usuarios");
    await clic(p, "Agregar usuario"); await pausa(600);
    ok("usuario: «Agregar usuario» abre el formulario en el inspector con tres grupos", await inspAbierto(p) && await E(p, "return [...document.querySelectorAll('aside.b2-insp legend')].map(l=>l.textContent.trim()).join('|')==='Identidad|Rol y programa|Datos del docente'"));
    await guardar(p); await pausa(500);
    ok("usuario: guardar vacío muestra errores en línea (nombres, apellidos, correo) y no escribe", (await erroresForm(p)).length >= 3 && (await cuenta("usuarios")) === u0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Rol", "Administrador"); await pausa(300);
    ok("usuario: con rol Administrador se ocultan los datos de docente", await E(p, "return ![...document.querySelectorAll('aside.b2-insp label')].some(l=>/Tipo de docente|Regional|Grupo matriz|Drive/.test(l.textContent))"));
    await campo(p, "Rol", "Docente"); await pausa(300);
    await campo(p, "Nombres", FX); await campo(p, "Apellidos", "Docente Fixture"); await campo(p, "Correo institucional", MAIL);
    await campo(p, "Escuela", `${FX} Escuela`); await pausa(300);
    await campo(p, "Programa", `${FX} Programa`); await campo(p, "Regional", "Fixture");
    await guardar(p);
    ok("usuario: toast «Usuario creado»", await esperarToast(p, /Usuario creado/));
    await cargaCtx();
    const row = (await q(`select rol, estado, programa_id, tipo_docente, regional from usuarios where correo=$1`, [MAIL]))[0];
    ok("usuario: BD con rol docente, activo, programa y regional del fixture", row?.rol === "docente" && row.estado === "activo" && row.programa_id === ctx.prog.id && row.regional === "Fixture", JSON.stringify(row));
    await pausa(900);
    ok("usuario: aparece en la tabla", (await textoFilas(p)).some((t) => t.includes(MAIL)));
    // Correo duplicado: el backend rechaza y la interfaz muestra su mensaje
    await clic(p, "Agregar usuario"); await pausa(500);
    await campo(p, "Nombres", FX); await campo(p, "Apellidos", "Duplicado"); await campo(p, "Correo institucional", MAIL);
    await guardar(p);
    ok("usuario: correo duplicado → mensaje de error del backend y sin segundo registro", await esperarToast(p, /correo|existe|registrad|duplic|ya /i) && (await cuenta("usuarios", "correo=$1", [MAIL])) === 1, JSON.stringify(await toasts(p)));
    await cancelarForm(p);
    // Edición: inactivar y reactivar
    ok("usuario: clic en la fila abre el detalle con Editar y Eliminar", await abrirFila(p, MAIL) && await existeBtn(p, "Editar") && await existeBtn(p, "Eliminar"));
    await clic(p, "Editar"); await pausa(500);
    ok("usuario: el formulario de edición trae los datos actuales", (await valorCampo(p, "Regional")) === "Fixture" && (await valorCampo(p, "Estado")) === "activo");
    await campo(p, "Estado", "Inactivo"); await guardar(p);
    ok("usuario: inactivar guarda (toast y BD)", await esperarToast(p, /Cambios guardados/) && (await cuenta("usuarios", "correo=$1 and estado='inactivo'", [MAIL])) === 1);
    await pausa(700);
    await clic(p, "Editar"); await pausa(500); await campo(p, "Estado", "Activo"); await guardar(p);
    ok("usuario: reactivar guarda (BD activo)", await esperarToast(p, /Cambios guardados/) && (await cuenta("usuarios", "correo=$1 and estado='activo'", [MAIL])) === 1);
  });

  await seccion("6b", "Semestre sintético", async () => {
    await irAdm(p, "semestres");
    const s0 = await cuenta("semestres");
    await clic(p, "Nuevo semestre"); await pausa(500);
    await campo(p, "Código", "abc"); await campo(p, "Inicio", "2098-02-02"); await campo(p, "Finalización", "2098-05-25"); await campo(p, "Número de semanas", "16");
    await guardar(p); await pausa(500);
    ok("semestre: código inválido → error en línea y sin escritura", (await erroresForm(p)).some((t) => /AAAAA|YYYY|formato/i.test(t)) && (await cuenta("semestres")) === s0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Código", "2098A"); await campo(p, "Finalización", "2098-01-01"); await guardar(p); await pausa(500);
    ok("semestre: fin anterior al inicio → error y sin escritura", (await erroresForm(p)).length >= 1 && (await cuenta("semestres")) === s0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Finalización", "2098-05-25"); await campo(p, "Número de semanas", "60"); await guardar(p); await pausa(500);
    ok("semestre: 60 semanas → error (1–53) y sin escritura", (await erroresForm(p)).length >= 1 && (await cuenta("semestres")) === s0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Número de semanas", "16"); await guardar(p);
    ok("semestre: toast «Semestre creado»", await esperarToast(p, /Semestre creado/));
    const sem = (await q(`select activo, numero_semanas from semestres where codigo='2098A'`))[0];
    ok("semestre: 2098A en BD, inactivo y 16 semanas; el activo no cambió", sem && sem.activo === false && sem.numero_semanas === 16 && (await q("select codigo from semestres where activo"))[0].codigo === semActivoGlobal, JSON.stringify(sem));
    await pausa(900);
    ok("semestre: abrir 2098A y editar semanas a 15", await abrirFila(p, "2098A") && await clic(p, "Editar"));
    await pausa(500); await campo(p, "Número de semanas", "15"); await guardar(p);
    ok("semestre: edición guardada (toast y BD)", await esperarToast(p, /Semestre actualizado/) && (await cuenta("semestres", "codigo='2098A' and numero_semanas=15")) === 1);
    await q(`update semestres set numero_semanas=16 where codigo='2098A'`);
    await pausa(500); await tecla(p, "Escape", "Escape", 27); await pausa(300);
    await irAdm(p, "semestres");
    await abrirFila(p, "2098A");
    ok("semestre: «Activar» pide confirmación y cancelar NO cambia el semestre activo", await clic(p, "Activar", "document.querySelector('aside.b2-insp[data-open=\"true\"]')") && (await pausa(500), /periodo activo/i.test((await dialogo(p)) || "")) && await confirmar(p, "Cancelar") && (await pausa(500), (await q("select codigo from semestres where activo"))[0].codigo === semActivoGlobal));
  });

  await seccion("6d", "Iniciativa sintética", async () => {
    await cargaCtx();
    await irAdm(p, "proyectos");
    const y0 = await cuenta("proyectos");
    await clic(p, "Nueva iniciativa"); await pausa(600);
    await guardar(p); await pausa(500);
    ok("iniciativa: guardar vacío → errores en línea y sin escritura", (await erroresForm(p)).length >= 3 && (await cuenta("proyectos")) === y0, JSON.stringify(await erroresForm(p)));
    await campo(p, "Título", `${FX} Iniciativa`); await campo(p, "Tipo", "Proyecto"); await campo(p, "Descripción", "Fixture de pruebas");
    await campo(p, "Escuela", `${FX} Escuela`); await pausa(300); await campo(p, "Programa", `${FX} Programa`); await pausa(300);
    await campo(p, "Docente responsable", `${FX} Docente Fixture`);
    await campo(p, "Fecha inicio", "2026-09-07"); await campo(p, "Fecha fin estimada", "2026-09-18"); await campo(p, "Horas totales", "10"); await campo(p, "Nº semanas", "2"); await pausa(300);
    ok("iniciativa: aviso del cronograma «Se generarán 2 semana(s)»", /Se generarán 2 semana/.test(await inspTexto(p)));
    await guardar(p);
    ok("iniciativa: toast «Iniciativa creada»", await esperarToast(p, /Iniciativa creada/));
    await cargaCtx();
    const sem = await cuenta("proyecto_semanas", "proyecto_id=$1", [ctx.proy?.id ?? -1]);
    const fila = (await q(`select docente_responsable_id, tipo, estado from proyectos where id=$1`, [ctx.proy?.id ?? -1]))[0];
    ok("iniciativa: BD con 2 semanas y el docente fixture como responsable", sem === 2 && fila?.docente_responsable_id === ctx.user.id && fila.tipo === "proyecto", JSON.stringify({ sem, fila }));
    await pausa(900);
    ok("iniciativa: abrir el detalle muestra semestre derivado y cronograma", await abrirFila(p, `${FX} Iniciativa`) && /Semestre\s*\n?\s*2026B/.test(await inspTexto(p)) && /Cronograma/.test(await inspTexto(p)), (await inspTexto(p)).slice(0, 200));
    await clic(p, "Ver 2 semana(s)"); await pausa(500);
    ok("iniciativa: el cronograma plegable lista Semana 1 y Semana 2", /Semana 1/.test(await inspTexto(p)) && /Semana 2/.test(await inspTexto(p)));
    // Asignar docentes
    await clic(p, "Asignar docentes"); await pausa(900);
    await campo(p, "Agregar docente", "Carlos"); await clic(p, "Agregar", "document.querySelector('aside.b2-insp[data-open=\"true\"]')"); await pausa(300);
    ok("iniciativa: Carlos aparece en la lista asignada antes de guardar", /Carlos/.test(await E(p, "return document.querySelector('aside.b2-insp').innerText")));
    await guardar(p);
    ok("iniciativa: «Guardar asignación» (toast y BD proyecto_docentes)", await esperarToast(p, /Asignación guardada/) && (await cuenta("proyecto_docentes", "proyecto_id=$1", [ctx.proy.id])) === 1);
    // Edición
    await pausa(800);
    await clic(p, "Editar"); await pausa(600);
    ok("iniciativa: el formulario de edición trae título y semanas", (await valorCampo(p, "Título")) === `${FX} Iniciativa` && (await valorCampo(p, "Nº semanas")) === "2");
    await campo(p, "Título", `${FX} Iniciativa B`); await guardar(p);
    ok("iniciativa: edición guardada (toast y BD)", await esperarToast(p, /Iniciativa actualizada/) && (await cuenta("proyectos", "titulo=$1", [`${FX} Iniciativa B`])) === 1);
  });
}
async function responsive() { /* se completa en la siguiente iteración */ }
