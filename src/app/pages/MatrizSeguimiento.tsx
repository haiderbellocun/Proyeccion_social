// Matriz de seguimiento del docente — diseño B2.
// La versión anterior (Tinta) se conserva en MatrizSeguimientoTinta.tsx. Los endpoints, las validaciones y las reglas de envío,
// reenvío y retiro son exactamente los de antes: el frontend solo presenta los datos que entrega el backend.
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { FileText, Loader2 } from "lucide-react";
import { type EstadoEntregable, type IndicadoresSeguimiento, type SemanaActual } from "../data/matrizConstants";
import { AvisoAcceso, esHttp } from "../components/EnlaceEvidencia";
import { MatrizB2, type ItemMatrizB2, type PorMesRow } from "../components/b2/MatrizB2";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateTimeBogota } from "../lib/date";

export interface EntregableMatriz {
  id: number;
  numero: number;
  categoria: string;
  fase: string;
  mes: string;
  semana_numero: number;
  entregable: string;
  descripcion_evidencia: string;
  horas: number;
  fecha_inicio_calculada: string | null;
  fecha_fin_calculada: string | null;
  entregable_id: number | null;
  /** Histórico: true cuando el entregable fue enviado (en revisión o aprobado). */
  completado: boolean;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  requiere_evidencia: boolean;
  tipo_evidencia: "drive" | "formulario" | "enlace" | "ninguna";
  num_envios: number;
  fecha_primer_envio: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  comentario_revision: string | null;
  fecha_real_entrega: string | null;
  fecha_cargue_evidencia: string | null;
  url_evidencia: string | null;
  enlace_referencia: string | null;
  estado_revision: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
  iniciativa_id: number | null;
  iniciativa_titulo: string;
  iniciativa_tipo: string;
  tiene_excepcion: boolean;
  motivo_excepcion?: string | null;
}

interface IniciativaCandidata {
  id: number;
  titulo: string | null;
  tipo: string | null;
}

interface PerfilDocente {
  nombre: string;
  apellido: string;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  programa: { nombre: string } | null;
  escuela: { nombre: string } | null;
  grupo_matriz: {
    nombre: string;
    horas_totales: number;
    num_proyectos: number;
    num_actividades: number;
    num_convenios_nuevos: number;
    num_convenios_dinamizados: number;
  } | null;
}

