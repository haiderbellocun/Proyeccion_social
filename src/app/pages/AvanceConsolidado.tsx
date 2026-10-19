import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AnaPagina, ApiladaH, ColumnasAgrupadas, Figura, FilasApiladas, FilasBala, Indicadores, Leyenda, n0, pct, type Categoria } from "../components/b2/charts-b2";
import { Barra, Buscar, Chips, DataTable, ErrorCarga, Filtro, Tag, fechaCorta, type Col } from "../components/b2/admin-ui";
import { Bullet } from "../components/b2/Bullet";
import { IRefrescar, ISeguimiento } from "../components/b2/icons";
import { Dl, Estado, type Kind } from "../components/b2/ui";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";
import { semaforoConfig, type Semaforo } from "../data/matrizConstants";
import "../components/b2/b2-ana-avance.css";

/* ───────── tipos (respuesta de GET /admin/avance-consolidado) ───────── */
interface AvanceMes {
  mes: string;
  completados: number;
  reportados?: number;
  aprobados?: number;
  total: number;
  porcentaje: number;
  porcentaje_aprobado?: number;
}

export interface DocenteAvance {
  id: number;
  nombre: string;
  programa: string;
  regional: string;
  grupo_id: number | null;
  grupo_nombre: string;
  tipo_docente: "ANTIGUO" | "NUEVO";
  avance_global: number;
  avance_real: number;
  avance_esperado: number;
  cumplimiento_esperado: number;
  /** Puntos porcentuales: % aprobado − % esperado. */
  brecha: number;
  brecha_entregables?: number;
  exigibles_a_fecha?: number;
  cumplimiento_exigible?: number;
  avance_aprobado: number;
  semaforo: Semaforo;
  pendientes_revision: number;
  observados: number;
  reportados: number;
  aprobados: number;
  total_entregables: number;
  avance_por_mes: AvanceMes[];
  entregables_vencidos: number;
  ultimo_reporte: string | null;
}

interface Totales {
  docentes: number;
  promedio_global: number;
  promedio_aprobado?: number;
  promedio_esperado?: number;
  con_retraso?: number;
  pendientes_revision?: number;
  semaforo?: { verde: number; amarillo: number; rojo: number };
  por_mes: { mes: string; porcentaje: number }[];
}

interface Payload {
  meses: string[];
  docentes: DocenteAvance[];
  totales: Totales;
  hoy?: string;
  alcance?: { semestre: string | null; activo: boolean; estado_periodo: string; vacio: boolean; advertencias: string[] };
}

interface SemestreDetalle { codigo: string; fecha_inicio: string; fecha_fin: string }
interface GrupoOpt { id: number; nombre: string; semestre: string }

type EstadoFiltro = "todos" | "rojo" | "amarillo" | "verde" | "sin_exigibles" | "sin_grupo";
type Orden = { clave: string; dir: "asc" | "desc" };

/* ───────── agregación (misma definición que `totales` del backend) ─────────
 * Solo se usa cuando hay filtros de cliente (programa, regional, estado, búsqueda); sin filtros se muestran los totales del backend. */
const round1 = (v: number) => Math.round(v * 10) / 10;
export interface AgregadoAvance {
  docentes: number;
  promedio_global: number;
  promedio_aprobado: number;
  promedio_esperado: number;
  con_retraso: number;
  pendientes_revision: number;
  observados: number;
  vencidos: number;
  aprobados: number;
  reportados: number;
  total_entregables: number;
  semaforo: { verde: number; amarillo: number; rojo: number };
  por_mes: { mes: string; porcentaje: number }[];
}
export function agregarAvance(docs: DocenteAvance[], meses: string[] = []): AgregadoAvance {
  const n = docs.length;
  const sum = (f: (d: DocenteAvance) => number) => docs.reduce((s, d) => s + f(d), 0);
  const avg = (arr: number[]) => (arr.length === 0 ? 0 : round1(arr.reduce((a, b) => a + b, 0) / arr.length));
  const conGrupo = docs.filter((d) => d.total_entregables > 0);
  return {
    docentes: n,
    promedio_global: n > 0 ? round1(sum((d) => d.avance_global) / n) : 0,
    promedio_aprobado: avg(conGrupo.map((d) => d.avance_aprobado)),
    promedio_esperado: avg(conGrupo.map((d) => d.avance_esperado)),
    con_retraso: docs.filter((d) => d.entregables_vencidos > 0).length,
    pendientes_revision: sum((d) => d.pendientes_revision),
    observados: sum((d) => d.observados),
    vencidos: sum((d) => d.entregables_vencidos),
    aprobados: sum((d) => d.aprobados),
    reportados: sum((d) => d.reportados),
    total_entregables: sum((d) => d.total_entregables),
    semaforo: {
      verde: docs.filter((d) => d.semaforo === "verde").length,
      amarillo: docs.filter((d) => d.semaforo === "amarillo").length,
      rojo: docs.filter((d) => d.semaforo === "rojo").length,
    },
    por_mes: meses.map((mes) => ({
      mes,
      porcentaje: avg(docs.map((d) => d.avance_por_mes.find((m) => m.mes === mes)).filter((m): m is AvanceMes => !!m && m.total > 0).map((m) => m.porcentaje)),
    })),
  };
}

