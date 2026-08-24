'use strict'

function originOf(value) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function allowedWorkspaceOrigins(localUrl, hosts) {
  return new Set([
    originOf(localUrl),
    ...(hosts ?? []).map((host) => originOf(host?.url)),
  ].filter(Boolean))
}

function assertWorkspaceSender(senderUrl, localUrl, hosts) {
  const origin = originOf(senderUrl)
  if (origin === null || !allowedWorkspaceOrigins(localUrl, hosts).has(origin)) {
    throw new Error('Workspace bridge is available only to the managed local server and saved DSH servers.')
  }
}

module.exports = { allowedWorkspaceOrigins, assertWorkspaceSender, originOf }
