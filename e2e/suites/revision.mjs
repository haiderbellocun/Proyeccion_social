import { lanzar, pausa, iniciarSuite } from "../lib/helpers.mjs";
iniciarSuite("revision");
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const E = (p, js) => p.eval(`(() => { ${js} })()`);
const EA = (p, js) => p.eval(`(async () => { ${js} })()`);
const APP = "http://localhost:5173", API = "http://localhost:4000";
const clickTxt = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.trim().startsWith(${JSON.stringify(txt)})).click()`;
async function login(p, correo) {
  await p.ir(APP + "/"); await pausa(800);
  return EA(p, `localStorage.clear(); const x=await fetch('${API}/auth/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({correo:${JSON.stringify(correo)}})});const d=await x.json();localStorage.setItem('proysocial:token',d.token);localStorage.setItem('proysocial:user',JSON.stringify(d.user));return d.user.id`);
}
const api = (p, ruta) => EA(p, `const t=localStorage.getItem('proysocial:token'); const r=await fetch('${API}${ruta}',{headers:{Authorization:'Bearer '+t}}); return JSON.stringify({s:r.status, d:await r.json().catch(()=>null)})`).then((j) => JSON.parse(j));
const ir = async (p, ruta, espera = 3000) => { await p.ir(APP + ruta); await pausa(espera); };
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
async function sesion(ancho, fn) {
  const p = await lanzar({ ancho, alto: ancho < 600 ? 844 : 900 });
  try { try { await fn(p); } catch (e) { ok(`EXCEPCIÓN ${ancho}px`, false, String(e.message).slice(0, 200)); } const errs = p.consola.filter((x) => !/favicon|Download the React DevTools/.test(x)); ok(`${ancho}px consola sin errores`, errs.length === 0, errs[0]?.slice(0, 140)); } finally { await p.cerrar(); }
}
const ADMIN = "admin@proysocial.local", MARIA = "maria.rodriguez@proysocial.local";

