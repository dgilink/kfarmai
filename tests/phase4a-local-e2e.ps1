$ErrorActionPreference = 'Stop'

$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI not found' }
$env:PATH = (Split-Path -Parent $docker) + ';' + $env:PATH

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$start = supabase start 2>&1 | Out-String
$startExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($startExitCode -ne 0) { throw "Local Supabase start failed: $start" }
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
  & $docker exec $dbContainer psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f $containerPath
  $sqlExitCode = $LASTEXITCODE
  & $docker exec $dbContainer rm -f $containerPath
  if ($sqlExitCode -ne 0) { throw "SQL failed: $path" }
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

function Invoke-Api([string]$method, [string]$path, [string]$token, $body = $null, [hashtable]$extraHeaders = @{}) {
  $headers = @{ apikey = $anon; Authorization = "Bearer $token" }
  foreach ($key in $extraHeaders.Keys) { $headers[$key] = $extraHeaders[$key] }
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
    $content = [string]$_.ErrorDetails.Message
    if (-not $content -and $response.PSObject.Methods.Name -contains 'GetResponseStream') {
      $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
      try {
        $content = $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }
    }
    return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = $content }
  }
}

Invoke-SqlFile 'supabase/tests/phase2b-local-base.sql'
Invoke-SqlFile 'supabase/tests/phase4a-community-base.sql'
$ErrorActionPreference = 'Continue'
$migrationCheck = supabase migration up --local 2>&1 | Out-String
$migrationExitCode = $LASTEXITCODE
$ErrorActionPreference = $savedErrorActionPreference
if ($migrationExitCode -ne 0) { throw "Supabase migration up failed: $migrationCheck" }
Invoke-SqlFile 'supabase/rollback/20261002110000_v3_community_model_down.sql'

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'LocalOnly-' + [guid]::NewGuid().ToString('N') + '!aA1'
$author = New-LocalUser 'phase4-author' $stamp $password
$other = New-LocalUser 'phase4-other' $stamp $password
$reporter = New-LocalUser 'phase4-reporter' $stamp $password
$blocked = New-LocalUser 'phase4-blocked' $stamp $password

$postIds = 1..5 | ForEach-Object { "44000000-0000-4000-8000-{0:D12}" -f $_ }
$commentIds = 1..2 | ForEach-Object { "45000000-0000-4000-8000-{0:D12}" -f $_ }
$fixtureSql = @"
begin;
delete from public.comments where post_id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);
delete from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])','44000000-0000-4000-8000-000000000099']::uuid[]);
insert into public.posts(id,user_id,channel_id,title,content,crop_tag,region_tag,image_urls,view_count) values
('$($postIds[0])','$($author.user.id)','d88ba519-68fd-488f-8311-e316838ac4cf','fixture 1','legacy question','leaf-curl','jeonnam',array['https://local.test/one.jpg'],1),
('$($postIds[1])','$($author.user.id)','c7315bd6-eb60-484c-9c07-6def8f93ddc1','fixture 2','legacy question','overwater','suncheon',array[]::text[],2),
('$($postIds[2])','$($reporter.user.id)','f586c6a8-882a-45d0-89e6-6d20fd9675de','fixture 3','legacy crop','anthracnose','jeonnam',array['https://local.test/two.jpg'],3),
('$($postIds[3])','$($other.user.id)','9191bf52-84b6-42ca-b2c7-c886bde5d450','fixture 4','legacy daily','growth-log','seoul',array[]::text[],4),
('$($postIds[4])','$($other.user.id)','4619a407-a214-4555-8e63-06fa96ed87a2','fixture 5','legacy archive','local-info','gyeonggi',array['https://local.test/three.jpg'],5);
insert into public.comments(id,post_id,user_id,content,is_secret,parent_id) values
('$($commentIds[0])','$($postIds[0])','$($other.user.id)','public fixture comment',false,null),
('$($commentIds[1])','$($postIds[0])','$($author.user.id)','secret fixture comment',true,'$($commentIds[0])');
commit;
"@
Invoke-Sql $fixtureSql | Out-Null
$before = Invoke-Sql "select count(*)||'|'||(select count(*) from public.comments where post_id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]))||'|'||coalesce(sum(cardinality(image_urls)),0) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);"

Invoke-SqlFile 'supabase/migrations/20261002110000_v3_community_model.sql'
Start-Sleep -Milliseconds 800
$after = Invoke-Sql "select count(*)||'|'||(select count(*) from public.comments where post_id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]))||'|'||coalesce(sum(cardinality(image_urls)),0) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);"

$checks = [System.Collections.Generic.List[bool]]::new()
$failedCheckIndexes = [System.Collections.Generic.List[int]]::new()
function Check([bool]$value) {
  $checks.Add($value)
  if (-not $value) { $failedCheckIndexes.Add($checks.Count) }
}

