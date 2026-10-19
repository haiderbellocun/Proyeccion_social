-- ============================================================
-- FASE 28 (Bloque 3B, Fase A): historial de asignaciones docente–grupo (AL-01)
--   - docente_grupo_matriz: una fila por asignación (modelo de VIGENCIAS). Un docente puede tener varias filas históricas, incluso
--     dentro de un mismo semestre, pero a lo sumo UNA vigente. Las fechas desconocidas (NULL) solo se aceptan en filas heredadas
--     del backfill, justificadas por su origen y su evidencia.
--   - docente_grupo_matriz_incidencias: conflictos y casos no reconstruibles detectados por el backfill (NO se resuelven solos).
--   - docente_grupo_matriz_backfill(): backfill conservador e idempotente, SOLO con evidencia verificable (grupo vigente, reportes y
--     excepciones individuales: el código solo permite crearlos si el docente pertenecía al grupo). Nunca asigna por fechas,
--     nombres ni semestre.
-- Aditiva e idempotente; no elimina ni modifica datos existentes. `usuarios.grupo_matriz_id` conserva su significado (grupo vigente)
-- y SIGUE siendo la fuente que usa la aplicación: en esta fase ningún endpoint lee ni escribe la tabla nueva.
-- Reversión (manual, antes de que el código la use):  ver el bloque «REVERSIÓN» al final de este archivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS docente_grupo_matriz (
  id            BIGSERIAL PRIMARY KEY,
  -- CASCADE solo para conservar el comportamiento actual de DELETE /admin/usuarios (un docente sin historia puede eliminarse; sus
  -- filas desaparecen con él, igual que sus excepciones). Con historia real (reportes) la eliminación ya la bloquea el backend.
  docente_id    INT  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  grupo_id      INT  NOT NULL REFERENCES grupos_matriz(id),
  vigente       BOOLEAN NOT NULL DEFAULT false,
  desde         TIMESTAMPTZ NULL,
  hasta         TIMESTAMPTZ NULL,
  origen        TEXT NOT NULL,
  certeza       TEXT NOT NULL,
  evidencia     JSONB NULL,
  creado_por    INT  NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_por   INT  NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  cerrado_en    TIMESTAMPTZ NULL,
  motivo_cierre TEXT NULL,
  CONSTRAINT dgm_origen_valido CHECK (origen IN ('vigente_al_migrar', 'evidencia_reportes', 'evidencia_excepciones', 'asignacion_admin', 'importacion')),
  CONSTRAINT dgm_certeza_valida CHECK (certeza IN ('alta', 'media', 'registrada')),
  -- «registrada» = la hizo la aplicación (autor y fecha conocidos); «alta/media» = deducida por evidencia en el backfill.
  CONSTRAINT dgm_certeza_coherente CHECK ((origen IN ('asignacion_admin', 'importacion')) = (certeza = 'registrada')),
  CONSTRAINT dgm_vigente_sin_hasta CHECK (NOT vigente OR hasta IS NULL),
  CONSTRAINT dgm_periodo_valido CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde),
  -- Fechas desconocidas únicamente en registros heredados: lo creado por la aplicación debe traer inicio y, si está cerrado, fin.
  CONSTRAINT dgm_fechas_heredadas CHECK (origen IN ('vigente_al_migrar', 'evidencia_reportes', 'evidencia_excepciones') OR (desde IS NOT NULL AND (vigente OR hasta IS NOT NULL))),
  -- La evidencia histórica nunca es una asignación vigente.
  CONSTRAINT dgm_evidencia_no_vigente CHECK (origen NOT IN ('evidencia_reportes', 'evidencia_excepciones') OR NOT vigente),
  CONSTRAINT dgm_cierre_coherente CHECK (cerrado_en IS NULL OR NOT vigente)
);

