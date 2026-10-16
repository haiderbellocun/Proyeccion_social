import { useEffect, useMemo, useState, type ReactNode } from "react";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import {
  AdmPagina, Barra, Buscar, Campo, Chips, DataTable, ErrorCarga, Filtro, FormInspector, Grupo, Paginador, Tag, Vacio, iniciales, useConfirmar,
  type Col,
} from "../../components/b2/admin-ui";
import { Dl, Estado, type Kind } from "../../components/b2/ui";
import "../../components/b2/b2-admin-usuarios.css";

const API_BASE_URL = API_BASE;

type Estatus = "active" | "delayed";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  rol: "docente" | "admin";
  program: string;
  school: string;
  status: Estatus;
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

type Form = {
  nombre: string;
  apellido: string;
  correo: string;
  rol: "docente" | "admin";
  escuela: string; // solo creación
  programaNombre: string; // solo creación
  programaId: number | ""; // solo edición
  estado: "activo" | "inactivo"; // solo edición
  tipo: "ANTIGUO" | "NUEVO";
  regional: string;
  drive: string;
  grupoId: number | "";
};

type Modo = { tipo: "ver"; id: number } | { tipo: "editar"; id: number } | { tipo: "crear" } | null;

const formVacio: Form = {
  nombre: "", apellido: "", correo: "", rol: "docente", escuela: "", programaNombre: "", programaId: "",
  estado: "activo", tipo: "ANTIGUO", regional: "", drive: "", grupoId: "",
};

function tipoIsNuevo(t: string | null | undefined) {
  return String(t ?? "").toUpperCase() === "NUEVO";
}

const estadoDe = (u: AdminUser): { kind: Kind; label: string } => {
  if (u.estado === "inactivo") return { kind: "porhacer", label: "Inactivo" };
  if (u.status === "delayed") return { kind: "vencido", label: "Retrasado" };
  return { kind: "encurso", label: "Activo" };
};

