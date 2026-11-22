'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Narrow API only: the renderer has no Node, database or filesystem access.
contextBridge.exposeInMainWorld('localContacts', Object.freeze({
  list: () => ipcRenderer.invoke('contacts:list'),
  create: (input) => ipcRenderer.invoke('contacts:create', input),
  update: (id, input) => ipcRenderer.invoke('contacts:update', id, input),
  remove: (id) => ipcRenderer.invoke('contacts:delete', id),
  listNotes: (id) => ipcRenderer.invoke('notes:list', id),
  addNote: (id, text) => ipcRenderer.invoke('notes:add', id, text),
  removeNote: (id, noteId) => ipcRenderer.invoke('notes:delete', id, noteId),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
}));
