#!/bin/bash
# Avvio sviluppo WK Rotor Control su macOS
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
    echo "[INFO] Creazione ambiente virtuale..."
    python3 -m venv .venv
fi

echo "[INFO] Installazione dipendenze..."
.venv/bin/pip install -q -r requirements.txt

echo "[INFO] Avvio WK Rotor Control..."
.venv/bin/python app.py
