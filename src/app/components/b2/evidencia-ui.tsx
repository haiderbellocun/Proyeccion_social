// Piezas B2 compartidas por Revisión (administrador) y Evidencias (docente). Solo presentan datos del backend.
import { useState } from "react";
import { dominio, esHttp, ETIQUETA_TIPO, type EvidenciaEnlace } from "../EnlaceEvidencia";
import { HistorialEntregable } from "../HistorialEntregable";
import { formatDateOnly } from "../../lib/date";
import { IExterno } from "./icons";

/** Fecha corta de un instante (timestamptz) en hora institucional America/Bogota. */
export function fechaCortaBogota(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }).replace(".", "");
}

export function EnlacesB2({ lista, anterior = false }: { lista: EvidenciaEnlace[]; anterior?: boolean }) {
  return (
    <ul className="b2-evid" data-anterior={anterior || undefined}>
      {lista.map((e, i) => (
        <li key={e.id} className="b2-evid-i">
          <div className="b2-evid-t">
            <span className="b2-evid-k">{ETIQUETA_TIPO[e.tipo_enlace] ?? "Enlace"}{lista.length > 1 ? ` ${i + 1}` : ""}</span>
            <span className="b2-evid-u" title={e.url}>{dominio(e.url)} · {e.envio_numero ? `envío ${e.envio_numero}` : "aún sin enviar"}{anterior && e.reemplazada_en ? ` · ${e.estado === "reemplazada" ? "reemplazada" : "retirada"} el ${formatDateOnly(e.reemplazada_en)}` : ""}</span>
          </div>
          {esHttp(e.url)
            ? <a className="b2-btn b2-btn-sm" href={e.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${ETIQUETA_TIPO[e.tipo_enlace] ?? "enlace"} ${i + 1}`}>Abrir <IExterno width={14} height={14} /></a>
            : <span className="b2-sub">Enlace no válido</span>}
        </li>
      ))}
    </ul>
  );
}

export function VersionesAnteriores({ lista }: { lista: EvidenciaEnlace[] }) {
  const [abierto, setAbierto] = useState(false);
  if (lista.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="b2-link-btn" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {abierto ? "Ocultar" : "Ver"} versiones anteriores ({lista.length})
      </button>
      {abierto && <div style={{ marginTop: 6 }}><EnlacesB2 lista={lista} anterior /></div>}
    </div>
  );
}

/** Historial real del entregable, cargado solo cuando se pide. */
export function HistorialB2({ ruta, clave }: { ruta: string; clave: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="b2-link-btn" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {abierto ? "Ocultar historial" : "Ver historial y versiones"}
      </button>
      {abierto && <div className="b2-hist"><HistorialEntregable key={clave} ruta={ruta} /></div>}
    </div>
  );
}
