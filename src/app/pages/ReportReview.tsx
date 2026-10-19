// Revisión de reportes (administrador) — diseño B2: tabla operativa + inspector lateral.
// La versión anterior (Tinta) se conserva en ReportReviewTinta.tsx. Endpoints y reglas sin cambios:
//   GET /admin/reportes-revision (filtros en el servidor), PUT /admin/reportes-revision/:id (aprobar / observar / sin acceso),
//   GET /admin/reportes-revision/:id/historial, GET /admin/catalogos, /admin/semestres, /admin/metricas, POST /admin/notificaciones.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { type EvidenciaEnlace } from "../components/EnlaceEvidencia";
import { IBuscar, IChevR, IFiltro, IRevision } from "../components/b2/icons";
import { EnlacesB2, fechaCortaBogota, HistorialB2, VersionesAnteriores } from "../components/b2/evidencia-ui";
import { Dl, enControl, Estado, Inspector, Popover } from "../components/b2/ui";
import { useMedia } from "../components/b2/matriz-util";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateTimeBogota } from "../lib/date";
import "@fontsource-variable/nunito-sans";
import "../components/b2/b2.css";
import "../components/b2/b2-matriz.css";
import "../components/b2/b2-matriz-real.css";
import "../components/b2/b2-bandeja.css";

const API_BASE_URL = API_BASE;

type ReportItem = {
  id: number;
  docente_id: number | null;
  teacher: string;
  school: string;
  program: string;
  email: string;
  project: string;
  semana: number | null;
  activity: string;
  description: string;
  progress: number;
  horas: number;
  status: "pending" | "review" | "approved";
  numEnvios: number;
  esReenvio: boolean;
  ultimoEnvio: string | null;
  evidenciaExenta: boolean;
  justificacionExencion: string;
  semestre: string | null;
  links: EvidenciaEnlace[];
  oldVersions: EvidenciaEnlace[];
  requisito: { requiere: boolean; tipo: string; descripcion: string };
  problemaAcceso: boolean;
  diasEnEspera: number | null;
  comentarioRevision: string;
  revisadoEn: string | null;
};

type EstadoFiltro = "enviado" | "observado" | "sin_acceso" | "aprobado" | "todos";
const ESTADOS_BANDEJA: { id: EstadoFiltro; label: string }[] = [
  { id: "enviado", label: "Pendientes de revisión" },
  { id: "sin_acceso", label: "Problema de acceso" },
  { id: "observado", label: "Observados" },
  { id: "aprobado", label: "Aprobados" },
  { id: "todos", label: "Todos" },
];

type AdminMetricas = { resumen?: { pendientes?: number; con_observaciones?: number; aprobados?: number } };
type Accion = "approve" | "adjust" | "no_access";

const espera = (d: number | null) => (d == null ? "—" : d === 0 ? "Hoy" : `${d} d`);

