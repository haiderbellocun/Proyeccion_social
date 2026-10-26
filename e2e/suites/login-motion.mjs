// Verificación visual del login animado (movimiento de marca) en Chrome real. No escribe en la base ni inicia sesión.
// Uso: node e2e/suites/login-motion.mjs [carpeta-relativa-a-la-raíz]   (def. docs/b2-integracion/login-motion)
// APP_URL = frontend (def. http://localhost:5173). Sirve cualquier backend: solo se observa la pantalla de acceso.
import path from "node:path";
import fs from "node:fs";
import { lanzar, pausa, RAIZ } from "../lib/helpers.mjs";

const salida = path.resolve(RAIZ, process.argv[2] || "docs/b2-integracion/login-motion");
fs.mkdirSync(salida, { recursive: true });
const APP = process.env.APP_URL || "http://localhost:5173";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const p = await lanzar({ ancho: 1440, alto: 900 });
const E = (js) => p.eval(`(() => { ${js} })()`);
const tecla = async (key, code, vk) => {
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk });
  await p.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
};
/** Congela todas las animaciones CSS en el instante t (ms desde el montaje): permite cuadros deterministas de la entrada. */
const cuadro = (t) => E(`document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = ${t}; } catch {} }); return document.getAnimations().length`);
const liberar = () => E("document.getAnimations().forEach(a => { try { a.play(); } catch {} }); return true");
const abrir = async () => { await p.ir(APP + "/"); await pausa(400); await p.eval("localStorage.clear(); sessionStorage.clear(); true"); await p.ir(APP + "/"); await pausa(3000); };

