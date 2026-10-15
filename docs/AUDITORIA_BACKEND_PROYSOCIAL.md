# Auditoría técnica del backend de ProySocial

Fecha: 15/10/2026 · Alcance: `backend/` (Express + PostgreSQL), esquema y datos de `proysocial_dev`, pruebas existentes, Dockerfile y flujo de despliegue. Auditoría **de solo lectura**: no se modificó código, datos ni configuración.

## 0. Método y límites

**Qué se hizo.** Lectura del código (`index.js`, `db.js`, `middleware/auth.js`, `routes/*`, `services/*`, `scripts/migrate.js`, migraciones, `Dockerfile`, workflow de GitHub). Consultas de **solo lectura** a `proysocial_dev` (esquema, restricciones, índices, invariantes de datos, `EXPLAIN ANALYZE`). Peticiones HTTP inocuas (GET, y POST con datos inválidos) contra el backend local. Cálculo en memoria para medir escalado. Ejecución de las pruebas unitarias en otras zonas horarias.

**Cómo se rotula la evidencia.**
- **[EJECUTADO]** se observó en el sistema en marcha o con una consulta.
- **[CÓDIGO]** / **[ESQUEMA]** se demuestra leyendo el código o el esquema (con archivo y línea).
- **[INFERIDO]** se deduce del código pero no se ejecutó para no escribir datos; se indica qué prueba lo confirmaría.

**No verificado (límites reales).**
- `npm audit` no pudo ejecutarse: el registro respondió «self-signed certificate in certificate chain» (proxy TLS corporativo). No se desactivó la verificación TLS. Las dependencias **no están auditadas**.
- No se aplicaron migraciones sobre una base nueva (no se crean bases en esta fase). La evidencia es indirecta: `proysocial_dev` fue creada con `dev:setup` y tiene las 34 migraciones registradas (ver 2.4).
- No se ejecutaron escrituras de prueba (borrar un usuario, enviar `horas: "abc"`, etc.). Los hallazgos que dependen de ello están marcados **[INFERIDO]**.
- No hay acceso a producción: no se conoce el estado real de su `schema_migrations`, variables, Cloud SQL ni Google OAuth.
- Las pruebas de integración del repositorio no se repitieron en esta fase (se ejecutaron en la etapa anterior: 61 unitarias y 52 de integración, todas correctas).

---

## 1. Resumen ejecutivo

### Evaluación general
El backend es **sólido en lo esencial** y no requiere una reescritura. Las reglas de negocio centrales (estados de entregables, evidencias, semanas y fechas en `America/Bogota`, importación de Excel, autorización por recurso) están bien construidas, concentradas en servicios y cubiertas por pruebas significativas. El esquema de PostgreSQL tiene integridad referencial, restricciones y un índice único parcial que garantiza un solo semestre activo.

Los problemas reales están en **tres zonas concretas**:
1. **Alcance por semestre en las métricas** (`/admin/metricas`, `/admin/dashboard`): mezclan semestres.
2. **Operaciones administrativas destructivas** (eliminar plantilla, grupo, semestre o docente; reasignar grupo) que no aplican la misma protección de históricos que sí aplican el flujo de entregables y el importador.
3. **Preparación para producción**: despliegue automático sin compuertas, sin límite de intentos ni cabeceras HSTS/CSP, validación de entradas incompleta y observabilidad mínima.

### Hallazgos por severidad (28)
| Severidad | Cantidad | Identificadores |
|---|---|---|
| CRÍTICO | 2 | CR-01, CR-02 |
| ALTO | 5 | AL-01 … AL-05 |
| MEDIO | 14 | ME-01 … ME-14 |
| BAJO | 7 | BA-01 … BA-07 |

No se encontró ningún hallazgo de **seguridad** de severidad crítica: la autorización por recurso resiste los intentos de acceso cruzado probados.

### Estado por área
| Área | Estado | Comentario |
|---|---|---|
| Seguridad | **Buena base, con huecos de endurecimiento** | Sesiones y permisos correctos; sin límite de intentos ni HSTS/CSP; validación de entradas desigual |
| PostgreSQL | **Buena** | FK, CHECK, únicos parciales; faltan índices y un modelo de asignación histórica |
| Reglas de negocio | **Buenas en el núcleo, inconsistentes en los bordes** | Las operaciones administrativas no respetan las mismas reglas que el flujo del docente |
| Métricas | **Con defecto de alcance** | CR-01 y ME-01 |
| Pruebas | **Buenas en lo que cubren; huecos en administración y concurrencia** | ME-13 |
| Rendimiento | **Adecuado hoy; recálculo completo por petición** | ME-07 |
| Producción | **No lista sin cambios** | AL-05, ME-08 a ME-12 |

### Recomendación
Empezar por el **Bloque 1: protección de históricos en operaciones destructivas** (CR-02, AL-02, AL-03, AL-04). Ver `docs/PLAN_FORTALECIMIENTO_BACKEND.md`.

---

## 2. Lo que está bien construido (no tocar sin razón)

- **Una sola fuente de verdad para indicadores**: `matrizService.js` (`calcularMetricas`, `clasificarItem`, `estadoEfectivo`) es usado por docente, administración y consolidado. Hay pruebas de que las pantallas coinciden.
- **Flujo de estados** (`entregableWorkflowService.js`): transacción por operación, bloqueo `FOR UPDATE`, máquina de estados explícita (`transicionDocente`, `transicionAdmin`, `transicionReapertura`), historial en `entregable_eventos`, idempotencia ante doble clic, reintento ante violación del índice único.
- **Aprobados protegidos** por la máquina de estados: un aprobado solo se reabre con motivo y administrador identificado.
- **Fechas**: `fechaBogota` con `Intl`, lectura de columnas `DATE` sin desplazar el día, fecha de envío fijada por el servidor. **[EJECUTADO]** Las 61 pruebas unitarias pasan también con `TZ=UTC` y `TZ=Asia/Tokyo`.
- **Autorización por recurso** en `routes/docente.js` con `router.param` (`id`, `docenteId`, `proyectoId`, `entregableId`). **[EJECUTADO]** Con el token de un docente contra otro docente: 15 rutas devolvieron 403; un token con el payload alterado devolvió 401.
- **Sesión**: JWT HS256 con emisor/audiencia, `JWT_SECRET` ≥ 32 caracteres, y el **rol y el estado se consultan en cada petición** (revocación inmediata).
- **Importación de Excel**: lector propio con defensas (tamaño, entradas, bomba ZIP, sin cifrado), validación previa sin escrituras, bloqueo de asesoría `pg_advisory_xact_lock`, transacción, `NOT EXISTS` que impide tocar plantillas con reportes, trazabilidad (`importaciones_matriz`, hash SHA-256).
- **Cola de correos** con `FOR UPDATE SKIP LOCKED`, reintentos con espera exponencial y escape HTML.
- **Aislamiento del acceso de desarrollo** (`devLogin.js`): exige 8 condiciones y vuelve a comprobarlas por petición.
- **Consultas parametrizadas**: las construcciones dinámicas (`SET ${sets}`) usan nombres de columna constantes y parámetros posicionales. No se encontró inyección SQL.
- **Eliminación de iniciativas** con reportes revisados bloqueada (`DELETE /admin/proyectos/:id`): es el patrón que conviene replicar en CR-02.

