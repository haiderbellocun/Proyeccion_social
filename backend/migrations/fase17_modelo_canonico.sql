-- fase17: modelo canónico para producción
-- - Fuente de verdad de carga docente: grupos_matriz + plantilla_entregables
-- - Vínculo fuerte matriz ↔ reporte: proyecto_entregables.plantilla_id
-- - Retiro del modelo paralelo perfiles_indicador / catalogo_entregables
-- - Checks de estado en proyectos

-- 1) Vínculo formal plantilla → entregable
ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS plantilla_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proyecto_entregables_plantilla_id_fkey'
  ) THEN
    ALTER TABLE proyecto_entregables
      ADD CONSTRAINT proyecto_entregables_plantilla_id_fkey
      FOREIGN KEY (plantilla_id)
      REFERENCES plantilla_entregables(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proyecto_entregables_plantilla
  ON proyecto_entregables (plantilla_id)
  WHERE plantilla_id IS NOT NULL;

-- Backfill por texto + semana (solo filas legacy sin plantilla_id)
UPDATE proyecto_entregables pe
SET plantilla_id = matched.tpl_id
FROM (
  SELECT DISTINCT ON (e.id)
    e.id AS entregable_id,
    tpl.id AS tpl_id
  FROM proyecto_entregables e
  INNER JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
  INNER JOIN proyectos p ON p.id = s.proyecto_id
  INNER JOIN usuarios u
    ON u.rol = 'docente'
   AND (
     p.docente_responsable_id = u.id
     OR EXISTS (
       SELECT 1 FROM proyecto_docentes pd
       WHERE pd.proyecto_id = p.id AND pd.docente_id = u.id
     )
   )
  INNER JOIN plantilla_entregables tpl
    ON tpl.grupo_id = u.grupo_matriz_id
   AND tpl.semana_numero = s.numero
   AND (
     TRIM(e.descripcion) = TRIM(tpl.entregable)
     OR TRIM(COALESCE(e.actividad_reportada, '')) = TRIM(tpl.entregable)
   )
  WHERE e.plantilla_id IS NULL
  ORDER BY e.id, tpl.id
) matched
WHERE pe.id = matched.entregable_id
  AND pe.plantilla_id IS NULL;

-- 2) Estado de proyectos acotado
UPDATE proyectos
SET estado = 'en_ejecucion'
WHERE estado IS NULL
   OR TRIM(estado) = ''
   OR LOWER(TRIM(estado)) NOT IN ('en_ejecucion', 'finalizado', 'suspendido');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_proyectos_estado'
  ) THEN
    ALTER TABLE proyectos
      ADD CONSTRAINT chk_proyectos_estado
      CHECK (estado IN ('en_ejecucion', 'finalizado', 'suspendido'));
  END IF;
END $$;

-- 3) Retirar modelo paralelo de indicadores / catálogo genérico
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_indicador_id_fkey;
DROP INDEX IF EXISTS idx_usuarios_perfil_indicador;
ALTER TABLE usuarios DROP COLUMN IF EXISTS perfil_indicador_id;

DROP TABLE IF EXISTS programa_perfil_indicador;
DROP TABLE IF EXISTS perfiles_indicador;
DROP TABLE IF EXISTS catalogo_entregables;
