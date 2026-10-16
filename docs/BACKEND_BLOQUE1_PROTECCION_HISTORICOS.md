# Backend · Bloque 1 — Protección de históricos

Alcance: hallazgos **CR-02, AL-02, AL-03, AL-04 y ME-02** de `docs/AUDITORIA_BACKEND_PROYSOCIAL.md`, con las decisiones de negocio aprobadas. No se tocó CR-01 (métricas por semestre: Bloque 2), ni el esquema, ni la autenticación, ni el diseño B2.

## 1. Regla aplicada
Un registro con **reportes, entregables, evidencias (incluidas versiones), eventos de historial o importaciones** que dependan de él no se elimina ni se modifica de forma que reescriba esa historia. Vale para **todos los estados** del reporte (borrador, enviado, observado, aprobado) y **no existe forma de forzarlo**: el parámetro `forzar` ya no salta esta protección. Las comprobaciones viven en el backend y se hacen **dentro de una transacción**, bloqueando antes la fila afectada (`FOR UPDATE`) y contando después. Una inserción concurrente de un reporte toma un bloqueo compartido sobre esa fila por la clave foránea, de modo que queda serializada con la comprobación.

El rechazo es un **409** con el mismo formato que ya usa la API: `{ error, codigo: "HISTORICO_PROTEGIDO", resumen, alternativa }`. No incluye `requiere_confirmacion` (no se ofrece confirmación forzada).

## 2. Hallazgos corregidos y causa técnica

| Hallazgo | Causa técnica | Corrección |
|---|---|---|
| **CR-02** Eliminación forzada | `DELETE /plantillas`, `/grupos-matriz` y `/semestres` solo contaban reportes y aceptaban `forzar`; la FK `proyecto_entregables.plantilla_id ON DELETE SET NULL` dejaba los reportes sin plantilla, fuera de la matriz y de los indicadores | Bloqueo + conteo de historia en la misma transacción; 409 sin forzado. El semestre y el grupo además se bloquean si tienen docentes asignados o importaciones |
| **AL-04** Edición retroactiva | `PUT /plantillas/:id` no consultaba reportes (el importador sí, con `NOT EXISTS`) | Con historia no se modifica **ningún** campo (horas, fechas, semana, número, texto, instrucciones, enlace, requisitos). Sin historia, edición normal |
| **AL-02** Asignación sin guardas | `PUT /docentes/:id/grupo-matriz` solo comprobaba que el grupo existiera, y `PUT /docentes/:id/tipo-docente` no miraba el grupo; solo `PUT /usuarios/:id` aplicaba «grupo activo y mismo tipo». Ninguna ruta consideraba los reportes del docente | Una misma regla en las tres rutas y en el importador: grupo activo y del mismo tipo; y si el docente tiene reportes vinculados a otro grupo, la reasignación (o quitarle el grupo) se **bloquea** hasta existir el modelo histórico de asignaciones |
| **AL-03** Eliminar docentes | `DELETE /usuarios/:id` sin transacción y sin mirar reportes: `entregable_evidencias.docente_id` (NO ACTION) daba un 500 y `proyecto_entregables.docente_id` (SET NULL) dejaba reportes sin dueño | Se bloquea con 409 si el usuario tiene entregables, evidencias, eventos (como docente o actor), importaciones o ajustes administrativos; el mensaje indica «inactívalo». La FK residual `23503` se traduce a 409 |
| **ME-02** Carrera de administradores | `PUT`/`DELETE /usuarios/:id` bloqueaban solo la fila objetivo: dos administradores podían desactivarse mutuamente y dejar cero activos; `DELETE` no usaba transacción | `pg_advisory_xact_lock` (clave `LOCK_ADMINISTRADORES`) antes de contar administradores, en ambas rutas |

