import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Users,
  FileCheck,
  AlertTriangle,
  FolderKanban,
  ArrowRight,
  TrendingUp,
  TableProperties,
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

interface DashboardStats {
  total_docentes: number;
  reportes_enviados: number;
  docentes_atrasados: number;
  proyectos_activos: number;
}

interface ProgresoSemanalRow {
  semana: number;
  mes: string;
  enviados: number;
  aprobados: number;
}

interface CumplimientoProgramaRow {
  programa: string;
  porcentaje: number;
  docentes: number;
}

interface DocenteRecienteRow {
  id: number;
  nombre: string;
  programa: string;
  regional: string;
  porcentaje_avance: number;
  reportes_enviados: number;
  estado: "al_dia" | "atrasado" | "sin_actividad";
}

interface AdminDashboardPayload {
  stats?: DashboardStats;
  progreso_semanal?: ProgresoSemanalRow[];
  cumplimiento_por_programa?: CumplimientoProgramaRow[];
  docentes_recientes?: DocenteRecienteRow[];
}

function estadoDocenteBadge(estado: DocenteRecienteRow["estado"]): "active" | "delayed" | "pending" {
  if (estado === "al_dia") return "active";
  if (estado === "atrasado") return "delayed";
  return "pending";
}

function labelEstadoDocente(estado: DocenteRecienteRow["estado"]): string {
  if (estado === "al_dia") return "Al día";
  if (estado === "atrasado") return "Atrasado";
  return "Sin actividad";
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/admin/dashboard`);
        if (!res.ok) throw new Error("Error al cargar dashboard admin");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar el dashboard.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const headerSubtitle = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, []);

  const stats = data?.stats;
  const progresoSemanal = data?.progreso_semanal ?? [];
  const cumplimientoProgramas = useMemo(
    () => (data?.cumplimiento_por_programa ?? []).map((r) => ({
      programa: r.programa,
      cumplimiento: r.porcentaje,
    })),
    [data?.cumplimiento_por_programa]
  );
  const docentesRows = data?.docentes_recientes ?? [];

  const chartLineData = useMemo(
    () =>
      progresoSemanal.map((r) => ({
        semana: `S${r.semana}`,
        semanaNum: r.semana,
        enviados: r.enviados,
        aprobados: r.aprobados,
      })),
    [progresoSemanal]
  );

  const statCards = [
    {
      label: "Total Docentes",
      value: stats != null ? String(stats.total_docentes) : "—",
      sub: "Registrados en el sistema",
      icon: Users,
      color: "bg-[#1e3a8a]",
    },
    {
      label: "Reportes Enviados",
      value: stats != null ? String(stats.reportes_enviados) : "—",
      sub: "Entregables marcados como completados",
      icon: FileCheck,
      color: "bg-emerald-600",
    },
    {
      label: "Docentes Atrasados",
      value: stats != null ? String(stats.docentes_atrasados) : "—",
      sub: "Avance de matriz bajo el umbral",
      icon: AlertTriangle,
      color: "bg-amber-500",
    },
    {
      label: "Proyectos Activos",
      value: stats != null ? String(stats.proyectos_activos) : "—",
      sub: "En ejecución",
      icon: FolderKanban,
      color: "bg-purple-600",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Dashboard Administrativo</h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{headerSubtitle}</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-500 text-sm">{card.label}</p>
                <p className="text-gray-900 mt-1" style={{ fontSize: 28, fontWeight: 700 }}>
                  {loading && stats == null ? "…" : card.value}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800">Progreso Semanal</h3>
              <p className="text-gray-500 text-xs mt-0.5">
                Reportes enviados vs aprobados por semana del cronograma
                {loading ? " (cargando…)" : ""}
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-[#1d4ed8]" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartLineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semana" tick={{ fontSize: 11, fill: "#9ca3af" }} />
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

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h3 className="text-gray-800">Cumplimiento por Programa</h3>
            <p className="text-gray-500 text-xs mt-0.5">Promedio de avance en matriz (top 8 programas)</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cumplimientoProgramas} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} unit="%" />
              <YAxis dataKey="programa" type="category" tick={{ fontSize: 11, fill: "#6b7280" }} width={100} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Cumplimiento"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
              <Bar dataKey="cumplimiento" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800">Estado de Docentes</h3>
          <button
            onClick={() => navigate("/admin/reportes")}
            className="text-sm text-[#1d4ed8] hover:underline flex items-center gap-1"
          >
            Ver métricas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Docente</th>
                <th className="text-left px-6 py-3">Programa</th>
                <th className="text-left px-6 py-3">Regional</th>
                <th className="text-left px-6 py-3">Avance</th>
                <th className="text-left px-6 py-3">Reportes</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docentesRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-400 text-sm">
                    No hay docentes para mostrar
                  </td>
                </tr>
              )}
              {docentesRows.map((t) => {
                const initials = t.nombre
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase();
                const progress = Math.round(t.porcentaje_avance);
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white text-xs shrink-0">
                          {initials || "?"}
                        </div>
                        <span className="text-gray-800" style={{ fontWeight: 500 }}>
                          {t.nombre}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{t.programa}</td>
                    <td className="px-6 py-4 text-gray-600">{t.regional}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, progress)}%`,
                              backgroundColor:
                                progress >= 70 ? "#10b981" : progress >= 40 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-600" style={{ fontWeight: 600 }}>
                          {progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{t.reportes_enviados}</td>
                    <td className="px-6 py-4">
                      <Badge variant={estadoDocenteBadge(t.estado)} label={labelEstadoDocente(t.estado)} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/docentes/${t.id}/matriz`)}
                          className="inline-flex items-center gap-1 text-[#1d4ed8] hover:underline text-xs font-medium"
                        >
                          <TableProperties className="w-3.5 h-3.5" />
                          Ver matriz
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate("/admin/revision")}
                          className="text-[#1d4ed8] hover:underline text-xs"
                          style={{ fontWeight: 500 }}
                        >
                          Revisar reporte
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
