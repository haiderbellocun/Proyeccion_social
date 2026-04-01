# 📋 ProySocial — Sistema de Gestión de Proyección Social

Aplicación web para la gestión, seguimiento y reporte de iniciativas de proyección social en instituciones educativas, con control por roles, trazabilidad de entregables e indicadores por semestre.

![Frontend](https://img.shields.io/badge/Frontend-React%2018-61DAFB?style=flat&logo=react) ![Language](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat&logo=typescript) ![Build](https://img.shields.io/badge/Build-Vite-646CFF?style=flat&logo=vite) ![Styles](https://img.shields.io/badge/Styles-TailwindCSS-06B6D4?style=flat&logo=tailwindcss) ![Backend](https://img.shields.io/badge/Backend-Express-000000?style=flat&logo=express) ![Database](https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=flat&logo=postgresql) ![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## 📌 Descripción

**ProySocial** es una aplicación diseñada para centralizar la operación de proyección social de una institución educativa, permitiendo gestionar proyectos, entregables semanales, docentes responsables, estados de avance y reportes de seguimiento en una sola plataforma.

La solución está orientada a equipos académicos que requieren visibilidad operativa sobre el cumplimiento de actividades, control del flujo de aprobación y una base sólida para la generación de reportes consolidados e indicadores de impacto social.

---

## ✨ Funcionalidades principales

- 📋 **Matriz de seguimiento** para trazabilidad de entregables por semana y docente
- 👥 **Sistema de roles**: Administrador y Docente
- 📊 **Reportes consolidados** con métricas e indicadores por grupo y semestre
- 🗂️ **Gestión de proyectos** con asignación de docentes y programas académicos
- 📁 **Registro de evidencias** por entregable con historial de estados
- 🔔 **Notificaciones** de entregables pendientes y vencidos
- 🏫 **Administración de grupos matriz** con plantillas de entregables
- 📈 **Panel de métricas** con avance consolidado por convenios, actividades e indicadores
- ⚙️ **Panel de administración del sistema** para usuarios, proyectos, perfiles e indicadores
- 🌐 **Arquitectura desacoplada** entre frontend, backend y base de datos

---


## 🏗️ Arquitectura
=======
##  Arquitectura
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Radix UI / shadcn/ui
- React Router 7
- Recharts
- React Hook Form
- Motion (Framer Motion)

### Backend
- Express.js
- Node.js
- PostgreSQL (`pg`)
- dotenv
- CORS

### Base de datos
- PostgreSQL 14+

---

 HEAD
## 📁 Estructura del proyecto
=======
##  Estructura del proyecto
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

```
app_Proyec_social/
├── src/                          # Frontend React
│   └── app/
│       ├── components/           # Componentes UI (layout, ui/, figma/)
│       ├── pages/                # Vistas y páginas
│       │   └── SystemAdmin/      # Panel de administración del sistema
│       ├── hooks/                # Custom hooks
│       ├── config/               # Configuración de la app
│       └── data/                 # Datos constantes y fixtures
│
├── backend/                      # Backend API
│   ├── src/
│   │   ├── index.js              # Entrada del servidor Express
│   │   ├── db.js                 # Pool de conexión PostgreSQL
│   │   └── routes/               # Rutas API
│   │       ├── auth.js           # Autenticación
│   │       ├── docente.js        # Rutas del docente
│   │       ├── admin.js          # Rutas del administrador
│   │       └── catalogo.js       # Catálogo de entregables
│   ├── migrations/               # Scripts SQL de migración (16 archivos)
│   └── scripts/                  # Utilidades de base de datos
│
├── guidelines/                   # Guías de desarrollo
├── package.json                  # Dependencias frontend
├── vite.config.ts                # Configuración Vite
└── index.html                    # Entrada HTML
```

---


## 🚀 Inicio rápido
=======
##  Inicio rápido
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

1. Clonar el repositorio:
   ```bash
   git clone <TU_REPOSITORIO>
   cd app_Proyec_social
   ```

2. Configurar variables de entorno:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```

---

HEAD
## 🔐 Variables de entorno
=======
##  Variables de entorno
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

**Frontend `.env`**
```env
VITE_API_URL=http://localhost:4000
```

**Backend `backend/.env`**
```env
PORT=4000
PGHOST=localhost
PGPORT=5432
PGDATABASE=app_proyecion
PGUSER=postgres
PGPASSWORD=tu_contraseña_aquí
ALLOWED_ORIGIN=http://localhost:5173
```

---

HEAD
## 🗄️ Configuración de base de datos
=======
##  Configuración de base de datos
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

Crea la base de datos y ejecuta las migraciones en orden:

```bash
psql -U postgres -c "CREATE DATABASE app_proyecion;"
psql -U postgres -d app_proyecion -f backend/migrations/fase2_indicadores.sql
psql -U postgres -d app_proyecion -f backend/migrations/fase2b_perfil_por_docente.sql
psql -U postgres -d app_proyecion -f backend/migrations/fase3a_evidencia_entregable.sql
# ... continuar con los demás archivos en backend/migrations/ en orden
```

---

 HEAD
## ▶️ Ejecución del proyecto
=======
## Ejecución del proyecto
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

**Backend**
```bash
cd backend
npm install
npm run dev
```

**Frontend**
```bash
cd ..
npm install
npm run dev
```

El frontend estará disponible en `http://localhost:5173` y el backend en `http://localhost:4000`.

---

HEAD
## 🔌 API principal

##  API principal
>>>>>>> e114e3e8f1da81985118e97c8b1181de84cb3e51

### Autenticación
- `POST /auth/login` — Iniciar sesión

### Docente
- `GET /docente/:id/dashboard` — Dashboard del docente
- `GET /docente/:id/dashboard-stats` — Estadísticas y progreso
- `GET /docente/:id/cronograma` — Cronograma asignado
- `GET /docente/:id/notificaciones` — Notificaciones del docente
- `GET /docente/:id/perfil` — Perfil del docente
- `GET /docente/:docenteId/matriz` — Matriz de seguimiento
- `PUT /docente/entregables/:entregableId` — Actualizar entregable
- `PATCH /docente/entregables/:entregableId/borrador` — Guardar borrador
- `GET /docente/:id/reportes` — Reportes del docente

### Admin
- `GET /admin/dashboard` — Panel general del administrador
- `GET /admin/metricas` — Métricas e indicadores
- `GET /admin/reportes-revision` — Reportes pendientes de revisión
- `PUT /admin/reportes-revision/:id` — Aprobar o rechazar reporte
- `GET /admin/docentes` — Listar docentes
- `POST /admin/usuarios` — Crear usuario
- `PUT /admin/usuarios/:id` — Actualizar usuario
- `DELETE /admin/usuarios/:id` — Eliminar usuario
- `GET /admin/proyectos` — Listar proyectos
- `POST /admin/proyectos` — Crear proyecto
- `GET /admin/grupos-matriz` — Listar grupos matriz
- `POST /admin/grupos-matriz` — Crear grupo matriz
- `POST /admin/grupos-matriz/:id/clonar` — Clonar grupo matriz
- `GET /admin/avance-consolidado` — Reporte consolidado de avance
- `GET /admin/perfiles-indicador` — Perfiles de indicador
- `GET /health` — Estado de conexión a la base de datos
