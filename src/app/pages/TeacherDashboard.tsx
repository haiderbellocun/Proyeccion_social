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
import { Badge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { CategoryTag } from "../components/CategoryTag";
import {
  getComplianceStats,
  deliverables,
  computeStatus,
  MONTHS,
  MONTH_COLORS,
  type MonthName,
} from "../data/matrizData";

const weeklyData = [
  { semana: "S1", avance: 15 },
  { semana: "S2", avance: 28 },
  { semana: "S3", avance: 35 },
  { semana: "S4", avance: 52 },
  { semana: "S5", avance: 61 },
  { semana: "S6", avance: 74 },
  { semana: "S7", avance: 80 },
  { semana: "S8", avance: 88 },
];

const activities = [
  { id: 1, project: "Alfabetización Digital - Comunidad Norte", activity: "Taller de uso de herramientas digitales", deadline: "15 Mar 2024", status: "pending" as const },
  { id: 2, project: "Convenio UGEL - Capacitación Docente", activity: "Sesión de capacitación metodológica", deadline: "18 Mar 2024", status: "review" as const },
  { id: 3, project: "Proyecto Huertos Urbanos", activity: "Diagnóstico inicial del terreno", deadline: "10 Mar 2024", status: "approved" as const },
  { id: 4, project: "Salud Comunitaria - Zona Rural", activity: "Jornada de sensibilización", deadline: "22 Mar 2024", status: "delayed" as const },
];

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const stats = getComplianceStats();

  // Próximas entregas de la matriz (no iniciadas / en curso)
  const upcoming = deliverables
    .filter((d) => {
      const s = computeStatus(d.scheduledDate, d.actualDate);
      return s === "semana_en_curso" || s === "no_iniciado";
    })
    .slice(0, 5);

  // Compliance color
  const complianceColor =
    stats.pct >= 90 ? "#10b981" : stats.pct >= 80 ? "#1d4ed8" : stats.pct >= 60 ? "#f59e0b" : "#ef4444";

  const statCards = [
    { label: "Cumplimiento general", value: `${stats.pct}%`, sub: `${stats.completed} de ${stats.total} entregables`, icon: TrendingUp, iconBg: "bg-[#1d4ed8]" },
    { label: "Entregables completados", value: `${stats.completed}`, sub: "Con evidencia registrada", icon: CheckCircle2, iconBg: "bg-emerald-500" },
    { label: "Pendientes / En curso", value: `${stats.total - stats.completed}`, sub: "Semana 6 activa", icon: Clock, iconBg: "bg-amber-500" },
    { label: "Proyectos activos", value: "3", sub: "1 convenio, 2 proyectos", icon: FolderOpen, iconBg: "bg-purple-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Mi Dashboard</h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            Semana 6 en curso — Ciclo 2024-II
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

      {/* ── AVANCE POR MES ── */}
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
          {stats.byMonth.map((m) => {
            const isDone = m.pct === 100;
            const isActive = m.month === "Marzo";
            return (
              <div
                key={m.month}
                className={`rounded-xl p-4 border-2 transition-all cursor-pointer ${
                  isActive
                    ? "border-[#1e3a8a] bg-blue-50/40"
                    : isDone
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-gray-100"
                }`}
                onClick={() => navigate("/docente/matriz")}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full text-white ${MONTH_COLORS[m.month as MonthName]}`}
                    style={{ fontWeight: 600 }}
                  >
                    {m.month}
                  </span>
                  {isActive && (
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
        </div>

        {/* Cumulative bar */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
              Avance acumulado del ciclo
            </p>
            <p className="text-sm" style={{ fontWeight: 700, color: complianceColor }}>
              {stats.pct}%
            </p>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${stats.pct}%`, backgroundColor: complianceColor }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Inicio</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Abr</span>
            <span>Mayo · Cierre</span>
          </div>
        </div>
      </div>

      {/* Chart + Upcoming */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="xl:col-span-2 bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800">Progreso Semanal</h3>
              <p className="text-gray-500 text-xs mt-0.5">Avance acumulado por semana</p>
            </div>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full" style={{ fontWeight: 500 }}>
              ↑ En tiempo
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
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
              <Tooltip
                formatter={(v) => [`${v}%`, "Avance"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="avance" stroke="#1d4ed8" strokeWidth={2} fill="url(#tdColorAvance)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming deliverables from matrix */}
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-800">Próximas entregas</h3>
            <button
              onClick={() => navigate("/docente/matriz")}
              className="text-xs text-[#1d4ed8] hover:underline"
            >
              Ver matriz
            </button>
          </div>

          <div className="space-y-2.5">
            {upcoming.map((d) => {
              const status = computeStatus(d.scheduledDate, d.actualDate);
              return (
                <div
                  key={d.id}
                  className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate("/docente/matriz")}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <CategoryTag category={d.category} compact />
                    <span className="text-xs text-gray-400 ml-auto shrink-0">S{d.week}</span>
                  </div>
                  <p className="text-gray-700 text-xs leading-snug line-clamp-2" style={{ fontWeight: 500 }}>
                    {d.deliverable}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(d.scheduledDate + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                    </span>
                    <StatusBadge status={status} pulse />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Alert if vencido */}
          {deliverables.some((d) => computeStatus(d.scheduledDate, d.actualDate) === "vencido") && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-700" style={{ fontWeight: 600 }}>Entregas vencidas</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {deliverables.filter((d) => computeStatus(d.scheduledDate, d.actualDate) === "vencido").length} entregable(s) sin presentar
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
              {activities.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>
                    <div className="max-w-xs truncate">{row.project}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="max-w-xs truncate">{row.activity}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{row.deadline}</td>
                  <td className="px-6 py-4">
                    <Badge variant={row.status} />
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate("/docente/reportar")}
                      className="text-[#1d4ed8] hover:underline text-xs"
                      style={{ fontWeight: 500 }}
                    >
                      Reportar
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