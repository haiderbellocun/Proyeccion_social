# Integración B2 — etapa 3 (Revisión y Evidencias)

Alcance: `/admin/revision`, `/docente/evidencias` y la recuperación del «avance por mes» en las matrices. Sin cambios en backend, autenticación, PostgreSQL, migraciones ni reglas de negocio.

## Verificación previa de la etapa 2
El diseño anterior de ambas matrices mostraba el **avance por mes** (`por_mes` de `/matriz-stats`): reportados/total, aprobados, esperados, vencidos y % reportado. Se había retirado. Se recuperó como botón **«Por mes»** (ventana compacta, sin tarjetas): barra con reportado / aprobado / esperado del backend, conteos y vencidos; al elegir un mes se filtra la matriz. También se conserva la petición a `matriz-stats` en la matriz docente.

## Revisión (administrador)
Tabla operativa + inspector. Filtros y paginación siguen en el servidor (`estado`, `escuela`, `programa`, `docente`, `semestre`, `desde`, `hasta`, `q`, `page`, `limit`). Decisión en el inspector: aprobar pide confirmación; solicitar correcciones exige comentario; «No tengo acceso» avisa al docente (mismo PUT con `motivo: sin_acceso`). «Rechazar» se fusionó con «Solicitar correcciones» (el backend las trata igual: `observado`). Un entregable aprobado no ofrece decisiones (la reapertura sigue en la matriz del docente). Sin «Deshacer». Se conserva el mensaje al docente (`POST /admin/notificaciones`), el enlace `?reporte=` y el historial real.

## Evidencias (docente)
Lista + inspector con el flujo de siempre: varios enlaces, «No aplica evidencia» con justificación, elección de iniciativa si es ambigua, guardar borrador (PUT) / enviar o reenviar (POST `completar`), retirar envío, versiones anteriores, historial, observaciones, aviso de acceso y enlace a la matriz (`?plantilla=`). No usa Drive API: solo enlaces.

## Copias para revertir
`ReportReviewTinta.tsx`, `EvidencesTinta.tsx` (y las de etapas anteriores).

## Pruebas (proysocial_dev)
- UI: 70 (etapa 1) + 86 (etapa 2) + 35 (responsive/por mes) + 61 (revisión/evidencias con escritura) comprobaciones en Chrome.
- Escrituras con fixture temporal (entregable de Andrés, enlaces `TSTE3`): borrador → envío → «No tengo acceso» → corrección y reenvío (num_envios=2; versiones anteriores conservadas) → observación con comentario → tercer envío → aprobación con confirmación; rechazo del backend al retirar/editar un aprobado. Cada paso verificado en PostgreSQL; al final se limpió y las tablas quedaron idénticas a las sembradas.
- Backend: 61 unitarias y 52 de integración correctas.
