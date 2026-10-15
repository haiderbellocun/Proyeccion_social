// Reportar entregable (docente) — diseño B2. La lógica (cronograma, materialización del entregable, guardar borrador,
// enviar, justificación sin evidencia y validaciones) es exactamente la de la versión anterior, conservada en ReportProgressTinta.tsx.
// Solo se añade una lectura de GET /docente/:id/evidencias para mostrar el estado, las instrucciones y las observaciones del entregable.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { AVISO_ACCESO, esHttp, type EvidenciaEnlace } from "../components/EnlaceEvidencia";
import { EnlacesB2 } from "../components/b2/evidencia-ui";
import { ICerrar } from "../components/b2/icons";
import { fechaCorta, fechaLarga, useMedia } from "../components/b2/matriz-util";
import { Estado, type Kind } from "../components/b2/ui";
import { formatDateTimeBogota } from "../lib/date";

type ReportWeek = {
  id: number; numero: number; fechaInicio: string; fechaFin: string; entregables: string[];
  entregablesDetalle?: { id: number | null; plantillaId?: number | null; descripcion: string; completado?: boolean; url_evidencia?: string | null; fecha_real_entrega?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null }[];
};
type ReportProject = { id: number; name: string; weeks: ReportWeek[]; transversal?: boolean };
// Entregables transversales (plantillas sin iniciativa propia): el servidor los asocia a una iniciativa de soporte al crearlos.
const ID_TRANSVERSALES = -1;
type ItemMatriz = {
  id: number; iniciativa_id: number | null; semana_numero: number; entregable: string; entregable_id: number | null; completado?: boolean;
  url_evidencia?: string | null; fecha_real_entrega?: string | null; fecha_inicio_calculada?: string | null; fecha_fin_calculada?: string | null;
};
/** Agrupa, en una iniciativa sintética, los ítems de la matriz sin iniciativa que el cronograma no incluye. Solo lectura. */
function grupoTransversales(items: ItemMatriz[], proyectos: ReportProject[]): ReportProject | null {
  const presentes = new Set<number>();
  for (const p of proyectos) for (const w of p.weeks) for (const d of w.entregablesDetalle ?? []) if (d.plantillaId != null) presentes.add(Number(d.plantillaId));
  const sueltos = items.filter((i) => i.iniciativa_id == null && !presentes.has(Number(i.id)));
  if (sueltos.length === 0) return null;
  const porSemana = new Map<number, ItemMatriz[]>();
  for (const i of sueltos) porSemana.set(i.semana_numero, [...(porSemana.get(i.semana_numero) ?? []), i]);
  const weeks: ReportWeek[] = [...porSemana.entries()].sort((a, b) => a[0] - b[0]).map(([numero, lista]) => {
    const inicios = lista.map((i) => i.fecha_inicio_calculada).filter(Boolean).sort() as string[];
    const fines = lista.map((i) => i.fecha_fin_calculada).filter(Boolean).sort() as string[];
    return {
      id: numero, numero, fechaInicio: inicios[0] ?? "", fechaFin: fines[fines.length - 1] ?? "", entregables: lista.map((i) => i.entregable),
      entregablesDetalle: lista.map((i) => ({
        id: i.entregable_id, plantillaId: i.id, descripcion: i.entregable, completado: i.completado, url_evidencia: i.url_evidencia ?? null,
        fecha_real_entrega: i.fecha_real_entrega ?? null, fecha_inicio: i.fecha_inicio_calculada ?? null, fecha_fin: i.fecha_fin_calculada ?? null,
      })),
    };
  });
  return { id: ID_TRANSVERSALES, name: "Entregables transversales (gestión general)", weeks, transversal: true };
}
type EntregableDetalleItem = { id: number | null; plantillaId?: number | null; descripcion: string; completado?: boolean; url_evidencia?: string | null; fecha_real_entrega?: string | null };
type MaterializedDeliverable = Omit<EntregableDetalleItem, "id"> & { id: number };

