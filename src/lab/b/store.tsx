// Estado compartido del prototipo B: rol, ruta, búsqueda, filtro y cambios en memoria (no hay API).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { items, admin, type Item, type Revision } from "../shared/model";
import { kindOf, useToast, type Kind } from "./ui";

export type Rol = "admin" | "docente";
export type Filtro = Kind | "todos";

export const RUTAS_ADMIN = ["panel", "matriz", "revision", "indicadores", "admin", "componentes"] as const;
export const RUTAS_DOCENTE = ["panel", "matriz", "iniciativas", "evidencias", "historial", "componentes"] as const;

export interface Store {
  rol: Rol;
  setRol: (r: Rol) => void;
  ruta: string;
  ir: (r: string) => void;
  query: string;
  setQuery: (q: string) => void;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  ampliar: boolean;
  setAmpliar: (v: boolean) => void;
  estadoItem: (i: Item) => Item["estado"];
  kindItem: (i: Item) => Kind;
  marcarEnviado: (i: Item) => void;
  revisiones: (Revision & { estadoActual: Revision["estado"] })[];
  resolver: (r: Revision, estado: "aprobado" | "observado", comentario?: string) => void;
  comentarios: Record<number, string>;
  menuAbierto: boolean;
  setMenuAbierto: (v: boolean) => void;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

const leerRuta = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "panel");

export function StoreProvider({ children }: { children: ReactNode }) {
  const push = useToast();
  const [rol, setRolRaw] = useState<Rol>(() => (localStorageSeguro("b.rol") === "docente" ? "docente" : "admin"));
  const [ruta, setRuta] = useState(leerRuta);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ampliar, setAmpliar] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [ovItems, setOvItems] = useState<Record<number, Item["estado"]>>({});
  const [ovRev, setOvRev] = useState<Record<number, Revision["estado"]>>({});
  const [comentarios, setComentarios] = useState<Record<number, string>>({});

  useEffect(() => {
    const h = () => setRuta(leerRuta());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const ir = useCallback((r: string) => { location.hash = `#/${r}`; setMenuAbierto(false); }, []);
  const setRol = useCallback((r: Rol) => {
    setRolRaw(r);
    try { localStorage.setItem("b.rol", r); } catch { /* sin almacenamiento */ }
    setFiltro("todos");
    const permitidas: readonly string[] = r === "admin" ? RUTAS_ADMIN : RUTAS_DOCENTE;
    if (!permitidas.includes(leerRuta())) location.hash = "#/panel";
  }, []);

  const estadoItem = useCallback((i: Item) => ovItems[i.id] ?? i.estado, [ovItems]);
  const kindItem = useCallback((i: Item) => kindOf(i, ovItems[i.id]), [ovItems]);

  const marcarEnviado = useCallback((i: Item) => {
    const antes = ovItems[i.id];
    setOvItems((o) => ({ ...o, [i.id]: "enviado" }));
    push({
      text: `«${i.titulo.slice(0, 40)}${i.titulo.length > 40 ? "…" : ""}» enviado a revisión`,
      undo: () => setOvItems((o) => { const n = { ...o }; if (antes) n[i.id] = antes; else delete n[i.id]; return n; }),
    });
  }, [ovItems, push]);

  const revisiones = useMemo(() => admin.revisiones.map((r) => ({ ...r, estadoActual: ovRev[r.id] ?? r.estado })), [ovRev]);

  const resolver = useCallback((r: Revision, estado: "aprobado" | "observado", comentario?: string) => {
    const antes = ovRev[r.id];
    setOvRev((o) => ({ ...o, [r.id]: estado }));
    if (comentario) setComentarios((c) => ({ ...c, [r.id]: comentario }));
    push({
      text: `${estado === "aprobado" ? "Aprobado" : "Observado"}: ${r.titulo.slice(0, 38)}${r.titulo.length > 38 ? "…" : ""}`,
      undo: () => { setOvRev((o) => { const n = { ...o }; if (antes) n[r.id] = antes; else delete n[r.id]; return n; }); setComentarios((c) => { const n = { ...c }; delete n[r.id]; return n; }); },
    });
  }, [ovRev, push]);

  const value: Store = {
    rol, setRol, ruta, ir, query, setQuery, filtro, setFiltro, ampliar, setAmpliar,
    estadoItem, kindItem, marcarEnviado, revisiones, resolver, comentarios, menuAbierto, setMenuAbierto,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function localStorageSeguro(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}

export const todosItems = items;

export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    h();
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}
