import { useEffect, useMemo, useRef, useState } from "react";
import { conteos, docenteActual, items, rango, resumen, semanaActual, totalSemanas, type Item } from "../shared/model";
import { IBuscar, IExterno, Marca, Pista, fmt, toast, type EstadoVisual } from "./ui";

type Filtro = "todos" | "porhacer" | "revision" | "observados" | "aprobados" | "vencidos";
const FILTROS: { id: Filtro; label: string; n: (c: ReturnType<typeof conteos>) => number }[] = [
  { id: "todos", label: "Todos", n: (c) => c.todos },
  { id: "porhacer", label: "Por hacer", n: (c) => c.porHacer },
  { id: "revision", label: "En revisión", n: (c) => c.revision },
  { id: "observados", label: "Observados", n: (c) => c.observados },
  { id: "aprobados", label: "Aprobados", n: (c) => c.aprobados },
  { id: "vencidos", label: "Vencidos", n: (c) => c.vencidos },
];

const CATEGORIA: Record<string, string> = {
  capacitacion: "Capacitación y asistencia técnica", convenio_nuevo: "Convenio nuevo", convenio_dinamizado: "Convenio dinamizado",
  proyecto: "Proyecto", actividad: "Actividad", presupuesto: "Presupuesto",
};
const nombreCategoria = (c: string) => CATEGORIA[c] ?? c.replaceAll("_", " ");

const estadoVisual = (i: Item, forzado?: Item["estado"]): EstadoVisual => {
  const e = forzado ?? i.estado;
  return e === "aprobado" ? "aprobado" : e === "enviado" ? "enviado" : e === "observado" ? "observado" : e === "borrador" ? "borrador" : "no_iniciado";
};

