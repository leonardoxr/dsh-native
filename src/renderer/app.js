'use strict'

const Dsh = window.dshNative
const Pres = window.DshHomePresentation

const refreshBtn = document.getElementById('refresh')
const bannerEl = document.getElementById('banner')
const workspaceList = document.getElementById('workspace-list')
const emptyState = document.getElementById('empty-state')
const liveSection = document.getElementById('live-sessions-section')
const liveList = document.getElementById('live-session-list')
const serverLocalEl = document.getElementById('server-local')
const serverList = document.getElementById('server-list')
const noServersEl = document.getElementById('no-servers')
const tailnetGroup = document.getElementById('tailnet-group')
const tailnetList = document.getElementById('tailnet-list')
const form = document.getElementById('add-form')
const errorEl = document.getElementById('error')

let lastSnapshot = null
let refreshing = false
let editingHostId = null

function showError(message) {
  errorEl.textContent = message
  errorEl.hidden = false
}

function clearError() {
  errorEl.hidden = true
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function hostPart(url) {
  try { return new URL(url).host } catch { return url }
}

function makeDot(server) {
  const presentation = Pres.presentServer(server)
  const dot = el('span', 'dot tone-' + presentation.tone + (presentation.showsProgress ? ' spin' : ''))
  const title = [presentation.label, presentation.hint].filter(Boolean).join(' — ')
  if (title) dot.title = title
  return dot
}

function sessionCountText(row) {
  if (row.liveSessions !== null && row.liveSessions !== undefined && row.liveSessions !== row.totalSessions) {
    return row.liveSessions + ' of ' + row.totalSessions + ' sessions'
  }
  return row.totalSessions + (row.totalSessions === 1 ? ' session' : ' sessions')
}

async function connect(hostId) {
  clearError()
  try {
    await Dsh.connect(hostId)
  } catch (err) {
    showError(err.message ?? 'Could not open this server.')
  }
}

function workspaceCard(row, serversById) {
  const item = el('li', 'card' + (row.stale ? ' stale' : ''))
  const open = el('button', 'card-main')
  open.type = 'button'
  open.addEventListener('click', () => connect(row.hostId))
  const head = el('div', 'card-head')
  head.append(el('span', 'card-title', row.title), el('span', 'card-age', Pres.formatAge(row.updatedAt)))
  const path = el('div', 'card-path', row.path)
  path.title = row.path
  const meta = el('div', 'card-meta')
  meta.append(
    el('span', 'badge', row.hostName),
    el('span', 'badge subtle', hostPart(row.hostUrl)),
    el('span', 'meta', sessionCountText(row)),
  )
  open.append(head, path, meta)
  const server = serversById[row.hostId]
  item.append(open)
  if (server) item.append(makeDot(server))
  return item
}

function sessionItem(row) {
  const item = el('li', 'row-item')
  const open = el('button', 'row-main')
  open.type = 'button'
  open.addEventListener('click', () => connect(row.hostId))
  open.append(
    el('span', 'row-title', row.title),
    el('span', 'badge', row.hostName),
    el('span', 'badge subtle', hostPart(row.hostUrl)),
    el('span', 'meta', Pres.formatAge(row.updatedAt)),
  )
  if (row.cwd) {
    open.title = row.cwd
  }
  item.append(open)
  return item
}

function localServerRow(server) {
  const wrap = el('div', 'row-item')
  const presentation = Pres.presentServer(server)
  const main = el('div', 'row-main static')
  main.append(makeDot(server), el('span', 'row-title', server.name), el('span', 'badge subtle', hostPart(server.url)))
  if (presentation.label) main.append(el('span', 'meta warn-text', presentation.label))
  const open = el('button', 'small')
  open.type = 'button'
  open.textContent = 'Open'
  open.addEventListener('click', () => connect(server.id))
  wrap.append(main, open)
  return wrap
}

function savedServerRow(server) {
  const item = el('li', 'row-item')
  if (editingHostId === server.id) {
    const input = el('input', 'edit-name');
    input.type = 'text';
    input.value = server.name;
    const save = el('button', 'small primary');
    save.type = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
      if (await callSafe(Dsh.addHost(input.value, server.url), 'Rename failed.')) {
        editingHostId = null;
        await refresh();
      }
    });
    const cancel = el('button', 'small');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { editingHostId = null; render(lastSnapshot); });
    const main = el('div', 'row-main static edit-row');
    main.append(makeDot(server), input, save, cancel);
    item.append(main);
    return item;
  }
  const main = el('div', 'row-main static')
  main.append(makeDot(server), el('span', 'row-title', server.name), el('span', 'badge subtle', hostPart(server.url)))
  const presentation = Pres.presentServer(server);
  if (presentation.label) {
    const label = el('span', 'meta warn-text', presentation.label);
    if (presentation.hint) label.title = presentation.hint;
    main.append(label);
  }
  const rename = el('button', 'small');
  rename.type = 'button';
  rename.textContent = 'Rename';
  rename.addEventListener('click', () => { editingHostId = server.id; render(lastSnapshot); });
  const open = el('button', 'small');
  open.type = 'button';
  open.textContent = 'Open';
  open.addEventListener('click', () => connect(server.id));
  const remove = el('button', 'small danger');
  remove.type = 'button';
  remove.textContent = '✕';
  remove.title = 'Remove';
  remove.addEventListener('click', async () => {
    if (await callSafe(Dsh.removeHost(server.id), 'Remove failed.')) await refresh();
  });
  main.append(rename, open, remove);
  item.append(main);
  return item
}

