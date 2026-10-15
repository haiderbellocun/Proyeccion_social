# Integración B2 — etapa 4C (Administración)

Las seis pestañas de **Administración del sistema** (`/admin/sistema`) usan ahora el mismo shell y sistema B2 que el panel, las matrices, la revisión, el importador y el portal docente. Se conservaron endpoints, payloads, validaciones, mensajes y reglas de negocio; solo cambió la presentación y la estructura de estado necesaria para el inspector. No se modificó backend, PostgreSQL, migraciones ni autenticación.

## Estructura
- `pages/SystemAdmin/index.tsx`: la pestaña activa vive en la URL (`?tab=usuarios|semestres|programas|proyectos|tareas|plantillas`), de modo que el riel lateral, el teclado (flechas/Inicio/Fin) y los enlaces profundos (`?tab=plantillas&semestre=2026B&grupo=16`) quedan sincronizados.
- Cada pestaña: cabecera con pestañas + barra de filtros + tabla operativa + **inspector lateral** con modos `ver` / `editar` / `crear` / subformularios. En móvil la tabla pasa a lista y el inspector a hoja inferior.
- Riel lateral: «Usuarios · Semestres · Escuelas y programas · Iniciativas · Tareas semanales · Plantillas · Importar matriz».

## Kit B2 de Administración (`components/b2/admin-ui.tsx` + `b2-admin.css`)
`AdmCabecera`, `AdmPagina`, `Barra/Buscar/Filtro/Chips`, `DataTable` (columnas por prioridad según el ancho útil, lista móvil, menú contextual por fila, navegación con teclado), `Paginador`, `Campo/Grupo/FormInspector` (errores en línea + resumen, barra de acciones fija), `useConfirmar` (diálogo nativo `<dialog>`, foco en «Cancelar» para acciones destructivas), `ErrorCarga`, `Vacio`, `Cargando`, `Tag`, `Resumen`.

Reutilizados de B2: `Inspector` (con la nueva opción `wide`), `Menu`, `Estado`, `Dl`, `enControl`, `useMedia`, iconos B2 y las clases `b2-input`, `b2-sel`, `b2-chip`, `b2-tb`, `b2-tabla`, `b2-ml-*`, `b2-alert`, `b2-skel`.

## Pestañas
| Pestaña | Contenido principal |
|---|---|
| Usuarios | Tabla (nombre/correo, rol, tipo, programa/escuela, grupo matriz, estado) con búsqueda, chips de rol y filtros de escuela/programa/estado; crear, editar (incl. activo/inactivo), eliminar con confirmación; paginación de servidor. |
| Semestres | Periodos con fechas, semanas, grupos, plantillas, docentes y reportes; crear/editar/activar/eliminar (doble confirmación forzada); «Eliminar» del semestre activo deshabilitado con explicación (el backend sigue siendo la autoridad); enlace a la clonación. |
| Escuelas y programas | Lista de escuelas con conteo + tabla de programas filtrada; formularios de escuela y programa en el inspector; eliminar escuela con programas deshabilitado con explicación. |
| Iniciativas | Tipo, estado, responsable, fechas, horas, semanas y semestre (derivado de la fecha de inicio y rotulado como tal); inspector con docentes asociados y cronograma semanal; crear/editar (reconstrucción de cronograma con confirmación), asignar docentes, eliminar con doble paso. |
| Tareas semanales | Semestre, activación, KPIs, grupos matriz, docentes del grupo (asignar/editar/quitar), resumen de semanas y entregables, enlace a «Plantillas», clonación de semestre (sin tocar la lógica de fechas). |
| Plantillas | Grupos por semestre + resumen + origen de importación + docentes (enlace a su matriz) + tabla filtrable (búsqueda/mes/semana); inspector con todos los datos; crear/editar, **actualización masiva** con previsualización de alcance y confirmación; eliminar conservando reportes (doble paso). |

## Seguridad funcional (verificada, no solo visual)
- Docente → `/admin/*` redirige; APIs admin con token docente → 403; sin sesión → 401.
- El backend rechaza con 409 eliminar/desactivar al único administrador y eliminar el semestre activo; la BD queda intacta tras los intentos.
- Plantillas con reportes históricos y evidencias aprobadas no se alteran (hash de plantillas sembradas idéntico tras las pruebas).

