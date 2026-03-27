import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FileEdit, Save, Send, Link2, CheckCircle2, X } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

type ReportWeek = {
  id: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables: string[];
  entregablesDetalle?: {
    id: number;
    descripcion: string;
    completado?: boolean;
    url_evidencia?: string | null;
    fecha_real_entrega?: string | null;
  }[];
};

type ReportProject = {
  id: number;
  name: string;
  weeks: ReportWeek[];
};

type IniciativaDetalle = {
  semanasDetalle?: {
    id: number;
    numero: number;
    entregables: {
      id: number;
      descripcion: string;
      completado?: boolean;
      url_evidencia?: string | null;
      fecha_real_entrega?: string | null;
    }[];
  }[];
};

export default function ReportProgress() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [submitted, setSubmitted] = useState(false);
  const [link, setLink] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [progress, setProgress] = useState(75);
  const [projects, setProjects] = useState<ReportProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [selectedWeekId, setSelectedWeekId] = useState<number | "">("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(null);
        const res = await fetch(`${API_BASE_URL}/docente/${docenteId}/cronograma`);
        if (!res.ok) throw new Error("Error al cargar cronograma del docente");
        const data = await res.json();
        const list = (data.proyectos || []) as ReportProject[];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId(list[0].id);
          if (list[0].weeks && list[0].weeks.length > 0) {
            setSelectedWeekId(list[0].weeks[0].id);
          }
        }
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
      }
    };

    load();
  }, [currentUser]);

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

  const addLink = () => {
    if (link.trim()) {
      setLinks([...links, link.trim()]);
      setLink("");
    }
  };

  const handleSend = async () => {
    if (!selectedWeek) {
      alert("Selecciona una semana con entregables para reportar.");
      return;
    }
    try {
      const docenteId = getDocenteIdFromStorage();
      if (!docenteId) {
        alert("No se pudo identificar el docente para enviar el reporte.");
        return;
      }
      const actividadPayload = actividadRealizada.trim() || null;
      const descripcionPayload = descripcionReporte.trim() || null;
      setSending(true);
      const today = new Date().toISOString().slice(0, 10);
      const evidenceUrl = links[0] || null;

      let entregablesToSend = selectedWeek.entregablesDetalle || [];

      // Fallback: si cronograma no trae detalle con ids, obtenerlos desde detalle de iniciativa.
      if (entregablesToSend.length === 0 && typeof selectedProjectId === "number") {
        const docenteId = getDocenteIdFromStorage();
        if (docenteId) {
          const resDetail = await fetch(
            `${API_BASE_URL}/docente/${docenteId}/iniciativas/${selectedProjectId}`
          );
          if (resDetail.ok) {
            const detail = (await resDetail.json()) as IniciativaDetalle;
            const weekDetail = (detail.semanasDetalle || []).find(
              (w) => Number(w.numero) === Number(selectedWeek.numero)
            );
            entregablesToSend = weekDetail?.entregables || [];
          }
        }
      }

      if (entregablesToSend.length === 0) {
        alert("Esta semana no tiene entregables con ID para reportar aún.");
        return;
      }

      const requests = entregablesToSend.map((e) =>
        fetch(`${API_BASE_URL}/docente/entregables/${e.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: true,
            fecha_real_entrega: today,
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
        alert(data.error || "No se pudo enviar el reporte.");
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("Error de conexión al enviar el reporte.");
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
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-[#1e3a8a] rounded-lg flex items-center justify-center">
          <FileEdit className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-gray-900">Reportar Avance</h1>
          <p className="text-gray-500 text-sm">
            {selectedWeek
              ? `Semana ${selectedWeek.numero} — ${selectedWeek.fechaInicio} a ${selectedWeek.fechaFin}`
              : "Selecciona un proyecto y una semana"}
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
                  Proyecto *
                </label>
                <select
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  value={selectedProjectId}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      setSelectedProjectId("");
                      setSelectedWeekId("");
                      return;
                    }
                    const id = Number(value);
                    setSelectedProjectId(id);
                    const proj = projects.find((p) => p.id === id);
                    if (proj && proj.weeks && proj.weeks.length > 0) {
                      setSelectedWeekId(proj.weeks[0].id);
                    } else {
                      setSelectedWeekId("");
                    }
                  }}
                >
                  <option value="">Seleccionar proyecto...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Semana *
                </label>
                <select
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  value={selectedWeekId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedWeekId(value ? Number(value) : "");
                  }}
                  disabled={!selectedProject}
                >
                  <option value="">Seleccionar semana...</option>
                  {selectedProject &&
                    selectedProject.weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Semana {w.numero} ({w.fechaInicio} - {w.fechaFin})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Actividad realizada *
              </label>
              <input
                type="text"
                placeholder="Ej: Taller de uso de herramientas digitales básicas"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                value={actividadRealizada}
                onChange={(e) => setActividadRealizada(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                Porcentaje de avance: <span className="text-[#1d4ed8]">{progress}%</span>
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
                Descripción de actividades *
              </label>
              <textarea
                rows={4}
                placeholder="Describe las actividades realizadas durante la semana, logros, dificultades y observaciones..."
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
                <span className="text-gray-500">Avance reportado</span>
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
                className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                style={{ fontWeight: 500 }}
              >
                <Save className="w-4 h-4" /> Guardar borrador
              </button>
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
              El reporte semanal debe enviarse antes del <strong>viernes 15 de marzo</strong> a las
              23:59 hrs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
