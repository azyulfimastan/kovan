import { TextSelection } from '@tiptap/pm/state'

// YouTube links pasted into a note: numbered item + the video title underneath.
const YT = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{6,}[^\s]*$/i

export const isYouTube = (s) => YT.test((s || '').trim())

async function fetchTitle(url) {
  const tries = [
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
  ]
  for (const u of tries) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 6000)
      const r = await fetch(u, { signal: ctl.signal })
      clearTimeout(t)
      if (!r.ok) continue
      const j = await r.json()
      if (j?.title) return String(j.title).trim()
    } catch {}
  }
  return null
}

const TITLE_SIZE = 11
const LINK_SIZE = 14

// Pasting a YouTube link: it becomes the next numbered item, the video title goes on the line below (small).
// returns true when the paste was handled
export function pasteYouTube(view, text) {
  const url = (text || '').trim()
  if (!isYouTube(url)) return false
  const { state } = view
  const { schema } = state
  const link = schema.marks.link
  const { orderedList, listItem, paragraph } = schema.nodes
  if (!link || !orderedList || !listItem || !state.selection.empty) return false
  const $f = state.selection.$from
  const parent = $f.parent
  if (parent.type !== paragraph) return false
  const fsm = schema.marks.fontSize
  const linkText = schema.text(url, [link.create({ href: url }), ...(fsm ? [fsm.create({ size: LINK_SIZE })] : [])])
  const tr = state.tr
  const empty = parent.content.size === 0
  const inItem = $f.depth >= 2 && $f.node($f.depth - 1).type === listItem && $f.node($f.depth - 2).type === orderedList

  if (inItem && empty) {
    tr.insert($f.pos, linkText)
  } else if ($f.depth === 1) {
    const item = listItem.create(null, paragraph.create(null, linkText))
    const before = $f.before(), after = $f.after()
    const prev = state.doc.maybeChild($f.index(0) - 1)
    if (empty && prev && prev.type === orderedList) {
      tr.insert(before - 1, item) // end of the previous list: numbering continues
      tr.setSelection(TextSelection.create(tr.doc, before + item.nodeSize + 1))
    } else if (empty) {
      const list = orderedList.create(null, item)
      tr.insert(before, list)
      tr.setSelection(TextSelection.create(tr.doc, before + list.nodeSize + 1))
    } else {
      const list = orderedList.create(null, item)
      tr.insert(after, [list, paragraph.create()])
      tr.setSelection(TextSelection.create(tr.doc, after + list.nodeSize + 1))
    }
  } else {
    return false // nested somewhere odd: let the normal paste happen
  }
  view.dispatch(tr.scrollIntoView())

  fetchTitle(url).then((title) => {
    if (!title || view.isDestroyed) return
    const st = view.state
    const fs = st.schema.marks.fontSize
    let end = null
    st.doc.descendants((node, pos) => {
      if (end != null || !node.isText) return
      if (node.text === url && node.marks.some((m) => m.type === link && m.attrs.href === url)) {
        const e = pos + node.nodeSize
        const next = st.doc.resolve(e).nodeAfter
        if (!next) end = e
      }
    })
    if (end == null) return
    const t = st.schema.text(title, fs ? [fs.create({ size: TITLE_SIZE })] : [])
    view.dispatch(st.tr.insert(end, [st.schema.nodes.hardBreak.create(), t]))
  })
  return true
}
