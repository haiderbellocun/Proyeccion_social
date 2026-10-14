# Bloque 3 — Evidencias: enlaces, revisión y trazabilidad

Estado: **3A, 3B, 3C (ajustado) y 3D implementados.** 3E (indicadores) y 3F (validación final) pendientes.

## Principio de arquitectura (ajuste de 3C)

Cada docente guarda sus evidencias en **su propio Google Drive**; no existe una Unidad compartida institucional. ProySocial **administra enlaces y trazabilidad, no archivos**:

- NO hay cuentas de servicio, Google Drive API, OAuth adicional, creación de carpetas, carga/descarga de archivos, sincronización ni copias de documentos en el servidor.
- El Client ID de Google se usa solo para el inicio de sesión (sin cambios).
- Se verificó que no existía código de Drive API que retirar (`googleapis`, `drive/v3`, cuentas de servicio: sin coincidencias en `src`, `backend` ni `package.json`); solo la propuesta del documento anterior, que se eliminó.

Flujo real: el docente prepara la evidencia en su Drive → copia el enlace → lo registra en el entregable → envía a revisión → coordinación abre el enlace, aprueba u observa → el docente corrige y reenvía.

## 3A. Diagnóstico (resumen)

La evidencia era un único texto `proyecto_entregables.url_evidencia` (un enlace o JSON con varios), sin versiones; el historial (`entregable_eventos`) no indicaba qué enlaces se entregaron en cada ronda; la validación solo ocurría al enviar; «Mis Evidencias» era una lista plana; la bandeja administrativa mostraba solo los «enviados», de uno en uno, filtraba en el cliente solo la página cargada y **no permitía abrir los enlaces**.

## Modelo (migraciones 26 y 27, aditivas e idempotentes)

- **`entregable_evidencias`** (fase26): una fila por enlace, ligada a `entregable_id`, `docente_id`, `proyecto_id` (iniciativa), `plantilla_id` y `semestre`; `tipo_enlace`, `drive_id` (identificador extraído del enlace, no se consulta a Drive), `envio_numero` (ronda), `estado` `vigente|reemplazada|retirada`. Índice único parcial sobre `(entregable_id, url_clave)` vigente → sin duplicados. Nunca se borra.
- **`entregable_eventos.detalle`** (fase26): cada evento referencia las evidencias de esa ronda.
- **Tipos de enlace** (fase27): `drive_archivo`, `drive_carpeta`, `google_doc`, `google_hoja`, `google_presentacion`, `formulario`, `otro` (enlaces externos permitidos por las plantillas).
- **`proyecto_entregables.problema_acceso_en`** (fase27): marca vigente de «No tengo acceso a la evidencia»; se limpia al reenviar o aprobar. El historial conserva siempre el evento.
- `url_evidencia` se mantiene como copia compatible. `npm run evidencias:backfill` migra los enlaces anteriores (idempotente).

## 3B/3C. Registro y control de acceso

- Varios enlaces por entregable; reconocimiento de Documentos, Hojas, Presentaciones, archivos y carpetas de Drive y formularios; validación de estructura (http/https) también en borradores.
- Duplicados detectados por identificador normalizado (`/file/d/ID/view`, `open?id=ID`, `/edit`, `/view`… son el mismo recurso).
- Cada enlace se abre en pestaña nueva con `rel="noopener noreferrer"`; solo se enlazan URL http(s).
- Versiones: corregir un enlace enviado deja la anterior como «reemplazada»; el historial muestra cada ronda.
- Se muestra qué evidencia solicita cada entregable (descripción de la plantilla o de la excepción individual).
- **Recomendación de acceso antes de enviar** (Mis Evidencias y matriz): «Asegúrate de que el personal encargado de la revisión tenga acceso al enlace compartido.» Se aclara que no es necesario publicarlo para «cualquier persona con el enlace». No obliga ni bloquea el envío.
- **La validación de la URL no garantiza acceso**: solo comprueba su forma. ProySocial nunca intenta abrir documentos privados.
- **«No tengo acceso a la evidencia»** (coordinación): `PUT /admin/reportes-revision/:id` con `motivo: "sin_acceso"` (opcional `evidencias_afectadas`). El entregable pasa a *observado* con un mensaje estándar (editable), se registra el evento `sin_acceso` y se marca `problema_acceso_en`. No se pierde ningún dato ni versión. El docente ve el aviso en su centro y en la observación; al reenviar se limpia. No se combina con aprobar y no aplica a un aprobado (409).

## 3D. Bandeja de revisión administrativa (ampliada, no duplicada)

Se amplió `/admin/revision` (`ReportReview`) y `GET /admin/reportes-revision`:

- Estados: pendientes (por defecto, como antes), problema de acceso, observados, aprobados, todos.
- Filtros **en el servidor** (sobre todas las páginas): escuela, programa, docente, semestre, rango de fechas de envío y búsqueda por entregable/iniciativa; paginación.
- Cada entregable muestra docente, programa, escuela, semestre, iniciativa, semana, tiempo esperando revisión, evidencia solicitada, **todos los enlaces vigentes (abribles)**, versiones anteriores y reenvíos.
- Acciones: aprobar, solicitar ajustes, rechazar (=observar), **No tengo acceso a la evidencia**, notificar al docente. Los estados no pendientes son de solo lectura.
- Historial y versiones bajo demanda (`GET /admin/reportes-revision/:id/historial`).
- Orden: los más antiguos primero (los que llevan más tiempo esperando).
- Componentes compartidos con la pantalla del docente: `EnlaceEvidencia`, `HistorialEntregable`.

## Qué está probado y cómo

| Funcionalidad | Prueba | Con qué |
|---|---|---|
| Tipos de enlace, claves, duplicados, situación, centro | `evidenciaService.test.js` (6) | unitaria |
| Flujo borrador → envío → observación → corrección → aprobación; versiones; historial con detalle; permisos por rol y docente; aprobado protegido; enlaces inválidos; relleno idempotente | `evidencias.integration.test.js` (13) | PostgreSQL real `proysocial_dev`, datos sintéticos |
| Bandeja: filtros, enlaces/versiones/semestre/programa, «No tengo acceso», limpieza al reenviar, aprobado bloqueado, permisos | idem | PostgreSQL real |
| Pantallas docente y coordinación: recomendación, hoja/presentación, duplicado, `target=_blank noopener`, «No tengo acceso», reenvío, aprobación, historial, móvil 390 px | recorrido en Chrome real (CDP) | navegador real + `proysocial_dev` |
| **Google Drive** | **no aplica: no se accede a Drive** | — |

Totales tras este paso: 61 pruebas unitarias y 52 de integración, typecheck y build correctos (sin rastros del acceso de desarrollo en el bundle).

## Pendientes de producción (lista separada; nada se declara resuelto sin prueba)

1. `npm audit` (producción): backend 1 crítica (`proxy-addr`), 2 altas (`nodemailer`, `path-to-regexp`), 1 moderada, 1 baja; frontend 2 altas (`lodash`, `react-router`), 1 moderada. Sin aplicar.
2. Dockerfile y configuración de API (`VITE_API_URL` en el build): sin validar.
3. Migraciones desde base vacía (incluidas 26 y 27): sin probar.
4. Google OAuth real: solo probado el rechazo de credenciales inválidas.
5. Correo institucional (`SMTP_*`): sin configurar ni probar; las pruebas no envían correos.
6. La notificación al docente por «No tengo acceso» usa el flujo de observaciones existente; su entrega por correo depende de la configuración SMTP (punto 5).
