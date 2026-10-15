// Kit de gráficos B2 para Indicadores y Métricas. Solo presenta valores que entrega el backend: ninguna pieza calcula indicadores.
// Cada gráfico responde una pregunta (Figura), usa etiquetas con valores y patrones además del color, y ofrece una tabla de datos equivalente.
import { useId, type ReactNode } from "react";
import { Inspector } from "./ui";
import "./b2-charts.css";

export const pct = (v?: number | null) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`);
export const n0 = (v?: number | null) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 }));
const clamp = (v: number | undefined | null, max = 100) => Math.max(0, Math.min(100, ((Number(v ?? 0) || 0) / max) * 100));

/** Series visuales: cada una se distingue por relleno/patrón, no solo por color. */
export type Serie = "rep" | "apr" | "esp" | "pen" | "obs" | "ven" | "sin" | "neutro" | "a" | "b" | "c" | "d";

/* ───────── figura: una pregunta, un gráfico ───────── */
export function Figura({
  pregunta, nota, leyenda, children, tabla, acciones, vacio,
}: {
  pregunta: string;
  nota?: ReactNode;
  leyenda?: { s: Serie; label: string }[];
  children: ReactNode;
  tabla?: { titulo?: string; cabeceras: string[]; filas: (string | number)[][] };
  acciones?: ReactNode;
  /** Si se define, reemplaza el gráfico por este mensaje (estado vacío). */
  vacio?: ReactNode;
}) {
  const id = useId();
  return (
    <figure className="b2-fig" aria-labelledby={id}>
      <figcaption className="b2-fig-h">
        <div>
          <h3 id={id}>{pregunta}</h3>
          {nota && <p>{nota}</p>}
        </div>
        {acciones}
      </figcaption>
      {leyenda && leyenda.length > 0 && !vacio && <Leyenda items={leyenda} />}
      {vacio ? <div className="b2-fig-vacio" role="status">{vacio}</div> : children}
      {tabla && !vacio && (
        <details className="b2-fig-tabla">
          <summary>{tabla.titulo ?? "Ver datos en tabla"}</summary>
          <div className="b2-fig-tabla-w">
            <table className="b2-tabla-datos">
              <thead><tr>{tabla.cabeceras.map((c, i) => <th key={c} scope="col" className={i > 0 ? "b2-c-num" : undefined}>{c}</th>)}</tr></thead>
              <tbody>{tabla.filas.map((f, i) => <tr key={i}>{f.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="b2-c-num">{c}</td>))}</tr>)}</tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

export function Leyenda({ items }: { items: { s: Serie; label: string }[] }) {
  return (
    <ul className="b2-leg" aria-label="Leyenda">
      {items.map((it) => (
        <li key={it.s + it.label}><i className="b2-sw" data-s={it.s} aria-hidden="true" />{it.label}</li>
      ))}
    </ul>
  );
}

/* ───────── bala por fila: reportado / aprobado / esperado ───────── */
export interface FilaBala {
  id: string | number;
  etiqueta: string;
  sub?: string;
  rep?: number | null;
  apr?: number | null;
  esp?: number | null;
  /** Texto a la derecha (p. ej. «33 vencidos»). */
  extra?: ReactNode;
  /** Marca de atención (se anuncia con texto, no solo color). */
  alerta?: string;
}
export function FilasBala({ filas, onAbrir, seleccionada, etiqueta }: { filas: FilaBala[]; onAbrir?: (id: FilaBala["id"]) => void; seleccionada?: FilaBala["id"] | null; etiqueta: string }) {
  return (
    <ul className="b2-fb" aria-label={etiqueta}>
      {filas.map((f) => {
        const cuerpo = (
          <>
            <span className="b2-fb-n">
              <span className="b2-tt" title={f.etiqueta}>{f.etiqueta}</span>
              {f.sub && <span className="b2-sub">{f.sub}</span>}
            </span>
            <span className="b2-fb-b">
              <span className="b2-bl" role="img" aria-label={`${f.etiqueta}: reportado ${pct(f.rep)}, aprobado ${pct(f.apr)}, esperado ${pct(f.esp)}`}>
                <span className="b2-bl-r" style={{ width: `${clamp(f.rep)}%` }} />
                <span className="b2-bl-a" style={{ width: `${clamp(f.apr)}%` }} />
                {f.esp != null && <span className="b2-bl-e" style={{ left: `${clamp(f.esp)}%` }} />}
              </span>
            </span>
            <span className="b2-fb-v">
              <b>{pct(f.rep)}</b>
              <small>apr. {pct(f.apr)} · esp. {pct(f.esp)}</small>
            </span>
            {(f.extra || f.alerta) && <span className="b2-fb-x">{f.alerta && <span className="b2-fb-al">{f.alerta}</span>}{f.extra}</span>}
          </>
        );
        return (
          <li key={f.id}>
            {onAbrir ? (
              <button type="button" className="b2-fb-f" data-sel={seleccionada === f.id || undefined} onClick={() => onAbrir(f.id)}>{cuerpo}</button>
            ) : (
              <div className="b2-fb-f">{cuerpo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────── barras apiladas horizontales (composición) ───────── */
export interface Segmento { s: Serie; label: string; valor: number }
function Segmentos({ segmentos, total, etiqueta }: { segmentos: Segmento[]; total: number; etiqueta: string }) {
  const suma = total > 0 ? total : segmentos.reduce((a, b) => a + b.valor, 0);
  const desc = segmentos.map((s) => `${s.label} ${n0(s.valor)}`).join(", ");
  return (
    <span className="b2-ap" role="img" aria-label={`${etiqueta}: ${desc}`}>
      {suma === 0 && <span className="b2-ap-0" />}
      {segmentos.filter((s) => s.valor > 0).map((s) => {
        const w = (100 * s.valor) / suma;
        return <span key={s.label} className="b2-ap-s" data-s={s.s} style={{ width: `${w}%` }} title={`${s.label}: ${n0(s.valor)}`}>{w >= 9 ? n0(s.valor) : ""}</span>;
      })}
    </span>
  );
}
export function ApiladaH({ segmentos, total, etiqueta }: { segmentos: Segmento[]; total?: number; etiqueta: string }) {
  const suma = total ?? segmentos.reduce((a, b) => a + b.valor, 0);
  return (
    <div className="b2-ap-w">
      <Segmentos segmentos={segmentos} total={suma} etiqueta={etiqueta} />
      <ul className="b2-ap-d">
        {segmentos.map((s) => (
          <li key={s.label}><i className="b2-sw" data-s={s.s} aria-hidden="true" />{s.label}<b>{n0(s.valor)}</b>{suma > 0 && <small>{pct((100 * s.valor) / suma)}</small>}</li>
        ))}
      </ul>
    </div>
  );
}
export interface FilaApilada { id: string | number; etiqueta: string; sub?: string; segmentos: Segmento[]; total?: number; extra?: ReactNode }
export function FilasApiladas({ filas, etiqueta, onAbrir }: { filas: FilaApilada[]; etiqueta: string; onAbrir?: (id: FilaApilada["id"]) => void }) {
  const max = Math.max(1, ...filas.map((f) => f.total ?? f.segmentos.reduce((a, b) => a + b.valor, 0)));
  return (
    <ul className="b2-fb b2-fa" aria-label={etiqueta}>
      {filas.map((f) => {
        const t = f.total ?? f.segmentos.reduce((a, b) => a + b.valor, 0);
        const cuerpo = (
          <>
            <span className="b2-fb-n"><span className="b2-tt" title={f.etiqueta}>{f.etiqueta}</span>{f.sub && <span className="b2-sub">{f.sub}</span>}</span>
            <span className="b2-fb-b"><span style={{ display: "block", width: `${(100 * t) / max}%`, minWidth: t > 0 ? 6 : 0 }}><Segmentos segmentos={f.segmentos} total={t} etiqueta={f.etiqueta} /></span></span>
            <span className="b2-fb-v"><b>{n0(t)}</b>{f.extra && <small>{f.extra}</small>}</span>
          </>
        );
        return <li key={f.id}>{onAbrir ? <button type="button" className="b2-fb-f" onClick={() => onAbrir(f.id)}>{cuerpo}</button> : <div className="b2-fb-f">{cuerpo}</div>}</li>;
      })}
    </ul>
  );
}

/* ───────── columnas agrupadas (series por categoría) ───────── */
export interface Categoria {
  id: string;
  label: string;
  sub?: string;
  /** Periodo todavía no exigible: se muestra atenuado y rotulado, nunca como incumplimiento. */
  futuro?: boolean;
  valores: { s: Serie; label: string; valor: number | null; texto?: string }[];
}
export function ColumnasAgrupadas({ categorias, max = 100, unidad = "%", etiqueta, alto = 190 }: { categorias: Categoria[]; max?: number; unidad?: "%" | ""; etiqueta: string; alto?: number }) {
  const marcas = unidad === "%" ? [0, 50, 100] : [0, Math.round(max / 2), max];
  const fmt = (v: number) => (unidad === "%" ? pct(v) : n0(v));
  return (
    <div className="b2-cg" role="group" aria-label={etiqueta} style={{ ["--alto" as string]: `${alto}px` }}>
      <div className="b2-cg-y" aria-hidden="true">{[...marcas].reverse().map((m) => <span key={m}>{unidad === "%" ? `${m}%` : m}</span>)}</div>
      <div className="b2-cg-sc">
        <div className="b2-cg-g" style={{ ["--n" as string]: categorias.length }}>
          {marcas.map((m) => <i key={m} className="b2-cg-l" style={{ bottom: `${(100 * m) / max}%` }} aria-hidden="true" />)}
          {categorias.map((c) => {
            const desc = c.valores.map((v) => `${v.label} ${v.valor == null ? "sin dato" : v.texto ?? fmt(v.valor)}`).join(", ");
            return (
              <div key={c.id} className="b2-cg-c" data-futuro={c.futuro || undefined} tabIndex={0} role="img" aria-label={`${c.label}${c.futuro ? " (periodo futuro, aún no exigible)" : ""}: ${desc}`}>
                <div className="b2-cg-b">
                  {c.valores.map((v) => (
                    <span key={v.label} className="b2-cg-bar" data-s={v.s} data-cero={!v.valor || undefined} style={{ height: `${clamp(v.valor, max)}%` }}>
                      <em>{v.valor == null || v.valor <= 0 ? "" : v.texto ?? fmt(v.valor)}</em>
                    </span>
                  ))}
                </div>
                <div className="b2-cg-t" role="tooltip">
                  <strong>{c.label}</strong>
                  {c.valores.map((v) => <span key={v.label}><i className="b2-sw" data-s={v.s} aria-hidden="true" />{v.label}: <b>{v.valor == null ? "sin dato" : v.texto ?? fmt(v.valor)}</b></span>)}
                  {c.futuro && <span className="b2-cg-fut">Periodo futuro: aún no es exigible.</span>}
                </div>
                <span className="b2-cg-e">{c.label}{c.futuro && <small>futuro</small>}{c.sub && <small>{c.sub}</small>}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────── barra de indicadores (resumen superior) ───────── */
export function Indicadores({ items }: { items: { k: string; v: ReactNode; sub?: ReactNode; alerta?: boolean; titulo?: string }[] }) {
  return (
    <dl className="b2-mx-stats b2-inds">
      {items.map((it) => (
        <div key={it.k} title={it.titulo}>
          <dt>{it.k}</dt>
          <dd className={it.alerta ? "b2-neg" : undefined}>{it.v}{it.sub && <small>{it.sub}</small>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── marco de página analítica: la página se desplaza; el inspector se acopla a la derecha ───────── */
export function AnaPagina({
  titulo, icono, subtitulo, acciones, children, inspector, inspectorAbierto, inspectorEtiqueta, onCerrarInspector,
}: {
  titulo: string;
  icono?: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  inspectorAbierto: boolean;
  inspectorEtiqueta: string;
  onCerrarInspector: () => void;
}) {
  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill">
      <div className="b2-vista-main" data-scroll>
        <section className="b2-ana" aria-label={titulo}>
          <header className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t">{icono}{titulo}</h1>
              {subtitulo && <p className="b2-mx-s">{subtitulo}</p>}
            </div>
            {acciones && <div className="b2-mx-acc">{acciones}</div>}
          </header>
          {children}
        </section>
      </div>
      <Inspector open={inspectorAbierto} onClose={onCerrarInspector} label={inspectorEtiqueta}>
        {inspector}
      </Inspector>
    </div>
  );
}
