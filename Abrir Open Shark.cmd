@echo off
rem Abre Open Shark con el Electron instalado en el proyecto.
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Falta instalar las dependencias. Ejecuta: npm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
