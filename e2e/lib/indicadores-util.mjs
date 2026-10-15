// Utilidades de las pruebas de Indicadores y Métricas (Etapa 5A): formato es-CO, lectura de la interfaz y cálculo INDEPENDIENTE
// de agregados a partir del JSON de la API, para comparar lo que muestra la pantalla con lo que entrega el backend.
import { E, pausa } from "./helpers.mjs";

const f = (v, d) => Number(v).toLocaleString("es-CO", { maximumFractionDigits: d });
export const f1 = (v) => f(v, 1);
export const n0 = (v) => f(v, 0);
export const pc = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : `${f1(v)}%`);
export const pp = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${f1(Math.abs(v))} pp`;
export const round1 = (v) => Math.round(v * 10) / 10;

/** Agregados con la misma definición que `totales` de GET /admin/avance-consolidado (cálculo propio de la prueba). */
export function agregar(docs) {
  const n = docs.length;
  const sum = (g) => docs.reduce((s, d) => s + g(d), 0);
  const con = docs.filter((d) => d.total_entregables > 0);
  const avg = (a) => (a.length ? round1(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  return {
    docentes: n,
    global: n ? round1(sum((d) => d.avance_global) / n) : 0,
    aprobado: avg(con.map((d) => d.avance_aprobado)),
    esperado: avg(con.map((d) => d.avance_esperado)),
    retraso: docs.filter((d) => d.entregables_vencidos > 0).length,
    revisar: sum((d) => d.pendientes_revision),
    observados: sum((d) => d.observados),
    vencidos: sum((d) => d.entregables_vencidos),
    aprobados: sum((d) => d.aprobados),
    total: sum((d) => d.total_entregables),
    rojo: docs.filter((d) => d.semaforo === "rojo").length,
    amarillo: docs.filter((d) => d.semaforo === "amarillo").length,
    verde: docs.filter((d) => d.semaforo === "verde").length,
  };
}
/** Valores esperados de la tira de indicadores del avance, en el formato de la pantalla. */
export function kpisAvance(a) {
  return {
    "Docentes": n0(a.docentes), "Reportado prom.": pc(a.global), "Aprobado prom.": pc(a.aprobado), "Esperado a la fecha": pc(a.esperado),
    "Aprobado − esperado": pp(round1(a.aprobado - a.esperado)), "Con retraso": n0(a.retraso), "Por revisar": n0(a.revisar),
    "Observados": n0(a.observados), "Vencidos": n0(a.vencidos), "Riesgo crítico": n0(a.rojo),
  };
}

/** Instala (o actualiza) un envoltorio de window.fetch en la página: registra URLs y permite retrasar o hacer fallar endpoints. */
export const instalarFetch = (p, reglas = []) => E(p, `
  if(!window.__f0){ window.__f0=window.fetch; window.__urls=[]; window.fetch=function(u,...a){
    const url=String(u&&u.url?u.url:u); window.__urls.push(url);
    const r=(window.__reglas||[]).find(r=>url.includes(r.incluye));
    if(r&&r.falla) return Promise.reject(new TypeError('Failed to fetch'));
    if(r&&r.retraso) return new Promise(res=>setTimeout(res,r.retraso)).then(()=>window.__f0(u,...a));
    return window.__f0(u,...a); } }
  window.__reglas=${JSON.stringify(reglas)}; window.__urls=[]; return true;`);
export const urlsVistas = (p) => E(p, "return JSON.stringify(window.__urls||[])").then(JSON.parse);

/** Lee una tira <dl> de indicadores: { etiqueta: valor principal }. */
export const leerKpis = (p, ambito) => E(p, `
  const dl=document.querySelector(${JSON.stringify(ambito)}); if(!dl) return 'null';
  return JSON.stringify(Object.fromEntries([...dl.querySelectorAll(':scope > div')].map(d=>[d.querySelector('dt').textContent.trim(), (d.querySelector('dd').childNodes[0]?.textContent??'').trim()])))`).then(JSON.parse);

/** Filas de una tabla B2 (DataTable) como { cabeceras, filas[][] } según su aria-label (null = la única/primera). */
export const leerTabla = (p, etiqueta = null) => E(p, `
  const t=${etiqueta ? `document.querySelector('[role=table][aria-label=${JSON.stringify(etiqueta)}]')` : "document.querySelector('.b2-ana [role=table]')"}; if(!t) return 'null';
  const txt=(c)=>c.innerText.replace(/\\s+/g,' ').trim();
  return JSON.stringify({cabeceras:[...t.querySelectorAll('[role=columnheader]')].map(txt), filas:[...t.querySelectorAll('.b2-tabla-r')].map(r=>[...r.querySelectorAll('[role=cell]')].map(txt))})`).then(JSON.parse);

export const esperar = (p, expr, etiqueta = "", ms = 10000) => p.esperar(expr, { ms, etiqueta }).then(() => true).catch(() => false);
/** Espera el fin de la carga de una pantalla analítica (esqueleto, gráficos o estado vacío/alerta). */
export async function cargaAna(p) {
  await esperar(p, "!document.querySelector('.b2-ana .b2-skel')", "fin del esqueleto", 14000);
  await esperar(p, "document.querySelector('.b2-ana .b2-fig, .b2-ana .b2-tabla-r, .b2-ana .b2-ml-i, .b2-ana .b2-adm-vacio-c, .b2-ana .b2-alert')", "contenido de la pantalla", 10000);
  await pausa(500);
}
