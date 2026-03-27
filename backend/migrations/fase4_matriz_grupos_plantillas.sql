-- FASE 4B: Matriz de Seguimiento basada en grupos + plantillas
-- Objetivo (MEJORA 2 y 3):
--   - Agregar tipo_docente / regional / link_drive a usuarios
--   - Crear grupos_matriz y plantilla_entregables
--   - Asociar el grupo a cada docente (usuarios.grupo_matriz_id)

-- ============================
-- 1) Tabla: grupos_matriz
-- ============================

CREATE TABLE IF NOT EXISTS grupos_matriz (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,           -- Ej: "Grupo 1 - Antiguo 24h"
  descripcion TEXT,
  tipo_docente VARCHAR(10) CHECK (tipo_docente IN ('ANTIGUO', 'NUEVO')),
  horas_totales INTEGER NOT NULL,
  num_proyectos INTEGER NOT NULL DEFAULT 0,
  num_actividades INTEGER NOT NULL DEFAULT 0,
  num_convenios_nuevos INTEGER NOT NULL DEFAULT 0,
  num_convenios_dinamizados INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- ============================
-- 2) Tabla: plantilla_entregables
-- ============================

CREATE TABLE IF NOT EXISTS plantilla_entregables (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER REFERENCES grupos_matriz(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,                -- Número de orden del entregable
  categoria VARCHAR(100),                 -- Ej: "Capacitación y Asistencia Técnica"
  fase VARCHAR(100),                      -- Ej: "Alistamiento y Capacitación"
  mes VARCHAR(20),                        -- 'febrero', 'marzo', 'abril', 'mayo'
  semana_numero INTEGER,                  -- Semana del semestre (1-16)
  entregable TEXT NOT NULL,               -- Descripción del entregable
  descripcion_evidencia TEXT,            -- Qué documento se debe cargar como evidencia
  horas NUMERIC(5,1),                     -- Horas estimadas
  dias_inicio_desde_feb INTEGER,         -- Días desde inicio del semestre para fecha_inicio
  dias_fin_desde_feb INTEGER             -- Días desde inicio del semestre para fecha_fin
);

-- ============================
-- 3) Columnas en usuarios
-- ============================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tipo_docente VARCHAR(10) CHECK (tipo_docente IN ('ANTIGUO', 'NUEVO')) DEFAULT 'ANTIGUO',
  ADD COLUMN IF NOT EXISTS regional VARCHAR(100),
  ADD COLUMN IF NOT EXISTS link_drive TEXT,
  ADD COLUMN IF NOT EXISTS grupo_matriz_id INTEGER REFERENCES grupos_matriz(id) ON DELETE SET NULL;

