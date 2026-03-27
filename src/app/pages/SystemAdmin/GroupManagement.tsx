import { useEffect, useState } from "react";
import { API_BASE } from "../../config/api";

const API_BASE_URL = API_BASE;

type EntregableItem = { texto: string; horas: number | null };
type WeekDetail = {
  id?: number;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  entregables?: EntregableItem[];
};
type WeeklyProject = { id: number; name: string; weeks: WeekDetail[] };

export default function GroupManagement() {
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProject[]>([]);
  const [selectedWeeklyProjectId, setSelectedWeeklyProjectId] = useState<number | null>(null);
  const [weeklyItems, setWeeklyItems] = useState<Record<string, EntregableItem[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const resWeeks = await fetch(`${API_BASE_URL}/admin/proyectos-semanas`);
        if (!resWeeks.ok) return;
        const data = await resWeeks.json();
        const fromServer = (data.proyectos || []) as WeeklyProject[];
        setWeeklyProjects(fromServer);
        if (fromServer.length > 0) setSelectedWeeklyProjectId(fromServer[0].id);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información. Intente de nuevo más tarde.");
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div>
        <h2 className="text-gray-900 text-base" style={{ fontWeight: 600 }}>
          Tareas semanales por iniciativa
        </h2>
        <p className="text-gray-500 text-xs mt-0.5">
          Selecciona una iniciativa y define las tareas o entregables por semana.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm max-h-[420px] overflow-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-500" style={{ fontWeight: 500 }}>
              Iniciativas con cronograma
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {weeklyProjects.length === 0 && (
              <div className="px-4 py-4 text-xs text-gray-400">
                Aún no hay iniciativas con semanas registradas.
              </div>
            )}
            {weeklyProjects.map((proj) => (
              <button
                key={proj.id}
                onClick={() => setSelectedWeeklyProjectId(proj.id)}
                className={`w-full text-left px-4 py-3 text-sm flex flex-col gap-0.5 hover:bg-gray-50 ${
                  selectedWeeklyProjectId === proj.id ? "bg-blue-50 border-l-2 border-[#1d4ed8]" : ""
                }`}
              >
                <span className="text-gray-800" style={{ fontWeight: 500 }}>
                  {proj.name}
                </span>
                <span className="text-[11px] text-gray-400">{proj.weeks.length} semanas</span>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {selectedWeeklyProjectId == null && (
            <p className="text-sm text-gray-400">
              Selecciona una iniciativa de la lista para ver sus semanas.
            </p>
          )}
          {selectedWeeklyProjectId != null &&
            (() => {
              const proj = weeklyProjects.find((p) => p.id === selectedWeeklyProjectId);
              if (!proj) {
                return <p className="text-sm text-gray-400">No se encontró información.</p>;
              }
              const handleSaveDeliverables = async () => {
                try {
                  const semanasPayload = proj.weeks.map((w) => {
                    const key = `${proj.id}-${w.numero}`;
                    const items: EntregableItem[] =
                      weeklyItems[key] ??
                      (w.entregables && w.entregables.length > 0
                        ? w.entregables
                        : [{ texto: "", horas: null }]);
                    return { semanaId: w.id, entregables: items };
                  });
                  const res = await fetch(
                    `${API_BASE_URL}/admin/proyectos/${proj.id}/entregables-semanales`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ semanas: semanasPayload }),
                    }
                  );
                  if (!res.ok) return;
                  alert("Entregables guardados correctamente.");
                } catch (err) {
                  console.error(err);
                }
              };
              return (
                <div className="space-y-4">
                  <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
                    {proj.name}
                  </p>
                  <div className="space-y-3 max-h-[300px] overflow-auto pr-1">
                    {proj.weeks.map((w) => {
                      const key = `${proj.id}-${w.numero}`;
                      const items: EntregableItem[] =
                        weeklyItems[key] ??
                        (w.entregables && w.entregables.length > 0
                          ? w.entregables
                          : [{ texto: "", horas: null }]);
                      return (
                        <div key={key} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                          <p className="text-xs text-gray-700" style={{ fontWeight: 600 }}>
                            Semana {w.numero}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {w.fechaInicio} — {w.fechaFin}
                          </p>
                          <div className="space-y-1.5 mt-2">
                            {items.map((item, idx) => (
                              <div key={`${key}-${idx}`} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={item.texto}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setWeeklyItems((prev) => {
                                      const current = prev[key] ?? items;
                                      const copy = [...current];
                                      copy[idx] = { ...copy[idx], texto: v };
                                      return { ...prev, [key]: copy };
                                    });
                                  }}
                                  className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                  placeholder="Agregar entregable..."
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={item.horas ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setWeeklyItems((prev) => {
                                      const current = prev[key] ?? items;
                                      const copy = [...current];
                                      copy[idx] = { ...copy[idx], horas: v === "" ? null : Number(v) };
                                      return { ...prev, [key]: copy };
                                    });
                                  }}
                                  className="w-20 text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-white"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveDeliverables}
                      className="px-4 py-2.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white rounded-lg text-xs shadow-sm"
                      style={{ fontWeight: 600 }}
                    >
                      Guardar entregables
                    </button>
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
