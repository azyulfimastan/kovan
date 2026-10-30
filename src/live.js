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
export function openLive(noteId, user, initial, { onText, onTyping }) {
  const doc = new Y.Doc()
  const yTitle = doc.getText('title')
  const yBody = doc.getText('body')
  let synced = false
  let dead = false
  let pending = null // local edits made before the first sync
  let queue = []
  let flushT = null

  const ch = store.liveChannel(noteId, {
    upd: ({ u, name }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      onTyping?.(name)
    },
    'sync-req': ({ sv }) => {
      if (!synced) return
      ch.send('sync-res', { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(sv))) })
    },
    'sync-res': ({ u }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      finishSync(false)
    },
  })

  function emit() {
    if (!dead) onText({ title: yTitle.toString(), body: yBody.toString() })
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
  ch.ready(() => ch.send('sync-req', { sv: toB64(Y.encodeStateVector(doc)) }))

  return {
    id: noteId,
    set(patch) {
      if (dead) return
      if (!synced) {
        pending = { title: initial.title || '', body: initial.body || '', ...(pending || {}), ...patch }
        return
      }
      if ('title' in patch) setText(doc, yTitle, patch.title)
      if ('body' in patch) setText(doc, yBody, patch.body)
    },
    destroy() {
      dead = true
      clearTimeout(timer)
      clearTimeout(flushT)
      ch.close()
      doc.destroy()
    },
  }
}
