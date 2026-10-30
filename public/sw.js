const V = 'kovan-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(['/', '/favicon.svg', '/icon-192.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})
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
          caches.open(V).then((c) => c.put('/', cp))
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
