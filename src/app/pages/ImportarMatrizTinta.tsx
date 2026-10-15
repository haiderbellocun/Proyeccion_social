import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { API_BASE, apiFetch } from "../config/api";
import { AppSelect } from "../components/AppSelect";
import { Page, PageHeader } from "../components/ds/primitives";
import { Stepper } from "../components/ds/Stepper";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota } from "../lib/date";

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
        body: JSON.stringify({ grupo_matriz_id: resultado.grupo_id }),
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

  const campoClase = "ds-input";

  return (
    <Page>
      <PageHeader
        title="Importar matriz Excel"
        description="Convierte una matriz de seguimiento de Excel en una plantilla de ProySocial. Nada se guarda hasta el paso «Confirmar»."
      />

      <Stepper steps={PASOS} current={paso} label="Pasos de la importación" />

      {archivo && paso < 6 && (
        <div className="flex flex-wrap items-center justify-between gap-2 ds-panel px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-gray-700 min-w-0">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <strong className="truncate">{archivo.nombre}</strong>
            <span className="text-gray-400 shrink-0">{(archivo.bytes / 1024).toFixed(0)} KB</span>
            {hojaIdx != null && estructura && <span className="text-gray-500 hidden sm:inline">· hoja «{hojas.find((h) => h.indice === hojaIdx)?.nombre.trim()}»</span>}
          </span>
          <span className="flex gap-3 text-xs">
            <button type="button" onClick={() => { reiniciar(); window.setTimeout(() => inputRef.current?.click(), 50); }} className="text-brand hover:underline" disabled={cargando}>
              Cambiar archivo
            </button>
            <button type="button" onClick={cancelar} className="text-red-600 hover:underline" disabled={cargando}>
              Cancelar importación
            </button>
          </span>
        </div>
      )}

      {errorOp && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <span className="flex gap-2"><XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {errorOp.mensaje}</span>
          <span className="flex gap-2">
            {errorOp.reintentar && (
              <button type="button" onClick={() => { const f = errorOp.reintentar; setErrorOp(null); f?.(); }} className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
                <RefreshCw className="w-3 h-3" /> Reintentar
              </button>
            )}
            <button type="button" onClick={() => setErrorOp(null)} className="px-3 py-1 border border-red-200 rounded-lg text-xs hover:bg-red-100">Cerrar</button>
          </span>
        </div>
      )}

      <div className="ds-panel p-5 space-y-5">
        {/* 1 */}
        {paso === 0 && (
          <div className="space-y-4">
            <h2 className="text-gray-800">1. Seleccionar archivo</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void elegirArchivo(e.dataTransfer.files?.[0]);
              }}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Arrastra aquí un archivo .xlsx o</p>
              <label className="inline-block mt-2 px-4 py-2 bg-brand text-white rounded-lg text-sm cursor-pointer hover:bg-brand-strong">
                Seleccionar archivo
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  onChange={(e) => void elegirArchivo(e.target.files?.[0])}
                />
              </label>
              <p className="text-xs text-gray-400 mt-3">Máximo 12 MB. El archivo original no se modifica.</p>
              {cargando && <p className="text-xs text-gray-500 mt-2 flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Leyendo el archivo…</p>}
            </div>
            <p className="text-xs text-gray-500">
              Use la hoja de <strong>cronograma</strong> del docente o del grupo (con las columnas «N°», «Entregable», fechas y horas). Las fórmulas, los porcentajes de avance, el estatus y los datos personales no se importan.
            </p>
          </div>
        )}

        {/* 2 */}
        {paso === 1 && (
          <div className="space-y-4">
            <h2 className="text-gray-800">2. Seleccionar hoja y revisar estructura</h2>
            <p className="text-xs text-gray-500">
              Elige la hoja con el cronograma de entregables. Las hojas sin la estructura de una matriz aparecen deshabilitadas.
              {cargando && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {hojas.map((h) => (
                <button
                  key={h.indice}
                  type="button"
                  disabled={!hojaSoportada(h) || cargando}
                  onClick={() => void elegirHoja(h)}
                  className={`text-left border rounded-lg px-3 py-2 text-sm ${
                    hojaIdx === h.indice ? "border-brand bg-blue-50" : "border-gray-200"
                  } ${hojaSoportada(h) ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"}`}
                >
                  <span className="font-medium text-gray-800">{h.nombre.trim() || `Hoja ${h.indice + 1}`}</span>
                  <span className="block text-xs text-gray-500">
                    {h.tipo === "cronograma" ? "Cronograma con fechas" : h.tipo === "listado" ? "Listado (fechas derivadas de la semana)" : "Sin estructura de matriz"}
                    {h.estado !== "visible" && " · oculta"}
                  </span>
                </button>
              ))}
            </div>
            {estructura && (
              <div className="space-y-3">
                {estructura.cabecera.datos_personales_detectados && (
                  <p className="flex gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    La hoja trae datos personales de un docente; se ignoran y no se guardan.
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Encabezado en la fila {estructura.fila_encabezado ?? "—"} · {estructura.total_filas_detectadas} entregables detectados
                  {estructura.filas_ignoradas_en_cola > 0 && ` · ${estructura.filas_ignoradas_en_cola} filas de apoyo ignoradas al final`}
                  {estructura.cabecera.programa && ` · Programa: ${estructura.cabecera.programa}`}
                </p>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        {["Fila", "N°", "Entregable", "Mes", "Semana", "Horas", "Inicio", "Fin"].map((c) => (
                          <th key={c} className="text-left px-3 py-2">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {estructura.muestra.map((m) => (
                        <tr key={m.hoja_fila}>
                          <td className="px-3 py-1.5">{m.hoja_fila}</td>
                          <td className="px-3 py-1.5">{m.numero}</td>
                          <td className="px-3 py-1.5 max-w-xs truncate">{m.entregable}</td>
                          <td className="px-3 py-1.5">{m.mes ?? "—"}</td>
                          <td className="px-3 py-1.5">{m.semana ?? "—"}</td>
                          <td className="px-3 py-1.5">{m.horas ?? "—"}</td>
                          <td className="px-3 py-1.5">{formatDateOnly(m.fecha_inicio)}</td>
                          <td className="px-3 py-1.5">{formatDateOnly(m.fecha_fin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3 */}
        {paso === 2 && (
          <div className="space-y-4">
            <h2 className="text-gray-800">3. Mapear columnas</h2>
            <p className="text-xs text-gray-500 flex gap-1.5">
              <Info className="w-4 h-4 shrink-0" />
              El estatus, las fechas reales de entrega y los porcentajes del Excel no se importan: los indicadores se calculan en ProySocial.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAMPOS.map((c) => (
                <div key={c.campo}>
                  <label htmlFor={`map-${c.campo}`} className="block text-xs text-gray-600 mb-1">
                    {c.etiqueta} {c.obligatorio && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id={`map-${c.campo}`}
                    value={mapeo[c.campo] ?? ""}
                    onChange={(e) => {
                      setMapeo({ ...mapeo, [c.campo]: e.target.value });
                      setValidacion(null);
                    }}
                    className={campoClase}
                  >
                    <option value="">— No usar —</option>
                    {LETRAS.map((l) => (
                      <option key={l} value={l}>
                        Columna {l}{estructura?.encabezados?.[l] ? ` — ${estructura.encabezados[l]}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!mapeoCompleto && <p className="text-xs text-red-600">Asigna al menos las columnas N° y Entregable.</p>}
            <p className="text-xs text-gray-500">Los selectores ya vienen con lo que se detectó automáticamente; cámbialos solo si el Excel tiene otro orden de columnas.</p>
          </div>
        )}

        {/* 4 */}
        {paso === 3 && (
          <div className="space-y-5">
            <h2 className="text-gray-800">4. Destino y validación</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Semestre de destino</label>
                <AppSelect
                  value={semestre}
                  onValueChange={(v) => { setSemestre(v); setGrupoId(""); setValidacion(null); }}
                  options={semestres.map((s) => ({ value: s, label: s }))}
                  placeholder="Selecciona el semestre"
                />
              </div>
              <div>
                <span className="block text-xs text-gray-600 mb-1">Grupo de matriz</span>
                <div className="flex gap-4 text-sm py-2">
                  {([["nuevo_grupo", "Crear grupo nuevo"], ["grupo_existente", "Completar grupo existente"]] as const).map(([v, t]) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input type="radio" name="modo" checked={modo === v} onChange={() => { setModo(v); setValidacion(null); }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {modo === "grupo_existente" ? (
              <div className="max-w-md">
                <label className="block text-xs text-gray-600 mb-1">Grupo del semestre {semestre}</label>
                <AppSelect
                  value={grupoId}
                  onValueChange={(v) => { setGrupoId(v); setValidacion(null); }}
                  options={grupos.map((g) => ({ value: String(g.id), label: g.nombre }))}
                  placeholder="Selecciona el grupo"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["nombre", "Nombre del grupo"], ["horas_totales", "Horas totales"], ["num_proyectos", "Proyectos"], ["num_actividades", "Actividades"],
                  ["num_convenios_nuevos", "Convenios nuevos"], ["num_convenios_dinamizados", "Convenios dinamizados"],
                ] as const).map(([k, t]) => (
                  <div key={k} className={k === "nombre" ? "sm:col-span-2" : ""}>
                    <label htmlFor={`g-${k}`} className="block text-xs text-gray-600 mb-1">{t}</label>
                    <input
                      id={`g-${k}`}
                      type={k === "nombre" ? "text" : "number"}
                      min={0}
                      placeholder={k === "nombre" ? "Ej.: Grupo 1 - Antiguo 24h" : undefined}
                      value={grupoNuevo[k]}
                      onChange={(e) => { setGrupoNuevo({ ...grupoNuevo, [k]: e.target.value }); setValidacion(null); }}
                      className={campoClase}
                    />
                  </div>
                ))}
                <div>
                  <label htmlFor="g-tipo" className="block text-xs text-gray-600 mb-1">Tipo de docente</label>
                  <select id="g-tipo" value={grupoNuevo.tipo_docente} onChange={(e) => { setGrupoNuevo({ ...grupoNuevo, tipo_docente: e.target.value }); setValidacion(null); }} className={campoClase}>
                    <option value="ANTIGUO">ANTIGUO</option>
                    <option value="NUEVO">NUEVO</option>
                  </select>
                </div>
              </div>
            )}

            <div className="max-w-md">
              <label className="block text-xs text-gray-600 mb-1">Asignar a un docente (opcional)</label>
              <AppSelect
                value={docenteId}
                onValueChange={(v) => { setDocenteId(v); setValidacion(null); }}
                options={docentes.map((d) => ({ value: String(d.id), label: d.name }))}
                placeholder="No asignar"
                emptyValue="__ninguno__"
              />
            </div>

            <button
              type="button"
              disabled={!destinoCompleto || cargando}
              onClick={() => void validar(decisiones)}
              className="px-4 py-2 bg-brand hover:bg-brand-strong text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Validar (sin guardar)
            </button>
            {!destinoCompleto && (
              <p className="text-xs text-gray-500 -mt-3">
                {modo === "nuevo_grupo" ? "Escribe el nombre del grupo y las horas totales para poder validar." : "Selecciona el grupo que se va a completar."}
              </p>
            )}
            <div ref={resultadosRef} />

            {validacion && (
              <div className="space-y-4">
                {decisionesTomadas.length > 0 && (
                  <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-3 space-y-1">
                    <p className="text-sm text-emerald-900">Decisiones tomadas</p>
                    {decisionesTomadas.map(({ id, valor, d }) => (
                      <p key={id} className="text-xs text-gray-700 flex flex-wrap gap-2 items-center">
                        <span className="flex-1 min-w-[12rem]">{d!.opciones.find((o) => o.valor === valor)?.texto ?? valor}</span>
                        <button type="button" disabled={cargando} onClick={() => void cambiarDecision(id)} className="text-brand hover:underline">Cambiar</button>
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    ["Válidos", num(r?.validas), "text-emerald-700 bg-emerald-50"],
                    ["Advertencias", num(r?.advertencias), "text-amber-700 bg-amber-50"],
                    ["Errores", num(r?.errores), "text-red-700 bg-red-50"],
                    ["Pendientes de decisión", num(r?.pendientes), "text-purple-700 bg-purple-50"],
                  ].map(([t, v, c]) => (
                    <div key={String(t)} className={`rounded-xl p-4 ${c}`}>
                      <p className="text-2xl" style={{ fontWeight: 700 }}>{v}</p>
                      <p className="text-xs">{t}</p>
                    </div>
                  ))}
                </div>
                {validacion.errores_globales.map((e) => (
                  <p key={e.codigo} className="flex gap-2 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {e.texto}
                  </p>
                ))}
                {validacion.avisos_globales.map((e) => (
                  <p key={e.codigo} className="flex gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {e.texto}
                  </p>
                ))}
                {validacion.decisiones_requeridas.map((d) => (
                  <fieldset key={d.id} className="border border-purple-200 bg-purple-50/50 rounded-lg p-3">
                    <legend className="text-sm text-purple-900 px-1">Decisión requerida</legend>
                    <p className="text-sm text-gray-700 mb-2">{d.pregunta}</p>
                    {d.opciones.map((o) => (
                      <label key={o.valor} className="flex items-start gap-2 text-sm py-1">
                        <input type="radio" name={`dec-${d.id}`} className="mt-1" disabled={cargando} onChange={() => void decidir(d.id, o.valor)} />
                        <span>
                          {o.texto}
                          {d.recomendada === o.valor && <span className="ml-2 text-xs text-emerald-700">Recomendada</span>}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5 */}
        {paso === 4 && validacion && (
          <div className="space-y-4">
            <h2 className="text-gray-800">5. Previsualizar cambios</h2>
            <p className="text-sm text-gray-600">
              Se <strong>crearán {num(r?.crear)}</strong>, se <strong>actualizarán {num(r?.actualizar)}</strong>, {num(r?.sin_cambios)} ya existen sin cambios,
              se <strong>omitirán {num(r?.omitir)}</strong> y se <strong>rechazarán {num(r?.rechazar)}</strong>. Las plantillas que ya tienen reportes de docentes no se modifican.
            </p>
            <div className="flex flex-wrap gap-2">
              {[["todas", "Todas"], ["valida", "Válidas"], ["advertencia", "Advertencias"], ["error", "Errores"], ["pendiente", "Pendientes"], ["duplicadas", `Duplicadas (${nDuplicadas})`]].map(([v, t]) => (
                <button key={v} type="button" onClick={() => setFiltro(v)} className={`px-3 py-1 rounded-full text-xs ${filtro === v ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase sticky top-0">
                  <tr>
                    {["N°", "Entregable", "Semana / mes", "Fechas", "Horas", "Acción", "Observaciones"].map((c) => (
                      <th key={c} className="text-left px-3 py-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 align-top">
                  {filasVisibles.map((f) => (
                    <tr key={f.orden} className={f.estado === "error" ? "bg-red-50/60" : f.estado === "pendiente" ? "bg-purple-50/60" : f.estado === "advertencia" ? "bg-amber-50/40" : ""}>
                      <td className="px-3 py-1.5">
                        {f.numero ?? "—"}
                        {f.numero_original != null && <span className="text-amber-600"> (era {f.numero_original})</span>}
                      </td>
                      <td className="px-3 py-1.5 max-w-xs">{f.entregable || "—"}</td>
                      <td className="px-3 py-1.5">{f.semana ?? "—"} · {f.mes ?? "—"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{formatDateOnly(f.fecha_inicio)} – {formatDateOnly(f.fecha_fin)}</td>
                      <td className="px-3 py-1.5">{f.horas ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full ${ACCION[f.accion]?.clase ?? "bg-gray-100"}`}>{ACCION[f.accion]?.texto ?? f.accion}</span>
                      </td>
                      <td className="px-3 py-1.5 space-y-0.5">
                        {f.mensajes.map((m, i) => (
                          <p key={i} className={`flex gap-1 ${m.nivel === "error" ? "text-red-700" : m.nivel === "pendiente" ? "text-purple-700" : "text-amber-700"}`}>
                            {m.nivel === "error" ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                            <span>{m.texto}{m.detalle ? ` — ${m.detalle}` : ""}</span>
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {validacion.filas_truncadas && <p className="text-xs text-gray-500">Se muestran las primeras filas; el resumen incluye todas.</p>}
            {filasConError > 0 && (
              <label className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <input type="checkbox" className="mt-1" checked={omitirErrores} onChange={(e) => { setOmitirErrores(e.target.checked); setEntiendo(false); }} />
                Importar solo las filas válidas y omitir las que tienen errores ({filasConError}). Las filas con errores nunca se guardan.
              </label>
            )}
          </div>
        )}

        {/* 6 */}
        {paso === 5 && validacion && (
          <div className="space-y-4">
            <h2 className="text-gray-800">6. Confirmar importación</h2>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
              <li>Archivo: <strong>{archivo?.nombre}</strong> · semestre <strong>{semestre}</strong> · {modo === "nuevo_grupo" ? `grupo nuevo «${grupoNuevo.nombre}»` : "grupo existente"}</li>
              <li>{num(r?.crear)} entregables nuevos, {num(r?.actualizar)} actualizados, {num(r?.sin_cambios)} sin cambios, {num(r?.omitir)} omitidos, {filasConError} rechazados.</li>
              <li>{num(r?.horas_programadas)} horas programadas en la matriz.</li>
              {docenteId && <li>El grupo se asignará al docente seleccionado.</li>}
              <li>No se borra ningún dato existente; la importación queda registrada con su identificador de lote.</li>
            </ul>
            <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-2xl">
              <input type="checkbox" className="mt-1" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
              Entiendo que al confirmar se escribirán estos entregables en la base de datos de ProySocial.
            </label>
            <button
              type="button"
              disabled={!confirmable || cargando || !entiendo}
              onClick={() => void confirmar()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar importación
            </button>
            {!confirmable && <p className="text-xs text-red-600">Resuelve las decisiones, errores o confirma omitir las filas con errores antes de importar.</p>}
          </div>
        )}

        {/* 7 */}
        {paso === 6 && resultado && (
          <div className="space-y-4">
            <h2 className="text-gray-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> 7. Resultado</h2>
            {resultado.sin_cambios ? (
              <p className="text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2">
                {resultado.mensaje ?? "La matriz ya contenía estos entregables."} No se duplicó ningún registro ni se creó un nuevo lote.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500">Lote <code>{resultado.lote}</code> · {formatDateTimeBogota(resultado.creado_en)}</p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[["Creadas", "creadas"], ["Actualizadas", "actualizadas"], ["Sin cambios", "sin_cambios"], ["Omitidas", "omitidas"], ["Rechazadas", "rechazadas"]].map(([t, k]) => (
                    <div key={k} className="rounded-xl bg-gray-50 p-4">
                      <p className="text-2xl" style={{ fontWeight: 700 }}>{num(resultado.resumen[k])}</p>
                      <p className="text-xs text-gray-500">{t}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {decisionesTomadas.length > 0 && (
              <div className="text-xs text-gray-600 border border-gray-100 rounded-lg p-3 space-y-1">
                <p className="text-gray-800">Ajustes administrativos aplicados (quedan registrados en el lote):</p>
                {decisionesTomadas.map(({ id, valor, d }) => (
                  <p key={id}>• {d!.opciones.find((o) => o.valor === valor)?.texto ?? valor}</p>
                ))}
                <p className="text-gray-500">Las fechas originales del Excel no se modificaron.</p>
              </div>
            )}
            {resultado.grupo_id != null && (
              <div className="border border-gray-100 rounded-lg p-4 space-y-3">
                <p className="text-sm text-gray-800">Siguientes pasos</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/sistema?tab=plantillas&semestre=${encodeURIComponent(semestre)}&grupo=${resultado.grupo_id}`)}
                    className="px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-strong"
                  >
                    Ver matriz del grupo
                  </button>
                  {(asignado ?? (resultado.resumen.docente_asignado_id as number | null)) != null && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/docentes/${asignado ?? resultado.resumen.docente_asignado_id}/matriz`)}
                      className="px-4 py-2 border border-brand text-brand rounded-lg text-sm hover:bg-blue-50"
                    >
                      Abrir matriz del docente
                    </button>
                  )}
                </div>
                {(asignado ?? (resultado.resumen.docente_asignado_id as number | null)) == null && (
                  <div className="flex flex-wrap items-end gap-2 max-w-xl">
                    <div className="flex-1 min-w-[14rem]">
                      <label className="block text-xs text-gray-600 mb-1">Asignar este grupo a un docente</label>
                      <AppSelect value={docenteResultado} onValueChange={setDocenteResultado} options={docentes.map((d) => ({ value: String(d.id), label: d.name }))} placeholder="Selecciona el docente" emptyValue="__ninguno__" />
                    </div>
                    <button type="button" disabled={!docenteResultado || asignando} onClick={() => void asignarDocente()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                      {asignando && <Loader2 className="w-4 h-4 animate-spin" />} Asignar
                    </button>
                  </div>
                )}
                {asignado != null && <p className="text-xs text-emerald-700">Grupo asignado: el docente ya ve esta matriz en su sección «Matriz de seguimiento».</p>}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={reiniciar} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Importar otra matriz</button>
            </div>
          </div>
        )}

        {paso < 6 && (
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <button type="button" disabled={paso === 0 || cargando} onClick={() => setPaso(paso - 1)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">
              Atrás
            </button>
            {paso < 5 && (
              <button
                type="button"
                disabled={!puedeAvanzar || cargando}
                onClick={() => setPaso(paso + 1)}
                className="px-4 py-2 bg-brand hover:bg-brand-strong text-white rounded-lg text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ds-panel">
        <h3 className="text-gray-800 px-5 py-4 border-b border-gray-100">Historial de importaciones</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {["Fecha", "Archivo", "Semestre", "Grupo", "Creadas", "Actualizadas", "Usuario"].map((c) => (
                  <th key={c} className="text-left px-4 py-2">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historial.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">Aún no hay importaciones.</td></tr>
              )}
              {historial.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTimeBogota(h.creado_en)}</td>
                  <td className="px-4 py-2">{h.archivo_nombre ?? "—"}</td>
                  <td className="px-4 py-2">{h.semestre}</td>
                  <td className="px-4 py-2">{h.grupo_nombre ?? "—"}</td>
                  <td className="px-4 py-2">{num(h.resumen?.creadas)}</td>
                  <td className="px-4 py-2">{num(h.resumen?.actualizadas)}</td>
                  <td className="px-4 py-2">{h.usuario ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}
