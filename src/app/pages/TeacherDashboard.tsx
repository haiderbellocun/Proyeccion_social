// Mi panel (docente) — diseño B2. Todo sale de GET /docente/:id/dashboard-stats; no se recalcula nada en el frontend.
// La versión anterior (Tinta) se conserva en TeacherDashboardTinta.tsx.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { etiquetaSemana, semaforoConfig, type EstadoEntregable, type IndicadoresSeguimiento, type SemanaActual } from "../data/matrizConstants";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { useB2 } from "../components/b2/B2Context";
import { Bullet } from "../components/b2/Bullet";
import { EstadoDeEntregable } from "../components/b2/EstadoEntregable";
import { IChevR, IMas, ISeguimiento } from "../components/b2/icons";
import { fechaCorta } from "../components/b2/matriz-util";
import { EstadoIcon } from "../components/b2/ui";

type DashboardStats = { total: number; completed: number; pct: number; expectedPct: number; compliancePct: number; due: number; gap: number; aprobados?: number; approvedPct?: number };
type StatsByMonth = { month: string; total: number; done: number; aprobados?: number; pct: number; pct_aprobado?: number; expectedPct: number; active: boolean };
type StatsByWeek = { semana: number; total: number; done: number; pct: number; pct_aprobado?: number; expectedPct: number };
type UpcomingItem = { id: number; entregable_id?: number | null; iniciativa: string; entregable: string; fechaInicio: string | null; fechaFin: string | null; semana: number; estado?: EstadoEntregable; vencido?: boolean; comentario_revision?: string | null };
type Conteos = { pendientes: number; observados: number; vencidos: number; en_revision: number };
type ActivityRow = { id: number; entregableId: number | null; category: string; deliverable: string; initiative: string; initiativeType: string; startDate: string | null; deadline: string | null; status: string; statusLabel: string; estado?: EstadoEntregable; vencido?: boolean };

const EMPTY_STATS: DashboardStats = { total: 0, completed: 0, pct: 0, expectedPct: 0, compliancePct: 100, due: 0, gap: 0 };
type Filtro = "todos" | "pendientes" | "observados" | "vencidos" | "aprobados";
const fecha = (v: string | null | undefined) => (v ? fechaCorta(v) : "—");
const signo = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

