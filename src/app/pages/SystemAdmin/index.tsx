import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { Building2, Calendar, CalendarRange, FileText, FolderKanban, Users } from "lucide-react";
import { Page, PageHeader } from "../../components/ds/primitives";
import UserManagement from "./UserManagement";
import ProjectManagement from "./ProjectManagement";
import GroupManagement from "./GroupManagement";
import PlantillaManagement from "./PlantillaManagement";
import ProgramManagement from "./ProgramManagement";
import SemesterManagement from "./SemesterManagement";

type TabType = "usuarios" | "semestres" | "programas" | "proyectos" | "tareas" | "plantillas";

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: "usuarios", label: "Usuarios", icon: Users },
  { id: "semestres", label: "Semestres", icon: CalendarRange },
  { id: "programas", label: "Escuelas y programas", icon: Building2 },
  { id: "proyectos", label: "Iniciativas", icon: FolderKanban },
  { id: "tareas", label: "Tareas semanales", icon: Calendar },
  { id: "plantillas", label: "Plantillas", icon: FileText },
];

export default function SystemAdminPage() {
  // Enlaces profundos: /admin/sistema?tab=plantillas&semestre=2026B&grupo=12
  const [params] = useSearchParams();
  const tabParam = params.get("tab") as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : "usuarios");
  const grupoParam = Number(params.get("grupo"));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Navegación con flechas / Inicio / Fin (patrón WAI-ARIA de pestañas).
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  return (
    <Page>
      <PageHeader
        title="Administración del sistema"
        description="Gestiona usuarios, semestres, escuelas, programas, iniciativas, tareas semanales y plantillas."
      />

      <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label="Secciones de administración" className="flex min-w-max gap-1">
          {tabs.map((tab, index) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:border-line-strong hover:text-text"
                }`}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                <tab.icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="space-y-5">
        {activeTab === "usuarios" && <UserManagement />}
        {activeTab === "semestres" && <SemesterManagement />}
        {activeTab === "programas" && <ProgramManagement />}
        {activeTab === "proyectos" && <ProjectManagement />}
        {activeTab === "tareas" && <GroupManagement />}
        {activeTab === "plantillas" && (
          <PlantillaManagement
            initialSemestre={params.get("semestre") || undefined}
            initialGrupoId={Number.isInteger(grupoParam) && grupoParam > 0 ? grupoParam : null}
          />
        )}
      </div>
    </Page>
  );
}
