// Vista previa (SOLO LECTURA) del backfill del historial docente–grupo (AL-01). NO crea tablas ni escribe nada: toda la consulta corre
// dentro de una transacción `READ ONLY`, de modo que PostgreSQL rechaza cualquier escritura.
//
// Clasifica cada asignación (docente, grupo) en:
//   · DEMOSTRABLE   — la asignación está probada por relaciones explícitas del esquema que el código solo permite crear si el docente
//                     pertenecía al grupo (grupo vigente; reportes; excepciones individuales);
//   · CORROBORADA   — además la respaldan eventos/evidencias del flujo (derivados de los reportes);
//   · CONFLICTO     — la evidencia es contradictoria o ambigua: requiere decisión humana, NO se asigna;
//   · NO RECONSTRUIBLE — docentes y semestres sin ninguna evidencia: no se infiere nada (ni por fechas, ni por nombres, ni por semestre).
//
// Uso (desde backend/):  node --env-file=.env.dev scripts/historial-docente-grupo-preview.js [--json]
import { pool } from "../src/db.js";

const json = process.argv.includes("--json");
const client = await pool.connect();
const out = { base: null, generado: new Date().toISOString() };
try {
  await client.query("BEGIN READ ONLY");
  out.base = (await client.query("SELECT current_database() AS d, version() AS v")).rows[0];
  const q = async (sql, params = []) => (await client.query(sql, params)).rows;

  const docentes = await q(
    `SELECT u.id, TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')) AS nombre, u.estado, u.grupo_matriz_id AS grupo_vigente,
            g.nombre AS grupo_vigente_nombre, g.semestre AS semestre_vigente, g.activo AS grupo_vigente_activo
     FROM usuarios u LEFT JOIN grupos_matriz g ON g.id = u.grupo_matriz_id
     WHERE u.rol = 'docente' ORDER BY u.id`
  );
  const noDocentesConGrupo = await q(`SELECT id, rol FROM usuarios WHERE rol <> 'docente' AND grupo_matriz_id IS NOT NULL`);
  const reportes = await q(
    `SELECT pe.docente_id, t.grupo_id, g.semestre, g.nombre AS grupo_nombre, g.activo AS grupo_activo, COUNT(*)::int AS reportes,
            COUNT(*) FILTER (WHERE pe.estado_revision = 'aprobado')::int AS aprobados
     FROM proyecto_entregables pe JOIN plantilla_entregables t ON t.id = pe.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id
     WHERE pe.docente_id IS NOT NULL GROUP BY pe.docente_id, t.grupo_id, g.semestre, g.nombre, g.activo`
  );
  const excepciones = await q(
    `SELECT dex.docente_id, t.grupo_id, g.semestre, COUNT(*)::int AS excepciones
     FROM docente_entregable_excepciones dex JOIN plantilla_entregables t ON t.id = dex.plantilla_id JOIN grupos_matriz g ON g.id = t.grupo_id
     GROUP BY dex.docente_id, t.grupo_id, g.semestre`
  );
  const eventos = await q(
    `SELECT ev.docente_id, t.grupo_id, COUNT(*)::int AS eventos
     FROM entregable_eventos ev JOIN plantilla_entregables t ON t.id = ev.plantilla_id
     WHERE ev.docente_id IS NOT NULL GROUP BY ev.docente_id, t.grupo_id`
  );
  const evidencias = await q(
    `SELECT v.docente_id, t.grupo_id, COUNT(*)::int AS evidencias
     FROM entregable_evidencias v JOIN plantilla_entregables t ON t.id = v.plantilla_id
     WHERE v.docente_id IS NOT NULL GROUP BY v.docente_id, t.grupo_id`
  );
  const sinPlantilla = await q(`SELECT docente_id, COUNT(*)::int AS n FROM proyecto_entregables WHERE docente_id IS NOT NULL AND plantilla_id IS NULL GROUP BY docente_id`);
  const importaciones = await q(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE decisiones->>'docente' = 'reasignar')::int AS con_reasignacion FROM importaciones_matriz`
  );
  const semestres = await q(
    `SELECT s.codigo, s.activo, COUNT(DISTINCT g.id)::int AS grupos,
            COUNT(DISTINCT u.id) FILTER (WHERE u.rol = 'docente')::int AS docentes_vigentes
     FROM semestres s LEFT JOIN grupos_matriz g ON g.semestre = s.codigo LEFT JOIN usuarios u ON u.grupo_matriz_id = g.id
     GROUP BY s.codigo, s.activo ORDER BY s.codigo`
  );
  await client.query("ROLLBACK");

  const clave = (d, g) => `${d}:${g}`;
  const doc = new Map(docentes.map((d) => [d.id, d]));
  const pares = new Map(); // (docente,grupo) → evidencia
  const par = (d, g) => {
    const k = clave(d, g);
    if (!pares.has(k)) pares.set(k, { docente_id: d, grupo_id: g, semestre: null, vigente: false, reportes: 0, aprobados: 0, excepciones: 0, eventos: 0, evidencias: 0 });
    return pares.get(k);
  };
  for (const d of docentes) if (d.grupo_vigente != null) { const p = par(d.id, d.grupo_vigente); p.vigente = true; p.semestre = d.semestre_vigente; }
  for (const r of reportes) { const p = par(r.docente_id, r.grupo_id); p.semestre = r.semestre; p.reportes = r.reportes; p.aprobados = r.aprobados; }
  for (const r of excepciones) { const p = par(r.docente_id, r.grupo_id); p.semestre = r.semestre; p.excepciones = r.excepciones; }
  for (const r of eventos) par(r.docente_id, r.grupo_id).eventos = r.eventos;
  for (const r of evidencias) par(r.docente_id, r.grupo_id).evidencias = r.evidencias;

  const lista = [...pares.values()].map((p) => ({
    ...p,
    docente: doc.get(p.docente_id)?.nombre ?? `#${p.docente_id}`,
    // Prueba: vigente (dato actual), o reportes/excepciones (el código solo los crea si el docente pertenecía al grupo).
    prueba: [p.vigente && "grupo_vigente", p.reportes > 0 && "reportes", p.excepciones > 0 && "excepciones"].filter(Boolean),
    corroborada: p.eventos > 0 || p.evidencias > 0,
  }));

  // Conflictos: un docente con asignaciones demostradas en dos o más grupos de un mismo semestre.
  const porDocSem = new Map();
  for (const p of lista) {
    if (!p.semestre) continue;
    const k = `${p.docente_id}:${p.semestre}`;
    porDocSem.set(k, [...(porDocSem.get(k) ?? []), p]);
  }
  const conflictos = [];
  for (const [k, ps] of porDocSem) {
    if (ps.length > 1) conflictos.push({ tipo: "dos_grupos_en_un_semestre", docente_id: ps[0].docente_id, docente: ps[0].docente, semestre: ps[0].semestre, grupos: ps.map((p) => ({ grupo_id: p.grupo_id, prueba: p.prueba })) });
  }
  for (const r of sinPlantilla) conflictos.push({ tipo: "reportes_sin_plantilla_no_atribuibles_a_un_grupo", docente_id: r.docente_id, docente: doc.get(r.docente_id)?.nombre ?? `#${r.docente_id}`, reportes: r.n });
  for (const u of noDocentesConGrupo) conflictos.push({ tipo: "usuario_no_docente_con_grupo", usuario_id: u.id, rol: u.rol });
  for (const p of lista) if (p.reportes > 0 && reportes.find((r) => r.docente_id === p.docente_id && r.grupo_id === p.grupo_id)?.grupo_activo === false) conflictos.push({ tipo: "grupo_archivado_con_reportes", docente_id: p.docente_id, grupo_id: p.grupo_id, nota: "No es un conflicto: el grupo archivado conserva su historia (la FK impide borrarlo)." });

  const conflictivo = new Set(conflictos.filter((c) => c.tipo === "dos_grupos_en_un_semestre").flatMap((c) => c.grupos.map((g) => clave(c.docente_id, g.grupo_id))));
  const demostrables = lista.filter((p) => p.prueba.length > 0 && !conflictivo.has(clave(p.docente_id, p.grupo_id)));
  const soloVigente = demostrables.filter((p) => p.vigente && p.reportes === 0 && p.excepciones === 0);
  const vigenteConReportes = demostrables.filter((p) => p.vigente && (p.reportes > 0 || p.excepciones > 0));
  const historicas = demostrables.filter((p) => !p.vigente);
  const sinEvidencia = docentes.filter((d) => d.grupo_vigente == null && !lista.some((p) => p.docente_id === d.id));

  out.resumen = {
    docentes: docentes.length,
    docentes_con_grupo_vigente: docentes.filter((d) => d.grupo_vigente != null).length,
    docentes_inactivos: docentes.filter((d) => d.estado !== "activo").length,
    asignaciones_demostrables: demostrables.length,
    de_ellas: {
      vigente_sin_reportes_ni_excepciones: soloVigente.length,
      vigente_confirmada_por_reportes_o_excepciones: vigenteConReportes.length,
      historicas_distintas_del_grupo_vigente: historicas.length,
    },
    corroboradas_por_eventos_o_evidencias: demostrables.filter((p) => p.corroborada).length,
    conflictos: conflictos.filter((c) => c.tipo !== "grupo_archivado_con_reportes").length,
    docentes_sin_ninguna_evidencia_ni_grupo: sinEvidencia.length,
    importaciones: importaciones[0],
    filas_que_crearia_el_backfill: demostrables.length,
    duplicados_evitados_por_clave: lista.length - new Set(lista.map((p) => clave(p.docente_id, p.grupo_id))).size,
    de_las_filas_ya_cubiertas_por_mas_de_una_fuente: demostrables.filter((p) => p.prueba.length > 1).length,
  };
  out.asignaciones = demostrables;
  out.conflictos = conflictos;
  out.no_reconstruibles = { docentes_sin_grupo_ni_evidencia: sinEvidencia.map((d) => ({ id: d.id, nombre: d.nombre, estado: d.estado })), semestres_sin_poblacion_demostrable: semestres.filter((s) => !lista.some((p) => p.semestre === s.codigo)).map((s) => s.codigo) };
  out.semestres = semestres.map((s) => ({ ...s, asignaciones_demostrables: demostrables.filter((p) => p.semestre === s.codigo).length }));
  out.afectados = {
    docentes: [...new Set(demostrables.map((p) => p.docente_id))].map((id) => ({ id, nombre: doc.get(id)?.nombre, estado: doc.get(id)?.estado })),
    grupos: [...new Set(demostrables.map((p) => p.grupo_id))],
  };
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const r = out.resumen;
  console.log(`Vista previa del backfill — base ${out.base.d} (solo lectura)`);
  console.log(JSON.stringify(r, null, 2));
  console.log("\nAsignaciones demostrables:");
  for (const p of out.asignaciones) console.log(`  docente ${p.docente_id} (${p.docente}) → grupo ${p.grupo_id} [${p.semestre}] prueba=${p.prueba.join("+")} reportes=${p.reportes} (aprobados ${p.aprobados}) excepciones=${p.excepciones} eventos=${p.eventos} evidencias=${p.evidencias}${p.vigente ? " VIGENTE" : ""}`);
  console.log("\nConflictos (requieren decisión humana; no se asignan):", out.conflictos.length ? JSON.stringify(out.conflictos, null, 2) : "ninguno");
  console.log("\nNo reconstruibles:", JSON.stringify(out.no_reconstruibles, null, 2));
  console.log("\nSemestres:", JSON.stringify(out.semestres));
}
