const { contextBridge, ipcRenderer } = require('electron');

const api = {
  platform: process.platform,
  version: '1.1.1',
  security: {
    getPinState: () => ipcRenderer.invoke('security:getPinState'),
    setPin: (pin) => ipcRenderer.invoke('security:setPin', pin),
    verifyPin: (pin) => ipcRenderer.invoke('security:verifyPin', pin)
  },
  storage: {
    saveSession: (session) => ipcRenderer.invoke('storage:saveSession', session),
    saveAudio: (audio) => ipcRenderer.invoke('storage:saveAudio', audio),
    listSessions: () => ipcRenderer.invoke('storage:listSessions'),
    loadSession: (id) => ipcRenderer.invoke('storage:loadSession', id)
  }
};

contextBridge.exposeInMainWorld('ddklab', Object.freeze(api));
