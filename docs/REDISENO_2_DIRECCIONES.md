# Rediseño 2.0 — dos direcciones visuales (prototipos)

Estado: **dos prototipos navegables, aislados y solo para desarrollo.** El diseño «Tinta» está descartado. Ninguna de las 21 rutas de la aplicación se ha tocado.

## Cómo abrirlos

Con el frontend de desarrollo en marcha (`npm run dev`, puerto 5173):

| Qué | Dirección |
|---|---|
| Índice del laboratorio | http://localhost:5173/lab/ |
| Concepto A · Gaceta · Panel | http://localhost:5173/lab/a.html#/panel |
| Concepto A · Matriz de seguimiento | http://localhost:5173/lab/a.html#/matriz |
| Concepto A · Componentes | http://localhost:5173/lab/a.html#/componentes |
| Concepto B · Mesa · Panel | http://localhost:5173/lab/b.html#/panel |
| Concepto B · Matriz con eje de tiempo | http://localhost:5173/lab/b.html#/matriz |
| Concepto B · Componentes | http://localhost:5173/lab/b.html#/componentes |

Los prototipos viven en `lab/*.html` y `src/lab/` (no están en el build de producción ni en `routes.tsx`). Los datos salen de `src/lab/data/dev-snapshot.json`, un volcado **sintético** de `proysocial_dev` (generado con `src/lab/data/make-snapshot.mjs`, solo lectura). Capturas a 1440 y 390 px en `docs/lab-capturas/`.

## Skills realmente utilizadas

| Skill | Cómo se usó |
|---|---|
| `emil-design-eng` | Cargada con la herramienta `Skill`. Criterios de interacción aplicados en ambos prototipos. |
| `design-taste-frontend` y `redesign-existing-projects` (plugin Taste Skill 2.0.0) | El registro de skills de esta sesión no incluía los plugins recién instalados (requiere `/reload-plugins`), así que se **leyeron sus instrucciones desde la caché del plugin**. Aviso de su propio autor: `design-taste-frontend` es para páginas públicas, «no para dashboards ni pantallas de aplicación»; se aplicaron sus principios (idea desde el sujeto, sin ornamentos, tipografía y composición) y no su flujo de landing. No se ejecutaron sus scripts `draw`/`inspect`. |
| Impeccable 4.5.2 | Leído desde la caché; se ejecutó su lanzador `context` y su detector `detect`. Se aplicaron `critique` (por mí, con capturas), `shape` (briefs de cada concepto), `distill`, `audit` (auditoría automática propia) y `polish`. No se escribió PRODUCT.md/DESIGN.md (su `init` exige entrevista contigo). La crítica se hizo en un solo contexto, no con los dos sub-agentes aislados que su protocolo exige, salvo el detector, que sí corrió en un sub-agente aparte. |
| `ui-ux-pro-max` y `frontend-design` | Ya cargadas antes en la sesión; guiaron la tipografía y los contrastes. |

## Crítica de Tinta (con evidencia de la captura `TINTA-rechazado-panel-1440.png`)

- **Plantilla SaaS reconocible.** Barra lateral azul marino + botón primario azul + paneles blancos con borde: es la misma silueta de cientos de paneles de administración. El logotipo y el nombre podrían ser de cualquier producto.
- **Plantilla de «número grande».** Cinco tarjetas con icono, cifra y subtítulo en la primera fila del panel. Es el patrón que Impeccable y Taste prohíben expresamente.
- **Demasiados contenedores.** En una sola pantalla hay ~8 paneles con borde, cada uno con su propio título + descripción. La jerarquía se logra con cajas, no con tipografía.
- **Gráficos sin pregunta.** «Cumplimiento por programa» dibuja un gráfico de 250 px para un único dato (un programa); «Evolución» es una rejilla 0–12 casi vacía después de la semana 4.
- **Información duplicada.** Dos columnas de píldoras («Riesgo» y «Estado») dicen lo mismo («Crítico» / «Con retraso»); «Brecha −51» y «Vencidos 51» repiten la cifra.
- **Matriz monótona.** Todas las filas pesan igual; la dimensión que importa (el tiempo, las 16 semanas) no se ve; el estado se repite como píldora en cada fila.
- **Una sola voz tipográfica** (Geist en todo): no hay jerarquía de carácter, solo de peso.
- **Arcoíris de píldoras** (azul, cian, violeta, ámbar, rojo, verde) sin una lógica de acento.
- El detector mecánico de Impeccable devolvió 0 hallazgos sobre Tinta: **no avala el diseño**, solo mide anti-patrones detectables por reglas; la crítica anterior sale de las capturas.

