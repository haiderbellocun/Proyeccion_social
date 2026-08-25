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
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
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
  const label = tipo ?? "—";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isNuevo ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}

export default function GroupManagement() {
  const requestConfirmation = useConfirmationDialog();
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestreActivo, setSemestreActivo] = useState<string>("");
  const [semestreInstitucionalActivo, setSemestreInstitucionalActivo] = useState<string>("");
  const [activatingSemester, setActivatingSemester] = useState(false);
  const [loading, setLoading] = useState(true);
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
    options: { semestreReadonly: boolean; showSemestreWarning: boolean }
  ) => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      {options.showSemestreWarning && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-lg">
          El semestre no puede modificarse porque hay docentes asignados a este grupo.
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 resize-none"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Semestre *</label>
        <AppSelect
          className="w-full bg-gray-50"
          value={form.semestre}
          disabled={options.semestreReadonly}
          onValueChange={(v) => setForm((f) => ({ ...f, semestre: v }))}
          options={[
            ...(!semestres.includes(form.semestre) && form.semestre
              ? [{ value: form.semestre, label: form.semestre }]
              : []),
            ...semestres.map((semester) => ({ value: semester, label: semester })),
          ]}
        />
        <p className="text-xs text-gray-500 mt-1">Solo se muestran calendarios registrados.</p>
      </div>
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-2">Tipo docente</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={form.tipo_docente === "ANTIGUO"}
              onChange={() => setForm((f) => ({ ...f, tipo_docente: "ANTIGUO" }))}
            />
            ANTIGUO
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={form.tipo_docente === "NUEVO"}
              onChange={() => setForm((f) => ({ ...f, tipo_docente: "NUEVO" }))}
            />
            NUEVO
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Horas totales *</label>
          <input
            type="number"
            min={1}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={form.horas_totales}
            onChange={(e) => setForm((f) => ({ ...f, horas_totales: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Proyectos</label>
          <input
            type="number"
            min={0}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={form.num_proyectos}
            onChange={(e) => setForm((f) => ({ ...f, num_proyectos: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Actividades</label>
          <input
            type="number"
            min={0}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={form.num_actividades}
            onChange={(e) => setForm((f) => ({ ...f, num_actividades: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conv. Nuevos</label>
          <input
            type="number"
            min={0}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={form.num_convenios_nuevos}
            onChange={(e) => setForm((f) => ({ ...f, num_convenios_nuevos: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Conv. Dinamizados
          </label>
          <input
            type="number"
            min={0}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={form.num_convenios_dinamizados}
            onChange={(e) =>
              setForm((f) => ({ ...f, num_convenios_dinamizados: e.target.value }))
            }
          />
        </div>
      </div>
    </div>
  );

  if (!semestreActivo) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        {loading ? "Inicializando semestre…" : "No hay un semestre configurado."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 shrink-0">
          <span style={{ fontWeight: 600 }}>Semestre:</span>
          <AppSelect
            value={semestreActivo}
            onValueChange={(v) => setSemestreActivo(v)}
            className="bg-gray-50 min-w-[100px]"
            options={
              semestres.length === 0
                ? [{ value: semestreActivo, label: semestreActivo }]
                : semestres.map((s) => ({ value: s, label: s }))
            }
          />
        </label>
        {semestreActivo === semestreInstitucionalActivo ? (
          <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            Semestre activo
          </span>
        ) : (
          <button
            type="button"
            disabled={activatingSemester}
            onClick={() => void handleActivarSemestre()}
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {activatingSemester ? "Activando…" : "Establecer como activo"}
          </button>
        )}
        <button
          type="button"
          onClick={openCreateGrupo}
          className="inline-flex items-center justify-center gap-2 bg-[#1e3a8a] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1d4ed8] shrink-0"
        >
          <Plus className="w-4 h-4" /> Nuevo Grupo
        </button>
        <button
          type="button"
          onClick={openCloneSemestre}
          className="inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 shrink-0"
        >
          <Copy className="w-4 h-4" /> Clonar semestre →
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total grupos", value: resumen.totalGrupos },
          { label: "Grupos ANTIGUO", value: resumen.antiguo },
          { label: "Grupos NUEVO", value: resumen.nuevo },
          { label: "Docentes sin grupo", value: resumen.sinGrupo },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
          >
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl text-gray-900 mt-1" style={{ fontWeight: 700 }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Grupo</th>
                <th className="text-left px-4 py-3">Semestre</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-4 py-3">Horas</th>
                <th className="text-right px-4 py-3">Proyectos</th>
                <th className="text-right px-4 py-3">Actividades</th>
                <th className="text-right px-4 py-3">Conv.Nvo</th>
                <th className="text-right px-4 py-3">Conv.Din</th>
                <th className="text-left px-4 py-3">Docentes</th>
                <th className="text-right px-4 py-3">Plantillas</th>
                <th className="text-left px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {grupos.map((g) => {
                const open = expandedGrupoId === g.id;
                const lista = docentesPorGrupo(g.id);
                return (
                  <Fragment key={g.id}>
                    <tr className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-800 font-medium">{g.nombre}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {g.semestre ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TipoBadge tipo={g.tipo_docente} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {g.horas_totales ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {g.num_proyectos ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {g.num_actividades ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {g.num_convenios_nuevos ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {g.num_convenios_dinamizados ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums text-gray-700">
                            {g.num_docentes ?? 0}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedGrupoId(open ? null : g.id)}
                            className="inline-flex items-center gap-1 text-xs text-[#1d4ed8] hover:text-[#1e3a8a] font-medium"
                          >
                            {open ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" /> Ocultar
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" /> Ver docentes
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {g.num_plantilla_entregables ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditGrupo(g)}
                            className="p-1.5 rounded-lg text-[#1d4ed8] hover:bg-blue-50"
                            title="Editar grupo"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminarGrupo(g)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                            title="Eliminar grupo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <p className="text-xs text-gray-600 font-medium">
                              Docentes en &ldquo;{g.nombre}&rdquo; ({lista.length})
                            </p>
                            <button
                              type="button"
                              onClick={() => openAssign(g.id)}
                              className="inline-flex items-center gap-1.5 text-xs bg-[#1e3a8a] text-white px-3 py-1.5 rounded-lg hover:bg-[#1d4ed8]"
                              style={{ fontWeight: 600 }}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Asignar docente
                            </button>
                          </div>
                          {lista.length === 0 ? (
                            <p className="text-xs text-gray-400">Sin docentes asignados.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-500">
                                    <th className="text-left px-3 py-2">Nombre</th>
                                    <th className="text-left px-3 py-2">Regional</th>
                                    <th className="text-left px-3 py-2">Link Drive</th>
                                    <th className="text-left px-3 py-2">Tipo</th>
                                    <th className="text-right px-3 py-2"> </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {lista.map((d) => (
                                    <tr key={d.id}>
                                      <td className="px-3 py-2 text-gray-800">{d.name}</td>
                                      <td className="px-3 py-2 text-gray-600">
                                        {d.regional || "—"}
                                      </td>
                                      <td className="px-3 py-2 max-w-[180px] truncate">
                                        {d.link_drive ? (
                                          <a
                                            href={d.link_drive}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[#1d4ed8] hover:underline"
                                          >
                                            {d.link_drive}
                                          </a>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <TipoBadge tipo={d.tipo_docente} />
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                                        <button
                                          type="button"
                                          onClick={() => openEdit(d)}
                                          className="text-[#1d4ed8] hover:underline font-medium"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void quitarDelGrupo(d.id)}
                                          className="text-red-600 hover:underline font-medium"
                                        >
                                          Quitar del grupo
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {assignOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800 font-semibold">Asignar docente a grupo</h3>
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1.5 font-medium">
                  Docente
                </label>
                <AppSelect
                  className="w-full bg-gray-50"
                  value={assignDocenteId === "" ? "" : String(assignDocenteId)}
                  onValueChange={(v) => setAssignDocenteId(v === "" ? "" : Number(v))}
                  placeholder="Seleccionar…"
                  options={candidatosAsignar.map((d) => ({
                    value: String(d.id),
                    label: `${d.name} — ${d.program}`,
                  }))}
                />
              </div>
              {selectedCandidato && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-gray-700 space-y-1">
                  <p>
                    <span className="text-gray-500">Nombre:</span>{" "}
                    {selectedCandidato.name}
                  </p>
                  <p>
                    <span className="text-gray-500">Programa:</span>{" "}
                    {selectedCandidato.program}
                  </p>
                  <p>
                    <span className="text-gray-500">Regional:</span>{" "}
                    {selectedCandidato.regional || "—"}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleAsignar()}
                disabled={assignDocenteId === ""}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editDocente && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800 font-semibold">Editar docente</h3>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">{editDocente.name}</p>
              <div>
                <span className="text-sm text-gray-700 block mb-2 font-medium">
                  Tipo docente
                </span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tipo_doc"
                      checked={editTipo === "ANTIGUO"}
                      onChange={() => setEditTipo("ANTIGUO")}
                    />
                    ANTIGUO
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tipo_doc"
                      checked={editTipo === "NUEVO"}
                      onChange={() => setEditTipo("NUEVO")}
                    />
                    NUEVO
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5 font-medium">
                  Regional
                </label>
                <input
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={editRegional}
                  onChange={(e) => setEditRegional(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5 font-medium">
                  Link Drive
                </label>
                <input
                  type="url"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void handleGuardarEdit()}
                className="flex-1 bg-[#1e3a8a] hover:bg-[#1d4ed8] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold"
              >
                {savingEdit ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-gray-800 font-semibold">Nuevo grupo matriz</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {renderGrupoFormFields(grupoForm, setGrupoForm, {
                semestreReadonly: false,
                showSemestreWarning: false,
              })}
            </div>
            <div className="flex gap-3 px-6 pb-6 shrink-0">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingGrupo}
                onClick={() => void handleCrearGrupo()}
                className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {savingGrupo ? "Creando…" : "Crear grupo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editGrupoOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-gray-800 font-semibold">Editar grupo matriz</h3>
              <button
                type="button"
                onClick={() => setEditGrupoOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {renderGrupoFormFields(grupoEditForm, setGrupoEditForm, {
                semestreReadonly: grupoEditNumDocentes > 0,
                showSemestreWarning: grupoEditNumDocentes > 0,
              })}
            </div>
            <div className="flex gap-3 px-6 pb-6 shrink-0">
              <button
                type="button"
                onClick={() => setEditGrupoOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingGrupo}
                onClick={() => void handleGuardarGrupo()}
                className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {savingGrupo ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cloneOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-gray-800 font-semibold">Clonar semestre</h3>
              <button
                type="button"
                onClick={() => setCloneOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Semestre origen
                </label>
                <AppSelect
                  value={cloneOrigen}
                  onValueChange={(v) => setCloneOrigen(v)}
                  className="w-full bg-gray-50"
                  options={
                    semestres.length === 0
                      ? [{ value: semestreActivo, label: semestreActivo }]
                      : semestres.map((s) => ({ value: s, label: s }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Semestre destino (ej: 2026B)
                </label>
                <input
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={cloneDestino}
                  onChange={(e) => setCloneDestino(e.target.value.toUpperCase())}
                  placeholder="2026B"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={cloneFechaInicio}
                    onChange={(e) => setCloneFechaInicio(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de finalización
                  </label>
                  <input
                    type="date"
                    min={cloneFechaInicio || undefined}
                    value={cloneFechaFin}
                    onChange={(e) => setCloneFechaFin(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de semanas
                </label>
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={cloneNumeroSemanas}
                  onChange={(e) => setCloneNumeroSemanas(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={clonePlantillas}
                  onChange={(e) => setClonePlantillas(e.target.checked)}
                />
                Copiar también las plantillas de entregables
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneActivar}
                  onChange={(e) => setCloneActivar(e.target.checked)}
                />
                Establecer el nuevo semestre como activo
              </label>
              <p className="text-sm text-gray-600 bg-slate-50 rounded-lg px-3 py-2">
                Se clonarán <strong>{clonePreviewCount}</strong> grupo
                {clonePreviewCount === 1 ? "" : "s"} del semestre{" "}
                <strong>{cloneOrigen || "—"}</strong>
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => setCloneOpen(false)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={cloning}
                onClick={() => void handleClonarSemestre()}
                className="flex-1 bg-[#1e3a8a] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Clonar semestre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
