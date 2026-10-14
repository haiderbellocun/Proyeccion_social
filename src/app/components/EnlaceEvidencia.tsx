import { ClipboardList, ExternalLink, FileText, Folder, Link2, Presentation, Sheet } from "lucide-react";
import { formatDateOnly } from "../lib/date";

// ProySocial administra enlaces y trazabilidad, no los archivos: cada docente guarda sus evidencias en su Drive.
// Que un enlace tenga forma válida NO garantiza que coordinación pueda abrirlo.

export interface EvidenciaEnlace {
  id: number;
  url: string;
  tipo_enlace: string;
  drive_id?: string | null;
  envio_numero: number | null;
  estado?: "vigente" | "reemplazada" | "retirada";
  creado_en?: string;
  reemplazada_en?: string | null;
}

export const ETIQUETA_TIPO: Record<string, string> = {
  drive_archivo: "Archivo de Drive",
  drive_carpeta: "Carpeta de Drive",
  google_doc: "Documento de Google",
  google_hoja: "Hoja de cálculo de Google",
  google_presentacion: "Presentación de Google",
  formulario: "Formulario",
  otro: "Enlace externo",
};

export const AVISO_ACCESO =
  "Asegúrate de que el personal encargado de la revisión tenga acceso al enlace compartido.";

export const esHttp = (valor: string) => {
  try {
    const u = new URL(valor.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

export const dominio = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
};

export function IconoEnlace({ tipo }: { tipo: string }) {
  const cls = "w-4 h-4 shrink-0";
  if (tipo === "drive_carpeta") return <Folder className={cls} />;
  if (tipo === "formulario") return <ClipboardList className={cls} />;
  if (tipo === "google_hoja") return <Sheet className={cls} />;
  if (tipo === "google_presentacion") return <Presentation className={cls} />;
  if (tipo === "drive_archivo" || tipo === "google_doc") return <FileText className={cls} />;
  return <Link2 className={cls} />;
}

/** Recomendación de permisos: se muestra al docente antes de enviar; no obliga a publicar el archivo. */
export function AvisoAcceso({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 ${className}`} role="note">
      <span style={{ fontWeight: 600 }}>{AVISO_ACCESO}</span>{" "}
      Puedes compartirlo solo con las cuentas de coordinación; no es necesario publicarlo para «cualquier persona con el enlace».
    </p>
  );
}

export function EnlaceEvidencia({ e, anterior = false }: { e: EvidenciaEnlace; anterior?: boolean }) {
  const seguro = esHttp(e.url);
  return (
    <div className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${anterior ? "border-gray-100 bg-gray-50 text-gray-500" : "border-gray-200 bg-white text-gray-800"}`}>
      <IconoEnlace tipo={e.tipo_enlace} />
      <div className="min-w-0 flex-1">
        <p className="truncate" title={e.url}>{ETIQUETA_TIPO[e.tipo_enlace] ?? "Enlace"} · {dominio(e.url)}</p>
        <p className="text-xs text-gray-500">
          {e.envio_numero ? `Entregada en el envío ${e.envio_numero}` : "Aún no enviada"}
          {anterior && e.reemplazada_en ? ` · ${e.estado === "reemplazada" ? "reemplazada" : "retirada"} el ${formatDateOnly(e.reemplazada_en)}` : ""}
        </p>
      </div>
      {seguro && (
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#1d4ed8] hover:underline shrink-0" aria-label={`Abrir ${ETIQUETA_TIPO[e.tipo_enlace] ?? "enlace"} en una pestaña nueva`}>
          Abrir <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
