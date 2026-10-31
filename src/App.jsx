import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloud, store } from './store'
import { I18n, LANGS, detectLang, makeT, useI18n } from './i18n'
import { extractLinks, norm, snippet } from './lib/md'
import { Bee, HexLogo, Icon } from './icons'
const Editor = lazy(() => import('./Editor'))
import Board from './Board'
import Palette from './Palette'
import ShareDialog from './ShareDialog'
import Login from './Login'

const liveOn = cloud || import.meta.env.VITE_LIVE_LOCAL === '1'
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

const FOLDER_COLORS = ['#3b82d6', '#3fa56a', '#d9822b', '#8a63d2', '#d9534f', '#17a2b8', '#c2478f', '#7a8a2c', '#e0b020', '#5b6ee1', '#2f9e8f', '#8d6e63']
const folderColor = (f) => {
  if (!f) return null
  if (f.color && FOLDER_COLORS.includes(f.color)) return f.color
  let h = 0
  for (const ch of String(f.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FOLDER_COLORS[h % FOLDER_COLORS.length]
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
  const [foldersOpen, setFoldersOpen] = useState(true)
  const [folderMenu, setFolderMenu] = useState(false)
  const [colorMenu, setColorMenu] = useState(false)
  const [moveId, setMoveId] = useState(null)
  const [focusMode, setFocusMode] = useState(false)
  const [ctx, setCtx] = useState(null) // right-click menu {x,y,kind,item}
  const [drag, setDrag] = useState(null) // {id,title,x,y,over}
  const lp = useRef({ t: null, fired: false, x: 0, y: 0 })
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
  const [liveObj, setLiveObj] = useState(null)
  const [liveFailed, setLiveFailed] = useState(false)
  const [columns, setColumns] = useState([])
  const [colsLoaded, setColsLoaded] = useState(false)
  const [boardFrom, setBoardFrom] = useState(false)
  const seedingCols = useRef(false)
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('notes')
  const [filter, setFilter] = useState({ kind: 'all' })
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const [mode, setModeState] = useState('edit')
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
  const [sidePinned, setSidePinned] = useState(() => window.innerWidth > 720 && lsGet('kovan.pin') === '1')
  const closeSide = () => !sidePinned && setSideOpen(false)
  const togglePin = () =>
    setSidePinned((p) => {
      lsSet('kovan.pin', p ? '0' : '1')
      return !p
    })
  const [toast, setToast] = useState('')
  // "install as an app" (Android/desktop prompt, iOS instructions)
  const [installEvt, setInstallEvt] = useState(null)
  const [iosHint, setIosHint] = useState(false)
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const isIOS = typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  useEffect(() => {
    const f = (e) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    const g = () => setInstallEvt(null)
    window.addEventListener('beforeinstallprompt', f)
    window.addEventListener('appinstalled', g)
    return () => {
      window.removeEventListener('beforeinstallprompt', f)
      window.removeEventListener('appinstalled', g)
    }
  }, [])
  async function installApp() {
    if (installEvt) {
      installEvt.prompt()
      try {
        await installEvt.userChoice
      } catch {}
      setInstallEvt(null)
    } else setIosHint(true)
  }

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

  const toastT = useRef(null)
  const flash = useCallback((key, action) => {
    setToast({ text: tRef.current(key), action })
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(''), action ? 5000 : 2600)
  }, [])

  // refresh the old built-in welcome note text once
  useEffect(() => {
    const old = allNotes.find((n) => /checkboxes work in Preview|onay kutuları Önizleme|pola wyboru działają w Podglądzie/.test(n.body || ''))
    if (old) edit(old.id, { body: t('welcomeBody') }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNotes.length])

  notesRef.current = allNotes
  activeIdRef.current = activeId

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    lsSet('kovan.theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1226' : '#f6f4ef')
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
      // keep the change and try again when the connection is back
      pending.current[id] = { ...patch, ...(pending.current[id] || {}) }
      setSaveState('offline')
      clearTimeout(timers.current[id])
      timers.current[id] = setTimeout(() => flushRef.current?.(id), navigator.onLine === false ? 15000 : 5000)
      return
    }
    if (!pending.current[id]) dirty.current.delete(id)
    if (dirty.current.size === 0) setSaveState('saved')
  }, [flash])

  const flushRef = useRef(null)
  flushRef.current = flush
  useEffect(() => {
    const on = () => Object.keys(pending.current).forEach((id) => flushRef.current(id))
    const off = () => setSaveState('offline')
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

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
    setSaveState((s) => (s === 'offline' && navigator.onLine === false ? 'offline' : 'saving'))
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
    setColumns([])
    setColsLoaded(false)
    seedingCols.current = false
    setAddingFolder(false)
    setActiveId(null)
    setFilter({ kind: 'all' })
    setQuery('')
    setView('notes')

    store
      .listFolders(wid)
      .then((list) => {
        if (!alive) return
        // give every folder without a saved color its own, unused color
        const used = new Set(list.filter((f) => FOLDER_COLORS.includes(f.color)).map((f) => f.color))
        const fixed = list.map((f) => {
          if (FOLDER_COLORS.includes(f.color)) return f
          const color = FOLDER_COLORS.find((c) => !used.has(c)) || FOLDER_COLORS[used.size % FOLDER_COLORS.length]
          used.add(color)
          store.updateFolder(f.id, { color }).catch(() => {})
          return { ...f, color }
        })
        setFolders(fixed)
      })
      .catch(() => {})

    store
      .listColumns(wid)
      .then((c) => {
        if (!alive) return
        setColumns(c)
        setColsLoaded(true)
      })
      .catch(() => alive && setColsLoaded(true))

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
      colAdd: (c) => setColumns((l) => (l.some((x) => x.id === c.id) ? l : [...l, { id: c.id, name: c.name, pos: c.pos }].sort((a, b) => a.pos - b.pos))),
      colUpdate: (c) => setColumns((l) => l.map((x) => (x.id === c.id ? { id: c.id, name: c.name, pos: c.pos } : x)).sort((a, b) => a.pos - b.pos)),
      colRemove: (id) => {
        setColumns((l) => l.filter((x) => x.id !== id))
        setNotes((ns) => ns.map((n) => (n.column_id === id ? { ...n, column_id: null } : n)))
      },
      folderAdd: (f) => setFolders((l) => (l.some((x) => x.id === f.id) ? l : [...l, { id: f.id, name: f.name, color: f.color }])),
      folderUpdate: (f) => setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, name: f.name, color: f.color } : x))),
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

  // first time the board opens: create the default lists
  useEffect(() => {
    if (view !== 'board' || !colsLoaded || columns.length > 0 || seedingCols.current || !wid) return
    seedingCols.current = true
    ;(async () => {
      for (const [i, k] of ['colTodo', 'colDoing', 'colDone'].entries()) {
        try {
          const c = await store.createColumn(wid, tRef.current(k), (i + 1) * 1000)
          setColumns((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.pos - b.pos)))
        } catch {}
      }
    })()
  }, [view, colsLoaded, columns.length, wid])

  // warm up the editor in the background so the first note opens instantly
  useEffect(() => {
    if (!user) return
    const go = () => {
      import('./Editor')
      if (liveOn) import('./live')
    }
    const id = window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200)
    return () => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id))
  }, [user?.id])

  // live co-editing of the open note ------------------------------------------
  useEffect(() => {
    if (!liveOn || !activeId || !user || view !== 'notes') return
    const n = notesRef.current.find((x) => x.id === activeId)
    if (!n) return
    const id = activeId
    let live = null
    let gone = false
    import('./live').then(({ openLive }) => {
      if (gone) return
      const cur = notesRef.current.find((x) => x.id === id) || n
      live = openLive(id, user, { title: cur.title, body: cur.body }, {
        onTitle: (title) => setNotes((ns) => ns.map((x) => (x.id === id && x.title !== title ? { ...x, title } : x))),
        onTyping: (name) => {
          setTyping(name || '…')
          clearTimeout(typingT.current)
          typingT.current = setTimeout(() => setTyping(''), 2500)
        },
      })
      liveRef.current = live
      setLiveObj(live)
    }).catch(() => !gone && setLiveFailed(true))
    return () => {
      gone = true
      if (live) {
        live.destroy()
        if (liveRef.current === live) liveRef.current = null
      }
      setLiveObj(null)
      setTyping('')
    }
  }, [activeId, user?.id, view])

  // derived ------------------------------------------------------------------
  const ws = workspaces.find((w) => w.id === wid)
  const activeNote = notes.find((n) => n.id === activeId) || null

  const pageFolder = folders.find((f) => f.id === (activeNote?.folder_id || (filter.kind === 'folder' ? filter.id : null)))
  const pageColor = view === 'notes' || view === 'board' ? folderColor(pageFolder) : null
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
    setBoardFrom(false)
    setActiveId(id)
    setView('notes')
    closeSide()
  }

  function openTitle(title) {
    const found = notes.find((n) => norm(n.title) === norm(title))
    if (found) openNote(found.id)
    else newNote({ title })
  }

  const nextPos = (colId) => Math.max(0, ...notes.filter((n) => n.column_id === colId).map((n) => n.pos || 0)) + 1000

  async function addColumn(name) {
    try {
      const c = await store.createColumn(wid, name, Math.max(0, ...columns.map((x) => x.pos)) + 1000)
      setColumns((l) => (l.some((x) => x.id === c.id) ? l : [...l, c].sort((a, b) => a.pos - b.pos)))
    } catch {
      flash('error')
    }
  }
  function renameColumn(id, name) {
    setColumns((l) => l.map((c) => (c.id === id ? { ...c, name } : c)))
    store.updateColumn(id, { name }).catch(() => flash('error'))
  }
  function moveColumn(id, pos) {
    setColumns((l) => l.map((c) => (c.id === id ? { ...c, pos } : c)).sort((a, b) => a.pos - b.pos))
    store.updateColumn(id, { pos }).catch(() => flash('error'))
  }
  async function deleteColumn(id) {
    if (!window.confirm(t('deleteColumnConfirm'))) return
    try {
      await store.deleteColumn(id)
      setColumns((l) => l.filter((c) => c.id !== id))
      setNotes((ns) => ns.map((n) => (n.column_id === id ? { ...n, column_id: null } : n)))
    } catch {
      flash('error')
    }
  }
  async function addCard(colId, title) {
    try {
      const n = await store.createNote(wid, { title, column_id: colId || null, pos: colId ? nextPos(colId) : 0 })
      setNotes((ns) => [n, ...ns.filter((x) => x.id !== n.id)])
    } catch {
      flash('error')
    }
  }
  function openCard(id) {
    setBoardFrom(true)
    setActiveId(id)
    setView('notes')
    closeSide()
  }
  function setCard(patch) {
    if ('column_id' in patch) patch = { ...patch, pos: patch.column_id ? nextPos(patch.column_id) : 0 }
    edit(activeNote.id, patch, true)
  }

  async function toggleBoard(n) {
    if (n.column_id) return edit(n.id, { column_id: null, pos: 0 }, true)
    let col = columns[0]
    if (!col) {
      try {
        col = await store.createColumn(wid, t('colTodo'), 1000)
        setColumns((l) => (l.some((x) => x.id === col.id) ? l : [...l, col]))
      } catch {
        return flash('error')
      }
    }
    edit(n.id, { column_id: col.id, pos: nextPos(col.id) }, true)
    flash('addedToBoard')
  }

  function removeNote(id) {
    setActiveId(null)
    edit(id, { deleted_at: new Date().toISOString() }, true)
    flash('movedToTrash', { label: tRef.current('undo'), run: () => edit(id, { deleted_at: null }, true) })
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
      const used = new Set(folders.map(folderColor))
      const color = FOLDER_COLORS.find((c) => !used.has(c)) || FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
      const f = await store.createFolder(wid, name, color)
      setFolders((l) => (l.some((x) => x.id === f.id) ? l : [...l, f]))
      setFilter({ kind: 'folder', id: f.id })
      setView('notes')
    } catch {
      flash('error')
    }
  }

  function setFolderColor(f, color) {
    setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, color } : x)))
    store.updateFolder(f.id, { color }).catch(() => flash('error'))
    setColorMenu(false)
  }

  function cycleFolderColor(f) {
    const cur = folderColor(f)
    const next = FOLDER_COLORS[(FOLDER_COLORS.indexOf(cur) + 1) % FOLDER_COLORS.length]
    setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, color: next } : x)))
    store.updateFolder(f.id, { color: next }).catch(() => flash('error'))
  }

  async function removeRoom(w) {
    const owner = w.owner_id === user.id
    if (!window.confirm(t(owner ? 'deleteWsConfirm' : 'leaveConfirm'))) return
    try {
      if (owner) await store.deleteWorkspace(w.id)
      else await store.leaveWorkspace(w.id, user.id)
      lsDel('kovan.ws')
      bootstrap()
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

  // phone gestures: edge-swipe opens the menu / goes back, swipe left closes the menu
  const gest = useRef({})
  gest.current = { sideOpen, sidePinned, hasNote: !!(activeId && view === 'notes'), back: () => (boardFrom ? (setView('board'), setActiveId(null), setBoardFrom(false)) : setActiveId(null)) }
  useEffect(() => {
    let sx = 0, sy = 0, on = false
    const ts = (e) => {
      const t0 = e.touches[0]
      sx = t0.clientX; sy = t0.clientY; on = e.touches.length === 1
    }
    const te = (e) => {
      if (!on || window.innerWidth > 1000) return
      const t0 = e.changedTouches[0]
      const dx = t0.clientX - sx, dy = Math.abs(t0.clientY - sy)
      on = false
      const g = gest.current
      if (dy > 60 || g.sidePinned) return
      if (dx > 70 && sx < 28) (g.hasNote && window.innerWidth <= 720 ? g.back() : setSideOpen(true))
      else if (dx < -70 && g.sideOpen) setSideOpen(false)
    }
    window.addEventListener('touchstart', ts, { passive: true })
    window.addEventListener('touchend', te, { passive: true })
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te) }
  }, [])

  // long-press a card, then drag it onto a folder in the dock (phones)
  function startPress(e, n) {
    lp.current.fired = false
    const mouse = !e.touches
    const pt = (ev) => (ev.touches ? ev.touches[0] : ev)
    const x0 = pt(e).clientX, y0 = pt(e).clientY
    let armed = false, moved = false, over
    const cancelTimer = () => clearTimeout(timer)
    const hit = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-fid]')?.getAttribute('data-fid')
    const onMove = (ev) => {
      const t0 = pt(ev)
      if (!armed) {
        const far = Math.abs(t0.clientX - x0) > 8 || Math.abs(t0.clientY - y0) > 8
        if (far && mouse) arm()
        else if (far) cleanup()
        if (!armed) return
      }
      if (!mouse) ev.preventDefault()
      if (Math.abs(t0.clientX - x0) > 12 || Math.abs(t0.clientY - y0) > 12) moved = true
      over = hit(t0.clientX, t0.clientY)
      setDrag({ id: n.id, title: n.title, x: t0.clientX, y: t0.clientY, over })
    }
    const onEnd = () => {
      if (armed) {
        lp.current.fired = true
        if (over !== undefined && over !== null) edit(n.id, { folder_id: over || null }, true)
        else if (!moved) setMoveId(n.id)
      }
      cleanup()
    }
    const cleanup = () => {
      cancelTimer()
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', cleanup)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      setDrag(null)
    }
    const arm = () => {
      armed = true
      lp.current.fired = true
      if (!mouse) navigator.vibrate?.(15)
      setDrag({ id: n.id, title: n.title, x: x0, y: y0, over: undefined })
    }
    const timer = mouse ? null : setTimeout(arm, 420)
    if (mouse) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onEnd)
    } else {
      window.addEventListener('touchmove', onMove, { passive: false })
      window.addEventListener('touchend', onEnd)
      window.addEventListener('touchcancel', cleanup)
    }
  }

  useEffect(() => {
    if (!focusMode) return
    const k = (e) => e.key === 'Escape' && !document.querySelector('.sug, .overlay, .size-box') && setFocusMode(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [focusMode])

  // render -------------------------------------------------------------------
  if (user === undefined) {
    return (
      <div className="splash">
        <div className="hive">
          <HexLogo size={56} />
          <span className="bee-orbit small">
            <span className="bee-bob">
              <Bee size={26} />
            </span>
          </span>
        </div>
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
    <div className={`shell ${activeNote && view === 'notes' ? 'has-note' : ''} ${view === 'trash' || view === 'board' ? 'is-graph' : ''} ${sideOpen || sidePinned ? 'side-open' : ''} ${sidePinned ? 'side-pinned' : ''} ${pageColor ? 'has-fc' : ''} ${focusMode && activeNote && view === 'notes' ? 'focus-mode' : ''}`} style={pageColor ? { '--fc': pageColor } : undefined}>
      <div className="scrim" onClick={() => closeSide()} />

      {!sidePinned && drag && (
        <div className="dock dragging">
          <span className="dock-hint">{t('dropOnFolder')}</span>
          <button data-fid="" className={`${filter.kind === 'all' ? 'on' : ''} ${drag?.over === '' ? 'over' : ''}`} onClick={() => setFilter({ kind: 'all' })}>
            <Icon name="notes" size={15} /> {t('allNotes')}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              data-fid={f.id}
              className={`${filter.kind === 'folder' && filter.id === f.id ? 'on' : ''} ${drag?.over === f.id ? 'over' : ''}`}
              style={{ '--c': folderColor(f) }}
              onClick={() => setFilter({ kind: 'folder', id: f.id })}
            >
              <span className="f-dot" style={{ background: folderColor(f) }} /> {f.name}
            </button>
          ))}
        </div>
      )}
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>{drag.title || t('untitled')}</div>}
      {!sidePinned && (
        <>
          {view === 'notes' && !activeNote && !drag && (
            <button className="fab" onClick={() => newNote()} aria-label={t('newNote')}>
              <Icon name="plus" size={26} />
            </button>
          )}
          <nav className="tabbar">
            <button className={view === 'notes' ? 'on' : ''} onClick={() => { setView('notes'); setActiveId(null) }}>
              <Icon name="notes" size={22} />
              <span>{t('notesTab')}</span>
            </button>
            <button
              onClick={() => {
                setView('notes')
                setActiveId(null)
                setFilter({ kind: 'all' })
                setTimeout(() => searchRef.current?.focus(), 30)
              }}
            >
              <Icon name="search" size={22} />
              <span>{t('search')}</span>
            </button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => { setView('board'); setActiveId(null) }}>
              <Icon name="board" size={22} />
              <span>{t('board')}</span>
            </button>
            <button onClick={() => setSideOpen(true)}>
              <Icon name="menu" size={22} />
              <span>{t('menu')}</span>
            </button>
          </nav>
        </>
      )}

      <aside className="side">
        <div className="brand">
          <span className="brand-hex">
            <HexLogo size={26} />
            <Bee size={15} className="brand-bee" />
          </span>
          <span className="logo-wrap">
            <span className="logo-text">Kovan</span>
            <small className="credit">created by Ahmet Kula</small>
          </span>
          <button className={`icon-btn pin-side ${sidePinned ? 'active' : ''}`} onClick={togglePin} title={t('pinMenu')}>
            <Icon name="pin" size={16} />
          </button>
        </div>

        <div className="ws-row">
          <div className="select-wrap" onContextMenu={(e) => { if (!cloud || !ws) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'ws', item: ws }) }}>
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
        </div>

        {cloud && (
          <button className="btn soft wide" onClick={() => setDialog(ws ? 'share' : 'join')}>
            <Icon name="users" size={16} /> {t('inviteJoin')}
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
        <button className="btn primary wide side-new" onClick={() => newNote()}>
          <Icon name="plus" size={16} /> {t('newNote')}
        </button>

        <nav className="nav">
          <button
            className={view === 'notes' && filter.kind === 'all' ? 'on' : ''}
            data-fid=""
            onClick={() => {
              const already = view === 'notes' && filter.kind === 'all'
              setFilter({ kind: 'all' })
              setView('notes')
              setActiveId(null)
              if (already) setFoldersOpen((o) => !o)
              else setFoldersOpen(true)
            }}
          >
            <Icon name="notes" size={16} /> {t('allNotes')} <em>{notes.length}</em>
            <Icon name="chevron" size={13} className={`all-chev ${foldersOpen ? 'open' : ''}`} />
          </button>
          {(foldersOpen || drag) && folders.map((f) => (
            <button
              key={f.id}
              data-fid={f.id}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'folder', item: f }) }}
              className={`folder-item sub ${drag?.over === f.id ? 'over' : ''} ${view === 'notes' && filter.kind === 'folder' && filter.id === f.id ? 'on' : ''}`}
              onClick={() => {
                setFilter({ kind: 'folder', id: f.id })
                setView('notes')
                setActiveId(null)
                closeSide()
              }}
            >
              <span
                className="f-dot"
                role="button"
                title={t('folderColor')}
                style={{ background: folderColor(f) }}
                onClick={(e) => {
                  e.stopPropagation()
                  cycleFolderColor(f)
                }}
              />{' '}
              <span className="f-name">{f.name}</span>
              <em>{notes.filter((n) => n.folder_id === f.id).length}</em>
            </button>
          ))}
          {!foldersOpen && !drag && <span className="sub muted fold-hint">{folders.length} {t('folders')}</span>}
          {foldersOpen && (addingFolder ? (
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
          ))}
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
            className={view === 'board' ? 'on' : ''}
            onClick={() => {
              setView('board')
              setActiveId(null)
              closeSide()
            }}
          >
            <Icon name="board" size={16} /> {t('board')}
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
          {!standalone && (installEvt || isIOS) && (
            <button className="install-btn" onClick={installApp}>
              <span className="install-ico">
                <HexLogo size={22} />
              </span>
              <span>
                <strong>{t('installApp')}</strong>
                <small>{t('installSub')}</small>
              </span>
            </button>
          )}
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
            <button className="title-btn" onClick={() => setFolderMenu((v) => !v)}>
              <h2>{heading}</h2>
              <Icon name="chevron" size={18} />
            </button>
            <span className="muted">{visible.length}</span>
            {filter.kind === 'folder' && folders.find((f) => f.id === filter.id) && (
              <>
                <button className="color-btn" onClick={() => setColorMenu((v) => !v)}>
                  <span className="f-dot" style={{ background: folderColor(folders.find((f) => f.id === filter.id)) }} /> {t('pickColor')}
                </button>
                {colorMenu && (
                  <>
                    <div className="menu-scrim" onClick={() => setColorMenu(false)} />
                    <div className="color-menu">
                      {FOLDER_COLORS.map((c) => (
                        <button key={c} style={{ background: c }} aria-label={c} className={folderColor(folders.find((f) => f.id === filter.id)) === c ? 'on' : ''} onClick={() => setFolderColor(folders.find((f) => f.id === filter.id), c)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {folderMenu && (
              <>
                <div className="menu-scrim" onClick={() => setFolderMenu(false)} />
                <div className="folder-menu">
                  {[{ id: null, name: t('allNotes'), kind: 'all' }, ...folders.map((f) => ({ ...f, kind: 'folder' }))].map((f) => (
                    <button
                      key={f.id || 'all'}
                      className={(f.kind === 'all' ? filter.kind === 'all' : filter.kind === 'folder' && filter.id === f.id) ? 'on' : ''}
                      onClick={() => { setFilter(f.kind === 'all' ? { kind: 'all' } : { kind: 'folder', id: f.id }); setView('notes'); setFolderMenu(false) }}
                    >
                      {f.kind === 'folder' ? <span className="f-dot" style={{ background: folderColor(f) }} /> : <Icon name="notes" size={15} />} {f.name}
                    </button>
                  ))}
                  <button className="add" onClick={() => { setFolderMenu(false); setSideOpen(true); setAddingFolder(true) }}>
                    <Icon name="plus" size={14} /> {t('newFolder')}
                  </button>
                </div>
              </>
            )}
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
          <button className="icon-btn top-plus" onClick={() => newNote()} title={t('newNote')}>
            <Icon name="plus" />
          </button>
        </header>
        <div className="list-search">
          <Icon name="search" size={15} />
          <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchNotes')} />
          {query && (
            <button className="clear-q" onClick={() => setQuery('')} aria-label={t('close')}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <ul className="cards">
          {visible.length === 0 && (
            <li className="empty-list">
              <div className="hive">
                <HexLogo size={40} />
                {!query && (
                  <span className="bee-orbit small">
                    <span className="bee-bob">
                      <Bee size={22} />
                    </span>
                  </span>
                )}
              </div>
              <strong>{query ? t('noResults') : t('empty')}</strong>
              {!query && <span className="muted">{t('emptyHint')}</span>}
            </li>
          )}
          {visible.map((n) => (
            <li key={n.id}>
              <button
                className={`card ${n.id === activeId ? 'on' : ''} ${n.folder_id ? 'has-c' : ''}`}
                style={n.folder_id ? { '--c': folderColor(folders.find((f) => f.id === n.folder_id)) } : undefined}
                onClick={() => {
                  if (lp.current.fired) { lp.current.fired = false; return }
                  openNote(n.id)
                }}
                onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, kind: 'note', item: n }) }}
                onTouchStart={(e) => startPress(e, n)}
                onMouseDown={(e) => e.button === 0 && startPress(e, n)}
              >
                <div className="card-top">
                  <strong>{n.title || t('untitled')}</strong>
                  {n.pinned && <Icon name="pin" size={13} className="pin-ico" />}
                  <span className="card-date">{when(n.updated_at, lang)}</span>
                </div>
                {snippet(n.body) && <p>{snippet(n.body)}</p>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <main className="main">
        {view === 'board' ? (
          <Board
            notes={notes}
            columns={columns}
            members={members}
            folderOf={(n) => (n.folder_id ? folderColor(folders.find((f) => f.id === n.folder_id)) : null)}
            onOpen={openCard}
            onMove={(id, patch) => edit(id, patch, true)}
            onAdd={addCard}
            onAddColumn={addColumn}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            onMoveColumn={moveColumn}
            header={
              <header className="ed-bar">
                <button className="icon-btn only-mid" onClick={() => setSideOpen(true)} title={t('menu')}>
                  <Icon name="menu" />
                </button>
                <strong className="graph-title">{t('board')}</strong>
              </header>
            }
          />
        ) : view === 'trash' ? (
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
        ) : activeNote ? (
          <Suspense fallback={<div className="editor" />}>
          <Editor
            key={activeNote.id}
            note={activeNote}
            notes={notes}
            backlinks={backlinks}
            saveState={saveState}
            cloud={liveOn && !liveFailed}
            live={liveObj && liveObj.id === activeNote.id ? liveObj : null}
            onChange={(patch) => edit(activeNote.id, patch)}
            onBodyRemote={(body) => {
              const id = activeNote.id
              setNotes((ns) => ns.map((x) => (x.id === id && x.body !== body ? { ...x, body } : x)))
            }}
            onPin={() => edit(activeNote.id, { pinned: !activeNote.pinned }, true)}
            onDelete={() => removeNote(activeNote.id)}
            onOpenTitle={openTitle}
            onOpenNote={openNote}
            typing={typing}
            onUpload={uploadImage}
            onImages={(arr) => edit(activeNote.id, { images: arr }, true)}
            folders={folders}
            onFolder={(id) => edit(activeNote.id, { folder_id: id || null }, true)}
            onToggleBoard={() => toggleBoard(activeNote)}
            boardBack={boardFrom ? () => { flushAll(); setView('board'); setActiveId(null); setBoardFrom(false) } : null}
            focus={focusMode}
            onFocus={() => setFocusMode((v) => !v)}
            onBack={() => (flushAll(), boardFrom ? (setView('board'), setActiveId(null), setBoardFrom(false)) : setActiveId(null))}
          />
          </Suspense>
        ) : (
          <div className="blank">
            <div className="blank-hex hive">
              <HexLogo size={72} />
              <span className="bee-orbit">
                <span className="bee-bob">
                  <Bee size={30} />
                </span>
              </span>
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
          onJoin={() => setDialog('join')}
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

      {ctx && (
        <>
          <div className="menu-scrim" style={{ zIndex: 119 }} onMouseDown={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null) }} />
          <div className="ctx-menu" style={{ left: Math.min(ctx.x, window.innerWidth - 190), top: Math.min(ctx.y, window.innerHeight - 110) }}>
            {ctx.kind === 'note' && (
              <button onClick={() => { setMoveId(ctx.item.id); setCtx(null) }}>
                <Icon name="folder" size={15} /> {t('moveFolder')}
              </button>
            )}
            <button className="danger" onClick={() => { const c = ctx; setCtx(null); c.kind === 'note' ? removeNote(c.item.id) : c.kind === 'ws' ? removeRoom(c.item) : removeFolder(c.item) }}>
              <Icon name="trash" size={15} /> {ctx.kind === 'ws' ? (ctx.item.owner_id === user.id ? t('deleteWs') : t('leave')) : t('delete')}
            </button>
          </div>
        </>
      )}

      {moveId && (() => {
        const mn = notes.find((n) => n.id === moveId)
        if (!mn) return null
        const pick = (fid) => { edit(mn.id, { folder_id: fid }, true); setMoveId(null) }
        return (
          <div className="overlay" onMouseDown={() => setMoveId(null)}>
            <div className="dialog small move-sheet" onMouseDown={(e) => e.stopPropagation()}>
              <div className="dlg-head">
                <h3>{t('moveFolder')}</h3>
              </div>
              <p className="muted move-title">{mn.title || t('untitled')}</p>
              <button className="btn soft wide sheet-board" onClick={() => { toggleBoard(mn); setMoveId(null) }}>
                <Icon name="board" size={16} /> {mn.column_id ? t('removeFromBoard') : t('addToBoard')}
              </button>
              <div className="move-list">
                <button className={!mn.folder_id ? 'on' : ''} onClick={() => pick(null)}>
                  <Icon name="notes" size={16} /> {t('noFolder')}
                </button>
                {folders.map((f) => (
                  <button key={f.id} className={mn.folder_id === f.id ? 'on' : ''} onClick={() => pick(f.id)}>
                    <span className="f-dot" style={{ background: folderColor(f) }} /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {iosHint && (
        <div className="overlay" onMouseDown={() => setIosHint(false)}>
          <div className="dialog small ios-hint" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>{t('installApp')}</h3>
            </div>
            <ol>
              <li>{t('iosStep1')}</li>
              <li>{t('iosStep2')}</li>
              <li>{t('iosStep3')}</li>
            </ol>
            <button className="btn primary wide" onClick={() => setIosHint(false)}>
              {t('gotIt')}
            </button>
          </div>
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

      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action.run()
                setToast('')
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
