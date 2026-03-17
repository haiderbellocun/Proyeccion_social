import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool, testConnection } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: "*", credentials: false }));
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

// Auth simple de pruebas
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email y password son requeridos" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, nombre, apellido, correo, rol
      FROM usuarios
      WHERE correo = $1 AND password_hash = $2
      `,
      [email, password]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = result.rows[0];

    res.json({
      user,
    });
  } catch (error) {
    console.error("Error en /auth/login", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Proyectos visibles para un docente: responsable o asignado en proyecto_docentes
// (usado en dashboard y cronograma)

// Datos básicos para dashboard docente (proyectos asignados o como responsable)
app.get("/docente/:id/dashboard", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const proyectos = await pool.query(
      `
      SELECT
        p.id,
        p.titulo,
        p.descripcion,
        p.tipo,
        p.estado,
        p.fecha_inicio,
        p.fecha_fin_estimada,
        p.horas_totales,
        p.semanas,
        prog.nombre AS programa_nombre,
        u.nombre || ' ' || u.apellido AS coordinador
      FROM proyectos p
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      ORDER BY p.fecha_inicio
      `,
      [docenteId, docenteId]
    );

    res.json({
      proyectos: proyectos.rows,
    });
  } catch (error) {
    console.error("Error en /docente/:id/dashboard", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Estadísticas y datos para el dashboard del docente (avance por mes, próximas entregas, actividades)
app.get("/docente/:id/dashboard-stats", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const entregablesRows = await pool.query(
      `
      SELECT
        e.id,
        e.descripcion,
        COALESCE(e.completado, false) AS completado,
        e.fecha_completado,
        s.fecha_fin   AS semana_fecha_fin,
        s.numero      AS semana_numero,
        p.titulo      AS proyecto_titulo,
        p.id         AS proyecto_id
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON e.proyecto_semana_id = s.id
      JOIN proyectos p ON s.proyecto_id = p.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      ORDER BY s.fecha_fin, e.id
      `,
      [docenteId, docenteId]
    );

    const items = entregablesRows.rows || [];
    const total = items.length;
    const completed = items.filter((i) => i.completado).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const monthNames = { 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo" };
    const byMonth = [];
    for (const [num, name] of Object.entries(monthNames)) {
      const mesNum = Number(num);
      const delMes = items.filter((i) => {
        const d = i.semana_fecha_fin ? new Date(i.semana_fecha_fin) : null;
        return d && d.getMonth() + 1 === mesNum;
      });
      const done = delMes.filter((i) => i.completado).length;
      byMonth.push({
        month: name,
        total: delMes.length,
        done,
        pct: delMes.length > 0 ? Math.round((done / delMes.length) * 100) : 0,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = items
      .filter((i) => !i.completado && i.semana_fecha_fin)
      .slice(0, 8)
      .map((i) => ({
        id: i.id,
        proyecto: i.proyecto_titulo,
        entregable: i.descripcion,
        fechaFin: i.semana_fecha_fin,
        semana: i.semana_numero,
      }));

    const activities = items.map((i) => {
      const fin = i.semana_fecha_fin ? new Date(i.semana_fecha_fin) : null;
      let status = "pending";
      if (i.completado) status = "approved";
      else if (fin && fin < today) status = "delayed";
      return {
        id: i.id,
        project: i.proyecto_titulo,
        activity: i.descripcion,
        deadline: fin ? fin.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—",
        status,
      };
    });

    res.json({
      stats: { total, completed, pct },
      byMonth,
      upcoming,
      activities,
    });
  } catch (error) {
    console.error("Error en /docente/:id/dashboard-stats", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Cronograma (semanas + entregables) de proyectos de un docente
app.get("/docente/:id/cronograma", async (req, res) => {
  const docenteId = Number(req.params.id);
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        p.id                              AS proyecto_id,
        p.titulo                          AS proyecto_titulo,
        s.id                              AS semana_id,
        s.numero                          AS semana_numero,
        s.fecha_inicio                    AS semana_fecha_inicio,
        s.fecha_fin                       AS semana_fecha_fin,
        COALESCE(
          ARRAY_AGG(e.descripcion ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),
          '{}'::text[]
        )                                 AS entregables
      FROM proyectos p
      JOIN proyecto_semanas s
        ON s.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e
        ON e.proyecto_semana_id = s.id
      WHERE p.docente_responsable_id = $1
         OR p.id IN (SELECT proyecto_id FROM proyecto_docentes WHERE docente_id = $1)
      GROUP BY
        p.id,
        p.titulo,
        s.id,
        s.numero,
        s.fecha_inicio,
        s.fecha_fin
      ORDER BY p.titulo, s.numero
      `,
      [docenteId, docenteId]
    );

    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.proyecto_id)) {
        map.set(row.proyecto_id, {
          id: row.proyecto_id,
          name: row.proyecto_titulo,
          weeks: [],
        });
      }
      const proj = map.get(row.proyecto_id);
      proj.weeks.push({
        id: row.semana_id,
        numero: row.semana_numero,
        fechaInicio: row.semana_fecha_inicio,
        fechaFin: row.semana_fecha_fin,
        entregables: row.entregables || [],
      });
    }

    res.json({ proyectos: Array.from(map.values()) });
  } catch (error) {
    console.error("Error en /docente/:id/cronograma", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Datos básicos para dashboard admin
app.get("/admin/dashboard", async (_req, res) => {
  try {
    const docentes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM usuarios WHERE rol = 'docente'`
    );

    const proyectos = await pool.query(
      `SELECT COUNT(*)::int AS total FROM proyectos WHERE estado = 'en_ejecucion'`
    );

    const reportes = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE estado_revision = 'enviado')::int AS enviados,
        COUNT(*) FILTER (WHERE estado_revision = 'aprobado')::int AS aprobados,
        COUNT(*) FILTER (WHERE estado_revision = 'observado')::int AS observados
      FROM reportes_avance
      `
    );

    res.json({
      docentes: docentes.rows[0].total,
      proyectos_activos: proyectos.rows[0].total,
      reportes: reportes.rows[0],
    });
  } catch (error) {
    console.error("Error en /admin/dashboard", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Catálogos para filtros admin (escuelas, programas, docentes)
app.get("/admin/catalogos", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id              AS programa_id,
        p.nombre          AS programa_nombre,
        p.codigo          AS programa_codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        u.id              AS docente_id,
        u.nombre          AS docente_nombre,
        u.apellido        AS docente_apellido,
        u.correo          AS docente_correo,
        u.estado          AS docente_estado
      FROM programas p
      LEFT JOIN usuarios u
        ON u.programa_id = p.id
       AND u.rol = 'docente'
      ORDER BY escuela_nombre, programa_nombre, docente_apellido, docente_nombre
      `
    );

    const schoolsMap = new Map();

    for (const row of result.rows) {
      const schoolName = row.escuela_nombre;
      if (!schoolsMap.has(schoolName)) {
        schoolsMap.set(schoolName, {
          name: schoolName,
          programs: [],
        });
      }
      const school = schoolsMap.get(schoolName);

      let program = school.programs.find((p) => p.id === row.programa_id);
      if (!program) {
        program = {
          id: row.programa_id,
          name: row.programa_nombre,
          code: row.programa_codigo,
          teachers: [],
        };
        school.programs.push(program);
      }

      if (row.docente_id) {
        program.teachers.push({
          id: row.docente_id,
          name: row.docente_nombre,
          lastName: row.docente_apellido,
          fullName: `${row.docente_nombre} ${row.docente_apellido}`,
          email: row.docente_correo,
          status: row.docente_estado,
        });
      }
    }

    res.json({
      schools: Array.from(schoolsMap.values()),
    });
  } catch (error) {
    console.error("Error en /admin/catalogos", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de docentes con programa y escuela (para administración de usuarios)
app.get("/admin/docentes", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.estado,
        p.nombre   AS programa_nombre,
        p.codigo   AS programa_codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre
      FROM usuarios u
      LEFT JOIN programas p
        ON p.id = u.programa_id
      WHERE u.rol = 'docente'
      ORDER BY escuela_nombre, programa_nombre, u.apellido, u.nombre
      `
    );

    const docentes = result.rows.map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      role: "Docente",
      program: row.programa_nombre || "Sin programa",
      school: row.escuela_nombre,
      status: row.estado === "activo" ? "active" : "delayed",
    }));

    res.json({ docentes });
  } catch (error) {
    console.error("Error en /admin/docentes", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Crear usuario (docente o administrador) con contraseña genérica de pruebas
app.post("/admin/usuarios", async (req, res) => {
  const { nombres, apellidos, correo, rol, programaNombre } = req.body || {};

  if (!nombres || !apellidos || !correo || !rol) {
    return res
      .status(400)
      .json({ error: "nombres, apellidos, correo y rol son obligatorios" });
  }

  try {
    let programaId = null;
    if (programaNombre) {
      const programa = await pool.query(
        "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
        [programaNombre]
      );
      if (programa.rowCount > 0) {
        programaId = programa.rows[0].id;
      }
    }

    const result = await pool.query(
      `
      INSERT INTO usuarios (nombre, apellido, correo, password_hash, rol, programa_id, estado)
      VALUES ($1, $2, $3, $4, $5, $6, 'activo')
      RETURNING id, nombre, apellido, correo, rol, estado, programa_id
      `,
      [
        nombres,
        apellidos,
        correo,
        "cun123", // contraseña genérica de pruebas
        rol === "admin" ? "admin" : "docente",
        programaId,
      ]
    );

    const created = result.rows[0];

    let programaNombreCreado = null;
    let escuelaNombreCreada = null;
    if (created.programa_id) {
      const programa = await pool.query(
        "SELECT nombre, facultad FROM programas WHERE id = $1",
        [created.programa_id]
      );
      if (programa.rowCount > 0) {
        programaNombreCreado = programa.rows[0].nombre;
        escuelaNombreCreada = programa.rows[0].facultad || "Sin escuela";
      }
    }

    res.status(201).json({
      id: created.id,
      name: `${created.nombre} ${created.apellido}`,
      email: created.correo,
      role: created.rol === "admin" ? "Administrador" : "Docente",
      program: programaNombreCreado || "Sin programa",
      school: escuelaNombreCreada || "Sin escuela",
      status: created.estado === "activo" ? "active" : "delayed",
      passwordTemporal: "cun123",
    });
  } catch (error) {
    console.error("Error en /admin/usuarios", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de proyectos para administración
app.get("/admin/proyectos", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.titulo,
        p.descripcion,
        p.tipo,
        p.estado,
        p.fecha_inicio,
        p.fecha_fin_estimada,
        p.horas_totales,
        p.semanas,
        u.id AS coordinador_id,
        u.nombre || ' ' || u.apellido AS coordinador,
        prog.nombre AS programa
      FROM proyectos p
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      ORDER BY p.fecha_inicio DESC, p.id DESC
      `
    );

    const proyectos = result.rows.map((row) => ({
      id: row.id,
      name: row.titulo,
      description: row.descripcion,
      coordinatorId: row.coordinador_id,
      coordinator: row.coordinador || "Sin asignar",
      program: row.programa || "Sin programa",
      // tipos visuales para el Badge
      type:
        row.tipo === "convenio"
          ? "agreement"
          : row.tipo === "proyecto"
          ? "project"
          : "activity",
      status: row.estado === "en_ejecucion" ? "active" : "delayed",
      startDate: row.fecha_inicio,
      endDate: row.fecha_fin_estimada,
      totalHours: row.horas_totales,
      weeks: row.semanas,
    }));

    res.json({ proyectos });
  } catch (error) {
    console.error("Error en /admin/proyectos (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Proyectos con sus semanas y entregables (para tareas semanales / cronogramas)
app.get("/admin/proyectos-semanas", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id                              AS proyecto_id,
        p.titulo                          AS proyecto_titulo,
        s.id                              AS semana_id,
        s.numero                          AS semana_numero,
        s.fecha_inicio                    AS semana_fecha_inicio,
        s.fecha_fin                       AS semana_fecha_fin,
        COALESCE(
          json_agg(
            json_build_object(
              'texto', e.descripcion,
              'horas', e.horas
            )
            ORDER BY e.id
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        )                                 AS entregables
      FROM proyectos p
      JOIN proyecto_semanas s
        ON s.proyecto_id = p.id
      LEFT JOIN proyecto_entregables e
        ON e.proyecto_semana_id = s.id
      GROUP BY
        p.id,
        p.titulo,
        s.id,
        s.numero,
        s.fecha_inicio,
        s.fecha_fin
      ORDER BY p.titulo, s.numero
      `
    );

    const map = new Map();
    for (const row of result.rows) {
      if (!map.has(row.proyecto_id)) {
        map.set(row.proyecto_id, {
          id: row.proyecto_id,
          name: row.proyecto_titulo,
          weeks: [],
        });
      }
      const proj = map.get(row.proyecto_id);
      proj.weeks.push({
        id: row.semana_id,
        numero: row.semana_numero,
        fechaInicio: row.semana_fecha_inicio,
        fechaFin: row.semana_fecha_fin,
        entregables: row.entregables || [],
      });
    }

    res.json({ proyectos: Array.from(map.values()) });
  } catch (error) {
    console.error("Error en /admin/proyectos-semanas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Docentes asignados a un proyecto (tabla proyecto_docentes)
app.get("/admin/proyectos/:id/docentes", async (req, res) => {
  const proyectoId = Number(req.params.id);
  if (!proyectoId) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        p.nombre AS programa_nombre
      FROM proyecto_docentes pd
      JOIN usuarios u ON u.id = pd.docente_id
      LEFT JOIN programas p ON p.id = u.programa_id
      WHERE pd.proyecto_id = $1
      ORDER BY u.apellido, u.nombre
      `,
      [proyectoId]
    );

    const docentes = result.rows.map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      program: row.programa_nombre || "Sin programa",
    }));

    res.json({ docentes });
  } catch (error) {
    console.error("Error en /admin/proyectos/:id/docentes (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Asignar docentes a un proyecto (sobrescribe las asignaciones anteriores)
app.put("/admin/proyectos/:id/docentes", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const { docenteIds } = req.body || {};

  if (!proyectoId || !Array.isArray(docenteIds)) {
    return res
      .status(400)
      .json({ error: "proyectoId inválido o docenteIds no es un arreglo" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM proyecto_docentes WHERE proyecto_id = $1", [
      proyectoId,
    ]);

    for (const docenteId of docenteIds) {
      const idNum = Number(docenteId);
      if (!idNum) continue;
      await client.query(
        `
        INSERT INTO proyecto_docentes (proyecto_id, docente_id, rol)
        VALUES ($1, $2, 'colaborador')
        ON CONFLICT (proyecto_id, docente_id) DO NOTHING
        `,
        [proyectoId, idNum]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /admin/proyectos/:id/docentes (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al asignar docentes" });
  } finally {
    client.release();
  }
});

// Guardar entregables semanales de un proyecto (sobrescribe los existentes)
app.post("/admin/proyectos/:id/entregables-semanales", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const { semanas } = req.body || {};

  if (!proyectoId || !Array.isArray(semanas)) {
    return res
      .status(400)
      .json({ error: "proyectoId inválido o formato de semanas incorrecto" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Borrar entregables anteriores de todas las semanas de este proyecto
    await client.query(
      `
      DELETE FROM proyecto_entregables
      WHERE proyecto_semana_id IN (
        SELECT id FROM proyecto_semanas WHERE proyecto_id = $1
      )
      `,
      [proyectoId]
    );

    // Insertar los nuevos entregables
    for (const semana of semanas) {
      if (!semana || !semana.semanaId || !Array.isArray(semana.entregables)) {
        continue;
      }
      for (const ent of semana.entregables) {
        const texto =
          typeof ent === "string"
            ? ent
            : ent && typeof ent.texto === "string"
            ? ent.texto
            : "";
        const horasRaw =
          typeof ent === "object" && ent !== null ? ent.horas ?? null : null;
        const trimmed = (texto || "").trim();
        if (!trimmed) continue;
        const horas =
          horasRaw !== null && horasRaw !== undefined && horasRaw !== ""
            ? Number(horasRaw)
            : null;
        await client.query(
          `
          INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas)
          VALUES ($1, $2, $3)
          `,
          [semana.semanaId, trimmed, isNaN(horas) ? null : horas]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en /admin/proyectos/:id/entregables-semanales (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al guardar entregables" });
  } finally {
    client.release();
  }
});

// Crear proyecto y asignarlo a un docente existente
app.post("/admin/proyectos", async (req, res) => {
  const {
    titulo,
    descripcion,
    programaNombre,
    docenteId,
    tipoVisual,
    estado,
    fechaInicio,
    fechaFin,
    horasTotales,
    semanas,
    semanasDetalle,
    semanasEntregables,
  } = req.body || {};

  if (!titulo || !programaNombre || !docenteId) {
    return res
      .status(400)
      .json({ error: "titulo, programaNombre y docenteId son obligatorios" });
  }

  const tipo =
    tipoVisual === "agreement"
      ? "convenio"
      : "proyecto"; // por ahora solo proyecto o convenio
  const estadoProyecto = estado || "en_ejecucion";

  try {
    const prog = await pool.query(
      "SELECT id FROM programas WHERE nombre = $1 LIMIT 1",
      [programaNombre]
    );
    if (prog.rowCount === 0) {
      return res.status(400).json({ error: "Programa no encontrado" });
    }

    const docente = await pool.query(
      "SELECT id, nombre, apellido FROM usuarios WHERE id = $1 LIMIT 1",
      [docenteId]
    );
    if (docente.rowCount === 0) {
      return res.status(400).json({ error: "Docente no encontrado" });
    }

    const insert = await pool.query(
      `
      INSERT INTO proyectos
        (titulo, descripcion, programa_id, docente_responsable_id, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, titulo, tipo, estado, fecha_inicio, fecha_fin_estimada, horas_totales, semanas
      `,
      [
        titulo,
        descripcion || "",
        prog.rows[0].id,
        docente.rows[0].id,
        tipo,
        estadoProyecto,
        fechaInicio || new Date().toISOString().slice(0, 10),
        fechaFin || null,
        horasTotales != null ? Number(horasTotales) : null,
        semanas != null ? Number(semanas) : null,
      ]
    );

    const created = insert.rows[0];

    // Insertar detalle de semanas:
    // - Si viene semanasDetalle desde el frontend, usamos esas fechas tal cual.
    // - Si no viene, pero hay semanas + fecha_inicio, generamos automáticamente.
    const detalle = Array.isArray(semanasDetalle) ? semanasDetalle : null;

    if (detalle && detalle.length > 0) {
      const values = [];
      const params = [];
      let idx = 1;

      for (const semana of detalle) {
        if (!semana || !semana.numero || !semana.fechaInicio || !semana.fechaFin) {
          continue;
        }
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        params.push(
          created.id,
          Number(semana.numero),
          String(semana.fechaInicio),
          String(semana.fechaFin)
        );
      }

      if (values.length > 0) {
        await pool.query(
          `
          INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
          VALUES ${values.join(", ")}
          `,
          params
        );
      }
    } else if (created.semanas && created.fecha_inicio) {
      const semanasCantidad = Number(created.semanas);
      const start = new Date(created.fecha_inicio);

      const values = [];
      const params = [];
      let paramIndex = 1;

      for (let i = 0; i < semanasCantidad; i++) {
        const semanaNumero = i + 1;
        const semanaInicio = new Date(start);
        semanaInicio.setDate(start.getDate() + i * 7);
        const semanaFin = new Date(semanaInicio);
        semanaFin.setDate(semanaInicio.getDate() + 6);

        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(
          created.id,
          semanaNumero,
          semanaInicio.toISOString().slice(0, 10),
          semanaFin.toISOString().slice(0, 10)
        );
      }

      if (values.length > 0) {
        await pool.query(
          `
          INSERT INTO proyecto_semanas (proyecto_id, numero, fecha_inicio, fecha_fin)
          VALUES ${values.join(", ")}
          `,
          params
        );
      }
    }

    // Insertar entregables iniciales si vienen en el payload
    const entregablesIniciales = Array.isArray(semanasEntregables)
      ? semanasEntregables
      : null;

    if (entregablesIniciales && entregablesIniciales.length > 0) {
      const semanasRows = await pool.query(
        "SELECT id, numero FROM proyecto_semanas WHERE proyecto_id = $1",
        [created.id]
      );
      const numToId = new Map();
      for (const row of semanasRows.rows) {
        numToId.set(Number(row.numero), row.id);
      }

      for (const semana of entregablesIniciales) {
        if (!semana || semana.numero == null || !Array.isArray(semana.entregables)) {
          continue;
        }
        const semanaId = numToId.get(Number(semana.numero));
        if (!semanaId) continue;
        for (const ent of semana.entregables) {
          const texto =
            typeof ent === "string"
              ? ent
              : ent && typeof ent.texto === "string"
              ? ent.texto
              : "";
          const horasRaw =
            typeof ent === "object" && ent !== null ? ent.horas ?? null : null;
          const trimmed = (texto || "").trim();
          if (!trimmed) continue;
          const horas =
            horasRaw !== null && horasRaw !== undefined && horasRaw !== ""
              ? Number(horasRaw)
              : null;
          await pool.query(
            `
            INSERT INTO proyecto_entregables (proyecto_semana_id, descripcion, horas)
            VALUES ($1, $2, $3)
            `,
            [semanaId, trimmed, isNaN(horas) ? null : horas]
          );
        }
      }
    }

    res.status(201).json({
      id: created.id,
      name: created.titulo,
      type: tipo === "convenio" ? "agreement" : "project",
      status: estadoProyecto === "en_ejecucion" ? "active" : "delayed",
      startDate: created.fecha_inicio,
      endDate: created.fecha_fin_estimada,
      totalHours: created.horas_totales,
      weeks: created.semanas,
    });
  } catch (error) {
    console.error("Error en /admin/proyectos (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno en creación de proyecto" });
  }
});

app.listen(port, () => {
  console.log(`ProySocial backend escuchando en http://localhost:${port}`);
});

