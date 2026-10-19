# Backend · Bloque 3B — Fase A: historial docente–grupo (AL-01)

**Estado: Fase A implementada y probada SOLO en `proysocial_test`. `proysocial_dev` NO se modificó** (sigue en 34 migraciones, sin objetos nuevos). No se accedió a producción ni a GCP. Detenido antes de aplicar nada en desarrollo, a la espera de tu autorización.

La tabla nueva **todavía no la usa ningún endpoint** (ni lectura, ni escritura): no hay doble escritura, ni cambios de métricas, de importación, de pantallas ni de diseño.

## 1. Decisión 8 y la regla provisional

**Decisión 8 (Bloque 3A, §1).** *¿Se podrá asignar a un docente al grupo del semestre siguiente mientras el actual sigue en curso?* Alternativas: **A.** No: el cambio ocurre al cerrar el periodo (como hoy). **B.** Sí (modelo C de la decisión 3: un vigente por docente **y semestre**). Recomendación del 3A: **A** (sin ambigüedad sobre dónde reporta el docente: hoy el reporte exige `usuarios.grupo_matriz_id = plantilla.grupo_id`).

**Tu regla provisional:** «ninguna preasignación futura puede sobrescribir el grupo vigente ni modificar el historial».

**¿Contradice 8-A? No.** 8-A es la versión **más estricta** (no existen preasignaciones); tu regla es el invariante que cualquier preasignación tendría que respetar, y 8-A lo cumple por construcción. La diferencia es de grado, no de dirección. Por eso seguí. Para que ninguna de las dos dependa de que el código se porte bien, **el esquema las impone** (§2): una asignación creada por la aplicación no puede empezar en el futuro, no puede haber dos vigentes, y una fila no vigente solo puede ser histórica.

**Una advertencia que sí te traigo (Fase B, no Fase A):** hoy los endpoints permiten asignar a un docente al grupo de un semestre que **todavía no empezó**, y eso lo mueve de inmediato (cambia el espejo). Eso es de facto una «preasignación que pisa la vigente». La Fase A no lo toca; en la Fase B habrá que decidirlo (ver §10, pregunta B1).

## 2. Esquema final implementado

`migrations/fase28_docente_grupo_matriz.sql` (aditiva, idempotente, transaccional). Objetos:

| Objeto | Descripción |
|---|---|
| `docente_grupo_matriz` | Una fila por asignación. Modelo de **vigencias**: varias filas históricas por docente (incluso en un mismo semestre), **una sola vigente** |
| `docente_grupo_matriz_incidencias` | Conflictos y casos no reconstruibles que detecta el backfill (`dos_grupos_en_un_semestre`, `reportes_sin_plantilla`, `sin_evidencia`); estado `pendiente/resuelta/descartada`. **Nunca se resuelven solos** |
| `docente_grupo_matriz_backfill()` | Backfill conservador e idempotente (solo evidencia verificable); invocable de nuevo con seguridad |
| `dgm_validar()` / `dgm_proteger()` + triggers | Reglas que la base impone (ver abajo) |

**Columnas:** `id`, `docente_id`, `grupo_id`, `vigente`, `desde`, `hasta`, `origen` (`vigente_al_migrar`, `evidencia_reportes`, `evidencia_excepciones`, `asignacion_admin`, `importacion`), `certeza` (`alta`, `media`, `registrada`), `evidencia` (JSONB), `creado_por`, `creado_en`, `cerrado_por`, `cerrado_en`, `motivo_cierre`.

**Restricciones e índices:**
- `UNIQUE (docente_id) WHERE vigente` → **una sola asignación vigente por docente** (también ante concurrencia).
- `UNIQUE (docente_id, grupo_id, COALESCE(desde, '-infinity'))` → sin duplicados (las filas heredadas, con inicio desconocido, son únicas por docente y grupo; permite varias estancias en el mismo grupo si `desde` difiere).
- `CHECK`: `vigente ⇒ hasta IS NULL`; `hasta ≥ desde`; `origen`/`certeza` válidos y coherentes (`registrada` ⇔ creada por la aplicación); evidencia histórica nunca vigente.
- **Fechas desconocidas solo en filas heredadas:** `CHECK (origen heredado OR (desde NOT NULL AND (vigente OR hasta NOT NULL)))`.
- `INDEX (grupo_id)`; FK a `usuarios` y `grupos_matriz`; `creado_por`/`cerrado_por` `ON DELETE SET NULL`.

