# ProySocial — Guía operativa de lanzamiento del piloto

Estado al 2026-10-20. **No se creó ni modificó ninguna infraestructura**: no hay comandos de GCP ejecutados, el workflow de producción no se tocó, `proysocial_dev` no se modificó y no se hicieron commits. Lo que sí se hizo: un ensayo de extremo a extremo en una base **local desechable** (`proysocial_piloto_ensayo`, ya eliminada): migraciones desde cero con la compuerta, siembra de datos sintéticos, comprobación de invariantes y prueba de humo contra un servidor configurado como el del piloto.

**Siguiente decisión: configurar el ambiente piloto (§13), no abrir otro bloque de desarrollo.** Todo lo que sigue está pensado para ejecutarse sin improvisar.

Leyenda de estados: **LISTO** · **REQUIERE CONFIGURACIÓN MÍA** (la haces tú en GCP/GitHub/Google) · **REQUIERE CORRECCIÓN TÉCNICA** (hay una propuesta concreta que espera tu aprobación) · **OPCIONAL PARA EL PILOTO**.

## 0. Decisiones que necesito de ti (en este orden)
| # | Decisión | Mi recomendación |
|---|---|---|
| D1 | Aprobar el workflow de piloto propuesto (`docs/piloto/deploy-piloto.yml.propuesta`: manual, con puerta de seguridad, Environment propio) | Aprobar y copiarlo tú a `.github/workflows/` |
| D2 | Correo del piloto (§6): A) desactivado de forma explícita, B) buzón de pruebas (SMTP sandbox), C) SMTP institucional real | **A para la primera prueba funcional**, B si quieres validar el formato de los correos |
| D3 | Base de datos del piloto (§3): instancia de Cloud SQL propia (A) o base distinta en la instancia de producción (B) | **A** (aislamiento total; se puede apagar o borrar al terminar) |
| D4 | Lista de cuentas de prueba (correos de Google reales de quienes probarán; **no** se guardan en el repositorio) | Empezar con 1–2 coordinadores y 2–4 docentes del propio equipo |
| D5 | Tipo de pantalla de consentimiento de Google (§5): Interna (si la institución usa Google Workspace) o Externa en modo de prueba | Interna si es posible |

## 1. Versión candidata y bloqueos reales
**Candidata:** rama `integracion-bloque1-main`, último commit `88e259f` + 3 elementos sin commitear de esta etapa: `backend/scripts/piloto-seed.js`, `backend/scripts/piloto-humo.mjs` y la ampliación de `e2e/suites/piloto-ui.mjs` (más `docs/piloto/` y este documento). Congela funcionalidades: no hay cambios de aplicación pendientes en esta etapa.

| Verificación | Estado | Evidencia |
|---|---|---|
| Frontend integrado | **LISTO** | `tsc` sin errores, build correcto; recorrido en Chrome real (73 comprobaciones, 0 fallos): rutas docente y admin, móvil 390×844, fallos de API |
| Backend e integración | **LISTO** | 174 pruebas de integración (171 correctas, 3 omitidas por diseño), 61 unitarias |
| Migraciones | **LISTO** | 35 migraciones aplicadas desde cero con `PROYSOCIAL_APLICAR_FASE28=1` (ensayo local); sin la variable el ejecutor deja la fase28 «Pendiente» y el servidor responde 503 explícito a las asignaciones |
| Endpoints, autenticación y permisos | **LISTO** (Google real: **REQUIERE CONFIGURACIÓN MÍA**) | §5; 17 rutas de docente y 18 de administración probadas con 200/403/401 |
| Compatibilidad con PostgreSQL | **LISTO** | Probado con PostgreSQL local 18; usa la **misma versión mayor** que producción en Cloud SQL (las migraciones no usan extensiones) |
| Servicio de correo | **LISTO** con `EMAIL_ENABLED=false` explícito; envío real **REQUIERE CONFIGURACIÓN MÍA** | §6 |
| Enlaces directos y recarga | **LISTO** | Corregido en la etapa anterior y cubierto por la prueba de humo |

**Bloqueos reales que impiden lanzar (solo estos):**
1. **No existe el ambiente aislado ni su flujo de despliegue** — REQUIERE CONFIGURACIÓN MÍA + aprobación D1 (el workflow de producción se dispara con *push* a `main`, falla sin SMTP y usa recursos de producción).
2. **Cliente OAuth de Google del piloto + dominio permitido** — REQUIERE CONFIGURACIÓN MÍA (§5).
3. **Secretos del piloto** (JWT y contraseña de base de datos) — REQUIERE CONFIGURACIÓN MÍA (§3).
4. **Decisión de correo** — D2.
5. **Lista de cuentas de prueba** — D4.

No hay bloqueos técnicos de código pendientes. Hallazgo técnico ya resuelto sin cambiar la aplicación: ver «Correos acumulados» en §6.

