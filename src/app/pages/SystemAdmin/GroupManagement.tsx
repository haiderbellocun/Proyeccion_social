import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { AppSelect } from "../../components/AppSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState, InlineAlert, Kpi, PageLoading, Panel, StatusPill } from "../../components/ds/primitives";
import { useConfirmationDialog } from "../../components/ConfirmationDialog";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";

const API_BASE_URL = API_BASE;

const SEMESTRE_HINT = /^\d{4}[AB]$/;

type IndicadoresGrupoRow = {
  id: number;
  nombre: string;
  semestre?: string | null;
  descripcion?: string | null;
  tipo_docente: "ANTIGUO" | "NUEVO" | string | null;
  horas_totales: number | null;
  num_proyectos: number;
  num_actividades: number;
  num_convenios_nuevos: number;
  num_convenios_dinamizados: number;
  num_docentes: number;
  num_plantilla_entregables: number;
};

type DocenteRow = {
  id: number;
  name: string;
  email: string;
  program: string;
  school: string;
  tipo_docente: string | null;
  regional: string | null;
  link_drive: string | null;
  grupo_matriz_id: number | null;
};

type GrupoFormState = {
  nombre: string;
  descripcion: string;
  semestre: string;
  tipo_docente: "ANTIGUO" | "NUEVO";
  horas_totales: string;
  num_proyectos: string;
  num_actividades: string;
  num_convenios_nuevos: string;
  num_convenios_dinamizados: string;
};

const emptyForm = (semestre: string): GrupoFormState => ({
  nombre: "",
  descripcion: "",
  semestre,
  tipo_docente: "ANTIGUO",
  horas_totales: "40",
  num_proyectos: "0",
  num_actividades: "0",
  num_convenios_nuevos: "0",
  num_convenios_dinamizados: "0",
});

function tipoIsNuevo(tipo: string | null | undefined): boolean {
  return String(tipo ?? "").toUpperCase() === "NUEVO";
}

function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  const isNuevo = tipoIsNuevo(tipo);
  const label = tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase() : "—";
  return <StatusPill tone={isNuevo ? "brand" : "neutral"}>{label}</StatusPill>;
}

