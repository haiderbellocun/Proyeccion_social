// Historial de reportes (docente) — diseño B2: tabla + inspector con la corrección y el reenvío de siempre.
// Misma carga (GET /docente/:id/reportes), mismas acciones (PATCH borrador + POST reenviar) y trazabilidad real
// (GET /docente/entregables/:id/historial). La versión anterior (Tinta) se conserva en ReportHistoryTinta.tsx.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { esHttp } from "../components/EnlaceEvidencia";
import { Bullet } from "../components/b2/Bullet";
import { HistorialB2 } from "../components/b2/evidencia-ui";
import { IBuscar, IChevR, ICalendario } from "../components/b2/icons";
import { useMedia } from "../components/b2/matriz-util";
import { Dl, enControl, Estado, Inspector, type Kind } from "../components/b2/ui";

type ReportStatus = "pending" | "review" | "approved";
type ReportHistoryRow = {
  id: number; date: string; week: string; project: string; activity: string; progress: number; status: ReportStatus;
  comment: string; url_evidencia: string; descripcion_reporte: string;
};
type Edicion = { url_evidencia: string; descripcion_reporte: string; porcentaje_avance: number };

const ESTADO: Record<ReportStatus, { kind: Kind; label: string }> = {
  approved: { kind: "aprobado", label: "Aprobado" },
  pending: { kind: "revision", label: "Pendiente de revisión" },
  review: { kind: "observado", label: "Requiere corrección" },
};

