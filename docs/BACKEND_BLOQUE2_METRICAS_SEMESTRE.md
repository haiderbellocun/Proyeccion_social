# Backend · Bloque 2 — Confiabilidad de métricas y aislamiento por semestre (CR-01)

Sin cambios en el esquema de PostgreSQL ni migraciones, sin tocar las fórmulas de métricas, la autenticación ni los permisos, sin rediseño B2 y sin reabrir los Bloques 1, 1.1 y 1.2.

> **Estado: COMPLETADO (cierre técnico).** Integración, unitarias, tipado, build y **todas las suites E2E pertinentes** pasan con el código final, ejecutadas una por una y en serie (§9). El cierre añadió la verificación de contratos en el navegador (§9.1), la corrección de la atribución de entregables sin plantilla (§10.1) y la propuesta de historial docente–grupo ([PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md](PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md), sin implementar).

## 1. Auditoría previa: mapa de dependencias

| Endpoint | Fuente de datos | Cómo trataba el semestre (antes) | Consumidores (B2) |
|---|---|---|---|
| `GET /admin/metricas` | `resumen`: `proyecto_entregables` completos · `por_mes`: ídem, con los meses del semestre **activo** · `por_grupo`: **todos** los `grupos_matriz` · `por_regional`/`top_atrasados`: `loadMatrixForDocentes` sin filtro | Solo `por_mes` miraba el semestre activo y únicamente por fechas; el resto mezclaba todos los semestres | `ReportsMetrics.tsx`; `ReportReview.tsx` (conteos de la bandeja) |
| `GET /admin/dashboard` | conteos y `progreso_semanal`: `proyecto_entregables`/`proyecto_semanas` de **todas** las iniciativas · `proyectos_activos`: todas las `en_ejecucion` · docentes, programas, semáforo: `loadMatrixForDocentes` sin filtro | Calendario del semestre activo solo para rotular semanas; **tarjetas y docentes de un conjunto, gráficas de otro** | `AdminDashboard.tsx` |
| `GET /admin/avance-consolidado` | `loadMatrixForDocentes` | `?semestre` opcional; **sin parámetro, todos los semestres** (y docentes sin grupo) | `AvanceConsolidado.tsx` |
| `GET /admin/indicadores-grupo` | `grupos_matriz` + conteos de docentes y plantillas | `?semestre` opcional; sin parámetro, todos los grupos. Son conteos de **configuración**, no métricas | `IndicadoresGrupo.tsx`, `GroupManagement.tsx` (siempre envían semestre) |
| `GET /admin/docentes/:id/matriz-stats`, `/matriz`; `GET /docente/:id/…` | matriz del docente (su grupo vigente) | Inherentemente un solo semestre: el de su grupo | matrices administrativas y docentes |
| `GET /admin/reportes-revision` | bandeja de entregables | `?semestre` opcional ya correcto (`plantilla → grupo → semestre`) | `ReportReview.tsx`, `AdminDashboard.tsx` |

**Relaciones.** Un docente tiene **un solo** grupo (`usuarios.grupo_matriz_id`); el grupo tiene un semestre; las plantillas pertenecen a un grupo; un entregable apunta a su plantilla (`proyecto_entregables.plantilla_id`) o, si es de la iniciativa, no apunta a ninguna. `proyectos` y `proyecto_semanas` **no tienen columna de semestre**: solo se relacionan por fechas. `SQL_MATRIZ` parte de `usuarios → grupo vigente → plantillas`.

**Fórmulas (únicas, en `matrizService.js`; no se tocaron):** reportado = enviado + aprobado · aprobado = aprobado · esperado = exigibles (fecha límite ≤ hoy) · brecha = aprobados − exigibles (en pp: %aprobado − %esperado) · cumplimiento exigible = % de exigibles aprobados · vencido = condición calculada (no estado) · horas programadas/reportadas/aprobadas.

## 2. Causa exacta de CR-01

Las consultas del panel y de las métricas **se calculaban sobre toda la base y solo después (o nunca) se rotulaban con un semestre**:

