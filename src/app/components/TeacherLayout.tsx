import { AppShell } from "./shell/AppShell";
import { TEACHER_SHELL } from "./shell/navigation";

/** Layout del perfil docente: sin módulos administrativos en la navegación. */
export function TeacherLayout() {
  return <AppShell config={TEACHER_SHELL} />;
}
