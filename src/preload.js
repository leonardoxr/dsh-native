'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshNative', {
  listHosts: () => ipcRenderer.invoke('hosts:list'),
  addHost: (name, url) => ipcRenderer.invoke('hosts:add', { name, url }),
  removeHost: (id) => ipcRenderer.invoke('hosts:remove', id),
  connect: (id) => ipcRenderer.invoke('hosts:connect', id),
})
