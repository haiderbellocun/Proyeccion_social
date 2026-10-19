// Reconciliación TÉCNICA del historial docente–grupo con su espejo `usuarios.grupo_matriz_id` (AL-01, Fase B).
// Por omisión es una SIMULACIÓN (solo lectura). Con `--aplicar` cierra la asignación vigente desfasada y abre la que corresponde,
// con origen técnico `reconciliacion` y registro del cambio (sin administrador); no pierde nada ni inventa fechas pasadas.
// Úsalo solo si `historial-docente-grupo-deriva.js` informa deriva (p. ej. escrituras hechas por el código anterior entre la migración
// y la activación del código nuevo).
// Uso (desde backend/):  node --env-file=.env.dev scripts/historial-docente-grupo-reconciliar.js [--aplicar]
import { pool } from "../src/db.js";
import { reconciliar, diagnosticarDeriva } from "../src/services/asignacionDocenteService.js";

const aplicar = process.argv.includes("--aplicar");
try {
  const base = (await pool.query("SELECT current_database() AS d")).rows[0].d;
  const antes = await diagnosticarDeriva(pool);
  console.log(`Base ${base}: ${antes.deriva.length} docente(s) con deriva, ${antes.dobles.length} con más de una vigente.`);
  const r = await reconciliar(pool, { aplicar });
  if (!aplicar) {
    for (const d of r.pendientes_detalle ?? []) console.log(`  docente ${d.docente_id}: espejo=${d.espejo ?? "NULL"} · historial vigente=${d.historial_vigente ?? "ninguna"}`);
    console.log("Simulación: no se escribió nada. Use --aplicar para reconciliar.");
  } else {
    console.log(`Reconciliados: ${r.reconciliados.length} · no reconciliados: ${r.no_reconciliados.length}`);
    for (const x of r.no_reconciliados) console.log(`  docente ${x.docente_id}: ${x.motivo} (requiere decisión humana)`);
    const despues = await diagnosticarDeriva(pool);
    console.log(`Deriva restante: ${despues.deriva.length}`);
    if (despues.deriva.length) process.exitCode = 3;
  }
} finally {
  await pool.end();
}
