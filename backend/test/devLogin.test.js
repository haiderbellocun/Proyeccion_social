import test from "node:test";
import assert from "node:assert/strict";
import { devEmails, devLoginStatus, esPeticionLocal } from "../src/config/devLogin.js";

const ok = {
  DEV_LOGIN_ENABLED: "true",
  PGHOST: "localhost",
  PGDATABASE: "proysocial_dev",
  DEV_LOGIN_EMAILS: "admin@proysocial.local,docente@proysocial.local",
};

test("el acceso de desarrollo solo se habilita con TODAS las condiciones locales", () => {
  assert.equal(devLoginStatus(ok).enabled, true);
  assert.equal(devLoginStatus({}).enabled, false);
  for (const [clave, valor] of [
    ["DEV_LOGIN_ENABLED", "false"],
    ["NODE_ENV", "production"],
    ["PGDATABASE", "app_proyecion"],
    ["PGDATABASE", "proysocial_test"],
    ["PGHOST", "db.ejemplo.com"],
    ["DATABASE_URL", "postgres://x"],
    ["INSTANCE_CONNECTION_NAME", "proyecto:region:instancia"],
    ["K_SERVICE", "proysocial"],
    ["PGSSL", "true"],
    ["DEV_LOGIN_EMAILS", ""],
  ]) {
    const s = devLoginStatus({ ...ok, [clave]: valor });
    assert.equal(s.enabled, false, `${clave}=${valor}`);
    assert.ok(s.razones.length > 0);
  }
});

test("solo se aceptan correos sintéticos @proysocial.local en la lista", () => {
  assert.deepEqual(devEmails({ DEV_LOGIN_EMAILS: "A@proysocial.local, real@cun.edu.co ,b@proysocial.local" }), ["a@proysocial.local", "b@proysocial.local"]);
});

test("solo peticiones locales y sin proxy", () => {
  const req = (addr, host, xff) => ({ socket: { remoteAddress: addr }, hostname: host, get: (h) => (h === "x-forwarded-for" ? xff : undefined) });
  assert.equal(esPeticionLocal(req("::1", "localhost")), true);
  assert.equal(esPeticionLocal(req("127.0.0.1", "127.0.0.1")), true);
  assert.equal(esPeticionLocal(req("192.168.1.20", "localhost")), false);
  assert.equal(esPeticionLocal(req("::1", "midominio.com")), false);
  assert.equal(esPeticionLocal(req("::1", "localhost", "8.8.8.8")), false);
});