/* ───────── utilidades de presentación ───────── */
const KIND_SEMAFORO: Record<Semaforo, Kind> = { verde: "aprobado", amarillo: "observado", rojo: "vencido", sin_exigibles: "porhacer", sin_datos: "porhacer" };
const sinGrupo = (d: DocenteAvance) => d.grupo_id == null;
const claveEstado = (d: DocenteAvance): Exclude<EstadoFiltro, "todos"> => (sinGrupo(d) || d.semaforo === "sin_datos" ? "sin_grupo" : d.semaforo === "sin_exigibles" ? "sin_exigibles" : d.semaforo);
const estadoDe = (d: DocenteAvance): { kind: Kind; label: string } =>
  sinGrupo(d) ? { kind: "porhacer", label: "Sin grupo" } : { kind: KIND_SEMAFORO[d.semaforo] ?? "porhacer", label: (semaforoConfig[d.semaforo] ?? semaforoConfig.sin_datos).label };
const pp = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: 1 })} pp`;
const mesDe = (d: DocenteAvance, mes: string) => d.avance_por_mes.find((m) => m.mes === mes);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace("setiembre", "septiembre");
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Primer día exigible del mes dentro del semestre; null si el mes no se puede ubicar sin ambigüedad. */
function inicioDeMes(mes: string, cal: { inicio: string; fin: string } | null): string | null {
  if (!cal) return null;
  const idx = MESES_ES.indexOf(norm(mes));
  if (idx < 0) return null;
  const [yi, mi] = cal.inicio.slice(0, 7).split("-").map(Number);
  const [yf, mf] = cal.fin.slice(0, 7).split("-").map(Number);
  const coincidencias: { y: number; m: number }[] = [];
  for (let y = yi, m = mi; y < yf || (y === yf && m <= mf); m += 1) {
    if (m > 12) { m = 1; y += 1; }
    if (m - 1 === idx) coincidencias.push({ y, m });
    if (y === yf && m === mf) break;
  }
  if (coincidencias.length !== 1) return null;
  const { y, m } = coincidencias[0];
  const primero = `${y}-${String(m).padStart(2, "0")}-01`;
  return primero < cal.inicio.slice(0, 10) ? cal.inicio.slice(0, 10) : primero;
}

const CLAVES_ORDEN: { id: string; label: string }[] = [
  { id: "nombre", label: "Docente" },
  { id: "global", label: "Reportado" },
  { id: "aprobado", label: "Aprobado" },
  { id: "esperado", label: "Esperado" },
  { id: "cumplimiento", label: "Cumplimiento" },
  { id: "brecha", label: "Brecha" },
  { id: "vencidos", label: "Vencidos" },
];

function valorOrden(d: DocenteAvance, clave: string): number {
  switch (clave) {
    case "global": return d.avance_global;
    case "aprobado": return d.avance_aprobado;
    case "esperado": return d.avance_esperado;
    case "cumplimiento": return d.cumplimiento_esperado;
    case "brecha": return d.brecha;
    case "vencidos": return d.entregables_vencidos;
    default: return mesDe(d, clave)?.porcentaje ?? 0;
  }
}

export default function AvanceConsolidado() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isAdmin = user?.rol === "admin";
  const [params] = useSearchParams();

  const [semestre, setSemestre] = useState(() => params.get("semestre") ?? "");
  const [grupoId, setGrupoId] = useState(() => (Number.isInteger(Number(params.get("grupo"))) && Number(params.get("grupo")) > 0 ? String(Number(params.get("grupo"))) : ""));
  const [semestresListos, setSemestresListos] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [programa, setPrograma] = useState("");
  const [regional, setRegional] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [orden, setOrden] = useState<Orden>({ clave: "global", dir: "asc" });
  const [sel, setSel] = useState<number | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [grupos, setGrupos] = useState<GrupoOpt[]>([]);
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<SemestreDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const solicitud = useRef(0);
  const solicitudGrupos = useRef(0);

  /* ───── carga: solo cuenta la última solicitud ───── */
  const fetchData = useCallback(async (mantener = false) => {
    if (!isAdmin) return;
    const mia = ++solicitud.current;
    setLoading(true);
    setError(null);
    if (!mantener) setData(null);
    try {
      const q = new URLSearchParams();
      if (semestre.trim()) q.set("semestre", semestre.trim());
      if (grupoId.trim()) q.set("grupo_id", grupoId.trim());
      const res = await fetch(`${API_BASE}/admin/avance-consolidado?${q.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      if (mia !== solicitud.current) return;
      setData(json as Payload);
    } catch (e) {
      if (mia !== solicitud.current) return;
      console.error(e);
      notify.error("No se pudo cargar el avance consolidado. Intente de nuevo más tarde.");
      setError("No se pudo cargar el avance consolidado.");
      setData(null);
    } finally {
      if (mia === solicitud.current) setLoading(false);
    }
  }, [isAdmin, semestre, grupoId]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/semestres`);
        const j = await r.json();
        const s: string[] = j.semestres || [];
        const activeCode = String(j.activo?.codigo || "");
        setSemestresList(s);
        setDetalle(Array.isArray(j.detalle) ? j.detalle : []);
        if (s.length) {
          setSemestre((prev) => (prev && s.includes(prev) ? prev : activeCode && s.includes(activeCode) ? activeCode : s[0]));
        }
      } catch {
        setSemestresList([]);
      } finally {
        setSemestresListos(true);
      }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const mia = ++solicitudGrupos.current;
    (async () => {
      try {
        const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
        const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
        const j = await r.json();
        if (mia !== solicitudGrupos.current) return;
        setGrupos((j.grupos || []).map((g: GrupoOpt) => ({ id: g.id, nombre: g.nombre, semestre: g.semestre })));
      } catch {
        if (mia === solicitudGrupos.current) setGrupos([]);
      }
    })();
  }, [isAdmin, semestre]);

  useEffect(() => {
    if (!semestresListos) return;
    void fetchData();
  }, [fetchData, semestresListos]);

  // Esc cierra el detalle desde cualquier foco
  useEffect(() => {
    if (sel == null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setSel(null);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [sel]);

  const docentes = data?.docentes ?? [];
  const meses = data?.meses ?? [];
  const hoy = data?.hoy ?? "";
  const calendario = useMemo(() => {
    const d = detalle.find((x) => x.codigo === semestre);
    return d ? { inicio: String(d.fecha_inicio).slice(0, 10), fin: String(d.fecha_fin).slice(0, 10) } : null;
  }, [detalle, semestre]);
  const esFuturo = useCallback((mes: string) => {
    const ini = inicioDeMes(mes, calendario);
    return !!hoy && !!ini && ini > hoy;
  }, [calendario, hoy]);

  /* ───── filtros de cliente ───── */
  const programas = useMemo(() => [...new Set(docentes.map((d) => d.programa).filter((p) => p && p !== "—"))].sort((a, b) => a.localeCompare(b)), [docentes]);
  const regionales = useMemo(() => [...new Set(docentes.map((d) => d.regional).filter((p) => p && p !== "—"))].sort((a, b) => a.localeCompare(b)), [docentes]);
  const coincideBase = useCallback((d: DocenteAvance) => {
    if (programa && d.programa !== programa) return false;
    if (regional && d.regional !== regional) return false;
    const q = buscar.trim().toLowerCase();
    if (q && !(d.nombre.toLowerCase().includes(q) || d.programa.toLowerCase().includes(q) || d.regional.toLowerCase().includes(q))) return false;
    return true;
  }, [programa, regional, buscar]);
  const conteoEstado = useMemo(() => {
    const base = docentes.filter(coincideBase);
    const c: Record<EstadoFiltro, number> = { todos: base.length, rojo: 0, amarillo: 0, verde: 0, sin_exigibles: 0, sin_grupo: 0 };
    for (const d of base) c[claveEstado(d)] += 1;
    return c;
  }, [docentes, coincideBase]);
  const filtrados = useMemo(() => docentes.filter((d) => coincideBase(d) && (estado === "todos" || claveEstado(d) === estado)), [docentes, coincideBase, estado]);
  const hayFiltros = programa !== "" || regional !== "" || estado !== "todos" || buscar.trim() !== "";
  const limpiar = () => { setPrograma(""); setRegional(""); setEstado("todos"); setBuscar(""); };

  const ordenados = useMemo(() => {
    const dir = orden.dir === "asc" ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      if (orden.clave === "nombre") return dir * a.nombre.localeCompare(b.nombre);
      const va = valorOrden(a, orden.clave);
      const vb = valorOrden(b, orden.clave);
      return va !== vb ? dir * (va - vb) : a.nombre.localeCompare(b.nombre);
    });
  }, [filtrados, orden]);
  const alternarOrden = (clave: string) => setOrden((o) => (o.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: "asc" }));

  /* ───── indicadores: totales del backend sin filtros; con filtros, misma definición sobre los docentes visibles ───── */
  const agg: AgregadoAvance | null = useMemo(() => {
    if (!data) return null;
    const mios = agregarAvance(hayFiltros ? filtrados : docentes, meses);
    if (hayFiltros) return mios;
    const t = data.totales;
    return {
      ...mios,
      docentes: t.docentes,
      promedio_global: t.promedio_global,
      promedio_aprobado: t.promedio_aprobado ?? mios.promedio_aprobado,
      promedio_esperado: t.promedio_esperado ?? mios.promedio_esperado,
      con_retraso: t.con_retraso ?? mios.con_retraso,
      pendientes_revision: t.pendientes_revision ?? mios.pendientes_revision,
      semaforo: t.semaforo ?? mios.semaforo,
      por_mes: t.por_mes ?? mios.por_mes,
    };
  }, [data, hayFiltros, filtrados, docentes, meses]);

  const seleccionado = docentes.find((d) => d.id === sel) ?? null;
  const sinGrupoN = filtrados.filter(sinGrupo).length;
  const conGrupoFiltrados = filtrados.filter((d) => !sinGrupo(d));
  const pie = useMemo(() => agregarAvance(conGrupoFiltrados, meses), [conGrupoFiltrados, meses]);

  /* ───── datos de los gráficos (siempre sobre los docentes visibles) ───── */
  const ranking = useMemo(
    () => conGrupoFiltrados.filter((d) => d.total_entregables > 0).sort((a, b) => a.brecha - b.brecha || a.nombre.localeCompare(b.nombre)).slice(0, 10),
    [conGrupoFiltrados]
  );
  const vencimientos = useMemo(
    () => filtrados.filter((d) => d.entregables_vencidos > 0).sort((a, b) => b.entregables_vencidos - a.entregables_vencidos || a.nombre.localeCompare(b.nombre)).slice(0, 8),
    [filtrados]
  );
  const sinReportar = agg ? Math.max(0, agg.total_entregables - agg.aprobados - agg.pendientes_revision - agg.observados) : 0;
  const categoriasMes: Categoria[] = useMemo(() => {
    if (!agg) return [];
    return meses.map((mes) => {
      const vals = filtrados.map((d) => mesDe(d, mes)).filter((m): m is AvanceMes => !!m && m.total > 0 && m.porcentaje_aprobado != null).map((m) => m.porcentaje_aprobado as number);
      const apr = vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      const rep = agg.por_mes.find((x) => x.mes === mes);
      const hayDato = filtrados.some((d) => (mesDe(d, mes)?.total ?? 0) > 0);
      return {
        id: mes,
        label: mes,
        futuro: esFuturo(mes),
        valores: [
          { s: "rep" as const, label: "Reportado (prom.)", valor: hayDato ? rep?.porcentaje ?? 0 : null },
          { s: "apr" as const, label: "Aprobado (prom.)", valor: hayDato ? apr ?? 0 : null },
        ],
      };
    });
  }, [agg, meses, filtrados, esFuturo]);

  /* ───── tabla ───── */
  const cols: Col<DocenteAvance>[] = useMemo(() => [
    {
      id: "docente", titulo: "Docente", ancho: "minmax(180px, 1.5fr)", orden: "nombre",
      celda: (d) => (<><span className="b2-tt" title={d.nombre}>{d.nombre}</span><span className="b2-sub">{d.programa}{d.regional && d.regional !== "—" ? ` · ${d.regional}` : ""}</span></>),
    },
    { id: "grupo", titulo: "Grupo", ancho: "minmax(120px, 1fr)", prioridad: 3, celda: (d) => <span className="b2-tt" title={d.grupo_nombre}>{sinGrupo(d) ? "—" : d.grupo_nombre}</span> },
    { id: "bala", titulo: "Reportado · aprobado · esperado", ancho: "minmax(120px, 1fr)", prioridad: 2, celda: (d) => (sinGrupo(d) ? <span className="b2-muted">Sin matriz</span> : <Bullet rep={d.avance_global} apr={d.avance_aprobado} esp={d.avance_esperado} nombre={d.nombre} />) },
    { id: "rep", titulo: "Reportado", ancho: "82px", num: true, orden: "global", celda: (d) => (sinGrupo(d) ? "—" : pct(d.avance_global)) },
    { id: "apr", titulo: "Aprobado", ancho: "78px", num: true, prioridad: 2, orden: "aprobado", celda: (d) => (sinGrupo(d) ? "—" : pct(d.avance_aprobado)) },
    { id: "esp", titulo: "Esperado", ancho: "78px", num: true, prioridad: 2, orden: "esperado", celda: (d) => (sinGrupo(d) ? "—" : pct(d.avance_esperado)) },
    { id: "cum", titulo: "Cumplim.", ancho: "82px", num: true, prioridad: 3, orden: "cumplimiento", celda: (d) => (sinGrupo(d) ? "—" : pct(d.cumplimiento_esperado)) },
    { id: "bre", titulo: "Brecha", ancho: "86px", num: true, orden: "brecha", celda: (d) => (sinGrupo(d) ? "—" : <span className={d.brecha < 0 ? "b2-neg b2-ana-av-neg" : undefined}>{pp(d.brecha)}</span>) },
    { id: "rev", titulo: "Por revisar", ancho: "74px", num: true, prioridad: 2, celda: (d) => n0(d.pendientes_revision) },
    { id: "ven", titulo: "Vencidos", ancho: "72px", num: true, orden: "vencidos", celda: (d) => <span className={d.entregables_vencidos > 0 ? "b2-neg b2-ana-av-neg" : undefined}>{n0(d.entregables_vencidos)}</span> },
    { id: "ult", titulo: "Último envío", ancho: "104px", prioridad: 3, celda: (d) => <span className="b2-fch">{fechaCorta(d.ultimo_reporte)}</span> },
    { id: "est", titulo: "Estado", ancho: "124px", celda: (d) => { const e = estadoDe(d); return <Estado kind={e.kind} label={e.label} />; } },
  ], []);

  const irPlantillas = (d: DocenteAvance) => {
    const g = grupos.find((x) => x.id === d.grupo_id);
    const sem = g?.semestre || semestre;
    navigate(`/admin/sistema?tab=plantillas${sem ? `&semestre=${encodeURIComponent(sem)}` : ""}&grupo=${d.grupo_id}`);
  };

  if (!isAdmin) {
    return (
      <AnaPagina titulo="Avance consolidado por docente" inspectorAbierto={false} inspectorEtiqueta="" onCerrarInspector={() => undefined}>
        <div className="b2-alert" role="alert"><span>Solo los administradores pueden ver el avance consolidado.</span></div>
      </AnaPagina>
    );
  }

  const cargandoInicial = (loading || !semestresListos) && !data;
  const vacioSemestre = !!data && docentes.length === 0;
  const brechaProm = agg ? round1((agg.promedio_aprobado ?? 0) - (agg.promedio_esperado ?? 0)) : 0;
  const semaforoSegs = agg ? [
    { s: "ven" as const, label: "Crítico", valor: agg.semaforo.rojo },
    { s: "obs" as const, label: "En riesgo", valor: agg.semaforo.amarillo },
    { s: "apr" as const, label: "En regla", valor: agg.semaforo.verde },
    { s: "sin" as const, label: "Sin vencimientos o sin matriz", valor: Math.max(0, agg.docentes - agg.semaforo.rojo - agg.semaforo.amarillo - agg.semaforo.verde) },
  ] : [];

  return (
    <AnaPagina
      titulo="Avance consolidado por docente"
      icono={<ISeguimiento width={20} height={20} />}
      subtitulo="Reportado = enviado o aprobado · Aprobado = revisado por el administrador · Esperado = con fecha límite hasta hoy."
      acciones={
        <button type="button" className="b2-btn" onClick={() => void fetchData(true)} disabled={loading}>
          <IRefrescar width={16} height={16} />{loading ? "Actualizando…" : "Actualizar"}
        </button>
      }
      inspector={seleccionado && (
        <div className="b2-insp-c">
          <p className="b2-insp-sup">{seleccionado.programa}{seleccionado.regional && seleccionado.regional !== "—" ? ` · ${seleccionado.regional}` : ""}</p>
          <h2 className="b2-insp-h">{seleccionado.nombre}</h2>
          <div className="b2-insp-estado">{(() => { const e = estadoDe(seleccionado); return <Estado kind={e.kind} label={e.label} />; })()}</div>
          <p className="b2-insp-p">{sinGrupo(seleccionado) ? "Sin grupo de matriz asignado." : `${seleccionado.grupo_nombre} · Docente ${seleccionado.tipo_docente === "NUEVO" ? "nuevo" : "antiguo"}`}</p>
          {!sinGrupo(seleccionado) && (
            <>
              <h3 className="b2-insp-sub">Avance</h3>
              <Bullet rep={seleccionado.avance_global} apr={seleccionado.avance_aprobado} esp={seleccionado.avance_esperado} nombre={seleccionado.nombre} />
              <div style={{ marginTop: 8 }}><Leyenda items={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }, { s: "esp", label: "Esperado a la fecha" }]} /></div>
              <h3 className="b2-insp-sub">Indicadores</h3>
              <Dl rows={[
                ["Reportado", pct(seleccionado.avance_global)],
                ["Aprobado", pct(seleccionado.avance_aprobado)],
                ["Esperado", pct(seleccionado.avance_esperado)],
                ["Cumplimiento", pct(seleccionado.cumplimiento_esperado)],
                ["Brecha", <span key="b" className={seleccionado.brecha < 0 ? "b2-neg b2-ana-av-neg" : undefined}>{pp(seleccionado.brecha)}{seleccionado.brecha_entregables != null ? ` · ${seleccionado.brecha_entregables > 0 ? "+" : seleccionado.brecha_entregables < 0 ? "−" : ""}${Math.abs(seleccionado.brecha_entregables)} entregables` : ""}</span>],
                ["Exigibles a la fecha", seleccionado.exigibles_a_fecha != null ? n0(seleccionado.exigibles_a_fecha) : "—"],
                ["Entregables", `${n0(seleccionado.total_entregables)} en total`],
                ["Reportados", n0(seleccionado.reportados)],
                ["Aprobados", n0(seleccionado.aprobados)],
                ["Por revisar", n0(seleccionado.pendientes_revision)],
                ["Observados", n0(seleccionado.observados)],
                ["Vencidos", <span key="v" className={seleccionado.entregables_vencidos > 0 ? "b2-neg b2-ana-av-neg" : undefined}>{n0(seleccionado.entregables_vencidos)}</span>],
                ["Último envío", fechaCorta(seleccionado.ultimo_reporte)],
              ]} />
              <h3 className="b2-insp-sub">Por mes</h3>
              <ul className="b2-adm-lista b2-ana-av-meses" aria-label="Avance por mes">
                {seleccionado.avance_por_mes.map((m) => (
                  <li key={m.mes}>
                    <span>
                      <span>{m.mes}{esFuturo(m.mes) && <> <Tag>futuro</Tag></>}</span>
                      <span className="b2-sub">{n0(m.reportados ?? m.completados)} de {n0(m.total)} reportados · {n0(m.aprobados ?? 0)} aprobados</span>
                    </span>
                    <span className="b2-ana-av-mv">{m.total > 0 ? `${pct(m.porcentaje)} rep.` : "—"}<small>{m.total > 0 ? `${pct(m.porcentaje_aprobado)} apr.` : ""}</small></span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="b2-insp-acc">
            <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/docentes/${seleccionado.id}/matriz`)}>Ver matriz</button>
            <button type="button" className="b2-btn" onClick={() => navigate("/admin/revision")}>Ir a la bandeja de revisión{seleccionado.pendientes_revision > 0 ? ` (${seleccionado.pendientes_revision} por revisar)` : ""}</button>
            {!sinGrupo(seleccionado) && <button type="button" className="b2-btn" onClick={() => irPlantillas(seleccionado)}>Ver su grupo en Plantillas</button>}
            <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
          </div>
        </div>
      )}
      inspectorAbierto={!!seleccionado}
      inspectorEtiqueta={String(sel)}
      onCerrarInspector={() => setSel(null)}
    >
      {error && <ErrorCarga onReintentar={() => void fetchData()}>{error}</ErrorCarga>}

      <Chips<EstadoFiltro>
        value={estado}
        onChange={setEstado}
        etiqueta="Filtrar por estado"
        items={[
          { id: "todos", label: "Todos", n: conteoEstado.todos },
          { id: "rojo", label: "Crítico", n: conteoEstado.rojo },
          { id: "amarillo", label: "En riesgo", n: conteoEstado.amarillo },
          { id: "verde", label: "En regla", n: conteoEstado.verde },
          { id: "sin_exigibles", label: "Sin vencimientos", n: conteoEstado.sin_exigibles },
          { id: "sin_grupo", label: "Sin grupo o sin matriz", n: conteoEstado.sin_grupo },
        ]}
      />
      <div className="b2-ana-av-f"><Barra contador={data ? (hayFiltros ? `${filtrados.length} de ${docentes.length} docentes` : `${docentes.length} docentes`) : undefined}>
        <Buscar value={buscar} onChange={setBuscar} placeholder="Buscar docente, programa o regional" etiqueta="Buscar docente" />
        <Filtro value={semestre || data?.alcance?.semestre || ""} onChange={(v) => { setSemestre(v); setGrupoId(""); setSel(null); }} etiqueta="Semestre" ancho={140}>
          {/* Un semestre a la vez: sin parámetro el backend usa el activo, así que no hay opción «Todos» (mezclaría periodos). */}
          {semestresList.map((s) => <option key={s} value={s}>{s}</option>)}
        </Filtro>
        <Filtro value={grupoId} onChange={(v) => { setGrupoId(v); setSel(null); }} etiqueta="Grupo" ancho={210}>
          <option value="">Todos los grupos</option>
          {grupos.map((g) => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
        </Filtro>
        <Filtro value={programa} onChange={setPrograma} etiqueta="Programa" ancho={190}>
          <option value="">Todos los programas</option>
          {programas.map((p) => <option key={p} value={p}>{p}</option>)}
        </Filtro>
        <Filtro value={regional} onChange={setRegional} etiqueta="Regional" ancho={150}>
          <option value="">Todas las regionales</option>
          {regionales.map((r) => <option key={r} value={r}>{r}</option>)}
        </Filtro>
        <Filtro value={orden.clave} onChange={(v) => setOrden({ clave: v, dir: "asc" })} etiqueta="Ordenar por" ancho={170}>
          {CLAVES_ORDEN.map((c) => <option key={c.id} value={c.id}>Ordenar: {c.label}</option>)}
          {meses.map((m) => <option key={m} value={m}>Ordenar: avance en {m}</option>)}
        </Filtro>
        <button type="button" className="b2-btn b2-btn-sm" onClick={() => setOrden((o) => ({ ...o, dir: o.dir === "asc" ? "desc" : "asc" }))} aria-label={`Invertir orden, ahora ${orden.dir === "asc" ? "ascendente" : "descendente"}`}>
          {orden.dir === "asc" ? "↑ Ascendente" : "↓ Descendente"}
        </button>
        {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar filtros</button>}
      </Barra></div>

      {cargandoInicial && <div className="b2-skel-w" role="status" aria-label="Cargando avance…">{[92, 70, 84, 60].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%`, height: 18 }} />)}</div>}

      {vacioSemestre && !error && (
        <div className="b2-fig" role="status">
          <div className="b2-adm-vacio-c">
            <strong>{grupoId ? "Este grupo no tiene docentes asignados" : semestre ? `El semestre ${semestre} no tiene docentes con grupo de matriz` : "No hay docentes para mostrar"}</strong>
            <p>El avance se calcula a partir de la matriz de cada docente. Asigna docentes a un grupo en Administración → Tareas semanales, o prueba con otro semestre o grupo.</p>
            <button type="button" className="b2-btn" onClick={() => navigate("/admin/sistema?tab=tareas")}>Ir a Tareas semanales</button>
          </div>
        </div>
      )}

      {agg && !vacioSemestre && (
        <>
          <section className="b2-ana-sec" aria-label="Indicadores del consolidado">
            {hayFiltros && <div><Tag tono="aviso">Indicadores (filtrado) · {filtrados.length} de {docentes.length} docentes</Tag></div>}
            {filtrados.length === 0 ? (
              <div className="b2-aviso-sem" role="status">Ningún docente coincide con los filtros. Prueba con otra búsqueda, otro estado o limpia los filtros.</div>
            ) : (
              <Indicadores items={[
                { k: "Docentes", v: n0(agg.docentes), sub: sinGrupoN > 0 ? `${sinGrupoN} sin grupo` : undefined },
                { k: "Reportado prom.", v: pct(agg.promedio_global), titulo: "Promedio del % reportado (enviado o aprobado) de todos los docentes" },
                { k: "Aprobado prom.", v: pct(agg.promedio_aprobado), titulo: "Promedio del % aprobado de los docentes con matriz" },
                { k: "Esperado a la fecha", v: pct(agg.promedio_esperado), titulo: "Promedio del % con fecha límite hasta hoy" },
                { k: "Aprobado − esperado", v: pp(brechaProm), alerta: brechaProm < 0, titulo: "Promedio aprobado menos promedio esperado, en puntos porcentuales" },
                { k: "Con retraso", v: n0(agg.con_retraso), sub: "docentes", alerta: agg.con_retraso > 0 },
                { k: "Por revisar", v: n0(agg.pendientes_revision) },
                { k: "Observados", v: n0(agg.observados) },
                { k: "Vencidos", v: n0(agg.vencidos), sub: "entregables", alerta: agg.vencidos > 0 },
                { k: "Riesgo crítico", v: n0(agg.semaforo.rojo), sub: "semáforo rojo", alerta: agg.semaforo.rojo > 0 },
              ]} />
            )}
          </section>

          {filtrados.length > 0 && (
            <section className="b2-ch-grid b2-ana-av-graf" aria-label="Gráficos de avance">
              <Figura
                pregunta="¿Quién está por debajo de lo esperado?"
                nota={<>Docentes con matriz, de mayor a menor brecha negativa (aprobado − esperado). Top {Math.min(10, ranking.length)} de {conGrupoFiltrados.length}; ver todos en la tabla.</>}
                leyenda={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }, { s: "esp", label: "Esperado a la fecha" }]}
                vacio={ranking.length === 0 ? "Ningún docente de la selección tiene matriz con entregables." : undefined}
                tabla={{ cabeceras: ["Docente", "Reportado", "Aprobado", "Esperado", "Brecha"], filas: ranking.map((d) => [d.nombre, pct(d.avance_global), pct(d.avance_aprobado), pct(d.avance_esperado), pp(d.brecha)]) }}
              >
                <FilasBala
                  etiqueta="Avance por docente"
                  seleccionada={sel}
                  onAbrir={(id) => setSel(Number(id))}
                  filas={ranking.map((d) => ({ id: d.id, etiqueta: d.nombre, sub: d.programa, rep: d.avance_global, apr: d.avance_aprobado, esp: d.avance_esperado, alerta: d.brecha < 0 ? `Brecha ${pp(d.brecha)}` : undefined, extra: d.entregables_vencidos > 0 ? `${n0(d.entregables_vencidos)} vencidos` : undefined }))}
                />
              </Figura>

              <div className="b2-ch-col">
                <Figura
                  pregunta="¿En qué estado están los entregables?"
                  nota="Suma de los docentes visibles. «Sin reportar» incluye también lo que aún no es exigible."
                  tabla={{ cabeceras: ["Estado", "Entregables"], filas: [["Aprobados", n0(agg.aprobados)], ["Por revisar", n0(agg.pendientes_revision)], ["Observados", n0(agg.observados)], ["Sin reportar", n0(sinReportar)]] }}
                >
                  <ApiladaH
                    etiqueta="Estado de los entregables"
                    total={agg.total_entregables}
                    segmentos={[
                      { s: "apr", label: "Aprobados", valor: agg.aprobados },
                      { s: "pen", label: "Por revisar", valor: agg.pendientes_revision },
                      { s: "obs", label: "Observados", valor: agg.observados },
                      { s: "sin", label: "Sin reportar", valor: sinReportar },
                    ]}
                  />
                </Figura>
                <Figura
                  pregunta="¿Cuántos docentes están en riesgo?"
                  nota="Semáforo del backend; «sin vencimientos o sin matriz» no es incumplimiento."
                  tabla={{ cabeceras: ["Semáforo", "Docentes"], filas: semaforoSegs.map((s) => [s.label, n0(s.valor)]) }}
                >
                  <ApiladaH etiqueta="Docentes por semáforo" total={agg.docentes} segmentos={semaforoSegs} />
                </Figura>
              </div>

              <Figura
                pregunta="¿Cómo avanza cada mes?"
                nota="Promedio simple entre los docentes con entregables ese mes. Los meses futuros se atenúan: aún no son exigibles."
                leyenda={[{ s: "rep", label: "Reportado (prom.)" }, { s: "apr", label: "Aprobado (prom.)" }]}
                vacio={categoriasMes.length === 0 ? "Este semestre no tiene meses con entregables." : undefined}
                tabla={{ cabeceras: ["Mes", "Reportado", "Aprobado"], filas: categoriasMes.map((c) => [c.label + (c.futuro ? " (futuro)" : ""), c.valores[0].valor == null ? "—" : pct(c.valores[0].valor), c.valores[1].valor == null ? "—" : pct(c.valores[1].valor)]) }}
              >
                <ColumnasAgrupadas etiqueta="Avance promedio por mes" categorias={categoriasMes} />
              </Figura>

              <Figura
                pregunta="¿Dónde se concentran los vencimientos?"
                nota="Entregables vencidos por docente (top 8). Un vencido es un entregable con fecha límite pasada sin reportar."
                leyenda={[{ s: "ven", label: "Vencidos" }]}
                vacio={vencimientos.length === 0 ? "Ningún docente de la selección tiene entregables vencidos." : undefined}
                tabla={{ cabeceras: ["Docente", "Vencidos", "Entregables"], filas: vencimientos.map((d) => [d.nombre, n0(d.entregables_vencidos), n0(d.total_entregables)]) }}
              >
                <FilasApiladas
                  etiqueta="Vencidos por docente"
                  onAbrir={(id) => setSel(Number(id))}
                  filas={vencimientos.map((d) => ({ id: d.id, etiqueta: d.nombre, sub: d.programa, segmentos: [{ s: "ven" as const, label: "Vencidos", valor: d.entregables_vencidos }], extra: `de ${n0(d.total_entregables)}` }))}
                />
              </Figura>
            </section>
          )}

          <section className="b2-ana-sec" aria-label="Avance por docente">
            <h2>Avance por docente</h2>
            <DataTable<DocenteAvance>
              etiqueta="Avance por docente"
              cols={cols}
              rows={ordenados}
              getKey={(d) => d.id}
              selId={sel}
              onSelect={(d) => setSel(d ? d.id : null)}
              cargando={loading && !data}
              orden={orden}
              onOrden={alternarOrden}
              vacio={
                <div className="b2-adm-vacio-c">
                  <strong>Ningún docente coincide</strong>
                  <p>Prueba con otro semestre, otro grupo o una búsqueda distinta.</p>
                  {hayFiltros && <button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button>}
                </div>
              }
              filaMovil={(d) => {
                const e = estadoDe(d);
                return {
                  titulo: d.nombre,
                  lineas: [
                    `${d.programa}${d.regional && d.regional !== "—" ? ` · ${d.regional}` : ""}`,
                    sinGrupo(d) ? "Sin matriz" : <Bullet key="b" rep={d.avance_global} apr={d.avance_aprobado} esp={d.avance_esperado} nombre={d.nombre} />,
                    sinGrupo(d) ? "" : `Brecha ${pp(d.brecha)} · ${n0(d.entregables_vencidos)} vencidos`,
                  ].filter((l) => l !== ""),
                  lado: <Estado kind={e.kind} label={e.label} />,
                };
              }}
            />
            {conGrupoFiltrados.length > 0 && (
              <p className="b2-ana-av-pie" aria-label="Promedios de los docentes filtrados">
                <b>Promedios{hayFiltros ? " (filtrados)" : ""}:</b> reportado {pct(pie.promedio_global)}
                {meses.map((m) => <span key={m}> · {m} {pie.por_mes.find((x) => x.mes === m && conGrupoFiltrados.some((d) => (mesDe(d, m)?.total ?? 0) > 0)) ? pct(pie.por_mes.find((x) => x.mes === m)?.porcentaje) : "—"}</span>)}
              </p>
            )}
          </section>
        </>
      )}
    </AnaPagina>
  );
}