## Las dos direcciones

### A · Gaceta (editorial operativa)
Idea: **el semestre es una edición impresa de 16 semanas** y cada semana es un capítulo con sus entregables.
- Sin barra lateral: cabecera de edición (regla gruesa, nombre en serif, navegación textual con subrayado) y una **regla del semestre** de 16 columnas que hace de gráfico y de navegación.
- Tipografía: Newsreader (serif, titulares, cifras) + Instrument Sans (interfaz). Las cifras clave van **dentro de una frase** («Llevas 20,5 % reportado frente a 40,9 % esperado: 22 entregables por detrás…»).
- Paleta: papel frío, tinta verde-negra, verde pino (marca/aprobado), rojo sello (vencido), ocre, petróleo. Sin azul/cian/violeta, sin gradientes ni sombras en reposo.
- Superficies por **tono**, no por bordes; estados con forma + texto, no píldoras.
- Matriz como **capítulos por semana** con numeral grande, semanas aprobadas plegadas, observaciones en cursiva y detalle como lectura (serif) con notas al margen.

### B · Mesa (centro de operaciones)
Idea: **la cola de revisión es una mesa de trabajo con eje de tiempo.**
- Barra superior negra con búsqueda de comando (`/`), **riel de 56 px** (barra inferior en móvil), gris «papel milimetrado» y un único acento: amarillo marcador para selección y «hoy».
- Tipografía: IBM Plex Sans Condensed (tablas) + Plex Sans (títulos) + Plex Mono solo para datos (semanas, fechas, cifras).
- Panel: franja de estado (barra apilada + chips que filtran), **cola de trabajo** (rejilla con teclado `j/k/Enter/a/o/x/Esc`), **inspector** lateral, y docentes con gráfico de bala (reportado/aprobado/esperado en una sola barra).
- Matriz: **rejilla con las 16 semanas**: cada entregable es una barra sobre el eje, con columna «hoy», rayado rojo en vencidos y grupos por fase plegables.

## Comparación (observaciones, sin puntuación)

