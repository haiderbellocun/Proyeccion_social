// ─── TIPOS ───────────────────────────────────────────────────────────────────

export type Category =
  | "capacitacion"
  | "convenio_nuevo"
  | "convenio_dinamizado"
  | "convenio"
  | "presupuesto"
  | "proyecto"
  | "actividad1"
  | "actividad2"
  | "actividad3"
  | "actividad4";

export type DeliveryStatus =
  | "no_iniciado"
  | "semana_en_curso"
  | "entrega_anticipada"
  | "entrega_a_tiempo"
  | "entrega_fuera"
  | "vencido";

export interface Deliverable {
  id: number;
  numero?: number | null;
  month: string;
  week: number;
  startDate: string;
  endDate: string;
  hours: number;
  deliverable: string;
  description: string;
  category: Category;
  indicator: string;
  phase?: string;
  completado?: boolean;
  scheduledDate: string;
  actualDate?: string;
  evidence?: string;
}

export const categoryConfig: Record<
  Category,
  { label: string; border: string; bg: string; text: string; badge: string; dot: string }
> = {
  capacitacion: {
    label: "Capacitación y Asistencia Técnica",
    border: "border-l-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400",
  },
  convenio_nuevo: {
    label: "Convenios Nuevos",
    border: "border-l-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
  convenio_dinamizado: {
    label: "Convenios Dinamizados",
    border: "border-l-teal-400",
    bg: "bg-teal-50",
    text: "text-teal-700",
    badge: "bg-teal-100 text-teal-700",
    dot: "bg-teal-400",
  },
  convenio: {
    label: "Convenios Dinamizados",
    border: "border-l-teal-400",
    bg: "bg-teal-50",
    text: "text-teal-700",
    badge: "bg-teal-100 text-teal-700",
    dot: "bg-teal-400",
  },
  presupuesto: {
    label: "Presupuesto",
    border: "border-l-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-700",
    dot: "bg-violet-400",
  },
  proyecto: {
    label: "Proyecto",
    border: "border-l-[#1d4ed8]",
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  actividad1: {
    label: "Actividad 1",
    border: "border-l-sky-400",
    bg: "bg-sky-50",
    text: "text-sky-700",
    badge: "bg-sky-100 text-sky-700",
    dot: "bg-sky-400",
  },
  actividad2: {
    label: "Actividad 2",
    border: "border-l-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-400",
  },
  actividad3: {
    label: "Actividad 3",
    border: "border-l-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    badge: "bg-rose-100 text-rose-700",
    dot: "bg-rose-400",
  },
  actividad4: {
    label: "Actividad 4",
    border: "border-l-indigo-400",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    badge: "bg-indigo-100 text-indigo-700",
    dot: "bg-indigo-400",
  },
};

export const statusConfig: Record<
  DeliveryStatus,
  { label: string; badge: string; dot: string }
> = {
  no_iniciado: {
    label: "No iniciado",
    badge: "bg-gray-100 text-gray-500",
    dot: "bg-gray-400",
  },
  semana_en_curso: {
    label: "Semana en curso",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  entrega_anticipada: {
    label: "Entrega anticipada",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  entrega_a_tiempo: {
    label: "Entrega a tiempo",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  entrega_fuera: {
    label: "Entrega fuera de tiempo",
    badge: "bg-orange-100 text-orange-700",
    dot: "bg-orange-500",
  },
  vencido: {
    label: "Vencido",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

// ─── ESTADOS E INDICADORES (los calcula el backend; el frontend solo los muestra) ───

export type EstadoEntregable = "no_iniciado" | "borrador" | "enviado" | "observado" | "aprobado";

export const estadoEntregableConfig: Record<EstadoEntregable, { label: string; badge: string; dot: string }> = {
  no_iniciado: { label: "No iniciado", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  borrador: { label: "Borrador", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  enviado: { label: "En revisión", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  observado: { label: "Observado", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  aprobado: { label: "Aprobado", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
};

export type Semaforo = "verde" | "amarillo" | "rojo" | "sin_exigibles" | "sin_datos";

export const semaforoConfig: Record<Semaforo, { label: string; badge: string; dot: string }> = {
  verde: { label: "En regla", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  amarillo: { label: "En riesgo", badge: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  rojo: { label: "Crítico", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
  sin_exigibles: { label: "Sin vencimientos", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  sin_datos: { label: "Sin matriz", badge: "bg-gray-100 text-gray-500", dot: "bg-gray-300" },
};

/** Misma definición en todas las pantallas (ver backend/src/services/matrizService.js). */
export interface IndicadoresSeguimiento {
  total: number;
  reportados: number;
  aprobados: number;
  enviados_pendientes_revision: number;
  observados: number;
  borradores: number;
  no_iniciados: number;
  vencidos: number;
  exigibles: number;
  exigibles_aprobados: number;
  exigibles_reportados: number;
  esperado: number;
  horas_programadas: number;
  horas_reportadas: number;
  horas_aprobadas: number;
  pct_reportado: number;
  pct_aprobado: number;
  pct_esperado: number;
  /** aprobados − esperados (entregables). Negativa = atraso. */
  brecha_entregables: number;
  /** Puntos porcentuales: % aprobado − % esperado. */
  brecha_pct: number;
  cumplimiento_exigible: number | null;
  cumplimiento_reportado_exigible: number | null;
  semaforo: Semaforo;
}

export interface SemanaActual {
  semestre: string | null;
  hoy: string;
  numero: number | null;
  total_semanas: number | null;
  estado: "sin_calendario" | "sin_iniciar" | "en_curso" | "finalizado";
  fecha_inicio_semana?: string;
  fecha_fin_semana?: string;
  fecha_inicio_semestre?: string;
  fecha_fin_semestre?: string;
  advertencia?: string;
}

export function etiquetaSemana(s: SemanaActual | null | undefined): string {
  if (!s) return "—";
  if (s.estado === "en_curso" && s.numero != null) return `Semana ${s.numero} de ${s.total_semanas}`;
  if (s.estado === "finalizado") return "Semestre finalizado";
  if (s.estado === "sin_iniciar") return "Semestre por iniciar";
  return "Semestre sin calendario configurado";
}

/** Reportado = enviado para revisión o aprobado (no borradores ni observados). */
export function isDeliverableCompleted(d: { estado?: EstadoEntregable | null; completado?: boolean }): boolean {
  if (d.estado) return d.estado === "enviado" || d.estado === "aprobado";
  return d.completado === true;
}

export type SimpleDeliveryStatus = "completado" | "pendiente" | "atrasado";

export function computeSimpleStatus(d: {
  completado?: boolean;
  actualDate?: string | null;
  fecha_real_entrega?: string | null;
  scheduledDate?: string | null;
}): SimpleDeliveryStatus {
  if (isDeliverableCompleted(d)) return "completado";
  const sched = d.scheduledDate;
  if (!sched) return "pendiente";
  const scheduled = new Date(`${sched}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (scheduled < today) return "atrasado";
  return "pendiente";
}

export function computeStatus(
  scheduledDate: string | null | undefined,
  actualDate?: string | null
): DeliveryStatus {
  if (!scheduledDate) return "no_iniciado";
  const scheduled = new Date(`${scheduledDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (actualDate) {
    const actual = new Date(`${actualDate}T00:00:00`);
    if (actual < scheduled) return "entrega_anticipada";
    if (actual.toDateString() === scheduled.toDateString()) return "entrega_a_tiempo";
    return "entrega_fuera";
  }

  const weekEnd = new Date(scheduled);
  const weekStart = new Date(scheduled);
  weekStart.setDate(weekStart.getDate() - 4);

  if (scheduled > today) return "no_iniciado";
  if (today >= weekStart && today <= weekEnd) return "semana_en_curso";
  return "vencido";
}
