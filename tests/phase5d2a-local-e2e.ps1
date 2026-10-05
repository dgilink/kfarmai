$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$statusJson = supabase status -o json 2>$null | Out-String
$statusExit = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($statusExit -ne 0) { throw 'Local Supabase status check failed' }
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

function New-LocalUser([string]$label, [string]$stamp, [string]$password) {
  $body = @{ email = "$label-$stamp@local.test"; password = $password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$api/auth/v1/signup" -Headers @{ apikey = $anon; Authorization = "Bearer $anon" } -ContentType 'application/json' -Body $body
}

function Invoke-Api([string]$method, [string]$path, [string]$token, $body = $null, [hashtable]$extra = @{}) {
  $headers = @{ apikey = $anon; Authorization = "Bearer $token" }
  foreach ($key in $extra.Keys) { $headers[$key] = $extra[$key] }
  $arguments = @{ UseBasicParsing = $true; Method = $method; Uri = "$api$path"; Headers = $headers }
  if ($null -ne $body) {
    $arguments.ContentType = 'application/json'
    $arguments.Body = ($body | ConvertTo-Json -Depth 8 -Compress)
  }
  try {
    $response = Invoke-WebRequest @arguments
    return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = [string]$response.Content }
  } catch {
    $response = $_.Exception.Response
    if (-not $response) { throw }
    return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = [string]$_.ErrorDetails.Message }
  }
}

if ((Invoke-Sql "select to_regclass('public.community_user_roles') is not null and to_regprocedure('public.community_interaction_allowed(uuid,uuid)') is not null;") -ne 't') {
  throw 'Phase 4C local prerequisite is missing; run tests/phase4c-local-e2e.ps1 first'
}

# Recreate the exact unsafe Production drift before applying the hardening layer.
# This proves permissive-policy OR combinations and broad anon grants are removed.
Invoke-Sql @"
grant all on table public.posts, public.comments to anon;
drop policy if exists production_legacy_broad_select on public.comments;
create policy production_legacy_broad_select on public.comments for select using (true);
drop policy if exists production_legacy_null_owner_insert on public.posts;
create policy production_legacy_null_owner_insert on public.posts for insert with check (auth.uid() = user_id or user_id is null);
drop policy if exists production_legacy_ai_spoof_insert on public.comments;
create policy production_legacy_ai_spoof_insert on public.comments for insert with check (auth.uid() = user_id or is_ai = true);
"@ | Out-Null

Invoke-SqlFile 'supabase/migrations/20261004133000_v3_production_rls_hardening.sql'
Start-Sleep -Milliseconds 900

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'LocalOnly-' + [guid]::NewGuid().ToString('N') + '!aA1'
$userA = New-LocalUser 'phase5d2a-a' $stamp $password
$userB = New-LocalUser 'phase5d2a-b' $stamp $password
$userC = New-LocalUser 'phase5d2a-c' $stamp $password
$moderator = New-LocalUser 'phase5d2a-mod' $stamp $password

$postId = '5d2a0000-0000-4000-8000-000000000001'
$publicCommentId = '5d2a0000-0000-4000-8000-000000000002'
$secretCommentId = '5d2a0000-0000-4000-8000-000000000003'
Invoke-Sql "delete from public.comments where post_id='$postId'; delete from public.posts where id='$postId'; delete from public.community_user_roles where user_id='$($moderator.user.id)'; insert into public.community_user_roles(user_id, role) values('$($moderator.user.id)', 'moderator');" | Out-Null

$checks = [Collections.Generic.List[bool]]::new()
$failed = [Collections.Generic.List[int]]::new()
function Check([bool]$value) { $checks.Add($value); if (-not $value) { $failed.Add($checks.Count) } }

$anonPost = Invoke-Api 'POST' '/rest/v1/posts' $anon @{ id=$postId; user_id=$null; title='anon'; content='denied' }
Check ($anonPost.StatusCode -ge 400)

$ownerPost = Invoke-Api 'POST' '/rest/v1/posts' ([string]$userA.access_token) @{ id=$postId; user_id=[string]$userA.user.id; title='secure fixture'; content='owner content' } @{ Prefer='return=minimal' }
Check ($ownerPost.StatusCode -in 200,201)

