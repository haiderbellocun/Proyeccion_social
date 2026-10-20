# Backend · Bloque 3B — Fase B: doble escritura y sincronización de asignaciones (AL-01)

**Estado: COMPLETADA CON OBSERVACIONES.** La lógica funcional de la Fase B (doble escritura, B1/B2/B3, FK RESTRICT, compuerta de migración) está implementada, revisada y probada SOLO en `proysocial_test`; el cierre técnico añadió la prueba de carrera con el grupo y la verificación del backend nuevo contra una base de 34 migraciones. **`proysocial_dev` NO se modificó** (34 migraciones, sin `docente_grupo_matriz`, `…_cambios` ni `…_incidencias`). No se accedió a producción ni a GCP. No se hicieron commits, push, merge ni despliegues (el commit `5a80ce1` de la Fase B es tuyo). **Las observaciones son: las suites E2E que manipulan asignaciones por SQL quedan POSPUESTAS (no aprobadas, §5) y la activación A+B está preparada pero NO ejecutada (§9).**

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
| Integración completa en serie (`--test-concurrency=1`, base recreada con `test:db:setup -- --reset`) | **165 pruebas: 162 correctas, 0 fallidas, 3 omitidas** (las 3 de `devlogin`, que exigen `proysocial_dev` por diseño) |
| `npm run test:integration:protegidos` (Bloques 1, 1.1, 1.2, 2, historial y asignaciones) | **113/113** |
| `tsc --noEmit` / `npm run build` | sin errores / correcto |
| Residuos tras la corrida | `proysocial_test`: 0 usuarios, grupos, semestres, filas, cambios o incidencias de prueba; 0 vigentes dobles; 0 duplicados; 0 sesiones activas |

**Suites de la Fase B (todas incluidas en `test:integration:protegidos`):**

- `asignacion-docente-servicio` (18): asignación inicial, cambio legítimo, cambio de semestre (B1), asignación futura, docente sin grupo, inactivación, eliminación con historial, reportes aprobados, motivo faltante, idempotencia, incidencias ambiguas (B2), administradores simultáneos, importación Excel con asignación, error a mitad de transacción, sincronización y reconciliación, reaplicación de la migración, permisos y reglas del destino, esquema pendiente. Cada rechazo se compara con una **huella** (filas con hash, cambios, incidencias, espejo y reportes) antes y después.
- `asignacion-grupo-concurrencia` (9): carrera con el grupo (§6).
- `esquema-pendiente` (4): backend nuevo contra una base de 34 migraciones (§6b).
- `historial-asignaciones` (14, Fase A adaptada): esquema, triggers, backfill, reversión/reaplicación y compatibilidad.

**Protecciones de bloques anteriores (verificadas con sus propias suites y con el diff):** `historicos` (Bloque 1 y 1.1: eliminación de iniciativas, responsables y colaboradores, plantillas, grupos, semestres y usuarios con historia; concurrencia de administradores), `historicos11`, `historicos12` (fechas, semanas y programas), `metricas-semestre` (Bloque 2: aislamiento por semestre y fórmulas, sin cambios), `importacion`, `evidencias`, `bloque1`, `auth`. **Diff `b562b0a..5a80ce1` sobre código fuente** (solo `admin.js`, `historicosService.js`, `matrixImportDb.js`, el servicio nuevo y dos páginas del frontend): las únicas líneas eliminadas de `historicosService.js` son `historicoDeAsignacion` y `exigirAsignacionSinHistorico` (sustituidas por el servicio); en `admin.js` y `matrixImportDb.js` solo se eliminan las escrituras directas del espejo y su comprobación antigua. Las funciones restauradas desde `HEAD` (`ENTREGABLE_CON_AVANCE_SQL`, `bloquearHistoriaDeProyecto`, `historicoDeProyecto`, `historicoDeColaborador`, `historicoDeCalendarioSemestre`) no aparecen en el diff, es decir, están **idénticas** a la versión anterior. No se detectó ninguna regresión; no hubo que corregir nada en esta revisión.

**Matiz funcional respecto del bloqueo anterior:** antes, un docente con reportes en otro grupo no podía cambiar de grupo en ningún caso. Ahora el servicio lo bloquea **solo dentro del mismo semestre** (Decisión 1); entre semestres se permite, porque el historial conserva dónde estuvo. Es el comportamiento aprobado, no una pérdida de protección.

