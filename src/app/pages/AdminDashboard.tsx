// Panel de coordinación — diseño B2. Todos los datos salen de la API (/admin/dashboard y /admin/reportes-revision).
// La versión anterior (Tinta) se conserva en AdminDashboardTinta.tsx; para revertir basta con apuntar la ruta a ese archivo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly } from "../lib/date";
import { etiquetaSemana, semaforoConfig, type Semaforo, type SemanaActual } from "../data/matrizConstants";
import { dominio, esHttp, ETIQUETA_TIPO } from "../components/EnlaceEvidencia";
import { useB2 } from "../components/b2/B2Context";
import { IChevR, ICola, IExterno, IImportar } from "../components/b2/icons";
import { Dl, Estado, Inspector, enControl } from "../components/b2/ui";

interface DashboardStats {
  total_docentes: number;
  reportes_enviados: number;
  docentes_atrasados: number;
  proyectos_activos: number;
  pendientes_revision?: number;
  reportes_aprobados?: number;
  reportes_observados?: number;
  avance_reportado_promedio?: number;
  avance_aprobado_promedio?: number;
  avance_esperado_promedio?: number;
  semaforo?: { verde: number; amarillo: number; rojo: number };
}
interface ProgresoSemanalRow { semana: number; mes: string; enviados: number; reportados?: number; aprobados: number }
interface CumplimientoProgramaRow {
  programa: string; porcentaje: number; porcentaje_reportado?: number; porcentaje_aprobado?: number; porcentaje_esperado?: number; docentes: number;
}
interface DocenteRecienteRow {
  id: number; nombre: string; programa: string; regional: string; porcentaje_avance: number;
  porcentaje_reportado?: number; porcentaje_aprobado?: number; porcentaje_esperado?: number; brecha?: number;
  semaforo?: Semaforo; pendientes_revision?: number; observados?: number; vencidos?: number; reportes_enviados: number;
  estado: "al_dia" | "atrasado" | "sin_actividad";
}
interface AdminDashboardPayload {
  stats?: DashboardStats;
  semana_actual?: SemanaActual;
  progreso_semanal?: ProgresoSemanalRow[];
  cumplimiento_por_programa?: CumplimientoProgramaRow[];
  docentes_recientes?: DocenteRecienteRow[];
}
interface EvidenciaRev { id: number; url: string; tipo_enlace: string; envio_numero: number | null }
interface ReporteRevision {
  id: number;
  estado_revision: string;
  dias_en_espera: number | null;
  num_envios: number;
  es_reenvio: boolean;
  problema_acceso: boolean;
  fecha_cargue_evidencia: string | null;
  evidencias: EvidenciaRev[];
  actividad_reportada: string;
  descripcion_reporte: string;
  horas: number;
  semana_numero: number;
  semestre: string | null;
  proyecto_titulo: string;
  programa_nombre: string;
  docente_id: number;
  docente_nombre: string;
  requisito_evidencia?: { requiere: boolean; descripcion: string };
}
interface Cola { reportes: ReporteRevision[]; total: number }

type Filtro = "todos" | "atrasado" | "rojo" | "por_revisar";