**Triggers (sin extensiones; la clave de bloqueo 7310028 es propia):**
- **Solapamiento de vigencias**, cuando las fechas están disponibles (rangos `[desde, hasta)`: contiguas no se solapan; las filas con inicio desconocido no se comparan), serializado por docente con `pg_advisory_xact_lock`. *No uso `btree_gist`*: exige `CREATE EXTENSION` y no puedo asumir ese privilegio en Cloud SQL.
- **Sin preasignaciones:** una fila de origen `asignacion_admin`/`importacion` no puede empezar en el futuro.
- **Decisión 1 en la base:** con reportes en un grupo de un semestre, no se crea una fila en **otro grupo del mismo semestre** (`HISTORICO_PROTEGIDO`); a otro semestre sí.
- **Periodos anteriores protegidos:** no se borra; solo se **cierra** una fila vigente (`vigente`, `hasta`, `cerrado_*`); una fila cerrada no se reabre ni se modifica; `docente`, `grupo`, `desde`, `origen`, `certeza`, `evidencia` y `creado_*` son inmutables.
- Solo usuarios con rol `docente`.

**Desviaciones respecto del 3A (y por qué):**
1. **`docente_id` → `ON DELETE CASCADE`** (el 3A decía `RESTRICT`): hoy un docente sin historia se puede eliminar y sus excepciones se van con él (`docente_entregable_excepciones` ya es `CASCADE`). Con `RESTRICT` la tabla nueva **cambiaría el comportamiento de `DELETE /admin/usuarios`**, que pediste no tocar. El trigger solo permite ese borrado en cascada (el docente ya no existe). Con historia real (reportes) el backend ya bloquea. La Fase B lo reevaluará.
2. **`grupo_id` → sin acción de borrado (`NO ACTION`, error `23503`)**, no `RESTRICT` (`23001`): un grupo con filas no se elimina, y el código de error es el que ya manejan los endpoints.
3. **Columna `certeza`, tabla de incidencias y función de backfill:** añadidas para registrar grado de certeza, conflictos y poder repetir el backfill.
4. **Sin columna `semestre`:** se deriva de `grupos_matriz.semestre` (sin denormalizar).