export default function UserManagement({ cabecera }: { cabecera: ReactNode }) {
  const { confirmar, dialogo } = useConfirmar();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("Todas");
  const [selectedProgram, setSelectedProgram] = useState<string>("Todos");
  const [rolFiltro, setRolFiltro] = useState<"todos" | "docente" | "admin">("todos");
  const [estadoFiltro, setEstadoFiltro] = useState<"todos" | "activo" | "inactivo" | "retrasado">("todos");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);

  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState<Form>(formVacio);
  const [intentado, setIntentado] = useState(false);
  const [saving, setSaving] = useState(false);

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
              opts.push({ id: p.id, name: p.name, school: s.name });
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
      const res = await fetch(`${API_BASE_URL}/admin/usuarios?page=${page}&limit=${limit}`);
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
        status: (r.status === "delayed" ? "delayed" : "active") as Estatus,
        estado: r.estado === "inactivo" ? "inactivo" : "activo",
        programa_id: r.programa_id != null ? Number(r.programa_id) : null,
        tipo_docente: r.tipo_docente != null ? String(r.tipo_docente) : null,
        regional: r.regional != null ? String(r.regional) : null,
        link_drive: r.link_drive != null ? String(r.link_drive) : null,
        grupo_matriz_id: r.grupo_matriz_id != null ? Number(r.grupo_matriz_id) : null,
        grupo_matriz_nombre: r.grupo_matriz_nombre != null ? String(r.grupo_matriz_nombre) : null,
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
      : Array.from(new Set(users.filter((u) => u.school === selectedSchool).map((u) => u.program))).filter(Boolean);

  const catalogSchools = Array.from(new Set(programOptions.map((option) => option.school))).filter(Boolean);
  const programsForNewSchool =
    form.escuela !== ""
      ? programOptions.filter((option) => option.school === form.escuela).map((option) => option.name)
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
    const matchesRol = rolFiltro === "todos" ? true : u.rol === rolFiltro;
    const matchesEstado =
      estadoFiltro === "todos"
        ? true
        : estadoFiltro === "inactivo"
          ? u.estado === "inactivo"
          : estadoFiltro === "retrasado"
            ? u.estado !== "inactivo" && u.status === "delayed"
            : u.estado === "activo" && u.status !== "delayed";
    return matchesSearch && matchesSchool && matchesProgram && matchesRol && matchesEstado;
  });

  const conteoRol = useMemo(
    () => ({ todos: users.length, docente: users.filter((u) => u.rol === "docente").length, admin: users.filter((u) => u.rol === "admin").length }),
    [users]
  );

  const hasFilters = search.trim() !== "" || selectedSchool !== "Todas" || selectedProgram !== "Todos" || rolFiltro !== "todos" || estadoFiltro !== "todos";
  const clearFilters = () => {
    setSearch("");
    setSelectedSchool("Todas");
    setSelectedProgram("Todos");
    setRolFiltro("todos");
    setEstadoFiltro("todos");
  };

  const seleccionado = modo && modo.tipo !== "crear" ? users.find((u) => u.id === modo.id) ?? null : null;
  const cerrar = () => { if (!saving) { setModo(null); setIntentado(false); } };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleOpenModal = () => {
    setForm(formVacio);
    setIntentado(false);
    setModo({ tipo: "crear" });
  };

  const openEdit = (u: AdminUser) => {
    const [nom, ...rest] = u.name.split(" ");
    const ap = rest.join(" ") || "";
    setForm({
      nombre: nom || u.name,
      apellido: ap,
      correo: u.email,
      rol: u.rol,
      escuela: "",
      programaNombre: "",
      programaId: u.programa_id ?? "",
      estado: u.estado,
      tipo: tipoIsNuevo(u.tipo_docente) ? "NUEVO" : "ANTIGUO",
      regional: u.regional || "",
      drive: u.link_drive || "",
      grupoId: u.grupo_matriz_id ?? "",
    });
    setIntentado(false);
    setModo({ tipo: "editar", id: u.id });
  };

  // Reglas idénticas a las de los handlers de guardado (crear: sin recortar; editar: recortando)
  const errores = useMemo(() => {
    const e: Record<string, string> = {};
    if (!modo || modo.tipo === "ver") return e;
    if (modo.tipo === "crear") {
      if (!form.nombre) e.nombre = "Los nombres son obligatorios.";
      if (!form.apellido) e.apellido = "Los apellidos son obligatorios.";
      if (!form.correo) e.correo = "El correo es obligatorio.";
    } else {
      if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
      if (!form.apellido.trim()) e.apellido = "El apellido es obligatorio.";
      if (!form.correo.trim()) e.correo = "El correo es obligatorio.";
    }
    return e;
  }, [modo, form]);
  const verErr = (k: string) => (intentado ? errores[k] ?? null : null);

  const handleSaveUser = async () => {
    if (Object.keys(errores).length > 0) {
      setIntentado(true);
      notify.warning("Nombres, apellidos y correo son obligatorios.");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/admin/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombres: form.nombre,
          apellidos: form.apellido,
          correo: form.correo,
          rol: form.rol,
          programaNombre: form.programaNombre || undefined,
          tipo_docente: form.rol === "docente" ? form.tipo : null,
          regional: form.rol === "docente" ? form.regional.trim() || null : null,
          link_drive: form.rol === "docente" ? form.drive.trim() || null : null,
          grupo_matriz_id: form.rol === "docente" && form.grupoId !== "" ? form.grupoId : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || "No se pudo crear el usuario.");
        return;
      }
      await loadUsers();
      setModo(null);
      setIntentado(false);
      notify.success("Usuario creado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión con el servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!modo || modo.tipo !== "editar") return;
    const editId = modo.id;
    if (Object.keys(errores).length > 0) {
      setIntentado(true);
      notify.warning("Nombre, apellido y correo son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/usuarios/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          correo: form.correo.trim(),
          rol: form.rol,
          programa_id: form.programaId === "" ? null : form.programaId,
          estado: form.estado,
          tipo_docente: form.rol === "docente" ? form.tipo : null,
          regional: form.rol === "docente" ? form.regional.trim() || null : null,
          link_drive: form.rol === "docente" ? form.drive.trim() || null : null,
          grupo_matriz_id: form.rol === "docente" && form.grupoId !== "" ? form.grupoId : null,
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
                status: updated.status as Estatus,
                estado: updated.estado === "inactivo" ? "inactivo" : "activo",
                programa_id: updated.programa_id ?? null,
                tipo_docente: updated.tipo_docente != null ? String(updated.tipo_docente) : null,
                regional: updated.regional ?? null,
                link_drive: updated.link_drive ?? null,
                grupo_matriz_id: updated.grupo_matriz_id ?? null,
                grupo_matriz_nombre: updated.grupo_matriz_nombre ?? null,
              }
            : row
        )
      );
      setModo({ tipo: "ver", id: editId });
      setIntentado(false);
      notify.success("Cambios guardados");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    const accepted = await confirmar({
      titulo: "Eliminar usuario",
      descripcion: `¿Deseas eliminar a ${u.name}? Esta acción no se puede deshacer.`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/usuarios/${u.id}`, { method: "DELETE" });
      if (res.status === 400 || res.status === 409) {
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
      setModo((m) => (m && m.tipo !== "crear" && m.id === u.id ? null : m));
      notify.success("Usuario eliminado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al eliminar.");
    }
  };

  /* ───────── tabla ───────── */
  const cols: Col<AdminUser>[] = [
    {
      id: "nombre", titulo: "Nombre", ancho: "minmax(220px, 1.5fr)",
      celda: (u) => (
        <span className="b2-adm-persona">
          <span className="b2-av" aria-hidden="true">{iniciales(u.name)}</span>
          <span><span className="b2-tt" title={u.name}>{u.name}</span><span className="b2-sub">{u.email}</span></span>
        </span>
      ),
    },
    { id: "rol", titulo: "Rol", ancho: "120px", celda: (u) => <Tag tono={u.rol === "admin" ? "aviso" : "primario"}>{u.rol === "admin" ? "Administrador" : "Docente"}</Tag> },
    { id: "tipo", titulo: "Tipo", ancho: "90px", prioridad: 2, celda: (u) => (u.rol === "docente" ? <Tag tono={tipoIsNuevo(u.tipo_docente) ? "aviso" : "neutro"}>{tipoIsNuevo(u.tipo_docente) ? "Nuevo" : "Antiguo"}</Tag> : <span className="b2-muted" aria-label="No aplica">—</span>) },
    {
      id: "programa", titulo: "Programa", ancho: "minmax(160px, 1.2fr)", prioridad: 2,
      celda: (u) => (<span><span className="b2-tt" title={u.program}>{u.program}</span>{u.school && <span className="b2-sub">{u.school}</span>}</span>),
    },
    { id: "grupo", titulo: "Grupo matriz", ancho: "minmax(120px, 1fr)", prioridad: 3, celda: (u) => (u.grupo_matriz_nombre ? <span className="b2-tt" title={u.grupo_matriz_nombre}>{u.grupo_matriz_nombre}</span> : <span className="b2-muted">Sin grupo</span>) },
    { id: "estado", titulo: "Estado", ancho: "110px", celda: (u) => { const e = estadoDe(u); return <Estado kind={e.kind} label={e.label} />; } },
  ];

  /* ───────── inspector ───────── */
  const grupoOpciones = groupOptions.filter((g) => g.activo !== false && (!g.tipo_docente || g.tipo_docente === form.tipo));
  const grupoActualExtra = modo?.tipo === "editar" && form.grupoId !== "" && !grupoOpciones.some((g) => g.id === form.grupoId)
    ? users.find((u) => u.id === modo.id)?.grupo_matriz_nombre ?? null
    : null;

  const camposFormulario = (crear: boolean) => (
    <>
      <Grupo titulo="Identidad">
        <Campo etiqueta={crear ? "Nombres" : "Nombre"} obligatorio error={verErr("nombre")}>
          {(p) => <input {...p} className="b2-input" autoComplete="off" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />}
        </Campo>
        <Campo etiqueta={crear ? "Apellidos" : "Apellido"} obligatorio error={verErr("apellido")}>
          {(p) => <input {...p} className="b2-input" autoComplete="off" value={form.apellido} onChange={(e) => set("apellido", e.target.value)} />}
        </Campo>
        <Campo etiqueta={crear ? "Correo institucional" : "Correo"} obligatorio error={verErr("correo")} ancho="completo">
          {(p) => <input {...p} type="email" className="b2-input" placeholder={crear ? "usuario@universidad.edu" : undefined} value={form.correo} onChange={(e) => set("correo", e.target.value)} />}
        </Campo>
      </Grupo>

      <Grupo titulo="Rol y programa">
        <Campo etiqueta="Rol">
          {(p) => (
            <select {...p} className="b2-sel" value={form.rol} onChange={(e) => {
              const next = e.target.value === "admin" ? "admin" : "docente";
              setForm((f) => ({ ...f, rol: next, grupoId: next === "admin" ? "" : f.grupoId }));
            }}>
              <option value="docente">Docente</option>
              <option value="admin">Administrador</option>
            </select>
          )}
        </Campo>
        {!crear && (
          <Campo etiqueta="Estado">
            {(p) => (
              <select {...p} className="b2-sel" value={form.estado} onChange={(e) => set("estado", e.target.value === "inactivo" ? "inactivo" : "activo")}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            )}
          </Campo>
        )}
        {crear ? (
          <>
            <Campo etiqueta="Escuela">
              {(p) => (
                <select {...p} className="b2-sel" value={form.escuela} onChange={(e) => setForm((f) => ({ ...f, escuela: e.target.value, programaNombre: "" }))}>
                  <option value="">Seleccionar escuela…</option>
                  {catalogSchools.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </Campo>
            <Campo etiqueta="Programa">
              {(p) => (
                <select {...p} className="b2-sel" value={form.programaNombre} onChange={(e) => set("programaNombre", e.target.value)}>
                  <option value="">Seleccionar programa…</option>
                  {programsForNewSchool.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </Campo>
          </>
        ) : (
          <Campo etiqueta="Programa" ancho="completo">
            {(p) => (
              <select {...p} className="b2-sel" value={form.programaId === "" ? "" : String(form.programaId)} onChange={(e) => set("programaId", e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Sin programa</option>
                {programOptions.map((o) => <option key={o.id} value={String(o.id)}>{`${o.name} (${o.school})`}</option>)}
              </select>
            )}
          </Campo>
        )}
      </Grupo>

      {form.rol === "docente" && (
        <Grupo titulo="Datos del docente">
          <Campo etiqueta="Tipo de docente">
            {(p) => (
              <select {...p} className="b2-sel" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value === "NUEVO" ? "NUEVO" : "ANTIGUO", grupoId: "" }))}>
                <option value="ANTIGUO">Antiguo</option>
                <option value="NUEVO">Nuevo</option>
              </select>
            )}
          </Campo>
          <Campo etiqueta="Regional">
            {(p) => <input {...p} className="b2-input" placeholder={crear ? "Ej. Bogotá" : undefined} value={form.regional} onChange={(e) => set("regional", e.target.value)} />}
          </Campo>
          <Campo etiqueta="Grupo matriz" ancho="completo" ayuda="Solo se listan grupos activos del mismo tipo de docente.">
            {(p) => (
              <select {...p} className="b2-sel" value={form.grupoId === "" ? "" : String(form.grupoId)} onChange={(e) => set("grupoId", e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Sin grupo</option>
                {grupoActualExtra && <option value={String(form.grupoId)}>{`${grupoActualExtra} (actual)`}</option>}
                {grupoOpciones.map((g) => <option key={g.id} value={String(g.id)}>{`${g.nombre} (${g.semestre})`}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Carpeta de Google Drive" ancho="completo">
            {(p) => <input {...p} type="url" className="b2-input" placeholder="https://drive.google.com/..." value={form.drive} onChange={(e) => set("drive", e.target.value)} />}
          </Campo>
        </Grupo>
      )}
    </>
  );

  let inspector: ReactNode = null;
  if (modo?.tipo === "crear") {
    inspector = (
      <FormInspector
        key="crear"
        sup="Nuevo usuario"
        titulo="Agregar usuario"
        onCerrar={cerrar}
        onGuardar={() => void handleSaveUser()}
        guardando={saving}
        etiquetaGuardar="Guardar usuario"
        errores={intentado ? Object.values(errores) : undefined}
      >
        <p className="b2-insp-p">Crea una cuenta de docente o administrador con su correo institucional.</p>
        {camposFormulario(true)}
      </FormInspector>
    );
  } else if (modo?.tipo === "editar" && seleccionado) {
    inspector = (
      <FormInspector
        key={`editar-${seleccionado.id}`}
        sup="Editar usuario"
        titulo={seleccionado.name}
        onCerrar={() => { if (!saving) { setModo({ tipo: "ver", id: seleccionado.id }); setIntentado(false); } }}
        onGuardar={() => void handleSaveEdit()}
        guardando={saving}
        etiquetaGuardar="Guardar cambios"
        errores={intentado ? Object.values(errores) : undefined}
      >
        <p className="b2-insp-p">Actualiza los datos, el rol y el estado de la cuenta.</p>
        {camposFormulario(false)}
      </FormInspector>
    );
  } else if (modo?.tipo === "ver" && seleccionado) {
    const e = estadoDe(seleccionado);
    const esDocente = seleccionado.rol === "docente";
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">{seleccionado.rol === "admin" ? "Administrador" : "Docente"}{seleccionado.school ? ` · ${seleccionado.school}` : ""}</p>
        <h2 className="b2-insp-h">{seleccionado.name}</h2>
        <div className="b2-insp-estado"><Estado kind={e.kind} label={e.label} /></div>
        <h3 className="b2-insp-sub">Datos</h3>
        <Dl rows={[
          ["Correo", seleccionado.email],
          ["Rol", seleccionado.rol === "admin" ? "Administrador" : "Docente"],
          ["Programa", seleccionado.program],
          ["Escuela", seleccionado.school || "—"],
          ...(esDocente ? ([
            ["Tipo", tipoIsNuevo(seleccionado.tipo_docente) ? "Nuevo" : "Antiguo"],
            ["Grupo matriz", seleccionado.grupo_matriz_nombre || "Sin grupo"],
            ["Regional", seleccionado.regional || "—"],
            ["Drive", seleccionado.link_drive ? <a className="b2-link" href={seleccionado.link_drive} target="_blank" rel="noopener noreferrer">Abrir carpeta</a> : "—"],
          ] as [string, ReactNode][]) : []),
        ]} />
        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEdit(seleccionado)}>Editar</button>
          <button type="button" className="b2-btn b2-link-peligro" onClick={() => void handleDelete(seleccionado)}>Eliminar</button>
          <button type="button" className="b2-btn b2-btn-ghost" onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    );
  }

  const vacio = hasFilters ? (
    <Vacio titulo="Ningún usuario coincide con los filtros" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={clearFilters}>Limpiar filtros</button>}>
      Prueba con otro término o quita algún filtro.
    </Vacio>
  ) : (
    <Vacio titulo="Aún no hay usuarios" accion={<button type="button" className="b2-btn b2-btn-sm b2-btn-primary" onClick={handleOpenModal}>Agregar usuario</button>}>
      Agrega el primer docente o administrador.
    </Vacio>
  );

  return (
    <AdmPagina
      tab="usuarios"
      cabecera={cabecera}
      titulo="Usuarios"
      subtitulo={loading ? "Cargando usuarios…" : `${total} usuarios registrados · los filtros se aplican a la página actual`}
      acciones={<button type="button" className="b2-btn b2-btn-primary" onClick={handleOpenModal}>Agregar usuario</button>}
      inspector={inspector}
      inspectorAbierto={!!inspector}
      inspectorEtiqueta={modo ? `${modo.tipo}-${"id" in modo ? modo.id : "nuevo"}` : ""}
      onCerrarInspector={cerrar}
      ancho={modo?.tipo === "crear" || modo?.tipo === "editar"}
    >
      {loadError && <ErrorCarga onReintentar={() => void loadUsers()}>No se pudo cargar la información de usuarios.</ErrorCarga>}

      <Chips
        etiqueta="Filtrar por rol"
        value={rolFiltro}
        onChange={setRolFiltro}
        items={[
          { id: "todos", label: "Todos", n: conteoRol.todos },
          { id: "docente", label: "Docentes", n: conteoRol.docente },
          { id: "admin", label: "Administradores", n: conteoRol.admin },
        ]}
      />
      <Barra contador={filteredUsers.length === users.length ? `${users.length} usuarios` : `${filteredUsers.length} de ${users.length}`}>
        <Buscar value={search} onChange={setSearch} placeholder="Buscar por nombre, correo o programa" etiqueta="Buscar usuarios" />
        <Filtro etiqueta="Filtrar por escuela" value={selectedSchool} onChange={(v) => { setSelectedSchool(v); setSelectedProgram("Todos"); }}>
          <option value="Todas">Todas las escuelas</option>
          {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        </Filtro>
        <Filtro etiqueta="Filtrar por programa" value={selectedProgram} onChange={setSelectedProgram} ancho={210}>
          <option value="Todos">Todos los programas</option>
          {programsForSchool.map((p) => <option key={p} value={p}>{p}</option>)}
        </Filtro>
        <Filtro etiqueta="Filtrar por estado" value={estadoFiltro} onChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)} ancho={150}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="retrasado">Retrasados</option>
          <option value="inactivo">Inactivos</option>
        </Filtro>
        {hasFilters && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={clearFilters}>Limpiar</button>}
      </Barra>

      <DataTable
        etiqueta="Usuarios"
        cols={cols}
        rows={filteredUsers}
        getKey={(u) => u.id}
        selId={modo && modo.tipo !== "crear" ? modo.id : null}
        onSelect={(u) => (u ? setModo({ tipo: "ver", id: u.id }) : cerrar())}
        cargando={loading}
        vacio={loadError ? <Vacio titulo="No se pudieron cargar los usuarios" /> : vacio}
        filaMovil={(u) => {
          const e = estadoDe(u);
          return {
            titulo: u.name,
            lineas: [u.email, `${u.rol === "admin" ? "Administrador" : `Docente ${tipoIsNuevo(u.tipo_docente) ? "nuevo" : "antiguo"}`} · ${u.program}`],
            lado: <Estado kind={e.kind} label={e.label} />,
          };
        }}
        acciones={(u) => [
          { label: "Editar", onSelect: () => openEdit(u) },
          "sep",
          { label: "Eliminar", onSelect: () => void handleDelete(u), danger: true },
        ]}
      />

      <Paginador pagina={page} total={total} limite={limit} onPagina={setPage} etiqueta="usuarios" />
      {dialogo}
    </AdmPagina>
  );
}
