// A fake Supabase for browser tests: signed-in user, one room, in-memory tables.
// Use with a build made with VITE_SUPABASE_URL=https://mock.supabase.test (see tests/cloud.test.cjs).
const MOCK = 'https://mock.supabase.test'
const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'ahmet@example.com', user_metadata: { full_name: 'Ahmet Kula' }, aud: 'authenticated', role: 'authenticated' }

function freshDb() {
  const now = new Date('2026-11-06T12:00:00Z').toISOString()
  return {
    workspaces: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Odam', owner_id: USER.id, invite_code: 'abcdef', short_code: '123456', created_at: now }],
    members: [{ workspace_id: '10000000-0000-4000-8000-000000000001', user_id: USER.id, email: USER.email, name: 'Ahmet Kula', joined_at: now }],
    notes: [],
    folders: [],
    board_columns: [],
    note_versions: [],
  }
}

let seq = 0
const uuid = () => `20000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

function applyFilters(rows, url) {
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'columns', 'on_conflict'].includes(k)) continue
    const [op, ...rest] = v.split('.')
    const val = rest.join('.')
    if (op === 'eq') rows = rows.filter((r) => String(r[k]) === val)
    else if (op === 'lt') rows = rows.filter((r) => r[k] && r[k] < val)
    else if (op === 'is' && val === 'null') rows = rows.filter((r) => r[k] == null)
  }
  return rows
}

async function installCloudMock(context, db = freshDb()) {
  const session = { access_token: 'mock-token', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'mock-refresh', user: USER }
  await context.addInitScript((s) => {
    try {
      localStorage.setItem('sb-mock-auth-token', JSON.stringify(s))
    } catch {}
  }, session)
  await context.route(`${MOCK}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1/user')) return json(USER)
    if (url.pathname.startsWith('/auth/v1/')) return json({})
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop()
      if (fn === 'my_usage') return json(877000)
      return json(null)
    }
    if (url.pathname.startsWith('/storage/')) return json({ Key: 'x' })
    const table = url.pathname.replace('/rest/v1/', '')
    if (!db[table]) return json([])
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    const now = new Date().toISOString()
    if (req.method() === 'GET') {
      const rows = applyFilters(db[table], url)
      return json(single ? rows[0] || null : rows)
    }
    if (req.method() === 'POST') {
      let body = JSON.parse(req.postData() || '[]')
      body = (Array.isArray(body) ? body : [body]).map((r) => ({ id: uuid(), created_at: now, updated_at: now, created_by: USER.id, title: '', body: '', images: [], pinned: false, deleted_at: null, folder_id: null, column_id: null, ...r }))
      db[table].push(...body)
      return json(single ? body[0] : body, 201)
    }
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}')
      const rows = applyFilters(db[table], url)
      for (const r of rows) Object.assign(r, patch, table === 'notes' ? { updated_at: now } : {})
      return json(single ? rows[0] || null : rows)
    }
    if (req.method() === 'DELETE') {
      const rows = new Set(applyFilters(db[table], url))
      db[table] = db[table].filter((r) => !rows.has(r))
      return json([])
    }
    return json({})
  })
  return db
}

module.exports = { installCloudMock, freshDb, MOCK, USER }
