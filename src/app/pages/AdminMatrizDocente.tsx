// Matriz de seguimiento de un docente (vista del administrador) — diseño B2.
// La versión anterior (Tinta) se conserva en AdminMatrizDocenteTinta.tsx. Los datos, las excepciones y la reapertura
// siguen usando exactamente los mismos endpoints y reglas; aquí solo cambia cómo se presentan.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { type EstadoEntregable, type IndicadoresSeguimiento, type SemanaActual } from "../data/matrizConstants";
import { EmptyState, InlineAlert, Page, StatusPill } from "../components/ds/primitives";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AppSelect } from "../components/AppSelect";
import { useConfirmationDialog } from "../components/ConfirmationDialog";
import { MatrizB2, type ItemMatrizB2 } from "../components/b2/MatrizB2";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { toDateOnly } from "../lib/date";


export interface EntregableMatrizAdmin {
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
  /** Histórico: true cuando fue enviado (en revisión o aprobado). */
  completado: boolean;
  estado: EstadoEntregable;
  vencido: boolean;
  exigible: boolean;
  entrega_tardia: boolean;
  num_envios: number;
  fecha_primer_envio: string | null;
  evidencias?: string[];
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  fecha_real_entrega: string | null;
  fecha_cargue_evidencia: string | null;
  url_evidencia: string | null;
  enlace_referencia: string | null;
  estado_revision: string | null;
  comentario_revision?: string | null;
  porcentaje_avance: number | null;
  actividad_reportada?: string | null;
  iniciativa_id: number | null;
  iniciativa_titulo: string;
  iniciativa_tipo: string;
  tiene_excepcion: boolean;
  motivo_excepcion?: string | null;
  proyecto_override_id?: number | null;
}

interface IniciativaAsignada {
  id: number;
  titulo: string;
  tipo: string;
}

const EMPTY_EXCEPTION_FORM = {
  entregable_override: "",
  descripcion_evidencia_override: "",
  enlace_referencia_override: "",
  fecha_inicio_override: "",
  fecha_fin_override: "",
  proyecto_id: "",
  motivo: "",
};

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
  stats?: {
    total_plantillas: number;
    completados: number;
    porcentaje_avance: number;
  };
}

interface ReabrirState {
  item: EntregableMatrizAdmin;
  motivo: string;
  destino: "enviado" | "observado";
}

interface MatrizStatsPayload {
  resumen: IndicadoresSeguimiento & {
    total_entregables: number;
    completados: number;
    porcentaje_semestral: number;
    porcentaje_real: number;
    porcentaje_esperado: number;
    cumplimiento_esperado: number;
    exigibles_a_fecha: number;
    brecha: number;
  };
  por_mes: {
    mes: string;
    total: number;
    completados: number;
    reportados: number;
    aprobados: number;
    vencidos: number;
    esperado: number;
    porcentaje_mensual: number;
  }[];
  semana_actual: SemanaActual;
  hoy: string;
}

