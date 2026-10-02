$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$startOutput = supabase start 2>&1 | Out-String
$startExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($startExitCode -ne 0) { throw "Local Supabase start failed: $startOutput" }

$dbContainer = @(& $docker ps --format '{{.Names}}' | Where-Object { $_ -like 'supabase_db_*' })[0]
if (-not $dbContainer) { throw 'Local Supabase DB container not found' }

$baseSql = Get-Content -LiteralPath 'supabase/tests/phase2b-local-base.sql' -Raw
$baseSql | & $docker exec -i $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Local base schema failed' }

$ErrorActionPreference = 'Continue'
$migrationOutput = supabase migration up --local 2>&1 | Out-String
$migrationExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($migrationExitCode -ne 0) { throw "Local migration failed: $migrationOutput" }

Write-Output 'Phase 2B local setup: Supabase started, base schema ready, migrations applied PASS'
