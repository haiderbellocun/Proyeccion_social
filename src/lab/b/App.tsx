// Prototipo B · estructura general: cabecera morada, barra lateral contextual, barra de filtros y contenido.
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { admin, adminActual, conteos, docenteActual, semanaActual, semestre, totalSemanas, inicioSemestre, finSemestre } from "../shared/model";
import {
  IAdmin, IAyuda, IBell, IBuscar, ICalendario, ICarpeta, IChevD, IComponentes, ICola, ICerrar, IDocentes, IExpandirTodo, IImportar,
  IIndicadores, IMaletin, IPanel, IRevision, ISeguimiento, Marca,
} from "./icons";
import { RUTAS_ADMIN, RUTAS_DOCENTE, StoreProvider, useMedia, useStore, type Filtro, type Rol } from "./store";
import { EstadoIcon, KIND_LABEL, Kbd, Menu, Popover, Tip, ToastProvider, enControl, fechaCorta, useInputMode, type Kind } from "./ui";
import { Matriz } from "./Matriz";
import { PanelAdmin, PanelDocente } from "./Panel";
import { Herramientas, Indicadores, ListaDocente, Revision } from "./Paginas";
import { Componentes } from "./Componentes";

type Icono = (p: React.SVGProps<SVGSVGElement>) => ReactElement;
interface Modulo { ruta: string; label: string; corto: string; icono: Icono }

const MODULOS: Record<Rol, Modulo[]> = {
  admin: [
    { ruta: "panel", label: "Panel", corto: "Panel", icono: IPanel },
    { ruta: "matriz", label: "Seguimiento", corto: "Seguimiento", icono: ISeguimiento },
    { ruta: "revision", label: "Revisión", corto: "Revisión", icono: IRevision },
    { ruta: "indicadores", label: "Indicadores y reportes", corto: "Reportes", icono: IIndicadores },
    { ruta: "admin", label: "Administración", corto: "Admin", icono: IAdmin },
  ],
  docente: [
    { ruta: "panel", label: "Mi panel", corto: "Panel", icono: IPanel },
    { ruta: "matriz", label: "Mi matriz", corto: "Matriz", icono: ISeguimiento },
    { ruta: "iniciativas", label: "Iniciativas", corto: "Iniciativas", icono: IMaletin },
    { ruta: "evidencias", label: "Evidencias", corto: "Evidencias", icono: ICarpeta },
    { ruta: "historial", label: "Historial", corto: "Historial", icono: ICalendario },
  ],
};

interface ItemLateral { id: string; label: string; icono: ReactElement; badge?: number; activo: boolean; onClick: () => void }