function tailnetPeerRow(peer) {
  const item = el('li', 'row-item' + (peer.online ? '' : ' offline'));
  const main = el('div', 'row-main static')
  main.append(el('span', 'dot tone-idle'), el('span', 'row-title', peer.hostName), el('span', 'badge subtle', peer.dnsName))
  if (!peer.online) main.append(el('span', 'meta', 'Offline'))
  if (peer.probe === 'unauthorized') {
    const pill = el('span', 'pill amber', 'Needs authorization');
    pill.title = 'On that machine run: dsh web --trusted-host ' + peer.dnsName;
    main.append(pill);
  } else {
    main.append(el('span', 'pill green', 'DSH found'));
  }
  const add = el('button', 'small primary');
  add.type = 'button';
  add.textContent = 'Add';
  add.addEventListener('click', async () => {
    add.disabled = true;
    if (await callSafe(Dsh.addTailnetServer(peer.dnsName, peer.hostName), 'Could not add server.')) await refresh();
    else add.disabled = false;
  });
  main.append(add);
  item.append(main);
  return item
}

async function callSafe(promise, fallbackMessage) {
  try {
    await promise;
    return true;
  } catch (err) {
    showError(err.message ?? fallbackMessage);
    return false;
  }
}

function renderServers(snapshot) {
  const serversById = snapshot.servers ?? {};
  const servers = Object.values(serversById);
  const local = servers.find((server) => server.local);
  serverLocalEl.replaceChildren(...(local ? [localServerRow(local)] : []));
  const saved = servers.filter((server) => !server.local);
  serverList.replaceChildren(...saved.map(savedServerRow));
  noServersEl.hidden = saved.length > 0;
  const tailnet = snapshot.tailnet ?? { available: false, peers: [] };
  const peers = Array.isArray(tailnet.peers) ? tailnet.peers : [];
  tailnetGroup.hidden = !tailnet.available || peers.length === 0;
  tailnetList.replaceChildren(...peers.map(tailnetPeerRow));
  return serversById;
}

function showBanner(banner) {
  bannerEl.textContent = banner.label;
  bannerEl.className = 'banner ' + banner.tone;
  if (banner.showsProgress) bannerEl.classList.add('spin-text');
  bannerEl.hidden = false;
}

function render(snapshot) {
  if (!snapshot) return;
  lastSnapshot = snapshot;
  const serversById = renderServers(snapshot);
  if (refreshing) {
    showBanner({ tone: 'busy', label: 'Checking servers…', showsProgress: true });
  } else {
    const banner = Pres.presentBanner(Object.values(serversById));
    if (banner) showBanner(banner);
    else bannerEl.hidden = true;
  }
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  workspaceList.replaceChildren(...rows.map((row) => workspaceCard(row, serversById)));
  emptyState.hidden = rows.length > 0 || refreshing;
  const orphans = Array.isArray(snapshot.orphanSessions) ? snapshot.orphanSessions : [];
  liveSection.hidden = orphans.length === 0;
  liveList.replaceChildren(...orphans.map(sessionItem));
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing…';
  if (lastSnapshot) render(lastSnapshot);
  try {
    render(await Dsh.refreshHome());
  } catch (err) {
    showError(err.message ?? 'Refresh failed.');
  } finally {
    refreshing = false;
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
    render(lastSnapshot);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  try {
    await Dsh.addHost(document.getElementById('name').value, document.getElementById('url').value);
    form.reset();
    await refresh();
  } catch (err) {
    showError(err.message ?? 'Failed to add server.');
  }
});

refreshBtn.addEventListener('click', () => { void refresh(); });

(async () => {
  try {
    render(await Dsh.getHomeSnapshot());
  } catch {
    // A failed cached read still leaves the manual Refresh path usable.
  }
  void refresh();
})();

