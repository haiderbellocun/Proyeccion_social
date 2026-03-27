-- FASE 4A: Separar Convenios Nuevos vs Convenios Dinamizados
-- Objetivo: reemplazar num_convenios por:
--   - num_convenios_nuevos
--   - num_convenios_dinamizados

ALTER TABLE perfiles_indicador
  ADD COLUMN IF NOT EXISTS num_convenios_nuevos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_convenios_dinamizados INTEGER NOT NULL DEFAULT 0;

-- Migrar datos existentes: lo previo se considera "nuevos" por compatibilidad
UPDATE perfiles_indicador
SET num_convenios_nuevos = COALESCE(num_convenios, 0)
WHERE num_convenios_nuevos = 0;

-- Eliminar columna antigua (si aún existe)
ALTER TABLE perfiles_indicador
  DROP COLUMN IF EXISTS num_convenios;

