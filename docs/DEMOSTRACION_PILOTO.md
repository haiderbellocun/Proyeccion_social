# Modo demostración del piloto (solo lectura)

Permite explorar ProySocial con los cinco usuarios sintéticos `@proysocial.local` mientras Google OAuth no está configurado. Es **independiente** del acceso de desarrollo (`/auth/dev`, que sigue inactivo en Cloud Run) y de Google (`/auth/google`, intacto).

## Cómo funciona

1. El login muestra el bloque **«Entorno de demostración · Datos sintéticos»** solo si el servidor responde `GET /auth/demo/estado`.
2. Las **cinco tarjetas** (mismo diseño y orden que el acceso DEV local: avatar, nombre, rol y correo) se ven de inmediato; salen de `GET /auth/demo/estado`, que solo expone nombre, apellido, correo y rol (sin ids ni fotos) y no sirve para entrar sin la clave.
3. Al elegir una tarjeta sin haber validado la clave, el login pide la **clave del piloto** (`POST /auth/demo/acceso`) y, si es correcta, entra directo con ese usuario. El servidor devuelve un **pase** (JWT, 30 min, audiencia propia): con él, cambiar de usuario es un clic (`POST /auth/demo/sesion`).
   - Si la base de datos no responde (p. ej. Cloud SQL rechaza las credenciales) `/auth/demo/*` responde **503** (no 404): el login muestra el motivo y «Reintentar». Solo un 404 significa «demostración apagada».
4. La sesión (pase + correo): sesión JWT con `scope: "demo"`, **2 h** (`DEMO_SESSION_TTL`), sin renovación.
5. La sesión demo es de **solo lectura**, lo hace cumplir `requireAuth` en el servidor (no la interfaz): cualquier método distinto de GET/HEAD/OPTIONS responde 403, salvo `POST /auth/logout`. Además quedan bloqueadas (también en lectura) `/admin/usuarios`, `/admin/correos` y `/admin/importaciones`.
6. Una banda «Modo demostración · Solo lectura» con «Cambiar de usuario» aparece en toda la aplicación.

La información sale de Cloud SQL con los permisos normales de cada rol. No se escribe nada al entrar (ni siquiera `ultimo_acceso`).

## Seguridad (qué impide el mal uso)

| Riesgo | Control |
|---|---|
| Activarlo por error en otro entorno/base | Exige `DEMO_ENABLED=true`, clave ≥ 12 caracteres, `JWT_SECRET` ≥ 32 y que `current_database()` sea exactamente `proysocial_piloto` (el nombre está en el código, no se configura). Si `DEV_LOGIN_ENABLED=true` la demo no se monta. |
| Adivinar la clave | Comparación en tiempo constante, pausa en cada fallo, **5 fallos/15 min por IP** y **40 fallos/15 min globales** → 429 con `Retry-After`. |
| Elegir otro usuario / elevar permisos | Lista cerrada de 5 correos en el servidor; el rol se lee de la base en cada petición (cambiar `role` en el token no sirve); `requireAuth` rechaza tokens `demo` de usuarios fuera de la lista. |
| Usar el pase como sesión (o al revés) | Audiencias distintas: se rechazan mutuamente. |
| Escribir datos | Bloqueo en `requireAuth` (todas las rutas), probado con 18 escrituras y con huella de todas las tablas antes/después de navegar. |
| Fuga de la clave | Solo en Secret Manager → variable de entorno; nunca en el repositorio, el Dockerfile ni el cliente; no se registra. |
| Tokens vivos tras apagarla | Con `DEMO_ENABLED≠true` los tokens `demo` dejan de valer (401) de inmediato. |

## Variables y secretos

| Nombre | Tipo | Valor |
|---|---|---|
| `DEMO_ENABLED` | variable | `true` (explícito; ausente = apagado) |
| `DEMO_ACCESS_KEY` | **secreto** `proysocial-piloto-demo-key` | clave aleatoria ≥ 12 caracteres |
| `DEMO_SESSION_TTL` | variable (opcional) | `2h` por defecto |
| `DEMO_PASE_TTL` | variable (opcional) | `30m` por defecto |
| `DEV_LOGIN_ENABLED` | — | **no definir** (debe seguir apagado) |
| `PGDATABASE` | variable ya existente | `proysocial_piloto` |

## Pruebas ejecutadas (local, base aislada `proysocial_piloto` clonada de `proysocial_dev`)

