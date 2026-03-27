import { useState } from "react";
import { Calendar, FolderKanban, Target, Users } from "lucide-react";
import UserManagement from "./UserManagement";
import ProjectManagement from "./ProjectManagement";
import ProfileManagement from "./ProfileManagement";
import GroupManagement from "./GroupManagement";

type TabType = "usuarios" | "proyectos" | "indicadores" | "tareas";

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: "usuarios", label: "Usuarios", icon: Users },
  { id: "proyectos", label: "Iniciativas", icon: FolderKanban },
  { id: "indicadores", label: "Indicadores", icon: Target },
  { id: "tareas", label: "Tareas semanales", icon: Calendar },
];

export default function SystemAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>("usuarios");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Administración del Sistema</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Gestión de usuarios, iniciativas e indicadores
          </p>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-[#1e3a8a] text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            }`}
            style={{ fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "usuarios" && <UserManagement />}
      {activeTab === "proyectos" && <ProjectManagement />}
      {activeTab === "indicadores" && <ProfileManagement />}
      {activeTab === "tareas" && <GroupManagement />}
    </div>
  );
}
