$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Find-NpmCmd {
  $nodeDir = 'C:\Program Files\nodejs'
  $npmCmd = Join-Path $nodeDir 'npm.cmd'

  if (Test-Path $npmCmd) {
    $env:Path = "$nodeDir;$env:Path"
    return $npmCmd
  }

  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw 'Node.js não foi encontrado. Instale o Node.js 22+ antes de iniciar o SIREL.'
}

Write-Host '🚀 Iniciando SIREL Beta 2.0 - Operação local' -ForegroundColor Cyan
$npmCmd = Find-NpmCmd

if (-not (Test-Path 'package.json')) {
  throw 'Este script deve ser executado dentro da pasta sirel-modern.'
}

if (-not (Test-Path 'node_modules')) {
  Write-Host '📦 Instalando dependências...' -ForegroundColor Yellow
  & $npmCmd install
}

if ((-not (Test-Path '.env')) -and (Test-Path '.env.example')) {
  Write-Host '🧩 Copiando .env.example para .env...' -ForegroundColor Yellow
  Copy-Item '.env.example' '.env'
}

Write-Host '🗄️ Aplicando migrations...' -ForegroundColor Yellow
& $npmCmd run db:migrate

Write-Host '🔎 Verificando seed básico...' -ForegroundColor Yellow
& $npmCmd run db:check-seeded
if ($LASTEXITCODE -ne 0) {
  Write-Host '🌱 Base vazia. Executando seed básico...' -ForegroundColor Yellow
  & $npmCmd run legacy:seed:basics
}

Write-Host '✅ SIREL pronto para uso local.' -ForegroundColor Green
Write-Host '🔗 Local: http://localhost:5173' -ForegroundColor Green
Write-Host '🌐 Rede:  http://192.168.18.103:5173' -ForegroundColor Green
Write-Host '🔑 Beta:  jonatas.sousa / SirelBeta@2026' -ForegroundColor Green
Write-Host 'ℹ️  Use Ctrl+C para encerrar.' -ForegroundColor DarkGray

& $npmCmd run dev
