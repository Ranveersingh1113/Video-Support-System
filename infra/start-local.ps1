$ErrorActionPreference = 'Stop'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$compose = Join-Path $PSScriptRoot 'docker-compose.yml'
$livekitDir = Join-Path $PSScriptRoot 'livekit-native'
$livekitExe = Join-Path $livekitDir 'livekit-server.exe'
$livekitConfig = Join-Path $livekitDir 'livekit.yaml'
$stdout = Join-Path $livekitDir 'livekit.out.log'
$stderr = Join-Path $livekitDir 'livekit.err.log'
$dockerArgs = @('--context', 'desktop-linux')

docker @dockerArgs compose -f $compose up -d postgres redis egress
if ($LASTEXITCODE -ne 0) {
  throw 'Docker infra failed to start'
}

$redisReady = $false
for ($i = 0; $i -lt 20; $i++) {
  $result = docker @dockerArgs compose -f $compose exec -T redis redis-cli ping 2>$null
  if ($LASTEXITCODE -eq 0 -and $result -match 'PONG') {
    $redisReady = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $redisReady) {
  throw 'Redis did not become ready'
}

Get-Process livekit-server -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $livekitExe } |
  Stop-Process -Force

Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
Start-Process `
  -FilePath $livekitExe `
  -ArgumentList '--config', "`"$livekitConfig`"" `
  -WorkingDirectory $livekitDir `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -WindowStyle Hidden

for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:7880' -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      Write-Host 'Postgres, Redis, Egress, and native LiveKit are ready.'
      exit 0
    }
  } catch {
    # Keep waiting.
  }
}

if (Test-Path $stderr) {
  Get-Content $stderr -Tail 40
}
throw 'Native LiveKit did not become ready'
