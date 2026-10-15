# Plan de fortalecimiento del backend de ProySocial

Base: `docs/AUDITORIA_BACKEND_PROYSOCIAL.md` (28 hallazgos: 2 críticos, 5 altos, 14 medios, 7 bajos).
Estado: **propuesta para aprobación**. No se ha modificado ningún archivo del backend, ni datos, ni configuración.

## 1. Principios

1. **Mejorar, no reescribir.** Se conservan los servicios (`matrizService`, `entregableWorkflowService`, `evidenciaService`, importación) y sus contratos.
2. **Datos y seguridad antes que estética.** Primero lo que puede perder o falsear información institucional.
3. **Prueba primero.** En cada bloque se escribe antes una prueba que reproduce el comportamiento actual (caracterización) y luego se corrige hasta que pase la prueba nueva.
4. **Cambios aditivos y compatibles.** Los campos de las respuestas existentes no cambian de nombre ni de significado; lo nuevo se añade. Cuando una regla se vuelve más estricta (de «permitido» a «409»), se avisa explícitamente.
5. **Sin migraciones destructivas.** Las migraciones nuevas son aditivas e idempotentes y no reescriben las 34 existentes.
6. **Un bloque = una rama pequeña y verificable**, con su documento breve, sus pruebas y un criterio de aceptación. Los commits y el *push* los haces tú.
7. **Solo `proysocial_dev`** (o una base de pruebas local); nada de producción ni despliegues.

## 2. Bloques

Esfuerzos en días-persona aproximados, incluyendo las pruebas.

### Bloque 1 — Protección de históricos aprobados y guardas de asignación  ★ RECOMENDADO PRIMERO
**Hallazgos:** CR-02, AL-02, AL-03, AL-04, ME-02.
**Esfuerzo:** 4–5 días · **Riesgo:** bajo-medio · **Cambio de esquema:** ninguno.

**Qué se hace**
1. Un helper común (`services/historicosService.js`) que cuente los entregables **revisados** (aprobados u observados) vinculados a una plantilla, grupo, semestre o docente.
2. **CR-02:** `DELETE /admin/plantillas/:id`, `/grupos-matriz/:id` y `/semestres/:codigo` responden **409 sin opción de forzar** cuando hay revisados; el mensaje indica la alternativa (inactivar el grupo, no eliminar el semestre). Con solo borradores o sin reportes, el flujo actual (con confirmación) se mantiene.
3. **AL-04:** `PUT /admin/plantillas/:id` con reportes vinculados permite únicamente los campos sin efecto en indicadores (texto, instrucciones de evidencia, enlace); bloquea horas, semana, número y fechas con 409 explicativo.
4. **AL-02:** una única validación (grupo activo, mismo tipo) compartida por `PUT /usuarios/:id`, `PUT /docentes/:id/grupo-matriz` y `PUT /docentes/:id/tipo-docente`; si el docente tiene reportes en el grupo actual, la respuesta indica cuántos quedarán fuera de su matriz y exige confirmación explícita.
5. **AL-03:** `DELETE /usuarios/:id` dentro de una transacción; 409 si el docente tiene entregables o evidencias («inactívalo»); `23503` se traduce a 409.
6. **ME-02:** bloqueo consultivo (`pg_advisory_xact_lock`, ya usado en la importación) antes de contar administradores en `PUT`/`DELETE /usuarios/:id`.

**Archivos:** `routes/admin.js` (≈ 8 handlers), nuevo `services/historicosService.js`, nuevo `test/integration/administracion.integration.test.js`.

**Pruebas (fixtures `TST_`, base de desarrollo o de pruebas):** para cada operación, un caso «con aprobado → 409 y datos intactos» y un caso «sin reportes → funciona como hoy»; reasignación con tipo distinto/grupo inactivo; doble desactivación concurrente de administradores (una falla); eliminación de docente con reporte/evidencia.

**Compatibilidad con el frontend:** el frontend ya muestra el mensaje de error del backend. La opción «Eliminar todo» que hoy aparece tras el 409 con `requiere_confirmacion` dejará de ofrecerse cuando el backend responda 409 sin esa marca. No se requiere cambio visual obligatorio.

**Criterios de aceptación:** las 52 pruebas de integración y las 61 unitarias siguen en verde; las nuevas pasan; los hashes de las plantillas y reportes sembrados no cambian; el E2E de Administración (332 comprobaciones) sigue en verde salvo la comprobación de «eliminar con confirmación forzada» de plantillas/grupos/semestres con reportes aprobados, que pasa a esperar el 409 (esos fixtures no tienen aprobados, así que no debería cambiar).

**Reversión:** cada handler es independiente; revertir el commit restaura el comportamiento anterior.

#### Por qué este bloque primero
- Es la única clase de defecto que produce **pérdida irreversible** de información institucional (un reporte aprobado que deja de contarse no se reconstruye).
- Tiene **superficie pequeña**: ~8 handlers, sin migración y sin tocar el modelo; el patrón de protección ya existe y funciona (`DELETE /admin/proyectos/:id`, el importador).
- Es **independiente** de decisiones de modelo (Bloque 6) y de la semántica de métricas (Bloque 2).
- Sus pruebas de caracterización sirven de red de seguridad para todos los bloques siguientes.

