import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { notify } from "../lib/notify";
import { semaforoConfig, type Semaforo } from "../data/matrizConstants";
import { AnaPagina, ApiladaH, ColumnasAgrupadas, Figura, FilasBala, Indicadores, n0, pct, type Categoria } from "../components/b2/charts-b2";
import { Barra, DataTable, ErrorCarga, Filtro, Tag, Vacio, type Col } from "../components/b2/admin-ui";
import { Dl } from "../components/b2/ui";
import { Bullet } from "../components/b2/Bullet";
import { IIndicadores, IRefrescar } from "../components/b2/icons";
import "../components/b2/b2-ana-metricas.css";

interface Alcance {
  semestre: string | null;
  activo: boolean;
  estado_periodo: "en_curso" | "cerrado" | "futuro" | "sin_calendario" | "sin_semestre";
  calendario: { fecha_inicio: string; fecha_fin: string; num_semanas: number } | null;
  vacio: boolean;
  advertencias: string[];
}
interface MetricasPayload {
  alcance?: Alcance;
  resumen: { total_reportes: number; aprobados: number; pendientes: number; con_observaciones: number; porcentaje_aprobacion: number | null };
  por_mes: { mes: string; total: number; aprobados: number; observados: number; pendientes: number }[];
  por_grupo: {
    grupo_id: number;
    grupo_nombre: string;
    semestre?: string | null;
    tipo_docente: "ANTIGUO" | "NUEVO";
    total_docentes: number;
    entregables_completados: number;
    entregables_reportados?: number;
    entregables_aprobados?: number;
    entregables_esperados?: number;
    entregables_total: number;
    porcentaje: number;
    porcentaje_aprobado?: number;
    porcentaje_esperado?: number;
  }[];
  por_regional: { regional: string; docentes: number; porcentaje_avance: number; porcentaje_reportado?: number; porcentaje_aprobado?: number }[];
  top_atrasados: {
    docente_id: number;
    nombre: string;
    programa: string;
    regional: string;
    grupo: string;
    entregables_vencidos: number;
    porcentaje_avance: number;
    porcentaje_reportado?: number;
    porcentaje_aprobado?: number;
    semaforo?: Semaforo;
  }[];
}
type Grupo = MetricasPayload["por_grupo"][number];
type Atrasado = MetricasPayload["top_atrasados"][number];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const tonoSemaforo = (s?: Semaforo) => (s === "verde" ? "ok" : s === "amarillo" ? "aviso" : s === "rojo" ? "peligro" : "neutro");
const etiquetaSemaforo = (s?: Semaforo) => semaforoConfig[s ?? "sin_datos"]?.label ?? "Sin matriz";
const repDe = (a: Atrasado) => a.porcentaje_reportado ?? a.porcentaje_avance;
const repGrupo = (g: Grupo) => g.porcentaje;

type Seleccion = { t: "doc" | "grp"; id: number } | null;
type Orden = { clave: string; dir: "asc" | "desc" };

