# Bloque 1 — Lógica de seguimiento

Fuente única de las reglas: `backend/src/services/matrizService.js` (puro, sin BD).
Consultas y operaciones transaccionales: `backend/src/services/matrizRepo.js`.
Las rutas `docente.js` y `admin.js` solo orquestan; ninguna calcula indicadores por su cuenta.

## Estados de un entregable
`no_iniciado` → `borrador` → `enviado` (en revisión) → `observado` ↔ `enviado` → `aprobado`.

* **Vencido no es un estado**: es una condición calculada (`fecha_fin < hoy` y estado `no_iniciado`, `borrador` u `observado`). Un `enviado` o `aprobado` nunca está vencido.
* Un observado se corrige (se conserva el estado) y se reenvía.
* Un aprobado no puede modificarse por ninguna ruta del docente ni del administrador; solo `POST /admin/reportes-revision/:id/reabrir` (administrador identificado + motivo ≥ 10 caracteres) lo devuelve a revisión.
* `completado` es una columna histórica: ya no basta por sí sola; el estado efectivo sale de `estadoEfectivo()`.

## Indicadores (misma fórmula en todas las pantallas)
| Indicador | Definición |
|---|---|
| Avance reportado | entregables `enviado` + `aprobado` (no borradores, no observados) |
| Avance aprobado | solo `aprobado` |
| Avance esperado | entregables exigibles: `fecha_fin <= hoy` |
| Brecha | aprobados − esperados (negativa = atraso) |
| Cumplimiento exigible | % de exigibles ya aprobados |
| Semáforo | cumplimiento *reportado* sobre lo exigible: ≥ 80 verde, ≥ 50 amarillo, < 50 rojo (`SEMAFORO_UMBRALES`) |

El día de la fecha límite el entregable es exigible pero todavía no está vencido.
El semáforo usa lo reportado (no lo aprobado) para no penalizar al docente por la cola de revisión.
Alias históricos conservados: `completados` = reportados, `avance_global` = % reportado.

## Fechas
* Zona `America/Bogota`; «hoy» lo calcula el backend (`hoyBogota`) y viaja en las respuestas (`hoy`, `semana_actual`).
* Calendario por semestre en `calendario_semestres` (inicio + número de semanas). Si un semestre aún no tiene fila se usa 2026-02-10 / 16 semanas y se marca `calendario_por_defecto: true`.
* Las fechas de calendario viajan como `YYYY-MM-DD` (`to_char`), sin pasar por `Date` del servidor.
* Fecha real de entrega: no puede ser futura (hora de Bogotá). Primer envío / último envío / reenvíos: `fecha_primer_envio`, `fecha_ultimo_envio`, `num_envios` y la tabla `entregable_eventos`.

## Evidencias
Por plantilla (`plantilla_entregables.tipo_evidencia`): `drive`, `formulario`, `enlace`, `ninguna` (o `requiere_evidencia = false`).
Si es NULL se infiere: «no implica realizar cargue» → ninguna; en otro caso cualquier enlace http(s) (no se obliga a Drive).
Excepción justificada: `justificacion_exencion` (≥ 10 caracteres), queda visible para el administrador.

## Asociación con iniciativas
`proyecto_entregables.plantilla_id` enlaza explícitamente con la plantilla; la iniciativa es `proyecto_semanas.proyecto_id`.
Lectura: se prioriza `plantilla_id`; las filas históricas sin él siguen emparejándose por semana + texto (compatibilidad).
Escritura: si el docente tiene varias iniciativas candidatas, el backend no adivina: responde `409 INICIATIVA_AMBIGUA` con los candidatos y espera `proyecto_id`. Índice único `(plantilla_id, proyecto_semana_id)` evita duplicados.

## Migración (ejecutar ANTES de desplegar el backend)
`backend/migrations/fase10_bloque1_seguimiento.sql` — aditiva e idempotente (sin DROP/DELETE). Crea `calendario_semestres` (siembra 2026A), columnas nuevas en `proyecto_entregables` y `plantilla_entregables`, la tabla `entregable_eventos` y rellena solo columnas nuevas vacías de registros ya enviados/aprobados. Cargar el calendario real de cada semestre:

```sql
INSERT INTO calendario_semestres (semestre, fecha_inicio, num_semanas) VALUES ('2026B', DATE '2026-08-03', 16);
```

## Pruebas
* Sin servicios externos: `cd backend && npm test` (reglas puras + operaciones con BD simulada).
* Requieren una BD de pruebas con las migraciones (aún no automatizadas, el esquema base de `proyectos`/`proyecto_semanas`/`proyecto_entregables` no está en `migrations/`):
  1. `GET /docente/:id/matriz` tras crear, enviar, observar, reenviar y aprobar un entregable: los contadores `reportados/aprobados` cambian como en la tabla de arriba.
  2. Docente con dos iniciativas del mismo tipo: `POST …/completar` sin `proyecto_id` → 409; con `proyecto_id` → registra en la iniciativa elegida.
  3. Doble `POST …/completar` simultáneo → una sola fila (índice único) y `num_envios = 1`.
  4. Comparar `/admin/avance-consolidado` con `/docente/:id/matriz-stats` para el mismo docente: mismos números.
  5. Fechas con el servidor en UTC y en America/Bogota: `fecha_fin_calculada` idéntica.
