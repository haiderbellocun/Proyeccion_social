// Navegación del diseño B2 para el perfil administrador. Todas las rutas son las reales de la aplicación.
import type { ComponentType, SVGProps } from "react";
import {
  ICalendario, IColumnas, ICarpeta, ICola, IDocentes, IImportar, IIndicadores, IMaletin, IPanel, IRevision, ISeguimiento, ITarea, IUsuario, IAdmin,
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
      [sistemaTab("usuarios", "Usuarios", IUsuario), sistemaTab("semestres", "Semestres", ICalendario), sistemaTab("programas", "Programas", IMaletin)],
      [sistemaTab("proyectos", "Iniciativas", ICarpeta), sistemaTab("tareas", "Grupos y tareas", ITarea), sistemaTab("plantillas", "Plantillas de matriz", IColumnas)],
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
