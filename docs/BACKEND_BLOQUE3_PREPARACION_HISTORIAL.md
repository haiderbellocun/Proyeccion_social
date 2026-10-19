# Backend · Bloque 3A — Preparación del historial docente–grupo (AL-01)

**Estado: PREPARACIÓN. No se aplicó ninguna migración, no se modificó el esquema y no se escribió ningún dato de desarrollo.** Todo lo ejecutado fue de solo lectura (`proysocial_dev`) o dentro de una transacción revertida (`proysocial_test`). Hay una decisión de arquitectura pendiente tuya antes de implementar (§1).

Complementa [PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md](PROPUESTA_HISTORIAL_DOCENTE_GRUPO.md). Al releerla con un prototipo encontré **un defecto propio** que cambia el modelo recomendado:

> **Corrección a la propuesta anterior.** Su §4 exigía `UNIQUE (docente_id, semestre)`, pero su §5–§6 decía que un cambio dentro del mismo semestre «cierra la fila y abre otra», es decir, **dos filas del mismo docente y semestre**. Se contradicen: la unicidad por semestre **impide** representar un cambio legítimo de grupo dentro del periodo (demostrado: la inserción falla con `dgm_v1_docente_id_semestre_key`). El modelo recomendado ahora es el de **vigencias** (§2), que no pierde información.

## 1. Las decisiones que necesito de ti

Las seis del §9 de la propuesta más dos que surgieron del análisis (7 y 8). **No las tomé.** Para cada una: la decisión, las alternativas, mi recomendación, ventajas y riesgos, efecto sobre lo histórico y compatibilidad.

### Decisión 1 — Cambio de grupo dentro del mismo semestre cuando ya hay reportes en el grupo actual
| | |
|---|---|
| **Decisión** | ¿Se permite mover a un docente a otro grupo **del mismo semestre** si ya reportó en el grupo actual? (Sin reportes siempre se permite: la fila se cierra y se abre otra.) |
| **Alternativas** | **A.** Seguir bloqueado (regla actual del Bloque 1). **B.** Permitir con confirmación: los reportes quedan en el grupo anterior y la matriz del semestre sería la **unión** de ambos grupos. **C.** Permitir solo moviendo también sus reportes (reescribe historia). |
| **Recomendación** | **A.** |
| **Ventajas / riesgos** | A: el denominador del docente en el semestre sigue siendo un solo grupo; no cambia ninguna fórmula; riesgo: rigidez ante una asignación equivocada (se resolvería con un flujo excepcional auditado, futuro). B: cubre el error de asignación, pero obliga a redefinir la población y los esperados (la unión duplica entregables «esperados» de dos grupos): cambia las fórmulas del Bloque 2. C: viola la protección histórica. |
| **Efecto en lo histórico** | A: ninguno. B: los reportes antiguos conservan su grupo pero entran en una matriz combinada. C: destruye atribución. |
| **Compatibilidad** | A es idéntica al comportamiento actual (`exigirAsignacionSinHistorico`), que solo se **relaja** para cambios hacia otro semestre. |

### Decisión 2 — Fechas de inicio/fin de las asignaciones anteriores a la migración
| | |
|---|---|
| **Decisión** | ¿Se aceptan `desde`/`hasta` desconocidos (`NULL`) para lo anterior a la migración? |
| **Alternativas** | **A.** `NULL` = desconocido. **B.** Aproximar con las fechas del semestre. **C.** Usar `usuarios.creado_en` como inicio. |
| **Recomendación** | **A.** |
| **Ventajas / riesgos** | A: honesto, no inventa; riesgo: dos filas del mismo semestre sin fechas no se pueden ordenar (se marcan **ambiguas**, §2). B/C: fechas plausibles pero **inferidas** que se leerían como hechos (un cambio a mitad de semestre quedaría como si fuera de inicio a fin). |
| **Efecto en lo histórico** | Las métricas por semestre no usan esas fechas (usan el semestre del grupo), así que A no cambia ninguna cifra. |
| **Compatibilidad** | Total: ninguna pantalla lee fechas de asignación hoy. |

