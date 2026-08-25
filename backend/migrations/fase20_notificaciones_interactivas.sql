-- FASE 20: navegación y lectura persistente de notificaciones dinámicas.
-- Las notificaciones calculadas (vencimientos, revisiones e inactividad) no
-- existen como filas propias, por lo que su lectura se registra mediante una
-- clave estable que identifica el evento mostrado a cada usuario.

CREATE TABLE IF NOT EXISTS notificacion_lecturas (
  usuario_id      INTEGER NOT NULL
                  REFERENCES usuarios(id) ON DELETE CASCADE,
  clave           VARCHAR(300) NOT NULL,
  tipo            VARCHAR(40) NOT NULL,
  referencia_id   BIGINT,
  leida_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_notificacion_lecturas_usuario_fecha
  ON notificacion_lecturas (usuario_id, leida_en DESC);

