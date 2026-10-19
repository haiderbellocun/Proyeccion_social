// Prepara el entorno de pruebas LOCAL: base proysocial_dev (nueva, aislada) + datos SINTÉTICOS.
//
//   npm run dev:setup           crea la base si no existe, migra y siembra (idempotente)
//   npm run dev:setup -- --reset  elimina y recrea SOLO la base proysocial_dev
//
// Nunca toca app_proyecion ni ninguna otra base. No imprime secretos. Genera backend/.env.dev
// (ignorado por git) con un JWT_SECRET aleatorio solo para este entorno.
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const DEV_DB = "proysocial_dev";
const DOMAIN = "@proysocial.local";
const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, "..");
const reset = process.argv.includes("--reset");

const host = String(process.env.PGHOST || "localhost").toLowerCase();
if (!["localhost", "127.0.0.1", "::1"].includes(host) || process.env.DATABASE_URL || process.env.INSTANCE_CONNECTION_NAME) {
  console.error("Rechazado: el entorno de pruebas solo puede crearse en el servidor PostgreSQL local (sin DATABASE_URL).");
  process.exit(1);
}
const conn = {
  host,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined,
};

// 1) Crear (o recrear) únicamente proysocial_dev
const admin = new pkg.Client({ ...conn, database: "postgres" });
await admin.connect();
const existe = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DEV_DB])).rowCount > 0;
if (existe && reset) {
  await admin.query(`DROP DATABASE ${DEV_DB} WITH (FORCE)`);
  console.log(`Base ${DEV_DB} eliminada (--reset).`);
}
if (!existe || reset) {
  await admin.query(`CREATE DATABASE ${DEV_DB}`);
  console.log(`Base ${DEV_DB} creada.`);
} else {
  console.log(`Base ${DEV_DB} ya existe: se conserva.`);
}
await admin.end();

// 2) Variables solo de este entorno
process.env.PGDATABASE = DEV_DB;
process.env.PGHOST = host;
process.env.DATABASE_URL = "";
process.env.INSTANCE_CONNECTION_NAME = "";

// 3) Migraciones (mismo ejecutor de siempre, apuntando a proysocial_dev)
const mig = spawnSync(process.execPath, ["scripts/migrate.js"], { cwd: backendDir, env: process.env, stdio: "inherit" });
if (mig.status !== 0) process.exit(mig.status ?? 1);

// 4) Siembra sintética
const { pool } = await import("../src/db.js");
const svc = await import("../src/services/matrizService.js");
const wf = await import("../src/services/entregableWorkflowService.js");
const who = (await pool.query("SELECT current_database() d")).rows[0].d;
if (who !== DEV_DB) throw new Error(`Base inesperada: ${who}`);

const hoy = svc.hoyBogota();
const lunes = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return svc.sumarDias(iso, -((d.getUTCDay() + 6) % 7));
};
const inicio = lunes(svc.sumarDias(hoy, -7 * 7)); // el semestre va por la semana 8
const SEM = "2026B";

