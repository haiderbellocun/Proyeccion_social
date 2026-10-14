-- ============================================================
-- FASE 23 (Bloque 2): importación de matrices desde Excel
--   * importaciones_matriz: un registro por lote CONFIRMADO (quién, cuándo, de qué archivo, resumen).
--     Las validaciones previas (modo simulación) no escriben nada.
--   * plantilla_entregables: trazabilidad del origen (lote, hoja y fila del Excel).
-- Aditiva e idempotente; no modifica ni borra datos existentes. Requiere gen_random_uuid() (PostgreSQL 13+).
-- No se guardan datos personales del archivo (ni nombre del docente ni enlaces de Drive): solo el hash del
-- archivo, el índice de la hoja y contadores/decisiones.
-- ============================================================

CREATE TABLE IF NOT EXISTS importaciones_matriz (
  id              SERIAL PRIMARY KEY,
  lote            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  archivo_nombre  TEXT,
  archivo_sha256  CHAR(64) NOT NULL,
  hoja_indice     INTEGER NOT NULL,
  tipo_hoja       VARCHAR(20),
  semestre        VARCHAR(10) REFERENCES semestres(codigo) ON DELETE RESTRICT,
  grupo_id        INTEGER REFERENCES grupos_matriz(id) ON DELETE SET NULL,
  modo            VARCHAR(20) NOT NULL CHECK (modo IN ('nuevo_grupo', 'grupo_existente')),
  decisiones      JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumen         JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_importaciones_matriz_grupo ON importaciones_matriz (grupo_id);
CREATE INDEX IF NOT EXISTS idx_importaciones_matriz_creado ON importaciones_matriz (creado_en DESC);

ALTER TABLE plantilla_entregables
  ADD COLUMN IF NOT EXISTS importacion_id      INTEGER REFERENCES importaciones_matriz(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen_hoja_indice  INTEGER,
  ADD COLUMN IF NOT EXISTS origen_fila         INTEGER;

CREATE INDEX IF NOT EXISTS idx_plantilla_entregables_importacion
  ON plantilla_entregables (importacion_id) WHERE importacion_id IS NOT NULL;
