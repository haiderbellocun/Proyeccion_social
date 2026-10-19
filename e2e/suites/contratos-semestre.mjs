// Contratos del Bloque 2 en el navegador (SOLO LECTURA): cómo reaccionan las pantallas de coordinación a las respuestas con alcance por
// semestre — semestre cerrado y vacío, promedios `null` por falta de población, semestre futuro, parámetros inválidos (400),
// semestres inexistentes (404) y docentes sin grupo — sin errores de consola, sin «NaN» y sin convertir lo desconocido en cero.
//   · Cerrado/vacío: respuesta REAL del backend (`?semestre=<anterior>`), servida a la pantalla mediante un reemplazo de fetch.
//   · Futuro, 400 y 404: respuestas simuladas con la forma exacta del contrato (no existe un semestre futuro en la base de desarrollo
//     y esta suite no escribe datos).
// Uso: npm run e2e -- contratos-semestre
import { lanzar, pausa, iniciarSuite, login, api, ir, E, linea, ADMIN } from "../lib/helpers.mjs";
import { leerKpis, esperar, cargaAna } from "../lib/indicadores-util.mjs";
iniciarSuite("contratos-semestre");
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));

// Reemplazo de fetch que sobrevive a las navegaciones: lee los «stubs» de sessionStorage.
const FUENTE = `(() => { const orig = window.fetch.bind(window); window.fetch = (u, ...a) => { try { const s = JSON.parse(sessionStorage.getItem('__stubs') || '{}'); const url = String(u); for (const k of Object.keys(s)) { if (url.includes(k)) { const { status, body } = s[k]; return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })); } } } catch {} return orig(u, ...a); }; })()`;
const stubs = (p, mapa) => E(p, `sessionStorage.setItem('__stubs', ${JSON.stringify(JSON.stringify(mapa))})`);
const sinStubs = (p) => E(p, "sessionStorage.removeItem('__stubs')");
const texto = (p) => E(p, "return (document.querySelector('.b2-vista-main') || document.body).innerText");
const sinBasura = async (p) => !/NaN|undefined|Infinity|\[object/.test(await texto(p));
const limpio = (p, desde) => p.consola.slice(desde).filter((x) => !/favicon|Download the React DevTools/.test(x));

const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: FUENTE });
  await login(p, ADMIN);
  const sems = (await api(p, "/admin/semestres")).d;
  const ACTIVO = sems.activo.codigo;
  const ANTERIOR = sems.semestres.find((c) => c !== ACTIVO);

  // ── Respuestas reales del backend ──
  const D = (await api(p, `/admin/dashboard?semestre=${ANTERIOR}`)).d;
  const Mx = (await api(p, `/admin/metricas?semestre=${ANTERIOR}`)).d;
  const Av = (await api(p, `/admin/avance-consolidado?semestre=${ANTERIOR}`)).d;
  ok(`contrato real ${ANTERIOR}: cerrado, vacío y con promedios null (dashboard, métricas y avance)`,
    D.alcance.estado_periodo === "cerrado" && D.alcance.vacio === true && D.stats.avance_reportado_promedio === null && D.stats.avance_aprobado_promedio === null
    && Mx.alcance.vacio === true && Mx.resumen.porcentaje_aprobacion === null && Av.alcance.vacio === true && Av.totales.promedio_global === null && Av.totales.promedio_aprobado === null,
    JSON.stringify({ d: D.alcance.estado_periodo, p: D.stats.avance_reportado_promedio, a: Mx.resumen.porcentaje_aprobacion, g: Av.totales.promedio_global }));
  const AvActivo = (await api(p, "/admin/avance-consolidado")).d;
  ok("docentes sin grupo: se informan en alcance y no aparecen como filas del consolidado del semestre", typeof AvActivo.alcance.docentes_sin_grupo === "number" && AvActivo.docentes.every((d) => d.grupo_id != null), `sin grupo=${AvActivo.alcance.docentes_sin_grupo}`);

  // ── Dashboard: semestre cerrado y vacío (respuesta real) ──
  let c0 = p.consola.length;
  await stubs(p, { "/admin/dashboard": { status: 200, body: D } });
  await ir(p, "/admin", 2600);
  let t = await texto(p);
  ok("dashboard cerrado/vacío: etiqueta «Semestre finalizado», sin «NaN»/«undefined» y sin errores de consola", /Semestre finalizado/.test(await E(p, "return document.body.innerText")) && await sinBasura(p) && limpio(p, c0).length === 0, limpio(p, c0)[0] ?? "");
  const kpis = await E(p, "return JSON.stringify([...document.querySelectorAll('dt')].map(d=>[d.textContent.trim(), d.nextElementSibling?.textContent.trim()]))");
  const kv = Object.fromEntries(JSON.parse(kpis));
  ok("dashboard vacío: los promedios no calculables se muestran como «—», no como 0 %", kv["Reportado"] === "—" && kv["Aprobado"] === "—", kpis.slice(0, 200));
  ok("dashboard vacío: sin docentes, sin alerta de atrasados y sin error de carga", !(await E(p, "return !!document.querySelector('.b2-alert[role=alert]')")) && !/docentes? con entregables vencidos/.test(t));

  // ── Dashboard: semestre futuro (respuesta simulada con la forma del contrato) ──
  const Df = JSON.parse(JSON.stringify(D));
  Df.alcance.estado_periodo = "futuro";
  Df.semana_actual = { semestre: "2099A", hoy: D.alcance.hoy, zona_horaria: "America/Bogota", total_semanas: 16, fecha_inicio_semestre: "2099-02-02", fecha_fin_semestre: "2099-05-24", numero: null, estado: "sin_iniciar", dias_para_inicio: 40 };
  c0 = p.consola.length;
  await stubs(p, { "/admin/dashboard": { status: 200, body: Df } });
  await ir(p, "/admin", 2600);
  ok("dashboard futuro: etiqueta «Semestre por iniciar», sin «NaN» y sin errores de consola", /Semestre por iniciar/.test(await E(p, "return document.body.innerText")) && await sinBasura(p) && limpio(p, c0).length === 0, limpio(p, c0)[0] ?? "");

  // ── Dashboard: parámetro inválido / semestre inexistente ──
  for (const [estado, cuerpo] of [[400, { error: "Semestre inválido «zz»: use el formato año + A o B (p. ej. 2026B).", codigo: "SEMESTRE_INVALIDO" }], [404, { error: "El semestre 1999B no existe.", codigo: "SEMESTRE_NO_ENCONTRADO" }]]) {
    await stubs(p, { "/admin/dashboard": { status: estado, body: cuerpo } });
    await ir(p, "/admin", 2600);
    ok(`dashboard ${estado}: la pantalla muestra un error recuperable (con «Reintentar») y no se rompe`, await E(p, "const a=document.querySelector('.b2-alert[role=alert]'); return !!a && /Reintentar/.test(a.innerText)") && await sinBasura(p));
  }

  // ── Reportes y métricas ──
  const kpisMetricas = (p2) => leerKpis(p2, ".b2-ana .b2-inds");
  c0 = p.consola.length;
  await stubs(p, { "/admin/metricas": { status: 200, body: Mx } });
  await ir(p, "/admin/reportes", 2200); await cargaAna(p);
  let K = await kpisMetricas(p);
  ok(`métricas ${ANTERIOR} (cerrado y vacío): conteos en 0 y «% de aprobación» «—» (no 0 %)`, K?.["Total de reportes"] === "0" && K?.["Aprobados"] === "0" && K?.["% de aprobación"] === "—", JSON.stringify(K));
  ok("métricas vacío: aviso de alcance con el semestre y su estado, estados vacíos de gráficos y sin «NaN»", new RegExp(`corresponden al semestre ${ANTERIOR} \\(cerrado`).test(await E(p, "return document.querySelector('.b2-aviso-sem')?.textContent||''")) && /Aún no hay reportes en este semestre/.test(await texto(p)) && await sinBasura(p));
  ok("métricas vacío: sin errores de consola", limpio(p, c0).length === 0, limpio(p, c0)[0] ?? "");
  const Mf = JSON.parse(JSON.stringify(Mx));
  Mf.alcance.estado_periodo = "futuro"; Mf.alcance.advertencias = ["Aviso de prueba del backend."];
  await stubs(p, { "/admin/metricas": { status: 200, body: Mf } });
  await ir(p, "/admin/reportes", 2200); await cargaAna(p);
  ok("métricas futuro: el aviso dice «aún no inicia» y muestra las advertencias del backend", /aún no inicia/.test(await E(p, "return document.querySelector('.b2-aviso-sem')?.textContent||''")) && /Aviso de prueba del backend\./.test(await E(p, "return document.querySelector('.b2-aviso-sem')?.textContent||''")));
  for (const [estado, cuerpo] of [[400, { error: "Semestre inválido «zz»: use el formato año + A o B (p. ej. 2026B).", codigo: "SEMESTRE_INVALIDO" }], [404, { error: "El semestre 1999B no existe.", codigo: "SEMESTRE_NO_ENCONTRADO" }]]) {
    await stubs(p, { "/admin/metricas": { status: estado, body: cuerpo } });
    await ir(p, "/admin/reportes", 2200);
    ok(`métricas ${estado}: muestra el mensaje del backend con «Reintentar» y sin gráficos con datos falsos`, await E(p, `const a=document.querySelector('.b2-ana .b2-alert'); return !!a && /Reintentar/.test(a.innerText) && a.innerText.includes(${JSON.stringify(cuerpo.error.slice(0, 20))})`) && !(await E(p, "return !!document.querySelector('.b2-ana .b2-inds')")));
  }

  // ── Avance consolidado ──
  c0 = p.consola.length;
  await stubs(p, { "/admin/avance-consolidado": { status: 200, body: Av } });
  await ir(p, `/admin/avance?semestre=${ANTERIOR}`, 2400); await cargaAna(p);
  ok(`avance ${ANTERIOR} (vacío): estado vacío explicativo, sin indicadores ni gráficos y sin «NaN»`, new RegExp(`El semestre ${ANTERIOR} no tiene docentes con grupo de matriz`).test(await E(p, "return document.querySelector('.b2-ana')?.innerText||''")) && !(await E(p, "return !!document.querySelector('section[aria-label=\"Indicadores del consolidado\"]')")) && await sinBasura(p));
  ok("avance vacío: sin errores de consola", limpio(p, c0).length === 0, limpio(p, c0)[0] ?? "");
  for (const [estado, cuerpo] of [[400, { error: "grupo_id debe ser un entero positivo.", codigo: "GRUPO_INVALIDO" }], [404, { error: "El semestre 1999B no existe.", codigo: "SEMESTRE_NO_ENCONTRADO" }]]) {
    await stubs(p, { "/admin/avance-consolidado": { status: estado, body: cuerpo } });
    await ir(p, `/admin/avance?semestre=${ANTERIOR}`, 2400);
    ok(`avance ${estado}: alerta recuperable «No se pudo cargar el avance consolidado» con «Reintentar»`, await E(p, "const a=document.querySelector('.b2-ana .b2-alert'); return !!a && /No se pudo cargar el avance consolidado/.test(a.innerText) && /Reintentar/.test(a.innerText)"));
  }
  await sinStubs(p);
  // Sin reemplazos la pantalla vuelve a los datos reales del semestre activo.
  await ir(p, "/admin/avance", 2400); await cargaAna(p);
  ok("sin simulaciones: el avance vuelve a mostrar los docentes reales del semestre activo", (await E(p, "return document.querySelector('.b2-tb-count, .b2-ana')?.innerText||''")).length > 0 && await E(p, "return !document.querySelector('.b2-ana .b2-alert')"));
} catch (e) {
  ok(`EXCEPCIÓN tras «${res[res.length - 1]?.slice(0, 80)}»`, false, String(e.message).slice(0, 240));
} finally {
  await p.cerrar();
  console.log(res.join("\n"));
}
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
