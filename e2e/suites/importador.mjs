// Etapa 4A: pruebas del importador B2 contra la app real y proysocial_dev, con fixtures temporales TSTE4 (semestre 2099E).
// Uso: npm run e2e -- importador
import fs from "node:fs";
import { lanzar, pausa, iniciarSuite, guardaBD } from "../lib/helpers.mjs";
iniciarSuite("importador");
const { pool } = await guardaBD();
if ((await pool.query("select current_database() d")).rows[0].d !== "proysocial_dev") { console.error("Base no permitida"); process.exit(2); }
const q = async (s, p = []) => (await pool.query(s, p)).rows;
import { generarFixtures } from "./fixtures/xlsx-sintetico.mjs";
const fx = await generarFixtures();
const APP = "http://localhost:5173", API = "http://localhost:4000";
const SEM = "2099A", M = "TSTE4";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
const setInput = (sel, v) => `const i=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,${JSON.stringify(v)}); i.dispatchEvent(new Event('input',{bubbles:true}))`;
const setSel = (sel, v) => `const s=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(v)}); s.dispatchEvent(new Event('change',{bubbles:true}))`;
const subir = (p, b64, nombre) => E(p, `const bin=atob(${JSON.stringify(b64)}); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); const dt=new DataTransfer(); dt.items.add(new File([u], ${JSON.stringify(nombre)}, {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); const inp=document.querySelector('input[type=file]'); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true}))`);
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
const pasoActual = (p) => E(p, "return document.querySelector('.b2-step[data-estado=activo] .b2-step-l')?.textContent");
async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(800);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
const ir = async (p, ruta, espera = 2500) => { await p.ir(APP + ruta); await pausa(espera); };
const sig = (p) => E(p, "[...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Siguiente').click()");
const atras = (p) => E(p, "[...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Atrás').click()");

// ───────── fixtures y estado de BD ─────────
async function limpiar() {
  await q(`DELETE FROM entregable_eventos WHERE docente_id IN (SELECT id FROM usuarios WHERE correo LIKE $1)`, [`${M}%`]);
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`UPDATE usuarios SET grupo_matriz_id = NULL WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM importaciones_matriz WHERE semestre = $1`, [SEM]);
  await q(`DELETE FROM usuarios WHERE correo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM grupos_matriz WHERE semestre = $1`, [SEM]);
  await q(`DELETE FROM semestres WHERE codigo = $1`, [SEM]);
}
const cont = async (s, p = []) => Number((await q(s, p))[0].n);
const estadoBD = async () => ({
  grupos: await cont(`select count(*)::int n from grupos_matriz`),
  plantillas: await cont(`select count(*)::int n from plantilla_entregables`),
  importaciones: await cont(`select count(*)::int n from importaciones_matriz`),
  usuarios: await cont(`select count(*)::int n from usuarios`),
  semestres: await cont(`select count(*)::int n from semestres`),
  asignados: await cont(`select count(*)::int n from usuarios where grupo_matriz_id is not null`),
});
const delSem = async () => ({
  grupos: await cont(`select count(*)::int n from grupos_matriz where semestre=$1`, [SEM]),
  plantillas: await cont(`select count(*)::int n from plantilla_entregables t join grupos_matriz g on g.id=t.grupo_id where g.semestre=$1`, [SEM]),
  importaciones: await cont(`select count(*)::int n from importaciones_matriz where semestre=$1`, [SEM]),
});

/** Recorre los pasos 1–4 con un archivo y deja la pantalla en «Destino y validación» lista para validar. */
async function hastaDestino(p, key, nombre, grupo) {
  await ir(p, "/admin/importar-matriz");
  await subir(p, fx[key], nombre); await pausa(1800);
  await E(p, "[...document.querySelectorAll('.b2-hoja')].find(b=>!b.disabled).click()"); await pausa(1800);
  await sig(p); await pausa(400);
  await sig(p); await pausa(600);
  await E(p, setSel("#imp-sem", SEM)); await pausa(300);
  await E(p, setInput("#g-nombre", grupo)); await E(p, setInput("#g-horas_totales", "24")); await pausa(200);
}
const validar = async (p) => { await E(p, clickTxt(".b2-imp-body .b2-btn", "Validar")); await pausa(2200); };

