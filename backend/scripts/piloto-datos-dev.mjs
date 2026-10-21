// Traslado CONTROLADO de los datos sintéticos de proysocial_dev a la base del piloto (esquema de 35 migraciones ya instalado).
//   exportar : lee proysocial_dev en una transacción READ ONLY y deja un JSON (fuera del repositorio) con las filas y sus huellas.
//   importar : inserta en el destino, en UNA transacción, con triggers y restricciones ACTIVOS; no toca el esquema ni schema_migrations.
//   verificar: compara destino contra el JSON exportado (conteos y huella por tabla), integridad e historial docente–grupo.
// Uso (desde backend/), siempre con --dir=<carpeta fuera del repositorio>:
//   node --env-file=.env --env-file=.env.dev scripts/piloto-datos-dev.mjs exportar --dir=<dir>
//   PGDATABASE=… PGHOST=… node scripts/piloto-datos-dev.mjs importar|verificar --dir=<dir> --confirmar-base=<nombre>
// No se copian: notificacion_correos (cola de correos), google_sub, schema_migrations. Las credenciales llegan solo por el entorno.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const pg = require("pg");

const REPO = path.resolve(import.meta.dirname, "..", "..");
const modo = process.argv[2];
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const dir = arg("dir") ? path.resolve(arg("dir")) : null;
const falla = (m) => { console.error(`ABORTA: ${m}`); process.exit(1); };
if (!["exportar", "importar", "verificar"].includes(modo)) falla("modo: exportar | importar | verificar");
if (!dir) falla("--dir es obligatorio");
if (dir.toLowerCase().startsWith(REPO.toLowerCase())) falla("el directorio de exportación debe estar FUERA del repositorio");

// Orden de inserción según las claves foráneas. «semilla»: tablas que las migraciones ya pueblan (se comparan, no se duplican).
const TABLAS = [
  { t: "escuelas", semilla: true },
  { t: "programas", semilla: true },
  { t: "semestres", semilla: true, ignorar: ["activo"] },
  { t: "grupos_matriz", semilla: true },
  { t: "plantilla_entregables", semilla: true },
  { t: "usuarios", anular: ["google_sub"] },
  { t: "proyectos" },
  { t: "proyecto_docentes" },
  { t: "proyecto_semanas" },
  { t: "proyecto_entregables" },
  { t: "actualizaciones_masivas_entregables" },
  { t: "entregable_eventos" },
  { t: "entregable_evidencias" },
  { t: "docente_entregable_excepciones" },
  { t: "importaciones_matriz" },
  { t: "notificaciones" },
  { t: "notificacion_lecturas" },
];
const pkExpr = (pk) => pk.split(",").map((c) => `"${c}"::text`).join(` || '|' || `);
const ignora = (x) => ["creado_en", ...(x.ignorar ?? [])];

async function huella(c, x, cols, pks) {
  const usar = cols.filter((k) => !(x.semilla ? ignora(x) : x.ignorar ?? []).concat(x.anular ?? []).includes(k));
  const r = await c.query(
    `SELECT count(*)::int n, md5(coalesce(string_agg(j::text, '|' ORDER BY k), '')) h FROM (
       SELECT ${pkExpr(x.pk)} AS k, (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(to_jsonb(t)) e WHERE e.key = ANY($1)) AS j FROM "${x.t}" t) s
     WHERE $2::text[] IS NULL OR k = ANY($2)`, [usar, pks]);
  return r.rows[0];
}

