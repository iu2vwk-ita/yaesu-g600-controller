/* WK Rotor Control - UI Application */
const canvas = document.getElementById('compass');
const ctx = canvas.getContext('2d');
const size = 420;
const cx = size / 2;
const cy = size / 2;
const radius = 190;

const rotor = new RotorController();
rotor.startSimulation();

/* ---- Popolamento dinamico porte seriali ---- */
function populateSerialPorts() {
  const comSelect = document.getElementById('comPort');
  if (!comSelect) return;

  const isPython = window.pywebview && window.pywebview.api && window.pywebview.api.list_serial_ports;
  if (isPython) {
    try {
      const ports = window.pywebview.api.list_serial_ports();
      if (ports && ports.length > 0) {
        comSelect.innerHTML = '';
        ports.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.port;
          opt.textContent = p.port + (p.description ? ' (' + p.description + ')' : '');
          comSelect.appendChild(opt);
        });
        comSelect.style.color = '#fdd835';
        return;
      }
    } catch (e) {}
  }

  // Fallback: porte predefinite per Windows (COM1-COM10)
  const names = Array.from({ length: 10 }, (_, i) => 'COM' + (i + 1));
  comSelect.innerHTML = '';
  names.forEach((n, i) => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    if (i === 6) opt.selected = true;
    comSelect.appendChild(opt);
  });
}

/* ---- Caricamento mappa (pywebview file / localStorage / assets) ---- */
let mapImg = null;
let mapLoaded = false;
const LS_KEY = 'yaesu_g600_map';

function setMapImage(src) {
  const img = new Image();
  img.onload = () => {
    mapImg = img;
    mapLoaded = true;
    if (compassUpload) compassUpload.classList.add('hidden');
  };
  img.onerror = () => { mapImg = null; mapLoaded = false; };
  img.src = src;
}

function tryLoadAssets() {
  const mapPaths = ['assets/map.png', 'assets/map.jpg', 'assets/map.jpeg'];
  function tryNext(idx) {
    if (idx >= mapPaths.length) return;
    const img = new Image();
    img.onload = () => {
      mapImg = img;
      mapLoaded = true;
      if (compassUpload) compassUpload.classList.add('hidden');
    };
    img.onerror = () => tryNext(idx + 1);
    img.src = mapPaths[idx];
  }
  tryNext(0);
}

(async function initMap() {
  // Aspetta che pywebview sia pronto (fino a 5 secondi) — necessario per exe buildato
  for (let i = 0; i < 50; i++) {
    if (window.pywebview && window.pywebview.api) break;
    await new Promise(r => setTimeout(r, 100));
  }

  if (window.pywebview && window.pywebview.api) {
    try {
      const dataUrl = await window.pywebview.api.load_map();
      if (dataUrl && typeof dataUrl === 'string' && dataUrl.length > 500) {
        setMapImage(dataUrl);
        return;
      }
    } catch (e) {}
  }

  // Fallback: PNG diretto da disco (dev mode o se bridge non disponibile)
  const img = new Image();
  img.onload = () => { mapImg = img; mapLoaded = true; if (compassUpload) compassUpload.classList.add('hidden'); };
  img.onerror = () => {
    try { const s = localStorage.getItem(LS_KEY); if (s) { setMapImage(s); return; } } catch (e) {}
    tryLoadAssets();
  };
  img.src = 'assets/yaesu_map.png';
})();

/* ---- UI Refs ---- */
const targetEl = document.getElementById('targetVal');
const currentEl = document.getElementById('currentVal');
const powerBtn = document.getElementById('powerBtn');
const powerLed = document.getElementById('powerLed');
const comSelect = document.getElementById('comPort');
const baudSelect = document.getElementById('baudRate');
const compassWrap = document.getElementById('compassWrap');
const compassUpload = document.getElementById('compassUpload');
const mapInput = document.getElementById('mapInput');
const locatorInput = document.getElementById('locatorInput');
const generateMapBtn = document.getElementById('generateMapBtn');
const saveMapBtn = document.getElementById('saveMapBtn');
const generateSpinner = document.getElementById('generateSpinner');

/* ---- Bussola ---- */
function toRad(deg) { return (deg * Math.PI) / 180; }

function drawCompass() {
  ctx.clearRect(0, 0, size, size);

  // Ombra esterna
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#b8d4e8';
  ctx.fill();
  ctx.restore();

  // Clip circolare per mappa e anelli
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (mapLoaded && mapImg) {
    // Disegna immagine quadrata ritagliata nel cerchio, scalata per riempire tutto
    const scale = 1.22;
    const drawSize = radius * 2 * scale;
    ctx.drawImage(mapImg, cx - radius * scale, cy - radius * scale, drawSize, drawSize);
    // Sovrapponi leggero overlay per integrare meglio i cerchi
    ctx.fillStyle = 'rgba(184, 212, 232, 0.15)';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    // Fallback: sfondo azzurro
    ctx.fillStyle = '#b8d4e8';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // Mappa stilizzata
    drawWorldMap(ctx, cx, cy);
  }

  ctx.restore();

  // Bordo esterno sottile (solo contorno elegante)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();

  // Ago giallo
  drawNeedle(ctx, rotor.currentAzimuth);

  requestAnimationFrame(drawCompass);
}