### Decisión 3 — Unicidad del modelo
| | |
|---|---|
| **Decisión** | ¿Qué restricción gobierna las asignaciones? |
| **Alternativas** | **A.** `UNIQUE (docente, semestre)` (propuesta inicial). **B.** Vigencias con **un solo grupo vigente por docente**. **C.** Vigencias con un vigente **por docente y semestre** (permite pre-asignar al semestre siguiente mientras corre el actual). |
| **Recomendación** | **B.** |
| **Ventajas / riesgos** | A: **descartada**, no soporta el cambio dentro del semestre (§2, escenario 2). B: conserva la regla actual (un grupo vigente), representa cambios dentro y entre semestres, y se puede ampliar a C después cambiando solo el índice parcial. C: más flexible, pero obliga a definir qué grupo es «el vigente» del espejo y si el docente reporta en dos grupos a la vez (ver Decisión 8). |
| **Efecto en lo histórico** | A y B conservan todo; A impide registrar parte del historial legítimo. |
| **Compatibilidad** | B mantiene `usuarios.grupo_matriz_id` con el mismo significado. |

### Decisión 4 — ¿Las excepciones individuales prueban la asignación?
| | |
|---|---|
| **Hecho verificado** | `POST …/docentes/:id/plantillas/:plantillaId/excepcion` hace `INNER JOIN usuarios … u.grupo_matriz_id = tpl.grupo_id`: **solo se crea si el docente pertenece en ese momento al grupo**, igual que un reporte. |
| **Alternativas** | **A.** Sí, como evidencia demostrable (`origen = evidencia_excepciones`). **B.** No: solo reportes. **C.** Sí, pero marcadas «requiere revisión». |
| **Recomendación** | **A**, guardando el conteo en `evidencia` (JSON). |
| **Ventajas / riesgos** | A: recupera asignaciones que un reporte no prueba; riesgo: datos creados por versiones anteriores del código sin esa guarda (no verificable desde el dato). Mitigación: la vista previa las lista aparte; en `proysocial_dev` hay **0** excepciones. |
| **Efecto en lo histórico** | A añade filas históricas (nunca quita ni modifica). |
| **Compatibilidad** | Ninguna: son filas nuevas. |

### Decisión 5 — `usuarios.grupo_matriz_id`
| | |
|---|---|
| **Decisión** | ¿Qué papel tendrá la columna actual? |
| **Alternativas** | **A.** Espejo indefinido. **B.** Espejo durante la transición y retiro planificado. **C.** Retirarla ya (derivarla de la tabla). |
| **Recomendación** | **B.** |
| **Ventajas / riesgos** | B: cero cambios en los lectores actuales (78 apariciones de la columna en 5 archivos del backend; ver §5) y reversión sencilla; riesgo: dos fuentes de verdad → se escribe **siempre** desde un único servicio, en la misma transacción, y una consulta de deriva lo vigila (§4). C: más limpio, pero es un cambio amplio que no se debe mezclar con la migración. |
| **Efecto en lo histórico** | Ninguno. |
| **Compatibilidad** | B: total (API y frontend actuales sin cambios). |

### Decisión 6 — Registro de quién, cuándo y por qué
| | |
|---|---|
| **Alternativas** | **A.** Columnas en la propia fila (`creado_por`, `cerrado_por`, `cerrado_en`, `motivo_cierre`). **B.** Tabla de auditoría general (ME-06) más adelante. **C.** Nada. |
| **Recomendación** | **A** ahora; B como bloque propio. |
| **Ventajas / riesgos** | A: trazabilidad inmediata del historial de asignaciones, protegida por trigger; no cubre otras acciones administrativas (por eso B después). |
| **Efecto en lo histórico** | Lo anterior a la migración queda sin autor (`NULL`, desconocido). |
| **Compatibilidad** | Ninguna. |

