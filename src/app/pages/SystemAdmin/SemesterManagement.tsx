import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import {
  AdmPagina, Campo, DataTable, ErrorCarga, FormInspector, Grupo, Resumen, Vacio, fechaCorta, soloFecha, useConfirmar,
  type Col,
} from "../../components/b2/admin-ui";
import { Dl, Estado } from "../../components/b2/ui";

type Semester = {
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semanas: number;
  activo: boolean;
  num_grupos: number;
  num_plantillas: number;
  num_docentes: number;
  num_reportes: number;
};

type SemesterForm = {
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semanas: string;
  activo: boolean;
};

const emptyForm: SemesterForm = {
  codigo: "",
  fecha_inicio: "",
  fecha_fin: "",
  numero_semanas: "16",
  activo: false,
};

type Modo = { t: "ver"; codigo: string } | { t: "editar"; codigo: string } | { t: "crear" } | null;

const dateOnly = soloFecha;

/** Mismas reglas que el guardado original; devuelve los mensajes por campo. */
function validar(form: SemesterForm) {
  const e: { codigo?: string; fechas?: string; semanas?: string } = {};
  const codigo = form.codigo.trim().toUpperCase();
  const weeks = Number(form.numero_semanas);
  if (!/^\d{4}[AB]$/.test(codigo)) e.codigo = "El código debe tener formato YYYYA o YYYYB.";
  if (!form.fecha_inicio || !form.fecha_fin || form.fecha_fin < form.fecha_inicio) e.fechas = "Indica un rango de fechas válido.";
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 53) e.semanas = "El número de semanas debe estar entre 1 y 53.";
  return e;
}

