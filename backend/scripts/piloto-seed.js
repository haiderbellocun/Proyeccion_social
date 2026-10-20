// Datos SINTÉTICOS para el ambiente PILOTO (base de piloto nueva, ya migrada con la fase28). Idempotente y con guardas.
//
//   cd backend
//   PILOTO_SEED=1 node scripts/piloto-seed.js --confirmar-base=<nombre exacto de la base>
//
// Qué crea (todo marcado como sintético; sin información personal real):
//   · semestre activo con calendario vigente (los semestres anteriores quedan inactivos: el de las migraciones, 2026A, sirve de «semestre anterior»),
//   · una escuela y dos programas de piloto, un grupo ANTIGUO con 6 entregables de ejemplo (uno «no requiere cargue»),
//   · un administrador técnico y cuatro docentes sintéticos con correo `@piloto.proysocial.invalid` (dominio inexistente: NO pueden iniciar sesión),
//     con entregables en todos los estados (borrador, enviado, observado, «sin acceso», aprobado) y enlaces ficticios,
//   · un docente sin matriz,
//   · las CUENTAS REALES de quienes prueban, SOLO desde variables de entorno (no se guardan en el repositorio):
//       PILOTO_ADMIN_EMAILS="a@dominio.edu;b@dominio.edu"      → administradores/coordinadores
//       PILOTO_DOCENTE_EMAILS="c@dominio.edu;d@dominio.edu"    → docentes con matriz e iniciativa vacías, listos para reportar
//     (nombres genéricos «Coordinación Piloto N» / «Docente Piloto N»; se editan luego en Administración → Usuarios).
//
// Guardas: exige PILOTO_SEED=1; la base debe contener «piloto» en su nombre y NO «prod», «dev» ni «test»; exige --confirmar-base con el nombre
// exacto; exige la migración fase28 (historial de asignaciones). Nunca borra nada. No usa el acceso de desarrollo.
import { pool } from "../src/db.js";
import { cambiarGrupo } from "../src/services/asignacionDocenteService.js";
import { aplicarRevisionAdmin, registrarDesdeMatriz } from "../src/services/entregableWorkflowService.js";
import { hoyBogota, sumarDias } from "../src/services/matrizService.js";

