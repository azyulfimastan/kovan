// Push notifications (see supabase/push.sql).
// GET  -> { publicKey }: the app's notification key; made and stored the first time it is asked for.
// POST { id } -> sends the notifications of one job made by the notes_push trigger.
import webpush from 'web-push'

export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false })
  const id = req.body?.id
  if (req.method === 'POST' && !/^[0-9a-f-]{36}$/i.test(id || '')) return res.status(400).json({ ok: false })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ ok: false, error: 'missing env' })

  const rpc = (fn, args = {}) =>
    fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    }).then(async (r) => {
      const t = r.ok ? await r.text() : ''
      return t ? JSON.parse(t) : null // void functions answer 204 with no body
    })

  if (req.method === 'GET') {
    let publicKey = await rpc('push_public_key')
    if (!publicKey) {
      const k = webpush.generateVAPIDKeys()
      await rpc('push_keys_init', { p_public: k.publicKey, p_private: k.privateKey })
      publicKey = await rpc('push_public_key') // whichever pair was stored first
    }
    return publicKey ? res.json({ publicKey }) : res.status(502).json({ ok: false })
  }

  // give the writer a few seconds, so the notification shows the finished title
  await new Promise((r) => setTimeout(r, 8000))
  const job = await rpc('push_claim', { p_id: id })
  if (!job?.subs?.length || !job.vapid_private) return res.json({ ok: true, sent: 0 })

  webpush.setVapidDetails('https://kovan-notes.vercel.app', job.vapid_public, job.vapid_private)
  const msg = JSON.stringify({ title: job.title || 'Kovan', body: job.body || '', w: job.w, n: job.n })
  const gone = []
  let sent = 0
  await Promise.all(
    job.subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, { TTL: 3600 })
        .then(() => sent++)
        .catch((e) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.endpoint)
        }),
    ),
  )
  if (gone.length) await rpc('push_drop', { p_id: id, p_endpoints: gone })
  return res.json({ ok: true, sent, dropped: gone.length })
}