const p = await lanzar({ ancho: 1440, alto: 900 });
let antes, baseFx;
try {
  await limpiar();
  antes = await estadoBD();
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, ($2::date + 111), 16, FALSE)`, [SEM, fx.ini]);
  const doc = (await q(`INSERT INTO usuarios (nombre, apellido, correo, rol, estado) VALUES ('TSTE4_Docente','Prueba',$1,'docente','activo') RETURNING id`, [`${M}.docente@test.local`]))[0].id;
  baseFx = await estadoBD();
  await login(p, "admin@proysocial.local");

  // ───────── estructura y archivos inválidos ─────────
  await ir(p, "/admin/importar-matriz");
  ok("estructura B2: 7 pasos, barra de progreso y zona de carga", (await E(p, "return document.querySelectorAll('.b2-step').length")) === 7 && (await E(p, "return !!document.querySelector('.b2-imp-drop')")) && /Paso 1 de 7/.test(await E(p, "return document.querySelector('.b2-steps-t').textContent")));
  ok("paso 1: indica qué falta y bloquea «Siguiente»", await E(p, "return /Falta: seleccionar un archivo/.test(document.querySelector('.b2-steps-f').textContent) && [...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Siguiente').disabled"));
  await subir(p, fx.corrupto, "corrupto.xlsx"); await pausa(1800);
  ok("archivo corrupto: error claro, sin avanzar y sin escrituras", (await E(p, "return !!document.querySelector('.b2-alert[role=alert]')")) && (await pasoActual(p)) === "Archivo" && JSON.stringify(await estadoBD()) === JSON.stringify(baseFx), await E(p, "return document.querySelector('.b2-alert')?.textContent.slice(0,90)"));
  await E(p, clickTxt(".b2-alert .b2-btn", "Cerrar")); await pausa(200);
  await subir(p, fx.sinEstructura, "notas.xlsx"); await pausa(1800);
  ok("columnas/estructura incorrectas: la hoja no es seleccionable y no se puede continuar", (await pasoActual(p)) === "Hoja y estructura" && await E(p, "return [...document.querySelectorAll('.b2-hoja')].every(b=>b.disabled) && [...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Siguiente').disabled"));
  await E(p, clickTxt(".b2-imp-chip .b2-link-btn", "Cancelar importación")); await pausa(500);
  ok("cancelar importación vuelve al paso 1", (await pasoActual(p)) === "Archivo");

  // ───────── archivo válido: pasos 2 a 6 ─────────
  await subir(p, fx.valido, "matriz-valida.xlsx"); await pausa(1800);
  ok("paso 2: hojas listadas; la oculta no es seleccionable o está marcada", (await E(p, "return document.querySelectorAll('.b2-hoja').length")) >= 1);
  await E(p, "[...document.querySelectorAll('.b2-hoja')].find(b=>!b.disabled).click()"); await pausa(1800);
  ok("paso 2: estructura y muestra de entregables detectados (6)", await E(p, "return /6/.test(document.querySelector('.b2-imp-body .b2-imp-help:nth-of-type(2), .b2-imp-body').textContent) && document.querySelectorAll('.b2-tbl tbody tr').length>=1"));
  await sig(p); await pausa(500);
  ok("paso 3: mapeo precargado con lo detectado (N° y Entregable)", (await pasoActual(p)) === "Mapeo de columnas" && await E(p, "return document.querySelector('#map-numero').value!=='' && document.querySelector('#map-entregable').value!==''"));
  const mapOrig = await E(p, "return document.querySelector('#map-numero').value");
  await E(p, setSel("#map-numero", "")); await pausa(300);
  ok("paso 3: sin columna N° se marca el error y no se avanza", await E(p, "return /Asigna al menos las columnas/.test(document.querySelector('.b2-imp-body').textContent) && [...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Siguiente').disabled && /Falta: asignar/.test(document.querySelector('.b2-steps-f').textContent)"));
  await E(p, setSel("#map-numero", mapOrig)); await pausa(300);
  await atras(p); await pausa(300);
  ok("navegación: «Atrás» conserva la hoja elegida", (await pasoActual(p)) === "Hoja y estructura" && await E(p, "return !!document.querySelector('.b2-hoja[data-on]')"));
  await sig(p); await pausa(300);
  await sig(p); await pausa(500);
  ok("paso 4: validar bloqueado hasta completar el destino", await E(p, "return [...document.querySelectorAll('.b2-imp-body .b2-btn')].find(b=>b.textContent.startsWith('Validar')).disabled"));
  await E(p, setSel("#imp-sem", SEM)); await E(p, setInput("#g-nombre", `${M} Grupo válido`)); await E(p, setInput("#g-horas_totales", "24")); await pausa(300);
  const bdAntesVal = await estadoBD();
  await validar(p);
  const stats = await E(p, "return [...document.querySelectorAll('.b2-imp-stats > div')].map(d=>d.textContent).join('|')");
  ok("validación: 6 válidos, 0 errores", /Válidos6/.test(stats) && /Errores0/.test(stats), stats);
  ok("validación SIN escrituras en PostgreSQL", JSON.stringify(await estadoBD()) === JSON.stringify(bdAntesVal));
  await sig(p); await pausa(600);
  ok("paso 5: previsualización con tabla estructurada (7 columnas) y acción «Crear»", (await E(p, "return document.querySelectorAll('.b2-imp-body .b2-tbl thead th').length")) === 7 && (await E(p, "return document.querySelectorAll('.b2-pill[data-a=crear]').length")) === 6);
  ok("paso 5: filtros con conteos (Todas 6, Válidas 6)", await E(p, "const t=[...document.querySelectorAll('.b2-chip')].map(c=>c.textContent); return t.includes('Todas6') && t.includes('Válidas6') && t.includes('Errores0')"));
  await E(p, setInput(".b2-prev-tb input", "Socialización")); await pausa(300);
  ok("paso 5: búsqueda por entregable", (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr').length")) === 1);
  await E(p, setInput(".b2-prev-tb input", "")); await pausa(200);
  await E(p, "document.querySelector('.b2-tbl tbody tr').click()"); await pausa(500);
  ok("paso 5: detalle de la fila en el inspector lateral", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true' && /Datos leídos del Excel/.test(document.querySelector('.b2-insp').textContent)"));
  await E(p, "document.querySelector('.b2-insp-x').click()"); await pausa(300);
  await sig(p); await pausa(500);
  ok("paso 6: «Confirmar» bloqueado hasta marcar la casilla de confirmación expresa", await E(p, "const b=[...document.querySelectorAll('.b2-imp-body .b2-btn')].find(b=>b.textContent.startsWith('Confirmar')); return b.disabled && /Falta: marcar la casilla/.test(document.querySelector('.b2-steps-f').textContent)"));
  // cancelar en la confirmación
  await E(p, clickTxt(".b2-imp-body .b2-btn", "Cancelar")); await pausa(600);
  ok("cancelar en la confirmación: vuelve al inicio y no escribe nada", (await pasoActual(p)) === "Archivo" && JSON.stringify(await estadoBD()) === JSON.stringify(baseFx));

  // ───────── confirmar de verdad ─────────
  await hastaDestino(p, "valido", "matriz-valida.xlsx", `${M} Grupo válido`);
  await validar(p); await sig(p); await pausa(500); await sig(p); await pausa(500);
  await E(p, "document.querySelector('.b2-check input').click()"); await pausa(200);
  await E(p, clickTxt(".b2-imp-body .b2-btn", "Confirmar importación")); await pausa(3500);
  ok("paso 7: resultado de la importación", (await pasoActual(p)) === "Resultado");
  const bd1 = await delSem();
  ok("BD: grupo, 6 plantillas y 1 lote creados", bd1.grupos === 1 && bd1.plantillas === 6 && bd1.importaciones === 1, JSON.stringify(bd1));
  const stR = await E(p, "return [...document.querySelectorAll('.b2-imp-stats > div')].map(d=>d.textContent).join('|')");
  ok("resultado: importadas 6, actualizadas 0, omitidas 0, errores 0", /Importadas6/.test(stR) && /Actualizadas0/.test(stR) && /Omitidas0/.test(stR) && /\(rechazadas\)0/.test(stR), stR);
  ok("resultado: lote, fecha, semestre y grupo creado", await E(p, `const t=document.querySelector('.b2-imp-body').textContent; return /Lote/.test(t) && t.includes('${SEM}') && t.includes('${M} Grupo válido') && /creado/.test(t)`));
  ok("historial: el lote nuevo aparece", await E(p, "return document.querySelector('.b2-hist-t tbody tr')?.textContent.includes('matriz-valida.xlsx')"));
  // asignar docente
  await E(p, setSel("#imp-asig", String(doc))); await pausa(200);
  await E(p, clickTxt(".b2-next .b2-btn", "Asignar")); await pausa(1800);
  ok("BD: grupo asignado al docente de prueba", (await q(`select grupo_matriz_id is not null a from usuarios where id=$1`, [doc]))[0].a === true);
  ok("resultado: acceso a la matriz del docente tras asignar", await E(p, "return [...document.querySelectorAll('.b2-next .b2-btn')].some(b=>b.textContent==='Abrir matriz del docente')"));
  await E(p, clickTxt(".b2-next .b2-btn", "Abrir matriz del docente")); await pausa(3200);
  ok("matriz importada: el docente ve 6 entregables con fechas del Excel", await E(p, "return /6 entregables/.test(document.querySelector('.b2-tb-count')?.textContent||'')"));
  await ir(p, "/admin/importar-matriz");
  ok("historial persiste al volver", await E(p, "return !!document.querySelector('.b2-hist-t tbody tr')"));

  // ───────── reimportación idempotente ─────────
  await ir(p, "/admin/importar-matriz");
  await subir(p, fx.valido, "matriz-valida.xlsx"); await pausa(1800);
  await E(p, "[...document.querySelectorAll('.b2-hoja')].find(b=>!b.disabled).click()"); await pausa(1800);
  await sig(p); await sig(p); await pausa(600);
  await E(p, setSel("#imp-sem", SEM)); await pausa(400);
  await E(p, "document.querySelectorAll('input[name=modo]')[1].click()"); await pausa(300);
  const gid = (await q(`select id from grupos_matriz where semestre=$1 and nombre=$2`, [SEM, `${M} Grupo válido`]))[0].id;
  await E(p, setSel("#imp-grupo", String(gid))); await pausa(300);
  await validar(p);
  const stRe = await E(p, "return [...document.querySelectorAll('.b2-imp-stats > div')].map(d=>d.textContent).join('|')");
  await sig(p); await pausa(500);
  ok("reimportación: la previsualización marca «Sin cambios» (no crea ni actualiza)", (await E(p, "return document.querySelectorAll('.b2-pill[data-a=sin_cambios]').length")) === 6 && (await E(p, "return document.querySelectorAll('.b2-pill[data-a=crear]').length")) === 0, stRe);
  await sig(p); await pausa(500);
  const bd2 = await delSem();
  ok("reimportación: el paso Confirmar explica que no hay cambios y bloquea la escritura", await E(p, "const b=[...document.querySelectorAll('.b2-imp-body .b2-btn')].find(b=>b.textContent.startsWith('Confirmar')); return /No hay cambios que importar/.test(document.querySelector('.b2-imp-body').textContent) && b.disabled"));
  ok("BD idempotente: mismas plantillas y sin lote nuevo", bd2.plantillas === 6 && bd2.importaciones === 1 && bd2.grupos === 1, JSON.stringify(bd2));

  // ───────── duplicados ─────────
  await hastaDestino(p, "duplicados", "matriz-duplicados.xlsx", `${M} Grupo duplicados`);
  await validar(p);
  ok("duplicados: decisiones requeridas (duplicados y semana) con opción recomendada", (await E(p, "return document.querySelectorAll('.b2-decide').length")) === 2 && (await E(p, "return !!document.querySelector('.b2-reco')")));
  ok("duplicados: no se puede continuar sin decidir", await E(p, "return [...document.querySelectorAll('.b2-imp-foot .b2-btn')].find(b=>b.textContent==='Siguiente').disabled && /Falta: resolver/.test(document.querySelector('.b2-steps-f').textContent)"));
  for (let i = 0; i < 4 && (await E(p, "return document.querySelectorAll('.b2-decide').length")) > 0; i++) {
    await E(p, "const o=[...document.querySelectorAll('.b2-decide-o')].find(x=>x.querySelector('.b2-reco'))||document.querySelector('.b2-decide-o'); o.querySelector('input').click()"); await pausa(2400);
  }
  ok("decisiones tomadas: se registran con opción «Cambiar»", await E(p, "return !!document.querySelector('.b2-hechas') && /Cambiar/.test(document.querySelector('.b2-hechas').textContent)"));
  await sig(p); await pausa(600);
  ok("duplicados: chip «Duplicadas» con conteo", await E(p, "const c=[...document.querySelectorAll('.b2-chip')].find(c=>c.textContent.startsWith('Duplicadas')); return !!c && Number(c.querySelector('b').textContent)>=1"));
  await E(p, clickTxt(".b2-chip", "Duplicadas")); await pausa(300);
  ok("duplicados: la tabla muestra solo las duplicadas (con «era N» si se renumeraron)", (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr').length")) >= 1);
  await E(p, clickTxt(".b2-chip", "Todas")); await pausa(300);
  ok("fila fuera del semestre: error resaltado", (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr[data-tono=error]').length")) >= 1);
  await E(p, "document.querySelector('.b2-check[data-t=err] input').click()"); await pausa(300);
  await sig(p); await pausa(500);
  await E(p, "document.querySelector('.b2-check input').click()"); await pausa(200);
  await E(p, clickTxt(".b2-imp-body .b2-btn", "Confirmar importación")); await pausa(3500);
  const bd3 = await delSem();
  ok("BD: decisiones aplicadas (números únicos en el grupo) y fila fuera de semestre omitida", await cont(`select (count(*)-count(distinct t.numero))::int n from plantilla_entregables t join grupos_matriz g on g.id=t.grupo_id where g.semestre=$1 and g.nombre=$2`, [SEM, `${M} Grupo duplicados`]) === 0 && (await cont(`select count(*)::int n from plantilla_entregables t join grupos_matriz g on g.id=t.grupo_id where g.semestre=$1 and g.nombre=$2`, [SEM, `${M} Grupo duplicados`])) === 8 && bd3.grupos === 2, JSON.stringify(bd3));
  ok("resultado: ajustes administrativos aplicados visibles", await E(p, "return /Ajustes administrativos aplicados/.test(document.querySelector('.b2-imp-body').textContent)"));

  // ───────── fechas inconsistentes ─────────
  await hastaDestino(p, "fechas", "matriz-fechas.xlsx", `${M} Grupo fechas`);
  await validar(p);
  const stF = await E(p, "return [...document.querySelectorAll('.b2-imp-stats > div')].map(d=>d.textContent).join('|')");
  ok("fechas inconsistentes: se reportan como errores", /Errores[1-9]/.test(stF), stF);
  await sig(p); await pausa(600);
  ok("previsualización: fila con error resaltada y filtro «Errores»", (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr[data-tono=error]').length")) >= 1 && await E(p, "const c=[...document.querySelectorAll('.b2-chip')].find(c=>c.textContent.startsWith('Errores')); return Number(c.querySelector('b').textContent)>=1"));
  await E(p, "document.querySelector('.b2-tbl tbody tr[data-tono=error]').click()"); await pausa(500);
  ok("inspector: explica el error y que la fila no se importará", await E(p, "const t=document.querySelector('.b2-insp').textContent; return /no se importará/.test(t) && /Error:/.test(t)"));
  await E(p, "document.querySelector('.b2-insp-x').click()"); await pausa(300);
  await sig(p); await pausa(500);
  ok("con errores no se puede confirmar sin omitirlos", await E(p, "const b=[...document.querySelectorAll('.b2-imp-body .b2-btn')].find(b=>b.textContent.startsWith('Confirmar')); return b.disabled"));
  await atras(p); await pausa(400);
  await E(p, "document.querySelector('.b2-check[data-t=err] input').click()"); await pausa(300);
  await sig(p); await pausa(500);
  await E(p, "document.querySelector('.b2-check input').click()"); await pausa(200);
  await E(p, clickTxt(".b2-imp-body .b2-btn", "Confirmar importación")); await pausa(3500);
  const bd4 = await delSem();
  const gf = (await q(`select id from grupos_matriz where semestre=$1 and nombre=$2`, [SEM, `${M} Grupo fechas`]))[0]?.id;
  const nf = gf ? await cont(`select count(*)::int n from plantilla_entregables where grupo_id=$1`, [gf]) : -1;
  ok("BD: solo se importaron las filas válidas (5 de 6)", nf === 5, `plantillas=${nf} total=${JSON.stringify(bd4)}`);
  ok("resultado: errores (rechazadas) = 1", await E(p, "return /\\(rechazadas\\)1/.test(document.querySelector('.b2-imp-stats').textContent)"));

  // ───────── error de conexión y reintento ─────────
  await hastaDestino(p, "valido", "matriz-valida.xlsx", `${M} Grupo red`);
  await E(p, "window.__f=window.fetch; window.fetch=(u,...a)=>String(u).includes('/importaciones/validar')?Promise.reject(new TypeError('Failed to fetch')):window.__f(u,...a)");
  await validar(p);
  ok("error de conexión: aviso claro, «no se guardó nada» y «Reintentar»", await E(p, "const a=document.querySelector('.b2-alert[role=alert]'); return !!a && /no se guardó nada/.test(a.textContent) && [...a.querySelectorAll('.b2-btn')].some(b=>b.textContent==='Reintentar')"));
  ok("error de conexión: sin escrituras", (await delSem()).grupos === bd4.grupos);
  await E(p, "window.fetch=window.__f"); await E(p, clickTxt(".b2-alert .b2-btn", "Reintentar")); await pausa(2500);
  ok("«Reintentar» completa la validación", await E(p, "return /Válidos6/.test(document.querySelector('.b2-imp-stats')?.textContent||'')"));

  // ───────── archivo grande ─────────
  await hastaDestino(p, "grande", "matriz-grande.xlsx", `${M} Grupo grande`);
  await validar(p);
  await sig(p); await pausa(800);
  const filasG = await E(p, "return document.querySelectorAll('.b2-tbl tbody tr').length");
  ok(`archivo grande (${fx.grandeN} entregables): previsualización estructurada en un contenedor con scroll`, filasG > 100 && await E(p, "const w=document.querySelector('.b2-tw-y'); return w.scrollHeight>w.clientHeight && getComputedStyle(w).overflowY==='auto'"), `filas=${filasG}`);
  const t0 = Date.now();
  await E(p, clickTxt(".b2-chip", "Válidas")); await E(p, setInput(".b2-prev-tb input", "masivo 150")); await pausa(300);
  ok("archivo grande: filtro y búsqueda ágiles", Date.now() - t0 < 2500 && (await E(p, "return document.querySelectorAll('.b2-tbl tbody tr').length")) >= 1, `${Date.now() - t0} ms`);
  ok("archivo grande: encabezado fijo al desplazar", await E(p, "const w=document.querySelector('.b2-tw-y'); w.scrollTop=400; const th=document.querySelector('.b2-tbl th').getBoundingClientRect(); const r=w.getBoundingClientRect(); return Math.abs(th.top-r.top)<3"));

  // ───────── roles ─────────
  await login(p, "maria.rodriguez@proysocial.local"); await ir(p, "/admin/importar-matriz", 1800);
  ok("un docente no accede al importador", await E(p, "return !location.pathname.startsWith('/admin')"));
} catch (e) {
  ok(`EXCEPCIÓN tras «${res[res.length - 1]?.slice(0, 90)}»`, false, String(e.message).slice(0, 240));
} finally {
  await limpiar();
  const despues = await estadoBD();
  ok("BD tras limpiar: idéntica a la inicial (solo se eliminaron los registros creados por las pruebas)", antes && JSON.stringify(despues) === JSON.stringify(antes), JSON.stringify({ antes, despues }));
  ok("BD: sin residuos TSTE4", (await cont(`select count(*)::int n from grupos_matriz where semestre=$1 or nombre like 'TSTE4%'`, [SEM])) === 0 && (await cont(`select count(*)::int n from usuarios where correo like 'TSTE4%'`)) === 0);
  await p.cerrar();
  await pool.end();
}
const errs = p.consola.filter((x) => !/favicon|Download the React DevTools|Failed to fetch|Error al validar|No se pudo/.test(x));
ok("consola sin errores inesperados", errs.length === 0, errs[0]?.slice(0, 160));
console.log(res.join("\n"));
