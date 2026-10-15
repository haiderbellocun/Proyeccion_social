// Mis evidencias (docente) — diseño B2: lista operativa + inspector lateral.
// La versión anterior (Tinta) se conserva en EvidencesTinta.tsx. Cada docente conserva sus archivos en su propio Drive:
// ProySocial solo registra enlaces y trazabilidad (sin Drive API). Endpoints sin cambios:
//   GET /docente/:id/evidencias · PUT /docente/entregables/:id/evidencias · POST /docente/:id/matriz/:plantilla/completar
//   GET /docente/entregables/:id/historial
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { esHttp, AVISO_ACCESO, type EvidenciaEnlace } from "../components/EnlaceEvidencia";
import { IBuscar, IChevR, ICarpeta, IMas, ICerrar } from "../components/b2/icons";
import { EnlacesB2, HistorialB2, VersionesAnteriores } from "../components/b2/evidencia-ui";
import { Dl, enControl, Estado, Inspector, type Kind } from "../components/b2/ui";
import { fechaLarga, useMedia } from "../components/b2/matriz-util";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateTimeBogota } from "../lib/date";
import "@fontsource-variable/nunito-sans";
import "../components/b2/b2.css";
import "../components/b2/b2-matriz.css";
import "../components/b2/b2-matriz-real.css";
import "../components/b2/b2-bandeja.css";

type Situacion = "sin_evidencia" | "borrador" | "observada" | "en_revision" | "aprobada" | "sin_requisito";
type Evidencia = EvidenciaEnlace;

interface ItemEvidencia {
  plantilla_id: number;
  entregable_id: number | null;
  numero: number;
  entregable: string;
  mes: string;
  semana_numero: number;
  iniciativa_id: number | null;
  iniciativa_titulo: string | null;
  iniciativa_tipo: string | null;
  fecha_fin: string | null;
  estado: string;
  situacion: Situacion;
  vencido: boolean;
  entrega_tardia: boolean;
  requiere_evidencia: boolean;
  tipo_evidencia: string;
  descripcion_evidencia: string;
  enlace_referencia: string | null;
  comentario_revision: string | null;
  revisado_en: string | null;
  num_envios: number;
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  problema_acceso: boolean;
  evidencias: Evidencia[];
  versiones_anteriores: Evidencia[];
  puede_editar: boolean;
}

interface Centro {
  semestre: string | null;
  items: ItemEvidencia[];
  iniciativas: { id: number; titulo: string; tipo: string }[];
  resumen: Record<Situacion, number> & { total: number; vencidos_sin_enviar: number };
}

interface Borrador {
  urls: string[];
  justificacion: string;
  sinEvidencia: boolean;
  proyectoId: string;
  aviso: string | null;
  candidatos: { id: number; titulo: string }[] | null;
  guardando: boolean;
}

const SITUACION: Record<Situacion, { etiqueta: string; kind: Kind; ayuda: string }> = {
  sin_evidencia: { etiqueta: "Sin evidencia", kind: "porhacer", ayuda: "Falta adjuntar la evidencia" },
  borrador: { etiqueta: "Borrador", kind: "borrador", ayuda: "Guardado, aún no enviado a revisión" },
  observada: { etiqueta: "Observada", kind: "observado", ayuda: "El revisor pidió correcciones" },
  en_revision: { etiqueta: "En revisión", kind: "revision", ayuda: "Esperando la revisión de coordinación" },
  aprobada: { etiqueta: "Aprobada", kind: "aprobado", ayuda: "Aprobada por coordinación" },
  sin_requisito: { etiqueta: "No requiere evidencia", kind: "porhacer", ayuda: "Este entregable no exige cargue" },
};