---

## 3. Arquitectura del backend

| Elemento | Tamaño | Valoración |
|---|---|---|
| `routes/admin.js` | 4.629 líneas, 63 rutas | **Monolito**: validación, SQL y reglas mezcladas |
| `routes/docente.js` | 1.115 líneas | Aceptable; delega en servicios |
| `services/*` | 9 archivos (matriz, flujo, evidencias, importación, correo, notificaciones) | **Bien**: aquí vive la lógica |
| `middleware/auth.js`, `config/devLogin.js`, `db.js`, `index.js` | pequeños | Claros |

Hechos medidos **[CÓDIGO]**:
- En `admin.js` hay 62 bloques `catch`, 55 con `console.error` y `res.status(500)` en línea, y solo 8 usos de `responderError` (el manejador central de `ErrorNegocio`).
- No hay capa de controladores ni validación de esquema compartida: cada ruta valida a mano (`Number()`, `String().trim()`).
- Utilidades de fecha duplicadas: `parseDateOnly` / `daysBetweenDateOnly` en `admin.js` frente a `esFechaISO` / `diferenciaDias` en `matrizService.js`; `toDateOnly` en `auth.js`.

**Qué conservar:** los servicios y su contrato. **Qué cambiar de verdad:** el manejo de errores de `admin.js` y, solo después de tener pruebas, su separación por dominio (ME-03). No se propone introducir frameworks ni una arquitectura nueva.

---

## 4. PostgreSQL (`proysocial_dev`)

### 4.1 Modelo
Tablas principales: `semestres → grupos_matriz → plantilla_entregables`; `usuarios` (con **un único** `grupo_matriz_id`); `proyectos → proyecto_semanas → proyecto_entregables`; `entregable_evidencias`, `entregable_eventos`, `docente_entregable_excepciones`, `importaciones_matriz`, notificaciones y correos.

### 4.2 Integridad (puntos fuertes) **[ESQUEMA]**
- FK con acciones explícitas; `CHECK` de estados (`estado_revision`, `tipo`, `rol`, `tipo_docente`, `tipo_evidencia`), de fechas (`fecha_fin >= fecha_inicio`) y del formato del semestre.
- Índice único parcial `semestres(activo) WHERE activo = true`: **solo puede haber un semestre activo**.
- Únicos que evitan duplicados: `(docente_id, plantilla_id)` en entregables, `(proyecto_id, numero)` en semanas, `(semestre, lower(trim(nombre)))` en grupos, evidencias vigentes por `(entregable_id, url_clave)`, correos de usuario en minúscula.

### 4.3 Invariantes de datos comprobadas **[EJECUTADO]**
Entregables 33 (20 aprobados, 9 enviados, 4 observados); sin entregables sin docente; ningún docente con entregables fuera de su grupo; sin semestres solapados; ninguna plantilla con semana mayor que las del semestre; proyectos con el número de semanas que declaran; sin eventos huérfanos; 33 evidencias vigentes correspondientes a 33 entregables.

### 4.4 Migraciones
Las 34 migraciones del directorio coinciden con la lista de `migrate.js` y están registradas en `schema_migrations`. El ejecutor aplica cada archivo en una transacción y registra el resultado. Ver ME-10 sobre el contenido destructivo de migraciones antiguas.

### 4.5 Índices existentes y faltantes **[ESQUEMA]**
Existen índices por FK en la mayoría de tablas. **Faltan**: `usuarios(grupo_matriz_id)`, `plantilla_entregables(grupo_id)`, `proyecto_entregables(docente_id)` (el existente es parcial y compuesto), `proyecto_entregables(estado_revision)`. Hoy no importan (tablas de cientos de filas); ver ME-07.

### 4.6 Lo que el modelo no soporta bien
- Un docente tiene **un solo** grupo: no hay historia de asignación por semestre (AL-01).
- Los semestres no gobiernan a las iniciativas: `proyectos` y `proyecto_semanas` no tienen columna de semestre; solo se relacionan por fechas. Esto limita cualquier agregado por semestre que parta de iniciativas (CR-01, `progreso_semanal` del dashboard).
- El estado de un entregable se **deriva de varias columnas** (`completado`, `estado_revision`, `url_evidencia`, …) y `estado_revision` admite `NULL`; no hay `CHECK` que vincule combinaciones (BA-07). Hoy los 33 registros son coherentes **[EJECUTADO]**.

---

## 5. Reglas de negocio: consistencia entre servicios y endpoints

| Regla | Dónde se aplica bien | Dónde no se aplica |
|---|---|---|
| Un aprobado no se modifica | Flujo del docente, revisión, evidencias, reedición de cronograma (`entregables-semanales`), importador | Edición y borrado de plantillas, borrado de grupo/semestre, borrado de docente, excepción que mueve un entregable (AL-04, CR-02, AL-03, ME-06) |
| Un docente solo en un grupo **activo y de su mismo tipo** (documentado en `docs/PRODUCCION.md`) | `PUT /admin/usuarios/:id` | `PUT /admin/docentes/:id/grupo-matriz`, `PUT /admin/docentes/:id/tipo-docente` (AL-02) |
| Reportes revisados protegen la iniciativa | `DELETE /admin/proyectos/:id` | Plantillas, grupos y semestres (CR-02) |
| Fórmulas de avance/vencimiento | Única en `matrizService.js` | Dos definiciones de «reportado» en endpoints distintos (ME-01) |

Las fórmulas **no se tocan**: `reportado = enviado + aprobado`, `aprobado = aprobado`, `esperado = exigibles (fecha límite ≤ hoy)`, `brecha = aprobados − exigibles`, vencido solo para no iniciado/borrador/observado con fecha límite < hoy. Están probadas y coinciden entre pantallas. Lo que se propone es **acotarlas por semestre** y **unificar su rotulación**, no cambiarlas.

---

## 6. Auditoría de `/admin/metricas`

### 6.1 Causa exacta **[CÓDIGO + EJECUTADO]**
El endpoint (`routes/admin.js:481`) combina cuatro consultas con alcances distintos y ninguna recibe un semestre:

