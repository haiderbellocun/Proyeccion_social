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
app.use("/docente", requireAuth, requireRole("docente", "admin"), docenteRouter);
app.use("/admin", requireAuth, requireRole("admin"), adminRouter);
app.use("/admin", requireAuth, requireRole("admin"), catalogoRouter);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR || path.resolve(currentDir, "../public");
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
