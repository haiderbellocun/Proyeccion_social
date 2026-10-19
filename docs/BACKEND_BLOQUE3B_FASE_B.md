# Backend · Bloque 3B — Fase B: doble escritura y sincronización de asignaciones (AL-01)

**Estado: Fase B implementada y probada SOLO en `proysocial_test`. `proysocial_dev` NO se modificó** (verificado al cierre: 34 migraciones, sin `docente_grupo_matriz` ni `docente_grupo_matriz_cambios`, 5 usuarios). No se accedió a producción ni a GCP. No se hicieron commits, push, merge ni despliegues. **Detenido antes de aplicar A+B sobre `proysocial_dev`.**

Qué cambia respecto de la Fase A: ahora **toda** escritura de la asignación docente–grupo pasa por un servicio único que mantiene, en una sola transacción, el historial (`docente_grupo_matriz`), el espejo (`usuarios.grupo_matriz_id`) y un registro inmutable de cambios (`docente_grupo_matriz_cambios`). Las **lecturas** (métricas, dashboards, matriz del docente) siguen usando el espejo, sin cambios, hasta la Fase C (§10). No se tocaron las fórmulas del Bloque 2, la autenticación ni la identidad visual B2; no hay pantallas nuevas.

## 1. Arquitectura final del servicio

`backend/src/services/asignacionDocenteService.js` es la **única** vía de escritura del grupo de un docente.

| Función | Qué hace |
|---|---|
| `cambiarGrupoTx(client, { docenteId, grupoId, actorId, motivo, origen })` | Núcleo: opera dentro de la transacción de quien llama (rutas e importador). `grupoId = null` quita el grupo |
| `cambiarGrupo(pool, params)` | Igual, con su propia transacción (todo o nada) |
| `transicionarSemestre(pool, { semestre, asignaciones, actorId, motivo })` | Cambio de semestre: lista **explícita** `docente → grupo` sobre el semestre activo, todo o nada |
| `listarIncidencias` / `resolverIncidencia` | B2: consulta y resolución explícita y trazable |
| `diagnosticarDeriva` / `reconciliar` | Detección (solo lectura) y reconciliación técnica espejo ↔ historial |
| `asegurarEsquema` | Falla con **503 `ESQUEMA_ASIGNACIONES_PENDIENTE`** si la migración fase28 no está aplicada; nunca escribe el espejo sin registrar el historial |

**Los 11 pasos de `cambiarGrupoTx`** (una transacción, rollback total ante cualquier error):

1. Valida el **administrador** responsable (rol `admin` y estado `activo`; si no, 403 `ACTOR_INVALIDO`).
2. Bloquea la fila del **docente** (`FOR UPDATE`; debe ser rol docente, si no 404) y su bloqueo consultivo `(7310028, docente_id)`.
3. Comprueba que espejo y asignación vigente **coinciden**; si no, 409 `ASIGNACION_INCONSISTENTE` (hay que reconciliar antes; no se escribe nada).
4. **Idempotencia:** mismo grupo → `{ cambio: false }`, sin eventos ni filas (se resuelve antes de exigir motivo).
5. Valida el **motivo** (5–500 caracteres) y las **incidencias** pendientes de *ese* docente (B2).
6. Bloquea el **grupo** destino (`FOR SHARE`) y valida: existe y está activo (404), **tipo de docente** compatible (409 `TIPO_GRUPO_INCOMPATIBLE`) y **B1** (semestre activo).
7. **Protección histórica:** con reportes en un grupo de un semestre no se cambia a otro grupo del mismo semestre ni se queda sin grupo en él (409 `HISTORICO_PROTEGIDO`; los reportes no se mueven ni se reinterpretan).
8. **Cierra** la fila vigente (`hasta`, `cerrado_por`, `cerrado_en`, `motivo_cierre`), **abre** la nueva (origen y certeza `registrada`, `creado_por`), actualiza el **espejo** y **registra el evento** (docente, grupo anterior y nuevo, semestre anterior y nuevo, fecha y hora de la base, administrador, motivo, origen y las dos filas implicadas). La hora sale de `clock_timestamp()` de PostgreSQL, no del servidor de aplicación.
9. Los errores de las reglas de la base (23505, 23P01, 23514) se traducen a respuestas funcionales (`CONFLICTO_ASIGNACION`, `VIGENCIAS_SOLAPADAS`, `HISTORICO_PROTEGIDO`, `PREASIGNACION_NO_PERMITIDA`); cualquier otro error se propaga y la ruta responde 500 genérico sin detalle interno.

