import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloud, store } from './store'
import { I18n, LANGS, detectLang, makeT, useI18n } from './i18n'
import { extractLinks, norm, snippet } from './lib/md'
import { HexLogo, Icon } from './icons'
import Editor from './Editor'
import Graph from './Graph'
import Palette from './Palette'
import ShareDialog from './ShareDialog'
import Login from './Login'
import { openLive } from './live'
import { shrinkImage } from './lib/img'

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
  const [folders, setFolders] = useState([])
  const [addingFolder, setAddingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [newWsInvite, setNewWsInvite] = useState(true)
  const [user, setUser] = useState(undefined) // undefined = checking, null = signed out
  const userRef = useRef(null)
  userRef.current = user

  const [workspaces, setWorkspaces] = useState([])
  const [wid, setWid] = useState(null)
  const [allNotes, setNotes] = useState([])
  const notes = useMemo(() => allNotes.filter((n) => !n.deleted_at), [allNotes])
  const trash = useMemo(() => allNotes.filter((n) => n.deleted_at).sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1)), [allNotes])
  const [cursors, setCursors] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('notes')
  const [filter, setFilter] = useState({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [mode, setModeState] = useState(() => lsGet('kovan.mode') || 'edit')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('saved')
  const [peers, setPeers] = useState([])
  const [members, setMembers] = useState([])
  const [dialog, setDialog] = useState(null) // 'share' | 'newws'
  const [newWsName, setNewWsName] = useState('')
  const [joinText, setJoinText] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [palette, setPalette] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [sidePinned, setSidePinned] = useState(() => lsGet('kovan.pin') === '1')
  const closeSide = () => !sidePinned && setSideOpen(false)
  const togglePin = () =>
    setSidePinned((p) => {
      lsSet('kovan.pin', p ? '0' : '1')
      return !p
    })
  const [toast, setToast] = useState('')

  const [typing, setTyping] = useState('')
  const typingT = useRef(null)
  const liveRef = useRef(null)
  const notesRef = useRef([])
  const activeIdRef = useRef(null)

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

  notesRef.current = allNotes
  activeIdRef.current = activeId

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    lsSet('kovan.theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1013' : '#f6f4ef')
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
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n)))
    if (liveRef.current?.id === id) liveRef.current.set(patch)
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
    setFolders([])
    setAddingFolder(false)
    setActiveId(null)
    setFilter({ kind: 'all' })
    setQuery('')
    setView('notes')

    store
      .listFolders(wid)
      .then((f) => alive && setFolders(f))
      .catch(() => {})

    store
      .listNotes(wid)
      .then(async (list) => {
        if (!alive) return
        if (list.length === 0 && welcome.current === wid) {
          welcome.current = null
          try {
            const body = tRef.current('welcomeBody')
            const n = await store.createNote(wid, { title: tRef.current('welcomeTitle'), body })
            list = [n]
          } catch {}
        }
        if (!alive) return
        store.purgeTrash?.(wid)?.catch?.(() => {})
        setNotes(list.filter((n) => !(n.deleted_at && Date.now() - new Date(n.deleted_at).getTime() > 30 * 864e5)))
        lsSet('kovan.ws', wid)
      })
      .catch(() => alive && flash('error'))

    const off = store.subscribe(wid, {
      insert: (row) => setNotes((ns) => (ns.some((n) => n.id === row.id) ? ns : [row, ...ns])),
      update: (row) =>
        setNotes((ns) =>
          ns.map((n) => {
            if (n.id !== row.id) return n
            // the open note is kept in sync live; only take non-text fields from the database
            if (liveRef.current?.id === row.id) return { ...row, title: n.title, body: n.body }
            return dirty.current.has(row.id) ? n : row
          }),
        ),
      remove: (id) => {
        setNotes((ns) => ns.filter((n) => n.id !== id))
        setActiveId((a) => (a === id ? null : a))
      },
      folderAdd: (f) => setFolders((l) => (l.some((x) => x.id === f.id) ? l : [...l, { id: f.id, name: f.name }])),
      folderRemove: (id) => {
        setFolders((l) => l.filter((x) => x.id !== id))
        setNotes((ns) => ns.map((n) => (n.folder_id === id ? { ...n, folder_id: null } : n)))
        setFilter((f) => (f.kind === 'folder' && f.id === id ? { kind: 'all' } : f))
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

  // everyone in the room (online ones get a green dot)
  const loadMembers = useCallback(() => {
    if (!cloud || !wid) return
    store.getMembers(wid).then(setMembers).catch(() => {})
  }, [wid])
  useEffect(() => {
    setMembers([])
    loadMembers()
  }, [loadMembers])
  useEffect(() => {
    if (peers.some((p) => !members.some((m) => m.user_id === p.id))) loadMembers()
  }, [peers])

  // live co-editing of the open note ------------------------------------------
  useEffect(() => {
    if (!cloud || !activeId || !user || view !== 'notes') return
    const n = notesRef.current.find((x) => x.id === activeId)
    if (!n) return
    const id = activeId
    const live = openLive(id, user, { title: n.title, body: n.body }, {
      onText: ({ title, body }) =>
        setNotes((ns) => ns.map((x) => (x.id === id && (x.title !== title || x.body !== body) ? { ...x, title, body } : x))),
      onCursors: setCursors,
      onTyping: (name) => {
        setTyping(name || '…')
        clearTimeout(typingT.current)
        typingT.current = setTimeout(() => setTyping(''), 2500)
      },
    })
    liveRef.current = live
    return () => {
      live.destroy()
      if (liveRef.current === live) liveRef.current = null
      setTyping('')
      setCursors([])
    }
  }, [activeId, user?.id, view])

  // derived ------------------------------------------------------------------
  const ws = workspaces.find((w) => w.id === wid)
  const activeNote = notes.find((n) => n.id === activeId) || null

  const titleSet = useMemo(() => new Set(notes.map((n) => norm(n.title)).filter(Boolean)), [notes])
  const hasTitle = useCallback((x) => titleSet.has(norm(x)), [titleSet])

  const visible = useMemo(() => {
    const q = norm(query)
    return notes
      .filter((n) =>
        filter.kind === 'pinned' ? n.pinned : filter.kind === 'folder' ? n.folder_id === filter.id : true,
      )
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
      const folder_id = init.folder_id || (filter.kind === 'folder' ? filter.id : null)
      const n = await store.createNote(wid, { title: init.title || '', body, folder_id })
      setNotes((ns) => [n, ...ns.filter((x) => x.id !== n.id)])
      setActiveId(n.id)
      setView('notes')
      setModeState('edit')
      closeSide()
    } catch {
      flash('error')
    }
  }

  function openNote(id) {
    setActiveId(id)
    setView('notes')
    closeSide()
  }

  function openTitle(title) {
    const found = notes.find((n) => norm(n.title) === norm(title))
    if (found) openNote(found.id)
    else newNote({ title })
  }

  function removeNote(id) {
    setActiveId(null)
    edit(id, { deleted_at: new Date().toISOString() }, true)
    flash('movedToTrash')
  }

  function restoreNote(id) {
    edit(id, { deleted_at: null }, true)
  }

  async function purgeNote(id) {
    try {
      await store.deleteNote(id)
      setNotes((ns) => ns.filter((n) => n.id !== id))
    } catch {
      flash('error')
    }
  }

  async function emptyTrash() {
    if (!window.confirm(t('emptyTrashConfirm'))) return
    for (const n of trash) await purgeNote(n.id)
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
      setNewWsName('')
      setDialog(cloud && newWsInvite ? 'share' : null)
    } catch {
      flash('error')
    }
  }

  async function uploadImage(file) {
    try {
      const blob = await shrinkImage(file, cloud ? 1600 : 900, cloud ? 0.85 : 0.7)
      return await store.uploadImage(wid, blob)
    } catch {
      flash('imageFail')
      return null
    }
  }

  async function joinRoom(e) {
    e.preventDefault()
    const raw = joinText.trim()
    const link = /join=([A-Za-z0-9]+)/.exec(raw)
    const code = link ? link[1] : raw.replace(/\s|-/g, '')
    if (!code) return
    setJoinBusy(true)
    try {
      const id = await store.joinWorkspace(code)
      const list = await store.listWorkspaces()
      setWorkspaces(list)
      setWid(id)
      setDialog(null)
      setJoinText('')
      flash('joined')
    } catch (err) {
      flash(/too many/i.test(err?.message || '') ? 'tooMany' : 'badCode')
    } finally {
      setJoinBusy(false)
    }
  }

  async function addFolder(e) {
    e.preventDefault()
    const name = folderName.trim()
    setAddingFolder(false)
    setFolderName('')
    if (!name) return
    try {
      const f = await store.createFolder(wid, name)
      setFolders((l) => (l.some((x) => x.id === f.id) ? l : [...l, f]))
      setFilter({ kind: 'folder', id: f.id })
      setView('notes')
    } catch {
      flash('error')
    }
  }

  async function removeFolder(f) {
    if (!window.confirm(t('deleteFolderConfirm'))) return
    try {
      await store.deleteFolder(f.id)
      setFolders((l) => l.filter((x) => x.id !== f.id))
      setNotes((ns) => ns.map((n) => (n.folder_id === f.id ? { ...n, folder_id: null } : n)))
      if (filter.kind === 'folder' && filter.id === f.id) setFilter({ kind: 'all' })
    } catch {
      flash('error')
    }
  }

  async function signOut() {
    flushAll()
    await store.signOut()
    setUser(null)
  }

  const nextTheme = () => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))

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

  const heading =
    filter.kind === 'pinned'
      ? t('pinned')
      : filter.kind === 'folder'
        ? folders.find((f) => f.id === filter.id)?.name || t('allNotes')
        : t('allNotes')
  const others = peers.filter((p) => p.id !== user.id)

  return (
    <div className={`shell ${activeNote && view === 'notes' ? 'has-note' : ''} ${view === 'graph' || view === 'trash' ? 'is-graph' : ''} ${sideOpen || sidePinned ? 'side-open' : ''} ${sidePinned ? 'side-pinned' : ''}`}>
      <div className="scrim" onClick={() => closeSide()} />

      <aside className="side">
        <div className="brand">
          <HexLogo size={26} />
          <span className="logo-text">Kovan</span>
          <button className={`icon-btn pin-side ${sidePinned ? 'active' : ''}`} onClick={togglePin} title={t('pinMenu')}>
            <Icon name="pin" size={16} />
          </button>
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

        {cloud && ws && (
          <button className="btn soft wide" onClick={() => setDialog('share')}>
            <Icon name="users" size={16} /> {t('inviteFriends')}
          </button>
        )}
        {cloud && (
          <button className="btn wide" onClick={() => setDialog('join')}>
            <Icon name="plus" size={16} /> {t('joinRoom')}
          </button>
        )}
        {cloud && members.length > 0 && (
          <button className="member-strip" onClick={() => setDialog('share')} title={t('members')}>
            <span className="avs">
              {members.slice(0, 6).map((m) => (
                <span key={m.user_id} className={`avatar sm ${peers.some((p) => p.id === m.user_id) ? 'on' : ''}`} title={m.name || m.email}>
                  {(m.name || m.email || '?').slice(0, 1).toUpperCase()}
                </span>
              ))}
              {members.length > 6 && <span className="avatar sm more">+{members.length - 6}</span>}
            </span>
            <span className="muted">{t('membersOnline', { n: String(members.length), o: String(Math.max(1, peers.length)) })}</span>
          </button>
        )}
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
              closeSide()
            }}
          >
            <Icon name="notes" size={16} /> {t('allNotes')} <em>{notes.length}</em>
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`folder-item sub ${view === 'notes' && filter.kind === 'folder' && filter.id === f.id ? 'on' : ''}`}
              onClick={() => {
                setFilter({ kind: 'folder', id: f.id })
                setView('notes')
                setActiveId(null)
                closeSide()
              }}
            >
              <Icon name="folder" size={15} /> <span className="f-name">{f.name}</span>
              <em>{notes.filter((n) => n.folder_id === f.id).length}</em>
              <span
                className="f-del"
                role="button"
                title={t('delete')}
                onClick={(e) => {
                  e.stopPropagation()
                  removeFolder(f)
                }}
              >
                <Icon name="x" size={14} />
              </span>
            </button>
          ))}
          {addingFolder ? (
            <form onSubmit={addFolder} className="sub">
              <input
                className="folder-input"
                autoFocus
                value={folderName}
                maxLength={60}
                placeholder={t('folderName')}
                onChange={(e) => setFolderName(e.target.value)}
                onBlur={() => !folderName.trim() && setAddingFolder(false)}
                onKeyDown={(e) => e.key === 'Escape' && (setFolderName(''), setAddingFolder(false))}
              />
            </form>
          ) : (
            <button className="sub add-folder" onClick={() => setAddingFolder(true)}>
              <Icon name="plus" size={14} /> {t('newFolder')}
            </button>
          )}
          <button
            className={view === 'notes' && filter.kind === 'pinned' ? 'on' : ''}
            onClick={() => {
              setFilter({ kind: 'pinned' })
              setView('notes')
              closeSide()
            }}
          >
            <Icon name="pin" size={16} /> {t('pinned')} <em>{notes.filter((n) => n.pinned).length}</em>
          </button>
          <button
            className={view === 'graph' ? 'on' : ''}
            onClick={() => {
              setView('graph')
              closeSide()
            }}
          >
            <Icon name="graph" size={16} /> {t('graph')}
          </button>
          <button
            className={view === 'trash' ? 'on' : ''}
            onClick={() => {
              setView('trash')
              setActiveId(null)
              closeSide()
            }}
          >
            <Icon name="trash" size={16} /> {t('trash')} {trash.length > 0 && <em>{trash.length}</em>}
          </button>
        </nav>

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
              </button>
            </li>
          ))}
        </ul>
      </section>

      <main className="main">
        {view === 'trash' ? (
          <div className="trash-wrap">
            <header className="ed-bar">
              <button className="icon-btn only-mid" onClick={() => setSideOpen(true)} title={t('menu')}>
                <Icon name="menu" />
              </button>
              <strong className="graph-title">{t('trash')}</strong>
              <span className="grow" />
              {trash.length > 0 && (
                <button className="btn danger small" onClick={emptyTrash}>
                  {t('emptyTrash')}
                </button>
              )}
            </header>
            <p className="muted trash-hint">{t('trashHint')}</p>
            {trash.length === 0 ? (
              <div className="blank">
                <div className="blank-hex">
                  <HexLogo size={56} />
                </div>
                <p>{t('trashEmpty')}</p>
              </div>
            ) : (
              <ul className="trash-list">
                {trash.map((n) => (
                  <li key={n.id}>
                    <div className="t-info">
                      <strong>{n.title || t('untitled')}</strong>
                      <span className="muted">{snippet(n.body) || ' '}</span>
                    </div>
                    <button className="btn small" onClick={() => restoreNote(n.id)}>
                      {t('restore')}
                    </button>
                    <button
                      className="btn danger small"
                      onClick={() => window.confirm(t('deleteForeverConfirm')) && purgeNote(n.id)}
                    >
                      {t('deleteForever')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : view === 'graph' ? (
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
            typing={typing}
            cursors={cursors}
            onCursor={(i) => liveRef.current?.cursor(i)}
            onUpload={uploadImage}
            onImages={(arr) => edit(activeNote.id, { images: arr }, true)}
            folders={folders}
            onFolder={(id) => edit(activeNote.id, { folder_id: id || null }, true)}
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

      <Palette open={palette} onClose={() => setPalette(false)} notes={notes} onOpenNote={openNote} />

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

      {dialog === 'join' && (
        <div className="overlay" onMouseDown={() => setDialog(null)}>
          <form className="dialog small" onMouseDown={(e) => e.stopPropagation()} onSubmit={joinRoom}>
            <div className="dlg-head">
              <h3>{t('joinRoom')}</h3>
            </div>
            <span className="muted">{t('joinHint')}</span>
            <input
              className="code-input"
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              value={joinText}
              onChange={(e) => setJoinText(e.target.value)}
              placeholder="000 000"
              maxLength={200}
            />
            <div className="dlg-foot">
              <button type="button" className="btn ghost" onClick={() => setDialog(null)}>
                {t('cancel')}
              </button>
              <button className="btn primary" disabled={!joinText.trim() || joinBusy}>
                {t('join')}
              </button>
            </div>
          </form>
        </div>
      )}

      {dialog === 'newws' && (
        <div className="overlay" onMouseDown={() => setDialog(null)}>
          <form className="dialog small" onMouseDown={(e) => e.stopPropagation()} onSubmit={createWorkspace}>
            <div className="dlg-head">
              <h3>{t('newNotebook')}</h3>
            </div>
            <input autoFocus value={newWsName} onChange={(e) => setNewWsName(e.target.value)} placeholder={t('notebookName')} maxLength={80} />
            {cloud && (
              <>
                <label className="check-row">
                  <input type="checkbox" checked={newWsInvite} onChange={(e) => setNewWsInvite(e.target.checked)} />
                  {t('roomWith')}
                </label>
                <span className="muted">{t('roomSoloHint')}</span>
              </>
            )}
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
