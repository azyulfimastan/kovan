import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// When Supabase is not configured the app runs in "local mode":
// one private notebook stored in this browser. Everything else is identical.
export const cloud = Boolean(url && key)

const sb = cloud
  ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null

const WS_COLS = 'id,name,invite_code,short_code,owner_id'

function mapUser(u) {
  if (!u) return null
  const m = u.user_metadata || {}
  return {
    id: u.id,
    email: u.email || '',
    name: m.full_name || m.name || u.email || '',
    avatar: m.avatar_url || m.picture || '',
  }
}

const ok = ({ data, error }) => {
  if (error) throw error
  return data
}

export const cloudStore = {
  async getUser() {
    const { data } = await sb.auth.getSession()
    return mapUser(data.session?.user)
  },
  onAuth(cb) {
    const { data } = sb.auth.onAuthStateChange((_e, s) => cb(mapUser(s?.user)))
    return () => data.subscription.unsubscribe()
  },
  async signIn() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw error
  },
  async signOut() {
    await sb.auth.signOut()
  },

  async listWorkspaces() {
    return ok(await sb.from('workspaces').select(WS_COLS).order('created_at'))
  },
  async createWorkspace(name) {
    return ok(await sb.from('workspaces').insert({ name }).select(WS_COLS).single())
  },
  async joinWorkspace(code) {
    const id = ok(await sb.rpc('join_workspace', { code }))
    if (!id) throw new Error('invalid')
    return id
  },
  async getWorkspace(id) {
    return ok(await sb.from('workspaces').select(WS_COLS).eq('id', id).single())
  },
  async rotateInvite(id) {
    return ok(await sb.rpc('rotate_invite', { ws: id }))
  },
  async getMembers(id) {
    return ok(await sb.from('members').select('user_id,email,name').eq('workspace_id', id).order('joined_at'))
  },
  async leaveWorkspace(id, uid) {
    ok(await sb.from('members').delete().eq('workspace_id', id).eq('user_id', uid))
  },
  async deleteWorkspace(id) {
    ok(await sb.from('workspaces').delete().eq('id', id))
  },

  async listFolders(wid) {
    const { data, error } = await sb.from('folders').select('id,name').eq('workspace_id', wid).order('created_at')
    return error ? [] : data // folders table not installed yet -> no folders
  },
  async createFolder(wid, name) {
    return ok(await sb.from('folders').insert({ workspace_id: wid, name }).select('id,name').single())
  },
  async deleteFolder(id) {
    ok(await sb.from('folders').delete().eq('id', id))
  },

  async listColumns(wid) {
    const { data, error } = await sb.from('board_columns').select('id,name,pos').eq('workspace_id', wid).order('pos')
    return error ? [] : data
  },
  async createColumn(wid, name, pos) {
    return ok(await sb.from('board_columns').insert({ workspace_id: wid, name, pos }).select('id,name,pos').single())
  },
  async updateColumn(id, patch) {
    ok(await sb.from('board_columns').update(patch).eq('id', id))
  },
  async deleteColumn(id) {
    ok(await sb.from('board_columns').delete().eq('id', id))
  },

  async listNotes(wid) {
    return ok(await sb.from('notes').select('*').eq('workspace_id', wid).order('updated_at', { ascending: false }))
  },
  async createNote(wid, n) {
    return ok(
      await sb
        .from('notes')
        .insert({ workspace_id: wid, title: n.title || '', body: n.body || '', tags: n.tags || [], ...(n.folder_id ? { folder_id: n.folder_id } : {}), ...(n.column_id ? { column_id: n.column_id, pos: n.pos || 0 } : {}) })
        .select('*')
        .single(),
    )
  },
  async updateNote(id, patch) {
    ok(await sb.from('notes').update(patch).eq('id', id))
  },
  async deleteNote(id) {
    ok(await sb.from('notes').delete().eq('id', id))
  },
  async purgeTrash(wid) {
    const old = new Date(Date.now() - 30 * 864e5).toISOString()
    await sb.from('notes').delete().eq('workspace_id', wid).lt('deleted_at', old)
  },

  subscribe(wid, h) {
    const f = `workspace_id=eq.${wid}`
    const ch = sb
      .channel('notes:' + wid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes', filter: f }, (p) => h.insert(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes', filter: f }, (p) => h.update(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, (p) => h.remove(p.old.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_columns', filter: f }, (p) => h.colAdd?.(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_columns', filter: f }, (p) => h.colUpdate?.(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_columns' }, (p) => h.colRemove?.(p.old.id))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'folders', filter: f }, (p) => h.folderAdd?.(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'folders' }, (p) => h.folderRemove?.(p.old.id))
      .subscribe()
    return () => {
      sb.removeChannel(ch)
    }
  },
  liveChannel(noteId, handlers) {
    const ch = sb.channel('live:' + noteId, { config: { broadcast: { self: false } } })
    for (const ev of Object.keys(handlers)) ch.on('broadcast', { event: ev }, (m) => handlers[ev](m.payload))
    let ok = false
    const waiting = []
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ok = true
        waiting.splice(0).forEach((f) => f())
      }
    })
    return {
      send: (event, payload) => ok && ch.send({ type: 'broadcast', event, payload }),
      ready: (f) => (ok ? f() : waiting.push(f)),
      close: () => sb.removeChannel(ch),
    }
  },
  async uploadImage(wid, file) {
    const path = `${wid}/${crypto.randomUUID()}.${file.type === 'image/gif' ? 'gif' : 'jpg'}`
    const { error } = await sb.storage.from('note-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' })
    if (error) throw error
    return sb.storage.from('note-images').getPublicUrl(path).data.publicUrl
  },
  presence(wid, user, cb) {
    const ch = sb.channel('presence:' + wid, { config: { presence: { key: user.id } } })
    ch.on('presence', { event: 'sync' }, () => {
      const s = ch.presenceState()
      cb(
        Object.entries(s).map(([id, metas]) => ({
          id,
          name: metas[0]?.name || '',
          avatar: metas[0]?.avatar || '',
        })),
      )
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ name: user.name, avatar: user.avatar })
    })
    return () => {
      sb.removeChannel(ch)
    }
  },
}

