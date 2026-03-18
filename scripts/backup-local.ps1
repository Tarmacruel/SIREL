$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..')

function Get-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return $null }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return $null }

  return ($line -replace "^$Name=", '').Trim()
}

function Find-PgDump {
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'bin\pg_dump.exe' } |
    Where-Object { Test-Path $_ }

  if ($candidates) { return $candidates[0] }

  throw 'pg_dump não foi encontrado. Instale o PostgreSQL client tools nesta máquina.'
}

$root = Get-Location
$envFile = Join-Path $root '.env'
$databaseUrl = Get-EnvValue -Path $envFile -Name 'DATABASE_URL'
if (-not $databaseUrl) {
  throw 'DATABASE_URL não encontrada no arquivo .env.'
}

$uri = [System.Uri]$databaseUrl
$dbName = $uri.AbsolutePath.TrimStart('/')
$userInfo = $uri.UserInfo.Split(':', 2)
$dbUser = $userInfo[0]
$dbPassword = if ($userInfo.Count -gt 1) { $userInfo[1] } else { '' }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $root 'storage\backups'
$backupDir = Join-Path $backupRoot $timestamp
$uploadsDir = Join-Path $root 'storage\uploads'
$archivePath = Join-Path $backupRoot ("sirel-backup-$timestamp.zip")
$sqlPath = Join-Path $backupDir 'database.sql'
$uploadsArchive = Join-Path $backupDir 'uploads.zip'
$metaPath = Join-Path $backupDir 'metadata.txt'

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$pgDump = Find-PgDump

Write-Host '🗄️ Gerando dump PostgreSQL...' -ForegroundColor Yellow
$env:PGPASSWORD = $dbPassword
& $pgDump --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$dbName --file=$sqlPath --no-owner --no-privileges
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

if (Test-Path $uploadsDir) {
  Write-Host '📎 Compactando uploads...' -ForegroundColor Yellow
  Compress-Archive -Path (Join-Path $uploadsDir '*') -DestinationPath $uploadsArchive -Force
}

@(
  "SIREL Beta 2.0 - Backup local",
  "Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')",
  "Banco: $dbName",
  "Host: $dbHost:$dbPort",
  "Origem: $root"
) | Set-Content -Path $metaPath -Encoding utf8

Write-Host '📦 Gerando pacote final...' -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $backupDir '*') -DestinationPath $archivePath -Force

Get-ChildItem $backupRoot -Filter 'sirel-backup-*.zip' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 7 |
  Remove-Item -Force

Write-Host "✅ Backup concluído: $archivePath" -ForegroundColor Green
