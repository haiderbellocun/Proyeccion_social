import { useEffect, useRef, type CSSProperties } from "react";

/* Red animada del panel de identidad del login. Evoluciona la geometría original (7 conexiones, 8 nodos):
 * las líneas se trazan desde el nodo central, los nodos respiran con ritmos distintos y, de vez en cuando,
 * una señal recorre una conexión y el nodo receptor responde. Todo el movimiento es CSS (transform/opacity/
 * stroke-dashoffset); el único JS es el parallax del cursor y la pausa con la pestaña oculta.
 * Decorativo: aria-hidden y sin eventos de puntero. Estilos: login-b2.css (prefijo lg-). */

type Conexion = { d: string; retardo: number };
const CONEXIONES: Conexion[] = [
  { d: "M280 330 120 440", retardo: 0.15 },
  { d: "M280 330 460 400", retardo: 0.3 },
  { d: "M280 330 330 170", retardo: 0.45 },
  { d: "M330 170 190 120", retardo: 0.8 },
  { d: "M330 170 480 110", retardo: 0.95 },
  { d: "M460 400 520 280", retardo: 1.1 },
  { d: "M120 440 60 330", retardo: 1.3 },
];

type Nodo = {
  cx: number;
  cy: number;
  r: number;
  /** principal: pulso de escala; el resto respira con la opacidad */
  principal?: boolean;
  relleno?: boolean;
  entra: number;
  /** ciclo de la señal que llega a este nodo (1..3) */
  recibe?: 1 | 2 | 3;
  halo?: boolean;
  fase: number;
};
const NODOS: Nodo[] = [
  { cx: 280, cy: 330, r: 13, principal: true, relleno: true, entra: 0.1, recibe: 2, halo: true, fase: 0 },
  { cx: 330, cy: 170, r: 8, principal: true, relleno: true, entra: 1.0, recibe: 1, halo: true, fase: 1.6 },
  { cx: 120, cy: 440, r: 6, relleno: true, entra: 0.7, fase: 0.8 },
  { cx: 460, cy: 400, r: 11, entra: 0.85, fase: 2.4 },
  { cx: 480, cy: 110, r: 9, entra: 1.5, recibe: 3, fase: 3.1 },
  { cx: 190, cy: 120, r: 7, entra: 1.35, fase: 1.2 },
  { cx: 520, cy: 280, r: 6, entra: 1.65, fase: 3.8 },
  { cx: 60, cy: 330, r: 7, entra: 1.85, fase: 0.4 },
];

// Señales: pocas, lentas y escalonadas (ciclos de 11–13 s; la señal viaja ~20 % del ciclo).
const SENALES = [
  { de: [280, 330], a: [330, 170], ciclo: 12, retardo: 3.4 },
  { de: [120, 440], a: [280, 330], ciclo: 11, retardo: 7.2 },
  { de: [330, 170], a: [480, 110], ciclo: 13, retardo: 11 },
] as const;
const CICLO_RECIBE: Record<1 | 2 | 3, { ciclo: number; retardo: number }> = {
  1: { ciclo: SENALES[0].ciclo, retardo: SENALES[0].retardo },
  2: { ciclo: SENALES[1].ciclo, retardo: SENALES[1].retardo },
  3: { ciclo: SENALES[2].ciclo, retardo: SENALES[2].retardo },
};

const vars = (o: Record<string, string | number>) => o as CSSProperties;

export function LoginMotionBackground() {
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;

    // Pausa las animaciones ambientales cuando la pestaña no está visible.
    const alVisibilidad = () => el.classList.toggle("is-pausada", document.hidden);
    document.addEventListener("visibilitychange", alVisibilidad);
    alVisibilidad();

    // Parallax discreto (solo ratón, escritorio, sin movimiento reducido): ±6 px en la red y ±3 px en la luz.
    const fino = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const aplicar = () => {
      frame = 0;
      el.style.setProperty("--px", `${(x * 6).toFixed(2)}px`);
      el.style.setProperty("--py", `${(y * 6).toFixed(2)}px`);
    };
    const alMover = (e: PointerEvent) => {
      if (!fino.matches || reducido.matches || e.pointerType !== "mouse") return;
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = window.requestAnimationFrame(aplicar);
    };
    window.addEventListener("pointermove", alMover, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", alVisibilidad);
      window.removeEventListener("pointermove", alMover);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={raiz} className="lg-motion" aria-hidden>
      <div className="lg-aura" />
      <div className="lg-geo-wrap">
        <svg className="lg-geo" viewBox="0 0 560 560" fill="none">
          <g className="lg-lineas" strokeWidth="1.4" strokeLinecap="round">
            {CONEXIONES.map((c) => (
              <path key={c.d} d={c.d} pathLength={1} className="lg-traza" style={vars({ "--d": `${c.retardo}s` })} />
            ))}
          </g>
        </svg>
        {/* Señales: todos los tramos son rectos, así que viajan con transform (compositor) en unidades del contenedor (cqw). */}
        {SENALES.map((g) => {
          const u = (v: number) => ((v / 560) * 100).toFixed(3);
          return (
            <span
              key={g.de.join("-")}
              className="lg-sg"
              style={vars({ "--x0": u(g.de[0]), "--y0": u(g.de[1]), "--x1": u(g.a[0]), "--y1": u(g.a[1]), "--ciclo": `${g.ciclo}s`, "--ret": `${g.retardo}s` })}
            >
              <span className="lg-sg-halo" />
              <span className="lg-sg-punto" />
            </span>
          );
        })}
        {/* Nodos como elementos HTML: sus pulsos (transform/opacity) se animan en el compositor, sin recalcular layout. */}
        {NODOS.map((n) => {
          const pc = (v: number) => `${((v / 560) * 100).toFixed(3)}%`;
          return (
            <span
              key={`${n.cx}-${n.cy}`}
              className="lg-nd"
              style={vars({ left: pc(n.cx), top: pc(n.cy), width: pc(n.r * 2), height: pc(n.r * 2), margin: `-${pc(n.r)} 0 0 -${pc(n.r)}`, "--d": `${n.entra}s` })}
            >
              {n.halo && <span className="lg-nd-halo" style={vars({ "--f": `${n.fase}s` })} />}
              <span
                className={n.recibe ? "lg-nd-recibe" : "lg-nd-fijo"}
                style={n.recibe ? vars({ "--ciclo": `${CICLO_RECIBE[n.recibe].ciclo}s`, "--ret": `${CICLO_RECIBE[n.recibe].retardo}s` }) : undefined}
              >
                <span
                  className={`lg-nd-core ${n.principal ? "es-principal" : "es-secundario"} ${n.relleno ? "es-relleno" : "es-anillo"}`}
                  style={vars({ "--f": `${n.fase}s` })}
                />
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Detalle geométrico mínimo para la cabecera móvil/tableta (sustituye al panel de identidad oculto). */
export function LoginMotionMini() {
  const pts: [number, number][] = [[10, 22], [40, 9], [72, 21], [108, 8]];
  return (
    <svg className="lg-mini" viewBox="0 0 120 30" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M10 22 40 9 72 21 108 8" pathLength={1} className="lg-traza" style={vars({ "--d": "0.5s" })} />
      </g>
      {pts.map(([cx, cy], i) => (
        <g key={cx} className="lg-nodo-entra" style={vars({ "--d": `${0.5 + i * 0.25}s` })}>
          <circle className="lg-nodo lg-nodo-s" cx={cx} cy={cy} r={i % 2 ? 3 : 4} fill="currentColor" style={vars({ "--f": `${i * 0.9}s` })} />
        </g>
      ))}
    </svg>
  );
}
