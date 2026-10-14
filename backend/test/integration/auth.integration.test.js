// Autenticación con las librerías REALES (jsonwebtoken, google-auth-library). No requiere base de datos,
// red ni credenciales: comprueba que Google OAuth rechaza todo lo que no sea una credencial válida y que
// la API exige sesión. El acceso de desarrollo se prueba en devlogin.integration.test.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const procs = [];
async function arrancar(port, extraEnv) {
  const p = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("../../", import.meta.url),
    env: { ...process.env, PORT: String(port), JWT_SECRET: "pruebas-auth-secreto-largo-0123456789abcdef", ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false", EMAIL_ENABLED: "false", ...extraEnv },
    stdio: ["ignore", "ignore", "ignore"],
  });
  procs.push(p);
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* iniciando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("servidor no inició");
}
const google = async (port, body) => {
  const r = await fetch(`http://127.0.0.1:${port}/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

before(async () => {
  await arrancar(4331, { GOOGLE_CLIENT_ID: "" });
  await arrancar(4332, { GOOGLE_CLIENT_ID: "ficticio.apps.googleusercontent.com" });
});
after(() => procs.forEach((p) => p.kill()));

test("Google OAuth sin configurar responde 503 y sin credencial 400", async () => {
  assert.equal((await google(4331, { credential: "abc" })).status, 503);
  assert.equal((await google(4332, {})).status, 400);
});

test("Google OAuth rechaza credenciales basura, firmadas por otro y sin firma (alg=none)", async () => {
  const claims = { sub: "1", email: "admin@univ.edu", email_verified: true, aud: "ficticio.apps.googleusercontent.com", iss: "https://accounts.google.com" };
  const casos = [
    "no.es.un.jwt",
    jwt.sign(claims, "secreto-propio", { expiresIn: "5m" }),
    jwt.sign(claims, "", { algorithm: "none" }),
  ];
  for (const credential of casos) assert.equal((await google(4332, { credential })).status, 401);
});

test("la API exige sesión y los tokens manipulados o vencidos no sirven", async () => {
  assert.equal((await fetch("http://127.0.0.1:4332/admin/importaciones")).status, 401);
  const vencido = jwt.sign({ id: 1, rol: "admin" }, "pruebas-auth-secreto-largo-0123456789abcdef", { expiresIn: -10 });
  const firmaAjena = jwt.sign({ id: 1, rol: "admin" }, "otra-clave", { expiresIn: "1h" });
  for (const t of [vencido, firmaAjena, "basura"]) {
    assert.equal((await fetch("http://127.0.0.1:4332/admin/importaciones", { headers: { Authorization: `Bearer ${t}` } })).status, 401);
  }
  assert.equal((await fetch("http://127.0.0.1:4332/auth/dev/login", { method: "POST" })).status, 404);
});
