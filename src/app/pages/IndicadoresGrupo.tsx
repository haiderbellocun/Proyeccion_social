import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { AppSelect } from "../components/AppSelect";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, PageLoading, Panel, StatusPill } from "../components/ds/primitives";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

const API_BASE_URL = API_BASE;

type IndicadoresGrupoRow = {
  id: number;
  nombre: string;
  semestre?: string | null;
  tipo_docente: "ANTIGUO" | "NUEVO" | string | null;
  horas_totales: number | null;
  num_proyectos: number;
  num_actividades: number;
  num_convenios_nuevos: number;
  num_convenios_dinamizados: number;
  num_docentes: number;
  num_plantilla_entregables: number;
};

function tipoIsNuevo(tipo: IndicadoresGrupoRow["tipo_docente"]) {
  return (tipo ?? "").toUpperCase() === "NUEVO";
}

function TipoBadge({ tipo }: { tipo: IndicadoresGrupoRow["tipo_docente"] }) {
  return <StatusPill tone={tipoIsNuevo(tipo) ? "brand" : "neutral"}>{tipo ?? "—"}</StatusPill>;
}

export default function IndicadoresGrupo() {
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestreActivo, setSemestreActivo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<IndicadoresGrupoRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/admin/semestres`);
        const d = await r.json();
        const list = Array.isArray(d.semestres) ? d.semestres : [];
        if (cancelled) return;
        setSemestres(list);
        setSemestreActivo((prev) => {
          if (prev) return prev;
          return d.activo?.codigo ?? list[0] ?? "";
        });
      } catch {
        if (!cancelled) {
          setSemestres([]);
          setSemestreActivo("");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadGrupos = useCallback(async () => {
    if (!semestreActivo) return;
    try {
      setLoading(true);
      setError(null);
      const q = encodeURIComponent(semestreActivo);
      const res = await fetch(`${API_BASE_URL}/admin/indicadores-grupo?semestre=${q}`);
      if (!res.ok) throw new Error("No se pudo cargar indicadores por grupo");
      const data = await res.json();
      setGrupos(Array.isArray(data.grupos) ? data.grupos : []);
    } catch (err) {
      console.error(err);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      setError("No se pudieron cargar los indicadores por grupo.");
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, [semestreActivo]);

  useEffect(() => {
    void loadGrupos();
  }, [loadGrupos]);

  const totals = useMemo(() => {
    const totalGruposActivos = grupos.length;
    const totalDocentes = grupos.reduce((acc, g) => acc + (g.num_docentes || 0), 0);
    const totalPlantilla = grupos.reduce(
      (acc, g) => acc + (g.num_plantilla_entregables || 0),
      0
    );

    const antig = grupos.filter((g) => !tipoIsNuevo(g.tipo_docente)).length;
    const nuevo = grupos.filter((g) => tipoIsNuevo(g.tipo_docente)).length;

    const sum = (k: keyof IndicadoresGrupoRow) =>
      grupos.reduce((acc, g) => acc + (Number(g[k] ?? 0) || 0), 0);

    const horasTotales = sum("horas_totales");
    const numProyectos = sum("num_proyectos");
    const numActividades = sum("num_actividades");
    const numConveniosNuevos = sum("num_convenios_nuevos");
    const numConveniosDinamizados = sum("num_convenios_dinamizados");

    const totalIndicadores = numProyectos + numActividades + numConveniosNuevos + numConveniosDinamizados;

    return {
      totalGruposActivos,
      totalDocentes,
      totalPlantilla,
      antig,
      nuevo,
      horasTotales,
      numProyectos,
      numActividades,
      numConveniosNuevos,
      numConveniosDinamizados,
      totalIndicadores,
    };
  }, [grupos]);

  if (!semestreActivo) {
    return <PageLoading label="Cargando semestres…" />;
  }

  return (
    <Page>
      <PageHeader
        title="Indicadores por grupo"
        description="Resumen de la matriz por grupo y tipo docente."
        actions={
          <label className="flex items-center gap-2">
            <span className="ds-label !mb-0">Semestre</span>
            <AppSelect
              value={semestreActivo}
              onValueChange={(value) => setSemestreActivo(value)}
              options={
                semestres.length === 0
                  ? [{ value: semestreActivo, label: semestreActivo }]
                  : semestres.map((s) => ({ value: s, label: s }))
              }
              className="min-w-[110px]"
            />
          </label>
        }
      />

      {error && (
        <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadGrupos()}>Reintentar</button>}>
          {error}
        </InlineAlert>
      )}

      <section aria-label="Totales del semestre" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Grupos activos" tone="brand" value={totals.totalGruposActivos} hint={`${totals.antig} antiguos · ${totals.nuevo} nuevos`} />
        <Kpi label="Docentes asignados" tone="neutral" value={totals.totalDocentes} />
        <Kpi label="Entregables en plantillas" tone="violet" value={totals.totalPlantilla} />
        <Kpi label="Indicadores totales" tone="signal" value={totals.totalIndicadores} hint="Proyectos, actividades y convenios" />
      </section>

      <Panel title="Indicadores por grupo" description={`Semestre ${semestreActivo}`} bodyClassName="">
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[1000px]">
            <thead>
              <tr>
                <th className="min-w-[260px]">Grupo</th>
                <th>Semestre</th>
                <th>Tipo</th>
                <th className="text-right">Horas</th>
                <th className="text-right">Proyectos</th>
                <th className="text-right">Actividades</th>
                <th className="text-right">Conv. nuevos</th>
                <th className="text-right">Conv. dinamizados</th>
                <th className="text-right">Total indicadores</th>
                <th className="text-right">Docentes</th>
                <th className="text-right">Entregables plantilla</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11}>
                    <PageLoading label="Cargando…" />
                  </td>
                </tr>
              ) : grupos.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState icon={Layers} title="No hay grupos en este semestre">
                      Prueba con otro semestre o crea grupos desde la administración del sistema.
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                <>
                  {grupos.map((g) => {
                    const totalIndicadores =
                      (g.num_proyectos || 0) +
                      (g.num_actividades || 0) +
                      (g.num_convenios_nuevos || 0) +
                      (g.num_convenios_dinamizados || 0);

                    return (
                      <tr key={g.id}>
                        <td className="text-text" style={{ fontWeight: 600 }}>{g.nombre}</td>
                        <td className="text-text-muted">{g.semestre ?? "—"}</td>
                        <td><TipoBadge tipo={g.tipo_docente} /></td>
                        <td className="text-right tabular-nums text-text-muted">{g.horas_totales ?? 0}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_proyectos ?? 0}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_actividades ?? 0}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_convenios_nuevos ?? 0}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_convenios_dinamizados ?? 0}</td>
                        <td className="text-right tabular-nums text-text" style={{ fontWeight: 650 }}>{totalIndicadores}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_docentes ?? 0}</td>
                        <td className="text-right tabular-nums text-text-muted">{g.num_plantilla_entregables ?? 0}</td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>

            {!loading && grupos.length > 0 && (
              <tfoot>
                <tr className="bg-surface-2 text-text" style={{ fontWeight: 650 }}>
                  <td colSpan={3} className="px-3.5 py-2.5">Totales</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.horasTotales}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.numProyectos}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.numActividades}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.numConveniosNuevos}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.numConveniosDinamizados}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.totalIndicadores}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.totalDocentes}</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">{totals.totalPlantilla}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </Page>
  );
}
