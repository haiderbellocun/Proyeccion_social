import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "../components/Badge";
import React from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

type ReportStatus = "pending" | "review" | "approved";

type ReportHistoryRow = {
  id: number;
  date: string;
  week: string;
  project: string;
  activity: string;
  progress: number;
  status: ReportStatus;
  comment: string;
};

export default function ReportHistory() {
  const currentUser = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const docenteId = currentUser?.id ?? null;
        if (!docenteId) {
          setReports([]);
          return;
        }

        const res = await fetch(`${API_BASE_URL}/docente/${docenteId}/reportes`);
        if (!res.ok) throw new Error("Error al cargar historial de reportes");
        const data = await res.json();
        setReports(Array.isArray(data.reportes) ? data.reportes : []);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
        setReports([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
    const matchSearch =
      r.project.toLowerCase().includes(search.toLowerCase()) ||
      r.activity.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchStatus;
    });
  }, [reports, search, filterStatus]);

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div>
        <h1 className="text-gray-900">Historial de Reportes</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Registro de tus reportes semanales y decisiones del administrador
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total reportes", value: reports.length, color: "text-gray-800" },
          { label: "Aprobados", value: reports.filter((r) => r.status === "approved").length, color: "text-emerald-600" },
          { label: "Pendientes", value: reports.filter((r) => r.status === "pending").length, color: "text-amber-600" },
          { label: "En revisión", value: reports.filter((r) => r.status === "review").length, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className={`text-2xl ${s.color}`} style={{ fontWeight: 700 }}>
              {s.value}
            </p>
            <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por proyecto o actividad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
          >
            <option value="all">Todos los estados</option>
            <option value="approved">Aprobado</option>
            <option value="pending">Pendiente</option>
            <option value="review">En revisión</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Semana / Fecha</th>
                <th className="text-left px-6 py-3">Proyecto</th>
                <th className="text-left px-6 py-3">Actividad</th>
                <th className="text-left px-6 py-3">Avance</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">
                    Cargando...
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                <React.Fragment key={r.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-gray-700" style={{ fontWeight: 500 }}>{r.week}</p>
                      <p className="text-gray-400 text-xs">{r.date}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-[180px] truncate">{r.project}</td>
                    <td className="px-6 py-4 text-gray-600 max-w-[180px] truncate">{r.activity}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#1d4ed8]"
                            style={{ width: `${r.progress}%` }}
                          />
                        </div>
                        <span className="text-gray-700 text-xs" style={{ fontWeight: 600 }}>
                          {r.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={r.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors flex items-center gap-1 text-xs"
                          style={{ fontWeight: 500 }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                          {expanded === r.id ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`} className="bg-blue-50/50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-2">
                          <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
                            Detalle del reporte
                          </p>
                          <p className="text-sm text-gray-600">
                            <span style={{ fontWeight: 500 }}>Actividad: </span>
                            {r.activity}
                          </p>
                          {r.comment && (
                            <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-500" style={{ fontWeight: 500 }}>
                                Comentario del administrador:
                              </p>
                              <p className="text-sm text-gray-700 mt-1">{r.comment}</p>
                            </div>
                          )}
                          {!r.comment && r.status === "pending" && (
                            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
                              Pendiente de revisión por el administrador
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">
            No se encontraron reportes con los filtros aplicados
          </div>
        )}
      </div>
    </div>
  );
}