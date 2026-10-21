// Prueba de humo del modo demostración contra una URL (revisión sin tráfico, Cloud Run o local). Solo hace peticiones HTTP: no toca la base.
//   $env:DEMO_URL = "https://..."; $env:DEMO_KEY = "<clave>"; node backend/scripts/demo-humo.mjs
// Nunca imprime la clave ni los tokens. Termina con código 1 si algo falla.
const base = String(process.env.DEMO_URL || "").replace(/\/$/, "");
const clave = String(process.env.DEMO_KEY || "");
if (!base || !clave) { console.error("Define DEMO_URL y DEMO_KEY."); process.exit(2); }

const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const j = async (ruta, { method = "GET", body, token } = {}) => {
  const r = await fetch(base + ruta, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const est = await j("/auth/demo/estado");
ok("demostración habilitada y solo lectura", est.status === 200 && est.data.entorno?.solo_lectura === true && est.data.entorno?.base === "proysocial_piloto", `base=${est.data.entorno?.base}`);
ok("acceso de desarrollo inexistente (/auth/dev)", (await j("/auth/dev/usuarios")).status === 404);
ok("API privada sin sesión: 401", (await j("/admin/dashboard")).status === 401 && (await j("/docente/1/dashboard")).status === 401);
ok("clave incorrecta: 401", (await j("/auth/demo/acceso", { method: "POST", body: { clave: "clave-incorrecta-xyz" } })).status === 401);

const acc = await j("/auth/demo/acceso", { method: "POST", body: { clave } });
ok("clave válida: pase + 5 usuarios", acc.status === 200 && acc.data.usuarios?.length === 5, `usuarios=${acc.data.usuarios?.length}`);
if (acc.status === 200) {
  const sesiones = {};
  for (const u of acc.data.usuarios) {
    const s = await j("/auth/demo/sesion", { method: "POST", body: { correo: u.correo }, token: acc.data.pase });
    sesiones[u.rol] ??= { token: s.data.token, id: s.data.user?.id };
    ok(`sesión de ${u.correo} (${u.rol})`, s.status === 200 && !!s.data.token);
  }
  const a = sesiones.admin, d = sesiones.docente;
  ok("admin: dashboard 200", (await j("/admin/dashboard", { token: a.token })).status === 200);
  ok("admin: PUT/POST/DELETE → 403 (solo lectura)",
    (await j("/admin/proyectos/1", { method: "PUT", body: {}, token: a.token })).status === 403 &&
    (await j("/admin/proyectos", { method: "POST", body: {}, token: a.token })).status === 403 &&
    (await j("/admin/escuelas/1", { method: "DELETE", token: a.token })).status === 403);
  ok("admin: usuarios y correos bloqueados", (await j("/admin/usuarios", { token: a.token })).status === 403 && (await j("/admin/correos/estado", { token: a.token })).status === 403);
  ok("docente: su matriz 200 y /admin 403", (await j(`/docente/${d.id}/matriz`, { token: d.token })).status === 200 && (await j("/admin/dashboard", { token: d.token })).status === 403);
  ok("docente: escritura propia → 403", (await j(`/docente/${d.id}/info-contacto`, { method: "PUT", body: {}, token: d.token })).status === 403);
}
console.log(res.join("\n"));
process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
