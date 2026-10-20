// Seguimiento operativo: GET /admin/seguimiento y /admin/seguimiento/docentes/:id contra PostgreSQL REAL (solo `proysocial_test`).
// Cada cifra se compara con consultas SQL INDEPENDIENTES (no reutilizan el servicio) y con las demás pantallas (Avance consolidado, Métricas,
// Dashboard, Indicadores por grupo). Datos sintéticos con prefijo TST_SG; se eliminan al terminar.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET ||= "pruebas-seguimiento-operativo-secreto-largo-0123456789";
process.env.EMAIL_ENABLED = "false";
process.env.SMTP_HOST = "";

const DB_OK =
  process.env.PGDATABASE === "proysocial_test" &&
  ["localhost", "127.0.0.1", "::1"].includes(process.env.PGHOST || "localhost") &&
  !process.env.DATABASE_URL &&
  !process.env.INSTANCE_CONNECTION_NAME;
const skip = DB_OK ? false : "Estas pruebas con escritura solo corren con PGDATABASE=proysocial_test en el servidor local (npm run test:integration:protegidos)";

const { pool } = await import("../../src/db.js");
const { createSessionToken } = await import("../../src/middleware/auth.js");

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 4326;
const API = `http://127.0.0.1:${PORT}`;
const { SA, SP, M, montar, desmontar } = await import("./helpers/fixture-seguimiento.js");
let ctx = { tok: null };
let server;

