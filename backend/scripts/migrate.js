import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const migrationFiles = [
  "fase1_esquema_base.sql",
  "fase2_indicadores.sql",
  "fase2b_perfil_por_docente.sql",
  "fase2c_catalogo_sin_duplicados.sql",
  "fase3a_evidencia_entregable.sql",
  "add_entregable_completado.sql",
  "fase4_convenios_split.sql",
  "fase4_matriz_grupos_plantillas.sql",
  "fase4_seed_grupos_plantillas.sql",
  "fase5_reportes_revision.sql",
  "fase6_reportes_campos_docente.sql",
  "fase7_grupo7.sql",
  "fase7_grupo7_plantillas.sql",
  "fase7_fix_grupos_2_6_13.sql",
  "fase7_fix_grupo2_completo.sql",
  "fase7_grupo15_plantillas_completas.sql",
  "fase8_borrador_estado.sql",
  "fase9_grupos_semestre.sql",
  "fase10_fix_estado_revision.sql",
  "fase13_google_auth_sin_password.sql",
  "fase14_notificaciones.sql",
  "fase15_integridad_semestres.sql",
  "fase16_integridad_programas.sql",
  "fase17_modelo_canonico.sql",
  "fase18_escuelas.sql",
  "fase19_entregables_operativos.sql",
  "fase20_notificaciones_interactivas.sql",
  "fase21_correos_notificaciones.sql",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../migrations");

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre TEXT PRIMARY KEY,
      aplicado_en TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of migrationFiles) {
    const applied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE nombre = $1",
      [file]
    );
    if (applied.rowCount > 0) {
      console.log(`Omitida: ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (nombre) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`Aplicada: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Falló la migración ${file}: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(() => {
    console.log("Migraciones completadas.");
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
