import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

type PerfilPayload = {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: string;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  programa: { id: number | null; nombre: string };
  escuela: { id: number | null; nombre: string };
  grupo_matriz: {
    id: number;
    nombre: string;
    horas_totales: number | null;
    num_proyectos: number;
    num_actividades: number;
    num_convenios_nuevos: number;
    num_convenios_dinamizados: number;
  } | null;
  perfil_indicador: {
    id: number;
    nombre: string;
    num_proyectos: number;
    num_actividades: number;
    num_convenios_nuevos: number;
    num_convenios_dinamizados: number;
  } | null;
  stats: {
    total_plantillas: number;
    completados: number;
    porcentaje_avance: number;
  };
};

function tipoIsNuevo(t: string | null | undefined) {
  return String(t ?? "").toUpperCase() === "NUEVO";
}

export default function TeacherProfile() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<PerfilPayload | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveSaved, setDriveSaved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/docente/${userId}/perfil`);
      if (!res.ok) throw new Error("perfil");
      const data = (await res.json()) as PerfilPayload;
      setPerfil(data);
      setDriveLink(data.link_drive || "");
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar el perfil.");
      setPerfil(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDrive = async () => {
    if (!userId) return;
    setSavingDrive(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/docentes/${userId}/info-contacto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_drive: driveLink }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(String(j.error || "No se pudo guardar."));
        return;
      }
      setError(null);
      setDriveSaved(true);
      setTimeout(() => setDriveSaved(false), 2000);
      await load();
    } catch (e) {
      console.error(e);
      setError("Error de conexión al guardar.");
    } finally {
      setSavingDrive(false);
    }
  };

  if (!userId) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          Inicia sesión para ver tu perfil.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto animate-pulse">
        <div className="h-10 bg-gray-200 rounded-lg w-1/3" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="h-24 bg-gray-200 rounded-xl" />
        <div className="h-28 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!perfil) {
    return (
      <div className="p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>
    );
  }

  const iniciales =
    `${(perfil.nombre || "?")[0] || ""}${(perfil.apellido || "?")[0] || ""}`.toUpperCase();
  const tipoBadge = tipoIsNuevo(perfil.tipo_docente) ? "NUEVO" : "ANTIGUO";
  const pct = Math.min(100, Math.max(0, perfil.stats.porcentaje_avance));

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="w-16 h-16 rounded-full bg-[#1e3a8a] text-white flex items-center justify-center text-lg font-bold shrink-0">
          {iniciales}
        </div>
        <div className="flex-1 space-y-1">
          <h1 className="text-gray-900 text-lg font-semibold">
            {perfil.nombre} {perfil.apellido}
          </h1>
          <p className="text-sm text-gray-500">{perfil.correo}</p>
          <p className="text-sm text-gray-700">
            Rol: <span className="font-medium">Docente de Proyección Social</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-xs text-gray-600">
              Regional: {perfil.regional || "—"}
            </span>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                tipoIsNuevo(perfil.tipo_docente)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Tipo: {tipoBadge}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-2">
        <h2 className="text-gray-800 font-semibold border-b border-gray-100 pb-2">
          Información académica
        </h2>
        <p className="text-sm text-gray-700">
          <span className="text-gray-500">Escuela:</span> {perfil.escuela.nombre}
        </p>
        <p className="text-sm text-gray-700">
          <span className="text-gray-500">Programa:</span> {perfil.programa.nombre}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-gray-800 font-semibold border-b border-gray-100 pb-2">
          Grupo y carga
        </h2>
        {perfil.grupo_matriz ? (
          <>
            <p className="text-sm text-gray-800 font-medium">
              {perfil.grupo_matriz.nombre}
            </p>
            <p className="text-xs text-gray-500">
              Horas totales: {perfil.grupo_matriz.horas_totales ?? "—"}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ["Proyectos", perfil.grupo_matriz.num_proyectos],
                ["Actividades", perfil.grupo_matriz.num_actividades],
                ["Conv. nuevos", perfil.grupo_matriz.num_convenios_nuevos],
                ["Conv. dinamizados", perfil.grupo_matriz.num_convenios_dinamizados],
              ].map(([label, n]) => (
                <span
                  key={String(label)}
                  className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
                >
                  {n} {label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Sin grupo matriz asignado.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-gray-800 font-semibold border-b border-gray-100 pb-2">
          Avance semestral
        </h2>
        <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1d4ed8] rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-gray-600">
          {perfil.stats.completados} de {perfil.stats.total_plantillas} entregables completados
          <span className="text-gray-900 font-semibold ml-2">{pct}%</span>
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
        <h2 className="text-gray-800 font-semibold border-b border-gray-100 pb-2">
          Tu enlace de Drive
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-[#1d4ed8]"
            value={driveLink}
            onChange={(e) => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/..."
          />
          <button
            type="button"
            disabled={savingDrive}
            onClick={() => void saveDrive()}
            className="px-4 py-2.5 bg-[#1e3a8a] text-white rounded-lg text-sm font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {savingDrive && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
        {driveSaved && (
          <span className="text-sm text-emerald-600 font-medium">Guardado ✓</span>
        )}
      </div>
    </div>
  );
}
