import { useState, useMemo, useEffect } from "react";
import React from "react";
import { useLocation, useNavigate } from "react-router";
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
  type Category,
} from "../data/matrizConstants";
import { CategoryTag } from "../components/CategoryTag";
import { AppSelect } from "../components/AppSelect";
import { useCurrentSemester, useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

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
  completado: boolean;
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

type ExcelEstatusKey = "completado" | "en_curso" | "vencido" | "no_iniciada";

const EXCEL_STATUS_OPTIONS: { value: ExcelEstatusKey; label: string }[] = [
  { value: "completado", label: "Completado" },
  { value: "en_curso", label: "En Curso" },
  { value: "vencido", label: "Vencido" },
  { value: "no_iniciada", label: "No iniciada" },
];

function computeEstatus(item: EntregableMatriz): {
  label: string;
  key: ExcelEstatusKey;
  color: string;
  bg: string;
  dot: string;
} {
  if (item.completado) {
    return {
      label: "Completado",
      key: "completado",
      color: "text-green-700",
      bg: "bg-green-100",
      dot: "bg-green-500",
    };
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = item.fecha_inicio_calculada
    ? new Date(`${item.fecha_inicio_calculada}T12:00:00`)
    : null;
  const fin = item.fecha_fin_calculada
    ? new Date(`${item.fecha_fin_calculada}T12:00:00`)
    : null;
  if (inicio) inicio.setHours(0, 0, 0, 0);
  if (fin) fin.setHours(0, 0, 0, 0);

  if (fin && fin < hoy) {
    return {
      label: "Vencido",
      key: "vencido",
      color: "text-red-700",
      bg: "bg-red-100",
      dot: "bg-red-500",
    };
  }
  if (inicio && inicio <= hoy && (!fin || fin >= hoy)) {
    return {
      label: "En Curso",
      key: "en_curso",
      color: "text-blue-700",
      bg: "bg-blue-100",
      dot: "bg-blue-500",
    };
  }
  return {
    label: "No iniciada",
    key: "no_iniciada",
    color: "text-gray-600",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
  };
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
  resumen: {
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
    porcentaje_mensual: number;
    porcentaje_esperado: number;
  }[];
  por_semana: {
    semana_numero: number;
    mes: string;
    total: number;
    completados: number;
    porcentaje_semanal: number;
    porcentaje_acumulado: number;
    porcentaje_esperado_acumulado: number;
  }[];
}

function categoryUi(c: string): Category {
  if (c in categoryConfig) return c as Category;
  return "proyecto";
}

const formatDate = (iso: string) =>
  new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

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
  const currentSemester = useCurrentSemester();

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
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(
    null
  );
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [savingPlantilla, setSavingPlantilla] = useState<Record<number, boolean>>(
    {}
  );

  useEffect(() => {
    const userId = currentUser?.id ?? null;

    if (!userId) {
      setEntregables([]);
      setMatrizStats(null);
      setLoadingMatrix(false);
      return;
    }

    const load = async () => {
      try {
        setLoadingMatrix(true);
        const [resPerfil, resMatriz, resStats] = await Promise.all([
          fetch(`${API_BASE}/docente/${userId}/perfil`),
          fetch(`${API_BASE}/docente/${userId}/matriz`),
          fetch(`${API_BASE}/docente/${userId}/matriz-stats`),
        ]);
        if (!resMatriz.ok) throw new Error("Error al cargar matriz");
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
          });
        } else {
          setPerfil(null);
        }
        if (resStats.ok) {
          setMatrizStats(await resStats.json());
        } else {
          setMatrizStats(null);
        }
      } catch (err) {
        console.error(err);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setEntregables([]);
        setMatrizStats(null);
        setPerfil(null);
      } finally {
        setLoadingMatrix(false);
      }
    };

    load();
  }, [currentUser?.id]);

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

  const handleToggleCompletado = async (item: EntregableMatriz) => {
    const uid = currentUser?.id;
    if (!uid) return;
    const next = !item.completado;
    const prevSnapshot = { ...item };
    setSavingPlantilla((s) => ({ ...s, [item.id]: true }));
    setEntregables((list) =>
      list.map((x) => (x.id === item.id ? { ...x, completado: next } : x))
    );
    try {
      const res = await fetch(
        `${API_BASE}/docente/${uid}/matriz/${item.id}/completar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completado: next,
            url_evidencia: item.url_evidencia,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        semana_numero?: number;
        entregable_id?: number;
        fecha_real_entrega?: string | null;
        fecha_cargue_evidencia?: string | null;
      };
      if (res.status === 422) {
        setEntregables((list) =>
          list.map((x) => (x.id === item.id ? prevSnapshot : x))
        );
        const sn = data.semana_numero ?? item.semana_numero;
        notify.warning(
          `Para marcar este entregable necesitas tener una iniciativa asignada en la semana ${sn}. Pide al administrador que te asigne una.`
        );
        return;
      }
      if (!res.ok) {
        setEntregables((list) =>
          list.map((x) => (x.id === item.id ? prevSnapshot : x))
        );
        notify.fromError(
          data,
          "No se pudo guardar el estado del entregable."
        );
        return;
      }
      const eid =
        data.entregable_id != null ? Number(data.entregable_id) : item.entregable_id;
      setEntregables((list) =>
        list.map((x) =>
          x.id === item.id
            ? {
                ...x,
                completado: next,
                entregable_id: eid ?? x.entregable_id,
                fecha_real_entrega: next
                  ? data.fecha_real_entrega ?? x.fecha_real_entrega
                  : null,
                fecha_cargue_evidencia: next
                  ? data.fecha_cargue_evidencia ?? x.fecha_cargue_evidencia
                  : null,
              }
            : x
        )
      );
      notify.success(next ? "Entregable marcado como completado" : "Entregable desmarcado");
      const resStats = await fetch(`${API_BASE}/docente/${uid}/matriz-stats`);
      if (resStats.ok) setMatrizStats(await resStats.json());
    } catch {
      setEntregables((list) =>
        list.map((x) => (x.id === item.id ? prevSnapshot : x))
      );
      notify.error("Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  const stats = useMemo(() => {
    if (matrizStats?.resumen) {
      const {
        total_entregables,
        completados,
        porcentaje_semestral,
        porcentaje_esperado,
        cumplimiento_esperado,
        exigibles_a_fecha,
        brecha,
      } = matrizStats.resumen;
      return {
        total: total_entregables,
        completed: completados,
        pct: Math.round(porcentaje_semestral),
        expectedPct: Math.round(porcentaje_esperado),
        compliancePct: Math.round(cumplimiento_esperado),
        due: exigibles_a_fecha,
        gap: Math.round(brecha),
        byMonth:
          matrizStats.por_mes?.map((m) => ({
            month: m.mes,
            total: m.total,
            done: m.completados,
            pct: Math.round(m.porcentaje_mensual),
            expectedPct: Math.round(m.porcentaje_esperado),
          })) ?? [],
      };
    }
    const total = entregables.length;
    const completed = entregables.filter((e) =>
      isDeliverableCompleted({
        completado: e.completado,
        fecha_real_entrega: e.fecha_real_entrega,
      })
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = entregables.filter(
      (item) =>
        item.fecha_fin_calculada &&
        new Date(`${item.fecha_fin_calculada}T23:59:59`) <= today
    ).length;
    const expectedPct = total > 0 ? Math.round((due / total) * 100) : 0;
    const months = [
      ...new Set(entregables.map((item) => item.mes.trim()).filter(Boolean)),
    ];
    const byMonth = months.map((month) => {
      const items = entregables.filter((e) => e.mes === month);
      const done = items.filter((e) =>
        isDeliverableCompleted({
          completado: e.completado,
          fecha_real_entrega: e.fecha_real_entrega,
        })
      ).length;
      return {
        month,
        total: items.length,
        done,
        pct: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
        expectedPct: 0,
      };
    });
    return {
      total,
      completed,
      pct,
      expectedPct,
      compliancePct: due > 0 ? Math.round((completed / due) * 100) : 100,
      due,
      gap: pct - expectedPct,
      byMonth,
    };
  }, [matrizStats, entregables]);

  const semesterReferenceWeek = useMemo(() => {
    if (!currentSemester?.fecha_inicio) return 1;
    const ref = new Date(`${currentSemester.fecha_inicio}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(
      (today.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24)
    );
    const w = Math.floor(diffDays / 7) + 1;
    return Math.min(currentSemester.numero_semanas, Math.max(1, w));
  }, [currentSemester]);

  const semesterMetrics = useMemo(() => {
    const weeks = matrizStats?.por_semana ?? [];
    const cur =
      weeks.find((w) => w.semana_numero === semesterReferenceWeek) ?? null;
    const weeklyPct = cur ? Math.round(cur.porcentaje_semanal) : 0;
    const accPct = cur ? Math.round(cur.porcentaje_acumulado) : 0;
    const semPct = matrizStats?.resumen
      ? Math.round(matrizStats.resumen.porcentaje_semestral)
      : stats.pct;
    const totalG = matrizStats?.resumen.total_entregables ?? stats.total;

    return {
      weekly: {
        title: "Avance Semanal",
        subLabel: `Semana ${semesterReferenceWeek}`,
        numerator: cur?.completados ?? 0,
        denominator: cur?.total ?? 0,
        pct: weeklyPct,
      },
      accumulated: {
        title: "Avance Acumulado",
        subLabel: "A la fecha",
        numerator: cur
          ? Math.round((cur.porcentaje_acumulado / 100) * totalG)
          : 0,
        denominator: totalG,
        pct: accPct,
      },
      semestral: {
        title: "Avance Semestral",
        subLabel: "Total semestre",
        numerator: matrizStats?.resumen.completados ?? stats.completed,
        denominator: totalG,
        pct: semPct,
      },
    };
  }, [matrizStats, semesterReferenceWeek, stats]);

  const currentWeekNumber = useMemo(() => {
    const curr = entregables.find(
      (e) => computeEstatus(e).key === "en_curso"
    );
    return curr?.semana_numero ?? semesterReferenceWeek;
  }, [entregables, semesterReferenceWeek]);

  const currentWeekLabel = useMemo(() => {
    const curr = entregables.find(
      (e) => computeEstatus(e).key === "en_curso"
    );
    return curr
      ? `Semana ${curr.semana_numero} en curso`
      : `Semana ${semesterReferenceWeek} (referencia)`;
  }, [entregables, semesterReferenceWeek]);

  const filtered = useMemo(() => {
    return entregables.filter((e) => {
      const key = computeEstatus(e).key;
      return (
        (filterMonth === ALL || e.mes === filterMonth) &&
        (filterCategory === ALL || e.categoria === filterCategory) &&
        (filterExcelStatus === ALL || key === filterExcelStatus)
      );
    });
  }, [entregables, filterMonth, filterCategory, filterExcelStatus]);

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

  const complianceColor =
    stats.compliancePct >= 100
      ? "text-emerald-600"
      : stats.compliancePct >= 90
      ? "text-blue-600"
      : stats.compliancePct >= 75
      ? "text-amber-600"
      : "text-red-600";

  const MetricCard = ({
    title,
    subLabel,
    numerator,
    denominator,
    pct,
  }: {
    title: string;
    subLabel: string;
    numerator: number;
    denominator: number;
    pct: number;
  }) => {
    const empty = denominator === 0;
    const sem = semaphoreClasses(pct, empty);
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
          {empty ? "Sin entregables" : subLabel}
        </p>

        <p className={`text-3xl mt-3 ${sem.pct}`} style={{ fontWeight: 850 }}>
          {empty ? "—" : `${pct}%`}
        </p>

        {!empty && (
          <p className="text-xs text-gray-500 mt-1">
            {numerator} / {denominator} entregables
          </p>
        )}

        <div
          className={`w-full h-2 ${sem.barTrack} rounded-full overflow-hidden mt-3`}
        >
          <div
            className={`h-full ${sem.barFill} rounded-full transition-all`}
            style={{ width: empty ? "0%" : `${pct}%` }}
          />
        </div>
      </div>
    );
  };

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
              Reportar entregable
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
                    stroke={
                      stats.pct >= 80
                        ? "#10b981"
                        : stats.pct >= 60
                        ? "#f59e0b"
                        : "#ef4444"
                    }
                    strokeWidth="3"
                    strokeDasharray={`${stats.pct} ${100 - stats.pct}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={`text-lg ${complianceColor}`}
                    style={{ fontWeight: 800 }}
                  >
                    {stats.pct}%
                  </span>
                </div>
              </div>
              <div>
                <p
                  className="text-gray-500 text-xs"
                  style={{ fontWeight: 500 }}
                >
                  Avance real del semestre
                </p>
                <p
                  className="text-gray-800 mt-1"
                  style={{ fontWeight: 700, fontSize: 20 }}
                >
                  {stats.completed} / {stats.total}
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  entregables completados
                </p>
                <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs">
                  <p className="font-semibold text-amber-800">
                    Esperado a hoy: {stats.expectedPct}%
                  </p>
                  <p className={stats.gap >= 0 ? "text-emerald-700" : "text-red-700"}>
                    Cumplimiento: {stats.compliancePct}% · Brecha {stats.gap >= 0 ? "+" : ""}
                    {stats.gap} pts
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span
                    className="text-xs text-emerald-600"
                    style={{ fontWeight: 500 }}
                  >
                    Semana {currentWeekNumber ?? "—"} de 16
                  </span>
                </div>
              </div>
            </div>

            {stats.byMonth.map((m) => {
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
                    {m.done} / {m.total} entregables
                  </p>
                  {!empty && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Esperado: {m.expectedPct}%
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard {...semesterMetrics.weekly} />
            <MetricCard {...semesterMetrics.accumulated} />
            <MetricCard {...semesterMetrics.semestral} />
          </div>

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
                    {EXCEL_STATUS_OPTIONS.map((opt) => {
                      const dot =
                        opt.value === "completado"
                          ? "bg-green-500"
                          : opt.value === "en_curso"
                          ? "bg-blue-500"
                          : opt.value === "vencido"
                          ? "bg-red-500"
                          : "bg-gray-400";
                      return (
                        <div key={opt.value} className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${dot} shrink-0`} />
                          <span className="text-xs text-gray-600">{opt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Filter className="w-4 h-4" /> Filtrar:
            </div>

            <AppSelect
              value={filterMonth}
              onValueChange={(value) => setFilterMonth(value)}
              options={[
                { value: ALL, label: "Todos los meses" },
                ...availableMonths.map((m) => ({ value: m, label: m })),
              ]}
            />

            <AppSelect
              value={filterCategory}
              onValueChange={(value) => setFilterCategory(value)}
              options={[
                { value: ALL, label: "Todas las categorías" },
                ...Object.entries(categoryConfig).map(([key, cfg]) => ({
                  value: key,
                  label: cfg.label,
                })),
              ]}
            />

            <AppSelect
              value={filterExcelStatus}
              onValueChange={(value) => setFilterExcelStatus(value)}
              options={[
                { value: ALL, label: "Todos los estados" },
                ...EXCEL_STATUS_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                })),
              ]}
            />

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
                isDeliverableCompleted({
                  completado: e.completado,
                  fecha_real_entrega: e.fecha_real_entrega,
                })
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
                      · Progreso: {mDone}/{mTotal} ({mTotal ? `${mPct}%` : "—"})
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
                                      (i) => i.completado
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
                                              completados
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
                                            const estatus = computeEstatus(e);
                                            const catCfg =
                                              categoryConfig[
                                                categoryUi(e.categoria)
                                              ];
                                            const isCurrent =
                                              estatus.key === "en_curso";
                                            const isExpanded =
                                              expandedRow === e.id;

                                            const progInicio =
                                              e.fecha_inicio_calculada;
                                            const progFin =
                                              e.fecha_fin_calculada;
                                  let fechaRealClass = "text-gray-700";
                                  if (
                                    e.fecha_real_entrega &&
                                    progFin
                                  ) {
                                    const tReal = new Date(
                                      e.fecha_real_entrega + "T12:00:00"
                                    ).getTime();
                                    const tLim = new Date(
                                      progFin + "T12:00:00"
                                    ).getTime();
                                    fechaRealClass =
                                      tReal > tLim
                                        ? "text-red-600"
                                        : "text-green-700";
                                  }

                                  return (
                                    <li
                                      key={e.id}
                                      id={`entregable-${e.id}`}
                                      className={
                                        e.id === notificationTemplateId
                                          ? "scroll-mt-24 rounded-lg ring-2 ring-blue-400 ring-offset-2"
                                          : undefined
                                      }
                                    >
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
                                            <span className="inline-flex items-center gap-1">
                                              <Clock className="w-3.5 h-3.5" />
                                              {e.horas}h
                                            </span>
                                            {e.url_evidencia ? (
                                              <a
                                                href={e.url_evidencia}
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
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                          <span className="font-semibold text-gray-500">
                                            Iniciativa:
                                          </span>
                                          <span className="text-gray-800">
                                            {e.iniciativa_titulo}
                                          </span>
                                          {e.tiene_excepcion && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                                              Ajuste individual
                                            </span>
                                          )}
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
                                      </div>
                                      {isExpanded && (
                                        <div
                                          className={`px-4 py-3 text-sm border-l-4 ${catCfg.border} ${catCfg.bg}`}
                                        >
                                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border mb-3">
                                            <input
                                              type="checkbox"
                                              id={`completar-${e.id}`}
                                              checked={e.completado}
                                              disabled={!!savingPlantilla[e.id]}
                                              onChange={() =>
                                                handleToggleCompletado(e)
                                              }
                                              onClick={(ev) =>
                                                ev.stopPropagation()
                                              }
                                              className="w-5 h-5 rounded accent-green-600 cursor-pointer disabled:opacity-50"
                                            />
                                            <label
                                              htmlFor={`completar-${e.id}`}
                                              className="text-sm font-medium text-gray-700 cursor-pointer"
                                              onClick={(ev) =>
                                                ev.stopPropagation()
                                              }
                                            >
                                              {e.completado
                                                ? "Entregable completado"
                                                : "Marcar como completado"}
                                            </label>
                                            {savingPlantilla[e.id] ? (
                                              <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
                                            ) : null}
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
                                          {e.enlace_referencia && (
                                            <a
                                              href={e.enlace_referencia}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(ev) => ev.stopPropagation()}
                                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              Abrir recurso o formulario de referencia
                                            </a>
                                          )}
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
                                              {e.fecha_cargue_evidencia && (
                                                <p className="pt-1 text-gray-600">
                                                  <span style={{ fontWeight: 600 }}>
                                                    Registro automático: {" "}
                                                  </span>
                                                  {new Date(e.fecha_cargue_evidencia).toLocaleString(
                                                    "es-CO",
                                                    {
                                                      dateStyle: "medium",
                                                      timeStyle: "short",
                                                    }
                                                  )}
                                                </p>
                                              )}
                                              {e.fecha_real_entrega &&
                                                e.fecha_fin_calculada &&
                                                e.fecha_real_entrega >
                                                  e.fecha_fin_calculada && (
                                                  <span className="text-xs text-red-600">
                                                    Entrega fuera de plazo
                                                  </span>
                                                )}
                                              <p>
                                                <span style={{ fontWeight: 600 }}>
                                                  Indicador:{" "}
                                                </span>
                                                {e.fase}
                                              </p>
                                            </div>
                                          </div>
                                          {!isDeliverableCompleted({
                                            completado: e.completado,
                                            fecha_real_entrega:
                                              e.fecha_real_entrega,
                                          }) && (
                                            <button
                                              type="button"
                                              onClick={(ev) => {
                                                ev.stopPropagation();
                                                const query = new URLSearchParams({
                                                  plantilla: String(e.id),
                                                });
                                                if (e.iniciativa_id != null) {
                                                  query.set(
                                                    "iniciativa",
                                                    String(e.iniciativa_id)
                                                  );
                                                }
                                                navigate(
                                                  `/docente/reportar?${query.toString()}`
                                                );
                                              }}
                                              className="mt-3 text-xs text-white bg-[#1e3a8a] hover:bg-[#1d4ed8] px-3 py-1.5 rounded-lg transition-colors"
                                              style={{ fontWeight: 500 }}
                                            >
                                              + Reportar este entregable
                                            </button>
                                          )}
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
