// The whole room as a ZIP: one .md file per note (folders become subfolders), photos in images/.
import { makeZip, safeName } from './zip'
import { IMG_RE } from './util'

export async function exportRoom({ notes, folders, roomName, untitled }) {
  const files = []
  const names = new Set()
  const uniq = (path) => {
    let p = path
    for (let i = 2; names.has(p.toLowerCase()); i++) p = path.replace(/(\.\w+)$/, ` (${i})$1`)
    names.add(p.toLowerCase())
    return p
  }
  const imgPath = new Map()
  for (const url of [...new Set(notes.flatMap((n) => [...(n.images || []), ...((n.body || '').match(IMG_RE) || [])]))]) {
    try {
      let data
      if (url.startsWith('data:')) data = Uint8Array.from(atob(url.split(',')[1] || ''), (c) => c.charCodeAt(0))
      else data = new Uint8Array(await (await fetch(url)).arrayBuffer())
      const ext = /\.(png|gif|webp|jpe?g)(\?|$)/i.exec(url)?.[1] || (url.startsWith('data:image/png') ? 'png' : 'jpg')
      const p = uniq(`images/${String(imgPath.size + 1).padStart(3, '0')}.${ext}`)
      imgPath.set(url, p)
      files.push({ name: p, data })
    } catch {}
  }
  for (const n of notes) {
    const folder = folders.find((f) => f.id === n.folder_id)
    const dir = folder ? safeName(folder.name, 'folder') + '/' : ''
    const up = dir ? '../' : ''
    let body = n.body || ''
    for (const [u, p] of imgPath) body = body.split(u).join(up + p)
    const extra = (n.images || []).filter((u) => imgPath.has(u)).map((u) => `![](${up}${imgPath.get(u)})`).join('\n\n')
    const text = (n.title ? `# ${n.title}\n\n` : '') + body + (extra ? `\n\n${extra}\n` : '\n')
    files.push({ name: uniq(dir + safeName(n.title, untitled) + '.md'), data: text, date: new Date(n.updated_at || Date.now()) })
  }
  const blob = makeZip(files)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Kovan - ${safeName(roomName, 'notes')} - ${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
