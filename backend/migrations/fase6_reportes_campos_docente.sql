-- ============================================================
-- FASE 6: Campos reales del formulario de reporte docente
-- ============================================================

ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS actividad_reportada TEXT,
  ADD COLUMN IF NOT EXISTS descripcion_reporte TEXT,
  ADD COLUMN IF NOT EXISTS porcentaje_avance INTEGER;

