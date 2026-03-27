// ─── TIPOS ───────────────────────────────────────────────────────────────────

export type Category =
  | "capacitacion"
  | "convenio_nuevo"
  | "convenio_dinamizado"
  // Compatibilidad (antes no se separaban)
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
  /** Número de entregable en plantilla (si el backend lo envía) */
  numero?: number | null;
  month: MonthName;
  week: number;
  startDate: string;   // Display "03 Feb"
  endDate: string;     // Display "07 Feb"
  hours: number;
  deliverable: string;
  description: string;
  category: Category;
  indicator: string;
  /** Fase temática (agrupación en UI) */
  phase?: string;
  /** Marca explícita de evidencia completada en BD */
  completado?: boolean;
  scheduledDate: string;  // ISO "2024-02-07" for comparison
  actualDate?: string;     // ISO – present only when submitted
  evidence?: string;
}

// ─── CONFIGURACIÓN DE CATEGORÍAS ─────────────────────────────────────────────

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
  // Compatibilidad: antes 'convenio' ya representaba dinamizados
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

// ─── CONFIGURACIÓN DE ESTADOS ─────────────────────────────────────────────────

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

// ─── FECHA DE REFERENCIA (demo fijo para que los estados sean consistentes) ───

export const DEMO_TODAY = new Date("2024-03-15");

export function isDeliverableCompleted(d: Deliverable): boolean {
  return d.completado === true || !!d.actualDate;
}

export type SimpleDeliveryStatus = "completado" | "pendiente" | "atrasado";

