import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons'
import { useI18n } from './i18n'
import { renderMarkdown, toggleCheckbox, norm } from './lib/md'
import { LABELS } from './Board'

const SLASH = [
  { id: 'h1', insert: '# ' },
  { id: 'h2', insert: '## ' },
  { id: 'h3', insert: '### ' },
  { id: 'todo', insert: '- [ ] ' },
  { id: 'bullet', insert: '- ' },
  { id: 'numbered', insert: '1. ' },
  { id: 'quote', insert: '> ' },
  { id: 'code', insert: '```\n\n```', cursor: 4 },
  { id: 'divider', insert: '\n---\n' },
  { id: 'link', insert: '[[' },
  { id: 'today', insert: '' },
]

function detect(value, pos) {
  const before = value.slice(0, pos)
  let m = /\[\[([^\]\n]*)$/.exec(before)
  if (m) return { type: 'link', query: m[1], start: pos - m[0].length }
  m = /(^|\n)\/([^\s/]*)$/.exec(before)
  if (m) return { type: 'slash', query: m[2], start: pos - m[2].length - 1 }
  return null
}

// Pixel position of a character index inside a textarea (mirror-div technique).
function caretXY(ta, idx) {
  const cs = getComputedStyle(ta)
  const d = document.createElement('div')
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'tabSize', 'textIndent']) d.style[k] = cs[k]
  d.style.cssText += ';position:absolute;visibility:hidden;top:0;left:0;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;border-style:solid;border-color:transparent;'
  d.style.width = ta.offsetWidth + 'px'
  d.textContent = ta.value.slice(0, idx)
  const m = document.createElement('span')
  m.textContent = '\u200b'
  d.appendChild(m)
  document.body.appendChild(d)
  const r = { x: m.offsetLeft, y: m.offsetTop, h: parseFloat(cs.lineHeight) || 24 }
  d.remove()
  return r
}

