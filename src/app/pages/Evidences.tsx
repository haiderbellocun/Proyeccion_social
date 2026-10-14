import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { AppSelect } from "../components/AppSelect";
import { AvisoAcceso, EnlaceEvidencia, esHttp, type EvidenciaEnlace } from "../components/EnlaceEvidencia";
import { HistorialEntregable } from "../components/HistorialEntregable";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";
import { formatDateOnly, formatDateTimeBogota } from "../lib/date";

type Situacion = "sin_evidencia" | "borrador" | "observada" | "en_revision" | "aprobada" | "sin_requisito";

type Evidencia = EvidenciaEnlace;

interface ItemEvidencia {
  plantilla_id: number;
  entregable_id: number | null;
  numero: number;
  entregable: string;
  mes: string;
  semana_numero: number;
  iniciativa_id: number | null;
  iniciativa_titulo: string | null;
  iniciativa_tipo: string | null;
  fecha_fin: string | null;
  estado: string;
  situacion: Situacion;
  vencido: boolean;
  entrega_tardia: boolean;
  requiere_evidencia: boolean;
  tipo_evidencia: string;
  descripcion_evidencia: string;
  enlace_referencia: string | null;
  comentario_revision: string | null;
  revisado_en: string | null;
  num_envios: number;
  evidencia_exenta: boolean;
  justificacion_exencion: string | null;
  problema_acceso: boolean;
  evidencias: Evidencia[];
  versiones_anteriores: Evidencia[];
  puede_editar: boolean;
}

interface Centro {
  semestre: string | null;
  items: ItemEvidencia[];
  iniciativas: { id: number; titulo: string; tipo: string }[];
  resumen: Record<Situacion, number> & { total: number; vencidos_sin_enviar: number };
}

interface Borrador {
  urls: string[];
  justificacion: string;
  sinEvidencia: boolean;
  proyectoId: string;
  aviso: string | null;
  candidatos: { id: number; titulo: string }[] | null;
  guardando: boolean;
}

const SITUACION: Record<Situacion, { etiqueta: string; clase: string; ayuda: string }> = {
  sin_evidencia: { etiqueta: "Sin evidencia", clase: "bg-gray-100 text-gray-700", ayuda: "Falta adjuntar la evidencia" },
  borrador: { etiqueta: "Borrador", clase: "bg-blue-50 text-blue-700", ayuda: "Guardado, aún no enviado a revisión" },
  observada: { etiqueta: "Observada", clase: "bg-amber-100 text-amber-800", ayuda: "El revisor pidió correcciones" },
  en_revision: { etiqueta: "En revisión", clase: "bg-purple-100 text-purple-700", ayuda: "Esperando la revisión de coordinación" },
  aprobada: { etiqueta: "Aprobada", clase: "bg-emerald-100 text-emerald-700", ayuda: "Aprobada por coordinación" },
  sin_requisito: { etiqueta: "No requiere evidencia", clase: "bg-gray-50 text-gray-500", ayuda: "Este entregable no exige cargue" },
};

const FILTROS: { id: Situacion | "todas" | "vencidas"; etiqueta: string }[] = [
  { id: "todas", etiqueta: "Todas" },
  { id: "sin_evidencia", etiqueta: "Sin evidencia" },
  { id: "observada", etiqueta: "Observadas" },
  { id: "borrador", etiqueta: "Borradores" },
  { id: "en_revision", etiqueta: "En revisión" },
  { id: "aprobada", etiqueta: "Aprobadas" },
  { id: "vencidas", etiqueta: "Vencidas" },
];

