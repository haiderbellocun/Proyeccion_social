# Pruebas E2E (Chrome por CDP)

Suites de regresión que manejan un Chrome real (headless) contra la aplicación en marcha y la base de desarrollo `proysocial_dev`. No dependen de librerías externas: solo Node 20+ y Chrome instalado.

## Requisitos
- Chrome o Chromium instalado (o `CHROME_PATH` con la ruta del ejecutable).
- Frontend en `http://localhost:5173` (`npm run dev`) y backend en `http://localhost:4000` ejecutándose con `.env.dev`, apuntando a **`proysocial_dev`**.
- Datos sembrados de desarrollo (usuarios `@proysocial.local`: administrador, María, Carlos, Andrés, Laura).
- Credenciales de PostgreSQL en `backend/.env` (no se copian ni se versionan aquí). Las suites que consultan la BD fuerzan `PGDATABASE=proysocial_dev` y **abortan** si la base conectada es otra.

## Cómo ejecutar
```
npm run e2e                       # todas, en serie y en orden
npm run e2e -- docente matrices   # solo algunas
npm run e2e:lista                 # lista de suites
node e2e/run.mjs responsive-docente
```
Variables opcionales: `CHROME_PATH`, `APP_URL` (def. `http://localhost:5173`), `API_URL` (def. `http://localhost:4000`), `E2E_OUT` (capturas; def. `e2e/salida/`, ignorada por git).

## Nunca en paralelo
Las suites comparten la BD de desarrollo y crean fixtures temporales; ejecutarlas a la vez provoca fallos falsos. `run.mjs` y cada suite toman un bloqueo (`proysocial-e2e.lock` en la carpeta temporal del sistema, con el PID); una segunda ejecución termina con un mensaje claro (código 3). El bloqueo se libera al terminar, con Ctrl+C o si el proceso muere. Cada suite abre su propio Chrome en un puerto libre y perfil temporal.

## Suites
| Suite | Qué cubre | Escribe en BD |
|---|---|---|
| `regresion-shell` | Shell B2 admin/docente, navegación, permisos, estados de error, responsive | No |
| `matrices` | Matrices (admin y docente), filtros, inspector, casos sin matriz / calendario inválido | No |
| `revision` | Cola de revisión (lectura y flujos sin escritura) | No |
| `revision-evidencias` | Revisión + evidencias con fixture `TSTE3` | Sí (limpia) |
| `importador` | Importador Excel con xlsx sintéticos `TSTE4` (semestre 2099A) | Sí (limpia) |
| `docente` | Portal docente completo con fixture `TSTE5` de Andrés | Sí (limpia) |
| `responsive-docente` | Capturas y desbordes a 1440/1280/820/390 | No |
| `administracion` | Administración (seis pestañas): navegación, identidad B2, lectura/filtros, permisos y reglas del backend, estados de error/carga, escrituras con fixtures `TSTA4C` y semestres `2098A`/`2097A`, responsive 1440/1280/820/390 | Sí (limpia) |
| `capturas-administracion` | Capturas de las seis pestañas (listas, inspectores, formularios abiertos sin guardar) en `E2E_OUT` o en la carpeta que se pase como argumento | No |
| `indicadores` | Indicadores y Métricas (Avance consolidado, Indicadores por grupo, Reportes y métricas): compara la interfaz con las respuestas reales de la API (filas, indicadores, gráficos, filtros «(filtrado)», orden, enlaces profundos), respuestas tardías, estados de carga/error, permisos (403/401), accesibilidad (leyendas, tablas de datos, teclado) y responsive 1440/1280/820/390 | No (solo lectura; verifica que la BD no cambia) |
| `piloto-ui` | Recorrido completo por INTERFAZ en una base aislada (`proysocial_test`) con su propio backend (puerto 4331) que sirve el frontend compilado en el mismo origen: docente → administrador → docente → aprobación, asignar/quitar docentes desde grupos, navegación de todas las rutas por rol, permisos y sesión revocada. No usa `proysocial_dev` ni SQL del espejo. Requiere `npm run test:db:setup` en `backend/`; se ejecuta con `node e2e/suites/piloto-ui.mjs` | Sí, solo en `proysocial_test` (limpia) |
| `seguimiento-ui` | Seguimiento operativo (`/admin/avance`) por INTERFAZ en una base aislada (`proysocial_test`) con su propio backend (puerto 4332) y datos sintéticos `TST_SG`: cifras de pantalla = API = PostgreSQL, filtros combinados, cambio rápido de filtros con respuesta tardía, detalle del docente, navegación a matriz, revisión, indicadores e iniciativas, estados vacíos y de error, responsive 1440/1280/820/390. No usa `proysocial_dev`. Se ejecuta con `node e2e/suites/seguimiento-ui.mjs` | Sí, solo en `proysocial_test` (limpia) |
| `demo-ui` | Modo demostración del piloto por INTERFAZ en la base local aislada `proysocial_piloto` (clon de `proysocial_dev`) con su propio backend (puerto 4340) que sirve el frontend compilado: clave válida/inválida, cinco usuarios, navegación admin y docente, solo lectura, recarga, cambio de usuario y responsive 1440/1280/820/390. Se ejecuta con `node e2e/suites/demo-ui.mjs [carpeta]` (ver `docs/DEMOSTRACION_PILOTO.md`) | No |
| `login-motion` | Login animado (movimiento de marca): línea de tiempo de entrada con animaciones congeladas, rendimiento (fps, layouts, CPU), pausa con pestaña oculta, parallax, `prefers-reduced-motion`, teclado y responsive 1440/1280/820/390/360; `node e2e/suites/login-motion.mjs [carpeta]` (ver `docs/b2-integracion/login-motion/README.md`) | No |
| `capturas-login-motion-accesos` | Capturas de los accesos DEV y demostración abierta con el login animado (requiere dos frontends/backends locales, ver cabecera del archivo) | No |
| `capturas-seguimiento` | Capturas de Seguimiento (página completa) a 1440/1280/820/390 con el acceso de desarrollo local: `node e2e/suites/capturas-seguimiento.mjs <carpeta> [ruta]` | No |
| `capturas-indicadores` | Capturas de las tres pantallas (listas, inspectores, filtros aplicados) y `comparacion-api.md` (interfaz vs. API) en `E2E_OUT` o en la carpeta que se pase como argumento **relativa a la raíz del repo** (p. ej. `docs/b2-integracion/etapa5a`) | No |

