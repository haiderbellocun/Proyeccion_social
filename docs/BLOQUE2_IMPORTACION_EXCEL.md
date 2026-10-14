# Bloque 2 — Importación de matrices desde Excel

## Qué hace
Asistente administrativo («Importar matriz Excel», `/admin/importar-matriz`) que convierte la hoja de **cronograma** de una matriz Excel en una **plantilla de grupo** (`grupos_matriz` + `plantilla_entregables`). Los docentes no reciben copias de tareas: su matriz se calcula desde la plantilla de su grupo (`usuarios.grupo_matriz_id`), con sus excepciones individuales e iniciativas (modelo de `main`). Asignar el grupo a un docente basta para que vea su matriz, fechas, horas e indicadores.

## Análisis de los archivos de referencia (solo lectura; no se modifican)
**`1. Propuesta Matrices de Seguimiento Base - 2026A.xlsx`** — 35 hojas (4 ocultas):
* `Listado de entregables completo` y `Base …Grupo N`: catálogos por categoría (columnas «Ubicación en MS, No., Entregable, Descripción, Horas»), **sin fechas**, con tablas de indicadores al costado y numeración que reinicia por sección → no son plantillas fiables (se soportan como tipo `listado`, con fechas derivadas de la semana y advertencia; las filas sin «Mes - Semana N» se rechazan).
* `G1…G15 …` (cronograma por grupo): cabecera (docente, programa, regional, link Drive, horas P.S.), bloques `Mes - Semana N` y entregables (`N°`, Entregable, Descripción, Tiempo en horas, **Fecha de inicio/finalización**, Estatus, Fecha real, % de avance con fórmulas). Semanas 1–16 consecutivas (Febrero–Mayo).
* Hallazgos reales: números repetidos con entregables distintos (G2: 30–34, 20 filas; G3: 85), saltos de numeración, filas con nombre vacío o sin número, celdas `#REF!`, fórmulas sin valor guardado, hojas ocultas/copias, G15 incompleta (28 entregables), tablas de apoyo debajo del cronograma, nombres de docente dentro del nombre de hoja.
* **Semanas de lunes vs. semestre que inicia en martes:** el Excel agrupa semanas de lunes a sábado (semana 1 = 09/feb) y `semestres.fecha_inicio` es 2026-02-10 (martes): 85 de 110 filas de G1 tienen la «semana» del Excel una unidad por encima de la que da su fecha. El asistente lo detecta y pide una decisión (recomienda la etiqueta del Excel cuando la diferencia es siempre 1 y el semestre no inicia en lunes).
* Las plantillas sembradas en `main` para 2026A usan offsets por semana (0–6 desde el inicio) en vez de las fechas exactas del Excel (diferencia de ~1 día): no se modificó.

**`Matriz de seguimiento base - Proceso de Automatización.xlsx`** — 2 hojas: una matriz **ya diligenciada de un docente real** (semestre Agosto–Noviembre 2025: nombre, programa, regional, link Drive, fechas programadas y reales, % de avance con `#REF!`) y `Listado de desplegables` (catálogo; proyectos 1–4 en columnas paralelas; no importable como matriz). Encabezados distintos a los de 2026A (`Fecha programada de entrega` sin fecha de inicio, `Tiempo en horas`).
* El semestre **no está indicado** en el archivo (2025B por las fechas); el semestre de destino debe existir en `semestres` con su calendario real (el cronograma excede 16 semanas: hay que crearlo con el número de semanas correcto). Sin calendario el asistente se detiene (`SEMESTRE_INEXISTENTE`); no inventa fechas.
* ⚠ Contiene datos personales (docente y enlace de Drive): el asistente los ignora, no los muestra ni los guarda. **Valore retirar ese archivo del repositorio si es público.**

## Mapeo Excel → PostgreSQL
| Excel | Campo | Notas |
|---|---|---|
| N° | `plantilla_entregables.numero` | entero > 0; único por grupo (duplicados → decisión) |
| Entregable | `entregable` | obligatorio |
| Descripción Evidencia | `descripcion_evidencia` (+ `enlace_referencia` si hay URL https) | |
| Horas | `horas` | ≥ 0; vacío = 0 con advertencia |
| Fecha inicio / fin | `dias_inicio_desde_feb`, `dias_fin_desde_feb` | offsets desde `semestres.fecha_inicio`; deben caer dentro del semestre |
| `Mes - Semana N` | `mes` (minúsculas), `semana_numero` | |
| Categoría / fase (col. A, bloque) | `categoria` = `fase` | misma convención que las plantillas sembradas |
| Estatus, fecha real, % avance, fórmulas | — | **no se importan**: los indicadores se calculan en el sistema |

