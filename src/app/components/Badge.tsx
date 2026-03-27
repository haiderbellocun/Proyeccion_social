export type BadgeVariant =
  | "approved"
  | "pending"
  | "delayed"
  | "review"
  | "active"
  | "inactive"
  | "project"
  | "activity"
  | "agreement"
  | "training";

const variants: Record<BadgeVariant, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  delayed: "bg-red-100 text-red-700",
  review: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-100 text-gray-600",
  project: "bg-purple-100 text-purple-700",
  activity: "bg-sky-100 text-sky-700",
  agreement: "bg-orange-100 text-orange-700",
  training: "bg-yellow-100 text-yellow-700",
};

const labels: Record<BadgeVariant, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  delayed: "Retrasado",
  review: "En Revisión",
  active: "Activo",
  inactive: "Inactivo",
  project: "Iniciativa",
  activity: "Actividad",
  agreement: "Convenio",
  training: "Capacitación",
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
}

export function Badge({ variant, label }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${variants[variant]}`}
      style={{ fontWeight: 500 }}
    >
      {label || labels[variant]}
    </span>
  );
}
