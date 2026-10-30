import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons'
import { useI18n } from './i18n'
import { renderMarkdown, toggleCheckbox, norm } from './lib/md'

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
  onTag,
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
  const html = useMemo(() => (mode === 'preview' ? renderMarkdown(note.body, hasTitle) : ''), [mode, note.body, hasTitle])

  // Cursor position to restore right after the next render (set synchronously,
  // so fast typing can never race with it).
  const selRef = useRef(null)
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
    const tag = e.target.closest('[data-tag]')
    if (tag) return onTag(tag.dataset.tag)
    const cb = e.target.closest('[data-cb]')
    if (cb) onChange({ body: toggleCheckbox(note.body, Number(cb.dataset.cb)) })
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
        <div className="seg">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
            <Icon name="edit" size={15} /> {t('edit')}
          </button>
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>
            <Icon name="eye" size={15} /> {t('preview')}
          </button>
        </div>
        <span className="grow" />
        {folders.length > 0 && (
          <select className="ed-folder" value={note.folder_id || ''} onChange={(e) => onFolder(e.target.value)} title={t('moveFolder')}>
            <option value="">{t('noFolder')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <span className={`save ${saveState}`}>{saveState === 'saving' ? t('saving') : t('saved')}</span>
        <button className={`icon-btn ${note.pinned ? 'active' : ''}`} onClick={onPin} title={note.pinned ? t('unpin') : t('pin')}>
          <Icon name="pin" />
        </button>
        <button className="icon-btn" onClick={exportMd} title={t('export')}>
          <Icon name="download" />
        </button>
        <button className="icon-btn danger" onClick={onDelete} title={t('delete')}>
          <Icon name="trash" />
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

          {mode === 'edit' ? (
            <textarea
              ref={taRef}
              className="ed-body"
              value={note.body}
              placeholder={t('bodyPlaceholder')}
              onChange={onInput}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setPop(null), 150)}
              spellCheck
            />
          ) : (
            <div className="prose" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html || '<p class="muted">…</p>' }} />
          )}

          <footer className="ed-foot">
            <span>{t('words', { n: words })}</span>
            {note.tags?.length > 0 && (
              <span className="chips">
                {note.tags.map((g) => (
                  <button key={g} className="chip" onClick={() => onTag(g)}>
                    #{g}
                  </button>
                ))}
              </span>
            )}
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