### Decisión 7 (nueva) — Población de un semestre cerrado
| | |
|---|---|
| **Decisión** | ¿Quién cuenta en un semestre cerrado? |
| **Alternativas** | **A.** Todo docente con una asignación demostrada en ese semestre (incluye a quien salió sin reportar). **B.** Solo quien estaba vigente al cierre o tiene reportes. **C.** A, informando aparte a los retirados. |
| **Recomendación** | **C** (A con transparencia: `alcance` indica cuántos docentes de la población fueron retirados antes del cierre, cuando se conozca la fecha). |
| **Ventajas / riesgos** | A/C: no esconde incumplimientos reales; riesgo: infla el denominador con alguien que salió temprano (por eso C lo declara). B: excluye personas por una inferencia de fechas que muchas filas no tendrán (`desde/hasta` NULL). |
| **Efecto en lo histórico** | Define los denominadores de los semestres cerrados desde ahora. |
| **Compatibilidad** | Las fórmulas no cambian; cambia **quién** entra en la población (hoy: el grupo vigente). |

### Decisión 8 (nueva) — Pre-asignación al semestre siguiente
| | |
|---|---|
| **Decisión** | ¿Se podrá asignar a un docente al grupo del semestre siguiente mientras el actual sigue en curso? |
| **Alternativas** | **A.** No: el cambio ocurre al cerrar el periodo (como hoy). **B.** Sí (modelo C de la Decisión 3). |
| **Recomendación** | **A** en este bloque. |
| **Ventajas / riesgos** | A: sin ambigüedad sobre dónde reporta el docente (hoy el reporte exige `usuarios.grupo_matriz_id = plantilla.grupo_id`). B: más cómodo para coordinación, pero cambia la regla de reporte y el espejo. |
| **Efecto en lo histórico** | Ninguno. |
| **Compatibilidad** | A: total. |

## 2. Modelo recomendado y verificación de escenarios

### 2.1 Modelo (vigencias; no implementado)
```sql
CREATE TABLE docente_grupo_matriz (
  id            BIGSERIAL PRIMARY KEY,
  docente_id    INT  NOT NULL REFERENCES usuarios(id)      ON DELETE RESTRICT,
  grupo_id      INT  NOT NULL REFERENCES grupos_matriz(id) ON DELETE RESTRICT,
  vigente       BOOLEAN NOT NULL DEFAULT false,
  desde         TIMESTAMPTZ NULL,            -- NULL = desconocido
  hasta         TIMESTAMPTZ NULL,            -- NULL con vigente=false = cerrada sin fecha conocida
  origen        TEXT NOT NULL CHECK (origen IN ('vigente_al_migrar','evidencia_reportes','evidencia_excepciones','asignacion_admin','importacion')),
  evidencia     JSONB NULL,                  -- p. ej. {"reportes":21,"aprobados":14,"excepciones":0}
  creado_por    INT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_por   INT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  cerrado_en    TIMESTAMPTZ NULL,
  motivo_cierre TEXT NULL,
  CONSTRAINT dgm_vigente_sin_hasta CHECK (NOT vigente OR hasta IS NULL),
  CONSTRAINT dgm_periodo_valido    CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde)
);
CREATE UNIQUE INDEX uq_dgm_un_vigente     ON docente_grupo_matriz (docente_id) WHERE vigente;
CREATE UNIQUE INDEX uq_dgm_sin_duplicados ON docente_grupo_matriz (docente_id, grupo_id, COALESCE(desde, '-infinity'::timestamptz));
CREATE INDEX ix_dgm_grupo ON docente_grupo_matriz (grupo_id);
-- Trigger BEFORE UPDATE OR DELETE: no se borra; solo se cierra (vigente, hasta, cerrado_*); una fila cerrada no se reabre ni se modifica.
```
- **Sin columna `semestre`:** el semestre sale de `grupos_matriz.semestre` (sin denormalizar: no hay riesgo de inconsistencia).
- **Sin extensiones:** no se usa una restricción de exclusión (`btree_gist`) porque exigiría `CREATE EXTENSION` y **no puedo asumir** ese privilegio en Cloud SQL (el usuario local es superusuario; el de producción es desconocido). El no solapamiento se vigila en el servicio, bajo bloqueo del docente.
- **Fila efectiva de un docente en el semestre S:** la vigente; si no, la de mayor `hasta` conocida. **Ambigua** (no se elige ninguna) si hay más de una fila en S y alguna cerrada no tiene `hasta` conocido.

