import { useEffect, useState, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Users } from "lucide-react";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, PageLoading, Panel, ProgressBar, StatusPill } from "../components/ds/primitives";
import { ChartLegend, ChartTooltip, axisTick, useChartColors } from "../components/ds/chart";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";

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
  return <StatusPill tone={tipo === "NUEVO" ? "brand" : "neutral"}>{tipo}</StatusPill>;
}

export default function ReportsMetrics() {
  const session = useCurrentUser();
  const C = useChartColors();
  const [data, setData] = useState<MetricasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

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
        notify.error("No se pudo cargar las métricas. Intente más tarde.");
        setError("No se pudieron cargar las métricas.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [recarga]);

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

  if (loading) return <PageLoading label="Cargando métricas…" />;

  return (
    <Page>
      <PageHeader
        title="Reportes y métricas"
        description={
          <>
            <span className="first-letter:uppercase">{fechaTitulo}</span>
            {session?.correo ? ` · ${session.correo}` : ""}
          </>
        }
      />

      {error && (
        <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>}>
          {error}
        </InlineAlert>
      )}

      <section aria-label="Resumen de reportes" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Total reportes" tone="neutral" value={r?.total_reportes ?? 0} />
        <Kpi label="Aprobados" tone="success" value={r?.aprobados ?? 0} />
        <Kpi label="Pendientes" tone="violet" value={r?.pendientes ?? 0} />
        <Kpi label="Con observaciones" tone="warning" value={r?.con_observaciones ?? 0} />
        <Kpi className="col-span-2 lg:col-span-1" label="% aprobación" tone="brand" value={`${r?.porcentaje_aprobacion ?? 0}%`} progress={r?.porcentaje_aprobacion ?? 0} />
      </section>

      <Panel title="Reportes por mes del semestre activo">
        <div className="mb-3">
          <ChartLegend
            items={[
              { label: "Aprobados", color: C.aprobado },
              { label: "Observados", color: C.observado },
              { label: "Pendientes", color: C.esperado },
            ]}
          />
        </div>
        {chartPorMes.length === 0 ? (
          <EmptyState icon={BarChart3} title="Aún no hay reportes en el semestre activo">
            Aparecerán aquí cuando los docentes envíen entregables.
          </EmptyState>
        ) : (
          <div role="img" aria-label="Barras por mes: aprobados, observados y pendientes">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartPorMes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="mes" tick={axisTick(C)} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick(C)} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="Aprobados" fill={C.aprobado} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Observados" fill={C.observado} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Pendientes" fill={C.esperado} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="Cumplimiento por grupo de matriz"
        description="Entregables de plantilla reportados (enviados a revisión o aprobados)"
        bodyClassName=""
      >
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[720px]">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Tipo</th>
                <th className="text-right">Docentes</th>
                <th className="text-right">Reportados</th>
                <th className="text-right">Total</th>
                <th className="min-w-[200px]">Progreso</th>
              </tr>
            </thead>
            <tbody>
              {(data?.por_grupo ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Users} title="Sin grupos con matriz">Cuando existan grupos con entregables se mostrará su cumplimiento.</EmptyState>
                  </td>
                </tr>
              )}
              {(data?.por_grupo ?? []).map((g) => (
                <tr key={g.grupo_id}>
                  <td className="text-text" style={{ fontWeight: 600 }}>{g.grupo_nombre}</td>
                  <td><TipoDocenteBadge tipo={g.tipo_docente} /></td>
                  <td className="text-right tabular-nums text-text-muted">{g.total_docentes}</td>
                  <td className="text-right tabular-nums text-text-muted">{g.entregables_completados}</td>
                  <td className="text-right tabular-nums text-text-muted">{g.entregables_total}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={g.porcentaje} label={`Progreso de ${g.grupo_nombre}`} className="min-w-[100px] flex-1" />
                      <span className="w-10 text-right text-xs tabular-nums text-text" style={{ fontWeight: 600 }}>{g.porcentaje}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Docentes con menor avance"
          description="Menor avance en matriz; en rojo, por debajo del 30 %"
          bodyClassName=""
        >
          <div className="overflow-x-auto">
            <table className="ds-table min-w-[480px]">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th className="hidden md:table-cell">Programa</th>
                  <th className="hidden md:table-cell">Regional</th>
                  <th className="text-right">Avance</th>
                  <th className="text-right">Vencidos</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_atrasados ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="Sin docentes atrasados">Ningún docente presenta rezago en este momento.</EmptyState>
                    </td>
                  </tr>
                )}
                {(data?.top_atrasados ?? []).map((row) => {
                  const low = row.porcentaje_avance < 30;
                  return (
                    <tr key={row.docente_id}>
                      <td className="text-text" style={{ fontWeight: 600 }}>{row.nombre}</td>
                      <td className="hidden text-text-muted md:table-cell">{row.programa}</td>
                      <td className="hidden text-text-muted md:table-cell">{row.regional}</td>
                      <td className="text-right">
                        <StatusPill tone={low ? "danger" : "neutral"}>{row.porcentaje_avance}%</StatusPill>
                      </td>
                      <td className={`text-right tabular-nums ${row.entregables_vencidos > 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: row.entregables_vencidos > 0 ? 600 : 400 }}>
                        {row.entregables_vencidos}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {data?.por_regional && data.por_regional.length > 0 && (
          <Panel title="Por regional" description="Docentes y avance promedio">
            <ul className="space-y-3 text-sm">
              {data.por_regional.map((x) => (
                <li key={x.regional} className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-text">{x.regional}</span>
                    <span className="text-xs tabular-nums text-text-subtle">{x.docentes} docentes · {x.porcentaje_avance}%</span>
                  </div>
                  <ProgressBar value={x.porcentaje_avance} label={`Avance ${x.regional}`} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </Page>
  );
}
