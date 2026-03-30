import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2 } from "lucide-react";
import { API_BASE } from "../config/api";

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
  const isNuevo = tipoIsNuevo(tipo);
  const label = tipo ?? "—";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isNuevo
          ? "bg-blue-100 text-blue-700"
          : "bg-gray-100 text-gray-600"
      }`}
      style={{ letterSpacing: "-0.01em" }}
    >
      {label}
    </span>
  );
}

export default function IndicadoresGrupo() {
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestreActivo, setSemestreActivo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<IndicadoresGrupoRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          return list[0] ?? "2026A";
        });
      } catch {
        if (!cancelled) {
          setSemestres([]);
          setSemestreActivo((prev) => prev || "2026A");
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
      setError("No se pudo cargar la información. Intente de nuevo más tarde.");
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
    return (
      <div className="p-6 text-gray-500 text-sm flex items-center gap-2">
        Cargando semestres…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-gray-900" style={{ fontWeight: 750 }}>
            Indicadores por Grupo
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Resumen de la matriz por grupo y tipo docente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span style={{ fontWeight: 600 }}>Semestre:</span>
            <select
              value={semestreActivo}
              onChange={(e) => setSemestreActivo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white min-w-[100px]"
            >
              {semestres.length === 0 && (
                <option value={semestreActivo}>{semestreActivo}</option>
              )}
              {semestres.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden sm:flex items-center gap-2 text-gray-600">
            <BarChart2 className="w-4 h-4" />
            <span className="text-xs" style={{ fontWeight: 600 }}>
              Vista consolidada
            </span>
          </div>
        </div>
      </div>

      {/* Panel KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-gray-500 text-xs">Total grupos activos</p>
          <p className="text-gray-900 mt-1 text-2xl" style={{ fontWeight: 850 }}>
            {totals.totalGruposActivos}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-gray-500 text-xs">Total docentes asignados</p>
          <p className="text-gray-900 mt-1 text-2xl" style={{ fontWeight: 850 }}>
            {totals.totalDocentes}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-gray-500 text-xs">Total entregables en plantillas</p>
          <p className="text-gray-900 mt-1 text-2xl" style={{ fontWeight: 850 }}>
            {totals.totalPlantilla}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-gray-500 text-xs">Distribución ANTIGUO vs NUEVO</p>
          <p className="text-gray-900 mt-1 text-2xl" style={{ fontWeight: 850 }}>
            {totals.antig} Antiguos / {totals.nuevo} Nuevos
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Grupo</th>
                <th className="text-left px-4 py-3 w-24">Semestre</th>
                <th className="text-left px-4 py-3 w-32">Tipo</th>
                <th className="text-left px-4 py-3 w-24">Horas</th>
                <th className="text-left px-4 py-3 w-28">Proyectos</th>
                <th className="text-left px-4 py-3 w-28">Actividades</th>
                <th className="text-left px-4 py-3 w-32">Conv. Nuevos</th>
                <th className="text-left px-4 py-3 w-36">Conv. Dinamizados</th>
                <th className="text-left px-4 py-3 w-32">Total Indicadores</th>
                <th className="text-left px-4 py-3 w-32">Docentes asignados</th>
                <th className="text-left px-4 py-3 w-40">Entregables plantilla</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Cargando…
                  </td>
                </tr>
              ) : grupos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No hay datos para mostrar.
                  </td>
                </tr>
              ) : (
                <>
                  {grupos.map((g) => {
                    const isNuevo = tipoIsNuevo(g.tipo_docente);
                    const totalIndicadores =
                      (g.num_proyectos || 0) +
                      (g.num_actividades || 0) +
                      (g.num_convenios_nuevos || 0) +
                      (g.num_convenios_dinamizados || 0);

                    return (
                      <tr
                        key={g.id}
                        className={isNuevo ? "bg-blue-50/30" : "bg-white"}
                      >
                        <td className="px-4 py-3">
                          <div className="text-gray-800" style={{ fontWeight: 650 }}>
                            {g.nombre}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            {g.semestre ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TipoBadge tipo={g.tipo_docente} />
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.horas_totales ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_proyectos ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_actividades ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_convenios_nuevos ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_convenios_dinamizados ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-900 tabular-nums" style={{ fontWeight: 700 }}>
                          {totalIndicadores}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_docentes ?? 0}
                        </td>
                        <td className="px-4 py-3 text-gray-700 tabular-nums">
                          {g.num_plantilla_entregables ?? 0}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Fila de totales */}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-4 text-gray-900" colSpan={3}>
                      Totales
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.horasTotales}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.numProyectos}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.numActividades}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.numConveniosNuevos}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.numConveniosDinamizados}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.totalIndicadores}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.totalDocentes}
                    </td>
                    <td className="px-4 py-4 text-gray-900 tabular-nums">
                      {totals.totalPlantilla}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

