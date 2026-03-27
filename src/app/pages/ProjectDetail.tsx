import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Link2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Badge } from "../components/Badge";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

type Entregable = {
  id: number;
  descripcion: string;
  horas: number | null;
  completado: boolean;
  fecha_completado: string | null;
  url_evidencia: string | null;
  fecha_real_entrega: string | null;
};

type Semana = {
  id: number;
  numero: number;
  fecha_inicio: string;
  fecha_fin: string;
  entregables: Entregable[];
};

type InitiativeDetail = {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  estado: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  horasTotales: number | null;
  programa: string;
  coordinador: string;
  semanasDetalle: Semana[];
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [initiative, setInitiative] = useState<InitiativeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [evidenceInputs, setEvidenceInputs] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = currentUser?.id ?? null;
    if (!userId || !id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `${API_BASE_URL}/docente/${userId}/iniciativas/${id}`
        );
        if (!res.ok) {
          setInitiative(null);
          return;
        }
        const data = (await res.json()) as InitiativeDetail;
        setInitiative(data);

        const inputs: Record<number, string> = {};
        (data.semanasDetalle || []).forEach((s) =>
          (s.entregables || []).forEach((e) => {
            inputs[e.id] = e.url_evidencia || "";
          })
        );
        setEvidenceInputs(inputs);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
        setInitiative(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, currentUser]);

  const handleSaveEntregable = async (
    entregable: Entregable,
    nuevoCompletado: boolean
  ) => {
    try {
      setSaving(entregable.id);
      const res = await fetch(
        `${API_BASE_URL}/docente/entregables/${entregable.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: nuevoCompletado,
            url_evidencia: evidenceInputs[entregable.id] || null,
            fecha_real_entrega: nuevoCompletado
              ? new Date().toISOString().slice(0, 10)
              : null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo guardar el entregable.");
        return;
      }

      setInitiative((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          semanasDetalle: prev.semanasDetalle.map((s) => ({
            ...s,
            entregables: s.entregables.map((e) => {
              if (e.id !== entregable.id) return e;
              return {
                ...e,
                completado: nuevoCompletado,
                url_evidencia: evidenceInputs[entregable.id] || null,
                fecha_real_entrega: nuevoCompletado
                  ? new Date().toISOString().slice(0, 10)
                  : null,
                fecha_completado: nuevoCompletado
                  ? new Date().toISOString().slice(0, 10)
                  : null,
              };
            }),
          })),
        };
      });
    } catch (err) {
      console.error(err);
      alert("Error de conexión al guardar el entregable.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1d4ed8] rounded-full animate-spin" />
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-md">
          <p className="text-gray-700 mb-4">No se encontró la iniciativa.</p>
          <button
            onClick={() => navigate("/docente/proyectos")}
            className="bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors"
            style={{ fontWeight: 600 }}
          >
            Volver a Mis Iniciativas
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (f: string | null) =>
    f ? new Date(f).toLocaleDateString("es-CO") : "—";

  const allEntregables = initiative.semanasDetalle.flatMap((s) => s.entregables);
  const totalEnt = allEntregables.length;
  const doneEnt = allEntregables.filter((e) => e.completado).length;
  const pct = totalEnt > 0 ? Math.round((doneEnt / totalEnt) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div>
        <button
          onClick={() => navigate("/docente/proyectos")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Mis Iniciativas
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={initiative.tipo as any} />
              <Badge variant={initiative.estado as any} />
            </div>
            <h1 className="text-gray-900">{initiative.titulo}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {initiative.programa} • {initiative.horasTotales ?? "—"} hrs •{" "}
              {initiative.coordinador}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Inicio: {formatDate(initiative.fechaInicio)} | Fin estimado:{" "}
              {formatDate(initiative.fechaFin)}
            </p>
          </div>
        </div>
      </div>

      {/* Progreso general */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-800" style={{ fontWeight: 600 }}>
            Progreso
          </p>
          <p className="text-xs text-gray-500">
            {doneEnt} de {totalEnt} entregables completados
          </p>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Semanas */}
      <div>
        {initiative.semanasDetalle.map((semana) => {
          const totalW = semana.entregables.length;
          const doneW = semana.entregables.filter((e) => e.completado).length;
          return (
            <div
              key={semana.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-gray-800" style={{ fontWeight: 600 }}>
                    Semana {semana.numero}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(semana.fecha_inicio)} —{" "}
                    {formatDate(semana.fecha_fin)}
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">
                  {doneW}/{totalW} completados
                </span>
              </div>

              <div className="divide-y divide-gray-50">
                {semana.entregables.map((e) => (
                  <div key={e.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={e.completado}
                        onChange={() => handleSaveEntregable(e, !e.completado)}
                        className="w-4 h-4 text-emerald-500 rounded mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className={`text-sm ${
                              e.completado
                                ? "text-gray-400 line-through"
                                : "text-gray-700"
                            }`}
                          >
                            {e.descripcion}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {e.horas != null && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">
                                {e.horas}h
                              </span>
                            )}
                            {saving === e.id && (
                              <div className="w-4 h-4 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
                            )}
                          </div>
                        </div>

                        <div className="mt-2">
                          <p className="text-[11px] text-gray-500 mb-1">
                            Enlace de evidencia (Drive/Forms):
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="url"
                                value={evidenceInputs[e.id] || ""}
                                onChange={(ev) =>
                                  setEvidenceInputs((prev) => ({
                                    ...prev,
                                    [e.id]: ev.target.value,
                                  }))
                                }
                                placeholder="https://drive.google.com/..."
                                className="flex-1 text-xs px-2 py-1.5 pl-8 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 w-full"
                                onBlur={() => handleSaveEntregable(e, e.completado)}
                              />
                            </div>
                            {evidenceInputs[e.id]?.trim() && (
                              <a
                                href={evidenceInputs[e.id]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors"
                                title="Abrir evidencia"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                            {e.completado ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                Completado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Circle className="w-3.5 h-3.5 text-gray-300" />
                                Pendiente
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-gray-400" />
                              Entrega real: {formatDate(e.fecha_real_entrega)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
