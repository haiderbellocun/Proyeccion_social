-- ProySocial · permisos del piloto en Cloud SQL (NO se aplica automáticamente).
-- Ejecutar CONECTADO A LA BASE proysocial_piloto, DESPUÉS de las migraciones, como proysocial_migrator
-- (propietario de los objetos; necesita ser quien otorga). Idempotente.
-- Sin superusuario ni CREATE: la aplicación solo opera sobre datos.

DO $$
BEGIN
  IF current_database() <> 'proysocial_piloto' AND current_database() <> 'proysocial_piloto_ensayo' THEN
    RAISE EXCEPTION 'Base inesperada: % (se esperaba proysocial_piloto)', current_database();
  END IF;
END $$;

-- 1) Quitar a PUBLIC lo que no necesita (los roles de la app conservan lo concedido abajo)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 2) Permisos sobre lo ya creado, para cada rol de aplicación
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['proysocial_app', 'proysocial_runtime'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), r);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', r);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', r);
    -- 3) Objetos que cree proysocial_migrator en migraciones futuras
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE proysocial_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE proysocial_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE proysocial_migrator IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', r);
    -- schema_migrations: la app no la toca
    EXECUTE format('REVOKE ALL ON TABLE schema_migrations FROM %I', r);
  END LOOP;
END $$;
