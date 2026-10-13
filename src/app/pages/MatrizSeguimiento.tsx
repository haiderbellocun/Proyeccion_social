import { useState, useMemo, useEffect, useCallback } from "react";
import React from "react";
import { useNavigate } from "react-router";
import {
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
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
import { formatFecha } from "../lib/fechas";
import { CategoryTag } from "../components/CategoryTag";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

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
  fecha_real_entrega: string | null;
  fecha_primer_envio: string | null;
  fecha_ultimo_envio: string | null;
  num_envios: number;
  url_evidencia: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  comentario_revision: string | null;
  estado_revision: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
  iniciativa: { id: number; titulo: string | null; tipo: string | null } | null;
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

/** El estado viene del backend; el frontend solo lo presenta ("vencido" es una condición adicional). */
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
const formatDate = (iso: string) => formatFecha(iso);

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
  const currentUser = useCurrentUser();

  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  const [entregables, setEntregables] = useState<EntregableMatriz[]>([]);
  const [resumen, setResumen] = useState<IndicadoresSeguimiento | null>(null);
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(
    null
  );
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
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
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
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

  // Enviar (o reenviar un observado) para revisión. Las validaciones de evidencia las aplica el backend.
  const handleEnviar = async (item: EntregableMatriz) => {
    if (!userId) return;
    const urls = (evidenciaInput[item.id] ?? "")
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const justificacion = sinEvidencia[item.id] ? (justificacionInput[item.id] ?? "").trim() : "";
    const yaTieneEvidencia = (item.evidencias?.length ?? 0) > 0 || !!item.url_evidencia;
    if (item.requiere_evidencia && urls.length === 0 && !yaTieneEvidencia && !justificacion) {
      setAviso(item.id, 'Agrega el enlace de la evidencia o marca "No aplica evidencia" y justifícalo.');
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
      await cargar();
    } catch {
      setAviso(item.id, "Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  const handleUpdateFechaEntrega = async (
    entregableId: number,
    isoDate: string
  ) => {
    const uid = currentUser?.id;
    if (!uid || !isoDate) return;
    try {
      const res = await fetch(
        `${API_BASE}/docente/entregables/${entregableId}/fecha-entrega`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha_real_entrega: isoDate,
            docente_id: uid,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "No se pudo actualizar la fecha de entrega."
        );
        return;
      }
      const fecha =
        typeof data.fecha_real_entrega === "string"
          ? data.fecha_real_entrega
          : isoDate;
      setEntregables((list) =>
        list.map((x) =>
          x.entregable_id === entregableId ? { ...x, fecha_real_entrega: fecha } : x
        )
      );
      setError(null);
    } catch {
      setError("Error de conexión al actualizar la fecha.");
    }
  };

  const semanaNumero = semana?.numero ?? null;
  const currentWeekLabel = etiquetaSemana(semana);

  // Meses a mostrar: los que devuelve el backend (no se asume un calendario fijo).
  const byMonth = useMemo(
    () =>
      matrizStats?.por_mes?.map((m) => ({
        month: m.mes,
        total: m.total,
        reportados: m.reportados,
        aprobados: m.aprobados,
        pct: Math.round(m.pct_reportado),
      })) ?? [],
    [matrizStats]
  );

  // Meses presentes en la matriz, en orden de calendario (no se asume febrero–mayo).
  const mesesDisponibles = useMemo(() => {
    const primeraSemana = new Map<string, number>();
    for (const e of entregables) {
      if (!e.mes) continue;
      primeraSemana.set(e.mes, Math.min(primeraSemana.get(e.mes) ?? Infinity, e.semana_numero || Infinity));
    }
    return [...primeraSemana.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }, [entregables]);

  const filtered = useMemo(() => {
    return entregables.filter((e) => {
      const key = computeEstatus(e, semanaNumero).key;
      const coincideEstado =
        filterExcelStatus === ALL ||
        (filterExcelStatus === "vencido" ? e.vencido : key === filterExcelStatus);
      return (
        (filterMonth === ALL || e.mes === filterMonth) &&
        (filterCategory === ALL || e.categoria === filterCategory) &&
        coincideEstado
      );
    });
  }, [entregables, filterMonth, filterCategory, filterExcelStatus, semanaNumero]);

  const groupedByMonthPhase = useMemo(() => {
    const months: string[] = filterMonth === ALL ? mesesDisponibles : [filterMonth];

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
  }, [filtered, filterMonth]);

  const phaseKey = (month: string, phase: string) => `${month}||${phase}`;

  const toggleCollapse = (month: string) => {
    setCollapsed((prev) => ({ ...prev, [month]: !prev[month] }));
  };

  const togglePhaseCollapse = (month: string, phase: string) => {
    const k = phaseKey(month, phase);
    setCollapsedPhase((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const MetricCard = ({
    title,
    subLabel,
    detail,
    numerator,
    denominator,
    pct,
    neutral,
  }: {
    title: string;
    subLabel: string;
    detail: string;
    numerator: number;
    denominator: number;
    pct: number | null;
    neutral?: boolean;
  }) => {
    const empty = denominator === 0 || pct == null;
    const sem = neutral
      ? {
          card: "border-blue-100 bg-blue-50",
          label: "text-blue-800",
          pct: "text-blue-700",
          barTrack: "bg-blue-100",
          barFill: "bg-blue-500",
        }
      : semaphoreClasses(pct ?? 0, empty);
    return (
      <div className={`rounded-xl border shadow-sm p-5 ${sem.card}`}>
        <p
          className="text-gray-500 text-xs uppercase tracking-wider"
          style={{ fontWeight: 650 }}
        >
          {title}
        </p>
        <p
          className={`text-xs mt-1 ${empty ? "text-gray-500" : "text-gray-600"}`}
          style={{ fontWeight: 600 }}
        >
          {empty ? "Sin entregables exigibles" : subLabel}
        </p>

        <p className={`text-3xl mt-3 ${sem.pct}`} style={{ fontWeight: 850 }}>
          {empty ? "—" : `${Math.round(pct ?? 0)}%`}
        </p>

        {!empty && (
          <p className="text-xs text-gray-500 mt-1">
            {numerator} / {denominator} {detail}
          </p>
        )}

        <div
          className={`w-full h-2 ${sem.barTrack} rounded-full overflow-hidden mt-3`}
        >
          <div
            className={`h-full ${sem.barFill} rounded-full transition-all`}
            style={{ width: empty ? "0%" : `${Math.min(100, pct ?? 0)}%` }}
          />
        </div>
      </div>
    );
  };

  const pctAprobado = Math.round(resumen?.pct_aprobado ?? 0);
  const colorAprobado = pctAprobado >= 80 ? "#10b981" : pctAprobado >= 60 ? "#f59e0b" : "#ef4444";
  const semaforoUi = resumen ? semaforoConfig[resumen.semaforo] : null;

  return (
    <>
      {loadingMatrix ? (
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-2 border-gray-200 border-t-[#1d4ed8] rounded-full animate-spin" />
          <span
            className="ml-3 text-sm text-gray-500"
            style={{ fontWeight: 500 }}
          >
            Cargando matriz...
          </span>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-gray-900">Matriz de Seguimiento</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Ciclo · {entregables.length} entregables programados ·{" "}
                {currentWeekLabel}
              </p>
            </div>
            <button
              onClick={() => navigate("/docente/reportar")}
              className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-sm shrink-0"
              style={{ fontWeight: 600 }}
            >
              <FileText className="w-4 h-4" />
              Reportar avance
            </button>
          </div>

          {perfil && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex flex-wrap gap-6 items-start">
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center text-sm font-bold">
                      {(perfil.nombre[0] ?? "?").toUpperCase()}
                      {(perfil.apellido[0] ?? "?").toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {perfil.nombre} {perfil.apellido}
                      </p>
                      <p className="text-xs text-gray-500">
                        {perfil.programa?.nombre ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
                    <span>📍 {perfil.regional ?? "—"}</span>
                    <span>
                      🕐{" "}
                      {perfil.grupo_matriz?.horas_totales != null
                        ? perfil.grupo_matriz.horas_totales
                        : "—"}{" "}
                      horas PS
                    </span>
                    {perfil.tipo_docente && (
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          perfil.tipo_docente === "NUEVO"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {perfil.tipo_docente}
                      </span>
                    )}
                  </div>
                  {perfil.link_drive && (
                    <a
                      href={perfil.link_drive}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline mt-1 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Ver carpeta Drive
                    </a>
                  )}
                </div>

                <div className="hidden md:block w-px bg-gray-200 self-stretch min-h-[4rem]" />

                {perfil.grupo_matriz && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Indicadores — {perfil.grupo_matriz.nombre}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {[
                        {
                          label: "Proyectos",
                          value: perfil.grupo_matriz.num_proyectos,
                          color: "bg-indigo-100 text-indigo-700",
                        },
                        {
                          label: "Actividades",
                          value: perfil.grupo_matriz.num_actividades,
                          color: "bg-purple-100 text-purple-700",
                        },
                        {
                          label: "Conv. Nuevos",
                          value: perfil.grupo_matriz.num_convenios_nuevos,
                          color: "bg-green-100 text-green-700",
                        },
                        {
                          label: "Conv. Dinamizados",
                          value: perfil.grupo_matriz.num_convenios_dinamizados,
                          color: "bg-orange-100 text-orange-700",
                        },
                      ]
                        .filter((i) => i.value > 0)
                        .map((i) => (
                          <span
                            key={i.label}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${i.color}`}
                          >
                            {i.value} {i.label}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="sm:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="#f0f0f0"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={colorAprobado}
                    strokeWidth="3"
                    strokeDasharray={`${pctAprobado} ${100 - pctAprobado}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-lg text-gray-800"
                    style={{ fontWeight: 800 }}
                  >
                    {pctAprobado}%
                  </span>
                </div>
              </div>
              <div>
                <p
                  className="text-gray-500 text-xs"
                  style={{ fontWeight: 500 }}
                >
                  Avance aprobado
                </p>
                <p
                  className="text-gray-800 mt-1"
                  style={{ fontWeight: 700, fontSize: 20 }}
                >
                  {resumen?.aprobados ?? 0} / {resumen?.total ?? 0}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  entregables aprobados por el administrador
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span
                    className="text-xs text-emerald-600"
                    style={{ fontWeight: 500 }}
                  >
                    {currentWeekLabel}
                  </span>
                  {semaforoUi && (
                    <span
                      className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${semaforoUi.badge}`}
                      style={{ fontWeight: 600 }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${semaforoUi.dot}`} />
                      {semaforoUi.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {byMonth.map((m) => {
              const empty = m.total === 0;
              const sem = semaphoreClasses(m.pct, empty);
              return (
                <button
                  type="button"
                  key={m.month}
                  className={`rounded-xl border shadow-sm p-4 text-left cursor-pointer hover:shadow-md transition-shadow ${sem.card}`}
                  onClick={() =>
                    setFilterMonth(filterMonth === m.month ? ALL : m.month)
                  }
                >
                  <p
                    className={`text-xs uppercase tracking-wide ${sem.label}`}
                    style={{ fontWeight: 700 }}
                  >
                    {m.month}
                  </p>
                  <div className="flex items-baseline justify-between gap-2 mt-2">
                    <span
                      className={`text-lg tabular-nums ${sem.pct}`}
                      style={{ fontWeight: 800 }}
                    >
                      {empty ? "—" : `${m.pct}%`}
                    </span>
                  </div>
                  <div
                    className={`w-full h-2 ${sem.barTrack} rounded-full overflow-hidden mt-2`}
                  >
                    <div
                      className={`h-full ${sem.barFill} rounded-full transition-all`}
                      style={{ width: empty ? "0%" : `${m.pct}%` }}
                    />
                  </div>
                  <p
                    className={`text-xs mt-2 ${empty ? "text-gray-400" : sem.label}`}
                  >
                    {m.reportados} / {m.total} reportados
                  </p>
                  <p className={`text-[11px] ${empty ? "text-gray-400" : sem.label}`}>
                    {m.aprobados} aprobados
                  </p>
                </button>
              );
            })}
          </div>

          {resumen && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard
                  title="Avance reportado"
                  subLabel="Enviados a revisión o aprobados"
                  detail="entregables"
                  numerator={resumen.reportados}
                  denominator={resumen.total}
                  pct={resumen.pct_reportado}
                />
                <MetricCard
                  title="Avance esperado"
                  subLabel={`Con fecha límite hasta hoy${hoy ? ` (${formatDate(hoy)})` : ""}`}
                  detail="entregables"
                  numerator={resumen.esperado}
                  denominator={resumen.total}
                  pct={resumen.pct_esperado}
                  neutral
                />
                <MetricCard
                  title="Cumplimiento exigible"
                  subLabel="Exigibles ya aprobados"
                  detail="exigibles aprobados"
                  numerator={resumen.exigibles_aprobados}
                  denominator={resumen.exigibles}
                  pct={resumen.cumplimiento_exigible}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700" style={{ fontWeight: 600 }}>
                  {resumen.enviados_pendientes_revision} en revisión
                </span>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800" style={{ fontWeight: 600 }}>
                  {resumen.observados} observados
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700" style={{ fontWeight: 600 }}>
                  {resumen.borradores} borradores
                </span>
                <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700" style={{ fontWeight: 600 }}>
                  {resumen.vencidos} vencidos
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full ${resumen.brecha < 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
                  style={{ fontWeight: 600 }}
                  title="Brecha = entregables aprobados − entregables esperados a la fecha"
                >
                  Brecha: {resumen.brecha > 0 ? "+" : ""}
                  {resumen.brecha} frente al cronograma
                </span>
              </div>
            </>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors rounded-xl"
            >
              <div
                className="flex items-center gap-2 text-sm text-gray-700"
                style={{ fontWeight: 500 }}
              >
                <Info className="w-4 h-4 text-gray-400" />
                Leyenda de categorías y estados
              </div>
              {showLegend ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            {showLegend && (
              <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <p
                    className="text-xs text-gray-500 uppercase tracking-wider mb-2"
                    style={{ fontWeight: 600 }}
                  >
                    Categorías de entregable
                  </p>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(categoryConfig).map(([key, cfg]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-sm ${cfg.dot} shrink-0`} />
                        <span className="text-xs text-gray-600">{cfg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p
                    className="text-xs text-gray-500 uppercase tracking-wider mb-2"
                    style={{ fontWeight: 600 }}
                  >
                    Estados de seguimiento
                  </p>
                  <div className="grid grid-cols-1 gap-1">
                    {ESTATUS_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${opt.dot} shrink-0`} />
                        <span className="text-xs text-gray-600">{opt.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter className="w-4 h-4" /> Filtrar:
            </div>

            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
            >
              <option value={ALL}>Todos los meses</option>
              {mesesDisponibles.map((m) => (
                <option key={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
            >
              <option value={ALL}>Todas las categorías</option>
              {Object.entries(categoryConfig).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>

            <select
              value={filterExcelStatus}
              onChange={(e) => setFilterExcelStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
            >
              <option value={ALL}>Todos los estados</option>
              {ESTATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {(filterMonth !== ALL ||
              filterCategory !== ALL ||
              filterExcelStatus !== ALL) && (
              <button
                onClick={() => {
                  setFilterMonth(ALL);
                  setFilterCategory(ALL);
                  setFilterExcelStatus(ALL);
                }}
                className="text-xs text-[#1d4ed8] hover:underline"
              >
                Limpiar filtros
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400">
              {filtered.length} entregable{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-4">
            {groupedByMonthPhase.map(({ month, items, phases }) => {
              const mDone = items.filter((e) =>
                isDeliverableCompleted({ estado: e.estado })
              ).length;
              const mTotal = items.length;
              const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
              const sem = semaphoreClasses(mPct, mTotal === 0);
              const fin0 = items[0]?.fecha_fin_calculada;

              return (
                <div
                  key={month}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapse(month)}
                    className="w-full flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <Calendar className="w-4 h-4 shrink-0 text-[#1d4ed8]" />
                    <span
                      className="text-gray-800 text-sm"
                      style={{ fontWeight: 800 }}
                    >
                      {month}
                      {fin0
                        ? ` ${new Date(fin0 + "T12:00:00").getFullYear()}`
                        : ""}
                    </span>
                    <span className="text-xs text-gray-500">
                      · Reportados: {mDone}/{mTotal} ({mTotal ? `${mPct}%` : "—"})
                    </span>
                    <div
                      className={`flex-1 min-w-[120px] h-2 rounded-full overflow-hidden ${sem.barTrack}`}
                    >
                      <div
                        className={`h-full ${sem.barFill} transition-all rounded-full`}
                        style={{ width: mTotal ? `${mPct}%` : "0%" }}
                      />
                    </div>
                    {collapsed[month] ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {!collapsed[month] && (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-3 space-y-2">
                      {phases.map(({ phase, items: phaseItems }) => {
                        const pk = phaseKey(month, phase);
                        const phaseCollapsed = collapsedPhase[pk];
                        return (
                          <div
                            key={pk}
                            className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm"
                          >
                            <button
                              type="button"
                              onClick={() => togglePhaseCollapse(month, phase)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50/80 transition-colors border-b border-gray-50"
                            >
                              {phaseCollapsed ? (
                                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                              ) : (
                                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                              )}
                              <span
                                className="text-sm text-gray-800 flex-1 truncate"
                                style={{ fontWeight: 600 }}
                              >
                                {phase}
                              </span>
                              <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                                {phaseItems.length}{" "}
                                {phaseItems.length === 1
                                  ? "entregable"
                                  : "entregables"}
                              </span>
                            </button>

                            {!phaseCollapsed && (() => {
                              const byWeek = new Map<number, EntregableMatriz[]>();
                              for (const it of phaseItems) {
                                const w = it.semana_numero;
                                if (!byWeek.has(w)) byWeek.set(w, []);
                                byWeek.get(w)!.push(it);
                              }
                              const weekNums = [...byWeek.keys()].sort(
                                (a, b) => a - b
                              );
                              return (
                                <div className="divide-y divide-gray-100">
                                  {weekNums.map((weekNum) => {
                                    const semanaItems = byWeek.get(weekNum)!;
                                    const mesHeader = semanaItems[0]?.mes ?? "";
                                    const completadosSemana = semanaItems.filter(
                                      (i) => isDeliverableCompleted({ estado: i.estado })
                                    ).length;
                                    const totalSemana = semanaItems.length;
                                    const horasSemana = semanaItems.reduce(
                                      (acc, i) => acc + (i.horas || 0),
                                      0
                                    );
                                    return (
                                      <div key={weekNum}>
                                        <div className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-50 border-b border-gray-100 gap-2">
                                          <span
                                            className="font-semibold text-sm text-gray-800 min-w-0 truncate"
                                            style={{ fontWeight: 700 }}
                                          >
                                            Semana {weekNum}
                                            {mesHeader ? ` · ${mesHeader}` : ""}
                                          </span>
                                          <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0 flex-wrap justify-end">
                                            <span className="text-gray-500 tabular-nums">
                                              {horasSemana}h
                                            </span>
                                            <span
                                              className={`font-medium tabular-nums text-xs sm:text-sm ${
                                                completadosSemana === totalSemana
                                                  ? "text-green-600"
                                                  : completadosSemana === 0
                                                  ? "text-gray-400"
                                                  : "text-blue-600"
                                              }`}
                                            >
                                              {completadosSemana}/{totalSemana}{" "}
                                              reportados
                                            </span>
                                            <div className="w-12 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                              <div
                                                className="h-full bg-green-500 rounded-full transition-all"
                                                style={{
                                                  width: `${
                                                    totalSemana > 0
                                                      ? (completadosSemana /
                                                          totalSemana) *
                                                        100
                                                      : 0
                                                  }%`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                        <ul className="divide-y divide-gray-50">
                                          {semanaItems.map((e) => {
                                            const estatus = computeEstatus(e, semanaNumero);
                                            const catCfg =
                                              categoryConfig[
                                                categoryUi(e.categoria)
                                              ];
                                            const isCurrent =
                                              estatus.key === "en_curso";
                                            const isExpanded =
                                              expandedRow === e.id;
                                            const guardando = !!savingPlantilla[e.id];
                                            const bloqueado = e.estado === "aprobado";
                                            const yaEnviado = e.estado === "enviado";
                                            const esReenvio = e.estado === "observado";
                                            const evidencias =
                                              e.evidencias && e.evidencias.length > 0
                                                ? e.evidencias
                                                : e.url_evidencia
                                                ? [e.url_evidencia]
                                                : [];

                                            const progInicio =
                                              e.fecha_inicio_calculada;
                                            const progFin =
                                              e.fecha_fin_calculada;
                                            let fechaRealClass = "text-gray-700";
                                            if (e.fecha_real_entrega && progFin) {
                                              // Comparación de fechas YYYY-MM-DD (texto ISO ordenable): sin zonas horarias.
                                              fechaRealClass =
                                                e.fecha_real_entrega > progFin
                                                  ? "text-red-600"
                                                  : "text-green-700";
                                            }

                                  return (
                                    <li key={e.id}>
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() =>
                                          setExpandedRow(
                                            isExpanded ? null : e.id
                                          )
                                        }
                                        onKeyDown={(ev) => {
                                          if (
                                            ev.key === "Enter" ||
                                            ev.key === " "
                                          ) {
                                            ev.preventDefault();
                                            setExpandedRow(
                                              isExpanded ? null : e.id
                                            );
                                          }
                                        }}
                                        className={`px-4 py-3 cursor-pointer border-l-4 transition-colors ${catCfg.border} ${
                                          isCurrent
                                            ? "bg-blue-50/50"
                                            : "hover:bg-gray-50/90"
                                        }`}
                                      >
                                        <div className="flex flex-wrap items-start gap-3">
                                          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                            <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-semibold tabular-nums shrink-0">
                                              {e.numero != null && e.numero !== 0
                                                ? `#${e.numero}`
                                                : `S${e.semana_numero}`}
                                            </span>
                                            <CategoryTag
                                              category={categoryUi(e.categoria)}
                                              compact
                                            />
                                            <span
                                              className="text-sm text-gray-900 leading-snug"
                                              style={{ fontWeight: 600 }}
                                            >
                                              {e.entregable}
                                            </span>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 shrink-0">
                                            <span
                                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${estatus.bg} ${estatus.color}`}
                                            >
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full ${estatus.dot}`}
                                              />
                                              {estatus.label}
                                            </span>
                                            {e.vencido && (
                                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                Vencido
                                              </span>
                                            )}
                                            <span className="inline-flex items-center gap-1">
                                              <Clock className="w-3.5 h-3.5" />
                                              {e.horas}h
                                            </span>
                                            {evidencias[0] ? (
                                              <a
                                                href={evidencias[0]}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex text-[#1d4ed8] hover:text-[#1e3a8a] p-1"
                                                onClick={(ev) =>
                                                  ev.stopPropagation()
                                                }
                                                aria-label="Abrir evidencia"
                                              >
                                                <ExternalLink className="w-4 h-4" />
                                              </a>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                                          <span>
                                            {progInicio && progFin
                                              ? `${formatDate(progInicio)} – ${formatDate(progFin)}`
                                              : "—"}
                                          </span>
                                          <span className="text-gray-300 mx-1">
                                            ·
                                          </span>
                                          <span className="text-gray-400">
                                            F. límite:{" "}
                                            {e.fecha_fin_calculada
                                              ? formatDate(
                                                  e.fecha_fin_calculada
                                                )
                                              : "—"}
                                          </span>
                                        </div>
                                        {e.estado === "observado" && e.comentario_revision && (
                                          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                            Observación del revisor: {e.comentario_revision}
                                          </p>
                                        )}
                                      </div>
                                      {isExpanded && (
                                        <div
                                          className={`px-4 py-3 text-sm border-l-4 ${catCfg.border} ${catCfg.bg}`}
                                        >
                                          <div className="p-3 bg-white rounded-lg border mb-3 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span
                                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${estatus.bg} ${estatus.color}`}
                                              >
                                                <span className={`w-1.5 h-1.5 rounded-full ${estatus.dot}`} />
                                                {estatus.label}
                                              </span>
                                              {e.num_envios > 1 && (
                                                <span className="text-xs text-gray-500">
                                                  {e.num_envios} envíos
                                                </span>
                                              )}
                                              {e.entrega_tardia && (
                                                <span className="text-xs text-red-600">
                                                  Primer envío posterior a la fecha límite
                                                </span>
                                              )}
                                              {e.requiere_evidencia ? (
                                                <span className="text-xs text-gray-500">
                                                  {e.tipo_evidencia === "drive"
                                                    ? "Requiere enlace de Google Drive"
                                                    : e.tipo_evidencia === "formulario"
                                                    ? "Requiere enlace de formulario institucional"
                                                    : "Requiere enlace de evidencia"}
                                                </span>
                                              ) : (
                                                <span className="text-xs text-gray-500">
                                                  No requiere evidencia
                                                </span>
                                              )}
                                            </div>

                                            {evidencias.length > 0 && (
                                              <ul className="text-xs space-y-0.5">
                                                {evidencias.map((u) => (
                                                  <li key={u}>
                                                    <a
                                                      href={u}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-blue-600 underline break-all"
                                                      onClick={(ev) => ev.stopPropagation()}
                                                    >
                                                      {u}
                                                    </a>
                                                  </li>
                                                ))}
                                              </ul>
                                            )}
                                            {e.evidencia_exenta && e.justificacion_exencion && (
                                              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                Sin evidencia — justificación: {e.justificacion_exencion}
                                              </p>
                                            )}

                                            {bloqueado ? (
                                              <p className="text-xs text-green-700">
                                                Entregable aprobado: no puede modificarse. Si hay un error, solicita su reapertura al administrador.
                                              </p>
                                            ) : yaEnviado ? (
                                              <div className="flex flex-wrap items-center gap-3">
                                                <p className="text-xs text-blue-700">
                                                  Enviado el {formatFecha(e.fecha_ultimo_envio)}; está pendiente de revisión.
                                                </p>
                                                <button
                                                  type="button"
                                                  disabled={guardando}
                                                  onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    handleRetirar(e);
                                                  }}
                                                  className="text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                                                >
                                                  Retirar envío
                                                </button>
                                                {guardando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                                              </div>
                                            ) : (
                                              <div className="space-y-2" onClick={(ev) => ev.stopPropagation()}>
                                                {e.requiere_evidencia && (
                                                  <div>
                                                    <label className="text-xs text-gray-500 font-medium" htmlFor={`evid-${e.id}`}>
                                                      {esReenvio ? "Enlace(s) de evidencia corregida (opcional si no cambia)" : "Enlace(s) de evidencia"}
                                                    </label>
                                                    <input
                                                      id={`evid-${e.id}`}
                                                      type="url"
                                                      value={evidenciaInput[e.id] ?? ""}
                                                      onChange={(ev) =>
                                                        setEvidenciaInput((v) => ({ ...v, [e.id]: ev.target.value }))
                                                      }
                                                      placeholder="https://drive.google.com/..."
                                                      disabled={!!sinEvidencia[e.id]}
                                                      className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                                                    />
                                                    <label className="mt-1 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                                      <input
                                                        type="checkbox"
                                                        checked={!!sinEvidencia[e.id]}
                                                        onChange={(ev) =>
                                                          setSinEvidencia((v) => ({ ...v, [e.id]: ev.target.checked }))
                                                        }
                                                      />
                                                      No aplica evidencia (excepción justificada)
                                                    </label>
                                                    {sinEvidencia[e.id] && (
                                                      <textarea
                                                        value={justificacionInput[e.id] ?? ""}
                                                        onChange={(ev) =>
                                                          setJustificacionInput((v) => ({ ...v, [e.id]: ev.target.value }))
                                                        }
                                                        rows={2}
                                                        placeholder="Explica por qué no hay evidencia (mínimo 10 caracteres)"
                                                        className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                      />
                                                    )}
                                                  </div>
                                                )}
                                                {candidatos[e.id] && (
                                                  <div>
                                                    <label className="text-xs text-gray-500 font-medium" htmlFor={`ini-${e.id}`}>
                                                      Iniciativa a la que corresponde
                                                    </label>
                                                    <select
                                                      id={`ini-${e.id}`}
                                                      value={iniciativaElegida[e.id] ?? ""}
                                                      onChange={(ev) =>
                                                        setIniciativaElegida((v) => ({ ...v, [e.id]: Number(ev.target.value) }))
                                                      }
                                                      className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                                                    >
                                                      <option value="">Selecciona…</option>
                                                      {candidatos[e.id].map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                          {c.titulo ?? `Iniciativa ${c.id}`}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                )}
                                                {avisos[e.id] && (
                                                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                                                    {avisos[e.id]}
                                                  </p>
                                                )}
                                                <div className="flex items-center gap-3">
                                                  <button
                                                    type="button"
                                                    disabled={guardando}
                                                    onClick={() => handleEnviar(e)}
                                                    className="text-xs text-white bg-[#1e3a8a] hover:bg-[#1d4ed8] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                                    style={{ fontWeight: 600 }}
                                                  >
                                                    {esReenvio ? "Reenviar corrección" : "Enviar para revisión"}
                                                  </button>
                                                  {guardando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                          <p
                                            className="text-xs text-gray-500 uppercase tracking-wider mb-1"
                                            style={{ fontWeight: 600 }}
                                          >
                                            Descripción del entregable
                                          </p>
                                          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                                            {e.descripcion_evidencia
                                              ? parseTextWithLinks(
                                                  e.descripcion_evidencia
                                                )
                                              : e.entregable}
                                          </p>
                                          <div className="mt-3 flex flex-wrap gap-4 items-start">
                                            <div className="space-y-1 text-xs text-gray-600 min-w-0">
                                              <p>
                                                <span style={{ fontWeight: 600 }}>
                                                  Fecha programada:{" "}
                                                </span>
                                                {progInicio && progFin
                                                  ? `${formatDate(progInicio)} - ${formatDate(progFin)}`
                                                  : "—"}
                                              </p>
                                              {e.iniciativa && (
                                                <p>
                                                  <span style={{ fontWeight: 600 }}>
                                                    Iniciativa:{" "}
                                                  </span>
                                                  {e.iniciativa.titulo ?? `#${e.iniciativa.id}`}
                                                </p>
                                              )}
                                              {e.fecha_real_entrega ? (
                                                <p className={fechaRealClass}>
                                                  <span
                                                    style={{ fontWeight: 600 }}
                                                  >
                                                    Fecha real entrega:{" "}
                                                  </span>
                                                  {formatDate(
                                                    e.fecha_real_entrega
                                                  )}
                                                </p>
                                              ) : (
                                                <p className="text-gray-500">
                                                  <span
                                                    style={{ fontWeight: 600 }}
                                                  >
                                                    Fecha real entrega:{" "}
                                                  </span>
                                                  —
                                                </p>
                                              )}
                                              {e.fecha_primer_envio && (
                                                <p>
                                                  <span style={{ fontWeight: 600 }}>
                                                    Primer envío:{" "}
                                                  </span>
                                                  {formatDate(e.fecha_primer_envio)}
                                                </p>
                                              )}
                                              {e.entregable_id != null && !bloqueado && e.estado !== "no_iniciado" && (
                                                <div className="flex flex-col gap-1 pt-2">
                                                  <label className="text-xs text-gray-500 font-medium">
                                                    Fecha real de entrega
                                                  </label>
                                                  <input
                                                    type="date"
                                                    key={`dr-${e.id}-${e.entregable_id ?? "x"}-${e.fecha_real_entrega ?? ""}`}
                                                    defaultValue={
                                                      e.fecha_real_entrega ?? ""
                                                    }
                                                    max={hoy ?? undefined}
                                                    onClick={(ev) =>
                                                      ev.stopPropagation()
                                                    }
                                                    onBlur={(ev) => {
                                                      if (
                                                        ev.target.value &&
                                                        e.entregable_id
                                                      ) {
                                                        handleUpdateFechaEntrega(
                                                          e.entregable_id,
                                                          ev.target.value
                                                        );
                                                      }
                                                    }}
                                                    className="text-sm border border-gray-300 rounded px-2 py-1 w-40 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                  />
                                                  {e.fecha_real_entrega &&
                                                    e.fecha_fin_calculada &&
                                                    e.fecha_real_entrega >
                                                      e.fecha_fin_calculada && (
                                                      <span className="text-xs text-red-600">
                                                        Entrega fuera de plazo
                                                      </span>
                                                    )}
                                                </div>
                                              )}
                                              <p>
                                                <span style={{ fontWeight: 600 }}>
                                                  Indicador:{" "}
                                                </span>
                                                {e.fase}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </li>
                                  );
                                          })}
                                        </ul>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {groupedByMonthPhase.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
              <p className="text-gray-400 text-sm">
                No hay entregables con los filtros seleccionados
              </p>
              <button
                onClick={() => {
                  setFilterMonth(ALL);
                  setFilterCategory(ALL);
                  setFilterExcelStatus(ALL);
                }}
                className="mt-3 text-sm text-[#1d4ed8] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
