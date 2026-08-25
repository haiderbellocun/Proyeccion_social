import { useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

type Escuela = {
  id: number;
  nombre: string;
  codigo: string | null;
  num_programas?: number;
};

type Programa = {
  id: number;
  nombre: string;
  codigo: string | null;
  escuela_id: number | null;
  escuela: string;
};

type ProgramaForm = {
  nombre: string;
  codigo: string;
  escuela_id: string;
};

type EscuelaForm = {
  nombre: string;
  codigo: string;
};

const emptyPrograma: ProgramaForm = { nombre: "", codigo: "", escuela_id: "" };
const emptyEscuela: EscuelaForm = { nombre: "", codigo: "" };

export default function ProgramManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Programa | null>(null);
  const [form, setForm] = useState<ProgramaForm>(emptyPrograma);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [escuelaForm, setEscuelaForm] = useState<EscuelaForm>(emptyEscuela);
  const [editingEscuela, setEditingEscuela] = useState<Escuela | null>(null);
  const [showEscuelaModal, setShowEscuelaModal] = useState(false);
  const [savingEscuela, setSavingEscuela] = useState(false);
  const [deletingEscuelaId, setDeletingEscuelaId] = useState<number | null>(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [progRes, escRes] = await Promise.all([
        fetch(`${API_BASE}/admin/programas`),
        fetch(`${API_BASE}/admin/escuelas`),
      ]);
      if (!progRes.ok || !escRes.ok) throw new Error();
      const progData = await progRes.json();
      const escData = await escRes.json();
      setProgramas(progData.programas || []);
      setEscuelas(escData.escuelas || []);
    } catch {
      setProgramas([]);
      setEscuelas([]);
      notify.error("No se pudo cargar el catálogo de escuelas y programas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyPrograma);
    setShowModal(true);
  };

  const openEdit = (programa: Programa) => {
    setEditing(programa);
    setForm({
      nombre: programa.nombre,
      codigo: programa.codigo || "",
      escuela_id: programa.escuela_id != null ? String(programa.escuela_id) : "",
    });
    setShowModal(true);
  };

  const savePrograma = async () => {
    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      escuela_id: Number(form.escuela_id),
    };
    if (!payload.nombre || !payload.codigo || !payload.escuela_id) {
      notify.warning("Código, nombre y escuela son obligatorios.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        editing ? `${API_BASE}/admin/programas/${editing.id}` : `${API_BASE}/admin/programas`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo guardar el programa.");
        return;
      }
      setShowModal(false);
      await loadAll();
      notify.success(editing ? "Cambios guardados" : "Programa creado");
    } catch {
      notify.error("Error de conexión al guardar el programa.");
    } finally {
      setSaving(false);
    }
  };

  const deletePrograma = async (programa: Programa) => {
    const accepted = await requestConfirmation({
      title: "Eliminar programa",
      description: `¿Deseas eliminar «${programa.nombre}»? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      setDeletingId(programa.id);
      const response = await fetch(`${API_BASE}/admin/programas/${programa.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo eliminar el programa.");
        return;
      }
      await loadAll();
      notify.success("Programa eliminado");
    } catch {
      notify.error("Error de conexión al eliminar el programa.");
    } finally {
      setDeletingId(null);
    }
  };

  const openNewEscuela = () => {
    setEditingEscuela(null);
    setEscuelaForm(emptyEscuela);
    setShowEscuelaModal(true);
  };

  const openEditEscuela = (escuela: Escuela) => {
    setEditingEscuela(escuela);
    setEscuelaForm({
      nombre: escuela.nombre,
      codigo: escuela.codigo || "",
    });
    setShowEscuelaModal(true);
  };

  const saveEscuela = async () => {
    const payload = {
      nombre: escuelaForm.nombre.trim(),
      codigo: escuelaForm.codigo.trim().toUpperCase(),
    };
    if (!payload.nombre) {
      notify.warning("El nombre de la escuela es obligatorio.");
      return;
    }
    try {
      setSavingEscuela(true);
      const response = await fetch(
        editingEscuela
          ? `${API_BASE}/admin/escuelas/${editingEscuela.id}`
          : `${API_BASE}/admin/escuelas`,
        {
          method: editingEscuela ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo guardar la escuela.");
        return;
      }
      setShowEscuelaModal(false);
      await loadAll();
      notify.success(editingEscuela ? "Escuela actualizada" : "Escuela creada");
    } catch {
      notify.error("Error de conexión al guardar la escuela.");
    } finally {
      setSavingEscuela(false);
    }
  };

  const deleteEscuela = async (escuela: Escuela) => {
    const accepted = await requestConfirmation({
      title: "Eliminar escuela",
      description: `¿Deseas eliminar «${escuela.nombre}»? Solo será posible si no tiene programas asociados.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      setDeletingEscuelaId(escuela.id);
      const response = await fetch(`${API_BASE}/admin/escuelas/${escuela.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo eliminar la escuela.");
        return;
      }
      await loadAll();
      notify.success("Escuela eliminada");
    } catch {
      notify.error("Error de conexión al eliminar la escuela.");
    } finally {
      setDeletingEscuelaId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-gray-900 text-base" style={{ fontWeight: 700 }}>
              Escuelas
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Entidad institucional; los programas pertenecen a una escuela
            </p>
          </div>
          <button
            type="button"
            onClick={openNewEscuela}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm shadow-sm"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" /> Nueva escuela
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading && <p className="p-4 text-sm text-gray-400">Cargando…</p>}
          {!loading && escuelas.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">Aún no hay escuelas registradas.</p>
              <p className="text-xs text-gray-400 mt-1">Crea primero las escuelas reales de la institución.</p>
            </div>
          )}
          {!loading && escuelas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Código</th>
                    <th className="text-left px-4 py-3">Escuela</th>
                    <th className="text-left px-4 py-3">Programas</th>
                    <th className="text-right px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {escuelas.map((escuela) => (
                    <tr key={escuela.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{escuela.codigo || "—"}</td>
                      <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>
                        {escuela.nombre}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{escuela.num_programas ?? 0}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openEditEscuela(escuela)}
                          className="text-[#1d4ed8] hover:text-[#1e3a8a] inline-flex"
                          aria-label={`Editar ${escuela.nombre}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteEscuela(escuela)}
                          disabled={deletingEscuelaId === escuela.id}
                          className="text-gray-400 hover:text-red-600 inline-flex disabled:opacity-40"
                          aria-label={`Eliminar ${escuela.nombre}`}
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
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-gray-900 text-base" style={{ fontWeight: 700 }}>
              Programas
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Cada programa debe estar vinculado a una escuela existente
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            disabled={escuelas.length === 0}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm shadow-sm disabled:opacity-50"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" /> Nuevo programa
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading && <p className="p-4 text-sm text-gray-400">Cargando programas…</p>}
          {!loading && programas.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">Aún no hay programas registrados.</p>
              <p className="text-xs text-gray-400 mt-1">
                {escuelas.length === 0
                  ? "Primero crea al menos una escuela."
                  : "Agrega únicamente los programas institucionales reales."}
              </p>
            </div>
          )}
          {!loading && programas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Código</th>
                    <th className="text-left px-4 py-3">Programa</th>
                    <th className="text-left px-4 py-3">Escuela</th>
                    <th className="text-right px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {programas.map((programa) => (
                    <tr key={programa.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{programa.codigo || "—"}</td>
                      <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>
                        {programa.nombre}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{programa.escuela}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openEdit(programa)}
                          className="text-[#1d4ed8] hover:text-[#1e3a8a] inline-flex"
                          aria-label={`Editar ${programa.nombre}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePrograma(programa)}
                          disabled={deletingId === programa.id}
                          className="text-gray-400 hover:text-red-600 inline-flex disabled:opacity-40"
                          aria-label={`Eliminar ${programa.nombre}`}
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
      </div>

      {showEscuelaModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">{editingEscuela ? "Editar escuela" : "Nueva escuela"}</h3>
              <button
                type="button"
                onClick={() => setShowEscuelaModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Código</label>
                <input
                  type="text"
                  maxLength={50}
                  value={escuelaForm.codigo}
                  onChange={(event) =>
                    setEscuelaForm((current) => ({ ...current, codigo: event.target.value }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  maxLength={200}
                  value={escuelaForm.nombre}
                  onChange={(event) =>
                    setEscuelaForm((current) => ({ ...current, nombre: event.target.value }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                  placeholder="Nombre institucional de la escuela"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setShowEscuelaModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveEscuela()}
                disabled={savingEscuela}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm shadow-sm disabled:opacity-60"
                style={{ fontWeight: 600 }}
              >
                {savingEscuela ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">{editing ? "Editar programa" : "Nuevo programa"}</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Código *</label>
                <input
                  type="text"
                  maxLength={50}
                  value={form.codigo}
                  onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                  placeholder="Ej. ING-SIS"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  maxLength={200}
                  value={form.nombre}
                  onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
                  placeholder="Nombre institucional del programa"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Escuela *</label>
                <AppSelect
                  value={form.escuela_id}
                  onValueChange={(value) => setForm((current) => ({ ...current, escuela_id: value }))}
                  placeholder="Seleccionar escuela…"
                  options={escuelas.map((escuela) => ({
                    value: String(escuela.id),
                    label: escuela.nombre,
                  }))}
                  className="w-full"
                />
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
                onClick={() => void savePrograma()}
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
