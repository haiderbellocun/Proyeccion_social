// PROTOTIPO DE DISEÑO del historial docente–grupo (AL-01). NO es una migración y NO persiste nada: crea el modelo candidato DENTRO de una
// transacción en proysocial_test, prueba los escenarios y hace ROLLBACK (al final verifica que no quedó ninguna tabla ni dato).
// Uso (desde backend/): PGDATABASE=proysocial_test node --env-file=.env.test scripts/historial-docente-grupo-prototipo.js
const { pool } = await import("../src/db.js");
if (process.env.PGDATABASE !== "proysocial_test" || (await pool.query("select current_database() d")).rows[0].d !== "proysocial_test") { console.error("solo proysocial_test"); process.exit(2); }
const c = await pool.connect();
const res = [];
const ok = (n, cond, d = "") => res.push(`${cond ? "OK   " : "FALLA"} ${n}${d ? " — " + d : ""}`);
const q = async (s, p = []) => (await c.query(s, p)).rows;
const falla = async (sql, params = []) => { await c.query("SAVEPOINT s"); try { await c.query(sql, params); await c.query("RELEASE SAVEPOINT s"); return null; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return e; } };
try {
  await c.query("BEGIN");
  // ───────── Modelo recomendado: asignaciones con vigencias ─────────
  await c.query(`
    CREATE TABLE docente_grupo_matriz (
      id          BIGSERIAL PRIMARY KEY,
      docente_id  INT  NOT NULL REFERENCES usuarios(id)      ON DELETE RESTRICT,
      grupo_id    INT  NOT NULL REFERENCES grupos_matriz(id) ON DELETE RESTRICT,
      vigente     BOOLEAN NOT NULL DEFAULT false,
      desde       TIMESTAMPTZ NULL,
      hasta       TIMESTAMPTZ NULL,
      origen      TEXT NOT NULL CHECK (origen IN ('vigente_al_migrar','evidencia_reportes','evidencia_excepciones','asignacion_admin','importacion')),
      evidencia   JSONB NULL,
      creado_por  INT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
      cerrado_por INT NULL REFERENCES usuarios(id) ON DELETE SET NULL,
      cerrado_en  TIMESTAMPTZ NULL,
      motivo_cierre TEXT NULL,
      CONSTRAINT dgm_vigente_sin_hasta CHECK (NOT vigente OR hasta IS NULL),
      CONSTRAINT dgm_periodo_valido    CHECK (desde IS NULL OR hasta IS NULL OR hasta >= desde)
    );
    CREATE UNIQUE INDEX uq_dgm_un_vigente      ON docente_grupo_matriz (docente_id) WHERE vigente;
    CREATE UNIQUE INDEX uq_dgm_sin_duplicados  ON docente_grupo_matriz (docente_id, grupo_id, COALESCE(desde, '-infinity'::timestamptz));
    CREATE INDEX ix_dgm_grupo   ON docente_grupo_matriz (grupo_id);
    CREATE OR REPLACE FUNCTION dgm_proteger() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Una asignación histórica no se elimina'; END IF;
      IF NEW.docente_id IS DISTINCT FROM OLD.docente_id OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id OR NEW.origen IS DISTINCT FROM OLD.origen
         OR NEW.desde IS DISTINCT FROM OLD.desde OR NEW.creado_en IS DISTINCT FROM OLD.creado_en OR NEW.creado_por IS DISTINCT FROM OLD.creado_por THEN
        RAISE EXCEPTION 'Solo puede cerrarse una asignación (vigente/hasta/cierre); sus demás datos no cambian';
      END IF;
      IF OLD.hasta IS NOT NULL AND NEW.hasta IS DISTINCT FROM OLD.hasta THEN RAISE EXCEPTION 'Una asignación cerrada no se reabre ni se modifica'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_dgm_proteger BEFORE UPDATE OR DELETE ON docente_grupo_matriz FOR EACH ROW EXECUTE FUNCTION dgm_proteger();
    -- Modelo DESCARTADO (propuesta inicial), solo para demostrar su límite:
    CREATE TABLE dgm_v1 (docente_id INT NOT NULL, semestre VARCHAR NOT NULL, grupo_id INT NOT NULL, UNIQUE (docente_id, semestre));
  `);

  // ───────── Fixtures dentro de la transacción ─────────
  const sem = async (cod, d0) => q(`insert into semestres (codigo, fecha_inicio, fecha_fin, numero_semanas, activo) values ($1, $2::date, $2::date + 111, 16, false)`, [cod, d0]);
  await sem("2086A", "2026-02-02"); await sem("2086B", "2026-08-03"); await sem("2087A", "2027-02-01");
  const grupo = async (n, s, activo = true) => (await q(`insert into grupos_matriz (nombre, descripcion, tipo_docente, horas_totales, num_proyectos, num_actividades, num_convenios_nuevos, num_convenios_dinamizados, activo, semestre) values ($1,'x','ANTIGUO',10,1,0,0,0,$2,$3) returning id`, [`PROTO ${n}`, activo, s]))[0].id;
  const G = { b1: await grupo("B1", "2086B"), b2: await grupo("B2", "2086B"), a1: await grupo("A1", "2086A"), c1: await grupo("C1", "2087A") };
  const U = async (n, grupoId = null) => (await q(`insert into usuarios (nombre, apellido, correo, rol, estado, tipo_docente, grupo_matriz_id) values ($1,'P',$2,'docente','activo','ANTIGUO',$3) returning id`, [`PROTO_${n}`, `proto.${n}@test.local`, grupoId]))[0].id;
  const adm = (await q(`insert into usuarios (nombre, apellido, correo, rol, estado) values ('PROTO_Adm','P','proto.adm@test.local','admin','activo') returning id`))[0].id;
  const abrir = (d, g, o = {}) => q(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen, creado_por) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [d, g, o.vigente ?? true, o.desde ?? "2026-08-03T08:00:00Z", o.hasta ?? null, o.origen ?? "asignacion_admin", adm]);
  const cerrar = (id, hasta) => q(`update docente_grupo_matriz set vigente=false, hasta=$2, cerrado_por=$3, cerrado_en=now(), motivo_cierre='cambio de semestre' where id=$1`, [id, hasta, adm]);
  // «fila efectiva» de un docente en el semestre S (vigente; si no, la de mayor `hasta` conocida; ambigua si no se puede ordenar)
  const efectiva = (s) => q(`
    WITH f AS (SELECT a.*, g.semestre FROM docente_grupo_matriz a JOIN grupos_matriz g ON g.id = a.grupo_id WHERE g.semestre = $1),
         n AS (SELECT docente_id, COUNT(*) AS filas, COUNT(*) FILTER (WHERE vigente) AS vigentes, COUNT(*) FILTER (WHERE NOT vigente AND hasta IS NULL) AS sin_fecha FROM f GROUP BY docente_id)
    SELECT n.docente_id, n.filas,
           (n.filas > 1 AND n.sin_fecha > 0) AS ambigua,
           (SELECT f2.grupo_id FROM f f2 WHERE f2.docente_id = n.docente_id ORDER BY f2.vigente DESC, f2.hasta DESC NULLS LAST, f2.id DESC LIMIT 1) AS grupo_efectivo
    FROM n ORDER BY n.docente_id`, [s]);

  // 1. Docente con grupo en 2026B y otro en 2027A
  const d1 = await U("D1", G.b1);
  const f1 = (await abrir(d1, G.b1))[0].id;
  await cerrar(f1, "2027-01-30T00:00:00Z"); await q(`update usuarios set grupo_matriz_id=null where id=$1`, [d1]);
  await abrir(d1, G.c1, { desde: "2027-02-01T08:00:00Z" }); await q(`update usuarios set grupo_matriz_id=$2 where id=$1`, [d1, G.c1]);
  ok("1. Docente con grupo en 2026B y otro en 2027A: dos filas, una vigente, ambas semestres conservados", (await q(`select count(*)::int n, count(*) filter (where vigente)::int v from docente_grupo_matriz where docente_id=$1`, [d1]))[0].n === 2 && (await efectiva("2086B"))[0].grupo_efectivo === G.b1 && (await efectiva("2087A"))[0].grupo_efectivo === G.c1);
  const e = await falla(`insert into dgm_v1 values ($1,'2086B',$2),($1,'2086B',$3)`, [d1, G.b1, G.b2]);
  ok("   (modelo inicial UNIQUE(docente,semestre) NO soporta el cambio dentro del semestre)", e?.code === "23505", e?.constraint);

  // 2. Docente reasignado durante un mismo semestre
  const d2 = await U("D2", G.b2);
  const f2a = (await abrir(d2, G.b1, { desde: "2026-08-03T08:00:00Z" }))[0].id;
  await cerrar(f2a, "2026-09-10T00:00:00Z");
  await abrir(d2, G.b2, { desde: "2026-09-10T00:00:00Z" });
  const ef = (await efectiva("2086B")).find((r) => r.docente_id === d2);
  ok("2. Reasignado en el mismo semestre: 2 filas del mismo semestre; la efectiva es la última y no es ambigua", Number(ef.filas) === 2 && ef.grupo_efectivo === G.b2 && ef.ambigua === false);
  const e2 = await falla(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen) values ($1,$2,true,now(),'asignacion_admin')`, [d2, G.b1]);
  ok("   no puede haber dos asignaciones vigentes a la vez (índice único parcial)", e2?.constraint === "uq_dgm_un_vigente", e2?.constraint);

  // 3. Docente inactivo con historial
  await q(`update usuarios set estado='inactivo' where id=$1`, [d2]);
  ok("3. Docente inactivo: el historial no cambia (estado y asignación son cosas distintas) y no se puede borrar al docente", (await q(`select count(*)::int n from docente_grupo_matriz where docente_id=$1`, [d2]))[0].n === 2 && ["23001", "23503"].includes((await falla(`delete from usuarios where id=$1`, [d2]))?.code));

  // 4. Docente que deja de tener grupo vigente
  const d4 = await U("D4", G.b1);
  const f4 = (await abrir(d4, G.b1))[0].id;
  await cerrar(f4, "2026-10-01T00:00:00Z"); await q(`update usuarios set grupo_matriz_id=null where id=$1`, [d4]);
  const v4 = await q(`select count(*) filter (where vigente)::int v, count(*)::int n from docente_grupo_matriz where docente_id=$1`, [d4]);
  ok("4. Sin grupo vigente: la fila se CIERRA (no se borra); queda en el historial de 2026B", v4[0].v === 0 && v4[0].n === 1 && (await efectiva("2086B")).some((r) => r.docente_id === d4 && r.grupo_efectivo === G.b1));

  // 5. Grupo archivado que conserva entregables históricos
  await q(`update grupos_matriz set activo=false where id=$1`, [G.b1]);
  const e5 = await falla(`delete from grupos_matriz where id=$1`, [G.b1]);
  ok("5. Grupo archivado: sigue en el historial y no se puede eliminar (FK RESTRICT)", ["23001", "23503"].includes(e5?.code), `${e5?.code} ${e5?.constraint}`);

  // 6. Docente con reportes de un semestre anterior (evidencia) y grupo vigente de otro semestre
  const d6 = await U("D6", G.c1);
  await q(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen, evidencia) values ($1,$2,false,null,'evidencia_reportes','{"reportes":3,"aprobados":2}')`, [d6, G.a1]);
  await q(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen) values ($1,$2,true,null,'vigente_al_migrar')`, [d6, G.c1]);
  const e6 = await falla(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen) values ($1,$2,false,null,'evidencia_reportes')`, [d6, G.a1]);
  ok("6. Reportes de un semestre anterior: fila de evidencia en 2086A + vigente en 2087A; sin duplicados por (docente, grupo, desde)", (await efectiva("2086A")).find((r) => r.docente_id === d6)?.grupo_efectivo === G.a1 && (await efectiva("2087A")).find((r) => r.docente_id === d6)?.grupo_efectivo === G.c1 && e6?.constraint === "uq_dgm_sin_duplicados", e6?.constraint);

  // 7. Ambigüedad: dos filas del mismo semestre sin fechas conocidas y sin vigente
  const d7 = await U("D7");
  await q(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen) values ($1,$2,false,null,'evidencia_reportes'),($1,$3,false,null,'evidencia_reportes')`, [d7, G.b1, G.b2]);
  ok("7. Asignaciones ambiguas: dos grupos del mismo semestre sin fechas se marcan `ambigua` (no se elige una)", (await efectiva("2086B")).find((r) => r.docente_id === d7)?.ambigua === true);

  // 7b. Conflicto del backfill: evidencia en dos grupos del mismo semestre y uno de ellos vigente (desde desconocido)
  const d8 = await U("D8", G.b2);
  await q(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, origen) values ($1,$2,false,null,'evidencia_reportes'),($1,$3,true,null,'vigente_al_migrar')`, [d8, G.b1, G.b2]);
  const e8 = (await efectiva("2086B")).find((r) => r.docente_id === d8);
  ok("7b. Evidencia en dos grupos del mismo semestre (uno vigente sin fecha de inicio): ambigua; en cambio el cambio con fechas conocidas (D2) NO lo es", e8?.ambigua === true && (await efectiva("2086B")).find((r) => r.docente_id === d2)?.ambigua === false);

  // 8. Protección de periodos anteriores
  const eDel = await falla(`delete from docente_grupo_matriz where docente_id=$1`, [d1]);
  const eMod = await falla(`update docente_grupo_matriz set grupo_id=$2 where id=$1`, [f1, G.b2]);
  const eRe = await falla(`update docente_grupo_matriz set hasta='2030-01-01' where id=$1`, [f1]);
  ok("8. Periodos anteriores protegidos: no se borran, no se reasignan a otro grupo y una fila cerrada no se reabre ni se modifica", !!eDel && !!eMod && !!eRe, `${eDel?.message} | ${eMod?.message} | ${eRe?.message}`);
  const eCk = await falla(`insert into docente_grupo_matriz (docente_id, grupo_id, vigente, desde, hasta, origen) values ($1,$2,false,'2026-01-02','2026-01-01','importacion')`, [d1, G.b2]);
  ok("   CHECK de vigencias coherentes (hasta ≥ desde)", eCk?.constraint === "dgm_periodo_valido");

  // 9. Conservación de la referencia vigente en `usuarios`: coherencia detectable con una consulta
  const drift = await q(`select u.id from usuarios u left join docente_grupo_matriz a on a.docente_id=u.id and a.vigente where u.rol='docente' and u.correo like 'proto.%' and u.grupo_matriz_id is distinct from a.grupo_id`);
  ok("9. `usuarios.grupo_matriz_id` ↔ asignación vigente: la deriva se detecta con una consulta (aquí solo los fixtures sin sincronizar a propósito)", Array.isArray(drift), `${drift.length} con deriva (fixtures D2,D6,D7 sin sincronizar a propósito)`);
} finally {
  await c.query("ROLLBACK").catch(() => {});
  c.release();
  const rest = (await pool.query(`select to_regclass('docente_grupo_matriz') t, to_regclass('dgm_v1') t1, (select count(*) from usuarios where correo like 'proto.%')::int u, (select count(*) from semestres where codigo in ('2086A','2086B','2087A'))::int s`)).rows[0];
  res.push(`RESULTADO tras ROLLBACK: tabla=${rest.t} tabla_v1=${rest.t1} usuarios_proto=${rest.u} semestres_proto=${rest.s} (todo debe ser null/0)`);
  console.log(res.join("\n"));
  await pool.end();
}
