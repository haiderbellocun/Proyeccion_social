// Detalle de una iniciativa (docente) — diseño B2. Misma carga (GET /docente/:id/iniciativas/:id) y misma acción
// (PUT /docente/entregables/:id) que la versión anterior, conservada en ProjectDetailTinta.tsx.
import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { esHttp } from "../components/EnlaceEvidencia";
import { Bullet } from "../components/b2/Bullet";
import { IChevL, IMaletin } from "../components/b2/icons";
import { fechaCorta, fechaLarga } from "../components/b2/matriz-util";
import { Estado, type Kind } from "../components/b2/ui";

type Entregable = { id: number; descripcion: string; horas: number | null; completado: boolean; fecha_completado: string | null; url_evidencia: string | null; fecha_real_entrega: string | null };
type Semana = { id: number; numero: number; fecha_inicio: string; fecha_fin: string; entregables: Entregable[] };
type InitiativeDetail = {
  id: number; titulo: string; descripcion: string | null; tipo: string; estado: string; fechaInicio: string | null; fechaFin: string | null;
  horasTotales: number | null; programa: string; coordinador: string; semanasDetalle: Semana[];
};

const TIPO: Record<string, string> = { convenio: "Convenio", actividad: "Actividad", proyecto: "Proyecto", capacitacion: "Capacitación" };

