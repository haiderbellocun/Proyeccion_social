# Backend · Bloque 1.2 — Cierre final de integridad histórica

Último ajuste del Bloque 1 ([1](BACKEND_BLOQUE1_PROTECCION_HISTORICOS.md), [1.1](BACKEND_BLOQUE1_1_CIERRE_HISTORICOS.md)): protege los campos históricos de las iniciativas y completa las verificaciones pendientes. Sin cambios en el esquema de PostgreSQL ni migraciones, sin tocar métricas, autenticación ni diseño B2, sin historial de responsables ni versionado de plantillas. No se inició el Bloque 2.

## 1. Campos protegidos

Una iniciativa **con historia** (entregables con avance en cualquier estado, evidencias o versiones, eventos de historial o ajustes administrativos que dependan de ella; misma definición que en el Bloque 1.1) ya no admite cambiar:

| Campo | Por qué |
|---|---|
| **Fecha de inicio** (`fecha_inicio`) | Reprogramaba «en el lugar» las semanas de la iniciativa: los vencimientos de reportes ya enviados se recalculaban con otras fechas. |
| **Número de semanas** (`semanas`) | Aumentar o reducir reconstruía el cronograma sobre reportes existentes. |
| **Programa académico** (`programa_id`) | Reclasificaba los reportes en otro programa en los indicadores por programa. |

Respuesta: `409 { error, codigo: "HISTORICO_PROTEGIDO", resumen, alternativa }` (sin `requiere_confirmacion`; `forzar_cronograma` y variantes se ignoran). El mensaje nombra los campos afectados y la razón, p. ej. *«No se puede cambiar la fecha de inicio, el número de semanas, el programa académico de la iniciativa: 1 entregable, 1 evidencia y 4 eventos de historial ya reportados reclasificaría esos reportes en otro programa en los indicadores.»*, y la alternativa indica qué sí puede editarse.

- **Reenviar los mismos valores no genera conflicto** (el frontend envía todos los campos al guardar). Se compara contra el valor actual: solo un valor distinto en alguno de los tres campos dispara la comprobación.
- **Siguen editables con historia:** título, descripción, tipo, estado, fecha de fin estimada y horas totales (fuera del alcance autorizado). El responsable conserva la regla del Bloque 1.1.
- **Sin historia:** fecha, semanas y programa se editan como antes (las semanas se reprograman, agregan o retiran). Un cronograma «vacío» (entregables programados sin reporte) no es historia.
- **Atomicidad:** la comprobación ocurre antes de cualquier escritura de la transacción: una operación que mezcla un campo permitido con uno protegido se rechaza completa (el título tampoco cambia).

### Rutas revisadas
`PUT /admin/proyectos/:id` es la **única** ruta que escribe `fecha_inicio`, `semanas` o `programa_id` de `proyectos` y las fechas de `proyecto_semanas` (la creación `POST /admin/proyectos` parte de cero y no tiene historia). Se revisaron además: `POST /admin/proyectos/:id/entregables-semanales` (conserva los entregables con avance, no cambia fechas ni programa), `PUT /admin/programas/:id` (cambia el programa, no reasigna iniciativas), `PUT /admin/usuarios/:id` (su `programa_id` es el del usuario, no el de la iniciativa) y la excepción individual de plantillas (Bloque 1; no mueve reportes existentes). No hay otra vía equivalente.

### Concurrencia
Se reutiliza `bloquearHistoriaDeProyecto` / `historicoDeProyecto` del Bloque 1.1 **sin cambiar el orden de bloqueos**: fila de `proyectos` con `FOR NO KEY UPDATE` → participantes (`usuarios`, `FOR UPDATE`, por id) → semanas → entregables. La historia se bloquea y cuenta **una sola vez** por transacción (función diferida) y solo si algún campo protegido (responsable, fecha, semanas, programa) cambia. Una edición que no toca esos campos no toma esos bloqueos.

## 2. Archivos afectados
- `backend/src/routes/admin.js` — `PUT /proyectos/:id`: guarda de fecha de inicio, semanas y programa; la comprobación de historia se comparte con la del responsable.
- `backend/test/integration/historicos12.integration.test.js` (nuevo); `backend/package.json` (el script `test:integration:protegidos` incluye el nuevo archivo, en serie).
- `backend/test/integration/bloque1.integration.test.js` — la prueba «cambiar semanas/fecha de una iniciativa no destruye semanas con reportes» fijaba el comportamiento anterior (reprogramar y ampliar **sí** se permitían con reportes). Ahora exige 409 en los tres cambios y sigue comprobando que no se pierde ningún reporte ni cambia el calendario. Es un cambio de requisito autorizado, no un ocultamiento de un error.
- `e2e/suites/matrices.mjs` — prueba móvil del docente corregida (ver §4.1; solo código de pruebas). `e2e/suites/docente.mjs` conserva el diagnóstico de respuestas HTTP ≥ 400.
- Sin cambios de frontend ni de lógica de backend en esta corrección.