function Fila({ it, estado, abierto, onAbrir, onCambiar }: { it: Item; estado: Item["estado"]; abierto: boolean; onAbrir: () => void; onCambiar: (e: Item["estado"]) => void }) {
  const vencido = it.vencido && estado !== "aprobado" && estado !== "enviado";
  const id = `det-${it.id}`;
  return (
    <li className="fila">
      <button type="button" className="fila-b" aria-expanded={abierto} aria-controls={id} onClick={onAbrir}>
        <span className="f-n">{it.numero ? `#${it.numero}` : ""}</span>
        <span className="f-t">{it.titulo}</span>
        <span className="f-d">
          <Marca e={estadoVisual(it, estado)} />
          {vencido && <Marca e="vencido" />}
          <small>{it.horas} h</small>
        </span>
        <span className="f-m">
          {nombreCategoria(it.categoria)} · {it.iniciativa}
        </span>
        {estado === "observado" && it.comentario && <span className="f-nota">«{it.comentario}»</span>}
      </button>
      <div className="detalle" id={id} data-abierto={abierto} role="region" aria-label={`Detalle: ${it.titulo}`} {...(abierto ? {} : ({ inert: "" } as Record<string, string>))}>
        <div>
          <div className="det-in">
            <div>
              <p>{it.descripcion || "Este entregable no tiene instrucciones adicionales."}</p>
              {it.evidencias.length > 0 && (
                <ul className="det-ev">
                  {it.evidencias.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer">
                        Abrir evidencia <IExterno />
                      </a>
                      <small>{new URL(u).hostname.replace("www.", "")}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <dl>
                <dt>Programado</dt>
                <dd>{rango(it.inicio, it.fin)}</dd>
                <dt>Semana</dt>
                <dd>{it.semana} de {totalSemanas}</dd>
                <dt>Envíos</dt>
                <dd>{it.envios === 0 ? "Ninguno" : it.envios}</dd>
                <dt>Indicador</dt>
                <dd>{it.fase}</dd>
              </dl>
              <div className="det-acc">
                {(estado === "no_iniciado" || estado === "borrador") && (
                  <>
                    <button type="button" className="btn sm" onClick={() => { const a = estado; onCambiar("enviado"); toast("Enviado a revisión", () => onCambiar(a)); }}>
                      Enviar a revisión
                    </button>
                    <button type="button" className="btn txt sm" onClick={() => toast("Borrador guardado (simulado)")}>Guardar borrador</button>
                  </>
                )}
                {estado === "observado" && (
                  <button type="button" className="btn sm" onClick={() => { onCambiar("enviado"); toast("Corrección reenviada", () => onCambiar("observado")); }}>
                    Corregir y reenviar
                  </button>
                )}
                {estado === "enviado" && (
                  <button type="button" className="btn sec sm" onClick={() => { onCambiar("no_iniciado"); toast("Envío retirado", () => onCambiar("enviado")); }}>
                    Retirar envío
                  </button>
                )}
                {estado === "aprobado" && <span className="marca" data-e="aprobado">Aprobado: no se modifica</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function Matriz({ semanaPedida, onAtendida }: { semanaPedida: number | null; onAtendida: () => void }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [plegado, setPlegado] = useState<Record<number, boolean>>({});
  const [estados, setEstados] = useState<Record<number, Item["estado"]>>({});
  const buscador = useRef<HTMLInputElement>(null);

  const estadoDe = (i: Item) => estados[i.id] ?? i.estado;
  const c = useMemo(conteos, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => {
      const e = estados[i.id] ?? i.estado;
      if (filtro === "porhacer" && !(e === "no_iniciado" || e === "borrador")) return false;
      if (filtro === "revision" && e !== "enviado") return false;
      if (filtro === "observados" && e !== "observado") return false;
      if (filtro === "aprobados" && e !== "aprobado") return false;
      if (filtro === "vencidos" && !(i.vencido && e !== "aprobado")) return false;
      if (t && !`${i.titulo} ${i.iniciativa} ${i.numero}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [filtro, q, estados]);

  const semanas = useMemo(() => {
    const m = new Map<number, Item[]>();
    for (const i of visibles) m.set(i.semana, [...(m.get(i.semana) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, lista]) => ({ n, lista: lista.sort((a, b) => a.numero - b.numero) }));
  }, [visibles]);

  // Por defecto: se pliegan las semanas ya aprobadas y las lejanas; con filtro o búsqueda se muestra todo.
  const filtrando = filtro !== "todos" || q.trim() !== "";
  const estaAbierta = (n: number, lista: Item[]) => {
    if (plegado[n] !== undefined) return plegado[n];
    if (filtrando) return true;
    const todoAprobado = lista.every((i) => estadoDe(i) === "aprobado");
    return !todoAprobado && n <= semanaActual + 1;
  };
  const alternarSemana = (n: number, lista: Item[]) => setPlegado((p) => ({ ...p, [n]: !estaAbierta(n, lista) }));

  useEffect(() => {
    if (semanaPedida == null) return;
    setPlegado((p) => ({ ...p, [semanaPedida]: true }));
    window.setTimeout(() => {
      document.getElementById(`semana-${semanaPedida}`)?.scrollIntoView({ block: "start" });
      onAtendida();
    }, 30);
  }, [semanaPedida, onAtendida]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); buscador.current?.focus(); }
    };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, []);

  const brecha = Math.abs(resumen.brecha_entregables);

  return (
    <>
      <div className="wrap m-cab">
        <div>
          <h1>
            Matriz de seguimiento
            <small>
              {docenteActual.nombre} · {docenteActual.programa} · {docenteActual.regional} · {docenteActual.tipo} · {docenteActual.horas} h de Proyección Social
            </small>
          </h1>
          <p className="lead">
            Llevas <b>{fmt(resumen.pct_reportado)} %</b> reportado frente a <b>{fmt(resumen.pct_esperado)} %</b> esperado: <b className="mal">{brecha} entregables</b> por detrás del
            cronograma. {resumen.observados > 0 && <>Hay <b>{resumen.observados} observados</b> esperando tu corrección.</>}
          </p>
        </div>
        <dl className="libro" style={{ margin: 0 }}>
          {[
            { n: "Esperado", v: resumen.pct_esperado, t: "gen" as const },
            { n: "Reportado", v: resumen.pct_reportado, t: "rep" as const },
            { n: "Aprobado", v: resumen.pct_aprobado, t: "apr" as const },
          ].map((f) => (
            <div className="libro-f" key={f.n}>
              <dt>{f.n}</dt>
              <Pista valor={f.v} tipo={f.t} esperado={f.n === "Esperado" ? undefined : resumen.pct_esperado} etiqueta={`${f.n}: ${fmt(f.v)} %`} />
              <dd>{fmt(f.v)}<small> %</small></dd>
            </div>
          ))}
          <p style={{ margin: 0, font: "400 13px/1.45 var(--sans)", color: "var(--tinta-3)" }}>
            {resumen.horas_aprobadas} h aprobadas · {resumen.horas_reportadas} h reportadas · {resumen.horas_programadas} h programadas.
          </p>
        </dl>
      </div>

      <div className="wrap filtros">
        <div className="tabs" role="tablist" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" role="tab" className="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.label}
              <sup>{f.n(c)}</sup>
            </button>
          ))}
        </div>
        <label className="buscar">
          <span className="sr-only">Buscar en la matriz</span>
          <IBuscar />
          <input ref={buscador} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar entregable o iniciativa  ( / )" />
        </label>
      </div>

      {semanas.length === 0 ? (
        <div className="wrap vacio">
          <h3>Ningún entregable coincide</h3>
          <p>Prueba con otro estado o con otras palabras de búsqueda.</p>
          <button type="button" className="btn sec" onClick={() => { setFiltro("todos"); setQ(""); }}>Limpiar filtros</button>
        </div>
      ) : (
        semanas.map(({ n, lista }, idx) => {
          const abierta = estaAbierta(n, lista);
          const aprobados = lista.filter((i) => estadoDe(i) === "aprobado").length;
          const fechas = rango(lista.reduce((a, i) => (i.inicio < a ? i.inicio : a), lista[0].inicio), lista.reduce((a, i) => (i.fin > a ? i.fin : a), lista[0].fin));
          return (
            <div key={n} id={`semana-${n}`} className="cap-band" data-alt={idx % 2 === 1}>
              <section className="wrap capitulo" aria-labelledby={`h-s${n}`}>
                {!abierta ? (
                  <button type="button" className="cap-plegado" aria-expanded={false} onClick={() => alternarSemana(n, lista)}>
                    <span className="cap-num" id={`h-s${n}`}>{n}</span>
                    <span>
                      Semana {n} · {fechas} · {aprobados} de {lista.length} aprobados
                    </span>
                    <em>Ver entregables</em>
                  </button>
                ) : (
                  <>
                    <div className="cap-lado">
                      <button type="button" className="cap-num" id={`h-s${n}`} data-ahora={n === semanaActual} aria-expanded onClick={() => alternarSemana(n, lista)} title="Plegar la semana" style={{ display: "block", textAlign: "left" }}>
                        {n}
                      </button>
                      <div className="cap-fechas">Semana {n} · {fechas}</div>
                      <div className="cap-estado">{aprobados} de {lista.length} aprobados</div>
                      {n === semanaActual && <span className="cap-ahora">Esta semana</span>}
                    </div>
                    <ul className="filas" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {lista.map((it) => (
                        <Fila
                          key={it.id}
                          it={it}
                          estado={estadoDe(it)}
                          abierto={abiertas.has(it.id)}
                          onAbrir={() => setAbiertas((s) => { const x = new Set(s); x.has(it.id) ? x.delete(it.id) : x.add(it.id); return x; })}
                          onCambiar={(e) => setEstados((s) => ({ ...s, [it.id]: e }))}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>
          );
        })
      )}
    </>
  );
}
