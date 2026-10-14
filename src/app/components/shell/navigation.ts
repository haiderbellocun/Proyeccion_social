import {
  BarChart3,
  ClipboardCheck,
  FileEdit,
  FileSpreadsheet,
  FolderKanban,
  Gauge,
  History,
  LayoutDashboard,
  LineChart,
  Paperclip,
  Settings2,
  TableProperties,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}
export interface ShellConfig {
  rol: "admin" | "docente";
  roleLabel: string;
  tagline: string;
  home: string;
  groups: NavGroup[];
  /** Enlaces de pie (se muestran sobre la tarjeta de usuario). */
  footer: NavItem[];
  profileLabel: string;
  profileTo: string;
  /** Endpoint que devuelve { total_no_leidas } */
  notificationsUrl: (userId: number) => string;
}

/* La navegación depende del rol: un docente nunca recibe los módulos administrativos. */
export const ADMIN_SHELL: ShellConfig = {
  rol: "admin",
  roleLabel: "Administrador",
  tagline: "Coordinación",
  home: "/admin",
  groups: [
    {
      label: "Operación",
      items: [
        { to: "/admin", label: "Panel", icon: LayoutDashboard, end: true },
        { to: "/admin/revision", label: "Revisión de reportes", icon: ClipboardCheck },
        { to: "/admin/avance", label: "Avance consolidado", icon: Gauge },
      ],
    },
    {
      label: "Análisis",
      items: [
        { to: "/admin/indicadores", label: "Indicadores", icon: LineChart },
        { to: "/admin/reportes", label: "Reportes y métricas", icon: BarChart3 },
      ],
    },
    {
      label: "Gestión",
      items: [
        { to: "/admin/importar-matriz", label: "Importar matriz", icon: FileSpreadsheet },
        { to: "/admin/sistema", label: "Administración", icon: Settings2 },
      ],
    },
  ],
  footer: [],
  profileLabel: "Administrar usuarios",
  profileTo: "/admin/sistema",
  notificationsUrl: () => "/admin/notificaciones",
};

export const TEACHER_SHELL: ShellConfig = {
  rol: "docente",
  roleLabel: "Docente",
  tagline: "Proyección Social",
  home: "/docente",
  groups: [
    {
      label: "Mi trabajo",
      items: [
        { to: "/docente", label: "Inicio", icon: LayoutDashboard, end: true },
        { to: "/docente/matriz", label: "Matriz de seguimiento", icon: TableProperties },
        { to: "/docente/evidencias", label: "Evidencias", icon: Paperclip },
      ],
    },
    {
      label: "Iniciativas",
      items: [
        { to: "/docente/proyectos", label: "Mis iniciativas", icon: FolderKanban },
        { to: "/docente/reportar", label: "Reportar entregable", icon: FileEdit },
        { to: "/docente/historial", label: "Historial", icon: History },
      ],
    },
  ],
  footer: [{ to: "/docente/perfil", label: "Perfil", icon: UserRound }],
  profileLabel: "Mi perfil",
  profileTo: "/docente/perfil",
  notificationsUrl: (id) => `/docente/${id}/notificaciones`,
};

const TAB_SISTEMA: Record<string, string> = {
  usuarios: "Usuarios",
  semestres: "Semestres",
  programas: "Programas",
  proyectos: "Iniciativas",
  tareas: "Grupos y tareas",
  plantillas: "Plantillas de matriz",
};

/** Migas de pan: sección › página. Se resuelve por ruta para que no dependa de cada pantalla. */
export function migasDe(pathname: string, search: string, cfg: ShellConfig): { label: string; to?: string }[] {
  const raiz = { label: cfg.rol === "admin" ? "Panel" : "Inicio", to: cfg.home };
  if (pathname === cfg.home || pathname === `${cfg.home}/`) return [{ label: raiz.label }];

  if (/^\/admin\/docentes\/[^/]+\/matriz/.test(pathname)) return [raiz, { label: "Avance consolidado", to: "/admin/avance" }, { label: "Matriz del docente" }];
  if (/^\/docente\/proyectos\/[^/]+/.test(pathname)) return [raiz, { label: "Mis iniciativas", to: "/docente/proyectos" }, { label: "Detalle" }];

  const todos = [...cfg.groups.flatMap((g) => g.items.map((i) => ({ ...i, grupo: g.label }))), ...cfg.footer.map((i) => ({ ...i, grupo: "Cuenta" }))];
  const item = todos.filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  if (!item) return [raiz];
  const migas: { label: string; to?: string }[] = [raiz, { label: item.label, to: item.to }];
  if (item.to === "/admin/sistema") {
    const tab = new URLSearchParams(search).get("tab");
    if (tab && TAB_SISTEMA[tab]) migas.push({ label: TAB_SISTEMA[tab] });
  }
  migas[migas.length - 1] = { label: migas[migas.length - 1].label };
  return migas;
}
