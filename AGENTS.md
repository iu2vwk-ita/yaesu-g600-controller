# AGENTS.md — WK Rotor Control

## What this is

A single-file desktop web app (HTML/CSS/JS + Canvas) packaged via **pywebview** for Windows (Edge WebView2) and **macOS** (WebKit). It is **not** a client-server app; Python only opens a native window that loads `index.html` from disk.

## Repo layout

```
yaesu-g600-controller/
├── app.py              # Launcher: pywebview window + serial bridge + NS6T maps
├── index.html          # Single-page UI
├── css/style.css       # Dark theme, Orbitron/Share Tech Mono fonts
├── js/app.js           # Canvas compass, display updates, events
├── js/rotor.js         # GS-232 protocol, simulation, Web Serial API, Python serial
├── start.bat           # Dev run (Windows)
├── build.bat           # Build dist/WKRotorControl.exe (Windows)
├── start_mac.sh        # Dev run (macOS)
├── build_mac.sh        # Build WKRotorControl.app (macOS)
├── requirements.txt
└── assets/             # Optional map image (map.png/jpg/jpeg)
```

## Developer commands

| Task | Windows | macOS |
|------|---------|-------|
| Run from source | `start.bat` | `bash start_mac.sh` |
| Build app | `build.bat` | `bash build_mac.sh` |

### Windows
```
.venv\Scripts\python -m PyInstaller --onefile --windowed --name "WKRotorControl" --icon "assets/app_icon.ico" --add-data "index.html;." --add-data "css;css" --add-data "js;js" --add-data "assets/yaesu_map.png;assets" --hidden-import webview --hidden-import pythonnet --hidden-import clr_loader --hidden-import cffi --hidden-import fitz --hidden-import PIL --hidden-import PIL._imaging --hidden-import serial --hidden-import serial.tools.list_ports app.py
```

### macOS
```
.venv/bin/python -m PyInstaller --onefile --windowed --name "WKRotorControl" --icon "assets/app_icon.icns" --add-data "index.html:." --add-data "css:css" --add-data "js:js" --add-data "assets/yaesu_map.png:assets" --hidden-import webview --hidden-import fitz --hidden-import PIL --hidden-import PIL._imaging --hidden-import serial --hidden-import serial.tools.list_ports --osx-bundle-identifier "com.wk.rotorcontrol" app.py
```

Key difference: Windows uses `--add-data "dir;dir"` (semicolons), macOS uses `--add-data "dir:dir"` (colons).

## Architecture gotchas

- **No HTTP server.** `app.py` calls `webview.create_window('index.html', ...)`. The UI runs at `file://` inside WebView.
- **Serial hardware (Windows):** The frontend (`js/rotor.js`) talks to the rotator via the **Web Serial API**, which works inside Edge WebView2.
- **Serial hardware (macOS):** macOS WebKit does **not** support Web Serial API. Instead, `app.py` exposes a **pyserial bridge** via the pywebview JS API. The frontend auto-detects which mode to use.
- **Serial bridge flow:** `rotor.js` → `window.pywebview.api.list_serial_ports()` → populates dropdown → `open_serial_port(port, baud)` → background reader thread queues RX → JS polls `serial_receive_line()` every 80ms.
- **Simulation fallback:** If no serial port is connected, `rotor.js` runs a 50ms timer that simulates azimuth movement. The app is fully usable without hardware.
- **NS6T map generation:** Uses PyMuPDF (`fitz`) + Pillow for PDF→PNG conversion.
- **pythonnet** is Windows-only; omitted from macOS requirements.

## Build requirements

| Platform | Runtime | Python |
|----------|---------|--------|
| Windows 10/11 | Edge WebView2 (pre-installed) | 3.x + venv |
| macOS 12+ | WebKit (built-in) | 3.x + venv |

PyInstaller bundles `index.html`, `css/`, `js/`, and `assets/` as data files; forgetting `--add-data` breaks the build.

## macOS distribution

```bash
bash build_mac.sh
# Output: dist/WKRotorControl.app

# Zip for distribution
zip -r WKRotorControl-macOS.zip dist/WKRotorControl.app

# Or notarize for Gatekeeper (optional, requires Apple Developer account)
# xcrun notarytool submit WKRotorControl-macOS.zip --apple-id your@email.com --team-id XXXXXXXXXX --wait
```

macOS apps need `pyserial` at runtime; it's bundled automatically by the build script.

## Style / workflow notes

- The UI is intentionally left as-is unless the user explicitly asks to change it. The user has previously requested: *"non modificare l'app va bene cosi come interfaccia e funzioni."*
- There are **no tests, no lint config, no CI.** Verify by running the app or the built bundle directly.
- Map assets are optional; the canvas draws a stylized fallback world map if none is provided.
