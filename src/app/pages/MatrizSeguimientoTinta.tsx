import { Fragment, useState, useMemo, useEffect, useCallback } from "react";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Info,
  Calendar,
  Clock,
  TrendingUp,
  FileText,
  Loader2,
} from "lucide-react";
import {
  isDeliverableCompleted,
  categoryConfig,
  etiquetaSemana,
  semaforoConfig,
  type Category,
  type EstadoEntregable,
  type IndicadoresSeguimiento,
  type SemanaActual,
} from "../data/matrizConstants";
import { EmptyState, Kpi, Page, PageHeader, PageLoading, ProgressBar, StatusPill, type Tone } from "../components/ds/primitives";
import { AvisoAcceso } from "../components/EnlaceEvidencia";
import { AppSelect } from "../components/AppSelect";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota } from "../lib/date";

const ALL = "all";

export interface EntregableMatriz {
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
  /** Histórico: true cuando el entregable fue enviado (en revisión o aprobado). */
  completado: boolean;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  requiere_evidencia: boolean;
  tipo_evidencia: "drive" | "formulario" | "enlace" | "ninguna";
  num_envios: number;
  fecha_primer_envio: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  comentario_revision: string | null;
  fecha_real_entrega: string | null;
  fecha_cargue_evidencia: string | null;
  url_evidencia: string | null;
  enlace_referencia: string | null;
  estado_revision: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
  iniciativa_id: number | null;
  iniciativa_titulo: string;
  iniciativa_tipo: string;
  tiene_excepcion: boolean;
  motivo_excepcion?: string | null;
}

interface IniciativaCandidata {
  id: number;
  titulo: string | null;
  tipo: string | null;
}

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
}

type EstatusKey =
  | "aprobado"
  | "en_revision"
  | "observado"
  | "borrador"
  | "en_curso"
  | "no_iniciada"
  | "vencido";

const ESTATUS_OPTIONS: { value: EstatusKey; label: string; dot: string }[] = [
  { value: "aprobado", label: "Aprobado", dot: "bg-green-500" },
  { value: "en_revision", label: "En revisión", dot: "bg-blue-500" },
  { value: "observado", label: "Observado", dot: "bg-amber-500" },
  { value: "borrador", label: "Borrador", dot: "bg-slate-400" },
  { value: "en_curso", label: "En curso (semana actual)", dot: "bg-sky-500" },
  { value: "no_iniciada", label: "No iniciado", dot: "bg-gray-400" },
  { value: "vencido", label: "Vencido (fecha límite pasada)", dot: "bg-red-500" },
];

/** El estado lo calcula el backend; «vencido» es una condición adicional, no un estado. */
function computeEstatus(
  item: EntregableMatriz,
  semanaActual: number | null
): { label: string; key: EstatusKey; color: string; bg: string; dot: string; vencido: boolean } {
  const base = (key: EstatusKey, label: string, color: string, bg: string, dot: string) => ({
    key,
    label,
    color,
    bg,
    dot,
    vencido: item.vencido,
  });
  switch (item.estado) {
    case "aprobado":
      return base("aprobado", "Aprobado", "text-green-700", "bg-green-100", "bg-green-500");
    case "enviado":
      return base("en_revision", "En revisión", "text-blue-700", "bg-blue-100", "bg-blue-500");
    case "observado":
      return base("observado", "Observado", "text-amber-800", "bg-amber-100", "bg-amber-500");
    case "borrador":
      return base("borrador", "Borrador", "text-slate-700", "bg-slate-100", "bg-slate-400");
    default:
      if (semanaActual != null && item.semana_numero === semanaActual) {
        return base("en_curso", "En curso", "text-sky-700", "bg-sky-100", "bg-sky-500");
      }
      return base("no_iniciada", "No iniciado", "text-gray-600", "bg-gray-100", "bg-gray-400");
  }
}

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
          className="text-blue-600 underline break-all hover:text-blue-800"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface MatrizStatsPayload {
  resumen: IndicadoresSeguimiento;
  por_mes: {
    mes: string;
    total: number;
    reportados: number;
    aprobados: number;
    esperado: number;
    observados: number;
    vencidos: number;
    pct_reportado: number;
    pct_aprobado: number;
    pct_esperado: number;
  }[];
  por_semana: {
    semana_numero: number;
    mes: string | null;
    total: number;
    reportados: number;
    aprobados: number;
  }[];
  semana_actual: SemanaActual;
  hoy: string;
}

