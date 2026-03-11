import { useState } from "react";
import { Link2, FileText, Image, Video, Trash2, ExternalLink, X } from "lucide-react";
import { Badge } from "../components/Badge";

const evidenceData = [
  { id: 1, name: "Registro-asistencia-S1.pdf", date: "05 Mar 2024", type: "PDF", project: "Alfabetización Digital", status: "approved" as const },
  { id: 2, name: "Fotos-taller-digital.zip", date: "12 Mar 2024", type: "ZIP", project: "Alfabetización Digital", status: "pending" as const },
  { id: 3, name: "drive.google.com/file/d/1abc...", date: "13 Mar 2024", type: "LINK", project: "Convenio UGEL", status: "review" as const },
  { id: 4, name: "Material-modulo1.pptx", date: "15 Mar 2024", type: "PPTX", project: "Alfabetización Digital", status: "approved" as const },
  { id: 5, name: "Informe-huertos-S7.docx", date: "08 Mar 2024", type: "DOCX", project: "Huertos Urbanos", status: "pending" as const },
];

const iconForType = (type: string) => {
  if (type === "LINK") return <Link2 className="w-4 h-4 text-blue-500" />;
  if (["JPG", "PNG", "ZIP"].includes(type)) return <Image className="w-4 h-4 text-purple-500" />;
  if (type === "MP4") return <Video className="w-4 h-4 text-red-500" />;
  return <FileText className="w-4 h-4 text-[#1d4ed8]" />;
};

export default function Evidences() {
  const [link, setLink] = useState("");
  const [links, setLinks] = useState<string[]>([]);

  const addLink = () => {
    if (link.trim()) {
      setLinks([...links, link.trim()]);
      setLink("");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-gray-900">Carga de Evidencias</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Agrega enlaces como evidencia de tus actividades
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Área de enlaces */}
        <div className="xl:col-span-2 space-y-5">
          {/* Enlace */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-gray-800 mb-4">Agregar Enlace</h3>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://drive.google.com/file/..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50"
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                />
              </div>
              <button
                onClick={addLink}
                className="px-5 py-2.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white rounded-lg text-sm transition-colors"
                style={{ fontWeight: 600 }}
              >
                Agregar
              </button>
            </div>

            {links.length > 0 && (
              <div className="mt-3 space-y-2">
                {links.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg text-sm"
                  >
                    <Link2 className="w-3.5 h-3.5 text-[#1d4ed8] shrink-0" />
                    <span className="flex-1 text-[#1d4ed8] truncate">{l}</span>
                    <button onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                      <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side: project selector */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-4">Asociar a</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>
                  Proyecto
                </label>
                <select className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
                  <option>Seleccionar...</option>
                  <option>Alfabetización Digital</option>
                  <option>Convenio UGEL</option>
                  <option>Huertos Urbanos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 500 }}>
                  Semana
                </label>
                <select className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50">
                  <option>Semana 8</option>
                  <option>Semana 7</option>
                  <option>Semana 6</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evidences table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-gray-800">Evidencias cargadas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-6 py-3">Nombre</th>
                <th className="text-left px-6 py-3">Fecha</th>
                <th className="text-left px-6 py-3">Tipo</th>
                <th className="text-left px-6 py-3">Proyecto</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-left px-6 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {evidenceData.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      {iconForType(ev.type)}
                      <span className="text-gray-700 truncate max-w-[180px]">{ev.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{ev.date}</td>
                  <td className="px-6 py-4">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                      {ev.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 max-w-[140px] truncate">
                    {ev.project}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={ev.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="text-[#1d4ed8] hover:text-[#1e3a8a] transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button className="text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
