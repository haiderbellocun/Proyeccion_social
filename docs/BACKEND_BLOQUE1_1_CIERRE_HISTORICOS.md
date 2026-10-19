# Backend · Bloque 1.1 — Cierre de vías de elusión histórica

Complemento acotado del Bloque 1 ([BACKEND_BLOQUE1_PROTECCION_HISTORICOS.md](BACKEND_BLOQUE1_PROTECCION_HISTORICOS.md)). Cierra las cuatro vías que quedaron abiertas como limitaciones: eliminar iniciativas con reportes, cambiar el calendario de un semestre con reportes, retirar colaboradores con participación histórica y cambiar el responsable de una iniciativa con reportes.

Sin cambios en el esquema de PostgreSQL, sin nuevas tablas ni migraciones, sin tocar las fórmulas de métricas, la autenticación ni el diseño B2. No se inició el Bloque 2.

## 1. Causa técnica de cada vía

| Vía | Qué ocurría | Por qué |
|---|---|---|
| **Eliminar iniciativa** | `DELETE /admin/proyectos/:id?forzar=true` borraba una iniciativa con reportes en borrador o enviados, y con ella sus semanas, entregables y evidencias. | Solo se protegían los reportes *aprobados u observados*; el resto se podía borrar tras una confirmación. Las claves foráneas `proyecto_semanas → proyecto_entregables → entregable_evidencias` son `ON DELETE CASCADE`. Además `entregable_eventos` **no tiene clave foránea** a `proyecto_entregables`, así que sus eventos quedaban huérfanos sin que la base lo impidiera. |
| **Calendario del semestre** | `PUT /admin/semestres/:codigo` cambiaba fechas, número de semanas o código aunque hubiera reportes. | Solo validaba que no se redujeran las semanas por debajo de la última plantilla. Fechas y semanas definen la semana académica, los vencimientos y el cumplimiento con los que se interpretan los reportes. Cambiar el **código** dejaba además a `entregable_evidencias.semestre` (sin clave foránea) apuntando a un semestre inexistente. |
| **Colaboradores** | `PUT /admin/proyectos/:id/docentes` reemplaza la lista: borraba todos los vínculos y reinsertaba los nuevos. | No comprobaba la participación histórica. Quien reportó dejaba de ver su reporte en su matriz (el registro seguía en la BD). Era una desvinculación silenciosa. |
| **Responsable** | `PUT /admin/proyectos/:id` con otro `docenteId`. | Permisos, resolución de la iniciativa en la matriz y atribución de los reportes dependen de `docente_responsable_id` (no hay historial de responsables). Tras el cambio los reportes dejaban de verse en la matriz del docente original. |

## 2. Reglas implementadas

Todas viven en el backend y reutilizan `historicosService.js` (mismo formato `409 { error, codigo: "HISTORICO_PROTEGIDO", resumen, alternativa }`, sin `requiere_confirmacion`; `forzar` y variantes se ignoran).

1. **Iniciativas.** No se elimina una iniciativa con historia: entregables *con avance* en cualquier estado (borrador, enviado, observado, aprobado, o con reporte, evidencia, revisión, vínculo a la matriz o a un docente), evidencias/versiones, eventos de historial o ajustes administrativos (excepciones) que dependan de ella. Las filas «vacías» del cronograma (programadas, sin ningún reporte) no son historia: una iniciativa sin dependencias protegidas se elimina con su cronograma como siempre.
2. **Calendario del semestre.** Con reportes, evidencias o eventos en cualquiera de sus grupos no pueden cambiar el **código, la fecha de inicio, la fecha de fin ni el número de semanas**. Reenviar exactamente los mismos valores es una operación nula (200). Son los cuatro campos que acepta el endpoint (el estado «activo» tiene su propio endpoint y no reinterpreta nada), de modo que no se encontró un campo editable que sea «seguro» con historia. Las importaciones de Excel y los grupos sin reportes no dependen del calendario: no bloquean. Un semestre sin historia se edita igual que antes.
3. **Colaboradores.** Como el endpoint reemplaza la lista, se calcula quién dejaría de figurar y se comprueba a cada uno: entregables que reportó en esa iniciativa, evidencias que subió y eventos donde figura. Si alguno tiene participación, se rechaza **toda** la operación (sin escrituras parciales). Se retiran solo los colaboradores que sobran (antes se borraban y reinsertaban todos); añadir y reenviar la lista siguen funcionando. No se reasigna ningún reporte.
4. **Responsable.** Solo puede cambiar si la iniciativa no tiene historia (misma definición que en 1). Cambiar otros campos de la iniciativa reportada (título, descripción, mismo responsable) sigue permitido.