**Orden de bloqueos (el mismo en todas las rutas, sin interbloqueos):** `LOCK_ADMINISTRADORES` (solo si la ruta lo toma) → fila del docente → bloqueo consultivo del docente → fila del grupo (`FOR SHARE`). Las operaciones masivas recorren a los docentes **en orden de id**.

**Orígenes:** `asignacion_admin`, `importacion`, `transicion_semestre` (los escribe el servicio, con administrador) y `reconciliacion` (técnico: lo escribe solo el reconciliador, con `cambiado_por` NULL; la base impide NULL en cualquier otro origen).

## 2. Decisiones B1 / B2 / B3 tal como quedaron

**B1 — Semestre.** Las asignaciones ordinarias solo se admiten en grupos del **semestre activo**. Un grupo de otro semestre (futuro o anterior) → 409 `SEMESTRE_NO_ACTIVO` con `semestre_activo` y `semestre_grupo`; sin semestre activo → 409 `SIN_SEMESTRE_ACTIVO`. El procedimiento explícito para cambiar de semestre es: (1) el administrador activa el semestre con el endpoint **existente** `PUT /admin/semestres/:codigo/activar` (nada se activa automáticamente); (2) aplica `POST /admin/semestres/:codigo/asignaciones` con la lista explícita (`{ asignaciones: [{ docente_id, grupo_id }], motivo }`, máx. 500, sin docentes repetidos, solo sobre el semestre activo). Las asignaciones anteriores **se cierran, no se pierden**; nadie se reasigna por suposición. El importador avisa ya en la **vista previa** (`DOCENTE_SEMESTRE_NO_ACTIVO`) y no asigna a un docente en un semestre no activo.

**B2 — Ambigüedad.** Una incidencia `dos_grupos_en_un_semestre` pendiente bloquea **solo** los cambios de ese docente (409 `ASIGNACION_AMBIGUA`, con el detalle de las incidencias); los demás docentes funcionan con normalidad y reenviar el mismo grupo no depende de la incidencia. Nada se resuelve por fechas, nombres ni prioridades. Resolución explícita: `PUT /admin/asignaciones/incidencias/:id` con `estado` (`resuelta`/`descartada`) y una `nota` (≥ 10 caracteres); queda registrado quién, cuándo y por qué; resolver **no mueve a nadie**. Consulta: `GET /admin/asignaciones/incidencias?estado=&docente_id=`. Sin pantallas nuevas: son endpoints.

**B3 — Trazabilidad.** El motivo es obligatorio en todo cambio efectivo (400 `MOTIVO_OBLIGATORIO` / `MOTIVO_DEMASIADO_LARGO`). Cada cambio queda en `docente_grupo_matriz_cambios` (inmutable: UPDATE y DELETE fallan con 23514). Los procesos automáticos tienen **origen técnico verificable**: la carga inicial deja `vigente_al_migrar`/`evidencia_*` en las filas y **no genera eventos**; la reconciliación deja `origen = 'reconciliacion'` y `cambiado_por = NULL`. Un reenvío idempotente no crea eventos ni filas. Ninguna columna guarda contraseñas, tokens ni datos sensibles (la prueba 1 lo comprueba contra `information_schema`).

## 3. Corrección de la clave foránea del docente

Antes (Fase A) la FK era `ON DELETE CASCADE`: eliminar un docente borraba en silencio su historial. Corregido **en la migración fase28** (aún no aplicada en `proysocial_dev`; no hay migración correctiva):

| Relación | Regla | Efecto |
|---|---|---|
| `docente_grupo_matriz.docente_id` → `usuarios` | **RESTRICT** | un docente con historial no se elimina físicamente |
| `docente_grupo_matriz_incidencias.docente_id` | **RESTRICT** | ídem |
| `docente_grupo_matriz_cambios.docente_id` y `cambiado_por` | **RESTRICT** | ni el docente ni el administrador autor se eliminan: se **inactivan** |
| `docente_grupo_matriz.grupo_id` y `cambios.grupo_*_id` | sin acción (NO ACTION) | un grupo con asignaciones registradas no se elimina |
| `creado_por`, `cerrado_por`, `resuelta_por` | SET NULL | solo señalan autoría de la fila, no la historia |

