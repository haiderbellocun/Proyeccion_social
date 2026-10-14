// Prototipo B · Sistema de diseño: estados, botones, controles, tooltip, toast, diálogo y tokens.
import { useState } from "react";
import { IAyuda, IBell, IKebab, IMas } from "./icons";
import { Dialog, Estado, EstadoIcon, KINDS, Kbd, Menu, Tip, useToast } from "./ui";

const TOKENS: [string, string, string][] = [
  ["--c-header", "#261E36", "Cabecera"],
  ["--c-context", "#242329", "Barra de filtros"],
  ["--c-primary", "#503296", "Acción principal"],
  ["--c-select", "#EDEAF5", "Selección"],
  ["--c-bg", "#F6F6F6", "Fondo"],
  ["--c-surface", "#FFFFFF", "Superficies"],
  ["--c-bar", "#666B7F", "Barras"],
  ["--c-danger", "#D31312", "Vencido"],
];

export function Componentes() {
  const push = useToast();
  const [dlg, setDlg] = useState(false);
  return (
    <div className="vista">
      <div className="vista-main" data-scroll>
        <div className="pg">
          <header className="pg-h"><div><h1 className="pg-t">Sistema de diseño</h1><p className="pg-s">Prototipo B · componentes y tokens</p></div></header>

          <section className="card"><div className="card-h"><h2>Paleta</h2></div>
            <ul className="tokens">
              {TOKENS.map(([v, hex, n]) => (<li key={v}><span className="sw" style={{ background: `var(${v})` }} /><span><strong>{n}</strong><code>{v} · {hex}</code></span></li>))}
            </ul>
          </section>

          <section className="card"><div className="card-h"><h2>Estados</h2></div>
            <p className="pg-s">Cada estado combina forma, color y texto; nunca solo color.</p>
            <div className="fila-c">{KINDS.map((k) => <Estado key={k} kind={k} />)}</div>
            <div className="fila-c">{KINDS.map((k) => <EstadoIcon key={k} kind={k} size={20} />)}</div>
          </section>

          <section className="card"><div className="card-h"><h2>Botones y controles</h2></div>
            <div className="fila-c">
              <button className="btn btn-primary">Principal</button>
              <button className="btn">Secundario</button>
              <button className="btn btn-ghost">Discreto</button>
              <button className="btn" disabled>Deshabilitado</button>
              <button className="btn btn-sm">Compacto</button>
              <button className="btn btn-ico" aria-label="Más"><IMas width={16} height={16} /></button>
            </div>
            <div className="fila-c">
              <input className="campo" placeholder="Campo de texto" aria-label="Campo de texto" />
              <div className="seg" role="group" aria-label="Ejemplo de segmentado"><button data-on>Semanal</button><button>Mensual</button></div>
              <Kbd>/</Kbd><Kbd>Enter</Kbd><Kbd>Esc</Kbd>
            </div>
          </section>

          <section className="card"><div className="card-h"><h2>Superposiciones</h2></div>
            <div className="fila-c">
              <Tip label="Notificaciones" side="bottom"><button className="btn btn-ico" aria-label="Notificaciones"><IBell width={16} height={16} /></button></Tip>
              <Tip label="Ayuda" side="bottom"><button className="btn btn-ico" aria-label="Ayuda"><IAyuda width={16} height={16} /></button></Tip>
              <Menu label="Acciones de ejemplo" trigger={({ props }) => (<button className="btn btn-ico" aria-label="Más acciones" {...props}><IKebab width={16} height={16} /></button>)}
                items={[{ label: "Ver detalle", onSelect: () => {} }, { label: "Duplicar", onSelect: () => {} }, "sep", { label: "Eliminar", danger: true, onSelect: () => {} }]} />
              <button className="btn" onClick={() => push({ text: "Entregable enviado a revisión", undo: () => {} })}>Mostrar aviso</button>
              <button className="btn" onClick={() => setDlg(true)}>Abrir diálogo</button>
            </div>
          </section>
        </div>
      </div>
      <Dialog open={dlg} onClose={() => setDlg(false)} title="¿Observar este entregable?">
        <p className="insp-p">El docente recibirá tu comentario y podrá reenviar la evidencia.</p>
        <div className="insp-acc"><button className="btn btn-primary" onClick={() => setDlg(false)}>Observar</button><button className="btn" onClick={() => setDlg(false)}>Cancelar</button></div>
      </Dialog>
    </div>
  );
}
