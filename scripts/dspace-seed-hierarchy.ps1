# Seed DSpace hierarchy for Thesis Portal mapping:
#   root -> faculty (sub) -> semester (sub-sub) -> period (collection)
#
# Uses curl.exe + cookie jar (same CSRF flow as dspace-seed-hierarchy.sh).
#
# Auto-login:
#   .\dspace-seed-hierarchy.ps1 -BaseUrl "http://localhost:8080/server" `
#     -User "admin@mail.com" -Password "123456789" `
#     -ParentCommunityId "7fd5cbb5-d2a1-4235-b5b0-7f5894771417"
#
# Env: DSPACE_BASE_URL, DSPACE_USER, DSPACE_PASSWORD, DSPACE_BEARER, DSPACE_XSRF,
#      DSPACE_PARENT_COMMUNITY_ID, DSPACE_ROOT_NAME
# Keep in sync with dspace-seed-hierarchy.sh

param(
  [string]$BaseUrl = $(if ($env:DSPACE_BASE_URL) { $env:DSPACE_BASE_URL } else { "http://localhost:8080/server" }),
  [string]$User = $(if ($env:DSPACE_USER) { $env:DSPACE_USER } else { "" }),
  [string]$Password = $(if ($env:DSPACE_PASSWORD) { $env:DSPACE_PASSWORD } else { "" }),
  [string]$BearerToken = $(if ($env:DSPACE_BEARER) { $env:DSPACE_BEARER } else { "" }),
  [string]$XsrfToken = $(if ($env:DSPACE_XSRF) { $env:DSPACE_XSRF } else { "" }),
  [string]$ParentCommunityId = $(if ($env:DSPACE_PARENT_COMMUNITY_ID) { $env:DSPACE_PARENT_COMMUNITY_ID } else { "" }),
  [string]$RootName = $(if ($env:DSPACE_ROOT_NAME) { $env:DSPACE_ROOT_NAME } else { "Truong Dai hoc Bach Khoa TPHCM" })
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$script:BearerToken = $BearerToken
$script:XsrfToken = $XsrfToken

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw "curl.exe is required (Windows 10+ usually has it)."
}

$CookieJar = Join-Path $env:TEMP ("dspace-cookies-{0}.txt" -f [guid]::NewGuid().ToString("N"))

function Get-HeaderFromFile {
  param([string]$HeadersFile, [string]$Name)
  if (-not (Test-Path $HeadersFile)) { return "" }
  $want = $Name.ToLowerInvariant()
  foreach ($line in Get-Content $HeadersFile) {
    $idx = $line.IndexOf(":")
    if ($idx -lt 1) { continue }
    $key = $line.Substring(0, $idx).Trim().ToLowerInvariant()
    if ($key -eq $want) {
      return $line.Substring($idx + 1).Trim()
    }
  }
  return ""
}

function Get-XsrfFromCookieJar {
  if (-not (Test-Path $CookieJar)) { return "" }
  foreach ($line in Get-Content $CookieJar) {
    if ($line -match "^\s*#" -or $line -match "^\s*$") { continue }
    $parts = $line -split "`t"
    if ($parts.Count -ge 7 -and $parts[5] -eq "DSPACE-XSRF-COOKIE") {
      return $parts[6].Trim()
    }
  }
  return ""
}

function Write-XsrfCookieJar {
  $expire = [DateTimeOffset]::UtcNow.AddHours(12).ToUnixTimeSeconds()
  $uri = [uri]$BaseUrl
  $hostName = $uri.Host
  $cookiePath = $uri.AbsolutePath
  if ([string]::IsNullOrWhiteSpace($cookiePath)) { $cookiePath = "/" }
  @(
    "# Netscape HTTP Cookie File"
    "$hostName`tFALSE`t$cookiePath`tFALSE`t$expire`tDSPACE-XSRF-COOKIE`t$($script:XsrfToken)"
  ) | Set-Content -Path $CookieJar -Encoding ASCII
}

