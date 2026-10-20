# ProySocial — Cierre funcional y preparación para piloto

**Respuesta concreta: NO, todavía no está lista para que docentes y coordinadores reales comiencen a probarla — pero ya no por defectos del software, sino por cinco requisitos externos que solo tú puedes resolver (§9).** El recorrido completo docente → administrador → docente (borrador, envío, revisión, correcciones, reenvío, aprobación, indicadores, historial) funciona de principio a fin sobre la aplicación real y PostgreSQL, por API y por interfaz en Chrome, en una base aislada. En esta etapa aparecieron y se corrigieron **tres defectos reales** (uno de ellos habría roto el piloto en GCP); las correcciones están en tu árbol de trabajo, sin commitear.

Alcance de lo verificado, dicho con claridad: **sin Google real** (el inicio de sesión de Google no se puede automatizar; se probó con sesiones firmadas con el mismo mecanismo y se auditó el código del login), **sin GCP**, **sin archivos Excel reales de la institución** (solo `.xlsx` sintéticos), **sin correo real** y **solo en Chrome**. Las suites E2E contra `proysocial_dev` **no se ejecutaron en esta etapa** (§7).

## 1. Matriz de módulos

| Módulo | Funciona | Pruebas | Problemas | Estado para piloto |
|---|---|---|---|---|
| Inicio de sesión (Google) | Código auditado: verifica el ID token con la audiencia del cliente, exige correo verificado, restringe por dominio si se configura, no crea usuarios, rechaza inactivos y cuentas sin registrar | Auditoría de código; sesiones firmadas en integración e interfaz (válida, vencida, firma alterada, audiencia distinta, sin sesión, inactiva) | **No probado con Google real** (requiere credenciales del cliente OAuth); `GOOGLE_DOMAIN` es opcional y, vacío, no restringe el dominio | **BLOQUEADO** hasta configurar OAuth (externo, §9) |
| Sesión y cierre de sesión | Token con rol y estado revalidados en cada petición; inactivar revoca al instante; ahora la sesión revocada devuelve al inicio de sesión | `piloto-recorrido` 4, `piloto-ui` (docente inactivo, token alterado, revocada durante el uso) | Corregido: antes quedaba la pantalla con llamadas fallando; el cierre de sesión del servidor no revoca tokens (solo borra el local; aceptable en piloto) | LISTO |
| Permisos y aislamiento entre docentes | 17 rutas de docente rechazan a otro docente con 403 sin escribir; todas las rutas `/admin` exigen administrador | `piloto-recorrido` 5 (barrido de 18 rutas admin: 200 / 403 / 401) | Ninguno | LISTO |
| Enlaces directos y recarga (SPA en un solo contenedor) | Recargar o abrir un enlace a `/docente/…` o `/admin/…` carga la aplicación | `piloto-recorrido` 8; `piloto-ui` | **Defecto real corregido** (§5): devolvía `{"error":"Debes iniciar sesión"}` | LISTO (requiere desplegar la corrección) |
| Docente · Inicio | Dashboard, semestre y grupo, indicadores | `piloto-ui`; `piloto-recorrido` 1, 3 | Ninguno | LISTO |
| Docente · Mi matriz | Lista sus entregables importados; sin matriz → aviso claro sin datos inventados | `piloto-recorrido` 0, 3; `piloto-ui` | Ninguno | LISTO |
| Docente · Evidencias y reporte | Borrador, validación de enlaces, envío, observación visible, corrección, reenvío, versiones conservadas, aprobado protegido | `piloto-recorrido` 1–2; `piloto-ui` (clics reales + verificación en BD) | Ninguno | LISTO |
| Docente · Iniciativas, Historial, Perfil, Notificaciones | Cargan sin errores; historial refleja los eventos | `piloto-ui` (8 rutas); `piloto-recorrido` | El detalle de iniciativa muestra «no encontrada» si la API falla con 5xx (menor) | LISTO CON OBSERVACIONES |
| Admin · Dashboard y seguimiento | Indicadores por semestre coinciden con consultas independientes a PostgreSQL | `piloto-recorrido` 7; `metricas-semestre` (Bloque 2) | Ninguno | LISTO |
| Admin · Revisión | Bandeja, evidencias, correcciones (comentario obligatorio), aprobar con confirmación, «sin acceso», historial | `piloto-ui`; `piloto-recorrido` 1–2; `evidencias` | Ninguno | LISTO |
| Admin · Importador Excel | Analizar → validar → confirmar guarda grupo y plantillas; llega al docente | `piloto-recorrido` 0; `importacion`; `asignacion-docente-servicio` 13 | Probado solo con `.xlsx` sintético; la suite E2E del importador está **pospuesta** (§7) | LISTO CON OBSERVACIONES |
| Admin · Usuarios | Crear, editar, inactivar, correo repetido (409), no eliminar con historial | `piloto-recorrido` 6; `historicos` | Ninguno | LISTO |
| Admin · Semestres, escuelas y programas | Se guardan y validan; el semestre anterior no se mezcla con el activo | `piloto-recorrido` 6–7; `historicos11/12` | Ninguno | LISTO |
| Admin · Grupos («Tareas semanales») y asignación de docentes | Asignar y quitar docentes con motivo, historial y espejo sincronizados | `piloto-ui` (clic real: asignar, quitar), `asignacion-docente-servicio` | **Defecto real corregido** (§5): los botones fallaban por falta de motivo | LISTO (requiere A+B, §6) |
| Admin · Plantillas | Asignar grupo a un docente con motivo | `tsc`; contrato de API probado | Corregido igual que el anterior; **no se recorrió con clics** | LISTO CON OBSERVACIONES |
| Admin · Iniciativas | Listado y docentes de la iniciativa | `piloto-recorrido` 6 | Ninguno | LISTO |
| Admin · Indicadores y reportes | Cargan y coinciden con la API; filtros por semestre aíslan grupos | `piloto-recorrido` 7; `piloto-ui` (rutas) | Las suites E2E de indicadores no se re-ejecutaron en esta etapa | LISTO CON OBSERVACIONES |
| Históricos (protecciones) | Bloques 1, 1.1, 1.2 intactos | `historicos`, `historicos11`, `historicos12` (en verde) | Ninguno | LISTO |
| Historial docente–grupo (A+B) | Servicio único, B1/B2/B3, concurrencia, esquema pendiente | 31 pruebas de integración propias | Requiere aplicar la migración 28 (§6) | LISTO en `proysocial_test`; **pendiente de autorización** en desarrollo |
| Ambiente de pruebas en GCP | Flujo de despliegue existente | Revisión de configuración | No hay ambiente de piloto separado ni credenciales (§8) | **BLOQUEADO** (externo) |

