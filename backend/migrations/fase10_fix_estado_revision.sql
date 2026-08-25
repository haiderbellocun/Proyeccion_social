-- Corrige instalaciones que ejecutaron fase8 conservando la restriccion
-- creada en fase5, la cual no permitia el estado "borrador".
ALTER TABLE proyecto_entregables
  DROP CONSTRAINT IF EXISTS chk_proyecto_entregables_estado_revision,
  DROP CONSTRAINT IF EXISTS proyecto_entregables_estado_revision_check;

ALTER TABLE proyecto_entregables
  ADD CONSTRAINT proyecto_entregables_estado_revision_check
  CHECK (estado_revision IN ('borrador', 'enviado', 'observado', 'aprobado'));
