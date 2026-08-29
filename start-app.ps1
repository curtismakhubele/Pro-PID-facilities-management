$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 18 or newer is required. Install it from https://nodejs.org, then run this file again.' -ForegroundColor Yellow
  exit 1
}

Set-Location -LiteralPath $appRoot
node server.js
