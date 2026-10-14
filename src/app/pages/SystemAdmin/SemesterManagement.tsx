import { useEffect, useState } from "react";
import { CalendarRange, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, InlineAlert, Panel, PageLoading, StatusPill } from "../../components/ds/primitives";
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
  const [loadError, setLoadError] = useState(false);

  const loadSemesters = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const response = await fetch(`${API_BASE}/admin/semestres`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSemesters(data.detalle || []);
    } catch {
      setSemesters([]);
      setLoadError(true);
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


  const numCell = (value: number | null | undefined) => (
    <td className="hidden text-right md:table-cell">{value || 0}</td>
  );

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineAlert
          action={
            <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadSemesters()}>
              Reintentar
            </button>
          }
        >
          No se pudieron cargar los semestres.
        </InlineAlert>
      )}

      <Panel
        title="Calendario de semestres"
        description="Crea, edita, activa o elimina periodos. La clonación de grupos está en Tareas semanales."
        action={
          <button type="button" onClick={openCreate} className="ds-btn ds-btn-primary ds-btn-sm">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo semestre
          </button>
        }
        bodyClassName=""
      >
        {loading && <PageLoading label="Cargando semestres…" />}
        {!loading && !loadError && semesters.length === 0 && (
          <EmptyState
            icon={CalendarRange}
            title="No hay semestres configurados"
            action={
              <button type="button" onClick={openCreate} className="ds-btn ds-btn-primary ds-btn-sm">
                <Plus className="h-4 w-4" aria-hidden /> Crear el primer semestre
              </button>
            }
          >
            Crea un semestre para poder organizar grupos, plantillas y reportes.
          </EmptyState>
        )}
        {!loading && semesters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Semestre</th>
                  <th>Fechas</th>
                  <th className="hidden text-right md:table-cell">Semanas</th>
                  <th className="hidden text-right md:table-cell">Grupos</th>
                  <th className="hidden text-right lg:table-cell">Plantillas</th>
                  <th className="hidden text-right lg:table-cell">Docentes</th>
                  <th className="hidden text-right lg:table-cell">Reportes</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {semesters.map((semester) => (
                  <tr key={semester.codigo}>
                    <td style={{ fontWeight: 600 }}>{semester.codigo}</td>
                    <td className="whitespace-nowrap text-text-muted">
                      {dateOnly(semester.fecha_inicio)} – {dateOnly(semester.fecha_fin)}
                    </td>
                    {numCell(semester.numero_semanas)}
                    {numCell(semester.num_grupos)}
                    <td className="hidden text-right lg:table-cell">{semester.num_plantillas || 0}</td>
                    <td className="hidden text-right lg:table-cell">{semester.num_docentes || 0}</td>
                    <td className="hidden text-right lg:table-cell">{semester.num_reportes || 0}</td>
                    <td>
                      {semester.activo ? (
                        <StatusPill tone="success">Activo</StatusPill>
                      ) : (
                        <button
                          type="button"
                          disabled={busyCode === semester.codigo}
                          onClick={() => void activateSemester(semester)}
                          className="ds-btn ds-btn-secondary ds-btn-sm"
                          aria-label={`Activar semestre ${semester.codigo}`}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden /> Activar
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(semester)}
                          className="ds-btn ds-btn-ghost ds-btn-sm !px-1.5"
                          aria-label={`Editar ${semester.codigo}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={busyCode === semester.codigo}
                          onClick={() => void deleteSemester(semester)}
                          className="ds-btn ds-btn-ghost ds-btn-sm !px-1.5 hover:!text-red-700"
                          aria-label={`Eliminar ${semester.codigo}`}
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

      <Dialog open={showModal} onOpenChange={(open) => !saving && setShowModal(open)}>
        <DialogContent className="gap-0 rounded-xl border-line bg-surface p-0 sm:max-w-md">
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-base">{editing ? "Editar semestre" : "Nuevo semestre"}</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              El código usa el formato AAAAA o AAAAB, por ejemplo 2026B.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
            <div>
              <label htmlFor="sem-codigo" className="ds-label">Código *</label>
              <input
                id="sem-codigo"
                value={form.codigo}
                maxLength={5}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))}
                placeholder="2026B"
                className="ds-input"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="sem-inicio" className="ds-label">Inicio *</label>
                <input
                  id="sem-inicio"
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))}
                  className="ds-input"
                />
              </div>
              <div>
                <label htmlFor="sem-fin" className="ds-label">Finalización *</label>
                <input
                  id="sem-fin"
                  type="date"
                  min={form.fecha_inicio || undefined}
                  value={form.fecha_fin}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_fin: event.target.value }))}
                  className="ds-input"
                />
              </div>
            </div>
            <div>
              <label htmlFor="sem-semanas" className="ds-label">Número de semanas *</label>
              <input
                id="sem-semanas"
                type="number"
                min={1}
                max={53}
                value={form.numero_semanas}
                onChange={(event) => setForm((current) => ({ ...current, numero_semanas: event.target.value }))}
                className="ds-input"
              />
            </div>
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line-strong accent-[var(--color-brand)]"
                  checked={form.activo}
                  onChange={(event) => setForm((current) => ({ ...current, activo: event.target.checked }))}
                />
                Establecer como semestre activo
              </label>
            )}
          </div>
          <DialogFooter className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowModal(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={saving} onClick={() => void saveSemester()} className="ds-btn ds-btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
