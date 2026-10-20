# Cierre del Seguimiento operativo

**Estado: LISTO para evaluación en localhost:5173 y para el piloto.** Hay limitaciones reales (§9), ninguna bloquea el uso. No se creó ningún módulo nuevo: la vista **Seguimiento** (`/admin/avance`) pasó de «Avance consolidado por docente» a un centro de seguimiento operativo, sobre las mismas fórmulas oficiales. Sin migraciones ni cambios de esquema; el desarrollo local sigue sin la migración 28 y esta funcionalidad **no la necesita** (es de solo lectura).

Cómo verlo: inicia sesión como **Admin Sistema** (acceso de desarrollo) → menú superior **Seguimiento**.

## 1. Qué existía y se reutilizó
| Pieza existente | Uso |
|---|---|
| `loadMatrixForDocentes` / `mapMatrixRows` (matrizService) | Única fuente de los ítems de matriz por docente (estado, semana, mes, fecha límite, iniciativa, evidencias) |
| `calcularMetricas`, `buildMatrixStats`, `clasificarItem`, `semanaActual`, `itemParaApi` | Todas las cifras: reportado, aprobado, esperado, brecha, vencido, semáforo, evolución por semana. **No se redefinió ninguna fórmula** |
| `resolverSemestre`, `construirAlcance`, `leerSemestreParam` (Bloque 2) | Semestre, calendario y advertencias, con `America/Bogota` |
| `loadAssignedInitiativesMap` | Iniciativas reales del docente (responsable o colaborador), no inferidas por el grupo |
| Componentes B2: `AnaPagina`, `Indicadores`, `Figura`, `FilasBala`, `ColumnasAgrupadas`, `ApiladaH`, `DataTable` (tabla en escritorio, tarjetas en móvil), `Inspector`, `Bullet`, `Chips`, `Filtro` | Toda la interfaz. **No se usó Recharts**: las pantallas B2 de coordinación ya tienen su propio kit de gráficos accesible (con tabla alternativa); se reutilizó ese para mantener la identidad |
| Rutas reales: `/admin/docentes/:id/matriz`, `/admin/revision?reporte=:id`, `/admin/indicadores`, `/admin/sistema?tab=proyectos` | Destinos de las acciones del detalle |

## 2. Qué se implementó
**Backend (lectura, sin escrituras):** `backend/src/services/seguimientoService.js` y dos rutas en `admin.js`:
- `GET /admin/seguimiento` — tarjetas, tabla por docente, tres gráficos y opciones de filtro, con una sola población coherente.
- `GET /admin/seguimiento/docentes/:id` — detalle: general, periodo, iniciativas reales y entregables.
- Las rutas son solo para administradores (como todo `/admin`); los filtros inválidos responden 400 con mensaje claro.

**Frontend:** `AvanceConsolidado.tsx` reescrita (mismo archivo y ruta) + `b2-seguimiento.css`. Diez tarjetas, filtros operativos, tres gráficos, tabla por docente con orden y búsqueda, inspector de detalle y filas en tarjetas en móvil. Los filtros quedan en la URL (`?semestre=&semana=&mes=&grupo=&docente=&programa=&escuela=&iniciativa=&estado=&periodo=semestre&detalle=`), así que se pueden compartir y recargar; los enlaces antiguos `?semestre=&grupo=` siguen funcionando.

## 3. Cómo se calculan las métricas
**Población** = ítems de la matriz de los docentes con grupo en el semestre, tras los filtros de **docente** (grupo, docente, programa, escuela) y de **iniciativa**. El filtro de **estado** solo decide qué docentes aparecen en la **tabla** (los que tienen entregables en ese estado dentro del periodo); las tarjetas y los gráficos conservan la población (un porcentaje calculado solo sobre una categoría no significa nada; la pantalla lo avisa).
**Periodo** = ítems con la semana (y/o mes) elegidos; por omisión, la **semana académica en curso**; «Todo el semestre» está disponible. Un ítem pertenece a una semana por su `semana_numero` de plantilla.

