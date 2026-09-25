const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('ddklab', Object.freeze({
  platform: process.platform,
  version: '0.1.0'
}));
