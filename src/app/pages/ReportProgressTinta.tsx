import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FileEdit, Loader2, Save, Send, Link2, CheckCircle2, X, AlertCircle } from "lucide-react";
import { EmptyState, InlineAlert, Page, PageHeader, PageLoading, Panel, StatusPill } from "../components/ds/primitives";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { AppSelect } from "../components/AppSelect";
import { formatDateOnly } from "../lib/date";

const API_BASE_URL = API_BASE;

type ReportWeek = {
  id: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables: string[];
  entregablesDetalle?: {
    id: number | null;
    plantillaId?: number | null;
    descripcion: string;
    completado?: boolean;
    url_evidencia?: string | null;
    fecha_real_entrega?: string | null;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
  }[];
};

type ReportProject = {
  id: number;
  name: string;
  weeks: ReportWeek[];
};

type EntregableDetalleItem = {
  id: number | null;
  plantillaId?: number | null;
  descripcion: string;
  completado?: boolean;
  url_evidencia?: string | null;
  fecha_real_entrega?: string | null;
};

type MaterializedDeliverable = Omit<EntregableDetalleItem, "id"> & { id: number };

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

  const [actividadRealizada, setActividadRealizada] = useState("");
  const [descripcionReporte, setDescripcionReporte] = useState("");
  // Excepción: solo cuando el entregable no tiene evidencia que cargar (queda registrada y la revisa el administrador).
  const [justificacionSinEvidencia, setJustificacionSinEvidencia] = useState("");

  const getDocenteIdFromStorage = (): number | null => {
    return currentUser?.id ?? null;
  };

  useEffect(() => {
    const docenteId = currentUser?.id ?? null;

    if (!docenteId) {
      return;
    }

    const load = async () => {
      try {
        setLoadingData(true);
        setErrorData(false);
        const res = await fetch(`${API_BASE_URL}/docente/${docenteId}/cronograma`);
        if (!res.ok) throw new Error("Error al cargar cronograma del docente");
        const data = await res.json();
        const list = (data.proyectos || []) as ReportProject[];
        setProjects(list);
        if (list.length > 0) {
          const projectWithTemplate = requestedTemplateId
            ? list.find((project) =>
                project.weeks?.some((week) =>
                  week.entregablesDetalle?.some(
                    (item) => Number(item.plantillaId) === requestedTemplateId
                  )
                )
              )
            : null;
          const initialProject =
            projectWithTemplate ||
            (requestedInitiativeId
              ? list.find((project) => project.id === requestedInitiativeId)
              : null) ||
            list.find((project) =>
              project.weeks?.some((week) => (week.entregablesDetalle?.length || 0) > 0)
            ) ||
            list[0];
          const initialWeek =
            (requestedTemplateId
              ? initialProject.weeks?.find((week) =>
                  week.entregablesDetalle?.some(
                    (item) => Number(item.plantillaId) === requestedTemplateId
                  )
                )
              : null) ||
            initialProject.weeks?.find(
              (week) => (week.entregablesDetalle?.length || 0) > 0
            ) ||
            initialProject.weeks?.[0];
          const initialDeliverable =
            (requestedTemplateId
              ? initialWeek?.entregablesDetalle?.find(
                  (item) => Number(item.plantillaId) === requestedTemplateId
                )
              : null) || initialWeek?.entregablesDetalle?.[0];

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

    load();
  }, [currentUser?.id, requestedInitiativeId, requestedTemplateId, reloadKey]);

  const selectedProject = useMemo(
    () =>
      typeof selectedProjectId === "number"
        ? projects.find((p) => p.id === selectedProjectId) || null
        : null,
    [projects, selectedProjectId]
  );

  const selectedWeek = useMemo(() => {
    if (!selectedProject || typeof selectedWeekId !== "number") return null;
    return selectedProject.weeks.find((w) => w.id === selectedWeekId) || null;
  }, [selectedProject, selectedWeekId]);

  const selectedDeliverable = useMemo(
    () =>
      selectedWeek?.entregablesDetalle?.find(
        (item) => deliverableKey(item) === selectedDeliverableKey
      ) || null,
    [selectedDeliverableKey, selectedWeek]
  );

  const addLink = () => {
    if (link.trim()) {
      setLinks([...links, link.trim()]);
      setLink("");
    }
  };

  const resolveEntregablesDetalle = async (): Promise<MaterializedDeliverable[]> => {
    if (!selectedDeliverable) return [];
    if (selectedDeliverable.id != null) {
      return [{ ...selectedDeliverable, id: Number(selectedDeliverable.id) }];
    }

    const docenteId = getDocenteIdFromStorage();
    const plantillaId = Number(selectedDeliverable.plantillaId);
    if (!docenteId || !Number.isInteger(plantillaId) || plantillaId <= 0) return [];

    const response = await fetch(
      `${API_BASE_URL}/docente/${docenteId}/matriz/${plantillaId}/completar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completado: false,
          ...(typeof selectedProjectId === "number" ? { proyecto_id: selectedProjectId } : {}),
        }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isInteger(Number(data.entregable_id))) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "No fue posible preparar este entregable para el reporte."
      );
    }

    const materializedId = Number(data.entregable_id);
    setProjects((current) =>
      current.map((project) => ({
        ...project,
        weeks: project.weeks.map((week) => ({
          ...week,
          entregablesDetalle: week.entregablesDetalle?.map((item) =>
            Number(item.plantillaId) === plantillaId
              ? { ...item, id: materializedId }
              : item
          ),
        })),
      }))
    );
    return [{ ...selectedDeliverable, id: materializedId }];
  };

  const handleGuardarBorrador = async () => {
    if (!selectedProject || typeof selectedProjectId !== "number") {
      notify.warning("Selecciona un proyecto.");
      return;
    }
    if (!selectedWeek || typeof selectedWeekId !== "number") {
      notify.warning("Selecciona una semana.");
      return;
    }
    const docenteId = getDocenteIdFromStorage();
    if (!docenteId) {
      notify.warning("No se pudo identificar el docente.");
      return;
    }
    try {
      setGuardando(true);
      const entregablesToSave = await resolveEntregablesDetalle();
      if (entregablesToSave.length === 0) {
        notify.warning("Selecciona el entregable que deseas guardar.");
        return;
      }
      const actividadPayload = actividadRealizada.trim();
      const descripcionPayload = descripcionReporte.trim();
      const requests = entregablesToSave.map((e) =>
        fetch(`${API_BASE_URL}/docente/entregables/${e.id}/borrador`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actividad_reportada: actividadPayload,
            descripcion_reporte: descripcionPayload,
            porcentaje_avance: Math.round(progress),
            urls_evidencia: links,
            ...(links.length === 0 && justificacionSinEvidencia.trim()
              ? { justificacion_exencion: justificacionSinEvidencia.trim() }
              : {}),
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
      notify.error(
        err instanceof Error
          ? err.message
          : "Error de conexión al guardar el borrador."
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleSend = async () => {
    if (!selectedWeek) {
      notify.warning("Selecciona una semana con entregables para reportar.");
      return;
    }
    try {
      const docenteId = getDocenteIdFromStorage();
      if (!docenteId) {
        notify.warning("No se pudo identificar el docente para enviar el reporte.");
        return;
      }
      const actividadPayload = actividadRealizada.trim() || null;
      const descripcionPayload = descripcionReporte.trim() || null;
      setSending(true);
      // La fecha de entrega y el primer envío los fija el servidor (hora de Bogotá).

      const entregablesToSend = await resolveEntregablesDetalle();

      if (entregablesToSend.length === 0) {
        notify.warning("Selecciona el entregable que deseas reportar.");
        return;
      }

      const requests = entregablesToSend.map((e) =>
        fetch(`${API_BASE_URL}/docente/entregables/${e.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: true,
            urls_evidencia: links,
            ...(links.length === 0 && justificacionSinEvidencia.trim()
              ? { justificacion_exencion: justificacionSinEvidencia.trim() }
              : {}),
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
      notify.error(
        err instanceof Error ? err.message : "Error de conexión al enviar el reporte."
      );
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <Page>
        <div className="mx-auto max-w-md pt-10">
          <Panel>
            <EmptyState
              icon={CheckCircle2}
              title="Reporte enviado"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => setSubmitted(false)} className="ds-btn ds-btn-secondary">
                    Nuevo reporte
                  </button>
                  <button type="button" onClick={() => navigate("/docente")} className="ds-btn ds-btn-primary">
                    Ir al inicio
                  </button>
                </div>
              }
            >
              Tu reporte semanal se envió y queda pendiente de revisión por el administrador.
            </EmptyState>
          </Panel>
        </div>
      </Page>
    );
  }

  const errIniciativa = typeof selectedProjectId !== "number" ? "Selecciona una iniciativa." : null;
  const errSemana = typeof selectedWeekId !== "number" ? "Selecciona una semana." : null;
  const errEntregable = !selectedDeliverable ? "Selecciona el entregable que vas a reportar." : null;
  // La descripción y la evidencia no se bloquean en el cliente: las reglas de evidencia las aplica el servidor
  // según lo que exige cada entregable (enlace, formulario o ninguna).
  const errDescripcion: string | null = null;
  const errEvidencia: string | null = null;
  const hayErrores = Boolean(errIniciativa || errSemana || errEntregable || errDescripcion || errEvidencia);

  const intentarEnviar = () => {
    setIntentado(true);
    if (hayErrores) {
      notify.warning("Revisa los campos marcados antes de enviar.");
      return;
    }
    void handleSend();
  };

  const campoError = (msg: string | null, id: string) =>
    intentado && msg ? (
      <p id={id} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-red-700">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {msg}
      </p>
    ) : null;
  const invalid = (msg: string | null) => (intentado && msg ? "border-red-500" : "");

  return (
    <Page>
      <PageHeader
        title="Reportar entregable"
        description={
          selectedWeek
            ? `Semana ${selectedWeek.numero} · ${formatDateOnly(selectedWeek.fechaInicio)} a ${formatDateOnly(selectedWeek.fechaFin)}`
            : "Selecciona una iniciativa, una semana y un entregable."
        }
        meta={<StatusPill tone="brand">Borrador</StatusPill>}
      />

      {loadingData ? (
        <PageLoading label="Cargando cronograma…" />
      ) : errorData ? (
        <InlineAlert action={<button type="button" onClick={() => setReloadKey((k) => k + 1)} className="ds-btn ds-btn-secondary ds-btn-sm">Reintentar</button>}>
          No se pudo cargar tu cronograma.
        </InlineAlert>
      ) : projects.length === 0 ? (
        <Panel>
          <EmptyState icon={FileEdit} title="No tienes iniciativas para reportar" action={<button type="button" onClick={() => navigate("/docente/proyectos")} className="ds-btn ds-btn-secondary">Ver mis iniciativas</button>}>
            Cuando tengas una iniciativa con entregables programados podrás reportarlos aquí.
          </EmptyState>
        </Panel>
      ) : (
        <form
          className="mx-auto w-full max-w-3xl space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            intentarEnviar();
          }}
        >
          <Panel title="1. Entregable" description="Elige qué vas a reportar.">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div role="group" aria-labelledby="rp-iniciativa-l">
                  <span id="rp-iniciativa-l" className="ds-label">Iniciativa *</span>
                  <AppSelect
                    className={`w-full ${invalid(errIniciativa)}`}
                    value={String(selectedProjectId)}
                    onValueChange={(value) => {
                      if (!value) {
                        setSelectedProjectId("");
                        setSelectedWeekId("");
                        setSelectedDeliverableKey("");
                        setActividadRealizada("");
                        return;
                      }
                      const id = Number(value);
                      setSelectedProjectId(id);
                      const proj = projects.find((p) => p.id === id);
                      const nextWeek =
                        proj?.weeks.find(
                          (week) => (week.entregablesDetalle?.length || 0) > 0
                        ) || proj?.weeks[0];
                      if (nextWeek) {
                        const nextDeliverable = nextWeek.entregablesDetalle?.[0];
                        setSelectedWeekId(nextWeek.id);
                        setSelectedDeliverableKey(
                          nextDeliverable ? deliverableKey(nextDeliverable) : ""
                        );
                        setActividadRealizada(nextDeliverable?.descripcion || "");
                      } else {
                        setSelectedWeekId("");
                        setSelectedDeliverableKey("");
                        setActividadRealizada("");
                      }
                    }}
                    placeholder="Seleccionar iniciativa…"
                    options={projects.map((p) => ({
                      value: String(p.id),
                      label: p.name,
                    }))}
                  />
                  {campoError(errIniciativa, "rp-iniciativa-err")}
                </div>

                <div role="group" aria-labelledby="rp-semana-l">
                  <span id="rp-semana-l" className="ds-label">Semana *</span>
                  <AppSelect
                    className={`w-full ${invalid(errSemana)}`}
                    value={String(selectedWeekId)}
                    onValueChange={(value) => {
                      const weekId = value ? Number(value) : "";
                      setSelectedWeekId(weekId);
                      const nextWeek =
                        typeof weekId === "number"
                          ? selectedProject?.weeks.find((week) => week.id === weekId)
                          : null;
                      const nextDeliverable = nextWeek?.entregablesDetalle?.[0];
                      setSelectedDeliverableKey(
                        nextDeliverable ? deliverableKey(nextDeliverable) : ""
                      );
                      setActividadRealizada(nextDeliverable?.descripcion || "");
                    }}
                    placeholder="Seleccionar semana…"
                    disabled={!selectedProject}
                    options={
                      selectedProject
                        ? selectedProject.weeks.map((w) => ({
                            value: String(w.id),
                            label: `Semana ${w.numero} (${formatDateOnly(
                              w.fechaInicio
                            )} - ${formatDateOnly(w.fechaFin)})`,
                          }))
                        : []
                    }
                  />
                  {campoError(errSemana, "rp-semana-err")}
                </div>
              </div>

              <div role="group" aria-labelledby="rp-entregable-l">
                <span id="rp-entregable-l" className="ds-label">Entregable programado *</span>
                <AppSelect
                  className={`w-full ${invalid(errEntregable)}`}
                  value={selectedDeliverableKey}
                  onValueChange={(value) => {
                    setSelectedDeliverableKey(value);
                    const item = selectedWeek?.entregablesDetalle?.find(
                      (candidate) => deliverableKey(candidate) === value
                    );
                    setActividadRealizada(item?.descripcion || "");
                  }}
                  placeholder="Seleccionar entregable…"
                  disabled={!selectedWeek}
                  options={(selectedWeek?.entregablesDetalle || [])
                    .map((item) => ({
                      value: deliverableKey(item),
                      label: item.descripcion,
                    }))
                    .filter((option) => option.value !== "")}
                />
                {campoError(errEntregable, "rp-entregable-err")}
                {selectedWeek && selectedWeek.entregables && selectedWeek.entregables.length > 0 && (
                  <details className="mt-2 text-xs text-text-muted">
                    <summary className="cursor-pointer select-none text-text-subtle hover:text-text">
                      Entregables planificados de la semana ({selectedWeek.entregables.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {selectedWeek.entregables.map((item, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="2. Avance" description="Cuánto del entregable está cumplido y qué hiciste.">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="ds-label !mb-0" htmlFor="rp-avance">Porcentaje de cumplimiento</label>
                  <span className="text-sm tabular-nums text-brand" style={{ fontWeight: 650 }}>{progress}%</span>
                </div>
                <input
                  id="rp-avance"
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-brand"
                />
                <div className="mt-1 flex justify-between text-xs text-text-subtle tabular-nums" aria-hidden>
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              <div>
                <label className="ds-label" htmlFor="rp-descripcion">Descripción del reporte *</label>
                <textarea
                  id="rp-descripcion"
                  rows={4}
                  placeholder="Describe el trabajo realizado, los logros, las dificultades y las observaciones del entregable."
                  className={`ds-input resize-y ${invalid(errDescripcion)}`}
                  aria-invalid={intentado && !!errDescripcion}
                  aria-describedby={intentado && errDescripcion ? "rp-descripcion-err" : undefined}
                  value={descripcionReporte}
                  onChange={(e) => setDescripcionReporte(e.target.value)}
                />
                {campoError(errDescripcion, "rp-descripcion-err")}
              </div>
            </div>
          </Panel>

          <Panel title="3. Evidencias" description="Enlaces de Drive o Forms que respaldan el entregable.">
            <div className="space-y-3">
              <div>
                <label className="ds-label" htmlFor="rp-enlace">Enlace de evidencia</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
                    <input
                      id="rp-enlace"
                      type="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://drive.google.com/…"
                      className="ds-input pl-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLink();
                        }
                      }}
                    />
                  </div>
                  <button type="button" onClick={addLink} className="ds-btn ds-btn-secondary">
                    Agregar
                  </button>
                </div>
              </div>

              {links.length > 0 && (
                <ul className="space-y-1.5" aria-label="Enlaces adjuntos">
                  {links.map((l, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
                      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{l}</span>
                      <button
                        type="button"
                        aria-label={`Quitar enlace ${l}`}
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                        className="rounded p-0.5 text-text-subtle hover:text-red-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {links.length === 0 && (
                <div>
                  <label className="ds-label" htmlFor="rp-justificacion">
                    ¿No aplica evidencia? Justifícalo (mínimo 10 caracteres)
                  </label>
                  <textarea
                    id="rp-justificacion"
                    rows={2}
                    value={justificacionSinEvidencia}
                    onChange={(e) => setJustificacionSinEvidencia(e.target.value)}
                    placeholder="Solo si el entregable no tiene evidencia que cargar. El administrador lo revisará."
                    className={`ds-input resize-y ${invalid(errEvidencia)}`}
                    aria-invalid={intentado && !!errEvidencia}
                    aria-describedby={intentado && errEvidencia ? "rp-evidencia-err" : undefined}
                  />
                </div>
              )}
              {campoError(errEvidencia, "rp-evidencia-err")}
            </div>
          </Panel>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-xs backdrop-blur">
            <div className="text-xs text-text-subtle" aria-live="polite">
              {savedAt ? `Borrador guardado a las ${savedAt}` : selectedWeek ? `Fecha límite de la semana ${selectedWeek.numero}: ${formatDateOnly(selectedWeek.fechaFin)}` : "Selecciona una semana para ver su fecha límite."}
              <span className="ml-2 tabular-nums">· {links.length} {links.length === 1 ? "enlace" : "enlaces"} · {progress}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGuardarBorrador()}
                disabled={guardando || sending}
                className="ds-btn ds-btn-secondary"
              >
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {guardando ? "Guardando…" : "Guardar borrador"}
              </button>
              <button type="submit" disabled={sending || guardando} className="ds-btn ds-btn-primary">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {sending ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </div>
        </form>
      )}
    </Page>
  );
}
