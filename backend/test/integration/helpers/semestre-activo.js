// Ayuda de pruebas (B1): las asignaciones ordinarias solo se admiten en grupos del semestre ACTIVO. Los fixtures que usan un semestre propio
// (inactivo) lo activan de forma TEMPORAL mientras asignan y restablecen después los semestres que estaban activos.
// Solo para bases de pruebas: lo usan las suites de integración, que se ejecutan en serie.

/** Ejecuta `fn` con `codigo` como único semestre activo y restablece el estado anterior (aunque `fn` falle). */
export async function conSemestreActivo(q, codigo, fn) {
  const res = await q(`SELECT codigo FROM semestres WHERE activo = TRUE`);
  const previos = (res.rows ?? res).map((r) => r.codigo); // `q` puede devolver el resultado de pg o solo las filas
  await q(`UPDATE semestres SET activo = FALSE WHERE activo = TRUE AND codigo <> $1`, [codigo]);
  await q(`UPDATE semestres SET activo = TRUE WHERE codigo = $1`, [codigo]);
  try {
    return await fn();
  } finally {
    await q(`UPDATE semestres SET activo = FALSE WHERE codigo = $1`, [codigo]);
    if (previos.length) await q(`UPDATE semestres SET activo = TRUE WHERE codigo = ANY($1::text[])`, [previos]);
  }
}
