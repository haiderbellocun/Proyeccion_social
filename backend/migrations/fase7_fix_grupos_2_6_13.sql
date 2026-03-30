-- Fix plantillas grupos 2, 6, 13 desde Excel 2026A

-- Grupo 2 (4 filas)
DELETE FROM plantilla_entregables WHERE grupo_id = 2;

INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES
(2, 3, 'Marzo - Semana 4', '9. ENTREGABLES VARIOS', 'marzo', 4, 'Revisión y ajustes de gestión documental', 'Espacio destinado para verificar que la gestión documental se encuentre completa y correctamente elaborada.', 9.0, 21, 27),
(2, 4, 'Marzo - Semana 4', '9. ENTREGABLES VARIOS', 'marzo', 4, 'Solicitud de carta de voluntario firmado por el ponente o conferencista invitado que va a impartir la capacitación y/o sesión del proyecto', 'Diligenciar documento formato de voluntariado por parte de ponente invitado a capacitación
https://docs.google.com/document/d/196XkDmBKi-FMoAEyyqEjvVbvJTER5hMR/edit', 4.0, 21, 27),
(2, 5, 'Mayo - Semana 15', '9. ENTREGABLES VARIOS', 'mayo', 15, 'Solicitar formato de consentimiento informado firmado para uso de imagen', 'Cargar el formato de consentimiento informado debidamente firmado que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 98, 104),
(2, 6, 'Mayo - Semana 16', '9. ENTREGABLES VARIOS', 'mayo', 16, 'Generar vídeo de testimonio Docente con relación a su experiencia como docente de proyección social', 'Cargar vídeos testimoniales: Docente del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/1/folders/1YJKs6nlr1vlISodCUA1m3dx2MpJjtEOQ', 1.0, 105, 111);


-- Grupo 6 (157 filas)
DELETE FROM plantilla_entregables WHERE grupo_id = 6;

INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES
(6, 1, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Lectura y evaluación de la Política de Proyección Social', 'Responder la evaluación de entendimiento respecto a la Política de Proyección Social 
https://forms.gle/fskpYxEccnS7zFKt5', 2.0, 0, 6),
(6, 2, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Diligenciar formulario de Compromiso docente', 'Responder formulario de compromiso docente

Link: https://forms.gle/MMs9qrESEQPHJn7NA', 1.0, 0, 6),
(6, 3, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Participar en la Socialización de Lineamientos de Proyección Social
(Generalidades del área PS, Resultados destacados PS, Socialización Indicadores, Programación del semestre, Lineamientos de seguimiento y monitoreo docente, Entregables de febrero, Práctica social)', 'Participar activamente del evento de Socialización de Lineamientos de Proyección Social previamente agendado en Calendar
Link de Asistencia: https://forms.gle/8UMpNsciQ4QEn21dA', 3.0, 0, 6),
(6, 4, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Responder evaluación con respecto a la  Socialización de Lineamientos de Proyección Social', 'Responder la evaluación de entendimiento respecto a la Socialización de Lineamientos de Proyección Social y 
cargar una captura de pantalla del diligenciamiento de formulario

Link evaluación: https://forms.gle/KpbxhH1nZCo1XVik6', 1.0, 0, 6),
(6, 5, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento del formato Acta de reunión', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de la gestión documental
Link Tutorial:', 1.0, 0, 6),
(6, 6, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Responder evaluación de entendimiento con respecto al tutorial del Acta de Reunión', 'Responder la evaluación de entendimiento respecto a los los tutoriales de plan de trabajo
Link evaluación:', 1.0, 0, 6),
(6, 7, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento del formulario Plan de trabajo', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de la gestión documental
Link Tutorial:', 1.0, 0, 6),
(6, 8, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Responder evaluación de entendimiento con respecto al tutorial del Plan de Trabajo', 'Responder la evaluación de entendimiento respecto a los los tutoriales de plan de trabajo
Link evaluación:', 1.0, 0, 6),
(6, 9, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Visualizar el tutorial de  gestión documental con respecto a la Solicitud de la Pieza Comunicacional y Formulario de Inscripción', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de Solicitud de la Pieza Comunicacional y Formulario de Inscripción
Link Tutoriales:', 1.0, 0, 6),
(6, 10, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Responder evaluación de entendimiento con respecto a los tutoriales de Solicitud Pieza Comunicacional y Formulario de Inscripción', 'Responder la evaluación de entendimiento respecto a la Solicitud de Pieza Comunicacional y Formulario de Inscripción 
Link evaluación:', 1.0, 0, 6),
(6, 11, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de los Listados de asistencia - Proyectos', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de los Listados de Asistencia - Proyectos
Link Tutorial:', 1.0, 21, 27),
(6, 12, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Responder evaluación de entendimiento con respecto al tutorial de  Listados de Asistencia - Proyectos', 'Responder la evaluación de entendimiento respecto a los Listados de Asistencia - Proyectos', 1.0, 21, 27),
(6, 13, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Visualizar el tutorial de gestión documental con respecto a la Solicitud de ARL desplazamiento docente', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de la Solicitud de ARL desplazamiento docente 
Link Tutoriales:', 1.0, 21, 27),
(6, 14, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Responder evaluación de entendimiento con respecto al tutorial de Solicitud de ARL desplazamiento docente', 'Responder la evaluación de entendimiento respecto ala Solicitud de ARL desplazamiento docente
Link evaluación:', 1.0, 21, 27),
(6, 15, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento del Formato de Voluntariado', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento del Formato de Voluntariado 
Link Tutoriales:', 1.0, 21, 27),
(6, 16, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Responder evaluación de entendimiento con respecto al tutorial de Formato de Voluntariado', 'Responder la evaluación de entendimiento respecto al Formato de Voluntariado', 1.0, 21, 27),
(6, 17, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de la Nota Concepto y Presupuesto', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de Nota Concepto y Presupuesto 
Link Tutoriales:', 2.0, 28, 34),
(6, 18, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Responder evaluación de entendimiento con respecto a los tutoriales de Nota Concepto y Presupuesto', 'Responder la evaluación de entendimiento respecto a la Nota de concepto y Presupuesto
Link evaluación:', 1.0, 28, 34),
(6, 19, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento del Registro Fotográfico', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de Registro Fotográfico 
Link Tutoriales:', 1.0, 28, 34),
(6, 20, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Responder evaluación de entendimiento con respecto al tutorial de Registro Fotográfico', 'Responder la evaluación de entendimiento respecto al Registro Fotográfico
Link evaluación:', 1.0, 28, 34),
(6, 21, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de Medición de Entendimiento y Encuesta de satisfacción', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de Registro Fotográfico 
Link Tutoriales:', 1.0, 28, 34),
(6, 22, 'Marzo - Semana 5', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 5, 'Responder evaluación de entendimiento con respecto a los tutoriales de  Medición de Entendimiento y Encuesta de satisfacción', 'Responder la evaluación de entendimiento respecto a la Medición de Entendimiento y Encuesta de satisfacción', 1.0, 28, 34),
(6, 23, 'Marzo - Semana 6', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 6, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento del Acta de actividad y presupuesto', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento del Acta deactividad y presupuesto
Link Tutorial:', 2.0, 35, 41),
(6, 24, 'Marzo - Semana 6', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 6, 'Responder evaluación de entendimiento con respecto a los tutoriales del Acta de actividad y presupuesto', 'Responder la evaluación de entendimiento respecto al Acta de actividad y presupuesto', 1.0, 35, 41),
(6, 25, 'Marzo - Semana 6', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 6, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de los Listados de asistencia - Actividades', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de los Listados de Asistencia - Actividades
Link Tutorial:', 1.0, 35, 41),
(6, 26, 'Marzo - Semana 6', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 6, 'Responder evaluación de entendimiento con respecto al tutorial de  Listados de Asistencia - Actividades', 'Responder la evaluación de entendimiento respecto a los Listados de Asistencias - Actividades', 1.0, 35, 41),
(6, 27, 'Marzo - Semana 7', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 7, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de la Planilla de certificación SNIES', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de la Planilla de certificación SNIES
Link Tutorial:', 2.0, 42, 48),
(6, 28, 'Marzo - Semana 7', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 7, 'Responder evaluación de entendimiento con respecto a los tutoriales de la Planilla de certificación SNIES', 'Responder la evaluación de entendimiento respecto a la Planilla de certificación SNIES', 1.0, 42, 48),
(6, 29, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Visualizar el tutorial de gestión documental con respecto al diligenciamiento de la Carta de reconocimiento', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso de diligenciamiento de la Carta de reconocimiento
Link Tutorial:', 1.0, 49, 55),
(6, 30, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Responder evaluación de entendimiento con respecto a los tutoriales de la Carta de reconocimiento', 'Responder la evaluación de entendimiento respecto a la Carta de reconocimiento', 1.0, 49, 55),
(6, 31, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Visualizar el tutorial con respecto a la elaboración de los Videos testimoniales - Aliado y Beneficiarios', 'Ver el recurso audiovisual diseñado por el área de Proyección Social como herramienta de acompañamiento, que explica de manera clara y práctica el proceso elaboración de los Videos testimoniales - Aliado y Beneficiarios
Link Tutorial:', 1.0, 49, 55),
(6, 32, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Responder evaluación de entendimiento con respecto a la elaboración de los Videos testimoniales - Aliado y Beneficiarios', 'Responder la evaluación de entendimientoc respecto a la elaboración de los Videos testimoniales - Aliado y Beneficiarios', 1.0, 49, 55),
(6, 33, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Elaborar el plan de trabajo de acuerdo con los indicadores asignados', 'Diligenciar formulario del plan de trabajo 2026A
https://forms.gle/AQ4Vgs7angvANv4i9', 3.0, 49, 55),
(6, 34, 'Abril - Semana 8 (SEMANA SANTA)', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'abril', 8, 'Lectura y evaluación de las funciones de un docente de Proyección social.', 'Leer las funciones y el perfil de un docente de Proyección Social y responder la evaluación de entendimiento respecto al Formato de Voluntariado

Link Perfil y funciones ubicado en la carpeta Documentos Generales: https://drive.google.com/file/d/1lKAaiHHsknZeA_p-4611xleUzyR9OC-M/view?usp=sharing

Link evaluación de entendimiento:', 0.0, 49, 55),
(6, 1, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Identificación y relacionamiento de actores externos para firma de nuevo convenio', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 17.0, 0, 6),
(6, 2, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Diligenciar el Mapeo de Actores indicando los dos actores de los dos convenios de proyección social que se van a dinamizar', 'Diligenciar link formulario Mapeo de Actores
https://forms.gle/AbBtVpkhCafmVgKS8', 1.0, 0, 6),
(6, 3, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Realizar la reunión con el actor externo de acuerdo con el formato de Acta de reunión con actores externos', 'Cargar PDF del Acta de reunión firmada por actor externo y docente de proyección social, y fotografías (pantallazos o link de la grabación de la reunión)
Link ejemplo ubicado en la carpeta Documentos Generales - Acta de reunión proyectos: 

https://drive.google.com/drive/u/0/folders/1oWqVuiKeQaVIimH8Ea0yZpA-xkSS-Udd', 3.0, 0, 6),
(6, 4, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Anexos Convenio nuevo', 'Cargar Cédula del representante legal, RUT de la entidad y Cámara de comercio (o Acta de posesión o documento que otorgue las facultades al representante legal para firmar convenios) del actor con el cual se firmará convenio', 6.0, 0, 6),
(6, 5, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Minuta de convenio firmada por parte del actor externo', 'Cargar PDF del convenio firmado por el actor externo en la respectiva carpeta del docente (Alianzas y relacionamiento)', 5.0, 0, 6),
(6, 6, 'Mayo - Semana 13', '2. CONVENIOS', 'mayo', 13, 'Solicitar la Carta de reconocimiento firmada por parte de aliado para el Proyecto y/o actividades', 'Cargar PDF Carta de reconocimiento firmada por parte del actor externo
Link ejemplo ubicado en la carpeta Documentos Generales - Carta de reconocimiento actor externo: 
https://drive.google.com/drive/u/0/folders/1Ou60JVP1TVj_fkxvc9VlF6vw_jDM3uGx', 3.0, 84, 90),
(6, 7, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial aliado 1', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 105, 111),
(6, 8, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar vídeo de testimonio: Del aliado del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un aliado del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 4.0, 105, 111),
(6, 9, 'Abril - Semana 12', '2. CONVENIOS', 'abril', 12, 'Solicitar formato de consentimiento informado firmado para uso de imagen del beneficiario 1 del proyecto y/o actividades', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 77, 83),
(6, 10, 'Abril - Semana 12', '2. CONVENIOS', 'abril', 12, 'Solicitar vídeo de testimonio: De beneficiario 1 del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un beneficiario del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 2.0, 77, 83),
(6, 11, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar formato de consentimiento informado firmado para uso de imagen del beneficiario 2 del proyecto y/o actividades', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 105, 111),
(6, 12, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar vídeo de testimonio: De beneficiario 2 del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un beneficiario del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 2.0, 105, 111),
(6, 1, 'Mayo - Semana 16', '3. PROYECTO 1 - MARZO', 'mayo', 16, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Proyecto 1', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 105, 111),
(6, 2, 'Marzo - Semana 4', '3. PROYECTO 1 - MARZO', 'marzo', 4, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Proyecto 1', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 21, 27),
(6, 3, 'Marzo - Semana 4', '3. PROYECTO 1 - MARZO', 'marzo', 4, 'Elaboración de contenidos - Sesión  1- Proyecto1', 'Cargar presentación en PPT de la sesión 1   del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 21, 27),
(6, 4, 'Marzo - Semana 5', '3. PROYECTO 1 - MARZO', 'marzo', 5, 'Elaboración de contenidos - Sesión  2- Proyecto1', 'Cargar presentación en PPT de la sesión  2 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 28, 34),
(6, 5, 'Marzo - Semana 6', '3. PROYECTO 1 - MARZO', 'marzo', 6, 'Elaboración de contenidos - Sesión  3- Proyecto1', 'Cargar presentación en PPT de la sesión 3 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 35, 41),
(6, 6, 'Marzo - Semana 7', '3. PROYECTO 1 - MARZO', 'marzo', 7, 'Elaboración de contenidos - Sesión  4- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 42, 48),
(6, 7, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. PROYECTO 1 - MARZO', 'abril', 9, 'Elaboración de contenidos - Sesión  5- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 56, 62),
(6, 8, 'Marzo - Semana 6', '3. PROYECTO 1 - MARZO', 'marzo', 6, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación
Proyecto 1', 'Proyecto virtual: Cargar link del formulario de medición de entendimiento
Proyecto presencial: Cargar formato en Word de medición de entendimiento
Link ejemplo ubicado en la carpeta Documentos Generales - Medición de entendimiento: 
https://drive.google.com/drive/u/1/folders/113Q4h3yTT_QizkBePCRHjH-i4THYP9lL', 6.0, 35, 41),
(6, 9, 'Marzo - Semana 6', '3. PROYECTO 1 - MARZO', 'marzo', 6, 'Elaborar la Evaluación de satisfacción para revisión y aprobación
Proyecto 1', 'Proyecto presencial: Imprimir formato en Word con preguntas de Evaluación de satisfacción
Proyecto virtual: Duplicar el formulario de Google forms con preguntas de Evaluación de satisfacción 

Link formatos ejemplo ubicado en la carpeta Documentos Generales - Evaluación de satisfacción: https://drive.google.com/drive/u/1/folders/16atS6_BjcyPtBDkbMnDuO_U8W6tWfIAd', 2.0, 35, 41),
(6, 10, 'Marzo - Semana 7', '3. PROYECTO 1 - MARZO', 'marzo', 7, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación, con total de beneficiarios, participantes en la primera sesión o población proyectada en el plan de trabajo 
Proyecto 1', 'Cargar en formato Word la Nota concepto y el presupuesto en formato Excel para revisión y aprobación

Link ejemplo ubicado en la carpeta Documentos Generales - Nota concepto y presupuesto:
https://drive.google.com/drive/u/1/folders/10f_uhrnSqxBIcpqtnK95mdOwulqRvO-r', 8.0, 42, 48),
(6, 11, 'Marzo - Semana 5', '3. PROYECTO 1 - MARZO', 'marzo', 5, 'Inicio del proyecto, implementación primera sesión. 
Proyecto 1', 'Implementar la Sesión #1 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 28, 34),
(6, 12, 'Marzo - Semana 6', '3. PROYECTO 1 - MARZO', 'marzo', 6, 'Correo invitación sesión 2 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 35, 41),
(6, 13, 'Marzo - Semana 6', '3. PROYECTO 1 - MARZO', 'marzo', 6, 'Implementación sesión #2
Proyecto 1', 'Implementar la Sesión #2 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 35, 41),
(6, 14, 'Marzo - Semana 7', '3. PROYECTO 1 - MARZO', 'marzo', 7, 'Correo invitación sesión 3 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 42, 48),
(6, 15, 'Marzo - Semana 7', '3. PROYECTO 1 - MARZO', 'marzo', 7, 'Implementación sesión #3
Proyecto 1', 'Implementar la Sesión #3 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 42, 48),
(6, 16, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. PROYECTO 1 - MARZO', 'abril', 9, 'Correo invitación sesión 4 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 56, 62),
(6, 17, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. PROYECTO 1 - MARZO', 'abril', 9, 'Implementación sesión #4
Proyecto 1', 'Implementar la Sesión #4 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 56, 62),
(6, 18, 'Abril - Semana 10', '3. PROYECTO 1 - MARZO', 'abril', 10, 'Correo invitación sesión 5 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 63, 69),
(6, 19, 'Abril - Semana 10', '3. PROYECTO 1 - MARZO', 'abril', 10, 'Implementación sesión #5
Proyecto 1', 'Implementar la Sesión #5 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 63, 69),
(6, 20, 'Abril - Semana 10', '3. PROYECTO 1 - MARZO', 'abril', 10, 'Aplicar la Evaluación de satisfacción y cargar en drive el consolidado 
Proyecto 1', 'Proyecto presencial: Cargar PDF de respuestas escaneadas de la Evaluación de satisfacción aplicada
Proyecto virtual: Cargar Excel formulario de respuestas de la Evaluación de satisfacción aplicada', 4.0, 63, 69),
(6, 21, 'Abril - Semana 10', '3. PROYECTO 1 - MARZO', 'abril', 10, 'Aplicar la Medición Apropiación de Conocimiento y cargar en drive el consolidado
Proyecto 1', 'Medición de entendimiento aplicada
Proyecto presencial: Cargar PDF de respuestas escaneadas y calificadas
Proyecto virtual: Cargar Excel formulario de respuestas de la medición de entendimiento aplicada', 6.0, 63, 69),
(6, 22, 'Abril - Semana 10', '3. PROYECTO 1 - MARZO', 'abril', 10, 'Aplicar y cargar los formatos de listados de asistencia 
Proyecto 1', 'Proyecto presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Proyecto virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia: https://drive.google.com/drive/u/0/folders/1sDvb1ejteLgIquCK5naJCeYhy5TbHr6T

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 6.0, 63, 69),
(6, 23, 'Abril - Semana 11', '3. PROYECTO 1 - MARZO', 'abril', 11, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto
Proyecto 1', 'Proyecto presencial: Cargar fotografías por cada sesión del proyecto
Proyecto virtual: Cargar pantallazos y la grabación de cada sesión del proyecto', 4.0, 70, 76),
(6, 24, 'Abril - Semana 11', '3. PROYECTO 1 - MARZO', 'abril', 11, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo
Proyecto 1', 'Cargar PDF Nota concepto del proyecto firmada por docente y actor externo', 5.0, 70, 76),
(6, 25, 'Abril - Semana 11', '3. PROYECTO 1 - MARZO', 'abril', 11, 'Diligenciar la planilla de certificación SNIES 
Proyecto #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia y cruce de asistencias para determinar quienes cumplen el requisito de participación para certificarse
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1nZnAoRYEllXGqTkeaxgKgAFGVxpXQZXI', 5.0, 70, 76),
(6, 1, 'Abril - Semana 8 (SEMANA SANTA)', '4. PROYECTO 2 -  MARZO', 'abril', 8, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Proyecto 1', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 49, 55),
(6, 2, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO 2 -  MARZO', 'abril', 9, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Proyecto 2', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 56, 62),
(6, 3, 'Abril - Semana 8 (SEMANA SANTA)', '4. PROYECTO 2 -  MARZO', 'abril', 8, 'Elaboración de contenidos - Sesión  1- Proyecto 2', 'Cargar presentación en PPT de la sesión 1   del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 49, 55),
(6, 4, 'Abril - Semana 10', '4. PROYECTO 2 -  MARZO', 'abril', 10, 'Elaboración de contenidos - Sesión  2- Proyecto1', 'Cargar presentación en PPT de la sesión  2 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 63, 69),
(6, 5, 'Abril - Semana 11', '4. PROYECTO 2 -  MARZO', 'abril', 11, 'Elaboración de contenidos - Sesión  3- Proyecto1', 'Cargar presentación en PPT de la sesión 3 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 70, 76),
(6, 6, 'Abril - Semana 12', '4. PROYECTO 2 -  MARZO', 'abril', 12, 'Elaboración de contenidos - Sesión  4- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 77, 83),
(6, 7, 'Mayo - Semana 13', '4. PROYECTO 2 -  MARZO', 'mayo', 13, 'Elaboración de contenidos - Sesión  5- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 84, 90),
(6, 8, 'Abril - Semana 8 (SEMANA SANTA)', '4. PROYECTO 2 -  MARZO', 'abril', 8, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación
Proyecto 1', 'Proyecto virtual: Cargar link del formulario de medición de entendimiento
Proyecto presencial: Cargar formato en Word de medición de entendimiento
Link ejemplo ubicado en la carpeta Documentos Generales - Medición de entendimiento: 
https://drive.google.com/drive/u/1/folders/113Q4h3yTT_QizkBePCRHjH-i4THYP9lL', 6.0, 49, 55),
(6, 9, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO 2 -  MARZO', 'abril', 9, 'Elaborar la Evaluación de satisfacción para revisión y aprobación
Proyecto 1', 'Proyecto presencial: Imprimir formato en Word con preguntas de Evaluación de satisfacción
Proyecto virtual: Duplicar el formulario de Google forms con preguntas de Evaluación de satisfacción 

Link formatos ejemplo ubicado en la carpeta Documentos Generales - Evaluación de satisfacción: https://drive.google.com/drive/u/1/folders/16atS6_BjcyPtBDkbMnDuO_U8W6tWfIAd', 2.0, 56, 62),
(6, 10, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO 2 -  MARZO', 'abril', 9, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación, con total de beneficiarios, participantes en la primera sesión o población proyectada en el plan de trabajo 
Proyecto 1', 'Cargar en formato Word la Nota concepto y el presupuesto en formato Excel para revisión y aprobación

Link ejemplo ubicado en la carpeta Documentos Generales - Nota concepto y presupuesto:
https://drive.google.com/drive/u/1/folders/10f_uhrnSqxBIcpqtnK95mdOwulqRvO-r', 8.0, 56, 62),
(6, 11, 'Abril - Semana 10', '4. PROYECTO 2 -  MARZO', 'abril', 10, 'Inicio del proyecto, implementación primera sesión. 
Proyecto 1', 'Implementar la Sesión #1 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 63, 69),
(6, 12, 'Abril - Semana 11', '4. PROYECTO 2 -  MARZO', 'abril', 11, 'Correo invitación sesión 2 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 70, 76),
(6, 13, 'Abril - Semana 11', '4. PROYECTO 2 -  MARZO', 'abril', 11, 'Implementación sesión #2
Proyecto 1', 'Implementar la Sesión #2 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 70, 76),
(6, 14, 'Abril - Semana 12', '4. PROYECTO 2 -  MARZO', 'abril', 12, 'Correo invitación sesión 3 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 77, 83),
(6, 15, 'Abril - Semana 12', '4. PROYECTO 2 -  MARZO', 'abril', 12, 'Implementación sesión #3
Proyecto 1', 'Implementar la Sesión #3 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 77, 83),
(6, 16, 'Mayo - Semana 13', '4. PROYECTO 2 -  MARZO', 'mayo', 13, 'Correo invitación sesión 4 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 84, 90),
(6, 17, 'Mayo - Semana 13', '4. PROYECTO 2 -  MARZO', 'mayo', 13, 'Implementación sesión #4
Proyecto 1', 'Implementar la Sesión #4 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 84, 90),
(6, 18, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Correo invitación sesión 5 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 91, 97),
(6, 19, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Implementación sesión #5
Proyecto 1', 'Implementar la Sesión #5 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 91, 97),
(6, 20, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Aplicar la Evaluación de satisfacción y cargar en drive el consolidado 
Proyecto 1', 'Proyecto presencial: Cargar PDF de respuestas escaneadas de la Evaluación de satisfacción aplicada
Proyecto virtual: Cargar Excel formulario de respuestas de la Evaluación de satisfacción aplicada', 4.0, 91, 97),
(6, 21, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Aplicar la Medición Apropiación de Conocimiento y cargar en drive el consolidado
Proyecto 1', 'Medición de entendimiento aplicada
Proyecto presencial: Cargar PDF de respuestas escaneadas y calificadas
Proyecto virtual: Cargar Excel formulario de respuestas de la medición de entendimiento aplicada', 6.0, 91, 97),
(6, 22, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Aplicar y cargar los formatos de listados de asistencia 
Proyecto 1', 'Proyecto presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Proyecto virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia: https://drive.google.com/drive/u/0/folders/1sDvb1ejteLgIquCK5naJCeYhy5TbHr6T

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 6.0, 91, 97),
(6, 23, 'Mayo - Semana 14', '4. PROYECTO 2 -  MARZO', 'mayo', 14, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto
Proyecto 1', 'Proyecto presencial: Cargar fotografías por cada sesión del proyecto
Proyecto virtual: Cargar pantallazos y la grabación de cada sesión del proyecto', 4.0, 91, 97),
(6, 24, 'Mayo - Semana 15', '4. PROYECTO 2 -  MARZO', 'mayo', 15, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo
Proyecto 1', 'Cargar PDF Nota concepto del proyecto firmada por docente y actor externo', 5.0, 98, 104),
(6, 25, 'Mayo - Semana 15', '4. PROYECTO 2 -  MARZO', 'mayo', 15, 'Diligenciar la planilla de certificación SNIES 
Proyecto #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia y cruce de asistencias para determinar quienes cumplen el requisito de participación para certificarse
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1nZnAoRYEllXGqTkeaxgKgAFGVxpXQZXI', 5.0, 98, 104),
(6, 1, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Proyecto 3', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 98, 104),
(6, 2, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Proyecto 3', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 98, 104),
(6, 3, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  1- Proyecto 3', 'Cargar presentación en PPT de la sesión 1   del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 4, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  2- Proyecto1', 'Cargar presentación en PPT de la sesión  2 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 5, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  3- Proyecto1', 'Cargar presentación en PPT de la sesión 3 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 6, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  4- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 7, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  5- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 8, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación
Proyecto 1', 'Proyecto virtual: Cargar link del formulario de medición de entendimiento
Proyecto presencial: Cargar formato en Word de medición de entendimiento
Link ejemplo ubicado en la carpeta Documentos Generales - Medición de entendimiento: 
https://drive.google.com/drive/u/1/folders/113Q4h3yTT_QizkBePCRHjH-i4THYP9lL', 6.0, 98, 104),
(6, 9, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaborar la Evaluación de satisfacción para revisión y aprobación
Proyecto 1', 'Proyecto presencial: Imprimir formato en Word con preguntas de Evaluación de satisfacción
Proyecto virtual: Duplicar el formulario de Google forms con preguntas de Evaluación de satisfacción 

Link formatos ejemplo ubicado en la carpeta Documentos Generales - Evaluación de satisfacción: https://drive.google.com/drive/u/1/folders/16atS6_BjcyPtBDkbMnDuO_U8W6tWfIAd', 2.0, 98, 104),
(6, 10, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación, con total de beneficiarios, participantes en la primera sesión o población proyectada en el plan de trabajo 
Proyecto 1', 'Cargar en formato Word la Nota concepto y el presupuesto en formato Excel para revisión y aprobación

Link ejemplo ubicado en la carpeta Documentos Generales - Nota concepto y presupuesto:
https://drive.google.com/drive/u/1/folders/10f_uhrnSqxBIcpqtnK95mdOwulqRvO-r', 8.0, 98, 104),
(6, 11, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Inicio del proyecto, implementación primera sesión. 
Proyecto 1', 'Implementar la Sesión #1 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 12, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Correo invitación sesión 2 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 13, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Implementación sesión #2
Proyecto 1', 'Implementar la Sesión #2 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 14, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Correo invitación sesión 3 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 15, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Implementación sesión #3
Proyecto 1', 'Implementar la Sesión #3 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 16, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Correo invitación sesión 4 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 17, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Implementación sesión #4
Proyecto 1', 'Implementar la Sesión #4 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 18, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Correo invitación sesión 5 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 19, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Implementación sesión #5
Proyecto 1', 'Implementar la Sesión #5 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 20, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Aplicar la Evaluación de satisfacción y cargar en drive el consolidado 
Proyecto 1', 'Proyecto presencial: Cargar PDF de respuestas escaneadas de la Evaluación de satisfacción aplicada
Proyecto virtual: Cargar Excel formulario de respuestas de la Evaluación de satisfacción aplicada', 4.0, 98, 104),
(6, 21, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Aplicar la Medición Apropiación de Conocimiento y cargar en drive el consolidado
Proyecto 1', 'Medición de entendimiento aplicada
Proyecto presencial: Cargar PDF de respuestas escaneadas y calificadas
Proyecto virtual: Cargar Excel formulario de respuestas de la medición de entendimiento aplicada', 6.0, 98, 104),
(6, 22, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Aplicar y cargar los formatos de listados de asistencia 
Proyecto 1', 'Proyecto presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Proyecto virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia: https://drive.google.com/drive/u/0/folders/1sDvb1ejteLgIquCK5naJCeYhy5TbHr6T

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 6.0, 98, 104),
(6, 23, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto
Proyecto 1', 'Proyecto presencial: Cargar fotografías por cada sesión del proyecto
Proyecto virtual: Cargar pantallazos y la grabación de cada sesión del proyecto', 4.0, 98, 104),
(6, 24, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo
Proyecto 1', 'Cargar PDF Nota concepto del proyecto firmada por docente y actor externo', 5.0, 98, 104),
(6, 25, 'Mayo - Semana 15', '5. PROYECTO 3 -  MARZO', 'mayo', 15, 'Diligenciar la planilla de certificación SNIES 
Proyecto #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia y cruce de asistencias para determinar quienes cumplen el requisito de participación para certificarse
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1nZnAoRYEllXGqTkeaxgKgAFGVxpXQZXI', 5.0, 98, 104),
(6, 1, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Proyecto 4', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 98, 104),
(6, 2, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Proyecto 4', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 98, 104),
(6, 3, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  1- Proyecto 4', 'Cargar presentación en PPT de la sesión 1   del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 4, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  2- Proyecto1', 'Cargar presentación en PPT de la sesión  2 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 5, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  3- Proyecto1', 'Cargar presentación en PPT de la sesión 3 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 6, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  4- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 7, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaboración de contenidos - Sesión  5- Proyecto1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 98, 104),
(6, 8, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación
Proyecto 1', 'Proyecto virtual: Cargar link del formulario de medición de entendimiento
Proyecto presencial: Cargar formato en Word de medición de entendimiento
Link ejemplo ubicado en la carpeta Documentos Generales - Medición de entendimiento: 
https://drive.google.com/drive/u/1/folders/113Q4h3yTT_QizkBePCRHjH-i4THYP9lL', 6.0, 98, 104),
(6, 9, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaborar la Evaluación de satisfacción para revisión y aprobación
Proyecto 1', 'Proyecto presencial: Imprimir formato en Word con preguntas de Evaluación de satisfacción
Proyecto virtual: Duplicar el formulario de Google forms con preguntas de Evaluación de satisfacción 

Link formatos ejemplo ubicado en la carpeta Documentos Generales - Evaluación de satisfacción: https://drive.google.com/drive/u/1/folders/16atS6_BjcyPtBDkbMnDuO_U8W6tWfIAd', 2.0, 98, 104),
(6, 10, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación, con total de beneficiarios, participantes en la primera sesión o población proyectada en el plan de trabajo 
Proyecto 1', 'Cargar en formato Word la Nota concepto y el presupuesto en formato Excel para revisión y aprobación

Link ejemplo ubicado en la carpeta Documentos Generales - Nota concepto y presupuesto:
https://drive.google.com/drive/u/1/folders/10f_uhrnSqxBIcpqtnK95mdOwulqRvO-r', 8.0, 98, 104),
(6, 11, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Inicio del proyecto, implementación primera sesión. 
Proyecto 1', 'Implementar la Sesión #1 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 12, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Correo invitación sesión 2 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 13, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Implementación sesión #2
Proyecto 1', 'Implementar la Sesión #2 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 14, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Correo invitación sesión 3 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 15, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Implementación sesión #3
Proyecto 1', 'Implementar la Sesión #3 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 16, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Correo invitación sesión 4 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 17, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Implementación sesión #4
Proyecto 1', 'Implementar la Sesión #4 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 18, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Correo invitación sesión 5 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 98, 104),
(6, 19, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Implementación sesión #5
Proyecto 1', 'Implementar la Sesión #5 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 98, 104),
(6, 20, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Aplicar la Evaluación de satisfacción y cargar en drive el consolidado 
Proyecto 1', 'Proyecto presencial: Cargar PDF de respuestas escaneadas de la Evaluación de satisfacción aplicada
Proyecto virtual: Cargar Excel formulario de respuestas de la Evaluación de satisfacción aplicada', 4.0, 98, 104),
(6, 21, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Aplicar la Medición Apropiación de Conocimiento y cargar en drive el consolidado
Proyecto 1', 'Medición de entendimiento aplicada
Proyecto presencial: Cargar PDF de respuestas escaneadas y calificadas
Proyecto virtual: Cargar Excel formulario de respuestas de la medición de entendimiento aplicada', 6.0, 98, 104),
(6, 22, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Aplicar y cargar los formatos de listados de asistencia 
Proyecto 1', 'Proyecto presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Proyecto virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia: https://drive.google.com/drive/u/0/folders/1sDvb1ejteLgIquCK5naJCeYhy5TbHr6T

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 6.0, 98, 104),
(6, 23, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto
Proyecto 1', 'Proyecto presencial: Cargar fotografías por cada sesión del proyecto
Proyecto virtual: Cargar pantallazos y la grabación de cada sesión del proyecto', 4.0, 98, 104),
(6, 24, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo
Proyecto 1', 'Cargar PDF Nota concepto del proyecto firmada por docente y actor externo', 5.0, 98, 104),
(6, 25, 'Mayo - Semana 15', '6. PROYECTO 4 -  MARZO', 'mayo', 15, 'Diligenciar la planilla de certificación SNIES 
Proyecto #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia y cruce de asistencias para determinar quienes cumplen el requisito de participación para certificarse
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1nZnAoRYEllXGqTkeaxgKgAFGVxpXQZXI', 5.0, 98, 104),
(6, 1, 'Mayo - Semana 15', '7. PRESUPUESTO', 'mayo', 15, 'Firmar del formato “Autorización de Descuento de Nómina”', 'Enviar el documento debidamente firmado, en formato PDF al correo de Proyección Social (Proyeccion_social@cun.edu.co).', 1.0, 98, 104),
(6, 2, 'Mayo - Semana 15', '7. PRESUPUESTO', 'mayo', 15, 'Firma y relación de cuenta bancaria en el formato “Solicitud de Gastos de Viaje”', 'Enviar el documento debidamente firmado, en formato PDF al correo de Proyección Social (Proyeccion_social@cun.edu.co).
Recomendaciones:
1. El titular de la cuenta debe ser el docente.
2. En caso de no contar con Nequi o Daviplata, relacionar el número de cuenta de nómina y adjuntar el Certificado Bancario.', 1.0, 98, 104),
(6, 3, 'Mayo - Semana 15', '7. PRESUPUESTO', 'mayo', 15, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado - Marzo', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 98, 104),
(6, 4, 'Mayo - Semana 15', '7. PRESUPUESTO', 'mayo', 15, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado. - Abril', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 98, 104),
(6, 5, 'Mayo - Semana 15', '7. PRESUPUESTO', 'mayo', 15, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado - Mayo', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 98, 104),
(6, 1, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Solicitud salones para iniciativas presenciales en sedes Cunistas', 'Enviar solicitud de salón vía correo eléctronico con copia al líder del programa,  liliana_villamizar@cun.edu.co y analísta o gestor asignado del área de proyección social.
Cargar una captura de pantalla del envío del correo electrónico en la carpeta correspondiente.', 3.0, 98, 104),
(6, 2, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Solicitud de certificado de ARL para translados del docente 
Nota: Aplica únicamente cuando el/la docente deba desplazarse a otro municipio o ciudad diferente a su lugar habitual de trabajo. No aplica para traslados dentro de la misma ciudad.', 'Enviar correo eléctronico al área de seguridad y salud en el trabajo, solicitando certificado de ARL para translados fuera del lugar de trabajo.
Cargar una captura de pantalla del envío del correo electrónico en la carpeta correspondiente.', 1.0, 98, 104),
(6, 3, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Revisión y ajustes de gestión documental', 'Espacio destinado para verificar que la gestión documental se encuentre completa y correctamente elaborada.', 9.0, 98, 104),
(6, 4, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Solicitud de carta de voluntario firmado por el ponente o conferencista invitado que va a impartir la capacitación y/o sesión del proyecto', 'Diligenciar documento formato de voluntariado por parte de ponente invitado a capacitación
https://docs.google.com/document/d/196XkDmBKi-FMoAEyyqEjvVbvJTER5hMR/edit', 4.0, 98, 104),
(6, 5, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Solicitar formato de consentimiento informado firmado para uso de imagen', 'Cargar el formato de consentimiento informado debidamente firmado que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 98, 104),
(6, 6, 'Mayo - Semana 15', '8. ENTREGABLES VARIOS', 'mayo', 15, 'Generar vídeo de testimonio Docente con relación a su experiencia como docente de proyección social', 'Cargar vídeos testimoniales: Docente del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/1/folders/1YJKs6nlr1vlISodCUA1m3dx2MpJjtEOQ', 1.0, 98, 104);


-- Grupo 13 (88 filas)
DELETE FROM plantilla_entregables WHERE grupo_id = 13;

INSERT INTO plantilla_entregables (grupo_id, numero, categoria, fase, mes, semana_numero, entregable, descripcion_evidencia, horas, dias_inicio_desde_feb, dias_fin_desde_feb) VALUES
(13, 1, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Lectura y evaluación de la Política de Proyección Social', 'Responder la evaluación de entendimiento respecto a la Política de Proyección Social 
https://forms.gle/fskpYxEccnS7zFKt5', 2.0, 0, 6),
(13, 2, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Diligenciar formulario de Compromiso docente', 'Responder formulario de compromiso docente

Link: https://forms.gle/4R8LUrEf7zYyKFQA8', 1.0, 0, 6),
(13, 3, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Participar en la Socialización de Lineamientos de Proyección Social
(Generalidades del área PS, Resultados destacados PS, Socialización Indicadores, Programación del semestre, Lineamientos de seguimiento y monitoreo docente)', 'Participar activamente del evento de Socialización de Lineamientos de Proyección Social previamente agendado en Calendar', 3.0, 0, 6),
(13, 4, 'Febrero - Semana 1', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 1, 'Responder evaluación con respecto a la  Socialización de Lineamientos de Proyección Social', 'Responder la evaluación de entendimiento respecto a la Socialización de Lineamientos de Proyección Social

Link de evaluación de entendimiento medio tiempo: https://forms.gle/C4rtxRSQdKNrihuGA
Link de evaluación de entendimiento tiempo completo: https://forms.gle/KsjtXXCfQzG3qgh38', 1.0, 0, 6),
(13, 5, 'Febrero - Semana 2', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 2, 'Participar en la Capacitación en formatos y entregables de proyección social
 
Capacitación 1: 
Convenios, indicadores, acta de reunión, matriz de segumiento, que hace el docente de Proyección Social', 'Participar activamente del evento de Capacitación 1: Formatos y entregables de Proyección Social previamente agendado en Calendar', 3.0, 7, 13),
(13, 6, 'Febrero - Semana 2', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 2, 'Responder evaluación con respecto a la Capacitación 1: 
 (Convenios, indicadores, acta de reunión, matriz de segumiento, que hace el docente de Proyección Social)', 'Responder la evaluación de entendimiento respecto a los formatos y entregables de proyección social

Link de evaluación de entendimiento medio tiempo: https://forms.gle/GWtRQ7tbrZX6gcPq7
Link de evaluación de entendimiento tiempo completo: https://forms.gle/xKA75Jj15U2FVT5MA', 1.0, 7, 13),
(13, 7, 'Febrero - Semana 2', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 2, 'Participar en la Capacitación en formatos y entregables de proyección social
 
Capacitación 2: 
 Mapeo de actores, plan de trabajo, solicitud de pieza, formulario de inscripción, practica social, formato de voluntariado', 'Participar activamente del evento de Capacitación 2: en formatos y entregables de Proyección Social previamente agendado en Calendar', 3.0, 7, 13),
(13, 8, 'Febrero - Semana 2', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 2, 'Responder evaluación con respecto a la Capacitación 2: 
 (Mapeo de actores, plan de trabajo, solicitud de pieza, formulario de inscripción, Practica Social)', 'Responder la evaluación de entendimiento respecto a los formatos y entregables de proyección social

Link de evaluación de entendimiento medio tiempo: https://forms.gle/ZtBxbmyThXKqUTtf6
Link de evaluación de entendimiento tiempo completo: https://forms.gle/jhmK1LwgzPVbLtoM8', 1.0, 7, 13),
(13, 11, 'Febrero - Semana 3', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 3, 'Participar en la Capacitación en formatos y entregables de proyección social
 
Capacitación 3: 
Gestión documental de Actividades de Proyección Social', 'Participar activamente del evento de Capacitación 3: en formatos y entregables de proyección social previamente agendado en Calendar', 3.0, 14, 20),
(13, 12, 'Febrero - Semana 3', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'febrero', 3, 'Responder evaluación con respecto a la Capacitación 3: 
 (Gestión documental de Actividades de Proyección Social)', 'Responder la evaluación de entendimiento respecto a los formatos y entregables de proyección social

Link de evaluación de entendimiento medio tiempo: https://forms.gle/JL3D6EpHq6Rr2qso8
Link de evaluación de entendimiento tiempo completo: https://forms.gle/QQmSGUQdMgFgKeTC9', 1.0, 14, 20),
(13, 9, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Participar en la capacitación en formatos y entregables de proyección social 2026B

Capacitación 4:  
(Nota Concepto, Presupuesto, Registro fotográfico, medición de entendimiento, encuesta de satisfacción.)', 'Participar activamente del evento de  Capacitación en formatos y entregables de proyección social - Capcitación 3 previamente agendado en Calendar', 3.0, 21, 27),
(13, 10, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Responder evaluación con respecto a la Capacitación 4 : 
(Nota Concepto, Presupuesto, Registro fotográfico, medición de entendimiento, encuesta de satisfacción.)', 'Responder la evaluación de entendimiento respecto a los formatos y entregables de proyección social y Cargar una captura de pantalla del diligenciamiento de formulario.', 1.0, 21, 27),
(13, 13, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Elaborar el plan de trabajo de acuerdo con los indicadores asignados', 'Diligenciar formulario del plan de trabajo 2026A
https://forms.gle/AQ4Vgs7angvANv4i9', 3.0, 21, 27),
(13, 14, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Repaso de la socialización de lineamientos de Proyección Social', 'Ver grabación del encuentro
Link grabación:', 3.0, 21, 27),
(13, 15, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Repaso de entregables: Compromiso docente y política de Proyección social', 'Espacio destinado para el repaso de las funciones como docente de proyección social designadas en el formulario de compromiso docente y repaso de la política de proyección social', 3.0, 21, 27),
(13, 34, 'Marzo - Semana 4', '1. CAPACITACIÓN Y ASISTENCIA TÉCNICA', 'marzo', 4, 'Lectura y evaluación de las funciones de un docente de Proyección social.', 'Leer las funciones y el perfil de un docente de Proyección Social y responder la evaluación de entendimiento respecto al Formato de Voluntariado

Link Perfil y funciones ubicado en la carpeta Documentos Generales: https://drive.google.com/file/d/1lKAaiHHsknZeA_p-4611xleUzyR9OC-M/view?usp=sharing

Link evaluación de entendimiento:', 0.0, 21, 27),
(13, 1, 'Febrero - Semana 1', '2. CONVENIOS', 'febrero', 1, 'Identificación y relacionamiento de actores externos para firma de nuevo convenio', 'Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 17.0, 0, 6),
(13, 2, 'Febrero - Semana 2', '2. CONVENIOS', 'febrero', 2, 'Diligenciar el Mapeo de Actores indicando los dos actores de los dos convenios de proyección social que se van a dinamizar', 'Diligenciar link formulario Mapeo de Actores
https://forms.gle/AbBtVpkhCafmVgKS8', 1.0, 7, 13),
(13, 3, 'Febrero - Semana 2', '2. CONVENIOS', 'febrero', 2, 'Realizar la reunión con el actor externo de acuerdo con el formato de Acta de reunión con actores externos', 'Cargar PDF del Acta de reunión firmada por actor externo y docente de proyección social, y fotografías (pantallazos o link de la grabación de la reunión)
Link ejemplo ubicado en la carpeta Documentos Generales - Acta de reunión proyectos: 

https://drive.google.com/drive/u/0/folders/1oWqVuiKeQaVIimH8Ea0yZpA-xkSS-Udd', 3.0, 7, 13),
(13, 4, 'Febrero - Semana 3', '2. CONVENIOS', 'febrero', 3, 'Anexos Convenio nuevo', 'Cargar Cédula del representante legal, RUT de la entidad y Cámara de comercio (o Acta de posesión o documento que otorgue las facultades al representante legal para firmar convenios) del actor con el cual se firmará convenio', 6.0, 14, 20),
(13, 5, 'Febrero - Semana 3', '2. CONVENIOS', 'febrero', 3, 'Minuta de convenio firmada por parte del actor externo', 'Cargar PDF del convenio firmado por el actor externo en la respectiva carpeta del docente (Alianzas y relacionamiento)', 5.0, 14, 20),
(13, 6, 'Mayo - Semana 15', '2. CONVENIOS', 'mayo', 15, 'Solicitar la Carta de reconocimiento firmada por parte de aliado para el Proyecto y/o actividades', 'Cargar PDF Carta de reconocimiento firmada por parte del actor externo
Link ejemplo ubicado en la carpeta Documentos Generales - Carta de reconocimiento actor externo: 
https://drive.google.com/drive/u/0/folders/1Ou60JVP1TVj_fkxvc9VlF6vw_jDM3uGx', 3.0, 98, 104),
(13, 7, 'Mayo - Semana 15', '2. CONVENIOS', 'mayo', 15, 'Solicitar formato de consentimiento informado firmado para uso de imagen del video testimonial aliado 1', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 98, 104),
(13, 8, 'Mayo - Semana 15', '2. CONVENIOS', 'mayo', 15, 'Solicitar vídeo de testimonio: Del aliado del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un aliado del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 4.0, 98, 104),
(13, 9, 'Mayo - Semana 14', '2. CONVENIOS', 'mayo', 14, 'Solicitar formato de consentimiento informado firmado para uso de imagen del beneficiario 1 del proyecto y/o actividades', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 91, 97),
(13, 10, 'Mayo - Semana 14', '2. CONVENIOS', 'mayo', 14, 'Solicitar vídeo de testimonio: De beneficiario 1 del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un beneficiario del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 2.0, 91, 97),
(13, 11, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar formato de consentimiento informado firmado para uso de imagen del beneficiario 2 del proyecto y/o actividades', 'Cargar el formato de consentimiento informado debidamente firmado por el participante que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 105, 111),
(13, 12, 'Mayo - Semana 16', '2. CONVENIOS', 'mayo', 16, 'Solicitar vídeo de testimonio: De beneficiario 2 del proyecto y/o actividades', 'Cargar vídeos testimoniales: Un beneficiario del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1O4t94j54AIB3PsyIestOC3qw75qAqzS4', 2.0, 105, 111),
(13, 1, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 9, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Actividad #1', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 56, 62),
(13, 2, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 9, 'Elaboración de contenidos - Actividad #1', 'Cargar presentación en PPT. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 56, 62),
(13, 3, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 9, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Actividad #1 - Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 56, 62),
(13, 4, 'Abril - Semana 10', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 10, 'Implementación - Actividad #1', 'Implementar la actividad en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 63, 69),
(13, 5, 'Abril - Semana 10', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 10, 'Aplicar y cargar los formatos de listados de asistencia 
Actividad 1', 'Actividad presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Actividad virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia:
https://drive.google.com/drive/u/0/folders/1ZTC4bEmOW4Sl23zOY6kcc4OIS9I6-qWp

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 2.0, 63, 69),
(13, 6, 'Abril - Semana 11', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 11, 'Generar registro fotográfico y/o grabación de la actividad
Actividad #1', 'Actividad presencial: Cargar fotografías del desarrollo de la actividad
Actividad virtual: Cargar la grabación y pantallazos del desarrollo de la actividad', 2.0, 70, 76),
(13, 7, 'Abril - Semana 11', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 11, 'Diligenciar la planilla de certificación SNIES 
Actividad #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia.
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1VHfxocyvwgMKZZtXrab7lylWK51CbhBe', 6.0, 70, 76),
(13, 8, 'Abril - Semana 11', '3. ACTIVIDAD No. 1 - MARZO', 'abril', 11, 'Entrega de Acta de actividad firmada por actor externo y docente de proyección social,  y presupuesto en Excel, con total de beneficiarios reportado en la planilla SNIES
Actividad #1', 'Cargar en formato Word del acta de actividad firmada por actor externo y docente de proyección social, y el presupuesto en formato Excel,  

Link ejemplo de acta de actividad y presupuesto ubicado en la carpeta Documentos Generales: 
https://drive.google.com/drive/u/0/folders/1G9wGvnOovsDMF_25s9X4mGsL1ahYpqiH', 4.0, 70, 76),
(13, 1, 'Febrero - Semana 3', '4. PROYECTO - ABRIL', 'febrero', 3, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios xxxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Proyecto 1', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 14, 20),
(13, 2, 'Marzo - Semana 4', '4. PROYECTO - ABRIL', 'marzo', 4, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Proyecto 1', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 21, 27),
(13, 3, 'Marzo - Semana 4', '4. PROYECTO - ABRIL', 'marzo', 4, 'Elaboración de contenidos - Sesión  1- Proyecto 1', 'Cargar presentación en PPT de la sesión 1   del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 21, 27),
(13, 4, 'Marzo - Semana 5', '4. PROYECTO - ABRIL', 'marzo', 5, 'Elaboración de contenidos - Sesión  2- Proyecto 1', 'Cargar presentación en PPT de la sesión  2 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 28, 34),
(13, 5, 'Marzo - Semana 6', '4. PROYECTO - ABRIL', 'marzo', 6, 'Elaboración de contenidos - Sesión  3- Proyecto 1', 'Cargar presentación en PPT de la sesión 3 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 35, 41),
(13, 6, 'Marzo - Semana 7', '4. PROYECTO - ABRIL', 'marzo', 7, 'Elaboración de contenidos - Sesión  4- Proyecto 1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 42, 48),
(13, 7, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO - ABRIL', 'abril', 9, 'Elaboración de contenidos - Sesión  5- Proyecto 1', 'Cargar presentación en PPT de la sesión 4 del proyecto. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 56, 62),
(13, 8, 'Marzo - Semana 6', '4. PROYECTO - ABRIL', 'marzo', 6, 'Elaborar la Medición de entendimiento del proyecto para revisión y aprobación
Proyecto 1', 'Proyecto virtual: Cargar link del formulario de medición de entendimiento
Proyecto presencial: Cargar formato en Word de medición de entendimiento
Link ejemplo ubicado en la carpeta Documentos Generales - Medición de entendimiento: 
https://drive.google.com/drive/u/1/folders/113Q4h3yTT_QizkBePCRHjH-i4THYP9lL', 6.0, 35, 41),
(13, 9, 'Marzo - Semana 6', '4. PROYECTO - ABRIL', 'marzo', 6, 'Elaborar la Evaluación de satisfacción para revisión y aprobación
Proyecto 1', 'Proyecto presencial: Imprimir formato en Word con preguntas de Evaluación de satisfacción
Proyecto virtual: Duplicar el formulario de Google forms con preguntas de Evaluación de satisfacción 

Link formatos ejemplo ubicado en la carpeta Documentos Generales - Evaluación de satisfacción: https://drive.google.com/drive/u/1/folders/16atS6_BjcyPtBDkbMnDuO_U8W6tWfIAd', 2.0, 35, 41),
(13, 10, 'Marzo - Semana 7', '4. PROYECTO - ABRIL', 'marzo', 7, 'Elaborar la Nota concepto preliminar y presupuesto del Proyecto para revisión y aprobación, con total de beneficiarios, participantes en la primera sesión o población proyectada en el plan de trabajo 
Proyecto 1', 'Cargar en formato Word la Nota concepto y el presupuesto en formato Excel para revisión y aprobación

Link ejemplo ubicado en la carpeta Documentos Generales - Nota concepto y presupuesto:
https://drive.google.com/drive/u/1/folders/10f_uhrnSqxBIcpqtnK95mdOwulqRvO-r', 8.0, 42, 48),
(13, 11, 'Marzo - Semana 5', '4. PROYECTO - ABRIL', 'marzo', 5, 'Inicio del proyecto, implementación primera sesión. 
Proyecto 1', 'Implementar la Sesión #1 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 28, 34),
(13, 12, 'Marzo - Semana 6', '4. PROYECTO - ABRIL', 'marzo', 6, 'Correo invitación sesión 2 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 35, 41),
(13, 13, 'Marzo - Semana 6', '4. PROYECTO - ABRIL', 'marzo', 6, 'Implementación sesión #2
Proyecto 1', 'Implementar la Sesión #2 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 35, 41),
(13, 14, 'Marzo - Semana 7', '4. PROYECTO - ABRIL', 'marzo', 7, 'Correo invitación sesión 3 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 42, 48),
(13, 15, 'Marzo - Semana 7', '4. PROYECTO - ABRIL', 'marzo', 7, 'Implementación sesión #3
Proyecto 1', 'Implementar la Sesión #3 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 42, 48),
(13, 16, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO - ABRIL', 'abril', 9, 'Correo invitación sesión 4 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 56, 62),
(13, 17, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '4. PROYECTO - ABRIL', 'abril', 9, 'Implementación sesión #4
Proyecto 1', 'Implementar la Sesión #4 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 56, 62),
(13, 18, 'Abril - Semana 10', '4. PROYECTO - ABRIL', 'abril', 10, 'Correo invitación sesión 5 - Proyecto 1', 'Enviar a los participantes inscritos la grabación y/o presentación de la sesión junto con la invitación a la siguiente sesión y copiar en el correo de invitación a los usuarios: xxxxx@cun.edu.co, proyección social@cun.edu.co

Link ejemplo de correo:
https://drive.google.com/drive/u/0/folders/1yrc8diBFnV6hgU9Ue_TuzG-Uu3dPa_MA', 1.0, 63, 69),
(13, 19, 'Abril - Semana 10', '4. PROYECTO - ABRIL', 'abril', 10, 'Implementación sesión #5
Proyecto 1', 'Implementar la Sesión #5 Proyecto en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 63, 69),
(13, 20, 'Abril - Semana 10', '4. PROYECTO - ABRIL', 'abril', 10, 'Aplicar la Evaluación de satisfacción y cargar en drive el consolidado 
Proyecto 1', 'Proyecto presencial: Cargar PDF de respuestas escaneadas de la Evaluación de satisfacción aplicada
Proyecto virtual: Cargar Excel formulario de respuestas de la Evaluación de satisfacción aplicada', 4.0, 63, 69),
(13, 21, 'Abril - Semana 10', '4. PROYECTO - ABRIL', 'abril', 10, 'Aplicar la Medición Apropiación de Conocimiento y cargar en drive el consolidado
Proyecto 1', 'Medición de entendimiento aplicada
Proyecto presencial: Cargar PDF de respuestas escaneadas y calificadas
Proyecto virtual: Cargar Excel formulario de respuestas de la medición de entendimiento aplicada', 5.0, 63, 69),
(13, 22, 'Abril - Semana 10', '4. PROYECTO - ABRIL', 'abril', 10, 'Aplicar y cargar los formatos de listados de asistencia 
Proyecto 1', 'Proyecto presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Proyecto virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia: https://drive.google.com/drive/u/0/folders/1sDvb1ejteLgIquCK5naJCeYhy5TbHr6T

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 4.0, 63, 69),
(13, 23, 'Abril - Semana 11', '4. PROYECTO - ABRIL', 'abril', 11, 'Generar registro fotográfico y de vídeo de las sesiones del proyecto
Proyecto 1', 'Proyecto presencial: Cargar fotografías por cada sesión del proyecto
Proyecto virtual: Cargar pantallazos y la grabación de cada sesión del proyecto', 3.0, 70, 76),
(13, 24, 'Mayo - Semana 13', '4. PROYECTO - ABRIL', 'mayo', 13, 'Garantizar la Nota concepto del proyecto firmada por docente y actor externo
Proyecto 1', 'Cargar PDF Nota concepto del proyecto firmada por docente y actor externo', 6.0, 84, 90),
(13, 25, 'Mayo - Semana 14', '4. PROYECTO - ABRIL', 'mayo', 14, 'Diligenciar la planilla de certificación SNIES 
Proyecto #1', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia y cruce de asistencias para determinar quienes cumplen el requisito de participación para certificarse
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1nZnAoRYEllXGqTkeaxgKgAFGVxpXQZXI', 4.0, 91, 97),
(13, 1, 'Abril - Semana 9 - Pendiente revisar y aprobar de aquí para abajo', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 9, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios maria_lopezr@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Actividad #2', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 56, 62),
(13, 2, 'Abril - Semana 11', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 11, 'Elaboración de contenidos - Actividad #2', 'Cargar presentación en PPT. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 70, 76),
(13, 3, 'Abril - Semana 11', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 11, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Actividad #2', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 70, 76),
(13, 4, 'Abril - Semana 12', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 12, 'Implementación - Actividad #2', 'Implementar la actividad en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 77, 83),
(13, 5, 'Abril - Semana 12', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 12, 'Aplicar y cargar los formatos de listados de asistencia 
Actividad 2', 'Actividad presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Actividad virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia:
https://drive.google.com/drive/u/0/folders/1ZTC4bEmOW4Sl23zOY6kcc4OIS9I6-qWp

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 2.0, 77, 83),
(13, 6, 'Abril - Semana 12', '5. ACTIVIDAD No. 2 - MAYO', 'abril', 12, 'Generar registro fotográfico y/o grabación de la actividad
Actividad #2', 'Actividad presencial: Cargar fotografías del desarrollo de la actividad
Actividad virtual: Cargar la grabación y pantallazos del desarrollo de la actividad', 2.0, 77, 83),
(13, 7, 'Mayo - Semana 13', '5. ACTIVIDAD No. 2 - MAYO', 'mayo', 13, 'Diligenciar la planilla de certificación SNIES 
Actividad #2', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia.
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1VHfxocyvwgMKZZtXrab7lylWK51CbhBe', 6.0, 84, 90),
(13, 8, 'Mayo - Semana 13', '5. ACTIVIDAD No. 2 - MAYO', 'mayo', 13, 'Entrega de Acta de actividad firmada por actor externo y docente de proyección social,  y presupuesto en Excel, con total de beneficiarios reportado en la planilla SNIES
Actividad #2', 'Cargar en formato Word del acta de actividad firmada por actor externo y docente de proyección social, y el presupuesto en formato Excel,  

Link ejemplo de acta de actividad y presupuesto ubicado en la carpeta Documentos Generales: 
https://drive.google.com/drive/u/0/folders/1G9wGvnOovsDMF_25s9X4mGsL1ahYpqiH', 4.0, 84, 90),
(13, 1, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Diligenciar el link Solicitud de pieza comunicacional, el cual a su vez, debe incluir el link del formulario de inscripción en editable para los usuarios maria_lopezr@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co
Actividad #3', 'Diligenciar formulario de solicitud de pieza comunicacional, el cual contiene a su vez, el link del formulario de inscripción en editable

- Link de formulario: https://forms.gle/TsKqjcsiYCqsgCXV8 
- Link carpeta: https://drive.google.com/drive/u/0/folders/1BFtcJmXKmi_a5cHwH8pM2S-0ZQppAbbO', 2.0, 84, 90),
(13, 2, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Elaboración de contenidos - Actividad #3', 'Cargar presentación en PPT. Usar formato de Proyección Social 
https://drive.google.com/drive/u/0/folders/1fqpfH42Lp-aYkyeunA1RhPKmp3YheOQw', 6.0, 84, 90),
(13, 3, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Difusión de la pieza comunicacional - Correo enviado al actor externo - Actividad #3', 'Cargar pieza comunicacional y enviar correo con la pieza comunicacional y el link de inscripción al actor externo para difusión y Copiar en el correo de difusión a los usuarios: xxxxx@cun.edu.co, proyeccion_social@cun.edu.co y liliana_villamizar@cun.edu.co

Link ejemplo de correo: https://drive.google.com/drive/u/0/folders/1FROsKIGqJ0YkPjuk86rNQLOcbUHFdIfB', 1.0, 84, 90),
(13, 4, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Implementación - Actividad #3', 'Implementar la actividad en la fecha debidamente estipulada en el Plan de Trabajo aprobado - Esta tarea no implica realizar cargue en la carpeta de gestión documental docente', 4.0, 84, 90),
(13, 5, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Aplicar y cargar los formatos de listados de asistencia 
Actividad 3', 'Actividad presencial: Cargar PDF de los listados de asistencia escaneados (diligenciados por parte de los participantes)
Actividad virtual: Cargar Excel formulario de respuestas de la asistencia de cada sesión - (diligenciados por parte de los participantes)

Link ejemplo ubicado en la carpeta Documentos Generales - Registro de asistencia:
https://drive.google.com/drive/u/0/folders/1ZTC4bEmOW4Sl23zOY6kcc4OIS9I6-qWp

NOTA: Solo está permitido hacer uso de los formatos establecidos por el área, en el caso de iniciativas presenciales la planilla de asistencia en PDF cargada en la carpeta documentos generales y para actividades virtuales unicamente el formulario generado por el área a través del aplicativo Zoho.', 2.0, 84, 90),
(13, 6, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Generar registro fotográfico y/o grabación de la actividad
Actividad #3', 'Actividad presencial: Cargar fotografías del desarrollo de la actividad
Actividad virtual: Cargar la grabación y pantallazos del desarrollo de la actividad', 2.0, 84, 90),
(13, 7, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Diligenciar la planilla de certificación SNIES 
Actividad #3', 'Cargar planilla de certificación SNIES con la totalidad de participantes a certificar, con previa verificación de nombres y apellidos de los participantes en página de la Polícia.
Link ejemplo ubicado en la carpeta Documentos Generales - Planilla de certificación SNIES:
https://drive.google.com/drive/u/0/folders/1VHfxocyvwgMKZZtXrab7lylWK51CbhBe', 6.0, 84, 90),
(13, 8, 'Mayo - Semana 13', '6. ACTIVIDAD No. 3 - MAYO', 'mayo', 13, 'Entrega de Acta de actividad firmada por actor externo y docente de proyección social,  y presupuesto en Excel, con total de beneficiarios reportado en la planilla SNIES
Actividad #3', 'Cargar en formato Word del acta de actividad firmada por actor externo y docente de proyección social, y el presupuesto en formato Excel,  

Link ejemplo de acta de actividad y presupuesto ubicado en la carpeta Documentos Generales: 
https://drive.google.com/drive/u/0/folders/1G9wGvnOovsDMF_25s9X4mGsL1ahYpqiH', 4.0, 84, 90),
(13, 1, 'Mayo - Semana 13', '7. PRESUPUESTO', 'mayo', 13, 'Firmar del formato “Autorización de Descuento de Nómina”', 'Enviar el documento debidamente firmado, en formato PDF al correo de Proyección Social (Proyeccion_social@cun.edu.co).', 1.0, 84, 90),
(13, 2, 'Mayo - Semana 13', '7. PRESUPUESTO', 'mayo', 13, 'Firma y relación de cuenta bancaria en el formato “Solicitud de Gastos de Viaje”', 'Enviar el documento debidamente firmado, en formato PDF al correo de Proyección Social (Proyeccion_social@cun.edu.co).
Recomendaciones:
1. El titular de la cuenta debe ser el docente.
2. En caso de no contar con Nequi o Daviplata, relacionar el número de cuenta de nómina y adjuntar el Certificado Bancario.', 1.0, 84, 90),
(13, 3, 'Mayo - Semana 13', '7. PRESUPUESTO', 'mayo', 13, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado - Marzo', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 84, 90),
(13, 4, 'Mayo - Semana 13', '7. PRESUPUESTO', 'mayo', 13, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado. - Abril', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 84, 90),
(13, 5, 'Mayo - Semana 13', '7. PRESUPUESTO', 'mayo', 13, 'Entrega de Legalización de Gastos de Viaje - Diligenciar y firmar el Formato de legalización de gastos y consolidar facturas que evidencian el uso del recurso asignado - Mayo', 'Firmar y entregar el formato de legalización de gastos y facturas correspondiente al mes en curso', 2.0, 84, 90),
(13, 1, 'Mayo - Semana 13', '8. ENTREGABLES VARIOS', 'mayo', 13, 'Solicitud salones para iniciativas presenciales en sedes Cunistas', 'Enviar solicitud de salón vía correo eléctronico con copia al líder del programa,  liliana_villamizar@cun.edu.co y analísta o gestor asignado del área de proyección social.

Formato ubicado en la carpeta Documentos Generales - Registro de participantes Capacitaciones Presenciales Sede CUN:
https://drive.google.com/drive/u/0/folders/14r0P3HzzVCQYociMHl7JBY2FaKe-Vr-J

NOTA:  Por favor ten presente los siguientes aspectos:
1. No se permite el ingreso de menores de edad
2. Esta solicitud debe realizarse minimo 5 días antes de la implementación de tu iniciativa', 3.0, 84, 90),
(13, 2, 'Mayo - Semana 13', '8. ENTREGABLES VARIOS', 'mayo', 13, 'Solicitud de certificado de ARL para translados del docente 
Nota: Aplica únicamente cuando el/la docente deba desplazarse a otro municipio o ciudad diferente a su lugar habitual de trabajo. No aplica para traslados dentro de la misma ciudad.', 'Enviar solicitud de activación de la ARL vía correo eléctronico al área de capital social, con copia al líder del programa, liliana_villamizar@cun.edu.co y analísta o gestor asignado del área de proyección social, informando fechas de desplazamiento, lugarde realización y medio de transporte.', 1.0, 84, 90),
(13, 3, 'Marzo - Semana 4', '8. ENTREGABLES VARIOS', 'marzo', 4, 'Revisión y ajustes de gestión documental', 'Espacio destinado para verificar que la gestión documental se encuentre completa y correctamente elaborada.', 9.0, 21, 27),
(13, 4, 'Mayo - Semana 16', '8. ENTREGABLES VARIOS', 'mayo', 16, 'Solicitud de carta de voluntario firmado por el ponente o conferencista invitado que va a impartir la capacitación y/o sesión del proyecto', 'Diligenciar documento formato de voluntariado por parte de ponente invitado a capacitación
https://docs.google.com/document/d/1fMVfLv-pIaHUFvVIcriCIAMtv-ApM0Ji/edit', 4.0, 105, 111),
(13, 5, 'Mayo - Semana 16', '8. ENTREGABLES VARIOS', 'mayo', 16, 'Solicitar formato de consentimiento informado firmado para uso de imagen', 'Cargar el formato de consentimiento informado debidamente firmado que se encuentra ubicado en ubicado en la carpeta Documentos Generales:
https://drive.google.com/drive/u/0/folders/1e1VqqvCXzqsTyhD0tAOBBIIT-Ukmirnc', 1.0, 105, 111),
(13, 6, 'Mayo - Semana 16', '8. ENTREGABLES VARIOS', 'mayo', 16, 'Generar vídeo de testimonio Docente con relación a su experiencia como docente de proyección social', 'Cargar vídeos testimoniales: Docente del proyecto

Nota: Grabar cada vídeo con el celular ubicado de forma horizontal. Duración máxima del vídeo 1:30 minutos
Ejemplo ubicado en documentos generales: https://drive.google.com/drive/u/0/folders/1Q1PlQhLiyABc2AlWkt7L6VZ2hX2_gWEt', 1.0, 105, 111);