export default function Editor({
  note,
  notes,
  backlinks,
  saveState,
  mode,
  setMode,
  hasTitle,
  onChange,
  onPin,
  onDelete,
  onOpenTitle,
  onOpenNote,
  typing = '',
  onUpload,
  onImages,
  cursors = [],
  columns = [],
  members = [],
  onCard,
  boardBack,
  onCursor,
  folders = [],
  onFolder,
  onBack,
}) {
  const { t, lang } = useI18n()
  const taRef = useRef(null)
  const titleRef = useRef(null)
  const [pop, setPop] = useState(null)
  const [idx, setIdx] = useState(0)

  // autosize textarea
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.max(ta.scrollHeight, 240) + 'px'
  }, [note.body, mode, note.id])

  useEffect(() => {
    setPop(null)
    if (!note.title && !note.body && titleRef.current) titleRef.current.focus()
  }, [note.id])

  const items = useMemo(() => {
    if (!pop) return []
    const q = norm(pop.query)
    if (pop.type === 'slash') {
      return SLASH.map((s) => ({ ...s, label: t('s_' + s.id) })).filter((s) => norm(s.label).includes(q) || s.id.includes(q))
    }
    return notes
      .filter((n) => n.id !== note.id && n.title && norm(n.title).includes(q))
      .slice(0, 6)
      .map((n) => ({ id: n.id, label: n.title, title: n.title }))
  }, [pop, notes, note.id, t, lang])

  const words = useMemo(() => (note.body.trim() ? note.body.trim().split(/\s+/).length : 0), [note.body])
  const attached = note.images || []
  const legacy = useMemo(() => [...note.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)\n?/g)].map((m) => ({ url: m[1], raw: m[0] })), [note.body])
  const [lightbox, setLightbox] = useState(null)
  useEffect(() => {
    if (!lightbox) return
    const k = (e) => e.key === 'Escape' && setLightbox(null)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [lightbox])
  const html = useMemo(() => (mode === 'preview' ? renderMarkdown(note.body, hasTitle) : ''), [mode, note.body, hasTitle])

  // Cursor position to restore right after the next render (set synchronously,
  // so fast typing can never race with it).
  const selRef = useRef(null)
  const imagesRef = useRef(note.images || [])
  imagesRef.current = note.images || []
  const bodyRef = useRef(note.body)
  bodyRef.current = note.body
  const expectBody = useRef(note.body)
  const prevBody = useRef(note.body)
  const selMemo = useRef({ s: 0, e: 0 })
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [kbBottom, setKbBottom] = useState(0)
  const [touch, setTouch] = useState(() => window.matchMedia?.('(pointer: coarse), (max-width: 720px)').matches)
  const [carets, setCarets] = useState([])

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse), (max-width: 720px)')
    const f = () => setTouch(!!mq?.matches)
    mq?.addEventListener?.('change', f)
    return () => mq?.removeEventListener?.('change', f)
  }, [])

  // keep the toolbar glued above the on-screen keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const f = () => setKbBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    f()
    vv.addEventListener('resize', f)
    vv.addEventListener('scroll', f)
    return () => {
      vv.removeEventListener('resize', f)
      vv.removeEventListener('scroll', f)
    }
  }, [])

  // friends' cursors
  useLayoutEffect(() => {
    const ta = taRef.current
    if (mode !== 'edit' || !ta || cursors.length === 0) return setCarets([])
    const calc = () => setCarets(cursors.map((c) => ({ ...c, ...caretXY(ta, Math.min(c.idx, ta.value.length)) })))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [cursors, note.body, mode])

  // formatting toolbar actions
  function wrapSel(before, after = before) {
    const ta = taRef.current
    if (!ta) return
    const v = note.body
    const a = ta.selectionStart
    const b = ta.selectionEnd
    const sel = v.slice(a, b) || ''
    const next = v.slice(0, a) + before + sel + after + v.slice(b)
    setBody(next, sel ? a + before.length + sel.length + after.length : a + before.length)
  }
  function linePrefix(prefix) {
    const ta = taRef.current
    if (!ta) return
    const v = note.body
    const a = ta.selectionStart
    const ls = v.lastIndexOf('\n', a - 1) + 1
    const has = v.startsWith(prefix, ls)
    const next = has ? v.slice(0, ls) + v.slice(ls + prefix.length) : v.slice(0, ls) + prefix + v.slice(ls)
    setBody(next, a + (has ? -prefix.length : prefix.length))
  }
  const TB = [
    { k: 'tbBold', label: 'B', cls: 'b', run: () => wrapSel('**') },
    { k: 'tbItalic', label: 'I', cls: 'i', run: () => wrapSel('*') },
    { k: 'tbHeading', label: 'H', run: () => linePrefix('## ') },
    { k: 'tbList', label: '•', run: () => linePrefix('- ') },
    { k: 'tbTodo', label: '☐', run: () => linePrefix('- [ ] ') },
    { k: 'tbNumber', label: '1.', run: () => linePrefix('1. ') },
    { k: 'tbQuote', label: '❝', run: () => linePrefix('> ') },
    { k: 'tbLink', label: '[[ ]]', run: () => wrapSel('[[', ']]') },
  ]

  // a change that did not come from this keyboard (a friend typing): keep my cursor where it was
  useLayoutEffect(() => {
    const prev = prevBody.current
    prevBody.current = note.body
    if (note.body === expectBody.current || prev === note.body) return
    const ta = taRef.current
    if (!ta || document.activeElement !== ta) return
    let p = 0
    const max = Math.min(prev.length, note.body.length)
    while (p < max && prev.charCodeAt(p) === note.body.charCodeAt(p)) p++
    let sfx = 0
    while (sfx < max - p && prev.charCodeAt(prev.length - 1 - sfx) === note.body.charCodeAt(note.body.length - 1 - sfx)) sfx++
    const move = (pos) => (pos <= p ? pos : pos >= prev.length - sfx ? pos + (note.body.length - prev.length) : p)
    const { s: a, e: b } = selMemo.current
    const na = Math.max(0, move(a))
    const nb = Math.max(0, move(b))
    ta.setSelectionRange(na, nb)
    selMemo.current = { s: na, e: nb }
  }, [note.body])
  useLayoutEffect(() => {
    const pos = selRef.current
    if (pos == null) return
    selRef.current = null
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(pos, pos)
    setPop(detect(note.body, pos))
    setIdx(0)
  }, [note.body])

  function setBody(v, pos) {
    selRef.current = pos
    expectBody.current = v
    onChange({ body: v })
  }

  function applyItem(item) {
    const ta = taRef.current
    const v = note.body
    const pos = ta.selectionStart
    if (pop.type === 'slash') {
      const text = item.id === 'today' ? new Date().toLocaleDateString(lang, { dateStyle: 'long' }) : item.insert
      const next = v.slice(0, pop.start) + text + v.slice(pos)
      setBody(next, pop.start + (item.cursor ?? text.length))
    } else {
      const text = `[[${item.title}]]`
      const next = v.slice(0, pop.start) + text + v.slice(pos)
      setBody(next, pop.start + text.length)
    }
    if (item.id !== 'link') setPop(null)
  }

  function onInput(e) {
    const v = e.target.value
    expectBody.current = v
    selMemo.current = { s: e.target.selectionStart, e: e.target.selectionEnd }
    onCursor?.(e.target.selectionStart)
    onChange({ body: v })
    setPop(detect(v, e.target.selectionStart))
    setIdx(0)
  }

  function onKeyDown(e) {
    if (pop && items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((i) => (i + 1) % items.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((i) => (i - 1 + items.length) % items.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyItem(items[idx])
        return
      }
    }
    if (pop && e.key === 'Escape') {
      setPop(null)
      return
    }
    // keep lists going on Enter
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const ta = e.target
      const pos = ta.selectionStart
      if (ta.selectionEnd !== pos) return
      const v = note.body
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1
      const line = v.slice(lineStart, pos)
      const m = /^(\s*)(?:([-*+])|(\d+)\.)\s(\[[ xX]\]\s)?(.*)$/.exec(line)
      if (m) {
        e.preventDefault()
        const [, ind, bul, num, cb, rest] = m
        if (rest.trim() === '') {
          setBody(v.slice(0, lineStart) + v.slice(pos), lineStart)
        } else {
          const marker = ind + (bul ? bul + ' ' : Number(num) + 1 + '. ') + (cb ? '[ ] ' : '')
          const ins = '\n' + marker
          setBody(v.slice(0, pos) + ins + v.slice(pos), pos + ins.length)
        }
      }
    }
  }

  function onPreviewClick(e) {
    const wl = e.target.closest('[data-wl]')
    if (wl) return onOpenTitle(wl.dataset.wl)
    if (e.target.tagName === 'IMG') return setLightbox(e.target.src)
    const cb = e.target.closest('[data-cb]')
    if (cb) onChange({ body: toggleCheckbox(note.body, Number(cb.dataset.cb)) })
  }

  async function addImages(files) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'))
    if (!imgs.length || !onUpload) return
    setUploading(true)
    try {
      for (const f of imgs) {
        const url = await onUpload(f)
        if (!url) continue
        imagesRef.current = [...imagesRef.current, url]
        onImages(imagesRef.current)
      }
    } finally {
      setUploading(false)
    }
  }

  function exportMd() {
    const text = (note.title ? `# ${note.title}\n\n` : '') + note.body
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (note.title || 'note').replace(/[^\p{L}\p{N}_ -]+/gu, '').trim().replace(/\s+/g, '-') + '.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="editor">
      <header className="ed-bar">
        <button className="icon-btn only-narrow" onClick={onBack} title={t('back')}>
          <Icon name="back" />
        </button>
        {boardBack && (
          <button className="btn small" onClick={boardBack}>
            ← {t('board')}
          </button>
        )}
        <span className="grow" />
        {typing && <span className="typing">✎ {t('typing', { name: typing })}</span>}
        <span className={`save ${saveState}`}>{saveState === 'saving' ? t('saving') : t('saved')}</span>
        {onUpload && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addImages(e.target.files)
                e.target.value = ''
              }}
            />
            <button className="icon-btn" disabled={uploading} onClick={() => fileRef.current?.click()} title={uploading ? t('uploading') : t('addImage')}>
              <Icon name="image" />
            </button>
          </>
        )}
        <button className={`icon-btn ${note.pinned ? 'active' : ''}`} onClick={onPin} title={note.pinned ? t('unpin') : t('pin')}>
          <Icon name="pin" />
        </button>
        <button className="icon-btn" onClick={exportMd} title={t('export')}>
          <Icon name="download" />
        </button>
        <button className="icon-btn danger" onClick={onDelete} title={t('delete')}>
          <Icon name="trash" />
        </button>
      <button className="icon-btn ed-close" onClick={onBack} title={t('close')}>
          <Icon name="x" />
        </button>
      </header>

      <div className="ed-scroll">
        <div className="ed-page">
          <input
            ref={titleRef}
            className="ed-title"
            value={note.title}
            placeholder={t('titlePlaceholder')}
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setMode('edit')
                taRef.current?.focus()
              }
            }}
          />

          <label className="folder-chip">
            <Icon name="folder" size={15} />
            <select value={note.folder_id || ''} onChange={(e) => onFolder(e.target.value)} title={t('moveFolder')}>
              <option value="">{t('noFolder')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={13} />
          </label>

          {mode === 'edit' ? (
            <div className="ed-wrap">
            <textarea
              ref={taRef}
              className="ed-body"
              value={note.body}
              placeholder={t('bodyPlaceholder')}
              onChange={onInput}
              onKeyDown={onKeyDown}
              onSelect={(e) => {
                selMemo.current = { s: e.target.selectionStart, e: e.target.selectionEnd }
                onCursor?.(e.target.selectionStart)
              }}
              onFocus={() => setFocused(true)}
              onPaste={(e) => {
                const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
                if (fs.length) {
                  e.preventDefault()
                  addImages(fs)
                }
              }}
              onDrop={(e) => {
                const fs = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'))
                if (fs.length) {
                  e.preventDefault()
                  addImages(fs)
                }
              }}
              onBlur={() => {
                setTimeout(() => setPop(null), 150)
                setTimeout(() => setFocused(false), 200)
              }}
              spellCheck
            />
              <div className="peer-carets" aria-hidden="true">
                {carets.map((c) => (
                  <span key={c.id} className="peer-caret" style={{ left: c.x, top: c.y, height: c.h, background: c.color }}>
                    <em style={{ background: c.color }}>{(c.name || '?').split(' ')[0]}</em>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="prose" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html || '<p class="muted">…</p>' }} />
          )}

          {(attached.length > 0 || (mode === 'edit' && legacy.length > 0)) && (
            <div className="ed-images">
              {attached.map((url, i) => (
                <figure key={'a' + i}>
                  <button className="img-open" onClick={() => setLightbox(url)}>
                    <img src={url} alt="" loading="lazy" />
                  </button>
                  <button className="img-x" title={t('delete')} onClick={() => onImages(attached.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </figure>
              ))}
              {mode === 'edit' &&
                legacy.map((im, i) => (
                  <figure key={'l' + i}>
                    <button className="img-open" onClick={() => setLightbox(im.url)}>
                      <img src={im.url} alt="" loading="lazy" />
                    </button>
                    <button
                      className="img-x"
                      title={t('delete')}
                      onClick={() => {
                        expectBody.current = ''
                        onChange({ body: note.body.replace(im.raw, '') })
                      }}
                    >
                      ×
                    </button>
                  </figure>
                ))}
            </div>
          )}

          <footer className="ed-foot">
            <span>{t('words', { n: words })}</span>
          </footer>

          <section className="backlinks">
            <h4>
              <Icon name="link" size={14} /> {t('backlinks')}
            </h4>
            {backlinks.length === 0 ? (
              <p className="muted">{t('noBacklinks')}</p>
            ) : (
              <ul>
                {backlinks.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => onOpenNote(b.id)}>{b.title || t('untitled')}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {touch && focused && mode === 'edit' && (
        <div className="kb-bar" style={{ bottom: kbBottom }} onPointerDown={(e) => e.preventDefault()}>
          {TB.map((b) => (
            <button key={b.k} className={b.cls} title={t(b.k)} onClick={b.run}>
              {b.label}
            </button>
          ))}
          {onUpload && (
            <button title={t('addImage')} onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} />
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
          <button className="lb-x" onClick={() => setLightbox(null)} title={t('close')}>
            ×
          </button>
        </div>
      )}

      {pop && items.length > 0 && mode === 'edit' && (
        <ul className="pop" role="listbox">
          {items.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === idx}>
              <button
                className={i === idx ? 'on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applyItem(it)
                }}
                onMouseEnter={() => setIdx(i)}
              >
                {pop.type === 'slash' ? <code>{it.insert.trim().split('\n')[0] || '·'}</code> : <Icon name="notes" size={14} />}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
