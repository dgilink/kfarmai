$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$statusJson = supabase status -o json 2>$null | Out-String
$statusExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($statusExitCode -ne 0) { throw 'Local Supabase status check failed' }
$status = $statusJson | ConvertFrom-Json
$api = [string]$status.API_URL
$anon = [string]$status.ANON_KEY
$functionUrl = ([string]$status.FUNCTIONS_URL) + '/request-account-deletion'
$dbContainer = @(& $docker ps --format '{{.Names}}' | Where-Object { $_ -like 'supabase_db_*' })[0]
if (-not $dbContainer) { throw 'Local Supabase DB container not found' }

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'LocalOnly-' + [guid]::NewGuid().ToString('N') + '!aA1'

function New-LocalUser([string]$label) {
  $body = @{ email = "$label-$stamp@local.test"; password = $password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$api/auth/v1/signup" `
    -Headers @{ apikey = $anon; Authorization = "Bearer $anon" } `
    -ContentType 'application/json' -Body $body
}

function Read-LocalComments([string]$token) {
  $uri = "$api/rest/v1/comments?select=id,content,is_secret,parent_id&post_id=eq.10000000-0000-4000-8000-000000000001&order=id.asc"
  $result = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ apikey = $anon; Authorization = "Bearer $token" }
  return @($result)
}

function Invoke-Deletion([string]$token, [hashtable]$payload) {
  $headers = @{}
  if ($token) { $headers.Authorization = "Bearer $token" }
  try {
    return Invoke-WebRequest -UseBasicParsing -Method Post -Uri $functionUrl -Headers $headers `
      -ContentType 'application/json' -Body ($payload | ConvertTo-Json)
  } catch {
    $response = $_.Exception.Response
    if (-not $response) { throw }
    $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
    try {
      $content = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Content = $content
    }
  }
}

$author = New-LocalUser 'comment-author'
$owner = New-LocalUser 'post-owner'
$unrelated = New-LocalUser 'unrelated'

$fixtureSql = @"
begin;
grant select on public.posts, public.comments to anon, authenticated;
delete from public.comments where post_id='10000000-0000-4000-8000-000000000001'::uuid;
delete from public.posts where id='10000000-0000-4000-8000-000000000001'::uuid;
insert into public.posts(id,user_id,title,content)
values ('10000000-0000-4000-8000-000000000001','$($owner.user.id)','local security fixture','local only');
insert into public.comments(id,post_id,user_id,content,is_secret,parent_id) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','$($author.user.id)','public-body-marker',false,null),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','$($author.user.id)','secret-body-marker',true,null),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','$($author.user.id)','public-reply-marker',false,'20000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','$($author.user.id)','secret-reply-marker',true,'20000000-0000-4000-8000-000000000002');
commit;
"@
$fixtureSql | & $docker exec -i $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Local fixture setup failed' }

$anonRows = Read-LocalComments $anon
$authorRows = Read-LocalComments ([string]$author.access_token)
$ownerRows = Read-LocalComments ([string]$owner.access_token)
$unrelatedRows = Read-LocalComments ([string]$unrelated.access_token)

$rlsChecks = @(
  [bool](@($anonRows | Where-Object { -not $_.is_secret }).Count -eq 2)
  [bool](@($authorRows | Where-Object { $_.is_secret }).Count -eq 2)
  [bool](@($ownerRows | Where-Object { $_.is_secret }).Count -eq 2)
  [bool](@($unrelatedRows | Where-Object { $_.is_secret }).Count -eq 0)
  [bool](@($anonRows | Where-Object { $_.is_secret }).Count -eq 0)
  [bool](@($anonRows | Where-Object { $_.id -eq '20000000-0000-4000-8000-000000000003' }).Count -eq 1)
  [bool](@($authorRows | Where-Object { $_.id -eq '20000000-0000-4000-8000-000000000004' }).Count -eq 1 -and
    @($ownerRows | Where-Object { $_.id -eq '20000000-0000-4000-8000-000000000004' }).Count -eq 1)
  [bool](@($anonRows | Where-Object { $_.id -eq '20000000-0000-4000-8000-000000000004' }).Count -eq 0 -and
    @($unrelatedRows | Where-Object { $_.id -eq '20000000-0000-4000-8000-000000000004' }).Count -eq 0)
)
$rlsPassed = @($rlsChecks | Where-Object { $_ }).Count
if ($rlsPassed -ne 8) { throw "Secret comment RLS failed: $rlsPassed/8" }

