import { useEffect, useState } from "react";
import {
  Users,
  FolderKanban,
  Target,
  Calendar,
  Plus,
  Search,
  Edit2,
  Trash2,
  MoreVertical,
  X,
} from "lucide-react";
import { Badge } from "../components/Badge";

const API_BASE_URL = "http://localhost:4000";

type TabType = "usuarios" | "proyectos" | "indicadores" | "tareas";

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: "usuarios", label: "Usuarios", icon: Users },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "indicadores", label: "Indicadores", icon: Target },
  { id: "tareas", label: "Tareas semanales", icon: Calendar },
];

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  program: string;
  school: string;
  status: "active" | "delayed" | string;
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

type EntregableItem = {
  texto: string;
  horas: number | null;
};

const indicators = [
  { id: 1, name: "Beneficiarios atendidos", unit: "Personas", frequency: "Semanal" },
  { id: 2, name: "Sesiones ejecutadas", unit: "Sesiones", frequency: "Semanal" },
  { id: 3, name: "Horas de capacitación", unit: "Horas", frequency: "Mensual" },
  { id: 4, name: "Material didáctico generado", unit: "Documentos", frequency: "Mensual" },
];

type WeekDetail = {
  id?: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables?: EntregableItem[];
};

type WeeklyProject = {
  id: number;
  name: string;
  weeks: WeekDetail[];
};