## API (solo administradores; `requireAuth` + `requireRole("admin")` antes de leer el cuerpo)
`POST /admin/importaciones/analizar | hoja | validar | confirmar`, `GET /admin/importaciones`. El archivo (≤ 12 MB) viaja en base64 y se reenvía en cada paso (sin estado en el servidor). `validar` **nunca escribe**. `confirmar` repite toda la validación en el servidor, usa una transacción con bloqueo (`pg_advisory_xact_lock`) y registra el lote.

Reglas de integridad: nunca se borra nada; las plantillas con reportes de docentes (`proyecto_entregables.plantilla_id`) no se modifican (`TIENE_REPORTES`); filas con error nunca se escriben (con `opciones.omitir_errores` se importan solo las válidas); reimportar el mismo archivo al mismo grupo da `sin_cambios` sin nuevo lote; un grupo nuevo con nombre repetido en el semestre se rechaza; un grupo de otro semestre es incompatible; asignar un docente que ya tiene otro grupo exige decisión.

Decisiones administrativas (no se inventa nada): `duplicados` (renumerar | omitir), `semana` (fecha | etiqueta), `docente` (mantener | reasignar).

Validaciones: duplicados, números/entregables vacíos, fechas inválidas/invertidas/fuera del semestre, semana inexistente, horas negativas o no numéricas, `#REF!`/fórmulas sin valor, grupo incompatible, docente inexistente/inactivo, programa de cabecera no registrado (aviso), archivo corrupto/ZIP bomb/protegido/sin hojas.

## Base de datos
* `fase23_importacion_matrices.sql`: `importaciones_matriz` (lote UUID, usuario, hash SHA-256 del archivo, índice de hoja, semestre, grupo, modo, decisiones, resumen JSON — sin datos personales) y trazabilidad en `plantilla_entregables` (`importacion_id`, `origen_hoja_indice`, `origen_fila`).
* `fase24_entregables_transversales.sql`: `proyecto_entregables.transversal` — marca que el reporte de un entregable transversal solo se apoya en una iniciativa por la FK histórica; la matriz lo muestra como «Gestión general del semestre».
* Aditivas e idempotentes; registradas en `scripts/migrate.js`.

## Semestres
`POST /admin/semestres/clonar` y `/admin/grupos-matriz/:id/clonar` ya copiaban plantillas con offsets relativos (las fechas se ajustan solas al nuevo calendario) y no tocan el semestre origen. Se corrigió que **no copiaban** `enlace_referencia`, `tipo_evidencia` ni `requiere_evidencia`, y que `mes` y la palabra de mes inicial de `categoria`/`fase` quedaban con el mes del semestre antiguo: ahora se recalculan con el calendario destino.

## Indicadores
`horas_programadas`, `horas_reportadas` y `horas_aprobadas` se suman al resumen (mismas reglas que los demás indicadores; no se guardan porcentajes).

## Probar en localhost
1. `cd backend && npm run dev:setup && npm run dev:local` (base `proysocial_dev`, datos sintéticos) y `npm run dev` en la raíz.
2. Entrar como `admin@proysocial.local` (panel «Entorno de pruebas local») → menú **Importar matriz Excel**.
3. Cargue un `.xlsx` con la estructura de cronograma (puede generarlo con `test/support/xlsxBuilder.js`), elija el semestre `2026B`, «grupo nuevo», valide, resuelva decisiones y confirme.
4. Asigne el grupo a un docente en el mismo asistente (o en Administración) y entre como ese docente → Matriz.

## Pruebas
* Unitarias (`npm test`): lector `.xlsx` (fechas, fórmulas, errores, combinadas, ZIP comprimido, corrupto, ZIP bomb), estructura, extracción, validación, decisiones, idempotencia/protección de plantillas, horas, transversales.
* Integración (`npm run test:integration`, `proysocial_dev`): seguridad (401/403), archivos inválidos sin escrituras, simulación sin escrituras, importación válida + lote + trazabilidad, reimportación sin duplicados (incluida concurrencia), asignación a docente → cronograma e indicadores, conservación de reportes aprobados, decisiones, grupo incompatible, clonación entre semestres, historial.

