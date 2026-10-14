import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, ArrowUpDown, ClipboardCheck, FileCheck2, FolderKanban, Search, TableProperties, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";
import { etiquetaSemana, semaforoConfig, type Semaforo, type SemanaActual } from "../data/matrizConstants";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, Panel, ProgressBar, Segmented, StackedBar, StatusPill, type Tone } from "../components/ds/primitives";
import { axisTick, ChartLegend, ChartTooltip, useChartColors } from "../components/ds/chart";

interface DashboardStats {
  total_docentes: number;
  reportes_enviados: number;
  docentes_atrasados: number;
  proyectos_activos: number;
  pendientes_revision?: number;
  reportes_aprobados?: number;
  reportes_observados?: number;
  avance_reportado_promedio?: number;
  avance_aprobado_promedio?: number;
  avance_esperado_promedio?: number;
  semaforo?: { verde: number; amarillo: number; rojo: number };
}

interface ProgresoSemanalRow {
  semana: number;
  mes: string;
  enviados: number;
  reportados?: number;
  aprobados: number;
}

interface CumplimientoProgramaRow {
  programa: string;
  porcentaje: number;
  porcentaje_reportado?: number;
  porcentaje_aprobado?: number;
  porcentaje_esperado?: number;
  docentes: number;
}

interface DocenteRecienteRow {
  id: number;
  nombre: string;
  programa: string;
  regional: string;
  porcentaje_avance: number;
  porcentaje_reportado?: number;
  porcentaje_aprobado?: number;
  porcentaje_esperado?: number;
  brecha?: number;
  brecha_pct?: number;
  semaforo?: Semaforo;
  pendientes_revision?: number;
  observados?: number;
  vencidos?: number;
  reportes_enviados: number;
  estado: "al_dia" | "atrasado" | "sin_actividad";
}

interface AdminDashboardPayload {
  stats?: DashboardStats;
  semana_actual?: SemanaActual;
  progreso_semanal?: ProgresoSemanalRow[];
  cumplimiento_por_programa?: CumplimientoProgramaRow[];
  docentes_recientes?: DocenteRecienteRow[];
}

const ESTADO_DOCENTE: Record<DocenteRecienteRow["estado"], { label: string; tone: Tone }> = {
  al_dia: { label: "Al día", tone: "success" },
  atrasado: { label: "Con retraso", tone: "danger" },
  sin_actividad: { label: "Sin actividad", tone: "neutral" },
};
const TONE_SEMAFORO: Record<Semaforo, Tone> = { verde: "success", amarillo: "warning", rojo: "danger", sin_exigibles: "neutral", sin_datos: "neutral" };

type Filtro = "todos" | "atrasado" | "rojo" | "por_revisar";
type Orden = "nombre" | "reportado" | "brecha" | "vencidos";

