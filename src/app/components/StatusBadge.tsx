import { DeliveryStatus, statusConfig } from "../data/matrizConstants";

interface StatusBadgeProps {
  status: DeliveryStatus;
  pulse?: boolean;
}

export function StatusBadge({ status, pulse }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${cfg.badge}`}
      style={{ fontWeight: 500 }}
    >
      <span className={`relative flex-shrink-0 w-1.5 h-1.5 rounded-full ${cfg.dot}`}>
        {pulse && status === "semana_en_curso" && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60`} />
        )}
      </span>
      {cfg.label}
    </span>
  );
}
