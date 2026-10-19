// Capturas de Indicadores y Métricas B2 (Etapa 5A). SOLO LECTURA: abre pantallas, aplica filtros y abre inspectores sin guardar nada.
// Genera además comparacion-api.md: valor mostrado en la interfaz vs. valor de la API para los indicadores principales.
// Uso: npm run e2e -- capturas-indicadores            → escribe en E2E_OUT (def. e2e/salida/)
//      node e2e/suites/capturas-indicadores.mjs <carpeta>   → p. ej. docs/b2-integracion/etapa5a
import fs from "node:fs";
import path from "node:path";
import { lanzar, pausa, iniciarSuite, guardaBD, login, api, ir, E, linea, OUT, RAIZ, ADMIN, setInput, setSel } from "../lib/helpers.mjs";
import { n0, pc, pp, leerKpis, leerTabla, cargaAna, esperar } from "../lib/indicadores-util.mjs";
iniciarSuite("capturas-indicadores");
const { pool, q } = await guardaBD();
const destino = process.argv[2] ? path.resolve(RAIZ, process.argv[2]) : OUT;
fs.mkdirSync(destino, { recursive: true });
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));
const cmp = [];
const comparar = (pantalla, metrica, ui, apiV) => { cmp.push({ pantalla, metrica, ui: String(ui), api: String(apiV), ok: String(ui) === String(apiV) }); };