const num1 = (v?: number | null) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`);
const clamp = (v: number | undefined | null) => Math.max(0, Math.min(100, Number(v ?? 0)));
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

function Bullet({ rep, apr, esp, nombre }: { rep?: number | null; apr?: number | null; esp?: number | null; nombre: string }) {
  return (
    <span className="b2-bl" role="img" aria-label={`${nombre}: reportado ${num1(rep)}, aprobado ${num1(apr)}, esperado ${num1(esp)}`}>
      <span className="b2-bl-r" style={{ width: `${clamp(rep)}%` }} />
      <span className="b2-bl-a" style={{ width: `${clamp(apr)}%` }} />
      {esp != null && <span className="b2-bl-e" style={{ left: `${clamp(esp)}%` }} />}
      <span className="b2-bl-v">{num1(rep)}</span>
    </span>
  );
}

function Esqueleto({ filas = 4 }: { filas?: number }) {
  return (
    <div className="b2-skel-w" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => <span key={i} className="b2-skel" style={{ width: `${88 - i * 9}%` }} />)}
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { busqueda, setSemana, registrarRecarga } = useB2();
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cola, setCola] = useState<Cola | null>(null);
  const [colaCargando, setColaCargando] = useState(true);
  const [colaError, setColaError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [sel, setSel] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const q = busqueda.trim();

  // Datos del panel (indicadores, semanas, programas, docentes)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setCargando(true);
        setError(null);
        const res = await fetch(`${API_BASE}/admin/dashboard`);
        if (!res.ok) throw new Error("Error al cargar dashboard admin");
        const json = (await res.json()) as AdminDashboardPayload;
        if (!cancelado) { setData(json); setSemana(json.semana_actual ?? null); }
      } catch (err) {
        console.error(err);
        if (!cancelado) {
          setError("No se pudo cargar el panel. Revisa la conexión e intenta de nuevo.");
          setData(null);
          notify.error("No se pudo cargar el panel.");
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [recarga, setSemana]);

  // Cola de revisión: entregables enviados, los más antiguos primero (orden del backend)
  useEffect(() => {
    let cancelado = false;
    const t = window.setTimeout(async () => {
      try {
        setColaCargando(true);
        setColaError(null);
        const params = new URLSearchParams({ estado: "enviado", page: "1", limit: "8" });
        if (q) params.set("q", q);
        const res = await fetch(`${API_BASE}/admin/reportes-revision?${params.toString()}`);
        if (!res.ok) throw new Error("Error al cargar la cola de revisión");
        const json = await res.json();
        const reportes = (json.reportes ?? json.data ?? []) as ReporteRevision[];
        if (!cancelado) setCola({ reportes, total: Number(json.pagination?.total ?? reportes.length) });
      } catch (err) {
        console.error(err);
        if (!cancelado) { setColaError("No se pudo cargar la cola de revisión."); setCola(null); }
      } finally {
        if (!cancelado) setColaCargando(false);
      }
    }, q ? 300 : 0);
    return () => { cancelado = true; window.clearTimeout(t); };
  }, [recarga, q]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    registrarRecarga(recargar);
    return () => { registrarRecarga(null); setSemana(null); };
  }, [registrarRecarga, recargar, setSemana]);

  const stats = data?.stats;
  const sem = stats?.semaforo;
  const semanaNumero = data?.semana_actual?.estado === "en_curso" ? data.semana_actual.numero : null;
  const subtitulo = data?.semana_actual ? `${etiquetaSemana(data.semana_actual)} · ${formatDateOnly(data.semana_actual.hoy)}` : "";
  const pendientes = stats?.pendientes_revision ?? 0;

  const docentesTodos = data?.docentes_recientes ?? [];
  const docentes = useMemo(() => {
    const t = q.toLowerCase();
    return docentesTodos
      .filter((d) => {
        if (filtro === "atrasado" && d.estado !== "atrasado") return false;
        if (filtro === "rojo" && d.semaforo !== "rojo") return false;
        if (filtro === "por_revisar" && !(d.pendientes_revision ?? 0)) return false;
        if (t && !`${d.nombre} ${d.programa} ${d.regional}`.toLowerCase().includes(t)) return false;
        return true;
      })
      .sort((a, b) => (a.brecha ?? 0) - (b.brecha ?? 0));
  }, [docentesTodos, filtro, q]);

  const totalSemanas = data?.semana_actual?.total_semanas ?? 0;
  const semanas = useMemo(() => {
    const filas = data?.progreso_semanal ?? [];
    const n = Math.max(totalSemanas, ...filas.map((f) => f.semana), 0);
    if (n === 0) return [];
    const porSemana = new Map(filas.map((f) => [f.semana, f]));
    return Array.from({ length: n }, (_, i): ProgresoSemanalRow => porSemana.get(i + 1) ?? { semana: i + 1, mes: "", enviados: 0, reportados: 0, aprobados: 0 });
  }, [data?.progreso_semanal, totalSemanas]);
  const maxSem = Math.max(1, ...semanas.map((s) => s.reportados ?? s.enviados));
  const programas = data?.cumplimiento_por_programa ?? [];

  const reportes = cola?.reportes ?? [];
  const seleccionado = reportes.find((r) => r.id === sel) ?? null;
  useEffect(() => { setCursor(0); }, [q, recarga]);
  // Si el entregable seleccionado deja de estar en la cola (búsqueda o recarga), se cierra el detalle
  useEffect(() => { if (sel != null && cola && !cola.reportes.some((r) => r.id === sel)) setSel(null); }, [cola, sel]);

  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(reportes.length - 1, cursor + 1); setCursor(n); if (sel != null && reportes[n]) setSel(reportes[n].id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null && reportes[n]) setSel(reportes[n].id); }
    else if (e.key === "Enter" && reportes[cursor]) { e.preventDefault(); setSel(reportes[cursor].id); }
    else if (e.key === "Escape" && sel != null) setSel(null);
  };

  const alertas: { critica: boolean; texto: string; accion: string; ir: () => void }[] = [];
  if (pendientes > 0) alertas.push({ critica: false, texto: `${pendientes} entregable${pendientes === 1 ? "" : "s"} esperan revisión`, accion: "Revisar", ir: () => navigate("/admin/revision") });
  if ((sem?.rojo ?? 0) > 0) alertas.push({ critica: true, texto: `${sem!.rojo} docente${sem!.rojo === 1 ? "" : "s"} en estado crítico`, accion: "Ver críticos", ir: () => setFiltro("rojo") });
  if ((stats?.docentes_atrasados ?? 0) > 0) alertas.push({ critica: true, texto: `${stats!.docentes_atrasados} docente${stats!.docentes_atrasados === 1 ? "" : "s"} con entregables vencidos`, accion: "Ver con retraso", ir: () => setFiltro("atrasado") });

  const filtros: { id: Filtro; label: string; n: number }[] = [
    { id: "todos", label: "Todos", n: docentesTodos.length },
    { id: "atrasado", label: "Con retraso", n: docentesTodos.filter((d) => d.estado === "atrasado").length },
    { id: "rojo", label: "Críticos", n: docentesTodos.filter((d) => d.semaforo === "rojo").length },
    { id: "por_revisar", label: "Por revisar", n: docentesTodos.filter((d) => (d.pendientes_revision ?? 0) > 0).length },
  ];

  return (
    <div className="b2-vista b2-dash" data-insp="sel">
      <div className="b2-vista-main" data-scroll onKeyDown={undefined}>
        <div className="b2-pg">
          <header className="b2-pg-h">
            <div>
              <h1 className="b2-pg-t">Panel de coordinación</h1>
              {subtitulo && <p className="b2-pg-s">{subtitulo}</p>}
            </div>
            <div className="b2-pg-acc">
              <button type="button" className="b2-btn" onClick={() => navigate("/admin/importar-matriz")}><IImportar width={16} height={16} />Importar matriz</button>
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/admin/revision")}><ICola width={16} height={16} />Revisar reportes</button>
            </div>
          </header>

          {error && (
            <div className="b2-alert" role="alert">
              <span>{error}</span>
              <button type="button" className="b2-btn b2-btn-sm" onClick={recargar}>Reintentar</button>
            </div>
          )}

          <div className="b2-pg-cols">
            <div className="b2-pg-col">
              <section className="b2-card b2-card-cola" aria-labelledby="b2-t-cola">
                <div className="b2-card-h">
                  <h2 id="b2-t-cola">Pendientes de revisión {!cargando && stats && <span className="b2-cuenta">{pendientes}</span>}</h2>
                  <Link className="b2-link" to="/admin/revision">Ver cola completa</Link>
                </div>
                {colaError ? (
                  <div className="b2-alert b2-alert-in" role="alert"><span>{colaError}</span><button type="button" className="b2-btn b2-btn-sm" onClick={recargar}>Reintentar</button></div>
                ) : colaCargando && !cola ? (
                  <Esqueleto filas={5} />
                ) : (
                  <div className="b2-cola" role="table" aria-label="Entregables pendientes de revisión" tabIndex={0} onKeyDown={teclas} aria-busy={colaCargando}>
                    <div className="b2-cola-h" role="row">
                      <span role="columnheader">Entregable</span>
                      <span role="columnheader" className="b2-c-hide">Docente</span>
                      <span role="columnheader" className="b2-c-num">Espera</span>
                      <span role="columnheader">Estado</span>
                      <span role="columnheader" className="b2-sr-only">Abrir</span>
                    </div>
                    {reportes.length === 0 && <p className="b2-cola-vacio">{q ? "Ningún entregable pendiente coincide con la búsqueda." : "No hay entregables pendientes de revisión."}</p>}
                    {reportes.map((r, i) => (
                      <div key={r.id} className="b2-cola-r" role="row" aria-selected={sel === r.id} data-sel={sel === r.id || undefined} data-cur={i === cursor || undefined}
                        onClick={() => { setCursor(i); setSel(r.id); }}>
                        <span role="cell" className="b2-cola-t">
                          <span className="b2-tt" title={r.actividad_reportada}>{r.actividad_reportada}</span>
                          <span className="b2-sub"><span className="b2-only-m">{r.docente_nombre} · </span>S{r.semana_numero} · {r.proyecto_titulo}</span>
                        </span>
                        <span role="cell" className="b2-c-hide b2-tt">{r.docente_nombre}</span>
                        <span role="cell" className="b2-c-num" data-alerta={(r.dias_en_espera ?? 0) >= 5 || undefined}>{r.dias_en_espera == null ? "—" : `${r.dias_en_espera} d`}</span>
                        <span role="cell"><Estado kind="revision" label={r.es_reenvio ? "Reenvío" : "Por revisar"} /></span>
                        <span role="cell" className="b2-cola-go" aria-hidden="true"><IChevR width={14} height={14} /></span>
                      </div>
                    ))}
                  </div>
                )}
                {cola && cola.total > reportes.length && <p className="b2-cola-pie">Se muestran {reportes.length} de {cola.total}. <Link className="b2-link" to="/admin/revision">Ver cola completa</Link></p>}
              </section>

              <section className="b2-card" aria-labelledby="b2-t-sem">
                <div className="b2-card-h">
                  <h2 id="b2-t-sem">Evolución semanal</h2>
                  <p className="b2-leyenda"><i className="b2-lg b2-lg-r" />Reportados<i className="b2-lg b2-lg-a" />Aprobados</p>
                </div>
                {cargando && !data ? <Esqueleto filas={3} /> : semanas.length === 0 ? (
                  <p className="b2-vacio">Aún no hay datos de avance. Aparecerán cuando los docentes reporten entregables en el semestre activo.</p>
                ) : (
                  <div className="b2-semanas" role="img" aria-label="Entregables reportados y aprobados por semana" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))` }}>
                    {semanas.map((x) => {
                      const rep = x.reportados ?? x.enviados;
                      const futura = semanaNumero != null && x.semana > semanaNumero;
                      return (
                        <div key={x.semana} className="b2-sm" data-now={x.semana === semanaNumero || undefined} data-futura={futura || undefined} title={`Semana ${x.semana}: ${rep} reportados, ${x.aprobados} aprobados`}>
                          <span className="b2-sm-v">{rep > 0 ? rep : ""}</span>
                          <span className="b2-sm-b">
                            <span className="b2-sm-r" style={{ height: `${(100 * rep) / maxSem}%` }} />
                            <span className="b2-sm-a" style={{ height: `${(100 * x.aprobados) / maxSem}%` }} />
                          </span>
                          <span className="b2-sm-l">S{x.semana}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className="b2-pg-col">
              <section className="b2-card" aria-labelledby="b2-t-ind">
                <div className="b2-card-h"><h2 id="b2-t-ind">Indicadores</h2></div>
                {cargando && !stats ? <Esqueleto filas={3} /> : (
                  <>
                    <div className="b2-hero">
                      <div><span className="b2-hero-n">{stats ? pendientes : "—"}</span><span className="b2-hero-l">por revisar</span></div>
                      <p className="b2-hero-s">{stats ? `${stats.reportes_observados ?? 0} observados · ${stats.reportes_aprobados ?? 0} aprobados · ${stats.reportes_enviados} reportados` : ""}</p>
                    </div>
                    <dl className="b2-kpis b2-kpis-3">
                      <div><dt>Reportado</dt><dd>{num1(stats?.avance_reportado_promedio)}</dd><span className="b2-kpi-s">esperado {num1(stats?.avance_esperado_promedio)}</span></div>
                      <div><dt>Aprobado</dt><dd>{num1(stats?.avance_aprobado_promedio)}</dd><span className="b2-kpi-s">promedio</span></div>
                      <div><dt>En riesgo</dt><dd className={(sem?.rojo ?? 0) > 0 ? "b2-txt-danger" : undefined}>{sem?.rojo ?? "—"}</dd><span className="b2-kpi-s">de {stats?.total_docentes ?? "—"} docentes</span></div>
                    </dl>
                    <p className="b2-nota">{stats?.proyectos_activos ?? "—"} iniciativas activas · {stats?.total_docentes ?? "—"} docentes en el semestre</p>
                  </>
                )}
              </section>

              <section className="b2-card" aria-labelledby="b2-t-al">
                <div className="b2-card-h"><h2 id="b2-t-al">Atención requerida</h2></div>
                {cargando && !stats ? <Esqueleto filas={2} /> : alertas.length === 0 ? (
                  <p className="b2-vacio">No hay alertas por ahora.</p>
                ) : (
                  <ul className="b2-alertas">
                    {alertas.map((a) => (
                      <li key={a.texto}>
                        <span className="b2-al-ic" data-d={a.critica || undefined}><IExterno width={14} height={14} /></span>
                        <span className="b2-al-t">{a.texto}</span>
                        <button type="button" className="b2-link" onClick={a.ir}>{a.accion}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="b2-card" aria-labelledby="b2-t-doc">
                <div className="b2-card-h"><h2 id="b2-t-doc">Seguimiento por docente</h2><Link className="b2-link" to="/admin/avance">Avance consolidado</Link></div>
                <div className="b2-chips" role="group" aria-label="Filtrar docentes">
                  {filtros.map((f) => (
                    <button key={f.id} type="button" className="b2-chip" data-on={filtro === f.id || undefined} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.label} <b>{f.n}</b></button>
                  ))}
                </div>
                {cargando && !data ? <Esqueleto filas={4} /> : docentes.length === 0 ? (
                  <p className="b2-vacio">{docentesTodos.length === 0 ? "Aún no hay docentes con matriz asignada." : "Ningún docente coincide con el filtro o la búsqueda."}</p>
                ) : (
                  <ul className="b2-docs">
                    {docentes.map((d) => {
                      const brecha = d.brecha ?? 0;
                      const sf = d.semaforo ? semaforoConfig[d.semaforo]?.label : null;
                      return (
                        <li key={d.id}>
                          <Link className="b2-doc" to={`/admin/docentes/${d.id}/matriz`} title={`Ver la matriz de ${d.nombre}`}>
                            <span className="b2-doc-n">
                              <span className="b2-tt">{d.nombre}</span>
                              <span className="b2-sub">{(d.pendientes_revision ?? 0)} por revisar · {(d.vencidos ?? 0)} vencidos{sf ? ` · ${sf}` : ""}</span>
                            </span>
                            <Bullet rep={d.porcentaje_reportado ?? d.porcentaje_avance} apr={d.porcentaje_aprobado} esp={d.porcentaje_esperado} nombre={d.nombre} />
                            <span className="b2-doc-b" data-neg={brecha < 0 || undefined} title="Brecha = entregables aprobados − esperados a la fecha">{d.brecha != null ? signed(Math.round(brecha)) : "—"}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="b2-leyenda b2-leyenda-b"><i className="b2-lg b2-lg-r" />Reportado<i className="b2-lg b2-lg-a" />Aprobado<i className="b2-lg b2-lg-e" />Esperado</p>
              </section>

              {programas.length > 0 && (
                <section className="b2-card" aria-labelledby="b2-t-prog">
                  <div className="b2-card-h"><h2 id="b2-t-prog">Cumplimiento por programa</h2></div>
                  <ul className="b2-docs">
                    {programas.map((p) => (
                      <li key={p.programa} className="b2-doc">
                        <span className="b2-doc-n"><span className="b2-tt" title={p.programa}>{p.programa}</span><span className="b2-sub">{p.docentes} {p.docentes === 1 ? "docente" : "docentes"}</span></span>
                        <Bullet rep={p.porcentaje_reportado ?? p.porcentaje} apr={p.porcentaje_aprobado} esp={p.porcentaje_esperado} nombre={p.programa} />
                        <span />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && (
          <div className="b2-insp-c">
            <p className="b2-insp-sup">{seleccionado.docente_nombre} · {seleccionado.programa_nombre}</p>
            <h2 className="b2-insp-h">{seleccionado.actividad_reportada}</h2>
            <div className="b2-insp-estado"><Estado kind="revision" label={seleccionado.es_reenvio ? "Reenvío por revisar" : "Por revisar"} /></div>
            {seleccionado.problema_acceso && <div className="b2-callout b2-callout-d"><strong>Problema de acceso</strong><p>Un enlace se marcó como inaccesible. Pide acceso antes de decidir.</p></div>}
            <h3 className="b2-insp-sub">Evidencias</h3>
            {seleccionado.evidencias.length === 0 ? (
              <p className="b2-muted">{seleccionado.requisito_evidencia?.requiere === false ? "Este entregable no requiere evidencia." : "Sin enlaces de evidencia."}</p>
            ) : (
              <ul className="b2-evid">
                {seleccionado.evidencias.map((e) => (
                  <li key={e.id} className="b2-evid-i">
                    <div className="b2-evid-t">
                      <span className="b2-evid-k">{ETIQUETA_TIPO[e.tipo_enlace] ?? "Enlace"}</span>
                      <span className="b2-evid-u" title={e.url}>{dominio(e.url)}</span>
                    </div>
                    {esHttp(e.url) && <a className="b2-btn b2-btn-sm" href={e.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${ETIQUETA_TIPO[e.tipo_enlace] ?? "enlace"}`}>Abrir <IExterno width={14} height={14} /></a>}
                  </li>
                ))}
              </ul>
            )}
            {seleccionado.descripcion_reporte && (<><h3 className="b2-insp-sub">Descripción del docente</h3><p className="b2-insp-p">{seleccionado.descripcion_reporte}</p></>)}
            <h3 className="b2-insp-sub">Datos</h3>
            <Dl rows={[
              ["Iniciativa", seleccionado.proyecto_titulo],
              ["Semana", `S${seleccionado.semana_numero}${seleccionado.semestre ? ` · ${seleccionado.semestre}` : ""}`],
              ["Enviado", seleccionado.fecha_cargue_evidencia ? formatDateOnly(seleccionado.fecha_cargue_evidencia) : "—"],
              ["En espera", seleccionado.dias_en_espera == null ? "—" : `${seleccionado.dias_en_espera} ${seleccionado.dias_en_espera === 1 ? "día" : "días"}`],
              ["Envíos", String(seleccionado.num_envios)],
              ["Horas", `${seleccionado.horas} h`],
            ]} />
            <div className="b2-insp-acc">
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/revision?reporte=${seleccionado.id}`)}>Revisar este entregable</button>
              <button type="button" className="b2-btn" onClick={() => navigate(`/admin/docentes/${seleccionado.docente_id}/matriz`)}>Matriz del docente</button>
            </div>
            <p className="b2-nota">La aprobación u observación se registra en la pantalla de revisión.</p>
          </div>
        )}
      </Inspector>
    </div>
  );
}