| Indicador | Definición |
|---|---|
| Docentes del semestre | Docentes de la población (tarjeta aparte informa los sin grupo, que no pertenecen a ningún semestre) |
| Con pendientes | Docentes con ≥ 1 entregable del periodo que requiere acción suya: sin iniciar, borrador u observado |
| Reportado · periodo | Entregables del periodo en estado enviado o aprobado ÷ programados del periodo. Sin programados → «Sin entregables programados» (nunca 0 %) |
| Aprobado · periodo | Entregables del periodo aprobados ÷ programados del periodo. Enviar no es aprobar |
| Reportado / Aprobado · semestre | Fórmula oficial: enviados o aprobados (aprobados) ÷ total de la matriz del semestre |
| Esperado · brecha | Entregables con fecha límite ≤ hoy ÷ total; brecha = aprobado − esperado (puntos porcentuales) |
| Vencidos | Fecha límite < hoy y sin iniciar, borrador u observado. Un entregable futuro nunca es vencido; el día del vencimiento aún no lo es |
| En revisión · Observados | Conteos de entregables en esos estados |
| Programados esta semana | Entregables de la semana en curso hoy (independiente del periodo elegido) |
| Enviados fuera de su semana | Entregables programados para otra semana que se enviaron dentro del periodo: **se cuentan aparte** y no entran en el cumplimiento del periodo |

Cantidades y porcentajes nunca se mezclan en una misma cifra: cada tarjeta muestra el porcentaje y, debajo, «n de m». El estado de seguimiento es el **semáforo oficial** (en regla, en riesgo, crítico, sin vencimientos, sin entregables). Las definiciones también salen de la API y se muestran en «Cómo se calcula cada indicador».

**Gráficos** (misma población que las tarjetas): (1) *Evolución semanal*: reportado y aprobado como % de lo programado en cada semana (semanas futuras atenuadas; tabla alternativa con conteos); (2) *Qué grupos necesitan atención*: reportado, aprobado y esperado por grupo, con clic para filtrar (esta comparación no aplica el filtro de grupo; lo resalta); (3) *Estado de los entregables*: cinco estados excluyentes que suman el total, con **vencidos como condición** aparte (ya contada dentro de sin iniciar, borradores y observados; no hay doble conteo).

## 4. Qué viene de PostgreSQL
Todo. Plantillas, calendario del semestre, reportes (`proyecto_entregables`), excepciones por docente, iniciativas (`proyectos`, `proyecto_docentes`), programas y escuelas. No se crean datos ficticios en componentes ni se duplican entregables (un reporte por plantilla y docente, como en las demás pantallas).

## 5. Pantallas integradas
Desde Seguimiento: **matriz del docente** (`/admin/docentes/:id/matriz`), **entregable en la bandeja de revisión** (`/admin/revision?reporte=:id`, solo si ya existe el entregable), **evidencias** (enlaces reales, en pestaña nueva y con `rel="noopener noreferrer"`), **bandeja de revisión**, **Indicadores del grupo** (`/admin/indicadores`) e **iniciativas** (`/admin/sistema?tab=proyectos`). Hacia Seguimiento ya apuntaban Indicadores por grupo y Reportes y métricas (`?semestre=&grupo=`).

## 6. Filtros que funcionan
Semestre · semana académica (en curso / cualquiera / todo el semestre) · mes académico · grupo · docente · programa · escuela (aparece porque `programas.escuela_id` existe; un programa sin escuela no entra en ese filtro) · iniciativa (una concreta o todas las de un tipo) · estado del entregable (con acción pendiente, vencido, en revisión, observado, borrador, sin iniciar, aprobado). Se combinan; las opciones salen de los datos reales; «Limpiar filtros» restablece todo. No se ofrecen filtros sin datos de respaldo (p. ej. no hay filtro de regional en el piloto porque no se pidió y no cambia las cifras oficiales).

## 7. Pruebas superadas
Todas con escrituras solo en `proysocial_test` y en serie; las cifras se comparan con **consultas SQL independientes** (no con el propio servicio).

| Prueba | Resultado |
|---|---|
| `seguimiento-operativo.integration` (10): docentes con pendientes, con aprobados y con observaciones, sin grupo, grupo sin entregables, dos grupos, semestre activo y anterior, semana con y sin actividades, filtros combinados, detalle, gráficos sin doble conteo, **coherencia** con Avance consolidado, Métricas, Dashboard e Indicadores por grupo, permisos y lectura sin escrituras | 10/10 |
| `e2e/suites/seguimiento-ui.mjs` (Chrome real, base aislada, 50 comprobaciones): cifras de pantalla = API = PostgreSQL, filtros, **cambio rápido de filtros con respuesta tardía**, detalle, navegación a matriz, revisión, indicadores e iniciativas, estados vacío y de error con «Reintentar», coherencia con el Dashboard, 1440/1280/820/390 px, consola sin excepciones | 50/50 |
| Integración completa en serie | 184 pruebas: 181 correctas, 0 fallidas, 3 omitidas (`devlogin`, exigen `proysocial_dev`) |
| Unitarias · `tsc` · build | 61/61 · sin errores · correcto |
| E2E existentes de solo lectura contra `proysocial_dev`: `indicadores`, `regresion-shell`, `matrices` | 214 · 70 · 104 correctas, 0 fallidas |
| Estado de las bases | `proysocial_test` sin residuos; `proysocial_dev` intacto (34 migraciones, 5 usuarios, sin datos de prueba) |

