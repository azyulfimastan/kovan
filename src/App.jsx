import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloud, store } from './store'
import { I18n, LANGS, detectLang, makeT, useI18n } from './i18n'
import { extractLinks, extractTags, norm, snippet } from './lib/md'
import { HexLogo, Icon } from './icons'
import Editor from './Editor'
import Graph from './Graph'
import Palette from './Palette'
import ShareDialog from './ShareDialog'
import Login from './Login'

const lsGet = (k) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}
const lsDel = (k) => {
  try {
    localStorage.removeItem(k)
  } catch {}
}

function initialTheme() {
  const s = lsGet('kovan.theme')
  if (s === 'light' || s === 'dark') return s
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [lang, setLangState] = useState(detectLang)
  const t = useMemo(() => makeT(lang), [lang])
  const setLang = useCallback((l) => {
    setLangState(l)
    lsSet('kovan.lang', l)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <I18n.Provider value={{ lang, t, setLang }}>
      <Main />
    </I18n.Provider>
  )
}

function when(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
}

function Main() {
  const { t, lang, setLang } = useI18n()
  const tRef = useRef(t)
  tRef.current = t

  const [theme, setTheme] = useState(initialTheme)
  const [user, setUser] = useState(undefined) // undefined = checking, null = signed out
  const userRef = useRef(null)
  userRef.current = user

  const [workspaces, setWorkspaces] = useState([])
  const [wid, setWid] = useState(null)
  const [notes, setNotes] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('notes')
  const [filter, setFilter] = useState({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [mode, setModeState] = useState(() => lsGet('kovan.mode') || 'edit')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('saved')
  const [peers, setPeers] = useState([])
  const [dialog, setDialog] = useState(null) // 'share' | 'newws'
  const [newWsName, setNewWsName] = useState('')
  const [palette, setPalette] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [toast, setToast] = useState('')

  const pending = useRef({})
  const timers = useRef({})
  const dirty = useRef(new Set())
  const welcome = useRef(null)

  const setMode = (m) => {
    setModeState(m)
    lsSet('kovan.mode', m)
  }

  const flash = useCallback((key) => {
    setToast(tRef.current(key))
    setTimeout(() => setToast(''), 2600)
  }, [])

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    lsSet('kovan.theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#14120e' : '#f2a900')
  }, [theme])

  // remember invite link before sign-in
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join')
    if (code) {
      lsSet('kovan.join', code)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // auth
  useEffect(() => {
    let alive = true
    store.getUser().then((u) => alive && setUser((cur) => (cur === undefined ? u : cur)))
    const off = store.onAuth((u) => alive && setUser(u))
    return () => {
      alive = false
      off()
    }
  }, [])

  // saving -------------------------------------------------------------------
  const flush = useCallback(async (id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    const patch = pending.current[id]
    if (!patch) return
    delete pending.current[id]
    try {
      await store.updateNote(id, { ...patch, updated_by: userRef.current?.id })
    } catch {
      flash('error')
    }
    if (!pending.current[id]) dirty.current.delete(id)
    if (dirty.current.size === 0) setSaveState('saved')
  }, [flash])

  const flushAll = useCallback(() => {
    Object.keys(pending.current).forEach((id) => flush(id))
  }, [flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushAll()
    }
    window.addEventListener('pagehide', flushAll)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushAll)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushAll])

  function edit(id, patch, now = false) {
    if ('body' in patch) patch = { ...patch, tags: extractTags(patch.body) }
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n)))
    pending.current[id] = { ...(pending.current[id] || {}), ...patch }
    dirty.current.add(id)
    setSaveState('saving')
    clearTimeout(timers.current[id])
    if (now) flush(id)
    else timers.current[id] = setTimeout(() => flush(id), 700)
  }

  // workspaces ---------------------------------------------------------------
  const bootstrap = useCallback(async () => {
    setLoading(true)
    try {
      let target = null
      const code = lsGet('kovan.join')
      if (code && cloud) {
        lsDel('kovan.join')
        try {
          target = await store.joinWorkspace(code)
          flash('joined')
        } catch {
          flash('joinFailed')
        }
      }
      let list = await store.listWorkspaces()
      if (list.length === 0 || (list[0].local && !list[0].name)) {
        const w = await store.createWorkspace(tRef.current('myNotebook'))
        welcome.current = w.id
        list = list.length === 0 ? [w] : [w]
      }
      setWorkspaces(list)
      const saved = lsGet('kovan.ws')
      const pick = [target, saved].find((id) => id && list.some((w) => w.id === id)) || list[0].id
      setWid(pick)
    } catch {
      flash('error')
    } finally {
      setLoading(false)
    }
  }, [flash])

  useEffect(() => {
    if (user === undefined) return
    if (!user) {
      setWorkspaces([])
      setWid(null)
      setNotes([])
      setActiveId(null)
      return
    }
    bootstrap()
  }, [user?.id, bootstrap])

  // notes for the active workspace ---------------------------------------------
  useEffect(() => {
    if (!wid || !user) return
    let alive = true
    setNotes([])
    setActiveId(null)
    setFilter({ kind: 'all' })
    setQuery('')
    setView('notes')

    store
      .listNotes(wid)
      .then(async (list) => {
        if (!alive) return
        if (list.length === 0 && welcome.current === wid) {
          welcome.current = null
          try {
            const body = tRef.current('welcomeBody')
            const n = await store.createNote(wid, { title: tRef.current('welcomeTitle'), body, tags: extractTags(body) })
            list = [n]
          } catch {}
        }
        if (!alive) return
        setNotes(list)
        lsSet('kovan.ws', wid)
      })
      .catch(() => alive && flash('error'))

    const off = store.subscribe(wid, {
      insert: (row) => setNotes((ns) => (ns.some((n) => n.id === row.id) ? ns : [row, ...ns])),
      update: (row) => setNotes((ns) => ns.map((n) => (n.id !== row.id || dirty.current.has(row.id) ? n : row))),
      remove: (id) => {
        setNotes((ns) => ns.filter((n) => n.id !== id))
        setActiveId((a) => (a === id ? null : a))
      },
    })
    const offP = store.presence(wid, user, setPeers)

    return () => {
      alive = false
      off()
      offP()
      flushAll()
      setPeers([])
    }
  }, [wid, user?.id])

  // derived ------------------------------------------------------------------
  const ws = workspaces.find((w) => w.id === wid)
  const activeNote = notes.find((n) => n.id === activeId) || null

  const titleSet = useMemo(() => new Set(notes.map((n) => norm(n.title)).filter(Boolean)), [notes])
  const hasTitle = useCallback((x) => titleSet.has(norm(x)), [titleSet])

  const tagCounts = useMemo(() => {
    const m = new Map()
    notes.forEach((n) => (n.tags || []).forEach((g) => m.set(g, (m.get(g) || 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  const visible = useMemo(() => {
    const q = norm(query)
    return notes
      .filter((n) => (filter.kind === 'pinned' ? n.pinned : filter.kind === 'tag' ? (n.tags || []).includes(filter.tag) : true))
      .filter((n) => !q || norm(n.title).includes(q) || norm(n.body).includes(q))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.updated_at < b.updated_at ? 1 : -1))
  }, [notes, filter, query])

  const backlinks = useMemo(() => {
    if (!activeNote || !activeNote.title.trim()) return []
    const k = norm(activeNote.title)
    return notes.filter((n) => n.id !== activeNote.id && extractLinks(n.body).some((l) => norm(l) === k))
  }, [notes, activeNote?.id, activeNote?.title])

  // actions ------------------------------------------------------------------
  async function newNote(init = {}) {
    try {
      const body = init.body || ''
      const n = await store.createNote(wid, { title: init.title || '', body, tags: extractTags(body) })
      setNotes((ns) => [n, ...ns.filter((x) => x.id !== n.id)])
      setActiveId(n.id)
      setView('notes')
      setModeState('edit')
      setSideOpen(false)
    } catch {
      flash('error')
    }
  }

  function openNote(id) {
    setActiveId(id)
    setView('notes')
    setSideOpen(false)
  }

  function openTitle(title) {
    const found = notes.find((n) => norm(n.title) === norm(title))
    if (found) openNote(found.id)
    else newNote({ title })
  }

  async function removeNote(id) {
    if (!window.confirm(t('deleteConfirm'))) return
    clearTimeout(timers.current[id])
    delete pending.current[id]
    dirty.current.delete(id)
    try {
      await store.deleteNote(id)
      setNotes((ns) => ns.filter((n) => n.id !== id))
      setActiveId(null)
    } catch {
      flash('error')
    }
  }

  async function createWorkspace(e) {
    e.preventDefault()
    const name = newWsName.trim()
    if (!name) return
    try {
      const w = await store.createWorkspace(name)
      welcome.current = w.id
      setWorkspaces((l) => [...l, w])
      setWid(w.id)
      setDialog(null)
      setNewWsName('')
    } catch {
      flash('error')
    }
  }

  async function signOut() {
    flushAll()
    await store.signOut()
    setUser(null)
  }

  const pickTag = (g) => {
    setFilter({ kind: 'tag', tag: g })
    setView('notes')
    setActiveId(null)
    setSideOpen(false)
  }

  const nextTheme = () => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))

  const commands = [
    { id: 'new', icon: 'plus', label: t('newNote'), run: () => newNote() },
    { id: 'graph', icon: 'graph', label: t('graph'), run: () => setView((v) => (v === 'graph' ? 'notes' : 'graph')) },
    { id: 'theme', icon: theme === 'dark' ? 'sun' : 'moon', label: t('theme'), run: nextTheme },
    ...(cloud ? [{ id: 'share', icon: 'link', label: t('share'), run: () => setDialog('share') }] : []),
    ...LANGS.filter((l) => l.code !== lang).map((l) => ({ id: 'lang-' + l.code, icon: 'globe', label: l.label, run: () => setLang(l.code) })),
  ]

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // render -------------------------------------------------------------------
  if (user === undefined) {
    return (
      <div className="splash">
        <HexLogo size={56} />
      </div>
    )
  }
  if (!user) return <Login />

  const heading = filter.kind === 'pinned' ? t('pinned') : filter.kind === 'tag' ? '#' + filter.tag : t('allNotes')
  const others = peers.filter((p) => p.id !== user.id)

  return (
    <div className={`shell ${activeNote && view === 'notes' ? 'has-note' : ''} ${view === 'graph' ? 'is-graph' : ''} ${sideOpen ? 'side-open' : ''}`}>
      <div className="scrim" onClick={() => setSideOpen(false)} />

      <aside className="side">
        <div className="brand">
          <HexLogo size={26} />
          <span className="logo-text">Kovan</span>
        </div>

        <div className="ws-row">
          <div className="select-wrap">
            <select
              value={wid || ''}
              onChange={(e) => {
                if (e.target.value === '__new') setDialog('newws')
                else setWid(e.target.value)
              }}
              aria-label={t('notebooks')}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
              {cloud && <option value="__new">＋ {t('newNotebook')}</option>}
            </select>
            <Icon name="chevron" size={14} />
          </div>
          {cloud && ws && (
            <button className="icon-btn" onClick={() => setDialog('share')} title={t('share')}>
              <Icon name="users" />
            </button>
          )}
        </div>

        <button className="btn primary wide" onClick={() => newNote()}>
          <Icon name="plus" size={16} /> {t('newNote')}
        </button>
        <button className="search-btn" onClick={() => setPalette(true)}>
          <Icon name="search" size={15} /> <span>{t('search')}</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav className="nav">
          <button
            className={view === 'notes' && filter.kind === 'all' ? 'on' : ''}
            onClick={() => {
              setFilter({ kind: 'all' })
              setView('notes')
              setSideOpen(false)
            }}
          >
            <Icon name="notes" size={16} /> {t('allNotes')} <em>{notes.length}</em>
          </button>
          <button
            className={view === 'notes' && filter.kind === 'pinned' ? 'on' : ''}
            onClick={() => {
              setFilter({ kind: 'pinned' })
              setView('notes')
              setSideOpen(false)
            }}
          >
            <Icon name="pin" size={16} /> {t('pinned')} <em>{notes.filter((n) => n.pinned).length}</em>
          </button>
          <button
            className={view === 'graph' ? 'on' : ''}
            onClick={() => {
              setView('graph')
              setSideOpen(false)
            }}
          >
            <Icon name="graph" size={16} /> {t('graph')}
          </button>
        </nav>

        {tagCounts.length > 0 && (
          <div className="tag-block">
            <h5>{t('tags')}</h5>
            <div className="chips">
              {tagCounts.slice(0, 24).map(([g, c]) => (
                <button key={g} className={`chip ${filter.kind === 'tag' && filter.tag === g ? 'on' : ''}`} onClick={() => pickTag(g)}>
                  #{g} <em>{c}</em>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="side-foot">
          {!cloud && (
            <p className="local-note">
              {t('localMode')} <span>{t('localHint')}</span>
            </p>
          )}
          {cloud && (
            <div className="me">
              {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(user.name || '?').slice(0, 1)}</span>}
              <span className="me-name">{user.name || user.email}</span>
              <button className="icon-btn" onClick={signOut} title={t('signOut')}>
                <Icon name="logout" size={16} />
              </button>
            </div>
          )}
          <div className="foot-row">
            <div className="lang-row small">
              {LANGS.map((l) => (
                <button key={l.code} className={l.code === lang ? 'on' : ''} onClick={() => setLang(l.code)} title={l.label}>
                  {l.short}
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={nextTheme} title={t('theme')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </div>
        </div>
      </aside>

      <section className="list">
        <header className="list-head">
          <button className="icon-btn only-mid" onClick={() => setSideOpen(true)} title={t('menu')}>
            <Icon name="menu" />
          </button>
          <div className="list-title">
            <h2>{heading}</h2>
            <span className="muted">{visible.length}</span>
          </div>
          {others.length > 0 && (
            <div className="peers" title={t('online', { n: String(others.length + 1) })}>
              {others.slice(0, 4).map((p) => (
                <span key={p.id} className="avatar sm" title={p.name}>
                  {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : (p.name || '?').slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          )}
          <button className="icon-btn" onClick={() => newNote()} title={t('newNote')}>
            <Icon name="plus" />
          </button>
        </header>
        <div className="list-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchNotes')} />
        </div>
        <ul className="cards">
          {visible.length === 0 && (
            <li className="empty-list">
              <HexLogo size={40} />
              <strong>{query ? t('noResults') : t('empty')}</strong>
              {!query && <span className="muted">{t('emptyHint')}</span>}
            </li>
          )}
          {visible.map((n) => (
            <li key={n.id}>
              <button className={`card ${n.id === activeId ? 'on' : ''}`} onClick={() => openNote(n.id)}>
                <div className="card-top">
                  <strong>{n.title || t('untitled')}</strong>
                  {n.pinned && <Icon name="pin" size={13} className="pin-ico" />}
                  <span className="card-date">{when(n.updated_at, lang)}</span>
                </div>
                <p>{snippet(n.body) || ' '}</p>
                {(n.tags || []).length > 0 && (
                  <div className="card-tags">
                    {n.tags.slice(0, 3).map((g) => (
                      <span key={g}>#{g}</span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <main className="main">
        {view === 'graph' ? (
          <div className="graph-wrap">
            <header className="ed-bar">
              <button className="icon-btn only-mid" onClick={() => setSideOpen(true)} title={t('menu')}>
                <Icon name="menu" />
              </button>
              <strong className="graph-title">{t('graph')}</strong>
            </header>
            <Graph notes={notes} activeId={activeId} onOpen={openNote} />
          </div>
        ) : activeNote ? (
          <Editor
            key={activeNote.id}
            note={activeNote}
            notes={notes}
            backlinks={backlinks}
            saveState={saveState}
            mode={mode}
            setMode={setMode}
            hasTitle={hasTitle}
            onChange={(patch) => edit(activeNote.id, patch)}
            onPin={() => edit(activeNote.id, { pinned: !activeNote.pinned }, true)}
            onDelete={() => removeNote(activeNote.id)}
            onOpenTitle={openTitle}
            onOpenNote={openNote}
            onTag={pickTag}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="blank">
            <div className="blank-hex">
              <HexLogo size={72} />
            </div>
            <p>{loading ? t('loading') : t('pickNote')}</p>
            {!loading && (
              <button className="btn primary" onClick={() => newNote()}>
                <Icon name="plus" size={16} /> {t('newNote')}
              </button>
            )}
          </div>
        )}
      </main>

      <Palette open={palette} onClose={() => setPalette(false)} notes={notes} commands={commands} onOpenNote={openNote} />

      {dialog === 'share' && ws && (
        <ShareDialog
          ws={ws}
          me={user}
          onClose={() => setDialog(null)}
          onWsChange={(w) => setWorkspaces((l) => l.map((x) => (x.id === w.id ? w : x)))}
          onLeft={() => {
            setDialog(null)
            lsDel('kovan.ws')
            bootstrap()
          }}
        />
      )}

      {dialog === 'newws' && (
        <div className="overlay" onMouseDown={() => setDialog(null)}>
          <form className="dialog small" onMouseDown={(e) => e.stopPropagation()} onSubmit={createWorkspace}>
            <div className="dlg-head">
              <h3>{t('newNotebook')}</h3>
            </div>
            <input autoFocus value={newWsName} onChange={(e) => setNewWsName(e.target.value)} placeholder={t('notebookName')} maxLength={80} />
            <div className="dlg-foot">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                {t('cancel')}
              </button>
              <button className="btn primary" disabled={!newWsName.trim()}>
                {t('create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