export default function AdminMatrizDocente() {
  const requestConfirmation = useConfirmationDialog();
  const navigate = useNavigate();
  const { docenteId: docenteIdParam } = useParams<{ docenteId: string }>();
  const docenteId = Number(docenteIdParam);
  const currentUser = useCurrentUser();

  const [entregables, setEntregables] = useState<EntregableMatrizAdmin[]>([]);
  const [matrizStats, setMatrizStats] = useState<MatrizStatsPayload | null>(null);
  const [perfil, setPerfil] = useState<PerfilDocente | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [iniciativas, setIniciativas] = useState<IniciativaAsignada[]>([]);
  const [exceptionItem, setExceptionItem] = useState<EntregableMatrizAdmin | null>(null);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION_FORM);
  const [savingException, setSavingException] = useState(false);
  const [reabrir, setReabrir] = useState<ReabrirState | null>(null);
  const [savingReabrir, setSavingReabrir] = useState(false);

  const isAdmin = currentUser?.rol === "admin";

  useEffect(() => {
    if (!isAdmin || !docenteId || Number.isNaN(docenteId)) {
      setLoading(false);
      setEntregables([]);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [resPerfil, resMatriz, resStats, resIniciativas] = await Promise.all([
          fetch(`${API_BASE}/admin/docentes/${docenteId}/perfil`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz-stats`),
          fetch(`${API_BASE}/admin/docentes/${docenteId}/iniciativas`),
        ]);
        if (!resMatriz.ok) {
          const d = await resMatriz.json().catch(() => ({}));
          throw new Error(typeof d.error === "string" ? d.error : "Error al cargar matriz");
        }
        const data = await resMatriz.json();
        setEntregables(Array.isArray(data.items) ? data.items : []);
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
            stats: p.stats,
          });
        } else {
          setPerfil(null);
        }
        if (resStats.ok) {
          setMatrizStats(await resStats.json());
        } else {
          setMatrizStats(null);
        }
        if (resIniciativas.ok) {
          const initiativeData = await resIniciativas.json();
          setIniciativas(
            Array.isArray(initiativeData.iniciativas)
              ? initiativeData.iniciativas
              : []
          );
        } else {
          setIniciativas([]);
        }
      } catch (e) {
        console.error(e);
        notify.error("No se pudo cargar la matriz del docente. Intente de nuevo más tarde.");
        setLoadError("No se pudo cargar la matriz del docente.");
        setEntregables([]);
        setMatrizStats(null);
        setPerfil(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAdmin, docenteId, recarga]);

  const refreshMatrix = async () => {
    const [matrixResponse, statsResponse] = await Promise.all([
      fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz`),
      fetch(`${API_BASE}/admin/docentes/${docenteId}/matriz-stats`),
    ]);
    if (!matrixResponse.ok) {
      const error = await matrixResponse.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo actualizar la matriz");
    }
    const matrixData = await matrixResponse.json();
    setEntregables(Array.isArray(matrixData.items) ? matrixData.items : []);
    if (statsResponse.ok) setMatrizStats(await statsResponse.json());
  };

  const openExceptionModal = (item: EntregableMatrizAdmin) => {
    setExceptionItem(item);
    setExceptionForm({
      entregable_override: item.entregable,
      descripcion_evidencia_override: item.descripcion_evidencia,
      enlace_referencia_override: item.enlace_referencia || "",
      fecha_inicio_override: toDateOnly(item.fecha_inicio_calculada) || "",
      fecha_fin_override: toDateOnly(item.fecha_fin_calculada) || "",
      proyecto_id: String(item.proyecto_override_id ?? item.iniciativa_id ?? ""),
      motivo: item.motivo_excepcion || "",
    });
  };

  const saveException = async () => {
    if (!exceptionItem) return;
    if (!exceptionForm.motivo.trim()) {
      notify.warning("Indica el motivo del ajuste individual.");
      return;
    }
    if (
      exceptionForm.fecha_inicio_override &&
      exceptionForm.fecha_fin_override &&
      exceptionForm.fecha_fin_override < exceptionForm.fecha_inicio_override
    ) {
      notify.warning("La fecha límite no puede ser anterior a la fecha de inicio.");
      return;
    }
    setSavingException(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/docentes/${docenteId}/plantillas/${exceptionItem.id}/excepcion`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...exceptionForm,
            proyecto_id: exceptionForm.proyecto_id
              ? Number(exceptionForm.proyecto_id)
              : null,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo guardar el ajuste individual.");
        return;
      }
      await refreshMatrix();
      setExceptionItem(null);
      notify.success("Ajuste individual guardado");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al guardar el ajuste.");
    } finally {
      setSavingException(false);
    }
  };

  const removeException = async (item: EntregableMatrizAdmin) => {
    const accepted = await requestConfirmation({
      title: "Restablecer configuración del grupo",
      description:
        "Se eliminarán las fechas, el texto y la iniciativa personalizados para este docente. El grupo general no se modificará.",
      confirmLabel: "Restablecer",
      tone: "warning",
    });
    if (!accepted) return;
    try {
      const response = await fetch(
        `${API_BASE}/admin/docentes/${docenteId}/plantillas/${item.id}/excepcion`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo restablecer el entregable.");
        return;
      }
      await refreshMatrix();
      notify.success("Se restableció la configuración del grupo");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al restablecer.");
    }
  };

  const confirmarReabrir = async () => {
    if (!reabrir || !reabrir.item.entregable_id) return;
    if (reabrir.motivo.trim().length < 10) {
      notify.warning("El motivo de la reapertura debe tener al menos 10 caracteres.");
      return;
    }
    setSavingReabrir(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/reportes-revision/${reabrir.item.entregable_id}/reabrir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: reabrir.motivo.trim(), destino: reabrir.destino }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo reabrir el entregable.");
        return;
      }
      await refreshMatrix();
      setReabrir(null);
      notify.success("Entregable reabierto: volvió a revisión");
    } catch (error) {
      console.error(error);
      notify.error("Error de conexión al reabrir el entregable.");
    } finally {
      setSavingReabrir(false);
    }
  };


  const resumen = matrizStats?.resumen ?? null;
  const semana = matrizStats?.semana_actual ?? null;
  const nombreDocente = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : "Docente";

  if (!isAdmin) {
    return (
      <Page>
        <InlineAlert>No autorizado. Solo los administradores pueden ver esta pantalla.</InlineAlert>
      </Page>
    );
  }

  if (!docenteId || Number.isNaN(docenteId)) {
    return (
      <Page>
        <EmptyState title="Docente no válido" action={<button type="button" className="ds-btn ds-btn-secondary" onClick={() => navigate("/admin")}>Volver al panel</button>}>
          El identificador del docente en la dirección no es correcto.
        </EmptyState>
      </Page>
    );
  }

  /** Acciones administrativas del entregable (las mismas de antes): reapertura de aprobados y ajustes individuales. */
  const renderAcciones = (e: ItemMatrizB2) => {
    const item = entregables.find((x) => x.id === e.id);
    if (!item) return null;
    return (
      <div className="b2-acc-form">
        <h3>Acciones de coordinación</h3>
        <div className="b2-acc-fila">
          {item.estado === "aprobado" && item.entregable_id != null && (
            <button type="button" onClick={() => setReabrir({ item, motivo: "", destino: "enviado" })} className="b2-btn b2-btn-sm">
              <RotateCcw width={14} height={14} aria-hidden /> Reabrir
            </button>
          )}
          <button type="button" onClick={() => openExceptionModal(item)} className="b2-btn b2-btn-sm b2-btn-primary">
            <Pencil width={14} height={14} aria-hidden /> {item.tiene_excepcion ? "Editar excepción" : "Crear excepción"}
          </button>
          {item.tiene_excepcion && (
            <button type="button" onClick={() => void removeException(item)} className="b2-btn b2-btn-sm">
              <RotateCcw width={14} height={14} aria-hidden /> Restablecer grupo
            </button>
          )}
        </div>
        <p className="b2-sub" style={{ whiteSpace: "normal" }}>La aprobación u observación de entregables se hace en la pantalla de revisión.</p>
      </div>
    );
  };

  const perfilUi = perfil && (
    <div className="b2-mx-perfil">
      <b>{nombreDocente}</b>
      <span>{perfil.programa?.nombre ?? "—"}{perfil.regional ? ` · ${perfil.regional}` : ""}</span>
      {perfil.grupo_matriz && <span>{perfil.grupo_matriz.horas_totales} h de Proyección Social · Grupo {perfil.grupo_matriz.nombre}</span>}
      {perfil.tipo_docente && <span>{perfil.tipo_docente}</span>}
      {resumen?.semaforo && <StatusPill tone={resumen.semaforo === "verde" ? "success" : resumen.semaforo === "amarillo" ? "warning" : resumen.semaforo === "rojo" ? "danger" : "neutral"}>Riesgo: {({ verde: "En regla", amarillo: "En riesgo", rojo: "Crítico", sin_exigibles: "Sin vencimientos", sin_datos: "Sin matriz" } as Record<string, string>)[resumen.semaforo]}</StatusPill>}
    </div>
  );

  return (
    <>
      <MatrizB2
        rol="admin"
        titulo={`Matriz · ${nombreDocente}`}
        items={entregables as ItemMatrizB2[]}
        semana={semana}
        hoy={matrizStats?.hoy ?? semana?.hoy ?? null}
        resumen={resumen}
        cargando={loading}
        error={loadError}
        onReintentar={() => setRecarga((n) => n + 1)}
        textoVacio="Este docente no tiene entregables asignados en su matriz."
        acciones={
          <>
            <button type="button" onClick={() => navigate(-1)} className="b2-btn"><ArrowLeft width={16} height={16} aria-hidden /> Volver</button>
            {perfil?.link_drive && <a href={perfil.link_drive} target="_blank" rel="noopener noreferrer" className="b2-btn">Carpeta de Drive</a>}
          </>
        }
        perfil={perfilUi}
        renderAcciones={renderAcciones}
        historialRuta={(i) => (i.entregable_id != null ? `/admin/reportes-revision/${i.entregable_id}/historial` : null)}
      />


      <Dialog open={!!reabrir} onOpenChange={(open) => { if (!open && !savingReabrir) setReabrir(null); }}>
        <DialogContent className="rounded-xl border-line bg-surface sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reabrir entregable aprobado</DialogTitle>
            <DialogDescription>
              {reabrir?.item.entregable}. Es un procedimiento controlado: queda registrado con tu usuario y el motivo.
            </DialogDescription>
          </DialogHeader>
          {reabrir && (
            <div className="space-y-3">
              <div>
                <label className="ds-label" htmlFor="reabrir-destino">Volver a <span className="text-red-700">*</span></label>
                <div id="reabrir-destino">
                  <AppSelect
                    value={reabrir.destino}
                    onValueChange={(value) =>
                      setReabrir((r) => (r ? { ...r, destino: value === "observado" ? "observado" : "enviado" } : r))
                    }
                    className="w-full"
                    options={[
                      { value: "enviado", label: "En revisión (pendiente de nueva decisión)" },
                      { value: "observado", label: "Observado (el docente debe corregir)" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="ds-label" htmlFor="reabrir-motivo">Motivo (mínimo 10 caracteres) <span className="text-red-700">*</span></label>
                <textarea
                  id="reabrir-motivo"
                  rows={3}
                  value={reabrir.motivo}
                  onChange={(event) => setReabrir((r) => (r ? { ...r, motivo: event.target.value } : r))}
                  className="ds-input"
                  placeholder="Ej.: el acta cargada corresponde a otra semana"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setReabrir(null)} disabled={savingReabrir} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void confirmarReabrir()} disabled={savingReabrir} className="ds-btn ds-btn-danger">
              {savingReabrir ? "Reabriendo…" : "Reabrir entregable"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!exceptionItem} onOpenChange={(open) => { if (!open && !savingException) setExceptionItem(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-xl border-line bg-surface sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ajuste individual del entregable</DialogTitle>
            <DialogDescription>
              Solo afectará a {nombreDocente}; la plantilla del grupo permanecerá intacta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-entregable">Entregable</label>
              <textarea
                id="exc-entregable"
                rows={3}
                value={exceptionForm.entregable_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, entregable_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-descripcion">Descripción de la evidencia</label>
              <textarea
                id="exc-descripcion"
                rows={4}
                value={exceptionForm.descripcion_evidencia_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, descripcion_evidencia_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-enlace">Enlace o formulario de referencia</label>
              <input
                id="exc-enlace"
                type="url"
                placeholder="https://"
                value={exceptionForm.enlace_referencia_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, enlace_referencia_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="exc-inicio">Fecha exacta de inicio</label>
              <input
                id="exc-inicio"
                type="date"
                value={exceptionForm.fecha_inicio_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, fecha_inicio_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div>
              <label className="ds-label" htmlFor="exc-fin">Fecha límite exacta</label>
              <input
                id="exc-fin"
                type="date"
                value={exceptionForm.fecha_fin_override}
                onChange={(event) => setExceptionForm((form) => ({ ...form, fecha_fin_override: event.target.value }))}
                className="ds-input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-iniciativa">Iniciativa asociada</label>
              <div id="exc-iniciativa">
                <AppSelect
                  value={exceptionForm.proyecto_id || "__inherit__"}
                  onValueChange={(value) =>
                    setExceptionForm((form) => ({ ...form, proyecto_id: value === "__inherit__" ? "" : value }))
                  }
                  className="w-full"
                  options={[
                    { value: "__inherit__", label: "Inferir desde el entregable" },
                    ...iniciativas.map((initiative) => ({
                      value: String(initiative.id),
                      label: `${initiative.titulo} · ${initiative.tipo}`,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="ds-label" htmlFor="exc-motivo">Motivo del ajuste <span className="text-red-700">*</span></label>
              <textarea
                id="exc-motivo"
                rows={2}
                value={exceptionForm.motivo}
                onChange={(event) => setExceptionForm((form) => ({ ...form, motivo: event.target.value }))}
                placeholder="Ej.: ampliación aprobada por convenio gubernamental"
                className="ds-input"
              />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setExceptionItem(null)} disabled={savingException} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void saveException()} disabled={savingException} className="ds-btn ds-btn-primary">
              {savingException ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