**Suites existentes adaptadas en la Fase B sin reducir cobertura:** `historicos`, `evidencias`, `importacion`, `metricas-semestre` y `historial-asignaciones`, con cambios de fixture (motivo, semestre activo temporal, alinear historial con el espejo y purgar historial al limpiar mediante `helpers/`; la purga usa `session_replication_role = replica`, exige superusuario y se niega a correr fuera de `proysocial_test`/`proysocial_dev`). Dos expectativas cambiaron por diseño: un grupo con asignaciones registradas ya no se elimina ni cambia de semestre, y un docente con historial ya no se elimina.

**Hallazgo de la Fase B corregido en la migración:** el backfill no era idempotente sobre datos creados por el servicio; ahora es de carga inicial (devuelve `{ omitido: true }` si ya hay cambios registrados) y no añade una fila heredada si el par (docente, grupo) ya tiene fila.

### Pruebas E2E POSPUESTAS (no aprobadas)

**No se ejecutaron ni se modificaron** `e2e/suites/administracion.mjs`, `e2e/suites/historicos.mjs` ni `e2e/suites/importador.mjs`. Crean fixtures de asignación y borran usuarios con SQL directo contra `proysocial_dev`; con A+B aplicada necesitan motivo, semestre activo, RESTRICT al limpiar y alineación del historial. Por decisión tuya, **su adaptación y ejecución quedan pendientes para la etapa dedicada a PostgreSQL y pruebas SQL**. No se forzaron resultados, no se tocaron aserciones y **no deben contarse como aprobadas**. Esta exclusión no impidió añadir pruebas de integración PostgreSQL nuevas en `proysocial_test`.

## 6. Escenarios de concurrencia probados

Con conexiones PostgreSQL reales del pool y servidores HTTP reales (no simuladas).

**6.1 Administradores sobre el mismo docente** (`asignacion-docente-servicio`, prueba 12)

| Escenario | Resultado |
|---|---|
| 12 rondas de dos administradores sobre el mismo docente, con destinos distintos o iguales | Una sola vigente, espejo = vigente, cadena de cambios continua; destinos distintos → dos eventos serializados; mismo destino → un evento (el segundo es idempotente). Sin 40P01 ni 23505 |
| Dos `PUT` HTTP simultáneos con tokens distintos | Ambos 200; 3 eventos coherentes |
| Dos transiciones masivas con listas en orden inverso + dos cambios puntuales sobre los mismos docentes | Sin interbloqueo: las masivas recorren por id y todas toman los bloqueos en el mismo orden |

**6.2 Carrera con el grupo** (`asignacion-grupo-concurrencia`, 9 pruebas). Administrador A cambia la asignación de un docente; administrador B elimina, archiva o cambia de semestre el grupo relacionado. Los órdenes se **fuerzan de forma determinista** reteniendo bloqueos con una conexión propia y comprobando que la otra operación **espera** (no avanza hasta que la primera confirma):

| Orden | Resultado verificado |
|---|---|
| A primero, B elimina | B espera; tras confirmar A, B recibe 400 (docentes asignados); el grupo existe; docente: espejo = vigente = grupo, 1 fila, 1 evento |
| A primero, B archiva | B espera y se aplica después (200); la asignación y el historial no cambian; el grupo queda inactivo con su historial |
| B primero (retiene el grupo) y lo elimina | A espera; al confirmar B, A recibe 404 `GRUPO_NO_DISPONIBLE`; el docente queda **exactamente** como estaba (sin filas, eventos ni espejo parciales); sin referencias huérfanas |
| B primero archiva | A espera y recibe 404 `GRUPO_NO_DISPONIBLE`; docente intacto |
| B primero cambia el semestre del grupo | A espera y recibe 409 `SEMESTRE_NO_ACTIVO` (B1); docente intacto |
| El docente **sale** del grupo mientras B intenta eliminarlo | El grupo no se elimina (tiene historial); el historial conserva ambos valores (2 filas, 2 eventos, 1 vigente) |
| 18 carreras libres repetidas (eliminar / archivar / cambiar semestre, alternando quién arranca primero) por servicio y rutas HTTP reales | Siempre uno de dos resultados consistentes: A gana (docente en el grupo; B rechazado salvo archivar, que es compatible) o B gana (A rechazado con error funcional y docente sin cambios). Observado: eliminar→B gana 6/6, archivar→A 3 y B 3, semestre→A gana 6/6. Sin 500 ni 40P01 |
| 6 rondas con 4 docentes cambiando al mismo grupo mientras B lo archiva o intenta eliminarlo | Cada docente en el grupo o intacto, nunca a medias; sin interbloqueos |
| Defensa en la base | `DELETE FROM grupos_matriz` directo sobre un grupo con asignaciones falla (23503): el `ON DELETE SET NULL` del espejo nunca se dispara a espaldas del historial |

