-- Permite guardar entregables en estado borrador antes de enviar
ALTER TABLE proyecto_entregables
  DROP CONSTRAINT IF EXISTS proyecto_entregables_estado_revision_check;
ALTER TABLE proyecto_entregables
  ADD CONSTRAINT proyecto_entregables_estado_revision_check
  CHECK (estado_revision IN ('borrador', 'enviado', 'observado', 'aprobado'));