$deleteUser = New-LocalUser 'delete-user'
$deletePayload = @{ confirmation = 'DELETE_MY_ACCOUNT'; user_id = '00000000-0000-4000-8000-000000000099'; email = 'forged@example.com' }
$unauthenticated = Invoke-Deletion '' @{ confirmation = 'DELETE_MY_ACCOUNT' }
$first = Invoke-Deletion ([string]$deleteUser.access_token) $deletePayload
$firstBody = $first.Content | ConvertFrom-Json
$duplicate = Invoke-Deletion ([string]$deleteUser.access_token) $deletePayload
$duplicateBody = $duplicate.Content | ConvertFrom-Json

$storedUser = (& $docker exec $dbContainer psql -qAt -U postgres -d postgres -c `
  "select user_id::text from public.account_deletion_requests where id='$($firstBody.requestId)'::uuid;").Trim()
$emailColumnCount = (& $docker exec $dbContainer psql -qAt -U postgres -d postgres -c `
  "select count(*) from information_schema.columns where table_schema='public' and table_name='account_deletion_requests' and column_name='email';").Trim()

$failureStatus = 0
$failureOk = $true
try {
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "alter table public.account_deletion_requests rename to account_deletion_requests_phase2b_disabled; notify pgrst, 'reload schema';" *> $null
  Start-Sleep -Milliseconds 700
  $failed = Invoke-Deletion ([string]$deleteUser.access_token) @{ confirmation = 'DELETE_MY_ACCOUNT' }
  $failureStatus = $failed.StatusCode
  $failureOk = [bool](($failed.Content | ConvertFrom-Json).ok)
} finally {
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "do `$`$ begin if to_regclass('public.account_deletion_requests_phase2b_disabled') is not null then alter table public.account_deletion_requests_phase2b_disabled rename to account_deletion_requests; end if; end `$`$; notify pgrst, 'reload schema';" *> $null
  Start-Sleep -Milliseconds 500
}

$indexHtml = Get-Content -LiteralPath 'index.html' -Raw -Encoding UTF8
$successCheck = $indexHtml.IndexOf("result.status!=='pending'")
$signOut = $indexHtml.IndexOf('await _sb.auth.signOut()', $successCheck)
$deletionChecks = @(
  [bool]($unauthenticated.StatusCode -eq 401)
  [bool]($first.StatusCode -eq 200 -and $firstBody.ok -eq $true -and $firstBody.status -eq 'pending')
  [bool]($duplicate.StatusCode -eq 200 -and $duplicateBody.requestId -eq $firstBody.requestId)
  [bool]($storedUser -eq [string]$deleteUser.user.id -and $storedUser -ne '00000000-0000-4000-8000-000000000099')
  [bool]($emailColumnCount -eq '0')
  [bool]($storedUser -eq [string]$deleteUser.user.id)
  [bool]($failureStatus -ge 400 -and $failureOk -eq $false)
  [bool]($indexHtml -match 'if\(!response\.ok\|\|result\.ok!==true' -and $indexHtml -match 'account deletion request failed')
  [bool]($successCheck -ge 0 -and $signOut -gt $successCheck)
)
$deletionPassed = @($deletionChecks | Where-Object { $_ }).Count
if ($deletionPassed -ne 9) { throw "Account deletion E2E failed: $deletionPassed/9" }

$anonExposure = @($anonRows | Where-Object { $_.content -in @('secret-body-marker', 'secret-reply-marker') }).Count
$unrelatedExposure = @($unrelatedRows | Where-Object { $_.content -in @('secret-body-marker', 'secret-reply-marker') }).Count
if ($anonExposure -ne 0 -or $unrelatedExposure -ne 0) { throw 'Secret comment body exposure detected' }

Write-Output "Phase 2B local E2E: RLS $rlsPassed/8, account deletion $deletionPassed/9, exposures $anonExposure/$unrelatedExposure PASS"
