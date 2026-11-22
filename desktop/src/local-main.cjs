'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { openLocalStore } = require('./local-store.cjs');

// Keep user data independent from the install directory and future app updates.
app.setName('wacrm Local');
// End-to-end tests run the unpackaged app against an isolated temporary profile.
if (!app.isPackaged && process.env.WACRM_E2E_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.WACRM_E2E_DATA_DIR));
}
let window;
let store;
let quitting = false;

function plain(row) { return row ? { ...row } : null; }
function registerHandlers() {
  const handlers = {
    'contacts:list': () => store.listContacts().map(plain),
    'contacts:create': (_, input) => plain(store.createContact(input)),
    'contacts:update': (_, id, input) => plain(store.updateContact(id, input)),
    'contacts:delete': (_, id) => store.deleteContact(id),
    'notes:list': (_, id) => store.listNotes(id).map(plain),
    'notes:add': (_, id, text) => plain(store.addNote(id, text)),
    'notes:delete': (_, contactId, noteId) => store.deleteNote(contactId, noteId),
    'conversations:list': () => store.listConversations().map(plain),
    'conversations:open': (_, contactId) => plain(store.openConversation(contactId)),
    'conversations:draft': (_, id, text) => plain(store.saveDraft(id, text)),
    'conversations:status': (_, id, status) => plain(store.setConversationStatus(id, status)),
    'backup:export': async () => {
      const result = await dialog.showSaveDialog(window, {
        title: 'Enregistrer une sauvegarde locale',
        defaultPath: `wacrm-sauvegarde-${new Date().toISOString().slice(0, 10)}.sqlite`,
        filters: [{ name: 'Sauvegarde SQLite', extensions: ['sqlite'] }],
      });
      if (result.canceled || !result.filePath) return false;
      store.exportBackup(result.filePath);
      return true;
    },
    'backup:restore': async () => {
      const choice = await dialog.showOpenDialog(window, {
        title: 'Choisir une sauvegarde locale', properties: ['openFile'],
        filters: [{ name: 'Sauvegarde SQLite', extensions: ['sqlite'] }],
      });
      if (choice.canceled || choice.filePaths.length !== 1) return false;
      const confirmation = await dialog.showMessageBox(window, {
        type: 'warning', buttons: ['Annuler', 'Restaurer'], defaultId: 0, cancelId: 0,
        title: 'Confirmer la restauration',
        message: 'Les contacts, notes et brouillons actuels seront remplacés.',
        detail: 'Une copie de sécurité automatique sera conservée sur ce PC avant la restauration. Les fichiers ne sont pas chiffrés.',
      });
      if (confirmation.response !== 1) return false;
      store.restoreBackup(choice.filePaths[0]);
      return true;
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error('Opération non autorisée.');
      }
      try { return await handler(event, ...args); }
      catch (error) {
        // Never expose filesystem locations or raw database errors to the renderer.
        if (error instanceof TypeError) throw new Error(error.message);
        if (error.code === 'EEXIST') throw new Error('Ce fichier existe déjà. Choisissez un nouveau nom.');
        if (channel === 'backup:restore') throw new Error('Restauration impossible. Vérifiez que la sauvegarde est compatible et non endommagée. Les données actuelles ont été conservées.');
        if (String(error.message).includes('UNIQUE constraint failed: contacts.phone')) {
          throw new Error('Ce numéro existe déjà dans les contacts.');
        }
        throw new Error('Impossible de modifier les contacts locaux.');
      }
    });
  }
}
async function start() {
  store = openLocalStore(path.join(app.getPath('userData'), 'data', 'wacrm.sqlite'));
  registerHandlers();
  window = new BrowserWindow({
    width: 1320, height: 850, minWidth: 760, minHeight: 600,
    backgroundColor: '#f7f8fa', title: 'wacrm Local — prototype',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  await window.loadFile(path.join(__dirname, 'ui', 'index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch(() => {
    dialog.showErrorBox('wacrm Local', 'Impossible de démarrer le stockage local. Vérifiez les droits d’accès au dossier utilisateur.');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (!quitting) { quitting = true; if (store) store.close(); } });
}