interface InfoEvidencia {
  plantilla_id: number; situacion: string; vencido: boolean; requiere_evidencia: boolean; descripcion_evidencia: string; enlace_referencia: string | null;
  comentario_revision: string | null; revisado_en: string | null; problema_acceso: boolean; evidencias: EvidenciaEnlace[]; fecha_fin: string | null; num_envios: number;
}
const SITUACION: Record<string, { label: string; kind: Kind }> = {
  sin_evidencia: { label: "Sin evidencia", kind: "porhacer" }, borrador: { label: "Borrador", kind: "borrador" }, observada: { label: "Observada", kind: "observado" },
  en_revision: { label: "En revisión", kind: "revision" }, aprobada: { label: "Aprobada", kind: "aprobado" }, sin_requisito: { label: "No requiere evidencia", kind: "porhacer" },
};

function deliverableKey(item: EntregableDetalleItem): string {
  if (item.plantillaId != null) return `tpl:${item.plantillaId}`;
  return item.id != null ? `item:${item.id}` : "";
}

export default function ReportProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useCurrentUser();
  const requestedTemplateId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("plantilla"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const requestedInitiativeId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("iniciativa"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const [submitted, setSubmitted] = useState(false);
  const [link, setLink] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [projects, setProjects] = useState<ReportProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [selectedWeekId, setSelectedWeekId] = useState<number | "">("");
  const [selectedDeliverableKey, setSelectedDeliverableKey] = useState("");
  const [sending, setSending] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const movil = useMedia("(max-width: 720px)");
  const [infoPorPlantilla, setInfoPorPlantilla] = useState<Record<number, InfoEvidencia>>({});

  const [actividadRealizada, setActividadRealizada] = useState("");
  const [descripcionReporte, setDescripcionReporte] = useState("");
  // Excepción: solo cuando el entregable no tiene evidencia que cargar (queda registrada y la revisa el administrador).
  const [justificacionSinEvidencia, setJustificacionSinEvidencia] = useState("");

  const getDocenteIdFromStorage = (): number | null => currentUser?.id ?? null;

  useEffect(() => {
    const docenteId = currentUser?.id ?? null;
    if (!docenteId) return;
    const load = async () => {
      try {
        setLoadingData(true);
        setErrorData(false);
        const res = await fetch(`${API_BASE}/docente/${docenteId}/cronograma`);
        if (!res.ok) throw new Error("Error al cargar cronograma del docente");
        const data = await res.json();
        const list = (data.proyectos || []) as ReportProject[];
        if (list.length > 0) {
          // Complemento de solo lectura: ítems transversales que el cronograma no devuelve (la matriz sí los conoce).
          try {
            const rm = await fetch(`${API_BASE}/docente/${docenteId}/matriz`);
            if (rm.ok) {
              const extra = grupoTransversales(((await rm.json()).items ?? []) as ItemMatriz[], list);
              if (extra) list.push(extra);
            }
          } catch { /* sin el complemento, el cronograma sigue siendo válido */ }
        }
        setProjects(list);
        if (list.length > 0) {
          const projectWithTemplate = requestedTemplateId
            ? list.find((project) => project.weeks?.some((week) => week.entregablesDetalle?.some((item) => Number(item.plantillaId) === requestedTemplateId)))
            : null;
          const initialProject =
            projectWithTemplate ||
            (requestedInitiativeId ? list.find((project) => project.id === requestedInitiativeId) : null) ||
            list.find((project) => project.weeks?.some((week) => (week.entregablesDetalle?.length || 0) > 0)) ||
            list[0];
          const initialWeek =
            (requestedTemplateId ? initialProject.weeks?.find((week) => week.entregablesDetalle?.some((item) => Number(item.plantillaId) === requestedTemplateId)) : null) ||
            initialProject.weeks?.find((week) => (week.entregablesDetalle?.length || 0) > 0) ||
            initialProject.weeks?.[0];
          const initialDeliverable =
            (requestedTemplateId ? initialWeek?.entregablesDetalle?.find((item) => Number(item.plantillaId) === requestedTemplateId) : null) || initialWeek?.entregablesDetalle?.[0];
          setSelectedProjectId(initialProject.id);
          setSelectedWeekId(initialWeek?.id ?? "");
          setSelectedDeliverableKey(initialDeliverable ? deliverableKey(initialDeliverable) : "");
          setActividadRealizada(initialDeliverable?.descripcion || "");
        }
      } catch (e) {
        console.error(e);
        setErrorData(true);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      } finally {
        setLoadingData(false);
      }
    };
    void load();
  }, [currentUser?.id, requestedInitiativeId, requestedTemplateId, reloadKey]);

  // Lectura adicional (endpoint existente) para mostrar estado, instrucciones y observaciones del entregable elegido
  useEffect(() => {
    const docenteId = currentUser?.id ?? null;
    if (!docenteId) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/docente/${docenteId}/evidencias`);
        if (!res.ok) return;
        const d = await res.json();
        const mapa: Record<number, InfoEvidencia> = {};
        for (const i of (d.items ?? []) as InfoEvidencia[]) mapa[i.plantilla_id] = i;
        if (!cancelado) setInfoPorPlantilla(mapa);
      } catch { /* información complementaria */ }
    })();
    return () => { cancelado = true; };
  }, [currentUser?.id, reloadKey, submitted]);

  const selectedProject = useMemo(() => (typeof selectedProjectId === "number" ? projects.find((p) => p.id === selectedProjectId) || null : null), [projects, selectedProjectId]);
  const selectedWeek = useMemo(() => {
    if (!selectedProject || typeof selectedWeekId !== "number") return null;
    return selectedProject.weeks.find((w) => w.id === selectedWeekId) || null;
  }, [selectedProject, selectedWeekId]);
  const selectedDeliverable = useMemo(() => selectedWeek?.entregablesDetalle?.find((item) => deliverableKey(item) === selectedDeliverableKey) || null, [selectedDeliverableKey, selectedWeek]);
  const info = selectedDeliverable?.plantillaId != null ? infoPorPlantilla[Number(selectedDeliverable.plantillaId)] ?? null : null;

  const addLink = () => {
    if (link.trim()) {
      setLinks([...links, link.trim()]);
      setLink("");
    }
  };

  const resolveEntregablesDetalle = async (): Promise<MaterializedDeliverable[]> => {
    if (!selectedDeliverable) return [];
    if (selectedDeliverable.id != null) return [{ ...selectedDeliverable, id: Number(selectedDeliverable.id) }];
    const docenteId = getDocenteIdFromStorage();
    const plantillaId = Number(selectedDeliverable.plantillaId);
    if (!docenteId || !Number.isInteger(plantillaId) || plantillaId <= 0) return [];
    const response = await fetch(`${API_BASE}/docente/${docenteId}/matriz/${plantillaId}/completar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Los transversales no envían proyecto_id: el servidor elige la iniciativa de soporte y los marca como transversales.
      body: JSON.stringify({ completado: false, ...(typeof selectedProjectId === "number" && !selectedProject?.transversal ? { proyecto_id: selectedProjectId } : {}) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isInteger(Number(data.entregable_id))) {
      throw new Error(typeof data.error === "string" ? data.error : "No fue posible preparar este entregable para el reporte.");
    }
    const materializedId = Number(data.entregable_id);
    setProjects((current) => current.map((project) => ({
      ...project,
      weeks: project.weeks.map((week) => ({
        ...week,
        entregablesDetalle: week.entregablesDetalle?.map((item) => (Number(item.plantillaId) === plantillaId ? { ...item, id: materializedId } : item)),
      })),
    })));
    return [{ ...selectedDeliverable, id: materializedId }];
  };

  const handleGuardarBorrador = async () => {
    if (!selectedProject || typeof selectedProjectId !== "number") { notify.warning("Selecciona un proyecto."); return; }
    if (!selectedWeek || typeof selectedWeekId !== "number") { notify.warning("Selecciona una semana."); return; }
    const docenteId = getDocenteIdFromStorage();
    if (!docenteId) { notify.warning("No se pudo identificar el docente."); return; }
    try {
      setGuardando(true);
      const entregablesToSave = await resolveEntregablesDetalle();
      if (entregablesToSave.length === 0) { notify.warning("Selecciona el entregable que deseas guardar."); return; }
      const actividadPayload = actividadRealizada.trim();
      const descripcionPayload = descripcionReporte.trim();
      const requests = entregablesToSave.map((e) =>
        fetch(`${API_BASE}/docente/entregables/${e.id}/borrador`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actividad_reportada: actividadPayload,
            descripcion_reporte: descripcionPayload,
            porcentaje_avance: Math.round(progress),
            urls_evidencia: links,
            ...(links.length === 0 && justificacionSinEvidencia.trim() ? { justificacion_exencion: justificacionSinEvidencia.trim() } : {}),
          }),
        })
      );
      const responses = await Promise.all(requests);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        notify.fromError(data, "No se pudo guardar el borrador.");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
      notify.success("Borrador guardado");
    } catch (err) {
      console.error(err);
      notify.error(err instanceof Error ? err.message : "Error de conexión al guardar el borrador.");
    } finally {
      setGuardando(false);
    }
  };

  const handleSend = async () => {
    if (!selectedWeek) { notify.warning("Selecciona una semana con entregables para reportar."); return; }
    try {
      const docenteId = getDocenteIdFromStorage();
      if (!docenteId) { notify.warning("No se pudo identificar el docente para enviar el reporte."); return; }
      const actividadPayload = actividadRealizada.trim() || null;
      const descripcionPayload = descripcionReporte.trim() || null;
      setSending(true);
      // La fecha de entrega y el primer envío los fija el servidor (hora de Bogotá).
      const entregablesToSend = await resolveEntregablesDetalle();
      if (entregablesToSend.length === 0) { notify.warning("Selecciona el entregable que deseas reportar."); return; }
      const requests = entregablesToSend.map((e) =>
        fetch(`${API_BASE}/docente/entregables/${e.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: true,
            urls_evidencia: links,
            ...(links.length === 0 && justificacionSinEvidencia.trim() ? { justificacion_exencion: justificacionSinEvidencia.trim() } : {}),
            actividad_reportada: actividadPayload,
            descripcion_reporte: descripcionPayload,
            porcentaje_avance: Math.round(progress),
          }),
        })
      );
      const responses = await Promise.all(requests);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const data = await failed.json().catch(() => ({}));
        notify.fromError(data, "No se pudo enviar el reporte.");
        return;
      }
      notify.success("Reporte enviado");
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      notify.error(err instanceof Error ? err.message : "Error de conexión al enviar el reporte.");
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="b2-vista b2-dash b2-scope"><div className="b2-vista-main" data-scroll><div className="b2-pg">
        <section className="b2-card" style={{ maxWidth: 520, margin: "40px auto 0", width: "100%" }}>
          <div className="b2-imp-body" style={{ alignItems: "flex-start" }}>
            <h1 className="b2-imp-h b2-res-h"><span className="b2-res-ok" aria-hidden="true">✓</span>Reporte enviado</h1>
            <p className="b2-imp-help" style={{ fontSize: "var(--fs-md)" }}>Tu reporte se envió y queda pendiente de revisión por el administrador. Puedes seguir su estado en tus evidencias y en el historial.</p>
            <div className="b2-acc-fila">
              <button type="button" className="b2-btn" onClick={() => setSubmitted(false)}>Nuevo reporte</button>
              <button type="button" className="b2-btn" onClick={() => navigate("/docente/historial")}>Ver historial</button>
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/docente")}>Ir al inicio</button>
            </div>
          </div>
        </section>
      </div></div></div>
    );
  }

  const errIniciativa = typeof selectedProjectId !== "number" ? "Selecciona una iniciativa." : null;
  const errSemana = typeof selectedWeekId !== "number" ? "Selecciona una semana." : null;
  const errEntregable = !selectedDeliverable ? "Selecciona el entregable que vas a reportar." : null;
  const errores = [errIniciativa, errSemana, errEntregable].filter(Boolean) as string[];
  const hayErrores = errores.length > 0;

  const intentarEnviar = () => {
    setIntentado(true);
    if (hayErrores) { notify.warning("Revisa los campos marcados antes de enviar."); return; }
    void handleSend();
  };
  const campoError = (msg: string | null, id: string) => (intentado && msg ? <p id={id} role="alert" className="b2-nota-aviso" data-t="err" style={{ marginTop: 6 }}>{msg}</p> : null);
  const invalido = (msg: string | null) => (intentado && msg ? true : undefined);

  const sit = info ? SITUACION[info.situacion] : null;

  return (
    <div className="b2-vista b2-dash b2-scope">
      <div className="b2-vista-main" data-scroll>
        <div className="b2-pg">
          <header className="b2-pg-h">
            <div>
              <h1 className="b2-pg-t">Reportar entregable</h1>
              <p className="b2-pg-s">{selectedWeek ? `Semana ${selectedWeek.numero} · ${fechaLarga(selectedWeek.fechaInicio)} a ${fechaLarga(selectedWeek.fechaFin)}` : "Selecciona una iniciativa, una semana y un entregable."}</p>
            </div>
            <div className="b2-pg-acc"><button type="button" className="b2-btn" onClick={() => navigate("/docente/evidencias")}>Mis evidencias</button></div>
          </header>

          {loadingData ? (
            <section className="b2-card"><div className="b2-skel-w" aria-busy="true">{[60, 90, 80, 70].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div></section>
          ) : errorData ? (
            <div className="b2-alert" role="alert"><span>No se pudo cargar tu cronograma.</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</button></div>
          ) : projects.length === 0 ? (
            <section className="b2-card"><div className="b2-imp-body"><h2 className="b2-imp-h">No tienes iniciativas para reportar</h2><p className="b2-imp-help">Cuando tengas una iniciativa con entregables programados podrás reportarlos aquí.</p><div className="b2-acc-fila"><button type="button" className="b2-btn" onClick={() => navigate("/docente/proyectos")}>Ver mis iniciativas</button></div></div></section>
          ) : (
            <form className="b2-rp" noValidate onSubmit={(e) => { e.preventDefault(); intentarEnviar(); }}>
              <div className="b2-rp-form">
                {intentado && hayErrores && (
                  <div className="b2-nota-aviso" data-t="err" role="alert"><b>Revisa estos campos antes de enviar:</b><ul className="b2-avisos">{errores.map((m) => <li key={m}>{m}</li>)}</ul></div>
                )}

                <section className="b2-card" aria-labelledby="rp-1">
                  <div className="b2-card-h"><h2 id="rp-1">1. Entregable</h2><span className="b2-card-n">Elige qué vas a reportar</span></div>
                  <div className="b2-imp-body" style={{ paddingTop: 4 }}>
                    <div className="b2-imp-grid">
                      <div>
                        <label className="b2-label" htmlFor="rp-iniciativa">Iniciativa *</label>
                        <select id="rp-iniciativa" className="b2-sel" aria-invalid={invalido(errIniciativa)} value={String(selectedProjectId)} onChange={(e) => {
                          const value = e.target.value;
                          if (!value) { setSelectedProjectId(""); setSelectedWeekId(""); setSelectedDeliverableKey(""); setActividadRealizada(""); return; }
                          const idp = Number(value);
                          setSelectedProjectId(idp);
                          const proj = projects.find((p) => p.id === idp);
                          const nextWeek = proj?.weeks.find((week) => (week.entregablesDetalle?.length || 0) > 0) || proj?.weeks[0];
                          if (nextWeek) {
                            const nextDeliverable = nextWeek.entregablesDetalle?.[0];
                            setSelectedWeekId(nextWeek.id);
                            setSelectedDeliverableKey(nextDeliverable ? deliverableKey(nextDeliverable) : "");
                            setActividadRealizada(nextDeliverable?.descripcion || "");
                          } else { setSelectedWeekId(""); setSelectedDeliverableKey(""); setActividadRealizada(""); }
                        }}>
                          <option value="">Seleccionar iniciativa…</option>
                          {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                        </select>
                        {campoError(errIniciativa, "rp-iniciativa-err")}
                      </div>
                      <div>
                        <label className="b2-label" htmlFor="rp-semana">Semana *</label>
                        <select id="rp-semana" className="b2-sel" aria-invalid={invalido(errSemana)} disabled={!selectedProject} value={String(selectedWeekId)} onChange={(e) => {
                          const weekId = e.target.value ? Number(e.target.value) : "";
                          setSelectedWeekId(weekId);
                          const nextWeek = typeof weekId === "number" ? selectedProject?.weeks.find((week) => week.id === weekId) : null;
                          const nextDeliverable = nextWeek?.entregablesDetalle?.[0];
                          setSelectedDeliverableKey(nextDeliverable ? deliverableKey(nextDeliverable) : "");
                          setActividadRealizada(nextDeliverable?.descripcion || "");
                        }}>
                          <option value="">Seleccionar semana…</option>
                          {selectedProject?.weeks.map((w) => <option key={w.id} value={String(w.id)}>Semana {w.numero} ({fechaCorta(w.fechaInicio)} – {fechaCorta(w.fechaFin)})</option>)}
                        </select>
                        {campoError(errSemana, "rp-semana-err")}
                      </div>
                    </div>
                    <div>
                      <label className="b2-label" htmlFor="rp-entregable">Entregable programado *</label>
                      <select id="rp-entregable" className="b2-sel" aria-invalid={invalido(errEntregable)} disabled={!selectedWeek} value={selectedDeliverableKey} onChange={(e) => {
                        setSelectedDeliverableKey(e.target.value);
                        const item = selectedWeek?.entregablesDetalle?.find((c) => deliverableKey(c) === e.target.value);
                        setActividadRealizada(item?.descripcion || "");
                      }}>
                        <option value="">Seleccionar entregable…</option>
                        {(selectedWeek?.entregablesDetalle || []).map((item) => ({ value: deliverableKey(item), label: item.descripcion })).filter((o) => o.value !== "").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {campoError(errEntregable, "rp-entregable-err")}
                      {selectedWeek && selectedWeek.entregables && selectedWeek.entregables.length > 0 && (
                        <details className="b2-det">
                          <summary>Entregables planificados de la semana ({selectedWeek.entregables.length})</summary>
                          <ul className="b2-avisos">{selectedWeek.entregables.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                        </details>
                      )}
                    </div>
                  </div>
                </section>

                <section className="b2-card" aria-labelledby="rp-2">
                  <div className="b2-card-h"><h2 id="rp-2">2. Avance</h2><span className="b2-card-n">Cuánto del entregable está cumplido y qué hiciste</span></div>
                  <div className="b2-imp-body" style={{ paddingTop: 4 }}>
                    <div>
                      <div className="b2-acc-fila" style={{ justifyContent: "space-between" }}>
                        <label className="b2-label" style={{ margin: 0 }} htmlFor="rp-avance">Porcentaje de cumplimiento</label>
                        <b className="b2-acento" style={{ fontVariantNumeric: "tabular-nums" }}>{progress}%</b>
                      </div>
                      <input id="rp-avance" type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="b2-rango" />
                      <div className="b2-rango-e" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                    </div>
                    <div>
                      <label className="b2-label" htmlFor="rp-descripcion">Descripción del reporte</label>
                      <textarea id="rp-descripcion" rows={4} className="b2-input" placeholder="Describe el trabajo realizado, los logros, las dificultades y las observaciones del entregable." value={descripcionReporte} onChange={(e) => setDescripcionReporte(e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="b2-card" aria-labelledby="rp-3">
                  <div className="b2-card-h"><h2 id="rp-3">3. Evidencias</h2><span className="b2-card-n">Enlaces de Drive o Forms que respaldan el entregable</span></div>
                  <div className="b2-imp-body" style={{ paddingTop: 4 }}>
                    <div>
                      <label className="b2-label" htmlFor="rp-enlace">Enlace de evidencia</label>
                      <div className="b2-acc-fila">
                        <input id="rp-enlace" type="url" className="b2-input" style={{ flex: "1 1 240px", width: "auto" }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…"
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
                        <button type="button" className="b2-btn" onClick={addLink}>Agregar</button>
                      </div>
                    </div>
                    {links.length > 0 && (
                      <ul className="b2-evid" aria-label="Enlaces adjuntos">
                        {links.map((l, i) => (
                          <li key={i} className="b2-evid-i">
                            <div className="b2-evid-t"><span className="b2-evid-k">Enlace {i + 1}</span><span className="b2-evid-u" title={l}>{l}{esHttp(l) ? "" : " · no es una dirección válida"}</span></div>
                            <button type="button" className="b2-btn b2-btn-ghost b2-btn-ico b2-btn-sm" aria-label={`Quitar enlace ${l}`} onClick={() => setLinks(links.filter((_, j) => j !== i))}><ICerrar width={14} height={14} /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {links.length === 0 && (
                      <div>
                        <label className="b2-label" htmlFor="rp-justificacion">¿No aplica evidencia? Justifícalo (mínimo 10 caracteres)</label>
                        <textarea id="rp-justificacion" rows={2} className="b2-input" value={justificacionSinEvidencia} onChange={(e) => setJustificacionSinEvidencia(e.target.value)} placeholder="Solo si el entregable no tiene evidencia que cargar. El administrador lo revisará." />
                      </div>
                    )}
                    <p className="b2-nota-aviso" data-t="warn" role="note"><b>{AVISO_ACCESO}</b> Tus archivos permanecen en tu Drive; ProySocial solo guarda los enlaces.</p>
                  </div>
                </section>

                <div className="b2-rp-barra">
                  <div className="b2-rp-estado" aria-live="polite">
                    {savedAt ? `Borrador guardado a las ${savedAt}` : selectedWeek ? `Fecha límite de la semana ${selectedWeek.numero}: ${fechaLarga(selectedWeek.fechaFin)}` : "Selecciona una semana para ver su fecha límite."}
                    <span> · {links.length} {links.length === 1 ? "enlace" : "enlaces"} · {progress}%</span>
                  </div>
                  <div className="b2-acc-fila">
                    <button type="button" className="b2-btn" onClick={() => void handleGuardarBorrador()} disabled={guardando || sending}>{guardando && <span className="b2-spin" aria-hidden="true" />}{guardando ? "Guardando…" : "Guardar borrador"}</button>
                    <button type="submit" className="b2-btn b2-btn-primary" disabled={sending || guardando}>{sending && <span className="b2-spin" aria-hidden="true" />}{sending ? "Enviando…" : "Enviar reporte"}</button>
                  </div>
                </div>
              </div>

              <aside className="b2-rp-lado" aria-label="Estado e instrucciones del entregable">
                <section className="b2-card">
                  <div className="b2-card-h"><h2>Entregable seleccionado</h2></div>
                  {!selectedDeliverable ? <p className="b2-vacio">Elige un entregable para ver su estado, las instrucciones y las observaciones.</p> : (
                    <div className="b2-rp-info">
                      <p className="b2-insp-h" style={{ margin: 0 }}>{selectedDeliverable.descripcion}</p>
                      {sit && <div className="b2-acc-fila"><Estado kind={sit.kind} label={sit.label} />{info?.vencido && info.situacion !== "aprobada" && info.situacion !== "en_revision" && <span className="b2-venc-tag">Vencido</span>}</div>}
                      {info?.problema_acceso && <div className="b2-callout b2-callout-d"><strong>Coordinación no pudo abrir tu evidencia</strong><p>Revisa los permisos del enlace en tu Drive y vuelve a enviar.</p></div>}
                      {info?.situacion === "observada" && <div className="b2-callout"><strong>Observación del revisor{info.revisado_en ? ` · ${formatDateTimeBogota(info.revisado_en)}` : ""}</strong><p>{info.comentario_revision || "El revisor solicitó correcciones."}</p></div>}
                      {info?.situacion === "aprobada" && <p className="b2-nota-aviso" data-t="ok">Este entregable ya está aprobado y no puede modificarse. Si hay un error, solicita su reapertura al administrador.</p>}
                      {info?.situacion === "en_revision" && <p className="b2-nota-aviso" data-t="warn">Ya está en revisión. Para corregirlo, retira el envío desde Mis evidencias.</p>}
                      <details key={movil ? "m" : "d"} className="b2-det b2-det-info" open={!movil}>
                        <summary>Instrucciones, evidencias y datos</summary>
                      <h3 className="b2-insp-sub" style={{ margin: "4px 0 0" }}>Instrucciones</h3>
                      <p className="b2-insp-p" style={{ overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{info ? (info.requiere_evidencia ? info.descripcion_evidencia || "Enlace a la evidencia." : "No se requiere cargue de evidencia para este entregable.") : "Cargando instrucciones…"}</p>
                      {info?.enlace_referencia && esHttp(info.enlace_referencia) && <a className="b2-link" href={info.enlace_referencia} target="_blank" rel="noopener noreferrer">Ver referencia</a>}
                      {info && info.evidencias.length > 0 && (<><h3 className="b2-insp-sub" style={{ margin: "4px 0 0" }}>Evidencias ya registradas</h3><EnlacesB2 lista={info.evidencias} /></>)}
                      <dl className="b2-dl" style={{ marginTop: 4 }}>
                        <div className="b2-dl-r"><dt>Límite</dt><dd>{info?.fecha_fin ? fechaLarga(info.fecha_fin) : selectedDeliverable && (selectedDeliverable as { fecha_fin?: string | null }).fecha_fin ? fechaLarga(String((selectedDeliverable as { fecha_fin?: string | null }).fecha_fin)) : "—"}</dd></div>
                        <div className="b2-dl-r"><dt>Envíos</dt><dd>{info?.num_envios ?? 0}</dd></div>
                      </dl>
                      </details>
                      {info && <button type="button" className="b2-link-btn" onClick={() => navigate(`/docente/evidencias?entregable=${info.plantilla_id}`)}>Ver historial y versiones en Mis evidencias</button>}
                    </div>
                  )}
                </section>
              </aside>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