| Bloque | Cómo se calcula | Alcance real |
|---|---|---|
| `resumen` | `FROM proyecto_entregables` sin `WHERE` de semestre (`admin.js:499`) | **Todos los semestres** |
| `por_mes` | Meses del semestre **activo**; reportes unidos por `fecha_real_entrega`/`fecha_completado` | Solo semestre activo (y solo lo enviado en esas fechas) |
| `por_grupo` | `FROM grupos_matriz ORDER BY nombre` (`admin.js:563`) y miembros desde `loadMatrixForDocentes(client, { hoy })` | **Todos los grupos de todos los semestres** |
| `por_regional`, `top_atrasados` | Sobre todos los docentes que devuelve `loadMatrixForDocentes` sin `semestre` | Todos los docentes, sin importar de qué semestre sea su grupo |

`loadMatrixForDocentes` (`matrizService.js:840`) acepta `semestre` y `grupoId` (filtro `AND ($2::text IS NULL OR gm.semestre = $2)`, línea 728), pero `/admin/metricas` y `/admin/dashboard` lo llaman sin ellos, así que `semestre = NULL` equivale a «todos».

**Evidencia en vivo [EJECUTADO]:** `GET /admin/metricas` devuelve **18 grupos** en `por_grupo`, de los cuales 15 son de 2026A con 0 docentes y 0 entregables, y aparecen nombres repetidos (`Grupo 4 …` de 2026A y `Grupo 4 … (DEV 2026B)`). Es decir, el defecto es visible hoy en esa sección.

**Efecto numérico:** hoy los 4 docentes y los 33 entregables son de 2026B, por lo que `resumen`, `por_regional` y `top_atrasados` coinciden con el semestre activo **por casualidad de los datos**. En cuanto exista un docente con grupo de un semestre cerrado (o entregables de dos semestres):
- sus ítems se calculan contra la fecha de **hoy**, de modo que **todo lo pendiente figura como exigible y vencido** y `top_atrasados`, `por_regional` y el semáforo se inflan;
- `resumen.total_reportes` suma reportes de semestres distintos, y `porcentaje_aprobacion` pierde sentido institucional;
- las tarjetas de la bandeja de revisión (`ReportReview.tsx:222-223`, que usan `resumen.pendientes/con_observaciones/aprobados`) no coincidirán con la lista cuando se filtre por semestre.

### 6.2 Contrato con el frontend
Consumidores de `/admin/metricas`: `ReportsMetrics.tsx` (todas las secciones) y `ReportReview.tsx` (solo `resumen`, para los conteos de la bandeja). `/admin/dashboard` lo consume `AdminDashboard.tsx`. `avance-consolidado` e `indicadores-grupo` ya reciben `semestre` desde el frontend.

### 6.3 Otros endpoints con el mismo problema
- **`/admin/dashboard`** (`admin.js:135`): mismo `loadMatrixForDocentes` sin semestre; además `progreso_semanal` agrupa **todas** las `proyecto_semanas` por número de semana (`admin.js:173`), mezclando iniciativas de cualquier semestre; `proyectos_activos` y los conteos de reportes (`admin.js:162`) son globales.
- **`/admin/avance-consolidado`** e **`/admin/indicadores-grupo`**: correctos cuando se envía `semestre`, pero si se omite devuelven **todos** (el frontend actual siempre lo envía).
- **`/admin/reportes-revision`**: tiene filtro `semestre` correcto (se obtiene por `plantilla → grupo`).

### 6.4 Corrección propuesta compatible
1. Añadir parámetro opcional `semestre` a `/admin/metricas` y `/admin/dashboard`; pasarlo a `loadMatrixForDocentes`; acotar `resumen` por `plantilla_entregables.grupo_id → grupos_matriz.semestre`; acotar `por_grupo` con `WHERE semestre = $1`.
2. Respuesta **aditiva**: nuevo campo `alcance: { semestre, criterio }` y `semestre` en cada fila de `por_grupo`. Ningún campo existente cambia de nombre ni de significado.
3. Decisión pendiente (ver plan): valor por defecto **sin parámetro**. Se recomienda el semestre activo (es lo que el panel ya presupone) con `?semestre=todos` para el comportamiento actual.
4. `progreso_semanal`: acotar a las iniciativas cuyo rango de fechas cae en el semestre solicitado (sin cambiar el esquema).

Pruebas: ver CR-01.

---

## 7. Seguridad

### 7.1 Autenticación y sesiones
- Google OAuth: `verifyIdToken` con audiencia, correo verificado, dominio opcional (`ALLOWED_GOOGLE_DOMAINS`), usuario **preaprobado** en `usuarios`, bloqueo por `FOR UPDATE`, vinculación de `google_sub`. **[CÓDIGO]**
- Sesión: JWT HS256 (emisor, audiencia, `SESSION_TTL` 8 h); el rol/estado se revalidan por petición. **[CÓDIGO]**
- `POST /auth/logout` es un no-op (JWT sin lista de revocación): aceptable por el TTL y la revalidación de rol.
- Acceso de desarrollo: bien aislado (8 condiciones; deshabilitado con `NODE_ENV=production`). **[CÓDIGO + pruebas]**

### 7.2 Autorización
- Todo `/admin` exige `requireRole("admin")`; `/docente` exige docente o administrador y aplica propiedad por recurso. **[EJECUTADO]** 15 sondeos de acceso cruzado y 1 de token alterado: todos rechazados.
- El administrador puede actuar como docente en rutas `/docente` (diseño intencional: `docenteDelEntregable` acepta `docente_id` en el cuerpo solo para administradores).

### 7.3 Validación y sanitización
- SQL parametrizado; correo, URL `https`, fechas `YYYY-MM-DD` validadas. **Pero** la validación numérica es desigual (ME-04) y los errores de cliente a veces terminan en 500 (ME-03).
- El correo electrónico escapa HTML. El proxy de avatar solo acepta `https://*.googleusercontent.com` y bloquea redirecciones.

### 7.4 Cabeceras, CORS, límite de intentos
**[EJECUTADO]** Presentes: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. **Ausentes:** `Strict-Transport-Security` y `Content-Security-Policy`. CORS por lista (`ALLOWED_ORIGIN`); sin lista, no se emite CORS. No hay limitador de intentos en ninguna ruta (ME-08).

### 7.5 Secretos y entorno
- `.env` y `.env.dev` están ignorados por git; **[EJECUTADO]** no hay `.env` en el historial ni secretos en archivos versionados (las claves de las pruebas son literales de prueba).
- En producción los secretos van por Secret Manager (`PGPASSWORD`, `JWT_SECRET`, `SMTP_PASS`). El workflow usa una **llave JSON de cuenta de servicio** (`GCP_SA_KEY`) de larga vida (AL-05).
- Validación de configuración al arrancar: ausente (ME-09).

