import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ClipboardCheck, FileCheck2, RefreshCw, Search, TableProperties, Target, Users } from "lucide-react";
import { AppSelect } from "../components/AppSelect";
import { EmptyState, InlineAlert, Kpi, Page, PageHeader, Panel, ProgressBar, StatusPill, type Tone } from "../components/ds/primitives";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";
import { semaforoConfig, type Semaforo } from "../data/matrizConstants";

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
  /** Puntos porcentuales: % aprobado − % esperado. */
  brecha: number;
  avance_aprobado: number;
  semaforo: Semaforo;
  pendientes_revision: number;
  observados: number;
  reportados: number;
  aprobados: number;
  total_entregables: number;
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
    promedio_aprobado?: number;
    promedio_esperado?: number;
    con_retraso?: number;
    pendientes_revision?: number;
    semaforo?: { verde: number; amarillo: number; rojo: number };
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

const TONE_SEMAFORO: Record<Semaforo, Tone> = { verde: "success", amarillo: "warning", rojo: "danger", sin_exigibles: "neutral", sin_datos: "neutral" };

function toneAvance(pct: number): Tone {
  if (pct >= 70) return "success";
  if (pct >= 40) return "warning";
  return "danger";
}

function estadoRow(d: DocenteAvance): { label: string; tone: Tone } {
  if (d.grupo_id == null) return { label: "Sin grupo", tone: "neutral" };
  const sem = semaforoConfig[d.semaforo] ?? semaforoConfig.sin_datos;
  return { label: sem.label, tone: TONE_SEMAFORO[d.semaforo] ?? "neutral" };
}

