$ErrorActionPreference = 'Stop'
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference=$ErrorActionPreference;$ErrorActionPreference='Continue'
$statusJson=supabase status -o json 2>$null | Out-String;$statusExit=$LASTEXITCODE
$ErrorActionPreference=$savedErrorActionPreference
if($statusExit-ne 0){throw 'Local Supabase status check failed'}
$status=$statusJson|ConvertFrom-Json
$api = [string]$status.API_URL
$anon = [string]$status.ANON_KEY
$dbContainer = @(& $docker ps --format '{{.Names}}' | Where-Object { $_ -eq 'supabase_db_kfarmai-v3-local' })[0]
if (-not $dbContainer) { throw 'Local Supabase DB container not found' }

function Invoke-SqlFile([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $containerPath = '/tmp/kfarmai-' + [IO.Path]::GetFileName($path)
  $savedPreference=$ErrorActionPreference;$ErrorActionPreference='Continue'
  & $docker cp $resolved "${dbContainer}:$containerPath" *> $null
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerPath *> $null
  $exitCode = $LASTEXITCODE
  & $docker exec $dbContainer rm -f $containerPath *> $null
  $ErrorActionPreference=$savedPreference
  if ($exitCode -ne 0) { throw "SQL failed: $path" }
}
function Invoke-Sql([string]$sql) {
  $result = $sql | & $docker exec -i $dbContainer psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'SQL command failed' }
  return ($result | Out-String).Trim()
}
function New-LocalUser([string]$label,[string]$stamp,[string]$password) {
  $body=@{email="$label-$stamp@local.test";password=$password}|ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$api/auth/v1/signup" -Headers @{apikey=$anon;Authorization="Bearer $anon"} -ContentType 'application/json' -Body $body
}
function Invoke-Api([string]$method,[string]$path,[string]$token,$body=$null,[hashtable]$extra=@{}) {
  $headers=@{apikey=$anon;Authorization="Bearer $token"};foreach($key in $extra.Keys){$headers[$key]=$extra[$key]}
  $args=@{UseBasicParsing=$true;Method=$method;Uri="$api$path";Headers=$headers}
  if($null-ne $body){$args.ContentType='application/json';$args.Body=($body|ConvertTo-Json -Depth 8 -Compress)}
  try{$response=Invoke-WebRequest @args;[pscustomobject]@{StatusCode=[int]$response.StatusCode;Content=[string]$response.Content}}
  catch{$response=$_.Exception.Response;if(-not $response){throw};[pscustomobject]@{StatusCode=[int]$response.StatusCode;Content=[string]$_.ErrorDetails.Message}}
}

if ((Invoke-Sql "select to_regprocedure('public.community_feed_metrics(uuid[])') is not null;") -ne 't') {
  throw 'Phase 4B local prerequisite is missing; run tests/phase4b-local-e2e.ps1 first'
}
if ((Invoke-Sql "select to_regclass('public.community_user_roles') is not null;") -eq 't') {
  Invoke-SqlFile 'supabase/rollback/20261004100000_v3_community_moderation_down.sql'
}
$legacyReportId=Invoke-Sql "select id from public.community_reports order by created_at limit 1;"
if($legacyReportId){Invoke-Sql "update public.community_reports set status='resolved' where id='$legacyReportId';"|Out-Null}
Invoke-SqlFile 'supabase/migrations/20261004100000_v3_community_moderation.sql'
Start-Sleep -Milliseconds 900
$stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$password='LocalOnly-'+[guid]::NewGuid().ToString('N')+'!aA1'
$userA=New-LocalUser 'phase4c-a' $stamp $password
$userB=New-LocalUser 'phase4c-b' $stamp $password
$admin=New-LocalUser 'phase4c-admin' $stamp $password
$other=New-LocalUser 'phase4c-other' $stamp $password
$postId='47000000-0000-4000-8000-000000000001';$commentId='47000000-0000-4000-8000-000000000002'
Invoke-Sql "delete from public.comments where id='$commentId'; delete from public.posts where id='$postId'; insert into public.posts(id,user_id,category_id,title,content,tags,image_urls) values('$postId','$($other.user.id)','41000000-0000-4000-8000-000000000001','moderation fixture','target preview',array['fixture'],array[]::text[]); insert into public.comments(id,post_id,user_id,content,is_secret) values('$commentId','$postId','$($other.user.id)','moderation comment',false); insert into public.community_user_roles(user_id,role) values('$($admin.user.id)','moderator');"|Out-Null

$checks=[Collections.Generic.List[bool]]::new();$failed=[Collections.Generic.List[int]]::new()
function Check([bool]$value){$checks.Add($value);if(-not $value){$failed.Add($checks.Count)}}

Check (-not $legacyReportId -or (Invoke-Sql "select status from public.community_reports where id='$legacyReportId';")-eq 'reviewed')

