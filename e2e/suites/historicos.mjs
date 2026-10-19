// Backend Bloque 1 (protección de históricos): validación final contra el backend REAL y proysocial_dev.
// Las escrituras usan solo fixtures sintéticos TSTV (y semestres 2096A/2096B); se limpian y se compara la BD antes/después.
// Comprueba por la API los rechazos 409 `HISTORICO_PROTEGIDO`, las operaciones legítimas, las vías que podrían eludir la protección
// y que la interfaz muestra los mensajes (no un error genérico). Requiere el backend reiniciado con el código nuevo.
// Uso: npm run e2e -- historicos
import { lanzar, pausa, iniciarSuite, guardaBD, instantanea, login, ir, E, linea, API, ADMIN } from "../lib/helpers.mjs";
iniciarSuite("historicos");
const { pool, q } = await guardaBD();
const wf = await import(new URL("../../backend/src/services/entregableWorkflowService.js", import.meta.url).href);
const svc = await import(new URL("../../backend/src/services/matrizService.js", import.meta.url).href);
const res = [];
const ok = (n, c, d = "") => res.push(linea(n, c, d));
const FX = "TSTV";
const S1 = "2096A";
const S2 = "2096B";
const DRIVE = "https://drive.google.com/file/d/TSTV-EVIDENCIA/view";