*Alternativas consideradas.* «Métricas primero» (Bloque 2) corrige un error visible pero reversible y hoy latente en los datos; «CI primero» (Bloque 4) protege los despliegues pero no corrige datos y requiere coordinar el modo de trabajo. Ambos siguen de cerca.

---

### Bloque 2 — Alcance por semestre en métricas y panel
**Hallazgos:** CR-01, ME-01.
**Esfuerzo:** 2–3 días · **Riesgo:** bajo (aditivo) / medio si cambia el valor por defecto · **Esquema:** ninguno.

**Qué se hace**
1. Parámetro opcional `semestre` en `/admin/metricas` y `/admin/dashboard`, propagado a `loadMatrixForDocentes`.
2. `resumen` acotado por `plantilla → grupo → semestre`; `por_grupo` acotado al semestre; `progreso_semanal` acotado a las iniciativas del rango del semestre.
3. Respuesta aditiva: `alcance: { semestre, criterio }` y `semestre` por fila de `por_grupo`.
4. Rotulado aditivo de las dos definiciones de «reportado» (ME-01) y nota en documentación.
5. (Después) el frontend de Reportes y la bandeja pasan `semestre` explícito.

**Decisión necesaria:** valor por defecto sin parámetro. Recomendado: **semestre activo** (`?semestre=todos` para el comportamiento actual).

**Pruebas:** integración con dos semestres: un docente de un semestre cerrado no afecta al activo; `resumen` coincide con la suma de la bandeja del mismo semestre; los campos existentes se mantienen; `por_grupo` no repite grupos de otros semestres.
**Aceptación:** en el entorno actual las cifras del semestre activo no cambian; con datos de dos semestres, cada alcance muestra solo lo suyo.

---

### Bloque 3 — Endurecimiento HTTP y validación de entradas
**Hallazgos:** ME-03 (manejador), ME-04, ME-08, ME-09, parte de ME-12.
**Esfuerzo:** 3–4 días · **Riesgo:** bajo.

1. Manejador global que respete `status` de `body-parser` (JSON roto → 400, cuerpo grande → 413) y mapee errores de PostgreSQL (`22P02`, `23503`, `23505`, `23514`) a 400/409.
2. Helper de validación numérica/entera con rango y tope de `limit`; aplicar primero a plantillas, proyectos y docentes.
3. Limitador de intentos en memoria (sin dependencias) para `/auth/*`; cabeceras HSTS y CSP compatibles con Google Identity Services.
4. Validación de configuración al arrancar en producción (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, dominio permitido, `PG*`) y TLS verificado para `PGSSL`.
5. Registro JSON mínimo con identificador de petición y manejadores de proceso.

**Pruebas:** JSON roto → 400; cuerpo grande → 413; violación de FK/único → 409; `horas: "abc"` → 400; `limit` mayor que el tope se recorta; superar el límite → 429; arranque en producción sin variable → sale con error claro.
**Aceptación:** el inicio de sesión con Google y los E2E siguen funcionando con las nuevas cabeceras.

---

### Bloque 4 — Compuertas de calidad y operación en producción
**Hallazgos:** AL-05, ME-10, ME-11, ME-14.
**Esfuerzo:** 3–4 días · **Riesgo:** bajo para el código, pero **cambia el flujo de despliegue** (requiere tu autorización).

1. Trabajo previo al despliegue: `tsc`, unitarias y pruebas de integración contra una base efímera creada desde cero (esto verifica de paso **todas las migraciones en una base nueva**).
2. Aprobación manual para producción, copia de seguridad de Cloud SQL antes de migrar, y federación de identidad en lugar de la llave JSON (si la organización lo permite).
3. Verificar en producción que `schema_migrations` contiene las 34 filas **antes** del próximo despliegue.
4. Ajustar `PGPOOL_MAX` al tope real de Cloud SQL, resolver el envío de correos sin depender del proceso web y revisar la memoria frente a la importación.
5. Ejecutar `npm audit --omit=dev` desde una red con la cadena de certificados configurada o desde el CI, y fijar una política de actualizaciones.

**Pruebas:** ejecución completa del flujo en una rama contra un proyecto de staging; base vacía → migrar → esquema esperado; reejecución → todas «Omitida».
**Nota:** no se despliega nada en esta fase; el bloque entrega los archivos y los procedimientos.

---

### Bloque 5 — Auditoría administrativa y cambios de calendario
**Hallazgos:** ME-06, ME-05.
**Esfuerzo:** 3–4 días · **Esquema:** tabla nueva, aditiva.

1. Tabla `auditoria_admin(actor_id, accion, entidad, entidad_id, antes, despues, creado_en)` y registro en altas/bajas/cambios de usuarios, semestres, grupos, plantillas, excepciones y eliminaciones.
2. Evento en `entregable_eventos` cuando una excepción mueve un entregable.
3. `PUT /admin/semestres/:codigo` con reportes: confirmación con el resumen del efecto y registro del cambio de fechas.