### Concurrencia (comprobar y modificar sin carreras)
Cada operación corre en una transacción que primero **bloquea** y luego **cuenta**:

- La fila de `proyectos` con `FOR NO KEY UPDATE` (excluye a otros administradores; no choca con las claves foráneas de los reportes).
- Los **participantes** (responsable y colaboradores) con `FOR UPDATE`, en orden de id. El flujo de reporte (`registrarDesdeMatriz`) bloquea la fila del docente *antes* de validar que pertenece a la iniciativa: así «retirar al colaborador / cambiar al responsable» y «reportar» quedan serializados (o el reporte ya está confirmado y se ve al contar, o espera y encuentra el vínculo cambiado).
- Las **semanas** y los **entregables** de la iniciativa con `FOR UPDATE`: un reporte nuevo toma un bloqueo compartido sobre su semana (clave foránea) y uno existente se actualiza con `FOR UPDATE`, así que también esperan.
- Los grupos y plantillas del semestre (como en el Bloque 1) para el calendario.

Hallazgo durante las pruebas: un primer diseño con `FOR UPDATE` sobre la iniciativa provocaba **interbloqueos** (500) con el flujo de reporte, porque la inserción de evidencias toma un bloqueo compartido sobre `proyectos`. Se cambió a `FOR NO KEY UPDATE`. Otro hallazgo: bloquear solo semanas y entregables **no** bastaba para colaboradores y responsable (el reporte validaba la pertenencia antes de esperar); por eso se bloquean también los participantes.

### Endpoints revisados
Se comprobó cada ruta capaz de realizar cada operación:

| Operación | Rutas que la pueden realizar | Estado |
|---|---|---|
| Eliminar iniciativa | `DELETE /admin/proyectos/:id` (única ruta directa). Indirectas: `DELETE /admin/usuarios/:id` (la FK del responsable es `RESTRICT` y el historial del docente ya se protege), `DELETE /admin/programas/:id` (bloquea si hay iniciativas), `DELETE /admin/escuelas/:id` (bloquea si hay programas). | **Corregida** la directa; indirectas ya protegidas |
| Calendario del semestre | `PUT /admin/semestres/:codigo` (única que modifica fechas, semanas o código). `POST /admin/semestres` y `/clonar` solo crean; `PUT …/activar` solo cambia el estado. | **Corregida** |
| Colaboradores | `PUT /admin/proyectos/:id/docentes` (única que borra vínculos). `DELETE /admin/usuarios/:id` borra vínculos en cascada, pero ya está bloqueado cuando el docente tiene entregables. | **Corregida** |
| Responsable | `PUT /admin/proyectos/:id` (única que modifica `docente_responsable_id`). | **Corregida** |

## 3. Archivos modificados

