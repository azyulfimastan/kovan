import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const norm = (s) => (s || '').trim().toLowerCase()

export function extractLinks(body) {
  const out = []
  const re = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g
  let m
  while ((m = re.exec(body || ''))) out.push(m[1].trim())
  return out
}

export function extractTags(body) {
  const set = new Set()
  const re = /(^|\s)#([\p{L}\p{N}_-]+)/gu
  let m
  while ((m = re.exec(body || ''))) {
    if (/\p{L}/u.test(m[2])) set.add(m[2].toLowerCase())
  }
  return [...set]
}

export function snippet(body) {
  return (body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
    .replace(/^[#>\-*+\d.\s[\]xX]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110)
}

export function renderMarkdown(body, hasTitle) {
  const re = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]|(^|[\s>])#([\p{L}\p{N}_-]+)/gmu
  const src = (body || '').replace(re, (m, link, label, pre, tag) => {
    if (link) {
      const title = link.trim()
      const ok = hasTitle(title)
      return `<a class="wl${ok ? '' : ' missing'}" data-wl="${esc(title)}">${esc((label || title).trim())}</a>`
    }
    if (tag && /\p{L}/u.test(tag)) {
      return `${pre}<span class="tag" data-tag="${esc(tag.toLowerCase())}">#${esc(tag)}</span>`
    }
    return m
  })

  let html = marked.parse(src)
  let i = 0
  html = html.replace(
    /<input\s+(checked=""\s+)?disabled=""\s+type="checkbox">/g,
    (_m, c) =>
      `<span class="cb${c ? ' on' : ''}" data-cb="${i++}" role="checkbox" aria-checked="${c ? 'true' : 'false'}" tabindex="0"></span>`,
  )
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wl', 'data-tag', 'data-cb'] })
}

// Flip the n-th checkbox ("- [ ]" <-> "- [x]") in the markdown source.
export function toggleCheckbox(body, index) {
  let n = -1
  return (body || '').replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/gm, (m, pre, mark) => {
    n++
    if (n !== index) return m
    return `${pre}[${mark === ' ' ? 'x' : ' '}]`
  })
}
