// Acceso de desarrollo contra la base local proysocial_dev (se omite si no está disponible).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PGDB = process.env.PGDATABASE;
const skip = PGDB === "proysocial_dev" && !process.env.DATABASE_URL ? false : "Requiere PGDATABASE=proysocial_dev (npm run dev:setup)";
const PORT = 4302;
const API = `http://127.0.0.1:${PORT}`;
const procs = [];

async function arrancar(extraEnv, port) {
  const p = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: { ...process.env, JWT_SECRET: "pruebas-dev-login-secreto-largo-0123456789abcdef", EMAIL_ENABLED: "false", SMTP_HOST: "", PORT: String(port), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", ...extraEnv },
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
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const EMAILS = "admin@proysocial.local,maria.rodriguez@proysocial.local";

before(async () => {
  if (skip) return;
  await arrancar({ DEV_LOGIN_ENABLED: "true", DEV_LOGIN_EMAILS: EMAILS }, PORT);
  await arrancar({ DEV_LOGIN_ENABLED: "false", DEV_LOGIN_EMAILS: EMAILS }, PORT + 1);
  await arrancar({ NODE_ENV: "production", DEV_LOGIN_ENABLED: "true", DEV_LOGIN_EMAILS: EMAILS }, PORT + 2);
});
after(() => procs.forEach((p) => p.kill()));

test("habilitado: lista usuarios sintéticos, entra y los permisos de la API no cambian", { skip }, async () => {
  const lista = await j(`${API}/auth/dev/usuarios`);
  assert.equal(lista.status, 200);
  assert.equal(lista.data.entorno.base, "proysocial_dev");
  assert.deepEqual(lista.data.usuarios.map((u) => u.correo).sort(), EMAILS.split(",").sort());

  const admin = await j(`${API}/auth/dev/login`, { method: "POST", body: JSON.stringify({ correo: "admin@proysocial.local" }) });
  assert.equal(admin.status, 200);
  const maria = await j(`${API}/auth/dev/login`, { method: "POST", body: JSON.stringify({ correo: "maria.rodriguez@proysocial.local" }) });
  const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
  assert.equal((await j(`${API}/admin/dashboard`, auth(admin.data.token))).status, 200);
  assert.equal((await j(`${API}/admin/dashboard`, auth(maria.data.token))).status, 403, "docente no accede a /admin");
  assert.equal((await j(`${API}/docente/${maria.data.user.id}/matriz`, auth(maria.data.token))).status, 200);
  assert.equal((await j(`${API}/docente/${admin.data.user.id}/matriz`, auth(maria.data.token))).status, 403, "docente no ve datos de otro");
  assert.equal((await j(`${API}/admin/dashboard`)).status, 401);
});

test("no se puede entrar con usuarios fuera de la lista ni con correos reales", { skip }, async () => {
  for (const correo of ["carlos.mendoza@proysocial.local", "admin@cun.edu.co", "' OR 1=1 --"]) {
    const r = await j(`${API}/auth/dev/login`, { method: "POST", body: JSON.stringify({ correo }) });
    assert.equal(r.status, 403, correo);
  }
});

test("deshabilitado (variable) o con NODE_ENV=production las rutas de desarrollo no existen", { skip }, async () => {
  for (const port of [PORT + 1, PORT + 2]) {
    const a = await j(`http://127.0.0.1:${port}/auth/dev/usuarios`);
    const b = await j(`http://127.0.0.1:${port}/auth/dev/login`, { method: "POST", body: JSON.stringify({ correo: "admin@proysocial.local" }) });
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
  }
});