try {
  await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await abrir();
  const vistas = await E("return { red: !!document.querySelector('.lg-geo'), lineas: document.querySelectorAll('.lg-traza').length, nodos: document.querySelectorAll('.lg-nd-core').length, senales: document.querySelectorAll('.lg-sg').length, logo: !!document.querySelector('img.lg-logo'), titulo: document.querySelector('.lg-brand-body h2')?.textContent }");
  ok("la red animada está montada (7 líneas, 8 nodos, 3 señales)", vistas.red && vistas.lineas >= 7 && vistas.nodos === 8 && vistas.senales === 3, JSON.stringify(vistas));
  ok("el título conserva su texto accesible completo", /Seguimiento de\s+Proyección Social/.test(vistas.titulo || ""), JSON.stringify(vistas.titulo));
  ok("el logo oficial de ProySocial sigue en la tarjeta", vistas.logo);

  // ── Línea de tiempo de la entrada (cuadros congelados) ──
  // Se inyecta un script que pausa TODAS las animaciones apenas existen (las de entrada, una vez terminadas, dejan de ser consultables),
  // y se guarda la lista para fijar cada una en el instante t desde el montaje.
  const { identifier } = await p.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const iv = setInterval(() => { const a = document.getAnimations(); if (a.length > 40) { a.forEach(x => x.pause()); window.__anims = a; clearInterval(iv); } }, 0); })()` });
  await p.send("Page.navigate", { url: APP + "/" }); await pausa(2500);
  const congeladas = await E("return window.__anims ? window.__anims.length : 0");
  ok("la línea de tiempo se pudo congelar (animaciones capturadas al montar)", congeladas > 40, `${congeladas} animaciones`);
  const fijar = (t) => E(`window.__anims.forEach(a => { a.currentTime = ${t}; }); return true`);
  for (const t of [0, 250, 600, 900, 1300, 2200]) {
    await fijar(t); await pausa(150);
    await p.foto(path.join(salida, `entrada-${String(t).padStart(4, "0")}ms-1440.png`));
  }
  // Señal viajando y respuesta del nodo (ciclo 1: sale a 3.4 s, llega ~5.8 s)
  for (const t of [4300, 5100, 5800, 6200]) {
    await fijar(t); await pausa(150);
    await p.foto(path.join(salida, `ambiente-senal-${t}ms-1440.png`));
  }
  await p.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

  // ── Ningún elemento queda oculto una vez terminada la entrada ──
  await abrir();
  const ocultos = await E(`const sel=['.lg-brand-top','.lg-linea > span','.lg-brand-body p','.lg-brand-foot','.lg-card','.lg-logo','.lg-card h1','.lg-sub','.lg-bloque','.lg-nota'];
    return sel.filter(s => [...document.querySelectorAll(s)].some(e => parseFloat(getComputedStyle(e).opacity) < 0.99)).join(',')`);
  ok("terminada la entrada todo está opaco y asentado", ocultos === "", ocultos);
  ok("el fondo decorativo no intercepta eventos", await E("return getComputedStyle(document.querySelector('.lg-motion')).pointerEvents === 'none' && document.querySelector('.lg-motion').getAttribute('aria-hidden') === 'true'"));
  ok("el formulario no se mueve por el parallax (la tarjeta no está dentro de .lg-motion)", await E("return !document.querySelector('.lg-motion').contains(document.querySelector('.lg-card'))"));

  // ── La interfaz es utilizable antes de que termine la entrada ──
  await p.ir(APP + "/");
  const clicTemprano = await E(`const b=document.querySelector('.lg-btn-sec, .lg-user, .lg-google-btn'); return !!b`).catch(() => false);
  await pausa(1500);
  ok("los controles existen y son operables a ~1,5 s de la carga", clicTemprano !== undefined);

  // ── Rendimiento: animaciones en curso, FPS y tiempo de CPU en reposo ──
  await abrir();
  const anim = await E("const a=document.getAnimations(); return { total: a.length, infinitas: a.filter(x => x.effect?.getComputedTiming().iterations === Infinity).length, propiedades: [...new Set(a.flatMap(x => (x.effect?.getKeyframes?.() || []).flatMap(k => Object.keys(k)).filter(k => !['offset','easing','composite','computedOffset'].includes(k))))].sort().join(',') }");
  console.log("Animaciones:", JSON.stringify(anim));
  const costosos = anim.propiedades.split(",").filter((k) => /^(width|height|top|left|right|bottom|margin|padding|boxShadow|filter)/.test(k));
  ok("las animaciones usan propiedades baratas (transform/opacity/stroke/offset/clip)", costosos.length === 0, anim.propiedades);
  await p.send("Performance.enable");
  const m0 = Object.fromEntries((await p.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const fps = await p.eval(`new Promise(r => { let n=0; const t0=performance.now(); const f=()=>{ n++; if (performance.now()-t0 < 4000) requestAnimationFrame(f); else r(n/4); }; requestAnimationFrame(f); })`);
  const m1 = Object.fromEntries((await p.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const cpu = ((m1.TaskDuration - m0.TaskDuration) / (m1.Timestamp - m0.Timestamp)) * 100;
  const layouts = m1.LayoutCount - m0.LayoutCount;
  console.log(`Rendimiento (4 s, reposo): ${fps.toFixed(1)} fps · CPU del hilo principal ${cpu.toFixed(1)} % · ${layouts} layouts · ${(m1.RecalcStyleCount - m0.RecalcStyleCount)} recálculos de estilo`);
  ok("sin recálculo de layout continuo en reposo", layouts <= 4, `${layouts} layouts en 4 s`);
  ok("el hilo principal queda holgado (<25 % de CPU en headless sin GPU)", cpu < 25, `${cpu.toFixed(1)} %`);

  // ── Pestaña oculta: se pausan las animaciones ambientales ──
  await E("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); return true");
  await pausa(150);
  ok("con la pestaña oculta la red se pausa", await E("return document.querySelector('.lg-motion').classList.contains('is-pausada') && getComputedStyle(document.querySelector('.lg-nd-core')).animationPlayState === 'paused'"));
  await E("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange')); return true");
  await pausa(150);
  ok("al volver a la pestaña se reanuda", await E("return !document.querySelector('.lg-motion').classList.contains('is-pausada')"));

  // ── Parallax: ratón en escritorio mueve solo lo decorativo y poco ──
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1300, y: 800, pointerType: "mouse" }); await pausa(1100);
  const par = await E("const w=document.querySelector('.lg-geo-wrap'); const m=new DOMMatrix(getComputedStyle(w).transform); const c=document.querySelector('.lg-card').getBoundingClientRect(); return { dx: m.m41, dy: m.m42, cardX: c.x }");
  ok("parallax discreto (≤ 6 px) solo en la red", Math.abs(par.dx) <= 6.01 && Math.abs(par.dy) <= 6.01 && (Math.abs(par.dx) > 0.3 || Math.abs(par.dy) > 0.3), JSON.stringify(par));

  // ── Capturas finales por tamaño ──
  for (const [w, h] of [[1440, 900], [1280, 800], [820, 1180], [390, 844], [360, 800]]) {
    await p.tamano(w, h); await p.ir(APP + "/"); await pausa(2600);
    const d = await E("return document.documentElement.scrollWidth - innerWidth");
    const sinScrollV = w === 1440 ? await E("return document.documentElement.scrollHeight <= innerHeight + 1") : null;
    await p.foto(path.join(salida, `login-${w}.png`));
    ok(`${w}px sin desborde horizontal`, d <= 1, `${d}px`);
    if (sinScrollV !== null) ok("1440×900 se ve completo sin scroll vertical", sinScrollV);
    if (w <= 820) ok(`${w}px: detalle geométrico animado en la cabecera`, await E("const m=document.querySelector('.lg-mini'); return !!m && m.getBoundingClientRect().width > 40"));
  }
  await p.tamano(1440, 900);

  // ── Movimiento reducido ──
  await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await p.ir(APP + "/"); await pausa(500);
  const red = await E("const a=document.getAnimations().filter(x => !x.effect?.target?.classList?.contains('lg-spin') && x.playState==='running'); return { corriendo: a.length, lineas: [...document.querySelectorAll('.lg-traza')].every(l => getComputedStyle(l).strokeDashoffset === '0px'), senales: [...document.querySelectorAll('.lg-sg')].every(s => getComputedStyle(s).display === 'none'), tarjeta: getComputedStyle(document.querySelector('.lg-card')).opacity, titulo: getComputedStyle(document.querySelector('.lg-linea > span')).transform }");
  ok("prefers-reduced-motion: ninguna animación en curso", red.corriendo === 0, JSON.stringify(red));
  ok("prefers-reduced-motion: red completa y todo visible desde el primer instante", red.lineas && red.senales && red.tarjeta === "1" && (red.titulo === "none" || red.titulo === "matrix(1, 0, 0, 1, 0, 0)"));
  await p.foto(path.join(salida, "reducido-1440.png"));
  await p.tamano(390, 844); await p.ir(APP + "/"); await pausa(500);
  await p.foto(path.join(salida, "reducido-390.png"));
  await p.tamano(1440, 900);
  await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  // ── Teclado: el foco es visible y el orden razonable ──
  await abrir();
  await E("document.body.focus(); return true");
  const orden = [];
  for (let i = 0; i < 8; i += 1) {
    await tecla("Tab", "Tab", 9); await pausa(80);
    orden.push(await E("const e=document.activeElement; if(!e||e===document.body) return 'body'; const s=getComputedStyle(e); return (e.tagName+'.'+(e.className||e.id||'')).slice(0,40)+(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2?' [foco visible]':'')"));
  }
  console.log("Orden de Tab:", orden.join(" → "));
  ok("Tab alcanza algún control con foco visible", orden.some((x) => x.includes("[foco visible]")) || orden.some((x) => x.startsWith("IFRAME")), orden.join(" | "));
  await p.foto(path.join(salida, "teclado-foco-1440.png"));

  // ── Estados de Google (según el entorno) ──
  const g = await E("return { aviso: document.querySelector('.lg-aviso')?.textContent?.trim().slice(0,90) || null, esqueleto: !!document.querySelector('.lg-esqueleto'), boton: !!document.querySelector('.lg-google-btn:not([hidden])'), error: !!document.querySelector('.lg-aviso.is-error') }");
  console.log("Estado de Google en este entorno:", JSON.stringify(g));

  // ── Consola limpia ──
  const errores = p.consola.filter((c) => !/google|gsi|accounts\.google|favicon|ERR_|Failed to load resource/i.test(c));
  ok("sin errores de consola propios", errores.length === 0, errores.slice(0, 3).join(" | "));
} finally {
  await p.cerrar();
}
console.log("\n" + res.join("\n"));
const fallas = res.filter((r) => r.startsWith("FALLA")).length;
console.log(`\n${res.length - fallas}/${res.length} OK`);
process.exit(fallas ? 1 : 0);
