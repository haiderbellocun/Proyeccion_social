-- ============================================================
-- FASE 1: Esquema base de ProySocial
-- Tablas requeridas por el backend antes de las migraciones
-- historicas incluidas en este repositorio.
-- ============================================================

CREATE TABLE IF NOT EXISTS programas (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL UNIQUE,
  codigo      VARCHAR(50) UNIQUE,
  facultad    VARCHAR(200),
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  apellido       VARCHAR(100) NOT NULL,
  correo         VARCHAR(255) NOT NULL UNIQUE,
  google_sub     VARCHAR(255) UNIQUE,
  foto_url       TEXT,
  ultimo_acceso  TIMESTAMPTZ,
  rol            VARCHAR(20) NOT NULL
                 CHECK (rol IN ('admin', 'docente')),
  programa_id    INTEGER REFERENCES programas(id) ON DELETE SET NULL,
  estado         VARCHAR(20) NOT NULL DEFAULT 'activo',
  creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_correo_normalizado
  ON usuarios ((LOWER(TRIM(correo))));

CREATE TABLE IF NOT EXISTS proyectos (
  id                       SERIAL PRIMARY KEY,
  titulo                   VARCHAR(255) NOT NULL,
  descripcion              TEXT,
  programa_id              INTEGER REFERENCES programas(id) ON DELETE SET NULL,
  docente_responsable_id   INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
  tipo                     VARCHAR(30) NOT NULL DEFAULT 'proyecto'
                           CHECK (tipo IN ('proyecto', 'convenio', 'actividad', 'capacitacion')),
  estado                   VARCHAR(30) NOT NULL DEFAULT 'en_ejecucion',
  fecha_inicio             DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin_estimada       DATE,
  horas_totales            NUMERIC(8,1),
  semanas                  INTEGER CHECK (semanas IS NULL OR semanas > 0),
  creado_en                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proyecto_docentes (
  proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  docente_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol          VARCHAR(30) NOT NULL DEFAULT 'colaborador',
  creado_en    TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proyecto_id, docente_id)
);

CREATE TABLE IF NOT EXISTS proyecto_semanas (
  id            SERIAL PRIMARY KEY,
  proyecto_id   INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL CHECK (numero > 0),
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_proyecto_semanas_proyecto_numero UNIQUE (proyecto_id, numero),
  CONSTRAINT chk_proyecto_semanas_fechas CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE IF NOT EXISTS proyecto_entregables (
  id                   SERIAL PRIMARY KEY,
  proyecto_semana_id   INTEGER NOT NULL
                       REFERENCES proyecto_semanas(id) ON DELETE CASCADE,
  descripcion          TEXT NOT NULL,
  horas                NUMERIC(8,1),
  creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_programa
  ON usuarios(programa_id);

CREATE INDEX IF NOT EXISTS idx_proyectos_programa
  ON proyectos(programa_id);

CREATE INDEX IF NOT EXISTS idx_proyectos_docente_responsable
  ON proyectos(docente_responsable_id);

CREATE INDEX IF NOT EXISTS idx_proyecto_docentes_docente
  ON proyecto_docentes(docente_id);

CREATE INDEX IF NOT EXISTS idx_proyecto_semanas_proyecto
  ON proyecto_semanas(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_proyecto_entregables_semana
  ON proyecto_entregables(proyecto_semana_id);