function MesCell({ c, t, p }: { c: number; t: number; p: number }) {
  const pct = t > 0 ? p : 0;
  return (
    <div className="flex min-w-[64px] flex-col gap-1">
      <span className="text-xs tabular-nums text-text" style={{ fontWeight: 600 }}>
        {c}/{t}
      </span>
      <ProgressBar value={pct} tone={t > 0 ? toneAvance(pct) : "neutral"} className="w-12" label={`Avance del mes ${pct}%`} />
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
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("global");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
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
      setError("No se pudo cargar el avance consolidado.");
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
      } else if (sortKey === "aprobado") {
        va = a.avance_aprobado;
        vb = b.avance_aprobado;
      } else if (sortKey === "brecha") {
        va = a.brecha;
        vb = b.brecha;
      } else if (sortKey === "vencidos") {
        va = a.entregables_vencidos;
        vb = b.entregables_vencidos;
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
      setSortDir("asc");
    }
  };

  const riesgoCount = useMemo(
    () =>
      (data?.docentes ?? []).filter(
        (d) => d.grupo_id != null && d.semaforo === "rojo"
      ).length,
    [data]
  );

  const meses = data?.meses ?? [];

  if (!isAdmin) {
    return (
      <Page>
        <InlineAlert>Solo los administradores pueden ver el avance consolidado.</InlineAlert>
      </Page>
    );
  }

  const tot = data?.totales;

  const sortHeader = (k: SortKey, texto: string, title?: string) => {
    const activo = sortKey === k;
    const Icon = !activo ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button type="button" onClick={() => toggleSort(k)} title={title} className={`inline-flex items-center gap-1 ${activo ? "text-text" : ""}`} aria-label={`Ordenar por ${texto}`}>
        {texto} <Icon className={`h-3 w-3 ${activo ? "" : "opacity-60"}`} aria-hidden />
      </button>
    );
  };
  const ariaSort = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none");

  const filtrados = sorted.filter((d) => d.grupo_id != null);
  const promedioGlobalFiltrado =
    filtrados.length === 0 ? null : Math.round(filtrados.reduce((s, d) => s + d.avance_global, 0) / filtrados.length);

  return (
    <Page wide>
      <PageHeader
        title="Avance consolidado por docente"
        description="Reportado = enviado o aprobado · Aprobado = revisado por el administrador · Esperado = con fecha límite hasta hoy."
        actions={
          <button type="button" onClick={() => void fetchData()} disabled={loading} className="ds-btn ds-btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Actualizar
          </button>
        }
      />

      {error && (
        <InlineAlert action={<button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void fetchData()}>Reintentar</button>}>
          {error}
        </InlineAlert>
      )}

      <section aria-label="Indicadores del consolidado" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Docentes" icon={Users} tone="neutral" value={tot?.docentes ?? "—"} />
        <Kpi label="Promedio reportado" icon={FileCheck2} tone="brand" value={tot ? `${tot.promedio_global}%` : "—"} progress={tot?.promedio_global ?? 0} marker={tot?.promedio_esperado ?? null} />
        <Kpi label="Promedio aprobado" icon={ClipboardCheck} tone="success" value={tot?.promedio_aprobado != null ? `${tot.promedio_aprobado}%` : "—"} progress={tot?.promedio_aprobado ?? 0} />
        <Kpi label="Esperado a la fecha" icon={Target} tone="neutral" value={tot?.promedio_esperado != null ? `${tot.promedio_esperado}%` : "—"} progress={tot?.promedio_esperado ?? 0} />
        <Kpi label="Con retraso" icon={AlertTriangle} tone={(tot?.con_retraso ?? 0) > 0 ? "warning" : "success"} value={tot?.con_retraso ?? "—"} hint={`${tot?.pendientes_revision ?? "—"} por revisar`} />
        <Kpi label="Riesgo crítico" icon={AlertTriangle} tone={riesgoCount > 0 ? "danger" : "success"} value={riesgoCount} hint="Semáforo rojo" />
      </section>

      {meses.length > 0 && (
        <section aria-label="Promedio de avance por mes" className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-xs font-medium text-text-subtle">Avance promedio por mes</span>
          {meses.map((mes) => (
            <span key={mes} className="flex items-baseline gap-1.5 text-text-muted">
              {mes}
              <span className="tabular-nums text-text" style={{ fontWeight: 650 }}>
                {tot?.por_mes.find((row) => row.mes === mes)?.porcentaje ?? "—"}%
              </span>
            </span>
          ))}
        </section>
      )}

      <Panel
        title="Avance por docente"
        description={`${sorted.length} de ${data?.docentes.length ?? 0} docentes`}
        bodyClassName=""
      >
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <label className="block">
            <span className="ds-label">Semestre</span>
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
          </label>
          <label className="block">
            <span className="ds-label">Grupo</span>
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
          </label>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar docente, programa o regional"
              aria-label="Buscar docente"
              className="ds-input !pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="ds-table min-w-[1100px]">
            <thead>
              <tr>
                <th aria-sort={ariaSort("nombre")}>{sortHeader("nombre", "Docente")}</th>
                <th className="hidden lg:table-cell">Grupo</th>
                {meses.map((mes) => (
                  <th key={mes} aria-sort={ariaSort(mes)}>{sortHeader(mes, mes.slice(0, 3))}</th>
                ))}
                <th aria-sort={ariaSort("global")}>{sortHeader("global", "Reportado")}</th>
                <th className="text-right" aria-sort={ariaSort("aprobado")}>{sortHeader("aprobado", "Aprobado")}</th>
                <th className="text-right" aria-sort={ariaSort("esperado")}>{sortHeader("esperado", "Esperado")}</th>
                <th aria-sort={ariaSort("cumplimiento")}>{sortHeader("cumplimiento", "Cumplimiento")}</th>
                <th className="text-right" aria-sort={ariaSort("brecha")}>{sortHeader("brecha", "Brecha", "Puntos porcentuales: aprobado − esperado")}</th>
                <th className="text-right">Por revisar</th>
                <th className="text-right" aria-sort={ariaSort("vencidos")}>{sortHeader("vencidos", "Vencidos")}</th>
                <th className="hidden xl:table-cell">Último envío</th>
                <th>Estado</th>
                <th className="text-right"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={12 + meses.length}>
                    <EmptyState icon={Users} title={loading ? "Cargando avance…" : "Ningún docente coincide"}>
                      {loading ? undefined : "Prueba con otro semestre, otro grupo o una búsqueda distinta."}
                    </EmptyState>
                  </td>
                </tr>
              )}
              {sorted.map((d) => {
                const est = estadoRow(d);
                const g = d.avance_global;
                const cumpl = d.cumplimiento_esperado;
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="min-w-[180px] leading-tight">
                        <p className="text-text" style={{ fontWeight: 600 }}>{d.nombre}</p>
                        <p className="text-xs text-text-subtle">{d.programa}{d.regional ? ` · ${d.regional}` : ""}</p>
                      </div>
                    </td>
                    <td className="hidden max-w-[140px] truncate text-text-muted lg:table-cell" title={d.grupo_nombre}>{d.grupo_nombre}</td>
                    {meses.map((mes) => {
                      const x = monthProgress(d, mes);
                      return (
                        <td key={mes}>
                          <MesCell c={x.completados} t={x.total} p={x.porcentaje} />
                        </td>
                      );
                    })}
                    <td><StatusPill tone={toneAvance(g)} dot={false}>{g}%</StatusPill></td>
                    <td className="text-right tabular-nums text-text-muted">{d.avance_aprobado}%</td>
                    <td className="text-right tabular-nums text-text-muted">{d.avance_esperado}%</td>
                    <td><StatusPill tone={cumpl >= 100 ? "success" : cumpl >= 75 ? "warning" : "danger"} dot={false}>{cumpl}%</StatusPill></td>
                    <td className={`text-right tabular-nums ${d.brecha < 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: d.brecha < 0 ? 600 : 400 }}>
                      {d.brecha > 0 ? `+${d.brecha}` : d.brecha} pp
                    </td>
                    <td className="text-right tabular-nums text-text-muted">{d.pendientes_revision}</td>
                    <td className={`text-right tabular-nums ${d.entregables_vencidos > 0 ? "text-red-700" : "text-text-muted"}`} style={{ fontWeight: d.entregables_vencidos > 0 ? 600 : 400 }}>
                      {d.entregables_vencidos}
                    </td>
                    <td className="hidden whitespace-nowrap text-text-muted xl:table-cell">{formatDateOnly(d.ultimo_reporte)}</td>
                    <td><StatusPill tone={est.tone}>{est.label}</StatusPill></td>
                    <td>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => navigate(`/admin/docentes/${d.id}/matriz`)} className="ds-btn ds-btn-ghost ds-btn-sm" title={`Ver la matriz de ${d.nombre}`}>
                          <TableProperties className="h-3.5 w-3.5" aria-hidden /> Ver matriz
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {sorted.length > 0 && tot && (
              <tfoot>
                <tr className="bg-surface-2 text-xs text-text" style={{ fontWeight: 650 }}>
                  <td className="px-3.5 py-2.5" colSpan={2}>Promedios (filtrados)</td>
                  {meses.map((mes) => {
                    const vals = sorted
                      .filter((d) => d.grupo_id != null && monthProgress(d, mes).total > 0)
                      .map((d) => monthProgress(d, mes).porcentaje);
                    const avg = vals.length === 0 ? 0 : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
                    return (
                      <td key={mes} className="px-3.5 py-2.5 tabular-nums">
                        {avg}%
                      </td>
                    );
                  })}
                  <td className="px-3.5 py-2.5 tabular-nums">{promedioGlobalFiltrado == null ? "—" : `${promedioGlobalFiltrado}%`}</td>
                  <td colSpan={9} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </Page>
  );
}
