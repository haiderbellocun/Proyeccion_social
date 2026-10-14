// Prototipo B · páginas secundarias: Revisión, Indicadores y reportes, Administración y listas del docente.
import { useState } from "react";
import { admin, items, semanaActual, semestre } from "../shared/model";
import { IDocentes, IImportar, IComponentes, IExterno } from "./icons";
import { useStore } from "./store";
import { Bullet, Cola, InspectorRevision } from "./Panel";
import { Estado, Inspector, fechaCorta, fmt1, signed, tipoEvidencia } from "./ui";

export function Revision() {
  const s = useStore();
  const [sel, setSel] = useState<number | null>(null);
  const seleccionada = s.revisiones.find((r) => r.id === sel) ?? null;
  const pend = s.revisiones.filter((r) => r.estadoActual === "enviado").length;
  return (
    <div className="vista" data-insp="sel">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h">
            <div><h1 className="pg-t">Revisión</h1><p className="pg-s">{pend} por revisar · selecciona una fila para ver la evidencia y decidir</p></div>
          </header>
          <section className="card card-cola" aria-label="Cola de revisión completa">
            <Cola completa sel={sel} onSel={setSel} />
          </section>
        </div>
      </div>
      <Inspector open={!!seleccionada} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionada && <InspectorRevision key={seleccionada.id} r={seleccionada} onClose={() => setSel(null)} />}
      </Inspector>
    </div>
  );
}

export function Indicadores() {
  const st = admin.stats;
  const maxSem = Math.max(1, ...admin.semanal.map((x) => x.reportados));
  return (
    <div className="vista">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h"><div><h1 className="pg-t">Indicadores y reportes</h1><p className="pg-s">{semestre} · semana {semanaActual} · reportado {fmt1(st.avance_reportado_promedio)} frente a {fmt1(st.avance_esperado_promedio)} esperado</p></div>
            <div className="pg-acc"><button className="btn">Exportar reporte</button></div></header>
          <section id="sec-docentes" className="card" aria-labelledby="i-doc">
            <div className="card-h"><h2 id="i-doc">Docentes</h2><span className="card-n">{admin.docentes.length} docentes</span></div>
            <div className="tabla-w">
              <table className="tabla">
                <thead><tr><th>Docente</th><th>Programa</th><th>Reportado · aprobado · esperado</th><th className="num">Brecha</th><th className="num">Por revisar</th><th className="num">Vencidos</th></tr></thead>
                <tbody>
                  {admin.docentes.map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.nombre}</strong></td>
                      <td>{d.programa}</td>
                      <td className="td-bl"><Bullet rep={d.reportado} apr={d.aprobado} esp={d.esperado} nombre={d.nombre} /></td>
                      <td className="num" data-neg={d.brecha < 0 || undefined}>{signed(Math.round(d.brecha))}</td>
                      <td className="num">{d.porRevisar}</td>
                      <td className="num">{d.vencidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section id="sec-semanas" className="card" aria-labelledby="i-sem">
            <div className="card-h"><h2 id="i-sem">Semanas</h2></div>
            <div className="tabla-w">
              <table className="tabla">
                <thead><tr><th>Semana</th><th>Reportados</th><th>Aprobados</th><th>Avance</th></tr></thead>
                <tbody>
                  {admin.semanal.map((x) => (
                    <tr key={x.semana} data-now={x.semana === semanaActual || undefined}>
                      <td>S{x.semana}</td><td className="num">{x.reportados}</td><td className="num">{x.aprobados}</td>
                      <td className="td-bl"><span className="bl"><span className="bl-r" style={{ width: `${(100 * x.reportados) / maxSem}%` }} /><span className="bl-a" style={{ width: `${(100 * x.aprobados) / maxSem}%` }} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function Herramientas() {
  const s = useStore();
  const tool = (icono: React.ReactNode, titulo: string, texto: string, accion: () => void, etiqueta: string) => (
    <li className="tool">
      <span className="tool-ic">{icono}</span>
      <div className="tool-t"><strong>{titulo}</strong><span>{texto}</span></div>
      <button className="btn btn-sm" onClick={accion}>{etiqueta}</button>
    </li>
  );
  return (
    <div className="vista">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h"><div><h1 className="pg-t">Administración</h1><p className="pg-s">Herramientas de configuración del semestre {semestre}</p></div></header>
          <section className="card" aria-label="Herramientas">
            <ul className="tools">
              {tool(<IImportar width={18} height={18} />, "Importar matriz", "Carga la matriz de entregables desde una hoja de cálculo.", () => {}, "Importar")}
              {tool(<IDocentes width={18} height={18} />, "Docentes", "Consulta avance, brecha y estado de cada docente.", () => s.ir("indicadores"), "Abrir")}
              {tool(<IComponentes width={18} height={18} />, "Sistema de diseño", "Componentes, estados y tokens de este prototipo.", () => s.ir("componentes"), "Abrir")}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ListaDocente({ tipo }: { tipo: "iniciativas" | "evidencias" | "historial" }) {
  const s = useStore();
  const titulo = { iniciativas: "Iniciativas", evidencias: "Evidencias", historial: "Historial" }[tipo];
  let cuerpo: React.ReactNode;
  if (tipo === "iniciativas") {
    const g = new Map<string, typeof items>();
    for (const i of items) g.set(i.iniciativa || "Sin iniciativa", [...(g.get(i.iniciativa || "Sin iniciativa") ?? []), i]);
    cuerpo = (
      <ul className="lista-s lista-g">
        {[...g.entries()].map(([n, its]) => (
          <li key={n}><span className="tt" title={n}>{n}</span><span className="sub">{its.filter((i) => i.estado === "aprobado").length} de {its.length} aprobados</span></li>
        ))}
      </ul>
    );
  } else if (tipo === "evidencias") {
    const con = items.filter((i) => i.evidencias.length > 0);
    cuerpo = (
      <ul className="lista-s">
        {con.map((i) => (
          <li key={i.id}><span className="tt" title={i.titulo}>{i.titulo}</span>
            <span className="sub">{i.evidencias.map((u) => tipoEvidencia(u)).join(", ")}</span>
            <a className="btn btn-sm" href={i.evidencias[0]} target="_blank" rel="noopener noreferrer" aria-label={`Abrir evidencia de ${i.titulo}`}>Abrir <IExterno width={14} height={14} /></a>
          </li>
        ))}
      </ul>
    );
  } else {
    const h = items.filter((i) => i.envios > 0).sort((a, b) => b.fin.localeCompare(a.fin));
    cuerpo = (
      <ul className="lista-s">
        {h.map((i) => (<li key={i.id}><span className="tt" title={i.titulo}>{i.titulo}</span><span className="sub">{i.envios} {i.envios === 1 ? "envío" : "envíos"} · límite {fechaCorta(i.fin)}</span><Estado kind={s.kindItem(i)} /></li>))}
      </ul>
    );
  }
  return (
    <div className="vista">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h"><div><h1 className="pg-t">{titulo}</h1><p className="pg-s">{semestre} · vista de demostración con los datos de ejemplo</p></div></header>
          <section className="card" aria-label={titulo}>{cuerpo}</section>
        </div>
      </div>
    </div>
  );
}
