import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import {
  AdmPagina, Barra, Campo, Cargando, DataTable, ErrorCarga, Filtro, FormInspector, Grupo, Resumen, Tag, Vacio, useConfirmar,
  type Col,
} from "../../components/b2/admin-ui";
import { Dl, Estado } from "../../components/b2/ui";
import "../../components/b2/b2-admin-tareas.css";

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

type ResumenGrupo = {
  grupo: { id: number; nombre: string; semestre: string; numero_semanas: number | null; horas_totales: number | null };
  importaciones: { id: number; lote: string; creado_en: string; archivo_nombre: string | null }[];
  totales: { total: number; importadas: number; horas: number; con_ajustes: number };
};

type Modo =
  | { k: "ver"; id: number }
  | { k: "crear" }
  | { k: "editar"; id: number }
  | { k: "clonar" }
  | { k: "asignar"; id: number }
  | { k: "docente"; id: number }
  | null;

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

function TipoTag({ tipo }: { tipo: string | null | undefined }) {
  const label = tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase() : "—";
  return <Tag tono={tipoIsNuevo(tipo) ? "primario" : "neutro"}>{label}</Tag>;
}

export default function GroupManagement({ cabecera }: { cabecera: ReactNode }) {
  const navigate = useNavigate();
  const { confirmar, dialogo } = useConfirmar();
  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestreActivo, setSemestreActivo] = useState<string>("");
  const [semestreInstitucionalActivo, setSemestreInstitucionalActivo] = useState<string>("");
  const [activatingSemester, setActivatingSemester] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [grupos, setGrupos] = useState<IndicadoresGrupoRow[]>([]);
  const [docentes, setDocentes] = useState<DocenteRow[]>([]);
  const [modo, setModo] = useState<Modo>(null);
  const [intento, setIntento] = useState(false);

  const [assignDocenteId, setAssignDocenteId] = useState<number | "">("");

  const [editDocente, setEditDocente] = useState<DocenteRow | null>(null);
  const [editTipo, setEditTipo] = useState<"ANTIGUO" | "NUEVO">("ANTIGUO");
  const [editRegional, setEditRegional] = useState("");
  const [editLink, setEditLink] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [grupoForm, setGrupoForm] = useState<GrupoFormState>(() => emptyForm(""));
  const [savingGrupo, setSavingGrupo] = useState(false);

  const [grupoEditNumDocentes, setGrupoEditNumDocentes] = useState(0);
  const [grupoEditForm, setGrupoEditForm] = useState<GrupoFormState>(emptyForm(""));

  const [cloneOrigen, setCloneOrigen] = useState("");
  const [cloneDestino, setCloneDestino] = useState("");
  const [cloneFechaInicio, setCloneFechaInicio] = useState("");
  const [cloneFechaFin, setCloneFechaFin] = useState("");
  const [cloneNumeroSemanas, setCloneNumeroSemanas] = useState("16");
  const [clonePlantillas, setClonePlantillas] = useState(true);
  const [cloneActivar, setCloneActivar] = useState(false);
  const [clonePreviewCount, setClonePreviewCount] = useState(0);
  const [cloning, setCloning] = useState(false);

  const [resumenGrupo, setResumenGrupo] = useState<{ id: number; data: ResumenGrupo | null; cargando: boolean } | null>(null);

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
        if (list.length === 0 && !d.activo?.codigo) setLoading(false);
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

  const cloneOpen = modo?.k === "clonar";
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

  const grupoModo = modo && "id" in modo ? grupos.find((g) => g.id === modo.id) ?? null : null;
  const verId = modo && "id" in modo ? modo.id : null;

  // Resumen de solo lectura (entregables, horas y semanas) del grupo abierto en el inspector
  useEffect(() => {
    if (modo?.k !== "ver") return;
    const id = modo.id;
    let cancelled = false;
    setResumenGrupo({ id, data: null, cargando: true });
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/admin/grupos-matriz/${id}/resumen`);
        const d = r.ok ? ((await r.json()) as ResumenGrupo) : null;
        if (!cancelled) setResumenGrupo({ id, data: d, cargando: false });
      } catch {
        if (!cancelled) setResumenGrupo({ id, data: null, cargando: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modo?.k === "ver" ? modo.id : null, grupos]);

  const cerrar = () => {
    setModo(null);
    setIntento(false);
  };

  const abrirVer = (id: number) => {
    setIntento(false);
    setModo({ k: "ver", id });
  };

  const openAssign = (grupoId: number) => {
    setAssignDocenteId("");
    setModo({ k: "asignar", id: grupoId });
  };

  const candidatosAsignar = useMemo(() => {
    if (modo?.k !== "asignar") return [];
    return docentes.filter(
      (d) => d.grupo_matriz_id == null || d.grupo_matriz_id !== modo.id
    );
  }, [docentes, modo]);

  const selectedCandidato = useMemo(() => {
    if (assignDocenteId === "") return null;
    return docentes.find((d) => d.id === assignDocenteId) || null;
  }, [docentes, assignDocenteId]);

  const handleAsignar = async () => {
    if (modo?.k !== "asignar" || assignDocenteId === "") return;
    const grupoId = modo.id;
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/docentes/${assignDocenteId}/grupo-matriz`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grupo_matriz_id: grupoId }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify.error(j.error || "No se pudo asignar.");
        return;
      }
      abrirVer(grupoId);
      await loadAll();
      notify.success("Docente asignado");
    } catch (err) {
      console.error(err);
      notify.error("Error de conexión.");
    }
  };

  const quitarDelGrupo = async (docenteId: number) => {
    const docente = docentes.find((item) => item.id === docenteId);
    const accepted = await confirmar({
      titulo: "Quitar docente del grupo",
      descripcion: docente
        ? `${docente.name} quedará sin grupo matriz asignado.`
        : "El docente quedará sin grupo matriz asignado.",
      etiqueta: "Quitar del grupo",
      tono: "aviso",
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

  const openEdit = (d: DocenteRow, grupoId: number) => {
    setEditDocente(d);
    setEditTipo(tipoIsNuevo(d.tipo_docente) ? "NUEVO" : "ANTIGUO");
    setEditRegional(d.regional || "");
    setEditLink(d.link_drive || "");
    setModo({ k: "docente", id: grupoId });
  };

  const handleGuardarEdit = async () => {
    if (!editDocente || modo?.k !== "docente") return;
    const grupoId = modo.id;
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

      abrirVer(grupoId);
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
    setIntento(false);
    setModo({ k: "crear" });
  };

  const erroresGrupo = (f: GrupoFormState, mensajeSemestre: string) => {
    const e: { nombre?: string; semestre?: string } = {};
    if (!f.nombre.trim()) e.nombre = "El nombre es obligatorio.";
    if (!SEMESTRE_HINT.test(f.semestre.trim())) e.semestre = mensajeSemestre;
    return e;
  };

  const handleCrearGrupo = async () => {
    setIntento(true);
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
      cerrar();
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
    setIntento(false);
    setModo({ k: "editar", id: g.id });
  };

  const handleGuardarGrupo = async () => {
    if (modo?.k !== "editar") return;
    const grupoEditId = modo.id;
    setIntento(true);
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
      abrirVer(grupoEditId);
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
    const accepted = await confirmar({
      titulo: "Eliminar grupo matriz",
      descripcion: `¿Deseas eliminar «${g.nombre}»?`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    try {
      let res = await fetch(`${API_BASE_URL}/admin/grupos-matriz/${g.id}`, {
        method: "DELETE",
      });
      if (res.status === 400) {
        const j = await res.json().catch(() => ({}));
        if (j.tiene_plantillas && typeof j.num_plantillas === "number") {
          const forceAccepted = await confirmar({
            titulo: "Eliminar grupo y plantillas",
            descripcion:
              `Este grupo tiene ${j.num_plantillas} plantillas de entregables. ` +
              "También se eliminarán y esta acción no se puede deshacer.",
            etiqueta: "Eliminar todo",
            tono: "peligro",
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
      setModo((m) => (m && "id" in m && m.id === g.id ? null : m));
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
    setIntento(false);
    setModo({ k: "clonar" });
  };

  const handleActivarSemestre = async () => {
    if (!semestreActivo || semestreActivo === semestreInstitucionalActivo) return;
    const accepted = await confirmar({
      titulo: "Activar semestre",
      descripcion: `${semestreActivo} pasará a ser el semestre activo para toda la aplicación.`,
      etiqueta: "Activar",
      tono: "primario",
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

  const erroresClon = () => {
    const dest = cloneDestino.trim().toUpperCase();
    const e: { destino?: string; origen?: string; fechas?: string; semanas?: string } = {};
    if (!SEMESTRE_HINT.test(dest)) e.destino = "Semestre destino inválido (ej: 2026B).";
    else if (dest === cloneOrigen) e.destino = "El semestre destino debe ser distinto al origen.";
    if (!cloneOrigen) e.origen = "Selecciona semestre origen.";
    if (!cloneFechaInicio || !cloneFechaFin || cloneFechaFin < cloneFechaInicio) {
      e.fechas = "Indica un rango de fechas válido para el nuevo semestre.";
    }
    const weeks = Number(cloneNumeroSemanas);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 53) e.semanas = "El número de semanas debe estar entre 1 y 53.";
    return e;
  };

  const handleClonarSemestre = async () => {
    setIntento(true);
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
      cerrar();
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

  /* ───────── presentación ───────── */
  const verPlantillas = (g: IndicadoresGrupoRow) =>
    navigate(`/admin/sistema?tab=plantillas&semestre=${encodeURIComponent(String(g.semestre ?? semestreActivo))}&grupo=${g.id}`);

  const cols: Col<IndicadoresGrupoRow>[] = [
    { id: "grupo", titulo: "Grupo", ancho: "minmax(200px, 1fr)", celda: (g) => <span className="b2-tt" title={g.nombre} style={{ fontWeight: 700 }}>{g.nombre}</span> },
    { id: "tipo", titulo: "Tipo", ancho: "84px", celda: (g) => <TipoTag tipo={g.tipo_docente} /> },
    { id: "docentes", titulo: "Docentes", ancho: "72px", num: true, celda: (g) => g.num_docentes ?? 0 },
    { id: "horas", titulo: "Horas", ancho: "64px", num: true, prioridad: 2, celda: (g) => g.horas_totales ?? "—" },
    { id: "proy", titulo: "Proyectos", ancho: "76px", num: true, prioridad: 2, celda: (g) => g.num_proyectos ?? 0 },
    { id: "plant", titulo: "Plantillas", ancho: "76px", num: true, prioridad: 2, celda: (g) => g.num_plantilla_entregables ?? 0 },
    { id: "act", titulo: "Actividades", ancho: "88px", num: true, prioridad: 3, celda: (g) => g.num_actividades ?? 0 },
    { id: "cn", titulo: "Conv. nuevos", ancho: "92px", num: true, prioridad: 3, celda: (g) => g.num_convenios_nuevos ?? 0 },
    { id: "cd", titulo: "Conv. dinam.", ancho: "92px", num: true, prioridad: 3, celda: (g) => g.num_convenios_dinamizados ?? 0 },
  ];

  const esActivo = semestreActivo === semestreInstitucionalActivo;
  const opcionesSemestre = semestres.length === 0 ? [semestreActivo] : semestres;

  const numCampo = (f: GrupoFormState, set: (fn: (p: GrupoFormState) => GrupoFormState) => void, key: keyof GrupoFormState, label: string, min: number, completo?: boolean) => (
    <Campo etiqueta={label} ancho={completo ? "completo" : undefined} obligatorio={key === "horas_totales"}>
      {(p) => <input {...p} type="number" min={min} className="b2-input" value={f[key]} onChange={(e) => set((s) => ({ ...s, [key]: e.target.value }))} />}
    </Campo>
  );

  const camposGrupo = (
    f: GrupoFormState,
    set: (fn: (p: GrupoFormState) => GrupoFormState) => void,
    opts: { semestreReadonly: boolean; aviso: boolean; mensajeSemestre: string; prefix: string }
  ) => {
    const err = intento ? erroresGrupo(f, opts.mensajeSemestre) : {};
    const lista = [err.nombre, err.semestre].filter(Boolean) as string[];
    return { err, lista, nodo: (
      <>
        {opts.aviso && <div className="b2-nota-aviso" data-t="warn">El semestre no puede modificarse porque hay docentes asignados a este grupo.</div>}
        <Grupo>
          <Campo etiqueta="Nombre" obligatorio ancho="completo" error={err.nombre}>
            {(p) => <input {...p} className="b2-input" value={f.nombre} onChange={(e) => set((s) => ({ ...s, nombre: e.target.value }))} />}
          </Campo>
          <Campo etiqueta="Descripción" ancho="completo">
            {(p) => <textarea {...p} rows={2} className="b2-input" value={f.descripcion} onChange={(e) => set((s) => ({ ...s, descripcion: e.target.value }))} />}
          </Campo>
          <Campo etiqueta="Semestre" obligatorio error={err.semestre} ayuda="Solo se muestran semestres con calendario registrado.">
            {(p) => (
              <select {...p} className="b2-sel" value={f.semestre} disabled={opts.semestreReadonly} onChange={(e) => set((s) => ({ ...s, semestre: e.target.value }))}>
                {!semestres.includes(f.semestre) && f.semestre && <option value={f.semestre}>{f.semestre}</option>}
                {semestres.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Campo>
          <div className="b2-campo-f" role="radiogroup" aria-label="Tipo docente">
            <span className="b2-label">Tipo docente</span>
            <div className="b2-radios">
              {(["ANTIGUO", "NUEVO"] as const).map((t) => (
                <label key={t}>
                  <input type="radio" name={`${opts.prefix}-tipo`} checked={f.tipo_docente === t} onChange={() => set((s) => ({ ...s, tipo_docente: t }))} />
                  {t === "ANTIGUO" ? "Antiguo" : "Nuevo"}
                </label>
              ))}
            </div>
          </div>
        </Grupo>
        <Grupo titulo="Carga académica">
          {numCampo(f, set, "horas_totales", "Horas totales", 1)}
          {numCampo(f, set, "num_proyectos", "Proyectos", 0)}
          {numCampo(f, set, "num_actividades", "Actividades", 0)}
          {numCampo(f, set, "num_convenios_nuevos", "Convenios nuevos", 0)}
          {numCampo(f, set, "num_convenios_dinamizados", "Convenios dinamizados", 0, true)}
        </Grupo>
      </>
    ) };
  };

  let inspector: ReactNode = null;
  let etiquetaInsp = "";
  let abierto = false;

  if (modo?.k === "ver" && grupoModo) {
    const g = grupoModo;
    const lista = docentesPorGrupo(g.id);
    const rs = resumenGrupo && resumenGrupo.id === g.id ? resumenGrupo : null;
    abierto = true;
    etiquetaInsp = `ver-${g.id}`;
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">Grupo matriz · {g.semestre ?? semestreActivo}</p>
        <h2 className="b2-insp-h">{g.nombre}</h2>
        <div className="b2-insp-estado"><TipoTag tipo={g.tipo_docente} /></div>
        {g.descripcion && <p className="b2-insp-p">{g.descripcion}</p>}
        <h3 className="b2-insp-sub">Carga</h3>
        <Dl rows={[
          ["Horas totales", g.horas_totales ?? "—"],
          ["Proyectos", g.num_proyectos ?? 0],
          ["Actividades", g.num_actividades ?? 0],
          ["Conv. nuevos", g.num_convenios_nuevos ?? 0],
          ["Conv. dinam.", g.num_convenios_dinamizados ?? 0],
        ]} />
        <h3 className="b2-insp-sub">Semanas y entregables</h3>
        {rs?.cargando && <Cargando etiqueta="Cargando resumen…" />}
        {rs && !rs.cargando && !rs.data && <p className="b2-insp-p">No se pudo cargar el resumen del grupo.</p>}
        {rs?.data && (
          <Dl rows={[
            ["Entregables", rs.data.totales.total],
            ["Horas programadas", `${rs.data.totales.horas} h`],
            ["Semanas", rs.data.grupo.numero_semanas ?? "—"],
            ["Plantillas", g.num_plantilla_entregables ?? 0],
            ...(rs.data.totales.importadas > 0 ? ([["Importadas", `${rs.data.totales.importadas} desde Excel`]] as [string, ReactNode][]) : []),
            ...(rs.data.totales.con_ajustes > 0 ? ([["Con ajuste", rs.data.totales.con_ajustes]] as [string, ReactNode][]) : []),
          ]} />
        )}
        <div className="b2-insp-acc b2-insp-acc-0">
          <button type="button" className="b2-btn" onClick={() => verPlantillas(g)}>Ver plantillas y semanas</button>
        </div>
        <div className="b2-adm-tareas-dh">
          <h3 className="b2-insp-sub">Docentes ({lista.length})</h3>
          <button type="button" className="b2-btn b2-btn-sm" onClick={() => openAssign(g.id)}>Asignar docente</button>
        </div>
        {lista.length === 0 ? (
          <p className="b2-insp-p">Sin docentes asignados.</p>
        ) : (
          <ul className="b2-adm-lista" aria-label={`Docentes de ${g.nombre}`}>
            {lista.map((d) => (
              <li key={d.id}>
                <span>
                  <span className="b2-tt">{d.name}</span>
                  <span className="b2-sub">{d.regional || "Sin regional"} · {tipoIsNuevo(d.tipo_docente) ? "Nuevo" : "Antiguo"}</span>
                  {d.link_drive && <a className="b2-sub b2-link" href={d.link_drive} target="_blank" rel="noopener noreferrer">{d.link_drive}</a>}
                </span>
                <span className="b2-adm-tareas-ac">
                  <button type="button" className="b2-link-btn" aria-label={`Editar a ${d.name}`} onClick={() => openEdit(d, g.id)}>Editar</button>
                  <button type="button" className="b2-link-btn b2-link-peligro" aria-label={`Quitar a ${d.name} del grupo`} onClick={() => void quitarDelGrupo(d.id)}>Quitar del grupo</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEditGrupo(g)}>Editar grupo</button>
          <button type="button" className="b2-btn" onClick={() => void eliminarGrupo(g)}>Eliminar grupo</button>
          <button type="button" className="b2-btn b2-btn-ghost" onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    );
  } else if (modo?.k === "crear") {
    const { lista, nodo } = camposGrupo(grupoForm, setGrupoForm, { semestreReadonly: false, aviso: false, mensajeSemestre: "Semestre inválido. Use formato 2026A o 2026B.", prefix: "gm-new" });
    abierto = true;
    etiquetaInsp = "crear";
    inspector = (
      <FormInspector sup="Tareas semanales" titulo="Nuevo grupo matriz" onCerrar={cerrar} onGuardar={() => void handleCrearGrupo()} guardando={savingGrupo} etiquetaGuardar="Crear grupo" errores={lista}>
        {nodo}
      </FormInspector>
    );
  } else if (modo?.k === "editar" && grupoModo) {
    const { lista, nodo } = camposGrupo(grupoEditForm, setGrupoEditForm, { semestreReadonly: grupoEditNumDocentes > 0, aviso: grupoEditNumDocentes > 0, mensajeSemestre: "Semestre inválido.", prefix: "gm-edit" });
    abierto = true;
    etiquetaInsp = `editar-${grupoModo.id}`;
    inspector = (
      <FormInspector sup="Grupo matriz" titulo="Editar grupo matriz" onCerrar={() => abrirVer(grupoModo.id)} onGuardar={() => void handleGuardarGrupo()} guardando={savingGrupo} etiquetaGuardar="Guardar cambios" errores={lista}>
        {nodo}
      </FormInspector>
    );
  } else if (modo?.k === "clonar") {
    const err = intento ? erroresClon() : {};
    const lista = Object.values(err).filter(Boolean) as string[];
    abierto = true;
    etiquetaInsp = "clonar";
    inspector = (
      <FormInspector sup="Tareas semanales" titulo="Clonar semestre" onCerrar={cerrar} onGuardar={() => void handleClonarSemestre()} guardando={cloning} etiquetaGuardar="Clonar semestre" errores={lista}>
        <p className="b2-insp-p">Copia los grupos (y opcionalmente sus plantillas) a un semestre nuevo.</p>
        <Grupo>
          <Campo etiqueta="Semestre origen" error={err.origen}>
            {(p) => (
              <select {...p} className="b2-sel" value={cloneOrigen} onChange={(e) => setCloneOrigen(e.target.value)}>
                {opcionesSemestre.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Semestre destino" error={err.destino}>
            {(p) => <input {...p} className="b2-input" value={cloneDestino} onChange={(e) => setCloneDestino(e.target.value.toUpperCase())} placeholder="Ej.: 2026B" />}
          </Campo>
          <Campo etiqueta="Fecha de inicio" error={err.fechas}>
            {(p) => <input {...p} type="date" className="b2-input" value={cloneFechaInicio} onChange={(e) => setCloneFechaInicio(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Fecha de finalización">
            {(p) => <input {...p} type="date" className="b2-input" min={cloneFechaInicio || undefined} value={cloneFechaFin} onChange={(e) => setCloneFechaFin(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Número de semanas" ancho="completo" error={err.semanas}>
            {(p) => <input {...p} type="number" min={1} max={53} className="b2-input" value={cloneNumeroSemanas} onChange={(e) => setCloneNumeroSemanas(e.target.value)} />}
          </Campo>
        </Grupo>
        <label className="b2-chk">
          <input type="checkbox" checked={clonePlantillas} onChange={(e) => setClonePlantillas(e.target.checked)} />
          Copiar también las plantillas de entregables
        </label>
        <label className="b2-chk">
          <input type="checkbox" checked={cloneActivar} onChange={(e) => setCloneActivar(e.target.checked)} />
          Establecer el nuevo semestre como activo
        </label>
        <p className="b2-nota-aviso" data-t="ok" aria-live="polite">
          Se clonarán <strong>{clonePreviewCount}</strong> grupo{clonePreviewCount === 1 ? "" : "s"} del semestre <strong>{cloneOrigen || "—"}</strong>.
        </p>
      </FormInspector>
    );
  } else if (modo?.k === "asignar" && grupoModo) {
    abierto = true;
    etiquetaInsp = `asignar-${grupoModo.id}`;
    inspector = (
      <FormInspector sup={grupoModo.nombre} titulo="Asignar docente a grupo" onCerrar={() => abrirVer(grupoModo.id)} onGuardar={() => void handleAsignar()} guardando={false} etiquetaGuardar="Asignar" deshabilitarGuardar={assignDocenteId === ""}>
        <Campo etiqueta="Docente">
          {(p) => (
            <select {...p} className="b2-sel" value={assignDocenteId === "" ? "" : String(assignDocenteId)} onChange={(e) => setAssignDocenteId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Seleccionar…</option>
              {candidatosAsignar.map((d) => <option key={d.id} value={d.id}>{`${d.name} — ${d.program}`}</option>)}
            </select>
          )}
        </Campo>
        {selectedCandidato && (
          <Dl rows={[
            ["Nombre", selectedCandidato.name],
            ["Programa", selectedCandidato.program],
            ["Regional", selectedCandidato.regional || "—"],
          ]} />
        )}
      </FormInspector>
    );
  } else if (modo?.k === "docente" && grupoModo && editDocente) {
    abierto = true;
    etiquetaInsp = `docente-${editDocente.id}`;
    inspector = (
      <FormInspector sup={editDocente.name} titulo="Editar docente" onCerrar={() => abrirVer(grupoModo.id)} onGuardar={() => void handleGuardarEdit()} guardando={savingEdit} etiquetaGuardar="Guardar">
        <div className="b2-campo-f" role="radiogroup" aria-label="Tipo docente">
          <span className="b2-label">Tipo docente</span>
          <div className="b2-radios">
            {(["ANTIGUO", "NUEVO"] as const).map((t) => (
              <label key={t}>
                <input type="radio" name="tipo_doc" checked={editTipo === t} onChange={() => setEditTipo(t)} />
                {t === "ANTIGUO" ? "Antiguo" : "Nuevo"}
              </label>
            ))}
          </div>
        </div>
        <Campo etiqueta="Regional">
          {(p) => <input {...p} className="b2-input" value={editRegional} onChange={(e) => setEditRegional(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Enlace Drive">
          {(p) => <input {...p} type="url" className="b2-input" value={editLink} onChange={(e) => setEditLink(e.target.value)} />}
        </Campo>
      </FormInspector>
    );
  }

  const acciones = semestreActivo ? (
    <>
      <button type="button" className="b2-btn" onClick={openCloneSemestre}>Clonar semestre</button>
      <button type="button" className="b2-btn b2-btn-primary" onClick={openCreateGrupo}>Nuevo grupo</button>
    </>
  ) : null;

  if (!semestreActivo) {
    return (
      <AdmPagina tab="tareas" cabecera={cabecera} titulo="Tareas semanales" subtitulo="Grupos de matriz, carga académica y cronogramas por semestre." inspectorAbierto={false} inspectorEtiqueta="" onCerrarInspector={cerrar}>
        {loading ? <Cargando etiqueta="Inicializando semestre…" /> : (
          <Vacio titulo="No hay un semestre configurado">Crea un semestre en la pestaña «Semestres» para gestionar grupos y tareas.</Vacio>
        )}
        {dialogo}
      </AdmPagina>
    );
  }

  return (
    <AdmPagina
      tab="tareas"
      cabecera={cabecera}
      titulo="Tareas semanales"
      subtitulo="Grupos de matriz, carga académica y cronogramas por semestre."
      acciones={acciones}
      inspector={inspector}
      inspectorAbierto={abierto}
      inspectorEtiqueta={etiquetaInsp}
      onCerrarInspector={cerrar}
      ancho
    >
      <Barra contador={loading ? "Cargando…" : `${grupos.length} grupo${grupos.length === 1 ? "" : "s"}`}>
        <Filtro value={semestreActivo} onChange={(v) => { cerrar(); setSemestreActivo(v); }} etiqueta="Semestre" ancho={130}>
          {opcionesSemestre.map((s) => <option key={s} value={s}>{s}</option>)}
        </Filtro>
        {esActivo ? (
          <Estado kind="encurso" label="Semestre activo" />
        ) : (
          <button type="button" className="b2-btn b2-btn-sm" disabled={activatingSemester} onClick={() => void handleActivarSemestre()}>
            {activatingSemester ? "Activando…" : "Establecer como activo"}
          </button>
        )}
      </Barra>

      <Resumen items={[
        { k: "Total de grupos", v: resumen.totalGrupos },
        { k: "Grupos antiguo", v: resumen.antiguo },
        { k: "Grupos nuevo", v: resumen.nuevo },
        { k: "Docentes sin grupo", v: resumen.sinGrupo, alerta: resumen.sinGrupo > 0 },
      ]} />

      {loadError && <ErrorCarga onReintentar={() => void loadAll()}>No se pudo cargar la información de grupos.</ErrorCarga>}

      <DataTable
        etiqueta={`Grupos matriz del semestre ${semestreActivo}`}
        cols={cols}
        rows={grupos}
        getKey={(g) => g.id}
        selId={modo && "id" in modo ? modo.id : null}
        onSelect={(g) => (g ? abrirVer(g.id) : cerrar())}
        cargando={loading}
        vacio={
          loadError ? "No hay datos para mostrar." : (
            <Vacio titulo={`Sin grupos en ${semestreActivo}`} accion={<button type="button" className="b2-btn b2-btn-sm b2-btn-primary" onClick={openCreateGrupo}>Nuevo grupo</button>}>
              Crea un grupo o clona los de otro semestre.
            </Vacio>
          )
        }
        filaMovil={(g) => ({
          titulo: g.nombre,
          lineas: [`${g.horas_totales ?? "—"} h · ${g.num_proyectos ?? 0} proyectos · ${g.num_actividades ?? 0} actividades`, `${g.num_docentes ?? 0} docentes · ${g.num_plantilla_entregables ?? 0} plantillas`],
          lado: <TipoTag tipo={g.tipo_docente} />,
        })}
        acciones={(g) => [
          { label: "Ver detalle", onSelect: () => abrirVer(g.id) },
          { label: "Editar grupo", onSelect: () => openEditGrupo(g) },
          { label: "Asignar docente", onSelect: () => openAssign(g.id) },
          { label: "Ver plantillas y semanas", onSelect: () => verPlantillas(g) },
          "sep",
          { label: "Eliminar grupo", danger: true, onSelect: () => void eliminarGrupo(g) },
        ]}
      />
      {dialogo}
    </AdmPagina>
  );
}
