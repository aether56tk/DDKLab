const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ddklab', Object.freeze({
  platform: process.platform,
  version: '0.1.0',
  storage: {
    saveSession: (session) => ipcRenderer.invoke('storage:saveSession', session),
    listSessions: () => ipcRenderer.invoke('storage:listSessions'),
    loadSession: (id) => ipcRenderer.invoke('storage:loadSession', id)
  }
}));
