import { useEffect, useState } from "react";
import { Edit2, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;

type AdminUser = {
  id: number;
  name: string;
  email: string;
  program: string;
  perfil_id: number | null;
  perfil_nombre: string | null;
  grupo_matriz_id: number | null;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
};

type PerfilIndicador = {
  id: number;
  nombre: string;
  num_proyectos: number;
  num_actividades: number;
  num_convenios_nuevos: number;
  num_convenios_dinamizados: number;
  num_convenios?: number;
};

type MatrixGroup = { id: number; nombre: string; activo: boolean };

export default function ProfileManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilIndicador[]>([]);
  const [loadingPerfiles, setLoadingPerfiles] = useState(false);
  const [matrixGroups, setMatrixGroups] = useState<MatrixGroup[]>([]);
  const [loadingMatrixGroups, setLoadingMatrixGroups] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<PerfilIndicador | null>(null);
  const [perfilNombre, setPerfilNombre] = useState("");
  const [perfilProyectos, setPerfilProyectos] = useState(0);
  const [perfilActividades, setPerfilActividades] = useState(0);
  const [perfilConveniosNuevos, setPerfilConveniosNuevos] = useState(0);
  const [perfilConveniosDinamizados, setPerfilConveniosDinamizados] = useState(0);
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilNombreEditadoManualmente, setPerfilNombreEditadoManualmente] = useState(false);
  const [driveEditing, setDriveEditing] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const loadDocentes = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE_URL}/admin/docentes`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.docentes || []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    }
  };

  const fetchPerfiles = async () => {
    try {
      setError(null);
      setLoadingPerfiles(true);
      const res = await fetch(`${API_BASE_URL}/admin/perfiles-indicador`);
      if (!res.ok) return;
      const data = await res.json();
      setPerfiles(data.perfiles || []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    } finally {
      setLoadingPerfiles(false);
    }
  };

  const refreshMatrixGroups = async () => {
    try {
      setError(null);
      setLoadingMatrixGroups(true);
      const res = await fetch(`${API_BASE_URL}/admin/grupos-matriz`);
      if (!res.ok) return;
      const data = await res.json();
      setMatrixGroups(data.grupos || []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    } finally {
      setLoadingMatrixGroups(false);
    }
  };

  useEffect(() => {
    void loadDocentes();
    void fetchPerfiles();
    void refreshMatrixGroups();
  }, []);

  const saveDocenteInfoContacto = async (
    id: number,
    payload: { regional: string | null; link_drive: string | null }
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/docentes/${id}/info-contacto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo guardar la información de contacto.");
        return;
      }
      await loadDocentes();
    } catch (err) {
      console.error(err);
      alert("Error de conexión al guardar información de contacto.");
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-900 text-sm" style={{ fontWeight: 600 }}>
                Perfiles de Indicadores
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Define las combinaciones de proyectos, actividades y convenios por semestre
              </p>
            </div>
            <button
              onClick={() => {
                setEditingPerfil(null);
                setPerfilProyectos(0);
                setPerfilActividades(0);
                setPerfilConveniosNuevos(0);
                setPerfilConveniosDinamizados(0);
                setPerfilNombre("");
                setPerfilNombreEditadoManualmente(false);
                setShowPerfilModal(true);
              }}
              className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" /> Nuevo perfil
            </button>
          </div>
          <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
            {loadingPerfiles && <p className="text-xs text-gray-400">Cargando perfiles...</p>}
            {!loadingPerfiles && perfiles.length === 0 && (
              <p className="text-xs text-gray-400">Aún no hay perfiles configurados.</p>
            )}
            {perfiles.map((perfil) => (
              <div
                key={perfil.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-800" style={{ fontWeight: 600 }}>
                      {perfil.nombre}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-purple-100 text-purple-700">
                        {perfil.num_proyectos} Proyectos
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-sky-100 text-sky-700">
                        {perfil.num_actividades} Actividades
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-orange-100 text-orange-700">
                        {perfil.num_convenios_nuevos} Convenios Nuevos
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-teal-100 text-teal-700">
                        {perfil.num_convenios_dinamizados} Convenios Dinamizados
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      className="text-[#1d4ed8] hover:text-[#1e3a8a]"
                      onClick={() => {
                        setEditingPerfil(perfil);
                        setPerfilNombre(perfil.nombre);
                        setPerfilProyectos(perfil.num_proyectos);
                        setPerfilActividades(perfil.num_actividades);
                        setPerfilConveniosNuevos(
                          perfil.num_convenios_nuevos ?? (perfil.num_convenios ?? 0)
                        );
                        setPerfilConveniosDinamizados(perfil.num_convenios_dinamizados ?? 0);
                        setPerfilNombreEditadoManualmente(true);
                        setShowPerfilModal(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      className="text-gray-400 hover:text-red-500"
                      onClick={async () => {
                        const ok = window.confirm(
                          "¿Seguro que deseas eliminar este perfil? Esta acción no se puede deshacer."
                        );
                        if (!ok) return;
                        try {
                          const res = await fetch(
                            `${API_BASE_URL}/admin/perfiles-indicador/${perfil.id}`,
                            { method: "DELETE" }
                          );
                          if (res.status === 409) {
                            const data = await res.json().catch(() => ({}));
                            alert(
                              data.error ||
                                "No se puede eliminar el perfil porque tiene programas asignados."
                            );
                            return;
                          }
                          if (!res.ok && res.status !== 204) {
                            alert("No se pudo eliminar el perfil.");
                            return;
                          }
                          await fetchPerfiles();
                        } catch (err) {
                          console.error(err);
                          alert("Error de conexión al eliminar el perfil.");
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-gray-900 text-sm" style={{ fontWeight: 600 }}>
              Asignación por Docente
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Cada docente puede tener un perfil de indicadores asignado
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5">Docente</th>
                    <th className="text-left px-4 py-2.5">Programa</th>
                    <th className="text-left px-4 py-2.5">Perfil asignado</th>
                    <th className="text-left px-4 py-2.5">Tipo Docente</th>
                    <th className="text-left px-4 py-2.5">Grupo Matriz</th>
                    <th className="text-left px-4 py-2.5">Regional</th>
                    <th className="text-left px-4 py-2.5 min-w-[160px]">Drive</th>
                    <th className="text-left px-4 py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-800" style={{ fontWeight: 500 }}>
                        {doc.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{doc.program}</td>
                      <td className="px-4 py-2.5">
                        {doc.perfil_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-700">
                            {doc.perfil_nombre}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={doc.tipo_docente ?? "ANTIGUO"}
                          onChange={async (e) => {
                            try {
                              const res = await fetch(
                                `${API_BASE_URL}/admin/docentes/${doc.id}/tipo-docente`,
                                {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ tipo_docente: e.target.value }),
                                }
                              );
                              if (!res.ok) return;
                              await loadDocentes();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                        >
                          <option value="ANTIGUO">ANTIGUO</option>
                          <option value="NUEVO">NUEVO</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={doc.grupo_matriz_id ?? ""}
                          onChange={async (e) => {
                            const value = e.target.value;
                            try {
                              const res = await fetch(
                                `${API_BASE_URL}/admin/docentes/${doc.id}/grupo-matriz`,
                                {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    grupo_matriz_id: value === "" ? null : Number(value),
                                  }),
                                }
                              );
                              if (!res.ok) return;
                              await loadDocentes();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          disabled={loadingMatrixGroups}
                        >
                          <option value="">Sin grupo</option>
                          {matrixGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <input
                          type="text"
                          className="w-full min-w-[96px] max-w-[140px] px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                          defaultValue={doc.regional ?? ""}
                          key={`regional-${doc.id}-${doc.regional ?? ""}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            const prev = (doc.regional && doc.regional.trim()) || null;
                            if (v === prev) return;
                            void saveDocenteInfoContacto(doc.id, {
                              regional: v,
                              link_drive: doc.link_drive ?? null,
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        {doc.link_drive && doc.link_drive.trim() && !driveEditing[doc.id] ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={doc.link_drive}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex text-[#1d4ed8] hover:text-[#1e3a8a] shrink-0"
                              title="Abrir carpeta Drive"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                              type="button"
                              className="text-[11px] text-[#1d4ed8] hover:underline whitespace-nowrap"
                              onClick={() => setDriveEditing((s) => ({ ...s, [doc.id]: true }))}
                            >
                              Editar
                            </button>
                          </div>
                        ) : (
                          <input
                            type="url"
                            placeholder="https://…"
                            className="w-full min-w-[120px] max-w-[200px] px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                            defaultValue={doc.link_drive ?? ""}
                            key={`drive-${doc.id}-${doc.link_drive ?? ""}-${driveEditing[doc.id] ? "e" : ""}`}
                            onBlur={(e) => {
                              setDriveEditing((s) => {
                                const next = { ...s };
                                delete next[doc.id];
                                return next;
                              });
                              const v = e.target.value.trim() || null;
                              const prev = (doc.link_drive && doc.link_drive.trim()) || null;
                              if (v === prev) return;
                              void saveDocenteInfoContacto(doc.id, {
                                regional: doc.regional ?? null,
                                link_drive: v,
                              });
                            }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={doc.perfil_id ?? ""}
                          onChange={async (e) => {
                            const value = e.target.value;
                            try {
                              const res = await fetch(`${API_BASE_URL}/admin/docentes/${doc.id}/perfil`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ perfil_id: value === "" ? null : Number(value) }),
                              });
                              if (!res.ok) return;
                              await loadDocentes();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                        >
                          <option value="">Sin asignar</option>
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
          </div>
        </div>
      </div>

      {showPerfilModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">{editingPerfil ? "Editar perfil" : "Nuevo perfil"}</h3>
              <button
                onClick={() => setShowPerfilModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="text"
                value={perfilNombre}
                onChange={(e) => {
                  setPerfilNombre(e.target.value);
                  setPerfilNombreEditadoManualmente(true);
                }}
                placeholder="Ej: 1 Proyecto, 4 Actividades, 1 Convenio"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min={0}
                  value={perfilProyectos}
                  onChange={(e) => {
                    const v = Number(e.target.value || 0);
                    setPerfilProyectos(v);
                    if (!perfilNombreEditadoManualmente) {
                      setPerfilNombre(
                        `${v} Proyecto(s), ${perfilActividades} Actividad(es), ${perfilConveniosNuevos} Convenio(s) Nuevos, ${perfilConveniosDinamizados} Convenio(s) Dinamizados`
                      );
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
                <input
                  type="number"
                  min={0}
                  value={perfilActividades}
                  onChange={(e) => {
                    const v = Number(e.target.value || 0);
                    setPerfilActividades(v);
                    if (!perfilNombreEditadoManualmente) {
                      setPerfilNombre(
                        `${perfilProyectos} Proyecto(s), ${v} Actividad(es), ${perfilConveniosNuevos} Convenio(s) Nuevos, ${perfilConveniosDinamizados} Convenio(s) Dinamizados`
                      );
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
                <input
                  type="number"
                  min={0}
                  value={perfilConveniosNuevos}
                  onChange={(e) => setPerfilConveniosNuevos(Number(e.target.value || 0))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
                <input
                  type="number"
                  min={0}
                  value={perfilConveniosDinamizados}
                  onChange={(e) => setPerfilConveniosDinamizados(Number(e.target.value || 0))}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowPerfilModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!perfilNombre.trim()) return;
                  try {
                    setSavingPerfil(true);
                    const payload = {
                      nombre: perfilNombre.trim(),
                      num_proyectos: perfilProyectos,
                      num_actividades: perfilActividades,
                      num_convenios_nuevos: perfilConveniosNuevos,
                      num_convenios_dinamizados: perfilConveniosDinamizados,
                    };
                    const url = editingPerfil
                      ? `${API_BASE_URL}/admin/perfiles-indicador/${editingPerfil.id}`
                      : `${API_BASE_URL}/admin/perfiles-indicador`;
                    const method = editingPerfil ? "PUT" : "POST";
                    const res = await fetch(url, {
                      method,
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) return;
                    await fetchPerfiles();
                    setShowPerfilModal(false);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setSavingPerfil(false);
                  }
                }}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
                disabled={savingPerfil}
              >
                {savingPerfil ? "Guardando..." : "Guardar perfil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
