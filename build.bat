@echo off
chcp 65001 >nul
echo ================================================
echo   Build WK Rotor Control
echo ================================================
echo.

pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [ERRORE] Ambiente virtuale non trovato.
    echo Esegui prima start.bat per crearlo.
    pause
    exit /b 1
)

echo [INFO] Avvio build con PyInstaller...
.venv\Scripts\python -m PyInstaller --onefile --windowed --name "WKRotorControl" --icon "assets/app_icon.ico" --add-data "index.html;." --add-data "css;css" --add-data "js;js" --add-data "assets/yaesu_map.png;assets" --hidden-import webview --hidden-import pythonnet --hidden-import clr_loader --hidden-import cffi --hidden-import fitz --hidden-import PIL --hidden-import PIL._imaging --hidden-import serial --hidden-import serial.tools.list_ports app.py

if %errorlevel% neq 0 (
    echo [ERRORE] Build fallita.
    pause
    exit /b 1
)

echo.
echo [OK] Build completata!
echo Eseguibile: dist\WKRotorControl.exe
echo.
pause
