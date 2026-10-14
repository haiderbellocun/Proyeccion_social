import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Link2,
  Send,
  ShieldAlert,
  User,
} from "lucide-react";
import { Badge } from "../components/Badge";
import { EnlaceEvidencia, type EvidenciaEnlace } from "../components/EnlaceEvidencia";
import { HistorialEntregable } from "../components/HistorialEntregable";
import { AppSelect } from "../components/AppSelect";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota } from "../lib/date";

const API_BASE_URL = API_BASE;

type ReportItem = {
  id: number;
  docente_id: number | null;
  teacher: string;
  school: string;
  program: string;
  email: string;
  project: string;
  week: string;
  date: string;
  activity: string;
  description: string;
  progress: number;
  evidences: { name: string; type: "LINK" | "TEXT" }[];
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

// url_evidencia: enlace simple (histórico) o JSON con varios enlaces.
function parseEvidencias(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map((u) => String(u).trim()).filter(Boolean);
    } catch {
      /* se trata como texto */
    }
  }
  return text.split(/\s+/).filter(Boolean);
}

type AdminMetricas = {
  resumen?: {
    pendientes?: number;
    con_observaciones?: number;
    aprobados?: number;
  };
};

export default function ReportReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationReportId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("reporte"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const [current, setCurrent] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState<Record<number, string>>({});
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [metricas, setMetricas] = useState<AdminMetricas | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string>("Todas");
  const [selectedProgram, setSelectedProgram] = useState<string>("Todos");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("Todos");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("enviado");
  const [selectedSemester, setSelectedSemester] = useState("Todos");
  const [semesters, setSemesters] = useState<string[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [catalogSchools, setCatalogSchools] = useState<
    { name: string; programs: { id: number; name: string; code: string; teachers: { id: number; fullName: string }[] }[] }[]
  >([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const loadMetricas = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/metricas`);
      if (!res.ok) throw new Error("Error al cargar métricas");
      setMetricas(await res.json().catch(() => ({})));
    } catch {
      setMetricas(null);
    }
  }, []);

  useEffect(() => {
    const loadCatalogs = async () => {
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
    };
    loadCatalogs();
  }, []);

  useEffect(() => {
    void loadMetricas();
  }, [loadMetricas]);

  useEffect(() => {
    let cancelado = false;
    const loadReports = async () => {
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
        const rows = (data.reportes || data.data || []) as any[];
        setTotal(Number(data.pagination?.total ?? rows.length));
        const mapped: ReportItem[] = rows.map((r: any) => {
          let status: ReportItem["status"] = "pending";
          if (r.estado_revision === "aprobado") status = "approved";
          else if (r.estado_revision === "observado") status = "review";
          return {
            id: Number(r.id),
            docente_id: r.docente_id != null ? Number(r.docente_id) : null,
            teacher: r.docente_nombre || "Docente",
            school: r.escuela_nombre || "Sin escuela",
            program: r.programa_nombre || "Sin programa",
            email: r.docente_correo || "",
            project: r.proyecto_titulo || "Iniciativa",
            week: `Semana ${r.semana_numero || "—"}`,
            date: formatDateOnly(r.fecha_real_entrega),
            activity:
              r.actividad_reportada ||
              r.actividad ||
              "Entregable reportado",
            description:
              r.descripcion_reporte ||
              r.descripcion ||
              r.actividad ||
              "Sin descripción",
            progress: Number(r.porcentaje_avance ?? 100),
            evidences: parseEvidencias(r.url_evidencia).length
              ? parseEvidencias(r.url_evidencia).map((u) => ({ name: u, type: "LINK" as const }))
              : [{ name: "Sin URL de evidencia", type: "TEXT" as const }],
            status,
            numEnvios: Number(r.num_envios ?? 0),
            esReenvio: r.es_reenvio === true,
            ultimoEnvio: r.fecha_cargue_evidencia ?? null,
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
          };
        });
        const visibleReports = mapped;
        setReports(visibleReports);
        if (notificationReportId) {
          const targetIndex = visibleReports.findIndex(
            (item) => item.id === notificationReportId
          );
          setCurrent(targetIndex >= 0 ? targetIndex : 0);
        }
      } catch (err) {
        if (cancelado) return;
        console.error(err);
        setErrorCarga("No se pudo cargar la bandeja. Revisa la conexión e intenta de nuevo.");
        setReports([]);
      } finally {
        if (!cancelado) setLoadingReports(false);
      }
    };
    loadReports();
    return () => {
      cancelado = true;
    };
  }, [page, limit, notificationReportId, estadoFiltro, selectedSchool, selectedProgram, selectedTeacher, selectedSemester, desde, hasta, busquedaAplicada, recarga]);

  // Al cambiar cualquier filtro se vuelve a la primera página y al primer entregable
  useEffect(() => {
    setPage(1);
    setCurrent(0);
    setVerHistorial(false);
    setReviewed({});
  }, [estadoFiltro, selectedSchool, selectedProgram, selectedTeacher, selectedSemester, desde, hasta, busquedaAplicada]);

  useEffect(() => {
    setVerHistorial(false);
  }, [current]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/semestres`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = Array.isArray(d) ? d : d?.semestres;
        if (Array.isArray(lista)) setSemesters(lista.map((x: { codigo: string }) => x.codigo).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  const schools = catalogSchools.map((s) => s.name);

  const programsForSchool =
    selectedSchool === "Todas"
      ? catalogSchools.flatMap((s) => s.programs.map((p) => p.name))
      : (catalogSchools.find((s) => s.name === selectedSchool)?.programs || []).map(
          (p) => p.name
        );

  const teachersForProgram = catalogSchools
    .filter((s) => (selectedSchool === "Todas" ? true : s.name === selectedSchool))
    .flatMap((s) => s.programs)
    .filter((p) => (selectedProgram === "Todos" ? true : p.name === selectedProgram))
    .flatMap((p) => p.teachers.map((t) => t.fullName));

  // Los filtros se aplican en el servidor (sobre todas las páginas), no solo sobre la página cargada.
  const filteredReports = reports;

  const resumen = metricas?.resumen ?? {};
  const pendientes = Number(resumen.pendientes ?? 0);
  const observados = Number(resumen.con_observaciones ?? 0);
  const aprobados = Number(resumen.aprobados ?? 0);

  const headerBadge = useMemo(() => {
    return `${pendientes} pendientes de revisión · ${observados} con ajustes en proceso · ${aprobados} aprobados`;
  }, [pendientes, observados, aprobados]);

  const safeIndex =
    filteredReports.length > 0 ? Math.min(current, filteredReports.length - 1) : 0;
  const report = filteredReports.length > 0 ? filteredReports[safeIndex] : null;

  const handleAction = async (action: "approve" | "adjust" | "reject" | "no_access") => {
    if (!report) return;
    const estado_revision =
      action === "approve"
        ? "aprobado"
        : action === "adjust"
        ? "observado"
        : "observado";
    if (action !== "approve" && action !== "no_access" && !comment.trim()) {
      notify.warning("Para solicitar ajustes o rechazar, debes ingresar un comentario.");
      return;
    }
    try {
      setSavingDecision(true);
      const res = await fetch(`${API_BASE_URL}/admin/reportes-revision/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_revision,
          comentario_revision: comment || null,
          ...(action === "no_access" ? { motivo: "sin_acceso", evidencias_afectadas: report.links.map((l) => l.id) } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.fromError(data, "No se pudo guardar la revisión.");
        return;
      }
      const successMessages = {
        approve: "Reporte aprobado",
        adjust: "Ajustes solicitados",
        reject: "Reporte rechazado",
        no_access: "Se pidió al docente corregir los permisos del enlace",
      };
      notify.success(successMessages[action]);
      setReviewed({ ...reviewed, [report.id]: action });
      setComment("");
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? {
                ...r,
                status:
                  action === "approve"
                    ? "approved"
                    : action === "adjust"
                    ? "review"
                    : "review",
                problemaAcceso: action === "no_access",
              }
            : r
        )
      );
      setTotal((currentTotal) => Math.max(0, currentTotal - 1));
      await loadMetricas();
      if (safeIndex < filteredReports.length - 1) setCurrent(safeIndex + 1);
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al guardar la revisión.");
    } finally {
      setSavingDecision(false);
    }
  };

  const handleNotification = async () => {
    if (!report?.docente_id || !notificationMessage.trim()) return;
    try {
      setSendingNotification(true);
      const response = await fetch(`${API_BASE_URL}/admin/notificaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docente_id: report.docente_id,
          referencia_id: report.id,
          mensaje: notificationMessage.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo enviar la notificación");
      setNotificationMessage("");
      notify.success("Notificación enviada");
    } catch (cause) {
      notify.fromError(cause, "No se pudo enviar la notificación");
    } finally {
      setSendingNotification(false);
    }
  };

  const actionLabels = {
    approve: { label: "Aprobado", color: "text-emerald-600" },
    adjust: { label: "Requiere ajustes", color: "text-amber-600" },
    reject: { label: "Rechazado", color: "text-red-600" },
    no_access: { label: "Sin acceso: el docente debe corregir los permisos", color: "text-amber-600" },
  };
  const hasPrevPage = page > 1;
  const hasNextPage = page * limit < total;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Revisión de Reportes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {total} entregable{total !== 1 ? "s" : ""} · {ESTADOS_BANDEJA.find((x) => x.id === estadoFiltro)?.label.toLowerCase()}
          </p>
          {metricas && (
            <p className="text-xs text-gray-400 mt-1">{headerBadge}</p>
          )}
        </div>

        {/* Navegación entre reportes */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPrevPage}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-500">Página {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
          <button
            onClick={() => setCurrent(Math.max(0, safeIndex - 1))}
            disabled={safeIndex === 0 || filteredReports.length === 0}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            {filteredReports.length > 0 ? safeIndex + 1 : 0} / {filteredReports.length}
          </span>
          <button
            onClick={() =>
              setCurrent(
                Math.min(
                  filteredReports.length > 0 ? filteredReports.length - 1 : 0,
                  safeIndex + 1
                )
              )
            }
            disabled={
              filteredReports.length === 0 || safeIndex === filteredReports.length - 1
            }
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado de los entregables">
        {ESTADOS_BANDEJA.map((e) => (
          <button
            key={e.id}
            type="button"
            role="tab"
            aria-selected={estadoFiltro === e.id}
            onClick={() => setEstadoFiltro(e.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              estadoFiltro === e.id ? "bg-[#1e3a8a] border-[#1e3a8a] text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* Filtros debajo del título */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">
            Filtros {loadingCatalogs && "(cargando...)"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <AppSelect
            value={selectedSchool}
            onValueChange={(value) => {
              setSelectedSchool(value);
              setSelectedProgram("Todos");
              setSelectedTeacher("Todos");
              setCurrent(0);
            }}
            options={[
              { value: "Todas", label: "Todas las escuelas" },
              ...schools.map((s) => ({ value: s, label: s })),
            ]}
            className="w-full"
          />
          <AppSelect
            value={selectedProgram}
            onValueChange={(value) => {
              setSelectedProgram(value);
              setSelectedTeacher("Todos");
              setCurrent(0);
            }}
            options={[
              { value: "Todos", label: "Todos los programas" },
              ...programsForSchool.map((p) => ({ value: p, label: p })),
            ]}
            className="w-full"
          />
          <AppSelect
            value={selectedTeacher}
            onValueChange={(value) => {
              setSelectedTeacher(value);
              setCurrent(0);
            }}
            options={[
              { value: "Todos", label: "Todos los docentes" },
              ...teachersForProgram.map((t) => ({ value: t, label: t })),
            ]}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <AppSelect
            value={selectedSemester}
            onValueChange={setSelectedSemester}
            options={[{ value: "Todos", label: "Todos los semestres" }, ...semesters.map((x) => ({ value: x, label: x }))]}
            className="w-full"
          />
          <label className="text-xs text-gray-500">
            Enviado desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          </label>
          <label className="text-xs text-gray-500">
            Enviado hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
          </label>
          <form
            className="text-xs text-gray-500"
            onSubmit={(e) => {
              e.preventDefault();
              setBusquedaAplicada(busqueda.trim());
            }}
          >
            Entregable o iniciativa
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onBlur={() => setBusquedaAplicada(busqueda.trim())}
              placeholder="Buscar…"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </form>
        </div>
      </div>

      {errorCarga && (
        <div className="flex flex-wrap items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[12rem]">{errorCarga}</span>
          <button type="button" onClick={() => setRecarga((n) => n + 1)} className="px-3 py-1 rounded-lg bg-white border border-red-200 hover:bg-red-100">Reintentar</button>
        </div>
      )}

      {/* Report list mini */}
      <div className="flex gap-2 flex-wrap">
        {filteredReports.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setCurrent(i)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              i === safeIndex
                ? "bg-[#1e3a8a] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={{ fontWeight: i === safeIndex ? 600 : 400 }}
          >
            {reviewed[r.id] ? (
              <span className={actionLabels[reviewed[r.id] as keyof typeof actionLabels].color}>
                ✓ {r.teacher.split(" ").slice(1).join(" ")}
              </span>
            ) : (
              r.teacher.split(" ").slice(1).join(" ")
            )}
          </button>
        ))}
      </div>

      {!report ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-sm text-gray-600" role="status">
          {loadingReports
            ? "Cargando entregables…"
            : estadoFiltro === "enviado"
            ? "No hay entregables pendientes de revisión con estos filtros. Los observados reaparecen aquí cuando el docente los reenvía."
            : "No hay entregables con estos filtros."}
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="xl:col-span-2 space-y-5">
          {/* Teacher info */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-gray-800">{report.teacher}</h3>
                    <p className="text-gray-500 text-sm">{report.program}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{report.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant={report.status} />
                    {report.esReenvio && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700" style={{ fontWeight: 600 }}>
                        Reenvío · {report.numEnvios} envíos
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-400">Proyecto</p>
                    <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{report.project}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Semana</p>
                    <p className="text-sm text-gray-700 mt-0.5">{report.week}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Avance reportado</p>
                    <p className="text-sm text-gray-700 mt-0.5" style={{ fontWeight: 700 }}>
                      {report.progress}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Semestre</p>
                    <p className="text-sm text-gray-700 mt-0.5">{report.semestre ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Escuela</p>
                    <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{report.school}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{report.diasEnEspera != null ? "Esperando revisión" : "Último envío"}</p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {report.diasEnEspera != null ? (report.diasEnEspera === 0 ? "Enviado hoy" : `${report.diasEnEspera} día${report.diasEnEspera !== 1 ? "s" : ""}`) : report.ultimoEnvio ? formatDateTimeBogota(report.ultimoEnvio) : "—"}
                    </p>
                  </div>
                </div>
                {report.docente_id != null && (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/docentes/${report.docente_id}/matriz`)}
                    className="mt-4 text-xs text-blue-700 hover:underline font-medium"
                  >
                    Ver matriz completa →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Actividades Reportadas</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
                {report.activity}
              </p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{report.description}</p>
            </div>
          </div>

          {/* Evidences */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Evidencias</h3>
            {report.evidenciaExenta && (
              <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span style={{ fontWeight: 600 }}>Sin evidencia — justificación del docente: </span>
                {report.justificacionExencion || "sin texto"}
              </p>
            )}
            {report.ultimoEnvio && (
              <p className="mb-3 text-xs text-gray-500">Último envío: {formatDateTimeBogota(report.ultimoEnvio)}</p>
            )}
            <p className="mb-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-500">Evidencia que solicita el entregable: </span>
              {report.requisito.requiere
                ? report.requisito.descripcion || "Enlace a la evidencia"
                : "No se requiere cargue para este entregable."}
            </p>
            {report.links.length > 0 ? (
              <div className="space-y-2">
                {report.links.map((l) => <EnlaceEvidencia key={l.id} e={l} />)}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {report.evidenciaExenta ? "El docente no adjuntó enlaces (ver justificación)." : "Sin enlaces de evidencia registrados."}
              </p>
            )}
            {report.oldVersions.length > 0 && (
              <details className="mt-3 text-xs text-gray-600">
                <summary className="cursor-pointer select-none">Versiones anteriores ({report.oldVersions.length})</summary>
                <div className="space-y-2 mt-2">{report.oldVersions.map((l) => <EnlaceEvidencia key={l.id} e={l} anterior />)}</div>
              </details>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Los enlaces pertenecen al Drive de cada docente: si no puedes abrir alguno, usa «No tengo acceso a la evidencia» y el docente corregirá los permisos.
            </p>
            <button
              type="button"
              onClick={() => setVerHistorial((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <History className="w-4 h-4" /> {verHistorial ? "Ocultar historial" : "Ver historial y versiones"}
            </button>
            {verHistorial && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <HistorialEntregable key={`${report.id}-${report.status}-${report.numEnvios}`} ruta={`/admin/reportes-revision/${report.id}/historial`} />
              </div>
            )}
          </div>
        </div>

        {/* Actions panel */}
        <div className="space-y-5">
          {reviewed[report.id] ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
                Reporte revisado
              </p>
              <p className={`text-sm mt-1 ${actionLabels[reviewed[report.id] as keyof typeof actionLabels].color}`}>
                {actionLabels[reviewed[report.id] as keyof typeof actionLabels].label}
              </p>
            </div>
          ) : report.status !== "pending" ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
              <h3 className="text-gray-800">{report.status === "approved" ? "Entregable aprobado" : "Devuelto al docente"}</h3>
              {report.problemaAcceso && (
                <p className="flex gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> Se reportó que no se podía abrir la evidencia. Está a la espera de que el docente corrija los permisos y reenvíe.
                </p>
              )}
              {report.comentarioRevision && <p className="text-sm text-gray-600">«{report.comentarioRevision}»</p>}
              {report.revisadoEn && <p className="text-xs text-gray-400">Revisado el {formatDateTimeBogota(report.revisadoEn)}</p>}
              <p className="text-xs text-gray-500">
                {report.status === "approved"
                  ? "Un entregable aprobado no se modifica; la reapertura es un procedimiento administrativo aparte."
                  : "Volverá a aparecer entre los pendientes cuando el docente lo reenvíe."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-gray-800">Decisión del Revisor</h3>

              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Comentario (opcional)
                </label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escribe un comentario para el docente sobre este reporte..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none"
                />
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleAction("approve")}
                  disabled={savingDecision}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <CheckCircle2 className="w-4 h-4" /> {savingDecision ? "Guardando..." : "Aprobar reporte"}
                </button>
                <button
                  onClick={() => handleAction("no_access")}
                  disabled={savingDecision}
                  className="w-full flex items-center justify-center gap-2 border border-amber-400 text-amber-800 bg-amber-50 hover:bg-amber-100 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                  title="El docente deberá compartir el enlace con coordinación y reenviar; no se pierde ningún dato"
                >
                  <ShieldAlert className="w-4 h-4" /> No tengo acceso a la evidencia
                </button>
                <button
                  onClick={() => handleAction("adjust")}
                  disabled={savingDecision}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <AlertCircle className="w-4 h-4" /> Solicitar ajustes
                </button>
                <button
                  onClick={() => handleAction("reject")}
                  disabled={savingDecision}
                  className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <XCircle className="w-4 h-4" /> Rechazar reporte
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Notificar Docente</h3>
            <textarea
              rows={3}
              value={notificationMessage}
              onChange={(event) => {
                setNotificationMessage(event.target.value);
              }}
              placeholder="Mensaje personalizado para el docente..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none mb-3"
            />
            <button
              type="button"
              onClick={() => void handleNotification()}
              disabled={!report.docente_id || !notificationMessage.trim() || sendingNotification}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" /> {sendingNotification ? "Enviando…" : "Enviar notificación"}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