1. `metricas.resumen`, `dashboard.stats` y `dashboard.progreso_semanal` agregaban `proyecto_entregables` sin relacionarlos con ningún semestre.
2. `loadMatrixForDocentes(client, { hoy })` se llamaba sin `semestre` (el servicio ya soportaba el filtro, nadie lo pasaba), así que `por_regional`, `top_atrasados`, `docentes_recientes`, `cumplimiento_por_programa`, el semáforo y los promedios mezclaban los docentes de todos los grupos, de cualquier semestre.
3. `por_grupo` listaba **todos** los grupos (en dev, 18 grupos de 2 semestres con nombres repetidos).
4. `proyectos_activos` contaba todas las iniciativas en ejecución.
5. `avance-consolidado` sin parámetro devolvía todos los semestres; el frontend de Reportes filtraba `por_grupo` en el navegador, después de recibir todo.

El efecto numérico era **latente** (hoy todos los datos reales son de 2026B) y determinista en cuanto un docente de otro semestre tuviera datos.

## 3. Cambios

### Contrato del parámetro `semestre` (`/admin/metricas`, `/admin/dashboard`, `/admin/avance-consolidado`)
| Caso | Respuesta |
|---|---|
| Ausente o vacío | El **semestre activo**. Si no hay activo: `200` con `alcance.semestre = null`, todo vacío y una advertencia (no se sustituye por otro) |
| Válido y existente (`2026B`, también en minúsculas) | Solo ese periodo, también si es anterior o futuro |
| Existente pero sin información | `200` con estado vacío (`alcance.vacio = true`) |
| Formato inválido, `todos`, parámetro repetido | `400 SEMESTRE_INVALIDO` |
| Formato válido pero inexistente | `404 SEMESTRE_NO_ENCONTRADO` |
| `grupo_id` inválido (`avance-consolidado`) | `400 GRUPO_INVALIDO` (antes se ignoraba) |

No existe un modo «todos los semestres» a propósito: mezclar periodos es exactamente CR-01.

### Servicios y consultas
- **Nuevo `backend/src/services/semestreAlcance.js`:** `leerSemestreParam`, `resolverSemestre`, `cteEntregablesDelSemestre`, `contarProyectosActivos`, `construirAlcance`.
- **Atribución de entregables a un semestre (una sola consulta, sin duplicados):** CTE `ent` = `proyecto_entregables ⨝ proyecto_semanas ⟕ plantilla_entregables ⟕ grupos_matriz`, donde `gm.semestre = $1`; los entregables **sin plantilla** no tienen un vínculo almacenado con el periodo: solo se atribuyen por fechas y **únicamente si exactamente un semestre contiene el inicio de su semana**; si ninguno (hueco) o más de uno (solapamiento) lo contiene, no se atribuyen a ninguno y se informa (§10.1). Se agrega con `COUNT … FILTER` **en SQL**, dentro del alcance; nada se calcula global para filtrar después.
- **Docentes:** `loadMatrixForDocentes(…, { semestre })` (filtro ya existente, `gm.semestre = $2`), es decir, los docentes cuyo grupo **vigente** es del semestre.
- **`/admin/metricas`:** `resumen` y `por_mes` desde `ent` (los meses son los del calendario del semestre consultado); `por_grupo` solo `WHERE semestre = $1` (más el campo aditivo `semestre`); `por_regional` y `top_atrasados` del mismo conjunto de docentes.
- **`/admin/dashboard`:** conteos, `progreso_semanal` (semanas 1…N del calendario del semestre), `proyectos_activos` (iniciativas en ejecución cuyo cronograma toca las fechas del semestre), docentes, programas, semáforo y ranking: **todo del mismo periodo**; `semana_actual` es la del semestre consultado (`finalizado` si está cerrado, `sin_iniciar` si es futuro).
- **`/admin/avance-consolidado`:** mismo resolvedor; la población es la del semestre.
- **Valores no calculables:** `metricas.resumen.porcentaje_aprobacion`, `dashboard.stats.avance_*_promedio` y `avance-consolidado.totales.promedio_*` son `null` (no `0`) cuando no hay población que medir. El frontend ya los muestra como «—».
- **Nada se redondea antes de operar:** se reutilizan `calcularMetricas` y las agregaciones existentes (redondeo a 1 decimal solo al presentar).

### Respuesta aditiva `alcance` (los tres endpoints)
`{ semestre, activo, origen: "semestre_activo"|"parametro", estado_periodo: "en_curso"|"cerrado"|"futuro"|…, calendario{fecha_inicio, fecha_fin, num_semanas}, hoy, zona_horaria: "America/Bogota", vacio, docentes_sin_grupo, reportes_fuera_de_matriz_vigente, entregables_atribuidos_por_fecha, entregables_sin_semestre, entregables_semestre_ambiguo, criterio{…}, advertencias[] }`.

