@echo off
setlocal

cd /d "%~dp0"
title SIREL - Iniciar com Tunel

set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_CMD=%NODE_DIR%\npm.cmd"

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

echo.
echo Iniciando backend, frontend e tunel Cloudflare...
echo.

start "SIREL Backend :3030" cmd /k "cd /d ""%~dp0"" && call ""%NPM_CMD%"" run dev --workspace server"
start "SIREL Frontend :5173" cmd /k "cd /d ""%~dp0"" && call ""%NPM_CMD%"" run dev --workspace client"

echo Aguardando frontend iniciar na porta 5173...
powershell -NoProfile -Command "Start-Sleep -Seconds 8"

start "SIREL Tunnel -> :5173" cmd /k "cloudflared tunnel --url http://localhost:5173"

echo.
echo Janelas iniciadas:
echo - Backend:  http://localhost:3030
echo - Frontend: http://localhost:5173
echo - Tunnel:   URL sera exibida na janela do cloudflared
echo.
echo Para encerrar, feche as janelas abertas.
echo.
pause

endlocal