const c = new pg.Client({ connectionTimeoutMillis: 15000 });
await c.connect();
// huellas y volcados comparables entre servidores con distinta zona horaria de sesión (los instantes no cambian)
await c.query("SET TIME ZONE 'UTC'");
const q = async (s, p) => (await c.query(s, p)).rows;
const info = (await q(`SELECT current_database() AS base, current_user AS usr, current_setting('server_version') AS v`))[0];
// clave primaria de cada tabla, tomada del catálogo (columnas en el orden del índice)
for (const x of TABLAS) {
  x.pk = (await q(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                   WHERE i.indrelid = to_regclass($1) AND i.indisprimary ORDER BY array_position(i.indkey::int2[], a.attnum)`, [`public."${x.t}"`])).map((r) => r.attname).join(",");
}
console.log(`Conexión: base=${info.base} usuario=${info.usr} PostgreSQL ${info.v} host=${process.env.PGHOST}:${process.env.PGPORT}`);

if (modo === "exportar") {
  if (info.base !== "proysocial_dev") falla(`el origen debe ser proysocial_dev (conectado a ${info.base})`);
  mkdirSync(dir, { recursive: true });
  await c.query("BEGIN READ ONLY");
  const salida = { generado: new Date().toISOString(), origen: info.base, tablas: {} };
  for (const x of TABLAS) {
    const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [x.t])).map((r) => r.column_name);
    if (!cols.length) { console.log(`  ${x.t}: no existe en el origen (se omite)`); continue; }
    const filas = (await q(`SELECT to_jsonb(t) AS j FROM "${x.t}" t ORDER BY ${x.pk}`)).map((r) => r.j);
    for (const f of filas) for (const k of x.anular ?? []) f[k] = null;
    const pks = (await q(`SELECT ${pkExpr(x.pk)} AS k FROM "${x.t}" ORDER BY ${x.pk}`)).map((r) => r.k);
    const h = await huella(c, x, cols, null);
    salida.tablas[x.t] = { cols, filas, pks, huella: h.h, n: h.n };
    console.log(`  ${x.t}: ${filas.length} fila(s)`);
  }
  // datos que NO se copian (solo se informan)
  salida.omitidas = { notificacion_correos: (await q(`SELECT count(*)::int n FROM notificacion_correos`))[0].n };
  salida.semestreActivo = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
  await c.query("ROLLBACK");
  writeFileSync(path.join(dir, "datos-dev.json"), JSON.stringify(salida));
  console.log(`Exportado a ${path.join(dir, "datos-dev.json")} · omitidas: ${JSON.stringify(salida.omitidas)} · semestre activo: ${salida.semestreActivo}`);
  await c.end(); process.exit(0);
}

// ───── destino ─────
const PERMITIDAS = { proysocial_piloto: { host: "127.0.0.1", port: "55432", usr: "proysocial_migrator" }, proysocial_piloto_ensayo: {} };
if (arg("confirmar-base") !== info.base) falla(`--confirmar-base debe ser ${info.base}`);
const p = PERMITIDAS[info.base];
if (!p) falla(`base no autorizada como destino: ${info.base}`);
if (p.host && (process.env.PGHOST !== p.host || process.env.PGPORT !== p.port || info.usr !== p.usr)) falla(`destino ${info.base} exige ${p.usr}@${p.host}:${p.port}`);
if (process.env.INSTANCE_CONNECTION_NAME || process.env.DATABASE_URL) falla("INSTANCE_CONNECTION_NAME y DATABASE_URL deben estar vacías");
const mig = (await q(`SELECT count(*)::int n FROM schema_migrations`))[0].n;
if (mig !== 35) falla(`el destino tiene ${mig} migraciones registradas (se esperan 35)`);
const D = JSON.parse(readFileSync(path.join(dir, "datos-dev.json"), "utf8"));
if (D.origen !== "proysocial_dev") falla("el JSON no proviene de proysocial_dev");
const cuenta = async (t) => (await q(`SELECT count(*)::int n FROM "${t}"`))[0].n;

if (modo === "importar") {
  const resumen = {};
  // precondiciones: tablas NO semilla vacías, historial vacío, cola de correos vacía
  for (const x of TABLAS.filter((y) => !y.semilla)) if (D.tablas[x.t] && (await cuenta(x.t)) > 0) falla(`${x.t} ya tiene datos en el destino (la importación es de carga inicial)`);
  for (const t of ["docente_grupo_matriz", "docente_grupo_matriz_cambios", "docente_grupo_matriz_incidencias", "notificacion_correos"]) if ((await cuenta(t)) > 0) falla(`${t} no está vacía en el destino`);
  const antes = {}; for (const x of TABLAS) antes[x.t] = await cuenta(x.t);
  console.log("Filas antes:", JSON.stringify(antes));
  await c.query("BEGIN");
  try {
    for (const x of TABLAS) {
      const T = D.tablas[x.t]; if (!T) continue;
      const colsDst = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [x.t])).map((r) => r.column_name);
      const faltan = T.cols.filter((k) => !colsDst.includes(k));
      if (faltan.length) throw new Error(`${x.t}: columnas del origen que no existen en el destino: ${faltan}`);
      if (!T.filas.length) { resumen[x.t] = { insertadas: 0, existentes: 0 }; continue; }
      await c.query(`CREATE TEMP TABLE _src (LIKE "${x.t}") ON COMMIT DROP`);
      await c.query(`INSERT INTO _src SELECT * FROM jsonb_populate_recordset(NULL::"${x.t}", $1::jsonb)`, [JSON.stringify(T.filas)]);
      const cmp = T.cols.filter((k) => !(x.semilla ? ignora(x) : x.ignorar ?? []).includes(k));
      const join = x.pk.split(",").map((k) => `s."${k}" = d."${k}"`).join(" AND ");
      const difiere = cmp.map((k) => `s."${k}" IS DISTINCT FROM d."${k}"`).join(" OR ");
      const conflictos = (await q(`SELECT ${x.pk.split(",").map((k) => `s."${k}"`).join(",")} FROM _src s JOIN "${x.t}" d ON ${join} WHERE ${difiere}`));
      if (conflictos.length) throw new Error(`${x.t}: ${conflictos.length} fila(s) con el mismo identificador pero contenido distinto en el destino: ${JSON.stringify(conflictos.slice(0, 5))}`);
      const colsIns = T.cols.filter((k) => !(x.t === "semestres" && k === "activo"));
      const lista = colsIns.map((k) => `"${k}"`).join(",");
      const ins = await c.query(`INSERT INTO "${x.t}" (${lista}) SELECT ${lista} FROM _src s WHERE NOT EXISTS (SELECT 1 FROM "${x.t}" d WHERE ${join})`);
      resumen[x.t] = { insertadas: ins.rowCount, existentes: T.filas.length - ins.rowCount };
      await c.query(`DROP TABLE _src`);
    }
    // semestre activo = el del origen (índice único parcial: primero se desactivan los demás)
    const act = D.semestreActivo;
    if (act.length === 1) {
      await c.query(`UPDATE semestres SET activo = false WHERE activo AND codigo <> $1`, [act[0]]);
      await c.query(`UPDATE semestres SET activo = true WHERE codigo = $1`, [act[0]]);
    }
    // secuencias: al máximo existente (la siguiente inserción no choca con los identificadores trasladados)
    for (const x of TABLAS) {
      for (const col of x.pk.split(",")) {
        const sq = (await q(`SELECT pg_get_serial_sequence('"${x.t}"', $1) AS s`, [col]))[0].s;
        if (sq) await c.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX("${col}"), 0) FROM "${x.t}"), 1), (SELECT COUNT(*) > 0 FROM "${x.t}"))`, [sq]);
      }
    }
    // correos generados por los triggers durante la importación: se cancelan (no se envía nada)
    const cancelados = (await c.query(`UPDATE notificacion_correos SET estado = 'cancelado', actualizado_en = now(), ultimo_error = 'Cancelado: generado por la importación de datos sintéticos del piloto' WHERE estado = 'pendiente'`)).rowCount;
    console.log(`Correos generados por la importación y cancelados: ${cancelados}`);
    // historial docente–grupo: carga inicial conservadora (precondiciones ya comprobadas: historial y cambios vacíos, usuarios cargados)
    const bf = (await q(`SELECT docente_grupo_matriz_backfill() AS r`))[0].r;
    console.log("Backfill docente–grupo:", JSON.stringify(bf));
    resumen._backfill = bf; resumen._correos_cancelados = cancelados;
    const deriva = await q(`SELECT u.id FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente WHERE u.rol='docente' AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id`);
    if (deriva.length) throw new Error(`historial: ${deriva.length} docente(s) con grupo vigente distinto de su asignación vigente`);
    await c.query("COMMIT");
    console.log("COMMIT. Resumen:", JSON.stringify(resumen));
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ROLLBACK:", e.message);
    await c.end(); process.exit(1);
  }
}

