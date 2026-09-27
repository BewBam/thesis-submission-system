# Inspect DSpace hierarchy
# root community -> subcommunities -> collections -> items

param(
  [string]$BaseUrl = $(if ($env:DSPACE_BASE_URL) { $env:DSPACE_BASE_URL } else { "http://localhost:8080/server" }),
  [string]$User = $(if ($env:DSPACE_USER) { $env:DSPACE_USER } else { "" }),
  [string]$Password = $(if ($env:DSPACE_PASSWORD) { $env:DSPACE_PASSWORD } else { "" })
)

$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")

$script:BearerToken = ""
$script:XsrfToken = ""

$CookieJar = Join-Path $env:TEMP ("dspace-inspect-{0}.txt" -f [guid]::NewGuid())


function Get-Header($file, $name) {
    foreach($line in Get-Content $file) {
        if($line -match "^$name`:\s*(.*)$") {
            return $Matches[1].Trim()
        }
    }
    return ""
}


function Login-Dspace {

    Write-Host "Login to DSpace as $User..."

    $csrf = Join-Path $env:TEMP "csrf.hdr"

    curl.exe `
      -sS `
      -D $csrf `
      -o NUL `
      -c $CookieJar `
      "$BaseUrl/api/security/csrf"


    $xsrf = Get-Header $csrf "DSPACE-XSRF-TOKEN"


    $login = Join-Path $env:TEMP "login.hdr"


    curl.exe `
      -sS `
      -D $login `
      -o NUL `
      -b $CookieJar `
      -c $CookieJar `
      -X POST `
      "$BaseUrl/api/authn/login" `
      -H "X-XSRF-TOKEN: $xsrf" `
      -H "Content-Type: application/x-www-form-urlencoded" `
      --data-urlencode "user=$User" `
      --data-urlencode "password=$Password"


    $auth = Get-Header $login "Authorization"

    if($auth -match "Bearer (.*)") {
        $script:BearerToken = $Matches[1]
    }


    $script:XsrfToken = Get-Header $login "DSPACE-XSRF-TOKEN"

    if(!$script:XsrfToken){
        $script:XsrfToken = $xsrf
    }


    if(!$script:BearerToken){
        throw "Cannot get bearer token"
    }


    Write-Host "Login OK" -ForegroundColor Green
}



function Invoke-DspaceGet($path){

    $url="$BaseUrl$path"

    Write-Host "GET $path" -ForegroundColor Cyan


    $result = curl.exe `
      -sS `
      -b $CookieJar `
      -H "Authorization: Bearer $script:BearerToken" `
      -H "X-XSRF-TOKEN: $script:XsrfToken" `
      -H "Accept: application/json" `
      $url


    return $result | ConvertFrom-Json
}



function Show-Community($id,$level){

    $community = Invoke-DspaceGet "/api/core/communities/$id"

    Write-Host ""
    Write-Host (" " * $level) "+ COMMUNITY: $($community.name)" `
        -ForegroundColor Yellow

    Write-Host (" " * ($level+2)) "ID: $($community.id)"


    # children
    $children = Invoke-DspaceGet "/api/core/communities/$id/subcommunities"


    foreach($child in $children._embedded.communities){

        Show-Community $child.id ($level+4)

    }


    # collections

    $collections = Invoke-DspaceGet "/api/core/communities/$id/collections"


    foreach($col in $collections._embedded.collections){

        Write-Host (" " * ($level+2)) `
        "COLLECTION: $($col.name)" `
        -ForegroundColor Green


        Write-Host (" " * ($level+4)) `
        "ID: $($col.id)"


        Show-Items $col.id ($level+6)

    }

}



function Show-Items($collectionId,$level){

    try{

        $items = Invoke-DspaceGet `
          "/api/core/collections/$collectionId/items"


        foreach($item in $items._embedded.items){

            Write-Host (" " * $level) `
            "ITEM: $($item.name)" `
            -ForegroundColor White

            Write-Host (" " * ($level+2)) `
            "$($item.id)"

        }

    }
    catch{

        Write-Host "Cannot read items"

    }

}



try{

    Login-Dspace


    Write-Host ""
    Write-Host "ROOT COMMUNITIES"
    Write-Host "================"


    $roots = Invoke-DspaceGet "/api/core/communities/search/top"


    foreach($root in $roots._embedded.communities){

        Show-Community $root.id 0

    }


}
finally{

    if(Test-Path $CookieJar){
        Remove-Item $CookieJar
    }

}