---

## 8. Rendimiento

### 8.1 Mediciones **[EJECUTADO]** (4 docentes, 364 ítems activos)
| Endpoint | Latencia típica |
|---|---|
| `/admin/avance-consolidado?semestre=2026B` | 180–260 ms |
| `/admin/dashboard` | 47–130 ms |
| `/admin/metricas` | 55–70 ms |
| `/docente/:id/matriz` | 110–165 ms (133 KB) |
| listados paginados, catálogos, semestres | 3–30 ms |

La consulta de la matriz (`SQL_MATRIZ`) tarda **7–57 ms**; `EXPLAIN ANALYZE` muestra `Seq Scan` en tablas pequeñas con una subconsulta `LATERAL` por plantilla (365 iteraciones). El resto es cómputo en Node.

### 8.2 Escalado medido
Mapeo y estadísticas en memoria, **sin SQL**: 3 docentes → 29 ms; 30 → 101 ms; 100 → 262 ms; 300 → **762 ms** (≈ 2,5 ms por docente, lineal). **[INFERIDO]** Con 1.500 docentes sería del orden de 4 s de CPU síncrona por petición a `dashboard`, `metricas` o `avance-consolidado`, que **bloquea el event loop** para todos los usuarios. Extrapolación lineal; no se probó con ese volumen.

### 8.3 Otros puntos
- Sin paginación o sin tope: `/admin/proyectos-semanas` (devuelve todo), `limit` sin máximo en `/admin/docentes` y `/admin/proyectos` (**[EJECUTADO]** `limit=100000` → 200). La bandeja sí limita a 100.
- Sin N+1 evidente: las evidencias y las iniciativas se cargan por lote (`ANY($1::int[])`).
- Importación: archivo en base64 dentro de JSON (hasta 18 MB), re-enviado en cada paso; `inflateRawSync` síncrono hasta 40 MB por entrada. Con 512 Mi de memoria en Cloud Run hay riesgo de presión (ME-11).
- Conexiones: `pg.Pool` con máximo 10 por instancia; Cloud Run permite hasta 10 instancias (ME-11).

No se justifica caché ni nuevas dependencias hoy; ver ME-07.

---

## 9. Pruebas

### 9.1 Qué cubren (61 unitarias y 52 de integración)
- **Muy bien cubierto:** estados y transiciones, aprobados bloqueados, observado→reenvío idempotente, evidencias y versiones, «sin acceso», excepciones justificadas, calendario y semanas, vencimientos, indicadores coherentes entre pantallas, permisos entre docentes, importación/reimportación (con reportes protegidos), clonación de semestre, acceso de desarrollo, sesión manipulada.
- Las pruebas de integración exigen `proysocial_test` o `proysocial_dev` en local y crean datos `TST_*` que limpian.

### 9.2 Escenarios críticos sin cobertura **[CÓDIGO: no existen casos en `backend/test`]**
| Escenario | Estado |
|---|---|
| CRUD administrativo: usuarios (último administrador, autodesactivación), semestres (activar, eliminar), grupos, escuelas/programas | **Sin pruebas de backend** (solo hay E2E de navegador) |
| `/admin/metricas` y `/admin/dashboard` por semestre; datos de dos semestres a la vez | Sin pruebas |
| Edición/borrado de plantillas, grupos y semestres con reportes aprobados | Sin pruebas |
| Reasignación de grupo con reportes; borrado de docente con reportes | Sin pruebas |
| Modificaciones concurrentes de administración (dos administradores a la vez) | Sin pruebas (solo hay concurrencia del flujo de envío) |
| Errores de base de datos (FK, valor inválido) y entradas malformadas (JSON roto, cuerpo grande, números no numéricos) | Sin pruebas |
| Integración con `TZ=UTC` (la de producción) | Solo se probó la parte unitaria |
| Casos límite de calendario con semestre que cruza año o semana 53 | Parcial (semana inexistente y sin calendario sí están) |
| Correos y notificaciones | Scripts manuales (`test:correos`, `test:notificaciones`) fuera de `npm test` |

---

## 10. Preparación para producción

- **Despliegue:** `.github/workflows/deploy-cloud-run.yml` publica en cada `push` a `main`: construye, **ejecuta migraciones**, crea el administrador inicial y despliega, sin tests, tipado, análisis de vulnerabilidades, copia de seguridad ni aprobación (AL-05).
- **Dockerfile:** multi-etapa, `node:22-alpine`, `npm ci`, usuario no root. Sin `HEALTHCHECK` (Cloud Run usa el suyo).
- **`/health`:** comprueba solo conexión a BD y expone si el correo está configurado; devuelve el mensaje de error de BD fuera de producción.
- **Cloud Run:** `--min-instances 0`, `--max-instances 10`, 1 CPU, 512 Mi, `--allow-unauthenticated` (la autenticación es de aplicación). El trabajador de correo corre **dentro** del proceso (ME-11).
- **Migraciones:** ejecutor propio con lista manual; algunas históricas son destructivas (ME-10).
- **Registros:** `console.*` sin estructura ni identificador de petición (ME-12).
- **Zonas horarias:** `proysocial_dev` usa `America/Bogota`; Cloud SQL usa UTC por defecto. El código de fechas es independiente de la zona (probado), pero hay columnas `timestamp without time zone` (BA-05).

---

# 11. Catálogo de hallazgos

Formato: **Problema · Evidencia · Impacto · Riesgo de modificarlo · Solución · Pruebas · Prioridad · Esfuerzo.** Esfuerzo en días-persona aproximados.

## CRÍTICO

### CR-01 · Métricas y panel mezclan semestres
- **Problema.** `/admin/metricas` y `/admin/dashboard` no acotan al semestre (ver sección 6).
- **Evidencia.** `routes/admin.js:481-622` (metricas), `:135-290` (dashboard), `:499`, `:556`, `:563`, `:173`; `matrizService.js:728,840`. **[EJECUTADO]** `por_grupo` devuelve 18 grupos de 2 semestres con nombres repetidos. El efecto numérico en `resumen`/`top_atrasados`/`por_regional` es **latente** (hoy todos los datos son de 2026B) y **[CÓDIGO]** deterministico en cuanto haya un docente de otro semestre.
- **Impacto.** Indicadores institucionales incorrectos y vencidos inflados cuando coexistan semestres; conteos de la bandeja desalineados con su lista.
- **Riesgo de modificarlo.** Bajo si es aditivo. Medio si cambia el valor por defecto sin parámetro (cambian cifras de las pantallas actuales, aunque hacia lo correcto).
- **Solución.** Sección 6.4.
- **Pruebas.** Integración con dos semestres (fixtures `TST_`): mismas cifras por semestre; docente de un semestre cerrado no entra en el activo; `resumen` = suma de la bandeja del mismo semestre; compatibilidad de campos existentes.
- **Prioridad.** 1 (junto a CR-02) · **Esfuerzo.** 2 días.

