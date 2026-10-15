// Mis iniciativas (docente) — diseño B2: tabla operativa + inspector. Datos de GET /docente/:id/dashboard (proyectos).
// La versión anterior (Tinta) se conserva en MyProjectsTinta.tsx. Rutas y acciones sin cambios.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { Bullet } from "../components/b2/Bullet";
import { IBuscar, IChevR, IMaletin } from "../components/b2/icons";
import { fechaCorta, fechaLarga, useMedia } from "../components/b2/matriz-util";
import { Dl, enControl, Estado, Inspector, type Kind } from "../components/b2/ui";

type Tipo = "project" | "agreement" | "activity";
type DocenteProject = {
  id: number;
  name: string;
  type: Tipo;
  tipoBD: string;
  hours: number | null;
  progress: number;
  status: "active" | "delayed";
  estadoBD: string;
  description: string;
  program: string;
  coordinator: string;
  start: string | null;
  deadline: string | null;
  semanas: number | null;
  total: number;
  done: number;
};

const ETIQUETA_TIPO_BD: Record<string, string> = { convenio: "Convenio", actividad: "Actividad", proyecto: "Proyecto", capacitacion: "Capacitación" };
const ETIQUETA_ESTADO_BD: Record<string, string> = { en_ejecucion: "En ejecución", finalizado: "Finalizado", suspendido: "Suspendido", planificado: "Planificado" };
const tipoLabel = (p: DocenteProject) => ETIQUETA_TIPO_BD[p.tipoBD] ?? "Iniciativa";