## 2. Arquitectura del ambiente piloto
```
 Navegador (docentes y coordinadores, cuentas Google institucionales)
        │ HTTPS (URL *.run.app o dominio propio)
        ▼
 Cloud Run: servicio «proysocial-piloto»  ──── sirve el frontend compilado Y la API (mismo origen; sin CORS)
   · imagen propia  proysocial-piloto:<commit>        · cuenta de servicio de ejecución propia
   · secretos propios (JWT, contraseña de BD)         · max 2 instancias, min 0
        │ socket Unix de Cloud SQL (sin IP pública abierta)
        ▼
 Cloud SQL (PostgreSQL) — instancia PROPIA del piloto   ──►  base «proysocial_piloto», usuario propio
   · copias automáticas + recuperación a un punto en el tiempo
 Cloud Run Jobs (misma imagen): …-migrate (con fase28) · …-bootstrap-admin · …-seed (opcional)
 Secret Manager: proysocial-piloto-db-password · proysocial-piloto-jwt-secret · (proysocial-piloto-smtp-password, solo si hay SMTP)
 Artifact Registry: repositorio propio del piloto
 Cloud Logging: stdout/stderr del servicio (sin configuración adicional)
 Google Cloud Console → OAuth: cliente «ProySocial piloto» (origen autorizado = URL del servicio)
 NADA de lo anterior comparte credenciales, base, secretos ni cliente OAuth con producción.
```
Las cuentas de prueba inician sesión con Google; **no existe** el acceso de desarrollo (queda inactivo por 8 condiciones independientes, entre ellas `NODE_ENV=production`, estar en Cloud Run y que la base no se llame `proysocial_dev`; la prueba de humo lo comprueba en el despliegue).

## 3. Recursos necesarios en GCP
Todos los comandos son **de referencia, para que los ejecutes tú**; sustituye los valores entre `<>`. No pegues contraseñas en el historial de la terminal: usa los patrones con `--prompt-for-password` y con `openssl` por tubería.

| Recurso | Estado | Detalle |
|---|---|---|
| Proyecto GCP (el de la institución o uno propio del piloto) | REQUIERE CONFIGURACIÓN MÍA | Más aislado: un proyecto aparte; mínimo aceptable: el mismo proyecto con recursos de nombre «piloto» |
| APIs habilitadas | REQUIERE CONFIGURACIÓN MÍA | `gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com` |
| Instancia Cloud SQL propia (**D3-A**) | REQUIERE CONFIGURACIÓN MÍA | `gcloud sql instances create proysocial-piloto-sql --database-version=<misma versión mayor que producción> --tier=<el nivel más pequeño disponible> --region=<REGION> --storage-size=10GB --backup-start-time=03:00 --enable-point-in-time-recovery` (confirma en la consola los niveles y la edición vigentes) |
| Base y usuario de piloto | REQUIERE CONFIGURACIÓN MÍA | `gcloud sql databases create proysocial_piloto --instance=proysocial-piloto-sql` · `gcloud sql users create proysocial_piloto_app --instance=proysocial-piloto-sql --prompt-for-password`. **Si eliges D3-B** (misma instancia que producción): además `REVOKE CONNECT ON DATABASE <base_prod> FROM PUBLIC` y concede `CONNECT` solo a su usuario de producción, para que el usuario del piloto no pueda abrir la base de producción |
| Secretos | REQUIERE CONFIGURACIÓN MÍA | `openssl rand -base64 48 \| tr -d '\n' \| gcloud secrets create proysocial-piloto-jwt-secret --data-file=-` (≥ 32 caracteres exigidos por la app). Contraseña de BD: `gcloud secrets create proysocial-piloto-db-password --data-file=-` leyendo el mismo valor que pusiste al crear el usuario. Nombres con «piloto»: la puerta de seguridad del workflow lo exige |
| Cuenta de servicio de **ejecución** | REQUIERE CONFIGURACIÓN MÍA | `gcloud iam service-accounts create proysocial-piloto-run` con `roles/cloudsql.client` y `roles/secretmanager.secretAccessor` **solo sobre los secretos del piloto** |
| Cuenta de servicio de **despliegue** (la que usa GitHub) | REQUIERE CONFIGURACIÓN MÍA | Solo para el piloto: `roles/run.admin`, `roles/iam.serviceAccountUser` sobre la cuenta de ejecución del piloto, `roles/artifactregistry.writer` sobre el repositorio del piloto. **No reutilices la clave de producción**: clave nueva en el secreto `GCP_SA_KEY` del Environment «piloto» |
| Artifact Registry | REQUIERE CONFIGURACIÓN MÍA | Repositorio propio: `gcloud artifacts repositories create proysocial-piloto --repository-format=docker --location=<REGION>` |
| GitHub Environment «piloto» | REQUIERE CONFIGURACIÓN MÍA | Settings → Environments → New → `piloto`. Variables y secretos **de ese Environment** (§4). Opcional: aprobadores obligatorios |
| Workflow de piloto | **REQUIERE CORRECCIÓN TÉCNICA** (propuesta lista) | `docs/piloto/deploy-piloto.yml.propuesta`: solo `workflow_dispatch`, confirmación escrita, puerta de seguridad (servicio/base/secretos deben contener «piloto» y no coincidir con producción), imagen `proysocial-piloto`, migración con fase28, correo opcional, prueba de humo al final. Espera tu aprobación (D1) |
| HTTPS | **LISTO** | Cloud Run entrega HTTPS en la URL `*.run.app`. Dominio propio: OPCIONAL PARA EL PILOTO |
| CORS | **LISTO** | Mismo origen: no se define `ALLOWED_ORIGIN` y CORS queda cerrado (la prueba de humo lo comprueba) |
| Registro de errores | **LISTO** | Cloud Run envía stdout/stderr a Cloud Logging. Filtro útil: `resource.type="cloud_run_revision" AND resource.labels.service_name="proysocial-piloto" AND severity>=ERROR`. Alertas automáticas: OPCIONAL PARA EL PILOTO |
| Copias de seguridad | REQUIERE CONFIGURACIÓN MÍA | Automáticas + recuperación a un punto en el tiempo (comando de la instancia). Antes de cada migración: `gcloud sql backups create --instance=proysocial-piloto-sql` |
| Memoria del servicio | OPCIONAL PARA EL PILOTO (recomendada) | El workflow de producción usa 512 Mi; el de piloto propone 1 Gi porque la importación acepta cuerpos de hasta 18 MB y se procesa en memoria. No se probó con un Excel institucional grande: si importas uno, vigila el uso |