Tras **cada** carrera se comprueba: sin filas del historial ni espejos que apunten a un grupo inexistente, una sola vigente por docente, sin filas duplicadas, deriva espejo/historial = 0 y cadena de cambios continua.

**Por qué es correcto (revisado, sin cambios en el servicio):** el servicio toma docente → bloqueo consultivo → grupo `FOR SHARE`; la eliminación, el archivo y el cambio de semestre del grupo toman el grupo `FOR UPDATE`/`UPDATE` y no necesitan bloquear usuarios, así que no existe un ciclo de espera. No hubo que corregir bloqueos. Defensa en profundidad: `uq_dgm_un_vigente`, el trigger de solapamiento y la FK `grupo_id` del historial; un 23505 residual se traduce a 409 `CONFLICTO_ASIGNACION`.

## 6b. Backend nuevo contra una base de 34 migraciones y compuerta de la migración 28

`esquema-pendiente` crea una base local desechable (`proysocial_test_pre28`, eliminada al terminar), la migra con el ejecutor estándar **sin** `PROYSOCIAL_APLICAR_FASE28` y arranca el servidor contra ella.

- **Ejecutor:** `migrate.js` aplica las 34 migraciones, **omite** la fase28 con el aviso «Pendiente (NO aplicada)», no la registra en `schema_migrations` y termina con código 0; repetirlo no cambia nada. Con `PROYSOCIAL_APLICAR_FASE28=1` la aplica y queda en 35.
- **Servidor nuevo sin la tabla:** arranca con normalidad. Toda operación que necesita el historial responde **503 `ESQUEMA_ASIGNACIONES_PENDIENTE`** (sin detalle interno de la base): `PUT /docentes/:id/grupo-matriz`, `PUT /usuarios/:id` con cambio de grupo, `POST /usuarios` con grupo, `POST /semestres/:codigo/asignaciones`, `GET /asignaciones/incidencias`, quitar grupo e importación con asignación de docente.
- **Sin escrituras silenciosas ni a medias:** tras todos esos rechazos el espejo, los usuarios, los grupos y las importaciones quedan idénticos; el `POST /usuarios` con grupo no crea el usuario; la importación con asignación se deshace completa.
- **Lo demás sigue funcionando:** métricas, semestres, alta de docente sin grupo, edición sin cambio de grupo, importación sin asignar y eliminación de un docente (las comprobaciones de historia toleran la ausencia de la tabla).
- **Sin reiniciar:** al aplicar después la migración con la compuerta, el **mismo** servidor empieza a operar y registra historial, espejo y evento.

**Validación de la migración 28 (en `proysocial_test`, con las suites de Fase A y B):** es **aditiva** (solo crea objetos propios; los únicos `DROP` son `DROP TRIGGER IF EXISTS` de sus propios triggers y de tablas temporales); se aplica limpiamente sobre las 34 migraciones; el backfill es idempotente y de carga inicial (repetir el archivo completo con datos existentes no cambia la huella); no duplica registros (`uq_dgm_sin_duplicados`); **una sola vigente por docente** (`uq_dgm_un_vigente`); las FK protegen los históricos (RESTRICT en docente y administrador autor; grupo sin acción); se conservan y no se resuelven solas las incidencias ambiguas; los triggers imponen las reglas aprobadas (solapamiento de vigencias, sin preasignaciones, protección de periodos anteriores, auditoría inmutable); y el bloque de verificación de la propia migración aborta si alguna vigente no coincide con el espejo.

## 7. Consistencia del espejo

