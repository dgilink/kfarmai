$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$startOutput = supabase start 2>&1 | Out-String
$startExit = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($startExit -ne 0) { throw "Local Supabase start failed: $startOutput" }

$dbContainer = @(& $docker ps --format '{{.Names}}' | Where-Object { $_ -eq 'supabase_db_kfarmai-v3-local' })[0]
if (-not $dbContainer) { throw 'Expected local Supabase DB container not found' }
if ($dbContainer -ne 'supabase_db_kfarmai-v3-local') { throw 'Refusing to reset an unexpected database container' }

$resetSql = @'
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on schema public to postgres, service_role;
truncate table supabase_migrations.schema_migrations;
'@
$resetSql | & $docker exec -i $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Local public schema reset failed' }

foreach ($path in @('supabase/tests/phase2b-local-base.sql', 'supabase/tests/phase4a-community-base.sql')) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $containerPath = '/tmp/kfarmai-' + [IO.Path]::GetFileName($path)
  & $docker cp $resolved "${dbContainer}:$containerPath" *> $null
  if ($LASTEXITCODE -ne 0) { throw "Local fixture copy failed: $path" }
  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerPath *> $null
  $fixtureExit = $LASTEXITCODE
  & $docker exec $dbContainer rm -f $containerPath *> $null
  $ErrorActionPreference = $savedErrorActionPreference
  if ($fixtureExit -ne 0) { throw "Local fixture apply failed: $path" }
}

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$migrationOutput = supabase migration up --local --include-all 2>&1 | Out-String
$migrationExit = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($migrationExit -ne 0) { throw "Local migration apply failed: $migrationOutput" }

$versions = (& $docker exec $dbContainer psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
  "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version like '202610%';").Trim()
$expected = '20261002090000,20261002091000,20261002110000,20261002130000,20261004100000,20261004133000'
if ($versions -ne $expected) { throw "Unexpected local migration history: $versions" }

Write-Output 'Phase 5D-2A local fixture reset and migration apply: 6/6 PASS'