| Dimensión | A · Gaceta | B · Mesa |
|---|---|---|
| 1. Identidad visual | Reconocible y propia: serif + papel + verde pino; recuerda a una publicación académica. Es la más alejada de «SaaS». | Reconocible como herramienta de operación: barra negra, rejilla, marcador amarillo. Menos «cálida», más seria. |
| 2. Calidad tipográfica | Alta: contraste serif/sans, cifras en prosa, numerales de semana. El serif a 20 px funciona para leer, no para escanear tablas. | Buena y funcional: condensada permite más texto por fila; el mono de datos alinea fechas y semanas. Menos personalidad que A. |
| 3. Claridad del dashboard | Responde en una frase (qué pasa y qué hacer) y luego lista; mejor para **entender**. La lista «por revisar» muestra 6 de 9; no permite resolver desde ahí. | Responde con la cola y el inspector; mejor para **actuar**: se aprueba/observa sin salir. Más información simultánea (menos jerarquía narrativa). |
| 4. Legibilidad de matrices | Lectura cómoda por semana; el contexto temporal es el capítulo. Es larga (88 filas), sin vista de conjunto de las 16 semanas. | La rejilla muestra todas las semanas a la vez y qué está atrasado de un vistazo; títulos truncados en una línea. Más densa, requiere más atención. |
| 5. Navegación | Navegación textual simple; con 8 ítems en cabecera empieza a llenarse. La regla de semanas navega por capítulos. | Riel + búsqueda de comando + atajos: más eficiente para uso diario; los iconos sin etiqueta visible dependen de tooltips (curva de aprendizaje). |
| 6. Densidad | Media-baja, con mucho aire. | Alta; filas de ~28 px. |
| 7. Calidad de componentes | Botones, campos, tooltip, toast, diálogo nativo y menú con transiciones medidas. | Ídem, más cuidado en teclado (cuadrícula con `aria-activedescendant`, `kbd`, hoja inferior). |
| 8. Móvil (390 px) | Buena: capítulos apilados, menú de texto; sin desbordes. | Buena: barra inferior de 5 destinos, filas de 2 líneas con tira de 16 celdas, inspector como hoja. |
| 9. Accesibilidad | Foco visible, `inert` en detalles cerrados, estados con forma + texto, contraste ≥ 4,5:1 en tokens de texto, `prefers-reduced-motion`. Auditoría: sin desbordes ni controles sin nombre. | Igual de completa; rejilla con roles ARIA, atajos con alternativa por ratón. Auditoría: sin desbordes ni controles sin nombre. |
| 10. Diferencia frente a Tinta | Muy alta (sin sidebar, sin paneles, tipografía editorial). | Alta (sin tarjetas de KPI ni azul; pero conserva un riel lateral y fondo de paneles, más cercano en estructura). |

## Verificación realizada

- Navegador real (Chrome) a 1440, 1280, 820 y 390 px en las tres vistas de cada concepto; auditoría automática propia: sin desbordamiento horizontal, sin ids duplicados, sin controles sin nombre ni campos sin etiqueta, consola limpia.
- Detector de Impeccable: **0 hallazgos** en ambos prototipos tras corregir 4 «side-tab» (franjas laterales de selección) que había en B.
- Interacciones comprobadas: tooltip con retraso de 400 ms y segundo tooltip instantáneo, menú con `Esc`, cola de B con `j j` + `a` (toast «Deshacer»).
- `npm run typecheck` sin errores.

## Límites conocidos

- Los datos del prototipo son una instantánea fija; las acciones (aprobar, enviar, etc.) cambian estado solo en memoria.
- En A, la semana actual (8) no tiene entregables en los datos, así que no aparece como capítulo (sí en la regla).
- Las pantallas de Revisión, Importador, Evidencias y las demás **no** están diseñadas: se harán con la dirección elegida.
- No se midieron todos los contrastes de los acentos con una herramienta; se verificaron los tokens de texto principales.
- Fuentes de los prototipos añadidas como `devDependencies` (`@fontsource…`); se pueden retirar si se descartan.

---

## B v2 · Mesa con referencia visual CONDUCTOR (etapa actual)

Prototipo B reconstruido para parecerse a la referencia `docs/referencia/conductor.png`, conservando la interacción de B (inspector acoplado, cola con teclado, acciones optimistas con «Deshacer»). **No se tocó ninguna ruta real, backend, API ni datos.** Backup de B v1: `C:\app_Proyec_social_backups\lab-b-mesa-v1\`.

URLs: http://localhost:5173/lab/b.html#/panel · `#/matriz` · `#/revision` · `#/indicadores` · `#/admin` · `#/componentes` (menú de usuario → «Cambiar a vista docente» para ver Mi panel, Mi matriz, Iniciativas, Evidencias, Historial).

Capturas en `docs/lab-capturas/B2-*.png` (1440, 1280, 820, 390; comparaciones lado a lado `B2-comparacion-*.png`).

