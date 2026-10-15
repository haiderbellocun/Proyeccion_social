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
| `administracion` | Administración (seis pestañas), fixtures `TSTC4` | Sí (limpia) |

Los fixtures llevan un prefijo identificable y cada suite elimina únicamente lo que creó, comparando conteos de la BD antes y después («BD tras limpiar»).

## Interpretar la salida
Cada comprobación imprime `OK` o `FALLA` con su detalle; `run.mjs` resume por suite y devuelve código ≠0 si hay una falla no esperada. Algunas pruebas simulan caídas de red o errores 500 y la consola del navegador registra ese error a propósito: esas líneas `FALLA … consola sin errores — Error al cargar dashboard admin / Failed to fetch` se cuentan como **esperadas**.

## Añadir una prueba
1. Crea `e2e/suites/<nombre>.mjs`; empieza con `import { lanzar, pausa, iniciarSuite, guardaBD } from "../lib/helpers.mjs"; iniciarSuite("<nombre>");`.
2. Usa `login`, `api`, `ir`, `E/EA`, `guardaBD()`, `instantanea()` de `lib/helpers.mjs`; acumula líneas con `OK   …`/`FALLA …` y haz `console.log` al final.
3. Si escribes datos: prefijo propio (p. ej. `TSTC4`), limpieza en `finally` y comparación de conteos.
4. Añade el nombre a `ORDEN` en `run.mjs` si importa el orden y a la tabla de arriba.
No incluyas secretos, rutas personales ni datos institucionales reales.
