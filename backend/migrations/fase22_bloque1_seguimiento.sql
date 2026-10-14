-- ============================================================
-- FASE 22 (Bloque 1): seguimiento — estados, evidencias e historial
--
-- Solo agrega lo que NO existe en el modelo canónico (fases 17-19):
--   * proyecto_entregables.plantilla_id / docente_id  -> ya existen (fase17 / fase19)
--   * semestres (inicio, fin, número de semanas)       -> ya existe (fase13); es el calendario institucional
--   * fecha_cargue_evidencia (instante del último envío) -> ya existe (fase19)
-- Aditiva e idempotente: sin DROP ni DELETE; el backfill solo rellena
-- columnas NUEVAS vacías de registros ya reportados/aprobados.
-- ============================================================

-- 1) Trazabilidad de envíos y aprobación
ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS fecha_primer_envio     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS num_envios             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprobado_en            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidencia_exenta       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS justificacion_exencion TEXT;

UPDATE proyecto_entregables
SET num_envios = 1,
    fecha_primer_envio = COALESCE(
      fecha_cargue_evidencia,
      fecha_completado::timestamp AT TIME ZONE 'America/Bogota',
      fecha_real_entrega::timestamp AT TIME ZONE 'America/Bogota'
    )
WHERE COALESCE(completado, FALSE) = TRUE
  AND num_envios = 0
  AND fecha_primer_envio IS NULL;

UPDATE proyecto_entregables
SET aprobado_en = revisado_en
WHERE estado_revision = 'aprobado'
  AND aprobado_en IS NULL
  AND revisado_en IS NOT NULL;

-- 2) Evidencia exigida por plantilla (NULL = se infiere del texto histórico, compatible con lo existente)
ALTER TABLE plantilla_entregables
  ADD COLUMN IF NOT EXISTS tipo_evidencia     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS requiere_evidencia BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_plantilla_tipo_evidencia') THEN
    ALTER TABLE plantilla_entregables
      ADD CONSTRAINT chk_plantilla_tipo_evidencia
      CHECK (tipo_evidencia IS NULL OR tipo_evidencia IN ('drive', 'formulario', 'enlace', 'ninguna'));
  END IF;
END $$;

-- 3) Historial de eventos (primer envío, reenvíos, observaciones, aprobación, reaperturas).
--    No usa ON DELETE CASCADE contra el entregable: el historial sobrevive aunque el
--    entregable se retire del cronograma (se conserva la referencia como dato).
CREATE TABLE IF NOT EXISTS entregable_eventos (
  id               BIGSERIAL PRIMARY KEY,
  entregable_id    INTEGER,
  docente_id       INTEGER,
  plantilla_id     INTEGER,
  tipo             VARCHAR(30) NOT NULL,
  estado_anterior  VARCHAR(20),
  estado_nuevo     VARCHAR(20),
  actor_id         INTEGER,
  comentario       TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entregable_eventos_entregable
  ON entregable_eventos (entregable_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_entregable_eventos_docente_plantilla
  ON entregable_eventos (docente_id, plantilla_id);

-- 4) Un reporte por (docente, plantilla): evita duplicados por doble clic o reintentos.
--    Solo se crea si los datos existentes no tienen duplicados; de lo contrario se avisa
--    y la aplicación sigue protegiéndose con bloqueo transaccional (no se borra nada).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_proyecto_entregables_docente_plantilla') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM proyecto_entregables
    WHERE docente_id IS NOT NULL AND plantilla_id IS NOT NULL
    GROUP BY docente_id, plantilla_id HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'fase22: existen reportes duplicados (docente, plantilla); no se creó el índice único. Depurar manualmente y volver a ejecutar.';
  ELSE
    CREATE UNIQUE INDEX uq_proyecto_entregables_docente_plantilla
      ON proyecto_entregables (docente_id, plantilla_id)
      WHERE docente_id IS NOT NULL AND plantilla_id IS NOT NULL;
  END IF;
END $$;