Invariantes (verificados por la prueba 15 y por la función `invariantes` de la suite tras cada escenario): a lo sumo una vigente por docente; `usuarios.grupo_matriz_id` = grupo de la fila vigente (o NULL sin fila); el historial se conserva completo (filas cerradas con fin, autor y motivo); no hay vigencias incompatibles; repetir una operación no duplica; docentes sin grupo son válidos; los inactivos conservan su historial; los grupos archivados siguen disponibles para el historial; **nada** reescribe semestres cerrados ni reconstruye fechas desconocidas.

**Deriva:** solo puede aparecer si algo distinto del servicio escribe el espejo (el código antiguo durante una ventana de despliegue, un `UPDATE` manual). `diagnosticarDeriva` (consulta de solo lectura; `scripts/historial-docente-grupo-deriva.js`) la detecta; el servicio **se niega a cambiar** a un docente con deriva (409 `ASIGNACION_INCONSISTENTE`, sin escribir nada) y los demás docentes siguen funcionando. `reconciliar` (`scripts/historial-docente-grupo-reconciliar.js`, simulación por omisión; `--aplicar` para escribir) toma el **espejo como fuente** (así lo escribía el código anterior), cierra la vigente desfasada y abre la correspondiente con origen `reconciliacion`, sin administrador, empezando «ahora» (no inventa fechas pasadas). Si una regla de la base impide un caso (p. ej. reportes en el mismo semestre) lo informa como `no_reconciliados` y no lo toca: requiere decisión humana. Es idempotente.

## 8. Riesgos pendientes

1. **La aplicación coordinada NO es atómica entre código y base** y este procedimiento no puede hacerla atómica: son dos sistemas (la imagen desplegada y PostgreSQL). Lo que sí se garantiza es el orden y la detección (§9): el código nuevo falla de forma explícita (503) si falta la tabla (comprobado en §6b) y se niega a operar sobre deriva. Si algo escribiera el espejo con el código antiguo después de crear la tabla, aparecería deriva recuperable con el reconciliador.
2. **El job de migración del despliegue** (`.github/workflows/deploy-cloud-run.yml`) corre `migrate.js` **antes** de desplegar el servicio. Por eso la fase28 tiene **compuerta**: sin la variable se omite y el resto se aplica normalmente. `migrate.js` **no** corre al arrancar el servidor; sí lo hacen `dev:setup`, `test:db:setup` (con la variable) y el job de Cloud Run.
3. **E2E pospuestas** (§5): `administracion.mjs`, `historicos.mjs` e `importador.mjs` están sin adaptar ni ejecutar; no son parte de lo aprobado. Se retoman en la etapa de PostgreSQL y pruebas SQL, **antes** de dar por validada la activación en un entorno con esas suites.
4. **Lecturas sobre el espejo hasta la Fase C:** las métricas conservan su comportamiento y su límite conocido (advertencia «no existe historia de asignación» y `reportes_fuera_de_matriz_vigente`).
5. **El espejo como fuente de la reconciliación** es una suposición razonable (era la única fuente), pero una escritura manual errónea quedaría «validada» al reconciliar: revisar siempre la simulación antes de `--aplicar`.
6. **Incidencias sin resolver** bloquean a esos docentes en cambios de grupo hasta que un administrador las resuelva (por diseño B2); solo hay endpoints, no pantalla.
7. **Backfill sobre datos reales de desarrollo:** el preview (`historial-docente-grupo-preview.js`) muestra lo que reconstruirá; la prueba contra los 5 usuarios sintéticos de `proysocial_dev` es parte del paso 6 del procedimiento.
8. **Pruebas con superusuario:** la purga de fixtures usa `session_replication_role = replica`; solo corre en bases de prueba.
9. **Menores:** `evento_id` viaja como texto (BIGINT); un docente inactivo puede recibir un grupo (comportamiento previo, sin cambios); un reenvío idempotente no exige motivo (no hay cambio efectivo); `scripts/test-entregables-operativos.js` (script manual contra desarrollo) fue ajustado en una línea y no se ejecutó en esta etapa.
10. **Carreras libres no deterministas:** la prueba 7 de concurrencia no fuerza qué operación gana; por eso se complementa con los órdenes deterministas (1–6). Es normal que los conteos de «quién gana» varíen entre corridas; la aserción es la consistencia, no el reparto.

