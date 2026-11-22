'use strict';
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { access, readFile } = require('node:fs/promises');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { APP_PORT, SUPABASE_URL, loadConfig, childEnvironment } = require('./config.cjs');

let child;
let window;
let quitting = false;
const origin = `http://127.0.0.1:${APP_PORT}`;
const bundle = app.isPackaged ? path.join(process.resourcesPath, 'standalone') : path.join(__dirname, '..', 'resources', 'standalone');

function checkPortAvailable() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Le port local ${APP_PORT} est déjà utilisé. Fermez le programme qui l’utilise avant de réessayer.`)));
    server.listen(APP_PORT, '127.0.0.1', () => server.close(resolve));
  });
}
function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    let timer;
    let finished = false;
    const done = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      proc.off('exit', exited);
      proc.off('error', failed);
      error ? reject(error) : resolve();
    };
    const exited = (code) => done(new Error(`Le serveur local s’est arrêté (code ${code}).`));
    const failed = () => done(new Error('Impossible de démarrer le serveur local.'));
    proc.once('exit', exited);
    proc.once('error', failed);
    function probe() {
      if (Date.now() >= deadline) return done(new Error('Le serveur local ne répond pas.'));
      const req = http.get(origin, { timeout: 1000 }, (res) => { res.resume(); done(); });
      req.on('error', () => { if (!finished) timer = setTimeout(probe, 250); });
      req.on('timeout', () => req.destroy());
    }
    probe();
  });
}
async function start() {
  const configPath = path.join(app.getPath('userData'), 'local-config.json');
  let config;
  try { config = loadConfig(configPath); }
  catch (error) { throw new Error(`Configuration locale manquante ou invalide : ${configPath}\n${error.message}\nConsultez le guide du projet.`); }
  await access(path.join(bundle, 'server.js')).catch(() => { throw new Error('Le serveur wacrm préparé pour Windows est absent. Consultez le guide du projet.'); });
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(bundle, 'desktop-build.json'), 'utf8')); }
  catch { throw new Error('Le manifeste de compilation locale est absent ou invalide.'); }
  if (manifest.supabaseUrl !== SUPABASE_URL || manifest.anonKey !== config.anonKey) {
    throw new Error('La compilation wacrm ne correspond pas à la configuration Supabase locale. Recompilez-la.');
  }
  await checkPortAvailable();
  child = spawn(process.execPath, [path.join(bundle, 'server.js')], {
    cwd: bundle, env: childEnvironment(config), stdio: 'ignore', windowsHide: true,
  });
  await waitForServer(child);
  child.on('exit', () => {
    if (!quitting) { dialog.showErrorBox('wacrm Local', 'Le serveur local s’est arrêté.'); app.quit(); }
  });
  window = new BrowserWindow({ width: 1300, height: 850, minWidth: 800, minHeight: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(({ url }) => {
    try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    try { if (new URL(url).origin === origin) return; } catch {}
    event.preventDefault();
  });
  await window.loadURL(origin);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch((error) => { dialog.showErrorBox('wacrm Local — démarrage impossible', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { quitting = true; if (child && !child.killed) child.kill(); });
}
