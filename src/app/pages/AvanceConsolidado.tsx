import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { BarChart2, RefreshCw, TableProperties } from "lucide-react";
import { AppSelect } from "../components/AppSelect";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";

interface AvanceMes {
  mes: string;
  completados: number;
  total: number;
  porcentaje: number;
}

interface DocenteAvance {
  id: number;
  nombre: string;
  programa: string;
  regional: string;
  grupo_id: number | null;
  grupo_nombre: string;
  tipo_docente: "ANTIGUO" | "NUEVO";
  avance_global: number;
  avance_real: number;
  avance_esperado: number;
  cumplimiento_esperado: number;
  brecha: number;
  avance_por_mes: AvanceMes[];
  entregables_vencidos: number;
  ultimo_reporte: string | null;
}

type SortKey = string;

interface Payload {
  meses: string[];
  docentes: DocenteAvance[];
  totales: {
    docentes: number;
    promedio_global: number;
    por_mes: { mes: string; porcentaje: number }[];
  };
}

const emptyMonth = (mes: string): AvanceMes => ({
  mes,
  completados: 0,
  total: 0,
  porcentaje: 0,
});

function monthProgress(docente: DocenteAvance, mes: string): AvanceMes {
  return docente.avance_por_mes.find((row) => row.mes === mes) || emptyMonth(mes);
}

function cellColor(pct: number) {
  if (pct >= 70) return "text-green-700";
  if (pct >= 40) return "text-amber-700";
  return "text-red-700";
}

function barColor(pct: number) {
  if (pct >= 70) return "bg-green-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function estadoRow(d: DocenteAvance): { label: string; className: string } {
  if (d.grupo_id == null) return { label: "Sin grupo", className: "bg-gray-100 text-gray-700" };
  const compliance = d.cumplimiento_esperado;
  if (compliance >= 100) return { label: "Al día", className: "bg-green-100 text-green-800" };
  if (compliance >= 75) return { label: "En riesgo", className: "bg-amber-100 text-amber-800" };
  return { label: "Crítico", className: "bg-red-100 text-red-800" };
}