/** Contenedor de página (fuera del componente para no remontar los campos al escribir). */
function Contenedor({ children }: { children: React.ReactNode }) {
  return <div className="b2-vista b2-dash b2-scope"><div className="b2-vista-main" data-scroll><div className="b2-pg">{children}</div></div></div>;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [initiative, setInitiative] = useState<InitiativeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [evidenceInputs, setEvidenceInputs] = useState<Record<number, string>>({});
  const [recarga, setRecarga] = useState(0);
  const [errorCarga, setErrorCarga] = useState(false);

  useEffect(() => {
    const userId = currentUser?.id ?? null;
    if (!userId || !id) { setLoading(false); return; }
    const load = async () => {
      try {
        setLoading(true);
        setErrorCarga(false);
        const res = await fetch(`${API_BASE}/docente/${userId}/iniciativas/${id}`);
        if (!res.ok) { setInitiative(null); return; }
        const data = (await res.json()) as InitiativeDetail;
        setInitiative(data);
        const inputs: Record<number, string> = {};
        (data.semanasDetalle || []).forEach((s) => (s.entregables || []).forEach((e) => { inputs[e.id] = e.url_evidencia || ""; }));
        setEvidenceInputs(inputs);
      } catch (err) {
        console.error(err);
        setErrorCarga(true);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setInitiative(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, currentUser?.id, recarga]);

  const handleSaveEntregable = async (entregable: Entregable, nuevoCompletado: boolean) => {
    try {
      setSaving(entregable.id);
      const res = await fetch(`${API_BASE}/docente/entregables/${entregable.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completado: nuevoCompletado, url_evidencia: evidenceInputs[entregable.id] || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify.fromError(data, "No se pudo guardar el entregable.");
        return;
      }
      const saved = await res.json().catch(() => ({}));
      notify.success("Entregable guardado");
      setInitiative((prev) => !prev ? prev : {
        ...prev,
        semanasDetalle: prev.semanasDetalle.map((s) => ({
          ...s,
          entregables: s.entregables.map((e) => e.id !== entregable.id ? e : {
            ...e,
            completado: nuevoCompletado,
            url_evidencia: evidenceInputs[entregable.id] || null,
            fecha_real_entrega: nuevoCompletado ? saved.fecha_real_entrega ?? e.fecha_real_entrega : null,
            fecha_completado: nuevoCompletado ? saved.fecha_real_entrega ?? e.fecha_completado : null,
          }),
        })),
      });
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión al guardar el entregable.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <Contenedor><div className="b2-card"><div className="b2-skel-w" aria-busy="true">{[70, 90, 80, 86].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div></div></Contenedor>;

  if (!initiative) {
    return (
      <Contenedor>
        <div className="b2-card">
          <div className="b2-imp-body">
            <h1 className="b2-imp-h">{errorCarga ? "No se pudo cargar la iniciativa" : "No se encontró la iniciativa"}</h1>
            <p className="b2-imp-help">{errorCarga ? "Revisa la conexión e inténtalo de nuevo." : "Puede que no esté asignada a tu usuario o que ya no exista."}</p>
            <div className="b2-acc-fila">
              {errorCarga && <button type="button" className="b2-btn" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>}
              <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/docente/proyectos")}>Volver a mis iniciativas</button>
            </div>
          </div>
        </div>
      </Contenedor>
    );
  }

  const all = initiative.semanasDetalle.flatMap((s) => s.entregables);
  const totalEnt = all.length;
  const doneEnt = all.filter((e) => e.completado).length;
  const pct = totalEnt > 0 ? Math.round((doneEnt / totalEnt) * 100) : 0;
  const tipoKey = (initiative.tipo || "").toLowerCase();
  const estadoKey = (initiative.estado || "").toLowerCase();
  const est: { label: string; kind: Kind } =
    estadoKey === "en_ejecucion" || estadoKey === "active" ? { label: "En ejecución", kind: "encurso" }
    : estadoKey === "finalizado" ? { label: "Finalizado", kind: "aprobado" }
    : estadoKey === "delayed" || estadoKey === "retrasado" ? { label: "Retrasado", kind: "vencido" }
    : estadoKey === "suspendido" ? { label: "Suspendido", kind: "observado" }
    : { label: initiative.estado || "Sin estado", kind: "porhacer" };

  return (
    <Contenedor>
      <header className="b2-pg-h">
        <div>
          <button type="button" className="b2-link-btn" style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => navigate("/docente/proyectos")}><IChevL width={13} height={13} /> Volver a mis iniciativas</button>
          <h1 className="b2-pg-t" style={{ marginTop: 4 }}>{initiative.titulo}</h1>
          <p className="b2-pg-s">{initiative.programa} · {initiative.horasTotales ?? "—"} h · {initiative.coordinador}</p>
        </div>
        <div className="b2-pg-acc"><button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/docente/reportar?iniciativa=${initiative.id}`)}>Reportar entregable</button></div>
      </header>

      <dl className="b2-mx-stats" aria-label="Resumen de la iniciativa">
        <div><dt>Tipo</dt><dd style={{ fontSize: 15 }}>{TIPO[tipoKey] ?? (tipoKey ? tipoKey.charAt(0).toUpperCase() + tipoKey.slice(1) : "Iniciativa")}</dd></div>
        <div><dt>Estado</dt><dd style={{ fontSize: 15 }}><Estado kind={est.kind} label={est.label} /></dd></div>
        <div><dt>Inicio</dt><dd style={{ fontSize: 15 }}>{initiative.fechaInicio ? fechaLarga(initiative.fechaInicio) : "—"}</dd></div>
        <div><dt>Fin estimado</dt><dd style={{ fontSize: 15 }}>{initiative.fechaFin ? fechaLarga(initiative.fechaFin) : "—"}</dd></div>
        <div><dt>Horas</dt><dd>{initiative.horasTotales ?? "—"}<small>h</small></dd></div>
        <div><dt>Entregables</dt><dd>{doneEnt}<small>/ {totalEnt} · {pct}%</small></dd></div>
      </dl>
      {initiative.descripcion && <p className="b2-insp-p" style={{ whiteSpace: "pre-line" }}>{initiative.descripcion}</p>}

      <section className="b2-card" aria-label="Progreso">
        <div className="b2-card-h"><h2>Progreso</h2><span className="b2-card-n">{doneEnt} de {totalEnt} entregables completados · {pct}%</span></div>
        <div style={{ padding: "0 14px 14px" }}><Bullet rep={pct} nombre="Progreso de entregables" /></div>
      </section>

      {initiative.semanasDetalle.length === 0 && <section className="b2-card"><p className="b2-vacio"><IMaletin width={16} height={16} style={{ verticalAlign: "-3px" }} /> Esta iniciativa todavía no tiene semanas con entregables.</p></section>}

      {initiative.semanasDetalle.map((semana) => {
        const totalW = semana.entregables.length;
        const doneW = semana.entregables.filter((e) => e.completado).length;
        return (
          <section key={semana.id} className="b2-card" aria-labelledby={`sem-${semana.id}`}>
            <div className="b2-card-h">
              <h2 id={`sem-${semana.id}`}>Semana {semana.numero} <span className="b2-card-n" style={{ marginLeft: 8, fontWeight: 500 }}>{fechaCorta(semana.fecha_inicio)} – {fechaCorta(semana.fecha_fin)}</span></h2>
              <span className="b2-cuenta" style={{ background: totalW > 0 && doneW === totalW ? "var(--c-bar)" : "var(--c-primary)" }}>{doneW}/{totalW}</span>
            </div>
            <ul className="b2-ent-l">
              {semana.entregables.map((e) => (
                <li key={e.id} className="b2-ent-i">
                  <input type="checkbox" id={`ent-${e.id}`} checked={e.completado} onChange={() => void handleSaveEntregable(e, !e.completado)} className="b2-ent-chk" />
                  <div className="b2-ent-c">
                    <div className="b2-ent-top">
                      <label htmlFor={`ent-${e.id}`} className={e.completado ? "b2-ent-t b2-ent-hecho" : "b2-ent-t"}>{e.descripcion}</label>
                      <span className="b2-acc-fila" style={{ flex: "none" }}>{e.horas != null && <span className="b2-pill">{e.horas} h</span>}{saving === e.id && <span className="b2-spin" aria-label="Guardando" role="status" />}</span>
                    </div>
                    <label htmlFor={`url-${e.id}`} className="b2-label" style={{ marginTop: 8 }}>Enlace de evidencia (Drive o Forms)</label>
                    <div className="b2-acc-fila">
                      <input id={`url-${e.id}`} type="url" className="b2-input" style={{ flex: "1 1 240px", width: "auto" }} value={evidenceInputs[e.id] || ""}
                        onChange={(ev) => setEvidenceInputs((prev) => ({ ...prev, [e.id]: ev.target.value }))} placeholder="https://drive.google.com/…"
                        onBlur={() => void handleSaveEntregable(e, e.completado)} />
                      {evidenceInputs[e.id]?.trim() && esHttp(evidenceInputs[e.id]) && (
                        <a href={evidenceInputs[e.id]} target="_blank" rel="noopener noreferrer" className="b2-btn b2-btn-sm" aria-label="Abrir evidencia en una pestaña nueva">Abrir</a>
                      )}
                    </div>
                    <p className="b2-sub" style={{ whiteSpace: "normal", marginTop: 6 }}>{e.completado ? "Completado" : "Pendiente"} · Entrega real: {e.fecha_real_entrega ? fechaLarga(e.fecha_real_entrega) : "—"}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Contenedor>
  );
}