// ---------------------------------------------------------------------------
// Local mode
// ---------------------------------------------------------------------------
const LS = 'kovan.local.v1'

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LS))
    if (d && Array.isArray(d.notes)) return d
  } catch {}
  return { notes: [] }
}
function save(d) {
  try {
    localStorage.setItem(LS, JSON.stringify(d))
  } catch {}
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

export const localStore = {
  async getUser() {
    return { id: 'local', email: '', name: '', avatar: '' }
  },
  onAuth() {
    return () => {}
  },
  async signIn() {},
  async signOut() {},

  async listWorkspaces() {
    const d = load()
    return [{ id: 'local', name: d.name || '', invite_code: null, owner_id: 'local', local: true }]
  },
  async createWorkspace(name) {
    const d = load()
    d.name = name
    save(d)
    return { id: 'local', name, invite_code: null, owner_id: 'local', local: true }
  },
  async joinWorkspace() {
    throw new Error('local')
  },
  async rotateInvite() {
    return null
  },
  async getMembers() {
    return []
  },
  async getWorkspace() {
    return null
  },
  async leaveWorkspace() {},
  async deleteWorkspace() {},

  async listFolders() {
    return load().folders || []
  },
  async createFolder(wid, name) {
    const d = load()
    const f = { id: uid(), name }
    d.folders = [...(d.folders || []), f]
    save(d)
    return f
  },
  async listColumns() {
    return (load().columns || []).slice().sort((a, b) => a.pos - b.pos)
  },
  async createColumn(wid, name, pos) {
    const d = load()
    const c = { id: uid(), name, pos }
    d.columns = [...(d.columns || []), c]
    save(d)
    return c
  },
  async updateColumn(id, patch) {
    const d = load()
    d.columns = (d.columns || []).map((c) => (c.id === id ? { ...c, ...patch } : c))
    save(d)
  },
  async deleteColumn(id) {
    const d = load()
    d.columns = (d.columns || []).filter((c) => c.id !== id)
    d.notes = d.notes.map((n) => (n.column_id === id ? { ...n, column_id: null } : n))
    save(d)
  },
  async deleteFolder(id) {
    const d = load()
    d.folders = (d.folders || []).filter((f) => f.id !== id)
    d.notes = d.notes.map((n) => (n.folder_id === id ? { ...n, folder_id: null } : n))
    save(d)
  },

  async listNotes() {
    return load().notes.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  },
  async createNote(wid, n) {
    const d = load()
    const now = new Date().toISOString()
    const note = {
      id: uid(),
      workspace_id: 'local',
      title: n.title || '',
      body: n.body || '',
      tags: n.tags || [],
      pinned: false,
      folder_id: n.folder_id || null,
      column_id: n.column_id || null,
      pos: n.pos || 0,
      created_at: now,
      updated_at: now,
    }
    d.notes.push(note)
    save(d)
    return note
  },
  async updateNote(id, patch) {
    const d = load()
    const i = d.notes.findIndex((x) => x.id === id)
    if (i >= 0) {
      d.notes[i] = { ...d.notes[i], ...patch, updated_at: new Date().toISOString() }
      save(d)
    }
  },
  async deleteNote(id) {
    const d = load()
    d.notes = d.notes.filter((x) => x.id !== id)
    save(d)
  },
  async purgeTrash() {
    const d = load()
    const old = Date.now() - 30 * 864e5
    d.notes = d.notes.filter((x) => !(x.deleted_at && new Date(x.deleted_at).getTime() < old))
    save(d)
  },
  subscribe() {
    return () => {}
  },
  presence() {
    return () => {}
  },
  liveChannel() {
    return { send() {}, ready() {}, close() {} }
  },
  async uploadImage(wid, file) {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.onerror = rej
      r.readAsDataURL(file)
    })
  },
}

export const store = cloud ? cloudStore : localStore
