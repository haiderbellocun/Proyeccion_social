// Matriz de seguimiento B2: tabla jerárquica (mes → fase → entregable) + cronograma Gantt en un único contenedor con desplazamiento,
// inspector lateral y lista móvil. Es presentacional: los datos, las fechas, los indicadores y las acciones llegan de cada pantalla.
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as KE, type ReactNode,
} from "react";
import { esHttp } from "../EnlaceEvidencia";
import { HistorialEntregable } from "../HistorialEntregable";
import { categoryConfig, etiquetaSemana, isDeliverableCompleted, type EstadoEntregable, type IndicadoresSeguimiento, type SemanaActual } from "../../data/matrizConstants";
import {
  IBuscar, IChevD, IChevR, IColumnas, IContraer, IExpandirTodo, IFiltro, IKebab, ISeguimiento, IAbajo, IArriba,
} from "./icons";
import { Dl, enControl, Estado, EstadoIcon, Inspector, Menu, Popover, type Kind } from "./ui";
import {
  addDays, armarCalendario, dias, esFecha, ESTATUS_LABEL, ESTATUS_ORDEN, estatusDe, fechaCorta, fechaLarga, nombreMes, tipoEnlace, useMedia,
  type EstatusKey,
} from "./matriz-util";
import "@fontsource-variable/nunito-sans";
import "./b2.css";
import "./b2-matriz.css";
import "./b2-matriz-real.css";

export interface ItemMatrizB2 {
  id: number;
  numero: number;
  categoria: string;
  fase: string;
  mes: string;
  semana_numero: number;
  entregable: string;
  descripcion_evidencia: string;
  horas: number;
  fecha_inicio_calculada: string | null;
  fecha_fin_calculada: string | null;
  entregable_id: number | null;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  num_envios: number;
  fecha_primer_envio: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  fecha_real_entrega: string | null;
  url_evidencia: string | null;
  enlace_referencia: string | null;
  comentario_revision?: string | null;
  iniciativa_id: number | null;
  iniciativa_titulo: string;
  iniciativa_tipo: string;
  tiene_excepcion: boolean;
  motivo_excepcion?: string | null;
  requiere_evidencia?: boolean;
}

export interface MatrizB2Props {
  rol: "docente" | "admin";
  titulo: string;
  subtitulo?: string;
  items: ItemMatrizB2[];
  semana: SemanaActual | null;
  hoy: string | null;
  resumen: IndicadoresSeguimiento | null;
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
  /** Botones de la cabecera (p. ej. «Reportar entregable»). */
  acciones?: ReactNode;
  /** Línea de contexto bajo el título (perfil del docente, grupo, horas…). */
  perfil?: ReactNode;
  /** Zona de acciones del inspector (depende del rol: reporte/corrección o gestión administrativa). */
  renderAcciones: (item: ItemMatrizB2, evidencias: string[]) => ReactNode;
  /** Endpoint del historial del entregable (docente o administración). */
  historialRuta: (item: ItemMatrizB2) => string | null;
  seleccionInicial?: number | null;
  /** true dentro del layout del docente (Tinta); false dentro del shell B2. */
  embebida?: boolean;
  textoVacio: string;
}

const COL = { n: 44, ini: 150, inicio: 66, limite: 66, h: 50, estado: 176, estadoIco: 56, ev: 84 };
const W_ACC = 36;
const VIS_DEFECTO = { numero: true, iniciativa: false, inicio: true, limite: true, horas: true, estado: true, evidencia: true };
type Visibles = typeof VIS_DEFECTO;
const SET_COMPACTO: Visibles = { numero: false, iniciativa: false, inicio: false, limite: true, horas: false, estado: true, evidencia: false };
const NOMBRE_COL: Record<keyof Visibles, string> = { numero: "N.º", iniciativa: "Iniciativa", inicio: "Inicio", limite: "Límite", horas: "Horas", estado: "Estado", evidencia: "Evidencia" };

const KIND_DE: Record<EstatusKey, Kind> = { aprobado: "aprobado", en_revision: "revision", observado: "observado", borrador: "borrador", en_curso: "encurso", no_iniciada: "porhacer" };
const BAR_DE: Record<EstatusKey, string> = { aprobado: "aprobado", en_revision: "revision", observado: "observado", borrador: "borrador", en_curso: "encurso", no_iniciada: "noiniciado" };

interface Filtros { q: string; estatus: EstatusKey | "vencido" | "todos"; mes: string; semana: number; categoria: string }
const FILTROS_VACIOS: Filtros = { q: "", estatus: "todos", mes: "todos", semana: 0, categoria: "todas" };
type Orden = { k: "natural" | "numero" | "inicio" | "limite" | "estado"; dir: 1 | -1 };