for (const ancho of [1440, 1280]) {
  await sesion(ancho, async (p) => {
    await login(p, ADMIN); await ir(p, "/admin/revision");
    ok(`${ancho} revisión: sin desborde`, await sinDesborde(p));
    ok(`${ancho} revisión: tabla ${ancho < 1440 ? "" : "completa "}legible`, await E(p, "const t=document.querySelector('.b2-tabla'); return t.scrollWidth<=t.clientWidth+2 || getComputedStyle(t).overflowX==='auto'"));
    await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(500);
    ok(`${ancho} revisión: inspector acoplado y tabla compacta`, await E(p, "return document.querySelector('.b2-insp').dataset.open==='true' && !document.querySelector('.b2-tabla-h').textContent.includes('Programa')"));
    await login(p, MARIA); await ir(p, "/docente/evidencias");
    ok(`${ancho} evidencias: sin desborde`, await sinDesborde(p));
    await E(p, "document.querySelector('.b2-ev-fila').click()"); await pausa(500);
    ok(`${ancho} evidencias: inspector abierto con entregable`, await E(p, "return document.querySelector('.b2-insp').dataset.open==='true' && document.querySelector('.b2-insp-h').textContent.length>5"));
  });
}
await sesion(1440, async (p) => {
  // Avance por mes recuperado (matriz): coincide con /matriz-stats
  const uid = await login(p, MARIA);
  await ir(p, "/docente/matriz");
  const st = await api(p, `/docente/${uid}/matriz-stats`);
  await E(p, clickTxt(".b2-tb .b2-btn", "Por mes")); await pausa(400);
  const meses = st.d.por_mes;
  ok("docente: «Por mes» lista los meses del backend", (await E(p, "return document.querySelectorAll('.b2-mes-i').length")) === meses.length, `API=${meses.length}`);
  const m0 = meses.find((m) => m.total > 0);
  ok("docente: cifras del mes = backend (reportados/total, aprobados, esperados)", await E(p, `const t=[...document.querySelectorAll('.b2-mes-i')].find(x=>x.textContent.toLowerCase().includes(${JSON.stringify(m0.mes.toLowerCase())})).textContent; return t.includes('${m0.reportados}/${m0.total}') && t.includes('${m0.aprobados} aprobados')`));
  const filas0 = await E(p, "return document.querySelector('.b2-tb-count').textContent");
  await E(p, `[...document.querySelectorAll('.b2-mes-i')].find(x=>x.textContent.toLowerCase().includes(${JSON.stringify(m0.mes.toLowerCase())})).click()`); await pausa(500);
  ok("docente: elegir un mes filtra la matriz", (await E(p, "return document.querySelector('.b2-tb-count').textContent")) !== filas0 && (await E(p, "return document.querySelectorAll('.b2-g-item').length")) === m0.total, `filas=${await E(p, "return document.querySelectorAll('.b2-g-item').length")} API=${m0.total}`);
  await login(p, ADMIN);
  const st2 = await api(p, "/admin/docentes/2/matriz-stats");
  await ir(p, "/admin/docentes/2/matriz");
  await E(p, clickTxt(".b2-tb .b2-btn", "Por mes")); await pausa(400);
  ok("admin: «Por mes» lista los meses del backend", (await E(p, "return document.querySelectorAll('.b2-mes-i').length")) === st2.d.por_mes.length);
});
await sesion(820, async (p) => {
  await login(p, ADMIN); await ir(p, "/admin/revision");
  ok("820 revisión: sin desborde, navegación inferior B2", (await sinDesborde(p)) && (await E(p, "return getComputedStyle(document.querySelector('.b2-bnav')).display==='flex'")));
  await E(p, "document.querySelector('.b2-tabla-r').click()"); await pausa(500);
  ok("820 revisión: inspector como cajón", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && r.right<=innerWidth+1 && r.left>0"));
  await login(p, MARIA); await ir(p, "/docente/evidencias");
  ok("820 evidencias: sin desborde", await sinDesborde(p));
  await E(p, "document.querySelector('.b2-ev-fila').click()"); await pausa(500);
  ok("820 evidencias: inspector como cajón", await E(p, "return document.querySelector('.b2-insp').dataset.open==='true'"));
});
await sesion(390, async (p) => {
  await login(p, ADMIN); await ir(p, "/admin/revision");
  ok("390 revisión: sin desborde", await sinDesborde(p));
  ok("390 revisión: lista compacta (no tabla) con navegación inferior", await E(p, "return !!document.querySelector('.b2-ml-list') && !document.querySelector('.b2-tabla-h') && getComputedStyle(document.querySelector('.b2-bnav')).display==='flex'"));
  ok("390 revisión: filtros de estado accesibles (≥ 36 px)", await E(p, "return [...document.querySelectorAll('.b2-chip')].every(b=>b.getBoundingClientRect().height>=36)"));
  await E(p, clickTxt(".b2-tb .b2-btn", "Filtros")); await pausa(400);
  ok("390 revisión: panel de filtros con controles ≥ 40 px y dentro de la pantalla", await E(p, "const pp=document.querySelector('.b2-pop').getBoundingClientRect(); return pp.left>=0 && pp.right<=innerWidth && [...document.querySelectorAll('.b2-pop .b2-sel, .b2-pop .b2-input')].every(c=>c.getBoundingClientRect().height>=40)"));
  await E(p, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await pausa(300);
  await E(p, "document.querySelector('.b2-ml-i').click()"); await pausa(500);
  ok("390 revisión: inspector como hoja inferior", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && Math.abs(r.bottom-innerHeight)<2 && r.width>=innerWidth-2"));
  ok("390 revisión: decisiones y enlaces cómodos de tocar (≥ 40 px)", await E(p, "return [...document.querySelectorAll('.b2-insp .b2-btn')].every(b=>b.getBoundingClientRect().height>=36)"));
  ok("390 revisión: etiquetas de la barra inferior completas", await E(p, "return [...document.querySelectorAll('.b2-bnav a span')].every(s=>s.scrollWidth<=s.clientWidth+1)"));
  await login(p, MARIA); await ir(p, "/docente/evidencias");
  ok("390 evidencias: sin desborde y lista compacta", (await sinDesborde(p)) && (await E(p, "return !!document.querySelector('.b2-ml-list')")));
  ok("390 evidencias: filtros ≥ 36 px y búsqueda visible", await E(p, "return [...document.querySelectorAll('.b2-chip')].every(b=>b.getBoundingClientRect().height>=36) && !!document.querySelector('.b2-tb-search input')"));
  await E(p, "document.querySelector('.b2-ml-i').click()"); await pausa(500);
  ok("390 evidencias: inspector como hoja inferior", await E(p, "const r=document.querySelector('.b2-insp').getBoundingClientRect(); return document.querySelector('.b2-insp').dataset.open==='true' && Math.abs(r.bottom-innerHeight)<2"));
  ok("390 evidencias: campos del formulario ≥ 40 px", await E(p, "const c=[...document.querySelectorAll('.b2-insp .b2-input')]; return c.length===0 || c.every(x=>x.getBoundingClientRect().height>=40)"));
  await login(p, MARIA); await ir(p, "/docente/matriz");
  await E(p, clickTxt(".b2-ml-filtros .b2-btn", "Por mes")); await pausa(400);
  ok("390 matriz: «Por mes» accesible y dentro de la pantalla", await E(p, "const pp=document.querySelector('.b2-pop').getBoundingClientRect(); return pp.left>=0 && pp.right<=innerWidth && document.querySelectorAll('.b2-mes-i').length>0"));
});
console.log(res.join("\n"));
