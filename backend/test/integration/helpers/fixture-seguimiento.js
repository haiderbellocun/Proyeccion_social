// Fixture sintético del Seguimiento operativo (solo bases de pruebas): lo comparten la suite de integración y la E2E de interfaz.
// Semestre activo SA (hoy cae en su semana 4) y semestre anterior SP; tres grupos activos (uno sin entregables) y uno del semestre anterior;
// seis docentes (con matriz y reportes en distintos estados, sin grupo, de un grupo sin entregables y del semestre anterior) y un administrador.
// Los reportes y revisiones se crean con los servicios reales (registrarDesdeMatriz / aplicarRevisionAdmin); las asignaciones, con el servicio
// único de asignaciones. Prefijo TST_SG; `desmontar` retira todo (incluido el historial de asignaciones).
import { purgarAsignaciones } from "./purgar-asignaciones.js";
import { conSemestreActivo } from "./semestre-activo.js";

export const SA = "2088A";
export const SP = "2087B";
export const M = "TST_SG";

export async function montar(pool) {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const { hoyBogota, sumarDias } = await import("../../../src/services/matrizService.js");
  const { cambiarGrupo } = await import("../../../src/services/asignacionDocenteService.js");
  const { aplicarRevisionAdmin, registrarDesdeMatriz } = await import("../../../src/services/entregableWorkflowService.js");
  const ctx = { u: {}, g: {}, tpl: {}, p: {}, q };
  await desmontar(pool);
  const hoy = hoyBogota();
  const ini = sumarDias(hoy, -21); // hoy cae en la semana 4 del semestre activo
  ctx.ini = ini;
  ctx.activosPrevios = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await q(`UPDATE semestres SET activo = false WHERE activo`);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, FALSE)`, [SP, sumarDias(hoy, -300), sumarDias(hoy, -189)]);
  await q(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, TRUE)`, [SA, ini, sumarDias(ini, 111)]);
  ctx.esc = (await q(`INSERT INTO escuelas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Escuela`, `${M}_E`]))[0].id;
  ctx.prog1 = (await q(`INSERT INTO programas (nombre, codigo, escuela_id) VALUES ($1, $2, $3) RETURNING id`, [`${M} Programa 1`, `${M}_P1`, ctx.esc]))[0].id;
  ctx.prog2 = (await q(`INSERT INTO programas (nombre, codigo) VALUES ($1, $2) RETURNING id`, [`${M} Programa 2`, `${M}_P2`]))[0].id; // sin escuela
  const mkUser = async (n, rol = "docente", programa = null) => (await q(
    `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente) VALUES ($1, 'Seguimiento', $2, $3, $4, 'activo', $5) RETURNING id, nombre, apellido, correo, rol`,
    [`${M}_${n}`, `${M}.${n}@test.local`.toLowerCase(), rol, programa, rol === "docente" ? "ANTIGUO" : null]
  ))[0];
  const iniciativa = async (titulo, tipo, responsable, desde) => {
    const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, $4, $5::date, 16) RETURNING id`, [`${M} ${titulo}`, ctx.prog1, responsable, tipo, desde]))[0].id;
    for (let n = 1; n <= 16; n += 1) await q(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(desde, (n - 1) * 7), sumarDias(desde, (n - 1) * 7 + 6)]);
    return p;
  };
  const plantilla = async (grupo, numero, semana, mes) => (await q(
    `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
     VALUES ($1, $2, 'Proyecto', 'Proyecto', $3, $4, $5, 'Cargar soporte', 2, $6, $7) RETURNING id`,
    [grupo, numero, mes, semana, `${M} Entregable S${semana}`, (semana - 1) * 7, (semana - 1) * 7 + 4]
  ))[0].id;
  ctx.admin = await mkUser("Admin", "admin");
  const grupo = async (clave, nombre, sem) => (ctx.g[clave] = (await q(
    `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
     VALUES ($1, 's', 'ANTIGUO', 10, 1, 0, 0, 0, true, $2) RETURNING id`, [`${M} ${nombre}`, sem]
  ))[0].id);
  await grupo("g1", "Grupo 1", SA);
  await grupo("g2", "Grupo 2", SA);
  await grupo("g3", "Grupo 3 sin entregables", SA);
  await grupo("gp", "Grupo anterior", SP);
  ctx.tpl.g1 = [];
  for (let w = 1; w <= 6; w += 1) ctx.tpl.g1.push(await plantilla(ctx.g.g1, w, w, w <= 2 ? "Septiembre" : "Octubre"));
  ctx.tpl.g2 = [];
  for (const [n, w] of [[1, 3], [2, 4], [3, 5]]) ctx.tpl.g2.push(await plantilla(ctx.g.g2, n, w, "Octubre"));
  ctx.tpl.gp = [await plantilla(ctx.g.gp, 1, 2, "Mayo")];
  ctx.u.d1 = await mkUser("Docente1", "docente", ctx.prog1);
  ctx.u.d2 = await mkUser("Docente2", "docente", ctx.prog1);
  ctx.u.d3 = await mkUser("Docente3", "docente", ctx.prog2);
  ctx.u.d4 = await mkUser("SinGrupo", "docente", ctx.prog2);
  ctx.u.d5 = await mkUser("GrupoVacio", "docente", ctx.prog2);
  ctx.u.d6 = await mkUser("Anterior", "docente", ctx.prog2);
  const asig = (d, g) => cambiarGrupo(pool, { docenteId: d.id, grupoId: g, actorId: ctx.admin.id, motivo: "Asignación de la prueba de seguimiento" });
  await asig(ctx.u.d1, ctx.g.g1); await asig(ctx.u.d2, ctx.g.g1); await asig(ctx.u.d3, ctx.g.g2); await asig(ctx.u.d5, ctx.g.g3);
  await conSemestreActivo(q, SP, () => asig(ctx.u.d6, ctx.g.gp));
  ctx.p.p1 = await iniciativa("Proyecto 1", "proyecto", ctx.u.d1.id, ini);
  ctx.p.p2 = await iniciativa("Proyecto 2", "proyecto", ctx.u.d2.id, ini);
  ctx.p.a1 = await iniciativa("Actividad 1", "actividad", ctx.u.d3.id, ini);
  await q(`INSERT INTO proyecto_docentes (proyecto_id, docente_id) VALUES ($1, $2)`, [ctx.p.p1, ctx.u.d3.id]); // d3 colabora en el proyecto 1
  ctx.p.pp = await iniciativa("Proyecto anterior", "proyecto", ctx.u.d6.id, sumarDias(hoy, -300));
  const enviar = (d, plantillaId, proyectoId, completado = true) => registrarDesdeMatriz(pool, { docenteId: d.id, actorId: d.id, plantillaId, completado, proyectoId, datos: { url_evidencia: [`https://drive.google.com/file/d/TSTSG-${plantillaId}-${d.id}/view`] } });
  const revisar = (id, estadoNuevo, extra = {}) => aplicarRevisionAdmin(pool, { entregableId: id, estadoNuevo, actorId: ctx.admin.id, ...extra });
  const t1 = ctx.tpl.g1;
  // d1: S1 aprobado, S2 enviado, S3 observado (queda vencido), S4+ sin iniciar
  await revisar((await enviar(ctx.u.d1, t1[0], ctx.p.p1)).entregable_id, "aprobado");
  await enviar(ctx.u.d1, t1[1], ctx.p.p1);
  await revisar((await enviar(ctx.u.d1, t1[2], ctx.p.p1)).entregable_id, "observado", { comentario: "Falta el anexo firmado" });
  // d2: S1 enviado HOY (programado para la semana 1), S2 borrador (vencido), S3 sin iniciar (vencido)
  await enviar(ctx.u.d2, t1[0], ctx.p.p2);
  await enviar(ctx.u.d2, t1[1], ctx.p.p2, false);
  // d3 (grupo 2): semana 3 aprobada, semanas 4 y 5 sin iniciar
  await revisar((await enviar(ctx.u.d3, ctx.tpl.g2[0], ctx.p.a1)).entregable_id, "aprobado");
  // d6 (semestre anterior): su único entregable enviado
  await enviar(ctx.u.d6, ctx.tpl.gp[0], ctx.p.pp);
  return ctx;
}

