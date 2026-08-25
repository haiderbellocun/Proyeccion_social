-- ============================================================
-- FASE 13: autenticacion exclusiva con Google y limpieza de demo
-- ============================================================

-- Elimina exclusivamente los datos locales ficticios creados por las
-- antiguas migraciones de desarrollo. Las plantillas, grupos y catalogos
-- institucionales se conservan intactos.
DELETE FROM proyectos
WHERE titulo = 'Proyecto local de demostracion'
   OR docente_responsable_id IN (
     SELECT id
     FROM usuarios
     WHERE LOWER(correo) IN (
       'admin@proysocial.local',
       'docente@proysocial.local'
     )
   );

DELETE FROM usuarios
WHERE LOWER(correo) IN (
  'admin@proysocial.local',
  'docente@proysocial.local'
);

DELETE FROM programas
WHERE (codigo = 'DEMO' OR nombre = 'Programa de Demostracion')
  AND NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.programa_id = programas.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM proyectos p WHERE p.programa_id = programas.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM programa_perfil_indicador ppi
    WHERE ppi.programa_id = programas.id
  );

-- Google es la unica identidad de acceso. El correo debe existir primero en
-- usuarios (aprovisionado por un administrador) y google_sub se vincula en el
-- primer inicio de sesion correctamente verificado.
ALTER TABLE usuarios
  DROP COLUMN IF EXISTS password_hash,
  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255),
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_google_sub
  ON usuarios (google_sub)
  WHERE google_sub IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_correo_normalizado
  ON usuarios ((LOWER(TRIM(correo))));

-- El calendario es dato de negocio y no debe vivir quemado en React/Node.
CREATE TABLE IF NOT EXISTS semestres (
  codigo          VARCHAR(10) PRIMARY KEY,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  numero_semanas  INTEGER NOT NULL DEFAULT 16 CHECK (numero_semanas > 0),
  activo          BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_semestres_codigo CHECK (codigo ~ '^[0-9]{4}[AB]$'),
  CONSTRAINT chk_semestres_fechas CHECK (fecha_fin >= fecha_inicio)
);

-- 2026A corresponde al calendario de la matriz institucional importada que
-- ya existe en la base. No es informacion de demostracion.
INSERT INTO semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo)
VALUES ('2026A', DATE '2026-02-10', DATE '2026-06-01', 16, TRUE)
ON CONFLICT (codigo) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_semestres_un_activo
  ON semestres ((activo))
  WHERE activo = TRUE;
