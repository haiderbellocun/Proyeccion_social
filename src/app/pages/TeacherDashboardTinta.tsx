import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Clock, FileText, MessageSquareWarning, Plus, Search, Send, TableProperties } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { estadoEntregableConfig, etiquetaSemana, semaforoConfig, type EstadoEntregable, type IndicadoresSeguimiento, type SemanaActual } from "../data/matrizConstants";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, Panel, ProgressBar, Segmented, StatusPill, TONE_ESTADO, type Tone } from "../components/ds/primitives";
import { axisTick, ChartLegend, ChartTooltip, useChartColors } from "../components/ds/chart";

const API_BASE_URL = API_BASE;

type DashboardStats = {
  total: number;
  completed: number;
  pct: number;
  expectedPct: number;
  compliancePct: number;
  due: number;
  gap: number;
  aprobados?: number;
  approvedPct?: number;
};
type StatsByMonth = {
  month: string;
  total: number;
  done: number;
  aprobados?: number;
  pct: number;
  pct_aprobado?: number;
  expectedPct: number;
  active: boolean;
};
type StatsByWeek = {
  semana: number;
  total: number;
  done: number;
  pct: number;
  pct_aprobado?: number;
  expectedPct: number;
};
type UpcomingItem = {
  id: number;
  entregable_id?: number | null;
  iniciativa: string;
  entregable: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  semana: number;
  estado?: EstadoEntregable;
  vencido?: boolean;
  comentario_revision?: string | null;
};
type Conteos = { pendientes: number; observados: number; vencidos: number; en_revision: number };
type ActivityRow = {
  id: number;
  entregableId: number | null;
  category: string;
  deliverable: string;
  initiative: string;
  initiativeType: string;
  startDate: string | null;
  deadline: string | null;
  status: string;
  statusLabel: string;
  estado?: EstadoEntregable;
  vencido?: boolean;
};

const EMPTY_STATS: DashboardStats = { total: 0, completed: 0, pct: 0, expectedPct: 0, compliancePct: 100, due: 0, gap: 0 };

const formatDate = (value: string | null) => formatDateOnly(value);

/** Estado del backend + condición «Vencido» (que no sustituye al estado de revisión). */
function EstadoChip({ estado, vencido }: { estado?: EstadoEntregable; vencido?: boolean }) {
  const cfg = estadoEntregableConfig[estado ?? "no_iniciado"];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusPill tone={TONE_ESTADO[estado ?? "no_iniciado"] ?? "neutral"}>{cfg.label}</StatusPill>
      {vencido && <StatusPill tone="danger" dot={false}>Vencido</StatusPill>}
    </span>
  );
}

