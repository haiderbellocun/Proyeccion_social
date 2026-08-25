import { createBrowserRouter } from "react-router";
import { lazy } from "react";
import { TeacherLayout } from "./components/TeacherLayout";
import { AdminLayout } from "./components/AdminLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Login = lazy(() => import("./pages/Login"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const MyProjects = lazy(() => import("./pages/MyProjects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const ReportProgress = lazy(() => import("./pages/ReportProgress"));
const Evidences = lazy(() => import("./pages/Evidences"));
const ReportHistory = lazy(() => import("./pages/ReportHistory"));
const MatrizSeguimiento = lazy(() => import("./pages/MatrizSeguimiento"));
const TeacherProfile = lazy(() => import("./pages/TeacherProfile"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ReportReview = lazy(() => import("./pages/ReportReview"));
const ReportsMetrics = lazy(() => import("./pages/ReportsMetrics"));
const SystemAdmin = lazy(() => import("./pages/SystemAdmin"));
const IndicadoresGrupo = lazy(() => import("./pages/IndicadoresGrupo"));
const AdminMatrizDocente = lazy(() => import("./pages/AdminMatrizDocente"));
const AvanceConsolidado = lazy(() => import("./pages/AvanceConsolidado"));

export const router = createBrowserRouter([
  { path: "/", Component: Login },
  {
    path: "/docente",
    element: (
      <ProtectedRoute role="docente">
        <TeacherLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: TeacherDashboard },
      { path: "matriz", Component: MatrizSeguimiento },
      { path: "proyectos", Component: MyProjects },
      { path: "proyectos/:id", Component: ProjectDetail },
      { path: "reportar", Component: ReportProgress },
      { path: "evidencias", Component: Evidences },
      { path: "historial", Component: ReportHistory },
      { path: "perfil", Component: TeacherProfile },
    ],
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute role="admin">
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: AdminDashboard },
      { path: "revision", Component: ReportReview },
      { path: "reportes", Component: ReportsMetrics },
      { path: "avance", Component: AvanceConsolidado },
      { path: "docentes/:docenteId/matriz", Component: AdminMatrizDocente },
      { path: "indicadores", Component: IndicadoresGrupo },
      { path: "sistema", Component: SystemAdmin },
    ],
  },
]);