function Connect-DspaceLogin {
  param([string]$ApiBase, [string]$LoginUser, [string]$LoginPassword)
  Write-Host "Auto-login to DSpace as $LoginUser ..." -ForegroundColor Cyan

  $csrfHeaders = Join-Path $env:TEMP ("dspace-csrf-{0}.hdr" -f [guid]::NewGuid().ToString("N"))
  & curl.exe -sS -D $csrfHeaders -o NUL -c $CookieJar "$ApiBase/api/security/csrf" | Out-Null
  $xsrf = Get-HeaderFromFile $csrfHeaders "DSPACE-XSRF-TOKEN"
  if (-not $xsrf) { $xsrf = Get-XsrfFromCookieJar }
  Remove-Item $csrfHeaders -Force -ErrorAction SilentlyContinue
  if (-not $xsrf) { throw "CSRF OK but no DSPACE-XSRF-TOKEN" }

  $loginHeaders = Join-Path $env:TEMP ("dspace-login-{0}.hdr" -f [guid]::NewGuid().ToString("N"))
  & curl.exe -sS -D $loginHeaders -o NUL -b $CookieJar -c $CookieJar `
    -X POST "$ApiBase/api/authn/login" `
    -H "X-XSRF-TOKEN: $xsrf" `
    -H "Content-Type: application/x-www-form-urlencoded" `
    -H "Accept: application/json" `
    --data-urlencode "user=$LoginUser" `
    --data-urlencode "password=$LoginPassword" | Out-Null

  $auth = Get-HeaderFromFile $loginHeaders "Authorization"
  $bearer = ""
  if ($auth -match "(?i)Bearer\s+(.+)") { $bearer = $Matches[1].Trim() }
  elseif ($auth) { $bearer = $auth.Trim() }

  $xsrfAfter = Get-HeaderFromFile $loginHeaders "DSPACE-XSRF-TOKEN"
  if (-not $xsrfAfter) { $xsrfAfter = Get-XsrfFromCookieJar }
  if (-not $xsrfAfter) { $xsrfAfter = $xsrf }
  Remove-Item $loginHeaders -Force -ErrorAction SilentlyContinue

  if (-not $bearer) { throw "Login OK but Authorization Bearer missing" }
  Write-Host "  Login OK" -ForegroundColor Green
  return @{ Bearer = $bearer; Xsrf = $xsrfAfter }
}

if (-not $script:BearerToken -or -not $script:XsrfToken) {
  if (-not $User -or -not $Password) {
    throw "Missing credentials. Use -User/-Password (auto-login) or -BearerToken/-XsrfToken."
  }
  $auth = Connect-DspaceLogin -ApiBase $BaseUrl -LoginUser $User -LoginPassword $Password
  $script:BearerToken = $auth.Bearer
  $script:XsrfToken = $auth.Xsrf
} else {
  Write-XsrfCookieJar
}

$SemesterName = "Hoc ky 1 - 2025"
$PeriodName = "Dot nop HK1/2025"
$FacultyNames = @(
  "KHOA KY THUAT XAY DUNG",
  "KHOA KY THUAT DIA CHAT VA DAU KHI",
  "KHOA KHOA HOC UNG DUNG",
  "KHOA CO KHI",
  "KHOA CONG NGHE VAT LIEU",
  "KHOA KY THUAT GIAO THONG",
  "KHOA KHOA HOC VA KY THUAT MAY TINH",
  "KHOA KY THUAT HOA HOC",
  "KHOA QUAN LY CONG NGHIEP",
  "KHOA MOI TRUONG VA TAI NGUYEN",
  "KHOA DIEN - DIEN TU"
)

function Get-DspaceIdFromJson([string]$Json) {
  if (-not $Json) { return $null }
  try {
    $obj = $Json | ConvertFrom-Json
    if ($obj.id) { return [string]$obj.id }
    if ($obj.uuid) { return [string]$obj.uuid }
  } catch {}
  return $null
}

function Escape-JsonString([string]$Value) {
  if ($null -eq $Value) { return "" }
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $Value.ToCharArray()) {
    switch ($ch) {
      '"' { [void]$sb.Append('\"') }
      '\' { [void]$sb.Append('\\') }
      "`n" { [void]$sb.Append('\n') }
      "`r" { [void]$sb.Append('\r') }
      "`t" { [void]$sb.Append('\t') }
      default {
        $code = [int]$ch
        if ($code -lt 32) {
          [void]$sb.AppendFormat('\u{0:x4}', $code)
        } else {
          [void]$sb.Append($ch)
        }
      }
    }
  }
  return $sb.ToString()
}

# Manual JSON: Windows PowerShell 5 ConvertTo-Json collapses single-element arrays (causes DSpace 422).
function New-CommunityMetadataJson([string]$Name) {
  $n = Escape-JsonString $Name
  # RestContract communities.md — no "place" on create
  return "{`"name`":`"$n`",`"metadata`":{`"dc.title`":[{`"value`":`"$n`",`"language`":null,`"authority`":null,`"confidence`":-1}]}}"
}

