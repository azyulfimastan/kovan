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

export function snippet(body) {
  return (body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<\/?(p|u|br)\s*\/?>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/\\([\\*_`~#>\-.[\]])/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a)
    .replace(/^[#>\-*+\d.\s[\]xX]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110)
}

export function renderMarkdown(body, hasTitle) {
  const re = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/gmu
  const src = (body || '').replace(re, (m, link, label) => {
    if (link) {
      const title = link.trim()
      const ok = hasTitle(title)
      return `<a class="wl${ok ? '' : ' missing'}" data-wl="${esc(title)}">${esc((label || title).trim())}</a>`
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
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-wl', 'data-cb'] })
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
