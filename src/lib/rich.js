// Rich-text editor setup shared by the editor and the live (co-editing) layer.
// Notes are still stored as Markdown; this file converts between the two.
import { generateJSON, getSchema, Mark } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'

// Font size is stored as an inline <span style="font-size:Npx"> inside the Markdown.
export const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return { size: { default: null, rendered: false } }
  },
  parseHTML() {
    return [{ tag: 'span', getAttrs: (el) => { const v = parseFloat(el.style?.fontSize); return v > 0 ? { size: v } : false } }]
  },
  renderHTML({ mark }) {
    return ['span', { style: `font-size:${mark.attrs.size}px` }, 0]
  },
  // a paragraph whose text is all sized gets its biggest size itself, so its line height shrinks/grows with it
  addProseMirrorPlugins() {
    return [
      // pressing Enter keeps typing at the size you were using
      new Plugin({
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((t) => t.docChanged)) return null
          const sel = newState.selection
          if (!sel.empty || newState.storedMarks) return null
          const $f = sel.$from
          if ($f.parent.type.name !== 'paragraph' || $f.parent.content.size !== 0 || $f.depth < 1) return null
          if (oldState.selection.$from.parent.content.size === 0) return null
          const container = $f.node($f.depth - 1)
          const idx = $f.index($f.depth - 1)
          const prev = idx > 0 ? container.child(idx - 1) : null
          const last = prev && prev.type.name === 'paragraph' ? prev.lastChild : null
          const m = last && last.isText ? last.marks.find((x) => x.type.name === 'fontSize') : null
          return m ? newState.tr.setStoredMarks([m]) : null
        },
      }),
      new Plugin({
        props: {
          decorations(state) {
            const decos = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return
              // a paragraph with no text at all is a blank line: squeeze it (text + a line break is NOT blank)
              if (!node.textContent.trim()) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'p-empty' }))
              if (!node.childCount) return
              let size = 0
              let ok = true
              node.forEach((c) => {
                if (!ok || !c.isText) return
                const m = c.marks.find((x) => x.type.name === 'fontSize')
                if (!m) ok = false
                else size = Math.max(size, m.attrs.size)
              })
              if (ok && size) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `font-size:${size}px` }))
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('fontSize', { size }).run(),
      unsetFontSize: () => ({ chain }) => chain().unsetMark('fontSize').run(),
    }
  },
})

export function baseExtensions({ collab = false } = {}) {
  const kit = {
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, linkOnPaste: true },
  }
  if (collab) kit.undoRedo = false
  else kit.undoRedo = { depth: 20 }
  return [StarterKit.configure(kit), TaskList, TaskItem.configure({ nested: true }), Image, FontSize]
}

export const schema = getSchema(baseExtensions())

// ---------- Markdown -> HTML (what the editor understands) ----------
const md = new Marked({ gfm: true, breaks: true })

// Repair for notes saved by an older build: a paragraph that began with spaces plus a font-size span
// was read back as a code block full of raw <span> text.
function repair(src) {
  return (src || '')
    .replace(/^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm, (m, body) =>
      /^\s*<span style="font-size:[\d.]+px">/.test(body) && /<\/span>\s*$/.test(body) ? body.trim() : m,
    )
    .replace(/^[ \t\u00a0]+(<span style="font-size)/gm, '$1')
}

export function mdToHtml(src) {
  const html = md.parse(repair(src))
  const box = document.createElement('div')
  box.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['checked'] })
  // images sit on their own line in the editor
  box.querySelectorAll('p').forEach((p) => {
    if (!p.querySelector('img')) return
    const rest = [...p.childNodes].filter((c) => !(c.nodeName === 'IMG' || c.nodeName === 'BR' || (c.nodeType === 3 && !c.textContent.trim())))
    if (rest.length === 0) p.replaceWith(...[...p.childNodes].filter((c) => c.nodeName === 'IMG'))
  })
  // GFM task lists -> editor task lists
  box.querySelectorAll('li').forEach((li) => {
    const cb = li.querySelector(':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]')
    if (!cb) return
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', cb.checked || cb.hasAttribute('checked') ? 'true' : 'false')
    const next = cb.nextSibling
    if (next && next.nodeType === 3) next.textContent = next.textContent.replace(/^\s+/, '')
    cb.remove()
    const ul = li.parentElement
    if (ul && ul.tagName === 'UL') ul.setAttribute('data-type', 'taskList')
  })
  box.querySelectorAll('ul[data-type=taskList] > li:not([data-type])').forEach((li) => {
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', 'false')
  })
  return box.innerHTML
}

export function mdToJSON(src) {
  return generateJSON(mdToHtml(src), baseExtensions())
}