export default function MatrizSeguimiento() {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationTemplateId = useMemo(() => {
    const parsed = Number(new URLSearchParams(location.search).get("plantilla"));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const currentUser = useCurrentUser();

  const [entregables, setEntregables] = useState<EntregableMatriz[]>([]);
  const [resumen, setResumen] = useState<IndicadoresSeguimiento | null>(null);
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [porMes, setPorMes] = useState<PorMesRow[] | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [savingPlantilla, setSavingPlantilla] = useState<Record<number, boolean>>({});
  // Formulario de envío por entregable (clave = id de plantilla)
  const [evidenciaInput, setEvidenciaInput] = useState<Record<number, string>>({});
  const [sinEvidencia, setSinEvidencia] = useState<Record<number, boolean>>({});
  const [justificacionInput, setJustificacionInput] = useState<Record<number, string>>({});
  const [candidatos, setCandidatos] = useState<Record<number, IniciativaCandidata[]>>({});
  const [iniciativaElegida, setIniciativaElegida] = useState<Record<number, number>>({});
  const [avisos, setAvisos] = useState<Record<number, string>>({});

  const userId = currentUser?.id ?? null;

  const cargar = useCallback(async () => {
    if (!userId) {
      setEntregables([]);
      setResumen(null);
      setLoadingMatrix(false);
      return;
    }
    try {
      setLoadError(null);
      const [resPerfil, resMatriz, resStats] = await Promise.all([
        fetch(`${API_BASE}/docente/${userId}/perfil`),
        fetch(`${API_BASE}/docente/${userId}/matriz`),
        fetch(`${API_BASE}/docente/${userId}/matriz-stats`),
      ]);
      if (!resMatriz.ok) throw new Error("Error al cargar matriz");
      const data = await resMatriz.json();
      setEntregables(Array.isArray(data.items) ? data.items : []);
      setResumen(data.resumen ?? null);
      setSemana(data.semana_actual ?? null);
      setHoy(typeof data.hoy === "string" ? data.hoy : null);
      if (resStats.ok) {
        const st = await resStats.json();
        setPorMes(Array.isArray(st.por_mes) ? st.por_mes : null);
      } else {
        setPorMes(null);
      }
      if (resPerfil.ok) {
        const p = await resPerfil.json();
        setPerfil({
          nombre: String(p.nombre ?? ""),
          apellido: String(p.apellido ?? ""),
          tipo_docente: p.tipo_docente != null ? String(p.tipo_docente) : null,
          regional: p.regional != null ? String(p.regional) : null,
          link_drive: p.link_drive != null ? String(p.link_drive) : null,
          programa: p.programa ?? null,
          escuela: p.escuela ?? null,
          grupo_matriz: p.grupo_matriz ?? null,
        });
      } else {
        setPerfil(null);
      }
    } catch (err) {
      console.error(err);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      setLoadError("No se pudo cargar tu matriz. Revisa la conexión e intenta de nuevo.");
      setEntregables([]);
      setResumen(null);
      setPerfil(null);
    } finally {
      setLoadingMatrix(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoadingMatrix(true);
    void cargar();
  }, [cargar, recarga]);

  const setAviso = (id: number, msg: string | null) =>
    setAvisos((a) => {
      const next = { ...a };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });

  const postCompletar = async (item: EntregableMatriz, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/docente/${userId}/matriz/${item.id}/completar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      codigo?: string;
      semana_numero?: number;
      candidatos?: IniciativaCandidata[];
    };
    return { res, data };
  };

  // Enviar (o reenviar un observado) para revisión. Las validaciones las aplica el backend.
  // La fecha de entrega nunca se envía: la registra el servidor.
  const handleEnviar = async (item: EntregableMatriz) => {
    if (!userId) return;
    const urls = (evidenciaInput[item.id] ?? "")
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const justificacion = sinEvidencia[item.id] ? (justificacionInput[item.id] ?? "").trim() : "";
    const yaTieneEvidencia = (item.evidencias?.length ?? 0) > 0 || !!item.url_evidencia;
    if (item.requiere_evidencia && urls.length === 0 && !yaTieneEvidencia && !justificacion) {
      setAviso(item.id, "Agrega el enlace de la evidencia o marca «No aplica evidencia» y justifícalo.");
      return;
    }
    setAviso(item.id, null);
    setSavingPlantilla((s) => ({ ...s, [item.id]: true }));
    try {
      const { res, data } = await postCompletar(item, {
        completado: true,
        ...(urls.length ? { urls_evidencia: urls } : {}),
        ...(justificacion ? { justificacion_exencion: justificacion } : {}),
        ...(iniciativaElegida[item.id] ? { proyecto_id: iniciativaElegida[item.id] } : {}),
      });
      if (res.status === 409 && data.codigo === "INICIATIVA_AMBIGUA" && data.candidatos) {
        setCandidatos((c) => ({ ...c, [item.id]: data.candidatos! }));
        setAviso(item.id, "Tienes varias iniciativas para este entregable: elige a cuál corresponde y vuelve a enviar.");
        return;
      }
      if (res.status === 422 && data.codigo === "SIN_INICIATIVA") {
        setAviso(
          item.id,
          `Necesitas una iniciativa asignada en la semana ${data.semana_numero ?? item.semana_numero}. Pide al administrador que te asigne una.`
        );
        return;
      }
      if (!res.ok) {
        setAviso(item.id, typeof data.error === "string" ? data.error : "No se pudo enviar el entregable.");
        return;
      }
      setEvidenciaInput((v) => ({ ...v, [item.id]: "" }));
      notify.success("Entregable enviado para revisión");
      await cargar();
    } catch {
      setAviso(item.id, "Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  const handleRetirar = async (item: EntregableMatriz) => {
    if (!userId) return;
    setAviso(item.id, null);
    setSavingPlantilla((s) => ({ ...s, [item.id]: true }));
    try {
      const { res, data } = await postCompletar(item, { completado: false });
      if (!res.ok) {
        setAviso(item.id, typeof data.error === "string" ? data.error : "No se pudo retirar el envío.");
        return;
      }
      notify.success("Envío retirado");
      await cargar();
    } catch {
      setAviso(item.id, "Error de conexión al guardar.");
    } finally {
      setSavingPlantilla((s) => ({ ...s, [item.id]: false }));
    }
  };

  /** Zona de acción del inspector: evidencia, envío, reenvío y retiro (mismas reglas que antes). */
  const renderAccion = (base: ItemMatrizB2, evidencias: string[]) => {
    const e = entregables.find((x) => x.id === base.id);
    if (!e) return null;
    const guardando = !!savingPlantilla[e.id];
    const bloqueado = e.estado === "aprobado";
    const yaEnviado = e.estado === "enviado";
    const esReenvio = e.estado === "observado";
    return (
      <div className="b2-acc-form">
        <h3>{bloqueado ? "Estado del entregable" : yaEnviado ? "Envío en revisión" : esReenvio ? "Corregir y reenviar" : "Enviar evidencia"}</h3>
        <p className="b2-sub" style={{ whiteSpace: "normal" }}>
          {e.num_envios > 1 ? `${e.num_envios} envíos · ` : ""}
          {e.requiere_evidencia
            ? e.tipo_evidencia === "drive" ? "Requiere enlace de Google Drive" : e.tipo_evidencia === "formulario" ? "Requiere enlace de formulario institucional" : "Requiere enlace de evidencia"
            : "No requiere evidencia"}
        </p>
        {e.entrega_tardia && <p className="b2-nota-aviso" data-t="err">Primer envío posterior a la fecha límite.</p>}

        {bloqueado ? (
          <p className="b2-nota-aviso" data-t="ok">Entregable aprobado: no puede modificarse. Si hay un error, solicita su reapertura al administrador.</p>
        ) : yaEnviado ? (
          <>
            <p className="b2-nota-aviso" data-t="warn">Enviado el {formatDateTimeBogota(e.fecha_cargue_evidencia)}; está pendiente de revisión.</p>
            {avisos[e.id] && <p className="b2-nota-aviso" data-t="err" role="alert">{avisos[e.id]}</p>}
            <div className="b2-acc-fila">
              <button type="button" disabled={guardando} onClick={() => handleRetirar(e)} className="b2-btn b2-btn-sm">Retirar envío</button>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            </div>
          </>
        ) : (
          <>
            {e.requiere_evidencia && (
              <div>
                <label className="b2-label" htmlFor={`evid-${e.id}`}>
                  {esReenvio ? "Enlace(s) de evidencia corregida (opcional si no cambia)" : "Enlace(s) de evidencia"}
                </label>
                <input
                  id={`evid-${e.id}`}
                  type="url"
                  value={evidenciaInput[e.id] ?? ""}
                  onChange={(ev) => setEvidenciaInput((v) => ({ ...v, [e.id]: ev.target.value }))}
                  placeholder="https://drive.google.com/..."
                  disabled={!!sinEvidencia[e.id]}
                  className="b2-input"
                />
                <label className="b2-chk" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={!!sinEvidencia[e.id]} onChange={(ev) => setSinEvidencia((v) => ({ ...v, [e.id]: ev.target.checked }))} />
                  No aplica evidencia (excepción justificada)
                </label>
                {sinEvidencia[e.id] && (
                  <textarea
                    value={justificacionInput[e.id] ?? ""}
                    onChange={(ev) => setJustificacionInput((v) => ({ ...v, [e.id]: ev.target.value }))}
                    rows={2}
                    placeholder="Explica por qué no hay evidencia (mínimo 10 caracteres)"
                    aria-label="Justificación"
                    className="b2-input"
                    style={{ marginTop: 6 }}
                  />
                )}
              </div>
            )}
            {candidatos[e.id] && (
              <div>
                <label className="b2-label" htmlFor={`ini-${e.id}`}>Iniciativa a la que corresponde</label>
                <select id={`ini-${e.id}`} value={iniciativaElegida[e.id] ?? ""} onChange={(ev) => setIniciativaElegida((v) => ({ ...v, [e.id]: Number(ev.target.value) }))} className="b2-sel">
                  <option value="">Selecciona…</option>
                  {candidatos[e.id].map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo ?? `Iniciativa ${c.id}`}</option>
                  ))}
                </select>
              </div>
            )}
            {e.requiere_evidencia && <AvisoAcceso />}
            {avisos[e.id] && <p className="b2-nota-aviso" data-t="err" role="alert">{avisos[e.id]}</p>}
            <div className="b2-acc-fila">
              <button type="button" disabled={guardando} onClick={() => handleEnviar(e)} className="b2-btn b2-btn-primary">
                {esReenvio ? "Reenviar corrección" : "Enviar para revisión"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const query = new URLSearchParams({ plantilla: String(e.id) });
                  if (e.iniciativa_id != null) query.set("iniciativa", String(e.iniciativa_id));
                  navigate(`/docente/reportar?${query.toString()}`);
                }}
                className="b2-btn b2-btn-sm"
              >
                Reportar con descripción y avance
              </button>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            </div>
          </>
        )}
        {evidencias.some((u) => !esHttp(u)) && <p className="b2-sub" style={{ whiteSpace: "normal" }}>Algún enlace registrado no es una dirección web válida.</p>}
        <button type="button" onClick={() => navigate(`/docente/evidencias?entregable=${e.id}`)} className="b2-link-btn">
          Ver estado, historial y versiones en Mis Evidencias
        </button>
      </div>
    );
  };

  const perfilUi = perfil && (
    <div className="b2-mx-perfil">
      <b>{perfil.nombre} {perfil.apellido}</b>
      <span>{perfil.programa?.nombre ?? "—"}{perfil.regional ? ` · ${perfil.regional}` : ""}</span>
      {perfil.grupo_matriz?.horas_totales != null && <span>{perfil.grupo_matriz.horas_totales} h de Proyección Social</span>}
      {perfil.tipo_docente && <span>{perfil.tipo_docente}</span>}
      {perfil.grupo_matriz && [
        { l: "proyectos", v: perfil.grupo_matriz.num_proyectos },
        { l: "actividades", v: perfil.grupo_matriz.num_actividades },
        { l: "conv. nuevos", v: perfil.grupo_matriz.num_convenios_nuevos },
        { l: "conv. dinamizados", v: perfil.grupo_matriz.num_convenios_dinamizados },
      ].filter((i) => i.v > 0).map((i) => <span key={i.l}>{i.v} {i.l}</span>)}
    </div>
  );

  return (
    <MatrizB2
      rol="docente"
      titulo="Matriz de seguimiento"
      items={entregables as ItemMatrizB2[]}
      semana={semana}
      hoy={hoy}
      resumen={resumen}
      porMes={porMes}
      cargando={loadingMatrix}
      error={loadError}
      onReintentar={() => setRecarga((n) => n + 1)}
      textoVacio="Todavía no tienes entregables asignados. Cuando coordinación te asigne una matriz, aparecerá aquí."
      seleccionInicial={notificationTemplateId}
      acciones={
        <>
          {perfil?.link_drive && esHttp(perfil.link_drive) && <a href={perfil.link_drive} target="_blank" rel="noopener noreferrer" className="b2-btn">Mi carpeta de Drive</a>}
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate("/docente/reportar")}><FileText width={16} height={16} aria-hidden /> Reportar entregable</button>
        </>
      }
      perfil={perfilUi}
      renderAcciones={renderAccion}
      historialRuta={(i) => (i.entregable_id != null ? `/docente/entregables/${i.entregable_id}/historial` : null)}
    />
  );
}
