'use strict'

const MAX_WORKSPACE_ROWS = 500
const MAX_ORPHAN_SESSIONS = 50

function cmp(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Accept epoch milliseconds or ISO timestamps; null when unusable. */
function toEpoch(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value)
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function hostMeta(host) {
  return {
    hostId: host.id,
    hostName: String(host.name ?? ''),
    hostUrl: host.url,
    hostLocal: host.local === true,
  }
}

function workspaceRow(host, workspace, sessionsById, sessionUpdatedAt) {
  const workspaceUpdatedAt = toEpoch(workspace.updatedAt) ?? toEpoch(workspace.createdAt) ?? 0
  const latestSessionAt = Array.isArray(workspace.sessionIds)
    ? workspace.sessionIds.reduce((latest, id) => Math.max(latest, sessionUpdatedAt?.get(id) ?? 0), 0)
    : 0
  const updatedAt = latestSessionAt > 0 ? latestSessionAt : workspaceUpdatedAt
  const totalSessions = Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0
  const sessions = sessionsById === null
    ? null
    : workspace.sessionIds
      .map((id) => sessionsById.get(id))
      .filter(Boolean)
      .map((session) => ({
        id: session.id,
        title: session.title ?? '(untitled session)',
        cwd: session.cwd ?? null,
        updatedAt: toEpoch(session.updatedAt) ?? toEpoch(session.createdAt) ?? 0,
      }))
      .sort(sortRecency)
  return {
    kind: 'workspace',
    ...hostMeta(host),
    id: workspace.id,
    title: workspace.title,
    path: workspace.path,
    createdAt: toEpoch(workspace.createdAt),
    updatedAt,
    totalSessions,
    liveSessions: sessions?.length ?? null,
    sessions,
  }
}

function sessionRow(host, session) {
  const updatedAt = toEpoch(session.updatedAt) ?? toEpoch(session.createdAt) ?? 0
  return {
    kind: 'session',
    ...hostMeta(host),
    id: session.id,
    title: session.title ?? '(untitled session)',
    cwd: session.cwd ?? null,
    createdAt: toEpoch(session.createdAt) ?? updatedAt,
    updatedAt,
  }
}

function sortRecency(a, b) {
  return cmp(b.updatedAt, a.updatedAt)
    || cmp(String(a.title), String(b.title))
    || cmp(String(a.path ?? ''), String(b.path ?? ''))
    || cmp(a.hostName, b.hostName)
    || cmp(String(a.id), String(b.id))
}

/**
 * Merge validated Companion results from every server into display rows.
 * Workspaces form one most-recent-first stream (deterministic tie-breakers),
 * while live sessions claimed by no workspace surface separately.
 * A failed server contributes no rows but never blocks the others.
 */
function aggregateServers(entries) {
  const workspaceRows = [];
  const orphanSessions = [];
  for (const entry of entries ?? []) {
    const { host, result } = entry;
    if (!host || !result || result.ok !== true) continue
    const workspaces = Array.isArray(result.workspaces) ? result.workspaces : [];
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    const sessionsById = result.sessions !== null
      ? new Map(sessions.map((session) => [session.id, session]))
      : null;
    const sessionUpdatedAt = result.sessions !== null
      ? new Map(sessions
        .map((session) => [session.id, toEpoch(session.updatedAt) ?? toEpoch(session.createdAt) ?? 0])
        .filter(([, updatedAt]) => updatedAt > 0))
      : null
    const claimed = new Set();
    for (const workspace of workspaces) {
      for (const id of workspace.sessionIds) claimed.add(id);
    }
    for (const workspace of workspaces) {
      workspaceRows.push(workspaceRow(host, workspace, sessionsById, sessionUpdatedAt));
    }
    for (const session of sessions) {
      if (!claimed.has(session.id)) orphanSessions.push(sessionRow(host, session));
    }
  }
  workspaceRows.sort(sortRecency);
  orphanSessions.sort(sortRecency);
  return {
    workspaceRows: workspaceRows.slice(0, MAX_WORKSPACE_ROWS),
    orphanSessions: orphanSessions.slice(0, MAX_ORPHAN_SESSIONS),
  }
}

module.exports = { aggregateServers, sortRecency, toEpoch }