## 4. Variables de entorno (sin valores secretos)
**Variables del Environment «piloto» de GitHub** (no sensibles): `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`, `CLOUD_RUN_SERVICE` (con «piloto»), `CLOUD_SQL_INSTANCE`, `GCP_SERVICE_ACCOUNT`, `DB_NAME` (con «piloto»), `DB_USER`, `DB_PASSWORD_SECRET`, `JWT_SECRET_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_DOMAIN`, `ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_APELLIDO`, `EMAIL_ENABLED` (`false` por omisión), opcionales `SESSION_TTL`, `SMTP_*`, `PROD_*` (referencias de producción solo para que la puerta se niegue a coincidir).
**Secretos del Environment «piloto»:** `GCP_SA_KEY` (clave de la cuenta de despliegue del piloto), `PILOTO_ADMIN_EMAILS` y `PILOTO_DOCENTE_EMAILS` (listas de correos de prueba separadas por «;», solo si usarás la siembra).

**Variables del servicio en ejecución:**
| Variable | Valor / origen | Sensible |
|---|---|---|
| `NODE_ENV` | `production` (también fija el Dockerfile) | no |
| `PORT` | `8080` (Dockerfile) | no |
| `INSTANCE_CONNECTION_NAME`, `PGDATABASE`, `PGUSER` | instancia, base y usuario del piloto | no |
| `PGPASSWORD` | secreto `…-piloto-db-password` | **sí** |
| `JWT_SECRET` | secreto `…-piloto-jwt-secret` (≥ 32 caracteres; sin él la app responde 503) | **sí** |
| `GOOGLE_CLIENT_ID` | id del cliente OAuth del **piloto** | no |
| `ALLOWED_GOOGLE_DOMAINS` | dominio(s) institucional(es); se compara con el dominio alojado (`hd`) de la cuenta | no |
| `SESSION_TTL` | `8h` por omisión | no |
| `EMAIL_ENABLED` | `false` (explícito) salvo que D2 diga otra cosa | no |
| `SMTP_HOST/PORT/SECURE/USER/FROM`, `APP_PUBLIC_URL` | solo con correo activo | no |
| `SMTP_PASS` | secreto de Secret Manager | **sí** |
| `PGPOOL_MAX` | `4` (el workflow lo fija para no agotar conexiones con 2 instancias) | no |

**Variables de compilación del frontend** (se «hornean» al construir la imagen): `VITE_GOOGLE_CLIENT_ID` = el mismo cliente del piloto; `VITE_API_URL` vacío (mismo origen). **La imagen de producción no sirve para el piloto**: lleva el cliente de producción.
**Variables que NO deben existir en el piloto:** `DEV_LOGIN_ENABLED`, `DEV_LOGIN_EMAILS`, `DATABASE_URL`, `ALLOWED_ORIGIN` (no hace falta). **Solo en el job de migración:** `PROYSOCIAL_APLICAR_FASE28=1`. **Solo en el job de siembra:** `PILOTO_SEED=1`, `PILOTO_ADMIN_EMAILS`, `PILOTO_DOCENTE_EMAILS`.

