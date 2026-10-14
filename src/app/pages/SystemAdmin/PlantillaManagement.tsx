import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FileSpreadsheet, FileText, Plus, Pencil, Trash2, Link2, Users, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, PageLoading, Panel, StatusPill } from "../../components/ds/primitives";
import { AppSelect } from "../../components/AppSelect";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import { formatDateOnly, formatDateTimeBogota, toDateOnly } from "../../lib/date";

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

export default function PlantillaManagement({
  initialSemestre,
  initialGrupoId = null,
}: {
  initialSemestre?: string;
  initialGrupoId?: number | null;
} = {}) {
  const navigate = useNavigate();
  const requestConfirmation = useConfirmationDialog();
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
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [massSource, setMassSource] = useState<PlantillaRow | null>(null);
  const [massDescription, setMassDescription] = useState("");
  const [massLink, setMassLink] = useState("");
  const [massPreview, setMassPreview] = useState<MassPreview | null>(null);
  const [loadingMassPreview, setLoadingMassPreview] = useState(false);
  const [savingMass, setSavingMass] = useState(false);

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

  const loadGrupos = useCallback(async () => {
    setLoadingGrupos(true);
    try {
      const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : "";
      const r = await fetch(`${API_BASE}/admin/grupos-matriz${q}`);
      const j = await r.json();
      setGrupos(j.grupos || []);
    } catch {
      notify.error("No se pudieron cargar los grupos");
      setGrupos([]);
    } finally {
      setLoadingGrupos(false);
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
    try {
      const r = await fetch(`${API_BASE}/admin/grupos-matriz/${grupoId}/plantillas`);
      const j = await r.json();
      setPlantillas(j.plantillas || []);
    } catch {
      notify.error("No se pudieron cargar plantillas");
      setPlantillas([]);
    } finally {
      setLoadingPlantillas(false);
    }
  }, []);

  useEffect(() => {
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

  const totalPages = Math.max(1, Math.ceil(sortedPlantillas.length / perPage));
  const pageSlice = sortedPlantillas.slice((page - 1) * perPage, page * perPage);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, mes: availableMonths[0] || "" });
    setModalOpen(true);
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
    setModalOpen(true);
  };

  const saveModal = async () => {
    if (selectedGrupoId == null) return;
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
    if (
      !form.entregable.trim() ||
      !form.categoria.trim() ||
      !form.fase.trim() ||
      !form.mes.trim() ||
      Number.isNaN(body.numero as number) ||
      Number.isNaN(body.semana_numero as number) ||
      Number.isNaN(body.horas as number) ||
      !form.fecha_inicio ||
      !form.fecha_fin ||
      form.fecha_fin < form.fecha_inicio
    ) {
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
      setModalOpen(false);
      await loadPlantillas(selectedGrupoId);
      notify.success(editingId != null ? "Cambios guardados" : "Plantilla creada");
    } catch {
      notify.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (p: PlantillaRow) => {
    const accepted = await requestConfirmation({
      title: "Eliminar plantilla",
      description: `¿Deseas eliminar la plantilla #${p.numero}: ${p.entregable.slice(0, 70)}${
        p.entregable.length > 70 ? "…" : ""
      }?`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      let res = await fetch(`${API_BASE}/admin/plantillas/${p.id}`, { method: "DELETE" });
      let j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.requiere_confirmacion) {
        const forceAccepted = await requestConfirmation({
          title: "Conservar reportes y eliminar plantilla",
          description:
            `Esta plantilla tiene ${Number(j.usos || 0)} reporte(s) vinculado(s). ` +
            "Los reportes se conservarán, pero dejarán de estar ligados a la plantilla.",
          confirmLabel: "Eliminar plantilla",
          tone: "warning",
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
        return;
      }
      setMassPreview(data as MassPreview);
    } catch {
      notify.error("Error de conexión al calcular el alcance.");
      setMassSource(null);
    } finally {
      setLoadingMassPreview(false);
    }
  };

  const applyMassUpdate = async () => {
    if (!massSource || !massPreview) return;
    const accepted = await requestConfirmation({
      title: "Actualizar evidencia compartida",
      description: `Se actualizarán ${massPreview.plantillas_afectadas} plantilla(s) de ${massPreview.grupos_afectados} grupo(s) del semestre ${massPreview.semestre}.`,
      confirmLabel: "Aplicar a todos",
      tone: "warning",
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
      notify.success(
        `Evidencia actualizada en ${Number(data.grupos_afectados || 0)} grupo(s)`
      );
    } catch {
      notify.error("Error de conexión al actualizar las plantillas.");
    } finally {
      setSavingMass(false);
    }
  };

  const field = (id: string, label: string, control: ReactNode, className = "") => (
    <div className={className}>
      <label htmlFor={id} className="ds-label">{label}</label>
      {control}
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-start">
      <Panel
        title="Grupos"
        description="Selecciona un grupo para ver sus plantillas"
        bodyClassName="space-y-3 p-3"
        className="lg:sticky lg:top-4"
      >
        <div>
          <span className="ds-label">Semestre</span>
          <AppSelect
            value={semestre}
            onValueChange={(v) => setSemestre(v)}
            emptyValue="__all__"
            className="w-full"
            options={[{ value: "__all__", label: "Todos" }, ...semestresList.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        {loadingGrupos && <PageLoading label="Cargando grupos…" />}
        {!loadingGrupos && grupos.length === 0 && (
          <EmptyState icon={Users} title="Sin grupos">
            No hay grupos en este semestre. Créalos en «Tareas semanales».
          </EmptyState>
        )}
        {!loadingGrupos && grupos.length > 0 && (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto" aria-label="Grupos matriz">
            {grupos.map((g) => {
              const activo = selectedGrupoId === g.id;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGrupoId(g.id)}
                    aria-current={activo ? "true" : undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      activo ? "border-brand bg-blue-50" : "border-transparent hover:border-line hover:bg-surface-2"
                    }`}
                  >
                    <span className="block truncate text-[0.8125rem] text-text" style={{ fontWeight: 600 }}>{g.nombre}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                      <span className="tabular-nums">{g.semestre}</span>
                      <StatusPill tone={g.tipo_docente === "NUEVO" ? "brand" : "neutral"}>{g.tipo_docente === "NUEVO" ? "Nuevo" : "Antiguo"}</StatusPill>
                      {activo && <span className="tabular-nums">{sortedPlantillas.length} plantillas</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base">Plantillas · {selectedGrupo?.nombre ?? "selecciona un grupo"}</h2>
          <button type="button" disabled={selectedGrupoId == null} onClick={openCreate} className="ds-btn ds-btn-primary">
            <Plus className="h-4 w-4" aria-hidden /> Nueva plantilla
          </button>
        </div>

        {!selectedGrupoId && (
          <Panel bodyClassName="">
            <EmptyState icon={FileText} title="Elige un grupo">
              Selecciona un grupo en la lista para revisar y editar sus plantillas de entregables.
            </EmptyState>
          </Panel>
        )}
        {selectedGrupoId != null && (
          <>
            {resumen && (
              <Panel title="Resumen del grupo" bodyClassName="space-y-3 p-4">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-muted">
                  <span><strong className="text-text">{resumen.totales.total}</strong> entregables · <strong className="text-text">{resumen.totales.horas}</strong> h programadas</span>
                  <span>Semestre <strong className="text-text">{resumen.grupo.semestre}</strong>{resumen.grupo.numero_semanas ? ` · ${resumen.grupo.numero_semanas} semanas` : ""}</span>
                  {resumen.totales.importadas > 0 && <span>{resumen.totales.importadas} provienen de importación</span>}
                  {resumen.totales.con_ajustes > 0 && <StatusPill tone="warning">{resumen.totales.con_ajustes} con ajuste administrativo (semana o número)</StatusPill>}
                </div>
                {resumen.importaciones.length > 0 ? (
                  <div className="space-y-0.5 text-xs text-text-muted">
                    <p className="flex items-center gap-1 text-text" style={{ fontWeight: 600 }}><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Origen (importaciones de Excel)</p>
                    {resumen.importaciones.map((i) => (
                      <p key={i.id}>
                        {formatDateTimeBogota(i.creado_en)} · {i.archivo_nombre ?? "archivo"} · lote <code>{i.lote.slice(0, 8)}</code> · {i.usuario ?? "—"} · {Number(i.resumen?.creadas ?? 0)} creadas, {Number(i.resumen?.actualizadas ?? 0)} actualizadas
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-subtle">Este grupo no proviene de una importación de Excel.</p>
                )}
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="flex items-center gap-1.5 text-sm text-text" style={{ fontWeight: 600 }}><UsersRound className="h-4 w-4" aria-hidden /> Docentes con este grupo ({resumen.docentes.length})</p>
                  {resumen.docentes.length === 0 && <p className="text-xs text-text-subtle">Ningún docente tiene asignado este grupo todavía.</p>}
                  <div className="flex flex-wrap gap-2">
                    {resumen.docentes.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/admin/docentes/${d.id}/matriz`)}
                        className="ds-btn ds-btn-secondary ds-btn-sm"
                        title="Abrir la matriz individual del docente"
                      >
                        {d.nombre} {d.apellido} · ver su matriz
                      </button>
                    ))}
                  </div>
                  <div className="flex max-w-xl flex-wrap items-end gap-2">
                    <label className="block min-w-[14rem] flex-1">
                      <span className="ds-label">Asignar este grupo a otro docente</span>
                      <AppSelect
                        className="w-full"
                        value={docenteAsignar}
                        onValueChange={setDocenteAsignar}
                        options={todosDocentes.filter((d) => !resumen.docentes.some((x) => x.id === d.id)).map((d) => ({ value: String(d.id), label: d.name }))}
                        placeholder="Selecciona el docente"
                      />
                    </label>
                    <button type="button" disabled={!docenteAsignar || asignando} onClick={() => void asignarDocente()} className="ds-btn ds-btn-secondary">
                      {asignando ? "Asignando…" : "Asignar"}
                    </button>
                  </div>
                </div>
              </Panel>
            )}

            <Panel bodyClassName="" title="Entregables de la plantilla" description={`${sortedPlantillas.length} en total`}>
              {loadingPlantillas && <PageLoading label="Cargando plantillas…" />}
              {!loadingPlantillas && sortedPlantillas.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="Este grupo no tiene plantillas"
                  action={
                    <button type="button" onClick={openCreate} className="ds-btn ds-btn-primary ds-btn-sm">
                      <Plus className="h-4 w-4" aria-hidden /> Nueva plantilla
                    </button>
                  }
                >
                  Crea la primera o importa la matriz desde Excel.
                </EmptyState>
              )}
              {!loadingPlantillas && sortedPlantillas.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="ds-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Semana</th>
                          <th className="hidden md:table-cell">Periodo</th>
                          <th className="hidden min-[1600px]:table-cell">Mes</th>
                          <th className="hidden min-[1600px]:table-cell">Fase</th>
                          <th>Entregable</th>
                          <th className="hidden lg:table-cell">Instrucciones</th>
                          <th className="text-right">Horas</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageSlice.map((p) => {
                          const short = p.entregable.length > 60 ? `${p.entregable.slice(0, 60)}…` : p.entregable;
                          return (
                            <tr key={p.id}>
                              <td className="align-top tabular-nums">
                                {p.numero}
                                {p.numero_original != null && <span className="block text-xs text-amber-700" title="Número original del Excel (renumerado por decisión administrativa)">Excel: {p.numero_original}</span>}
                                {p.importacion_id != null && (
                                  <span className="block whitespace-nowrap text-xs text-emerald-700" title={`Importado de «${p.importacion_archivo ?? "Excel"}» · lote ${(p.importacion_lote ?? "").slice(0, 8)}`}>
                                    Excel f.{p.origen_fila ?? "?"}
                                  </span>
                                )}
                              </td>
                              <td className="align-top tabular-nums">
                                {p.semana_numero}
                                {p.semana_original != null && <span className="block text-xs text-amber-700" title="Semana escrita en el Excel; se usó la semana de la fecha por decisión administrativa">Excel: {p.semana_original}</span>}
                              </td>
                              <td className="hidden whitespace-nowrap align-top text-xs text-text-muted md:table-cell">
                                <div>{formatDateOnly(p.fecha_inicio_calculada)}</div>
                                <div>hasta {formatDateOnly(p.fecha_fin_calculada)}</div>
                              </td>
                              <td className="hidden whitespace-nowrap align-top min-[1600px]:table-cell">{p.mes}</td>
                              <td className="hidden max-w-[160px] truncate align-top min-[1600px]:table-cell" title={p.fase}>{p.fase}</td>
                              <td className="max-w-[200px] align-top">
                                <span title={p.entregable} className="line-clamp-2 text-text" style={{ fontWeight: 500 }}>{short}</span>
                              </td>
                              <td className="hidden max-w-[220px] align-top text-xs text-text-muted lg:table-cell">
                                <span title={p.descripcion_evidencia ?? ""} className="line-clamp-2">{p.descripcion_evidencia || "—"}</span>
                              </td>
                              <td className="text-right align-top tabular-nums">{p.horas}</td>
                              <td className="whitespace-nowrap text-right align-top">
                                <div className="inline-flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => void openMassUpdate(p)}
                                    className="ds-btn ds-btn-ghost ds-btn-sm !px-2 text-emerald-700"
                                    title="Actualizar evidencia en todos los grupos coincidentes"
                                    aria-label={`Actualizar evidencia compartida de la plantilla ${p.numero}`}
                                  >
                                    <Link2 className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => openEdit(p)} className="ds-btn ds-btn-ghost ds-btn-sm !px-2" title="Editar" aria-label={`Editar plantilla ${p.numero}`}>
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteRow(p)}
                                    className="ds-btn ds-btn-ghost ds-btn-sm !px-2 hover:!bg-red-50 hover:!text-red-700"
                                    title="Eliminar"
                                    aria-label={`Eliminar plantilla ${p.numero}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {sortedPlantillas.length > perPage && (
                    <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-text-subtle">
                      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="ds-btn ds-btn-secondary ds-btn-sm">
                        Anterior
                      </button>
                      <span className="tabular-nums">Página {page} de {totalPages}</span>
                      <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="ds-btn ds-btn-secondary ds-btn-sm">
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-line px-5 py-4">
            <DialogTitle className="text-base">{editingId != null ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              El sistema conserva la distancia respecto al inicio del semestre para poder clonar la plantilla a otros periodos.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 md:grid-cols-2">
              {field(
                "pl-semana",
                `Semana (1–${resumen?.grupo.numero_semanas ?? 16}) *`,
                <input id="pl-semana" type="number" min={1} max={resumen?.grupo.numero_semanas ?? 16} value={form.semana_numero} onChange={(e) => setForm((f) => ({ ...f, semana_numero: e.target.value }))} className="ds-input" />
              )}
              {field(
                "pl-mes",
                "Mes *",
                <>
                  <input id="pl-mes" list="plantilla-month-options" value={form.mes} onChange={(e) => setForm((f) => ({ ...f, mes: e.target.value }))} className="ds-input" />
                  <datalist id="plantilla-month-options">
                    {availableMonths.map((month) => <option key={month} value={month} />)}
                  </datalist>
                </>
              )}
              {field("pl-numero", "Número *", <input id="pl-numero" type="number" value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} className="ds-input" />)}
              {field("pl-horas", "Horas *", <input id="pl-horas" type="number" step="0.5" value={form.horas} onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))} className="ds-input" />)}
              {field("pl-fase", "Fase *", <input id="pl-fase" value={form.fase} onChange={(e) => setForm((f) => ({ ...f, fase: e.target.value }))} className="ds-input" />, "md:col-span-2")}
              {field("pl-cat", "Categoría *", <input id="pl-cat" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className="ds-input" />, "md:col-span-2")}
              {field("pl-fini", "Fecha exacta de inicio *", <input id="pl-fini" type="date" value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} className="ds-input" />)}
              {field("pl-ffin", "Fecha límite exacta *", <input id="pl-ffin" type="date" value={form.fecha_fin} onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} className="ds-input" />)}
              {field("pl-entregable", "Entregable *", <textarea id="pl-entregable" rows={3} value={form.entregable} onChange={(e) => setForm((f) => ({ ...f, entregable: e.target.value }))} className="ds-input" />, "md:col-span-2")}
              {field("pl-evid", "Instrucciones de evidencia (opcional)", <textarea id="pl-evid" rows={3} value={form.descripcion_evidencia} onChange={(e) => setForm((f) => ({ ...f, descripcion_evidencia: e.target.value }))} className="ds-input" />, "md:col-span-2")}
              {field("pl-enlace", "Enlace o formulario de referencia (HTTPS)", <input id="pl-enlace" type="url" placeholder="https://" value={form.enlace_referencia} onChange={(e) => setForm((f) => ({ ...f, enlace_referencia: e.target.value }))} className="ds-input" />, "md:col-span-2")}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-line px-5 py-3">
            <button type="button" onClick={() => setModalOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={saving} onClick={() => void saveModal()} className="ds-btn ds-btn-primary">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={massSource != null} onOpenChange={(o) => { if (!o && !savingMass) setMassSource(null); }}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-line px-5 py-4">
            <DialogTitle className="text-base">Actualización masiva de evidencia</DialogTitle>
            <DialogDescription className="line-clamp-2 text-xs text-text-subtle">{massSource?.entregable}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {loadingMassPreview ? (
              <PageLoading label="Calculando grupos afectados…" />
            ) : massPreview ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                <p className="text-sm text-emerald-800" style={{ fontWeight: 600 }}>
                  {massPreview.plantillas_afectadas} plantilla(s) en {massPreview.grupos_afectados} grupo(s)
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  Alcance restringido al semestre {massPreview.semestre}. Solo se incluyen entregables cuyo nombre coincide exactamente.
                </p>
                <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {[...new Map(massPreview.coincidencias.map((row) => [row.grupo_id, row])).values()].map((row) => (
                    <span key={row.grupo_id} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-emerald-800">
                      {row.grupo_nombre}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <label htmlFor="pl-mass-desc" className="ds-label">Instrucción o evidencia documental compartida</label>
              <textarea id="pl-mass-desc" rows={5} value={massDescription} onChange={(event) => setMassDescription(event.target.value)} className="ds-input" />
            </div>
            <div>
              <label htmlFor="pl-mass-link" className="ds-label">Enlace o formulario compartido</label>
              <input id="pl-mass-link" type="url" placeholder="https://" value={massLink} onChange={(event) => setMassLink(event.target.value)} className="ds-input" />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-line px-5 py-3">
            <button type="button" onClick={() => setMassSource(null)} disabled={savingMass} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void applyMassUpdate()} disabled={savingMass || loadingMassPreview || !massPreview} className="ds-btn ds-btn-primary">
              {savingMass ? "Aplicando…" : "Actualizar grupos"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