### 2.2 Escenarios (prototipo ejecutado en `proysocial_test` dentro de una transacción **revertida**)
`backend/scripts/historial-docente-grupo-prototipo.js` — **13 comprobaciones OK**, y tras el `ROLLBACK` no queda tabla, usuario ni semestre.

| Escenario | ¿Lo soporta? | Cómo |
|---|---|---|
| Docente con grupo en 2026B y otro en 2027A | **Sí** | Se cierra la fila de 2026B y se abre la de 2027A; ambas permanecen; la efectiva de cada semestre es la suya |
| Docente reasignado durante un mismo semestre | **Sí con vigencias; NO con `UNIQUE(docente,semestre)`** | Dos filas del mismo semestre (una cerrada con `hasta`, otra vigente); la efectiva es la última y no es ambigua. El modelo inicial falla con `dgm_v1_docente_id_semestre_key` |
| Docente inactivo con historial | **Sí** | El estado (`usuarios.estado`) y la asignación son cosas distintas: inactivar no toca las filas; el docente no se puede borrar (FK) |
| Docente que deja de tener grupo vigente | **Sí** | La fila se **cierra** (no se borra) y sigue figurando en su semestre; `usuarios.grupo_matriz_id` pasa a `NULL` |
| Grupo archivado que conserva entregables | **Sí** | `activo=false` no afecta las filas; el grupo no se puede borrar (FK `RESTRICT`) |
| Docente con reportes de un semestre anterior | **Sí** | Fila `evidencia_reportes` en ese semestre + fila vigente en el actual; sin duplicados (índice por docente, grupo y `desde`) |
| Asignaciones ambiguas | **Se detectan** | Dos grupos del mismo semestre sin fechas, o evidencia en dos grupos con uno vigente sin fecha de inicio → `ambigua`; el cambio con fechas conocidas **no** lo es |
| Periodos anteriores | **Protegidos** | El trigger impide borrar, reasignar a otro grupo y reabrir/modificar una fila cerrada; el `CHECK` impide vigencias incoherentes |

> **Hallazgo para la implementación:** una FK `ON DELETE RESTRICT` falla con el código **`23001`** (`restrict_violation`), no `23503`. Los manejadores actuales de `DELETE` solo traducen `23503` a 409; los nuevos deben traducir **ambos**.

## 3. Vista previa del backfill (solo lectura)
Script: `backend/scripts/historial-docente-grupo-preview.js` (transacción `READ ONLY`: PostgreSQL rechaza cualquier escritura; verificado). **No asigna nada por coincidencia de fechas, nombres ni semestre.**

### 3.1 Qué se considera demostrable y qué no
| Categoría | Criterio | Uso en el backfill |
|---|---|---|
| **Demostrable** | Grupo vigente (`usuarios.grupo_matriz_id`); reporte (`proyecto_entregables.docente_id` + `plantilla_id` → grupo): el código solo lo permite si el docente pertenecía al grupo; excepción individual (misma guarda) | Se asigna |
| **Corroborada** | Además la respaldan eventos y evidencias del flujo (derivados de los reportes) | Informativa; no es una fuente nueva |
| **Conflicto** | Evidencia en dos o más grupos de un mismo semestre; reportes con docente pero **sin plantilla** (no atribuibles a un grupo) | **No se asigna**: informe para decisión humana |
| **Inferida (no se usa)** | Cualquier grupo deducido por fechas, nombres, semestre «más probable», creación del usuario | **Nunca** |
| **No reconstruible** | Docentes sin grupo vigente y sin ninguna evidencia; semestres sin población demostrable | Se dejan sin fila y se informa |