## 5. Google OAuth
**Cómo funciona (revisado en `Login.tsx` y `backend/src/routes/auth.js`):** el navegador usa *Google Identity Services* (botón «Continuar con Google»); Google devuelve un **ID token** a una función de la página y el frontend lo envía a `POST /auth/google`. El backend lo verifica con `google-auth-library` contra `GOOGLE_CLIENT_ID`, exige `email_verified`, comprueba el dominio alojado si hay `ALLOWED_GOOGLE_DOMAINS`, y solo entonces busca al usuario **ya registrado** en la base. **No usa redirección: no hay URI de redirección que registrar.**

**Qué configurar en Google Cloud (lo haces tú):**
1. Pantalla de consentimiento de OAuth (APIs y servicios → Pantalla de consentimiento): **Interna** si la institución usa Google Workspace (solo cuentas del dominio pueden entrar); si no, **Externa** en modo *Prueba* y añade a los participantes como *usuarios de prueba* (límite de usuarios de prueba y las cuentas personales no traen dominio alojado: ver abajo). Solo se piden los alcances básicos (correo, perfil, openid); no requiere verificación de la aplicación.
2. Credenciales → Crear credenciales → **ID de cliente de OAuth → Aplicación web**, nombre «ProySocial piloto».
3. **Orígenes autorizados de JavaScript:** `https://<url-del-servicio-de-piloto>` (la URL `*.run.app` que muestra Cloud Run; se conoce al crear el servicio). Si más adelante usas dominio propio, añade ese origen. **URI de redirección autorizados: ninguno.** (Para pruebas locales usa un cliente distinto, con `http://localhost:5173`; no mezcles ambos.)
4. Copia el **ID de cliente** (no es secreto; no existe «secreto de cliente» en este flujo) a la variable `GOOGLE_CLIENT_ID` del Environment «piloto».
5. Orden para la «gallina y el huevo» de la URL: crea el cliente → despliega → copia la URL del servicio → añádela como origen autorizado. Google puede tardar unos minutos en aplicar el cambio. Si el botón de Google no aparece, es casi siempre el origen sin autorizar (la pantalla lo detecta y lo indica).

**Variables:** backend `GOOGLE_CLIENT_ID`, `ALLOWED_GOOGLE_DOMAINS`, `JWT_SECRET`, `SESSION_TTL`; frontend (compilación) `VITE_GOOGLE_CLIENT_ID`. Detalle en §4.

**Restringir el acceso a usuarios institucionales autorizados (varias capas; el dominio NO es la única):**
1. Google verifica la identidad; el backend exige `email_verified`.
2. **Dominio** (`ALLOWED_GOOGLE_DOMAINS`): se compara con el dominio alojado (`hd`), que solo traen las cuentas de Google Workspace. **Fíjalo siempre en el piloto**; si queda vacío, no se restringe por dominio.
3. **Lista de usuarios en el backend:** la cuenta debe existir en la tabla `usuarios` con el correo exacto, `estado = 'activo'` y rol `admin` o `docente`. **No se crean usuarios al iniciar sesión**: una cuenta no registrada recibe 403. Se registran desde Administración → Usuarios o con la siembra (`PILOTO_*_EMAILS`).
4. La primera vez se enlaza el identificador de Google (`google_sub`) al usuario; si otro identificador intenta entrar con el mismo correo, se rechaza.
5. **En cada petición** se vuelve a consultar el rol y el estado en la base: inactivar a alguien revoca su acceso al instante, sin esperar a que venza el token.

**Usuarios inactivos:** no pueden iniciar sesión (403); si ya tenían sesión, la siguiente petición devuelve 401 y la aplicación vuelve al inicio de sesión (verificado en integración y en Chrome).
**Sesiones:** token firmado (HS256) con emisor, audiencia y caducidad (8 h), guardado en el navegador; el cierre de sesión borra la sesión local. Comprobación: `GET /auth/me`.
**Comprobar sesiones y permisos en el piloto** (con Google real): checklist §10, pasos 1, 2 y 17.

## 6. Correo (SMTP)
**Qué mensajes envía ProySocial** (revisado en `emailService.js` y la migración `fase21`): *nuevo entregable pendiente de revisión* (a los administradores activos), *tu entregable fue aprobado* y *tu entregable requiere ajustes* (al docente), *notificaciones manuales* que un administrador envía a un docente, el *resumen diario de entregables vencidos* (docentes) y el *resumen de docentes sin actividad* (administradores).
**¿El recorrido principal depende del correo? No.** Las notificaciones dentro de la aplicación (campana, bandeja, estados) funcionan sin correo; todas las pruebas de recorrido de esta guía se ejecutaron con `EMAIL_ENABLED=false`.
**Qué pasa si SMTP no está configurado:** con `EMAIL_ENABLED=false` explícito el trabajador de correo no arranca y no sale ningún mensaje; `/health` informa `"email":{"enabled":false}` (la prueba de humo lo exige explícito) y `/admin/correos/estado` muestra la cola. Si `EMAIL_ENABLED` no se define y hay algún `SMTP_*`, el correo se activa solo; por eso en el piloto **se define siempre**.
**El workflow de producción hace fallar el despliegue si falta cualquier variable SMTP** (paso «Configure notification email»); el workflow de piloto propuesto lo hace condicional a `EMAIL_ENABLED=true`.