## 3. Pruebas nuevas (`historicos12.integration.test.js`, solo `proysocial_test`)
Fixtures `TST_J` (semestre 2093A, dos programas), eliminados al final. En cada rechazo se compara: huella completa de 12 tablas (incluye las fechas de `proyecto_semanas`), fila de la iniciativa, calendario y **las métricas del docente** (`GET /docente/:id/dashboard-stats`) antes y después.

| # | Caso |
|---|---|
| 1 | Cambiar la fecha de inicio con reportes borrador / enviado / aprobado / observado (con y sin `forzar_cronograma`) → 409 |
| 2 | Cambiar el número de semanas (aumentar y reducir) → 409 |
| 3 | Cambiar el programa (por id y por nombre) → 409 |
| 3b | Mezcla de campo permitido y protegido → 409 completo; el título no cambia |
| 4 | Reenviar los mismos valores → 200 sin cambios en calendario, reportes, evidencias, eventos ni vínculos; campos no protegidos siguen editables |
| 5 | Iniciativa sin históricos: fecha, semanas (reducir y ampliar) y programa → 200, calendario coherente |
| 6 | Transversales: el reporte transversal (iniciativa de soporte) sigue funcionando; esa iniciativa queda protegida; tras el rechazo se registra otro reporte transversal; un docente sin iniciativa recibe el error propio del modelo (no se impone ninguna regla nueva) |
| 7 (×4) | Carreras (10 rondas cada una, retrasos de 0 a 180 ms): reporte nuevo mientras se cambia fecha / semanas / programa / las tres a la vez. Invariantes: el reporte del responsable nunca se pierde, el calendario es siempre coherente con la fecha y las semanas de la iniciativa; si se rechazó, nada cambió |
| 7e | Determinista: con un reporte en curso (transacción abierta) cada modificación **espera** (comprobado) y luego responde 409 |
| 7f | Determinista: con los bloqueos del administrador tomados, un reporte **espera** y luego se registra (sin interbloqueo) |
| 7g | Dos modificaciones simultáneas de una iniciativa sin historia → ambas 200 y estado coherente |
| 8 | Integridad final: fechas, semanas y programa de las iniciativas con reportes intactos; sin reportes sin iniciativa, evidencias sin entregable ni eventos sin entregable |

Las carreras dieron resultados mixtos en ambos órdenes (p. ej. fecha de inicio: 9 cambiadas y 1 protegida; semanas: 8–9 y 1–2), y ningún `500`: no aparecieron interbloqueos nuevos. Que la modificación llegue antes y el reporte después es legítimo (el reporte se registra con el calendario ya cambiado); la prueba determinista 7e demuestra que el orden contrario nunca produce un cambio. Ejecuciones: 52/52 en dos ejecuciones seguidas tras el último ajuste.

## 4. Resultados de regresión

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | sin errores (no hubo cambios de frontend) |
| Unitarias del backend | 61 de 61 |
| Protección en `proysocial_test` (Bloques 1 + 1.1 + 1.2, en serie) | **52 de 52** |
| Todas las integraciones en `proysocial_test` | 101 OK, 0 fallas, 3 omitidas (guardas de base de datos) |
| E2E `historicos` | **61 de 61** |
| E2E `administracion` | **332 de 332** |
| E2E `docente` | **112 de 112** (consola limpia, 0 respuestas HTTP ≥ 400) |
| E2E `revision-evidencias` | **61 de 61** |
| E2E `regresion-shell` | **70 OK** + 1 esperada (error 500 simulado por la suite en `/admin/dashboard`) |
| E2E `matrices` | **104 OK + 1 esperada, 0 FALLA** tras corregir la prueba móvil (ver §4.1); la ejecución previa a la corrección había dado 85 OK + 1 esperada + 1 FALLA |

Ejecución de los E2E: una suite por vez con el ejecutor y los **umbrales por defecto** (no se redujeron: iniciar con ≥ 700 MB libres; interrumpir por debajo de 450 MB). No se cerró ninguna aplicación del usuario. Se repitieron los intentos que el ejecutor interrumpió por memoria (no escribieron nada). Tras cada suite se limpiaron fixtures identificables (ninguno quedó). Backend de desarrollo reiniciado con el código final (PID 26012 → 33344, puerto 4000, `proysocial_dev`).

### 4.1 `matrices`: causa, corrección y resultado definitivo

