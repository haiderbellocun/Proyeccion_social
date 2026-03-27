-- ============================================================
-- FASE 5: Columnas de revisión para reportes de docentes
-- Fuente: flujo docente -> admin (Revisión de Reportes)
-- ============================================================

-- Estado de revisión del entregable reportado por el docente
ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS estado_revision TEXT DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS comentario_revision TEXT,
  ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMP;

-- Validación de valores permitidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_proyecto_entregables_estado_revision'
  ) THEN
    ALTER TABLE proyecto_entregables
      ADD CONSTRAINT chk_proyecto_entregables_estado_revision
      CHECK (estado_revision IN ('enviado', 'observado', 'aprobado'));
  END IF;
END $$;

