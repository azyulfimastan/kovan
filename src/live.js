import * as Y from 'yjs'
import { store } from './store'

const toB64 = (u8) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function hash32(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

const COLORS = ['#e0556b', '#3b8de0', '#2fa66a', '#8a63d2', '#d9822b', '#17a2b8', '#c2478f', '#7a8a2c']
const colorOf = (id) => COLORS[hash32(String(id)) % COLORS.length]

// Replace the text of a Y.Text with `next` using the smallest edit.
function setText(doc, yt, next) {
  const cur = yt.toString()
  if (cur === next) return
  let p = 0
  const max = Math.min(cur.length, next.length)
  while (p < max && cur.charCodeAt(p) === next.charCodeAt(p)) p++
  let s = 0
  while (s < max - p && cur.charCodeAt(cur.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++
  doc.transact(() => {
    if (cur.length - p - s > 0) yt.delete(p, cur.length - p - s)
    if (next.length - p - s > 0) yt.insert(p, next.slice(p, next.length - s))
  }, 'local')
}

/**
 * Live co-editing of one note (CRDT over a Supabase broadcast channel).
 * Every keystroke is shared instantly; concurrent edits merge instead of overwriting.
 */
export function openLive(noteId, user, initial, { onText, onTyping, onCursors }) {
  const doc = new Y.Doc()
  const yTitle = doc.getText('title')
  const yBody = doc.getText('body')
  let synced = false
  let dead = false
  let pending = null // local edits made before the first sync
  let queue = []
  let flushT = null
  const cursors = new Map() // peer id -> { name, color, pos, ts }
  let lastIdx = null
  let curT = null

  const ch = store.liveChannel(noteId, {
    upd: ({ u, name }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      onTyping?.(name)
    },
    'sync-req': ({ sv }) => {
      if (!synced) return
      ch.send('sync-res', { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(sv))) })
    },
    cur: ({ id, name, s: rel }) => {
      try {
        cursors.set(id, { name, color: colorOf(id), pos: Y.decodeRelativePosition(fromB64(rel)), ts: Date.now() })
        emitCursors()
      } catch {}
    },
    bye: ({ id }) => {
      cursors.delete(id)
      emitCursors()
    },
    'sync-res': ({ u }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      finishSync(false)
    },
  })

  function cursorList() {
    const now = Date.now()
    const out = []
    for (const [id, c] of cursors) {
      if (now - c.ts > 12000) {
        cursors.delete(id)
        continue
      }
      const abs = Y.createAbsolutePositionFromRelativePosition(c.pos, doc)
      if (abs && abs.type === yBody) out.push({ id, name: c.name, color: c.color, idx: abs.index })
    }
    return out
  }
  function emitCursors() {
    if (!dead) onCursors?.(cursorList())
  }
  function sendCursor() {
    if (lastIdx == null || !synced || dead) return
    const rel = Y.createRelativePositionFromTypeIndex(yBody, Math.min(lastIdx, yBody.length))
    ch.send('cur', { id: user.id, name: user.name || user.email || '', s: toB64(Y.encodeRelativePosition(rel)) })
  }

  function emit() {
    if (!dead) onText({ title: yTitle.toString(), body: yBody.toString() })
    emitCursors()
  }

  function finishSync(seed) {
    if (synced || dead) return
    if (seed) {
      const d = new Y.Doc()
      d.clientID = hash32((initial.title || '') + '\u0000' + (initial.body || ''))
      if (initial.title) d.getText('title').insert(0, initial.title)
      if (initial.body) d.getText('body').insert(0, initial.body)
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(d), 'seed')
    }
    synced = true
    clearTimeout(timer)
    if (pending) {
      setText(doc, yTitle, pending.title)
      setText(doc, yBody, pending.body)
      pending = null
    }
    emit()
  }

  doc.on('update', (u, origin) => {
    if (origin === 'remote' || origin === 'seed') return
    queue.push(u)
    if (!flushT)
      flushT = setTimeout(() => {
        flushT = null
        const merged = Y.mergeUpdates(queue)
        queue = []
        ch.send('upd', { u: toB64(merged), name: user.name || user.email || '' })
      }, 60)
  })
  const onObs = (_e, tr) => {
    if (tr.origin === 'remote') emit()
  }
  yTitle.observe(onObs)
  yBody.observe(onObs)

  const timer = setTimeout(() => finishSync(true), 700)
  const beat = setInterval(() => {
    sendCursor()
    emitCursors()
  }, 5000)
  ch.ready(() => ch.send('sync-req', { sv: toB64(Y.encodeStateVector(doc)) }))

  return {
    id: noteId,
    cursor(idx) {
      lastIdx = idx
      clearTimeout(curT)
      curT = setTimeout(sendCursor, 80)
    },
    set(patch) {
      if (dead) return
      if (!synced) {
        pending = { title: initial.title || '', body: initial.body || '', ...(pending || {}), ...patch }
        return
      }
      if ('title' in patch) setText(doc, yTitle, patch.title)
      if ('body' in patch) setText(doc, yBody, patch.body)
      emitCursors()
    },
    destroy() {
      ch.send('bye', { id: user.id })
      dead = true
      clearTimeout(timer)
      clearTimeout(curT)
      clearInterval(beat)
      clearTimeout(flushT)
      ch.close()
      doc.destroy()
    },
  }
}
