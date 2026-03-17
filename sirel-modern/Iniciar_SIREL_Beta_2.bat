@echo off
setlocal

cd /d "%~dp0"
title SIREL Beta 2.0

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

if not exist "node_modules" (
  echo.
  echo Dependencias nao encontradas. Executando npm install...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar as dependencias.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".env" if exist ".env.example" (
  echo.
  echo Arquivo .env nao encontrado. Copiando .env.example...
  copy /y ".env.example" ".env" >nul
)

echo.
echo Iniciando servidor e frontend da Beta 2.0...
echo URL esperada: http://localhost:5173
echo Para encerrar, feche esta janela ou pressione Ctrl+C.
echo.

call "%NPM_CMD%" run dev

if errorlevel 1 (
  echo.
  echo O servidor foi encerrado com erro.
  echo.
  pause
  exit /b 1
)

endlocal
