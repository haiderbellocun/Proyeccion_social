// Seguimiento operativo (ruta /admin/avance): qué hace cada docente, en qué iniciativas, qué debe entregar, qué está atrasado y cuánto avanzó.
// Lee GET /admin/seguimiento (tarjetas, tabla, gráficos y opciones de filtro) y GET /admin/seguimiento/docentes/:id (detalle). Todas las cifras
// salen del servidor con las fórmulas oficiales (calcularMetricas); aquí no se recalcula ningún porcentaje.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AnaPagina, ApiladaH, ColumnasAgrupadas, Figura, FilasBala, Indicadores, Leyenda, n0, pct, type Categoria } from "../components/b2/charts-b2";
import { Barra, Buscar, Chips, DataTable, ErrorCarga, Filtro, Tag, fechaCorta, type Col } from "../components/b2/admin-ui";
import { Bullet } from "../components/b2/Bullet";
import { IRefrescar, ISeguimiento } from "../components/b2/icons";
import { Dl, Estado, type Kind } from "../components/b2/ui";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";
import { semaforoConfig, type Semaforo } from "../data/matrizConstants";
import "../components/b2/b2-ana-avance.css";
import "../components/b2/b2-seguimiento.css";

/* ───────── tipos (respuesta de GET /admin/seguimiento) ───────── */
type Pct = number | null;
interface MetricasSemestre {
  total: number; reportados: number; aprobados: number; enviados_pendientes_revision: number; observados: number; borradores: number; no_iniciados: number;
  vencidos: number; exigibles: number; pct_reportado: Pct; pct_aprobado: Pct; pct_esperado: Pct; brecha: number; brecha_pct: Pct;
  horas_programadas: number; horas_reportadas: number; horas_aprobadas: number; semaforo: Semaforo;
}
interface FilaDocente {
  id: number; nombre: string; programa_id: number | null; programa: string; escuela: string | null; regional: string | null; grupo_id: number | null; grupo_nombre: string | null;
  tipo_docente: "ANTIGUO" | "NUEVO"; estado_usuario: string; iniciativas: { id: number; titulo: string; tipo: string }[];
  periodo: { programados: number; reportados: number; aprobados: number; pendientes: number; vencidos: number; observados: number; por_revisar: number; pct_reportado: Pct; pct_aprobado: Pct; enviados_fuera_del_periodo: number };
  semestre: MetricasSemestre;
  proxima_accion: { plantilla_id: number; entregable_id: number | null; entregable: string; semana: number; fecha_fin: string; vencido: boolean; estado: string; iniciativa_titulo: string | null } | null;
  ultimo_envio: string | null;
}
interface Periodo { tipo: "semana" | "mes" | "semana_mes" | "semestre"; semana: number | null; mes: string | null; desde: string | null; hasta: string | null; etiqueta: string; origen: string }
interface Payload {
  semestre: { codigo: string | null; activo: boolean; calendario: { fecha_inicio: string; fecha_fin: string; num_semanas: number } | null };
  hoy: string; periodo: Periodo; definiciones: Record<string, string>;
  semana_actual: { numero: number | null; estado: string };
  tarjetas: {
    docentes: number; docentes_visibles_en_tabla: number; docentes_con_pendientes: number;
    periodo: { etiqueta: string; programados: number; reportados: number; aprobados: number; pendientes: number; vencidos: number; pct_reportado: Pct; pct_aprobado: Pct; sin_programados: boolean; enviados_fuera_del_periodo: number };
    semestre: { programados: number; reportados: number; aprobados: number; pct_reportado: Pct; pct_aprobado: Pct; pct_esperado: Pct; brecha_pct: Pct; brecha: number; exigibles: number };
    vencidos: number; enviados_pendientes_revision: number; observados: number; programados_semana_actual: number | null; semana_actual: number | null;
  };
  graficos: {
    evolucion_semanal: { semana: number; mes: string | null; programados: number; reportados: number; aprobados: number; pct_reportado: Pct; pct_aprobado: Pct }[];
    por_grupo: { id: number; nombre: string; docentes: number; total: number; reportados: number; aprobados: number; pct_reportado: Pct; pct_aprobado: Pct; pct_esperado: Pct; brecha_pct: Pct; vencidos: number; seleccionado: boolean }[];
    estado_entregables: { total: number; no_iniciados: number; borradores: number; enviados: number; observados: number; aprobados: number; de_los_cuales_vencidos: number };
  };
  docentes: FilaDocente[];
  opciones: {
    semanas: { numero: number; desde: string; hasta: string; actual: boolean; programados: number; mes: string | null }[];
    meses: string[]; grupos: { id: number; nombre: string }[]; programas: { id: number; nombre: string }[]; escuelas: { id: number; nombre: string }[];
    iniciativas: { id: number; titulo: string; tipo: string }[]; tipos_iniciativa: string[]; docentes: { id: number; nombre: string }[];
  };
  docentes_sin_grupo: number; avisos: string[];
  alcance?: { advertencias?: string[] };
}
interface Entregable {
  plantilla_id: number; entregable_id: number | null; entregable: string; mes: string; semana: number; fecha_fin: string | null;
  estado: "no_iniciado" | "borrador" | "enviado" | "observado" | "aprobado"; vencido: boolean; requiere_correccion: boolean; comentario_revision: string | null;
  iniciativa: { id: number; titulo: string; tipo: string; relacion: "demostrada" | "sugerida_por_nombre" | "ninguna" } | null; evidencias: string[]; requiere_evidencia: boolean; en_periodo: boolean;
}
interface Detalle {
  docente: { id: number; nombre: string; correo: string; estado_usuario: string; programa: string | null; escuela: string | null; regional: string | null; grupo_id: number | null; grupo_nombre: string | null; tipo_docente: string };
  semestre: { codigo: string | null }; sin_matriz: boolean; motivo_sin_matriz: string | null; periodo: Periodo;
  general: MetricasSemestre;
  periodo_detalle: { programados: number; reportados: number; aprobados: number; pendientes: number; vencidos: number; observados: number; por_revisar: number; pct_reportado: Pct; pct_aprobado: Pct; sin_programados: boolean; enviados_fuera_del_periodo: { entregable: string; semana_programada: number; fecha_primer_envio: string; estado: string }[] };
  iniciativas: { id: number; titulo: string; tipo: string; rol: "responsable" | "colaborador"; entregables_vinculados: number; reportados: number; aprobados: number; observados: number; pendientes_revision: number; pendientes: number; vencidos: number; aprobados_de_vinculados_pct: Pct }[];
  sin_iniciativa_demostrable: { titulo: string; nota: string; total: number; reportados: number; aprobados: number; sugeridos_por_nombre: number };
  entregables: Entregable[];
}

