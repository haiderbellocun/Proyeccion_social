import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Plus, X } from "lucide-react";
import { Badge } from "../../components/Badge";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;

type CatalogTeacher = { id: number; fullName: string; email?: string };
type CatalogProgram = { id: number; name: string; code?: string; teachers: CatalogTeacher[] };
type CatalogSchool = { name: string; programs: CatalogProgram[] };

type ApiProject = {
  id: number;
  name: string;
  coordinatorId?: number | null;
  coordinator: string;
  program: string;
  type: "project" | "agreement" | "activity";
  status: "active" | "delayed" | "inactive";
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
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoVisual, setTipoVisual] = useState<"project" | "agreement" | "activity">("project");
  const [escuelaName, setEscuelaName] = useState("");
  const [programaId, setProgramaId] = useState<number | "">("");
  const [docenteId, setDocenteId] = useState<number | "">("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horasTotales, setHorasTotales] = useState("");
  const [numSemanas, setNumSemanas] = useState("");
  const [weeksDraft, setWeeksDraft] = useState<WeekDetail[]>([]);
  const [savingCreate, setSavingCreate] = useState(false);

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
      setErr("No se pudo cargar el catálogo (escuelas/programas/docentes).");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      setLoadingList(true);
      setErr(null);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rows = data.proyectos || data.data || [];
      setProjects(rows);
      setTotal(Number(data.pagination?.total ?? rows.length));
    } catch {
      setErr("No se pudo cargar la lista de proyectos.");
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
    const n = Math.min(16, Math.max(1, Number(nStr) || 0));
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
    setTitulo("");
    setDescripcion("");
    setTipoVisual("project");
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

  const guardarCreate = async () => {
    if (!titulo.trim() || !programaNombreSeleccionado || !docenteId) {
      alert("Complete título, programa y docente responsable.");
      return;
    }
    const ns = Number(numSemanas);
    if (numSemanas && (ns < 1 || ns > 16)) {
      alert("Número de semanas debe estar entre 1 y 16.");
      return;
    }
    try {
      setSavingCreate(true);
      const res = await fetch(`${API_BASE_URL}/admin/proyectos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          programaNombre: programaNombreSeleccionado,
          docenteId,
          tipoVisual,
          horasTotales: horasTotales ? Number(horasTotales) : undefined,
          semanas: numSemanas ? Number(numSemanas) : undefined,
          fechaInicio: fechaInicio || undefined,
          fechaFin: fechaFin || undefined,
          semanasDetalle: weeksDraft.length ? weeksDraft : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "No se pudo crear el proyecto.");
        return;
      }
      setShowCreate(false);
      await loadProjects();
      await loadWeekly();
    } catch {
      alert("Error de conexión.");
    } finally {
      setSavingCreate(false);
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
        alert("No se pudo guardar la asignación.");
        return;
      }
      setAssignOpen(false);
      await loadProjects();
    } catch {
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
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{err}</div>
      )}

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
                              ? "Completado"
                              : "Otros estados"
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
                          className="text-[#1d4ed8] hover:underline text-xs font-medium"
                          onClick={() => void openAssign(p.id)}
                        >
                          Asignar docentes
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
                Nueva iniciativa
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
                <select
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={tipoVisual}
                  onChange={(e) => setTipoVisual(e.target.value as "project" | "agreement" | "activity")}
                >
                  <option value="project">Proyecto</option>
                  <option value="agreement">Convenio</option>
                  <option value="activity">Actividad</option>
                </select>
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
                <select
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={escuelaName}
                  onChange={(e) => {
                    setEscuelaName(e.target.value);
                    setProgramaId("");
                    setDocenteId("");
                  }}
                >
                  <option value="">Seleccione…</option>
                  {schools.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Programa *</label>
                <select
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={programaId === "" ? "" : programaId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProgramaId(v === "" ? "" : Number(v));
                    setDocenteId("");
                  }}
                  disabled={!escuelaName}
                >
                  <option value="">Seleccione…</option>
                  {programasDeEscuela.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Docente responsable *</label>
                <select
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  value={docenteId === "" ? "" : docenteId}
                  onChange={(e) => setDocenteId(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={programaId === ""}
                >
                  <option value="">Seleccione…</option>
                  {docentesDePrograma.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Fecha inicio</label>
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
                  <label className="text-xs font-semibold text-gray-600">Nº semanas (1–16)</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
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
                  Se generarán {weeksDraft.length} semana(s) en el cronograma al guardar.
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
                {savingCreate ? "Guardando…" : "Crear"}
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
                  <select
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    value={assignPick === "" ? "" : assignPick}
                    onChange={(e) => setAssignPick(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">Seleccione…</option>
                    {allTeachersFlat.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                  </select>
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
