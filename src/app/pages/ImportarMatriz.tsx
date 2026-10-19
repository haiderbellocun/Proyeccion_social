// Importador de matrices Excel — diseño B2. La lógica (análisis, validación sin escrituras, decisiones, confirmación,
// asignación e historial) es exactamente la de la versión anterior, conservada en ImportarMatrizTinta.tsx;
// aquí solo cambia la presentación. Endpoints: POST /admin/importaciones/{analizar,hoja,validar,confirmar}, GET /admin/importaciones,
// GET /admin/semestres, /admin/docentes, /admin/grupos-matriz y PUT /admin/docentes/:id/grupo-matriz.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota } from "../lib/date";
import { IBuscar, IImportar } from "../components/b2/icons";
import { StepperB2 } from "../components/b2/StepperB2";
import { Dl, Estado, Inspector, type Kind } from "../components/b2/ui";
import { fechaCorta, useMedia } from "../components/b2/matriz-util";
import "@fontsource-variable/nunito-sans";
import "../components/b2/b2.css";
import "../components/b2/b2-matriz.css";
import "../components/b2/b2-matriz-real.css";
import "../components/b2/b2-bandeja.css";
import "../components/b2/b2-importar.css";

const MAX_BYTES = 12 * 1024 * 1024;
const PASOS = [
  "Archivo",
  "Hoja y estructura",
  "Mapeo de columnas",
  "Destino y validación",
  "Previsualización",
  "Confirmar",
  "Resultado",
];
const CAMPOS: { campo: string; etiqueta: string; obligatorio?: boolean }[] = [
  { campo: "numero", etiqueta: "N° del entregable", obligatorio: true },
  { campo: "entregable", etiqueta: "Entregable", obligatorio: true },
  { campo: "descripcion", etiqueta: "Descripción / evidencia" },
  { campo: "horas", etiqueta: "Horas" },
  { campo: "fecha_inicio", etiqueta: "Fecha de inicio" },
  { campo: "fecha_fin", etiqueta: "Fecha de finalización" },
  { campo: "ubicacion", etiqueta: "Ubicación («Mes - Semana N»)" },
  { campo: "categoria", etiqueta: "Categoría / fase" },
];
const LETRAS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `A${l}`),
];

type Hoja = { indice: number; nombre: string; estado: string; tipo: string; fila_encabezado: number | null };
type Estructura = {
  fila_encabezado: number | null;
  encabezados?: Record<string, string>;
  mapeo_sugerido: Record<string, string>;
  columnas_ignoradas: string[];
  cabecera: { programa: string | null; regional: string | null; horas_ps: number | null; datos_personales_detectados: boolean };
  sugerencia_grupo: Record<string, number | string | null>;
  muestra: { hoja_fila: number; numero: number | null; entregable: string; semana: number | null; mes: string | null; horas: number | null; fecha_inicio: string | null; fecha_fin: string | null }[];
  total_filas_detectadas: number;
  filas_ignoradas_en_cola: number;
};
type Mensaje = { nivel: string; codigo: string; texto: string; detalle?: string };
type Fila = {
  orden: number; hoja_fila: number; numero: number | null; numero_original: number | null; entregable: string;
  horas: number | null; mes: string | null; semana: number | null; fecha_inicio: string | null; fecha_fin: string | null;
  estado: "valida" | "advertencia" | "error" | "pendiente"; accion: string; mensajes: Mensaje[];
};
type Decision = { id: string; pregunta: string; recomendada?: string; opciones: { valor: string; texto: string }[] };
type Validacion = {
  resumen: Record<string, number | string[]> | null;
  errores_globales: { codigo: string; texto: string }[];
  avisos_globales: { codigo: string; texto: string }[];
  decisiones_requeridas: Decision[];
  filas: Fila[];
  filas_truncadas: boolean;
  puede_confirmar: boolean;
  escribe_datos: boolean;
};
type Resultado = {
  ok: boolean; sin_cambios: boolean; lote: string | null; creado_en?: string; grupo_id?: number; mensaje?: string;
  resumen: Record<string, number | boolean | string[] | null>;
};
type Historial = {
  id: number; lote: string; creado_en: string; archivo_nombre: string | null; semestre: string; grupo_nombre: string | null;
  modo: string; usuario: string | null; resumen: Record<string, number | boolean>;
};
type Grupo = { id: number; nombre: string };
type Docente = { id: number; name: string };
type ErrorOperacion = { mensaje: string; reintentar?: () => void };

const ACCION: Record<string, { texto: string; clase: string }> = {
  crear: { texto: "Crear", clase: "bg-emerald-100 text-emerald-700" },
  actualizar: { texto: "Actualizar", clase: "bg-blue-100 text-blue-700" },
  sin_cambios: { texto: "Sin cambios", clase: "bg-gray-100 text-gray-600" },
  omitir: { texto: "Omitir", clase: "bg-amber-100 text-amber-700" },
  rechazar: { texto: "Rechazar", clase: "bg-red-100 text-red-700" },
  pendiente: { texto: "Pendiente de decisión", clase: "bg-purple-100 text-purple-700" },
};

const num = (v: unknown) => Number(v ?? 0);

function aBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

class ErrorApi extends Error {
  codigo?: string;
  datos: Record<string, unknown>;
  constructor(mensaje: string, codigo: string | undefined, datos: Record<string, unknown>) {
    super(mensaje);
    this.codigo = codigo;
    this.datos = datos;
  }
}

