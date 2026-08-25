import { useEffect, useState } from "react";
import { CalendarRange, CheckCircle2, Edit2, Loader2, Plus, Trash2, X } from "lucide-react";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

type Semester = {
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semanas: number;
  activo: boolean;
  num_grupos: number;
  num_plantillas: number;
  num_docentes: number;
  num_reportes: number;
};

type SemesterForm = {
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semanas: string;
  activo: boolean;
};

const emptyForm: SemesterForm = {
  codigo: "",
  fecha_inicio: "",
  fecha_fin: "",
  numero_semanas: "16",
  activo: false,
};

const dateOnly = (value: string | null | undefined) => String(value || "").slice(0, 10);

export default function SemesterManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [form, setForm] = useState<SemesterForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const loadSemesters = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/semestres`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSemesters(data.detalle || []);
    } catch {
      setSemesters([]);
      notify.error("No se pudieron cargar los semestres.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSemesters();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (semester: Semester) => {
    setEditing(semester);
    setForm({
      codigo: semester.codigo,
      fecha_inicio: dateOnly(semester.fecha_inicio),
      fecha_fin: dateOnly(semester.fecha_fin),
      numero_semanas: String(semester.numero_semanas),
      activo: semester.activo,
    });
    setShowModal(true);
  };

  const saveSemester = async () => {
    const codigo = form.codigo.trim().toUpperCase();
    const weeks = Number(form.numero_semanas);
    if (!/^\d{4}[AB]$/.test(codigo)) {
      notify.warning("El código debe tener formato YYYYA o YYYYB.");
      return;
    }
    if (!form.fecha_inicio || !form.fecha_fin || form.fecha_fin < form.fecha_inicio) {
      notify.warning("Indica un rango de fechas válido.");
      return;
    }
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 53) {
      notify.warning("El número de semanas debe estar entre 1 y 53.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        editing
          ? `${API_BASE}/admin/semestres/${encodeURIComponent(editing.codigo)}`
          : `${API_BASE}/admin/semestres`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo,
            fecha_inicio: form.fecha_inicio,
            fecha_fin: form.fecha_fin,
            numero_semanas: weeks,
            activo: editing ? undefined : form.activo,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data.error || "No se pudo guardar el semestre.");
        return;
      }
      setShowModal(false);
      await loadSemesters();
      notify.success(editing ? "Semestre actualizado" : "Semestre creado");
    } catch {
      notify.error("Error de conexión al guardar el semestre.");
    } finally {
      setSaving(false);
    }
  };

  const activateSemester = async (semester: Semester) => {
    if (semester.activo) return;
    const accepted = await requestConfirmation({
      title: "Activar semestre",
      description: `${semester.codigo} pasará a ser el periodo activo para toda la aplicación.`,
      confirmLabel: "Activar",
      tone: "primary",
    });
    if (!accepted) return;
    try {
      setBusyCode(semester.codigo);
      const response = await fetch(
        `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}/activar`,
        { method: "PUT" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data.error || "No se pudo activar el semestre.");
        return;
      }
      await loadSemesters();
      notify.success(`${semester.codigo} es ahora el semestre activo`);
    } catch {
      notify.error("Error de conexión al activar el semestre.");
    } finally {
      setBusyCode(null);
    }
  };

  const deleteSemester = async (semester: Semester) => {
    const accepted = await requestConfirmation({
      title: "Eliminar semestre",
      description: `¿Deseas eliminar el semestre ${semester.codigo}?`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    setBusyCode(semester.codigo);
    try {
      let response = await fetch(
        `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}`,
        { method: "DELETE" }
      );
      let data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.requiere_confirmacion) {
        const summary = data.resumen || {};
        const forceAccepted = await requestConfirmation({
          title: "Eliminar semestre y datos relacionados",
          description:
            `Este semestre contiene ${summary.grupos || 0} grupos, ${summary.plantillas || 0} plantillas, ` +
            `${summary.docentes || 0} docentes asignados y ${summary.reportes || 0} reportes vinculados. ` +
            "Los docentes quedarán sin grupo y esta eliminación no se puede deshacer.",
          confirmLabel: "Eliminar todo",
          tone: "danger",
        });
        if (!forceAccepted) return;
        response = await fetch(
          `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}?forzar=true`,
          { method: "DELETE" }
        );
        data = await response.json().catch(() => ({}));
      }
      if (!response.ok) {
        notify.error(data.error || "No se pudo eliminar el semestre.");
        return;
      }
      await loadSemesters();
      notify.success("Semestre eliminado");
    } catch {
      notify.error("Error de conexión al eliminar el semestre.");
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-gray-900 text-base font-bold">Calendario de semestres</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Crea, edita, activa o elimina periodos. La clonación de grupos está en Tareas semanales.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Nuevo semestre
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading && (
          <div className="p-6 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando semestres…
          </div>
        )}
        {!loading && semesters.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">No hay semestres configurados.</div>
        )}
        {!loading && semesters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Semestre</th>
                  <th className="text-left px-4 py-3">Fechas</th>
                  <th className="text-right px-4 py-3">Semanas</th>
                  <th className="text-right px-4 py-3">Grupos</th>
                  <th className="text-right px-4 py-3">Plantillas</th>
                  <th className="text-right px-4 py-3">Docentes</th>
                  <th className="text-right px-4 py-3">Reportes</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {semesters.map((semester) => (
                  <tr key={semester.codigo} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{semester.codigo}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {dateOnly(semester.fecha_inicio)} – {dateOnly(semester.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{semester.numero_semanas}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{semester.num_grupos || 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{semester.num_plantillas || 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{semester.num_docentes || 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{semester.num_reportes || 0}</td>
                    <td className="px-4 py-3">
                      {semester.activo ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyCode === semester.codigo}
                          onClick={() => void activateSemester(semester)}
                          className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Activar
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEdit(semester)}
                        className="text-blue-700 hover:text-blue-900 inline-flex"
                        aria-label={`Editar ${semester.codigo}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyCode === semester.codigo}
                        onClick={() => void deleteSemester(semester)}
                        className="text-gray-400 hover:text-red-600 inline-flex disabled:opacity-40"
                        aria-label={`Eliminar ${semester.codigo}`}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CalendarRange className="w-5 h-5" /> {editing ? "Editar semestre" : "Nuevo semestre"}
              </h3>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                <input
                  value={form.codigo}
                  maxLength={5}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))
                  }
                  placeholder="2026B"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inicio *</label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fecha_inicio: event.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Finalización *</label>
                  <input
                    type="date"
                    min={form.fecha_inicio || undefined}
                    value={form.fecha_fin}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fecha_fin: event.target.value }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de semanas *</label>
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={form.numero_semanas}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, numero_semanas: event.target.value }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                />
              </div>
              {!editing && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, activo: event.target.checked }))
                    }
                  />
                  Establecer como semestre activo
                </label>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSemester()}
                className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
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