## 2. Funcionalidades verificadas — administrador
Revisión completa (bandeja, abrir evidencias, correcciones con comentario obligatorio, aprobar con confirmación, «sin acceso», historial); importador (analizar, validar, confirmar, plantillas guardadas, asignación de docente); usuarios (alta, edición, inactivación, duplicados, eliminación protegida); semestres (listado, activo y anterior sin mezcla); escuelas y programas (alta, restricción de borrado, baja); grupos (asignar y quitar docentes desde la pantalla, con motivo); navegación de las 8 rutas administrativas y de las 6 pestañas de «Sistema» sin errores visibles ni excepciones de JavaScript; indicadores del semestre coherentes con PostgreSQL.

## 3. Funcionalidades verificadas — docente
Inicio, semestre y grupo en la barra de contexto, Mi matriz, detalle de entregable con instrucciones, validaciones locales (enviar sin enlace, enlace inválido), borrador, envío, estado «En revisión» sin editor, observación visible, corrección y reenvío, versión anterior conservada, aprobado sin editor, Historial, iniciativas, perfil y notificaciones (carga), docente sin matriz (aviso claro), docente inactivo (sesión rechazada), acceso indebido a datos de otro docente (403 en 17 rutas).

## 4. Recorrido completo de entrega y aprobación (15 pasos)
Ejecutado **dos veces con la aplicación real**: por **API** (`piloto-recorrido` 1, con PostgreSQL en `proysocial_test`) y por **interfaz en Chrome real** (`piloto-ui`, backend propio que sirve el frontend compilado en el mismo origen). Resultado: los 15 pasos (inicio de sesión, semestre y grupo, matriz, pendiente, instrucciones, enlaces, borrador, envío, revisión del administrador, solicitud de correcciones, observación visible al docente, corrección y reenvío, aprobación, el docente ve la aprobación, indicadores e historial reflejan los cambios) funcionan; cada paso de la interfaz se contrasta con la fila real en PostgreSQL (`estado_revision`, `num_envios`, versiones de evidencia) y el historial queda `envio → observacion → reenvio → aprobacion`. El indicador del semestre sube en 1 reporte tras el envío y coincide con una consulta independiente.

