import { Download, Filter, TrendingUp, Users, FileCheck, Award, Building2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { Badge } from "../components/Badge";

const weeklyData = [
  { semana: "S1", enviados: 12, aprobados: 10, pendientes: 2 },
  { semana: "S2", enviados: 18, aprobados: 15, pendientes: 3 },
  { semana: "S3", enviados: 20, aprobados: 18, pendientes: 2 },
  { semana: "S4", enviados: 22, aprobados: 19, pendientes: 3 },
  { semana: "S5", enviados: 25, aprobados: 22, pendientes: 3 },
  { semana: "S6", enviados: 28, aprobados: 24, pendientes: 4 },
  { semana: "S7", enviados: 30, aprobados: 26, pendientes: 4 },
  { semana: "S8", enviados: 30, aprobados: 22, pendientes: 8 },
];

const teacherCompliance = [
  { name: "Mg. M. Rodríguez", cumplimiento: 88, reportes: 8 },
  { name: "Dr. C. Mendoza", cumplimiento: 45, reportes: 5 },
  { name: "Mg. A. Torres", cumplimiento: 72, reportes: 7 },
  { name: "Ing. L. Paredes", cumplimiento: 30, reportes: 3 },
  { name: "Lic. S. Vargas", cumplimiento: 95, reportes: 8 },
  { name: "Dr. R. Jiménez", cumplimiento: 60, reportes: 6 },
];

const radarData = [
  { subject: "Ing. Sistemas", A: 92 },
  { subject: "Enfermería", A: 78 },
  { subject: "Educación", A: 85 },
  { subject: "Agronomía", A: 68 },
  { subject: "Psicología", A: 90 },
  { subject: "Derecho", A: 74 },
];

const topPerformers = [
  { name: "Lic. Sofía Vargas", program: "Psicología", score: 95, status: "approved" as const },
  { name: "Mg. María Rodríguez", program: "Ing. Sistemas", score: 88, status: "approved" as const },
  { name: "Mg. Ana Torres", program: "Educación", score: 72, status: "approved" as const },
];

const schoolsData = [
  {
    school: "Escuela de Ingeniería de Sistemas",
    programs: ["Ing. de Sistemas", "Ing. Software"],
    teachers: 12, sent: 11, compliance: 92,
    entregablesDone: 104, entregablesTotal: 113,
    feb: 100, mar: 85, abr: 0, may: 0,
    status: "ok" as const,
  },
  {
    school: "Escuela de Ciencias de la Salud",
    programs: ["Enfermería", "Obstetricia"],
    teachers: 10, sent: 7, compliance: 70,
    entregablesDone: 79, entregablesTotal: 113,
    feb: 100, mar: 42, abr: 0, may: 0,
    status: "warning" as const,
  },
  {
    school: "Escuela de Educación",
    programs: ["Educación Básica", "Ed. Inicial"],
    teachers: 9, sent: 8, compliance: 85,
    entregablesDone: 96, entregablesTotal: 113,
    feb: 100, mar: 73, abr: 0, may: 0,
    status: "ok" as const,
  },
  {
    school: "Escuela de Agronomía",
    programs: ["Agronomía", "Biología"],
    teachers: 7, sent: 4, compliance: 57,
    entregablesDone: 64, entregablesTotal: 113,
    feb: 88, mar: 28, abr: 0, may: 0,
    status: "critical" as const,
  },
  {
    school: "Escuela de Psicología",
    programs: ["Psicología"],
    teachers: 8, sent: 8, compliance: 100,
    entregablesDone: 113, entregablesTotal: 113,
    feb: 100, mar: 100, abr: 0, may: 0,
    status: "ok" as const,
  },
  {
    school: "Escuela de Derecho",
    programs: ["Derecho y Ciencias Políticas"],
    teachers: 6, sent: 4, compliance: 67,
    entregablesDone: 76, entregablesTotal: 113,
    feb: 100, mar: 38, abr: 0, may: 0,
    status: "warning" as const,
  },
];

const schoolStatusConfig = {
  ok: { label: "Al día", badge: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, iconColor: "text-emerald-500" },
  warning: { label: "Atención", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" },
  critical: { label: "Crítico", badge: "bg-red-100 text-red-700", icon: AlertTriangle, iconColor: "text-red-500" },
};

export default function ReportsMetrics() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Reportes y Métricas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Análisis de cumplimiento — Ciclo 2024-II</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors bg-white">
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
          <button className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors">
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
            Filtros
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
            <option>Todas las escuelas</option>
            <option>Ing. Sistemas</option>
            <option>Enfermería</option>
            <option>Educación</option>
          </select>
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
            <option>Todos los programas</option>
            <option>Ing. de Sistemas</option>
            <option>Enfermería</option>
            <option>Educación Básica</option>
          </select>
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
            <option>Todas las semanas</option>
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i}>Semana {i + 1}</option>
            ))}
          </select>
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
            <option>Todos los estados</option>
            <option>Aprobado</option>
            <option>Pendiente</option>
            <option>Retrasado</option>
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Tasa de cumplimiento", value: "75%", sub: "Promedio general", icon: TrendingUp, color: "bg-[#1e3a8a]" },
          { label: "Docentes al día", value: "36", sub: "de 48 totales", icon: Users, color: "bg-emerald-600" },
          { label: "Reportes aprobados", value: "187", sub: "del ciclo completo", icon: FileCheck, color: "bg-purple-600" },
          { label: "Mejor programa", value: "Ing. Sistemas", sub: "92% cumplimiento", icon: Award, color: "bg-amber-500" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-500 text-xs">{card.label}</p>
                <p className="text-gray-900 mt-1" style={{ fontWeight: 700, fontSize: card.value.length > 5 ? 16 : 24 }}>
                  {card.value}
                </p>
                <p className="text-gray-400 text-xs mt-1">{card.sub}</p>
              </div>
              <div className={`w-9 h-9 ${card.color} rounded-lg flex items-center justify-center`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-gray-800 mb-1">Progreso Semanal Acumulado</h3>
          <p className="text-gray-500 text-xs mb-4">Reportes por estado a lo largo del ciclo</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="rmColorEnv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rmColorApr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="enviados" name="Enviados" stroke="#1d4ed8" strokeWidth={2} fill="url(#rmColorEnv)" />
              <Area type="monotone" dataKey="aprobados" name="Aprobados" stroke="#10b981" strokeWidth={2} fill="url(#rmColorApr)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-gray-800 mb-1">Rendimiento por Programa</h3>
          <p className="text-gray-500 text-xs mb-4">Porcentaje de cumplimiento promedio</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Radar name="Cumplimiento" dataKey="A" stroke="#1d4ed8" fill="#1d4ed8" fillOpacity={0.15} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v) => [`${v}%`]} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart: teacher compliance */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-gray-800 mb-1">Cumplimiento por Docente</h3>
        <p className="text-gray-500 text-xs mb-4">Porcentaje de avance reportado por docente</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={teacherCompliance}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} unit="%" domain={[0, 100]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(v) => [`${v}%`, "Cumplimiento"]}
            />
            <Bar
              dataKey="cumplimiento"
              radius={[4, 4, 0, 0]}
              fill="#1d4ed8"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top performers */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800">Top Docentes — Semana 8</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">#</th>
                <th className="text-left px-6 py-3">Docente</th>
                <th className="text-left px-6 py-3">Programa</th>
                <th className="text-left px-6 py-3">Cumplimiento</th>
                <th className="text-left px-6 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topPerformers.map((t, i) => (
                <tr key={t.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        i === 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>{t.name}</td>
                  <td className="px-6 py-4 text-gray-600">{t.program}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${t.score}%` }} />
                      </div>
                      <span style={{ fontWeight: 700 }} className="text-gray-700 text-xs">{t.score}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4"><Badge variant={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REPORTE CONSOLIDADO POR ESCUELAS ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1d4ed8]" />
            <h3 className="text-gray-800">Reporte Consolidado por Escuelas</h3>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors bg-white">
              <Download className="w-3.5 h-3.5" /> Informe para Dirección
            </button>
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 border-b border-gray-100">
          {schoolsData.map((s) => {
            const cfg = schoolStatusConfig[s.status];
            return (
              <div key={s.school} className="px-4 py-3 text-center border-r border-gray-100 last:border-r-0">
                <p className="text-xs text-gray-400 truncate" title={s.school}>
                  {s.school.replace("Escuela de ", "").split(" ").slice(0, 2).join(" ")}
                </p>
                <p className={`text-lg mt-0.5 ${s.compliance >= 80 ? "text-emerald-600" : s.compliance >= 60 ? "text-amber-600" : "text-red-600"}`} style={{ fontWeight: 800 }}>
                  {s.compliance}%
                </p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.badge}`} style={{ fontWeight: 500 }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Detailed table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Escuela / Facultad</th>
                <th className="text-left px-4 py-3">Docentes</th>
                <th className="text-left px-4 py-3">Rep. enviados</th>
                <th className="text-left px-4 py-3">Cumplimiento</th>
                <th className="text-left px-4 py-3 w-48">Avance por mes</th>
                <th className="text-left px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schoolsData.map((s) => {
                const cfg = schoolStatusConfig[s.status];
                const Icon = cfg.icon;
                return (
                  <tr key={s.school} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-gray-800 text-sm" style={{ fontWeight: 500 }}>{s.school}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{s.programs.join(" · ")}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-700 text-sm" style={{ fontWeight: 600 }}>{s.teachers}</p>
                      <p className="text-gray-400 text-xs">{s.sent} reportaron</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-gray-700 text-sm" style={{ fontWeight: 600 }}>
                        {s.entregablesDone}/{s.entregablesTotal}
                      </p>
                      <p className="text-gray-400 text-xs">entregables</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.compliance}%`,
                              backgroundColor: s.compliance >= 80 ? "#10b981" : s.compliance >= 60 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span
                          className={`text-sm ${s.compliance >= 80 ? "text-emerald-600" : s.compliance >= 60 ? "text-amber-600" : "text-red-600"}`}
                          style={{ fontWeight: 700 }}
                        >
                          {s.compliance}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5">
                        {[
                          { label: "Feb", val: s.feb },
                          { label: "Mar", val: s.mar },
                          { label: "Abr", val: s.abr },
                          { label: "May", val: s.may },
                        ].map((m) => (
                          <div key={m.label} className="text-center">
                            <div
                              className="w-8 h-8 rounded-md flex items-center justify-center text-xs"
                              style={{
                                fontWeight: 700,
                                backgroundColor:
                                  m.val === 0 ? "#f3f4f6"
                                  : m.val === 100 ? "#d1fae5"
                                  : m.val >= 70 ? "#fef3c7"
                                  : "#fee2e2",
                                color:
                                  m.val === 0 ? "#9ca3af"
                                  : m.val === 100 ? "#059669"
                                  : m.val >= 70 ? "#d97706"
                                  : "#dc2626",
                              }}
                            >
                              {m.val === 0 ? "—" : `${m.val}%`}
                            </div>
                            <p className="text-gray-400 text-xs mt-0.5">{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${cfg.badge}`} style={{ fontWeight: 500 }}>
                        <Icon className={`w-3.5 h-3.5 ${cfg.iconColor}`} />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-2">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 inline-block" /> ≥ 80% Al día</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 inline-block" /> 60–79% Atención requerida</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> {"< 60%"} Crítico</span>
          </div>
          <p className="ml-auto text-xs text-gray-400">Actualizado: 15 Mar 2024 · Semana 6</p>
        </div>
      </div>
    </div>
  );
}