## 3. Migración creada
- **Archivo:** `backend/migrations/fase28_docente_grupo_matriz.sql`, siguiente a `fase27_acceso_evidencias.sql` (verifiqué los nombres existentes; convención `faseNN_*.sql`, cabecera explicativa, «aditiva e idempotente»), registrada en `backend/scripts/migrate.js`.
- **Transaccional:** el ejecutor corre cada archivo en una transacción y lo registra en `schema_migrations`; si algo falla, no queda nada.
- **Sin eliminar datos:** solo `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, `INSERT … ON CONFLICT DO NOTHING`. No toca `usuarios.grupo_matriz_id`.
- **Verificación incorporada:** al terminar el backfill, la propia migración comprueba que las asignaciones vigentes **espejan exactamente** a `usuarios.grupo_matriz_id`; si no, **aborta**.
- **Reversión documentada** al final del archivo (bloque comentado) y probada (§6).

## 4. Resultado de la aplicación en `proysocial_test`
| Comprobación | Resultado |
|---|---|
| Estado previo | 34 migraciones, sin la tabla |
| Aplicación (`npm run test:db:setup`) | `Aplicada: fase28_docente_grupo_matriz.sql` → **35 migraciones** |
| Desde una base limpia (`npm run test:db:setup -- --reset`: solo recrea `proysocial_test`) | Las **35 migraciones** se aplican desde cero sin errores (compatibilidad con las 34 anteriores) |
| Reaplicación | `Omitida: fase28…` (idempotente) |
| Objetos creados | 2 tablas (4 índices en la principal, incluida la clave primaria, y 2 en incidencias), 2 triggers, 3 funciones |
| Backfill sobre la base de pruebas vacía | 0 filas (no hay docentes) |

## 5. Backfill y fuentes de evidencia

**Qué se considera evidencia (y qué no):**

| Fuente | Condición | Certeza |
|---|---|---|
| **Grupo vigente** (`usuarios.grupo_matriz_id`) | Dato actual exacto | `alta` |
| **Reportes** (`proyecto_entregables.docente_id` + `plantilla_id` → grupo) | El flujo solo los crea si el docente pertenecía al grupo | `alta` |
| **Excepciones individuales** | Misma guarda (`INNER JOIN usuarios … u.grupo_matriz_id = tpl.grupo_id`); **solo se aceptan si no hay conflicto** en ese semestre (inequívoca) | `media` |
| Eventos y evidencias del flujo | Derivados de los reportes: corroboran, no son fuente nueva | — |
| **Fechas, nombres, semestre «más probable», creación del usuario** | **Nunca** | — |

Cada fila guarda: docente, grupo (y por él, semestre), `origen`, `certeza`, `evidencia` (fuentes y conteos), y **vigencia desconocida** (`desde`/`hasta` `NULL`). Las fuentes de un mismo par docente–grupo se **fusionan en una sola fila**. Conflictos (evidencia en dos grupos de un semestre) y reportes sin plantilla **no se asignan**: van a `incidencias`. La asignación **vigente se inserta siempre** (es el dato actual). Docentes sin grupo y sin evidencia quedan registrados como `sin_evidencia`, **sin grupo inventado**.

**Vista previa regenerada sobre `proysocial_dev`** (solo lectura, transacción `READ ONLY`) — **idéntica al diagnóstico del 3A**:

| Docente | Grupo | Semestre | Fuente de evidencia | Certeza | Vigencia | Origen |
|---|---|---|---|---|---|---|
| 2 · María Rodríguez | 16 | 2026B | grupo vigente + 21 reportes (14 aprobados; 38 eventos, 21 evidencias) | alta | desconocida (vigente) | `vigente_al_migrar` |
| 3 · Carlos Mendoza | 17 | 2026B | grupo vigente + 12 reportes (6 aprobados; 19 eventos, 12 evidencias) | alta | desconocida (vigente) | `vigente_al_migrar` |
| 4 · Andrés Torres | 18 | 2026B | solo grupo vigente (0 reportes) | alta | desconocida (vigente) | `vigente_al_migrar` |

| Medida | 3A | Ahora |
|---|---|---|
| Asignaciones recuperables con certeza | 3 | **3** |
| Históricas distintas del vigente | 0 | **0** |
| Conflictos / revisión manual | 0 / 0 | **0 / 0** |
| No reconstruibles | Laura Gómez; semestre 2026A | **Laura Gómez** (incidencia `sin_evidencia`) y **2026A** (sin población demostrable; no se reconstruye) |
| Excepciones / importaciones | 0 / 0 | 0 / 0 |
| Riesgo de duplicación | 0 | **0** (2 de las 3 filas fusionan varias fuentes en una) |

La vista previa **predice exactamente** lo que inserta la migración: lo comprueba una prueba de equivalencia.

## 6. Resultados de las pruebas (`proysocial_test`)
Suite nueva `backend/test/integration/historial-asignaciones.integration.test.js` (omitida salvo `PGDATABASE=proysocial_test`; añadida a `npm run test:integration:protegidos`): **14 de 14**, estable en 3 ejecuciones.

| Verificación pedida | Prueba | Resultado |
|---|---|---|
| Asignación inicial | 1 | fila vigente con autor, fecha, origen `asignacion_admin`; el espejo es independiente |
| Cambio entre semestres | 2 | se cierra (quién, cuándo, motivo) y se abre la siguiente; ambas se conservan; consulta histórica devuelve el grupo de entonces |
| Cambio legítimo dentro de un semestre | 3 | dos filas del mismo semestre; la efectiva es la última y **no** es ambigua |
| Bloqueo con reportes | 4 | `HISTORICO_PROTEGIDO` dentro del semestre (la operación completa se deshace); a otro semestre sí |
| Una sola vigente / solapamientos | 5 | `uq_dgm_un_vigente`; solapamiento de vigencias conocidas rechazado |
| Fechas históricas desconocidas | 6 | solo en filas heredadas; lo creado por la aplicación debe traer inicio (y fin si está cerrado); coherencia de `origen`/`certeza`/`hasta ≥ desde` |
| **Sin preasignaciones** | 7 | una asignación no puede empezar en el futuro ni pisar la vigente; el historial no cambia |
| Duplicados, FK, rol, **grupos archivados** | 8 | `uq_dgm_sin_duplicados`; docente/grupo inexistentes → `23503`; solo rol docente; un grupo archivado con asignaciones no se elimina |
| Periodos anteriores / integridad | 9 | no se borra, no se reasigna, no se reabre; borrar un docente sin historia arrastra sus filas (comportamiento heredado) |
| **Operaciones concurrentes** | 10 | la segunda espera al docente (bloqueo) y recibe un error limpio; una sola vigente; dos cierres simultáneos: solo uno cierra; sin interbloqueo |
| Backfill (casos difíciles) | 11 | solo evidencia verificable; certeza, fuente y vigencia desconocida por fila; conflicto → incidencia sin asignar; reportes sin plantilla → incidencia; docente sin evidencia sin grupo; **equivalencia con la vista previa** |
| **Idempotencia del backfill** | 12 | repetirlo no cambia nada |
| **Reversión y migración con datos** | 13 | se revierte con el bloque documentado, `usuarios.grupo_matriz_id` queda intacto y la API sigue funcionando sin la tabla; se reaplica con el ejecutor estándar sobre datos reales y reconstruye las 7 filas demostrables y 3 incidencias; reejecutar el archivo completo es inocuo |
| **Compatibilidad con los endpoints** | 14 | métricas idénticas antes y después del backfill; eliminar un docente sin historia con fila → 200; reasignar por la ruta actual funciona y **todavía no escribe el historial** (la deriva es detectable) |

**Regresión:** unitarias **61/61**; integración completa (todas las suites, en serie): **131 OK, 0 fallas, 3 omitidas** (guardas de base de datos); incluye los Bloques 1, 1.1, 1.2 y 2. Las consultas existentes siguen funcionando con la migración aplicada.

## 7. Estado de `proysocial_dev` (sin cambios)
5 usuarios, 2 semestres (2026B activo), 18 grupos, 2032 plantillas, 10 iniciativas, 33 entregables (20/9/4), 33 evidencias, 57 eventos; **34 migraciones** (la última, `fase27`); 19 tablas; `docente_grupo_matriz` no existe; 0 funciones nuevas; 0 residuos. `proysocial_test`: 35 migraciones, aislada, sin fixtures ni filas del historial.

## 8. Riesgos y conflictos detectados
**Conflictos de datos en `proysocial_dev`: ninguno.**

| Riesgo | Mitigación |
|---|---|
| **Deriva en la Fase A:** como los endpoints aún no escriben la tabla, cualquier reasignación hecha en desarrollo después de aplicarla deja la tabla desfasada (demostrado en la prueba 14) | Aplicar la Fase A en una base solo cuando se vaya a seguir con la B, o **revertir y reaplicar** (reconstruye desde `usuarios`; probado); `scripts/historial-docente-grupo-deriva.js` la detecta. Además, un grupo con una fila desfasada no se podría eliminar (FK) hasta resincronizar |
| `DELETE` de un docente sin historia arrastra sus filas (CASCADE) | Es el comportamiento actual; se endurece en la Fase B |
| Eliminar un grupo cuyo docente se reasignó (fila desfasada) falla con `23503` no mapeado | Solo ocurre con deriva (arriba) |
| La migración se ejecuta sola en producción al integrar en `main` (AL-05) | No integrarla sin copia verificada y sin correr la vista previa en producción (solo lectura) |
| Versión de PostgreSQL y privilegios de Cloud SQL desconocidos | Sin extensiones; solo `jsonb`, índices parciales y por expresión, `tstzrange` (PostgreSQL ≥ 9.5) |
| Los conflictos no resueltos quedan como incidencias `pendiente` mientras la asignación vigente existe | La Fase C debe tratar un semestre con incidencia pendiente como **ambiguo**, no como resuelto |
| Docentes reasignados antes sin evidencia, y el semestre 2026A | No reconstruibles; se informan (`sin_evidencia`), nunca se infieren |
| La clave de bloqueo 7310028 | Distinta de las existentes (7310002, 74010023) |

## 9. Procedimiento para aplicar la Fase A en desarrollo (NO ejecutado)
**Requiere tu autorización.** Pasos, con comprobaciones previas:
1. **Antes:** (a) detener el backend de desarrollo o confirmar que nadie reasigna docentes durante la ventana; (b) `node --env-file=.env.dev scripts/historial-docente-grupo-preview.js` y confirmar que coincide con la §5 (3 filas, 0 conflictos); (c) `node --env-file=.env.dev scripts/historial-docente-grupo-deriva.js` (debe decir que la fase28 no está aplicada); (d) línea base: 5/2/18/2032/10/33/33/57, 34 migraciones.
2. **Respaldo** (probado sobre `proysocial_test`; el archivo se genera y lista las tablas): `"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -p <puerto> -U postgres -Fc -f respaldo_proysocial_dev_antes_fase28.dump proysocial_dev` (con `PGPASSWORD` en el entorno) y `pg_restore -l` para verificarlo.
3. **Aplicar:** `cd backend` y `node --env-file=.env.dev scripts/migrate.js` (solo ejecuta `fase28`; atómica).
4. **Verificar:** 35 filas en `schema_migrations`; 3 filas en `docente_grupo_matriz` (las de la §5) y 1 incidencia `sin_evidencia` (Laura); `historial-docente-grupo-deriva.js` → 0 deriva; línea base de datos intacta; la aplicación y el frontend funcionan igual (E2E de regresión).
5. **Recuperación:** (a) bloque «REVERSIÓN» de la migración (o `DROP` de las dos tablas y tres funciones + borrar la fila de `schema_migrations`), que no toca `usuarios.grupo_matriz_id`; (b) si algo más fallara, `pg_restore --clean --if-exists -d proysocial_dev respaldo_proysocial_dev_antes_fase28.dump` (el archivo se prueba con `-l` antes).
6. **Después:** continuar con la Fase B antes de permitir reasignaciones (o vigilar la deriva).

