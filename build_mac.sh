#!/bin/bash
# Build WK Rotor Control for macOS
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================"
echo "  Build WK Rotor Control (macOS)"
echo "================================================"
echo

if [ ! -d ".venv" ]; then
    echo "[INFO] Creazione ambiente virtuale..."
    python3 -m venv .venv
fi

echo "[INFO] Installazione dipendenze..."
.venv/bin/pip install -q -r requirements.txt

echo "[INFO] Avvio build con PyInstaller (macOS)..."
.venv/bin/python -m PyInstaller \
    --onefile \
    --windowed \
    --name "WKRotorControl" \
    --icon "assets/app_icon.icns" \
    --add-data "index.html:." \
    --add-data "css:css" \
    --add-data "js:js" \
    --add-data "assets/yaesu_map.png:assets" \
    --hidden-import webview \
    --hidden-import fitz \
    --hidden-import PIL \
    --hidden-import PIL._imaging \
    --hidden-import serial \
    --hidden-import serial.tools.list_ports \
    --osx-bundle-identifier "com.wk.rotorcontrol" \
    app.py

if [ $? -ne 0 ]; then
    echo "[ERRORE] Build fallita."
    exit 1
fi

echo
echo "[OK] Build completata!"
echo "App: dist/WKRotorControl.app"
echo
echo "Per distribuire:"
echo "  zip -r WKRotorControl-macOS.zip dist/WKRotorControl.app"
echo
