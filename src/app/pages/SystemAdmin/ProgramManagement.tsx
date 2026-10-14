import { useEffect, useState } from "react";
import { Building2, GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, InlineAlert, PageLoading, Panel } from "../../components/ds/primitives";
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
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
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
      setLoadError(true);
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

  const iconBtn = "ds-btn ds-btn-ghost ds-btn-sm !px-1.5";
  const modalClass = "gap-0 rounded-xl border-line bg-surface p-0 sm:max-w-md";

  const retryAlert = loadError && (
    <InlineAlert
      action={
        <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadAll()}>
          Reintentar
        </button>
      }
    >
      No se pudo cargar el catálogo de escuelas y programas.
    </InlineAlert>
  );

  return (
    <div className="space-y-5">
      {retryAlert}

      <Panel
        title="Escuelas"
        description="Entidad institucional; los programas pertenecen a una escuela."
        action={
          <button type="button" onClick={openNewEscuela} className="ds-btn ds-btn-primary ds-btn-sm">
            <Plus className="h-4 w-4" aria-hidden /> Nueva escuela
          </button>
        }
        bodyClassName=""
      >
        {loading && <PageLoading label="Cargando escuelas…" />}
        {!loading && !loadError && escuelas.length === 0 && (
          <EmptyState
            icon={Building2}
            title="Aún no hay escuelas registradas"
            action={
              <button type="button" onClick={openNewEscuela} className="ds-btn ds-btn-primary ds-btn-sm">
                <Plus className="h-4 w-4" aria-hidden /> Crear escuela
              </button>
            }
          >
            Crea primero las escuelas reales de la institución.
          </EmptyState>
        )}
        {!loading && escuelas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Escuela</th>
                  <th className="text-right">Programas</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {escuelas.map((escuela) => (
                  <tr key={escuela.id}>
                    <td className="text-text-muted">{escuela.codigo || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{escuela.nombre}</td>
                    <td className="text-right">{escuela.num_programas ?? 0}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEditEscuela(escuela)} className={iconBtn} aria-label={`Editar ${escuela.nombre}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteEscuela(escuela)}
                          disabled={deletingEscuelaId === escuela.id}
                          className={`${iconBtn} hover:!text-red-700`}
                          aria-label={`Eliminar ${escuela.nombre}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Programas"
        description="Cada programa debe estar vinculado a una escuela existente."
        action={
          <button type="button" onClick={openNew} disabled={escuelas.length === 0} className="ds-btn ds-btn-primary ds-btn-sm">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo programa
          </button>
        }
        bodyClassName=""
      >
        {loading && <PageLoading label="Cargando programas…" />}
        {!loading && !loadError && programas.length === 0 && (
          <EmptyState
            icon={GraduationCap}
            title="Aún no hay programas registrados"
            action={
              escuelas.length > 0 ? (
                <button type="button" onClick={openNew} className="ds-btn ds-btn-primary ds-btn-sm">
                  <Plus className="h-4 w-4" aria-hidden /> Crear programa
                </button>
              ) : undefined
            }
          >
            {escuelas.length === 0
              ? "Primero crea al menos una escuela."
              : "Agrega únicamente los programas institucionales reales."}
          </EmptyState>
        )}
        {!loading && programas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Programa</th>
                  <th className="hidden sm:table-cell">Escuela</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {programas.map((programa) => (
                  <tr key={programa.id}>
                    <td className="text-text-muted">{programa.codigo || "—"}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{programa.nombre}</span>
                      <span className="block text-xs text-text-subtle sm:hidden">{programa.escuela}</span>
                    </td>
                    <td className="hidden text-text-muted sm:table-cell">{programa.escuela}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(programa)} className={iconBtn} aria-label={`Editar ${programa.nombre}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePrograma(programa)}
                          disabled={deletingId === programa.id}
                          className={`${iconBtn} hover:!text-red-700`}
                          aria-label={`Eliminar ${programa.nombre}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={showEscuelaModal} onOpenChange={(open) => !savingEscuela && setShowEscuelaModal(open)}>
        <DialogContent className={modalClass}>
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-base">{editingEscuela ? "Editar escuela" : "Nueva escuela"}</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">Los programas se vinculan a una escuela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div>
              <label htmlFor="esc-codigo" className="ds-label">Código</label>
              <input
                id="esc-codigo"
                type="text"
                maxLength={50}
                value={escuelaForm.codigo}
                onChange={(event) => setEscuelaForm((current) => ({ ...current, codigo: event.target.value }))}
                className="ds-input"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label htmlFor="esc-nombre" className="ds-label">Nombre *</label>
              <input
                id="esc-nombre"
                type="text"
                maxLength={200}
                value={escuelaForm.nombre}
                onChange={(event) => setEscuelaForm((current) => ({ ...current, nombre: event.target.value }))}
                className="ds-input"
                placeholder="Nombre institucional de la escuela"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowEscuelaModal(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void saveEscuela()} disabled={savingEscuela} className="ds-btn ds-btn-primary">
              {savingEscuela ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={(open) => !saving && setShowModal(open)}>
        <DialogContent className={modalClass}>
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-base">{editing ? "Editar programa" : "Nuevo programa"}</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">Indica código, nombre y escuela del programa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div>
              <label htmlFor="prog-codigo" className="ds-label">Código *</label>
              <input
                id="prog-codigo"
                type="text"
                maxLength={50}
                value={form.codigo}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
                className="ds-input"
                placeholder="Ej. ING-SIS"
              />
            </div>
            <div>
              <label htmlFor="prog-nombre" className="ds-label">Nombre *</label>
              <input
                id="prog-nombre"
                type="text"
                maxLength={200}
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                className="ds-input"
                placeholder="Nombre institucional del programa"
              />
            </div>
            <div role="group" aria-labelledby="prog-escuela-label">
              <span id="prog-escuela-label" className="ds-label">Escuela *</span>
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
          <DialogFooter className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowModal(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void savePrograma()} disabled={saving} className="ds-btn ds-btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