### CR-02 · Eliminaciones forzadas dejan reportes aprobados huérfanos
- **Problema.** `DELETE /admin/plantillas/:id?forzar=true`, `DELETE /admin/grupos-matriz/:id?forzar=true` y `DELETE /admin/semestres/:codigo?forzar=true` eliminan plantillas aunque haya reportes **aprobados**. Los reportes sobreviven con `plantilla_id = NULL` y **desaparecen de la matriz y de todos los indicadores**, porque estos se construyen desde las plantillas.
- **Evidencia.** `admin.js:4592-4629` (solo cuenta `usos` y acepta `forzar`), `:1693-1748`, `:1155-1259` (cuentan reportes, pero no distinguen revisados); FK `proyecto_entregables.plantilla_id ON DELETE SET NULL` **[ESQUEMA]**; `docs/PRODUCCION.md` lo documenta como comportamiento esperado. En contraste, `DELETE /admin/proyectos/:id` **bloquea** si hay revisados (`admin.js:3357-3430`).
- **Impacto.** Pérdida irreversible, para la coordinación, de historia aprobada en los indicadores; no se registra ningún evento de auditoría. Requiere dos confirmaciones del administrador, pero sin aviso de que lo aprobado dejará de contarse.
- **Riesgo de modificarlo.** Bajo a medio: pasa de «permitido con confirmación» a «bloqueado si hay aprobados/observados». El frontend ya muestra el mensaje del backend (409). Cambia una regla documentada.
- **Solución.** Replicar la regla de proyectos: si existen entregables revisados vinculados, responder 409 sin opción de forzar y ofrecer la alternativa existente (desactivar grupo con `activo = false`, o dejar el semestre). Registrar evento de auditoría en las eliminaciones permitidas.
- **Pruebas.** Integración: borrar plantilla/grupo/semestre con un aprobado → 409 y datos intactos; sin aprobados y con borradores → sigue permitido con confirmación; el hash de las plantillas con reportes no cambia.
- **Prioridad.** 1 · **Esfuerzo.** 1,5 días + decisión de política.

## ALTO

### AL-01 · Sin historia de asignación docente–grupo
- **Problema.** `usuarios.grupo_matriz_id` guarda un solo grupo. Al pasar al docente al grupo del semestre siguiente, sus reportes del semestre anterior permanecen pero **ya no se pueden ver ni agregar** por matriz: `avance-consolidado?semestre=<anterior>` devuelve vacío aunque haya reportes.
- **Evidencia.** **[ESQUEMA]** no existe tabla de asignación; `SQL_MATRIZ` parte de `u.grupo_matriz_id` (`matrizService.js:673-730`). **[EJECUTADO]** `GET /admin/avance-consolidado?semestre=2026A` → 0 docentes. Hoy es consistente porque no se ha cambiado de semestre con docentes reales.
- **Impacto.** Imposible reconstruir indicadores de semestres cerrados por docente; condiciona cualquier reporte histórico (etapa «Reportes»).
- **Riesgo.** Medio: cambio de modelo, pero **aditivo** (tabla nueva + relleno desde `usuarios`).
- **Solución.** Tabla `docente_grupo_matriz(docente_id, grupo_id, desde, hasta)` con relleno inicial; `loadMatrixForDocentes` toma el grupo del semestre pedido. Mantener `usuarios.grupo_matriz_id` como «grupo vigente».
- **Pruebas.** Docente en dos semestres con reportes en ambos; indicadores por semestre independientes; migración idempotente.
- **Prioridad.** 3 · **Esfuerzo.** 3–5 días (requiere aprobar el diseño).

### AL-02 · Reasignación de grupo y de tipo sin las guardas de `PUT /usuarios`
- **Problema.** `PUT /admin/docentes/:id/grupo-matriz` solo comprueba que el grupo exista; `PUT /admin/docentes/:id/tipo-docente` cambia el tipo sin mirar el grupo. `PUT /admin/usuarios/:id` sí exige grupo **activo y del mismo tipo** (documentado en `docs/PRODUCCION.md`).
- **Evidencia.** `admin.js:1879-1918`, `:1805-1830` frente a `:2115-2130`. El importador **sí** pide una decisión cuando el docente ya tiene otro grupo (prueba de integración existente). **[INFERIDO]** (no se ejecutó la reasignación).
- **Impacto.** Docentes en un grupo de tipo distinto o inactivo; cambio de grupo con reportes sin aviso (ver AL-01).
- **Riesgo.** Bajo.
- **Solución.** Extraer la validación a una función compartida y usarla en los tres puntos; devolver el número de reportes que quedarán fuera de la matriz y exigir confirmación explícita.
- **Pruebas.** Tipo distinto → 409; grupo inactivo → 404; con reportes → requiere confirmación.
- **Prioridad.** 1 · **Esfuerzo.** 1 día.

### AL-03 · Eliminar un docente con reportes
- **Problema.** `DELETE /admin/usuarios/:id` no usa transacción y no comprueba reportes. Con reportes sin evidencias, `proyecto_entregables.docente_id` pasa a `NULL` (pierden dueño); con evidencias, la FK `entregable_evidencias.docente_id` (NO ACTION) provoca un error que el manejador convierte en **500 genérico**.
- **Evidencia.** `admin.js:2229-2276`; FK **[ESQUEMA]**. **[INFERIDO]**: la salida exacta no se ejecutó (borraría datos); la prueba de integración la confirmará.
- **Impacto.** Historia sin propietario o error opaco; la comprobación «responsable de iniciativas» y la de último administrador tienen además condición de carrera (ME-02).
- **Riesgo.** Bajo.
- **Solución.** Bloquear con 409 si el docente tiene entregables (indicar «inactívalo»), dentro de una transacción con bloqueo; mapear `23503` a 409.
- **Pruebas.** Docente con reporte → 409; sin actividad → se elimina; evidencias presentes → 409 y no 500.
- **Prioridad.** 1 · **Esfuerzo.** 0,5 día.

