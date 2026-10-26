import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_EMAILS, claveCorrecta, crearLimitador, demoBloqueo, demoStatus, ipCliente } from "../src/config/demo.js";

const ok = { DEMO_ENABLED: "true", DEMO_ACCESS_KEY: "clave-de-prueba-123", JWT_SECRET: "x".repeat(40), PGDATABASE: "proysocial_piloto" };

test("la demostración solo se habilita con TODAS las condiciones", () => {
  assert.equal(demoStatus(ok).enabled, true);
  assert.equal(demoStatus({}).enabled, false);
  for (const [clave, valor] of [
    ["DEMO_ENABLED", "false"],
    ["DEMO_ENABLED", ""],
    ["DEMO_ACCESS_KEY", ""],
    ["DEMO_ACCESS_KEY", "corta"],
    ["JWT_SECRET", "corto"],
    ["PGDATABASE", "app_proyecion"],
    ["PGDATABASE", "proysocial_dev"],
    ["DEV_LOGIN_ENABLED", "true"],
  ]) {
    const s = demoStatus({ ...ok, [clave]: valor });
    assert.equal(s.enabled, false, `${clave}=${valor}`);
    assert.ok(s.razones.length > 0);
  }
});

test("lista cerrada de cinco usuarios sintéticos", () => {
  assert.equal(DEMO_EMAILS.length, 5);
  assert.ok(DEMO_EMAILS.every((e) => e.endsWith("@proysocial.local")));
});

test("la clave se compara de forma exacta", () => {
  assert.equal(claveCorrecta("clave-de-prueba-123", ok), true);
  for (const mala of ["", "clave-de-prueba-12", "clave-de-prueba-1234", "CLAVE-DE-PRUEBA-123", undefined, null, 0]) {
    assert.equal(claveCorrecta(mala, ok), false, String(mala));
  }
  assert.equal(claveCorrecta("cualquiera", {}), false);
  assert.equal(claveCorrecta("clave-de-prueba-123", { ...ok, DEMO_ACCESS_KEY: "clave-de-prueba-123\n" }), true, "salto de línea final del secreto");
  assert.equal(demoStatus({ ...ok, DEMO_ACCESS_KEY: "            " }).enabled, false, "solo espacios no es una clave");
});

test("sesión demo: solo lectura y sin administración de usuarios/correos/importaciones", () => {
  for (const [m, p] of [["GET", "/docente/3/dashboard"], ["GET", "/admin/dashboard"], ["GET", "/auth/me"], ["HEAD", "/admin/proyectos"], ["POST", "/auth/logout"]]) {
    assert.equal(demoBloqueo(m, p), null, `${m} ${p}`);
  }
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    assert.ok(demoBloqueo(m, "/docente/3/info-contacto"), m);
  }
  for (const p of ["/admin/usuarios", "/admin/usuarios/4", "/Admin/Usuarios", "/admin//usuarios", "/admin/usuarios/", "/admin/usuarios?x=1", "/admin/%75suarios", "/admin/correos/estado", "/admin/importaciones", "/admin/importaciones/x"]) {
    assert.ok(demoBloqueo("GET", p), p);
  }
  assert.equal(demoBloqueo("POST", "/auth/google") !== null, true);
});

test("limitador: bloquea tras el máximo y se libera al vencer la ventana", () => {
  let t = 1000;
  const l = crearLimitador({ max: 3, ventanaMs: 10_000, ahora: () => t });
  for (let i = 0; i < 3; i += 1) { assert.equal(l.espera("a"), 0); l.fallo("a"); }
  assert.ok(l.espera("a") > 0);
  assert.equal(l.espera("b"), 0, "otra clave no se ve afectada");
  t += 10_001;
  assert.equal(l.espera("a"), 0);
  l.fallo("a"); l.exito("a");
  assert.equal(l.espera("a"), 0);
});

test("la IP del cliente es el último valor de X-Forwarded-For", () => {
  const req = (xff) => ({ get: () => xff, socket: { remoteAddress: "10.0.0.1" } });
  assert.equal(ipCliente(req("1.1.1.1, 2.2.2.2")), "2.2.2.2");
  assert.equal(ipCliente(req("")), "10.0.0.1");
});

test("modo abierto (DEMO_OPEN): sin clave y sin bloqueo de escritura", async () => {
  const { demoAbierto } = await import("../src/config/demo.js");
  const base = { DEMO_ENABLED: "true", JWT_SECRET: "x".repeat(40), PGDATABASE: "proysocial_piloto" };
  assert.equal(demoStatus(base).enabled, false, "sin clave y sin DEMO_OPEN no se activa");
  assert.equal(demoStatus({ ...base, DEMO_OPEN: "true" }).enabled, true);
  assert.equal(demoAbierto({ DEMO_OPEN: "true" }), true);
  assert.equal(demoBloqueo("POST", "/docente/3/info-contacto", { DEMO_OPEN: "true" }), null);
  assert.equal(demoBloqueo("GET", "/admin/usuarios", { DEMO_OPEN: "true" }), null);
  assert.ok(demoBloqueo("POST", "/docente/3/info-contacto", {}));
});
