'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

contextBridge.exposeInMainWorld('shark', {
  catalog: () => ipcRenderer.invoke('catalog'),
  listDevices: () => ipcRenderer.invoke('devices:list'),
  getDevice: (key, modelName) => ipcRenderer.invoke('device:get', key, modelName),
  saveDevice: (key, patch) => ipcRenderer.invoke('device:save', key, patch),
  defaultProfile: (name) => ipcRenderer.invoke('profile:default', name),
  importOem: () => ipcRenderer.invoke('oem:import'),
  apply: (key, profile) => ipcRenderer.invoke('device:apply', key, profile),
  reset: (key) => ipcRenderer.invoke('device:reset', key),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  onDevicesChange: on('devices:change'),
  onStatus: on('device:status'),
  onApplyProgress: on('apply:progress'),
});