## 9. Procedimiento definitivo de activación coordinada A+B en desarrollo (NO ejecutado)

**Qué se garantiza y qué no.** Detener el backend entre la migración y el arranque del código nuevo garantiza que **ningún código antiguo escribe asignaciones con la tabla ya creada**. Eso no hace atómica la activación: son dos pasos manuales sobre dos sistemas. La seguridad descansa en (a) el orden, (b) que el código nuevo falla de forma explícita si falta la tabla (§6b), (c) que se niega a operar sobre deriva y (d) la verificación y el plan de recuperación. En desarrollo hay un único usuario, así que «suspender escrituras» es detener el servicio y los scripts. **Esperar tu autorización explícita antes de empezar.**

Precondiciones: rama integrada con la Fase B y este cierre; `npm test`, `npm run test:integration:protegidos` y `tsc`/`build` en verde en `proysocial_test`; E2E de asignaciones **todavía pospuestas** (no se ejecutan en este paso).

1. **Verificar la rama y los archivos pendientes.** `git status` limpio y `git log -1` coincide con lo probado; `git diff` vacío; comprobar que el backend que se arrancará es esa revisión.
2. **Comprobar las migraciones actuales.** En `proysocial_dev`: `SELECT COUNT(*) FROM schema_migrations` = **34**; `SELECT to_regclass('docente_grupo_matriz'), to_regclass('docente_grupo_matriz_cambios'), to_regclass('docente_grupo_matriz_incidencias')` = los tres NULL. Si no coincide, **parar**.
3. **Respaldo.** `& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U <usuario> -Fc -f proysocial_dev_antes_fase28.dump proysocial_dev`.
4. **Verificar el respaldo.** El archivo no está vacío; `pg_restore --list proysocial_dev_antes_fase28.dump` lo lee; recomendado: restaurarlo en una base desechable (`proysocial_dev_verif`), comparar conteos de `usuarios`, `grupos_matriz`, `proyectos`, `proyecto_entregables` y eliminarla.
5. **Suspender escrituras.** Detener el backend de desarrollo y cualquier script que escriba; verificar con `SELECT pid, state, query FROM pg_stat_activity WHERE datname = 'proysocial_dev' AND pid <> pg_backend_pid()` que no quedan sesiones de la aplicación.
6. **Línea base (solo lectura).** `node --env-file=.env.dev scripts/historial-docente-grupo-preview.js`; guardar la salida (filas e incidencias que reconstruirá el backfill).
7. **Aplicar la migración 28 y su backfill conservador.** `$env:PROYSOCIAL_APLICAR_FASE28 = '1'; npm run migrate` (desde `backend/`). La migración es transaccional y aditiva; el backfill corre dentro de ella (solo evidencia verificable: grupo vigente, reportes y excepciones; nunca por fechas, nombres ni semestre) y el bloque de verificación **aborta con ROLLBACK** si alguna vigente no coincide con el espejo. Confirmar 35 migraciones.
8. **Activar el backend con doble escritura.** Arrancar el backend con la revisión del paso 1. Es la primera vez que corre código capaz de escribir asignaciones en esa base.
9. **Verificar historial y espejo (solo lectura).** `node --env-file=.env.dev scripts/historial-docente-grupo-deriva.js` → 0 docentes con deriva y 0 con más de una vigente. Si hay deriva: simulación `node --env-file=.env.dev scripts/historial-docente-grupo-reconciliar.js`, revisarla, luego `--aplicar`, y repetir el chequeo hasta 0.
10. **Comprobar incidencias.** `GET /admin/asignaciones/incidencias?estado=todas` (o `SELECT tipo, estado, COUNT(*) FROM docente_grupo_matriz_incidencias GROUP BY 1, 2`); contrastar con la salida del paso 6. **Ninguna se resuelve en este paso**: se revisan y se deciden después de forma explícita (B2).
11. **Pruebas funcionales de asignación** (con datos sintéticos de desarrollo): asignar y reasignar un docente con motivo (200, evento registrado); sin motivo (400); a un grupo de otro semestre (409 `SEMESTRE_NO_ACTIVO`); repetir el mismo grupo (200, `cambio: false`, sin evento); intentar eliminar un docente con historial (409); importar una matriz con asignación; consultar métricas (sin cambios de cifras). Repetir el paso 9.
12. **Recuperación segura si algo falla.**
    - Falla el paso 7: la migración hace `ROLLBACK`; no queda nada aplicado; revisar el mensaje y repetir tras corregir.
    - Falla algo en 8–11 **antes** de que el código nuevo registre cambios (`SELECT COUNT(*) FROM docente_grupo_matriz_cambios` = 0): detener el backend, ejecutar el bloque «REVERSIÓN» de `fase28` (no toca `usuarios.grupo_matriz_id`) y arrancar el backend anterior.
    - Si ya hay cambios registrados: **no revertir tablas.** Detener el backend, exportar las tres tablas (`pg_dump -t`), diagnosticar con el paso 9 y reconciliar; restaurar desde el respaldo del paso 3 (sobre una base nueva, validando antes de sustituir) solo si es imprescindible.
