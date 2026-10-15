# Integración B2 — etapa 5A (Indicadores y métricas)

Las tres pantallas analíticas del administrador usan ahora el sistema B2 (encabezado #261E36, primario #503296, riel compacto, barra de contexto, tablas B2, inspectores laterales, navegación móvil) con gráficos propios y legibles. No se modificó backend, API, PostgreSQL, migraciones, autenticación ni fórmulas: todas las cifras son las que entrega el backend.

## Rutas, componentes y endpoints (inventario)
| Ruta | Pantalla | Archivo | Endpoints (solo lectura) |
|---|---|---|---|
| `/admin/avance` | Avance consolidado por docente (módulo «Seguimiento») | `pages/AvanceConsolidado.tsx` | `GET /admin/avance-consolidado?semestre=&grupo_id=`, `/admin/semestres`, `/admin/grupos-matriz?semestre=` |
| `/admin/indicadores` | Indicadores por grupo | `pages/IndicadoresGrupo.tsx` | `GET /admin/indicadores-grupo?semestre=`, `/admin/semestres` |
| `/admin/reportes` | Reportes y métricas (métricas globales) | `pages/ReportsMetrics.tsx` | `GET /admin/metricas`, `/admin/grupos-matriz`, `/admin/semestres` |

No se crearon rutas ni pantallas nuevas. «Reportes y métricas» es la pantalla de métricas existente (título y ruta sin cambios); no se inició una etapa «Reportes» aparte.

Kit nuevo reutilizable: `components/b2/charts-b2.tsx` + `b2-charts.css` (Figura con pregunta, Leyenda, FilasBala, ApiladaH, FilasApiladas, ColumnasAgrupadas, Indicadores, AnaPagina) y `b2-ana-{avance,indicadores,metricas}.css`. De Administración se reutiliza `DataTable` (ahora con encabezados ordenables `orden/onOrden`, cambio aditivo), `Barra/Buscar/Filtro/Chips`, `ErrorCarga`, `Tag`; de B2, `Inspector`, `Estado`, `Dl`.

## Funcionalidades conservadas
Semestre y grupo (Avance), semestre (Indicadores), búsqueda, orden por todas las claves anteriores incluidos los meses, «Actualizar», «Ver matriz», definiciones de reportado/aprobado/esperado, semáforo, totales/promedios, totales por grupo, tablas de cumplimiento por grupo, atrasados, regionales, aviso para no administradores, estados de carga/vacío/error con «Reintentar».

## Avance consolidado
Filtros: semestre, grupo, programa, regional, estado (chips por semáforo con conteo), búsqueda, «Ordenar por» + sentido; enlaces profundos `?semestre=` y `?grupo=`. Diez indicadores (docentes, reportado, aprobado, esperado, aprobado−esperado, con retraso, por revisar, observados, vencidos, riesgo crítico): sin filtros de cliente son los `totales` del backend; con filtros se recalculan sobre los docentes visibles con la misma definición (`agregarAvance`) y se rotulan «(filtrado)».

Gráficos (cada uno responde una pregunta y trae «Ver datos en tabla»):
1. ¿Quién está por debajo de lo esperado? — bala reportado/aprobado/esperado por docente (top 10 por brecha; abre el inspector).
2. ¿En qué estado están los entregables? — apilada aprobados / por revisar / observados / sin reportar.
3. ¿Cuántos docentes están en riesgo? — semáforo con texto y conteos.
4. ¿Cómo avanza cada mes? — columnas reportado/aprobado (promedio entre docentes); los meses futuros se atenúan y se rotulan «futuro» solo si el calendario del semestre los ubica sin ambigüedad (nunca como incumplimiento).
5. ¿Dónde se concentran los vencimientos? — vencidos por docente.

Tabla B2 ordenable con inspector del docente (indicadores, brecha en pp y en entregables, desglose por mes) y acciones reales: «Ver matriz» (`/admin/docentes/:id/matriz`), «Ir a la bandeja de revisión» (`/admin/revision`) y «Ver su grupo en Plantillas» (`/admin/sistema?tab=plantillas&semestre=…&grupo=…`). Un docente sin matriz muestra «—» (no 0 % ni 100 %).

## Indicadores por grupo
Filtros: semestre, tipo (Antiguo/Nuevo con conteo), búsqueda. Totales (grupos, docentes, entregables, indicadores, horas) como sumas simples de lo visible, rotuladas «(filtrado)». Gráficos: composición de la carga por grupo (proyectos / actividades / convenios nuevos / dinamizados), entregables y docentes por grupo, y tipo de docente predominante. Inspector con enlaces a Plantillas (semestre+grupo), a Avance (`?semestre=&grupo=`) y a Tareas semanales.

## Reportes y métricas
Indicadores (reportes, aprobados, pendientes, con observaciones, % aprobación) con notas de alcance (resumen global; «por mes» = semestre activo por fecha de envío). Gráficos: reparto de la revisión, reportes por mes (meses futuros atenuados), cumplimiento por grupo (reportado/aprobado/esperado; solo grupos con docentes por defecto, con filtro de semestre — cruzado con `/admin/grupos-matriz` porque `por_grupo` trae grupos de todos los semestres — e interruptor «Incluir grupos sin docentes»), avance por regional (sin «esperado», que el backend no entrega por regional) y tabla de docentes que requieren atención («Bajo 30 %» con texto) con inspector y navegación a su matriz, a su avance y a la bandeja.

## Semestres, filtros y respuestas tardías
Cada petición usa un contador (`useRef`): una respuesta de un semestre/grupo anterior se descarta. La suite lo prueba retrasando artificialmente la primera respuesta y cambiando de semestre; solo se ven datos del semestre elegido. Semestres vacíos (2026A en Avance) muestran un estado vacío explicativo.

## Accesibilidad y responsive
- Cada gráfico: `figure` + `figcaption` con la pregunta, leyenda con muestras con patrón (no solo color), valores escritos, `aria-label` con cifras y tabla alternativa. Tooltips por hover y foco (también al tocar).
- Probado a 1440, 1280, 820 y 390 px: sin desborde de página, consola limpia, tabla → lista en móvil, inspector → cajón/hoja inferior, objetivos táctiles ≥ 40 px.
- **Ajuste móvil (cierre):** a 390 px los indicadores pasan a una rejilla de 2 columnas con etiquetas completas; el gráfico mensual usa etiquetas cortas (Ago, Sep…), escribe los valores bajo cada columna (sin etiquetas montadas) y cabe sin scroll; se corrigió una regla local de Avance (columnas de 84 px) que lo cortaba. Cambios de cálculo: ninguno.

## Comparación con la API
`docs/b2-integracion/etapa5a/comparacion-api.md`: 36 de 36 métricas coinciden (UI vs API real en `proysocial_dev`: indicadores, totales, filas por docente/grupo y valores por mes). La suite `indicadores` repite y amplía la comparación (filas completas, gráficos, filtros): 266 comprobaciones.

## Capturas (`docs/b2-integracion/etapa5a/`)
1440 y 390 de las tres pantallas (`avance`, `indicadores`, `metricas`), con inspector (`*-inspector-*`), con filtros (`avance-filtrado-1440/390`, `indicadores-filtrado-1440`, `metricas-filtrado-1440`), estado vacío (`avance-vacio-1440`), 1280/820 y `avance-mes-390` (gráfico mensual móvil).

## Ejecutor E2E: recuperación y mejoras
Incidente: una cadena larga se detuvo por memoria baja (≈1,4 GB libres de 16 GB; el grueso, unos 7 GB, era el Chrome personal del usuario, no tocado). Se cerraron solo los procesos identificados inequívocamente como de las pruebas (cadena `npm run e2e → run.mjs → matrices.mjs → Chrome` con perfil `proysocial-e2e-chrome-*`, colgada 36 min con CPU 0) y se retiró el bloqueo huérfano (propietario PID 36740 inexistente).

Mejoras en `e2e/` (detalle en `e2e/README.md`): cierre garantizado de Chrome (árbol + perfil) ante cualquier salida, tiempo máximo por comando CDP y por suite, vigilancia de memoria con interrupción ordenada y resultados parciales, limpieza de huérfanos propios y perfiles temporales (solo prefijo `proysocial-e2e-chrome-`), bloqueo con reemplazo de PID muerto, registro por suite y `--reanudar` con huella de fuentes (reutiliza solo resultados válidos). Sin reducir cobertura.

## Resultados (ejecución final, en serie)
| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` / `vite build` | sin errores |
| Backend unitarias / integración | 61/61 · 52/52 |
| `regresion-shell` | 70 OK · 1 esperada |
| `matrices` | 86 OK · 1 esperada |
| `revision` · `revision-evidencias` | 35 · 61 |
| `importador` | 55 |
| `docente` · `responsive-docente` | 112 · 80 |
| `administracion` | 332 |
| `indicadores` | 266 |
| `capturas-indicadores` · `capturas-administracion` | 55 · 25 |

Total E2E: 1177 OK, 0 FALLA reales. Las 2 «esperadas» son errores de consola provocados al simular caídas de red/500. En esa corrida el vigilante interrumpió por memoria la última suite (`capturas-administracion`, solo capturas); se repitió sola y pasó. Sin procesos huérfanos al terminar.

## Base de datos (`proysocial_dev`)
Línea base intacta: usuarios 5, semestres 2 (2026B activo), grupos 18, plantillas 2032, proyectos 10, programas 1, escuelas 0, entregables 33, evidencias 33, eventos 57; estados 20/9/4; sin residuos de fixtures. Las pantallas de esta etapa son de solo lectura.

## `C:\docs` (fuera del repositorio)
Una corrida de prueba con ruta relativa mal pasada dejó `C:\docs\b2-integracion\etapa5a\` con 20 archivos (19 PNG + `comparacion-api.md`, 16:05–16:07). Son **copias de pruebas**: los 20 tienen equivalente en `docs/b2-integracion/etapa5a/` del repositorio (17 idénticos; 3 de una versión anterior). No se borró; puede eliminarse a mano. Además quedan 643 carpetas `qa-chrome-*` en `%TEMP%` (perfiles de scripts QA anteriores fuera del repo, ≈33 GB de disco, sin Chrome vivo que las use) pendientes de que el usuario autorice su borrado.

## Pendientes / observaciones para Reportes
- `/admin/metricas` no admite filtros: `resumen` es global y `por_mes` es del semestre activo; `por_grupo` mezcla todos los semestres (se filtra en cliente con `/admin/grupos-matriz`). Un filtro por semestre/periodo en el backend simplificaría «Reportes».
- No hay valor «esperado» por regional ni por escuela en las respuestas (en dev no hay escuelas); el avance por escuela no se puede mostrar sin ampliar la API.
- La bandeja de revisión solo acepta `?reporte=` como enlace profundo: desde Avance se navega a la bandeja sin filtrar por docente.
- No existe exportación (CSV/PDF) de indicadores.
- En `avance-consolidado` los meses vienen del `mes` de las plantillas (p. ej. «Febrero» en 2026B): se muestran tal cual, sin marcarlos como futuros.
