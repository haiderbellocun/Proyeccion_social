import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  Send,
  User,
} from "lucide-react";
import { Badge } from "../components/Badge";

const API_BASE_URL = "http://localhost:4000";

const pendingReports = [
  {
    id: 1,
    teacher: "Mg. María Rodríguez",
    school: "Escuela de Ingeniería de Sistemas",
    program: "Ing. de Sistemas",
    email: "m.rodriguez@universidad.edu",
    project: "Alfabetización Digital - Comunidad Norte",
    week: "Semana 8",
    date: "15 Mar 2024",
    activity: "Taller de herramientas digitales básicas",
    description:
      "Se realizó la sesión N°11 del taller de alfabetización digital con 18 participantes adultos mayores. Se cubrieron los temas de uso de correo electrónico, navegación web segura y uso de redes sociales básicas. Se contó con apoyo de 2 estudiantes voluntarios. La sesión tuvo una duración de 3 horas.",
    progress: 88,
    evidences: [
      { name: "Lista-asistencia-S8.pdf", type: "PDF" },
      { name: "Fotos-sesion-11.jpg", type: "JPG" },
      { name: "https://drive.google.com/archivo-material-s8", type: "LINK" },
    ],
    status: "pending" as const,
  },
  {
    id: 2,
    teacher: "Mg. Ana Torres",
    school: "Escuela de Educación",
    program: "Educación",
    email: "a.torres@universidad.edu",
    project: "Convenio UGEL - Capacitación Docente",
    week: "Semana 7",
    date: "08 Mar 2024",
    activity: "Reunión de planificación mensual",
    description:
      "Reunión de coordinación con directores de instituciones educativas de la UGEL para definir el cronograma de capacitaciones del segundo semestre. Se acordaron 6 fechas de talleres y se distribuyeron responsabilidades.",
    progress: 45,
    evidences: [
      { name: "Acta-reunion-UGEL.pdf", type: "PDF" },
    ],
    status: "review" as const,
  },
];

