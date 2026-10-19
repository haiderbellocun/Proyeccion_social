# Propuesta técnica · Historial docente–grupo (AL-01)

**Estado: PROPUESTA. No se implementó nada** (ni tabla, ni migración, ni cambios de código). Requiere tu decisión sobre las preguntas de la §9 y autorización de esquema.

## 1. Problema
Un docente tiene **un solo grupo** (`usuarios.grupo_matriz_id`). Esa columna dice a qué grupo pertenece *hoy*, pero no a cuáles perteneció. Consecuencias demostradas en los Bloques 1 a 2:
- El semestre de un docente es el de su grupo vigente, así que al pasarlo al grupo del semestre siguiente **desaparece de la población del semestre anterior** (denominador desconocido).
- Los reportes ya hechos sí conservan su semestre (por su plantilla), pero si el docente ya no está en ese grupo no se pueden atribuir a él en los desgloses por docente (`alcance.reportes_fuera_de_matriz_vigente`).
- El Bloque 1 lo contuvo **bloqueando** la reasignación de docentes con reportes (`exigirAsignacionSinHistorico`); eso evita la pérdida, pero también impide el ciclo normal (pasar a un docente al grupo del semestre siguiente).

## 2. Relaciones actuales (verificadas en el código y en `proysocial_dev`)

```
semestres(codigo) ──< grupos_matriz(semestre)         [FK ON UPDATE CASCADE ON DELETE RESTRICT]
grupos_matriz(id) ──< plantilla_entregables(grupo_id)
grupos_matriz(id) ──< usuarios(grupo_matriz_id)       (1 grupo vigente por docente; sin fechas)
plantilla_entregables(id) ──< proyecto_entregables(plantilla_id)   [ON DELETE SET NULL; hoy protegido]
usuarios(id) ──< proyecto_entregables(docente_id)     (único parcial: (docente_id, plantilla_id))
usuarios + plantilla_entregables ──< docente_entregable_excepciones(docente_id, plantilla_id)
grupos_matriz(id) ──< importaciones_matriz(grupo_id, semestre, usuario_id, decisiones JSON)
```
- La matriz parte de `usuarios → grupo vigente → plantillas` (`SQL_MATRIZ`); el reporte se une por `plantilla_id` **y** `docente_id`.
- **Un reporte solo puede crearse si el docente pertenecía al grupo de la plantilla en ese momento** (`registrarDesdeMatriz` exige `u.grupo_matriz_id = tpl.grupo_id`). Esto convierte cada reporte en **evidencia fuerte** de que ese docente estuvo en ese grupo.
- `usuarios` solo tiene `creado_en` y `ultimo_acceso`: **ningún registro de cuándo ni quién cambió el grupo** (no hay auditoría, ME-06).
- Quién escribe `usuarios.grupo_matriz_id`: `PUT /admin/usuarios/:id`, `POST /admin/usuarios`, `PUT /admin/docentes/:id/grupo-matriz`, `PUT /admin/proyectos/:id/docentes` (asigna si estaba vacío) y la importación de matrices (`matrixImportDb`, asignación al confirmar).
- **Datos reales hoy** (`proysocial_dev`): 4 docentes; 3 con grupo vigente; 2 pares (docente, grupo) con reportes, **ninguno distinto del grupo vigente**; 0 docentes con dos grupos en un mismo semestre; 0 excepciones; 0 importaciones. Es decir, hoy **no hay ninguna asignación histórica perdida**; la propuesta es para antes de que ocurra.

## 3. Qué información histórica puede recuperarse y cuál no

| Información | ¿Recuperable? | Fuente / motivo |
|---|---|---|
| Grupo vigente de cada docente | Sí, exacto | `usuarios.grupo_matriz_id` |
| (docente, grupo, semestre) donde el docente **tiene reportes** | **Sí, con evidencia fuerte** | reporte → plantilla → grupo (el flujo exige la pertenencia al crearlo) |
| (docente, grupo) donde existe una **excepción individual** | Probable; **verificar** si el flujo exigía la pertenencia | `docente_entregable_excepciones` |
| Docentes que fueron reasignados y **nunca reportaron** | **No** | Sin reportes, excepciones ni auditoría no queda rastro del grupo anterior |
| Fecha de inicio y fin de cada asignación (`desde`/`hasta`) | **No** | No hay marcas de tiempo; solo el semestre del grupo da una cota (periodo del semestre), no la fecha real del cambio |
| Quién hizo cada cambio | **No** | Sin auditoría |
| Asignaciones hechas por una importación | Parcial | `importaciones_matriz.decisiones` guarda la decisión («reasignar»), no necesariamente el docente |
| Responsable y colaboradores históricos de una iniciativa | No (límite del Bloque 1.2) | Se resuelve con otra tabla de historial |

