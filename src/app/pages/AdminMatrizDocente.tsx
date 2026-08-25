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
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  categoryConfig,
  type Category,
} from "../data/matrizConstants";
import { CategoryTag } from "../components/CategoryTag";
import { AppSelect } from "../components/AppSelect";
import { useConfirmationDialog } from "../components/ConfirmationDialog";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { toDateOnly } from "../lib/date";

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

type ExcelEstatusKey = "completado" | "en_curso" | "vencido" | "no_iniciada";

const EXCEL_STATUS_OPTIONS: { value: ExcelEstatusKey; label: string }[] = [
  { value: "completado", label: "Completado" },
  { value: "en_curso", label: "En Curso" },
  { value: "vencido", label: "Vencido" },
  { value: "no_iniciada", label: "No iniciada" },
];

function computeEstatus(item: EntregableMatrizAdmin): {
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

const formatDate = (iso: string) =>
  new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function categoryUi(c: string): Category {
  if (c in categoryConfig) return c as Category;
  return "proyecto";
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
  }[];
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

  const [filterMonth, setFilterMonth] = useState<string>(ALL);
  const [filterCategory, setFilterCategory] = useState<string>(ALL);
  const [filterExcelStatus, setFilterExcelStatus] = useState<string>(ALL);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedPhase, setCollapsedPhase] = useState<Record<string, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [iniciativas, setIniciativas] = useState<IniciativaAsignada[]>([]);
  const [exceptionItem, setExceptionItem] = useState<EntregableMatrizAdmin | null>(null);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION_FORM);
  const [savingException, setSavingException] = useState(false);

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
        setEntregables([]);
        setMatrizStats(null);
        setPerfil(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAdmin, docenteId]);

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

  const pctSemestral = Math.round(
    matrizStats?.resumen.porcentaje_semestral ?? perfil?.stats?.porcentaje_avance ?? 0
  );
  const totalTpl = matrizStats?.resumen.total_entregables ?? perfil?.stats?.total_plantillas ?? 0;
  const doneTpl = matrizStats?.resumen.completados ?? perfil?.stats?.completados ?? 0;
  const expectedPct = Math.round(matrizStats?.resumen.porcentaje_esperado ?? 0);
  const expectedCompliance = Math.round(
    matrizStats?.resumen.cumplimiento_esperado ?? 100
  );

  const vencidosCount = useMemo(
    () => entregables.filter((e) => computeEstatus(e).key === "vencido").length,
    [entregables]
  );

  const availableMonths = useMemo(
    () => [...new Set(entregables.map((item) => item.mes.trim()).filter(Boolean))],
    [entregables]
  );

  const vencidosPorMes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of availableMonths) {
      map[m] = entregables.filter(
        (e) => e.mes === m && computeEstatus(e).key === "vencido"
      ).length;
    }
    return map;
  }, [availableMonths, entregables]);

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

  const badgePctClass =
    pctSemestral >= 70 ? "bg-green-100 text-green-800" : pctSemestral >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

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
              {pctSemestral}% semestral
            </span>
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
          <p className="text-xs text-gray-500 uppercase">% Avance semestral</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pctSemestral}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Avance esperado a hoy</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{expectedPct}%</p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Cumplimiento esperado</p>
          <p
            className={`text-3xl font-bold mt-1 ${
              expectedCompliance >= 100 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {expectedCompliance}%
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Completados / total</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {doneTpl} / {totalTpl}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase">Vencidos sin completar</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{vencidosCount}</p>
        </div>
      </div>

      {matrizStats && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Avance por mes</h3>
          </div>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">Mes</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Completados</th>
                <th className="text-left px-4 py-2">Vencidos</th>
                <th className="text-left px-4 py-2">% Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {matrizStats.por_mes.map((row) => {
                const vac = vencidosPorMes[row.mes] ?? 0;
                const pct = row.total > 0 ? Math.round(row.porcentaje_mensual) : 0;
                return (
                  <tr key={row.mes}>
                    <td className="px-4 py-2 font-medium text-gray-800">{row.mes}</td>
                    <td className="px-4 py-2 text-gray-600">{row.total}</td>
                    <td className="px-4 py-2 text-gray-600">{row.completados}</td>
                    <td className="px-4 py-2 text-gray-600">{vac}</td>
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
          const mDone = items.filter((e) => e.completado).length;
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
                  · {mDone}/{mTotal} ({mPct}%)
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
                                  const completadosSemana = semanaItems.filter((i) => i.completado).length;
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
                                            {completadosSemana}/{totalSemana} completados
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
                                          const estatus = computeEstatus(e);
                                          const catCfg = categoryConfig[categoryUi(e.categoria)];
                                          const isCurrent = estatus.key === "en_curso";
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
                                                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${estatus.bg} ${estatus.color}`}
                                                    >
                                                      <span className={`w-1.5 h-1.5 rounded-full ${estatus.dot}`} />
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
                                                        className="inline-flex text-blue-700 p-1"
                                                        onClick={(ev) => ev.stopPropagation()}
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
                                                      Excepción individual
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
                                                      <span className="font-semibold">Fecha real: </span>
                                                      {e.fecha_real_entrega ? formatDate(e.fecha_real_entrega) : "—"}
                                                    </p>
                                                    {e.fecha_cargue_evidencia && (
                                                      <p>
                                                        <span className="font-semibold">
                                                          Registro automático: {" "}
                                                        </span>
                                                        {new Date(
                                                          e.fecha_cargue_evidencia
                                                        ).toLocaleString("es-CO", {
                                                          dateStyle: "medium",
                                                          timeStyle: "short",
                                                        })}
                                                      </p>
                                                    )}
                                                    <p>
                                                      <span className="font-semibold">Estado revisión: </span>
                                                      {e.estado_revision ?? "—"}
                                                    </p>
                                                    {e.comentario_revision ? (
                                                      <p className="text-amber-800 bg-amber-50 rounded p-2 mt-2">
                                                        <span className="font-semibold">Comentario admin: </span>
                                                        {e.comentario_revision}
                                                      </p>
                                                    ) : null}
                                                    {e.url_evidencia && (
                                                      <p>
                                                        <a
                                                          href={e.url_evidencia}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-blue-600 underline"
                                                        >
                                                          Abrir evidencia
                                                        </a>
                                                      </p>
                                                    )}
                                                  </div>
                                                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                                                    <button
                                                      type="button"
                                                      onClick={() => openExceptionModal(e)}
                                                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                                                    >
                                                      <Pencil className="h-3.5 w-3.5" />
                                                      {e.tiene_excepcion
                                                        ? "Editar excepción"
                                                        : "Crear excepción"}
                                                    </button>
                                                    {e.tiene_excepcion && (
                                                      <button
                                                        type="button"
                                                        onClick={() => void removeException(e)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                                                      >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                        Restablecer grupo
                                                      </button>
                                                    )}
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
        <p className="text-center text-gray-400 text-sm py-8">No hay entregables con los filtros seleccionados.</p>
      )}

      {exceptionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Ajuste individual del entregable
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Solo afectará a {nombreDocente}; la plantilla del grupo permanecerá intacta.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Entregable</label>
                <textarea
                  rows={3}
                  value={exceptionForm.entregable_override}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      entregable_override: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">
                  Descripción de la evidencia
                </label>
                <textarea
                  rows={4}
                  value={exceptionForm.descripcion_evidencia_override}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      descripcion_evidencia_override: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">
                  Enlace o formulario de referencia
                </label>
                <input
                  type="url"
                  placeholder="https://"
                  value={exceptionForm.enlace_referencia_override}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      enlace_referencia_override: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Fecha exacta de inicio
                </label>
                <input
                  type="date"
                  value={exceptionForm.fecha_inicio_override}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      fecha_inicio_override: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Fecha límite exacta
                </label>
                <input
                  type="date"
                  value={exceptionForm.fecha_fin_override}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      fecha_fin_override: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">
                  Iniciativa asociada
                </label>
                <AppSelect
                  value={exceptionForm.proyecto_id || "__inherit__"}
                  onValueChange={(value) =>
                    setExceptionForm((form) => ({
                      ...form,
                      proyecto_id: value === "__inherit__" ? "" : value,
                    }))
                  }
                  className="mt-1 w-full"
                  options={[
                    { value: "__inherit__", label: "Inferir desde el entregable" },
                    ...iniciativas.map((initiative) => ({
                      value: String(initiative.id),
                      label: `${initiative.titulo} · ${initiative.tipo}`,
                    })),
                  ]}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600">
                  Motivo del ajuste <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={2}
                  value={exceptionForm.motivo}
                  onChange={(event) =>
                    setExceptionForm((form) => ({
                      ...form,
                      motivo: event.target.value,
                    }))
                  }
                  placeholder="Ej.: ampliación aprobada por convenio gubernamental"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setExceptionItem(null)}
                disabled={savingException}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveException()}
                disabled={savingException}
                className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingException ? "Guardando…" : "Guardar ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
