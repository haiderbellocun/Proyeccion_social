-- FASE 19: operación de entregables solicitada en la revisión del 29/07/2026
-- - Recurso/enlace administrado desde la plantilla
-- - Fecha y hora de cargue registrada por el servidor
-- - Excepciones individuales por docente sin alterar el grupo matriz
-- - Auditoría de actualizaciones masivas de evidencias

ALTER TABLE plantilla_entregables
  ADD COLUMN IF NOT EXISTS enlace_referencia TEXT;

ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS fecha_cargue_evidencia TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS docente_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proyecto_entregables_docente_id_fkey'
  ) THEN
    ALTER TABLE proyecto_entregables
      ADD CONSTRAINT proyecto_entregables_docente_id_fkey
      FOREIGN KEY (docente_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Los reportes históricos pertenecían implícitamente al responsable de la
-- iniciativa. Desde esta fase la pertenencia queda explícita por docente.
UPDATE proyecto_entregables e
SET docente_id = p.docente_responsable_id
FROM proyecto_semanas ps
INNER JOIN proyectos p ON p.id = ps.proyecto_id
WHERE ps.id = e.proyecto_semana_id
  AND e.docente_id IS NULL
  AND (
    e.plantilla_id IS NOT NULL
    OR COALESCE(e.completado, false) = true
    OR e.descripcion_reporte IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_proyecto_entregables_docente_plantilla
  ON proyecto_entregables (docente_id, plantilla_id)
  WHERE docente_id IS NOT NULL AND plantilla_id IS NOT NULL;

-- Conserva una marca temporal razonable para reportes históricos. Los nuevos
-- reportes reciben el instante exacto desde el backend al momento de enviarse.
UPDATE proyecto_entregables
SET fecha_cargue_evidencia = COALESCE(
  fecha_completado::timestamp AT TIME ZONE 'America/Bogota',
  creado_en::timestamp AT TIME ZONE 'America/Bogota'
)
WHERE COALESCE(completado, false) = true
  AND fecha_cargue_evidencia IS NULL;

CREATE TABLE IF NOT EXISTS docente_entregable_excepciones (
  id                              BIGSERIAL PRIMARY KEY,
  docente_id                      INTEGER NOT NULL
                                  REFERENCES usuarios(id) ON DELETE CASCADE,
  plantilla_id                    INTEGER NOT NULL
                                  REFERENCES plantilla_entregables(id) ON DELETE CASCADE,
  entregable_override             TEXT,
  descripcion_evidencia_override  TEXT,
  enlace_referencia_override      TEXT,
  fecha_inicio_override           DATE,
  fecha_fin_override              DATE,
  proyecto_id                     INTEGER
                                  REFERENCES proyectos(id) ON DELETE SET NULL,
  motivo                          TEXT NOT NULL,
  creado_por                      INTEGER
                                  REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en                       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_docente_entregable_excepcion
    UNIQUE (docente_id, plantilla_id),
  CONSTRAINT chk_docente_entregable_excepcion_fechas
    CHECK (
      fecha_inicio_override IS NULL
      OR fecha_fin_override IS NULL
      OR fecha_fin_override >= fecha_inicio_override
    )
);

CREATE INDEX IF NOT EXISTS idx_docente_entregable_excepciones_docente
  ON docente_entregable_excepciones (docente_id);

CREATE INDEX IF NOT EXISTS idx_docente_entregable_excepciones_plantilla
  ON docente_entregable_excepciones (plantilla_id);

CREATE TABLE IF NOT EXISTS actualizaciones_masivas_entregables (
  id                    BIGSERIAL PRIMARY KEY,
  semestre              VARCHAR(20) NOT NULL,
  entregable_clave      TEXT NOT NULL,
  descripcion_evidencia TEXT,
  enlace_referencia     TEXT,
  plantillas_afectadas  INTEGER NOT NULL,
  grupos_afectados      INTEGER NOT NULL,
  creado_por            INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
