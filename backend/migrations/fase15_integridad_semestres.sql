-- Cada grupo de matriz debe pertenecer a un calendario real y no puede
-- duplicarse por nombre dentro del mismo semestre.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_grupos_matriz_semestre'
      AND conrelid = 'grupos_matriz'::regclass
  ) THEN
    ALTER TABLE grupos_matriz
      ADD CONSTRAINT fk_grupos_matriz_semestre
      FOREIGN KEY (semestre)
      REFERENCES semestres(codigo)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grupos_matriz_semestre_nombre
  ON grupos_matriz (semestre, LOWER(TRIM(nombre)));

