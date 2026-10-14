import { Fragment, useEffect, useMemo, useState } from "react";
import React from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Info,
  Calendar,
  Pencil,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  categoryConfig,
  etiquetaSemana,
  semaforoConfig,
  type Category,
  type EstadoEntregable,
  type IndicadoresSeguimiento,
  type SemanaActual,
} from "../data/matrizConstants";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, PageLoading, Panel, ProgressBar, StatusPill, type Tone } from "../components/ds/primitives";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AppSelect } from "../components/AppSelect";
import { useConfirmationDialog } from "../components/ConfirmationDialog";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota, toDateOnly } from "../lib/date";

const ALL = "all";

export interface EntregableMatrizAdmin {
  id: number;
  numero: number;
  categoria: string;
  fase: string;
  mes: string;
  semana_numero: number;
  entregable: string;
  descripcion_evidencia: string;
  horas: number;
  fecha_inicio_calculada: string | null;
  fecha_fin_calculada: string | null;
  entregable_id: number | null;
  /** Histórico: true cuando fue enviado (en revisión o aprobado). */
  completado: boolean;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  num_envios: number;
  fecha_primer_envio: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  fecha_real_entrega: string | null;
  fecha_cargue_evidencia: string | null;
  url_evidencia: string | null;
  enlace_referencia: string | null;
  estado_revision: string | null;
  comentario_revision?: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
  iniciativa_id: number | null;
  iniciativa_titulo: string;
  iniciativa_tipo: string;
  tiene_excepcion: boolean;
  motivo_excepcion?: string | null;
  proyecto_override_id?: number | null;
}

interface IniciativaAsignada {
  id: number;
  titulo: string;
  tipo: string;
}

const EMPTY_EXCEPTION_FORM = {
  entregable_override: "",
  descripcion_evidencia_override: "",
  enlace_referencia_override: "",
  fecha_inicio_override: "",
  fecha_fin_override: "",
  proyecto_id: "",
  motivo: "",
};

interface PerfilDocente {
  nombre: string;
  apellido: string;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  programa: { nombre: string } | null;
  escuela: { nombre: string } | null;
  grupo_matriz: {
    nombre: string;
    horas_totales: number;
    num_proyectos: number;
    num_actividades: number;
    num_convenios_nuevos: number;
    num_convenios_dinamizados: number;
  } | null;
  stats?: {
    total_plantillas: number;
    completados: number;
    porcentaje_avance: number;
  };
}

interface ReabrirState {
  item: EntregableMatrizAdmin;
  motivo: string;
  destino: "enviado" | "observado";
}

type EstatusKey =
  | "aprobado"
  | "en_revision"
  | "observado"
  | "borrador"
  | "en_curso"
  | "no_iniciada"
  | "vencido";

const EXCEL_STATUS_OPTIONS: { value: EstatusKey; label: string; dot: string }[] = [
  { value: "aprobado", label: "Aprobado", dot: "bg-emerald-500" },
  { value: "en_revision", label: "En revisión", dot: "bg-purple-500" },
  { value: "observado", label: "Observado", dot: "bg-amber-400" },
  { value: "borrador", label: "Borrador", dot: "bg-blue-500" },
  { value: "en_curso", label: "En curso (semana actual)", dot: "bg-cyan-500" },
  { value: "no_iniciada", label: "No iniciado", dot: "bg-gray-400" },
  { value: "vencido", label: "Vencido (fecha límite pasada)", dot: "bg-red-500" },
];

const TONE_ESTATUS: Record<EstatusKey, Tone> = {
  aprobado: "success",
  en_revision: "violet",
  observado: "warning",
  borrador: "brand",
  en_curso: "signal",
  no_iniciada: "neutral",
  vencido: "danger",
};

/** El estado lo calcula el backend; "vencido" es una condición adicional, no un estado. */
function computeEstatus(
  item: EntregableMatrizAdmin,
  semanaActual: number | null
): { label: string; key: EstatusKey } {
  switch (item.estado) {
    case "aprobado":
      return { label: "Aprobado", key: "aprobado" };
    case "enviado":
      return { label: "En revisión", key: "en_revision" };
    case "observado":
      return { label: "Observado", key: "observado" };
    case "borrador":
      return { label: "Borrador", key: "borrador" };
    default:
      if (semanaActual != null && item.semana_numero === semanaActual) {
        return { label: "En curso", key: "en_curso" };
      }
      return { label: "No iniciado", key: "no_iniciada" };
  }
}

const TONE_SEMAFORO: Record<string, Tone> = { verde: "success", amarillo: "warning", rojo: "danger", sin_exigibles: "neutral", sin_datos: "neutral" };

function parseTextWithLinks(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s\n]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand underline break-all hover:text-blue-800"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Fechas de calendario (YYYY-MM-DD): sin pasar por la zona horaria del navegador.
const formatDate = (iso: string) => formatDateOnly(iso);

function categoryUi(c: string): Category {
  if (c in categoryConfig) return c as Category;
  return "proyecto";
}

