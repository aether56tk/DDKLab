const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ddklab', Object.freeze({
  platform: process.platform,
  version: '0.1.0',
  security: {
    getPinState: () => ipcRenderer.invoke('security:getPinState'),
    setPin: (pin) => ipcRenderer.invoke('security:setPin', pin),
    verifyPin: (pin) => ipcRenderer.invoke('security:verifyPin', pin)
  },
  storage: {
    saveSession: (session) => ipcRenderer.invoke('storage:saveSession', session),
    listSessions: () => ipcRenderer.invoke('storage:listSessions'),
    loadSession: (id) => ipcRenderer.invoke('storage:loadSession', id)
  }
}));
