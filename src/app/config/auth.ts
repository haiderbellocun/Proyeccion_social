export type UserRole = "docente" | "admin";

export interface CurrentUser {
  id: number;
  nombre: string;
  apellido: string;
  correo: string;
  rol: UserRole;
  foto_url: string | null;
}

export interface CurrentSemester {
  codigo: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_semanas: number;
}

function normalizeDateOnly(value: unknown): string | null {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

const TOKEN_KEY = "proysocial:token";
const USER_KEY = "proysocial:user";
const SEMESTER_KEY = "proysocial:semester";

export function getSessionToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function readCurrentUser(): CurrentUser | null {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw);
    if (!candidate || candidate.id == null) return null;
    return {
      id: Number(candidate.id),
      nombre: String(candidate.nombre || ""),
      apellido: String(candidate.apellido || ""),
      correo: String(candidate.correo || ""),
      rol: candidate.rol === "admin" ? "admin" : "docente",
      foto_url: candidate.foto_url ? String(candidate.foto_url) : null,
    };
  } catch {
    return null;
  }
}

export function readCurrentSemester(): CurrentSemester | null {
  const raw = window.localStorage.getItem(SEMESTER_KEY);
  if (!raw) return null;
  try {
    const semester = JSON.parse(raw);
    const fechaInicio = normalizeDateOnly(semester?.fecha_inicio);
    const fechaFin = normalizeDateOnly(semester?.fecha_fin);
    if (!semester?.codigo || !fechaInicio || !fechaFin) return null;
    return {
      codigo: String(semester.codigo),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      numero_semanas:
        Number.isFinite(Number(semester.numero_semanas)) && Number(semester.numero_semanas) > 0
          ? Number(semester.numero_semanas)
          : 16,
    };
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: CurrentUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveSessionContext(user: CurrentUser, semester: CurrentSemester | null) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (semester) {
    const fechaInicio = normalizeDateOnly(semester.fecha_inicio);
    const fechaFin = normalizeDateOnly(semester.fecha_fin);
    if (fechaInicio && fechaFin) {
      window.localStorage.setItem(
        SEMESTER_KEY,
        JSON.stringify({ ...semester, fecha_inicio: fechaInicio, fecha_fin: fechaFin })
      );
    } else {
      window.localStorage.removeItem(SEMESTER_KEY);
    }
  } else {
    window.localStorage.removeItem(SEMESTER_KEY);
  }
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(SEMESTER_KEY);
  window.google?.accounts.id.disableAutoSelect();
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback(response: { credential?: string }): void;
            cancel_on_tap_outside?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              locale?: string;
            }
          ): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}
