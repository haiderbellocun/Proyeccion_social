import { useEffect, useMemo, useState } from "react";
import React from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Clock,
} from "lucide-react";
import {
  categoryConfig,
  estadoEntregableConfig,
  etiquetaSemana,
  MONTHS,
  type Category,
  type EstadoEntregable,
  type IndicadoresSeguimiento,
  type MonthName,
  type SemanaActual,
} from "../data/matrizConstants";
import { formatFecha } from "../lib/fechas";
import { CategoryTag } from "../components/CategoryTag";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE } from "../config/api";

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
  completado: boolean;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  fecha_real_entrega: string | null;
  fecha_primer_envio: string | null;
  fecha_ultimo_envio: string | null;
  num_envios: number;
  url_evidencia: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  iniciativa: { id: number; titulo: string | null; tipo: string | null } | null;
  estado_revision: string | null;
  comentario_revision?: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
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
  stats?: {
    total_plantillas: number;
    completados: number;
    porcentaje_avance: number;
    reportados?: number;
    aprobados?: number;
  };
}

type ExcelEstatusKey = EstadoEntregable | "vencido";

// El estado y la condición "vencido" los calcula el backend (misma regla para todas las pantallas).
const EXCEL_STATUS_OPTIONS: { value: ExcelEstatusKey; label: string }[] = [
  { value: "aprobado", label: estadoEntregableConfig.aprobado.label },
  { value: "enviado", label: estadoEntregableConfig.enviado.label },
  { value: "observado", label: estadoEntregableConfig.observado.label },
  { value: "borrador", label: estadoEntregableConfig.borrador.label },
  { value: "no_iniciado", label: estadoEntregableConfig.no_iniciado.label },
  { value: "vencido", label: "Vencido (condición)" },
];

