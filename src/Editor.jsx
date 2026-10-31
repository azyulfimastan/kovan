import { pasteYouTube } from './lib/ytitle'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Placeholder } from '@tiptap/extensions'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { Icon } from './icons'
import { useI18n } from './i18n'
import { norm } from './lib/md'
import { baseExtensions, mdToHtml, docToMd } from './lib/rich'

const SLASH = [
  { id: 'h1', icon: 'H1', run: (c) => c.toggleHeading({ level: 1 }) },
  { id: 'h2', icon: 'H2', run: (c) => c.toggleHeading({ level: 2 }) },
  { id: 'h3', icon: 'H3', run: (c) => c.toggleHeading({ level: 3 }) },
  { id: 'todo', icon: '☐', run: (c) => c.toggleTaskList() },
  { id: 'bullet', icon: '•', run: (c) => c.toggleBulletList() },
  { id: 'numbered', icon: '1.', run: (c) => c.toggleOrderedList() },
  { id: 'quote', icon: '❝', run: (c) => c.toggleBlockquote() },
  { id: 'code', icon: '</>', run: (c) => c.toggleCodeBlock() },
  { id: 'divider', icon: '—', run: (c) => c.setHorizontalRule() },
  { id: 'link', icon: '[[', run: (c) => c.insertContent('[[') },
  { id: 'today', icon: '📅', run: (c, lang) => c.insertContent(new Date().toLocaleDateString(lang, { dateStyle: 'long' }) + ' ') },
]

const WL_RE = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g

// [[Note title]] links: highlighted in place, a click opens the note
function wikiLinks(getOpen) {
  return Extension.create({
    name: 'wikiLinks',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('wikiLinks'),
          props: {
            decorations(state) {
              const decos = []
              state.doc.descendants((node, pos) => {
                if (!node.isText) return
                WL_RE.lastIndex = 0
                let m
                while ((m = WL_RE.exec(node.text))) {
                  decos.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'wl', 'data-wl': m[1].trim() }))
                }
              })
              return DecorationSet.create(state.doc, decos)
            },
            handleClick(view, _pos, event) {
              const el = event.target?.closest?.('.wl')
              if (el && view.state.selection.empty) {
                getOpen()?.(el.dataset.wl)
                return true
              }
              return false
            },
          },
        }),
      ]
    },
  })
}

const imageFiles = (list) => [...(list || [])].filter((f) => f.type.startsWith('image/'))

function RichText({ note, live, placeholder, events, onEditor }) {
  const ev = useRef(events)
  ev.current = events
  const last = useRef(note.body)
  const editor = useEditor({
    extensions: [
      ...baseExtensions({ collab: !!live }),
      Placeholder.configure({ placeholder }),
      wikiLinks(() => ev.current.openTitle),
      ...(live
        ? [Collaboration.configure({ fragment: live.fragment }), CollaborationCaret.configure({ provider: { awareness: live.awareness }, user: live.user })]
        : []),
    ],
    content: live ? undefined : mdToHtml(note.body),
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'rich prose', spellcheck: 'true' },
      handleKeyDown: (_v, e) => ev.current.key(e) || false,
      handlePaste: (v, e) => {
        if (pasteYouTube(v, e.clipboardData?.getData('text/plain'))) return true
        const fs = imageFiles(e.clipboardData?.files)
        if (!fs.length) return false
        ev.current.images(fs)
        return true
      },
      handleDrop: (_v, e) => {
        const fs = imageFiles(e.dataTransfer?.files)
        if (!fs.length) return false
        e.preventDefault()
        ev.current.images(fs)
        return true
      },
      handleClick: (_v, _p, e) => {
        const a = e.target?.closest?.('a[href]')
        if (!a || e.button !== 0) return false
        e.preventDefault()
        window.open(a.href, '_blank', 'noopener,noreferrer')
        return true
      },
      handleClickOn: (_v, _p, node) => {
        if (node.type.name !== 'image') return false
        ev.current.zoom(node.attrs.src)
        return true
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      const md = docToMd(ed.getJSON())
      if (md !== last.current) {
        last.current = md
        if (transaction.getMeta(ySyncPluginKey)?.isChangeOrigin) ev.current.remote(md)
        else ev.current.local(md)
      }
      ev.current.selection(ed)
    },
    onSelectionUpdate: ({ editor: ed }) => ev.current.selection(ed),
    onTransaction: ({ editor: ed, transaction }) => {
      if (transaction.storedMarksSet) ev.current.selection(ed)
    },
    onFocus: () => ev.current.focus(true),
    onBlur: () => ev.current.focus(false),
  })
  useEffect(() => {
    onEditor(editor)
    // collaborative undo (Yjs): keep at most 20 steps
    let um, cap
    if (live && editor) {
      try {
        um = yUndoPluginKey.getState(editor.state)?.undoManager
        cap = () => { while (um.undoStack.length > 20) um.undoStack.shift() }
        um?.on('stack-item-added', cap)
      } catch {}
    }
    return () => { onEditor(null); try { um?.off('stack-item-added', cap) } catch {} }
  }, [editor, onEditor])
  return <EditorContent editor={editor} className="ed-rich" />
}

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72]