Adaptaciones: `DELETE /admin/usuarios/:id` traduce 23001 (RESTRICT) y 23503 a **409 `HISTORICO_PROTEGIDO`** con el mismo formato del Bloque 1 y la alternativa «inactívalo»; `historicosService` cuenta las asignaciones y los cambios al decidir si un usuario, grupo o semestre tiene historia (un grupo que figura en el historial de asignaciones tampoco cambia de semestre ni se elimina). Inactivar sigue permitido y conserva historial, grupos y reportes.

## 4. Rutas integradas

| Ruta / componente | Cambio |
|---|---|
| `PUT /admin/docentes/:id/grupo-matriz` | Usa el servicio; exige `motivo`; respuesta compatible `{ ok: true }` + campos aditivos `cambio` y `evento_id` |
| `POST /admin/usuarios` | Crea el usuario sin grupo y asigna el inicial con el servicio, en **la misma transacción** (motivo «Alta del docente con grupo inicial») |
| `PUT /admin/usuarios/:id` | Quitar grupo / dejar de ser docente → servicio **antes** del UPDATE; asignar grupo → servicio **después**; exige `motivo_cambio_grupo` solo si el grupo cambia; el UPDATE ya no escribe `grupo_matriz_id`. Un cambio de **tipo de docente** que deje una asignación incompatible se rechaza (409) y no cambia nada; retirando el grupo (con motivo) se acepta |
| `PUT /admin/proyectos/:id/docentes` | La asignación automática de grupo al vincular docentes sin grupo pasa por el servicio (motivo con el id de la iniciativa) |
| Importador Excel (`matrixImportDb.js`) | `cambiarGrupoTx` con origen `importacion` y el nombre de archivo + lote en el motivo, dentro de la transacción del importador (si la asignación falla, **toda** la importación se deshace); B1 avisado en la vista previa |
| `POST /admin/semestres/:codigo/asignaciones` | **Nuevo:** transición explícita de semestre |
| `GET/PUT /admin/asignaciones/incidencias…` | **Nuevos:** B2 |
| `DELETE /admin/usuarios/:id` | Traducción RESTRICT → 409 |
| Clonación de semestre/grupo | No asigna docentes: no escribe el espejo (verificado por búsqueda) |
| `scripts/dev-setup.js` | La siembra sintética ejecuta el backfill para que espejo e historial nazcan alineados |
| Frontend (`UserManagement.tsx`, `ImportarMatriz.tsx`) | Solo el campo/valor de **motivo** que ahora exige la API (misma identidad visual; `tsc` sin errores; `build` correcto) |

**Búsqueda de otras escrituras directas del espejo** en `backend/src` y `backend/scripts`: no queda ninguna fuera del servicio, salvo el script de **prototipo** (`historial-docente-grupo-prototipo.js`, que corre dentro de `ROLLBACK`) y la siembra de `dev-setup.js` (cubierta por el backfill).

**Observación (no se cambió):** `PUT /admin/docentes/:id/grupo-matriz` no exige que el docente esté activo (comportamiento previo). Se deja como está; si se quiere prohibir, es una regla de una línea en el servicio.

## 5. Pruebas ejecutadas (todas en `proysocial_test`, en serie)

| Verificación | Resultado |
|---|---|
| Unitarias (`npm test`) | **61/61** |
| Integración completa en serie (`--test-concurrency=1`, base recreada) | **152 pruebas: 149 correctas, 0 fallidas, 3 omitidas** (las 3 de `devlogin`, que exigen `proysocial_dev` por diseño) |
| `tsc --noEmit` / `npm run build` | sin errores / correcto |
| Residuos tras la corrida | `proysocial_test`: 0 usuarios, filas, cambios o fixtures `TST` |
| `proysocial_dev` | intacto (34 migraciones, sin tablas nuevas) |