const clic = (p, txt, ambito = "document") => E(p, `const b=[...${ambito}.querySelectorAll('button,a')].find(x=>x.offsetParent!==null&&!x.disabled&&(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
const chip = (p, txt) => E(p, `const b=[...document.querySelectorAll('.b2-chips button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(txt)})); if(!b) return false; b.click(); return true`);
const selValor = (p, aria, v) => E(p, setSel(`select[aria-label=${JSON.stringify(aria)}]`, v));
const buscar = (p, aria, v) => E(p, setInput(`input[aria-label=${JSON.stringify(aria)}]`, v));
const abrir = async (p, r) => { await ir(p, r, 1500); await cargaAna(p); };
const primeraFila = (p, etq = null) => E(p, `const t=${etq ? `document.querySelector('[role=table][aria-label=${JSON.stringify(etq)}]')` : "document"}; const r=(t||document).querySelector('.b2-ml-i, .b2-tabla-r'); if(!r) return false; r.click(); return true`);
/** Ajusta la altura de la ventana al contenido de la página (la columna principal se desplaza por dentro) y captura. */
const foto = async (p, nombre, { w, completa = true } = {}) => {
  await pausa(700);
  const medida = await E(p, "const m=document.querySelector('.b2-vista-main'); const insp=document.querySelector('aside.b2-insp[data-open=\"true\"]'); return JSON.stringify({sh:m?m.scrollHeight:0, cab:m?m.getBoundingClientRect().top:0, ih:innerHeight, iw:innerWidth, insp:insp?insp.scrollHeight+insp.getBoundingClientRect().top:0})").then(JSON.parse);
  const alto = completa ? Math.min(3400, Math.max(medida.ih, Math.round(medida.sh + medida.cab + 70), medida.insp)) : medida.ih;
  if (alto !== medida.ih) { await p.tamano(medida.iw, alto); await pausa(900); }
  await p.foto(path.join(destino, `${nombre}.png`));
  if (alto !== medida.ih) { await p.tamano(medida.iw, medida.ih); await pausa(500); }
  ok(`captura ${nombre}`, fs.existsSync(path.join(destino, `${nombre}.png`)) && await E(p, "return document.documentElement.scrollWidth <= innerWidth + 2"));
};

const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  const sems = await q("select codigo, activo from semestres order by codigo desc");
  const SEM = sems.find((s) => s.activo).codigo;
  const SEM2 = sems.find((s) => !s.activo).codigo;
  await login(p, ADMIN);
  const A = (await api(p, `/admin/avance-consolidado?semestre=${SEM}`)).d;
  const G = (await api(p, `/admin/indicadores-grupo?semestre=${SEM}`)).d.grupos;
  const M = (await api(p, "/admin/metricas")).d;

  /* ── 1440 ── */
  await p.tamano(1440, 900);
  await abrir(p, "/admin/avance");
  const Ka = await leerKpis(p, 'section[aria-label="Indicadores del consolidado"] dl');
  const tot = A.totales;
  const sum = (f) => A.docentes.reduce((s, d) => s + f(d), 0);
  for (const [k, ui, v] of [
    ["Docentes", Ka["Docentes"], n0(tot.docentes)], ["Reportado prom.", Ka["Reportado prom."], pc(tot.promedio_global)], ["Aprobado prom.", Ka["Aprobado prom."], pc(tot.promedio_aprobado)],
    ["Esperado a la fecha", Ka["Esperado a la fecha"], pc(tot.promedio_esperado)], ["Aprobado − esperado", Ka["Aprobado − esperado"], pp(Math.round((tot.promedio_aprobado - tot.promedio_esperado) * 10) / 10)],
    ["Con retraso", Ka["Con retraso"], n0(tot.con_retraso)], ["Por revisar", Ka["Por revisar"], n0(tot.pendientes_revision)], ["Observados", Ka["Observados"], n0(sum((d) => d.observados))],
    ["Vencidos", Ka["Vencidos"], n0(sum((d) => d.entregables_vencidos))], ["Riesgo crítico", Ka["Riesgo crítico"], n0(tot.semaforo.rojo)],
  ]) comparar(`Avance consolidado (${SEM})`, k, ui, v);
  const Ta = await leerTabla(p, "Avance por docente");
  for (const d of A.docentes.slice(0, 2)) {
    const f = Ta.filas.find((r) => r[0].startsWith(d.nombre)); const ix = (h) => Ta.cabeceras.indexOf(h);
    comparar(`Avance consolidado — ${d.nombre}`, "Reportado", f?.[ix("Reportado")], pc(d.avance_global));
    comparar(`Avance consolidado — ${d.nombre}`, "Aprobado", f?.[ix("Aprobado")], pc(d.avance_aprobado));
    comparar(`Avance consolidado — ${d.nombre}`, "Esperado", f?.[ix("Esperado")], pc(d.avance_esperado));
    comparar(`Avance consolidado — ${d.nombre}`, "Brecha", f?.[ix("Brecha")], pp(d.brecha));
    comparar(`Avance consolidado — ${d.nombre}`, "Vencidos", f?.[ix("Vencidos")], n0(d.entregables_vencidos));
  }
  await foto(p, "avance-1440");
  await primeraFila(p, "Avance por docente"); await pausa(600); await foto(p, "avance-inspector-1440", { completa: false });
  await abrir(p, "/admin/avance");
  await chip(p, "Crítico"); await selValor(p, "Programa", A.docentes[0].programa); await pausa(700); await foto(p, "avance-filtrado-1440");
  await abrir(p, "/admin/avance"); await selValor(p, "Semestre", SEM2); await pausa(1500); await cargaAna(p); await foto(p, "avance-vacio-1440", { completa: false });

  await abrir(p, "/admin/indicadores");
  const Ki = await leerKpis(p, ".b2-ana-ind-kpis");
  const sg = (k) => G.reduce((a, g) => a + (Number(g[k]) || 0), 0);
  comparar(`Indicadores por grupo (${SEM})`, "Grupos activos", Ki["Grupos activos"], n0(G.length));
  comparar(`Indicadores por grupo (${SEM})`, "Docentes asignados", Ki["Docentes asignados"], n0(sg("num_docentes")));
  comparar(`Indicadores por grupo (${SEM})`, "Entregables en plantillas", Ki["Entregables en plantillas"], n0(sg("num_plantilla_entregables")));
  comparar(`Indicadores por grupo (${SEM})`, "Indicadores totales", Ki["Indicadores totales"], n0(sg("num_proyectos") + sg("num_actividades") + sg("num_convenios_nuevos") + sg("num_convenios_dinamizados")));
  comparar(`Indicadores por grupo (${SEM})`, "Horas totales", Ki["Horas totales"], n0(sg("horas_totales")));
  const Ti = await leerTabla(p, `Indicadores por grupo, semestre ${SEM}`);
  const g0 = G[0]; const f0 = Ti.filas.find((r) => r[0] === g0.nombre); const ix0 = (h) => Ti.cabeceras.indexOf(h);
  comparar(`Indicadores por grupo — ${g0.nombre.slice(0, 22)}…`, "Horas", f0?.[ix0("Horas")], n0(g0.horas_totales));
  comparar(`Indicadores por grupo — ${g0.nombre.slice(0, 22)}…`, "Proyectos", f0?.[ix0("Proyectos")], n0(g0.num_proyectos));
  comparar(`Indicadores por grupo — ${g0.nombre.slice(0, 22)}…`, "Entregables", f0?.[ix0("Entregables")], n0(g0.num_plantilla_entregables));
  await foto(p, "indicadores-1440");
  await primeraFila(p); await pausa(600); await foto(p, "indicadores-inspector-1440", { completa: false });
  await abrir(p, "/admin/indicadores"); await chip(p, "Nuevo"); await pausa(700); await foto(p, "indicadores-filtrado-1440");

  await abrir(p, "/admin/reportes");
  const Km = await leerKpis(p, ".b2-ana .b2-inds"); const r = M.resumen;
  comparar("Reportes y métricas", "Total de reportes", Km["Total de reportes"], n0(r.total_reportes));
  comparar("Reportes y métricas", "Aprobados", Km["Aprobados"], n0(r.aprobados));
  comparar("Reportes y métricas", "Pendientes de revisión", Km["Pendientes de revisión"], n0(r.pendientes));
  comparar("Reportes y métricas", "Con observaciones", Km["Con observaciones"], n0(r.con_observaciones));
  comparar("Reportes y métricas", "% de aprobación", Km["% de aprobación"], pc(r.porcentaje_aprobacion));
  const meses = JSON.parse(await E(p, "return JSON.stringify([...document.querySelectorAll('.b2-cg-c')].map(c=>c.getAttribute('aria-label')))"));
  const oct = M.por_mes.find((m) => m.total > 0);
  if (oct) comparar(`Reportes y métricas — por mes (${oct.mes})`, "Aprobados / Observados / Pendientes", (meses.find((l) => l.startsWith(oct.mes)) || "").split(": ").slice(1).join(": ").replace(/Aprobados (\d+), Observados (\d+), Pendientes (\d+)/, "$1 / $2 / $3"), `${oct.aprobados} / ${oct.observados} / ${oct.pendientes}`);
  const Tm = await leerTabla(p, "Docentes con menor avance"); const at = M.top_atrasados[0]; const fa = Tm.filas.find((x) => x[0].startsWith(at.nombre)); const ixm = (h) => Tm.cabeceras.indexOf(h);
  comparar(`Reportes y métricas — ${at.nombre}`, "Vencidos", fa?.[ixm("Vencidos")], n0(at.entregables_vencidos));
  comparar(`Reportes y métricas — ${at.nombre}`, "Aprobado", fa?.[ixm("Aprobado")], pc(at.porcentaje_aprobado));
  await foto(p, "metricas-1440");
  await primeraFila(p, "Docentes con menor avance"); await pausa(600); await foto(p, "metricas-inspector-1440", { completa: false });
  await abrir(p, "/admin/reportes"); await selValor(p, "Filtrar por semestre", SEM2);
  await esperar(p, `new RegExp('corresponden al semestre ${SEM2}').test(document.querySelector('.b2-aviso-sem')?.textContent||'')`, "métricas del otro semestre", 8000); await pausa(500);
  await E(p, "document.querySelector('.b2-ana-met-vacios input').click()"); await pausa(800); await foto(p, "metricas-filtrado-1440");

  /* ── 1280 y 820 ── */
  for (const w of [1280, 820]) {
    await p.tamano(w, w === 820 ? 1100 : 800);
    if (w === 1280) { await abrir(p, "/admin/avance"); await foto(p, "avance-1280"); }
    if (w === 820) {
      await abrir(p, "/admin/avance"); await foto(p, "avance-820");
      await abrir(p, "/admin/indicadores"); await foto(p, "indicadores-820");
      await abrir(p, "/admin/reportes"); await foto(p, "metricas-820");
    }
  }

  /* ── 390 ── */
  await p.tamano(390, 844);
  await abrir(p, "/admin/avance"); await foto(p, "avance-390");
  await primeraFila(p); await pausa(700); await foto(p, "avance-inspector-390", { completa: false });
  await abrir(p, "/admin/avance"); await chip(p, "Crítico"); await pausa(700); await foto(p, "avance-filtrado-390");
  await abrir(p, "/admin/indicadores"); await foto(p, "indicadores-390");
  await abrir(p, "/admin/reportes"); await foto(p, "metricas-390");

  /* ── comparacion-api.md ── */
  const fila = (c) => `| ${c.pantalla} | ${c.metrica} | ${c.ui} | ${c.api} | ${c.ok ? "Sí" : "**NO**"} |`;
  const md = [
    "# Comparación interfaz ↔ API (Etapa 5A)",
    "",
    `Generado por \`e2e/suites/capturas-indicadores.mjs\` contra \`proysocial_dev\` (semestre activo ${SEM}). «Valor en la interfaz» se lee del DOM; «Valor en la API» sale de la respuesta real de \`/admin/avance-consolidado\`, \`/admin/indicadores-grupo\` y \`/admin/metricas\` con el token de administrador, formateada igual que la interfaz (es-CO, 1 decimal). La suite \`indicadores\` repite y amplía estas comparaciones (filas completas, gráficos, filtros).`,
    "",
    "| Pantalla | Métrica | Valor en la interfaz | Valor en la API | Coincide |",
    "|---|---|---|---|---|",
    ...cmp.map(fila),
    "",
    `Resultado: ${cmp.filter((c) => c.ok).length} de ${cmp.length} comparaciones coinciden.`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(destino, "comparacion-api.md"), md, "utf8");
  for (const c of cmp) ok(`comparación ${c.pantalla} · ${c.metrica}`, c.ok, `UI=${c.ui} API=${c.api}`);
} finally {
  await p.cerrar();
  await pool.end();
  console.log(res.join("\n"));
  console.log(`Capturas en ${destino}`);
}
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