### Protecciones adicionales (misma raíz, mismo criterio)
- **Actualización masiva de evidencia** (`/plantillas/actualizacion-masiva`): solo modifica plantillas **sin** reportes; devuelve `plantillas_protegidas`. Si todas las coincidentes están protegidas, 409.
- **Excepción individual** (`PUT /docentes/:id/plantillas/:id/excepcion`): ya no mueve un reporte existente a otra iniciativa/semana (reescribiría su historia); sí permite guardarla dejándolo donde está.
- **Cambio de semestre de un grupo** (`PUT /grupos-matriz/:id`): bloqueado si el grupo tiene historia (con docentes asignados ya lo estaba).

### Qué se conserva (no se bloquea lo legítimo)
Inactivar docentes (conserva todo), eliminar plantillas sin reportes, grupos y semestres solo con configuración (con la confirmación existente), docentes sin historia, editar plantillas sin reportes, reasignar docentes sin historia, y las protecciones previas (propia cuenta, último administrador, semestre activo, iniciativas con reportes revisados).

## 3. Endpoints afectados
| Endpoint | Cambio |
|---|---|
| `DELETE /admin/plantillas/:id` | 409 si hay historia (se ignora `forzar`) |
| `PUT /admin/plantillas/:id` | 409 si hay historia (cualquier campo) |
| `POST/PUT /admin/plantillas/actualizacion-masiva[/preview]` | Solo plantillas sin historia; `plantillas_protegidas`; la vista previa marca `protegida` |
| `DELETE /admin/grupos-matriz/:id` | 409 con historia (incluye importaciones); conserva el 400 por docentes asignados |
| `PUT /admin/grupos-matriz/:id` | 409 si cambia el semestre con historia |
| `DELETE /admin/semestres/:codigo` | 409 con historia o docentes asignados (se ignora `forzar`); ya no desasigna docentes |
| `DELETE /admin/usuarios/:id` | Transacción + bloqueo de administradores; 409 con historia; la comprobación de «último administrador» solo aplica a administradores **activos** |
| `PUT /admin/usuarios/:id` | Bloqueo de administradores; 409 si cambia o quita el grupo con reportes |
| `PUT /admin/docentes/:id/grupo-matriz` | Grupo activo y del mismo tipo (404/409); 409 con historia |
| `PUT /admin/docentes/:id/tipo-docente` | 409 si no coincide con el tipo del grupo asignado (`TIPO_GRUPO_INCOMPATIBLE`) |
| `PUT /admin/docentes/:id/plantillas/:id/excepcion` | 409 si movería un reporte existente |
| Importador (`POST /admin/importaciones/confirmar`) | Asignar un docente a otro grupo con reportes → 409 |

## 4. Archivos modificados
- **Nuevo** `backend/src/services/historicosService.js`: conteos de historia (plantillas, grupos, semestres, usuarios, asignaciones) y errores estándar.
- `backend/src/routes/admin.js`: los handlers de la tabla anterior.
- `backend/src/services/matrixImportDb.js`: guarda de asignación al importar.
- **Nuevo** `backend/test/integration/historicos.integration.test.js` (20 pruebas).
- **Nuevo** `backend/scripts/test-db-setup.js`; `backend/package.json` (`test:db:setup`, `test:integration:protegidos`); `.gitignore` (`.env.test`).
- Frontend (solo mensajes, sin cambios visuales): `UserManagement.tsx` (muestra el mensaje del backend también en el 409 al eliminar) y `PlantillaManagement.tsx` (aviso de plantillas protegidas en la actualización masiva).

## 5. Pruebas añadidas (20) y resultados
Todas en `proysocial_test`, con datos `TST_H`, comparando el **estado completo** de las tablas involucradas (conteo y `md5` del contenido) antes y después de cada rechazo.

