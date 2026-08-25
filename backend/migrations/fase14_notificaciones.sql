-- Mensajes persistentes enviados por administradores a usuarios.
CREATE TABLE IF NOT EXISTS notificaciones (
  id                  BIGSERIAL PRIMARY KEY,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_por_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo                VARCHAR(40) NOT NULL DEFAULT 'mensaje_admin',
  mensaje             TEXT NOT NULL CHECK (LENGTH(TRIM(mensaje)) > 0),
  referencia_tipo     VARCHAR(40),
  referencia_id       INTEGER,
  leida               BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha
  ON notificaciones (usuario_id, creado_en DESC);