function drawNeedle(ctx, heading) {
  const angle = toRad(heading);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Ago principale
  ctx.beginPath();
  ctx.moveTo(0, -radius + 55);
  ctx.lineTo(7, 10);
  ctx.lineTo(0, 20);
  ctx.lineTo(-7, 10);
  ctx.closePath();
  ctx.fillStyle = '#fdd835';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#bf9000';
  ctx.stroke();

  // Linea centrale ago
  ctx.beginPath();
  ctx.moveTo(0, -radius + 55);
  ctx.lineTo(0, 20);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Contro-ago
  ctx.beginPath();
  ctx.moveTo(0, radius - 55);
  ctx.lineTo(3, -5);
  ctx.lineTo(0, -12);
  ctx.lineTo(-3, -5);
  ctx.closePath();
  ctx.fillStyle = '#757575';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.stroke();

  ctx.restore();
}

function drawWorldMap(ctx, cx, cy) {
  const land = '#4caf50';
  const desert = '#8d6e63';

  ctx.fillStyle = land;
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 1;

  // Europa / Asia
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 90);
  ctx.lineTo(cx + 60, cy - 100);
  ctx.lineTo(cx + 110, cy - 70);
  ctx.lineTo(cx + 120, cy - 30);
  ctx.lineTo(cx + 80, cy - 20);
  ctx.lineTo(cx + 40, cy - 50);
  ctx.lineTo(cx - 10, cy - 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Africa
  ctx.fillStyle = desert;
  ctx.strokeStyle = '#5d4037';
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 20);
  ctx.lineTo(cx + 50, cy - 25);
  ctx.lineTo(cx + 70, cy + 10);
  ctx.lineTo(cx + 60, cy + 60);
  ctx.lineTo(cx + 20, cy + 80);
  ctx.lineTo(cx - 5, cy + 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Americhe Nord
  ctx.fillStyle = land;
  ctx.strokeStyle = '#2e7d32';
  ctx.beginPath();
  ctx.moveTo(cx - 90, cy - 80);
  ctx.lineTo(cx - 60, cy - 90);
  ctx.lineTo(cx - 40, cy - 50);
  ctx.lineTo(cx - 55, cy - 10);
  ctx.lineTo(cx - 45, cy + 20);
  ctx.lineTo(cx - 70, cy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sud America
  ctx.beginPath();
  ctx.moveTo(cx - 65, cy + 15);
  ctx.lineTo(cx - 40, cy + 25);
  ctx.lineTo(cx - 45, cy + 70);
  ctx.lineTo(cx - 65, cy + 85);
  ctx.lineTo(cx - 80, cy + 50);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Australia
  ctx.fillStyle = desert;
  ctx.strokeStyle = '#5d4037';
  ctx.beginPath();
  ctx.moveTo(cx + 90, cy + 40);
  ctx.lineTo(cx + 120, cy + 45);
  ctx.lineTo(cx + 115, cy + 65);
  ctx.lineTo(cx + 85, cy + 60);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/* ---- Display Update ---- */
function updateDisplay(curr, target) {
  targetEl.textContent = String(Math.round(target)).padStart(3, '0');
  currentEl.textContent = String(Math.round(curr)).padStart(3, '0');
}

rotor.onUpdate = updateDisplay;

/* ---- Eventi ---- */
powerBtn.addEventListener('click', () => {
  const on = powerBtn.classList.toggle('on');
  powerBtn.classList.toggle('off', !on);
  powerLed.classList.toggle('on', on);
  powerLed.classList.toggle('off', !on);
  powerBtn.textContent = on ? 'ON' : 'OFF';
  rotor.setPower(on);
});

document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const step = parseInt(btn.dataset.step, 10);
    rotor.step(step);
  });
});

document.getElementById('goBtn').addEventListener('click', () => rotor.go());
document.getElementById('stopBtn').addEventListener('click', () => rotor.stop());

document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = parseInt(btn.dataset.preset, 10);
    rotor.preset(val);
  });
});

// Tasti rapidi
document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') rotor.go();
  if (e.code === 'Space') { e.preventDefault(); rotor.stop(); }
});

/* ---- Connessione seriale automatica ---- */
async function tryConnectSerial() {
  const port = comSelect ? comSelect.value : null;
  const baud = baudSelect ? parseInt(baudSelect.value, 10) : 9600;
  if (!port) return;

  try {
    // Web Serial (Chrome/Edge/Windows)
    if (rotor.isWebSerialAvailable()) {
      await rotor.connectSerial(null, baud);
      comSelect.style.color = '#00ff41';
      return;
    }
    // Python Serial Bridge (macOS/Linux)
    if (rotor.isPythonSerialAvailable()) {
      await rotor.connectPythonSerial(port, baud);
      comSelect.style.color = '#00ff41';
      return;
    }
  } catch (e) {
    console.warn('Connessione seriale fallita:', e.message);
    comSelect.style.color = '#ff5252';
  }
}