const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (ruta, tokenSesion = ctx.tok) => {
  const r = await fetch(`${API}${ruta}`, { headers: tokenSesion ? { Authorization: `Bearer ${tokenSesion}` } : {} });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const seg = (qs = "") => api(`/admin/seguimiento?semestre=${SA}${qs}`);

before(async () => {
  if (!DB_OK) return;
  assert.equal((await q("SELECT current_database() AS d"))[0].d, "proysocial_test", "base inesperada: se aborta");
  ctx = await montar(pool);
  const tk = (u) => createSessionToken({ id: u.id, nombre: u.nombre, apellido: u.apellido, correo: u.correo, rol: u.rol });
  ctx.tok = tk(ctx.admin);
  ctx.docTok = tk(ctx.u.d1);
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGIN: "http://localhost:5173", STATIC_DIR: "/nonexistent", DEV_LOGIN_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* iniciando */ }
    await esperar(150);
  }
});
after(async () => {
  server?.kill();
  if (DB_OK) {
    await desmontar(pool, ctx);
    const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios WHERE correo ILIKE $1)::int u, (SELECT COUNT(*) FROM grupos_matriz WHERE nombre LIKE $2)::int g, (SELECT COUNT(*) FROM docente_grupo_matriz)::int filas`, [`${M}.%`, `${M}%`]))[0];
    assert.deepEqual(r, { u: 0, g: 0, filas: 0 }, "no deben quedar fixtures");
  }
  await pool.end();
});

/** Verdad independiente desde PostgreSQL: estados y vencidos de los docentes (con grupo) del semestre indicado, sin pasar por el servicio. */
async function verdadSql(semestre, docentes = null) {
  return (await q(
    `SELECT u.id AS docente_id,
            COUNT(t.id)::int AS total,
            COUNT(*) FILTER (WHERE e.estado_revision = 'aprobado')::int AS aprobados,
            COUNT(*) FILTER (WHERE e.estado_revision = 'enviado' AND e.completado)::int AS enviados,
            COUNT(*) FILTER (WHERE e.estado_revision = 'observado')::int AS observados,
            COUNT(*) FILTER (WHERE e.estado_revision = 'borrador')::int AS borradores,
            COUNT(*) FILTER (WHERE e.id IS NULL)::int AS sin_iniciar,
            COUNT(*) FILTER (WHERE (e.id IS NULL OR e.estado_revision IN ('borrador', 'observado')) AND (s.fecha_inicio + t.dias_fin_desde_feb * INTERVAL '1 day')::date < (now() AT TIME ZONE 'America/Bogota')::date)::int AS vencidos,
            COUNT(*) FILTER (WHERE (s.fecha_inicio + t.dias_fin_desde_feb * INTERVAL '1 day')::date <= (now() AT TIME ZONE 'America/Bogota')::date)::int AS exigibles
     FROM usuarios u
     JOIN grupos_matriz g ON g.id = u.grupo_matriz_id AND g.semestre = $1
     JOIN semestres s ON s.codigo = g.semestre
     JOIN plantilla_entregables t ON t.grupo_id = g.id
     LEFT JOIN proyecto_entregables e ON e.plantilla_id = t.id AND e.docente_id = u.id
     WHERE u.rol = 'docente' AND ($2::int[] IS NULL OR u.id = ANY($2))
     GROUP BY u.id ORDER BY u.id`, [semestre, docentes]
  ));
}
const fila = (r, id) => r.data.docentes.find((d) => d.id === id);
const pct1 = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);

// ───────────────────────── 1–4. Docentes y estados, contra SQL ─────────────────────────
test("1–3. Tarjetas y tabla coinciden con PostgreSQL: pendientes, aprobados, observados y vencidos por docente", { skip }, async () => {
  const r = await seg();
  assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
  const verdad = await verdadSql(SA);
  for (const v of verdad) {
    const d = fila(r, v.docente_id);
    assert.ok(d, `docente ${v.docente_id} en la tabla`);
    assert.deepEqual(
      { total: d.semestre.total, apr: d.semestre.aprobados, rep: d.semestre.reportados, env: d.semestre.enviados_pendientes_revision, obs: d.semestre.observados, bor: d.semestre.borradores, sin: d.semestre.no_iniciados, ven: d.semestre.vencidos, exi: d.semestre.exigibles },
      { total: v.total, apr: v.aprobados, rep: v.aprobados + v.enviados, env: v.enviados, obs: v.observados, bor: v.borradores, sin: v.sin_iniciar, ven: v.vencidos, exi: v.exigibles },
      `docente ${v.docente_id}`
    );
    assert.equal(d.semestre.pct_reportado, pct1(v.aprobados + v.enviados, v.total));
    assert.equal(d.semestre.pct_aprobado, pct1(v.aprobados, v.total));
    assert.equal(d.semestre.pct_esperado, pct1(v.exigibles, v.total));
  }
  const suma = (k) => verdad.reduce((s, v) => s + v[k], 0);
  const t = r.data.tarjetas;
  assert.equal(t.semestre.programados, suma("total"));
  assert.equal(t.semestre.aprobados, suma("aprobados"));
  assert.equal(t.semestre.reportados, suma("aprobados") + suma("enviados"));
  assert.equal(t.vencidos, suma("vencidos"));
  assert.equal(t.enviados_pendientes_revision, suma("enviados"));
  assert.equal(t.observados, suma("observados"));
  // Valores conocidos del fixture (d1: 1 aprobado, 1 enviado, 1 observado vencido; d2: 1 enviado, borrador y sin iniciar vencidos)
  assert.equal(fila(r, ctx.u.d1.id).semestre.vencidos, 1);
  assert.equal(fila(r, ctx.u.d2.id).semestre.vencidos, 2);
  assert.equal(fila(r, ctx.u.d1.id).semestre.semaforo, "amarillo", "d1 reportó 2 de 3 exigibles (66,7 %): semáforo oficial amarillo");
  assert.equal(fila(r, ctx.u.d2.id).semestre.semaforo, "rojo", "d2 reportó 1 de 3 exigibles (33,3 %): semáforo oficial rojo");
});

test("4–5. Docente sin grupo y grupo sin entregables: no se inventan cifras", { skip }, async () => {
  const r = await seg();
  assert.ok(!fila(r, ctx.u.d4.id), "el docente sin grupo no pertenece a ningún semestre");
  assert.ok(r.data.docentes_sin_grupo >= 1);
  assert.ok(r.data.avisos.some((a) => /sin grupo/.test(a)));
  const d5 = fila(r, ctx.u.d5.id);
  assert.ok(d5, "el docente de un grupo sin entregables sí figura");
  assert.equal(d5.semestre.total, 0);
  assert.equal(d5.semestre.pct_reportado, null, "sin entregables no hay porcentaje");
  assert.equal(d5.semestre.semaforo, "sin_datos");
  assert.equal(d5.periodo.pct_reportado, null);
  const g3 = r.data.graficos.por_grupo.find((g) => g.id === ctx.g.g3);
  assert.deepEqual({ docentes: g3.docentes, total: g3.total, pct: g3.pct_reportado }, { docentes: 1, total: 0, pct: null });
  assert.equal((await api(`/admin/seguimiento/docentes/${ctx.u.d4.id}?semestre=${SA}`)).data.sin_matriz, true);
});

// ───────────────────────── 6–10. Grupos, semestres, semanas ─────────────────────────
test("6. Dos grupos distintos: comparación por grupo y filtro de grupo", { skip }, async () => {
  const todo = await seg();
  const g1 = todo.data.graficos.por_grupo.find((g) => g.id === ctx.g.g1);
  const g2 = todo.data.graficos.por_grupo.find((g) => g.id === ctx.g.g2);
  const verdad = await verdadSql(SA);
  const delGrupo = (ids) => verdad.filter((v) => ids.includes(v.docente_id));
  const v1 = delGrupo([ctx.u.d1.id, ctx.u.d2.id]);
  assert.equal(g1.total, v1.reduce((s, v) => s + v.total, 0));
  assert.equal(g1.aprobados, v1.reduce((s, v) => s + v.aprobados, 0));
  assert.equal(g2.total, 3);
  assert.equal(g2.pct_aprobado, pct1(1, 3));
  const f = await seg(`&grupo_id=${ctx.g.g2}`);
  assert.deepEqual(f.data.docentes.map((d) => d.id), [ctx.u.d3.id]);
  assert.equal(f.data.tarjetas.docentes, 1);
  assert.equal(f.data.tarjetas.semestre.programados, 3);
  // La comparación entre grupos no desaparece al filtrar un grupo: lo resalta.
  assert.equal(f.data.graficos.por_grupo.length, todo.data.graficos.por_grupo.length);
  assert.equal(f.data.graficos.por_grupo.filter((g) => g.seleccionado).length, 1);
  assert.equal((await seg("&grupo_id=999999999")).data.tarjetas.docentes, 0);
});

test("7–8. Semestre activo y semestre anterior no se mezclan", { skip }, async () => {
  const act = await seg();
  const ant = await api(`/admin/seguimiento?semestre=${SP}`);
  assert.equal(ant.status, 200);
  assert.deepEqual(ant.data.docentes.map((d) => d.id), [ctx.u.d6.id]);
  assert.equal(ant.data.semestre.activo, false);
  assert.equal(ant.data.tarjetas.semestre.programados, 1);
  assert.ok(!act.data.docentes.some((d) => d.id === ctx.u.d6.id));
  // Sin parámetro de semestre se usa el activo (mismos resultados).
  const sinParam = await api("/admin/seguimiento");
  assert.equal(sinParam.data.semestre.codigo, SA);
  assert.equal(sinParam.data.tarjetas.docentes, act.data.tarjetas.docentes);
  assert.equal((await api("/admin/seguimiento?semestre=1999Z")).status, 400);
  assert.equal((await api("/admin/seguimiento?semestre=2001A")).status, 404);
});

test("9–10. Semana con y sin actividades; semana en curso por omisión; enviados fuera de su semana se cuentan aparte", { skip }, async () => {
  const defecto = await seg();
  assert.equal(defecto.data.periodo.origen, "semana_actual");
  assert.equal(defecto.data.periodo.semana, 4);
  // Semana 4 (en curso): g1 tiene S4 (2 docentes), g2 tiene S4 (1 docente) → 3 programados, ninguno enviado
  const t4 = defecto.data.tarjetas;
  assert.equal(t4.periodo.programados, 3);
  assert.equal(t4.programados_semana_actual, 3);
  assert.equal(t4.periodo.reportados, 0);
  assert.equal(t4.periodo.pct_reportado, 0);
  assert.equal(t4.periodo.sin_programados, false);
  // d2 envió hoy el entregable de la semana 1: es de OTRA semana → no entra en el cumplimiento de la 4, pero se cuenta aparte
  assert.equal(fila(defecto, ctx.u.d2.id).periodo.enviados_fuera_del_periodo, 1);
  assert.equal(fila(defecto, ctx.u.d2.id).periodo.programados, 1);
  assert.equal(t4.periodo.enviados_fuera_del_periodo, 5, "d1 envió 3 de otras semanas, d2 1 y d3 1 (todos hoy, semana 4)");
  // Semana 1: g1 (2 docentes, 1 plantilla c/u) → 2 programados; d1 aprobado y d2 enviado → reportado 100 %, aprobado 50 %
  const s1 = await seg("&semana=1");
  assert.equal(s1.data.tarjetas.periodo.programados, 2);
  assert.equal(s1.data.tarjetas.periodo.reportados, 2);
  assert.equal(s1.data.tarjetas.periodo.aprobados, 1);
  assert.equal(s1.data.tarjetas.periodo.pct_reportado, 100);
  assert.equal(s1.data.tarjetas.periodo.pct_aprobado, 50);
  // Semana 6: solo g1 (2 docentes) → 2 programados sin iniciar y NO vencidos (futuro)
  const s6 = await seg("&semana=6");
  assert.equal(s6.data.tarjetas.periodo.programados, 2);
  assert.equal(s6.data.tarjetas.periodo.vencidos, 0, "un entregable futuro no es vencido");
  // Semana sin actividades (7): "sin programados", no un porcentaje
  const s7 = await seg("&semana=7");
  assert.equal(s7.data.tarjetas.periodo.programados, 0);
  assert.equal(s7.data.tarjetas.periodo.sin_programados, true);
  assert.equal(s7.data.tarjetas.periodo.pct_reportado, null);
  assert.equal(s7.data.tarjetas.periodo.pct_aprobado, null);
  assert.ok(s7.data.docentes.every((d) => d.periodo.pct_reportado === null));
  assert.equal(s7.data.tarjetas.docentes, defecto.data.tarjetas.docentes, "la semana no cambia la población de docentes");
  assert.equal((await seg("&semana=0")).status, 400);
  assert.equal((await seg("&semana=abc")).status, 400);
});

// ───────────────────────── 11. Filtros combinados ─────────────────────────
test("11. Los filtros se combinan y recalculan tarjetas, tabla y gráficos con la misma población", { skip }, async () => {
  // Ejemplo del encargo: Semestre → Grupo → Semana → Docentes con entregables pendientes
  const r = await seg(`&grupo_id=${ctx.g.g1}&semana=2&estado=pendiente`);
  assert.equal(r.status, 200);
  // Semana 2 de g1: d1 enviado (no requiere acción), d2 borrador (pendiente) → solo d2
  assert.deepEqual(r.data.docentes.map((d) => d.id), [ctx.u.d2.id]);
  assert.equal(r.data.tarjetas.docentes, 2, "las tarjetas no dependen del filtro de estado");
  assert.equal(r.data.tarjetas.docentes_visibles_en_tabla, 1);
  assert.equal(r.data.tarjetas.periodo.programados, 2);
  assert.equal(r.data.tarjetas.docentes_con_pendientes, 1);
  // Mes académico
  const mes = await seg("&mes=Septiembre");
  assert.equal(mes.data.periodo.tipo, "mes");
  assert.equal(mes.data.tarjetas.periodo.programados, 4, "semanas 1 y 2 de g1 × 2 docentes");
  // Programa y escuela
  const prog = await seg(`&programa_id=${ctx.prog1}`);
  assert.deepEqual(prog.data.docentes.map((d) => d.id).sort(), [ctx.u.d1.id, ctx.u.d2.id].sort());
  const escu = await seg(`&escuela_id=${ctx.esc}`);
  assert.deepEqual(escu.data.docentes.map((d) => d.id).sort(), [ctx.u.d1.id, ctx.u.d2.id].sort(), "solo el programa 1 tiene escuela");
  assert.ok(escu.data.opciones.escuelas.some((e) => e.id === ctx.esc));
  const sinEsc = await seg("&escuela_id=999999999");
  assert.equal(sinEsc.data.tarjetas.docentes, 0);
  // Docente concreto
  const doc = await seg(`&docente_id=${ctx.u.d1.id}`);
  assert.deepEqual(doc.data.docentes.map((d) => d.id), [ctx.u.d1.id]);
  // Estados
  for (const [estado, esperado] of [["aprobado", [ctx.u.d1.id, ctx.u.d3.id]], ["observado", [ctx.u.d1.id]], ["vencido", [ctx.u.d1.id, ctx.u.d2.id]], ["enviado", [ctx.u.d1.id, ctx.u.d2.id, ctx.u.d3.id].filter((id) => id !== ctx.u.d3.id)]]) {
    const e = await seg(`&estado=${estado}&periodo=semestre`);
    assert.equal(e.data.periodo.tipo, "semestre");
    assert.deepEqual(e.data.docentes.map((d) => d.id).sort((a, b) => a - b), [...esperado].sort((a, b) => a - b), `estado ${estado}`);
  }
  assert.equal((await seg("&estado=raro")).status, 400);
  // Iniciativa: solo relaciones demostrables (los entregables reportados dentro de la iniciativa)
  const p1 = await seg(`&iniciativa_id=${ctx.p.p1}`);
  assert.deepEqual(p1.data.docentes.map((d) => d.id).sort((a, b) => a - b), [ctx.u.d1.id].sort((a, b) => a - b), "d3 colabora en el proyecto 1 pero no reportó nada dentro de él");
  assert.equal(p1.data.tarjetas.semestre.programados, 3, "los 3 entregables que d1 reportó en el proyecto 1");
  assert.ok(p1.data.avisos.some((a) => /relación demostrable/.test(a)));
  const tipo = await seg("&tipo_iniciativa=actividad");
  assert.deepEqual(tipo.data.docentes.map((d) => d.id), [ctx.u.d3.id]);
  assert.equal((await seg("&tipo_iniciativa=otra")).status, 400);
  // Filtros sin coincidencias → estado vacío coherente (no error)
  const vacio = await seg(`&grupo_id=${ctx.g.g2}&programa_id=${ctx.prog1}`);
  assert.equal(vacio.status, 200);
  assert.equal(vacio.data.tarjetas.docentes, 0);
  assert.equal(vacio.data.tarjetas.semestre.pct_reportado, null);
});

// ───────────────────────── 12. Detalle del docente ─────────────────────────
test("12. Detalle: general, semana, iniciativas reales (sin inferir por el grupo), pendientes y vínculos", { skip }, async () => {
  const r = await api(`/admin/seguimiento/docentes/${ctx.u.d1.id}?semestre=${SA}&semana=3`);
  assert.equal(r.status, 200, JSON.stringify(r.data).slice(0, 300));
  const d = r.data;
  assert.equal(d.docente.grupo_nombre, `${M} Grupo 1`);
  assert.equal(d.general.total, 6);
  assert.equal(d.general.aprobados, 1);
  assert.equal(d.general.pct_aprobado, pct1(1, 6));
  assert.equal(d.general.pct_esperado, pct1(3, 6));
  assert.equal(d.general.brecha_pct, Math.round((pct1(1, 6) - pct1(3, 6)) * 10) / 10);
  assert.equal(d.general.horas_programadas, 12);
  // Semana 3: 1 programado (observado) → reportado 0 %, aprobado 0 %, 1 pendiente, 1 vencido
  assert.deepEqual(
    { prog: d.periodo_detalle.programados, rep: d.periodo_detalle.reportados, pend: d.periodo_detalle.pendientes, ven: d.periodo_detalle.vencidos, pct: d.periodo_detalle.pct_reportado },
    { prog: 1, rep: 0, pend: 1, ven: 1, pct: 0 }
  );
  // Iniciativas: las suyas reales; avance atribuible solo sobre lo vinculado de forma demostrable
  assert.deepEqual(d.iniciativas.map((i) => [i.titulo, i.rol]), [[`${M} Proyecto 1`, "responsable"]]);
  const p1 = d.iniciativas[0];
  assert.deepEqual({ vinc: p1.entregables_vinculados, apr: p1.aprobados, obs: p1.observados, rev: p1.pendientes_revision }, { vinc: 3, apr: 1, obs: 1, rev: 1 });
  assert.equal(d.sin_iniciativa_demostrable.total, 3, "los 3 entregables no iniciados no se atribuyen a ningún proyecto");
  // Pendientes diferenciados por estado
  const por = (e) => d.entregables.filter((x) => x.estado === e).length;
  assert.deepEqual({ apr: por("aprobado"), env: por("enviado"), obs: por("observado"), sin: por("no_iniciado") }, { apr: 1, env: 1, obs: 1, sin: 3 });
  const obs = d.entregables.find((x) => x.estado === "observado");
  assert.equal(obs.requiere_correccion, true);
  assert.equal(obs.vencido, true);
  assert.equal(obs.comentario_revision, "Falta el anexo firmado");
  assert.ok(obs.entregable_id, "tiene entregable (enlace a revisión)");
  assert.equal(obs.evidencias.length, 1);
  assert.equal(obs.iniciativa.relacion, "demostrada");
  const sin = d.entregables.find((x) => x.estado === "no_iniciado");
  assert.equal(sin.entregable_id, null);
  assert.notEqual(sin.iniciativa?.relacion, "demostrada", "sin reporte no hay relación demostrada con una iniciativa");
  // Orden: lo vencido primero
  assert.equal(d.entregables[0].vencido, true);
  // d3 colabora en el proyecto 1 (participación real) sin atribuirle entregables
  const d3 = (await api(`/admin/seguimiento/docentes/${ctx.u.d3.id}?semestre=${SA}`)).data;
  assert.deepEqual(d3.iniciativas.map((i) => [i.titulo, i.rol]).sort(), [[`${M} Actividad 1`, "responsable"], [`${M} Proyecto 1`, "colaborador"]]);
  assert.equal(d3.iniciativas.find((i) => i.titulo === `${M} Proyecto 1`).entregables_vinculados, 0);
  // Enviados en la semana pero programados en otra (detalle de d2)
  const d2 = (await api(`/admin/seguimiento/docentes/${ctx.u.d2.id}?semestre=${SA}`)).data;
  assert.equal(d2.periodo_detalle.enviados_fuera_del_periodo.length, 1);
  assert.equal(d2.periodo_detalle.enviados_fuera_del_periodo[0].semana_programada, 1);
  // Errores
  assert.equal((await api(`/admin/seguimiento/docentes/999999999?semestre=${SA}`)).status, 404);
  assert.equal((await api(`/admin/seguimiento/docentes/abc?semestre=${SA}`)).status, 400);
  assert.equal((await api(`/admin/seguimiento/docentes/${ctx.admin.id}?semestre=${SA}`)).status, 404, "un administrador no es un docente");
});

// ───────────────────────── 13. Gráficos y coherencia con las demás pantallas ─────────────────────────
test("13. Gráficos: misma población que las tarjetas; vencidos como condición (sin doble conteo)", { skip }, async () => {
  const r = await seg();
  const e = r.data.graficos.estado_entregables;
  assert.equal(e.no_iniciados + e.borradores + e.enviados + e.observados + e.aprobados, e.total, "los cinco estados suman el total");
  assert.equal(e.total, r.data.tarjetas.semestre.programados);
  assert.equal(e.de_los_cuales_vencidos, r.data.tarjetas.vencidos);
  assert.ok(e.de_los_cuales_vencidos <= e.no_iniciados + e.borradores + e.observados, "vencidos son un subconjunto de los estados que requieren acción");
  const ev = r.data.graficos.evolucion_semanal;
  assert.equal(ev.reduce((s, x) => s + x.programados, 0), e.total, "la evolución cubre toda la población");
  assert.equal(ev.reduce((s, x) => s + x.aprobados, 0), e.aprobados);
  assert.equal(ev.reduce((s, x) => s + x.reportados, 0), r.data.tarjetas.semestre.reportados);
  assert.equal(r.data.graficos.por_grupo.reduce((s, g) => s + g.total, 0), e.total);
  // La evolución y los grupos reaccionan a los mismos filtros que las tarjetas
  const f = await seg(`&programa_id=${ctx.prog1}`);
  assert.equal(f.data.graficos.estado_entregables.total, f.data.tarjetas.semestre.programados);
  assert.equal(f.data.graficos.evolucion_semanal.reduce((s, x) => s + x.programados, 0), f.data.tarjetas.semestre.programados);
  assert.equal(f.data.graficos.por_grupo.find((g) => g.id === ctx.g.g2).total, 0, "el programa 1 no tiene docentes en el grupo 2");
});

test("15. Coherencia con Avance consolidado, Métricas, Dashboard e Indicadores por grupo", { skip }, async () => {
  const s = await seg();
  const av = await api(`/admin/avance-consolidado?semestre=${SA}`);
  assert.equal(av.status, 200);
  assert.equal(av.data.totales.docentes, s.data.tarjetas.docentes);
  for (const d of s.data.docentes) {
    const a = av.data.docentes.find((x) => x.id === d.id);
    assert.deepEqual(
      { rep: a.avance_reportado, apr: a.avance_aprobado, esp: a.avance_esperado, ven: a.entregables_vencidos, brecha: a.brecha, sem: a.semaforo, rev: a.pendientes_revision, obs: a.observados },
      { rep: d.semestre.total ? d.semestre.pct_reportado : 0, apr: d.semestre.total ? d.semestre.pct_aprobado : 0, esp: d.semestre.total ? d.semestre.pct_esperado : 0, ven: d.semestre.vencidos, brecha: d.semestre.total ? d.semestre.brecha_pct : a.brecha, sem: d.semestre.semaforo, rev: d.semestre.enviados_pendientes_revision, obs: d.semestre.observados },
      `docente ${d.nombre}`
    );
  }
  assert.equal(av.data.totales.pendientes_revision, s.data.tarjetas.enviados_pendientes_revision);
  const met = await api(`/admin/metricas?semestre=${SA}`);
  assert.equal(met.status, 200);
  assert.equal(met.data.resumen.aprobados, s.data.tarjetas.semestre.aprobados, "Métricas: aprobados");
  assert.equal(met.data.resumen.pendientes, s.data.tarjetas.enviados_pendientes_revision, "Métricas: pendientes de revisión");
  assert.equal(met.data.resumen.con_observaciones, s.data.tarjetas.observados, "Métricas: observados");
  const ig = await api(`/admin/indicadores-grupo?semestre=${SA}`);
  for (const g of s.data.graficos.por_grupo) {
    assert.equal(ig.data.grupos.find((x) => x.id === g.id).num_docentes, g.docentes, `Indicadores por grupo: docentes de ${g.nombre}`);
  }
  const dash = await api(`/admin/dashboard?semestre=${SA}`);
  assert.equal(dash.status, 200);
  const st = dash.data.stats ?? {};
  if (st.reportes_aprobados != null) assert.equal(st.reportes_aprobados, s.data.tarjetas.semestre.aprobados, "Dashboard: aprobados");
  if (st.pendientes_revision != null) assert.equal(st.pendientes_revision, s.data.tarjetas.enviados_pendientes_revision, "Dashboard: pendientes de revisión");
  if (st.reportes_observados != null) assert.equal(st.reportes_observados, s.data.tarjetas.observados, "Dashboard: observados");
});

// ───────────────────────── Permisos y robustez ─────────────────────────
test("Permisos: solo administradores; docentes y visitantes no acceden; sin escrituras", { skip }, async () => {
  const antes = (await q(`SELECT COUNT(*)::int n, COALESCE(md5(string_agg(e::text, '|' ORDER BY e.id)), '') h FROM proyecto_entregables e WHERE e.docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]))[0];
  assert.equal((await api(`/admin/seguimiento?semestre=${SA}`, ctx.docTok)).status, 403);
  assert.equal((await api(`/admin/seguimiento/docentes/${ctx.u.d1.id}?semestre=${SA}`, ctx.docTok)).status, 403);
  assert.equal((await api(`/admin/seguimiento?semestre=${SA}`, null)).status, 401);
  for (let i = 0; i < 3; i += 1) { await seg(); await api(`/admin/seguimiento/docentes/${ctx.u.d1.id}?semestre=${SA}`); }
  const despues = (await q(`SELECT COUNT(*)::int n, COALESCE(md5(string_agg(e::text, '|' ORDER BY e.id)), '') h FROM proyecto_entregables e WHERE e.docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]))[0];
  assert.deepEqual(despues, antes, "la lectura no modifica nada");
});
