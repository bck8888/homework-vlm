@echo off
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
 echo First follow docs\ACCELERATOR-SETUP.md to install the matching GPU environment.
 pause
 exit /b 1
)
set "INSPECTION_PYTHON=%CD%\.venv\Scripts\python.exe"
set "PORT=4174"
start "" "http://127.0.0.1:4174/"
node server.mjs
pause
