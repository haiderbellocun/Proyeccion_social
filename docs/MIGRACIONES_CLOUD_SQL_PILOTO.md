# ProySocial · Preparación de migraciones en Cloud SQL (piloto)

Estado: **validado en local, NADA ejecutado en Cloud SQL.** Esperando autorización.

- Proyecto `it-fab-contenido-edu-3` · instancia `proysocial-piloto-sql` (us-east1, PostgreSQL 18.6) · base `proysocial_piloto`.
- Conexión: Cloud SQL Auth Proxy en `127.0.0.1:55432` (comprobado: el puerto acepta TCP; no se envió ninguna consulta).

## 1. Revisión de las 35 migraciones

- `backend/scripts/migrate.js` aplica una lista fija de 35 archivos de `backend/migrations/` (fase1 … fase27 + `fase28_docente_grupo_matriz.sql`), cada uno en su propia transacción, y registra el nombre en `schema_migrations`. Si falla, `ROLLBACK` y no se registra. Reejecutar es idempotente (omite lo ya registrado).
- `fase28` está tras la compuerta `PROYSOCIAL_APLICAR_FASE28=1`; sin ella se omite con aviso.
- Búsqueda en los 35 SQL: sin `CREATE EXTENSION`, `CREATE ROLE`, `GRANT`, `OWNER TO`, `SECURITY DEFINER`, `COLLATE`, `COPY`, `ALTER SYSTEM`, vistas ni tipos propios. Solo tablas, índices, funciones/triggers PL/pgSQL y datos semilla; `fase28` usa dos `CREATE TEMP TABLE … ON COMMIT DROP` (permitido a cualquier rol con `TEMPORARY`, que `PUBLIC` ya tiene).
- Por tanto **no requiere superusuario ni `cloudsqlsuperuser`**: basta que `proysocial_migrator` pueda crear objetos en `public`.

## 2. Compatibilidad PostgreSQL 18

Ensayo en una base local **desechable** (`proysocial_piloto_ensayo`, PostgreSQL 18.1, misma versión mayor que 18.6), ya eliminada junto con los roles temporales. Resultado: **25 comprobaciones, 0 fallos**:

| Comprobación | Resultado |
|---|---|
| 35 migraciones sobre base vacía, con rol sin superusuario ni CREATEDB/CREATEROLE | OK (22 tablas en `public`) |
| `schema_migrations` = 35; segunda ejecución sin reaplicar | OK |
| Existen `docente_grupo_matriz`, `…_cambios`, `…_incidencias` | OK |
| GRANTs aplicados dos veces como `proysocial_migrator` | OK (idempotentes) |
| `proysocial_app` y `proysocial_runtime`: no superusuario, SELECT, no crea tablas, no altera tablas, no lee `schema_migrations`, EXECUTE en todas las funciones, USAGE en todas las secuencias, SELECT/INSERT/UPDATE/DELETE en todas las tablas | OK |
| Tabla nueva creada luego por el migrador → la app puede insertar (default privileges) | OK |
| Flujo real: `piloto-seed.js` ejecutado con `proysocial_app` | OK (5 usuarios, 9 entregables, 3 asignaciones) |

## 3. Problemas encontrados

1. **`backend/.env` apunta a la base legada `app_proyecion`.** `db.js` usa ese archivo si la variable no está en el entorno: por eso los comandos de abajo fijan `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` y vacían `DATABASE_URL`. `.env` no define `INSTANCE_CONNECTION_NAME`/`DATABASE_URL` (verificado).
2. Las migraciones **no** crean roles ni otorgan permisos: sin los GRANT de la sección 7 la aplicación no podría operar con `proysocial_app`.
3. Las migraciones siembran datos institucionales (semestre 2026A activo, grupos y plantillas); es lo esperado.
4. Sin hallazgos de sintaxis o tipos incompatibles con PostgreSQL 18.

Archivos nuevos (sin commit): `backend/scripts/sql/piloto-grants.sql`, `backend/scripts/piloto-cloudsql-guarda.js` (solo lectura), este documento.

## 4. Comandos exactos (NO ejecutar hasta autorizar)

Antes: el proxy debe estar activo en `127.0.0.1:55432`. Terminal PowerShell **propia**, en `C:\app_Proyec_social\backend`:

```powershell
# 1) Contraseña de proysocial_migrator: solo en esta sesión, sin eco, sin archivos
$s = Read-Host "Contraseña de proysocial_migrator" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
Remove-Variable s

# 2) Variables
$env:PGHOST = "127.0.0.1"; $env:PGPORT = "55432"
$env:PGDATABASE = "proysocial_piloto"; $env:PGUSER = "proysocial_migrator"
$env:DATABASE_URL = ""; $env:INSTANCE_CONNECTION_NAME = ""

# 3) Guarda (solo lectura): aborta si base/usuario/host no son los esperados
node scripts/piloto-cloudsql-guarda.js

# 4) Backup previo (opcional pero recomendado)
gcloud sql backups create --instance=proysocial-piloto-sql --project=it-fab-contenido-edu-3

# 5) Migraciones (solo si la guarda imprimió «GUARDA OK»)
$env:PROYSOCIAL_APLICAR_FASE28 = "1"
node scripts/migrate.js

# 6) Limpiar la contraseña de la sesión
Remove-Item Env:PGPASSWORD; Remove-Item Env:PROYSOCIAL_APLICAR_FASE28
```

## 5. Variables necesarias

`PGHOST=127.0.0.1` · `PGPORT=55432` · `PGDATABASE=proysocial_piloto` · `PGUSER=proysocial_migrator` · `PGPASSWORD` (interactiva) · `DATABASE_URL` vacía · `INSTANCE_CONNECTION_NAME` vacía · `PROYSOCIAL_APLICAR_FASE28=1`. `PGSSL` no se necesita (el proxy cifra).

## 6. Verificar tablas creadas

Con la misma sesión (sin cerrar), tras migrar:

```powershell
node -e "import('pg').then(async({default:pg})=>{const c=new pg.Client();await c.connect();const q=async s=>(await c.query(s)).rows;console.log(await q(\"SELECT count(*)::int migraciones FROM schema_migrations\"));console.log(await q(\"SELECT count(*)::int tablas FROM pg_tables WHERE schemaname='public'\"));console.log(await q(\"SELECT to_regclass('docente_grupo_matriz') a, to_regclass('docente_grupo_matriz_cambios') b, to_regclass('docente_grupo_matriz_incidencias') c\"));console.log(await q(\"SELECT nombre FROM schema_migrations ORDER BY aplicado_en DESC LIMIT 3\"));await c.end()})"
```

Esperado: `migraciones: 35`, `tablas: 22`, las tres tablas del historial no nulas.

## 7. Permisos (GRANT) — `backend/scripts/sql/piloto-grants.sql` (NO aplicados)

Se ejecuta **después** de migrar, conectado a `proysocial_piloto` como `proysocial_migrator` (propietario de los objetos), por ejemplo con `psql -h 127.0.0.1 -p 55432 -U proysocial_migrator -d proysocial_piloto -f scripts/sql/piloto-grants.sql` (pedirá la contraseña de forma interactiva). Contenido:

- Aborta si `current_database()` no es `proysocial_piloto` (o la de ensayo local).
- `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
- Para `proysocial_app` y `proysocial_runtime` (los que existan): `CONNECT` en la base, `USAGE` en `public`, `SELECT/INSERT/UPDATE/DELETE` en todas las tablas, `USAGE/SELECT/UPDATE` en secuencias, `EXECUTE` en funciones.
- `ALTER DEFAULT PRIVILEGES FOR ROLE proysocial_migrator IN SCHEMA public …` con los mismos permisos para objetos futuros.
- `REVOKE ALL ON schema_migrations` a esos roles.
- Sin superusuario, sin `CREATE`, sin `ALTER`/`DROP`. `DELETE` es necesario (la app borra proyectos, grupos, etc.); las tablas de historial son inmutables por trigger.

## 8. Plan de recuperación

1. **Una migración falla:** su transacción hace `ROLLBACK`; las anteriores quedan registradas. Leer el mensaje, corregir (en repo, sin editar migraciones ya aplicadas) y volver a ejecutar `node scripts/migrate.js`; continúa desde la pendiente.
2. **Estado dudoso o base inservible (piloto con datos sintéticos):** restaurar el backup del paso 4 (`gcloud sql backups restore <ID> --restore-instance=proysocial-piloto-sql`) **o** recrear la base: `DROP DATABASE proysocial_piloto; CREATE DATABASE proysocial_piloto OWNER proysocial_migrator;` (con un usuario administrador de la instancia), y repetir sección 4 + GRANTs + `piloto-seed.js`.
3. **Reversión solo de `fase28`:** bloque «REVERSIÓN» del propio archivo, únicamente si no hay cambios registrados en el historial, y borrando su fila de `schema_migrations`.
4. Cualquier error de conexión/autenticación: no reintentar en bucle; revisar proxy y rol. Nunca apuntar a otra base.

## Autorización pendiente

Ejecutar las secciones 4 (migrar) y 7 (GRANT) en Cloud SQL **requiere tu confirmación explícita**.