function Invoke-DspaceCurl {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Body = $null,
    [string]$ContentType = "application/json"
  )
  $uri = "$BaseUrl$Path"
  Write-Host "$Method $Path" -ForegroundColor Cyan
  Write-XsrfCookieJar

  $hdrFile = Join-Path $env:TEMP ("dspace-resp-{0}.hdr" -f [guid]::NewGuid().ToString("N"))
  $respFile = Join-Path $env:TEMP ("dspace-resp-{0}.body" -f [guid]::NewGuid().ToString("N"))
  # PS5 mangles JSON quotes when passed as curl --data-binary arg → DSpace 422 parse error.
  # Write body to a file and use @path (same pattern as working manual curl).
  $reqBodyFile = $null

  $curlArgs = @(
    "-sS", "-D", $hdrFile, "-o", $respFile, "-w", "%{http_code}",
    "-b", $CookieJar, "-c", $CookieJar,
    "-X", $Method, $uri,
    "-H", "Authorization: Bearer $($script:BearerToken)",
    "-H", "Accept: application/json",
    "-H", "X-XSRF-TOKEN: $($script:XsrfToken)"
  )
  if ($null -ne $Body) {
    $reqBodyFile = Join-Path $env:TEMP ("dspace-req-{0}.body" -f [guid]::NewGuid().ToString("N"))
    [System.IO.File]::WriteAllText($reqBodyFile, $Body, [System.Text.UTF8Encoding]::new($false))
    $curlArgs += @("-H", "Content-Type: $ContentType", "--data-binary", "@$reqBodyFile")
  }

  $code = & curl.exe @curlArgs
  $text = ""
  if (Test-Path $respFile) {
    $text = Get-Content $respFile -Raw -ErrorAction SilentlyContinue
  }
  $maybeXsrf = Get-HeaderFromFile $hdrFile "DSPACE-XSRF-TOKEN"
  if ($maybeXsrf) { $script:XsrfToken = $maybeXsrf }
  $jarXsrf = Get-XsrfFromCookieJar
  if ($jarXsrf) { $script:XsrfToken = $jarXsrf }

  Remove-Item $hdrFile, $respFile -Force -ErrorAction SilentlyContinue
  if ($reqBodyFile -and (Test-Path $reqBodyFile)) {
    Remove-Item $reqBodyFile -Force -ErrorAction SilentlyContinue
  }

  $codeInt = 0
  [void][int]::TryParse("$code", [ref]$codeInt)
  if ($codeInt -lt 200 -or $codeInt -ge 300) {
    Write-Host "ERROR $code : $text" -ForegroundColor Red
    throw "DSpace $Method $Path failed ($code)"
  }
  return $text
}

function New-RootCommunity([string]$Name) {
  $json = Invoke-DspaceCurl -Method "POST" -Path "/api/core/communities" -Body (New-CommunityMetadataJson $Name)
  $id = Get-DspaceIdFromJson $json
  if (-not $id) { throw "Root community create returned no id" }
  return $id
}

function New-SubCommunity([string]$ParentId, [string]$Name) {
  # RestContract: POST /api/core/communities?parent=<communityUUID>
  # https://github.com/DSpace/RestContract/blob/main/communities.md
  $json = Invoke-DspaceCurl -Method "POST" -Path "/api/core/communities?parent=$ParentId" `
    -Body (New-CommunityMetadataJson $Name)
  $id = Get-DspaceIdFromJson $json
  if (-not $id) { throw "Subcommunity create returned no id for: $Name" }
  return $id
}

function New-Collection([string]$ParentCommunityId, [string]$Name) {
  # RestContract: POST /api/core/collections?parent=<communityUUID>
  $json = Invoke-DspaceCurl -Method "POST" -Path "/api/core/collections?parent=$ParentCommunityId" `
    -Body (New-CommunityMetadataJson $Name)
  $id = Get-DspaceIdFromJson $json
  if (-not $id) { throw "Collection create returned no id for: $Name" }
  return $id
}

try {
  Write-Host "DSpace base: $BaseUrl" -ForegroundColor Green

  if ($ParentCommunityId) {
    $rootId = $ParentCommunityId
    Write-Host "Using existing root/parent community: $rootId" -ForegroundColor Yellow
  } else {
    $rootId = New-RootCommunity -Name $RootName
    Write-Host "Created root community: $RootName => $rootId" -ForegroundColor Green
  }

  $report = New-Object System.Collections.Generic.List[object]
  $report.Add([pscustomobject]@{ Level = "root"; Name = $RootName; Id = $rootId; ParentId = "" }) | Out-Null

  foreach ($facultyName in $FacultyNames) {
    $facultyId = New-SubCommunity -ParentId $rootId -Name $facultyName
    Write-Host "  Faculty: $facultyName => $facultyId"
    $report.Add([pscustomobject]@{ Level = "faculty"; Name = $facultyName; Id = $facultyId; ParentId = $rootId }) | Out-Null

    $semesterId = New-SubCommunity -ParentId $facultyId -Name $SemesterName
    Write-Host "    Semester: $SemesterName => $semesterId"
    $report.Add([pscustomobject]@{ Level = "semester"; Name = $SemesterName; Id = $semesterId; ParentId = $facultyId }) | Out-Null

    $collectionId = New-Collection -ParentCommunityId $semesterId -Name $PeriodName
    Write-Host "      Period collection: $PeriodName => $collectionId"
    $report.Add([pscustomobject]@{ Level = "period"; Name = $PeriodName; Id = $collectionId; ParentId = $semesterId }) | Out-Null
  }

  $outDir = Join-Path $PSScriptRoot "out"
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $outFile = Join-Path $outDir ("dspace-seed-{0:yyyyMMdd-HHmmss}.csv" -f (Get-Date))
  $report | Export-Csv -Path $outFile -NoTypeInformation -Encoding UTF8

  Write-Host ""
  Write-Host "Done. Root community id (set as dspace_root_community_id):" -ForegroundColor Green
  Write-Host $rootId
  Write-Host "CSV report: $outFile"
  Write-Host "Next: Sync from DSpace root (name match ignores Vietnamese diacritics)."
}
finally {
  if (Test-Path $CookieJar) { Remove-Item $CookieJar -Force -ErrorAction SilentlyContinue }
}
