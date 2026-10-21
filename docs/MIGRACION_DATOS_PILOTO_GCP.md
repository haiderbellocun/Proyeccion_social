# ProySocial · Migración de datos sintéticos a Cloud SQL (piloto)

Fecha: 2026-10-20 · Origen `proysocial_dev` (solo lectura) → destino `proysocial_piloto` (proyecto `it-fab-contenido-edu-3`, instancia `proysocial-piloto-sql`, us-east1, PostgreSQL 18.6, vía proxy `127.0.0.1:55432`, usuario `proysocial_migrator`).
Herramienta: `backend/scripts/piloto-datos-dev.mjs` (modos `exportar`, `importar`, `verificar`). Sin contraseñas en archivos, argumentos ni logs.

## 1. Inventario del origen

`proysocial_dev` (PostgreSQL 18.1, 34 migraciones). 19 tablas, 31 claves foráneas:

| Tabla | Filas | | Tabla | Filas |
|---|---|---|---|---|
| usuarios | 5 | | plantilla_entregables | 2032 |
| semestres | 2 (2026A inactivo, **2026B activo**) | | proyecto_entregables | 33 |
| grupos_matriz | 18 (1–15 de las migraciones; 16–18 de desarrollo 2026B) | | entregable_evidencias | 33 |
| programas | 1 | | entregable_eventos | 57 |
| proyectos | 10 | | actualizaciones_masivas_entregables | 18 |
| proyecto_semanas | 160 | | notificacion_correos | 534 (todas `pendiente`; **no se copian**) |
| proyecto_docentes, excepciones, escuelas, importaciones, notificaciones, lecturas | 0 | | schema_migrations | 34 (no se copia) |

Revisión de datos personales: todo es sintético. Usuarios `@proysocial.local`; programa «DEV Ingeniería de Sistemas»; proyectos «DEV …»; evidencias `https://drive.google.com/file/d/DEV-EJEMPLO/view`. `google_sub` nulo en los 5 usuarios (y se anula de todos modos). No hay tokens, sesiones ni contraseñas en el esquema. No se detectaron datos reales → no hubo que detenerse.

No se copiaron: la cola `notificacion_correos` (534 correos pendientes), `schema_migrations`, secretos.

## 2. Respaldos

| Qué | Identificador / ubicación | Estado |
|---|---|---|
| Destino, antes de las escrituras | Cloud SQL backup `1792519995611` (2026-10-20 18:13 UTC) | SUCCESSFUL |
| Destino, previos | `1792518564550` (antes de las migraciones), `1792515708297` | SUCCESSFUL |
| Origen | `pg_dump -Fc` de `proysocial_dev`, fuera del repositorio (carpeta temporal de la sesión) | OK |

## 3. Comparación de esquemas y estrategia

No se restauró ningún esquema local sobre Cloud SQL y no se tocaron las migraciones (35 registradas antes y después). Diferencias entre origen y destino: el destino tiene además las 3 tablas del historial (fase28), que el origen no tiene. Las migraciones ya siembran en el destino: semestre 2026A (activo), grupos 1–15, 1668 plantillas.

Procedimiento (INSERT selectivo con identificadores preservados, **triggers y restricciones activos**, una sola transacción):
1. Orden por claves foráneas: escuelas, programas, semestres, grupos, plantillas, usuarios, proyectos, proyecto_docentes, semanas, entregables, actualizaciones masivas, eventos, evidencias, excepciones, importaciones, notificaciones, lecturas.
2. Tablas sembradas por las migraciones (semestres, grupos, plantillas, programas, escuelas): se **comparan** por identificador; si el contenido difiere, la importación aborta; solo se insertan las filas que faltan (no se duplica 2026A). Resultado: 0 conflictos (las 15 grupos y 1668 plantillas eran idénticos).
3. `google_sub` anulado; `notificacion_correos` no se copia.
4. Semestre activo = el del origen (2026B); 2026A pasa a inactivo (índice único `uq_semestres_un_activo`).
5. Secuencias ajustadas al máximo identificador de cada tabla.
6. Los triggers de correo generaron 33 correos al insertar reportes; se **cancelaron** en la misma transacción (`estado='cancelado'`, con motivo). Sin SMTP activo y nada se envía.
7. Historial docente–grupo: se llamó `docente_grupo_matriz_backfill()` solo tras comprobar sus precondiciones (historial y cambios vacíos, usuarios cargados): su carga inicial usa únicamente el grupo vigente y la evidencia de reportes/excepciones, sin inventar fechas ni asignaciones por semestre/nombre.

## 4. Ensayo local (base desechable `proysocial_piloto_ensayo`, PostgreSQL 18.1, 35 migraciones)

Importación completa y verificación: **OK**. También: segunda importación rechazada (carga inicial); `historial-docente-grupo-deriva.js` = 0 deriva; el Seguimiento operativo calculado sobre el ensayo coincide cifra a cifra con el de `proysocial_dev` (solo cambia el orden de las filas de docentes, que no tiene `ORDER BY` en origen). La base de ensayo se eliminó; `proysocial_dev` quedó intacto (34 migraciones, 534 correos, sin tablas de historial).