async function llamar<T>(ruta: string, cuerpo?: unknown, metodo = "POST"): Promise<T> {
  let r: Response;
  try {
    r = await apiFetch(`${API_BASE}/admin/importaciones${ruta}`, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; no se guardó nada.", "RED", {});
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(String(data.error || "No se pudo completar la operación"), data.codigo, data);
  return data as T;
}

export default function ImportarMatriz() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(0);
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<{ nombre: string; base64: string; bytes: number } | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaIdx, setHojaIdx] = useState<number | null>(null);
  const [estructura, setEstructura] = useState<Estructura | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});

  const [semestres, setSemestres] = useState<string[]>([]);
  const [semestre, setSemestre] = useState("");
  const [modo, setModo] = useState<"nuevo_grupo" | "grupo_existente">("nuevo_grupo");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoId, setGrupoId] = useState("");
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [docenteId, setDocenteId] = useState("");
  const [grupoNuevo, setGrupoNuevo] = useState({
    nombre: "", tipo_docente: "ANTIGUO", horas_totales: "", num_proyectos: "0", num_actividades: "0",
    num_convenios_nuevos: "0", num_convenios_dinamizados: "0",
  });
  const [decisiones, setDecisiones] = useState<Record<string, string>>({});
  const [omitirErrores, setOmitirErrores] = useState(false);
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [filtro, setFiltro] = useState("todas");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [errorOp, setErrorOp] = useState<ErrorOperacion | null>(null);
  const [catalogoDecisiones, setCatalogoDecisiones] = useState<Record<string, Decision>>({});
  const [entiendo, setEntiendo] = useState(false);
  const [docenteResultado, setDocenteResultado] = useState("");
  const [asignado, setAsignado] = useState<number | null>(null);
  const [asignando, setAsignando] = useState(false);
  const resultadosRef = useRef<HTMLDivElement>(null);

  const fallo = (e: unknown, titulo: string, reintentar?: () => void) => {
    notify.fromError(e, titulo);
    const mensaje = e instanceof Error && e.message ? e.message : titulo;
    setErrorOp({ mensaje, reintentar: e instanceof ErrorApi && e.codigo !== "RED" ? undefined : reintentar });
  };

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial((await llamar<{ importaciones: Historial[] }>("", undefined, "GET")).importaciones);
    } catch {
      /* el historial es informativo */
    }
  }, []);

  useEffect(() => {
    void cargarHistorial();
    apiFetch(`${API_BASE}/admin/semestres`)
      .then((r) => r.json())
      .then((d) => {
        setSemestres(Array.isArray(d.semestres) ? d.semestres : []);
        if (d.activo?.codigo) setSemestre((s) => s || String(d.activo.codigo));
      })
      .catch(() => {});
    apiFetch(`${API_BASE}/admin/docentes?limit=500`)
      .then((r) => r.json())
      .then((d) => setDocentes(Array.isArray(d.docentes) ? d.docentes.map((x: Docente) => ({ id: x.id, name: x.name })) : []))
      .catch(() => {});
  }, [cargarHistorial]);

  // También se vuelve a pedir al cambiar de paso: tras importar, el grupo nuevo debe aparecer sin recargar la página.
  useEffect(() => {
    if (!semestre) return;
    apiFetch(`${API_BASE}/admin/grupos-matriz?semestre=${encodeURIComponent(semestre)}`)
      .then((r) => r.json())
      .then((d) => setGrupos(Array.isArray(d.grupos) ? d.grupos : []))
      .catch(() => setGrupos([]));
  }, [semestre, paso, resultado]);

  const base = useMemo(
    () => ({ archivo_base64: archivo?.base64 ?? "", nombre_archivo: archivo?.nombre ?? "" }),
    [archivo]
  );
  const mapeoEnviado = useMemo(() => Object.fromEntries(Object.entries(mapeo).filter(([, v]) => v)), [mapeo]);
  const destino = useMemo(() => {
    const d: Record<string, unknown> = { semestre, modo };
    if (modo === "grupo_existente") d.grupo_id = grupoId ? Number(grupoId) : null;
    else d.grupo = { ...grupoNuevo, horas_totales: Number(grupoNuevo.horas_totales) };
    if (docenteId) d.asignar_docente_id = Number(docenteId);
    return d;
  }, [semestre, modo, grupoId, grupoNuevo, docenteId]);
  const cuerpo = useCallback(
    (extra: Record<string, unknown> = {}) => ({ ...base, hoja_indice: hojaIdx, mapeo: mapeoEnviado, destino, decisiones, ...extra }),
    [base, hojaIdx, mapeoEnviado, destino, decisiones]
  );

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return notify.error("Solo se admiten archivos .xlsx");
    if (file.size > MAX_BYTES) return notify.error("El archivo supera el máximo de 12 MB");
    try {
      setCargando(true);
      const base64 = await aBase64(file);
      const r = await llamar<{ hojas: Hoja[] }>("/analizar", { archivo_base64: base64, nombre_archivo: file.name });
      setArchivo({ nombre: file.name, base64, bytes: file.size });
      setHojas(r.hojas);
      setHojaIdx(null);
      setEstructura(null);
      setValidacion(null);
      setDecisiones({});
      setResultado(null);
      setPaso(1);
      setErrorOp(null);
    } catch (e) {
      fallo(e, "No se pudo analizar el archivo", () => void elegirArchivo(file));
    } finally {
      setCargando(false);
    }
  };

  const elegirHoja = async (h: Hoja) => {
    try {
      setCargando(true);
      const e = await llamar<Estructura>("/hoja", { ...base, hoja_indice: h.indice });
      setErrorOp(null);
      setHojaIdx(h.indice);
      setEstructura(e);
      setMapeo(e.mapeo_sugerido ?? {});
      setValidacion(null);
      setDecisiones({});
      const s = e.sugerencia_grupo || {};
      setGrupoNuevo((g) => ({
        ...g,
        tipo_docente: String(s.tipo_docente || g.tipo_docente || "ANTIGUO"),
        horas_totales: s.horas_totales != null ? String(s.horas_totales) : g.horas_totales,
        num_proyectos: String(s.num_proyectos ?? g.num_proyectos),
        num_actividades: String(s.num_actividades ?? g.num_actividades),
        num_convenios_nuevos: String(s.num_convenios_nuevos ?? g.num_convenios_nuevos),
        num_convenios_dinamizados: String(s.num_convenios_dinamizados ?? g.num_convenios_dinamizados),
      }));
    } catch (e) {
      fallo(e, "No se pudo leer la hoja", () => void elegirHoja(h));
    } finally {
      setCargando(false);
    }
  };

  const validar = useCallback(
    async (decs: Record<string, string>) => {
      try {
        setCargando(true);
        const v = await llamar<Validacion>("/validar", cuerpo({ decisiones: decs }));
        setValidacion(v);
        setErrorOp(null);
        setCatalogoDecisiones((c) => {
          const n = { ...c };
          for (const d of v.decisiones_requeridas) n[d.id] = d;
          return n;
        });
        window.setTimeout(() => resultadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        return v;
      } catch (e) {
        fallo(e, "No se pudo validar", () => void validar(decs));
        return null;
      } finally {
        setCargando(false);
      }
    },
    [cuerpo]
  );

  const decidir = async (id: string, valor: string) => {
    const nuevas = { ...decisiones, [id]: valor };
    setDecisiones(nuevas);
    await validar(nuevas);
  };

  const confirmar = async () => {
    if (cargando) return;
    try {
      setCargando(true);
      const r = await llamar<Resultado>("/confirmar", cuerpo({ opciones: { omitir_errores: omitirErrores } }));
      setResultado(r);
      setErrorOp(null);
      setPaso(6);
      notify.success(r.sin_cambios ? "No había cambios que importar" : "Importación completada");
      void cargarHistorial();
    } catch (e) {
      fallo(e, "No se pudo importar", () => void confirmar());
      if (e instanceof ErrorApi) {
        if (e.codigo === "DECISIONES_PENDIENTES" || e.codigo === "FILAS_CON_ERRORES") {
          await validar(decisiones);
          setPaso(e.codigo === "FILAS_CON_ERRORES" ? 4 : 3);
        } else if (e.codigo === "VALIDACION_FALLIDA" || e.codigo === "NOMBRE_DUPLICADO") {
          await validar(decisiones);
          setPaso(3);
        }
      }
    } finally {
      setCargando(false);
    }
  };

  const reiniciar = () => {
    setPaso(0);
    setArchivo(null);
    setHojas([]);
    setHojaIdx(null);
    setEstructura(null);
    setValidacion(null);
    setDecisiones({});
    setResultado(null);
    setOmitirErrores(false);
    setEntiendo(false);
    setErrorOp(null);
    setCatalogoDecisiones({});
    setAsignado(null);
    setDocenteResultado("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const cancelar = () => {
    reiniciar();
    notify.success("Importación cancelada: no se guardó nada en la base de datos");
  };

  const cambiarDecision = async (id: string) => {
    const nuevas = { ...decisiones };
    delete nuevas[id];
    setDecisiones(nuevas);
    await validar(nuevas);
  };

  const asignarDocente = async () => {
    if (!docenteResultado || !resultado?.grupo_id) return;
    try {
      setAsignando(true);
      const res = await apiFetch(`${API_BASE}/admin/docentes/${docenteResultado}/grupo-matriz`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupo_matriz_id: resultado.grupo_id, motivo: `Asignación desde Importar matriz (lote ${resultado.lote ?? "sin lote"})` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo asignar el docente");
      setAsignado(Number(docenteResultado));
      notify.success("Grupo asignado al docente");
    } catch (e) {
      notify.fromError(e, "No se pudo asignar el docente");
    } finally {
      setAsignando(false);
    }
  };

  const r = validacion?.resumen ?? null;
  const filasConError = r ? num(r.rechazar) : 0;
  const hayDecisiones = (validacion?.decisiones_requeridas.length ?? 0) > 0;
  const hayErroresGlobales = (validacion?.errores_globales.length ?? 0) > 0;
  const confirmable =
    Boolean(validacion?.puede_confirmar) && !hayDecisiones && !hayErroresGlobales && (filasConError === 0 || omitirErrores);
  const destinoCompleto =
    Boolean(semestre) && (modo === "nuevo_grupo" ? grupoNuevo.nombre.trim() !== "" && Number(grupoNuevo.horas_totales) > 0 : Boolean(grupoId));
  const mapeoCompleto = Boolean(mapeo.numero && mapeo.entregable);
  const hojaSoportada = (h: Hoja) => h.tipo === "cronograma" || h.tipo === "listado";

  const esDuplicada = (f: Fila) => f.mensajes.some((m) => m.codigo === "NUMERO_DUPLICADO" || m.codigo === "ENTREGABLE_REPETIDO");
  const filasVisibles = (validacion?.filas ?? []).filter((f) =>
    filtro === "todas" ? true : filtro === "duplicadas" ? esDuplicada(f) : f.estado === filtro
  );
  const nDuplicadas = (validacion?.filas ?? []).filter(esDuplicada).length;
  const decisionesTomadas = Object.entries(decisiones)
    .map(([id, valor]) => ({ id, valor, d: catalogoDecisiones[id] }))
    .filter((x) => x.d);

  const puedeAvanzar = [
    Boolean(archivo),
    hojaIdx != null && Boolean(estructura),
    mapeoCompleto,
    Boolean(validacion) && !hayErroresGlobales && !hayDecisiones,
    Boolean(validacion) && !hayDecisiones,
    false,
    false,
  ][paso];


  // ───────── Presentación B2 (la lógica de arriba no cambia) ─────────
  const movil = useMedia("(max-width: 720px)");
  const [busquedaPrev, setBusquedaPrev] = useState("");
  const [selFila, setSelFila] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => { setSelFila(null); }, [validacion, filtro, paso]);

  const KIND_FILA: Record<Fila["estado"], { kind: Kind; texto: string }> = {
    valida: { kind: "aprobado", texto: "Válida" },
    advertencia: { kind: "observado", texto: "Advertencia" },
    error: { kind: "vencido", texto: "Error" },
    pendiente: { kind: "revision", texto: "Pendiente" },
  };
  const NIVEL: Record<string, string> = { error: "Error", pendiente: "Pendiente de decisión", advertencia: "Advertencia", aviso: "Aviso" };
  const todasFilas = validacion?.filas ?? [];
  const cuenta = (f: (x: Fila) => boolean) => todasFilas.filter(f).length;
  const FILTROS_PREV: [string, string, number][] = [
    ["todas", "Todas", todasFilas.length],
    ["valida", "Válidas", cuenta((f) => f.estado === "valida")],
    ["advertencia", "Advertencias", cuenta((f) => f.estado === "advertencia")],
    ["error", "Errores", cuenta((f) => f.estado === "error")],
    ["pendiente", "Pendientes", cuenta((f) => f.estado === "pendiente")],
    ["duplicadas", "Duplicadas", nDuplicadas],
  ];
  const textoBusq = busquedaPrev.trim().toLowerCase();
  const filasPrev = filasVisibles.filter((f) => !textoBusq || `${f.entregable} ${f.numero ?? ""} ${f.numero_original ?? ""}`.toLowerCase().includes(textoBusq));
  const filaSel = todasFilas.find((f) => f.orden === selFila) ?? null;
  const nombreHoja = hojas.find((h) => h.indice === hojaIdx)?.nombre.trim();

  const sinCambios = Boolean(validacion) && num(r?.crear) === 0 && num(r?.actualizar) === 0 && !hayDecisiones && !hayErroresGlobales && filasConError === 0;

  /** Qué falta para poder continuar en el paso actual (con las mismas reglas de avance de siempre). */
  const falta: string | null = (() => {
    if (paso === 0) return "seleccionar un archivo .xlsx";
    if (paso === 1) return hojaIdx == null || !estructura ? "elegir la hoja con el cronograma" : null;
    if (paso === 2) return mapeoCompleto ? null : "asignar las columnas N° y Entregable";
    if (paso === 3) {
      if (!validacion) return destinoCompleto ? "pulsar «Validar (sin guardar)»" : modo === "nuevo_grupo" ? "indicar nombre y horas del grupo" : "seleccionar el grupo";
      if (hayErroresGlobales) return "corregir el error general de la validación";
      if (hayDecisiones) return `resolver ${validacion.decisiones_requeridas.length} decisión${validacion.decisiones_requeridas.length === 1 ? "" : "es"}`;
      return null;
    }
    if (paso === 4) return hayDecisiones ? "resolver las decisiones pendientes (paso 4)" : null;
    if (paso === 5) {
      if (sinCambios) return "no hay cambios: la matriz del grupo ya contiene estos entregables";
      if (!confirmable) return filasConError > 0 && !omitirErrores ? "omitir las filas con errores o volver a corregir" : "resolver decisiones o errores";
      return entiendo ? null : "marcar la casilla de confirmación";
    }
    return null;
  })();

  const spinner = <span className="b2-spin" aria-hidden="true" />;
  const pasoNav = (
    <div className="b2-imp-foot">
      <button type="button" className="b2-btn" disabled={paso === 0 || cargando} onClick={() => setPaso(paso - 1)}>Atrás</button>
      {paso < 5 && <span className="b2-imp-foot-d">{falta ? `Falta: ${falta}` : "Todo listo para continuar"}</span>}
      {paso < 5 && <button type="button" className="b2-btn b2-btn-primary" disabled={!puedeAvanzar || cargando} onClick={() => setPaso(paso + 1)}>Siguiente</button>}
    </div>
  );
  const fecha2 = (f: Fila) => `${f.fecha_inicio ? fechaCorta(f.fecha_inicio) : "—"} – ${f.fecha_fin ? fechaCorta(f.fecha_fin) : "—"}`;
  const accion = (a: string) => <span className="b2-pill" data-a={a}>{ACCION[a]?.texto ?? a}</span>;
  const mensajesFila = (f: Fila, max = 2) => (
    <div className="b2-msgs">
      {f.mensajes.slice(0, max).map((m, i) => <span key={i} className="b2-msg" data-n={m.nivel}>{m.texto}{m.detalle ? ` — ${m.detalle}` : ""}</span>)}
      {f.mensajes.length > max && <span className="b2-msg b2-msg-mas">+{f.mensajes.length - max} más</span>}
    </div>
  );
  const docenteAsignadoId = asignado ?? (resultado?.resumen.docente_asignado_id as number | null | undefined) ?? null;
  const nombreGrupo = modo === "nuevo_grupo" ? grupoNuevo.nombre : grupos.find((g) => String(g.id) === grupoId)?.nombre ?? "";

  return (
    <div className="b2-scope b2-dash b2-vista b2-fill b2-imp" data-insp="sel">
      <div className="b2-vista-main" data-scroll>
        <div className="b2-pg">
          <header className="b2-pg-h">
            <div>
              <h1 className="b2-pg-t">Importar matriz Excel</h1>
              <p className="b2-pg-s">Convierte una matriz de seguimiento de Excel en una plantilla de ProySocial. Nada se guarda hasta el paso «Confirmar».</p>
            </div>
          </header>

          <StepperB2 pasos={PASOS} actual={paso} falta={paso < 6 ? falta : null} deshabilitado={cargando} onIr={(i) => setPaso(i)} />

          {archivo && paso < 6 && (
            <div className="b2-imp-chip">
              <IImportar width={16} height={16} />
              <b title={archivo.nombre}>{archivo.nombre}</b>
              <span className="b2-muted">{(archivo.bytes / 1024).toFixed(0)} KB</span>
              {hojaIdx != null && estructura && nombreHoja && <span className="b2-muted">· hoja «{nombreHoja}»</span>}
              <span className="b2-imp-chip-acc">
                <button type="button" className="b2-link-btn" disabled={cargando} onClick={() => { reiniciar(); window.setTimeout(() => inputRef.current?.click(), 50); }}>Cambiar archivo</button>
                <button type="button" className="b2-link-btn" style={{ color: "var(--c-danger)" }} disabled={cargando} onClick={cancelar}>Cancelar importación</button>
              </span>
            </div>
          )}

          {errorOp && (
            <div className="b2-alert" role="alert">
              <span>{errorOp.mensaje}</span>
              <span className="b2-acc-fila">
                {errorOp.reintentar && <button type="button" className="b2-btn b2-btn-sm b2-btn-primary" onClick={() => { const f = errorOp.reintentar; setErrorOp(null); f?.(); }}>Reintentar</button>}
                <button type="button" className="b2-btn b2-btn-sm" onClick={() => setErrorOp(null)}>Cerrar</button>
              </span>
            </div>
          )}

          <section className="b2-imp-card" aria-live="polite" aria-busy={cargando}>
            <div className="b2-imp-body">
              {/* 1 */}
              {paso === 0 && (
                <>
                  <h2 className="b2-imp-h">1. Seleccionar archivo</h2>
                  <div className="b2-imp-drop" data-drag={arrastrando || undefined}
                    onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                    onDragLeave={() => setArrastrando(false)}
                    onDrop={(e) => { e.preventDefault(); setArrastrando(false); void elegirArchivo(e.dataTransfer.files?.[0]); }}>
                    <IImportar width={32} height={32} />
                    <p>Arrastra aquí un archivo .xlsx o</p>
                    <label className="b2-btn b2-btn-primary b2-imp-btnfile" style={{ cursor: "pointer" }}>
                      Seleccionar archivo
                      <input ref={inputRef} type="file" accept=".xlsx" className="b2-imp-file" onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
                    </label>
                    <p className="b2-sub" style={{ whiteSpace: "normal" }}>Máximo 12 MB. El archivo original no se modifica.</p>
                    {cargando && <p className="b2-imp-help" role="status">{spinner} Leyendo el archivo…</p>}
                  </div>
                  <p className="b2-imp-help">Usa la hoja de <b>cronograma</b> del docente o del grupo (con las columnas «N°», «Entregable», fechas y horas). Las fórmulas, los porcentajes de avance, el estatus y los datos personales no se importan.</p>
                </>
              )}

              {/* 2 */}
              {paso === 1 && (
                <>
                  <h2 className="b2-imp-h">2. Seleccionar hoja y revisar estructura</h2>
                  <p className="b2-imp-help">Elige la hoja con el cronograma de entregables. Las hojas sin la estructura de una matriz aparecen deshabilitadas. {cargando && <>{spinner} Leyendo la hoja…</>}</p>
                  <div className="b2-hojas" role="radiogroup" aria-label="Hojas del archivo">
                    {hojas.map((h) => (
                      <button key={h.indice} type="button" role="radio" aria-checked={hojaIdx === h.indice} data-on={hojaIdx === h.indice || undefined} className="b2-hoja" disabled={!hojaSoportada(h) || cargando} onClick={() => void elegirHoja(h)}>
                        <b>{h.nombre.trim() || `Hoja ${h.indice + 1}`}</b>
                        <small>{h.tipo === "cronograma" ? "Cronograma con fechas" : h.tipo === "listado" ? "Listado (fechas derivadas de la semana)" : "Sin estructura de matriz"}{h.estado !== "visible" && " · oculta"}</small>
                      </button>
                    ))}
                  </div>
                  {estructura && (
                    <>
                      {estructura.cabecera.datos_personales_detectados && <div className="b2-callout"><strong>Datos personales</strong><p>La hoja trae datos personales de un docente; se ignoran y no se guardan.</p></div>}
                      <p className="b2-imp-help">Encabezado en la fila {estructura.fila_encabezado ?? "—"} · <b>{estructura.total_filas_detectadas}</b> entregables detectados
                        {estructura.filas_ignoradas_en_cola > 0 && ` · ${estructura.filas_ignoradas_en_cola} filas de apoyo ignoradas al final`}
                        {estructura.cabecera.programa && ` · Programa: ${estructura.cabecera.programa}`}</p>
                      <div className="b2-tw b2-tw-y">
                        <table className="b2-tbl">
                          <thead><tr>{["Fila", "N°", "Entregable", "Mes", "Semana", "Horas", "Inicio", "Fin"].map((c) => <th key={c} className={["Fila", "N°", "Semana", "Horas"].includes(c) ? "b2-num" : undefined}>{c}</th>)}</tr></thead>
                          <tbody>
                            {estructura.muestra.map((m) => (
                              <tr key={m.hoja_fila}>
                                <td className="b2-num">{m.hoja_fila}</td><td className="b2-num">{m.numero}</td>
                                <td className="b2-ent"><span title={m.entregable}>{m.entregable}</span></td>
                                <td className="b2-nw">{m.mes ?? "—"}</td><td className="b2-num">{m.semana ?? "—"}</td><td className="b2-num">{m.horas ?? "—"}</td>
                                <td className="b2-nw">{m.fecha_inicio ? fechaCorta(m.fecha_inicio) : "—"}</td><td className="b2-nw">{m.fecha_fin ? fechaCorta(m.fecha_fin) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="b2-sub" style={{ whiteSpace: "normal" }}>Muestra de las primeras filas detectadas.</p>
                    </>
                  )}
                </>
              )}

              {/* 3 */}
              {paso === 2 && (
                <>
                  <h2 className="b2-imp-h">3. Mapear columnas</h2>
                  <p className="b2-imp-help">El estatus, las fechas reales de entrega y los porcentajes del Excel no se importan: los indicadores se calculan en ProySocial. Los selectores ya vienen con lo detectado; cámbialos solo si el Excel tiene otro orden de columnas.</p>
                  <div className="b2-map">
                    {CAMPOS.map((c) => (
                      <div key={c.campo} className="b2-map-r" data-falta={(c.obligatorio && !mapeo[c.campo]) || undefined}>
                        <label htmlFor={`map-${c.campo}`}>{c.etiqueta}{c.obligatorio && <i title="Obligatorio">*</i>}</label>
                        <select id={`map-${c.campo}`} className="b2-sel" value={mapeo[c.campo] ?? ""} onChange={(e) => { setMapeo({ ...mapeo, [c.campo]: e.target.value }); setValidacion(null); }}>
                          <option value="">— No usar —</option>
                          {LETRAS.map((l) => <option key={l} value={l}>Columna {l}{estructura?.encabezados?.[l] ? ` — ${estructura.encabezados[l]}` : ""}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {!mapeoCompleto && <p className="b2-nota-aviso" data-t="err" role="alert">Asigna al menos las columnas N° y Entregable.</p>}
                </>
              )}

              {/* 4 */}
              {paso === 3 && (
                <>
                  <h2 className="b2-imp-h">4. Destino y validación</h2>
                  <div className="b2-imp-grid">
                    <div>
                      <label className="b2-label" htmlFor="imp-sem">Semestre de destino</label>
                      <select id="imp-sem" className="b2-sel" value={semestre} onChange={(e) => { setSemestre(e.target.value); setGrupoId(""); setValidacion(null); }}>
                        <option value="">Selecciona el semestre</option>
                        {semestres.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="b2-span2">
                      <span className="b2-label">Grupo de matriz</span>
                      <div className="b2-radios" role="radiogroup" aria-label="Grupo de matriz">
                        {([["nuevo_grupo", "Crear grupo nuevo"], ["grupo_existente", "Completar grupo existente"]] as const).map(([v, t]) => (
                          <label key={v} className="b2-radio"><input type="radio" name="modo" checked={modo === v} onChange={() => { setModo(v); setValidacion(null); }} />{t}</label>
                        ))}
                      </div>
                    </div>
                  </div>
                  {modo === "grupo_existente" ? (
                    <div style={{ maxWidth: 420 }}>
                      <label className="b2-label" htmlFor="imp-grupo">Grupo del semestre {semestre}</label>
                      <select id="imp-grupo" className="b2-sel" value={grupoId} onChange={(e) => { setGrupoId(e.target.value); setValidacion(null); }}>
                        <option value="">Selecciona el grupo</option>
                        {grupos.map((g) => <option key={g.id} value={String(g.id)}>{g.nombre}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="b2-imp-grid">
                      {([["nombre", "Nombre del grupo"], ["horas_totales", "Horas totales"], ["num_proyectos", "Proyectos"], ["num_actividades", "Actividades"], ["num_convenios_nuevos", "Convenios nuevos"], ["num_convenios_dinamizados", "Convenios dinamizados"]] as const).map(([k, t]) => (
                        <div key={k} className={k === "nombre" ? "b2-span2" : undefined}>
                          <label htmlFor={`g-${k}`} className="b2-label">{t}</label>
                          <input id={`g-${k}`} className="b2-input" type={k === "nombre" ? "text" : "number"} min={0} placeholder={k === "nombre" ? "Ej.: Grupo 1 - Antiguo 24h" : undefined} value={grupoNuevo[k]} onChange={(e) => { setGrupoNuevo({ ...grupoNuevo, [k]: e.target.value }); setValidacion(null); }} />
                        </div>
                      ))}
                      <div>
                        <label htmlFor="g-tipo" className="b2-label">Tipo de docente</label>
                        <select id="g-tipo" className="b2-sel" value={grupoNuevo.tipo_docente} onChange={(e) => { setGrupoNuevo({ ...grupoNuevo, tipo_docente: e.target.value }); setValidacion(null); }}>
                          <option value="ANTIGUO">ANTIGUO</option><option value="NUEVO">NUEVO</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div style={{ maxWidth: 420 }}>
                    <label className="b2-label" htmlFor="imp-doc">Asignar a un docente (opcional)</label>
                    <select id="imp-doc" className="b2-sel" value={docenteId} onChange={(e) => { setDocenteId(e.target.value === "__ninguno__" ? "" : e.target.value); setValidacion(null); }}>
                      <option value="__ninguno__">No asignar</option>
                      {docentes.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="b2-acc-fila">
                    <button type="button" className="b2-btn b2-btn-primary" disabled={!destinoCompleto || cargando} onClick={() => void validar(decisiones)}>{cargando && spinner}Validar (sin guardar)</button>
                    {!destinoCompleto && <span className="b2-imp-help">{modo === "nuevo_grupo" ? "Escribe el nombre del grupo y las horas totales para poder validar." : "Selecciona el grupo que se va a completar."}</span>}
                  </div>
                  <div ref={resultadosRef} />

                  {validacion && (
                    <>
                      {decisionesTomadas.length > 0 && (
                        <div className="b2-hechas">
                          <b>Decisiones tomadas</b>
                          {decisionesTomadas.map(({ id, valor, d }) => (
                            <div key={id}><span>{d!.opciones.find((o) => o.valor === valor)?.texto ?? valor}</span><button type="button" className="b2-link-btn" disabled={cargando} onClick={() => void cambiarDecision(id)}>Cambiar</button></div>
                          ))}
                        </div>
                      )}
                      <dl className="b2-imp-stats" aria-label="Resultado de la validación">
                        <div><dt>Válidos</dt><dd>{num(r?.validas)}</dd></div>
                        <div className="b2-s-adv"><dt>Advertencias</dt><dd>{num(r?.advertencias)}</dd></div>
                        <div className="b2-s-err"><dt>Errores</dt><dd>{num(r?.errores)}</dd></div>
                        <div className="b2-s-pen"><dt>Pendientes de decisión</dt><dd>{num(r?.pendientes)}</dd></div>
                      </dl>
                      {validacion.errores_globales.map((e) => <div key={e.codigo} className="b2-callout b2-callout-d" role="alert"><strong>Error</strong><p>{e.texto}</p></div>)}
                      {validacion.avisos_globales.length > 0 && (
                        <div className="b2-callout"><strong>Avisos ({validacion.avisos_globales.length})</strong>
                          <ul className="b2-avisos">{validacion.avisos_globales.map((e) => <li key={e.codigo}>{e.texto}</li>)}</ul>
                        </div>
                      )}
                      {validacion.decisiones_requeridas.map((d) => (
                        <fieldset key={d.id} className="b2-decide">
                          <legend>Decisión requerida</legend>
                          <p>{d.pregunta}</p>
                          {d.opciones.map((o) => (
                            <label key={o.valor} className="b2-decide-o">
                              <input type="radio" name={`dec-${d.id}`} disabled={cargando} onChange={() => void decidir(d.id, o.valor)} />
                              <span>{o.texto}{d.recomendada === o.valor && <span className="b2-reco">Recomendada</span>}</span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </>
                  )}
                </>
              )}

              {/* 5 */}
              {paso === 4 && validacion && (
                <>
                  <h2 className="b2-imp-h">5. Previsualizar cambios</h2>
                  <p className="b2-imp-help" style={{ fontSize: "var(--fs-md)" }}>
                    Se <b>crearán {num(r?.crear)}</b>, se <b>actualizarán {num(r?.actualizar)}</b>, {num(r?.sin_cambios)} ya existen sin cambios, se <b>omitirán {num(r?.omitir)}</b> y se <b>rechazarán {num(r?.rechazar)}</b>. Las plantillas que ya tienen reportes de docentes no se modifican.
                  </p>
                  <div className="b2-chips b2-chips-flush" role="group" aria-label="Filtrar filas">
                    {FILTROS_PREV.map(([v, t, n]) => (
                      <button key={v} type="button" className="b2-chip" data-on={filtro === v || undefined} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}<b>{n}</b></button>
                    ))}
                  </div>
                  <div className="b2-prev-tb">
                    <label className="b2-tb-search"><IBuscar width={15} height={15} /><input value={busquedaPrev} onChange={(e) => setBusquedaPrev(e.target.value)} placeholder="Buscar entregable o número" aria-label="Buscar en la previsualización" /></label>
                    <span className="b2-tb-count" aria-live="polite">{filasPrev.length === todasFilas.length ? `${todasFilas.length} filas` : `${filasPrev.length} de ${todasFilas.length}`}</span>
                  </div>
                  {movil ? (
                    <ul className="b2-prev-l">
                      {filasPrev.length === 0 && <li className="b2-ml-vacio"><p role="status">Ninguna fila coincide con el filtro.</p></li>}
                      {filasPrev.map((f) => (
                        <li key={f.orden}>
                          <button type="button" className="b2-prev-i" data-tono={f.estado} data-sel={selFila === f.orden || undefined} onClick={() => setSelFila(f.orden)}>
                            <span className="b2-prev-t">
                              <span className="b2-prev-n">{f.numero ?? "—"}. {f.entregable || "—"}</span>
                              <span className="b2-prev-e"><Estado kind={KIND_FILA[f.estado].kind} label={KIND_FILA[f.estado].texto} />{accion(f.accion)}</span>
                              <span className="b2-prev-m">S{f.semana ?? "—"} · {f.mes ?? "—"} · {fecha2(f)}{f.mensajes.length > 0 ? ` · ${f.mensajes.length} ${f.mensajes.length === 1 ? "observación" : "observaciones"}` : ""}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="b2-tw b2-tw-y" tabIndex={0} aria-label="Filas de la previsualización">
                      <table className="b2-tbl">
                        <thead><tr>
                          <th className="b2-num">N°</th><th>Entregable</th><th>Semana · fechas</th><th className="b2-num">Horas</th><th>Estado</th><th>Acción</th><th>Observaciones</th>
                        </tr></thead>
                        <tbody>
                          {filasPrev.length === 0 && <tr><td colSpan={7} style={{ padding: 20 }} className="b2-muted">Ninguna fila coincide con el filtro.</td></tr>}
                          {filasPrev.map((f) => (
                            <tr key={f.orden} data-click data-tono={f.estado} data-sel={selFila === f.orden || undefined} tabIndex={0} aria-selected={selFila === f.orden}
                              onClick={() => setSelFila(f.orden)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelFila(f.orden); } }}>
                              <td className="b2-num">{f.numero ?? "—"}{f.numero_original != null && <span className="b2-muted" title="Número original en el Excel"> (era {f.numero_original})</span>}</td>
                              <td className="b2-ent"><span title={f.entregable}>{f.entregable || "—"}</span></td>
                              <td className="b2-nw"><span style={{ display: "block", fontWeight: 600 }}>S{f.semana ?? "—"} · {f.mes ?? "—"}</span><span className="b2-sub">{fecha2(f)}</span></td>
                              <td className="b2-num">{f.horas ?? "—"}</td>
                              <td className="b2-nw"><Estado kind={KIND_FILA[f.estado].kind} label={KIND_FILA[f.estado].texto} /></td>
                              <td>{accion(f.accion)}</td>
                              <td style={{ minWidth: 220, maxWidth: 360 }}>{mensajesFila(f)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {validacion.filas_truncadas && <p className="b2-imp-help">Se muestran las primeras filas; el resumen incluye todas.</p>}
                  {filasConError > 0 && (
                    <label className="b2-check" data-t="err">
                      <input type="checkbox" checked={omitirErrores} onChange={(e) => { setOmitirErrores(e.target.checked); setEntiendo(false); }} />
                      <span>Importar solo las filas válidas y omitir las que tienen errores ({filasConError}). Las filas con errores nunca se guardan.</span>
                    </label>
                  )}
                </>
              )}

              {/* 6 */}
              {paso === 5 && validacion && (
                <>
                  <h2 className="b2-imp-h">6. Confirmar importación</h2>
                  <ul className="b2-conf">
                    <li><span>Archivo: <b>{archivo?.nombre}</b> · semestre <b>{semestre}</b> · {modo === "nuevo_grupo" ? `grupo nuevo «${grupoNuevo.nombre}»` : `grupo existente${nombreGrupo ? ` «${nombreGrupo}»` : ""}`}</span></li>
                    <li><span>{num(r?.crear)} entregables nuevos, {num(r?.actualizar)} actualizados, {num(r?.sin_cambios)} sin cambios, {num(r?.omitir)} omitidos, {filasConError} rechazados.</span></li>
                    <li><span>{num(r?.horas_programadas)} horas programadas en la matriz.</span></li>
                    {docenteId && <li><span>El grupo se asignará al docente seleccionado.</span></li>}
                    <li><span>No se borra ningún dato existente; la importación queda registrada con su identificador de lote.</span></li>
                  </ul>
                  <label className="b2-check" data-t="warn" style={{ maxWidth: 680 }}>
                    <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
                    <span>Entiendo que al confirmar se escribirán estos entregables en la base de datos de ProySocial.</span>
                  </label>
                  <div className="b2-acc-fila">
                    <button type="button" className="b2-btn b2-btn-primary" disabled={!confirmable || cargando || !entiendo} onClick={() => void confirmar()}>{cargando && spinner}Confirmar importación</button>
                    <button type="button" className="b2-btn" disabled={cargando} onClick={cancelar}>Cancelar</button>
                  </div>
                  {sinCambios && <p className="b2-nota-aviso" data-t="warn" role="status">No hay cambios que importar: la matriz del grupo ya contiene estos entregables. No se creará ningún registro ni lote nuevo.</p>}
                  {!confirmable && !sinCambios && <p className="b2-nota-aviso" data-t="err">Resuelve las decisiones, errores o confirma omitir las filas con errores antes de importar.</p>}
                </>
              )}

              {/* 7 */}
              {paso === 6 && resultado && (
                <>
                  <h2 className="b2-imp-h b2-res-h"><span className="b2-res-ok" aria-hidden="true">✓</span>7. Resultado de la importación</h2>
                  {resultado.sin_cambios ? (
                    <div className="b2-callout"><strong>Sin cambios</strong><p>{resultado.mensaje ?? "La matriz ya contenía estos entregables."} No se duplicó ningún registro ni se creó un nuevo lote.</p></div>
                  ) : (
                    <p className="b2-imp-help">Lote <code>{resultado.lote}</code> · {formatDateTimeBogota(resultado.creado_en)} · semestre <b>{semestre}</b>{nombreGrupo ? <> · grupo <b>{nombreGrupo}</b> ({resultado.resumen.grupo_nuevo ? "creado" : "actualizado"})</> : null}</p>
                  )}
                  <dl className="b2-imp-stats" aria-label="Resumen de la importación">
                    {([["Importadas", "creadas"], ["Actualizadas", "actualizadas"], ["Sin cambios", "sin_cambios"], ["Omitidas", "omitidas"], ["Advertencias", "advertencias"], ["Errores (rechazadas)", "rechazadas"]] as const)
                      .filter(([, k]) => resultado.resumen[k] != null || validacion != null)
                      .map(([t, k]) => (
                        <div key={k} className={k === "rechazadas" && num(resultado.resumen[k]) > 0 ? "b2-s-err" : k === "advertencias" ? "b2-s-adv" : undefined}>
                          <dt>{t}</dt><dd>{num(resultado.resumen[k] ?? (k === "advertencias" ? r?.advertencias : 0))}</dd>
                        </div>
                      ))}
                  </dl>
                  {num(resultado.resumen.horas_programadas) > 0 && <p className="b2-imp-help">{num(resultado.resumen.horas_programadas)} horas programadas en la matriz.</p>}
                  {decisionesTomadas.length > 0 && (
                    <div className="b2-hechas">
                      <b>Ajustes administrativos aplicados (quedan registrados en el lote)</b>
                      {decisionesTomadas.map(({ id, valor, d }) => <div key={id}><span>{d!.opciones.find((o) => o.valor === valor)?.texto ?? valor}</span></div>)}
                      <span className="b2-muted" style={{ fontSize: "var(--fs-xs)" }}>Las fechas originales del Excel no se modificaron.</span>
                    </div>
                  )}
                  {resultado.grupo_id != null && (
                    <div className="b2-next">
                      <b>Siguientes pasos</b>
                      <div className="b2-acc-fila">
                        <button type="button" className="b2-btn b2-btn-primary" onClick={() => navigate(`/admin/sistema?tab=plantillas&semestre=${encodeURIComponent(semestre)}&grupo=${resultado.grupo_id}`)}>Ver matriz del grupo</button>
                        {docenteAsignadoId != null && <button type="button" className="b2-btn" onClick={() => navigate(`/admin/docentes/${docenteAsignadoId}/matriz`)}>Abrir matriz del docente</button>}
                      </div>
                      {docenteAsignadoId == null && (
                        <div className="b2-acc-fila">
                          <div style={{ flex: "1 1 240px", maxWidth: 420 }}>
                            <label className="b2-label" htmlFor="imp-asig">Asignar este grupo a un docente</label>
                            <select id="imp-asig" className="b2-sel" value={docenteResultado} onChange={(e) => setDocenteResultado(e.target.value === "__ninguno__" ? "" : e.target.value)}>
                              <option value="__ninguno__">Selecciona el docente</option>
                              {docentes.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                            </select>
                          </div>
                          <button type="button" className="b2-btn b2-btn-primary" disabled={!docenteResultado || asignando} onClick={() => void asignarDocente()}>{asignando && spinner}Asignar</button>
                        </div>
                      )}
                      {asignado != null && <p className="b2-nota-aviso" data-t="ok">Grupo asignado: el docente ya ve esta matriz en su sección «Matriz de seguimiento».</p>}
                    </div>
                  )}
                  <div className="b2-acc-fila"><button type="button" className="b2-btn" onClick={reiniciar}>Importar otra matriz</button></div>
                </>
              )}
            </div>
            {paso < 6 && pasoNav}
          </section>

          <section className="b2-card" aria-labelledby="b2-t-hist">
            <div className="b2-card-h"><h2 id="b2-t-hist">Historial de importaciones</h2><span className="b2-card-n">{historial.length} {historial.length === 1 ? "lote" : "lotes"}</span></div>
            {historial.length === 0 ? <p className="b2-vacio">Aún no hay importaciones.</p> : (
              <>
                <div className="b2-tw b2-hist-t" style={{ border: 0, borderRadius: 0 }}>
                  <table className="b2-tbl">
                    <thead><tr>{["Fecha", "Archivo", "Semestre", "Grupo", "Creadas", "Actualizadas", "Usuario"].map((c) => <th key={c} className={["Creadas", "Actualizadas"].includes(c) ? "b2-num" : undefined}>{c}</th>)}</tr></thead>
                    <tbody>
                      {historial.map((h) => (
                        <tr key={h.id}>
                          <td className="b2-nw">{formatDateTimeBogota(h.creado_en)}</td><td className="b2-ent"><span title={h.archivo_nombre ?? ""}>{h.archivo_nombre ?? "—"}</span></td>
                          <td className="b2-nw">{h.semestre}</td><td>{h.grupo_nombre ?? "—"}</td><td className="b2-num">{num(h.resumen?.creadas)}</td><td className="b2-num">{num(h.resumen?.actualizadas)}</td><td>{h.usuario ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="b2-hist-m">
                  {historial.map((h) => (
                    <li key={h.id}><b>{h.archivo_nombre ?? "—"}</b><span className="b2-muted">{formatDateTimeBogota(h.creado_en)} · {h.semestre} · {h.grupo_nombre ?? "—"}</span><span>{num(h.resumen?.creadas)} creadas · {num(h.resumen?.actualizadas)} actualizadas · {h.usuario ?? "—"}</span></li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>

      <Inspector open={!!filaSel && paso === 4} onClose={() => setSelFila(null)} label={String(selFila)}>
        {filaSel && (
          <div className="b2-insp-c">
            <p className="b2-insp-sup">Fila {filaSel.hoja_fila} de la hoja</p>
            <h2 className="b2-insp-h">{filaSel.numero ?? "—"}. {filaSel.entregable || "Sin nombre"}</h2>
            <div className="b2-insp-estado b2-acc-fila"><Estado kind={KIND_FILA[filaSel.estado].kind} label={KIND_FILA[filaSel.estado].texto} />{accion(filaSel.accion)}</div>
            {filaSel.estado === "error" && <div className="b2-callout b2-callout-d"><strong>Esta fila no se importará</strong><p>Corrige el Excel y vuelve a cargarlo, o importa solo las filas válidas.</p></div>}
            {filaSel.estado === "pendiente" && <div className="b2-callout"><strong>Decisión pendiente</strong><p>Resuélvela en el paso 4 (Destino y validación).</p></div>}
            <h3 className="b2-insp-sub">Observaciones ({filaSel.mensajes.length})</h3>
            {filaSel.mensajes.length === 0 ? <p className="b2-muted">Sin observaciones.</p> : (
              <ul className="b2-msgs" style={{ gap: 8 }}>
                {filaSel.mensajes.map((m, i) => <li key={i} className="b2-msg" data-n={m.nivel} style={{ fontSize: "var(--fs-md)" }}><span><b>{NIVEL[m.nivel] ?? m.nivel}:</b> {m.texto}{m.detalle ? ` — ${m.detalle}` : ""}</span></li>)}
              </ul>
            )}
            <h3 className="b2-insp-sub">Datos leídos del Excel</h3>
            <Dl rows={[
              ["N°", `${filaSel.numero ?? "—"}${filaSel.numero_original != null ? ` (original ${filaSel.numero_original})` : ""}`],
              ["Semana · mes", `S${filaSel.semana ?? "—"} · ${filaSel.mes ?? "—"}`],
              ["Inicio", filaSel.fecha_inicio ? formatDateOnly(filaSel.fecha_inicio) : "—"],
              ["Fin", filaSel.fecha_fin ? formatDateOnly(filaSel.fecha_fin) : "—"],
              ["Horas", filaSel.horas != null ? `${filaSel.horas} h` : "—"],
            ]} />
            <div className="b2-insp-acc"><button type="button" className="b2-btn b2-btn-ghost" onClick={() => setSelFila(null)}>Cerrar detalle</button></div>
          </div>
        )}
      </Inspector>
    </div>
  );
}
