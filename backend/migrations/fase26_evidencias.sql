-- ============================================================
-- FASE 26 (Bloque 3A/3B): evidencias por entregable con versiones
--   entregable_evidencias: una fila por enlace (varias por entregable), ligada inequívocamente a
--     docente, entregable, iniciativa (proyecto), plantilla y semestre.
--   envio_numero  = ronda de envío en la que se entregó (NULL mientras está en borrador).
--   estado        = vigente | reemplazada (estaba enviada y el docente la cambió) | retirada (nunca se envió).
--   Nunca se borran filas: una corrección deja la versión anterior como «reemplazada».
--   drive_id/tipo_enlace se extraen del enlace; la verificación contra Drive (3C) usa estas columnas.
--   entregable_eventos.detalle: referencia a las evidencias en cada evento del historial.
-- Aditiva e idempotente. No modifica proyecto_entregables.url_evidencia (sigue siendo la copia compatible).
-- ============================================================
CREATE TABLE IF NOT EXISTS entregable_evidencias (
  id BIGSERIAL PRIMARY KEY,
  entregable_id INTEGER NOT NULL REFERENCES proyecto_entregables(id) ON DELETE CASCADE,
  docente_id INTEGER REFERENCES usuarios(id),
  proyecto_id INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  plantilla_id INTEGER REFERENCES plantilla_entregables(id) ON DELETE SET NULL,
  semestre VARCHAR(20),
  url TEXT NOT NULL,
  url_clave TEXT NOT NULL,
  tipo_enlace VARCHAR(20) NOT NULL DEFAULT 'otro',
  drive_id VARCHAR(128),
  titulo VARCHAR(200),
  envio_numero INTEGER,
  estado VARCHAR(12) NOT NULL DEFAULT 'vigente',
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reemplazada_en TIMESTAMPTZ,
  CONSTRAINT entregable_evidencias_estado_check CHECK (estado IN ('vigente', 'reemplazada', 'retirada')),
  CONSTRAINT entregable_evidencias_tipo_check CHECK (tipo_enlace IN ('drive_archivo', 'drive_carpeta', 'google_doc', 'formulario', 'otro'))
);

-- Un mismo enlace no puede estar vigente dos veces en el mismo entregable
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_evidencias_vigente
  ON entregable_evidencias (entregable_id, url_clave) WHERE estado = 'vigente';
CREATE INDEX IF NOT EXISTS idx_entregable_evidencias_entregable ON entregable_evidencias (entregable_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_entregable_evidencias_docente ON entregable_evidencias (docente_id, semestre);
CREATE INDEX IF NOT EXISTS idx_entregable_evidencias_drive ON entregable_evidencias (drive_id) WHERE drive_id IS NOT NULL;

ALTER TABLE entregable_eventos ADD COLUMN IF NOT EXISTS detalle JSONB;
CREATE INDEX IF NOT EXISTS idx_entregable_eventos_entregable ON entregable_eventos (entregable_id, creado_en);