type Filtro = "todos" | "pendientes" | "observados" | "vencidos" | "aprobados";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const C = useChartColors();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [byMonth, setByMonth] = useState<StatsByMonth[]>([]);
  const [byWeek, setByWeek] = useState<StatsByWeek[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresSeguimiento | null>(null);
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [conteos, setConteos] = useState<Conteos>({ pendientes: 0, observados: 0, vencidos: 0, en_revision: 0 });
  const [proximo, setProximo] = useState<UpcomingItem | null>(null);
  const [observados, setObservados] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const id = currentUser?.id ?? null;
    if (!id) {
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resStats = await fetch(`${API_BASE_URL}/docente/${id}/dashboard-stats`);
        if (!resStats.ok) throw new Error("dashboard-stats");
        const data = await resStats.json();
        if (cancelado) return;
        setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
        setByMonth(Array.isArray(data.byMonth) ? data.byMonth : []);
        setByWeek(Array.isArray(data.byWeek) ? data.byWeek : []);
        setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
        setActivities(Array.isArray(data.activities) ? data.activities : []);
        setIndicadores(data.indicadores ?? null);
        setSemana(data.semana_actual ?? null);
        setConteos(data.conteos ?? { pendientes: 0, observados: 0, vencidos: 0, en_revision: 0 });
        setProximo(data.proximo_entregable ?? null);
        setObservados(Array.isArray(data.observados) ? data.observados : []);
      } catch (err) {
        console.error(err);
        if (!cancelado) {
          setError("No se pudo cargar tu panel. Revisa la conexión e intenta de nuevo.");
          notify.error("No se pudo cargar la información.");
          setStats(EMPTY_STATS);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [currentUser?.id, recarga]);

  const s = stats ?? EMPTY_STATS;
  const ind = indicadores;
  const semaforo = ind ? semaforoConfig[ind.semaforo] : null;
  const tonoSemaforo: Tone = ind?.semaforo === "verde" ? "success" : ind?.semaforo === "amarillo" ? "warning" : ind?.semaforo === "rojo" ? "danger" : "neutral";
  const nombre = currentUser?.nombre || "docente";
  const hayVencidos = conteos.vencidos > 0;

  const semanal = byWeek.map((r) => ({ semana: r.semana, avance: r.pct, aprobado: r.pct_aprobado ?? 0, esperado: r.expectedPct }));
  const semanaHoy = semana?.estado === "en_curso" ? semana.numero : null;

  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return activities.filter((r) => {
      if (filtro === "pendientes" && !(r.estado === "no_iniciado" || r.estado === "borrador")) return false;
      if (filtro === "observados" && r.estado !== "observado") return false;
      if (filtro === "vencidos" && !r.vencido) return false;
      if (filtro === "aprobados" && r.estado !== "aprobado") return false;
      if (t && !`${r.deliverable} ${r.initiative} ${r.category}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [activities, filtro, busqueda]);
  const cuenta = (f: (r: ActivityRow) => boolean) => activities.filter(f).length;

  return (
    <Page>
      <PageHeader
        title={`Hola, ${nombre}`}
        description={loading ? "Cargando tu seguimiento…" : `${etiquetaSemana(semana)} · avance según tu matriz de seguimiento`}
        meta={semaforo && !loading ? <StatusPill tone={tonoSemaforo}>{semaforo.label}</StatusPill> : undefined}
        actions={
          <>
            <button type="button" className="ds-btn ds-btn-secondary" onClick={() => navigate("/docente/matriz")}>
              <TableProperties className="h-4 w-4" /> Ver matriz
            </button>
            <button type="button" className="ds-btn ds-btn-primary" onClick={() => navigate("/docente/reportar")}>
              <Plus className="h-4 w-4" /> Reportar entregable
            </button>
          </>
        }
      />

      {error && <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>}>{error}</InlineAlert>}

      <section aria-label="Tu avance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Avance reportado" icon={Send} tone="brand" value={`${s.pct}%`} progress={s.pct} marker={s.expectedPct} hint={`${s.completed} de ${s.total} enviados a revisión o aprobados`} />
        <Kpi label="Avance aprobado" icon={CheckCircle2} tone="success" value={ind ? `${ind.pct_aprobado}%` : "—"} progress={ind?.pct_aprobado ?? 0} marker={s.expectedPct} hint={ind ? `${ind.aprobados} de ${ind.total} aprobados por coordinación` : "Sin matriz asignada"} />
        <Kpi label="Avance esperado a hoy" icon={Clock} tone="warning" value={`${s.expectedPct}%`} hint={`${s.due} exigibles · brecha ${ind ? (ind.brecha_entregables > 0 ? "+" : "") + ind.brecha_entregables : 0} (aprobados − esperados)`} />
        <Kpi label="Semana actual" icon={CalendarDays} tone="signal" value={semana?.numero != null ? `S${semana.numero}` : "—"} hint={semana?.estado === "en_curso" ? `${formatDate(semana.fecha_inicio_semana ?? null)} – ${formatDate(semana.fecha_fin_semana ?? null)}` : etiquetaSemana(semana)} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Requiere tu atención" description="Lo que coordinación te devolvió y lo que vence pronto" bodyClassName="">
            <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
              {[
                { l: "Pendientes", v: conteos.pendientes, icon: Clock, tone: "text-text" },
                { l: "En revisión", v: conteos.en_revision, icon: Send, tone: "text-purple-700" },
                { l: "Observados", v: conteos.observados, icon: MessageSquareWarning, tone: "text-amber-700" },
                { l: "Vencidos", v: conteos.vencidos, icon: AlertCircle, tone: hayVencidos ? "text-red-700" : "text-text" },
              ].map((c) => (
                <div key={c.l} className="flex items-center gap-3 px-4 py-3">
                  <c.icon className={`h-4 w-4 ${c.tone}`} aria-hidden />
                  <div className="leading-tight">
                    <p className={`text-lg tabular-nums ${c.tone}`} style={{ fontWeight: 650 }}>{c.v}</p>
                    <p className="text-xs text-text-subtle">{c.l}</p>
                  </div>
                </div>
              ))}
            </div>

            {observados.length > 0 ? (
              <ul className="divide-y divide-line">
                {observados.slice(0, 5).map((o) => (
                  <li key={`${o.entregable_id ?? "p"}-${o.id}`}>
                    <button type="button" onClick={() => navigate(`/docente/evidencias?entregable=${o.id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
                      <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-text" style={{ fontWeight: 600 }}>{o.entregable}</span>
                        {o.comentario_revision && <span className="mt-0.5 block text-xs text-amber-800">Observación: {o.comentario_revision}</span>}
                        <span className="mt-0.5 block text-xs text-text-subtle">Semana {o.semana} · límite {formatDate(o.fechaFin)}{o.vencido ? " · vencido" : ""}</span>
                      </span>
                      <span className="ds-btn ds-btn-secondary ds-btn-sm shrink-0">Corregir</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CheckCircle2} title="No tienes evidencias por corregir">Cuando coordinación observe un entregable, aparecerá aquí con su comentario.</EmptyState>
            )}
          </Panel>

          <Panel title="Próximas entregas" action={proximo ? <StatusPill tone="signal" dot={false}>Siguiente: S{proximo.semana} · {formatDate(proximo.fechaFin)}</StatusPill> : undefined} bodyClassName="">
            {upcoming.length === 0 && !loading ? (
              <EmptyState icon={CalendarDays} title="Sin entregas próximas">No hay entregables cargados para las próximas semanas.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 5).map((d) => (
                  <li key={`${d.entregable_id ?? "p"}-${d.id}`}>
                    <button type="button" onClick={() => navigate(`/docente/matriz?plantilla=${d.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2">
                      <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-100 leading-none text-text-muted">
                        <span className="text-[0.625rem]">Sem</span>
                        <span className="text-sm tabular-nums" style={{ fontWeight: 650 }}>{d.semana}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text" style={{ fontWeight: 550 }}>{d.entregable}</span>
                        <span className="block truncate text-xs text-text-subtle">{d.iniciativa} · {formatDate(d.fechaInicio)} – {formatDate(d.fechaFin)}</span>
                      </span>
                      <EstadoChip estado={d.estado} vencido={d.vencido} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Avance por mes" description="Reportado frente a lo esperado a hoy" action={<button type="button" onClick={() => navigate("/docente/matriz")} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">Ver matriz</button>}>
          {byMonth.length === 0 && !loading ? (
            <EmptyState title="Sin entregables calendarizados">Tu matriz aún no tiene entregables con fecha.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {byMonth.map((m) => {
                const completo = m.pct === 100 && m.total > 0;
                return (
                  <li key={m.month}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm text-text" style={{ fontWeight: 600 }}>
                        {m.month}
                        {m.active && m.total > 0 && <StatusPill tone="signal" dot={false}>En curso</StatusPill>}
                        {completo && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Mes completo" />}
                      </p>
                      <p className="text-sm tabular-nums text-text" style={{ fontWeight: 650 }}>{m.pct}%</p>
                    </div>
                    <ProgressBar value={m.pct} marker={m.expectedPct} tone={completo ? "success" : m.active ? "brand" : m.pct > 0 ? "warning" : "neutral"} label={`${m.month}: ${m.pct}% reportado`} />
                    <p className="mt-1 text-xs text-text-subtle">{m.done}/{m.total} reportados · {m.aprobados ?? 0} aprobados · esperado {Math.round(m.expectedPct)}%</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Progreso semanal"
        description="Acumulado por semana: reportado, aprobado y esperado"
        action={<ChartLegend items={[{ label: "Reportado", color: C.reportado }, { label: "Aprobado", color: C.aprobado }, { label: "Esperado", color: C.esperado, dashed: true }]} />}
      >
        {semanal.length > 0 ? (
          <div role="img" aria-label="Avance semanal acumulado: reportado, aprobado y esperado">
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={semanal} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="tdAvance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.reportado} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C.reportado} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="semana" tickFormatter={(v) => `S${v}`} tick={axisTick(C)} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick(C)} unit="%" domain={[0, 100]} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="%" labelPrefix="Semana " />} cursor={{ stroke: C.grid }} />
                {semanaHoy != null && <ReferenceLine x={semanaHoy} stroke={C.signal} strokeDasharray="4 3" label={{ value: "Hoy", position: "insideTopRight", fontSize: 11, fill: C.signal }} />}
                <Area type="monotone" dataKey="esperado" name="Esperado" stroke={C.esperado} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} />
                <Area type="monotone" dataKey="avance" name="Reportado" stroke={C.reportado} strokeWidth={2} fill="url(#tdAvance)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="aprobado" name="Aprobado" stroke={C.aprobado} strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={FileText} title="Aún no hay avance semanal">Se mostrará cuando envíes tus primeros entregables.</EmptyState>
        )}
      </Panel>

      <Panel
        title="Entregables programados"
        description={`${filas.length} de ${activities.length} · proyectos, actividades y convenios`}
        bodyClassName=""
        action={<button type="button" onClick={() => navigate("/docente/matriz")} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">Abrir la matriz completa <ArrowRight className="h-3.5 w-3.5" /></button>}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Segmented<Filtro>
            label="Filtrar entregables"
            value={filtro}
            onChange={setFiltro}
            items={[
              { id: "todos", label: "Todos", count: activities.length },
              { id: "pendientes", label: "Pendientes", count: cuenta((r) => r.estado === "no_iniciado" || r.estado === "borrador") },
              { id: "observados", label: "Observados", count: cuenta((r) => r.estado === "observado"), tone: "warning" },
              { id: "vencidos", label: "Vencidos", count: cuenta((r) => r.vencido === true), tone: "danger" },
              { id: "aprobados", label: "Aprobados", count: cuenta((r) => r.estado === "aprobado"), tone: "success" },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar entregable o iniciativa" aria-label="Buscar entregable" className="ds-input !pl-9" />
          </div>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="ds-table min-w-[820px]">
            <thead>
              <tr>
                <th>Entregable</th>
                <th>Iniciativa</th>
                <th>Periodo de entrega</th>
                <th>Estado</th>
                <th className="text-right"><span className="sr-only">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={FileText} title={loading ? "Cargando entregables…" : "Sin entregables para mostrar"}>{loading ? undefined : activities.length === 0 ? "No hay entregables programados para tu grupo de matriz." : "Prueba con otro filtro o con otra búsqueda."}</EmptyState>
                  </td>
                </tr>
              )}
              {filas.map((row, i) => (
                <tr key={`${i}-${row.entregableId ?? "p"}-${row.id}`}>
                  <td className="max-w-[360px]">
                    <p className="line-clamp-2 text-text" style={{ fontWeight: 550 }}>{row.deliverable}</p>
                    <p className="text-xs capitalize text-text-subtle">{row.category.replaceAll("_", " ")}</p>
                  </td>
                  <td className="max-w-[260px]">
                    <p className="line-clamp-2 text-text-muted">{row.initiative}</p>
                    <p className="text-xs capitalize text-text-subtle">{row.initiativeType}</p>
                  </td>
                  <td className="whitespace-nowrap text-text-muted">
                    {formatDate(row.startDate)} <span className="text-text-subtle">→</span> {formatDate(row.deadline)}
                  </td>
                  <td><EstadoChip estado={row.estado} vencido={row.vencido} /></td>
                  <td className="text-right">
                    <button type="button" onClick={() => navigate(`/docente/matriz?plantilla=${row.id}`)} className="ds-btn ds-btn-secondary ds-btn-sm">
                      {row.estado === "observado" ? "Corregir" : row.estado === "aprobado" || row.estado === "enviado" ? "Ver" : "Reportar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