const evidenciasDe = (i: ItemMatrizB2) => (i.evidencias && i.evidencias.length > 0 ? i.evidencias : i.url_evidencia ? [i.url_evidencia] : []);
const catLabel = (c: string) => (c in categoryConfig ? categoryConfig[c as keyof typeof categoryConfig].label : c);
const etiquetaNumero = (i: ItemMatrizB2) => (i.numero != null && i.numero !== 0 ? `#${i.numero}` : `S${i.semana_numero}`);
const fmtPct = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}%`);
const signo = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

function textoConEnlaces(t: string): ReactNode {
  return t.split(/(https?:\/\/[^\s\n]+)/g).map((p, i) =>
    /^https?:\/\//.test(p) && esHttp(p) ? <a key={i} className="b2-link" href={p} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{p}</a> : <span key={i}>{p}</span>
  );
}

function useFiltrado(items: ItemMatrizB2[], f: Filtros, semanaNum: number | null) {
  const q = f.q.trim().toLowerCase();
  return useMemo(() => items.filter((i) => {
    const k = estatusDe(i.estado, i.semana_numero, semanaNum);
    if (f.estatus !== "todos" && (f.estatus === "vencido" ? !i.vencido : k !== f.estatus)) return false;
    if (f.mes !== "todos" && i.mes !== f.mes) return false;
    if (f.semana !== 0 && i.semana_numero !== f.semana) return false;
    if (f.categoria !== "todas" && i.categoria !== f.categoria) return false;
    if (q && !`${i.entregable} ${i.iniciativa_titulo} ${i.numero ?? ""} ${i.fase}`.toLowerCase().includes(q)) return false;
    return true;
  }), [items, f, q, semanaNum]);
}

/* ───────────────────────── panel de filtros ───────────────────────── */
function PanelFiltros({ f, setF, meses, semanas, categorias }: { f: Filtros; setF: (f: Filtros) => void; meses: string[]; semanas: number[]; categorias: string[] }) {
  return (
    <div className="b2-pop-body">
      <p className="b2-pop-t">Estado</p>
      <label className="b2-chk"><input type="radio" name="b2-estatus" checked={f.estatus === "todos"} onChange={() => setF({ ...f, estatus: "todos" })} />Todos</label>
      {ESTATUS_ORDEN.map((k) => (
        <label key={k} className="b2-chk"><input type="radio" name="b2-estatus" checked={f.estatus === k} onChange={() => setF({ ...f, estatus: k })} /><EstadoIcon kind={KIND_DE[k]} size={14} />{ESTATUS_LABEL[k]}</label>
      ))}
      <label className="b2-chk"><input type="radio" name="b2-estatus" checked={f.estatus === "vencido"} onChange={() => setF({ ...f, estatus: "vencido" })} /><EstadoIcon kind="vencido" size={14} />Vencidos</label>
      <div className="b2-pop-sec">
        <label className="b2-label" htmlFor="b2-f-mes">Mes</label>
        <select id="b2-f-mes" className="b2-sel" value={f.mes} onChange={(e) => setF({ ...f, mes: e.target.value })}>
          <option value="todos">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="b2-pop-sec">
        <label className="b2-label" htmlFor="b2-f-sem">Semana</label>
        <select id="b2-f-sem" className="b2-sel" value={f.semana} onChange={(e) => setF({ ...f, semana: Number(e.target.value) })}>
          <option value={0}>Todas las semanas</option>
          {semanas.map((s) => <option key={s} value={s}>Semana {s}</option>)}
        </select>
      </div>
      <div className="b2-pop-sec">
        <label className="b2-label" htmlFor="b2-f-cat">Categoría</label>
        <select id="b2-f-cat" className="b2-sel" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ───────────────────────── inspector ───────────────────────── */
function InspectorEntregable({ item, semanaNum, props, onClose }: { item: ItemMatrizB2; semanaNum: number | null; props: MatrizB2Props; onClose: () => void }) {
  const [verHistorial, setVerHistorial] = useState(false);
  useEffect(() => setVerHistorial(false), [item.id]);
  const k = estatusDe(item.estado, item.semana_numero, semanaNum);
  const evid = evidenciasDe(item);
  const ruta = props.historialRuta(item);
  const tardia = !!(item.fecha_real_entrega && item.fecha_fin_calculada && item.fecha_real_entrega > item.fecha_fin_calculada);
  return (
    <div className="b2-insp-c">
      <p className="b2-insp-sup">{catLabel(item.categoria)} · Entregable {etiquetaNumero(item)}</p>
      <h2 className="b2-insp-h">{item.entregable}</h2>
      <div className="b2-insp-estado b2-acc-fila"><Estado kind={KIND_DE[k]} label={ESTATUS_LABEL[k]} />{item.vencido && <span className="b2-venc-tag">Vencido</span>}{item.tiene_excepcion && <span className="b2-venc-tag" style={{ background: "var(--c-select)", color: "var(--c-primary)" }}>Ajuste individual</span>}</div>
      {item.estado === "observado" && item.comentario_revision && (
        <div className="b2-callout"><strong>Observaciones de la revisión</strong><p>{item.comentario_revision}</p></div>
      )}
      {item.evidencia_exenta && item.justificacion_exencion && (
        <div className="b2-callout"><strong>Sin evidencia — justificación</strong><p>{item.justificacion_exencion}</p></div>
      )}
      {item.tiene_excepcion && item.motivo_excepcion && (
        <div className="b2-callout"><strong>Ajuste individual</strong><p>{item.motivo_excepcion}</p></div>
      )}
      <Dl rows={[
        ["Fase", item.fase || "—"],
        ["Iniciativa", item.iniciativa_titulo || "Sin iniciativa"],
        ["Semana", `S${item.semana_numero}${item.mes ? ` · ${item.mes}` : ""}`],
        ["Inicio", item.fecha_inicio_calculada ? fechaLarga(item.fecha_inicio_calculada) : "—"],
        ["Límite", <span key="l" className={item.vencido ? "b2-txt-danger" : undefined}>{item.fecha_fin_calculada ? fechaLarga(item.fecha_fin_calculada) : "—"}</span>],
        ["Horas", `${item.horas} h`],
        ["Primer envío", item.fecha_primer_envio ? <span key="p">{fechaLarga(item.fecha_primer_envio)}{item.entrega_tardia ? " · posterior al límite" : ""}</span> : "—"],
        ["Entrega real", item.fecha_real_entrega ? <span key="r" className={tardia ? "b2-txt-danger" : undefined}>{fechaLarga(item.fecha_real_entrega)}{tardia ? " · fuera de plazo" : ""}</span> : "—"],
        ["Envíos", String(item.num_envios)],
        ["Exigible", item.exigible ? "Sí" : "No"],
      ]} />
      <h3 className="b2-insp-sub">Evidencia requerida</h3>
      <p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{item.descripcion_evidencia ? textoConEnlaces(item.descripcion_evidencia) : item.requiere_evidencia === false ? "Este entregable no requiere evidencia." : item.entregable}</p>
      {item.enlace_referencia && esHttp(item.enlace_referencia) && (
        <p className="b2-insp-p"><a className="b2-link" href={item.enlace_referencia} target="_blank" rel="noopener noreferrer">Abrir recurso o formulario de referencia</a></p>
      )}
      <h3 className="b2-insp-sub">Evidencias registradas</h3>
      {evid.length === 0 ? <p className="b2-muted">Aún no hay evidencia cargada.</p> : (
        <ul className="b2-evid">
          {evid.map((u, i) => (
            <li key={u} className="b2-evid-i">
              <div className="b2-evid-t"><span className="b2-evid-k">{tipoEnlace(u)}{evid.length > 1 ? ` ${i + 1}` : ""}</span><span className="b2-evid-u" title={u}>{u.replace(/^https?:\/\//, "")}</span></div>
              {esHttp(u) && <a className="b2-btn b2-btn-sm" href={u} target="_blank" rel="noopener noreferrer" aria-label={`Abrir evidencia ${i + 1}`}>Abrir</a>}
            </li>
          ))}
        </ul>
      )}
      {props.renderAcciones(item, evid)}
      {ruta && item.entregable_id != null && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="b2-link-btn" aria-expanded={verHistorial} onClick={() => setVerHistorial((v) => !v)}>{verHistorial ? "Ocultar historial" : "Ver historial del entregable"}</button>
          {verHistorial && <div className="b2-hist"><HistorialEntregable key={`${item.entregable_id}-${item.estado}-${item.num_envios}`} ruta={ruta} /></div>}
        </div>
      )}
      <div className="b2-insp-acc"><button type="button" className="b2-btn b2-btn-ghost" onClick={onClose}>Cerrar detalle</button></div>
    </div>
  );
}

/* ───────────────────────── componente principal ───────────────────────── */
export function MatrizB2(props: MatrizB2Props) {
  const { items, semana, hoy, resumen } = props;
  const movil = useMedia("(max-width: 720px)");
  const [sel, setSel] = useState<number | null>(props.seleccionInicial ?? null);
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const semanaNum = semana?.estado === "en_curso" ? semana.numero : null;
  const seleccionado = sel == null ? null : items.find((i) => i.id === sel) ?? null;
  useEffect(() => { if (!props.cargando && items.length > 0 && sel != null && !items.some((i) => i.id === sel)) setSel(null); }, [items, sel, props.cargando]);

  const lista = useFiltrado(items, f, semanaNum);
  const meses = useMemo(() => {
    const orden = new Map<string, string>();
    for (const i of items) { const m = i.mes?.trim(); if (m && !orden.has(m)) orden.set(m, i.fecha_inicio_calculada ?? "9999"); }
    return [...orden.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([m]) => m);
  }, [items]);
  const semanas = useMemo(() => [...new Set(items.map((i) => i.semana_numero))].sort((a, b) => a - b), [items]);
  const categorias = useMemo(() => [...new Set(items.map((i) => i.categoria))], [items]);
  const calendario = useMemo(() => armarCalendario(semana, items.flatMap((i) => [i.fecha_inicio_calculada ?? "", i.fecha_fin_calculada ?? ""])), [semana, items]);
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(FILTROS_VACIOS);
  const limpiar = () => setF(FILTROS_VACIOS);

  const r = resumen;
  return (
    <div className={`b2-scope b2-mxp b2-vista ${props.embebida ? "b2-embed" : "b2-fill"}`} data-insp="sel">
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx" aria-label="Matriz de seguimiento">
          <div className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t"><ISeguimiento width={20} height={20} />{props.titulo}</h1>
              <p className="b2-mx-s">{props.subtitulo ?? `${items.length} entregables programados · ${etiquetaSemana(semana)}`}</p>
            </div>
            {props.acciones && <div className="b2-mx-acc">{props.acciones}</div>}
          </div>
          {props.perfil}
          {props.error && (
            <div className="b2-alert" role="alert"><span>{props.error}</span>{props.onReintentar && <button type="button" className="b2-btn b2-btn-sm" onClick={props.onReintentar}>Reintentar</button>}</div>
          )}
          {r && (
            <dl className="b2-mx-stats" aria-label="Indicadores de la matriz">
              <div><dt>Reportado</dt><dd>{r.total === 0 ? "—" : fmtPct(r.pct_reportado)}<small>{r.reportados}/{r.total}</small></dd></div>
              <div><dt>Aprobado</dt><dd>{fmtPct(r.pct_aprobado)}<small>{r.aprobados}/{r.total}</small></dd></div>
              <div><dt>Esperado a hoy</dt><dd>{fmtPct(r.pct_esperado)}<small>{r.esperado}/{r.total}</small></dd></div>
              <div><dt>Cumplimiento exigible</dt><dd>{r.exigibles === 0 ? "—" : fmtPct(r.cumplimiento_exigible)}<small>{r.exigibles_aprobados}/{r.exigibles}</small></dd></div>
              <div><dt>Brecha</dt><dd className={r.brecha_entregables < 0 ? "b2-neg" : undefined} title="Entregables aprobados − esperados a la fecha">{signo(r.brecha_entregables)}<small>{r.brecha_pct > 0 ? "+" : ""}{r.brecha_pct} pts</small></dd></div>
              <div><dt>Horas</dt><dd>{r.horas_aprobadas}<small>aprob. / {r.horas_programadas} h · {r.horas_reportadas} rep.</small></dd></div>
              <div><dt>En revisión</dt><dd>{r.enviados_pendientes_revision}</dd></div>
              <div><dt>Observados</dt><dd>{r.observados}</dd></div>
              <div><dt>Vencidos</dt><dd className={r.vencidos > 0 ? "b2-neg" : undefined}>{r.vencidos}</dd></div>
            </dl>
          )}
          {calendario?.derivado && items.length > 0 && (
            <p className="b2-mx-aviso" role="note">{semana?.advertencia ?? "El semestre no tiene un calendario válido configurado."} El cronograma usa el rango de fechas de los entregables y no marca la semana actual.</p>
          )}
          {props.cargando ? (
            <div className="b2-gantt" aria-busy="true"><div className="b2-skel-w" aria-hidden="true">{[92, 84, 76, 88, 70, 80].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div></div>
          ) : items.length === 0 ? (
            <div className="b2-gantt"><div className="b2-g-vacio-w"><ISeguimiento width={22} height={22} /><p>{props.textoVacio}</p></div></div>
          ) : movil ? (
            <Lista {...{ items, lista, f, setF, meses, semanas, categorias, hayFiltros, limpiar, semana, semanaNum, hoy, calendario, sel, onSel: setSel }} />
          ) : (
            <Cronograma {...{ items, lista, f, setF, meses, semanas, categorias, hayFiltros, limpiar, semana, semanaNum, hoy, calendario, sel, onSel: setSel }} />
          )}
        </section>
      </div>
      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && <InspectorEntregable key={seleccionado.id} item={seleccionado} semanaNum={semanaNum} props={props} onClose={() => setSel(null)} />}
      </Inspector>
    </div>
  );
}

interface VistaProps {
  items: ItemMatrizB2[];
  lista: ItemMatrizB2[];
  f: Filtros;
  setF: (f: Filtros) => void;
  meses: string[];
  semanas: number[];
  categorias: string[];
  hayFiltros: boolean;
  limpiar: () => void;
  semana: SemanaActual | null;
  semanaNum: number | null;
  hoy: string | null;
  calendario: ReturnType<typeof armarCalendario>;
  sel: number | null;
  onSel: (id: number | null) => void;
}

type Fila =
  | { t: "g1"; key: string; label: string; n: number; hechos: number; ini: string | null; fin: string | null }
  | { t: "g2"; key: string; label: string; n: number; hechos: number; ini: string | null; fin: string | null }
  | { t: "item"; key: string; item: ItemMatrizB2 };

const minD = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : a ?? b);
const maxD = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);
const idFila = (k: string) => `b2-fila-${k.replace(/[^\w]/g, "_")}`;

/* ───────────────────────── escritorio: tabla + cronograma ───────────────────────── */
function Cronograma(p: VistaProps) {
  const { lista, items, f, setF, calendario, semana, semanaNum, hoy, sel, onSel } = p;
  const [zoom, setZoom] = useState<"semanal" | "mensual">("semanal");
  const [vis, setVis] = useState<Visibles>(VIS_DEFECTO);
  const [orden, setOrden] = useState<Orden>({ k: "natural", dir: 1 });
  const [anchoCont, setAnchoCont] = useState(1200);
  // Con poco ancho se muestran solo las columnas esenciales; si la persona elige columnas, se respeta su elección (salvo en anchos muy pequeños).
  const [manual, setManual] = useState(false);
  const compacto = anchoCont < 1320;
  const muyAngosto = anchoCont < 900;
  const v: Visibles = muyAngosto || (compacto && !manual) ? SET_COMPACTO : manual ? vis : VIS_DEFECTO;
  const wt = muyAngosto || (compacto && !manual) ? 232 : 300;
  const cont = useRef<HTMLDivElement>(null);
  const filtrando = p.hayFiltros;

  useLayoutEffect(() => {
    const c = cont.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setAnchoCont(c.clientWidth));
    ro.observe(c);
    setAnchoCont(c.clientWidth);
    return () => ro.disconnect();
  }, []);

  const rank = (i: ItemMatrizB2) => ESTATUS_ORDEN.indexOf(estatusDe(i.estado, i.semana_numero, semanaNum));
  const cmp = useCallback((a: ItemMatrizB2, b: ItemMatrizB2) => {
    const natural = a.semana_numero - b.semana_numero || (a.numero ?? 0) - (b.numero ?? 0) || a.entregable.localeCompare(b.entregable, "es");
    let c = 0;
    if (orden.k === "numero") c = (a.numero ?? 0) - (b.numero ?? 0);
    else if (orden.k === "inicio") c = (a.fecha_inicio_calculada ?? "9999").localeCompare(b.fecha_inicio_calculada ?? "9999");
    else if (orden.k === "limite") c = (a.fecha_fin_calculada ?? "9999").localeCompare(b.fecha_fin_calculada ?? "9999");
    else if (orden.k === "estado") c = rank(a) - rank(b);
    return c !== 0 ? c * orden.dir : natural;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, semanaNum]);

  const grupos = useMemo(() => {
    const porMes = new Map<string, Map<string, ItemMatrizB2[]>>();
    for (const i of lista) {
      const m = i.mes?.trim() || "Sin mes";
      const fase = (i.fase && i.fase.trim()) || "Sin fase";
      const fm = porMes.get(m) ?? new Map<string, ItemMatrizB2[]>();
      fm.set(fase, [...(fm.get(fase) ?? []), i]);
      porMes.set(m, fm);
    }
    const arr = [...porMes.entries()].map(([mes, fases]) => ({
      mes,
      fases: [...fases.entries()].map(([fase, its]) => ({ fase, its: [...its].sort(cmp) })),
    }));
    const ini = (g: (typeof arr)[number]) => g.fases.flatMap((x) => x.its).reduce<string | null>((a, i) => minD(a, i.fecha_inicio_calculada), null) ?? "9999";
    return arr.sort((a, b) => ini(a).localeCompare(ini(b)));
  }, [lista, cmp]);

  const [colapsados, setColapsados] = useState<Set<string>>(() => {
    const c = new Set<string>();
    const porMes = new Map<string, ItemMatrizB2[]>();
    for (const i of items) porMes.set(i.mes?.trim() || "Sin mes", [...(porMes.get(i.mes?.trim() || "Sin mes") ?? []), i]);
    porMes.forEach((v, mes) => { if (v.every((i) => i.estado === "aprobado") && !v.some((i) => i.id === sel)) c.add(`m:${mes}`); });
    return c;
  });

  const filas = useMemo(() => {
    const out: Fila[] = [];
    for (const g of grupos) {
      const todos = g.fases.flatMap((x) => x.its);
      const k1 = `m:${g.mes}`;
      const anio = todos[0]?.fecha_fin_calculada ? ` ${todos[0].fecha_fin_calculada!.slice(0, 4)}` : "";
      out.push({ t: "g1", key: k1, label: `${g.mes}${anio}`, n: todos.length, hechos: todos.filter((i) => isDeliverableCompleted({ estado: i.estado })).length, ini: todos.reduce<string | null>((a, i) => minD(a, i.fecha_inicio_calculada), null), fin: todos.reduce<string | null>((a, i) => maxD(a, i.fecha_fin_calculada), null) });
      if (!filtrando && colapsados.has(k1) && !todos.some((i) => i.id === sel)) continue;
      for (const fa of g.fases) {
        const k2 = `f:${g.mes}||${fa.fase}`;
        out.push({ t: "g2", key: k2, label: fa.fase, n: fa.its.length, hechos: fa.its.filter((i) => isDeliverableCompleted({ estado: i.estado })).length, ini: fa.its.reduce<string | null>((a, i) => minD(a, i.fecha_inicio_calculada), null), fin: fa.its.reduce<string | null>((a, i) => maxD(a, i.fecha_fin_calculada), null) });
        if (!filtrando && colapsados.has(k2) && !fa.its.some((i) => i.id === sel)) continue;
        for (const item of fa.its) out.push({ t: "item", key: `n:${item.id}`, item });
      }
    }
    return out;
  }, [grupos, colapsados, filtrando, sel]);

  const [foco, setFoco] = useState<string | null>(null);
  const alternar = useCallback((key: string) => setColapsados((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; }), []);
  const clavesMes = useMemo(() => grupos.map((g) => `m:${g.mes}`), [grupos]);
  const todoContraido = clavesMes.length > 0 && clavesMes.every((k) => colapsados.has(k));
  const contraerTodo = () => setColapsados(todoContraido ? new Set() : new Set(clavesMes));

  const ppd = zoom === "semanal" ? 14 : 5;
  const NDIAS = calendario?.dias ?? 0;
  const ancho = NDIAS * ppd;
  const lw = wt + (v.numero ? COL.n : 0) + (v.iniciativa ? COL.ini : 0) + (v.inicio ? COL.inicio : 0) + (v.limite ? COL.limite : 0) + (v.horas ? COL.h : 0) + (v.estado ? (muyAngosto ? COL.estadoIco : COL.estado) : 0) + (v.evidencia ? COL.ev : 0) + W_ACC;
  const idxDe = (iso: string) => dias(calendario!.inicio, iso);
  const hoyIdx = calendario && !calendario.derivado && hoy && esFecha(hoy) ? idxDe(hoy) : null;
  const hoyEnRango = hoyIdx != null && hoyIdx >= 0 && hoyIdx < NDIAS;
  const hoyX = hoyEnRango ? (hoyIdx! + 0.5) * ppd : null;
  const semIni = semana?.estado === "en_curso" && esFecha(semana.fecha_inicio_semana) && calendario ? idxDe(semana.fecha_inicio_semana!) : null;
  const semFin = semana?.estado === "en_curso" && esFecha(semana.fecha_fin_semana) && calendario ? idxDe(semana.fecha_fin_semana!) : null;

  const irAHoy = useCallback(() => {
    const c = cont.current;
    if (!c || hoyX == null) return;
    c.scrollLeft = Math.max(0, hoyX - (c.clientWidth - lw) / 2);
  }, [hoyX, lw]);
  useLayoutEffect(() => { irAHoy(); }, [zoom, NDIAS]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if ((e.key === "t" || e.key === "T") && !enControl(e.target) && !e.metaKey && !e.ctrlKey) irAHoy(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [irAHoy]);

  // Entregable preseleccionado (enlace desde una notificación): se muestra su fila
  const yaRevelado = useRef(false);
  useEffect(() => {
    if (yaRevelado.current || sel == null) return;
    const fila = document.getElementById(idFila(`n:${sel}`));
    if (!fila || !cont.current) return;
    yaRevelado.current = true;
    setFoco(`n:${sel}`);
    const c = cont.current.getBoundingClientRect();
    const r = fila.getBoundingClientRect();
    cont.current.scrollTop += r.top - c.top - c.height / 2;
  }, [sel, filas]);

  const idx = filas.findIndex((x) => x.key === foco);
  const mover = (d: number) => {
    const n = Math.max(0, Math.min(filas.length - 1, (idx < 0 ? (d > 0 ? -1 : filas.length) : idx) + d));
    const x = filas[n];
    if (!x) return;
    setFoco(x.key);
    if (sel != null && x.t === "item") onSel(x.item.id);
    requestAnimationFrame(() => {
      const c = cont.current, el = document.getElementById(idFila(x.key));
      if (!c || !el) return;
      const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (er.top < cr.top + 46) c.scrollTop -= cr.top + 46 - er.top;
      else if (er.bottom > cr.bottom) c.scrollTop += er.bottom - cr.bottom;
    });
  };
  const teclas = (e: KE) => {
    if (enControl(e.target)) return;
    const x = idx >= 0 ? filas[idx] : null;
    if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
    else if (e.key === "ArrowRight" && x && x.t !== "item" && colapsados.has(x.key)) { e.preventDefault(); alternar(x.key); }
    else if (e.key === "ArrowLeft" && x && x.t !== "item" && !colapsados.has(x.key)) { e.preventDefault(); alternar(x.key); }
    else if (e.key === "Enter" && x) { e.preventDefault(); if (x.t === "item") onSel(x.item.id); else alternar(x.key); }
    else if (e.key === "Escape" && sel != null) { e.stopPropagation(); onSel(null); }
  };

  const mesesCal = useMemo(() => {
    if (!calendario) return [] as { label: string; len: number; clave: string }[];
    const out: { label: string; len: number; clave: string }[] = [];
    for (let d = 0; d < calendario.dias; d++) {
      const m = nombreMes(addDays(calendario.inicio, d));
      const u = out[out.length - 1];
      if (u && u.clave === m.clave) u.len++;
      else out.push({ label: `${m.nombre} ${m.anio}`, len: 1, clave: m.clave });
    }
    return out;
  }, [calendario]);
  const semanasCal = useMemo(() => {
    if (!calendario) return [] as { n: number; dias: number }[];
    return Array.from({ length: calendario.semanas }, (_, i) => ({ n: i + 1, dias: Math.min(7, calendario.dias - i * 7) }));
  }, [calendario]);

  const ordenBtn = (k: Orden["k"], texto: string) => {
    const on = orden.k === k;
    return (
      <button type="button" className="b2-th-btn" data-on={on || undefined} aria-label={`Ordenar por ${texto}`} onClick={() => setOrden(on ? (orden.dir === 1 ? { k, dir: -1 } : { k: "natural", dir: 1 }) : { k, dir: 1 })}>
        {texto}{on ? (orden.dir === 1 ? <IArriba width={11} height={11} /> : <IAbajo width={11} height={11} />) : null}
      </button>
    );
  };

  const style = { "--ppd": `${ppd}px`, "--lw": `${lw}px`, "--w-line": `${ancho}px`, "--wt": `${wt}px` } as CSSProperties;
  const total = items.length;
  const kindDe = (i: ItemMatrizB2) => estatusDe(i.estado, i.semana_numero, semanaNum);

  return (
    <>
      <div className="b2-tb" role="toolbar" aria-label="Herramientas de la matriz">
        <button type="button" className="b2-btn b2-btn-sm" onClick={contraerTodo}>
          {todoContraido ? <IExpandirTodo width={16} height={16} /> : <IContraer width={16} height={16} />}{todoContraido ? "Expandir todo" : "Contraer todo"}
        </button>
        <Popover label="Columnas visibles"
          trigger={({ props }) => (<button type="button" className="b2-btn b2-btn-sm" {...props}><IColumnas width={16} height={16} />Columnas</button>)}>
          {() => (
            <div className="b2-pop-body">
              <p className="b2-pop-t">Columnas</p>
              {(Object.keys(NOMBRE_COL) as (keyof Visibles)[]).map((c) => (
                <label key={c} className="b2-chk"><input type="checkbox" checked={v[c]} onChange={(e) => { setManual(true); setVis({ ...v, [c]: e.target.checked }); }} />{NOMBRE_COL[c]}</label>
              ))}
              {compacto && !manual && <p className="b2-sub" style={{ whiteSpace: "normal", marginTop: 6 }}>Con poco ancho se muestran solo las columnas esenciales. Activa las que necesites.</p>}
              {manual && <button type="button" className="b2-link-btn" style={{ marginTop: 6 }} onClick={() => setManual(false)}>Restablecer columnas</button>}
            </div>
          )}
        </Popover>
        <Popover label="Filtros"
          trigger={({ props }) => (<button type="button" className="b2-btn b2-btn-sm" data-on={p.hayFiltros || undefined} {...props}><IFiltro width={16} height={16} />Filtros</button>)}>
          {() => <PanelFiltros f={f} setF={setF} meses={p.meses} semanas={p.semanas} categorias={p.categorias} />}
        </Popover>
        <label className="b2-tb-search">
          <IBuscar width={15} height={15} />
          <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar entregable, iniciativa o número" aria-label="Buscar en la matriz" />
        </label>
        {p.hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={p.limpiar}>Limpiar filtros</button>}
        <div className="b2-tb-fill" />
        <span className="b2-tb-count" aria-live="polite">{lista.length === total ? `${total} entregables` : `${lista.length} de ${total}`}</span>
        <button type="button" className="b2-btn b2-btn-sm" onClick={irAHoy} disabled={hoyX == null} title={hoyX == null ? "Hoy queda fuera del calendario del semestre" : undefined}><span className="b2-hoy-pt" aria-hidden="true" />Hoy<kbd className="b2-kbd b2-kbd-in">T</kbd></button>
        <div className="b2-seg" role="group" aria-label="Escala del cronograma">
          <button type="button" data-on={zoom === "semanal" || undefined} aria-pressed={zoom === "semanal"} onClick={() => setZoom("semanal")}>Semanal</button>
          <button type="button" data-on={zoom === "mensual" || undefined} aria-pressed={zoom === "mensual"} onClick={() => setZoom("mensual")}>Mensual</button>
        </div>
      </div>

      <div className="b2-gantt" ref={cont} style={style} role="treegrid" aria-label="Entregables y cronograma" tabIndex={0} aria-activedescendant={foco ? idFila(foco) : undefined} onKeyDown={teclas}>
        <div className="b2-g-inner">
          <div className="b2-g-head" role="row">
            <div className="b2-g-l b2-g-hl" role="presentation">
              {v.numero && <div className="b2-c b2-c-n" role="columnheader">{ordenBtn("numero", "N.º")}</div>}
              <div className="b2-c b2-c-t" role="columnheader">Entregable</div>
              {v.iniciativa && <div className="b2-c b2-c-ini" role="columnheader">Iniciativa</div>}
              {v.inicio && <div className="b2-c b2-c-f" role="columnheader">{ordenBtn("inicio", "Inicio")}</div>}
              {v.limite && <div className="b2-c b2-c-f" role="columnheader">{ordenBtn("limite", "Límite")}</div>}
              {v.horas && <div className="b2-c b2-c-h" role="columnheader">Horas</div>}
              {v.estado && <div className={`b2-c b2-c-e${muyAngosto ? " b2-c-e-ico" : ""}`} role="columnheader">{ordenBtn("estado", muyAngosto ? "Est." : "Estado")}</div>}
              {v.evidencia && <div className="b2-c b2-c-ev" role="columnheader">Evidencia</div>}
              <div className="b2-c b2-c-a" role="columnheader"><span className="b2-sr-only">Acciones</span></div>
            </div>
            <div className="b2-g-r b2-g-hr" role="presentation" style={{ width: ancho }}>
              <div className="b2-g-meses" aria-hidden="true">
                {mesesCal.map((m) => (<div key={m.clave} className="b2-g-mes" style={{ width: m.len * ppd }}><span>{zoom === "mensual" && m.len * ppd < 110 ? m.label.slice(0, 3) : m.label}</span></div>))}
              </div>
              <div className="b2-g-sems" aria-hidden="true">
                {semanasCal.map((s) => (
                  <div key={s.n} className="b2-g-sem" data-now={s.n === semanaNum || undefined} style={{ width: s.dias * ppd }}>
                    <span>{zoom === "semanal" ? `S${s.n} · ${fechaCorta(addDays(calendario!.inicio, (s.n - 1) * 7))}` : s.n}</span>
                  </div>
                ))}
              </div>
              {hoyX != null && <span className="b2-g-hoy-tag" style={{ left: hoyX }} aria-hidden="true" />}
            </div>
          </div>

          <div className="b2-g-body">
            {semIni != null && semFin != null && <div className="b2-g-semana" style={{ left: `calc(var(--lw) + ${semIni * ppd}px)`, width: (semFin - semIni + 1) * ppd }} aria-hidden="true" />}
            {hoyX != null && <div className="b2-g-linea" style={{ left: `calc(var(--lw) + ${hoyX}px)` }} aria-hidden="true" />}
            {filas.length === 0 && (
              <div className="b2-g-vacio-w">
                <ISeguimiento width={22} height={22} />
                <p>Ningún entregable coincide con los filtros.</p>
                <button type="button" className="b2-btn b2-btn-sm" onClick={p.limpiar}>Limpiar filtros</button>
              </div>
            )}
            {filas.map((x) => {
              const id = idFila(x.key);
              if (x.t === "item") {
                const i = x.item;
                const k = kindDe(i);
                const tieneFechas = esFecha(i.fecha_inicio_calculada) && esFecha(i.fecha_fin_calculada);
                const bx = tieneFechas ? Math.max(0, idxDe(i.fecha_inicio_calculada!)) * ppd : 0;
                const bfin = tieneFechas ? Math.min(NDIAS, idxDe(i.fecha_fin_calculada!) + 1) : 0;
                const bw = Math.max(ppd, bfin * ppd - bx);
                const evid = evidenciasDe(i);
                const seleccionada = foco === x.key || sel === i.id;
                return (
                  <div key={x.key} id={id} className="b2-g-row b2-g-item" role="row" aria-level={3} aria-selected={seleccionada} data-sel={seleccionada || undefined} data-venc={i.vencido || undefined}
                    onClick={() => { setFoco(x.key); onSel(i.id); }}>
                    <div className="b2-g-l" role="presentation">
                      {v.numero && <div className="b2-c b2-c-n" role="gridcell">{etiquetaNumero(i)}</div>}
                      <div className="b2-c b2-c-t" role="gridcell"><span className="b2-ind b2-ind-2" /><span className="b2-tt" title={i.entregable}>{i.entregable}</span></div>
                      {v.iniciativa && <div className="b2-c b2-c-ini" role="gridcell"><span className="b2-tt" title={i.iniciativa_titulo}>{i.iniciativa_titulo || "—"}</span></div>}
                      {v.inicio && <div className="b2-c b2-c-f" role="gridcell">{i.fecha_inicio_calculada ? fechaCorta(i.fecha_inicio_calculada) : "—"}</div>}
                      {v.limite && <div className="b2-c b2-c-f" role="gridcell" data-venc={i.vencido || undefined}>{i.fecha_fin_calculada ? fechaCorta(i.fecha_fin_calculada) : "—"}</div>}
                      {v.horas && <div className="b2-c b2-c-h" role="gridcell">{i.horas}</div>}
                      {v.estado && (muyAngosto
                        ? <div className="b2-c b2-c-e b2-c-e-ico" role="gridcell" title={`${ESTATUS_LABEL[k]}${i.vencido ? " · vencido" : ""}`}><EstadoIcon kind={KIND_DE[k]} size={16} /><span className="b2-sr-only">{ESTATUS_LABEL[k]}{i.vencido ? ", vencido" : ""}</span>{i.vencido && <span className="b2-venc-dot" aria-hidden="true" />}</div>
                        : <div className="b2-c b2-c-e" role="gridcell"><Estado kind={KIND_DE[k]} label={ESTATUS_LABEL[k]} />{i.vencido && <span className="b2-venc-tag">Vencido</span>}</div>)}
                      {v.evidencia && (
                        <div className="b2-c b2-c-ev" role="gridcell" onClick={(e) => e.stopPropagation()}>
                          {evid[0] && esHttp(evid[0]) ? <a href={evid[0]} target="_blank" rel="noopener noreferrer" aria-label={`Abrir evidencia de ${i.entregable}`}>{evid.length > 1 ? `${evid.length} enlaces` : "Abrir"}</a>
                            : i.requiere_evidencia && i.estado !== "aprobado" ? <span className="b2-muted">Pendiente</span> : <span className="b2-muted">—</span>}
                        </div>
                      )}
                      <div className="b2-c b2-c-a" role="gridcell" onClick={(e) => e.stopPropagation()}>
                        <Menu label={`Acciones de ${i.entregable}`}
                          trigger={({ props }) => (<button type="button" className="b2-btn b2-btn-ghost b2-btn-ico b2-btn-sm b2-row-kebab" aria-label={`Acciones de ${i.entregable}`} {...props}><IKebab width={16} height={16} /></button>)}
                          items={[
                            { label: "Ver detalle", onSelect: () => { setFoco(x.key); onSel(i.id); } },
                            { label: "Abrir evidencia", disabled: !(evid[0] && esHttp(evid[0])), onSelect: () => window.open(evid[0], "_blank", "noopener,noreferrer") },
                          ]} />
                      </div>
                    </div>
                    <div className="b2-g-r" role="presentation" style={{ width: ancho }}>
                      {tieneFechas && bfin > 0 && idxDe(i.fecha_fin_calculada!) >= 0
                        ? <span className="b2-bar" data-k={BAR_DE[k]} data-venc={i.vencido || undefined} style={{ left: bx, width: bw }} title={`${fechaCorta(i.fecha_inicio_calculada!)} – ${fechaCorta(i.fecha_fin_calculada!)}`} />
                        : <span className="b2-bar-sin">{tieneFechas ? "Fuera del calendario" : "Sin fecha"}</span>}
                    </div>
                  </div>
                );
              }
              const cerrado = !filtrando && colapsados.has(x.key);
              const nivel = x.t === "g1" ? 1 : 2;
              const conFechas = x.ini && x.fin && esFecha(x.ini) && esFecha(x.fin);
              const gx = conFechas ? Math.max(0, idxDe(x.ini!)) * ppd : 0;
              const gw = conFechas ? Math.max(ppd, Math.min(NDIAS, idxDe(x.fin!) + 1) * ppd - gx) : 0;
              return (
                <div key={x.key} id={id} className="b2-g-row b2-g-grupo" data-nivel={nivel} role="row" aria-level={nivel} aria-expanded={!cerrado} data-sel={foco === x.key || undefined}
                  onClick={() => { setFoco(x.key); alternar(x.key); }}>
                  <div className="b2-g-l" role="presentation">
                    {v.numero && <div className="b2-c b2-c-n" role="gridcell" />}
                    <div className="b2-c b2-c-t" role="gridcell">
                      <span className={`b2-ind b2-ind-${nivel - 1}`} />
                      <span className="b2-chev" data-closed={cerrado || undefined}>{cerrado ? <IChevR width={14} height={14} /> : <IChevD width={14} height={14} />}</span>
                      <span className="b2-tt b2-tt-g" title={x.label}>{x.label}</span>
                      <span className="b2-cnt" title="Reportados (en revisión o aprobados) / total">{x.hechos}/{x.n}</span>
                    </div>
                    {v.iniciativa && <div className="b2-c b2-c-ini" role="gridcell" />}
                    {v.inicio && <div className="b2-c b2-c-f" role="gridcell">{x.ini ? fechaCorta(x.ini) : "—"}</div>}
                    {v.limite && <div className="b2-c b2-c-f" role="gridcell">{x.fin ? fechaCorta(x.fin) : "—"}</div>}
                    {v.horas && <div className="b2-c b2-c-h" role="gridcell" />}
                    {v.estado && <div className={`b2-c b2-c-e${muyAngosto ? " b2-c-e-ico" : ""}`} role="gridcell"><span className="b2-prog" role="img" aria-label={`${x.hechos} de ${x.n} reportados`}><span style={{ width: `${(100 * x.hechos) / Math.max(1, x.n)}%` }} /></span></div>}
                    {v.evidencia && <div className="b2-c b2-c-ev" role="gridcell" />}
                    <div className="b2-c b2-c-a" role="gridcell" />
                  </div>
                  <div className="b2-g-r" role="presentation" style={{ width: ancho }}>
                    {conFechas && <span className="b2-bar-g" data-n={nivel} style={{ left: gx, width: gw }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="b2-mx-pie"><IArriba width={12} height={12} /><IAbajo width={12} height={12} /> Flechas para moverte · Enter abre el detalle · T lleva a hoy{semana && etiquetaSemana(semana) ? ` · ${etiquetaSemana(semana)}` : ""}</p>
    </>
  );
}

/* ───────────────────────── móvil: lista por semana o mes ───────────────────────── */
function Lista(p: VistaProps) {
  const { lista, items, f, setF, calendario, semanaNum, hoy, sel, onSel } = p;
  const [modo, setModo] = useState<"semana" | "mes">("semana");
  const NS = calendario?.semanas ?? 1;
  const hoyIdx = calendario && !calendario.derivado && hoy && esFecha(hoy) ? dias(calendario.inicio, hoy) : null;
  const semHoy = semanaNum ?? (hoyIdx != null && hoyIdx >= 0 && hoyIdx < (calendario?.dias ?? 0) ? Math.floor(hoyIdx / 7) + 1 : null);
  const semanasConItems = useMemo(() => {
    const con = new Set<number>();
    if (!calendario) return [] as number[];
    for (const i of items) {
      if (!esFecha(i.fecha_inicio_calculada) || !esFecha(i.fecha_fin_calculada)) continue;
      const a = Math.floor(dias(calendario.inicio, i.fecha_inicio_calculada) / 7) + 1;
      const b = Math.floor(dias(calendario.inicio, i.fecha_fin_calculada) / 7) + 1;
      for (let w = Math.max(1, a); w <= Math.min(NS, b); w++) con.add(w);
    }
    const ref = semHoy ?? 1;
    return [...con].sort((x, y) => Math.abs(x - ref) - Math.abs(y - ref) || x - y);
  }, [items, calendario, NS, semHoy]);
  const [sem, setSem] = useState(() => semHoy ?? semanasConItems[0] ?? 1);
  const mesesCal = useMemo(() => {
    if (!calendario) return [] as { label: string; ini: number; len: number; clave: string }[];
    const out: { label: string; ini: number; len: number; clave: string }[] = [];
    for (let d = 0; d < calendario.dias; d++) {
      const m = nombreMes(addDays(calendario.inicio, d));
      const u = out[out.length - 1];
      if (u && u.clave === m.clave) u.len++;
      else out.push({ label: `${m.nombre} ${m.anio}`, ini: d, len: 1, clave: m.clave });
    }
    return out;
  }, [calendario]);
  const mesDeHoy = Math.max(0, hoyIdx != null ? mesesCal.findIndex((m) => hoyIdx >= m.ini && hoyIdx < m.ini + m.len) : 0);
  const [mes, setMes] = useState(mesDeHoy);
  if (!calendario || mesesCal.length === 0) return <div className="b2-ml"><p className="b2-ml-vacio">No hay un calendario con el que organizar la lista.</p></div>;
  const [d0, d1] = modo === "semana" ? [(sem - 1) * 7, (sem - 1) * 7 + 6] : [mesesCal[mes].ini, mesesCal[mes].ini + mesesCal[mes].len - 1];
  const visibles = lista
    .filter((i) => esFecha(i.fecha_inicio_calculada) && esFecha(i.fecha_fin_calculada) && dias(calendario.inicio, i.fecha_fin_calculada) >= d0 && dias(calendario.inicio, i.fecha_inicio_calculada) <= d1)
    .sort((a, b) => (a.fecha_fin_calculada ?? "").localeCompare(b.fecha_fin_calculada ?? ""));
  const sinFecha = lista.filter((i) => !esFecha(i.fecha_inicio_calculada) || !esFecha(i.fecha_fin_calculada));
  const max = modo === "semana" ? NS : mesesCal.length;
  const val = modo === "semana" ? sem : mes + 1;
  const poner = (n: number) => (modo === "semana" ? setSem(Math.min(max, Math.max(1, n))) : setMes(Math.min(max, Math.max(1, n)) - 1));
  const esHoy = modo === "semana" ? sem === semHoy : mes === mesDeHoy && hoyIdx != null;
  const hayHoy = modo === "semana" ? semHoy != null : hoyIdx != null;
  const volverAHoy = () => { if (semHoy != null) setSem(semHoy); setMes(mesDeHoy); };
  const cercana = semanasConItems[0];
  const ETI = modo === "semana"
    ? <><strong>Semana {sem}</strong><span>{fechaCorta(addDays(calendario.inicio, d0))} – {fechaCorta(addDays(calendario.inicio, d1))}</span></>
    : <><strong>{mesesCal[mes].label.replace(/^./, (c) => c.toUpperCase())}</strong><span>{fechaCorta(addDays(calendario.inicio, d0))} – {fechaCorta(addDays(calendario.inicio, d1))}</span></>;
  const kindDe = (i: ItemMatrizB2) => estatusDe(i.estado, i.semana_numero, semanaNum);
  return (
    <div className="b2-ml">
      <div className="b2-ml-bar">
        <div className="b2-seg b2-seg-full" role="group" aria-label="Periodo">
          <button type="button" data-on={modo === "semana" || undefined} aria-pressed={modo === "semana"} onClick={() => setModo("semana")}>Semana</button>
          <button type="button" data-on={modo === "mes" || undefined} aria-pressed={modo === "mes"} onClick={() => setModo("mes")}>Mes</button>
        </div>
        <div className="b2-ml-nav">
          <button type="button" className="b2-btn b2-btn-ico" aria-label="Periodo anterior" disabled={val <= 1} onClick={() => poner(val - 1)}><IChevR width={16} height={16} style={{ transform: "scaleX(-1)" }} /></button>
          <div className="b2-ml-per" aria-live="polite">{ETI}{hayHoy && <span className="b2-ml-tag" data-now={esHoy || undefined}>{esHoy ? (modo === "semana" ? "Semana actual" : "Mes actual") : "Consultando"}</span>}</div>
          <button type="button" className="b2-btn b2-btn-ico" aria-label="Periodo siguiente" disabled={val >= max} onClick={() => poner(val + 1)}><IChevR width={16} height={16} /></button>
        </div>
        {hayHoy && !esHoy && hoy && (
          <div className="b2-ml-hoy">
            <span><span className="b2-hoy-pt" aria-hidden="true" /> Hoy es {fechaCorta(hoy)}{semHoy != null ? ` · semana ${semHoy}` : ""}</span>
            <button type="button" className="b2-btn b2-btn-sm b2-btn-primary" onClick={volverAHoy}>Volver a hoy</button>
          </div>
        )}
        <div className="b2-ml-filtros">
          <label className="b2-tb-search b2-ml-s"><IBuscar width={15} height={15} /><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar entregable" aria-label="Buscar en la matriz" /></label>
          <Popover align="right" label="Filtros"
            trigger={({ props }) => (<button type="button" className="b2-btn" data-on={p.hayFiltros || undefined} {...props}><IFiltro width={16} height={16} />Filtros</button>)}>
            {() => <PanelFiltros f={f} setF={setF} meses={p.meses} semanas={p.semanas} categorias={p.categorias} />}
          </Popover>
        </div>
      </div>
      <ul className="b2-ml-list">
        {visibles.length === 0 && (
          <li className="b2-ml-vacio">
            <div className="b2-ml-vacio-w">
              <p>No hay entregables {modo === "semana" ? "esta semana" : "este mes"}{p.hayFiltros ? " con esos filtros" : ""}.</p>
              {p.hayFiltros && <button type="button" className="b2-btn b2-btn-sm" onClick={p.limpiar}>Limpiar filtros</button>}
              {modo === "semana" && cercana != null && cercana !== sem && <button type="button" className="b2-btn b2-btn-sm" onClick={() => setSem(cercana)}>Ir a la semana {cercana}</button>}
            </div>
          </li>
        )}
        {visibles.map((i) => {
          const k = kindDe(i);
          const evid = evidenciasDe(i);
          return (
            <li key={i.id}>
              <button type="button" className="b2-ml-i" data-sel={sel === i.id || undefined} onClick={() => onSel(i.id)}>
                <span className="b2-ml-ic"><EstadoIcon kind={KIND_DE[k]} size={18} /></span>
                <span className="b2-ml-t">
                  <span className="b2-ml-n">{i.entregable}</span>
                  <span className="b2-ml-e"><Estado kind={KIND_DE[k]} label={ESTATUS_LABEL[k]} />{i.vencido && <span className="b2-venc-tag">Vencido</span>}{evid.length > 0 && <span className="b2-ml-ev">{evid.length} {evid.length === 1 ? "enlace" : "enlaces"}</span>}</span>
                  <span className="b2-ml-m">{etiquetaNumero(i)} · {i.iniciativa_titulo || i.fase}</span>
                </span>
                <span className="b2-ml-f" data-venc={i.vencido || undefined}><span className="b2-ml-fl">Límite</span>{i.fecha_fin_calculada ? fechaCorta(i.fecha_fin_calculada) : "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sinFecha.length > 0 && <p className="b2-mx-s" style={{ padding: "0 4px" }}>{sinFecha.length} {sinFecha.length === 1 ? "entregable sin fechas no aparece" : "entregables sin fechas no aparecen"} en la lista por periodo.</p>}
    </div>
  );
}
