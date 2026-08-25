-- fase18: escuelas como entidad propia
-- Antes: programas.facultad (texto libre) era un atajo del esquema inicial.
-- Correcto: escuelas (1) → programas (N) vía escuela_id.

CREATE TABLE IF NOT EXISTS escuelas (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(200) NOT NULL,
  codigo     VARCHAR(50),
  creado_en  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_escuelas_nombre_no_vacio CHECK (btrim(nombre) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_escuelas_nombre_normalizado
  ON escuelas (lower(btrim(nombre)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_escuelas_codigo_normalizado
  ON escuelas (upper(btrim(codigo)))
  WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

-- Migrar textos distintos de facultad → escuelas
INSERT INTO escuelas (nombre)
SELECT DISTINCT btrim(facultad)
FROM programas
WHERE facultad IS NOT NULL
  AND btrim(facultad) <> ''
  AND lower(btrim(facultad)) <> 'sin escuela'
ON CONFLICT DO NOTHING;

-- Por si no hay índice ON CONFLICT en nombre aún en installs viejos:
INSERT INTO escuelas (nombre)
SELECT DISTINCT btrim(p.facultad)
FROM programas p
WHERE p.facultad IS NOT NULL
  AND btrim(p.facultad) <> ''
  AND lower(btrim(p.facultad)) <> 'sin escuela'
  AND NOT EXISTS (
    SELECT 1 FROM escuelas e
    WHERE lower(btrim(e.nombre)) = lower(btrim(p.facultad))
  );

ALTER TABLE programas
  ADD COLUMN IF NOT EXISTS escuela_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programas_escuela_id_fkey'
  ) THEN
    ALTER TABLE programas
      ADD CONSTRAINT programas_escuela_id_fkey
      FOREIGN KEY (escuela_id) REFERENCES escuelas(id) ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE programas p
SET escuela_id = e.id
FROM escuelas e
WHERE p.escuela_id IS NULL
  AND p.facultad IS NOT NULL
  AND lower(btrim(p.facultad)) = lower(btrim(e.nombre));

CREATE INDEX IF NOT EXISTS idx_programas_escuela ON programas (escuela_id);

ALTER TABLE programas DROP CONSTRAINT IF EXISTS chk_programas_facultad_no_vacia;
ALTER TABLE programas DROP COLUMN IF EXISTS facultad;