// ---------- editor JSON -> Markdown (what we store) ----------
const ORDER = ['link', 'fontSize', 'bold', 'italic', 'strike', 'underline', 'code']
const DELIM = { bold: ['**', '**'], italic: ['*', '*'], strike: ['~~', '~~'], underline: ['<u>', '</u>'], code: ['`', '`'] }

function escText(t) {
  return t
    .replace(/\\/g, '\\\\')
    .replace(/([*`~])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/(^|[^\p{L}\p{N}])_/gu, '$1\\_')
    .replace(/_(?=[^\p{L}\p{N}]|$)/gu, '\\_')
}

function escLine(line) {
  return line
    .replace(/^(\s*)(#{1,6}\s)/, '$1\\$2')
    .replace(/^(\s*)>/, '$1\\>')
    .replace(/^(\s*)([-+]\s)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)]\s)/, '$1$2\\$3')
    .replace(/^(\s*)(---+|___+)\s*$/, '$1\\$2')
    .replace(/^(\s*)```/, '$1\\`\\`\\`')
}

function inline(nodes = []) {
  let out = ''
  const open = []
  let trail = ''
  const closer = (m) => (m.name === 'link' ? `](${m.href || ''})` : m.name === 'fontSize' ? '</span>' : DELIM[m.name][1])
  const closeTo = (n) => {
    while (open.length > n) out += closer(open.pop())
  }
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      closeTo(0)
      out += trail + '\n'
      trail = ''
      continue
    }
    if (node.type === 'image') {
      closeTo(0)
      out += trail + `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`
      trail = ''
      continue
    }
    if (node.type !== 'text') continue
    const marks = (node.marks || [])
      .map((m) => ({ name: m.type, href: m.attrs?.href, size: m.attrs?.size }))
      .filter((m) => ORDER.includes(m.name))
      .sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))
    let k = 0
    while (k < open.length && k < marks.length && open[k].name === marks[k].name && open[k].href === marks[k].href && open[k].size === marks[k].size) k++
    closeTo(k)
    out += trail
    trail = ''
    const isCode = marks.some((m) => m.name === 'code')
    let text = isCode ? node.text : escText(node.text)
    if (marks.length) {
      const lead = k < marks.length ? /^\s*/.exec(text)[0] : ''
      text = text.slice(lead.length)
      out += lead
      const tm = /\s*$/.exec(text)[0]
      if (tm && tm.length < text.length) {
        trail = tm
        text = text.slice(0, text.length - tm.length)
      }
    }
    for (const m of marks.slice(k)) {
      out += m.name === 'link' ? '[' : m.name === 'fontSize' ? `<span style="font-size:${m.size}px">` : DELIM[m.name][0]
      open.push(m)
    }
    out += text
  }
  closeTo(0)
  return out + trail
}

function para(node) {
  return inline(node.content)
    .split('\n')
    // leading spaces would turn the line into an indented code block
    .map((l) => escLine(l.replace(/^[ \t\u00a0]+/, '')))
    .join('\n')
}

function listItem(li, marker, pad) {
  const inner = (li.content || []).map((c) => block(c, true)).join('\n')
  return inner
    .split('\n')
    .map((l, i) => (i === 0 ? marker + l : l ? pad + l : l))
    .join('\n')
}

function block(n, inList = false) {
  switch (n.type) {
    case 'paragraph': {
      const t = para(n)
      return t || (inList ? '' : '<p></p>')
    }
    case 'heading':
      return '#'.repeat(n.attrs?.level || 1) + ' ' + inline(n.content)
    case 'blockquote':
      return blocks(n.content)
        .split('\n')
        .map((l) => (l ? '> ' + l : '>'))
        .join('\n')
    case 'codeBlock':
      return '```' + (n.attrs?.language || '') + '\n' + (n.content || []).map((c) => c.text || '').join('').replace(/\n$/, '') + '\n```'
    case 'horizontalRule':
      return '---'
    case 'image':
      return `![${n.attrs?.alt || ''}](${n.attrs?.src || ''})`
    case 'bulletList':
      return (n.content || []).map((li) => listItem(li, '- ', '  ')).join('\n')
    case 'orderedList': {
      const start = n.attrs?.start || 1
      return (n.content || []).map((li, i) => listItem(li, `${start + i}. `, ' '.repeat(String(start + i).length + 2))).join('\n')
    }
    case 'taskList':
      return (n.content || []).map((li) => listItem(li, `- [${li.attrs?.checked ? 'x' : ' '}] `, '  ')).join('\n')
    default:
      return n.content ? blocks(n.content) : ''
  }
}

function blocks(nodes = []) {
  return nodes.map((n) => block(n)).join('\n\n')
}

export function docToMd(json) {
  const content = [...(json?.content || [])]
  // drop empty paragraphs at the end (the editor always keeps one there)
  while (content.length && content[content.length - 1].type === 'paragraph' && !(content[content.length - 1].content || []).length) content.pop()
  return blocks(content)
}
