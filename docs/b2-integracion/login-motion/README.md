# Login · movimiento de marca («una red que cobra vida»)

Solo experiencia visual del login. No toca backend, base de datos, OAuth, JWT ni infraestructura. Sin commits ni despliegue.
Referencia de partida: la geometría del panel izquierdo (7 conexiones y 8 nodos). Se evolucionó su comportamiento; no se añadió fondo nuevo.

## Componentes

| Archivo | Cambio |
|---|---|
| `src/app/pages/LoginMotionBackground.tsx` (nuevo) | `LoginMotionBackground`: red del panel (líneas SVG, nodos y señales HTML, aura, parallax, pausa con pestaña oculta). `LoginMotionMini`: detalle geométrico de la cabecera en tableta/móvil. |
| `src/app/pages/Login.tsx` | Sustituye el `<svg>` estático por el componente; el título se parte en dos líneas enmascaradas; `--i` en los `<li>` de usuarios para el escalonado; mini red en la cabecera. Sin cambios en autenticación. |
| `src/app/pages/login-b2.css` | Bloque «Movimiento» al final (prefijo `lg-`), tokens B2 existentes. Reemplaza `.lg-geo` y el `prefers-reduced-motion` anterior. |
| `e2e/suites/login-motion.mjs` (nuevo) | Verificación en Chrome real: línea de tiempo, rendimiento, reducido, teclado, parallax, tamaños. |
| `e2e/suites/capturas-login-motion-accesos.mjs` (nuevo) | Capturas y comprobaciones de los accesos DEV y demostración abierta. |

Sin bibliotecas nuevas: todo es CSS + 30 líneas de JS (parallax y pausa).

## Movimiento

**Entrada** (una sola vez al montar; CSS con `fill-mode: backwards`, así que si una animación no corre nada queda oculto):

| ms | Elemento | Efecto |
|---|---|---|
| 0–250 | aura, red | aura aparece (1,4 s); nodo central a 100 ms; líneas se trazan en orden orgánico desde el centro (retardos 150–1300 ms, 1,05 s c/u) |
| 150 | «Corporación Unificada Nacional» | fade + 10 px |
| 250 / 380 | «Seguimiento de» / «Proyección Social» | máscara vertical línea por línea, 850 ms, `cubic-bezier(.2,.7,.2,1)` |
| 250 | regla lavanda | `scaleX` 0→1 |
| 450 | descripción | fade + 10 px |
| 500 | tarjeta | opacidad + 16 px + escala .985→1, 750 ms (sin rebotes) |
| 700 | logo ProySocial | revelado por `clip-path`, sin alterar forma/proporción |
| 780 · 840 · 920 · 1000 · 1080 | título, subtítulo, acceso institucional, nota, DEV/demo | fade + 10 px escalonado; todo es interactuable desde el inicio |

**Ambiente** (infinito, solo `transform`/`opacity`):

- Nodos principales (2): pulso de escala 1→1,14, 5,2 s, desfasados.
- Nodos secundarios (6): respiración de opacidad .32→.72, 6,4 s, desfasados.
- Halos (2 nodos): anillo que se expande ×2,6 y se desvanece, 6,8 s.
- Señales (3, ciclos de 11/12/13 s, salen a los 3,4 / 7,2 / 11 s): un punto lavanda recorre una conexión en ~2,4 s; el nodo receptor pulsa ×1,5 al llegar. Nunca hay más de una a la vez.
- Aura: tres gradientes radiales violeta/lavanda; opacidad .62→1 en 11 s.
- Parallax (solo ratón, ≥1024 px, sin movimiento reducido): red ±6 px, luz ±3 px; el formulario no se mueve.
- Pestaña oculta: clase `is-pausada` → `animation-play-state: paused`.

**Microinteracciones**: hover del botón Google (−1 px y sombra suave), esqueleto con brillo mientras carga Google, botones secundarios, tarjetas de usuario (+3 px y sombra, flecha +2 px), aparición escalonada de usuarios (70 ms entre tarjetas), avisos con fade.

**Movimiento reducido** (`prefers-reduced-motion: reduce`): cero animaciones, red completa, señales y halos ocultos, todo visible desde el primer cuadro. Se mantiene el giro lento del indicador de carga.

**Móvil/tableta**: se oculta el panel; queda la mini red en la cabecera (líneas que se trazan + nodos que respiran).

## Verificación (Chrome real, 27/27 en `login-motion`)

- Capturas de la línea de tiempo: `entrada-0000/0250/0600/0900/1300/2200ms-1440.png` (animaciones congeladas en cada instante desde el montaje) y `ambiente-senal-4300/5100/5800/6200ms-1440.png` (señal viajando y nodo respondiendo).
- Tamaños: `login-1440/1280/820/390/360.png`; sin desborde horizontal; 1440×900 completo sin scroll vertical.
- Reducido: `reducido-1440.png`, `reducido-390.png`. Teclado: `teclado-foco-1440.png`.
- Accesos: `dev-*.png` (DEV), `demo-abierta-*.png` (demo sin clave), `demo-clave/` (demo con clave, suite existente `demo-ui` 38/38).
- Regresión: `login-redisenio` 24/24 (acceso DEV, teclado, sesión admin/docente, responsive, zoom 200 %/400 %); `backend npm test`: `demo.test.js` 7/7.
- Estados Google: en este entorno el cliente OAuth está configurado y el botón se renderiza («listo»); «cargando» (esqueleto) se observa durante la carga; «no configurado» se ve en `demo-abierta-*.png` (build sin `VITE_GOOGLE_CLIENT_ID`); «error» y la lógica de OAuth no se modificaron.

## Rendimiento

- 60 fps en reposo; **0 recálculos de layout** en 4 s con todo el ambiente corriendo (Chrome headless sin GPU: CPU del hilo principal ~9–12 %, medida con renderizado por software; con GPU es menor).
- Propiedades animadas: solo `transform` y `opacity` (más `stroke-dashoffset` en el trazado inicial, que termina en ~2,4 s).
- Hallazgo y corrección: los pulsos hechos con `transform` sobre nodos SVG y la señal con `offset-path` forzaban layout en cada cuadro (60 layouts/s). Los nodos y las señales pasaron a elementos HTML (las señales se desplazan en `cqw` sobre `container-type: size`), que se animan en el compositor.
- 17 animaciones infinitas (las 3 señales, 2 halos, 3 «recibe», 2 pulsos, 6 respiraciones, aura).

## Notas y límites

- Redimensionar la ventana cruzando 1024 px oculta/muestra el panel y hace que su entrada se reproduzca de nuevo (comportamiento del navegador con `display:none`); no ocurre en re-renders de React.
- Las señales usan unidades `cqw` (Chrome 105+, Safari 16+, Firefox 110+); en navegadores anteriores las señales no se ven pero la red sigue completa.
- Las capturas con `captureBeyondViewport` (página completa) provocan que el navegador reevalúe los media queries y reinicie la entrada; por eso las capturas son de viewport.
- La modalidad «demostración abierta» (`DEMO_OPEN=true`, sin clave y con escritura) es de un cambio anterior en backend/Login y sigue pendiente de despliegue.
