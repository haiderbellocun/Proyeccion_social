// Etapa 5A: Indicadores y Métricas B2 (Avance consolidado, Indicadores por grupo, Reportes y métricas) contra la app real y proysocial_dev.
// SOLO LECTURA: no escribe en la BD (se verifica comparando conteos antes/después). Compara la interfaz con las respuestas reales de la API.
// Uso: npm run e2e -- indicadores        (IND_SOLO=avance,grupos,metricas,estados,permisos,a11y,responsive,regresion para depurar)
import { lanzar, pausa, iniciarSuite, guardaBD, instantanea, login, api, ir, E, EA, linea, APP, API, ADMIN, setInput, setSel } from "../lib/helpers.mjs";
import { f1, n0, pc, pp, round1, agregar, kpisAvance, instalarFetch, urlsVistas, leerKpis, leerTabla, esperar, cargaAna } from "../lib/indicadores-util.mjs";
iniciarSuite("indicadores");
const { q } = await guardaBD();
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));
const SOLO = (process.env.IND_SOLO || "").split(",").filter(Boolean);
const quiere = (id) => SOLO.length === 0 || SOLO.includes(id);
const DOC = "maria.rodriguez@proysocial.local";
const visible = "x.offsetParent!==null";

/* ───────── utilidades de interfaz ───────── */
const clic = async (p, txt, ambito = "document", ms = 4000) => {
  const t0 = Date.now();
  do {
    const hecho = await E(p, `const b=[...${ambito}.querySelectorAll('button,a,summary')].find(x=>${visible}&&!x.disabled&&(x.getAttribute('aria-label')||x.textContent).trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
    if (hecho) return true;
    await pausa(250);
  } while (Date.now() - t0 < ms);
  return false;
};
const clicEmpieza = (p, sel, txt) => E(p, `const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>${visible}&&x.textContent.trim().startsWith(${JSON.stringify(txt)})); if(!b) return false; b.click(); return true`);
const selValor = (p, aria, v) => E(p, setSel(`select[aria-label=${JSON.stringify(aria)}]`, v));
const valorSel = (p, aria) => E(p, `const s=document.querySelector('select[aria-label=${JSON.stringify(aria)}]'); return s?s.value:null`);
const escribir = (p, aria, v) => E(p, setInput(`input[aria-label=${JSON.stringify(aria)}]`, v));
const inspAbierto = (p) => E(p, "return !!document.querySelector('aside.b2-insp[data-open=\"true\"]')");
const inspTexto = (p) => E(p, "return document.querySelector('aside.b2-insp[data-open=\"true\"]')?.innerText.replace(/\\s+/g,' ') ?? ''");
const sinDesborde = (p) => E(p, "return document.documentElement.scrollWidth <= innerWidth + 2");
const ruta = (p) => E(p, "return location.pathname + location.search");
const tecla = async (p, key, code, vk) => { await p.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk }); await p.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); };
const irA = async (p, r) => { await ir(p, r, 1200); await cargaAna(p); };
const filasTabla = (p, etq = null) => leerTabla(p, etq);
const nombres = (t) => t.filas.map((f) => f[0].split(" ").slice(0, 2).join(" "));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const marcaConsola = (p) => p.consola.length;
const consolaDesde = (p, n) => p.consola.slice(n);
const sinNombre = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const seccion = async (p, id, nombre, fn, esperados = []) => {
  if (!quiere(id)) return;
  const c0 = marcaConsola(p);
  try { await fn(); } catch (e) { ok(`EXCEPCIÓN en «${nombre}»`, false, String(e.message).slice(0, 260)); }
  const errores = consolaDesde(p, c0).filter((l) => !esperados.some((r) => r.test(l)));
  ok(`[${id}] consola sin errores${esperados.length ? " (salvo los provocados a propósito)" : ""}`, errores.length === 0, errores.slice(0, 3).join(" | ").slice(0, 300));
};

/** Lectura de un gráfico role=img: «Etiqueta: Clave valor, Clave valor». Devuelve { Clave: valor }. */
const leerSeg = (txt) => Object.fromEntries(txt.split(": ").slice(1).join(": ").split(", ").map((s) => { const m = s.match(/^(.*) (\d[\d.]*)$/); return [m?.[1] ?? s, m ? Number(m[2].replace(/\./g, "")) : NaN]; }));
const imgs = (p, ambito) => E(p, `return JSON.stringify([...document.querySelectorAll(${JSON.stringify(ambito)})].map(e=>e.getAttribute('aria-label')))`).then(JSON.parse);

const p = await lanzar({ ancho: 1440, alto: 900 });
let antes;
let SEM, SEM2, HOY;
try {
  const sems = await q("select codigo, activo, fecha_inicio::text fi, fecha_fin::text ff from semestres order by codigo desc");
  SEM = sems.find((s) => s.activo).codigo;
  SEM2 = sems.find((s) => !s.activo).codigo;
  antes = await instantanea(q);
  antes.grupos = Number((await q("select count(*)::int n from grupos_matriz"))[0].n);
  antes.plantillas = Number((await q("select count(*)::int n from plantilla_entregables"))[0].n);
  antes.semestres = Number((await q("select count(*)::int n from semestres"))[0].n);
  await login(p, ADMIN);

  /* ═════════ 1. Seguimiento operativo (la vista /admin/avance, antes «Avance consolidado por docente») ═════════
   * La pantalla se reemplazó por el centro de seguimiento operativo. Su cobertura detallada (cifras contra PostgreSQL, filtros, respuestas tardías,
   * navegación, responsive) está en backend/test/integration/seguimiento-operativo y e2e/suites/seguimiento-ui (base aislada). Aquí se conserva la
   * comprobación de coherencia con la API de Avance consolidado sobre los datos de desarrollo, que sigue vigente. */
  await seccion(p, "avance", "Seguimiento operativo", async () => {
    await irA(p, "/admin/avance");
    await esperar(p, "document.querySelector('.b2-seg-cards')", "tarjetas del seguimiento", 10000);
    const S = (await api(p, `/admin/seguimiento?semestre=${SEM}`)).d;
    const A = (await api(p, `/admin/avance-consolidado?semestre=${SEM}`)).d;
    ok("seguimiento: título de la página", await E(p, "return document.querySelector('.b2-ana h1')?.textContent.trim()==='Seguimiento operativo'"));
    ok("seguimiento: el semestre por defecto es el activo", (await valorSel(p, "Semestre")) === SEM, `semestre=${await valorSel(p, "Semestre")}`);
    const T = await filasTabla(p, "Seguimiento por docente");
    ok(`seguimiento: n.º de filas = docentes de la API (${S.docentes.length})`, T.filas.length === S.docentes.length, `${T.filas.length} filas`);
    ok("seguimiento ≡ avance consolidado: mismos docentes, pendientes de revisión y semáforo", S.tarjetas.docentes === A.totales.docentes && S.tarjetas.enviados_pendientes_revision === A.totales.pendientes_revision);
    for (const d of A.docentes) {
      const x = S.docentes.find((r) => r.id === d.id);
      ok(`seguimiento ≡ avance consolidado ${d.nombre}: reportado, aprobado, esperado, vencidos, brecha y semáforo`, !!x && x.semestre.pct_reportado === d.avance_reportado && x.semestre.pct_aprobado === d.avance_aprobado && x.semestre.pct_esperado === d.avance_esperado && x.semestre.vencidos === d.entregables_vencidos && x.semestre.brecha_pct === d.brecha && x.semestre.semaforo === d.semaforo, JSON.stringify({ seg: x?.semestre.pct_reportado, av: d.avance_reportado }));
    }
    const K = await E(p, "return Object.fromEntries([...document.querySelectorAll('.b2-seg-cards dl > div')].map(d => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.replace(/\\s+/g, ' ').trim()]))");
    ok("seguimiento: 10 tarjetas", Object.keys(K).length === 10, Object.keys(K).join(" | "));
    ok("seguimiento: «Vencidos», «En revisión» y «Observados» = API", K["Vencidos"]?.startsWith(n0(S.tarjetas.vencidos)) && K["En revisión"]?.startsWith(n0(S.tarjetas.enviados_pendientes_revision)) && K["Observados"]?.startsWith(n0(S.tarjetas.observados)), JSON.stringify(K).slice(0, 240));
    // deep link ?semestre=&grupo= (usado por Indicadores por grupo)
    const g16 = A.docentes.find((d) => d.grupo_id != null);
    await irA(p, `/admin/avance?semestre=${SEM}&grupo=${g16.grupo_id}`);
    await esperar(p, "document.querySelectorAll('.b2-ana [role=table] .b2-tabla-r').length===1", "una fila", 8000);
    ok("seguimiento deep link ?semestre=&grupo=: selects y tabla filtrados", (await valorSel(p, "Semestre")) === SEM && (await valorSel(p, "Grupo")) === String(g16.grupo_id) && (await filasTabla(p, "Seguimiento por docente")).filas.length === 1);
    // semestre sin docentes: estado vacío explicativo
    await irA(p, `/admin/avance?semestre=${SEM2}`);
    await esperar(p, "document.querySelector('.b2-adm-vacio-c, .b2-seg-cards')", "vista del otro semestre", 8000);
    const S2 = (await api(p, `/admin/seguimiento?semestre=${SEM2}`)).d;
    ok(`seguimiento ${SEM2}: estado vacío explicativo (API: ${S2.docentes.length} docentes)`, S2.docentes.length === 0 && await E(p, "return !document.querySelector('.b2-seg-cards') && /no tiene docentes con grupo/.test(document.querySelector('.b2-ana').innerText)"));
    ok("seguimiento vacío: ofrece ir a «Tareas semanales»", await clic(p, "Ir a Tareas semanales") && (await esperar(p, "location.search.includes('tab=tareas')", "tareas", 5000)));
  });

  /* ═════════ 2. Indicadores por grupo ═════════ */
  await seccion(p, "grupos", "Indicadores por grupo", async () => {
    await irA(p, "/admin/indicadores");
    const G = async (s) => (await api(p, `/admin/indicadores-grupo?semestre=${s}`)).d.grupos;
    const verSemestre = async (s, etq) => {
      const gs = await G(s);
      const T = await filasTabla(p, `Indicadores por grupo, semestre ${s}`);
      ok(`grupos ${etq}: ${gs.length} filas = grupos de la API`, T.filas.length === gs.length, `${T.filas.length}`);
      const ix = (h) => T.cabeceras.indexOf(h);
      const tot = (g) => g.num_proyectos + g.num_actividades + g.num_convenios_nuevos + g.num_convenios_dinamizados;
      let todos = true; let detalle = "";
      for (const g of gs) {
        const f = T.filas.find((r) => r[0] === g.nombre);
        const c = f && [f[ix("Horas")] === n0(g.horas_totales ?? 0), f[ix("Proyectos")] === n0(g.num_proyectos), f[ix("Actividades")] === n0(g.num_actividades), f[ix("Conv. nuevos")] === n0(g.num_convenios_nuevos), f[ix("Conv. dinam.")] === n0(g.num_convenios_dinamizados), f[ix("Total indic.")] === n0(tot(g)), f[ix("Docentes")] === n0(g.num_docentes), f[ix("Entregables")] === n0(g.num_plantilla_entregables), f[ix("Semestre")] === s, f[ix("Tipo")] === (String(g.tipo_docente).toUpperCase() === "NUEVO" ? "Nuevo" : "Antiguo")];
        if (!c || !c.every(Boolean)) { todos = false; detalle = `${g.nombre}: ${JSON.stringify(f)}`; break; }
      }
      ok(`grupos ${etq}: cada columna de cada fila = API (horas, proyectos, actividades, convenios, total, docentes, entregables, semestre, tipo)`, todos, detalle);
      const suma = (k) => gs.reduce((a, g) => a + (Number(g[k]) || 0), 0);
      const K = await leerKpis(p, ".b2-ana-ind-kpis");
      ok(`grupos ${etq}: indicadores superiores = sumas de la API`, K?.["Grupos activos"] === n0(gs.length) && K?.["Docentes asignados"] === n0(suma("num_docentes")) && K?.["Entregables en plantillas"] === n0(suma("num_plantilla_entregables")) && K?.["Indicadores totales"] === n0(gs.reduce((a, g) => a + tot(g), 0)) && K?.["Horas totales"] === n0(suma("horas_totales")), JSON.stringify(K));
      const tt = await E(p, "return document.querySelector('p[aria-label=\"Totales\"]')?.innerText.replace(/\\s+/g,' ') ?? ''");
      ok(`grupos ${etq}: línea «Totales» = suma de columnas`, gs.length === 0 || (tt.includes(`Horas ${n0(suma("horas_totales"))}`) && tt.includes(`Proyectos ${n0(suma("num_proyectos"))}`) && tt.includes(`Actividades ${n0(suma("num_actividades"))}`) && tt.includes(`Docentes ${n0(suma("num_docentes"))}`) && tt.includes(`Entregables ${n0(suma("num_plantilla_entregables"))}`)), tt);
      // gráficos: valores de la API en los aria-label
      const carga = await imgs(p, 'ul[aria-label="Composición de la carga por grupo"] .b2-ap');
      ok(`grupos ${etq}: gráfico de composición = API`, gs.every((g) => carga.includes(`${g.nombre}: Proyectos ${g.num_proyectos}, Actividades ${g.num_actividades}, Convenios nuevos ${g.num_convenios_nuevos}, Convenios dinamizados ${g.num_convenios_dinamizados}`)), carga[0]);
      const ent = await imgs(p, 'ul[aria-label="Entregables de plantilla por grupo"] .b2-ap');
      ok(`grupos ${etq}: gráfico de entregables = API`, gs.every((g) => ent.includes(`${g.nombre}: Entregables de plantilla ${g.num_plantilla_entregables}`)), ent[0]);
      const tipo = await imgs(p, 'ul[aria-label="Grupos y docentes por tipo"] .b2-ap');
      const nu = gs.filter((g) => String(g.tipo_docente).toUpperCase() === "NUEVO");
      const an = gs.filter((g) => String(g.tipo_docente).toUpperCase() !== "NUEVO");
      ok(`grupos ${etq}: gráfico de tipo docente = API`, tipo.includes(`Grupos: Antiguo ${an.length}, Nuevo ${nu.length}`) && tipo.includes(`Docentes asignados: Antiguo ${an.reduce((a, g) => a + g.num_docentes, 0)}, Nuevo ${nu.reduce((a, g) => a + g.num_docentes, 0)}`), tipo.join(" | "));
      return gs;
    };
    const g1 = await verSemestre(SEM, SEM);
    // filtros: tipo y búsqueda
    const nuevos = g1.filter((g) => String(g.tipo_docente).toUpperCase() === "NUEVO");
    await clicEmpieza(p, ".b2-chips button", "Nuevo"); await pausa(600);
    let t = await filasTabla(p, `Indicadores por grupo, semestre ${SEM}`);
    ok(`grupos chip «Nuevo»: ${nuevos.length} grupo(s)`, t.filas.length === nuevos.length && t.filas.every((f) => nuevos.some((g) => g.nombre === f[0])));
    const Kf = await leerKpis(p, ".b2-ana-ind-kpis");
    ok("grupos filtrado: la tira lo rotula y los totales siguen la selección", Object.keys(Kf).some((k) => k.includes("(filtrado)")) && Kf[Object.keys(Kf)[0]] === n0(nuevos.length) && Kf["Docentes asignados"] === n0(nuevos.reduce((a, g) => a + g.num_docentes, 0)), JSON.stringify(Kf));
    await clic(p, "Limpiar"); await pausa(500);
    await escribir(p, "Buscar grupo", "Grupo 5"); await pausa(500);
    t = await filasTabla(p, `Indicadores por grupo, semestre ${SEM}`);
    ok("grupos búsqueda «Grupo 5»", t.filas.length === g1.filter((g) => g.nombre.toLowerCase().includes("grupo 5")).length && t.filas.length >= 1, `${t.filas.length}`);
    await clic(p, "Limpiar"); await pausa(400);
    // orden
    await clic(p, "Ordenar por Horas"); await pausa(500);
    t = await filasTabla(p, `Indicadores por grupo, semestre ${SEM}`);
    ok("grupos orden por «Horas» ascendente", igual(t.filas.map((f) => f[0]), [...g1].sort((a, b) => (a.horas_totales ?? 0) - (b.horas_totales ?? 0) || a.nombre.localeCompare(b.nombre)).map((g) => g.nombre)), t.filas.map((f) => f[0].slice(0, 9)).join(" | "));
    // inspector y enlaces
    await clic(p, "Ordenar por Grupo"); await pausa(300);
    await E(p, "document.querySelector('.b2-ana [role=table] .b2-tabla-r').click()"); await pausa(700);
    const ti = await inspTexto(p);
    const gSel = g1.find((g) => ti.includes(g.nombre));
    ok("grupos inspector: abre con el grupo y sus datos = API", !!gSel && ti.includes(`Horas totales ${n0(gSel.horas_totales)} h`) && ti.includes(`Docentes ${n0(gSel.num_docentes)}`), ti.slice(0, 200));
    for (const [txt, esp] of [["Ver plantillas y semanas", `/admin/sistema?tab=plantillas&semestre=${SEM}&grupo=${gSel.id}`], ["Ver avance de sus docentes", `/admin/avance?semestre=${SEM}&grupo=${gSel.id}`], ["Administrar grupo", "/admin/sistema?tab=tareas"]]) {
      await irA(p, "/admin/indicadores");
      await E(p, `[...document.querySelectorAll('.b2-ana [role=table] .b2-tabla-r')].find(r=>r.innerText.includes(${JSON.stringify(gSel.nombre)})).click()`); await pausa(600);
      await E(p, `const b=[...document.querySelectorAll('aside.b2-insp[data-open="true"] .b2-btn')].find(x=>x.textContent.trim()===${JSON.stringify(txt)}); b&&b.click()`); await pausa(1200);
      ok(`grupos inspector «${txt}» → ${esp}`, (await ruta(p)).startsWith(esp), await ruta(p));
      if (txt.startsWith("Ver avance")) {
        await cargaAna(p);
        const tA = await filasTabla(p, "Seguimiento por docente");
        ok("grupos → avance: el enlace profundo abre el avance filtrado por ese grupo y semestre", (await valorSel(p, "Semestre")) === SEM && (await valorSel(p, "Grupo")) === String(gSel.id) && tA.filas.length === (gSel.num_docentes > 0 ? gSel.num_docentes : 0), `${await valorSel(p, "Grupo")} filas=${tA.filas.length}`);
      }
    }
    // semestre sin docentes (2026A, varios grupos)
    await irA(p, "/admin/indicadores");
    await selValor(p, "Semestre", SEM2); await esperar(p, `document.querySelector('[role=table]')?.getAttribute('aria-label')==='Indicadores por grupo, semestre ${SEM2}'`, "tabla del otro semestre", 8000); await pausa(800);
    await verSemestre(SEM2, SEM2);
    // cambio rápido de semestre con la primera respuesta retrasada
    await irA(p, "/admin/indicadores");
    await instalarFetch(p, [{ incluye: `/admin/indicadores-grupo?semestre=${SEM}`, retraso: 2500 }]);
    await clic(p, "Actualizar");
    await pausa(200);
    await selValor(p, "Semestre", SEM2);
    await pausa(4200);
    const gs2 = await G(SEM2);
    t = await filasTabla(p, `Indicadores por grupo, semestre ${SEM2}`);
    ok(`grupos respuesta tardía: tras el cambio de semestre solo se muestran los ${gs2.length} grupos de ${SEM2}`, t?.filas.length === gs2.length && !t.filas.some((f) => f[0].includes(`(DEV ${SEM})`)), `${t?.filas.length} filas`);
    ok("grupos respuesta tardía: el semestre seleccionado se mantiene", (await valorSel(p, "Semestre")) === SEM2);
    await instalarFetch(p, []);
  });

  /* ═════════ 3. Reportes y métricas ═════════ */
  await seccion(p, "metricas", "Reportes y métricas", async () => {
    await irA(p, "/admin/reportes");
    const M = (await api(p, "/admin/metricas")).d;
    ok("métricas: título «Reportes y métricas» y nota de alcance con el semestre consultado", await E(p, `return document.querySelector('.b2-ana h1')?.textContent.trim()==='Reportes y métricas' && /corresponden al semestre ${SEM} \\(activo\\)/.test(document.querySelector('.b2-aviso-sem')?.textContent||'')`));
    ok("métricas: la API acota al semestre activo y todos sus grupos son de ese semestre", M.alcance?.semestre === SEM && M.por_grupo.length > 0 && M.por_grupo.every((g) => g.semestre === SEM), `${M.alcance?.semestre}`);
    const r = M.resumen;
    const K = await leerKpis(p, ".b2-ana .b2-inds");
    ok(`métricas indicadores = API (${r.total_reportes}/${r.aprobados}/${r.pendientes}/${r.con_observaciones}/${pc(r.porcentaje_aprobacion)})`, K?.["Total de reportes"] === n0(r.total_reportes) && K?.["Aprobados"] === n0(r.aprobados) && K?.["Pendientes de revisión"] === n0(r.pendientes) && K?.["Con observaciones"] === n0(r.con_observaciones) && K?.["% de aprobación"] === pc(r.porcentaje_aprobacion), JSON.stringify(K));
    const rev = leerSeg((await imgs(p, '.b2-ap[aria-label^="Estado de la revisión"]'))[0]);
    ok("métricas reparto de la revisión = resumen de la API", rev["Aprobados"] === r.aprobados && rev["Pendientes de revisión"] === r.pendientes && rev["Con observaciones"] === r.con_observaciones, JSON.stringify(rev));
    // por mes
    const cats = JSON.parse(await E(p, "return JSON.stringify([...document.querySelectorAll('.b2-cg-c')].map(c=>({mes:c.querySelector('.b2-cg-e').firstChild.textContent.trim(), futuro:c.hasAttribute('data-futuro'), label:c.getAttribute('aria-label')})))"));
    ok(`métricas por mes: ${M.por_mes.length} meses = API (Aprobados/Observados/Pendientes)`, M.por_mes.length === cats.length && M.por_mes.every((m) => cats.find((c) => c.mes === m.mes)?.label.includes(`Aprobados ${m.aprobados}, Observados ${m.observados}, Pendientes ${m.pendientes}`)), cats.map((c) => c.label).join(" | ").slice(0, 200));
    const cal = (await q("select fecha_inicio::text fi, fecha_fin::text ff from semestres where activo"))[0];
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const futuro = (mes) => { const idx = MESES.indexOf(mes.toLowerCase()); const [yi, mi] = cal.fi.slice(0, 7).split("-").map(Number); const [yf, mf] = cal.ff.slice(0, 7).split("-").map(Number); const c = []; for (let y = yi, m = mi; y < yf || (y === yf && m <= mf); m++) { if (m > 12) { m = 1; y++; } if (m - 1 === idx) c.push({ y, m }); if (y === yf && m === mf) break; } return c.length === 1 && `${c[0].y}-${String(c[0].m).padStart(2, "0")}-01` > hoy; };
    ok("métricas por mes: solo los meses cuyo primer día es posterior a hoy se atenúan (Noviembre y Diciembre en el semestre activo)", cats.every((c) => c.futuro === futuro(c.mes)), cats.map((c) => `${c.mes}:${c.futuro}`).join(" "));
    // por grupo (semestre activo por defecto)
    const conDocs = (s) => M.por_grupo.filter((g) => (!s || g.semestre === s) && g.total_docentes > 0);
    let bala = await imgs(p, 'ul[aria-label="Cumplimiento por grupo"] .b2-bl');
    ok(`métricas grupos (semestre ${SEM}): ${conDocs(SEM).length} grupos con docentes, valores = API`, bala.length === conDocs(SEM).length && conDocs(SEM).every((g) => bala.includes(`${g.grupo_nombre}: reportado ${pc(g.porcentaje)}, aprobado ${pc(g.porcentaje_aprobado)}, esperado ${pc(g.porcentaje_esperado)}`)), bala[0]);
    ok("métricas grupos: el filtro de semestre parte del semestre activo", (await valorSel(p, "Filtrar por semestre")) === SEM);
    const lab = (s) => E(p, "return document.querySelector('.b2-ana-met-vacios')?.innerText.trim()");
    const ocultos = (s) => M.por_grupo.filter((g) => (!s || g.semestre === s) && g.total_docentes === 0).length;
    ok(`métricas grupos: «Incluir grupos sin docentes» muestra el conteo de ocultos (${ocultos(SEM)})`, (await lab()) === `Incluir grupos sin docentes${ocultos(SEM) ? ` (${ocultos(SEM)})` : ""}`, await lab());
    ok("métricas: el selector de semestre no ofrece «Todos los semestres»", await E(p, `const s=document.querySelector('select[aria-label="Filtrar por semestre"]'); return !!s && ![...s.options].some(o=>/Todos los semestres/.test(o.textContent)||o.value==='')`));
    // Otro semestre: la página vuelve a pedir /admin/metricas?semestre=… y todo el contenido pertenece a ese periodo.
    const M2 = (await api(p, `/admin/metricas?semestre=${SEM2}`)).d;
    await selValor(p, "Filtrar por semestre", SEM2); await esperar(p, `new RegExp('corresponden al semestre ${SEM2}').test(document.querySelector('.b2-aviso-sem')?.textContent||'')`, "métricas del otro semestre", 8000); await pausa(700);
    ok(`métricas ${SEM2}: la API devuelve solo grupos del semestre pedido (${M2.por_grupo.length}) y el conteo de ocultos de la pantalla coincide`, M2.alcance?.semestre === SEM2 && M2.por_grupo.every((g) => g.semestre === SEM2) && (await lab()) === `Incluir grupos sin docentes${M2.por_grupo.length ? ` (${M2.por_grupo.length})` : ""}`, await lab());
    const K2s = await leerKpis(p, ".b2-ana .b2-inds");
    ok(`métricas ${SEM2}: los indicadores son los de ese semestre (${M2.resumen.total_reportes} reportes), sin valores heredados del activo`, K2s?.["Total de reportes"] === n0(M2.resumen.total_reportes) && K2s?.["% de aprobación"] === pc(M2.resumen.porcentaje_aprobacion) && M2.resumen.total_reportes !== r.total_reportes, JSON.stringify(K2s));
    ok(`métricas ${SEM2}: ningún grupo con docentes → estado vacío explicativo`, M2.por_grupo.every((g) => g.total_docentes === 0) ? await E(p, "return /Ningún grupo de este semestre tiene docentes/.test(document.querySelector('.b2-ana').innerText)") : true, `${M2.por_grupo.filter((g) => g.total_docentes > 0).length} con docentes`);
    await E(p, "const c=document.querySelector('.b2-ana-met-vacios input'); c.click()"); await pausa(700);
    let tg = await filasTabla(p, "Cumplimiento por grupo de matriz");
    ok(`métricas «Incluir grupos sin docentes» en ${SEM2}: ${M2.por_grupo.length} filas, todas del semestre ${SEM2}`, tg.filas.length === M2.por_grupo.length && tg.filas.every((f) => f[tg.cabeceras.indexOf("Semestre")] === SEM2), `${tg.filas.length} filas`);
    await E(p, "const c=document.querySelector('.b2-ana-met-vacios input'); c.click()"); await selValor(p, "Filtrar por semestre", SEM); await esperar(p, `new RegExp('corresponden al semestre ${SEM} ').test(document.querySelector('.b2-aviso-sem')?.textContent||'')`, "métricas del activo", 8000); await pausa(600);
    const Kvuelta = await leerKpis(p, ".b2-ana .b2-inds");
    ok(`métricas: al volver a ${SEM} los indicadores vuelven a ser los del semestre activo`, Kvuelta?.["Total de reportes"] === n0(r.total_reportes), JSON.stringify(Kvuelta));
    // cambio rápido de semestre con la respuesta del primero retrasada: no debe sobrescribir al segundo
    await irA(p, "/admin/reportes");
    await selValor(p, "Filtrar por semestre", SEM2); await esperar(p, `new RegExp('corresponden al semestre ${SEM2}').test(document.querySelector('.b2-aviso-sem')?.textContent||'')`, "otro semestre", 8000); await pausa(500);
    await instalarFetch(p, [{ incluye: `/admin/metricas?semestre=${SEM}`, retraso: 2800 }]);
    await selValor(p, "Filtrar por semestre", SEM); await pausa(250);
    await selValor(p, "Filtrar por semestre", SEM2);
    await pausa(4500);
    const K3 = await leerKpis(p, ".b2-ana .b2-inds");
    ok(`métricas respuesta tardía: tras volver a ${SEM2} la respuesta atrasada de ${SEM} no sobrescribe los indicadores ni el aviso`, K3?.["Total de reportes"] === n0(M2.resumen.total_reportes) && (await valorSel(p, "Filtrar por semestre")) === SEM2 && await E(p, `return new RegExp('corresponden al semestre ${SEM2}').test(document.querySelector('.b2-aviso-sem')?.textContent||'')`), JSON.stringify(K3));
    await instalarFetch(p, []);
    await irA(p, "/admin/reportes");
    tg = await filasTabla(p, "Cumplimiento por grupo de matriz");
    const g0 = conDocs(SEM)[0];
    const fg = tg.filas.find((f) => f[0] === g0.grupo_nombre);
    ok("métricas tabla de grupos: columnas = API (docentes, reportados, total, reportado, aprobado, esperado)", !!fg && fg[tg.cabeceras.indexOf("Docentes")] === n0(g0.total_docentes) && fg[tg.cabeceras.indexOf("Reportados")] === n0(g0.entregables_completados) && fg[tg.cabeceras.indexOf("Total")] === n0(g0.entregables_total) && fg[tg.cabeceras.indexOf("Reportado")] === pc(g0.porcentaje) && fg[tg.cabeceras.indexOf("Aprobado")] === pc(g0.porcentaje_aprobado) && fg[tg.cabeceras.indexOf("Esperado")] === pc(g0.porcentaje_esperado), JSON.stringify(fg));
    // regional
    const reg = await imgs(p, 'ul[aria-label="Avance por regional"] .b2-bl');
    ok("métricas regional = API (reportado y aprobado; sin «esperado» que el backend no entrega por regional)", M.por_regional.every((x) => reg.includes(`${x.regional}: reportado ${pc(x.porcentaje_reportado ?? x.porcentaje_avance)}, aprobado ${pc(x.porcentaje_aprobado)}`)) && reg.every((x) => !/esperado/.test(x)), reg.join(" | "));
    // atrasados
    const ta = await filasTabla(p, "Docentes con menor avance");
    const at = M.top_atrasados;
    ok(`métricas atrasados: ${at.length} filas (máx. 10) = API`, ta.filas.length === Math.min(10, at.length), `${ta.filas.length}`);
    const etiquetaSem = { rojo: "Crítico", amarillo: "En riesgo", verde: "En regla", sin_exigibles: "Sin vencimientos", sin_datos: "Sin matriz" };
    for (const d of at) {
      const f = ta.filas.find((x) => x[0].startsWith(d.nombre));
      const ix = (h) => ta.cabeceras.indexOf(h);
      ok(`métricas atrasado ${d.nombre}: reportado/aprobado/vencidos/estado = API`, !!f && f[ix("Reportado")].startsWith(pc(d.porcentaje_reportado ?? d.porcentaje_avance)) && f[ix("Aprobado")] === pc(d.porcentaje_aprobado) && f[ix("Vencidos")] === n0(d.entregables_vencidos) && f[ix("Estado")] === etiquetaSem[d.semaforo] && (((d.porcentaje_reportado ?? d.porcentaje_avance) < 30) === f[ix("Reportado")].includes("Bajo 30 %")), JSON.stringify(f));
    }
    // tablas de datos alternativas
    const det = JSON.parse(await E(p, "return JSON.stringify([...document.querySelectorAll('.b2-ana details.b2-fig-tabla')].map(d=>{d.open=true; const t=d.querySelector('table'); return {resumen:d.querySelector('summary').textContent.trim(), filas:t.querySelectorAll('tbody tr').length, celdas:[...t.querySelectorAll('tbody tr:first-child th, tbody tr:first-child td')].map(c=>c.textContent.trim())}}))"));
    ok("métricas: cada gráfico ofrece su tabla de datos (details) con filas", det.length >= 4 && det.every((d) => d.filas > 0), det.map((d) => `${d.resumen}:${d.filas}`).join(" | ").slice(0, 200));
    const dMes = det.find((d) => /Mes|mes/.test(d.resumen) || d.celdas[0] === M.por_mes[0].mes);
    ok("métricas: la tabla de datos del gráfico mensual repite las cifras de la API", !!dMes && dMes.filas === M.por_mes.length && dMes.celdas.includes(String(M.por_mes[0].aprobados)), JSON.stringify(dMes));
    // inspector docente y grupo + enlaces
    await E(p, "document.querySelector('[role=table][aria-label=\"Docentes con menor avance\"] .b2-tabla-r').click()"); await pausa(700);
    const ti = await inspTexto(p);
    const d0 = at[0];
    ok("métricas inspector de docente: datos = API", ti.includes(d0.nombre) && ti.includes(`Vencidos ${n0(d0.entregables_vencidos)}`), ti.slice(0, 200));
    for (const [txt, esp] of [["Ver matriz", `/admin/docentes/${d0.docente_id}/matriz`], ["Ver su avance", "/admin/avance"], ["Ir a la bandeja de revisión", "/admin/revision"]]) {
      await irA(p, "/admin/reportes");
      await E(p, "document.querySelector('[role=table][aria-label=\"Docentes con menor avance\"] .b2-tabla-r').click()"); await pausa(600);
      await E(p, `const b=[...document.querySelectorAll('aside.b2-insp[data-open="true"] .b2-btn')].find(x=>x.textContent.trim()===${JSON.stringify(txt)}); b&&b.click()`); await pausa(1000);
      ok(`métricas inspector «${txt}» → ${esp}`, (await ruta(p)).startsWith(esp), await ruta(p));
    }
    await irA(p, "/admin/reportes");
    await E(p, "document.querySelector('[role=table][aria-label=\"Cumplimiento por grupo de matriz\"] .b2-tabla-r').click()"); await pausa(700);
    const tg2 = await inspTexto(p);
    ok("métricas inspector de grupo: nombre, semestre y avance = API", tg2.includes(g0.grupo_nombre) && tg2.includes(`Semestre ${g0.semestre}`) && tg2.includes(pc(g0.porcentaje)), tg2.slice(0, 220));
    await E(p, "[...document.querySelectorAll('aside.b2-insp[data-open=\"true\"] .b2-btn')].find(x=>x.textContent.trim()==='Ver plantillas del grupo').click()"); await pausa(1000);
    ok("métricas inspector de grupo «Ver plantillas del grupo» con semestre y grupo", (await ruta(p)).startsWith(`/admin/sistema?tab=plantillas&semestre=${g0.semestre}&grupo=${g0.grupo_id}`), await ruta(p));
    // actualizar
    await irA(p, "/admin/reportes");
    await clic(p, "Actualizar"); await pausa(1500); await cargaAna(p);
    const K2 = await leerKpis(p, ".b2-ana .b2-inds");
    ok("métricas «Actualizar»: recarga y mantiene los valores de la API", K2?.["Total de reportes"] === n0(r.total_reportes));
  });

  /* ═════════ 4. Estados: carga y error ═════════ */
  const ESP = [/Failed to fetch|No se pudo|TypeError|Error al cargar|net::ERR/i];
  await seccion(p, "estados", "Estados de carga y error", async () => {
    const casos = [
      ["avance", "/admin/avance", "/admin/seguimiento", "/admin"],
      ["grupos", "/admin/indicadores", "/admin/indicadores-grupo", "/admin"],
      ["métricas", "/admin/reportes", "/admin/metricas", "/admin/indicadores"],
    ];
    for (const [nombre, r, endpoint, origen] of casos) {
      // esqueleto de carga: navegación SPA desde el panel con el endpoint retrasado
      await irA(p, origen);
      await instalarFetch(p, [{ incluye: endpoint, retraso: 1800 }]);
      await E(p, `const a=document.querySelector('a[href=${JSON.stringify(r)}]'); a.click()`);
      await pausa(500);
      ok(`${nombre}: muestra esqueleto de carga mientras llegan los datos`, await E(p, "return !!document.querySelector('.b2-ana .b2-skel')"));
      await esperar(p, "!document.querySelector('.b2-ana .b2-skel')", "fin esqueleto", 8000); await cargaAna(p);
      // error: el endpoint falla → alerta con «Reintentar»; al restablecerlo, recupera
      await instalarFetch(p, [{ incluye: endpoint, falla: true }]);
      await clic(p, "Actualizar"); await pausa(1500);
      ok(`${nombre}: error de conexión → alerta con «Reintentar»`, await E(p, "const a=document.querySelector('.b2-ana .b2-alert'); return !!a && /Reintentar/.test(a.innerText)"));
      await instalarFetch(p, []);
      await clic(p, "Reintentar"); await pausa(1500); await cargaAna(p);
      ok(`${nombre}: «Reintentar» recupera los datos`, await E(p, "return !document.querySelector('.b2-ana .b2-alert') && !!document.querySelector('.b2-ana figure.b2-fig')"));
    }
    await instalarFetch(p, []);
  }, ESP);

  /* ═════════ 5. Permisos ═════════ */
  await seccion(p, "permisos", "Permisos", async () => {
    await login(p, DOC);
    for (const r of ["/admin/avance", "/admin/indicadores", "/admin/reportes"]) {
      await ir(p, r, 1800);
      ok(`docente es redirigido desde ${r}`, !(await ruta(p)).startsWith("/admin"), await ruta(p));
    }
    for (const e of ["/admin/avance-consolidado", "/admin/indicadores-grupo?semestre=" + SEM, "/admin/metricas"]) {
      ok(`API ${e.split("?")[0]} con token de docente → 403`, (await api(p, e)).s === 403);
    }
    const sinToken = await EA(p, "localStorage.clear(); const out=[]; for (const e of ['/admin/avance-consolidado','/admin/indicadores-grupo','/admin/metricas']) { const r=await fetch('" + API + "'+e); out.push(r.status); } return JSON.stringify(out)").then(JSON.parse);
    ok("APIs sin sesión → 401", sinToken.every((s) => s === 401), sinToken.join(","));
    await login(p, ADMIN);
  });

  /* ═════════ 6. Accesibilidad y no depender del color ═════════ */
  await seccion(p, "a11y", "Accesibilidad", async () => {
    await irA(p, "/admin/avance");
    ok("a11y: cada gráfico tiene leyenda con muestras de patrón/relleno (no solo color) o valores escritos", await E(p, "return [...document.querySelectorAll('.b2-ana figure.b2-fig')].every(f=>f.querySelector('.b2-leg .b2-sw')||f.querySelector('.b2-ap-d b')||f.querySelector('.b2-fb-v b'))"));
    ok("a11y: los segmentos y barras llevan el valor escrito", await E(p, "const s=[...document.querySelectorAll('.b2-ana .b2-ap-s')]; return s.length>0 && s.every(x=>x.getAttribute('title')&&/\\d/.test(x.getAttribute('title')))"));
    ok("a11y: las series se distinguen por relleno/patrón distintos", await E(p, "const bg=(s)=>getComputedStyle(document.querySelector('.b2-sw[data-s=\"'+s+'\"]')||document.body).backgroundImage+getComputedStyle(document.querySelector('.b2-sw[data-s=\"'+s+'\"]')||document.body).backgroundColor; const v=['obs','sin','ven','apr'].map(bg); return new Set(v).size===v.length"));
    const tabla = await E(p, "const d=document.querySelector('.b2-ana details.b2-fig-tabla'); d.querySelector('summary').click(); return d.open && d.querySelectorAll('tbody tr').length>0");
    ok("a11y: «Ver datos en tabla» abre y contiene datos", tabla);
    // foco por teclado en columnas del gráfico mensual (tooltip) y en las filas del ranking
    await tecla(p, "Tab", "Tab", 9);
    const tip = await E(p, "const c=document.querySelector('.b2-cg-c'); c.focus(); const t=c.querySelector('.b2-cg-t'); return getComputedStyle(t).display!=='none' && document.activeElement===c");
    ok("a11y: al enfocar una columna del gráfico mensual aparece su tooltip", tip);
    ok("a11y: las filas de la comparación por grupo son botones enfocables", await E(p, "const b=document.querySelector('ul[aria-label=\"Avance por grupo\"] button.b2-fb-f'); if(!b) return false; b.focus(); return document.activeElement===b"));
    await E(p, "document.querySelector('ul[aria-label=\"Avance por grupo\"] button.b2-fb-f').click()"); await pausa(900);
    ok("a11y: activar un grupo del gráfico lo aplica como filtro (el selector de grupo cambia)", await E(p, "return document.querySelector('select[aria-label=\"Grupo\"]').value !== ''"));
    await irA(p, "/admin/indicadores");
    ok("a11y indicadores: gráficos con título, leyenda y tabla alternativa", await E(p, "return [...document.querySelectorAll('.b2-ana figure.b2-fig')].every(f=>f.querySelector('figcaption h3')&&f.querySelector('.b2-leg')&&f.querySelector('details.b2-fig-tabla'))"));
  });

  /* ═════════ 7. Responsive ═════════ */
  await seccion(p, "responsive", "Responsive", async () => {
    const PAG = [["avance", "/admin/avance", "Seguimiento por docente"], ["indicadores", "/admin/indicadores", null], ["métricas", "/admin/reportes", "Docentes con menor avance"]];
    for (const [w, h] of [[1440, 900], [1280, 800], [820, 1000], [390, 844]]) {
      await p.tamano(w, h);
      const movil = w <= 720, estrecho = w <= 900;
      for (const [nombre, r, etq] of PAG) {
        await irA(p, r); await pausa(600);
        const tag = `${w}px ${nombre}`;
        const c0 = marcaConsola(p);
        ok(`${tag}: sin desborde horizontal de la página`, await sinDesborde(p));
        ok(`${tag}: ${estrecho ? "barra inferior B2 y sin menú superior ni riel duplicados" : "menú superior y riel, sin barra inferior"}`, await E(p, `const v=(s)=>[...document.querySelectorAll(s)].filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return c.display!=='none'&&r.width>0&&r.height>0}).length; const hd=v('.b2-hd-nav'), sd=v('.b2-side'), bn=v('.b2-bnav'); return ${estrecho} ? (bn===1&&hd===0&&sd===0) : (bn===0&&hd===1&&sd===1)`));
        ok(`${tag}: ${movil ? "las tablas se muestran como lista" : "tabla"}`, movil ? await E(p, "return document.querySelectorAll('.b2-ana .b2-ml-i').length>0 && !document.querySelector('.b2-ana .b2-tabla')") : await E(p, "return document.querySelectorAll('.b2-ana .b2-tabla-r').length>0"));
        ok(`${tag}: los gráficos no se desbordan (salvo el scroll interno del gráfico mensual)`, await E(p, "return [...document.querySelectorAll('.b2-ana .b2-fig')].every(f=>f.scrollWidth<=f.clientWidth+2)"));
        ok(`${tag}: el título principal y los filtros están completos y a ancho útil`, await E(p, "const h=document.querySelector('.b2-ana h1'); const sel=[...document.querySelectorAll('.b2-ana select, .b2-ana .b2-tb-search')]; return !!h && h.scrollWidth<=h.clientWidth+2 && sel.every(s=>s.getBoundingClientRect().right<=innerWidth+1)"));
        if (movil) {
          ok(`${tag}: selects y botones principales ≥ 40 px`, await E(p, "const el=[...document.querySelectorAll('.b2-ana select, .b2-ana .b2-mx-acc .b2-btn, .b2-ana .b2-tb-search')].filter(e=>e.offsetParent); return el.length>0 && el.every(e=>e.getBoundingClientRect().height>=39)"));
          ok(`${tag}: chips de filtro ≥ 40 px (táctil)`, await E(p, "const el=[...document.querySelectorAll('.b2-ana .b2-chip')].filter(e=>e.offsetParent); return el.every(e=>e.getBoundingClientRect().height>=39)"));
        }
        // inspector: se abre, cabe en pantalla y se cierra
        await E(p, "(document.querySelector('.b2-ana .b2-ml-i')||document.querySelector('.b2-ana .b2-tabla-r')).click()"); await pausa(800);
        const g = await E(p, `const a=document.querySelector('aside.b2-insp[data-open="true"]'); if(!a) return null; const r=a.getBoundingClientRect(); const bs=[...a.querySelectorAll('.b2-btn')].filter(b=>b.offsetParent).map(b=>Math.round(b.getBoundingClientRect().height)); return JSON.stringify({l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),iw:innerWidth,ih:innerHeight,sw:a.scrollWidth,cw:a.clientWidth,min:Math.min(...bs)})`).then((x) => (x ? JSON.parse(x) : null));
        ok(`${tag}: el inspector se abre dentro de la pantalla`, !!g && g.l >= -1 && g.r <= g.iw + 1 && g.b <= g.ih + 1 && g.sw <= g.cw + 2, JSON.stringify(g));
        if (movil && g) ok(`${tag}: inspector como hoja inferior y botones ≥ 40 px`, g.min >= 39 && g.t > 40 && g.b >= g.ih - 2, JSON.stringify(g));
        await clic(p, "Cerrar detalle"); await pausa(500);
        ok(`${tag}: el inspector se cierra`, !(await inspAbierto(p)));
        const errores = consolaDesde(p, c0);
        ok(`${tag}: consola sin errores`, errores.length === 0, errores.slice(0, 2).join(" | ").slice(0, 200));
      }
    }
    await p.tamano(1440, 900);
  });

  /* ═════════ 8. Regresión de lo existente ═════════ */
  await seccion(p, "regresion", "Regresión", async () => {
    for (const [r, modulo] of [["/admin", "Panel"], ["/admin/revision", "Revisión"], ["/admin/sistema?tab=usuarios", "Administración"], ["/admin/importar-matriz", "Administración"], ["/admin/avance", "Seguimiento"], ["/admin/indicadores", "Indicadores y reportes"], ["/admin/reportes", "Indicadores y reportes"]]) {
      await ir(p, r, 2600);
      const sh = await E(p, "const hd=getComputedStyle(document.querySelector('.b2-hd')).backgroundColor; return JSON.stringify({hd, n:document.querySelectorAll('.b2-hd').length, act:[...document.querySelectorAll('.b2-hd-mod[data-active]')].map(a=>a.textContent.trim()), side:!!document.querySelector('.b2-side'), ctx:!!document.querySelector('.b2-ctx')})").then(JSON.parse);
      ok(`regresión ${r}: mismo shell B2 (cabecera #261E36, una sola) y módulo «${modulo}» activo`, sh.hd === "rgb(38, 30, 54)" && sh.n === 1 && sh.side && sh.ctx && sh.act.includes(modulo), JSON.stringify(sh));
    }
    // el riel del módulo conserva sus accesos
    await ir(p, "/admin/avance", 2000);
    ok("regresión: riel de «Seguimiento» con Avance consolidado y Cola de revisión", await E(p, "const t=document.querySelector('.b2-side').innerText+[...document.querySelectorAll('.b2-side a')].map(a=>a.getAttribute('aria-label')||a.textContent).join(' '); return /Avance consolidado/.test(t)&&/Cola de revisión/.test(t)"));
  });

  /* ═════════ BD intacta ═════════ */
  const despues = await instantanea(q);
  despues.grupos = Number((await q("select count(*)::int n from grupos_matriz"))[0].n);
  despues.plantillas = Number((await q("select count(*)::int n from plantilla_entregables"))[0].n);
  despues.semestres = Number((await q("select count(*)::int n from semestres"))[0].n);
  const dif = Object.keys(antes).filter((k) => antes[k] !== despues[k]);
  ok("BD: suite de solo lectura — conteos y estados idénticos antes y después", dif.length === 0, JSON.stringify(dif.map((k) => ({ k, antes: antes[k], despues: despues[k] }))));
} catch (e) {
  ok("EXCEPCIÓN no controlada", false, String(e.stack || e).slice(0, 400));
} finally {
  await p.cerrar();
}
console.log(res.join("\n"));
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
