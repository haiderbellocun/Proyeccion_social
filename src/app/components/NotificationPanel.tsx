import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCheck,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

const API_BASE_URL = API_BASE;

export interface Notificacion {
  tipo: "vencido" | "observacion" | "aprobado" | "nuevo_reporte" | "sin_actividad" | "mensaje_admin";
  referencia_id: number;
  mensaje: string;
  fecha: string | null;
  clave: string;
  destino: string | null;
}

export interface NotificationPanelProps {
  rol: "docente" | "admin";
  userId: number;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
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
    case "mensaje_admin":
      return <MessageSquare className="w-5 h-5 text-blue-600 shrink-0" />;
    default:
      return <FileText className="w-5 h-5 text-gray-400 shrink-0" />;
  }
}

export function NotificationPanel({
  rol,
  userId,
  onClose,
  onUnreadCountChange,
}: NotificationPanelProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Notificacion[]>([]);
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const listUrl =
    rol === "admin"
      ? `${API_BASE_URL}/admin/notificaciones`
      : `${API_BASE_URL}/docente/${userId}/notificaciones`;
  const readUrl =
    rol === "admin"
      ? `${API_BASE_URL}/admin/notificaciones/leer`
      : `${API_BASE_URL}/docente/${userId}/notificaciones/leer`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(listUrl);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No fue posible cargar las notificaciones");
        const list = Array.isArray(data.notificaciones) ? data.notificaciones : [];
        if (!cancelled) {
          const mapped = list.map((n: Record<string, unknown>) => ({
              tipo: n.tipo as Notificacion["tipo"],
              referencia_id: Number(n.referencia_id),
              mensaje: String(n.mensaje ?? ""),
              fecha: n.fecha != null ? String(n.fecha) : null,
              clave: String(
                n.clave ?? `${n.tipo}:${n.referencia_id}:${n.fecha ?? "sin-fecha"}`
              ),
              destino: n.destino != null ? String(n.destino) : null,
            }));
          setItems(mapped);
          onUnreadCountChange(mapped.length);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          onUnreadCountChange(0);
          notify.error("No se pudieron cargar las notificaciones.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listUrl, onUnreadCountChange]);

  const markAsRead = async (notifications: Notificacion[]) => {
    const response = await fetch(readUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificaciones: notifications.map((item) => ({
          clave: item.clave,
          tipo: item.tipo,
          referencia_id: item.referencia_id,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "No fue posible marcar la notificación");
    }
  };

  const handleNotificationClick = async (notification: Notificacion) => {
    if (processingKey) return;
    try {
      setProcessingKey(notification.clave);
      await markAsRead([notification]);
      const remaining = items.filter((item) => item.clave !== notification.clave);
      setItems(remaining);
      onUnreadCountChange(remaining.length);
      if (notification.destino) {
        onClose();
        navigate(notification.destino);
      }
    } catch (cause) {
      notify.fromError(cause, "No fue posible marcar la notificación");
    } finally {
      setProcessingKey(null);
    }
  };

  const handleMarkAll = async () => {
    if (items.length === 0 || processingKey) return;
    try {
      setProcessingKey("__all__");
      await markAsRead(items);
      setItems([]);
      onUnreadCountChange(0);
    } catch (cause) {
      notify.fromError(cause, "No fue posible marcar todas las notificaciones");
    } finally {
      setProcessingKey(null);
    }
  };

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
        <div className="flex items-center gap-1">
          {!loading && items.length > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              disabled={processingKey != null}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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
            {items.map((n) => (
              <li key={n.clave}>
                <button
                  type="button"
                  onClick={() => void handleNotificationClick(n)}
                  disabled={processingKey != null}
                  className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 disabled:cursor-wait disabled:opacity-60"
                  aria-label={`${n.mensaje}. ${
                    n.destino ? "Abrir detalle" : "Marcar como leída"
                  }`}
                >
                  <div className="pt-0.5">{iconForTipo(n.tipo)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 leading-snug">{n.mensaje}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatFecha(n.fecha)}</p>
                    <p className="mt-1 text-[11px] font-medium text-blue-700">
                      {n.destino ? "Abrir detalle" : "Marcar como leída"}
                    </p>
                  </div>
                  {processingKey === n.clave ? (
                    <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : n.destino ? (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                  ) : (
                    <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