## 10. Plan de la Fase B: doble escritura (no implementado)
**Objetivo:** que **toda** escritura de la asignación pase por un servicio único que mantiene la tabla y el espejo en la misma transacción, sin cambiar lecturas ni métricas.

1. **Servicio `asignacionDocenteService.cambiarGrupo(client, { docenteId, grupoId|null, actorId, motivo, origen })`:** `SELECT … FOR UPDATE` del docente (mismo orden de bloqueos de `historicosService`); valida grupo activo y del mismo tipo (reglas actuales); aplica la **decisión 1** (los triggers ya la garantizan: el servicio la anticipa con el mismo mensaje `HISTORICO_PROTEGIDO` y relaja `exigirAsignacionSinHistorico` solo para cambios hacia otro semestre); cierra la vigente (`hasta = now()`, `cerrado_por`, motivo) y abre la nueva (`desde = now()`, `creado_por`, origen), y actualiza `usuarios.grupo_matriz_id`. Quitar el grupo = solo cierre. Mapea `23505`, `23P01`, `23514`, `23503`/`23001` a 409.
2. **Rutas a reconducir (5):** `PUT /admin/usuarios/:id`, `POST /admin/usuarios`, `PUT /admin/docentes/:id/grupo-matriz`, `PUT /admin/proyectos/:id/docentes` (asigna si estaba vacío) y la importación (`matrixImportDb`, `origen = importacion`). El importador mantiene su comportamiento; solo cambia **cómo** escribe.
3. **Sin cambios de lectura:** `SQL_MATRIZ`, métricas y pantallas siguen usando `usuarios.grupo_matriz_id` (Fase C).
4. **Resincronización:** script idempotente que reconstruye las filas vigentes desde `usuarios` (cierra las desfasadas con motivo «resincronización») para llevar una base de A a B sin perder lo ya registrado.
5. **Preguntas para decidir antes de la Fase B:**
   - **B1.** Asignar a un grupo de un semestre que **aún no empieza**: hoy mueve al docente de inmediato. ¿Se rechaza (coherente con tu regla provisional y 8-A), se permite solo si ese semestre es el **activo** (el cambio de periodo ya se está haciendo), o se mantiene?
   - **B2.** ¿Qué se hace con incidencias `pendiente` al asignar (solo informarlas)?
   - **B3.** Motivo obligatorio en cada cambio (recomendado) u opcional.