**Pruebas:** cada operación escribe un registro con actor y valores; cambio de fecha con reportes → 409 con resumen y luego confirmación.

---

### Bloque 6 — Historia de asignación docente–grupo por semestre
**Hallazgo:** AL-01.
**Esfuerzo:** 4–5 días · **Riesgo:** medio (cambio de modelo, aditivo) · **Requiere aprobar el diseño.**

1. Tabla `docente_grupo_matriz(docente_id, grupo_id, desde, hasta)` y relleno desde `usuarios.grupo_matriz_id`.
2. `loadMatrixForDocentes` toma el grupo del semestre solicitado; `usuarios.grupo_matriz_id` queda como grupo vigente.
3. Importación y reasignación escriben en ambas.

**Pruebas:** docente con reportes en dos semestres; indicadores de cada semestre independientes; migración idempotente; los resultados del semestre actual no cambian.
**Por qué después de 1 y 2:** necesita la red de pruebas del Bloque 1 y el alcance por semestre del Bloque 2. Es prerrequisito de cualquier reporte histórico.

---

### Bloque 7 — Rendimiento
**Hallazgo:** ME-07.
**Esfuerzo:** 1–2 días.

1. Migración aditiva con índices: `usuarios(grupo_matriz_id)`, `plantilla_entregables(grupo_id)`, `proyecto_entregables(docente_id)`, `proyecto_entregables(estado_revision)`.
2. Medir otra vez con una base sintética de ~500 docentes; solo si sigue siendo lento, evaluar un caché corto por semestre **con justificación medida**.

---

### Bloque 8 — Mantenibilidad
**Hallazgos:** ME-03 (separación), BA-01.
**Esfuerzo:** 3–4 días · **Riesgo:** medio · **Solo con las pruebas de los bloques anteriores.**

Dividir `admin.js` en routers por dominio (usuarios, semestres, grupos/plantillas, iniciativas, catálogos, revisión, métricas) **sin cambiar comportamiento** y unificar las utilidades de fecha. Se verifica con las suites existentes y los E2E.

---

### Bloque 9 — Menores
BA-02 a BA-07 (contrato de `cumplimiento_esperado`, comodines de `ILIKE`, `timestamptz` en columnas nuevas, archivos del repositorio, `CHECK` de coherencia de estado, verificación del significado de `numero`). Se agrupan al final porque ninguno afecta a los datos hoy.

## 3. Orden y dependencias

```
B1 ──► B2 ──► B6 ──► B7
 │              ▲
 ├──► B3        │
 ├──► B5 ───────┘ (opcional)
 └──► B4 (en paralelo; independiente del código)
          B8 al final (requiere B1–B3)
          B9 al final
```

Ruta crítica: **B1 → B2 → B6**. B3 y B4 pueden avanzar en paralelo con B2. Total aproximado: **25–32 días-persona**.

## 4. Decisiones que necesito de ti (antes de empezar el Bloque 1)

1. **Política de eliminación con reportes aprobados.** Recomendado: **bloquear siempre** (sin opción de forzar) y ofrecer inactivar/archivar. ¿Confirmas, o prefieres un procedimiento de «archivo» explícito con motivo?
2. **Edición de plantillas con reportes (AL-04).** Recomendado: permitir solo texto, instrucciones de evidencia y enlace; bloquear horas, semana, número y fechas. ¿Algún otro campo que deba seguir editable?
3. **Eliminación de docentes (AL-03).** Recomendado: bloquear si tienen entregables o evidencias y usar «inactivo». ¿Confirmas?
4. **Valor por defecto del alcance en métricas (Bloque 2).** Recomendado: semestre activo.
5. **Producción (Bloque 4).** ¿Existe ya una base de producción? Si es así, necesito que alguien con acceso confirme que `schema_migrations` tiene las 34 filas y la zona horaria de la instancia.
6. **Base de pruebas.** Las pruebas de integración corren hoy sobre `proysocial_dev`. ¿Autorizas crear una base local `proysocial_test` para ellas, o seguimos en `proysocial_dev` con fixtures `TST_`?

## 5. Lo que NO se hará

- Cambiar el mecanismo de autenticación, las fórmulas de avance/vencimiento o el diseño B2.
- Instalar dependencias nuevas (los limitadores y el registro se escriben sin ellas) ni introducir caché sin medición.
- Reescribir o editar migraciones ya aplicadas.
- Tocar datos sembrados, producción o desplegar.

## 6. Cómo se verifica cada bloque

1. Pruebas de caracterización **antes** del cambio (deben pasar con el código actual).
2. Pruebas nuevas del defecto (deben fallar antes y pasar después).
3. `npm test`, `npm run test:integration` y `tsc`/build.
4. Las suites E2E correspondientes, **en serie** y con el ejecutor con control de memoria (`npm run e2e -- <suite>`).
5. Comparación de la línea base de `proysocial_dev` (conteos y estados) antes y después.

## 7. Siguiente paso

Cuando apruebes el orden y respondas las decisiones de la sección 4, empiezo por el **Bloque 1**, escribiendo primero sus pruebas de caracterización.