**Propuesta (D2), sin desactivar nada en silencio:**
| Opción | Qué es | Cuándo |
|---|---|---|
| **A (recomendada para la primera prueba)** | `EMAIL_ENABLED=false` fijado en el servicio, documentado, visible en `/health` y verificado por la prueba de humo. Sin credenciales externas | Prueba funcional inicial |
| B | SMTP *sandbox* (un buzón de pruebas que captura todos los mensajes, p. ej. Mailtrap u otro equivalente que elijas): `EMAIL_ENABLED=true` + `SMTP_*` del sandbox. **Todo lo que se envíe queda capturado, sea cual sea el destinatario**, así que no llega a usuarios reales | Para validar el formato y el contenido de los correos |
| C | SMTP institucional real (proveedor y cuenta remitente que te asigne la institución: **requiere credenciales tuyas**) | Solo cuando los participantes hayan aceptado recibir correos |

**Hallazgo importante — correos acumulados:** los disparadores de la base **encolan** correos aunque el envío esté desactivado (nuevo reporte → administradores; aprobado/observado → docente). Si algún día activas SMTP, el trabajador **enviaría de golpe esa cola acumulada**. Dos protecciones, ya resueltas sin tocar la aplicación: (1) la siembra de datos sintéticos **cancela** los correos que ella misma genera (en el ensayo, 22 correos, que habrían llegado a los coordinadores reales registrados); (2) antes de pasar de A a B o C, ejecuta `UPDATE notificacion_correos SET estado = 'cancelado', ultimo_error = 'Cancelado antes de activar el correo' WHERE estado IN ('pendiente','fallido');` y decide a propósito.

## 7. Migración 28 en una base nueva
**Qué se verificó (ensayo local, base desechable `proysocial_piloto_ensayo`, ya eliminada):** las 35 migraciones se aplican desde cero con `PROYSOCIAL_APLICAR_FASE28=1`; la fase28 es aditiva e idempotente; el backfill de una base nueva es trivial (no hay usuarios) y no genera incidencias; tras sembrar datos, **0 docentes con deriva y 0 con más de una vigente**; el servidor nuevo contra una base de 34 migraciones responde 503 explícito (prueba automatizada `esquema-pendiente`). Una **base nueva recibe A+B de una vez**: no existe la ventana «código antiguo + tabla nueva».

**Procedimiento definitivo para la base del piloto (nueva):**
1. Crear la base y el usuario (§3). 2. Backup inicial opcional (la base está vacía).
3. **Migrar con la compuerta:** lo hace el workflow (job `…-migrate` con `PROYSOCIAL_APLICAR_FASE28=1` si `aplicar_fase28` está activo; por omisión lo está). Manual equivalente: `cd backend && PROYSOCIAL_APLICAR_FASE28=1 npm run migrate` apuntando a la base del piloto.
4. Comprobar: `SELECT COUNT(*) FROM schema_migrations` = **35**; existen `docente_grupo_matriz`, `docente_grupo_matriz_cambios`, `docente_grupo_matriz_incidencias`.
5. Primer administrador (job `…-bootstrap-admin` con `ADMIN_EMAIL`, `ADMIN_NOMBRE`, `ADMIN_APELLIDO`).
6. Datos sintéticos (§8) y despliegue del servicio.
7. Verificar invariantes (solo lectura): `node backend/scripts/historial-docente-grupo-deriva.js` (con las variables de la base del piloto, o desde un job) → «0 docente(s) con deriva, 0 con más de una vigente».
**Doble escritura y asignaciones vigentes:** toda asignación pasa por el servicio único (historial + espejo + registro con motivo, en una transacción); `docente_grupo_matriz` tiene a lo sumo una fila vigente por docente (índice parcial único). **Restricciones de integridad:** un docente o administrador con historial no se elimina (RESTRICT); un grupo con asignaciones no se elimina; triggers de solapamiento y de periodos cerrados. Todo cubierto por 31 pruebas de integración propias.
**Qué no se hace aquí:** no se ejecuta nada en `proysocial_dev` ni en producción; la activación de A+B en desarrollo sigue esperando tu autorización aparte (`docs/CIERRE_FUNCIONAL_PROYSOCIAL.md` §6).