**Suite nueva `asignacion-docente-servicio.integration.test.js` (18 pruebas)**, ya incluida en `npm run test:integration:protegidos`. Cada rechazo se verifica comparando una **huella** (filas e historial con hash, cambios, incidencias, espejo y reportes de todos los docentes de prueba) antes y después:

1. Asignación inicial (autor, fecha, espejo, evento, sin columnas sensibles). 2. Cambio legítimo (fila cerrada con autor y motivo; ambas se conservan). 3. Cambio de semestre (B1, todo o nada, idempotente, reporte aprobado intacto). 4. Asignación futura (409 por servicio y HTTP). 5. Docente sin grupo (quitar, repetir, alta por API con y sin grupo). 6. Inactivación. 7. Eliminación con historial (RESTRICT por SQL y 409 por API; el administrador autor tampoco; auditoría inmutable). 8. Reportes aprobados (409 `HISTORICO_PROTEGIDO`, sin cambios). 9. Motivo faltante (servicio y dos rutas). 10. Reenvíos idempotentes. 11. Incidencias ambiguas (solo bloquea a ese docente; resolución explícita; permisos 401/403). 12. Concurrencia (§6). 13. Importación Excel con asignación (origen `importacion`, reimportar no duplica, reasignación con decisión, semestre no activo). 14. Error a mitad de transacción (§ abajo). 15. Sincronización y reconciliación. 16. Reaplicación de la migración. 17. Permisos y reglas del destino (actor inactivo/docente/inexistente, grupo inactivo/inexistente/de otro tipo, cambio de tipo de docente). 18. Esquema pendiente → 503.

**Error durante la transacción (prueba 14):** se instala en la base de pruebas un trigger que falla al insertar el evento (el **último** paso, cuando ya se cerró la fila, se abrió la nueva y se actualizó el espejo). Resultado: la huella es idéntica antes y después en el servicio, en la ruta HTTP (500 genérico, sin detalle interno), en una transición masiva (ninguna asignación queda aplicada) y en una importación (el grupo, las plantillas y el registro de importación tampoco quedan). El trigger se elimina al terminar.

**Suites existentes adaptadas sin reducir cobertura:** `historial-asignaciones` (Fase A: 14/14; las pruebas 9, 13 y 14 ahora verifican RESTRICT, la reversión ampliada con las tablas nuevas y la doble escritura), `historicos`, `evidencias`, `importacion`, `metricas-semestre`. Los cambios son de fixture: motivo en los cuerpos, activar temporalmente el semestre propio al asignar (`helpers/semestre-activo.js`), alinear el historial con el espejo que el fixture escribe por SQL (`helpers/alinear-historial.js`, usa la reconciliación técnica) y purgar el historial al limpiar (`helpers/purgar-asignaciones.js`: usa `session_replication_role = replica`, requiere superusuario como en `proysocial_test` y se niega a correr en otra base). Dos expectativas cambiaron por diseño: un grupo que figura en el historial de asignaciones ya no se elimina ni cambia de semestre (409), y un docente con historial ya no se elimina.

**Hallazgo corregido por las pruebas (migración):** el backfill **no era idempotente sobre datos creados por el servicio** (al reaplicar el archivo completo añadía una fila «heredada» para un par docente–grupo que ya tenía fila con fechas, y creaba incidencias `sin_evidencia` para docentes nuevos sin grupo). Se corrigió en `fase28` (aún no aplicada en dev): el backfill es de **carga inicial** —si ya hay cambios registrados, devuelve `{ omitido: true }` sin tocar nada— y además no añade una fila heredada si el par (docente, grupo) ya tiene cualquier fila. La prueba 16 lo verifica con la huella y con el archivo completo ejecutado de nuevo.

**No ejecutado (dicho con claridad):** las suites **E2E** (`e2e/suites/`) **no se ejecutaron** en esta fase: corren contra `proysocial_dev`, que no se modifica. Tres de ellas (`administracion.mjs`, `historicos.mjs` e `importador.mjs`) tocan asignaciones o borran usuarios por SQL; con la Fase A+B aplicada necesitan los mismos ajustes que las suites de integración (motivo, semestre activo, RESTRICT al limpiar, alinear historial). **Deben adaptarse y ejecutarse como parte de la activación coordinada (§9), no antes.**

## 6. Escenarios de concurrencia probados

Con conexiones PostgreSQL reales del pool (no simuladas):

