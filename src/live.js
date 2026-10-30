import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { store } from './store'
import { schema, mdToJSON } from './lib/rich'

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
export const colorOf = (id) => COLORS[hash32(String(id)) % COLORS.length]

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
 * The title is a Y.Text, the body is the rich-text editor's document (Y.XmlFragment).
 * Every keystroke is shared instantly; concurrent edits merge instead of overwriting.
 */
export function openLive(noteId, user, initial, { onTitle, onTyping }) {
  const doc = new Y.Doc()
  const yTitle = doc.getText('title')
  const fragment = doc.getXmlFragment('prose')
  const awareness = new Awareness(doc)
  let synced = false
  let dead = false
  let pendingTitle = null
  let queue = []
  let flushT = null
  const waiters = []

  const ch = store.liveChannel('v2:' + noteId, {
    upd: ({ u, name }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      onTyping?.(name)
    },
    'sync-req': ({ sv }) => {
      sendAwareness()
      if (!synced) return
      ch.send('sync-res', { u: toB64(Y.encodeStateAsUpdate(doc, fromB64(sv))) })
    },
    'sync-res': ({ u }) => {
      Y.applyUpdate(doc, fromB64(u), 'remote')
      finishSync(false)
    },
    aw: ({ u }) => {
      try {
        applyAwarenessUpdate(awareness, fromB64(u), 'remote')
      } catch {}
    },
  })

  function sendAwareness(ids = [doc.clientID]) {
    if (dead) return
    ch.send('aw', { u: toB64(encodeAwarenessUpdate(awareness, ids)) })
  }
  // cursor moves are sent at most ~7 times a second
  let awIds = new Set()
  let awT = null
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === 'remote') return
    added.concat(updated, removed).forEach((id) => awIds.add(id))
    if (awT) return
    awT = setTimeout(() => {
      awT = null
      const ids = [...awIds]
      awIds = new Set()
      sendAwareness(ids)
    }, 140)
  })

  function finishSync(seed) {
    if (synced || dead) return
    if (seed && fragment.length === 0 && (initial.title || initial.body)) {
      // everyone who opens the same saved note seeds the exact same update, so seeds never duplicate
      const d = new Y.Doc()
      d.clientID = hash32((initial.title || '') + '\u0000' + (initial.body || ''))
      if (initial.title) d.getText('title').insert(0, initial.title)
      try {
        prosemirrorJSONToYXmlFragment(schema, mdToJSON(initial.body || ''), d.getXmlFragment('prose'))
      } catch {}
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(d), 'seed')
    }
    synced = true
    clearTimeout(timer)
    if (pendingTitle != null) {
      setText(doc, yTitle, pendingTitle)
      pendingTitle = null
    }
    onTitle?.(yTitle.toString())
    waiters.splice(0).forEach((f) => f())
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
      }, 80)
  })
  yTitle.observe((_e, tr) => {
    if (tr.origin === 'remote' && !dead) onTitle?.(yTitle.toString())
  })

  const timer = setTimeout(() => finishSync(true), 700)
  ch.ready(() => {
    ch.send('sync-req', { sv: toB64(Y.encodeStateVector(doc)) })
    sendAwareness()
  })

  return {
    id: noteId,
    doc,
    fragment,
    awareness,
    user: { name: (user.name || user.email || '?').split(' ')[0], color: colorOf(user.id) },
    get synced() {
      return synced
    },
    whenSynced(f) {
      if (synced) f()
      else waiters.push(f)
    },
    set(patch) {
      if (dead || !('title' in patch)) return
      if (!synced) pendingTitle = patch.title
      else setText(doc, yTitle, patch.title)
    },
    destroy() {
      try {
        removeAwarenessStates(awareness, [doc.clientID], 'local')
      } catch {}
      clearTimeout(awT)
      sendAwareness([doc.clientID])
      dead = true
      clearTimeout(timer)
      clearTimeout(flushT)
      if (queue.length) ch.send('upd', { u: toB64(Y.mergeUpdates(queue)), name: user.name || '' })
      awareness.destroy()
      ch.close()
      doc.destroy()
    },
  }
}