const yaSembrado = (await pool.query(`SELECT 1 FROM usuarios WHERE correo LIKE $1 LIMIT 1`, [`%${DOMAIN}`])).rowCount > 0;
if (yaSembrado) {
  console.log("Datos sintéticos ya presentes: no se vuelven a sembrar (use --reset para recrear).");
} else {
  await pool.query(`UPDATE semestres SET activo = FALSE WHERE activo = TRUE`);
  await pool.query(
    `INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) VALUES ($1, $2::date, $3::date, 16, TRUE)
     ON CONFLICT (codigo) DO UPDATE SET fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, activo = TRUE`,
    [SEM, inicio, svc.sumarDias(inicio, 16 * 7 - 1)]
  );

  const prog = (await pool.query(
    `INSERT INTO programas (nombre, codigo) VALUES ('DEV Ingeniería de Sistemas', 'DEV-IS') ON CONFLICT (nombre) DO UPDATE SET codigo = EXCLUDED.codigo RETURNING id`
  )).rows[0].id;

  // Grupos de matriz del semestre sintético: copia de grupos existentes (misma plantilla de entregables).
  const clonar = async (origenId) => {
    const g = (await pool.query(`SELECT * FROM grupos_matriz WHERE id = $1`, [origenId])).rows[0];
    if (!g) return null;
    const nuevo = (await pool.query(
      `INSERT INTO grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades,
         num_convenios_nuevos, num_convenios_dinamizados, activo, semestre)
       VALUES ($1, 'Copia sintética para pruebas locales', $2, $3, $4, $5, $6, $7, TRUE, $8) RETURNING id`,
      [`${g.nombre} (DEV ${SEM})`, g.tipo_docente, g.horas_totales, g.num_proyectos, g.num_actividades, g.num_convenios_nuevos, g.num_convenios_dinamizados, SEM]
    )).rows[0].id;
    await pool.query(
      `INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable,
         descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb, enlace_referencia)
       SELECT $1, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas,
              dias_inicio_desde_feb, dias_fin_desde_feb, enlace_referencia
       FROM plantilla_entregables WHERE grupo_id = $2`,
      [nuevo, origenId]
    );
    // El mes de cada entregable sale de las fechas reales del semestre sintético.
    const tpls = (await pool.query(`SELECT id, dias_fin_desde_feb FROM plantilla_entregables WHERE grupo_id = $1`, [nuevo])).rows;
    for (const t of tpls) {
      if (t.dias_fin_desde_feb == null) continue;
      await pool.query(`UPDATE plantilla_entregables SET mes = $1 WHERE id = $2`, [svc.mesDeFecha(svc.sumarDias(inicio, Number(t.dias_fin_desde_feb))), t.id]);
    }
    return nuevo;
  };
  const grupoMaria = await clonar(13);
  const grupoCarlos = await clonar(5);
  const grupoAndres = await clonar(4);

  const mkUser = async (nombre, apellido, slug, rol, grupo) =>
    (await pool.query(
      `INSERT INTO usuarios (nombre, apellido, correo, rol, programa_id, estado, tipo_docente, regional, grupo_matriz_id)
       VALUES ($1, $2, $3, $4, $5, 'activo', 'ANTIGUO', 'Bogotá', $6) RETURNING id, nombre, apellido, correo, rol`,
      [nombre, apellido, `${slug}${DOMAIN}`, rol, prog, grupo]
    )).rows[0];
  const adminU = await mkUser("Admin", "Sistema", "admin", "admin", null);
  const maria = await mkUser("Maria", "Rodriguez", "maria.rodriguez", "docente", grupoMaria);
  const carlos = await mkUser("Carlos", "Mendoza", "carlos.mendoza", "docente", grupoCarlos);
  const andres = await mkUser("Andres", "Torres", "andres.torres", "docente", grupoAndres);
  const laura = await mkUser("Laura", "Gomez", "laura.gomez", "docente", null);
  // Historial de asignaciones (fase28, si está aplicada): los usuarios sintéticos con grupo se registran con el origen técnico
  // «vigente_al_migrar» (mismo backfill conservador de la migración), para que el espejo y el historial no queden desfasados.
  if ((await pool.query(`SELECT to_regclass('docente_grupo_matriz') AS t`)).rows[0].t) await pool.query(`SELECT docente_grupo_matriz_backfill()`);

  const mkIniciativa = async (docente, titulo, tipo) => {
    const p = (await pool.query(
      `INSERT INTO proyectos (titulo, programa_id, docente_responsable_id, tipo, fecha_inicio, fecha_fin_estimada, semanas)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, 16) RETURNING id`,
      [`DEV ${titulo}`, prog, docente.id, tipo, inicio, svc.sumarDias(inicio, 16 * 7 - 1)]
    )).rows[0].id;
    for (let n = 1; n <= 16; n += 1) {
      await pool.query(
        `INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin) VALUES ($1, $2, $3::date, $4::date)`,
        [p, n, svc.sumarDias(inicio, (n - 1) * 7), svc.sumarDias(inicio, (n - 1) * 7 + 6)]
      );
    }
    return p;
  };
  for (const [d, lista] of [
    [maria, [["Proyecto Alfabetización digital", "proyecto"], ["Proyecto Emprendimiento rural", "proyecto"], ["Actividad Feria de servicios", "actividad"], ["Convenio Alcaldía local", "convenio"], ["Capacitación docentes", "capacitacion"]]],
    [carlos, [["Proyecto Salud comunitaria", "proyecto"], ["Actividad Jornada ambiental", "actividad"], ["Capacitación docentes", "capacitacion"]]],
    [andres, [["Proyecto Educación financiera", "proyecto"], ["Capacitación docentes", "capacitacion"]]],
  ]) {
    for (const [t, tipo] of lista) await mkIniciativa(d, `${t} (${d.nombre})`, tipo);
  }

  // Reportes sintéticos generados con el flujo real (envío, revisión del administrador).
  const DRIVE = "https://drive.google.com/file/d/DEV-EJEMPLO/view";
  const enviar = async (docente, plantillaId) => {
    const base = { docenteId: docente.id, plantillaId, completado: true, datos: { url_evidencia: [DRIVE] } };
    try {
      return await wf.registrarDesdeMatriz(pool, base);
    } catch (e) {
      if (e.codigo === "INICIATIVA_AMBIGUA") return wf.registrarDesdeMatriz(pool, { ...base, proyectoId: e.extra.candidatos[0].id });
      if (e.codigo === "SIN_INICIATIVA") return null;
      throw e;
    }
  };
  const plan = async (docente, { aprobados, observados, enviados, borradores }) => {
    const [entry] = await svc.loadMatrixForDocentes(pool, { docenteId: docente.id, hoy });
    const vencidas = entry.items.filter((i) => i.fecha_fin && i.fecha_fin < hoy);
    let k = 0;
    const tomar = (n) => vencidas.slice(k, (k += n));
    for (const it of tomar(aprobados)) {
      const r = await enviar(docente, it.id);
      if (r?.entregable_id) await wf.aplicarRevisionAdmin(pool, { entregableId: r.entregable_id, estadoNuevo: "aprobado", actorId: adminU.id });
    }
    for (const it of tomar(observados)) {
      const r = await enviar(docente, it.id);
      if (r?.entregable_id) await wf.aplicarRevisionAdmin(pool, { entregableId: r.entregable_id, estadoNuevo: "observado", comentario: "Falta la firma del actor externo (observación de ejemplo).", actorId: adminU.id });
    }
    for (const it of tomar(enviados)) await enviar(docente, it.id);
    for (const it of tomar(borradores)) {
      try {
        await wf.registrarDesdeMatriz(pool, { docenteId: docente.id, plantillaId: it.id, completado: false });
      } catch (e) {
        if (e.codigo === "INICIATIVA_AMBIGUA") await wf.registrarDesdeMatriz(pool, { docenteId: docente.id, plantillaId: it.id, completado: false, proyectoId: e.extra.candidatos[0].id });
      }
    }
  };
  await plan(maria, { aprobados: 14, observados: 3, enviados: 4, borradores: 2 });
  await plan(carlos, { aprobados: 6, observados: 1, enviados: 5, borradores: 0 });
  // Andrés y Laura no tienen reportes: Andrés queda con entregables vencidos (riesgo), Laura sin matriz.

  console.log("Datos sintéticos sembrados (usuarios @proysocial.local, semestre " + SEM + ", semana 8).");
}
await pool.end();

// 5) Variables de este entorno (ignoradas por git)
const envPath = path.join(backendDir, ".env.dev");
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    [
      "# Entorno de PRUEBAS LOCAL (generado por npm run dev:setup). No usar en producción. Ignorado por git.",
      "NODE_ENV=development",
      "PORT=4000",
      `PGHOST=${host}`,
      `PGPORT=${conn.port}`,
      `PGDATABASE=${DEV_DB}`,
      "DATABASE_URL=",
      "INSTANCE_CONNECTION_NAME=",
      `JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`,
      "DEV_LOGIN_ENABLED=true",
      `DEV_LOGIN_EMAILS=admin${DOMAIN},maria.rodriguez${DOMAIN},carlos.mendoza${DOMAIN},andres.torres${DOMAIN},laura.gomez${DOMAIN}`,
      "ALLOWED_ORIGIN=http://localhost:5173",
      "EMAIL_ENABLED=false",
      "SMTP_HOST=",
      "",
    ].join("\n")
  );
  console.log("Creado backend/.env.dev (sin credenciales de base de datos: usa las de backend/.env).");
}
console.log("Listo. Inicie el backend de pruebas con: npm run dev:local");
