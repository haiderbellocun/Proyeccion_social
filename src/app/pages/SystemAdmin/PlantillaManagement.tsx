import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";
import { API_BASE } from "../../config/api";

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
  horas: number | string;
  dias_inicio_desde_feb?: number | null;
  dias_fin_desde_feb?: number | null;
}

const MESES = ["Febrero", "Marzo", "Abril", "Mayo"];

const emptyForm = {
  numero: "",
  categoria: "",
  fase: "",
  mes: "Febrero",
  semana_numero: "",
  entregable: "",
  descripcion_evidencia: "",
  horas: "",
  dias_inicio_desde_feb: "",
  dias_fin_desde_feb: "",
};

export default function PlantillaManagement() {
  const [semestre, setSemestre] = useState("");
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<number | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaRow[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
    setError(null);
    try {
      const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
      const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
      const j = await r.json();
      setGrupos(j.grupos || []);
    } catch {
      setError("No se pudieron cargar los grupos");
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
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/grupos-matriz/${grupoId}/plantillas`);
      const j = await r.json();
      setPlantillas(j.plantillas || []);
    } catch {
      setError("No se pudieron cargar plantillas");
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

  const totalPages = Math.max(1, Math.ceil(sortedPlantillas.length / perPage));
  const pageSlice = sortedPlantillas.slice((page - 1) * perPage, page * perPage);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: PlantillaRow) => {
    setEditingId(p.id);
    setForm({
      numero: String(p.numero ?? ""),
      categoria: p.categoria ?? "",
      fase: p.fase ?? "",
      mes:
        MESES.find((m) => m.toLowerCase() === String(p.mes || "").toLowerCase().trim()) ||
        "Febrero",
      semana_numero: String(p.semana_numero ?? ""),
      entregable: p.entregable ?? "",
      descripcion_evidencia: p.descripcion_evidencia ?? "",
      horas: String(p.horas ?? ""),
      dias_inicio_desde_feb: String(p.dias_inicio_desde_feb ?? ""),
      dias_fin_desde_feb: String(p.dias_fin_desde_feb ?? ""),
    });
    setModalOpen(true);
  };

  const saveModal = async () => {
    if (selectedGrupoId == null) return;
    const body: Record<string, unknown> = {
      numero: Number(form.numero),
      categoria: form.categoria.trim(),
      fase: form.fase.trim(),
      mes: form.mes,
      semana_numero: Number(form.semana_numero),
      entregable: form.entregable.trim(),
      descripcion_evidencia: form.descripcion_evidencia.trim() || "",
      horas: Number(form.horas),
      dias_inicio_desde_feb: Number(form.dias_inicio_desde_feb),
      dias_fin_desde_feb: Number(form.dias_fin_desde_feb),
    };
    if (
      !form.entregable.trim() ||
      !form.categoria.trim() ||
      !form.fase.trim() ||
      Number.isNaN(body.numero as number) ||
      Number.isNaN(body.semana_numero as number) ||
      Number.isNaN(body.horas as number)
    ) {
      alert("Completa los campos requeridos.");
      return;
    }
    setSaving(true);
    setError(null);
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
        setError(typeof j.error === "string" ? j.error : "Error al guardar");
        return;
      }
      setModalOpen(false);
      await loadPlantillas(selectedGrupoId);
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (p: PlantillaRow) => {
    if (!confirm(`¿Eliminar plantilla #${p.numero} — ${p.entregable.slice(0, 40)}…?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/plantillas/${p.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error || "No se pudo eliminar");
        return;
      }
      if (selectedGrupoId != null) await loadPlantillas(selectedGrupoId);
    } catch {
      alert("Error de conexión");
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[480px]">
      <div className="lg:w-[30%] space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Semestre</label>
          <select
            value={semestre}
            onChange={(e) => setSemestre(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Todos</option>
            {semestresList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
        )}
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
                <select
                  value={form.mes}
                  onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                >
                  {MESES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
                <label className="text-xs text-gray-500">dias_inicio_desde_feb</label>
                <input
                  type="number"
                  value={form.dias_inicio_desde_feb}
                  onChange={(e) => setForm((f) => ({ ...f, dias_inicio_desde_feb: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">dias_fin_desde_feb</label>
                <input
                  type="number"
                  value={form.dias_fin_desde_feb}
                  onChange={(e) => setForm((f) => ({ ...f, dias_fin_desde_feb: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Ayuda: Semana 1 ≈ días 0–6 desde inicio Feb, Semana 2 ≈ 7–13, etc.
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
    </div>
  );
}
