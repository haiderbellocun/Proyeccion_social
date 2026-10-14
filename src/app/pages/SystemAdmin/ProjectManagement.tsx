import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { ChevronDown, ChevronUp, Edit2, ExternalLink, FolderKanban, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, InlineAlert, PageLoading, Panel, Segmented, StatusPill, type Tone } from "../../components/ds/primitives";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

const API_BASE_URL = API_BASE;

const TYPE_LABEL = { project: "Proyecto", agreement: "Convenio", activity: "Actividad" } as const;
const TYPE_TONE: Record<"project" | "agreement" | "activity", Tone> = { project: "violet", agreement: "warning", activity: "signal" };
const STATUS_LABEL = { active: "En ejecución", delayed: "Suspendido", inactive: "Finalizado" } as const;
const STATUS_TONE: Record<"active" | "delayed" | "inactive", Tone> = { active: "success", delayed: "warning", inactive: "neutral" };

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
      setLoadError(false);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rows = data.proyectos || data.data || [];
      setProjects(rows);
      setTotal(Number(data.pagination?.total ?? rows.length));
    } catch {
      setLoadError(true);
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

  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"todos" | "active" | "delayed" | "inactive">("todos");
  const [loadError, setLoadError] = useState(false);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (stateFilter !== "todos" && p.status !== stateFilter) return false;
      if (!q) return true;
      return [p.name, p.coordinator, p.program].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [projects, query, stateFilter]);

  const stateCounts = useMemo(
    () => ({
      todos: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      delayed: projects.filter((p) => p.status === "delayed").length,
      inactive: projects.filter((p) => p.status === "inactive").length,
    }),
    [projects]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              type="search"
              aria-label="Buscar iniciativa"
              placeholder="Buscar iniciativa…"
              className="ds-input pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented
            label="Filtrar por estado"
            value={stateFilter}
            onChange={setStateFilter}
            items={[
              { id: "todos", label: "Todas", count: stateCounts.todos },
              { id: "active", label: "En ejecución", count: stateCounts.active, tone: "success" },
              { id: "delayed", label: "Suspendidas", count: stateCounts.delayed, tone: "warning" },
              { id: "inactive", label: "Finalizadas", count: stateCounts.inactive, tone: "neutral" },
            ]}
          />
        </div>
        <button type="button" onClick={openCreate} disabled={loadingCatalog} className="ds-btn ds-btn-primary">
          <Plus className="h-4 w-4" aria-hidden /> Nueva iniciativa
        </button>
      </div>

      <Panel
        bodyClassName=""
        title="Iniciativas"
        description={`${total} registradas · filtros aplicados a la página actual`}
      >
        {loadingList && <PageLoading label="Cargando iniciativas…" />}
        {!loadingList && loadError && (
          <div className="p-4">
            <InlineAlert
              action={
                <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadProjects()}>
                  Reintentar
                </button>
              }
            >
              No se pudo cargar la lista de iniciativas.
            </InlineAlert>
          </div>
        )}
        {!loadingList && !loadError && projects.length === 0 && (
          <EmptyState
            icon={FolderKanban}
            title="Aún no hay iniciativas"
            action={
              <button type="button" onClick={openCreate} disabled={loadingCatalog} className="ds-btn ds-btn-primary ds-btn-sm">
                <Plus className="h-4 w-4" aria-hidden /> Nueva iniciativa
              </button>
            }
          >
            Crea la primera iniciativa para generar su cronograma semanal.
          </EmptyState>
        )}
        {!loadingList && !loadError && projects.length > 0 && visibleProjects.length === 0 && (
          <EmptyState icon={Search} title="Sin resultados">
            Ninguna iniciativa de esta página coincide con la búsqueda o el filtro.
          </EmptyState>
        )}
        {!loadingList && !loadError && visibleProjects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <span className="sr-only">Detalle</span>
                  </th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="hidden md:table-cell">Docente responsable</th>
                  <th className="hidden min-[1600px]:table-cell">Programa</th>
                  <th className="hidden sm:table-cell text-right">Semanas</th>
                  <th className="hidden sm:table-cell text-right">Horas</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((p) => {
                  const open = expandedId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="ds-btn ds-btn-ghost ds-btn-sm !min-h-7 !px-1.5"
                            aria-expanded={open}
                            aria-label={`${open ? "Ocultar" : "Ver"} cronograma de ${p.name}`}
                            onClick={() => setExpandedId(open ? null : p.id)}
                          >
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="max-w-[20rem]">
                          <span className="block truncate text-text" style={{ fontWeight: 600 }} title={p.name}>
                            {p.name}
                          </span>
                        </td>
                        <td>
                          <StatusPill tone={TYPE_TONE[p.type]} dot={false}>
                            {TYPE_LABEL[p.type]}
                          </StatusPill>
                        </td>
                        <td>
                          <StatusPill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</StatusPill>
                        </td>
                        <td className="hidden text-text-muted md:table-cell">{p.coordinator}</td>
                        <td className="hidden max-w-[14rem] truncate text-text-muted min-[1600px]:table-cell" title={p.program}>{p.program}</td>
                        <td className="hidden text-right text-text-muted sm:table-cell">{p.weeks ?? "—"}</td>
                        <td className="hidden text-right text-text-muted sm:table-cell">{p.totalHours != null ? p.totalHours : "—"}</td>
                        <td className="whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              className="ds-btn ds-btn-ghost ds-btn-sm"
                              onClick={() => void openAssign(p.id)}
                              aria-label={`Asignar docentes a ${p.name}`}
                            >
                              <UserPlus className="h-4 w-4" aria-hidden />
                              <span className="hidden min-[1600px]:inline">Asignar docentes</span>
                            </button>
                            <button
                              type="button"
                              className="ds-btn ds-btn-ghost ds-btn-sm !px-2"
                              onClick={() => openEdit(p)}
                              aria-label={`Editar ${p.name}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingProjectId === p.id}
                              className="ds-btn ds-btn-ghost ds-btn-sm !px-2 hover:!bg-red-50 hover:!text-red-700"
                              onClick={() => void deleteProject(p)}
                              aria-label={`Eliminar ${p.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr key={`${p.id}-detail`}>
                          <td colSpan={9} className="!bg-surface-2">
                            {!detalleProyecto && <p className="text-sm text-text-muted">No hay semanas registradas para esta iniciativa.</p>}
                            {detalleProyecto && (
                              <div className="space-y-3 text-left">
                                <p className="text-xs text-text-subtle" style={{ fontWeight: 600 }}>
                                  Cronograma · {detalleProyecto.name}
                                </p>
                                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                  {detalleProyecto.weeks.map((w) => (
                                    <div key={w.id ?? w.numero} className="rounded-lg border border-line bg-surface p-3">
                                      <p className="text-[0.8125rem] text-text" style={{ fontWeight: 600 }}>
                                        Semana {w.numero}{" "}
                                        <span className="text-xs text-text-subtle" style={{ fontWeight: 400 }}>
                                          {String(w.fechaInicio).slice(0, 10)} – {String(w.fechaFin).slice(0, 10)}
                                        </span>
                                      </p>
                                      <ul className="mt-2 space-y-1.5">
                                        {(w.entregables || []).length === 0 && <li className="text-xs text-text-subtle">Sin entregables</li>}
                                        {(w.entregables || []).map((e, idx) => (
                                          <li key={e.id ?? idx} className="flex items-center gap-2 text-xs text-text-muted">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(e.completado)}
                                              readOnly
                                              tabIndex={-1}
                                              aria-label={e.completado ? "Completado" : "Pendiente"}
                                              className="rounded border-line-strong"
                                            />
                                            <span className="min-w-0 flex-1">{e.texto || "—"}</span>
                                            <span className="tabular-nums text-text-subtle">{e.horas != null ? `${e.horas} h` : "—"}</span>
                                            {e.url_evidencia ? (
                                              <a
                                                href={e.url_evidencia}
                                                target="_blank"
                                                rel="noreferrer"
                                                aria-label="Abrir evidencia"
                                                className="inline-flex text-brand"
                                              >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                              </a>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-text-subtle">
          <span className="tabular-nums">
            Total: {total} · Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))} className="ds-btn ds-btn-secondary ds-btn-sm">
              Anterior
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((x) => x + 1)} className="ds-btn ds-btn-secondary ds-btn-sm">
              Siguiente
            </button>
          </div>
        </div>
      </Panel>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-line px-5 py-4">
            <DialogTitle className="text-base">{editingProject ? "Editar iniciativa" : "Nueva iniciativa"}</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">Los campos con asterisco son obligatorios.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-x-3 gap-y-3.5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pm-titulo" className="ds-label">Título *</label>
              <input id="pm-titulo" className="ds-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <label className="ds-label">Tipo *</label>
              <AppSelect
                className="w-full"
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
              <label className="ds-label">Estado *</label>
              <AppSelect
                className="w-full"
                value={projectState}
                onValueChange={(value) => setProjectState(value as "en_ejecucion" | "finalizado" | "suspendido")}
                options={[
                  { value: "en_ejecucion", label: "En ejecución" },
                  { value: "finalizado", label: "Finalizado" },
                  { value: "suspendido", label: "Suspendido" },
                ]}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pm-desc" className="ds-label">Descripción</label>
              <textarea id="pm-desc" className="ds-input resize-none" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <div>
              <label className="ds-label">Escuela</label>
              <AppSelect
                className="w-full"
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
              <label className="ds-label">Programa *</label>
              <AppSelect
                className="w-full"
                value={programaId === "" ? "" : String(programaId)}
                onValueChange={(v) => {
                  setProgramaId(v === "" ? "" : Number(v));
                  setDocenteId("");
                }}
                placeholder="Seleccione…"
                disabled={!escuelaName}
                options={programasDeEscuela.map((pr) => ({ value: String(pr.id), label: pr.name }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="ds-label">Docente responsable *</label>
              <AppSelect
                className="w-full"
                value={docenteId === "" ? "" : String(docenteId)}
                onValueChange={(v) => setDocenteId(v === "" ? "" : Number(v))}
                placeholder="Seleccione…"
                disabled={programaId === ""}
                options={docentesDePrograma.map((d) => ({ value: String(d.id), label: d.fullName }))}
              />
            </div>
            <div>
              <label htmlFor="pm-inicio" className="ds-label">Fecha inicio *</label>
              <input
                id="pm-inicio"
                type="date"
                className="ds-input"
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  regenerateWeeks(numSemanas, e.target.value);
                }}
              />
            </div>
            <div>
              <label htmlFor="pm-fin" className="ds-label">Fecha fin estimada</label>
              <input id="pm-fin" type="date" min={fechaInicio || undefined} className="ds-input" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pm-horas" className="ds-label">Horas totales</label>
              <input id="pm-horas" type="number" min={0} className="ds-input" value={horasTotales} onChange={(e) => setHorasTotales(e.target.value)} />
            </div>
            <div>
              <label htmlFor="pm-semanas" className="ds-label">Nº semanas (1–53) *</label>
              <input
                id="pm-semanas"
                type="number"
                min={1}
                max={53}
                className="ds-input"
                value={numSemanas}
                onChange={(e) => {
                  const v = e.target.value;
                  setNumSemanas(v);
                  regenerateWeeks(v, fechaInicio);
                }}
              />
            </div>
            {weeksDraft.length > 0 && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-muted sm:col-span-2">
                {editingProject
                  ? `El cronograma tendrá ${weeksDraft.length} semana(s). Si cambias su inicio o cantidad, se reconstruirá.`
                  : `Se generarán ${weeksDraft.length} semana(s) en el cronograma al guardar.`}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowCreate(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={savingCreate} onClick={() => void guardarCreate()} className="ds-btn ds-btn-primary">
              {savingCreate ? "Guardando…" : editingProject ? "Guardar cambios" : "Crear iniciativa"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b border-line px-5 py-4">
            <DialogTitle className="text-base">Asignar docentes</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">Los docentes asignados ven esta iniciativa en sus proyectos.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="ds-label">Docentes asignados ({assignList.length})</p>
              <ul className="max-h-48 divide-y divide-line overflow-auto rounded-lg border border-line">
                {assignLoading && (
                  <li className="px-3 py-2.5">
                    <PageLoading label="Cargando…" />
                  </li>
                )}
                {assignList.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{d.name}</span>
                    <button type="button" className="ds-btn ds-btn-ghost ds-btn-sm hover:!text-red-700" onClick={() => quitarDocenteAssign(d.id)} aria-label={`Quitar a ${d.name}`}>
                      <X className="h-4 w-4" aria-hidden /> Quitar
                    </button>
                  </li>
                ))}
                {assignList.length === 0 && !assignLoading && <li className="px-3 py-2.5 text-xs text-text-subtle">Ninguno aún</li>}
              </ul>
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="ds-label">Agregar docente</label>
                <AppSelect
                  className="w-full"
                  value={assignPick === "" ? "" : String(assignPick)}
                  onValueChange={(v) => setAssignPick(v === "" ? "" : Number(v))}
                  placeholder="Seleccione…"
                  options={allTeachersFlat.map((t) => ({ value: String(t.id), label: t.fullName }))}
                />
              </div>
              <button type="button" onClick={agregarDocenteAssign} className="ds-btn ds-btn-secondary">
                <Plus className="h-4 w-4" aria-hidden /> Agregar
              </button>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-line px-5 py-3">
            <button type="button" onClick={() => setAssignOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={assignSaving} onClick={() => void guardarAssign()} className="ds-btn ds-btn-primary">
              {assignSaving ? "Guardando…" : "Guardar asignación"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
