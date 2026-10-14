import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, ArrowRight, FolderOpen, X } from "lucide-react";
import { AppSelect } from "../components/AppSelect";
import { EmptyState, InlineAlert, Page, PageHeader, PageLoading, Panel, ProgressBar, Segmented, StatusPill, type Tone } from "../components/ds/primitives";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";

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

const TIPO_LABEL: Record<DocenteProject["type"], { label: string; tone: Tone }> = {
  project: { label: "Iniciativa", tone: "violet" },
  agreement: { label: "Convenio", tone: "warning" },
  activity: { label: "Actividad", tone: "signal" },
};

const ESTADO_LABEL: Record<DocenteProject["status"], { label: string; tone: Tone }> = {
  active: { label: "Activo", tone: "success" },
  delayed: { label: "Retrasado", tone: "danger" },
};

function toneAvance(p: number): Tone {
  return p >= 75 ? "success" : p >= 40 ? "warning" : "danger";
}

export default function MyProjects() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [projects, setProjects] = useState<DocenteProject[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DocenteProject["type"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocenteProject["status"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const docenteId = currentUser?.id ?? null;

    if (!docenteId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(false);
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
          progress: Number(row.porcentaje_avance ?? 0),
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
      setError(true);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProjects = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter(
      (p) =>
        (typeFilter === "all" || p.type === typeFilter) &&
        (statusFilter === "all" || p.status === statusFilter) &&
        (!term ||
          p.name.toLowerCase().includes(term) ||
          p.program.toLowerCase().includes(term) ||
          p.coordinator.toLowerCase().includes(term))
    );
  }, [projects, search, typeFilter, statusFilter]);

  const conteo = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter((p) => p.status === "active").length,
      delayed: projects.filter((p) => p.status === "delayed").length,
    }),
    [projects]
  );

  const hayFiltros = search !== "" || typeFilter !== "all" || statusFilter !== "all";
  const limpiar = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  return (
    <Page>
      <PageHeader
        title="Mis iniciativas"
        description={loading ? "Cargando iniciativas…" : `${projects.length} iniciativas asignadas este ciclo.`}
      />

      {error && (
        <InlineAlert action={<button type="button" onClick={load} className="ds-btn ds-btn-secondary ds-btn-sm">Reintentar</button>}>
          No se pudieron cargar tus iniciativas.
        </InlineAlert>
      )}

      {loading ? (
        <PageLoading label="Cargando iniciativas…" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Filtrar por estado"
              value={statusFilter}
              onChange={setStatusFilter}
              items={[
                { id: "all", label: "Todas", count: conteo.all },
                { id: "active", label: "Activas", count: conteo.active, tone: "success" },
                { id: "delayed", label: "Retrasadas", count: conteo.delayed, tone: "danger" },
              ]}
            />
            <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-[14rem] flex-1 sm:w-64 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" aria-hidden />
                <input
                  type="search"
                  aria-label="Buscar iniciativa"
                  placeholder="Buscar iniciativa…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ds-input pl-9"
                />
              </div>
              <AppSelect
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
                options={[
                  { value: "all", label: "Todos los tipos" },
                  { value: "project", label: "Proyectos" },
                  { value: "agreement", label: "Convenios" },
                  { value: "activity", label: "Actividades" },
                ]}
                className="w-full sm:w-44"
              />
            </div>
          </div>

          <Panel bodyClassName="">
            {filteredProjects.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title={hayFiltros ? "Ninguna iniciativa coincide con los filtros" : "Aún no tienes iniciativas asignadas"}
                action={
                  hayFiltros ? (
                    <button type="button" onClick={limpiar} className="ds-btn ds-btn-secondary ds-btn-sm">
                      <X className="h-3.5 w-3.5" /> Limpiar filtros
                    </button>
                  ) : undefined
                }
              >
                {hayFiltros ? "Prueba con otro término o quita algún filtro." : "Cuando el coordinador te asigne una iniciativa aparecerá aquí."}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Iniciativa</th>
                      <th className="hidden sm:table-cell">Tipo</th>
                      <th className="hidden text-right md:table-cell">Horas</th>
                      <th className="hidden lg:table-cell">Fecha límite</th>
                      <th className="min-w-[7rem]">Avance</th>
                      <th className="hidden sm:table-cell">Estado</th>
                      <th className="w-px"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => {
                      const tipo = TIPO_LABEL[project.type];
                      const estado = ESTADO_LABEL[project.status];
                      const pct = Math.max(0, Math.min(100, project.progress));
                      return (
                        <tr key={project.id}>
                          <td className="max-w-[12rem] sm:max-w-[26rem]">
                            <button
                              type="button"
                              onClick={() => navigate(`/docente/proyectos/${project.id}`)}
                              className="block max-w-full text-left text-text hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                              style={{ fontWeight: 600 }}
                            >
                              <span className="line-clamp-2">{project.name}</span>
                            </button>
                            <p className="mt-0.5 truncate text-xs text-text-subtle">{project.program}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                              <StatusPill tone={tipo.tone} dot={false}>{tipo.label}</StatusPill>
                              <StatusPill tone={estado.tone}>{estado.label}</StatusPill>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell"><StatusPill tone={tipo.tone} dot={false}>{tipo.label}</StatusPill></td>
                          <td className="hidden text-right md:table-cell">{project.hours != null ? `${project.hours} h` : "—"}</td>
                          <td className="hidden whitespace-nowrap lg:table-cell">{project.deadline ? formatDateOnly(project.deadline) : "—"}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <ProgressBar value={pct} tone={toneAvance(pct)} label={`Avance de ${project.name}`} className="min-w-[4rem] flex-1" />
                              <span className="w-9 text-right text-xs tabular-nums text-text-muted" style={{ fontWeight: 600 }}>{pct}%</span>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell"><StatusPill tone={estado.tone}>{estado.label}</StatusPill></td>
                          <td>
                            <button
                              type="button"
                              onClick={() => navigate(`/docente/proyectos/${project.id}`)}
                              className="ds-btn ds-btn-ghost ds-btn-sm text-brand"
                              aria-label={`Ver detalles de ${project.name}`}
                            >
                              <span className="hidden sm:inline">Ver detalles</span> <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </Page>
  );
}
