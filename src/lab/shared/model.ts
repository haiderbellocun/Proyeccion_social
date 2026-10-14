// Laboratorio de diseño (solo desarrollo): modelo de vista común a ambos prototipos.
// Lee un snapshot de datos SINTÉTICOS de proysocial_dev (ver data/make-snapshot.mjs). No llama a la API ni escribe nada.
import raw from "../data/dev-snapshot.json";

export type Estado = "aprobado" | "enviado" | "observado" | "borrador" | "no_iniciado";

export interface Item {
  id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  fase: string;
  mes: string;
  semana: number;
  inicio: string;
  fin: string;
  horas: number;
  estado: Estado;
  vencido: boolean;
  iniciativa: string;
  evidencias: string[];
  comentario: string | null;
  requiereEvidencia: boolean;
  envios: number;
  esAhora: boolean;
}

export interface Docente {
  id: number;
  nombre: string;
  programa: string;
  regional: string;
  reportado: number;
  aprobado: number;
  esperado: number;
  brecha: number;
  porRevisar: number;
  observados: number;
  vencidos: number;
  semaforo: "verde" | "amarillo" | "rojo" | "sin_exigibles" | "sin_datos";
  estado: "al_dia" | "atrasado" | "sin_actividad";
}

export interface Revision {
  id: number;
  docente: string;
  programa: string;
  titulo: string;
  estado: "enviado" | "observado" | "aprobado";
  semana: number;
  diasEspera: number | null;
  enviado: string | null;
  evidencias: { tipo: string; url: string }[];
  problemaAcceso: boolean;
  reenvio: boolean;
  iniciativa: string;
}

const limpiar = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();

const snap = raw as unknown as {
  admin: { dashboard: any; revision: { reportes: any[] } };
  docente: { perfil: any; matriz: any; stats: any; dashboard: any };
};

export const hoy: string = snap.docente.matriz.hoy;
export const semanaActual: number = snap.docente.matriz.semana_actual.numero;
export const totalSemanas: number = snap.docente.matriz.semana_actual.total_semanas;
export const semestre: string = snap.docente.matriz.semana_actual.semestre;
export const inicioSemestre: string = snap.docente.matriz.semana_actual.fecha_inicio_semestre;
export const rangoSemana = {
  inicio: snap.docente.matriz.semana_actual.fecha_inicio_semana as string,
  fin: snap.docente.matriz.semana_actual.fecha_fin_semana as string,
};

export const docenteActual = {
  nombre: `${snap.docente.perfil.nombre} ${snap.docente.perfil.apellido}`,
  programa: snap.docente.perfil.programa?.nombre as string,
  regional: snap.docente.perfil.regional as string,
  tipo: snap.docente.perfil.tipo_docente as string,
  grupo: snap.docente.perfil.grupo_matriz?.nombre as string,
  horas: snap.docente.perfil.grupo_matriz?.horas_totales as number,
};

export const items: Item[] = snap.docente.matriz.items.map((x: any) => ({
  id: x.plantilla_id,
  numero: x.numero,
  titulo: limpiar(x.entregable),
  descripcion: limpiar(x.descripcion_evidencia),
  categoria: x.categoria,
  fase: limpiar(x.fase).replace(/^\d+\.\s*/, ""),
  mes: x.mes,
  semana: x.semana_numero,
  inicio: x.fecha_inicio_calculada,
  fin: x.fecha_fin_calculada,
  horas: x.horas,
  estado: x.estado,
  vencido: x.vencido === true,
  iniciativa: limpiar(x.iniciativa_titulo),
  evidencias: x.evidencias ?? [],
  comentario: x.comentario_revision ? limpiar(x.comentario_revision) : null,
  requiereEvidencia: x.requiere_evidencia === true,
  envios: x.num_envios ?? 0,
  esAhora: x.semana_numero === semanaActual,
}));

export const resumen = snap.docente.matriz.resumen as {
  total: number; reportados: number; aprobados: number; enviados_pendientes_revision: number; observados: number;
  borradores: number; vencidos: number; esperado: number; pct_reportado: number; pct_aprobado: number; pct_esperado: number;
  brecha_entregables: number; horas_programadas: number; horas_reportadas: number; horas_aprobadas: number;
  exigibles: number; exigibles_aprobados: number; cumplimiento_exigible: number;
};