### Frontend (ajustes mínimos, sin rediseño)
- `ReportsMetrics.tsx`: el selector de semestre pasó del filtro local de la tabla de grupos al **encabezado** y controla toda la página (cada cambio pide `/admin/metricas?semestre=…`); se retiró «Todos los semestres»; solo cuenta la **última solicitud** (una respuesta tardía de otro semestre se descarta) y al cambiar de semestre se limpian los datos para no mostrar cifras de uno bajo el nombre de otro; calendario y semestre de cada fila salen de `alcance`/`por_grupo.semestre` (se eliminó la consulta a `grupos-matriz`). Textos de alcance actualizados («Todas las cifras corresponden al semestre …»); se muestran las advertencias del backend.
- `AvanceConsolidado.tsx`: se retiró «Todos los semestres» del selector (sin parámetro el backend usa el activo y mostraría ese periodo bajo otro nombre).
- `ReportReview.tsx`: los conteos de los chips de la bandeja ya no salen de un total global: con un semestre elegido, de `/admin/metricas?semestre=…`; con «Todos», de la propia bandeja (totales por estado), de modo que siempre coinciden con la lista. Con descarte de respuestas tardías.
- `AdminDashboard.tsx` no cambió: es el panel del semestre activo (sin selector; el backend soporta `?semestre=` para uso futuro).

## 4. Contratos API antes y después (campos existentes sin cambios)
- Todos los campos previos se conservan con el mismo nombre y tipo (prueba de contrato 13).
- **Nuevos (aditivos):** `alcance` en los tres endpoints; `por_grupo[].semestre` en métricas.
- **Cambia el valor por omisión (hacia lo correcto):** sin parámetro, `metricas` y `avance-consolidado` ya no devuelven todos los semestres (el activo). Cambian también los valores `0 → null` listados arriba cuando no hay población.
- **Cambia la población:** los docentes sin grupo ya no aparecen en el panel ni en el consolidado (no pertenecen a ningún semestre); se informan en `alcance.docentes_sin_grupo`.
- Nuevos códigos de error `400/404` descritos en §3.

## 5. Comparación de resultados antes y después

**`proysocial_dev` (datos reales de desarrollo, semestre activo 2026B) — solo cambia lo que debía cambiar:**

| Respuesta | Antes | Después |
|---|---|---|
| `metricas.resumen` | 33 / 20 / 9 / 4, aprobación 60,6 % | **igual** |
| `metricas.por_mes` | Oct: 33 (20/4/9) | **igual** |
| `metricas.por_grupo` | **18 grupos** (15 de 2026A sin docentes + 3 de 2026B) | **3 grupos**, todos 2026B; los 3 con sus cifras |
| `metricas.por_regional`, `top_atrasados` | 3 docentes | **igual** |
| `dashboard.stats` (reportes, semáforo, promedios, atrasados, proyectos activos 10) | — | **igual** |
| `dashboard.stats.total_docentes` / `docentes_recientes` | 4 (incluye al docente sin grupo) | **3** (el sin grupo se informa en `alcance`) |
| `dashboard.progreso_semanal` | semanas 1–4: 9/9, 9/8, 7/3, 4/0 | **igual** |
| `avance-consolidado` sin parámetro | 4 docentes, promedio global 7,2 % | **3 docentes, 9,5 %** (igual que `?semestre=2026B`; el 0 % del docente sin matriz ya no diluye el promedio) y ahora **coincide con el promedio reportado del panel** |
| `metricas?semestre=2026A` | (parámetro ignorado: devolvía todo) | resumen 0/0/0/0, `porcentaje_aprobacion: null`, 15 grupos de 2026A sin docentes, `alcance.estado_periodo: "cerrado"`, `vacio: true` |
| `dashboard?semestre=2026A` | (parámetro ignorado) | 0 docentes, promedios `null`, `semana_actual.estado: "finalizado"` |

**Semestres sintéticos (`proysocial_test`):** el activo, el anterior, el futuro y el vacío devuelven cada uno solo sus cifras, y coinciden con el cálculo de referencia (§7).

