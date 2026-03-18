@echo off
setlocal

cd /d "%~dp0"
title Restaurar DHCP SIREL

set "ADAPTER=Wi-Fi"

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo Restaurando configuracao DHCP do adaptador %ADAPTER%...
echo.

netsh interface ipv4 set address name="%ADAPTER%" source=dhcp
if errorlevel 1 (
  echo Falha ao restaurar o IP via DHCP.
  pause
  exit /b 1
)

netsh interface ipv4 set dns name="%ADAPTER%" source=dhcp
if errorlevel 1 (
  echo Falha ao restaurar o DNS via DHCP.
  pause
  exit /b 1
)

echo.
echo DHCP restaurado com sucesso.
echo.
pause
endlocal