const DOMINIO_SINTETICO = "piloto.proysocial.invalid";
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
// Separadores admitidos: coma, punto y coma o espacio (en `gcloud --set-env-vars` la coma separa variables: usa «;»).
const lista = (v) => String(v || "").split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fallar(msg) {
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

async function main() {
  if (process.env.PILOTO_SEED !== "1") fallar("Define PILOTO_SEED=1 para confirmar que quieres sembrar datos sintéticos del piloto.");
  const db = (await pool.query("SELECT current_database() AS d")).rows[0].d;
  if (!/piloto/i.test(db) || /prod|dev|test/i.test(db)) fallar(`La base «${db}» no parece una base de piloto (debe contener «piloto» y no «prod», «dev» ni «test»).`);
  if (arg("confirmar-base") !== db) fallar(`Confirma la base con --confirmar-base=${db}`);
  if (!(await pool.query("SELECT to_regclass('docente_grupo_matriz_cambios') AS t")).rows[0].t) {
    fallar("Falta la migración fase28 (historial de asignaciones). Aplícala con PROYSOCIAL_APLICAR_FASE28=1 npm run migrate.");
  }
  const admins = lista(process.env.PILOTO_ADMIN_EMAILS);
  const docentesReales = lista(process.env.PILOTO_DOCENTE_EMAILS);
  for (const e of [...admins, ...docentesReales]) if (!EMAIL.test(e) || e.endsWith(".invalid")) fallar(`Correo no válido en las listas de piloto: ${e}`);
  const q = async (s, p = []) => (await pool.query(s, p)).rows;

  const inicioSiembra = (await q(`SELECT clock_timestamp() AS t`))[0].t;
  const yaSembrado = (await q(`SELECT 1 FROM usuarios WHERE correo = $1`, [`admin@${DOMINIO_SINTETICO}`])).length > 0;
  if (yaSembrado) console.log("Los datos sintéticos ya existían: solo se completan cuentas reales que falten.");

  // ── Semestre activo con calendario vigente ──
  const hoy = hoyBogota();
  const anio = Number(hoy.slice(0, 4));
  const codigo = process.env.PILOTO_SEMESTRE || `${anio}${Number(hoy.slice(5, 7)) <= 6 ? "A" : "B"}`;
  if (!/^\d{4}[AB]$/.test(codigo)) fallar("PILOTO_SEMESTRE debe tener el formato YYYYA o YYYYB");
  let sem = (await q(`SELECT codigo, fecha_inicio::text AS ini, activo FROM semestres WHERE codigo = $1`, [codigo]))[0];
  if (!sem) {
    const ini = sumarDias(hoy, -21);
    await pool.query(`UPDATE semestres SET activo = FALSE WHERE activo = TRUE`);
    await pool.query(`INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, TRUE)`, [codigo, ini, sumarDias(ini, 111)]);
    sem = (await q(`SELECT codigo, fecha_inicio::text AS ini, activo FROM semestres WHERE codigo = $1`, [codigo]))[0];
  } else if (!sem.activo) {
    await pool.query(`UPDATE semestres SET activo = FALSE WHERE activo = TRUE`);
    await pool.query(`UPDATE semestres SET activo = TRUE WHERE codigo = $1`, [codigo]);
  }
  const ini = sem.ini;
  console.log(`Semestre activo: ${codigo} (inicio ${ini})`);

  // ── Escuela, programas ──
  const escuela = (await q(`INSERT INTO escuelas (nombre, codigo) VALUES ('Escuela Piloto (sintética)', 'PILOTO') ON CONFLICT DO NOTHING RETURNING id`))[0]
    ?? (await q(`SELECT id FROM escuelas WHERE codigo = 'PILOTO'`))[0];
  const programa = async (nombre, cod) => (await q(`INSERT INTO programas (nombre, codigo, escuela_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`, [nombre, cod, escuela.id]))[0]
    ?? (await q(`SELECT id FROM programas WHERE codigo = $1`, [cod]))[0];
  const pA = await programa("Programa Piloto A (sintético)", "PILOTO_A");
  const pB = await programa("Programa Piloto B (sintético)", "PILOTO_B");

  // ── Usuarios ──
  const usuario = async (correo, nombre, apellido, rol, programaId, tipo = "ANTIGUO") => {
    const e = (await q(`SELECT id, nombre, apellido, correo, rol FROM usuarios WHERE LOWER(correo) = $1`, [correo]))[0];
    if (e) return e;
    return (await q(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente) VALUES ($1, $2, $3, $4, $5, 'activo', $6) RETURNING id, nombre, apellido, correo, rol`,
      [nombre, apellido, correo, rol, programaId, rol === "docente" ? tipo : null]
    ))[0];
  };
  const sintetico = (n) => `${n}@${DOMINIO_SINTETICO}`;
  const admin = await usuario(sintetico("admin"), "Administrador", "Sintético (sin acceso)", "admin", pA.id);
  const d1 = await usuario(sintetico("docente.uno"), "Docente Sintético", "Uno", "docente", pA.id);
  const d2 = await usuario(sintetico("docente.dos"), "Docente Sintético", "Dos", "docente", pA.id);
  const d3 = await usuario(sintetico("docente.sin-matriz"), "Docente Sintético", "Sin Matriz", "docente", pB.id);
  const d4 = await usuario(sintetico("docente.cuatro"), "Docente Sintético", "Cuatro", "docente", pB.id);
  const reales = [];
  for (const [i, c] of admins.entries()) await usuario(c, "Coordinación Piloto", String(i + 1), "admin", pA.id);
  for (const [i, c] of docentesReales.entries()) reales.push(await usuario(c, "Docente Piloto", String(i + 1), "docente", i % 2 ? pB.id : pA.id));

  // ── Grupo y entregables de ejemplo ──
  let grupo = (await q(`SELECT id FROM grupos_matriz WHERE nombre = 'Grupo Piloto (sintético)' AND semestre = $1`, [codigo]))[0];
  const plantillas = [];
  if (!grupo) {
    grupo = (await q(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ('Grupo Piloto (sintético)', 'Datos sintéticos para el piloto', 'ANTIGUO', 24, 1, 2, 0, 1, TRUE, $1) RETURNING id`, [codigo]
    ))[0];
    const def = [
      ["Plan de trabajo del semestre", "Sube el enlace al plan de trabajo en Drive (documento de ejemplo).", 2],
      ["Informe de avance 1", "Comparte el enlace al informe de avance con permiso de lectura para coordinación.", 3],
      ["Registro de actividades", "Enlace a la hoja de cálculo con el registro de actividades.", 2],
      ["Socialización con aliados", "Esta tarea no implica realizar cargue", 1],
      ["Informe de avance 2", "Comparte el enlace al segundo informe de avance.", 3],
      ["Cierre y lecciones aprendidas", "Enlace al documento de cierre.", 2],
    ];
    for (const [n, [titulo, instr, horas]] of def.entries()) {
      plantillas.push((await q(
        `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb)
         VALUES ($1, $2, 'Proyecto', 'Proyecto', 'Piloto', $3, $4, $5, $6, $7, $8) RETURNING id`,
        [grupo.id, n + 1, n + 1, titulo, instr, horas, n * 7, n * 7 + 4]
      ))[0].id);
    }
  } else {
    for (const r of await q(`SELECT id FROM plantilla_entregables WHERE grupo_id = $1 ORDER BY numero`, [grupo.id])) plantillas.push(r.id);
  }

  // ── Asignaciones (servicio único: historial + espejo + registro, con motivo) e iniciativas ──
  const iniciativa = async (docente, titulo) => {
    const e = (await q(`SELECT id FROM proyectos WHERE titulo = $1 AND docente_responsable_id = $2`, [titulo, docente.id]))[0];
    if (e) return e.id;
    const p = (await q(`INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, semanas) VALUES ($1, $2, $3, 'proyecto', $4::date, 16) RETURNING id`, [titulo, pA.id, docente.id, ini]))[0].id;
    for (let n = 1; n <= 16; n += 1) await pool.query(`INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`, [p, n, sumarDias(ini, (n - 1) * 7), sumarDias(ini, (n - 1) * 7 + 6)]);
    return p;
  };
  const conMatriz = [d1, d2, d4, ...reales];
  for (const d of conMatriz) {
    await cambiarGrupo(pool, { docenteId: d.id, grupoId: grupo.id, actorId: admin.id, motivo: "Datos sintéticos del piloto" });
    d.proyecto = await iniciativa(d, `Iniciativa de piloto (sintética) — ${d.nombre} ${d.apellido}`);
  }
  d3.proyecto = null; // sin matriz ni iniciativa

  // ── Entregables en distintos estados (solo si el docente aún no tiene reportes) ──
  const sinReportes = async (d) => (await q(`SELECT COUNT(*)::int n FROM proyecto_entregables WHERE docente_id = $1`, [d.id]))[0].n === 0;
  const enlace = (n) => `https://drive.google.com/file/d/PILOTO-SINTETICO-${n}/view`;
  const reportar = (d, i, completado, n) => registrarDesdeMatriz(pool, { docenteId: d.id, actorId: d.id, plantillaId: plantillas[i], completado, proyectoId: d.proyecto, datos: { url_evidencia: [enlace(n)] } });
  const revisar = async (id, estadoNuevo, extra = {}) => aplicarRevisionAdmin(pool, { entregableId: id, estadoNuevo, actorId: admin.id, ...extra });
  if (await sinReportes(d1)) {
    await revisar((await reportar(d1, 0, true, 1)).entregable_id, "aprobado");
    await reportar(d1, 1, true, 2); // enviado, pendiente de revisión
    await revisar((await reportar(d1, 2, true, 3)).entregable_id, "observado", { comentario: "Dato sintético: falta la hoja de actividades del mes (corrige y reenvía)." });
    await reportar(d1, 4, false, 4); // borrador
  }
  if (await sinReportes(d2)) {
    await reportar(d2, 0, true, 5);
    await revisar((await reportar(d2, 1, true, 6)).entregable_id, "observado", { motivo: "sin_acceso" });
    await revisar((await reportar(d2, 2, true, 7)).entregable_id, "aprobado");
  }
  if (await sinReportes(d4)) {
    await revisar((await reportar(d4, 0, true, 8)).entregable_id, "aprobado");
    await revisar((await reportar(d4, 1, true, 9)).entregable_id, "aprobado");
  }

  // Los disparadores de la base encolan correos (nuevo reporte → coordinación; aprobado/observado → docente) aunque el envío esté desactivado.
  // Los de la siembra se CANCELAN para que, si algún día se activa SMTP, no salga ningún mensaje por datos sintéticos.
  const cancelados = (await pool.query(
    `UPDATE notificacion_correos SET estado = 'cancelado', actualizado_en = now(), ultimo_error = 'Cancelado: generado por la siembra de datos sintéticos del piloto'
     WHERE estado IN ('pendiente', 'fallido') AND creado_en >= $1`, [inicioSiembra]
  )).rowCount;
  if (cancelados) console.log(`Correos pendientes generados por la siembra y cancelados: ${cancelados}`);
  const r = (await q(`SELECT (SELECT COUNT(*) FROM usuarios)::int usuarios, (SELECT COUNT(*) FROM proyecto_entregables)::int entregables,
    (SELECT COUNT(*) FROM docente_grupo_matriz WHERE vigente)::int vigentes,
    (SELECT string_agg(estado_revision || ':' || n, ', ' ORDER BY estado_revision) FROM (SELECT estado_revision, COUNT(*) n FROM proyecto_entregables GROUP BY 1) x) estados`))[0];
  console.log(`Listo en «${db}»: ${r.usuarios} usuarios · ${r.entregables} entregables (${r.estados}) · ${r.vigentes} asignaciones vigentes.`);
  console.log(`Cuentas reales registradas: ${admins.length} administrador(es), ${docentesReales.length} docente(s). Las sintéticas (@${DOMINIO_SINTETICO}) no pueden iniciar sesión.`);
}

try {
  await main();
} catch (e) {
  if (!process.exitCode) { console.error(e); process.exitCode = 1; }
} finally {
  await pool.end();
}
