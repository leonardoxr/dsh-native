'use strict'

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')

const LOCAL_DSH_URL = 'http://127.0.0.1:3080/'
const READY_TIMEOUT_MS = 30000
const MAC_DSH_PATHS = ['/opt/homebrew/bin/dsh', '/usr/local/bin/dsh']
const MAC_NODE_PATHS = [
  '/opt/homebrew/opt/node/bin/node',
  '/opt/homebrew/bin/node',
  '/usr/local/opt/node/bin/node',
  '/usr/local/bin/node',
]

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function pathEntries(pathValue) {
  return typeof pathValue === 'string' && pathValue !== ''
    ? pathValue.split(path.delimiter).filter(Boolean)
    : []
}

function firstExecutable(files, executable = isExecutable) {
  return files.find((file) => executable(file)) ?? null
}

function executableFromPath(name, pathValue, executable = isExecutable) {
  return firstExecutable(pathEntries(pathValue).map((directory) => path.join(directory, name)), executable)
}

function localDshCommand(platform = process.platform, {
  pathValue = process.env.PATH,
  home = os.homedir(),
  executable = isExecutable,
} = {}) {
  if (platform === 'win32') return 'dsh.cmd'
  const fromPath = executableFromPath('dsh', pathValue, executable)
  if (fromPath) return fromPath
  if (platform !== 'darwin') return 'dsh'
  return firstExecutable([
    ...MAC_DSH_PATHS,
    path.join(home, '.local/bin/dsh'),
    path.join(home, '.bun/bin/dsh'),
  ], executable) ?? 'dsh'
}

function localNodeDirectory(platform, pathValue, executable = isExecutable) {
  if (platform !== 'darwin') return null
  const node = firstExecutable([
    ...MAC_NODE_PATHS,
    ...pathEntries(pathValue).map((directory) => path.join(directory, 'node')),
  ], executable)
  return node ? path.dirname(node) : null
}

function macLaunchEnvironment(command, environment, {
  pathValue = environment.PATH,
  executable = isExecutable,
} = {}) {
  const nodeDirectory = localNodeDirectory('darwin', pathValue, executable)
  const commandDirectory = path.isAbsolute(command) ? path.dirname(command) : null
  const directories = [
    nodeDirectory,
    commandDirectory,
    ...pathEntries(pathValue),
  ].filter(Boolean)
  return {
    ...environment,
    PATH: [...new Set(directories)].join(path.delimiter),
  }
}

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

async function waitForDsh(url, timeoutMs = READY_TIMEOUT_MS, child = null) {
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

function localDshArgs() {
  // --no-open keeps `dsh web` from also launching a system-browser tab
  // alongside the DSH Native window.
  return ['web', '--port', '3080', '--no-open']
}

function localDshLaunchSpec(platform = process.platform, comSpec = process.env.ComSpec, resolution = {}) {
  const command = localDshCommand(platform, resolution)
  const args = localDshArgs()
  if (platform === 'win32') {
    // Node cannot spawn a .cmd shim directly (it throws EINVAL). Invoke the
    // fixed npm command through cmd.exe without enabling shell interpolation.
    return {
      command: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
      options: { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    }
  }
  const environment = resolution.environment ?? process.env
  const options = { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  if (platform === 'darwin') {
    options.env = macLaunchEnvironment(command, environment, resolution)
  }
  return { command, args, options }
}

function startLocalDsh({ onExit } = {}) {
  const launch = localDshLaunchSpec()
  const child = spawn(launch.command, launch.args, launch.options)
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

module.exports = { LOCAL_DSH_URL, requestReady, startLocalDsh, stopLocalDsh, waitForDsh, localDshCommand, localDshArgs, localDshLaunchSpec }