function sizeOps(editor) {
  const base = Math.round(parseFloat(getComputedStyle(editor.view.dom).fontSize) || 16)
  const st = editor.state
  const sel = st.selection
  // with a bare cursor the size you just picked lives in the stored marks
  const here = sel.empty ? (st.storedMarks || sel.$from.marks()).find((m) => m.type.name === 'fontSize') : null
  const attr = here ? here.attrs.size : editor.getAttributes('fontSize').size
  const cur = Math.round(attr || base)
  const apply = (v) => {
    const n = Math.max(6, Math.min(160, Math.round(Number(v))))
    if (!n) return
    if (n === base) editor.chain().focus().unsetFontSize().run()
    else editor.chain().focus().setFontSize(n).run()
  }
  return {
    cur,
    marked: !!attr,
    apply,
    up: () => apply(SIZES.find((x) => x > cur) || cur + 8),
    down: () => apply([...SIZES].reverse().find((x) => x < cur) || Math.max(6, cur - 2)),
    reset: () => editor.chain().focus().unsetFontSize().run(),
  }
}

// − [size] + control (used in the bottom bar and in the box above a selection)
function SizeCtl({ editor, t, className = '', onHold }) {
  const [txt, setTxt] = useState(null)
  if (!editor || editor.isDestroyed) return null
  const o = sizeOps(editor)
  const keep = (e) => e.preventDefault()
  const commit = (v) => { setTxt(null); o.apply(v) }
  return (
    <div className={`size-ctl ${className}`} onFocus={() => onHold?.(true)} onBlur={() => onHold?.(false)}>
      <button onMouseDown={keep} onClick={o.down} aria-label="−" title={t('sizeSmaller')}>−</button>
      <input
        inputMode="numeric"
        value={txt ?? String(o.cur)}
        onChange={(e) => setTxt(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(txt ?? o.cur) }
          if (e.key === 'Escape') { setTxt(null); editor.commands.focus() }
        }}
        onBlur={() => txt != null && commit(txt)}
        onFocus={(e) => e.target.select()}
      />
      <button onMouseDown={keep} onClick={o.up} aria-label="+" title={t('sizeBigger')}>+</button>
      {o.marked && (
        <button className="rs" onMouseDown={keep} onClick={o.reset} title={t('sizeReset')}>
          ↺
        </button>
      )}
    </div>
  )
}

// Small box above a text selection.
function SizeBox({ editor, show, t }) {
  const [hold, setHold] = useState(false)
  if (!editor || editor.isDestroyed) return null
  const { selection: sel } = editor.state
  if (sel.empty || sel.node || sel.$from.parent.type.name === 'codeBlock' || !(show || hold)) return null
  let c
  try { c = editor.view.coordsAtPos(sel.from) } catch { return null }
  let top = c.top - 52
  if (top < 8) top = editor.view.coordsAtPos(sel.to).bottom + 10
  const left = Math.max(8, Math.min(c.left - 10, window.innerWidth - 190))
  return (
    <div className="size-box" style={{ top, left }}>
      <SizeCtl editor={editor} t={t} onHold={setHold} />
    </div>
  )
}

