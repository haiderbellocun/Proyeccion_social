# Comparación interfaz ↔ API (Etapa 5A)

Generado por `e2e/suites/capturas-indicadores.mjs` contra `proysocial_dev` (semestre activo 2026B). «Valor en la interfaz» se lee del DOM; «Valor en la API» sale de la respuesta real de `/admin/avance-consolidado`, `/admin/indicadores-grupo` y `/admin/metricas` con el token de administrador, formateada igual que la interfaz (es-CO, 1 decimal). La suite `indicadores` repite y amplía estas comparaciones (filas completas, gráficos, filtros).

| Pantalla | Métrica | Valor en la interfaz | Valor en la API | Coincide |
|---|---|---|---|---|
| Avance consolidado (2026B) | Docentes | 3 | 3 | Sí |
| Avance consolidado (2026B) | Reportado prom. | 9,5% | 9,5% | Sí |
| Avance consolidado (2026B) | Aprobado prom. | 6,8% | 6,8% | Sí |
| Avance consolidado (2026B) | Esperado a la fecha | 36,6% | 36,6% | Sí |
| Avance consolidado (2026B) | Aprobado − esperado | −29,8 pp | −29,8 pp | Sí |
| Avance consolidado (2026B) | Con retraso | 3 | 3 | Sí |
| Avance consolidado (2026B) | Por revisar | 9 | 9 | Sí |
| Avance consolidado (2026B) | Observados | 4 | 4 | Sí |
| Avance consolidado (2026B) | Vencidos | 102 | 102 | Sí |
| Avance consolidado (2026B) | Riesgo crítico | 2 | 2 | Sí |
| Avance consolidado — Carlos Mendoza | Reportado | 8,1% | 8,1% | Sí |
| Avance consolidado — Carlos Mendoza | Aprobado | 4,4% | 4,4% | Sí |
| Avance consolidado — Carlos Mendoza | Esperado | 32,6% | 32,6% | Sí |
| Avance consolidado — Carlos Mendoza | Brecha | −28,2 pp | −28,2 pp | Sí |
| Avance consolidado — Carlos Mendoza | Vencidos | 33 | 33 | Sí |
| Avance consolidado — Andres Torres | Reportado | 0% | 0% | Sí |
| Avance consolidado — Andres Torres | Aprobado | 0% | 0% | Sí |
| Avance consolidado — Andres Torres | Esperado | 36,2% | 36,2% | Sí |
| Avance consolidado — Andres Torres | Brecha | −36,2 pp | −36,2 pp | Sí |
| Avance consolidado — Andres Torres | Vencidos | 51 | 51 | Sí |
| Indicadores por grupo (2026B) | Grupos activos | 3 | 3 | Sí |
| Indicadores por grupo (2026B) | Docentes asignados | 3 | 3 | Sí |
| Indicadores por grupo (2026B) | Entregables en plantillas | 364 | 364 | Sí |
| Indicadores por grupo (2026B) | Indicadores totales | 15 | 15 | Sí |
| Indicadores por grupo (2026B) | Horas totales | 73 | 73 | Sí |
| Indicadores por grupo — Grupo 13 - Nuevo 24h -… | Horas | 24 | 24 | Sí |
| Indicadores por grupo — Grupo 13 - Nuevo 24h -… | Proyectos | 1 | 1 | Sí |
| Indicadores por grupo — Grupo 13 - Nuevo 24h -… | Entregables | 88 | 88 | Sí |
| Reportes y métricas | Total de reportes | 33 | 33 | Sí |
| Reportes y métricas | Aprobados | 20 | 20 | Sí |
| Reportes y métricas | Pendientes de revisión | 9 | 9 | Sí |
| Reportes y métricas | Con observaciones | 4 | 4 | Sí |
| Reportes y métricas | % de aprobación | 60,6% | 60,6% | Sí |
| Reportes y métricas — por mes (Octubre) | Aprobados / Observados / Pendientes | 20 / 4 / 9 | 20 / 4 / 9 | Sí |
| Reportes y métricas — Andres Torres | Vencidos | 51 | 51 | Sí |
| Reportes y métricas — Andres Torres | Aprobado | 0% | 0% | Sí |

Resultado: 36 de 36 comparaciones coinciden.
