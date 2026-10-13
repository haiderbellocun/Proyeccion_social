import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  FolderOpen,
  Plus,
  ArrowRight,
  Calendar,
  TableProperties,
  AlertCircle,
  MessageSquareWarning,
  Send,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  MONTH_COLORS,
  estadoEntregableConfig,
  etiquetaSemana,
  semaforoConfig,
  type EstadoEntregable,
  type IndicadoresSeguimiento,
  type MonthName,
  type SemanaActual,
} from "../data/matrizConstants";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";
import { formatFecha } from "../lib/fechas";

const API_BASE_URL = API_BASE;

type StatsByMonth = {
  month: string;
  total: number;
  done: number;
  aprobados: number;
  pct: number;
  pct_aprobado: number;
  pct_esperado: number;
};
type ItemLista = {
  id: number;
  plantilla_id: number | null;
  entregable_id: number | null;
  proyecto: string;
  entregable: string;
  fechaFin: string | null;
  semana: number;
  estado: EstadoEntregable;
  vencido: boolean;
  comentario_revision: string | null;
};
type ActivityRow = {
  id: number;
  plantilla_id: number | null;
  entregable_id: number | null;
  project: string;
  activity: string;
  deadline: string;
  fecha_fin: string | null;
  estado: EstadoEntregable;
  vencido: boolean;
};
type SemanaPunto = {
  semana_numero: number;
  acumulado_reportado_pct: number;
  acumulado_aprobado_pct: number;
  acumulado_esperado_pct: number;
};
type DashboardStats = {
  indicadores: IndicadoresSeguimiento | null;
  conteos: { pendientes: number; observados: number; vencidos: number; en_revision: number };
  semana: SemanaActual | null;
  byMonth: StatsByMonth[];
  porSemana: SemanaPunto[];
  upcoming: ItemLista[];
  proximo: ItemLista | null;
  pendientes: ItemLista[];
  observados: ItemLista[];
  vencidos: ItemLista[];
  activities: ActivityRow[];
};

const VACIO: DashboardStats = {
  indicadores: null,
  conteos: { pendientes: 0, observados: 0, vencidos: 0, en_revision: 0 },
  semana: null,
  byMonth: [],
  porSemana: [],
  upcoming: [],
  proximo: null,
  pendientes: [],
  observados: [],
  vencidos: [],
  activities: [],
};

const NOMBRE_MES = (iso?: string) =>
  iso
    ? new Date(`${iso}T12:00:00Z`)
        .toLocaleDateString("es-CO", { month: "long", timeZone: "UTC" })
        .replace(/^./, (c) => c.toUpperCase())
    : "";