## 5. Fallos reales encontrados y corregidos
| # | Fallo (con evidencia) | Gravedad | Corrección | Verificación |
|---|---|---|---|---|
| 1 | **Asignar o quitar un docente desde «Tareas semanales» (grupos) y desde «Plantillas» fallaba siempre** con «Indica el motivo…»: esas pantallas no enviaban el `motivo` que la Fase B hizo obligatorio. Lo introduje yo en la Fase B (revisé `UserManagement` e `ImportarMatriz`, no estas dos pantallas); lo detectó la auditoría de integración y lo confirmé en el código | Bloqueaba el piloto | `GroupManagement.tsx`: campo «Motivo de la asignación» (obligatorio, mínimo 5) en el diálogo de asignar; al quitar se envía un motivo descriptivo («Retiro del grupo confirmado desde la gestión de grupos»). `PlantillaManagement.tsx`: campo de motivo junto al botón. Sin cambios de diseño ni de API | `piloto-ui`: asignar (botón bloqueado sin motivo; BD con historial, espejo y motivo) y quitar (historial conservado, 2 eventos); `tsc` |
| 2 | **Recargar la página o abrir un enlace directo a `/docente/…` o `/admin/…` devolvía `{"error":"Debes iniciar sesión"}` en el despliegue de un solo contenedor** (la API comparte prefijo con las rutas de la SPA y se montaba antes de servir la aplicación). En desarrollo no se ve porque el frontend y la API están en puertos distintos. Reproducido en Chrome: la pantalla mostraba el JSON. Afectaba marcadores, enlaces de notificación (`?reporte=`, `?entregable=`) y la tecla F5 en Cloud Run | **Bloqueaba el piloto en GCP** | `backend/src/index.js`: una petición GET con `Accept: text/html` a `/docente…` o `/admin…` recibe `index.html` antes de llegar a la API; las llamadas `fetch` (sin `text/html`) siguen exigiendo sesión | `piloto-recorrido` 8 (8 rutas devuelven la SPA; las llamadas a la API siguen en 401/403/200); `piloto-ui` completo |
| 3 | Con la sesión revocada o vencida **a mitad de uso**, la aplicación borraba el token pero dejaba la pantalla con llamadas fallando en silencio hasta recargar | Media (sesión de 8 h) | `src/app/config/api.ts`: tras un 401 con token se vuelve al inicio de sesión | `piloto-ui`: inactivar la cuenta con la sesión abierta y navegar → vuelve a `/` |

**Observación sobre el tiempo de ejecución del servidor de desarrollo:** el backend que hay en marcha en tu máquina (puerto 4000, proceso iniciado antes de estos cambios) y Vite siguen siendo **tus** procesos; no los toqué. Para ver la corrección 2 en un despliegue hay que reiniciar/volver a desplegar el backend.

**Menores detectados, no corregidos (no bloquean):** el detalle de iniciativa muestra «no encontrada» si la API responde 5xx (`ProjectDetail.tsx:47`); cargas secundarias con `.catch(() => {})` que dejan selectores vacíos sin aviso (`ImportarMatriz.tsx:192,196`, `ReportReview.tsx:150`); el `fetch` de cierre de sesión no envía el token (efecto solo cosmético); `PATCH …/fecha-entrega` es un stub sin llamadores; las variantes `*Tinta.tsx` son código sin usar.

