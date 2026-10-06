# Shared HTTPS-safe JSON API helper for verify scripts (PS 5.1 + self-signed)
function Invoke-CypJsonApi {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET','POST','PATCH','PUT','DELETE')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [int]$TimeoutSec = 20
  )
  if ($Url -match '^https://') { Enable-CypInsecureLocalHttps }
  $tmp = Join-Path $env:TEMP ("cyp-api-" + [guid]::NewGuid().ToString('N') + '.json')
  $bodyFile = $null
  try {
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      $args = [System.Collections.Generic.List[string]]::new()
      [void]$args.Add('-sS')
      if ($Url -match '^https://') { [void]$args.Add('-k') }
      [void]$args.Add('--max-time'); [void]$args.Add("$TimeoutSec")
      [void]$args.Add('-X'); [void]$args.Add($Method)
      [void]$args.Add('-H'); [void]$args.Add('Accept: application/json')
      foreach ($k in $Headers.Keys) {
        [void]$args.Add('-H'); [void]$args.Add("${k}: $($Headers[$k])")
      }
      if ($null -ne $Body) {
        $json = if ($Body -is [string]) { $Body } else { ($Body | ConvertTo-Json -Compress -Depth 8) }
        $bodyFile = Join-Path $env:TEMP ("cyp-api-body-" + [guid]::NewGuid().ToString('N') + '.json')
        [System.IO.File]::WriteAllText($bodyFile, $json, [System.Text.UTF8Encoding]::new($false))
        [void]$args.Add('-H'); [void]$args.Add('Content-Type: application/json')
        [void]$args.Add('--data-binary'); [void]$args.Add("@$bodyFile")
      }
      [void]$args.Add('-o'); [void]$args.Add($tmp)
      [void]$args.Add('-w'); [void]$args.Add('%{http_code}')
      [void]$args.Add($Url)
      $codeText = & curl.exe @($args.ToArray()) 2>$null
      $code = 0
      if ($codeText -match '^\d+$') { $code = [int]$codeText }
      $text = ''
      if (Test-Path -LiteralPath $tmp) { $text = [System.IO.File]::ReadAllText($tmp) }
      $obj = $null
      try { $obj = $text | ConvertFrom-Json -ErrorAction Stop } catch { $obj = $null }
      return [pscustomobject]@{ StatusCode = $code; Body = $text; Json = $obj }
    }
    # fallback: Invoke-WebRequest
    $hdr = @{}
    foreach ($k in $Headers.Keys) { $hdr[$k] = [string]$Headers[$k] }
    $params = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true; TimeoutSec = $TimeoutSec; Headers = $hdr }
    if ($null -ne $Body) {
      $params.ContentType = 'application/json'
      $params.Body = if ($Body -is [string]) { $Body } else { ($Body | ConvertTo-Json -Compress -Depth 8) }
    }
    $resp = Invoke-WebRequest @params
    $obj = $null
    try { $obj = $resp.Content | ConvertFrom-Json -ErrorAction Stop } catch { }
    return [pscustomobject]@{ StatusCode = [int]$resp.StatusCode; Body = $resp.Content; Json = $obj }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $tmp
    if ($bodyFile) { Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $bodyFile }
  }
}
