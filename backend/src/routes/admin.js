import express from "express";
import { pool } from "../db.js";

const router = express.Router();

let reportFieldsColumnsEnsured = false;

async function ensureReportFieldsColumns(client) {
  if (reportFieldsColumnsEnsured) return;
  await client.query(`
    ALTER TABLE proyecto_entregables
      ADD COLUMN IF NOT EXISTS actividad_reportada TEXT,
      ADD COLUMN IF NOT EXISTS descripcion_reporte TEXT,
      ADD COLUMN IF NOT EXISTS porcentaje_avance INTEGER;
  `);
  reportFieldsColumnsEnsured = true;
}

// Datos básicos para dashboard admin
router.get("/dashboard", async (_req, res) => {
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
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'enviado'
        )::int AS enviados,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'aprobado'
        )::int AS aprobados,
        COUNT(*) FILTER (
          WHERE COALESCE(completado, false) = true
            AND COALESCE(estado_revision, 'enviado') = 'observado'
        )::int AS observados
      FROM proyecto_entregables
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

// Listado para revisión admin de avances enviados por docentes
router.get("/reportes-revision", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  const client = await pool.connect();
  try {
    await ensureReportFieldsColumns(client);
    const countResult = await client.query(
      `
      SELECT COUNT(*)::int AS total
      FROM proyecto_entregables e
      WHERE COALESCE(e.completado, false) = true
      `
    );
    const result = await client.query(
      `
      SELECT
        e.id,
        COALESCE(e.estado_revision, 'enviado') AS estado_revision,
        e.comentario_revision,
        e.fecha_real_entrega,
        e.fecha_completado,
        e.url_evidencia,
        COALESCE(e.actividad_reportada, e.descripcion) AS actividad_reportada,
        COALESCE(e.descripcion_reporte, '') AS descripcion_reporte,
        COALESCE(e.porcentaje_avance, 100)::int AS porcentaje_avance,
        COALESCE(e.horas, 0)::numeric AS horas,
        s.numero AS semana_numero,
        p.id AS proyecto_id,
        p.titulo AS proyecto_titulo,
        prog.nombre AS programa_nombre,
        u.id AS docente_id,
        u.nombre,
        u.apellido,
        u.correo
      FROM proyecto_entregables e
      JOIN proyecto_semanas s ON s.id = e.proyecto_semana_id
      JOIN proyectos p ON p.id = s.proyecto_id
      LEFT JOIN programas prog ON prog.id = p.programa_id
      LEFT JOIN usuarios u ON u.id = p.docente_responsable_id
      WHERE COALESCE(e.completado, false) = true
      ORDER BY
        CASE COALESCE(e.estado_revision, 'enviado')
          WHEN 'enviado' THEN 0
          WHEN 'observado' THEN 1
          WHEN 'aprobado' THEN 2
          ELSE 3
        END,
        COALESCE(e.fecha_real_entrega, e.fecha_completado) DESC NULLS LAST,
        e.id DESC
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const reportes = (result.rows || []).map((r) => ({
      id: r.id,
      estado_revision: r.estado_revision,
      comentario_revision: r.comentario_revision || "",
      fecha_real_entrega: r.fecha_real_entrega,
      fecha_completado: r.fecha_completado,
      url_evidencia: r.url_evidencia || "",
      actividad_reportada: r.actividad_reportada || "Entregable",
      descripcion_reporte: r.descripcion_reporte || "",
      porcentaje_avance: Number(r.porcentaje_avance ?? 100),
      horas: Number(r.horas || 0),
      semana_numero: Number(r.semana_numero || 0),
      proyecto_id: r.proyecto_id,
      proyecto_titulo: r.proyecto_titulo || "Iniciativa",
      programa_nombre: r.programa_nombre || "Sin programa",
      docente_id: r.docente_id,
      docente_nombre: [r.nombre, r.apellido].filter(Boolean).join(" "),
      docente_correo: r.correo || "",
    }));

    res.json({
      reportes,
      data: reportes,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/reportes-revision", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Cambiar estado de revisión admin para un entregable reportado
router.put("/reportes-revision/:id", async (req, res) => {
  const entregableId = Number(req.params.id);
  const { estado_revision, comentario_revision } = req.body || {};
  if (!entregableId) {
    return res.status(400).json({ error: "id inválido" });
  }
  if (!["aprobado", "observado", "enviado"].includes(estado_revision)) {
    return res.status(400).json({
      error: "estado_revision debe ser aprobado, observado o enviado",
    });
  }
  if (estado_revision === "observado" && !String(comentario_revision || "").trim()) {
    return res.status(400).json({
      error: "Debes ingresar un comentario para estado observado",
    });
  }

  const client = await pool.connect();
  try {
    const current = await client.query(
      `
      SELECT COALESCE(estado_revision, 'enviado') AS estado_revision
      FROM proyecto_entregables
      WHERE id = $1
      FOR UPDATE
      `,
      [entregableId]
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: "Entregable no encontrado" });
    }
    const currentStatus = current.rows[0].estado_revision;
    if (currentStatus === "aprobado" && estado_revision !== "aprobado") {
      return res.status(409).json({
        error: "El reporte ya fue aprobado y no puede cambiarse de estado",
      });
    }

    await client.query(
      `
      UPDATE proyecto_entregables
      SET
        estado_revision = $1,
        comentario_revision = $2,
        revisado_en = NOW()
      WHERE id = $3
      `,
      [estado_revision, comentario_revision || null, entregableId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/reportes-revision/:id", error);
    res.status(500).json({ error: "Error interno" });
  } finally {
    client.release();
  }
});

// Listado de docentes con programa y escuela (para administración de usuarios)
router.get("/docentes", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM usuarios u
      WHERE u.rol = 'docente'
      `
    );
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.estado,
        u.perfil_indicador_id,
        u.tipo_docente,
        u.regional,
        u.link_drive,
        u.grupo_matriz_id,
        p.nombre   AS programa_nombre,
        p.codigo   AS programa_codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela_nombre,
        pi.nombre AS perfil_nombre
        , gm.nombre AS grupo_matriz_nombre
      FROM usuarios u
      LEFT JOIN programas p
        ON p.id = u.programa_id
      LEFT JOIN perfiles_indicador pi
        ON pi.id = u.perfil_indicador_id
      LEFT JOIN grupos_matriz gm
        ON gm.id = u.grupo_matriz_id
      WHERE u.rol = 'docente'
      ORDER BY escuela_nombre, programa_nombre, u.apellido, u.nombre
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const docentes = result.rows.map((row) => ({
      id: row.id,
      name: `${row.nombre} ${row.apellido}`,
      email: row.correo,
      role: "Docente",
      program: row.programa_nombre || "Sin programa",
      school: row.escuela_nombre,
      status: row.estado === "activo" ? "active" : "delayed",
      perfil_id: row.perfil_indicador_id || null,
      perfil_nombre: row.perfil_nombre || null,
      tipo_docente: row.tipo_docente || null,
      regional: row.regional || null,
      link_drive: row.link_drive || null,
      grupo_matriz_id: row.grupo_matriz_id || null,
      grupo_matriz_nombre: row.grupo_matriz_nombre || null,
    }));

    res.json({
      docentes,
      data: docentes,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/docentes", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Listado de grupos/plantillas de matriz (para asignación admin)
router.get("/grupos-matriz", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        nombre,
        tipo_docente,
        horas_totales,
        activo
      FROM grupos_matriz
      ORDER BY nombre ASC
      `
    );
    res.json({ grupos: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/grupos-matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// GET /admin/indicadores-grupo
router.get("/indicadores-grupo", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        gm.id,
        gm.nombre,
        gm.tipo_docente,
        gm.horas_totales,
        gm.num_proyectos,
        gm.num_actividades,
        gm.num_convenios_nuevos,
        gm.num_convenios_dinamizados,
        COALESCE(doc.num_docentes, 0)::int AS num_docentes,
        COALESCE(pt.num_plantilla_entregables, 0)::int AS num_plantilla_entregables
      FROM grupos_matriz gm
      LEFT JOIN (
        SELECT
          grupo_matriz_id,
          COUNT(DISTINCT id)::int AS num_docentes
        FROM usuarios
        WHERE rol = 'docente'
        GROUP BY grupo_matriz_id
      ) doc
        ON doc.grupo_matriz_id = gm.id
      LEFT JOIN (
        SELECT
          grupo_id,
          COUNT(*)::int AS num_plantilla_entregables
        FROM plantilla_entregables
        GROUP BY grupo_id
      ) pt
        ON pt.grupo_id = gm.id
      WHERE gm.activo = true
      ORDER BY gm.tipo_docente DESC, gm.horas_totales DESC
      `
    );

    res.json({ grupos: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/indicadores-grupo", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/tipo-docente", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { tipo_docente } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  if (!["ANTIGUO", "NUEVO"].includes(tipo_docente)) {
    return res.status(400).json({ error: "tipo_docente debe ser ANTIGUO o NUEVO" });
  }

  try {
    await pool.query(
      `UPDATE usuarios SET tipo_docente = $1 WHERE id = $2 AND rol = 'docente'`,
      [tipo_docente, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/tipo-docente", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/info-contacto", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { regional, link_drive } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    await pool.query(
      `
      UPDATE usuarios
      SET regional = $1, link_drive = $2
      WHERE id = $3 AND rol = 'docente'
      `,
      [regional ?? null, link_drive ?? null, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/info-contacto", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/docentes/:id/grupo-matriz", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { grupo_matriz_id } = req.body || {};

  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }

  try {
    await pool.query(
      `
      UPDATE usuarios
      SET grupo_matriz_id = $1
      WHERE id = $2 AND rol = 'docente'
      `,
      [grupo_matriz_id || null, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/grupo-matriz", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/usuarios", async (req, res) => {
  const {
    nombres,
    apellidos,
    correo,
    rol,
    programaNombre,
    tipo_docente,
    regional,
    link_drive,
    grupo_matriz_id,
  } = req.body || {};

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
      INSERT INTO usuarios (
        nombre,
        apellido,
        correo,
        password_hash,
        rol,
        programa_id,
        estado,
        tipo_docente,
        regional,
        link_drive,
        grupo_matriz_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'activo', $7, $8, $9, $10)
      RETURNING id, nombre, apellido, correo, rol, estado, programa_id,
                tipo_docente, regional, link_drive, grupo_matriz_id
      `,
      [
        nombres,
        apellidos,
        correo,
        "cun123",
        rol === "admin" ? "admin" : "docente",
        programaId,
        tipo_docente || "ANTIGUO",
        regional || null,
        link_drive || null,
        grupo_matriz_id || null,
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

router.get("/proyectos", async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const limit = Math.max(1, Number.parseInt(String(req.query.limit || "20"), 10) || 20);
  const offset = (page - 1) * limit;
  try {
    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM proyectos p
      `
    );
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
      LIMIT $1 OFFSET $2
      `
      ,
      [limit, offset]
    );

    const proyectos = result.rows.map((row) => ({
      id: row.id,
      name: row.titulo,
      description: row.descripcion,
      coordinatorId: row.coordinador_id,
      coordinator: row.coordinador || "Sin asignar",
      program: row.programa || "Sin programa",
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

    res.json({
      proyectos,
      data: proyectos,
      pagination: {
        page,
        limit,
        total: countResult.rows[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Error en /admin/proyectos (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/proyectos-semanas", async (_req, res) => {
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

router.get("/proyectos/:id/docentes", async (req, res) => {
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

router.put("/proyectos/:id/docentes", async (req, res) => {
  const proyectoId = Number(req.params.id);
  const body = req.body || {};
  const { docenteIds, docentes: docentesBody } = body;

  if (!proyectoId) {
    return res.status(400).json({ error: "id de proyecto inválido" });
  }

  let lista = [];

  if (Array.isArray(docentesBody)) {
    lista = docentesBody
      .map((d) => {
        const idNum = Number(d?.id);
        const gm =
          d?.grupo_matriz_id != null && d.grupo_matriz_id !== ""
            ? Number(d.grupo_matriz_id)
            : null;
        return {
          id: idNum,
          grupo_matriz_id:
            gm != null && !Number.isNaN(gm) && gm > 0 ? gm : null,
        };
      })
      .filter((d) => d.id > 0);
  } else if (Array.isArray(docenteIds)) {
    lista = docenteIds
      .map((id) => ({ id: Number(id), grupo_matriz_id: null }))
      .filter((d) => d.id > 0);
  } else {
    return res.status(400).json({
      error:
        "Se requiere docentes: [{ id, grupo_matriz_id? }] o docenteIds: number[]",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM proyecto_docentes WHERE proyecto_id = $1", [
      proyectoId,
    ]);

    for (const row of lista) {
      await client.query(
        `
        INSERT INTO proyecto_docentes (proyecto_id, docente_id, rol)
        VALUES ($1, $2, 'colaborador')
        ON CONFLICT (proyecto_id, docente_id) DO NOTHING
        `,
        [proyectoId, row.id]
      );
    }

    for (const row of lista) {
      if (!row.grupo_matriz_id) continue;

      const existsGrupo = await client.query(
        `SELECT 1 FROM grupos_matriz WHERE id = $1`,
        [row.grupo_matriz_id]
      );
      if (existsGrupo.rowCount === 0) continue;

      const uRes = await client.query(
        `
        SELECT grupo_matriz_id
        FROM usuarios
        WHERE id = $1 AND rol = 'docente'
        FOR UPDATE
        `,
        [row.id]
      );
      if (uRes.rowCount === 0) continue;
      if (uRes.rows[0].grupo_matriz_id != null) continue;

      await client.query(
        `
        UPDATE usuarios
        SET grupo_matriz_id = $1
        WHERE id = $2 AND rol = 'docente' AND grupo_matriz_id IS NULL
        `,
        [row.grupo_matriz_id, row.id]
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

router.post("/proyectos/:id/entregables-semanales", async (req, res) => {
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
    await client.query(
      `
      DELETE FROM proyecto_entregables
      WHERE proyecto_semana_id IN (
        SELECT id FROM proyecto_semanas WHERE proyecto_id = $1
      )
      `,
      [proyectoId]
    );

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

router.post("/proyectos", async (req, res) => {
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

  const tipo = tipoVisual === "agreement" ? "convenio" : "proyecto";
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

router.get("/perfiles-indicador", async (_req, res) => {
  try {
    const [perfilesResult, asignacionesResult] = await Promise.all([
      pool.query(
        `
        SELECT
          id,
          nombre,
          num_proyectos,
          num_actividades,
          num_convenios_nuevos,
          num_convenios_dinamizados,
          (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
        FROM perfiles_indicador
        ORDER BY nombre
        `
      ),
      pool.query(
        `
        SELECT
          ppi.programa_id,
          ppi.perfil_id,
          ppi.semestre,
          p.nombre AS programa_nombre
        FROM programa_perfil_indicador ppi
        JOIN programas p ON p.id = ppi.programa_id
        ORDER BY p.nombre
        `
      ),
    ]);

    res.json({
      perfiles: perfilesResult.rows || [],
      asignaciones: asignacionesResult.rows || [],
    });
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/perfiles-indicador", async (req, res) => {
  const {
    nombre,
    num_proyectos,
    num_actividades,
    num_convenios_nuevos,
    num_convenios_dinamizados,
    num_convenios,
  } = req.body || {};

  const nProy = Number(num_proyectos ?? 0);
  const nAct = Number(num_actividades ?? 0);
  const nConvNuevos =
    num_convenios_nuevos !== undefined && num_convenios_nuevos !== null
      ? Number(num_convenios_nuevos ?? 0)
      : Number(num_convenios ?? 0);
  const nConvDinamizados =
    num_convenios_dinamizados !== undefined && num_convenios_dinamizados !== null
      ? Number(num_convenios_dinamizados ?? 0)
      : 0;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del perfil es obligatorio." });
  }
  if (nProy < 0 || nAct < 0 || nConvNuevos < 0 || nConvDinamizados < 0) {
    return res
      .status(400)
      .json({
        error:
          "Los números de proyectos, actividades y convenios deben ser mayores o iguales a 0.",
      });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO perfiles_indicador (
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados,
        (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
      `,
      [nombre.trim(), nProy, nAct, nConvNuevos, nConvDinamizados]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador (POST)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al crear perfil" });
  }
});

router.put("/perfiles-indicador/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    nombre,
    num_proyectos,
    num_actividades,
    num_convenios_nuevos,
    num_convenios_dinamizados,
    num_convenios,
  } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: "ID de perfil inválido." });
  }

  const nProy = Number(num_proyectos ?? 0);
  const nAct = Number(num_actividades ?? 0);
  const nConvNuevos =
    num_convenios_nuevos !== undefined && num_convenios_nuevos !== null
      ? Number(num_convenios_nuevos ?? 0)
      : Number(num_convenios ?? 0);
  const nConvDinamizados =
    num_convenios_dinamizados !== undefined && num_convenios_dinamizados !== null
      ? Number(num_convenios_dinamizados ?? 0)
      : 0;

  if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del perfil es obligatorio." });
  }
  if (nProy < 0 || nAct < 0 || nConvNuevos < 0 || nConvDinamizados < 0) {
    return res
      .status(400)
      .json({
        error:
          "Los números de proyectos, actividades y convenios deben ser mayores o iguales a 0.",
      });
  }

  try {
    const result = await pool.query(
      `
      UPDATE perfiles_indicador
      SET nombre = $1,
          num_proyectos = $2,
          num_actividades = $3,
          num_convenios_nuevos = $4,
          num_convenios_dinamizados = $5
      WHERE id = $6
      RETURNING
        id,
        nombre,
        num_proyectos,
        num_actividades,
        num_convenios_nuevos,
        num_convenios_dinamizados,
        (COALESCE(num_convenios_nuevos,0) + COALESCE(num_convenios_dinamizados,0)) AS num_convenios
      `,
      [nombre.trim(), nProy, nAct, nConvNuevos, nConvDinamizados, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Perfil no encontrado." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador/:id (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al actualizar perfil" });
  }
});

router.delete("/perfiles-indicador/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "ID de perfil inválido." });
  }

  try {
    const asignaciones = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM programa_perfil_indicador
      WHERE perfil_id = $1
      `,
      [id]
    );

    const total = asignaciones.rows[0]?.total ?? 0;
    if (total > 0) {
      return res.status(409).json({
        error: "No se puede eliminar el perfil porque tiene programas asignados.",
      });
    }

    await pool.query("DELETE FROM perfiles_indicador WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Error en /admin/perfiles-indicador/:id (DELETE)", {
      mensaje: (error && error.message) || String(error),
    });
    res.status(500).json({ error: "Error interno al eliminar perfil" });
  }
});

router.get("/programas", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.codigo,
        COALESCE(p.facultad, 'Sin escuela') AS escuela,
        ppi.perfil_id,
        ppi.semestre,
        pi.nombre AS perfil_nombre
      FROM programas p
      LEFT JOIN programa_perfil_indicador ppi
        ON ppi.programa_id = p.id
       AND ppi.semestre = '2025C'
      LEFT JOIN perfiles_indicador pi
        ON pi.id = ppi.perfil_id
      ORDER BY escuela, p.nombre
      `
    );

    res.json({ programas: result.rows || [] });
  } catch (error) {
    console.error("Error en /admin/programas (GET)", error);
    res.status(500).json({ error: "Error interno" });
  }
});

router.put("/programas/:id/perfil", async (req, res) => {
  const programaId = Number(req.params.id);
  const { perfil_id, semestre } = req.body || {};

  if (!programaId) {
    return res.status(400).json({ error: "ID de programa inválido." });
  }
  if (!semestre || typeof semestre !== "string" || !semestre.trim()) {
    return res.status(400).json({ error: "El semestre es obligatorio." });
  }

  try {
    if (perfil_id === null || perfil_id === undefined) {
      await pool.query(
        `
        DELETE FROM programa_perfil_indicador
        WHERE programa_id = $1 AND semestre = $2
        `,
        [programaId, semestre]
      );
      return res.json({ ok: true });
    }

    const perfilIdNum = Number(perfil_id);
    if (!perfilIdNum) {
      return res.status(400).json({ error: "perfil_id inválido." });
    }

    await pool.query(
      `
      INSERT INTO programa_perfil_indicador (programa_id, perfil_id, semestre)
      VALUES ($1, $2, $3)
      ON CONFLICT (programa_id, semestre)
      DO UPDATE SET perfil_id = EXCLUDED.perfil_id
      `,
      [programaId, perfilIdNum, semestre]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error en /admin/programas/:id/perfil (PUT)", {
      mensaje: (error && error.message) || String(error),
      body: req.body,
    });
    res.status(500).json({ error: "Error interno al asignar perfil al programa" });
  }
});

router.put("/docentes/:id/perfil", async (req, res) => {
  const docenteId = Number(req.params.id);
  const { perfil_id } = req.body || {};
  if (!docenteId) {
    return res.status(400).json({ error: "id de docente inválido" });
  }
  try {
    await pool.query(
      "UPDATE usuarios SET perfil_indicador_id = $1 WHERE id = $2",
      [perfil_id || null, docenteId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error en PUT /admin/docentes/:id/perfil", error);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
