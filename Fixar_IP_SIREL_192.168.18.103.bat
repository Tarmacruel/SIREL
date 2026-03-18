@echo off
setlocal

cd /d "%~dp0"
title Fixar IP SIREL

set "ADAPTER=Wi-Fi"
set "IP=192.168.18.103"
set "MASK=255.255.255.0"
set "GATEWAY=192.168.18.1"
set "DNS=192.168.18.1"

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo Fixando IP da maquina para o SIREL...
echo Adaptador: %ADAPTER%
echo IP: %IP%
echo Mascara: %MASK%
echo Gateway: %GATEWAY%
echo DNS: %DNS%
echo.

netsh interface ipv4 set address name="%ADAPTER%" static %IP% %MASK% %GATEWAY% 1
if errorlevel 1 (
  echo Falha ao definir o IP estatico.
  pause
  exit /b 1
)

netsh interface ipv4 set dns name="%ADAPTER%" static %DNS% primary
if errorlevel 1 (
  echo Falha ao definir o DNS.
  pause
  exit /b 1
)

echo.
echo IP fixado com sucesso.
echo Link da rede local: http://%IP%:5173
echo.
pause
endlocal