export default function Evidences() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? null;
  const [params] = useSearchParams();
  const destacado = Number(params.get("entregable")) || null;

  const [centro, setCentro] = useState<Centro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todas");
  const [iniciativa, setIniciativa] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});
  const [borradores, setBorradores] = useState<Record<number, Borrador>>({});
  const [historialAbierto, setHistorialAbierto] = useState<Record<number, boolean>>({});
  const scrolled = useRef(false);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      setCargando(true);
      setError(null);
      const res = await fetch(`${API_BASE}/docente/${userId}/evidencias`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : "No se pudo cargar tus evidencias");
      }
      setCentro((await res.json()) as Centro);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Enlace desde la matriz: ?entregable=<plantilla_id> abre y enfoca esa tarjeta
  useEffect(() => {
    if (!destacado || !centro || scrolled.current) return;
    const item = centro.items.find((i) => i.plantilla_id === destacado);
    if (!item) return;
    scrolled.current = true;
    setFiltro("todas");
    setAbiertos((a) => ({ ...a, [destacado]: true }));
    setTimeout(() => document.getElementById(`ev-${destacado}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  }, [destacado, centro]);

  const visibles = useMemo(() => {
    if (!centro) return [];
    const texto = busqueda.trim().toLowerCase();
    return centro.items.filter((i) => {
      if (filtro === "vencidas") {
        if (!(i.vencido && i.situacion !== "aprobada" && i.situacion !== "en_revision")) return false;
      } else if (filtro !== "todas" && i.situacion !== filtro) return false;
      if (iniciativa !== "all" && String(i.iniciativa_id ?? "") !== iniciativa) return false;
      if (texto && !`${i.entregable} ${i.iniciativa_titulo ?? ""} ${i.mes}`.toLowerCase().includes(texto)) return false;
      return true;
    });
  }, [centro, filtro, iniciativa, busqueda]);

  const conteo = (id: (typeof FILTROS)[number]["id"]) => {
    if (!centro) return 0;
    if (id === "todas") return centro.resumen.total;
    if (id === "vencidas") return centro.resumen.vencidos_sin_enviar;
    return centro.resumen[id];
  };

  const abrirEditor = (item: ItemEvidencia) => {
    setAbiertos((a) => ({ ...a, [item.plantilla_id]: !a[item.plantilla_id] }));
    setBorradores((b) =>
      b[item.plantilla_id]
        ? b
        : {
            ...b,
            [item.plantilla_id]: {
              urls: item.evidencias.length ? item.evidencias.map((e) => e.url) : [""],
              justificacion: item.justificacion_exencion ?? "",
              sinEvidencia: item.evidencia_exenta,
              proyectoId: item.iniciativa_id ? String(item.iniciativa_id) : "",
              aviso: null,
              candidatos: null,
              guardando: false,
            },
          }
    );
  };

  const editar = (id: number, cambio: Partial<Borrador>) => setBorradores((b) => ({ ...b, [id]: { ...b[id], ...cambio } }));

  const guardar = async (item: ItemEvidencia, enviar: boolean) => {
    const d = borradores[item.plantilla_id];
    if (!d || !userId) return;
    const urls = d.urls.map((u) => u.trim()).filter(Boolean);
    const malo = urls.find((u) => !esHttp(u));
    if (malo) return editar(item.plantilla_id, { aviso: `«${malo}» no es un enlace válido: debe iniciar con http:// o https://` });
    const justificacion = d.sinEvidencia ? d.justificacion.trim() : "";
    if (enviar && item.requiere_evidencia && urls.length === 0 && !justificacion) {
      return editar(item.plantilla_id, { aviso: "Agrega al menos un enlace o marca «No aplica evidencia» y justifícalo (mínimo 10 caracteres)." });
    }
    if (!enviar && urls.length === 0 && !justificacion && !item.entregable_id) {
      return editar(item.plantilla_id, { aviso: "Escribe al menos un enlace para guardar." });
    }
    editar(item.plantilla_id, { aviso: null, guardando: true });
    try {
      const proyecto = d.proyectoId ? { proyecto_id: Number(d.proyectoId) } : {};
      const exencion = d.sinEvidencia ? { justificacion_exencion: justificacion } : {};
      const res =
        !enviar && item.entregable_id
          ? await fetch(`${API_BASE}/docente/entregables/${item.entregable_id}/evidencias`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ urls_evidencia: urls, ...exencion }),
            })
          : await fetch(`${API_BASE}/docente/${userId}/matriz/${item.plantilla_id}/completar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completado: enviar, urls_evidencia: urls, ...exencion, ...proyecto }),
            });
      const data = (await res.json().catch(() => ({}))) as { error?: string; codigo?: string; candidatos?: { id: number; titulo: string }[] };
      if (res.status === 409 && data.codigo === "INICIATIVA_AMBIGUA" && data.candidatos) {
        return editar(item.plantilla_id, { guardando: false, candidatos: data.candidatos, aviso: "Tienes varias iniciativas posibles: elige a cuál corresponde y vuelve a intentar." });
      }
      if (!res.ok) return editar(item.plantilla_id, { guardando: false, aviso: data.error ?? "No se pudo guardar la evidencia." });
      notify.success(enviar ? "Entregable enviado para revisión" : "Evidencia guardada");
      setBorradores((b) => {
        const n = { ...b };
        delete n[item.plantilla_id];
        return n;
      });
      setAbiertos((a) => ({ ...a, [item.plantilla_id]: false }));
      await cargar();
    } catch {
      editar(item.plantilla_id, { guardando: false, aviso: "Error de conexión. Tus cambios siguen aquí: intenta de nuevo." });
    }
  };

  const retirar = async (item: ItemEvidencia) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/docente/${userId}/matriz/${item.plantilla_id}/completar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completado: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return notify.error(data.error ?? "No se pudo retirar el envío");
      notify.success("Envío retirado: ya puedes corregir la evidencia");
      await cargar();
    } catch {
      notify.error("Error de conexión");
    }
  };

  const verHistorial = (item: ItemEvidencia) => {
    if (!item.entregable_id) return;
    const id = item.entregable_id;
    setHistorialAbierto((h) => ({ ...h, [id]: !h[id] }));
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-gray-900">Mis Evidencias</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Qué evidencia necesita cada entregable, en qué estado está y qué te pidió el revisor
          {centro?.semestre ? ` · semestre ${centro.semestre}` : ""}
        </p>
      </div>

      {cargando && !centro && (
        <div className="flex items-center justify-center min-h-[30vh]" role="status" aria-label="Cargando evidencias">
          <Loader2 className="w-8 h-8 animate-spin text-[#1d4ed8]" />
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm" role="alert">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[12rem]">{error}</span>
          <button type="button" onClick={() => void cargar()} className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-red-200 hover:bg-red-100">
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        </div>
      )}

      {centro && (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por situación">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  filtro === f.id ? "bg-[#1e3a8a] border-[#1e3a8a] text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {f.etiqueta} <span className={filtro === f.id ? "text-blue-100" : "text-gray-400"}>({conteo(f.id)})</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[14rem] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar entregable o iniciativa"
                aria-label="Buscar"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              />
            </div>
            {centro.iniciativas.length > 1 && (
              <div className="w-64 max-w-full">
                <AppSelect
                  value={iniciativa}
                  onValueChange={setIniciativa}
                  options={[{ value: "all", label: "Todas las iniciativas" }, ...centro.iniciativas.map((i) => ({ value: String(i.id), label: i.titulo }))]}
                />
              </div>
            )}
          </div>

          {visibles.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-sm text-gray-600">
              {centro.items.length === 0
                ? "Aún no tienes una matriz de seguimiento asignada. Cuando coordinación la asigne, tus entregables aparecerán aquí."
                : "Ningún entregable coincide con los filtros."}
            </div>
          )}

          <div className="space-y-3">
            {visibles.map((item) => {
              const s = SITUACION[item.situacion];
              const abierto = abiertos[item.plantilla_id];
              const d = borradores[item.plantilla_id];
                      const editable = item.puede_editar && item.situacion !== "en_revision" && item.situacion !== "sin_requisito";
              return (
                <article
                  key={item.plantilla_id}
                  id={`ev-${item.plantilla_id}`}
                  className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 ${destacado === item.plantilla_id ? "border-[#1d4ed8] ring-2 ring-blue-100" : "border-gray-100"}`}
                >
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 text-sm" style={{ fontWeight: 600 }}>
                        {item.numero}. {item.entregable}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.mes} · semana {item.semana_numero} · límite {formatDateOnly(item.fecha_fin)}
                        {item.iniciativa_titulo ? ` · ${item.iniciativa_titulo}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs ${s.clase}`} title={s.ayuda} style={{ fontWeight: 600 }}>{s.etiqueta}</span>
                      {item.vencido && item.situacion !== "aprobada" && item.situacion !== "en_revision" && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs bg-red-100 text-red-700" style={{ fontWeight: 600 }}>Vencido</span>
                      )}
                      {item.entrega_tardia && <span className="px-2.5 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">Entrega tardía</span>}
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-500">Evidencia requerida: </span>
                    {item.requiere_evidencia
                      ? item.descripcion_evidencia || (item.tipo_evidencia === "drive" ? "Enlace de Google Drive" : item.tipo_evidencia === "formulario" ? "Enlace del formulario institucional" : "Enlace a la evidencia")
                      : "No se requiere cargue para este entregable."}
                    {item.enlace_referencia && esHttp(item.enlace_referencia) && (
                      <a href={item.enlace_referencia} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#1d4ed8] hover:underline inline-flex items-center gap-1">
                        Ver referencia <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {item.problema_acceso && (
                    <div className="flex gap-2 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-900" role="alert">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        <span style={{ fontWeight: 600 }}>Coordinación no pudo abrir tu evidencia.</span>{" "}
                        Revisa los permisos del enlace en tu Drive (compártelo con las cuentas de coordinación) y vuelve a enviar el entregable. No necesitas cambiar el contenido.
                      </p>
                    </div>
                  )}
                  {item.situacion === "observada" && (
                    <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-900" role="note">
                      <p style={{ fontWeight: 600 }}>Observación del revisor{item.revisado_en ? ` · ${formatDateTimeBogota(item.revisado_en)}` : ""}</p>
                      <p className="mt-0.5">{item.comentario_revision || "El revisor solicitó correcciones."}</p>
                    </div>
                  )}
                  {item.evidencia_exenta && item.justificacion_exencion && (
                    <p className="text-xs text-gray-600"><span className="text-gray-500">Justificación («No aplica evidencia»): </span>{item.justificacion_exencion}</p>
                  )}

                  {item.evidencias.length > 0 && (
                    <div className="space-y-1.5">
                      {item.evidencias.map((e) => <EnlaceEvidencia key={e.id} e={e} />)}
                    </div>
                  )}

                  {item.versiones_anteriores.length > 0 && (
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer select-none">Versiones anteriores ({item.versiones_anteriores.length})</summary>
                      <div className="space-y-1.5 mt-2">{item.versiones_anteriores.map((e) => <EnlaceEvidencia key={e.id} e={e} anterior />)}</div>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {editable && (
                      <button type="button" onClick={() => abrirEditor(item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#1e3a8a] text-white hover:bg-[#1d4ed8]">
                        {abierto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {item.situacion === "observada" ? "Corregir y reenviar" : item.evidencias.length ? "Editar evidencia" : "Adjuntar evidencia"}
                      </button>
                    )}
                    {item.situacion === "en_revision" && (
                      <button type="button" onClick={() => void retirar(item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50">
                        Retirar envío para corregir
                      </button>
                    )}
                    {item.entregable_id && (
                      <button type="button" onClick={() => verHistorial(item)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-700 hover:bg-gray-50">
                        <History className="w-4 h-4" /> Historial
                      </button>
                    )}
                    <Link to="/docente/matriz" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:underline">
                      Ver en la matriz
                    </Link>
                  </div>

                  {abierto && d && editable && (
                    <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/60">
                      <fieldset className="space-y-2" disabled={d.guardando || d.sinEvidencia}>
                        <legend className="text-xs text-gray-600">Enlaces de la evidencia (puedes agregar varios)</legend>
                        {d.urls.map((u, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input
                              value={u}
                              onChange={(e) => editar(item.plantilla_id, { urls: d.urls.map((x, i) => (i === idx ? e.target.value : x)), aviso: null })}
                              placeholder="https://drive.google.com/…"
                              aria-label={`Enlace ${idx + 1}`}
                              className={`flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm bg-white ${u.trim() && !esHttp(u) ? "border-red-300" : "border-gray-200"}`}
                            />
                            {d.urls.length > 1 && (
                              <button type="button" aria-label="Quitar enlace" onClick={() => editar(item.plantilla_id, { urls: d.urls.filter((_, i) => i !== idx) })} className="p-2 text-gray-500 hover:text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => editar(item.plantilla_id, { urls: [...d.urls, ""] })} className="inline-flex items-center gap-1 text-sm text-[#1d4ed8] hover:underline">
                          <Plus className="w-4 h-4" /> Agregar otro enlace
                        </button>
                      </fieldset>

                      {!item.requiere_evidencia ? null : (
                        <label className="flex items-start gap-2 text-sm text-gray-700">
                          <input type="checkbox" className="mt-1" checked={d.sinEvidencia} onChange={(e) => editar(item.plantilla_id, { sinEvidencia: e.target.checked })} />
                          <span>No aplica evidencia para este entregable (requiere justificación; la revisa coordinación)</span>
                        </label>
                      )}
                      {d.sinEvidencia && (
                        <textarea
                          value={d.justificacion}
                          onChange={(e) => editar(item.plantilla_id, { justificacion: e.target.value })}
                          rows={2}
                          placeholder="Explica por qué no aplica evidencia (mínimo 10 caracteres)"
                          aria-label="Justificación"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        />
                      )}

                      {d.candidatos && (
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Iniciativa a la que corresponde</label>
                          <AppSelect value={d.proyectoId} onValueChange={(v) => editar(item.plantilla_id, { proyectoId: v })} options={d.candidatos.map((c) => ({ value: String(c.id), label: c.titulo }))} placeholder="Selecciona la iniciativa" />
                        </div>
                      )}

                      <AvisoAcceso />

                      {d.aviso && (
                        <p className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {d.aviso}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={d.guardando} onClick={() => void guardar(item, false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                          {d.guardando ? "Guardando…" : "Guardar borrador"}
                        </button>
                        <button type="button" disabled={d.guardando} onClick={() => void guardar(item, true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" /> {item.situacion === "observada" ? "Reenviar a revisión" : "Enviar a revisión"}
                        </button>
                      </div>
                    </div>
                  )}

                  {item.entregable_id && historialAbierto[item.entregable_id] && (
                    <div className="border-t border-gray-100 pt-3">
                      <HistorialEntregable key={`${item.entregable_id}-${item.estado}-${item.num_envios}`} ruta={`/docente/entregables/${item.entregable_id}/historial`} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
