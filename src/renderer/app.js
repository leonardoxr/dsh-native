'use strict'

const list = document.getElementById('host-list')
const form = document.getElementById('add-form')
const errorEl = document.getElementById('error')
const startLocalBtn = document.getElementById('start-local')

function showError(message) {
  errorEl.textContent = message
  errorEl.hidden = false
}

startLocalBtn.addEventListener('click', async () => {
  startLocalBtn.disabled = true
  errorEl.hidden = true
  startLocalBtn.textContent = 'Starting DSH Web…'
  try {
    await window.dshNative.startLocal()
  } catch (err) {
    showError(err.message ?? 'Failed to start local DSH Web.')
    startLocalBtn.disabled = false
    startLocalBtn.textContent = 'Start local DSH Web (port 3080)'
  }
})

async function refresh() {
  const hosts = await window.dshNative.listHosts()
  list.replaceChildren(
    ...hosts
      .slice()
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
      .map((host) => {
        const li = document.createElement('li')

        const connectBtn = document.createElement('button')
        connectBtn.className = 'connect'
        connectBtn.textContent = host.name
        connectBtn.title = host.url
        connectBtn.addEventListener('click', () => window.dshNative.connect(host.id))

        const urlSpan = document.createElement('span')
        urlSpan.className = 'url'
        urlSpan.textContent = host.url

        const removeBtn = document.createElement('button')
        removeBtn.className = 'remove'
        removeBtn.textContent = '✕'
        removeBtn.title = 'Remove'
        removeBtn.addEventListener('click', async () => {
          await window.dshNative.removeHost(host.id)
          refresh()
        })

        li.append(connectBtn, urlSpan, removeBtn)
        return li
      }),
  )
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.hidden = true
  try {
    await window.dshNative.addHost(
      document.getElementById('name').value,
      document.getElementById('url').value,
    )
    form.reset()
    refresh()
  } catch (err) {
    showError(err.message ?? 'Failed to add server.')
  }
})

refresh()