export function computeSimpleStatus(d: Deliverable): SimpleDeliveryStatus {
  if (isDeliverableCompleted(d)) return "completado";
  if (!d.scheduledDate) return "pendiente";
  const scheduled = new Date(`${d.scheduledDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (scheduled < today) return "atrasado";
  return "pendiente";
}

export function computeStatus(scheduledDate: string, actualDate?: string): DeliveryStatus {
  const scheduled = new Date(`${scheduledDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (actualDate) {
    const actual = new Date(`${actualDate}T00:00:00`);
    if (actual < scheduled) return "entrega_anticipada";
    if (actual.toDateString() === scheduled.toDateString()) return "entrega_a_tiempo";
    return "entrega_fuera";
  }

  // Sin entrega real: interpretamos el scheduledDate como "fin de semana"
  const weekEnd = new Date(scheduled);
  const weekStart = new Date(scheduled);
  // Ventana típica: 5 días de semana (fin de semana -4)
  weekStart.setDate(weekStart.getDate() - 4);

  if (scheduled > today) return "no_iniciado";
  if (today >= weekStart && today <= weekEnd) return "semana_en_curso";
  return "vencido";
}

// ─── DATOS DE LA MATRIZ ───────────────────────────────────────────────────────

export const deliverables: Deliverable[] = [
  // ── FEBRERO ──
  {
    id: 1, month: "Febrero", week: 1,
    startDate: "05 Feb", endDate: "09 Feb", hours: 4,
    deliverable: "Diagnóstico inicial de necesidades",
    description: "Levantamiento de información sobre necesidades digitales de la comunidad. Incluye encuesta, análisis y sistematización.",
    category: "proyecto", indicator: "IND-01: Diagnósticos realizados",
    scheduledDate: "2024-02-09", actualDate: "2024-02-07",
    evidence: "https://drive.google.com/diagnostico-feb",
  },
  {
    id: 2, month: "Febrero", week: 1,
    startDate: "05 Feb", endDate: "09 Feb", hours: 3,
    deliverable: "Reunión de planificación semestral",
    description: "Sesión de planificación con equipo docente para definir cronograma y metas del ciclo.",
    category: "capacitacion", indicator: "IND-02: Sesiones de coordinación",
    scheduledDate: "2024-02-09", actualDate: "2024-02-09",
    evidence: "https://drive.google.com/acta-planificacion",
  },
  {
    id: 3, month: "Febrero", week: 2,
    startDate: "12 Feb", endDate: "16 Feb", hours: 6,
    deliverable: "Taller módulo básico — Sesión 1",
    description: "Primera sesión del taller de alfabetización digital: uso de computadora, teclado, mouse y sistema operativo.",
    category: "actividad1", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-02-16", actualDate: "2024-02-16",
    evidence: "https://drive.google.com/lista-s1",
  },
  {
    id: 4, month: "Febrero", week: 2,
    startDate: "12 Feb", endDate: "16 Feb", hours: 2,
    deliverable: "Acta de convenio UGEL — Firma",
    description: "Formalización del convenio marco con la UGEL para capacitación de docentes de educación básica.",
    category: "convenio", indicator: "IND-04: Convenios formalizados",
    scheduledDate: "2024-02-16", actualDate: "2024-02-20",
    evidence: "https://drive.google.com/acta-ugel",
  },
  {
    id: 5, month: "Febrero", week: 3,
    startDate: "19 Feb", endDate: "23 Feb", hours: 6,
    deliverable: "Taller módulo básico — Sesión 2",
    description: "Segunda sesión: manejo de archivos, carpetas y almacenamiento. Práctica supervisada.",
    category: "actividad1", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-02-23", actualDate: "2024-02-22",
    evidence: "https://drive.google.com/lista-s2",
  },
  {
    id: 6, month: "Febrero", week: 3,
    startDate: "19 Feb", endDate: "23 Feb", hours: 2,
    deliverable: "Informe presupuestal Q1",
    description: "Reporte de ejecución presupuestal del primer trimestre con sustento de gastos.",
    category: "presupuesto", indicator: "IND-05: Informes presupuestales",
    scheduledDate: "2024-02-23", actualDate: "2024-02-20",
    evidence: "https://drive.google.com/presupuesto-q1",
  },
  {
    id: 7, month: "Febrero", week: 4,
    startDate: "26 Feb", endDate: "29 Feb", hours: 6,
    deliverable: "Taller módulo básico — Sesión 3",
    description: "Tercera sesión: creación y edición de documentos básicos. Evaluación formativa.",
    category: "actividad2", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-02-29", actualDate: "2024-02-29",
    evidence: "https://drive.google.com/lista-s3",
  },
  {
    id: 8, month: "Febrero", week: 4,
    startDate: "26 Feb", endDate: "29 Feb", hours: 3,
    deliverable: "Lista de beneficiarios validada",
    description: "Consolidación y validación de la lista oficial de beneficiarios del proyecto con DNI y datos de contacto.",
    category: "proyecto", indicator: "IND-01: Beneficiarios registrados",
    scheduledDate: "2024-02-29", actualDate: "2024-02-28",
    evidence: "https://drive.google.com/lista-beneficiarios",
  },
  // ── MARZO ──
  {
    id: 9, month: "Marzo", week: 5,
    startDate: "04 Mar", endDate: "08 Mar", hours: 6,
    deliverable: "Taller internet — Sesión 1",
    description: "Introducción a navegación web, buscadores y correo electrónico. Práctica guiada en sala.",
    category: "actividad1", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-03-08", actualDate: "2024-03-08",
    evidence: "https://drive.google.com/lista-s4",
  },
  {
    id: 10, month: "Marzo", week: 5,
    startDate: "04 Mar", endDate: "08 Mar", hours: 3,
    deliverable: "Reunión de seguimiento UGEL",
    description: "Reunión mensual de coordinación con directivos UGEL para revisión de avances del convenio.",
    category: "convenio", indicator: "IND-04: Reuniones de seguimiento",
    scheduledDate: "2024-03-08", actualDate: "2024-03-11",
    evidence: "https://drive.google.com/acta-ugel-mar",
  },
  {
    id: 11, month: "Marzo", week: 5,
    startDate: "04 Mar", endDate: "08 Mar", hours: 2,
    deliverable: "Registro control mensual — Febrero",
    description: "Formulario de control mensual consolidando actividades, horas y beneficiarios de febrero.",
    category: "actividad2", indicator: "IND-06: Registros de control",
    scheduledDate: "2024-03-08",
    // Sin actualDate → vencido (pasó la semana, no se entregó)
  },
  {
    id: 12, month: "Marzo", week: 6,
    startDate: "11 Mar", endDate: "15 Mar", hours: 6,
    deliverable: "Taller internet — Sesión 2",
    description: "Continuación: uso seguro de internet, identificación de sitios confiables y phishing.",
    category: "actividad1", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-03-15",
    // semana_en_curso
  },
  {
    id: 13, month: "Marzo", week: 6,
    startDate: "11 Mar", endDate: "15 Mar", hours: 2,
    deliverable: "Registro de asistencia S6",
    description: "Lista de asistencia firmada de la sesión 6, con foto de grupo y evidencia fotográfica.",
    category: "capacitacion", indicator: "IND-02: Sesiones ejecutadas",
    scheduledDate: "2024-03-15",
    // semana_en_curso
  },
  {
    id: 14, month: "Marzo", week: 7,
    startDate: "18 Mar", endDate: "22 Mar", hours: 6,
    deliverable: "Taller banca digital — Sesión 1",
    description: "Introducción a plataformas bancarias digitales: aplicaciones móviles, transferencias y pagos en línea.",
    category: "actividad3", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-03-22",
    // no_iniciado
  },
  {
    id: 15, month: "Marzo", week: 7,
    startDate: "18 Mar", endDate: "22 Mar", hours: 3,
    deliverable: "Informe de avance mensual — Marzo",
    description: "Informe mensual consolidado con actividades, logros, dificultades y proyección de semanas siguientes.",
    category: "proyecto", indicator: "IND-07: Informes de avance",
    scheduledDate: "2024-03-22",
  },
  {
    id: 16, month: "Marzo", week: 8,
    startDate: "25 Mar", endDate: "29 Mar", hours: 4,
    deliverable: "Evaluación formativa módulo internet",
    description: "Aplicación de prueba práctica evaluativa sobre los contenidos del módulo de internet.",
    category: "actividad2", indicator: "IND-08: Evaluaciones aplicadas",
    scheduledDate: "2024-03-29",
  },
  {
    id: 17, month: "Marzo", week: 8,
    startDate: "25 Mar", endDate: "29 Mar", hours: 2,
    deliverable: "Reporte presupuestal — Marzo",
    description: "Liquidación de gastos del mes de marzo con comprobantes y cuadro comparativo de presupuesto vs. ejecución.",
    category: "presupuesto", indicator: "IND-05: Informes presupuestales",
    scheduledDate: "2024-03-29",
  },
  // ── ABRIL ──
  {
    id: 18, month: "Abril", week: 9,
    startDate: "01 Abr", endDate: "05 Abr", hours: 6,
    deliverable: "Taller trámites digitales — Sesión 1",
    description: "Uso de plataformas del Estado: SUNAT, RENIEC, ESSALUD en línea. Práctica con casos reales.",
    category: "actividad3", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-04-05",
  },
  {
    id: 19, month: "Abril", week: 9,
    startDate: "01 Abr", endDate: "05 Abr", hours: 2,
    deliverable: "Actualización de convenio UGEL",
    description: "Addendum al convenio con UGEL incorporando nuevas metas para el segundo bimestre.",
    category: "convenio", indicator: "IND-04: Convenios actualizados",
    scheduledDate: "2024-04-05",
  },
  {
    id: 20, month: "Abril", week: 10,
    startDate: "08 Abr", endDate: "12 Abr", hours: 6,
    deliverable: "Capacitación avanzada — Sesión 1",
    description: "Sesión avanzada para participantes destacados: uso de hojas de cálculo y presentaciones digitales.",
    category: "capacitacion", indicator: "IND-02: Sesiones ejecutadas",
    scheduledDate: "2024-04-12",
  },
  {
    id: 21, month: "Abril", week: 10,
    startDate: "08 Abr", endDate: "12 Abr", hours: 3,
    deliverable: "Informe de beneficiarios — Bimestre 1",
    description: "Informe detallado de beneficiarios del primer bimestre: datos demográficos, asistencia y evaluación.",
    category: "proyecto", indicator: "IND-01: Beneficiarios atendidos",
    scheduledDate: "2024-04-12",
  },
  {
    id: 22, month: "Abril", week: 11,
    startDate: "15 Abr", endDate: "19 Abr", hours: 6,
    deliverable: "Taller redes sociales — Sesión 1",
    description: "Uso responsable de redes sociales: creación de cuentas, privacidad y comunicación segura.",
    category: "actividad4", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-04-19",
  },
  {
    id: 23, month: "Abril", week: 11,
    startDate: "15 Abr", endDate: "19 Abr", hours: 4,
    deliverable: "Evaluación intermedia del proyecto",
    description: "Evaluación de medio término del proyecto. Análisis de indicadores y ajuste de cronograma.",
    category: "actividad2", indicator: "IND-08: Evaluaciones aplicadas",
    scheduledDate: "2024-04-19",
  },
  {
    id: 24, month: "Abril", week: 12,
    startDate: "22 Abr", endDate: "26 Abr", hours: 3,
    deliverable: "Informe mensual — Abril",
    description: "Informe mensual de abril: actividades ejecutadas, logros cuantitativos y cualitativos.",
    category: "proyecto", indicator: "IND-07: Informes de avance",
    scheduledDate: "2024-04-26",
  },
  {
    id: 25, month: "Abril", week: 12,
    startDate: "22 Abr", endDate: "26 Abr", hours: 2,
    deliverable: "Reporte presupuestal — Abril",
    description: "Liquidación de gastos del mes de abril con análisis de varianza presupuestal.",
    category: "presupuesto", indicator: "IND-05: Informes presupuestales",
    scheduledDate: "2024-04-26",
  },
  // ── MAYO ──
  {
    id: 26, month: "Mayo", week: 13,
    startDate: "06 May", endDate: "10 May", hours: 6,
    deliverable: "Taller módulo final — Sesión 1",
    description: "Inicio del módulo de cierre: integración de habilidades y proyectos personales digitales.",
    category: "actividad3", indicator: "IND-03: Personas capacitadas",
    scheduledDate: "2024-05-10",
  },
  {
    id: 27, month: "Mayo", week: 14,
    startDate: "13 May", endDate: "17 May", hours: 6,
    deliverable: "Evaluación final de participantes",
    description: "Prueba práctica final del programa de alfabetización digital. Aplicación individual.",
    category: "actividad4", indicator: "IND-08: Evaluaciones finales",
    scheduledDate: "2024-05-17",
  },
  {
    id: 28, month: "Mayo", week: 15,
    startDate: "20 May", endDate: "24 May", hours: 4,
    deliverable: "Informe consolidado de cierre",
    description: "Informe final del proyecto con análisis de indicadores, lecciones aprendidas y recomendaciones.",
    category: "proyecto", indicator: "IND-09: Informes de cierre",
    scheduledDate: "2024-05-24",
  },
  {
    id: 29, month: "Mayo", week: 16,
    startDate: "27 May", endDate: "31 May", hours: 3,
    deliverable: "Ceremonia de cierre y certificación",
    description: "Evento de clausura y entrega de certificados a participantes del programa de alfabetización.",
    category: "capacitacion", indicator: "IND-10: Eventos de cierre",
    scheduledDate: "2024-05-31",
  },
  {
    id: 30, month: "Mayo", week: 16,
    startDate: "27 May", endDate: "31 May", hours: 2,
    deliverable: "Liquidación presupuestal final",
    description: "Liquidación total del presupuesto del proyecto con informe de cierre contable.",
    category: "presupuesto", indicator: "IND-05: Liquidación final",
    scheduledDate: "2024-05-31",
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function getComplianceStats() {
  const total = deliverables.length;
  const completed = deliverables.filter((d) => d.actualDate).length;
  const pct = Math.round((completed / total) * 100);

  const months: MonthName[] = ["Febrero", "Marzo", "Abril", "Mayo"];
  const byMonth = months.map((month) => {
    const items = deliverables.filter((d) => d.month === month);
    const done = items.filter((d) => d.actualDate).length;
    return { month, total: items.length, done, pct: Math.round((done / items.length) * 100) };
  });

  return { total, completed, pct, byMonth };
}

export function getDeliverablesByMonth(month: MonthName) {
  return deliverables.filter((d) => d.month === month);
}

export const MONTHS: MonthName[] = ["Febrero", "Marzo", "Abril", "Mayo"];

export const MONTH_COLORS: Record<MonthName, string> = {
  Febrero: "bg-violet-600",
  Marzo: "bg-[#1e3a8a]",
  Abril: "bg-teal-600",
  Mayo: "bg-emerald-600",
};