## 6. Tratamiento de las semanas y las fechas
- Calendario **del semestre consultado** (inicio, fin, número de semanas) y `America/Bogota`; el semestre activo es solo el valor por omisión.
- **Semestre cerrado:** todas sus fechas límite son anteriores a hoy ⇒ todo es exigible (cumplimiento **histórico**); lo no aprobado cuenta como vencido de ese periodo, y no aparece en el semestre activo.
- **Semestre en curso:** exigible = fecha límite ≤ hoy; los de semanas futuras no son exigibles ni incumplidos (prueba: 5 exigibles y 3 futuros).
- **Semestre futuro:** `semana_actual = sin_iniciar`, 0 exigibles, 0 vencidos, semáforo «sin exigibles», `estado = al_dia`.
- «Vencido» sigue siendo condición calculada, no un estado.

## 7. Pruebas con dos (cuatro) semestres — `metricas-semestre.integration.test.js`
Solo `proysocial_test` (mismas guardas de seguridad que los bloques anteriores). Escenario sintético (`TST_K`): semestre **activo** en curso, **anterior** cerrado, **futuro** y **vacío**; 4 grupos; 5 docentes con 8 entregables cada uno en estados conocidos (aprobado, enviado, observado, borrador, no iniciado), 5 vencidos y 3 de semanas futuras en el activo; entregables **sin plantilla**; un docente sin grupo; colaboradores en varias iniciativas. Los esperados se calculan **en la prueba** a partir de esa especificación y de las definiciones aprobadas y se contrastan además con consultas SQL independientes (no se compara la API consigo misma).

| # | Verifica |
|---|---|
| 1 | Las métricas del semestre A no contienen datos del B (grupos, docentes, ranking, meses) |
| 2 | Sin parámetro = semestre activo (mismo contenido que pedirlo explícitamente) |
| 3 | Con parámetro válido devuelve el periodo pedido (anterior cerrado) |
| 4 | Semestre vacío: estado vacío válido, sin valores heredados, `null` en no calculables |
| 5 | Totales = consultas SQL independientes, para los cuatro semestres |
| 6 | Ranking, regionales y programas usan solo la población del semestre (orden y valores) |
| 7 | Vencimientos por semestre: en curso, futuro (sin exigibles) y cerrado (histórico) |
| 8 | Fórmulas conservadas: reportado, aprobado, esperado, brecha (en entregables y en pp), cumplimiento (exigible/reportado), vencidos, horas, semáforo, por grupo |
| 9 | (Navegador) cambios rápidos de semestre y respuestas tardías: prueba E2E en la suite `indicadores` (§9.1) |
| 10 | Parámetros inválidos: 400 (`todos`, formato, repetido, `grupo_id`), 404 inexistente; vacío = ausente; minúsculas |
| 11 | Permisos: 401 sin sesión, 403 con sesión de docente, 200 administrador |
| 12 | Rutas docentes: ve solo lo suyo, del semestre de su grupo; 403 a otro docente |
| 13 | Compatibilidad: todos los campos previos presentes; `alcance` aditivo |
| 14 | Sin duplicados por colaboradores/varias iniciativas (conteos exactos, semana a semana) |
| 15 | Leer métricas no escribe; las protecciones del Bloque 1.x siguen activas (409 `HISTORICO_PROTEGIDO`) |
| Consistencia | Panel, avance y métricas: misma población, mismo promedio y semáforo; diferencia legítima documentada (§8) |
| Sin plantilla | Atribución por fechas solo si un único semestre contiene la semana; solapamiento y hueco no se atribuyen a ninguno y se cuantifican (`entregables_atribuidos_por_fecha`, `…_sin_semestre`, `…_semestre_ambiguo`), con verificación independiente en PostgreSQL |
| AL-01 | Un reporte de un semestre anterior de un docente que hoy está en otro grupo se cuenta en su semestre, no se atribuye al grupo actual, y **se advierte** (§10) |

Resultado: **16/16**, estable en ejecuciones repetidas. Comprobación de que las pruebas detectan CR-01: contra el `admin.js` anterior al Bloque 2, **12 de las 15 originales fallan** (pasan solo las de fórmulas, permisos y no-escritura, que no deben cambiar).

## 8. Consistencia entre módulos y diferencias legítimas
Mismo semestre ⇒ mismas poblaciones y cifras entre panel, avance consolidado, métricas por grupo y matrices administrativas (verificado). Diferencias **legítimas**, que no se fuerzan:
- **«Reportes» (ME-01):** `metricas.resumen.total_reportes` cuenta todo entregable *completado* (incluye observados y los sin plantilla); `dashboard.stats.reportes_enviados` cuenta aprobados + enviados; la matriz define *reportado = enviado + aprobado*. Relación verificada: `total_reportes = reportes_enviados + reportes_observados`. `% de aprobación` (sobre completados) ≠ `% aprobado` (sobre el total de entregables de la matriz).
- **Promedios por programa/regional:** promedio de los porcentajes por docente (cada docente pesa igual), no la razón de totales; `por_grupo` sí usa razón de totales.
- **`indicadores-grupo`:** conteos de configuración (docentes y plantillas del grupo), no métricas de avance.

