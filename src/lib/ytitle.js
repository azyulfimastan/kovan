// Pasting a YouTube link: keep it as a link and write the video's title right after it.
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

// returns true when the paste was handled
export function pasteYouTube(view, text) {
  const url = (text || '').trim()
  if (!isYouTube(url)) return false
  const { state } = view
  const link = state.schema.marks.link
  if (!link || state.selection.$from.parent.type.name === 'codeBlock') return false
  view.dispatch(state.tr.replaceSelectionWith(state.schema.text(url, [link.create({ href: url })]), false).scrollIntoView())
  fetchTitle(url).then((title) => {
    if (!title || view.isDestroyed) return
    const st = view.state
    let end = null
    st.doc.descendants((node, pos) => {
      if (end != null || !node.isText) return
      if (node.marks.some((m) => m.type === link && m.attrs.href === url) && node.text === url) {
        const e = pos + node.nodeSize
        if (st.doc.textBetween(e, Math.min(e + 3, st.doc.content.size), '\n') !== ' - ') end = e
      }
    })
    if (end != null) view.dispatch(st.tr.insert(end, st.schema.text(' - ' + title)))
  })
  return true
}