window.addEventListener('focus', () => { void refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
setInterval(() => { void refresh(); }, 60000);
// Keep relative ages current without touching the network.
setInterval(() => {
  if (lastSnapshot && !refreshing && document.visibilityState === 'visible') render(lastSnapshot);
}, 30000);

// --- Self-updates --------------------------------------------------------------

const updatesSection = document.getElementById('updates-section')
const updateDotEl = document.getElementById('update-dot')
const updateTitleEl = document.getElementById('update-title')
const updateMetaEl = document.getElementById('update-meta')
const updateProgressEl = document.getElementById('update-progress')
const updateProgressBarEl = document.getElementById('update-progress-bar')
const updateNotesEl = document.getElementById('update-notes')
const updateChannelEl = document.getElementById('update-channel')
const updateCheckBtn = document.getElementById('update-check')
const updateActionBtn = document.getElementById('update-action')

let lastUpdateState = null

function formatCheckedAt(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

/** Paint one pushed or fetched update snapshot; mirrors the main-process machine. */
function presentUpdateState(state) {
  if (!state) return
  lastUpdateState = state
  updatesSection.hidden = false

  const tone = ({
    checking: 'tone-busy',
    available: 'tone-busy',
    downloading: 'tone-busy',
    'up-to-date': 'tone-ok',
    downloaded: 'tone-ok',
    error: 'tone-bad',
  })[state.status] ?? 'tone-idle'
  updateDotEl.className = 'dot ' + tone + (state.status === 'checking' || state.status === 'downloading' ? ' spin' : '')

  let title = 'Updates'
  let meta = ''
  switch (state.status) {
    case 'disabled':
      title = 'Automatic updates off'
      meta = state.message || 'This build cannot check for updates on its own.'
      break
    case 'idle':
      title = 'DSH Native v' + state.currentVersion
      break
    case 'checking':
      title = 'Checking for updates…'
      break
    case 'up-to-date':
      title = 'Up to date'
      meta = 'v' + state.currentVersion + (state.checkedAt ? ' · checked ' + formatCheckedAt(state.checkedAt) : '')
      break
    case 'available':
      title = 'Update available — v' + state.availableVersion
      meta = 'Running v' + state.currentVersion
      break
    case 'downloading':
      title = 'Downloading v' + state.availableVersion + '…'
      meta = state.downloadPercent === null ? '' : Math.floor(state.downloadPercent) + '%'
      break
    case 'downloaded':
      title = 'Ready to install v' + state.downloadedVersion
      meta = 'Restart to finish updating'
      break
    case 'error':
      title = state.errorContext === 'download' ? 'Download failed'
        : state.errorContext === 'install' ? 'Install failed' : 'Update check failed'
      meta = state.message ?? ''
      break
  }
  updateTitleEl.textContent = title
  updateMetaEl.textContent = meta
  updateMetaEl.hidden = meta === ''

  if (state.status === 'downloading' && state.downloadPercent !== null) {
    updateProgressEl.hidden = false
    updateProgressBarEl.style.width = Math.min(100, Math.max(0, state.downloadPercent)) + '%'
  } else {
    updateProgressEl.hidden = true
  }

  const notes = Array.isArray(state.releaseNotes) ? state.releaseNotes : []
  if ((state.status === 'available' || state.status === 'downloaded') && notes.length > 0) {
    updateNotesEl.replaceChildren(...notes.map((group) => {
      const li = el('li', 'note-group')
      li.append(el('strong', 'note-version', 'v' + group.version))
      const items = el('ul', 'note-items')
      for (const item of group.items ?? []) items.append(el('li', '', item))
      li.append(items)
      return li
    }))
    updateNotesEl.hidden = false
  } else {
    updateNotesEl.replaceChildren()
    updateNotesEl.hidden = true
  }

  let actionLabel = ''
  let actionKind = null
  if (state.status === 'available') { actionLabel = 'Download'; actionKind = 'download' }
  else if (state.status === 'downloaded') { actionLabel = 'Restart to update'; actionKind = 'install' }
  else if (state.status === 'error' && state.canRetry) { actionLabel = 'Try again'; actionKind = 'retry' }
  updateActionBtn.hidden = actionKind === null
  updateActionBtn.classList.toggle('primary', actionKind === 'install')
  updateActionBtn.textContent = actionLabel
  updateActionBtn.onclick = () => {
    if (actionKind === null) return
    updateActionBtn.disabled = true
    const call = actionKind === 'download' ? Dsh.downloadUpdate()
      : actionKind === 'install' ? Dsh.installUpdate() : Dsh.checkForUpdates()
    Promise.resolve(call)
      .then((result) => presentUpdateState(result && result.state ? result.state : lastUpdateState))
      .catch((err) => showError(err.message ?? 'The update action failed.'))
      .finally(() => { updateActionBtn.disabled = false })
  }

  if (document.activeElement !== updateChannelEl) updateChannelEl.value = state.channel
  const busy = state.status === 'checking' || state.status === 'downloading'
  updateChannelEl.disabled = !state.enabled || busy
  updateCheckBtn.hidden = !state.enabled || busy || state.status === 'downloaded'
}

updateChannelEl.addEventListener('change', async () => {
  clearError()
  try {
    presentUpdateState(await Dsh.setUpdateChannel(updateChannelEl.value))
  } catch (err) {
    showError(err.message ?? 'Could not switch the update channel.')
    if (lastUpdateState) updateChannelEl.value = lastUpdateState.channel
  }
})

updateCheckBtn.addEventListener('click', async () => {
  clearError()
  updateCheckBtn.disabled = true
  try {
    presentUpdateState((await Dsh.checkForUpdates()).state)
  } catch (err) {
    showError(err.message ?? 'The update check failed.')
  } finally {
    updateCheckBtn.disabled = false
  }
})

Dsh.onUpdateState(presentUpdateState)
Dsh.getUpdateState().then(presentUpdateState).catch(() => {})