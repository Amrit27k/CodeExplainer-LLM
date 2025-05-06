// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api',
  {
    selectFiles: () => ipcRenderer.invoke('select-files'),
    explainCode: (data) => ipcRenderer.invoke('explain-code', data),
    checkModels: () => ipcRenderer.invoke('check-models'),
    downloadModel: (modelKey) => ipcRenderer.invoke('download-model', modelKey),
    clearCache: () => ipcRenderer.invoke('clear-cache'),
    getRateLimitStatus: (modelType) => ipcRenderer.invoke('get-rate-limit-status', modelType),
  }
);

// Make model backends object available to the renderer
contextBridge.exposeInMainWorld('modelBackends', {});

// Define the dragEvent to fix the error
contextBridge.exposeInMainWorld('dragEvent', null);