**Causa de la prueba fallida** («390 docente: inspector con acciones del flujo real», reproducible 2/2): era una suposición de calendario de la propia suite. Abría la matriz móvil de María Rodríguez, pulsaba «Periodo anterior» y hacía clic en el primer elemento, dando por hecho que el periodo anterior siempre tiene entregables. Hoy (2026-10-19) es la semana 9 del semestre 2026B y el periodo anterior (semana 8) no tiene ningún entregable de María, así que no había elemento sobre el que hacer clic y el inspector no se abría. El 15-oct la semana anterior era la 7 (4 entregables) y la prueba pasaba. No era un defecto del producto ni de las protecciones del Bloque 1.2 (no se tocó la matriz del docente).

**Corrección (solo código de pruebas, `e2e/suites/matrices.mjs`; sin cambios de frontend ni backend):** el bloque de María a 390 px se reemplazó por escenarios elegidos con la API real, sin semanas fijas ni fecha del sistema forzada:
- La suite consulta `GET /docente/:id/matriz` y `/matriz-stats` (calendario del semestre activo y semana actual del backend, America/Bogota) y calcula, con la misma regla de la lista móvil (rango de fechas calculadas que toca la semana), qué periodos tienen entregables y cuáles están vacíos. Prueba por orden con María, Carlos y Andrés.
- **Con entregables:** navega al periodo con entregables más cercano (distinto del actual si existe), verifica que el encabezado y la etiqueta («Semana actual» / «Consultando») son correctos, que la lista coincide con la API (cantidad, nombres, orden y fecha límite) y abre cada entregable (hasta 6): comprueba que el inspector abre con su nombre y que ofrece las acciones de su **estado real** (aprobado: bloqueado sin envío; enviado: «Retirar envío»; observado: «Reenviar corrección»; no iniciado/borrador: «Enviar para revisión»). La comprobación de alturas de botones (≥ 36 px) ahora exige que haya botones: antes pasaba en vacío si el inspector no abría.
- **Periodo vacío (comprobación independiente):** navega a un periodo sin entregables según la API y verifica el estado vacío («No hay entregables esta semana»), ausencia de elementos y de acciones de entregables inexistentes, sin desborde ni avisos de error; navega a otro periodo y comprueba su contenido real contra la API; y comprueba que «Volver a hoy» aparece fuera del periodo actual y regresa a la semana actual del backend. La consola de cada sesión se valida sin errores.
- Si ningún docente de prueba ofrece el escenario (sin entregables o sin periodo vacío), la prueba **falla** con «FALTA ESCENARIO»: nunca queda aprobada sin haber validado el inspector.
- No se modificó ninguna otra aserción. Las comprobaciones de estados aprobado y observado en el inspector de escritorio (1440 px) siguen intactas.

**Resultado definitivo:** `node e2e/run.mjs matrices` → **OK = 104, esperadas = 1, FALLA = 0**. Con los datos de hoy la prueba eligió la semana 10 (7 entregables, todos «no_iniciado») para el inspector y la semana 8 (vacía) para el estado vacío; ejercitó navegación (semana 9 → 10 → 8 → 9) y «Volver a hoy». Limitación: el inspector móvil se valida con los estados que tenga el periodo elegido (hoy solo «no_iniciado»); aprobado y observado se comprueban en la sección de escritorio de la misma suite y en `docente`.
- La «esperada» es el `TypeError: Failed to fetch` de la consola del administrador a 1440 px: lo provoca la propia suite (`matrices.mjs:160` rechaza `/admin/docentes/2/matriz` para probar el aviso con «Reintentar»); la traza lo confirma (`at window.fetch (<anonymous>:1:120)`) y el ejecutor lo clasifica como esperado.

**Suites que no se repitieron tras esta corrección** (solo cambió código de pruebas de `matrices`; se conserva su último resultado válido, con el backend final del Bloque 1.2): `historicos` 61/61, `administracion` 332/332, `docente` 112/112, `revision-evidencias` 61/61 y `regresion-shell` 70 OK + 1 esperada. Ejecutadas una por una con los umbrales de memoria por defecto (no se redujeron; el último intento tuvo > 2 GB libres) y sin cerrar aplicaciones del usuario.

## 5. Diagnóstico de `dashboard-stats`
Dos mensajes distintos aparecieron en las sesiones y conviene no mezclarlos:

| Mensaje | Origen | Estado |
|---|---|---|
| `TypeError: Failed to fetch` | Rechazo **simulado** de `window.fetch` por las suites (`docente.mjs:219`, `matrices.mjs:160`) y también cancelaciones reales de peticiones en vuelo al navegar. Sin respuesta HTTP. | Esperado; ya excluido por el filtro de consola. |
| `Error: dashboard-stats` (`TeacherDashboard.tsx`) | Se lanza **solo** si `fetch` obtiene respuesta y `!res.ok` para `GET /docente/:id/dashboard-stats`. Es decir, **hubo una respuesta HTTP no exitosa real**; no es el rechazo simulado (ese lanza `TypeError`). | Intermitente, **causa no confirmada**. |