| # | Escenario | Resultado |
|---|---|---|
| 1 | Eliminar plantilla con reportes (aprobado y borrador), también con `forzar` | 409, sin cambios |
| 2 | Eliminar grupo con entregables (con docentes: 400 existente; sin docentes: 409 histórico) | OK |
| 3 | Eliminar semestre con históricos (y con `forzar`) | 409, informa docentes |
| 4 | Eliminación forzada en plantilla, grupo y semestre | 409, sin cambios |
| 5 | Editar horas, fechas, semana, número, texto, instrucciones, enlace, requisitos de una plantilla protegida | 409 en cada intento, sin cambios |
| 6 / 6b | Editar plantilla sin reportes (y validaciones); actualización masiva que protege la plantilla con reportes | OK |
| 7 | Eliminar docente con historial y administrador con acciones registradas | 409 |
| 8 / 8b | Inactivar docente conserva reportes, evidencias y eventos; docente sin historial sí se elimina | OK |
| 9 / 9b | Reasignar docente sin historial (dos rutas); reglas de tipo y grupo activo | OK |
| 10 / 10b / 10c | Reasignaciones que alterarían históricos (grupo, quitar grupo, convertir en administrador); excepción que mueve un reporte; cambio de semestre del grupo | 409; los casos válidos pasan |
| 11 / 11b | Desactivar o eliminar mutuamente a dos administradores a la vez (6 rondas, 3 variantes); último administrador y cuenta propia | Siempre queda ≥ 1 activo |
| 12 | Eliminar una plantilla mientras se crea un reporte sobre ella (12 rondas) | Nunca queda un reporte huérfano |
| 13 | Evidencias, versiones, eventos y aprobado conservan sus referencias; el docente sigue viendo su matriz | OK |
| 14 | Eliminaciones legítimas (plantilla, grupo, semestre sin historia) | OK |

- **20/20 correctas**, repetidas 4 veces seguidas (sin fragilidad en las pruebas de concurrencia).
- **Las pruebas detectan los defectos:** ejecutadas contra el `admin.js` anterior fallan **18 de 20** (las dos que pasan son comportamientos que ya eran correctos). La prueba 1 llega a eliminar una plantilla con un reporte aprobado, lo que confirma CR-02.
- **Seguridad de las pruebas:** solo corren con `PGDATABASE=proysocial_test` exacto, servidor local, sin `DATABASE_URL` y con `current_database()` verificado; en cualquier otra base se **omiten** (comprobado: con `proysocial_dev` las 20 se omiten).

