$ErrorActionPreference = 'Stop'

$compose = Join-Path $PSScriptRoot 'docker-compose.yml'
$livekitExe = Join-Path $PSScriptRoot 'livekit-native\livekit-server.exe'
$dockerArgs = @('--context', 'desktop-linux')

Get-Process livekit-server -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $livekitExe } |
  Stop-Process -Force

docker @dockerArgs compose -f $compose stop egress redis postgres
Write-Host 'Stopped native LiveKit, Egress, Redis, and Postgres.'
