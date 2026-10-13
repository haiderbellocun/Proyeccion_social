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

export type MonthName = "Febrero" | "Marzo" | "Abril" | "Mayo";

export interface Deliverable {
  id: number;
  numero?: number | null;
  month: MonthName;
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

// ─── ESTADOS E INDICADORES (calculados por el backend; el frontend solo los muestra) ───

export type EstadoEntregable =
  | "no_iniciado"
  | "borrador"
  | "enviado"
  | "observado"
  | "aprobado";

export const estadoEntregableConfig: Record<
  EstadoEntregable,
  { label: string; badge: string; dot: string }
> = {
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

/** Indicadores de seguimiento: misma definición para todas las pantallas (ver backend/src/services/matrizService.js). */
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
  pct_reportado: number;
  pct_aprobado: number;
  pct_esperado: number;
  brecha: number;
  brecha_pct: number;
  cumplimiento_exigible: number | null;
  cumplimiento_reportado_exigible: number | null;
  semaforo: Semaforo;
}

export interface SemanaActual {
  semestre: string | null;
  hoy: string;
  numero: number | null;
  total_semanas: number;
  estado: "sin_iniciar" | "en_curso" | "finalizado";
  fecha_inicio_semana?: string;
  fecha_fin_semana?: string;
  fecha_inicio_semestre: string;
  fecha_fin_semestre: string;
  calendario_por_defecto: boolean;
}

export function etiquetaSemana(s: SemanaActual | null | undefined): string {
  if (!s) return "—";
  if (s.estado === "en_curso" && s.numero != null) return `Semana ${s.numero} de ${s.total_semanas}`;
  if (s.estado === "finalizado") return "Semestre finalizado";
  return "Semestre por iniciar";
}

/** Un entregable cuenta como reportado si fue enviado para revisión o ya está aprobado. */
export function isDeliverableCompleted(d: { estado?: EstadoEntregable | null; completado?: boolean }): boolean {
  if (d.estado) return d.estado === "enviado" || d.estado === "aprobado";
  return d.completado === true;
}

export const MONTHS: MonthName[] = ["Febrero", "Marzo", "Abril", "Mayo"];

export const MONTH_COLORS: Record<MonthName, string> = {
  Febrero: "bg-violet-600",
  Marzo: "bg-[#1e3a8a]",
  Abril: "bg-teal-600",
  Mayo: "bg-emerald-600",
};