function useLateral(): ItemLateral[][] {
  const s = useStore();
  const c = useMemo(() => conteos(), []);
  const kind = (k: Kind, n: number, destino?: string): ItemLateral => ({
    id: `k-${k}`, label: KIND_LABEL[k], icono: <EstadoIcon kind={k} size={16} />, badge: n || undefined,
    activo: s.filtro === k && (!destino || s.ruta === destino),
    onClick: () => { s.setFiltro(k); if (destino && s.ruta !== destino) s.ir(destino); },
  });
  const todos = (destino: string, label = "Todos"): ItemLateral => ({
    id: "k-todos", label, icono: <ICola width={16} height={16} />, activo: s.filtro === "todos" && s.ruta === destino,
    onClick: () => { s.setFiltro("todos"); if (s.ruta !== destino) s.ir(destino); },
  });
  const link = (id: string, label: string, icono: ReactElement, ruta: string, badge?: number): ItemLateral => ({
    id, label, icono, badge, activo: s.ruta === ruta, onClick: () => s.ir(ruta),
  });
  const ancla = (id: string, label: string, icono: ReactElement): ItemLateral => ({
    id, label, icono, activo: false,
    onClick: () => document.getElementById(id)?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" }),
  });
  const kindsMatriz = [todos("matriz"), kind("vencido", c.vencidos, "matriz"), kind("revision", c.revision, "matriz"), kind("observado", c.observados, "matriz"), kind("porhacer", c.porHacer, "matriz")];
  const sistema = link("sistema", "Sistema de diseño", <IComponentes width={16} height={16} />, "componentes");

  if (s.rol === "admin") {
    const pend = admin.stats.pendientes_revision;
    switch (s.ruta) {
      case "panel":
        return [
          [{ id: "cola", label: "Cola de revisión", icono: <ICola width={16} height={16} />, badge: pend, activo: false, onClick: () => { s.setFiltro("revision"); s.ir("revision"); } },
           { id: "obs", label: "Observados", icono: <EstadoIcon kind="observado" size={16} />, badge: admin.stats.reportes_observados, activo: false, onClick: () => { s.setFiltro("observado"); s.ir("revision"); } }],
          [link("doc", "Docentes", <IDocentes width={16} height={16} />, "indicadores"), link("imp", "Importar matriz", <IImportar width={16} height={16} />, "admin")],
          [sistema],
        ];
      case "matriz":
        return [kindsMatriz, [sistema]];
      case "revision":
        return [[todos("revision"), kind("revision", admin.stats.pendientes_revision, "revision"), kind("observado", admin.stats.reportes_observados, "revision"), kind("aprobado", admin.stats.reportes_aprobados, "revision")], [sistema]];
      case "indicadores":
        return [[ancla("sec-docentes", "Docentes", <IDocentes width={16} height={16} />), ancla("sec-semanas", "Semanas", <ICalendario width={16} height={16} />)], [sistema]];
      default:
        return [[link("imp", "Importar matriz", <IImportar width={16} height={16} />, "admin"), link("doc", "Docentes", <IDocentes width={16} height={16} />, "indicadores")], [sistema]];
    }
  }
  if (s.ruta === "panel" || s.ruta === "matriz") {
    return [[todos("matriz", "Toda la matriz"), kind("vencido", c.vencidos, "matriz"), kind("observado", c.observados, "matriz"), kind("revision", c.revision, "matriz")], [sistema]];
  }
  return [[link("mat", "Ir a mi matriz", <ISeguimiento width={16} height={16} />, "matriz")], [sistema]];
}

function Sidebar() {
  const s = useStore();
  const grupos = useLateral();
  const abierta = s.menuAbierto;
  return (
    <nav className="side" data-open={abierta} aria-label="Accesos del módulo">
      {grupos.map((g, gi) => (
        <div className="side-g" key={gi}>
          {g.map((it) => {
            const btn = (
              <button className="side-i" data-badge={it.badge ? "" : undefined} data-active={it.activo || undefined} aria-current={it.activo ? "true" : undefined} onClick={it.onClick} aria-label={abierta ? undefined : it.label}>
                <span className="side-ic">{it.icono}</span>
                <span className="side-l">{it.label}</span>
                {it.badge ? <span className="side-b" aria-label={`${it.badge} elementos`}>{it.badge}</span> : null}
              </button>
            );
            return abierta ? <div key={it.id}>{btn}</div> : <Tip key={it.id} label={it.badge ? `${it.label} · ${it.badge}` : it.label}>{btn}</Tip>;
          })}
        </div>
      ))}
      <div className="side-fin">
        <Tip label={abierta ? "Contraer menú" : "Expandir menú"}>
          <button className="side-i" onClick={() => s.setMenuAbierto(!abierta)} aria-label={abierta ? "Contraer menú" : "Expandir menú"} aria-expanded={abierta}>
            <span className="side-ic"><IExpandirTodo width={16} height={16} style={{ transform: abierta ? "rotate(90deg)" : "rotate(-90deg)" }} /></span>
            <span className="side-l">Contraer menú</span>
          </button>
        </Tip>
      </div>
    </nav>
  );
}