- `cd backend && npm test` → 67/67 (incluye 6 nuevas de `test/demo.test.js`).
- `PGDATABASE=proysocial_piloto node --env-file=.env --test test/integration/demo.integration.test.js` → 9/9: clave válida/ inválida, fuerza bruta (429), cada uno de los 5 usuarios, rutas por rol, tokens cruzados/forjados, 18 escrituras bloqueadas, navegación de decenas de lecturas (admin y los 4 docentes) sin modificar ninguna tabla, expiración, apagado por `DEMO_ENABLED`/base/`DEV_LOGIN_ENABLED`, y Google/sesión normal sin cambios.
- `node e2e/suites/demo-ui.mjs` → 38/38 en Chrome real con el frontend compilado en el mismo origen: flujo completo, recarga, cambio de usuario, cierre, rutas admin y docente, 1440/1280/820/390 px sin desborde. Capturas en `e2e/salida/demo/`.
- `backend/scripts/demo-humo.mjs` → prueba de humo contra cualquier URL (se usa en el despliegue, ver abajo).

## Despliegue manual (NO se ejecuta solo)

PowerShell, desde la raíz del repositorio. `NPM_CA_PEM` = ruta del certificado que ya usan para `npm` (se monta como secreto de build; no queda en la imagen).

```powershell
$PROJECT = "it-fab-contenido-edu-3"; $REGION = "us-east1"; $SERVICE = "proysocial-piloto"

# 0. Solo lectura: estado actual (anota la revisión vigente para poder volver)
gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="yaml(status.latestReadyRevisionName,spec.template.spec.serviceAccountName,spec.template.spec.containers[0].image,spec.template.spec.containers[0].env)"
$IMG_ACTUAL = gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="value(spec.template.spec.containers[0].image)"
$SA = gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="value(spec.template.spec.serviceAccountName)"
$REVISION_ANTERIOR = gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="value(status.latestReadyRevisionName)"
$BASE = $IMG_ACTUAL -replace '(@sha256:.*|:[^/]+)$',''     # mismo repositorio/imagen de Artifact Registry
$NUEVA = "${BASE}:demo-20261021"

# 1. Construir y publicar (mismo mecanismo de certificado npm; sin Google configurado: VITE_GOOGLE_CLIENT_ID vacío)
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
docker build --secret id=npm_ca,src=$env:NPM_CA_PEM --build-arg VITE_API_URL= --build-arg VITE_GOOGLE_CLIENT_ID= -t $NUEVA .
docker push $NUEVA

# 2. Clave de demostración en Secret Manager (se muestra UNA vez para que la compartas; no queda en archivos)
$clave = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
$tmp = New-TemporaryFile; Set-Content -Path $tmp -Value $clave -NoNewline -Encoding ascii
gcloud secrets create proysocial-piloto-demo-key --project $PROJECT --replication-policy=automatic --data-file=$tmp
Remove-Item $tmp -Force
gcloud secrets add-iam-policy-binding proysocial-piloto-demo-key --project $PROJECT --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
"Clave de demostración: $clave"

# 3. Nueva revisión SIN tráfico, con etiqueta "demo" (solo se actualiza proysocial-piloto; las demás variables y secretos se conservan)
gcloud run services update $SERVICE --project $PROJECT --region $REGION --image $NUEVA `
  --update-env-vars "DEMO_ENABLED=true,DEMO_SESSION_TTL=2h" `
  --update-secrets "DEMO_ACCESS_KEY=proysocial-piloto-demo-key:latest" `
  --no-traffic --tag demo
$URL_DEMO = gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="value(status.traffic.filter(tag=demo).url)"

# 4. Verificación ANTES de abrir al público (rutas privadas, escrituras, /auth/dev inexistente)
$env:DEMO_URL = $URL_DEMO; $env:DEMO_KEY = $clave
node backend/scripts/demo-humo.mjs        # todas las líneas deben ser OK

# 5. Pasar el tráfico a la revisión nueva
gcloud run services update-traffic $SERVICE --project $PROJECT --region $REGION --to-latest
$env:DEMO_URL = gcloud run services describe $SERVICE --project $PROJECT --region $REGION --format="value(status.url)"
node backend/scripts/demo-humo.mjs
```

Si el servicio no admite invocaciones sin autenticar (IAM), la URL con etiqueta pedirá identidad: añade `-H "Authorization: Bearer $(gcloud auth print-identity-token)"` a una prueba manual con `curl` o ejecuta el humo tras el paso 5.

## Operación

| Necesidad | Comando |
|---|---|
| **Apagar la demostración** al instante (los tokens demo dejan de valer) | `gcloud run services update $SERVICE --project $PROJECT --region $REGION --update-env-vars DEMO_ENABLED=false` |
| **Volver a la versión anterior** | `gcloud run services update-traffic $SERVICE --project $PROJECT --region $REGION --to-revisions "$REVISION_ANTERIOR=100"` |
| **Rotar la clave** | `$tmp = New-TemporaryFile; Set-Content $tmp "<nueva>" -NoNewline -Encoding ascii; gcloud secrets versions add proysocial-piloto-demo-key --project $PROJECT --data-file=$tmp; Remove-Item $tmp` y luego `gcloud run services update $SERVICE --project $PROJECT --region $REGION --update-secrets DEMO_ACCESS_KEY=proysocial-piloto-demo-key:latest` (crea revisión nueva) |
| Cerrar sesiones demo ya emitidas sin apagar | Apagar y volver a encender (`DEMO_ENABLED=false` → `true`) no las invalida (siguen vigentes ≤ 2 h); para invalidar de inmediato rota `JWT_SECRET` (cierra también sesiones de Google) |
| Ver errores | `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="proysocial-piloto" AND severity>=WARNING' --project $PROJECT --limit 30` |
| Retirar del todo | Apagar + `gcloud secrets delete proysocial-piloto-demo-key --project $PROJECT` |