| Escenario | Resultado observado |
|---|---|
| 12 rondas de dos administradores sobre el **mismo docente** con destinos distintos o iguales | Siempre una sola vigente, espejo = vigente, cadena de cambios continua (`grupo_anterior(k+1) = grupo_nuevo(k)`); destinos distintos → dos eventos serializados; mismo destino → un evento (el segundo es idempotente). Sin errores 40P01 ni 23505 |
| Dos `PUT` HTTP simultáneos con tokens de administradores distintos | Ambos 200; 3 eventos coherentes |
| Dos transiciones masivas (orden de lista invertido) + dos cambios puntuales sobre los mismos docentes | Sin interbloqueo (las masivas recorren por id y todas toman los bloqueos en el mismo orden); invariantes intactos |
| Cambio simultáneo con eliminación de grupo/semestre | **No se probó con una prueba de carrera nueva en esta fase.** El diseño toma el grupo `FOR SHARE` (las rutas de eliminación y de cambio de semestre lo toman `FOR UPDATE`, como en el Bloque 1.1) y la tabla de asignaciones suma la regla «grupo con asignaciones registradas no se elimina» (probada de forma secuencial en `historicos` 14). Queda como prueba pendiente recomendada |

Defensa en profundidad: aunque el servicio serializa por docente, la base mantiene el índice único parcial `uq_dgm_un_vigente` y el trigger de solapamiento; un 23505 residual se traduce a 409 `CONFLICTO_ASIGNACION` («vuelve a intentarlo»).

## 7. Consistencia del espejo

Invariantes (verificados por la prueba 15 y por la función `invariantes` de la suite tras cada escenario): a lo sumo una vigente por docente; `usuarios.grupo_matriz_id` = grupo de la fila vigente (o NULL sin fila); el historial se conserva completo (filas cerradas con fin, autor y motivo); no hay vigencias incompatibles; repetir una operación no duplica; docentes sin grupo son válidos; los inactivos conservan su historial; los grupos archivados siguen disponibles para el historial; **nada** reescribe semestres cerrados ni reconstruye fechas desconocidas.

**Deriva:** solo puede aparecer si algo distinto del servicio escribe el espejo (el código antiguo durante una ventana de despliegue, un `UPDATE` manual). `diagnosticarDeriva` (consulta de solo lectura; `scripts/historial-docente-grupo-deriva.js`) la detecta; el servicio **se niega a cambiar** a un docente con deriva (409 `ASIGNACION_INCONSISTENTE`, sin escribir nada) y los demás docentes siguen funcionando. `reconciliar` (`scripts/historial-docente-grupo-reconciliar.js`, simulación por omisión; `--aplicar` para escribir) toma el **espejo como fuente** (así lo escribía el código anterior), cierra la vigente desfasada y abre la correspondiente con origen `reconciliacion`, sin administrador, empezando «ahora» (no inventa fechas pasadas). Si una regla de la base impide un caso (p. ej. reportes en el mismo semestre) lo informa como `no_reconciliados` y no lo toca: requiere decisión humana. Es idempotente.

## 8. Riesgos pendientes

