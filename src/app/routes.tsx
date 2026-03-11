import { createBrowserRouter } from "react-router";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import TeacherDashboard from "./pages/TeacherDashboard";
import MyProjects from "./pages/MyProjects";
import ProjectDetail from "./pages/ProjectDetail";
import ReportProgress from "./pages/ReportProgress";
import Evidences from "./pages/Evidences";
import ReportHistory from "./pages/ReportHistory";
import MatrizSeguimiento from "./pages/MatrizSeguimiento";
import AdminDashboard from "./pages/AdminDashboard";
import ReportReview from "./pages/ReportReview";
import ReportsMetrics from "./pages/ReportsMetrics";
import SystemAdmin from "./pages/SystemAdmin";
import { TeacherLayout } from "./components/TeacherLayout";
import { AdminLayout } from "./components/AdminLayout";

export const router = createBrowserRouter([
  { path: "/", Component: Login },
  { path: "/recuperar-contrasena", Component: ForgotPassword },
  {
    path: "/docente",
    Component: TeacherLayout,
    children: [
      { index: true, Component: TeacherDashboard },
      { path: "matriz", Component: MatrizSeguimiento },
      { path: "proyectos", Component: MyProjects },
      { path: "proyectos/:id", Component: ProjectDetail },
      { path: "reportar", Component: ReportProgress },
      { path: "evidencias", Component: Evidences },
      { path: "historial", Component: ReportHistory },
    ],
  },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminDashboard },
      { path: "revision", Component: ReportReview },
      { path: "reportes", Component: ReportsMetrics },
      { path: "sistema", Component: SystemAdmin },
    ],
  },
]);