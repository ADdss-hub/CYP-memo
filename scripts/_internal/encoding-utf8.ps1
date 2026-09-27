# CYP-memo UTF-8 session / file hygiene (dot-source only).
# Root-cause control for Windows mojibake: console code page, PS default UTF-16 redirects,
# and Set-Content -Encoding UTF8 (BOM). Do not run this file directly.

Set-StrictMode -Version Latest

function Get-CypUtf8NoBomEncoding {
  return [System.Text.UTF8Encoding]::new($false)
}

function Initialize-CypUtf8Session {
  <#
    .SYNOPSIS
      Force UTF-8 for the current PowerShell process and child env inheritance.
  #>
  try { cmd /c "chcp 65001 >nul" | Out-Null } catch { }

  $utf8 = Get-CypUtf8NoBomEncoding
  try {
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
  } catch { }

  $global:OutputEncoding = $utf8

  # Child processes (Node/Python) inherit these
  $env:PYTHONUTF8 = '1'
  $env:PYTHONIOENCODING = 'utf-8'
  # Prefer UTF-8 when tools honor it (harmless if ignored)
  if (-not $env:LANG) { $env:LANG = 'C.UTF-8' }
  if (-not $env:LC_ALL) { $env:LC_ALL = 'C.UTF-8' }

  # Avoid PS 5.1 defaulting some pipelines to UTF-16 when host redirects
  try {
    $PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
    $PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
    $PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
  } catch { }
}

function Write-CypUtf8Text {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value,
    [switch]$Append
  )
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $enc = Get-CypUtf8NoBomEncoding
  if ($Append) {
    [System.IO.File]::AppendAllText($Path, $Value, $enc)
  } else {
    [System.IO.File]::WriteAllText($Path, $Value, $enc)
  }
}

function Repair-CypTextFile {
  <#
    .SYNOPSIS
      Normalize a text log/report to UTF-8 (no BOM): strip NULs, convert UTF-16, drop UTF-8 BOM.
    .OUTPUTS
      $true if file changed or already clean UTF-8; $false if skipped/missing.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$ThrowOnMojibake
  )
  if (-not (Test-Path -LiteralPath $Path)) { return $false }

  $raw = [System.IO.File]::ReadAllBytes($Path)
  if ($raw.Length -eq 0) { return $true }

  $changed = $false
  $text = $null

  if ($raw.Length -ge 2 -and $raw[0] -eq 0xFF -and $raw[1] -eq 0xFE) {
    $text = [System.Text.Encoding]::Unicode.GetString($raw, 2, $raw.Length - 2)
    $changed = $true
  } elseif ($raw.Length -ge 2 -and $raw[0] -eq 0xFE -and $raw[1] -eq 0xFF) {
    $text = [System.Text.Encoding]::BigEndianUnicode.GetString($raw, 2, $raw.Length - 2)
    $changed = $true
  } else {
    $offset = 0
    if ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF) {
      $offset = 3
      $changed = $true
    }
    # Truncate at first NUL pad (Start-Process redirect artifact)
    $nulAt = -1
    for ($i = $offset; $i -lt $raw.Length; $i++) {
      if ($raw[$i] -eq 0) { $nulAt = $i; break }
    }
    if ($nulAt -ge 0) {
      $len = $nulAt - $offset
      $slice = New-Object byte[] $len
      [Array]::Copy($raw, $offset, $slice, 0, $len)
      $rawBody = $slice
      $changed = $true
    } else {
      if ($offset -eq 0) {
        $rawBody = $raw
      } else {
        $len = $raw.Length - $offset
        $rawBody = New-Object byte[] $len
        [Array]::Copy($raw, $offset, $rawBody, 0, $len)
      }
    }
    try {
      $text = [System.Text.Encoding]::UTF8.GetString($rawBody)
    } catch {
      $text = [System.Text.Encoding]::UTF8.GetString($rawBody)
    }
  }

  # Strip any remaining NUL
  if ($text.IndexOf([char]0) -ge 0) {
    $text = $text.Replace([string][char]0, '')
    $changed = $true
  }

  # Mojibake markers via UTF-8 hex (avoid self-hitting this script)
  $markerHex = @(
    'e79281e68d90', 'e98d99e6889d', 'e5a8b4e5acad', 'e996b0e5b687',
    'e6b5a3e8b7a8e695a4', 'e996aee384a7e8aeb2', 'e98f82e59ba8',
    'e98eb6e383a5e686a1', 'e5a8b4e5acade798af', 'e6beb6e59ba7e7b995',
    'e79281e38288e79889', 'e9949fe696a4e68bb7', 'c3afc2bfc2bd'
  )
  $hit = $false
  foreach ($h in $markerHex) {
    $bytes = New-Object byte[] ($h.Length / 2)
    for ($i = 0; $i -lt $bytes.Length; $i++) {
      $bytes[$i] = [Convert]::ToByte($h.Substring($i * 2, 2), 16)
    }
    $m = [System.Text.Encoding]::UTF8.GetString($bytes)
    if ($text.Contains($m)) { $hit = $true; break }
  }
  if ($hit -and $ThrowOnMojibake) {
    throw "Mojibake markers in $Path"
  }

  if ($changed) {
    Write-CypUtf8Text -Path $Path -Value $text
  }
  return $true
}

# Auto-init when dot-sourced (idempotent-ish)
Initialize-CypUtf8Session