### AL-04 · Edición de plantillas con reportes (regla inconsistente con el importador)
- **Problema.** `PUT /admin/plantillas/:id` actualiza horas, semana, fechas, número y texto aunque haya reportes (incluidos aprobados). El importador, en cambio, usa `NOT EXISTS (SELECT 1 FROM proyecto_entregables …)` y se niega.
- **Evidencia.** `admin.js:4497-4590` (sin consulta de usos) frente a `matrixImportDb.js` (`UPDATE … WHERE NOT EXISTS`). **[CÓDIGO]**
- **Impacto.** Cambia retroactivamente horas programadas, fechas límite, vencidos y entregas tardías de reportes ya aprobados; las horas y fechas de la plantilla alimentan los indicadores.
- **Riesgo.** Medio: algunas ediciones (corregir texto o enlace) son legítimas y comunes. Hay que definir qué campos se permiten.
- **Solución.** Con reportes vinculados, permitir solo campos sin efecto en métricas (`descripcion_evidencia`, `enlace_referencia`, texto) y bloquear horas/semana/fechas/número con 409 explicativo; o exigir motivo y registrar evento.
- **Pruebas.** Plantilla con aprobado: cambiar horas → 409; cambiar enlace → 200; sin reportes → como hoy.
- **Prioridad.** 2 · **Esfuerzo.** 1 día + decisión sobre campos.

### AL-05 · Despliegue a producción sin compuertas
- **Problema.** Cada `push` a `main` ejecuta migraciones y despliega a producción sin pasos de calidad, copia de seguridad ni aprobación, con una llave JSON de cuenta de servicio de larga vida.
- **Evidencia.** `.github/workflows/deploy-cloud-run.yml` (pasos: construir → migrar → bootstrap → desplegar). No hay `npm test`, `tsc` ni análisis de vulnerabilidades. Credencial `GCP_SA_KEY`. **[CÓDIGO]**
- **Impacto.** Un commit defectuoso (o una migración destructiva) llega directo a producción.
- **Riesgo.** Bajo para el código; requiere coordinación porque cambia el modo de trabajo.
- **Solución.** Trabajo de compuerta (tipado, pruebas unitarias, integración contra una base efímera), entorno protegido con aprobación manual, copia de seguridad de Cloud SQL antes de migrar y, si es viable, federación de identidad en lugar de llave JSON.
- **Pruebas.** Ejecución del flujo en una rama de prueba contra un proyecto de staging.
- **Prioridad.** 2 · **Esfuerzo.** 2 días.

## MEDIO

### ME-01 · Dos definiciones de «reportado» y conteos globales en la bandeja
- **Problema.** `/admin/metricas.resumen.total_reportes` cuenta todo entregable con `completado = true` (incluye **observados**: 33), mientras `/admin/dashboard.stats.reportes_enviados` cuenta aprobados + enviados (29) y la matriz define `reportado = enviado + aprobado`.
- **Evidencia.** **[EJECUTADO]** 33 frente a 29 con los mismos datos; `admin.js:162-166` frente a `:482-494`; `ReportReview.tsx:222` usa el resumen global para los conteos de la bandeja.
- **Impacto.** Cifras «de reportes» distintas entre pantallas; `% aprobación = 60,6 %` (sobre 33) frente a 69 % si se mide sobre enviados+aprobados.
- **Riesgo.** Bajo si solo se rotula y documenta; medio si se redefine.
- **Solución.** No cambiar fórmulas: renombrar/rotular (`reportes_con_envio` vs `reportados_vigentes`) en la respuesta de forma aditiva y fijar el criterio en la documentación.
- **Pruebas.** Prueba de contrato que compare ambas fuentes y documente la diferencia.
- **Prioridad.** 2 (con CR-01) · **Esfuerzo.** 0,5 día.

### ME-02 · Carrera en «debe permanecer un administrador activo»
- **Problema.** `PUT` y `DELETE /usuarios/:id` bloquean solo la fila del usuario objetivo. Dos administradores que se desactivan mutuamente a la vez pueden dejar **cero** administradores activos (cada uno ve al otro activo). `DELETE` ni siquiera usa transacción.
- **Evidencia.** `admin.js:2052-2105` y `:2229-2276` **[CÓDIGO]**; no se ejecutó la carrera.
- **Impacto.** Bloqueo de la administración (recuperable con `bootstrap-admin`).
- **Riesgo.** Bajo.
- **Solución.** Tomar un `pg_advisory_xact_lock` (como ya hace el importador) o bloquear el conjunto de administradores antes de contar.
- **Pruebas.** Dos peticiones concurrentes → una recibe 409.
- **Prioridad.** 3 · **Esfuerzo.** 0,5 día.

### ME-03 · Monolito `admin.js` y errores de cliente que terminan en 500
- **Problema.** 4.629 líneas con manejo de errores en línea; el manejador global responde siempre 500.
- **Evidencia.** **[EJECUTADO]** JSON malformado y cuerpo > 1 MB en `/auth/google` devuelven **500** `{"error":"Error interno"}` (deberían ser 400 y 413). `admin.js`: 55 `console.error` en línea frente a 8 usos de `responderError`. `index.js:123-126`.
- **Impacto.** Diagnóstico difícil, ruido en los registros, clientes que no distinguen error propio de error del servidor.
- **Riesgo.** Bajo para el manejador; medio para separar por dominio.
- **Solución.** (1) El manejador global debe respetar `err.status`/`err.type` de `body-parser` y mapear errores de PostgreSQL (`22P02`, `23503`, `23505`, `23514`) a 400/409. (2) Adoptar `responderError` de forma gradual. (3) Dividir `admin.js` por dominio **solo** con pruebas de caracterización.
- **Pruebas.** JSON roto → 400; cuerpo grande → 413; violaciones de FK/único → 409.
- **Prioridad.** 2 · **Esfuerzo.** 1 día (manejador) + 3–4 días (separación).

### ME-04 · Validación de entradas y paginación
- **Problema.** Valores numéricos con `Number(...)` sin comprobar `NaN`; `semana_numero` sin validar contra el semestre en `PUT /plantillas/:id`; `limit` sin tope; `/proyectos-semanas` sin paginar.
- **Evidencia.** `admin.js:4552-4553` (`Number(b.horas)`, `Number(b.semana_numero)`), `:884-887` y `:2417-2420` (sin `Math.min`). **[EJECUTADO]** `limit=100000` → 200 en `/admin/docentes` y `/admin/proyectos`. El efecto de `horas: "abc"` es **[INFERIDO]** (error de PostgreSQL → 500).
- **Impacto.** 500 en lugar de 400; respuestas arbitrariamente grandes (solo administradores).
- **Riesgo.** Bajo.
- **Solución.** Helper de validación compartido (entero/decimal con rango) y tope de `limit` (p. ej. 100 o 500 según endpoint).
- **Pruebas.** Entradas inválidas → 400; `limit` mayor que el tope → se recorta.
- **Prioridad.** 3 · **Esfuerzo.** 1 día.