function matchesStatusFilter(item: EntregableMatrizAdmin, f: string): boolean {
  if (f === "vencido") return item.vencido;
  return item.estado === f;
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

const formatDate = (iso: string) => formatFecha(iso);

function categoryUi(c: string): Category {
  if (c in categoryConfig) return c as Category;
  return "proyecto";
}

interface MatrizStatsPayload {
  resumen: Partial<IndicadoresSeguimiento> & {
    total_entregables: number;
    completados: number;
    porcentaje_semestral: number;
  };
  por_mes: {
    mes: string;
    total: number;
    completados: number;
    reportados: number;
    aprobados: number;
    esperado: number;
    observados: number;
    vencidos: number;
    porcentaje_mensual: number;
    pct_reportado: number;
    pct_aprobado: number;
    pct_esperado: number;
  }[];
  semana_actual?: SemanaActual;
}

export default function AdminMatrizDocente() {
  const navigate = useNavigate();
  const { docenteId: docenteIdParam } = useParams<{ docenteId: string }>();
  const docenteId = Number(docenteIdParam);
  const currentUser = useCurrentUser();

  const [entregables, setEntregables] = useState<EntregableMatrizAdmin[]>([]);
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(null);
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(true);

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
        setError(null);
        const [resPerfil, resMatriz, resStats] = await Promise.all([
          fetch(`${API_BASE}/admin/docentes/${docenteId}/perfil`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz-stats`),
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
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "No se pudo cargar la información.");
        setEntregables([]);
        setMatrizStats(null);
        setPerfil(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAdmin, docenteId]);

  const resumen = matrizStats?.resumen;
  const totalTpl = resumen?.total_entregables ?? perfil?.stats?.total_plantillas ?? 0;
  const reportados = resumen?.reportados ?? resumen?.completados ?? perfil?.stats?.completados ?? 0;
  const aprobados = resumen?.aprobados ?? perfil?.stats?.aprobados ?? 0;
  const pctReportado = Math.round(
    resumen?.pct_reportado ?? resumen?.porcentaje_semestral ?? perfil?.stats?.porcentaje_avance ?? 0
  );
  const pctAprobado = Math.round(resumen?.pct_aprobado ?? 0);
  const pctEsperado = Math.round(resumen?.pct_esperado ?? 0);
  const brecha = resumen?.brecha ?? 0;
  const vencidosCount = resumen?.vencidos ?? entregables.filter((e) => e.vencido).length;
  const semanaActual = matrizStats?.semana_actual ?? null;

  const filtered = useMemo(() => {
    return entregables.filter(
      (e) =>
        (filterMonth === ALL || e.mes === filterMonth) &&
        (filterCategory === ALL || e.categoria === filterCategory) &&
        (filterExcelStatus === ALL || matchesStatusFilter(e, filterExcelStatus))
    );
  }, [entregables, filterMonth, filterCategory, filterExcelStatus]);

  const groupedByMonthPhase = useMemo(() => {
    const months: MonthName[] =
      filterMonth === ALL ? [...MONTHS] : [filterMonth as MonthName];
    const blocks: {
      month: MonthName;
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
  }, [filtered, filterMonth]);

  const phaseKey = (month: string, phase: string) => `${month}||${phase}`;
  const toggleCollapse = (month: string) => {
    setCollapsed((prev) => ({ ...prev, [month]: !prev[month] }));
  };
  const togglePhaseCollapse = (month: string, phase: string) => {
    const k = phaseKey(month, phase);
    setCollapsedPhase((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const badgePctClass =
    pctReportado >= 70 ? "bg-green-100 text-green-800" : pctReportado >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-red-600">No autorizado. Solo administradores.</p>
      </div>
    );
  }

  if (!docenteId || Number.isNaN(docenteId)) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Docente no válido.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const nombreDocente = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : "Docente";

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-gray-900 text-xl font-semibold">
              Matriz de Seguimiento — {nombreDocente}
            </h1>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${badgePctClass}`}>
              {pctReportado}% reportado · {pctAprobado}% aprobado
            </span>
            {semanaActual && (
              <span className="text-xs text-gray-500">{etiquetaSemana(semanaActual)}</span>
            )}
          </div>
        </div>
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
                  <p className="text-xs text-gray-500">{perfil.programa?.nombre ?? "—"}</p>
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
                    { label: "Proyectos", value: perfil.grupo_matriz.num_proyectos, color: "bg-indigo-100 text-indigo-700" },
                    { label: "Actividades", value: perfil.grupo_matriz.num_actividades, color: "bg-purple-100 text-purple-700" },
                    { label: "Conv. Nuevos", value: perfil.grupo_matriz.num_convenios_nuevos, color: "bg-green-100 text-green-700" },
                    { label: "Conv. Dinamizados", value: perfil.grupo_matriz.num_convenios_dinamizados, color: "bg-orange-100 text-orange-700" },
                  ]
                    .filter((i) => i.value > 0)
                    .map((i) => (
                      <span key={i.label} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${i.color}`}>
                        {i.value} {i.label}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Avance reportado</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pctReportado}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {reportados} / {totalTpl} enviados o aprobados
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Avance aprobado</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pctAprobado}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {aprobados} / {totalTpl} aprobados
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Avance esperado</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pctEsperado}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {resumen?.esperado ?? 0} con fecha límite hasta hoy
            {resumen?.cumplimiento_exigible != null
              ? ` · ${Math.round(resumen.cumplimiento_exigible)}% aprobado de lo exigible`
              : ""}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Brecha (aprobados − esperados)</p>
          <p className={`text-3xl font-bold mt-1 ${brecha < 0 ? "text-red-600" : "text-gray-900"}`}>
            {brecha > 0 ? `+${brecha}` : brecha}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {resumen?.enviados_pendientes_revision ?? 0} por revisar · {resumen?.observados ?? 0} observados
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Vencidos</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{vencidosCount}</p>
          <p className="text-xs text-gray-400 mt-1">Sin enviar o sin corregir tras su fecha límite</p>
        </div>
      </div>

      {matrizStats && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Avance por mes</h3>
          </div>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">Mes</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Reportados</th>
                <th className="text-left px-4 py-2">Aprobados</th>
                <th className="text-left px-4 py-2">Esperados</th>
                <th className="text-left px-4 py-2">Vencidos</th>
                <th className="text-left px-4 py-2">% Reportado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matrizStats.por_mes.map((row) => {
                const pct = row.total > 0 ? Math.round(row.pct_reportado ?? row.porcentaje_mensual) : 0;
                return (
                  <tr key={row.mes}>
                    <td className="px-4 py-2 font-medium text-gray-800">{row.mes}</td>
                    <td className="px-4 py-2 text-gray-600">{row.total}</td>
                    <td className="px-4 py-2 text-gray-600">{row.reportados ?? row.completados}</td>
                    <td className="px-4 py-2 text-gray-600">{row.aprobados}</td>
                    <td className="px-4 py-2 text-gray-600">{row.esperado}</td>
                    <td className="px-4 py-2 text-gray-600">{row.vencidos}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[120px] h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-gray-700 tabular-nums w-10">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
            <Info className="w-4 h-4 text-gray-400" />
            Leyenda de categorías y estados
          </div>
          {showLegend ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showLegend && (
          <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Categorías</p>
              <div className="grid gap-1">
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-sm ${cfg.dot}`} />
                    <span className="text-xs text-gray-600">{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-2 font-semibold">Estados</p>
              <div className="grid gap-1">
                {EXCEL_STATUS_OPTIONS.map((opt) => (
                  <span key={opt.value} className="text-xs text-gray-600">
                    {opt.label}
                  </span>
                ))}
                <span className="text-[11px] text-gray-400 mt-1">
                  Reportado = enviado o aprobado. Vencido no reemplaza el estado: se muestra además de él.
                </span>
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
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value={ALL}>Todos los meses</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
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
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value={ALL}>Todos los estados</option>
          {EXCEL_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {(filterMonth !== ALL || filterCategory !== ALL || filterExcelStatus !== ALL) && (
          <button
            type="button"
            onClick={() => {
              setFilterMonth(ALL);
              setFilterCategory(ALL);
              setFilterExcelStatus(ALL);
            }}
            className="text-xs text-blue-700 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} entregables</span>
      </div>

      <div className="space-y-4">
        {groupedByMonthPhase.map(({ month, items, phases }) => {
          const mDone = items.filter((e) => e.estado === "enviado" || e.estado === "aprobado").length;
          const mTotal = items.length;
          const mPct = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;

          return (
            <div key={month} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCollapse(month)}
                className="w-full flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-gray-50 text-left"
              >
                <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="font-semibold text-gray-800 text-sm">{month}</span>
                <span className="text-xs text-gray-500">
                  · {mDone}/{mTotal} reportados ({mPct}%)
                </span>
                {collapsed[month] ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronUp className="w-4 h-4 ml-auto" />}
              </button>

              {!collapsed[month] && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-3 space-y-2">
                  {phases.map(({ phase, items: phaseItems }) => {
                    const pk = phaseKey(month, phase);
                    const phaseCollapsed = collapsedPhase[pk];
                    return (
                      <div key={pk} className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                        <button
                          type="button"
                          onClick={() => togglePhaseCollapse(month, phase)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50/80 border-b border-gray-50"
                        >
                          {phaseCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{phase}</span>
                          <span className="text-[11px] text-gray-400">{phaseItems.length} entregables</span>
                        </button>

                        {!phaseCollapsed &&
                          (() => {
                            const byWeek = new Map<number, EntregableMatrizAdmin[]>();
                            for (const it of phaseItems) {
                              const w = it.semana_numero;
                              if (!byWeek.has(w)) byWeek.set(w, []);
                              byWeek.get(w)!.push(it);
                            }
                            const weekNums = [...byWeek.keys()].sort((a, b) => a - b);
                            return (
                              <div className="divide-y divide-gray-100">
                                {weekNums.map((weekNum) => {
                                  const semanaItems = byWeek.get(weekNum)!;
                                  const mesHeader = semanaItems[0]?.mes ?? "";
                                  const completadosSemana = semanaItems.filter((i) => i.estado === "enviado" || i.estado === "aprobado").length;
                                  const totalSemana = semanaItems.length;
                                  const horasSemana = semanaItems.reduce((acc, i) => acc + (i.horas || 0), 0);
                                  return (
                                    <div key={weekNum}>
                                      <div className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-50 border-b border-gray-100 gap-2">
                                        <span className="font-semibold text-sm text-gray-800">
                                          Semana {weekNum}
                                          {mesHeader ? ` · ${mesHeader}` : ""}
                                        </span>
                                        <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">
                                          <span className="text-gray-500">{horasSemana}h</span>
                                          <span
                                            className={`font-medium text-xs sm:text-sm ${
                                              completadosSemana === totalSemana
                                                ? "text-green-600"
                                                : completadosSemana === 0
                                                ? "text-gray-400"
                                                : "text-blue-600"
                                            }`}
                                          >
                                            {completadosSemana}/{totalSemana} reportados
                                          </span>
                                          <div className="w-12 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                            <div
                                              className="h-full bg-green-500 rounded-full transition-all"
                                              style={{
                                                width: `${
                                                  totalSemana > 0
                                                    ? (completadosSemana / totalSemana) * 100
                                                    : 0
                                                }%`,
                                              }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <ul className="divide-y divide-gray-50">
                                        {semanaItems.map((e) => {
                                          const estatus = estadoEntregableConfig[e.estado] ?? estadoEntregableConfig.no_iniciado;
                                          const catCfg = categoryConfig[categoryUi(e.categoria)];
                                          const isCurrent =
                                            semanaActual?.numero != null && e.semana_numero === semanaActual.numero;
                                          const isExpanded = expandedRow === e.id;
                                          const progInicio = e.fecha_inicio_calculada;
                                          const progFin = e.fecha_fin_calculada;

                                          return (
                                            <li key={e.id}>
                                              <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setExpandedRow(isExpanded ? null : e.id)}
                                                onKeyDown={(ev) => {
                                                  if (ev.key === "Enter" || ev.key === " ") {
                                                    ev.preventDefault();
                                                    setExpandedRow(isExpanded ? null : e.id);
                                                  }
                                                }}
                                                className={`px-4 py-3 cursor-pointer border-l-4 transition-colors ${catCfg.border} ${
                                                  isCurrent ? "bg-blue-50/50" : "hover:bg-gray-50/90"
                                                }`}
                                              >
                                                <div className="flex flex-wrap items-start gap-3">
                                                  <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                                    <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-semibold">
                                                      {e.numero != null && e.numero !== 0 ? `#${e.numero}` : `S${e.semana_numero}`}
                                                    </span>
                                                    <CategoryTag category={categoryUi(e.categoria)} compact />
                                                    <span className="text-sm text-gray-900 font-semibold leading-snug">{e.entregable}</span>
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 shrink-0">
                                                    <span
                                                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${estatus.badge}`}
                                                    >
                                                      <span className={`w-1.5 h-1.5 rounded-full ${estatus.dot}`} />
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
                                                    {e.url_evidencia ? (
                                                      <a
                                                        href={e.url_evidencia}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex text-blue-700 p-1"
                                                        onClick={(ev) => ev.stopPropagation()}
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
                                                </div>
                                              </div>
                                              {isExpanded && (
                                                <div className={`px-4 py-3 text-sm border-l-4 ${catCfg.border} ${catCfg.bg}`}>
                                                  <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                                                    Descripción evidencia
                                                  </p>
                                                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                                                    {e.descripcion_evidencia
                                                      ? parseTextWithLinks(e.descripcion_evidencia)
                                                      : e.entregable}
                                                  </p>
                                                  <div className="mt-3 space-y-1 text-xs text-gray-600">
                                                    <p>
                                                      <span className="font-semibold">Fecha programada: </span>
                                                      {progInicio && progFin
                                                        ? `${formatDate(progInicio)} - ${formatDate(progFin)}`
                                                        : "—"}
                                                    </p>
                                                    <p>
                                                      <span className="font-semibold">Fecha límite: </span>
                                                      {progFin ? formatDate(progFin) : "—"}
                                                    </p>
                                                    <p>
                                                      <span className="font-semibold">Fecha real de entrega: </span>
                                                      {e.fecha_real_entrega ? formatDate(e.fecha_real_entrega) : "—"}
                                                    </p>
                                                    <p className={e.entrega_tardia ? "text-red-600" : undefined}>
                                                      <span className="font-semibold">Primer envío: </span>
                                                      {e.fecha_primer_envio ? formatDate(e.fecha_primer_envio) : "—"}
                                                      {e.entrega_tardia ? " · entrega tardía" : ""}
                                                      {e.fecha_ultimo_envio && e.num_envios > 1
                                                        ? ` · último reenvío ${formatDate(e.fecha_ultimo_envio)} (${e.num_envios} envíos)`
                                                        : ""}
                                                    </p>
                                                    <p>
                                                      <span className="font-semibold">Estado: </span>
                                                      {estatus.label}
                                                      {e.vencido ? " (vencido)" : ""}
                                                    </p>
                                                    {e.iniciativa && (
                                                      <p>
                                                        <span className="font-semibold">Iniciativa: </span>
                                                        {e.iniciativa.titulo ?? `#${e.iniciativa.id}`}
                                                      </p>
                                                    )}
                                                    {e.evidencia_exenta && (
                                                      <p className="text-amber-800 bg-amber-50 rounded p-2 mt-2">
                                                        <span className="font-semibold">Sin evidencia — justificación del docente: </span>
                                                        {e.justificacion_exencion || "—"}
                                                      </p>
                                                    )}
                                                    {e.comentario_revision ? (
                                                      <p className="text-amber-800 bg-amber-50 rounded p-2 mt-2">
                                                        <span className="font-semibold">Comentario admin: </span>
                                                        {e.comentario_revision}
                                                      </p>
                                                    ) : null}
                                                    {(e.evidencias && e.evidencias.length > 0
                                                      ? e.evidencias
                                                      : e.url_evidencia
                                                      ? [e.url_evidencia]
                                                      : []
                                                    ).map((u, i) => (
                                                      <p key={u}>
                                                        <a
                                                          href={u}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-blue-600 underline"
                                                        >
                                                          Abrir evidencia{(e.evidencias?.length ?? 0) > 1 ? ` ${i + 1}` : ""}
                                                        </a>
                                                      </p>
                                                    ))}
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

      {groupedByMonthPhase.length === 0 && !error && (
        <p className="text-center text-gray-400 text-sm py-8">No hay entregables con los filtros seleccionados.</p>
      )}
    </div>
  );
}
