'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// The host-management bridge belongs only to the bundled server picker. Remote
// pages run with context isolation and no access to these privileged IPC calls.
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('dshNative', {
    startLocal: () => ipcRenderer.invoke('local:start'),
    listHosts: () => ipcRenderer.invoke('hosts:list'),
    addHost: (name, url) => ipcRenderer.invoke('hosts:add', { name, url }),
    removeHost: (id) => ipcRenderer.invoke('hosts:remove', id),
    connect: (id) => ipcRenderer.invoke('hosts:connect', id),
  })
}
