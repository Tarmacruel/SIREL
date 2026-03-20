@echo off
setlocal

cd /d "%~dp0"
title SIREL - Iniciar com Tunel e Log

set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"
set "LOG_DIR=%~dp0storage\logs"

if exist "%NODE_DIR%\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
)

if not exist "%NPM_CMD%" (
  echo.
  echo Node.js nao foi encontrado em "%NODE_DIR%".
  echo Instale o Node.js 22+ e tente novamente.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo.
  echo Este arquivo deve ficar dentro da pasta "sirel-modern".
  echo Pasta atual: %cd%
  echo.
  pause
  exit /b 1
)

if not exist ".env" if exist ".env.example" (
  echo.
  echo Arquivo .env nao encontrado. Copiando .env.example...
  copy /y ".env.example" ".env" >nul
)

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo.
  echo cloudflared nao encontrado no PATH.
  echo Instale o Cloudflare Tunnel e tente novamente.
  echo.
  pause
  exit /b 1
)

if not exist "%LOG_DIR%" (
  mkdir "%LOG_DIR%" >nul 2>&1
)

echo.
echo Iniciando backend, frontend e tunel Cloudflare com log...
echo Logs do tunel em: %LOG_DIR%
echo.

start "SIREL Backend :3030" cmd /k "cd /d ""%~dp0"" && call ""%NPM_CMD%"" run dev --workspace server"
start "SIREL Frontend :5173" cmd /k "cd /d ""%~dp0"" && call ""%NPM_CMD%"" run dev --workspace client"

echo Aguardando frontend iniciar na porta 5173...
powershell -NoProfile -Command "Start-Sleep -Seconds 8"

start "SIREL Tunnel -> :5173 (com log)" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command ^
  "$logDir = '%LOG_DIR%';" ^
  "New-Item -ItemType Directory -Force -Path $logDir | Out-Null;" ^
  "$ts = Get-Date -Format 'yyyyMMdd-HHmmss';" ^
  "$logFile = Join-Path $logDir ('cloudflare-tunnel-' + $ts + '.txt');" ^
  "$latest = Join-Path $logDir 'cloudflare-tunnel-latest.txt';" ^
  "Write-Host ('Gravando log em: ' + $logFile);" ^
  "cloudflared tunnel --url http://localhost:5173 2>&1 | Tee-Object -FilePath $logFile;" ^
  "Copy-Item -Force $logFile $latest;"

echo.
echo Janelas iniciadas:
echo - Backend:  http://localhost:3030
echo - Frontend: http://localhost:5173
echo - Tunnel:   URL sera exibida na janela do cloudflared
echo - Log:      %LOG_DIR%\cloudflare-tunnel-latest.txt
echo.
echo Para encerrar, feche as janelas abertas.
echo.
pause

endlocal
