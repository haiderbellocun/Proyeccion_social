import { B2Shell } from "./b2/B2Shell";

/** Layout del perfil administrador: shell del diseño B2 (cabecera morada, riel lateral y barra de contexto).
 *  Para volver al diseño anterior basta con renderizar <AppShell config={ADMIN_SHELL} />. */
export function AdminLayout() {
  return <B2Shell />;
}
