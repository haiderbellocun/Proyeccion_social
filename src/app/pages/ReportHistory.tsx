import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Send,
  ExternalLink,
} from "lucide-react";
import { Badge } from "../components/Badge";
import { AppSelect } from "../components/AppSelect";
import React from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { useLocation } from "react-router";

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
  url_evidencia: string;
  descripcion_reporte: string;
};

export default function ReportHistory() {
  const currentUser = useCurrentUser();
  const location = useLocation();
  const notificationReportId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("reporte"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [edits, setEdits] = useState<
    Record<
      number,
      {
        url_evidencia: string;
        descripcion_reporte: string;
        porcentaje_avance: number;
      }
    >
  >({});
  const [guardandoEdicion, setGuardandoEdicion] = useState<number | null>(null);

  const handleGuardarYReenviar = async (reporte: ReportHistoryRow) => {
    const uid = currentUser?.id;
    if (!uid) return;

    const cambios = edits[reporte.id];
    const urlEvidencia = cambios?.url_evidencia ?? reporte.url_evidencia;
    const descripcion = cambios?.descripcion_reporte ?? reporte.descripcion_reporte;
    const porcentaje = cambios?.porcentaje_avance ?? reporte.progress;

    setGuardandoEdicion(reporte.id);
    try {
      const resPut = await fetch(`${API_BASE_URL}/docente/entregables/${reporte.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completado: true,
          url_evidencia: urlEvidencia || null,
          descripcion_reporte: descripcion || null,
          porcentaje_avance: porcentaje,
          docente_id: uid,
        }),
      });
      if (!resPut.ok) {
        const err = await resPut.json().catch(() => ({}));
        notify.fromError(err, "No se pudo guardar las correcciones.");
        return;
      }

      const resReenviar = await fetch(
        `${API_BASE_URL}/docente/${uid}/entregables/${reporte.id}/reenviar`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      if (!resReenviar.ok) {
        const err = await resReenviar.json().catch(() => ({}));
        notify.fromError(err, "No se pudo reenviar el reporte.");
        return;
      }

      notify.success("Reporte reenviado");

      setReports((prev) =>
        prev.map((rep) =>
          rep.id === reporte.id
            ? {
                ...rep,
                status: "pending",
                comment: "",
                url_evidencia: urlEvidencia,
                descripcion_reporte: descripcion,
                progress: porcentaje,
              }
            : rep
        )
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[reporte.id];
        return next;
      });
    } catch {
      notify.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setGuardandoEdicion(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
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
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setReports([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.id]);

  useEffect(() => {
    if (
      loading ||
      !notificationReportId ||
      !reports.some((report) => report.id === notificationReportId)
    ) {
      return;
    }
    setSearch("");
    setFilterStatus("all");
    setExpanded(notificationReportId);
    const timer = window.setTimeout(() => {
      document
        .getElementById(`reporte-${notificationReportId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [loading, notificationReportId, reports]);

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
          { label: "Requieren corrección", value: reports.filter((r) => r.status === "review").length, color: "text-amber-700" },
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
            placeholder="Buscar por iniciativa o entregable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <AppSelect
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value)}
            options={[
              { value: "all", label: "Todos los estados" },
              { value: "approved", label: "Aprobado" },
              { value: "pending", label: "Pendiente" },
              { value: "review", label: "Requiere corrección" },
            ]}
            className="w-full sm:w-56"
          />
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
                <th className="text-left px-6 py-3">Entregable</th>
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
                  <tr
                    id={`reporte-${r.id}`}
                    className={`hover:bg-gray-50 transition-colors ${
                      r.status === "review" ? "border-l-4 border-amber-400" : ""
                    } ${
                      r.id === notificationReportId
                        ? "bg-blue-50 ring-2 ring-inset ring-blue-400"
                        : ""
                    }`}
                  >
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
                      <Badge
                        variant={r.status}
                        label={
                          r.status === "review" ? "Requiere corrección" : undefined
                        }
                      />
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
                            <span style={{ fontWeight: 500 }}>Entregable: </span>
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

                          {r.status === "review" && (
                            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-sm font-semibold text-amber-800">
                                    El administrador solicitó ajustes:
                                  </p>
                                  <p className="text-sm text-amber-700 mt-1 whitespace-pre-line">
                                    {r.comment || "Sin comentario adicional."}
                                  </p>
                                </div>
                              </div>

                              <hr className="border-amber-200" />

                              <p className="text-sm font-semibold text-amber-900">
                                Realiza tus correcciones y reenvía:
                              </p>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700">
                                  % de avance
                                </label>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={edits[r.id]?.porcentaje_avance ?? r.progress}
                                    onChange={(e) =>
                                      setEdits((prev) => ({
                                        ...prev,
                                        [r.id]: {
                                          url_evidencia:
                                            prev[r.id]?.url_evidencia ?? r.url_evidencia,
                                          descripcion_reporte:
                                            prev[r.id]?.descripcion_reporte ??
                                            r.descripcion_reporte,
                                          porcentaje_avance: Number(e.target.value),
                                        },
                                      }))
                                    }
                                    className="flex-1 accent-amber-600"
                                  />
                                  <span className="text-sm font-semibold text-amber-700 w-12 text-right">
                                    {edits[r.id]?.porcentaje_avance ?? r.progress}%
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700">
                                  Descripción del reporte
                                </label>
                                <textarea
                                  rows={3}
                                  value={
                                    edits[r.id]?.descripcion_reporte ?? r.descripcion_reporte
                                  }
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [r.id]: {
                                        url_evidencia:
                                          prev[r.id]?.url_evidencia ?? r.url_evidencia,
                                        descripcion_reporte: e.target.value,
                                        porcentaje_avance:
                                          prev[r.id]?.porcentaje_avance ?? r.progress,
                                      },
                                    }))
                                  }
                                  placeholder="Describe qué hiciste y cómo corregiste el ajuste solicitado..."
                                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700">
                                  Link de evidencia (Drive, formulario, etc.)
                                </label>
                                <input
                                  type="url"
                                  value={edits[r.id]?.url_evidencia ?? r.url_evidencia}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [r.id]: {
                                        url_evidencia: e.target.value,
                                        descripcion_reporte:
                                          prev[r.id]?.descripcion_reporte ??
                                          r.descripcion_reporte,
                                        porcentaje_avance:
                                          prev[r.id]?.porcentaje_avance ?? r.progress,
                                      },
                                    }))
                                  }
                                  placeholder="https://drive.google.com/..."
                                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                />
                                {(edits[r.id]?.url_evidencia ?? r.url_evidencia) && (
                                  <a
                                    href={edits[r.id]?.url_evidencia ?? r.url_evidencia}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 underline flex items-center gap-1 mt-0.5"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Ver evidencia
                                    actual
                                  </a>
                                )}
                              </div>

                              <div className="flex items-center gap-3 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleGuardarYReenviar(r)}
                                  disabled={guardandoEdicion === r.id}
                                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {guardandoEdicion === r.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />{" "}
                                      Guardando y reenviando...
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-4 h-4" /> Guardar correcciones y
                                      reenviar
                                    </>
                                  )}
                                </button>

                                {edits[r.id] && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[r.id];
                                        return next;
                                      })
                                    }
                                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                                  >
                                    Descartar cambios
                                  </button>
                                )}
                              </div>
                            </div>
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