function EstadoChip({ estado, vencido }: { estado: EstadoEntregable; vencido: boolean }) {
  const cfg = estadoEntregableConfig[estado];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${cfg.badge}`} style={{ fontWeight: 500 }}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
      {vencido && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700" style={{ fontWeight: 500 }}>
          Vencido
        </span>
      )}
    </span>
  );
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [projectsCount, setProjectsCount] = useState<number | null>(null);
  const [data, setData] = useState<DashboardStats>(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = currentUser?.id ?? null;

    if (!id) {
      setProjectsCount(0);
      setData(VACIO);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setError(null);
        const [resDashboard, resStats] = await Promise.all([
          fetch(`${API_BASE_URL}/docente/${id}/dashboard`),
          fetch(`${API_BASE_URL}/docente/${id}/dashboard-stats`),
        ]);

        if (resDashboard.ok) {
          const d = await resDashboard.json();
          setProjectsCount(((d.proyectos || []) as unknown[]).length);
        } else {
          setProjectsCount(0);
        }

        if (resStats.ok) {
          const d = await resStats.json();
          setData({
            indicadores: d.indicadores ?? null,
            conteos: d.conteos ?? VACIO.conteos,
            semana: d.semana_actual ?? null,
            byMonth: Array.isArray(d.byMonth) ? d.byMonth : [],
            porSemana: Array.isArray(d.por_semana) ? d.por_semana : [],
            upcoming: Array.isArray(d.upcoming) ? d.upcoming : [],
            proximo: d.proximo_entregable ?? null,
            pendientes: Array.isArray(d.pendientes) ? d.pendientes : [],
            observados: Array.isArray(d.observados) ? d.observados : [],
            vencidos: Array.isArray(d.vencidos) ? d.vencidos : [],
            activities: Array.isArray(d.activities) ? d.activities : [],
          });
        } else {
          setData(VACIO);
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
        setProjectsCount(0);
        setData(VACIO);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser?.id]);

  const ind = data.indicadores;
  const semaforo = ind ? semaforoConfig[ind.semaforo] : null;
  const mesActual = NOMBRE_MES(data.semana?.fecha_inicio_semana);
  const colorAprobado = "#10b981";

  const statCards = [
    {
      label: "Avance reportado",
      value: ind ? `${ind.pct_reportado}%` : "—",
      sub: ind ? `${ind.reportados} de ${ind.total} enviados a revisión o aprobados` : "Sin matriz asignada",
      icon: Send,
      iconBg: "bg-[#1d4ed8]",
    },
    {
      label: "Avance aprobado",
      value: ind ? `${ind.pct_aprobado}%` : "—",
      sub: ind ? `${ind.aprobados} de ${ind.total} aprobados por el administrador` : "Sin matriz asignada",
      icon: CheckCircle2,
      iconBg: "bg-emerald-500",
    },
    {
      label: "Avance esperado",
      value: ind ? `${ind.pct_esperado}%` : "—",
      sub: ind
        ? `${ind.esperado} entregables con fecha límite hasta hoy (brecha ${ind.brecha > 0 ? "+" : ""}${ind.brecha})`
        : "Sin matriz asignada",
      icon: TrendingUp,
      iconBg: "bg-amber-500",
    },
    {
      label: "Semana actual",
      value: data.semana?.numero != null ? `S${data.semana.numero}` : "—",
      sub:
        data.semana?.estado === "en_curso"
          ? `${etiquetaSemana(data.semana)} · ${formatFecha(data.semana.fecha_inicio_semana)} – ${formatFecha(data.semana.fecha_fin_semana)}`
          : etiquetaSemana(data.semana),
      icon: Calendar,
      iconBg: "bg-purple-500",
    },
  ];

  const contadores = [
    { label: "Pendientes", value: data.conteos.pendientes, tone: "text-gray-800", icon: Clock },
    { label: "Observados", value: data.conteos.observados, tone: "text-amber-700", icon: MessageSquareWarning },
    { label: "Vencidos", value: data.conteos.vencidos, tone: "text-red-700", icon: AlertCircle },
    { label: "En revisión", value: data.conteos.en_revision, tone: "text-blue-700", icon: Send },
  ];

  const weeklyData = data.porSemana.map((s) => ({
    semana: `S${s.semana_numero}`,
    Reportado: s.acumulado_reportado_pct,
    Aprobado: s.acumulado_aprobado_pct,
    Esperado: s.acumulado_esperado_pct,
  }));

  const monthsToShow = data.byMonth;

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Mi Dashboard</h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            {loading ? "Cargando..." : `${etiquetaSemana(data.semana)} · avance según tu matriz de seguimiento`}
            {semaforo && !loading && (
              <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${semaforo.badge}`} style={{ fontWeight: 600 }}>
                <span className={`w-1.5 h-1.5 rounded-full ${semaforo.dot}`} />
                {semaforo.label}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/docente/matriz")}
            className="flex items-center gap-2 border border-[#1e3a8a] text-[#1e3a8a] hover:bg-blue-50 px-3 py-2 rounded-lg text-sm transition-colors hidden sm:flex"
            style={{ fontWeight: 500 }}
          >
            <TableProperties className="w-4 h-4" />
            Ver Matriz
          </button>
          <button
            onClick={() => navigate("/docente/reportar")}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Reportar Avance
          </button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-500 text-sm">{card.label}</p>
                <p className="text-gray-900 mt-1" style={{ fontSize: 28, fontWeight: 700 }}>
                  {card.value}
                </p>
                <p className="text-gray-400 text-xs mt-1">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 ${card.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Estado de la gestión */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {contadores.map((c) => (
          <div key={c.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
            <c.icon className={`w-5 h-5 ${c.tone}`} />
            <div>
              <p className={`text-xl ${c.tone}`} style={{ fontWeight: 700 }}>
                {c.value}
              </p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          </div>
        ))}
        <div className="col-span-2 xl:col-span-1 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500">Próxima entrega</p>
          {data.proximo ? (
            <>
              <p className="text-sm text-gray-800 line-clamp-2 mt-0.5" style={{ fontWeight: 600 }}>
                {data.proximo.entregable}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                S{data.proximo.semana} · {formatFecha(data.proximo.fechaFin)}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-0.5">Sin entregas próximas</p>
          )}
        </div>
      </div>

      {/* Evidencias pendientes de corrección */}
      {data.observados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareWarning className="w-4 h-4 text-amber-700" />
            <h3 className="text-amber-900">Evidencias pendientes de corrección</h3>
          </div>
          <div className="space-y-2">
            {data.observados.slice(0, 5).map((o) => (
              <div
                key={`${o.plantilla_id ?? "e"}-${o.id}`}
                className="bg-white rounded-lg border border-amber-100 p-3 cursor-pointer hover:bg-amber-50/40"
                onClick={() => navigate("/docente/matriz")}
              >
                <p className="text-sm text-gray-800" style={{ fontWeight: 600 }}>
                  {o.entregable}
                </p>
                {o.comentario_revision && (
                  <p className="text-xs text-amber-800 mt-1">Observación: {o.comentario_revision}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Semana {o.semana} · límite {formatFecha(o.fechaFin)}
                  {o.vencido ? " · vencido" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Avance por mes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-800">Avance por mes</h3>
            <p className="text-gray-500 text-xs mt-0.5">Entregables reportados y aprobados según la matriz de seguimiento</p>
          </div>
          <button
            onClick={() => navigate("/docente/matriz")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver matriz <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {monthsToShow.length === 0 && !loading && (
          <p className="text-xs text-gray-400">No tienes entregables programados en la matriz.</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {monthsToShow.map((m) => {
            const isDone = m.pct_aprobado === 100 && m.total > 0;
            const isActive = m.month === mesActual;
            const colorClass = MONTH_COLORS[m.month as MonthName] || "bg-gray-500";
            return (
              <div
                key={m.month}
                className={`rounded-xl p-4 border-2 transition-all cursor-pointer ${
                  isActive ? "border-[#1e3a8a] bg-blue-50/40" : isDone ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100"
                }`}
                onClick={() => navigate("/docente/matriz")}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full text-white ${colorClass}`} style={{ fontWeight: 600 }}>
                    {m.month}
                  </span>
                  {isActive && m.total > 0 && (
                    <span className="text-xs text-[#1e3a8a] bg-blue-100 px-1.5 py-0.5 rounded" style={{ fontWeight: 500 }}>
                      En curso
                    </span>
                  )}
                  {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </div>
                <div className="mt-2">
                  <p className="text-gray-900" style={{ fontSize: 22, fontWeight: 800 }}>
                    {m.pct}%
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {m.done}/{m.total} reportados · {m.aprobados} aprobados
                  </p>
                </div>
                <div className="mt-3 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-blue-200" style={{ width: `${m.pct}%` }} />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${m.pct_aprobado}%`, backgroundColor: colorAprobado }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {ind && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
                Avance del semestre
              </p>
              <p className="text-xs text-gray-500">
                <span className="text-emerald-600" style={{ fontWeight: 700 }}>{ind.pct_aprobado}% aprobado</span>
                {" · "}
                <span className="text-blue-600" style={{ fontWeight: 700 }}>{ind.pct_reportado}% reportado</span>
                {" · "}
                <span className="text-gray-600" style={{ fontWeight: 700 }}>{ind.pct_esperado}% esperado</span>
              </p>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-blue-200 rounded-full" style={{ width: `${ind.pct_reportado}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${ind.pct_aprobado}%`, backgroundColor: colorAprobado }} />
              <div className="absolute inset-y-0 w-0.5 bg-gray-700" style={{ left: `${Math.min(99.5, ind.pct_esperado)}%` }} title="Avance esperado a hoy" />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{data.semana ? formatFecha(data.semana.fecha_inicio_semestre) : "Inicio"}</span>
              <span>La marca oscura indica el avance esperado a hoy</span>
              <span>{data.semana ? formatFecha(data.semana.fecha_fin_semestre) : "Cierre"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart + Upcoming */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800">Progreso Semanal</h3>
              <p className="text-gray-500 text-xs mt-0.5">Acumulado por semana de la matriz: reportado, aprobado y esperado</p>
            </div>
          </div>
          {weeklyData.length === 0 ? (
            <p className="text-xs text-gray-400 py-10 text-center">Sin entregables programados por semana.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v, name) => [`${v}%`, String(name)]} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Esperado" stroke="#6b7280" strokeDasharray="4 3" strokeWidth={2} fill="none" />
                <Area type="monotone" dataKey="Reportado" stroke="#1d4ed8" strokeWidth={2} fill="#1d4ed8" fillOpacity={0.12} />
                <Area type="monotone" dataKey="Aprobado" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-800">Próximas entregas</h3>
            <button onClick={() => navigate("/docente/matriz")} className="text-xs text-[#1d4ed8] hover:underline">
              Ver matriz
            </button>
          </div>
          <div className="space-y-2.5">
            {data.upcoming.length === 0 && !loading && (
              <p className="text-xs text-gray-400">No tienes entregas pendientes.</p>
            )}
            {data.upcoming.slice(0, 5).map((d) => (
              <div
                key={`${d.plantilla_id ?? "e"}-${d.id}`}
                className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => navigate("/docente/matriz")}
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-xs text-gray-500">S{d.semana}</span>
                </div>
                <p className="text-gray-700 text-xs leading-snug line-clamp-2" style={{ fontWeight: 500 }}>
                  {d.entregable}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatFecha(d.fechaFin, { day: "2-digit", month: "short" })}
                  </span>
                  <EstadoChip estado={d.estado} vencido={d.vencido} />
                </div>
              </div>
            ))}
          </div>
          {data.vencidos.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700" style={{ fontWeight: 600 }}>Entregas vencidas</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {data.conteos.vencidos} entregable(s) con fecha límite vencida sin presentar o corregir
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activities table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800">Actividades Programadas</h3>
          <button
            onClick={() => navigate("/docente/proyectos")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Proyecto</th>
                <th className="text-left px-6 py-3">Actividad</th>
                <th className="text-left px-6 py-3">Fecha Límite</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.activities.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No hay actividades cargadas. Asigna proyectos y entregables en administración.
                  </td>
                </tr>
              )}
              {data.activities.map((row, i) => (
                <tr key={`${i}-${row.plantilla_id ?? "e"}-${row.id}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>
                    <div className="max-w-xs truncate">{row.project}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="max-w-xs truncate">{row.activity}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{row.deadline}</td>
                  <td className="px-6 py-4">
                    <EstadoChip estado={row.estado} vencido={row.vencido} />
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate("/docente/matriz")}
                      className="text-[#1d4ed8] hover:underline text-xs"
                      style={{ fontWeight: 500 }}
                    >
                      {row.estado === "observado" ? "Corregir" : row.estado === "aprobado" || row.estado === "enviado" ? "Ver" : "Reportar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proyectos asignados */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <FolderOpen className="w-3.5 h-3.5" />
        {projectsCount != null ? `${projectsCount} iniciativa(s) asignada(s)` : ""}
      </div>
    </div>
  );
}