export default function SystemAdmin() {
  const [activeTab, setActiveTab] = useState<TabType>("usuarios");
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("Todas");
  const [selectedProgram, setSelectedProgram] = useState<string>("Todos");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"Docente" | "Administrador">("Docente");
  const [newSchool, setNewSchool] = useState<string>("");
  const [newProgram, setNewProgram] = useState<string>("");
  const [savingUser, setSavingUser] = useState(false);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projTitle, setProjTitle] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projProgram, setProjProgram] = useState("");
  const [projTeacherId, setProjTeacherId] = useState<number | "">("");
  const [projType, setProjType] = useState<"project" | "agreement" | "activity">(
    "project"
  );
  const [projHours, setProjHours] = useState<string>("");
  const [projWeeks, setProjWeeks] = useState<string>("");
  const [projStartDate, setProjStartDate] = useState<string>("");
  const [savingProject, setSavingProject] = useState(false);
  const [weeksDetail, setWeeksDetail] = useState<WeekDetail[]>([]);
  const [createWeeklyItems, setCreateWeeklyItems] = useState<
    Record<number, EntregableItem[]>
  >({});
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [selectedWeeklyProjectId, setSelectedWeeklyProjectId] = useState<number | null>(
    null
  );
  const [weeklyItems, setWeeklyItems] = useState<Record<string, EntregableItem[]>>({});
  const [detailStartDate, setDetailStartDate] = useState<string>("");
  const [detailEndDate, setDetailEndDate] = useState<string>("");
  const [detailSaving, setDetailSaving] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<number | "">("");
  const [assignSelectedDocentes, setAssignSelectedDocentes] = useState<number[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [showProjectDetailModal, setShowProjectDetailModal] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<number | null>(null);

  const loadDocentes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/docentes`);
      if (!res.ok) throw new Error("Error al cargar docentes");
      const data = await res.json();
      setUsers(data.docentes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      await loadDocentes();
      try {
        const res = await fetch(`${API_BASE_URL}/admin/proyectos`);
        if (!res.ok) throw new Error("Error al cargar proyectos");
        const data = await res.json();
        const list = (data.proyectos || []) as AdminProject[];
        setProjects(list);

        // Fallback: si ya tenemos semanas y fecha de inicio en proyectos,
        // generamos un cronograma en memoria para usarlo en "Tareas semanales".
        const fallbackWeekly: WeeklyProject[] = list
          .filter((p) => p.weeks && p.weeks > 0 && p.startDate)
          .map((p) => {
            const start = new Date(p.startDate as string);
            const weeksCount = Number(p.weeks);
            const ws: WeekDetail[] = [];
            if (!isNaN(start.getTime()) && weeksCount > 0) {
              for (let i = 0; i < weeksCount; i++) {
                const numero = i + 1;
                const inicio = new Date(start);
                inicio.setDate(start.getDate() + i * 7);
                const fin = new Date(inicio);
                fin.setDate(inicio.getDate() + 6);
                const toIso = (d: Date) => d.toISOString().slice(0, 10);
                ws.push({
                  numero,
                  fechaInicio: toIso(inicio),
                  fechaFin: toIso(fin),
                });
              }
            }
            return {
              id: p.id,
              name: p.name,
              weeks: ws,
            };
          });
        if (fallbackWeekly.length > 0) {
          setWeeklyProjects(fallbackWeekly);
          setSelectedWeeklyProjectId(fallbackWeekly[0].id);
        }
      } catch (err) {
        console.error(err);
      }
      try {
        const resWeeks = await fetch(`${API_BASE_URL}/admin/proyectos-semanas`);
        if (resWeeks.ok) {
          const data = await resWeeks.json();
        const fromServer = (data.proyectos || []) as WeeklyProject[];

        if (fromServer.length > 0) {
          setWeeklyProjects(fromServer);
          setSelectedWeeklyProjectId(fromServer[0].id);
        }
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadAll();
  }, []);

  const schools = Array.from(new Set(users.map((u) => u.school))).filter(Boolean);
  const programsForSchool =
    selectedSchool === "Todas"
      ? Array.from(new Set(users.map((u) => u.program))).filter(Boolean)
      : Array.from(
          new Set(users.filter((u) => u.school === selectedSchool).map((u) => u.program))
        ).filter(Boolean);

  const programsForNewSchool =
    newSchool && newSchool !== ""
      ? Array.from(
          new Set(users.filter((u) => u.school === newSchool).map((u) => u.program))
        ).filter(Boolean)
      : programsForSchool;

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const matchesSearch =
      !term ||
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.program.toLowerCase().includes(term) ||
      u.school.toLowerCase().includes(term);
    const matchesSchool =
      selectedSchool === "Todas" ? true : u.school === selectedSchool;
    const matchesProgram =
      selectedProgram === "Todos" ? true : u.program === selectedProgram;
    return matchesSearch && matchesSchool && matchesProgram;
  });

  const handleOpenModal = () => {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewRole("Docente");
    setNewSchool("");
    setNewProgram("");
    setShowModal(true);
  };

  const handleSaveUser = async () => {
    if (!newFirstName || !newLastName || !newEmail) {
      alert("Nombres, apellidos y correo son obligatorios.");
      return;
    }
    try {
      setSavingUser(true);
      const res = await fetch(`${API_BASE_URL}/admin/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombres: newFirstName,
          apellidos: newLastName,
          correo: newEmail,
          rol: newRole === "Administrador" ? "admin" : "docente",
          programaNombre: newProgram || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo crear el usuario.");
        return;
      }
      await loadDocentes();
      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
    } finally {
      setSavingUser(false);
    }
  };

  const docenteOptions = users.filter((u) => u.role === "Docente");

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

  const regenerateWeeksDetail = (weeksStr: string, startDateStr: string) => {
    const weeksNum = Number(weeksStr);
    if (!weeksNum || weeksNum <= 0 || !startDateStr) {
      setWeeksDetail([]);
      return;
    }
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) {
      setWeeksDetail([]);
      return;
    }
    const nuevo: WeekDetail[] = [];
    const nuevosItems: Record<number, EntregableItem[]> = {};
    for (let i = 0; i < weeksNum; i++) {
      const numero = i + 1;
      const inicio = new Date(start);
      inicio.setDate(start.getDate() + i * 7);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      const toIso = (d: Date) => d.toISOString().slice(0, 10);
      nuevo.push({
        numero,
        fechaInicio: toIso(inicio),
        fechaFin: toIso(fin),
      });
      nuevosItems[numero] =
        createWeeklyItems[numero] ?? [{ texto: "", horas: null }];
    }
    setWeeksDetail(nuevo);
    setCreateWeeklyItems(nuevosItems);
  };

  const handleSaveProject = async () => {
    if (!projTitle || !projProgram || !projTeacherId) {
      alert("Título, programa y docente responsable son obligatorios.");
      return;
    }
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
          semanasEntregables:
            weeksDetail.length > 0
              ? weeksDetail.map((w) => ({
                  numero: w.numero,
                  entregables: (createWeeklyItems[w.numero] || [])
                    .filter((t) => t.texto && t.texto.trim() !== "")
                    .map((t) => ({
                      texto: t.texto.trim(),
                      horas: t.horas,
                    })),
                }))
              : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo crear el proyecto.");
        return;
      }
      // recargar proyectos
      const list = await fetch(`${API_BASE_URL}/admin/proyectos`);
      if (list.ok) {
        const data = await list.json();
        setProjects(data.proyectos || []);
      }
      // recargar cronograma de proyectos (semanas + entregables)
      const weeksRes = await fetch(`${API_BASE_URL}/admin/proyectos-semanas`);
      if (weeksRes.ok) {
        const weeksData = await weeksRes.json();
        const fromServer = (weeksData.proyectos || []) as WeeklyProject[];
        setWeeklyProjects(fromServer);
      }
      setShowProjectModal(false);
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
    } finally {
      setSavingProject(false);
    }
  };

  const loadAssignedDocentes = async (
    projectId: number,
    fallbackCoordinatorId?: number | null
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/proyectos/${projectId}/docentes`);
      if (!res.ok) throw new Error("Error al cargar docentes asignados");
      const data = await res.json();
      const ids = (data.docentes || []).map((d: { id: number }) => d.id);
      if (ids.length === 0 && fallbackCoordinatorId) {
        setAssignSelectedDocentes([fallbackCoordinatorId]);
      } else {
        setAssignSelectedDocentes(ids);
      }
    } catch (err) {
      console.error(err);
      if (fallbackCoordinatorId) {
        setAssignSelectedDocentes([fallbackCoordinatorId]);
      } else {
        setAssignSelectedDocentes([]);
      }
    }
  };

  const handleOpenAssignModal = async () => {
    if (!projects.length) {
      alert("Primero debes crear al menos un proyecto.");
      return;
    }
    const defaultProjectId = projects[0]?.id ?? null;
    setAssignProjectId(defaultProjectId ?? "");
    setShowAssignModal(true);
    if (defaultProjectId) {
      const proj = projects.find((p) => p.id === defaultProjectId) || null;
      await loadAssignedDocentes(defaultProjectId, proj?.coordinatorId ?? null);
    }
  };

  const handleChangeAssignProject = async (value: string) => {
    if (!value) {
      setAssignProjectId("");
      setAssignSelectedDocentes([]);
      return;
    }
    const id = Number(value);
    setAssignProjectId(id);
    const proj = projects.find((p) => p.id === id) || null;
    await loadAssignedDocentes(id, proj?.coordinatorId ?? null);
  };

  const toggleAssignDocente = (id: number) => {
    setAssignSelectedDocentes((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSaveAssign = async (): Promise<boolean> => {
    if (!assignProjectId || typeof assignProjectId !== "number") {
      alert("Selecciona un proyecto.");
      return false;
    }
    try {
      setAssignSaving(true);
      const res = await fetch(
        `${API_BASE_URL}/admin/proyectos/${assignProjectId}/docentes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docenteIds: assignSelectedDocentes }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo asignar el proyecto.");
        return false;
      }
      alert("Asignaciones guardadas correctamente.");
      setShowAssignModal(false);
      return true;
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
      return false;
    } finally {
      setAssignSaving(false);
    }
  };

  const recalcWeeklySchedule = (projectId: number, startDateStr: string) => {
    if (!startDateStr) return;
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return;

    setWeeklyProjects((prev) =>
      prev.map((wp) => {
        if (wp.id !== projectId) return wp;
        const weeksCount = wp.weeks.length;
        const toIso = (d: Date) => d.toISOString().slice(0, 10);
        const newWeeks: WeekDetail[] = [];
        for (let i = 0; i < weeksCount; i++) {
          const numero = i + 1;
          const inicio = new Date(start);
          inicio.setDate(start.getDate() + i * 7);
          const fin = new Date(inicio);
          fin.setDate(inicio.getDate() + 6);
          const existing = wp.weeks.find((w) => w.numero === numero);
          newWeeks.push({
            id: existing?.id,
            numero,
            fechaInicio: toIso(inicio),
            fechaFin: toIso(fin),
            entregables: existing?.entregables,
          });
        }
        return { ...wp, weeks: newWeeks };
      })
    );
  };

  const handleOpenProjectDetail = async (projectId: number) => {
    setDetailProjectId(projectId);
    const proj = projects.find((p) => p.id === projectId) || null;
    if (proj?.startDate) {
      setDetailStartDate(proj.startDate.slice(0, 10));
    } else {
      setDetailStartDate("");
    }
    if (proj?.endDate) {
      setDetailEndDate(proj.endDate.slice(0, 10));
    } else {
      setDetailEndDate("");
    }
    if (proj?.coordinatorId) {
      setAssignSelectedDocentes([proj.coordinatorId]);
    }
    setShowProjectDetailModal(true);
    // precargar docentes asignados para este proyecto (o coordinador por defecto)
    await loadAssignedDocentes(projectId, proj?.coordinatorId ?? null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Administración del Sistema</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Gestión de usuarios, proyectos e indicadores
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-[#1e3a8a] text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            style={{ fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Usuarios */}
      {activeTab === "usuarios" && (
        <div className="space-y-4">
          {/* Filtros escuela / programa */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500">Filtros</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={selectedSchool}
                onChange={(e) => {
                  setSelectedSchool(e.target.value);
                  setSelectedProgram("Todos");
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
              >
                <option value="Todas">Todas las escuelas</option>
                {schools.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
              >
                <option value="Todos">Todos los programas</option>
                {programsForSchool.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar usuario..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
              />
            </div>
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm shrink-0"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" /> Agregar usuario
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-3">Nombre</th>
                    <th className="text-left px-6 py-3">Correo</th>
                    <th className="text-left px-6 py-3">Rol</th>
                    <th className="text-left px-6 py-3">Programa</th>
                    <th className="text-left px-6 py-3">Estado</th>
                    <th className="text-left px-6 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white text-xs shrink-0">
                            {u.name.split(" ").map((n) => n[0]).slice(1, 3).join("")}
                          </div>
                          <span className="text-gray-800" style={{ fontWeight: 500 }}>{u.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${u.role === "Administrador" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`} style={{ fontWeight: 500 }}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{u.program}</td>
                      <td className="px-6 py-4">
                        <Badge variant={u.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button className="text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button className="text-gray-400 hover:text-gray-600 transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Tab: Proyectos */}
      {activeTab === "proyectos" && (
        <div className="space-y-4">
          <div className="flex justify-between gap-3">
            <button
              onClick={handleOpenProjectModal}
              className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" /> Crear proyecto
            </button>
            <button
              onClick={handleOpenAssignModal}
              className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" /> Asignar proyecto
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-3">Nombre del Proyecto</th>
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
                      <td className="px-6 py-4 text-gray-600">
                        {p.totalHours != null ? `${p.totalHours} hrs` : "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {p.weeks != null ? `${p.weeks}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{p.coordinator}</td>
                      <td className="px-6 py-4"><Badge variant={p.status} /></td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            className="text-[#1d4ed8] hover:text-[#1e3a8a]"
                            onClick={() => handleOpenProjectDetail(p.id)}
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
        </div>
      )}

      {/* Tab: Indicadores */}
      {activeTab === "indicadores" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm" style={{ fontWeight: 600 }}>
              <Plus className="w-4 h-4" /> Nuevo indicador
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {indicators.map((ind) => (
              <div key={ind.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-gray-800">{ind.name}</h3>
                    <p className="text-gray-500 text-sm mt-1">Unidad: {ind.unit}</p>
                    <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded" style={{ fontWeight: 500 }}>
                      {ind.frequency}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-[#1d4ed8] hover:text-[#1e3a8a]"><Edit2 className="w-4 h-4" /></button>
                    <button className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Tareas semanales */}
      {activeTab === "tareas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-900 text-base" style={{ fontWeight: 600 }}>
                Tareas semanales por proyecto
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Selecciona un proyecto y define las tareas o entregables por semana.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm max-h-[420px] overflow-auto">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-500" style={{ fontWeight: 500 }}>
                  Proyectos con cronograma
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {weeklyProjects.length === 0 && (
                  <div className="px-4 py-4 text-xs text-gray-400">
                    Aún no hay proyectos con semanas registradas.
                  </div>
                )}
                {weeklyProjects.map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => setSelectedWeeklyProjectId(proj.id)}
                    className={`w-full text-left px-4 py-3 text-sm flex flex-col gap-0.5 hover:bg-gray-50 ${
                      selectedWeeklyProjectId === proj.id ? "bg-blue-50 border-l-2 border-[#1d4ed8]" : ""
                    }`}
                  >
                    <span className="text-gray-800" style={{ fontWeight: 500 }}>
                      {proj.name}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {proj.weeks.length} semanas en el cronograma
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              {selectedWeeklyProjectId == null && (
                <p className="text-sm text-gray-400">
                  Selecciona un proyecto de la lista para ver sus semanas.
                </p>
              )}
              {selectedWeeklyProjectId != null && (
                <>
                  {(() => {
                    const proj = weeklyProjects.find((p) => p.id === selectedWeeklyProjectId);
                    if (!proj) {
                      return (
                        <p className="text-sm text-gray-400">
                          No se encontró información de semanas para este proyecto.
                        </p>
                      );
                    }
                    const handleSaveDeliverables = async () => {
                      try {
                          const semanasPayload = proj.weeks.map((w) => {
                            const key = `${proj.id}-${w.numero}`;
                            const items: EntregableItem[] =
                              weeklyItems[key] ??
                              (w.entregables && w.entregables.length > 0
                                ? w.entregables
                                : [{ texto: "", horas: null }]);
                            return {
                              semanaId: w.id,
                              entregables: items,
                            };
                          });
                        const res = await fetch(
                          `${API_BASE_URL}/admin/proyectos/${proj.id}/entregables-semanales`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ semanas: semanasPayload }),
                          }
                        );
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          alert(
                            data.error ||
                              `No se pudieron guardar los entregables (estado ${res.status}).`
                          );
                          return;
                        }
                        // recargar cronograma desde el backend para que se reflejen
                        const weeksRes = await fetch(
                          `${API_BASE_URL}/admin/proyectos-semanas`
                        );
                        if (weeksRes.ok) {
                          const weeksData = await weeksRes.json();
                          const fromServer = (weeksData.proyectos || []) as WeeklyProject[];
                          setWeeklyProjects(fromServer);
                        }
                        alert("Entregables guardados correctamente.");
                      } catch (err) {
                        console.error(err);
                        alert("Error de conexión al guardar entregables.");
                      }
                    };

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
                              {proj.name}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {proj.weeks.length} semanas programadas
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3 max-h-[300px] overflow-auto pr-1">
                          {proj.weeks.map((w) => {
                            const key = `${proj.id}-${w.numero}`;
                            const items: EntregableItem[] =
                              weeklyItems[key] ??
                              (w.entregables && w.entregables.length > 0
                                ? w.entregables
                                : [{ texto: "", horas: null }]);
                            return (
                              <div
                                key={key}
                                className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p
                                      className="text-xs text-gray-700"
                                      style={{ fontWeight: 600 }}
                                    >
                                      Semana {w.numero}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                      {w.fechaInicio} — {w.fechaFin}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  {items.map((item, idx) => (
                                    <div key={`${key}-${idx}`} className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={item.texto}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setWeeklyItems((prev) => {
                                            const current = prev[key] ?? items;
                                            const copy = [...current];
                                            copy[idx] = { ...copy[idx], texto: v };
                                            return { ...prev, [key]: copy };
                                          });
                                        }}
                                        className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                        placeholder="Agregar entregable..."
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        value={item.horas ?? ""}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setWeeklyItems((prev) => {
                                            const current = prev[key] ?? items;
                                            const copy = [...current];
                                            copy[idx] = {
                                              ...copy[idx],
                                              horas: v === "" ? null : Number(v),
                                            };
                                            return { ...prev, [key]: copy };
                                          });
                                        }}
                                        className="w-20 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                        placeholder="Horas"
                                      />
                                      {items.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setWeeklyItems((prev) => {
                                              const current = prev[key] ?? items;
                                              const copy = current.filter((_, i) => i !== idx);
                                              return {
                                                ...prev,
                                                [key]: copy.length
                                                  ? copy
                                                  : [{ texto: "", horas: null }],
                                              };
                                            })
                                          }
                                          className="text-gray-400 hover:text-red-500 text-xs"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setWeeklyItems((prev) => {
                                        const current = prev[key] ?? items;
                                        return {
                                          ...prev,
                                          [key]: [...current, { texto: "", horas: null }],
                                        };
                                      })
                                    }
                                    className="mt-1 text-[11px] text-[#1d4ed8] hover:text-[#1e3a8a]"
                                  >
                                    + Agregar entregable
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveDeliverables}
                            className="px-4 py-2.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white rounded-lg text-xs shadow-sm"
                            style={{ fontWeight: 600 }}
                          >
                            Guardar entregables
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add user */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">Agregar nuevo usuario</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Nombres</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Apellidos</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>Correo institucional</label>
                <input
                  type="email"
                  placeholder="usuario@universidad.edu"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                    Rol
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) =>
                      setNewRole(e.target.value === "Administrador" ? "Administrador" : "Docente")
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  >
                    <option>Docente</option>
                    <option>Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                    Escuela
                  </label>
                  <select
                    value={newSchool}
                    onChange={(e) => {
                      setNewSchool(e.target.value);
                      setNewProgram("");
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  >
                    <option>Seleccionar escuela...</option>
                    {schools.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Programa
                </label>
                <select
                  value={newProgram}
                  onChange={(e) => setNewProgram(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                >
                  <option>Seleccionar programa...</option>
                  {programsForNewSchool.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
                disabled={savingUser}
              >
                {savingUser ? "Guardando..." : "Guardar usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear proyecto */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">Crear nuevo proyecto</h3>
              <button
                onClick={() => setShowProjectModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                <label
                  className="block text-sm text-gray-700 mb-1.5"
                  style={{ fontWeight: 500 }}
                >
                  Título del proyecto *
                </label>
                <input
                  type="text"
                  value={projTitle}
                  onChange={(e) => setProjTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                />
                  </div>
                  <div>
                <label
                  className="block text-sm text-gray-700 mb-1.5"
                  style={{ fontWeight: 500 }}
                >
                  Descripción
                </label>
                <textarea
                  rows={3}
                  value={projDescription}
                  onChange={(e) => setProjDescription(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none"
                  placeholder="Describe brevemente el objetivo y alcance del proyecto..."
                />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm text-gray-700 mb-1.5"
                    style={{ fontWeight: 500 }}
                  >
                    Tipo
                  </label>
                  <select
                    value={projType}
                    onChange={(e) =>
                      setProjType(
                        e.target.value === "agreement"
                          ? "agreement"
                          : e.target.value === "activity"
                          ? "activity"
                          : "project"
                      )
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  >
                    <option value="project">Proyecto</option>
                    <option value="agreement">Convenio</option>
                    <option value="activity">Actividad</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-sm text-gray-700 mb-1.5"
                    style={{ fontWeight: 500 }}
                  >
                    Programa *
                  </label>
                  <select
                    value={projProgram}
                    onChange={(e) => setProjProgram(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  >
                    <option value="">Seleccionar programa...</option>
                    {Array.from(new Set(users.map((u) => u.program)))
                      .filter(Boolean)
                      .map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                  </select>
                </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm text-gray-700 mb-1.5"
                    style={{ fontWeight: 500 }}
                  >
                    Horas totales del proyecto
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={projHours}
                    onChange={(e) => setProjHours(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                    placeholder="Ej. 120"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm text-gray-700 mb-1.5"
                    style={{ fontWeight: 500 }}
                  >
                    Número de semanas
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={projWeeks}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProjWeeks(value);
                      regenerateWeeksDetail(value, projStartDate);
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                    placeholder="Ej. 16"
                  />
                </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm text-gray-700 mb-1.5"
                    style={{ fontWeight: 500 }}
                  >
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={projStartDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProjStartDate(value);
                      regenerateWeeksDetail(projWeeks, value);
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  />
                </div>
                  </div>
                  <div>
                <label
                  className="block text-sm text-gray-700 mb-1.5"
                  style={{ fontWeight: 500 }}
                >
                  Docente responsable *
                </label>
                <select
                  value={projTeacherId}
                  onChange={(e) =>
                    setProjTeacherId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                >
                  <option value="">Seleccionar docente...</option>
                  {docenteOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.program}
                    </option>
                  ))}
                </select>
                  </div>
                </div>

                {/* Cronograma + tareas al crear */}
                <div className="space-y-3">
                  <h4
                    className="text-sm text-gray-800"
                    style={{ fontWeight: 600 }}
                  >
                    Cronograma y tareas iniciales
                  </h4>
                  {weeksDetail.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Define número de semanas y fecha de inicio para generar el
                      cronograma.
                    </p>
                  )}
                  {weeksDetail.length > 0 && (
                    <div className="space-y-3 max-h-[340px] overflow-auto pr-1">
                      {weeksDetail.map((w, index) => {
                        const items: EntregableItem[] =
                          createWeeklyItems[w.numero] &&
                          createWeeklyItems[w.numero].length
                            ? createWeeklyItems[w.numero]
                            : [{ texto: "", horas: null }];
                        return (
                          <div
                            key={w.numero}
                            className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p
                                  className="text-xs text-gray-700"
                                  style={{ fontWeight: 600 }}
                                >
                                  Semana {w.numero}
                                </p>
                                <div className="flex gap-2 mt-1">
                                  <input
                                    type="date"
                                    value={w.fechaInicio}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setWeeksDetail((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, fechaInicio: value } : item
                                        )
                                      );
                                    }}
                                    className="px-2 py-1 border border-gray-200 rounded-md bg-white text-[11px]"
                                  />
                                  <input
                                    type="date"
                                    value={w.fechaFin}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setWeeksDetail((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, fechaFin: value } : item
                                        )
                                      );
                                    }}
                                    className="px-2 py-1 border border-gray-200 rounded-md bg-white text-[11px]"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1.5 mt-2">
                            {items.map((item, idx) => (
                                <div
                                  key={`${w.numero}-${idx}`}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="text"
                                    value={item.texto}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setCreateWeeklyItems((prev) => {
                                        const current = prev[w.numero] ?? items;
                                        const copy = [...current];
                                        copy[idx] = { ...copy[idx], texto: v };
                                        return { ...prev, [w.numero]: copy };
                                      });
                                    }}
                                    className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                    placeholder="Agregar entregable..."
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.horas ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setCreateWeeklyItems((prev) => {
                                        const current = prev[w.numero] ?? items;
                                        const copy = [...current];
                                        copy[idx] = {
                                          ...copy[idx],
                                          horas: v === "" ? null : Number(v),
                                        };
                                        return { ...prev, [w.numero]: copy };
                                      });
                                    }}
                                    className="w-20 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                    placeholder="Horas"
                                  />
                                  {items.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCreateWeeklyItems((prev) => {
                                          const current = prev[w.numero] ?? items;
                                          const copy = current.filter((_, i) => i !== idx);
                                          return {
                                            ...prev,
                                            [w.numero]: copy.length
                                              ? copy
                                              : [{ texto: "", horas: null }],
                                          };
                                        })
                                      }
                                      className="text-gray-400 hover:text-red-500 text-xs"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  setCreateWeeklyItems((prev) => {
                                    const current = prev[w.numero] ?? items;
                                    return {
                                      ...prev,
                                      [w.numero]: [
                                        ...current,
                                        { texto: "", horas: null },
                                      ],
                                    };
                                  })
                                }
                                className="mt-1 text-[11px] text-[#1d4ed8] hover:text-[#1e3a8a]"
                              >
                                + Agregar entregable
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowProjectModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProject}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
                disabled={savingProject}
              >
                {savingProject ? "Guardando..." : "Guardar proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Asignar proyecto a docentes */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800">Asignar proyecto a docentes</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label
                  className="block text-sm text-gray-700 mb-1.5"
                  style={{ fontWeight: 500 }}
                >
                  Proyecto
                </label>
                <select
                  value={assignProjectId}
                  onChange={(e) => handleChangeAssignProject(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                >
                  <option value="">Seleccionar proyecto...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="block text-sm text-gray-700 mb-1.5"
                  style={{ fontWeight: 500 }}
                >
                  Docentes asignados
                </label>
                <div className="border border-gray-100 rounded-lg max-h-64 overflow-auto">
                  {docenteOptions.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-3">
                      No hay docentes registrados aún.
                    </p>
                  )}
                  {docenteOptions.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignSelectedDocentes.includes(d.id)}
                        onChange={() => toggleAssignDocente(d.id)}
                        className="w-4 h-4 text-[#1d4ed8] border-gray-300 rounded"
                      />
                      <div className="flex flex-col">
                        <span className="text-gray-800" style={{ fontWeight: 500 }}>
                          {d.name}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {d.email} — {d.program}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Puedes asignar varios docentes al mismo proyecto. El coordinador principal
                  sigue siendo el definido al crear el proyecto.
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAssign}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                style={{ fontWeight: 600 }}
                disabled={assignSaving}
              >
                {assignSaving ? "Guardando..." : "Guardar asignación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle de proyecto (docentes + cronograma) */}
      {showProjectDetailModal && detailProjectId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            {(() => {
              const proj =
                projects.find((p) => p.id === detailProjectId) || null;
              const weeklyProj =
                weeklyProjects.find((p) => p.id === detailProjectId) || null;

              const handleSaveDetailDeliverables = async (): Promise<boolean> => {
                if (!weeklyProj) return;
                try {
                  const semanasPayload = weeklyProj.weeks.map((w) => {
                    const key = `${weeklyProj.id}-${w.numero}`;
                    const items: EntregableItem[] =
                      weeklyItems[key] ??
                      (w.entregables && w.entregables.length > 0
                        ? w.entregables
                        : [{ texto: "", horas: null }]);
                    return {
                      semanaId: w.id,
                      entregables: items,
                    };
                  });
                  const res = await fetch(
                    `${API_BASE_URL}/admin/proyectos/${weeklyProj.id}/entregables-semanales`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ semanas: semanasPayload }),
                    }
                  );
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(
                      data.error ||
                        `No se pudieron guardar los entregables (estado ${res.status}).`
                    );
                    return false;
                  }
                  // recargar cronograma desde el backend para que se reflejen
                  const weeksRes = await fetch(
                    `${API_BASE_URL}/admin/proyectos-semanas`
                  );
                  if (weeksRes.ok) {
                    const weeksData = await weeksRes.json();
                    const fromServer = (weeksData.proyectos || []) as WeeklyProject[];
                    setWeeklyProjects(fromServer);
                  }
                  alert("Entregables guardados correctamente.");
                  return true;
                } catch (err) {
                  console.error(err);
                  alert("Error de conexión al guardar entregables.");
                  return false;
                }
              };

              const handleSaveProjectMeta = async (): Promise<boolean> => {
                if (!proj) return false;
                try {
                  const res = await fetch(
                    `${API_BASE_URL}/admin/proyectos/${proj.id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        fechaInicio: detailStartDate || null,
                        fechaFin: detailEndDate || null,
                      }),
                    }
                  );
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(
                      data.error ||
                        `No se pudo actualizar el proyecto (estado ${res.status}).`
                    );
                    return false;
                  }
                  // recargar proyectos para reflejar cambios en la tabla
                  const list = await fetch(`${API_BASE_URL}/admin/proyectos`);
                  if (list.ok) {
                    const data = await list.json();
                    setProjects(data.proyectos || []);
                  }
                  return true;
                } catch (err) {
                  console.error(err);
                  alert("Error de conexión al actualizar el proyecto.");
                  return false;
                }
              };

              const handleSaveAllDetail = async () => {
                if (!proj) return;
                setDetailSaving(true);
                // 1) Guardar entregables
                const okDeliverables = await handleSaveDetailDeliverables();
                if (!okDeliverables) {
                  setDetailSaving(false);
                  return;
                }
                // 2) Guardar docentes asignados
                setAssignProjectId(proj.id);
                const okAssign = await handleSaveAssign();
                if (!okAssign) {
                  setDetailSaving(false);
                  return;
                }
                // 3) Guardar fechas de inicio y fin
                const okMeta = await handleSaveProjectMeta();
                if (!okMeta) {
                  setDetailSaving(false);
                  return;
                }
                setDetailSaving(false);
                alert("Cambios guardados correctamente.");
                setShowProjectDetailModal(false);
              };

              return (
                <>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex-1 mr-4">
                      <h3 className="text-gray-800 mb-1">
                        {proj ? proj.name : "Proyecto"}
                      </h3>
                      {proj && (
                        <>
                          <p className="text-xs text-gray-400">
                            {proj.program} • {proj.totalHours ?? "—"} hrs •{" "}
                            {proj.weeks ?? "—"} semanas
                          </p>
                          <div className="mt-1 flex flex-wrap gap-3 items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500">
                                Inicio:
                              </span>
                              <input
                                type="date"
                                value={detailStartDate}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDetailStartDate(value);
                                  if (proj) {
                                    recalcWeeklySchedule(proj.id, value);
                                  }
                                }}
                                className="px-2 py-1 border border-gray-200 rounded-md bg-white text-[11px]"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500">
                                Fin estimada:
                              </span>
                              <input
                                type="date"
                                value={detailEndDate}
                                onChange={(e) =>
                                  setDetailEndDate(e.target.value)
                                }
                                className="px-2 py-1 border border-gray-200 rounded-md bg-white text-[11px]"
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {proj?.description && (
                        <p className="text-xs text-gray-500 mt-2">
                          {proj.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowProjectDetailModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Columna docentes */}
                    <div className="lg:col-span-1 space-y-3">
                      <h4
                        className="text-sm text-gray-800"
                        style={{ fontWeight: 600 }}
                      >
                        Docentes asignados
                      </h4>
                      <div className="border border-gray-100 rounded-lg max-h-72 overflow-auto">
                        {docenteOptions.length === 0 && (
                          <p className="text-xs text-gray-400 px-3 py-3">
                            No hay docentes registrados aún.
                          </p>
                        )}
                        {docenteOptions.map((d) => (
                          <label
                            key={d.id}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={assignSelectedDocentes.includes(d.id)}
                              onChange={() => toggleAssignDocente(d.id)}
                              className="w-4 h-4 text-[#1d4ed8] border-gray-300 rounded"
                            />
                            <div className="flex flex-col">
                              <span
                                className="text-gray-800"
                                style={{ fontWeight: 500 }}
                              >
                                {d.name}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                {d.email} — {d.program}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Columna cronograma */}
                    <div className="lg:col-span-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4
                          className="text-sm text-gray-800"
                          style={{ fontWeight: 600 }}
                        >
                          Cronograma por semanas
                        </h4>
                        {weeklyProj && (
                          <span className="text-[11px] text-gray-400">
                            {weeklyProj.weeks.length} semanas programadas
                          </span>
                        )}
                      </div>
                      {!weeklyProj && (
                        <p className="text-xs text-gray-400">
                          Aún no hay semanas registradas para este proyecto.
                        </p>
                      )}
                      {weeklyProj && (
                        <>
                          <div className="space-y-3 max-h-[340px] overflow-auto pr-1">
                            {weeklyProj.weeks.map((w) => {
                              const key = `${weeklyProj.id}-${w.numero}`;
                              const items: EntregableItem[] =
                                weeklyItems[key] ??
                                (w.entregables && w.entregables.length > 0
                                  ? w.entregables
                                  : [{ texto: "", horas: null }]);
                              return (
                                <div
                                  key={key}
                                  className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <p
                                        className="text-xs text-gray-700"
                                        style={{ fontWeight: 600 }}
                                      >
                                        Semana {w.numero}
                                      </p>
                                      <p className="text-[11px] text-gray-400">
                                        {w.fechaInicio} — {w.fechaFin}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    {items.map((item, idx) => (
                                      <div
                                        key={`${key}-${idx}`}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="text"
                                          value={item.texto}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setWeeklyItems((prev) => {
                                              const current =
                                                prev[key] ?? items;
                                              const copy = [...current];
                                              copy[idx] = {
                                                ...copy[idx],
                                                texto: v,
                                              };
                                              return { ...prev, [key]: copy };
                                            });
                                          }}
                                          className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                          placeholder="Agregar entregable..."
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.horas ?? ""}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setWeeklyItems((prev) => {
                                              const current =
                                                prev[key] ?? items;
                                              const copy = [...current];
                                              copy[idx] = {
                                                ...copy[idx],
                                                horas:
                                                  v === "" ? null : Number(v),
                                              };
                                              return { ...prev, [key]: copy };
                                            });
                                          }}
                                          className="w-20 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                          placeholder="Horas"
                                        />
                                        {items.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setWeeklyItems((prev) => {
                                                const current =
                                                  prev[key] ?? items;
                                                const copy = current.filter(
                                                  (_: EntregableItem, i) =>
                                                    i !== idx
                                                );
                                                return {
                                                  ...prev,
                                                  [key]: copy.length
                                                    ? copy
                                                    : [
                                                        {
                                                          texto: "",
                                                          horas: null,
                                                        },
                                                      ],
                                                };
                                              })
                                            }
                                            className="text-gray-400 hover:text-red-500 text-xs"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setWeeklyItems((prev) => {
                                          const current =
                                            prev[key] ?? items;
                                          return {
                                            ...prev,
                                            [key]: [
                                              ...current,
                                              { texto: "", horas: null },
                                            ],
                                          };
                                        })
                                      }
                                      className="mt-1 text-[11px] text-[#1d4ed8] hover:text-[#1e3a8a]"
                                    >
                                      + Agregar entregable
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end px-6 pb-6 border-t border-gray-100 mt-2">
                    <button
                      type="button"
                      onClick={handleSaveAllDetail}
                      className="px-5 py-2.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white rounded-lg text-sm shadow-sm"
                      style={{ fontWeight: 600 }}
                      disabled={detailSaving}
                    >
                      {detailSaving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