## 8. Datos sintéticos del piloto
Script: `backend/scripts/piloto-seed.js` (**LISTO**, probado en el ensayo local). Es idempotente, no borra nada y tiene guardas: exige `PILOTO_SEED=1`; la base debe contener «piloto» y no «prod», «dev» ni «test»; exige `--confirmar-base=<nombre exacto>`; exige la migración fase28. Rechazó correctamente `proysocial_dev` y `proysocial_test`.
**Qué crea:**
| Elemento | Detalle |
|---|---|
| Semestre | Activo, con calendario vigente (inicio hace 3 semanas, 16 semanas). Los semestres previos se desactivan: el de las migraciones (2026A) queda como «semestre anterior» para probar el selector |
| Escuela y programas | «Escuela Piloto (sintética)», 2 programas |
| Grupo y matriz | «Grupo Piloto (sintético)» con 6 entregables de ejemplo, uno «no requiere cargue» |
| Administrador técnico | `admin@piloto.proysocial.invalid` (no puede iniciar sesión: dominio inexistente) |
| Docentes sintéticos | Uno (aprobado, enviado, observado y borrador), Dos (enviado, observado con «no tengo acceso», aprobado), Cuatro (aprobados), **Sin Matriz** (sin grupo ni iniciativa). Correos `@piloto.proysocial.invalid`: **no pueden iniciar sesión** |
| Evidencias | Enlaces ficticios `https://drive.google.com/file/d/PILOTO-SINTETICO-n/view` (no apuntan a ningún archivo real) |
| Cuentas de los participantes | **Solo desde variables de entorno** (`PILOTO_ADMIN_EMAILS`, `PILOTO_DOCENTE_EMAILS`, separados por «;»): administradores «Coordinación Piloto N» y docentes «Docente Piloto N» con matriz e iniciativa vacías, listos para reportar. Los nombres se editan luego en Administración → Usuarios. **Nada personal se guarda en el repositorio** |
| Correos | Cancela los correos que genera la siembra (§6) |
**Resultado del ensayo:** 4 aprobados, 2 enviados, 2 observados, 1 borrador; indicadores del administrador coherentes (8 reportes, 50 % de aprobación, 2 pendientes de revisión en la bandeja); el docente sin matriz ve estados vacíos; el docente de prueba ve su matriz de 6 entregables sin reportes.
**Ejecución** (en el piloto, tras migrar): con el workflow, entrada `sembrar_datos`; manual: `PILOTO_SEED=1 PILOTO_ADMIN_EMAILS="a@dominio;b@dominio" PILOTO_DOCENTE_EMAILS="c@dominio;d@dominio" node backend/scripts/piloto-seed.js --confirmar-base=proysocial_piloto`. Para empezar de cero: recrear la base (los datos son sintéticos y la recuperación más rápida es volver a migrar y sembrar).

## 9. Pasos de despliegue (en orden)
| # | Paso | Quién | Estado |
|---|---|---|---|
| 1 | Aprobar D1–D5 (§0) | tú | REQUIERE CONFIGURACIÓN MÍA |
| 2 | Commit de lo pendiente (scripts, E2E, docs) en tu rama | tú | REQUIERE CONFIGURACIÓN MÍA |
| 3 | Crear recursos GCP de §3 (instancia, base, usuario, secretos, cuentas de servicio, repositorio) | tú | REQUIERE CONFIGURACIÓN MÍA |
| 4 | Crear el cliente OAuth (§5, pasos 1–4) y anotar el ID | tú | REQUIERE CONFIGURACIÓN MÍA |
| 5 | Crear el Environment «piloto» con variables y secretos de §4 | tú | REQUIERE CONFIGURACIÓN MÍA |
| 6 | Copiar `docs/piloto/deploy-piloto.yml.propuesta` a `.github/workflows/deploy-piloto.yml` | tú | tras aprobar D1 |
| 7 | Ejecutar el workflow («Run workflow» → escribir `piloto`; `aplicar_fase28` activo; `sembrar_datos` activo la primera vez) | tú | — |
| 8 | Copiar la URL del servicio (la imprime el último paso) y **añadirla como origen autorizado** en el cliente OAuth; esperar unos minutos | tú | REQUIERE CONFIGURACIÓN MÍA |
| 9 | Prueba de humo pública: `node backend/scripts/piloto-humo.mjs https://<url>` (el workflow ya la ejecuta) | automática | **LISTO** |
| 10 | Verificar invariantes del historial (§7, paso 7) | tú | LISTO |
| 11 | Recorrido de aceptación con una cuenta de administrador y una de docente reales (§10) | tú + un compañero | REQUIERE CONFIGURACIÓN MÍA |
| 12 | Abrir a los participantes con sus cuentas ya registradas | tú | — |

## 10. Pruebas de humo y de aceptación
**Automáticas ya disponibles:** `piloto-humo.mjs` (15 comprobaciones públicas contra la URL: salud con base de datos, SPA, enlaces directos, API cerrada sin sesión, acceso de desarrollo inexistente, Google configurado, cabeceras, CORS, correo explícito, HTTPS), `piloto-recorrido` (API + PostgreSQL), `piloto-ui` (Chrome real, escritorio, móvil y fallos de API; base aislada local).
**Fuera de alcance de lo aprobado:** las E2E con SQL pospuestas (`administracion.mjs`, `historicos.mjs`, `importador.mjs`) **no están aprobadas** y quedan para la etapa de PostgreSQL y pruebas SQL; el login real con Google no se puede automatizar y **no se ha probado**.