function Esqueleto({ filas = 4 }: { filas?: number }) {
  return <div className="b2-skel-w" aria-hidden="true">{Array.from({ length: filas }, (_, i) => <span key={i} className="b2-skel" style={{ width: `${88 - i * 9}%` }} />)}</div>;
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { busqueda, setSemana, registrarRecarga } = useB2();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [byMonth, setByMonth] = useState<StatsByMonth[]>([]);
  const [byWeek, setByWeek] = useState<StatsByWeek[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresSeguimiento | null>(null);
  const [semana, setSemanaLocal] = useState<SemanaActual | null>(null);
  const [conteos, setConteos] = useState<Conteos>({ pendientes: 0, observados: 0, vencidos: 0, en_revision: 0 });
  const [proximo, setProximo] = useState<UpcomingItem | null>(null);
  const [observados, setObservados] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [col, setCol] = useState({ p: "#503296", bar: "#666b7f", t: "#6b6878", l: "#e6e5ea" });

  useEffect(() => {
    const el = document.querySelector(".b2-root");
    if (!el) return;
    const g = getComputedStyle(el);
    const v = (n: string, d: string) => g.getPropertyValue(n).trim() || d;
    setCol({ p: v("--c-primary", "#503296"), bar: v("--c-bar", "#666b7f"), t: v("--c-text-3", "#6b6878"), l: v("--c-line", "#e6e5ea") });
  }, []);

  useEffect(() => {
    const id = currentUser?.id ?? null;
    if (!id) { setStats(EMPTY_STATS); setLoading(false); return; }
    let cancelado = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resStats = await fetch(`${API_BASE}/docente/${id}/dashboard-stats`);
        if (!resStats.ok) throw new Error("dashboard-stats");
        const data = await resStats.json();
        if (cancelado) return;
        setStats({ ...EMPTY_STATS, ...(data.stats || {}) });
        setByMonth(Array.isArray(data.byMonth) ? data.byMonth : []);
        setByWeek(Array.isArray(data.byWeek) ? data.byWeek : []);
        setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
        setActivities(Array.isArray(data.activities) ? data.activities : []);
        setIndicadores(data.indicadores ?? null);
        setSemanaLocal(data.semana_actual ?? null);
        setSemana(data.semana_actual ?? null);
        setConteos(data.conteos ?? { pendientes: 0, observados: 0, vencidos: 0, en_revision: 0 });
        setProximo(data.proximo_entregable ?? null);
        setObservados(Array.isArray(data.observados) ? data.observados : []);
      } catch (err) {
        console.error(err);
        if (!cancelado) {
          setError("No se pudo cargar tu panel. Revisa la conexión e intenta de nuevo.");
          notify.error("No se pudo cargar la información.");
          setStats(EMPTY_STATS);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [currentUser?.id, recarga, setSemana]);

  useEffect(() => {
    const f = () => setRecarga((n) => n + 1);
    registrarRecarga(f);
    return () => { registrarRecarga(null); setSemana(null); };
  }, [registrarRecarga, setSemana]);

  const s = stats ?? EMPTY_STATS;
  const ind = indicadores;
  const semaforo = ind ? semaforoConfig[ind.semaforo] : null;
  const nombre = currentUser?.nombre || "docente";
  const semanaHoy = semana?.estado === "en_curso" ? semana.numero : null;
  const sinMatriz = !loading && !error && s.total === 0 && activities.length === 0;
  const semanal = byWeek.map((r) => ({ semana: r.semana, Reportado: r.pct, Aprobado: r.pct_aprobado ?? 0, Esperado: r.expectedPct }));

  const q = busqueda.trim().toLowerCase();
  const cuenta = (f: (r: ActivityRow) => boolean) => activities.filter(f).length;
  const filas = useMemo(() => activities.filter((r) => {
    if (filtro === "pendientes" && !(r.estado === "no_iniciado" || r.estado === "borrador")) return false;
    if (filtro === "observados" && r.estado !== "observado") return false;
    if (filtro === "vencidos" && !r.vencido) return false;
    if (filtro === "aprobados" && r.estado !== "aprobado") return false;
    if (q && !`${r.deliverable} ${r.initiative} ${r.category}`.toLowerCase().includes(q)) return false;
    return true;
  }), [activities, filtro, q]);

  const accionFila = (r: ActivityRow) => (r.estado === "observado" ? "Corregir" : r.estado === "aprobado" || r.estado === "enviado" ? "Ver" : "Reportar");

  return (
    <div className="b2-vista b2-dash b2-scope">
      <div className="b2-vista-main" data-scroll>
        <div className="b2-pg">
          <header className="b2-pg-h">
            <div>
              <h1 className="b2-pg-t">Hola, {nombre}</h1>
              <p className="b2-pg-s">{loading ? "Cargando tu seguimiento…" : `${etiquetaSemana(semana)} · avance según tu matriz de seguimiento`}{semaforo && !loading ? <> · <b>{semaforo.label}</b></> : null}</p>
            </div>
            <div className="b2-pg-acc">
              <button type="button" className="b2-btn" onClick={() => navigate("/docente/matriz")}><ISeguimiento width={16} height={16} />Ver matriz</button>
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/docente/reportar")}><IMas width={16} height={16} />Reportar entregable</button>
            </div>
          </header>

          {error && <div className="b2-alert" role="alert"><span>{error}</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button></div>}
          {sinMatriz && <div className="b2-callout"><strong>Aún no tienes una matriz asignada</strong><p>Cuando coordinación te asigne un grupo de matriz, aquí verás tu avance, tus vencimientos y tus próximas entregas.</p></div>}

          <div className="b2-pg-cols">
            <div className="b2-pg-col">
              <section className="b2-card" aria-labelledby="td-aten">
                <div className="b2-card-h"><h2 id="td-aten">Requiere tu atención</h2><button type="button" className="b2-link" onClick={() => navigate("/docente/evidencias")}>Ver mis evidencias</button></div>
                {loading && !stats ? <Esqueleto filas={3} /> : (
                  <>
                    <dl className="b2-kpis b2-kpis-4">
                      <div><dt><EstadoIcon kind="porhacer" size={13} /> Pendientes</dt><dd>{conteos.pendientes}</dd></div>
                      <div><dt><EstadoIcon kind="revision" size={13} /> En revisión</dt><dd>{conteos.en_revision}</dd></div>
                      <div><dt><EstadoIcon kind="observado" size={13} /> Observados</dt><dd className={conteos.observados > 0 ? "b2-acento" : undefined}>{conteos.observados}</dd></div>
                      <div><dt><EstadoIcon kind="vencido" size={13} /> Vencidos</dt><dd className={conteos.vencidos > 0 ? "b2-txt-danger" : undefined}>{conteos.vencidos}</dd></div>
                    </dl>
                    {observados.length > 0 ? (
                      <ul className="b2-lista">
                        {observados.slice(0, 5).map((o) => (
                          <li key={`${o.entregable_id ?? "p"}-${o.id}`}>
                            <button type="button" className="b2-fila" onClick={() => navigate(`/docente/evidencias?entregable=${o.id}`)}>
                              <span className="b2-fila-t">
                                <span className="b2-tt" title={o.entregable}>{o.entregable}</span>
                                {o.comentario_revision && <span className="b2-sub b2-sub-obs">Observación: {o.comentario_revision}</span>}
                                <span className="b2-sub">Semana {o.semana} · límite {fecha(o.fechaFin)}{o.vencido ? " · vencido" : ""}</span>
                              </span>
                              <span className="b2-btn b2-btn-sm b2-btn-primary">Corregir</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="b2-vacio">No tienes evidencias por corregir. Cuando coordinación observe un entregable, aparecerá aquí con su comentario.</p>}
                  </>
                )}
              </section>

              <section className="b2-card" aria-labelledby="td-prox">
                <div className="b2-card-h"><h2 id="td-prox">Próximas entregas</h2>{proximo && <span className="b2-card-n">Siguiente: S{proximo.semana} · {fecha(proximo.fechaFin)}</span>}</div>
                {loading && !stats ? <Esqueleto filas={3} /> : upcoming.length === 0 ? <p className="b2-vacio">Sin entregas próximas: no hay entregables cargados para las próximas semanas.</p> : (
                  <ul className="b2-lista">
                    {upcoming.slice(0, 5).map((d) => (
                      <li key={`${d.entregable_id ?? "p"}-${d.id}`}>
                        <button type="button" className="b2-fila" onClick={() => navigate(`/docente/matriz?plantilla=${d.id}`)}>
                          <span className="b2-fila-sem" aria-hidden="true"><small>Sem</small>{d.semana}</span>
                          <span className="b2-fila-t">
                            <span className="b2-tt" title={d.entregable}>{d.entregable}</span>
                            <span className="b2-sub">{d.iniciativa} · {fecha(d.fechaInicio)} – {fecha(d.fechaFin)}</span>
                          </span>
                          <EstadoDeEntregable estado={d.estado} vencido={d.vencido} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="b2-card" aria-labelledby="td-sem">
                <div className="b2-card-h">
                  <h2 id="td-sem">Progreso semanal</h2>
                  <p className="b2-leyenda"><i className="b2-lg" style={{ background: col.p }} />Reportado<i className="b2-lg" style={{ background: col.bar }} />Aprobado<i className="b2-lg b2-lg-e" />Esperado</p>
                </div>
                {semanal.length > 0 ? (
                  <div role="img" aria-label="Avance semanal acumulado: reportado, aprobado y esperado" style={{ padding: "4px 8px 8px 0" }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={semanal} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                        <CartesianGrid stroke={col.l} vertical={false} />
                        <XAxis dataKey="semana" tickFormatter={(v) => `S${v}`} tick={{ fontSize: 11, fill: col.t }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: col.t }} unit="%" domain={[0, 100]} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => `${v}%`} labelFormatter={(v) => `Semana ${v}`} contentStyle={{ fontSize: 12, borderRadius: 6, border: `1px solid ${col.l}` }} />
                        {semanaHoy != null && <ReferenceLine x={semanaHoy} stroke={col.p} strokeDasharray="4 3" label={{ value: "Hoy", position: "insideTopRight", fontSize: 11, fill: col.p }} />}
                        <Area type="monotone" dataKey="Esperado" stroke={col.p} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} />
                        <Area type="monotone" dataKey="Reportado" stroke={col.p} strokeWidth={2.5} fill={col.p} fillOpacity={0.1} dot={false} activeDot={{ r: 4 }} />
                        <Area type="monotone" dataKey="Aprobado" stroke={col.bar} strokeWidth={2.5} fill="none" dot={false} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="b2-vacio">Aún no hay avance semanal. Se mostrará cuando envíes tus primeros entregables.</p>}
              </section>
            </div>

            <div className="b2-pg-col">
              <section className="b2-card" aria-labelledby="td-ind">
                <div className="b2-card-h"><h2 id="td-ind">Mi avance</h2></div>
                {loading && !stats ? <Esqueleto filas={3} /> : (
                  <>
                    <div className="b2-hero">
                      <div><span className="b2-hero-n">{s.pct}%</span><span className="b2-hero-l">reportado</span></div>
                      <p className="b2-hero-s">{s.completed} de {s.total} entregables enviados a revisión o aprobados</p>
                    </div>
                    <dl className="b2-kpis b2-kpis-3">
                      <div><dt>Aprobado</dt><dd>{ind ? `${ind.pct_aprobado}%` : "—"}</dd><span className="b2-kpi-s">{ind ? `${ind.aprobados} de ${ind.total}` : "sin matriz"}</span></div>
                      <div><dt>Esperado a hoy</dt><dd>{s.expectedPct}%</dd><span className="b2-kpi-s">{s.due} exigibles</span></div>
                      <div><dt>Brecha</dt><dd className={(ind?.brecha_entregables ?? 0) < 0 ? "b2-txt-danger" : undefined} title="Aprobados − esperados a la fecha">{ind ? signo(ind.brecha_entregables) : "—"}</dd><span className="b2-kpi-s">entregables</span></div>
                    </dl>
                    <div className="b2-nota">
                      {ind && ind.exigibles > 0 && ind.cumplimiento_exigible != null ? `Cumplimiento exigible ${Math.round(ind.cumplimiento_exigible)}% (${ind.exigibles_aprobados}/${ind.exigibles})` : "Sin entregables exigibles todavía"}
                      {ind ? ` · horas ${ind.horas_aprobadas}/${ind.horas_programadas} h aprobadas` : ""}
                    </div>
                  </>
                )}
              </section>

              <section className="b2-card" aria-labelledby="td-mes">
                <div className="b2-card-h"><h2 id="td-mes">Avance por mes</h2><button type="button" className="b2-link" onClick={() => navigate("/docente/matriz")}>Ver matriz</button></div>
                {loading && !stats ? <Esqueleto filas={4} /> : byMonth.length === 0 ? <p className="b2-vacio">Tu matriz aún no tiene entregables con fecha.</p> : (
                  <ul className="b2-docs">
                    {byMonth.map((m) => (
                      <li key={m.month} className="b2-doc">
                        <span className="b2-doc-n">
                          <span className="b2-tt" style={{ textTransform: "capitalize" }}>{m.month}{m.active && m.total > 0 ? " · en curso" : ""}</span>
                          <span className="b2-sub">{m.done}/{m.total} reportados · {m.aprobados ?? 0} aprobados · esperado {Math.round(m.expectedPct)}%</span>
                        </span>
                        <Bullet rep={m.pct} apr={m.pct_aprobado ?? null} esp={m.expectedPct} nombre={m.month} />
                        <span />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="b2-leyenda b2-leyenda-b"><i className="b2-lg b2-lg-r" />Reportado<i className="b2-lg b2-lg-a" />Aprobado<i className="b2-lg b2-lg-e" />Esperado</p>
              </section>
            </div>
          </div>

          <section className="b2-card" aria-labelledby="td-prog">
            <div className="b2-card-h"><h2 id="td-prog">Entregables programados</h2><span className="b2-card-n">{filas.length} de {activities.length} · proyectos, actividades y convenios</span></div>
            <div className="b2-chips" role="group" aria-label="Filtrar entregables">
              {([["todos", "Todos", activities.length], ["pendientes", "Pendientes", cuenta((r) => r.estado === "no_iniciado" || r.estado === "borrador")], ["observados", "Observados", cuenta((r) => r.estado === "observado")], ["vencidos", "Vencidos", cuenta((r) => r.vencido === true)], ["aprobados", "Aprobados", cuenta((r) => r.estado === "aprobado")]] as [Filtro, string, number][]).map(([id, t, n]) => (
                <button key={id} type="button" className="b2-chip" data-on={filtro === id || undefined} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{t} <b>{n}</b></button>
              ))}
            </div>
            <div className="b2-tw b2-tw-y" style={{ border: 0, borderRadius: 0, borderTop: "1px solid var(--c-line)" }}>
              <table className="b2-tbl">
                <thead><tr><th>Entregable</th><th className="b2-c-hide">Iniciativa</th><th>Periodo de entrega</th><th>Estado</th><th><span className="b2-sr-only">Acción</span></th></tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={5} style={{ padding: 20 }} className="b2-muted">{loading ? "Cargando entregables…" : activities.length === 0 ? "No hay entregables programados para tu grupo de matriz." : "Ningún entregable coincide con el filtro o la búsqueda."}</td></tr>}
                  {filas.map((row, i) => (
                    <tr key={`${i}-${row.entregableId ?? "p"}-${row.id}`}>
                      <td className="b2-ent"><span title={row.deliverable}>{row.deliverable}</span><span className="b2-sub" style={{ textTransform: "capitalize" }}>{row.category.replaceAll("_", " ")}</span></td>
                      <td className="b2-ent b2-c-hide"><span title={row.initiative}>{row.initiative}</span><span className="b2-sub" style={{ textTransform: "capitalize" }}>{row.initiativeType}</span></td>
                      <td className="b2-nw">{fecha(row.startDate)} → {fecha(row.deadline)}</td>
                      <td className="b2-nw"><EstadoDeEntregable estado={row.estado} vencido={row.vencido} /></td>
                      <td className="b2-nw" style={{ textAlign: "right" }}><button type="button" className={`b2-btn b2-btn-sm${row.estado === "observado" ? " b2-btn-primary" : ""}`} onClick={() => navigate(`/docente/matriz?plantilla=${row.id}`)}>{accionFila(row)} <IChevR width={12} height={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
