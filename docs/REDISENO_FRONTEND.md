# Rediseño del frontend — sistema «Tinta»

Dirección: **Enterprise SaaS + Academic Operations Intelligence**. Navegación en tinta oscura, lienzo neutro frío, un único acento tecnológico (señal cian) y cobalto para las acciones. Densidad alta de datos, bordes antes que sombras, tipografía Geist con números tabulares.

No se modificó backend, API, rutas, autenticación, reglas de negocio ni modelos de datos: solo presentación.

## Identidad y tokens (`src/styles/theme.css`, única fuente de verdad)

| Capa | Contenido |
|---|---|
| Primitivas | Escalas `gray/slate` (neutro frío), `blue` (cobalto, marca), `cyan/sky/teal` (señal), `emerald/green` (éxito), `amber/yellow/orange` (alerta), `red/rose` (peligro), `purple/violet/indigo` (en revisión). Las escalas de Tailwind están reasignadas: todo el código existente hereda la paleta nueva sin colores arbitrarios. |
| Semánticas | `canvas, surface, surface-2, line, line-strong, text, text-muted, text-subtle, brand, brand-strong, brand-soft, signal, ink / ink-2 / ink-3 / ink-line / ink-text / ink-muted` (navegación) y estados `st-aprobado, st-enviado, st-observado, st-vencido, st-borrador, st-reportado, st-esperado`. |
| Gráficos | `chart-1…5` y `useChartColors()` (los atributos SVG no resuelven `var()`, así que se leen de los tokens en ejecución). |
| Forma | Radios 4/6/8/10/12/16 px; elevaciones `xs…2xl` (sombras mínimas); breakpoints 390 · 640 · 820 · 1024 · 1280 · 1440. |
| Tipografía | Geist Variable (autoalojada con `@fontsource-variable/geist`, sin CDN). Escala: h1 24 px, h2 20, h3 16, producto 13–14 px; títulos con tracking −0.02em; `tabular-nums` en tablas y KPIs. |
| Accesibilidad base | Foco visible global (2 px cobalto; cian sobre navegación oscura), `prefers-reduced-motion`, enlace «Saltar al contenido», scrollbars discretos. |

Clases de sistema (`@layer components`): `ds-panel`, `ds-panel-header/body`, `ds-table`, `ds-input`, `ds-label`, `ds-btn` (+ `primary / secondary / ghost / danger / success / sm`).

## Componentes reutilizables creados

- `components/ds/primitives.tsx`: `Page`, `PageHeader`, `Panel`, `Kpi`, `StatusPill` (7 tonos), `ProgressBar` (con marca de «esperado»), `StackedBar`, `Segmented` (filtros con contador), `EmptyState`, `InlineAlert`, `PageLoading`, `Spinner`, `TONE`, `TONE_ESTADO`.
- `components/ds/chart.tsx`: `useChartColors`, `axisTick`, `ChartTooltip`, `ChartLegend`.
- `components/ds/Stepper.tsx` (asistente de importación; resumen «Paso n de N» en móvil) y `components/ds/Marca.tsx`.
- `components/shell/AppShell.tsx` + `navigation.ts`: shell único para ambos roles (sidebar colapsable y agrupada, barra superior con migas, semestre/semana, notificaciones, perfil y rol, cajón móvil con Esc). `AdminLayout` y `TeacherLayout` son envoltorios de una línea; la navegación depende del rol (un docente nunca recibe módulos administrativos).
- Restilizados: `Badge` (ahora sobre `StatusPill`), `ConfirmationDialog`, `NotificationPanel`, `ui/select`, toasts (`sonner`), fallback de carga.

## Pantallas transformadas

| Ruta | Pantalla | Cambio principal |
|---|---|---|
| `/` | Login | Panel de marca + acceso; conserva Google OAuth y el panel de pruebas locales |
| `/admin` | Panel de coordinación | Atención requerida, KPIs con progreso, evolución con «hoy», riesgo, cumplimiento por programa, tabla filtrable y ordenable |
| `/docente` | Inicio | KPIs con marca de esperado, «Requiere tu atención», próximas entregas, avance por mes, tabla con filtros |
| `/docente/matriz` | Matriz de seguimiento | De cientos de tarjetas a una tabla agrupada mes → fase con detalle expandible, resumen KPI, rail de meses, búsqueda y filtros |
| `/admin/docentes/:id/matriz` | Matriz del docente (admin) | Mismo patrón; conserva reapertura, excepciones y evidencias |
| `/admin/importar-matriz` | Importador Excel | Stepper moderno de 7 pasos, misma lógica de validación del Bloque 2 |
| `/docente/evidencias` | Mis evidencias | Filtros con contadores, observaciones, versiones, historial, aviso de acceso |
| `/admin/revision` | Revisión | Estados, filtros de servidor, enlaces abribles, «No tengo acceso», historial |
| `/admin/avance`, `/admin/indicadores`, `/admin/reportes` | Analítica | KPIs, tablas densas, gráficos con tokens |
| `/admin/sistema` (6 pestañas) | Administración | Pestañas accesibles, tablas, diálogos |
| `/docente/proyectos`, `/proyectos/:id`, `/reportar`, `/historial`, `/perfil` | Docente | Tablas/formularios con el sistema nuevo |

## Verificación realizada

- `npm run typecheck` y `npm run build` sin errores; el bundle no contiene rastros del acceso de desarrollo.
- 61 pruebas unitarias y 52 de integración (backend sin cambios) siguen pasando.
- Recorridos reales en Chrome con ambos perfiles: evidencias (envío, observación, «No tengo acceso», reenvío, aprobación) e importador de 7 pasos con asignación de docente.
- Auditoría automática en 1440, 1280, 820 y 390 px sobre las 21 rutas: sin desbordamiento horizontal de página, sin ids duplicados, sin errores de consola y con nombre accesible en los controles. Navegación por teclado con «Saltar al contenido» y foco visible.
- Capturas: carpetas `shots/antes`, `shots/despues` y `shots/m390` del directorio temporal de la sesión.

## Pendientes registrados

1. El login con Google real y el SMTP siguen sin probarse (fuera del alcance visual).
2. Las tablas de Usuarios y de Avance consolidado se desplazan horizontalmente dentro de su panel a 390 px (la página no desborda).
3. `AppSelect` no admite `id`: algunas etiquetas se asocian con `role="group"`/`aria-labelledby` o envolviendo el control.
4. En «Reportar entregable», los selectores recortan con puntos suspensivos los textos largos.
5. No se vieron en pantalla los estados de error y vacío de algunas pestañas de administración (los datos de prueba no los provocan).
6. Modo oscuro: los tokens existen pero no se ha diseñado ni probado.
7. Ningún cambio funcional: se revirtió el bloqueo de envío en el cliente que se había añadido en «Reportar entregable»; las reglas de evidencia las sigue aplicando el servidor.