## Entregables transversales en Reportar (`?plantilla=`)
**Resuelto solo en frontend.** El cronograma del docente solo incluye plantillas con iniciativa; las transversales (sin `iniciativa_id`) no llegaban a Reportar y `?plantilla=ID` caía en otra iniciativa. El backend ya soportaba reportarlas (`completar` sin `proyecto_id` las ancla a una iniciativa de soporte y las marca `transversal=true`). `ReportProgress` ahora complementa el cronograma con `GET /docente/:id/matriz` (solo lectura) y muestra el grupo «Entregables transversales (gestión general)» con los ítems que el cronograma no trae, sin duplicar los ya creados. Al materializarlos no envía `proyecto_id`. Un docente sin iniciativas asignadas sigue sin poder reportar (`SIN_INICIATIVA`, regla de negocio sin cambios). Probado con María, Carlos, Andrés y Laura y con un fixture TSTC4 (borrador y envío, limpiado y verificado).

## Defectos corregidos durante la etapa
- Carrera en Plantillas: una respuesta tardía «todos los semestres» pisaba la lista del semestre elegido (ahora solo cuenta la última solicitud).
- Foco por teclado perdido al cambiar de pestaña con flechas; Esc no cerraba el inspector fuera de la tabla.
- Lista móvil reducida a ~2 filas por el contenedor con `overflow:hidden` (el panel se desplaza completo en ≤720 px).
- Botones `b2-btn-sm` de 36 px en el inspector móvil (ahora 40 px); etiqueta «Con ajuste administrativo» recortada.
- Formato de fecha unificado (`24 ago 2026`).
- «Tareas semanales» se quedaba en «Inicializando semestre…» si no había semestres (ahora muestra el estado vacío).

## Incidente de pruebas (transparencia)
Durante la revisión visual, un script de captura hizo clic en «Guardar plantilla» sobre la plantilla #1 / semana 1 del grupo «Grupo 13 … (DEV 2026B)» sin modificar valores. Verificado en solo lectura: la fila coincide con su equivalente del grupo origen (días 0–6, 17 h) y los conteos sembrados no cambiaron. La tabla no tiene columna de última modificación, por lo que no es posible comprobar el `updated_at`.

## Pruebas reproducibles (`e2e/`)
Suites Chrome (CDP) incorporadas al repositorio, sin rutas personales ni secretos: `npm run e2e` (todas, en serie), `npm run e2e -- administracion`, `npm run e2e:lista`. Se ejecutan siempre en serie (bloqueo `proysocial-e2e.lock`), solo contra `proysocial_dev` (aborta si la BD es otra) y con fixtures identificables que se limpian. Detalles en `e2e/README.md`.

## Resultados finales (ejecución completa en serie)
| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` / `vite build` | sin errores |
| Backend unitarias / integración | 61/61 · 52/52 |
| `regresion-shell` | 70 OK · 1 esperada |
| `matrices` | 86 OK · 1 esperada |
| `revision` / `revision-evidencias` | 35 · 61 |
| `importador` | 55 |
| `docente` | 112 |
| `responsive-docente` | 80 |
| **`administracion`** | **332 OK · 0 FALLA** |
| `capturas-administracion` | 25 |

Las «esperadas» son errores de consola provocados al simular caídas de red/500. BD final: usuarios 5, semestres 2 (2026B activo), grupos 18, plantillas 2032, proyectos 10, entregables 33, evidencias 33, eventos 57; estados 20/9/4; sin residuos TSTA4C/TSTE/TSTC4.

## Capturas (`docs/b2-integracion/etapa4c/`)
1440: `usuarios`, `semestres`, `programas`, `iniciativas`, `tareas`, `plantillas` (con inspector abierto) y formularios `usuarios-form`, `semestres-form`, `programas-form`, `iniciativas-form`, `tareas-clonar`, `plantillas-form`, `plantillas-masiva`. 1280/820: `usuarios`, `plantillas`. 390: las seis listas, `usuarios-form-390`, `iniciativas-inspector-390`.

## Revisar en localhost
1. `npm run dev` (front 5173) y backend con `.env.dev` (4000) contra `proysocial_dev`.
2. Entrar como administrador (acceso de desarrollo) → menú superior **Administración** → pestañas o riel lateral.
3. Probar `…/admin/sistema?tab=plantillas&semestre=2026B&grupo=16` y reducir el ancho a 390 px.

## Rollback
Los archivos originales están en el historial de git (`git show 63be8b7:src/app/pages/SystemAdmin/<archivo>.tsx`).
