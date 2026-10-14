# Bloque 1 — Lógica de seguimiento (integrado sobre `main`)

Fuente única de reglas: `backend/src/services/matrizService.js` (fechas, estados, indicadores, evidencias,
transiciones, carga de la matriz). Escrituras transaccionales: `backend/src/services/entregableWorkflowService.js`.
Las rutas `docente.js` y `admin.js` solo orquestan; ninguna calcula indicadores por su cuenta.

## Estados de un entregable
`no_iniciado` → `borrador` → `enviado` (en revisión) → `observado` ↔ `enviado` → `aprobado`.

* **Vencido no es un estado**: es una condición calculada (`fecha_fin < hoy` y estado `no_iniciado`, `borrador` u `observado`). Un `enviado` o `aprobado` nunca está vencido.
* Un observado se corrige (conserva el estado) y se reenvía; reenviar dos veces no duplica el envío.
* Un aprobado no se modifica por ninguna ruta; solo `POST /admin/reportes-revision/:id/reabrir` (administrador + motivo ≥ 10 caracteres) lo devuelve a revisión.
* `completado` es una columna histórica: el estado efectivo sale de `estadoEfectivo()`. Filas antiguas con `estado_revision='enviado'` por DEFAULT pero sin envío real se interpretan como `no_iniciado`.

## Indicadores (misma fórmula en todas las pantallas)
| Indicador | Definición |
|---|---|
| Avance reportado | `enviado` + `aprobado` (no borradores, no observados) |
| Avance aprobado | solo `aprobado` |
| Avance esperado | exigibles: `fecha_fin <= hoy` |
| Brecha | aprobados − esperados (`brecha_entregables`); en puntos porcentuales `brecha` / `brecha_pct` |
| Cumplimiento exigible | % de exigibles ya aprobados |
| Semáforo | cumplimiento *reportado* sobre lo exigible: ≥ 80 verde, ≥ 50 amarillo, < 50 rojo |

El día de la fecha límite es exigible pero todavía no vencido. Alias históricos de `main` conservados:
`completados` = reportados, `porcentaje_real` = % reportado, `avance_global` = % reportado.

## Fechas y calendario
* Zona `America/Bogota`; «hoy» lo calcula el backend y viaja en las respuestas (`hoy`, `semana_actual`).
* El calendario es la tabla `semestres` de `main` (inicio, fin, número de semanas). **No hay fecha de respaldo**: sin semestre configurado las fechas quedan sin definir y `semana_actual.estado = "sin_calendario"` con una advertencia.
* Las fechas de calendario viajan como `YYYY-MM-DD` (`toDateOnlyISO` usa componentes locales, no `toISOString`).
* La fecha de entrega y los instantes de envío los fija el servidor (`fecha_real_entrega`, `fecha_cargue_evidencia` = último envío, `fecha_primer_envio`, `num_envios`) y cada evento queda en `entregable_eventos`.

## Evidencias
`plantilla_entregables.tipo_evidencia` (`drive`, `formulario`, `enlace`, `ninguna`) o `requiere_evidencia=false`; sin configuración se infiere del texto histórico (permisivo: cualquier enlace). Excepción justificada: `justificacion_exencion` (≥ 10 caracteres), visible para el administrador.

## Asociación con iniciativas
La matriz se une a los reportes por `plantilla_id` + `docente_id` (modelo canónico de `main`). La iniciativa es `proyecto_semanas.proyecto_id`. Prioridad: iniciativa del reporte → excepción individual (`docente_entregable_excepciones.proyecto_id`) → inferencia por texto. Con varias iniciativas del mismo tipo el backend **no adivina**: `409 INICIATIVA_AMBIGUA` con candidatos; el cliente reintenta con `proyecto_id`.

## Protección de datos históricos
* `POST /admin/proyectos/:id/entregables-semanales` ya no borra todo: conserva todo entregable con avance (reporte, evidencia, revisión, vínculo con plantilla/docente) y solo sincroniza los entregables vacíos; valida que la semana pertenezca a la iniciativa.
* `PUT /admin/proyectos/:id` reprograma las semanas en el lugar; rechaza (409) reducir por debajo de semanas con reportes. Ya no reconstruye (`DELETE`) el cronograma.
* `DELETE /admin/proyectos/:id` no elimina iniciativas con reportes revisados (aprobados/observados); con reportes sin revisar sigue exigiendo `forzar=true`.
* `entregable_eventos` no tiene FK hacia el entregable: el historial sobrevive aunque el entregable se retire.

## Migración
`backend/migrations/fase22_bloque1_seguimiento.sql` (registrada en `scripts/migrate.js` después de la fase 21). Solo agrega lo que `main` no tiene: `fecha_primer_envio`, `num_envios`, `aprobado_en`, `evidencia_exenta`, `justificacion_exencion`, `tipo_evidencia`/`requiere_evidencia` en plantillas, la tabla `entregable_eventos` y un índice único `(docente_id, plantilla_id)` que se crea **solo si no hay duplicados** (si los hay emite un aviso y no se crea). Aditiva e idempotente; el backfill solo rellena columnas nuevas vacías. Ejecutar con `npm run migrate` (nunca en producción sin respaldo previo).

