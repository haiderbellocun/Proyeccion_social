import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { AdmCabecera, TABS_ADMIN, type TabAdmin } from "../../components/b2/admin-ui";
import UserManagement from "./UserManagement";
import ProjectManagement from "./ProjectManagement";
import GroupManagement from "./GroupManagement";
import PlantillaManagement from "./PlantillaManagement";
import ProgramManagement from "./ProgramManagement";
import SemesterManagement from "./SemesterManagement";

const esTab = (v: string | null): v is TabAdmin => TABS_ADMIN.some((t) => t.id === v);

/** Administración del sistema en el diseño B2. La pestaña activa vive en la URL (?tab=...) para enlaces profundos y para el riel lateral. */
export default function SystemAdminPage() {
  // Enlaces profundos: /admin/sistema?tab=plantillas&semestre=2026B&grupo=12
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabAdmin = esTab(tabParam) ? tabParam : "usuarios";
  const grupoParam = Number(params.get("grupo"));

  const cambiarTab = useCallback((t: TabAdmin) => {
    // Los parámetros de semestre/grupo solo tienen sentido dentro de «Plantillas»
    setParams(t === "plantillas" && tab === "plantillas" ? params : { tab: t });
  }, [params, setParams, tab]);

  const cabecera = <AdmCabecera tab={tab} onTab={cambiarTab} />;

  return (
    <div className="b2-scope b2-mxp b2-vista b2-fill">
      {tab === "usuarios" && <UserManagement cabecera={cabecera} />}
      {tab === "semestres" && <SemesterManagement cabecera={cabecera} />}
      {tab === "programas" && <ProgramManagement cabecera={cabecera} />}
      {tab === "proyectos" && <ProjectManagement cabecera={cabecera} />}
      {tab === "tareas" && <GroupManagement cabecera={cabecera} />}
      {tab === "plantillas" && (
        <PlantillaManagement
          cabecera={cabecera}
          initialSemestre={params.get("semestre") || undefined}
          initialGrupoId={Number.isInteger(grupoParam) && grupoParam > 0 ? grupoParam : null}
        />
      )}
    </div>
  );
}
