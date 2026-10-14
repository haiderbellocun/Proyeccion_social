// Importación de matrices desde Excel. Solo administradores (el montaje en index.js exige requireRole("admin")).
// El archivo llega como JSON { archivo_base64, nombre_archivo, ... } y se re-envía en cada paso (sin estado en el servidor).
import express from "express";
import { pool } from "../db.js";
import { ErrorNegocio, responderError } from "../services/matrizService.js";
import { ArchivoInvalidoError, LIMITES } from "../services/xlsxReader.js";
import {
  analizarArchivo,
  confirmarImportacion,
  inspeccionarHoja,
  listarImportaciones,
  validarImportacion,
} from "../services/matrixImportDb.js";

const router = express.Router();

function leerArchivo(body) {
  const b64 = String(body?.archivo_base64 || "");
  if (!b64) throw new ErrorNegocio(400, "ARCHIVO_REQUERIDO", "Selecciona un archivo .xlsx");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new ErrorNegocio(400, "ARCHIVO_INVALIDO", "El archivo no está codificado correctamente");
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length > LIMITES.maxBytes) throw new ErrorNegocio(413, "ARCHIVO_GRANDE", "El archivo supera el tamaño máximo permitido (12 MB)");
  const nombre = String(body?.nombre_archivo || "").slice(0, 200);
  if (nombre && !/\.xlsx$/i.test(nombre)) throw new ErrorNegocio(400, "EXTENSION_INVALIDA", "Solo se admiten archivos .xlsx");
  return { buffer, nombre };
}

const manejar = (contexto, fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error instanceof ArchivoInvalidoError) {
      return res.status(422).json({ error: error.message, codigo: error.codigo });
    }
    responderError(res, error, contexto);
  }
};

const params = (req) => {
  const { buffer, nombre } = leerArchivo(req.body);
  return {
    buffer,
    nombre_archivo: nombre,
    hoja_indice: req.body?.hoja_indice,
    mapeo: req.body?.mapeo && typeof req.body.mapeo === "object" ? req.body.mapeo : undefined,
    destino: req.body?.destino && typeof req.body.destino === "object" ? req.body.destino : {},
    decisiones: req.body?.decisiones && typeof req.body.decisiones === "object" ? req.body.decisiones : {},
    opciones: req.body?.opciones && typeof req.body.opciones === "object" ? req.body.opciones : {},
  };
};

// Paso 1-2: hojas disponibles y su clasificación
router.post("/analizar", manejar("POST /admin/importaciones/analizar", async (req) => {
  const { buffer, nombre } = leerArchivo(req.body);
  return analizarArchivo(buffer, nombre);
}));

// Paso 2-3: estructura de una hoja (encabezados, mapeo sugerido, muestra)
router.post("/hoja", manejar("POST /admin/importaciones/hoja", async (req) => {
  const { buffer } = leerArchivo(req.body);
  return inspeccionarHoja(buffer, req.body?.hoja_indice);
}));

// Pasos 4-5: validación previa SIN escrituras
router.post("/validar", manejar("POST /admin/importaciones/validar", async (req) => validarImportacion(pool, params(req))));

// Paso 6: confirmación (transacción; la validación se repite en el servidor)
router.post("/confirmar", manejar("POST /admin/importaciones/confirmar", async (req) =>
  confirmarImportacion(pool, params(req), { usuarioId: Number(req.user?.id) || null })
));

// Historial de importaciones
router.get("/", manejar("GET /admin/importaciones", async (req) => ({
  importaciones: await listarImportaciones(pool, { limite: req.query.limite }),
})));

export default router;
