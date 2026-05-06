/* WK Rotor Control - GS-232 Protocol */
class RotorController {
  constructor() {
    this.currentAzimuth = 0;   // heading attuale (0-360)
    this.targetAzimuth = 0;    // heading target (0-360)
    this.isMoving = false;
    this.direction = 0;        // -1 = CCW, 1 = CW, 0 = fermo
    this.speed = 1.2;          // gradi per tick simulato
    this.mode = 'simulated';   // 'simulated' | 'serial'
    this.power = false;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readLoopRunning = false;
    this.onUpdate = null;      // callback(curr, target)
    this._simTimer = null;
  }

  /* ---- Simulazione ---- */
  startSimulation() {
    if (this._simTimer) return;
    this._simTimer = setInterval(() => this._tick(), 50);
  }

  stopSimulation() {
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
    }
  }

  _tick() {
    if (!this.isMoving || !this.power) return;

    let diff = this._normalizeDiff(this.targetAzimuth - this.currentAzimuth);
    // Se siamo a meno di uno step dalla meta', arriviamo direttamente
    // senza superarla: cosi' eliminiamo il rimbalzo (vibrazione)
    if (Math.abs(diff) <= this.speed) {
      this.currentAzimuth = this.targetAzimuth;
      this.isMoving = false;
      this.direction = 0;
    } else {
      if (diff > 0) {
        this.currentAzimuth += this.speed;
        this.direction = 1;
      } else {
        this.currentAzimuth -= this.speed;
        this.direction = -1;
      }
      this.currentAzimuth = this._normalize(this.currentAzimuth);
    }
    this._notify();
  }

  _normalize(v) { return ((v % 360) + 360) % 360; }
  _normalizeDiff(d) {
    d = ((d % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  _notify() {
    if (this.onUpdate) this.onUpdate(this.currentAzimuth, this.targetAzimuth);
  }

  /* ---- Controllo locale (senza seriale) ---- */
  setPower(on) {
    this.power = on;
    if (on) this.startSimulation();
    else this.stopSimulation();
    this._notify();
  }

  setTarget(az) {
    this.targetAzimuth = this._normalize(az);
    this._notify();
  }

  go() {
    if (!this.power) return;
    this.isMoving = true;
    if (this.mode === 'serial' && this.port) {
      this._sendSerial(`M${String(this.targetAzimuth).padStart(3, '0')}`);
    }
    this._notify();
  }

  stop() {
    this.isMoving = false;
    this.direction = 0;
    if (this.mode === 'serial' && this.port) {
      this._sendSerial('S');
    }
    // In simulazione, il target diventa la posizione attuale per fermarsi
    this.targetAzimuth = this.currentAzimuth;
    this._notify();
  }

  step(delta) {
    this.targetAzimuth = this._normalize(this.targetAzimuth + delta);
    if (this.power) this.go();
    else this._notify();
  }

  preset(az) {
    this.targetAzimuth = this._normalize(az);
    if (this.power) this.go();
    else this._notify();
  }

  /* ---- Web Serial API (Chrome/Edge / Windows) ---- */
  async connectSerial(port, baudRate = 9600) {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API non supportata. Usa Chrome/Edge.');
    }
    try {
      this.port = port || await navigator.serial.requestPort({ filters: [] });
      await this.port.open({ baudRate });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.mode = 'serial';
      this.startSimulation();
      this._startReadLoop();
      return true;
    } catch (e) {
      console.error('Errore apertura seriale:', e);
      this.mode = 'simulated';
      return false;
    }
  }

  /* ---- Python Serial Bridge (macOS / pywebview) ---- */
  connectPythonSerial(port, baudRate = 9600) {
    if (!window.pywebview || !window.pywebview.api) {
      throw new Error('Python bridge non disponibile.');
    }
    try {
      const ok = window.pywebview.api.open_serial_port(port, baudRate);
      if (!ok) throw new Error('Impossibile aprire ' + port);
      this.mode = 'serial';
      this.startSimulation();
      this._startPythonReadLoop();
      return true;
    } catch (e) {
      console.error('Errore Python serial:', e);
      this.mode = 'simulated';
      return false;
    }
  }

  disconnectPythonSerial() {
    this.readLoopRunning = false;
    if (window.pywebview && window.pywebview.api) {
      try { window.pywebview.api.close_serial_port(); } catch (e) {}
    }
  }

  _startPythonReadLoop() {
    this.readLoopRunning = true;
    const poll = () => {
      if (!this.readLoopRunning || this.mode !== 'serial') return;
      try {
        const line = window.pywebview.api.serial_receive_line();
        if (line) this._handleSerialLine(line.trim());
      } catch (e) {}
      setTimeout(poll, 80);
    };
    poll();
  }

  /* ---- Disconnessione unificata ---- */
  async disconnectSerial() {
    this.readLoopRunning = false;
    if (this.port) {
      try { if (this.reader) { await this.reader.cancel(); this.reader = null; } } catch (e) {}
      try { if (this.writer) { await this.writer.close(); this.writer = null; } } catch (e) {}
      try { if (this.port) { await this.port.close(); this.port = null; } } catch (e) {}
    }
    if (window.pywebview && window.pywebview.api) {
      try { window.pywebview.api.close_serial_port(); } catch (e) {}
    }
    this.mode = 'simulated';
  }

  isWebSerialAvailable() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  isPythonSerialAvailable() {
    return !!(window.pywebview && window.pywebview.api && window.pywebview.api.list_serial_ports);
  }

  async _sendSerial(cmd) {
    // Prova prima Web Serial
    if (this.writer) {
      const data = new TextEncoder().encode(cmd + '\r');
      await this.writer.write(data);
      return;
    }
    // Fallback Python serial
    if (window.pywebview && window.pywebview.api) {
      try { window.pywebview.api.serial_send(cmd); } catch (e) {}
    }
  }

  async _startReadLoop() {
    this.readLoopRunning = true;
    const decoder = new TextDecoder();
    let buf = '';
    while (this.port && this.readLoopRunning) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let lines = buf.split('\r');
        buf = lines.pop();
        for (const line of lines) {
          this._handleSerialLine(line.trim());
        }
      } catch (e) {
        if (this.readLoopRunning) console.error('Serial read error', e);
        break;
      }
    }
  }

  _handleSerialLine(line) {
    // Risposta GS-232 tipo: +0140 (heading)
    if (line.startsWith('+') || line.startsWith('-')) {
      const val = parseInt(line.slice(1), 10);
      if (!isNaN(val)) {
        this.currentAzimuth = this._normalize(val);
        this._notify();
      }
    }
  }
}

// Per import o script tag globale
if (typeof window !== 'undefined') window.RotorController = RotorController;
