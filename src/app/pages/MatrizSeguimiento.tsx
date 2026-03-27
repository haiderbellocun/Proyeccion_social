import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import {
  computeStatus,
  computeSimpleStatus,
  isDeliverableCompleted,
  categoryConfig,
  statusConfig,
  MONTHS,
  type MonthName,
  type Deliverable,
} from "../data/matrizData";
import { CategoryTag } from "../components/CategoryTag";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

const ALL = "all";
const API_BASE_URL = API_BASE;

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

const SIMPLE_STATUS_LABEL: Record<
  ReturnType<typeof computeSimpleStatus>,
  string
> = {
  completado: "Completado",
  pendiente: "Pendiente",
  atrasado: "Atrasado",
};

const SIMPLE_STATUS_STYLE: Record<
  ReturnType<typeof computeSimpleStatus>,
  string
> = {
  completado: "bg-green-100 text-green-700",
  pendiente: "bg-gray-100 text-gray-600",
  atrasado: "bg-red-100 text-red-700",
};

export default function MatrizSeguimiento() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();

  // ── Filters ──
  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = currentUser?.id ?? null;

    if (!userId) {
      setDeliverables([]);
      setLoadingMatrix(false);
      return;
    }

    const load = async () => {
      try {
        setLoadingMatrix(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/docente/${userId}/matriz`);
        if (!res.ok) throw new Error("Error al cargar matriz");
        const data = await res.json();
        setDeliverables(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
        setDeliverables([]);
      } finally {
        setLoadingMatrix(false);
      }
    };

    load();
  }, [currentUser]);

  // ── Stats (calculadas en base a los entregables reales) ──
  const stats = useMemo(() => {
    const total = deliverables.length;
    const completed = deliverables.filter((d) => isDeliverableCompleted(d)).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const months: MonthName[] = ["Febrero", "Marzo", "Abril", "Mayo"];
    const byMonth = months.map((month) => {
      const items = deliverables.filter((d) => d.month === month);
      const done = items.filter((d) => isDeliverableCompleted(d)).length;
      return {
        month,
        total: items.length,
        done,
        pct: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
      };
    });

    return { total, completed, pct, byMonth };
  }, [deliverables]);

  // ── Baja 1: Métricas semanales / acumuladas / semestrales ──
  const semesterReferenceWeek = useMemo(() => {
    const ref = new Date("2025-02-03T00:00:00");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
    const rawWeek = Math.ceil(diffDays / 7);
    return Math.min(16, Math.max(1, rawWeek));
  }, []);

  const todayNoon = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }, []);

  const semesterMetrics = useMemo(() => {
    const weekItems = deliverables.filter((d) => d.week === semesterReferenceWeek);
    const weekDen = weekItems.length;
    const weekNum = weekItems.filter((d) => isDeliverableCompleted(d)).length;
    const weekPct = weekDen > 0 ? Math.round((weekNum / weekDen) * 100) : 0;

    const accItems = deliverables.filter((d) => {
      const scheduled = d.scheduledDate
        ? new Date(d.scheduledDate + "T12:00:00")
        : null;
      return scheduled ? scheduled.getTime() <= todayNoon.getTime() : false;
    });
    const accDen = accItems.length;
    const accNum = accItems.filter((d) => isDeliverableCompleted(d)).length;
    const accPct = accDen > 0 ? Math.round((accNum / accDen) * 100) : 0;

    const semDen = deliverables.length;
    const semNum = deliverables.filter((d) => isDeliverableCompleted(d)).length;
    const semPct = semDen > 0 ? Math.round((semNum / semDen) * 100) : 0;

    return {
      weekly: {
        title: "Avance Semanal",
        subLabel: `Semana ${semesterReferenceWeek}`,
        numerator: weekNum,
        denominator: weekDen,
        pct: weekPct,
      },
      accumulated: {
        title: "Avance Acumulado",
        subLabel: "A la fecha",
        numerator: accNum,
        denominator: accDen,
        pct: accPct,
      },
      semestral: {
        title: "Avance Semestral",
        subLabel: "Total semestre",
        numerator: semNum,
        denominator: semDen,
        pct: semPct,
      },
    };
  }, [deliverables, semesterReferenceWeek, todayNoon]);

  const currentWeekLabel = useMemo(() => {
    const curr = deliverables.find(
      (d) => computeStatus(d.scheduledDate, d.actualDate) === "semana_en_curso"
    );
    return curr ? `Semana ${curr.week} en curso` : "Semana en curso";
  }, [deliverables]);

  const currentWeekNumber = useMemo(() => {
    const curr = deliverables.find(
      (d) => computeStatus(d.scheduledDate, d.actualDate) === "semana_en_curso"
    );
    return curr ? curr.week : null;
  }, [deliverables]);

  // ── Filtered + grouped data ──
  const filtered = useMemo(() => {
    return deliverables.filter((d) => {
      const status = computeStatus(d.scheduledDate, d.actualDate);
      return (
        (filterMonth === ALL || d.month === filterMonth) &&
        (filterCategory === ALL || d.category === filterCategory) &&
        (filterStatus === ALL || status === filterStatus)
      );
    });
  }, [deliverables, filterMonth, filterCategory, filterStatus]);

  const groupedByMonthPhase = useMemo(() => {
    const months: MonthName[] =
      filterMonth === ALL ? [...MONTHS] : [filterMonth as MonthName];

    const blocks: {
      month: MonthName;
      items: Deliverable[];
      phases: { phase: string; items: Deliverable[] }[];
    }[] = [];

    for (const month of months) {
      const items = filtered.filter((d) => d.month === month);
      if (items.length === 0) continue;

      const phaseMap = new Map<string, Deliverable[]>();
      for (const d of items) {
        const ph = (d.phase && d.phase.trim()) || d.indicator || "Sin fase";
        if (!phaseMap.has(ph)) phaseMap.set(ph, []);
        phaseMap.get(ph)!.push(d);
      }

      const phases = Array.from(phaseMap.entries()).map(([phase, phItems]) => ({
        phase,
        items: [...phItems].sort(
          (a, b) =>
            a.week - b.week ||
            (a.numero ?? 0) - (b.numero ?? 0) ||
            a.deliverable.localeCompare(b.deliverable)
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

  // ─── Compliance color ───
  const complianceColor =
    stats.pct >= 90
      ? "text-emerald-600"
      : stats.pct >= 80
      ? "text-blue-600"
      : stats.pct >= 60
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
        <p className="text-gray-500 text-xs uppercase tracking-wider" style={{ fontWeight: 650 }}>
          {title}
        </p>
        <p className={`text-xs mt-1 ${empty ? "text-gray-500" : "text-gray-600"}`} style={{ fontWeight: 600 }}>
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

        <div className={`w-full h-2 ${sem.barTrack} rounded-full overflow-hidden mt-3`}>
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
          <span className="ml-3 text-sm text-gray-500" style={{ fontWeight: 500 }}>
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Matriz de Seguimiento</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Ciclo · {deliverables.length} entregables programados · {currentWeekLabel}
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

      {/* Compliance + Monthly summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {/* Overall compliance */}
        <div className="sm:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-5">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f0f0f0" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={stats.pct >= 80 ? "#10b981" : stats.pct >= 60 ? "#f59e0b" : "#ef4444"}
                strokeWidth="3"
                strokeDasharray={`${stats.pct} ${100 - stats.pct}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg ${complianceColor}`} style={{ fontWeight: 800 }}>
                {stats.pct}%
              </span>
            </div>
          </div>
          <div>
            <p className="text-gray-500 text-xs" style={{ fontWeight: 500 }}>Cumplimiento general</p>
            <p className="text-gray-800 mt-1" style={{ fontWeight: 700, fontSize: 20 }}>
              {stats.completed} / {stats.total}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">entregables completados</p>
            <div className="flex items-center gap-1.5 mt-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-600" style={{ fontWeight: 500 }}>
                Semana {currentWeekNumber ?? "—"} de 16
              </span>
            </div>
          </div>
        </div>

        {/* Semáforo mensual (progreso por mes) */}
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
                <span className={`text-lg tabular-nums ${sem.pct}`} style={{ fontWeight: 800 }}>
                  {empty ? "—" : `${m.pct}%`}
                </span>
              </div>
              <div className={`w-full h-2 ${sem.barTrack} rounded-full overflow-hidden mt-2`}>
                <div
                  className={`h-full ${sem.barFill} rounded-full transition-all`}
                  style={{ width: empty ? "0%" : `${m.pct}%` }}
                />
              </div>
              <p className={`text-xs mt-2 ${empty ? "text-gray-400" : sem.label}`}>
                {m.done} / {m.total} entregables
              </p>
            </button>
          );
        })}
      </div>

      {/* Baja 1: Métricas semanales / acumuladas / semestrales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard {...semesterMetrics.weekly} />
        <MetricCard {...semesterMetrics.accumulated} />
        <MetricCard {...semesterMetrics.semestral} />
      </div>

      {/* Legend toggle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 text-sm text-gray-700" style={{ fontWeight: 500 }}>
            <Info className="w-4 h-4 text-gray-400" />
            Leyenda de categorías y estados
          </div>
          {showLegend ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showLegend && (
          <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2" style={{ fontWeight: 600 }}>
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
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2" style={{ fontWeight: 600 }}>
                Estados de seguimiento
              </p>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${cfg.dot} shrink-0`} />
                    <span className="text-xs text-gray-600">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
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
          {MONTHS.map((m) => <option key={m}>{m}</option>)}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
        >
          <option value={ALL}>Todas las categorías</option>
          {Object.entries(categoryConfig).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
        >
          <option value={ALL}>Todos los estados</option>
          {Object.entries(statusConfig).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        {(filterMonth !== ALL || filterCategory !== ALL || filterStatus !== ALL) && (
          <button
            onClick={() => { setFilterMonth(ALL); setFilterCategory(ALL); setFilterStatus(ALL); }}
            className="text-xs text-[#1d4ed8] hover:underline"
          >
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} entregable{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Lista por mes y fase temática */}
      <div className="space-y-4">
        {groupedByMonthPhase.map(({ month, items, phases }) => {
          const mDone = items.filter((d) => isDeliverableCompleted(d)).length;
          const mTotal = items.length;
          const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
          const sem = semaphoreClasses(mPct, mTotal === 0);
          const yearHint =
            items[0]?.scheduledDate &&
            new Date(items[0].scheduledDate + "T12:00:00").getFullYear();

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
                <span className="text-gray-800 text-sm" style={{ fontWeight: 800 }}>
                  {month}
                  {yearHint ? ` ${yearHint}` : ""}
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
                            {phaseItems.length === 1 ? "entregable" : "entregables"}
                          </span>
                        </button>

                        {!phaseCollapsed && (
                          <ul className="divide-y divide-gray-50">
                            {phaseItems.map((d) => {
                              const filterStatusVal = computeStatus(
                                d.scheduledDate,
                                d.actualDate
                              );
                              const simple = computeSimpleStatus(d);
                              const catCfg = categoryConfig[d.category];
                              const isCurrent =
                                filterStatusVal === "semana_en_curso";
                              const isExpanded = expandedRow === d.id;

                              return (
                                <li key={d.id}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      setExpandedRow(
                                        isExpanded ? null : d.id
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setExpandedRow(
                                          isExpanded ? null : d.id
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
                                          {d.numero != null && d.numero !== 0
                                            ? `#${d.numero}`
                                            : `S${d.week}`}
                                        </span>
                                        <CategoryTag category={d.category} compact />
                                        <span
                                          className="text-sm text-gray-900 leading-snug"
                                          style={{ fontWeight: 600 }}
                                        >
                                          {d.deliverable}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 shrink-0">
                                        <span className="inline-flex items-center gap-1">
                                          <Clock className="w-3.5 h-3.5" />
                                          {d.hours}h
                                        </span>
                                        <span
                                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${SIMPLE_STATUS_STYLE[simple]}`}
                                        >
                                          {SIMPLE_STATUS_LABEL[simple]}
                                        </span>
                                        {d.evidence ? (
                                          <a
                                            href={d.evidence}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex text-[#1d4ed8] hover:text-[#1e3a8a] p-1"
                                            onClick={(e) => e.stopPropagation()}
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
                                        {d.startDate} – {d.endDate}
                                      </span>
                                      <span className="text-gray-300 mx-1">·</span>
                                      <span className="text-gray-400">
                                        F. límite:{" "}
                                        {d.scheduledDate
                                          ? new Date(
                                              d.scheduledDate + "T12:00:00"
                                            ).toLocaleDateString("es-CO", {
                                              day: "2-digit",
                                              month: "short",
                                            })
                                          : "—"}
                                      </span>
                                    </div>
                                  </div>
                                  {isExpanded && (
                                    <div
                                      className={`px-4 py-3 text-sm border-l-4 ${catCfg.border} ${catCfg.bg}`}
                                    >
                                      <p
                                        className="text-xs text-gray-500 uppercase tracking-wider mb-1"
                                        style={{ fontWeight: 600 }}
                                      >
                                        Descripción del entregable
                                      </p>
                                      <p className="text-gray-700 leading-relaxed">
                                        {d.description}
                                      </p>
                                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                                        <span>
                                          <span style={{ fontWeight: 600 }}>
                                            Indicador:{" "}
                                          </span>
                                          {d.indicator}
                                        </span>
                                        {d.actualDate && (
                                          <span>
                                            <span style={{ fontWeight: 600 }}>
                                              Entrega real:{" "}
                                            </span>
                                            {new Date(
                                              d.actualDate + "T12:00:00"
                                            ).toLocaleDateString("es-CO", {
                                              day: "2-digit",
                                              month: "short",
                                            })}
                                          </span>
                                        )}
                                      </div>
                                      {!isDeliverableCompleted(d) && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate("/docente/reportar");
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
                        )}
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
          <p className="text-gray-400 text-sm">No hay entregables con los filtros seleccionados</p>
          <button
            onClick={() => { setFilterMonth(ALL); setFilterCategory(ALL); setFilterStatus(ALL); }}
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