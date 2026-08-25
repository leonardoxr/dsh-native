'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Preload can execute before Electron has committed the target navigation, so
// protocol-gating the bridge here leaves the next document without its face.
// Expose the narrow faces unconditionally; every IPC handler enforces the
// exact home or managed-server sender before returning data or acting.
contextBridge.exposeInMainWorld('dshNative', {
  addHost: (name, url) => ipcRenderer.invoke('hosts:add', { name, url }),
  removeHost: (id) => ipcRenderer.invoke('hosts:remove', id),
  addTailnetServer: (dnsName, name) => ipcRenderer.invoke('tailnet:add-server', { dnsName, name }),
  connect: (hostId) => ipcRenderer.invoke('home:connect', { hostId }),
  getHomeSnapshot: () => ipcRenderer.invoke('home:snapshot'),
  refreshHome: () => ipcRenderer.invoke('home:refresh'),
  // Self-updates: state snapshots push over updates:state, actions are
  // request/response. Main-process handlers enforce the home sender.
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

// Managed DSH pages receive only the read/navigation face needed to render
// the native aggregate in their own sidebar. The main process validates the
// sender origin against Local DSH and the saved-server list on every call.
contextBridge.exposeInMainWorld('dshNativeWorkspaces', {
  getSnapshot: () => ipcRenderer.invoke('workspace-sidebar:snapshot'),
  refresh: () => ipcRenderer.invoke('workspace-sidebar:refresh'),
  connect: (hostId) => ipcRenderer.invoke('workspace-sidebar:connect', { hostId }),
})

// Read-only native self-update state (snapshot + push). The main process gates
// the read to managed workspace origins; update actions stay home-screen only.
contextBridge.exposeInMainWorld('dshNativeUpdate', {
  getState: () => ipcRenderer.invoke('native-update:get-state'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('updates:state', listener)
    return () => ipcRenderer.removeListener('updates:state', listener)
  },
})