## Pruebas
| Tipo | Comando | Requisitos |
|---|---|---|
| Unitarias (reglas, sin BD) | `cd backend && npm test` | ninguno |
| Integración con PostgreSQL | `cd backend && npm run test:integration` | `PGDATABASE=proysocial_test`, `PGHOST=localhost`, `DATABASE_URL` vacío; migraciones aplicadas. Se **omiten** si la base no se llama exactamente `proysocial_test` en el servidor local. Los datos son sintéticos (`TST_B1…`) y se eliminan al terminar. |
| Scripts heredados de `main` | `npm run test:entregables`, `test:notificaciones`, `test:correos` | misma base de pruebas |
| Visuales | pendientes (ver lista manual en el informe de integración) | navegador |

Las pruebas usan las librerías reales (`jsonwebtoken`, `nodemailer`, `google-auth-library`); ya no existen sustitutos de prueba. Si `npm install` falla con `SELF_SIGNED_CERT_IN_CHAIN`, ver «Instalar dependencias detrás de un antivirus/proxy» en `docs/BLOQUE2_IMPORTACION_EXCEL.md`.

Ejemplo (PowerShell):
```powershell
$env:PGHOST='localhost'; $env:PGPORT='5433'; $env:PGDATABASE='proysocial_test'; $env:DATABASE_URL=''
cd backend; npm run migrate; npm test; npm run test:integration
```

## TypeScript
`tsconfig.json` + `npm run typecheck` (`tsc --noEmit`). Requiere `typescript` y `@types/react-dom` como devDependencies (pendiente: `npm i -D typescript @types/react-dom` cuando el registro de npm sea accesible); mientras tanto `src/types/shims.d.ts` declara `react-dom/client`.

## Pruebas visuales pendientes (manuales, en navegador)
Requieren Google Sign-In configurado o un token de sesión de prueba. **No se han ejecutado.**
1. Docente → Matriz: chips de estado (No iniciado/Borrador/En revisión/Observado/Aprobado) y chip adicional «Vencido»; el día de la fecha límite no aparece vencido.
2. Enviar un entregable sin enlace → mensaje de evidencia obligatoria; con «No aplica evidencia» + justificación corta (<10) → rechazo; con justificación válida → se envía.
3. Entregable con tipo `drive`/`formulario`: un enlace de otro tipo muestra el error del servidor.
4. Docente con dos iniciativas del mismo tipo: aparece el selector de iniciativa y el envío queda en la elegida.
5. Observado: se ve el comentario del revisor, se corrige y «Reenviar corrección» lo devuelve a revisión (doble clic no duplica).
6. Aprobado: bloqueado con mensaje; el administrador puede «Reabrir» con motivo.
7. Panel docente: reportado/aprobado/esperado/semana actual/pendientes/observados/vencidos/próxima entrega; la gráfica semanal usa datos reales.
8. Panel admin y consolidado: semáforos, brecha, pendientes de revisión, docentes con retraso; semana actual correcta con un semestre de ≠ 16 semanas.
9. Semestre sin calendario: aviso visible, sin fechas inventadas.
10. Editar el cronograma de una iniciativa con reportes: los reportes siguen visibles; reducir semanas por debajo de una semana con reportes muestra el rechazo.

## Entorno local de pruebas (acceso de desarrollo)
Base **`proysocial_dev`** (nueva, local, aislada) con **datos sintéticos** (usuarios `@proysocial.local`, semestre `2026B` en la semana 8). No es producción ni copia de datos reales.
```powershell
cd backend
npm run dev:setup            # crea la base si no existe, migra y siembra (idempotente). --reset recrea SOLO proysocial_dev
npm run dev:local            # backend en :4000 con backend/.env.dev (ignorado por git)
```
En `http://localhost:5173` el Login muestra, **solo en `vite dev`** y solo si el servidor lo habilita, el panel «Entorno de pruebas local». Usuarios: admin, maria.rodriguez, carlos.mendoza, andres.torres, laura.gomez (`@proysocial.local`).

Seguridad (`backend/src/config/devLogin.js`, `routes/devAuth.js`): las rutas `/auth/dev/*` solo se montan si `DEV_LOGIN_ENABLED=true`, `NODE_ENV≠production`, `PGHOST` local, `PGDATABASE` exactamente `proysocial_dev`, sin `DATABASE_URL`/Cloud/SSL y con lista explícita `DEV_LOGIN_EMAILS` de correos `@proysocial.local`; además cada petición debe venir de loopback, sin proxy, y la base conectada se revalida. Emite el mismo JWT que Google; permisos y roles de la API no cambian. No existe variable de frontend que lo active. Google OAuth (`/auth/google`) no se modifica.
