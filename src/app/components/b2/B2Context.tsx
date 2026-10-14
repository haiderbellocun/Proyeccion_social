import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { SemanaActual } from "../../data/matrizConstants";

/** Estado compartido entre el shell B2 y las pantallas que ya usan el diseño B2 (hoy, el panel de coordinación). */
interface B2State {
  busqueda: string;
  setBusqueda: (v: string) => void;
  /** Semana vigente según el backend (America/Bogota); la publica el panel cuando carga. */
  semana: SemanaActual | null;
  setSemana: (s: SemanaActual | null) => void;
  /** La pantalla activa puede registrar cómo se recargan sus datos para el botón «Actualizar». */
  registrarRecarga: (fn: (() => void) | null) => void;
  recargar: () => void;
  puedeRecargar: boolean;
}

const Ctx = createContext<B2State | null>(null);

export function B2Provider({ children }: { children: ReactNode }) {
  const [busqueda, setBusqueda] = useState("");
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [puedeRecargar, setPuedeRecargar] = useState(false);
  const fn = useRef<(() => void) | null>(null);
  const registrarRecarga = useCallback((f: (() => void) | null) => {
    fn.current = f;
    setPuedeRecargar(f != null);
  }, []);
  const recargar = useCallback(() => fn.current?.(), []);
  const value = useMemo(
    () => ({ busqueda, setBusqueda, semana, setSemana, registrarRecarga, recargar, puedeRecargar }),
    [busqueda, semana, registrarRecarga, recargar, puedeRecargar]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useB2(): B2State {
  const v = useContext(Ctx);
  if (!v) throw new Error("useB2 debe usarse dentro de B2Provider");
  return v;
}