export default function MyProjects() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const movil = useMedia("(max-width: 720px)");
  const [projects, setProjects] = useState<DocenteProject[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Tipo>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocenteProject["status"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);

  const load = useCallback(async () => {
    const docenteId = currentUser?.id ?? null;
    if (!docenteId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`${API_BASE}/docente/${docenteId}/dashboard`);
      if (!res.ok) throw new Error("Error al cargar proyectos del docente");
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data.proyectos || []) as any[];
      const mapped: DocenteProject[] = rows.map((row) => ({
        id: row.id,
        name: row.titulo,
        type: row.tipo === "convenio" ? "agreement" : row.tipo === "actividad" ? "activity" : "project",
        tipoBD: String(row.tipo ?? ""),
        hours: row.horas_totales ?? null,
        progress: Number(row.porcentaje_avance ?? 0),
        status: row.estado === "en_ejecucion" ? "active" : "delayed",
        estadoBD: String(row.estado ?? ""),
        description: row.descripcion || "",
        program: row.programa_nombre || "Programa no especificado",
        coordinator: row.coordinador || "Docente responsable",
        start: row.fecha_inicio || null,
        deadline: row.fecha_fin_estimada || null,
        semanas: row.semanas ?? null,
        total: Number(row.total_entregables ?? 0),
        done: Number(row.entregables_completados ?? 0),
      }));
      setProjects(mapped);
    } catch (e) {
      console.error(e);
      setError(true);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter((p) =>
      (typeFilter === "all" || p.type === typeFilter) && (statusFilter === "all" || p.status === statusFilter) &&
      (!term || p.name.toLowerCase().includes(term) || p.program.toLowerCase().includes(term) || p.coordinator.toLowerCase().includes(term)));
  }, [projects, search, typeFilter, statusFilter]);
  const conteo = useMemo(() => ({ all: projects.length, active: projects.filter((p) => p.status === "active").length, delayed: projects.filter((p) => p.status === "delayed").length }), [projects]);
  const hayFiltros = search !== "" || typeFilter !== "all" || statusFilter !== "all";
  const limpiar = () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); };
  const seleccionado = projects.find((p) => p.id === sel) ?? null;
  const kindEstado = (p: DocenteProject): Kind => (p.status === "active" ? "encurso" : "vencido");
  const labelEstado = (p: DocenteProject) => (p.status === "active" ? "Activa" : ETIQUETA_ESTADO_BD[p.estadoBD] ?? "Retrasada");

  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(filtered.length - 1, cursor + 1); setCursor(n); if (sel != null && filtered[n]) setSel(filtered[n].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null && filtered[n]) setSel(filtered[n].id); }
    else if (e.key === "Enter" && filtered[cursor]) { e.preventDefault(); setSel(filtered[cursor].id); }
    else if (e.key === "Escape" && sel != null) setSel(null);
  };

  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill" data-insp="sel">
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx" aria-label="Mis iniciativas">
          <div className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t"><IMaletin width={20} height={20} />Mis iniciativas</h1>
              <p className="b2-mx-s">{loading ? "Cargando iniciativas…" : `${projects.length} iniciativas asignadas este ciclo · proyectos, actividades y convenios`}</p>
            </div>
          </div>
          {error && <div className="b2-alert" role="alert"><span>No se pudieron cargar tus iniciativas.</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => void load()}>Reintentar</button></div>}

          <div className="b2-chips b2-chips-flush" role="group" aria-label="Filtrar por estado">
            {([["all", "Todas", conteo.all], ["active", "Activas", conteo.active], ["delayed", "Retrasadas", conteo.delayed]] as const).map(([id, t, n]) => (
              <button key={id} type="button" className="b2-chip" data-on={statusFilter === id || undefined} aria-pressed={statusFilter === id} onClick={() => setStatusFilter(id)}>{t}<b>{n}</b></button>
            ))}
          </div>
          <div className="b2-tb" role="toolbar" aria-label="Buscar iniciativas">
            <label className="b2-tb-search" style={{ width: movil ? "100%" : 280 }}>
              <IBuscar width={15} height={15} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar iniciativa, programa o coordinador" aria-label="Buscar iniciativa" />
            </label>
            <select className="b2-sel" style={{ width: movil ? "100%" : 200, height: movil ? 40 : 28 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} aria-label="Filtrar por tipo">
              <option value="all">Todos los tipos</option><option value="project">Proyectos</option><option value="agreement">Convenios</option><option value="activity">Actividades</option>
            </select>
            {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar</button>}
            <div className="b2-tb-fill" />
            <span className="b2-tb-count" aria-live="polite">{filtered.length === projects.length ? `${projects.length} iniciativas` : `${filtered.length} de ${projects.length}`}</span>
          </div>

          {movil ? (
            <div className="b2-ml" style={{ padding: 0 }}>
              <ul className="b2-ml-list">
                {loading && <li className="b2-ml-vacio"><p role="status">Cargando iniciativas…</p></li>}
                {!loading && filtered.length === 0 && <li className="b2-ml-vacio"><div className="b2-ml-vacio-w"><p role="status">{hayFiltros ? "Ninguna iniciativa coincide con los filtros." : "Aún no tienes iniciativas asignadas. Cuando el coordinador te asigne una aparecerá aquí."}</p>{hayFiltros && <button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button>}</div></li>}
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="b2-ml-i" data-sel={sel === p.id || undefined} onClick={() => setSel(p.id)}>
                      <span className="b2-ml-t">
                        <span className="b2-ml-n">{p.name}</span>
                        <span className="b2-ml-e"><Estado kind={kindEstado(p)} label={labelEstado(p)} /><span className="b2-ml-ev">{tipoLabel(p)}</span></span>
                        <span className="b2-ml-m">{p.done}/{p.total} entregables · {Math.round(p.progress)}% · {p.program}</span>
                      </span>
                      <span className="b2-ml-f"><span className="b2-ml-fl">Fin</span>{p.deadline ? fechaCorta(p.deadline) : "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="b2-tabla b2-tabla-ini" role="table" aria-label="Iniciativas asignadas" tabIndex={0} onKeyDown={teclas} aria-busy={loading}>
              <div className="b2-tabla-h" role="row">
                <span role="columnheader">Iniciativa</span><span role="columnheader">Tipo</span><span role="columnheader" className="b2-c-num">Horas</span>
                <span role="columnheader">Inicio</span><span role="columnheader">Fin estimado</span><span role="columnheader">Avance</span><span role="columnheader">Estado</span><span role="columnheader" className="b2-sr-only">Abrir</span>
              </div>
              {loading && <div className="b2-skel-w" aria-hidden="true">{[90, 80, 86, 74].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div>}
              {!loading && filtered.length === 0 && <p className="b2-cola-vacio" role="status">{hayFiltros ? "Ninguna iniciativa coincide con los filtros. Prueba con otro término o quita algún filtro." : "Aún no tienes iniciativas asignadas. Cuando el coordinador te asigne una aparecerá aquí."}</p>}
              {filtered.map((p, i) => (
                <div key={p.id} className="b2-tabla-r" role="row" aria-selected={sel === p.id} data-sel={sel === p.id || undefined} data-cur={i === cursor || undefined} onClick={() => { setCursor(i); setSel(p.id); }}>
                  <span role="cell" className="b2-cola-t"><span className="b2-tt" title={p.name}>{p.name}</span><span className="b2-sub">{p.program}</span></span>
                  <span role="cell">{tipoLabel(p)}</span>
                  <span role="cell" className="b2-c-num">{p.hours != null ? `${p.hours} h` : "—"}</span>
                  <span role="cell" className="b2-fch">{p.start ? fechaCorta(p.start) : "—"}</span>
                  <span role="cell" className="b2-fch">{p.deadline ? fechaCorta(p.deadline) : "—"}</span>
                  <span role="cell"><Bullet rep={p.progress} nombre={p.name} /></span>
                  <span role="cell"><Estado kind={kindEstado(p)} label={labelEstado(p)} /></span>
                  <span role="cell" className="b2-cola-go" aria-hidden="true"><IChevR width={14} height={14} /></span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && (
          <div className="b2-insp-c">
            <p className="b2-insp-sup">{tipoLabel(seleccionado)} · {seleccionado.program}</p>
            <h2 className="b2-insp-h">{seleccionado.name}</h2>
            <div className="b2-insp-estado"><Estado kind={kindEstado(seleccionado)} label={labelEstado(seleccionado)} /></div>
            {seleccionado.description && <p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{seleccionado.description}</p>}
            <h3 className="b2-insp-sub">Avance</h3>
            <Bullet rep={seleccionado.progress} nombre={seleccionado.name} />
            <p className="b2-sub" style={{ whiteSpace: "normal", marginTop: 4 }}>{seleccionado.done} de {seleccionado.total} entregables completados</p>
            <h3 className="b2-insp-sub">Datos</h3>
            <Dl rows={[
              ["Tipo", tipoLabel(seleccionado)],
              ["Programa", seleccionado.program],
              ["Coordinador", seleccionado.coordinator],
              ["Horas", seleccionado.hours != null ? `${seleccionado.hours} h` : "—"],
              ["Inicio", seleccionado.start ? fechaLarga(seleccionado.start) : "—"],
              ["Fin estimado", seleccionado.deadline ? fechaLarga(seleccionado.deadline) : "—"],
              ["Semanas", seleccionado.semanas != null ? String(seleccionado.semanas) : "—"],
              ["Entregables", String(seleccionado.total)],
            ]} />
            <div className="b2-insp-acc">
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/docente/proyectos/${seleccionado.id}`)}>Ver detalle y entregables</button>
              <button type="button" className="b2-btn" onClick={() => navigate(`/docente/reportar?iniciativa=${seleccionado.id}`)}>Reportar entregable</button>
              <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </Inspector>
    </div>
  );
}
