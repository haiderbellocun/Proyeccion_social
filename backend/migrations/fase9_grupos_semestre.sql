-- Grupos matriz por semestre (2026A, 2026B, …)
ALTER TABLE grupos_matriz
  ADD COLUMN IF NOT EXISTS semestre VARCHAR(10) DEFAULT '2026A';

UPDATE grupos_matriz SET semestre = '2026A' WHERE semestre IS NULL;

ALTER TABLE grupos_matriz
  ALTER COLUMN semestre SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grupos_matriz_semestre
  ON grupos_matriz(semestre);