export default function ReportReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const movil = useMedia("(max-width: 720px)");
  const notificationReportId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("reporte"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const siguienteSel = useRef<number | null>(null);

  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("enviado");
  const [selectedSchool, setSelectedSchool] = useState("Todas");
  const [selectedProgram, setSelectedProgram] = useState("Todos");
  const [selectedTeacher, setSelectedTeacher] = useState("Todos");
  const [selectedSemester, setSelectedSemester] = useState("Todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [semesters, setSemesters] = useState<string[]>([]);
  const [catalogSchools, setCatalogSchools] = useState<{ name: string; programs: { id: number; name: string; code: string; teachers: { id: number; fullName: string }[] }[] }[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  // Conteos de la bandeja (chips y resumen). Con un semestre elegido salen de /admin/metricas acotado a ESE semestre (igual que la
  // lista filtrada); con «Todos» salen de la propia bandeja (todos los semestres), de modo que siempre coinciden con la lista.
  const solicitudMetricas = useRef(0);
  const loadMetricas = useCallback(async () => {
    const mia = ++solicitudMetricas.current;
    try {
      let datos: AdminMetricas;
      if (selectedSemester === "Todos") {
        const total = async (estado: string) => {
          const res = await fetch(`${API_BASE_URL}/admin/reportes-revision?estado=${estado}&page=1&limit=1`);
          if (!res.ok) throw new Error("Error al cargar los conteos");
          return Number((await res.json()).pagination?.total ?? 0);
        };
        const [pendientes, con_observaciones, aprobados] = await Promise.all([total("enviado"), total("observado"), total("aprobado")]);
        datos = { resumen: { pendientes, con_observaciones, aprobados } } as AdminMetricas;
      } else {
        const res = await fetch(`${API_BASE_URL}/admin/metricas?semestre=${encodeURIComponent(selectedSemester)}`);
        if (!res.ok) throw new Error("Error al cargar métricas");
        datos = await res.json().catch(() => ({}));
      }
      if (mia === solicitudMetricas.current) setMetricas(datos);
    } catch {
      if (mia === solicitudMetricas.current) setMetricas(null);
    }
  }, [selectedSemester]);

  useEffect(() => {
    (async () => {
      try {
        setLoadingCatalogs(true);
        const res = await fetch(`${API_BASE_URL}/admin/catalogos`);
        if (!res.ok) throw new Error("Error al cargar catálogos");
        const data = await res.json();
        setCatalogSchools(data.schools || []);
      } catch (err) {
        console.error(err);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      } finally {
        setLoadingCatalogs(false);
      }
    })();
  }, []);
  useEffect(() => { void loadMetricas(); }, [loadMetricas]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/semestres`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = Array.isArray(d) ? d : d?.semestres;
        if (Array.isArray(lista)) setSemesters(lista.map((x: { codigo: string }) => x.codigo).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  // La búsqueda se aplica en el servidor con una pequeña espera
  useEffect(() => {
    const t = window.setTimeout(() => setBusquedaAplicada(busqueda.trim()), 400);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setLoadingReports(true);
        setErrorCarga(null);
        const q = new URLSearchParams({ page: String(page), limit: String(limit), estado: notificationReportId ? "todos" : estadoFiltro });
        if (notificationReportId) q.set("reporte", String(notificationReportId));
        if (selectedSchool !== "Todas") q.set("escuela", selectedSchool);
        if (selectedProgram !== "Todos") q.set("programa", selectedProgram);
        if (selectedTeacher !== "Todos") q.set("docente", selectedTeacher);
        if (selectedSemester !== "Todos") q.set("semestre", selectedSemester);
        if (desde) q.set("desde", desde);
        if (hasta) q.set("hasta", hasta);
        if (busquedaAplicada) q.set("q", busquedaAplicada);
        const res = await fetch(`${API_BASE_URL}/admin/reportes-revision?${q.toString()}`);
        if (!res.ok) throw new Error("Error al cargar reportes de revisión");
        const data = await res.json();
        if (cancelado) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data.reportes || data.data || []) as any[];
        setTotal(Number(data.pagination?.total ?? rows.length));
        const mapped: ReportItem[] = rows.map((r) => ({
          id: Number(r.id),
          docente_id: r.docente_id != null ? Number(r.docente_id) : null,
          teacher: r.docente_nombre || "Docente",
          school: r.escuela_nombre || "Sin escuela",
          program: r.programa_nombre || "Sin programa",
          email: r.docente_correo || "",
          project: r.proyecto_titulo || "Iniciativa",
          semana: r.semana_numero != null ? Number(r.semana_numero) : null,
          activity: r.actividad_reportada || r.actividad || "Entregable reportado",
          description: r.descripcion_reporte || r.descripcion || "",
          progress: Number(r.porcentaje_avance ?? 100),
          horas: Number(r.horas ?? 0),
          status: r.estado_revision === "aprobado" ? "approved" : r.estado_revision === "observado" ? "review" : "pending",
          numEnvios: Number(r.num_envios ?? 0),
          esReenvio: r.es_reenvio === true,
          ultimoEnvio: r.fecha_cargue_evidencia ?? r.fecha_real_entrega ?? null,
          evidenciaExenta: r.evidencia_exenta === true,
          justificacionExencion: String(r.justificacion_exencion ?? ""),
          semestre: r.semestre ?? null,
          links: (r.evidencias ?? []) as EvidenciaEnlace[],
          oldVersions: (r.versiones_anteriores ?? []) as EvidenciaEnlace[],
          requisito: r.requisito_evidencia ?? { requiere: true, tipo: "enlace", descripcion: "" },
          problemaAcceso: r.problema_acceso === true,
          diasEnEspera: r.dias_en_espera != null ? Number(r.dias_en_espera) : null,
          comentarioRevision: String(r.comentario_revision ?? ""),
          revisadoEn: r.revisado_en ?? null,
        }));
        setReports(mapped);
        // Selección tras cargar: enlace de una notificación o siguiente entregable tras una decisión
        const objetivo = siguienteSel.current ?? notificationReportId;
        siguienteSel.current = null;
        if (objetivo != null && mapped.some((m) => m.id === objetivo)) { setSel(objetivo); setCursor(mapped.findIndex((m) => m.id === objetivo)); }
        else setSel((s) => (s != null && mapped.some((m) => m.id === s) ? s : null));
      } catch (err) {
        if (cancelado) return;
        console.error(err);
        setErrorCarga("No se pudo cargar la bandeja. Revisa la conexión e intenta de nuevo.");
        setReports([]);
      } finally {
        if (!cancelado) setLoadingReports(false);
      }
    })();
    return () => { cancelado = true; };
  }, [page, limit, notificationReportId, estadoFiltro, selectedSchool, selectedProgram, selectedTeacher, selectedSemester, desde, hasta, busquedaAplicada, recarga]);

  // Al cambiar cualquier filtro se vuelve a la primera página
  useEffect(() => { setPage(1); setCursor(0); }, [estadoFiltro, selectedSchool, selectedProgram, selectedTeacher, selectedSemester, desde, hasta, busquedaAplicada]);

  const schools = catalogSchools.map((s) => s.name);
  const programsForSchool = selectedSchool === "Todas" ? catalogSchools.flatMap((s) => s.programs.map((p) => p.name)) : (catalogSchools.find((s) => s.name === selectedSchool)?.programs || []).map((p) => p.name);
  const teachersForProgram = catalogSchools
    .filter((s) => (selectedSchool === "Todas" ? true : s.name === selectedSchool))
    .flatMap((s) => s.programs)
    .filter((p) => (selectedProgram === "Todos" ? true : p.name === selectedProgram))
    .flatMap((p) => p.teachers.map((t) => t.fullName));

  const resumen = metricas?.resumen ?? {};
  const cuentas: Partial<Record<EstadoFiltro, number>> = { enviado: Number(resumen.pendientes ?? 0), observado: Number(resumen.con_observaciones ?? 0), aprobado: Number(resumen.aprobados ?? 0) };
  const nFiltros = [selectedSchool !== "Todas", selectedProgram !== "Todos", selectedTeacher !== "Todos", selectedSemester !== "Todos", !!desde, !!hasta].filter(Boolean).length;
  const limpiarFiltros = () => { setSelectedSchool("Todas"); setSelectedProgram("Todos"); setSelectedTeacher("Todos"); setSelectedSemester("Todos"); setDesde(""); setHasta(""); setBusqueda(""); setBusquedaAplicada(""); };

  const seleccionado = reports.find((r) => r.id === sel) ?? null;
  const hasPrevPage = page > 1;
  const hasNextPage = page * limit < total;

  /** Decisión sobre un entregable: mismo PUT y mismas reglas que antes (el backend valida). */
  const decidir = async (report: ReportItem, action: Accion, comentario: string): Promise<boolean> => {
    if (action === "adjust" && !comentario.trim()) {
      notify.warning("Para solicitar correcciones debes ingresar un comentario.");
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reportes-revision/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_revision: action === "approve" ? "aprobado" : "observado",
          comentario_revision: comentario.trim() || null,
          ...(action === "no_access" ? { motivo: "sin_acceso", evidencias_afectadas: report.links.map((l) => l.id) } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.fromError(data, "No se pudo guardar la revisión.");
        return false;
      }
      notify.success({ approve: "Reporte aprobado", adjust: "Correcciones solicitadas", no_access: "Se pidió al docente corregir los permisos del enlace" }[action]);
      const i = reports.findIndex((r) => r.id === report.id);
      siguienteSel.current = reports[i + 1]?.id ?? reports[i - 1]?.id ?? null;
      setRecarga((n) => n + 1);
      await loadMetricas();
      return true;
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al guardar la revisión.");
      return false;
    }
  };

  const notificar = async (report: ReportItem, mensaje: string): Promise<boolean> => {
    if (!report.docente_id || !mensaje.trim()) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/notificaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docente_id: report.docente_id, referencia_id: report.id, mensaje: mensaje.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo enviar la notificación");
      notify.success("Notificación enviada");
      return true;
    } catch (cause) {
      notify.fromError(cause, "No se pudo enviar la notificación");
      return false;
    }
  };

  // Teclado en la tabla
  const [anchoCont, setAnchoCont] = useState(1200);
  const cont = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = cont.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setAnchoCont(c.clientWidth));
    ro.observe(c);
    setAnchoCont(c.clientWidth);
    return () => ro.disconnect();
  }, [movil, loadingReports]);
  const compacto = anchoCont < 1180;
  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(reports.length - 1, cursor + 1); setCursor(n); if (sel != null && reports[n]) setSel(reports[n].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null && reports[n]) setSel(reports[n].id); }
    else if (e.key === "Enter" && reports[cursor]) { e.preventDefault(); setSel(reports[cursor].id); }
    else if (e.key === "Escape" && sel != null) setSel(null);
  };

  const estadoDe = (r: ReportItem) => (r.status === "approved" ? { kind: "aprobado" as const, label: "Aprobado" } : r.status === "review" ? { kind: "observado" as const, label: r.problemaAcceso ? "Sin acceso" : "Observado" } : { kind: "revision" as const, label: "Por revisar" });
  const evidenciasCelda = (r: ReportItem) => {
    const n = r.links.length;
    if (n > 0) return <span className="b2-ev-n">{n} {n === 1 ? "enlace" : "enlaces"}</span>;
    if (r.evidenciaExenta) return <span className="b2-muted" title={r.justificacionExencion}>Exenta</span>;
    return <span className="b2-muted">{r.requisito.requiere ? "Sin enlaces" : "No requiere"}</span>;
  };

  const vacio = loadingReports
    ? "Cargando entregables…"
    : estadoFiltro === "enviado"
    ? "No hay entregables pendientes de revisión con estos filtros. Los observados reaparecen aquí cuando el docente los reenvía."
    : "No hay entregables con estos filtros.";

  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill" data-insp="sel">
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx" aria-label="Bandeja de revisión">
          <div className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t"><IRevision width={20} height={20} />Revisión de reportes</h1>
              <p className="b2-mx-s">{total} entregable{total !== 1 ? "s" : ""} · {ESTADOS_BANDEJA.find((x) => x.id === estadoFiltro)?.label.toLowerCase()}{metricas ? ` · ${cuentas.enviado} pendientes · ${cuentas.observado} con ajustes en proceso · ${cuentas.aprobado} aprobados` : ""}</p>
            </div>
          </div>

          <div className="b2-chips b2-chips-flush" role="group" aria-label="Estado de los entregables">
            {ESTADOS_BANDEJA.map((e) => (
              <button key={e.id} type="button" className="b2-chip" data-on={estadoFiltro === e.id || undefined} aria-pressed={estadoFiltro === e.id} onClick={() => setEstadoFiltro(e.id)}>
                {e.label}{cuentas[e.id] != null ? <b>{cuentas[e.id]}</b> : null}
              </button>
            ))}
          </div>

          <div className="b2-tb" role="toolbar" aria-label="Filtros de la bandeja">
            <Popover label="Filtros de la bandeja"
              trigger={({ props }) => (<button type="button" className="b2-btn b2-btn-sm" data-on={nFiltros > 0 || undefined} {...props}><IFiltro width={16} height={16} />Filtros{nFiltros > 0 ? ` · ${nFiltros}` : ""}</button>)}>
              {() => (
                <div className="b2-pop-body b2-filtros-rev">
                  <p className="b2-pop-t">Filtros {loadingCatalogs ? "(cargando…)" : ""}</p>
                  <label className="b2-label" htmlFor="rv-esc">Escuela</label>
                  <select id="rv-esc" className="b2-sel" value={selectedSchool} onChange={(e) => { setSelectedSchool(e.target.value); setSelectedProgram("Todos"); setSelectedTeacher("Todos"); }}>
                    <option value="Todas">Todas las escuelas</option>
                    {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <label className="b2-label" htmlFor="rv-prog">Programa</label>
                  <select id="rv-prog" className="b2-sel" value={selectedProgram} onChange={(e) => { setSelectedProgram(e.target.value); setSelectedTeacher("Todos"); }}>
                    <option value="Todos">Todos los programas</option>
                    {programsForSchool.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <label className="b2-label" htmlFor="rv-doc">Docente</label>
                  <select id="rv-doc" className="b2-sel" value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}>
                    <option value="Todos">Todos los docentes</option>
                    {teachersForProgram.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label className="b2-label" htmlFor="rv-sem">Semestre</label>
                  <select id="rv-sem" className="b2-sel" value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)}>
                    <option value="Todos">Todos los semestres</option>
                    {semesters.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <div className="b2-filtros-fechas">
                    <div><label className="b2-label" htmlFor="rv-d">Enviado desde</label><input id="rv-d" type="date" className="b2-input" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
                    <div><label className="b2-label" htmlFor="rv-h">Enviado hasta</label><input id="rv-h" type="date" className="b2-input" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
                  </div>
                  {nFiltros > 0 && <button type="button" className="b2-link-btn" style={{ marginTop: 10 }} onClick={limpiarFiltros}>Quitar filtros</button>}
                </div>
              )}
            </Popover>
            <label className="b2-tb-search" style={{ width: movil ? "100%" : 280 }}>
              <IBuscar width={15} height={15} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar entregable o iniciativa" aria-label="Buscar por entregable o iniciativa" />
            </label>
            {(nFiltros > 0 || busqueda) && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiarFiltros}>Limpiar</button>}
            <div className="b2-tb-fill" />
            <span className="b2-tb-count" aria-live="polite">{loadingReports ? "Cargando…" : `${reports.length} de ${total}`}</span>
            <div className="b2-pager" role="group" aria-label="Páginas de la bandeja">
              <button type="button" className="b2-btn b2-btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!hasPrevPage} aria-label="Página anterior"><IChevR width={14} height={14} style={{ transform: "scaleX(-1)" }} /></button>
              <span className="b2-tb-count">Página {page}</span>
              <button type="button" className="b2-btn b2-btn-sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNextPage} aria-label="Página siguiente"><IChevR width={14} height={14} /></button>
            </div>
          </div>

          {errorCarga && (
            <div className="b2-alert" role="alert"><span>{errorCarga}</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button></div>
          )}

          {movil ? (
            <div className="b2-ml" style={{ padding: 0 }}>
              <ul className="b2-ml-list">
                {reports.length === 0 && <li className="b2-ml-vacio"><p role="status">{vacio}</p></li>}
                {reports.map((r) => {
                  const est = estadoDe(r);
                  return (
                    <li key={r.id}>
                      <button type="button" className="b2-ml-i" data-sel={sel === r.id || undefined} onClick={() => setSel(r.id)}>
                        <span className="b2-ml-t">
                          <span className="b2-ml-n">{r.activity}</span>
                          <span className="b2-ml-e"><Estado kind={est.kind} label={est.label} />{r.esReenvio && <span className="b2-venc-tag" style={{ background: "var(--c-select)", color: "var(--c-primary)" }}>Reenvío</span>}<span className="b2-ml-ev">{r.links.length > 0 ? `${r.links.length} ${r.links.length === 1 ? "enlace" : "enlaces"}` : ""}</span></span>
                          <span className="b2-ml-m">{r.teacher} · {r.semana != null ? `S${r.semana}` : "—"} · {r.project}</span>
                        </span>
                        <span className="b2-ml-f" data-venc={(r.diasEnEspera ?? 0) >= 5 || undefined}><span className="b2-ml-fl">Espera</span>{espera(r.diasEnEspera)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="b2-tabla" ref={cont} role="table" aria-label="Entregables para revisar" tabIndex={0} onKeyDown={teclas} aria-busy={loadingReports} data-compacto={compacto || undefined}>
              <div className="b2-tabla-h" role="row">
                <span role="columnheader">Docente</span>
                <span role="columnheader">Entregable</span>
                {!compacto && <span role="columnheader">Iniciativa</span>}
                {!compacto && <span role="columnheader">Programa</span>}
                {!compacto && <span role="columnheader">Enviado</span>}
                <span role="columnheader" className="b2-c-num">Espera</span>
                <span role="columnheader">Estado</span>
                <span role="columnheader">Evidencias</span>
              </div>
              {loadingReports && reports.length === 0 && !errorCarga && (
                <div className="b2-skel-w" aria-hidden="true">{[90, 82, 88, 76, 84].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div>
              )}
              {!loadingReports && reports.length === 0 && !errorCarga && <p className="b2-cola-vacio" role="status">{vacio}</p>}
              {reports.map((r, i) => {
                const est = estadoDe(r);
                return (
                  <div key={r.id} className="b2-tabla-r" role="row" aria-selected={sel === r.id} data-sel={sel === r.id || undefined} data-cur={i === cursor || undefined} onClick={() => { setCursor(i); setSel(r.id); }}>
                    <span role="cell" className="b2-tt" title={`${r.teacher} · ${r.email}`}>{r.teacher}</span>
                    <span role="cell" className="b2-cola-t">
                      <span className="b2-tt" title={r.activity}>{r.activity}</span>
                      <span className="b2-sub">{r.semana != null ? `S${r.semana}` : ""}{r.esReenvio ? ` · reenvío (${r.numEnvios} envíos)` : ""}{compacto ? ` · ${r.project}` : ""}</span>
                    </span>
                    {!compacto && <span role="cell" className="b2-tt" title={r.project}>{r.project}</span>}
                    {!compacto && <span role="cell" className="b2-tt" title={r.program}>{r.program}</span>}
                    {!compacto && <span role="cell" className="b2-fch">{fechaCortaBogota(r.ultimoEnvio)}</span>}
                    <span role="cell" className="b2-c-num" data-alerta={(r.status === "pending" && (r.diasEnEspera ?? 0) >= 5) || undefined}>{r.status === "pending" ? espera(r.diasEnEspera) : "—"}</span>
                    <span role="cell"><Estado kind={est.kind} label={est.label} /></span>
                    <span role="cell">{evidenciasCelda(r)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && <InspectorRevision key={seleccionado.id} r={seleccionado} onClose={() => setSel(null)} onDecidir={decidir} onNotificar={notificar} onMatriz={() => navigate(`/admin/docentes/${seleccionado.docente_id}/matriz`)} />}
      </Inspector>
    </div>
  );
}

/* ───────────────────────── inspector de revisión ───────────────────────── */
function InspectorRevision({ r, onClose, onDecidir, onNotificar, onMatriz }: {
  r: ReportItem;
  onClose: () => void;
  onDecidir: (r: ReportItem, a: Accion, comentario: string) => Promise<boolean>;
  onNotificar: (r: ReportItem, mensaje: string) => Promise<boolean>;
  onMatriz: () => void;
}) {
  const [modo, setModo] = useState<null | Accion>(null);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [verMsg, setVerMsg] = useState(false);
  useEffect(() => { setModo(null); setComentario(""); setMensaje(""); setVerMsg(false); }, [r.id]);
  const est = r.status === "approved" ? { kind: "aprobado" as const, label: "Aprobado" } : r.status === "review" ? { kind: "observado" as const, label: r.problemaAcceso ? "Sin acceso" : "Observado" } : { kind: "revision" as const, label: r.esReenvio ? "Reenvío por revisar" : "Por revisar" };

  const confirmar = async () => {
    if (!modo) return;
    setGuardando(true);
    const ok = await onDecidir(r, modo, comentario);
    setGuardando(false);
    if (ok) { setModo(null); setComentario(""); }
  };

  return (
    <div className="b2-insp-c">
      <p className="b2-insp-sup">{r.teacher} · {r.program}</p>
      <h2 className="b2-insp-h">{r.activity}</h2>
      <div className="b2-insp-estado b2-acc-fila"><Estado kind={est.kind} label={est.label} />{r.esReenvio && <span className="b2-venc-tag" style={{ background: "var(--c-select)", color: "var(--c-primary)" }}>{r.numEnvios} envíos</span>}</div>

      {r.problemaAcceso && r.status === "review" && <div className="b2-callout b2-callout-d"><strong>Problema de acceso</strong><p>Se reportó que no se podía abrir la evidencia. Está a la espera de que el docente corrija los permisos y reenvíe.</p></div>}
      {r.status === "review" && r.comentarioRevision && <div className="b2-callout"><strong>Observación enviada{r.revisadoEn ? ` · ${formatDateTimeBogota(r.revisadoEn)}` : ""}</strong><p>«{r.comentarioRevision}»</p></div>}
      {r.evidenciaExenta && <div className="b2-callout"><strong>Sin evidencia — justificación del docente</strong><p>{r.justificacionExencion || "Sin texto."}</p></div>}

      <h3 className="b2-insp-sub">Evidencia que solicita el entregable</h3>
      <p className="b2-insp-p">{r.requisito.requiere ? r.requisito.descripcion || "Enlace a la evidencia." : "No se requiere cargue para este entregable."}</p>
      <h3 className="b2-insp-sub">Evidencias registradas</h3>
      {r.links.length > 0 ? <EnlacesB2 lista={r.links} /> : <p className="b2-muted">{r.evidenciaExenta ? "El docente no adjuntó enlaces (ver justificación)." : r.requisito.requiere ? "Sin enlaces de evidencia registrados." : "Este entregable no requiere evidencia."}</p>}
      <VersionesAnteriores lista={r.oldVersions} />
      <p className="b2-sub" style={{ whiteSpace: "normal", marginTop: 8 }}>Los enlaces pertenecen al Drive de cada docente: si no puedes abrir alguno, usa «No tengo acceso» y el docente corregirá los permisos.</p>

      {r.description && (<><h3 className="b2-insp-sub">Descripción del docente</h3><p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{r.description}</p></>)}

      <h3 className="b2-insp-sub">Datos</h3>
      <Dl rows={[
        ["Iniciativa", r.project],
        ["Semana", r.semana != null ? `S${r.semana}${r.semestre ? ` · ${r.semestre}` : ""}` : "—"],
        ["Escuela", r.school],
        ["Enviado", r.ultimoEnvio ? formatDateTimeBogota(r.ultimoEnvio) : "—"],
        ["En espera", r.status === "pending" && r.diasEnEspera != null ? (r.diasEnEspera === 0 ? "Enviado hoy" : `${r.diasEnEspera} ${r.diasEnEspera === 1 ? "día" : "días"}`) : "—"],
        ["Avance reportado", `${r.progress}%`],
        ["Horas", `${r.horas} h`],
        ["Contacto", r.email || "—"],
      ]} />
      <HistorialB2 ruta={`/admin/reportes-revision/${r.id}/historial`} clave={`${r.id}-${r.status}-${r.numEnvios}`} />

      {r.status === "pending" ? (
        <div className="b2-decision">
          {modo === null && (
            <>
              <p className="b2-decision-t">Decisión</p>
              <div className="b2-acc-fila" style={{ marginTop: 10 }}>
                <button type="button" className="b2-btn b2-btn-primary" onClick={() => setModo("approve")}>Aprobar…</button>
                <button type="button" className="b2-btn" onClick={() => setModo("adjust")}>Solicitar correcciones…</button>
                <button type="button" className="b2-btn" onClick={() => setModo("no_access")} title="El docente deberá compartir el enlace con coordinación y reenviar; no se pierde ningún dato">No tengo acceso…</button>
              </div>
            </>
          )}
          {modo === "approve" && (
            <>
              <p className="b2-decision-t">¿Aprobar este entregable?</p>
              <p className="b2-decision-n">Quedará aprobado y no podrá modificarse; solo un administrador puede reabrirlo. Esta acción no se puede deshacer aquí.</p>
              <label className="b2-label" htmlFor={`c-${r.id}`} style={{ marginTop: 8 }}>Comentario (opcional)</label>
              <textarea id={`c-${r.id}`} className="b2-input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario para el docente" />
              <div className="b2-acc-fila" style={{ marginTop: 10 }}>
                <button type="button" className="b2-btn b2-btn-primary" disabled={guardando} autoFocus onClick={() => void confirmar()}>{guardando ? "Guardando…" : "Confirmar aprobación"}</button>
                <button type="button" className="b2-btn" disabled={guardando} onClick={() => setModo(null)}>Cancelar</button>
              </div>
            </>
          )}
          {modo === "adjust" && (
            <>
              <label className="b2-decision-t" htmlFor={`c-${r.id}`}>Observación para el docente</label>
              <textarea id={`c-${r.id}`} className="b2-input" rows={4} autoFocus value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué debe corregir o completar" style={{ marginTop: 6 }} />
              <div className="b2-acc-fila" style={{ marginTop: 10 }}>
                <button type="button" className="b2-btn b2-btn-primary" disabled={guardando || comentario.trim().length < 5} onClick={() => void confirmar()}>{guardando ? "Guardando…" : "Enviar correcciones"}</button>
                <button type="button" className="b2-btn" disabled={guardando} onClick={() => setModo(null)}>Cancelar</button>
              </div>
            </>
          )}
          {modo === "no_access" && (
            <>
              <p className="b2-decision-t">No puedo abrir la evidencia</p>
              <p className="b2-decision-n">El docente recibirá el aviso para compartir el enlace con coordinación y reenviar. No se pierde ningún dato.</p>
              <label className="b2-label" htmlFor={`c-${r.id}`} style={{ marginTop: 8 }}>Comentario (opcional)</label>
              <textarea id={`c-${r.id}`} className="b2-input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué enlace no se pudo abrir" />
              <div className="b2-acc-fila" style={{ marginTop: 10 }}>
                <button type="button" className="b2-btn b2-btn-primary" disabled={guardando} onClick={() => void confirmar()}>{guardando ? "Guardando…" : "Avisar al docente"}</button>
                <button type="button" className="b2-btn" disabled={guardando} onClick={() => setModo(null)}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="b2-decision">
          <p className="b2-decision-t">{r.status === "approved" ? "Entregable aprobado" : "Devuelto al docente"}</p>
          <p className="b2-decision-n">{r.status === "approved" ? "Un entregable aprobado no se modifica; la reapertura es un procedimiento administrativo aparte (en la matriz del docente)." : "Volverá a aparecer entre los pendientes cuando el docente lo reenvíe."}{r.revisadoEn ? ` Revisado el ${formatDateTimeBogota(r.revisadoEn)}.` : ""}</p>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button type="button" className="b2-link-btn" aria-expanded={verMsg} onClick={() => setVerMsg((v) => !v)}>{verMsg ? "Ocultar mensaje al docente" : "Enviar un mensaje al docente"}</button>
        {verMsg && (
          <div className="b2-acc-form" style={{ marginTop: 8 }}>
            <label className="b2-label" htmlFor={`m-${r.id}`}>Mensaje para el docente</label>
            <textarea id={`m-${r.id}`} className="b2-input" rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje personalizado para el docente…" />
            <div className="b2-acc-fila">
              <button type="button" className="b2-btn b2-btn-sm" disabled={!r.docente_id || !mensaje.trim() || enviandoMsg} onClick={async () => { setEnviandoMsg(true); const ok = await onNotificar(r, mensaje); setEnviandoMsg(false); if (ok) setMensaje(""); }}>{enviandoMsg ? "Enviando…" : "Enviar notificación"}</button>
            </div>
          </div>
        )}
      </div>

      <div className="b2-insp-acc">
        {r.docente_id != null && <button type="button" className="b2-btn" onClick={onMatriz}>Ver matriz del docente</button>}
        <button type="button" className="b2-btn b2-btn-ghost" onClick={onClose}>Cerrar detalle</button>
      </div>
    </div>
  );
}
