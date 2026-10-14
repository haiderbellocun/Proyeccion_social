import { StatusPill, type Tone } from "./ds/primitives";

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

const TONE_BY_VARIANT: Record<BadgeVariant, Tone> = {
  approved: "success",
  pending: "warning",
  delayed: "danger",
  review: "violet",
  active: "success",
  inactive: "neutral",
  project: "brand",
  activity: "signal",
  agreement: "warning",
  training: "warning",
};

const labels: Record<BadgeVariant, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  delayed: "Retrasado",
  review: "En revisión",
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
  return <StatusPill tone={TONE_BY_VARIANT[variant]}>{label || labels[variant]}</StatusPill>;
}