13. **Reanudación controlada.** Dejar el backend activo, repetir el paso 9 tras el primer uso real y de nuevo al día siguiente; mantener el respaldo del paso 3 hasta confirmar estabilidad. Retomar entonces las E2E de la etapa de PostgreSQL.

### 9.2 Orden alternativo para entornos con tráfico (p. ej. el despliegue de Cloud Run) — a decidir por ti, no ejecutado

El workflow actual es: imagen → job de migración → bootstrap admin → servicio. Con la compuerta ese flujo **no** aplica la fase28 (queda «Pendiente»). Orden recomendado, **código primero y migración después**: (1) desplegar con el flujo normal (el servicio nuevo responde 503 solo en operaciones de asignación y el resto funciona, §6b); (2) ejecutar el job con la variable (`gcloud run jobs execute <servicio>-migrate --update-env-vars PROYSOCIAL_APLICAR_FASE28=1 --wait`); (3) verificar con los pasos 9–11. Así no existe una ventana con tabla nueva y código antiguo; sí siguen existiendo solicitudes en vuelo de la revisión anterior durante el reemplazo de instancias, y por eso la verificación y el reconciliador forman parte del procedimiento. **Esto reduce la ventana, no la elimina.**

## 10. Plan de la Fase C (lecturas históricas por semestre)

Objetivo: que las métricas y las vistas lean la asignación **vigente en cada semestre** desde el historial, en lugar del espejo, y eliminar los límites declarados en el Bloque 2 (AL-01). **Sin cambiar las fórmulas del Bloque 2**: solo cambia *a qué grupo se atribuye* cada docente y reporte.

1. **Resolver la asignación de un docente en un semestre:** función única (SQL + servicio) con la regla del modelo de vigencias — fila vigente; si no, la cerrada con mayor fin dentro del semestre; fechas desconocidas (filas heredadas) se tratan por el semestre del grupo, sin inventar fechas; ambigua → incidencia, no se atribuye y se informa.
2. **Métricas por semestre** (`/admin/metricas`, `/admin/dashboard`, `/docente/:id/matriz`): sustituir `usuarios.grupo_matriz_id` por la resolución del punto 1; retirar la advertencia «no existe historia de asignación» cuando haya historia y reducir `reportes_fuera_de_matriz_vigente`; los semestres cerrados se leen con la asignación que tuvieron, sin reescribirse.
3. **Comparación antes/después:** para el semestre activo el resultado debe ser **idéntico** al actual (con la huella de las pruebas del Bloque 2); la diferencia solo debe aparecer en docentes que cambiaron de grupo entre semestres.
4. **Rendimiento:** índice por `(docente_id, vigente)` ya existe; medir con `perf-metricas` antes de decidir un índice por `(grupo_id)` + rango de fechas.
5. **Espejo:** se mantiene como caché de la asignación vigente (lo siguen leyendo pantallas y el servicio); candidato a vista o columna generada solo si hay evidencia de que sobra.
6. **Pruebas:** reutilizar la suite de métricas con historial poblado; escenarios de cambio de grupo entre semestres, heredadas con fechas desconocidas, incidencias pendientes y docentes sin grupo; no reducir cobertura.
7. **Depuración de incidencias:** antes de activar la Fase C en una base, revisar y resolver las incidencias pendientes (B2) para que la atribución no dependa de casos ambiguos.
