@echo off
title Mason School of Business - Schedule Builder
cd /d "%~dp0"

echo.
echo  ================================================================
echo    Mason School of Business - Schedule Builder
echo  ================================================================
echo.
echo  Starting up, please wait...
echo.

REM Check Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python is not installed on this computer.
    echo.
    echo  Please ask IT to install Python from:
    echo  https://www.python.org/downloads/
    echo.
    echo  Make sure "Add Python to PATH" is checked during install.
    echo.
    pause
    exit /b 1
)

REM Install / update required packages silently
echo  Checking required packages (first run may take a minute)...
pip install -r requirements.txt -q --disable-pip-version-check
if errorlevel 1 (
    echo.
    echo  [ERROR] Could not install required packages.
    echo  Please check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

echo  Packages ready.
echo.
echo  ================================================================
echo    The app will open in your web browser automatically.
echo.
echo    If your browser does not open, go to:
echo    http://localhost:5000
echo.
echo    IMPORTANT: Do NOT close this window while using the app.
echo    To stop the app, close this window or press Ctrl+C.
echo  ================================================================
echo.

python app.py

echo.
echo  The Schedule Builder has stopped.
pause
