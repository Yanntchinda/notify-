'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Narrow API only: the renderer has no Node, database or filesystem access.
contextBridge.exposeInMainWorld('localContacts', Object.freeze({
  list: () => ipcRenderer.invoke('contacts:list'),
  create: (input) => ipcRenderer.invoke('contacts:create', input),
  update: (id, input) => ipcRenderer.invoke('contacts:update', id, input),
  remove: (id) => ipcRenderer.invoke('contacts:delete', id),
}));