type Orden = { clave: string; dir: "asc" | "desc" };
type EstadoFiltro = "todos" | "pendiente" | "vencido" | "enviado" | "observado" | "borrador" | "no_iniciado" | "aprobado";

/* ───────── utilidades de presentación ───────── */
const KIND_SEMAFORO: Record<Semaforo, Kind> = { verde: "aprobado", amarillo: "observado", rojo: "vencido", sin_exigibles: "porhacer", sin_datos: "porhacer" };
const KIND_ESTADO: Record<Entregable["estado"], { kind: Kind; label: string }> = {
  aprobado: { kind: "aprobado", label: "Aprobado" }, enviado: { kind: "revision", label: "En revisión" }, observado: { kind: "observado", label: "Observado" },
  borrador: { kind: "borrador", label: "Borrador" }, no_iniciado: { kind: "porhacer", label: "Sin iniciar" },
};
const pp = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: 1 })} pp`);
const sinMatriz = (d: FilaDocente) => d.semestre.total === 0;
const estadoDe = (d: FilaDocente): { kind: Kind; label: string } =>
  sinMatriz(d) ? { kind: "porhacer", label: d.grupo_id == null ? "Sin grupo" : "Sin entregables" } : { kind: KIND_SEMAFORO[d.semestre.semaforo] ?? "porhacer", label: (semaforoConfig[d.semestre.semaforo] ?? semaforoConfig.sin_datos).label };
const TIPO_INICIATIVA: Record<string, string> = { proyecto: "Proyecto", actividad: "Actividad", convenio: "Convenio", capacitacion: "Capacitación" };
const fecha = (iso: string | null | undefined) => (iso ? fechaCorta(String(iso).slice(0, 10)) : "—");
const rango = (a: string, b: string) => `${fecha(a)} – ${fecha(b)}`;
const soloNum = (v: number | null | undefined) => (v == null ? "—" : n0(v));

function valorOrden(d: FilaDocente, clave: string): number {
  switch (clave) {
    case "vencidos": return d.semestre.vencidos;
    case "pendientes": return d.periodo.pendientes;
    case "programados": return d.periodo.programados;
    case "sem_rep": return d.periodo.pct_reportado ?? -1;
    case "sem_apr": return d.periodo.pct_aprobado ?? -1;
    case "global": return d.semestre.pct_reportado ?? -1;
    case "aprobado": return d.semestre.pct_aprobado ?? -1;
    case "brecha": return d.semestre.brecha_pct ?? 0;
    default: return 0;
  }
}
const ORDENES: { id: string; label: string }[] = [
  { id: "vencidos", label: "Vencidos" }, { id: "pendientes", label: "Pendientes del periodo" }, { id: "brecha", label: "Brecha" },
  { id: "sem_rep", label: "Reportado del periodo" }, { id: "global", label: "Reportado del semestre" }, { id: "aprobado", label: "Aprobado del semestre" }, { id: "nombre", label: "Docente" },
];
const ESTADOS: { id: EstadoFiltro; label: string }[] = [
  { id: "todos", label: "Todos" }, { id: "pendiente", label: "Con acción pendiente" }, { id: "vencido", label: "Vencidos" }, { id: "enviado", label: "En revisión" },
  { id: "observado", label: "Observados" }, { id: "borrador", label: "Borradores" }, { id: "no_iniciado", label: "Sin iniciar" }, { id: "aprobado", label: "Aprobados" },
];
const GRUPOS_DETALLE: { id: string; titulo: string; ver: (e: Entregable) => boolean; abierto: boolean }[] = [
  { id: "vencidos", titulo: "Vencidos", ver: (e) => e.vencido, abierto: true },
  { id: "observados", titulo: "Observados (requieren corrección)", ver: (e) => !e.vencido && e.estado === "observado", abierto: true },
  { id: "borradores", titulo: "Borradores", ver: (e) => !e.vencido && e.estado === "borrador", abierto: true },
  { id: "sin_iniciar", titulo: "Pendientes de iniciar", ver: (e) => !e.vencido && e.estado === "no_iniciado", abierto: false },
  { id: "revision", titulo: "Enviados a revisión", ver: (e) => e.estado === "enviado", abierto: true },
  { id: "aprobados", titulo: "Aprobados", ver: (e) => e.estado === "aprobado", abierto: false },
];

const entero = (v: string | null) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? v : "");

export default function AvanceConsolidado() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isAdmin = user?.rol === "admin";
  const [params, setParams] = useSearchParams();

  const [semestre, setSemestre] = useState(() => params.get("semestre") ?? "");
  const [semana, setSemana] = useState(() => (params.get("periodo") === "semestre" ? "semestre" : entero(params.get("semana"))));
  const [mes, setMes] = useState(() => params.get("mes") ?? "");
  const [grupoId, setGrupoId] = useState(() => entero(params.get("grupo") ?? params.get("grupo_id")));
  const [docenteId, setDocenteId] = useState(() => entero(params.get("docente")));
  const [programaId, setProgramaId] = useState(() => entero(params.get("programa")));
  const [escuelaId, setEscuelaId] = useState(() => entero(params.get("escuela")));
  const [iniciativa, setIniciativa] = useState(() => params.get("iniciativa") ?? "");
  const [estado, setEstado] = useState<EstadoFiltro>(() => (ESTADOS.some((e) => e.id === params.get("estado")) ? (params.get("estado") as EstadoFiltro) : "todos"));
  const [buscar, setBuscar] = useState("");
  const [orden, setOrden] = useState<Orden>({ clave: "vencidos", dir: "desc" });
  const [sel, setSel] = useState<number | null>(() => (entero(params.get("detalle")) ? Number(params.get("detalle")) : null));
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [semestresListos, setSemestresListos] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  // Las opciones de los filtros se conservan mientras llega una respuesta nueva: si desaparecieran, el selector perdería su valor a mitad de un cambio.
  const [opcPrev, setOpcPrev] = useState<Payload["opciones"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const solicitud = useRef(0);
  const solicitudDetalle = useRef(0);
  const abortar = useRef<AbortController | null>(null);

  /** Parámetros comunes de ambas consultas (el detalle usa el mismo semestre y periodo que la vista). */
  const qsPeriodo = useCallback(() => {
    const q = new URLSearchParams();
    if (semestre.trim()) q.set("semestre", semestre.trim());
    if (semana === "semestre") q.set("periodo", "semestre");
    else if (semana) q.set("semana", semana);
    if (mes) q.set("mes", mes);
    return q;
  }, [semestre, semana, mes]);

  /* ───── carga: solo cuenta la última solicitud (las respuestas tardías de filtros anteriores se descartan) ───── */
  const fetchData = useCallback(async (mantener = false) => {
    if (!isAdmin) return;
    const mia = ++solicitud.current;
    abortar.current?.abort();
    const ctl = new AbortController();
    abortar.current = ctl;
    setLoading(true);
    setError(null);
    if (!mantener) setData(null);
    try {
      const q = qsPeriodo();
      if (grupoId) q.set("grupo_id", grupoId);
      if (docenteId) q.set("docente_id", docenteId);
      if (programaId) q.set("programa_id", programaId);
      if (escuelaId) q.set("escuela_id", escuelaId);
      if (iniciativa.startsWith("i:")) q.set("iniciativa_id", iniciativa.slice(2));
      if (iniciativa.startsWith("t:")) q.set("tipo_iniciativa", iniciativa.slice(2));
      if (estado !== "todos") q.set("estado", estado);
      const res = await fetch(`${API_BASE}/admin/seguimiento?${q.toString()}`, { signal: ctl.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      if (mia !== solicitud.current) return;
      setData(json as Payload);
      setOpcPrev((json as Payload).opciones);
    } catch (e) {
      if (mia !== solicitud.current || (e as Error)?.name === "AbortError") return;
      console.error(e);
      const msg = e instanceof Error && e.message ? e.message : "No se pudo cargar el seguimiento.";
      notify.error("No se pudo cargar el seguimiento. Intenta de nuevo.");
      setError(msg);
      setData(null);
    } finally {
      if (mia === solicitud.current) setLoading(false);
    }
  }, [isAdmin, qsPeriodo, grupoId, docenteId, programaId, escuelaId, iniciativa, estado]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/semestres`);
        const j = await r.json();
        const s: string[] = j.semestres || [];
        const activeCode = String(j.activo?.codigo || "");
        setSemestresList(s);
        if (s.length) setSemestre((prev) => (prev && s.includes(prev) ? prev : activeCode && s.includes(activeCode) ? activeCode : s[0]));
      } catch {
        setSemestresList([]);
      } finally {
        setSemestresListos(true);
      }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!semestresListos) return;
    void fetchData();
  }, [fetchData, semestresListos]);

  // Los filtros quedan en la URL (se pueden compartir y recargar)
  useEffect(() => {
    if (!semestresListos) return;
    const q = new URLSearchParams();
    const poner = (k: string, v: string) => { if (v) q.set(k, v); };
    poner("semestre", semestre);
    if (semana === "semestre") q.set("periodo", "semestre"); else poner("semana", semana);
    poner("mes", mes); poner("grupo", grupoId); poner("docente", docenteId); poner("programa", programaId); poner("escuela", escuelaId);
    poner("iniciativa", iniciativa); if (estado !== "todos") q.set("estado", estado); if (sel != null) q.set("detalle", String(sel));
    setParams(q, { replace: true });
  }, [semestre, semana, mes, grupoId, docenteId, programaId, escuelaId, iniciativa, estado, sel, semestresListos, setParams]);

  // Detalle del docente seleccionado (con su propia protección contra respuestas tardías)
  useEffect(() => {
    if (!isAdmin || sel == null || !semestresListos) { setDetalle(null); return; }
    const mia = ++solicitudDetalle.current;
    setCargandoDetalle(true);
    setErrorDetalle(null);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/seguimiento/docentes/${sel}?${qsPeriodo().toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo cargar el detalle");
        if (mia === solicitudDetalle.current) setDetalle(json as Detalle);
      } catch (e) {
        if (mia === solicitudDetalle.current) { setDetalle(null); setErrorDetalle(e instanceof Error ? e.message : "No se pudo cargar el detalle"); }
      } finally {
        if (mia === solicitudDetalle.current) setCargandoDetalle(false);
      }
    })();
  }, [isAdmin, sel, qsPeriodo, semestresListos]);

  useEffect(() => {
    if (sel == null) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) setSel(null); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [sel]);

  const docentes = data?.docentes ?? [];
  const opc = data?.opciones ?? opcPrev ?? undefined;
  const t = data?.tarjetas;
  const periodo = data?.periodo;

  /* ───── búsqueda y orden (la tabla; los filtros de servidor ya decidieron la población) ───── */
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const visibles = useMemo(() => {
    const q = norm(buscar.trim());
    if (!q) return docentes;
    return docentes.filter((d) => norm(`${d.nombre} ${d.programa} ${d.grupo_nombre ?? ""} ${d.escuela ?? ""} ${d.iniciativas.map((i) => i.titulo).join(" ")}`).includes(q));
  }, [docentes, buscar]);
  const ordenados = useMemo(() => {
    const dir = orden.dir === "asc" ? 1 : -1;
    return [...visibles].sort((a, b) => {
      if (orden.clave === "nombre") return dir * a.nombre.localeCompare(b.nombre);
      const va = valorOrden(a, orden.clave);
      const vb = valorOrden(b, orden.clave);
      return va !== vb ? dir * (va - vb) : a.nombre.localeCompare(b.nombre);
    });
  }, [visibles, orden]);
  const alternarOrden = (clave: string) => setOrden((o) => (o.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: clave === "nombre" ? "asc" : "desc" }));
  const hayFiltros = !!(grupoId || docenteId || programaId || escuelaId || iniciativa || mes || semana || estado !== "todos" || buscar.trim());
  const limpiar = () => { setGrupoId(""); setDocenteId(""); setProgramaId(""); setEscuelaId(""); setIniciativa(""); setMes(""); setSemana(""); setEstado("todos"); setBuscar(""); };
  const cambiaSemestre = (v: string) => { setOpcPrev(null); setSemestre(v); setGrupoId(""); setDocenteId(""); setProgramaId(""); setEscuelaId(""); setIniciativa(""); setMes(""); setSemana(""); setSel(null); };

  /* ───── tabla ───── */
  const cols: Col<FilaDocente>[] = useMemo(() => [
    {
      id: "docente", titulo: "Docente", ancho: "minmax(150px, 1.4fr)", orden: "nombre",
      celda: (d) => (<><span className="b2-tt" title={d.nombre}>{d.nombre}{d.estado_usuario !== "activo" && <> <Tag>inactivo</Tag></>}</span><span className="b2-sub">{d.programa}{d.escuela ? ` · ${d.escuela}` : ""}</span></>),
    },
    { id: "grupo", titulo: "Grupo", ancho: "minmax(96px, 1fr)", prioridad: 3, celda: (d) => <span className="b2-tt" title={d.grupo_nombre ?? ""}>{d.grupo_nombre ?? "—"}</span> },
    {
      id: "ini", titulo: "Iniciativas", ancho: "minmax(104px, 1fr)", prioridad: 3,
      celda: (d) => (d.iniciativas.length === 0 ? <span className="b2-muted">Sin iniciativas</span> : (<><span className="b2-tt" title={d.iniciativas.map((i) => `${TIPO_INICIATIVA[i.tipo] ?? i.tipo}: ${i.titulo}`).join("\n")}>{d.iniciativas[0].titulo}</span><span className="b2-sub">{d.iniciativas.length > 1 ? `+${d.iniciativas.length - 1} más` : TIPO_INICIATIVA[d.iniciativas[0].tipo] ?? d.iniciativas[0].tipo}</span></>)),
    },
    { id: "prog", titulo: "Prog.", ancho: "52px", num: true, orden: "programados", celda: (d) => n0(d.periodo.programados) },
    { id: "rep", titulo: "Rep.", ancho: "46px", num: true, prioridad: 2, celda: (d) => n0(d.periodo.reportados) },
    { id: "apr", titulo: "Aprob.", ancho: "54px", num: true, prioridad: 2, celda: (d) => n0(d.periodo.aprobados) },
    { id: "pen", titulo: "Pend.", ancho: "50px", num: true, orden: "pendientes", celda: (d) => n0(d.periodo.pendientes) },
    { id: "ven", titulo: "Venc.", ancho: "50px", num: true, orden: "vencidos", celda: (d) => <span className={d.semestre.vencidos > 0 ? "b2-neg b2-ana-av-neg" : undefined}>{n0(d.semestre.vencidos)}</span> },
    { id: "semp", titulo: "Periodo", ancho: "64px", num: true, prioridad: 2, orden: "sem_rep", celda: (d) => (d.periodo.programados === 0 ? <span className="b2-muted" title="Sin entregables programados en el periodo">—</span> : <span title={`Aprobado ${pct(d.periodo.pct_aprobado)}`}>{pct(d.periodo.pct_reportado)}</span>) },
    { id: "bala", titulo: "Semestre", ancho: "minmax(104px, 1fr)", prioridad: 2, orden: "global", celda: (d) => (sinMatriz(d) ? <span className="b2-muted">Sin entregables</span> : <Bullet rep={d.semestre.pct_reportado} apr={d.semestre.pct_aprobado} esp={d.semestre.pct_esperado} nombre={d.nombre} />) },
    {
      id: "prox", titulo: "Próxima acción", ancho: "minmax(124px, 1.1fr)", prioridad: 3,
      celda: (d) => (d.proxima_accion ? (<><span className="b2-tt" title={d.proxima_accion.entregable}>{d.proxima_accion.entregable}</span><span className={`b2-sub${d.proxima_accion.vencido ? " b2-neg" : ""}`}>{d.proxima_accion.vencido ? "Vencido · " : "Límite "}{fecha(d.proxima_accion.fecha_fin)} · S{d.proxima_accion.semana}</span></>) : <span className="b2-muted">—</span>),
    },
    { id: "est", titulo: "Estado", ancho: "112px", celda: (d) => { const e = estadoDe(d); return <Estado kind={e.kind} label={e.label} />; } },
  ], []);

  if (!isAdmin) {
    return (
      <AnaPagina titulo="Seguimiento operativo" inspectorAbierto={false} inspectorEtiqueta="" onCerrarInspector={() => undefined}>
        <div className="b2-alert" role="alert"><span>Solo los administradores pueden ver el seguimiento operativo.</span></div>
      </AnaPagina>
    );
  }

  const cargandoInicial = (loading || !semestresListos) && !data;
  const vacio = !!data && data.tarjetas.docentes === 0;
  const eg = data?.graficos.estado_entregables;
  const semanaActual = data?.semana_actual?.numero ?? null;
  const categoriasSemana: Categoria[] = (data?.graficos.evolucion_semanal ?? []).map((s) => ({
    id: String(s.semana), label: `S${s.semana}`, sub: undefined, futuro: semanaActual != null ? s.semana > semanaActual : false,
    valores: [
      { s: "rep" as const, label: "Reportado", valor: s.programados > 0 ? s.pct_reportado : null },
      { s: "apr" as const, label: "Aprobado", valor: s.programados > 0 ? s.pct_aprobado : null },
    ],
  }));
  const gruposConDatos = (data?.graficos.por_grupo ?? []).filter((g) => g.total > 0);
  const gruposSinDatos = (data?.graficos.por_grupo ?? []).filter((g) => g.total === 0);
  const semanasOpc = opc?.semanas ?? [];
  const enSemana = periodo?.tipo === "semana" || periodo?.tipo === "semana_mes";

  const irMatriz = (id: number) => navigate(`/admin/docentes/${id}/matriz`);
  const tarjetaPct = (p: Pct, prog: number, rep: number, etiqueta: string) => (prog === 0 ? { v: <span className="b2-seg-sin">Sin entregables programados</span>, sub: undefined as string | undefined } : { v: pct(p), sub: `${n0(rep)} de ${n0(prog)} ${etiqueta}` });

  const detallePanel = (() => {
    if (sel == null) return null;
    const base = docentes.find((d) => d.id === sel) ?? null;
    const dd = detalle;
    const nombre = dd?.docente.nombre ?? base?.nombre ?? "Docente";
    return (
      <div className="b2-insp-c b2-seg-det">
        <p className="b2-insp-sup">{dd?.docente.programa ?? base?.programa ?? ""}{(dd?.docente.escuela ?? base?.escuela) ? ` · ${dd?.docente.escuela ?? base?.escuela}` : ""}</p>
        <h2 className="b2-insp-h">{nombre}</h2>
        {base && <div className="b2-insp-estado">{(() => { const e = estadoDe(base); return <Estado kind={e.kind} label={e.label} />; })()}</div>}
        {cargandoDetalle && !dd && <div className="b2-skel-w" role="status" aria-label="Cargando detalle…">{[88, 64, 76].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%`, height: 16 }} />)}</div>}
        {errorDetalle && <ErrorCarga onReintentar={() => setSel((s) => s)}>{errorDetalle}</ErrorCarga>}
        {dd && (
          <>
            <p className="b2-insp-p">{dd.docente.grupo_nombre ? `${dd.docente.grupo_nombre} · Docente ${dd.docente.tipo_docente === "NUEVO" ? "nuevo" : "antiguo"}` : "Sin grupo de matriz asignado."}{dd.docente.estado_usuario !== "activo" ? " · Usuario inactivo" : ""}</p>
            {dd.sin_matriz ? (
              <div className="b2-aviso-sem" role="status">{dd.motivo_sin_matriz ?? "Sin entregables en este semestre."}</div>
            ) : (
              <>
                <h3 className="b2-insp-sub">Semestre {dd.semestre.codigo}</h3>
                <Bullet rep={dd.general.pct_reportado} apr={dd.general.pct_aprobado} esp={dd.general.pct_esperado} nombre={dd.docente.nombre} />
                <div style={{ marginTop: 8 }}><Leyenda items={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }, { s: "esp", label: "Esperado a la fecha" }]} /></div>
                <Dl rows={[
                  ["Reportado", `${pct(dd.general.pct_reportado)} · ${n0(dd.general.reportados)} de ${n0(dd.general.total)}`],
                  ["Aprobado", `${pct(dd.general.pct_aprobado)} · ${n0(dd.general.aprobados)} de ${n0(dd.general.total)}`],
                  ["Esperado", `${pct(dd.general.pct_esperado)} · ${n0(dd.general.exigibles)} con límite hasta hoy`],
                  ["Brecha", <span key="b" className={(dd.general.brecha_pct ?? 0) < 0 ? "b2-neg b2-ana-av-neg" : undefined}>{pp(dd.general.brecha_pct)} · {dd.general.brecha > 0 ? "+" : dd.general.brecha < 0 ? "−" : ""}{Math.abs(dd.general.brecha)} entregables</span>],
                  ["Por revisar", n0(dd.general.enviados_pendientes_revision)],
                  ["Observados", n0(dd.general.observados)],
                  ["Vencidos", <span key="v" className={dd.general.vencidos > 0 ? "b2-neg b2-ana-av-neg" : undefined}>{n0(dd.general.vencidos)}</span>],
                  ["Horas (prog. · rep.)", `${n0(dd.general.horas_programadas)} · ${n0(dd.general.horas_reportadas)}`],
                ]} />

                <h3 className="b2-insp-sub">{dd.periodo.etiqueta}</h3>
                {dd.periodo_detalle.sin_programados ? (
                  <p className="b2-seg-sin">Sin entregables programados en este periodo.</p>
                ) : (
                  <Dl rows={[
                    ["Programados", n0(dd.periodo_detalle.programados)],
                    ["Reportados", `${n0(dd.periodo_detalle.reportados)} · ${pct(dd.periodo_detalle.pct_reportado)}`],
                    ["Aprobados", `${n0(dd.periodo_detalle.aprobados)} · ${pct(dd.periodo_detalle.pct_aprobado)}`],
                    ["Pendientes", n0(dd.periodo_detalle.pendientes)],
                    ["Vencidos", n0(dd.periodo_detalle.vencidos)],
                  ]} />
                )}
                {dd.periodo_detalle.enviados_fuera_del_periodo.length > 0 && (
                  <div className="b2-seg-fuera">
                    <p><b>Enviados en este periodo, programados para otra semana</b> (no cuentan en el cumplimiento del periodo):</p>
                    <ul>{dd.periodo_detalle.enviados_fuera_del_periodo.map((e, i) => <li key={i}>{e.entregable} · semana {e.semana_programada} · enviado el {fecha(e.fecha_primer_envio)}</li>)}</ul>
                  </div>
                )}

                <h3 className="b2-insp-sub">Proyectos, actividades y convenios</h3>
                {dd.iniciativas.length === 0 ? <p className="b2-muted">El docente no es responsable ni colaborador de ninguna iniciativa.</p> : (
                  <ul className="b2-adm-lista b2-seg-ini">
                    {dd.iniciativas.map((i) => (
                      <li key={i.id}>
                        <span>
                          <span className="b2-seg-ini-t">{i.titulo}</span>
                          <span className="b2-sub">{TIPO_INICIATIVA[i.tipo] ?? i.tipo} · {i.rol === "responsable" ? "responsable" : "colaborador"}</span>
                          <span className="b2-sub">{i.entregables_vinculados === 0 ? "Sin entregables vinculados todavía" : `${n0(i.entregables_vinculados)} vinculados · ${n0(i.aprobados)} aprobados · ${n0(i.pendientes_revision)} en revisión · ${n0(i.observados)} observados${i.vencidos ? ` · ${n0(i.vencidos)} vencidos` : ""}`}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="b2-seg-nota"><b>{dd.sin_iniciativa_demostrable.titulo}:</b> {n0(dd.sin_iniciativa_demostrable.total)} entregables. {dd.sin_iniciativa_demostrable.nota}</p>

                <h3 className="b2-insp-sub">Entregables</h3>
                {GRUPOS_DETALLE.map((g) => {
                  const lista = dd.entregables.filter(g.ver);
                  if (lista.length === 0) return null;
                  return (
                    <details key={g.id} className="b2-seg-grp" open={g.abierto && lista.length <= 12}>
                      <summary>{g.titulo} <b>{lista.length}</b></summary>
                      <ul className="b2-seg-ents">
                        {lista.map((e) => (
                          <li key={e.plantilla_id}>
                            <div className="b2-seg-e-h">
                              <span className="b2-seg-e-n">{e.entregable}</span>
                              <span className="b2-seg-e-tags"><Estado kind={KIND_ESTADO[e.estado].kind} label={KIND_ESTADO[e.estado].label} />{e.vencido && <Tag tono="peligro">Vencido</Tag>}</span>
                            </div>
                            <span className="b2-sub">Semana {e.semana}{e.mes ? ` · ${e.mes}` : ""} · límite {fecha(e.fecha_fin)}{e.iniciativa ? ` · ${e.iniciativa.relacion === "demostrada" ? "" : "posible: "}${e.iniciativa.titulo}` : ""}</span>
                            {e.requiere_correccion && e.comentario_revision && <span className="b2-seg-obs">Observación: {e.comentario_revision}</span>}
                            <span className="b2-seg-e-acc">
                              {e.entregable_id != null && <button type="button" className="b2-btn b2-btn-sm" onClick={() => navigate(`/admin/revision?reporte=${e.entregable_id}`)}>{e.estado === "enviado" ? "Revisar" : "Ver en revisión"}</button>}
                              <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={() => irMatriz(dd.docente.id)}>Ver en su matriz</button>
                              {e.evidencias.slice(0, 2).map((u, i) => <a key={i} className="b2-link" href={u} target="_blank" rel="noopener noreferrer">Evidencia{e.evidencias.length > 1 ? ` ${i + 1}` : ""}</a>)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </>
            )}
            <div className="b2-insp-acc">
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => irMatriz(dd.docente.id)}>Abrir su matriz</button>
              <button type="button" className="b2-btn" onClick={() => navigate("/admin/revision")}>Ir a la bandeja de revisión{dd.general.enviados_pendientes_revision > 0 ? ` (${dd.general.enviados_pendientes_revision} por revisar)` : ""}</button>
              <button type="button" className="b2-btn" onClick={() => navigate("/admin/indicadores")}>Indicadores del grupo</button>
              <button type="button" className="b2-btn" onClick={() => navigate("/admin/sistema?tab=proyectos")}>Ver iniciativas</button>
              <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    );
  })();

  return (
    <AnaPagina
      titulo="Seguimiento operativo"
      icono={<ISeguimiento width={20} height={20} />}
      subtitulo={`Reportado = enviado o aprobado · Aprobado = revisado por coordinación · Esperado = con fecha límite hasta hoy.${data?.hoy ? ` Hoy: ${fecha(data.hoy)}.` : ""}`}
      acciones={
        <button type="button" className="b2-btn" onClick={() => void fetchData(true)} disabled={loading}>
          <IRefrescar width={16} height={16} />{loading ? "Actualizando…" : "Actualizar"}
        </button>
      }
      inspector={detallePanel}
      inspectorAbierto={sel != null}
      inspectorEtiqueta={String(sel)}
      onCerrarInspector={() => setSel(null)}
    >
      {error && <ErrorCarga onReintentar={() => void fetchData()}>{error}</ErrorCarga>}

      <div className="b2-ana-av-f"><Barra contador={data ? `${visibles.length}${visibles.length !== data.tarjetas.docentes_visibles_en_tabla ? ` de ${data.tarjetas.docentes_visibles_en_tabla}` : ""} docentes${data.tarjetas.docentes_visibles_en_tabla !== data.tarjetas.docentes ? ` (de ${data.tarjetas.docentes} en el semestre)` : ""}` : undefined}>
        <Buscar value={buscar} onChange={setBuscar} placeholder="Buscar docente, programa, grupo o iniciativa" etiqueta="Buscar docente" />
        <Filtro value={semestre || data?.semestre.codigo || ""} onChange={cambiaSemestre} etiqueta="Semestre" ancho={120}>
          {semestresList.map((s) => <option key={s} value={s}>{s}</option>)}
        </Filtro>
        <Filtro value={semana} onChange={(v) => { setSemana(v); }} etiqueta="Semana académica" ancho={190}>
          <option value="">{semanaActual ? `Semana en curso (${semanaActual})` : "Semana en curso"}</option>
          <option value="semestre">Todo el semestre</option>
          {semanasOpc.map((s) => <option key={s.numero} value={String(s.numero)}>{`Semana ${s.numero}${s.actual ? " (actual)" : ""} · ${rango(s.desde, s.hasta)}${s.programados ? "" : " · sin entregables"}`}</option>)}
        </Filtro>
        <Filtro value={mes} onChange={setMes} etiqueta="Mes académico" ancho={150}>
          <option value="">Todos los meses</option>
          {(opc?.meses ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </Filtro>
        <Filtro value={grupoId} onChange={(v) => { setGrupoId(v); setSel(null); }} etiqueta="Grupo" ancho={190}>
          <option value="">Todos los grupos</option>
          {(opc?.grupos ?? []).map((g) => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
        </Filtro>
        <Filtro value={docenteId} onChange={setDocenteId} etiqueta="Docente" ancho={190}>
          <option value="">Todos los docentes</option>
          {(opc?.docentes ?? []).map((d) => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
        </Filtro>
        <Filtro value={programaId} onChange={setProgramaId} etiqueta="Programa" ancho={180}>
          <option value="">Todos los programas</option>
          {(opc?.programas ?? []).map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
        </Filtro>
        {(opc?.escuelas.length ?? 0) > 0 && (
          <Filtro value={escuelaId} onChange={setEscuelaId} etiqueta="Escuela" ancho={170}>
            <option value="">Todas las escuelas</option>
            {(opc?.escuelas ?? []).map((e) => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
          </Filtro>
        )}
        <Filtro value={iniciativa} onChange={setIniciativa} etiqueta="Iniciativa" ancho={190}>
          <option value="">Todas las iniciativas</option>
          {(opc?.tipos_iniciativa ?? []).map((tp) => <option key={tp} value={`t:${tp}`}>Todos: {TIPO_INICIATIVA[tp]}s</option>)}
          {(opc?.iniciativas ?? []).map((i) => <option key={i.id} value={`i:${i.id}`}>{`${TIPO_INICIATIVA[i.tipo] ?? i.tipo}: ${i.titulo}`}</option>)}
        </Filtro>
        <Filtro value={orden.clave} onChange={(v) => setOrden({ clave: v, dir: v === "nombre" ? "asc" : "desc" })} etiqueta="Ordenar por" ancho={190}>
          {ORDENES.map((o) => <option key={o.id} value={o.id}>Ordenar: {o.label}</option>)}
        </Filtro>
        <button type="button" className="b2-btn b2-btn-sm" onClick={() => setOrden((o) => ({ ...o, dir: o.dir === "asc" ? "desc" : "asc" }))} aria-label={`Invertir orden, ahora ${orden.dir === "asc" ? "ascendente" : "descendente"}`}>
          {orden.dir === "asc" ? "↑ Ascendente" : "↓ Descendente"}
        </button>
        {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar filtros</button>}
      </Barra></div>
      <Chips<EstadoFiltro> value={estado} onChange={setEstado} etiqueta="Estado del entregable (afecta a la tabla)" items={ESTADOS} />
      {estado !== "todos" && <p className="b2-seg-nota">El filtro de estado decide qué docentes aparecen en la tabla (los que tienen entregables en ese estado dentro del periodo); las tarjetas y los gráficos conservan toda la población para que los porcentajes tengan sentido.</p>}

      {cargandoInicial && <div className="b2-skel-w" role="status" aria-label="Cargando seguimiento…">{[92, 70, 84, 60].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%`, height: 18 }} />)}</div>}

      {data && (data.avisos.length > 0 || (data.alcance?.advertencias?.length ?? 0) > 0) && (
        <div className="b2-aviso-sem" role="status">{[...data.avisos, ...(data.alcance?.advertencias ?? [])].join(" ")}</div>
      )}

      {vacio && !error && (
        <div className="b2-fig" role="status">
          <div className="b2-adm-vacio-c">
            <strong>{hayFiltros ? "Ningún docente coincide con los filtros" : `El semestre ${data?.semestre.codigo ?? ""} no tiene docentes con grupo de matriz`}</strong>
            <p>{hayFiltros ? "Prueba con otro grupo, semana o programa, o limpia los filtros." : "El seguimiento se calcula con la matriz de cada docente. Asigna docentes a un grupo en Administración → Tareas semanales."}</p>
            {hayFiltros ? <button type="button" className="b2-btn" onClick={limpiar}>Limpiar filtros</button> : <button type="button" className="b2-btn" onClick={() => navigate("/admin/sistema?tab=tareas")}>Ir a Tareas semanales</button>}
          </div>
        </div>
      )}

      {data && t && !vacio && (
        <>
          <section className="b2-ana-sec" aria-label="Indicadores del seguimiento">
            <p className="b2-seg-per">
              <b>{periodo?.etiqueta}</b>
              {periodo?.desde && periodo?.hasta ? ` · ${rango(periodo.desde, periodo.hasta)}` : ""}
              {periodo?.origen === "semana_actual" ? " · semana en curso" : ""}
              {periodo?.tipo === "semestre" && periodo.origen === "sin_semana_en_curso" ? " · no hay semana en curso en este semestre" : ""}
              {hayFiltros && <Tag tono="aviso">Indicadores (filtrado)</Tag>}
            </p>
            <div className="b2-seg-cards"><Indicadores items={[
              { k: "Docentes del semestre", v: n0(t.docentes), sub: data.docentes_sin_grupo > 0 ? `${data.docentes_sin_grupo} sin grupo, fuera del semestre` : undefined, titulo: data.definiciones.docentes },
              { k: "Con pendientes", v: n0(t.docentes_con_pendientes), sub: "docentes", alerta: t.docentes_con_pendientes > 0, titulo: data.definiciones.docentes_con_pendientes },
              { k: `Reportado · ${t.periodo.etiqueta}`, ...tarjetaPct(t.periodo.pct_reportado, t.periodo.programados, t.periodo.reportados, "programados"), titulo: data.definiciones.reportado_periodo },
              { k: `Aprobado · ${t.periodo.etiqueta}`, ...tarjetaPct(t.periodo.pct_aprobado, t.periodo.programados, t.periodo.aprobados, "programados"), titulo: data.definiciones.aprobado_periodo },
              { k: "Reportado · semestre", v: pct(t.semestre.pct_reportado), sub: `${n0(t.semestre.reportados)} de ${n0(t.semestre.programados)}`, titulo: data.definiciones.reportado_semestre },
              { k: "Aprobado · semestre", v: pct(t.semestre.pct_aprobado), sub: `${n0(t.semestre.aprobados)} de ${n0(t.semestre.programados)} · esperado ${pct(t.semestre.pct_esperado)} (${pp(t.semestre.brecha_pct)})`, alerta: (t.semestre.brecha_pct ?? 0) < 0, titulo: data.definiciones.aprobado_semestre },
              { k: "Vencidos", v: n0(t.vencidos), sub: "entregables", alerta: t.vencidos > 0, titulo: data.definiciones.vencidos },
              { k: "En revisión", v: n0(t.enviados_pendientes_revision), sub: "enviados", titulo: data.definiciones.pendientes_revision },
              { k: "Observados", v: n0(t.observados), sub: "entregables", titulo: data.definiciones.observados },
              { k: "Programados esta semana", v: soloNum(t.programados_semana_actual), sub: t.semana_actual ? `semana ${t.semana_actual}, en curso` : "sin semana en curso", titulo: data.definiciones.semana_actual },
            ]} /></div>
            {t.periodo.enviados_fuera_del_periodo > 0 && enSemana && (
              <p className="b2-seg-nota">Además, {n0(t.periodo.enviados_fuera_del_periodo)} entregables programados para otras semanas se enviaron durante esta; no cuentan en el cumplimiento del periodo.</p>
            )}
            <details className="b2-seg-defs">
              <summary>Cómo se calcula cada indicador</summary>
              <dl>
                {Object.entries(data.definiciones).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{v}</dd></div>)}
              </dl>
            </details>
          </section>

          <section className="b2-ch-grid b2-ana-av-graf" aria-label="Gráficos de seguimiento">
            <Figura
              pregunta="¿Cómo evoluciona cada semana?"
              nota="De lo programado en cada semana, qué porcentaje está reportado y cuál aprobado. Las semanas futuras se atenúan: aún no son exigibles."
              leyenda={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }]}
              vacio={categoriasSemana.length === 0 ? "Esta selección no tiene entregables programados en ninguna semana." : undefined}
              tabla={{ cabeceras: ["Semana", "Programados", "Reportados", "Aprobados"], filas: (data.graficos.evolucion_semanal).map((s) => [`S${s.semana}${s.mes ? ` · ${s.mes}` : ""}`, n0(s.programados), n0(s.reportados), n0(s.aprobados)]) }}
            >
              <div className="b2-seg-evo"><ColumnasAgrupadas etiqueta="Reportado y aprobado por semana programada" categorias={categoriasSemana} /></div>
            </Figura>

            <div className="b2-ch-col">
            <Figura
              pregunta="¿En qué estado están los entregables?"
              nota="Cada entregable está en un solo estado. «Vencidos» es una condición (fecha límite pasada sin reportar), ya contada dentro de sin iniciar, borradores y observados."
              tabla={eg ? { cabeceras: ["Estado", "Entregables"], filas: [["Aprobados", n0(eg.aprobados)], ["En revisión", n0(eg.enviados)], ["Observados", n0(eg.observados)], ["Borradores", n0(eg.borradores)], ["Sin iniciar", n0(eg.no_iniciados)], ["De los cuales vencidos (condición)", n0(eg.de_los_cuales_vencidos)]] } : undefined}
            >
              {eg && (
                <>
                  <ApiladaH
                    etiqueta="Estado de los entregables"
                    total={eg.total}
                    segmentos={[
                      { s: "apr", label: "Aprobados", valor: eg.aprobados },
                      { s: "pen", label: "En revisión", valor: eg.enviados },
                      { s: "obs", label: "Observados", valor: eg.observados },
                      { s: "b" as const, label: "Borradores", valor: eg.borradores },
                      { s: "sin", label: "Sin iniciar", valor: eg.no_iniciados },
                    ]}
                  />
                  <p className="b2-seg-ven"><Tag tono={eg.de_los_cuales_vencidos > 0 ? "peligro" : "neutro"}>Vencidos</Tag> <b>{n0(eg.de_los_cuales_vencidos)}</b> de {n0(eg.no_iniciados + eg.borradores + eg.observados)} que requieren acción del docente</p>
                </>
              )}
            </Figura>
            <Figura
              pregunta="¿Qué grupos necesitan atención?"
              nota="Reportado, aprobado y esperado del semestre por grupo. Toca un grupo para filtrar. No se aplica el filtro de grupo a esta comparación."
              leyenda={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }, { s: "esp", label: "Esperado a la fecha" }]}
              vacio={gruposConDatos.length === 0 ? "Ningún grupo de la selección tiene entregables." : undefined}
              tabla={{ cabeceras: ["Grupo", "Docentes", "Entregables", "Reportado", "Aprobado", "Esperado"], filas: [...gruposConDatos, ...gruposSinDatos].map((g) => [g.nombre, n0(g.docentes), n0(g.total), pct(g.pct_reportado), pct(g.pct_aprobado), pct(g.pct_esperado)]) }}
            >
              <FilasBala
                etiqueta="Avance por grupo"
                seleccionada={grupoId ? Number(grupoId) : undefined}
                onAbrir={(id) => { setGrupoId(grupoId === String(id) ? "" : String(id)); setSel(null); }}
                filas={gruposConDatos.map((g) => ({ id: g.id, etiqueta: g.nombre, sub: `${n0(g.docentes)} ${g.docentes === 1 ? "docente" : "docentes"}`, rep: g.pct_reportado ?? 0, apr: g.pct_aprobado ?? 0, esp: g.pct_esperado ?? 0, alerta: (g.brecha_pct ?? 0) < 0 ? `Brecha ${pp(g.brecha_pct)}` : undefined, extra: g.vencidos > 0 ? `${n0(g.vencidos)} vencidos` : undefined }))}
              />
              {gruposSinDatos.length > 0 && <p className="b2-seg-nota">Sin entregables en la matriz: {gruposSinDatos.map((g) => `${g.nombre} (${g.docentes} docentes)`).join(", ")}.</p>}
            </Figura>

            </div>
          </section>

          <section className="b2-ana-sec" aria-label="Seguimiento por docente">
            <h2>Seguimiento por docente</h2>
            <DataTable<FilaDocente>
              etiqueta="Seguimiento por docente"
              cols={cols}
              rows={ordenados}
              getKey={(d) => d.id}
              selId={sel}
              onSelect={(d) => setSel(d ? d.id : null)}
              cargando={loading && !data}
              ocupado={loading}
              orden={orden}
              onOrden={alternarOrden}
              vacio={
                <div className="b2-adm-vacio-c">
                  <strong>Ningún docente coincide</strong>
                  <p>Prueba con otro estado, semana o búsqueda.</p>
                  {hayFiltros && <button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button>}
                </div>
              }
              filaMovil={(d) => {
                const e = estadoDe(d);
                return {
                  titulo: d.nombre,
                  lineas: [
                    `${d.programa}${d.grupo_nombre ? ` · ${d.grupo_nombre}` : ""}`,
                    d.periodo.programados === 0 ? "Periodo: sin entregables programados" : `Periodo: ${d.periodo.reportados}/${d.periodo.programados} reportados · ${d.periodo.aprobados} aprobados · ${d.periodo.pendientes} pendientes`,
                    sinMatriz(d) ? "Sin entregables" : <Bullet key="b" rep={d.semestre.pct_reportado} apr={d.semestre.pct_aprobado} esp={d.semestre.pct_esperado} nombre={d.nombre} />,
                    d.semestre.vencidos > 0 ? `${d.semestre.vencidos} vencidos` : "",
                    d.proxima_accion ? `${d.proxima_accion.vencido ? "Vencido" : "Próximo"}: ${d.proxima_accion.entregable} (${fecha(d.proxima_accion.fecha_fin)})` : "",
                  ].filter((l) => l !== ""),
                  lado: <Estado kind={e.kind} label={e.label} />,
                };
              }}
            />
          </section>
        </>
      )}
    </AnaPagina>
  );
}
