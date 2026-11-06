// Sends push notifications for one job made by the notes_push trigger (supabase/push.sql).
// Needs the VAPID_PRIVATE_KEY environment variable in Vercel (the public key is below).
import webpush from 'web-push'

export const VAPID_PUBLIC = 'BLHmceZO3vBLyN8BhIM73Hi6cnMhAvTL9BYm8YRSBWavGaeZPtJbdyycZnD-HB9cExar60m_hsXEefSzwzlqJDA'
export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const id = req.body?.id
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return res.status(400).json({ ok: false })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!url || !key || !priv) return res.status(500).json({ ok: false, error: 'missing env' })

  const rpc = (fn, args) =>
    fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    }).then((r) => (r.ok ? r.json() : null))

  // give the writer a few seconds, so the notification shows the finished title
  await new Promise((r) => setTimeout(r, 8000))
  const job = await rpc('push_claim', { p_id: id })
  if (!job?.subs?.length) return res.json({ ok: true, sent: 0 })

  webpush.setVapidDetails('https://kovan-notes.vercel.app', VAPID_PUBLIC, priv)
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
