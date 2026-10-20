// Prueba de humo PÚBLICA y de solo lectura contra un despliegue (piloto o local). No necesita credenciales ni escribe nada.
//   node backend/scripts/piloto-humo.mjs https://<url-del-servicio-de-piloto>
// Comprueba: salud con base de datos, SPA y enlaces directos, API cerrada sin sesión, acceso de desarrollo inexistente, Google configurado,
// cabeceras de seguridad y CORS cerrado. Sale con código 1 si algo falla. Lo que exige iniciar sesión (Google real) está en el checklist manual
// de docs/LANZAMIENTO_PILOTO_PROYSOCIAL.md.
const base = String(process.argv[2] || "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) { console.error("Uso: node backend/scripts/piloto-humo.mjs <URL base>"); process.exit(2); }
const HTML = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
const res = [];
const ok = (n, c, d = "") => res.push(`${c ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const get = async (ruta, init = {}) => { const r = await fetch(base + ruta, { redirect: "manual", ...init }); return { r, texto: await r.text() }; };

try {
  const h = await get("/health");
  let salud = {}; try { salud = JSON.parse(h.texto); } catch { /* no JSON */ }
  ok("GET /health responde 200 y confirma la conexión a la base de datos", h.r.status === 200 && salud.ok === true, `status=${h.r.status}`);
  ok("el correo está en un estado explícito (activado y configurado, o desactivado a propósito)", salud.email && (salud.email.enabled === false || salud.email.configured === true), JSON.stringify(salud.email));
  const raiz = await get("/", { headers: HTML });
  ok("la raíz entrega la aplicación (SPA)", raiz.r.status === 200 && /id="root"/.test(raiz.texto));
  for (const ruta of ["/docente/matriz", "/docente/evidencias?entregable=1", "/admin/revision?reporte=1", "/admin/sistema"]) {
    const d = await get(ruta, { headers: HTML });
    ok(`enlace directo ${ruta} entrega la aplicación (no el JSON de la API)`, d.r.status === 200 && /id="root"/.test(d.texto), `status=${d.r.status}`);
  }
  const sinSesion = await get("/docente/1/matriz", { headers: { Accept: "application/json" } });
  ok("la API de docente exige sesión (401)", sinSesion.r.status === 401);
  const adm = await get("/admin/usuarios", { headers: { Accept: "application/json" } });
  ok("la API de administración exige sesión (401)", adm.r.status === 401);
  const dev = await get("/auth/dev/usuarios", { headers: { Accept: "application/json" } });
  ok("el acceso de desarrollo NO existe en este entorno", dev.r.status === 404 || dev.r.status === 401 ? dev.r.status === 404 : !/proysocial\.local/.test(dev.texto), `status=${dev.r.status}`);
  const g = await get("/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  ok("el inicio de sesión de Google está configurado (rechaza una petición vacía con 400, no 503)", g.r.status === 400, `status=${g.r.status}${g.r.status === 503 ? " (GOOGLE_CLIENT_ID sin configurar)" : ""}`);
  ok("sin cabecera X-Powered-By", !h.r.headers.get("x-powered-by"));
  ok("cabeceras de seguridad básicas (nosniff, X-Frame-Options)", h.r.headers.get("x-content-type-options") === "nosniff" && /deny/i.test(h.r.headers.get("x-frame-options") || ""));
  const c = await get("/admin/usuarios", { method: "OPTIONS", headers: { Origin: "https://origen-ajeno.example", "Access-Control-Request-Method": "GET" } });
  ok("CORS cerrado: un origen ajeno no recibe Access-Control-Allow-Origin", !c.r.headers.get("access-control-allow-origin"));
  ok("HTTPS", base.startsWith("https://") || /localhost|127\.0\.0\.1/.test(base), base.startsWith("https://") ? "" : "URL sin HTTPS (solo aceptable en local)");
} catch (e) {
  ok("la prueba de humo terminó sin excepciones", false, String(e).slice(0, 200));
}
console.log(res.join("\n"));
const fallas = res.filter((l) => l.startsWith("FALLA")).length;
console.log(`\n${res.length - fallas} OK · ${fallas} FALLA`);
process.exit(fallas ? 1 : 0);
