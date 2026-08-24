'use strict'

const { spawn } = require('node:child_process')
const http = require('node:http')
const https = require('node:https')

const LOCAL_DSH_URL = 'http://127.0.0.1:3080/'

function requestReady(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const request = client.get(target, (response) => {
      response.resume()
      resolve(response.statusCode < 500)
    })
    request.once('error', reject)
    request.setTimeout(1000, () => request.destroy(new Error('readiness timeout')))
  })
}

async function waitForDsh(url, timeoutMs = 30000, child = null) {
  const deadline = Date.now() + timeoutMs
  let processError = null
  const onError = (error) => { processError = error }
  child?.once('error', onError)
  try {
    while (Date.now() < deadline) {
      if (processError) throw processError
      if (child?.exitCode !== null && child?.exitCode !== undefined) {
        throw new Error('dsh web exited before port 3080 became ready.')
      }
      try {
        if (await requestReady(url)) return
      } catch {
        // dsh web may need a few seconds to initialize.
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } finally {
    child?.removeListener('error', onError)
  }
  throw new Error('Timed out waiting for dsh web on port 3080.')
}

function startLocalDsh({ onExit } = {}) {
  const command = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const child = spawn(command, ['web', '--port', '3080'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const capture = (chunk) => { output = (output + chunk.toString()).slice(-32768) }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.once('exit', (code, signal) => onExit?.(code, signal, output))
  child.once('error', (error) => { error.output = output; onExit?.(null, null, output, error) })
  return child
}

function stopLocalDsh(child) {
  if (!child || child.killed || child.exitCode !== null) return
  child.kill()
}

module.exports = { LOCAL_DSH_URL, startLocalDsh, stopLocalDsh, waitForDsh }
