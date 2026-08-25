param(
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$backendDir = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $backendDir ".env"
$migrationsDir = Join-Path $backendDir "migrations"
$psql = Join-Path $PostgresBin "psql.exe"
$createdb = Join-Path $PostgresBin "createdb.exe"

if (-not (Test-Path -LiteralPath $psql)) {
  throw "No se encontro psql.exe en: $psql"
}

if (-not (Test-Path -LiteralPath $createdb)) {
  throw "No se encontro createdb.exe en: $createdb"
}

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "No existe el archivo de configuracion: $envPath"
}

$config = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) {
    continue
  }

  if ($trimmed -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
    $config[$Matches[1]] = $Matches[2]
  }
}

$required = @("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD")
foreach ($key in $required) {
  if (-not $config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($config[$key])) {
    throw "Falta $key en $envPath"
  }
}

$hostName = $config["PGHOST"]
$port = $config["PGPORT"]
$database = $config["PGDATABASE"]
$user = $config["PGUSER"]

$migrationFiles = @(
  "fase1_esquema_base.sql",
  "fase2_indicadores.sql",
  "fase2b_perfil_por_docente.sql",
  "fase2c_catalogo_sin_duplicados.sql",
  "fase3a_evidencia_entregable.sql",
  "add_entregable_completado.sql",
  "fase4_convenios_split.sql",
  "fase4_matriz_grupos_plantillas.sql",
  "fase4_seed_grupos_plantillas.sql",
  "fase5_reportes_revision.sql",
  "fase6_reportes_campos_docente.sql",
  "fase7_grupo7.sql",
  "fase7_grupo7_plantillas.sql",
  "fase7_fix_grupos_2_6_13.sql",
  "fase7_fix_grupo2_completo.sql",
  "fase7_grupo15_plantillas_completas.sql",
  "fase8_borrador_estado.sql",
  "fase9_grupos_semestre.sql",
  "fase10_fix_estado_revision.sql",
  "fase13_google_auth_sin_password.sql",
  "fase14_notificaciones.sql",
  "fase15_integridad_semestres.sql",
  "fase16_integridad_programas.sql"
)

foreach ($migration in $migrationFiles) {
  $migrationPath = Join-Path $migrationsDir $migration
  if (-not (Test-Path -LiteralPath $migrationPath)) {
    throw "No se encontro la migracion requerida: $migrationPath"
  }
}

$previousPassword = $env:PGPASSWORD
$previousEncoding = $env:PGCLIENTENCODING

try {
  $env:PGPASSWORD = $config["PGPASSWORD"]
  $env:PGCLIENTENCODING = "UTF8"

  $databaseLiteral = $database.Replace("'", "''")
  $exists = & $psql `
    -w `
    -h $hostName `
    -p $port `
    -U $user `
    -d postgres `
    -Atc "SELECT 1 FROM pg_database WHERE datname = '$databaseLiteral';"

  if ($LASTEXITCODE -ne 0) {
    throw "No fue posible consultar el servidor PostgreSQL."
  }

  if ($exists -ne "1") {
    Write-Host "Creando base de datos '$database'..."
    & $createdb `
      -w `
      -h $hostName `
      -p $port `
      -U $user `
      --encoding=UTF8 `
      $database

    if ($LASTEXITCODE -ne 0) {
      throw "No fue posible crear la base de datos '$database'."
    }
  } else {
    Write-Host "La base de datos '$database' ya existe."
  }

  & $psql `
    -w `
    -h $hostName `
    -p $port `
    -U $user `
    -d $database `
    -v ON_ERROR_STOP=1 `
    -c @"
CREATE TABLE IF NOT EXISTS schema_migrations (
  nombre TEXT PRIMARY KEY,
  aplicado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
"@

  if ($LASTEXITCODE -ne 0) {
    throw "No fue posible preparar el control de migraciones."
  }

  foreach ($migration in $migrationFiles) {
    $migrationLiteral = $migration.Replace("'", "''")
    $applied = & $psql `
      -w `
      -h $hostName `
      -p $port `
      -U $user `
      -d $database `
      -Atc "SELECT 1 FROM schema_migrations WHERE nombre = '$migrationLiteral';"

    if ($LASTEXITCODE -ne 0) {
      throw "No fue posible consultar el estado de la migracion $migration."
    }

    if ($applied -eq "1") {
      Write-Host "Omitida (ya aplicada): $migration"
      continue
    }

    Write-Host "Aplicando: $migration"
    $migrationPath = Join-Path $migrationsDir $migration
    & $psql `
      -w `
      -h $hostName `
      -p $port `
      -U $user `
      -d $database `
      -v ON_ERROR_STOP=1 `
      --single-transaction `
      -f $migrationPath `
      -c "INSERT INTO schema_migrations (nombre) VALUES ('$migrationLiteral');"

    if ($LASTEXITCODE -ne 0) {
      throw "Fallo la migracion $migration. La transaccion fue revertida."
    }
  }

  Write-Host "Base de datos '$database' preparada correctamente."
} finally {
  if ($null -eq $previousPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPassword
  }

  if ($null -eq $previousEncoding) {
    Remove-Item Env:PGCLIENTENCODING -ErrorAction SilentlyContinue
  } else {
    $env:PGCLIENTENCODING = $previousEncoding
  }
}
