import { useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;
const SEMESTRE_PERFIL_PROGRAMA = "2025C";

type PerfilIndicador = {
  id: number;
  nombre: string;
  num_proyectos: number;
  num_actividades: number;
  num_convenios_nuevos: number;
  num_convenios_dinamizados: number;
  num_convenios?: number;
};

type ProgramaRow = {
  id: number;
  nombre: string;
  codigo: string | null;
  escuela: string;
  perfil_id: number | null;
  semestre: string | null;
  perfil_nombre: string | null;
};

export default function ProfileManagement() {
  const [perfiles, setPerfiles] = useState<PerfilIndicador[]>([]);
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [loadingPerfiles, setLoadingPerfiles] = useState(false);
  const [loadingProgramas, setLoadingProgramas] = useState(false);
  const [errPerfiles, setErrPerfiles] = useState<string | null>(null);
  const [errProgramas, setErrProgramas] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PerfilIndicador | null>(null);
  const [nombre, setNombre] = useState("");
  const [numProyectos, setNumProyectos] = useState(0);
  const [numActividades, setNumActividades] = useState(0);
  const [numConvNuevos, setNumConvNuevos] = useState(0);
  const [numConvDin, setNumConvDin] = useState(0);
  const [saving, setSaving] = useState(false);
  const [assignBusy, setAssignBusy] = useState<number | null>(null);

  const fetchPerfiles = async () => {
    try {
      setErrPerfiles(null);
      setLoadingPerfiles(true);
      const res = await fetch(`${API_BASE_URL}/admin/perfiles-indicador`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPerfiles(data.perfiles || []);
    } catch {
      setErrPerfiles("No se pudieron cargar los perfiles.");
      setPerfiles([]);
    } finally {
      setLoadingPerfiles(false);
    }
  };

  const fetchProgramas = async () => {
    try {
      setErrProgramas(null);
      setLoadingProgramas(true);
      const res = await fetch(`${API_BASE_URL}/admin/programas`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProgramas(data.programas || []);
    } catch {
      setErrProgramas("No se pudieron cargar los programas.");
      setProgramas([]);
    } finally {
      setLoadingProgramas(false);
    }
  };

  useEffect(() => {
    void fetchPerfiles();
    void fetchProgramas();
  }, []);

  const openNew = () => {
    setEditing(null);
    setNombre("");
    setNumProyectos(0);
    setNumActividades(0);
    setNumConvNuevos(0);
    setNumConvDin(0);
    setShowModal(true);
  };

  const openEdit = (p: PerfilIndicador) => {
    setEditing(p);
    setNombre(p.nombre);
    setNumProyectos(p.num_proyectos);
    setNumActividades(p.num_actividades);
    setNumConvNuevos(p.num_convenios_nuevos ?? p.num_convenios ?? 0);
    setNumConvDin(p.num_convenios_dinamizados ?? 0);
    setShowModal(true);
  };

  const guardarPerfil = async () => {
    if (!nombre.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nombre: nombre.trim(),
        num_proyectos: numProyectos,
        num_actividades: numActividades,
        num_convenios_nuevos: numConvNuevos,
        num_convenios_dinamizados: numConvDin,
      };
      const url = editing
        ? `${API_BASE_URL}/admin/perfiles-indicador/${editing.id}`
        : `${API_BASE_URL}/admin/perfiles-indicador`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "No se pudo guardar.");
        return;
      }
      setShowModal(false);
      await fetchPerfiles();
    } catch {
      alert("Error de conexión.");
    } finally {
      setSaving(false);
    }
  };

  const eliminarPerfil = async (p: PerfilIndicador) => {
    if (!window.confirm(`¿Eliminar el perfil «${p.nombre}»?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/perfiles-indicador/${p.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "No se puede eliminar (tiene programas asignados).");
        return;
      }
      if (!res.ok && res.status !== 204) {
        alert("No se pudo eliminar.");
        return;
      }
      await fetchPerfiles();
      await fetchProgramas();
    } catch {
      alert("Error de conexión.");
    }
  };

  const onProgramaPerfilChange = async (programaId: number, value: string) => {
    const perfilId = value === "" ? null : Number(value);
    try {
      setAssignBusy(programaId);
      const res = await fetch(`${API_BASE_URL}/admin/programas/${programaId}/perfil`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfil_id: perfilId,
          semestre: SEMESTRE_PERFIL_PROGRAMA,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "No se pudo actualizar el programa.");
        await fetchProgramas();
        return;
      }
      await fetchProgramas();
    } catch {
      alert("Error de conexión.");
    } finally {
      setAssignBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-gray-900 text-base" style={{ fontWeight: 700 }}>
              Perfiles de indicador
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Combinaciones de proyectos, actividades y convenios por semestre
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm shadow-sm"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" /> Nuevo perfil
          </button>
        </div>
        {errPerfiles && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{errPerfiles}</div>
        )}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loadingPerfiles && <p className="p-4 text-sm text-gray-400">Cargando…</p>}
          {!loadingPerfiles && perfiles.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No hay perfiles configurados.</p>
          )}
          {!loadingPerfiles && perfiles.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-left px-4 py-3">Proyectos</th>
                    <th className="text-left px-4 py-3">Actividades</th>
                    <th className="text-left px-4 py-3">Conv. nuevos</th>
                    <th className="text-left px-4 py-3">Conv. dinamizados</th>
                    <th className="text-right px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {perfiles.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>
                        {p.nombre}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.num_proyectos}</td>
                      <td className="px-4 py-3 text-gray-600">{p.num_actividades}</td>
                      <td className="px-4 py-3 text-gray-600">{p.num_convenios_nuevos}</td>
                      <td className="px-4 py-3 text-gray-600">{p.num_convenios_dinamizados}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          className="text-[#1d4ed8] hover:text-[#1e3a8a] inline-flex"
                          onClick={() => openEdit(p)}
                          aria-label="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-red-600 inline-flex"
                          onClick={() => void eliminarPerfil(p)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-gray-900 text-base" style={{ fontWeight: 700 }}>
            Asignación de perfil a programa
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Semestre: {SEMESTRE_PERFIL_PROGRAMA} (según configuración del sistema)
          </p>
        </div>
        {errProgramas && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{errProgramas}</div>
        )}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loadingProgramas && <p className="p-4 text-sm text-gray-400">Cargando programas…</p>}
          {!loadingProgramas && (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider sticky top-0">
                    <th className="text-left px-4 py-3">Programa</th>
                    <th className="text-left px-4 py-3">Escuela</th>
                    <th className="text-left px-4 py-3">Perfil asignado</th>
                    <th className="text-left px-4 py-3 min-w-[220px]">Cambiar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {programas.map((pr) => (
                    <tr key={pr.id}>
                      <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 500 }}>
                        {pr.nombre}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{pr.escuela}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {pr.perfil_nombre || (
                          <span className="text-gray-400 italic">Sin perfil</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          disabled={assignBusy === pr.id}
                          value={pr.perfil_id ?? ""}
                          onChange={(e) => void onProgramaPerfilChange(pr.id, e.target.value)}
                        >
                          <option value="">Sin perfil</option>
                          {perfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">{editing ? "Editar perfil" : "Nuevo perfil"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nº proyectos *</label>
                  <input
                    type="number"
                    min={0}
                    value={numProyectos}
                    onChange={(e) => setNumProyectos(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nº actividades *</label>
                  <input
                    type="number"
                    min={0}
                    value={numActividades}
                    onChange={(e) => setNumActividades(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Conv. nuevos *</label>
                  <input
                    type="number"
                    min={0}
                    value={numConvNuevos}
                    onChange={(e) => setNumConvNuevos(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Conv. dinamizados *</label>
                  <input
                    type="number"
                    min={0}
                    value={numConvDin}
                    onChange={(e) => setNumConvDin(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarPerfil()}
                disabled={saving}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm shadow-sm disabled:opacity-60"
                style={{ fontWeight: 600 }}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
