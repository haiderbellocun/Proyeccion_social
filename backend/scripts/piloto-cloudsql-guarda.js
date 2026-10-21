// Guarda previa a migrar/otorgar en Cloud SQL del piloto: solo lectura. Aborta si la conexión no es la esperada.
// Uso: node scripts/piloto-cloudsql-guarda.js   (con PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD en el entorno)
import pg from "pg";

const esperado = { base: "proysocial_piloto", usuario: "proysocial_migrator", host: "127.0.0.1", puerto: "55432" };
const prohibidas = ["proysocial_dev", "proysocial_test", "app_proyecion"];
const falla = (m) => { console.error(`GUARDA: ${m}`); process.exit(1); };

if (process.env.INSTANCE_CONNECTION_NAME) falla("INSTANCE_CONNECTION_NAME no debe estar definida (se usa el proxy local).");
if (process.env.DATABASE_URL) falla("DATABASE_URL debe estar vacía.");
if (process.env.PGHOST !== esperado.host || process.env.PGPORT !== esperado.puerto) falla(`PGHOST/PGPORT deben ser ${esperado.host}:${esperado.puerto} (proxy).`);
if (process.env.PGDATABASE !== esperado.base || prohibidas.includes(process.env.PGDATABASE)) falla(`PGDATABASE debe ser ${esperado.base}.`);
if (process.env.PGUSER !== esperado.usuario) falla(`PGUSER debe ser ${esperado.usuario}.`);
if (!process.env.PGPASSWORD) falla("PGPASSWORD no está definida en esta sesión (introdúcela de forma interactiva).");

const c = new pg.Client({ connectionTimeoutMillis: 10000 });
await c.connect();
const { rows: [r] } = await c.query(`SELECT current_database() AS base, current_user AS usuario, version() AS version, inet_server_addr()::text AS ip,
  (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS tablas,
  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super,
  has_schema_privilege(current_user, 'public', 'CREATE') AS puede_crear`);
await c.end();
if (r.base !== esperado.base) falla(`base conectada ${r.base} ≠ ${esperado.base}.`);
if (r.usuario !== esperado.usuario) falla(`usuario conectado ${r.usuario} ≠ ${esperado.usuario}.`);
if (!r.puede_crear) falla("proysocial_migrator no puede crear objetos en el esquema public.");
console.log(`GUARDA OK · base=${r.base} · usuario=${r.usuario} · ${r.version.split(",")[0]} · tablas en public=${r.tablas}`);