6. **Pruebas:** asignación inicial por cada una de las 5 rutas (tabla y espejo coherentes, deriva 0); cambio entre semestres; dentro del semestre sin y con reportes; solo una vigente bajo concurrencia real (dos `PUT` simultáneos por HTTP, un 409 limpio, sin 500 ni interbloqueo); importación con reasignación; semestre futuro (B1); eliminación de docente/grupo con historial (409, `23001`/`23503`); regresión completa (integración y **todos los E2E**) y compatibilidad de contratos.
7. **Reversión:** volver al código anterior y resincronizar (el espejo siempre es válido); la tabla se conserva.
8. **Esfuerzo:** ≈ 3 días-persona (servicio y 5 rutas 1,5; pruebas 1; E2E y documentación 0,5).

## 11. Archivos de este bloque
Nuevos: `backend/migrations/fase28_docente_grupo_matriz.sql`, `backend/test/integration/historial-asignaciones.integration.test.js`, `backend/scripts/historial-docente-grupo-deriva.js`, este documento. Modificados: `backend/scripts/migrate.js` (registro de la migración), `backend/package.json` (la suite nueva en `test:integration:protegidos`), `backend/scripts/historial-docente-grupo-preview.js` (reglas alineadas con la función SQL; ahora lista origen, certeza y vigencia por fila). Sin cambios en el frontend, en autenticación ni en el diseño B2; las fórmulas del Bloque 2 y las protecciones de los Bloques 1 a 1.2 no se tocaron.

## 12. Siguiente paso
Detenido antes de modificar `proysocial_dev`. Necesito: (1) tu autorización para aplicar la Fase A en desarrollo con el procedimiento de la §9 (o que se espere a tener también la Fase B); (2) tus respuestas B1–B3 y la autorización de la Fase B.
