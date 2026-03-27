import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Users,
  FileCheck,
  AlertTriangle,
  FolderKanban,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Badge } from "../components/Badge";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

const weeklyProgressData = [
  { semana: "S4", enviados: 18, aprobados: 12 },
  { semana: "S5", enviados: 22, aprobados: 18 },
  { semana: "S6", enviados: 25, aprobados: 20 },
  { semana: "S7", enviados: 28, aprobados: 24 },
  { semana: "S8", enviados: 30, aprobados: 22 },
];

const programData = [
  { programa: "Ing. Sistemas", cumplimiento: 92 },
  { programa: "Enfermería", cumplimiento: 78 },
  { programa: "Educación", cumplimiento: 85 },
  { programa: "Agronomía", cumplimiento: 68 },
  { programa: "Psicología", cumplimiento: 90 },
];

const teachers = [
  { id: 1, name: "Mg. María Rodríguez", program: "Ing. de Sistemas", progress: 88, status: "active" as const, reports: 8 },
  { id: 2, name: "Dr. Carlos Mendoza", program: "Enfermería", progress: 45, status: "delayed" as const, reports: 5 },
  { id: 3, name: "Mg. Ana Torres", program: "Educación", progress: 72, status: "active" as const, reports: 7 },
  { id: 4, name: "Ing. Luis Paredes", program: "Agronomía", progress: 30, status: "delayed" as const, reports: 3 },
  { id: 5, name: "Lic. Sofía Vargas", program: "Psicología", progress: 95, status: "active" as const, reports: 8 },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [docentesTotal, setDocentesTotal] = useState<number | null>(null);
  const [proyectosActivos, setProyectosActivos] = useState<number | null>(null);
  const [reportesEnviados, setReportesEnviados] = useState<number | null>(null);
  const [reportesAprobados, setReportesAprobados] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoadingStats(true);
        const res = await fetch(`${API_BASE_URL}/admin/dashboard`);
        if (!res.ok) throw new Error("Error al cargar dashboard admin");
        const data = await res.json();
        setDocentesTotal(data.docentes ?? null);
        setProyectosActivos(data.proyectos_activos ?? null);
        setReportesEnviados(data.reportes?.enviados ?? null);
        setReportesAprobados(data.reportes?.aprobados ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingStats(false);
      }
    };
    loadStats();
  }, []);

  const statCards = [
    {
      label: "Total Docentes",
      value: docentesTotal !== null ? String(docentesTotal) : "—",
      sub: "Activos este ciclo",
      icon: Users,
      color: "bg-[#1e3a8a]",
    },
    {
      label: "Reportes Enviados",
      value: reportesEnviados !== null ? String(reportesEnviados) : "—",
      sub:
        docentesTotal !== null && reportesEnviados !== null
          ? `Semana actual / ${docentesTotal} esperados`
          : "Semana actual",
      icon: FileCheck,
      color: "bg-emerald-600",
    },
    {
      label: "Docentes Atrasados",
      value:
        docentesTotal !== null && reportesEnviados !== null
          ? String(Math.max(docentesTotal - reportesEnviados, 0))
          : "—",
      sub: "Sin reporte esta semana",
      icon: AlertTriangle,
      color: "bg-amber-500",
    },
    {
      label: "Proyectos Activos",
      value: proyectosActivos !== null ? String(proyectosActivos) : "—",
      sub: "En ejecución",
      icon: FolderKanban,
      color: "bg-purple-600",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Dashboard Administrativo</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Semana 8 — Ciclo 2024-II — 15 Mar 2024
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/admin/revision")}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
            style={{ fontWeight: 600 }}
          >
            <FileCheck className="w-4 h-4" />
            Revisar reportes
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
              <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Weekly progress */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800">Progreso Semanal</h3>
              <p className="text-gray-500 text-xs mt-0.5">
                Reportes enviados vs aprobados
                {loadingStats && " (cargando...)"}
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-[#1d4ed8]" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyProgressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="enviados" name="Enviados" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="aprobados" name="Aprobados" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Compliance by program */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-gray-800">Cumplimiento por Programa</h3>
            <p className="text-gray-500 text-xs mt-0.5">Porcentaje de avance promedio</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={programData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} unit="%" />
              <YAxis dataKey="programa" type="category" tick={{ fontSize: 11, fill: "#6b7280" }} width={80} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Cumplimiento"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              <Bar dataKey="cumplimiento" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Teachers table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800">Estado de Docentes — Semana 8</h3>
          <button
            onClick={() => navigate("/admin/reportes")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Docente</th>
                <th className="text-left px-6 py-3">Programa</th>
                <th className="text-left px-6 py-3">Avance</th>
                <th className="text-left px-6 py-3">Reportes</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {teachers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white text-xs shrink-0">
                        {t.name.split(" ").map((n) => n[0]).slice(1, 3).join("")}
                      </div>
                      <span className="text-gray-800" style={{ fontWeight: 500 }}>
                        {t.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{t.program}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${t.progress}%`,
                            backgroundColor: t.progress >= 70 ? "#10b981" : t.progress >= 40 ? "#f59e0b" : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600" style={{ fontWeight: 600 }}>
                        {t.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{t.reports}/8 enviados</td>
                  <td className="px-6 py-4">
                    <Badge variant={t.status} />
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate("/admin/revision")}
                      className="text-[#1d4ed8] hover:underline text-xs"
                      style={{ fontWeight: 500 }}
                    >
                      Revisar reporte
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
