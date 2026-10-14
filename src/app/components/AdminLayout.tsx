import { AppShell } from "./shell/AppShell";
import { ADMIN_SHELL } from "./shell/navigation";

/** Layout del perfil administrador: la estructura vive en shell/AppShell (compartida con el docente). */
export function AdminLayout() {
  return <AppShell config={ADMIN_SHELL} />;
}