$anonRoles=Invoke-Api 'GET' '/rest/v1/community_user_roles?select=*' $anon
$regularRoles=Invoke-Api 'GET' '/rest/v1/community_user_roles?select=*' ([string]$userA.access_token)
$adminRoles=Invoke-Api 'GET' '/rest/v1/community_user_roles?select=role' ([string]$admin.access_token)
$anonRoleRows=$anonRoles.Content|ConvertFrom-Json;$regularRoleRows=$regularRoles.Content|ConvertFrom-Json;$adminRoleRows=$adminRoles.Content|ConvertFrom-Json
Check ($anonRoles.StatusCode-ge 400 -or @($anonRoleRows).Count-eq 0)
Check (@($regularRoleRows).Count-eq 0)
Check (@($adminRoleRows).Count-eq 1)

$reportA=@{reporter_user_id=[string]$userA.user.id;target_type='post';target_id=$postId;reason='post moderation fixture'}
$first=Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$userA.access_token) $reportA @{Prefer='return=representation'}
$duplicate=Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$userA.access_token) $reportA
$second=Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$userB.access_token) @{reporter_user_id=[string]$userB.user.id;target_type='comment';target_id=$commentId;reason='comment moderation fixture'} @{Prefer='return=representation'}
Check ($first.StatusCode-in 200,201 -and $second.StatusCode-in 200,201)
Check ($duplicate.StatusCode-eq 409)
$reportAId=(@($first.Content|ConvertFrom-Json)[0]).id;$reportBId=(@($second.Content|ConvertFrom-Json)[0]).id

$own=Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' ([string]$userA.access_token)
$otherOwn=Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' ([string]$other.access_token)
$adminAll=Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' ([string]$admin.access_token)
$anonAll=Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' $anon
$ownRows=$own.Content|ConvertFrom-Json;$otherOwnRows=$otherOwn.Content|ConvertFrom-Json;$adminAllRows=$adminAll.Content|ConvertFrom-Json;$anonAllRows=$anonAll.Content|ConvertFrom-Json
Check (@($ownRows).Count-eq 1)
Check (@($otherOwnRows).Count-eq 0)
Check (@($adminAllRows).Count-ge 2)
Check ($anonAll.StatusCode-ge 400 -or @($anonAllRows).Count-eq 0)

$anonQueue=Invoke-Api 'POST' '/rest/v1/rpc/community_report_queue' $anon @{status_filter='pending';page_limit=100;page_offset=0}
$regularQueue=Invoke-Api 'POST' '/rest/v1/rpc/community_report_queue' ([string]$userA.access_token) @{status_filter='pending';page_limit=100;page_offset=0}
$adminQueue=Invoke-Api 'POST' '/rest/v1/rpc/community_report_queue' ([string]$admin.access_token) @{status_filter='pending';page_limit=100;page_offset=0}
$queueRows=$adminQueue.Content|ConvertFrom-Json
Check ($anonQueue.StatusCode-ge 400)
Check ($regularQueue.StatusCode-ge 400)
Check ($adminQueue.StatusCode-eq 200 -and @($queueRows).Count-ge 2 -and @($queueRows|Where-Object{$_.target_preview}).Count-ge 2)

$normalUpdate=Invoke-Api 'PATCH' "/rest/v1/community_reports?id=eq.$reportAId" ([string]$userA.access_token) @{status='reviewed'}
Check ($normalUpdate.StatusCode-ge 400 -or (Invoke-Sql "select status from public.community_reports where id='$reportAId';")-eq 'pending')
$reviewed=Invoke-Api 'POST' '/rest/v1/rpc/moderate_community_report' ([string]$admin.access_token) @{report_id=$reportAId;next_status='reviewed'}
$dismissed=Invoke-Api 'POST' '/rest/v1/rpc/moderate_community_report' ([string]$admin.access_token) @{report_id=$reportBId;next_status='dismissed'}
$actioned=Invoke-Api 'POST' '/rest/v1/rpc/moderate_community_report' ([string]$admin.access_token) @{report_id=$reportAId;next_status='actioned'}
Check ($reviewed.StatusCode-eq 200 -and $reviewed.Content-match 'reviewed')
Check ($dismissed.StatusCode-eq 200 -and $dismissed.Content-match 'dismissed')
Check ($actioned.StatusCode-eq 200 -and $actioned.Content-match 'actioned')
$invalid=Invoke-Api 'POST' '/rest/v1/rpc/moderate_community_report' ([string]$admin.access_token) @{report_id=$reportAId;next_status='deleted'}
Check ($invalid.StatusCode-ge 400)
Check ((Invoke-Sql "select count(*) from public.community_reports where reviewed_by='$($admin.user.id)' and reviewed_at is not null;")-eq '2')
Check ((Invoke-Sql "select count(*) from public.comments where id='$commentId' and content='moderation comment';")-eq '1')
Check ((Invoke-Sql "select count(*) from public.posts where id='$postId' and cardinality(image_urls)=0;")-eq '1')

$passed=@($checks|Where-Object{$_}).Count
if($passed-ne $checks.Count){throw "Phase 4C local E2E failed: $passed/$($checks.Count); checks $($failed -join ',')"}
Write-Output "Phase 4C local RLS/E2E: $passed/$($checks.Count) PASS"