Hallazgo corregido durante la ejecución real: la **huella de comparación** dependía de la zona horaria de la sesión (local vs Cloud SQL), por lo que la primera verificación en Cloud SQL marcó «contenido distinto» en 5 tablas con instantes idénticos. Se fijó `SET TIME ZONE 'UTC'` en la herramienta, se re-exportó y se reverificó en el ensayo y en Cloud SQL (OK). Los datos importados no cambiaron.

## 5–6. Datos migrados y conteos (origen = destino)

| Tabla | Origen | Destino | Insertadas / ya existían |
|---|---|---|---|
| usuarios | 5 | 5 | 5 / 0 |
| semestres | 2 | 2 | 1 (2026B) / 1 (2026A) |
| grupos_matriz | 18 | 18 | 3 / 15 |
| plantilla_entregables | 2032 | 2032 | 364 / 1668 |
| programas | 1 | 1 | 1 / 0 |
| proyectos | 10 | 10 | 10 |
| proyecto_semanas | 160 | 160 | 160 |
| proyecto_entregables (reportes) | 33 | 33 | 33 |
| entregable_evidencias | 33 | 33 | 33 |
| entregable_eventos | 57 | 57 | 57 |
| actualizaciones_masivas_entregables | 18 | 18 | 18 |
| tablas vacías en origen | 0 | 0 | — |

Estados de entregables (destino, igual al origen): aprobado 20, enviado 9, observado 4. Semestre activo: 2026B (igual al origen). Huella por tabla (contenido completo, sin `creado_en` en tablas sembradas) idéntica entre origen y destino para las 17 tablas. Migraciones registradas en Cloud SQL: **35**.

## 7. Historial docente–grupo

- Asignaciones vigentes: 3 (docentes 2, 3 y 4 → grupos 16, 17 y 18, todos 2026B), origen `vigente_al_migrar`, certeza `alta`, fechas desconocidas (NULL; no se inventaron).
- Coincidencia con `usuarios.grupo_matriz_id`: **0 deriva**, 0 docentes con más de una vigente, 0 duplicados, 0 cambios registrados.
- Incidencias: 1 `sin_evidencia` pendiente (docente 5, Laura Gómez, sin grupo ni reportes; informativa). Sin conflictos de dos grupos en un semestre.
- No hay historial pasado reconstruible (los reportes están todos en el grupo vigente del docente).

## 8. Integridad

43 claves foráneas, todas validadas (2 CHECK `NOT VALID` de fase16 en `programas`, por diseño); sin huérfanos (las FK se aplicaron en la inserción, sin desactivar triggers ni restricciones); secuencias ≥ máximo de cada tabla; sin duplicados; cola de correos: solo 33 `cancelado`.

## 9. `proysocial_app` (conexión real, vía proxy)

Sesión como `proysocial_app` en `proysocial_piloto`, PostgreSQL 18.6, sin superusuario ni `cloudsqlsuperuser`: SELECT OK; lectura de secuencia y permiso USAGE OK; UPDATE, INSERT y DELETE permitidos (en transacción con ROLLBACK, sin residuos); CREATE TABLE, ALTER TABLE, DROP, `schema_migrations` y DELETE del historial inmutable **bloqueados**; el servicio `consultarSeguimiento` funcionó con ese rol (3 docentes). El backend no usa `proysocial_migrator`.

## 10. Acceso de los usuarios (procedimiento posterior, NO ejecutado)

Las cuentas `@proysocial.local` son sintéticas y no inician sesión con Google. Para vincular correos reales sin perder relaciones:
1. Por cada docente, un administrador de ProySocial decide el correo institucional autorizado.
2. `UPDATE usuarios SET correo = '<correo real>' WHERE id = <id>` (conserva `id`, grupo, reportes, evidencias, historial; `google_sub` se completa al primer ingreso). Hacerlo con `proysocial_migrator` y registro del cambio.
3. Para el primer administrador real, usar `backend/scripts/bootstrap-admin.js` (no se asigna admin a correos desconocidos).
4. `DEV_LOGIN_ENABLED` no debe estar activo en GCP; no se activó SMTP.

## 11. Observaciones y riesgos pendientes

- El semestre activo del piloto es ahora **2026B** (el de desarrollo); 2026A quedó inactivo. Si el piloto debía iniciar en otro, se cambia desde la aplicación o con `UPDATE` explícito.
- 33 correos generados por los triggers durante la importación quedaron `cancelado`; el procesador de correos no debe activarse sin revisar la cola.
- El orden de docentes en el Seguimiento operativo no tiene `ORDER BY` determinista en la consulta de origen (solo estético).
- Las evidencias apuntan a `DEV-EJEMPLO` (enlaces ficticios).
- El respaldo de `proysocial_dev` y el JSON exportado están fuera del repositorio; eliminarlos al terminar el piloto.
- Archivos nuevos sin commit: `backend/scripts/piloto-datos-dev.mjs`, este documento.

**DATOS SINTÉTICOS MIGRADOS A CLOUD SQL — LISTOS PARA DESPLIEGUE DE LA APLICACIÓN.**
