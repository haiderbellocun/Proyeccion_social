// Estado de un entregable con el vocabulario del backend + la condición «Vencido» (que no sustituye al estado).
import { Estado, type Kind } from "./ui";
import type { EstadoEntregable } from "../../data/matrizConstants";

const MAPA: Record<EstadoEntregable, { kind: Kind; label: string }> = {
  no_iniciado: { kind: "porhacer", label: "No iniciado" },
  borrador: { kind: "borrador", label: "Borrador" },
  enviado: { kind: "revision", label: "En revisión" },
  observado: { kind: "observado", label: "Observado" },
  aprobado: { kind: "aprobado", label: "Aprobado" },
};

export function EstadoDeEntregable({ estado, vencido }: { estado?: EstadoEntregable | null; vencido?: boolean }) {
  const m = MAPA[estado ?? "no_iniciado"] ?? MAPA.no_iniciado;
  return (
    <span className="b2-acc-fila" style={{ gap: 6 }}>
      <Estado kind={m.kind} label={m.label} />
      {vencido && <span className="b2-venc-tag">Vencido</span>}
    </span>
  );
}
