-- ============================================================
-- FASE 16: integridad del catálogo real de programas y escuelas
-- ============================================================

-- Las restricciones NOT VALID no inventan ni corrigen datos históricos, pero
-- sí impiden que desde ahora se registren catálogos incompletos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_programas_nombre_no_vacio'
  ) THEN
    ALTER TABLE programas
      ADD CONSTRAINT chk_programas_nombre_no_vacio
      CHECK (BTRIM(nombre) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_programas_codigo_no_vacio'
  ) THEN
    ALTER TABLE programas
      ADD CONSTRAINT chk_programas_codigo_no_vacio
      CHECK (codigo IS NOT NULL AND BTRIM(codigo) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_programas_facultad_no_vacia'
  ) THEN
    ALTER TABLE programas
      ADD CONSTRAINT chk_programas_facultad_no_vacia
      CHECK (facultad IS NOT NULL AND BTRIM(facultad) <> '') NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_programas_nombre_normalizado
  ON programas ((LOWER(BTRIM(nombre))));

CREATE UNIQUE INDEX IF NOT EXISTS uq_programas_codigo_normalizado
  ON programas ((UPPER(BTRIM(codigo))))
  WHERE codigo IS NOT NULL;
