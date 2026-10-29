// Guarda de regresión del selector de usuarios de la demostración del piloto. Es una prueba estática (no necesita navegador ni base): falla si un
// cambio visual del login elimina el selector, lo ata a import.meta.env.DEV (que no existe en las compilaciones de producción) o vuelve a
// tragarse en silencio los fallos de red. El comportamiento real lo cubre e2e/suites/demo-ui.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_EMAILS } from "../src/config/demo.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const login = fs.readFileSync(path.join(aqui, "../../src/app/pages/Login.tsx"), "utf8");
const bloqueDemo = login.slice(login.indexOf('data-testid="demo-selector"') - 200, login.indexOf("import.meta.env.DEV && devUsers.length"));

test("el login conserva el selector de demostración con sus puntos de anclaje", () => {
  assert.match(login, /data-testid="demo-selector"/);
  assert.match(login, /data-testid="demo-usuario"/);
  assert.match(login, /\/auth\/demo\/estado/);
  assert.match(login, /\/auth\/demo\/usuarios/);
  assert.match(login, /\/auth\/demo\/acceso/);
  assert.match(login, /\/auth\/demo\/sesion/);
});

test("el login conserva el selector DEV de desarrollo local (cinco usuarios, un clic)", () => {
  assert.match(login, /data-testid="dev-selector"/);
  assert.match(login, /data-testid="dev-usuario"/);
  assert.match(login, /\/auth\/dev\/usuarios/);
  assert.match(login, /\/auth\/dev\/login/);
});

test("el selector de demostración NO depende de import.meta.env.DEV ni de Google", () => {
  assert.ok(bloqueDemo.length > 500, "no se localizó el bloque de demostración");
  assert.doesNotMatch(bloqueDemo, /import\.meta\.env/);
  assert.doesNotMatch(bloqueDemo, /googleEstado|googleClientId/);
});

test("un fallo del servidor no oculta el selector: hay aviso y «Reintentar»", () => {
  assert.match(login, /demoCarga === "error"/);
  assert.match(login, /data-testid="demo-fallo"/);
  assert.match(login, /setDemoReintento/);
  // Ninguna petición de la demostración puede terminar en un catch vacío.
  const efectoDemo = login.slice(login.indexOf("const [demoElegido"), login.indexOf("const handleDemoClave"));
  assert.doesNotMatch(efectoDemo, /catch\(\(\)\s*=>\s*\{\s*\}\)/);
});

test("el servidor sigue ofreciendo exactamente los cinco usuarios sintéticos", () => {
  assert.equal(DEMO_EMAILS.length, 5);
  assert.ok(DEMO_EMAILS.includes("admin@proysocial.local"));
  assert.equal(DEMO_EMAILS.filter((c) => c !== "admin@proysocial.local").length, 4);
});

test("no se habilita /auth/dev en producción: la ruta sigue condicionada en el servidor", () => {
  const index = fs.readFileSync(path.join(aqui, "../src/index.js"), "utf8");
  assert.match(index, /if \(devLoginStatus\(\)\.enabled\)/);
});
