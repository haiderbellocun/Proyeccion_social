import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { AnaPagina, ApiladaH, Figura, FilasApiladas, n0, type Segmento } from "../components/b2/charts-b2";
import { Barra, Buscar, Chips, DataTable, ErrorCarga, Filtro, Tag, Vacio, type Col } from "../components/b2/admin-ui";
import { Dl } from "../components/b2/ui";
import { IIndicadores, IRefrescar } from "../components/b2/icons";
import "../components/b2/b2-ana-indicadores.css";

type Grupo = {
  id: number;
  nombre: string;
  descripcion?: string | null;
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

type TipoFiltro = "todos" | "ANTIGUO" | "NUEVO";

const esNuevo = (t: Grupo["tipo_docente"]) => (t ?? "").toUpperCase() === "NUEVO";
const etiquetaTipo = (t: Grupo["tipo_docente"]) => (t ? (esNuevo(t) ? "Nuevo" : "Antiguo") : "—");
const totalInd = (g: Grupo) => (g.num_proyectos || 0) + (g.num_actividades || 0) + (g.num_convenios_nuevos || 0) + (g.num_convenios_dinamizados || 0);
const segmentosCarga = (g: Grupo): Segmento[] => [
  { s: "a", label: "Proyectos", valor: g.num_proyectos || 0 },
  { s: "b", label: "Actividades", valor: g.num_actividades || 0 },
  { s: "c", label: "Convenios nuevos", valor: g.num_convenios_nuevos || 0 },
  { s: "d", label: "Convenios dinamizados", valor: g.num_convenios_dinamizados || 0 },
];

const VALOR_ORDEN: Record<string, (g: Grupo) => number | string> = {
  nombre: (g) => g.nombre,
  semestre: (g) => g.semestre ?? "",
  tipo: (g) => etiquetaTipo(g.tipo_docente),
  horas: (g) => g.horas_totales ?? 0,
  proyectos: (g) => g.num_proyectos ?? 0,
  actividades: (g) => g.num_actividades ?? 0,
  nuevos: (g) => g.num_convenios_nuevos ?? 0,
  dinamizados: (g) => g.num_convenios_dinamizados ?? 0,
  total: totalInd,
  docentes: (g) => g.num_docentes ?? 0,
  entregables: (g) => g.num_plantilla_entregables ?? 0,
};

// Tira de indicadores local: la clase `.b2-ind` del kit coincide con una clase de la matriz (width: 0), por eso no se usa aquí.
function KpiStrip({ items }: { items: { k: string; v: React.ReactNode; sub?: React.ReactNode; titulo?: string }[] }) {
  return (
    <dl className="b2-mx-stats b2-ana-ind-kpis">
      {items.map((it) => (
        <div key={it.k} title={it.titulo}><dt>{it.k}</dt><dd>{it.v}{it.sub && <small>{it.sub}</small>}</dd></div>
      ))}
    </dl>
  );
}

export default function IndicadoresGrupo() {
  const navigate = useNavigate();
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestre, setSemestre] = useState("");
  const [semestresListos, setSemestresListos] = useState(false);
  const [errorSemestres, setErrorSemestres] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [buscar, setBuscar] = useState("");
  const [orden, setOrden] = useState<{ clave: string; dir: "asc" | "desc" }>({ clave: "", dir: "asc" });
  const [sel, setSel] = useState<number | null>(null);
  const solicitud = useRef(0);

  const cargarSemestres = useCallback(async () => {
    setErrorSemestres(false);
    try {
      const r = await fetch(`${API_BASE}/admin/semestres`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      const lista: string[] = Array.isArray(d.semestres) ? d.semestres : [];
      setSemestres(lista);
      setSemestre((prev) => prev || d.activo?.codigo || lista[0] || "");
    } catch {
      setSemestres([]);
      setSemestre("");
      setErrorSemestres(true);
      setCargando(false);
    } finally {
      setSemestresListos(true);
    }
  }, []);

  useEffect(() => { void cargarSemestres(); }, [cargarSemestres]);

  const cargarGrupos = useCallback(async () => {
    if (!semestre) return;
    const mia = ++solicitud.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/indicadores-grupo?semestre=${encodeURIComponent(semestre)}`);
      if (!res.ok) throw new Error("No se pudo cargar indicadores por grupo");
      const data = await res.json();
      if (mia !== solicitud.current) return;
      setGrupos(Array.isArray(data.grupos) ? data.grupos : []);
    } catch (err) {
      if (mia !== solicitud.current) return;
      console.error(err);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      setError("No se pudieron cargar los indicadores por grupo.");
      setGrupos([]);
    } finally {
      if (mia === solicitud.current) setCargando(false);
    }
  }, [semestre]);

  useEffect(() => { setSel(null); void cargarGrupos(); }, [cargarGrupos]);

  useEffect(() => {
    if (sel == null) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.("input, select, textarea")) setSel(null); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [sel]);

  const hayFiltros = tipo !== "todos" || buscar.trim() !== "";
  const limpiar = () => { setTipo("todos"); setBuscar(""); };

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = grupos.filter((g) => (tipo === "todos" || (tipo === "NUEVO") === esNuevo(g.tipo_docente)) && (!q || g.nombre.toLowerCase().includes(q)));
    const val = VALOR_ORDEN[orden.clave];
    if (!val) return lista;
    const dir = orden.dir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb)) : va - vb;
      return c !== 0 ? dir * c : a.nombre.localeCompare(b.nombre);
    });
  }, [grupos, tipo, buscar, orden]);

  const conteoTipo = useMemo(() => ({
    todos: grupos.length,
    ANTIGUO: grupos.filter((g) => !esNuevo(g.tipo_docente)).length,
    NUEVO: grupos.filter((g) => esNuevo(g.tipo_docente)).length,
  }), [grupos]);

  // Sumas simples de los valores que entrega el backend sobre los grupos visibles.
  const tot = useMemo(() => {
    const suma = (f: (g: Grupo) => number) => visibles.reduce((a, g) => a + (f(g) || 0), 0);
    const docAnt = visibles.filter((g) => !esNuevo(g.tipo_docente)).reduce((a, g) => a + (g.num_docentes || 0), 0);
    return {
      grupos: visibles.length,
      antiguos: visibles.filter((g) => !esNuevo(g.tipo_docente)).length,
      nuevos: visibles.filter((g) => esNuevo(g.tipo_docente)).length,
      docentes: suma((g) => g.num_docentes),
      docAntiguos: docAnt,
      plantilla: suma((g) => g.num_plantilla_entregables),
      horas: suma((g) => g.horas_totales ?? 0),
      proyectos: suma((g) => g.num_proyectos),
      actividades: suma((g) => g.num_actividades),
      nuevosConv: suma((g) => g.num_convenios_nuevos),
      dinamizados: suma((g) => g.num_convenios_dinamizados),
      indicadores: suma(totalInd),
    };
  }, [visibles]);

  const seleccionado = visibles.find((g) => g.id === sel) ?? null;
  const rotuloFiltro = hayFiltros ? " (filtrado)" : "";
  const alternar = (clave: string) => setOrden((o) => (o.clave === clave ? { clave, dir: o.dir === "asc" ? "desc" : "asc" } : { clave, dir: "asc" }));

  const cols: Col<Grupo>[] = [
    { id: "nombre", titulo: "Grupo", ancho: "minmax(190px, 1fr)", orden: "nombre", celda: (g) => <span className="b2-tt" title={g.nombre}>{g.nombre}</span> },
    { id: "semestre", titulo: "Semestre", ancho: "72px", prioridad: 2, orden: "semestre", celda: (g) => g.semestre ?? "—" },
    { id: "tipo", titulo: "Tipo", ancho: "80px", orden: "tipo", celda: (g) => <Tag tono={esNuevo(g.tipo_docente) ? "primario" : "neutro"}>{etiquetaTipo(g.tipo_docente)}</Tag> },
    { id: "horas", titulo: "Horas", ancho: "54px", num: true, orden: "horas", celda: (g) => n0(g.horas_totales ?? 0) },
    { id: "proyectos", titulo: "Proyectos", ancho: "72px", num: true, prioridad: 2, orden: "proyectos", celda: (g) => n0(g.num_proyectos) },
    { id: "actividades", titulo: "Actividades", ancho: "80px", num: true, prioridad: 2, orden: "actividades", celda: (g) => n0(g.num_actividades) },
    { id: "nuevos", titulo: "Conv. nuevos", ancho: "84px", num: true, prioridad: 3, orden: "nuevos", celda: (g) => n0(g.num_convenios_nuevos) },
    { id: "dinamizados", titulo: "Conv. dinam.", ancho: "84px", num: true, prioridad: 3, orden: "dinamizados", celda: (g) => n0(g.num_convenios_dinamizados) },
    { id: "total", titulo: "Total indic.", ancho: "80px", num: true, orden: "total", celda: (g) => <strong>{n0(totalInd(g))}</strong> },
    { id: "docentes", titulo: "Docentes", ancho: "72px", num: true, orden: "docentes", celda: (g) => n0(g.num_docentes) },
    { id: "entregables", titulo: "Entregables", ancho: "84px", num: true, prioridad: 2, orden: "entregables", celda: (g) => n0(g.num_plantilla_entregables) },
  ];

  const leyendaCarga = [
    { s: "a" as const, label: "Proyectos" }, { s: "b" as const, label: "Actividades" },
    { s: "c" as const, label: "Convenios nuevos" }, { s: "d" as const, label: "Convenios dinamizados" },
  ];

  const sinSemestres = semestresListos && !errorSemestres && semestres.length === 0;
  const vacioTabla = hayFiltros
    ? <Vacio titulo="Ningún grupo coincide" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={limpiar}>Limpiar filtros</button>}>Prueba con otro tipo o con otra búsqueda.</Vacio>
    : <Vacio titulo="No hay grupos en este semestre" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={() => navigate("/admin/sistema?tab=tareas")}>Crear grupos en Administración</button>}>Prueba con otro semestre o crea grupos desde la administración del sistema.</Vacio>;

  return (
    <AnaPagina
      titulo="Indicadores por grupo"
      icono={<IIndicadores width={20} height={20} />}
      subtitulo="Resumen de la matriz por grupo y tipo docente."
      acciones={semestre ? <button type="button" className="b2-btn b2-btn-sm" onClick={() => void cargarGrupos()} disabled={cargando}><IRefrescar width={14} height={14} />Actualizar</button> : undefined}
      inspectorAbierto={!!seleccionado}
      inspectorEtiqueta={String(sel)}
      onCerrarInspector={() => setSel(null)}
      inspector={seleccionado && (
        <div className="b2-insp-c">
          <p className="b2-insp-sup">Grupo matriz · {seleccionado.semestre ?? semestre}</p>
          <h2 className="b2-insp-h">{seleccionado.nombre}</h2>
          <div className="b2-insp-estado"><Tag tono={esNuevo(seleccionado.tipo_docente) ? "primario" : "neutro"}>{etiquetaTipo(seleccionado.tipo_docente)}</Tag></div>
          {seleccionado.descripcion && <p className="b2-insp-p">{seleccionado.descripcion}</p>}
          <h3 className="b2-insp-sub">Composición de la carga</h3>
          <ApiladaH etiqueta={`Composición de ${seleccionado.nombre}`} segmentos={segmentosCarga(seleccionado)} />
          <h3 className="b2-insp-sub">Datos</h3>
          <Dl rows={[
            ["Semestre", seleccionado.semestre ?? "—"],
            ["Tipo docente", etiquetaTipo(seleccionado.tipo_docente)],
            ["Horas totales", `${n0(seleccionado.horas_totales ?? 0)} h`],
            ["Proyectos", n0(seleccionado.num_proyectos)],
            ["Actividades", n0(seleccionado.num_actividades)],
            ["Conv. nuevos", n0(seleccionado.num_convenios_nuevos)],
            ["Conv. dinam.", n0(seleccionado.num_convenios_dinamizados)],
            ["Total indic.", n0(totalInd(seleccionado))],
            ["Docentes", n0(seleccionado.num_docentes)],
            ["Entregables", n0(seleccionado.num_plantilla_entregables)],
          ]} />
          <div className="b2-insp-acc">
            <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/sistema?tab=plantillas&semestre=${encodeURIComponent(seleccionado.semestre ?? semestre)}&grupo=${seleccionado.id}`)}>Ver plantillas y semanas</button>
            <button type="button" className="b2-btn" onClick={() => navigate(`/admin/avance?semestre=${encodeURIComponent(seleccionado.semestre ?? semestre)}&grupo=${seleccionado.id}`)}>Ver avance de sus docentes</button>
            <button type="button" className="b2-btn" onClick={() => navigate("/admin/sistema?tab=tareas")}>Administrar grupo</button>
            <button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
          </div>
        </div>
      )}
    >
      {errorSemestres && <ErrorCarga onReintentar={() => void cargarSemestres()}>No se pudieron cargar los semestres.</ErrorCarga>}
      {sinSemestres && <Vacio titulo="No hay semestres configurados" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={() => navigate("/admin/sistema?tab=semestres")}>Crear un semestre</button>}>Crea un semestre para ver los indicadores de sus grupos.</Vacio>}
      {error && <ErrorCarga onReintentar={() => void cargarGrupos()}>{error}</ErrorCarga>}

      {semestre && (
        <>
          <Barra contador={cargando ? "Cargando…" : visibles.length === grupos.length ? `${grupos.length} grupos` : `${visibles.length} de ${grupos.length} grupos`}>
            <Filtro value={semestre} onChange={setSemestre} etiqueta="Semestre" ancho={120}>
              {semestres.map((s) => <option key={s} value={s}>{s}</option>)}
            </Filtro>
            <Chips<TipoFiltro> value={tipo} onChange={setTipo} etiqueta="Filtrar por tipo docente" items={[
              { id: "todos", label: "Todos", n: conteoTipo.todos }, { id: "ANTIGUO", label: "Antiguo", n: conteoTipo.ANTIGUO }, { id: "NUEVO", label: "Nuevo", n: conteoTipo.NUEVO },
            ]} />
            <Buscar value={buscar} onChange={setBuscar} placeholder="Buscar grupo" etiqueta="Buscar grupo" />
            {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar</button>}
          </Barra>

          <KpiStrip items={[
              { k: `Grupos activos${rotuloFiltro}`, v: n0(tot.grupos), sub: `${tot.antiguos} antiguos · ${tot.nuevos} nuevos` },
              { k: "Docentes asignados", v: n0(tot.docentes) },
              { k: "Entregables en plantillas", v: n0(tot.plantilla) },
              { k: "Indicadores totales", v: n0(tot.indicadores), sub: "proyectos, actividades y convenios", titulo: "Proyectos + actividades + convenios nuevos + convenios dinamizados" },
              { k: "Horas totales", v: n0(tot.horas), sub: "h" },
          ]} />

          <div className="b2-ch-grid b2-ana-ind-grid">
            <Figura
              pregunta="¿Cómo se compone la carga de cada grupo?"
              nota="Proyectos, actividades y convenios configurados por grupo. Haz clic en un grupo para ver su detalle."
              leyenda={leyendaCarga}
              vacio={!cargando && visibles.length === 0 ? "No hay grupos para mostrar con la selección actual." : undefined}
              tabla={{ cabeceras: ["Grupo", "Proyectos", "Actividades", "Conv. nuevos", "Conv. dinam.", "Total"], filas: visibles.map((g) => [g.nombre, g.num_proyectos, g.num_actividades, g.num_convenios_nuevos, g.num_convenios_dinamizados, totalInd(g)]) }}
            >
              <FilasApiladas
                etiqueta="Composición de la carga por grupo"
                onAbrir={(id) => setSel(Number(id))}
                filas={visibles.map((g) => ({ id: g.id, etiqueta: g.nombre, sub: `${etiquetaTipo(g.tipo_docente)} · ${n0(g.horas_totales ?? 0)} h`, segmentos: segmentosCarga(g), extra: "indicadores" }))}
              />
            </Figura>

              <Figura
                pregunta="¿Cuántos entregables y docentes tiene cada grupo?"
                nota="Entregables de plantilla por grupo; el número de docentes asignados va a la derecha."
                leyenda={[{ s: "a", label: "Entregables de plantilla" }]}
                vacio={!cargando && visibles.length === 0 ? "No hay grupos para mostrar con la selección actual." : undefined}
                tabla={{ cabeceras: ["Grupo", "Entregables", "Docentes"], filas: visibles.map((g) => [g.nombre, g.num_plantilla_entregables, g.num_docentes]) }}
              >
                <FilasApiladas
                  etiqueta="Entregables de plantilla por grupo"
                  onAbrir={(id) => setSel(Number(id))}
                  filas={[...visibles].sort((a, b) => b.num_plantilla_entregables - a.num_plantilla_entregables).map((g) => ({
                    id: g.id, etiqueta: g.nombre, sub: `${g.num_docentes} ${g.num_docentes === 1 ? "docente" : "docentes"}`,
                    segmentos: [{ s: "a" as const, label: "Entregables de plantilla", valor: g.num_plantilla_entregables || 0 }],
                  }))}
                />
              </Figura>

              <div className="b2-ana-ind-ancho"><Figura
                pregunta="¿Qué tipo de docente predomina?"
                nota="Grupos y docentes asignados según el tipo del grupo."
                leyenda={[{ s: "a", label: "Antiguo" }, { s: "b", label: "Nuevo" }]}
                vacio={!cargando && visibles.length === 0 ? "No hay grupos para mostrar con la selección actual." : undefined}
                tabla={{ cabeceras: ["", "Antiguo", "Nuevo"], filas: [["Grupos", tot.antiguos, tot.nuevos], ["Docentes", tot.docAntiguos, tot.docentes - tot.docAntiguos]] }}
              >
                <FilasApiladas
                  etiqueta="Grupos y docentes por tipo"
                  filas={[
                    { id: "g", etiqueta: "Grupos", segmentos: [{ s: "a", label: "Antiguo", valor: tot.antiguos }, { s: "b", label: "Nuevo", valor: tot.nuevos }] },
                    { id: "d", etiqueta: "Docentes asignados", segmentos: [{ s: "a", label: "Antiguo", valor: tot.docAntiguos }, { s: "b", label: "Nuevo", valor: tot.docentes - tot.docAntiguos }] },
                  ]}
                />
              </Figura></div>
          </div>

          <section className="b2-ana-sec" aria-label="Detalle por grupo">
            <h2>Detalle por grupo</h2>
            <DataTable<Grupo>
              etiqueta={`Indicadores por grupo, semestre ${semestre}`}
              cols={cols}
              rows={visibles}
              getKey={(g) => g.id}
              selId={sel}
              onSelect={(g) => setSel(g ? g.id : null)}
              cargando={cargando}
              vacio={vacioTabla}
              orden={orden}
              onOrden={alternar}
              filaMovil={(g) => ({
                titulo: g.nombre,
                lineas: [`${n0(g.horas_totales ?? 0)} h · ${n0(totalInd(g))} indicadores`, `${n0(g.num_docentes)} ${g.num_docentes === 1 ? "docente" : "docentes"} · ${n0(g.num_plantilla_entregables)} entregables`],
                lado: <Tag tono={esNuevo(g.tipo_docente) ? "primario" : "neutro"}>{etiquetaTipo(g.tipo_docente)}</Tag>,
              })}
            />
            {!cargando && visibles.length > 0 && (
              <p className="b2-ana-ind-tot" aria-label="Totales">
                <strong>Totales{rotuloFiltro}</strong>
                <span>Horas <b>{n0(tot.horas)}</b></span>
                <span>Proyectos <b>{n0(tot.proyectos)}</b></span>
                <span>Actividades <b>{n0(tot.actividades)}</b></span>
                <span>Conv. nuevos <b>{n0(tot.nuevosConv)}</b></span>
                <span>Conv. dinamizados <b>{n0(tot.dinamizados)}</b></span>
                <span>Indicadores <b>{n0(tot.indicadores)}</b></span>
                <span>Docentes <b>{n0(tot.docentes)}</b></span>
                <span>Entregables <b>{n0(tot.plantilla)}</b></span>
              </p>
            )}
          </section>
        </>
      )}
    </AnaPagina>
  );
}