export default function Editor({
  note,
  notes,
  backlinks,
  saveState,
  cloud,
  live,
  onChange,
  onBodyRemote,
  onPin,
  onDelete,
  onOpenTitle,
  onOpenNote,
  typing = '',
  onUpload,
  onImages,
  boardBack,
  onToggleBoard,
  folders = [],
  onFolder,
  onBack,
  focus = false,
  onFocus,
}) {
  const { t, lang } = useI18n()
  const titleRef = useRef(null)
  const fileRef = useRef(null)
  const [editor, setEditor] = useState(null)
  const [ready, setReady] = useState(!cloud)
  const [pop, setPop] = useState(null)
  const [idx, setIdx] = useState(0)
  const [, setTick] = useState(0)
  const [more, setMore] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [barHold, setBarHold] = useState(false)
  const [kbBottom, setKbBottom] = useState(0)
  const [touch, setTouch] = useState(() => !!window.matchMedia?.('(pointer: coarse), (max-width: 720px)').matches)
  const dismissed = useRef(null)
  const imagesRef = useRef(note.images || [])
  imagesRef.current = note.images || []

  // co-editing: show the note as soon as the shared copy is in sync
  useEffect(() => {
    if (!cloud) return setReady(true)
    setReady(false)
    if (live) live.whenSynced(() => setReady(true))
  }, [cloud, live])

  useEffect(() => {
    if (!note.title && !note.body && titleRef.current) titleRef.current.focus()
  }, [note.id])

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

  useEffect(() => {
    if (!lightbox) return
    const k = (e) => e.key === 'Escape' && setLightbox(null)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [lightbox])

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

  const attached = note.images || []

  // "/" and "[[" menus
  function readPop(ed) {
    setTick((n) => n + 1)
    const { state, view } = ed
    const sel = state.selection
    if (!sel.empty || !ed.isFocused) return setPop(null)
    const $f = sel.$from
    if ($f.parent.type.name === 'codeBlock') return setPop(null)
    const before = $f.parent.textBetween(0, $f.parentOffset, undefined, '￼')
    let m = /\[\[([^\]\n]*)$/.exec(before)
    let p = null
    if (m) p = { type: 'link', query: m[1], from: sel.from - m[0].length, to: sel.from }
    else if ((m = /(?:^|\s)\/([^\s/]*)$/.exec(before))) p = { type: 'slash', query: m[1], from: sel.from - m[1].length - 1, to: sel.from }
    if (!p || dismissed.current === p.type + p.from) return setPop(null)
    const c = view.coordsAtPos(sel.from)
    const old = live$.current.pop
    if (!old || old.from !== p.from || old.query !== p.query) setIdx(0)
    setPop({ ...p, x: c.left, y: c.bottom, top: c.top })
  }

  function applyItem(item) {
    const p = pop
    if (!editor || !p) return
    let c = editor.chain().focus().deleteRange({ from: p.from, to: p.to })
    if (p.type === 'slash') c = item.run(c, lang)
    else c = c.insertContent(`[[${item.title}]] `)
    c.run()
    if (!(p.type === 'slash' && item.id === 'link')) setPop(null)
  }

  const live$ = useRef({})
  live$.current = { pop, items, idx, applyItem }
  function onKey(e) {
    const { pop: p, items: its, idx: i, applyItem: apply } = live$.current
    if (!p || !its.length) return false
    if (e.key === 'ArrowDown') {
      setIdx((x) => (x + 1) % its.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      setIdx((x) => (x - 1 + its.length) % its.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      apply(its[Math.min(i, its.length - 1)])
      return true
    }
    if (e.key === 'Escape') {
      dismissed.current = p.type + p.from
      setPop(null)
      return true
    }
    return false
  }

  async function addImages(files) {
    const imgs = imageFiles(files)
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

  const events = {
    local: (md) => onChange({ body: md }),
    remote: (md) => onBodyRemote?.(md),
    openTitle: onOpenTitle,
    images: addImages,
    zoom: setLightbox,
    key: onKey,
    selection: readPop,
    focus: (f) => {
      if (f) setFocused(true)
      else setTimeout(() => setFocused(false), 150)
      if (!f) setTimeout(() => setPop(null), 150)
    },
  }

  const run = (f) => () => editor && f(editor.chain().focus()).run()
  const TB = [
    { k: 'undo', label: '↶', run: run((c) => c.undo()) },
    { k: 'redo', label: '↷', run: run((c) => c.redo()) },
    { k: 'tbBold', label: 'B', cls: 'b', on: 'bold', run: run((c) => c.toggleBold()) },
    { k: 'tbItalic', label: 'I', cls: 'i', on: 'italic', run: run((c) => c.toggleItalic()) },
    { k: 'tbHeading', label: 'H', on: ['heading', { level: 2 }], run: run((c) => c.toggleHeading({ level: 2 })) },
    { k: 'tbTodo', label: '☐', on: 'taskList', run: run((c) => c.toggleTaskList()) },
    { k: 'tbList', label: '•', on: 'bulletList', run: run((c) => c.toggleBulletList()) },
    { k: 'tbNumber', label: '1.', on: 'orderedList', run: run((c) => c.toggleOrderedList()) },
    { k: 'tbQuote', label: '❝', on: 'blockquote', run: run((c) => c.toggleBlockquote()) },
    { k: 'tbLink', label: '[[ ]]', run: run((c) => c.insertContent('[[')) },
  ]
  const isOn = (b) => editor && b.on && (Array.isArray(b.on) ? editor.isActive(...b.on) : editor.isActive(b.on))

  let popStyle = null
  if (pop && items.length) {
    if (touch) popStyle = { left: 10, right: 10, bottom: kbBottom + (focused ? 64 : 12) }
    else {
      const h = Math.min(340, items.length * 42 + 12)
      const below = pop.y + 8
      popStyle = { left: Math.max(8, Math.min(pop.x - 12, window.innerWidth - 300)), top: below + h > window.innerHeight - 8 ? Math.max(8, pop.top - h - 8) : below }
    }
  }

  const saveLabel = saveState === 'saving' ? t('saving') : saveState === 'offline' ? t('offline') : t('saved')

  return (
    <div className="editor">
      <header className="ed-bar">
        <button className="icon-btn ed-close" onClick={onBack} title={t('close')}>
          <Icon name="x" />
        </button>
        {boardBack && (
          <button className="btn small" onClick={boardBack}>
            ← {t('board')}
          </button>
        )}
        <span className="grow" />
        {typing && <span className="typing">✎ {t('typing', { name: typing })}</span>}
        <span className={`save ${saveState}`} title={saveLabel}>
          {saveLabel}
        </span>
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
        <div className="more-wrap">
          <button className={`icon-btn ${more ? 'active' : ''}`} onClick={() => setMore((v) => !v)} title={t('more')}>
            <Icon name="dots" />
          </button>
          {more && (
            <>
              <div className="menu-scrim" onClick={() => setMore(false)} />
              <div className="more-menu">
                <button
                  onClick={() => {
                    setMore(false)
                    onToggleBoard()
                  }}
                >
                  <Icon name="board" size={16} /> {note.column_id ? t('removeFromBoard') : t('addToBoard')}
                </button>
                <button
                  onClick={() => {
                    setMore(false)
                    exportMd()
                  }}
                >
                  <Icon name="download" size={16} /> {t('export')}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMore(false)
                    onDelete()
                  }}
                >
                  <Icon name="trash" size={16} /> {t('delete')}
                </button>
              </div>
            </>
          )}
        </div>
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
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
          />

          {ready ? (
            <RichText
              key={live ? live.id + ':live' : 'solo'}
              note={note}
              live={live}
              placeholder={t('bodyPlaceholder')}
              events={events}
              onEditor={setEditor}
            />
          ) : (
            <div className="ed-rich">
              <div className="rich prose static" dangerouslySetInnerHTML={{ __html: mdToHtml(note.body) }} />
            </div>
          )}

          {attached.length > 0 && (
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
            </div>
          )}

          {backlinks.length > 0 && (
            <section className="backlinks">
              <h4>
                <Icon name="link" size={14} /> {t('backlinks')}
              </h4>
              <ul>
                {backlinks.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => onOpenNote(b.id)}>{b.title || t('untitled')}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <SizeBox editor={editor} show={focused} t={t} />

      {(touch ? focused || barHold : true) && (
        <div
          className={`kb-bar ${touch ? '' : 'desk'}`}
          style={touch ? { bottom: kbBottom } : undefined}
          onPointerDown={(e) => !e.target.closest('select, input') && e.preventDefault()}
          onFocus={() => setBarHold(true)}
          onBlur={() => setBarHold(false)}
        >
          <div className="kb-row">
            {TB.map((b) => (
              <button key={b.k} className={`${b.cls || ''} ${isOn(b) ? 'on' : ''}`} title={t(b.k)} onClick={b.run}>
                {b.label}
              </button>
            ))}
            {onUpload && (
              <button title={t('addImage')} onClick={() => fileRef.current?.click()}>
                <Icon name="image" size={18} />
              </button>
            )}
          </div>
          <div className="kb-row">
            <SizeCtl editor={editor} t={t} className="in-bar" />
            <label className={`folder-chip ${note.folder_id ? 'set' : ''}`}>
                        <Icon name="folder" size={15} />
                        <select value={note.folder_id || ''} onChange={(e) => onFolder(e.target.value)} title={t('moveFolder')}>
                          <option value="">{note.folder_id ? t('removeFromFolder') : t('pickFolder')}</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevron" size={13} />
                      </label>
          </div>
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

      {popStyle && (
        <ul className="sug" role="listbox" style={popStyle}>
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
                {pop.type === 'slash' ? <code>{it.icon}</code> : <Icon name="notes" size={14} />}
                <span>{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
