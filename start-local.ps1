param([int]$Port = 5000)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# Reuse this project's existing local settings/data when running in its worktree.
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if ((Split-Path (Split-Path $PSScriptRoot -Parent) -Leaf) -eq '.worktrees') {
    if (Test-Path -LiteralPath (Join-Path $projectRoot '.env')) { $env:SMARTAIRQ_ENV_PATH = Join-Path $projectRoot '.env' }
    if (Test-Path -LiteralPath (Join-Path $projectRoot 'air_quality.db')) { $env:SMARTAIRQ_DB_PATH = Join-Path $projectRoot 'air_quality.db' }
}
$env:SERVER_PORT = "$Port"
Write-Host "Starting the updated Smart AirQ dashboard at http://localhost:$Port"
python server.py
