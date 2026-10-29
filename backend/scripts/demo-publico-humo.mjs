// Prueba de humo del acceso PÚBLICO de demostración (DEMO_PUBLIC_READONLY) contra cualquier URL, p. ej. la revisión etiquetada de Cloud Run ANTES de
// pasarle tráfico. Solo hace lecturas y peticiones de escritura que DEBEN ser rechazadas (403); no modifica datos.
//   set DEMO_URL=https://tarjetas---proysocial-piloto-xxxx.a.run.app && node backend/scripts/demo-publico-humo.mjs
const BASE = String(process.env.DEMO_URL || "").replace(/\/$/, "");
if (!BASE) { console.error("Define DEMO_URL"); process.exit(2); }
const CINCO = ["admin@proysocial.local", "andres.torres@proysocial.local", "carlos.mendoza@proysocial.local", "laura.gomez@proysocial.local", "maria.rodriguez@proysocial.local"];
let fallas = 0;
const ok = (n, c, d = "") => { if (!c) fallas += 1; console.log(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`); };
const j = async (m, ruta, { token, body } = {}) => {
  const r = await fetch(BASE + ruta, { method: m, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
};

const h = await j("GET", "/health");
ok("/health responde 200 (la base conecta)", h.s === 200, `status ${h.s}`);
const e = await j("GET", "/auth/demo/estado");
ok("/auth/demo/estado: 200, público, SOLO LECTURA (no abierto)", e.s === 200 && e.d.publico === true && e.d.abierto === false && e.d.entorno?.solo_lectura === true, JSON.stringify({ s: e.s, publico: e.d.publico, abierto: e.d.abierto }));
ok("cinco tarjetas y nada más", JSON.stringify(e.d.usuarios?.map((u) => u.correo)) === JSON.stringify(CINCO));
ok("el acceso DEV no está expuesto", (await j("GET", "/auth/dev/usuarios")).s === 404 && (await j("POST", "/auth/dev/login", { body: { correo: CINCO[0] } })).s === 404);
ok("un correo fuera de los cinco se rechaza (403)", (await j("POST", "/auth/demo/sesion", { body: { correo: "otro@proysocial.local" } })).s === 403);
for (const correo of CINCO) {
  const s = await j("POST", "/auth/demo/sesion", { body: { correo } });
  ok(`${correo}: sesión sin clave, solo lectura`, s.s === 200 && s.d.solo_lectura === true && s.d.entorno === "demo");
  if (s.s !== 200) continue;
  const t = s.d.token, id = s.d.user.id, adm = s.d.user.rol === "admin";
  ok(`${correo}: lectura 200 (/auth/me y panel)`, (await j("GET", "/auth/me", { token: t })).s === 200 && (await j("GET", adm ? "/admin/dashboard" : `/docente/${id}/dashboard`, { token: t })).s === 200);
  const w = [];
  for (const [m, r] of [["POST", "/admin/usuarios"], ["PUT", "/admin/proyectos/1"], ["DELETE", "/admin/proyectos/1"], ["PATCH", "/admin/usuarios/2"], ["PUT", `/docente/${id}/info-contacto`], ["POST", `/docente/${id}/matriz/1/completar`]]) w.push((await j(m, r, { token: t, body: {} })).s);
  ok(`${correo}: todas las escrituras → 403`, w.every((x) => x === 403), w.join(","));
  ok(`${correo}: usuarios y correos administrativos bloqueados`, (await j("GET", "/admin/usuarios", { token: t })).s === 403 && (await j("GET", "/admin/correos/estado", { token: t })).s === 403);
}
console.log(fallas ? `\n${fallas} FALLA(S): NO pases el tráfico a esta revisión.` : "\nTodo OK: la revisión puede recibir tráfico.");
process.exit(fallas ? 1 : 0);