- `backend/src/services/historicosService.js`: `ENTREGABLE_CON_AVANCE_SQL` (movido aquí desde `admin.js`), `bloquearHistoriaDeProyecto`, `historicoDeProyecto`, `historicoDeColaborador`, `historicoDeCalendarioSemestre` y la línea de «ajustes administrativos» en `describirResumen`.
- `backend/src/routes/admin.js`: `DELETE /proyectos/:id`, `PUT /proyectos/:id`, `PUT /proyectos/:id/docentes`, `PUT /semestres/:codigo`.
- `src/app/pages/SystemAdmin/ProjectManagement.tsx`: al guardar la asignación de colaboradores se muestra el mensaje del backend (antes un texto genérico). Es lo único del frontend; sin cambios de diseño, vistas ni rutas.
- `backend/test/integration/historicos11.integration.test.js` (nuevo) y `backend/package.json` (el script `test:integration:protegidos` ejecuta ahora los dos archivos **en serie**: en paralelo se pisaban las comparaciones antes/después).
- `e2e/suites/historicos.mjs`: las cuatro sondas «LIMITACIÓN documentada» pasan a comprobar la protección (y los casos legítimos); se retiró la excepción que ignoraba fallas con «LIMITACIÓN» en el nombre. `e2e/suites/docente.mjs`: el chequeo de consola muestra también las respuestas HTTP ≥ 400 al fallar (diagnóstico; no cambia ninguna condición).

## 4. Pruebas nuevas (`historicos11.integration.test.js`, solo en `proysocial_test`)

Fixtures sintéticos `TST_I` y semestres 2094A/2094B, eliminados al final. En cada rechazo se compara la huella completa (filas y md5 de usuarios, semestres, grupos, plantillas, proyectos, semanas, entregables, vínculos de colaboradores, evidencias, eventos, excepciones e importaciones): una operación rechazada no deja escrituras parciales.

| # | Caso |
|---|---|
| 1 | Eliminar con borrador, con `forzar` y variantes (`forzar=1`, `force`, `confirmar`, `forzar_cronograma`) → 409 |
| 2 | Eliminar con reporte enviado (con evidencia y eventos), con y sin `forzar` → 409 |
| 3 | Eliminar con reporte aprobado y con reporte observado, con y sin `forzar` → 409 |
| 4 | Eliminar una iniciativa sin dependencias → 200; el resto de la historia no se toca |
| 5 | Cambiar fechas, semanas, código (y combinaciones) de un semestre con reportes → 409; reenviar los mismos valores → 200 sin cambios |
| 6 | Editar un semestre sin históricos → 200; validación fallida → 400 sin cambios |
| 7 | Retirar un colaborador con reportes (conservando a otro, a todos, o reemplazando) → 409; vínculos y reporte intactos |
| 8 | Retirar un colaborador sin reportes y reenviar la lista → 200; reportes intactos |
| 9 | Cambiar el responsable con reportes (también cuando el reporte es de un colaborador) → 409 |
| 10 | Cambio de responsable sin históricos → 200; edición segura con reportes (mismo responsable) → 200 |
| 11a–c | Carreras (10 rondas cada una, con retrasos de 0 a 180 ms para ejercitar ambos órdenes de llegada): eliminar / retirar colaborador / cambiar responsable **mientras se reporta**. Invariante: si la operación se confirmó, no queda ningún reporte confirmado que pierda su iniciativa, su vínculo o su atribución; si no, 409 y el reporte se conserva |
| 11d | Dos eliminaciones simultáneas de la misma iniciativa vacía → una 200 y una 404 |
| 11e | Determinista: con un reporte en curso (transacción abierta), cada operación **espera** (comprobado) y al confirmarse el reporte responde 409 |
| 12 | Integridad final: sin reportes sin iniciativa, sin evidencias sin su entregable, sin eventos sin entregable; estados, docente y responsable originales; calendario sin cambios |

