-- FASE 21: bandeja de salida de correos para las notificaciones del sistema.
-- Los triggers mantienen correo y bandeja sincronizados para todos los flujos,
-- incluso si un reporte se actualiza desde una ruta distinta del frontend.

CREATE TABLE IF NOT EXISTS notificacion_correos (
  id                    BIGSERIAL PRIMARY KEY,
  usuario_id            INTEGER NOT NULL
                        REFERENCES usuarios(id) ON DELETE CASCADE,
  clave                 VARCHAR(300) NOT NULL,
  tipo                  VARCHAR(40) NOT NULL,
  destinatario_email    VARCHAR(320) NOT NULL,
  destinatario_nombre   VARCHAR(240),
  asunto                VARCHAR(240) NOT NULL,
  mensaje               TEXT NOT NULL,
  destino               TEXT,
  estado                VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  intentos              INTEGER NOT NULL DEFAULT 0,
  proximo_intento_en    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_error          TEXT,
  proveedor_mensaje_id  TEXT,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_en            TIMESTAMPTZ,
  CONSTRAINT uq_notificacion_correo_usuario_clave UNIQUE (usuario_id, clave),
  CONSTRAINT chk_notificacion_correo_estado CHECK (
    estado IN ('pendiente', 'procesando', 'enviado', 'fallido', 'cancelado')
  ),
  CONSTRAINT chk_notificacion_correo_intentos CHECK (intentos >= 0),
  CONSTRAINT chk_notificacion_correo_destinatario CHECK (
    LENGTH(TRIM(destinatario_email)) > 3
  )
);

CREATE INDEX IF NOT EXISTS idx_notificacion_correos_pendientes
  ON notificacion_correos (proximo_intento_en, creado_en)
  WHERE estado IN ('pendiente', 'fallido', 'procesando');

CREATE INDEX IF NOT EXISTS idx_notificacion_correos_usuario_fecha
  ON notificacion_correos (usuario_id, creado_en DESC);