Los fixtures llevan un prefijo identificable y cada suite elimina únicamente lo que creó, comparando conteos de la BD antes y después («BD tras limpiar»).

## Interpretar la salida
Cada comprobación imprime `OK` o `FALLA` con su detalle; `run.mjs` resume por suite y devuelve código ≠0 si hay una falla no esperada. Algunas pruebas simulan caídas de red o errores 500 y la consola del navegador registra ese error a propósito: esas líneas `FALLA … consola sin errores — Error al cargar dashboard admin / Failed to fetch` se cuentan como **esperadas**.

## Añadir una prueba
1. Crea `e2e/suites/<nombre>.mjs`; empieza con `import { lanzar, pausa, iniciarSuite, guardaBD } from "../lib/helpers.mjs"; iniciarSuite("<nombre>");`.
2. Usa `login`, `api`, `ir`, `E/EA`, `guardaBD()`, `instantanea()` de `lib/helpers.mjs`; acumula líneas con `OK   …`/`FALLA …` y haz `console.log` al final.
3. Si escribes datos: prefijo propio (p. ej. `TSTC4`), limpieza en `finally` y comparación de conteos.
4. Añade el nombre a `ORDEN` en `run.mjs` si importa el orden y a la tabla de arriba.
No incluyas secretos, rutas personales ni datos institucionales reales.

## Suite `administracion`
- `ADM_SOLO=6a,6c node e2e/suites/administracion.mjs` ejecuta solo algunas secciones al depurar (ids: `1` navegación, `2` identidad, `3a`–`3f` lectura, `4` permisos, `5` errores/carga, `6a`–`6h` escrituras, `7` responsive, `8` regresión). Algunas secciones de escritura dependen de fixtures creados por las anteriores (`6a` → `6c` → `6d`…); la limpieza final borra solo lo que lleva el prefijo `TSTA4C` y los semestres `2098A`/`2097A`.
- Las reglas de seguridad se comprueban contra el backend real sin riesgo: se intenta eliminar/desactivar la propia cuenta administradora y eliminar el semestre activo (el backend responde 409 antes de escribir) y se verifica por BD que nada cambió. La activación de semestres solo se prueba hasta el diálogo de confirmación, que se cancela.
- Al final compara los conteos de usuarios, escuelas, programas, proyectos, grupos, plantillas y semestres con los iniciales y barre residuos.


## Recursos, limpieza y registro (ejecutor `run.mjs`)
El ejecutor corre las suites **una a una** y cuida los recursos del equipo:
- **Cierre garantizado de Chrome:** `lib/cdp.mjs` registra cada navegador lanzado y lo cierra (árbol completo de procesos + perfil temporal) al terminar la suite, ante errores no capturados, Ctrl+C o `SIGTERM`. `cerrar()` es idempotente y cada comando CDP tiene un tiempo máximo (`E2E_CDP_TIMEOUT_MS`, def. 60 s).
- **Procesos huérfanos propios:** `lib/entorno.mjs` cierra únicamente los Chrome cuyo perfil lleva el prefijo `proysocial-e2e-chrome-` y cuyo proceso padre ya no existe, y borra esos perfiles temporales sin uso. Nunca toca otros Chrome ni otros programas. Se ejecuta al iniciar, tras cada suite y al terminar.
- **Memoria:** antes de cada suite se exige `E2E_MIN_FREE_MB` (def. 700) de memoria disponible; si no se alcanza en 60 s, se detiene ordenadamente. Durante una suite, si baja de `E2E_ABORT_FREE_MB` (def. 450) se interrumpe esa suite y las restantes quedan «NO EJECUTADA (memoria)». Código de salida 4 y resultados parciales guardados.
- **Tiempo máximo por suite:** `E2E_SUITE_TIMEOUT_MS` (def. 30 min); al agotarse se cierra el árbol del proceso y se marca «TIEMPO AGOTADO».
- **Bloqueo:** `proysocial-e2e.lock` evita ejecuciones duplicadas; un bloqueo cuyo PID ya no existe se reemplaza solo.
- **Registro:** `e2e/salida/resultados/<fecha>/<suite>.log` y `resumen.json`; `e2e/salida/ultimo-resumen.json` guarda el último estado por suite junto con una huella de las fuentes (`src/`, `backend/src/`, `e2e/`, sin `.md`).
- **Reutilización segura:** `node e2e/run.mjs --reanudar` omite las suites que salieron OK en la última ejecución **solo si la huella de las fuentes no cambió**; si algo cambió, se vuelven a correr.
- Códigos de salida: 0 todo bien · 1 falla real o suite rota · 4 interrumpido por memoria.