type FiltroId = Situacion | "todas" | "vencidas";
const FILTROS: { id: FiltroId; etiqueta: string }[] = [
  { id: "todas", etiqueta: "Todas" },
  { id: "sin_evidencia", etiqueta: "Sin evidencia" },
  { id: "observada", etiqueta: "Observadas" },
  { id: "borrador", etiqueta: "Borradores" },
  { id: "en_revision", etiqueta: "En revisión" },
  { id: "aprobada", etiqueta: "Aprobadas" },
  { id: "vencidas", etiqueta: "Vencidas" },
];

const esVencidaSinEnviar = (i: ItemEvidencia) => i.vencido && i.situacion !== "aprobada" && i.situacion !== "en_revision";

export default function Evidences() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? null;
  const [params] = useSearchParams();
  const destacado = Number(params.get("entregable")) || null;
  const movil = useMedia("(max-width: 720px)");

  const [centro, setCentro] = useState<Centro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroId>("todas");
  const [iniciativa, setIniciativa] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<number | null>(destacado);
  const [cursor, setCursor] = useState(0);
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [retirando, setRetirando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      setCargando(true);
      setError(null);
      const res = await fetch(`${API_BASE}/docente/${userId}/evidencias`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : "No se pudo cargar tus evidencias");
      }
      setCentro((await res.json()) as Centro);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [userId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    if (!centro) return [];
    const texto = busqueda.trim().toLowerCase();
    return centro.items.filter((i) => {
      if (filtro === "vencidas") { if (!esVencidaSinEnviar(i)) return false; }
      else if (filtro !== "todas" && i.situacion !== filtro) return false;
      if (iniciativa !== "all" && String(i.iniciativa_id ?? "") !== iniciativa) return false;
      if (texto && !`${i.entregable} ${i.iniciativa_titulo ?? ""} ${i.mes}`.toLowerCase().includes(texto)) return false;
      return true;
    });
  }, [centro, filtro, iniciativa, busqueda]);

  // Enlace desde la matriz: ?entregable=<plantilla_id> abre el detalle de ese entregable
  const revelado = useRef(false);
  useEffect(() => {
    if (!destacado || !centro || revelado.current) return;
    const idx = centro.items.findIndex((i) => i.plantilla_id === destacado);
    if (idx < 0) return;
    revelado.current = true;
    setFiltro("todas");
    setSel(destacado);
    requestAnimationFrame(() => document.getElementById(`ev-${destacado}`)?.scrollIntoView({ block: "center" }));
  }, [destacado, centro]);

  useEffect(() => { if (sel != null && centro && !centro.items.some((i) => i.plantilla_id === sel)) setSel(null); }, [centro, sel]);

  const conteo = (id: FiltroId) => {
    if (!centro) return 0;
    if (id === "todas") return centro.resumen.total;
    if (id === "vencidas") return centro.resumen.vencidos_sin_enviar;
    return centro.resumen[id];
  };

  const seleccionado = centro?.items.find((i) => i.plantilla_id === sel) ?? null;

  const iniciarBorrador = (item: ItemEvidencia) =>
    setBorradores((b) => b[item.plantilla_id] ? b : {
      ...b,
      [item.plantilla_id]: {
        urls: item.evidencias.length ? item.evidencias.map((e) => e.url) : [""],
        justificacion: item.justificacion_exencion ?? "",
        sinEvidencia: item.evidencia_exenta,
        proyectoId: item.iniciativa_id ? String(item.iniciativa_id) : "",
        aviso: null,
        candidatos: null,
        guardando: false,
      },
    });
  // El borrador del formulario se (re)crea cada vez que el entregable abierto no lo tiene (al abrirlo y tras guardar o enviar)
  useEffect(() => { if (seleccionado && !borradores[seleccionado.plantilla_id]) iniciarBorrador(seleccionado); }); // eslint-disable-line react-hooks/exhaustive-deps

  const editar = (id: number, cambio: Partial<Borrador>) => setBorradores((b) => ({ ...b, [id]: { ...b[id], ...cambio } }));

  const guardar = async (item: ItemEvidencia, enviar: boolean) => {
    const d = borradores[item.plantilla_id];
    if (!d || !userId) return;
    const urls = d.urls.map((u) => u.trim()).filter(Boolean);
    const malo = urls.find((u) => !esHttp(u));
    if (malo) return editar(item.plantilla_id, { aviso: `«${malo}» no es un enlace válido: debe iniciar con http:// o https://` });
    const justificacion = d.sinEvidencia ? d.justificacion.trim() : "";
    if (enviar && item.requiere_evidencia && urls.length === 0 && !justificacion) {
      return editar(item.plantilla_id, { aviso: "Agrega al menos un enlace o marca «No aplica evidencia» y justifícalo (mínimo 10 caracteres)." });
    }
    if (!enviar && urls.length === 0 && !justificacion && !item.entregable_id) {
      return editar(item.plantilla_id, { aviso: "Escribe al menos un enlace para guardar." });
    }
    editar(item.plantilla_id, { aviso: null, guardando: true });
    try {
      const proyecto = d.proyectoId ? { proyecto_id: Number(d.proyectoId) } : {};
      const exencion = d.sinEvidencia ? { justificacion_exencion: justificacion } : {};
      const res =
        !enviar && item.entregable_id
          ? await fetch(`${API_BASE}/docente/entregables/${item.entregable_id}/evidencias`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ urls_evidencia: urls, ...exencion }),
            })
          : await fetch(`${API_BASE}/docente/${userId}/matriz/${item.plantilla_id}/completar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completado: enviar, urls_evidencia: urls, ...exencion, ...proyecto }),
            });
      const data = (await res.json().catch(() => ({}))) as { error?: string; codigo?: string; candidatos?: { id: number; titulo: string }[] };
      if (res.status === 409 && data.codigo === "INICIATIVA_AMBIGUA" && data.candidatos) {
        return editar(item.plantilla_id, { guardando: false, candidatos: data.candidatos, aviso: "Tienes varias iniciativas posibles: elige a cuál corresponde y vuelve a intentar." });
      }
      if (!res.ok) return editar(item.plantilla_id, { guardando: false, aviso: data.error ?? "No se pudo guardar la evidencia." });
      notify.success(enviar ? "Entregable enviado para revisión" : "Evidencia guardada");
      // Primero se recargan los datos y después se descarta el borrador: así el formulario se reconstruye con lo guardado
      await cargar();
      setBorradores((b) => { const n = { ...b }; delete n[item.plantilla_id]; return n; });
    } catch {
      editar(item.plantilla_id, { guardando: false, aviso: "Error de conexión. Tus cambios siguen aquí: intenta de nuevo." });
    }
  };

  const retirar = async (item: ItemEvidencia) => {
    if (!userId) return;
    try {
      setRetirando(item.plantilla_id);
      const res = await fetch(`${API_BASE}/docente/${userId}/matriz/${item.plantilla_id}/completar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completado: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify.error(data.error ?? "No se pudo retirar el envío"); return; }
      notify.success("Envío retirado: ya puedes corregir la evidencia");
      await cargar();
      setBorradores((b) => { const n = { ...b }; delete n[item.plantilla_id]; return n; });
    } catch {
      notify.error("Error de conexión");
    } finally {
      setRetirando(null);
    }
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (enControl(e.target)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.min(visibles.length - 1, cursor + 1); setCursor(n); if (sel != null && visibles[n]) setSel(visibles[n].plantilla_id); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.max(0, cursor - 1); setCursor(n); if (sel != null && visibles[n]) setSel(visibles[n].plantilla_id); }
    else if (e.key === "Enter" && visibles[cursor]) { e.preventDefault(); setSel(visibles[cursor].plantilla_id); }
    else if (e.key === "Escape" && sel != null) setSel(null);
  };

  const celdaEvidencia = (i: ItemEvidencia) => {
    const n = i.evidencias.length;
    if (n > 0) return <span className="b2-ev-n">{n} {n === 1 ? "enlace" : "enlaces"}</span>;
    if (i.evidencia_exenta) return <span className="b2-muted">Exenta</span>;
    if (!i.requiere_evidencia) return <span className="b2-muted">No requiere</span>;
    return <span className="b2-txt-danger" style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>Falta</span>;
  };

  const hayFiltros = filtro !== "todas" || iniciativa !== "all" || busqueda.trim() !== "";
  const limpiar = () => { setFiltro("todas"); setIniciativa("all"); setBusqueda(""); };

  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill" data-insp="sel">
      <div className="b2-vista-main" data-fill>
        <section className="b2-mx" aria-label="Centro de evidencias">
          <div className="b2-mx-top">
            <div>
              <h1 className="b2-mx-t"><ICarpeta width={20} height={20} />Mis evidencias</h1>
              <p className="b2-mx-s">Qué evidencia necesita cada entregable, en qué estado está y qué te pidió el revisor{centro?.semestre ? ` · semestre ${centro.semestre}` : ""}</p>
            </div>
            <div className="b2-mx-acc"><Link to="/docente/matriz" className="b2-btn">Ir a la matriz</Link></div>
          </div>

          {error && (
            <div className="b2-alert" role="alert"><span>{error}</span><button type="button" className="b2-btn b2-btn-sm" onClick={() => void cargar()}>Reintentar</button></div>
          )}

          {centro && (
            <>
              <div className="b2-chips b2-chips-flush" role="group" aria-label="Filtrar por situación">
                {FILTROS.map((x) => (
                  <button key={x.id} type="button" className="b2-chip" data-on={filtro === x.id || undefined} aria-pressed={filtro === x.id} onClick={() => setFiltro(x.id)}>
                    {x.etiqueta}<b>{conteo(x.id)}</b>
                  </button>
                ))}
              </div>
              <div className="b2-tb" role="toolbar" aria-label="Buscar evidencias">
                <label className="b2-tb-search" style={{ width: movil ? "100%" : 300 }}>
                  <IBuscar width={15} height={15} />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar entregable o iniciativa" aria-label="Buscar" />
                </label>
                {centro.iniciativas.length > 1 && (
                  <select className="b2-sel" style={{ width: movil ? "100%" : 260, height: movil ? 40 : 28 }} value={iniciativa} onChange={(e) => setIniciativa(e.target.value)} aria-label="Filtrar por iniciativa">
                    <option value="all">Todas las iniciativas</option>
                    {centro.iniciativas.map((i) => <option key={i.id} value={String(i.id)}>{i.titulo}</option>)}
                  </select>
                )}
                {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiar}>Limpiar</button>}
                <div className="b2-tb-fill" />
                <span className="b2-tb-count" aria-live="polite">{visibles.length === centro.items.length ? `${centro.items.length} entregables` : `${visibles.length} de ${centro.items.length}`}</span>
              </div>

              {movil ? (
                <div className="b2-ml" style={{ padding: 0 }}>
                  <ul className="b2-ml-list">
                    {visibles.length === 0 && <li className="b2-ml-vacio"><p role="status">{centro.items.length === 0 ? "Aún no tienes una matriz asignada. Cuando coordinación la asigne, tus entregables aparecerán aquí." : "Ningún entregable coincide con los filtros."}</p></li>}
                    {visibles.map((i) => {
                      const s = SITUACION[i.situacion];
                      return (
                        <li key={i.plantilla_id}>
                          <button type="button" id={`ev-${i.plantilla_id}`} className="b2-ml-i" data-sel={sel === i.plantilla_id || undefined} onClick={() => setSel(i.plantilla_id)}>
                            <span className="b2-ml-t">
                              <span className="b2-ml-n">{i.entregable}</span>
                              <span className="b2-ml-e"><Estado kind={s.kind} label={s.etiqueta} />{esVencidaSinEnviar(i) && <span className="b2-venc-tag">Vencido</span>}{i.problema_acceso && <span className="b2-venc-tag">Sin acceso</span>}</span>
                              <span className="b2-ml-m">{i.mes} · S{i.semana_numero} · {celdaEvidencia(i)}</span>
                            </span>
                            <span className="b2-ml-f" data-venc={esVencidaSinEnviar(i) || undefined}><span className="b2-ml-fl">Límite</span>{i.fecha_fin ? fechaLarga(i.fecha_fin) : "—"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="b2-ev-wrap" role="table" aria-label="Entregables y evidencias" tabIndex={0} onKeyDown={teclas}>
                  <div className="b2-ev-h" role="row">
                    <span role="columnheader">Entregable</span>
                    <span role="columnheader">Situación</span>
                    <span role="columnheader">Evidencia</span>
                    <span role="columnheader">Límite</span>
                  </div>
                  {visibles.length === 0 && <p className="b2-cola-vacio" role="status">{centro.items.length === 0 ? "Aún no tienes una matriz asignada. Cuando coordinación la asigne, tus entregables aparecerán aquí." : "Ningún entregable coincide con los filtros. Prueba con otra situación, iniciativa o búsqueda."}</p>}
                  <div className="b2-ev-lista">
                    {visibles.map((i, idx) => {
                      const s = SITUACION[i.situacion];
                      return (
                        <div key={i.plantilla_id} className="b2-ev-card" role="row" aria-selected={sel === i.plantilla_id}>
                          <button type="button" id={`ev-${i.plantilla_id}`} className="b2-ev-fila" data-sel={sel === i.plantilla_id || undefined} onClick={() => { setCursor(idx); setSel(i.plantilla_id); }}>
                            <span className="b2-cola-t">
                              <span className="b2-tt" title={i.entregable}>{i.numero}. {i.entregable}</span>
                              <span className="b2-sub">{i.mes} · semana {i.semana_numero}{i.iniciativa_titulo ? ` · ${i.iniciativa_titulo}` : ""}</span>
                            </span>
                            <span><Estado kind={s.kind} label={s.etiqueta} />{(esVencidaSinEnviar(i)) && <span className="b2-venc-tag">Vencido</span>}</span>
                            <span>{celdaEvidencia(i)}</span>
                            <span className="b2-fch" data-venc={esVencidaSinEnviar(i) || undefined} style={esVencidaSinEnviar(i) ? { color: "var(--c-danger)", fontWeight: 700 } : undefined}>{i.fecha_fin ? fechaLarga(i.fecha_fin) : "—"}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          {cargando && !centro && !error && (
            <div className="b2-gantt" aria-busy="true"><div className="b2-skel-w" aria-hidden="true">{[92, 84, 76, 88, 70].map((w, i) => <span key={i} className="b2-skel" style={{ width: `${w}%` }} />)}</div></div>
          )}
        </section>
      </div>

      <Inspector open={!!seleccionado} onClose={() => setSel(null)} label={String(sel)}>
        {seleccionado && (
          <InspectorEvidencia key={seleccionado.plantilla_id} item={seleccionado} d={borradores[seleccionado.plantilla_id]} editar={editar} guardar={guardar} retirar={retirar} retirando={retirando === seleccionado.plantilla_id} onClose={() => setSel(null)} />
        )}
      </Inspector>
    </div>
  );
}

function InspectorEvidencia({ item, d, editar, guardar, retirar, retirando, onClose }: {
  item: ItemEvidencia;
  d: Borrador | undefined;
  editar: (id: number, c: Partial<Borrador>) => void;
  guardar: (i: ItemEvidencia, enviar: boolean) => Promise<void>;
  retirar: (i: ItemEvidencia) => Promise<void>;
  retirando: boolean;
  onClose: () => void;
}) {
  const s = SITUACION[item.situacion];
  const editable = item.puede_editar && item.situacion !== "en_revision" && item.situacion !== "sin_requisito";
  const id = item.plantilla_id;
  return (
    <div className="b2-insp-c">
      <p className="b2-insp-sup">{item.iniciativa_titulo ?? "Sin iniciativa"} · Entregable {item.numero}</p>
      <h2 className="b2-insp-h">{item.entregable}</h2>
      <div className="b2-insp-estado b2-acc-fila" title={s.ayuda}>
        <Estado kind={s.kind} label={s.etiqueta} />
        {esVencidaSinEnviar(item) && <span className="b2-venc-tag">Vencido</span>}
        {item.entrega_tardia && <span className="b2-venc-tag" style={{ background: "var(--c-select)", color: "var(--c-primary)" }}>Entrega tardía</span>}
      </div>

      {item.problema_acceso && (
        <div className="b2-callout b2-callout-d" role="alert"><strong>Coordinación no pudo abrir tu evidencia</strong><p>Revisa los permisos del enlace en tu Drive (compártelo con las cuentas de coordinación) y vuelve a enviar el entregable. No necesitas cambiar el contenido.</p></div>
      )}
      {item.situacion === "observada" && (
        <div className="b2-callout" role="note"><strong>Observación del revisor{item.revisado_en ? ` · ${formatDateTimeBogota(item.revisado_en)}` : ""}</strong><p>{item.comentario_revision || "El revisor solicitó correcciones."}</p></div>
      )}
      {item.evidencia_exenta && item.justificacion_exencion && (
        <div className="b2-callout"><strong>«No aplica evidencia» — tu justificación</strong><p>{item.justificacion_exencion}</p></div>
      )}

      <h3 className="b2-insp-sub">Evidencia requerida</h3>
      <p className="b2-insp-p" style={{ overflowWrap: "anywhere" }}>
        {item.requiere_evidencia
          ? item.descripcion_evidencia || (item.tipo_evidencia === "drive" ? "Enlace de Google Drive" : item.tipo_evidencia === "formulario" ? "Enlace del formulario institucional" : "Enlace a la evidencia")
          : "No se requiere cargue para este entregable."}
      </p>
      {item.enlace_referencia && esHttp(item.enlace_referencia) && (
        <p className="b2-insp-p"><a className="b2-link" href={item.enlace_referencia} target="_blank" rel="noopener noreferrer">Ver referencia</a></p>
      )}

      <h3 className="b2-insp-sub">Evidencias registradas</h3>
      {item.evidencias.length > 0 ? <EnlacesB2 lista={item.evidencias} /> : <p className="b2-muted">{item.requiere_evidencia && !item.evidencia_exenta ? "Aún no has registrado enlaces." : "Sin enlaces registrados."}</p>}
      <VersionesAnteriores lista={item.versiones_anteriores} />

      <Dl rows={[
        ["Mes", `${item.mes} · semana ${item.semana_numero}`],
        ["Límite", <span key="l" className={esVencidaSinEnviar(item) ? "b2-txt-danger" : undefined}>{item.fecha_fin ? fechaLarga(item.fecha_fin) : "—"}</span>],
        ["Envíos", String(item.num_envios)],
      ]} />

      {editable && d && (
        <div className="b2-acc-form">
          <h3>{item.situacion === "observada" ? "Corregir y reenviar" : item.evidencias.length ? "Editar evidencia" : "Adjuntar evidencia"}</h3>
          <fieldset className="b2-ev-urls" disabled={d.guardando || d.sinEvidencia} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="b2-label">Enlaces de la evidencia (puedes agregar varios)</legend>
            {d.urls.map((u, idx) => (
              <div key={idx} className="b2-ev-urlrow">
                <input value={u} onChange={(e) => editar(id, { urls: d.urls.map((x, i) => (i === idx ? e.target.value : x)), aviso: null })}
                  placeholder="https://drive.google.com/…" aria-label={`Enlace ${idx + 1}`} aria-invalid={u.trim() !== "" && !esHttp(u)} className="b2-input" type="url" />
                {d.urls.length > 1 && (
                  <button type="button" className="b2-btn b2-btn-ghost b2-btn-ico b2-ev-del" aria-label={`Quitar enlace ${idx + 1}`} onClick={() => editar(id, { urls: d.urls.filter((_, i) => i !== idx) })}><ICerrar width={16} height={16} /></button>
                )}
              </div>
            ))}
            <button type="button" className="b2-link-btn" onClick={() => editar(id, { urls: [...d.urls, ""] })}><IMas width={14} height={14} style={{ verticalAlign: "-2px" }} /> Agregar otro enlace</button>
          </fieldset>

          {item.requiere_evidencia && (
            <label className="b2-chk" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" checked={d.sinEvidencia} onChange={(e) => editar(id, { sinEvidencia: e.target.checked })} />
              <span>No aplica evidencia para este entregable (requiere justificación; la revisa coordinación)</span>
            </label>
          )}
          {d.sinEvidencia && (
            <textarea value={d.justificacion} onChange={(e) => editar(id, { justificacion: e.target.value })} rows={2} className="b2-input" aria-label="Justificación" placeholder="Explica por qué no aplica evidencia (mínimo 10 caracteres)" />
          )}
          {d.candidatos && (
            <div>
              <label className="b2-label" htmlFor={`ini-${id}`}>Iniciativa a la que corresponde</label>
              <select id={`ini-${id}`} className="b2-sel" value={d.proyectoId} onChange={(e) => editar(id, { proyectoId: e.target.value })}>
                <option value="">Selecciona la iniciativa</option>
                {d.candidatos.map((c) => <option key={c.id} value={String(c.id)}>{c.titulo}</option>)}
              </select>
            </div>
          )}
          <p className="b2-nota-aviso" data-t="warn" role="note"><strong>{AVISO_ACCESO}</strong> Puedes compartirlo solo con las cuentas de coordinación; no es necesario publicarlo para «cualquier persona con el enlace».</p>
          {d.aviso && <p className="b2-nota-aviso" data-t="err" role="alert">{d.aviso}</p>}
          <div className="b2-acc-fila">
            <button type="button" className="b2-btn" disabled={d.guardando} onClick={() => void guardar(item, false)}>{d.guardando ? "Guardando…" : "Guardar borrador"}</button>
            <button type="button" className="b2-btn b2-btn-primary" disabled={d.guardando} onClick={() => void guardar(item, true)}>{item.situacion === "observada" ? "Reenviar a revisión" : "Enviar a revisión"}</button>
          </div>
        </div>
      )}
      {item.situacion === "en_revision" && (
        <div className="b2-acc-form">
          <h3>En revisión</h3>
          <p className="b2-sub" style={{ whiteSpace: "normal" }}>Coordinación está revisando tu envío. Si necesitas corregir algo, retíralo y vuelve a enviarlo.</p>
          <div className="b2-acc-fila"><button type="button" className="b2-btn" disabled={retirando} onClick={() => void retirar(item)}>{retirando ? "Retirando…" : "Retirar envío para corregir"}</button></div>
        </div>
      )}
      {item.situacion === "aprobada" && <div className="b2-decision"><p className="b2-decision-t">Aprobada por coordinación</p><p className="b2-decision-n">Un entregable aprobado no puede modificarse. Si hay un error, solicita su reapertura al administrador.</p></div>}

      {item.entregable_id != null && <HistorialB2 ruta={`/docente/entregables/${item.entregable_id}/historial`} clave={`${item.entregable_id}-${item.estado}-${item.num_envios}`} />}
      <div className="b2-insp-acc">
        <Link to={`/docente/matriz?plantilla=${item.plantilla_id}`} className="b2-btn">Ver en la matriz</Link>
        <button type="button" className="b2-btn b2-btn-ghost" onClick={onClose}>Cerrar detalle</button>
      </div>
      <p className="b2-nota"><IChevR width={10} height={10} /> Tus archivos permanecen en tu Drive; ProySocial solo guarda los enlaces y el historial.</p>
    </div>
  );
}
