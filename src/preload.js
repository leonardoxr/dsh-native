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
    // Self-updates: state snapshots push over updates:state, actions are
    // request/response. Only the bundled home screen sees any of this.
    getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
    checkForUpdates: () => ipcRenderer.invoke('updates:check'),
    downloadUpdate: () => ipcRenderer.invoke('updates:download'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
    setUpdateChannel: (channel) => ipcRenderer.invoke('updates:set-channel', channel),
    onUpdateState: (callback) => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('updates:state', listener)
      return () => ipcRenderer.removeListener('updates:state', listener)
    },
  })
}

// Managed DSH pages receive only the read/navigation face needed to render
// the native aggregate in their own sidebar. The main process validates the
// sender origin against Local DSH and the saved-server list on every call.
if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
  contextBridge.exposeInMainWorld('dshNativeWorkspaces', {
    getSnapshot: () => ipcRenderer.invoke('workspace-sidebar:snapshot'),
    refresh: () => ipcRenderer.invoke('workspace-sidebar:refresh'),
    connect: (hostId) => ipcRenderer.invoke('workspace-sidebar:connect', { hostId }),
  })
}