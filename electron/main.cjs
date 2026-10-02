const { app, BrowserWindow, session, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const dataDir = () => path.join(app.getPath('userData'), 'ddklab-data');
const sessionsDir = () => path.join(dataDir(), 'sessions');
const audioDir = () => path.join(dataDir(), 'audio');
const pinFile = () => path.join(dataDir(), 'pin.bin');
const logFile = () => path.join(dataDir(), 'ddklab.log');

const MAX_SESSION_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

function logDiagnostic(message) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.appendFileSync(logFile(), '[' + new Date().toISOString() + '] ' + message + '\n');
  } catch {}
}
function ensureData() { fs.mkdirSync(sessionsDir(), { recursive: true }); fs.mkdirSync(audioDir(), { recursive: true }); }
function validatePin(pin) { return typeof pin === 'string' && /^\d{4,8}$/.test(pin); }
function safeId(value, fallback) { const id = String(value ?? fallback ?? 'DDK').replace(/[^a-zA-Z0-9_-]/g, '_'); return id.slice(0, 160) || String(fallback ?? 'DDK'); }
function isTrustedSender(event) {
  try {
    const url = event?.senderFrame?.url || '';
    const allowedRoot = pathToFileURL(path.join(app.getAppPath(), 'src', 'ddk')).href;
    return url.startsWith(allowedRoot);
  } catch { return false; }
}
function requireTrustedSender(event) { if (!isTrustedSender(event)) throw new Error('Untrusted renderer'); }
function isPlainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

ipcMain.handle('security:getPinState', (event) => { requireTrustedSender(event); ensureData(); return fs.existsSync(pinFile()); });
ipcMain.handle('security:setPin', (event, pin) => {
  requireTrustedSender(event);
  if (!validatePin(pin)) throw new Error('PIN must contain 4–8 digits');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is unavailable');
  ensureData(); fs.writeFileSync(pinFile(), safeStorage.encryptString(pin), { mode: 0o600 }); return true;
});
ipcMain.handle('security:verifyPin', (event, pin) => {
  requireTrustedSender(event);
  try {
    if (!validatePin(pin) || !fs.existsSync(pinFile()) || !safeStorage.isEncryptionAvailable()) return false;
    return safeStorage.decryptString(fs.readFileSync(pinFile())) === pin;
  } catch { return false; }
});
ipcMain.handle('storage:saveSession', (event, data) => {
  requireTrustedSender(event);
  if (!isPlainObject(data)) throw new Error('Invalid session payload');
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json, 'utf8') > MAX_SESSION_BYTES) throw new Error('Session payload too large');
  ensureData(); const id = safeId(data.id, 'DDK-' + Date.now());
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), json, { mode: 0o600 }); return id;
});
ipcMain.handle('storage:saveAudio', (event, audio) => {
  requireTrustedSender(event);
  if (!isPlainObject(audio)) throw new Error('Invalid audio payload');
  const id = safeId(audio.id); const raw = audio.data;
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw?.buffer || raw || []);
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) throw new Error('Audio payload size is invalid');
  const ext = String(audio.mime || '').includes('wav') ? 'wav' : 'webm';
  ensureData(); fs.writeFileSync(path.join(audioDir(), id + '.' + ext), buffer, { mode: 0o600 }); return true;
});
ipcMain.handle('storage:listSessions', (event) => {
  requireTrustedSender(event); ensureData();
  return fs.readdirSync(sessionsDir()).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
});
ipcMain.handle('storage:loadSession', (event, id) => {
  requireTrustedSender(event);
  const safe = safeId(id); const file = path.join(sessionsDir(), safe + '.json');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_SESSION_BYTES) throw new Error('Stored session is too large');
  return JSON.parse(raw);
});

function createWindow() {
  const appRoot = app.getAppPath();
  const preloadPath = path.join(appRoot, 'electron', 'preload.cjs');
  const indexPath = path.join(appRoot, 'src', 'ddk', 'index.html');
  const win = new BrowserWindow({
    width: 1280, height: 850, minWidth: 980, minHeight: 700, backgroundColor: '#0b1020',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: true
    }
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', () => logDiagnostic('Renderer did-finish-load'));
  win.webContents.on('dom-ready', () => logDiagnostic('Renderer dom-ready'));
  win.webContents.on('preload-error', (_event, preloadPath, error) => logDiagnostic('Preload error: ' + preloadPath + ' :: ' + (error?.stack || error?.message || error)));
  win.webContents.on('console-message', (_event, details) => {
    if (details.level >= 2) logDiagnostic('Renderer console[' + details.level + '] ' + details.message + ' @ ' + details.sourceId + ':' + details.lineNumber);
  });
  win.webContents.on('render-process-gone', (_event, details) => logDiagnostic('Renderer process gone: ' + details.reason + ' exit=' + details.exitCode));
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => logDiagnostic('Load failed: code=' + code + ' description=' + description + ' url=' + validatedURL + ' mainFrame=' + isMainFrame));
  logDiagnostic('Opening UI: ' + indexPath);
  win.loadFile(indexPath).catch((error) => logDiagnostic('loadFile rejected: ' + (error?.stack || error?.message || error)));
  if (process.env.DDKLAB_DEBUG === '1') win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents?.getURL?.() || '';
    callback(permission === 'media' && url.startsWith('file://'));
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('render-process-gone', (_event, webContents, details) => logDiagnostic('Global renderer process gone: ' + details.reason + ' exit=' + details.exitCode + ' url=' + (webContents?.getURL?.() || '')));
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