function categoryUi(c: string): Category {
  if (c in categoryConfig) return c as Category;
  return "proyecto";
}

// Fechas de calendario (YYYY-MM-DD): se formatean sin pasar por la zona horaria del navegador.
const formatDate = (iso: string | null | undefined) => formatDateOnly(iso);

function semaphoreClasses(pct: number, emptyMonth: boolean) {
  if (emptyMonth) {
    return {
      card: "border-gray-100 bg-gray-50",
      label: "text-gray-500",
      pct: "text-gray-400",
      barTrack: "bg-gray-100",
      barFill: "bg-gray-300",
    };
  }
  if (pct <= 39) {
    return {
      card: "border-red-200 bg-red-100",
      label: "text-red-800",
      pct: "text-red-700",
      barTrack: "bg-red-200/80",
      barFill: "bg-red-600",
    };
  }
  if (pct <= 79) {
    return {
      card: "border-yellow-200 bg-yellow-100",
      label: "text-yellow-800",
      pct: "text-yellow-700",
      barTrack: "bg-yellow-200/80",
      barFill: "bg-yellow-500",
    };
  }
  return {
    card: "border-green-200 bg-green-100",
    label: "text-green-800",
    pct: "text-green-700",
    barTrack: "bg-green-200/80",
    barFill: "bg-green-600",
  };
}

