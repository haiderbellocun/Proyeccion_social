# Integración B2 — etapa 2 (matrices de seguimiento)

Alcance: `/docente/matriz` y `/admin/docentes/:id/matriz`. No se tocó backend, API, autenticación, migraciones, `theme.css`, el panel de coordinación ni otras pantallas.

## Arquitectura
- **Un solo componente compartido**: `src/app/components/b2/MatrizB2.tsx` (tabla jerárquica mes → fase → entregable + cronograma Gantt + inspector + lista móvil). Es presentacional: recibe datos, indicadores y la zona de acciones del rol.
- `matriz-util.ts` (calendario, estados, fechas de visualización), `b2-matriz.css` y `b2-matriz-real.css` (clases `b2-*`, sin tocar Tinta).
- `pages/AdminMatrizDocente.tsx`: misma carga (`/admin/docentes/:id/{perfil,matriz,matriz-stats,iniciativas}`), mismas acciones (excepción PUT/DELETE, reapertura POST) y mismos diálogos; cambia solo la presentación. Copia anterior: `AdminMatrizDocenteTinta.tsx`.
- `pages/MatrizSeguimiento.tsx` (docente): misma carga (`/docente/:id/{perfil,matriz}`), mismo `completar` (enviar / reenviar / retirar), mismas validaciones y deep link `?plantilla=`. Conserva el layout del portal docente. Copia anterior: `MatrizSeguimientoTinta.tsx`.
- **Revertir**: renombrar los archivos `*Tinta.tsx` sobre los actuales.

## Datos y reglas
- Semanas, meses y calendario: `semana_actual.fecha_inicio_semestre/fin_semestre/total_semanas` del backend (no 16 fijas). Hoy y semana actual: `hoy` y `semana_actual` del backend (America/Bogota). Si no hay calendario válido se usa el rango de los entregables y se avisa; no se dibuja «hoy».
- Estados del backend sin cambios (`no_iniciado → borrador → enviado → observado → aprobado`; el reenvío vuelve a «En revisión»). **Vencido es una condición** (etiqueta/barra roja), no un estado. «En curso» es la misma derivación visual que ya existía.
- Indicadores (reportado, aprobado, esperado, cumplimiento exigible, brecha, horas, conteos) se muestran tal como los devuelve `resumen`; el frontend no recalcula nada (solo agrupa filas y cuenta reportados por grupo, como antes).
- Sin dependencias ni conectores entre barras (no existen en los datos).

## Funciones
Expandir/contraer grupos, columnas visibles (se adaptan al ancho; la elección manual se respeta), orden por N.º/Inicio/Límite/Estado, búsqueda, filtros por estado, vencidos, mes, semana y categoría, selección + inspector + teclado, escala semanal/mensual, «Hoy», inspector con descripción, fechas, evidencias (enlaces seguros), observaciones, excepción, historial real (carga bajo demanda) y acciones por rol; lista móvil por semana/mes con «Semana actual» / «Consultando» / «Volver a hoy».

## Pendiente
Revisión, Evidencias, Importador, Administración, Reportes, resto del portal docente (cabecera/menú docente siguen en Tinta). El inspector del docente reutiliza `HistorialEntregable` (estilo Tinta).