$nullOwner = Invoke-Api 'POST' '/rest/v1/posts' ([string]$userA.access_token) @{ user_id=$null; title='null owner'; content='denied' }
$spoofOwner = Invoke-Api 'POST' '/rest/v1/posts' ([string]$userA.access_token) @{ user_id=[string]$userB.user.id; title='spoof owner'; content='denied' }
Check ($nullOwner.StatusCode -ge 400)
Check ($spoofOwner.StatusCode -ge 400)

$anonUpdate = Invoke-Api 'PATCH' "/rest/v1/posts?id=eq.$postId" $anon @{ title='anon hacked' }
$crossUpdate = Invoke-Api 'PATCH' "/rest/v1/posts?id=eq.$postId" ([string]$userB.access_token) @{ title='cross hacked' }
Check ($anonUpdate.StatusCode -ge 400 -and (Invoke-Sql "select title from public.posts where id='$postId';") -eq 'secure fixture')
Check ((Invoke-Sql "select title from public.posts where id='$postId';") -eq 'secure fixture')

$anonDelete = Invoke-Api 'DELETE' "/rest/v1/posts?id=eq.$postId" $anon
$crossDelete = Invoke-Api 'DELETE' "/rest/v1/posts?id=eq.$postId" ([string]$userB.access_token)
Check ($anonDelete.StatusCode -ge 400 -and (Invoke-Sql "select count(*) from public.posts where id='$postId';") -eq '1')
Check ((Invoke-Sql "select count(*) from public.posts where id='$postId';") -eq '1')

$anonComment = Invoke-Api 'POST' '/rest/v1/comments' $anon @{ post_id=$postId; user_id=$null; content='anon ai spoof'; is_ai=$true }
$normalComment = Invoke-Api 'POST' '/rest/v1/comments' ([string]$userB.access_token) @{ id=$publicCommentId; post_id=$postId; user_id=[string]$userB.user.id; content='public marker'; is_ai=$false; is_secret=$false } @{ Prefer='return=minimal' }
$spoofCommentOwner = Invoke-Api 'POST' '/rest/v1/comments' ([string]$userB.access_token) @{ post_id=$postId; user_id=[string]$userA.user.id; content='owner spoof'; is_ai=$false }
$spoofAi = Invoke-Api 'POST' '/rest/v1/comments' ([string]$userB.access_token) @{ post_id=$postId; user_id=[string]$userB.user.id; content='ai spoof'; is_ai=$true }
$secretComment = Invoke-Api 'POST' '/rest/v1/comments' ([string]$userB.access_token) @{ id=$secretCommentId; post_id=$postId; user_id=[string]$userB.user.id; content='secret marker'; is_ai=$false; is_secret=$true } @{ Prefer='return=minimal' }
Check ($anonComment.StatusCode -ge 400)
Check ($normalComment.StatusCode -in 200,201)
Check ($spoofCommentOwner.StatusCode -ge 400)
Check ($spoofAi.StatusCode -ge 400)
Check ($secretComment.StatusCode -in 200,201)

$selectPath = "/rest/v1/comments?select=id,content,is_secret&post_id=eq.$postId&order=id.asc"
$anonRows = (Invoke-Api 'GET' $selectPath $anon).Content | ConvertFrom-Json
$unrelatedRows = (Invoke-Api 'GET' $selectPath ([string]$userC.access_token)).Content | ConvertFrom-Json
$authorRows = (Invoke-Api 'GET' $selectPath ([string]$userB.access_token)).Content | ConvertFrom-Json
$ownerRows = (Invoke-Api 'GET' $selectPath ([string]$userA.access_token)).Content | ConvertFrom-Json
$moderatorRows = (Invoke-Api 'GET' $selectPath ([string]$moderator.access_token)).Content | ConvertFrom-Json
Check (@($anonRows | Where-Object { $_.content -eq 'secret marker' }).Count -eq 0)
Check (@($unrelatedRows | Where-Object { $_.content -eq 'secret marker' }).Count -eq 0)
Check (@($authorRows | Where-Object { $_.content -eq 'secret marker' }).Count -eq 1)
Check (@($ownerRows | Where-Object { $_.content -eq 'secret marker' }).Count -eq 1)
Check (@($moderatorRows | Where-Object { $_.content -eq 'secret marker' }).Count -eq 1)
Check (@($anonRows | Where-Object { $_.content -eq 'public marker' }).Count -eq 1)

