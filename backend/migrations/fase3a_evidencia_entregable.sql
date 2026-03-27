ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS url_evidencia TEXT,
  ADD COLUMN IF NOT EXISTS fecha_real_entrega DATE;

