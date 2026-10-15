import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  AdmPagina, Barra, Buscar, Campo, Cargando, DataTable, ErrorCarga, Filtro, FormInspector, Grupo, Paginador, Resumen, Tag, Vacio,
  useConfirmar, type Col,
} from "../../components/b2/admin-ui";
import { Dl } from "../../components/b2/ui";
import { IExterno, IMas } from "../../components/b2/icons";
import { useMedia } from "../../components/b2/matriz-util";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import { formatDateOnly, formatDateTimeBogota, toDateOnly } from "../../lib/date";
import "../../components/b2/b2-admin-plantillas.css";

interface GrupoRow {
  id: number;
  nombre: string;
  tipo_docente?: string;
  semestre?: string;
}

interface PlantillaRow {
  id: number;
  grupo_id: number;
  numero: number;
  categoria: string;
  fase: string;
  mes: string;
  semana_numero: number;
  entregable: string;
  descripcion_evidencia?: string | null;
  enlace_referencia?: string | null;
  horas: number | string;
  dias_inicio_desde_feb?: number | null;
  dias_fin_desde_feb?: number | null;
  fecha_inicio_calculada?: string | null;
  fecha_fin_calculada?: string | null;
  importacion_id?: number | null;
  importacion_lote?: string | null;
  importacion_fecha?: string | null;
  importacion_archivo?: string | null;
  origen_fila?: number | null;
  semana_original?: number | null;
  numero_original?: number | null;
}

interface GrupoResumen {
  grupo: { id: number; nombre: string; semestre: string; numero_semanas: number | null; horas_totales: number | null };
  docentes: { id: number; nombre: string; apellido: string; estado: string }[];
  importaciones: { id: number; lote: string; creado_en: string; archivo_nombre: string | null; usuario: string | null; resumen: Record<string, number | boolean> }[];
  totales: { total: number; importadas: number; horas: number; con_ajustes: number };
}

interface MassPreview {
  semestre: string;
  entregable_clave: string;
  plantillas_afectadas: number;
  grupos_afectados: number;
  coincidencias: { grupo_id: number; grupo_nombre: string }[];
}

const emptyForm = {
  numero: "",
  categoria: "",
  fase: "",
  mes: "",
  semana_numero: "",
  entregable: "",
  descripcion_evidencia: "",
  enlace_referencia: "",
  horas: "",
  fecha_inicio: "",
  fecha_fin: "",
};
type Form = typeof emptyForm;
type Modo = "ver" | "editar" | "crear" | "masiva";

/** Mismas reglas que el envío original: un campo vacío de texto/fecha o un número no numérico detiene el guardado. */
function validar(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.entregable.trim()) e.entregable = "Indica el entregable.";
  if (!f.categoria.trim()) e.categoria = "Indica la categoría.";
  if (!f.fase.trim()) e.fase = "Indica la fase.";
  if (!f.mes.trim()) e.mes = "Indica el mes.";
  if (Number.isNaN(Number(f.numero))) e.numero = "Indica un número válido.";
  if (Number.isNaN(Number(f.semana_numero))) e.semana_numero = "Indica una semana válida.";
  if (Number.isNaN(Number(f.horas))) e.horas = "Indica las horas.";
  if (!f.fecha_inicio) e.fecha_inicio = "Indica la fecha de inicio.";
  if (!f.fecha_fin) e.fecha_fin = "Indica la fecha límite.";
  else if (f.fecha_inicio && f.fecha_fin < f.fecha_inicio) e.fecha_fin = "La fecha límite no puede ser anterior al inicio.";
  return e;
}

const PER_PAGE = 20;

