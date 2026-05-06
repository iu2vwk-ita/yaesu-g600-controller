#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WK Rotor Control - Desktop Launcher
Avvia l'app in una finestra dedicata senza browser esterno.
Usa pywebview (Edge WebView2 / Chromium integrato su Windows).
"""

import os
import sys
import shutil
import urllib.request
import urllib.parse
import base64
import threading
import queue
import time
import webview
import fitz  # PyMuPDF per conversione PDF

try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

def get_script_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_DIR = get_script_dir()
os.chdir(BASE_DIR)

MAP_FILE = os.path.join(BASE_DIR, 'assets', 'yaesu_map.b64')
MAP_PNG  = os.path.join(BASE_DIR, 'assets', 'yaesu_map.png')

def _log(msg):
    print(f'[RotorApi] {msg}', flush=True)

class RotorApi:
    NS6T_URL = 'https://ns6t.net/azimuth/code/azimuth.fcgi'

    def _html_assets_dir(self):
        """Directory assets/ relativa al HTML (_MEIPASS per exe, BASE_DIR per dev)."""
        if getattr(sys, 'frozen', False):
            return os.path.join(sys._MEIPASS, 'assets')
        return os.path.join(BASE_DIR, 'assets')

    def _write_png(self, png_bytes):
        """Scrivi il PNG sia nella dir persistente (exe) che in quella live (HTML)."""
        dirs = [os.path.join(BASE_DIR, 'assets')]
        html_dir = self._html_assets_dir()
        if html_dir not in dirs:
            dirs.append(html_dir)
        for d in dirs:
            try:
                os.makedirs(d, exist_ok=True)
                path = os.path.join(d, 'yaesu_map.png')
                with open(path, 'wb') as f:
                    f.write(png_bytes)
                _log(f'PNG scritto: {path} ({len(png_bytes)} bytes)')
            except Exception as e:
                _log(f'ERRORE scrittura PNG in {d}: {e}')

    def persist_map(self):
        """Salva il PNG corrente dalla dir HTML nella dir persistente (vicino all'exe)."""
        html_dir = self._html_assets_dir()
        src = os.path.join(html_dir, 'yaesu_map.png')
        dst = MAP_PNG
        if not os.path.exists(src) or os.path.getsize(src) == 0:
            _log('persist_map: PNG non trovato nella dir HTML')
            return False
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            _log(f'persist_map: copiato {src} -> {dst}')
            return True
        except Exception as e:
            _log(f'persist_map: ERRORE {e}')
            return False

    def save_map(self, data_url):
        """Salva la mappa base64 su file e PNG in ogni directory necessaria."""
        if not data_url or len(data_url) < 100:
            _log('save_map: rifiutato, data_url troppo corto o vuoto')
            return False
        try:
            # Salva b64 nella dir persistente
            os.makedirs(os.path.dirname(MAP_FILE), exist_ok=True)
            with open(MAP_FILE, 'w', encoding='utf-8') as f:
                f.write(data_url)
            _log(f'save_map: b64 salvato ({len(data_url)} bytes)')
            # Decodifica e scrivi PNG in TUTTE le dir necessarie
            if data_url.startswith('data:image/'):
                header, b64 = data_url.split(',', 1)
                png_bytes = base64.b64decode(b64)
                self._write_png(png_bytes)
            return True
        except Exception as e:
            _log(f'save_map: ERRORE {e}')
            return False

    def _html_assets_dir(self):
        """Directory assets/ relativa al HTML (sys._MEIPASS per exe, BASE_DIR per dev)."""
        if getattr(sys, 'frozen', False):
            return os.path.join(sys._MEIPASS, 'assets')
        return os.path.join(BASE_DIR, 'assets')

    def load_map(self):
        """Assicura che il PNG utente sia disponibile e restituisce il data URL."""
        user_png = MAP_PNG  # persistente (vicino all'exe)
        live_dir = self._html_assets_dir()
        live_png = os.path.join(live_dir, 'yaesu_map.png')

        # Se esiste il PNG utente, copialo nella dir live (per JS)
        if os.path.exists(user_png) and os.path.getsize(user_png) > 0:
            _log(f'load_map: trovato PNG utente ({os.path.getsize(user_png)} bytes)')
            png_path = user_png
            try:
                os.makedirs(live_dir, exist_ok=True)
                shutil.copy2(user_png, live_png)
                _log(f'load_map: copiato in dir live: {live_png}')
            except Exception as e:
                _log(f'load_map: ERRORE copia: {e}')
        elif os.path.exists(live_png) and os.path.getsize(live_png) > 0:
            _log(f'load_map: nessun PNG utente, uso default ({os.path.getsize(live_png)} bytes)')
            png_path = live_png
        else:
            _log('load_map: nessun PNG trovato')
            return None

        try:
            with open(png_path, 'rb') as f:
                png_bytes = f.read()
            b64 = base64.b64encode(png_bytes).decode('ascii')
            data_url = f'data:image/png;base64,{b64}'
            _log(f'load_map: OK, data URL {len(data_url)} chars')
            return data_url
        except Exception as e:
            _log(f'load_map: ERRORE lettura PNG: {e}')
            return None

    def clear_map(self):
        """Rimuovi la mappa salvata."""
        try:
            for p in (MAP_FILE, MAP_PNG):
                if os.path.exists(p):
                    os.remove(p)
            _log('clear_map: OK')
            return True
        except Exception as e:
            _log(f'clear_map: ERRORE {e}')
            return False

    def generate_map(self, locator, distance='15000', countries='on', labels='on'):
        """Genera la mappa azimuthal via NS6T, salva su file, restituisce base64 PNG."""
        if not locator or not locator.strip():
            _log('generate_map: locator vuoto')
            return None

        _log(f'generate_map: richiesta NS6T per locator={locator.strip()}...')

        data = urllib.parse.urlencode({
            'title': locator.strip(),
            'location': locator.strip(),
            'paper': 'SQUARE',
            'distance': str(distance),
            'countries': 'on' if countries == 'on' else '',
            'states': '',
            'uscities': '',
            'latlong': '',
            'gridsquares': '',
            'bw': '',
            'bluefill': 'on',
            'pstrotator': '',
            'noheadingfooting': 'on',
            'view': '',
        }).encode('ascii')

        pdf_bytes = None
        try:
            req = urllib.request.Request(self.NS6T_URL, data=data, method='POST')
            req.add_header('User-Agent', 'WKRotorControl/1.0')
            with urllib.request.urlopen(req, timeout=60) as resp:
                pdf_bytes = resp.read()
            _log(f'generate_map: PDF ricevuto, {len(pdf_bytes)} bytes')
        except Exception as e:
            _log(f'generate_map: ERRORE richiesta NS6T: {e}')
            return None

        if not pdf_bytes or len(pdf_bytes) < 100:
            _log('generate_map: PDF troppo piccolo o vuoto')
            return None

        result = self._pdf_bytes_to_png(pdf_bytes)
        if result:
            ok = self.save_map(result)
            if not ok:
                _log('generate_map: ERRORE CRITICO salvataggio PNG fallito!')
            # Scrivi sempre nella dir live (HTML) come backup
            if result.startswith('data:image/'):
                try:
                    _, b64 = result.split(',', 1)
                    png_bytes = base64.b64decode(b64)
                    live_dir = self._html_assets_dir()
                    os.makedirs(live_dir, exist_ok=True)
                    live_png = os.path.join(live_dir, 'yaesu_map.png')
                    with open(live_png, 'wb') as f:
                        f.write(png_bytes)
                    _log(f'generate_map: PNG live scritto: {live_png}')
                except Exception as e:
                    _log(f'generate_map: ERRORE scrittura live PNG: {e}')
        return result

    def pdf_to_png(self, pdf_base64):
        """Converte un PDF base64 in PNG (per upload manuale)."""
        if not pdf_base64 or len(pdf_base64) < 100:
            return None
        try:
            pdf_bytes = base64.b64decode(pdf_base64.split(',')[-1])
        except Exception:
            return None
        return self._pdf_bytes_to_png(pdf_bytes)

    def _pdf_bytes_to_png(self, pdf_bytes):
        """Renderizza la prima pagina del PDF come PNG e restituisce base64 data URL."""
        doc = None
        try:
            doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            if doc.page_count == 0:
                return None
            page = doc[0]
            mat = fitz.Matrix(2, 2)  # 2x zoom per buona qualita'
            pix = page.get_pixmap(matrix=mat)
            png_bytes = pix.tobytes('png')
            b64 = base64.b64encode(png_bytes).decode('ascii')
            return f'data:image/png;base64,{b64}'
        except Exception as e:
            _log(f'_pdf_bytes_to_png: ERRORE {e}')
            return None
        finally:
            if doc:
                doc.close()

class SerialBridge:
    """Bridge seriale per macOS (WebKit non supporta Web Serial API)."""

    def __init__(self):
        self._ser = None
        self._lock = threading.Lock()
        self._rx_queue = queue.Queue()
        self._reader_thread = None
        self._running = False

    def _log(self, msg):
        print(f'[SerialBridge] {msg}', flush=True)

    def list_ports(self):
        """Restituisce lista porte seriali disponibili come [{port, description}]."""
        if not HAS_SERIAL:
            return []
        ports = []
        for p in serial.tools.list_ports.comports():
            ports.append({'port': p.device, 'description': p.description or p.device})
        return ports

    def open(self, port, baud=9600):
        """Apre la porta seriale specificata."""
        if not HAS_SERIAL:
            return False
        with self._lock:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.close()
                except Exception:
                    pass
            try:
                self._ser = serial.Serial(port, baudrate=int(baud), timeout=0.5)
                self._running = True
                self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
                self._reader_thread.start()
                self._log(f'Aperta {port} @ {baud}')
                return True
            except Exception as e:
                self._log(f'Errore apertura {port}: {e}')
                self._ser = None
                return False

    def close(self):
        """Chiude la porta seriale."""
        self._running = False
        with self._lock:
            if self._ser and self._ser.is_open:
                try:
                    self._ser.close()
                except Exception:
                    pass
            self._ser = None
        self._log('Porta chiusa')

    def send(self, data):
        """Invia dati sulla seriale (con terminatore \\r)."""
        with self._lock:
            if self._ser and self._ser.is_open:
                try:
                    cmd = (data + '\r').encode('ascii', errors='ignore')
                    self._ser.write(cmd)
                    self._ser.flush()
                    self._log(f'TX: {data}')
                    return True
                except Exception as e:
                    self._log(f'TX errore: {e}')
                    return False
        return False

    def receive_line(self):
        """Legge una riga dal buffer di ricezione (non bloccante). Restituisce None se vuoto."""
        try:
            return self._rx_queue.get_nowait()
        except queue.Empty:
            return None

    def _reader_loop(self):
        """Loop di lettura in background."""
        buf = ''
        while self._running:
            with self._lock:
                ser = self._ser
            if not ser or not ser.is_open:
                time.sleep(0.1)
                continue
            try:
                if ser.in_waiting > 0:
                    chunk = ser.read(ser.in_waiting).decode('ascii', errors='ignore')
                    buf += chunk
                    lines = buf.split('\r')
                    buf = lines.pop()
                    for line in lines:
                        stripped = line.strip()
                        if stripped:
                            self._log(f'RX: {stripped}')
                            self._rx_queue.put(stripped)
                else:
                    time.sleep(0.05)
            except Exception as e:
                self._log(f'Reader errore: {e}')
                time.sleep(0.5)

    def is_open(self):
        with self._lock:
            return self._ser is not None and self._ser.is_open


class RotorApiWithSerial(RotorApi):
    """Versione estesa con bridge seriale per macOS."""

    def __init__(self):
        super().__init__()
        self.serial_bridge = SerialBridge()

    def list_serial_ports(self):
        return self.serial_bridge.list_ports()

    def open_serial_port(self, port, baud=9600):
        return self.serial_bridge.open(port, baud)

    def close_serial_port(self):
        self.serial_bridge.close()

    def serial_send(self, data):
        return self.serial_bridge.send(data)

    def serial_receive_line(self):
        return self.serial_bridge.receive_line()

    def serial_is_open(self):
        return self.serial_bridge.is_open()


def main():
    api = RotorApiWithSerial()
    webview.create_window(
        'WK Rotor Control',
        'index.html',
        width=620,
        height=950,
        resizable=True,
        text_select=False,
        js_api=api
    )
    webview.start(debug=False)

if __name__ == '__main__':
    main()
