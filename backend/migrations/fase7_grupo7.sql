-- Insertar grupo 7 (hueco entre 6 y 8 en secuencia histórica)
INSERT INTO grupos_matriz (id, nombre, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados)
VALUES (7, 'Grupo 7 - Antiguo 24h - 2Pro 2Act 1Conv.Din', 'ANTIGUO', 24, 2, 2, 0, 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('grupos_matriz_id_seq', (SELECT MAX(id) FROM grupos_matriz));
