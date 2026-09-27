# Capture command output as UTF-8 (no BOM) — for agents / operators.
# Usage:
#   powershell -NoProfile -File scripts\_internal\capture-utf8.ps1 -OutFile reports\P6\_laneX.log -- pnpm test
# Do NOT use PowerShell `>` / `Out-File` defaults (UTF-16 on Windows PowerShell 5.1).

param(
  [Parameter(Mandatory = $true)][string]$OutFile,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Command
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'encoding-utf8.ps1')

if (-not $Command -or $Command.Count -eq 0) {
  Write-Error 'Missing command after --'
  exit 2
}

# Drop leading '--' if present
if ($Command[0] -eq '--') {
  $Command = $Command[1..($Command.Count - 1)]
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$tmp = [System.IO.Path]::GetTempFileName()
try {
  $cmdLine = ($Command -join ' ')
  cmd /c "chcp 65001 >nul & $cmdLine" > $tmp 2>&1
  $code = $LASTEXITCODE
  Repair-CypTextFile -Path $tmp | Out-Null
  $text = [System.IO.File]::ReadAllText($tmp, (Get-CypUtf8NoBomEncoding))
  Write-CypUtf8Text -Path $OutFile -Value $text
  exit $code
} finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