1. **La aplicación coordinada NO es atómica entre código y base** y este procedimiento no puede hacerla atómica: son dos sistemas (la imagen desplegada en Cloud Run y PostgreSQL). Lo que sí se garantiza es el orden y la detección (§9): el código nuevo falla de forma explícita (503) si falta la tabla y se niega a operar sobre deriva. Si se pudiera escribir con el código antiguo después de crear la tabla, se produce deriva recuperable con el reconciliador.
2. **El job de migración del despliegue** (`.github/workflows/deploy-cloud-run.yml`) corre `migrate.js` **antes** de desplegar el servicio. Por eso la fase28 tiene **compuerta**: sin `PROYSOCIAL_APLICAR_FASE28=1` el ejecutor la salta con el aviso «Pendiente (NO aplicada)» y el resto de migraciones se aplica normalmente. `migrate.js` **no** se ejecuta al arrancar el servidor; sí lo ejecutan `dev:setup`, `test:db:setup` (con la variable) y el job de Cloud Run. Hay que decidir conscientemente cuándo aplicar la fase28 (§9).
3. **Lecturas aún sobre el espejo:** hasta la Fase C, las métricas conservan su comportamiento y su límite conocido (la advertencia «no existe historia de asignación» y `reportes_fuera_de_matriz_vigente`); no se corrige en esta fase.
4. **El espejo como fuente de la reconciliación** es una suposición razonable (era la única fuente hasta ahora), pero una escritura manual errónea quedaría «validada» al reconciliar: revisar la simulación antes de `--aplicar`.
5. **Incidencias sin resolver** bloquean a esos docentes en cambios de grupo hasta que un administrador las resuelva (por diseño B2); no hay pantalla, solo endpoints.
6. **E2E sin adaptar** (§5).
7. **Pruebas con superusuario:** la purga de fixtures usa `session_replication_role = replica`; solo corre en `proysocial_test`/`proysocial_dev` y se niega en otra base.
8. **Menores:** `evento_id` viaja como texto (BIGINT de PostgreSQL); un docente inactivo puede recibir un grupo (comportamiento previo, §4); `historicosService.js` muestra el aviso LF→CRLF de Git al tocarlo (no es un cambio de contenido).
9. **Error propio durante el desarrollo, ya corregido:** al recortar `historicosService.js` eliminé por error funciones del Bloque 1.1 (`ENTREGABLE_CON_AVANCE_SQL`, `historicoDeProyecto`, etc.) y el servidor no arrancaba (131 pruebas fallaban). Las restauré literalmente desde `HEAD` y la suite completa lo confirma. Conviene revisar `git diff backend/src/services/historicosService.js` al integrar: solo deben verse los conteos de asignaciones y el retiro de `historicoDeAsignacion`/`exigirAsignacionSinHistorico`.

## 9. Procedimiento de aplicación coordinada A+B en desarrollo (NO ejecutado)

**Principio:** no hay ventana en la que el código antiguo pueda escribir asignaciones con la tabla ya creada, siempre que el servicio esté **detenido** entre la migración y el arranque del código nuevo. En desarrollo hay un único usuario: se garantiza deteniendo el backend. En producción no se puede detener el tráfico de forma absoluta sin mantenimiento; allí se aplica el orden alternativo del punto 9.2.

### 9.1 Desarrollo (`proysocial_dev`)

Precondiciones: Fase B revisada y fusionada por ti; suites de integración en verde en `proysocial_test`; E2E adaptados (§5).

1. **Respaldo** (PowerShell, `pg_dump` 18.1 en `C:\Program Files\PostgreSQL\18\bin`): `& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U <usuario> -Fc -f proysocial_dev_antes_fase28.dump proysocial_dev`. Comprobar que el archivo no está vacío y que `pg_restore --list` lo lee.
2. **Suspender escrituras:** detener el backend de desarrollo (`npm run dev` / `node src/index.js`) y cualquier script que escriba. Verificar con `SELECT pid, state, query FROM pg_stat_activity WHERE datname = 'proysocial_dev'` que no hay sesiones de la aplicación.
3. **Línea base:** `node --env-file=.env.dev scripts/historial-docente-grupo-preview.js` (solo lectura) para ver lo que el backfill reconstruirá y las incidencias esperadas; guardar la salida.
4. **Migrar:** `PROYSOCIAL_APLICAR_FASE28=1 npm run migrate` (en PowerShell: `$env:PROYSOCIAL_APLICAR_FASE28 = '1'; npm run migrate`). La migración es transaccional, idempotente y aborta si tras el backfill alguna vigente no coincide con el espejo.
5. **Activar el código nuevo:** arrancar el backend con la Fase B. Es la **primera** ocasión en que corre código capaz de escribir asignaciones.
6. **Verificar invariantes (solo lectura):** `node --env-file=.env.dev scripts/historial-docente-grupo-deriva.js` → 0 docentes con deriva y 0 con más de una vigente. Revisar las incidencias iniciales con `GET /admin/asignaciones/incidencias`.
7. **Reconciliar solo si el paso 6 informa deriva:** simulación `node --env-file=.env.dev scripts/historial-docente-grupo-reconciliar.js`, revisar y luego `--aplicar`; repetir el paso 6 hasta 0.
8. **Pruebas de humo:** asignar y reasignar un docente de prueba con motivo (200), omitir el motivo (400), intentar un grupo de otro semestre (409), intentar eliminar un docente con historial (409), importar una matriz con asignación y consultar métricas (sin cambios).
9. **Ejecutar los E2E adaptados** (`e2e/`) en serie, respetando los umbrales de memoria vigentes (mínimo 700 MB libres para iniciar, 450 MB para interrumpir).

