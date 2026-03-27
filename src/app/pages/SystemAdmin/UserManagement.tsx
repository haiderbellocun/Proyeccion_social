import { useEffect, useState } from "react";
import { Edit2, MoreVertical, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "../../components/Badge";
import type { BadgeVariant } from "../../components/Badge";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  program: string;
  school: string;
  status: BadgeVariant;
};

export default function UserManagement() {
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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const loadDocentes = async () => {
    try {
      setError(null);
      const res = await fetch(
        `${API_BASE_URL}/admin/docentes?page=${page}&limit=${limit}`
      );
      if (!res.ok) throw new Error("Error al cargar docentes");
      const data = await res.json();
      const rows = data.docentes || data.data || [];
      setUsers(rows);
      setTotal(Number(data.pagination?.total ?? rows.length));
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
    }
  };

  useEffect(() => {
    void loadDocentes();
  }, [page, limit]);

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

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
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
                        {u.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(1, 3)
                          .join("")}
                      </div>
                      <span className="text-gray-800" style={{ fontWeight: 500 }}>
                        {u.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        u.role === "Administrador"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                      style={{ fontWeight: 500 }}
                    >
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
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                    Nombres
                  </label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                    Apellidos
                  </label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Correo institucional
                </label>
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
    </div>
  );
}
