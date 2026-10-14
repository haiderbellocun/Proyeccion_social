-- ============================================================
-- FASE 24 (Bloque 2): marca explícita de entregables transversales
-- Aditiva e idempotente.
-- ============================================================

-- Entregables transversales (capacitación, presupuesto, varios): no pertenecen a una iniciativa concreta.
-- proyecto_semana_id es obligatorio por el modelo histórico, así que el reporte se apoya en una iniciativa del
-- docente; esta marca deja explícito que ese vínculo es solo de soporte y no una relación con el proyecto.
ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS transversal BOOLEAN NOT NULL DEFAULT FALSE;
