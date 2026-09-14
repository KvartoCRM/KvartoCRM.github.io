$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = 'http://localhost:3000/'

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    'Для локального запуска KvartoCRM требуется Node.js. Используйте публичный адрес приложения.',
    'KvartoCRM'
  ) | Out-Null
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  $install = Start-Process -FilePath 'npm.cmd' -ArgumentList 'install' -WorkingDirectory $projectRoot -Wait -PassThru
  if ($install.ExitCode -ne 0) { throw 'Не удалось установить компоненты KvartoCRM.' }
}

$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  $logPath = Join-Path $projectRoot '.vite-dev.log'
  $errorLogPath = Join-Path $projectRoot '.vite-dev-error.log'
  Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'dev', '--', '--host', '127.0.0.1' `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorLogPath | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
      # The server is still starting.
    }
  }
  if (-not $ready) { throw 'KvartoCRM не запустилась за отведённое время.' }
}

Start-Process $localUrl