export const porSemana: { semana: number; total: number; reportados: number; aprobados: number }[] = snap.docente.stats.por_semana.map((s: any) => ({
  semana: s.semana_numero, total: s.total, reportados: s.reportados, aprobados: s.aprobados,
}));

export const admin = {
  stats: snap.admin.dashboard.stats as {
    total_docentes: number; reportes_enviados: number; docentes_atrasados: number; proyectos_activos: number; pendientes_revision: number;
    reportes_aprobados: number; reportes_observados: number; avance_reportado_promedio: number; avance_aprobado_promedio: number;
    avance_esperado_promedio: number; semaforo: { verde: number; amarillo: number; rojo: number };
  },
  semanal: snap.admin.dashboard.progreso_semanal.map((s: any) => ({ semana: s.semana as number, reportados: (s.reportados ?? s.enviados) as number, aprobados: s.aprobados as number })) as { semana: number; reportados: number; aprobados: number }[],
  docentes: snap.admin.dashboard.docentes_recientes.map((d: any): Docente => ({
    id: d.id, nombre: d.nombre, programa: d.programa, regional: d.regional,
    reportado: d.porcentaje_reportado ?? d.porcentaje_avance, aprobado: d.porcentaje_aprobado ?? 0, esperado: d.porcentaje_esperado ?? 0,
    brecha: d.brecha ?? 0, porRevisar: d.pendientes_revision ?? 0, observados: d.observados ?? 0, vencidos: d.vencidos ?? 0,
    semaforo: d.semaforo, estado: d.estado,
  })) as Docente[],
  revisiones: snap.admin.revision.reportes.map((r: any): Revision => ({
    id: r.id,
    docente: r.docente_nombre,
    programa: r.programa_nombre,
    titulo: limpiar(r.actividad_reportada),
    estado: r.estado_revision,
    semana: r.semana_numero,
    diasEspera: r.dias_en_espera,
    enviado: r.fecha_cargue_evidencia ?? null,
    evidencias: (r.evidencias ?? []).map((e: any) => ({ tipo: e.tipo_enlace, url: e.url })),
    problemaAcceso: r.problema_acceso === true,
    reenvio: r.es_reenvio === true,
    iniciativa: limpiar(r.proyecto_titulo),
  })),
};

// ───────── Formato ─────────
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const parts = (iso: string) => iso.slice(0, 10).split("-").map(Number) as [number, number, number];
export const diaMes = (iso: string) => {
  const [, m, d] = parts(iso);
  return `${d} ${MESES[m - 1]}`;
};
export const rango = (a: string, b: string) => {
  const [, ma, da] = parts(a);
  const [, mb, db] = parts(b);
  return ma === mb ? `${da}–${db} ${MESES[ma - 1]}` : `${da} ${MESES[ma - 1]} – ${db} ${MESES[mb - 1]}`;
};
/** Semana (1…N) del semestre a la que pertenece una fecha ISO. */
export const semanaDe = (iso: string) => {
  const d = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const i = Date.parse(`${inicioSemestre}T00:00:00Z`);
  return Math.floor((d - i) / 86_400_000 / 7) + 1;
};
export const pct = (v: number) => `${Math.round(v)}%`;
export const ETIQUETA_ESTADO: Record<Estado, string> = {
  aprobado: "Aprobado", enviado: "En revisión", observado: "Observado", borrador: "Borrador", no_iniciado: "Por hacer",
};
export const nombreCorto = (n: string) => n.split(" ")[0];

/** Conteos de la matriz por estado visible (vencido es condición, no estado). */
export const conteos = () => {
  const c = { todos: items.length, porHacer: 0, revision: 0, observados: 0, aprobados: 0, vencidos: 0 };
  for (const i of items) {
    if (i.estado === "aprobado") c.aprobados++;
    else if (i.estado === "enviado") c.revision++;
    else if (i.estado === "observado") c.observados++;
    else c.porHacer++;
    if (i.vencido && i.estado !== "aprobado") c.vencidos++;
  }
  return c;
};

// ───────── Añadidos (concepto A) ─────────
export const finSemestre: string = snap.docente.matriz.semana_actual.fecha_fin_semestre;

/** Persona administradora del snapshot (no es ninguno de los docentes). */
export const adminActual = {
  nombre: `${(snap.admin as any).usuario?.nombre ?? "Admin"} ${(snap.admin as any).usuario?.apellido ?? "Sistema"}`.trim(),
};
