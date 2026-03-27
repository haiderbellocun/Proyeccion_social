-- ============================================================
-- FASE 2: Perfiles de Indicadores + Catálogo de Entregables
-- Ejecutar en pgAdmin pegando el contenido completo
-- Base de datos: app_proyecion
-- ============================================================

-- TABLA: perfiles_indicador
CREATE TABLE IF NOT EXISTS perfiles_indicador (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT NOT NULL,
  num_proyectos    INTEGER NOT NULL DEFAULT 0,
  num_actividades  INTEGER NOT NULL DEFAULT 0,
  num_convenios    INTEGER NOT NULL DEFAULT 0,
  creado_en        TIMESTAMP DEFAULT NOW()
);

-- TABLA: programa_perfil_indicador
CREATE TABLE IF NOT EXISTS programa_perfil_indicador (
  programa_id  INTEGER NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
  perfil_id    INTEGER NOT NULL REFERENCES perfiles_indicador(id) ON DELETE RESTRICT,
  semestre     TEXT NOT NULL DEFAULT '2025C',
  PRIMARY KEY (programa_id, semestre)
);

-- TABLA: catalogo_entregables
CREATE TABLE IF NOT EXISTS catalogo_entregables (
  id              SERIAL PRIMARY KEY,
  seccion         TEXT NOT NULL,
  entidad_numero  INTEGER,
  entregable      TEXT NOT NULL,
  descripcion     TEXT,
  orden           INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- DATOS: CAPACITACIÓN Y ASISTENCIA TÉCNICA (9 entregables)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('capacitacion', NULL, 'Participar en la Socialización de Lineamientos de Proyección Social', 'Responder evaluación y cargar captura. Link: https://forms.gle/f3QRKygfrKtrQiFG9', 1),
('capacitacion', NULL, 'Diligenciar formulario de Compromiso docente', 'Responder formulario y cargar captura. Link: https://forms.gle/BabTQRx7QQzSLsiS8', 2),
('capacitacion', NULL, 'Lectura y evaluación de la Política de Proyección Social', 'Responder evaluación y cargar captura. Link: https://forms.gle/NERgUvcBqoT7j1Bw8', 3),
('capacitacion', NULL, 'Participar en la Capacitación 1: Socialización Indicadores, Política de Proyección Social, Mapeo de actores, Acta de reunión, Plan de trabajo', 'Responder evaluación y cargar captura. Link: https://forms.gle/iU9TB3rw6X6Lfoki9', 4),
('capacitacion', NULL, 'Participar en la Capacitación 2 Proyectos parte 1: Solicitud de pieza, formulario de inscripción, Correo de bienvenida, listados de asistencia, medición de entendimiento', 'Responder evaluación y cargar captura. Link: https://forms.gle/GS1yZZNbnRvBrneX6', 5),
('capacitacion', NULL, 'Participar en la Capacitación 3 proyectos parte 2: Nota Concepto, Presupuesto, Registro fotográfico, encuesta de satisfacción, videos testimoniales, carta de reconocimiento', 'Responder evaluación y cargar captura. Link: https://forms.gle/wArTThjuhuhNW2MU6', 6),
('capacitacion', NULL, 'Participar en la Capacitación 4 Actividades: Acta de actividad, Presupuesto, Correo de Bienvenida, Formatos de asistencia y Registro fotográfico', 'Responder evaluación y cargar captura de la evaluación', 7),
('capacitacion', NULL, 'Elaborar el plan de trabajo de acuerdo con los indicadores asignados', 'Diligenciar formulario del plan de trabajo y cargar captura. Link: https://forms.gle/1urJUFg1ZDrK9Fag6', 8),
('capacitacion', NULL, 'Realizar la reunión con el actor externo de acuerdo con el formato de Acta de reunión con actores externos', 'Cargar PDF del Acta de reunión firmada por actor externo y docente, y fotografías o grabación', 9);

-- ============================================================
-- DATOS: CONVENIOS (15 entregables)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('convenios', NULL, 'Identificación y relacionamiento de actores externos para firma de nuevo convenio', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 1),
('convenios', NULL, 'Contacto y relacionamiento con dos aliados de proyección social para dinamizar convenios previamente firmados', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 2),
('convenios', NULL, 'Diligenciar el Mapeo de Actores indicando los actores de los convenios de proyección social a dinamizar', 'Diligenciar formulario y cargar captura. Link: https://forms.gle/4ijbS1U2GMBy87ZD9', 3),
('convenios', NULL, 'Anexos firmados Convenio nuevo', 'Cargar Cédula del representante legal, RUT de la entidad y Cámara de comercio o Acta de posesión del actor con quien se firmará convenio', 4),
('convenios', NULL, 'Minuta de convenio firmada por parte del actor externo', 'Cargar PDF del convenio firmado por el actor externo', 5),
('convenios', NULL, 'Solicitar la Carta de reconocimiento firmada por parte de aliado 1', 'Cargar PDF Carta de reconocimiento firmada por actor externo', 6),
('convenios', NULL, 'Solicitar la Carta de reconocimiento firmada por parte de aliado 2', 'Cargar PDF Carta de reconocimiento firmada por actor externo', 7),
('convenios', NULL, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial aliado 1', 'Cargar formato de consentimiento informado debidamente firmado', 8),
('convenios', NULL, 'Solicitar vídeo de testimonio del aliado 1', 'Cargar video testimonial. Horizontal, máx 1:30 min', 9),
('convenios', NULL, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial aliado 2', 'Cargar formato de consentimiento informado debidamente firmado', 10),
('convenios', NULL, 'Solicitar vídeo de testimonio del aliado 2', 'Cargar video testimonial. Horizontal, máx 1:30 min', 11),
('convenios', NULL, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial beneficiario 1', 'Cargar formato de consentimiento informado debidamente firmado', 12),
('convenios', NULL, 'Solicitar vídeo de testimonio del beneficiario 1', 'Cargar video testimonial de un beneficiario del proyecto. Horizontal, máx 1:30 min', 13),
('convenios', NULL, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial beneficiario 2', 'Cargar formato de consentimiento informado debidamente firmado', 14),
('convenios', NULL, 'Solicitar vídeo de testimonio del beneficiario 2', 'Cargar video testimonial de un beneficiario del proyecto. Horizontal, máx 1:30 min', 15);

-- ============================================================
-- DATOS: PROYECTOS (25 entregables base, entidad_numero = 1)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('proyectos', 1, 'Diligenciar el link Solicitud de pieza comunicacional (incluye formulario de inscripción en editable)', 'Diligenciar formulario y cargar captura. Link: https://forms.gle/fWBhN7Ttu7YBM1UL8', 1),
('proyectos', 1, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación', 'Virtual: cargar link formulario. Presencial: cargar formato Word', 2),
('proyectos', 1, 'Elaborar la Evaluación de satisfacción para revisión y aprobación', 'Presencial: imprimir Word. Virtual: duplicar Google Forms', 3),
('proyectos', 1, 'Elaboración de contenidos - Sesión 1', 'Cargar PPT sesión 1 usando formato de Proyección Social', 4),
('proyectos', 1, 'Elaboración de contenidos - Sesión 2', 'Cargar PPT sesión 2 usando formato de Proyección Social', 5),
('proyectos', 1, 'Elaboración de contenidos - Sesión 3', 'Cargar PPT sesión 3 usando formato de Proyección Social', 6),
('proyectos', 1, 'Elaboración de contenidos - Sesión 4', 'Cargar PPT sesión 4 usando formato de Proyección Social', 7),
('proyectos', 1, 'Elaboración de contenidos - Sesión 5', 'Cargar PPT sesión 5 usando formato de Proyección Social', 8),
('proyectos', 1, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación', 'Cargar Word con Nota concepto y Excel con presupuesto con total de beneficiarios', 9),
('proyectos', 1, 'Difusión de la pieza comunicacional - Correo enviado al actor externo', 'Cargar pieza comunicacional y captura del correo enviado al actor externo', 10),
('proyectos', 1, 'Inicio del proyecto, implementación primera sesión', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 11),
('proyectos', 1, 'Correo invitación sesión 2', 'Cargar captura del correo de invitación enviado', 12),
('proyectos', 1, 'Implementación sesión 2', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 13),
('proyectos', 1, 'Correo invitación sesión 3', 'Cargar captura del correo de invitación enviado', 14),
('proyectos', 1, 'Implementación sesión 3', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 15),
('proyectos', 1, 'Correo invitación sesión 4', 'Cargar captura del correo de invitación enviado', 16),
('proyectos', 1, 'Implementación sesión 4', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 17),
('proyectos', 1, 'Correo invitación sesión 5', 'Cargar captura del correo de invitación enviado', 18),
('proyectos', 1, 'Implementación sesión 5', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 19),
('proyectos', 1, 'Aplicar la Evaluación de satisfacción y cargar consolidado en drive', 'Presencial: PDF respuestas escaneadas. Virtual: Excel del formulario de respuestas', 20),
('proyectos', 1, 'Aplicar la Medición de Apropiación de Conocimiento y cargar consolidado', 'Presencial: PDF calificado. Virtual: Excel del formulario de respuestas', 21),
('proyectos', 1, 'Aplicar y cargar los formatos de listados de asistencia de todas las sesiones', 'Presencial: PDF escaneado. Virtual: Excel formulario Zoho. Solo usar formatos del área', 22),
('proyectos', 1, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto', 'Presencial: fotografías por sesión. Virtual: pantallazos y grabación de sesiones', 23),
('proyectos', 1, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo', 'Cargar PDF de la Nota concepto firmada por ambas partes', 24),
('proyectos', 1, 'Elaborar listados de asistencia y diligenciar la planilla de certificación SNIES', 'Cargar listado de asistencia y planilla SNIES con verificación de nombres en página de la Policía', 25);

-- ============================================================
-- DATOS: ACTIVIDADES (8 entregables base, entidad_numero = 1)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('actividades', 1, 'Diligenciar el link Solicitud de pieza comunicacional (incluye formulario de inscripción en editable)', 'Diligenciar formulario y cargar captura. Link: https://forms.gle/fWBhN7Ttu7YBM1UL8', 1),
('actividades', 1, 'Elaboración de contenidos de la actividad', 'Cargar PPT de la actividad usando el formato de Proyección Social', 2),
('actividades', 1, 'Difusión de la pieza comunicacional - Correo enviado al actor externo', 'Cargar pieza comunicacional y captura del correo enviado al actor externo para difusión', 3),
('actividades', 1, 'Implementación de la actividad', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4),
('actividades', 1, 'Aplicar y cargar los formatos de listados de asistencia', 'Presencial: PDF escaneado. Virtual: Excel Zoho. Solo usar formatos establecidos por el área', 5),
('actividades', 1, 'Entrega del Acta de actividad firmada por actor externo y docente, y presupuesto en Excel con total de beneficiarios', 'Cargar Word con acta firmada y Excel con presupuesto reportado en planilla SNIES', 6),
('actividades', 1, 'Generar registro fotográfico y/o grabación de la actividad', 'Presencial: fotografías de la actividad. Virtual: grabación y pantallazos de la sesión', 7),
('actividades', 1, 'Elaborar listados de asistencia y diligenciar la planilla de certificación SNIES', 'Cargar listado de asistencia y planilla SNIES con verificación de nombres en página de la Policía', 8);

-- ============================================================
-- DATOS: GESTIÓN DE PRESUPUESTO (4 entregables)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('gestion_presupuesto', NULL, 'Firmar del formato "Autorización de Descuento de Nómina"', 'Cargar el documento firmado en formato PDF', 1),
('gestion_presupuesto', NULL, 'Firma y relación de cuenta bancaria en el formato "Solicitud de Gastos de Viaje"', 'El titular debe ser el docente. Sin Nequi/Daviplata usar cuenta de nómina con Certificado Bancario. Cargar PDF', 2),
('gestion_presupuesto', NULL, 'Firma y relación de Facturas en el formato "Legalización de Gastos de Viaje" de forma mensual', 'Firmar el formato y cargarlo a la carpeta del mes en curso', 3),
('gestion_presupuesto', NULL, 'Cargue de facturas de legalización en Drive de forma mensual', 'Cargar facturas del mes en curso a la carpeta correspondiente en Drive', 4);

-- ============================================================
-- DATOS: VARIOS (3 entregables)
-- ============================================================
INSERT INTO catalogo_entregables (seccion, entidad_numero, entregable, descripcion, orden) VALUES
('varios', NULL, 'Solicitud de salones para actividades Cunistas', 'Enviar solicitud de salón vía correo con copia a líder de programa y analista asignado. Cargar captura del envío', 1),
('varios', NULL, 'Solicitud de certificado de ARL para traslados fuera del lugar de trabajo', 'Enviar correo a Seguridad y Salud en el Trabajo solicitando certificado ARL. Cargar captura del envío', 2),
('varios', NULL, 'Solicitud de carta de voluntario', 'Diligenciar formato de voluntariado por parte del ponente invitado', 3);
