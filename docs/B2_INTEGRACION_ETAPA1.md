# Integración B2 — etapa 1 (shell administrador + panel de coordinación)

Alcance: navegación superior, riel lateral, barra de contexto, navegación inferior móvil y **Panel de coordinación** del perfil administrador, con datos reales de la API. Nada más.

## Cómo está hecho (incremental y reversible)
- Código nuevo, aislado: `src/app/components/b2/` (`B2Shell`, `B2Context`, `b2-nav`, `ui`, `icons`, `b2.css`). Todas las clases llevan prefijo `b2-` y los tokens viven en `.b2-root`: **no se tocó `theme.css` ni los estilos de Tinta**; las pantallas que aún usan Tinta se ven igual dentro del nuevo shell.
- `AdminLayout.tsx`: ahora devuelve `<B2Shell />`. **Revertir**: devolver `<AppShell config={ADMIN_SHELL} />`.
- `pages/AdminDashboard.tsx`: panel B2. La versión anterior queda en `pages/AdminDashboardTinta.tsx` (sin ruta). **Revertir**: renombrar.
- El shell del docente (`TeacherLayout`/`AppShell`) no cambia.
- `src/lab/` no se importa desde la app real.

## Datos reales
| Elemento | Fuente |
|---|---|
| Indicadores, semáforo, docentes, programas, evolución semanal, semana actual | `GET /admin/dashboard` |
| Cola «Pendientes de revisión» (ordenada por el backend) y su inspector (evidencias, datos) | `GET /admin/reportes-revision?estado=enviado&limit=8[&q=]` |
| Notificaciones y contador | `GET /admin/notificaciones` (+ `NotificationPanel` existente: leer / abrir destino) |
| Semestre y semana en la barra de contexto | semestre activo guardado en sesión; el panel publica la semana que calcula el backend (America/Bogota) |
| Cerrar sesión | `POST /auth/logout` + `clearSession` (igual que antes) |

No se calculan métricas en el frontend; solo formato, orden y filtros de listas ya recibidas. No se usa `dev-snapshot.json`.

## Funciones conectadas
Navegación por módulos y riel contextual (rutas reales, incluido `?tab=` de Administración), búsqueda `/` del panel (docentes en el cliente y cola con `q` del backend), filtros de docentes, selección + inspector + teclado, «Revisar este entregable» → `/admin/revision?reporte=ID`, «Actualizar», notificaciones, menú de cuenta, estados de carga (esqueleto) y error (con «Reintentar»).

## Limitaciones deliberadas
- **Aprobar / observar no está en el panel**: la decisión sigue en la pantalla de revisión (reglas y comentarios del backend intactos). No hay «Deshacer» simulado.
- El buscador solo aparece en el panel (no existe búsqueda global real).
- Sin contadores en el riel lateral (evita una segunda consulta); el contador real está en la campana.
- Las pantallas administrativas restantes conservan el diseño Tinta (acentos azules) dentro del shell B2.
- Docente: shell anterior sin cambios (pendiente).
- `@fontsource-variable/nunito-sans` está en `devDependencies`; el `Dockerfile` usa `npm ci` completo, así que se incluye en el build.

## Pendiente (no iniciado)
Matriz de seguimiento / matriz por docente, Revisión de reportes, Avance consolidado, Indicadores, Reportes y métricas, Importar matriz, Administración del sistema (6 pestañas), todo el perfil docente y Login.