/* ───────── API (Node) con el acceso de desarrollo ───────── */
async function token(correo) {
  const r = await fetch(`${API}/auth/dev/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo }) });
  return (await r.json()).token;
}
const TA = await token(ADMIN);
const api = async (ruta, { m = "GET", body } = {}) => {
  const r = await fetch(`${API}${ruta}`, { method: m, headers: { Authorization: `Bearer ${TA}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
};
const hist = (r) => r.s === 409 && r.d.codigo === "HISTORICO_PROTEGIDO" && r.d.requiere_confirmacion === undefined && typeof r.d.error === "string" && r.d.error.length > 10;

/* ───────── línea base y limpieza ───────── */
const TABLAS = [["usuarios", "id"], ["semestres", "codigo"], ["grupos_matriz", "id"], ["plantilla_entregables", "id"], ["proyectos", "id"], ["proyecto_semanas", "id"], ["proyecto_entregables", "id"], ["entregable_evidencias", "id"], ["entregable_eventos", "id"], ["docente_entregable_excepciones", "id"], ["importaciones_matriz", "id"]];
async function huella() {
  const o = {};
  // `ultimo_acceso` cambia con cada inicio de sesión de desarrollo: no es historia.
  for (const [t, k] of TABLAS) o[t] = (await q(`select count(*)::int n, md5(coalesce(string_agg((to_jsonb(x) - 'ultimo_acceso')::text, '|' order by ${k}), '')) h from ${t} x`))[0];
  o.activo = JSON.stringify(await q("select codigo from semestres where activo"));
  return JSON.stringify(o);
}
async function limpiar() {
  const proy = (await q(`select id from proyectos where titulo like '${FX}%'`)).map((r) => r.id);
  const usu = (await q(`select id from usuarios where correo ilike 'tstv.%'`)).map((r) => r.id);
  const grp = (await q(`select id from grupos_matriz where nombre like '${FX}%' or semestre in ('${S1}','${S2}')`)).map((r) => r.id);
  await q(`delete from entregable_eventos where docente_id = any($1::int[]) or actor_id = any($1::int[]) or plantilla_id in (select id from plantilla_entregables where grupo_id = any($2::int[]))`, [usu, grp]);
  for (const id of proy) await q(`delete from proyectos where id=$1`, [id]);
  await q(`delete from docente_entregable_excepciones where docente_id = any($1::int[])`, [usu]);
  await q(`delete from importaciones_matriz where grupo_id = any($1::int[])`, [grp]);
  await q(`delete from usuarios where id = any($1::int[])`, [usu]);
  await q(`delete from plantilla_entregables where grupo_id = any($1::int[])`, [grp]);
  await q(`delete from grupos_matriz where id = any($1::int[])`, [grp]);
  await q(`delete from actualizaciones_masivas_entregables where semestre in ('${S1}','${S2}')`);
  await q(`delete from semestres where codigo in ('${S1}','${S2}') and not activo`);
}
const residuos = async () => (await q(`select (select count(*) from usuarios where correo ilike 'tstv.%')::int u, (select count(*) from grupos_matriz where nombre like '${FX}%')::int g, (select count(*) from proyectos where titulo like '${FX}%')::int p, (select count(*) from semestres where codigo in ('${S1}','${S2}'))::int s`))[0];

await limpiar();
const antes = await huella();
const base = await instantanea(q);
const p = await lanzar({ ancho: 1440, alto: 900 });
try {
  /* ───────── fixtures ───────── */
  const prog = (await q(`select id from programas order by id limit 1`))[0].id;
  const sem = (await q(`select codigo, fecha_inicio from semestres where activo`))[0];
  const inicio = svc.fechaDesdeColumnaDate(sem.fecha_inicio);
  await q(`insert into semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) values ($1, $2::date, $3::date, 16, false), ($4, $5::date, $6::date, 16, false)`, [S1, "2096-02-09", "2096-05-31", S2, "2096-08-10", "2096-11-29"]);
  const mkG = async (nombre, semestre, tipo = "ANTIGUO", activo = true) => (await q(`insert into grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) values ($1,'sintético',$2,10,1,0,0,0,$3,$4) returning id`, [`${FX} ${nombre}`, tipo, activo, semestre]))[0].id;
  const mkT = async (g, semana, texto, ini = 0, fin = 4) => (await q(`insert into plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) values ($1,$2,'Proyecto','Proyecto','Octubre',$3,$4,'Cargar soporte',2,$5,$6) returning id`, [g, semana * 10 + 1, semana, `${FX} ${texto}`, ini, fin]))[0].id;
  const G = { g1: await mkG("G1", sem.codigo), g2: await mkG("G2", sem.codigo), g3: await mkG("G3 vacío", sem.codigo), gs1: await mkG("GS1", S1), gs2: await mkG("GS2 solo configuración", S2) };
  const T = { a: await mkT(G.g1, 1, "Entrega A"), b: await mkT(G.g1, 2, "Entrega B", 7, 11), c: await mkT(G.g1, 3, "Entrega C", 14, 18), a2: await mkT(G.g2, 1, "Entrega A"), t3: await mkT(G.g3, 1, "Entrega N"), s1: await mkT(G.gs1, 1, "Entrega S1"), s2: await mkT(G.gs2, 1, "Entrega S2") };
  const mkU = async (n, g) => (await q(`insert into usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, regional, grupo_matriz_id) values ($1,'Prueba',$2,'docente',$3,'activo','ANTIGUO','Bogotá',$4) returning id, nombre, apellido, correo`, [`${FX}_${n}`, `tstv.${n.toLowerCase()}@proysocial.local`, prog, g]))[0];
  const U = { v: await mkU("DV", G.g1), g: await mkU("DG", G.g2), s: await mkU("DS", G.gs1), libre: await mkU("DLibre", null) };
  const mkP = async (titulo, doc, desde) => {
    const id = (await q(`insert into proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) values ($1,$2,$3,'proyecto',$4::date,16) returning id`, [`${FX} ${titulo}`, prog, doc.id, desde]))[0].id;
    for (let n = 1; n <= 16; n += 1) await q(`insert into proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) values ($1,$2,$3::date,$4::date)`, [id, n, svc.sumarDias(desde, (n - 1) * 7), svc.sumarDias(desde, (n - 1) * 7 + 6)]);
    return id;
  };
  const P = { p1: await mkP("P1 de DV", U.v, inicio), p2: await mkP("P2 de DV", U.v, inicio), ps: await mkP("PS de DS", U.s, "2096-02-09"), pb: await mkP("PB solo borrador", U.g, inicio) };
  const enviar = (doc, tpl, proy, completado = true) => wf.registrarDesdeMatriz(pool, { docenteId: doc.id, plantillaId: tpl, completado, proyectoId: proy, datos: completado ? { url_evidencia: [DRIVE] } : {} });
  const adminId = (await q(`select id from usuarios where rol='admin' and estado='activo' order by id limit 1`))[0].id;
  const eA = await enviar(U.v, T.a, P.p1);
  await wf.aplicarRevisionAdmin(pool, { entregableId: eA.entregable_id, estadoNuevo: "aprobado", actorId: adminId });
  const eB = (await enviar(U.v, T.b, P.p1, false)).entregable_id;
  const eS = (await enviar(U.s, T.s1, P.ps)).entregable_id;
  ok("fixtures: historia real creada con el flujo del producto (aprobado, borrador y enviado) y evidencias/eventos", !!eA.entregable_id && !!eB && !!eS && (await q(`select count(*)::int n from entregable_evidencias where entregable_id = any($1::int[])`, [[eA.entregable_id, eB, eS]]))[0].n >= 2);
  const congelado = async () => JSON.stringify([await q(`select id, plantilla_id, docente_id, estado_revision, proyecto_semana_id from proyecto_entregables where id = any($1::int[]) order by id`, [[eA.entregable_id, eB, eS]]), await q(`select entregable_id, plantilla_id, docente_id, url, estado from entregable_evidencias where entregable_id = any($1::int[]) order by id`, [[eA.entregable_id, eB, eS]]), await q(`select tipo, entregable_id, plantilla_id from entregable_eventos where entregable_id = any($1::int[]) order by id`, [[eA.entregable_id, eB, eS]])]);
  const historia0 = await congelado();

  /* ───────── 1. Rechazos 409 HISTORICO_PROTEGIDO ───────── */
  let r = await api(`/admin/plantillas/${T.a}`, { m: "DELETE" });
  ok("DELETE plantilla con reporte aprobado → 409 HISTORICO_PROTEGIDO con resumen y sin «requiere_confirmacion»", hist(r) && r.d.resumen.entregables >= 1, `${r.s} ${r.d.error}`);
  ok("DELETE plantilla con borrador → 409 (protege cualquier estado)", hist(await api(`/admin/plantillas/${T.b}`, { m: "DELETE" })));
  ok("DELETE plantilla con eliminación forzada → 409", hist(await api(`/admin/plantillas/${T.a}?forzar=true`, { m: "DELETE" })) && hist(await api(`/admin/plantillas/${T.b}?forzar=true`, { m: "DELETE" })));
  r = await api(`/admin/grupos-matriz/${G.g1}?forzar=true`, { m: "DELETE" });
  ok("DELETE grupo con docentes asignados → 400 (regla existente) incluso con forzar", r.s === 400, r.d.error);
  await q(`update usuarios set grupo_matriz_id = null where id = $1`, [U.v.id]);
  ok("DELETE grupo con entregables (sin docentes) y con forzar → 409 HISTORICO_PROTEGIDO", hist(await api(`/admin/grupos-matriz/${G.g1}`, { m: "DELETE" })) && hist(await api(`/admin/grupos-matriz/${G.g1}?forzar=true`, { m: "DELETE" })));
  await q(`update usuarios set grupo_matriz_id = $1 where id = $2`, [G.g1, U.v.id]);
  ok("DELETE semestre con históricos → 409, también con forzar", hist(await api(`/admin/semestres/${S1}`, { m: "DELETE" })) && hist(await api(`/admin/semestres/${S1}?forzar=true`, { m: "DELETE" })));
  r = await api(`/admin/semestres/${sem.codigo}?forzar=true`, { m: "DELETE" });
  ok("DELETE del semestre activo sigue bloqueado (409)", r.s === 409, r.d.error);
  ok("PUT plantilla con reportes (horas, texto, semana, fechas, enlace) → 409 en cada intento", (await Promise.all([{ horas: 99 }, { entregable: "Otro" }, { semana_numero: 9 }, { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-05" }, { enlace_referencia: "https://example.com/x" }, { descripcion_evidencia: "otra" }].map((b) => api(`/admin/plantillas/${T.a}`, { m: "PUT", body: b })))).every(hist));
  ok("DELETE docente con historial → 409 (y el responsable de iniciativas también recibe el aviso de historial)", hist(await api(`/admin/usuarios/${U.v.id}`, { m: "DELETE" })));
  r = await api(`/admin/usuarios/${adminId}`, { m: "DELETE" });
  ok("DELETE de la propia cuenta administradora → 409", r.s === 409, r.d.error);
  const yo = (await q(`select nombre, apellido, correo from usuarios where id = $1`, [adminId]))[0];
  r = await api(`/admin/usuarios/${adminId}`, { m: "PUT", body: { nombre: yo.nombre, apellido: yo.apellido, correo: yo.correo, rol: "admin", estado: "inactivo" } });
  ok("desactivar la propia cuenta del único administrador → 409 (no queda el sistema sin administradores)", r.s === 409, r.d.error);
  ok("ADMIN activo sigue siendo 1 o más", (await q(`select count(*)::int n from usuarios where rol='admin' and estado='activo'`))[0].n >= 1);
  const cuerpoV = (extra = {}) => ({ nombre: U.v.nombre, apellido: U.v.apellido, correo: U.v.correo, rol: "docente", estado: "activo", tipo_docente: "ANTIGUO", grupo_matriz_id: G.g1, ...extra });
  ok("reasignar grupo de un docente con reportes → 409 por «Editar usuario», por la ruta de grupo, quitándolo y convirtiéndolo en administrador", [await api(`/admin/usuarios/${U.v.id}`, { m: "PUT", body: cuerpoV({ grupo_matriz_id: G.g2 }) }), await api(`/admin/docentes/${U.v.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: G.g2 } }), await api(`/admin/docentes/${U.v.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: null } }), await api(`/admin/usuarios/${U.v.id}`, { m: "PUT", body: cuerpoV({ rol: "admin" }) })].every(hist));
  ok("tras todos los rechazos la historia (reportes, evidencias, eventos, plantillas) está exactamente igual", (await congelado()) === historia0);

  /* ───────── 2. Operaciones legítimas ───────── */
  r = await api(`/admin/usuarios/${U.v.id}`, { m: "PUT", body: cuerpoV({ estado: "inactivo" }) });
  ok("inactivar al docente con historial → 200 y conserva todo", r.s === 200 && r.d.estado === "inactivo" && (await congelado()) === historia0, `${r.s}`);
  ok("reactivarlo → 200", (await api(`/admin/usuarios/${U.v.id}`, { m: "PUT", body: cuerpoV() })).s === 200);
  ok("reasignar a un docente SIN historial entre grupos del mismo tipo → 200, y devolverlo → 200", (await api(`/admin/docentes/${U.g.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: G.g3 } })).s === 200 && (await api(`/admin/docentes/${U.g.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: G.g2 } })).s === 200);
  ok("la ruta de grupo aplica las reglas de «Editar usuario»: grupo de otro tipo o inactivo → 409/404", (await api(`/admin/docentes/${U.libre.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: await mkG("GN", sem.codigo, "NUEVO") } })).s === 409 && (await api(`/admin/docentes/${U.libre.id}/grupo-matriz`, { m: "PUT", body: { grupo_matriz_id: await mkG("GI", sem.codigo, "ANTIGUO", false) } })).s === 404);
  ok("editar una plantilla sin reportes → 200", (await api(`/admin/plantillas/${T.c}`, { m: "PUT", body: { horas: 5, entregable: `${FX} Entrega C editada` } })).s === 200);
  const vista = await api(`/admin/plantillas/actualizacion-masiva/preview`, { m: "POST", body: { plantilla_id: T.a2 } });
  ok("actualización masiva: la vista previa separa plantillas modificables y protegidas", vista.s === 200 && vista.d.plantillas_afectadas === 1 && vista.d.plantillas_protegidas === 1, JSON.stringify([vista.d.plantillas_afectadas, vista.d.plantillas_protegidas]));
  const masiva = await api(`/admin/plantillas/actualizacion-masiva`, { m: "PUT", body: { plantilla_id: T.a2, descripcion_evidencia: "Instrucción compartida TSTV" } });
  const dA = (await q(`select descripcion_evidencia d from plantilla_entregables where id = $1`, [T.a]))[0].d;
  ok("actualización masiva: cambia solo la plantilla sin reportes y no toca la protegida", masiva.s === 200 && masiva.d.plantillas_protegidas === 1 && dA === "Cargar soporte");
  ok("eliminar una plantilla sin reportes → 200", (await api(`/admin/plantillas/${T.c}`, { m: "DELETE" })).s === 200);
  r = await api(`/admin/grupos-matriz/${G.g3}`, { m: "DELETE" });
  ok("eliminar un grupo solo con configuración: pide confirmación (400, regla existente)", r.s === 400 && r.d.tiene_plantillas === true);
  await q(`update usuarios set grupo_matriz_id = null where id = $1`, [U.g.id]);
  ok("…y con confirmación se elimina → 200", (await api(`/admin/grupos-matriz/${G.g3}?forzar=true`, { m: "DELETE" })).s === 200);
  await q(`update usuarios set grupo_matriz_id = $1 where id = $2`, [G.g2, U.g.id]);
  r = await api(`/admin/semestres/${S2}`, { m: "DELETE" });
  ok("eliminar un semestre solo con configuración: pide confirmación (409 requiere_confirmacion, regla existente)", r.s === 409 && r.d.requiere_confirmacion === true);
  ok("…y con confirmación se elimina → 200", (await api(`/admin/semestres/${S2}?forzar=true`, { m: "DELETE" })).s === 200);
  const tmp = (await q(`insert into usuarios (nombre, apellido, correo, rol, estado, tipo_docente) values ($1,'Prueba','tstv.tmp@proysocial.local','docente','activo','ANTIGUO') returning id`, [`${FX}_Tmp`]))[0].id;
  ok("eliminar un docente sin historial → 200", (await api(`/admin/usuarios/${tmp}`, { m: "DELETE" })).s === 200);

  /* ───────── 3. Vías que podrían eludir la protección ───────── */
  const semanaP1 = (await q(`select id from proyecto_semanas where proyecto_id = $1 and numero = 1`, [P.p1]))[0].id;
  r = await api(`/admin/docentes/${U.v.id}/plantillas/${T.a}/excepcion`, { m: "PUT", body: { motivo: "Prueba de movimiento", proyecto_id: P.p2 } });
  ok("excepción individual que MOVERÍA un reporte a otra iniciativa → 409 HISTORICO_PROTEGIDO", hist(r));
  const sinMover = await api(`/admin/docentes/${U.v.id}/plantillas/${T.a}/excepcion`, { m: "PUT", body: { motivo: "Ajuste sin mover el reporte", proyecto_id: P.p1 } });
  ok("excepción individual legítima (deja el reporte donde está) → 200", sinMover.s === 200, `${sinMover.s}`);
  const excepcion = (await q(`select motivo, creado_por from docente_entregable_excepciones where docente_id = $1 and plantilla_id = $2`, [U.v.id, T.a]))[0];
  ok("la excepción exige motivo y registra su autor (no reescribe la plantilla ni el reporte)", !!excepcion?.motivo && excepcion.creado_por != null && (await congelado()) === historia0);
  const sinMotivo = await api(`/admin/docentes/${U.v.id}/plantillas/${T.a}/excepcion`, { m: "PUT", body: { proyecto_id: P.p1 } });
  ok("excepción sin motivo → 400", sinMotivo.s === 400);
  await q(`delete from docente_entregable_excepciones where docente_id = $1`, [U.v.id]);
  const semEntregables = await api(`/admin/proyectos/${P.p1}/entregables-semanales`, { m: "POST", body: { semanas: [{ semanaId: semanaP1, entregables: [] }] } });
  ok("reedición del cronograma: un entregable reportado se conserva (no se puede borrar vaciando la semana)", semEntregables.s === 200 && semEntregables.d.conservados_con_avance >= 1 && (await q(`select count(*)::int n from proyecto_entregables where id = $1`, [eA.entregable_id]))[0].n === 1, JSON.stringify(semEntregables.d));
  ok("PUT /plantillas con fechas (cambio de fechas por la plantilla) está protegido igual que las horas", hist(await api(`/admin/plantillas/${T.b}`, { m: "PUT", body: { fecha_inicio: "2026-10-01", fecha_fin: "2026-10-05" } })));
  // Bloque 1.1: las cuatro vías que antes quedaban abiertas (iniciativas, calendario del semestre, colaboradores, responsable).
  const pb = await enviar(U.g, T.a2, P.pb, false);
  const delP = await api(`/admin/proyectos/${P.pb}?forzar=true`, { m: "DELETE" });
  const sigue = (await q(`select count(*)::int n from proyecto_entregables where id = $1`, [pb.entregable_id]))[0].n;
  ok("DELETE iniciativa con un reporte solo en borrador y forzar → 409 HISTORICO_PROTEGIDO, el reporte sigue", hist(delP) && sigue === 1, `status ${delP.s}; reporte restante: ${sigue}`);
  const pe = await mkP("PE enviado", U.s, inicio);
  const tpe = await mkT(G.gs1, 5, "Entrega S1b", 28, 32);
  await enviar(U.s, tpe, pe);
  ok("DELETE iniciativa con reporte enviado, con y sin forzar → 409", hist(await api(`/admin/proyectos/${pe}?forzar=true`, { m: "DELETE" })) && hist(await api(`/admin/proyectos/${pe}`, { m: "DELETE" })));
  ok("DELETE iniciativa con reporte aprobado → 409", hist(await api(`/admin/proyectos/${P.p1}?forzar=true`, { m: "DELETE" })));
  const pv = await mkP("PV sin reportes", U.libre, inicio);
  ok("DELETE iniciativa sin dependencias protegidas sigue funcionando → 200", (await api(`/admin/proyectos/${pv}`, { m: "DELETE" })).s === 200 && (await q(`select count(*)::int n from proyectos where id = $1`, [pv]))[0].n === 0);
  const fechasAntes = JSON.stringify((await q(`select fecha_inicio::text, fecha_fin::text, numero_semanas from semestres where codigo = $1`, [S1]))[0]);
  const cuerpoSem = (o) => ({ codigo: S1, fecha_inicio: "2096-02-09", fecha_fin: "2096-05-31", numero_semanas: 16, ...o });
  const intentos = [{ fecha_inicio: "2096-02-16" }, { fecha_fin: "2096-06-07" }, { numero_semanas: 18 }];
  const resSem = [];
  for (const o of intentos) resSem.push(await api(`/admin/semestres/${S1}`, { m: "PUT", body: cuerpoSem(o) }));
  ok("PUT fechas/semanas de un semestre con reportes → 409 en cada intento, sin cambiar nada", resSem.every(hist) && JSON.stringify((await q(`select fecha_inicio::text, fecha_fin::text, numero_semanas from semestres where codigo = $1`, [S1]))[0]) === fechasAntes, resSem.map((r) => r.s).join(","));
  ok("PUT del semestre reenviando los mismos valores no cambia nada → 200", (await api(`/admin/semestres/${S1}`, { m: "PUT", body: cuerpoSem({}) })).s === 200);

  const item = async (docId, tplId) => (await svc.loadMatrixItems(docId, pool)).find((i) => i.id === tplId);
  const pc = await mkP("PC colaborador", U.libre, inicio);
  const asigna = await api(`/admin/proyectos/${pc}/docentes`, { m: "PUT", body: { docentes: [{ id: U.g.id }] } });
  const a2c = await mkT(G.g2, 6, "Entrega A2c", 35, 39);
  await enviar(U.g, a2c, pc, false);
  const visible1 = (await item(U.g.id, a2c))?.entregable_id != null;
  const quita = await api(`/admin/proyectos/${pc}/docentes`, { m: "PUT", body: { docentes: [] } });
  const visible2 = (await item(U.g.id, a2c))?.entregable_id != null;
  const enlace = (await q(`select count(*)::int n from proyecto_docentes where proyecto_id = $1 and docente_id = $2`, [pc, U.g.id]))[0].n;
  ok("PUT docentes: retirar a un colaborador que ya reportó → 409; sigue vinculado y el reporte sigue visible en su matriz", asigna.s === 200 && visible1 && hist(quita) && visible2 && enlace === 1, `asignar ${asigna.s}, visible antes ${visible1}, quitar ${quita.s}, visible después ${visible2}, vínculo ${enlace}`);
  const pcv = await mkP("PCV colaborador sin reportes", U.libre, inicio);
  await api(`/admin/proyectos/${pcv}/docentes`, { m: "PUT", body: { docentes: [{ id: U.g.id }] } });
  const quitaVacio = await api(`/admin/proyectos/${pcv}/docentes`, { m: "PUT", body: { docentes: [] } });
  ok("PUT docentes: retirar a un colaborador sin reportes sigue funcionando → 200", quitaVacio.s === 200 && (await q(`select count(*)::int n from proyecto_docentes where proyecto_id = $1`, [pcv]))[0].n === 0);
  const a3 = await mkT(G.g2, 4, "Entrega A3", 21, 25);
  const pr = await mkP("PR responsable", U.g, inicio);
  const rr = await enviar(U.g, a3, pr, false);
  const nomProg = (await q(`select nombre from programas where id = $1`, [prog]))[0].nombre;
  const cuerpoProy = (doc) => ({ titulo: `${FX} PR responsable`, descripcion: "", programaId: prog, programaNombre: nomProg, docenteId: doc.id, tipoVisual: "project", estado: "en_ejecucion", semanas: 16, fechaInicio: inicio });
  const cambia = await api(`/admin/proyectos/${pr}`, { m: "PUT", body: cuerpoProy(U.libre) });
  const visible3 = (await item(U.g.id, a3))?.entregable_id != null;
  const respSigue = (await q(`select docente_responsable_id r from proyectos where id = $1`, [pr]))[0].r === U.g.id;
  ok("PUT iniciativa: cambiar el responsable de una iniciativa con reportes → 409; el responsable y el reporte siguen igual", hist(cambia) && visible3 && respSigue && (await q(`select count(*)::int n from proyecto_entregables where id = $1`, [rr.entregable_id]))[0].n === 1, `PUT ${cambia.s}${cambia.s !== 200 ? " " + JSON.stringify(cambia.d).slice(0, 120) : ""}, visible ${visible3}`);
  const mismo = await api(`/admin/proyectos/${pr}`, { m: "PUT", body: { ...cuerpoProy(U.g), descripcion: "texto seguro" } });
  ok("PUT iniciativa con reportes sin cambiar el responsable (edición segura) → 200", mismo.s === 200);
  const prv = await mkP("PRV responsable sin historia", U.g, inicio);
  const cambiaVacio = await api(`/admin/proyectos/${prv}`, { m: "PUT", body: { ...cuerpoProy(U.libre), titulo: `${FX} PRV responsable sin historia` } });
  ok("PUT iniciativa sin reportes: el cambio de responsable sigue funcionando → 200", cambiaVacio.s === 200 && (await q(`select docente_responsable_id r from proyectos where id = $1`, [prv]))[0].r === U.libre.id, `PUT ${cambiaVacio.s}`);

  /* ───────── 4. Interfaz: mensajes HISTORICO_PROTEGIDO ───────── */
  await login(p, ADMIN);
  const toasts = () => E(p, "return [...document.querySelectorAll('[data-sonner-toast]')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())");
  const marcarVistos = () => E(p, "document.querySelectorAll('[data-sonner-toast]').forEach(t=>t.setAttribute('data-visto','1'))");
  const toastNuevo = async (re, ms = 7000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const l = await E(p, "return [...document.querySelectorAll('[data-sonner-toast]:not([data-visto])')].map(t=>t.innerText.replace(/\\s+/g,' ').trim())"); const m = l.find((x) => re.test(x)); if (m) return m; await pausa(200); } return null; };
  const clicTxt = (txt, ambito = "document") => E(p, `const b=[...${ambito}.querySelectorAll('button')].find(x=>x.offsetParent!==null&&!x.disabled&&x.textContent.trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
  const dlg = (txt) => E(p, `const d=document.querySelector('dialog.b2-adm-dlg[open]'); const b=d&&[...d.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(txt)}); if(!b) return false; b.click(); return true`);
  const cargado = async () => { await p.esperar("!document.querySelector('.b2-skel')", { ms: 10000 }).catch(() => {}); await pausa(900); };
  const filaClic = (txt) => E(p, `const r=[...document.querySelectorAll('.b2-tabla-r')].find(x=>x.innerText.includes(${JSON.stringify(txt)})); if(!r) return false; r.click(); return true`);
  const insp = "document.querySelector('aside.b2-insp[data-open=\"true\"]')";

  await ir(p, `/admin/sistema?tab=plantillas&semestre=${sem.codigo}&grupo=${G.g1}`, 1500); await cargado();
  ok("interfaz: la plantilla protegida aparece en la tabla", await filaClic(`${FX} Entrega A`));
  await pausa(700);
  await marcarVistos();
  ok("interfaz: «Eliminar» en el inspector abre la confirmación", await clicTxt("Eliminar", insp) && await p.esperar("document.querySelector('dialog.b2-adm-dlg[open]')", { ms: 4000 }).then(() => true).catch(() => false));
  await dlg("Eliminar");
  const msgDel = await toastNuevo(/No se puede eliminar la plantilla/);
  ok("interfaz: eliminar una plantilla protegida muestra el mensaje del backend (no un error genérico)", !!msgDel, msgDel ?? (await toasts()).join(" | "));
  ok("interfaz: la plantilla sigue existiendo tras el rechazo", (await q(`select count(*)::int n from plantilla_entregables where id = $1`, [T.a]))[0].n === 1);
  await marcarVistos();
  ok("interfaz: «Editar» abre el formulario de la plantilla protegida", await clicTxt("Editar", insp) && await p.esperar("document.querySelector('.b2-form')", { ms: 4000 }).then(() => true).catch(() => false));
  await E(p, `const l=[...document.querySelectorAll('label')].find(x=>x.offsetParent!==null&&x.textContent.trim().startsWith('Horas')); const el=document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'7'); el.dispatchEvent(new Event('input',{bubbles:true}))`);
  await E(p, "document.querySelector('.b2-form-pie button[type=submit]').click()");
  const msgPut = await toastNuevo(/No se puede modificar la plantilla/);
  ok("interfaz: editar una plantilla protegida muestra el mensaje del backend", !!msgPut, msgPut ?? (await toasts()).join(" | "));
  ok("interfaz: las horas de la plantilla protegida no cambiaron", Number((await q(`select horas from plantilla_entregables where id = $1`, [T.a]))[0].horas) === 2);

  await ir(p, `/admin/sistema?tab=usuarios`, 1500); await cargado();
  await E(p, `const i=document.querySelector('input[aria-label="Buscar usuarios"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'TSTV_DV'); i.dispatchEvent(new Event('input',{bubbles:true}))`);
  await pausa(600);
  ok("interfaz: el docente con historial aparece en Usuarios", await filaClic(`${FX}_DV`));
  await pausa(700); await marcarVistos();
  ok("interfaz: «Eliminar» usuario abre la confirmación", await clicTxt("Eliminar", insp) && await p.esperar("document.querySelector('dialog.b2-adm-dlg[open]')", { ms: 4000 }).then(() => true).catch(() => false));
  await dlg("Eliminar");
  const msgUsr = await toastNuevo(/No se puede eliminar a/);
  ok("interfaz: eliminar un docente con historial muestra el mensaje del backend con la salida «inactívalo»/historial", !!msgUsr, msgUsr ?? (await toasts()).join(" | "));
  ok("interfaz: el docente sigue existiendo", (await q(`select count(*)::int n from usuarios where id = $1`, [U.v.id]))[0].n === 1);
  ok("historia intacta tras las acciones desde la interfaz", (await congelado()) === historia0);
  ok("consola del navegador sin excepciones no controladas", p.consola.filter((x) => x.startsWith("EXCEPCIÓN")).length === 0, p.consola.filter((x) => x.startsWith("EXCEPCIÓN")).slice(0, 2).join(" | "));
} catch (e) {
  ok(`EXCEPCIÓN: ${e.message}`.slice(0, 200), false);
  console.error(e);
} finally {
  await p.cerrar();
  await limpiar();
  const despues = await huella();
  const r0 = await residuos();
  ok("BD tras limpiar: idéntica a la inicial (datos sembrados intactos)", despues === antes, despues === antes ? "" : "difiere");
  ok("BD: sin fixtures TSTV ni semestres sintéticos", r0.u + r0.g + r0.p + r0.s === 0, JSON.stringify(r0));
  const fin = await instantanea(q);
  ok("BD: entregables, evidencias, eventos y estados sembrados sin cambios", JSON.stringify(fin) === JSON.stringify(base), "");
  await pool.end();
  console.log(res.join("\n"));
  process.exit(res.some((l) => l.startsWith("FALLA")) ? 1 : 0);
}
