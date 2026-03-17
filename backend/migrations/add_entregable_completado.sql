-- Marcar entregables completados (para avance del docente)
-- Ejecutar en la base app_proyecion si no existen las columnas.

ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS completado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_completado DATE;

COMMENT ON COLUMN proyecto_entregables.completado IS 'True cuando el docente registró la entrega';
COMMENT ON COLUMN proyecto_entregables.fecha_completado IS 'Fecha en que se registró la entrega';