### ME-05 · Cambiar las fechas de un semestre recalcula retroactivamente
- **Problema.** Las fechas de cada entregable son `semestre.fecha_inicio + dias_*_desde_feb`. `PUT /admin/semestres/:codigo` puede mover `fecha_inicio` aun con reportes: cambian vencimientos y la clasificación de entregas tardías de todos los docentes, sin aviso ni registro.
- **Evidencia.** `admin.js:1081-1153` (solo valida el número máximo de semanas); `matrizService.js:673-700` (fechas calculadas).
- **Impacto.** Resultados que cambian sin rastro.
- **Riesgo.** Medio: es una operación legítima al corregir un calendario.
- **Solución.** Si hay reportes, exigir confirmación con el resumen del efecto (cuántos entregables cambian de estado de vencimiento) y registrar el cambio.
- **Pruebas.** Cambiar fecha con reportes → 409 con resumen; confirmación → se aplica y queda registro.
- **Prioridad.** 3 · **Esfuerzo.** 1 día.

### ME-06 · Sin auditoría de acciones administrativas
- **Problema.** Solo se auditan entregables (`entregable_eventos`), importaciones y actualizaciones masivas. Altas, bajas y cambios de usuarios, semestres, grupos, plantillas y excepciones no dejan rastro. La excepción individual puede **mover un entregable aprobado** de iniciativa/semana (`UPDATE proyecto_entregables SET proyecto_semana_id`) sin evento.
- **Evidencia.** `admin.js:3838-4020` (línea 3999); no existe tabla de auditoría **[ESQUEMA]**.
- **Impacto.** Imposible reconstruir quién cambió qué en operación institucional.
- **Riesgo.** Bajo (tabla aditiva).
- **Solución.** Tabla `auditoria_admin(actor_id, accion, entidad, entidad_id, antes, despues, creado_en)` y registro en las operaciones destructivas y de configuración; evento en `entregable_eventos` al mover un entregable.
- **Pruebas.** Cada operación escribe un registro con actor y valores.
- **Prioridad.** 3 · **Esfuerzo.** 2–3 días.

### ME-07 · Recálculo completo por petición e índices faltantes
- **Problema.** `dashboard`, `metricas` y `avance-consolidado` cargan y calculan **todos** los docentes en cada llamada, de forma síncrona. Faltan índices por FK en `usuarios(grupo_matriz_id)`, `plantilla_entregables(grupo_id)` y por estado de entregable.
- **Evidencia.** Sección 8: 2,5 ms de CPU por docente (medido), 762 ms para 300 docentes; **[ESQUEMA]** índices ausentes.
- **Impacto.** Hoy ninguno; a escala institucional, latencia de segundos y bloqueo del proceso.
- **Riesgo.** Bajo para los índices; medio para cualquier caché.
- **Solución.** (1) Acotar por semestre (CR-01 ya reduce la carga). (2) Índices en una migración aditiva. (3) Medir de nuevo; solo si hace falta, un caché de TTL corto por semestre. No se propone infraestructura nueva.
- **Pruebas.** Prueba de carga sintética en `proysocial_test` con ~500 docentes.
- **Prioridad.** 4 · **Esfuerzo.** 1–2 días.

### ME-08 · Sin límite de intentos y sin HSTS/CSP
- **Problema.** No hay limitador en `/auth/google` ni en el resto; faltan `Strict-Transport-Security` y `Content-Security-Policy`.
- **Evidencia.** **[EJECUTADO]** cabeceras de `/health`; `package.json` sin dependencia de limitación; 40 intentos seguidos al endpoint de inicio de sesión no recibieron ningún 429 (en dev responde 503 por no tener `GOOGLE_CLIENT_ID`).
- **Impacto.** Fuerza bruta/abuso sobre un endpoint público (mitigado por la verificación criptográfica de Google y la preaprobación de usuarios); navegador sin directiva de contenido.
- **Riesgo.** Bajo.
- **Solución.** Limitador en memoria (sin dependencias) para rutas `/auth/*`; HSTS y una CSP compatible con el frontend servido; revisar que Google Identity Services siga funcionando.
- **Pruebas.** Superar el límite → 429; cabeceras presentes; inicio de sesión sigue funcionando.
- **Prioridad.** 3 · **Esfuerzo.** 1 día.

### ME-09 · Configuración sin validación al arrancar
- **Problema.** `JWT_SECRET` y `GOOGLE_CLIENT_ID` se comprueban en la primera petición (503), no al iniciar; `ALLOWED_GOOGLE_DOMAINS` es opcional (si falta, cualquier cuenta Google **ya preaprobada por correo** puede entrar); `PGSSL=true` usa `rejectUnauthorized: false`; no hay `engines` en `package.json`.
- **Evidencia.** `middleware/auth.js:7-14`, `routes/auth.js:49-56`, `db.js:15-17`. **[CÓDIGO]**
- **Impacto.** Un despliegue mal configurado «arranca» sano y falla al usarse.
- **Riesgo.** Bajo.
- **Solución.** Validación temprana de configuración en producción (fallar al iniciar); exigir dominio en producción; certificado verificado cuando se use TLS.
- **Pruebas.** Arranque con variable ausente en `NODE_ENV=production` → sale con error claro.
- **Prioridad.** 3 · **Esfuerzo.** 0,5 día.

### ME-10 · Migraciones: contenido destructivo y verificación en base nueva
- **Problema.** Migraciones históricas ejecutan `DELETE FROM plantilla_entregables; DELETE FROM grupos_matriz;` y siembran datos (`fase4_seed_grupos_plantillas.sql`), borran usuarios/proyectos/programas de demostración (`fase13…`) y recrean plantillas de grupos fijos (`fase7_*`). La lista de archivos de `migrate.js` es manual.
- **Evidencia.** `migrations/fase4_seed_grupos_plantillas.sql:12-13`, `fase13_google_auth_sin_password.sql:8-27`, `fase7_*.sql`; `scripts/migrate.js:7-42`. Seguras mientras `schema_migrations` contenga sus nombres. **[EJECUTADO]** 34/34 registradas en `proysocial_dev`.
- **Impacto.** Si `schema_migrations` se perdiera o se ejecutaran contra una base poblada sin registro, destruirían datos. Una base nueva recibe 15 grupos y sus plantillas como datos maestros (intencional, pero acoplado al esquema).
- **Riesgo.** Alto si se reescriben migraciones ya aplicadas: **no hacerlo**.
- **Solución.** No tocar las existentes; (1) verificar en producción que las 34 filas existen antes del próximo despliegue; (2) para nuevas migraciones, regla: aditivas e idempotentes; (3) añadir al CI la creación de una base nueva y la ejecución de todas las migraciones; (4) detectar migraciones fuera de la lista.
- **Pruebas.** CI: base vacía → migrar → esquema esperado; reejecución → «Omitida» en todas.
- **Prioridad.** 2 · **Esfuerzo.** 1 día.