**Checklist de aceptación (marca cada fila en el piloto; «Auto» = ya cubierto por pruebas en base local, vuelve a comprobarlo a mano en el piloto lo que dice «manual»).**
| # | Verificación | Cómo | Esperado | Cobertura |
|---|---|---|---|---|
| 1 | **Login real con Google** | Abrir la URL de piloto en una ventana privada → «Continuar con Google» con la cuenta de prueba | Entra y llega a `/docente` o `/admin` según el rol; con una cuenta **no registrada** → mensaje «aún no está autorizada»; con una cuenta de otro dominio → rechazada | **Manual** (no automatizable) |
| 2 | Sesión y cierre de sesión | Recargar (F5) con sesión; cerrar sesión; pulsar «atrás» | La sesión persiste al recargar; tras cerrar vuelve al inicio y no se puede volver a páginas internas | Auto (token, vencida, revocada) + manual |
| 3 | Dashboard administrativo | `/admin` | Indicadores del semestre activo; selector de semestre (activo y 2026A) sin mezclar datos | Auto + manual |
| 4 | Dashboard docente | `/docente` con una cuenta docente | Semestre y grupo en la barra; indicadores | Auto + manual |
| 5 | Matrices | `/docente/matriz` y `/admin/docentes/<id>/matriz` | 6 entregables del grupo; el docente sin matriz ve el aviso | Auto |
| 6 | Iniciativas | `/docente/proyectos` y detalle | La iniciativa del docente aparece; abre el detalle | Auto (carga) + manual |
| 7 | Reportar entregable | Evidencias → entregable → enlace → «Guardar borrador» | Estado «Borrador»; validación si no hay enlace o es inválido | Auto |
| 8 | Evidencias | Agregar varios enlaces; abrir desde la revisión del administrador | Ambos enlaces visibles al docente y al revisor | Auto |
| 9 | Corrección y reenvío | Admin «Solicitar correcciones» con comentario; docente corrige y «Reenviar» | El docente ve la observación; el reenvío queda como segundo envío con la versión anterior conservada | Auto |
| 10 | Aprobación | Admin «Aprobar» → «Confirmar aprobación» | El docente ve «Aprobada por coordinación», sin editor | Auto |
| 11 | Importación Excel | Admin → Importar matriz: cargar un `.xlsx` de prueba, mapear, validar, resolver decisiones, confirmar, asignar docente | Matriz creada y visible al docente asignado. **Probado con xlsx sintéticos por API; la interfaz de importación no tiene E2E vigente** (la suite está pospuesta) | API auto + **manual en interfaz** |
| 12 | Asignación docente–grupo | Admin → Sistema → Tareas semanales → grupo → «Asignar docente» (con motivo) y «Quitar del grupo» | Asignación guardada y visible; sin motivo no deja asignar | Auto (clic real) |
| 13 | Indicadores por semestre | `/admin/indicadores`, `/admin/reportes`, `/admin/avance` y selector de semestre | Cifras coherentes con lo reportado; semestre anterior sin datos del activo | Auto + manual |
| 14 | Historial | Entregable → «Ver historial» (docente y admin) | Envío → observación → reenvío → aprobación, con fechas y actor | Auto |
| 15 | Administración | Usuarios (alta, edición, inactivar), semestres, escuelas y programas | Se guardan, validan y se reflejan; un docente con historial no se elimina | Auto |
| 16 | Recarga y enlaces directos | F5 en `/docente/matriz`, `/admin/revision?reporte=<id>`; pegar un enlace directo en otra pestaña con sesión | Carga la aplicación en esa pantalla (no un JSON de error) | **Auto (humo)** + manual |
| 17 | Accesos restringidos por rol | Con una cuenta docente abrir `/admin/...`; con una cuenta inactiva intentar entrar | No hay contenido de administración; la cuenta inactiva no entra | Auto + manual |
| 18 | Fallos de API | Con DevTools → Network → «Offline» (o bloquear `/docente/…`) navegar | La pantalla no se queda cargando para siempre ni muestra JSON; permite reintentar o volver | Auto (simulado) + manual |
| M | **Móvil y escritorio** | Repetir 2, 4, 7–10 y 16 en un teléfono real (Chrome/Safari) y en un portátil (Chrome y otro navegador, p. ej. Edge) | Sin desbordes, navegación inferior en móvil, botones al alcance | Auto (Chrome 390×844 y 1440) + **manual en dispositivo real** |
Criterio de aceptación: filas 1–17 sin fallos; 18 y M sin bloqueos. Cualquier fallo se anota con la URL, la hora y la captura (los registros del servicio permiten rastrearlo en Cloud Logging).

