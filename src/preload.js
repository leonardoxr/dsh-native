'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// The Workspaces bridge belongs only to the bundled home screen. Remote pages
// run with context isolation and never receive these privileged IPC calls.
if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('dshNative', {
    addHost: (name, url) => ipcRenderer.invoke('hosts:add', { name, url }),
    removeHost: (id) => ipcRenderer.invoke('hosts:remove', id),
    addTailnetServer: (dnsName, name) => ipcRenderer.invoke('tailnet:add-server', { dnsName, name }),
    connect: (hostId) => ipcRenderer.invoke('home:connect', { hostId }),
    getHomeSnapshot: () => ipcRenderer.invoke('home:snapshot'),
    refreshHome: () => ipcRenderer.invoke('home:refresh'),
  })
}