if (comSelect) {
  comSelect.addEventListener('change', () => tryConnectSerial());
}

if (baudSelect) {
  baudSelect.addEventListener('change', () => tryConnectSerial());
}

/* ---- Caricamento immagine ---- */
if (compassUpload && mapInput) {
  compassUpload.addEventListener('click', () => mapInput.click());

  mapInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    handleFileUpload(file);
  });

  // Drag and drop su compass
  compassWrap.addEventListener('dragover', (e) => { e.preventDefault(); });
  compassWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });

  // Doppio click sul canvas per rimuovere immagine e mostrare di nuovo upload
  compassWrap.addEventListener('dblclick', async () => {
    if (mapLoaded) {
      mapImg = null;
      mapLoaded = false;
      // PyWebView API
      if (window.pywebview && window.pywebview.api) {
        try { await window.pywebview.api.clear_map(); } catch (e) {}
      }
      // localStorage fallback
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      compassUpload.classList.remove('hidden');
    }
  });
}

async function handleFileUpload(file) {
  const reader = new FileReader();

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    reader.onload = async (ev) => {
      const pdfBase64 = ev.target.result;
      let dataUrl = null;
      if (window.pywebview && window.pywebview.api) {
        try { dataUrl = await window.pywebview.api.pdf_to_png(pdfBase64); } catch (e) {}
      }
      if (dataUrl) {
        await window.pywebview.api.save_map(dataUrl);
        try { localStorage.setItem(LS_KEY, dataUrl); } catch (e) {}
        setMapImage(dataUrl);
      } else {
        alert('Impossibile convertire il PDF. Assicurati che PyMuPDF sia installato.');
      }
    };
    reader.readAsDataURL(file);
    return;
  }

  // Immagine standard (PNG, JPG, etc.)
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    if (window.pywebview && window.pywebview.api) {
      try { await window.pywebview.api.save_map(dataUrl); } catch (e) {}
    }
    try { localStorage.setItem(LS_KEY, dataUrl); } catch (err) {}
    setMapImage(dataUrl);
  };
  reader.readAsDataURL(file);
}

/* ---- Generazione mappa NS6T da locator ---- */
if (generateMapBtn && locatorInput) {
  generateMapBtn.addEventListener('click', async () => {
    const loc = locatorInput.value.trim().toUpperCase();
    if (!loc || loc.length < 4) {
      alert('Inserisci un locator valido (es. JN61fv)');
      return;
    }
    if (!window.pywebview || !window.pywebview.api) {
      alert('Generazione mappa disponibile solo nell\'app desktop.');
      return;
    }
    generateMapBtn.disabled = true;
    saveMapBtn.disabled = true;
    generateSpinner.classList.remove('hidden');
    try {
      const dataUrl = await window.pywebview.api.generate_map(loc);
      if (dataUrl) {
        setMapImage(dataUrl);
      } else {
        alert('Generazione mappa fallita. Controlla il locator e la connessione.');
      }
    } catch (e) {
      alert('Errore: ' + e.message);
    } finally {
      generateMapBtn.disabled = false;
      saveMapBtn.disabled = false;
      generateSpinner.classList.add('hidden');
    }
  });

  locatorInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') generateMapBtn.click();
  });
}

/* ---- Salvataggio manuale mappa ---- */
if (saveMapBtn) {
  saveMapBtn.addEventListener('click', async () => {
    if (!mapLoaded || !mapImg) {
      alert('Nessuna mappa da salvare. Genera o carica prima una mappa.');
      return;
    }
    if (!window.pywebview || !window.pywebview.api) {
      alert('Salvataggio disponibile solo nell\'app desktop.');
      return;
    }
    const ok = await window.pywebview.api.persist_map();
    alert(ok ? 'Mappa salvata con successo.' : 'Salvataggio fallito.');
  });
}

/* ---- Titolo modificabile ---- */
const titleEl = document.getElementById('appTitle');
const TITLE_LS_KEY = 'yaesu_g600_title';

// Carica titolo salvato
try {
  const savedTitle = localStorage.getItem(TITLE_LS_KEY);
  if (savedTitle) titleEl.textContent = savedTitle;
} catch (e) {}

if (titleEl) {
  titleEl.addEventListener('click', () => {
    const current = titleEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'title-input';
    input.maxLength = 30;

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
      const val = input.value.trim() || 'WK Rotor Control';
      titleEl.textContent = val;
      input.replaceWith(titleEl);
      try { localStorage.setItem(TITLE_LS_KEY, val); } catch (e) {}
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.code === 'Escape') {
        input.value = current;
        input.blur();
      }
    });
  });
}

// Inizializza
populateSerialPorts();
updateDisplay(rotor.currentAzimuth, rotor.targetAzimuth);
drawCompass();
