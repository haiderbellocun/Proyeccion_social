import { useEffect, useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";

interface MetricasPayload {
  resumen: {
    total_reportes: number;
    aprobados: number;
    pendientes: number;
    con_observaciones: number;
    porcentaje_aprobacion: number;
  };
  por_mes: {
    mes: string;
    total: number;
    aprobados: number;
    observados: number;
    pendientes: number;
  }[];
  por_grupo: {
    grupo_id: number;
    grupo_nombre: string;
    tipo_docente: "ANTIGUO" | "NUEVO";
    total_docentes: number;
    entregables_completados: number;
    entregables_total: number;
    porcentaje: number;
  }[];
  por_regional: { regional: string; docentes: number; porcentaje_avance: number }[];
  top_atrasados: {
    docente_id: number;
    nombre: string;
    programa: string;
    regional: string;
    grupo: string;
    entregables_vencidos: number;
    porcentaje_avance: number;
  }[];
}

function TipoDocenteBadge({ tipo }: { tipo: "ANTIGUO" | "NUEVO" }) {
  const nuevo = tipo === "NUEVO";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        nuevo ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {tipo}
    </span>
  );
}

export default function ReportsMetrics() {
  const session = useCurrentUser();
  const [data, setData] = useState<MetricasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/admin/metricas`);
        if (!res.ok) throw new Error("Error métricas");
        setData(await res.json());
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar las métricas. Intente más tarde.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const fechaTitulo = useMemo(
    () =>
      new Date().toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const chartPorMes = useMemo(
    () =>
      (data?.por_mes ?? []).map((r) => ({
        mes: r.mes,
        Aprobados: r.aprobados,
        Observados: r.observados,
        Pendientes: r.pendientes,
      })),
    [data?.por_mes]
  );

  const r = data?.resumen;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-[#1d4ed8] rounded-full animate-spin" />
        <span className="ml-3 text-sm text-gray-500">Cargando métricas…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      )}

      <div>
        <h1 className="text-gray-900" style={{ fontWeight: 700 }}>
          Reportes y Métricas
        </h1>
        <p className="text-gray-500 text-sm mt-0.5 capitalize">
          {fechaTitulo}
          {session?.correo ? (
            <span className="not-lowercase text-gray-400"> · {session.correo}</span>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-500 text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
            Total reportes
          </p>
          <p className="text-2xl text-gray-900 mt-2" style={{ fontWeight: 800 }}>
            {r?.total_reportes ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 bg-emerald-50/40 shadow-sm p-5">
          <p className="text-emerald-800 text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
            Aprobados
          </p>
          <p className="text-2xl text-emerald-700 mt-2" style={{ fontWeight: 800 }}>
            {r?.aprobados ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 bg-amber-50/40 shadow-sm p-5">
          <p className="text-amber-900 text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
            Pendientes
          </p>
          <p className="text-2xl text-amber-800 mt-2" style={{ fontWeight: 800 }}>
            {r?.pendientes ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-orange-100 bg-orange-50/40 shadow-sm p-5">
          <p className="text-orange-900 text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
            Con observaciones
          </p>
          <p className="text-2xl text-orange-800 mt-2" style={{ fontWeight: 800 }}>
            {r?.con_observaciones ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-blue-100 bg-blue-50/40 shadow-sm p-5">
          <p className="text-blue-900 text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
            % Aprobación
          </p>
          <p className="text-2xl text-blue-800 mt-2" style={{ fontWeight: 800 }}>
            {r?.porcentaje_aprobacion ?? 0}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-gray-800 mb-4" style={{ fontWeight: 600 }}>
          Reportes por mes (ciclo Feb–May)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartPorMes}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Aprobados" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Observados" fill="#f97316" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Pendientes" fill="#9ca3af" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800" style={{ fontWeight: 600 }}>
            Cumplimiento por grupo de matriz
          </h3>
          <p className="text-gray-500 text-xs mt-0.5">Entregables de plantilla marcados como completados</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Grupo</th>
                <th className="text-left px-6 py-3">Tipo</th>
                <th className="text-left px-6 py-3">Docentes</th>
                <th className="text-left px-6 py-3">Completados</th>
                <th className="text-left px-6 py-3">Total</th>
                <th className="text-left px-6 py-3 min-w-[200px]">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.por_grupo ?? []).map((g) => (
                <tr key={g.grupo_id}>
                  <td className="px-6 py-3 text-gray-800" style={{ fontWeight: 500 }}>
                    {g.grupo_nombre}
                  </td>
                  <td className="px-6 py-3">
                    <TipoDocenteBadge tipo={g.tipo_docente} />
                  </td>
                  <td className="px-6 py-3 text-gray-600">{g.total_docentes}</td>
                  <td className="px-6 py-3 text-gray-600">{g.entregables_completados}</td>
                  <td className="px-6 py-3 text-gray-600">{g.entregables_total}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                        <div
                          className="h-full bg-[#1d4ed8] rounded-full transition-all"
                          style={{ width: `${Math.min(100, g.porcentaje)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 tabular-nums w-12">{g.porcentaje}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800" style={{ fontWeight: 600 }}>
            Top atrasados (menor avance en matriz)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Docente</th>
                <th className="text-left px-6 py-3">Programa</th>
                <th className="text-left px-6 py-3">Regional</th>
                <th className="text-left px-6 py-3">Avance %</th>
                <th className="text-left px-6 py-3">Vencidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.top_atrasados ?? []).map((row) => {
                const low = row.porcentaje_avance < 30;
                return (
                  <tr key={row.docente_id} className={low ? "bg-red-50/50" : ""}>
                    <td className="px-6 py-3 text-gray-800" style={{ fontWeight: 500 }}>
                      {row.nombre}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{row.programa}</td>
                    <td className="px-6 py-3 text-gray-600">{row.regional}</td>
                    <td className={`px-6 py-3 tabular-nums ${low ? "text-red-700 font-semibold" : "text-gray-700"}`}>
                      {row.porcentaje_avance}%
                    </td>
                    <td className="px-6 py-3 text-gray-600">{row.entregables_vencidos}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {data?.por_regional && data.por_regional.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-gray-800 mb-3" style={{ fontWeight: 600 }}>
            Por regional
          </h3>
          <ul className="divide-y divide-gray-100 text-sm">
            {data.por_regional.map((x) => (
              <li key={x.regional} className="py-2 flex justify-between gap-4">
                <span className="text-gray-700">{x.regional}</span>
                <span className="text-gray-500">
                  {x.docentes} docentes · avance {x.porcentaje_avance}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
