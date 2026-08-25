import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { ChevronDown, ChevronUp, Edit2, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Badge } from "../../components/Badge";
import { AppSelect } from "../../components/AppSelect";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

const API_BASE_URL = API_BASE;

type CatalogTeacher = { id: number; fullName: string; email?: string };
type CatalogProgram = { id: number; name: string; code?: string; teachers: CatalogTeacher[] };
type CatalogSchool = { name: string; programs: CatalogProgram[] };

type ApiProject = {
  id: number;
  name: string;
  description?: string | null;
  programId?: number | null;
  schoolId?: number | null;
  school?: string;
  coordinatorId?: number | null;
  coordinator: string;
  program: string;
  type: "project" | "agreement" | "activity";
  status: "active" | "delayed" | "inactive";
  state?: "en_ejecucion" | "finalizado" | "suspendido";
  startDate?: string | null;
  endDate?: string | null;
  totalHours?: number | null;
  weeks?: number | null;
};

type EntregableDetalle = {
  id?: number;
  texto?: string;
  horas?: number | null;
  completado?: boolean;
  url_evidencia?: string | null;
};

type WeekDetail = {
  id?: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables?: EntregableDetalle[];
};

type WeeklyProject = { id: number; name: string; weeks: WeekDetail[] };

type AssignedDocente = { id: number; name: string; email?: string; programa?: string };