## 5. Resultados de regresión

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` y `vite build` | sin errores |
| Unitarias del backend | 61 de 61 |
| Integración de protección en `proysocial_test` (Bloque 1 + 1.1, en serie) | **36 de 36** (20 + 16 nuevas) |
| Todas las integraciones en `proysocial_test` (`test/integration/*.test.js`, en serie) | 85 OK, 0 fallas, 3 omitidas (guardas de base de datos) |
| E2E `historicos` (API real en :4000 + interfaz) | **61 de 61** (las 4 sondas ahora comprueban la protección y los casos legítimos) |
| E2E `administracion` | **332 de 332** |
| E2E `docente` | **NO EJECUTADA** tras el 1.1 (interrumpida por memoria dos veces) |
| E2E `revision-evidencias` | **NO EJECUTADA** (interrumpida por memoria) |
| E2E `regresion-shell` | **NO EJECUTADA** (memoria) |
| E2E `matrices` | **NO EJECUTADA** (memoria) |

Notas de ejecución:
- Backend de desarrollo reiniciado de forma controlada (PID 37400 → 26012, puerto 4000, `proysocial_dev`) para cargar el código nuevo. Los Vite del usuario no se tocaron.
- Se usaron los **umbrales de memoria por defecto** (iniciar con ≥ 700 MB libres, interrumpir por debajo de 450 MB). No se redujeron. La memoria libre osciló entre ≈ 600 y 1300 MB por el uso de otras aplicaciones del equipo (navegadores y antivirus; no se cerró ninguna). El ejecutor interrumpió ordenadamente `docente` (2 intentos) y `revision-evidencias` (1 intento) y no inició las restantes.
- Tras cada interrupción se comprobaron los residuos y se limpiaron solo fixtures identificables (prefijos TSTV/TSTE5); `proysocial_dev` volvió siempre a su línea base.
- Un intento de `historicos` fue interrumpido por memoria antes de crear datos útiles; otro falló por un **defecto del fixture de la propia suite** (reutilizaba una plantilla ya usada por el mismo docente, y el índice único docente+plantilla impedía crear el reporte en la iniciativa del colaborador). Se corrigió el fixture (no la aserción) y la suite pasó 61/61.
- **Pendiente de ejecutar, con memoria suficiente:** `node e2e/run.mjs docente revision-evidencias regresion-shell matrices`. Estas cuatro suites **no** se declaran aprobadas. Antes del 1.1 pasaban (docente 112, revisión de evidencias 61, shell 70 + 1 esperada, matrices 86 + 1 esperada). El 1.1 solo toca rutas de administración de iniciativas, colaboradores y semestres (y los flujos de reporte no se modificaron), por lo que el riesgo es bajo, pero no está demostrado por esas suites.

## 6. `console.error` intermitente de `dashboard-stats`

Hallazgo del análisis (sin reproducir el fallo): el mensaje registrado era `Error: dashboard-stats`, no `TypeError: Failed to fetch`.

- El fallo de red simulado de la suite (`docente.mjs`, `window.fetch` rechazado con `TypeError('Failed to fetch')`) produce `TypeError: Failed to fetch`, que el filtro de consola ya excluye.
- `Error: dashboard-stats` solo se lanza en `TeacherDashboard.tsx` cuando `fetch` **sí obtiene respuesta** y esta no es 2xx (`if (!resStats.ok) throw new Error("dashboard-stats")`). Es decir, no corresponde al rechazo simulado: hubo una **respuesta HTTP no exitosa real** para `GET /docente/:id/dashboard-stats` en algún momento de la sesión del navegador (por ejemplo, durante un cambio de sesión entre usuarios, o con el equipo bajo presión de memoria).
- No se pudo repetir: la repetición posterior pasó 112/112 y las ejecuciones posteriores de `docente` fueron interrumpidas por memoria antes de producir resultados. Causa **no determinada**; no se atribuye a las protecciones (la ruta no se modificó y la BD quedó idéntica).
- Para identificarlo en la próxima ejecución, el chequeo de consola de `docente.mjs` ahora añade al detalle las respuestas HTTP ≥ 400 de la sesión (`p.fallos`, que ya se registraban pero no se mostraban). No se cambió ninguna condición de aprobación ni se filtró el mensaje: si vuelve a aparecer, el detalle dirá qué petición falló y con qué código.

## 7. Verificación de integridad

Comprobado en `proysocial_dev` al terminar (consultas de solo lectura):

- Reportes (entregables) sin iniciativa: **0**. Evidencias sin su entregable: **0**. Eventos de historial huérfanos: **0**. Iniciativas sin responsable: **0**.
- Fechas de semestres sin cambios: 2026A 2026-02-10→2026-06-01 (16 semanas) y 2026B 2026-08-24→2026-12-13 (16 semanas, activo).
- Estados de reportes sin cambios: 20 aprobados, 9 enviados, 4 observados; ningún responsable de reportes existentes cambió.
- Sin fixtures temporales: 0 usuarios/iniciativas/grupos/semestres de prueba (TST*, 2094–2096) y 0 evidencias de prueba.
- Las pruebas del 1.1 comprueban lo mismo sobre `proysocial_test` tras cada rechazo (huella completa antes/después) y en la prueba 12.

## 8. Riesgos y limitaciones pendientes

1. **Otras ediciones de una iniciativa con reportes** (fuera de las cuatro vías autorizadas; no se cambiaron sin tu decisión):
   - `PUT /admin/proyectos/:id` con otra **fecha de inicio** o número de semanas reprograma «en el lugar» las semanas de la iniciativa (diseño anterior: conserva los reportes, pero los vencimientos pasan a calcularse con otras fechas; reducir por debajo de una semana con reportes sí se rechaza).
   - Cambiar el **programa** de una iniciativa con reportes la reatribuye a otro programa en los indicadores por programa.
   - Si se quiere cerrar también esto, bastaría aplicar `historicoDeProyecto` en esas dos ramas.
2. **Reportes sin docente asignado.** Un entregable con `docente_id` nulo se atribuye hoy al responsable o a cualquier colaborador de la iniciativa; retirar a *un* colaborador no lo deja sin dueño porque el responsable conserva el acceso, y retirar a quien no reportó nada está permitido por diseño.
3. **Necesidad futura (con trazabilidad y autorización explícita):** *historial de responsables y colaboradores por periodos* (quién fue responsable o participó y desde/hasta cuándo) para poder reasignar sin reinterpretar reportes; y un mecanismo de **corrección excepcional del calendario** de un semestre con auditoría de quién lo pidió y quién lo autorizó. Ninguno se implementó: requieren tablas y migraciones, fuera del alcance de este bloque.
4. **`entregable_eventos` sin clave foránea** a `proyecto_entregables`: la base permite eventos huérfanos. El backend ya no los genera por esta vía, pero un acceso directo a la base sí podría. Candidato para un bloque con autorización de esquema, junto con `ON DELETE RESTRICT` en las relaciones de historia (ver Bloque 1, §10).
5. **Las protecciones están solo en el backend** y no sustituyen restricciones de integridad en PostgreSQL (scripts o clientes que no usen la API siguen pudiendo escribir sobre la historia).
6. **Importación de Excel:** la vista previa no anticipa los bloqueos por reasignación (pendiente del Bloque 1).
7. **Despliegue:** el flujo actual despliega en cada push a `main` sin pruebas; revisar antes de publicar estos cambios (ver Bloque 1, §11). No se accedió a producción.

## 9. Estado final de las bases

| Base | Estado |
|---|---|
| `proysocial_dev` | Línea base conservada: 5 usuarios, 2 semestres (2026B activo), 18 grupos, 2032 plantillas, 10 proyectos, 33 entregables (20/9/4), 33 evidencias, 57 eventos. Solo las suites E2E escribieron en ella (fixtures TSTV/TSTE5, siempre limpiados). |
| `proysocial_test` | Aislada: solo las semillas de las migraciones (0 usuarios, 0 iniciativas, 0 entregables, 1 semestre), sin fixtures `TST_H`/`TST_I`. Las pruebas con escritura exigen `PGDATABASE=proysocial_test` exacto, servidor local, sin `DATABASE_URL` y `current_database()` verificado. |
| Producción | No se accedió. No se ejecutaron migraciones (no hay ninguna nueva). |

## 10. Siguiente paso
Detenido al finalizar el Bloque 1.1. El siguiente bloque aprobado es CR-01 (métricas por semestre); no se ha iniciado.