export default function MatrizSeguimiento() {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationTemplateId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("plantilla"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const currentUser = useCurrentUser();

  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>(ALL);
  const [busqueda, setBusqueda] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  const [entregables, setEntregables] = useState<EntregableMatriz[]>([]);
  const [resumen, setResumen] = useState<IndicadoresSeguimiento | null>(null);
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(
    null
  );
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [savingPlantilla, setSavingPlantilla] = useState<Record<number, boolean>>(
    {}
  );
  // Formulario de envío por entregable (clave = id de plantilla)
  const [evidenciaInput, setEvidenciaInput] = useState<Record<number, string>>({});
  const [sinEvidencia, setSinEvidencia] = useState<Record<number, boolean>>({});
  const [justificacionInput, setJustificacionInput] = useState<Record<number, string>>({});
  const [candidatos, setCandidatos] = useState<Record<number, IniciativaCandidata[]>>({});
  const [iniciativaElegida, setIniciativaElegida] = useState<Record<number, number>>({});
  const [avisos, setAvisos] = useState<Record<number, string>>({});

  const userId = currentUser?.id ?? null;

  const cargar = useCallback(async () => {
    if (!userId) {
      setEntregables([]);
      setMatrizStats(null);
      setResumen(null);
      setLoadingMatrix(false);
      return;
    }
    try {
      const [resPerfil, resMatriz, resStats] = await Promise.all([
        fetch(`${API_BASE}/docente/${userId}/perfil`),
        fetch(`${API_BASE}/docente/${userId}/matriz`),
        fetch(`${API_BASE}/docente/${userId}/matriz-stats`),
      ]);
      if (!resMatriz.ok) throw new Error("Error al cargar matriz");
      const data = await resMatriz.json();
      setEntregables(Array.isArray(data.items) ? data.items : []);
      setResumen(data.resumen ?? null);
      setSemana(data.semana_actual ?? null);
      setHoy(typeof data.hoy === "string" ? data.hoy : null);
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
        });
      } else {
        setPerfil(null);
      }
      setMatrizStats(resStats.ok ? await resStats.json() : null);
    } catch (err) {
      console.error(err);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      setEntregables([]);
      setMatrizStats(null);
      setResumen(null);
      setPerfil(null);
    } finally {
      setLoadingMatrix(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoadingMatrix(true);
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (
      loadingMatrix ||
      !notificationTemplateId ||
      !entregables.some((item) => item.id === notificationTemplateId)
    ) {
      return;
    }
    setFilterMonth(ALL);
    setFilterCategory(ALL);
    setFilterExcelStatus(ALL);
    setCollapsed({});
    setCollapsedPhase({});
    setExpandedRow(notificationTemplateId);
    const timer = window.setTimeout(() => {
      document
        .getElementById(`entregable-${notificationTemplateId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [entregables, loadingMatrix, notificationTemplateId]);

  const setAviso = (id: number, msg: string | null) =>
    setAvisos((a) => {
      const next = { ...a };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const postCompletar = async (item: EntregableMatriz, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/docente/${userId}/matriz/${item.id}/completar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      codigo?: string;
      semana_numero?: number;
      candidatos?: IniciativaCandidata[];
    };
    return { res, data };
  };

  // Enviar (o reenviar un observado) para revisión. Las validaciones las aplica el backend.
  // La fecha de entrega nunca se envía: la registra el servidor.
  const handleEnviar = async (item: EntregableMatriz) => {
    if (!userId) return;
    const urls = (evidenciaInput[item.id] ?? "")
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const justificacion = sinEvidencia[item.id] ? (justificacionInput[item.id] ?? "").trim() : "";
    const yaTieneEvidencia = (item.evidencias?.length ?? 0) > 0 || !!item.url_evidencia;
    if (item.requiere_evidencia && urls.length === 0 && !yaTieneEvidencia && !justificacion) {
      setAviso(item.id, "Agrega el enlace de la evidencia o marca «No aplica evidencia» y justifícalo.");
      return;
    }
    setAviso(item.id, null);
    setSavingPlantilla((s) => ({ ...s, [item.id]: true }));
    try {
      const { res, data } = await postCompletar(item, {
        completado: true,
        ...(urls.length ? { urls_evidencia: urls } : {}),
        ...(justificacion ? { justificacion_exencion: justificacion } : {}),
        ...(iniciativaElegida[item.id] ? { proyecto_id: iniciativaElegida[item.id] } : {}),
      });
      if (res.status === 409 && data.codigo === "INICIATIVA_AMBIGUA" && data.candidatos) {
        setCandidatos((c) => ({ ...c, [item.id]: data.candidatos! }));
        setAviso(item.id, "Tienes varias iniciativas para este entregable: elige a cuál corresponde y vuelve a enviar.");
        return;
      }
      if (res.status === 422 && data.codigo === "SIN_INICIATIVA") {
        setAviso(
          item.id,
          `Necesitas una iniciativa asignada en la semana ${data.semana_numero ?? item.semana_numero}. Pide al administrador que te asigne una.`
        );
        return;
      }
      if (!res.ok) {
        setAviso(item.id, typeof data.error === "string" ? data.error : "No se pudo enviar el entregable.");
        return;
      }
      setEvidenciaInput((v) => ({ ...v, [item.id]: "" }));
      notify.success("Entregable enviado para revisión");
      await cargar();
    } catch {
      setAviso(item.id, "Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  const handleRetirar = async (item: EntregableMatriz) => {
    if (!userId) return;
    setAviso(item.id, null);
    setSavingPlantilla((s) => ({ ...s, [item.id]: true }));
    try {
      const { res, data } = await postCompletar(item, { completado: false });
      if (!res.ok) {
        setAviso(item.id, typeof data.error === "string" ? data.error : "No se pudo retirar el envío.");
        return;
      }
      notify.success("Envío retirado");
      await cargar();
    } catch {
      setAviso(item.id, "Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  const semanaNumero = semana?.numero ?? null;
  const currentWeekLabel = etiquetaSemana(semana);

  // Meses y avance por mes: los devuelve el backend (no se asume un calendario fijo).
  const byMonth = useMemo(
    () =>
      matrizStats?.por_mes?.map((m) => ({
        month: m.mes,
        total: m.total,
        reportados: m.reportados,
        aprobados: m.aprobados,
        pct: Math.round(m.pct_reportado),
        expectedPct: Math.round(m.pct_esperado),
      })) ?? [],
    [matrizStats]
  );

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

  const availableMonths = useMemo(
    () => [...new Set(entregables.map((item) => item.mes.trim()).filter(Boolean))],
    [entregables]
  );

  const groupedByMonthPhase = useMemo(() => {
    const months = filterMonth === ALL ? availableMonths : [filterMonth];

    const blocks: {
      month: string;
      items: EntregableMatriz[];
      phases: { phase: string; items: EntregableMatriz[] }[];
    }[] = [];

    for (const month of months) {
      const items = filtered.filter((e) => e.mes === month);
      if (items.length === 0) continue;

      const phaseMap = new Map<string, EntregableMatriz[]>();
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

  const semaforoUi = resumen ? semaforoConfig[resumen.semaforo] : null;
  const TONE_ESTATUS: Record<EstatusKey, Tone> = {
    aprobado: "success",
    en_revision: "violet",
    observado: "warning",
    borrador: "brand",
    en_curso: "signal",
    no_iniciada: "neutral",
    vencido: "danger",
  };
  const tonoSemaforo: Tone = resumen?.semaforo === "verde" ? "success" : resumen?.semaforo === "amarillo" ? "warning" : resumen?.semaforo === "rojo" ? "danger" : "neutral";
  const hayFiltros = filterMonth !== ALL || filterCategory !== ALL || filterExcelStatus !== ALL || busqueda.trim() !== "";
  const limpiarFiltros = () => {
    setFilterMonth(ALL);
    setFilterCategory(ALL);
    setFilterExcelStatus(ALL);
    setBusqueda("");
  };
  const COLUMNAS = 7;

  /** Panel de evidencia y envío de un entregable (misma lógica y reglas que antes). */
  const renderAccion = (e: EntregableMatriz, evidencias: string[]) => {
    const guardando = !!savingPlantilla[e.id];
    const bloqueado = e.estado === "aprobado";
    const yaEnviado = e.estado === "enviado";
    const esReenvio = e.estado === "observado";
    return (
      <div className="space-y-3 rounded-lg border border-line bg-surface p-3.5" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
          {e.num_envios > 1 && <span>{e.num_envios} envíos</span>}
          {e.entrega_tardia && <span className="text-red-700">Primer envío posterior a la fecha límite</span>}
          <span>
            {e.requiere_evidencia
              ? e.tipo_evidencia === "drive"
                ? "Requiere enlace de Google Drive"
                : e.tipo_evidencia === "formulario"
                ? "Requiere enlace de formulario institucional"
                : "Requiere enlace de evidencia"
              : "No requiere evidencia"}
          </span>
        </div>

        {evidencias.length > 0 && (
          <ul className="space-y-1 text-xs">
            {evidencias.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-brand underline-offset-2 hover:underline">
                  <ExternalLink className="h-3 w-3 shrink-0" /> {u}
                </a>
              </li>
            ))}
          </ul>
        )}
        {e.evidencia_exenta && e.justificacion_exencion && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">Sin evidencia — justificación: {e.justificacion_exencion}</p>
        )}

        <button
          type="button"
          onClick={() => navigate(`/docente/evidencias?entregable=${e.id}`)}
          className="text-xs text-brand hover:underline"
        >
          Ver estado, historial y versiones en Mis Evidencias
        </button>

        {bloqueado ? (
          <p className="text-xs text-emerald-700">Entregable aprobado: no puede modificarse. Si hay un error, solicita su reapertura al administrador.</p>
        ) : yaEnviado ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-purple-700">Enviado el {formatDateTimeBogota(e.fecha_cargue_evidencia)}; está pendiente de revisión.</p>
            <button type="button" disabled={guardando} onClick={() => handleRetirar(e)} className="ds-btn ds-btn-secondary ds-btn-sm">
              Retirar envío
            </button>
            {guardando && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
        ) : (
          <div className="space-y-2.5">
            {e.requiere_evidencia && (
              <div>
                <label className="ds-label" htmlFor={`evid-${e.id}`}>
                  {esReenvio ? "Enlace(s) de evidencia corregida (opcional si no cambia)" : "Enlace(s) de evidencia"}
                </label>
                <input
                  id={`evid-${e.id}`}
                  type="url"
                  value={evidenciaInput[e.id] ?? ""}
                  onChange={(ev) => setEvidenciaInput((v) => ({ ...v, [e.id]: ev.target.value }))}
                  placeholder="https://drive.google.com/..."
                  disabled={!!sinEvidencia[e.id]}
                  className="ds-input disabled:bg-gray-100"
                />
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-text-muted">
                  <input type="checkbox" checked={!!sinEvidencia[e.id]} onChange={(ev) => setSinEvidencia((v) => ({ ...v, [e.id]: ev.target.checked }))} />
                  No aplica evidencia (excepción justificada)
                </label>
                {sinEvidencia[e.id] && (
                  <textarea
                    value={justificacionInput[e.id] ?? ""}
                    onChange={(ev) => setJustificacionInput((v) => ({ ...v, [e.id]: ev.target.value }))}
                    rows={2}
                    placeholder="Explica por qué no hay evidencia (mínimo 10 caracteres)"
                    aria-label="Justificación"
                    className="ds-input mt-1.5"
                  />
                )}
              </div>
            )}
            {candidatos[e.id] && (
              <div>
                <label className="ds-label" htmlFor={`ini-${e.id}`}>Iniciativa a la que corresponde</label>
                <select id={`ini-${e.id}`} value={iniciativaElegida[e.id] ?? ""} onChange={(ev) => setIniciativaElegida((v) => ({ ...v, [e.id]: Number(ev.target.value) }))} className="ds-input">
                  <option value="">Selecciona…</option>
                  {candidatos[e.id].map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo ?? `Iniciativa ${c.id}`}</option>
                  ))}
                </select>
              </div>
            )}
            {e.requiere_evidencia && <AvisoAcceso />}
            {avisos[e.id] && <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700" role="alert">{avisos[e.id]}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={guardando} onClick={() => handleEnviar(e)} className="ds-btn ds-btn-primary ds-btn-sm">
                {esReenvio ? "Reenviar corrección" : "Enviar para revisión"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const query = new URLSearchParams({ plantilla: String(e.id) });
                  if (e.iniciativa_id != null) query.set("iniciativa", String(e.iniciativa_id));
                  navigate(`/docente/reportar?${query.toString()}`);
                }}
                className="ds-btn ds-btn-ghost ds-btn-sm !text-brand"
              >
                Reportar con descripción y avance
              </button>
              {guardando && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Detalle expandido: descripción, fechas y acción. */
  const renderDetalle = (e: EntregableMatriz, evidencias: string[]) => {
    const progInicio = e.fecha_inicio_calculada;
    const progFin = e.fecha_fin_calculada;
    // Fechas YYYY-MM-DD comparables como texto (sin zonas horarias).
    const tardia = !!(e.fecha_real_entrega && progFin && e.fecha_real_entrega > progFin);
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div>
            <p className="ds-label">Descripción del entregable</p>
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
            <div><dt className="text-text-subtle">Entrega real</dt><dd className={tardia ? "text-red-700" : e.fecha_real_entrega ? "text-emerald-700" : "text-text"}>{e.fecha_real_entrega ? formatDate(e.fecha_real_entrega) : "—"}{tardia ? " · fuera de plazo" : ""}</dd></div>
            <div><dt className="text-text-subtle">Primer envío</dt><dd className="text-text">{e.fecha_primer_envio ? formatDate(e.fecha_primer_envio) : "—"}</dd></div>
            {e.fecha_cargue_evidencia && <div><dt className="text-text-subtle">Registro automático</dt><dd className="text-text">{formatDateTimeBogota(e.fecha_cargue_evidencia)}</dd></div>}
            <div className="col-span-2"><dt className="text-text-subtle">Indicador</dt><dd className="text-text">{e.fase}</dd></div>
          </dl>
        </div>
        <div className="lg:col-span-2">{renderAccion(e, evidencias)}</div>
      </div>
    );
  };

  if (loadingMatrix) return <PageLoading label="Cargando matriz…" />;

  return (
    <Page wide>
      <PageHeader
        title="Matriz de seguimiento"
        description={`${entregables.length} entregables programados · ${currentWeekLabel}`}
        meta={semaforoUi ? <StatusPill tone={tonoSemaforo}>{semaforoUi.label}</StatusPill> : undefined}
        actions={
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => navigate("/docente/reportar")}>
            <FileText className="h-4 w-4" /> Reportar entregable
          </button>
        }
      />

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
              <ExternalLink className="h-3.5 w-3.5" /> Mi carpeta de Drive
            </a>
          )}
        </div>
      )}

      {resumen && (
        <>
          <section aria-label="Indicadores de la matriz" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Avance aprobado" tone="success" value={`${Math.round(resumen.pct_aprobado ?? 0)}%`} progress={resumen.pct_aprobado ?? 0} marker={resumen.pct_esperado} hint={`${resumen.aprobados} de ${resumen.total} aprobados por coordinación`} />
            <Kpi label="Avance reportado" tone="brand" value={resumen.total === 0 || resumen.pct_reportado == null ? "—" : `${Math.round(resumen.pct_reportado)}%`} progress={resumen.pct_reportado ?? 0} marker={resumen.pct_esperado} hint={`${resumen.reportados} / ${resumen.total} enviados a revisión o aprobados`} />
            <Kpi label="Avance esperado" tone="neutral" value={resumen.pct_esperado == null ? "—" : `${Math.round(resumen.pct_esperado)}%`} hint={`Con fecha límite hasta hoy${hoy ? ` (${formatDate(hoy)})` : ""} · ${resumen.esperado} / ${resumen.total}`} />
            <Kpi label="Cumplimiento exigible" tone={resumen.exigibles === 0 || resumen.cumplimiento_exigible == null ? "neutral" : resumen.cumplimiento_exigible >= 80 ? "success" : resumen.cumplimiento_exigible >= 60 ? "warning" : "danger"} value={resumen.exigibles === 0 || resumen.cumplimiento_exigible == null ? "—" : `${Math.round(resumen.cumplimiento_exigible)}%`} progress={resumen.cumplimiento_exigible ?? 0} hint={resumen.exigibles === 0 ? "Sin entregables exigibles" : `${resumen.exigibles_aprobados} / ${resumen.exigibles} exigibles aprobados`} />
            <Kpi className="col-span-2 lg:col-span-1" label="Horas" tone="signal" value={<span>{resumen.horas_aprobadas}<span className="text-base text-text-subtle"> / {resumen.horas_programadas} h</span></span>} hint={`${resumen.horas_reportadas} h reportadas · ${resumen.horas_aprobadas} h aprobadas`} />
          </section>

          <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Resumen de estados">
            <StatusPill tone="violet">{resumen.enviados_pendientes_revision} en revisión</StatusPill>
            <StatusPill tone="warning">{resumen.observados} observados</StatusPill>
            <StatusPill tone="brand">{resumen.borradores} borradores</StatusPill>
            <StatusPill tone="danger">{resumen.vencidos} vencidos</StatusPill>
            <StatusPill tone={resumen.brecha_entregables < 0 ? "danger" : "success"} title="Brecha = entregables aprobados − entregables esperados a la fecha">
              Brecha {resumen.brecha_entregables > 0 ? "+" : ""}{resumen.brecha_entregables} frente al cronograma ({resumen.brecha_pct > 0 ? "+" : ""}{resumen.brecha_pct} pts)
            </StatusPill>
          </div>
        </>
      )}

      {byMonth.length > 0 && (
        <section aria-label="Avance por mes" className="flex gap-2 overflow-x-auto pb-1">
          {byMonth.map((m) => {
            const vacio = m.total === 0;
            const activo = filterMonth === m.month;
            const tono: Tone = vacio ? "neutral" : m.pct >= 80 ? "success" : m.pct >= 40 ? "warning" : "danger";
            return (
              <button
                type="button"
                key={m.month}
                aria-pressed={activo}
                onClick={() => setFilterMonth(activo ? ALL : m.month)}
                className={`min-w-[148px] flex-1 rounded-xl border bg-surface p-3 text-left transition-colors ${activo ? "border-brand ring-2 ring-blue-100" : "border-line hover:border-line-strong"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] text-text" style={{ fontWeight: 600 }}>{m.month}</span>
                  <span className="text-sm tabular-nums text-text" style={{ fontWeight: 650 }}>{vacio ? "—" : `${m.pct}%`}</span>
                </div>
                <ProgressBar value={vacio ? 0 : m.pct} marker={vacio ? null : m.expectedPct} tone={tono} className="mt-2" label={`${m.month}: ${m.pct}% reportado`} />
                <p className="mt-1.5 text-[0.6875rem] text-text-subtle">{m.reportados}/{m.total} reportados · {m.aprobados} aprobados{!vacio ? ` · esperado ${m.expectedPct}%` : ""}</p>
              </button>
            );
          })}
        </section>
      )}

      <div className="ds-panel">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar entregable, iniciativa o número" aria-label="Buscar en la matriz" className="ds-input !pl-9" />
          </div>
          <div className="w-40"><AppSelect value={filterMonth} onValueChange={setFilterMonth} options={[{ value: ALL, label: "Todos los meses" }, ...availableMonths.map((m) => ({ value: m, label: m }))]} /></div>
          <div className="w-52"><AppSelect value={filterCategory} onValueChange={setFilterCategory} options={[{ value: ALL, label: "Todas las categorías" }, ...Object.entries(categoryConfig).map(([key, cfg]) => ({ value: key, label: cfg.label }))]} /></div>
          <div className="w-44"><AppSelect value={filterExcelStatus} onValueChange={setFilterExcelStatus} options={[{ value: ALL, label: "Todos los estados" }, ...ESTATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))]} /></div>
          {hayFiltros && <button type="button" onClick={limpiarFiltros} className="ds-btn ds-btn-ghost ds-btn-sm !text-brand">Limpiar filtros</button>}
          <button type="button" onClick={() => setShowLegend(!showLegend)} aria-expanded={showLegend} className="ds-btn ds-btn-ghost ds-btn-sm">
            <Info className="h-3.5 w-3.5" /> Leyenda
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
              <p className="ds-label">Estados de seguimiento</p>
              <ul className="grid gap-1">
                {ESTATUS_OPTIONS.map((opt) => (
                  <li key={opt.value} className="flex items-center gap-2 text-xs text-text-muted"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${opt.dot}`} />{opt.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {groupedByMonthPhase.length === 0 ? (
          <EmptyState icon={Search} title="Ningún entregable coincide con los filtros" action={<button type="button" onClick={limpiarFiltros} className="ds-btn ds-btn-secondary ds-btn-sm">Limpiar filtros</button>}>
            Prueba con otro mes, categoría o estado.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th className="hidden w-14 sm:table-cell">N.º</th>
                  <th>Entregable</th>
                  <th className="hidden md:table-cell">Periodo de entrega</th>
                  <th className="hidden lg:table-cell text-right">Horas</th>
                  <th className="hidden sm:table-cell">Estado</th>
                  <th className="hidden sm:table-cell">Evidencia</th>
                  <th className="w-px"><span className="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                {groupedByMonthPhase.map(({ month, items, phases }) => {
                  const mDone = items.filter((e) => isDeliverableCompleted({ estado: e.estado })).length;
                  const mTotal = items.length;
                  const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                  const fin0 = items[0]?.fecha_fin_calculada;
                  return (
                    <Fragment key={month}>
                      <tr>
                        <td colSpan={COLUMNAS} className="!border-b !border-line !bg-gray-100/70 !p-0">
                          <button type="button" onClick={() => toggleCollapse(month)} aria-expanded={!collapsed[month]} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left [contain:inline-size]">
                            {collapsed[month] ? <ChevronRight className="h-4 w-4 shrink-0 text-text-subtle" /> : <ChevronDown className="h-4 w-4 shrink-0 text-text-subtle" />}
                            <Calendar className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                            <span className="text-sm text-text" style={{ fontWeight: 650 }}>{month}{fin0 ? ` ${new Date(`${fin0}T12:00:00`).getFullYear()}` : ""}</span>
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
                                  <button type="button" onClick={() => togglePhaseCollapse(month, phase)} aria-expanded={!cerrada} className="flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left [contain:inline-size]">
                                    {cerrada ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-subtle" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-subtle" />}
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
                                  const destacado = e.id === notificationTemplateId;
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
                                        className={`cursor-pointer scroll-mt-24 ${destacado ? "[&>td]:bg-blue-50" : ""} ${abierto ? "[&>td]:bg-surface-2" : ""}`}
                                      >
                                        <td className="hidden tabular-nums text-text-subtle sm:table-cell">{e.numero != null && e.numero !== 0 ? `#${e.numero}` : `S${e.semana_numero}`}</td>
                                        <td className="sm:max-w-[520px]">
<div className="w-0 min-w-full sm:w-auto sm:min-w-0">
                                          <p className="line-clamp-2 text-text" style={{ fontWeight: 600 }}>{e.entregable}</p>
                                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
                                            <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-sm ${catCfg.dot}`} aria-hidden />{catCfg.label}</span>
                                            <span className="truncate">{e.iniciativa_titulo}</span>
                                            {e.tiene_excepcion && <StatusPill tone="warning" dot={false}>Ajuste individual</StatusPill>}
                                            <span className="md:hidden">{e.numero != null && e.numero !== 0 ? `#${e.numero} · ` : ""}S{e.semana_numero} · {e.fecha_fin_calculada ? `límite ${formatDate(e.fecha_fin_calculada)}` : "sin fecha"} · {e.horas} h</span>
                                          </p>
                                          <span className="mt-1.5 inline-flex flex-wrap items-center gap-1 sm:hidden">
                                            <StatusPill tone={TONE_ESTATUS[estatus.key]}>{estatus.label}</StatusPill>
                                            {e.vencido && <StatusPill tone="danger" dot={false}>Vencido</StatusPill>}
                                            {evidencias[0] && (
                                              <a href={evidencias[0]} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-brand" aria-label="Abrir evidencia en una pestaña nueva">
                                                <ExternalLink className="h-3.5 w-3.5" /> Evidencia
                                              </a>
                                            )}
                                          </span>
                                          {e.estado === "observado" && e.comentario_revision && (
                                            <p className="mt-1 line-clamp-1 text-xs text-amber-800">Observación: {e.comentario_revision}</p>
                                          )}
                                        </div>
</td>
                                        <td className="hidden whitespace-nowrap text-text-muted md:table-cell">
                                          <span className="tabular-nums">S{e.semana_numero}</span>
                                          <span className="mx-1.5 text-text-subtle">·</span>
                                          {e.fecha_inicio_calculada && e.fecha_fin_calculada ? `${formatDate(e.fecha_inicio_calculada)} → ${formatDate(e.fecha_fin_calculada)}` : "—"}
                                        </td>
                                        <td className="hidden text-right tabular-nums text-text-muted lg:table-cell">{e.horas} h</td>
                                        <td className="hidden sm:table-cell">
                                          <span className="inline-flex flex-wrap items-center gap-1">
                                            <StatusPill tone={TONE_ESTATUS[estatus.key]}>{estatus.label}</StatusPill>
                                            {e.vencido && <StatusPill tone="danger" dot={false}>Vencido</StatusPill>}
                                          </span>
                                        </td>
                                        <td className="hidden sm:table-cell" onClick={(ev) => ev.stopPropagation()}>
                                          {evidencias[0] ? (
                                            <a href={evidencias[0]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline" aria-label="Abrir evidencia en una pestaña nueva">
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              {evidencias.length > 1 ? `${evidencias.length} enlaces` : "Abrir"}
                                            </a>
                                          ) : e.requiere_evidencia && e.estado !== "aprobado" ? (
                                            <span className="text-xs text-text-subtle">Pendiente</span>
                                          ) : (
                                            <span className="text-xs text-gray-300">—</span>
                                          )}
                                        </td>
                                        <td className="text-text-subtle">{abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                                      </tr>
                                      {abierto && (
                                        <tr>
                                          <td colSpan={COLUMNAS} className="!bg-surface-2 !px-4 !py-4">
                                            {renderDetalle(e, evidencias)}
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
    </Page>
  );
}
