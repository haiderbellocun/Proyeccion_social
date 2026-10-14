// Iconos propios del prototipo B: trazo único de 1.5 px, rejilla de 20 px, terminaciones redondeadas.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base: P = {
  width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false,
};
const I = (nodo: React.ReactNode) => function Icon(p: P) { return <svg {...base} {...p}>{nodo}</svg>; };

export const IPanel = I(<><circle cx="10" cy="10" r="7" /><path d="M10 10l3-3.5M6.2 11.5h.01M7 7.3h.01M10 5.2v.01M13.8 11.5h.01" /></>);
export const ISeguimiento = I(<><circle cx="10" cy="10" r="2.5" /><path d="M2.5 10h5M12.5 10h5" /></>);
export const IRevision = I(<><rect x="4" y="3.5" width="12" height="14" rx="1.5" /><path d="M7.5 3.5V2.5h5v1M7 11l2 2 4-4.5" /></>);
export const IIndicadores = I(<><path d="M3.5 3.5v13h13" /><path d="M7 13V9.5M10.5 13V6.5M14 13v-3" /></>);
export const IAdmin = I(<><path d="M3 6h14M3 14h14" /><circle cx="7" cy="6" r="1.8" fill="var(--c-surface)" /><circle cx="13" cy="14" r="1.8" fill="var(--c-surface)" /></>);
export const IImportar = I(<><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M3.5 14v2.5h13V14" /></>);
export const IComponentes = I(<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>);
export const ICola = I(<><path d="M3.5 5h13M3.5 10h8M3.5 15h8" /><path d="M14 13.5l1.7 1.7 3-3.4" /></>);
export const IDocentes = I(<><circle cx="8" cy="7" r="3" /><path d="M2.5 16c.4-3 2.6-4.5 5.5-4.5s5.1 1.5 5.5 4.5M14 4.3a2.7 2.7 0 010 5.2M15.2 11.8c1.5.5 2.5 1.8 2.8 4" /></>);
export const IBuscar = I(<><circle cx="9" cy="9" r="5.2" /><path d="M13 13l3.8 3.8" /></>);
export const IBell = I(<><path d="M5 14.5V9a5 5 0 0110 0v5.5l1.2 1.5H3.8z" /><path d="M8.3 17.5a1.9 1.9 0 003.4 0" /></>);
export const IAyuda = I(<><circle cx="10" cy="10" r="7.2" /><path d="M7.8 8a2.3 2.3 0 114 1.5c-.8.7-1.8 1-1.8 2.3M10 14.4v.01" /></>);
export const IMas = I(<><circle cx="10" cy="10" r="7.2" /><path d="M10 6.5v7M6.5 10h7" /></>);
export const IChevD = I(<path d="M5.5 8l4.5 4.5L14.5 8" />);
export const IChevU = I(<path d="M5.5 12l4.5-4.5L14.5 12" />);
export const IChevR = I(<path d="M8 5.5l4.5 4.5L8 14.5" />);
export const IChevL = I(<path d="M12 5.5L7.5 10l4.5 4.5" />);
export const IFiltro = I(<path d="M3.5 4.5h13L11.8 10.4v5l-3.6 1.6v-6.6z" />);
export const IColumnas = I(<><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M8.5 4v12M3 8.5h14" /></>);
export const IInfo = I(<><circle cx="10" cy="10" r="7.2" /><path d="M10 9.2v4.3M10 6.6v.01" /></>);
export const IExpandir = I(<path d="M11.5 3.5h5v5M16.5 3.5l-5.5 5.5M8.5 16.5h-5v-5M3.5 16.5L9 11" />);
export const IReducir = I(<path d="M16.5 8.5h-5v-5M11.5 8.5l5-5M3.5 11.5h5v5M8.5 11.5l-5 5" />);
export const IKebab = I(<path d="M10 4.5v.01M10 10v.01M10 15.5v.01" strokeWidth="2.4" />);
export const IMaletin = I(<><rect x="3" y="6.5" width="14" height="9.5" rx="1.5" /><path d="M7.5 6.5v-1.5a1 1 0 011-1h3a1 1 0 011 1v1.5M3 10.5h14" /></>);
export const ICarpeta = I(<path d="M3 6a1.5 1.5 0 011.5-1.5H8l1.7 2H15.5A1.5 1.5 0 0117 8v6.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5z" />);
export const ITarea = I(<rect x="4.5" y="4.5" width="11" height="11" rx="2" />);
export const ICerrar = I(<path d="M5 5l10 10M15 5L5 15" />);
export const IExterno = I(<path d="M8 4.5H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16.5h9a1.5 1.5 0 001.5-1.5v-3M11 3.5h5.5V9M16.5 3.5L9.5 10.5" />);
export const IArriba = I(<path d="M10 16V4.5M5.5 9L10 4.5 14.5 9" />);
export const IAbajo = I(<path d="M10 4v11.5M5.5 11L10 15.5 14.5 11" />);
export const IContraer = I(<path d="M5.5 11.5L10 7l4.5 4.5M5.5 16L10 11.5 14.5 16" />);
export const IExpandirTodo = I(<path d="M5.5 8.5L10 13l4.5-4.5M5.5 4L10 8.5 14.5 4" />);
export const ICalendario = I(<><rect x="3.5" y="4.5" width="13" height="12" rx="1.5" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></>);
export const IMenu = I(<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />);
export const IUsuario = I(<><circle cx="10" cy="7.5" r="3" /><path d="M4 16.5c.5-3 3-4.5 6-4.5s5.500 1.500 6 4.500" /></>);
export const ISalir = I(<path d="M8 4H5a1.500 1.500 0 00-1.500 1.500v9A1.500 1.500 0 005 16h3M12 6.500L15.500 10 12 13.500M15 10H7.500" />);

/** Marca de ProySocial (propia): un nodo conectado a sus entregables. */
export function Marca({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden focusable="false">
      <rect width="28" height="28" rx="6" fill="var(--c-primary)" />
      <circle cx="9" cy="14" r="3.4" fill="#fff" />
      <circle cx="20" cy="8.5" r="2.4" stroke="#fff" strokeWidth="1.7" />
      <circle cx="20" cy="19.5" r="2.4" stroke="#fff" strokeWidth="1.7" />
      <path d="M11.8 12.6l5.900-3M11.8 15.400l5.900 3" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export const IRefrescar = I(<><path d="M16.5 10a6.5 6.5 0 11-2-4.7M16.5 3.5v3h-3" /></>);
