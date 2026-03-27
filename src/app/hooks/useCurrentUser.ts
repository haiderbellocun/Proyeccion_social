export interface CurrentUser {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: "docente" | "admin";
}

export function useCurrentUser(): CurrentUser | null {
  const raw = window.localStorage.getItem("proysocial:user");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.user ?? parsed ?? null;
    if (!candidate || candidate.id == null) return null;
    return {
      id: Number(candidate.id),
      nombre: String(candidate.nombre ?? ""),
      apellido: String(candidate.apellido ?? ""),
      correo: String(candidate.correo ?? ""),
      rol: candidate.rol === "admin" ? "admin" : "docente",
    };
  } catch {
    return null;
  }
}