## 6. Historial docente–grupo (A+B): decisión operativa
**¿Se puede activar A+B de forma segura en desarrollo? Sí.** Verificado: respaldo y recuperación documentados; compatibilidad (la migración es aditiva e idempotente, el backend nuevo contra una base de 34 migraciones **falla de forma explícita** —503 `ESQUEMA_ASIGNACIONES_PENDIENTE—, sin escrituras silenciosas ni a medias, y empieza a operar sin reiniciar al aplicar la migración); compuerta `PROYSOCIAL_APLICAR_FASE28=1`; prevención de escrituras con código antiguo (se detiene el backend entre migrar y arrancar); historial y espejo sincronizados (0 deriva en todas las suites); backfill idempotente y conservador; reconciliación técnica; concurrencia con el grupo y entre administradores sin interbloqueos. `proysocial_dev` tiene hoy 5 usuarios sintéticos y 34 migraciones, sin tablas nuevas; `proysocial_test` tiene 35 y se usa para todo lo que requiere la migración (esta etapa incluida).

### ÚNICO PUNTO DE DECISIÓN — autorizar A+B en `proysocial_dev`
**Qué autorizas:** ejecutar en `proysocial_dev` el procedimiento de la §9 de `docs/BACKEND_BLOQUE3B_FASE_B.md` (13 pasos: verificar rama y migraciones, respaldo `pg_dump` y verificación, detener tu backend de desarrollo, línea base de solo lectura, `PROYSOCIAL_APLICAR_FASE28=1 npm run migrate`, arrancar el backend nuevo, verificar deriva/historial/incidencias, pruebas funcionales de asignación y reanudar).
**Riesgos:** (a) **no es atómico entre código y base**: se acota deteniendo el backend; (b) tu backend de desarrollo actual corre código anterior: hay que detenerlo antes y reiniciarlo con el código nuevo; (c) las E2E `administracion.mjs`, `historicos.mjs` e `importador.mjs` quedarán incompatibles con la base de desarrollo hasta la etapa de pruebas SQL (ya pospuestas por decisión tuya); (d) el backfill sobre los 5 usuarios sintéticos puede generar incidencias informativas (`sin_evidencia`) que no se resuelven solas.
**Plan de recuperación:** el bloque «REVERSIÓN» de la migración (válido mientras no haya cambios registrados; no toca `usuarios.grupo_matriz_id`) o, con cambios ya registrados, exportar las tres tablas y restaurar desde el respaldo del paso 3 en una base nueva. **No se ejecutó nada de esto.** Sin tu «sí» explícito, desarrollo sigue como está.
**Para el piloto:** la migración 28 también debe aplicarse en la base del piloto, con el orden «código primero y migración después» (§9.2 del documento anterior).

## 7. Pruebas ejecutadas
Todas las pruebas con escritura, **solo en `proysocial_test`**, en serie.
| Prueba | Resultado |
|---|---|
| Integración completa (`test:db:setup -- --reset`, `--test-concurrency=1`) | **174 pruebas: 171 correctas, 0 fallidas, 3 omitidas** (`devlogin`: exigen `proysocial_dev` por diseño) |
| Nueva `piloto-recorrido` (9): importación por API, recorrido de 15 pasos, docente observado y «sin acceso», docente sin matriz, inactivo y sesiones (vencida, alterada, audiencia), acceso indebido (17 rutas de docente y 18 de administración), administración operativa, consistencia de indicadores, enlaces directos | 9/9 |
| Nueva E2E `e2e/suites/piloto-ui.mjs` (Chrome real, base aislada, 59 comprobaciones): recorrido de interfaz, asignar/quitar desde grupos, 8 rutas admin + 6 pestañas + 8 rutas docente sin errores ni excepciones, permisos, sesión revocada | **59 OK · 0 FALLA**; BD limpia al terminar |
| Fase B (31): servicio de asignaciones, concurrencia con el grupo, esquema pendiente | 31/31 |
| Unitarias / `tsc` / build | 61/61 / sin errores / correcto |
| Estado final | `proysocial_test`: 0 fixtures, 0 duplicados, 0 vigentes dobles; `proysocial_dev`: 34 migraciones, 5 usuarios, intacto |

**No ejecutado (y por tanto NO aprobado en esta etapa):** las E2E de `proysocial_dev` —`administracion.mjs`, `historicos.mjs` e `importador.mjs` están **pospuestas por tu decisión** (escrituras SQL incompatibles con el historial; no se tocaron ni se forzaron)—; el resto (`regresion-shell`, `matrices`, `revision`, `indicadores`, `responsive-docente`…) no se re-ejecutó porque el backend de desarrollo en marcha es anterior a estos cambios y no quise reemplazar tus procesos. Sus últimos resultados en verde son de bloques anteriores. Sustituyen su cobertura esencial las pruebas independientes de arriba.

## 8. Requisitos para el ambiente de pruebas en GCP (revisión sin desplegar nada)
Estado actual (revisado en `Dockerfile`, `.github/workflows/deploy-cloud-run.yml`, `backend/src/index.js`, `db.js`, `docs/PRODUCCION.md`): un contenedor sirve frontend y API en el mismo origen; `/health` comprueba la base; apagado ordenado; el acceso de desarrollo queda desactivado por **ocho** condiciones independientes (producción, nombre de base, Cloud Run, etc.); CORS cerrado salvo `ALLOWED_ORIGIN`; migraciones por Cloud Run Job antes del despliegue; primer administrador por job opcional.

**OBLIGATORIOS PARA EL PILOTO**
1. **Aislamiento de producción.** Hoy el workflow se dispara con *push* a `main` y usa un grupo de concurrencia `proysocial-production`. El piloto necesita su propio servicio, **su propia base**, sus secretos y variables de GitHub (otro `DB_NAME`, `CLOUD_SQL_INSTANCE` si aplica, nombres de secretos) y un disparo manual (`workflow_dispatch`) o un flujo aparte. **Si reutiliza las variables de producción, el piloto escribiría en la base de producción.** No nombrar la base `proysocial_dev`.
2. **Cliente OAuth de Google propio del piloto**, con la URL del servicio de piloto como origen autorizado de JavaScript (solo se conoce tras el primer despliegue), y una compilación del frontend con `VITE_GOOGLE_CLIENT_ID` del piloto (se inyecta al compilar: la imagen de producción no sirve).
3. **Secretos propios del piloto:** `JWT_SECRET` (≥ 32 caracteres), contraseña de base de datos.
4. **Valores institucionales** (no inventar): `GOOGLE_DOMAIN` (dominio permitido; **fijarlo explícitamente**: vacío acepta cualquier cuenta de Google que esté registrada), `ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_APELLIDO` del primer administrador.
5. **Decisión sobre el correo:** el paso «Configure notification email» **hace fallar el despliegue** si falta cualquier variable SMTP. O se proporcionan las credenciales institucionales, o el paso se hace opcional y se despliega con `EMAIL_ENABLED=false` (la aplicación lo soporta; las notificaciones quedan solo dentro de la plataforma).
6. **Aplicar la migración 28 en la base del piloto** (`PROYSOCIAL_APLICAR_FASE28=1`), después de desplegar el código nuevo (§9.2 de la Fase B); sin ella las asignaciones responden 503.
7. **Datos iniciales del piloto** (manual, `docs/PRODUCCION.md`): semestre activo con calendario, escuelas y programas, usuarios **pre-registrados con el correo exacto de su cuenta de Google** (no se crean al iniciar sesión), y grupos/plantillas (importando las matrices).
8. **Copias de seguridad de Cloud SQL activadas** (y recuperación a un punto en el tiempo si está disponible): se confirma en la consola, no en el repositorio.
9. **Presupuesto de conexiones:** el servicio admite 10 instancias con un pool de 10 conexiones cada una; en una instancia pequeña de Cloud SQL conviene limitar instancias máximas (2–3) o `PGPOOL_MAX`.
10. **Desplegar las correcciones de esta etapa** (§5, sobre todo la 2).

**POSTERIORES AL PILOTO (producción)**: límite de peticiones en `/auth/google` y `trust proxy`; HSTS y Content-Security-Policy; registros estructurados en JSON; alertas y comprobaciones de disponibilidad; instancias mínimas > 0 y CPU siempre asignada si hay correo con trabajador en segundo plano; cuentas de servicio separadas y *Workload Identity Federation* en lugar de la clave de servicio; tiempo máximo en el apagado; política documentada de la compuerta de migraciones en CI; revocación real de tokens al cerrar sesión.

## 9. Requisitos pendientes de autenticación y respuesta final
**Pendientes de autenticación (todos externos; no se inventó ninguna configuración):** cliente OAuth de Google del piloto + origen autorizado (§8-2); `GOOGLE_DOMAIN` institucional (§8-4); secreto de sesión (§8-3); primer administrador (§8-4); lista de usuarios de prueba con sus correos reales de Google (§8-7). Lo que **ya** está listo: acceso de desarrollo imposible en un entorno público, roles, sesiones de 8 h revalidadas por petición, inactivos rechazados, aislamiento entre docentes, rutas administrativas protegidas, sesión expirada manejada.

**Orden mínimo para pasar de NO a SÍ (sin abrir otro bloque técnico):**
1. Commit de las correcciones de esta etapa y de la Fase B (tuyo).
2. Decidir A+B en desarrollo (único punto de decisión, §6) — no bloquea el piloto, solo tu ambiente de desarrollo.
3. Crear el ambiente separado del piloto (§8-1) con su base y secretos; decidir el correo (§8-5).
4. Crear el cliente OAuth del piloto y fijar `GOOGLE_DOMAIN` (§8-2, §8-4); desplegar; añadir la URL como origen autorizado; recompilar si hace falta.
5. Aplicar la migración 28 en la base del piloto (§8-6) y cargar los datos iniciales con datos sintéticos (§8-7).
6. Activar las copias de seguridad (§8-8).
7. Ensayo con **una cuenta de administrador y una de docente reales** del equipo antes de abrirlo: repetir el recorrido de 15 pasos con Google real (es lo único que no se pudo verificar aquí).

Cuando 1, 3, 4, 5, 6 y 7 estén hechos, la respuesta pasa a **SÍ**: docentes y coordinadores con cuentas individuales sobre datos sintéticos, en un ambiente aislado.
