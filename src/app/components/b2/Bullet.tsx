// Barra «bala» B2: reportado (relleno suave), aprobado (barra oscura) y esperado (marca). Solo presenta porcentajes del backend.
const num1 = (v?: number | null) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`);
const clamp = (v: number | undefined | null) => Math.max(0, Math.min(100, Number(v ?? 0)));

export function Bullet({ rep, apr, esp, nombre }: { rep?: number | null; apr?: number | null; esp?: number | null; nombre: string }) {
  return (
    <span className="b2-bl" role="img" aria-label={`${nombre}: reportado ${num1(rep)}, aprobado ${num1(apr)}, esperado ${num1(esp)}`}>
      <span className="b2-bl-r" style={{ width: `${clamp(rep)}%` }} />
      <span className="b2-bl-a" style={{ width: `${clamp(apr)}%` }} />
      {esp != null && <span className="b2-bl-e" style={{ left: `${clamp(esp)}%` }} />}
      <span className="b2-bl-v">{num1(rep)}</span>
    </span>
  );
}