// verificación (también tras importar)
const mal = [];
const filasDespues = {};
for (const x of TABLAS) {
  const T = D.tablas[x.t]; if (!T) continue;
  const n = await cuenta(x.t); filasDespues[x.t] = n;
  const h = await huella(c, x, T.cols, T.pks);
  const hOrigen = T.huella;
  // la huella del origen se calculó sin «anular»; se compara contra el destino con las mismas columnas
  const ok = h.n === T.pks.length && h.h === hOrigen;
  if (!ok) mal.push(`${x.t}: destino ${h.n}/${T.pks.length} fila(s)${h.h === hOrigen ? "" : " · contenido distinto"}`);
  if (!x.semilla && n !== T.pks.length) mal.push(`${x.t}: total destino ${n} ≠ origen ${T.pks.length}`);
}
console.log("Filas destino:", JSON.stringify(filasDespues));
const act = (await q(`SELECT codigo FROM semestres WHERE activo`)).map((r) => r.codigo);
if (JSON.stringify(act) !== JSON.stringify(D.semestreActivo)) mal.push(`semestre activo ${act} ≠ ${D.semestreActivo}`);
const hist = {
  vigentes: (await q(`SELECT count(*)::int n FROM docente_grupo_matriz WHERE vigente`))[0].n,
  filas: (await q(`SELECT origen, certeza, vigente, count(*)::int n FROM docente_grupo_matriz GROUP BY 1,2,3 ORDER BY 1,2,3`)),
  incidencias: await q(`SELECT tipo, estado, count(*)::int n FROM docente_grupo_matriz_incidencias GROUP BY 1,2 ORDER BY 1,2`),
  cambios: await cuenta("docente_grupo_matriz_cambios"),
  deriva: (await q(`SELECT u.id FROM usuarios u LEFT JOIN docente_grupo_matriz a ON a.docente_id = u.id AND a.vigente WHERE u.rol='docente' AND u.grupo_matriz_id IS DISTINCT FROM a.grupo_id`)).length,
  dobles: (await q(`SELECT docente_id FROM docente_grupo_matriz WHERE vigente GROUP BY 1 HAVING count(*)>1`)).length,
  duplicados: (await q(`SELECT docente_id, grupo_id FROM docente_grupo_matriz GROUP BY 1,2,COALESCE(desde,'-infinity') HAVING count(*)>1`)).length,
};
console.log("Historial:", JSON.stringify(hist));
if (hist.deriva || hist.dobles || hist.duplicados) mal.push("historial incoherente");
// huérfanos: las FK los impiden; se confirma que todas están validadas y que no hay secuencias por debajo del máximo
const fkNo = (await q(`SELECT conrelid::regclass::text t, conname FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND NOT convalidated`));
if (fkNo.length) mal.push(`claves foráneas sin validar: ${JSON.stringify(fkNo)}`);
const seqMal = [];
for (const x of TABLAS) for (const col of x.pk.split(",")) {
  const sq = (await q(`SELECT pg_get_serial_sequence('"${x.t}"', $1) AS s`, [col]))[0].s; if (!sq) continue;
  const r = (await q(`SELECT last_value, is_called FROM ${sq}`))[0];
  const mx = (await q(`SELECT COALESCE(MAX("${col}"),0)::bigint m FROM "${x.t}"`))[0].m;
  if (Number(mx) > 0 && Number(r.last_value) < Number(mx)) seqMal.push(`${x.t}.${col}: secuencia ${r.last_value} < máximo ${mx}`);
}
if (seqMal.length) mal.push(...seqMal);
const correos = await q(`SELECT estado, count(*)::int n FROM notificacion_correos GROUP BY 1`);
console.log("Cola de correos:", JSON.stringify(correos));
if (correos.some((r) => r.estado !== "cancelado")) mal.push("hay correos sin cancelar en la cola");
console.log("Migraciones registradas:", mig);
await c.end();
if (mal.length) { console.error("VERIFICACIÓN CON DIFERENCIAS:\n - " + mal.join("\n - ")); process.exit(2); }
console.log("VERIFICACIÓN OK");
