// Ayuda de pruebas: varias suites antiguas fabrican fixtures escribiendo `usuarios.grupo_matriz_id` directamente por SQL (como lo hacía el
// código anterior). Con el historial de asignaciones, ese espejo debe coincidir con la fila vigente: este helper aplica la reconciliación
// técnica del propio servicio (origen `reconciliacion`, sin administrador) para alinear el historial con el espejo del fixture.
// Se llama tras crear el fixture y tras cada cambio directo del espejo por SQL. Solo para bases de pruebas.
import { reconciliar } from "../../../src/services/asignacionDocenteService.js";

export async function alinearHistorial(pool) {
  const db = (await pool.query("SELECT current_database() AS d")).rows[0].d;
  if (!["proysocial_test", "proysocial_dev"].includes(db)) throw new Error(`alinearHistorial: base no permitida (${db})`);
  const r = await reconciliar(pool, { aplicar: true });
  if (r.no_reconciliados.length) throw new Error(`alinearHistorial: no se pudo alinear ${JSON.stringify(r.no_reconciliados)}`);
  return r;
}
