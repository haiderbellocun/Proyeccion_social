import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Target,
  Calendar,
  Users,
  FileText,
  Paperclip,
  Plus,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import { Badge } from "../components/Badge";

const project = {
  name: "Alfabetización Digital - Comunidad Norte",
  type: "project" as const,
  status: "active" as const,
  program: "Ing. de Sistemas",
  coordinator: "Mg. María Rodríguez",
  startDate: "01 Mar 2024",
  endDate: "30 Jun 2024",
  hours: 120,
  hoursCompleted: 86,
  progress: 72,
  description:
    "Proyecto de extensión universitaria orientado a capacitar a adultos y adultos mayores de la Comunidad Norte en el uso de herramientas digitales básicas: computación, internet, banca digital y trámites virtuales. Contribuye al ODS 4 (Educación de calidad) y ODS 10 (Reducción de desigualdades).",
  objectives: [
    "Capacitar a 120 personas en competencias digitales básicas",
    "Desarrollar 15 sesiones prácticas de alfabetización digital",
    "Generar material didáctico adaptado para adultos mayores",
    "Establecer convenio con el municipio para continuidad del programa",
  ],
  indicators: [
    { label: "Beneficiarios capacitados", target: 120, current: 86 },
    { label: "Sesiones ejecutadas", target: 15, current: 11 },
    { label: "Material generado", target: 5, current: 4 },
  ],
  schedule: [
    { week: "Semana 1-2", activity: "Diagnóstico y planificación", status: "done" },
    { week: "Semana 3-5", activity: "Talleres módulo básico", status: "done" },
    { week: "Semana 6-8", activity: "Talleres módulo internet y redes", status: "done" },
    { week: "Semana 9-10", activity: "Talleres banca digital", status: "current" },
    { week: "Semana 11-12", activity: "Evaluación final y cierre", status: "upcoming" },
  ],
  evidences: [
    { name: "Registro-asistencia-S1.pdf", date: "05 Mar 2024", type: "PDF" },
    { name: "Fotos-taller-digital.zip", date: "12 Mar 2024", type: "ZIP" },
    { name: "Material-modulo1.pptx", date: "15 Mar 2024", type: "PPTX" },
  ],
};

const statusIcon = {
  done: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  current: <Clock className="w-4 h-4 text-amber-500" />,
  upcoming: <Circle className="w-4 h-4 text-gray-300" />,
};

export default function ProjectDetail() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/docente/proyectos")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Mis Proyectos
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={project.type} />
              <Badge variant={project.status} />
            </div>
            <h1 className="text-gray-900">{project.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {project.program} · Coord: {project.coordinator}
            </p>
          </div>
          <button
            onClick={() => navigate("/docente/reportar")}
            className="flex items-center gap-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" /> Reportar Avance
          </button>
        </div>
      </div>

      {/* Progress bar + stats */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {[
            { label: "Progreso total", value: `${project.progress}%` },
            { label: "Horas completadas", value: `${project.hoursCompleted}/${project.hours}` },
            { label: "Inicio", value: project.startDate },
            { label: "Cierre", value: project.endDate },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-gray-800 mt-1" style={{ fontWeight: 700 }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1d4ed8] rounded-full transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-[#1d4ed8]" />
              <h3 className="text-gray-800">Descripción</h3>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">{project.description}</p>
          </div>

          {/* Objectives */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-[#1d4ed8]" />
              <h3 className="text-gray-800">Objetivos</h3>
            </div>
            <ul className="space-y-2">
              {project.objectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-[#1d4ed8] shrink-0 mt-0.5" style={{ fontSize: 10, fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  {obj}
                </li>
              ))}
            </ul>
          </div>

          {/* Cronogram */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-[#1d4ed8]" />
              <h3 className="text-gray-800">Cronograma de Actividades</h3>
            </div>
            <div className="space-y-3">
              {project.schedule.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="shrink-0">{statusIcon[item.status as keyof typeof statusIcon]}</div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className={`text-sm ${item.status === "upcoming" ? "text-gray-400" : "text-gray-700"}`}>
                      {item.activity}
                    </span>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">{item.week}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Indicators */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[#1d4ed8]" />
              <h3 className="text-gray-800">Indicadores</h3>
            </div>
            <div className="space-y-4">
              {project.indicators.map((ind) => (
                <div key={ind.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-600">{ind.label}</span>
                    <span className="text-gray-700" style={{ fontWeight: 600 }}>
                      {ind.current}/{ind.target}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1d4ed8] rounded-full"
                      style={{ width: `${(ind.current / ind.target) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidences */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#1d4ed8]" />
                <h3 className="text-gray-800">Evidencias</h3>
              </div>
              <button
                onClick={() => navigate("/docente/evidencias")}
                className="text-xs text-[#1d4ed8] hover:underline"
              >
                + Agregar
              </button>
            </div>
            <div className="space-y-2">
              {project.evidences.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 bg-blue-100 rounded flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-[#1d4ed8]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate" style={{ fontWeight: 500 }}>
                      {ev.name}
                    </p>
                    <p className="text-xs text-gray-400">{ev.date}</p>
                  </div>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
