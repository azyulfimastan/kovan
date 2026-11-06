// Small helpers shared by the app.

// localStorage that never throws (private mode, blocked storage)
export const lsGet = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
export const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}
export const lsDel = (k) => {
  try {
    localStorage.removeItem(k)
  } catch {}
}

export const FOLDER_COLORS = ['#3b82d6', '#3fa56a', '#d9822b', '#8a63d2', '#d9534f', '#17a2b8', '#c2478f', '#7a8a2c', '#e0b020', '#5b6ee1', '#2f9e8f', '#8d6e63']

// a folder's colour: its own, or a stable one picked from its id
export const folderColor = (f) => {
  if (!f) return null
  if (f.color && FOLDER_COLORS.includes(f.color)) return f.color
  let h = 0
  for (const ch of String(f.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FOLDER_COLORS[h % FOLDER_COLORS.length]
}

// per-account storage quota (must match supabase/quota.sql)
export const QUOTA = 300 * 1024 * 1024
export const fmtBytes = (b) =>
  b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'

// photos a note uses: attached ones and any pasted into the text
export const IMG_RE = /https?:\/\/[^\s)"'<>]+\/note-images\/[^\s)"'<>]+/g
export const imagesOf = (n) => [...new Set([...(n?.images || []), ...((n?.body || '').match(IMG_RE) || [])])]

// "5 Kas 19:37" (year added when it isn't this year)
export function when(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  const day = d.toLocaleDateString(lang, d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${day} ${d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`
}

export function initialTheme() {
  const s = lsGet('kovan.theme')
  if (s === 'light' || s === 'dark') return s
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