### Regresión
| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` y `vite build` | sin errores |
| Unitarias del backend | 61 de 61 |
| Integración existente en `proysocial_dev` | 52 de 52 (más 20 omitidas por la protección) |
| Integración existente en `proysocial_test` (auth, bloque1, evidencias, importación) | 49 de 49 |
| E2E de Administración (332) y demás suites de navegador | **No se ejecutaron** (ver §10) |

## 6. Estado de `proysocial_dev`
Sin cambios: 5 usuarios, 2 semestres (2026B activo), 18 grupos, 2032 plantillas, 10 proyectos, 33 entregables, 33 evidencias, 57 eventos; sin fixtures. No se recreó ni se borró; solo se leyó y se ejecutó contra ella la integración existente (que crea y limpia sus propios datos).

## 7. Estado de `proysocial_test`
Existía de una fase anterior (vacía de usuarios y entregables, con migraciones hasta la 22). Se **recreó solo esa base** con `npm run test:db:setup -- --reset`: las **34 migraciones aplicadas desde cero** sin errores (dato útil también para la auditoría: confirma que el esquema se reconstruye completo en una base nueva). Contiene únicamente las semillas de las migraciones (15 grupos y sus plantillas, un semestre); sin datos personales ni de otras bases. Credenciales: salen de `backend/.env` (no se copian); `backend/.env.test` (ignorado por git) fija la base, un `JWT_SECRET` aleatorio y desactiva el correo.

Comandos: `npm run test:db:setup` (idempotente) y `npm run test:integration:protegidos`.

## 8. Compatibilidad con el frontend
- Todas las pantallas de Administración ya muestran `error` del backend en las operaciones afectadas; solo había un caso genérico (eliminar usuario con 409), corregido. La actualización masiva informa cuántas plantillas con reportes se conservaron.
- Sin cambios de diseño, vistas ni rutas. La identidad B2 no cambia.
- **Importante:** el servidor de desarrollo del usuario (PID 856, puerto 4000) sigue ejecutando el código **anterior** hasta que se reinicie (`npm run dev:local`). No se reinició para no interrumpirlo.

## 9. Cambios de comportamiento a tener presentes
1. Operaciones que antes se permitían con confirmación ahora devuelven 409 cuando hay historia.
2. Un grupo con **importaciones de Excel** registradas tampoco se elimina (conserva su trazabilidad); para retirarlo, inactivarlo (`activo = false`).
3. `PUT /docentes/:id/tipo-docente` rechaza tipos que no coinciden con el grupo (hay que cambiar tipo y grupo a la vez en «Editar usuario»).
4. Eliminar un administrador **inactivo** ya no se bloquea por «último administrador» (la regla anterior contaba también al inactivo).
5. Eliminar un docente con historia o responsable de iniciativas: primero se informa la historia (409), luego la regla existente de iniciativas (400).

## 10. Riesgos y limitaciones pendientes
- **E2E no ejecutado:** el ejecutor interrumpió la suite de Administración por memoria (601 MB libres de 16 GB, con el Chrome personal ocupando ≈ 5,8 GB), conforme al criterio acordado; no escribió nada. Revisión estática: ninguna de sus acciones debería chocar con las nuevas reglas (los fixtures no tienen historia). **Pendiente** correr, con memoria suficiente y tras reiniciar el backend: `npm run e2e -- administracion docente regresion-shell`.
- **Importación (validación previa):** la protección de reasignación actúa al confirmar; la vista previa aún no la anticipa como error.
- **Fechas y textos por excepción individual** sobre entregables ya reportados siguen siendo editables (solo se bloqueó mover el reporte). Pendiente para el versionado de plantillas / auditoría (Bloque 5).
- **Auditoría de acciones administrativas** (quién borró o cambió qué): no incluida (ME-06).
- **Historial de asignaciones por semestre** (AL-01): sin él, la reasignación de docentes con reportes queda bloqueada, no resuelta.
- **Las protecciones están solo en el backend.** No sustituyen restricciones de integridad en PostgreSQL: cualquier acceso directo a la base, un script o un cliente que no use esta API sigue pudiendo eliminar o reescribir historia. Candidatas, para un bloque con autorización de esquema: `ON DELETE RESTRICT` en `proyecto_entregables.plantilla_id`, `entregable_evidencias.plantilla_id` e `importaciones_matriz.grupo_id` (hoy `SET NULL`); restricción al borrar usuarios con entregables; un disparador que impida `UPDATE` de columnas de significado en plantillas con reportes.

## 11. Qué debe verificar un responsable autorizado en producción
No se accedió a producción ni se asumió que tenga la estructura o los datos de desarrollo.
1. **Base:** existencia y configuración de la base de producción (Cloud SQL), versión de PostgreSQL y conexión desde Cloud Run.
2. **Migraciones:** que `schema_migrations` contenga las **34** filas (en particular `fase23`–`fase27`) y que coincidan con `backend/scripts/migrate.js` antes del próximo despliegue.
3. **Integridad:** que existan las restricciones del esquema (únicos parciales, `CHECK` de estados, FK con las acciones `ON DELETE` documentadas).
4. **Zona horaria** de la instancia y de la sesión (en desarrollo es `America/Bogota`; en Cloud SQL suele ser UTC; las columnas `timestamp without time zone` dependen de ello).
5. **Copias de seguridad:** copia automática y copia manual verificada **antes** de desplegar estos cambios; probar una restauración.
6. **Política de despliegue:** el flujo actual despliega y migra en cada push a `main` sin pruebas; revisar antes de publicar este bloque.
7. **Datos existentes:** consultar si ya hay plantillas, grupos o usuarios que estos 409 dejarán «congelados» (esperado) y confirmar con negocio el procedimiento de inactivación.

## 12. Siguiente paso
Detenido al finalizar el Bloque 1. El siguiente bloque aprobado es **CR-01 (métricas por semestre)**; no se ha iniciado.
