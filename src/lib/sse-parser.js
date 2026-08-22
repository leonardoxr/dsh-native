'use strict'

const DEFAULT_MAX_BUFFER = 64 * 1024
const DEFAULT_MAX_EVENT = 16 * 1024

class SseParser {
  constructor(onEvent, options = {}) {
    if (typeof onEvent !== 'function') throw new TypeError('onEvent must be a function')
    this.onEvent = onEvent
    this.maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    this.maxEvent = options.maxEvent ?? DEFAULT_MAX_EVENT
    this.decoder = new TextDecoder('utf-8', { fatal: true })
    this.buffer = ''
    this.lastEventId = ''
    this.retryMs = undefined
    this.resetEvent()
  }

  push(chunk) {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    this.drainLines(false)
    if (this.buffer.length > this.maxBuffer) throw new Error('SSE buffer exceeded its size limit')
  }

  finish() {
    this.buffer += this.decoder.decode()
    this.drainLines(true)
    // EventSource discards an event that was not terminated by a blank line.
    this.buffer = ''
    this.resetEvent()
  }

  drainLines(final) {
    while (true) {
      const match = /[\r\n]/.exec(this.buffer)
      if (!match) return
      const index = match.index
      const ending = this.buffer[index]
      if (!final && ending === '\r' && index === this.buffer.length - 1) return
      const width = ending === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + width)
      this.processLine(line)
    }
  }

  processLine(line) {
    this.eventSize += line.length + 1
    if (this.eventSize > this.maxEvent) throw new Error('SSE event exceeded its size limit')
    if (line === '') {
      this.dispatch()
      this.resetEvent()
      return
    }
    if (line.startsWith(':')) return

    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    let value = separator < 0 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') this.event = value
    else if (field === 'data') this.data.push(value)
    else if (field === 'id' && !value.includes('\0')) this.lastEventId = value
    else if (field === 'retry' && /^\d+$/.test(value)) {
      this.retryMs = Math.min(60_000, Math.max(1_000, Number(value)))
    }
  }

  dispatch() {
    if (this.data.length === 0) return
    this.onEvent({
      type: this.event,
      data: this.data.join('\n'),
      id: this.lastEventId,
      retryMs: this.retryMs,
    })
  }

  resetEvent() {
    this.event = 'message'
    this.data = []
    this.eventSize = 0
  }
}

module.exports = { SseParser }
