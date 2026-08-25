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
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Badge, type BadgeVariant } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

const API_BASE_URL = API_BASE;
const MONTH_COLOR_CLASSES = [
  "bg-violet-600",
  "bg-[#1e3a8a]",
  "bg-teal-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
];

type DashboardStats = {
  total: number;
  completed: number;
  pct: number;
  expectedPct: number;
  compliancePct: number;
  due: number;
  gap: number;
};
type StatsByMonth = {
  month: string;
  total: number;
  done: number;
  pct: number;
  expectedPct: number;
  active: boolean;
};
type StatsByWeek = {
  semana: number;
  total: number;
  done: number;
  pct: number;
  expectedPct: number;
};
type UpcomingItem = {
  id: number;
  iniciativa: string;
  entregable: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  semana: number;
};
type ActivityRow = {
  id: number;
  entregableId: number | null;
  category: string;
  deliverable: string;
  initiative: string;
  initiativeType: string;
  startDate: string | null;
  deadline: string | null;
  status: BadgeVariant;
  statusLabel: string;
};

const EMPTY_STATS: DashboardStats = {
  total: 0,
  completed: 0,
  pct: 0,
  expectedPct: 0,
  compliancePct: 100,
  due: 0,
  gap: 0,
};

const formatDate = (value: string | null) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function computeStatusFromDate(fechaFin: string | null): "no_iniciado" | "semana_en_curso" | "vencido" | "entrega_a_tiempo" {
  if (!fechaFin) return "no_iniciado";
  const fin = new Date(fechaFin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  fin.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((fin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "vencido";
  if (diffDays <= 7) return "semana_en_curso";
  return "no_iniciado";
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [docenteId, setDocenteId] = useState<number | null>(null);
  const [projectsCount, setProjectsCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [byMonth, setByMonth] = useState<StatsByMonth[]>([]);
  const [byWeek, setByWeek] = useState<StatsByWeek[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = currentUser?.id ?? null;
    setDocenteId(id);

    if (!id) {
      setProjectsCount(0);
      setStats(EMPTY_STATS);
      setByMonth([]);
      setByWeek([]);
      setUpcoming([]);
      setActivities([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [resDashboard, resStats] = await Promise.all([
          fetch(`${API_BASE_URL}/docente/${id}/dashboard`),
          fetch(`${API_BASE_URL}/docente/${id}/dashboard-stats`),
        ]);

        if (resDashboard.ok) {
          const data = await resDashboard.json();
          const proyectos = (data.proyectos || []) as any[];
          setProjectsCount(proyectos.length);
        } else {
          setProjectsCount(0);
        }

        if (resStats.ok) {
          const data = await resStats.json();
          setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
          setByMonth(Array.isArray(data.byMonth) ? data.byMonth : []);
          setByWeek(Array.isArray(data.byWeek) ? data.byWeek : []);
          setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
          setActivities(Array.isArray(data.activities) ? data.activities : []);
        } else {
          setStats(EMPTY_STATS);
          setByMonth([]);
          setByWeek([]);
          setUpcoming([]);
          setActivities([]);
        }
      } catch (err) {
        console.error(err);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setProjectsCount(0);
        setStats(EMPTY_STATS);
        setByMonth([]);
        setByWeek([]);
        setUpcoming([]);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser?.id]);

  const safeStats = stats ?? EMPTY_STATS;
  const complianceColor =
    safeStats.compliancePct >= 100
      ? "#10b981"
      : safeStats.compliancePct >= 90
      ? "#1d4ed8"
      : safeStats.compliancePct >= 75
      ? "#f59e0b"
      : "#ef4444";

  const weeklyData = byWeek.map((row) => ({
    semana: `S${row.semana}`,
    avance: row.pct,
    esperado: row.expectedPct,
  }));

  const statCards = [
    {
      label: "Avance real",
      value: `${safeStats.pct}%`,
      sub: `${safeStats.completed} de ${safeStats.total} entregables`,
      icon: TrendingUp,
      iconBg: "bg-[#1d4ed8]",
    },
    {
      label: "Avance esperado",
      value: `${safeStats.expectedPct}%`,
      sub: `${safeStats.due} entregables exigibles a hoy`,
      icon: Clock,
      iconBg: "bg-amber-500",
    },
    {
      label: "Cumplimiento esperado",
      value: `${Math.round(safeStats.compliancePct)}%`,
      sub:
        safeStats.gap >= 0
          ? `${safeStats.gap} puntos por encima de lo esperado`
          : `${Math.abs(safeStats.gap)} puntos por debajo de lo esperado`,
      icon: CheckCircle2,
      iconBg: safeStats.gap >= 0 ? "bg-emerald-500" : "bg-red-500",
    },
    {
      label: "Proyectos activos",
      value: projectsCount != null ? String(projectsCount) : "—",
      sub: "Proyectos asignados este ciclo",
      icon: FolderOpen,
      iconBg: "bg-purple-500",
    },
  ];

  const hasVencidos = activities.some((a) => a.statusLabel === "Retrasado");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Mi Dashboard</h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            {loading ? "Cargando..." : "Avance según tus proyectos asignados"}
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
            Reportar entregable
          </button>
        </div>
      </div>

      {/* Stat Cards */}
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
              <div className={`w-10 h-10 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Avance por mes */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-800">Avance por mes</h3>
            <p className="text-gray-500 text-xs mt-0.5">Entregables completados según la matriz de seguimiento</p>
          </div>
          <button
            onClick={() => navigate("/docente/matriz")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver matriz <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {byMonth.map((m, index) => {
            const isDone = m.pct === 100 && m.total > 0;
            const isActive = m.active;
            const colorClass = MONTH_COLOR_CLASSES[index % MONTH_COLOR_CLASSES.length];
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
                    {m.done}/{m.total} entregables
                  </p>
                  <p className="text-gray-500 text-[11px] mt-1">
                    Esperado a hoy: {Math.round(m.expectedPct)}%
                  </p>
                </div>
                <div className="mt-3 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${m.pct}%`,
                      backgroundColor: isDone ? "#10b981" : isActive ? "#1d4ed8" : m.pct > 0 ? "#f59e0b" : "#e5e7eb",
                    }}
                  />
                </div>
              </div>
            );
          })}
          {!loading && byMonth.length === 0 && (
            <p className="col-span-full text-sm text-gray-400 text-center py-6">
              No hay entregables calendarizados para mostrar.
            </p>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
              Avance real frente al esperado
            </p>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="text-[#1d4ed8]">Real {safeStats.pct}%</span>
              <span className="text-amber-600">Esperado {safeStats.expectedPct}%</span>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${safeStats.pct}%`, backgroundColor: complianceColor }}
            />
          </div>
          {byMonth.length > 0 && (
            <div className="flex justify-between gap-2 text-xs text-gray-400 mt-1">
              {byMonth.map((m) => <span key={m.month}>{m.month}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Chart + Upcoming */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800">Progreso Semanal</h3>
              <p className="text-gray-500 text-xs mt-0.5">Avance acumulado por semana</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full ${hasVencidos ? "text-red-600 bg-red-50" : "text-emerald-600 bg-emerald-50"}`} style={{ fontWeight: 500 }}>
              {hasVencidos ? "Con vencimientos" : "Sin vencimientos"}
            </span>
          </div>
          {weeklyData.length > 0 ? <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="tdColorAvance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} unit="%" />
              <Tooltip formatter={(v) => [`${v}%`, "Avance"]} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="esperado"
                name="Avance esperado"
                stroke="#d97706"
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="avance"
                name="Avance real"
                stroke="#1d4ed8"
                strokeWidth={2}
                fill="url(#tdColorAvance)"
              />
            </AreaChart>
          </ResponsiveContainer> : (
            <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
              No hay avance semanal registrado.
            </div>
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
            {upcoming.length === 0 && !loading && (
              <p className="text-xs text-gray-400">No hay entregas próximas cargadas.</p>
            )}
            {upcoming.slice(0, 5).map((d) => {
              const status = computeStatusFromDate(d.fechaFin);
              return (
                <div
                  key={d.id}
                  className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate("/docente/matriz")}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-xs text-gray-500">S{d.semana}</span>
                  </div>
                  <p className="text-gray-700 text-xs leading-snug line-clamp-2" style={{ fontWeight: 500 }}>
                    {d.entregable}
                  </p>
                  <p className="text-gray-400 text-[11px] mt-1 line-clamp-1">
                    {d.iniciativa}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(d.fechaInicio)} – {formatDate(d.fechaFin)}
                    </span>
                    <StatusBadge status={status} pulse />
                  </div>
                </div>
              );
            })}
          </div>
          {hasVencidos && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700" style={{ fontWeight: 600 }}>Entregas vencidas</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {activities.filter((a) => a.statusLabel === "Retrasado").length} entregable(s) sin presentar
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Listado cronológico de entregables */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-gray-800">Entregables programados</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Listado cronológico de proyectos, actividades y convenios
            </p>
          </div>
          <button
            onClick={() => navigate("/docente/matriz")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Categoría</th>
                <th className="text-left px-6 py-3">Entregable</th>
                <th className="text-left px-6 py-3">Iniciativa</th>
                <th className="text-left px-6 py-3">Periodo de entrega</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activities.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No hay entregables programados para tu grupo matriz.
                  </td>
                </tr>
              )}
              {activities.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>
                    <div className="max-w-[150px] capitalize">{row.category.replaceAll("_", " ")}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="max-w-xs line-clamp-2">{row.deliverable}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    <div className="max-w-xs line-clamp-2 font-medium">{row.initiative}</div>
                    <span className="text-[11px] text-gray-400 capitalize">
                      {row.initiativeType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                    <div>{formatDate(row.startDate)}</div>
                    <div className="text-xs text-gray-400">hasta {formatDate(row.deadline)}</div>
                  </td>
                  <td className="px-6 py-4">
                      <Badge variant={row.status} label={row.statusLabel} />
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate("/docente/matriz")}
                      className="text-[#1d4ed8] hover:underline text-xs"
                      style={{ fontWeight: 500 }}
                    >
                      Ver entregable
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
