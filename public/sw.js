const V = 'kovan-v4'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(['/', '/favicon.svg', '/icon-192.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

// After a new version loads, drop cached app files that it no longer uses, so old versions
// don't pile up on the phone. Files the new version still needs (also lazily loaded ones,
// found by following references from file to file) are kept, so offline keeps working.
async function prune(html) {
  const c = await caches.open(V)
  const assets = (await c.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'))
  if (assets.length < 30) return
  const name = (r) => new URL(r.url).pathname.split('/').pop()
  const keep = new Set(assets.filter((r) => html.includes(name(r))).map(name))
  if (!keep.size) return
  let grew = true
  while (grew) {
    grew = false
    for (const r of assets) {
      if (!keep.has(name(r)) || !/\.js$/.test(name(r))) continue
      const txt = await (await c.match(r))?.text()
      if (!txt) continue
      for (const o of assets) if (!keep.has(name(o)) && txt.includes(name(o))) (keep.add(name(o)), (grew = true))
    }
  }
  await Promise.all(assets.filter((r) => !keep.has(name(r))).map((r) => c.delete(r)))
}

self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET') return
  const u = new URL(r.url)
  if (u.origin !== location.origin) return // Supabase, fonts: always network
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then((res) => {
          const cp = res.clone()
          e.waitUntil(
            caches.open(V).then((c) => c.put('/', cp.clone())).then(() => cp.text()).then(prune).catch(() => {}),
          )
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }
  e.respondWith(
    caches.match(r).then(
      (hit) =>
        hit ||
        fetch(r).then((res) => {
          if (res.ok && (u.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(u.pathname))) {
            const cp = res.clone()
            caches.open(V).then((c) => c.put(r, cp))
          }
          return res
        }),
    ),
  )
})