/** Diálogo estándar de la sección: encabezado, cuerpo con scroll y pie con acciones a la derecha. */
function ModalShell({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 ${size === "lg" ? "sm:max-w-xl" : "sm:max-w-md"} flex flex-col`}>
        <DialogHeader className="shrink-0 border-b border-line px-5 py-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className={description ? "text-xs text-text-subtle" : "sr-only"}>{description ?? title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <DialogFooter className="shrink-0 border-t border-line px-5 py-3">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestreActivo, setSemestreActivo] = useState<string>("");
  const [semestreInstitucionalActivo, setSemestreInstitucionalActivo] = useState<string>("");
  const [activatingSemester, setActivatingSemester] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [grupos, setGrupos] = useState<IndicadoresGrupoRow[]>([]);
  const [docentes, setDocentes] = useState<DocenteRow[]>([]);
  const [expandedGrupoId, setExpandedGrupoId] = useState<number | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignGrupoId, setAssignGrupoId] = useState<number | null>(null);
  const [assignDocenteId, setAssignDocenteId] = useState<number | "">("");

  const [editOpen, setEditOpen] = useState(false);
  const [editDocente, setEditDocente] = useState<DocenteRow | null>(null);
  const [editTipo, setEditTipo] = useState<"ANTIGUO" | "NUEVO">("ANTIGUO");
  const [editRegional, setEditRegional] = useState("");
  const [editLink, setEditLink] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [grupoForm, setGrupoForm] = useState<GrupoFormState>(() => emptyForm(""));
  const [savingGrupo, setSavingGrupo] = useState(false);

  const [editGrupoOpen, setEditGrupoOpen] = useState(false);
  const [grupoEditId, setGrupoEditId] = useState<number | null>(null);
  const [grupoEditNumDocentes, setGrupoEditNumDocentes] = useState(0);
  const [grupoEditForm, setGrupoEditForm] = useState<GrupoFormState>(emptyForm(""));

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneOrigen, setCloneOrigen] = useState("");
  const [cloneDestino, setCloneDestino] = useState("");
  const [cloneFechaInicio, setCloneFechaInicio] = useState("");
  const [cloneFechaFin, setCloneFechaFin] = useState("");
  const [cloneNumeroSemanas, setCloneNumeroSemanas] = useState("16");
  const [clonePlantillas, setClonePlantillas] = useState(true);
  const [cloneActivar, setCloneActivar] = useState(false);
  const [clonePreviewCount, setClonePreviewCount] = useState(0);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/admin/semestres`);
        if (!r.ok) throw new Error("No se pudieron cargar los semestres");
        const d = await r.json();
        const list = Array.isArray(d.semestres) ? d.semestres : [];
        if (cancelled) return;
        setSemestres(list);
        setSemestreInstitucionalActivo(String(d.activo?.codigo || ""));
        setSemestreActivo((prev) => {
          if (prev) return prev;
          return d.activo?.codigo ?? list[0] ?? "";
        });
      } catch {
        if (!cancelled) {
          setSemestres([]);
          setSemestreActivo("");
          notify.error("No se pudieron cargar los calendarios de semestre.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAll = useCallback(async () => {
    if (!semestreActivo) return;
    setLoading(true);
    setLoadError(false);
    try {
      const semQ = encodeURIComponent(semestreActivo);
      const [gRes, dRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/indicadores-grupo?semestre=${semQ}`),
        fetch(`${API_BASE_URL}/admin/docentes?page=1&limit=500`),
      ]);
      if (!gRes.ok) throw new Error("grupos");
      if (!dRes.ok) throw new Error("docentes");
      const gj = await gRes.json();
      const dj = await dRes.json();
      const drows = dj.docentes || dj.data || [];
      setGrupos(Array.isArray(gj.grupos) ? gj.grupos : []);
      setDocentes(
        drows.map((r: Record<string, unknown>) => ({
          id: Number(r.id),
          name: String(r.name || ""),
          email: String(r.email || ""),
          program: String(r.program || "Sin programa"),
          school: String(r.school || ""),
          tipo_docente: r.tipo_docente != null ? String(r.tipo_docente) : null,
          regional: r.regional != null ? String(r.regional) : null,
          link_drive: r.link_drive != null ? String(r.link_drive) : null,
          grupo_matriz_id:
            r.grupo_matriz_id != null ? Number(r.grupo_matriz_id) : null,
        }))
      );
    } catch (e) {
      console.error(e);
      notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
      setLoadError(true);
      setGrupos([]);
      setDocentes([]);
    } finally {
      setLoading(false);
    }
  }, [semestreActivo]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!cloneOpen) return;
    let cancelled = false;
    (async () => {
      if (!cloneOrigen) {
        setClonePreviewCount(0);
        return;
      }
      try {
        const r = await fetch(
          `${API_BASE_URL}/admin/grupos-matriz?semestre=${encodeURIComponent(cloneOrigen)}`
        );
        const d = await r.json();
        const n = Array.isArray(d.grupos) ? d.grupos.length : 0;
        if (!cancelled) setClonePreviewCount(n);
      } catch {
        if (!cancelled) setClonePreviewCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneOpen, cloneOrigen]);

  const idsGrupoSemestre = useMemo(() => new Set(grupos.map((g) => g.id)), [grupos]);

  const resumen = useMemo(() => {
    const totalGrupos = grupos.length;
    const antiguo = grupos.filter((g) => !tipoIsNuevo(g.tipo_docente)).length;
    const nuevo = grupos.filter((g) => tipoIsNuevo(g.tipo_docente)).length;
    const sinGrupo = docentes.filter(
      (d) => d.grupo_matriz_id == null || !idsGrupoSemestre.has(d.grupo_matriz_id)
    ).length;
    return { totalGrupos, antiguo, nuevo, sinGrupo };
  }, [grupos, docentes, idsGrupoSemestre]);

  const docentesPorGrupo = useCallback(
    (grupoId: number) => docentes.filter((d) => d.grupo_matriz_id === grupoId),
    [docentes]
  );

  const openAssign = (grupoId: number) => {
    setAssignGrupoId(grupoId);
    setAssignDocenteId("");
    setAssignOpen(true);
  };

  const candidatosAsignar = useMemo(() => {
    if (assignGrupoId == null) return [];
    return docentes.filter(
      (d) => d.grupo_matriz_id == null || d.grupo_matriz_id !== assignGrupoId
    );
  }, [docentes, assignGrupoId]);

  const selectedCandidato = useMemo(() => {
    if (assignDocenteId === "") return null;
    return docentes.find((d) => d.id === assignDocenteId) || null;
  }, [docentes, assignDocenteId]);

  const handleAsignar = async () => {
    if (assignGrupoId == null || assignDocenteId === "") return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/docentes/${assignDocenteId}/grupo-matriz`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grupo_matriz_id: assignGrupoId }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo asignar.");
        return;
      }
      setAssignOpen(false);
      await loadAll();
      notify.success("Docente asignado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    }
  };

  const quitarDelGrupo = async (docenteId: number) => {
    const docente = docentes.find((item) => item.id === docenteId);
    const accepted = await requestConfirmation({
      title: "Quitar docente del grupo",
      description: docente
        ? `${docente.name} quedará sin grupo matriz asignado.`
        : "El docente quedará sin grupo matriz asignado.",
      confirmLabel: "Quitar del grupo",
      tone: "warning",
    });
    if (!accepted) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/docentes/${docenteId}/grupo-matriz`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grupo_matriz_id: null }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo actualizar.");
        return;
      }
      await loadAll();
      notify.success("Docente quitado del grupo");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    }
  };

  const openEdit = (d: DocenteRow) => {
    setEditDocente(d);
    setEditTipo(tipoIsNuevo(d.tipo_docente) ? "NUEVO" : "ANTIGUO");
    setEditRegional(d.regional || "");
    setEditLink(d.link_drive || "");
    setEditOpen(true);
  };

  const handleGuardarEdit = async () => {
    if (!editDocente) return;
    setSavingEdit(true);
    try {
      const tipoAntes = editDocente.tipo_docente;
      const tipoNuevo = editTipo;
      const regAntes = editDocente.regional || "";
      const linkAntes = editDocente.link_drive || "";

      if (tipoNuevo !== tipoAntes) {
        const r1 = await fetch(
          `${API_BASE_URL}/admin/docentes/${editDocente.id}/tipo-docente`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo_docente: tipoNuevo }),
          }
        );
        if (!r1.ok) {
          const j = await r1.json().catch(() => ({}));
          notify.error(j.error || "No se pudo actualizar el tipo.");
          return;
        }
      }

      if (editRegional !== regAntes || editLink !== linkAntes) {
        const r2 = await fetch(
          `${API_BASE_URL}/admin/docentes/${editDocente.id}/info-contacto`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ regional: editRegional, link_drive: editLink }),
          }
        );
        if (!r2.ok) {
          const j = await r2.json().catch(() => ({}));
          notify.error(j.error || "No se pudo actualizar contacto.");
          return;
        }
      }

      setEditOpen(false);
      await loadAll();
      notify.success("Cambios guardados");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openCreateGrupo = () => {
    setGrupoForm(emptyForm(semestreActivo));
    setCreateOpen(true);
  };

  const handleCrearGrupo = async () => {
    if (!grupoForm.nombre.trim()) {
      notify.warning("El nombre es obligatorio.");
      return;
    }
    if (!SEMESTRE_HINT.test(grupoForm.semestre.trim())) {
      notify.warning("Semestre inválido. Use formato 2026A o 2026B.");
      return;
    }
    setSavingGrupo(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/grupos-matriz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: grupoForm.nombre.trim(),
          descripcion: grupoForm.descripcion.trim() || null,
          tipo_docente: grupoForm.tipo_docente,
          horas_totales: Number(grupoForm.horas_totales),
          num_proyectos: Number(grupoForm.num_proyectos),
          num_actividades: Number(grupoForm.num_actividades),
          num_convenios_nuevos: Number(grupoForm.num_convenios_nuevos),
          num_convenios_dinamizados: Number(grupoForm.num_convenios_dinamizados),
          semestre: grupoForm.semestre.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo crear el grupo.");
        return;
      }
      setCreateOpen(false);
      const creadoSem = grupoForm.semestre.trim();
      if (!semestres.includes(creadoSem)) {
        setSemestres((prev) => [...new Set([...prev, creadoSem])].sort().reverse());
      }
      if (creadoSem === semestreActivo) await loadAll();
      else setSemestreActivo(creadoSem);
      notify.success("Grupo creado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    } finally {
      setSavingGrupo(false);
    }
  };

  const openEditGrupo = (g: IndicadoresGrupoRow) => {
    setGrupoEditId(g.id);
    setGrupoEditNumDocentes(g.num_docentes ?? 0);
    setGrupoEditForm({
      nombre: g.nombre,
      descripcion: g.descripcion ?? "",
      semestre: String(g.semestre ?? semestreActivo),
      tipo_docente: tipoIsNuevo(g.tipo_docente) ? "NUEVO" : "ANTIGUO",
      horas_totales: String(g.horas_totales ?? ""),
      num_proyectos: String(g.num_proyectos ?? 0),
      num_actividades: String(g.num_actividades ?? 0),
      num_convenios_nuevos: String(g.num_convenios_nuevos ?? 0),
      num_convenios_dinamizados: String(g.num_convenios_dinamizados ?? 0),
    });
    setEditGrupoOpen(true);
  };

  const handleGuardarGrupo = async () => {
    if (grupoEditId == null) return;
    if (!grupoEditForm.nombre.trim()) {
      notify.warning("El nombre es obligatorio.");
      return;
    }
    if (!SEMESTRE_HINT.test(grupoEditForm.semestre.trim())) {
      notify.warning("Semestre inválido.");
      return;
    }
    setSavingGrupo(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/grupos-matriz/${grupoEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: grupoEditForm.nombre.trim(),
          descripcion: grupoEditForm.descripcion.trim() || null,
          tipo_docente: grupoEditForm.tipo_docente,
          horas_totales: Number(grupoEditForm.horas_totales),
          num_proyectos: Number(grupoEditForm.num_proyectos),
          num_actividades: Number(grupoEditForm.num_actividades),
          num_convenios_nuevos: Number(grupoEditForm.num_convenios_nuevos),
          num_convenios_dinamizados: Number(grupoEditForm.num_convenios_dinamizados),
          semestre: grupoEditForm.semestre.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo guardar.");
        return;
      }
      setEditGrupoOpen(false);
      await loadAll();
      notify.success("Cambios guardados");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    } finally {
      setSavingGrupo(false);
    }
  };

  const eliminarGrupo = async (g: IndicadoresGrupoRow) => {
    const nd = g.num_docentes ?? 0;
    if (nd > 0) {
      notify.warning(
        `No puedes eliminar este grupo. Primero desasigna los ${nd} docente(s).`
      );
      return;
    }
    const accepted = await requestConfirmation({
      title: "Eliminar grupo matriz",
      description: `¿Deseas eliminar «${g.nombre}»?`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!accepted) return;
    try {
      let res = await fetch(`${API_BASE_URL}/admin/grupos-matriz/${g.id}`, {
        method: "DELETE",
      });
      if (res.status === 400) {
        const j = await res.json().catch(() => ({}));
        if (j.tiene_plantillas && typeof j.num_plantillas === "number") {
          const forceAccepted = await requestConfirmation({
            title: "Eliminar grupo y plantillas",
            description:
              `Este grupo tiene ${j.num_plantillas} plantillas de entregables. ` +
              "También se eliminarán y esta acción no se puede deshacer.",
            confirmLabel: "Eliminar todo",
            tone: "danger",
          });
          if (!forceAccepted) return;
          res = await fetch(
            `${API_BASE_URL}/admin/grupos-matriz/${g.id}?forzar=true`,
            { method: "DELETE" }
          );
        } else {
          notify.error(j.error || "No se pudo eliminar.");
          return;
        }
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo eliminar.");
        return;
      }
      setGrupos((prev) => prev.filter((x) => x.id !== g.id));
      setExpandedGrupoId((exp) => (exp === g.id ? null : exp));
      notify.success("Grupo eliminado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    }
  };

  const openCloneSemestre = () => {
    setCloneOrigen(semestreActivo || semestres[0] || "");
    setCloneDestino("");
    setCloneFechaInicio("");
    setCloneFechaFin("");
    setCloneNumeroSemanas("16");
    setClonePlantillas(true);
    setCloneActivar(false);
    setCloneOpen(true);
  };

  const handleActivarSemestre = async () => {
    if (!semestreActivo || semestreActivo === semestreInstitucionalActivo) return;
    const accepted = await requestConfirmation({
      title: "Activar semestre",
      description: `${semestreActivo} pasará a ser el semestre activo para toda la aplicación.`,
      confirmLabel: "Activar",
      tone: "primary",
    });
    if (!accepted) return;
    setActivatingSemester(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/semestres/${encodeURIComponent(semestreActivo)}/activar`,
        { method: "PUT" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo activar el semestre");
      setSemestreInstitucionalActivo(semestreActivo);
      window.location.reload();
    } catch (cause) {
      notify.fromError(cause, "No se pudo activar el semestre");
    } finally {
      setActivatingSemester(false);
    }
  };

  const handleClonarSemestre = async () => {
    const dest = cloneDestino.trim().toUpperCase();
    if (!SEMESTRE_HINT.test(dest)) {
      notify.warning("Semestre destino inválido (ej: 2026B).");
      return;
    }
    if (!cloneOrigen) {
      notify.warning("Selecciona semestre origen.");
      return;
    }
    if (dest === cloneOrigen) {
      notify.warning("El semestre destino debe ser distinto al origen.");
      return;
    }
    if (!cloneFechaInicio || !cloneFechaFin || cloneFechaFin < cloneFechaInicio) {
      notify.warning("Indica un rango de fechas válido para el nuevo semestre.");
      return;
    }
    const weeks = Number(cloneNumeroSemanas);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 53) {
      notify.warning("El número de semanas debe estar entre 1 y 53.");
      return;
    }
    setCloning(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/semestres/clonar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semestre_origen: cloneOrigen,
          semestre_destino: dest,
          fecha_inicio: cloneFechaInicio,
          fecha_fin: cloneFechaFin,
          numero_semanas: weeks,
          clonar_plantillas: clonePlantillas,
          activar: cloneActivar,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo clonar el semestre");
      notify.success(
        `Se crearon ${data.grupos_clonados ?? 0} grupos y ${data.plantillas_clonadas ?? 0} plantillas para ${dest}.`
      );
      setCloneOpen(false);
      if (!semestres.includes(dest)) {
        setSemestres((prev) => [...new Set([...prev, dest])].sort().reverse());
      }
      if (cloneActivar) {
        window.location.reload();
        return;
      }
      setSemestreActivo(dest);
    } catch (cause) {
      console.error(cause);
      notify.fromError(cause, "Error de conexión.");
    } finally {
      setCloning(false);
    }
  };

  const renderGrupoFormFields = (
    form: GrupoFormState,
    setForm: Dispatch<SetStateAction<GrupoFormState>>,
    options: { semestreReadonly: boolean; showSemestreWarning: boolean; idPrefix: string }
  ) => {
    const p = options.idPrefix;
    const numField = (key: keyof GrupoFormState, label: string, min: number) => (
      <div>
        <label htmlFor={`${p}-${key}`} className="ds-label">{label}</label>
        <input
          id={`${p}-${key}`}
          type="number"
          min={min}
          className="ds-input"
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        {options.showSemestreWarning && (
          <div className="col-span-2">
            <InlineAlert tone="warning">El semestre no puede modificarse porque hay docentes asignados a este grupo.</InlineAlert>
          </div>
        )}
        <div className="col-span-2">
          <label htmlFor={`${p}-nombre`} className="ds-label">Nombre *</label>
          <input id={`${p}-nombre`} className="ds-input" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label htmlFor={`${p}-desc`} className="ds-label">Descripción</label>
          <textarea
            id={`${p}-desc`}
            rows={2}
            className="ds-input resize-none"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          />
        </div>
        <div>
          <label className="ds-label">Semestre *</label>
          <AppSelect
            className="w-full"
            value={form.semestre}
            disabled={options.semestreReadonly}
            onValueChange={(v) => setForm((f) => ({ ...f, semestre: v }))}
            options={[
              ...(!semestres.includes(form.semestre) && form.semestre ? [{ value: form.semestre, label: form.semestre }] : []),
              ...semestres.map((semester) => ({ value: semester, label: semester })),
            ]}
          />
        </div>
        <fieldset>
          <legend className="ds-label">Tipo docente</legend>
          <div className="flex h-9 items-center gap-4">
            {(["ANTIGUO", "NUEVO"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${p}-tipo`}
                  className="accent-brand"
                  checked={form.tipo_docente === t}
                  onChange={() => setForm((f) => ({ ...f, tipo_docente: t }))}
                />
                {t === "ANTIGUO" ? "Antiguo" : "Nuevo"}
              </label>
            ))}
          </div>
        </fieldset>
        {numField("horas_totales", "Horas totales *", 1)}
        {numField("num_proyectos", "Proyectos", 0)}
        {numField("num_actividades", "Actividades", 0)}
        {numField("num_convenios_nuevos", "Convenios nuevos", 0)}
        <div className="col-span-2">{numField("num_convenios_dinamizados", "Convenios dinamizados", 0)}</div>
        <p className="col-span-2 text-xs text-text-subtle">Solo se muestran semestres con calendario registrado.</p>
      </div>
    );
  };

  if (!semestreActivo) {
    return loading ? (
      <PageLoading label="Inicializando semestre…" />
    ) : (
      <Panel bodyClassName="">
        <EmptyState icon={CalendarRange} title="No hay un semestre configurado">
          Crea un semestre en la pestaña «Semestres» para gestionar grupos y tareas.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem] text-text-muted" style={{ fontWeight: 550 }}>
            Semestre
          </span>
          <AppSelect

            value={semestreActivo}
            onValueChange={(v) => setSemestreActivo(v)}
            className="min-w-[100px]"
            options={semestres.length === 0 ? [{ value: semestreActivo, label: semestreActivo }] : semestres.map((s) => ({ value: s, label: s }))}
          />
        </div>
        {semestreActivo === semestreInstitucionalActivo ? (
          <StatusPill tone="success">Semestre activo</StatusPill>
        ) : (
          <button type="button" disabled={activatingSemester} onClick={() => void handleActivarSemestre()} className="ds-btn ds-btn-secondary ds-btn-sm">
            {activatingSemester ? "Activando…" : "Establecer como activo"}
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={openCloneSemestre} className="ds-btn ds-btn-secondary">
            <Copy className="h-4 w-4" aria-hidden /> Clonar semestre
          </button>
          <button type="button" onClick={openCreateGrupo} className="ds-btn ds-btn-primary">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo grupo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total de grupos" value={resumen.totalGrupos} icon={Users} tone="brand" />
        <Kpi label="Grupos antiguo" value={resumen.antiguo} />
        <Kpi label="Grupos nuevo" value={resumen.nuevo} tone="brand" />
        <Kpi label="Docentes sin grupo" value={resumen.sinGrupo} tone={resumen.sinGrupo > 0 ? "warning" : "success"} hint={resumen.sinGrupo > 0 ? "Asígnalos desde cada grupo" : undefined} />
      </div>

      <Panel bodyClassName="" title="Grupos matriz" description={`Semestre ${semestreActivo}`}>
        {loading && <PageLoading label="Cargando grupos…" />}
        {!loading && loadError && (
          <div className="p-4">
            <InlineAlert
              action={
                <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => void loadAll()}>
                  Reintentar
                </button>
              }
            >
              No se pudo cargar la información de grupos.
            </InlineAlert>
          </div>
        )}
        {!loading && !loadError && grupos.length === 0 && (
          <EmptyState
            icon={Users}
            title={`Sin grupos en ${semestreActivo}`}
            action={
              <button type="button" onClick={openCreateGrupo} className="ds-btn ds-btn-primary ds-btn-sm">
                <Plus className="h-4 w-4" aria-hidden /> Nuevo grupo
              </button>
            }
          >
            Crea un grupo o clona los de otro semestre.
          </EmptyState>
        )}
        {!loading && !loadError && grupos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th className="hidden min-[1600px]:table-cell">Semestre</th>
                  <th>Tipo</th>
                  <th className="hidden sm:table-cell text-right">Horas</th>
                  <th className="hidden md:table-cell text-right">Proyectos</th>
                  <th className="hidden xl:table-cell text-right">Actividades</th>
                  <th className="hidden min-[1600px]:table-cell text-right">Conv. nuevos</th>
                  <th className="hidden min-[1600px]:table-cell text-right">Conv. dinam.</th>
                  <th>Docentes</th>
                  <th className="hidden md:table-cell text-right">Plantillas</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const open = expandedGrupoId === g.id;
                  const lista = docentesPorGrupo(g.id);
                  return (
                    <Fragment key={g.id}>
                      <tr>
                        <td className="max-w-[18rem]">
                          <span className="block truncate text-text" style={{ fontWeight: 600 }} title={g.nombre}>
                            {g.nombre}
                          </span>
                        </td>
                        <td className="hidden min-[1600px]:table-cell">
                          <StatusPill tone="brand" dot={false}>{g.semestre ?? "—"}</StatusPill>
                        </td>
                        <td>
                          <TipoBadge tipo={g.tipo_docente} />
                        </td>
                        <td className="hidden text-right text-text-muted sm:table-cell">{g.horas_totales ?? "—"}</td>
                        <td className="hidden text-right text-text-muted md:table-cell">{g.num_proyectos ?? 0}</td>
                        <td className="hidden text-right text-text-muted xl:table-cell">{g.num_actividades ?? 0}</td>
                        <td className="hidden text-right text-text-muted min-[1600px]:table-cell">{g.num_convenios_nuevos ?? 0}</td>
                        <td className="hidden text-right text-text-muted min-[1600px]:table-cell">{g.num_convenios_dinamizados ?? 0}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setExpandedGrupoId(open ? null : g.id)}
                            aria-expanded={open}
                            aria-label={`${open ? "Ocultar" : "Ver"} docentes de ${g.nombre}`}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.8125rem] text-brand hover:bg-blue-50"
                          >
                            <span className="tabular-nums" style={{ fontWeight: 600 }}>{g.num_docentes ?? 0}</span>
                            {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                          </button>
                        </td>
                        <td className="hidden text-right text-text-muted md:table-cell">{g.num_plantilla_entregables ?? 0}</td>
                        <td className="whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditGrupo(g)}
                              className="ds-btn ds-btn-ghost ds-btn-sm !px-2"
                              aria-label={`Editar grupo ${g.nombre}`}
                              title="Editar grupo"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void eliminarGrupo(g)}
                              className="ds-btn ds-btn-ghost ds-btn-sm !px-2 hover:!bg-red-50 hover:!text-red-700"
                              aria-label={`Eliminar grupo ${g.nombre}`}
                              title="Eliminar grupo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={11} className="!bg-surface-2"><div className="w-0 min-w-full">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-text-muted" style={{ fontWeight: 600 }}>
                                Docentes en «{g.nombre}» ({lista.length})
                              </p>
                              <button type="button" onClick={() => openAssign(g.id)} className="ds-btn ds-btn-primary ds-btn-sm">
                                <UserPlus className="h-3.5 w-3.5" aria-hidden /> Asignar docente
                              </button>
                            </div>
                            {lista.length === 0 ? (
                              <p className="text-xs text-text-subtle">Sin docentes asignados.</p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                                <table className="ds-table">
                                  <thead>
                                    <tr>
                                      <th>Nombre</th>
                                      <th className="hidden sm:table-cell">Regional</th>
                                      <th className="hidden md:table-cell">Enlace Drive</th>
                                      <th>Tipo</th>
                                      <th className="text-right"><span className="sr-only">Acciones</span></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lista.map((d) => (
                                      <tr key={d.id}>
                                        <td className="text-text">{d.name}</td>
                                        <td className="hidden text-text-muted sm:table-cell">{d.regional || "—"}</td>
                                        <td className="hidden max-w-[220px] truncate md:table-cell">
                                          {d.link_drive ? (
                                            <a href={d.link_drive} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                                              {d.link_drive}
                                            </a>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td>
                                          <TipoBadge tipo={d.tipo_docente} />
                                        </td>
                                        <td className="whitespace-nowrap text-right">
                                          <button type="button" onClick={() => openEdit(d)} className="ds-btn ds-btn-ghost ds-btn-sm text-brand">
                                            Editar
                                          </button>
                                          <button type="button" onClick={() => void quitarDelGrupo(d.id)} className="ds-btn ds-btn-ghost ds-btn-sm hover:!bg-red-50 hover:!text-red-700">
                                            Quitar del grupo
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalShell
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Asignar docente a grupo"
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setAssignOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={() => void handleAsignar()} disabled={assignDocenteId === ""} className="ds-btn ds-btn-primary">
              Asignar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="ds-label">Docente</label>
            <AppSelect
              className="w-full"
              value={assignDocenteId === "" ? "" : String(assignDocenteId)}
              onValueChange={(v) => setAssignDocenteId(v === "" ? "" : Number(v))}
              placeholder="Seleccionar…"
              options={candidatosAsignar.map((d) => ({ value: String(d.id), label: `${d.name} — ${d.program}` }))}
            />
          </div>
          {selectedCandidato && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2.5 text-xs">
              <dt className="text-text-subtle">Nombre</dt>
              <dd className="text-text">{selectedCandidato.name}</dd>
              <dt className="text-text-subtle">Programa</dt>
              <dd className="text-text">{selectedCandidato.program}</dd>
              <dt className="text-text-subtle">Regional</dt>
              <dd className="text-text">{selectedCandidato.regional || "—"}</dd>
            </dl>
          )}
        </div>
      </ModalShell>

      <ModalShell
        open={editOpen && !!editDocente}
        onOpenChange={setEditOpen}
        title="Editar docente"
        description={editDocente?.name}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={savingEdit} onClick={() => void handleGuardarEdit()} className="ds-btn ds-btn-primary">
              {savingEdit ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
      >
        <div className="space-y-3.5">
          <fieldset>
            <legend className="ds-label">Tipo docente</legend>
            <div className="flex items-center gap-4">
              {(["ANTIGUO", "NUEVO"] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="tipo_doc" className="accent-brand" checked={editTipo === t} onChange={() => setEditTipo(t)} />
                  {t === "ANTIGUO" ? "Antiguo" : "Nuevo"}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="gm-regional" className="ds-label">Regional</label>
            <input id="gm-regional" className="ds-input" value={editRegional} onChange={(e) => setEditRegional(e.target.value)} />
          </div>
          <div>
            <label htmlFor="gm-link" className="ds-label">Enlace Drive</label>
            <input id="gm-link" type="url" className="ds-input" value={editLink} onChange={(e) => setEditLink(e.target.value)} />
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo grupo matriz"
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setCreateOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={savingGrupo} onClick={() => void handleCrearGrupo()} className="ds-btn ds-btn-primary">
              {savingGrupo ? "Creando…" : "Crear grupo"}
            </button>
          </>
        }
      >
        {renderGrupoFormFields(grupoForm, setGrupoForm, { semestreReadonly: false, showSemestreWarning: false, idPrefix: "gm-new" })}
      </ModalShell>

      <ModalShell
        open={editGrupoOpen}
        onOpenChange={setEditGrupoOpen}
        title="Editar grupo matriz"
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setEditGrupoOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={savingGrupo} onClick={() => void handleGuardarGrupo()} className="ds-btn ds-btn-primary">
              {savingGrupo ? "Guardando…" : "Guardar cambios"}
            </button>
          </>
        }
      >
        {renderGrupoFormFields(grupoEditForm, setGrupoEditForm, {
          semestreReadonly: grupoEditNumDocentes > 0,
          showSemestreWarning: grupoEditNumDocentes > 0,
          idPrefix: "gm-edit",
        })}
      </ModalShell>

      <ModalShell
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        title="Clonar semestre"
        description="Copia los grupos (y opcionalmente sus plantillas) a un semestre nuevo."
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setCloneOpen(false)} className="ds-btn ds-btn-secondary">
              Cancelar
            </button>
            <button type="button" disabled={cloning} onClick={() => void handleClonarSemestre()} className="ds-btn ds-btn-primary">
              {cloning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Clonar semestre
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          <div>
            <label className="ds-label">Semestre origen</label>
            <AppSelect
              value={cloneOrigen}
              onValueChange={(v) => setCloneOrigen(v)}
              className="w-full"
              options={semestres.length === 0 ? [{ value: semestreActivo, label: semestreActivo }] : semestres.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div>
            <label htmlFor="gm-destino" className="ds-label">Semestre destino</label>
            <input id="gm-destino" className="ds-input" value={cloneDestino} onChange={(e) => setCloneDestino(e.target.value.toUpperCase())} placeholder="Ej.: 2026B" />
          </div>
          <div>
            <label htmlFor="gm-fini" className="ds-label">Fecha de inicio</label>
            <input id="gm-fini" type="date" value={cloneFechaInicio} onChange={(e) => setCloneFechaInicio(e.target.value)} className="ds-input" />
          </div>
          <div>
            <label htmlFor="gm-ffin" className="ds-label">Fecha de finalización</label>
            <input id="gm-ffin" type="date" min={cloneFechaInicio || undefined} value={cloneFechaFin} onChange={(e) => setCloneFechaFin(e.target.value)} className="ds-input" />
          </div>
          <div className="col-span-2">
            <label htmlFor="gm-nsem" className="ds-label">Número de semanas</label>
            <input id="gm-nsem" type="number" min={1} max={53} value={cloneNumeroSemanas} onChange={(e) => setCloneNumeroSemanas(e.target.value)} className="ds-input" />
          </div>
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand" checked={clonePlantillas} onChange={(e) => setClonePlantillas(e.target.checked)} />
            Copiar también las plantillas de entregables
          </label>
          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand" checked={cloneActivar} onChange={(e) => setCloneActivar(e.target.checked)} />
            Establecer el nuevo semestre como activo
          </label>
          <p className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-muted">
            Se clonarán <strong className="text-text">{clonePreviewCount}</strong> grupo{clonePreviewCount === 1 ? "" : "s"} del semestre{" "}
            <strong className="text-text">{cloneOrigen || "—"}</strong>.
          </p>
        </div>
      </ModalShell>
    </div>
  );
}
