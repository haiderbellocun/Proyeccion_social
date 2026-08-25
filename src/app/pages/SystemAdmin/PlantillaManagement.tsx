import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Pencil, Trash2, Link2, UsersRound } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import { formatDateOnly, toDateOnly } from "../../lib/date";

interface GrupoRow {
  id: number;
  nombre: string;
  tipo_docente?: string;
  semestre?: string;
}

interface PlantillaRow {
  id: number;
  grupo_id: number;
  numero: number;
  categoria: string;
  fase: string;
  mes: string;
  semana_numero: number;
  entregable: string;
  descripcion_evidencia?: string | null;
  enlace_referencia?: string | null;
  horas: number | string;
  dias_inicio_desde_feb?: number | null;
  dias_fin_desde_feb?: number | null;
  fecha_inicio_calculada?: string | null;
  fecha_fin_calculada?: string | null;
}

interface MassPreview {
  semestre: string;
  entregable_clave: string;
  plantillas_afectadas: number;
  grupos_afectados: number;
  coincidencias: { grupo_id: number; grupo_nombre: string }[];
}

const emptyForm = {
  numero: "",
  categoria: "",
  fase: "",
  mes: "",
  semana_numero: "",
  entregable: "",
  descripcion_evidencia: "",
  enlace_referencia: "",
  horas: "",
  fecha_inicio: "",
  fecha_fin: "",
};

