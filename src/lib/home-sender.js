'use strict'

/**
 * Sender guard for the privileged Workspaces IPC surface.
 *
 * The main process re-checks every invocation against the exact bundled
 * home-screen URL, so remote pages and any other frame can never read saved
 * hosts or aggregated Companion data even if they somehow reach ipcRenderer.
 *
 * @param {string | undefined} senderFrameUrl URL of the invoking frame
 * @param {string} homeUrl exact file:// URL of the bundled Workspaces page
 * @returns {boolean}
 */
function isHomeSender(senderFrameUrl, homeUrl) {
  if (typeof senderFrameUrl !== 'string' || typeof homeUrl !== 'string') return false
  return senderFrameUrl === homeUrl
}

/**
 * Throwing variant used directly inside ipcMain.handle callbacks.
 *
 * @param {string | undefined} senderFrameUrl
 * @param {string} homeUrl
 */
function assertHomeSender(senderFrameUrl, homeUrl) {
  if (!isHomeSender(senderFrameUrl, homeUrl)) {
    const error = new Error('Workspaces data is available only from the bundled Workspaces screen.')
    error.code = 'DSH_NATIVE_HOME_ONLY'
    throw error
  }
}

module.exports = { isHomeSender, assertHomeSender }
