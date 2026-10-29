// Acceso PÚBLICO de demostración (DEMO_PUBLIC_READONLY=true): los cinco perfiles entran SIN clave y SOLO LEEN. Contra la base LOCAL proysocial_piloto
// (copia sintética; nunca Cloud SQL). Se omite si no es esa base.
//   PGDATABASE=proysocial_piloto node --env-file=.env --test test/integration/demo-publico.integration.test.js
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const SECRET = "pruebas-demo-publico-secreto-largo-0123456789abcdef";
process.env.JWT_SECRET = SECRET;
const skip = process.env.PGDATABASE === "proysocial_piloto" && !process.env.DATABASE_URL ? false : "Requiere PGDATABASE=proysocial_piloto local";
const procs = [];
const P = { pub: 4320, conflicto: 4321, datos: 4322, sinBase: 4323, limite: 4324, sinFlag: 4325 };
const api = (k) => `http://127.0.0.1:${P[k]}`;
const CINCO = ["admin@proysocial.local", "andres.torres@proysocial.local", "carlos.mendoza@proysocial.local", "laura.gomez@proysocial.local", "maria.rodriguez@proysocial.local"];
const REAL = "persona.real.prueba@example.com";

async function arrancar(port, extra = {}) {
  const env = { ...process.env, JWT_SECRET: SECRET, EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(port), STATIC_DIR: "/nonexistent", DEMO_ENABLED: "true", DEMO_PUBLIC_READONLY: "true", DEMO_ACCESS_KEY: "", DEMO_OPEN: "", DEV_LOGIN_ENABLED: "", ...extra };
  const p = spawn(process.execPath, ["src/index.js"], { cwd: new URL("../../", import.meta.url), env, stdio: ["ignore", "ignore", "ignore"] });
  procs.push(p);
  for (let i = 0; i < 80; i += 1) {
    try { await fetch(`http://127.0.0.1:${port}/`); return; } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("servidor no inició");
}
const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const get = (url, token) => j(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const send = (method, url, body, token) => j(url, { method, body: JSON.stringify(body ?? {}), headers: token ? { Authorization: `Bearer ${token}` } : {} });
const sesion = (k, correo) => send("POST", `${api(k)}/auth/demo/sesion`, { correo });

let pool;
async function huella() {
  const tablas = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")).rows.map((r) => r.tablename);
  const out = {};
  for (const t of tablas) out[t] = (await pool.query(`SELECT COUNT(*)::int n, md5(COALESCE(string_agg(x::text, '' ORDER BY x::text), '')) h FROM "${t}" x`)).rows[0];
  return out;
}

before(async () => {
  if (skip) return;
  ({ pool } = await import("../../src/db.js"));
  await arrancar(P.pub);
  await arrancar(P.conflicto, { DEMO_OPEN: "true" });
  await arrancar(P.datos, { DEMO_DATOS_TTL_MS: "0" });
  await arrancar(P.sinBase, { PGUSER: "usuario_inexistente_gcp", PGPASSWORD: "incorrecta" });
  await arrancar(P.limite);
  await arrancar(P.sinFlag, { DEMO_PUBLIC_READONLY: "" });
});
after(async () => {
  await pool?.query("DELETE FROM usuarios WHERE correo = $1", [REAL]).catch(() => {});
  procs.forEach((p) => p.kill());
  await pool?.end();
});

test("estado: público, solo lectura, cinco tarjetas sin ids ni fotos y sin pedir clave", { skip }, async () => {
  const e = await get(`${api("pub")}/auth/demo/estado`);
  assert.equal(e.status, 200);
  assert.equal(e.data.habilitado, true);
  assert.equal(e.data.publico, true);
  assert.equal(e.data.abierto, false);
  assert.equal(e.data.entorno.solo_lectura, true);
  assert.deepEqual(e.data.usuarios.map((u) => u.correo), CINCO);
  assert.deepEqual(Object.keys(e.data.usuarios[0]).sort(), ["apellido", "correo", "nombre", "rol"]);
});

test("cada uno de los cinco perfiles abre sesión SIN clave, y la sesión es de solo lectura", { skip }, async () => {
  for (const correo of CINCO) {
    const s = await sesion("pub", correo);
    assert.equal(s.status, 200, correo);
    assert.equal(s.data.solo_lectura, true, correo);
    assert.equal(s.data.entorno, "demo");
    const p = jwt.decode(s.data.token);
    assert.equal(p.scope, "demo");
    assert.equal(s.data.user.rol, correo.startsWith("admin") ? "admin" : "docente");
    const me = await get(`${api("pub")}/auth/me`, s.data.token);
    assert.equal(me.status, 200, `${correo} /auth/me (recarga de página)`);
  }
});

test("solo existen los cinco perfiles: cualquier otro correo o manipulación se rechaza", { skip }, async () => {
  for (const correo of ["otro@proysocial.local", "admin@example.com", "", "ADMIN@proysocial.local.evil.com", "' OR 1=1 --"]) {
    assert.equal((await sesion("pub", correo)).status, 403, `correo ${correo}`);
  }
  assert.equal((await send("POST", `${api("pub")}/auth/demo/sesion`, { correo: ["admin@proysocial.local"] })).status, 403, "un arreglo no se convierte en cadena");
  assert.equal((await send("POST", `${api("pub")}/auth/demo/sesion`, { correo: { toString: "admin@proysocial.local" } })).status, 403);
  const docente = await sesion("pub", "maria.rodriguez@proysocial.local");
  const [h, , sig] = docente.data.token.split(".");
  const forjado = (carga) => `${h}.${Buffer.from(JSON.stringify(carga)).toString("base64url")}.${sig}`;
  const base = jwt.decode(docente.data.token);
  for (const t of [forjado({ ...base, sub: "1", role: "admin" }), forjado({ ...base, role: "admin" }), forjado({ ...base, scope: undefined })]) {
    assert.equal((await get(`${api("pub")}/auth/me`, t)).status, 401, "token alterado");
  }
  const otroSecreto = jwt.sign({ ...base, sub: "1" }, "otro-secreto-largo-0123456789abcdefghij", { algorithm: "HS256" });
  assert.equal((await get(`${api("pub")}/auth/me`, otroSecreto)).status, 401);
  assert.equal((await get(`${api("pub")}/auth/me`, jwt.sign({ ...base, sub: "1" }, "", { algorithm: "none" }))).status, 401);
  // El rol sale de la base, no del token: una docente no llega a /admin aunque su sesión diga lo contrario.
  const mia = await get(`${api("pub")}/admin/dashboard`, docente.data.token);
  assert.equal(mia.status, 403);
});

test("las lecturas funcionan con los permisos de cada rol (admin y docentes)", { skip }, async () => {
  const adm = await sesion("pub", "admin@proysocial.local");
  assert.equal((await get(`${api("pub")}/admin/dashboard`, adm.data.token)).status, 200);
  for (const correo of CINCO.slice(1)) {
    const s = await sesion("pub", correo);
    assert.equal((await get(`${api("pub")}/docente/${s.data.user.id}/dashboard`, s.data.token)).status, 200, correo);
    assert.equal((await get(`${api("pub")}/docente/${s.data.user.id}/matriz`, s.data.token)).status, 200, correo);
    assert.equal((await get(`${api("pub")}/admin/dashboard`, s.data.token)).status, 403, `${correo} no es admin`);
  }
});

test("escrituras (POST/PUT/PATCH/DELETE) y secciones sensibles: 403 y la base no cambia", { skip }, async () => {
  const antes = await huella();
  for (const correo of ["admin@proysocial.local", "maria.rodriguez@proysocial.local"]) {
    const s = await sesion("pub", correo);
    const t = s.data.token, id = s.data.user.id;
    const escrituras = [
      ["POST", "/admin/usuarios"], ["PUT", "/admin/usuarios/2"], ["PATCH", "/admin/usuarios/2"], ["DELETE", "/admin/usuarios/2"],
      ["PUT", "/admin/proyectos/1"], ["POST", "/admin/proyectos"], ["DELETE", "/admin/proyectos/1"], ["POST", "/admin/semestres"],
      ["POST", "/admin/importaciones/matrices"], ["POST", "/admin/correos/probar"], ["PUT", "/admin/correos/configuracion"],
      ["PUT", `/docente/${id}/info-contacto`], ["POST", `/docente/${id}/matriz/1/completar`], ["PUT", "/docente/entregables/1"],
      ["PUT", "/docente/entregables/1/evidencias"], ["POST", `/docente/${id}/entregables/1/reenviar`], ["PATCH", `/docente/${id}/perfil`],
      ["DELETE", `/docente/${id}/notificaciones/1`],
    ];
    for (const [m, ruta] of escrituras) {
      const r = await send(m, `${api("pub")}${ruta}`, { x: 1 }, t);
      assert.equal(r.status, 403, `${correo} ${m} ${ruta} → ${r.status}`);
      assert.equal(r.data.demo, true, `${m} ${ruta}: bloqueo del modo demo`);
    }
    for (const ruta of ["/admin/usuarios", "/admin/usuarios/1", "/admin/correos/estado", "/admin/importaciones/matrices", "/admin/correos/cola"]) {
      assert.equal((await get(`${api("pub")}${ruta}`, t)).status, 403, `${correo} GET ${ruta} sensible`);
    }
  }
  assert.deepEqual(await huella(), antes, "ninguna tabla cambió");
});

test("navegar muchas pantallas con cada perfil no escribe nada (ni ultimo_acceso)", { skip }, async () => {
  const antes = await huella();
  const adm = await sesion("pub", "admin@proysocial.local");
  for (const r of ["/admin/dashboard", "/admin/notificaciones", "/admin/metricas", "/admin/reportes-revision", "/admin/docentes", "/admin/semestres", "/admin/grupos-matriz", "/admin/indicadores-grupo", "/admin/proyectos", "/admin/seguimiento", "/admin/avance-consolidado", "/admin/escuelas", "/admin/programas", "/catalogos"]) {
    const x = await get(`${api("pub")}${r}`, adm.data.token);
    assert.ok(x.status < 500, `${r} → ${x.status}`);
  }
  for (const correo of CINCO.slice(1)) {
    const s = await sesion("pub", correo); const id = s.data.user.id;
    for (const r of [`/docente/${id}/dashboard`, `/docente/${id}/matriz`, `/docente/${id}/cronograma`, `/docente/${id}/notificaciones`, `/docente/${id}/perfil`, `/docente/${id}/evidencias`, `/docente/${id}/reportes`, "/auth/me"]) {
      assert.ok((await get(`${api("pub")}${r}`, s.data.token)).status < 500, `${correo} ${r}`);
    }
  }
  assert.deepEqual(await huella(), antes);
});

test("el acceso DEV no existe en este servidor y Google/sesión normal siguen intactos", { skip }, async () => {
  assert.equal((await get(`${api("pub")}/auth/dev/usuarios`)).status, 404);
  assert.equal((await send("POST", `${api("pub")}/auth/dev/login`, { correo: "admin@proysocial.local" })).status, 404);
  assert.notEqual((await send("POST", `${api("pub")}/auth/google`, { credential: "x" })).status, 404, "/auth/google sigue montado y es independiente");
  const { createSessionToken } = await import("../../src/middleware/auth.js");
  const admin = (await pool.query("SELECT id, correo, rol FROM usuarios WHERE LOWER(correo)='admin@proysocial.local'")).rows[0];
  assert.equal((await get(`${api("pub")}/admin/usuarios`, createSessionToken(admin))).status, 200, "un token normal conserva sus permisos");
});

test("DEMO_PUBLIC_READONLY es incompatible con DEMO_OPEN: no se monta (nunca escritura pública) y sin la variable tampoco hay acceso sin clave", { skip }, async () => {
  assert.equal((await get(`${api("conflicto")}/auth/demo/estado`)).status, 404);
  assert.equal((await sesion("conflicto", "admin@proysocial.local")).status, 404);
  assert.equal((await get(`${api("sinFlag")}/auth/demo/estado`)).status, 404, "sin clave ni modo público la demostración no existe");
});

test("si la base contiene usuarios reales el acceso público se apaga solo, y vuelve al retirarlos", { skip }, async () => {
  assert.equal((await get(`${api("datos")}/auth/demo/estado`)).status, 200);
  try {
    await pool.query("INSERT INTO usuarios (nombre, apellido, correo, rol, estado) VALUES ('Persona','Real',$1,'docente','activo')", [REAL]);
    const e = await get(`${api("datos")}/auth/demo/estado`);
    assert.equal(e.status, 503);
    assert.match(e.data.error, /deshabilitado/);
    assert.equal((await sesion("datos", "admin@proysocial.local")).status, 503);
  } finally {
    await pool.query("DELETE FROM usuarios WHERE correo = $1", [REAL]);
  }
  assert.equal((await get(`${api("datos")}/auth/demo/estado`)).status, 200);
});

test("si la base no responde: error claro (503) y ninguna sesión", { skip }, async () => {
  assert.equal((await get(`${api("sinBase")}/health`)).status, 500);
  const e = await get(`${api("sinBase")}/auth/demo/estado`);
  assert.equal(e.status, 503);
  assert.match(e.data.error, /base de datos/i);
  const s = await sesion("sinBase", "admin@proysocial.local");
  assert.equal(s.status, 503);
  assert.equal(s.data.token, undefined);
});

test("límite de emisión de sesiones por IP: tras el tope responde 429 con Retry-After", { skip }, async () => {
  let ultimo = 0;
  for (let i = 0; i < 125; i += 1) { ultimo = (await sesion("limite", "laura.gomez@proysocial.local")).status; if (ultimo === 429) break; }
  assert.equal(ultimo, 429);
  const r = await fetch(`${api("limite")}/auth/demo/sesion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
});
