// Prototipo B · Panel: administración (cola, indicadores, alertas, semanas, docentes) y "Mi panel" del docente.
import { useEffect, useMemo, useState } from "react";
import { admin, conteos, docenteActual, items, pct, resumen, semanaActual, semestre, totalSemanas, type Revision as Rev } from "../shared/model";
import { IChevR, ICola, IExterno, IImportar } from "./icons";
import { useStore } from "./store";
import { Dl, Estado, Evidencias, Inspector, KIND_LABEL, enControl, fechaCorta, fechaLarga, fmt1, semanaRango, signed, tipoEvidencia, type Kind } from "./ui";

export type RevAct = Rev & { estadoActual: Rev["estado"] };
const kindRev = (e: Rev["estado"]): Kind => (e === "aprobado" ? "aprobado" : e === "observado" ? "observado" : "revision");
const etiquetaRev = (e: Rev["estado"]) => (e === "enviado" ? "Por revisar" : KIND_LABEL[kindRev(e)]);

/** Inspector de revisión: la decisión se toma aquí, con confirmación y, al observar, con comentario obligatorio. */
export function InspectorRevision({ r, onClose }: { r: RevAct; onClose: () => void }) {
  const s = useStore();
  const [modo, setModo] = useState<null | "aprobar" | "observar">(null);
  const [texto, setTexto] = useState("");
  useEffect(() => { setModo(null); setTexto(""); }, [r.id]);
  const pendiente = r.estadoActual === "enviado";
  const sinEvidencia = r.evidencias.length === 0;
  const comentario = s.comentarios[r.id];
  return (
    <div className="insp-c">
      <p className="insp-sup">{r.docente} · {r.programa}</p>
      <h2 className="insp-h">{r.titulo}</h2>
      <div className="insp-estado"><Estado kind={kindRev(r.estadoActual)} label={etiquetaRev(r.estadoActual)} /></div>
      {r.problemaAcceso && <div className="callout callout-d"><strong>Problema de acceso</strong><p>Al menos un enlace no se pudo abrir sin permisos. Pide acceso antes de decidir.</p></div>}
      {r.estadoActual === "observado" && comentario && <div className="callout"><strong>Observación enviada</strong><p>{comentario}</p></div>}
      {r.reenvio && pendiente && <div className="callout"><strong>Reenvío</strong><p>El docente corrigió su entrega después de una observación.</p></div>}
      <h3 className="insp-sub">Evidencias</h3>
      <Evidencias lista={r.evidencias.map((e) => ({ tipo: tipoEvidencia(e.url, e.tipo), url: e.url }))} />
      <h3 className="insp-sub">Datos</h3>
      <Dl rows={[
        ["Iniciativa", r.iniciativa || "—"],
        ["Semana", `S${r.semana}`],
        ["Enviado", r.enviado ? fechaLarga(r.enviado) : "—"],
        ["En espera", r.diasEspera == null ? "—" : `${r.diasEspera} ${r.diasEspera === 1 ? "día" : "días"}`],
      ]} />

      <div className="decision" data-modo={modo ?? undefined}>
        {!pendiente && <p className="decision-n">Esta entrega ya tiene decisión{comentario ? "" : "."}</p>}
        {pendiente && modo === null && (
          <>
            <p className="decision-t">Decisión</p>
            <div className="insp-acc insp-acc-0">
              <button className="btn btn-primary" disabled={sinEvidencia} onClick={() => setModo("aprobar")}>Aprobar…</button>
              <button className="btn" onClick={() => setModo("observar")}>Observar…</button>
            </div>
            {sinEvidencia && <p className="decision-n">Sin enlaces de evidencia: solo puedes observar.</p>}
          </>
        )}
        {pendiente && modo === "aprobar" && (
          <>
            <p className="decision-t">¿Aprobar este entregable?</p>
            <p className="decision-n">El docente lo verá como Aprobado. Podrás deshacerlo unos segundos.</p>
            <div className="insp-acc insp-acc-0">
              <button className="btn btn-primary" autoFocus onClick={() => { s.resolver(r, "aprobado"); setModo(null); }}>Confirmar aprobación</button>
              <button className="btn" onClick={() => setModo(null)}>Cancelar</button>
            </div>
          </>
        )}
        {pendiente && modo === "observar" && (
          <>
            <label className="decision-t" htmlFor={`obs-${r.id}`}>Observación para el docente</label>
            <textarea id={`obs-${r.id}`} className="area" rows={4} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué debe corregir o completar" />
            <div className="insp-acc insp-acc-0">
              <button className="btn btn-primary" disabled={texto.trim().length < 5} onClick={() => { s.resolver(r, "observado", texto.trim()); setModo(null); }}>Enviar observación</button>
              <button className="btn" onClick={() => setModo(null)}>Cancelar</button>
            </div>
          </>
        )}
      </div>
      <div className="insp-acc"><button className="btn btn-ghost" onClick={onClose}>Cerrar detalle</button></div>
    </div>
  );
}