## Cierre funcional y UX (Bloque 2)

**Asistente (7 pasos).** Indicador de pasos, chip del archivo con «Cambiar archivo» / «Cancelar importación» (no escribe nada), mapeo de columnas con el texto real de cada encabezado (`Columna B — N°`), validación sin guardar, previsualización con filtros (válidas, advertencias, errores, **duplicadas**) y color por estado, «Decisiones tomadas» con opción **Cambiar**, confirmación bloqueada hasta marcar «Entiendo que…» (y «Importar solo las filas válidas» si hay errores), resumen final con ajustes aplicados, estados de carga y error con **Reintentar** (incluye caída de red). Diseño verificado a 390 px y 820 px sin desbordamiento horizontal. La lista de grupos se refresca al terminar una importación.

**Ver matriz del grupo.** El resultado enlaza a `/admin/sistema?tab=plantillas&semestre=…&grupo=…` (pantalla existente, sin rutas nuevas). El panel muestra totales y horas, la importación de origen (lote, archivo, quién/cuándo), los docentes asignados con «ver su matriz» (`/admin/docentes/:id/matriz`) y permite asignar un docente. Endpoint: `GET /admin/grupos-matriz/:grupoId/resumen` (solo admin).

**Semana vs. fecha.** Nunca se corrige nada automáticamente. Si la semana del Excel difiere de la calculada, se pide una decisión: `fecha` o `etiqueta`. Se marca «Recomendada» solo cuando la diferencia es constante de 1 semana y el semestre no empieza en lunes (no se asume lunes). Las fechas originales (`dias_inicio/fin_desde_feb`) no se alteran nunca; si se cambia la semana se guarda la original en `semana_original` y, si se renumera, `numero_original` (migración `fase25_importacion_trazabilidad.sql`).

**Pruebas.** Unitarias 55/55. Integración 36/36 sobre `proysocial_dev` con datos sintéticos (marcador `TST_B2`, semestres 2098A/B), incluyendo: validar no escribe (conteos SQL idénticos), reimportar no duplica, repetición concurrente, protección de plantillas con avance, trazabilidad fase25, resumen de grupo, permisos. Navegador real (Chrome headless por CDP, sin dependencias): archivo corrupto, mapeo, decisiones y cambio de decisión, previsualización, confirmación bloqueada, resultado, deep link, asignar docente, matriz del docente tras recargar, reimportación sin cambios, cancelar, error de conexión + reintento, móvil/tablet. Consola del navegador sin errores.

## Instalar dependencias detrás de un antivirus/proxy

**Síntoma:** `npm install` / `npm ci` falla con `SELF_SIGNED_CERT_IN_CHAIN`.
**Causa (diagnosticada en este equipo):** Kaspersky Endpoint Security inspecciona HTTPS y firma con su propia CA («Kaspersky Endpoint Security Personal Certification Authority»). Windows confía en ella, pero Node usa su almacén interno y rechaza la cadena.
**Solución segura (Node ≥ 22.15 / 24):** que Node use el almacén de certificados del sistema, manteniendo la verificación TLS activa:

```powershell
$env:NODE_USE_SYSTEM_CA = "1"   # solo esta sesión
npm ci                          # en la raíz y en backend/
# Permanente para el usuario (opcional): setx NODE_USE_SYSTEM_CA 1
```

Alternativa equivalente: exportar la CA corporativa a PEM y apuntar `NODE_EXTRA_CA_CERTS` a ese archivo. **No** usar `strict-ssl=false` ni `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Dependencias reales y verificación

Ya no existen sustitutos de prueba (stubs): `jsonwebtoken` 9.0.3, `nodemailer` 9.0.5 y `google-auth-library` 11.0.0 se instalan desde `backend/package-lock.json` (`npm ci`). El frontend añade `typescript` 5.8.3, `@types/react` 18.3.31 y `@types/react-dom` 18.3.7 (fijados) y el script `npm run typecheck`. `auth.integration.test.js` prueba Google OAuth, JWT y permisos con las librerías reales, sin red ni credenciales.
