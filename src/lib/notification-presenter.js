'use strict'

function createNotificationPresenter(options) {
  const Notification = options.Notification
  const getWindow = options.getWindow
  const logger = options.logger ?? console
  const active = new Set()
  let unsupportedLogged = false

  return function present(notification) {
    const win = getWindow()
    if (win && !win.isDestroyed() && win.isFocused()) return false

    if (!Notification.isSupported()) {
      if (!unsupportedLogged) {
        unsupportedLogged = true
        logger.warn?.('Native notifications are not supported on this desktop')
      }
      return false
    }

    const nativeNotification = new Notification({
      title: notification.title,
      body: notification.body,
    })
    active.add(nativeNotification)
    nativeNotification.once('close', () => active.delete(nativeNotification))
    nativeNotification.once('click', () => {
      const target = getWindow()
      if (!target || target.isDestroyed()) return
      if (target.isMinimized()) target.restore()
      if (!target.isVisible()) target.show()
      target.focus()
    })
    nativeNotification.show()
    return true
  }
}

module.exports = { createNotificationPresenter }