export default function SemesterManagement({ cabecera }: { cabecera: ReactNode }) {
  const navigate = useNavigate();
  const { confirmar: requestConfirmation, dialogo } = useConfirmar();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>(null);
  const [form, setForm] = useState<SemesterForm>(emptyForm);
  const [intento, setIntento] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadSemesters = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const response = await fetch(`${API_BASE}/admin/semestres`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSemesters(data.detalle || []);
    } catch {
      setSemesters([]);
      setLoadError(true);
      notify.error("No se pudieron cargar los semestres.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSemesters();
  }, []);

  const seleccionado = useMemo(
    () => (modo && modo.t !== "crear" ? semesters.find((s) => s.codigo === modo.codigo) ?? null : null),
    [modo, semesters]
  );
  // Si el semestre seleccionado desaparece (p. ej. tras eliminarlo), se cierra el inspector.
  useEffect(() => {
    if (modo && modo.t !== "crear" && !loading && !seleccionado) setModo(null);
  }, [modo, loading, seleccionado]);

  const errores = useMemo(() => validar(form), [form]);
  const listaErrores = intento ? Object.values(errores) : [];

  const openCreate = () => {
    setForm(emptyForm);
    setIntento(false);
    setModo({ t: "crear" });
  };

  const openEdit = (semester: Semester) => {
    setForm({
      codigo: semester.codigo,
      fecha_inicio: dateOnly(semester.fecha_inicio),
      fecha_fin: dateOnly(semester.fecha_fin),
      numero_semanas: String(semester.numero_semanas),
      activo: semester.activo,
    });
    setIntento(false);
    setModo({ t: "editar", codigo: semester.codigo });
  };

  const editing = modo?.t === "editar" ? seleccionado : null;

  const saveSemester = async () => {
    const codigo = form.codigo.trim().toUpperCase();
    const weeks = Number(form.numero_semanas);
    const err = validar(form);
    if (err.codigo || err.fechas || err.semanas) {
      setIntento(true);
      notify.warning((err.codigo || err.fechas || err.semanas) as string);
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        editing
          ? `${API_BASE}/admin/semestres/${encodeURIComponent(editing.codigo)}`
          : `${API_BASE}/admin/semestres`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo,
            fecha_inicio: form.fecha_inicio,
            fecha_fin: form.fecha_fin,
            numero_semanas: weeks,
            activo: editing ? undefined : form.activo,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data.error || "No se pudo guardar el semestre.");
        return;
      }
      const eraEdicion = !!editing;
      setModo(eraEdicion ? { t: "ver", codigo } : null);
      await loadSemesters();
      notify.success(eraEdicion ? "Semestre actualizado" : "Semestre creado");
    } catch {
      notify.error("Error de conexión al guardar el semestre.");
    } finally {
      setSaving(false);
    }
  };

  const activateSemester = async (semester: Semester) => {
    if (semester.activo) return;
    const accepted = await requestConfirmation({
      titulo: "Activar semestre",
      descripcion: `${semester.codigo} pasará a ser el periodo activo para toda la aplicación.`,
      etiqueta: "Activar",
      tono: "primario",
    });
    if (!accepted) return;
    try {
      setBusyCode(semester.codigo);
      const response = await fetch(
        `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}/activar`,
        { method: "PUT" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data.error || "No se pudo activar el semestre.");
        return;
      }
      await loadSemesters();
      notify.success(`${semester.codigo} es ahora el semestre activo`);
    } catch {
      notify.error("Error de conexión al activar el semestre.");
    } finally {
      setBusyCode(null);
    }
  };

  const deleteSemester = async (semester: Semester) => {
    const accepted = await requestConfirmation({
      titulo: "Eliminar semestre",
      descripcion: `¿Deseas eliminar el semestre ${semester.codigo}?`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    setBusyCode(semester.codigo);
    try {
      let response = await fetch(
        `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}`,
        { method: "DELETE" }
      );
      let data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.requiere_confirmacion) {
        const summary = data.resumen || {};
        const forceAccepted = await requestConfirmation({
          titulo: "Eliminar semestre y datos relacionados",
          descripcion:
            `Este semestre contiene ${summary.grupos || 0} grupos, ${summary.plantillas || 0} plantillas, ` +
            `${summary.docentes || 0} docentes asignados y ${summary.reportes || 0} reportes vinculados. ` +
            "Los docentes quedarán sin grupo y esta eliminación no se puede deshacer.",
          etiqueta: "Eliminar todo",
          tono: "peligro",
        });
        if (!forceAccepted) return;
        response = await fetch(
          `${API_BASE}/admin/semestres/${encodeURIComponent(semester.codigo)}?forzar=true`,
          { method: "DELETE" }
        );
        data = await response.json().catch(() => ({}));
      }
      if (!response.ok) {
        notify.error(data.error || "No se pudo eliminar el semestre.");
        return;
      }
      await loadSemesters();
      notify.success("Semestre eliminado");
    } catch {
      notify.error("Error de conexión al eliminar el semestre.");
    } finally {
      setBusyCode(null);
    }
  };

  const cerrar = () => setModo(null);
  const ayudaActivo = "No se puede eliminar el semestre activo; activa otro primero.";

  const cols: Col<Semester>[] = [
    { id: "codigo", titulo: "Semestre", ancho: "90px", celda: (s) => <strong>{s.codigo}</strong> },
    { id: "fechas", titulo: "Fechas", ancho: "minmax(190px, 1fr)", celda: (s) => <span className="b2-fch">{fechaCorta(s.fecha_inicio)} – {fechaCorta(s.fecha_fin)}</span> },
    { id: "semanas", titulo: "Semanas", ancho: "70px", prioridad: 2, num: true, celda: (s) => s.numero_semanas || 0 },
    { id: "grupos", titulo: "Grupos", ancho: "70px", prioridad: 2, num: true, celda: (s) => s.num_grupos || 0 },
    { id: "plantillas", titulo: "Plantillas", ancho: "84px", prioridad: 3, num: true, celda: (s) => s.num_plantillas || 0 },
    { id: "docentes", titulo: "Docentes", ancho: "80px", prioridad: 3, num: true, celda: (s) => s.num_docentes || 0 },
    { id: "reportes", titulo: "Reportes", ancho: "80px", prioridad: 3, num: true, celda: (s) => s.num_reportes || 0 },
    {
      id: "estado", titulo: "Estado", ancho: "110px",
      celda: (s) =>
        s.activo ? (
          <Estado kind="encurso" label="Activo" />
        ) : (
          <button
            type="button"
            className="b2-btn b2-btn-sm"
            disabled={busyCode === s.codigo}
            aria-label={`Activar semestre ${s.codigo}`}
            onClick={(e) => { e.stopPropagation(); void activateSemester(s); }}
          >
            Activar
          </button>
        ),
    },
  ];

  const inspector = (() => {
    if (modo?.t === "crear" || (modo?.t === "editar" && editing)) {
      const esEdicion = modo.t === "editar";
      return (
        <FormInspector
          sup="Semestre"
          titulo={esEdicion ? "Editar semestre" : "Nuevo semestre"}
          onCerrar={cerrar}
          onGuardar={() => void saveSemester()}
          guardando={saving}
          etiquetaGuardar="Guardar semestre"
          errores={listaErrores}
        >
          <Grupo>
            <Campo etiqueta="Código" obligatorio error={intento ? errores.codigo : null} ayuda="Formato AAAAA o AAAAB, por ejemplo 2026B." ancho="completo">
              {(p) => (
                <input
                  {...p}
                  className="b2-input"
                  value={form.codigo}
                  maxLength={5}
                  onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))}
                  placeholder="2026B"
                />
              )}
            </Campo>
            <Campo etiqueta="Inicio" obligatorio error={intento && errores.fechas && !form.fecha_inicio ? "Indica la fecha de inicio." : null}>
              {(p) => (
                <input
                  {...p}
                  className="b2-input"
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))}
                />
              )}
            </Campo>
            <Campo etiqueta="Finalización" obligatorio error={intento && errores.fechas && (!form.fecha_fin || form.fecha_fin < form.fecha_inicio) ? (form.fecha_fin ? "La fecha final no puede ser anterior a la inicial." : "Indica la fecha de finalización.") : null}>
              {(p) => (
                <input
                  {...p}
                  className="b2-input"
                  type="date"
                  min={form.fecha_inicio || undefined}
                  value={form.fecha_fin}
                  onChange={(event) => setForm((current) => ({ ...current, fecha_fin: event.target.value }))}
                />
              )}
            </Campo>
            <Campo etiqueta="Número de semanas" obligatorio error={intento ? errores.semanas : null} ayuda="Entre 1 y 53." ancho="completo">
              {(p) => (
                <input
                  {...p}
                  className="b2-input"
                  type="number"
                  min={1}
                  max={53}
                  value={form.numero_semanas}
                  onChange={(event) => setForm((current) => ({ ...current, numero_semanas: event.target.value }))}
                />
              )}
            </Campo>
          </Grupo>
          {!esEdicion && (
            <label className="b2-chk">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(event) => setForm((current) => ({ ...current, activo: event.target.checked }))}
              />
              Establecer como semestre activo
            </label>
          )}
        </FormInspector>
      );
    }
    if (modo?.t === "ver" && seleccionado) {
      const s = seleccionado;
      return (
        <div className="b2-insp-c">
          <p className="b2-insp-sup">Semestre</p>
          <h2 className="b2-insp-h">{s.codigo}</h2>
          <div className="b2-insp-estado">
            {s.activo ? <Estado kind="encurso" label="Semestre activo" /> : <Estado kind="porhacer" label="Inactivo" />}
          </div>
          <h3 className="b2-insp-sub">Periodo</h3>
          <Dl rows={[
            ["Inicio", fechaCorta(s.fecha_inicio)],
            ["Fin", fechaCorta(s.fecha_fin)],
            ["Duración", `${s.numero_semanas || 0} semanas`],
          ]} />
          <h3 className="b2-insp-sub">Contenido</h3>
          <Dl rows={[
            ["Grupos", String(s.num_grupos || 0)],
            ["Plantillas", String(s.num_plantillas || 0)],
            ["Docentes", String(s.num_docentes || 0)],
            ["Reportes", String(s.num_reportes || 0)],
          ]} />
          <div className="b2-insp-acc">
            <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEdit(s)}>Editar</button>
            {!s.activo && (
              <button type="button" className="b2-btn" disabled={busyCode === s.codigo} onClick={() => void activateSemester(s)}>Activar</button>
            )}
            <button
              type="button"
              className="b2-btn"
              onClick={() => navigate("/admin/sistema?tab=tareas")}
              title="La clonación de grupos y plantillas está en Tareas semanales"
            >
              Clonar este semestre
            </button>
            <button type="button" className="b2-btn b2-btn-ghost" onClick={cerrar}>Cerrar</button>
          </div>
          <div className="b2-acc-form">
            <h3>Eliminar semestre</h3>
            {s.activo ? (
              <p className="b2-sub" style={{ whiteSpace: "normal" }}>{ayudaActivo}</p>
            ) : (
              <p className="b2-sub" style={{ whiteSpace: "normal" }}>Si tiene grupos, plantillas o reportes se pedirá una segunda confirmación con el resumen.</p>
            )}
            <div className="b2-acc-fila">
              <button
                type="button"
                className="b2-btn b2-btn-peligro"
                disabled={s.activo || busyCode === s.codigo}
                title={s.activo ? ayudaActivo : undefined}
                onClick={() => void deleteSemester(s)}
              >
                Eliminar semestre
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  })();

  const total = semesters.length;
  const activo = semesters.find((s) => s.activo);

  return (
    <AdmPagina
      tab="semestres"
      cabecera={cabecera}
      titulo="Calendario de semestres"
      subtitulo="Crea, edita, activa o elimina periodos. La clonación de grupos está en Tareas semanales."
      acciones={<button type="button" className="b2-btn b2-btn-primary" onClick={openCreate}>Nuevo semestre</button>}
      inspector={inspector}
      inspectorAbierto={!!inspector}
      inspectorEtiqueta={modo ? `${modo.t}-${"codigo" in modo ? modo.codigo : "nuevo"}` : ""}
      onCerrarInspector={cerrar}
      ancho
    >
      {loadError && <ErrorCarga onReintentar={() => void loadSemesters()}>No se pudieron cargar los semestres.</ErrorCarga>}
      {!loading && !loadError && total > 0 && (
        <Resumen items={[
          { k: "Semestres", v: total },
          { k: "Activo", v: activo?.codigo ?? "—" },
          { k: "Grupos", v: semesters.reduce((a, s) => a + (s.num_grupos || 0), 0) },
          { k: "Docentes", v: semesters.reduce((a, s) => a + (s.num_docentes || 0), 0) },
        ]} />
      )}
      <DataTable
        etiqueta="Semestres"
        cols={cols}
        rows={semesters}
        getKey={(s) => s.codigo}
        selId={modo && modo.t !== "crear" ? modo.codigo : null}
        onSelect={(s) => { if (s) setModo({ t: "ver", codigo: s.codigo }); else cerrar(); }}
        cargando={loading}
        ocupado={busyCode != null}
        vacio={
          loadError ? "No se pudo cargar el listado." : (
            <Vacio
              titulo="No hay semestres configurados"
              accion={<button type="button" className="b2-btn b2-btn-primary" onClick={openCreate}>Crear el primer semestre</button>}
            >
              Crea un semestre para poder organizar grupos, plantillas y reportes.
            </Vacio>
          )
        }
        filaMovil={(s) => ({
          titulo: s.codigo,
          lineas: [
            `${fechaCorta(s.fecha_inicio)} – ${fechaCorta(s.fecha_fin)} · ${s.numero_semanas || 0} semanas`,
            `${s.num_grupos || 0} grupos · ${s.num_docentes || 0} docentes · ${s.num_reportes || 0} reportes`,
          ],
          lado: s.activo ? <Estado kind="encurso" label="Activo" /> : <span className="b2-sub">Inactivo</span>,
        })}
        acciones={(s) => [
          { label: "Editar", onSelect: () => openEdit(s) },
          ...(s.activo ? [] : [{ label: "Activar", onSelect: () => void activateSemester(s), disabled: busyCode === s.codigo }]),
          "sep" as const,
          { label: s.activo ? "Eliminar (semestre activo)" : "Eliminar", onSelect: () => void deleteSemester(s), disabled: s.activo || busyCode === s.codigo, danger: true },
        ]}
      />
      {dialogo}
    </AdmPagina>
  );
}
