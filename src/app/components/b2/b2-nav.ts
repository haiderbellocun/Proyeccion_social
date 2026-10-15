// Navegación del diseño B2 para el perfil administrador. Todas las rutas son las reales de la aplicación.
import type { ComponentType, SVGProps } from "react";
import {
  ICalendario, IColumnas, ICarpeta, ICola, IDocentes, IImportar, IIndicadores, IMaletin, IMas, IPanel, IRevision, ISeguimiento, ITarea, IUsuario, IAdmin,
} from "./icons";

export type Icono = ComponentType<SVGProps<SVGSVGElement>>;

export interface Modulo {
  id: string;
  to: string;
  label: string;
  /** Etiqueta corta para la barra inferior (móvil). */
  corto: string;
  icono: Icono;
  activo: (pathname: string) => boolean;
}

export const MODULOS_ADMIN: Modulo[] = [
  { id: "panel", to: "/admin", label: "Panel", corto: "Panel", icono: IPanel, activo: (p) => p === "/admin" || p === "/admin/" },
  { id: "seguimiento", to: "/admin/avance", label: "Seguimiento", corto: "Seguimiento", icono: ISeguimiento, activo: (p) => p.startsWith("/admin/avance") || p.startsWith("/admin/docentes/") },
  { id: "revision", to: "/admin/revision", label: "Revisión", corto: "Revisión", icono: IRevision, activo: (p) => p.startsWith("/admin/revision") },
  { id: "indicadores", to: "/admin/indicadores", label: "Indicadores y reportes", corto: "Reportes", icono: IIndicadores, activo: (p) => p.startsWith("/admin/indicadores") || p.startsWith("/admin/reportes") },
  { id: "admin", to: "/admin/sistema", label: "Administración", corto: "Admin", icono: IAdmin, activo: (p) => p.startsWith("/admin/sistema") || p.startsWith("/admin/importar-matriz") },
];

export interface ItemLateral {
  to: string;
  label: string;
  icono: Icono;
  /** Enlace externo (se abre en una pestaña nueva). */
  externo?: boolean;
  /** true si coincide con la ruta (y el parámetro `tab`, cuando lo hay). */
  activo: (pathname: string, search: string) => boolean;
}

const sistemaTab = (tab: string, label: string, icono: Icono): ItemLateral => ({
  to: `/admin/sistema?tab=${tab}`,
  label,
  icono,
  activo: (p, s) => p.startsWith("/admin/sistema") && (new URLSearchParams(s).get("tab") ?? "usuarios") === tab,
});
const ruta = (to: string, label: string, icono: Icono, exacta = false): ItemLateral => ({
  to,
  label,
  icono,
  activo: (p) => (exacta ? p === to : p === to || p.startsWith(`${to}/`)),
});

/** Accesos del riel lateral: dependen del módulo activo y no repiten el menú superior. */
export function lateralPara(pathname: string): ItemLateral[][] {
  if (pathname.startsWith("/admin/sistema")) {
    return [
      [sistemaTab("usuarios", "Usuarios", IUsuario), sistemaTab("semestres", "Semestres", ICalendario), sistemaTab("programas", "Escuelas y programas", IMaletin)],
      [sistemaTab("proyectos", "Iniciativas", ICarpeta), sistemaTab("tareas", "Tareas semanales", ITarea), sistemaTab("plantillas", "Plantillas", IColumnas)],
      [ruta("/admin/importar-matriz", "Importar matriz", IImportar)],
    ];
  }
  if (pathname.startsWith("/admin/importar-matriz")) {
    return [[ruta("/admin/importar-matriz", "Importar matriz", IImportar), ruta("/admin/sistema", "Administración del sistema", IAdmin, true)]];
  }
  if (pathname.startsWith("/admin/indicadores") || pathname.startsWith("/admin/reportes")) {
    return [[ruta("/admin/indicadores", "Indicadores del grupo", IIndicadores), ruta("/admin/reportes", "Reportes y métricas", IColumnas)]];
  }
  if (pathname.startsWith("/admin/avance") || pathname.startsWith("/admin/docentes/")) {
    return [[ruta("/admin/avance", "Avance consolidado", ISeguimiento), ruta("/admin/revision", "Cola de revisión", ICola)], [ruta("/admin/importar-matriz", "Importar matriz", IImportar)]];
  }
  if (pathname.startsWith("/admin/revision")) {
    return [[ruta("/admin/revision", "Cola de revisión", ICola), ruta("/admin/avance", "Avance por docente", IDocentes)]];
  }
  // Panel
  return [
    [ruta("/admin/revision", "Cola de revisión", ICola), ruta("/admin/avance", "Avance por docente", IDocentes)],
    [ruta("/admin/importar-matriz", "Importar matriz", IImportar), ruta("/admin/reportes", "Reportes y métricas", IColumnas)],
  ];
}

/* ───────── Perfil docente (misma arquitectura, configuración distinta) ───────── */
export const MODULOS_DOCENTE: Modulo[] = [
  { id: "panel", to: "/docente", label: "Mi panel", corto: "Panel", icono: IPanel, activo: (p) => p === "/docente" || p === "/docente/" },
  { id: "matriz", to: "/docente/matriz", label: "Mi matriz", corto: "Matriz", icono: ISeguimiento, activo: (p) => p.startsWith("/docente/matriz") },
  { id: "iniciativas", to: "/docente/proyectos", label: "Iniciativas", corto: "Iniciativas", icono: IMaletin, activo: (p) => p.startsWith("/docente/proyectos") },
  { id: "evidencias", to: "/docente/evidencias", label: "Evidencias", corto: "Evidencias", icono: ICarpeta, activo: (p) => p.startsWith("/docente/evidencias") },
  { id: "historial", to: "/docente/historial", label: "Historial", corto: "Historial", icono: ICalendario, activo: (p) => p.startsWith("/docente/historial") },
];

/** Accesos del riel del docente: no repiten el menú superior. «Reportar entregable», su carpeta de Drive y «Mi perfil» viven aquí. */
export function lateralParaDocente(_pathname: string, driveUrl?: string | null): ItemLateral[][] {
  const reportar = ruta("/docente/reportar", "Reportar entregable", IMas);
  const perfil = ruta("/docente/perfil", "Mi perfil", IUsuario);
  const drive: ItemLateral[] = driveUrl && /^https?:\/\//.test(driveUrl) ? [{ to: driveUrl, externo: true, label: "Mi carpeta de Drive", icono: ICarpeta, activo: () => false }] : [];
  return [[reportar], ...(drive.length ? [drive] : []), [perfil]];
}
