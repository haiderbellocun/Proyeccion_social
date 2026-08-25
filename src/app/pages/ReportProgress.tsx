import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FileEdit, Loader2, Save, Send, Link2, CheckCircle2, X } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { AppSelect } from "../components/AppSelect";
import { formatDateOnly } from "../lib/date";

const API_BASE_URL = API_BASE;

function getViernesActual(): string {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const diasHastaViernes = (5 - diaSemana + 7) % 7;
  const viernes = new Date(hoy);
  viernes.setDate(hoy.getDate() + diasHastaViernes);
  return viernes.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

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

  const [actividadRealizada, setActividadRealizada] = useState("");
  const [descripcionReporte, setDescripcionReporte] = useState("");

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
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      }
    };

    load();
  }, [currentUser?.id, requestedInitiativeId, requestedTemplateId]);

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
        body: JSON.stringify({ completado: false }),
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
            docente_id: docenteId,
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
      const evidenceUrl = links[0] || null;

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
            url_evidencia: evidenceUrl,
            docente_id: docenteId,
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
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center max-w-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-gray-900 mb-2">¡Reporte enviado!</h2>
          <p className="text-gray-500 text-sm">
            Tu reporte semanal fue enviado correctamente y está pendiente de
            revisión por el administrador.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setSubmitted(false)}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Nuevo reporte
            </button>
            <button
              onClick={() => navigate("/docente")}
              className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm hover:bg-[#1d4ed8] transition-colors"
              style={{ fontWeight: 600 }}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-[#1e3a8a] rounded-lg flex items-center justify-center">
          <FileEdit className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-gray-900">Reportar entregable</h1>
          <p className="text-gray-500 text-sm">
            {selectedWeek
              ? `Semana ${selectedWeek.numero} — ${formatDateOnly(
                  selectedWeek.fechaInicio
                )} a ${formatDateOnly(selectedWeek.fechaFin)}`
              : "Selecciona una iniciativa, una semana y un entregable"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form */}
        <div className="xl:col-span-2 space-y-5">
          {/* Project & activity */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="text-gray-800 border-b border-gray-100 pb-3">
              Información del Reporte
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Iniciativa *
                </label>
                <AppSelect
                  className="w-full"
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
                  placeholder="Seleccionar iniciativa..."
                  options={projects.map((p) => ({
                    value: String(p.id),
                    label: p.name,
                  }))}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Semana *
                </label>
                <AppSelect
                  className="w-full"
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
                  placeholder="Seleccionar semana..."
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
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Entregable programado *
              </label>
              <AppSelect
                className="w-full"
                value={selectedDeliverableKey}
                onValueChange={(value) => {
                  setSelectedDeliverableKey(value);
                  const item = selectedWeek?.entregablesDetalle?.find(
                    (candidate) => deliverableKey(candidate) === value
                  );
                  setActividadRealizada(item?.descripcion || "");
                }}
                placeholder="Seleccionar entregable..."
                disabled={!selectedWeek}
                options={(selectedWeek?.entregablesDetalle || [])
                  .map((item) => ({
                    value: deliverableKey(item),
                    label: item.descripcion,
                  }))
                  .filter((option) => option.value !== "")}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Porcentaje de cumplimiento: <span className="text-[#1d4ed8]">{progress}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-[#1d4ed8]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Descripción del reporte *
              </label>
              <textarea
                rows={4}
                placeholder="Describe el trabajo realizado, los logros, las dificultades y las observaciones del entregable..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none"
                value={descripcionReporte}
                onChange={(e) => setDescripcionReporte(e.target.value)}
              />
            </div>
          </div>

          {/* Evidencias en formulario */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="text-gray-800 border-b border-gray-100 pb-3">
              Evidencias
            </h3>

            {/* Enlace de evidencia */}
            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                <Link2 className="inline w-3.5 h-3.5 mr-1" />
                Enlace de evidencia
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                />
                <button
                  onClick={addLink}
                  className="px-4 py-2.5 bg-[#1e3a8a] text-white rounded-lg text-sm hover:bg-[#1d4ed8] transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  Agregar
                </button>
              </div>
              {links.length > 0 && (
                <div className="mt-2 space-y-1">
                  {links.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-[#1d4ed8] bg-blue-50 px-3 py-1.5 rounded-lg">
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{l}</span>
                      <button onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Side summary */}
        <div className="space-y-5">
          {selectedWeek && selectedWeek.entregables && selectedWeek.entregables.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-gray-800 mb-3">Entregables planificados</h3>
              <ul className="space-y-1.5 text-xs text-gray-700">
                {selectedWeek.entregables.map((item, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#1d4ed8]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-4">Resumen del Reporte</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Cumplimiento reportado</span>
                <span className="text-gray-800" style={{ fontWeight: 600 }}>{progress}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Enlaces adjuntos</span>
                <span className="text-gray-800" style={{ fontWeight: 600 }}>{links.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-xs" style={{ fontWeight: 500 }}>Borrador</span>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => void handleGuardarBorrador()}
                disabled={guardando}
                className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontWeight: 500 }}
              >
                {guardando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}{" "}
                {guardando ? "Guardando…" : "Guardar borrador"}
              </button>
              {savedAt && (
                <span className="text-xs text-gray-500 block text-center">
                  Borrador guardado a las {savedAt}
                </span>
              )}
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
              >
                <Send className="w-4 h-4" /> {sending ? "Enviando..." : "Enviar reporte"}
              </button>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
            <p className="text-[#1e3a8a] text-sm" style={{ fontWeight: 600 }}>Recordatorio</p>
            <p className="text-blue-700 text-xs mt-1">
              El reporte semanal debe enviarse antes del <strong>{getViernesActual()}</strong> a las
              23:59 hrs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
