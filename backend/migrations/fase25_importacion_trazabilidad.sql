-- ============================================================
-- FASE 25 (Bloque 2): trazabilidad de ajustes administrativos de la importación
--   semana_original  = semana escrita en el Excel cuando el administrador decidió usar la semana de la fecha
--   numero_original  = número del Excel cuando se renumeró un duplicado por decisión administrativa
-- Las fechas del Excel nunca se alteran (se guardan como offsets del calendario del semestre).
-- Aditiva e idempotente.
-- ============================================================
ALTER TABLE plantilla_entregables
  ADD COLUMN IF NOT EXISTS semana_original INTEGER,
  ADD COLUMN IF NOT EXISTS numero_original INTEGER;