export default function ReportHistory() {
  const currentUser = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const movil = useMedia("(max-width: 720px)");
  const notificationReportId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("reporte"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | ReportStatus>("all");
  const [sel, setSel] = useState<number | null>(notificationReportId);
  const [cursor, setCursor] = useState(0);
  const [reports, setReports] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [edits, setEdits] = useState<Record<number, Edicion>>({});
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
      const resPut = await fetch(`${API_BASE}/docente/entregables/${reporte.id}/borrador`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls_evidencia: urlEvidencia || null, descripcion_reporte: descripcion || null, porcentaje_avance: porcentaje }),
      });
      if (!resPut.ok) {
        const err = await resPut.json().catch(() => ({}));
        notify.fromError(err, "No se pudo guardar las correcciones.");
        return;
      }
      const resReenviar = await fetch(`${API_BASE}/docente/${uid}/entregables/${reporte.id}/reenviar`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!resReenviar.ok) {
        const err = await resReenviar.json().catch(() => ({}));
        notify.fromError(err, "No se pudo reenviar el reporte.");
        return;
      }
      notify.success("Reporte reenviado");
      setReports((prev) => prev.map((rep) => rep.id === reporte.id ? { ...rep, status: "pending", comment: "", url_evidencia: urlEvidencia, descripcion_reporte: descripcion, progress: porcentaje } : rep));
      setEdits((prev) => { const next = { ...prev }; delete next[reporte.id]; return next; });
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
        if (!docenteId) { setReports([]); return; }
        const res = await fetch(`${API_BASE}/docente/${docenteId}/reportes`);
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
    void load();
  }, [currentUser?.id, reloadKey]);

  const filtered = useMemo(() => reports.filter((r) => {
    const t = search.toLowerCase();
    const matchSearch = r.project.toLowerCase().includes(t) || r.activity.toLowerCase().includes(t);
    return matchSearch && (filterStatus === "all" || r.status === filterStatus);
  }), [reports, search, filterStatus]);

  const conteo = {
    all: reports.length,
    approved: reports.filter((r) => r.status === "approved").length,
    pending: reports.filter((r) => r.status === "pending").length,
    review: reports.filter((r) => r.status === "review").length,
  };
  const hayFiltros = search !== "" || filterStatus !== "all";
  const limpiar = () => { setSearch(""); setFilterStatus("all"); };
  const seleccionado = reports.find((r) => r.id === sel) ?? null;
  useEffect(() => { if (!loading && sel != null && reports.length > 0 && !reports.some((r) => r.id === sel)) setSel(null); }, [loading, reports, sel]);

  const editar = (r: ReportHistoryRow, parcial: Partial<Edicion>) =>
    setEdits((prev) => ({
      ...prev,
      [r.id]: {
        url_evidencia: prev[r.id]?.url_evidencia ?? r.url_evidencia,
        descripcion_reporte: prev[r.id]?.descripcion_reporte ?? r.descripcion_reporte,
        porcentaje_avance: prev[r.id]?.porcentaje_avance ?? r.progress,
        ...parcial,
      },
    }));

  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(filtered.length - 1, cursor + 1); setCursor(n); if (sel != null && filtered[n]) setSel(filtered[n].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null && filtered[n]) setSel(filtered[n].id); }
    else if (e.key === "Enter" && filtered[cursor]) { e.preventDefault(); setSel(filtered[cursor].id); }
    else if (e.key === "Escape" && sel != null) setSel(null);
  };

  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill" data-insp="sel">
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx" aria-label="Historial de reportes">
          <div className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t"><ICalendario width={20} height={20} />Historial de reportes</h1>
              <p className="b2-mx-s">Registro de tus reportes semanales y de las decisiones del administrador.</p>
            </div>
            <div className="b2-mx-acc"><button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/docente/reportar")}>Reportar entregable</button></div>
          </div>
          {error && <div className="b2-alert" role="alert"><span>No se pudo cargar tu historial de reportes.</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button></div>}

          <div className="b2-chips b2-chips-flush" role="group" aria-label="Filtrar por estado">
            {([["all", "Todos", conteo.all], ["approved", "Aprobados", conteo.approved], ["pending", "Pendientes", conteo.pending], ["review", "Requieren corrección", conteo.review]] as [typeof filterStatus, string, number][]).map(([id, t, n]) => (
              <button key={id} type="button" className="b2-chip" data-on={filterStatus === id || undefined} aria-pressed={filterStatus === id} onClick={() => setFilterStatus(id)}>{t}<b>{n}</b></button>
            ))}
          </div>
          <div className="b2-tb" role="toolbar" aria-label="Buscar en el historial">
            <label className="b2-tb-search" style={{ width: movil ? "100%" : 300 }}>
              <IBuscar width={15} height={15} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por iniciativa o entregable" aria-label="Buscar por iniciativa o entregable" />
            </label>
            {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar</button>}
            <div className="b2-tb-fill" />
            <span className="b2-tb-count" aria-live="polite">{filtered.length === reports.length ? `${reports.length} reportes` : `${filtered.length} de ${reports.length}`}</span>
          </div>

          {movil ? (
            <div className="b2-ml" style={{ padding: 0 }}>
              <ul className="b2-ml-list">
                {loading && <li className="b2-ml-vacio"><p role="status">Cargando reportes…</p></li>}
                {!loading && filtered.length === 0 && <li className="b2-ml-vacio"><div className="b2-ml-vacio-w"><p role="status">{hayFiltros ? "Ningún reporte coincide con los filtros." : "Aún no has enviado reportes. Cuando envíes tu primer reporte aparecerá aquí con su estado de revisión."}</p>{hayFiltros ? <button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button> : <button type="button" className="b2-btn b2-btn-sm b2-btn-primary" onClick={() => navigate("/docente/reportar")}>Reportar un entregable</button>}</div></li>}
                {filtered.map((r) => (
                  <li key={r.id}>
                    <button type="button" id={`reporte-${r.id}`} className="b2-ml-i" data-sel={sel === r.id || undefined} onClick={() => setSel(r.id)}>
                      <span className="b2-ml-t">
                        <span className="b2-ml-n">{r.activity}</span>
                        <span className="b2-ml-e"><Estado kind={ESTADO[r.status].kind} label={ESTADO[r.status].label} /></span>
                        <span className="b2-ml-m">{r.week} · {r.date} · {r.project}</span>
                      </span>
                      <span className="b2-ml-f"><span className="b2-ml-fl">Avance</span>{r.progress}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="b2-tabla b2-tabla-his" role="table" aria-label="Reportes enviados" tabIndex={0} onKeyDown={teclas} aria-busy={loading}>
              <div className="b2-tabla-h" role="row">
                <span role="columnheader">Semana · fecha</span><span role="columnheader">Entregable</span><span role="columnheader">Iniciativa</span><span role="columnheader">Avance</span><span role="columnheader">Estado</span><span role="columnheader">Evidencia</span><span role="columnheader" className="b2-sr-only">Abrir</span>
              </div>
              {loading && <div className="b2-skel-w" aria-hidden="true">{[90, 80, 86, 74].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div>}
              {!loading && filtered.length === 0 && <p className="b2-cola-vacio" role="status">{hayFiltros ? "Ningún reporte coincide con los filtros. Prueba con otro término o quita el filtro de estado." : "Aún no has enviado reportes. Cuando envíes tu primer reporte aparecerá aquí con su estado de revisión."}</p>}
              {filtered.map((r, i) => (
                <div key={r.id} id={`reporte-${r.id}`} className="b2-tabla-r" role="row" aria-selected={sel === r.id} data-sel={sel === r.id || undefined} data-cur={i === cursor || undefined} onClick={() => { setCursor(i); setSel(r.id); }}>
                  <span role="cell" className="b2-cola-t"><span className="b2-tt">{r.week}</span><span className="b2-sub">{r.date}</span></span>
                  <span role="cell" className="b2-cola-t"><span className="b2-tt" title={r.activity}>{r.activity}</span></span>
                  <span role="cell" className="b2-tt" title={r.project}>{r.project}</span>
                  <span role="cell"><Bullet rep={r.progress} nombre={r.activity} /></span>
                  <span role="cell"><Estado kind={ESTADO[r.status].kind} label={ESTADO[r.status].label} /></span>
                  <span role="cell" className="b2-ev-n">{r.url_evidencia && esHttp(r.url_evidencia.split(/\s+/)[0]) ? "Con enlace" : <span className="b2-muted">—</span>}</span>
                  <span role="cell" className="b2-cola-go" aria-hidden="true"><IChevR width={14} height={14} /></span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && (() => {
          const r = seleccionado;
          const ed = edits[r.id];
          const urlActual = ed?.url_evidencia ?? r.url_evidencia;
          return (
            <div className="b2-insp-c">
              <p className="b2-insp-sup">{r.week} · {r.date} · {r.project}</p>
              <h2 className="b2-insp-h">{r.activity}</h2>
              <div className="b2-insp-estado"><Estado kind={ESTADO[r.status].kind} label={ESTADO[r.status].label} /></div>
              {r.descripcion_reporte && (<><h3 className="b2-insp-sub">Tu descripción</h3><p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{r.descripcion_reporte}</p></>)}
              {r.comment && r.status !== "review" && <div className="b2-callout"><strong>Comentario del administrador</strong><p style={{ whiteSpace: "pre-line" }}>{r.comment}</p></div>}
              {!r.comment && r.status === "pending" && <p className="b2-nota-aviso" data-t="warn">Pendiente de revisión por el administrador.</p>}
              {r.status === "approved" && <p className="b2-nota-aviso" data-t="ok">Aprobado: no puede modificarse. Si hay un error, solicita su reapertura al administrador.</p>}

              {r.status === "review" && (
                <div className="b2-acc-form">
                  <h3>Realiza tus correcciones y reenvía</h3>
                  <div className="b2-callout b2-callout-d"><strong>El administrador solicitó ajustes</strong><p style={{ whiteSpace: "pre-line" }}>{r.comment || "Sin comentario adicional."}</p></div>
                  <div>
                    <div className="b2-acc-fila" style={{ justifyContent: "space-between" }}><label className="b2-label" style={{ margin: 0 }} htmlFor={`avance-${r.id}`}>Porcentaje de avance</label><b className="b2-acento">{ed?.porcentaje_avance ?? r.progress}%</b></div>
                    <input id={`avance-${r.id}`} type="range" min={0} max={100} step={5} value={ed?.porcentaje_avance ?? r.progress} onChange={(e) => editar(r, { porcentaje_avance: Number(e.target.value) })} className="b2-rango" />
                  </div>
                  <div><label className="b2-label" htmlFor={`desc-${r.id}`}>Descripción del reporte</label><textarea id={`desc-${r.id}`} rows={3} className="b2-input" value={ed?.descripcion_reporte ?? r.descripcion_reporte} onChange={(e) => editar(r, { descripcion_reporte: e.target.value })} placeholder="Describe qué hiciste y cómo corregiste el ajuste solicitado." /></div>
                  <div>
                    <label className="b2-label" htmlFor={`url-${r.id}`}>Enlace de evidencia (Drive, formulario, etc.)</label>
                    <input id={`url-${r.id}`} type="url" className="b2-input" value={urlActual} onChange={(e) => editar(r, { url_evidencia: e.target.value })} placeholder="https://drive.google.com/…" />
                    {urlActual && esHttp(urlActual) && <a className="b2-link" style={{ display: "inline-block", marginTop: 6 }} href={urlActual} target="_blank" rel="noopener noreferrer">Ver evidencia actual</a>}
                  </div>
                  <div className="b2-acc-fila">
                    <button type="button" className="b2-btn b2-btn-primary" disabled={guardandoEdicion === r.id} onClick={() => void handleGuardarYReenviar(r)}>{guardandoEdicion === r.id && <span className="b2-spin" aria-hidden="true" />}{guardandoEdicion === r.id ? "Guardando y reenviando…" : "Guardar correcciones y reenviar"}</button>
                    {ed && <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[r.id]; return n; })}>Descartar cambios</button>}
                  </div>
                </div>
              )}

              <h3 className="b2-insp-sub">Datos</h3>
              <Dl rows={[["Semana", r.week], ["Fecha", r.date], ["Iniciativa", r.project], ["Avance", `${r.progress}%`]]} />
              <HistorialB2 ruta={`/docente/entregables/${r.id}/historial`} clave={`${r.id}-${r.status}`} />
              <div className="b2-insp-acc">
                <button type="button" className="b2-btn" onClick={() => navigate(`/docente/evidencias`)}>Mis evidencias</button>
                <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar detalle</button>
              </div>
            </div>
          );
        })()}
      </Inspector>
    </div>
  );
}