**Recuperación:** (a) si falla el paso 4 la migración hace `ROLLBACK` y no queda nada aplicado; (b) si hay que volver atrás **antes** de que el código nuevo haya registrado cambios, usar el bloque «REVERSIÓN» al final de `fase28` (no toca `usuarios.grupo_matriz_id`; el código nuevo vuelve a fallar con 503 solo en operaciones de asignación); (c) si ya existen cambios registrados, **no** revertir tablas: exportar primero `docente_grupo_matriz`, `…_cambios` y `…_incidencias`, y recuperar desde el respaldo del paso 1 solo si es imprescindible (`pg_restore --clean` sobre una base nueva y validar antes de sustituir).

### 9.2 Orden alternativo para entornos con tráfico (p. ej. el despliegue de Cloud Run) — **a decidir por ti, no ejecutado**

El flujo actual del workflow es: imagen → job de migración → bootstrap admin → servicio. Con la compuerta, ese mismo flujo **no** aplica la fase28 (queda «Pendiente»). El orden recomendado es **código primero, migración después**: (1) desplegar con el flujo normal (la fase28 se salta; el servicio nuevo responde 503 `ESQUEMA_ASIGNACIONES_PENDIENTE` solo en operaciones de asignación y el resto funciona igual); (2) ejecutar el job con la variable (`gcloud run jobs execute <servicio>-migrate --update-env-vars PROYSOCIAL_APLICAR_FASE28=1 --wait`); (3) verificar con los scripts del paso 6/7. Así no existe una ventana con tabla nueva y código antiguo. Siguen existiendo solicitudes en vuelo de la revisión anterior durante el reemplazo de instancias, y por eso el paso de verificación y el reconciliador son parte del procedimiento. **Esto reduce la ventana, no la elimina:** no es atómico.

## 10. Plan de la Fase C (lecturas históricas por semestre)

Objetivo: que las métricas y las vistas lean la asignación **vigente en cada semestre** desde el historial, en lugar del espejo, y eliminar los límites declarados en el Bloque 2 (AL-01). **Sin cambiar las fórmulas del Bloque 2**: solo cambia *a qué grupo se atribuye* cada docente y reporte.

1. **Resolver la asignación de un docente en un semestre:** función única (SQL + servicio) con la regla del modelo de vigencias — fila vigente; si no, la cerrada con mayor fin dentro del semestre; fechas desconocidas (filas heredadas) se tratan por el semestre del grupo, sin inventar fechas; ambigua → incidencia, no se atribuye y se informa.
2. **Métricas por semestre** (`/admin/metricas`, `/admin/dashboard`, `/docente/:id/matriz`): sustituir `usuarios.grupo_matriz_id` por la resolución del punto 1; retirar la advertencia «no existe historia de asignación» cuando haya historia y reducir `reportes_fuera_de_matriz_vigente`; los semestres cerrados se leen con la asignación que tuvieron, sin reescribirse.
3. **Comparación antes/después:** para el semestre activo el resultado debe ser **idéntico** al actual (con la huella de las pruebas del Bloque 2); la diferencia solo debe aparecer en docentes que cambiaron de grupo entre semestres.
4. **Rendimiento:** índice por `(docente_id, vigente)` ya existe; medir con `perf-metricas` antes de decidir un índice por `(grupo_id)` + rango de fechas.
5. **Espejo:** se mantiene como caché de la asignación vigente (lo siguen leyendo pantallas y el servicio); candidato a vista o columna generada solo si hay evidencia de que sobra.
6. **Pruebas:** reutilizar la suite de métricas con historial poblado; escenarios de cambio de grupo entre semestres, heredadas con fechas desconocidas, incidencias pendientes y docentes sin grupo; no reducir cobertura.
7. **Depuración de incidencias:** antes de activar la Fase C en una base, revisar y resolver las incidencias pendientes (B2) para que la atribución no dependa de casos ambiguos.
