// Prototipo B · Matriz: tabla a la izquierda + cronograma de las semanas reales a la derecha, en un único contenedor con desplazamiento.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as KE } from "react";
import { docenteActual, finSemestre, hoy, inicioSemestre, items, semanaActual, totalSemanas, type Item } from "../shared/model";
import {
  IAbajo, IArriba, IBuscar, IChevD, IChevR, IColumnas, IContraer, IExpandir, IExpandirTodo, IFiltro, IKebab, IReducir, ISeguimiento,
} from "./icons";
import { useMedia, useStore } from "./store";
import {
  Dl, Estado, EstadoIcon, Evidencias, Inspector, KIND_LABEL, KINDS, Menu, Popover, Tip, addDays, aMs, dias, diaHoy, enControl,
  fechaCorta, fechaLarga, revelar, semanaRango, tipoEvidencia, type Kind,
} from "./ui";

const NDIAS = dias(inicioSemestre, finSemestre) + 1;
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COLS = { docente: 108, inicio: 66, limite: 66, estado: 108 };
const W_TITULO = 292;
const W_ACC = 36;

type Fila =
  | { t: "g1"; key: string; label: string; n: number; hechos: number; ini: string; fin: string }
  | { t: "g2"; key: string; label: string; n: number; hechos: number; ini: string; fin: string; padre: string }
  | { t: "item"; key: string; item: Item; padre: string };

const minIso = (a: string, b: string) => (a < b ? a : b);
const maxIso = (a: string, b: string) => (a > b ? a : b);

function mesesDelSemestre() {
  const out: { label: string; ini: number; len: number; clave: string }[] = [];
  for (let d = 0; d < NDIAS; d++) {
    const f = new Date(aMs(inicioSemestre) + d * 86_400_000);
    const clave = `${f.getUTCFullYear()}-${f.getUTCMonth()}`;
    const u = out[out.length - 1];
    if (u && u.clave === clave) u.len++;
    else out.push({ label: `${MESES_LARGO[f.getUTCMonth()]} ${f.getUTCFullYear()}`, ini: d, len: 1, clave });
  }
  return out;
}
const MESES = mesesDelSemestre();

