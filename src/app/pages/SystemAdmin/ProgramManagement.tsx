import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AdmPagina, Barra, Buscar, Campo, DataTable, ErrorCarga, FormInspector, Grupo, Vacio, useConfirmar, type Col,
} from "../../components/b2/admin-ui";
import { Dl } from "../../components/b2/ui";
import { IMas } from "../../components/b2/icons";
import { useMedia } from "../../components/b2/matriz-util";
import { API_BASE, apiFetch as fetch } from "../../config/api";
import { notify } from "../../lib/notify";
import "../../components/b2/b2-admin-programas.css";

type Escuela = {
  id: number;
  nombre: string;
  codigo: string | null;
  num_programas?: number;
};

type Programa = {
  id: number;
  nombre: string;
  codigo: string | null;
  escuela_id: number | null;
  escuela: string;
};

type ProgramaForm = {
  nombre: string;
  codigo: string;
  escuela_id: string;
};

type EscuelaForm = {
  nombre: string;
  codigo: string;
};

const emptyPrograma: ProgramaForm = { nombre: "", codigo: "", escuela_id: "" };
const emptyEscuela: EscuelaForm = { nombre: "", codigo: "" };

type Modo = "ver" | "editar" | "crear";
type Insp = { k: "escuela" | "programa"; m: Modo; id?: number } | null;

