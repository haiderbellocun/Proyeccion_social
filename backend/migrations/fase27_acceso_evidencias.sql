-- ============================================================
-- FASE 27 (Bloque 3C/3D): enlaces de Google Hojas/Presentaciones y «no tengo acceso a la evidencia»
--   - tipo_enlace distingue Documentos, Hojas de cálculo y Presentaciones de Google.
--   - proyecto_entregables.problema_acceso_en: instante en que coordinación reportó que no puede abrir
--     la evidencia (el entregable queda «observado» para que el docente corrija los permisos del enlace).
--     Se limpia al reenviar o aprobar; el historial (entregable_eventos, tipo 'sin_acceso') no se borra.
-- Aditiva e idempotente. ProySocial no accede a los archivos: solo administra enlaces y trazabilidad.
-- ============================================================
ALTER TABLE entregable_evidencias DROP CONSTRAINT IF EXISTS entregable_evidencias_tipo_check;
ALTER TABLE entregable_evidencias
  ADD CONSTRAINT entregable_evidencias_tipo_check
  CHECK (tipo_enlace IN ('drive_archivo', 'drive_carpeta', 'google_doc', 'google_hoja', 'google_presentacion', 'formulario', 'otro'));

ALTER TABLE proyecto_entregables ADD COLUMN IF NOT EXISTS problema_acceso_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_proyecto_entregables_problema_acceso ON proyecto_entregables (problema_acceso_en) WHERE problema_acceso_en IS NOT NULL;