export default function PlantillaManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [semestre, setSemestre] = useState("");
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<number | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaRow[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [massSource, setMassSource] = useState<PlantillaRow | null>(null);
  const [massDescription, setMassDescription] = useState("");
  const [massLink, setMassLink] = useState("");
  const [massPreview, setMassPreview] = useState<MassPreview | null>(null);
  const [loadingMassPreview, setLoadingMassPreview] = useState(false);
  const [savingMass, setSavingMass] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/semestres`);
        const j = await r.json();
        const s: string[] = j.semestres || [];
        setSemestresList(s);
        if (s.length) setSemestre((prev) => prev || s[0]);
      } catch {
        setSemestresList([]);
      }
    })();
  }, []);

  const loadGrupos = useCallback(async () => {
    setLoadingGrupos(true);
    try {
      const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
      const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
      const j = await r.json();
      setGrupos(j.grupos || []);
    } catch {
      notify.error("No se pudieron cargar los grupos");
      setGrupos([]);
    } finally {
      setLoadingGrupos(false);
    }
  }, [semestre]);

  useEffect(() => {
    void loadGrupos();
  }, [loadGrupos]);

  const loadPlantillas = useCallback(async (grupoId: number) => {
    setLoadingPlantillas(true);
    try {
      const r = await fetch(`${API_BASE}/admin/grupos-matriz/${grupoId}/plantillas`);
      const j = await r.json();
      setPlantillas(j.plantillas || []);
    } catch {
      notify.error("No se pudieron cargar plantillas");
      setPlantillas([]);
    } finally {
      setLoadingPlantillas(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGrupoId != null) {
      void loadPlantillas(selectedGrupoId);
      setPage(1);
    } else {
      setPlantillas([]);
    }
  }, [selectedGrupoId, loadPlantillas]);

  const selectedGrupo = grupos.find((g) => g.id === selectedGrupoId);

  const sortedPlantillas = useMemo(
    () =>
      [...plantillas].sort(
        (a, b) =>
          Number(a.semana_numero || 0) - Number(b.semana_numero || 0) ||
          Number(a.numero || 0) - Number(b.numero || 0)
      ),
    [plantillas]
  );

  const availableMonths = useMemo(
    () => [...new Set(sortedPlantillas.map((row) => row.mes.trim()).filter(Boolean))],
    [sortedPlantillas]
  );

  const totalPages = Math.max(1, Math.ceil(sortedPlantillas.length / perPage));
  const pageSlice = sortedPlantillas.slice((page - 1) * perPage, page * perPage);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, mes: availableMonths[0] || "" });
    setModalOpen(true);
  };

  const openEdit = (p: PlantillaRow) => {
    setEditingId(p.id);
    setForm({
      numero: String(p.numero ?? ""),
      categoria: p.categoria ?? "",
      fase: p.fase ?? "",
      mes: String(p.mes || "").trim(),
      semana_numero: String(p.semana_numero ?? ""),
      entregable: p.entregable ?? "",
      descripcion_evidencia: p.descripcion_evidencia ?? "",
      enlace_referencia: p.enlace_referencia ?? "",
      horas: String(p.horas ?? ""),
      fecha_inicio: toDateOnly(p.fecha_inicio_calculada) ?? "",
      fecha_fin: toDateOnly(p.fecha_fin_calculada) ?? "",
    });
    setModalOpen(true);
  };

  const saveModal = async () => {
    if (selectedGrupoId == null) return;
    const body: Record<string, unknown> = {
      numero: Number(form.numero),
      categoria: form.categoria.trim(),
      fase: form.fase.trim(),
      mes: form.mes.trim(),
      semana_numero: Number(form.semana_numero),
      entregable: form.entregable.trim(),
      descripcion_evidencia: form.descripcion_evidencia.trim() || "",
      enlace_referencia: form.enlace_referencia.trim() || null,
      horas: Number(form.horas),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
    };
    if (
      !form.entregable.trim() ||
      !form.categoria.trim() ||
      !form.fase.trim() ||
      !form.mes.trim() ||
      Number.isNaN(body.numero as number) ||
      Number.isNaN(body.semana_numero as number) ||
      Number.isNaN(body.horas as number) ||
      !form.fecha_inicio ||
      !form.fecha_fin ||
      form.fecha_fin < form.fecha_inicio
    ) {
      notify.warning("Completa los campos requeridos.");
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editingId != null) {
        res = await fetch(`${API_BASE}/admin/plantillas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_BASE}/admin/grupos-matriz/${selectedGrupoId}/plantillas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof j.error === "string" ? j.error : "Error al guardar");
        return;
      }
      setModalOpen(false);
      await loadPlantillas(selectedGrupoId);
      notify.success(editingId != null ? "Cambios guardados" : "Plantilla creada");
    } catch {
      notify.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (p: PlantillaRow) => {
    const accepted = await requestConfirmation({
      title: "Eliminar plantilla",
      description: `¿Deseas eliminar la plantilla #${p.numero}: ${p.entregable.slice(0, 70)}${
        p.entregable.length > 70 ? "…" : ""
      }?`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      let res = await fetch(`${API_BASE}/admin/plantillas/${p.id}`, { method: "DELETE" });
      let j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.requiere_confirmacion) {
        const forceAccepted = await requestConfirmation({
          title: "Conservar reportes y eliminar plantilla",
          description:
            `Esta plantilla tiene ${Number(j.usos || 0)} reporte(s) vinculado(s). ` +
            "Los reportes se conservarán, pero dejarán de estar ligados a la plantilla.",
          confirmLabel: "Eliminar plantilla",
          tone: "warning",
        });
        if (!forceAccepted) return;
        res = await fetch(`${API_BASE}/admin/plantillas/${p.id}?forzar=true`, {
          method: "DELETE",
        });
        j = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        notify.error(j.error || "No se pudo eliminar");
        return;
      }
      if (selectedGrupoId != null) await loadPlantillas(selectedGrupoId);
      notify.success("Plantilla eliminada");
    } catch {
      notify.error("Error de conexión");
    }
  };

  const openMassUpdate = async (source: PlantillaRow) => {
    setMassSource(source);
    setMassDescription(source.descripcion_evidencia || "");
    setMassLink(source.enlace_referencia || "");
    setMassPreview(null);
    setLoadingMassPreview(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/plantillas/actualizacion-masiva/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantilla_id: source.id }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo calcular el alcance del cambio.");
        setMassSource(null);
        return;
      }
      setMassPreview(data as MassPreview);
    } catch {
      notify.error("Error de conexión al calcular el alcance.");
      setMassSource(null);
    } finally {
      setLoadingMassPreview(false);
    }
  };

  const applyMassUpdate = async () => {
    if (!massSource || !massPreview) return;
    const accepted = await requestConfirmation({
      title: "Actualizar evidencia compartida",
      description: `Se actualizarán ${massPreview.plantillas_afectadas} plantilla(s) de ${massPreview.grupos_afectados} grupo(s) del semestre ${massPreview.semestre}.`,
      confirmLabel: "Aplicar a todos",
      tone: "warning",
    });
    if (!accepted) return;
    setSavingMass(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/plantillas/actualizacion-masiva`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plantilla_id: massSource.id,
            descripcion_evidencia: massDescription,
            enlace_referencia: massLink || null,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo aplicar la actualización masiva.");
        return;
      }
      if (selectedGrupoId != null) await loadPlantillas(selectedGrupoId);
      setMassSource(null);
      notify.success(
        `Evidencia actualizada en ${Number(data.grupos_afectados || 0)} grupo(s)`
      );
    } catch {
      notify.error("Error de conexión al actualizar las plantillas.");
    } finally {
      setSavingMass(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[480px]">
      <div className="lg:w-[30%] space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Semestre</label>
          <AppSelect
            value={semestre}
            onValueChange={(v) => setSemestre(v)}
            emptyValue="__all__"
            className="w-full"
            options={[
              { value: "__all__", label: "Todos" },
              ...semestresList.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>
        <p className="text-xs text-gray-500">Selecciona un grupo</p>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {loadingGrupos && <p className="text-sm text-gray-400">Cargando…</p>}
          {!loadingGrupos &&
            grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGrupoId(g.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selectedGrupoId === g.id
                    ? "border-blue-700 bg-blue-50"
                    : "border-gray-100 bg-white hover:bg-gray-50"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{g.nombre}</p>
                <p className="text-xs text-gray-500 mt-1">{g.semestre}</p>
                <span
                  className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    g.tipo_docente === "NUEVO" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {g.tipo_docente || "ANTIGUO"}
                </span>
                {selectedGrupoId === g.id && (
                  <p className="text-xs text-gray-400 mt-1">{sortedPlantillas.length} plantillas</p>
                )}
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Plantillas — {selectedGrupo?.nombre ?? "Selecciona un grupo"}
          </h2>
          <button
            type="button"
            disabled={selectedGrupoId == null}
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900 text-white text-sm disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Nueva Plantilla
          </button>
        </div>

        {!selectedGrupoId && <p className="text-sm text-gray-400">Elige un grupo a la izquierda.</p>}
        {selectedGrupoId != null && (
          <>
            {loadingPlantillas && <p className="text-sm text-gray-400">Cargando plantillas…</p>}
            {!loadingPlantillas && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">N°</th>
                      <th className="text-left px-2 py-2">Semana</th>
                      <th className="text-left px-2 py-2">Periodo</th>
                      <th className="text-left px-2 py-2">Mes</th>
                      <th className="text-left px-2 py-2">Fase</th>
                      <th className="text-left px-2 py-2">Entregable</th>
                      <th className="text-left px-2 py-2">Horas</th>
                      <th className="text-left px-2 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pageSlice.map((p) => {
                      const short =
                        p.entregable.length > 60 ? `${p.entregable.slice(0, 60)}…` : p.entregable;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/80">
                          <td className="px-3 py-2 font-mono text-xs">{p.numero}</td>
                          <td className="px-2 py-2">{p.semana_numero}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500">
                            <div>{formatDateOnly(p.fecha_inicio_calculada)}</div>
                            <div>hasta {formatDateOnly(p.fecha_fin_calculada)}</div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{p.mes}</td>
                          <td className="px-2 py-2 max-w-[160px] truncate" title={p.fase}>
                            {p.fase}
                          </td>
                          <td className="px-2 py-2 max-w-[240px]">
                            <span title={p.entregable} className="line-clamp-2">
                              {short}
                            </span>
                          </td>
                          <td className="px-2 py-2">{p.horas}</td>
                          <td className="px-2 py-2 flex gap-1">
                            <button
                              type="button"
                              onClick={() => void openMassUpdate(p)}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                              title="Actualizar evidencia en todos los grupos coincidentes"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteRow(p)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedPlantillas.length > perPage && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="text-blue-700 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-gray-500">
                      Página {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="text-blue-700 disabled:opacity-40"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-800" />
              <h3 className="font-semibold text-gray-900">
                {editingId != null ? "Editar plantilla" : "Nueva plantilla"}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">semana_numero (1–16)</label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={form.semana_numero}
                  onChange={(e) => setForm((f) => ({ ...f, semana_numero: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">mes</label>
                <input
                  list="plantilla-month-options"
                  value={form.mes}
                  onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
                <datalist id="plantilla-month-options">
                  {availableMonths.map((month) => <option key={month} value={month} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-gray-500">numero</label>
                <input
                  type="number"
                  value={form.numero}
                  onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">horas</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.horas}
                  onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">fase</label>
                <input
                  value={form.fase}
                  onChange={(e) => setForm((f) => ({ ...f, fase: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500">categoria</label>
                <input
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha exacta de inicio</label>
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha límite exacta</label>
                <input
                  type="date"
                  value={form.fecha_fin}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              El sistema conserva internamente la distancia respecto al inicio del semestre para
              que la plantilla pueda clonarse a otros periodos.
            </p>
            <div>
              <label className="text-xs text-gray-500">entregable</label>
              <textarea
                rows={3}
                value={form.entregable}
                onChange={(e) => setForm((f) => ({ ...f, entregable: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">descripcion_evidencia (opcional)</label>
              <textarea
                rows={4}
                value={form.descripcion_evidencia}
                onChange={(e) => setForm((f) => ({ ...f, descripcion_evidencia: e.target.value }))}
                className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">
                Enlace o formulario de referencia (HTTPS)
              </label>
              <input
                type="url"
                placeholder="https://"
                value={form.enlace_referencia}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enlace_referencia: e.target.value }))
                }
                className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm border rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveModal()}
                className="px-4 py-2 text-sm rounded-lg bg-blue-900 text-white disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {massSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-4">
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Actualización masiva de evidencia
                </h3>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {massSource.entregable}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              {loadingMassPreview ? (
                <p className="text-sm text-gray-500">Calculando grupos afectados…</p>
              ) : massPreview ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">
                    {massPreview.plantillas_afectadas} plantilla(s) en {" "}
                    {massPreview.grupos_afectados} grupo(s)
                  </p>
                  <p className="mt-1 text-xs text-emerald-800">
                    Alcance restringido al semestre {massPreview.semestre}. Solo se incluyen
                    entregables cuyo nombre coincide exactamente.
                  </p>
                  <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                    {[
                      ...new Map(
                        massPreview.coincidencias.map((row) => [row.grupo_id, row])
                      ).values(),
                    ].map((row) => (
                      <span
                        key={row.grupo_id}
                        className="rounded-full bg-white px-2 py-1 text-[11px] text-emerald-800"
                      >
                        {row.grupo_nombre}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Instrucción o evidencia documental compartida
                </label>
                <textarea
                  rows={5}
                  value={massDescription}
                  onChange={(event) => setMassDescription(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Enlace o formulario compartido
                </label>
                <input
                  type="url"
                  placeholder="https://"
                  value={massLink}
                  onChange={(event) => setMassLink(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setMassSource(null)}
                disabled={savingMass}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void applyMassUpdate()}
                disabled={savingMass || loadingMassPreview || !massPreview}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingMass ? "Aplicando…" : "Actualizar grupos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