export default function PlantillaManagement({
  cabecera,
  initialSemestre,
  initialGrupoId = null,
}: {
  cabecera: ReactNode;
  initialSemestre?: string;
  initialGrupoId?: number | null;
}) {
  const navigate = useNavigate();
  const movil = useMedia("(max-width: 720px)");
  const { confirmar, dialogo } = useConfirmar();
  const aplicadoInicial = useRef(false);
  const [resumen, setResumen] = useState<GrupoResumen | null>(null);
  const [todosDocentes, setTodosDocentes] = useState<{ id: number; name: string }[]>([]);
  const [docenteAsignar, setDocenteAsignar] = useState("");
  const [asignando, setAsignando] = useState(false);
  const [semestre, setSemestre] = useState("");
  const [semestresList, setSemestresList] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [selectedGrupoId, setSelectedGrupoId] = useState<number | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaRow[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingPlantillas, setLoadingPlantillas] = useState(false);
  const [errorGrupos, setErrorGrupos] = useState(false);
  const [errorPlantillas, setErrorPlantillas] = useState(false);
  const [page, setPage] = useState(1);
  const [modo, setModo] = useState<Modo | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [intentado, setIntentado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [massSource, setMassSource] = useState<PlantillaRow | null>(null);
  const [massDescription, setMassDescription] = useState("");
  const [massLink, setMassLink] = useState("");
  const [massPreview, setMassPreview] = useState<MassPreview | null>(null);
  const [loadingMassPreview, setLoadingMassPreview] = useState(false);
  const [savingMass, setSavingMass] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroSemana, setFiltroSemana] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/admin/semestres`);
        const j = await r.json();
        const s: string[] = j.semestres || [];
        setSemestresList(s);
        if (s.length) setSemestre((prev) => prev || (initialSemestre && s.includes(initialSemestre) ? initialSemestre : s[0]));
      } catch {
        setSemestresList([]);
      }
    })();
  }, []);

  // Solo cuenta la última solicitud: una respuesta tardía de otro semestre no debe pisar la lista actual.
  const solicitudGrupos = useRef(0);
  const loadGrupos = useCallback(async () => {
    const mia = ++solicitudGrupos.current;
    setLoadingGrupos(true);
    setErrorGrupos(false);
    try {
      const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
      const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
      const j = await r.json();
      if (mia !== solicitudGrupos.current) return;
      setGrupos(j.grupos || []);
    } catch {
      if (mia !== solicitudGrupos.current) return;
      notify.error("No se pudieron cargar los grupos");
      setGrupos([]);
      setErrorGrupos(true);
    } finally {
      if (mia === solicitudGrupos.current) setLoadingGrupos(false);
    }
  }, [semestre]);

  useEffect(() => {
    void loadGrupos();
  }, [loadGrupos]);

  // Grupo indicado en la URL (p. ej. al terminar una importación): se selecciona una sola vez.
  useEffect(() => {
    if (aplicadoInicial.current || !initialGrupoId || grupos.length === 0) return;
    if (grupos.some((g) => g.id === initialGrupoId)) {
      aplicadoInicial.current = true;
      setSelectedGrupoId(initialGrupoId);
    }
  }, [grupos, initialGrupoId]);

  const loadResumen = useCallback(async (grupoId: number) => {
    try {
      const r = await fetch(`${API_BASE}/admin/grupos-matriz/${grupoId}/resumen`);
      setResumen(r.ok ? await r.json() : null);
    } catch {
      setResumen(null);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/admin/docentes?limit=500`)
      .then((r) => r.json())
      .then((d) => setTodosDocentes(Array.isArray(d.docentes) ? d.docentes.map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })) : []))
      .catch(() => setTodosDocentes([]));
  }, []);

  const asignarDocente = async () => {
    if (!docenteAsignar || selectedGrupoId == null) return;
    setAsignando(true);
    try {
      const r = await fetch(`${API_BASE}/admin/docentes/${docenteAsignar}/grupo-matriz`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo_matriz_id: selectedGrupoId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo asignar el docente");
      notify.success("Grupo asignado al docente");
      setDocenteAsignar("");
      void loadResumen(selectedGrupoId);
    } catch (e) {
      notify.fromError(e, "No se pudo asignar el docente");
    } finally {
      setAsignando(false);
    }
  };

  const loadPlantillas = useCallback(async (grupoId: number) => {
    setLoadingPlantillas(true);
    setErrorPlantillas(false);
    try {
      const r = await fetch(`${API_BASE}/admin/grupos-matriz/${grupoId}/plantillas`);
      const j = await r.json();
      setPlantillas(j.plantillas || []);
    } catch {
      notify.error("No se pudieron cargar plantillas");
      setPlantillas([]);
      setErrorPlantillas(true);
    } finally {
      setLoadingPlantillas(false);
    }
  }, []);

  useEffect(() => {
    setModo(null);
    setSelId(null);
    setBusca("");
    setFiltroMes("");
    setFiltroSemana("");
    if (selectedGrupoId != null) {
      void loadPlantillas(selectedGrupoId);
      void loadResumen(selectedGrupoId);
      setPage(1);
    } else {
      setPlantillas([]);
      setResumen(null);
    }
  }, [selectedGrupoId, loadPlantillas, loadResumen]);

  const selectedGrupo = grupos.find((g) => g.id === selectedGrupoId);

  const sortedPlantillas = useMemo(
    () =>
      [...plantillas].sort(
        (a, b) =>
          Number(a.semana_numero || 0) - Number(b.semana_numero || 0) ||
          Number(a.numero || 0) - Number(b.numero || 0)
      ),
    [plantillas]
  );

  const availableMonths = useMemo(
    () => [...new Set(sortedPlantillas.map((row) => row.mes.trim()).filter(Boolean))],
    [sortedPlantillas]
  );
  const semanasDisponibles = useMemo(
    () => [...new Set(sortedPlantillas.map((row) => Number(row.semana_numero)))].sort((a, b) => a - b),
    [sortedPlantillas]
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return sortedPlantillas.filter((p) => {
      if (filtroMes && p.mes.trim() !== filtroMes) return false;
      if (filtroSemana && String(p.semana_numero) !== filtroSemana) return false;
      if (!q) return true;
      return [p.entregable, p.categoria, p.fase, p.descripcion_evidencia].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [sortedPlantillas, busca, filtroMes, filtroSemana]);
  const hayFiltros = busca.trim() !== "" || filtroMes !== "" || filtroSemana !== "";
  const limpiarFiltros = () => { setBusca(""); setFiltroMes(""); setFiltroSemana(""); };
  useEffect(() => { setPage(1); }, [busca, filtroMes, filtroSemana]);

  const pageSlice = filtradas.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const seleccionada = plantillas.find((p) => p.id === selId) ?? null;
  const errores = intentado ? validar(form) : {};
  const listaErrores = Object.values(errores) as string[];

  const cerrar = () => { setModo(null); setSelId(null); setMassSource(null); };
  const abrirVer = (p: PlantillaRow | null) => {
    if (!p) return cerrar();
    setSelId(p.id);
    setModo("ver");
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, mes: availableMonths[0] || "" });
    setIntentado(false);
    setSelId(null);
    setModo("crear");
  };

  const openEdit = (p: PlantillaRow) => {
    setEditingId(p.id);
    setForm({
      numero: String(p.numero ?? ""),
      categoria: p.categoria ?? "",
      fase: p.fase ?? "",
      mes: String(p.mes || "").trim(),
      semana_numero: String(p.semana_numero ?? ""),
      entregable: p.entregable ?? "",
      descripcion_evidencia: p.descripcion_evidencia ?? "",
      enlace_referencia: p.enlace_referencia ?? "",
      horas: String(p.horas ?? ""),
      fecha_inicio: toDateOnly(p.fecha_inicio_calculada) ?? "",
      fecha_fin: toDateOnly(p.fecha_fin_calculada) ?? "",
    });
    setIntentado(false);
    setSelId(p.id);
    setModo("editar");
  };

  const saveModal = async () => {
    if (selectedGrupoId == null) return;
    setIntentado(true);
    const body: Record<string, unknown> = {
      numero: Number(form.numero),
      categoria: form.categoria.trim(),
      fase: form.fase.trim(),
      mes: form.mes.trim(),
      semana_numero: Number(form.semana_numero),
      entregable: form.entregable.trim(),
      descripcion_evidencia: form.descripcion_evidencia.trim() || "",
      enlace_referencia: form.enlace_referencia.trim() || null,
      horas: Number(form.horas),
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
    };
    if (Object.keys(validar(form)).length > 0) {
      notify.warning("Completa los campos requeridos.");
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editingId != null) {
        res = await fetch(`${API_BASE}/admin/plantillas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_BASE}/admin/grupos-matriz/${selectedGrupoId}/plantillas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof j.error === "string" ? j.error : "Error al guardar");
        return;
      }
      const eraEdicion = editingId != null;
      await loadPlantillas(selectedGrupoId);
      setModo(eraEdicion ? "ver" : null);
      if (!eraEdicion) setSelId(null);
      notify.success(eraEdicion ? "Cambios guardados" : "Plantilla creada");
    } catch {
      notify.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (p: PlantillaRow) => {
    const accepted = await confirmar({
      titulo: "Eliminar plantilla",
      descripcion: `¿Deseas eliminar la plantilla #${p.numero}: ${p.entregable.slice(0, 70)}${p.entregable.length > 70 ? "…" : ""}?`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    try {
      let res = await fetch(`${API_BASE}/admin/plantillas/${p.id}`, { method: "DELETE" });
      let j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.requiere_confirmacion) {
        const forceAccepted = await confirmar({
          titulo: "Conservar reportes y eliminar plantilla",
          descripcion:
            `Esta plantilla tiene ${Number(j.usos || 0)} reporte(s) vinculado(s). ` +
            "Los reportes se conservarán, pero dejarán de estar ligados a la plantilla.",
          etiqueta: "Eliminar plantilla",
          tono: "aviso",
        });
        if (!forceAccepted) return;
        res = await fetch(`${API_BASE}/admin/plantillas/${p.id}?forzar=true`, {
          method: "DELETE",
        });
        j = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        notify.error(j.error || "No se pudo eliminar");
        return;
      }
      if (selectedGrupoId != null) await loadPlantillas(selectedGrupoId);
      if (selId === p.id) cerrar();
      notify.success("Plantilla eliminada");
    } catch {
      notify.error("Error de conexión");
    }
  };

  const openMassUpdate = async (source: PlantillaRow) => {
    setMassSource(source);
    setMassDescription(source.descripcion_evidencia || "");
    setMassLink(source.enlace_referencia || "");
    setMassPreview(null);
    setLoadingMassPreview(true);
    setSelId(source.id);
    setModo("masiva");
    try {
      const response = await fetch(
        `${API_BASE}/admin/plantillas/actualizacion-masiva/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantilla_id: source.id }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo calcular el alcance del cambio.");
        setMassSource(null);
        setModo("ver");
        return;
      }
      setMassPreview(data as MassPreview);
    } catch {
      notify.error("Error de conexión al calcular el alcance.");
      setMassSource(null);
      setModo("ver");
    } finally {
      setLoadingMassPreview(false);
    }
  };

  const applyMassUpdate = async () => {
    if (!massSource || !massPreview) return;
    const accepted = await confirmar({
      titulo: "Actualizar evidencia compartida",
      descripcion: `Se actualizarán ${massPreview.plantillas_afectadas} plantilla(s) de ${massPreview.grupos_afectados} grupo(s) del semestre ${massPreview.semestre}.`,
      etiqueta: "Aplicar a todos",
      tono: "aviso",
    });
    if (!accepted) return;
    setSavingMass(true);
    try {
      const response = await fetch(
        `${API_BASE}/admin/plantillas/actualizacion-masiva`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plantilla_id: massSource.id,
            descripcion_evidencia: massDescription,
            enlace_referencia: massLink || null,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.fromError(data, "No se pudo aplicar la actualización masiva.");
        return;
      }
      if (selectedGrupoId != null) await loadPlantillas(selectedGrupoId);
      setMassSource(null);
      setModo("ver");
      notify.success(
        `Evidencia actualizada en ${Number(data.grupos_afectados || 0)} grupo(s)`
      );
    } catch {
      notify.error("Error de conexión al actualizar las plantillas.");
    } finally {
      setSavingMass(false);
    }
  };

  const setF = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /* ───────── tabla ───────── */
  const cols: Col<PlantillaRow>[] = [
    {
      id: "numero", titulo: "N°", ancho: "78px",
      celda: (p) => (
        <>
          <span className="b2-tt">{p.numero}</span>
          {p.importacion_id != null && <span className="b2-sub" title={`Importado de «${p.importacion_archivo ?? "Excel"}» · lote ${(p.importacion_lote ?? "").slice(0, 8)}`}>Excel f.{p.origen_fila ?? "?"}</span>}
          {p.numero_original != null && <span className="b2-sub" title="Número original del Excel (renumerado por decisión administrativa)">Excel: {p.numero_original}</span>}
        </>
      ),
    },
    {
      id: "semana", titulo: "Semana", ancho: "76px",
      celda: (p) => (
        <>
          <span className="b2-tt">{p.semana_numero}</span>
          {p.semana_original != null && <span className="b2-sub" title="Semana escrita en el Excel; se usó la semana de la fecha por decisión administrativa">Excel: {p.semana_original}</span>}
        </>
      ),
    },
    { id: "periodo", titulo: "Periodo", ancho: "172px", prioridad: 2, celda: (p) => <><span className="b2-tt">{formatDateOnly(p.fecha_inicio_calculada)}</span><span className="b2-sub">hasta {formatDateOnly(p.fecha_fin_calculada)}</span></> },
    { id: "mes", titulo: "Mes", ancho: "90px", prioridad: 3, celda: (p) => <span className="b2-tt">{p.mes}</span> },
    { id: "fase", titulo: "Fase", ancho: "minmax(110px, 150px)", prioridad: 3, celda: (p) => <span className="b2-tt" title={p.fase}>{p.fase}</span> },
    { id: "entregable", titulo: "Entregable", ancho: "minmax(220px, 1.4fr)", celda: (p) => <><span className="b2-tt" title={p.entregable}>{p.entregable}</span><span className="b2-sub">{p.categoria}</span></> },
    { id: "instrucciones", titulo: "Instrucciones", ancho: "minmax(150px, 1fr)", prioridad: 2, celda: (p) => <span className="b2-tt" title={p.descripcion_evidencia ?? ""}>{p.descripcion_evidencia || "—"}</span> },
    { id: "horas", titulo: "Horas", ancho: "58px", num: true, celda: (p) => p.horas },
  ];

  /* ───────── inspector ───────── */
  const camposForm = (
    <>
      <Grupo titulo="Cuándo">
        <Campo etiqueta={`Semana (1–${resumen?.grupo.numero_semanas ?? 16})`} obligatorio error={errores.semana_numero}>
          {(p) => <input {...p} className="b2-input" type="number" min={1} max={resumen?.grupo.numero_semanas ?? 16} value={form.semana_numero} onChange={(e) => setF("semana_numero", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Mes" obligatorio error={errores.mes}>
          {(p) => (
            <>
              <input {...p} className="b2-input" list="plantilla-month-options" value={form.mes} onChange={(e) => setF("mes", e.target.value)} />
              <datalist id="plantilla-month-options">{availableMonths.map((m) => <option key={m} value={m} />)}</datalist>
            </>
          )}
        </Campo>
        <Campo etiqueta="Fecha exacta de inicio" obligatorio error={errores.fecha_inicio}>
          {(p) => <input {...p} className="b2-input" type="date" value={form.fecha_inicio} onChange={(e) => setF("fecha_inicio", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Fecha límite exacta" obligatorio error={errores.fecha_fin}>
          {(p) => <input {...p} className="b2-input" type="date" value={form.fecha_fin} onChange={(e) => setF("fecha_fin", e.target.value)} />}
        </Campo>
        <p className="b2-campo-a" style={{ gridColumn: "1 / -1", margin: 0 }}>El sistema conserva la distancia respecto al inicio del semestre para poder clonar la plantilla a otros periodos.</p>
      </Grupo>
      <Grupo titulo="Qué se entrega">
        <Campo etiqueta="Número" obligatorio error={errores.numero}>
          {(p) => <input {...p} className="b2-input" type="number" value={form.numero} onChange={(e) => setF("numero", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Horas" obligatorio error={errores.horas}>
          {(p) => <input {...p} className="b2-input" type="number" step="0.5" value={form.horas} onChange={(e) => setF("horas", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Fase" obligatorio error={errores.fase} ancho="completo">
          {(p) => <input {...p} className="b2-input" value={form.fase} onChange={(e) => setF("fase", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Categoría" obligatorio error={errores.categoria} ancho="completo">
          {(p) => <input {...p} className="b2-input" value={form.categoria} onChange={(e) => setF("categoria", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Entregable" obligatorio error={errores.entregable} ancho="completo">
          {(p) => <textarea {...p} className="b2-input" rows={3} value={form.entregable} onChange={(e) => setF("entregable", e.target.value)} />}
        </Campo>
      </Grupo>
      <Grupo titulo="Evidencia">
        <Campo etiqueta="Instrucciones de evidencia (opcional)" ancho="completo">
          {(p) => <textarea {...p} className="b2-input" rows={3} value={form.descripcion_evidencia} onChange={(e) => setF("descripcion_evidencia", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Enlace o formulario de referencia (HTTPS)" ancho="completo">
          {(p) => <input {...p} className="b2-input" type="url" placeholder="https://" value={form.enlace_referencia} onChange={(e) => setF("enlace_referencia", e.target.value)} />}
        </Campo>
      </Grupo>
    </>
  );

  let inspector: ReactNode = null;
  if ((modo === "editar" || modo === "crear") && (modo === "crear" || seleccionada)) {
    inspector = (
      <FormInspector
        sup={selectedGrupo?.nombre}
        titulo={modo === "editar" ? "Editar plantilla" : "Nueva plantilla"}
        onCerrar={() => (modo === "editar" ? setModo("ver") : cerrar())}
        onGuardar={() => void saveModal()}
        guardando={saving}
        etiquetaGuardar="Guardar plantilla"
        errores={listaErrores}
      >
        {camposForm}
      </FormInspector>
    );
  } else if (modo === "masiva" && massSource) {
    inspector = (
      <FormInspector
        sup="Actualización masiva de evidencia"
        titulo={massSource.entregable}
        onCerrar={() => { if (!savingMass) { setMassSource(null); setModo("ver"); } }}
        onGuardar={() => void applyMassUpdate()}
        guardando={savingMass}
        deshabilitarGuardar={loadingMassPreview || !massPreview}
        etiquetaGuardar="Actualizar grupos"
      >
        {loadingMassPreview ? (
          <Cargando etiqueta="Calculando grupos afectados…" />
        ) : massPreview ? (
          <div className="b2-callout">
            <strong>{massPreview.plantillas_afectadas} plantilla(s) en {massPreview.grupos_afectados} grupo(s)</strong>
            <p>Alcance restringido al semestre {massPreview.semestre}. Solo se incluyen entregables cuyo nombre coincide exactamente.</p>
            <div className="b2-adm-pl-tags" style={{ marginTop: 8, marginBottom: 0 }}>
              {[...new Map(massPreview.coincidencias.map((row) => [row.grupo_id, row])).values()].map((row) => <Tag key={row.grupo_id} tono="primario">{row.grupo_nombre}</Tag>)}
            </div>
          </div>
        ) : null}
        <Campo etiqueta="Instrucción o evidencia documental compartida" ancho="completo">
          {(p) => <textarea {...p} className="b2-input" rows={5} value={massDescription} onChange={(e) => setMassDescription(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Enlace o formulario compartido" ancho="completo">
          {(p) => <input {...p} className="b2-input" type="url" placeholder="https://" value={massLink} onChange={(e) => setMassLink(e.target.value)} />}
        </Campo>
      </FormInspector>
    );
  } else if (modo === "ver" && seleccionada) {
    const p = seleccionada;
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">Plantilla #{p.numero} · Semana {p.semana_numero}</p>
        <h2 className="b2-insp-h">{p.entregable}</h2>
        {(p.importacion_id != null || p.numero_original != null || p.semana_original != null) && (
          <div className="b2-adm-pl-tags">
            {p.importacion_id != null && <Tag tono="primario">Importada de Excel</Tag>}
            {(p.numero_original != null || p.semana_original != null) && <Tag tono="aviso">Con ajuste administrativo</Tag>}
          </div>
        )}
        <Dl rows={[
          ["Categoría", p.categoria || "—"],
          ["Fase", p.fase || "—"],
          ["Mes", p.mes || "—"],
          ["Semana", p.semana_original != null ? `${p.semana_numero} (Excel: ${p.semana_original})` : String(p.semana_numero)],
          ["Número", p.numero_original != null ? `${p.numero} (Excel: ${p.numero_original})` : String(p.numero)],
          ["Horas", String(p.horas)],
          ["Inicio", formatDateOnly(p.fecha_inicio_calculada)],
          ["Fecha límite", formatDateOnly(p.fecha_fin_calculada)],
          ["Origen", p.importacion_id != null ? `«${p.importacion_archivo ?? "Excel"}» · fila ${p.origen_fila ?? "?"} · lote ${(p.importacion_lote ?? "").slice(0, 8)}${p.importacion_fecha ? ` · ${formatDateTimeBogota(p.importacion_fecha)}` : ""}` : "Creada en el sistema"],
        ]} />
        <h3 className="b2-insp-sub">Instrucciones de evidencia</h3>
        <p className="b2-insp-p b2-adm-pl-texto">{p.descripcion_evidencia || "Sin instrucciones registradas."}</p>
        <h3 className="b2-insp-sub">Enlace de referencia</h3>
        {p.enlace_referencia ? (
          <a className="b2-adm-pl-link" href={p.enlace_referencia} target="_blank" rel="noopener noreferrer">{p.enlace_referencia} <IExterno width={13} height={13} style={{ verticalAlign: "-2px" }} /></a>
        ) : <p className="b2-insp-p">Sin enlace.</p>}
        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEdit(p)}>Editar</button>
          <button type="button" className="b2-btn" onClick={() => void openMassUpdate(p)} title="Actualizar evidencia en todos los grupos coincidentes">Actualizar evidencia compartida</button>
          <button type="button" className="b2-btn b2-btn-ghost b2-link-peligro" onClick={() => void deleteRow(p)}>Eliminar</button>
        </div>
      </div>
    );
  }

  /* ───────── contenido ───────── */
  const detallesAbiertos = false;
  const contenido = selectedGrupoId == null ? (
    <div className="b2-adm-pl-vacio" role="status">
      <Vacio titulo="Elige un grupo">Selecciona un grupo en la lista para revisar y editar sus plantillas de entregables.</Vacio>
    </div>
  ) : (
    <div className="b2-adm-pl-col">
      {resumen && (
        <>
          <Resumen items={[
            { k: "Entregables", v: resumen.totales.total },
            { k: "Horas programadas", v: resumen.totales.horas },
            { k: "Semestre", v: <>{resumen.grupo.semestre}{resumen.grupo.numero_semanas ? <small>{resumen.grupo.numero_semanas} semanas</small> : null}</> },
            { k: "Docentes", v: resumen.docentes.length },
            { k: "Importadas", v: resumen.totales.importadas },
            { k: "Con ajuste", v: resumen.totales.con_ajustes, alerta: resumen.totales.con_ajustes > 0 },
          ]} />
          <details className="b2-adm-pl-det" key={movil ? "m" : "d"} open={detallesAbiertos}>
            <summary>Origen, docentes y asignación{resumen.docentes.length > 0 ? ` · ${resumen.docentes.length} docente(s)` : ""}</summary>
            <div className="b2-adm-pl-det-c">
              <div>
                <h3>Origen (importaciones de Excel)</h3>
                {resumen.importaciones.length > 0 ? (
                  resumen.importaciones.map((i) => (
                    <p key={i.id}>
                      {formatDateTimeBogota(i.creado_en)} · {i.archivo_nombre ?? "archivo"} · lote <code>{i.lote.slice(0, 8)}</code> · {i.usuario ?? "—"} · {Number(i.resumen?.creadas ?? 0)} creadas, {Number(i.resumen?.actualizadas ?? 0)} actualizadas
                    </p>
                  ))
                ) : (
                  <p>Este grupo no proviene de una importación de Excel.</p>
                )}
              </div>
              <div>
                <h3>Docentes con este grupo ({resumen.docentes.length})</h3>
                {resumen.docentes.length === 0 && <p>Ningún docente tiene asignado este grupo todavía.</p>}
                <div className="b2-adm-pl-docs">
                  {resumen.docentes.map((d) => (
                    <button key={d.id} type="button" className="b2-btn b2-btn-sm" onClick={() => navigate(`/admin/docentes/${d.id}/matriz`)} title="Abrir la matriz individual del docente">
                      {d.nombre} {d.apellido} · ver su matriz
                    </button>
                  ))}
                </div>
              </div>
              <div className="b2-adm-pl-asig">
                <label>
                  <span className="b2-label">Asignar este grupo a otro docente</span>
                  <select className="b2-sel" value={docenteAsignar} onChange={(e) => setDocenteAsignar(e.target.value)}>
                    <option value="">Selecciona el docente</option>
                    {todosDocentes.filter((d) => !resumen.docentes.some((x) => x.id === d.id)).map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                  </select>
                </label>
                <button type="button" className="b2-btn" disabled={!docenteAsignar || asignando} onClick={() => void asignarDocente()}>{asignando ? "Asignando…" : "Asignar"}</button>
              </div>
            </div>
          </details>
        </>
      )}
      <Barra contador={filtradas.length === sortedPlantillas.length ? `${sortedPlantillas.length} plantillas` : `${filtradas.length} de ${sortedPlantillas.length}`}>
        <Buscar value={busca} onChange={setBusca} placeholder="Buscar entregable, categoría o fase" etiqueta="Buscar plantillas" />
        <Filtro value={filtroMes} onChange={setFiltroMes} etiqueta="Filtrar por mes" ancho={150}>
          <option value="">Todos los meses</option>
          {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
        </Filtro>
        <Filtro value={filtroSemana} onChange={setFiltroSemana} etiqueta="Filtrar por semana" ancho={150}>
          <option value="">Todas las semanas</option>
          {semanasDisponibles.map((s) => <option key={s} value={String(s)}>Semana {s}</option>)}
        </Filtro>
        {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={limpiarFiltros}>Limpiar</button>}
      </Barra>
      {errorPlantillas && <ErrorCarga onReintentar={() => void loadPlantillas(selectedGrupoId)}>No se pudieron cargar las plantillas del grupo.</ErrorCarga>}
      <DataTable
        etiqueta="Entregables de la plantilla"
        cols={cols}
        rows={pageSlice}
        getKey={(p) => p.id}
        selId={selId}
        onSelect={abrirVer}
        cargando={loadingPlantillas}
        ocupado={saving || savingMass}
        vacio={
          hayFiltros && sortedPlantillas.length > 0 ? (
            <Vacio titulo="Ninguna plantilla coincide" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={limpiarFiltros}>Limpiar filtros</button>}>Prueba con otro término o quita algún filtro.</Vacio>
          ) : (
            <Vacio titulo="Este grupo no tiene plantillas" accion={<button type="button" className="b2-btn b2-btn-primary b2-btn-sm" onClick={openCreate}>Nueva plantilla</button>}>Crea la primera o importa la matriz desde Excel.</Vacio>
          )
        }
        filaMovil={(p) => ({
          titulo: <>#{p.numero} · {p.entregable}</>,
          lineas: [`Semana ${p.semana_numero} · ${p.mes}`, `${formatDateOnly(p.fecha_inicio_calculada)} → ${formatDateOnly(p.fecha_fin_calculada)}`],
          lado: <><span>{p.horas} h</span>{p.importacion_id != null && <Tag tono="primario">Excel</Tag>}</>,
        })}
        acciones={(p) => [
          { label: "Ver detalle", onSelect: () => abrirVer(p) },
          { label: "Editar", onSelect: () => openEdit(p) },
          { label: "Actualizar evidencia compartida", onSelect: () => void openMassUpdate(p) },
          "sep",
          { label: "Eliminar", danger: true, onSelect: () => void deleteRow(p) },
        ]}
      />
      {filtradas.length > PER_PAGE && <Paginador pagina={page} total={filtradas.length} limite={PER_PAGE} onPagina={setPage} etiqueta="plantillas" />}
    </div>
  );

  return (
    <>
      <AdmPagina
        tab="plantillas"
        cabecera={cabecera}
        titulo={`Plantillas · ${selectedGrupo?.nombre ?? "selecciona un grupo"}`}
        subtitulo="Entregables de la matriz por grupo. Los cambios respetan los reportes históricos."
        acciones={
          <button type="button" className="b2-btn b2-btn-primary" disabled={selectedGrupoId == null} onClick={openCreate}><IMas width={16} height={16} />Nueva plantilla</button>
        }
        inspector={inspector}
        inspectorAbierto={inspector != null}
        inspectorEtiqueta={`${modo}-${selId ?? "n"}`}
        onCerrarInspector={() => { if (!saving && !savingMass) cerrar(); }}
        ancho
      >
        <div className="b2-adm-split">
          <aside className="b2-adm-lat" aria-label="Grupos matriz">
            <div className="b2-adm-lat-h">
              <h3>Grupos</h3>
              <label>
                <span className="b2-label">Semestre</span>
                <select className="b2-sel" value={semestre || "__all__"} onChange={(e) => setSemestre(e.target.value === "__all__" ? "" : e.target.value)}>
                  <option value="__all__">Todos</option>
                  {semestresList.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            {loadingGrupos && <Cargando etiqueta="Cargando grupos…" />}
            {!loadingGrupos && errorGrupos && <div style={{ padding: 10 }}><ErrorCarga onReintentar={() => void loadGrupos()}>No se pudieron cargar los grupos.</ErrorCarga></div>}
            {!loadingGrupos && !errorGrupos && grupos.length === 0 && (
              <div style={{ padding: 12 }}><Vacio titulo="Sin grupos">No hay grupos en este semestre. Créalos en «Tareas semanales».</Vacio></div>
            )}
            {!loadingGrupos && grupos.length > 0 && (
              <ul className="b2-adm-lat-l">
                {grupos.map((g) => {
                  const activo = selectedGrupoId === g.id;
                  return (
                    <li key={g.id}>
                      <button type="button" className="b2-adm-lat-i" aria-current={activo ? "true" : undefined} onClick={() => setSelectedGrupoId(g.id)}>
                        <span>
                          <span className="b2-tt">{g.nombre}</span>
                          <span className="b2-sub">{g.semestre}{activo ? ` · ${sortedPlantillas.length} plantillas` : ""}</span>
                        </span>
                        <Tag tono={g.tipo_docente === "NUEVO" ? "primario" : "neutro"}>{g.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"}</Tag>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
          {contenido}
        </div>
      </AdmPagina>
      {dialogo}
    </>
  );
}