Check ($before -eq '5|2|3')
Check ($after -eq $before)
Check ((Invoke-Sql 'select count(*) from public.community_categories where is_active;') -eq '4')
Check ((Invoke-Sql 'select count(*) from public.community_channel_category_map;') -eq '8')
Check ((Invoke-Sql "select count(*) from public.community_channel_category_map where transition_status='archive' and legacy_slug='plant-share';") -eq '1')
Check ((Invoke-Sql "select count(*) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]) and category_id is not null;") -eq '5')
Check ((Invoke-Sql "select count(*) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]) and cardinality(tags)>=2;") -eq '5')

$anonCategories = Invoke-Api 'GET' '/rest/v1/community_categories?select=slug,name&order=sort_order' $anon
$anonCategoryRows = ConvertFrom-Json -InputObject $anonCategories.Content
Check ($anonCategories.StatusCode -eq 200 -and $anonCategoryRows.Count -eq 4)
$categoryDenied = Invoke-Api 'POST' '/rest/v1/community_categories' ([string]$author.access_token) @{ slug='forbidden'; name='forbidden'; sort_order=9 }
Check ($categoryDenied.StatusCode -ge 400)

$newPostId = '44000000-0000-4000-8000-000000000099'
$newPost = Invoke-Api 'POST' '/rest/v1/posts' ([string]$author.access_token) @{
  id=$newPostId; user_id=[string]$author.user.id; category_id='41000000-0000-4000-8000-000000000002';
  title='tag fixture'; content='tag search fixture'; tags=@('#pepper',' pepper ','greenhouse','#suncheon'); image_urls=@('https://local.test/new.jpg')
} @{ Prefer='return=representation' }
Check ($newPost.StatusCode -in 200,201)
$storedTags = Invoke-Sql "select array_to_string(tags,',') from public.posts where id='$newPostId'::uuid;"
Check ($storedTags -eq 'pepper,greenhouse,suncheon')
$tagQuery = Invoke-Api 'GET' '/rest/v1/posts?select=id&tags=cs.%7Bpepper%7D' $anon
$tagRows = ConvertFrom-Json -InputObject $tagQuery.Content
Check ($tagQuery.StatusCode -eq 200 -and $tagRows.id -contains $newPostId)

$unauthReaction = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' $anon @{ target_post_id=$postIds[0]; target_reaction_type='same_symptom' }
Check ($unauthReaction.StatusCode -ge 400)
$sameOn = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$other.access_token) @{ target_post_id=$postIds[0]; target_reaction_type='same_symptom' }
$sameState = Invoke-Api 'POST' '/rest/v1/rpc/community_post_engagement' ([string]$other.access_token) @{ target_post_id=$postIds[0] }
Check ($sameOn.StatusCode -eq 200 -and $sameOn.Content -match 'true' -and ($sameState.Content | ConvertFrom-Json)[0].same_symptom_count -eq 1)
$sameOff = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$other.access_token) @{ target_post_id=$postIds[0]; target_reaction_type='same_symptom' }
Check ($sameOff.StatusCode -eq 200 -and $sameOff.Content -match 'false')
$helpfulOn = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$other.access_token) @{ target_post_id=$postIds[0]; target_reaction_type='helpful' }
$helpfulOff = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$other.access_token) @{ target_post_id=$postIds[0]; target_reaction_type='helpful' }
Check ($helpfulOn.Content -match 'true' -and $helpfulOff.Content -match 'false')

$directReaction = @{ post_id=$postIds[0]; user_id=[string]$other.user.id; reaction_type='same_symptom' }
$directFirst = Invoke-Api 'POST' '/rest/v1/post_reactions' ([string]$other.access_token) $directReaction
$directDuplicate = Invoke-Api 'POST' '/rest/v1/post_reactions' ([string]$other.access_token) $directReaction
Check ($directFirst.StatusCode -in 200,201 -and $directDuplicate.StatusCode -eq 409)
Invoke-Api 'DELETE' "/rest/v1/post_reactions?post_id=eq.$($postIds[0])&reaction_type=eq.same_symptom" ([string]$other.access_token) | Out-Null

$bookmarkOn = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_bookmark' ([string]$other.access_token) @{ target_post_id=$postIds[0] }
$bookmarkOwner = Invoke-Api 'GET' '/rest/v1/post_bookmarks?select=post_id' ([string]$other.access_token)
$bookmarkOther = Invoke-Api 'GET' '/rest/v1/post_bookmarks?select=post_id' ([string]$author.access_token)
$bookmarkOff = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_bookmark' ([string]$other.access_token) @{ target_post_id=$postIds[0] }
$bookmarkOwnerRows = ConvertFrom-Json -InputObject $bookmarkOwner.Content
$bookmarkOtherRows = ConvertFrom-Json -InputObject $bookmarkOther.Content
Check ($bookmarkOn.Content -match 'true' -and $bookmarkOwnerRows.Count -eq 1 -and $bookmarkOtherRows.Count -eq 0 -and $bookmarkOff.Content -match 'false')

