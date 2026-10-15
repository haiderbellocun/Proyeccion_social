// Indicador de pasos B2: compacto, con el paso actual, lo que falta y navegación hacia pasos ya completados.
export function StepperB2({ pasos, actual, falta, onIr, deshabilitado }: {
  pasos: string[];
  actual: number;
  /** Qué falta para poder avanzar (lo calcula la pantalla con sus propias reglas). */
  falta?: string | null;
  onIr?: (i: number) => void;
  deshabilitado?: boolean;
}) {
  const total = pasos.length;
  return (
    <nav className="b2-steps" aria-label="Pasos de la importación">
      <div className="b2-steps-top">
        <p className="b2-steps-t"><b>Paso {actual + 1} de {total}</b><span>{pasos[actual]}</span></p>
        {falta ? <p className="b2-steps-f" role="status">Falta: {falta}</p> : actual < total - 1 ? <p className="b2-steps-f b2-steps-ok" role="status">Listo para continuar</p> : null}
      </div>
      <ol className="b2-steps-l">
        {pasos.map((s, i) => {
          const hecho = i < actual;
          const activo = i === actual;
          const clicable = hecho && actual < total - 1 && !!onIr && !deshabilitado;
          const marca = (
            <>
              <span className="b2-step-n" aria-hidden="true">{hecho ? "✓" : i + 1}</span>
              <span className="b2-step-l">{s}</span>
              <span className="b2-sr-only">{hecho ? " (completado)" : activo ? " (paso actual)" : ""}</span>
            </>
          );
          return (
            <li key={s} className="b2-step" data-estado={hecho ? "hecho" : activo ? "activo" : "pendiente"} aria-current={activo ? "step" : undefined}>
              {clicable ? <button type="button" className="b2-step-b" onClick={() => onIr!(i)} title={`Volver al paso ${i + 1}`}>{marca}</button> : <span className="b2-step-b">{marca}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
