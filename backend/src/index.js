import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, testConnection } from "./db.js";
import authRouter from "./routes/auth.js";
import docenteRouter from "./routes/docente.js";
import adminRouter from "./routes/admin.js";
import catalogoRouter from "./routes/catalogo.js";
import importacionesRouter from "./routes/importaciones.js";
import devAuthRouter from "./routes/devAuth.js";
import demoAuthRouter from "./routes/demoAuth.js";
import { devLoginStatus } from "./config/devLogin.js";
import { demoAbierto, demoPublico, demoStatus } from "./config/demo.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import {
  emailConfiguration,
  requestEmailProcessing,
  startEmailWorker,
  stopEmailWorker,
} from "./services/emailService.js";

const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT || 4000);
const allowedOrigins = String(process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin:
      allowedOrigins.length === 0
        ? false
        : (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            return callback(null, false);
          },
    credentials: true,
  })
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
// Importación de Excel: el archivo viaja en base64 (hasta ~12 MB). Se autentica ANTES de leer el cuerpo
// grande y solo para administradores; el resto de la API mantiene el límite de 1 MB.
app.use("/admin/importaciones", requireAuth, requireRole("admin"), express.json({ limit: "18mb" }), importacionesRouter);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.once("finish", requestEmailProcessing);
  }
  next();
});

app.get("/api", (_req, res) => {
  res.json({
    name: "ProySocial API",
    message: "Backend de Proyección Social. Usa /health para verificar la conexión a la base de datos.",
    endpoints: {
      "GET /health": "Estado de conexión a la BD",
      "POST /auth/google": "Inicio de sesión con credencial de Google",
      "GET /auth/me": "Usuario y semestre de la sesión activa",
      "GET /docente/:id/dashboard": "Dashboard del docente",
      "GET /admin/dashboard": "Dashboard del administrador",
    },
  });
});

app.get("/health", async (_req, res) => {
  try {
    await testConnection();
    const email = emailConfiguration();
    res.json({
      ok: true,
      email: {
        enabled: email.enabled,
        configured: email.configured,
      },
    });
  } catch (error) {
    console.error("DB health error", error);
    res.status(500).json({
      ok: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Base de datos no disponible"
          : error.message,
      hint: "Revisa que Postgres esté encendido, el puerto en .env (ej. 5432 o 5433) y usuario/contraseña.",
    });
  }
});

app.use("/auth", authRouter);
// Acceso de desarrollo: solo si TODAS las condiciones locales se cumplen (ver config/devLogin.js).
if (devLoginStatus().enabled) {
  app.use("/auth/dev", devAuthRouter);
  console.warn("⚠ ACCESO DE DESARROLLO ACTIVO (base proysocial_dev, solo localhost). No usar en producción.");
}
// Modo demostración del piloto (solo lectura, usuarios sintéticos): requiere DEMO_ENABLED=true y la base proysocial_piloto (ver config/demo.js).
const demo = demoStatus();
if (demo.enabled) {
  app.use("/auth/demo", demoAuthRouter);
  console.warn(demoAbierto() ? "Modo demostración ABIERTO (sin clave, con escritura, usuarios sintéticos)." : demoPublico() ? "Modo demostración PÚBLICO (sin clave, SOLO LECTURA, usuarios sintéticos)." : "Modo demostración ACTIVO (solo lectura, con clave, usuarios sintéticos).");
} else if (String(process.env.DEMO_ENABLED || "").toLowerCase() === "true") {
  console.error("DEMO_ENABLED=true pero el modo demostración NO se activó:", demo.razones.join("; "));
}
// Las rutas de la SPA (/docente/..., /admin/...) comparten prefijo con la API. Una NAVEGACIÓN del navegador (Accept: text/html: recargar la
// página, abrir un enlace de notificación o un marcador) debe recibir la aplicación y no el 401 JSON de la API. Las llamadas fetch de la SPA
// no piden text/html, así que siguen llegando a la API. Solo aplica cuando este servidor también sirve el frontend (despliegue de un contenedor).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR || path.resolve(currentDir, "../public");
if (existsSync(staticDir)) {
  app.get(["/docente", "/docente/*", "/admin", "/admin/*"], (req, res, next) => {
    if (!String(req.get("accept") || "").includes("text/html")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}
app.use("/docente", requireAuth, requireRole("docente", "admin"), docenteRouter);
app.use("/admin", requireAuth, requireRole("admin"), adminRouter);
app.use("/admin", requireAuth, requireRole("admin"), catalogoRouter);

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    const accept = String(req.get("accept") || "");
    if (!accept.includes("text/html")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error, _req, res, _next) => {
  console.error("Error no controlado", error);
  res.status(500).json({ error: "Error interno" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`ProySocial escuchando en el puerto ${port}`);
  startEmailWorker();
});

async function shutdown(signal) {
  console.log(`${signal}: cerrando servidor`);
  server.close(async () => {
    await stopEmailWorker();
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
