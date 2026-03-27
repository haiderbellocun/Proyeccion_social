import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Filter, ArrowRight } from "lucide-react";
import { Badge } from "../components/Badge";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

type DocenteProject = {
  id: number;
  name: string;
  type: "project" | "agreement" | "activity";
  hours: number | null;
  progress: number;
  status: "active" | "delayed";
  description: string;
  program: string;
  coordinator: string;
  deadline: string | null;
};

export default function MyProjects() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [projects, setProjects] = useState<DocenteProject[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const docenteId = currentUser?.id ?? null;

    if (!docenteId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setError(null);
        const res = await fetch(`${API_BASE_URL}/docente/${docenteId}/dashboard`);
        if (!res.ok) throw new Error("Error al cargar proyectos del docente");
        const data = await res.json();
        const rows = (data.proyectos || []) as any[];

        const mapped: DocenteProject[] = rows.map((row) => {
          // map tipo BD -> visual
          const visualType: DocenteProject["type"] =
            row.tipo === "convenio"
              ? "agreement"
              : row.tipo === "actividad"
              ? "activity"
              : "project";

          // estado visual
          const visualStatus: DocenteProject["status"] =
            row.estado === "en_ejecucion" ? "active" : "delayed";

          return {
            id: row.id,
            name: row.titulo,
            type: visualType,
            hours: row.horas_totales ?? null,
            progress: 0,
            status: visualStatus,
            description: row.descripcion || "",
            program: row.programa_nombre || "Programa no especificado",
            coordinator: row.coordinador || "Docente responsable",
            deadline: row.fecha_fin_estimada || null,
          };
        });

        setProjects(mapped);
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser]);

  const filteredProjects = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.program.toLowerCase().includes(term) ||
        p.coordinator.toLowerCase().includes(term)
    );
  }, [projects, search]);

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Mis Iniciativas</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading
              ? "Cargando iniciativas..."
              : `${projects.length} iniciativas asignadas este ciclo`}
          </p>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar iniciativa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 bg-white hover:bg-gray-50 transition-colors">
          <Filter className="w-4 h-4" />
          Filtrar por tipo
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 pr-3">
                <h3 className="text-gray-800 leading-snug">{project.name}</h3>
                <p className="text-gray-500 text-xs mt-1">{project.program}</p>
              </div>
              <Badge variant={project.type} />
            </div>

            <p className="text-gray-500 text-sm mb-4 line-clamp-2">{project.description}</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400">Horas asignadas</p>
                <p className="text-gray-700 text-sm mt-0.5" style={{ fontWeight: 600 }}>
                  {project.hours != null ? `${project.hours} hrs` : "No definido"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha límite</p>
                <p className="text-gray-700 text-sm mt-0.5" style={{ fontWeight: 600 }}>
                  {project.deadline ? project.deadline : "No definida"}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Avance</span>
                <span className="text-xs text-gray-700" style={{ fontWeight: 600 }}>
                  {project.progress}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${project.progress}%`,
                    backgroundColor:
                      project.progress >= 75
                        ? "#10b981"
                        : project.progress >= 40
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant={project.status} />
              <button
                onClick={() => navigate(`/docente/proyectos/${project.id}`)}
                className="flex items-center gap-1.5 text-sm text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors"
                style={{ fontWeight: 500 }}
              >
                Ver detalles <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
