import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import { API_BASE } from "../config/api";

const API_BASE_URL = API_BASE;

export interface Notificacion {
  tipo: "vencido" | "observacion" | "aprobado" | "nuevo_reporte" | "sin_actividad";
  referencia_id: number;
  mensaje: string;
  fecha: string | null;
}

export interface NotificationPanelProps {
  rol: "docente" | "admin";
  userId: number;
  onClose: () => void;
}

function iconForTipo(tipo: string) {
  switch (tipo) {
    case "vencido":
      return <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />;
    case "observacion":
      return <MessageSquare className="w-5 h-5 text-orange-500 shrink-0" />;
    case "aprobado":
      return <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />;
    case "nuevo_reporte":
      return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
    case "sin_actividad":
      return <Clock className="w-5 h-5 text-gray-400 shrink-0" />;
    default:
      return <FileText className="w-5 h-5 text-gray-400 shrink-0" />;
  }
}

export function NotificationPanel({ rol, userId, onClose }: NotificationPanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notificacion[]>([]);

  useEffect(() => {
    const url =
      rol === "admin"
        ? `${API_BASE_URL}/admin/notificaciones`
        : `${API_BASE_URL}/docente/${userId}/notificaciones`;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.notificaciones) ? data.notificaciones : [];
        if (!cancelled) {
          setItems(
            list.map((n: Record<string, unknown>) => ({
              tipo: n.tipo as Notificacion["tipo"],
              referencia_id: Number(n.referencia_id),
              mensaje: String(n.mensaje ?? ""),
              fecha: n.fecha != null ? String(n.fecha) : null,
            }))
          );
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rol, userId]);

  const formatFecha = (iso: string | null) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-[320px] bg-white rounded-xl shadow-lg border border-gray-200 z-50 flex flex-col"
      role="dialog"
      aria-label="Notificaciones"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-semibold text-gray-800">Notificaciones</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando…</span>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center px-4 py-10">
            No tienes notificaciones pendientes
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((n, idx) => (
              <li key={`${n.tipo}-${n.referencia_id}-${idx}`} className="px-4 py-3 flex gap-3">
                <div className="pt-0.5">{iconForTipo(n.tipo)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 leading-snug">{n.mensaje}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatFecha(n.fecha)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