export default function ProjectManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<ApiProject | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoVisual, setTipoVisual] = useState<"project" | "agreement" | "activity">("project");
  const [projectState, setProjectState] = useState<"en_ejecucion" | "finalizado" | "suspendido">("en_ejecucion");
  const [escuelaName, setEscuelaName] = useState("");
  const [programaId, setProgramaId] = useState<number | "">("");
  const [docenteId, setDocenteId] = useState<number | "">("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horasTotales, setHorasTotales] = useState("");
  const [numSemanas, setNumSemanas] = useState("");
  const [weeksDraft, setWeeksDraft] = useState<WeekDetail[]>([]);
  const [savingCreate, setSavingCreate] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignList, setAssignList] = useState<AssignedDocente[]>([]);
  const [assignPick, setAssignPick] = useState<number | "">("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const programasDeEscuela = useMemo(() => {
    const s = schools.find((x) => x.name === escuelaName);
    return s?.programs ?? [];
  }, [schools, escuelaName]);

  const docentesDePrograma = useMemo(() => {
    const p = programasDeEscuela.find((x) => x.id === programaId);
    return p?.teachers ?? [];
  }, [programasDeEscuela, programaId]);

  const programaNombreSeleccionado = useMemo(() => {
    const p = programasDeEscuela.find((x) => x.id === programaId);
    return p?.name ?? "";
  }, [programasDeEscuela, programaId]);

  const allTeachersFlat = useMemo(() => {
    const m = new Map<number, CatalogTeacher>();
    for (const sch of schools) {
      for (const pr of sch.programs) {
        for (const t of pr.teachers) {
          if (!m.has(t.id)) m.set(t.id, t);
        }
      }
    }
    return Array.from(m.values());
  }, [schools]);

  const loadCatalog = useCallback(async () => {
    try {
      setLoadingCatalog(true);
      const res = await fetch(`${API_BASE_URL}/admin/catalogos`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSchools(data.schools || []);
    } catch {
      notify.error("No se pudo cargar el catálogo (escuelas/programas/docentes).");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rows = data.proyectos || data.data || [];
      setProjects(rows);
      setTotal(Number(data.pagination?.total ?? rows.length));
    } catch {
      notify.error("No se pudo cargar la lista de proyectos.");
    } finally {
      setLoadingList(false);
    }
  }, [page, limit]);

  const loadWeekly = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/proyectos-semanas`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWeeklyProjects(data.proyectos || []);
    } catch {
      /* silencioso: detalle expandible vacío */
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadWeekly();
  }, [loadWeekly]);

  const regenerateWeeks = (nStr: string, startStr: string) => {
    const n = Math.min(53, Math.max(1, Number(nStr) || 0));
    if (!n || !startStr) {
      setWeeksDraft([]);
      return;
    }
    const start = new Date(startStr + "T12:00:00");
    if (isNaN(start.getTime())) {
      setWeeksDraft([]);
      return;
    }
    const out: WeekDetail[] = [];
    for (let i = 0; i < n; i++) {
      const numero = i + 1;
      const inicio = new Date(start);
      inicio.setDate(start.getDate() + i * 7);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      out.push({ numero, fechaInicio: iso(inicio), fechaFin: iso(fin) });
    }
    setWeeksDraft(out);
  };

  const openCreate = () => {
    setEditingProject(null);
    setTitulo("");
    setDescripcion("");
    setTipoVisual("project");
    setProjectState("en_ejecucion");
    setEscuelaName("");
    setProgramaId("");
    setDocenteId("");
    setFechaInicio("");
    setFechaFin("");
    setHorasTotales("");
    setNumSemanas("");
    setWeeksDraft([]);
    setShowCreate(true);
  };

  const openEdit = (project: ApiProject) => {
    const school = schools.find((item) =>
      item.programs.some((program) => program.id === project.programId)
    );
    setEditingProject(project);
    setTitulo(project.name);
    setDescripcion(project.description || "");
    setTipoVisual(project.type);
    setProjectState(project.state || (project.status === "inactive" ? "finalizado" : project.status === "delayed" ? "suspendido" : "en_ejecucion"));
    setEscuelaName(school?.name || project.school || "");
    setProgramaId(project.programId || "");
    setDocenteId(project.coordinatorId || "");
    setFechaInicio(String(project.startDate || "").slice(0, 10));
    setFechaFin(String(project.endDate || "").slice(0, 10));
    setHorasTotales(project.totalHours == null ? "" : String(project.totalHours));
    setNumSemanas(project.weeks == null ? "" : String(project.weeks));
    regenerateWeeks(
      project.weeks == null ? "" : String(project.weeks),
      String(project.startDate || "").slice(0, 10)
    );
    setShowCreate(true);
  };

  const guardarCreate = async () => {
    const missingFields = [
      !titulo.trim() ? "título" : null,
      programaId === "" ? "programa" : null,
      docenteId === "" ? "docente responsable" : null,
      !fechaInicio ? "fecha inicial" : null,
      !numSemanas ? "número de semanas" : null,
    ].filter(Boolean);
    if (missingFields.length > 0) {
      notify.warning(`Completa: ${missingFields.join(", ")}.`);
      return;
    }
    const ns = Number(numSemanas);
    if (numSemanas && (ns < 1 || ns > 53)) {
      notify.warning("Número de semanas debe estar entre 1 y 53.");
      return;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      notify.warning("La fecha final no puede ser anterior a la fecha inicial.");
      return;
    }
    try {
      setSavingCreate(true);
      const payload = {
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          programaId,
          programaNombre: programaNombreSeleccionado,
          docenteId,
          tipoVisual,
          estado: projectState,
          horasTotales: horasTotales ? Number(horasTotales) : undefined,
          semanas: Number(numSemanas),
          fechaInicio,
          fechaFin: fechaFin || null,
          semanasDetalle: !editingProject && weeksDraft.length ? weeksDraft : undefined,
          forzar_cronograma: false,
      };
      const save = (forceSchedule: boolean) =>
        fetch(
          editingProject
            ? `${API_BASE_URL}/admin/proyectos/${editingProject.id}`
            : `${API_BASE_URL}/admin/proyectos`,
          {
            method: editingProject ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, forzar_cronograma: forceSchedule }),
          }
        );

      let res = await save(false);
      let data = await res.json().catch(() => ({}));
      if (editingProject && res.status === 409 && data.requiere_confirmacion) {
        const summary = data.resumen || {};
        const accepted = await requestConfirmation({
          title: "Reconstruir cronograma",
          description:
            `El cambio eliminará ${summary.total || 0} entregables existentes ` +
            `(${summary.con_avance || 0} con avance). Esta acción no se puede deshacer.`,
          confirmLabel: "Reconstruir",
          tone: "warning",
        });
        if (!accepted) return;
        res = await save(true);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        notify.error(data.error || `No se pudo ${editingProject ? "actualizar" : "crear"} la iniciativa.`);
        return;
      }
      setShowCreate(false);
      await loadProjects();
      await loadWeekly();
      notify.success(editingProject ? "Iniciativa actualizada" : "Iniciativa creada");
    } catch {
      notify.error("Error de conexión.");
    } finally {
      setSavingCreate(false);
    }
  };

  const deleteProject = async (project: ApiProject) => {
    const accepted = await requestConfirmation({
      title: "Eliminar iniciativa",
      description: `¿Deseas eliminar «${project.name}»?`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      setDeletingProjectId(project.id);
      let response = await fetch(`${API_BASE_URL}/admin/proyectos/${project.id}`, {
        method: "DELETE",
      });
      let data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.requiere_confirmacion) {
        const summary = data.resumen || {};
        const forceAccepted = await requestConfirmation({
          title: "Eliminar iniciativa y reportes",
          description:
            `La iniciativa tiene ${summary.reportes || 0} reportes o evidencias, ` +
            `${summary.entregables || 0} entregables y ${summary.semanas || 0} semanas. ` +
            "La eliminación será permanente.",
          confirmLabel: "Eliminar todo",
          tone: "danger",
        });
        if (!forceAccepted) return;
        response = await fetch(`${API_BASE_URL}/admin/proyectos/${project.id}?forzar=true`, {
          method: "DELETE",
        });
        data = await response.json().catch(() => ({}));
      }
      if (!response.ok) {
        notify.error(data.error || "No se pudo eliminar la iniciativa.");
        return;
      }
      setExpandedId((current) => (current === project.id ? null : current));
      await loadProjects();
      await loadWeekly();
      notify.success("Iniciativa eliminada");
    } catch {
      notify.error("Error de conexión al eliminar la iniciativa.");
    } finally {
      setDeletingProjectId(null);
    }
  };

  const openAssign = async (projectId: number) => {
    setAssignProjectId(projectId);
    setAssignPick("");
    setAssignOpen(true);
    setAssignLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${projectId}/docentes`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const docentes: AssignedDocente[] = (data.docentes || []).map((d: { id: number; name: string; email?: string; program?: string }) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        programa: d.program,
      }));
      setAssignList(docentes);
    } catch {
      setAssignList([]);
    } finally {
      setAssignLoading(false);
    }
  };

  const agregarDocenteAssign = () => {
    if (assignPick === "" || assignPick === null) return;
    const id = Number(assignPick);
    if (assignList.some((d) => d.id === id)) return;
    const t = allTeachersFlat.find((x) => x.id === id);
    if (!t) return;
    setAssignList((prev) => [...prev, { id, name: t.fullName }]);
    setAssignPick("");
  };

  const quitarDocenteAssign = (id: number) => {
    setAssignList((prev) => prev.filter((d) => d.id !== id));
  };

  const guardarAssign = async () => {
    if (!assignProjectId) return;
    try {
      setAssignSaving(true);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${assignProjectId}/docentes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docentes: assignList.map((d) => ({ id: d.id })),
        }),
      });
      if (!res.ok) {
        notify.error("No se pudo guardar la asignación.");
        return;
      }
      setAssignOpen(false);
      await loadProjects();
      notify.success("Asignación guardada");
    } catch {
      notify.error("Error de conexión.");
    } finally {
      setAssignSaving(false);
    }
  };

  const detalleProyecto = useMemo(
    () => weeklyProjects.find((p) => p.id === expandedId),
    [weeklyProjects, expandedId]
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          disabled={loadingCatalog}
          className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm shadow-sm disabled:opacity-50"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> Nueva iniciativa
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loadingList && <p className="p-4 text-sm text-gray-400">Cargando proyectos…</p>}
        {!loadingList && projects.length === 0 && (
          <p className="p-6 text-center text-gray-400 text-sm">No hay proyectos registrados.</p>
        )}
        {!loadingList && projects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-10" />
                  <th className="text-left px-4 py-3">Título</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">Docente responsable</th>
                  <th className="text-left px-4 py-3">Programa</th>
                  <th className="text-left px-4 py-3">Semanas</th>
                  <th className="text-left px-4 py-3">Horas</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projects.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-gray-500 hover:text-[#1d4ed8] text-xs"
                          onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        >
                          {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          <span className="sr-only sm:not-sr-only">Detalle</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-800" style={{ fontWeight: 600 }}>
                        {p.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.type} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            p.status === "active" ? "active" : p.status === "inactive" ? "inactive" : "delayed"
                          }
                          label={
                            p.status === "active"
                              ? "En ejecución"
                              : p.status === "inactive"
                              ? "Finalizado"
                              : "Suspendido"
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.coordinator}</td>
                      <td className="px-4 py-3 text-gray-600">{p.program}</td>
                      <td className="px-4 py-3 text-gray-600">{p.weeks ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{p.totalHours != null ? p.totalHours : "—"}</td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-blue-700 hover:text-blue-900 inline-flex"
                          onClick={() => openEdit(p)}
                          aria-label={`Editar ${p.name}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-[#1d4ed8] hover:underline text-xs font-medium"
                          onClick={() => void openAssign(p.id)}
                        >
                          Asignar docentes
                        </button>
                        <button
                          type="button"
                          disabled={deletingProjectId === p.id}
                          className="text-gray-400 hover:text-red-600 inline-flex disabled:opacity-40"
                          onClick={() => void deleteProject(p)}
                          aria-label={`Eliminar ${p.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr key={`${p.id}-detail`} className="bg-gray-50/80">
                      <td colSpan={9} className="px-4 py-4">
                        {!detalleProyecto && (
                          <p className="text-sm text-gray-500">No hay semanas registradas para este proyecto.</p>
                        )}
                        {detalleProyecto && (
                          <div className="space-y-4 text-left max-w-4xl">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Cronograma: {detalleProyecto.name}
                            </p>
                            {detalleProyecto.weeks.map((w) => (
                              <div key={w.id ?? w.numero} className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
                                <p className="text-sm font-semibold text-gray-800">
                                  Semana {w.numero}{" "}
                                  <span className="font-normal text-gray-500 text-xs">
                                    ({String(w.fechaInicio).slice(0, 10)} – {String(w.fechaFin).slice(0, 10)})
                                  </span>
                                </p>
                                <ul className="mt-2 space-y-2">
                                  {(w.entregables || []).length === 0 && (
                                    <li className="text-xs text-gray-400">Sin entregables</li>
                                  )}
                                  {(w.entregables || []).map((e, idx) => (
                                    <li
                                      key={e.id ?? idx}
                                      className="flex flex-wrap items-center gap-3 text-xs text-gray-700 border-b border-gray-50 pb-2 last:border-0"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={Boolean(e.completado)}
                                        readOnly
                                        className="rounded border-gray-300"
                                      />
                                      <span className="flex-1 min-w-[120px]">{e.texto || "—"}</span>
                                      <span className="text-gray-500">{e.horas != null ? `${e.horas} h` : "—"}</span>
                                      {e.url_evidencia ? (
                                        <a
                                          href={e.url_evidencia}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-[#1d4ed8]"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Total: {total} · Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((x) => x + 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800" style={{ fontWeight: 700 }}>
                {editingProject ? "Editar iniciativa" : "Nueva iniciativa"}
              </h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Título *</label>
                <input
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Tipo *</label>
                <AppSelect
                  className="mt-1 w-full"
                  value={tipoVisual}
                  onValueChange={(v) => setTipoVisual(v as "project" | "agreement" | "activity")}
                  options={[
                    { value: "project", label: "Proyecto" },
                    { value: "agreement", label: "Convenio" },
                    { value: "activity", label: "Actividad" },
                  ]}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Estado *</label>
                <AppSelect
                  className="mt-1 w-full"
                  value={projectState}
                  onValueChange={(value) =>
                    setProjectState(value as "en_ejecucion" | "finalizado" | "suspendido")
                  }
                  options={[
                    { value: "en_ejecucion", label: "En ejecución" },
                    { value: "finalizado", label: "Finalizado" },
                    { value: "suspendido", label: "Suspendido" },
                  ]}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Descripción</label>
                <textarea
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Escuela</label>
                <AppSelect
                  className="mt-1 w-full"
                  value={escuelaName}
                  onValueChange={(v) => {
                    setEscuelaName(v);
                    setProgramaId("");
                    setDocenteId("");
                  }}
                  placeholder="Seleccione…"
                  options={schools.map((s) => ({ value: s.name, label: s.name }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Programa *</label>
                <AppSelect
                  className="mt-1 w-full"
                  value={programaId === "" ? "" : String(programaId)}
                  onValueChange={(v) => {
                    setProgramaId(v === "" ? "" : Number(v));
                    setDocenteId("");
                  }}
                  placeholder="Seleccione…"
                  disabled={!escuelaName}
                  options={programasDeEscuela.map((pr) => ({
                    value: String(pr.id),
                    label: pr.name,
                  }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Docente responsable *</label>
                <AppSelect
                  className="mt-1 w-full"
                  value={docenteId === "" ? "" : String(docenteId)}
                  onValueChange={(v) => setDocenteId(v === "" ? "" : Number(v))}
                  placeholder="Seleccione…"
                  disabled={programaId === ""}
                  options={docentesDePrograma.map((d) => ({
                    value: String(d.id),
                    label: d.fullName,
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Fecha inicio *</label>
                  <input
                    type="date"
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={fechaInicio}
                    onChange={(e) => {
                      setFechaInicio(e.target.value);
                      regenerateWeeks(numSemanas, e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Fecha fin estimada</label>
                  <input
                    type="date"
                    min={fechaInicio || undefined}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Horas totales</label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={horasTotales}
                    onChange={(e) => setHorasTotales(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Nº semanas (1–53) *</label>
                  <input
                    type="number"
                    min={1}
                    max={53}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={numSemanas}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNumSemanas(v);
                      regenerateWeeks(v, fechaInicio);
                    }}
                  />
                </div>
              </div>
              {weeksDraft.length > 0 && (
                <p className="text-xs text-gray-500">
                  {editingProject
                    ? `El cronograma tendrá ${weeksDraft.length} semana(s). Si cambias su inicio o cantidad, se reconstruirá.`
                    : `Se generarán ${weeksDraft.length} semana(s) en el cronograma al guardar.`}
                </p>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingCreate}
                onClick={() => void guardarCreate()}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
              >
                {savingCreate ? "Guardando…" : editingProject ? "Guardar cambios" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800 font-semibold">Asignar docentes al proyecto</h3>
              <button type="button" onClick={() => setAssignOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {assignLoading && <p className="text-sm text-gray-400">Cargando…</p>}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Docentes asignados</p>
                <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-48 overflow-auto">
                  {assignList.map((d) => (
                    <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{d.name}</span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline text-xs"
                        onClick={() => quitarDocenteAssign(d.id)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                  {assignList.length === 0 && !assignLoading && (
                    <li className="px-3 py-2 text-xs text-gray-400">Ninguno aún</li>
                  )}
                </ul>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600">Agregar docente</label>
                  <AppSelect
                    className="mt-1 w-full"
                    value={assignPick === "" ? "" : String(assignPick)}
                    onValueChange={(v) => setAssignPick(v === "" ? "" : Number(v))}
                    placeholder="Seleccione…"
                    options={allTeachersFlat.map((t) => ({
                      value: String(t.id),
                      label: t.fullName,
                    }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={agregarDocenteAssign}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                >
                  Agregar
                </button>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={assignSaving}
                onClick={() => void guardarAssign()}
                className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                Guardar asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