Evidencias disponibles:
- Endpoint exacto: `GET /docente/:id/dashboard-stats` (`backend/src/routes/docente.js:152`); errores internos pasan por `responderError`; el acceso exige `allowAdminOrSelf` (403 si el token no es del mismo docente ni administrador).
- Ocurrió una vez, en un intento de `docente` en el que los demás intentos terminaron por memoria; no se registró el código HTTP (el diagnóstico se añadió después).
- Desde que `docente.mjs` muestra las respuestas HTTP ≥ 400 de la sesión (`p.fallos`) cuando hay errores de consola, **no se reprodujo**: ejecuciones posteriores 112/112 con consola limpia y sin respuestas ≥ 400, incluida la de este bloque.
- Hipótesis (no confirmadas): un 403 transitorio al cambiar de sesión entre usuarios en el mismo navegador (el panel monta con el `id` anterior y el token nuevo), o un 5xx con el equipo bajo presión de memoria. La ruta no fue modificada en los Bloques 1 a 1.2 y la base quedó idéntica y sin residuos.
- Tras la corrección de `matrices`, el diagnóstico de `docente.mjs` se conserva sin cambios (endpoint, respuestas HTTP ≥ 400 de la sesión) y ambos errores siguen separados: el `Failed to fetch` provocado por las suites no se mezcla con el incidente intermitente de `dashboard-stats`. No apareció ningún fallo no esperado nuevo.
- No se ocultó el error ni se tocaron las aserciones. Queda identificado como **intermitente sin causa confirmada**; si reaparece, el detalle de «consola sin errores inesperados» mostrará la petición y el código.

## 6. Estado de las bases

| Base | Estado |
|---|---|
| `proysocial_dev` | (verificado de nuevo tras la última ejecución de `matrices`, que no escribe datos) Línea base intacta: 5 usuarios, 2 semestres (2026B activo), 18 grupos, 2032 plantillas, 10 iniciativas, 33 entregables (20 aprobados / 9 enviados / 4 observados), 33 evidencias, 57 eventos. Las 10 iniciativas conservan fecha de inicio 2026-08-24, 16 semanas, programa y responsable (valores verificados uno por uno); fechas de semestres sin cambios (2026A 2026-02-10→2026-06-01; 2026B 2026-08-24→2026-12-13). 0 reportes sin iniciativa, 0 evidencias sin entregable, 0 eventos huérfanos. Sin fixtures (TST*, 2093–2096). |
| `proysocial_test` | Aislada: solo semillas (0 usuarios, 0 iniciativas, 0 entregables, 1 semestre), sin fixtures `TST_H`/`TST_I`/`TST_J`. Las pruebas con escritura exigen `PGDATABASE=proysocial_test` exacto, servidor local, sin `DATABASE_URL` y `current_database()` verificado. |
| Producción | No se accedió; no hay migraciones nuevas. |

## 7. Limitaciones que requieren futuras migraciones o decisiones
1. **Historial de responsables y colaboradores por periodos** (quién y desde/hasta cuándo) para poder reasignar sin reinterpretar reportes. Requiere tablas.
2. **Versionado de plantillas** para corregir una plantilla con reportes sin reescribir la historia.
3. **Corrección excepcional del calendario/semestre/iniciativa** con trazabilidad y autorización explícita (quién pidió, quién autorizó, qué cambió). Hoy no existe: con historia, estos campos son inmodificables.
4. **Restricciones en PostgreSQL** (no en este bloque): `ON DELETE RESTRICT` en las relaciones de historia; clave foránea de `entregable_eventos.entregable_id`; clave foránea de `entregable_evidencias.semestre`; un disparador que impida modificar `fecha_inicio`, `semanas` y `programa_id` de iniciativas con reportes. Las protecciones están solo en el backend: un script o cliente que no use la API puede seguir escribiendo sobre la historia.
5. **Fecha de fin estimada** de la iniciativa: sigue editable con historia (fuera del alcance autorizado; no se usa en los cálculos revisados, pero conviene confirmarlo en el Bloque 2).
6. **Importación de Excel:** la vista previa no anticipa los bloqueos por reasignación (pendiente del Bloque 1).
7. **Despliegue** sin pruebas en cada push a `main` (revisar antes de publicar; ver Bloque 1, §11).

## 8. Cierre
**Bloque 1.2: COMPLETADO.** Protecciones implementadas y verificadas; todas las suites E2E pertinentes pasan con su último resultado válido (`matrices` tras la corrección de la prueba). Riesgos pendientes: los de la sección 7 y el incidente intermitente de `dashboard-stats` (causa no confirmada).

## 9. Siguiente paso
Detenido al finalizar el Bloque 1.2. El siguiente bloque aprobado es CR-01 (métricas por semestre); no se ha iniciado.