**Defectos reales que aparecieron y se corrigieron durante la prueba:**
1. **Al cambiar un filtro, las opciones de todos los selectores desaparecían mientras llegaba la respuesta**, así que un segundo cambio rápido reiniciaba el filtro (el selector perdía su valor y la consulta salía sin filtro). Lo reprodujo la prueba de «cambio rápido con respuesta tardía»; ahora las opciones se conservan y la respuesta tardía del filtro anterior se descarta (contador de solicitudes + `AbortController`).
2. Los botones del detalle medían 38 px en móvil (el estándar del proyecto es 40 px): corregido.

**Pruebas existentes que se actualizaron (cobertura equivalente):** `e2e/suites/indicadores.mjs` verificaba la pantalla antigua (título, cinco gráficos, columnas de la tabla). La sección «Avance consolidado» se sustituyó por una de coherencia entre la nueva vista y la API de Avance consolidado, y las comprobaciones de estados de carga/error y accesibilidad se reapuntaron al nuevo endpoint y a los nuevos gráficos. La cobertura detallada de la pantalla nueva vive en `seguimiento-operativo` y `seguimiento-ui`. **No se tocaron** las suites E2E con SQL pospuestas (`administracion`, `historicos`, `importador`), que siguen **sin aprobarse**. Una ejecución de `indicadores` se interrumpió por falta de memoria libre (643 MB, por debajo del umbral); no se relajó el umbral: se esperó a recuperar memoria y se repitió.

## 8. Capturas (`docs/b2-integracion/seguimiento-operativo/`)
`antes/` y `despues/` (1440, 1280, 820 y 390 px, página completa) y `detalle/` (inspector del docente en los cuatro tamaños). En escritorio: tarjetas en rejilla de dos filas, evolución semanal a la izquierda, estado y grupos a la derecha, tabla central; en 820 y 390 px la tabla pasa a tarjetas expandibles y el detalle a hoja inferior, sin desplazamiento horizontal.

## 9. Limitaciones funcionales reales
- **Iniciativa: solo relaciones demostrables.** Un entregable pertenece a un proyecto, actividad o convenio solo si ya fue reportado dentro de esa iniciativa o hay una excepción del docente. Lo aún no reportado **no tiene iniciativa asociada**: el filtro por iniciativa y el «avance atribuible» (aprobados de los vinculados, nunca sobre toda la matriz) reflejan principalmente el trabajo ya reportado. El sistema también *sugiere* una iniciativa por el nombre del entregable; esa sugerencia se muestra con «posible:» pero no se cuenta.
- **Pertenencia al semestre = grupo actual del docente** (límite conocido del historial; la lectura histórica por semestre es la Fase C, aplazada): un semestre anterior solo lista a los docentes que hoy están en sus grupos.
- **Docentes sin grupo** no pertenecen a ningún semestre: se informan, no se incluyen. **Inactivos** con grupo sí se incluyen (igual que Avance consolidado) y se marcan.
- **Mes y semana** se combinan con «y»; el mes es la etiqueta de la plantilla (p. ej. «Febrero»), no una fecha calendario.
- **Horas:** se muestran programadas y reportadas del semestre (de la matriz); no hay horas por iniciativa.
- **Vínculos:** la matriz del docente y las iniciativas abren la pantalla completa (no hay enlace a un entregable o a un proyecto concretos dentro de ellas); la revisión sí abre el entregable.
- **Rendimiento:** el servidor calcula en memoria sobre la matriz del semestre (como Avance consolidado). Con el tamaño del piloto es inmediato; no se midió con cientos de docentes.
- **Migración 28:** no se necesita aquí; las asignaciones de docentes a grupos siguen requiriéndola en desarrollo (503 explícito).

## 10. Estado para el piloto
**LISTO.** Coordinación puede responder desde una sola vista: qué docentes trabajan y en qué iniciativas participan, qué deben entregar esta semana, qué tienen atrasado, qué está en revisión, qué se aprobó, cuánto avanzaron en la semana y en el semestre, y qué grupos necesitan atención. Sin bloqueos pendientes para esta funcionalidad.

Nota operativa: el backend de `localhost:4000` lo estoy ejecutando yo con `dev:local` (base `proysocial_dev`, acceso de desarrollo) para que veas la funcionalidad; si lo reinicias tú, usa `npm run dev:local` dentro de `backend/`.