**Regla de la propuesta: no se reconstruye nada por suposición.** Cada fila de la tabla nueva dice **de dónde sale** (`origen`), y lo que no se puede probar queda **marcado como desconocido**, nunca inferido.

## 4. Diseño propuesto (tabla aditiva)

```sql
CREATE TABLE docente_grupo_matriz (
  id          SERIAL PRIMARY KEY,
  docente_id  INT  NOT NULL REFERENCES usuarios(id)       ON DELETE RESTRICT,
  grupo_id    INT  NOT NULL REFERENCES grupos_matriz(id)  ON DELETE RESTRICT,
  semestre    VARCHAR NOT NULL REFERENCES semestres(codigo) ON UPDATE CASCADE ON DELETE RESTRICT, -- = grupos_matriz.semestre (denormalizado para la restricción)
  desde       TIMESTAMPTZ NULL,        -- NULL = desconocido
  hasta       TIMESTAMPTZ NULL,        -- NULL = vigente o desconocido
  origen      TEXT NOT NULL CHECK (origen IN ('vigente_al_migrar','evidencia_reportes','evidencia_excepciones','asignacion_admin','importacion')),
  creado_por  INT  NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (docente_id, semestre)                 -- un docente, un grupo por semestre (conserva la regla actual, ahora por semestre)
);
CREATE INDEX ON docente_grupo_matriz (grupo_id);
```
- `usuarios.grupo_matriz_id` **se conserva** como «grupo vigente» (compatibilidad con todo el código y el frontend) y la aplicación lo mantiene sincronizado en la misma transacción que escribe la tabla.
- La unicidad `(docente_id, semestre)` evita estados contradictorios; si los datos existentes la violan se **informa** (ver backfill), no se resuelve en silencio.

## 5. Cómo se conservarían las asignaciones anteriores
Cambiar de grupo **nunca** sobrescribe ni borra filas: en un cambio dentro del mismo semestre se cierra la fila (`hasta = now()`) y se abre otra; al pasar al semestre siguiente se **añade** una fila de ese semestre y la del anterior queda intacta. Las FK `ON DELETE RESTRICT` impiden borrar un grupo, un semestre o un docente que figure en el historial (refuerza el Bloque 1 también a nivel de PostgreSQL).

## 6. Qué ocurriría al cambiar un docente de grupo
Todo en una transacción, con `SELECT … FOR UPDATE` sobre el docente y las mismas reglas de orden de bloqueo de `historicosService` (sin interbloqueos nuevos):
1. **Hacia un grupo de otro semestre** (el caso normal de fin de periodo): se agrega la fila del nuevo semestre; el docente conserva su fila y sus reportes del semestre anterior; `usuarios.grupo_matriz_id` pasa al nuevo grupo. **Deja de estar bloqueado** (hoy lo bloquea `exigirAsignacionSinHistorico`).
2. **Dentro del mismo semestre con reportes en el grupo actual:** sigue **bloqueado** (los reportes quedarían fuera de su matriz del semestre). Decisión pendiente (§9).
3. **Dentro del mismo semestre sin reportes:** se cierra y se abre la fila; sin pérdida.
4. **Quitar el grupo:** cierra la fila vigente (`hasta`), no la borra.

## 7. Funcionamiento con varios semestres
- **Matriz de un docente en el semestre S:** `docente_grupo_matriz (docente, S) → grupo → plantillas`, con el reporte unido como hoy (`plantilla_id` y `docente_id`). Sin semestre, el vigente.
- **Métricas por semestre (`/admin/metricas`, `/dashboard`, `/avance-consolidado`):** la población del semestre S son las filas del historial con `semestre = S`, no el grupo vigente. Desaparece `reportes_fuera_de_matriz_vigente`; los docentes sin fila de ese semestre se informan como `sin_evidencia` (no se inventan).
- **Estados:** semestre cerrado ⇒ cumplimiento histórico exacto **para los docentes con fila** (por evidencia o por asignación registrada); para los demás, el denominador sigue siendo desconocido y la respuesta lo dice.

## 8. Backfill propuesto (conservador, idempotente, con vista previa)
1. `vigente_al_migrar`: una fila por docente con grupo vigente (`desde` NULL: no se conoce).
2. `evidencia_reportes`: una fila por cada (docente, semestre) con reportes cuyo grupo **no** sea el vigente. `desde/hasta` NULL.
3. `evidencia_excepciones`: igual con excepciones, **solo si** se confirma que el flujo exigía la pertenencia.
4. **Conflictos** (docente con reportes en dos grupos del mismo semestre, o contradicción con el vigente): no se insertan; se listan en un informe para decisión humana.
5. Todo con `INSERT … ON CONFLICT DO NOTHING` y un *script de vista previa* que imprime conteos por origen y los conflictos **antes** de escribir. **Reversible:** `DROP TABLE` (la aplicación sigue funcionando con `usuarios.grupo_matriz_id`).