## Riesgos restantes

- **Límites por instancia**: el contador de intentos vive en memoria. Con `max-instances > 1` cada instancia cuenta aparte (el límite efectivo se multiplica) y un reinicio lo borra. Mantén `--max-instances 1` o acepta ese margen; la clave debe ser larga y aleatoria (20 caracteres alfanuméricos ≈ 119 bits).
- **Bloqueo por abuso**: quien falle 40 veces seguidas bloquea la entrada por 15 min a todos (denegación temporal deliberada frente a la fuerza bruta distribuida).
- **IP del cliente**: se toma el último valor de `X-Forwarded-For`; detrás de un balanceador/Cloud Armor propio habría que revisarlo.
- **Pantallas con lectura bloqueada**: «Administración → Usuarios» muestra «Error al cargar usuarios» (es el bloqueo, a propósito). Los botones de escritura siguen visibles; al pulsarlos el servidor responde 403 con «Modo demostración: solo lectura».
- **Datos reales de lectura**: la demo expone en lectura todo lo que hay en `proysocial_piloto` a quien tenga la clave. Son datos sintéticos; si algún día se cargan datos reales en esa base, apaga la demostración.
- **`/auth/demo/*` es público** (como `/auth/google`): responde 404 si la demo está apagada.
- La base local usada para probar se llama también `proysocial_piloto` (clon local de `proysocial_dev`); no es la de Cloud SQL.

## Regresión del selector

- `backend/test/loginSelector.test.js` (corre con `npm test`) falla si el login pierde `data-testid="demo-selector"`/`demo-usuario`, si el selector pasa a depender de `import.meta.env.DEV` o de Google, o si la carga vuelve a tragarse errores.
- `e2e/suites/demo-ui.mjs` cubre clave visible sin botón, cinco tarjetas, los cuatro docentes, escrituras 403, aviso de fallo + «Reintentar» (proxy que devuelve 503) y 1440/1280/820/390 px.

## Acceso público sin clave y de solo lectura (`DEMO_PUBLIC_READONLY=true`)

Para que los evaluadores entren con un clic, sin clave, a cualquiera de los cinco perfiles. **La ausencia de clave no da escritura**: la sesión sigue siendo `scope: "demo"` y `requireAuth` bloquea en el servidor todo método distinto de GET/HEAD/OPTIONS y las secciones `/admin/usuarios|correos|importaciones`.

| Variable | Valor en el piloto |
|---|---|
| `DEMO_ENABLED` | `true` |
| `DEMO_PUBLIC_READONLY` | `true` (modo público de solo lectura) |
| `DEMO_OPEN` | **no definir** (escribe; con `DEMO_PUBLIC_READONLY` la demo ni se monta) |
| `DEV_LOGIN_ENABLED` | `false` / ausente |
| `DEMO_ACCESS_KEY` | opcional; en modo público no se usa (sirve para volver al modo con clave) |

Controles añadidos en el servidor:
- **Solo cinco perfiles**: lista cerrada; `correo` debe ser una cadena (arreglos/objetos se rechazan).
- **Apagado automático por datos**: si `usuarios` contiene algo distinto de los cinco sintéticos (o alguna cuenta con Google vinculado), `/auth/demo/*` responde 503 «deshabilitado» y las sesiones demo dejan de valer; se reevalúa cada 60 s (`DEMO_DATOS_TTL_MS`). También exige que la base sea exactamente `proysocial_piloto`.
- **Límites**: 600 peticiones a `/auth/demo/*` y 120 sesiones emitidas por IP cada 15 min, y 3000 sesiones globales → 429 con `Retry-After`.
- **Base caída o credenciales rechazadas**: `/auth/demo/*` → 503 con mensaje claro (nunca sesión); el login lo muestra con «Reintentar».
- `/auth/demo/estado` expone nombre, apellido, correo y rol de los cinco perfiles (sin ids ni fotos).

Pruebas: `backend/test/integration/demo-publico.integration.test.js` (11), `e2e/suites/demo-publico-ui.mjs` (35, compilación de producción, 1440/1280/820/390 px) y `backend/scripts/demo-publico-humo.mjs` (contra cualquier URL, p. ej. la revisión etiquetada antes de pasarle tráfico).