### 3.2 Resultado en `proysocial_dev`
| Medida | Valor |
|---|---|
| Docentes / con grupo vigente / inactivos | 4 / 3 / 0 |
| **Asignaciones recuperables con certeza** | **3** (todas en 2026B) |
| — vigente confirmada por reportes (deducida de relación explícita) | 2 (María → grupo 16: 21 reportes, 14 aprobados; Carlos → grupo 17: 12 reportes, 6 aprobados) |
| — vigente sin reportes ni excepciones (solo el dato vigente) | 1 (Andrés → grupo 18) |
| — históricas distintas del grupo vigente | **0** |
| Corroboradas por eventos/evidencias | 2 |
| **Conflictos** | **0** |
| **No reconstruibles** | 1 docente (Laura Gómez: sin grupo y sin evidencia) y el semestre **2026A** (15 grupos, sin población demostrable) |
| Excepciones / importaciones | 0 / 0 |
| Filas que crearía el backfill / duplicados evitados | 3 / 0 |
| **Requieren revisión manual** | ninguna |
| Docentes y grupos afectados | 3 docentes (ids 2, 3, 4) y 3 grupos (16, 17, 18) |

Conclusión: en el estado real actual el backfill es **trivial, sin conflictos y sin pérdida**; no hay hoy ninguna asignación histórica perdida (por eso conviene hacerlo **antes** de que ocurra).

### 3.3 Validación de la herramienta con casos difíciles (fixtures sintéticos en `proysocial_test`, eliminados)
| Caso | Resultado de la herramienta |
|---|---|
| Docente con grupo vigente en 2085B y reportes en un grupo archivado de 2085A | Dos asignaciones demostrables: vigente (grupo + reportes) e **histórica** (reportes) |
| Docente con reportes en **dos grupos del mismo semestre** | **Conflicto** `dos_grupos_en_un_semestre`: no se asigna |
| Reporte con docente pero **sin plantilla** | **Conflicto** `reportes_sin_plantilla_no_atribuibles_a_un_grupo` |
| Docente con solo una **excepción** en un grupo distinto del vigente | Asignación histórica por `excepciones` |
| Docente sin grupo y sin evidencia | **No reconstruible** |
| Grupo archivado con reportes | Se informa (la FK impide borrarlo; no es un conflicto) |
| Intento de escritura dentro de la transacción de la herramienta | **Rechazado** por PostgreSQL |

### 3.4 Riesgos de duplicación y cómo se evitan
1. Un mismo par docente–grupo aparece en varias fuentes (vigente + reportes + excepciones): se **fusiona en una fila** (la evidencia se suma en `evidencia`); en dev, 2 de las 3 filas tienen más de una fuente.
2. Reejecución de la migración: índice único `(docente, grupo, COALESCE(desde))` + `ON CONFLICT DO NOTHING` ⇒ idempotente.
3. Dos filas vigentes: imposible por el índice parcial único.
4. Varias estancias en el mismo grupo (A→B→A): permitidas porque `desde` difiere; las del backfill tienen `desde` `NULL` y por eso solo habrá una por par.

## 4. Diseño de la migración (no ejecutada)

### 4.1 Archivo y mecánica
`migrations/fase28_docente_grupo_matriz.sql` y su nombre añadido a la lista `migrationFiles` de `scripts/migrate.js`. El ejecutor corre **cada archivo en una transacción** y lo registra en `schema_migrations`: tabla, índices, trigger y backfill son **atómicos** (si algo falla, no queda nada). **Atención:** el flujo de despliegue actual ejecuta las migraciones en cada push a `main` (AL-05); la migración **no debe llegar a `main`** sin copia de seguridad verificada y sin haber corrido la vista previa en producción (solo lectura) por quien la administra.

### 4.2 Contenido
1. `CREATE TABLE IF NOT EXISTS` (§2.1), índices, función y trigger de protección.
2. **Backfill idempotente en tres pasos**, solo con lo demostrable:
   - `vigente_al_migrar`: una fila vigente por docente con grupo (`desde` `NULL`), con su `evidencia` fusionada (reportes/excepciones del mismo grupo).
   - `evidencia_reportes` / `evidencia_excepciones`: una fila **cerrada sin fecha** (`vigente=false`, `hasta NULL`) por cada (docente, grupo) con evidencia **distinto** del vigente.
   - Los **conflictos no se insertan**: se escriben en un informe (tabla temporal o salida del script) para decisión humana.
