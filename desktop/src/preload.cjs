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
  listConversations: () => ipcRenderer.invoke('conversations:list'),
  openConversation: (contactId) => ipcRenderer.invoke('conversations:open', contactId),
  saveDraft: (id, text) => ipcRenderer.invoke('conversations:draft', id, text),
  setConversationStatus: (id, status) => ipcRenderer.invoke('conversations:status', id, status),
  createDeliveryReport: (input) => ipcRenderer.invoke('deliveries:create', input),
  deleteDeliveryReport: (id) => ipcRenderer.invoke('deliveries:delete', id),
  deliveryReportLines: (id) => ipcRenderer.invoke('deliveries:lines', id),
  deliveryStatistics: (filters) => ipcRenderer.invoke('deliveries:statistics', filters),
}));
