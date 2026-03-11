import { useState, useMemo } from "react";
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
  deliverables,
  computeStatus,
  categoryConfig,
  statusConfig,
  getComplianceStats,
  MONTHS,
  MONTH_COLORS,
  type MonthName,
  type Category,
  type DeliveryStatus,
} from "../data/matrizData";
import { StatusBadge } from "../components/StatusBadge";
import { CategoryTag } from "../components/CategoryTag";

const ALL = "all";

export default function MatrizSeguimiento() {
  const navigate = useNavigate();

  // ── Filters ──
  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  // ── Stats ──
  const stats = getComplianceStats();

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
  }, [filterMonth, filterCategory, filterStatus]);

  const grouped = useMemo(() => {
    const months = filterMonth === ALL ? MONTHS : [filterMonth as MonthName];
    return months
      .map((month) => ({
        month,
        items: filtered.filter((d) => d.month === month),
      }))
      .filter((g) => g.items.length > 0);
  }, [filtered, filterMonth]);

  const toggleCollapse = (month: string) => {
    setCollapsed((prev) => ({ ...prev, [month]: !prev[month] }));
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Matriz de Seguimiento</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Ciclo 2024-II · {deliverables.length} entregables programados · Semana 6 en curso
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
                Semana 6 de 16
              </span>
            </div>
          </div>
        </div>

        {/* Monthly mini cards */}
        {stats.byMonth.map((m) => (
          <div
            key={m.month}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilterMonth(filterMonth === m.month ? ALL : m.month)}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full text-white ${MONTH_COLORS[m.month as MonthName]}`}
                style={{ fontWeight: 600 }}
              >
                {m.month}
              </span>
              <span className={`text-sm ${m.pct === 100 ? "text-emerald-600" : m.pct > 0 ? "text-amber-600" : "text-gray-400"}`} style={{ fontWeight: 700 }}>
                {m.pct}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${m.pct}%`,
                  backgroundColor: m.pct === 100 ? "#10b981" : m.pct > 0 ? "#f59e0b" : "#e5e7eb",
                }}
              />
            </div>
            <p className="text-gray-400 text-xs mt-1.5">{m.done}/{m.total} entregables</p>
          </div>
        ))}
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

      {/* Matrix table grouped by month */}
      <div className="space-y-4">
        {grouped.map(({ month, items }) => (
          <div key={month} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Month header */}
            <button
              onClick={() => toggleCollapse(month)}
              className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${MONTH_COLORS[month as MonthName]} shrink-0`}
              />
              <span className="text-gray-800 text-sm" style={{ fontWeight: 700 }}>
                {month} 2024
              </span>
              <span className="text-xs text-gray-400">
                {items.filter((d) => d.actualDate).length}/{items.length} completados
              </span>
              <div className="flex-1 mx-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((items.filter((d) => d.actualDate).length / items.length) * 100)}%`,
                    backgroundColor: MONTH_COLORS[month as MonthName].includes("violet")
                      ? "#7c3aed" : MONTH_COLORS[month as MonthName].includes("teal")
                      ? "#0d9488" : MONTH_COLORS[month as MonthName].includes("emerald")
                      ? "#059669" : "#1e3a8a",
                  }}
                />
              </div>
              {collapsed[month] ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>

            {!collapsed[month] && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 w-16">Sem.</th>
                      <th className="text-left px-3 py-2.5 w-32">Fechas</th>
                      <th className="text-left px-3 py-2.5 w-14">Horas</th>
                      <th className="text-left px-3 py-2.5 w-36">Categoría</th>
                      <th className="text-left px-3 py-2.5 w-48">Entregable</th>
                      <th className="text-left px-3 py-2.5">Indicador</th>
                      <th className="text-left px-3 py-2.5 w-28">F. Programada</th>
                      <th className="text-left px-3 py-2.5 w-28">F. Entrega real</th>
                      <th className="text-left px-3 py-2.5 w-36">Estado</th>
                      <th className="text-left px-3 py-2.5 w-16">Evidencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((d) => {
                      const status = computeStatus(d.scheduledDate, d.actualDate);
                      const catCfg = categoryConfig[d.category];
                      const isCurrent = status === "semana_en_curso";
                      const isExpanded = expandedRow === d.id;

                      return (
                        <React.Fragment key={d.id}>
                          <tr
                            onClick={() => setExpandedRow(isExpanded ? null : d.id)}
                            className={`cursor-pointer border-l-4 transition-colors ${catCfg.border} ${
                              isCurrent
                                ? "bg-blue-50/60 hover:bg-blue-50"
                                : "hover:bg-gray-50/80"
                            }`}
                          >
                            {/* Semana */}
                            <td className="px-4 py-2.5">
                              <span
                                className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded"
                                style={{ fontWeight: 600 }}
                              >
                                S{d.week}
                              </span>
                            </td>

                            {/* Fechas inicio - cierre */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{d.startDate}</span>
                                <span className="text-gray-300">—</span>
                                <span>{d.endDate}</span>
                              </div>
                            </td>

                            {/* Horas */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3 shrink-0" />
                                {d.hours}h
                              </div>
                            </td>

                            {/* Categoría */}
                            <td className="px-3 py-2.5">
                              <CategoryTag category={d.category} compact />
                            </td>

                            {/* Entregable */}
                            <td className="px-3 py-2.5">
                              <p
                                className="text-gray-800 text-xs leading-snug line-clamp-2"
                                style={{ fontWeight: 500 }}
                              >
                                {d.deliverable}
                              </p>
                            </td>

                            {/* Indicador */}
                            <td className="px-3 py-2.5">
                              <p className="text-gray-500 text-xs line-clamp-1">{d.indicator}</p>
                            </td>

                            {/* F. Programada */}
                            <td className="px-3 py-2.5">
                              <span className="text-xs text-gray-600">
                                {new Date(d.scheduledDate + "T12:00:00").toLocaleDateString("es-PE", {
                                  day: "2-digit", month: "short",
                                })}
                              </span>
                            </td>

                            {/* F. Real */}
                            <td className="px-3 py-2.5">
                              {d.actualDate ? (
                                <span className="text-xs text-gray-600">
                                  {new Date(d.actualDate + "T12:00:00").toLocaleDateString("es-PE", {
                                    day: "2-digit", month: "short",
                                  })}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>

                            {/* Estado */}
                            <td className="px-3 py-2.5">
                              <StatusBadge status={status} pulse />
                            </td>

                            {/* Evidencia */}
                            <td className="px-3 py-2.5">
                              {d.evidence ? (
                                <a
                                  href={d.evidence}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded description row */}
                          {isExpanded && (
                            <tr
                              className={`border-l-4 ${catCfg.border} ${catCfg.bg}`}
                            >
                              <td colSpan={10} className="px-5 py-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                  <div className="sm:col-span-2">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>
                                      Descripción del entregable
                                    </p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{d.description}</p>
                                  </div>
                                  <div className="space-y-2">
                                    <div>
                                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>
                                        Indicador asociado
                                      </p>
                                      <p className="text-sm text-gray-700">{d.indicator}</p>
                                    </div>
                                    {d.evidence && (
                                      <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>
                                          Evidencia
                                        </p>
                                        <a
                                          href={d.evidence}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                          {d.evidence.length > 40 ? d.evidence.slice(0, 40) + "…" : d.evidence}
                                        </a>
                                      </div>
                                    )}
                                    {!d.actualDate && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); navigate("/docente/reportar"); }}
                                        className="mt-2 text-xs text-white bg-[#1e3a8a] hover:bg-[#1d4ed8] px-3 py-1.5 rounded-lg transition-colors"
                                        style={{ fontWeight: 500 }}
                                      >
                                        + Reportar este entregable
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {grouped.length === 0 && (
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
  );
}