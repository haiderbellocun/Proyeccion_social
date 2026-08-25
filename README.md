# 🌟 ProySocial — Sistema de Gestión y Seguimiento de Proyección Social

<div align="center">

[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18_Enterprise-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Google Cloud Run](https://img.shields.io/badge/Google_Cloud_Run-Serverless-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cloud.google.com/run)
[![Google OAuth 2.0](https://img.shields.io/badge/Google_Identity-OAuth_2.0-EA4335?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/identity)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Plataforma institucional de alta precisión para la planeación, recolección de evidencias, evaluación de entregables, analítica de avance y monitoreo de iniciativas de Proyección Social.**

[Características](#-características-principales-por-rol) • [Arquitectura del Sistema](#-arquitectura-del-sistema) • [Modelo de Datos](#-modelo-de-datos-canónico) • [Métricas y Cálculo](#-modelo-matemático-de-indicadores) • [Puesta en Marcha](#-guía-de-instalación-y-ejecución-local) • [Despliegue GCP](#-despliegue-en-producción-google-cloud-platform) • [Documentación](#-documentación-adicional)

</div>

---

## 📌 Tabla de Contenidos

1. [Visión General del Proyecto](#-visión-general-del-proyecto)
2. [Características Principales por Rol](#-características-principales-por-rol)
   - [Portal del Docente](#-portal-del-docente)
   - [Portal Administrativo](#-portal-administrativo-y-coordinación)
3. [Arquitectura del Sistema](#-arquitectura-del-sistema)
   - [Diagrama de Arquitectura Global](#diagrama-de-arquitectura-global)
   - [Flujo de Autenticación Zero-Password](#flujo-de-autenticación-zero-password)
   - [Sistema de Notificaciones Bi-Canal](#sistema-de-notificaciones-bi-canal-app--correo)
4. [Modelo de Datos Canónico (Fase 19+)](#-modelo-de-datos-canónico)
   - [Diagrama Entidad-Relación (ERD)](#diagrama-entidad-relación-erd)
   - [Reglas de Precedencia y Excepciones Individuales](#reglas-de-precedencia-y-excepciones-individuales)
5. [Modelo Matemático de Indicadores](#-modelo-matemático-de-indicadores)
6. [Stack Tecnológico](#-stack-tecnológico)
7. [Estructura del Proyecto](#-estructura-del-proyecto)
8. [Variables de Entorno](#-variables-de-entorno)
9. [Guía de Instalación y Ejecución Local](#-guía-de-instalación-y-ejecución-local)
10. [Despliegue en Producción (Google Cloud Platform)](#-despliegue-en-producción-google-cloud-platform)
    - [Arquitectura Single-Container (Docker)](#arquitectura-single-container-docker)
    - [Infraestructura en GCP](#infraestructura-en-gcp)
    - [Pipeline Automatizado CI/CD](#pipeline-automatizado-cicd)
11. [Protocolo de Carga de Datos en Producción](#-protocolo-de-carga-de-datos-en-producción)
12. [Comandos de Mantenimiento y Testing](#-comandos-de-mantenimiento-y-testing)
13. [Referencia de la API REST](#-referencia-de-la-api-rest)
14. [Documentación Adicional](#-documentación-adicional)

---

## 📖 Visión General del Proyecto

**ProySocial** es una solución web empresarial diseñada para digitalizar, estructurar y auditar la totalidad del ciclo de vida de la **Proyección Social Universitaria**. Reemplaza el seguimiento fragmentado en hojas de cálculo por un ecosistema unificado, centralizado y reactivo en tiempo real.

### Principios Rectores
- 🎯 **Base de datos como única fuente de verdad:** Cero datos ficticios o mocks en frontend. Toda la información operativa reside en PostgreSQL.
- 🔒 **Seguridad "Zero-Password":** Autenticación delegada exclusivamente a **Google Identity Services (OAuth 2.0)** vinculada al correo institucional. No existen contraseñas locales ni formularios de registro inseguros.
- 📊 **Métricas transparentes y trazables:** Cálculo dinámico de avance real frente al esperado, brechas de cumplimiento y semáforos de riesgo en tiempo real.
- ⚙️ **Flexibilidad operativa con integridad:** Plantillas estandarizadas por grupos matrices semestrales combinadas con un motor de **excepciones individuales por docente** y herramientas de **actualización masiva**.
- ⏱️ **Auditoría inmutable:** Registro de fecha/hora de cargue y entrega generado obligatoriamente en el servidor (inmune a manipulaciones del cliente).

---

## 🚀 Características Principales por Rol

### 👨‍🏫 Portal del Docente

```
                                  PORTAL DEL DOCENTE
  ┌───────────────────────┬───────────────────────┬───────────────────────┐
  │  📊 Panel de Control  │  📅 Matriz Semanal    │  📂 Mis Iniciativas   │
  │  - Avance Real vs     │  - 16 semanas         │  - Proyectos,         │
  │    Esperado           │    estructuradas      │    actividades y      │
  │  - Cumplimiento &     │  - Links institucionales│   convenios           │
  │    brechas            │  - Cargue de evidencia│  - Horas estimadas    │
  │  - Próximos a vencer  │  - Indicadores mes/sem│    y cronograma       │
  └───────────────────────┴───────────────────────┴───────────────────────┘
  ┌───────────────────────┬───────────────────────┬───────────────────────┐
  │  📝 Historial & Feed  │  📁 Mis Evidencias    │  👤 Perfil Académico  │
  │  - Estados: Enviado,  │  - Repositorio unifi- │  - Programa, Escuela  │
  │    Aprobado, Observado│    cado de enlaces    │  - Regional & Grupo   │
  │  - Retroalimentación  │  - Filtros por sema-  │  - Carpeta de Drive   │
  │  - Reenvío de ajustes │    na e iniciativa    │    institucional      │
  └───────────────────────┴───────────────────────┴───────────────────────┘
```

- **Dashboard Inteligente:** Visualización instantánea de entregables pendientes, completados, porcentaje de avance real vs. exigible a la fecha, brecha de cumplimiento e indicadores de carga horaria.
- **Matriz de Seguimiento Semanal (Semanas 1 a 16):** Checklist interactivo basado en el grupo matriz asignado (Grupos 1 al 15, Antiguos/Nuevos). Permite registrar enlaces de evidencia (Google Drive, OneDrive, SharePoint) o notas de cumplimiento.
- **Gestión de Iniciativas:** Acceso a proyectos, actividades, convenios y capacitaciones asignadas donde actúa como responsable o docente colaborador.
- **Flujo de Revisión y Corrección:** Historial completo de entregas con estado en tiempo real (`enviado`, `aprobado`, `observado`). Si un evaluador solicita ajustes, el docente visualiza el comentario detallado y reenvía su evidencia con un clic.
- **Alertas y Notificaciones:** Campana interactiva con insignias en tiempo real y recepción sincronizada de correos electrónicos automáticos.

---

### 🛡️ Portal Administrativo y Coordinación

```
                              PORTAL ADMINISTRATIVO
  ┌───────────────────────┬───────────────────────┬───────────────────────┐
  │  📈 Dashboard Global  │  📬 Bandeja Revisión  │  📑 Avance Consolidado│
  │  - KPIs institucionales│ - Evaluación en vivo │  - Tabla comparativa  │
  │  - Semáforos de riesgo│  - Aprobación /       │  - Semáforos docente /│
  │  - Gráficos Recharts  │    observación        │    programa / escuela │
  │  - Filtros jerárquicos│  - Feedback directo   │  - Detección rezagos  │
  └───────────────────────┴───────────────────────┴───────────────────────┘
  ┌───────────────────────┬───────────────────────┬───────────────────────┐
  │  🎯 Matriz del Docente│  ⚙️ Administración    │  ⚡ Acciones Masivas  │
  │  - Excepciones indivi-│  - Semestres & Escuelas│ - Actualización de   │
  │    duales             │  - Programas & Usuarios│   enlaces y descrip- │
  │  - Ajuste de fechas,  │  - Iniciativas &      │   ciones por nombre  │
  │    texto e iniciativa │    Grupos Matrices    │ - Clonación semestral│
  └───────────────────────┴───────────────────────┴───────────────────────┘
```

- **Dashboard Gerencial:** Monitoreo global del rendimiento académico institucional, distribución por facultades/escuelas, tasas de entrega y entregables en cola de revisión.
- **Bandeja de Revisión Centralizada:** Interfaz fluida para auditar reportes recibidos. Permite aprobar o solicitar ajustes con observaciones que detonan notificaciones inmediatas al docente.
- **Consolidado de Avance:** Análisis matricial de cumplimiento por docente, programa y escuela académica, facilitando auditorías de calidad y acreditación.
- **Personalización de Matriz (Excepciones por Docente):** Capacidad de modificar texto, evidencia requerida, enlace de referencia, fechas o iniciativa para un docente particular sin alterar la plantilla estándar del grupo.
- **Administración Integral de Catálogos (CRUD Completo):**
  - **Semestres:** Creación, activación (regla de un único semestre activo) y clonación.
  - **Escuelas y Programas:** Gestión jerárquica (`Escuelas` 1 ➔ N `Programas`).
  - **Usuarios:** Alta de correos autorizados, roles (`admin` / `docente`), asignación de tipo (`ANTIGUO` / `NUEVO`), regional, escuela, programa y grupo de matriz.
  - **Iniciativas:** Creación de proyectos, actividades y convenios con vinculación de semanas y docentes.
  - **Tareas Semanales & Plantillas:** Mantenimiento de grupos de matriz y sus plantillas semanales, con soporte para actualización masiva sincrónica.

---

## 🏗️ Arquitectura del Sistema

El proyecto sigue una arquitectura desacoplada y robusta, unificada para el despliegue en un contenedor optimizado de producción.

### Diagrama de Arquitectura Global

```mermaid
flowchart TB
    subgraph CLIENT_TIER [" Capa de Cliente (Navegador) "]
        UI["React 18 SPA (Vite + TypeScript + Tailwind CSS)"]
        GIS["Google Identity Services (GSI SDK)"]
        UI <--> GIS
    end

    subgraph CLOUD_RUN [" Contenedor Cloud Run (Node 22 Alpine) "]
        direction TB
        STATIC["Express Static Handler (/public)"]
        API["Express REST API Engine"]
        
        subgraph MIDDLEWARES [" Middlewares de Seguridad & Control "]
            SEC["Security Headers (CSP, HSTS, X-Frame-Options)"]
            CORS["CORS Configurator"]
            AUTH["JWT Auth & Role Verifier"]
        end

        subgraph SERVICES [" Servicios del Dominio "]
            MS["Matriz Service (Cálculo & Precedencia)"]
            NS["Notification Service (Campana en App)"]
            ES["Email Service & Background Worker"]
        end

        STATIC --- UI
        API --> SEC --> CORS --> AUTH
        AUTH --> MS
        AUTH --> NS
        AUTH --> ES
    end

    subgraph DATABASE_TIER [" Capa de Persistencia (Cloud SQL / PostgreSQL 18) "]
        DB[(PostgreSQL 18)]
        TRIGGERS["Triggers PL/pgSQL (Audit & Enqueue)"]
        OUTBOX[("Bandeja notificacion_correos")]
        
        DB --> TRIGGERS
        TRIGGERS --> OUTBOX
    end

    subgraph EXTERNAL_SERVICES [" Servicios Externos Cloud "]
        G_AUTH["Google OAuth 2.0 API (Token Verification)"]
        SMTP_SERVER["Servidor SMTP (Google Workspace / Relay)"]
        GSM["Google Secret Manager"]
    end

    UI -- "1. ID Token Google" --> API
    API -- "2. Verify ID Token" --> G_AUTH
    API -- "3. Pool Queries (pg)" --> DB
    ES -- "4. Pull cola pendiente" --> OUTBOX
    ES -- "5. Enviar Correo TLS" --> SMTP_SERVER
    CLOUD_RUN -. "Inyección de Secretos" .- GSM
```

---

### Flujo de Autenticación Zero-Password

ProySocial implementa una estricta política de **cero contraseñas locales**:

```mermaid
sequenceDiagram
    autonumber
    actor Docente as 👨‍🏫 Usuario / Docente
    participant App as 💻 Frontend (React)
    participant Google as 🔑 Google OAuth 2.0
    participant API as ⚙️ Backend (Express)
    participant DB as 🗄️ PostgreSQL

    Docente->>App: Clic en "Iniciar sesión con Google"
    App->>Google: Solicita Credential / ID Token
    Google-->>App: Retorna JWT ID Token de Google
    App->>API: POST /auth/google { credential }
    API->>Google: Valida token con google-auth-library
    Google-->>API: Payload verificado (email, sub, name, picture)
    API->>DB: Busca usuario activo por LOWER(correo)
    alt Usuario No Existe o Inactivo
        DB-->>API: 0 registros encontrados
        API-->>App: 403 Prohibido ("Usuario no registrado o inactivo")
        App-->>Docente: Muestra alerta de acceso no autorizado
    else Usuario Autorizado
        API->>DB: Actualiza google_sub, foto_url y ultimo_acceso
        API->>API: Genera Session JWT interno (TTL: 8 horas)
        API-->>App: Retorna Token JWT + Perfil + Semestre Activo
        App-->>Docente: Redirige según rol (/docente o /admin)
    end
```

---

### Sistema de Notificaciones Bi-Canal (App + Correo)

Las notificaciones internas y los correos electrónicos se procesan mediante un patrón **Transactional Outbox** impulsado por triggers nativos en PostgreSQL:

```mermaid
flowchart LR
    EVENT["Docente reporta / Admin evalúa"] -->|Write| DB[(PostgreSQL)]
    DB -->|Trigger PL/pgSQL| NOTIF["Tabla: notificaciones"]
    DB -->|Trigger PL/pgSQL| OUTBOX["Tabla: notificacion_correos (pendiente)"]
    
    NOTIF -->|Fetch| UI["Campana UI (React)"]
    
    subgraph WORKER [" Background Email Worker "]
        PULL["Lote de correos (hasta 20 c/60s)"]
        SEND["Nodemailer (Transporte TLS)"]
        RETRY["Reintentos Exponenciales (máx. 5)"]
    end
    
    OUTBOX --> PULL --> SEND
    SEND -- Error --> RETRY --> OUTBOX
    SEND -- Éxito --> DONE["Estado: 'enviado'"]
```

| Evento Disparador | Destinatario | Tipo de Entrega | Mecanismo |
|---|---|---|---|
| Docente envía/reenvía entregable | Administradores activos | Inmediata | Trigger DB + Worker |
| Administrador aprueba entregable | Docente autor del reporte | Inmediata | Trigger DB + Worker |
| Administrador solicita observaciones | Docente autor del reporte | Inmediata con retroalimentación | Trigger DB + Worker |
| Mensaje administrativo directo | Docente seleccionado | Inmediata | Endpoint + Trigger |
| Resumen de entregables vencidos | Docente | Resumen diario consolidado | Script programado |
| Docentes sin actividad (>14 días) | Administradores | Resumen diario consolidado | Script programado |

---

## 🗄️ Modelo de Datos Canónico

El sistema utiliza un esquema relacional normalizado en PostgreSQL con integridad referencial estricta, restricciones `CHECK` e índices de alto desempeño.

### Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    SEMESTRES ||--o{ GRUPOS_MATRIZ : "contiene"
    GRUPOS_MATRIZ ||--o{ PLANTILLA_ENTREGABLES : "define"
    ESCUELAS ||--o{ PROGRAMAS : "agrupa"
    PROGRAMAS ||--o{ USUARIOS : "pertenece"
    GRUPOS_MATRIZ ||--o{ USUARIOS : "asigna carga"
    PROGRAMAS ||--o{ PROYECTOS : "enmarca"
    USUARIOS ||--o{ PROYECTOS : "lidera (responsable)"
    PROYECTOS ||--o{ PROYECTO_DOCENTES : "colabora"
    USUARIOS ||--o{ PROYECTO_DOCENTES : "participa"
    PROYECTOS ||--o{ PROYECTO_SEMANAS : "divide en"
    PROYECTO_SEMANAS ||--o{ PROYECTO_ENTREGABLES : "contiene"
    PLANTILLA_ENTREGABLES ||--o{ PROYECTO_ENTREGABLES : "instancia"
    USUARIOS ||--o{ PROYECTO_ENTREGABLES : "reporta (docente_id)"
    USUARIOS ||--o{ DOCENTE_ENTREGABLE_EXCEPCIONES : "personaliza"
    PLANTILLA_ENTREGABLES ||--o{ DOCENTE_ENTREGABLE_EXCEPCIONES : "sobrescribe"
    USUARIOS ||--o{ NOTIFICACIONES : "recibe"
    USUARIOS ||--o{ NOTIFICACION_CORREOS : "encola"

    SEMESTRES {
        serial id PK
        varchar codigo UK
        date fecha_inicio
        date fecha_fin
        integer numero_semanas
        boolean activo
    }

    ESCUELAS {
        serial id PK
        varchar nombre UK
        varchar codigo
    }

    PROGRAMAS {
        serial id PK
        varchar nombre UK
        varchar codigo UK
        integer escuela_id FK
    }

    USUARIOS {
        serial id PK
        varchar nombre
        varchar apellido
        varchar correo UK
        varchar google_sub UK
        varchar rol
        varchar tipo_docente
        varchar regional
        text google_drive_url
        integer programa_id FK
        integer grupo_matriz_id FK
        varchar estado
    }

    GRUPOS_MATRIZ {
        serial id PK
        integer semestre_id FK
        integer numero
        varchar nombre
        varchar tipo_docente
    }

    PLANTILLA_ENTREGABLES {
        serial id PK
        integer grupo_id FK
        integer semana_numero
        varchar mes
        text entregable
        text descripcion_evidencia
        text enlace_referencia
        numeric horas
        integer dias_desplazamiento_inicio
        integer dias_desplazamiento_fin
    }

    PROYECTOS {
        serial id PK
        varchar titulo
        varchar tipo
        varchar estado
        integer programa_id FK
        integer docente_responsable_id FK
        numeric horas_totales
        integer semanas
    }

    PROYECTO_SEMANAS {
        serial id PK
        integer proyecto_id FK
        integer numero
        date fecha_inicio
        date fecha_fin
    }

    PROYECTO_ENTREGABLES {
        serial id PK
        integer proyecto_semana_id FK
        integer plantilla_id FK
        integer docente_id FK
        boolean completado
        text url_evidencia
        varchar estado_revision
        text comentario_revision
        timestamptz fecha_cargue_evidencia
        date fecha_real_entrega
    }

    DOCENTE_ENTREGABLE_EXCEPCIONES {
        bigserial id PK
        integer docente_id FK
        integer plantilla_id FK
        text entregable_override
        text descripcion_evidencia_override
        text enlace_referencia_override
        date fecha_inicio_override
        date fecha_fin_override
        integer proyecto_id FK
        text motivo
    }
```

---

### Reglas de Precedencia y Excepciones Individuales

Para cada entregable renderizado en la matriz de un docente, el motor backend (`matrizService.js`) evalúa la siguiente cascada de precedencia:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ¿Existe DOCENTE_ENTREGABLE_EXCEPCIONES para el docente?  │
├─────────────────────────────────────────────────────────────┤
│   SI ➔ Aplica valores personalizados (texto, enlace,        │
│        fechas de override, iniciativa específica).          │
│   NO ➔ Pasa al nivel 2.                                     │
├─────────────────────────────────────────────────────────────┤
│ 2. Plantilla General del Grupo Matriz (PLANTILLA_ENTREGABLES)│
├─────────────────────────────────────────────────────────────┤
│   Aplica fechas calculadas con base en el inicio del        │
│   semestre + desplazamientos en días.                       │
├─────────────────────────────────────────────────────────────┤
│ 3. Resolución de Iniciativa Vinculada                       │
├─────────────────────────────────────────────────────────────┤
│   a) Iniciativa del reporte guardado en base de datos.      │
│   b) Iniciativa fijada en la excepción.                     │
│   c) Inferencia léxica por tipo y ordinal (ej: Proyecto 1). │
│   d) Fallback a "Gestión general del semestre".             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Modelo Matemático de Indicadores

El sistema calcula de manera determinista los índices de desempeño mostrados en las tarjetas y gráficos:

$$\text{Avance Real (\%)} = \left( \frac{\text{Entregables Completados}}{\text{Total Entregables del Semestre}} \right) \times 100$$

$$\text{Avance Esperado (\%)} = \left( \frac{\text{Entregables Exigibles con Fecha Límite} \le \text{Hoy}}{\text{Total Entregables del Semestre}} \right) \times 100$$

$$\text{Cumplimiento Esperado (\%)} = \begin{cases} 
\left( \frac{\text{Entregables Completados}}{\text{Entregables Exigibles a la Fecha}} \right) \times 100 & \text{si Exigibles} > 0 \\
100\% & \text{si Exigibles} = 0 \text{ o sin entregas requeridas}
\end{cases}$$

$$\text{Brecha de Cumplimiento} = \text{Avance Real (\%)} - \text{Avance Esperado (\%)} $$

> [!NOTE]
> - **Brecha $\ge 0$ (Verde):** El docente va al día o ha entregado entregables anticipadamente.
> - **Brecha $< 0$ (Ámbar/Rojo):** El docente presenta rezago frente al cronograma previsto.

---

## 💻 Stack Tecnológico

| Capa / Componente | Tecnología | Versión | Propósito en el Sistema |
|---|---|---|---|
| **Frontend Framework** | React | `18.3.1` | Renderizado de interfaz declarativa, componentes y estado reactivo |
| **Build Tool & Bundler** | Vite | `6.3.5` | Compilación ultra-rápida, HMR local y optimización de assets estáticos |
| **Lenguaje Frontend** | TypeScript | `5.0+` | Tipado estático, interfaces de datos y prevención de bugs |
| **Estilos & UI** | Tailwind CSS | `v4.1` | Sistema de utilidades CSS moderno y responsivo |
| **Componentes Base** | Radix UI / MUI Icons | `Latest` | Primitivas accesibles (Modales, Selects, Dropdowns, Tabs) e iconografía |
| **Animaciones** | Framer Motion / Lucide | `12.x` | Transiciones fluidas, feedback visual y suite de iconos SVG |
| **Visualización Gráfica** | Recharts | `2.15.2` | Gráficos de barras, avance acumulado y cumplimiento institucional |
| **Enrutamiento** | React Router | `7.13.0` | SPA Routing, Protected Routes y Lazy Loading modular |
| **Backend Runtime** | Node.js (ESM) | `22.x LTS` | Entorno de ejecución JavaScript del lado del servidor |
| **Backend Framework** | Express | `4.21.2` | Servidor HTTP RESTful, middlewares y servicio de estáticos unificado |
| **Base de Datos** | PostgreSQL | `18 / 16` | Motor relacional transaccional ACID, triggers PL/pgSQL |
| **Driver PostgreSQL** | `pg` (node-postgres) | `8.13.1` | Connection pooling y transacciones parametrizadas |
| **Autenticación** | `google-auth-library` | `11.0.0` | Verificación criptográfica de ID Tokens OAuth 2.0 de Google |
| **Tokens de Sesión** | `jsonwebtoken` (JWT) | `9.0.3` | Emisión y verificación de tokens stateless de 8 horas |
| **Gestor de Correos** | Nodemailer | `9.0.5` | Transporte SMTP, soporte TLS/STARTTLS y plantillas HTML |
| **Contenedores** | Docker | Multi-Stage | Empaquetado unificado de Frontend + Backend en una imagen ligera Alpine |
| **Cloud Computing** | Google Cloud Run | Serverless | Ejecución del servicio web y Jobs de migración |
| **Cloud Database** | Cloud SQL | PostgreSQL 18 | Base de datos administrada con alta disponibilidad |
| **Secretos** | Secret Manager | GCP | Almacenamiento seguro de llaves JWT, passwords de BD y SMTP |
| **CI / CD** | GitHub Actions | Workflows | Integración y despliegue continuo automático a GCP |

---

## 📁 Estructura del Proyecto

```
Proyeccion_social/
├── .github/
│   └── workflows/
│       └── deploy-cloud-run.yml        # Workflow CI/CD completo para Google Cloud Run
├── backend/
│   ├── migrations/                     # 28 migraciones SQL versionadas e idempotentes
│   │   ├── fase1_esquema_base.sql
│   │   ├── fase17_modelo_canonico.sql
│   │   ├── fase18_escuelas.sql
│   │   ├── fase19_entregables_operativos.sql
│   │   └── fase21_correos_notificaciones.sql
│   ├── scripts/                        # Scripts CLI operativos y de testing
│   │   ├── bootstrap-admin.js          # Creación idempotente del primer admin
│   │   ├── migrate.js                  # Ejecutor de migraciones SQL
│   │   ├── process-notification-emails.js # Procesador manual de cola de correos
│   │   ├── setup_database.ps1          # Script PowerShell de aprovisionamiento local
│   │   ├── test-correos.js             # Test suite de templates y triggers SMTP
│   │   └── test-entregables-operativos.js # Test de integración E2E de la matriz
│   ├── src/
│   │   ├── middleware/
│   │   │   └── auth.js                 # Verificación de JWT y roles (admin/docente)
│   │   ├── routes/
│   │   │   ├── admin.js                # Rutas administrativas, revisión y catálogos
│   │   │   ├── auth.js                 # Autenticación con Google y /auth/me
│   │   │   ├── catalogo.js             # Catálogo jerárquico de escuelas/programas
│   │   │   └── docente.js              # Rutas de matriz, reportes y proyectos docente
│   │   ├── services/
│   │   │   ├── emailService.js         # Transporter SMTP y worker de cola
│   │   │   ├── matrizService.js        # Motor de precedencia y cálculo matemático
│   │   │   └── notificationService.js  # Servicio de notificaciones internas
│   │   ├── db.js                       # Configuración del pool de PostgreSQL
│   │   └── index.js                    # Punto de entrada Express y servidor estático
│   ├── package.json
│   └── .env.example
├── docs/
│   ├── AJUSTES_REUNION_2026-07-29.md   # Especificación de reglas operativas
│   ├── CORREOS_NOTIFICACIONES.md       # Guía detallada del subsistema de email
│   └── PRODUCCION.md                   # Protocolo y checklist estricto de producción
├── src/                                # Frontend en React 18 + Vite
│   ├── app/
│   │   ├── components/                 # Componentes reutilizables y layouts
│   │   │   ├── AdminLayout.tsx         # Layout del panel de administración
│   │   │   ├── TeacherLayout.tsx       # Layout del panel docente
│   │   │   ├── NotificationPanel.tsx   # Panel interactivo de notificaciones
│   │   │   ├── ProtectedRoute.tsx      # Guardián de rutas por rol
│   │   │   └── ui/                     # Primitivas UI estilizadas con Tailwind
│   │   ├── pages/                      # Vistas y páginas de la aplicación
│   │   │   ├── Login.tsx               # Login institucional con Google OAuth
│   │   │   ├── TeacherDashboard.tsx    # Dashboard principal del docente
│   │   │   ├── MatrizSeguimiento.tsx   # Matriz de seguimiento semanal
│   │   │   ├── AdminDashboard.tsx      # Dashboard general administrativo
│   │   │   ├── ReportReview.tsx        # Bandeja de revisión de entregables
│   │   │   ├── AvanceConsolidado.tsx   # Consolidado de métricas institucional
│   │   │   ├── AdminMatrizDocente.tsx  # Gestor de excepciones por docente
│   │   │   └── SystemAdmin/            # Módulos de administración de catálogos
│   │   │       ├── SemesterManagement.tsx
│   │   │       ├── ProgramManagement.tsx
│   │   │       ├── UserManagement.tsx
│   │   │       ├── ProjectManagement.tsx
│   │   │       ├── GroupManagement.tsx
│   │   │       └── PlantillaManagement.tsx
│   │   ├── routes.tsx                  # Definición de rutas con React Router
│   │   └── App.tsx
│   ├── main.tsx
│   └── styles/
├── Dockerfile                          # Multi-stage Dockerfile para Cloud Run
├── package.json
├── vite.config.ts
└── README.md
```

---

## 🔐 Variables de Entorno

### Configuración del Frontend (`.env`)

| Variable | Descripción | Ejemplo / Default |
|---|---|---|
| `VITE_API_URL` | URL base de la API Express (vacío en producción para usar la misma raíz) | `http://localhost:4000` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID de la Aplicación Web en Google Cloud Console | `12345-abc.apps.googleusercontent.com` |

### Configuración del Backend (`backend/.env`)

| Variable | Requerida | Descripción | Ejemplo / Default |
|---|:---:|---|---|
| `PORT` | No | Puerto HTTP en el que escucha Express | `4000` (Local) / `8080` (GCP) |
| `GOOGLE_CLIENT_ID` | **Sí** | Mismo Client ID de Google OAuth 2.0 que el frontend | `12345-abc.apps.googleusercontent.com` |
| `ALLOWED_GOOGLE_DOMAINS`| No | Restricción opcional a dominios institucionales Google Workspace | `cun.edu.co` |
| `JWT_SECRET` | **Sí** | Secreto criptográfico para firmar los tokens de sesión (mín. 32 chars) | `openssl rand -base64 48` |
| `SESSION_TTL` | No | Tiempo de validez del token de sesión | `8h` |
| `DATABASE_URL` | No | URL de conexión completa a PostgreSQL | `postgresql://user:pass@localhost:5432/proysocial` |
| `PGHOST` | No | Host del servidor PostgreSQL | `localhost` |
| `PGPORT` | No | Puerto del servidor PostgreSQL | `5432` |
| `PGDATABASE` | No | Nombre de la base de datos | `proyeccion-social` |
| `PGUSER` | No | Usuario de la base de datos | `postgres` |
| `PGPASSWORD` | No | Contraseña del usuario de base de datos | `tu_password_local` |
| `INSTANCE_CONNECTION_NAME`| Prod | Nombre de conexión de Cloud SQL (habilita socket Unix) | `proyecto:region:instancia` |
| `ALLOWED_ORIGIN` | No | Orígenes CORS permitidos (separados por coma si hay varios) | `http://localhost:5173` |
| `SMTP_HOST` | No | Host del servidor SMTP para el envío de correos | `smtp.gmail.com` |
| `SMTP_PORT` | No | Puerto del servidor SMTP | `587` |
| `SMTP_SECURE` | No | `false` para STARTTLS en puerto 587; `true` para TLS en 465 | `false` |
| `SMTP_USER` | No | Cuenta de correo remitente autenticada | `notificaciones@tudominio.edu` |
| `SMTP_PASS` | No | Contraseña SMTP o App Password de Google Workspace | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | No | Cabecera visual del remitente | `ProySocial <notificaciones@tudominio.edu>` |

---

## 🛠️ Guía de Instalación y Ejecución Local

Sigue estos pasos detallados para configurar y levantar el proyecto en tu entorno de desarrollo local.

### 1. Clonar el Repositorio e Instalar Dependencias

```bash
# Clonar el proyecto
git clone https://github.com/haiderbellocun/Proyeccion_social.git
cd Proyeccion_social

# Instalar dependencias del frontend
npm ci

# Instalar dependencias del backend
cd backend
npm ci
cd ..
```

### 2. Configurar Archivos de Entorno

```bash
# Copiar plantillas de variables
cp .env.example .env
cp backend/.env.example backend/.env
```

Edita `.env` y `backend/.env` con tus credenciales locales.

### 3. Configurar Google Cloud OAuth 2.0
1. Ingresa a la [Consola de Google Cloud](https://console.cloud.google.com/).
2. Crea un proyecto o selecciona uno existente.
3. Ve a **APIs & Services ➔ Credentials**.
4. Crea un **OAuth Client ID** de tipo **Web Application**.
5. En **Authorized JavaScript origins** agrega:
   - `http://localhost:5173`
   - `http://localhost:4000`
6. Copia el **Client ID** generado y pégalo en `VITE_GOOGLE_CLIENT_ID` (`.env`) y `GOOGLE_CLIENT_ID` (`backend/.env`).

### 4. Inicializar la Base de Datos PostgreSQL

Asegúrate de que el servicio de PostgreSQL esté iniciado localmente. Puedes ejecutar el script automatizado en PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\setup_database.ps1
```

O ejecutar las migraciones directamente con Node.js:

```bash
cd backend
npm run migrate
cd ..
```

### 5. Registrar el Primer Administrador (Bootstrap)

Registra el correo real de Google que utilizarás para administrar la plataforma:

```bash
cd backend
npm run bootstrap-admin -- --email tu_correo@institucion.edu --nombre Nombre --apellido Apellido
cd ..
```

### 6. Ejecutar en Modo Desarrollo

Abre dos terminales:

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
# Servidor escuchando en http://localhost:4000
```

**Terminal 2 — Frontend:**
```bash
npm run dev
# Aplicación lista en http://localhost:5173
```

Abre `http://localhost:5173` en tu navegador e inicia sesión con el correo registrado en el paso 5.

---

## ☁️ Despliegue en Producción (Google Cloud Platform)

### Arquitectura Single-Container (Docker)

El proyecto utiliza un enfoque de **Contenedor Unificado (Single Container)** mediante un `Dockerfile` multi-stage:
1. **Etapa 1 (`frontend-build`):** Compila el código React/TypeScript optimizado en `/dist`.
2. **Etapa 2 (`backend-dependencies`):** Instala exclusivamente las dependencias de producción de Node.js.
3. **Etapa 3 (`runtime`):** El servidor Express sirve tanto los endpoints de la API (`/auth`, `/docente`, `/admin`, `/health`) como los archivos estáticos compilados de la SPA en `/public`.

**Beneficios:**
- Cero problemas de CORS en producción (mismo dominio y puerto).
- Un único servicio Cloud Run y una sola factura de cómputo.
- Menor latencia de red y configuración simplificada.

---

### Infraestructura en GCP

Configuración paso a paso en **Google Cloud Shell**:

```bash
# 1. Variables de entorno
export PROJECT_ID="tu-proyecto-gcp"
export REGION="us-central1"
export SERVICE="proysocial"
export REPOSITORY="proysocial"
export SQL_INSTANCE="proysocial-pg"
export DB_NAME="proyeccion-social"
export DB_USER="proysocial"
export SA_NAME="proysocial-deployer"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}"

# 2. Habilitar APIs necesarias
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com

# 3. Crear repositorio en Artifact Registry
gcloud artifacts repositories create "${REPOSITORY}" \
  --repository-format=docker \
  --location="${REGION}"

# 4. Crear instancia Cloud SQL (PostgreSQL 18 Enterprise)
export DB_PASSWORD="DEFINE_AQUI_UNA_PASSWORD_MUY_SEGURA"

gcloud sql instances create "${SQL_INSTANCE}" \
  --database-version=POSTGRES_18 \
  --edition=enterprise \
  --region="${REGION}" \
  --cpu=1 \
  --memory=3840MiB

gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}"
gcloud sql users create "${DB_USER}" \
  --instance="${SQL_INSTANCE}" \
  --password="${DB_PASSWORD}"

# 5. Crear Secretos en Secret Manager
printf '%s' "${DB_PASSWORD}" | gcloud secrets create proysocial-db-password --data-file=-
openssl rand -base64 48 | gcloud secrets create proysocial-jwt-secret --data-file=-

# 6. Crear Cuenta de Servicio Unificada y Asignar Roles
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="ProySocial Single Deployer and Runtime SA"

for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/cloudsql.client \
  roles/serviceusage.serviceUsageConsumer \
  roles/secretmanager.secretAccessor
do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}"
done

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# 7. Generar clave JSON para GitHub Actions
gcloud iam service-accounts keys create proysocial-sa-key.json \
  --iam-account="${SA_EMAIL}"
```

> [!IMPORTANT]
> Copia el contenido de `proysocial-sa-key.json` en el secreto de GitHub `GCP_SA_KEY` y luego elimina el archivo local por seguridad.

---

### Pipeline Automatizado CI/CD

El workflow [`.github/workflows/deploy-cloud-run.yml`](.github/workflows/deploy-cloud-run.yml) se ejecuta automáticamente en cada `push` a la rama `main`:

```mermaid
flowchart TD
    PUSH[Push a rama 'main'] --> CHECKOUT[1. Checkout de Código]
    CHECKOUT --> AUTH_GCP[2. Autenticación con Service Account en GCP]
    AUTH_GCP --> DOCKER_BUILD[3. Build de Imagen Docker Multi-Stage con BuildArgs]
    DOCKER_BUILD --> DOCKER_PUSH[4. Push a Artifact Registry]
    DOCKER_PUSH --> CR_JOB_MIGRATE[5. Ejecución de Cloud Run Job: Migraciones SQL]
    CR_JOB_MIGRATE --> CR_JOB_ADMIN[6. Ejecución de Cloud Run Job: Bootstrap Admin]
    CR_JOB_ADMIN --> CR_DEPLOY[7. Despliegue de Servicio Cloud Run]
    CR_DEPLOY --> EMAIL_CONFIG[8. Inyección de Configuración SMTP & App URL]
    EMAIL_CONFIG --> SMOKE_TEST[9. Verificación de Salud con GET /health]
```

---

## 📋 Protocolo de Carga de Datos en Producción

Para garantizar la integridad institucional, sigue este orden estricto de aprovisionamiento una vez desplegado el sistema:

```
  PASO 1 ➔ Activar Semestre Académico (ej. 2026A) en 'Semestres'.
  PASO 2 ➔ Crear Escuelas / Facultades y vincular sus Programas Académicos.
  PASO 3 ➔ Configurar o clonar Grupos de Matriz (1 a 15) y Plantillas de Entregables.
  PASO 4 ➔ Crear / Importar Usuarios Docentes (Correo institucional, Programa, Tipo y Grupo).
  PASO 5 ➔ Crear las Iniciativas (Proyectos/Actividades/Convenios) y asignar docentes.
  PASO 6 ➔ Ejecutar prueba E2E: El docente reporta su primer entregable y el admin lo evalúa.
```

> [!WARNING]
> **Prohibido cargar datos ficticios o "mocks" en producción.** Las tablas maestras deben contener exclusivamente información operativa real.

Consulta la guía completa de producción en [`docs/PRODUCCION.md`](docs/PRODUCCION.md).

---

## 🔧 Comandos de Mantenimiento y Testing

El backend incluye una completa suite de comandos CLI para administración y pruebas automatizadas:

```bash
# Compilar frontend para producción
npm run build

# Ejecutar migraciones pendientes en la base de datos
cd backend && npm run migrate

# Registrar o reactivar un usuario administrador
cd backend && npm run bootstrap-admin -- --email usuario@dominio.edu --nombre Nombre --apellido Apellido

# Prueba de integración E2E de la matriz (crea datos temporales y los limpia)
cd backend && npm run test:entregables

# Prueba integral de cola, plantillas y disparadores de correo electrónico
cd backend && npm run test:correos

# Prueba de notificaciones internas interactivas
cd backend && npm run test:notificaciones

# Procesar manualmente la bandeja de salida de correos encolados
cd backend && npm run emails:process
```

---

## 📡 Referencia de la API REST

### Endpoints Públicos y de Diagnóstico

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| `GET` | `/health` | No | Comprobación de estado de BD y configuración de correo |
| `GET` | `/api` | No | Metadatos y directorio de endpoints disponibles |

### Autenticación (`/auth`)

| Método | Ruta | Auth | Descripción |
|---|---|:---:|---|
| `POST` | `/auth/google` | No | Inicio de sesión mediante Google ID Token; retorna JWT |
| `GET` | `/auth/me` | JWT | Retorna el usuario activo, rol, permisos y semestre actual |

### Módulo del Docente (`/docente`) — Rol: `docente` | `admin`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/docente/:id/dashboard` | Resumen de indicadores, entregables y proyectos del docente |
| `GET` | `/docente/:id/matriz` | Matriz semanal completa con cálculo de precedencia y fechas |
| `GET` | `/docente/:id/proyectos` | Listado de iniciativas asignadas (responsable o colaborador) |
| `GET` | `/docente/:id/proyectos/:proyectoId` | Detalle de iniciativa, cronograma de semanas y entregables |
| `POST` | `/docente/entregables/:entregableId/reportar` | Enviar o actualizar reporte de entregable con URL de evidencia |
| `GET` | `/docente/:id/historial` | Historial de entregables reportados con estados de revisión |
| `GET` | `/docente/:id/evidencias` | Repositorio consolidado de evidencias y enlaces cargados |
| `GET` | `/docente/notificaciones` | Listado de notificaciones interactivas de la campana |
| `PUT` | `/docente/notificaciones/:id/leida` | Marcar notificación específica como leída |
| `PUT` | `/docente/notificaciones/leer-todas` | Marcar todas las notificaciones como leídas |

### Módulo Administrativo (`/admin`) — Rol: `admin`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/dashboard` | KPIs institucionales globales y métricas consolidadas |
| `GET` | `/admin/revision` | Bandeja de entregables pendientes de revisión |
| `POST` | `/admin/revision/:entregableId` | Aprobar u observar un entregable con feedback al docente |
| `GET` | `/admin/avance-consolidado` | Matriz de cumplimiento comparativo por docente y programa |
| `GET` | `/admin/catalogos` | Catálogo jerárquico vivo de escuelas, programas y docentes |
| `GET` | `/admin/docentes/:docenteId/matriz` | Matriz individual del docente para configuración de excepciones |
| `POST` | `/admin/docentes/:docenteId/excepciones` | Crear o actualizar una excepción individual en la matriz |
| `DELETE` | `/admin/docentes/:docenteId/excepciones/:plantillaId` | Restablecer entregable a la plantilla base original |
| `POST` | `/admin/plantillas/actualizacion-masiva` | Actualizar masivamente instrucciones y enlaces en el semestre |
| `GET` | `/admin/correos/estado` | Consultar estado de la cola SMTP de salida |
| `POST` | `/admin/correos/procesar` | Forzar procesamiento inmediato de correos pendientes |
| `CRUD` | `/admin/semestres` | Gestión completa de periodos académicos |
| `CRUD` | `/admin/escuelas` | Gestión completa de escuelas y facultades |
| `CRUD` | `/admin/programas` | Gestión completa de programas académicos |
| `CRUD` | `/admin/usuarios` | Gestión de usuarios, roles, asignaciones y estado |
| `CRUD` | `/admin/proyectos` | Gestión de proyectos, actividades, convenios y horas |
| `CRUD` | `/admin/grupos-matriz` | Gestión de grupos de matriz y clonación semestral |
| `CRUD` | `/admin/plantillas` | Gestión de entregables semanales por grupo |

---

## 📚 Documentación Adicional

- 🚀 [**Guía de Carga y Datos en Producción (`docs/PRODUCCION.md`)**](docs/PRODUCCION.md): Checklist riguroso de despliegue, datos maestros obligatorios y mejores prácticas.
- 📧 [**Sistema de Correos y Notificaciones (`docs/CORREOS_NOTIFICACIONES.md`)**](docs/CORREOS_NOTIFICACIONES.md): Configuración de transporte SMTP, variables en Google Secret Manager y ciclo de vida de la cola.
- 📝 [**Especificación de Ajustes Operativos (`docs/AJUSTES_REUNION_2026-07-29.md`)**](docs/AJUSTES_REUNION_2026-07-29.md): Formalización de reglas de negocio, cálculo de brechas, excepciones por docente y marcas de tiempo inmutables.

---

<div align="center">

**ProySocial** • Sistema Institucional de Proyección Social  
Desarrollado con altos estándares de ingeniería de software, seguridad y experiencia de usuario.

</div>
