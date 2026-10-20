// Login rediseñado (identidad B2): estados de interacción, teclado, inicio y cierre de sesión como administrador y docente, redirecciones,
// reflujo con zoom y consola limpia. Usa el acceso de desarrollo local (proysocial_dev, solo localhost). No escribe en la base salvo el efecto
// normal de iniciar sesión (último acceso). Uso: node e2e/suites/login-redisenio.mjs
import { lanzar, pausa } from "../lib/helpers.mjs";
const APP = process.env.APP_URL || "http://localhost:5173";
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const p = await lanzar({ ancho: 1440, alto: 900 });
const E = (js) => p.eval(`(() => { ${js} })()`);
const tecla = async (key, code, vk) => {
  await p.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...(key === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await p.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
};
const limpio = async () => { await p.ir(APP + "/"); await pausa(500); await p.eval("localStorage.clear(); true"); await p.ir(APP + "/"); await pausa(2500); };
try {
  await limpio();
  ok("la sección de desarrollo aparece (el servidor confirmó el acceso) con 5 usuarios", (await E("return document.querySelectorAll('.lg-user').length")) === 5);
  ok("el administrador aparece primero y se distingue (avatar relleno y etiqueta)", await E("const u=document.querySelector('.lg-user'); return u.classList.contains('is-admin') && /Administrador/.test(u.textContent) && !document.querySelectorAll('.lg-user.is-admin')[1]"));
  ok("el acceso de desarrollo es secundario: va debajo del institucional", await E("const a=document.querySelector('.lg-bloque').getBoundingClientRect().top, b=document.querySelector('.lg-dev').getBoundingClientRect().top; return b>a"));
  // hover
  const c = await E("const r=document.querySelectorAll('.lg-user')[1].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}");
  const antes = await E("return getComputedStyle(document.querySelectorAll('.lg-user')[1]).backgroundColor");
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y }); await pausa(300);
  const hover = await E("return getComputedStyle(document.querySelectorAll('.lg-user')[1]).backgroundColor");
  ok("estado hover visible en el usuario", hover !== antes, `${antes} → ${hover}`);
  await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  // foco con teclado hasta el primer usuario
  await E("document.body.focus(); return true");
  let foco = false;
  for (let i = 0; i < 14 && !foco; i += 1) { await tecla("Tab", "Tab", 9); foco = await E("return document.activeElement?.classList.contains('lg-user')"); }
  ok("la navegación con Tab llega a los usuarios de prueba", foco);
  const fx = await E("const s=getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2");
  ok("el foco de teclado es visible (contorno ≥ 2 px)", fx);
  // teclado: Enter inicia sesión como el primero (administrador)
  const cons0 = p.consola.length;
  await tecla("Enter", "Enter", 13); await pausa(3500);
  ok("Enter sobre «Admin Sistema» inicia sesión y redirige a /admin", (await p.eval("location.pathname")) === "/admin", await p.eval("location.pathname"));
  ok("el panel de administración carga (cabecera B2)", await E("return !!document.querySelector('.b2-hd') && !/Algo salió mal/i.test(document.body.innerText)"));
  // cierre de sesión por la interfaz
  await E("document.querySelector('.b2-hd-user').click(); return true"); await pausa(500);
  await E("const it=[...document.querySelectorAll('[role=menuitem], .b2-pop button, .b2-menu button')].find(x=>/Cerrar sesión/.test(x.textContent)); it.click(); return true"); await pausa(2500);
  ok("«Cerrar sesión» vuelve al inicio y borra la sesión", (await p.eval("location.pathname")) === "/" && (await E("return !localStorage.getItem('proysocial:token')")));
  ok("tras cerrar sesión reaparece el acceso (institucional y de desarrollo)", (await E("return document.querySelectorAll('.lg-user').length")) === 5);
  // docente con clic de ratón
  await E("[...document.querySelectorAll('.lg-user')].find(b=>/maria\\.rodriguez/.test(b.textContent)).click(); return true");
  await pausa(300);
  ok("al elegir un usuario se marca como seleccionado y se bloquean los demás", await E("const s=document.querySelector('.lg-user.is-selected'); return !!s || location.pathname !== '/'"));
  await pausa(3500);
  ok("María Rodríguez entra y llega a /docente", (await p.eval("location.pathname")) === "/docente", await p.eval("location.pathname"));
  ok("el portal docente carga (cabecera B2, sin pantalla de error)", await E("return !!document.querySelector('.b2-hd') && !/Algo salió mal/i.test(document.body.innerText)"));
  await p.ir(APP + "/"); await pausa(1500);
  ok("con sesión abierta, volver a «/» redirige al panel del rol (docente)", (await p.eval("location.pathname")) === "/docente");
  const errs = p.consola.slice(cons0).filter((l) => /EXCEPCI|error:/i.test(l) && !/Failed to load resource|accounts\.google|ERR_/i.test(l));
  ok("sin excepciones ni errores de consola propios durante el flujo", errs.length === 0, errs.join(" | ").slice(0, 300));
  // reflujo y zoom
  await p.eval("localStorage.clear(); true");
  for (const [w, h, et] of [[1440, 900, "1440"], [1280, 800, "1280"], [820, 1180, "820"], [390, 844, "390"], [640, 450, "zoom 200 % de 1280"], [320, 640, "320 (zoom 400 %)"]]) {
    await p.tamano(w, h); await p.ir(APP + "/"); await pausa(2200);
    const m = await E("const d=document.documentElement; const b=[...document.querySelectorAll('.lg-user, .lg-google, .lg-card, .lg-dev-cab')].every(e=>{const r=e.getBoundingClientRect(); return r.left>=-1 && r.right<=innerWidth+1}); return {sc:d.scrollWidth-innerWidth, dentro:b, alturaUsuario:Math.round(document.querySelector('.lg-user').getBoundingClientRect().height)}");
    ok(`${et}: sin desborde horizontal y controles dentro de la pantalla`, m.sc <= 1 && m.dentro, JSON.stringify(m));
    if (w <= 480) ok(`${et}: áreas táctiles ≥ 44 px`, m.alturaUsuario >= 44, `${m.alturaUsuario}px`);
  }
  // el panel de desarrollo se puede plegar
  await p.tamano(1440, 900); await p.ir(APP + "/"); await pausa(2000);
  await E("document.querySelector('.lg-dev-cab').click(); return true"); await pausa(200);
  ok("el acceso de desarrollo se puede plegar y desplegar (aria-expanded)", (await E("return document.querySelector('.lg-dev-cab').getAttribute('aria-expanded')")) === "false" && (await E("return !document.querySelector('.lg-user')")));
} catch (e) {
  ok("la suite terminó sin excepciones", false, String(e?.stack || e).slice(0, 500));
} finally {
  await p.cerrar();
  console.log(res.join("\n"));
  const f = res.filter((l) => l.startsWith("FALLA")).length;
  console.log(`\n${res.length - f} OK · ${f} FALLA`);
  process.exit(f ? 1 : 0);
}
