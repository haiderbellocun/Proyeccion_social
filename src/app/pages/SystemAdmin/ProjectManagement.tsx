import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import {
  AdmPagina, Barra, Buscar, Campo, Chips, Col, DataTable, ErrorCarga, Filtro, FormInspector, Grupo, Paginador, Tag, Vacio,
  soloFecha, useConfirmar,
} from "../../components/b2/admin-ui";
import { Dl, Estado, type Kind } from "../../components/b2/ui";
import { IExterno, IMas } from "../../components/b2/icons";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import "../../components/b2/b2-admin-proyectos.css";

const API_BASE_URL = API_BASE;

type TipoProyecto = "project" | "agreement" | "activity";
type EstadoProyecto = "active" | "delayed" | "inactive";

const TYPE_LABEL: Record<TipoProyecto, string> = { project: "Proyecto", agreement: "Convenio", activity: "Actividad" };
const STATUS_LABEL: Record<EstadoProyecto, string> = { active: "En ejecución", delayed: "Suspendido", inactive: "Finalizado" };
const STATUS_KIND: Record<EstadoProyecto, Kind> = { active: "encurso", delayed: "borrador", inactive: "aprobado" };

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
  type: TipoProyecto;
  status: EstadoProyecto;
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

type SemestreRango = { codigo: string; fecha_inicio: string; fecha_fin: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Fecha compacta «24 ago 2026» (la de admin-ui añade «de» y no cabe en la columna)
const fechaMini = (v: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : "—";
};

type Modo = { modo: "ver" | "editar" | "asignar"; id: number } | { modo: "crear" };

export default function ProjectManagement({ cabecera }: { cabecera: ReactNode }) {
  const { confirmar, dialogo } = useConfirmar();
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [semestres, setSemestres] = useState<SemestreRango[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [insp, setInsp] = useState<Modo | null>(null);

  const [editingProject, setEditingProject] = useState<ApiProject | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoVisual, setTipoVisual] = useState<TipoProyecto>("project");
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
  const [intentado, setIntentado] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);

  const [assignList, setAssignList] = useState<AssignedDocente[]>([]);
  const [assignPick, setAssignPick] = useState<number | "">("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  // Docentes asociados (solo lectura) del inspector «ver»
  const [docentesVer, setDocentesVer] = useState<{ id: number; lista: AssignedDocente[] | null; error: boolean } | null>(null);

  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"todos" | EstadoProyecto>("todos");
  const [typeFilter, setTypeFilter] = useState<"todos" | TipoProyecto>("todos");

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
      /* silencioso: detalle del cronograma vacío */
    }
  }, []);

  // Solo lectura: rangos de semestre para rotular el semestre según la fecha de inicio
  const loadSemestres = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/semestres`);
      if (!res.ok) return;
      const data = await res.json();
      setSemestres(Array.isArray(data.detalle) ? data.detalle : []);
    } catch {
      /* el semestre derivado queda en «—» */
    }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadWeekly(); }, [loadWeekly]);
  useEffect(() => { void loadSemestres(); }, [loadSemestres]);

  const semestreDe = useCallback((p: ApiProject) => {
    const d = soloFecha(p.startDate);
    if (!d) return "—";
    const s = semestres.find((x) => soloFecha(x.fecha_inicio) <= d && d <= soloFecha(x.fecha_fin));
    return s?.codigo ?? "—";
  }, [semestres]);

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
    setIntentado(false);
    setInsp({ modo: "crear" });
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
    setIntentado(false);
    setInsp({ modo: "editar", id: project.id });
  };

  // Mismas reglas que aplica el envío, expuestas por campo para mostrarlas en línea
  const errores = useMemo(() => {
    const e: Record<string, string> = {};
    if (!titulo.trim()) e.titulo = "Escribe el título de la iniciativa.";
    if (programaId === "") e.programa = "Selecciona el programa.";
    if (docenteId === "") e.docente = "Selecciona el docente responsable.";
    if (!fechaInicio) e.inicio = "Indica la fecha inicial.";
    if (!numSemanas) e.semanas = "Indica el número de semanas.";
    else {
      const ns = Number(numSemanas);
      if (ns < 1 || ns > 53) e.semanas = "El número de semanas debe estar entre 1 y 53.";
    }
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) e.fin = "La fecha final no puede ser anterior a la fecha inicial.";
    return e;
  }, [titulo, programaId, docenteId, fechaInicio, numSemanas, fechaFin]);

  const guardarCreate = async () => {
    setIntentado(true);
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
        const accepted = await confirmar({
          titulo: "Reconstruir cronograma",
          descripcion:
            `El cambio eliminará ${summary.total || 0} entregables existentes ` +
            `(${summary.con_avance || 0} con avance). Esta acción no se puede deshacer.`,
          etiqueta: "Reconstruir",
          tono: "aviso",
        });
        if (!accepted) return;
        res = await save(true);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        notify.error(data.error || `No se pudo ${editingProject ? "actualizar" : "crear"} la iniciativa.`);
        return;
      }
      const editadoId = editingProject?.id ?? null;
      setInsp(editadoId != null ? { modo: "ver", id: editadoId } : null);
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
    const accepted = await confirmar({
      titulo: "Eliminar iniciativa",
      descripcion: `¿Deseas eliminar «${project.name}»?`,
      etiqueta: "Eliminar",
      tono: "peligro",
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
        const forceAccepted = await confirmar({
          titulo: "Eliminar iniciativa y reportes",
          descripcion:
            `La iniciativa tiene ${summary.reportes || 0} reportes o evidencias, ` +
            `${summary.entregables || 0} entregables y ${summary.semanas || 0} semanas. ` +
            "La eliminación será permanente.",
          etiqueta: "Eliminar todo",
          tono: "peligro",
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
      setInsp((cur) => (cur && "id" in cur && cur.id === project.id ? null : cur));
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
    setAssignPick("");
    setAssignList([]);
    setInsp({ modo: "asignar", id: projectId });
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
    if (!insp || insp.modo !== "asignar") return;
    const projectId = insp.id;
    try {
      setAssignSaving(true);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${projectId}/docentes`, {
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
      setInsp({ modo: "ver", id: projectId });
      setDocentesVer(null);
      await loadProjects();
      notify.success("Asignación guardada");
    } catch {
      notify.error("Error de conexión.");
    } finally {
      setAssignSaving(false);
    }
  };

  const seleccionadoId = insp && "id" in insp ? insp.id : null;
  const seleccionado = useMemo(() => projects.find((p) => p.id === seleccionadoId) ?? null, [projects, seleccionadoId]);
  const detalleProyecto = useMemo(() => weeklyProjects.find((p) => p.id === seleccionadoId), [weeklyProjects, seleccionadoId]);

  // Carga diferida de los docentes asociados al abrir el detalle (solo lectura)
  const verId = insp?.modo === "ver" ? insp.id : null;
  useEffect(() => {
    if (verId == null) return;
    let cancel = false;
    setDocentesVer({ id: verId, lista: null, error: false });
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/proyectos/${verId}/docentes`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const lista: AssignedDocente[] = (data.docentes || []).map((d: { id: number; name: string; email?: string; program?: string }) => ({
          id: d.id, name: d.name, email: d.email, programa: d.program,
        }));
        if (!cancel) setDocentesVer({ id: verId, lista, error: false });
      } catch {
        if (!cancel) setDocentesVer({ id: verId, lista: null, error: true });
      }
    })();
    return () => { cancel = true; };
  }, [verId]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  void totalPages;

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (stateFilter !== "todos" && p.status !== stateFilter) return false;
      if (typeFilter !== "todos" && p.type !== typeFilter) return false;
      if (!q) return true;
      return [p.name, p.coordinator, p.program].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [projects, query, stateFilter, typeFilter]);

  const stateCounts = useMemo(
    () => ({
      todos: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      delayed: projects.filter((p) => p.status === "delayed").length,
      inactive: projects.filter((p) => p.status === "inactive").length,
    }),
    [projects]
  );
  const hayFiltros = query.trim() !== "" || stateFilter !== "todos" || typeFilter !== "todos";
  const limpiar = () => { setQuery(""); setStateFilter("todos"); setTypeFilter("todos"); };

  const cols: Col<ApiProject>[] = [
    {
      id: "nombre", titulo: "Iniciativa", ancho: "minmax(220px, 1fr)", prioridad: 1,
      celda: (p) => (<><span className="b2-tt" title={p.name} style={{ fontWeight: 700 }}>{p.name}</span><span className="b2-sub" title={p.program}>{p.program}</span></>),
    },
    { id: "estado", titulo: "Estado", ancho: "120px", prioridad: 1, celda: (p) => <Estado kind={STATUS_KIND[p.status]} label={STATUS_LABEL[p.status]} /> },
    { id: "tipo", titulo: "Tipo", ancho: "92px", prioridad: 2, celda: (p) => <Tag tono="primario">{TYPE_LABEL[p.type]}</Tag> },
    { id: "resp", titulo: "Responsable", ancho: "minmax(120px, 190px)", prioridad: 2, celda: (p) => <span title={p.coordinator}>{p.coordinator}</span> },
    { id: "fechas", titulo: "Inicio – Fin", ancho: "190px", prioridad: 2, celda: (p) => <span className="b2-fch">{fechaMini(p.startDate)} – {fechaMini(p.endDate)}</span> },
    { id: "horas", titulo: "Horas", ancho: "56px", prioridad: 3, num: true, celda: (p) => (p.totalHours != null ? p.totalHours : "—") },
    { id: "semanas", titulo: "Semanas", ancho: "66px", prioridad: 3, num: true, celda: (p) => p.weeks ?? "—" },
    { id: "sem", titulo: "Semestre", ancho: "76px", prioridad: 3, celda: (p) => semestreDe(p) },
  ];

  const accionesFila = (p: ApiProject) => [
    { label: "Editar", onSelect: () => openEdit(p), disabled: loadingCatalog },
    { label: "Asignar docentes", onSelect: () => void openAssign(p.id) },
    "sep" as const,
    { label: "Eliminar", onSelect: () => void deleteProject(p), danger: true, disabled: deletingProjectId === p.id },
  ];

  const filaMovil = (p: ApiProject) => ({
    titulo: p.name,
    lineas: [
      `${TYPE_LABEL[p.type]} · ${p.coordinator}`,
      `${fechaMini(p.startDate)} – ${fechaMini(p.endDate)}${p.totalHours != null ? ` · ${p.totalHours} h` : ""}`,
    ],
    lado: <Estado kind={STATUS_KIND[p.status]} label={STATUS_LABEL[p.status]} />,
  });

  const seleccionar = (p: ApiProject | null) => setInsp(p ? { modo: "ver", id: p.id } : null);

  /* ───────── contenido del inspector ───────── */
  let inspector: ReactNode = null;
  let etiquetaInsp = "ninguno";

  if (insp?.modo === "crear" || insp?.modo === "editar") {
    const editando = insp.modo === "editar";
    etiquetaInsp = editando ? `editar-${insp.modo === "editar" ? insp.id : ""}` : "crear";
    const err = (k: string) => (intentado ? errores[k] : undefined);
    inspector = (
      <FormInspector
        sup={editando ? "Iniciativas · edición" : "Iniciativas"}
        titulo={editando ? "Editar iniciativa" : "Nueva iniciativa"}
        onCerrar={() => setInsp(editando && editingProject ? { modo: "ver", id: editingProject.id } : null)}
        onGuardar={() => void guardarCreate()}
        guardando={savingCreate}
        etiquetaGuardar={editando ? "Guardar cambios" : "Crear iniciativa"}
        errores={intentado ? Object.values(errores) : undefined}
      >
        <Grupo titulo="General">
          <Campo etiqueta="Título" obligatorio error={err("titulo")} ancho="completo">
            {(p) => <input {...p} className="b2-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Tipo" obligatorio>
            {(p) => (
              <select {...p} className="b2-sel" value={tipoVisual} onChange={(e) => setTipoVisual(e.target.value as TipoProyecto)}>
                <option value="project">Proyecto</option>
                <option value="agreement">Convenio</option>
                <option value="activity">Actividad</option>
              </select>
            )}
          </Campo>
          <Campo etiqueta="Estado" obligatorio>
            {(p) => (
              <select {...p} className="b2-sel" value={projectState} onChange={(e) => setProjectState(e.target.value as typeof projectState)}>
                <option value="en_ejecucion">En ejecución</option>
                <option value="finalizado">Finalizado</option>
                <option value="suspendido">Suspendido</option>
              </select>
            )}
          </Campo>
          <Campo etiqueta="Descripción" ancho="completo">
            {(p) => <textarea {...p} className="b2-input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
          </Campo>
        </Grupo>
        <Grupo titulo="Responsable">
          <Campo etiqueta="Escuela">
            {(p) => (
              <select
                {...p}
                className="b2-sel"
                value={escuelaName}
                onChange={(e) => { setEscuelaName(e.target.value); setProgramaId(""); setDocenteId(""); }}
              >
                <option value="">Seleccione…</option>
                {schools.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Programa" obligatorio error={err("programa")}>
            {(p) => (
              <select
                {...p}
                className="b2-sel"
                value={programaId === "" ? "" : String(programaId)}
                disabled={!escuelaName}
                onChange={(e) => { setProgramaId(e.target.value === "" ? "" : Number(e.target.value)); setDocenteId(""); }}
              >
                <option value="">Seleccione…</option>
                {programasDeEscuela.map((pr) => <option key={pr.id} value={String(pr.id)}>{pr.name}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Docente responsable" obligatorio error={err("docente")} ancho="completo">
            {(p) => (
              <select
                {...p}
                className="b2-sel"
                value={docenteId === "" ? "" : String(docenteId)}
                disabled={programaId === ""}
                onChange={(e) => setDocenteId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Seleccione…</option>
                {docentesDePrograma.map((d) => <option key={d.id} value={String(d.id)}>{d.fullName}</option>)}
              </select>
            )}
          </Campo>
        </Grupo>
        <Grupo titulo="Fechas y dedicación">
          <Campo etiqueta="Fecha inicio" obligatorio error={err("inicio")}>
            {(p) => (
              <input
                {...p}
                type="date"
                className="b2-input"
                value={fechaInicio}
                onChange={(e) => { setFechaInicio(e.target.value); regenerateWeeks(numSemanas, e.target.value); }}
              />
            )}
          </Campo>
          <Campo etiqueta="Fecha fin estimada" error={err("fin")}>
            {(p) => <input {...p} type="date" min={fechaInicio || undefined} className="b2-input" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Horas totales">
            {(p) => <input {...p} type="number" min={0} className="b2-input" value={horasTotales} onChange={(e) => setHorasTotales(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Nº semanas (1–53)" obligatorio error={err("semanas")}>
            {(p) => (
              <input
                {...p}
                type="number"
                min={1}
                max={53}
                className="b2-input"
                value={numSemanas}
                onChange={(e) => { setNumSemanas(e.target.value); regenerateWeeks(e.target.value, fechaInicio); }}
              />
            )}
          </Campo>
        </Grupo>
        {weeksDraft.length > 0 && (
          <p className="b2-nota-aviso" data-t="ok">
            {editando
              ? `El cronograma tendrá ${weeksDraft.length} semana(s). Si cambias su inicio o cantidad, se reconstruirá.`
              : `Se generarán ${weeksDraft.length} semana(s) en el cronograma al guardar.`}
          </p>
        )}
      </FormInspector>
    );
  } else if (insp?.modo === "asignar" && seleccionado) {
    etiquetaInsp = `asignar-${seleccionado.id}`;
    const candidatos = allTeachersFlat.filter((t) => !assignList.some((d) => d.id === t.id));
    inspector = (
      <FormInspector
        sup={`Iniciativas · ${seleccionado.name}`}
        titulo="Asignar docentes"
        onCerrar={() => setInsp({ modo: "ver", id: seleccionado.id })}
        onGuardar={() => void guardarAssign()}
        guardando={assignSaving}
        etiquetaGuardar="Guardar asignación"
      >
        <p className="b2-insp-p">Los docentes asignados ven esta iniciativa en sus proyectos.</p>
        <div>
          <h3 className="b2-insp-sub" style={{ marginTop: 0 }}>Docentes asignados ({assignList.length})</h3>
          <ul className="b2-adm-lista" aria-label="Docentes asignados">
            {assignLoading && <li role="status">Cargando…</li>}
            {assignList.map((d) => (
              <li key={d.id}>
                <span><span className="b2-tt">{d.name}</span>{d.programa && <span className="b2-sub">{d.programa}</span>}</span>
                <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost b2-link-peligro" onClick={() => quitarDocenteAssign(d.id)} aria-label={`Quitar a ${d.name}`}>Quitar</button>
              </li>
            ))}
            {assignList.length === 0 && !assignLoading && <li className="b2-muted">Ninguno aún</li>}
          </ul>
        </div>
        <div className="b2-adm-agregar">
          <Campo etiqueta="Agregar docente">
            {(p) => (
              <select {...p} className="b2-sel" value={assignPick === "" ? "" : String(assignPick)} onChange={(e) => setAssignPick(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Seleccione…</option>
                {candidatos.map((t) => <option key={t.id} value={String(t.id)}>{t.fullName}</option>)}
              </select>
            )}
          </Campo>
          <button type="button" className="b2-btn" onClick={agregarDocenteAssign} disabled={assignPick === ""}><IMas width={14} height={14} />Agregar</button>
        </div>
      </FormInspector>
    );
  } else if (insp?.modo === "ver" && seleccionado) {
    etiquetaInsp = `ver-${seleccionado.id}`;
    const dv = docentesVer && docentesVer.id === seleccionado.id ? docentesVer : null;
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">{TYPE_LABEL[seleccionado.type]} · {seleccionado.program}</p>
        <h2 className="b2-insp-h">{seleccionado.name}</h2>
        <div className="b2-insp-estado"><Estado kind={STATUS_KIND[seleccionado.status]} label={STATUS_LABEL[seleccionado.status]} /></div>
        {seleccionado.description && <p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{seleccionado.description}</p>}
        <h3 className="b2-insp-sub">Datos</h3>
        <Dl rows={[
          ["Tipo", TYPE_LABEL[seleccionado.type]],
          ["Responsable", seleccionado.coordinator],
          ["Escuela", seleccionado.school || "—"],
          ["Programa", seleccionado.program],
          ["Inicio", fechaMini(seleccionado.startDate)],
          ["Fin estimado", fechaMini(seleccionado.endDate)],
          ["Horas", seleccionado.totalHours != null ? `${seleccionado.totalHours} h` : "—"],
          ["Semanas", seleccionado.weeks != null ? String(seleccionado.weeks) : "—"],
          ["Semestre", semestreDe(seleccionado)],
        ]} />
        <p className="b2-adm-proyectos-nota">Semestre (según fecha de inicio): se deduce del calendario; no es un dato guardado en la iniciativa.</p>

        <h3 className="b2-insp-sub">Docentes asociados</h3>
        <div className="b2-adm-proyectos-docs" aria-live="polite">
          {!dv || (dv.lista === null && !dv.error) ? <p className="b2-sub" role="status">Cargando…</p> : null}
          {dv?.error && <p className="b2-txt-danger" role="alert">No se pudieron cargar los docentes asociados.</p>}
          {dv?.lista && dv.lista.length === 0 && <p className="b2-muted">Ningún docente asignado todavía.</p>}
          {dv?.lista && dv.lista.length > 0 && (
            <ul className="b2-adm-lista" aria-label="Docentes asociados">
              {dv.lista.map((d) => (<li key={d.id}><span><span className="b2-tt">{d.name}</span>{(d.programa || d.email) && <span className="b2-sub">{d.programa || d.email}</span>}</span></li>))}
            </ul>
          )}
        </div>

        <h3 className="b2-insp-sub">Cronograma semanal</h3>
        {!detalleProyecto || detalleProyecto.weeks.length === 0 ? (
          <p className="b2-muted">No hay semanas registradas para esta iniciativa.</p>
        ) : (
          <details className="b2-adm-proyectos-cron">
            <summary>Ver {detalleProyecto.weeks.length} semana(s)</summary>
            <ol className="b2-adm-proyectos-sem">
              {detalleProyecto.weeks.map((w) => (
                <li key={w.id ?? w.numero}>
                  <div className="b2-adm-proyectos-sem-t"><span>Semana {w.numero}</span><small>{fechaMini(w.fechaInicio)} – {fechaMini(w.fechaFin)}</small></div>
                  <ul className="b2-adm-proyectos-ent">
                    {(w.entregables || []).length === 0 && <li className="b2-muted">Sin entregables</li>}
                    {(w.entregables || []).map((e, idx) => (
                      <li key={e.id ?? idx} data-hecho={e.completado || undefined}>
                        <span className="b2-adm-proyectos-chk" role="img" aria-label={e.completado ? "Completado" : "Pendiente"}>{e.completado ? "✓" : "○"}</span>
                        <span>{e.texto || "—"}</span>
                        <span className="b2-adm-proyectos-h">{e.horas != null ? `${e.horas} h` : "—"}</span>
                        {e.url_evidencia ? <a href={e.url_evidencia} target="_blank" rel="noreferrer" aria-label="Abrir evidencia"><IExterno width={14} height={14} /></a> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </details>
        )}

        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEdit(seleccionado)} disabled={loadingCatalog}>Editar</button>
          <button type="button" className="b2-btn" onClick={() => void openAssign(seleccionado.id)}>Asignar docentes</button>
          <button type="button" className="b2-btn b2-link-peligro" disabled={deletingProjectId === seleccionado.id} onClick={() => void deleteProject(seleccionado)}>Eliminar</button>
        </div>
      </div>
    );
  }

  const inspectorAbierto = insp != null && (insp.modo === "crear" || seleccionado != null);
  const cerrarInsp = () => setInsp(null);

  const vacio = (
    hayFiltros ? (
      <Vacio titulo="Ninguna iniciativa de esta página coincide" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button>}>
        Prueba con otro término o quita algún filtro. La búsqueda se aplica solo a la página actual.
      </Vacio>
    ) : (
      <Vacio titulo="Aún no hay iniciativas" accion={<button type="button" className="b2-btn b2-btn-primary b2-btn-sm" onClick={openCreate} disabled={loadingCatalog}>Nueva iniciativa</button>}>
        Crea la primera iniciativa para generar su cronograma semanal.
      </Vacio>
    )
  );

  return (
    <>
      <AdmPagina
        tab="proyectos"
        cabecera={cabecera}
        titulo="Iniciativas"
        subtitulo={`${total} registradas · búsqueda y filtros se aplican a la página actual`}
        acciones={<button type="button" className="b2-btn b2-btn-primary" onClick={openCreate} disabled={loadingCatalog}>Nueva iniciativa</button>}
        inspector={inspector}
        inspectorAbierto={inspectorAbierto}
        inspectorEtiqueta={etiquetaInsp}
        onCerrarInspector={cerrarInsp}
        ancho
      >
        <Chips
          value={stateFilter}
          onChange={setStateFilter}
          etiqueta="Filtrar por estado"
          items={[
            { id: "todos", label: "Todas", n: stateCounts.todos },
            { id: "active", label: "En ejecución", n: stateCounts.active },
            { id: "delayed", label: "Suspendidas", n: stateCounts.delayed },
            { id: "inactive", label: "Finalizadas", n: stateCounts.inactive },
          ]}
        />
        <Barra contador={visibleProjects.length === projects.length ? `${projects.length} en esta página` : `${visibleProjects.length} de ${projects.length} en esta página`}>
          <Buscar value={query} onChange={setQuery} placeholder="Buscar iniciativa o responsable" etiqueta="Buscar iniciativa" />
          <Filtro value={typeFilter} onChange={(v) => setTypeFilter(v as typeof typeFilter)} etiqueta="Filtrar por tipo" ancho={170}>
            <option value="todos">Todos los tipos</option>
            <option value="project">Proyectos</option>
            <option value="agreement">Convenios</option>
            <option value="activity">Actividades</option>
          </Filtro>
          {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar</button>}
        </Barra>
        {loadError && !loadingList && (
          <ErrorCarga onReintentar={() => void loadProjects()}>No se pudo cargar la lista de iniciativas.</ErrorCarga>
        )}
        {!loadError && (
          <DataTable
            etiqueta="Iniciativas"
            cols={cols}
            rows={visibleProjects}
            getKey={(p) => p.id}
            selId={seleccionadoId}
            onSelect={seleccionar}
            cargando={loadingList}
            vacio={vacio}
            filaMovil={filaMovil}
            acciones={accionesFila}
          />
        )}
        <Paginador pagina={page} total={total} limite={limit} onPagina={(n) => { setPage(n); setInsp(null); }} etiqueta="iniciativas" />
      </AdmPagina>
      {dialogo}
    </>
  );
}
