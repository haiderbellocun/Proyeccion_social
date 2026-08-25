import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Link2,
  ExternalLink,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { API_BASE, apiFetch as fetch } from "../config/api";
import { notify } from "../lib/notify";

const API_BASE_URL = API_BASE;

type CronogramaEntregable = {
  id: number;
  descripcion: string;
  completado: boolean;
  url_evidencia: string | null;
};

type CronogramaSemana = {
  id: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregablesDetalle?: CronogramaEntregable[];
};

type CronogramaProyecto = {
  id: number;
  name: string;
  weeks: CronogramaSemana[];
};

type EvidenceRow = {
  proyectoId: number;
  iniciativa: string;
  semanaNumero: number;
  entregable: string;
  link: string;
  completado: boolean;
};

export default function Evidences() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docenteId = currentUser?.id ?? null;

    if (!docenteId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/docente/${docenteId}/cronograma`);
        if (!res.ok) throw new Error("Error al cargar cronograma del docente");
        const data = await res.json();
        const proyectos = (data.proyectos || []) as CronogramaProyecto[];

        const evidences: EvidenceRow[] = [];
        for (const p of proyectos) {
          for (const w of p.weeks || []) {
            const ents = w.entregablesDetalle || [];
            for (const e of ents) {
              if (e.url_evidencia && String(e.url_evidencia).trim() !== "") {
                evidences.push({
                  proyectoId: p.id,
                  iniciativa: p.name,
                  semanaNumero: w.numero,
                  entregable: e.descripcion,
                  link: e.url_evidencia,
                  completado: e.completado === true,
                });
              }
            }
          }
        }

        setRows(evidences);
      } catch (err) {
        console.error(err);
        notify.error("No se pudo cargar la información. Intente de nuevo más tarde.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser?.id]);

  const shortDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return url.length > 28 ? `${url.slice(0, 28)}…` : url;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-gray-900">Mis Evidencias</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Entregables con enlace de evidencia registrado
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-[#1d4ed8] rounded-full animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm text-gray-600">
            Aún no has registrado evidencias. Ve al detalle de una iniciativa para agregar
            links de Drive.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3">Iniciativa</th>
                  <th className="text-left px-6 py-3">Semana</th>
                  <th className="text-left px-6 py-3">Entregable</th>
                  <th className="text-left px-6 py-3">Link</th>
                  <th className="text-left px-6 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, idx) => (
                  <tr
                    key={`${r.proyectoId}-${r.semanaNumero}-${idx}`}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-800" style={{ fontWeight: 500 }}>
                      {r.iniciativa}
                    </td>
                    <td className="px-6 py-4 text-gray-600">Semana {r.semanaNumero}</td>
                    <td className="px-6 py-4 text-gray-600">{r.entregable}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-[#1d4ed8]" />
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1d4ed8] hover:text-[#1e3a8a] truncate max-w-[240px]"
                        >
                          {shortDomain(r.link)}
                        </a>
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-600"
                          title="Abrir enlace"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {r.completado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                          <Circle className="w-3.5 h-3.5" />
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => navigate("/docente/proyectos")}
              className="text-sm text-[#1d4ed8] hover:text-[#1e3a8a]"
              style={{ fontWeight: 500 }}
            >
              Ver mis iniciativas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
