# Integración B2 — etapa 4A (Importador de matrices Excel)

Solo presentación: `/admin/importar-matriz`. La lógica del asistente (análisis, hoja, mapeo, validación sin escrituras, decisiones, confirmación, asignación e historial) es **la misma** que la de `ImportarMatrizTinta.tsx` (copia para revertir). No se tocaron backend, API, contratos ni datos.

## Qué cambió
- Barra de pasos compacta (`StepperB2`): «Paso n de 7», segmentos, qué falta para continuar y regreso a pasos completados.
- Paso 2: hojas como selector con estados; muestra estructurada. Paso 3: tabla de mapeo con obligatorios marcados. Paso 4: destino, resumen de validación (válidos/advertencias/errores/pendientes), avisos agrupados y decisiones como tarjetas con opción recomendada. Paso 5: filtros con conteos (todas/válidas/advertencias/errores/pendientes/duplicadas), búsqueda, tabla B2 con encabezado fijo y scroll controlado, filas con error resaltadas y **inspector** con el detalle de cada fila (hoja inferior en móvil, lista compacta en 390 px). Paso 6: resumen y confirmación expresa (casilla), «Cancelar»; si no hay cambios se explica en lugar de un mensaje genérico. Paso 7: resumen con importadas, actualizadas, sin cambios, omitidas, advertencias, errores, lote, fecha, semestre, grupo (creado/actualizado), ajustes aplicados, ver matriz del grupo, asignar/abrir matriz del docente. Historial como tabla o lista.
- Datos mostrados: únicamente los que devuelve la API.

## Pruebas (proysocial_dev, fixtures TSTE4 en el semestre 2099A)
55 comprobaciones de flujo + 46 de captura/responsive: archivo corrupto, hoja sin estructura, mapeo incompleto, validación sin escrituras, cancelar, confirmación, reimportación idempotente (sin lote ni plantillas nuevas), duplicados y semana distinta (decisiones), fecha fuera del semestre / fechas invertidas (solo se importan las válidas), asignación de docente, matriz importada, error de conexión con reintento, archivo de 208 entregables, rol docente. Cada escritura se verificó en PostgreSQL y las tablas quedaron idénticas a las iniciales tras limpiar.
