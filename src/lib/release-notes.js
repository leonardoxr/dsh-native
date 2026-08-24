'use strict'

// Release-note normalization, ported from T3 Code's releaseNotes.ts.
//
// GitHub release bodies arrive from electron-updater either as a raw string or
// as [{ version, note }] groups carrying HTML and markdown. Everything here is
// defensive on purpose: a malformed payload must never fail an update state
// transition, and output stays bounded so a giant changelog cannot flood the
// renderer over IPC.

const MAX_RELEASE_NOTE_GROUPS = 6
const MAX_RELEASE_NOTE_ITEMS_PER_GROUP = 8
const MAX_RELEASE_NOTE_ITEM_LENGTH = 220

const HTML_ENTITY_REPLACEMENTS = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeCodePoint(codePoint, entity) {
  // String.fromCodePoint throws outside the valid Unicode range, and plain
  // Number.isFinite alone lets oversized values such as &#9999999999; through.
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return '&' + entity + ';'
  }
  return String.fromCodePoint(codePoint)
}

function decodeHtmlEntity(entity) {
  const named = HTML_ENTITY_REPLACEMENTS[entity]
  if (named !== undefined) return named
  if (entity.startsWith('#x')) return decodeCodePoint(Number.parseInt(entity.slice(2), 16), entity)
  if (entity.startsWith('#')) return decodeCodePoint(Number.parseInt(entity.slice(1), 10), entity)
  return '&' + entity + ';'
}

function decodeHtmlEntities(input) {
  return input.replace(/&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g, (_, entity) => decodeHtmlEntity(entity))
}

function stripMarkup(input) {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<\/(?:p|div|li|h[1-6]|ul|ol|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      // Markdown links keep their label, emphasis markers disappear.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1'),
  )
}

function truncateReleaseNoteItem(item) {
  if (item.length <= MAX_RELEASE_NOTE_ITEM_LENGTH) return item
  return item.slice(0, MAX_RELEASE_NOTE_ITEM_LENGTH - 3).trimEnd() + '...'
}

function isIgnoredReleaseNoteLine(line) {
  const normalized = line
    .toLowerCase()
    .replace(new RegExp('[*_\\u0060#]', 'g'), '')
    .trim()
  return (
    normalized === '' ||
    normalized === "what's changed" ||
    normalized === 'whats changed' ||
    normalized === 'full changelog' ||
    normalized === 'new contributors' ||
    normalized.startsWith('compare: ') ||
    normalized.includes('/compare/')
  )
}

function extractReleaseNoteItems(note) {
  if (!note) return []
  const items = []
  for (const rawLine of stripMarkup(String(note)).split('\n')) {
    const item = rawLine
      .trim()
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\s+/g, ' ')
    if (isIgnoredReleaseNoteLine(item)) continue
    items.push(truncateReleaseNoteItem(item))
    if (items.length >= MAX_RELEASE_NOTE_ITEMS_PER_GROUP) break
  }
  return items
}

function isReleaseNoteInfo(value) {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value
  return (
    typeof candidate.version === 'string' &&
    (typeof candidate.note === 'string' || candidate.note === null || candidate.note === undefined)
  )
}

/**
 * Normalize any electron-updater releaseNotes shape into bounded
 * [{ version, items: string[] }] groups safe to ship over IPC.
 */
function normalizeReleaseNotes(releaseNotes, fallbackVersion) {
  let rawNotes = []
  if (typeof releaseNotes === 'string') {
    rawNotes = [{ version: fallbackVersion, note: releaseNotes }]
  } else if (Array.isArray(releaseNotes)) {
    rawNotes = releaseNotes.filter(isReleaseNoteInfo)
  }

  return rawNotes
    .map((entry) => ({ version: entry.version, items: extractReleaseNoteItems(entry.note) }))
    .filter((entry) => entry.items.length > 0)
    .slice(0, MAX_RELEASE_NOTE_GROUPS)
}

module.exports = { normalizeReleaseNotes }
