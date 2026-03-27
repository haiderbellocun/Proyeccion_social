import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Auth simple de pruebas
router.post("/login", async (req, res) => {
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

export default router;