$crossCommentUpdate = Invoke-Api 'PATCH' "/rest/v1/comments?id=eq.$publicCommentId" ([string]$userC.access_token) @{ content='cross comment hacked' }
$crossCommentDelete = Invoke-Api 'DELETE' "/rest/v1/comments?id=eq.$publicCommentId" ([string]$userC.access_token)
Check ((Invoke-Sql "select content from public.comments where id='$publicCommentId';") -eq 'public marker')
Check ((Invoke-Sql "select count(*) from public.comments where id='$publicCommentId';") -eq '1')

$selfAllowed = Invoke-Api 'POST' '/rest/v1/rpc/community_interaction_allowed' ([string]$userA.access_token) @{ actor_id=[string]$userA.user.id; target_user_id=[string]$userC.user.id }
$wrongActorBefore = Invoke-Api 'POST' '/rest/v1/rpc/community_interaction_allowed' ([string]$userA.access_token) @{ actor_id=[string]$userB.user.id; target_user_id=[string]$userC.user.id }
$anonRpc = Invoke-Api 'POST' '/rest/v1/rpc/community_interaction_allowed' $anon @{ actor_id=[string]$userA.user.id; target_user_id=[string]$userC.user.id }
Check ($selfAllowed.StatusCode -eq 200 -and $selfAllowed.Content -match 'true')
Check ($wrongActorBefore.StatusCode -eq 200 -and $wrongActorBefore.Content -match 'false')
Check ($anonRpc.StatusCode -ge 400)

$blockInsert = Invoke-Api 'POST' '/rest/v1/user_blocks' ([string]$userB.access_token) @{ blocker_user_id=[string]$userB.user.id; blocked_user_id=[string]$userC.user.id }
$wrongActorBlocked = Invoke-Api 'POST' '/rest/v1/rpc/community_interaction_allowed' ([string]$userA.access_token) @{ actor_id=[string]$userB.user.id; target_user_id=[string]$userC.user.id }
$blockDelete = Invoke-Api 'DELETE' "/rest/v1/user_blocks?blocker_user_id=eq.$($userB.user.id)&blocked_user_id=eq.$($userC.user.id)" ([string]$userB.access_token)
$wrongActorUnblocked = Invoke-Api 'POST' '/rest/v1/rpc/community_interaction_allowed' ([string]$userA.access_token) @{ actor_id=[string]$userB.user.id; target_user_id=[string]$userC.user.id }
Check ($blockInsert.StatusCode -in 200,201 -and $blockDelete.StatusCode -in 200,204)
Check ($wrongActorBlocked.Content -match 'false' -and $wrongActorUnblocked.Content -match 'false')

$anonWritePrivileges = Invoke-Sql "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('posts','comments') and grantee in ('anon','PUBLIC') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');"
$unsafePolicyCount = Invoke-Sql "select count(*) from pg_policies where schemaname='public' and tablename in ('posts','comments') and cmd in ('INSERT','UPDATE','DELETE') and roles @> array['public']::name[];"
$anonFunctionGrant = Invoke-Sql "select has_function_privilege('anon', 'public.community_interaction_allowed(uuid,uuid)', 'EXECUTE');"
Check ($anonWritePrivileges -eq '0')
Check ($unsafePolicyCount -eq '0')
Check ($anonFunctionGrant -eq 'f')

$leaks = @($anonRows | Where-Object { $_.content -eq 'secret marker' }).Count + @($unrelatedRows | Where-Object { $_.content -eq 'secret marker' }).Count
Check ($leaks -eq 0)

$passed = @($checks | Where-Object { $_ }).Count
if ($passed -ne $checks.Count) { throw "Phase 5D-2A local RLS attack tests failed: $passed/$($checks.Count); checks $($failed -join ',')" }
Write-Output "Phase 5D-2A local RLS attack tests: $passed/$($checks.Count) PASS; leaks=$leaks"
