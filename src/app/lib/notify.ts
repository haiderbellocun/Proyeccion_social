import { toast } from "sonner";

/** Feedback unificado para acciones del frontend (éxito / error / aviso / info). */
export const notify = {
  success(message: string, description?: string) {
    return toast.success(message, description ? { description } : undefined);
  },
  error(message: string, description?: string) {
    return toast.error(message, description ? { description } : undefined);
  },
  warning(message: string, description?: string) {
    return toast.warning(message, description ? { description } : undefined);
  },
  info(message: string, description?: string) {
    return toast.info(message, description ? { description } : undefined);
  },
  /** Extrae mensaje útil de Error, string o respuesta JSON típica `{ error }`. */
  fromError(cause: unknown, fallback = "Ocurrió un error inesperado") {
    if (typeof cause === "string" && cause.trim()) return notify.error(cause);
    if (cause instanceof Error && cause.message) return notify.error(cause.message);
    if (cause && typeof cause === "object" && "error" in cause) {
      const msg = String((cause as { error?: unknown }).error || "").trim();
      if (msg) return notify.error(msg);
    }
    return notify.error(fallback);
  },
};

export { toast };
