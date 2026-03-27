ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS perfil_indicador_id INTEGER
  REFERENCES perfiles_indicador(id) ON DELETE SET NULL;

-- La tabla programa_perfil_indicador ya no se usará pero se deja sin borrar
-- para no perder datos existentes.