CREATE OR REPLACE FUNCTION encolar_correo_notificacion(
  p_usuario_id INTEGER,
  p_clave TEXT,
  p_tipo TEXT,
  p_asunto TEXT,
  p_mensaje TEXT,
  p_destino TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notificacion_correos (
    usuario_id,
    clave,
    tipo,
    destinatario_email,
    destinatario_nombre,
    asunto,
    mensaje,
    destino
  )
  SELECT
    u.id,
    LEFT(TRIM(p_clave), 300),
    LEFT(TRIM(p_tipo), 40),
    LOWER(TRIM(u.correo)),
    NULLIF(TRIM(CONCAT_WS(' ', u.nombre, u.apellido)), ''),
    LEFT(TRIM(p_asunto), 240),
    TRIM(p_mensaje),
    NULLIF(TRIM(p_destino), '')
  FROM usuarios u
  WHERE u.id = p_usuario_id
    AND u.estado = 'activo'
    AND NULLIF(TRIM(u.correo), '') IS NOT NULL
  ON CONFLICT (usuario_id, clave) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION trg_encolar_correo_notificacion_persistente()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM encolar_correo_notificacion(
    NEW.usuario_id,
    CONCAT('persistente:', NEW.id),
    NEW.tipo,
    'Nueva notificación de ProySocial',
    NEW.mensaje,
    CASE
      WHEN NEW.referencia_tipo = 'reporte' AND NEW.referencia_id IS NOT NULL
        THEN CONCAT('/docente/historial?reporte=', NEW.referencia_id)
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificacion_persistente_correo ON notificaciones;
CREATE TRIGGER trg_notificacion_persistente_correo
AFTER INSERT ON notificaciones
FOR EACH ROW
EXECUTE FUNCTION trg_encolar_correo_notificacion_persistente();

CREATE OR REPLACE FUNCTION trg_encolar_correo_cambio_reporte()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_docente_id INTEGER;
  v_docente_nombre TEXT;
  v_entregable TEXT;
  v_proyecto TEXT;
  v_evento TIMESTAMPTZ;
  v_comentario TEXT;
  v_admin RECORD;
BEGIN
  SELECT
    COALESCE(NEW.docente_id, p.docente_responsable_id),
    NULLIF(TRIM(CONCAT_WS(' ', u.nombre, u.apellido)), ''),
    COALESCE(NULLIF(TRIM(NEW.actividad_reportada), ''), NULLIF(TRIM(NEW.descripcion), ''), 'Entregable'),
    COALESCE(NULLIF(TRIM(p.titulo), ''), 'Iniciativa')
  INTO v_docente_id, v_docente_nombre, v_entregable, v_proyecto
  FROM proyecto_semanas ps
  INNER JOIN proyectos p ON p.id = ps.proyecto_id
  LEFT JOIN usuarios u ON u.id = COALESCE(NEW.docente_id, p.docente_responsable_id)
  WHERE ps.id = NEW.proyecto_semana_id;

  IF COALESCE(NEW.completado, FALSE)
     AND COALESCE(NEW.estado_revision, 'enviado') = 'enviado'
     AND (
       TG_OP = 'INSERT'
       OR NOT COALESCE(OLD.completado, FALSE)
       OR COALESCE(OLD.estado_revision, '') IS DISTINCT FROM COALESCE(NEW.estado_revision, '')
       OR OLD.fecha_cargue_evidencia IS DISTINCT FROM NEW.fecha_cargue_evidencia
     ) THEN
    v_evento := COALESCE(
      NEW.fecha_cargue_evidencia,
      NEW.fecha_completado::TIMESTAMPTZ,
      CURRENT_TIMESTAMP
    );
    FOR v_admin IN
      SELECT id FROM usuarios
      WHERE rol = 'admin' AND estado = 'activo'
    LOOP
      PERFORM encolar_correo_notificacion(
        v_admin.id,
        CONCAT('nuevo_reporte:', NEW.id, ':', EXTRACT(EPOCH FROM v_evento)::BIGINT),
        'nuevo_reporte',
        'Nuevo entregable pendiente de revisión',
        CONCAT(
          COALESCE(v_docente_nombre, 'Un docente'),
          ' envió el entregable “', v_entregable,
          '” de la iniciativa “', v_proyecto, '”.'
        ),
        CONCAT('/admin/revision?reporte=', NEW.id)
      );
    END LOOP;
  END IF;

  IF NEW.estado_revision IN ('observado', 'aprobado')
     AND (
       TG_OP = 'INSERT'
       OR OLD.estado_revision IS DISTINCT FROM NEW.estado_revision
       OR OLD.revisado_en IS DISTINCT FROM NEW.revisado_en
     ) THEN
    v_evento := COALESCE(NEW.revisado_en, CURRENT_TIMESTAMP);
    v_comentario := NULLIF(TRIM(NEW.comentario_revision), '');
    PERFORM encolar_correo_notificacion(
      v_docente_id,
      CONCAT(
        NEW.estado_revision, ':', NEW.id, ':',
        EXTRACT(EPOCH FROM v_evento)::BIGINT
      ),
      CASE WHEN NEW.estado_revision = 'aprobado' THEN 'aprobado' ELSE 'observacion' END,
      CASE
        WHEN NEW.estado_revision = 'aprobado'
          THEN 'Tu entregable fue aprobado'
        ELSE 'Tu entregable requiere ajustes'
      END,
      CONCAT(
        'El entregable “', v_entregable, '” de la iniciativa “', v_proyecto, '” ',
        CASE
          WHEN NEW.estado_revision = 'aprobado' THEN 'fue aprobado.'
          ELSE CONCAT('tiene observaciones.',
            CASE WHEN v_comentario IS NULL THEN '' ELSE CONCAT(E'\n\nComentario: ', v_comentario) END
          )
        END
      ),
      CONCAT('/docente/historial?reporte=', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proyecto_entregable_correo ON proyecto_entregables;
CREATE TRIGGER trg_proyecto_entregable_correo
AFTER INSERT OR UPDATE OF completado, estado_revision, revisado_en,
  fecha_cargue_evidencia, comentario_revision
ON proyecto_entregables
FOR EACH ROW
EXECUTE FUNCTION trg_encolar_correo_cambio_reporte();

