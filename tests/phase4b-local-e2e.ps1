$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$phase4a = & powershell -NoProfile -ExecutionPolicy Bypass -File 'tests/phase4a-local-e2e.ps1' 2>&1 | Out-String
$ErrorActionPreference = $savedErrorActionPreference
if ($LASTEXITCODE -ne 0) { throw "Phase 4A prerequisite failed: $phase4a" }

$ErrorActionPreference = 'Continue'
$statusJson = supabase status -o json 2>$null | Out-String
$statusExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($statusExitCode -ne 0) { throw 'Local Supabase status check failed' }
$status = $statusJson | ConvertFrom-Json
$api = [string]$status.API_URL
$anon = [string]$status.ANON_KEY
$dbContainer = @(& $docker ps --format '{{.Names}}' | Where-Object { $_ -eq 'supabase_db_kfarmai-v3-local' })[0]
if (-not $dbContainer) { throw 'Local Supabase DB container not found' }

function Invoke-SqlFile([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $containerPath = '/tmp/kfarmai-' + [IO.Path]::GetFileName($path)
  & $docker cp $resolved "${dbContainer}:$containerPath" *> $null
  if ($LASTEXITCODE -ne 0) { throw "SQL copy failed: $path" }
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerPath *> $null
  $exitCode = $LASTEXITCODE
  & $docker exec $dbContainer rm -f $containerPath *> $null
  if ($exitCode -ne 0) { throw "SQL failed: $path" }
}

function Invoke-Sql([string]$sql) {
  $result = $sql | & $docker exec -i $dbContainer psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'SQL command failed' }
  return ($result | Out-String).Trim()
}

function Invoke-Rpc([string]$token, [string[]]$postIds) {
  $headers = @{ apikey = $anon; Authorization = "Bearer $token" }
  $body = @{ target_post_ids = $postIds } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method Post -Uri "$api/rest/v1/rpc/community_feed_metrics" -Headers $headers -ContentType 'application/json' -Body $body
}

$postIds = 1..5 | ForEach-Object { "44000000-0000-4000-8000-{0:D12}" -f $_ }
$before = Invoke-Sql "select count(*)||'|'||(select count(*) from public.comments where post_id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]))||'|'||coalesce(sum(cardinality(image_urls)),0) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);"
Invoke-SqlFile 'supabase/migrations/20261002130000_v3_community_feed_metrics.sql'
Start-Sleep -Milliseconds 800
$after = Invoke-Sql "select count(*)||'|'||(select count(*) from public.comments where post_id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]))||'|'||coalesce(sum(cardinality(image_urls)),0) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);"

$checks = [System.Collections.Generic.List[bool]]::new()
$failed = [System.Collections.Generic.List[int]]::new()
function Check([bool]$value) { $checks.Add($value); if (-not $value) { $failed.Add($checks.Count) } }

Check ($before -eq '5|2|3')
Check ($after -eq $before)
Check ((Invoke-Sql "select count(*) from public.posts where id='$($postIds[4])'::uuid and category_id is null;") -eq '1')
Check ((Invoke-Sql "select count(*) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])']::uuid[]) and category_id is not null;") -eq '4')
Check ((Invoke-Sql "select count(*) from pg_proc where proname='community_feed_metrics';") -eq '1')

$anonRows = Invoke-Rpc $anon @($postIds[0],$postIds[2])
Check ($anonRows.Count -eq 2)
$post1 = $anonRows[0]
$post3 = $anonRows[1]
Check ($post1.post_id -eq $postIds[0] -and $post3.post_id -eq $postIds[2])
Check ([int]($post1.comment_count) -eq 1)
Check ([int]($post1.same_symptom_count) -eq 0)
Check ([int]($post3.helpful_count) -eq 1)
Check (-not [bool]$post1.same_symptom_active -and -not [bool]$post1.helpful_active -and -not [bool]$post1.saved)
Check ((Invoke-Sql "select count(*) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])']::uuid[]) and category_id is null;") -eq '0')
Check ((Invoke-Sql "select count(*) from public.posts where id='$($postIds[4])'::uuid;") -eq '1')

$passed = @($checks | Where-Object { $_ }).Count
if ($passed -ne $checks.Count) { throw "Phase 4B local E2E failed: $passed/$($checks.Count); checks $($failed -join ',')" }
Write-Output "Phase 4B local E2E: $passed/$($checks.Count) PASS; posts 5/5, comments 2/2, images 3/3"