### Tokens (`src/lab/b/tokens.css`)
Cabecera `#261E36` · barra de contexto `#242329` · primario `#503296` (hover `#432983`) · selección `#EDEAF5` · fondo `#F6F6F6` · superficies `#FFFFFF` · barras `#666B7F` · vencido `#D31312` · divisores `#E6E5EA`/`#D6D5DD` · texto `#201C2B`. Tipografía Nunito Sans (humanista; la de la referencia no se identificó). Medidas: cabecera 48, contexto 32, lateral 52/212, fila 34, encabezado de tabla 46.

### Componentes
Cabecera (logo propio, módulos por rol, búsqueda `/`, notificaciones, ayuda, menú de cuenta) · barra lateral contextual con tooltips y expansión · barra de contexto/filtros · Matriz (tabla sticky + cronograma por días reales, escala semanal/mensual, línea y banda de hoy, grupos fase→iniciativa→entregable, selección, teclado, columnas, filtros, búsqueda, ampliar) · lista móvil por semana/mes · inspector (columna, cajón, hoja inferior) · panel admin (cola, indicadores, alertas, semanas, docentes) · Revisión · Indicadores · Administración · Sistema de diseño · barra inferior móvil.

### Verificación
Chrome real a 1440/1280/820/390: sin desbordes horizontales, consola limpia, `typecheck` sin errores, detector de Impeccable 0 hallazgos, un `h1` por vista. Auditoría: solo quedan 1–2 `input` de 20 px de alto dentro de etiquetas clicables.

### Diferencias conocidas frente a la referencia
- Sin conectores de dependencias entre barras (no hay datos de dependencias).
- Fuente distinta (Nunito Sans); logo y textos propios.
- Barra lateral con iconos de estado coloreados en lugar de iconos genéricos monocromos.
- En la vista de administración la columna «Docente» repite el mismo nombre (los datos de ejemplo tienen un solo docente con matriz).
- Etiquetas junto a las barras pueden quedar cortadas bajo la columna fija al desplazar.
- Figma no se usó (sin conexión autorizada probada).
- Skills: `emil-design-eng` por Skill; Taste/Impeccable leídas desde la caché del plugin (detector y criterios aplicados por mí, sin sub-agentes aislados).

---

## B2 · pulido final (tras aprobación de la dirección)

Capturas finales: `docs/lab-capturas/d-*.png` (panel, matriz, inspectores y móvil a 390; 1440, 1280 y 820).

Ajustes: barra lateral (iconos de 18 px, punto de aviso en lugar de contadores cuando está colapsada, contador solo con etiquetas, estado activo con anillo); matriz (columnas ajustadas, tabla compacta cuando el inspector reduce el ancho, líneas más contrastadas, fila seleccionada con filetes violeta, sin etiquetas cortadas junto a las barras); panel (pendientes y «por revisar» con más peso, dos columnas sin huecos, gráfica semanal con valores y semanas futuras atenuadas, leyendas); revisión (la tabla no tiene botones; la decisión se toma en el inspector con confirmación al aprobar y comentario obligatorio al observar; «Deshacer» se mantiene); móvil (etiquetas completas, buscador y controles de 40 px, «Semana actual» frente a «Consultando» y «Volver a hoy», enlaces de evidencia visibles, estado y vencimiento legibles).

Roles: «Laura Gómez» era un nombre inventado por el prototipo; en los datos Laura Gomez es **docente**. El administrador ahora es «Admin Sistema» (del snapshot) y las vistas admin/docente están separadas. Solo cambia un valor local de demostración; no se toca la autenticación.

Pruebas: 41 comprobaciones automáticas en Chrome a 1440/1280/820/390 (navegación, filtros, búsqueda, selección, inspector, teclado, escala, Hoy, sticky, revisión simulada con confirmación y deshacer, cambio de semana, hoja inferior) — todas correctas tras corregir 1 fallo propio; `typecheck` limpio; consola limpia; detector de Impeccable 0 hallazgos.
