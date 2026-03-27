import { useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { Badge } from "../../components/Badge";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  program: string;
  grupo_matriz_id: number | null;
  grupo_matriz_nombre: string | null;
};
type AdminProject = {
  id: number;
  name: string;
  coordinatorId?: number | null;
  coordinator: string;
  program: string;
  type: "project" | "agreement" | "activity";
  status: "active" | "delayed";
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  totalHours?: number | null;
  weeks?: number | null;
};
type EntregableItem = { texto: string; horas: number | null };
type WeekDetail = {
  id?: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables?: EntregableItem[];
};
type WeeklyProject = { id: number; name: string; weeks: WeekDetail[] };
type MatrixGroup = { id: number; nombre: string; activo: boolean };

export default function ProjectManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [matrixGroups, setMatrixGroups] = useState<MatrixGroup[]>([]);
  const [loadingMatrixGroups, setLoadingMatrixGroups] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projTitle, setProjTitle] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projProgram, setProjProgram] = useState("");
  const [projTeacherId, setProjTeacherId] = useState<number | "">("");
  const [projType, setProjType] = useState<"project" | "agreement" | "activity">("project");
  const [projHours, setProjHours] = useState<string>("");
  const [projWeeks, setProjWeeks] = useState<string>("");
  const [projStartDate, setProjStartDate] = useState<string>("");
  const [savingProject, setSavingProject] = useState(false);
  const [weeksDetail, setWeeksDetail] = useState<WeekDetail[]>([]);
  const [createWeeklyItems, setCreateWeeklyItems] = useState<Record<number, EntregableItem[]>>({});
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [weeklyItems, setWeeklyItems] = useState<Record<string, EntregableItem[]>>({});
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<number | "">("");
  const [assignSelectedDocentes, setAssignSelectedDocentes] = useState<number[]>([]);
  const [assignGrupoPick, setAssignGrupoPick] = useState<Record<number, number | "">>({});
  const [assignSaving, setAssignSaving] = useState(false);
  const [showProjectDetailModal, setShowProjectDetailModal] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);
  const [detailStartDate, setDetailStartDate] = useState<string>("");
  const [detailEndDate, setDetailEndDate] = useState<string>("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const docenteOptions = users.filter((u) => u.role === "Docente");

  const loadDocentes = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE_URL}/admin/docentes?page=1&limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.docentes || []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    }
  };
  const loadProjects = async () => {
    try {
      setError(null);
      const res = await fetch(
        `${API_BASE_URL}/admin/proyectos?page=${page}&limit=${limit}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const rows = data.proyectos || data.data || [];
      setProjects(rows);
      setTotal(Number(data.pagination?.total ?? rows.length));
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    }
  };
  const loadWeekly = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos-semanas`);
      if (!res.ok) return;
      const data = await res.json();
      setWeeklyProjects(data.proyectos || []);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
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
    void loadProjects();
    void loadWeekly();
    void refreshMatrixGroups();
  }, [page, limit]);

  const regenerateWeeksDetail = (weeksStr: string, startDateStr: string) => {
    const weeksNum = Number(weeksStr);
    if (!weeksNum || weeksNum <= 0 || !startDateStr) return setWeeksDetail([]);
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return setWeeksDetail([]);
    const nuevo: WeekDetail[] = [];
    const nuevosItems: Record<number, EntregableItem[]> = {};
    for (let i = 0; i < weeksNum; i++) {
      const numero = i + 1;
      const inicio = new Date(start);
      inicio.setDate(start.getDate() + i * 7);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      const toIso = (d: Date) => d.toISOString().slice(0, 10);
      nuevo.push({ numero, fechaInicio: toIso(inicio), fechaFin: toIso(fin) });
      nuevosItems[numero] = createWeeklyItems[numero] ?? [{ texto: "", horas: null }];
    }
    setWeeksDetail(nuevo);
    setCreateWeeklyItems(nuevosItems);
  };

  const handleOpenProjectModal = () => {
    setProjTitle("");
    setProjDescription("");
    setProjProgram("");
    setProjTeacherId("");
    setProjType("project");
    setProjHours("");
    setProjWeeks("");
    setProjStartDate("");
    setWeeksDetail([]);
    setCreateWeeklyItems({});
    setShowProjectModal(true);
  };

  const handleSaveProject = async () => {
    if (!projTitle || !projProgram || !projTeacherId) return;
    try {
      setSavingProject(true);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: projTitle,
          descripcion: projDescription,
          programaNombre: projProgram,
          docenteId: projTeacherId,
          tipoVisual: projType,
          horasTotales: projHours ? Number(projHours) : undefined,
          semanas: projWeeks ? Number(projWeeks) : undefined,
          fechaInicio: projStartDate || undefined,
          semanasDetalle:
            weeksDetail.length > 0
              ? weeksDetail.map((w) => ({
                  numero: w.numero,
                  fechaInicio: w.fechaInicio,
                  fechaFin: w.fechaFin,
                }))
              : undefined,
        }),
      });
      if (!res.ok) return;
      await loadProjects();
      await loadWeekly();
      setShowProjectModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProject(false);
    }
  };

  const loadAssignedDocentes = async (projectId: number, fallbackCoordinatorId?: number | null) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${projectId}/docentes`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const ids = (data.docentes || []).map((d: { id: number }) => d.id);
      setAssignSelectedDocentes(ids.length === 0 && fallbackCoordinatorId ? [fallbackCoordinatorId] : ids);
    } catch {
      setAssignSelectedDocentes(fallbackCoordinatorId ? [fallbackCoordinatorId] : []);
    }
  };

  const handleSaveAssign = async () => {
    if (!assignProjectId || typeof assignProjectId !== "number") return false;
    try {
      setAssignSaving(true);
      const docentesPayload = assignSelectedDocentes.map((id) => {
        const u = users.find((x) => x.id === id);
        const raw = assignGrupoPick[id];
        const pickNum = raw === "" || raw === undefined ? NaN : Number(raw);
        const payload: { id: number; grupo_matriz_id?: number } = { id };
        if (!u?.grupo_matriz_id && pickNum > 0 && !Number.isNaN(pickNum)) payload.grupo_matriz_id = pickNum;
        return payload;
      });
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${assignProjectId}/docentes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docentes: docentesPayload }),
      });
      if (!res.ok) return false;
      await loadDocentes();
      setShowAssignModal(false);
      return true;
    } catch {
      return false;
    } finally {
      setAssignSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="flex justify-between gap-3">
        <button
          onClick={handleOpenProjectModal}
          className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Crear iniciativa
        </button>
        <button
          onClick={async () => {
            if (!projects.length) return;
            const defaultProjectId = projects[0]?.id ?? null;
            setAssignProjectId(defaultProjectId ?? "");
            setAssignGrupoPick({});
            setShowAssignModal(true);
            await refreshMatrixGroups();
            if (defaultProjectId) {
              const proj = projects.find((p) => p.id === defaultProjectId) || null;
              await loadAssignedDocentes(defaultProjectId, proj?.coordinatorId ?? null);
            }
          }}
          className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Asignar iniciativa
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Nombre de la Iniciativa</th>
                <th className="text-left px-6 py-3">Tipo</th>
                <th className="text-left px-6 py-3">Horas</th>
                <th className="text-left px-6 py-3">Semanas</th>
                <th className="text-left px-6 py-3">Coordinador</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="px-6 py-4"><Badge variant={p.type} /></td>
                  <td className="px-6 py-4 text-gray-600">{p.totalHours != null ? `${p.totalHours} hrs` : "—"}</td>
                  <td className="px-6 py-4 text-gray-600">{p.weeks != null ? `${p.weeks}` : "—"}</td>
                  <td className="px-6 py-4 text-gray-600">{p.coordinator}</td>
                  <td className="px-6 py-4"><Badge variant={p.status} /></td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        className="text-[#1d4ed8] hover:text-[#1e3a8a]"
                        onClick={() => {
                          const proj = projects.find((x) => x.id === p.id) || null;
                          setDetailProjectId(p.id);
                          setDetailStartDate(proj?.startDate ? proj.startDate.slice(0, 10) : "");
                          setDetailEndDate(proj?.endDate ? proj.endDate.slice(0, 10) : "");
                          setShowProjectDetailModal(true);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        <span className="text-xs text-gray-500">Página {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page * limit >= total}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente
        </button>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">Crear nueva iniciativa</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input value={projTitle} onChange={(e) => setProjTitle(e.target.value)} placeholder="Nombre de la iniciativa *" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" />
              <textarea value={projDescription} onChange={(e) => setProjDescription(e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <select value={projType} onChange={(e) => setProjType(e.target.value as "project" | "agreement" | "activity")} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50">
                  <option value="project">Iniciativa</option>
                  <option value="agreement">Convenio</option>
                  <option value="activity">Actividad</option>
                </select>
                <select value={projProgram} onChange={(e) => setProjProgram(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50">
                  <option value="">Seleccionar programa...</option>
                  {Array.from(new Set(users.map((u) => u.program))).filter(Boolean).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input type="number" min={0} value={projHours} onChange={(e) => setProjHours(e.target.value)} placeholder="Horas" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" />
                <input type="number" min={1} value={projWeeks} onChange={(e) => { setProjWeeks(e.target.value); regenerateWeeksDetail(e.target.value, projStartDate); }} placeholder="Semanas" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" />
                <input type="date" value={projStartDate} onChange={(e) => { setProjStartDate(e.target.value); regenerateWeeksDetail(projWeeks, e.target.value); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" />
                <select value={projTeacherId} onChange={(e) => setProjTeacherId(e.target.value ? Number(e.target.value) : "")} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50">
                  <option value="">Seleccionar docente...</option>
                  {docenteOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} — {d.program}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowProjectModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProject} disabled={savingProject} className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm">{savingProject ? "Guardando..." : "Guardar iniciativa"}</button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">Asignar iniciativa a docentes</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <select
                value={assignProjectId}
                onChange={async (e) => {
                  const value = e.target.value;
                  if (!value) return;
                  const id = Number(value);
                  setAssignProjectId(id);
                  const proj = projects.find((p) => p.id === id) || null;
                  await loadAssignedDocentes(id, proj?.coordinatorId ?? null);
                }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
              >
                <option value="">Seleccionar iniciativa...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="border border-gray-100 rounded-lg max-h-64 overflow-auto">
                {docenteOptions.map((d) => (
                  <div key={d.id} className="px-3 py-2 text-sm border-b border-gray-50 last:border-b-0">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={assignSelectedDocentes.includes(d.id)} onChange={() => setAssignSelectedDocentes((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])} className="w-4 h-4 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <span className="text-gray-800 block" style={{ fontWeight: 500 }}>{d.name}</span>
                        {!d.grupo_matriz_id && (
                          <select
                            value={assignGrupoPick[d.id] === "" ? "" : assignGrupoPick[d.id] ?? ""}
                            onChange={(e) => setAssignGrupoPick((prev) => ({ ...prev, [d.id]: e.target.value === "" ? "" : Number(e.target.value) }))}
                            disabled={loadingMatrixGroups}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white"
                          >
                            <option value="">Grupo matriz (asignar si aplica)…</option>
                            {matrixGroups.filter((g) => g.activo !== false).map((g) => (
                              <option key={g.id} value={g.id}>{g.nombre}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowAssignModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void handleSaveAssign()} disabled={assignSaving} className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm">{assignSaving ? "Guardando..." : "Guardar asignación"}</button>
            </div>
          </div>
        </div>
      )}

      {showProjectDetailModal && detailProjectId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">{projects.find((p) => p.id === detailProjectId)?.name || "Proyecto"}</h3>
              <button onClick={() => setShowProjectDetailModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={detailStartDate} onChange={(e) => setDetailStartDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-md" />
                <input type="date" value={detailEndDate} onChange={(e) => setDetailEndDate(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-md" />
              </div>
              <p className="text-xs text-gray-500">Los entregables y docentes asignados se conservan en esta sección.</p>
            </div>
            <div className="flex justify-end px-6 pb-6">
              <button
                type="button"
                disabled={detailSaving}
                onClick={async () => {
                  if (!detailProjectId) return;
                  setDetailSaving(true);
                  const weeklyProj = weeklyProjects.find((p) => p.id === detailProjectId);
                  if (weeklyProj) {
                    const semanasPayload = weeklyProj.weeks.map((w) => {
                      const key = `${weeklyProj.id}-${w.numero}`;
                      const items: EntregableItem[] = weeklyItems[key] ?? (w.entregables || [{ texto: "", horas: null }]);
                      return { semanaId: w.id, entregables: items };
                    });
                    await fetch(`${API_BASE_URL}/admin/proyectos/${detailProjectId}/entregables-semanales`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ semanas: semanasPayload }),
                    });
                  }
                  await handleSaveAssign();
                  await fetch(`${API_BASE_URL}/admin/proyectos/${detailProjectId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fechaInicio: detailStartDate || null, fechaFin: detailEndDate || null }),
                  });
                  setDetailSaving(false);
                  setShowProjectDetailModal(false);
                }}
                className="px-5 py-2.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white rounded-lg text-sm shadow-sm"
                style={{ fontWeight: 600 }}
              >
                {detailSaving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
