import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /admin/catalogo-entregables?seccion=proyectos
router.get("/catalogo-entregables", async (req, res) => {
  const { seccion } = req.query;
  try {
    const result = seccion
      ? await pool.query(
          "SELECT id, seccion, entidad_numero, entregable, descripcion, orden FROM catalogo_entregables WHERE seccion = $1 ORDER BY orden",
          [seccion]
        )
      : await pool.query(
          "SELECT id, seccion, entidad_numero, entregable, descripcion, orden FROM catalogo_entregables ORDER BY seccion, orden"
        );
    res.json({ entregables: result.rows });
  } catch (error) {
    console.error("Error en /admin/catalogo-entregables", error);
    res.status(500).json({ error: "Error interno" });
  }
});

// Catálogos para filtros admin (escuelas, programas, docentes)
router.get("/catalogos", async (_req, res) => {
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

export default router;
