import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle, Loader2, Send, ExternalLink, Search, FileText } from "lucide-react";
import { EmptyState, InlineAlert, Page, PageHeader, PageLoading, Panel, ProgressBar, Segmented, StatusPill, type Tone } from "../components/ds/primitives";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { useLocation, useNavigate } from "react-router";

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
  const navigate = useNavigate();
  const notificationReportId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("reporte"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reports, setReports] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
      // Las correcciones se guardan sin cambiar el estado («observado»); el reenvío es el paso siguiente.
      const resPut = await fetch(`${API_BASE_URL}/docente/entregables/${reporte.id}/borrador`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls_evidencia: urlEvidencia || null,
          descripcion_reporte: descripcion || null,
          porcentaje_avance: porcentaje,
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
        setError(false);
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
        setError(true);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setReports([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.id, reloadKey]);

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

  const conteo = {
    all: reports.length,
    approved: reports.filter((r) => r.status === "approved").length,
    pending: reports.filter((r) => r.status === "pending").length,
    review: reports.filter((r) => r.status === "review").length,
  };
  const tonoEstado: Record<ReportStatus, { tone: Tone; label: string }> = {
    approved: { tone: "success", label: "Aprobado" },
    pending: { tone: "violet", label: "Pendiente de revisión" },
    review: { tone: "warning", label: "Requiere corrección" },
  };
  const hayFiltros = search !== "" || filterStatus !== "all";

  const editar = (r: ReportHistoryRow, parcial: Partial<{ url_evidencia: string; descripcion_reporte: string; porcentaje_avance: number }>) =>
    setEdits((prev) => ({
      ...prev,
      [r.id]: {
        url_evidencia: prev[r.id]?.url_evidencia ?? r.url_evidencia,
        descripcion_reporte: prev[r.id]?.descripcion_reporte ?? r.descripcion_reporte,
        porcentaje_avance: prev[r.id]?.porcentaje_avance ?? r.progress,
        ...parcial,
      },
    }));

  return (
    <Page>
      <PageHeader
        title="Historial de reportes"
        description="Registro de tus reportes semanales y de las decisiones del administrador."
      />

      {error && (
        <InlineAlert action={<button type="button" onClick={() => setReloadKey((k) => k + 1)} className="ds-btn ds-btn-secondary ds-btn-sm">Reintentar</button>}>
          No se pudo cargar tu historial de reportes.
        </InlineAlert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Filtrar por estado"
          value={filterStatus as "all" | ReportStatus}
          onChange={(v) => setFilterStatus(v)}
          items={[
            { id: "all", label: "Todos", count: conteo.all },
            { id: "approved", label: "Aprobados", count: conteo.approved, tone: "success" },
            { id: "pending", label: "Pendientes", count: conteo.pending, tone: "violet" },
            { id: "review", label: "Requieren corrección", count: conteo.review, tone: "warning" },
          ]}
        />
        <div className="relative ml-auto w-full min-w-[14rem] sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input
            type="search"
            aria-label="Buscar por iniciativa o entregable"
            placeholder="Buscar por iniciativa o entregable…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ds-input pl-9"
          />
        </div>
      </div>

      <Panel bodyClassName="">
        {loading ? (
          <PageLoading label="Cargando reportes…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hayFiltros ? "Ningún reporte coincide con los filtros" : "Aún no has enviado reportes"}
            action={
              hayFiltros ? (
                <button type="button" onClick={() => { setSearch(""); setFilterStatus("all"); }} className="ds-btn ds-btn-secondary ds-btn-sm">
                  Limpiar filtros
                </button>
              ) : (
                <button type="button" onClick={() => navigate("/docente/reportar")} className="ds-btn ds-btn-primary ds-btn-sm">
                  Reportar un entregable
                </button>
              )
            }
          >
            {hayFiltros ? "Prueba con otro término o quita el filtro de estado." : "Cuando envíes tu primer reporte aparecerá aquí con su estado de revisión."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Semana / fecha</th>
                  <th className="hidden lg:table-cell">Iniciativa</th>
                  <th>Entregable</th>
                  <th className="hidden md:table-cell min-w-[8rem]">Avance</th>
                  <th className="hidden md:table-cell">Estado</th>
                  <th className="w-px"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const est = tonoEstado[r.status];
                  const abierto = expanded === r.id;
                  const destacado = r.id === notificationReportId;
                  return (
                    <Fragment key={r.id}>
                      <tr id={`reporte-${r.id}`}>
                        <td className={`whitespace-nowrap ${destacado ? "bg-blue-50" : ""} ${r.status === "review" ? "shadow-[inset_3px_0_0_var(--color-amber-400)]" : ""}`}>
                          <p style={{ fontWeight: 550 }}>{r.week}</p>
                          <p className="text-xs text-text-subtle">{r.date}</p>
                        </td>
                        <td className={`hidden max-w-[16rem] truncate lg:table-cell ${destacado ? "bg-blue-50" : ""}`} title={r.project}>{r.project}</td>
                        <td className={`max-w-[10rem] sm:max-w-[18rem] ${destacado ? "bg-blue-50" : ""}`}>
                          <span className="line-clamp-2" title={r.activity}>{r.activity}</span>
                          <span className="block truncate text-xs text-text-subtle lg:hidden">{r.project}</span>
                          <StatusPill tone={est.tone} className="mt-1 md:hidden">{est.label}</StatusPill>
                        </td>
                        <td className={`hidden md:table-cell ${destacado ? "bg-blue-50" : ""}`}>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={r.progress} tone="brand" label={`Avance ${r.progress}%`} className="w-16" />
                            <span className="text-xs tabular-nums text-text-muted" style={{ fontWeight: 600 }}>{r.progress}%</span>
                          </div>
                        </td>
                        <td className={`hidden md:table-cell ${destacado ? "bg-blue-50" : ""}`}><StatusPill tone={est.tone}>{est.label}</StatusPill></td>
                        <td className={destacado ? "bg-blue-50" : ""}>
                          <button
                            type="button"
                            onClick={() => setExpanded(abierto ? null : r.id)}
                            aria-expanded={abierto}
                            aria-controls={`detalle-${r.id}`}
                            className="ds-btn ds-btn-ghost ds-btn-sm text-brand"
                          >
                            Ver
                            {abierto ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr id={`detalle-${r.id}`}>
                          <td colSpan={6} className="!bg-surface-2 !py-4">
                            <div className="space-y-3 text-sm">
                              <p>
                                <span className="text-text-subtle">Entregable: </span>
                                {r.activity}
                              </p>
                              {r.descripcion_reporte && (
                                <p className="whitespace-pre-line text-text-muted">
                                  <span className="text-text-subtle">Tu descripción: </span>
                                  {r.descripcion_reporte}
                                </p>
                              )}
                              {r.comment && r.status !== "review" && (
                                <div className="rounded-lg border border-line bg-surface p-3">
                                  <p className="text-xs text-text-subtle" style={{ fontWeight: 550 }}>Comentario del administrador</p>
                                  <p className="mt-1 whitespace-pre-line">{r.comment}</p>
                                </div>
                              )}
                              {!r.comment && r.status === "pending" && (
                                <InlineAlert tone="warning">Pendiente de revisión por el administrador.</InlineAlert>
                              )}

                              {r.status === "review" && (
                                <div className="space-y-4 rounded-xl border border-amber-200 bg-surface p-4">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
                                    <div>
                                      <p className="text-amber-700" style={{ fontWeight: 600 }}>El administrador solicitó ajustes</p>
                                      <p className="mt-1 whitespace-pre-line text-text-muted">{r.comment || "Sin comentario adicional."}</p>
                                    </div>
                                  </div>

                                  <hr className="border-line" />

                                  <p style={{ fontWeight: 600 }}>Realiza tus correcciones y reenvía</p>

                                  <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <label className="ds-label !mb-0" htmlFor={`avance-${r.id}`}>Porcentaje de avance</label>
                                      <span className="text-sm tabular-nums text-brand" style={{ fontWeight: 650 }}>{edits[r.id]?.porcentaje_avance ?? r.progress}%</span>
                                    </div>
                                    <input
                                      id={`avance-${r.id}`}
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={5}
                                      value={edits[r.id]?.porcentaje_avance ?? r.progress}
                                      onChange={(e) => editar(r, { porcentaje_avance: Number(e.target.value) })}
                                      className="w-full accent-brand"
                                    />
                                  </div>

                                  <div>
                                    <label className="ds-label" htmlFor={`desc-${r.id}`}>Descripción del reporte</label>
                                    <textarea
                                      id={`desc-${r.id}`}
                                      rows={3}
                                      value={edits[r.id]?.descripcion_reporte ?? r.descripcion_reporte}
                                      onChange={(e) => editar(r, { descripcion_reporte: e.target.value })}
                                      placeholder="Describe qué hiciste y cómo corregiste el ajuste solicitado."
                                      className="ds-input resize-y"
                                    />
                                  </div>

                                  <div>
                                    <label className="ds-label" htmlFor={`url-${r.id}`}>Enlace de evidencia (Drive, formulario, etc.)</label>
                                    <input
                                      id={`url-${r.id}`}
                                      type="url"
                                      value={edits[r.id]?.url_evidencia ?? r.url_evidencia}
                                      onChange={(e) => editar(r, { url_evidencia: e.target.value })}
                                      placeholder="https://drive.google.com/…"
                                      className="ds-input"
                                    />
                                    {(edits[r.id]?.url_evidencia ?? r.url_evidencia) && (
                                      <a
                                        href={edits[r.id]?.url_evidencia ?? r.url_evidencia}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand underline"
                                      >
                                        <ExternalLink className="h-3 w-3" aria-hidden /> Ver evidencia actual
                                      </a>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
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
                                        className="ds-btn ds-btn-ghost"
                                      >
                                        Descartar cambios
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleGuardarYReenviar(r)}
                                      disabled={guardandoEdicion === r.id}
                                      className="ds-btn ds-btn-primary"
                                    >
                                      {guardandoEdicion === r.id ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Guardando y reenviando…
                                        </>
                                      ) : (
                                        <>
                                          <Send className="h-4 w-4" aria-hidden /> Guardar correcciones y reenviar
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