$reportBody = @{ reporter_user_id=[string]$reporter.user.id; target_type='post'; target_id=$postIds[0]; reason='local report fixture' }
$reportFirst = Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$reporter.access_token) $reportBody
$reportDuplicate = Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$reporter.access_token) $reportBody
$reportOwn = Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' ([string]$reporter.access_token)
$reportOther = Invoke-Api 'GET' '/rest/v1/community_reports?select=id,status' ([string]$other.access_token)
$reportOwnRows = ConvertFrom-Json -InputObject $reportOwn.Content
$reportOtherRows = ConvertFrom-Json -InputObject $reportOther.Content
Check ($reportFirst.StatusCode -in 200,201 -and $reportDuplicate.StatusCode -eq 409)
Check ($reportOwnRows.Count -eq 1 -and $reportOtherRows.Count -eq 0)
$commentReport = Invoke-Api 'POST' '/rest/v1/community_reports' ([string]$reporter.access_token) @{ reporter_user_id=[string]$reporter.user.id; target_type='comment'; target_id=$commentIds[0]; reason='comment report fixture' }
Check ($commentReport.StatusCode -in 200,201)

$blockBody = @{ blocker_user_id=[string]$reporter.user.id; blocked_user_id=[string]$blocked.user.id }
$blockFirst = Invoke-Api 'POST' '/rest/v1/user_blocks' ([string]$reporter.access_token) $blockBody
$blockDuplicate = Invoke-Api 'POST' '/rest/v1/user_blocks' ([string]$reporter.access_token) $blockBody
$selfBlock = Invoke-Api 'POST' '/rest/v1/user_blocks' ([string]$reporter.access_token) @{ blocker_user_id=[string]$reporter.user.id; blocked_user_id=[string]$reporter.user.id }
$blockPrivate = Invoke-Api 'GET' '/rest/v1/user_blocks?select=blocked_user_id' ([string]$other.access_token)
$blockPrivateRows = ConvertFrom-Json -InputObject $blockPrivate.Content
Check ($blockFirst.StatusCode -in 200,201 -and $blockDuplicate.StatusCode -eq 409)
Check ($selfBlock.StatusCode -ge 400 -and $blockPrivateRows.Count -eq 0)
$blockedReaction = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$blocked.access_token) @{ target_post_id=$postIds[2]; target_reaction_type='helpful' }
Check ($blockedReaction.StatusCode -ge 400)
$unblock = Invoke-Api 'DELETE' "/rest/v1/user_blocks?blocker_user_id=eq.$($reporter.user.id)&blocked_user_id=eq.$($blocked.user.id)" ([string]$reporter.access_token)
$unblockedReaction = Invoke-Api 'POST' '/rest/v1/rpc/toggle_post_reaction' ([string]$blocked.access_token) @{ target_post_id=$postIds[2]; target_reaction_type='helpful' }
Check ($unblock.StatusCode -in 200,204 -and $unblockedReaction.StatusCode -eq 200)

$anonReactions = Invoke-Api 'GET' '/rest/v1/post_reactions?select=*' $anon
Check ($anonReactions.StatusCode -ge 400 -or @($anonReactions.Content | ConvertFrom-Json).Count -eq 0)
Check ((Invoke-Sql "select count(*) from public.comments where post_id='$($postIds[0])'::uuid;") -eq '2')
Check ((Invoke-Sql "select coalesce(sum(cardinality(image_urls)),0) from public.posts where id = any(array['$($postIds[0])','$($postIds[1])','$($postIds[2])','$($postIds[3])','$($postIds[4])']::uuid[]);") -eq '3')

$passed = @($checks | Where-Object { $_ }).Count
if ($passed -ne $checks.Count) {
  Write-Output "debug statuses categories=$($anonCategories.StatusCode) newPost=$($newPost.StatusCode) tagQuery=$($tagQuery.StatusCode) bookmark=$($bookmarkOn.StatusCode)/$($bookmarkOff.StatusCode) reports=$($reportFirst.StatusCode)/$($reportDuplicate.StatusCode) blocks=$($selfBlock.StatusCode)"
  Write-Output "debug counts categories=$($anonCategoryRows.Count) bookmark=$($bookmarkOwnerRows.Count)/$($bookmarkOtherRows.Count) reports=$($reportOwnRows.Count)/$($reportOtherRows.Count) blocks=$($blockPrivateRows.Count) tags=$($tagRows.Count)"
  Write-Output "debug storedTags=$storedTags categoriesBody=$($anonCategories.Content) newPostBody=$($newPost.Content)"
  throw "Phase 4A local E2E failed: $passed/$($checks.Count); checks $($failedCheckIndexes -join ',')"
}
Write-Output "Phase 4A local E2E: $passed/$($checks.Count) PASS; legacy posts 5/5, comments 2/2, images 3/3"
