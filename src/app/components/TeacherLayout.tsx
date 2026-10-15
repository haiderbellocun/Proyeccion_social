import { B2Shell } from "./b2/B2Shell";

/** Layout del perfil docente: el mismo shell B2 del administrador con la configuración del docente
 *  (sin módulos administrativos). Para volver al diseño anterior: <AppShell config={TEACHER_SHELL} />. */
export function TeacherLayout() {
  return <B2Shell rol="docente" />;
}