## 9. Resultados de regresión (definitivos)

Ejecución con el código final. Los E2E se ejecutaron **uno por uno y en serie** (nunca dos a la vez sobre PostgreSQL), con los umbrales de memoria por defecto (iniciar con ≥ 700 MB libres, interrumpir por debajo de 450 MB), sin cerrar ninguna aplicación del usuario; tras cada suite se verificó la ausencia de fixtures. Se repitieron todas las que dependen de los endpoints o pantallas modificados (no se reutilizó ningún resultado anterior a los cambios del cierre).

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` y `vite build` | sin errores |
| Unitarias | 61 de 61 |
| Integración, todas, en serie, `proysocial_test` | **117 OK, 0 fallas, 3 omitidas** (guardas de base de datos) — incluye las 16 de métricas y las protecciones de los Bloques 1, 1.1 y 1.2 |
| E2E `contratos-semestre` (nueva) | **19 de 19** |
| E2E `indicadores` (con la corrección de `semDe`) | **270 de 270** |
| E2E `capturas-indicadores` | **55 de 55** |
| E2E `regresion-shell` | **70 OK + 1 esperada** (el 500 simulado por la suite en `/admin/dashboard`) |
| E2E `revision` | **35 de 35** |
| E2E `revision-evidencias` | **61 de 61** |
| E2E `administracion` | **332 de 332** |
| E2E `matrices` | **104 OK + 1 esperada** (el `Failed to fetch` simulado por la suite) |
| E2E `docente` | **112 de 112** |
| E2E `historicos` | **61 de 61** |

No se ejecutaron `importador` ni `responsive-docente`: no dependen de los endpoints ni pantallas modificados (último resultado válido previo al bloque; no se declaran aprobadas en esta tanda).

**Fallos simulados vs. inesperados.** Las dos «esperadas» las provocan las propias suites (el ejecutor las clasifica así): el 500 simulado de `/admin/dashboard` y el `Failed to fetch` simulado de `/admin/docentes/2/matriz`. No apareció ningún error inesperado; el incidente intermitente `Error: dashboard-stats` (Bloque 1.2) **no se reprodujo** en ninguna de las suites de `docente`.

### 9.1 Cambios de semestre, respuestas tardías y contratos en el navegador
- **Cambios rápidos y respuestas tardías (`indicadores`):** en Reportes y métricas se cambia de semestre, se retrasa 2,8 s la respuesta del primero, se vuelve al segundo y se comprueba que la respuesta atrasada **no sobrescribe** los indicadores ni el aviso ni el selector (también en Indicadores por grupo). Al volver al semestre activo los indicadores recuperan sus valores; el selector no ofrece «Todos los semestres» ni en Métricas ni en Avance.
- **Contratos (`contratos-semestre`, solo lectura):** con la respuesta **real** del semestre cerrado y vacío y respuestas simuladas con la forma del contrato para futuro, 400 y 404:

| Caso | Dashboard | Reportes y métricas | Avance consolidado |
|---|---|---|---|
| Semestre cerrado y vacío (`alcance.vacio`, promedios `null`) | «Semestre finalizado»; promedios «—», no 0 %; sin alertas de atrasados; sin «NaN»; sin errores de consola | conteos en 0 y «% de aprobación» «—»; aviso «(cerrado: cifras históricas)»; estados vacíos de gráficos | estado vacío explicativo, sin indicadores ni gráficos |
| Semestre futuro | «Semestre por iniciar»; sin «NaN»; sin errores | aviso «(aún no inicia)» y advertencias del backend | — |
| Parámetro inválido (400) / inexistente (404) | error recuperable con «Reintentar» | mensaje del backend con «Reintentar», sin gráficos con datos falsos | alerta recuperable con «Reintentar» |
| Docentes sin grupo | — | — | no aparecen como filas; `alcance.docentes_sin_grupo` los cuenta |

**Revisión de consumidores de `null`** (código + prueba): `pct()`, `n0()` y `num1()` muestran «—» ante `null`/`NaN`; `AvanceConsolidado` calcula con `?? 0` solo para un texto auxiliar (brecha) y representa cada promedio con `pct()`; `ReportsMetrics` guarda la barra de grupos con `total_docentes > 0`; ningún consumidor opera aritméticamente con los promedios `null` del backend. El cambio `0 → null` no produce errores visuales ni matemáticos, y en el único texto afectado («docentes registrados») se corrigió el rótulo a «docentes en el semestre», porque la cifra ahora es por semestre.

## 10. Limitaciones del modelo histórico docente–grupo (AL-01), con evidencia
- **No existe historia de asignación:** un docente tiene un solo grupo (`usuarios.grupo_matriz_id`). Un docente pertenece al semestre de su grupo **vigente**. Los reportes se atribuyen a su semestre por su **plantilla** (relación almacenada), no por el grupo actual del docente: nada se atribuye artificialmente al grupo actual.
- **Lo que sí es exacto:** los totales por estado de un semestre (`resumen`, `progreso_semanal`, `por_mes`) y el desglose por docente/grupo/regional/ranking de los docentes **aún asignados** a un grupo de ese semestre.
- **Lo que no puede reconstruirse sin cambiar el esquema:**
  1. El **denominador** de un docente que fue reasignado a un grupo de otro semestre (qué plantillas le correspondían). Las protecciones del Bloque 1 impiden reasignar a quien ya reportó, así que estos docentes no tienen reportes, pero **sí dejan de contar como población** del semestre anterior.
  2. Un **reporte heredado** de un docente que hoy está en otro semestre (datos previos a las protecciones): cuenta en los totales de su semestre pero no en el desglose por docente. **No se oculta:** `alcance.reportes_fuera_de_matriz_vigente` y una advertencia lo informan (prueba AL-01).
- En `proysocial_dev` hoy: `reportes_fuera_de_matriz_vigente = 0` y 1 docente sin grupo (informado, no atribuido a ningún semestre).
- No se presentan aproximaciones como definitivas. La resolución completa requiere la tabla de asignación `docente_grupo_matriz(docente_id, grupo_id, desde, hasta)` (migración aditiva), fuera de este bloque.

### 10.1 Entregables sin plantilla: ¿existe un vínculo verificable con el periodo?
**No existe.** `proyectos` y `proyecto_semanas` no tienen columna de semestre, y un entregable sin plantilla no apunta a ningún grupo; la única relación verificable es **la fecha** (inicio de su semana frente al calendario de los semestres). Evidencia: en `proysocial_dev` hay **0** entregables sin plantilla (33 de 33 con plantilla), por lo que hoy esta atribución no afecta ninguna cifra real; los sin plantilla nacen del cronograma de la iniciativa (`entregables-semanales`) y de los flujos que actúan por `entregable_id`.

Qué se corrigió y por qué: la primera versión elegía «el semestre que empezó más tarde» cuando dos semestres se solapaban, lo cual es una **inferencia arbitraria presentada como definitiva**. Ahora un entregable sin plantilla se atribuye a un semestre **solo si exactamente uno contiene el inicio de su semana**:

| Situación de la semana | Tratamiento | Cómo se informa |
|---|---|---|
| Dentro de exactamente un semestre | Se atribuye a ese semestre (inferencia por fechas) | `alcance.entregables_atribuidos_por_fecha` y una advertencia «solo por las fechas de su semana» |
| Dentro de más de un semestre (solapamiento) | **No se atribuye a ninguno** | `alcance.entregables_semestre_ambiguo` + advertencia |
| Fuera de todos los semestres (hueco) | **No se atribuye a ninguno** | `alcance.entregables_sin_semestre` + advertencia |

Cubierto por una prueba de integración con dos semestres solapados y una iniciativa fuera de todo semestre, verificada contra una consulta SQL independiente. Los totales por estado siguen siendo los de la especificación (los ambiguos y los sin semestre no cuentan en ninguno). Sin cambios de esquema.

**Limitación que permanece:** mientras exista este tipo de entregable, su semestre es una inferencia por fechas (marcada como tal), no un hecho almacenado. La solución de fondo es que el entregable o la iniciativa guarden su semestre (cambio de esquema, fuera de este cierre).

## 11. Rendimiento antes y después
Base sintética en `proysocial_test` (se eliminó al terminar): 4 semestres × 4 grupos × 12 docentes = **192 docentes, 960 plantillas, 8 640 entregables**. «Antes» = el código previo al Bloque 2 sobre la misma base; «después» = el actual. 15 repeticiones por endpoint tras 2 de calentamiento; un servidor a la vez.

| Medida | Antes | Después |
|---|---|---|
| Ítems de matriz procesados (`loadMatrixForDocentes`) | 11 520 (192 docentes) en 176 ms | **2 880 (48 docentes) en 45 ms** (4× menos filas; escala con el número de semestres acumulados) |
| `/admin/metricas` (mediana / p95) | 163 / 205 ms · 12,6 KB | **75 / 96 ms · 5,2 KB** |
| `/admin/dashboard` | 323 / 422 ms · 69,8 KB | **67 / 92 ms · 19,8 KB** |
| `/admin/avance-consolidado` | 322 / 373 ms · 139,5 KB | **53 / 116 ms · 35,8 KB** |
| Memoria del proceso tras las 51 llamadas | 336 MB | 249 MB (una sola muestra; indicativa) |

- **Consultas repetidas / N+1:** no hay N+1; cada endpoint hace un número constante de consultas (resolver semestre, 1–3 agregaciones SQL acotadas por semestre, la carga de matriz de los docentes del semestre y un par de conteos para `alcance`). La carga de matriz sigue siendo la parte dominante.
- En `proysocial_dev` (4 docentes) la diferencia es despreciable; crece con los semestres acumulados.
- **No se introdujo caché ni índices:** no hacen falta con estos tiempos (ME-07 sigue como observación para un bloque posterior).

## 12. Estado de las bases
| Base | Estado |
|---|---|
| `proysocial_dev` | Línea base intacta: 5 usuarios, 2 semestres (2026B activo), 18 grupos, 2032 plantillas, 10 iniciativas, 33 entregables (20 aprobados / 9 enviados / 4 observados), 33 evidencias, 57 eventos; sin fixtures (`TST*`, semestres sintéticos). Solo las suites E2E escribieron en ella y siempre se limpió (verificado tras cada suite); un lote anterior interrumpido por el sistema dejó fixtures de `administracion`, eliminados con una rutina acotada. 0 reportes sin iniciativa, 0 evidencias sin entregable, 0 eventos huérfanos. No se recreó. |
| `proysocial_test` | Aislada, solo semillas (el semestre activo original 2026A restaurado tras las pruebas); fixtures `TST_K`/`TST_PERF` eliminados. |
| Producción | No se accedió; sin migraciones. |

## 13. Riesgos pendientes
1. **AL-01** (§10): sin historia de asignación, el desglose por docente de semestres cerrados es exacto solo para los docentes aún asignados; el límite se informa en `alcance`. Propuesta: [PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md](PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md) (sin implementar).
2. **Entregables sin plantilla** (§10.1): su semestre se infiere por fechas (marcado); no hay restricción de no solapamiento entre semestres en la base.
3. **Promedios por docente** (no razón de totales) en programa y regional: es la definición vigente; conviene revisarla con negocio antes de usar esas cifras como indicador institucional.
4. **`proyectos_activos`** se define por solapamiento de fechas del cronograma con el semestre (las iniciativas no tienen semestre).
5. **Selector en el panel de coordinación:** `AdminDashboard` solo muestra el semestre activo; el backend ya soporta `?semestre=`.
6. Las protecciones y filtros viven en el backend y no sustituyen restricciones de integridad en PostgreSQL (ver Bloque 1.2, §7).
7. Despliegue sin compuertas en cada push a `main` (AL-05).
8. `importador` y `responsive-docente` no se repitieron en este cierre (no dependen de lo modificado).

## 14. Recomendación del siguiente bloque
1. **AL-01 (historial de asignación docente–grupo)**, con la propuesta ya redactada: migración aditiva `docente_grupo_matriz`, backfill conservador con vista previa y marcado de lo no reconstruible. Resuelve el desglose histórico por docente, quita `reportes_fuera_de_matriz_vigente` y habilita el ciclo normal de reasignación entre semestres. Requiere tu autorización de esquema y las decisiones de la §9 de la propuesta.
2. Después, los bloques de producción del plan (despliegue con compuertas, validación de configuración al arrancar, límite de intentos).

## 15. Siguiente paso
Bloque 2 **COMPLETADO**. Detenido: no se avanzó a seguridad, autenticación, migraciones ni otras funcionalidades.