/** Cola de revisión: seleccionar una fila abre el inspector; no hay botones de decisión en la tabla. */
export function Cola({ completa, sel, onSel, limite }: { completa?: boolean; sel: number | null; onSel: (id: number | null) => void; limite?: number }) {
  const s = useStore();
  const q = s.query.trim().toLowerCase();
  const filtradas = useMemo(() => {
    const orden = (a: RevAct, b: RevAct) => (a.estadoActual === "enviado" ? 0 : 1) - (b.estadoActual === "enviado" ? 0 : 1) || (b.diasEspera ?? 0) - (a.diasEspera ?? 0);
    return s.revisiones
      .filter((r) => {
        if (s.filtro !== "todos" && kindRev(r.estadoActual) !== s.filtro) return false;
        if (!completa && s.filtro === "todos" && r.estadoActual !== "enviado") return false;
        if (q && !`${r.docente} ${r.titulo} ${r.programa}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(orden);
  }, [s.revisiones, s.filtro, q, completa]);
  const visibles = limite ? filtradas.slice(0, limite) : filtradas;
  const [cursor, setCursor] = useState(0);
  useEffect(() => setCursor(0), [s.filtro, q]);

  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(visibles.length - 1, cursor + 1); setCursor(n); if (sel != null) onSel(visibles[n].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null) onSel(visibles[n].id); }
    else if (e.key === "Enter" && visibles[cursor]) { e.preventDefault(); onSel(visibles[cursor].id); }
    else if (e.key === "Escape" && sel != null) onSel(null);
  };

  return (
    <div className="cola" role="table" aria-label="Cola de revisión" tabIndex={0} onKeyDown={teclas}>
      <div className="cola-h" role="row">
        <span role="columnheader">Entregable</span>
        <span role="columnheader" className="c-hide">Docente</span>
        <span role="columnheader" className="c-num">Espera</span>
        <span role="columnheader">Estado</span>
        <span role="columnheader" className="sr-only">Abrir</span>
      </div>
      {visibles.length === 0 && <p className="cola-vacio">Nada que revisar con este filtro.</p>}
      {visibles.map((r, i) => (
        <div key={r.id} className="cola-r" role="row" aria-selected={sel === r.id} data-sel={sel === r.id || undefined} data-cur={i === cursor || undefined}
          onClick={() => { setCursor(i); onSel(r.id); }}>
          <span role="cell" className="cola-t">
            <span className="tt" title={r.titulo}>{r.titulo}</span>
            <span className="sub"><span className="only-m">{r.docente} · </span>S{r.semana}{r.iniciativa ? ` · ${r.iniciativa}` : ""}</span>
          </span>
          <span role="cell" className="c-hide tt">{r.docente}</span>
          <span role="cell" className="c-num" data-alerta={((r.diasEspera ?? 0) >= 5 && r.estadoActual === "enviado") || undefined}>{r.diasEspera == null ? "—" : `${r.diasEspera} d`}</span>
          <span role="cell"><Estado kind={kindRev(r.estadoActual)} label={etiquetaRev(r.estadoActual)} /></span>
          <span role="cell" className="cola-go" aria-hidden="true"><IChevR width={14} height={14} /></span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Panel de administración ───────────────────────── */
export function PanelAdmin() {
  const s = useStore();
  const [sel, setSel] = useState<number | null>(null);
  const st = admin.stats;
  const seleccionada = s.revisiones.find((r) => r.id === sel) ?? null;
  const pendientes = s.revisiones.filter((r) => r.estadoActual === "enviado").length;
  const observados = s.revisiones.filter((r) => r.estadoActual === "observado").length;
  const maxSem = Math.max(1, ...admin.semanal.map((x) => x.reportados));
  const criticos = admin.docentes.filter((d) => d.semaforo === "rojo").length;
  const masAntigua = Math.max(0, ...s.revisiones.filter((r) => r.estadoActual === "enviado").map((r) => r.diasEspera ?? 0));
  const conAcceso = s.revisiones.filter((r) => r.problemaAcceso && r.estadoActual === "enviado").length;
  return (
    <div className="vista" data-insp="sel">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h">
            <div>
              <h1 className="pg-t">Panel de seguimiento</h1>
              <p className="pg-s">{semestre} · semana {semanaActual} de {totalSemanas}</p>
            </div>
            <div className="pg-acc">
              <button className="btn" onClick={() => s.ir("admin")}><IImportar width={16} height={16} />Importar matriz</button>
              <button className="btn btn-primary" onClick={() => { s.setFiltro("revision"); s.ir("revision"); }}><ICola width={16} height={16} />Revisar cola</button>
            </div>
          </header>

          <div className="pg-cols">
            <div className="pg-col">
              <section className="card card-cola" aria-labelledby="t-cola">
                <div className="card-h">
                  <h2 id="t-cola">Pendientes de revisión <span className="cuenta">{pendientes}</span></h2>
                  <button className="link" onClick={() => { s.setFiltro("revision"); s.ir("revision"); }}>Ver cola completa</button>
                </div>
                <Cola sel={sel} onSel={setSel} limite={7} />
              </section>

              <section className="card" aria-labelledby="t-sem">
                <div className="card-h"><h2 id="t-sem">Evolución semanal</h2>
                  <p className="leyenda"><i className="lg lg-r" />Reportados<i className="lg lg-a" />Aprobados</p></div>
                <div className="semanas" role="img" aria-label="Entregables reportados y aprobados por semana">
                  {admin.semanal.map((x) => {
                    const futura = x.semana > semanaActual;
                    return (
                      <div key={x.semana} className="sm" data-now={x.semana === semanaActual || undefined} data-futura={futura || undefined} title={`Semana ${x.semana}: ${x.reportados} reportados, ${x.aprobados} aprobados`}>
                        <span className="sm-v">{x.reportados > 0 ? x.reportados : ""}</span>
                        <span className="sm-b">
                          <span className="sm-r" style={{ height: `${(100 * x.reportados) / maxSem}%` }} />
                          <span className="sm-a" style={{ height: `${(100 * x.aprobados) / maxSem}%` }} />
                        </span>
                        <span className="sm-l">S{x.semana}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="pg-col">
              <section className="card" aria-labelledby="t-ind">
                <div className="card-h"><h2 id="t-ind">Indicadores</h2></div>
                <div className="hero">
                  <div><span className="hero-n">{pendientes}</span><span className="hero-l">por revisar</span></div>
                  <p className="hero-s">{observados} observados · la más antigua espera {masAntigua} {masAntigua === 1 ? "día" : "días"}</p>
                </div>
                <dl className="kpis kpis-3">
                  <div><dt>Reportado</dt><dd>{fmt1(st.avance_reportado_promedio)}</dd><span className="kpi-s">esperado {fmt1(st.avance_esperado_promedio)}</span></div>
                  <div><dt>Aprobado</dt><dd>{fmt1(st.avance_aprobado_promedio)}</dd><span className="kpi-s">promedio</span></div>
                  <div><dt>En riesgo</dt><dd className="txt-danger">{criticos}</dd><span className="kpi-s">de {st.total_docentes} docentes</span></div>
                </dl>
              </section>

              <section className="card" aria-labelledby="t-al">
                <div className="card-h"><h2 id="t-al">Alertas</h2></div>
                <ul className="alertas">
                  <li><span className="al-ic" data-d><IExterno width={14} height={14} /></span><span><strong>{st.docentes_atrasados} docentes</strong> van por detrás de lo esperado.</span></li>
                  {conAcceso > 0 && <li><span className="al-ic" data-d><IExterno width={14} height={14} /></span><span><strong>{conAcceso} entregas</strong> con problema de acceso a la evidencia.</span></li>}
                  {masAntigua >= 5 && <li><span className="al-ic"><IExterno width={14} height={14} /></span><span>Hay entregas esperando <strong>{masAntigua} días</strong> o más.</span></li>}
                </ul>
              </section>

              <section className="card" aria-labelledby="t-doc">
                <div className="card-h"><h2 id="t-doc">Seguimiento por docente</h2><button className="link" onClick={() => s.ir("indicadores")}>Ver reportes</button></div>
                <ul className="docs">
                  {[...admin.docentes].sort((a, b) => a.brecha - b.brecha).map((d) => (
                    <li key={d.id} className="doc">
                      <div className="doc-n"><span className="tt">{d.nombre}</span><span className="sub">{d.porRevisar} por revisar · {d.vencidos} vencidos</span></div>
                      <Bullet rep={d.reportado} apr={d.aprobado} esp={d.esperado} nombre={d.nombre} />
                      <span className="doc-b" data-neg={d.brecha < 0 || undefined} title="Brecha frente a lo esperado">{signed(Math.round(d.brecha))}</span>
                    </li>
                  ))}
                </ul>
                <p className="leyenda leyenda-b"><i className="lg lg-r" />Reportado<i className="lg lg-a" />Aprobado<i className="lg lg-e" />Esperado</p>
              </section>
            </div>
          </div>
        </div>
      </div>
      <Inspector open={!!seleccionada} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionada && <InspectorRevision key={seleccionada.id} r={seleccionada} onClose={() => setSel(null)} />}
      </Inspector>
    </div>
  );
}

export function Bullet({ rep, apr, esp, nombre }: { rep: number; apr: number; esp: number; nombre: string }) {
  return (
    <span className="bl" role="img" aria-label={`${nombre}: reportado ${fmt1(rep)}, aprobado ${fmt1(apr)}, esperado ${fmt1(esp)}`}>
      <span className="bl-r" style={{ width: `${Math.min(100, rep)}%` }} />
      <span className="bl-a" style={{ width: `${Math.min(100, apr)}%` }} />
      <span className="bl-e" style={{ left: `${Math.min(100, esp)}%` }} />
      <span className="bl-v">{fmt1(rep)}</span>
    </span>
  );
}

/* ───────────────────────── Mi panel (docente) ───────────────────────── */
export function PanelDocente() {
  const s = useStore();
  const c = conteos();
  const [ini, fin] = semanaRango(semanaActual);
  const estaSemana = items.filter((i) => i.semana === semanaActual);
  const vencidos = items.filter((i) => s.kindItem(i) === "vencido").sort((a, b) => a.fin.localeCompare(b.fin)).slice(0, 6);
  const observados = items.filter((i) => s.kindItem(i) === "observado");
  const abrir = (f: "vencido" | "observado") => { s.setFiltro(f); s.ir("matriz"); };
  return (
    <div className="vista">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h">
            <div>
              <h1 className="pg-t">Mi panel</h1>
              <p className="pg-s">{docenteActual.nombre} · {docenteActual.programa} · {semestre}</p>
            </div>
            <div className="pg-acc"><button className="btn btn-primary" onClick={() => s.ir("matriz")}>Ir a mi matriz</button></div>
          </header>
          <div className="pg-cols">
            <div className="pg-col">
              <section className="card" aria-labelledby="d-ven">
                <div className="card-h"><h2 id="d-ven">Vencidos <span className="cuenta cuenta-d">{c.vencidos}</span></h2><button className="link" onClick={() => abrir("vencido")}>Ver todos</button></div>
                <ul className="lista-s">
                  {vencidos.map((i) => <li key={i.id}><span className="tt" title={i.titulo}>{i.titulo}</span><span className="txt-danger fch">{fechaCorta(i.fin)}</span></li>)}
                </ul>
              </section>
              <section className="card" aria-labelledby="d-obs">
                <div className="card-h"><h2 id="d-obs">Con observaciones</h2><button className="link" onClick={() => abrir("observado")}>Ver todos</button></div>
                {observados.length === 0 ? <p className="vacio">No tienes observaciones pendientes.</p> : (
                  <ul className="lista-s">{observados.map((i) => <li key={i.id}><span className="tt" title={i.titulo}>{i.titulo}</span><span className="sub">{i.comentario?.slice(0, 80)}</span></li>)}</ul>
                )}
              </section>
            </div>
            <div className="pg-col">
              <section className="card" aria-labelledby="d-av">
                <div className="card-h"><h2 id="d-av">Mi avance</h2></div>
                <dl className="kpis">
                  <div><dt>Reportado</dt><dd>{pct(resumen.pct_reportado)}</dd><span className="kpi-s">esperado {pct(resumen.pct_esperado)}</span></div>
                  <div><dt>Aprobado</dt><dd>{pct(resumen.pct_aprobado)}</dd><span className="kpi-s">{resumen.aprobados} de {resumen.total}</span></div>
                  <div><dt>En revisión</dt><dd>{c.revision}</dd><span className="kpi-s">esperan respuesta</span></div>
                  <div><dt>Por hacer</dt><dd>{c.porHacer}</dd><span className="kpi-s">sin enviar</span></div>
                </dl>
              </section>
              <section className="card" aria-labelledby="d-sem">
                <div className="card-h"><h2 id="d-sem">Esta semana</h2><span className="card-n">S{semanaActual} · {fechaCorta(ini)} – {fechaCorta(fin)}</span></div>
                {estaSemana.length === 0 ? <p className="vacio">No tienes entregables con límite esta semana.</p> : (
                  <ul className="lista-s">{estaSemana.map((i) => <li key={i.id}><span className="tt" title={i.titulo}>{i.titulo}</span><Estado kind={s.kindItem(i)} /></li>)}</ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