## 11. Procedimiento de recuperación
| Situación | Acción |
|---|---|
| Despliegue defectuoso (la aplicación responde mal) | Volver a la revisión anterior: `gcloud run services update-traffic proysocial-piloto --region <REGION> --to-revisions <REVISION_ANTERIOR>=100` (las revisiones se listan con `gcloud run revisions list`) |
| Migración fallida | La migración es transaccional por archivo: un fallo hace `ROLLBACK` y no deja nada a medias; corrige y vuelve a ejecutar el job. Si la fase28 quedó pendiente, el servidor nuevo responde 503 solo en asignaciones (el resto funciona) |
| Datos del piloto dañados o ya no sirven | **Opción más rápida (datos sintéticos): recrear** — borrar la base del piloto, crearla, migrar con fase28 y sembrar (≈ minutos). Si hay trabajo de los participantes que conservar: restaurar |
| Restaurar desde copia | `gcloud sql backups list` → `gcloud sql backups restore <ID> --restore-instance=<instancia>`; para un punto en el tiempo: `gcloud sql instances clone <origen> <nuevo> --point-in-time <fecha UTC>` y apuntar el servicio a la instancia clonada tras validarla |
| Correos enviados por error | No aplica con `EMAIL_ENABLED=false`; si se activó SMTP, desactivarlo de inmediato: `gcloud run services update proysocial-piloto --update-env-vars EMAIL_ENABLED=false` y cancelar la cola (§6) |
| Cuenta comprometida o participante que sale | Administración → Usuarios → Inactivar: el acceso se revoca en la siguiente petición |
| Apagar el piloto | `gcloud run services delete proysocial-piloto` (o dejarlo en 0 instancias) y apagar Cloud SQL: `gcloud sql instances patch proysocial-piloto-sql --activation-policy=NEVER` |
| Secreto JWT sospechoso | Crear una versión nueva del secreto y redesplegar: invalida todas las sesiones |

## 12. Costos estimados
**No incluyo cifras en dinero**: dependen de la región, la edición y el nivel de Cloud SQL vigentes, que cambian, y no puedo sustentarlas desde el repositorio. Lo que sí puedo precisar es **qué factura y qué la controla**:
| Concepto | Qué hace variar el costo | Cómo mantenerlo bajo en el piloto |
|---|---|---|
| **Cloud SQL (dominante)** | Se cobra mientras la instancia está encendida, aunque nadie la use (cómputo + almacenamiento + copias) | Nivel mínimo, 10 GB; apagarla fuera de horas de prueba (`--activation-policy=NEVER`, el almacenamiento se sigue cobrando); borrarla al terminar |
| Cloud Run | Por uso (solicitudes, CPU y memoria mientras atiende); con mínimo 0 instancias no cuesta en reposo (la primera carga tarda unos segundos) | `--min-instances 0`, `--max-instances 2` (ya propuesto) |
| Artifact Registry, Secret Manager, Cloud Logging | Almacenamiento y accesos; con este volumen suele ser marginal | Política de limpieza de imágenes antiguas (OPCIONAL) |
| Correo | Depende del proveedor (un sandbox gratuito suele bastar) | Opción A: sin costo |
Para una cifra defendible, usa la *Google Cloud Pricing Calculator* con: región, Cloud SQL PostgreSQL (nivel mínimo, 10 GB, copias automáticas, horas encendida), Cloud Run (≈ 4–10 usuarios, pocas solicitudes) y 1–2 secretos.

## 13. Bloqueos reales pendientes y siguiente acción
Resumen por estado:
| Requisito | Estado |
|---|---|
| Código de la versión candidata, servidor, frontend, migraciones, pruebas, siembra sintética, prueba de humo, procedimiento de recuperación | **LISTO** |
| HTTPS, CORS cerrado, logs, acceso de desarrollo imposible, `/health` con base de datos | **LISTO** |
| Workflow de piloto manual y aislado | **REQUIERE CORRECCIÓN TÉCNICA** (propuesta escrita; espera D1) |
| Recursos GCP, secretos, cuentas de servicio, Environment de GitHub, copias de seguridad | **REQUIERE CONFIGURACIÓN MÍA** |
| Cliente OAuth de Google, dominio permitido, origen autorizado | **REQUIERE CONFIGURACIÓN MÍA** |
| Cuentas de prueba (D4) y decisión de correo (D2) | **REQUIERE CONFIGURACIÓN MÍA** |
| Login real con Google, importación por interfaz con un Excel real, dispositivos móviles reales | **REQUIERE CONFIGURACIÓN MÍA** (pruebas manuales del checklist) |
| Dominio propio, alertas, instancia mínima 1, límite de peticiones, CSP/HSTS, SMTP real | **OPCIONAL PARA EL PILOTO** |
| E2E con SQL pospuestas | **Pospuestas** (no aprobadas) |

**Siguiente acción: responder D1–D5 y configurar el ambiente piloto siguiendo §9.** Me detengo aquí y espero tu autorización antes de tocar cualquier infraestructura o activar el workflow.
