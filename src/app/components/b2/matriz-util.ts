// Utilidades de la matriz B2. Solo presentación: las fechas y los indicadores los entrega el backend.
import { useEffect, useState } from "react";
import type { EstadoEntregable, SemanaActual } from "../../data/matrizConstants";

export const DIA_MS = 86_400_000;
export const aMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const dias = (desde: string, hasta: string) => Math.round((aMs(hasta) - aMs(desde)) / DIA_MS);
export const addDays = (iso: string, n: number) => new Date(aMs(iso) + n * DIA_MS).toISOString().slice(0, 10);
export const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const MES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const fechaCorta = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MES_CORTO[m - 1]}`;
};
export const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MES_CORTO[m - 1]} ${y}`;
};
export const nombreMes = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return { nombre: MES_LARGO[m - 1], anio: y, clave: `${y}-${m}` };
};

/** Calendario del cronograma: semestre activo según el backend; si falta, el rango de los entregables. */
export interface Calendario {
  inicio: string;
  fin: string;
  dias: number;
  semanas: number;
  /** true cuando el backend no entregó un calendario válido y se usó el rango de los entregables. */
  derivado: boolean;
}

export function armarCalendario(semana: SemanaActual | null, fechas: string[]): Calendario | null {
  let inicio = semana?.fecha_inicio_semestre;
  let fin = semana?.fecha_fin_semestre;
  let derivado = false;
  if (!esFecha(inicio) || !esFecha(fin) || aMs(fin) < aMs(inicio)) {
    const validas = fechas.filter(esFecha).sort();
    if (validas.length === 0) return null;
    inicio = validas[0].slice(0, 10);
    fin = validas[validas.length - 1].slice(0, 10);
    derivado = true;
  }
  const i = inicio!.slice(0, 10);
  const f = fin!.slice(0, 10);
  const total = dias(i, f) + 1;
  const declaradas = !derivado && semana?.total_semanas ? semana.total_semanas : 0;
  return { inicio: i, fin: f, dias: total, semanas: Math.max(declaradas, Math.ceil(total / 7)), derivado };
}

/* ───────── estado visible ─────────
 * El estado lo calcula el backend; «vencido» es una condición adicional, no un estado. */
export type EstatusKey = "aprobado" | "en_revision" | "observado" | "borrador" | "en_curso" | "no_iniciada";
export const ESTATUS_LABEL: Record<EstatusKey, string> = {
  aprobado: "Aprobado", en_revision: "En revisión", observado: "Observado", borrador: "Borrador", en_curso: "En curso", no_iniciada: "No iniciado",
};
export const ESTATUS_ORDEN: EstatusKey[] = ["observado", "en_revision", "borrador", "en_curso", "no_iniciada", "aprobado"];

export function estatusDe(estado: EstadoEntregable, semanaEntregable: number, semanaActual: number | null): EstatusKey {
  switch (estado) {
    case "aprobado": return "aprobado";
    case "enviado": return "en_revision";
    case "observado": return "observado";
    case "borrador": return "borrador";
    default: return semanaActual != null && semanaEntregable === semanaActual ? "en_curso" : "no_iniciada";
  }
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    h();
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

export function tipoEnlace(url: string): string {
  if (/drive\.google\.com\/file\//.test(url)) return "Archivo de Drive";
  if (/drive\.google\.com\/.*folders/.test(url)) return "Carpeta de Drive";
  if (/docs\.google\.com\/document/.test(url)) return "Documento de Google";
  if (/docs\.google\.com\/spreadsheets/.test(url)) return "Hoja de cálculo de Google";
  if (/docs\.google\.com\/presentation/.test(url)) return "Presentación de Google";
  if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return "Formulario";
  return "Enlace externo";
}