3. Verificación final dentro de la misma transacción: nº de filas vigentes = nº de docentes con grupo; cada `usuarios.grupo_matriz_id` coincide con su fila vigente; si no, **aborta** (`RAISE EXCEPTION`).

### 4.3 Conservar `usuarios.grupo_matriz_id`
Se conserva como «grupo vigente». Un **único servicio** (`asignacionDocenteService.cambiarGrupo`) escribe tabla y espejo **en la misma transacción**, con `SELECT … FOR UPDATE` del docente y el orden de bloqueos de `historicosService` (sin interbloqueos nuevos), y mapea `23505` (vigente duplicado) y `23001`/`23503` a 409. Una consulta de **deriva** (`usuarios.grupo_matriz_id IS DISTINCT FROM asignación vigente`) se ejecuta en las pruebas y como verificación operativa. Se evita un trigger inverso (usuarios → tabla): ocultaría la lógica y perdería `creado_por`/`motivo`.

### 4.4 Proteger periodos anteriores, registrar cambios y vigencias
- Trigger: sin `DELETE`; solo se **cierra** (`vigente`, `hasta`, `cerrado_*`); una fila cerrada no se reabre; `docente_id`, `grupo_id`, `desde`, `origen` y `creado_*` son inmutables.
- FK `RESTRICT`: un docente, un grupo o un semestre con historial no se eliminan (refuerza el Bloque 1 en PostgreSQL).
- Regla de servicio: no se crean ni cierran asignaciones sobre grupos de un semestre ya terminado (salvo el backfill).
- Cada cambio guarda quién (`creado_por`/`cerrado_por`), cuándo y el motivo.

### 4.5 Restricciones e índices evaluados
| Elemento | Decisión |
|---|---|
| Índice único parcial `(docente_id) WHERE vigente` | Sí: garantiza un solo grupo vigente incluso ante carreras |
| Índice único `(docente_id, grupo_id, COALESCE(desde,…))` | Sí: sin duplicados y cubre la búsqueda por docente |
| Índice `(grupo_id)` | Sí: conteo de docentes por grupo y FK |
| Exclusión de solapamiento (`btree_gist`) | **No** (dependencia de privilegios en Cloud SQL); se valida en servicio |
| Columna `semestre` denormalizada | **No** (se deriva del grupo) |
| Índices adicionales | No: tablas de cientos de filas (ME-07) |

### 4.6 Fases de despliegue y reversión
| Fase | Qué se hace | Reversión |
|---|---|---|
| **0. Previa** (tú) | Copia de seguridad verificada; vista previa en producción (solo lectura); confirmar versión de PostgreSQL | — |
| **A. Migración** | Tabla + backfill; el código **no la usa** todavía | `DROP TABLE docente_grupo_matriz` (nada depende de ella); la aplicación sigue con `usuarios.grupo_matriz_id` |
| **B. Doble escritura** | Todas las rutas que asignan pasan por el servicio (tabla + espejo) | Volver al código anterior y **re-sincronizar** con el script idempotente (reconstruye las filas vigentes desde `usuarios`); el espejo siempre es válido |
| **C. Lecturas por semestre** | `SQL_MATRIZ` y las métricas usan la fila efectiva; se relaja el bloqueo de reasignación entre semestres | Interruptor/despliegue anterior: las lecturas vuelven al grupo vigente; la tabla se conserva |
| **D. Retiro del espejo** | Bloque posterior, con autorización propia | No forma parte de este plan |

En ninguna fase hasta la D se pierde información: la reversión siempre es posible porque `usuarios.grupo_matriz_id` permanece correcto.

### 4.7 Compatibilidad
API y frontend actuales **sin cambios** hasta la fase C; los campos de respuesta se mantienen; `alcance.reportes_fuera_de_matriz_vigente` pasa a 0 y se añaden contadores de `sin_evidencia`/`ambigua`.

## 5. Impacto funcional (qué cambia exactamente)
Las fórmulas del Bloque 2 **no cambian**; cambia solo **quién pertenece a un semestre** y **de qué grupo** es la matriz de un docente en él. Sin pantallas nuevas.