/** Filas de avance por regional: el backend no entrega «esperado» por regional, por eso no se dibuja esa marca. */
function FilasRegional({ filas }: { filas: MetricasPayload["por_regional"] }) {
  return (
    <ul className="b2-fb" aria-label="Avance por regional">
      {filas.map((r) => {
        const rep = r.porcentaje_reportado ?? r.porcentaje_avance;
        const apr = r.porcentaje_aprobado;
        return (
          <li key={r.regional}>
            <div className="b2-fb-f b2-ana-met-reg">
              <span className="b2-fb-n"><span className="b2-tt" title={r.regional}>{r.regional}</span><span className="b2-sub">{n0(r.docentes)} {r.docentes === 1 ? "docente" : "docentes"}</span></span>
              <span className="b2-fb-b">
                <span className="b2-bl" role="img" aria-label={`${r.regional}: reportado ${pct(rep)}, aprobado ${pct(apr)}`}>
                  <span className="b2-bl-r" style={{ width: `${Math.max(0, Math.min(100, rep))}%` }} />
                  <span className="b2-bl-a" style={{ width: `${Math.max(0, Math.min(100, apr ?? 0))}%` }} />
                </span>
              </span>
              <span className="b2-fb-v"><b>{pct(rep)}</b><small>aprobado {pct(apr)}</small></span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function ReportsMetrics() {
  const session = useCurrentUser();
  const navigate = useNavigate();
  const [data, setData] = useState<MetricasPayload | null>(null);
  const [semActivo, setSemActivo] = useState("");
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semParam, setSemParam] = useState(""); // "" = el semestre activo (valor por omisión del backend)
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const solicitud = useRef(0);
  const semAnterior = useRef("");

  const [conVacios, setConVacios] = useState(false);
  const [orden, setOrden] = useState<Orden>({ clave: "nombre", dir: "asc" });
  const [sel, setSel] = useState<Seleccion>(null);

  // Lista de semestres del selector (una vez y al actualizar).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const sm = await fetch(`${API_BASE}/admin/semestres`);
        if (!sm.ok || !vivo) return;
        const j = await sm.json();
        if (!vivo) return;
        setSemActivo(String(j.activo?.codigo ?? ""));
        setSemestres(Array.isArray(j.semestres) ? j.semestres.map(String) : []);
      } catch { /* sin lista: el selector solo muestra el semestre consultado */ }
    })();
    return () => { vivo = false; };
  }, [recarga]);

  // Métricas del semestre elegido. Solo cuenta la última solicitud: la respuesta tardía de un semestre anterior se descarta
  // y, al cambiar de semestre, se limpian los datos para no mostrar cifras de uno bajo el nombre de otro.
  useEffect(() => {
    const mia = ++solicitud.current;
    const vigente = () => mia === solicitud.current;
    if (semAnterior.current !== semParam) { semAnterior.current = semParam; setData(null); }
    (async () => {
      try {
        setCargando(true);
        setError(null);
        const met = await fetch(`${API_BASE}/admin/metricas${semParam ? `?semestre=${encodeURIComponent(semParam)}` : ""}`);
        if (!met.ok) {
          const cuerpo = await met.json().catch(() => ({}));
          throw new Error(typeof cuerpo.error === "string" ? cuerpo.error : "Error métricas");
        }
        const payload = (await met.json()) as MetricasPayload;
        if (!vigente()) return;
        setData(payload);
      } catch (e) {
        if (!vigente()) return;
        console.error(e);
        notify.error("No se pudo cargar las métricas. Intente más tarde.");
        setError(e instanceof Error && e.message !== "Error métricas" ? e.message : "No se pudieron cargar las métricas.");
        setData(null);
      } finally {
        if (vigente()) setCargando(false);
      }
    })();
  }, [recarga, semParam]);

  const fechaTitulo = useMemo(
    () => new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    []
  );

  const semMostrado = data?.alcance?.semestre ?? semParam;
  const opcionesSem = useMemo(() => [...new Set([...(semMostrado ? [semMostrado] : []), ...semestres])].sort().reverse(), [semMostrado, semestres]);

  /* ───────── por mes (semestre consultado) ───────── */
  const calendario = data?.alcance?.calendario ?? null;
  const categoriasMes = useMemo<Categoria[]>(() => {
    const hoy = hoyBogota();
    const iniciosMes: { idx: number; primero: string }[] = [];
    if (calendario) {
      const [y0, m0] = calendario.fecha_inicio.slice(0, 10).split("-").map(Number);
      const [y1, m1] = calendario.fecha_fin.slice(0, 10).split("-").map(Number);
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m += 1) {
        if (m > 12) { m = 1; y += 1; if (y > y1) break; }
        iniciosMes.push({ idx: m - 1, primero: `${y}-${String(m).padStart(2, "0")}-01` });
      }
    }
    return (data?.por_mes ?? []).map((r) => {
      const idx = MESES.indexOf(r.mes.trim().toLowerCase());
      const coinc = idx >= 0 ? iniciosMes.filter((x) => x.idx === idx) : [];
      const futuro = coinc.length === 1 ? coinc[0].primero > hoy : false;
      return {
        id: r.mes,
        label: r.mes,
        sub: `${n0(r.total)} ${r.total === 1 ? "envío" : "envíos"}`,
        futuro,
        valores: [
          { s: "apr", label: "Aprobados", valor: r.aprobados },
          { s: "obs", label: "Observados", valor: r.observados },
          { s: "pen", label: "Pendientes", valor: r.pendientes },
        ],
      };
    });
  }, [data?.por_mes, calendario]);
  const maxMes = Math.max(1, ...(data?.por_mes ?? []).flatMap((r) => [r.aprobados, r.observados, r.pendientes]));
  const hayMes = (data?.por_mes ?? []).some((r) => r.total > 0);

  /* ───────── por grupo ───────── */
  const gruposSem = useMemo(() => data?.por_grupo ?? [], [data?.por_grupo]);
  const gruposConDocentes = gruposSem.filter((g) => g.total_docentes > 0);
  const ocultos = gruposSem.length - gruposConDocentes.length;
  const gruposVisibles = conVacios ? gruposSem : gruposConDocentes;

  const filasTabla = useMemo(() => {
    const dir = orden.dir === "asc" ? 1 : -1;
    const v = (g: Grupo): number | string => {
      switch (orden.clave) {
        case "semestre": return g.semestre ?? "";
        case "tipo": return g.tipo_docente;
        case "docentes": return g.total_docentes;
        case "reportados": return g.entregables_completados;
        case "total": return g.entregables_total;
        case "rep": return repGrupo(g);
        case "apr": return g.porcentaje_aprobado ?? 0;
        case "esp": return g.porcentaje_esperado ?? 0;
        default: return g.grupo_nombre;
      }
    };
    return [...gruposVisibles].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return c !== 0 ? dir * c : a.grupo_nombre.localeCompare(b.grupo_nombre, "es");
    });
  }, [gruposVisibles, orden]);
  const alternarOrden = (clave: string) => setOrden((o) => (o.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: clave === "nombre" || clave === "semestre" || clave === "tipo" ? "asc" : "desc" }));

  const colsGrupo: Col<Grupo>[] = [
    { id: "nombre", titulo: "Grupo", ancho: "minmax(220px, 1fr)", orden: "nombre", celda: (g) => <span className="b2-tt" title={g.grupo_nombre}>{g.grupo_nombre}</span> },
    { id: "semestre", titulo: "Semestre", ancho: "88px", prioridad: 2, orden: "semestre", celda: (g) => g.semestre ?? "—" },
    { id: "tipo", titulo: "Tipo", ancho: "86px", prioridad: 2, orden: "tipo", celda: (g) => <Tag tono={g.tipo_docente === "NUEVO" ? "primario" : "neutro"}>{g.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"}</Tag> },
    { id: "docentes", titulo: "Docentes", ancho: "76px", num: true, orden: "docentes", celda: (g) => n0(g.total_docentes) },
    { id: "reportados", titulo: "Reportados", ancho: "92px", prioridad: 2, num: true, orden: "reportados", celda: (g) => n0(g.entregables_completados) },
    { id: "total", titulo: "Total", ancho: "64px", prioridad: 2, num: true, orden: "total", celda: (g) => n0(g.entregables_total) },
    { id: "rep", titulo: "Reportado", ancho: "92px", num: true, orden: "rep", celda: (g) => (g.total_docentes > 0 ? pct(g.porcentaje) : "—") },
    { id: "apr", titulo: "Aprobado", ancho: "88px", prioridad: 3, num: true, orden: "apr", celda: (g) => (g.total_docentes > 0 ? pct(g.porcentaje_aprobado) : "—") },
    { id: "esp", titulo: "Esperado", ancho: "88px", prioridad: 3, num: true, orden: "esp", celda: (g) => (g.total_docentes > 0 ? pct(g.porcentaje_esperado) : "—") },
  ];

  /* ───────── atención ───────── */
  const atrasados = data?.top_atrasados ?? [];
  const colsDoc: Col<Atrasado>[] = [
    { id: "nombre", titulo: "Docente", ancho: "minmax(200px, 1fr)", celda: (d) => <><span className="b2-tt" title={d.nombre}>{d.nombre}</span><span className="b2-sub">{d.programa}</span></> },
    { id: "regional", titulo: "Regional", ancho: "110px", prioridad: 2, celda: (d) => d.regional },
    { id: "grupo", titulo: "Grupo", ancho: "minmax(140px, 220px)", prioridad: 3, celda: (d) => <span className="b2-tt" title={d.grupo}>{d.grupo}</span> },
    { id: "rep", titulo: "Reportado", ancho: "128px", num: true, celda: (d) => <>{pct(repDe(d))}{repDe(d) < 30 && <> <Tag tono="peligro">Bajo 30 %</Tag></>}</> },
    { id: "apr", titulo: "Aprobado", ancho: "88px", prioridad: 2, num: true, celda: (d) => pct(d.porcentaje_aprobado) },
    { id: "ven", titulo: "Vencidos", ancho: "80px", num: true, celda: (d) => <span className={d.entregables_vencidos > 0 ? "b2-neg" : undefined}>{n0(d.entregables_vencidos)}</span> },
    { id: "estado", titulo: "Estado", ancho: "118px", celda: (d) => <Tag tono={tonoSemaforo(d.semaforo)}>{etiquetaSemaforo(d.semaforo)}</Tag> },
  ];

  const docSel = sel?.t === "doc" ? atrasados.find((d) => d.docente_id === sel.id) ?? null : null;
  const grpSel = sel?.t === "grp" ? (data?.por_grupo ?? []).find((g) => g.grupo_id === sel.id) ?? null : null;

  const r = data?.resumen;
  const exportaTablaGrupos = gruposSem.map((g) => [
    g.grupo_nombre, g.semestre ?? "—", g.total_docentes, g.total_docentes > 0 ? pct(g.porcentaje) : "—", g.total_docentes > 0 ? pct(g.porcentaje_aprobado) : "—", g.total_docentes > 0 ? pct(g.porcentaje_esperado) : "—",
  ]);

  const inspector = docSel ? (
    <div className="b2-insp-c">
      <p className="b2-insp-sup">Docente · {docSel.regional}</p>
      <h2 className="b2-insp-h">{docSel.nombre}</h2>
      <div className="b2-insp-estado"><Tag tono={tonoSemaforo(docSel.semaforo)}>{etiquetaSemaforo(docSel.semaforo)}</Tag></div>
      <h3 className="b2-insp-sub">Avance reportado</h3>
      <Bullet rep={repDe(docSel)} nombre={docSel.nombre} />
      <h3 className="b2-insp-sub">Avance aprobado</h3>
      <Bullet apr={docSel.porcentaje_aprobado} rep={docSel.porcentaje_aprobado} nombre={`${docSel.nombre} (aprobado)`} />
      <h3 className="b2-insp-sub">Datos</h3>
      <Dl rows={[
        ["Programa", docSel.programa],
        ["Regional", docSel.regional],
        ["Grupo", docSel.grupo],
        ["Reportado", pct(repDe(docSel))],
        ["Aprobado", pct(docSel.porcentaje_aprobado)],
        ["Vencidos", n0(docSel.entregables_vencidos)],
      ]} />
      <div className="b2-insp-acc">
        <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/docentes/${docSel.docente_id}/matriz`)}>Ver matriz</button>
        <button type="button" className="b2-btn" onClick={() => navigate("/admin/avance")}>Ver su avance</button>
        <button type="button" className="b2-btn" onClick={() => navigate("/admin/revision")}>Ir a la bandeja de revisión</button>
        <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
      </div>
    </div>
  ) : grpSel ? (
    <div className="b2-insp-c">
      <p className="b2-insp-sup">Grupo de matriz · {grpSel.semestre ?? "sin semestre"}</p>
      <h2 className="b2-insp-h">{grpSel.grupo_nombre}</h2>
      <div className="b2-insp-estado"><Tag tono={grpSel.tipo_docente === "NUEVO" ? "primario" : "neutro"}>{grpSel.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"}</Tag></div>
      {grpSel.total_docentes > 0 ? (
        <>
          <h3 className="b2-insp-sub">Avance del grupo</h3>
          <Bullet rep={grpSel.porcentaje} apr={grpSel.porcentaje_aprobado} esp={grpSel.porcentaje_esperado} nombre={grpSel.grupo_nombre} />
        </>
      ) : <p className="b2-insp-p">Este grupo no tiene docentes asignados; por eso no tiene avance.</p>}
      <h3 className="b2-insp-sub">Datos</h3>
      <Dl rows={[
        ["Semestre", grpSel.semestre ?? "—"],
        ["Docentes", n0(grpSel.total_docentes)],
        ["Reportados", `${n0(grpSel.entregables_completados)} de ${n0(grpSel.entregables_total)}`],
        ["Aprobados", n0(grpSel.entregables_aprobados)],
        ["Esperados a la fecha", n0(grpSel.entregables_esperados)],
        ["% reportado", grpSel.total_docentes > 0 ? pct(grpSel.porcentaje) : "—"],
        ["% aprobado", grpSel.total_docentes > 0 ? pct(grpSel.porcentaje_aprobado) : "—"],
        ["% esperado", grpSel.total_docentes > 0 ? pct(grpSel.porcentaje_esperado) : "—"],
      ]} />
      <div className="b2-insp-acc">
        <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/sistema?tab=plantillas${grpSel.semestre ? `&semestre=${encodeURIComponent(grpSel.semestre)}` : ""}&grupo=${grpSel.grupo_id}`)}>Ver plantillas del grupo</button>
        <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
      </div>
    </div>
  ) : null;

  const alActualizar = useCallback(() => setRecarga((n) => n + 1), []);

  return (
    <AnaPagina
      titulo="Reportes y métricas"
      icono={<IIndicadores width={20} height={20} />}
      subtitulo={<><span className="b2-ana-met-fecha">{fechaTitulo}</span>{session?.correo ? ` · ${session.correo}` : ""}</>}
      acciones={
        <>
          <Filtro value={semMostrado} onChange={setSemParam} etiqueta="Filtrar por semestre" ancho={190}>
            {opcionesSem.map((sm) => <option key={sm} value={sm}>{sm}{sm === semActivo ? " (activo)" : ""}</option>)}
          </Filtro>
          <button type="button" className="b2-btn" onClick={alActualizar} disabled={cargando}><IRefrescar width={15} height={15} />Actualizar</button>
        </>
      }
      inspectorAbierto={!!inspector}
      inspectorEtiqueta={sel ? `${sel.t}-${sel.id}` : "metricas"}
      onCerrarInspector={() => setSel(null)}
      inspector={inspector}
    >
      {error && <ErrorCarga onReintentar={alActualizar}>{error}</ErrorCarga>}

      {cargando && !data && (
        <div className="b2-skel-w" role="status" aria-label="Cargando métricas…">{[92, 70, 84, 60, 78].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%`, height: i === 0 ? 40 : 14 }} />)}</div>
      )}

      {data && (
        <>
          <Indicadores items={[
            { k: "Total de reportes", v: n0(r?.total_reportes), titulo: "Entregables completados registrados en el semestre" },
            { k: "Aprobados", v: n0(r?.aprobados) },
            { k: "Pendientes de revisión", v: n0(r?.pendientes) },
            { k: "Con observaciones", v: n0(r?.con_observaciones) },
            { k: "% de aprobación", v: pct(r?.porcentaje_aprobacion), titulo: "Aprobados sobre el total de reportes" },
          ]} />
          <p className="b2-aviso-sem">
            Todas las cifras corresponden al semestre {semMostrado}
            {data.alcance?.estado_periodo === "cerrado" ? " (cerrado: cifras históricas)" : data.alcance?.estado_periodo === "futuro" ? " (aún no inicia)" : semMostrado === semActivo ? " (activo)" : ""}.
            {" "}«Por mes» se cuenta según la fecha de envío.{(data.alcance?.advertencias ?? []).map((a) => ` ${a}`).join("")}
          </p>

          <div className="b2-ch-grid b2-ana-met-fila">
            <Figura
              pregunta="¿Cuántos reportes se enviaron cada mes?"
              nota={`Semestre ${semMostrado}, por fecha de envío. Un mes futuro aún no es exigible.`}
              leyenda={[{ s: "apr", label: "Aprobados" }, { s: "obs", label: "Observados" }, { s: "pen", label: "Pendientes" }]}
              vacio={hayMes ? undefined : <Vacio titulo="Aún no hay reportes en este semestre">Aparecerán aquí cuando los docentes envíen entregables.</Vacio>}
              tabla={{ cabeceras: ["Mes", "Aprobados", "Observados", "Pendientes", "Total"], filas: (data.por_mes ?? []).map((m) => [m.mes, m.aprobados, m.observados, m.pendientes, m.total]) }}
            >
              <ColumnasAgrupadas categorias={categoriasMes} max={maxMes} unidad="" etiqueta="Reportes por mes: aprobados, observados y pendientes" alto={200} />
            </Figura>
            <div className="b2-ch-col">
              <Figura
                pregunta="¿Cómo se reparte la revisión?"
                nota="Reportes del semestre."
                tabla={{ cabeceras: ["Estado", "Reportes"], filas: [["Aprobados", r?.aprobados ?? 0], ["Pendientes de revisión", r?.pendientes ?? 0], ["Con observaciones", r?.con_observaciones ?? 0]] }}
              >
                <ApiladaH etiqueta="Estado de la revisión" segmentos={[
                  { s: "apr", label: "Aprobados", valor: r?.aprobados ?? 0 },
                  { s: "pen", label: "Pendientes de revisión", valor: r?.pendientes ?? 0 },
                  { s: "obs", label: "Con observaciones", valor: r?.con_observaciones ?? 0 },
                ]} />
              </Figura>
              <Figura
                pregunta="¿Cómo avanza cada regional?"
                nota="Promedio de avance reportado y aprobado de sus docentes."
                leyenda={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }]}
                vacio={(data.por_regional ?? []).length === 0 ? <Vacio titulo="Sin regionales con matriz">Cuando existan docentes con entregables se mostrará su avance.</Vacio> : undefined}
                tabla={{ cabeceras: ["Regional", "Docentes", "Reportado", "Aprobado"], filas: (data.por_regional ?? []).map((x) => [x.regional, x.docentes, pct(x.porcentaje_reportado ?? x.porcentaje_avance), pct(x.porcentaje_aprobado)]) }}
              >
                <FilasRegional filas={data.por_regional ?? []} />
              </Figura>
            </div>
          </div>

          <section className="b2-ana-sec" aria-label="Docentes que requieren atención">
            <h2>¿Qué docentes requieren atención?</h2>
            <p>Los 10 con más entregables vencidos y menor avance aprobado. Abre un docente para ir a su matriz o a la bandeja de revisión.</p>
            <DataTable
              etiqueta="Docentes con menor avance"
              cols={colsDoc}
              rows={atrasados}
              getKey={(d) => d.docente_id}
              selId={sel?.t === "doc" ? sel.id : null}
              onSelect={(d) => setSel(d ? { t: "doc", id: d.docente_id } : null)}
              cargando={false}
              vacio={<Vacio titulo="Sin docentes atrasados">Ningún docente presenta rezago en este momento.</Vacio>}
              filaMovil={(d) => ({
                titulo: d.nombre,
                lineas: [`${d.programa} · ${d.regional}`, `Reportado ${pct(repDe(d))}${repDe(d) < 30 ? " · Bajo 30 %" : ""} · Aprobado ${pct(d.porcentaje_aprobado)}`],
                lado: <><Tag tono={tonoSemaforo(d.semaforo)}>{etiquetaSemaforo(d.semaforo)}</Tag><span className={d.entregables_vencidos > 0 ? "b2-neg" : undefined}>{n0(d.entregables_vencidos)} vencidos</span></>,
              })}
            />
          </section>

          <section className="b2-ana-sec" aria-label="Cumplimiento por grupo">
            <h2>¿Cómo cumple cada grupo?</h2>
            <p>Reportado, aprobado y esperado a la fecha por grupo de matriz. Solo se dibujan los grupos con docentes; los demás quedan en la tabla de datos.</p>
            <Barra contador={`${gruposVisibles.length} ${gruposVisibles.length === 1 ? "grupo" : "grupos"}`}>
              <label className="b2-chk b2-ana-met-vacios">
                <input type="checkbox" checked={conVacios} onChange={(e) => setConVacios(e.target.checked)} />
                Incluir grupos sin docentes{ocultos > 0 ? ` (${ocultos})` : ""}
              </label>
              <label className="b2-ana-met-orden">
                <span className="b2-sr-only">Ordenar por</span>
                <select className="b2-sel" value={`${orden.clave}:${orden.dir}`} onChange={(e) => { const [clave, dir] = e.target.value.split(":"); setOrden({ clave, dir: dir as "asc" | "desc" }); }} aria-label="Ordenar la tabla por">
                  <option value="nombre:asc">Ordenar: nombre</option>
                  <option value="rep:desc">Ordenar: reportado (mayor)</option>
                  <option value="rep:asc">Ordenar: reportado (menor)</option>
                  <option value="apr:desc">Ordenar: aprobado (mayor)</option>
                  <option value="docentes:desc">Ordenar: docentes</option>
                </select>
              </label>
            </Barra>
            <Figura
              pregunta="Avance de los grupos con docentes"
              leyenda={[{ s: "rep", label: "Reportado" }, { s: "apr", label: "Aprobado" }, { s: "esp", label: "Esperado a la fecha" }]}
              vacio={gruposConDocentes.length === 0 ? <Vacio titulo={gruposSem.length === 0 ? "Sin grupos en este semestre" : "Ningún grupo de este semestre tiene docentes"}>{gruposSem.length === 0 ? "Prueba con otro semestre o crea grupos desde Administración." : "Asigna docentes a un grupo o activa «Incluir grupos sin docentes» para verlos en la tabla."}</Vacio> : undefined}
              tabla={{ titulo: `Ver todos los grupos del filtro en tabla (${gruposSem.length})`, cabeceras: ["Grupo", "Semestre", "Docentes", "Reportado", "Aprobado", "Esperado"], filas: exportaTablaGrupos }}
            >
              <FilasBala
                etiqueta="Cumplimiento por grupo"
                seleccionada={sel?.t === "grp" ? sel.id : null}
                onAbrir={(id) => setSel({ t: "grp", id: Number(id) })}
                filas={gruposConDocentes.map((g) => ({
                  id: g.grupo_id,
                  etiqueta: g.grupo_nombre,
                  sub: `${g.semestre ?? "—"} · ${g.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"}`,
                  rep: g.porcentaje,
                  apr: g.porcentaje_aprobado,
                  esp: g.porcentaje_esperado,
                  extra: <>{n0(g.total_docentes)} {g.total_docentes === 1 ? "docente" : "docentes"} · {n0(g.entregables_completados)} de {n0(g.entregables_total)} entregables reportados</>,
                }))}
              />
            </Figura>
            <DataTable
              etiqueta="Cumplimiento por grupo de matriz"
              cols={colsGrupo}
              rows={filasTabla}
              getKey={(g) => g.grupo_id}
              selId={sel?.t === "grp" ? sel.id : null}
              onSelect={(g) => setSel(g ? { t: "grp", id: g.grupo_id } : null)}
              cargando={false}
              orden={orden}
              onOrden={alternarOrden}
              vacio={<Vacio titulo="Sin grupos con matriz">Cuando existan grupos con docentes y entregables se mostrará su cumplimiento.</Vacio>}
              filaMovil={(g) => ({
                titulo: g.grupo_nombre,
                lineas: [`${g.semestre ?? "—"} · ${g.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"} · ${n0(g.total_docentes)} docentes`, g.total_docentes > 0 ? `Reportado ${pct(g.porcentaje)} · Aprobado ${pct(g.porcentaje_aprobado)} · Esperado ${pct(g.porcentaje_esperado)}` : "Sin docentes asignados"],
                lado: g.total_docentes > 0 ? <b>{pct(g.porcentaje)}</b> : <Tag>Sin docentes</Tag>,
              })}
            />
          </section>
        </>
      )}
    </AnaPagina>
  );
}