interface MatrizStatsPayload {
  resumen: IndicadoresSeguimiento & {
    total_entregables: number;
    completados: number;
    porcentaje_semestral: number;
    porcentaje_real: number;
    porcentaje_esperado: number;
    cumplimiento_esperado: number;
    exigibles_a_fecha: number;
    brecha: number;
  };
  por_mes: {
    mes: string;
    total: number;
    completados: number;
    reportados: number;
    aprobados: number;
    vencidos: number;
    esperado: number;
    porcentaje_mensual: number;
  }[];
  semana_actual: SemanaActual;
  hoy: string;
}

export default function AdminMatrizDocente() {
  const requestConfirmation = useConfirmationDialog();
  const navigate = useNavigate();
  const { docenteId: docenteIdParam } = useParams<{ docenteId: string }>();
  const docenteId = Number(docenteIdParam);
  const currentUser = useCurrentUser();

  const [entregables, setEntregables] = useState<EntregableMatrizAdmin[]>([]);
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(null);
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [busqueda, setBusqueda] = useState("");

  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [iniciativas, setIniciativas] = useState<IniciativaAsignada[]>([]);
  const [exceptionItem, setExceptionItem] = useState<EntregableMatrizAdmin | null>(null);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION_FORM);
  const [savingException, setSavingException] = useState(false);
  const [reabrir, setReabrir] = useState<ReabrirState | null>(null);
  const [savingReabrir, setSavingReabrir] = useState(false);

  const isAdmin = currentUser?.rol === "admin";

  useEffect(() => {
    if (!isAdmin || !docenteId || Number.isNaN(docenteId)) {
      setLoading(false);
      setEntregables([]);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [resPerfil, resMatriz, resStats, resIniciativas] = await Promise.all([
          fetch(`${API_BASE}/admin/docentes/${docenteId}/perfil`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz-stats`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/iniciativas`),
        ]);
        if (!resMatriz.ok) {
          const d = await resMatriz.json().catch(() => ({}));
          throw new Error(typeof d.error === "string" ? d.error : "Error al cargar matriz");
        }
        const data = await resMatriz.json();
        setEntregables(Array.isArray(data.items) ? data.items : []);
        if (resPerfil.ok) {
          const p = await resPerfil.json();
          setPerfil({
            nombre: String(p.nombre ?? ""),
            apellido: String(p.apellido ?? ""),
            tipo_docente: p.tipo_docente != null ? String(p.tipo_docente) : null,
            regional: p.regional != null ? String(p.regional) : null,
            link_drive: p.link_drive != null ? String(p.link_drive) : null,
            programa: p.programa ?? null,
            escuela: p.escuela ?? null,
            grupo_matriz: p.grupo_matriz ?? null,
            stats: p.stats,
          });
        } else {
          setPerfil(null);
        }
        if (resStats.ok) {
          setMatrizStats(await resStats.json());
        } else {
          setMatrizStats(null);
        }
        if (resIniciativas.ok) {
          const initiativeData = await resIniciativas.json();
          setIniciativas(
            Array.isArray(initiativeData.iniciativas)
              ? initiativeData.iniciativas
              : []
          );
        } else {
          setIniciativas([]);
        }
      } catch (e) {
        console.error(e);
        notify.error("No se pudo cargar la matriz del docente. Intente de nuevo más tarde.");
        setLoadError("No se pudo cargar la matriz del docente.");
        setEntregables([]);
        setMatrizStats(null);
        setPerfil(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAdmin, docenteId, recarga]);

  const refreshMatrix = async () => {
    const [matrixResponse, statsResponse] = await Promise.all([
      fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz`),
      fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz-stats`),
    ]);
    if (!matrixResponse.ok) {
      const error = await matrixResponse.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo actualizar la matriz");
    }
    const matrixData = await matrixResponse.json();
    setEntregables(Array.isArray(matrixData.items) ? matrixData.items : []);
    if (statsResponse.ok) setMatrizStats(await statsResponse.json());
  };

  const openExceptionModal = (item: EntregableMatrizAdmin) => {
    setExceptionItem(item);
    setExceptionForm({
      entregable_override: item.entregable,
      descripcion_evidencia_override: item.descripcion_evidencia,
      enlace_referencia_override: item.enlace_referencia || "",
      fecha_inicio_override: toDateOnly(item.fecha_inicio_calculada) || "",
      fecha_fin_override: toDateOnly(item.fecha_fin_calculada) || "",
      proyecto_id: String(item.proyecto_override_id ?? item.iniciativa_id ?? ""),
      motivo: item.motivo_excepcion || "",
    });
  };

  const saveException = async () => {
    if (!exceptionItem) return;
    if (!exceptionForm.motivo.trim()) {
      notify.warning("Indica el motivo del ajuste individual.");
      return;
    }
    if (
      exceptionForm.fecha_inicio_override &&
      exceptionForm.fecha_fin_override &&
      exceptionForm.fecha_fin_override < exceptionForm.fecha_inicio_override
    ) {
      notify.warning("La fecha límite no puede ser anterior a la fecha de inicio.");
      return;
    }
    setSavingException(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/docentes/${docenteId}/plantillas/${exceptionItem.id}/excepcion`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...exceptionForm,
            proyecto_id: exceptionForm.proyecto_id
              ? Number(exceptionForm.proyecto_id)
              : null,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo guardar el ajuste individual.");
        return;
      }
      await refreshMatrix();
      setExceptionItem(null);
      notify.success("Ajuste individual guardado");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al guardar el ajuste.");
    } finally {
      setSavingException(false);
    }
  };

  const removeException = async (item: EntregableMatrizAdmin) => {
    const accepted = await requestConfirmation({
      title: "Restablecer configuración del grupo",
      description:
        "Se eliminarán las fechas, el texto y la iniciativa personalizados para este docente. El grupo general no se modificará.",
      confirmLabel: "Restablecer",
      tone: "warning",
    });
    if (!accepted) return;
    try {
      const response = await fetch(
        `${API_BASE}/admin/docentes/${docenteId}/plantillas/${item.id}/excepcion`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo restablecer el entregable.");
        return;
      }
      await refreshMatrix();
      notify.success("Se restableció la configuración del grupo");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al restablecer.");
    }
  };

  const confirmarReabrir = async () => {
    if (!reabrir || !reabrir.item.entregable_id) return;
    if (reabrir.motivo.trim().length < 10) {
      notify.warning("El motivo de la reapertura debe tener al menos 10 caracteres.");
      return;
    }
    setSavingReabrir(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/reportes-revision/${reabrir.item.entregable_id}/reabrir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: reabrir.motivo.trim(), destino: reabrir.destino }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo reabrir el entregable.");
        return;
      }
      await refreshMatrix();
      setReabrir(null);
      notify.success("Entregable reabierto: volvió a revisión");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al reabrir el entregable.");
    } finally {
      setSavingReabrir(false);
    }
  };

  const resumen = matrizStats?.resumen ?? null;
  const semana = matrizStats?.semana_actual ?? null;
  const semanaNumero = semana?.numero ?? null;
  // Todos los indicadores salen del backend (misma fórmula en todas las pantallas).
  const pctReportado = Math.round(resumen?.pct_reportado ?? perfil?.stats?.porcentaje_avance ?? 0);
  const pctAprobado = Math.round(resumen?.pct_aprobado ?? 0);
  const totalTpl = resumen?.total ?? perfil?.stats?.total_plantillas ?? 0;
  const reportadosTpl = resumen?.reportados ?? perfil?.stats?.completados ?? 0;
  const expectedPct = Math.round(resumen?.pct_esperado ?? 0);
  const vencidosCount = resumen?.vencidos ?? 0;
  const semaforoUi = resumen ? semaforoConfig[resumen.semaforo] : null;

  const availableMonths = useMemo(
    () => [...new Set(entregables.map((item) => item.mes.trim()).filter(Boolean))],
    [entregables]
  );

  const vencidosPorMes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of availableMonths) {
      map[m] = entregables.filter((e) => e.mes === m && e.vencido).length;
    }
    return map;
  }, [availableMonths, entregables]);

  const filtered = useMemo(() => {
    return entregables.filter((e) => {
      const key = computeEstatus(e, semanaNumero).key;
      const coincideEstado =
        filterExcelStatus === ALL ||
        (filterExcelStatus === "vencido" ? e.vencido : key === filterExcelStatus);
      const t = busqueda.trim().toLowerCase();
      const coincideTexto =
        !t || `${e.entregable} ${e.iniciativa_titulo} ${e.numero ?? ""} ${e.fase}`.toLowerCase().includes(t);
      return (
        (filterMonth === ALL || e.mes === filterMonth) &&
        (filterCategory === ALL || e.categoria === filterCategory) &&
        coincideEstado &&
        coincideTexto
      );
    });
  }, [entregables, filterMonth, filterCategory, filterExcelStatus, semanaNumero, busqueda]);

  const groupedByMonthPhase = useMemo(() => {
    const months = filterMonth === ALL ? availableMonths : [filterMonth];
    const blocks: {
      month: string;
      items: EntregableMatrizAdmin[];
      phases: { phase: string; items: EntregableMatrizAdmin[] }[];
    }[] = [];

    for (const month of months) {
      const items = filtered.filter((e) => e.mes === month);
      if (items.length === 0) continue;
      const phaseMap = new Map<string, EntregableMatrizAdmin[]>();
      for (const e of items) {
        const ph = (e.fase && e.fase.trim()) || "Sin fase";
        if (!phaseMap.has(ph)) phaseMap.set(ph, []);
        phaseMap.get(ph)!.push(e);
      }
      const phases = Array.from(phaseMap.entries()).map(([phase, phItems]) => ({
        phase,
        items: [...phItems].sort(
          (a, b) =>
            a.semana_numero - b.semana_numero ||
            (a.numero ?? 0) - (b.numero ?? 0) ||
            a.entregable.localeCompare(b.entregable)
        ),
      }));
      blocks.push({ month, items, phases });
    }
    return blocks;
  }, [availableMonths, filtered, filterMonth]);

  const phaseKey = (month: string, phase: string) => `${month}||${phase}`;
  const toggleCollapse = (month: string) => {
    setCollapsed((prev) => ({ ...prev, [month]: !prev[month] }));
  };
  const togglePhaseCollapse = (month: string, phase: string) => {
    const k = phaseKey(month, phase);
    setCollapsedPhase((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const hayFiltros = filterMonth !== ALL || filterCategory !== ALL || filterExcelStatus !== ALL || busqueda.trim() !== "";
  const limpiarFiltros = () => {
    setFilterMonth(ALL);
    setFilterCategory(ALL);
    setFilterExcelStatus(ALL);
    setBusqueda("");
  };
  const COLUMNAS = 8;
  const tonoSemaforo: Tone = resumen?.semaforo ? TONE_SEMAFORO[resumen.semaforo] ?? "neutral" : "neutral";

  if (!isAdmin) {
    return (
      <Page>
        <InlineAlert>No autorizado. Solo los administradores pueden ver esta pantalla.</InlineAlert>
      </Page>
    );
  }

  if (!docenteId || Number.isNaN(docenteId)) {
    return (
      <Page>
        <EmptyState title="Docente no válido" action={<button type="button" className="ds-btn ds-btn-secondary" onClick={() => navigate("/admin")}>Volver al panel</button>}>
          El identificador del docente en la dirección no es correcto.
        </EmptyState>
      </Page>
    );
  }

  if (loading) return <PageLoading label="Cargando matriz del docente…" />;

  const nombreDocente = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : "Docente";

  /** Detalle expandido: descripción, fechas, evidencias y acciones administrativas. */
  const renderDetalle = (e: EntregableMatrizAdmin, estatus: { label: string }, evidencias: string[]) => {
    const progInicio = e.fecha_inicio_calculada;
    const progFin = e.fecha_fin_calculada;
    return (
      <div className="grid gap-4 lg:grid-cols-5" onClick={(ev) => ev.stopPropagation()}>
        <div className="space-y-3 lg:col-span-3">
          <div>
            <p className="ds-label">Descripción de la evidencia</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted">
              {e.descripcion_evidencia ? parseTextWithLinks(e.descripcion_evidencia) : e.entregable}
            </p>
            {e.enlace_referencia && (
              <a href={e.enlace_referencia} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand underline-offset-2 hover:underline" style={{ fontWeight: 600 }}>
                <ExternalLink className="h-3.5 w-3.5" /> Abrir recurso o formulario de referencia
              </a>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <div><dt className="text-text-subtle">Fecha programada</dt><dd className="text-text">{progInicio && progFin ? `${formatDate(progInicio)} – ${formatDate(progFin)}` : "—"}</dd></div>
            <div><dt className="text-text-subtle">Fecha real</dt><dd className="text-text">{e.fecha_real_entrega ? formatDate(e.fecha_real_entrega) : "—"}</dd></div>
            <div>
              <dt className="text-text-subtle">Primer envío</dt>
              <dd className="text-text">
                {e.fecha_primer_envio ? formatDate(e.fecha_primer_envio) : "—"}
                {e.entrega_tardia && <span className="block text-red-700">Posterior a la fecha límite</span>}
              </dd>
            </div>
            {e.fecha_cargue_evidencia && <div><dt className="text-text-subtle">Último envío (registro automático)</dt><dd className="text-text">{formatDateTimeBogota(e.fecha_cargue_evidencia)}</dd></div>}
            {e.num_envios > 1 && <div><dt className="text-text-subtle">Envíos</dt><dd className="text-text">{e.num_envios} (incluye reenvíos tras observaciones)</dd></div>}
            <div>
              <dt className="text-text-subtle">Estado</dt>
              <dd className="text-text">{estatus.label}{e.vencido ? " · vencido" : ""}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-surface p-3.5 lg:col-span-2">
          {e.evidencia_exenta && e.justificacion_exencion && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              <span style={{ fontWeight: 600 }}>Sin evidencia, justificación del docente: </span>
              {e.justificacion_exencion}
            </p>
          )}
          {e.comentario_revision ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              <span style={{ fontWeight: 600 }}>Comentario de revisión: </span>
              {e.comentario_revision}
            </p>
          ) : null}
          {e.tiene_excepcion && e.motivo_excepcion && (
            <p className="text-xs text-text-muted">
              <span className="text-text" style={{ fontWeight: 600 }}>Motivo del ajuste individual: </span>
              {e.motivo_excepcion}
            </p>
          )}
          <div>
            <p className="ds-label">Evidencias</p>
            {evidencias.length === 0 ? (
              <p className="text-xs text-text-subtle">Aún no hay evidencia cargada.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {evidencias.map((url, i) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-brand underline-offset-2 hover:underline">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      Abrir evidencia{evidencias.length > 1 ? ` ${i + 1}` : ""}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {e.estado === "aprobado" && e.entregable_id != null && (
              <button type="button" onClick={() => setReabrir({ item: e, motivo: "", destino: "enviado" })} className="ds-btn ds-btn-secondary ds-btn-sm !text-red-700">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reabrir
              </button>
            )}
            <button type="button" onClick={() => openExceptionModal(e)} className="ds-btn ds-btn-primary ds-btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {e.tiene_excepcion ? "Editar excepción" : "Crear excepción"}
            </button>
            {e.tiene_excepcion && (
              <button type="button" onClick={() => void removeException(e)} className="ds-btn ds-btn-secondary ds-btn-sm">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Restablecer grupo
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Page wide>
      <div>
        <button type="button" onClick={() => navigate(-1)} className="ds-btn ds-btn-ghost ds-btn-sm -ml-2 mb-1">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </button>
        <PageHeader
          title={`Matriz de seguimiento · ${nombreDocente}`}
          description={`${entregables.length} entregables programados · ${etiquetaSemana(semana)}`}
          meta={
            <>
              {semaforoUi && <StatusPill tone={tonoSemaforo}>Riesgo: {semaforoUi.label}</StatusPill>}
              <StatusPill tone="success" dot={false}>{pctAprobado}% aprobado</StatusPill>
              <StatusPill tone="brand" dot={false}>{pctReportado}% reportado</StatusPill>
            </>
          }
        />
      </div>

      {loadError && (
        <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>}>
          {loadError}
        </InlineAlert>
      )}

      {perfil && (
        <div className="ds-panel flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-white" aria-hidden>
              {(perfil.nombre[0] ?? "?").toUpperCase()}{(perfil.apellido[0] ?? "").toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-text" style={{ fontWeight: 600 }}>{perfil.nombre} {perfil.apellido}</p>
              <p className="truncate text-xs text-text-subtle">{perfil.programa?.nombre ?? "—"}{perfil.regional ? ` · ${perfil.regional}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <StatusPill tone="neutral" dot={false}>{perfil.grupo_matriz?.horas_totales != null ? perfil.grupo_matriz.horas_totales : "—"} h de Proyección Social</StatusPill>
            {perfil.tipo_docente && <StatusPill tone={perfil.tipo_docente === "NUEVO" ? "brand" : "neutral"} dot={false}>{perfil.tipo_docente}</StatusPill>}
            {perfil.grupo_matriz && (
              <>
                <span className="hidden text-text-subtle md:inline">Grupo {perfil.grupo_matriz.nombre}:</span>
                {[
                  { l: "proyectos", v: perfil.grupo_matriz.num_proyectos },
                  { l: "actividades", v: perfil.grupo_matriz.num_actividades },
                  { l: "conv. nuevos", v: perfil.grupo_matriz.num_convenios_nuevos },
                  { l: "conv. dinamizados", v: perfil.grupo_matriz.num_convenios_dinamizados },
                ]
                  .filter((i) => i.v > 0)
                  .map((i) => (
                    <StatusPill key={i.l} tone="violet" dot={false}>{i.v} {i.l}</StatusPill>
                  ))}
              </>
            )}
          </div>
          {perfil.link_drive && (
            <a href={perfil.link_drive} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-ghost ds-btn-sm ml-auto !text-brand">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Carpeta de Drive
            </a>
          )}
        </div>
      )}

      <section aria-label="Indicadores de la matriz" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Avance reportado" tone="brand" value={`${pctReportado}%`} progress={pctReportado} marker={expectedPct} hint={`${reportadosTpl} / ${totalTpl} enviados o aprobados`} />
        <Kpi label="Avance aprobado" tone="success" value={`${pctAprobado}%`} progress={pctAprobado} marker={expectedPct} hint={`${resumen?.aprobados ?? 0} / ${totalTpl} aprobados`} />
        <Kpi label="Avance esperado a hoy" tone="neutral" value={`${expectedPct}%`} hint={`${resumen?.esperado ?? 0} entregables con fecha límite hasta ${matrizStats?.hoy ? formatDate(matrizStats.hoy) : "hoy"}`} />
        <Kpi
          label="Brecha de cumplimiento"
          tone={(resumen?.brecha_entregables ?? 0) < 0 ? "danger" : "success"}
          value={`${(resumen?.brecha_entregables ?? 0) > 0 ? "+" : ""}${resumen?.brecha_entregables ?? 0}`}
          hint={`Aprobados − esperados · cumplimiento exigible ${resumen?.cumplimiento_exigible != null ? `${Math.round(resumen.cumplimiento_exigible)}%` : "—"}`}
        />
        <Kpi
          className="col-span-2 lg:col-span-1"
          label="Vencidos"
          tone={vencidosCount > 0 ? "danger" : "success"}
          value={vencidosCount}
          hint={`Horas: ${resumen?.horas_programadas ?? 0} programadas · ${resumen?.horas_reportadas ?? 0} reportadas · ${resumen?.horas_aprobadas ?? 0} aprobadas`}
        />
      </section>

      {resumen && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Resumen de estados">
          <StatusPill tone="violet">{resumen.enviados_pendientes_revision} en revisión</StatusPill>
          <StatusPill tone="warning">{resumen.observados} observados</StatusPill>
          <StatusPill tone="brand">{resumen.borradores} borradores</StatusPill>
          <StatusPill tone="danger">{vencidosCount} vencidos</StatusPill>
        </div>
      )}

      {matrizStats && (
        <Panel title="Avance por mes" bodyClassName="">
          <div className="overflow-x-auto">
            <table className="ds-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Reportados</th>
                  <th className="text-right">Aprobados</th>
                  <th className="text-right">Esperados</th>
                  <th className="text-right">Vencidos</th>
                  <th>% reportado</th>
                </tr>
              </thead>
              <tbody>
                {matrizStats.por_mes.map((row) => {
                  const vac = vencidosPorMes[row.mes] ?? 0;
                  const pct = row.total > 0 ? Math.round(row.porcentaje_mensual) : 0;
                  const venc = row.vencidos ?? vac;
                  return (
                    <tr key={row.mes}>
                      <td className="text-text" style={{ fontWeight: 600 }}>{row.mes}</td>
                      <td className="text-right tabular-nums text-text-muted">{row.total}</td>
                      <td className="text-right tabular-nums text-text-muted">{row.reportados ?? row.completados}</td>
                      <td className="text-right tabular-nums text-text-muted">{row.aprobados ?? 0}</td>
                      <td className="text-right tabular-nums text-text-muted">{row.esperado ?? 0}</td>
                      <td className={`text-right tabular-nums ${venc > 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: venc > 0 ? 600 : 400 }}>{venc}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={pct} tone={row.total === 0 ? "neutral" : pct >= 80 ? "success" : pct >= 40 ? "warning" : "danger"} className="w-28" label={`${row.mes}: ${pct}% reportado`} />
                          <span className="w-10 text-right text-xs tabular-nums text-text" style={{ fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="ds-panel">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar entregable, iniciativa o número" aria-label="Buscar en la matriz" className="ds-input !pl-9" />
          </div>
          <div className="w-40"><AppSelect value={filterMonth} onValueChange={setFilterMonth} options={[{ value: ALL, label: "Todos los meses" }, ...availableMonths.map((m) => ({ value: m, label: m }))]} /></div>
          <div className="w-52"><AppSelect value={filterCategory} onValueChange={setFilterCategory} options={[{ value: ALL, label: "Todas las categorías" }, ...Object.entries(categoryConfig).map(([key, cfg]) => ({ value: key, label: cfg.label }))]} /></div>
          <div className="w-44"><AppSelect value={filterExcelStatus} onValueChange={setFilterExcelStatus} options={[{ value: ALL, label: "Todos los estados" }, ...EXCEL_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))]} /></div>
          {hayFiltros && <button type="button" onClick={limpiarFiltros} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">Limpiar filtros</button>}
          <button type="button" onClick={() => setShowLegend(!showLegend)} aria-expanded={showLegend} className="ds-btn ds-btn-ghost ds-btn-sm">
            <Info className="h-3.5 w-3.5" aria-hidden /> Leyenda
          </button>
          <span className="ml-auto text-xs tabular-nums text-text-subtle">{filtered.length} entregable{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {showLegend && (
          <div className="grid gap-4 border-b border-line bg-surface-2 px-4 py-3 sm:grid-cols-2">
            <div>
              <p className="ds-label">Categorías de entregable</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <li key={key} className="flex items-center gap-2 text-xs text-text-muted"><span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${cfg.dot}`} />{cfg.label}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="ds-label">Estados de seguimiento (vencido se suma al estado cuando pasó la fecha límite)</p>
              <ul className="grid gap-1">
                {EXCEL_STATUS_OPTIONS.map((opt) => (
                  <li key={opt.value} className="flex items-center gap-2 text-xs text-text-muted"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${opt.dot}`} />{opt.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {groupedByMonthPhase.length === 0 ? (
          <EmptyState icon={Search} title="Ningún entregable coincide con los filtros" action={hayFiltros ? <button type="button" onClick={limpiarFiltros} className="ds-btn ds-btn-secondary ds-btn-sm">Limpiar filtros</button> : undefined}>
            {hayFiltros ? "Prueba con otro mes, categoría o estado." : "Este docente aún no tiene entregables en su matriz."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th className="w-14">N.º</th>
                  <th>Entregable</th>
                  <th className="hidden md:table-cell">Periodo de entrega</th>
                  <th className="hidden text-right lg:table-cell">Horas</th>
                  <th>Estado</th>
                  <th className="hidden sm:table-cell">Evidencia</th>
                  <th className="w-10"><span className="sr-only">Ajustar</span></th>
                  <th className="w-10"><span className="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                {groupedByMonthPhase.map(({ month, items, phases }) => {
                  const mDone = items.filter((e) => e.completado).length; // reportados
                  const mTotal = items.length;
                  const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                  return (
                    <Fragment key={month}>
                      <tr>
                        <td colSpan={COLUMNAS} className="!border-b !border-line !bg-gray-100/70 !p-0">
                          <button type="button" onClick={() => toggleCollapse(month)} aria-expanded={!collapsed[month]} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                            {collapsed[month] ? <ChevronRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />}
                            <Calendar className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                            <span className="text-sm text-text" style={{ fontWeight: 650 }}>{month}</span>
                            <span className="text-xs text-text-subtle">Reportados {mDone}/{mTotal}{mTotal ? ` (${mPct}%)` : ""}</span>
                            <ProgressBar value={mPct} tone={mPct >= 80 ? "success" : mPct >= 40 ? "warning" : "danger"} className="hidden max-w-[10rem] flex-1 sm:block" label={`${month}: ${mPct}% reportado`} />
                          </button>
                        </td>
                      </tr>
                      {!collapsed[month] &&
                        phases.map(({ phase, items: phaseItems }) => {
                          const pk = phaseKey(month, phase);
                          const cerrada = collapsedPhase[pk];
                          return (
                            <Fragment key={pk}>
                              <tr>
                                <td colSpan={COLUMNAS} className="!bg-surface-2 !p-0">
                                  <button type="button" onClick={() => togglePhaseCollapse(month, phase)} aria-expanded={!cerrada} className="flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left">
                                    {cerrada ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-subtle" aria-hidden />}
                                    <span className="flex-1 truncate text-xs text-text-muted" style={{ fontWeight: 600 }}>{phase}</span>
                                    <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-subtle">{phaseItems.length} {phaseItems.length === 1 ? "entregable" : "entregables"}</span>
                                  </button>
                                </td>
                              </tr>
                              {!cerrada &&
                                phaseItems.map((e) => {
                                  const estatus = computeEstatus(e, semanaNumero);
                                  const catCfg = categoryConfig[categoryUi(e.categoria)];
                                  const abierto = expandedRow === e.id;
                                  const evidencias = e.evidencias && e.evidencias.length > 0 ? e.evidencias : e.url_evidencia ? [e.url_evidencia] : [];
                                  const alternar = () => setExpandedRow(abierto ? null : e.id);
                                  return (
                                    <Fragment key={e.id}>
                                      <tr
                                        id={`entregable-${e.id}`}
                                        tabIndex={0}
                                        aria-expanded={abierto}
                                        onClick={alternar}
                                        onKeyDown={(ev) => {
                                          if (ev.target !== ev.currentTarget) return;
                                          if (ev.key === "Enter" || ev.key === " ") {
                                            ev.preventDefault();
                                            alternar();
                                          }
                                        }}
                                        className={`cursor-pointer ${abierto ? "[&>td]:bg-surface-2" : ""}`}
                                      >
                                        <td className="tabular-nums text-text-subtle">{e.numero != null && e.numero !== 0 ? `#${e.numero}` : `S${e.semana_numero}`}</td>
                                        <td className="max-w-[520px]">
                                          <p className="line-clamp-2 text-text" style={{ fontWeight: 600 }}>{e.entregable}</p>
                                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
                                            <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-sm ${catCfg.dot}`} aria-hidden />{catCfg.label}</span>
                                            <span className="truncate">{e.iniciativa_titulo}</span>
                                            {e.tiene_excepcion && <StatusPill tone="warning" dot={false}>Excepción individual</StatusPill>}
                                            <span className="md:hidden">S{e.semana_numero} · {e.fecha_fin_calculada ? `límite ${formatDate(e.fecha_fin_calculada)}` : "sin fecha"} · {e.horas} h</span>
                                          </p>
                                          {e.estado === "observado" && e.comentario_revision && (
                                            <p className="mt-1 line-clamp-1 text-xs text-amber-800">Observación: {e.comentario_revision}</p>
                                          )}
                                        </td>
                                        <td className="hidden whitespace-nowrap text-text-muted md:table-cell">
                                          <span className="tabular-nums">S{e.semana_numero}</span>
                                          <span className="mx-1.5 text-text-subtle">·</span>
                                          {e.fecha_inicio_calculada && e.fecha_fin_calculada ? `${formatDate(e.fecha_inicio_calculada)} → ${formatDate(e.fecha_fin_calculada)}` : "—"}
                                        </td>
                                        <td className="hidden text-right tabular-nums text-text-muted lg:table-cell">{e.horas} h</td>
                                        <td>
                                          <span className="inline-flex flex-wrap items-center gap-1">
                                            <StatusPill tone={TONE_ESTATUS[estatus.key]}>{estatus.label}</StatusPill>
                                            {e.vencido && <StatusPill tone="danger" dot={false}>Vencido</StatusPill>}
                                          </span>
                                        </td>
                                        <td className="hidden sm:table-cell" onClick={(ev) => ev.stopPropagation()}>
                                          {evidencias[0] ? (
                                            <a href={evidencias[0]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline" aria-label="Abrir evidencia en una pestaña nueva">
                                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                              {evidencias.length > 1 ? `${evidencias.length} enlaces` : "Abrir"}
                                            </a>
                                          ) : (
                                            <span className="text-xs text-text-subtle">—</span>
                                          )}
                                        </td>
                                        <td onClick={(ev) => ev.stopPropagation()}>
                                          <button
                                            type="button"
                                            onClick={() => openExceptionModal(e)}
                                            className="ds-btn ds-btn-ghost ds-btn-sm !px-1.5"
                                            aria-label={e.tiene_excepcion ? `Editar excepción del entregable ${e.numero ?? e.semana_numero}` : `Crear excepción del entregable ${e.numero ?? e.semana_numero}`}
                                            title={e.tiene_excepcion ? "Editar excepción" : "Crear excepción"}
                                          >
                                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                                          </button>
                                        </td>
                                        <td className="text-text-subtle">{abierto ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}</td>
                                      </tr>
                                      {abierto && (
                                        <tr>
                                          <td colSpan={COLUMNAS} className="!bg-surface-2 !px-4 !py-4">
                                            {renderDetalle(e, estatus, evidencias)}
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!reabrir} onOpenChange={(open) => { if (!open && !savingReabrir) setReabrir(null); }}>
        <DialogContent className="rounded-xl border-line bg-surface sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reabrir entregable aprobado</DialogTitle>
            <DialogDescription>
              {reabrir?.item.entregable}. Es un procedimiento controlado: queda registrado con tu usuario y el motivo.
            </DialogDescription>
          </DialogHeader>
          {reabrir && (
            <div className="space-y-3">
              <div>
                <label className="ds-label" htmlFor="reabrir-destino">Volver a <span className="text-red-700">*</span></label>
                <div id="reabrir-destino">
                  <AppSelect
                    value={reabrir.destino}
                    onValueChange={(value) =>
                      setReabrir((r) => (r ? { ...r, destino: value === "observado" ? "observado" : "enviado" } : r))
                    }
                    className="w-full"
                    options={[
                      { value: "enviado", label: "En revisión (pendiente de nueva decisión)" },
                      { value: "observado", label: "Observado (el docente debe corregir)" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="ds-label" htmlFor="reabrir-motivo">Motivo (mínimo 10 caracteres) <span className="text-red-700">*</span></label>
                <textarea
                  id="reabrir-motivo"
                  rows={3}
                  value={reabrir.motivo}
                  onChange={(event) => setReabrir((r) => (r ? { ...r, motivo: event.target.value } : r))}
                  className="ds-input"
                  placeholder="Ej.: el acta cargada corresponde a otra semana"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setReabrir(null)} disabled={savingReabrir} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void confirmarReabrir()} disabled={savingReabrir} className="ds-btn ds-btn-danger">
              {savingReabrir ? "Reabriendo…" : "Reabrir entregable"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!exceptionItem} onOpenChange={(open) => { if (!open && !savingException) setExceptionItem(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-line bg-surface sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ajuste individual del entregable</DialogTitle>
            <DialogDescription>
              Solo afectará a {nombreDocente}; la plantilla del grupo permanecerá intacta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-entregable">Entregable</label>
              <textarea
                id="exc-entregable"
                rows={3}
                value={exceptionForm.entregable_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, entregable_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-descripcion">Descripción de la evidencia</label>
              <textarea
                id="exc-descripcion"
                rows={4}
                value={exceptionForm.descripcion_evidencia_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, descripcion_evidencia_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-enlace">Enlace o formulario de referencia</label>
              <input
                id="exc-enlace"
                type="url"
                placeholder="https://"
                value={exceptionForm.enlace_referencia_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, enlace_referencia_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="exc-inicio">Fecha exacta de inicio</label>
              <input
                id="exc-inicio"
                type="date"
                value={exceptionForm.fecha_inicio_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, fecha_inicio_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="exc-fin">Fecha límite exacta</label>
              <input
                id="exc-fin"
                type="date"
                value={exceptionForm.fecha_fin_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, fecha_fin_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-iniciativa">Iniciativa asociada</label>
              <div id="exc-iniciativa">
                <AppSelect
                  value={exceptionForm.proyecto_id || "__inherit__"}
                  onValueChange={(value) =>
                    setExceptionForm((form) => ({ ...form, proyecto_id: value === "__inherit__" ? "" : value }))
                  }
                  className="w-full"
                  options={[
                    { value: "__inherit__", label: "Inferir desde el entregable" },
                    ...iniciativas.map((initiative) => ({
                      value: String(initiative.id),
                      label: `${initiative.titulo} · ${initiative.tipo}`,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-motivo">Motivo del ajuste <span className="text-red-700">*</span></label>
              <textarea
                id="exc-motivo"
                rows={2}
                value={exceptionForm.motivo}
                onChange={(event) => setExceptionForm((form) => ({ ...form, motivo: event.target.value }))}
                placeholder="Ej.: ampliación aprobada por convenio gubernamental"
                className="ds-input"
              />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setExceptionItem(null)} disabled={savingException} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void saveException()} disabled={savingException} className="ds-btn ds-btn-primary">
              {savingException ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
