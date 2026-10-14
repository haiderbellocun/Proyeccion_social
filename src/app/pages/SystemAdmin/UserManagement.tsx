import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, InlineAlert, PageLoading, Panel, StatusPill } from "../../components/ds/primitives";
import type { BadgeVariant } from "../../components/Badge";
import { AppSelect } from "../../components/AppSelect";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

const API_BASE_URL = API_BASE;

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  rol: "docente" | "admin";
  program: string;
  school: string;
  status: BadgeVariant;
  estado: "activo" | "inactivo";
  programa_id: number | null;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  grupo_matriz_id: number | null;
  grupo_matriz_nombre: string | null;
};

type ProgramOption = { id: number; name: string; school: string };
type GroupOption = {
  id: number;
  nombre: string;
  semestre: string;
  tipo_docente: string | null;
  activo: boolean;
};

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function tipoIsNuevo(t: string | null | undefined) {
  return String(t ?? "").toUpperCase() === "NUEVO";
}

export default function UserManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
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
  const [newTeacherType, setNewTeacherType] = useState<"ANTIGUO" | "NUEVO">("ANTIGUO");
  const [newRegional, setNewRegional] = useState("");
  const [newDriveLink, setNewDriveLink] = useState("");
  const [newGroupId, setNewGroupId] = useState<number | "">("");
  const [savingUser, setSavingUser] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);

  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editApellido, setEditApellido] = useState("");
  const [editCorreo, setEditCorreo] = useState("");
  const [editRol, setEditRol] = useState<"docente" | "admin">("docente");
  const [editProgramaId, setEditProgramaId] = useState<number | "">("");
  const [editEstado, setEditEstado] = useState<"activo" | "inactivo">("activo");
  const [editTeacherType, setEditTeacherType] = useState<"ANTIGUO" | "NUEVO">("ANTIGUO");
  const [editRegional, setEditRegional] = useState("");
  const [editDriveLink, setEditDriveLink] = useState("");
  const [editGroupId, setEditGroupId] = useState<number | "">("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [res, groupsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/admin/catalogos`),
          fetch(`${API_BASE_URL}/admin/grupos-matriz`),
        ]);
        if (!res.ok || !groupsResponse.ok) return;
        const data = await res.json();
        const groupsData = await groupsResponse.json();
        const schools = data.schools || [];
        const opts: ProgramOption[] = [];
        for (const s of schools) {
          for (const p of s.programs || []) {
            if (p.id != null) {
              opts.push({
                id: p.id,
                name: p.name,
                school: s.name,
              });
            }
          }
        }
        opts.sort((a, b) => a.name.localeCompare(b.name));
        setProgramOptions(opts);
        setGroupOptions(groupsData.grupos || []);
      } catch (e) {
        console.error(e);
      }
    };
    void loadCatalog();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await fetch(
        `${API_BASE_URL}/admin/usuarios?page=${page}&limit=${limit}`
      );
      if (!res.ok) throw new Error("Error al cargar usuarios");
      const data = await res.json();
      const rows = data.usuarios || data.data || [];
      const mapped: AdminUser[] = rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        name: String(r.name || ""),
        email: String(r.email || ""),
        role: String(r.role || ""),
        rol: (r.rol === "admin" ? "admin" : "docente") as "docente" | "admin",
        program: String(r.program || "Sin programa"),
        school: String(r.school || ""),
        status: (r.status === "delayed" ? "delayed" : "active") as BadgeVariant,
        estado: r.estado === "inactivo" ? "inactivo" : "activo",
        programa_id: r.programa_id != null ? Number(r.programa_id) : null,
        tipo_docente: r.tipo_docente != null ? String(r.tipo_docente) : null,
        regional: r.regional != null ? String(r.regional) : null,
        link_drive: r.link_drive != null ? String(r.link_drive) : null,
        grupo_matriz_id: r.grupo_matriz_id != null ? Number(r.grupo_matriz_id) : null,
        grupo_matriz_nombre:
          r.grupo_matriz_nombre != null ? String(r.grupo_matriz_nombre) : null,
      }));
      setUsers(mapped);
      setTotal(Number(data.pagination?.total ?? mapped.length));
    } catch (err) {
      console.error(err);
      setLoadError(true);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [page, limit]);

  const schools = Array.from(new Set(users.map((u) => u.school))).filter(Boolean);
  const programsForSchool =
    selectedSchool === "Todas"
      ? Array.from(new Set(users.map((u) => u.program))).filter(Boolean)
      : Array.from(
          new Set(users.filter((u) => u.school === selectedSchool).map((u) => u.program))
        ).filter(Boolean);

  const catalogSchools = Array.from(new Set(programOptions.map((option) => option.school))).filter(Boolean);
  const programsForNewSchool =
    newSchool && newSchool !== ""
      ? programOptions
          .filter((option) => option.school === newSchool)
          .map((option) => option.name)
      : programOptions.map((option) => option.name);

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const matchesSearch =
      !term ||
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.program.toLowerCase().includes(term) ||
      u.school.toLowerCase().includes(term);
    const matchesSchool = selectedSchool === "Todas" ? true : u.school === selectedSchool;
    const matchesProgram = selectedProgram === "Todos" ? true : u.program === selectedProgram;
    return matchesSearch && matchesSchool && matchesProgram;
  });

  const handleOpenModal = () => {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewRole("Docente");
    setNewSchool("");
    setNewProgram("");
    setNewTeacherType("ANTIGUO");
    setNewRegional("");
    setNewDriveLink("");
    setNewGroupId("");
    setShowModal(true);
  };

  const handleSaveUser = async () => {
    if (!newFirstName || !newLastName || !newEmail) {
      notify.warning("Nombres, apellidos y correo son obligatorios.");
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
          tipo_docente: newRole === "Docente" ? newTeacherType : null,
          regional: newRole === "Docente" ? newRegional.trim() || null : null,
          link_drive: newRole === "Docente" ? newDriveLink.trim() || null : null,
          grupo_matriz_id:
            newRole === "Docente" && newGroupId !== "" ? newGroupId : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || "No se pudo crear el usuario.");
        return;
      }
      await loadUsers();
      setShowModal(false);
      notify.success("Usuario creado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión con el servidor.");
    } finally {
      setSavingUser(false);
    }
  };

  const openEdit = (u: AdminUser) => {
    const [nom, ...rest] = u.name.split(" ");
    const ap = rest.join(" ") || "";
    setEditId(u.id);
    setEditNombre(nom || u.name);
    setEditApellido(ap);
    setEditCorreo(u.email);
    setEditRol(u.rol);
    setEditProgramaId(u.programa_id ?? "");
    setEditEstado(u.estado);
    setEditTeacherType(tipoIsNuevo(u.tipo_docente) ? "NUEVO" : "ANTIGUO");
    setEditRegional(u.regional || "");
    setEditDriveLink(u.link_drive || "");
    setEditGroupId(u.grupo_matriz_id ?? "");
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (editId == null) return;
    if (!editNombre.trim() || !editApellido.trim() || !editCorreo.trim()) {
      notify.warning("Nombre, apellido y correo son obligatorios.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/usuarios/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: editNombre.trim(),
          apellido: editApellido.trim(),
          correo: editCorreo.trim(),
          rol: editRol,
          programa_id: editProgramaId === "" ? null : editProgramaId,
          estado: editEstado,
          tipo_docente: editRol === "docente" ? editTeacherType : null,
          regional: editRol === "docente" ? editRegional.trim() || null : null,
          link_drive: editRol === "docente" ? editDriveLink.trim() || null : null,
          grupo_matriz_id:
            editRol === "docente" && editGroupId !== "" ? editGroupId : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || "No se pudo guardar.");
        return;
      }
      const updated = await res.json();
      setUsers((prev) =>
        prev.map((row) =>
          row.id === editId
            ? {
                ...row,
                id: updated.id,
                name: updated.name || `${updated.nombre} ${updated.apellido}`,
                email: updated.email,
                role: updated.role,
                rol: updated.rol === "admin" ? "admin" : "docente",
                program: updated.program,
                school: updated.school,
                status: updated.status as BadgeVariant,
                estado: updated.estado === "inactivo" ? "inactivo" : "activo",
                programa_id: updated.programa_id ?? null,
                tipo_docente:
                  updated.tipo_docente != null ? String(updated.tipo_docente) : null,
                regional: updated.regional ?? null,
                link_drive: updated.link_drive ?? null,
                grupo_matriz_id: updated.grupo_matriz_id ?? null,
                grupo_matriz_nombre:
                  updated.grupo_matriz_nombre ?? null,
              }
            : row
        )
      );
      setShowEditModal(false);
      notify.success("Cambios guardados");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    const accepted = await requestConfirmation({
      title: "Eliminar usuario",
      description: `¿Deseas eliminar a ${u.name}? Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/usuarios/${u.id}`, {
        method: "DELETE",
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        notify.error(String(data.error || "No se puede eliminar este usuario."));
        return;
      }
      if (!res.ok) {
        notify.error("No se pudo eliminar el usuario.");
        return;
      }
      setUsers((prev) => prev.filter((row) => row.id !== u.id));
      setTotal((t) => Math.max(0, t - 1));
      notify.success("Usuario eliminado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al eliminar.");
    }
  };

  const programsInEditModal = useMemo(() => {
    return programOptions;
  }, [programOptions]);

  const iconBtn = "ds-btn ds-btn-ghost ds-btn-sm !px-1.5";
  const modalClass = "gap-0 rounded-xl border-line bg-surface p-0 sm:max-w-lg";
  const hasFilters = search.trim() !== "" || selectedSchool !== "Todas" || selectedProgram !== "Todos";
  const clearFilters = () => {
    setSearch("");
    setSelectedSchool("Todas");
    setSelectedProgram("Todos");
  };

  const estadoPill = (u: AdminUser) => {
    if (u.estado === "inactivo") return <StatusPill tone="neutral">Inactivo</StatusPill>;
    if (u.status === "delayed") return <StatusPill tone="danger">Retrasado</StatusPill>;
    return <StatusPill tone="success">Activo</StatusPill>;
  };

  return (
    <div className="space-y-4">
      {loadError && (
        <InlineAlert
          action={
            <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadUsers()}>
              Reintentar
            </button>
          }
        >
          No se pudo cargar la información de usuarios.
        </InlineAlert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input
            type="search"
            placeholder="Buscar por nombre, correo o programa"
            aria-label="Buscar usuarios"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ds-input pl-9"
          />
        </div>
        <div className="w-full sm:w-56" aria-label="Filtrar por escuela" role="group">
          <AppSelect
            value={selectedSchool}
            onValueChange={(v) => {
              setSelectedSchool(v);
              setSelectedProgram("Todos");
            }}
            options={[{ value: "Todas", label: "Todas las escuelas" }, ...schools.map((s) => ({ value: s, label: s }))]}
            className="w-full"
          />
        </div>
        <div className="w-full sm:w-56" aria-label="Filtrar por programa" role="group">
          <AppSelect
            value={selectedProgram}
            onValueChange={(v) => setSelectedProgram(v)}
            options={[{ value: "Todos", label: "Todos los programas" }, ...programsForSchool.map((p) => ({ value: p, label: p }))]}
            className="w-full"
          />
        </div>
        <button type="button" onClick={handleOpenModal} className="ds-btn ds-btn-primary shrink-0">
          <Plus className="h-4 w-4" aria-hidden /> Agregar usuario
        </button>
      </div>

      <Panel
        title="Usuarios"
        description={`${filteredUsers.length} de ${total} usuarios${hasFilters ? " con los filtros actuales" : ""}`}
        bodyClassName=""
      >
        {loading && <PageLoading label="Cargando usuarios…" />}
        {!loading && !loadError && filteredUsers.length === 0 && (
          <EmptyState
            icon={UserX}
            title={hasFilters ? "Ningún usuario coincide con los filtros" : "Aún no hay usuarios"}
            action={
              hasFilters ? (
                <button type="button" onClick={clearFilters} className="ds-btn ds-btn-secondary ds-btn-sm">
                  Limpiar filtros
                </button>
              ) : (
                <button type="button" onClick={handleOpenModal} className="ds-btn ds-btn-primary ds-btn-sm">
                  <Plus className="h-4 w-4" aria-hidden /> Agregar usuario
                </button>
              )
            }
          >
            {hasFilters ? "Prueba con otro término o quita algún filtro." : "Agrega el primer docente o administrador."}
          </EmptyState>
        )}
        {!loading && filteredUsers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th className="hidden md:table-cell">Correo</th>
                  <th className="hidden sm:table-cell">Rol</th>
                  <th className="hidden lg:table-cell">Tipo</th>
                  <th className="hidden xl:table-cell">Grupo matriz</th>
                  <th className="hidden lg:table-cell">Programa</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-700 sm:flex"
                          style={{ fontWeight: 600 }}
                          aria-hidden
                        >
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0 max-w-[10.5rem] sm:max-w-[16rem]">
                          <p className="truncate" style={{ fontWeight: 550 }}>{u.name}</p>
                          <p className="truncate text-xs text-text-subtle md:hidden">{u.email}</p>
                          <p className="text-xs text-text-subtle sm:hidden">{u.role === "Administrador" ? "Administrador" : "Docente"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden text-text-muted md:table-cell">{u.email}</td>
                    <td className="hidden sm:table-cell">
                      <StatusPill tone={u.role === "Administrador" ? "violet" : "brand"} dot={false}>
                        {u.role === "Administrador" ? "Administrador" : "Docente"}
                      </StatusPill>
                    </td>
                    <td className="hidden lg:table-cell">
                      {u.rol === "docente" ? (
                        <StatusPill tone={tipoIsNuevo(u.tipo_docente) ? "signal" : "neutral"} dot={false}>
                          {tipoIsNuevo(u.tipo_docente) ? "Nuevo" : "Antiguo"}
                        </StatusPill>
                      ) : (
                        <span className="text-text-subtle" aria-label="No aplica">—</span>
                      )}
                    </td>
                    <td className="hidden xl:table-cell">
                      {u.grupo_matriz_nombre ? (
                        <span className="text-xs">{u.grupo_matriz_nombre}</span>
                      ) : (
                        <span className="text-xs text-text-subtle">Sin grupo</span>
                      )}
                    </td>
                    <td className="hidden text-text-muted lg:table-cell">{u.program}</td>
                    <td>{estadoPill(u)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openEdit(u)} className={iconBtn} aria-label={`Editar a ${u.name}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(u)}
                          className={`${iconBtn} hover:!text-red-700`}
                          aria-label={`Eliminar a ${u.name}`}
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
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
          <span className="text-xs text-text-subtle" aria-live="polite">Página {page}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="ds-btn ds-btn-secondary ds-btn-sm"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * limit >= total}
              className="ds-btn ds-btn-secondary ds-btn-sm"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Panel>

      <Dialog open={showModal} onOpenChange={(open) => !savingUser && setShowModal(open)}>
        <DialogContent className={modalClass}>
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-base">Agregar usuario</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Crea una cuenta de docente o administrador con su correo institucional.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nu-nombres" className="ds-label">Nombres *</label>
                <input id="nu-nombres" type="text" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="ds-input" />
              </div>
              <div>
                <label htmlFor="nu-apellidos" className="ds-label">Apellidos *</label>
                <input id="nu-apellidos" type="text" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="ds-input" />
              </div>
            </div>
            <div>
              <label htmlFor="nu-correo" className="ds-label">Correo institucional *</label>
              <input
                id="nu-correo"
                type="email"
                placeholder="usuario@universidad.edu"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="ds-input"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div role="group" aria-labelledby="nu-rol-l">
                <span id="nu-rol-l" className="ds-label">Rol</span>
                <AppSelect
                  value={newRole}
                  onValueChange={(v) => {
                    const nextRole = v === "Administrador" ? "Administrador" : "Docente";
                    setNewRole(nextRole);
                    if (nextRole === "Administrador") setNewGroupId("");
                  }}
                  options={[
                    { value: "Docente", label: "Docente" },
                    { value: "Administrador", label: "Administrador" },
                  ]}
                  className="w-full"
                />
              </div>
              <div role="group" aria-labelledby="nu-esc-l">
                <span id="nu-esc-l" className="ds-label">Escuela</span>
                <AppSelect
                  value={newSchool}
                  onValueChange={(v) => {
                    setNewSchool(v);
                    setNewProgram("");
                  }}
                  placeholder="Seleccionar escuela…"
                  options={catalogSchools.map((s) => ({ value: s, label: s }))}
                  className="w-full"
                />
              </div>
            </div>
            <div role="group" aria-labelledby="nu-prog-l">
              <span id="nu-prog-l" className="ds-label">Programa</span>
              <AppSelect
                value={newProgram}
                onValueChange={(v) => setNewProgram(v)}
                placeholder="Seleccionar programa…"
                options={programsForNewSchool.map((p) => ({ value: p, label: p }))}
                className="w-full"
              />
            </div>
            {newRole === "Docente" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div role="group" aria-labelledby="nu-tipo-l">
                    <span id="nu-tipo-l" className="ds-label">Tipo de docente</span>
                    <AppSelect
                      value={newTeacherType}
                      onValueChange={(v) => {
                        setNewTeacherType(v === "NUEVO" ? "NUEVO" : "ANTIGUO");
                        setNewGroupId("");
                      }}
                      options={[
                        { value: "ANTIGUO", label: "Antiguo" },
                        { value: "NUEVO", label: "Nuevo" },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="nu-regional" className="ds-label">Regional</label>
                    <input
                      id="nu-regional"
                      type="text"
                      value={newRegional}
                      onChange={(e) => setNewRegional(e.target.value)}
                      placeholder="Ej. Bogotá"
                      className="ds-input"
                    />
                  </div>
                </div>
                <div role="group" aria-labelledby="nu-grupo-l">
                  <span id="nu-grupo-l" className="ds-label">Grupo matriz</span>
                  <AppSelect
                    value={newGroupId === "" ? "" : String(newGroupId)}
                    emptyValue="__none__"
                    onValueChange={(v) => setNewGroupId(v === "" ? "" : Number(v))}
                    options={[
                      { value: "__none__", label: "Sin grupo" },
                      ...groupOptions
                        .filter((group) => group.activo !== false && (!group.tipo_docente || group.tipo_docente === newTeacherType))
                        .map((group) => ({
                          value: String(group.id),
                          label: `${group.nombre} (${group.semestre})`,
                        })),
                    ]}
                    className="w-full"
                  />
                </div>
                <div>
                  <label htmlFor="nu-drive" className="ds-label">Carpeta de Google Drive</label>
                  <input
                    id="nu-drive"
                    type="url"
                    value={newDriveLink}
                    onChange={(e) => setNewDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="ds-input"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowModal(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={handleSaveUser} disabled={savingUser} className="ds-btn ds-btn-primary">
              {savingUser ? "Guardando…" : "Guardar usuario"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal && editId != null} onOpenChange={(open) => !savingEdit && setShowEditModal(open)}>
        <DialogContent className={modalClass}>
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-base">Editar usuario</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Actualiza los datos, el rol y el estado de la cuenta.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="eu-nombre" className="ds-label">Nombre *</label>
                <input id="eu-nombre" className="ds-input" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
              </div>
              <div>
                <label htmlFor="eu-apellido" className="ds-label">Apellido *</label>
                <input id="eu-apellido" className="ds-input" value={editApellido} onChange={(e) => setEditApellido(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="eu-correo" className="ds-label">Correo *</label>
              <input id="eu-correo" type="email" className="ds-input" value={editCorreo} onChange={(e) => setEditCorreo(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div role="group" aria-labelledby="eu-rol-l">
                <span id="eu-rol-l" className="ds-label">Rol</span>
                <AppSelect
                  className="w-full"
                  value={editRol}
                  onValueChange={(v) => {
                    const nextRole = v === "admin" ? "admin" : "docente";
                    setEditRol(nextRole);
                    if (nextRole === "admin") setEditGroupId("");
                  }}
                  options={[
                    { value: "docente", label: "Docente" },
                    { value: "admin", label: "Administrador" },
                  ]}
                />
              </div>
              <div role="group" aria-labelledby="eu-estado-l">
                <span id="eu-estado-l" className="ds-label">Estado</span>
                <AppSelect
                  className="w-full"
                  value={editEstado}
                  onValueChange={(v) => setEditEstado(v === "inactivo" ? "inactivo" : "activo")}
                  options={[
                    { value: "activo", label: "Activo" },
                    { value: "inactivo", label: "Inactivo" },
                  ]}
                />
              </div>
            </div>
            <div role="group" aria-labelledby="eu-prog-l">
              <span id="eu-prog-l" className="ds-label">Programa</span>
              <AppSelect
                className="w-full"
                value={editProgramaId === "" ? "" : String(editProgramaId)}
                emptyValue="__none__"
                onValueChange={(v) => setEditProgramaId(v === "" ? "" : Number(v))}
                options={[
                  { value: "__none__", label: "Sin programa" },
                  ...programsInEditModal.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.school})`,
                  })),
                ]}
              />
            </div>
            {editRol === "docente" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div role="group" aria-labelledby="eu-tipo-l">
                    <span id="eu-tipo-l" className="ds-label">Tipo de docente</span>
                    <AppSelect
                      className="w-full"
                      value={editTeacherType}
                      onValueChange={(v) => {
                        setEditTeacherType(v === "NUEVO" ? "NUEVO" : "ANTIGUO");
                        setEditGroupId("");
                      }}
                      options={[
                        { value: "ANTIGUO", label: "Antiguo" },
                        { value: "NUEVO", label: "Nuevo" },
                      ]}
                    />
                  </div>
                  <div>
                    <label htmlFor="eu-regional" className="ds-label">Regional</label>
                    <input id="eu-regional" type="text" className="ds-input" value={editRegional} onChange={(e) => setEditRegional(e.target.value)} />
                  </div>
                </div>
                <div role="group" aria-labelledby="eu-grupo-l">
                  <span id="eu-grupo-l" className="ds-label">Grupo matriz</span>
                  <AppSelect
                    className="w-full"
                    value={editGroupId === "" ? "" : String(editGroupId)}
                    emptyValue="__none__"
                    onValueChange={(v) => setEditGroupId(v === "" ? "" : Number(v))}
                    options={[
                      { value: "__none__", label: "Sin grupo" },
                      ...groupOptions
                        .filter((group) => group.activo !== false && (!group.tipo_docente || group.tipo_docente === editTeacherType))
                        .map((group) => ({
                          value: String(group.id),
                          label: `${group.nombre} (${group.semestre})`,
                        })),
                    ]}
                  />
                </div>
                <div>
                  <label htmlFor="eu-drive" className="ds-label">Carpeta de Google Drive</label>
                  <input
                    id="eu-drive"
                    type="url"
                    className="ds-input"
                    value={editDriveLink}
                    onChange={(e) => setEditDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="border-t border-line px-5 py-3">
            <button type="button" onClick={() => setShowEditModal(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={savingEdit} onClick={() => void handleSaveEdit()} className="ds-btn ds-btn-primary">
              {savingEdit ? "Guardando…" : "Guardar cambios"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
