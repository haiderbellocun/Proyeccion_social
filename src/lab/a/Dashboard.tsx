import { admin, semanaActual, type Docente } from "../shared/model";
import { Marca, Pista, fmt, toast, type EstadoVisual } from "./ui";

const TIPO: Record<string, string> = {
  drive_archivo: "Archivo de Drive", drive_carpeta: "Carpeta de Drive", google_doc: "Documento", google_hoja: "Hoja de cálculo",
  google_presentacion: "Presentación", formulario: "Formulario", otro: "Enlace externo",
};

const ESTADO_DOCENTE: Record<Docente["semaforo"], { e: EstadoVisual; t: string }> = {
  rojo: { e: "vencido", t: "Crítico" },
  amarillo: { e: "observado", t: "En riesgo" },
  verde: { e: "aprobado", t: "En regla" },
  sin_exigibles: { e: "no_iniciado", t: "Sin vencimientos" },
  sin_datos: { e: "no_iniciado", t: "Sin matriz" },
};

const espera = (d: number | null) => (d == null ? "sin fecha de envío" : d === 0 ? "enviado hoy" : d === 1 ? "esperando 1 día" : `esperando ${d} días`);

export function Dashboard() {
  const s = admin.stats;
  const pendientes = admin.revisiones
    .filter((r) => r.estado === "enviado")
    .sort((a, b) => (b.diasEspera ?? -1) - (a.diasEspera ?? -1));
  const mostradas = pendientes.slice(0, 6);
  const docentes = ([...admin.docentes] as Docente[]).sort((a, b) => a.brecha - b.brecha);
  const vencidosTotal = docentes.reduce((n, d) => n + d.vencidos, 0);

  return (
    <>
      <div className="wrap apertura">
        <div>
          <h1>
            Semana {semanaActual}: {s.pendientes_revision} entregables esperan revisión
          </h1>
          <p className="lead">
            De <b>{s.total_docentes} docentes</b>, <b>{s.semaforo.rojo}</b> están en estado crítico y <b>{s.docentes_atrasados}</b> acumulan entregables vencidos
            (<b className="mal">{vencidosTotal}</b> en total). El avance reportado promedio es <b>{fmt(s.avance_reportado_promedio)} %</b>, frente a{" "}
            <b>{fmt(s.avance_esperado_promedio)} %</b> esperado a esta fecha.
          </p>
        </div>

        <div className="libro">
          <dl className="libro" style={{ margin: 0 }}>
            {[
              { n: "Esperado", v: s.avance_esperado_promedio, t: "gen" as const },
              { n: "Reportado", v: s.avance_reportado_promedio, t: "rep" as const },
              { n: "Aprobado", v: s.avance_aprobado_promedio, t: "apr" as const },
            ].map((f) => (
              <div className="libro-f" key={f.n}>
                <dt>{f.n}</dt>
                <Pista valor={f.v} tipo={f.t} esperado={f.n === "Esperado" ? undefined : s.avance_esperado_promedio} etiqueta={`${f.n}: ${fmt(f.v)} %`} />
                <dd>
                  {fmt(f.v)}
                  <small> %</small>
                </dd>
              </div>
            ))}
          </dl>
          <p>La marca vertical indica lo esperado a la fecha. Promedio de los docentes con matriz asignada.</p>
        </div>
      </div>

      <section className="banda seccion" aria-labelledby="h-pend">
        <div className="wrap">
          <h2 className="h2" id="h-pend">
            Por revisar<small>las {mostradas.length} que más llevan esperando, de {pendientes.length}</small>
          </h2>
          <div className="pendientes">
            {mostradas.map((r) => (
              <a key={r.id} className="pend" href="#/panel" onClick={(e) => { e.preventDefault(); toast("La revisión completa está fuera del alcance del prototipo"); }}>
                <h3>{r.titulo}</h3>
                <p>
                  <b>{r.docente}</b> · semana {r.semana} · {espera(r.diasEspera)}
                  {r.reenvio ? " · reenvío" : ""} · {r.evidencias.length === 0 ? "sin enlaces" : r.evidencias.map((e) => TIPO[e.tipo] ?? "Enlace").join(", ")}
                </p>
                <span className="ir">Revisar</span>
              </a>
            ))}
          </div>
          <p className="mas">
            <button type="button" className="btn sec" onClick={() => toast("La bandeja completa está fuera del alcance del prototipo")}>
              Abrir la bandeja de revisión
            </button>
          </p>
        </div>
      </section>

      <section className="seccion" aria-labelledby="h-doc">
        <div className="wrap">
          <h2 className="h2" id="h-doc">
            Docentes<small>del más atrasado al más al día</small>
          </h2>
          <table className="docentes">
            <thead>
              <tr>
                <th scope="col">Docente</th>
                <th scope="col">Avance frente a lo esperado</th>
                <th scope="col" className="n">Brecha</th>
                <th scope="col" className="n">Por revisar</th>
                <th scope="col" className="n">Vencidos</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {docentes.map((d) => {
                const est = ESTADO_DOCENTE[d.semaforo];
                return (
                  <tr key={d.id}>
                    <td className="d-nom">
                      {d.nombre}
                      <small>
                        {d.programa} · {d.regional}
                      </small>
                    </td>
                    <td className="d-av">
                      <Pista valor={d.reportado} esperado={d.esperado} etiqueta={`${d.nombre}: reportado ${fmt(d.reportado)} %, esperado ${fmt(d.esperado)} %`} />
                      <span>
                        Reportado <b>{fmt(d.reportado)} %</b> · aprobado {fmt(d.aprobado)} % · esperado {fmt(d.esperado)} %
                      </span>
                    </td>
                    <td className="n" data-l="Brecha">
                      <span className={`cifra ${d.brecha < 0 ? "mal" : "cero"}`}>{d.brecha > 0 ? `+${d.brecha}` : d.brecha < 0 ? `−${Math.abs(d.brecha)}` : "0"}</span>
                    </td>
                    <td className="n" data-l="Por revisar">
                      <span className={`cifra ${d.porRevisar === 0 ? "cero" : ""}`}>{d.porRevisar}</span>
                    </td>
                    <td className="n" data-l="Vencidos">
                      <span className={`cifra ${d.vencidos > 0 ? "mal" : "cero"}`}>{d.vencidos}</span>
                    </td>
                    <td className="est" data-l="Estado">
                      <Marca e={est.e} texto={est.t} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