export function InspectorItem({ item, onClose }: { item: Item; onClose: () => void }) {
  const s = useStore();
  const k = s.kindItem(item);
  const puedeEnviar = s.rol === "docente" && (k === "porhacer" || k === "vencido" || k === "observado");
  return (
    <div className="insp-c">
      <p className="insp-sup">{item.categoria} · Entregable {item.numero}</p>
      <h2 className="insp-h">{item.titulo}</h2>
      <div className="insp-estado"><Estado kind={k} /></div>
      {item.comentario && k === "observado" && (
        <div className="callout"><strong>Observación de la revisión</strong><p>{item.comentario}</p></div>
      )}
      <Dl rows={[
        ["Fase", item.fase],
        ["Iniciativa", item.iniciativa || "Sin iniciativa"],
        ["Semana", `S${item.semana} · ${item.mes}`],
        ["Inicio", fechaLarga(item.inicio)],
        ["Límite", <span key="l" className={item.vencido && k !== "aprobado" ? "txt-danger" : undefined}>{fechaLarga(item.fin)}</span>],
        ["Horas", `${item.horas} h`],
        ["Envíos", String(item.envios)],
        ...(s.rol === "admin" ? ([["Docente", docenteActual.nombre]] as [string, string][]) : []),
      ]} />
      {item.descripcion && (<><h3 className="insp-sub">Evidencia esperada</h3><p className="insp-p">{item.descripcion}</p></>)}
      <h3 className="insp-sub">Evidencias enviadas</h3>
      <Evidencias lista={item.evidencias.map((u) => ({ tipo: tipoEvidencia(u), url: u }))} />
      <div className="insp-acc">
        {puedeEnviar && <button className="btn btn-primary" onClick={() => { s.marcarEnviado(item); }}>Enviar a revisión</button>}
        {s.rol === "admin" && <button className="btn btn-primary" onClick={() => { s.setFiltro("revision"); s.ir("revision"); }}>Ir a revisión</button>}
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

export function Matriz() {
  const s = useStore();
  const movil = useMedia("(max-width: 720px)");
  const [sel, setSel] = useState<number | null>(null);
  const seleccionado = sel == null ? null : items.find((i) => i.id === sel) ?? null;
  return (
    <div className="vista" data-insp="sel">
      <div className="vista-main" data-fill>
        {movil ? <Lista onSel={setSel} sel={sel} /> : <Cronograma sel={sel} onSel={setSel} />}
      </div>
      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && <InspectorItem item={seleccionado} onClose={() => setSel(null)} />}
      </Inspector>
    </div>
  );
}

/* ───────────────────────── filtros comunes ───────────────────────── */
function useItemsFiltrados(ocultarAprobados = false) {
  const s = useStore();
  const q = s.query.trim().toLowerCase();
  return useMemo(() => items.filter((i) => {
    const k = s.kindItem(i);
    if (s.filtro !== "todos" && k !== s.filtro) return false;
    if (ocultarAprobados && k === "aprobado") return false;
    if (q && !(`${i.titulo} ${i.iniciativa} ${i.fase} ${docenteActual.nombre}`.toLowerCase().includes(q))) return false;
    return true;
  }), [s.filtro, q, ocultarAprobados, s.kindItem]);
}

/* ───────────────────────── escritorio: tabla + cronograma ───────────────────────── */
function Cronograma({ sel, onSel }: { sel: number | null; onSel: (id: number | null) => void }) {
  const s = useStore();
  const [zoom, setZoom] = useState<"semanal" | "mensual">("semanal");
  const [anchoCont, setAnchoCont] = useState(1200);
  const compacto = anchoCont < 1100;
  const [colsUsuario, setCols] = useState({ docente: s.rol === "admin", inicio: true, limite: true, estado: true });
  const cols = compacto ? { ...colsUsuario, docente: false, inicio: false } : colsUsuario;
  const wt = compacto ? 210 : W_TITULO;
  const [ocultarAprobados, setOcultar] = useState(false);
  const lista = useItemsFiltrados(ocultarAprobados);
  const ppd = zoom === "semanal" ? 14 : 5;
  const cont = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const c = cont.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setAnchoCont(c.clientWidth));
    ro.observe(c);
    setAnchoCont(c.clientWidth);
    return () => ro.disconnect();
  }, []);
  const filtrando = s.query.trim() !== "" || s.filtro !== "todos" || ocultarAprobados;

  useEffect(() => { setCols((c) => ({ ...c, docente: s.rol === "admin" })); }, [s.rol]);

  const grupos = useMemo(() => {
    const porFase = new Map<string, Map<string, Item[]>>();
    for (const i of [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.numero - b.numero)) {
      const f = porFase.get(i.fase) ?? new Map<string, Item[]>();
      const ini = i.iniciativa || "Sin iniciativa";
      f.set(ini, [...(f.get(ini) ?? []), i]);
      porFase.set(i.fase, f);
    }
    return porFase;
  }, [lista]);

  const [colapsados, setColapsados] = useState<Set<string>>(() => {
    const c = new Set<string>();
    const porFase = new Map<string, Item[]>();
    for (const i of items) porFase.set(i.fase, [...(porFase.get(i.fase) ?? []), i]);
    porFase.forEach((v, fase) => { if (v.every((i) => i.estado === "aprobado")) c.add(`f:${fase}`); });
    return c;
  });

  const filas = useMemo(() => {
    const out: Fila[] = [];
    grupos.forEach((inis, fase) => {
      const todos = [...inis.values()].flat();
      const k1 = `f:${fase}`;
      out.push({
        t: "g1", key: k1, label: fase, n: todos.length, hechos: todos.filter((i) => s.kindItem(i) === "aprobado").length,
        ini: todos.reduce((a, i) => minIso(a, i.inicio), "9999"), fin: todos.reduce((a, i) => maxIso(a, i.fin), "0000"),
      });
      if (!filtrando && colapsados.has(k1)) return;
      inis.forEach((its, ini) => {
        const k2 = `i:${fase}|${ini}`;
        out.push({
          t: "g2", key: k2, label: ini, n: its.length, hechos: its.filter((i) => s.kindItem(i) === "aprobado").length, padre: k1,
          ini: its.reduce((a, i) => minIso(a, i.inicio), "9999"), fin: its.reduce((a, i) => maxIso(a, i.fin), "0000"),
        });
        if (!filtrando && colapsados.has(k2)) return;
        for (const item of its) out.push({ t: "item", key: `n:${item.id}`, item, padre: k2 });
      });
    });
    return out;
  }, [grupos, colapsados, filtrando, s.kindItem]);

  const [foco, setFoco] = useState<string | null>(null);
  const alternar = useCallback((key: string) => setColapsados((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; }), []);
  const todasFases = useMemo(() => [...grupos.keys()].map((f) => `f:${f}`), [grupos]);
  const todoContraido = todasFases.length > 0 && todasFases.every((k) => colapsados.has(k));
  const contraerTodo = () => setColapsados(todoContraido ? new Set() : new Set(todasFases));

  const lw = wt + (cols.docente ? COLS.docente : 0) + (cols.inicio ? COLS.inicio : 0) + (cols.limite ? COLS.limite : 0) + (cols.estado ? COLS.estado : 0) + W_ACC;
  const hoyX = (diaHoy + 0.5) * ppd;
  const ancho = NDIAS * ppd;

  const irAHoy = useCallback(() => {
    const c = cont.current;
    if (!c) return;
    c.scrollLeft = Math.max(0, hoyX - (c.clientWidth - lw) / 2);
  }, [hoyX, lw]);
  useLayoutEffect(() => { irAHoy(); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if ((e.key === "t" || e.key === "T") && !enControl(e.target) && !e.metaKey && !e.ctrlKey) irAHoy(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [irAHoy]);

  const idx = filas.findIndex((f) => f.key === foco);
  const mover = (d: number) => {
    const n = Math.max(0, Math.min(filas.length - 1, (idx < 0 ? (d > 0 ? -1 : filas.length) : idx) + d));
    const f = filas[n];
    if (!f) return;
    setFoco(f.key);
    if (sel != null && f.t === "item") onSel(f.item.id);
    requestAnimationFrame(() => revelar(cont.current, document.getElementById(`fila-${f.key.replace(/[^\w]/g, "_")}`), 46));
  };
  const teclas = (e: KE) => {
    if (enControl(e.target)) return;
    const f = idx >= 0 ? filas[idx] : null;
    if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
    else if (e.key === "ArrowRight" && f && f.t !== "item" && colapsados.has(f.key)) { e.preventDefault(); alternar(f.key); }
    else if (e.key === "ArrowLeft" && f && f.t !== "item" && !colapsados.has(f.key)) { e.preventDefault(); alternar(f.key); }
    else if (e.key === "Enter" && f) { e.preventDefault(); if (f.t === "item") onSel(f.item.id); else alternar(f.key); }
    else if (e.key === "Escape" && sel != null) { e.stopPropagation(); onSel(null); }
  };

  const semanas = Array.from({ length: totalSemanas }, (_, i) => i + 1);
  const style = { "--ppd": `${ppd}px`, "--lw": `${lw}px`, "--w-line": `${ancho}px`, "--wt": `${wt}px` } as CSSProperties;
  const total = items.length;

  return (
    <section className="mx" aria-label="Matriz de seguimiento">
      <h1 className="mx-t"><ISeguimiento width={20} height={20} />{s.rol === "admin" ? "Seguimiento" : "Mi matriz"}</h1>
      <div className="tb" role="toolbar" aria-label="Herramientas de la matriz">
        <button className="btn btn-sm" onClick={contraerTodo}>
          {todoContraido ? <IExpandirTodo width={16} height={16} /> : <IContraer width={16} height={16} />}
          {todoContraido ? "Expandir todo" : "Contraer todo"}
        </button>
        <Popover label="Columnas visibles"
          trigger={({ props }) => (<button className="btn btn-sm" {...props}><IColumnas width={16} height={16} />Columnas</button>)}>
          {() => (
            <div className="pop-body">
              <p className="pop-t">Columnas</p>
              {(["docente", "inicio", "limite", "estado"] as const).map((c) => (
                <label key={c} className="chk"><input type="checkbox" checked={colsUsuario[c]} onChange={(e) => setCols({ ...colsUsuario, [c]: e.target.checked })} />{{ docente: "Docente", inicio: "Inicio", limite: "Límite", estado: "Estado" }[c]}</label>
              ))}
            </div>
          )}
        </Popover>
        <Popover label="Filtros"
          trigger={({ props }) => (
            <button className="btn btn-sm" data-on={(s.filtro !== "todos" || ocultarAprobados) || undefined} {...props}><IFiltro width={16} height={16} />Filtros</button>
          )}>
          {() => (
            <div className="pop-body">
              <p className="pop-t">Estado</p>
              {(["todos", ...KINDS] as const).map((k) => (
                <label key={k} className="chk"><input type="radio" name="estado-f" checked={s.filtro === k} onChange={() => s.setFiltro(k)} />
                  {k === "todos" ? "Todos" : <><EstadoIcon kind={k} size={14} />{KIND_LABEL[k]}</>}
                </label>
              ))}
              <p className="pop-t pop-t2">Vista</p>
              <label className="chk"><input type="checkbox" checked={ocultarAprobados} onChange={(e) => setOcultar(e.target.checked)} />Ocultar aprobados</label>
            </div>
          )}
        </Popover>
        <label className="tb-search">
          <IBuscar width={15} height={15} />
          <input value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder="Buscar en la matriz" aria-label="Buscar en la matriz" />
        </label>
        <div className="tb-fill" />
        <span className="tb-count" aria-live="polite">{lista.length === total ? `${total} entregables` : `${lista.length} de ${total}`}</span>
        <button className="btn btn-sm" onClick={irAHoy}><span className="hoy-pt" aria-hidden="true" />Hoy<Kbdmini /></button>
        <div className="seg" role="group" aria-label="Escala del cronograma">
          <button data-on={zoom === "semanal" || undefined} aria-pressed={zoom === "semanal"} onClick={() => setZoom("semanal")}>Semanal</button>
          <button data-on={zoom === "mensual" || undefined} aria-pressed={zoom === "mensual"} onClick={() => setZoom("mensual")}>Mensual</button>
        </div>
        <Tip label={s.ampliar ? "Salir de vista ampliada" : "Ampliar vista"} side="bottom">
          <button className="btn btn-sm btn-ico" onClick={() => s.setAmpliar(!s.ampliar)} aria-pressed={s.ampliar} aria-label={s.ampliar ? "Salir de vista ampliada" : "Ampliar vista"}>
            {s.ampliar ? <IReducir width={16} height={16} /> : <IExpandir width={16} height={16} />}
          </button>
        </Tip>
      </div>

      <div className="gantt" ref={cont} style={style} role="treegrid" aria-label="Entregables y cronograma" tabIndex={0} aria-activedescendant={foco ? `fila-${foco.replace(/[^\w]/g, "_")}` : undefined} onKeyDown={teclas}>
        <div className="g-inner">
          <div className="g-head" role="row">
            <div className="g-l g-hl" role="presentation">
              <div className="c c-t" role="columnheader">Entregable</div>
              {cols.docente && <div className="c c-doc" role="columnheader">Docente</div>}
              {cols.inicio && <div className="c c-f" role="columnheader">Inicio</div>}
              {cols.limite && <div className="c c-f" role="columnheader">Límite</div>}
              {cols.estado && <div className="c c-e" role="columnheader">Estado</div>}
              <div className="c c-a" role="columnheader"><span className="sr-only">Acciones</span></div>
            </div>
            <div className="g-r g-hr" role="presentation" style={{ width: ancho }}>
              <div className="g-meses" aria-hidden="true">
                {MESES.map((m) => (<div key={m.clave} className="g-mes" style={{ width: m.len * ppd }}><span>{zoom === "mensual" && m.len * ppd < 110 ? m.label.slice(0, 3) : m.label}</span></div>))}
              </div>
              <div className="g-sems" aria-hidden="true">
                {semanas.map((n) => (
                  <div key={n} className="g-sem" data-now={n === semanaActual || undefined} style={{ width: 7 * ppd }}>
                    <span>{zoom === "semanal" ? `S${n} · ${fechaCorta(semanaRango(n)[0])}` : n}</span>
                  </div>
                ))}
              </div>
              <span className="g-hoy-tag" style={{ left: hoyX }} aria-hidden="true" />
            </div>
          </div>

          <div className="g-body">
            <div className="g-semana" style={{ left: `calc(var(--lw) + ${(semanaActual - 1) * 7 * ppd}px)`, width: 7 * ppd }} aria-hidden="true" />
            <div className="g-linea" style={{ left: `calc(var(--lw) + ${hoyX}px)` }} aria-hidden="true" />
            {filas.length === 0 && (
              <div className="g-vacio">
                <ISeguimiento width={22} height={22} />
                <p>No hay entregables con este filtro.</p>
                <button className="btn btn-sm" onClick={() => { s.setFiltro("todos"); s.setQuery(""); setOcultar(false); }}>Quitar filtros</button>
              </div>
            )}
            {filas.map((f) => {
              const id = `fila-${f.key.replace(/[^\w]/g, "_")}`;
              if (f.t === "item") {
                const i = f.item;
                const k = s.kindItem(i);
                const x = dias(inicioSemestre, i.inicio) * ppd;
                const w = Math.max(ppd, (dias(i.inicio, i.fin) + 1) * ppd);
                const venc = i.vencido && k !== "aprobado";
                return (
                  <div key={f.key} id={id} className="g-row g-item" role="row" aria-level={3} aria-selected={foco === f.key || sel === i.id}
                    data-sel={foco === f.key || sel === i.id || undefined} data-venc={venc || undefined}
                    onClick={() => { setFoco(f.key); onSel(i.id); }}>
                    <div className="g-l" role="presentation">
                      <div className="c c-t" role="gridcell"><span className="ind ind-2" /><span className="tt" title={i.titulo}>{i.titulo}</span></div>
                      {cols.docente && <div className="c c-doc" role="gridcell"><span className="tt">{docenteActual.nombre}</span></div>}
                      {cols.inicio && <div className="c c-f" role="gridcell">{fechaCorta(i.inicio)}</div>}
                      {cols.limite && <div className="c c-f" role="gridcell" data-venc={venc || undefined}>{fechaCorta(i.fin)}</div>}
                      {cols.estado && <div className="c c-e" role="gridcell"><Estado kind={k} /></div>}
                      <div className="c c-a" role="gridcell" onClick={(e) => e.stopPropagation()}>
                        <Menu label={`Acciones de ${i.titulo}`}
                          trigger={({ props }) => (<button className="btn btn-ghost btn-ico btn-sm row-kebab" aria-label={`Acciones de ${i.titulo}`} {...props}><IKebab width={16} height={16} /></button>)}
                          items={[
                            { label: "Ver detalle", onSelect: () => { setFoco(f.key); onSel(i.id); } },
                            { label: "Enviar a revisión", disabled: !(s.rol === "docente" && (k === "porhacer" || k === "vencido" || k === "observado")), onSelect: () => s.marcarEnviado(i) },
                            { label: "Abrir evidencia", disabled: i.evidencias.length === 0, onSelect: () => window.open(i.evidencias[0], "_blank", "noopener,noreferrer") },
                          ]} />
                      </div>
                    </div>
                    <div className="g-r" role="presentation" style={{ width: ancho }}>
                      <span className="bar" data-k={k} style={{ left: x, width: w }} title={`${fechaCorta(i.inicio)} – ${fechaCorta(i.fin)}`} />
                    </div>
                  </div>
                );
              }
              const cerrado = !filtrando && colapsados.has(f.key);
              const x = dias(inicioSemestre, f.ini) * ppd;
              const w = (dias(f.ini, f.fin) + 1) * ppd;
              const nivel = f.t === "g1" ? 1 : 2;
              return (
                <div key={f.key} id={id} className="g-row g-grupo" data-nivel={nivel} role="row" aria-level={nivel} aria-expanded={!cerrado}
                  data-sel={foco === f.key || undefined} onClick={() => { setFoco(f.key); alternar(f.key); }}>
                  <div className="g-l" role="presentation">
                    <div className="c c-t" role="gridcell">
                      <span className={`ind ind-${nivel - 1}`} />
                      <span className="chev" data-closed={cerrado || undefined}>{cerrado ? <IChevR width={14} height={14} /> : <IChevD width={14} height={14} />}</span>
                      <span className="tt tt-g" title={f.label}>{f.label}</span>
                      <span className="cnt">{f.hechos}/{f.n}</span>
                    </div>
                    {cols.docente && <div className="c c-doc" role="gridcell" />}
                    {cols.inicio && <div className="c c-f" role="gridcell">{fechaCorta(f.ini)}</div>}
                    {cols.limite && <div className="c c-f" role="gridcell">{fechaCorta(f.fin)}</div>}
                    {cols.estado && <div className="c c-e" role="gridcell"><span className="prog" aria-label={`${f.hechos} de ${f.n} aprobados`}><span style={{ width: `${(100 * f.hechos) / f.n}%` }} /></span></div>}
                    <div className="c c-a" role="gridcell" />
                  </div>
                  <div className="g-r" role="presentation" style={{ width: ancho }}>
                    <span className="bar-g" data-n={nivel} style={{ left: x, width: w }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mx-pie"><IArriba width={12} height={12} /><IAbajo width={12} height={12} /> Flechas para moverte · Enter abre el detalle · T lleva a hoy</p>
    </section>
  );
}

function Kbdmini() {
  return <kbd className="kbd kbd-in">T</kbd>;
}

/* ───────────────────────── móvil: lista por semana o mes ───────────────────────── */
function Lista({ sel, onSel }: { sel: number | null; onSel: (id: number | null) => void }) {
  const s = useStore();
  const lista = useItemsFiltrados();
  const [modo, setModo] = useState<"semana" | "mes">("semana");
  const semanasConItems = useMemo(() => {
    const con = new Set<number>();
    for (const i of items) for (let w = Math.floor(dias(inicioSemestre, i.inicio) / 7) + 1; w <= Math.floor(dias(inicioSemestre, i.fin) / 7) + 1; w++) con.add(w);
    return [...con].sort((a, b) => Math.abs(a - semanaActual) - Math.abs(b - semanaActual) || a - b);
  }, []);
  const [sem, setSem] = useState(semanaActual);
  const mesDeHoy = Math.max(0, MESES.findIndex((m) => diaHoy >= m.ini && diaHoy < m.ini + m.len));
  const [mes, setMes] = useState(mesDeHoy);
  const [d0, d1] = modo === "semana" ? [(sem - 1) * 7, (sem - 1) * 7 + 6] : [MESES[mes].ini, MESES[mes].ini + MESES[mes].len - 1];
  const visibles = lista.filter((i) => dias(inicioSemestre, i.fin) >= d0 && dias(inicioSemestre, i.inicio) <= d1).sort((a, b) => a.fin.localeCompare(b.fin));
  const max = modo === "semana" ? totalSemanas : MESES.length;
  const val = modo === "semana" ? sem : mes + 1;
  const poner = (v: number) => (modo === "semana" ? setSem(Math.min(max, Math.max(1, v))) : setMes(Math.min(max, Math.max(1, v)) - 1));
  const esHoy = modo === "semana" ? sem === semanaActual : mes === mesDeHoy;
  const volverAHoy = () => { setSem(semanaActual); setMes(mesDeHoy); };
  const cercana = semanasConItems[0];
  const etiqueta = modo === "semana"
    ? <><strong>Semana {sem}</strong><span>{fechaCorta(semanaRango(sem)[0])} – {fechaCorta(semanaRango(sem)[1])}</span></>
    : <><strong>{MESES[mes].label.replace(/^./, (c) => c.toUpperCase())}</strong><span>{fechaCorta(addDays(inicioSemestre, d0))} – {fechaCorta(addDays(inicioSemestre, d1))}</span></>;
  return (
    <section className="ml" aria-label="Matriz de seguimiento">
      <h1 className="sr-only">{s.rol === "admin" ? "Seguimiento" : "Mi matriz"}</h1>
      <div className="ml-bar">
        <div className="seg seg-full" role="group" aria-label="Periodo">
          <button data-on={modo === "semana" || undefined} aria-pressed={modo === "semana"} onClick={() => setModo("semana")}>Semana</button>
          <button data-on={modo === "mes" || undefined} aria-pressed={modo === "mes"} onClick={() => setModo("mes")}>Mes</button>
        </div>
        <div className="ml-nav">
          <button className="btn btn-ico" aria-label="Periodo anterior" disabled={val <= 1} onClick={() => poner(val - 1)}><IChevR width={16} height={16} style={{ transform: "scaleX(-1)" }} /></button>
          <div className="ml-per" aria-live="polite">{etiqueta}<span className="ml-tag" data-now={esHoy || undefined}>{esHoy ? (modo === "semana" ? "Semana actual" : "Mes actual") : "Consultando"}</span></div>
          <button className="btn btn-ico" aria-label="Periodo siguiente" disabled={val >= max} onClick={() => poner(val + 1)}><IChevR width={16} height={16} /></button>
        </div>
        {!esHoy && (
          <div className="ml-hoy">
            <span><span className="hoy-pt" aria-hidden="true" /> Hoy es {fechaCorta(hoy)} · semana {semanaActual}</span>
            <button className="btn btn-sm btn-primary" onClick={volverAHoy}>Volver a hoy</button>
          </div>
        )}
        <label className="tb-search ml-s"><IBuscar width={15} height={15} /><input value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder="Buscar entregable" aria-label="Buscar en la matriz" /></label>
      </div>
      <ul className="ml-list">
        {visibles.length === 0 && (
          <li className="ml-vacio">
            <p>No hay entregables {modo === "semana" ? "esta semana" : "este mes"}{s.filtro !== "todos" || s.query ? " con ese filtro" : ""}.</p>
            {modo === "semana" && cercana && cercana !== sem && <button className="btn btn-sm" onClick={() => setSem(cercana)}>Ir a la semana {cercana}</button>}
          </li>
        )}
        {visibles.map((i) => {
          const k: Kind = s.kindItem(i);
          const venc = i.vencido && k !== "aprobado";
          return (
            <li key={i.id}>
              <button className="ml-i" data-sel={sel === i.id || undefined} onClick={() => onSel(i.id)}>
                <span className="ml-ic"><EstadoIcon kind={k} size={18} /></span>
                <span className="ml-t">
                  <span className="ml-n">{i.titulo}</span>
                  <span className="ml-e"><Estado kind={k} />{i.evidencias.length > 0 && <span className="ml-ev">{i.evidencias.length} {i.evidencias.length === 1 ? "enlace" : "enlaces"}</span>}</span>
                  <span className="ml-m">{i.iniciativa || i.fase}</span>
                </span>
                <span className="ml-f" data-venc={venc || undefined}><span className="ml-fl">Límite</span>{fechaCorta(i.fin)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
