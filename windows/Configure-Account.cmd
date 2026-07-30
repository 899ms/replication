@echo off
setlocal
chcp 65001 >nul
set "PYTHON=%~dp0resources\replication-runtime\python\python.exe"
set "CONFIGURE=%~dp0resources\configure-runtime.py"

if not exist "%PYTHON%" (
  echo Embedded Python is missing. Please extract the whole ZIP before running this file.
  pause
  exit /b 1
)

"%PYTHON%" "%CONFIGURE%"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo Account configuration was not completed.
) else (
  echo Account configuration completed. You can now open Replication.exe.
)
pause
exit /b %RESULT%