| Área | Cambio requerido |
|---|---|
| **Matrices de docentes** (`docente.js`: perfil y matriz) | Sin semestre: igual (grupo vigente). Con `?semestre=`: matriz de la fila efectiva (API; la pantalla del docente no cambia) |
| **Matrices administrativas** (`/admin/docentes/:id/{matriz,matriz-stats,perfil}`) | Parámetro opcional `?semestre=` (fila efectiva); selector mínimo con el componente existente **solo si lo apruebas** (puede quedar solo en API) |
| **Dashboard administrativo** | `loadMatrixForDocentes(…, { semestre })` usa la fila efectiva del semestre; `semestreAlcance` deja de usar el grupo vigente; desaparece `reportes_fuera_de_matriz_vigente` |
| **Avance consolidado** | Misma carga; población = docentes con fila efectiva en el semestre; `docentes_sin_grupo` → `sin_evidencia` |
| **Indicadores y métricas** (`/metricas`, `/indicadores-grupo`) | Población por grupo desde el historial; `num_docentes` por grupo = filas vigentes (hoy) o efectivas (por semestre); `por_grupo` sin cambio de forma |
| **Asignación y reasignación** | `PUT /admin/docentes/:id/grupo-matriz` y `PUT /admin/usuarios/:id` → servicio único; `exigirAsignacionSinHistorico` solo bloquea cambios **dentro del mismo semestre con reportes** (Decisión 1) |
| **Administración de usuarios** | `POST /admin/usuarios` (fila inicial); `DELETE /admin/usuarios/:id` (el historial bloquea la eliminación: «inactívalo»); `PUT …/tipo-docente` valida contra el grupo vigente |
| **Importador Excel** | `matrixImportDb`: la asignación de docente al confirmar pasa por el servicio (`origen = importacion`, `creado_por` = quien importa); la advertencia `DOCENTE_REASIGNADO` deja de alarmar cuando el cambio es entre semestres |
| **`PUT /admin/proyectos/:id/docentes`** | La asignación de grupo si falta pasa por el servicio |
| **Consulta de semestres anteriores** | `/admin/{metricas,dashboard,avance-consolidado}?semestre=` ya existen: ahora exactas para docentes con fila; los demás se informan (`sin_evidencia`) |
| **Eliminación de grupos y semestres** | `docentesDeGrupos`/`historicoDeGrupos` cuentan filas del historial (cualquier fila bloquea) |
| **`historicosService`** | `historicoDeUsuario`/`historicoDeAsignacion` incorporan las filas; nueva función de servicio de asignación |

Archivos tocados (estimado): `matrizService.js` (SQL_MATRIZ), `semestreAlcance.js`, `historicosService.js`, `matrixImportDb.js`, `admin.js` (≈ 6 rutas), `docente.js` (2 lecturas), servicio nuevo, `scripts/migrate.js`, una migración; frontend: mensajes y, opcionalmente, un selector en la matriz administrativa.