### ME-11 · Operación en Cloud Run
- **Problema.** (a) 10 instancias × 10 conexiones = hasta 100 conexiones a Cloud SQL (según el tamaño de instancia puede exceder el máximo). (b) El trabajador de correo es un `setInterval` en el proceso: con `min-instances 0` y CPU solo durante peticiones, los correos pueden demorarse. (c) 512 Mi con importaciones de hasta 18 MB en base64 y descompresión de hasta 40 MB por entrada.
- **Evidencia.** `db.js:32` (`PGPOOL_MAX` 10), workflow (`--max-instances 10 --memory 512Mi --min-instances 0`), `index.js:52,62-64`, `xlsxReader.js` límites. **[CÓDIGO]**
- **Impacto.** Agotamiento de conexiones bajo carga; correos tardíos; reinicios por memoria al importar.
- **Riesgo.** Bajo (ajustes de configuración).
- **Solución.** Ajustar `PGPOOL_MAX` al tope real de Cloud SQL; mover el envío a un Cloud Scheduler/Job que invoque `emails:process` o configurar CPU siempre asignada; subir memoria o limitar el tamaño de importación.
- **Pruebas.** Prueba de importación del archivo máximo con el límite de memoria; verificación de entrega de correos con instancia a cero.
- **Prioridad.** 3 · **Esfuerzo.** 1 día.

### ME-12 · Observabilidad y salud
- **Problema.** Solo `console.*` (sin nivel ni identificador de petición), sin registro de peticiones, sin `unhandledRejection`/`uncaughtException`, `/health` mide solo la BD.
- **Evidencia.** `index.js` y todas las rutas **[CÓDIGO]**.
- **Impacto.** Difícil seguir un incidente real.
- **Riesgo.** Bajo.
- **Solución.** Registro JSON mínimo (Cloud Logging lo interpreta) con identificador de petición y duración; manejadores de proceso; `/health` (viva) y verificación de migraciones pendientes (lista) por separado.
- **Pruebas.** Una petición produce una línea de registro con id y estado; error no controlado queda registrado.
- **Prioridad.** 4 · **Esfuerzo.** 1 día.

### ME-13 · Huecos de pruebas (ver sección 9.2)
- **Problema.** Sin pruebas de backend para administración, alcance por semestre, concurrencia administrativa, errores de BD/entradas y integración en UTC.
- **Evidencia.** Listado de 113 pruebas revisado; no hay casos para esas áreas.
- **Impacto.** Los hallazgos CR-01, CR-02, AL-02…04 y ME-02 no los habría detectado ninguna prueba.
- **Riesgo.** Ninguno.
- **Solución.** Una prueba de integración por hallazgo, escrita **antes** de corregir (pruebas de caracterización) dentro de cada bloque del plan.
- **Prioridad.** Transversal · **Esfuerzo.** incluido en cada bloque.

### ME-14 · Dependencias sin auditar
- **Problema.** No se pudo ejecutar `npm audit` (TLS interceptado). Dependencias de ejecución del backend: `express`, `cors`, `dotenv`, `google-auth-library`, `jsonwebtoken`, `nodemailer`, `pg`.
- **Evidencia.** Salida de `npm audit`: «self-signed certificate in certificate chain».
- **Impacto.** Desconocido.
- **Riesgo.** Ninguno.
- **Solución.** Ejecutar la auditoría desde una red con la cadena de certificados corporativa configurada (`NODE_EXTRA_CA_CERTS`) o desde el CI, y fijar una política de actualizaciones.
- **Pruebas.** `npm audit --omit=dev` sin vulnerabilidades altas/críticas.
- **Prioridad.** 2 · **Esfuerzo.** 0,25 día.

## BAJO

| ID | Hallazgo | Evidencia | Solución | Esfuerzo |
|---|---|---|---|---|
| BA-01 | Utilidades de fecha duplicadas (`parseDateOnly`/`daysBetweenDateOnly` en `admin.js`; `toDateOnly` en `auth.js`; equivalentes en `matrizService.js`) | `admin.js:84-102`, `auth.js:14`, `matrizService.js:98-110` | Unificar en `matrizService.js` con pruebas existentes | 0,5 día |
| BA-02 | `cumplimiento_esperado` devuelve 100 cuando no hay fechas exigibles (`?? 100`), lo que un cliente puede leer como «100 % cumplido» (la pantalla docente ya lo corrige) | `matrizService.js:316` | Devolver `null` y dejar que el cliente rotule «sin vencimientos»; cambio de contrato: avisar | 0,25 día |
| BA-03 | `plantilla_entregables.numero` no es único por grupo: 175 pares `(grupo, numero)` repetidos, 145 con semanas distintas | **[EJECUTADO]** consulta de duplicados | Confirmar con negocio si es intencional; no hay riesgo hoy | 0,25 día |
| BA-04 | La búsqueda `ILIKE '%' || ? || '%'` no escapa `%` ni `_` | `admin.js:700` | Escapar comodines | 0,25 día |
| BA-05 | Columnas `timestamp without time zone` (`revisado_en`, `creado_en`…) con `NOW()`; consistentes mientras la zona de la BD y del proceso coincidan (en Cloud Run, UTC en ambos) | **[ESQUEMA]** | Para nuevas columnas usar `timestamptz` | 0,25 día |
| BA-06 | Dos libros de Excel institucionales y un archivo temporal de Office (`~$…xlsx`) versionados en la raíz | `git ls-files` | Moverlos a almacenamiento de documentos o a `backend/ejemplos` ignorado; eliminar el temporal | 0,1 día |
| BA-07 | El estado se deriva de varias columnas y `estado_revision` admite `NULL`; sin `CHECK` de coherencia (p. ej. aprobado ⇒ `completado` y `aprobado_en`) | **[ESQUEMA]**; **[EJECUTADO]** los 33 registros actuales son coherentes | Añadir `CHECK` no validado + `VALIDATE` tras revisar datos de producción | 0,5 día |

---

## 12. Riesgos para producción (resumen)

1. **Despliegue sin compuertas** y migraciones automáticas (AL-05, ME-10).
2. **Pérdida de historia aprobada** por operaciones administrativas (CR-02, AL-03, AL-04).
3. **Indicadores mezclados** al coexistir semestres (CR-01).
4. **Falta de límite de intentos y de cabeceras HSTS/CSP** (ME-08).
5. **Configuración no validada al arrancar** (ME-09) y **conexiones/memoria** de Cloud Run (ME-11).
6. **Sin auditoría administrativa** (ME-06) ni observabilidad (ME-12).
7. **Dependencias sin auditar** (ME-14).