const pct = (v?: number | null) => (v != null ? `${Math.round(v)}%` : "—");
const iniciales = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const CHART = useChartColors();
  const AXIS_TICK = axisTick(CHART);
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("nombre");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/admin/dashboard`);
        if (!res.ok) throw new Error("Error al cargar dashboard admin");
        const json = await res.json();
        if (!cancelado) setData(json);
      } catch (err) {
        console.error(err);
        if (!cancelado) {
          setError("No se pudo cargar el panel. Revisa la conexión e intenta de nuevo.");
          setData(null);
          notify.error("No se pudo cargar el panel.");
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // La semana y la fecha vigentes las determina el backend (America/Bogota, calendario del semestre).
  const subtitulo = data?.semana_actual ? `${etiquetaSemana(data.semana_actual)} · ${formatDateOnly(data.semana_actual.hoy)}` : "";
  const stats = data?.stats;
  const semanaNumero = data?.semana_actual?.estado === "en_curso" ? data.semana_actual.numero : null;

  const lineData = useMemo(
    () => (data?.progreso_semanal ?? []).map((r) => ({ semana: r.semana, reportados: r.reportados ?? r.enviados, aprobados: r.aprobados })),
    [data?.progreso_semanal]
  );
  const programas = useMemo(
    () =>
      (data?.cumplimiento_por_programa ?? []).map((r) => ({
        programa: r.programa,
        docentes: r.docentes,
        esperado: Math.round(r.porcentaje_esperado ?? 0),
        reportado: Math.round(r.porcentaje_reportado ?? r.porcentaje),
        aprobado: Math.round(r.porcentaje_aprobado ?? 0),
      })),
    [data?.cumplimiento_por_programa]
  );

  const docentes = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const filas = (data?.docentes_recientes ?? []).filter((d) => {
      if (filtro === "atrasado" && d.estado !== "atrasado") return false;
      if (filtro === "rojo" && d.semaforo !== "rojo") return false;
      if (filtro === "por_revisar" && !(d.pendientes_revision ?? 0)) return false;
      if (t && !`${d.nombre} ${d.programa} ${d.regional}`.toLowerCase().includes(t)) return false;
      return true;
    });
    const rep = (d: DocenteRecienteRow) => d.porcentaje_reportado ?? d.porcentaje_avance;
    return [...filas].sort((a, b) => {
      if (orden === "reportado") return rep(a) - rep(b);
      if (orden === "brecha") return (a.brecha ?? 0) - (b.brecha ?? 0);
      if (orden === "vencidos") return (b.vencidos ?? 0) - (a.vencidos ?? 0);
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [data?.docentes_recientes, filtro, busqueda, orden]);

  const todos = data?.docentes_recientes ?? [];
  const sem = stats?.semaforo;
  const totalSem = sem ? sem.verde + sem.amarillo + sem.rojo : 0;

  // Atención requerida: solo hechos del backend, ordenados por urgencia
  const alertas: { tone: Tone; texto: string; accion: string; ir: () => void }[] = [];
  if ((stats?.pendientes_revision ?? 0) > 0) {
    alertas.push({ tone: "violet", texto: `${stats!.pendientes_revision} entregable${stats!.pendientes_revision === 1 ? "" : "s"} esperan revisión`, accion: "Revisar", ir: () => navigate("/admin/revision") });
  }
  if ((sem?.rojo ?? 0) > 0) {
    alertas.push({ tone: "danger", texto: `${sem!.rojo} docente${sem!.rojo === 1 ? "" : "s"} en estado crítico`, accion: "Ver críticos", ir: () => setFiltro("rojo") });
  }
  if ((stats?.docentes_atrasados ?? 0) > 0) {
    alertas.push({ tone: "warning", texto: `${stats!.docentes_atrasados} docente${stats!.docentes_atrasados === 1 ? "" : "s"} con entregables vencidos`, accion: "Ver con retraso", ir: () => setFiltro("atrasado") });
  }

  const th = (id: Orden, texto: string) => (
    <button type="button" onClick={() => setOrden(id)} className={`inline-flex items-center gap-1 ${orden === id ? "text-text" : ""}`} aria-label={`Ordenar por ${texto}`}>
      {texto} <ArrowUpDown className="h-3 w-3 opacity-60" aria-hidden />
    </button>
  );

  return (
    <Page>
      <PageHeader
        title="Panel de coordinación"
        description={subtitulo ? <span className="first-letter:uppercase">{subtitulo}</span> : undefined}
        actions={
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => navigate("/admin/revision")}>
            <ClipboardCheck className="h-4 w-4" /> Revisar reportes
          </button>
        }
      />

      {error && <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>}>{error}</InlineAlert>}

      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Atención requerida">
          {alertas.map((a) => (
            <li key={a.texto} className="flex items-center gap-3 rounded-lg border border-line bg-surface py-1.5 pl-3 pr-1.5 text-[0.8125rem] shadow-[var(--shadow-xs)]">
              <StatusPill tone={a.tone} dot={false} className="!px-1.5"><AlertTriangle className="h-3 w-3" aria-hidden /></StatusPill>
              <span className="text-text">{a.texto}</span>
              <button type="button" onClick={a.ir} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">{a.accion}</button>
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi className="lg:col-span-2" label="Avance reportado" icon={FileCheck2} tone="brand" value={loading && !stats ? "…" : pct(stats?.avance_reportado_promedio)} progress={stats?.avance_reportado_promedio ?? 0} marker={stats?.avance_esperado_promedio ?? null} hint={stats ? `Esperado a la fecha ${pct(stats.avance_esperado_promedio)} · aprobado ${pct(stats.avance_aprobado_promedio)} · ${stats.reportes_enviados} reportados` : "Promedio de docentes con matriz"} />
        <Kpi label="Docentes" icon={Users} tone="neutral" value={loading && !stats ? "…" : (stats?.total_docentes ?? "—")} hint="Registrados" />
        <Kpi label="Por revisar" icon={ClipboardCheck} tone="violet" value={loading && !stats ? "…" : (stats?.pendientes_revision ?? "—")} hint={stats ? `${stats.reportes_observados ?? 0} observados · ${stats.reportes_aprobados ?? 0} aprobados` : "Enviados sin revisar"} />
        <Kpi label="Con retraso" icon={AlertTriangle} tone={(stats?.docentes_atrasados ?? 0) > 0 ? "danger" : "success"} value={loading && !stats ? "…" : (stats?.docentes_atrasados ?? "—")} hint="Docentes con vencidos" />
        <Kpi label="Iniciativas activas" icon={FolderKanban} tone="signal" value={loading && !stats ? "…" : (stats?.proyectos_activos ?? "—")} hint="En ejecución" />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Evolución del cumplimiento"
          description="Entregables reportados (enviados o aprobados) y aprobados por semana del semestre activo"
          action={<ChartLegend items={[{ label: "Reportados", color: CHART.reportado }, { label: "Aprobados", color: CHART.aprobado }]} />}
        >
          {lineData.length === 0 ? (
            <EmptyState icon={FileCheck2} title="Aún no hay datos de avance">Aparecerán cuando los docentes reporten entregables en el semestre activo.</EmptyState>
          ) : (
            <div role="img" aria-label="Gráfico de líneas: reportados y aprobados por semana">
              <ResponsiveContainer width="100%" height={248}>
                <AreaChart data={lineData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRep" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.reportado} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={CHART.reportado} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="semana" tick={AXIS_TICK} tickFormatter={(v) => `S${v}`} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip labelPrefix="Semana " />} cursor={{ stroke: CHART.grid }} />
                  {semanaNumero != null && <ReferenceLine x={semanaNumero} stroke={CHART.signal} strokeDasharray="4 3" label={{ value: "Hoy", position: "insideTopRight", fontSize: 11, fill: CHART.signal }} />}
                  <Area type="monotone" dataKey="reportados" name="Reportados" stroke={CHART.reportado} strokeWidth={2} fill="url(#gRep)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="aprobados" name="Aprobados" stroke={CHART.aprobado} strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Riesgo por docente" description="Semáforo según entregables vencidos y brecha">
          {sem && totalSem > 0 ? (
            <div className="space-y-4">
              <StackedBar total={totalSem} parts={[{ tone: "success", value: sem.verde, label: "En regla" }, { tone: "warning", value: sem.amarillo, label: "En riesgo" }, { tone: "danger", value: sem.rojo, label: "Crítico" }]} />
              <ul className="space-y-2">
                {(["verde", "amarillo", "rojo"] as const).map((k) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <StatusPill tone={TONE_SEMAFORO[k]}>{semaforoConfig[k].label}</StatusPill>
                    <span className="tabular-nums text-text" style={{ fontWeight: 600 }}>{sem[k]} <span className="text-xs text-text-subtle" style={{ fontWeight: 400 }}>de {totalSem}</span></span>
                  </li>
                ))}
              </ul>
              {stats && (
                <div className="space-y-2 border-t border-line pt-4">
                  <p className="text-xs font-medium text-text-subtle">Entregables reportados</p>
                  <StackedBar
                    total={(stats.reportes_aprobados ?? 0) + (stats.reportes_observados ?? 0) + (stats.pendientes_revision ?? 0)}
                    parts={[
                      { tone: "success", value: stats.reportes_aprobados ?? 0, label: "Aprobados" },
                      { tone: "warning", value: stats.reportes_observados ?? 0, label: "Observados" },
                      { tone: "violet", value: stats.pendientes_revision ?? 0, label: "Por revisar" },
                    ]}
                  />
                  <ul className="grid grid-cols-3 gap-2 text-xs text-text-muted">
                    <li><span className="block text-base tabular-nums text-text" style={{ fontWeight: 650 }}>{stats.reportes_aprobados ?? 0}</span>Aprobados</li>
                    <li><span className="block text-base tabular-nums text-text" style={{ fontWeight: 650 }}>{stats.reportes_observados ?? 0}</span>Observados</li>
                    <li><span className="block text-base tabular-nums text-text" style={{ fontWeight: 650 }}>{stats.pendientes_revision ?? 0}</span>Por revisar</li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Sin docentes con matriz">Cuando haya matrices asignadas se mostrará la distribución de riesgo.</EmptyState>
          )}
        </Panel>
      </div>

      <Panel
        title="Cumplimiento por programa"
        description="Promedio esperado, reportado y aprobado de la matriz (hasta 8 programas)"
        action={<ChartLegend items={[{ label: "Esperado", color: CHART.esperado }, { label: "Reportado", color: CHART.reportado }, { label: "Aprobado", color: CHART.aprobado }]} />}
      >
        {programas.length === 0 ? (
          <EmptyState icon={TableProperties} title="Sin programas con matriz">Asigna una matriz a los docentes para ver el cumplimiento por programa.</EmptyState>
        ) : (
          <div role="img" aria-label="Barras horizontales: cumplimiento esperado, reportado y aprobado por programa">
            <ResponsiveContainer width="100%" height={Math.max(150, programas.length * 56)}>
              <BarChart data={programas} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} unit="%" axisLine={false} tickLine={false} />
                <YAxis dataKey="programa" type="category" tick={{ ...AXIS_TICK, fontSize: 12, fill: CHART.muted }} width={typeof window !== "undefined" && window.innerWidth < 640 ? 96 : 170} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="%" />} cursor={{ fill: CHART.cursor }} />
                <Bar dataKey="esperado" name="Esperado" fill={CHART.esperado} radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="reportado" name="Reportado" fill={CHART.reportado} radius={[0, 3, 3, 0]} barSize={8} />
                <Bar dataKey="aprobado" name="Aprobado" fill={CHART.aprobado} radius={[0, 3, 3, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="Estado de docentes"
        description={`${docentes.length} de ${todos.length} docentes`}
        bodyClassName=""
        action={
          <button type="button" onClick={() => navigate("/admin/reportes")} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">Ver métricas</button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Segmented<Filtro>
            label="Filtrar docentes"
            value={filtro}
            onChange={setFiltro}
            items={[
              { id: "todos", label: "Todos", count: todos.length },
              { id: "atrasado", label: "Con retraso", count: todos.filter((d) => d.estado === "atrasado").length, tone: "danger" },
              { id: "rojo", label: "Críticos", count: todos.filter((d) => d.semaforo === "rojo").length, tone: "danger" },
              { id: "por_revisar", label: "Por revisar", count: todos.filter((d) => (d.pendientes_revision ?? 0) > 0).length, tone: "violet" },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar docente, programa o regional" aria-label="Buscar docente" className="ds-input !pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[960px]">
            <thead>
              <tr>
                <th>{th("nombre", "Docente")}</th>
                <th className="w-[200px]">{th("reportado", "Reportado")}</th>
                <th className="text-right">Aprobado</th>
                <th className="text-right">Esperado</th>
                <th className="text-right" title="Brecha = entregables aprobados − esperados a la fecha">{th("brecha", "Brecha")}</th>
                <th className="text-right">Por revisar</th>
                <th className="text-right">{th("vencidos", "Vencidos")}</th>
                <th>Riesgo</th>
                <th>Estado</th>
                <th className="text-right"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {docentes.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState icon={Users} title={loading ? "Cargando docentes…" : "Ningún docente coincide"}>{loading ? undefined : "Prueba con otro filtro o con otra búsqueda."}</EmptyState>
                  </td>
                </tr>
              )}
              {docentes.map((t) => {
                const progreso = Math.round(t.porcentaje_reportado ?? t.porcentaje_avance);
                const semaforo = t.semaforo ? semaforoConfig[t.semaforo] : null;
                const brecha = t.brecha ?? 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[0.6875rem] text-white" aria-hidden>{iniciales(t.nombre)}</span>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-text" style={{ fontWeight: 600 }}>{t.nombre}</p>
                          <p className="truncate text-xs text-text-subtle">{t.programa}{t.regional ? ` · ${t.regional}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={progreso} marker={t.porcentaje_esperado ?? null} tone={progreso >= 70 ? "success" : progreso >= 40 ? "warning" : "danger"} label={`Reportado ${progreso}%`} className="w-24" />
                        <span className="w-9 text-right tabular-nums text-text" style={{ fontWeight: 600 }}>{progreso}%</span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums text-text-muted">{pct(t.porcentaje_aprobado)}</td>
                    <td className="text-right tabular-nums text-text-muted">{pct(t.porcentaje_esperado)}</td>
                    <td className={`text-right tabular-nums ${brecha < 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: brecha < 0 ? 600 : 400 }}>
                      {t.brecha != null ? (t.brecha > 0 ? `+${t.brecha}` : t.brecha) : "—"}
                    </td>
                    <td className="text-right tabular-nums text-text-muted">{t.pendientes_revision ?? 0}</td>
                    <td className={`text-right tabular-nums ${(t.vencidos ?? 0) > 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: (t.vencidos ?? 0) > 0 ? 600 : 400 }}>{t.vencidos ?? 0}</td>
                    <td>{semaforo && t.semaforo ? <StatusPill tone={TONE_SEMAFORO[t.semaforo]}>{semaforo.label}</StatusPill> : "—"}</td>
                    <td><StatusPill tone={ESTADO_DOCENTE[t.estado].tone} dot={false}>{ESTADO_DOCENTE[t.estado].label}</StatusPill></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => navigate(`/admin/docentes/${t.id}/matriz`)} className="ds-btn ds-btn-ghost ds-btn-sm" title={`Ver la matriz de ${t.nombre}`}>
                          <TableProperties className="h-3.5 w-3.5" /> Matriz
                        </button>
                        <button type="button" onClick={() => navigate("/admin/revision")} className="ds-btn ds-btn-ghost ds-btn-sm" title="Ir a la revisión de reportes">
                          <ClipboardCheck className="h-3.5 w-3.5" /> Revisar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