export default function ProgramManagement({ cabecera }: { cabecera: ReactNode }) {
  const { confirmar, dialogo } = useConfirmar();
  const movil = useMedia("(max-width: 720px)");
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<Programa | null>(null);
  const [form, setForm] = useState<ProgramaForm>(emptyPrograma);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [escuelaForm, setEscuelaForm] = useState<EscuelaForm>(emptyEscuela);
  const [editingEscuela, setEditingEscuela] = useState<Escuela | null>(null);
  const [savingEscuela, setSavingEscuela] = useState(false);
  const [deletingEscuelaId, setDeletingEscuelaId] = useState<number | null>(null);

  // Presentación: selección de escuela, búsqueda e inspector
  const [escuelaSel, setEscuelaSel] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [insp, setInsp] = useState<Insp>(null);
  const [intentado, setIntentado] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const [progRes, escRes] = await Promise.all([
        fetch(`${API_BASE}/admin/programas`),
        fetch(`${API_BASE}/admin/escuelas`),
      ]);
      if (!progRes.ok || !escRes.ok) throw new Error();
      const progData = await progRes.json();
      const escData = await escRes.json();
      setProgramas(progData.programas || []);
      setEscuelas(escData.escuelas || []);
    } catch {
      setProgramas([]);
      setEscuelas([]);
      setLoadError(true);
      notify.error("No se pudo cargar el catálogo de escuelas y programas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const cerrarInsp = () => {
    setInsp(null);
    setIntentado(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyPrograma, escuela_id: escuelaSel != null ? String(escuelaSel) : "" });
    setIntentado(false);
    setInsp({ k: "programa", m: "crear" });
  };

  const openEdit = (programa: Programa) => {
    setEditing(programa);
    setForm({
      nombre: programa.nombre,
      codigo: programa.codigo || "",
      escuela_id: programa.escuela_id != null ? String(programa.escuela_id) : "",
    });
    setIntentado(false);
    setInsp({ k: "programa", m: "editar", id: programa.id });
  };

  const savePrograma = async () => {
    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      escuela_id: Number(form.escuela_id),
    };
    if (!payload.nombre || !payload.codigo || !payload.escuela_id) {
      setIntentado(true);
      notify.warning("Código, nombre y escuela son obligatorios.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        editing ? `${API_BASE}/admin/programas/${editing.id}` : `${API_BASE}/admin/programas`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo guardar el programa.");
        return;
      }
      cerrarInsp();
      await loadAll();
      notify.success(editing ? "Cambios guardados" : "Programa creado");
    } catch {
      notify.error("Error de conexión al guardar el programa.");
    } finally {
      setSaving(false);
    }
  };

  const deletePrograma = async (programa: Programa) => {
    const accepted = await confirmar({
      titulo: "Eliminar programa",
      descripcion: `¿Deseas eliminar «${programa.nombre}»? Esta acción no se puede deshacer.`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    try {
      setDeletingId(programa.id);
      const response = await fetch(`${API_BASE}/admin/programas/${programa.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo eliminar el programa.");
        return;
      }
      setInsp((cur) => (cur && cur.k === "programa" && cur.id === programa.id ? null : cur));
      await loadAll();
      notify.success("Programa eliminado");
    } catch {
      notify.error("Error de conexión al eliminar el programa.");
    } finally {
      setDeletingId(null);
    }
  };

  const openNewEscuela = () => {
    setEditingEscuela(null);
    setEscuelaForm(emptyEscuela);
    setIntentado(false);
    setInsp({ k: "escuela", m: "crear" });
  };

  const openEditEscuela = (escuela: Escuela) => {
    setEditingEscuela(escuela);
    setEscuelaForm({
      nombre: escuela.nombre,
      codigo: escuela.codigo || "",
    });
    setIntentado(false);
    setInsp({ k: "escuela", m: "editar", id: escuela.id });
  };

  const saveEscuela = async () => {
    const payload = {
      nombre: escuelaForm.nombre.trim(),
      codigo: escuelaForm.codigo.trim().toUpperCase(),
    };
    if (!payload.nombre) {
      setIntentado(true);
      notify.warning("El nombre de la escuela es obligatorio.");
      return;
    }
    try {
      setSavingEscuela(true);
      const response = await fetch(
        editingEscuela
          ? `${API_BASE}/admin/escuelas/${editingEscuela.id}`
          : `${API_BASE}/admin/escuelas`,
        {
          method: editingEscuela ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo guardar la escuela.");
        return;
      }
      cerrarInsp();
      await loadAll();
      notify.success(editingEscuela ? "Escuela actualizada" : "Escuela creada");
    } catch {
      notify.error("Error de conexión al guardar la escuela.");
    } finally {
      setSavingEscuela(false);
    }
  };

  const deleteEscuela = async (escuela: Escuela) => {
    const accepted = await confirmar({
      titulo: "Eliminar escuela",
      descripcion: `¿Deseas eliminar «${escuela.nombre}»? Solo será posible si no tiene programas asociados.`,
      etiqueta: "Eliminar",
      tono: "peligro",
    });
    if (!accepted) return;
    try {
      setDeletingEscuelaId(escuela.id);
      const response = await fetch(`${API_BASE}/admin/escuelas/${escuela.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        notify.error(data.error || "No se pudo eliminar la escuela.");
        return;
      }
      setInsp((cur) => (cur && cur.k === "escuela" && cur.id === escuela.id ? null : cur));
      setEscuelaSel((cur) => (cur === escuela.id ? null : cur));
      await loadAll();
      notify.success("Escuela eliminada");
    } catch {
      notify.error("Error de conexión al eliminar la escuela.");
    } finally {
      setDeletingEscuelaId(null);
    }
  };

  /* ───────── derivados de presentación ───────── */
  const conteo = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of programas) if (p.escuela_id != null) m.set(p.escuela_id, (m.get(p.escuela_id) ?? 0) + 1);
    return m;
  }, [programas]);
  const nProgramas = (e: Escuela) => Math.max(conteo.get(e.id) ?? 0, e.num_programas ?? 0);

  const hayFiltros = busqueda.trim() !== "";
  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return programas.filter((p) => {
      if (escuelaSel != null && p.escuela_id !== escuelaSel) return false;
      if (!t) return true;
      return [p.nombre, p.codigo ?? "", p.escuela].some((v) => v.toLowerCase().includes(t));
    });
  }, [programas, escuelaSel, busqueda]);

  const escuelaActual = escuelas.find((e) => e.id === escuelaSel) ?? null;
  const escuelaInsp = insp?.k === "escuela" && insp.id != null ? escuelas.find((e) => e.id === insp.id) ?? null : null;
  const programaInsp = insp?.k === "programa" && insp.id != null ? programas.find((p) => p.id === insp.id) ?? null : null;

  const elegirEscuela = (e: Escuela | null) => {
    setEscuelaSel(e ? e.id : null);
    if (e) {
      setIntentado(false);
      setInsp({ k: "escuela", m: "ver", id: e.id });
    } else if (insp?.k === "escuela" && insp.m === "ver") {
      cerrarInsp();
    }
  };

  const cols: Col<Programa>[] = [
    { id: "codigo", titulo: "Código", ancho: "110px", celda: (p) => <span className="b2-muted">{p.codigo || "—"}</span> },
    { id: "nombre", titulo: "Programa", ancho: "minmax(220px, 1fr)", celda: (p) => <span className="b2-tt" title={p.nombre} style={{ fontWeight: 700 }}>{p.nombre}</span> },
    { id: "escuela", titulo: "Escuela", ancho: "minmax(180px, 260px)", prioridad: 2, celda: (p) => <span className="b2-tt" title={p.escuela}>{p.escuela || "—"}</span> },
  ];

  /* ───────── inspector ───────── */
  let inspector: ReactNode = null;
  let inspLabel = "";

  if (insp?.k === "programa" && insp.m !== "ver") {
    const nombreErr = intentado && !form.nombre.trim() ? "El nombre es obligatorio." : null;
    const codigoErr = intentado && !form.codigo.trim() ? "El código es obligatorio." : null;
    const escuelaErr = intentado && !Number(form.escuela_id) ? "Selecciona una escuela." : null;
    inspLabel = `programa-${insp.m}-${insp.id ?? "nuevo"}`;
    inspector = (
      <FormInspector
        key={inspLabel}
        sup="Programa"
        titulo={editing ? "Editar programa" : "Nuevo programa"}
        onCerrar={() => (editing ? setInsp({ k: "programa", m: "ver", id: editing.id }) : cerrarInsp())}
        onGuardar={() => void savePrograma()}
        guardando={saving}
        etiquetaGuardar="Guardar programa"
        errores={[codigoErr, nombreErr, escuelaErr].filter((x): x is string => !!x)}
      >
        <Grupo>
          <Campo etiqueta="Código" obligatorio error={codigoErr} ancho="completo">
            {(a) => (
              <input {...a} className="b2-input" type="text" maxLength={50} value={form.codigo} placeholder="Ej. ING-SIS"
                onChange={(e) => setForm((c) => ({ ...c, codigo: e.target.value }))} />
            )}
          </Campo>
          <Campo etiqueta="Nombre" obligatorio error={nombreErr} ancho="completo">
            {(a) => (
              <input {...a} className="b2-input" type="text" maxLength={200} value={form.nombre} placeholder="Nombre institucional del programa"
                onChange={(e) => setForm((c) => ({ ...c, nombre: e.target.value }))} />
            )}
          </Campo>
          <Campo etiqueta="Escuela" obligatorio error={escuelaErr} ancho="completo">
            {(a) => (
              <select {...a} className="b2-sel" value={form.escuela_id} onChange={(e) => setForm((c) => ({ ...c, escuela_id: e.target.value }))}>
                <option value="">Seleccionar escuela…</option>
                {escuelas.map((e) => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
              </select>
            )}
          </Campo>
        </Grupo>
      </FormInspector>
    );
  } else if (insp?.k === "escuela" && insp.m !== "ver") {
    const nombreErr = intentado && !escuelaForm.nombre.trim() ? "El nombre de la escuela es obligatorio." : null;
    inspLabel = `escuela-${insp.m}-${insp.id ?? "nueva"}`;
    inspector = (
      <FormInspector
        key={inspLabel}
        sup="Escuela"
        titulo={editingEscuela ? "Editar escuela" : "Nueva escuela"}
        onCerrar={() => (editingEscuela ? setInsp({ k: "escuela", m: "ver", id: editingEscuela.id }) : cerrarInsp())}
        onGuardar={() => void saveEscuela()}
        guardando={savingEscuela}
        etiquetaGuardar="Guardar escuela"
        errores={nombreErr ? [nombreErr] : []}
      >
        <Grupo>
          <Campo etiqueta="Código" ayuda="Opcional. Se guarda en mayúsculas." ancho="completo">
            {(a) => (
              <input {...a} className="b2-input" type="text" maxLength={50} value={escuelaForm.codigo} placeholder="Opcional"
                onChange={(e) => setEscuelaForm((c) => ({ ...c, codigo: e.target.value }))} />
            )}
          </Campo>
          <Campo etiqueta="Nombre" obligatorio error={nombreErr} ancho="completo">
            {(a) => (
              <input {...a} className="b2-input" type="text" maxLength={200} value={escuelaForm.nombre} placeholder="Nombre institucional de la escuela"
                onChange={(e) => setEscuelaForm((c) => ({ ...c, nombre: e.target.value }))} />
            )}
          </Campo>
        </Grupo>
        <p className="b2-adm-prog-nota">Los programas se vinculan a una escuela.</p>
      </FormInspector>
    );
  } else if (insp?.k === "programa" && programaInsp) {
    inspLabel = `programa-ver-${programaInsp.id}`;
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">Programa · {programaInsp.codigo || "sin código"}</p>
        <h2 className="b2-insp-h">{programaInsp.nombre}</h2>
        <h3 className="b2-insp-sub">Datos</h3>
        <Dl rows={[
          ["Código", programaInsp.codigo || "—"],
          ["Programa", programaInsp.nombre],
          ["Escuela", programaInsp.escuela || "—"],
        ]} />
        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEdit(programaInsp)}>Editar programa</button>
          <button type="button" className="b2-btn b2-link-peligro" disabled={deletingId === programaInsp.id} onClick={() => void deletePrograma(programaInsp)}>Eliminar programa</button>
          <button type="button" className="b2-btn b2-btn-ghost" onClick={cerrarInsp}>Cerrar</button>
        </div>
      </div>
    );
  } else if (insp?.k === "escuela" && escuelaInsp) {
    const lista = programas.filter((p) => p.escuela_id === escuelaInsp.id);
    const bloqueada = nProgramas(escuelaInsp) > 0;
    inspLabel = `escuela-ver-${escuelaInsp.id}`;
    inspector = (
      <div className="b2-insp-c">
        <p className="b2-insp-sup">Escuela · {escuelaInsp.codigo || "sin código"}</p>
        <h2 className="b2-insp-h">{escuelaInsp.nombre}</h2>
        <h3 className="b2-insp-sub">Datos</h3>
        <Dl rows={[
          ["Código", escuelaInsp.codigo || "—"],
          ["Nombre", escuelaInsp.nombre],
          ["Programas", String(nProgramas(escuelaInsp))],
        ]} />
        <h3 className="b2-insp-sub">Programas de esta escuela</h3>
        {lista.length === 0 ? (
          <p className="b2-insp-p">Todavía no tiene programas.</p>
        ) : (
          <ul className="b2-adm-lista">
            {lista.map((p) => (
              <li key={p.id}>
                <span><span className="b2-tt">{p.nombre}</span><span className="b2-sub">{p.codigo || "—"}</span></span>
                <button type="button" className="b2-link" onClick={() => setInsp({ k: "programa", m: "ver", id: p.id })}>Ver</button>
              </li>
            ))}
          </ul>
        )}
        <div className="b2-insp-acc">
          <button type="button" className="b2-btn b2-btn-primary" onClick={() => openEditEscuela(escuelaInsp)}>Editar escuela</button>
          <button type="button" className="b2-btn" onClick={() => { setEscuelaSel(escuelaInsp.id); openNew(); }}>Nuevo programa aquí</button>
          <button type="button" className="b2-btn b2-link-peligro" disabled={bloqueada || deletingEscuelaId === escuelaInsp.id} onClick={() => void deleteEscuela(escuelaInsp)}>Eliminar escuela</button>
        </div>
        {bloqueada && <p className="b2-adm-prog-nota" style={{ marginTop: 8 }}>Solo es posible eliminarla si no tiene programas asociados.</p>}
      </div>
    );
  }

  /* ───────── vacío ───────── */
  const vacio = loadError ? (
    <Vacio titulo="No se pudo cargar el catálogo">Usa «Reintentar» para volver a consultar.</Vacio>
  ) : escuelas.length === 0 ? (
    <Vacio titulo="Aún no hay escuelas registradas" accion={<button type="button" className="b2-btn b2-btn-primary b2-btn-sm" onClick={openNewEscuela}>Crear escuela</button>}>
      Crea primero las escuelas reales de la institución; después podrás agregar sus programas.
    </Vacio>
  ) : hayFiltros ? (
    <Vacio titulo="Ningún programa coincide con la búsqueda" accion={<button type="button" className="b2-btn b2-btn-sm" onClick={() => setBusqueda("")}>Limpiar búsqueda</button>}>
      Prueba con otro término.
    </Vacio>
  ) : (
    <Vacio titulo={escuelaActual ? `${escuelaActual.nombre} aún no tiene programas` : "Aún no hay programas registrados"} accion={<button type="button" className="b2-btn b2-btn-primary b2-btn-sm" onClick={openNew}>Crear programa</button>}>
      Agrega únicamente los programas institucionales reales.
    </Vacio>
  );

  const acciones = (
    <>
      {movil && <button type="button" className="b2-btn" onClick={openNewEscuela}><IMas width={14} height={14} />Nueva escuela</button>}
      <button type="button" className="b2-btn b2-btn-primary" onClick={openNew} disabled={escuelas.length === 0}><IMas width={14} height={14} />Nuevo programa</button>
    </>
  );

  const barra = (
    <Barra contador={visibles.length === programas.length ? `${programas.length} ${programas.length === 1 ? "programa" : "programas"}` : `${visibles.length} de ${programas.length}`}>
      <Buscar value={busqueda} onChange={setBusqueda} placeholder="Buscar por código, programa o escuela" etiqueta="Buscar programas" />
      {hayFiltros && <button type="button" className="b2-btn b2-btn-sm b2-btn-ghost" onClick={() => setBusqueda("")}>Limpiar</button>}
    </Barra>
  );

  const tabla = (
    <DataTable<Programa>
      etiqueta="Programas"
      cols={cols}
      rows={visibles}
      getKey={(p) => p.id}
      selId={insp?.k === "programa" && insp.id != null ? insp.id : null}
      onSelect={(p) => (p ? setInsp({ k: "programa", m: "ver", id: p.id }) : cerrarInsp())}
      cargando={loading}
      vacio={vacio}
      filaMovil={(p) => ({ titulo: p.nombre, lineas: [`${p.codigo || "Sin código"} · ${p.escuela || "Sin escuela"}`] })}
      ocupado={deletingId != null}
      acciones={(p) => [
        { label: "Editar programa", onSelect: () => openEdit(p) },
        "sep",
        { label: "Eliminar programa", danger: true, disabled: deletingId === p.id, onSelect: () => void deletePrograma(p) },
      ]}
    />
  );

  return (
    <>
      <AdmPagina
        tab="programas"
        cabecera={cabecera}
        titulo="Escuelas y programas"
        subtitulo="Los programas pertenecen a una escuela; elige una escuela para ver los suyos."
        acciones={acciones}
        inspector={inspector}
        inspectorAbierto={inspector != null}
        inspectorEtiqueta={inspLabel}
        onCerrarInspector={cerrarInsp}
        ancho
      >
        {loadError && <ErrorCarga onReintentar={() => void loadAll()}>No se pudo cargar el catálogo de escuelas y programas.</ErrorCarga>}

        {movil ? (
          <div className="b2-adm-col b2-adm-prog-col">
            <div className="b2-adm-prog-movil">
              <div className="b2-adm-prog-movil-f">
                <select
                  className="b2-sel b2-adm-filtro"
                  aria-label="Filtrar por escuela"
                  value={escuelaSel != null ? String(escuelaSel) : ""}
                  onChange={(e) => setEscuelaSel(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todas las escuelas ({programas.length})</option>
                  {escuelas.map((e) => <option key={e.id} value={String(e.id)}>{e.nombre} ({nProgramas(e)})</option>)}
                </select>
                {escuelaActual && <button type="button" className="b2-btn" onClick={() => setInsp({ k: "escuela", m: "ver", id: escuelaActual.id })}>Ver escuela</button>}
              </div>
              {barra}
            </div>
            {tabla}
          </div>
        ) : (
          <div className="b2-adm-split">
            <nav className="b2-adm-lat" aria-label="Escuelas">
              <div className="b2-adm-lat-h">
                <div className="b2-adm-prog-lat-acc">
                  <h3>Escuelas</h3>
                  <button type="button" className="b2-btn b2-btn-sm" onClick={openNewEscuela}><IMas width={14} height={14} />Nueva escuela</button>
                </div>
              </div>
              <ul className="b2-adm-lat-l">
                <li className="b2-adm-prog-todas">
                  <button type="button" className="b2-adm-lat-i" aria-current={escuelaSel == null ? "true" : undefined} onClick={() => elegirEscuela(null)}>
                    <span><span className="b2-tt">Todas las escuelas</span></span>
                    <span className="b2-adm-lat-n">{programas.length}</span>
                  </button>
                </li>
                {loading && [80, 64, 72].map((w, i) => <li key={i} style={{ padding: "10px" }}><span className="b2-skel" style={{ width: `${w}%`, display: "block" }} /></li>)}
                {!loading && escuelas.length === 0 && <li className="b2-adm-vacio">No hay escuelas registradas.</li>}
                {escuelas.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="b2-adm-lat-i" aria-current={escuelaSel === e.id ? "true" : undefined} onClick={() => elegirEscuela(e)}>
                      <span><span className="b2-tt" title={e.nombre}>{e.nombre}</span><span className="b2-sub">{e.codigo || "Sin código"}</span></span>
                      <span className="b2-adm-lat-n">{nProgramas(e)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="b2-adm-col b2-adm-prog-col">
              {barra}
              {tabla}
            </div>
          </div>
        )}
      </AdmPagina>
      {dialogo}
    </>
  );
}
