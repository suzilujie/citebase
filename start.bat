@echo off
rem CiteBase launcher. Keep this file ASCII with CRLF line endings.
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 goto no_powershell

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 goto failed
goto done

:no_powershell
echo PowerShell was not found on this machine.
goto failed

:failed
echo.
echo CiteBase failed to start. Read the messages above.
pause

:done
endlocal