export default function ReportReview() {
  const [current, setCurrent] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewed, setReviewed] = useState<Record<number, string>>({});
  const [selectedSchool, setSelectedSchool] = useState<string>("Todas");
  const [selectedProgram, setSelectedProgram] = useState<string>("Todos");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("Todos");

  const [catalogSchools, setCatalogSchools] = useState<
    { name: string; programs: { id: number; name: string; code: string; teachers: { id: number; fullName: string }[] }[] }[]
  >([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        setLoadingCatalogs(true);
        const res = await fetch(`${API_BASE_URL}/admin/catalogos`);
        if (!res.ok) throw new Error("Error al cargar catálogos");
        const data = await res.json();
        setCatalogSchools(data.schools || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCatalogs(false);
      }
    };
    loadCatalogs();
  }, []);

  const schools = catalogSchools.map((s) => s.name);

  const programsForSchool =
    selectedSchool === "Todas"
      ? catalogSchools.flatMap((s) => s.programs.map((p) => p.name))
      : (catalogSchools.find((s) => s.name === selectedSchool)?.programs || []).map(
          (p) => p.name
        );

  const teachersForProgram = catalogSchools
    .filter((s) => (selectedSchool === "Todas" ? true : s.name === selectedSchool))
    .flatMap((s) => s.programs)
    .filter((p) => (selectedProgram === "Todos" ? true : p.name === selectedProgram))
    .flatMap((p) => p.teachers.map((t) => t.fullName));

  const filteredReports = pendingReports.filter((r) => {
    if (selectedSchool !== "Todas" && r.school !== selectedSchool) return false;
    if (selectedProgram !== "Todos" && r.program !== selectedProgram) return false;
    if (selectedTeacher !== "Todos" && r.teacher !== selectedTeacher) return false;
    return true;
  });

  const safeIndex =
    filteredReports.length > 0 ? Math.min(current, filteredReports.length - 1) : 0;
  const report =
    filteredReports.length > 0 ? filteredReports[safeIndex] : pendingReports[0];

  const handleAction = (action: "approve" | "adjust" | "reject") => {
    setReviewed({ ...reviewed, [report.id]: action });
    setComment("");
    if (current < pendingReports.length - 1) setCurrent(current + 1);
  };

  const actionLabels = {
    approve: { label: "Aprobado", color: "text-emerald-600" },
    adjust: { label: "Requiere ajustes", color: "text-amber-600" },
    reject: { label: "Rechazado", color: "text-red-600" },
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Revisión de Reportes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {filteredReports.length} reporte
            {filteredReports.length !== 1 ? "s" : ""} pendientes de revisión
          </p>
        </div>

        {/* Navegación entre reportes */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrent(Math.max(0, safeIndex - 1))}
            disabled={safeIndex === 0 || filteredReports.length === 0}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600">
            {filteredReports.length > 0 ? safeIndex + 1 : 0} / {filteredReports.length}
          </span>
          <button
            onClick={() =>
              setCurrent(
                Math.min(
                  filteredReports.length > 0 ? filteredReports.length - 1 : 0,
                  safeIndex + 1
                )
              )
            }
            disabled={
              filteredReports.length === 0 || safeIndex === filteredReports.length - 1
            }
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filtros debajo del título */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">
            Filtros {loadingCatalogs && "(cargando...)"}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={selectedSchool}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSchool(value);
              setSelectedProgram("Todos");
              setSelectedTeacher("Todos");
              setCurrent(0);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
          >
            <option value="Todas">Todas las escuelas</option>
            {schools.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={selectedProgram}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedProgram(value);
              setSelectedTeacher("Todos");
              setCurrent(0);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
          >
            <option value="Todos">Todos los programas</option>
            {programsForSchool.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={selectedTeacher}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedTeacher(value);
              setCurrent(0);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]"
          >
            <option value="Todos">Todos los docentes</option>
            {teachersForProgram.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Report list mini */}
      <div className="flex gap-2 flex-wrap">
        {filteredReports.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setCurrent(i)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              i === safeIndex
                ? "bg-[#1e3a8a] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            style={{ fontWeight: i === safeIndex ? 600 : 400 }}
          >
            {reviewed[r.id] ? (
              <span className={actionLabels[reviewed[r.id] as keyof typeof actionLabels].color}>
                ✓ {r.teacher.split(" ").slice(1).join(" ")}
              </span>
            ) : (
              r.teacher.split(" ").slice(1).join(" ")
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="xl:col-span-2 space-y-5">
          {/* Teacher info */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-gray-800">{report.teacher}</h3>
                    <p className="text-gray-500 text-sm">{report.program}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{report.email}</p>
                  </div>
                  <Badge variant={report.status} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-400">Proyecto</p>
                    <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{report.project}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Semana</p>
                    <p className="text-sm text-gray-700 mt-0.5">{report.week}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Avance reportado</p>
                    <p className="text-sm text-gray-700 mt-0.5" style={{ fontWeight: 700 }}>
                      {report.progress}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Actividades Reportadas</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700" style={{ fontWeight: 500 }}>
                {report.activity}
              </p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{report.description}</p>
            </div>
          </div>

          {/* Evidences */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Evidencias</h3>
            <div className="space-y-2">
              {report.evidences.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  {ev.type === "LINK" ? (
                    <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#1d4ed8] shrink-0" />
                  )}
                  <span className="flex-1 text-sm text-gray-700 truncate">{ev.name}</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions panel */}
        <div className="space-y-5">
          {reviewed[report.id] ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-gray-800 text-sm" style={{ fontWeight: 600 }}>
                Reporte revisado
              </p>
              <p className={`text-sm mt-1 ${actionLabels[reviewed[report.id] as keyof typeof actionLabels].color}`}>
                {actionLabels[reviewed[report.id] as keyof typeof actionLabels].label}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h3 className="text-gray-800">Decisión del Revisor</h3>

              <div>
                <label className="block text-sm text-gray-700 mb-1.5" style={{ fontWeight: 500 }}>
                  Comentario (opcional)
                </label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escribe un comentario para el docente sobre este reporte..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none"
                />
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleAction("approve")}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Aprobar reporte
                </button>
                <button
                  onClick={() => handleAction("adjust")}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <AlertCircle className="w-4 h-4" /> Solicitar ajustes
                </button>
                <button
                  onClick={() => handleAction("reject")}
                  className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 py-2.5 rounded-lg text-sm transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <XCircle className="w-4 h-4" /> Rechazar reporte
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-gray-800 mb-3">Notificar Docente</h3>
            <textarea
              rows={3}
              placeholder="Mensaje personalizado para el docente..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8] bg-gray-50 resize-none mb-3"
            />
            <button className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Send className="w-4 h-4" /> Enviar notificación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