function Cabecera({ buscar }: { buscar: React.RefObject<HTMLInputElement> }) {
  const s = useStore();
  const mods = MODULOS[s.rol];
  const nombre = s.rol === "admin" ? adminActual.nombre : docenteActual.nombre;
  const angosto = useMedia("(max-width: 900px)");
  const ini = nombre.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const c = conteos();
  return (
    <header className="hd">
      <a className="hd-logo" href="#/panel" aria-label="ProySocial, ir al panel">
        <Marca size={26} />
        <span className="hd-name">ProySocial</span>
      </a>
      <nav className="hd-nav" aria-label="Módulos">
        {mods.map((m) => (
          <a key={m.ruta} href={`#/${m.ruta}`} className="hd-mod" data-active={s.ruta === m.ruta || undefined} aria-current={s.ruta === m.ruta ? "page" : undefined}
            onClick={() => s.setFiltro("todos")}>{m.label}</a>
        ))}
      </nav>
      <div className="hd-fill" />
      <label className="hd-search">
        <IBuscar width={16} height={16} />
        <input ref={buscar} value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder={angosto ? "Buscar" : s.rol === "admin" ? "Buscar docente o entregable" : "Buscar entregable"} aria-label="Buscar" />
        {s.query ? (
          <button className="hd-clear" aria-label="Limpiar búsqueda" onClick={() => { s.setQuery(""); buscar.current?.focus(); }}><ICerrar width={14} height={14} /></button>
        ) : <Kbd>/</Kbd>}
      </label>
      <Popover align="right" label="Notificaciones"
        trigger={({ props }) => (
          <Tip label="Notificaciones" side="bottom">
            <button className="hd-btn" aria-label="Notificaciones" {...props}><IBell width={18} height={18} /><span className="hd-dot" /></button>
          </Tip>
        )}>
        {(cerrar) => (
          <div className="pop-body">
            <p className="pop-t">Notificaciones</p>
            <ul className="notif">
              {s.rol === "admin" ? (
                <>
                  <li><button onClick={() => { cerrar(); s.setFiltro("revision"); s.ir("revision"); }}><strong>{admin.stats.pendientes_revision} entregables</strong> esperan revisión</button></li>
                  <li><button onClick={() => { cerrar(); s.ir("indicadores"); }}><strong>{admin.stats.docentes_atrasados} docentes</strong> van por detrás de lo esperado</button></li>
                </>
              ) : (
                <>
                  <li><button onClick={() => { cerrar(); s.setFiltro("observado"); s.ir("matriz"); }}><strong>{c.observados} entregables</strong> tienen observaciones</button></li>
                  <li><button onClick={() => { cerrar(); s.setFiltro("vencido"); s.ir("matriz"); }}><strong>{c.vencidos} entregables</strong> están vencidos</button></li>
                </>
              )}
            </ul>
          </div>
        )}
      </Popover>
      <Popover align="right" label="Ayuda"
        trigger={({ props }) => (
          <Tip label="Ayuda" side="bottom"><button className="hd-btn" aria-label="Ayuda" {...props}><IAyuda width={18} height={18} /></button></Tip>
        )}>
        {() => (
          <div className="pop-body">
            <p className="pop-t">Atajos de teclado</p>
            <dl className="atajos">
              <div><dt><Kbd>/</Kbd></dt><dd>Buscar</dd></div>
              <div><dt><Kbd>↑</Kbd> <Kbd>↓</Kbd></dt><dd>Moverse por filas</dd></div>
              <div><dt><Kbd>Enter</Kbd></dt><dd>Abrir detalle</dd></div>
              <div><dt><Kbd>Esc</Kbd></dt><dd>Cerrar detalle</dd></div>
              <div><dt><Kbd>T</Kbd></dt><dd>Ir a hoy (matriz)</dd></div>
            </dl>
          </div>
        )}
      </Popover>
      <Menu align="right" label="Cuenta"
        trigger={({ props }) => (
          <button className="hd-user" aria-label={`Cuenta de ${nombre}`} {...props}>
            <span className="hd-av">{ini}</span>
            <span className="hd-uname">{nombre}</span>
            <IChevD width={14} height={14} />
          </button>
        )}
        items={[
          { label: s.rol === "admin" ? "Administrador · vista actual" : "Docente · vista actual", disabled: true, onSelect: () => {} },
          { label: s.rol === "admin" ? "Ver como docente" : "Ver como administrador", hint: "Demo", onSelect: () => s.setRol(s.rol === "admin" ? "docente" : "admin") },
          "sep",
          { label: "Mi perfil", onSelect: () => {} },
          { label: "Cerrar sesión", onSelect: () => {} },
        ]} />
    </header>
  );
}

