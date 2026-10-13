-- ============================================================
-- FASE 10 (Bloque 1): Lógica de seguimiento
--   - Calendario institucional por semestre (zona America/Bogota)
--   - Relación explícita entregable <-> plantilla de la matriz
--   - Fechas reales de primer envío / reenvíos / aprobación
--   - Excepciones justificadas de evidencia
--   - Tipo de evidencia exigida por plantilla
--   - Historial mínimo de eventos de cada entregable
--
-- 100 % ADITIVA: solo CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- y un backfill que únicamente rellena columnas NUEVAS que están vacías.
-- No borra ni modifica datos existentes. Se puede ejecutar más de una vez.
-- Ejecutar en pgAdmin sobre la base app_proyecion ANTES de desplegar el backend.
-- ============================================================

-- 1) Calendario institucional ---------------------------------
CREATE TABLE IF NOT EXISTS calendario_semestres (
  semestre      VARCHAR(10) PRIMARY KEY,           -- '2026A', '2026B', ...
  fecha_inicio  DATE        NOT NULL,              -- primer día de la semana 1
  num_semanas   INTEGER     NOT NULL CHECK (num_semanas BETWEEN 1 AND 52),
  zona_horaria  TEXT        NOT NULL DEFAULT 'America/Bogota',
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semestre vigente en los datos actuales (inicio usado hasta hoy por el código: 2026-02-10).
-- Ajustar num_semanas si el calendario institucional define otro valor.
INSERT INTO calendario_semestres (semestre, fecha_inicio, num_semanas)
VALUES ('2026A', DATE '2026-02-10', 16)
ON CONFLICT (semestre) DO NOTHING;

-- Para cada semestre ya usado por grupos_matriz y sin calendario, NO se inventa una fecha:
-- el backend usa un valor por defecto (2026-02-10 / 16 semanas) y lo marca como "calendario_por_defecto".
-- Cargar el calendario real así:
--   INSERT INTO calendario_semestres (semestre, fecha_inicio, num_semanas) VALUES ('2026B', DATE '2026-08-03', 16);

-- 2) Relación explícita con la plantilla + trazabilidad de fechas
ALTER TABLE proyecto_entregables
  ADD COLUMN IF NOT EXISTS plantilla_id         INTEGER REFERENCES plantilla_entregables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_primer_envio   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_ultimo_envio   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS num_envios           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aprobado_en          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidencia_exenta     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS justificacion_exencion TEXT;

CREATE INDEX IF NOT EXISTS idx_proyecto_entregables_plantilla
  ON proyecto_entregables(plantilla_id);

-- Un mismo entregable de plantilla no puede registrarse dos veces en la misma semana de la misma iniciativa
-- (evita duplicados por doble clic / reintentos). Las filas históricas tienen plantilla_id NULL y no se ven afectadas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proyecto_entregables_plantilla_semana
  ON proyecto_entregables(plantilla_id, proyecto_semana_id)
  WHERE plantilla_id IS NOT NULL;

-- Backfill SOLO de columnas nuevas vacías, para registros históricos ya enviados.
UPDATE proyecto_entregables
SET num_envios = 1,
    fecha_primer_envio = COALESCE(
      (fecha_real_entrega::timestamp AT TIME ZONE 'America/Bogota'),
      (fecha_completado::timestamp   AT TIME ZONE 'America/Bogota')
    ),
    fecha_ultimo_envio = COALESCE(
      (fecha_real_entrega::timestamp AT TIME ZONE 'America/Bogota'),
      (fecha_completado::timestamp   AT TIME ZONE 'America/Bogota')
    )
WHERE COALESCE(completado, FALSE) = TRUE
  AND num_envios = 0
  AND fecha_primer_envio IS NULL;

UPDATE proyecto_entregables
SET aprobado_en = revisado_en
WHERE estado_revision = 'aprobado'
  AND aprobado_en IS NULL
  AND revisado_en IS NOT NULL;

-- 3) Evidencia exigida por plantilla (NULL = se infiere del texto, compatible con lo histórico)
ALTER TABLE plantilla_entregables
  ADD COLUMN IF NOT EXISTS tipo_evidencia     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS requiere_evidencia BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_plantilla_tipo_evidencia') THEN
    ALTER TABLE plantilla_entregables
      ADD CONSTRAINT chk_plantilla_tipo_evidencia
      CHECK (tipo_evidencia IS NULL OR tipo_evidencia IN ('drive', 'formulario', 'enlace', 'ninguna'));
  END IF;
END $$;

COMMENT ON COLUMN plantilla_entregables.tipo_evidencia IS
  'drive = enlace a Google Drive/Docs; formulario = formulario institucional; enlace = cualquier URL http(s); ninguna = no requiere evidencia. NULL = inferir.';

-- 4) Historial de eventos del entregable (primer envío, reenvíos, observaciones, aprobación, reaperturas)
CREATE TABLE IF NOT EXISTS entregable_eventos (
  id               BIGSERIAL PRIMARY KEY,
  entregable_id    INTEGER NOT NULL REFERENCES proyecto_entregables(id) ON DELETE CASCADE,
  tipo             VARCHAR(30) NOT NULL,   -- borrador, envio, reenvio, retiro, observacion, aprobacion, reapertura
  estado_anterior  VARCHAR(20),
  estado_nuevo     VARCHAR(20),
  actor_id         INTEGER,
  comentario       TEXT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entregable_eventos_entregable
  ON entregable_eventos(entregable_id, creado_en);