export async function desmontar(pool, ctx = null) {
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  await purgarAsignaciones(pool, { usuarioLike: `${M}.%` });
  for (const s of [SA, SP]) await purgarAsignaciones(pool, { semestre: s });
  const g = (await q(`SELECT id FROM grupos_matriz WHERE nombre LIKE $1`, [`${M}%`])).map((r) => r.id);
  await q(`DELETE FROM entregable_eventos WHERE plantilla_id IN (SELECT id FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])) OR docente_id IN (SELECT id FROM usuarios WHERE correo ILIKE $2)`, [g, `${M}.%`]);
  await q(`DELETE FROM notificaciones WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo ILIKE $1)`, [`${M}.%`]).catch(() => {});
  await q(`DELETE FROM proyectos WHERE titulo LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM usuarios WHERE correo ILIKE $1`, [`${M}.%`]);
  await q(`DELETE FROM plantilla_entregables WHERE grupo_id = ANY($1::int[])`, [g]);
  await q(`DELETE FROM grupos_matriz WHERE id = ANY($1::int[])`, [g]);
  await q(`UPDATE semestres SET activo = false WHERE codigo = ANY($1::text[])`, [[SA, SP]]);
  await q(`DELETE FROM semestres WHERE codigo = ANY($1::text[])`, [[SA, SP]]);
  await q(`DELETE FROM programas WHERE nombre LIKE $1`, [`${M}%`]);
  await q(`DELETE FROM escuelas WHERE nombre LIKE $1`, [`${M}%`]);
  if (ctx?.activosPrevios?.length) await q(`UPDATE semestres SET activo = true WHERE codigo = ANY($1::text[])`, [ctx.activosPrevios]);
}
