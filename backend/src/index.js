import express from "express";
import cors from "cors";
import { testConnection } from "./db.js";
import authRouter from "./routes/auth.js";
import docenteRouter from "./routes/docente.js";
import adminRouter from "./routes/admin.js";
import catalogoRouter from "./routes/catalogo.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "ProySocial API",
    message: "Backend de Proyección Social. Usa /health para verificar la conexión a la base de datos.",
    endpoints: {
      "GET /health": "Estado de conexión a la BD",
      "POST /auth/login": "Login (body: { email, password })",
      "GET /docente/:id/dashboard": "Dashboard del docente",
      "GET /admin/dashboard": "Dashboard del administrador",
    },
  });
});

app.get("/health", async (_req, res) => {
  try {
    await testConnection();
    res.json({ ok: true });
  } catch (error) {
    console.error("DB health error", error);
    res.status(500).json({
      ok: false,
      error: error.message,
      hint: "Revisa que Postgres esté encendido, el puerto en .env (ej. 5432 o 5433) y usuario/contraseña.",
    });
  }
});

app.use("/auth", authRouter);
app.use("/docente", docenteRouter);
app.use("/admin", adminRouter);
app.use("/admin", catalogoRouter);

app.listen(port, () => {
  console.log(`ProySocial backend escuchando en http://localhost:${port}`);
});
