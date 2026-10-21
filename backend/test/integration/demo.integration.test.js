// Modo demostración contra una base LOCAL llamada proysocial_piloto (clon de proysocial_dev). Se omite si no es esa base.
//   PGDATABASE=proysocial_piloto node --env-file=.env --test test/integration/demo.integration.test.js
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const SECRET = "pruebas-demo-secreto-largo-0123456789abcdef";
const CLAVE = "clave-demo-de-prueba-9X";
process.env.JWT_SECRET = SECRET;

const skip = process.env.PGDATABASE === "proysocial_piloto" && !process.env.DATABASE_URL ? false : "Requiere PGDATABASE=proysocial_piloto local";
const procs = [];
const P = { principal: 4310, fuerza: 4311, apagado: 4312, baseDev: 4313, conDev: 4314, corta: 4315 };
const api = (k) => `http://127.0.0.1:${P[k]}`;

async function arrancar(port, extra = {}) {
  const p = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: {
      ...process.env, JWT_SECRET: SECRET, EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(port), STATIC_DIR: "/nonexistent",
      DEMO_ENABLED: "true", DEMO_ACCESS_KEY: CLAVE, ...extra,
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  procs.push(p);
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("servidor no inició");
}
const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
};
const post = (url, body, token) => j(url, { method: "POST", body: JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {} });
const get = (url, token) => j(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function abrir(k, correo) {
  const a = await post(`${api(k)}/auth/demo/acceso`, { clave: CLAVE });
  assert.equal(a.status, 200);
  const s = await post(`${api(k)}/auth/demo/sesion`, { correo }, a.data.pase);
  assert.equal(s.status, 200, `sesión de ${correo}`);
  return { ...s.data, pase: a.data.pase };
}

let pool;
before(async () => {
  if (skip) return;
  ({ pool } = await import("../../src/db.js"));
  await arrancar(P.principal);
  await arrancar(P.fuerza);
  await arrancar(P.apagado, { DEMO_ENABLED: "false" });
  await arrancar(P.baseDev, { PGDATABASE: "proysocial_dev" });
  await arrancar(P.conDev, { DEV_LOGIN_ENABLED: "true", DEV_LOGIN_EMAILS: "admin@proysocial.local" });
  await arrancar(P.corta, { DEMO_SESSION_TTL: "2s" });
});
after(async () => { procs.forEach((p) => p.kill()); await pool?.end(); });

async function huella() {
  const tablas = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")).rows.map((r) => r.tablename);
  const out = {};
  for (const t of tablas) {
    const r = await pool.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`);
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return out;
}

test("clave inválida: 401 y sin pase; clave válida entrega los cinco usuarios", { skip }, async () => {
  assert.equal((await get(`${api("principal")}/auth/demo/estado`)).data.habilitado, true);
  for (const clave of ["", "mala", CLAVE + "x", 123]) {
    const r = await post(`${api("principal")}/auth/demo/acceso`, { clave });
    assert.equal(r.status, 401, String(clave));
    assert.equal(r.data.pase, undefined);
  }
  const ok = await post(`${api("principal")}/auth/demo/acceso`, { clave: CLAVE });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.usuarios.map((u) => u.correo).sort(), [
    "admin@proysocial.local", "andres.torres@proysocial.local", "carlos.mendoza@proysocial.local", "laura.gomez@proysocial.local", "maria.rodriguez@proysocial.local",
  ]);
  assert.equal(ok.data.usuarios.filter((u) => u.rol === "admin").length, 1);
  assert.ok(!JSON.stringify(ok.data).includes(CLAVE), "la clave nunca se devuelve");
  const lista = await get(`${api("principal")}/auth/demo/usuarios`, ok.data.pase);
  assert.equal(lista.data.usuarios.length, 5);
  assert.equal((await get(`${api("principal")}/auth/demo/usuarios`)).status, 401);
});

test("fuerza bruta: tras 5 fallos responde 429 con Retry-After, incluso con la clave correcta", { skip }, async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await post(`${api("fuerza")}/auth/demo/acceso`, { clave: `mala-${i}` })).status, 401);
  const r = await post(`${api("fuerza")}/auth/demo/acceso`, { clave: "mala-6" });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal((await post(`${api("fuerza")}/auth/demo/acceso`, { clave: CLAVE })).status, 429);
});

test("cada uno de los cinco usuarios entra y solo ve lo de su rol", { skip }, async () => {
  const correos = ["admin@proysocial.local", "maria.rodriguez@proysocial.local", "carlos.mendoza@proysocial.local", "andres.torres@proysocial.local", "laura.gomez@proysocial.local"];
  const admin = await abrir("principal", correos[0]);
  assert.equal(admin.user.rol, "admin");
  assert.equal(admin.solo_lectura, true);
  assert.equal((await get(`${api("principal")}/auth/me`, admin.token)).data.user.correo, correos[0]);
  assert.equal((await get(`${api("principal")}/admin/dashboard`, admin.token)).status, 200);
  for (const c of correos.slice(1)) {
    const d = await abrir("principal", c);
    assert.equal(d.user.rol, "docente", c);
    assert.equal((await get(`${api("principal")}/auth/me`, d.token)).data.user.correo, c);
    assert.equal((await get(`${api("principal")}/docente/${d.user.id}/dashboard`, d.token)).status, 200, c);
    assert.equal((await get(`${api("principal")}/docente/${d.user.id}/matriz`, d.token)).status, 200, c);
    assert.equal((await get(`${api("principal")}/admin/dashboard`, d.token)).status, 403, "docente no entra a /admin");
    assert.equal((await get(`${api("principal")}/docente/${admin.user.id}/matriz`, d.token)).status, 403, "docente no ve datos ajenos");
  }
});

test("no se puede elegir otro usuario, ni usar tokens cruzados, ni elevar permisos", { skip }, async () => {
  const a = await post(`${api("principal")}/auth/demo/acceso`, { clave: CLAVE });
  for (const correo of ["admin@cun.edu.co", "otro@proysocial.local", "' OR 1=1 --", "", undefined]) {
    assert.equal((await post(`${api("principal")}/auth/demo/sesion`, { correo }, a.data.pase)).status, 403, String(correo));
  }
  assert.equal((await post(`${api("principal")}/auth/demo/sesion`, { correo: "admin@proysocial.local" })).status, 401, "sin pase");
  const s = await abrir("principal", "maria.rodriguez@proysocial.local");
  assert.equal((await post(`${api("principal")}/auth/demo/sesion`, { correo: "admin@proysocial.local" }, s.token)).status, 401, "la sesión no sirve de pase");
  assert.equal((await get(`${api("principal")}/auth/me`, a.data.pase)).status, 401, "el pase no sirve de sesión");
  // Token demo firmado de verdad pero a nombre de un usuario fuera de la lista, o con alcance inventado.
  const firma = (extra, sub) => jwt.sign({ email: "x", role: "admin", ...extra }, SECRET, { algorithm: "HS256", subject: String(sub), issuer: "proysocial-api", audience: "proysocial-web", expiresIn: "5m" });
  assert.equal((await get(`${api("principal")}/auth/me`, firma({ scope: "otro" }, s.user.id))).status, 401, "alcance desconocido");
  const real = (await pool.query("SELECT id FROM usuarios WHERE LOWER(correo) NOT LIKE '%@proysocial.local' LIMIT 1")).rows[0];
  if (real) assert.equal((await get(`${api("principal")}/auth/me`, firma({ scope: "demo" }, real.id))).status, 401, "usuario real con alcance demo");
  // Cambiar `role` en el cuerpo del token no cambia nada: el rol sale de la base.
  const maria = await get(`${api("principal")}/admin/dashboard`, firma({ scope: "demo", role: "admin" }, s.user.id));
  assert.equal(maria.status, 403);
});

test("escrituras bloqueadas en el servidor y secciones administrativas sensibles inaccesibles", { skip }, async () => {
  const antes = await huella();
  const admin = await abrir("principal", "admin@proysocial.local");
  const doc = await abrir("principal", "maria.rodriguez@proysocial.local");
  const B = api("principal");
  const H = (t) => ({ Authorization: `Bearer ${t}` });
  const intentos = [
    ["PUT", `/docente/${doc.user.id}/info-contacto`, doc.token, { telefono: "1" }],
    ["PATCH", `/docente/${doc.user.id}/notificaciones/leer`, doc.token, {}],
    ["PUT", `/docente/entregables/1/evidencias`, doc.token, {}],
    ["PATCH", `/docente/entregables/1/borrador`, doc.token, {}],
    ["POST", `/docente/${doc.user.id}/entregables/1/reenviar`, doc.token, {}],
    ["POST", `/admin/proyectos`, admin.token, { nombre: "x" }],
    ["PUT", `/admin/proyectos/1`, admin.token, { nombre: "x" }],
    ["DELETE", `/admin/proyectos/1`, admin.token],
    ["POST", `/admin/semestres`, admin.token, {}],
    ["PUT", `/admin/semestres/2026-1/activar`, admin.token, {}],
    ["DELETE", `/admin/escuelas/1`, admin.token],
    ["PUT", `/admin/usuarios/${doc.user.id}`, admin.token, { rol: "admin" }],
    ["POST", `/admin/usuarios`, admin.token, { correo: "nuevo@proysocial.local", rol: "admin" }],
    ["DELETE", `/admin/usuarios/${doc.user.id}`, admin.token],
    ["POST", `/admin/importaciones`, admin.token, {}],
    ["POST", `/admin/correos/procesar`, admin.token, {}],
    ["POST", `/admin/notificaciones`, admin.token, {}],
    ["PUT", `/admin/reportes-revision/1`, admin.token, {}],
  ];
  for (const [method, ruta, token, body] of intentos) {
    const r = await j(`${B}${ruta}`, { method, headers: H(token), ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(r.status, 403, `${method} ${ruta} -> ${r.status}`);
    assert.equal(r.data.demo, true);
  }
  for (const ruta of ["/admin/usuarios", "/admin/correos/estado", "/Admin/Usuarios", "/admin//usuarios"]) {
    assert.equal((await get(`${B}${ruta}`, admin.token)).status === 200, false, ruta);
  }
  const logout = await j(`${B}/auth/logout`, { method: "POST", headers: H(admin.token) });
  assert.equal(logout.status, 204);
  assert.deepEqual(await huella(), antes, "la base no cambió");
});

test("navegar por todas las pantallas de lectura no modifica ningún dato", { skip }, async () => {
  const antes = await huella();
  const B = api("principal");
  const admin = await abrir("principal", "admin@proysocial.local");
  const docs = (await pool.query("SELECT id FROM usuarios WHERE rol='docente' AND LOWER(correo) LIKE '%@proysocial.local' ORDER BY id")).rows.map((r) => r.id);
  const rutasAdmin = ["dashboard", "metricas", "reportes-revision", "docentes", "semestres", "proyectos", "proyectos-semanas", "escuelas", "programas", "grupos-matriz",
    "indicadores-grupo", "seguimiento", "avance-consolidado", "notificaciones", "catalogos", "asignaciones/incidencias"];
  const resultados = [];
  for (const r of rutasAdmin) resultados.push([`/admin/${r}`, (await get(`${B}/admin/${r}`, admin.token)).status]);
  for (const id of docs) {
    for (const r of [`docentes/${id}/perfil`, `docentes/${id}/matriz`, `docentes/${id}/matriz-stats`, `docentes/${id}/iniciativas`, `seguimiento/docentes/${id}`]) {
      resultados.push([`/admin/${r}`, (await get(`${B}/admin/${r}`, admin.token)).status]);
    }
  }
  for (const c of ["maria.rodriguez", "carlos.mendoza", "andres.torres", "laura.gomez"]) {
    const d = await abrir("principal", `${c}@proysocial.local`);
    for (const r of ["dashboard", "dashboard-stats", "cronograma", "notificaciones", "perfil", "matriz-stats", "matriz", "evidencias", "reportes"]) {
      resultados.push([`/docente/${d.user.id}/${r}`, (await get(`${B}/docente/${d.user.id}/${r}`, d.token)).status]);
    }
  }
  // 503 explícito de /asignaciones/incidencias = migración fase28 pendiente en la base local (comportamiento previo, no de la demo).
  const fallos = resultados.filter(([ruta, s]) => s >= 500 && !(s === 503 && ruta === "/admin/asignaciones/incidencias"));
  assert.deepEqual(fallos, [], "ninguna lectura debe fallar con 5xx");
  const buenas = resultados.filter(([, s]) => s === 200).length;
  assert.ok(buenas >= resultados.length * 0.8, `lecturas 200: ${buenas}/${resultados.length}\n${JSON.stringify(resultados.filter(([, s]) => s !== 200))}`);
  assert.deepEqual(await huella(), antes, "la base no cambió tras navegar");
});

test("la sesión demo vence", { skip }, async () => {
  const s = await abrir("corta", "admin@proysocial.local");
  assert.equal((await get(`${api("corta")}/auth/me`, s.token)).status, 200);
  await new Promise((r) => setTimeout(r, 3200));
  assert.equal((await get(`${api("corta")}/auth/me`, s.token)).status, 401);
});

test("no existe si DEMO_ENABLED es falso, si la base no es proysocial_piloto o si el acceso de desarrollo está activo", { skip }, async () => {
  const falsoToken = jwt.sign({ email: "admin@proysocial.local", role: "admin", scope: "demo" }, SECRET, { algorithm: "HS256", subject: "1", issuer: "proysocial-api", audience: "proysocial-web", expiresIn: "5m" });
  for (const k of ["apagado", "baseDev", "conDev"]) {
    assert.equal((await get(`${api(k)}/auth/demo/estado`)).status, 404, k);
    assert.equal((await post(`${api(k)}/auth/demo/acceso`, { clave: CLAVE })).status, 404, k);
    assert.equal((await get(`${api(k)}/auth/me`, falsoToken)).status, 401, `${k}: un token demo no vale`);
  }
});

test("Google/sesión normal no cambia: un token normal conserva permisos de escritura y administración", { skip }, async () => {
  const { createSessionToken } = await import("../../src/middleware/auth.js");
  const admin = (await pool.query("SELECT id, correo, rol FROM usuarios WHERE LOWER(correo)='admin@proysocial.local'")).rows[0];
  const token = createSessionToken(admin);
  assert.equal((await get(`${api("principal")}/admin/usuarios`, token)).status, 200, "no está bloqueado");
  const tras = await post(`${api("principal")}/auth/google`, { credential: "no-es-valida" });
  assert.ok([401, 503].includes(tras.status), "/auth/google sigue exigiendo credencial real");
});