function Contexto() {
  const s = useStore();
  const opciones: Filtro[] = ["todos", "vencido", "observado", "revision", "porhacer", "aprobado"];
  return (
    <div className="ctx" role="group" aria-label="Contexto y filtros">
      <span className="ctx-i"><ICalendario width={14} height={14} />{semestre}</span>
      <span className="ctx-i ctx-sem">Semana {semanaActual} de {totalSemanas}</span>
      <span className="ctx-i ctx-rango">{fechaCorta(inicioSemestre)} – {fechaCorta(finSemestre)}</span>
      <span className="ctx-sep" />
      <span className="ctx-i ctx-prog">{docenteActual.programa}</span>
      {s.rol === "admin" && <span className="ctx-i ctx-prog">Todas las regionales</span>}
      <div className="ctx-fill" />
      <Popover align="right" label="Filtrar por estado"
        trigger={({ props }) => (
          <button className="ctx-btn" data-on={s.filtro !== "todos" || undefined} {...props}>
            {s.filtro === "todos" ? "Estado: todos" : <>Estado: <EstadoIcon kind={s.filtro} size={13} /> {KIND_LABEL[s.filtro]}</>}
            <IChevD width={13} height={13} />
          </button>
        )}>
        {(cerrar) => (
          <ul className="menu" role="menu" aria-label="Estado">
            {opciones.map((o) => (
              <li key={o} role="none">
                <button role="menuitemradio" aria-checked={s.filtro === o} className="menu-i" onClick={() => { s.setFiltro(o); cerrar(); }}>
                  <span className="menu-ic">{o === "todos" ? null : <EstadoIcon kind={o} size={14} />}</span>
                  <span>{o === "todos" ? "Todos los estados" : KIND_LABEL[o]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
      {(s.filtro !== "todos" || s.query) && (
        <button className="ctx-btn" onClick={() => { s.setFiltro("todos"); s.setQuery(""); }}>Limpiar<ICerrar width={12} height={12} /></button>
      )}
    </div>
  );
}

function BarraInferior() {
  const s = useStore();
  const mods = MODULOS[s.rol];
  return (
    <nav className="bnav" aria-label="Módulos">
      {mods.map((m) => (
        <a key={m.ruta} href={`#/${m.ruta}`} data-active={s.ruta === m.ruta || undefined} aria-current={s.ruta === m.ruta ? "page" : undefined} onClick={() => s.setFiltro("todos")}>
          <m.icono width={20} height={20} />
          <span>{m.corto}</span>
        </a>
      ))}
    </nav>
  );
}

function Vista() {
  const s = useStore();
  const permitidas: readonly string[] = s.rol === "admin" ? RUTAS_ADMIN : RUTAS_DOCENTE;
  const r = permitidas.includes(s.ruta) ? s.ruta : "panel";
  switch (r) {
    case "panel": return s.rol === "admin" ? <PanelAdmin /> : <PanelDocente />;
    case "matriz": return <Matriz />;
    case "revision": return <Revision />;
    case "indicadores": return <Indicadores />;
    case "admin": return <Herramientas />;
    case "iniciativas": case "evidencias": case "historial": return <ListaDocente tipo={r} />;
    default: return <Componentes />;
  }
}

function Shell() {
  const s = useStore();
  const buscar = useRef<HTMLInputElement>(null);
  useInputMode();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "/" && !enControl(e.target, false) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); buscar.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { document.title = "ProySocial · prototipo B"; }, []);
  return (
    <div className="shell" data-ampliar={s.ampliar || undefined} data-rol={s.rol}>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <Cabecera buscar={buscar} />
      <Contexto />
      <div className="cuerpo">
        <Sidebar />
        <main id="contenido" className="main" tabIndex={-1}>
          <Vista />
        </main>
      </div>
      <BarraInferior />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ToastProvider>
  );
}