## 9. Decisiones que necesito de ti
1. ¿Cambio de grupo **dentro del mismo semestre** con reportes: seguir bloqueado (recomendado) o permitir con confirmación?
2. ¿Se acepta `desde/hasta` = NULL (desconocido) para lo anterior a la migración, en vez de aproximar con las fechas del semestre?
3. ¿Se exige `UNIQUE (docente, semestre)` (un grupo por semestre)? Hoy es la regla de facto.
4. ¿Las excepciones individuales cuentan como evidencia de asignación? (Verificar antes con el código del flujo.)
5. ¿Mantener `usuarios.grupo_matriz_id` como espejo indefinidamente o retirarlo en un bloque posterior?
6. ¿Se registra quién hace cada cambio (`creado_por`)? Es la semilla de la auditoría ME-06.

## 10. Endpoints y pantallas afectados

**Backend (lectura de «el grupo del docente»):** `matrizService.SQL_MATRIZ`/`loadMatrixForDocentes` (núcleo), `semestreAlcance.js`, `GET /admin/docentes`, `GET /admin/usuarios`, `GET /admin/grupos-matriz` y `GET /admin/indicadores-grupo` (conteo de docentes), `GET /admin/semestres` (`num_docentes`), `GET /admin/docentes/:id/{perfil,matriz,matriz-stats}`, `/admin/metricas`, `/admin/dashboard`, `/admin/avance-consolidado`, y en `docente.js` el perfil y la matriz del docente.
**Backend (escritura):** `PUT/POST /admin/usuarios`, `PUT /admin/docentes/:id/grupo-matriz`, `PUT /admin/docentes/:id/tipo-docente` (compatibilidad tipo/grupo), `PUT /admin/proyectos/:id/docentes` (asigna grupo si falta), importación de matrices (`matrixImportDb`), `DELETE /admin/grupos-matriz/:id` y `DELETE /admin/semestres/:codigo` (docentes asignados), y `historicosService` (`exigirAsignacionSinHistorico`, `docentesDeGrupos`).
**Frontend:** Usuarios (editar grupo), Importar matriz (asignar docente), Grupos y Semestres (docentes del grupo), matriz administrativa del docente (selector de semestre), Avance consolidado, Reportes y métricas, Indicadores por grupo, y el perfil/matriz del docente. Cambios mínimos: selector de semestre en la matriz de un docente y mensajes de «sin evidencia».

## 11. Migraciones y pruebas necesarias
- **Una migración aditiva** (p. ej. `fase28_docente_grupo_matriz.sql`): tabla, índices y backfill idempotente; más el script de vista previa. Sin tocar tablas existentes.
- **Pruebas** (en `proysocial_test`): migración desde cero y repetida (idempotencia); backfill contra consultas independientes y casos de conflicto; reasignación entre semestres sin perder reportes; reasignación bloqueada dentro del mismo semestre con reportes; carga de matriz por semestre con un docente movido; métricas de un semestre cerrado que incluyen al docente movido y marcan `sin_evidencia`; concurrencia (reasignar vs reportar) sin interbloqueos; compatibilidad de todas las respuestas actuales; permisos; las protecciones de los Bloques 1 a 1.2; y la suite E2E completa.
- **Esfuerzo estimado:** 3–4 días (migración y backfill 1; servicios y endpoints 1,5; frontend y pruebas 1,5).

## 12. Riesgos
- El historial **empieza** con la migración: lo anterior queda con `desde/hasta` desconocidos. Es una limitación real, no un defecto de la propuesta.
- Docentes reasignados **antes** de la migración sin ningún reporte no se podrán reconstruir (sin evidencia).
- Dos fuentes de verdad (`usuarios.grupo_matriz_id` y la tabla) si no se mantienen en la misma transacción: por eso se propone sincronizarlas siempre juntas y, más adelante, retirar la columna.
- No resuelve por sí sola los responsables y colaboradores históricos de las iniciativas (Bloque 1.2): requiere otra tabla análoga.

## 13. Recomendación
Aprobar el diseño con las decisiones 1–3 como están recomendadas, ejecutar primero el **script de vista previa del backfill en `proysocial_dev`** (solo lectura) y, con su resultado, autorizar la migración. En el estado actual de los datos el backfill sería trivial y sin conflictos.
