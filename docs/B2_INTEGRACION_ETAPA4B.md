# Integración B2 — etapa 4B (portal docente)

Administrador y docente comparten ahora **el mismo shell y el mismo sistema B2**. Cambia la configuración por rol, no la arquitectura.

## Shell único por rol
- `components/b2/B2Shell.tsx` recibe `rol` (`admin` | `docente`): módulos, riel lateral, notificaciones (`/admin/notificaciones` o `/docente/:id/notificaciones`), menú de cuenta y barra de contexto.
- Docente: menú superior **Mi panel · Mi matriz · Iniciativas · Evidencias · Historial**; riel con **Reportar entregable**, **Mi carpeta de Drive** (si existe) y **Mi perfil** (sin repetir el menú superior); contexto con semestre, semana (backend), programa y grupo (`/docente/:id/perfil`); navegación inferior móvil con los mismos 5 módulos. Ninguna ruta `/admin` aparece en su navegación.
- `TeacherLayout` → `<B2Shell rol="docente" />`. Revertir: `<AppShell config={TEACHER_SHELL} />` (y copias `*Tinta.tsx`).
- Si el backend no tiene calendario para el docente, la barra muestra el mensaje del backend en lugar de una semana calculada en el cliente.

## Pantallas (todas con endpoints existentes; copias anteriores en `*Tinta.tsx`)
| Ruta | Datos |
|---|---|
| `/docente` Mi panel | `GET /docente/:id/dashboard-stats` (indicadores, conteos, observados, próximas, avance por mes y semana, entregables) |
| `/docente/proyectos` + inspector | `GET /docente/:id/dashboard` (proyectos) |
| `/docente/proyectos/:id` | `GET /docente/:id/iniciativas/:id`, `PUT /docente/entregables/:id` |
| `/docente/reportar` | `GET /docente/:id/cronograma`, `…/evidencias` (solo lectura: estado, instrucciones, observaciones), `POST …/matriz/:plantilla/completar`, `PATCH …/borrador`, `PUT /docente/entregables/:id` |
| `/docente/historial` + inspector | `GET /docente/:id/reportes`, `PATCH …/borrador`, `POST …/reenviar`, `GET /docente/entregables/:id/historial` |
| `/docente/perfil` | `GET /docente/:id/perfil`, `PUT /docente/:id/info-contacto` |
| `/docente/matriz`, `/docente/evidencias` | sin rediseño: se integraron al shell (`b2-fill`, sin hack de altura) |

Los valores (avance reportado/aprobado/esperado, brecha, conteos) se muestran tal como los entrega el backend.

## Pruebas (proysocial_dev; fixture TSTE5 de Andrés)
Ver `docs/b2-integracion/etapa4b/` y el informe de entrega.