function MesCell({ c, t, p }: { c: number; t: number; p: number }) {
  const pct = t > 0 ? p : 0;
  return (
    <div className="flex flex-col gap-1 min-w-[72px]">
      <span className={`text-xs font-semibold tabular-nums ${cellColor(pct)}`}>
        {c}/{t}
      </span>
      <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AvanceConsolidado() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isAdmin = user?.rol === "admin";

  const [semestre, setSemestre] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [buscar, setBuscar] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [grupos, setGrupos] = useState<{ id: number; nombre: string; semestre: string }[]>([]);
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("global");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (semestre.trim()) q.set("semestre", semestre.trim());
      if (grupoId.trim()) q.set("grupo_id", grupoId.trim());
      const res = await fetch(`${API_BASE}/admin/avance-consolidado?${q.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json as Payload);
    } catch (e) {
      console.error(e);
      notify.error("No se pudo cargar el avance consolidado. Intente de nuevo más tarde.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, semestre, grupoId]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/semestres`);
        const j = await r.json();
        const s: string[] = j.semestres || [];
        const activeCode = String(j.activo?.codigo || "");
        setSemestresList(s);
        if (s.length) {
          setSemestre((prev) =>
            prev && s.includes(prev)
              ? prev
              : activeCode && s.includes(activeCode)
              ? activeCode
              : s[0]
          );
        }
      } catch {
        setSemestresList([]);
      }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
        const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
        const j = await r.json();
        setGrupos(
          (j.grupos || []).map((g: { id: number; nombre: string; semestre: string }) => ({
            id: g.id,
            nombre: g.nombre,
            semestre: g.semestre,
          }))
        );
      } catch {
        setGrupos([]);
      }
    })();
  }, [isAdmin, semestre]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredDocentes = useMemo(() => {
    const list = data?.docentes ?? [];
    if (!buscar.trim()) return list;
    const q = buscar.trim().toLowerCase();
    return list.filter(
      (d) =>
        d.nombre.toLowerCase().includes(q) ||
        d.programa.toLowerCase().includes(q) ||
        d.regional.toLowerCase().includes(q)
    );
  }, [data, buscar]);

  const sorted = useMemo(() => {
    const arr = [...filteredDocentes];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let va = 0;
      let vb = 0;
      if (sortKey === "nombre") {
        return dir * a.nombre.localeCompare(b.nombre);
      }
      if (sortKey === "global") {
        va = a.avance_global;
        vb = b.avance_global;
      } else if (sortKey === "esperado") {
        va = a.avance_esperado;
        vb = b.avance_esperado;
      } else if (sortKey === "cumplimiento") {
        va = a.cumplimiento_esperado;
        vb = b.cumplimiento_esperado;
      } else {
        va = monthProgress(a, sortKey).porcentaje;
        vb = monthProgress(b, sortKey).porcentaje;
      }
      if (va !== vb) return dir * (va - vb);
      return a.nombre.localeCompare(b.nombre);
    });
    return arr;
  }, [filteredDocentes, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "nombre" ? "asc" : "asc");
    }
  };

  const riesgoCount = useMemo(
    () =>
      (data?.docentes ?? []).filter(
        (d) => d.grupo_id != null && d.cumplimiento_esperado < 75
      ).length,
    [data]
  );

  const meses = data?.meses ?? [];

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-red-600">Solo administradores.</p>
      </div>
    );
  }

  const tot = data?.totales;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-blue-800" />
          <div>
            <h1 className="text-gray-900 font-semibold text-lg">Avance Consolidado por Docente</h1>
            <p className="text-xs text-gray-500">Vista tipo Excel · filtros y ordenamiento</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 text-white text-sm hover:bg-blue-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Semestre</label>
          <AppSelect
            value={semestre}
            onValueChange={(value) => setSemestre(value)}
            emptyValue="__todos__"
            options={[
              { value: "__todos__", label: "Todos" },
              ...semestresList.map((s) => ({ value: s, label: s })),
            ]}
            className="min-w-[120px]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Grupo</label>
          <AppSelect
            value={grupoId}
            onValueChange={(value) => setGrupoId(value)}
            emptyValue="__todos__"
            options={[
              { value: "__todos__", label: "Todos" },
              ...grupos.map((g) => ({ value: String(g.id), label: g.nombre })),
            ]}
            className="min-w-[180px]"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">Buscar docente</label>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Nombre, programa, regional…"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total docentes</p>
          <p className="text-2xl font-bold text-gray-900">{tot?.docentes ?? "—"}</p>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">Promedio avance global</p>
          <p className="text-2xl font-bold text-blue-800">{tot?.promedio_global ?? "—"}%</p>
        </div>
        {meses.map((mes) => (
          <div key={mes} className="bg-white border rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500">% Avance {mes} (prom.)</p>
            <p className="text-2xl font-bold text-gray-800">
              {tot?.por_mes.find((row) => row.mes === mes)?.porcentaje ?? "—"}%
            </p>
          </div>
        ))}
        <div className="bg-white border rounded-xl p-4 shadow-sm col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500">Docentes críticos (&lt;75% de lo esperado)</p>
          <p className="text-2xl font-bold text-red-600">{riesgoCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase border-b">
              <th className="text-left px-3 py-2 font-semibold">
                <button type="button" onClick={() => toggleSort("nombre")} className="hover:underline">
                  Docente {sortKey === "nombre" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="text-left px-2 py-2">Programa</th>
              <th className="text-left px-2 py-2">Regional</th>
              <th className="text-left px-2 py-2">Grupo</th>
              {meses.map((mes) => (
                <th key={mes} className="text-left px-2 py-2">
                  <button type="button" onClick={() => toggleSort(mes)} className="hover:underline font-semibold">
                    {mes.slice(0, 3)} {sortKey === mes ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
              <th className="text-left px-2 py-2">
                <button type="button" onClick={() => toggleSort("global")} className="hover:underline font-semibold">
                  Global {sortKey === "global" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="text-left px-2 py-2">
                <button type="button" onClick={() => toggleSort("esperado")} className="hover:underline font-semibold">
                  Esperado {sortKey === "esperado" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="text-left px-2 py-2">
                <button type="button" onClick={() => toggleSort("cumplimiento")} className="hover:underline font-semibold">
                  Cumplimiento {sortKey === "cumplimiento" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="text-left px-2 py-2">Estado</th>
              <th className="text-left px-2 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((d) => {
              const est = estadoRow(d);
              const g = d.avance_global;
              const gb =
                g >= 70 ? "bg-green-100 text-green-800" : g >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
              return (
                <tr key={d.id} className="hover:bg-gray-50/80">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{d.nombre}</td>
                  <td className="px-2 py-2 text-gray-600 max-w-[140px] truncate">{d.programa}</td>
                  <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{d.regional}</td>
                  <td className="px-2 py-2 text-gray-600 max-w-[120px] truncate">{d.grupo_nombre}</td>
                  {meses.map((mes) => {
                    const x = monthProgress(d, mes);
                    return (
                      <td key={mes} className="px-2 py-2">
                        <MesCell c={x.completados} t={x.total} p={x.porcentaje} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${gb}`}>
                      {g}%
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-semibold text-amber-700">{d.avance_esperado}%</span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                        d.cumplimiento_esperado >= 100
                          ? "bg-green-100 text-green-800"
                          : d.cumplimiento_esperado >= 75
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {d.cumplimiento_esperado}%
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${est.className}`}>{est.label}</span>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/docentes/${d.id}/matriz`)}
                      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline font-medium"
                    >
                      <TableProperties className="w-3.5 h-3.5" />
                      Ver matriz
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {sorted.length > 0 && tot && (
            <tfoot>
              <tr className="bg-gray-100 font-bold text-gray-800 text-xs">
                <td className="px-3 py-2" colSpan={4}>
                  Promedios (filtrados)
                </td>
                {meses.map((mes) => {
                  const vals = sorted
                    .filter((d) => d.grupo_id != null && monthProgress(d, mes).total > 0)
                    .map((d) => monthProgress(d, mes).porcentaje);
                  const avg =
                    vals.length === 0 ? 0 : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
                  return (
                    <td key={mes} className="px-2 py-2">
                      {avg}%
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  {sorted.filter((d) => d.grupo_id != null).length === 0
                    ? "—"
                    : Math.round(
                        sorted.filter((d) => d.grupo_id != null).reduce((s, d) => s + d.avance_global, 0) /
                          sorted.filter((d) => d.grupo_id != null).length
                      )}
                  %
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
        {!loading && sorted.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">Sin resultados</p>
        )}
      </div>
    </div>
  );
}