## 6. Pruebas propuestas (`proysocial_test`)
| # | Caso | Verifica |
|---|---|---|
| 1 | Asignación inicial | `POST` usuario y `PUT` grupo crean una fila vigente y actualizan el espejo en la misma transacción; deriva = 0 |
| 2 | Cambio de semestre | Cerrar 2026B y abrir 2027A: ambas filas; reportes de 2026B intactos; ya no bloqueado |
| 3 | Reasignación dentro del semestre | Sin reportes: permitido (2 filas); con reportes: 409 `HISTORICO_PROTEGIDO` (Decisión 1) |
| 4 | Consulta histórica | `?semestre=` de un semestre cerrado incluye al docente movido, con su grupo de entonces y sus reportes |
| 5 | Histórico sin grupo reconstruible | Docente sin fila en el semestre → `sin_evidencia`, nunca un grupo inferido |
| 6 | Dos cambios administrativos concurrentes | Dos `PUT` simultáneos: un solo vigente (índice único), el otro recibe 409 limpio; sin interbloqueo ni 500 |
| 7 | Asignaciones ambiguas | Fixtures del backfill con conflicto → no se insertan y se informan; en consulta, `ambigua` en vez de elegir |
| 8 | Inactivación docente | El historial y la población de los semestres cerrados no cambian |
| 9 | Grupos con reportes aprobados | No se pueden eliminar (FK + `historicoDeGrupos`); archivar conserva todo |
| 10 | Ausencia de duplicación de métricas | Con varias filas por docente (cambio dentro del semestre) cada entregable cuenta una sola vez; totales = consultas SQL independientes |
| 11 | Migración | Desde cero y repetida (idempotencia); backfill = conteos independientes; aborta si el espejo no coincide |
| 12 | Protección | Trigger: sin `DELETE`, sin reabrir, sin cambiar docente/grupo; `CHECK` de vigencias |
| 13 | Compatibilidad y regresión | Todas las respuestas actuales (contrato), permisos, protecciones de los Bloques 1 a 2, y **todas las suites E2E** |
| 14 | Errores | `23001` y `23503` → 409 en eliminaciones |

## 7. Esfuerzo y riesgos
**Esfuerzo (días-persona):** migración y backfill con pruebas 1,5 · servicio de asignación y rutas (doble escritura) 2 · lecturas por semestre y métricas 2 · relajar reasignación + importador 1 · frontend (mensajes, selector opcional) 0,5 · pruebas de integración/E2E y documentación 1,5. **Total ≈ 8–9 días** (mi estimación anterior de 3–4 era insuficiente al incluir la doble escritura y el importador). Se puede entregar por fases A→C (§4.6).

| Riesgo | Mitigación |
|---|---|
| La migración se ejecuta sola en producción al integrar en `main` (AL-05) | No integrarla sin copia verificada y vista previa en producción; considerar un paso manual |
| Dos fuentes de verdad (tabla y espejo) | Servicio único, misma transacción, consulta de deriva, aborto de la migración si no coinciden |
| El historial empieza con la migración: lo anterior queda con `desde/hasta` desconocidos | `NULL` explícito; nunca se aproxima (Decisión 2) |
| Docentes reasignados **antes** sin reportes ni excepciones no se reconstruyen | `sin_evidencia` visible; no se inventan |
| Versión de PostgreSQL y privilegios en Cloud SQL desconocidos | El diseño no usa extensiones ni sintaxis reciente; confirmar la versión en producción |
| Códigos de error `23001` vs `23503` | Traducir ambos |
| Cambios de población en semestres cerrados (Decisión 7) | Declararlos en `alcance`; sin cambiar fórmulas |
| Responsables y colaboradores de iniciativas siguen sin historial (Bloque 1.2) | Tabla análoga en un bloque posterior |

## 8. Lo ejecutado en este bloque
- **Solo lectura:** `backend/scripts/historial-docente-grupo-preview.js` sobre `proysocial_dev` (transacción `READ ONLY`).
- **Transacciones revertidas en `proysocial_test`:** el prototipo del modelo y los fixtures de validación de la vista previa (eliminados). `to_regclass('docente_grupo_matriz')` = `NULL` en ambas bases; 19 tablas y 34 migraciones, sin cambios.
- **Archivos nuevos:** `backend/scripts/historial-docente-grupo-preview.js`, `backend/scripts/historial-docente-grupo-prototipo.js` y este documento. No se modificó ningún archivo existente ni el diseño B2; no se tocó producción.
- **Estado de las bases:** `proysocial_dev` en su línea base (5 usuarios, 2 semestres, 18 grupos, 2032 plantillas, 10 iniciativas, 33 entregables [20/9/4], 33 evidencias, 57 eventos; sin residuos); `proysocial_test` aislada y sin fixtures.

## 9. Siguiente paso
Detenido. **Necesito tu respuesta a las ocho decisiones de la §1** (recomendadas: 1-A, 2-A, 3-B, 4-A, 5-B, 6-A, 7-C, 8-A) y tu autorización explícita para implementar la fase A (migración y backfill) y, después, B y C.