-- A lo sumo UNA asignación vigente por docente (también ante operaciones concurrentes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dgm_un_vigente ON docente_grupo_matriz (docente_id) WHERE vigente;
-- Sin duplicados: mismo docente, grupo e inicio (las filas heredadas, con inicio desconocido, son únicas por docente y grupo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dgm_sin_duplicados ON docente_grupo_matriz (docente_id, grupo_id, (COALESCE(desde, '-infinity'::timestamptz)));
CREATE INDEX IF NOT EXISTS idx_dgm_grupo ON docente_grupo_matriz (grupo_id);

CREATE TABLE IF NOT EXISTS docente_grupo_matriz_incidencias (
  id            BIGSERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('dos_grupos_en_un_semestre', 'reportes_sin_plantilla', 'sin_evidencia')),
  docente_id    INT  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  semestre      TEXT NULL,
  detalle       JSONB NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelta', 'descartada')),
  detectada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_por  INT  NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  resuelta_en   TIMESTAMPTZ NULL,
  nota          TEXT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dgm_incidencias ON docente_grupo_matriz_incidencias (tipo, docente_id, (COALESCE(semestre, '')));

-- ───────────── Validaciones al insertar/actualizar ─────────────
CREATE OR REPLACE FUNCTION dgm_validar() RETURNS trigger AS $fn$
DECLARE
  v_legado   BOOLEAN := NEW.origen IN ('vigente_al_migrar', 'evidencia_reportes', 'evidencia_excepciones');
  v_rol      TEXT;
  v_semestre TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT rol INTO v_rol FROM usuarios WHERE id = NEW.docente_id;
    IF v_rol IS NOT NULL AND v_rol <> 'docente' THEN   -- si el usuario no existe, responde la clave foránea (23503)
      RAISE EXCEPTION 'Una asignación solo aplica a usuarios con rol docente' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Serializa los cambios de un mismo docente (la clave del espacio 7310028 es propia de esta tabla).
  PERFORM pg_advisory_xact_lock(7310028, NEW.docente_id);

  -- Sin preasignaciones: lo creado por la aplicación no puede empezar en el futuro (no puede pisar la asignación vigente ni el historial).
  IF TG_OP = 'INSERT' AND NOT v_legado AND NEW.desde > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'No se permiten preasignaciones: una asignación no puede empezar en el futuro' USING ERRCODE = '23514';
  END IF;

  -- Solapamiento de vigencias, cuando las fechas están disponibles (las filas heredadas con inicio desconocido no se comparan).
  IF NEW.desde IS NOT NULL AND (NEW.hasta IS NULL OR NEW.hasta >= NEW.desde) AND EXISTS (
    SELECT 1 FROM docente_grupo_matriz o
    WHERE o.docente_id = NEW.docente_id AND o.id IS DISTINCT FROM NEW.id AND o.desde IS NOT NULL
      AND tstzrange(o.desde, COALESCE(o.hasta, 'infinity'::timestamptz), '[)') && tstzrange(NEW.desde, COALESCE(NEW.hasta, 'infinity'::timestamptz), '[)')
  ) THEN
    RAISE EXCEPTION 'Las vigencias de las asignaciones de un docente no pueden solaparse' USING ERRCODE = '23P01';
  END IF;

  -- Decisión 1: un docente con reportes en un grupo de un semestre no cambia a otro grupo DEL MISMO semestre.
  IF TG_OP = 'INSERT' AND NOT v_legado THEN
    SELECT semestre INTO v_semestre FROM grupos_matriz WHERE id = NEW.grupo_id;
    IF EXISTS (
      SELECT 1 FROM docente_grupo_matriz o JOIN grupos_matriz go ON go.id = o.grupo_id
      WHERE o.docente_id = NEW.docente_id AND o.grupo_id <> NEW.grupo_id AND go.semestre IS NOT DISTINCT FROM v_semestre
        AND EXISTS (SELECT 1 FROM proyecto_entregables pe JOIN plantilla_entregables t ON t.id = pe.plantilla_id
                    WHERE pe.docente_id = NEW.docente_id AND t.grupo_id = o.grupo_id)
    ) THEN
      RAISE EXCEPTION 'HISTORICO_PROTEGIDO: el docente tiene reportes en otro grupo de este semestre; no puede cambiar de grupo dentro del mismo semestre' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

-- ───────────── Protección de periodos anteriores ─────────────
CREATE OR REPLACE FUNCTION dgm_proteger() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Solo se admite el borrado en cascada de un docente que ya no existe (conserva el comportamiento actual de DELETE /admin/usuarios).
    IF EXISTS (SELECT 1 FROM usuarios WHERE id = OLD.docente_id) THEN
      RAISE EXCEPTION 'Una asignación histórica no se elimina' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: lo único que cambia es el CIERRE de la asignación vigente (o poner a NULL un autor eliminado, por la FK ON DELETE SET NULL).
  IF NEW.docente_id IS DISTINCT FROM OLD.docente_id OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id OR NEW.origen IS DISTINCT FROM OLD.origen
     OR NEW.certeza IS DISTINCT FROM OLD.certeza OR NEW.desde IS DISTINCT FROM OLD.desde OR NEW.evidencia IS DISTINCT FROM OLD.evidencia
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR (NEW.creado_por IS DISTINCT FROM OLD.creado_por AND NEW.creado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'Una asignación solo puede cerrarse; sus demás datos no cambian' USING ERRCODE = '23514';
  END IF;
  IF NOT OLD.vigente AND (NEW.vigente IS DISTINCT FROM OLD.vigente OR NEW.hasta IS DISTINCT FROM OLD.hasta OR NEW.cerrado_en IS DISTINCT FROM OLD.cerrado_en
                          OR NEW.motivo_cierre IS DISTINCT FROM OLD.motivo_cierre
                          OR (NEW.cerrado_por IS DISTINCT FROM OLD.cerrado_por AND NEW.cerrado_por IS NOT NULL)) THEN
    RAISE EXCEPTION 'Una asignación cerrada no se reabre ni se modifica' USING ERRCODE = '23514';
  END IF;
  IF OLD.vigente AND NEW.vigente AND (NEW.hasta IS DISTINCT FROM OLD.hasta OR NEW.cerrado_en IS DISTINCT FROM OLD.cerrado_en) THEN
    RAISE EXCEPTION 'Una asignación vigente solo se cierra poniendo vigente=false y hasta' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dgm_validar ON docente_grupo_matriz;
CREATE TRIGGER trg_dgm_validar BEFORE INSERT OR UPDATE ON docente_grupo_matriz FOR EACH ROW EXECUTE FUNCTION dgm_validar();
DROP TRIGGER IF EXISTS trg_dgm_proteger ON docente_grupo_matriz;
CREATE TRIGGER trg_dgm_proteger BEFORE UPDATE OR DELETE ON docente_grupo_matriz FOR EACH ROW EXECUTE FUNCTION dgm_proteger();

-- ───────────── Backfill conservador e idempotente ─────────────
-- Solo evidencia verificable: grupo vigente (dato actual), reportes y excepciones individuales (creados únicamente si el docente
-- pertenecía al grupo en ese momento). Una fila por (docente, grupo), con todas sus fuentes fusionadas.
-- NO se inserta ninguna asignación que dependa de conflictos (evidencia en dos grupos de un mismo semestre): se registran como
-- incidencias para decisión humana. La asignación VIGENTE se inserta siempre (es el dato actual y espeja usuarios.grupo_matriz_id).
CREATE OR REPLACE FUNCTION docente_grupo_matriz_backfill() RETURNS jsonb AS $fn$
DECLARE
  v_filas_antes BIGINT; v_filas_despues BIGINT; v_inc_antes BIGINT; v_inc_despues BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_filas_antes FROM docente_grupo_matriz;
  SELECT COUNT(*) INTO v_inc_antes FROM docente_grupo_matriz_incidencias;

  DROP TABLE IF EXISTS _dgm_fuentes;
  DROP TABLE IF EXISTS _dgm_conflictos;
  CREATE TEMP TABLE _dgm_fuentes ON COMMIT DROP AS
    SELECT u.id AS docente_id, u.grupo_matriz_id AS grupo_id, g.semestre, 'vigente'::text AS fuente, 1::int AS n, 0::int AS aprobados
    FROM usuarios u JOIN grupos_matriz g ON g.id = u.grupo_matriz_id WHERE u.rol = 'docente'
    UNION ALL
    SELECT pe.docente_id, t.grupo_id, g.semestre, 'reportes', COUNT(*)::int, COUNT(*) FILTER (WHERE pe.estado_revision = 'aprobado')::int
    FROM proyecto_entregables pe
    JOIN plantilla_entregables t ON t.id = pe.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id JOIN usuarios u ON u.id = pe.docente_id AND u.rol = 'docente'
    WHERE pe.docente_id IS NOT NULL GROUP BY pe.docente_id, t.grupo_id, g.semestre
    UNION ALL
    SELECT dex.docente_id, t.grupo_id, g.semestre, 'excepciones', COUNT(*)::int, 0
    FROM docente_entregable_excepciones dex
    JOIN plantilla_entregables t ON t.id = dex.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id JOIN usuarios u ON u.id = dex.docente_id AND u.rol = 'docente'
    GROUP BY dex.docente_id, t.grupo_id, g.semestre;

  -- Conflictos: evidencia en dos o más grupos de un mismo semestre.
  CREATE TEMP TABLE _dgm_conflictos ON COMMIT DROP AS
    SELECT docente_id, semestre FROM _dgm_fuentes GROUP BY docente_id, semestre HAVING COUNT(DISTINCT grupo_id) > 1;
  INSERT INTO docente_grupo_matriz_incidencias (tipo, docente_id, semestre, detalle)
    SELECT 'dos_grupos_en_un_semestre', c.docente_id, c.semestre,
           jsonb_build_object('grupos', (SELECT jsonb_agg(jsonb_build_object('grupo_id', f.grupo_id, 'fuente', f.fuente, 'n', f.n) ORDER BY f.grupo_id, f.fuente)
                                         FROM _dgm_fuentes f WHERE f.docente_id = c.docente_id AND f.semestre = c.semestre))
    FROM _dgm_conflictos c
    ON CONFLICT DO NOTHING;

  -- Reportes con docente pero sin plantilla: no se pueden atribuir a ningún grupo.
  INSERT INTO docente_grupo_matriz_incidencias (tipo, docente_id, semestre, detalle)
    SELECT 'reportes_sin_plantilla', pe.docente_id, NULL, jsonb_build_object('reportes', COUNT(*))
    FROM proyecto_entregables pe JOIN usuarios u ON u.id = pe.docente_id AND u.rol = 'docente'
    WHERE pe.docente_id IS NOT NULL AND pe.plantilla_id IS NULL GROUP BY pe.docente_id
    ON CONFLICT DO NOTHING;

  -- Docentes sin grupo vigente y sin ninguna evidencia: no reconstruibles (informativo).
  INSERT INTO docente_grupo_matriz_incidencias (tipo, docente_id, semestre, detalle)
    SELECT 'sin_evidencia', u.id, NULL, jsonb_build_object('nota', 'Sin grupo vigente ni evidencia: no se infiere ninguna asignación')
    FROM usuarios u WHERE u.rol = 'docente' AND u.grupo_matriz_id IS NULL AND NOT EXISTS (SELECT 1 FROM _dgm_fuentes f WHERE f.docente_id = u.id)
    ON CONFLICT DO NOTHING;

  -- Una fila por (docente, grupo). Se excluye la evidencia NO vigente de los semestres en conflicto.
  INSERT INTO docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, certeza, evidencia)
    SELECT f.docente_id, f.grupo_id,
           bool_or(f.fuente = 'vigente'),
           NULL, NULL,
           CASE WHEN bool_or(f.fuente = 'vigente') THEN 'vigente_al_migrar'
                WHEN bool_or(f.fuente = 'reportes') THEN 'evidencia_reportes'
                ELSE 'evidencia_excepciones' END,
           CASE WHEN bool_or(f.fuente = 'vigente') OR bool_or(f.fuente = 'reportes') THEN 'alta' ELSE 'media' END,
           jsonb_build_object(
             'fuentes', (SELECT jsonb_agg(DISTINCT x) FROM unnest(array_agg(f.fuente)) x),
             'reportes', COALESCE(SUM(f.n) FILTER (WHERE f.fuente = 'reportes'), 0),
             'aprobados', COALESCE(SUM(f.aprobados) FILTER (WHERE f.fuente = 'reportes'), 0),
             'excepciones', COALESCE(SUM(f.n) FILTER (WHERE f.fuente = 'excepciones'), 0),
             'semestre', MAX(f.semestre),
             'vigencia', 'desconocida')
    FROM _dgm_fuentes f
    GROUP BY f.docente_id, f.grupo_id
    HAVING bool_or(f.fuente = 'vigente')
        OR NOT EXISTS (SELECT 1 FROM _dgm_conflictos c WHERE c.docente_id = f.docente_id AND c.semestre = MAX(f.semestre))
    ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_filas_despues FROM docente_grupo_matriz;
  SELECT COUNT(*) INTO v_inc_despues FROM docente_grupo_matriz_incidencias;
  RETURN jsonb_build_object('filas_insertadas', v_filas_despues - v_filas_antes, 'filas_totales', v_filas_despues,
                            'incidencias_nuevas', v_inc_despues - v_inc_antes, 'incidencias_totales', v_inc_despues);
END
$fn$ LANGUAGE plpgsql;

SELECT docente_grupo_matriz_backfill();

-- Verificación: dentro de la misma transacción de la migración. Si el historial vigente no espeja a usuarios.grupo_matriz_id, la
-- migración ABORTA y no queda nada.
DO $verificacion$
BEGIN
  IF (SELECT COUNT(*) FROM usuarios WHERE rol = 'docente' AND grupo_matriz_id IS NOT NULL) <> (SELECT COUNT(*) FROM docente_grupo_matriz WHERE vigente) THEN
    RAISE EXCEPTION 'fase28: el número de asignaciones vigentes no coincide con los docentes que tienen grupo';
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente
             WHERE u.rol = 'docente' AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id) THEN
    RAISE EXCEPTION 'fase28: hay docentes cuyo grupo vigente no coincide con su asignación vigente';
  END IF;
END
$verificacion$;

-- ============================================================
-- REVERSIÓN (manual; segura mientras ningún código use las tablas nuevas). NO se ejecuta con esta migración.
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_dgm_proteger ON docente_grupo_matriz;
--   DROP TRIGGER IF EXISTS trg_dgm_validar  ON docente_grupo_matriz;
--   DROP FUNCTION IF EXISTS docente_grupo_matriz_backfill();
--   DROP FUNCTION IF EXISTS dgm_proteger();
--   DROP FUNCTION IF EXISTS dgm_validar();
--   DROP TABLE IF EXISTS docente_grupo_matriz_incidencias;
--   DROP TABLE IF EXISTS docente_grupo_matriz;
--   DELETE FROM schema_migrations WHERE nombre = 'fase28_docente_grupo_matriz.sql';
--   COMMIT;
-- (usuarios.grupo_matriz_id no se toca en ningún momento: la aplicación sigue funcionando sin cambios.)
-- ============================================================
